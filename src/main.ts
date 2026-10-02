import {
  App,
  ItemView,
  MarkdownRenderer,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  setIcon,
  TFile,
  TAbstractFile,
  WorkspaceLeaf,
} from "obsidian";
import { execFile } from "child_process";
import {
  formatTaskNotesAuthError,
  resolveTaskNotesApiUrl,
  resolveTaskNotesAuth,
  sanitizeTaskNotesSnapshot,
} from "./tasknotes-auth";
import { existsSync } from "fs";
import { homedir } from "os";
import * as path from "path";
import { promisify } from "util";
import {
  createSnapshotExecutionOptions,
  isTaskPath,
  registerInitialDashboardSync,
  type DashboardContext,
} from "./dashboard-state";
import {
  FrozenTaskAdapter,
  type FrozenTaskRenderState,
} from "./frozen-task-adapter";
import {
  isUnsupportedContext,
  resolveViewShellContext,
  ViewShellController,
} from "./view-shell";
import {
  buildSnapshotInvocation,
  formatShellCommand,
  type SnapshotFormat,
  type SnapshotInvocation,
} from "./snapshot-invocation";
import { readTaskDetails, type TaskDetailsRead } from "./tasknotes-read";
import { TaskContentRenderer } from "./task-content-renderer";
import { rawContentDiffers, type TaskRawContentObservation } from "./task-content";
import {
  createDashboardPresentation,
  createDiagnosticDisclosureKey,
  formatSnapshotCompatibilityError,
  formatTaskShellStatus,
  isActivationKey,
  reconcileDiagnosticDisclosureState,
  resolveDiagnosticDisclosureOpen,
  resolveDetailSectionOrder,
  type DashboardChildRowPresentation,
  type DashboardContractPresentation,
  type DashboardPresentation,
  type DashboardPrimaryStatusPresentation,
  type DashboardTechnicalDiagnosticGroup,
  type DashboardTrustPresentation,
  type DetailSection,
  type DisclosureState,
} from "./dashboard-presentation";
import {
  createDashboardViewModel,
  resolveDiagnosticNavigation,
  type DashboardViewModel,
  type ExecutionSnapshot,
  type SnapshotDiagnostic,
  type SnapshotSource,
} from "./snapshot-model";
import {
  taskNavigationLeafType,
  type TaskNavigationOrigin,
} from "./task-navigation";
import { formatDiagnosticClipboard } from "./diagnostic-clipboard";
import {
  WorkCaseAdapter,
  type WorkCaseRenderState,
} from "./work-case-adapter";
import {
  buildWorkCaseSnapshotInvocation,
  type WorkCaseSnapshotInvocation,
} from "./work-case-invocation";
import type { WorkCaseSourceRange } from "./work-case-model";
import { WorkCaseDashboardRenderer } from "./work-case-renderer";

export const FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";

const execFileAsync = promisify(execFile);

interface FlowDeskDashboardSettings {
  flowdeskRoot: string;
  workingDirectory: string;
  apiUrl: string;
  tasknotesEnv: string;
}

const DEFAULT_SETTINGS: FlowDeskDashboardSettings = {
  flowdeskRoot: "",
  workingDirectory: "",
  apiUrl: "",
  tasknotesEnv: "{}",
};

