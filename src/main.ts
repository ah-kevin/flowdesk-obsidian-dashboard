import {
  App,
  FileSystemAdapter,
  ItemView,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  setIcon,
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
  createSnapshotExecutionOptions,
  isCurrentSnapshotRequest,
  isTaskPath,
  registerInitialDashboardSync,
  resolveRefreshFailureDisplay,
  resolveSnapshotEnvelopeFailure,
  resolveDashboardContext,
  SnapshotRequestAbortCoordinator,
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
  buildReviewInvocation,
  canReviewEvidence,
  parseReviewCommandFailure,
  type ReviewDecision,
} from "./review-invocation";
import {
  createContractItemPresentation,
  createDashboardPresentation,
  createDiagnosticDisclosureKey,
  DisclosureStateCache,
  formatSnapshotCompatibilityError,
  formatTaskShellStatus,
  isActivationKey,
  reconcileDiagnosticDisclosureState,
  resolveDiagnosticDisclosureOpen,
  resolveDetailSectionOrder,
  resolveDisclosureState,
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
  createDerivedAcceptancePresentation,
  createStructuredEvidencePresentation,
  formatEvidenceSummary,
  getEvidenceDisplayState,
} from "./evidence-presentation";
import {
  createDashboardViewModel,
  resolveDiagnosticNavigation,
  type DashboardViewModel,
  type EvidenceHealth,
  type ExecutionSnapshot,
  type SnapshotContractItem,
  type SnapshotDiagnostic,
  type SnapshotSource,
} from "./snapshot-model";
import {
  taskNavigationNewLeaf,
  type TaskNavigationOrigin,
} from "./task-navigation";
import { resolveVaultPath } from "./vault-path";
import { formatDiagnosticClipboard } from "./diagnostic-clipboard";

export const FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";

const execFileAsync = promisify(execFile);

interface FlowDeskDashboardSettings {
  flowdeskRoot: string;
  workingDirectory: string;
  vaultPath: string;
  apiUrl: string;
}

const DEFAULT_SETTINGS: FlowDeskDashboardSettings = {
  flowdeskRoot: "",
  workingDirectory: "",
  vaultPath: "",
  apiUrl: "",
};

interface ExecFileFailure extends Error {
  code?: number | string;
  stderr?: string;
  stdout?: string;
}

