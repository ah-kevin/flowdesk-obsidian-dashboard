import {
  App,
  Component,
  ItemView,
  MarkdownRenderer,
  MarkdownView,
  Modal,
  parseLinktext,
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
  parseTaskNotesEnvironment,
  sanitizeTaskNotesSnapshot,
} from "./tasknotes-auth";
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
import { desktopTaskNotesRead } from "./tasknotes-desktop-http";
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
  type DashboardViewModel,
  type ExecutionSnapshot,
  type SnapshotBodySection,
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
import { createWorkCaseViewModel } from "./work-case-model";
import { locateTaskSource, resolveRelatedTarget, chooseTaskCase, type RelatedContext } from "./source-navigation";
import { RepositoryMarkdownOpener, type RepositoryOpenDependencies, type RepositoryOpenResult } from "./repository-open";
import { collectMarkdownLinkSources, renderedLinkSource } from "./markdown-link-source";
import { createCaseContent, type CaseContentObservation } from "./case-content";
import { resolveCore, type CoreMode, type CoreResolution } from "./core-resolution";
import { ReadingStateCache } from "./reading-state";
import { formatDisplayTime } from "./reading-presentation";
import { renderTaskOverview } from "./task-overview";
import { latestRecord } from "./task-overview";
import { createTaskCurrentProgress } from "./task-current-progress";
import { excerpt, firstParagraph } from "./reading-presentation";
import { DashboardActionsModal, DashboardContentModal, createReadOnlyTextModal } from "./dashboard-dialogs";

export const FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";

const execFileAsync = promisify(execFile);

interface FlowDeskDashboardSettings {
  coreMode?: CoreMode;
  flowdeskRoot: string;
  workingDirectory: string;
  apiUrl: string;
  tasknotesEnv: string;
}

