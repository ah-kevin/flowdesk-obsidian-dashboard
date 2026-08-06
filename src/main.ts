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
  registerInitialDashboardSync,
  resolveRefreshFailureDisplay,
  resolveSnapshotEnvelopeFailure,
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
  createDashboardPresentation,
  formatTaskShellStatus,
  isActivationKey,
  resolveDisclosureState,
  type DashboardChildRowPresentation,
  type DashboardContractPresentation,
  type DashboardPresentation,
  type DashboardPrimaryStatusPresentation,
  type DashboardTrustPresentation,
  type DisclosureState,
} from "./dashboard-presentation";
import {
  formatEvidenceSummary,
  getEvidenceDisplayState,
} from "./evidence-presentation";
import {
  createDashboardViewModel,
  resolveDiagnosticNavigation,
  resolveDiagnosticTarget,
  type DashboardViewModel,
  type EvidenceHealth,
  type ExecutionSnapshot,
  type SnapshotContractItem,
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
  private cancelInitialSync: (() => void) | null = null;
  private disclosureState: DisclosureState = resolveDisclosureState(undefined, true);

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
    this.cancelInitialSync = registerInitialDashboardSync(
      (callback) => this.app.workspace.onLayoutReady(callback),
      () => {
        void this.syncToActiveFile();
      }
    );
  }

  async onClose() {
    this.cancelInitialSync?.();
    this.cancelInitialSync = null;
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
      this.selectionRevision += 1;
      this.context = { kind: "task", taskPath };
      this.previousTaskPath = taskPath;
      this.displayState = null;
      this.error = "";
      this.loading = true;
      this.refreshScheduler.cancel();
      this.disclosureState = resolveDisclosureState(this.disclosureState, true);
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
      const envelopeFailure = resolveSnapshotEnvelopeFailure(
        this.displayState,
        request.taskPath,
        snapshot
      );
      if (envelopeFailure.error) {
        this.error = envelopeFailure.error;
        this.displayState = envelopeFailure.displayState;
        return;
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
      this.displayState = resolveRefreshFailureDisplay(
        this.displayState,
        request.taskPath,
        this.error
      );
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
    if (this.context.kind === "non-task") {
      this.renderNonTaskState(container, this.context);
      return;
    }
    if (this.context.kind === "empty") {
      container.createDiv({
        cls: "flowdesk-empty",
        text: "打开一个 TaskNotes 任务以查看 Dashboard。",
      });
      return;
    }
    const taskPath = this.context.taskPath;
    const displayState = this.displayState?.taskPath === taskPath ? this.displayState : null;
    const snapshot = displayState?.snapshot;
    if (!snapshot) {
      this.renderLoadingHeader(
        container,
        taskPath,
        formatTaskShellStatus(this.loading, this.error)
      );
    }
    if (this.loading && !snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "正在读取当前任务 snapshot..." });
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
      this.renderLoadingHeader(container, taskPath, "snapshot 不兼容");
      container.createDiv({
        cls: "flowdesk-error",
        text:
          model.errorCode === "unsupported_snapshot_model"
            ? "Snapshot model 不受支持：需要 task-centric。"
            : "Snapshot schema 不受支持：需要 3。",
      });
      return;
    }
    const presentation = createDashboardPresentation(model);
    this.renderHeader(container, model, presentation);
    this.renderTrustStrip(container, presentation.trust);
    this.renderPrimaryDiagnostic(container, presentation.primaryStatus);
    if (presentation.children.length) {
      this.renderChildren(container, model, presentation.children);
    }
    this.renderDetails(container, model, presentation.contract);
  }

  private renderLoadingHeader(
    container: HTMLElement,
    taskPath: string,
    status: string
  ) {
    const header = container.createDiv({ cls: "flowdesk-task-header" });
    const title = header.createDiv({ cls: "flowdesk-task-heading" });
    title.createDiv({ cls: "flowdesk-task-title", text: taskTitleFromPath(taskPath) });
    title.createDiv({ cls: "flowdesk-task-loading", text: status });
    this.renderToolbar(header, taskPath);
  }

  private renderHeader(
    container: HTMLElement,
    model: DashboardViewModel,
    presentation: DashboardPresentation
  ) {
    const header = container.createDiv({ cls: "flowdesk-task-header" });
    const heading = header.createDiv({ cls: "flowdesk-task-heading" });
    if (presentation.header.parent) {
      const parent = heading.createEl("button", {
        cls: "flowdesk-parent-link",
        text: `↑ ${presentation.header.parent.title}`,
      });
      parent.addEventListener("click", () => {
        void this.openTask(presentation.header.parent?.id ?? "");
      });
    }
    heading.createDiv({ cls: "flowdesk-task-title", text: presentation.header.title });
    const badges = heading.createDiv({ cls: "flowdesk-task-badges" });
    badges.createSpan({
      cls: `flowdesk-state-pill is-${presentation.header.statusTone}`,
      text: presentation.header.status,
    });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.kindLabel });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.priority });
    if (model.currentTask.isBlocked) {
      badges.createSpan({ cls: "flowdesk-state-pill is-error", text: "存在阻塞" });
    }
    this.renderToolbar(header, model.currentTask.id);
  }

  private renderToolbar(container: HTMLElement, taskPath: string) {
    const toolbar = container.createDiv({ cls: "flowdesk-dashboard-toolbar" });
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
  }

  private renderTrustStrip(
    container: HTMLElement,
    trust: DashboardTrustPresentation
  ) {
    const strip = container.createDiv({
      cls: `flowdesk-trust-summary is-${trust.tone}`,
    });
    const headline = strip.createDiv({ cls: "flowdesk-trust-headline" });
    headline.createSpan({ cls: "flowdesk-trust-badge", text: trust.label });
    headline.createSpan({ cls: "flowdesk-trust-contract", text: trust.contractLabel });
    strip.createDiv({ cls: "flowdesk-trust-meta", text: trust.meta });
    strip.createDiv({ cls: "flowdesk-trust-detail", text: trust.detail });
  }

  private renderPrimaryDiagnostic(
    container: HTMLElement,
    status: DashboardPrimaryStatusPresentation
  ) {
    const card = container.createDiv({
      cls: `flowdesk-primary-status is-${status.tone}`,
    });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "当前状态" });
    if (status.diagnostic) {
      const title = card.createEl("button", {
        cls: "flowdesk-primary-title flowdesk-diagnostic-link",
        text: status.title,
      });
      title.addEventListener("click", () => {
        void this.openDiagnosticLocation(status.diagnostic as SnapshotDiagnostic);
      });
    } else {
      card.createDiv({ cls: "flowdesk-primary-title", text: status.title });
    }
    diagnosticRow(card, "原因", status.reason);
    diagnosticRow(card, "建议", status.remediation);
    card.createDiv({ cls: "flowdesk-primary-location", text: status.location });
  }

  private renderDiagnosticBody(container: HTMLElement, diagnostic: SnapshotDiagnostic) {
    const target = resolveDiagnosticTarget(diagnostic.taskId, diagnostic.source);
    diagnosticRow(container, "任务", diagnostic.taskId);
    diagnosticRow(container, "位置", target.line ? `${target.linkText} · 第 ${target.line} 行` : target.linkText);
    diagnosticRow(container, "字段路径", diagnostic.path);
    diagnosticRow(container, "原因", diagnostic.reason);
    diagnosticRow(container, "预期", diagnostic.expected);
    diagnosticRow(container, "建议修法", diagnostic.remediation);
  }

  private async openDiagnosticLocation(diagnostic: SnapshotDiagnostic) {
    const navigation = resolveDiagnosticNavigation(
      diagnostic.taskId,
      diagnostic.source
    );
    if (!navigation.canOpen) {
      new Notice("producer 未提供可打开的 task ID。");
      return;
    }
    const { target } = navigation;
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

  private renderChildren(
    container: HTMLElement,
    model: DashboardViewModel,
    children: DashboardChildRowPresentation[]
  ) {
    const section = container.createDiv({ cls: "flowdesk-child-section" });
    const heading = section.createDiv({ cls: "flowdesk-section-heading" });
    heading.createDiv({
      cls: "flowdesk-dashboard-section-title",
      text: `直接子任务 · ${children.length}`,
    });
    heading.createDiv({
      cls: "flowdesk-section-meta",
      text: `${model.rollup.childrenTrustedDone}/${model.rollup.childrenTotal} 可信完成`,
    });
    const list = section.createDiv({ cls: "flowdesk-child-list" });
    for (const child of children) {
      const row = list.createDiv({
        cls: `flowdesk-child-row is-${child.tone}`,
        attr: { role: "button", tabindex: "0" },
      });
      const rowHeader = row.createDiv({ cls: "flowdesk-child-row-header" });
      rowHeader.createDiv({ cls: "flowdesk-child-title", text: child.title });
      rowHeader.createSpan({
        cls: `flowdesk-state-pill is-${child.tone}`,
        text: child.status,
      });
      row.createDiv({ cls: "flowdesk-child-summary", text: child.summary });
      row.createDiv({ cls: "flowdesk-child-meta", text: child.meta });
      this.makeNavigable(row, () => this.openTask(child.id));
    }
  }

  private renderDetails(
    container: HTMLElement,
    model: DashboardViewModel,
    summary: DashboardContractPresentation
  ) {
    const details = container.createEl("details", {
      cls: "flowdesk-contract-summary",
    });
    details.open = this.disclosureState.summaryOpen;
    details.addEventListener("toggle", () => {
      this.disclosureState.summaryOpen = details.open;
    });
    details.createEl("summary", { text: "当前任务合同与证据" });
    const overview = details.createDiv({ cls: "flowdesk-contract-overview" });
    const goal = overview.createDiv({ cls: "flowdesk-contract-goal" });
    goal.createDiv({ cls: "flowdesk-summary-label", text: "目标" });
    goal.createDiv({ cls: "flowdesk-contract-goal-text", text: summary.goal });
    const metrics = overview.createDiv({ cls: "flowdesk-contract-metrics" });
    for (const value of [
      summary.coverage,
      summary.acceptance,
      summary.evidence,
      summary.diagnostics,
    ]) {
      metrics.createSpan({ cls: "flowdesk-contract-chip", text: value });
    }

    const full = overview.createEl("details", { cls: "flowdesk-technical-details" });
    full.open = this.disclosureState.fullOpen;
    full.addEventListener("toggle", () => {
      this.disclosureState.fullOpen = full.open;
    });
    full.createEl("summary", { text: "展开全部合同、证据与诊断" });
    const body = full.createDiv({ cls: "flowdesk-detail-body" });
    const observation = createSection(body, "观察详情");
    childMeta(observation, "健康状态", model.observation.health);
    childMeta(observation, "当前任务", model.observation.currentTask);
    childMeta(observation, "父任务", model.observation.parent);
    childMeta(observation, "直接子任务", model.observation.children);
    childMeta(observation, "TaskNotes API", model.observation.tasknotesApi);
    childMeta(observation, "来源任务", model.observation.sourceTaskId || "未提供");
    const contract = createSection(body, "任务合同 v3");
    childMeta(contract, "版本", model.contract.version);
    childMeta(contract, "语义状态", model.contract.semanticStatus);
    childMeta(contract, "目标", model.contract.goal);
    renderTextList(contract, "范围 · 包含", model.contract.scope.included);
    renderTextList(contract, "范围 · 不包含", model.contract.scope.excluded);
    renderContractItems(contract, "需求", model.contract.requirements);
    renderContractItems(contract, "场景", model.contract.scenarios);
    const acceptance = createSection(body, "验收标准");
    if (!model.contract.acceptance.length) {
      acceptance.createDiv({ cls: "flowdesk-muted", text: "producer 未提供验收项。" });
    }
    for (const item of model.contract.acceptance) {
      acceptance.createDiv({ text: `${item.checked ? "☑" : "☐"} ${item.text ?? "未提供"}` });
    }
    const evidence = createSection(body, "当前任务证据");
    evidenceRow(evidence, "执行结果", model.evidence.execution);
    evidenceRow(evidence, "验证结果", model.evidence.verification);
    evidenceRow(evidence, "交付记录", model.evidence.delivery);
    if (model.diagnostics.length) {
      const diagnostics = createSection(body, `技术诊断 · ${model.diagnostics.length}`);
      for (const diagnostic of model.diagnostics) {
        const item = diagnostics.createDiv({ cls: "flowdesk-diagnostic-item" });
        const diagnosticLink = item.createEl("button", {
          cls: "flowdesk-technical-diagnostic-link",
          text: diagnostic.code,
        });
        diagnosticLink.addEventListener("click", () => {
          void this.openDiagnosticLocation(diagnostic);
        });
        this.renderDiagnosticBody(item, diagnostic);
      }
    }
  }

  private makeNavigable(element: HTMLElement, action: () => Promise<void>) {
    element.addClass("is-clickable");
    element.addEventListener("click", () => {
      void action();
    });
    element.addEventListener("keydown", (event) => {
      if (!isActivationKey(event.key)) return;
      event.preventDefault();
      void action();
    });
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

function childMeta(container: HTMLElement, label: string, value: string) {
  const row = container.createDiv({ cls: "flowdesk-meta-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}：` });
  row.createSpan({ text: value });
}

function renderTextList(container: HTMLElement, label: string, values: string[]) {
  const section = container.createDiv({ cls: "flowdesk-contract-list" });
  section.createDiv({ cls: "flowdesk-summary-label", text: label });
  if (!values.length) {
    section.createDiv({ cls: "flowdesk-muted", text: "无" });
    return;
  }
  for (const value of values) {
    section.createDiv({ text: `• ${value}` });
  }
}

function renderContractItems(
  container: HTMLElement,
  label: string,
  items: SnapshotContractItem[]
) {
  const section = container.createDiv({ cls: "flowdesk-contract-list" });
  section.createDiv({ cls: "flowdesk-summary-label", text: label });
  if (!items.length) {
    section.createDiv({ cls: "flowdesk-muted", text: "无" });
    return;
  }
  for (const item of items) {
    const coverage = item.requirement_ids?.length
      ? ` (${item.requirement_ids.join("、")})`
      : "";
    section.createDiv({
      text: `${item.id ?? "未编号"}${coverage}：${item.text ?? "未提供"}`,
    });
  }
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

function statusSymbol(value: unknown) {
  const status = normalizeStatus(value);
  if (status === "done" || status === "valid") return "✓";
  if (status === "running") return "◉";
  if (status === "blocked" || status === "error" || status === "invalid") return "!";
  return "•";
}

function taskTitleFromPath(taskPath: string) {
  return path.basename(taskPath, path.extname(taskPath));
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