class EvidenceReviewCommandError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "EvidenceReviewCommandError";
  }
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

  async loadSnapshot(
    taskPath: string,
    signal: AbortSignal
  ): Promise<ExecutionSnapshot> {
    const invocation = this.createSnapshotInvocation(taskPath, "json");
    let stdout: string;
    try {
      const result = await execFileAsync(invocation.executable, invocation.args, {
        ...createSnapshotExecutionOptions(invocation.cwd, signal),
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
        vaultPath: this.resolveEvidenceVaultPath(),
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

  async submitEvidenceReview(input: {
    taskPath: string;
    digest: string;
    decision: ReviewDecision;
    requirementUids: string[];
    note: string;
  }): Promise<void> {
    const invocation = buildReviewInvocation({
      flowdeskRoot: this.resolveFlowDeskRoot(),
      taskPath: input.taskPath,
      digest: input.digest,
      decision: input.decision,
      requirementUids: input.requirementUids,
      note: input.note,
      vaultPath: this.resolveEvidenceVaultPath(),
      apiUrl: this.settings.apiUrl.trim(),
    });
    try {
      await execFileAsync(invocation.executable, invocation.args, {
        cwd: invocation.cwd,
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
      });
    } catch (error) {
      const failure = parseReviewCommandFailure(error);
      throw new EvidenceReviewCommandError(failure.code, failure.message);
    }
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

  private resolveEvidenceVaultPath(): string {
    const adapter = this.app.vault.adapter;
    const adapterBasePath = adapter instanceof FileSystemAdapter
      ? adapter.getBasePath()
      : "";
    return resolveVaultPath({
      configuredPath: expandHomePath(this.settings.vaultPath.trim()),
      environmentPath: expandHomePath(process.env.OBSIDIAN_VAULT || ""),
      adapterBasePath,
    });
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
  private snapshotAbortCoordinator = new SnapshotRequestAbortCoordinator();
  private cancelInitialSync: (() => void) | null = null;
  private disclosureStateCache = new DisclosureStateCache(20);
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
    this.snapshotAbortCoordinator.cancel();
    this.disclosureStateCache.clear();
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
    this.snapshotAbortCoordinator.cancel();
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
      this.snapshotAbortCoordinator.cancel();
      this.disclosureState = this.disclosureStateCache.forTask(taskPath);
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
    const signal = this.snapshotAbortCoordinator.begin();
    this.loading = true;
    this.error = "";
    this.render();
    try {
      const snapshot = await this.plugin.loadSnapshot(request.taskPath, signal);
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
      this.snapshotAbortCoordinator.finish(signal);
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
    });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.kindLabel });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.priority });
    if (model.currentTask.isBlocked) {
      badges.createSpan({ cls: "flowdesk-state-pill is-error", text: "存在阻塞" });
    }
    metaRow.createDiv({
      cls: "flowdesk-task-read-meta",
      text: this.loading
        ? `正在刷新 · 上次读取 ${model.observation.loadedAt}`
        : `本地读取 ${model.observation.loadedAt}`,
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
    if (
      model &&
      canReviewEvidence({
        trustLevel: model.currentTask.trustLevel,
        reviewStatus: model.review.status,
        observationTrustworthy: model.observation.isTrustworthy,
        sourceIdentity: model.observation.sourceIdentity,
        sourceIdentityMatch: model.observation.sourceIdentityMatch,
        evidenceBundleDigest: model.review.evidenceBundleDigest,
        requirementUids: model.review.requirementUids,
      })
    ) {
      const review = toolbar.createEl("button", {
        cls: "flowdesk-toolbar-button flowdesk-review-button",
        attr: { "aria-label": "复核证据", title: "复核证据" },
      });
      setIcon(review, "clipboard-check");
      review.addEventListener("click", () => this.openEvidenceReview(model));
    }
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

  private openEvidenceReview(model: DashboardViewModel) {
    const digest = model.review.evidenceBundleDigest;
    if (!digest) {
      new Notice("当前 snapshot 没有可复核的 evidence bundle digest。");
      return;
    }
    new EvidenceReviewModal(this.app, async (decision, note) => {
      try {
        await this.plugin.submitEvidenceReview({
          taskPath: model.currentTask.id,
          digest,
          decision,
          requirementUids: model.review.requirementUids,
          note,
        });
        new Notice(decision === "approved" ? "复核已确认" : "已要求修改");
        await this.refreshCurrentTask();
      } catch (error) {
        const failure =
          error instanceof EvidenceReviewCommandError
            ? error
            : new EvidenceReviewCommandError(
                "review_request_rejected",
                error instanceof Error ? error.message : String(error)
              );
        if (failure.code === "review_conflict") {
          new Notice("证据已变化，已刷新 Dashboard；请复核最新结果。");
          await this.refreshCurrentTask();
          return;
        }
        new Notice(`复核失败：${failure.message}`);
      }
    }).open();
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
      text: status.tone === "healthy" ? "状态正常" : "需要处理",
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
    diagnosticRow(card, "建议", status.remediation);
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
      text: `${model.rollup.childrenTrustedDone}/${model.rollup.childrenTotal} 可信完成`,
    });
    const list = section.createDiv({ cls: "flowdesk-child-list" });
    for (const child of children) {
      const row = list.createDiv({
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
    summaryToggle.createSpan({ text: "当前任务合同与证据" });
    summaryToggle.createSpan({
      cls: "flowdesk-contract-diagnostic-count",
      text: `${diagnosticCount} 项诊断`,
    });
    const overview = details.createDiv({ cls: "flowdesk-contract-overview" });
    const goal = overview.createDiv({ cls: "flowdesk-contract-goal" });
    goal.createDiv({ cls: "flowdesk-summary-label", text: "目标" });
    goal.createDiv({ cls: "flowdesk-contract-goal-text", text: summary.goal });
    const metrics = overview.createDiv({ cls: "flowdesk-contract-metrics" });
    for (const metric of summary.metrics) {
      const item = metrics.createDiv({ cls: "flowdesk-contract-metric" });
      item.createDiv({ cls: "flowdesk-contract-metric-value", text: metric.value });
      item.createDiv({ cls: "flowdesk-contract-metric-label", text: metric.label });
    }

    const full = overview.createEl("details", { cls: "flowdesk-technical-details" });
    full.open = this.disclosureState.fullOpen;
    full.addEventListener("toggle", () => {
      this.disclosureState.fullOpen = full.open;
    });
    full.createEl("summary", { text: "合同与交付详情" });
    const body = full.createDiv({ cls: "flowdesk-detail-body" });
    const renderedSections = new Map<DetailSection, HTMLElement>();
    const contract = createSection(
      body,
      model.currentTask.trustLevel === "legacy_v3"
        ? "任务合同 v3"
        : "任务合同 v4",
      formatSemanticStatus(model.contract.semanticStatus)
    );
    renderedSections.set("contract", contract);
    scopeRow(contract, "包含", model.contract.scope.included);
    scopeRow(contract, "不包含", model.contract.scope.excluded);
    const contractMeta = contract.createDiv({ cls: "flowdesk-contract-chip-row" });
    contractMeta.createSpan({
      cls: "flowdesk-contract-chip",
      text: `REQ ${model.contract.requirements.length}`,
    });
    contractMeta.createSpan({
      cls: "flowdesk-contract-chip",
      text: `SCN ${model.contract.scenarios.length}`,
    });
    contractMeta.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.contract.scope.included.length && model.contract.scope.excluded.length
        ? "Scope 完整"
        : "Scope 待补充",
    });
    renderContractItems(
      contract,
      "需求详情",
      "requirement",
      model.contract.requirements,
      (source) => {
        void this.openSnapshotSource(model.currentTask.id, source, "需求");
      },
      this.disclosureState.requirementsOpen,
      (open) => {
        this.disclosureState.requirementsOpen = open;
      }
    );
    renderContractItems(
      contract,
      "场景详情",
      "scenario",
      model.contract.scenarios,
      (source) => {
        void this.openSnapshotSource(model.currentTask.id, source, "场景");
      },
      this.disclosureState.scenariosOpen,
      (open) => {
        this.disclosureState.scenariosOpen = open;
      }
    );
    const derivedAcceptance = model.acceptance.map((item) =>
      createDerivedAcceptancePresentation(item)
    );
    const acceptanceTotal = derivedAcceptance.length || model.contract.acceptance.length;
    const checkedAcceptance = derivedAcceptance.length
      ? derivedAcceptance.filter((item) => item.state === "done").length
      : model.contract.acceptance.filter((item) => item.checked === true).length;
    const acceptance = createSection(
      body,
      "验收标准",
      `${checkedAcceptance} / ${acceptanceTotal} 已通过`
    );
    renderedSections.set("acceptance", acceptance);
    if (!acceptanceTotal) {
      acceptance.createDiv({ cls: "flowdesk-muted", text: "producer 未提供验收项。" });
    } else {
      const progress = acceptance.createDiv({ cls: "flowdesk-acceptance-progress" });
      progress.createDiv({
        cls: "flowdesk-acceptance-progress-value",
        attr: {
          style: `width: ${Math.round(
            (checkedAcceptance / acceptanceTotal) * 100
          )}%`,
        },
      });
      const acceptanceGrid = acceptance.createDiv({
        cls: "flowdesk-acceptance-grid",
      });
      if (derivedAcceptance.length) {
        for (const item of derivedAcceptance) {
          const row = acceptanceGrid.createDiv({ cls: "flowdesk-acceptance-item" });
          row.createSpan({
            cls: item.state === "done"
              ? "flowdesk-acceptance-check is-checked"
              : "flowdesk-acceptance-check",
            text: item.state === "done" ? "✓" : "○",
          });
          const copy = row.createDiv({ cls: "flowdesk-acceptance-copy" });
          copy.createDiv({ text: `${item.uid} · ${item.label}` });
          copy.createDiv({
            cls: "flowdesk-acceptance-evidence",
            text: `${item.status} · ${item.evidence}`,
          });
        }
      } else {
        for (const item of model.contract.acceptance) {
          const row = acceptanceGrid.createDiv({ cls: "flowdesk-acceptance-item" });
          row.createSpan({
            cls: item.checked
              ? "flowdesk-acceptance-check is-checked"
              : "flowdesk-acceptance-check",
            text: item.checked ? "✓" : "○",
          });
          row.createSpan({ text: item.text ?? "未提供" });
        }
      }
    }
    const structuredEvidence = model.evidenceRequirements.map((requirement) =>
      createStructuredEvidencePresentation(requirement, model.review.status)
    );
    const validEvidence = structuredEvidence.length
      ? structuredEvidence.filter((item) => item.state === "done").length
      : Object.values(model.evidence).filter((health) => health === "valid").length;
    const evidenceTotal = structuredEvidence.length || 3;
    const evidence = createSection(
      body,
      "执行证据",
      validEvidence === evidenceTotal
        ? "全部有效"
        : `${validEvidence} / ${evidenceTotal} 有效`
    );
    renderedSections.set("evidence", evidence);
    const evidenceGrid = evidence.createDiv({ cls: "flowdesk-evidence-grid" });
    if (structuredEvidence.length) {
      for (const item of structuredEvidence) {
        structuredEvidenceItem(evidenceGrid, item);
      }
    } else {
      evidenceItem(evidenceGrid, "执行结果", model.evidence.execution);
      evidenceItem(evidenceGrid, "验证结果", model.evidence.verification);
      evidenceItem(evidenceGrid, "交付记录", model.evidence.delivery);
    }

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
      .getLeaf(taskNavigationNewLeaf(origin))
      .openFile(file);
  }
}

class EvidenceReviewModal extends Modal {
  private note = "";
  private submitted = false;

  constructor(
    app: App,
    private onSubmit: (decision: ReviewDecision, note: string) => Promise<void>
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("flowdesk-review-modal");
    contentEl.createEl("h2", { text: "复核结构化证据" });
    contentEl.createDiv({
      cls: "flowdesk-muted",
      text: "提交时会按当前 evidence bundle digest 做冲突检查。",
    });
    new Setting(contentEl)
      .setName("复核说明")
      .setDesc("可选；要求修改时建议说明原因。")
      .addTextArea((text) =>
        text.setPlaceholder("补充复核说明").onChange((value) => {
          this.note = value;
        })
      );
    new Setting(contentEl)
      .setClass("flowdesk-review-actions")
      .addButton((button) =>
        button.setButtonText("要求修改").onClick(() => {
          void this.submit("changes_requested");
        })
      )
      .addButton((button) =>
        button.setCta().setButtonText("复核确认").onClick(() => {
          void this.submit("approved");
        })
      );
  }

  onClose() {
    this.contentEl.empty();
  }

  private async submit(decision: ReviewDecision) {
    if (this.submitted) return;
    this.submitted = true;
    this.close();
    await this.onSubmit(decision, this.note.trim());
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
      .setName("Evidence Vault 路径")
      .setDesc("留空时依次使用 OBSIDIAN_VAULT 和当前 Obsidian 本地 Vault。")
      .addText((text) =>
        text.setPlaceholder("/Users/me/Documents/Vault").setValue(this.plugin.settings.vaultPath).onChange(async (value) => {
          this.plugin.settings.vaultPath = value.trim();
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

function scopeRow(container: HTMLElement, label: string, values: string[]) {
  const row = container.createDiv({ cls: "flowdesk-contract-scope-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: label });
  row.createSpan({ text: values.length ? values.join("、") : "无" });
}

function renderContractItems(
  container: HTMLElement,
  label: string,
  kind: "requirement" | "scenario",
  items: SnapshotContractItem[],
  openSource: (source?: SnapshotSource) => void,
  open: boolean,
  onToggle: (open: boolean) => void
) {
  const section = container.createEl("details", {
    cls: "flowdesk-contract-item-details",
  });
  section.open = open;
  section.addEventListener("toggle", () => onToggle(section.open));
  const summary = section.createEl("summary");
  summary.createSpan({ text: label });
  summary.createSpan({
    cls: "flowdesk-contract-item-count",
    text: `${items.length} 条`,
  });
  if (!items.length) {
    section.createDiv({ cls: "flowdesk-muted", text: "无" });
    return;
  }
  const list = section.createDiv({ cls: "flowdesk-contract-item-list" });
  for (const item of items) {
    const presentation = createContractItemPresentation(item, kind);
    const row = list.createDiv({ cls: "flowdesk-contract-item" });
    const header = row.createDiv({ cls: "flowdesk-contract-item-head" });
    header.createSpan({
      cls: "flowdesk-contract-item-id",
      text: presentation.id,
    });
    for (const requirementId of presentation.requirementIds) {
      header.createSpan({
        cls: "flowdesk-contract-requirement-ref",
        text: requirementId,
      });
    }
    const source = header.createEl("button", {
      cls: "flowdesk-contract-item-source",
      text: `${presentation.sourceLabel} ↗`,
      attr: { "aria-label": `打开来源：${presentation.sourceLabel}` },
    });
    source.addEventListener("click", () => openSource(item.source));
    if (presentation.steps) {
      const steps = row.createDiv({ cls: "flowdesk-scenario-steps" });
      scenarioStep(steps, "Given", presentation.steps.given);
      scenarioStep(steps, "When", presentation.steps.when);
      scenarioStep(steps, "Then", presentation.steps.then);
    } else {
      row.createDiv({
        cls: "flowdesk-contract-item-text",
        text: presentation.text,
      });
    }
  }
}

function scenarioStep(container: HTMLElement, label: string, value: string) {
  container.createSpan({ cls: "flowdesk-scenario-step-label", text: label });
  container.createSpan({ text: value });
}

function diagnosticRow(container: HTMLElement, label: string, value: string) {
  const row = container.createDiv({ cls: "flowdesk-diagnostic-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}：` });
  row.createSpan({ text: value });
}

function evidenceItem(container: HTMLElement, label: string, health: EvidenceHealth) {
  const state = getEvidenceDisplayState(health);
  const item = container.createDiv({ cls: "flowdesk-evidence-item" });
  item.createDiv({
    cls: `flowdesk-evidence-title is-${state}`,
    text: `${statusSymbol(state)} ${label}`,
  });
  item.createDiv({
    cls: "flowdesk-evidence-summary",
    text: formatEvidenceSummary(label, health).split("：").pop() || "未知",
  });
}

function structuredEvidenceItem(
  container: HTMLElement,
  presentation: ReturnType<typeof createStructuredEvidencePresentation>
) {
  const item = container.createDiv({ cls: "flowdesk-evidence-item" });
  item.createDiv({
    cls: `flowdesk-evidence-title is-${presentation.state}`,
    text: `${statusSymbol(presentation.state)} ${presentation.uid}`,
  });
  item.createDiv({
    cls: "flowdesk-evidence-summary",
    text: presentation.status,
  });
  const details = item.createDiv({ cls: "flowdesk-evidence-fields" });
  diagnosticRow(details, "方法", presentation.method);
  diagnosticRow(details, "预期", presentation.expected);
  diagnosticRow(details, "实际", presentation.actual);
  diagnosticRow(details, "来源", presentation.provenance);
  diagnosticRow(details, "复核", presentation.review);
}

function observationField(container: HTMLElement, label: string, value: string) {
  const cell = container.createDiv({ cls: "flowdesk-observation-cell" });
  cell.createDiv({ cls: "flowdesk-summary-label", text: label });
  cell.createDiv({ cls: "flowdesk-observation-value", text: value });
}

function formatSemanticStatus(value: string): string {
  if (value === "valid") return "语义有效";
  if (value === "invalid") return "语义无效";
  return "语义待确认";
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