const DEFAULT_SETTINGS: FlowDeskDashboardSettings = {
  coreMode: "installed",
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
  coreResolution: CoreResolution | null = null;
  private settingsRefresh: ReturnType<typeof setTimeout> | null = null;
  private readonly snapshotCores = new WeakMap<object,CoreResolution>();
  settings!: FlowDeskDashboardSettings;
  repositoryOpenDependencies: RepositoryOpenDependencies = {};

  openRepositoryMarkdown(absolutePath: string): Promise<RepositoryOpenResult> {
    return new RepositoryMarkdownOpener(this.repositoryOpenDependencies).open(absolutePath);
  }

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
      name: "显示当前 Task 或 Case",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = this.isTaskFile(file) || ["work-case", "session"].includes(this.workCaseType(file));
        if (checking) return canRun;
        if (!file || !canRun) {
          new Notice("请先打开一个 TaskNotes 任务或 Work Case。");
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
    if (this.settingsRefresh) clearTimeout(this.settingsRefresh);
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
    new Notice("请先打开一个 TaskNotes 任务或 Work Case。");
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
    const usedCore = this.coreResolution ? {...this.coreResolution,notices:[...this.coreResolution.notices]} : null;
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
      const snapshot=sanitizeTaskNotesSnapshot(JSON.parse(stdout) as ExecutionSnapshot, auth.token);
      if(snapshot&&typeof snapshot==="object"&&usedCore)this.snapshotCores.set(snapshot,usedCore);
      return snapshot;
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
    const usedCore = this.coreResolution ? {...this.coreResolution,notices:[...this.coreResolution.notices]} : null;
    let stdout: string;
    let resumeUnavailable = false;
    const execute = (args: string[]) => execFileAsync(invocation.executable, args, {
      ...createSnapshotExecutionOptions(invocation.cwd, signal), env: auth.env,
    });
    try {
      const result = await execute(invocation.args);stdout = result.stdout;
    } catch (error) {
      const failure = error as ExecFileFailure;
      if (failure.code !== 2 || !/^.*: error: unrecognized arguments: --resume-bundle\s*$/m.test(failure.stderr ?? "")) throw new Error(formatTaskNotesAuthError(formatWorkCaseCommandError(error), auth.token));
      // One read-only compatibility retry for this exact unsupported opt-in flag.
      try { const result = await execute(invocation.args.filter(arg => arg !== "--resume-bundle")); stdout = result.stdout; resumeUnavailable = true; }
      catch (retryError) { throw new Error(formatTaskNotesAuthError(formatWorkCaseCommandError(retryError), auth.token)); }
    }
    try {
      const snapshot = sanitizeTaskNotesSnapshot(JSON.parse(stdout) as Record<string, unknown>, auth.token);
      if (resumeUnavailable && Array.isArray(snapshot.diagnostics)) snapshot.diagnostics.push({code:"resume_bundle_unavailable",severity:"warning",path:"resume_bundle",message:"当前producer不支持恢复投影；默认schema1只读内容保留。"});
      if(snapshot&&typeof snapshot==="object"&&usedCore)this.snapshotCores.set(snapshot,usedCore);
      return snapshot;
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

  createWorkCaseSnapshotInvocation(casePath: string, includeResumeBundle = true): WorkCaseSnapshotInvocation {
    return buildWorkCaseSnapshotInvocation({
      flowdeskRoot: this.resolveFlowDeskRoot(),
      casePath,
      includeResumeBundle,
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
    return readTaskDetails({ taskPath, signal, auth, apiUrl: resolveTaskNotesApiUrl(this.settings.apiUrl, auth.env), transport: desktopTaskNotesRead });
  }

  async loadCaseContent(casePath: string, signal: AbortSignal): Promise<CaseContentObservation> {
    const file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof TFile) || file.path !== casePath) throw new Error("未找到准确Case原文");
    const details = await this.app.vault.cachedRead(file);
    if (signal.aborted) throw new Error("Case原文请求已取消");
    return createCaseContent(casePath, details, new Date().toISOString());
  }

  async loadSettings() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (!saved?.coreMode && saved?.flowdeskRoot?.trim()) this.settings.coreMode = "fixed";
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.coreResolution = null;
    if (this.settingsRefresh) clearTimeout(this.settingsRefresh);
    this.settingsRefresh = setTimeout(() => {
      this.settingsRefresh = null;
      void this.getDashboardView()?.settingsChanged();
    }, 350);
  }

  openDashboardSettings(): void { new DashboardSettingsModal(this.app, this).open(); }

  inspectCore(): CoreResolution { this.resolveFlowDeskRoot(); return this.coreResolution!; }

  snapshotCoreInfo(snapshot:unknown):CoreResolution|null {return snapshot&&typeof snapshot==="object"?this.snapshotCores.get(snapshot)??null:null;}

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
    this.coreResolution = null;
    this.coreResolution = resolveCore({
      mode: this.settings.coreMode ?? (this.settings.flowdeskRoot.trim() ? "fixed" : "installed"),
      fixedPath: expandHomePath(this.settings.flowdeskRoot.trim()),
      home: homedir(),
      workingDirectory: expandHomePath(this.settings.workingDirectory.trim()),
    });
    return this.coreResolution.root;
  }

  vaultRoot(): string { return this.resolveVaultRoot(); }

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
  private readonly readingState = new ReadingStateCache();
  private renderedResource = "";
  private renderGeneration = 0;
  private renderController=new AbortController();
  private markdownScope:Component|null=null;
  private pendingMarkdown: Promise<unknown>[] = [];
  private rendering = false;
  private readingInteraction = 0;
  private positionRestored = true;
  private lastRenderInteraction = 0;
  private readonly onReadingInteraction = (event:Event) => {if(event.isTrusted)this.readingInteraction++;};
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
  private navigationController: AbortController | null = null;
  private navigationOpening: {path:string;signal:AbortSignal} | null = null;
  private relatedTargetPanel: HTMLElement | null = null;
  private resourceModal:DashboardContentModal|null=null;

  private closeResourceModal():void {
    const modal=this.resourceModal;this.resourceModal=null;this.relatedTargetPanel=null;modal?.close();
  }

  private displayResourceModal<T extends DashboardContentModal>(modal:T):T {
    this.closeResourceModal();
    const close=modal.onClose.bind(modal);modal.onClose=()=>{close();if(this.resourceModal===modal){this.resourceModal=null;this.relatedTargetPanel=null;}};
    this.resourceModal=modal;modal.open();return modal;
  }

  private cancelNavigation(): void {
    this.navigationController?.abort();
    this.navigationController = null;
  }

  private clearRawTaskContent(cancelNavigation = true): void {
    if (cancelNavigation) this.cancelNavigation();
    this.rawContentGeneration += 1;
    this.rawContentController?.abort();
    this.rawContentController = null;
    this.rawTaskContent = null;
    this.rawContentLoading = false;
  }

  private async loadRawTaskContent(taskPath: string): Promise<void> {
    if (this.shell.context.kind !== "task" || !("resourcePath" in this.shell.context) || this.shell.context.resourcePath !== taskPath) return;
    this.rawContentController?.abort();
    const controller = new AbortController();
    this.rawContentController = controller;
    const generation = ++this.rawContentGeneration;
    this.rawContentLoading = true;
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


  constructor(leaf: WorkspaceLeaf, private plugin: FlowDeskDashboardPlugin) {
    super(leaf);
    this.taskAdapter = new FrozenTaskAdapter({
      shell: () => this.shell,
      loadSnapshot: (taskPath, signal) =>
        this.plugin.loadSnapshot(taskPath, signal),
      render: (container, state) => this.renderFrozenTask(container, state),
      requestRender: () => this.renderShell(),
      nowLabel: () => new Date().toISOString(),
    });
    this.caseAdapter = new WorkCaseAdapter({
      shell: () => this.shell,
      loadSnapshot: (casePath, signal) =>
        this.plugin.loadWorkCaseSnapshot(casePath, signal),
      loadCaseContent: (casePath, signal) => this.plugin.loadCaseContent(casePath, signal),
      coreForSnapshot: snapshot => this.plugin.snapshotCoreInfo(snapshot),
      render: (container, state) => this.renderWorkCase(container, state),
      requestRender: () => this.renderShell(),
      nowLabel: () => new Date().toISOString(),
    });
    this.caseRenderer = new WorkCaseDashboardRenderer({
      refresh: () => { this.cancelNavigation(); return this.caseAdapter.refresh(); },
      openTask: (taskPath, origin) => this.openTask(taskPath, origin),
      openCaseSource: (casePath, source) =>
        this.openCaseSource(casePath, source),
      openRelated: (target, casePath) => this.openRelated(target, casePath, undefined, true),
      copyText: (text) => navigator.clipboard.writeText(text),
      openTaskSource: (taskPath, source) => this.openSnapshotSource(taskPath, source, "恢复引用"),
      renderMarkdown: (text, element, sourcePath) => this.renderSourceMarkdown(text, element, sourcePath),
      openSettings: () => this.plugin.openDashboardSettings(),
      openActions: (title,actions)=>{this.displayResourceModal(new DashboardActionsModal(this.app,title,actions));},
      openContent: (title,render)=>{this.displayResourceModal(new DashboardContentModal(this.app,title,render));},
      editCase: casePath=>this.openCaseProperties(casePath),
      icon: setIcon,
    });
    this.shell = new ViewShellController([this.taskAdapter, this.caseAdapter]);
    for(const name of ["pointerdown","keydown","wheel"])this.contentEl.addEventListener(name,this.onReadingInteraction);
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
    this.closeResourceModal();
    this.renderGeneration++;
    this.clearRenderLifetime();
    for(const name of ["pointerdown","keydown","wheel"])this.contentEl.removeEventListener?.(name,this.onReadingInteraction);
    this.readingState.clear();
    this.clearRawTaskContent();
    this.cancelInitialSync?.();
    this.cancelInitialSync = null;
    this.shell.close();
    this.taskAdapter.close();
    this.pendingMarkdown=[];
    this.contentEl.empty();
  }

  async syncToActiveFile(file: TFile | null = this.app.workspace.getActiveFile()) {
    const nextContext = resolveViewShellContext(
      file?.path ?? null,
      this.previousTaskPath,
      this.plugin.workCaseType(file)
    );
    if (!("resourcePath" in nextContext) || nextContext.kind !== "task" || this.shell.context.kind !== "task" || !("resourcePath" in this.shell.context) || this.shell.context.resourcePath !== nextContext.resourcePath) this.clearRawTaskContent(!(this.navigationOpening && this.navigationOpening.path === file?.path && !this.navigationOpening.signal.aborted));
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

  async settingsChanged(): Promise<void> {
    this.clearRawTaskContent();
    if ("resourcePath" in this.shell.context) await this.shell.select(this.shell.context, {force:true});
    this.renderShell();
  }

  scheduleRefresh() {
    this.cancelNavigation();
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

  private clearRenderLifetime():void {
    this.renderController.abort();
    if(this.markdownScope)this.removeChild(this.markdownScope);
    this.markdownScope=null;
  }

  private renderShell() {
    const container = this.contentEl;
    const generation=++this.renderGeneration,interaction=this.readingInteraction;
    this.pendingMarkdown=[];this.rendering=true;
    this.readingState.capture(this.renderedResource, container, {position:this.positionRestored||interaction!==this.lastRenderInteraction});
    this.clearRenderLifetime();
    this.renderController=new AbortController();
    this.markdownScope=this.addChild(new Component());
    this.positionRestored=false;this.lastRenderInteraction=interaction;
    const nextResource="resourcePath" in this.shell.context ? `${this.shell.context.kind}:${this.shell.context.resourcePath}` : "";
    if(nextResource!==this.renderedResource)this.closeResourceModal();
    this.renderedResource=nextResource;
    container.empty();
    this.caseRenderer.reset(container);
    container.addClass("flowdesk-dashboard");
    try {
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
        text: "打开一个 TaskNotes 任务或 Work Case 以查看 Dashboard。",
      });
    }
    } finally {
      const resource=this.renderedResource;
      this.readingState.restore(resource,container,{position:false});
      this.rendering=false;
      const pending=[...this.pendingMarkdown];
      const restore=()=>{
        if(generation!==this.renderGeneration||resource!==this.renderedResource)return;
        if(interaction===this.readingInteraction)this.readingState.restore(resource,container,{disclosures:false});
        this.positionRestored=true;
      };
      if(!pending.length)restore();
      else void Promise.allSettled(pending).then(()=>{if(typeof requestAnimationFrame==="function")requestAnimationFrame(restore);else restore();});
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
      this.renderSettingsAction(container);
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
      this.renderSettingsAction(container);
      return;
    }
    const presentation = createDashboardPresentation(model);
    this.renderHeader(container, model, presentation);
    this.renderTrustStrip(container, presentation.trust, this.plugin.snapshotCoreInfo(snapshot));
    const overview = renderTaskOverview(container, model, {
      renderMarkdown: (text, element, taskId) => this.renderSourceMarkdown(text, element, taskId),
      openSource: (taskId, source, heading, text) => this.openSnapshotSource(taskId, source, heading, text),
    });
    if (presentation.primaryStatus.diagnostic) this.renderPrimaryDiagnostic(overview, presentation.primaryStatus, model.currentTask.title, model.currentTask.id);
    const navigation = container.createDiv({cls:"flowdesk-reading-navigation"});
    const read = navigation.createEl("button",{text:"阅读正文",attr:{"data-focus-key":"read-body"}});
    read.addEventListener("click",()=>{const target=this.contentEl.querySelector<HTMLElement>(".flowdesk-contract-summary");target?.scrollIntoView?.({block:"start",behavior:"smooth"});});
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

  private renderSettingsAction(container: HTMLElement): void {
    const settings = container.createEl("button", {cls:"flowdesk-open-settings",text:"打开 Dashboard 设置"});
    settings.addEventListener("click",()=>this.plugin.openDashboardSettings());
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
    const more=actions.createEl("button",{cls:"flowdesk-more-actions",text:"⋯",attr:{"aria-label":"更多操作","data-focus-key":"task-more"}});
    more.addEventListener("click",()=>this.displayResourceModal(new DashboardActionsModal(this.app,"更多操作",[
      {label:"复制交接上下文",run:()=>navigator.clipboard.writeText(this.taskHandoffText(model))},
      {label:"查看交接上下文",run:()=>{this.displayResourceModal(createReadOnlyTextModal(this.app,"交接上下文",this.taskHandoffText(model)));}},
      {label:"查看原文件",run:()=>this.openTask(model.currentTask.id)},
    ])));
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
    if(presentation.kind === "parent")badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.kindLabel });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.priority });
    if (model.currentTask.isBlocked) {
      badges.createSpan({ cls: "flowdesk-state-pill is-error", text: "存在阻塞" });
    }
    metaRow.createDiv({
      cls: "flowdesk-task-read-meta",
      text: `${this.loading ? "刷新中 · 上次读取" : "读取于"} ${formatDisplayTime(model.observation.loadedAt)}`,
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
      text: "当前文件是资料页；打开 Task 或 Case 可查看看板。",
    });
    card.createDiv({ cls: "flowdesk-subline", text: `当前文件：${context.activePath}` });
    if(context.previousTaskPath){
      const file=this.app.vault.getAbstractFileByPath(context.previousTaskPath);
      const available=file instanceof TFile && (this.plugin.isTaskFile(file)||["work-case","session"].includes(this.plugin.workCaseType(file)));
      const back=card.createEl("button",{cls:"flowdesk-return-resource",text:"← 返回工作看板",attr:{title:"回到刚才查看的任务或Case"}});back.disabled=!available;
      back.addEventListener("click",()=>{void this.openTask(context.previousTaskPath);});
      if(!available)card.createDiv({cls:"flowdesk-muted",text:"原 Task/Case 已不可定位，请从文件列表重新选择。"});
    }
  }

  private renderTrustStrip(
    container: HTMLElement,
    trust: DashboardTrustPresentation,
    core: CoreResolution | null
  ) {
    const strip = container.createEl("details", {
      cls: `flowdesk-trust-summary is-${trust.tone}`,
      attr: { title: trust.tooltip, "data-disclosure-key":"task-source" },
    });
    const summary=strip.createEl("summary");
    summary.createSpan({ cls: "flowdesk-trust-dot", attr: { "aria-hidden": "true" } });
    summary.createSpan({ cls: "flowdesk-trust-badge", text: trust.label });
    if(core)summary.createSpan({cls:"flowdesk-core-version",text:`Core ${core.version}`});
    strip.createSpan({ cls: "flowdesk-trust-source", text: trust.sourceLabel });
    strip.createSpan({
      cls: `flowdesk-trust-contract is-${trust.contractTone}`,
      text: trust.contractLabel,
    });
    strip.createDiv({cls:"flowdesk-muted",text:trust.tooltip});
    if(core)strip.createDiv({cls:"flowdesk-muted",text:`${core.source} · ${core.root}${core.notices.length?"\n"+core.notices.join("\n"):""}`});
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
      text: "需处理的问题",
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
    diagnosticRow(card, "原因", status.reason);
    diagnosticRow(card, "建议处理", status.remediation);
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

  private beginNavigation() {
    this.cancelNavigation();
    const controller = new AbortController();
    this.navigationController = controller;
    const context = this.shell.context;
    return { signal: controller.signal, current: () => !controller.signal.aborted && this.shell.context === context };
  }

  private async openNavigationFile(file: TFile, signal: AbortSignal): Promise<boolean> {
    const opening = {path:file.path,signal};this.navigationOpening = opening;
    try { await this.app.workspace.getLeaf(false).openFile(file); return true; }
    catch (error) { if (!signal.aborted) new Notice(`无法打开准确原文：${error instanceof Error ? error.message : String(error)}`); return false; }
    finally { if (this.navigationOpening === opening) this.navigationOpening = null; }
  }

  private async openSnapshotSource(taskPath: string, source?: SnapshotSource, sourceKind = "来源", text = ""): Promise<void> {
    if (!taskPath) { new Notice("producer未提供准确Task ID"); return; }
    if (!source) { await this.openTask(taskPath); return; }
    const request = this.beginNavigation();
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof TFile) || file.path !== taskPath) { new Notice(`未找到任务文件：${taskPath}`); return; }
    let apiDetails: string | null = null;
    let location: ReturnType<typeof locateTaskSource> = {kind:"note",reason:"来源无法核对；打开整张任务原文。"};
    try {
      const [api, fileText] = await Promise.all([this.plugin.loadTaskDetails(taskPath, request.signal), this.app.vault.cachedRead(file)]);
      apiDetails = api.details;
      location = locateTaskSource(fileText, api.details, {heading:sourceKind,level:2,text,source});
    } catch (error) { location = {kind:"note",reason:`来源核对失败：${error instanceof Error ? error.message : String(error)}；打开整张任务原文。`}; }
    if (!request.current()) return;
    if (!(await this.openNavigationFile(file, request.signal))) return;
    if (request.signal.aborted) return;
    if (location.kind === "note") { new Notice(location.reason); return; }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== taskPath || view.getMode?.() === "preview" || location.editorLine >= view.editor.lineCount()) { new Notice("任务已打开；当前视图不能确认精确位置，请查看原文。"); return; }
    if (apiDetails === null || typeof view.editor.getValue !== "function") { new Notice("当前编辑器不能核对原文；已打开整张任务。"); return; }
    location = locateTaskSource(view.editor.getValue(), apiDetails, {heading:sourceKind,level:2,text,source});
    if (location.kind === "note") { new Notice(location.reason); return; }
    const position = {line:location.editorLine,ch:0};
    view.editor.setCursor(position);view.editor.scrollIntoView({from:position,to:position},true);view.editor.focus();
  }

  private vaultLinkResolver(sourcePath: string): (linkText: string) => string | null {
    return linkText => {
      // A confirmed exact file keeps a literal # in its filename; only then parse subpaths.
      const candidates = [linkText, path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), linkText))];
      for (const candidate of candidates) {
        const file = this.app.vault.getAbstractFileByPath(candidate);
        if (file instanceof TFile && file.path === candidate) return file.path;
      }
      const {path:linkpath} = parseLinktext(linkText);
      return this.app.metadataCache.getFirstLinkpathDest?.(linkpath, sourcePath)?.path ?? null;
    };
  }

  private async renderSourceMarkdown(text: string, element: HTMLElement, sourcePath: string): Promise<void> {
    const modal=this.resourceModal?.contentEl.contains(element)?this.resourceModal:null;
    const signal=modal?.renderSignal??this.renderController.signal;
    const component=modal?.markdownScope??this.markdownScope??this;
    const sources = collectMarkdownLinkSources(text);
    let complete = false;
    // Capture remains installed before async render; source is checked for this occurrence.
    element.addEventListener("click", event => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !element.contains(anchor)) return;
      const href = anchor.getAttribute("data-href") || anchor.getAttribute("href");if (!href) return;
      const anchors = Array.from(element.querySelectorAll<HTMLAnchorElement>("a"));
      const origin = renderedLinkSource(sources, anchors.map(link => ({href:link.getAttribute("data-href") || link.getAttribute("href") || "",label:link.textContent ?? ""})), anchors.indexOf(anchor as HTMLAnchorElement), complete);
      if (origin === "wiki") return;
      const target = resolveRelatedTarget(href, {casePath:sourcePath,cwd:null,vaultRoot:this.plugin.vaultRoot(),resolveVaultLink:this.vaultLinkResolver(sourcePath)});
      const explicitFile = /^file:/i.test(href) || path.isAbsolute(href);
      const literalHashFile = target.kind === "vault" && target.exactFile === true && target.resolvedPath?.includes("#");
      if ((target.kind === "vault" && !explicitFile && !literalHashFile) || target.kind === "url") return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      void this.openRelated(href, sourcePath, origin === "markdown" ? undefined : "链接语法来源无法唯一核对；请查看原文或复制引用。");
    }, true);
    const rendered=(async()=>{
      await MarkdownRenderer.render(this.app, text, element, sourcePath, component);
      if(signal.aborted)return;
      for(const checkbox of Array.from(element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))){checkbox.disabled=true;checkbox.setAttribute("aria-readonly","true");}
      complete=true;
    })();
    if(this.rendering)this.pendingMarkdown.push(rendered);
    await rendered;
  }

  private async relatedContext(sourcePath: string, signal: AbortSignal): Promise<RelatedContext> {
    const vaultRoot = this.plugin.vaultRoot();
    if (!isTaskPath(sourcePath)) {
      const active = this.caseAdapter.getRenderState();
      if (active?.model?.source.path === sourcePath) return {casePath:sourcePath,cwd:active.model.workCase.cwd,vaultRoot};
      const model = createWorkCaseViewModel(await this.plugin.loadWorkCaseSnapshot(sourcePath, signal), sourcePath);
      return {casePath:sourcePath,cwd:model.workCase.cwd,vaultRoot};
    }
    const api = await this.plugin.loadTaskDetails(sourcePath, signal);
    const contexts = api.contexts ?? null;
    const candidates = contexts ? this.app.vault.getMarkdownFiles().filter(file => ["work-case","session"].includes(this.plugin.workCaseType(file)) && contexts.includes(`@${path.basename(file.path,".md")}`)) : [];
    const chosen = chooseTaskCase(contexts, candidates.map(file => ({path:file.path,contextTag:`@${path.basename(file.path,".md")}`,cwd:null})));
    if (!chosen.casePath) throw new Error(chosen.reason ?? "缺少唯一Case");
    const model = createWorkCaseViewModel(await this.plugin.loadWorkCaseSnapshot(chosen.casePath, signal), chosen.casePath);
    if (model.tasks.observationHealth !== "healthy" || !model.tasks.coverage.complete || !model.tasks.items.some(task => task.id === sourcePath)) throw new Error("Case关联读取不完整或未确认准确Task");
    const result = chooseTaskCase(contexts, [{path:chosen.casePath,contextTag:model.tasks.contextTag,cwd:model.workCase.cwd}]);
    if (!result.cwd) throw new Error(result.reason ?? "Case cwd不可用");
    return {casePath:chosen.casePath,cwd:result.cwd,vaultRoot};
  }

  private renderChildren(
    container: HTMLElement,
    model: DashboardViewModel,
    children: DashboardChildRowPresentation[]
  ) {
    const legacy = model.currentTask.trustLevel === "legacy_v3";
    const section = container.createDiv({ cls: "flowdesk-child-section" });
    const heading = section.createDiv({ cls: "flowdesk-section-heading" });
    heading.createDiv({
      cls: "flowdesk-dashboard-section-title",
      text: `直接子任务 · ${children.length}`,
    });
    heading.createDiv({
      cls: "flowdesk-section-meta",
      text: `${children.filter(child => !child.history).length} 项${legacy ? "未完成" : "未结束"}或状态未知`,
    });
    const list = section.createDiv({ cls: "flowdesk-child-list" });
    const historical = children.filter(child => child.history);
    let historyList: HTMLElement | null = null;
    if (historical.length) {
      const history = section.createEl("details", {cls: "flowdesk-task-history",attr:{"data-disclosure-key":"task-children-history"}});
      history.createEl("summary", {text: `${legacy ? "已完成" : "已结束"} · ${historical.length}`});
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
    const details = container.createDiv({cls:"flowdesk-contract-summary"});
    const heading=details.createDiv({cls:"flowdesk-dashboard-section-title flowdesk-content-heading"});const icon=heading.createSpan({cls:"flowdesk-content-icon"});setIcon(icon,"file-text");heading.createSpan({text:"任务详情"});heading.createSpan({cls:"flowdesk-content-caption",text:"说明 · 验收 · 结果"});
    const body = details.createDiv({ cls: "flowdesk-detail-body" });
    const technical=details.createEl("details",{cls:"flowdesk-task-technical",attr:{"data-disclosure-key":"task-technical"}});
    technical.createEl("summary",{text:diagnosticCount?`技术详情 · ${diagnosticCount} 项诊断`:"技术详情"});
    const renderedSections = new Map<DetailSection, HTMLElement>();
    const contract = body.createDiv({cls:"flowdesk-detail-section flowdesk-contract-reading"});
    renderedSections.set("contract", contract);
    new TaskContentRenderer({
      signal:this.renderController.signal,
      trackRender:promise=>{if(this.rendering)this.pendingMarkdown.push(promise);},
      renderMarkdown: (text, element, taskPath) => this.renderSourceMarkdown(text, element, taskPath),
      openSource: (taskPath, section) => this.openSnapshotSource(taskPath, section.source, section.heading, section.text),
    }).render(contract, model.content);

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
      if (section) (sectionName === "contract" ? body : technical).appendChild(section);
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

  private async openCaseSource(casePath: string, source: WorkCaseSourceRange): Promise<void> {
    const request = this.beginNavigation(), file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof TFile) || file.path !== casePath) { new Notice(`未找到Work Case文件：${casePath}`); return; }
    let text: string;
    try { text = await this.app.vault.cachedRead(file); }
    catch (error) {
      if (!request.current()) return;
      const opened = await this.openNavigationFile(file, request.signal);
      if (opened && !request.signal.aborted) new Notice(`Case来源读取失败，仅打开整张原文：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!request.current()) return;
    if (!(await this.openNavigationFile(file, request.signal))) return;
    if (request.signal.aborted) return;
    const lines = text.replace(/\r\n/g,"\n").split("\n");
    const model = this.caseAdapter.getRenderState()?.model;
    const blocks = model ? [...Object.values(model.sections).flat(), ...(model.current.raw ? [model.current.raw] : []), ...model.recentProgress] : [];
    const expected = blocks.find(block => block.source.lineStart === source.lineStart && block.source.lineEnd === source.lineEnd);
    const validRange = Number.isInteger(source.lineStart) && source.lineStart >= 1 && Number.isInteger(source.lineEnd) && source.lineEnd >= source.lineStart && source.lineEnd <= lines.length;
    const span = validRange ? lines.slice(source.lineStart - 1, source.lineEnd).join("\n") : "";
    if (!validRange || !expected || !span.includes(expected.text.replace(/\r\n/g,"\n"))) { new Notice("Case来源已变化或越界；已打开整张Case原文。"); return; }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== casePath || view.getMode?.() === "preview" || source.lineStart - 1 >= view.editor.lineCount()) { new Notice("Case已打开；当前视图无法确认精确位置。"); return; }
    const liveLines = view.editor.getValue().replace(/\r\n/g,"\n").split("\n");
    const liveSpan = liveLines.slice(source.lineStart - 1, source.lineEnd).join("\n");
    if (source.lineEnd > liveLines.length || (expected && !liveSpan.includes(expected.text.replace(/\r\n/g,"\n")))) { new Notice("Case编辑器原文已变化；不猜位置。"); return; }
    const position = {line:source.lineStart - 1,ch:0};view.editor.setCursor(position);view.editor.scrollIntoView({from:position,to:position},true);view.editor.focus();
  }

  private taskHandoffText(model:DashboardViewModel):string {
    const progress=createTaskCurrentProgress(model.content,{statusIsCompleted:model.currentTask.statusIsCompleted,observedAt:model.observation.generatedAt,observationHealthy:model.observation.isTrustworthy&&!model.observation.isStale&&!model.diagnostics.some(item=>/truncat|omitted|too_large/i.test(item.code))});
    const lines=["交接上下文（只读观测；继续前回读）",`准确 Task：${model.currentTask.id}`,`原状态：${model.currentTask.status}`,`目标：${excerpt(model.content.goal,450)}`,`观测时间：${model.observation.generatedAt}`];
    if(model.currentTask.statusIsCompleted===true){const result=latestRecord(model.content.records.execution);lines.push(`结果摘录：${result?excerpt(firstParagraph(result.text),650):"最近结果未确认，查看原文件"}`);}
    else {if(progress.progress)lines.push(`进展摘录：${excerpt(firstParagraph(progress.progress),650)}`);if(progress.next!==null)lines.push(`下一步摘录：${excerpt(progress.next,500)}`);}
    if(progress.gaps.length)lines.push(`缺口：${progress.gaps.join("；")}`);
    lines.push("材料不启动Task或授予接手权限。继续前回读最新TaskNotes与原文，明确未完成Next，已结束项不重做；换载体先保存进展并正常结束旧执行，释放未知时只读或回原owner。");return lines.join("\n");
  }

  private async openCaseProperties(casePath:string):Promise<void> {
    const file=this.app.vault.getAbstractFileByPath(casePath);
    if(!(file instanceof TFile)||file.path!==casePath||!["work-case","session"].includes(this.plugin.workCaseType(file))){new Notice("无法确认原Case文件，请从文件列表核对。");return;}
    await this.app.workspace.getLeaf(false).openFile(file,{active:true,state:{mode:"source"}});
    new Notice("在Case顶部属性中维护project、plans、docs和related；保存后看板会刷新。Dashboard不会代写这些属性。");
  }

  private async openRelated(raw: string, sourcePath: string, sourceError?: string, direct=false): Promise<void> {
    const request = this.beginNavigation();
    let context: RelatedContext = {casePath:sourcePath,cwd:null,vaultRoot:this.plugin.vaultRoot(),resolveVaultLink:this.vaultLinkResolver(sourcePath)};
    let target = sourceError ? {kind:"unavailable" as const,label:raw,reason:sourceError} : resolveRelatedTarget(raw, context);
    if ((target.kind === "unavailable" && target.reason.includes("cwd")) || (!isTaskPath(sourcePath) && target.kind === "repository")) {
      try { context = {...await this.relatedContext(sourcePath, request.signal),resolveVaultLink:this.vaultLinkResolver(sourcePath)}; target = resolveRelatedTarget(raw, context); }
      catch (error) { target = {kind:"unavailable",label:raw,reason:error instanceof Error ? error.message : String(error)}; }
    }
    if (!request.current()) return;
    if (target.kind === "url") { window.open(target.url, "_blank"); return; }
    if (target.kind === "vault") {
      const destination = target.resolvedPath ?? this.vaultLinkResolver(sourcePath)(target.linkText);
      const baseFile = destination ? this.app.vault.getAbstractFileByPath(destination) : null;
      if (!(baseFile instanceof TFile) || (target.exactFile && baseFile.path !== target.resolvedPath)) {
        target = {kind:"unavailable",label:target.label,reason:`未找到已确认的vault原文件：${target.linkText}；不会创建或改选同名笔记。`};
      } else if (baseFile.extension.toLowerCase() === "json") {
        // Classify the confirmed base file, not linkText whose subpath can hide the extension.
        const fragment = target.fragment ?? (target.exactFile ? undefined : parseLinktext(target.linkText).subpath || undefined);
        target = {...target,resolvedPath:baseFile.path,...(fragment ? {fragment} : {})};
      } else {
        const directFile = target.exactFile === true && (target.resolvedPath?.includes("#") || (target.resolvedPath && target.resolvedPath!==target.resolvedPath.trim()) || (target.fileUrl && (!target.fragment || target.resolvedPath?.includes("%"))));
        if (directFile) {
          await this.openNavigationFile(baseFile, request.signal);
          if (!target.fragment) return;
          // Literal #, percent or edge-whitespace filenames keep their exact TFile; fragment location remains unverified.
        } else {
          await this.app.workspace.openLinkText(target.linkText, sourcePath, false);return;
        }
      }
    }
    let firstOutcome:RepositoryOpenResult|null=null;
    if(direct&&target.kind==="repository"&&/\.md$/i.test(path.extname(target.absolutePath))){
      new Notice("正在打开文档…");
      try{firstOutcome=await this.plugin.openRepositoryMarkdown(target.absolutePath);}catch{firstOutcome={kind:"unknown",message:"打开结果未知；请核对原文件，不自动重试。"};}
      if(!request.current())return;
      if(firstOutcome.kind==="accepted"){new Notice(firstOutcome.message);return;}
    }
    const modal=this.displayResourceModal(new DashboardContentModal(this.app,"引用资料",()=>{}));
    const panel = modal.contentEl.createDiv({cls:"flowdesk-dashboard-section flowdesk-related-target"});this.relatedTargetPanel = panel;
    const isFileTarget = target.kind === "repository" || target.kind === "vault";
    const pathText = target.kind === "repository" ? target.absolutePath : target.kind === "vault" && target.resolvedPath ? path.join(context.vaultRoot,target.resolvedPath) : raw;
    panel.createDiv({cls:"flowdesk-dashboard-section-title",text:isFileTarget ? "引用资料" : "引用定位缺口"});
    panel.createDiv({cls:"flowdesk-muted",text:target.kind === "repository" ? `原文件：${pathText}；仓库引用：${target.repositoryPath}` : target.kind === "vault" ? `原文件：${pathText}` : target.reason});
    if ((target.kind === "repository" || target.kind === "vault") && target.fragment) panel.createDiv({cls:"flowdesk-muted",text:`文件可定位，章节未验证（${target.fragment}）；打开整文件，不猜章节位置。`});
    const copy = panel.createEl("button",{cls:"flowdesk-copy-related-path",text:isFileTarget ? "复制原文件路径" : "复制原引用"});
    copy.addEventListener("click",()=>{void navigator.clipboard.writeText(pathText);});
    if (isFileTarget) {
      const reference = panel.createEl("button",{cls:"flowdesk-copy-related-reference",text:"复制原引用"});
      reference.addEventListener("click",()=>{void navigator.clipboard.writeText(raw);});
    }
    if (target.kind === "repository" && /\.md$/i.test(path.extname(target.absolutePath))) {
      const documentPath = target.absolutePath;
      const result = panel.createDiv({cls:"flowdesk-repository-open-feedback",attr:{role:"status"},text:firstOutcome?.message??"点击后向 Obsidian 提交打开此原文件的请求。"});
      const openDocument = panel.createEl("button",{cls:"flowdesk-open-repository-document",text:"在 Obsidian 打开文档",attr:{"aria-label":"明确向指定Obsidian提交此Markdown原文件"}});
      openDocument.addEventListener("click",async()=>{
        if(openDocument.disabled)return;
        openDocument.disabled=true;result.setText("正在提交打开请求…");
        try { const outcome=await this.plugin.openRepositoryMarkdown(documentPath); result.setText(outcome.message); }
        catch { result.setText("打开请求结果未知；请核对原文件，保留复制路径，不自动重试。"); }
        finally { openDocument.disabled=false; }
      });
      const steps = `${pathText}\n在Obsidian命令面板选择 Open file from outside the vault…，选择此路径对应的原文件。`;
      panel.createDiv({cls:"flowdesk-muted",text:steps});
      const copySteps = panel.createEl("button",{text:"复制打开步骤"});copySteps.addEventListener("click",()=>{void navigator.clipboard.writeText(steps);});
    } else if (isFileTarget && /\.json$/i.test(path.extname(pathText))) {
      panel.createDiv({cls:"flowdesk-muted",text:"JSON资料仅提供准确路径与原引用；可通过关联的Markdown证据索引查看说明。"});
    }
  }

}

class DashboardSettingsModal extends Modal {
  private tab: FlowDeskDashboardSettingTab | null = null;
  constructor(app:App,private readonly plugin:FlowDeskDashboardPlugin){super(app);}
  onOpen():void {this.tab=new FlowDeskDashboardSettingTab(this.app,this.plugin);this.tab.containerEl=this.contentEl;this.tab.display();}
  onClose():void {this.tab?.hide();this.contentEl.empty();}
}

class FlowDeskDashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FlowDeskDashboardPlugin) {super(app, plugin);}
  display() {
    const {containerEl}=this;containerEl.empty();containerEl.createEl("h2",{text:"FlowDesk Dashboard"});
    new Setting(containerEl).setName("Core 来源").setDesc("跟随模式优先使用 Claude 安装登记，缺失时检查 Codex 缓存；固定模式使用指定路径。").addDropdown(dropdown=>dropdown
      .addOption("installed","跟随已安装 Core").addOption("fixed","固定路径")
      .setValue(this.plugin.settings.coreMode??(this.plugin.settings.flowdeskRoot?"fixed":"installed"))
      .onChange(async value=>{this.plugin.settings.coreMode=value as CoreMode;await this.plugin.saveSettings();this.display();}));
    const status=containerEl.createDiv({cls:"flowdesk-core-settings-status",attr:{role:"status"}});
    const inspect=()=>{
      status.empty();
      const heading=status.createDiv({cls:"flowdesk-core-status-head"});
      try {
        const core=this.plugin.inspectCore();heading.createSpan({cls:"flowdesk-core-version",text:`Core ${core.version}`});
        const recheck=heading.createEl("button",{cls:"flowdesk-core-recheck",text:"重新检查"});recheck.addEventListener("click",inspect);
        const source=status.createDiv({cls:"flowdesk-core-row"});source.createSpan({cls:"flowdesk-core-label",text:"来源"});source.createSpan({text:({fixed:"固定路径","claude-installed":"Claude 安装登记","codex-cache":"Codex 缓存"})[core.source]});
        const location=status.createDiv({cls:"flowdesk-core-row"});location.createSpan({cls:"flowdesk-core-label",text:"路径"});location.createSpan({cls:"flowdesk-core-path",text:core.root});
        for(const note of core.notices)status.createDiv({cls:"flowdesk-core-note",text:note});
      }catch(error){heading.createSpan({cls:"flowdesk-core-version",text:"Core 未确认"});status.createDiv({cls:"flowdesk-error",text:error instanceof Error?error.message:String(error)});const recheck=heading.createEl("button",{cls:"flowdesk-core-recheck",text:"重新检查"});recheck.addEventListener("click",inspect);}
    };
    inspect();
    new Setting(containerEl).setName("固定 Core 路径").setDesc("保留原路径；只有固定模式使用。需包含 Task 与 Case producer。").addText(text=>text
      .setPlaceholder("/Users/me/workspaces/flowdesk-plugin").setValue(this.plugin.settings.flowdeskRoot)
      .onChange(async value=>{this.plugin.settings.flowdeskRoot=value.trim();await this.plugin.saveSettings();}));
    new Setting(containerEl).setName("工作目录").setDesc("传给 Task snapshot 的 --working-directory；留空时使用所选 Core 路径。").addText(text=>text.setValue(this.plugin.settings.workingDirectory)
      .onChange(async value=>{this.plugin.settings.workingDirectory=value.trim();await this.plugin.saveSettings();}));
    new Setting(containerEl).setName("TaskNotes API 地址").setDesc("留空使用环境配置或本机默认地址。").addText(text=>text.setPlaceholder("http://127.0.0.1:18090").setValue(this.plugin.settings.apiUrl)
      .onChange(async value=>{this.plugin.settings.apiUrl=value.trim();await this.plugin.saveSettings();}));
    let tokenInput:HTMLInputElement|undefined,jsonInput:HTMLTextAreaElement|undefined;
    let configured:Record<string,string>={};try{configured=parseTaskNotesEnvironment(this.plugin.settings.tasknotesEnv);}catch{/* Advanced editor below can repair invalid saved configuration. */}
    const token=new Setting(containerEl).setName("TaskNotes token").setDesc("默认遮住，保存在既有环境变量配置中。有效设置保存后会自动刷新看板。");
    const tokenError=token.descEl.createDiv({attr:{role:"status"}});
    token.addText(text=>{
      tokenInput=text.inputEl;tokenInput.type="password";tokenInput.autocomplete="off";
      text.setPlaceholder("未配置").setValue(configured.TASKNOTES_API_TOKEN||configured.TASKNOTES_AUTH_TOKEN||"")
      .onChange(async value=>{try{
        const environment=parseTaskNotesEnvironment(this.plugin.settings.tasknotesEnv);
        environment.TASKNOTES_API_TOKEN=value;environment.TASKNOTES_AUTH_TOKEN="";
        const serialized=JSON.stringify(environment,null,2);resolveTaskNotesAuth(serialized,{});
        this.plugin.settings.tasknotesEnv=serialized;tokenError.setText("");if(jsonInput)jsonInput.value=serialized;await this.plugin.saveSettings();
      }catch(error){tokenError.setText(error instanceof Error?error.message:"token 尚未保存");}});
    });
    token.addExtraButton(button=>button.setIcon("eye").setTooltip("显示或遮住 token").onClick(()=>{if(tokenInput)tokenInput.type=tokenInput.type==="password"?"text":"password";}));
    const advanced=containerEl.createEl("details",{cls:"flowdesk-advanced-settings"});advanced.createEl("summary",{text:"高级环境变量 JSON"});
    const environmentSetting=new Setting(advanced).setName("TaskNotes 环境变量").setDesc("保留原有变量合并规则；展开后可查看并编辑全部配置。");
    const error=environmentSetting.descEl.createDiv({attr:{role:"status"}});
    environmentSetting.addTextArea(text=>{
      jsonInput=text.inputEl;jsonInput.rows=5;jsonInput.spellcheck=false;
      text.setValue(this.plugin.settings.tasknotesEnv).onChange(async value=>{try{
        resolveTaskNotesAuth(value);const environment=parseTaskNotesEnvironment(value);this.plugin.settings.tasknotesEnv=value.trim()||"{}";
        error.setText("");if(tokenInput)tokenInput.value=environment.TASKNOTES_API_TOKEN||environment.TASKNOTES_AUTH_TOKEN||"";
        await this.plugin.saveSettings();
      }catch(failure){error.setText(`${failure instanceof Error?failure.message:"环境配置无效"} 尚未保存。`);}});
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

function observationFirstLine(observation: TaskRawContentObservation | null): string { return observation?.error ? "" : observation?.details.split(/\r?\n/)[0] ?? ""; }