interface ExecFileFailure extends Error {
  code?: number | string;
  stderr?: string;
  stdout?: string;
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
      this.app.metadataCache.on("changed", (file) => {
        const view = this.getDashboardView();
        if (view?.observesFile(file.path)) view.scheduleRefresh();
        const activeFile = this.app.workspace.getActiveFile();
        if (
          activeFile?.path === file.path &&
          !this.isTaskFile(activeFile)
        ) {
          void this.getDashboardView()?.syncToActiveFile(file);
        }
      })
    );
    const refreshOnChange = (file: TAbstractFile) => {
      const view = this.getDashboardView();
      if (view && file instanceof TFile && view.observesFile(file.path)) view.scheduleRefresh();
    };
    this.registerEvent(this.app.vault.on("modify", refreshOnChange));
    this.registerEvent(this.app.vault.on("create", refreshOnChange));
    this.registerEvent(this.app.vault.on("delete", refreshOnChange));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const view = this.getDashboardView();
      if (view && file instanceof TFile && (view.observesFile(file.path) || view.observesFile(oldPath))) view.scheduleRefresh();
    }));
    this.addSettingTab(new FlowDeskDashboardSettingTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE);
  }

  async refreshDashboard(fallbackTaskPath = "") {
    const file = this.app.workspace.getActiveFile();
    const taskPath = this.isTaskFile(file) ? file.path : fallbackTaskPath;
    if (taskPath) {
      await this.activateDashboard(taskPath);
      return;
    }
    if (file && ["work-case", "session"].includes(this.workCaseType(file))) {
      await this.activateWorkCaseDashboard(file);
      return;
    }
    new Notice("请先打开一个 Tasks/*.md 任务文件。");
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

  async activateWorkCaseDashboard(file: TFile): Promise<void> {
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
      await leaf.view.syncToActiveFile(file);
    }
    workspace.revealLeaf(leaf);
  }

  async loadSnapshot(
    taskPath: string,
    signal: AbortSignal
  ): Promise<ExecutionSnapshot> {
    const auth = resolveTaskNotesAuth(this.settings.tasknotesEnv ?? "{}");
    const invocation = this.createSnapshotInvocation(taskPath, "json");
    let stdout: string;
    try {
      const result = await execFileAsync(invocation.executable, invocation.args, {
        ...createSnapshotExecutionOptions(invocation.cwd, signal),
        env: auth.env,
      });
      stdout = result.stdout;
    } catch (error) {
      throw new Error(formatTaskNotesAuthError(formatSnapshotCommandError(error), auth.token));
    }
    try {
      return sanitizeTaskNotesSnapshot(JSON.parse(stdout) as ExecutionSnapshot, auth.token);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(formatTaskNotesAuthError(`Snapshot JSON 解析失败：${message}`, auth.token));
    }
  }

  async loadWorkCaseSnapshot(
    casePath: string,
    signal: AbortSignal
  ): Promise<unknown> {
    const auth = resolveTaskNotesAuth(this.settings.tasknotesEnv ?? "{}");
    const invocation = this.createWorkCaseSnapshotInvocation(casePath);
    let stdout: string;
    try {
      const result = await execFileAsync(invocation.executable, invocation.args, {
        ...createSnapshotExecutionOptions(invocation.cwd, signal),
        env: auth.env,
      });
      stdout = result.stdout;
    } catch (error) {
      throw new Error(formatTaskNotesAuthError(formatWorkCaseCommandError(error), auth.token));
    }
    try {
      return sanitizeTaskNotesSnapshot(JSON.parse(stdout) as unknown, auth.token);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(formatTaskNotesAuthError(`Work Case snapshot JSON 解析失败：${message}`, auth.token));
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
        apiUrl: resolveTaskNotesApiUrl(this.settings.apiUrl, resolveTaskNotesAuth(this.settings.tasknotesEnv ?? "{}").env),
      },
      format
    );
  }

  createWorkCaseSnapshotInvocation(casePath: string): WorkCaseSnapshotInvocation {
    return buildWorkCaseSnapshotInvocation({
      flowdeskRoot: this.resolveFlowDeskRoot(),
      casePath,
      workingDirectory: this.resolveVaultRoot(),
      apiUrl: resolveTaskNotesApiUrl(this.settings.apiUrl, resolveTaskNotesAuth(this.settings.tasknotesEnv ?? "{}").env),
    });
  }

  async copyDashboardCommand(taskPath: string): Promise<void> {
    await navigator.clipboard.writeText(
      formatShellCommand(this.createSnapshotInvocation(taskPath, "dashboard"))
    );
  }

  async loadTaskDetails(taskPath: string, signal: AbortSignal): Promise<TaskDetailsRead> {
    const auth = resolveTaskNotesAuth(this.settings.tasknotesEnv ?? "{}");
    return readTaskDetails({ taskPath, signal, auth, apiUrl: resolveTaskNotesApiUrl(this.settings.apiUrl, auth.env) });
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

  workCaseType(file: TFile | null): string {
    if (!file || file.extension !== "md" || this.isTaskFile(file)) return "";
    const type = this.app.metadataCache.getFileCache(file)?.frontmatter?.type;
    return typeof type === "string" ? type : "";
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

  private resolveVaultRoot(): string {
    const adapter = this.app.vault.adapter as unknown as {
      getBasePath?: () => string;
      basePath?: string;
    };
    const basePath =
      typeof adapter.getBasePath === "function"
        ? adapter.getBasePath()
        : adapter.basePath;
    if (!basePath) {
      throw new Error("Work Case Dashboard 仅支持本地文件系统 Vault。");
    }
    return path.resolve(basePath);
  }

}

class FlowDeskDashboardView extends ItemView {
  private previousTaskPath = "";
  private shell!: ViewShellController;
  private readonly taskAdapter: FrozenTaskAdapter;
  private readonly caseAdapter: WorkCaseAdapter;
  private readonly caseRenderer: WorkCaseDashboardRenderer;
  private cancelInitialSync: (() => void) | null = null;
  private rawTaskContent: TaskRawContentObservation | null = null;
  private rawContentController: AbortController | null = null;
  private rawContentGeneration = 0;
  private rawContentLoading = false;
  private rawContentOpen = false;

  private clearRawTaskContent(): void {
    this.rawContentGeneration += 1;
    this.rawContentController?.abort();
    this.rawContentController = null;
    this.rawTaskContent = null;
    this.rawContentLoading = false;
    this.rawContentOpen = false;
  }

  private async loadRawTaskContent(taskPath: string): Promise<void> {
    if (this.shell.context.kind !== "task" || !("resourcePath" in this.shell.context) || this.shell.context.resourcePath !== taskPath) return;
    this.rawContentController?.abort();
    const controller = new AbortController();
    this.rawContentController = controller;
    const generation = ++this.rawContentGeneration;
    this.rawContentLoading = true;
    this.rawContentOpen = true;
    this.rawTaskContent = null;
    this.renderShell();
    const current = () => generation === this.rawContentGeneration && !controller.signal.aborted && this.shell.context.kind === "task" && "resourcePath" in this.shell.context && this.shell.context.resourcePath === taskPath;
    try {
      const result = await this.plugin.loadTaskDetails(taskPath, controller.signal);
      if (!current()) return;
      this.rawTaskContent = { taskId: result.id, details: result.details, readAt: result.source.readAt, source: result.source.kind, error: null };
    } catch (error) {
      if (!current()) return;
      this.rawTaskContent = { taskId: taskPath, details: "", readAt: "", source: "tasknotes-api", error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (current()) {
        this.rawContentLoading = false;
        this.rawContentController = null;
        this.renderShell();
      }
    }
  }

  private renderRawTaskContent(container: HTMLElement, model: DashboardViewModel): void {
    const section = container.createEl("details", { cls: "flowdesk-contract-item-details flowdesk-raw-content" });
    section.open = this.rawContentOpen;
    section.addEventListener("toggle", () => { this.rawContentOpen = section.open; });
    section.createEl("summary", { text: "完整API原文 / 未投影内容" });
    section.createDiv({ cls: "flowdesk-muted", text: `单独API原文观测；不代表与 snapshot 同轮一致。Task：${model.currentTask.id}；snapshot 时间：${model.observation.generatedAt}` });
    const read = section.createEl("button", { text: this.rawContentLoading ? "原文读取中" : "读取 / 刷新 API 原文", cls: "flowdesk-content-read" });
    read.disabled = this.rawContentLoading;
    read.addEventListener("click", () => { void this.loadRawTaskContent(model.currentTask.id); });
    const original = section.createEl("button", { text: "打开任务原文", cls: "flowdesk-content-source" });
    original.addEventListener("click", () => { void this.openTask(model.currentTask.id); });
    const observation = this.rawTaskContent;
    if (!observation || observation.taskId !== model.currentTask.id) return;
    if (observation.error) {
      section.createDiv({ cls: "flowdesk-error", text: `API原文读取失败：${observation.error}` });
      return;
    }
    section.createDiv({ cls: "flowdesk-muted", text: `tasknotes-api · ${observation.taskId} · 成功读取时间：${observation.readAt}` });
    if (rawContentDiffers(model.content, observation, this.taskRenderState.snapshot ?? undefined)) section.createDiv({ cls: "flowdesk-error", text: "API原文与 snapshot 投影片段存在差异；snapshot 已标记 stale，请刷新核对。" });
    if (observation.details === "") section.createDiv({ cls: "flowdesk-muted", text: "API原文为空；可打开整张任务原文。" });
    else {
      const markdown = section.createDiv({ cls: "flowdesk-contract-scope-markdown" });
      void MarkdownRenderer.render(this.app, observation.details, markdown, observation.taskId, this).catch(() => { markdown.setText(observation.details); });
    }
  }

  constructor(leaf: WorkspaceLeaf, private plugin: FlowDeskDashboardPlugin) {
    super(leaf);
    this.taskAdapter = new FrozenTaskAdapter({
      shell: () => this.shell,
      loadSnapshot: (taskPath, signal) =>
        this.plugin.loadSnapshot(taskPath, signal),
      render: (container, state) => this.renderFrozenTask(container, state),
      requestRender: () => this.renderShell(),
      nowLabel: () => formatTime(new Date()),
    });
    this.caseAdapter = new WorkCaseAdapter({
      shell: () => this.shell,
      loadSnapshot: (casePath, signal) =>
        this.plugin.loadWorkCaseSnapshot(casePath, signal),
      render: (container, state) => this.renderWorkCase(container, state),
      requestRender: () => this.renderShell(),
      nowLabel: () => formatTime(new Date()),
    });
    this.caseRenderer = new WorkCaseDashboardRenderer({
      refresh: () => this.caseAdapter.refresh(),
      openTask: (taskPath, origin) => this.openTask(taskPath, origin),
      openCaseSource: (casePath, source) =>
        this.openCaseSource(casePath, source),
      openRelated: (target, casePath) => this.openRelated(target, casePath),
    });
    this.shell = new ViewShellController([this.taskAdapter, this.caseAdapter]);
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
    this.clearRawTaskContent();
    this.cancelInitialSync?.();
    this.cancelInitialSync = null;
    this.shell.close();
    this.taskAdapter.close();
  }

  async syncToActiveFile(file: TFile | null = this.app.workspace.getActiveFile()) {
    const nextContext = resolveViewShellContext(
      file?.path ?? null,
      this.previousTaskPath,
      this.plugin.workCaseType(file)
    );
    if (!("resourcePath" in nextContext) || nextContext.kind !== "task" || this.shell.context.kind !== "task" || !("resourcePath" in this.shell.context) || this.shell.context.resourcePath !== nextContext.resourcePath) this.clearRawTaskContent();
    if ("resourcePath" in nextContext) {
      this.previousTaskPath = nextContext.resourcePath;
      await this.shell.select(nextContext);
      this.renderShell();
      return;
    }
    await this.shell.select(nextContext);
    this.renderShell();
  }

  async loadTask(taskPath: string) {
    this.clearRawTaskContent();
    this.previousTaskPath = taskPath;
    await this.shell.select(
      { kind: this.taskAdapter.kind, resourcePath: taskPath },
      { force: true }
    );
  }

  async refreshCurrentTask() {
    this.clearRawTaskContent();
    await this.taskAdapter.refresh();
  }

  scheduleRefresh() {
    if (this.shell.context.kind === this.caseAdapter.kind) {
      this.caseAdapter.scheduleRefresh();
    } else {
      this.clearRawTaskContent();
      this.taskAdapter.scheduleRefresh();
    }
  }

  observesTaskFile(filePath: string): boolean {
    return this.taskAdapter.observesTaskFile(filePath);
  }

  observesFile(filePath: string): boolean {
    return this.shell.context.kind === this.caseAdapter.kind
      ? this.caseAdapter.observesFile(filePath)
      : this.observesTaskFile(filePath);
  }

  private get taskRenderState(): FrozenTaskRenderState {
    const state = this.taskAdapter.getRenderState();
    if (!state) throw new Error("Frozen Task Adapter 尚未激活");
    return state;
  }

  private get loading(): boolean {
    return this.taskRenderState.loading;
  }

  private get disclosureState(): DisclosureState {
    return this.taskRenderState.disclosureState;
  }

  private renderShell() {
    const container = this.contentEl;
    container.empty();
    this.caseRenderer.reset(container);
    container.addClass("flowdesk-dashboard");
    if (this.shell.context.kind === this.taskAdapter.kind) {
      this.taskAdapter.render(container);
      return;
    }
    if (this.shell.context.kind === this.caseAdapter.kind) {
      this.caseAdapter.render(container);
      return;
    }
    if (isUnsupportedContext(this.shell.context)) {
      this.renderNonTaskState(container, {
        kind: "non-task",
        activePath: this.shell.context.activePath,
        previousTaskPath: this.shell.context.previousResourcePath,
      });
      return;
    }
    if (this.shell.context.kind === "empty") {
      container.createDiv({
        cls: "flowdesk-empty",
        text: "打开一个 TaskNotes 任务以查看 Dashboard。",
      });
    }
  }

  private renderWorkCase(
    container: HTMLElement,
    state: WorkCaseRenderState
  ): void {
    this.caseRenderer.render(container, state);
  }

  private renderFrozenTask(
    container: HTMLElement,
    state: FrozenTaskRenderState
  ) {
    const taskPath = state.taskPath;
    const snapshot = state.snapshot;
    if (!snapshot) {
      this.renderLoadingHeader(
        container,
        taskPath,
        formatTaskShellStatus(state.loading, state.error)
      );
    }
    if (state.loading && !snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "正在读取当前任务 snapshot..." });
      return;
    }
    if (state.error && !snapshot) {
      container.createDiv({ cls: "flowdesk-error", text: state.error });
      return;
    }
    if (!snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "尚未读取 snapshot。" });
      return;
    }
    const rawDifference = this.rawTaskContent && !this.rawTaskContent.error && rawContentDiffers(
      createDashboardViewModel(snapshot).content, this.rawTaskContent, snapshot
    );
    const model = createDashboardViewModel(snapshot, {
      expectedTaskPath: taskPath,
      loadedAt: state.loadedAt,
      staleReason: state.staleReason || (rawDifference ? "API原文与 snapshot 片段存在差异，请刷新核对。" : ""),
    });
    if (model.errorCode) {
      this.renderLoadingHeader(container, taskPath, "snapshot 不兼容");
      container.createDiv({
        cls: "flowdesk-error",
        text: formatSnapshotCompatibilityError(model.errorCode),
      });
      return;
    }
    const presentation = createDashboardPresentation(model);
    this.renderHeader(container, model, presentation);
    this.renderTrustStrip(container, presentation.trust);
    this.renderPrimaryDiagnostic(
      container,
      presentation.primaryStatus,
      model.currentTask.title,
      model.currentTask.id
    );
    if (presentation.children.length) {
      this.renderChildren(container, model, presentation.children);
    }
    this.renderDetails(
      container,
      model,
      presentation.contract,
      presentation.technicalDiagnostics
    );
  }

  private renderLoadingHeader(
    container: HTMLElement,
    taskPath: string,
    status: string
  ) {
    const header = container.createDiv({ cls: "flowdesk-task-header" });
    const topRow = header.createDiv({ cls: "flowdesk-task-top-row" });
    const actions = topRow.createDiv({ cls: "flowdesk-task-meta-actions" });
    this.renderToolbar(actions, taskPath);
    const heading = header.createDiv({ cls: "flowdesk-task-heading" });
    const title = heading.createDiv({
      cls: "flowdesk-task-title flowdesk-current-task-link",
      text: taskTitleFromPath(taskPath),
      attr: { role: "link", tabindex: "0" },
    });
    this.makeNavigable(title, () => this.openTask(taskPath));
    const metaRow = header.createDiv({ cls: "flowdesk-task-meta-row" });
    metaRow.createDiv({ cls: "flowdesk-task-read-meta", text: status });
  }

  private renderHeader(
    container: HTMLElement,
    model: DashboardViewModel,
    presentation: DashboardPresentation
  ) {
    const header = container.createDiv({ cls: "flowdesk-task-header" });
    const topRow = header.createDiv({ cls: "flowdesk-task-top-row" });
    if (presentation.header.parent) {
      const parent = topRow.createDiv({
        cls: "flowdesk-parent-link",
        text: "↑ 父任务",
        attr: {
          role: "link",
          tabindex: "0",
          title: presentation.header.parent.title,
          "aria-label": `打开父任务：${presentation.header.parent.title}`,
        },
      });
      this.makeNavigable(parent, () =>
        this.openTask(presentation.header.parent?.id ?? "", "parent")
      );
    } else {
      topRow.createDiv({
        cls: "flowdesk-task-context-label",
        text: presentation.kind === "parent" ? "当前父任务" : "当前任务",
      });
    }
    const actions = topRow.createDiv({ cls: "flowdesk-task-meta-actions" });
    this.renderToolbar(actions, model.currentTask.id, model);
    const heading = header.createDiv({ cls: "flowdesk-task-heading" });
    const title = heading.createDiv({
      cls: "flowdesk-task-title flowdesk-current-task-link",
      text: presentation.header.title,
      attr: { role: "link", tabindex: "0" },
    });
    this.makeNavigable(title, () => this.openTask(model.currentTask.id));
    const metaRow = header.createDiv({ cls: "flowdesk-task-meta-row" });
    const badges = metaRow.createDiv({ cls: "flowdesk-task-badges" });
    badges.createSpan({
      cls: `flowdesk-state-pill is-${presentation.header.statusTone}`,
      text: presentation.header.status,
      attr: {title: model.currentTask.status},
    });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.kindLabel });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.priority });
    if (model.currentTask.isBlocked) {
      badges.createSpan({ cls: "flowdesk-state-pill is-error", text: "存在阻塞" });
    }
    metaRow.createDiv({
      cls: "flowdesk-task-read-meta",
      text: `来源：${model.schemaLabel} · ${this.loading ? "正在刷新 · 上次读取" : "读取于"} ${model.observation.loadedAt}`,
      attr: {title: `producer 生成于 ${model.observation.generatedAt}`},
    });
  }

  private renderToolbar(
    container: HTMLElement,
    taskPath: string,
    model?: DashboardViewModel
  ) {
    const toolbar = container.createDiv({ cls: "flowdesk-dashboard-toolbar" });
    const copy = toolbar.createEl("button", {
      cls: "flowdesk-toolbar-button",
      attr: { "aria-label": "复制 CLI", title: "复制 CLI" },
    });
    setIcon(copy, "copy");
    copy.addEventListener("click", async () => {
      try {
        await this.plugin.copyDashboardCommand(taskPath);
        new Notice("CLI 命令已复制");
      } catch (error) {
        new Notice(`无法复制 CLI 命令：${String(error)}`);
      }
    });
    const refresh = toolbar.createEl("button", {
      cls: "flowdesk-toolbar-button",
      attr: {
        "aria-label": this.loading ? "刷新中" : "刷新",
        title: this.loading ? "刷新中" : "刷新",
      },
    });
    setIcon(refresh, "refresh-cw");
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
      attr: { title: trust.tooltip },
    });
    strip.createSpan({ cls: "flowdesk-trust-dot", attr: { "aria-hidden": "true" } });
    strip.createSpan({ cls: "flowdesk-trust-badge", text: trust.label });
    strip.createSpan({ cls: "flowdesk-trust-source", text: trust.sourceLabel });
    strip.createSpan({
      cls: `flowdesk-trust-contract is-${trust.contractTone}`,
      text: trust.contractLabel,
    });
  }

  private renderPrimaryDiagnostic(
    container: HTMLElement,
    status: DashboardPrimaryStatusPresentation,
    taskTitle: string,
    taskId: string
  ) {
    const card = container.createDiv({
      cls: `flowdesk-primary-status is-${status.tone}`,
    });
    card.createDiv({
      cls: "flowdesk-card-kicker",
      text: "当前进展",
    });
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
    diagnosticRow(card, "做到哪了", status.reason);
    diagnosticRow(card, "下一步", status.remediation);
    if (status.diagnostic) {
      const copyProblem = card.createEl("button", {
        cls: "flowdesk-copy-problem",
        text: "复制问题",
        attr: { "aria-label": "复制问题" },
      });
      copyProblem.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.copyDiagnostic({
          taskTitle,
          taskId,
          title: status.title,
          reason: status.reason,
          remediation: status.remediation,
          code: status.diagnostic?.code || "unknown_diagnostic",
          path: status.diagnostic?.path || "未提供",
          location: status.location,
        });
      });
    }
  }

  private async copyDiagnostic(input: Parameters<typeof formatDiagnosticClipboard>[0]) {
    try {
      await navigator.clipboard.writeText(formatDiagnosticClipboard(input));
      new Notice("问题已复制");
    } catch (error) {
      new Notice(`无法复制问题：${String(error)}`);
    }
  }

  private async openDiagnosticLocation(diagnostic: SnapshotDiagnostic) {
    await this.openSnapshotSource(diagnostic.taskId, diagnostic.source, "诊断");
  }

  private async openSnapshotSource(
    taskPath: string,
    source?: SnapshotSource,
    sourceKind = "来源"
  ) {
    const navigation = resolveDiagnosticNavigation(
      taskPath,
      source
    );
    if (!navigation.canOpen) {
      new Notice("producer 未提供可打开的 task ID。");
      return;
    }
    const { target } = navigation;
    try {
      await this.app.workspace.openLinkText(target.linkText, taskPath, false);
      if (target.editorLine === null) return;
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || view.file?.path !== taskPath) {
        new Notice("任务已打开，但当前视图无法定位到具体行。");
        return;
      }
      if (target.editorLine >= view.editor.lineCount()) {
        new Notice(`${sourceKind}行号已超出当前文件范围：${target.line}`);
        return;
      }
      const position = { line: target.editorLine, ch: 0 };
      view.editor.setCursor(position);
      view.editor.scrollIntoView({ from: position, to: position }, true);
      view.editor.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`无法定位${sourceKind}位置：${message}`);
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
      text: `${children.filter(child => !child.history).length} 项未完成或状态未知`,
    });
    const list = section.createDiv({ cls: "flowdesk-child-list" });
    const historical = children.filter(child => child.history);
    let historyList: HTMLElement | null = null;
    if (historical.length) {
      const history = section.createEl("details", {cls: "flowdesk-task-history"});
      history.createEl("summary", {text: `已完成 · ${historical.length}`});
      historyList = history.createDiv({cls: "flowdesk-child-list"});
    }
    for (const child of children) {
      const row = (child.history ? historyList! : list).createDiv({
        cls: `flowdesk-child-row is-${child.tone}`,
        attr: { role: "button", tabindex: "0" },
      });
      row.createSpan({
        cls: `flowdesk-child-state-dot is-${child.tone}`,
        attr: { "aria-hidden": "true" },
      });
      const content = row.createDiv({ cls: "flowdesk-child-content" });
      content.createDiv({ cls: "flowdesk-child-title", text: child.title });
      content.createDiv({ cls: "flowdesk-child-summary", text: child.summary });
      content.createDiv({ cls: "flowdesk-child-meta", text: child.meta });
      row.createSpan({
        cls: `flowdesk-child-status is-${child.tone}`,
        text: child.status,
        attr: {title: model.children.find(item => item.id === child.id)?.status || "未记录"},
      });
      this.makeNavigable(row, () => this.openTask(child.id, "child"));
    }
  }

  private renderDetails(
    container: HTMLElement,
    model: DashboardViewModel,
    summary: DashboardContractPresentation,
    diagnosticGroups: DashboardTechnicalDiagnosticGroup[]
  ) {
    const diagnosticCount = diagnosticGroups.reduce(
      (total, group) => total + group.diagnostics.length,
      0
    );
    const details = container.createEl("details", {
      cls: "flowdesk-contract-summary",
    });
    details.open = this.disclosureState.summaryOpen;
    details.addEventListener("toggle", () => {
      this.disclosureState.summaryOpen = details.open;
    });
    const summaryToggle = details.createEl("summary");
    summaryToggle.createSpan({ text: "需求与记录" });
    summaryToggle.createSpan({
      cls: "flowdesk-contract-diagnostic-count",
      text: `${diagnosticCount} 项诊断`,
    });
    const overview = details.createDiv({ cls: "flowdesk-contract-overview" });
    const goal = overview.createDiv({ cls: "flowdesk-contract-goal" });
    goal.createDiv({ cls: "flowdesk-summary-label", text: "目标" });
    goal.createDiv({ cls: "flowdesk-contract-goal-text", text: summary.goal });
    const full = overview.createEl("details", { cls: "flowdesk-technical-details" });
    full.open = this.disclosureState.fullOpen;
    full.addEventListener("toggle", () => {
      this.disclosureState.fullOpen = full.open;
    });
    full.createEl("summary", { text: "规格与交付详情" });
    const body = full.createDiv({ cls: "flowdesk-detail-body" });
    const renderedSections = new Map<DetailSection, HTMLElement>();
    const contract = createSection(body, "任务规格与记录", "producer 投影");
    renderedSections.set("contract", contract);
    new TaskContentRenderer({
      renderMarkdown: (text, element, taskPath) => MarkdownRenderer.render(this.app, text, element, taskPath, this),
      // Accurate source line mapping is Task 3. Task 1 opens the task without guessing vault offsets.
      openSource: (taskPath) => this.openTask(taskPath),
    }).render(contract, model.content);
    this.renderRawTaskContent(contract, model);

    const observation = createSection(
      body,
      "观察与来源",
      model.observation.isTrustworthy ? "健康" : "需检查",
      `flowdesk-observation-summary ${model.observation.isTrustworthy ? "is-healthy" : "is-warning"}`
    );
    renderedSections.set("observation", observation);
    observation.createDiv({
      cls: "flowdesk-observation-copy",
      text: model.observation.trustMessage,
    });
    const observationChips = observation.createDiv({
      cls: "flowdesk-contract-chip-row",
    });
    observationChips.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.observation.currentTask === "observed" ? "Task 已读取" : "Task 未确认",
    });
    observationChips.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.observation.parent === "not_applicable"
        ? "无父任务"
        : model.observation.parent === "observed"
          ? "父任务已读取"
          : "父任务未确认",
    });
    observationChips.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.observation.children === "observed"
        ? model.currentTask.hasChildren
          ? "子任务已读取"
          : "无子任务"
        : "子任务未确认",
    });
    observationChips.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.observation.sourceIdentity === true ? "来源一致" : "来源待确认",
    });
    const observationDetails = observation.createEl("details", {
      cls: "flowdesk-observation-details",
    });
    observationDetails.open = this.disclosureState.observationOpen;
    observationDetails.addEventListener("toggle", () => {
      this.disclosureState.observationOpen = observationDetails.open;
    });
    observationDetails.createEl("summary", { text: "查看 6 个技术字段" });
    const observationGrid = observationDetails.createDiv({
      cls: "flowdesk-observation-grid",
    });
    observationField(observationGrid, "当前任务", model.observation.currentTask);
    observationField(observationGrid, "父任务", model.observation.parent);
    observationField(observationGrid, "直接子任务", model.observation.children);
    observationField(observationGrid, "TaskNotes API", model.observation.tasknotesApi);
    observationField(
      observationGrid,
      "来源身份",
      model.observation.sourceIdentity === true
        ? "match"
        : model.observation.sourceIdentity === false
          ? "mismatch"
          : "unknown"
    );
    observationField(
      observationGrid,
      "数据陈旧",
      model.observation.isStale ? "true" : "false"
    );
    const activeDiagnosticKeys: string[] = [];
    const diagnosticKeyOccurrences = new Map<string, number>();
    if (diagnosticGroups.length) {
      const diagnostics = body.createEl("details", {
        cls: "flowdesk-dashboard-section flowdesk-diagnostics-section",
      });
      diagnostics.open = this.disclosureState.technicalDiagnosticsOpen;
      diagnostics.addEventListener("toggle", () => {
        this.disclosureState.technicalDiagnosticsOpen = diagnostics.open;
      });
      const diagnosticsSummary = diagnostics.createEl("summary", {
        cls: "flowdesk-contract-section-head",
      });
      diagnosticsSummary.createSpan({
        cls: "flowdesk-dashboard-section-title",
        text: "技术诊断",
      });
      diagnosticsSummary.createSpan({
        cls: "flowdesk-contract-section-meta",
        text: `${diagnosticCount} 项`,
      });
      renderedSections.set("diagnostics", diagnostics);
      for (const group of diagnosticGroups) {
        const groupContainer = diagnostics.createDiv({
          cls: `flowdesk-diagnostic-task-group is-${group.kind}`,
        });
        const groupHeader = groupContainer.createDiv({
          cls: "flowdesk-diagnostic-task-head",
        });
        groupHeader.createSpan({
          cls: "flowdesk-diagnostic-task-kind",
          text: group.kind === "current" ? "当前任务" : "直接子任务",
        });
        if (group.kind === "child") {
          const taskLink = groupHeader.createEl("button", {
            cls: "flowdesk-diagnostic-task-link",
            text: group.taskTitle,
            attr: { title: `在新标签打开：${group.taskTitle}` },
          });
          taskLink.addEventListener("click", () => {
            void this.openTask(group.taskId, "child");
          });
        } else {
          groupHeader.createSpan({
            cls: "flowdesk-diagnostic-task-title",
            text: group.taskTitle,
          });
        }
        groupHeader.createSpan({
          cls: `flowdesk-diagnostic-task-status is-${group.tone}`,
          text: `${group.status} · ${group.diagnostics.length} 项`,
        });
        group.diagnostics.forEach((diagnostic) => {
          const baseKey = createDiagnosticDisclosureKey(
            group.taskId,
            diagnostic.diagnostic
          );
          const occurrence = diagnosticKeyOccurrences.get(baseKey) ?? 0;
          diagnosticKeyOccurrences.set(baseKey, occurrence + 1);
          const disclosureKey = occurrence ? `${baseKey}#${occurrence + 1}` : baseKey;
          activeDiagnosticKeys.push(disclosureKey);
          const item = groupContainer.createEl("details", {
            cls: "flowdesk-diagnostic-issue",
          });
          item.open = resolveDiagnosticDisclosureOpen(
            this.disclosureState,
            disclosureKey
          );
          item.addEventListener("toggle", () => {
            this.disclosureState.diagnosticOpen[disclosureKey] = item.open;
          });
          const itemHead = item.createEl("summary", {
            cls: "flowdesk-diagnostic-issue-summary",
          });
          itemHead.createSpan({
            cls: `flowdesk-diagnostic-severity is-${diagnostic.diagnostic.severity}`,
            attr: { "aria-hidden": "true" },
          });
          itemHead.createSpan({
            cls: "flowdesk-diagnostic-action",
            text: diagnostic.title,
          });
          const diagnosticLink = itemHead.createEl("button", {
            cls: "flowdesk-diagnostic-source",
            text: `${diagnostic.sourceLabel} ↗`,
          });
          diagnosticLink.addEventListener("click", (event) => {
            event.stopPropagation();
            void this.openDiagnosticLocation(diagnostic.diagnostic);
          });
          const copyProblem = itemHead.createEl("button", {
            cls: "flowdesk-copy-problem",
            text: "复制问题",
            attr: { "aria-label": "复制问题" },
          });
          copyProblem.addEventListener("click", (event) => {
            event.stopPropagation();
            void this.copyDiagnostic({
              taskTitle: group.taskTitle,
              taskId: group.taskId,
              title: diagnostic.title,
              reason: diagnostic.actual,
              remediation: diagnostic.remediation,
              code: diagnostic.machine.code,
              path: diagnostic.machine.path,
              location: diagnostic.machine.location,
            });
          });
          const itemBody = item.createDiv({ cls: "flowdesk-diagnostic-item-body" });
          diagnosticRow(itemBody, "实际", diagnostic.actual);
          diagnosticRow(itemBody, "修复", diagnostic.remediation);
          const supporting = itemBody.createEl("details", {
            cls: "flowdesk-diagnostic-supporting-details flowdesk-machine-details",
          });
          supporting.open =
            this.disclosureState.diagnosticSupportingOpen[disclosureKey] ?? false;
          supporting.addEventListener("toggle", () => {
            this.disclosureState.diagnosticSupportingOpen[disclosureKey] =
              supporting.open;
          });
          supporting.createEl("summary", { text: "查看预期与机器字段" });
          diagnosticRow(supporting, "预期", diagnostic.expected);
          diagnosticRow(supporting, "错误码", diagnostic.machine.code);
          diagnosticRow(supporting, "字段", diagnostic.machine.path);
        });
      }
    }
    reconcileDiagnosticDisclosureState(
      this.disclosureState,
      activeDiagnosticKeys
    );
    for (const sectionName of resolveDetailSectionOrder(diagnosticCount > 0)) {
      const section = renderedSections.get(sectionName);
      if (section) body.appendChild(section);
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

  private async openTask(
    taskPath: string,
    origin: TaskNavigationOrigin = "current"
  ) {
    if (!taskPath) return;
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof TFile)) {
      new Notice(`未找到任务文件：${taskPath}`);
      return;
    }
    await this.app.workspace
      .getLeaf(taskNavigationLeafType(origin))
      .openFile(file);
  }

  private async openCaseSource(
    casePath: string,
    source: WorkCaseSourceRange
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof TFile)) {
      new Notice(`未找到 Work Case 文件：${casePath}`);
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== casePath) {
      new Notice("Work Case 已打开，但当前视图无法定位到具体行。");
      return;
    }
    const editorLine = Math.max(0, source.lineStart - 1);
    if (editorLine >= view.editor.lineCount()) {
      new Notice(`Work Case 来源行号已超出当前文件范围：${source.lineStart}`);
      return;
    }
    const position = { line: editorLine, ch: 0 };
    view.editor.setCursor(position);
    view.editor.scrollIntoView({ from: position, to: position }, true);
    view.editor.focus();
  }

  private async openRelated(target: string, casePath: string): Promise<void> {
    const linkText = normalizeWikiLink(target);
    try {
      await this.app.workspace.openLinkText(linkText, casePath, false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`无法打开关联文件：${message}`);
    }
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
      .setDesc("可选；留空时使用环境变量 TASKNOTES_API_URL 或本机默认地址。")
      .addText((text) =>
        text.setPlaceholder("http://127.0.0.1:18090").setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
          this.plugin.settings.apiUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );
    const environmentSetting = new Setting(containerEl)
      .setName("TaskNotes 环境变量（JSON）")
      .setDesc("填写 JSON 对象，值使用字符串。逐项合并到本次执行环境，保留未配置的现有变量，同名变量按 JSON 更新。");
    const environmentError = environmentSetting.descEl.createDiv({ attr: { role: "status" } });
    environmentSetting.addTextArea((text) => {
      text.inputEl.rows = 5;
      text.inputEl.cols = 38;
      text.inputEl.spellcheck = false;
      text.setPlaceholder('{\n  "TASKNOTES_API_TOKEN": "your-token"\n}')
        .setValue(this.plugin.settings.tasknotesEnv)
        .onChange(async (value) => {
          try {
            resolveTaskNotesAuth(value);
          } catch (error) {
            environmentError.setText(`${error instanceof Error ? error.message : "环境变量配置无效"} 尚未保存。`);
            return;
          }
          environmentError.setText("");
          this.plugin.settings.tasknotesEnv = value.trim() || "{}";
          await this.plugin.saveSettings();
        });
    });
  }
}

