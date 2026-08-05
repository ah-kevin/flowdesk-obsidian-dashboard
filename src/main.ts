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
  createDashboardViewModel,
  formatNextAction,
  resolveDiagnosticTarget,
  validateSnapshotSource,
} from "./snapshot-model";
import type {
  ChildTask,
  DashboardViewModel,
  EvidenceItem,
  ExecutionSnapshot,
  SnapshotDiagnostic,
} from "./snapshot-model";

export const FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";

const execFileAsync = promisify(execFile);
const MAX_SNAPSHOT_BUFFER = 8 * 1024 * 1024;

interface FlowDeskDashboardSettings {
  flowdeskRoot: string;
  workingDirectory: string;
  schema: string;
  apiUrl: string;
}

const DEFAULT_SETTINGS: FlowDeskDashboardSettings = {
  flowdeskRoot: "",
  workingDirectory: "",
  schema: "sdd-poc",
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
        if (checking) {
          return canRun;
        }
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

  async openDashboardForActiveTask() {
    await this.refreshDashboard();
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

    const view = leaf.view;
    if (view instanceof FlowDeskDashboardView) {
      await view.loadTask(taskPath);
    }
    workspace.revealLeaf(leaf);
  }

  private getDashboardView(): FlowDeskDashboardView | null {
    const leaf = this.app.workspace.getLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE)[0];
    return leaf?.view instanceof FlowDeskDashboardView ? leaf.view : null;
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

  createSnapshotInvocation(
    taskPath: string,
    format: SnapshotFormat
  ): SnapshotInvocation {
    const flowdeskRoot = this.resolveFlowDeskRoot();
    const workingDirectory =
      expandHomePath(this.settings.workingDirectory.trim()) || flowdeskRoot;
    const apiUrl = this.settings.apiUrl.trim();
    return buildSnapshotInvocation(
      {
        flowdeskRoot,
        taskPath,
        workingDirectory,
        schema: this.settings.schema.trim() || DEFAULT_SETTINGS.schema,
        apiUrl,
      },
      format
    );
  }

  async copyDashboardCommand(taskPath: string): Promise<void> {
    const invocation = this.createSnapshotInvocation(taskPath, "dashboard");
    await navigator.clipboard.writeText(formatShellCommand(invocation));
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

  private resolveFlowDeskRoot(): string {
    const candidates = [
      expandHomePath(this.settings.flowdeskRoot.trim()),
      expandHomePath(process.env.FLOWDESK_PLUGIN_ROOT || ""),
      path.resolve(__dirname, "..", ".."),
    ].filter(Boolean);

    for (const candidate of candidates) {
      const cli = path.join(candidate, "bin", "flowdesk-execution-snapshot");
      if (existsSync(cli)) {
        return candidate;
      }
    }

    throw new Error("未找到 FlowDesk 仓库路径，请在插件设置里配置 FlowDesk repo path。");
  }
}

function expandHomePath(value: string): string {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
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

  getViewType(): string {
    return FLOWDESK_DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "FlowDesk Dashboard";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  async onOpen() {
    await this.syncToActiveFile();
  }

  async onClose() {
    this.refreshScheduler.cancel();
  }

  get currentTaskPath(): string {
    return this.context.kind === "task" ? this.context.taskPath : "";
  }

  async syncToActiveFile(file: TFile | null = this.app.workspace.getActiveFile()) {
    const nextContext = resolveDashboardContext(
      file?.path ?? null,
      this.previousTaskPath
    );

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
    this.queuedRequest = null;
    this.refreshScheduler.cancel();
    this.loading = false;
    this.error = "";
    this.render();
  }

  async loadTask(taskPath: string) {
    const isSameSelection =
      this.context.kind === "task" && this.context.taskPath === taskPath;
    if (!isSameSelection) {
      const taskChanged = Boolean(
        this.previousTaskPath && this.previousTaskPath !== taskPath
      );
      this.selectionRevision += 1;
      this.context = { kind: "task", taskPath };
      this.previousTaskPath = taskPath;
      this.refreshScheduler.cancel();
      if (taskChanged) {
        this.detailsOpen = false;
        this.detailsOpenInitialized = false;
      }
      if (this.displayState?.taskPath !== taskPath) {
        this.displayState = null;
      }
      this.error = "";
      this.loading = true;
      this.render();
    }
    this.queuedRequest = {
      taskPath,
      selectionRevision: this.selectionRevision,
    };
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

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
    if (this.context.kind !== "task") {
      return false;
    }
    return collectObservedTaskPaths(
      this.context.taskPath,
      this.displayState?.snapshot
    ).has(filePath);
  }

  private async loadCurrentTask() {
    if (this.context.kind === "task") {
      await this.loadTask(this.context.taskPath);
    }
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
      if (
        !isCurrentSnapshotRequest(
          request,
          this.context,
          this.selectionRevision
        )
      ) {
        return;
      }
      const sourceIdentity = validateSnapshotSource(snapshot, request.taskPath);
      if (sourceIdentity === false) {
        throw new Error(
          `Snapshot source identity 不匹配：请求 ${request.taskPath}，返回 ${
            snapshot.observation?.source_task_id ?? "未提供"
          }。`
        );
      }
      this.displayState = {
        taskPath: request.taskPath,
        snapshot,
        loadedAt: formatTime(new Date()),
        staleReason: "",
      };
    } catch (error) {
      if (
        !isCurrentSnapshotRequest(
          request,
          this.context,
          this.selectionRevision
        )
      ) {
        return;
      }
      this.error = error instanceof Error ? error.message : String(error);
      if (this.displayState?.taskPath === request.taskPath) {
        this.displayState = {
          ...this.displayState,
          staleReason: this.error,
        };
      } else {
        this.displayState = null;
      }
    } finally {
      if (
        isCurrentSnapshotRequest(
          request,
          this.context,
          this.selectionRevision
        )
      ) {
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
      container.createDiv({
        cls: "flowdesk-empty",
        text: "请打开一个 Tasks/*.md 或 TaskNotes/*.md 任务文件。",
      });
      return;
    }

    const taskPath = this.context.taskPath;

    const displayState =
      this.displayState?.taskPath === taskPath ? this.displayState : null;
    const snapshot = displayState?.snapshot ?? null;

    if (this.loading && !snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "正在读取 snapshot..." });
      return;
    }

    if (this.error) {
      if (!snapshot) {
        container.createDiv({ cls: "flowdesk-error", text: this.error });
        return;
      }
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
    this.renderTrustStrip(container, model);
    this.renderTaskHero(container, model, snapshot);
    this.renderPrimaryDiagnostic(container, model);
    this.renderPrimaryNextAction(container, model);
    this.renderStageRail(container, snapshot);
    this.renderDetails(container, snapshot, model);
  }

  private renderNonTaskState(
    container: HTMLElement,
    context: Extract<DashboardContext, { kind: "non-task" }>
  ) {
    const card = container.createDiv({ cls: "flowdesk-context-pause" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "Dashboard 已暂停" });
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: "当前文件不是 TaskNotes 任务",
    });
    card.createDiv({
      cls: "flowdesk-card-copy",
      text: "FlowDesk Dashboard 仅支持 Tasks/*.md 与 TaskNotes/*.md。",
    });
    card.createDiv({
      cls: "flowdesk-context-path",
      text: `当前文件：${context.activePath}`,
    });
    if (!context.previousTaskPath) {
      return;
    }
    card.createDiv({
      cls: "flowdesk-context-path",
      text: `上一次任务：${context.previousTaskPath}`,
    });
    const back = card.createEl("button", {
      cls: "flowdesk-context-back",
      text: "回到上一次任务",
    });
    back.addEventListener("click", () => {
      void this.openTask(context.previousTaskPath);
    });
  }

  private renderHeader(container: HTMLElement) {
    const header = container.createDiv({ cls: "flowdesk-dashboard-header" });
    const titleBlock = header.createDiv();
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-title",
      text: "FlowDesk Execution Dashboard",
    });
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-path",
      text:
        this.context.kind === "task"
          ? this.context.taskPath
          : this.context.kind === "non-task"
            ? this.context.activePath
            : "未选择文件",
    });
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-meta",
      text: this.loading
        ? this.displayState?.loadedAt
          ? `正在刷新 · 上次读取 ${this.displayState.loadedAt}`
          : "正在读取 snapshot"
        : this.displayState?.loadedAt
          ? `本地读取 ${this.displayState.loadedAt}`
          : "等待刷新",
    });

    const toolbar = header.createDiv({ cls: "flowdesk-dashboard-toolbar" });
    if (this.context.kind !== "task") {
      return;
    }
    const taskPath = this.context.taskPath;
    const copy = toolbar.createEl("button", {
      cls: "flowdesk-copy-button",
      text: "复制 CLI",
    });
    copy.title = "复制当前任务的终端 Dashboard 命令";
    copy.addEventListener("click", async () => {
      copy.disabled = true;
      try {
        await this.plugin.copyDashboardCommand(taskPath);
        copy.setText("已复制");
        new Notice("CLI 命令已复制");
        window.setTimeout(() => {
          if (copy.isConnected) {
            copy.setText("复制 CLI");
            copy.disabled = false;
          }
        }, 1500);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`无法复制 CLI 命令：${message}`);
        copy.disabled = false;
      }
    });

    const refresh = toolbar.createEl("button", {
      cls: "flowdesk-refresh-button",
      text: this.loading ? "刷新中" : "刷新",
    });
    refresh.disabled = this.loading;
    refresh.title = "重新读取当前 TaskNotes 任务的 FlowDesk snapshot";
    refresh.addEventListener("click", () => {
      void this.refreshCurrentTask();
    });
  }

  private renderTrustStrip(container: HTMLElement, model: DashboardViewModel) {
    const trustState = model.observation.isStale
      ? "stale"
      : model.observation.health;
    const strip = container.createDiv({
      cls: `flowdesk-trust-strip flowdesk-trust-${trustState}`,
    });
    const labels: Record<string, string> = {
      healthy: "观测健康",
      degraded: "观测降级",
      error: "观测异常",
      unknown: "观测未知",
    };
    strip.createSpan({
      cls: "flowdesk-trust-badge",
      text: model.observation.isStale
        ? "旧数据"
        : labels[model.observation.health] ?? "观测未知",
    });
    strip.createSpan({
      cls: "flowdesk-trust-contract",
      text: `${model.schemaLabel} · ${model.compatibility.label}`,
    });
    strip.createSpan({
      cls: "flowdesk-trust-generated",
      text: `生成时间 ${model.observation.generatedAt} · 本地读取 ${model.observation.loadedAt}`,
    });
    if (model.observation.isStale) {
      strip.createDiv({
        cls: "flowdesk-stale-reason",
        text: `刷新失败：${model.observation.staleReason}`,
      });
    }
  }

  private renderTaskHero(
    container: HTMLElement,
    model: DashboardViewModel,
    snapshot: ExecutionSnapshot
  ) {
    const hero = container.createDiv({ cls: "flowdesk-hero" });
    const titleRow = hero.createDiv({ cls: "flowdesk-hero-title-row" });
    titleRow.createDiv({ cls: "flowdesk-hero-title", text: model.hero.title });
    titleRow.createSpan({
      cls: `flowdesk-state-pill flowdesk-state-${normalizeStatus(model.hero.status)}`,
      text: formatStatusLabel(model.hero.status),
    });

    const metrics = hero.createDiv({ cls: "flowdesk-hero-metrics" });
    metricCard(metrics, "当前阶段", formatFlowNodeId(model.hero.currentStage));
    metricCard(metrics, "流程进度", model.hero.progressLabel);
    metricCard(
      metrics,
      model.hero.workProgressKind === "inline" ? "Inline 进度" : "任务进度",
      model.hero.workProgressLabel
    );

    if (snapshot.state?.blocked_reason) {
      hero.createDiv({
        cls: "flowdesk-hero-blocked",
        text: `阻塞原因：${snapshot.state.blocked_reason}`,
      });
    }
  }

  private renderPrimaryDiagnostic(
    container: HTMLElement,
    model: DashboardViewModel
  ) {
    const diagnostic = model.primaryDiagnostic;
    if (!diagnostic) {
      const empty = container.createDiv({
        cls: `flowdesk-primary-status ${
          model.observation.isTrustworthy ? "is-clear" : "is-unknown"
        }`,
      });
      empty.createDiv({ cls: "flowdesk-card-kicker", text: "首要问题" });
      empty.createDiv({
        cls: "flowdesk-primary-title",
        text: model.observation.isTrustworthy
          ? "未发现合同或执行诊断"
          : "当前没有可验证的诊断结论",
      });
      if (!model.observation.isTrustworthy) {
        empty.createDiv({
          cls: "flowdesk-card-copy",
          text: "观测并非 healthy v2，不能据此判断任务没有问题。",
        });
      }
      return;
    }

    const card = container.createDiv({ cls: "flowdesk-primary-issue" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "首要问题" });
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: diagnostic.message || diagnostic.code,
    });
    card.createDiv({ cls: "flowdesk-diagnostic-code", text: diagnostic.code });
    this.renderDiagnosticBody(card, diagnostic);
  }

  private renderDiagnosticBody(
    container: HTMLElement,
    diagnostic: SnapshotDiagnostic
  ) {
    const source = diagnostic.source;
    if (source) {
      const location = [
        source.section ? `§ ${source.section}` : "",
        source.field ? `字段 ${source.field}` : "",
        source.line_start ? `第 ${source.line_start} 行` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (location) {
        container.createDiv({ cls: "flowdesk-diagnostic-location", text: location });
      }
      if (source.excerpt) {
        container.createEl("code", {
          cls: "flowdesk-diagnostic-excerpt",
          text: source.excerpt,
        });
      }
    } else {
      container.createDiv({
        cls: "flowdesk-diagnostic-location",
        text: "位置：producer 未提供",
      });
    }
    diagnosticRow(container, "原因", diagnostic.reason);
    diagnosticRow(container, "建议修法", diagnostic.remediation);

    const canLocate = Boolean(
      source?.line_start || source?.section || source?.after_section
    );
    if (canLocate) {
      const actions = container.createDiv({ cls: "flowdesk-diagnostic-actions" });
      const locate = actions.createEl("button", {
        cls: "flowdesk-diagnostic-locate",
        text: "定位",
      });
      locate.title = "只读打开诊断所在的 TaskNotes 位置";
      locate.addEventListener("click", () => {
        void this.openDiagnosticLocation(diagnostic);
      });
    }
  }

  private async openDiagnosticLocation(diagnostic: SnapshotDiagnostic) {
    const taskPath = this.currentTaskPath;
    if (!taskPath) {
      new Notice("当前文件不是 TaskNotes 任务。");
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof TFile)) {
      new Notice(`未找到任务文件：${taskPath}`);
      return;
    }

    const target = resolveDiagnosticTarget(taskPath, diagnostic.source);
    if (target.linkText === taskPath && target.line === null) {
      new Notice("producer 未提供可定位的 section 或行号。");
      return;
    }

    try {
      await this.app.workspace.openLinkText(target.linkText, taskPath, false);
      if (target.line === null) {
        return;
      }

      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || view.file?.path !== taskPath) {
        new Notice("任务已打开，但当前视图无法定位到具体行。");
        return;
      }

      const line = target.line - 1;
      if (line < 0 || line >= view.editor.lineCount()) {
        new Notice(`诊断行号已超出当前文件范围：${target.line}`);
        return;
      }
      const position = { line, ch: 0 };
      view.editor.setCursor(position);
      view.editor.scrollIntoView({ from: position, to: position }, true);
      view.editor.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`无法定位诊断位置：${message}`);
    }
  }

  private renderPrimaryNextAction(
    container: HTMLElement,
    model: DashboardViewModel
  ) {
    const card = container.createDiv({ cls: "flowdesk-primary-action" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "下一动作" });
    const noAction =
      model.state === "done" && model.observation.isTrustworthy
        ? "无后续动作"
        : "snapshot 未提供下一动作";
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: model.nextAction ?? noAction,
    });
  }

  private renderStageRail(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "执行阶段");
    const rail = section.createDiv({ cls: "flowdesk-stage-rail" });
    const nodes = snapshot.flow_graph?.nodes ?? [];
    if (!nodes.length) {
      rail.createDiv({ cls: "flowdesk-muted", text: "未提供阶段数据。" });
      return;
    }

    for (const node of nodes) {
      const status = normalizeStatus(node.status);
      const item = rail.createDiv({
        cls: `flowdesk-stage-item flowdesk-stage-${status}`,
      });
      item.createSpan({ cls: "flowdesk-stage-symbol", text: statusSymbol(status) });
      item.createSpan({
        cls: "flowdesk-stage-label",
        text: formatFlowNodeId(node.id) || node.label || "未命名阶段",
      });
    }
  }

  private renderDetails(
    container: HTMLElement,
    snapshot: ExecutionSnapshot,
    model: DashboardViewModel
  ) {
    const details = container.createEl("details", { cls: "flowdesk-detail-group" });
    if (!this.detailsOpenInitialized) {
      this.detailsOpen = resolveDetailsOpen(
        this.detailsOpen,
        true,
        model.diagnostics.length
      );
      this.detailsOpenInitialized = true;
    }
    details.open = this.detailsOpen;
    details.addEventListener("toggle", () => {
      this.detailsOpen = details.open;
    });
    details.createEl("summary", { text: "查看执行详情" });
    const body = details.createDiv({ cls: "flowdesk-detail-body" });

    this.renderObservationDetails(body, model);
    this.renderInlineExecution(body, model);
    this.renderFlowGraph(body, snapshot);
    this.renderContract(body, snapshot);
    this.renderTasksOrEvidence(body, snapshot);
    this.renderMaterialization(body, snapshot);
    this.renderNotepad(body, snapshot);
    if (model.diagnostics.length > 1) {
      this.renderAllDiagnostics(body, model.diagnostics);
    }
    this.renderNextActions(body, snapshot);
  }

  private renderObservationDetails(
    container: HTMLElement,
    model: DashboardViewModel
  ) {
    const section = createSection(container, "观测信息");
    const list = section.createDiv({ cls: "flowdesk-contract-list" });
    contractRow(list, "来源任务", [model.observation.sourceTaskId || "未提供"]);
    contractRow(list, "来源一致", [
      model.observation.sourceIdentity ? "一致" : "不一致或未提供",
    ]);
    contractRow(list, "执行模式", [model.compatibility.profile]);
    if (!model.observation.coverage.length) {
      list.createDiv({ cls: "flowdesk-muted", text: "观测覆盖：未提供" });
      return;
    }
    for (const item of model.observation.coverage) {
      contractRow(list, item.key, [item.value]);
    }
  }

  private renderInlineExecution(
    container: HTMLElement,
    model: DashboardViewModel
  ) {
    const inline = model.inlineProgress;
    if (!inline) {
      return;
    }
    const section = createSection(container, "行内执行");
    section.createDiv({
      cls: "flowdesk-main-text",
      text: `${inline.completed ?? "?"}/${inline.total} TASK · ${formatStatusLabel(inline.status)} · ${
        inline.explicit ? "显式记录" : "推断状态"
      }`,
    });
    const list = section.createDiv({ cls: "flowdesk-inline-task-list" });
    for (const task of inline.tasks) {
      const row = list.createDiv({ cls: "flowdesk-inline-task" });
      row.createSpan({
        cls: `flowdesk-status-dot flowdesk-status-${normalizeStatus(task.status)}`,
        text: statusSymbol(normalizeStatus(task.status)),
      });
      row.createSpan({ text: `${task.id} · ${formatStatusLabel(task.status)}` });
      if (task.inferred) {
        row.createSpan({ cls: "flowdesk-inferred-label", text: "推断" });
      }
    }
  }

  private renderMaterialization(
    container: HTMLElement,
    snapshot: ExecutionSnapshot
  ) {
    const materialization =
      snapshot.task_materialization ?? snapshot.task_graph?.task_materialization;
    if (!materialization) {
      return;
    }
    const section = createSection(container, "任务物化");
    const list = section.createDiv({ cls: "flowdesk-contract-list" });
    contractRow(list, "模式", [materialization.mode ?? "未提供"]);
    contractRow(list, "状态", [formatStatusLabel(materialization.status)]);
    contractRow(list, "已声明", materialization.declared);
    contractRow(list, "已物化", materialization.materialized);
    contractRow(list, "缺失", materialization.missing);
    contractRow(list, "冲突", materialization.conflicts);
  }

  private renderAllDiagnostics(
    container: HTMLElement,
    diagnostics: SnapshotDiagnostic[]
  ) {
    const section = createSection(container, `全部诊断（${diagnostics.length}）`);
    const list = section.createDiv({ cls: "flowdesk-diagnostic-list" });
    for (const diagnostic of diagnostics) {
      const item = list.createDiv({ cls: "flowdesk-diagnostic-item" });
      item.createDiv({ cls: "flowdesk-main-text", text: diagnostic.code });
      this.renderDiagnosticBody(item, diagnostic);
    }
  }

  private renderFlowGraph(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "执行流程");
    const list = section.createDiv({ cls: "flowdesk-flow-list" });
    const nodes = snapshot.flow_graph?.nodes ?? [];
    if (!nodes.length) {
      list.createDiv({ cls: "flowdesk-muted", text: "未提供流程节点。" });
      return;
    }

    for (const node of nodes) {
      const status = normalizeStatus(node.status);
      const row = list.createDiv({
        cls: `flowdesk-flow-row flowdesk-task-state-${status}`,
      });
      row.createSpan({ cls: `flowdesk-status-dot flowdesk-status-${status}`, text: statusSymbol(status) });
      const body = row.createDiv({ cls: "flowdesk-row-body" });
      body.createDiv({
        cls: "flowdesk-main-text",
        text: `[${formatStatusLabel(status)}] ${node.label ?? node.id ?? ""} (${formatFlowNodeId(node.id)})`,
      });
      if (node.missing_deps?.length) {
        body.createDiv({
          cls: "flowdesk-subline",
          text: `被以下节点阻塞：${formatIds(node.missing_deps)}`,
        });
      }
    }
  }

  private renderContract(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "规格契约");
    const list = section.createDiv({ cls: "flowdesk-contract-list" });
    const contract = snapshot.spec_contract ?? {};
    contractRow(list, "需求", contract.requirements?.ids);
    contractRow(list, "场景", contract.scenarios?.ids);
    contractRow(list, "实施任务", contract.tasks?.ids);

    const questions = contract.open_questions?.items ?? [];
    if (questions.length) {
      const row = list.createDiv();
      row.createDiv({ cls: "flowdesk-main-text", text: "待确认问题" });
      for (const question of questions) {
        row.createDiv({ cls: "flowdesk-subline", text: `- ${question}` });
      }
    }
  }

  private renderTasksOrEvidence(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const tasks = snapshot.task_graph?.tasks ?? [];
    if (tasks.length) {
      this.renderChildTasks(container, tasks);
      return;
    }
    this.renderTaskEvidence(container, snapshot);
  }

  private renderChildTasks(container: HTMLElement, tasks: ChildTask[]) {
    const section = createSection(container, "子任务证据");
    const list = section.createDiv({ cls: "flowdesk-task-list" });

    for (const task of tasks) {
      const state = normalizeStatus(task.state);
      const row = list.createDiv({
        cls: `flowdesk-child-task flowdesk-task-state-${state}`,
      });
      row.createSpan({ cls: `flowdesk-status-dot flowdesk-status-${state}`, text: statusSymbol(state) });
      const body = row.createDiv({ cls: "flowdesk-row-body" });
      const title = body.createDiv({ cls: "flowdesk-task-title-row" });
      title.createSpan({ cls: "flowdesk-task-badge", text: "任务" });
      title.createSpan({
        cls: "flowdesk-main-text",
        text: `[${formatStatusLabel(state)}] ${task.title ?? ""}`,
      });
      if (task.id) {
        body.createDiv({ cls: "flowdesk-subline", text: `任务路径：${task.id}` });
      }
      if (task.covers?.length) {
        body.createDiv({ cls: "flowdesk-subline", text: `覆盖：${formatIds(task.covers)}` });
      }
      if (task.blocked_by?.length) {
        body.createDiv({ cls: "flowdesk-subline", text: `被以下任务阻塞：${formatIds(task.blocked_by)}` });
      }
      if (task.covers_unresolved) {
        body.createDiv({ cls: "flowdesk-warning", text: task.limitation ?? "任务覆盖关系尚未解析。" });
      }
      if (task.id) {
        const openButton = row.createEl("button", {
          cls: "flowdesk-task-open-button",
          text: "打开",
        });
        openButton.title = `打开 ${task.id}`;
        openButton.addEventListener("click", () => {
          void this.openTask(task.id);
        });
      }
    }
  }

  private async openTask(taskPath: string | undefined) {
    if (!taskPath) {
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof TFile)) {
      new Notice(`未找到任务文件：${taskPath}`);
      return;
    }

    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private renderTaskEvidence(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "执行证据");
    const list = section.createDiv({ cls: "flowdesk-evidence-list" });
    const evidence = snapshot.spec_contract?.evidence ?? {};

    evidenceRow(list, "执行结果", evidence.execution_result);
    evidenceRow(list, "验证结果", evidence.verification_result);
    evidenceRow(list, "交付记录", evidence.delivery_record);

    const checklist = snapshot.spec_contract?.checklist;
    if (checklist?.total) {
      const unchecked = numberValue(checklist.unchecked);
      const row = list.createDiv({ cls: "flowdesk-evidence-row" });
      row.createSpan({
        cls: `flowdesk-status-dot flowdesk-status-${unchecked ? "ready" : "done"}`,
        text: statusSymbol(unchecked ? "ready" : "done"),
      });
      const body = row.createDiv({ cls: "flowdesk-row-body" });
      body.createDiv({
        cls: "flowdesk-main-text",
        text: `验收清单：已勾选 ${numberValue(checklist.checked)}/${numberValue(checklist.total)}`,
      });
      if (unchecked) {
        body.createDiv({
          cls: "flowdesk-warning",
          text: "提醒：仍有未勾选的验收项。",
        });
      }
    }
  }

  private renderNotepad(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "工作区记事板");
    const notepad = snapshot.notepad ?? {};
    if (!notepad.exists) {
      section.createDiv({ cls: "flowdesk-muted", text: "未提供记事板。" });
      return;
    }

    section.createDiv({
      cls: "flowdesk-main-text",
      text: "已读取记事板（仅供参考，不作为状态事实源）",
    });
    const priority = (notepad.priority ?? "").trim();
    if (priority) {
      for (const line of priority.split("\n").slice(0, 5)) {
        section.createDiv({ cls: "flowdesk-subline", text: line });
      }
    }
  }

  private renderNextActions(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "后续动作");
    const list = section.createDiv({ cls: "flowdesk-next-list" });
    const actions = snapshot.next_actions ?? [];
    if (!actions.length) {
      list.createDiv({ cls: "flowdesk-muted", text: "没有后续动作。" });
      return;
    }

    for (const action of actions) {
      const label = formatNextAction(action) ?? "未知动作";
      list.createDiv({
        cls: "flowdesk-next-action",
        text: `→ ${label}`,
      });
    }
  }
}

class FlowDeskDashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FlowDeskDashboardPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "FlowDesk Dashboard" });

    new Setting(containerEl)
      .setName("FlowDesk 仓库路径")
      .setDesc("本地 FlowDesk-Plugin 仓库路径；符号链接安装时通常可以留空。")
      .addText((text) =>
        text
          .setPlaceholder("/Users/bjke/workspaces/flowdesk-plugin")
          .setValue(this.plugin.settings.flowdeskRoot)
          .onChange(async (value) => {
            this.plugin.settings.flowdeskRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("工作目录")
      .setDesc("传给 --working-directory，用于读取 .flowdesk/notepad.md；留空时使用 FlowDesk 仓库路径。")
      .addText((text) =>
        text
          .setPlaceholder("/Users/bjke/workspaces/flowdesk-plugin")
          .setValue(this.plugin.settings.workingDirectory)
          .onChange(async (value) => {
            this.plugin.settings.workingDirectory = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Schema 名称")
      .setDesc("传给 --schema，默认 sdd-poc。")
      .addText((text) =>
        text
          .setPlaceholder("sdd-poc")
          .setValue(this.plugin.settings.schema)
          .onChange(async (value) => {
            this.plugin.settings.schema = value.trim() || DEFAULT_SETTINGS.schema;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("TaskNotes API 地址")
      .setDesc("可选；留空时使用 FlowDesk CLI 默认值。")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:18090")
          .setValue(this.plugin.settings.apiUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}

function createSection(container: HTMLElement, title: string): HTMLElement {
  const section = container.createDiv({ cls: "flowdesk-dashboard-section" });
  section.createDiv({ cls: "flowdesk-dashboard-section-title", text: title });
  section.createDiv({ cls: "flowdesk-dashboard-rule" });
  return section;
}

function metricCard(container: HTMLElement, label: string, value: string) {
  const card = container.createDiv({ cls: "flowdesk-metric" });
  card.createDiv({ cls: "flowdesk-metric-label", text: label });
  card.createDiv({ cls: "flowdesk-metric-value", text: value });
}

function diagnosticRow(container: HTMLElement, label: string, value: string) {
  const row = container.createDiv({ cls: "flowdesk-diagnostic-row" });
  row.createSpan({ cls: "flowdesk-diagnostic-label", text: `${label}：` });
  row.createSpan({ text: value });
}

function contractRow(container: HTMLElement, label: string, ids?: string[]) {
  const row = container.createDiv();
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}：` });
  row.createSpan({ text: formatIds(ids) });
}

function evidenceRow(container: HTMLElement, label: string, item?: EvidenceItem) {
  const exists = Boolean(item?.exists);
  const status = exists ? "done" : "blocked";
  const row = container.createDiv({ cls: "flowdesk-evidence-row" });
  row.createSpan({ cls: `flowdesk-status-dot flowdesk-status-${status}`, text: statusSymbol(status) });
  const body = row.createDiv({ cls: "flowdesk-row-body" });
  const items = item?.items ?? [];
  body.createDiv({
    cls: "flowdesk-main-text",
    text: `${label}：${exists ? `已提供（${items.length} 项）` : "缺失"}`,
  });
  for (const detail of items.slice(0, 2)) {
    body.createDiv({ cls: "flowdesk-subline", text: `- ${detail}` });
  }
  if (items.length > 2) {
    const details = body.createEl("details", { cls: "flowdesk-evidence-details" });
    details.createEl("summary", { text: `显示剩余 ${items.length - 2} 条` });
    for (const detail of items.slice(2)) {
      details.createDiv({ cls: "flowdesk-subline", text: `- ${detail}` });
    }
  }
}

function normalizeStatus(status: unknown): string {
  const value = String(status || "unknown").toLowerCase().replace(/_/g, "-");
  if (["done", "running", "ready", "blocked", "error", "unknown"].includes(value)) {
    return value;
  }
  if (value === "complete" || value === "completed") {
    return "done";
  }
  if (value === "in-progress") {
    return "running";
  }
  return "unknown";
}

function formatStatusLabel(status: unknown): string {
  const value = normalizeStatus(status);
  const labels: Record<string, string> = {
    done: "已完成",
    running: "进行中",
    ready: "可开始",
    blocked: "已阻塞",
    error: "异常",
    unknown: "未知",
  };
  return labels[value] ?? String(status || "未知");
}

function statusSymbol(status: string): string {
  if (status === "done") return "✓";
  if (status === "running") return "◉";
  if (status === "ready") return "●";
  if (status === "blocked") return "○";
  return "•";
}

function formatIds(value: unknown): string {
  if (!value) {
    return "无";
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return "无";
    }
    return value.map((item) => formatId(item)).join(", ");
  }
  return formatId(value);
}

function formatId(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return String(record.uid ?? record.id ?? JSON.stringify(record));
  }
  return String(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatSnapshotCommandError(error: unknown): string {
  const failure = error as Partial<ExecFileFailure>;
  const stderr = typeof failure.stderr === "string" ? failure.stderr.trim() : "";
  const stdout = typeof failure.stdout === "string" ? failure.stdout.trim() : "";
  const message = error instanceof Error ? error.message : String(error);
  const output = stderr || stdout || message;

  const tasknotesUnavailable = output.match(/TaskNotes HTTP API unavailable at (\S+)/);
  if (tasknotesUnavailable) {
    return [
      `TaskNotes HTTP API 尚未就绪：${tasknotesUnavailable[1]}`,
      "请确认 Obsidian 和 TaskNotes HTTP API 已启动后再刷新。",
    ].join("\n");
  }

  if (output.includes("Connection refused")) {
    return [
      "TaskNotes HTTP API 连接被拒绝，可能还在启动中。",
      "请稍后点击刷新；如果一直失败，请检查插件设置里的 TaskNotes API URL。",
    ].join("\n");
  }

  const runtimeError = output.match(/RuntimeError: ([\s\S]+)$/);
  if (runtimeError) {
    return `FlowDesk snapshot 读取失败：${runtimeError[1].trim()}`;
  }

  return `FlowDesk snapshot 命令失败：${message}`;
}

function formatFlowNodeId(id: unknown): string {
  const value = String(id ?? "");
  const labels: Record<string, string> = {
    spec_contract: "规格契约",
    task_breakdown: "任务拆分",
    task_materialization: "任务物化",
    implementation: "实现",
    verification: "验证",
    delivery: "交付",
  };
  return labels[value] ?? value;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
