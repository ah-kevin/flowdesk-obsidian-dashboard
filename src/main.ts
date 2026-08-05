import {
  App,
  ItemView,
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
import type {
  ChildTask,
  EvidenceItem,
  ExecutionSnapshot,
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
      name: "Show dashboard for current TaskNotes task",
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
        const view = this.getDashboardView();
        if (view && this.isTaskFile(file)) {
          void view.loadTask(file.path);
          return;
        }
        view?.refreshActiveFileState();
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.getDashboardView()?.refreshActiveFileState();
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        const view = this.getDashboardView();
        if (view && file instanceof TFile && file.path === view.currentTaskPath) {
          void view.refreshCurrentTask();
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
    const flowdeskRoot = this.resolveFlowDeskRoot();
    const cli = path.join(flowdeskRoot, "bin", "flowdesk-execution-snapshot");
    const workingDirectory =
      expandHomePath(this.settings.workingDirectory.trim()) || flowdeskRoot;

    const args = [
      taskPath,
      "--working-directory",
      workingDirectory,
      "--schema",
      this.settings.schema.trim() || DEFAULT_SETTINGS.schema,
    ];
    args.push("--format", "json");
    const apiUrl = this.settings.apiUrl.trim();
    if (apiUrl) {
      args.splice(1, 0, "--api-url", apiUrl);
    }

    let stdout: string;
    try {
      const result = await execFileAsync(cli, args, {
        cwd: flowdeskRoot,
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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  isTaskFile(file: TFile | null): file is TFile {
    return Boolean(
      file &&
        file.extension === "md" &&
        (file.path.startsWith("Tasks/") || file.path.startsWith("TaskNotes/"))
    );
  }

  getActiveTaskPath(): string | null {
    const file = this.app.workspace.getActiveFile();
    return this.isTaskFile(file) ? file.path : null;
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
  private taskPath = "";
  private snapshot: ExecutionSnapshot | null = null;
  private error = "";
  private loading = false;
  private lastUpdatedAt = "";
  private queuedTaskPath: string | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: FlowDeskDashboardPlugin) {
    super(leaf);
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
    this.render();
  }

  get currentTaskPath(): string {
    return this.taskPath;
  }

  refreshActiveFileState() {
    this.render();
  }

  async loadTask(taskPath: string) {
    this.queuedTaskPath = taskPath;
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
    if (this.taskPath) {
      await this.loadTask(this.taskPath);
    }
  }

  private async drainRefreshQueue() {
    while (this.queuedTaskPath) {
      const taskPath = this.queuedTaskPath;
      this.queuedTaskPath = null;
      await this.loadTaskNow(taskPath);
    }
  }

  private async loadTaskNow(taskPath: string) {
    const previousTaskPath = this.taskPath;
    this.taskPath = taskPath;
    if (previousTaskPath !== taskPath) {
      this.snapshot = null;
      this.lastUpdatedAt = "";
    }
    this.loading = true;
    this.error = "";
    this.render();

    try {
      this.snapshot = await this.plugin.loadSnapshot(taskPath);
      this.lastUpdatedAt = formatTime(new Date());
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render() {
    const container = this.contentEl;
    container.empty();
    container.addClass("flowdesk-dashboard");

    this.renderHeader(container);

    if (this.isPinnedToPreviousTask()) {
      container.createDiv({
        cls: "flowdesk-pinned-note",
        text: "Pinned: 当前文件不是 TaskNotes task，面板显示的是上一次任务。",
      });
    }

    if (!this.taskPath) {
      container.createDiv({
        cls: "flowdesk-empty",
        text: "打开一个 Tasks/*.md 文件后，执行 FlowDesk Dashboard 命令。",
      });
      return;
    }

    if (this.loading && !this.snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "正在读取 snapshot..." });
      return;
    }

    if (this.error) {
      container.createDiv({ cls: "flowdesk-error", text: this.error });
      if (!this.snapshot) {
        return;
      }
    }

    if (!this.snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "尚未读取 snapshot。" });
      return;
    }

    if (this.loading) {
      container.createDiv({ cls: "flowdesk-refreshing", text: "正在刷新 snapshot..." });
    }

    this.renderSummary(container, this.snapshot);
    this.renderFlowGraph(container, this.snapshot);
    this.renderContract(container, this.snapshot);
    this.renderTasksOrEvidence(container, this.snapshot);
    this.renderNotepad(container, this.snapshot);
    this.renderNextActions(container, this.snapshot);
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
      text: this.taskPath || "No task selected",
    });
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-meta",
      text: this.lastUpdatedAt ? `上次刷新 ${this.lastUpdatedAt}` : "等待刷新",
    });

    const toolbar = header.createDiv({ cls: "flowdesk-dashboard-toolbar" });
    const refresh = toolbar.createEl("button", {
      cls: "flowdesk-refresh-button",
      text: this.loading ? "刷新中" : "刷新",
    });
    refresh.disabled = !this.taskPath || this.loading;
    refresh.title = "重新读取当前 TaskNotes task 的 FlowDesk snapshot";
    refresh.addEventListener("click", () => {
      void this.plugin.refreshDashboard(this.taskPath);
    });
  }

  private renderSummary(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "Summary（概览）");
    const grid = section.createDiv({ cls: "flowdesk-summary-grid" });
    const state = snapshot.state ?? {};
    const flow = snapshot.flow_graph ?? {};
    const parent = snapshot.task_graph?.parent ?? {};
    const counts = snapshot.task_graph?.counts ?? {};
    const contract = snapshot.spec_contract ?? {};
    const requirements = contract.requirements ?? {};
    const scenarios = contract.scenarios ?? {};
    const contractTasks = contract.tasks ?? {};
    const progress = computeProgress(snapshot);

    summaryRow(grid, "ready", "State", `${state.value ?? "unknown"}${state.read_only ? " (read-only)" : ""}`);
    summaryRow(grid, "ready", "Task", `${parent.title ?? ""} [${parent.status ?? ""}]`);
    summaryRow(grid, "ready", "Flow", `${flow.mode ?? ""} / ${flow.current || "none"}`);
    summaryRow(
      grid,
      "running",
      "Tasks",
      `${numberValue(counts.total)} total, ${numberValue(counts.ready)} ready, ${numberValue(counts.running)} running, ${numberValue(counts.blocked)} blocked, ${numberValue(counts.done)} done`
    );

    const progressRow = grid.createDiv({ cls: "flowdesk-summary-row" });
    progressRow.createSpan({
      cls: `flowdesk-status-dot flowdesk-status-${progress.status}`,
      text: "●",
    });
    progressRow.createSpan({ cls: "flowdesk-summary-label", text: "Progress:" });
    const progressWrap = progressRow.createSpan({ cls: "flowdesk-progress-wrap" });
    if (progress.total) {
      const bar = progressWrap.createSpan({ cls: "flowdesk-progress-bar" });
      bar.createSpan({ cls: "flowdesk-progress-fill" }).style.width = `${progress.percent}%`;
    }
    progressWrap.createSpan({
      text: progress.total
        ? `${progress.done}/${progress.total} ${progress.unit} (${progress.percent}% complete)`
        : "No progress data",
    });

    summaryRow(
      grid,
      "done",
      "Spec Contract",
      `${numberValue(requirements.count)} requirements, ${numberValue(scenarios.count)} scenarios, ${numberValue(contractTasks.count)} tasks`
    );

    if (state.blocked_reason) {
      summaryRow(grid, "blocked", "Blocked", state.blocked_reason);
    }
  }

  private renderFlowGraph(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "Graph（流程）");
    const list = section.createDiv({ cls: "flowdesk-flow-list" });
    const nodes = snapshot.flow_graph?.nodes ?? [];
    if (!nodes.length) {
      list.createDiv({ cls: "flowdesk-muted", text: "No flow nodes." });
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
        text: `[${status.toUpperCase()}] ${node.label ?? node.id ?? ""} (${formatFlowNodeId(node.id)})`,
      });
      if (node.missing_deps?.length) {
        body.createDiv({
          cls: "flowdesk-subline",
          text: `blocked by: ${formatIds(node.missing_deps)}`,
        });
      }
    }
  }

  private renderContract(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "Contract（契约）");
    const list = section.createDiv({ cls: "flowdesk-contract-list" });
    const contract = snapshot.spec_contract ?? {};
    contractRow(list, "Requirements", contract.requirements?.ids);
    contractRow(list, "Scenarios", contract.scenarios?.ids);
    contractRow(list, "Tasks", contract.tasks?.ids);

    const questions = contract.open_questions?.items ?? [];
    if (questions.length) {
      const row = list.createDiv();
      row.createDiv({ cls: "flowdesk-main-text", text: "Open Questions" });
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
    const section = createSection(container, "Task Evidence");
    const list = section.createDiv({ cls: "flowdesk-task-list" });

    for (const task of tasks) {
      const state = normalizeStatus(task.state);
      const row = list.createDiv({
        cls: `flowdesk-child-task flowdesk-task-state-${state}`,
      });
      row.createSpan({ cls: `flowdesk-status-dot flowdesk-status-${state}`, text: statusSymbol(state) });
      const body = row.createDiv({ cls: "flowdesk-row-body" });
      const title = body.createDiv({ cls: "flowdesk-task-title-row" });
      title.createSpan({ cls: "flowdesk-task-badge", text: "Task" });
      title.createSpan({
        cls: "flowdesk-main-text",
        text: `[${state.toUpperCase()}] ${task.title ?? ""}`,
      });
      if (task.id) {
        body.createDiv({ cls: "flowdesk-subline", text: `id: ${task.id}` });
      }
      if (task.covers?.length) {
        body.createDiv({ cls: "flowdesk-subline", text: `Covers: ${formatIds(task.covers)}` });
      }
      if (task.blocked_by?.length) {
        body.createDiv({ cls: "flowdesk-subline", text: `Blocked by: ${formatIds(task.blocked_by)}` });
      }
      if (task.covers_unresolved) {
        body.createDiv({ cls: "flowdesk-warning", text: task.limitation ?? "Task covers unresolved." });
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

  private isPinnedToPreviousTask(): boolean {
    return Boolean(this.taskPath && !this.plugin.getActiveTaskPath());
  }

  private renderTaskEvidence(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "Task Evidence");
    const list = section.createDiv({ cls: "flowdesk-evidence-list" });
    const evidence = snapshot.spec_contract?.evidence ?? {};

    evidenceRow(list, "Execution Result", evidence.execution_result);
    evidenceRow(list, "Verification Result", evidence.verification_result);
    evidenceRow(list, "Delivery Record", evidence.delivery_record);

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
        text: `Checklist: ${numberValue(checklist.checked)}/${numberValue(checklist.total)} checked`,
      });
      if (unchecked) {
        body.createDiv({
          cls: "flowdesk-warning",
          text: "提醒：仍有未勾选 checklist 项。",
        });
      }
    }
  }

  private renderNotepad(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "Notepad");
    const notepad = snapshot.notepad ?? {};
    if (!notepad.exists) {
      section.createDiv({ cls: "flowdesk-muted", text: "Notepad: missing" });
      return;
    }

    section.createDiv({
      cls: "flowdesk-main-text",
      text: "Notepad: present, non-authoritative",
    });
    const priority = (notepad.priority ?? "").trim();
    if (priority) {
      for (const line of priority.split("\n").slice(0, 5)) {
        section.createDiv({ cls: "flowdesk-subline", text: line });
      }
    }
  }

  private renderNextActions(container: HTMLElement, snapshot: ExecutionSnapshot) {
    const section = createSection(container, "Next Actions");
    const list = section.createDiv({ cls: "flowdesk-next-list" });
    const actions = snapshot.next_actions ?? [];
    if (!actions.length) {
      list.createDiv({ cls: "flowdesk-muted", text: "No next actions." });
      return;
    }

    for (const action of actions) {
      list.createDiv({
        cls: "flowdesk-next-action",
        text: `→ ${formatAction(action)}`,
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
      .setName("FlowDesk repo path")
      .setDesc("本地 FlowDesk-Plugin 仓库路径；symlink 安装时通常可以留空。")
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
      .setName("Working directory")
      .setDesc("传给 --working-directory，用于读取 .flowdesk/notepad.md；留空时使用 FlowDesk repo path。")
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
      .setName("Schema")
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
      .setName("TaskNotes API URL")
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

function summaryRow(container: HTMLElement, status: string, label: string, value: string) {
  const row = container.createDiv({ cls: "flowdesk-summary-row" });
  const normalized = normalizeStatus(status);
  row.createSpan({ cls: `flowdesk-status-dot flowdesk-status-${normalized}`, text: "●" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}:` });
  row.createSpan({ cls: "flowdesk-summary-value", text: value });
}

function contractRow(container: HTMLElement, label: string, ids?: string[]) {
  const row = container.createDiv();
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}: ` });
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
    text: `${label}: ${exists ? `present (${items.length} items)` : "missing"}`,
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

function computeProgress(snapshot: ExecutionSnapshot) {
  const counts = snapshot.task_graph?.counts ?? {};
  const nodes = snapshot.flow_graph?.nodes ?? [];
  const total = numberValue(counts.total);
  const done = numberValue(counts.done);
  const stageTotal = nodes.length;
  const stageDone = nodes.filter((node) => node.status === "done").length;
  const progressTotal = total || stageTotal;
  const progressDone = total ? done : stageDone;
  const percent = progressTotal ? Math.round((progressDone / progressTotal) * 100) : 0;
  return {
    done: progressDone,
    total: progressTotal,
    unit: total ? "tasks" : "stages",
    percent,
    status: percent >= 100 ? "done" : percent > 0 ? "running" : "blocked",
  };
}

function normalizeStatus(status: unknown): string {
  const value = String(status || "unknown").toLowerCase().replace(/_/g, "-");
  if (["done", "running", "ready", "blocked"].includes(value)) {
    return value;
  }
  return "blocked";
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
    return "none";
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return "none";
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

function formatAction(action: Record<string, unknown>): string {
  const kind = String(action.kind ?? "unknown");
  const fields = Object.entries(action)
    .filter(([key]) => key !== "kind")
    .map(([key, value]) => `${key}=${formatIds(value)}`);
  return fields.length ? `${kind} (${fields.join("; ")})` : kind;
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