function createSection(
  container: HTMLElement,
  title: string,
  meta = "",
  className = ""
) {
  const section = container.createDiv({
    cls: `flowdesk-dashboard-section ${className}`.trim(),
  });
  const heading = section.createDiv({ cls: "flowdesk-contract-section-head" });
  heading.createDiv({ cls: "flowdesk-dashboard-section-title", text: title });
  if (meta) {
    heading.createDiv({ cls: "flowdesk-contract-section-meta", text: meta });
  }
  return section;
}

function diagnosticRow(container: HTMLElement, label: string, value: string) {
  const row = container.createDiv({ cls: "flowdesk-diagnostic-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}：` });
  row.createSpan({ text: value });
}

function observationField(container: HTMLElement, label: string, value: string) {
  const cell = container.createDiv({ cls: "flowdesk-observation-cell" });
  cell.createDiv({ cls: "flowdesk-summary-label", text: label });
  cell.createDiv({ cls: "flowdesk-observation-value", text: value });
}

function formatSemanticStatus(value: string): string {
  if (value === "valid") return "语义有效";
  if (value === "invalid") return "语义无效";
  // 判定层拆除后 producer 不再产结构化合同，事实以 TaskNotes 为准。
  // not_applicable 是常态，不显示状态文案。
  if (value === "not_applicable") return "";
  return "语义待确认";
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

function formatWorkCaseCommandError(error: unknown): string {
  const failure = error as Partial<ExecFileFailure>;
  const stderr = typeof failure.stderr === "string" ? failure.stderr.trim() : "";
  const stdout = typeof failure.stdout === "string" ? failure.stdout.trim() : "";
  const message = error instanceof Error ? error.message : String(error);
  return `Work Case snapshot 命令失败：${stderr || stdout || message}`;
}

function normalizeWikiLink(value: string): string {
  const match = value.trim().match(/^\[\[([^\]]+)\]\]$/);
  return (match?.[1] ?? value).split("|", 1)[0].trim();
}
