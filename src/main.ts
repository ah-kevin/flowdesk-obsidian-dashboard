import {
  App,
  ItemView,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import * as path from "path";
import { promisify } from "util";
import {
  collectObservedTaskPaths,
  isCurrentSnapshotRequest,
  isTaskPath,
  resolveDetailsOpen,
  resolveDashboardContext,
  TrailingRefreshScheduler,
  type DashboardContext,
  type SnapshotRequestIdentity,
} from "./dashboard-state";
import {
  buildSnapshotInvocation,
  formatShellCommand,
  type SnapshotFormat,
  type SnapshotInvocation,
} from "./snapshot-invocation";
import {
  formatEvidenceSummary,
  getEvidenceDisplayState,
} from "./evidence-presentation";
import {
  createDashboardViewModel,
  formatChildEvidenceHealth,
  formatNextAction,
  resolveDiagnosticTarget,
  validateSnapshotSource,
  type DashboardChildViewModel,
  type DashboardViewModel,
  type EvidenceHealth,
  type ExecutionSnapshot,
  type SnapshotDiagnostic,
} from "./snapshot-model";

export const FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";

const execFileAsync = promisify(execFile);
const MAX_SNAPSHOT_BUFFER = 8 * 1024 * 1024;

interface FlowDeskDashboardSettings {
  flowdeskRoot: string;
  workingDirectory: string;
  apiUrl: string;
}

const DEFAULT_SETTINGS: FlowDeskDashboardSettings = {
  flowdeskRoot: "",
  workingDirectory: "",
  apiUrl: "",
};

interface ExecFileFailure extends Error {
  code?: number | string;
  stderr?: string;
  stdout?: string;
}

interface SnapshotDisplayState {
  taskPath: string;
  snapshot: ExecutionSnapshot;
  loadedAt: string;
  staleReason: string;
}

export default class FlowDeskDashboardPlugin extends Plugin {
  settings!: FlowDeskDashboardSettings;

  async onload() {
    await this.loadSettings();
    this.registerView(
      FLOWDESK_DASHBOARD_VIEW_TYPE,
      (leaf) => new FlowDeskDashboardView(leaf, this)
    );
    this.addRibbonIcon("layout-dashboard", "FlowDesk Dashboard", () => {
      void this.refreshDashboard();
    });
    this.addCommand({
      id: "show-current-task-dashboard",
      name: "显示当前 TaskNotes 任务",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = this.isTaskFile(file);
        if (checking) return canRun;
        if (!file || !canRun) {
          new Notice("请先打开一个 Tasks/*.md 任务文件。");
          return false;
        }
        void this.refreshDashboard();
        return true;
      },
    });
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        void this.getDashboardView()?.syncToActiveFile(file);
      })
    );
    this.app.workspace.onLayoutReady(() => {
      void this.getDashboardView()?.syncToActiveFile();
    });
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        const view = this.getDashboardView();
        if (view && file instanceof TFile && view.observesTaskFile(file.path)) {
          view.scheduleRefresh();
        }
      })
    );
    this.addSettingTab(new FlowDeskDashboardSettingTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE);
  }

  async refreshDashboard(fallbackTaskPath = "") {
    const file = this.app.workspace.getActiveFile();
    const taskPath = this.isTaskFile(file) ? file.path : fallbackTaskPath;
    if (!taskPath) {
      new Notice("请先打开一个 Tasks/*.md 任务文件。");
      return;
    }
    await this.activateDashboard(taskPath);
  }

  async activateDashboard(taskPath: string) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({
        type: FLOWDESK_DASHBOARD_VIEW_TYPE,
        active: true,
      });
    }
    if (leaf.view instanceof FlowDeskDashboardView) {
      await leaf.view.loadTask(taskPath);
    }
    workspace.revealLeaf(leaf);
  }

  async loadSnapshot(taskPath: string): Promise<ExecutionSnapshot> {
    const invocation = this.createSnapshotInvocation(taskPath, "json");
    let stdout: string;
    try {
      const result = await execFileAsync(invocation.executable, invocation.args, {
        cwd: invocation.cwd,
        maxBuffer: MAX_SNAPSHOT_BUFFER,
      });
      stdout = result.stdout;
    } catch (error) {
      throw new Error(formatSnapshotCommandError(error));
    }
    try {
      return JSON.parse(stdout) as ExecutionSnapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Snapshot JSON 解析失败：${message}`);
    }
  }

  createSnapshotInvocation(taskPath: string, format: SnapshotFormat): SnapshotInvocation {
    const flowdeskRoot = this.resolveFlowDeskRoot();
    const workingDirectory =
      expandHomePath(this.settings.workingDirectory.trim()) || flowdeskRoot;
    return buildSnapshotInvocation(
      {
        flowdeskRoot,
        taskPath,
        workingDirectory,
        apiUrl: this.settings.apiUrl.trim(),
      },
      format
    );
  }

  async copyDashboardCommand(taskPath: string): Promise<void> {
    await navigator.clipboard.writeText(
      formatShellCommand(this.createSnapshotInvocation(taskPath, "dashboard"))
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  isTaskFile(file: TFile | null): file is TFile {
    return Boolean(file && file.extension === "md" && isTaskPath(file.path));
  }

  private getDashboardView(): FlowDeskDashboardView | null {
    const leaf = this.app.workspace.getLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE)[0];
    return leaf?.view instanceof FlowDeskDashboardView ? leaf.view : null;
  }

  private resolveFlowDeskRoot(): string {
    const candidates = [
      expandHomePath(this.settings.flowdeskRoot.trim()),
      expandHomePath(process.env.FLOWDESK_PLUGIN_ROOT || ""),
      path.resolve(__dirname, "..", ".."),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (existsSync(path.join(candidate, "bin", "flowdesk-execution-snapshot"))) {
        return candidate;
      }
    }
    throw new Error("未找到 FlowDesk 仓库路径，请在插件设置里配置 FlowDesk repo path。");
  }
}

class FlowDeskDashboardView extends ItemView {
  private context: DashboardContext = { kind: "empty" };
  private previousTaskPath = "";
  private selectionRevision = 0;
  private displayState: SnapshotDisplayState | null = null;
  private error = "";
  private loading = false;
  private queuedRequest: SnapshotRequestIdentity | null = null;
  private refreshPromise: Promise<void> | null = null;
  private refreshScheduler: TrailingRefreshScheduler;
  private detailsOpen = false;
  private detailsOpenInitialized = false;

  constructor(leaf: WorkspaceLeaf, private plugin: FlowDeskDashboardPlugin) {
    super(leaf);
    this.refreshScheduler = new TrailingRefreshScheduler(() => {
      void this.loadCurrentTask();
    });
  }

  getViewType() {
    return FLOWDESK_DASHBOARD_VIEW_TYPE;
  }

  getDisplayText() {
    return "FlowDesk Dashboard";
  }

  getIcon() {
    return "layout-dashboard";
  }

  async onOpen() {
    await this.syncToActiveFile();
  }

  async onClose() {
    this.refreshScheduler.cancel();
  }

  async syncToActiveFile(file: TFile | null = this.app.workspace.getActiveFile()) {
    const nextContext = resolveDashboardContext(file?.path ?? null, this.previousTaskPath);
    if (nextContext.kind === "task") {
      if (
        this.context.kind === "task" &&
        this.context.taskPath === nextContext.taskPath
      ) {
        if (!this.displayState && !this.loading) {
          await this.loadTask(nextContext.taskPath);
        }
        return;
      }
      await this.loadTask(nextContext.taskPath);
      return;
    }
    this.selectionRevision += 1;
    this.context = nextContext;
    this.displayState = null;
    this.queuedRequest = null;
    this.refreshScheduler.cancel();
    this.loading = false;
    this.error = "";
    this.render();
  }

  async loadTask(taskPath: string) {
    const sameTask = this.context.kind === "task" && this.context.taskPath === taskPath;
    if (!sameTask) {
      const taskChanged = Boolean(this.previousTaskPath && this.previousTaskPath !== taskPath);
      this.selectionRevision += 1;
      this.context = { kind: "task", taskPath };
      this.previousTaskPath = taskPath;
      this.displayState = null;
      this.error = "";
      this.loading = true;
      this.refreshScheduler.cancel();
      if (taskChanged) {
        this.detailsOpen = false;
        this.detailsOpenInitialized = false;
      }
      this.render();
    }
    this.queuedRequest = { taskPath, selectionRevision: this.selectionRevision };
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.drainRefreshQueue();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async refreshCurrentTask() {
    this.refreshScheduler.cancel();
    await this.loadCurrentTask();
  }

  scheduleRefresh() {
    this.refreshScheduler.schedule();
  }

  observesTaskFile(filePath: string): boolean {
    return this.context.kind === "task"
      ? collectObservedTaskPaths(this.context.taskPath, this.displayState?.snapshot).has(filePath)
      : false;
  }

  private async loadCurrentTask() {
    if (this.context.kind === "task") await this.loadTask(this.context.taskPath);
  }

  private async drainRefreshQueue() {
    while (this.queuedRequest) {
      const request = this.queuedRequest;
      this.queuedRequest = null;
      await this.loadTaskNow(request);
    }
  }

  private async loadTaskNow(request: SnapshotRequestIdentity) {
    this.loading = true;
    this.error = "";
    this.render();
    try {
      const snapshot = await this.plugin.loadSnapshot(request.taskPath);
      if (!isCurrentSnapshotRequest(request, this.context, this.selectionRevision)) return;
      if (snapshot.snapshot_schema_version !== 3) {
        throw new Error("unsupported_snapshot_schema：Dashboard 只支持 snapshot schema 3。");
      }
      const sourceIdentity = validateSnapshotSource(snapshot, request.taskPath);
      if (sourceIdentity !== true) {
        throw new Error(
          `Snapshot source identity 不匹配：请求 ${request.taskPath}，返回 ${snapshot.source_task_id ?? "未提供"}。`
        );
      }
      this.displayState = {
        taskPath: request.taskPath,
        snapshot,
        loadedAt: formatTime(new Date()),
        staleReason: "",
      };
    } catch (error) {
      if (!isCurrentSnapshotRequest(request, this.context, this.selectionRevision)) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.displayState =
        this.displayState?.taskPath === request.taskPath
          ? { ...this.displayState, staleReason: this.error }
          : null;
    } finally {
      if (isCurrentSnapshotRequest(request, this.context, this.selectionRevision)) {
        this.loading = false;
        this.render();
      }
    }
  }

  private render() {
    const container = this.contentEl;
    container.empty();
    container.addClass("flowdesk-dashboard");
    this.renderHeader(container);
    if (this.context.kind === "non-task") {
      this.renderNonTaskState(container, this.context);
      return;
    }
    if (this.context.kind === "empty") {
      container.createDiv({ cls: "flowdesk-empty", text: "当前不是 TaskNotes 任务，FlowDesk Dashboard 不可用。" });
      return;
    }
    const taskPath = this.context.taskPath;
    const displayState = this.displayState?.taskPath === taskPath ? this.displayState : null;
    const snapshot = displayState?.snapshot;
    if (this.loading && !snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "正在首次读取 snapshot v3..." });
      return;
    }
    if (this.error && !snapshot) {
      container.createDiv({ cls: "flowdesk-error", text: this.error });
      return;
    }
    if (!snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "尚未读取 snapshot。" });
      return;
    }
    const model = createDashboardViewModel(snapshot, {
      expectedTaskPath: taskPath,
      loadedAt: displayState?.loadedAt,
      staleReason: displayState?.staleReason,
    });
    if (model.errorCode) {
      container.createDiv({ cls: "flowdesk-error", text: "Dashboard 只支持 snapshot schema 3。" });
      return;
    }
    this.renderTrustStrip(container, model);
    this.renderRootHero(container, model);
    this.renderPrimaryDiagnostic(container, model);
    this.renderNextAction(container, model);
    this.renderChildren(container, model.children);
    this.renderDetails(container, model);
  }

  private renderHeader(container: HTMLElement) {
    const header = container.createDiv({ cls: "flowdesk-dashboard-header" });
    const title = header.createDiv();
    title.createDiv({ cls: "flowdesk-dashboard-title", text: "FlowDesk SDD v3 Dashboard" });
    title.createDiv({
      cls: "flowdesk-dashboard-path",
      text:
        this.context.kind === "task"
          ? this.context.taskPath
          : this.context.kind === "non-task"
            ? this.context.activePath
            : "未选择任务",
    });
    const toolbar = header.createDiv({ cls: "flowdesk-dashboard-toolbar" });
    if (this.context.kind !== "task") return;
    const taskPath = this.context.taskPath;
    const copy = toolbar.createEl("button", { text: "复制 CLI" });
    copy.addEventListener("click", async () => {
      try {
        await this.plugin.copyDashboardCommand(taskPath);
        new Notice("CLI 命令已复制");
      } catch (error) {
        new Notice(`无法复制 CLI 命令：${String(error)}`);
      }
    });
    const refresh = toolbar.createEl("button", { text: this.loading ? "刷新中" : "刷新" });
    refresh.disabled = this.loading;
    refresh.addEventListener("click", () => void this.refreshCurrentTask());
  }

  private renderNonTaskState(
    container: HTMLElement,
    context: Extract<DashboardContext, { kind: "non-task" }>
  ) {
    const card = container.createDiv({ cls: "flowdesk-context-pause" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "Dashboard 不可用" });
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: "当前不是 TaskNotes 任务，FlowDesk Dashboard 不可用。",
    });
    card.createDiv({ cls: "flowdesk-subline", text: `当前文件：${context.activePath}` });
    if (context.previousTaskPath) {
      const back = card.createEl("button", { text: "回到上一次任务" });
      back.addEventListener("click", () => void this.openTask(context.previousTaskPath));
    }
  }

  private renderTrustStrip(container: HTMLElement, model: DashboardViewModel) {
    const state = model.observation.isStale ? "stale" : model.observation.health;
    const strip = container.createDiv({ cls: `flowdesk-trust-strip is-${state}` });
    strip.createSpan({
      cls: "flowdesk-trust-badge",
      text: model.observation.isStale ? "旧数据" : model.observation.trustMessage,
    });
    strip.createSpan({ text: `${model.schemaLabel} · ${model.observation.generatedAt}` });
    if (!model.observation.isTrustworthy) {
      strip.createDiv({ cls: "flowdesk-warning", text: "观测不可信，无法判断任务是否正常" });
    }
    if (model.observation.isStale) {
      strip.createDiv({ cls: "flowdesk-stale-reason", text: `刷新失败：${model.observation.staleReason}` });
    }
  }

  private renderRootHero(container: HTMLElement, model: DashboardViewModel) {
    const hero = container.createDiv({ cls: "flowdesk-hero" });
    hero.createDiv({ cls: "flowdesk-card-kicker", text: "Root task" });
    const title = hero.createDiv({ cls: "flowdesk-hero-title-row" });
    title.createDiv({ cls: "flowdesk-hero-title", text: model.hero.title });
    title.createSpan({
      cls: `flowdesk-state-pill is-${normalizeStatus(model.hero.status)}`,
      text: formatStatusLabel(model.hero.status),
    });
    const metrics = hero.createDiv({ cls: "flowdesk-hero-metrics" });
    metricCard(metrics, "整体汇总", model.hero.rollupLabel);
    metricCard(metrics, "可信进度", model.hero.workProgressLabel);
    metricCard(metrics, "Priority", formatPriority(model.hero.priority));
    if (model.hero.blockedCount > 0) {
      hero.createDiv({ cls: "flowdesk-warning", text: `${model.hero.blockedCount} 个 child 处于阻塞状态` });
    }
  }

  private renderPrimaryDiagnostic(container: HTMLElement, model: DashboardViewModel) {
    const card = container.createDiv({ cls: "flowdesk-primary-status" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "首要诊断" });
    if (!model.primaryDiagnostic) {
      card.createDiv({
        cls: "flowdesk-primary-title",
        text: model.observation.isTrustworthy ? "当前没有结构化诊断" : "观测不可信，无法确认无异常",
      });
      return;
    }
    card.createDiv({ cls: "flowdesk-primary-title", text: model.primaryDiagnostic.code });
    this.renderDiagnosticBody(card, model.primaryDiagnostic);
  }

  private renderDiagnosticBody(container: HTMLElement, diagnostic: SnapshotDiagnostic) {
    const target = resolveDiagnosticTarget(diagnostic.taskId, diagnostic.source);
    diagnosticRow(container, "任务", diagnostic.taskId);
    diagnosticRow(container, "位置", target.line ? `${target.linkText} · 第 ${target.line} 行` : target.linkText);
    diagnosticRow(container, "字段路径", diagnostic.path);
    diagnosticRow(container, "原因", diagnostic.reason);
    diagnosticRow(container, "预期", diagnostic.expected);
    diagnosticRow(container, "建议修法", diagnostic.remediation);
    const open = container.createEl("button", { text: "打开诊断位置" });
    open.addEventListener("click", () => {
      void this.openDiagnosticLocation(diagnostic);
    });
  }

  private async openDiagnosticLocation(diagnostic: SnapshotDiagnostic) {
    const target = resolveDiagnosticTarget(diagnostic.taskId, diagnostic.source);
    if (!diagnostic.taskId || (target.linkText === diagnostic.taskId && target.line === null)) {
      new Notice("producer 未提供可定位的 task、section 或行号。");
      return;
    }
    try {
      await this.app.workspace.openLinkText(target.linkText, diagnostic.taskId, false);
      if (target.editorLine === null) return;
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || view.file?.path !== diagnostic.taskId) {
        new Notice("任务已打开，但当前视图无法定位到具体行。");
        return;
      }
      if (target.editorLine >= view.editor.lineCount()) {
        new Notice(`诊断行号已超出当前文件范围：${target.line}`);
        return;
      }
      const position = { line: target.editorLine, ch: 0 };
      view.editor.setCursor(position);
      view.editor.scrollIntoView({ from: position, to: position }, true);
      view.editor.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`无法定位诊断位置：${message}`);
    }
  }

  private renderNextAction(container: HTMLElement, model: DashboardViewModel) {
    const card = container.createDiv({ cls: "flowdesk-primary-action" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "下一动作" });
    card.createDiv({ cls: "flowdesk-primary-title", text: model.nextAction ?? "snapshot 未提供下一动作" });
  }

  private renderChildren(container: HTMLElement, children: DashboardChildViewModel[]) {
    const section = createSection(container, `Children review（${children.length}）`);
    if (!children.length) {
      section.createDiv({ cls: "flowdesk-muted", text: "当前 root 没有 child。" });
      return;
    }
    const list = section.createDiv({ cls: "flowdesk-child-list" });
    for (const child of children) {
      const card = list.createDiv({ cls: `flowdesk-child-card${child.isBlocked ? " is-blocked" : ""}` });
      const header = card.createDiv({ cls: "flowdesk-child-header" });
      header.createSpan({ cls: `flowdesk-status-dot is-${normalizeStatus(child.status)}`, text: statusSymbol(child.status) });
      header.createDiv({ cls: "flowdesk-child-title", text: child.title });
      header.createSpan({ cls: "flowdesk-priority", text: formatPriority(child.priority) });
      card.createDiv({ cls: "flowdesk-subline", text: child.id });
      card.createDiv({ cls: "flowdesk-child-goal", text: child.goal });
      childMeta(card, "状态", `${formatStatusLabel(child.status)}${child.trustedDone ? " · 可信完成" : ""}`);
      childMeta(card, "Blocked by", child.blockedBy.length ? child.blockedBy.join("、") : "无");
      childMeta(card, "Covers", child.covers.length ? child.covers.join("、") : "无");
      childMeta(card, "证据", formatChildEvidenceHealth(child.evidenceHealth));
      const acceptance = card.createDiv({ cls: "flowdesk-acceptance-list" });
      acceptance.createDiv({ cls: "flowdesk-summary-label", text: "Acceptance" });
      for (const item of child.acceptance) {
        acceptance.createDiv({ text: `${item.checked ? "☑" : "☐"} ${item.text}` });
      }
      const open = card.createEl("button", { text: "打开 child" });
      open.addEventListener("click", () => void this.openTask(child.id));
    }
  }

  private renderDetails(container: HTMLElement, model: DashboardViewModel) {
    const details = container.createEl("details", { cls: "flowdesk-detail-group" });
    if (!this.detailsOpenInitialized) {
      this.detailsOpen = resolveDetailsOpen(
        this.detailsOpen,
        true,
        model.diagnostics.length,
        model.currentTask.hasChildren
      );
      this.detailsOpenInitialized = true;
    }
    details.open = this.detailsOpen;
    details.addEventListener("toggle", () => (this.detailsOpen = details.open));
    details.createEl("summary", { text: "查看合同与证据详情" });
    const body = details.createDiv({ cls: "flowdesk-detail-body" });
    const observation = createSection(body, "Observation");
    childMeta(observation, "health", model.observation.health);
    childMeta(observation, "parent", model.observation.parent);
    childMeta(observation, "children", model.observation.children);
    childMeta(observation, "TaskNotes API", model.observation.tasknotesApi);
    childMeta(observation, "source", model.observation.sourceTaskId || "未提供");
    const contract = createSection(body, "Contract");
    childMeta(contract, "版本", model.contract.version);
    childMeta(contract, "角色", model.contract.role);
    childMeta(contract, "语义状态", model.contract.semanticStatus);
    childMeta(contract, "Requirements", model.contract.requirements.map((item) => item.id).filter(Boolean).join("、") || "无");
    childMeta(contract, "Scenarios", model.contract.scenarios.map((item) => item.id).filter(Boolean).join("、") || "无");
    const evidence = createSection(body, "Root evidence");
    evidenceRow(evidence, "执行结果", model.root.evidenceHealth.execution);
    evidenceRow(evidence, "验证结果", model.root.evidenceHealth.verification);
    evidenceRow(evidence, "交付记录", model.root.evidenceHealth.delivery);
    if (model.diagnostics.length > 1) {
      const diagnostics = createSection(body, `全部诊断（${model.diagnostics.length}）`);
      for (const diagnostic of model.diagnostics) {
        const item = diagnostics.createDiv({ cls: "flowdesk-diagnostic-item" });
        item.createDiv({ cls: "flowdesk-main-text", text: diagnostic.code });
        this.renderDiagnosticBody(item, diagnostic);
      }
    }
  }

  private async openTask(taskPath: string) {
    if (!taskPath) return;
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof TFile)) {
      new Notice(`未找到任务文件：${taskPath}`);
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file);
  }
}

class FlowDeskDashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FlowDeskDashboardPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "FlowDesk Dashboard" });
    new Setting(containerEl)
      .setName("FlowDesk 仓库路径")
      .setDesc("本地 FlowDesk-Plugin 仓库路径。")
      .addText((text) =>
        text.setPlaceholder("/Users/me/workspaces/flowdesk-plugin").setValue(this.plugin.settings.flowdeskRoot).onChange(async (value) => {
          this.plugin.settings.flowdeskRoot = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("工作目录")
      .setDesc("传给 --working-directory；留空时使用 FlowDesk 仓库路径。")
      .addText((text) =>
        text.setValue(this.plugin.settings.workingDirectory).onChange(async (value) => {
          this.plugin.settings.workingDirectory = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("TaskNotes API 地址")
      .setDesc("可选；留空时使用 FlowDesk CLI 默认值。")
      .addText((text) =>
        text.setPlaceholder("http://127.0.0.1:18090").setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
          this.plugin.settings.apiUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );
  }
}

function createSection(container: HTMLElement, title: string) {
  const section = container.createDiv({ cls: "flowdesk-dashboard-section" });
  section.createDiv({ cls: "flowdesk-dashboard-section-title", text: title });
  return section;
}

function metricCard(container: HTMLElement, label: string, value: string) {
  const card = container.createDiv({ cls: "flowdesk-metric" });
  card.createDiv({ cls: "flowdesk-metric-label", text: label });
  card.createDiv({ cls: "flowdesk-metric-value", text: value });
}

function childMeta(container: HTMLElement, label: string, value: string) {
  const row = container.createDiv({ cls: "flowdesk-meta-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}：` });
  row.createSpan({ text: value });
}

function diagnosticRow(container: HTMLElement, label: string, value: string) {
  const row = container.createDiv({ cls: "flowdesk-diagnostic-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}：` });
  row.createSpan({ text: value });
}

function evidenceRow(container: HTMLElement, label: string, health: EvidenceHealth) {
  const state = getEvidenceDisplayState(health);
  const row = container.createDiv({ cls: "flowdesk-evidence-row" });
  row.createSpan({ cls: `flowdesk-status-dot is-${state}`, text: statusSymbol(state) });
  row.createSpan({ text: formatEvidenceSummary(label, health) });
}

function normalizeStatus(value: unknown) {
  const status = String(value || "unknown").toLowerCase().replace(/_/g, "-");
  if (status === "in-progress") return "running";
  if (status === "complete" || status === "completed") return "done";
  return ["done", "running", "open", "blocked", "error", "valid", "invalid", "unknown"].includes(status)
    ? status
    : "unknown";
}

function formatStatusLabel(value: unknown) {
  const labels: Record<string, string> = {
    done: "已完成",
    running: "进行中",
    open: "待开始",
    blocked: "已阻塞",
    error: "异常",
    unknown: "未知",
  };
  return labels[normalizeStatus(value)] ?? String(value || "未知");
}

function formatPriority(value: string) {
  const labels: Record<string, string> = { high: "高", normal: "普通", low: "低" };
  return labels[value] ?? value;
}

function statusSymbol(value: unknown) {
  const status = normalizeStatus(value);
  if (status === "done" || status === "valid") return "✓";
  if (status === "running") return "◉";
  if (status === "blocked" || status === "error" || status === "invalid") return "!";
  return "•";
}

function expandHomePath(value: string) {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return path.join(homedir(), value.slice(2));
  return value;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatSnapshotCommandError(error: unknown) {
  const failure = error as Partial<ExecFileFailure>;
  const stderr = typeof failure.stderr === "string" ? failure.stderr.trim() : "";
  const stdout = typeof failure.stdout === "string" ? failure.stdout.trim() : "";
  const message = error instanceof Error ? error.message : String(error);
  const output = stderr || stdout || message;
  const unavailable = output.match(/TaskNotes HTTP API unavailable at (\S+)/);
  if (unavailable) {
    return `TaskNotes HTTP API 尚未就绪：${unavailable[1]}\n请确认 Obsidian 和 TaskNotes HTTP API 已启动后再刷新。`;
  }
  if (output.includes("Connection refused")) {
    return "TaskNotes HTTP API 连接被拒绝，请稍后刷新并检查 API URL。";
  }
  const runtime = output.match(/RuntimeError: ([\s\S]+)$/);
  return runtime ? `FlowDesk snapshot 读取失败：${runtime[1].trim()}` : `FlowDesk snapshot 命令失败：${message}`;
}
