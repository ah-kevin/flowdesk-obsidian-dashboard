"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  FLOWDESK_DASHBOARD_VIEW_TYPE: () => FLOWDESK_DASHBOARD_VIEW_TYPE,
  default: () => FlowDeskDashboardPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_child_process = require("child_process");
var import_fs = require("fs");
var import_os = require("os");
var path = __toESM(require("path"));
var import_util = require("util");
var FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
var MAX_SNAPSHOT_BUFFER = 8 * 1024 * 1024;
var DEFAULT_SETTINGS = {
  flowdeskRoot: "",
  workingDirectory: "",
  schema: "sdd-poc",
  apiUrl: ""
};
var FlowDeskDashboardPlugin = class extends import_obsidian.Plugin {
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
          new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Tasks/*.md \u4EFB\u52A1\u6587\u4EF6\u3002");
          return false;
        }
        void this.refreshDashboard();
        return true;
      }
    });
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        const view = this.getDashboardView();
        if (view && this.isTaskFile(file)) {
          void view.loadTask(file.path);
          return;
        }
        view == null ? void 0 : view.refreshActiveFileState();
      })
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        var _a;
        (_a = this.getDashboardView()) == null ? void 0 : _a.refreshActiveFileState();
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        const view = this.getDashboardView();
        if (view && file instanceof import_obsidian.TFile && file.path === view.currentTaskPath) {
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
      new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Tasks/*.md \u4EFB\u52A1\u6587\u4EF6\u3002");
      return;
    }
    await this.activateDashboard(taskPath);
  }
  async activateDashboard(taskPath) {
    var _a;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = (_a = workspace.getRightLeaf(false)) != null ? _a : workspace.getLeaf(true);
      await leaf.setViewState({
        type: FLOWDESK_DASHBOARD_VIEW_TYPE,
        active: true
      });
    }
    const view = leaf.view;
    if (view instanceof FlowDeskDashboardView) {
      await view.loadTask(taskPath);
    }
    workspace.revealLeaf(leaf);
  }
  getDashboardView() {
    const leaf = this.app.workspace.getLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE)[0];
    return (leaf == null ? void 0 : leaf.view) instanceof FlowDeskDashboardView ? leaf.view : null;
  }
  async loadSnapshot(taskPath) {
    const flowdeskRoot = this.resolveFlowDeskRoot();
    const cli = path.join(flowdeskRoot, "bin", "flowdesk-execution-snapshot");
    const workingDirectory = expandHomePath(this.settings.workingDirectory.trim()) || flowdeskRoot;
    const args = [
      taskPath,
      "--working-directory",
      workingDirectory,
      "--schema",
      this.settings.schema.trim() || DEFAULT_SETTINGS.schema
    ];
    args.push("--format", "json");
    const apiUrl = this.settings.apiUrl.trim();
    if (apiUrl) {
      args.splice(1, 0, "--api-url", apiUrl);
    }
    let stdout;
    try {
      const result = await execFileAsync(cli, args, {
        cwd: flowdeskRoot,
        maxBuffer: MAX_SNAPSHOT_BUFFER
      });
      stdout = result.stdout;
    } catch (error) {
      throw new Error(formatSnapshotCommandError(error));
    }
    try {
      return JSON.parse(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Snapshot JSON \u89E3\u6790\u5931\u8D25\uFF1A${message}`);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  isTaskFile(file) {
    return Boolean(
      file && file.extension === "md" && (file.path.startsWith("Tasks/") || file.path.startsWith("TaskNotes/"))
    );
  }
  getActiveTaskPath() {
    const file = this.app.workspace.getActiveFile();
    return this.isTaskFile(file) ? file.path : null;
  }
  resolveFlowDeskRoot() {
    const candidates = [
      expandHomePath(this.settings.flowdeskRoot.trim()),
      expandHomePath(process.env.FLOWDESK_PLUGIN_ROOT || ""),
      path.resolve(__dirname, "..", "..")
    ].filter(Boolean);
    for (const candidate of candidates) {
      const cli = path.join(candidate, "bin", "flowdesk-execution-snapshot");
      if ((0, import_fs.existsSync)(cli)) {
        return candidate;
      }
    }
    throw new Error("\u672A\u627E\u5230 FlowDesk \u4ED3\u5E93\u8DEF\u5F84\uFF0C\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u914D\u7F6E FlowDesk repo path\u3002");
  }
};
function expandHomePath(value) {
  if (value === "~") {
    return (0, import_os.homedir)();
  }
  if (value.startsWith("~/")) {
    return path.join((0, import_os.homedir)(), value.slice(2));
  }
  return value;
}
var FlowDeskDashboardView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.taskPath = "";
    this.snapshot = null;
    this.error = "";
    this.loading = false;
    this.lastUpdatedAt = "";
    this.queuedTaskPath = null;
    this.refreshPromise = null;
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
    this.render();
  }
  get currentTaskPath() {
    return this.taskPath;
  }
  refreshActiveFileState() {
    this.render();
  }
  async loadTask(taskPath) {
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
  async drainRefreshQueue() {
    while (this.queuedTaskPath) {
      const taskPath = this.queuedTaskPath;
      this.queuedTaskPath = null;
      await this.loadTaskNow(taskPath);
    }
  }
  async loadTaskNow(taskPath) {
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
      this.lastUpdatedAt = formatTime(/* @__PURE__ */ new Date());
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.render();
    }
  }
  render() {
    const container = this.contentEl;
    container.empty();
    container.addClass("flowdesk-dashboard");
    this.renderHeader(container);
    if (this.isPinnedToPreviousTask()) {
      container.createDiv({
        cls: "flowdesk-pinned-note",
        text: "Pinned: \u5F53\u524D\u6587\u4EF6\u4E0D\u662F TaskNotes task\uFF0C\u9762\u677F\u663E\u793A\u7684\u662F\u4E0A\u4E00\u6B21\u4EFB\u52A1\u3002"
      });
    }
    if (!this.taskPath) {
      container.createDiv({
        cls: "flowdesk-empty",
        text: "\u6253\u5F00\u4E00\u4E2A Tasks/*.md \u6587\u4EF6\u540E\uFF0C\u6267\u884C FlowDesk Dashboard \u547D\u4EE4\u3002"
      });
      return;
    }
    if (this.loading && !this.snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "\u6B63\u5728\u8BFB\u53D6 snapshot..." });
      return;
    }
    if (this.error) {
      container.createDiv({ cls: "flowdesk-error", text: this.error });
      if (!this.snapshot) {
        return;
      }
    }
    if (!this.snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "\u5C1A\u672A\u8BFB\u53D6 snapshot\u3002" });
      return;
    }
    if (this.loading) {
      container.createDiv({ cls: "flowdesk-refreshing", text: "\u6B63\u5728\u5237\u65B0 snapshot..." });
    }
    this.renderSummary(container, this.snapshot);
    this.renderFlowGraph(container, this.snapshot);
    this.renderContract(container, this.snapshot);
    this.renderTasksOrEvidence(container, this.snapshot);
    this.renderNotepad(container, this.snapshot);
    this.renderNextActions(container, this.snapshot);
  }
  renderHeader(container) {
    const header = container.createDiv({ cls: "flowdesk-dashboard-header" });
    const titleBlock = header.createDiv();
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-title",
      text: "FlowDesk Execution Dashboard"
    });
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-path",
      text: this.taskPath || "No task selected"
    });
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-meta",
      text: this.lastUpdatedAt ? `\u4E0A\u6B21\u5237\u65B0 ${this.lastUpdatedAt}` : "\u7B49\u5F85\u5237\u65B0"
    });
    const toolbar = header.createDiv({ cls: "flowdesk-dashboard-toolbar" });
    const refresh = toolbar.createEl("button", {
      cls: "flowdesk-refresh-button",
      text: this.loading ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0"
    });
    refresh.disabled = !this.taskPath || this.loading;
    refresh.title = "\u91CD\u65B0\u8BFB\u53D6\u5F53\u524D TaskNotes task \u7684 FlowDesk snapshot";
    refresh.addEventListener("click", () => {
      void this.plugin.refreshDashboard(this.taskPath);
    });
  }
  renderSummary(container, snapshot) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    const section = createSection(container, "Summary\uFF08\u6982\u89C8\uFF09");
    const grid = section.createDiv({ cls: "flowdesk-summary-grid" });
    const state = (_a = snapshot.state) != null ? _a : {};
    const flow = (_b = snapshot.flow_graph) != null ? _b : {};
    const parent = (_d = (_c = snapshot.task_graph) == null ? void 0 : _c.parent) != null ? _d : {};
    const counts = (_f = (_e = snapshot.task_graph) == null ? void 0 : _e.counts) != null ? _f : {};
    const contract = (_g = snapshot.spec_contract) != null ? _g : {};
    const requirements = (_h = contract.requirements) != null ? _h : {};
    const scenarios = (_i = contract.scenarios) != null ? _i : {};
    const contractTasks = (_j = contract.tasks) != null ? _j : {};
    const progress = computeProgress(snapshot);
    summaryRow(grid, "ready", "State", `${(_k = state.value) != null ? _k : "unknown"}${state.read_only ? " (read-only)" : ""}`);
    summaryRow(grid, "ready", "Task", `${(_l = parent.title) != null ? _l : ""} [${(_m = parent.status) != null ? _m : ""}]`);
    summaryRow(grid, "ready", "Flow", `${(_n = flow.mode) != null ? _n : ""} / ${flow.current || "none"}`);
    summaryRow(
      grid,
      "running",
      "Tasks",
      `${numberValue(counts.total)} total, ${numberValue(counts.ready)} ready, ${numberValue(counts.running)} running, ${numberValue(counts.blocked)} blocked, ${numberValue(counts.done)} done`
    );
    const progressRow = grid.createDiv({ cls: "flowdesk-summary-row" });
    progressRow.createSpan({
      cls: `flowdesk-status-dot flowdesk-status-${progress.status}`,
      text: "\u25CF"
    });
    progressRow.createSpan({ cls: "flowdesk-summary-label", text: "Progress:" });
    const progressWrap = progressRow.createSpan({ cls: "flowdesk-progress-wrap" });
    if (progress.total) {
      const bar = progressWrap.createSpan({ cls: "flowdesk-progress-bar" });
      bar.createSpan({ cls: "flowdesk-progress-fill" }).style.width = `${progress.percent}%`;
    }
    progressWrap.createSpan({
      text: progress.total ? `${progress.done}/${progress.total} ${progress.unit} (${progress.percent}% complete)` : "No progress data"
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
  renderFlowGraph(container, snapshot) {
    var _a, _b, _c, _d, _e;
    const section = createSection(container, "Graph\uFF08\u6D41\u7A0B\uFF09");
    const list = section.createDiv({ cls: "flowdesk-flow-list" });
    const nodes = (_b = (_a = snapshot.flow_graph) == null ? void 0 : _a.nodes) != null ? _b : [];
    if (!nodes.length) {
      list.createDiv({ cls: "flowdesk-muted", text: "No flow nodes." });
      return;
    }
    for (const node of nodes) {
      const status = normalizeStatus(node.status);
      const row = list.createDiv({
        cls: `flowdesk-flow-row flowdesk-task-state-${status}`
      });
      row.createSpan({ cls: `flowdesk-status-dot flowdesk-status-${status}`, text: statusSymbol(status) });
      const body = row.createDiv({ cls: "flowdesk-row-body" });
      body.createDiv({
        cls: "flowdesk-main-text",
        text: `[${status.toUpperCase()}] ${(_d = (_c = node.label) != null ? _c : node.id) != null ? _d : ""} (${formatFlowNodeId(node.id)})`
      });
      if ((_e = node.missing_deps) == null ? void 0 : _e.length) {
        body.createDiv({
          cls: "flowdesk-subline",
          text: `blocked by: ${formatIds(node.missing_deps)}`
        });
      }
    }
  }
  renderContract(container, snapshot) {
    var _a, _b, _c, _d, _e, _f;
    const section = createSection(container, "Contract\uFF08\u5951\u7EA6\uFF09");
    const list = section.createDiv({ cls: "flowdesk-contract-list" });
    const contract = (_a = snapshot.spec_contract) != null ? _a : {};
    contractRow(list, "Requirements", (_b = contract.requirements) == null ? void 0 : _b.ids);
    contractRow(list, "Scenarios", (_c = contract.scenarios) == null ? void 0 : _c.ids);
    contractRow(list, "Tasks", (_d = contract.tasks) == null ? void 0 : _d.ids);
    const questions = (_f = (_e = contract.open_questions) == null ? void 0 : _e.items) != null ? _f : [];
    if (questions.length) {
      const row = list.createDiv();
      row.createDiv({ cls: "flowdesk-main-text", text: "Open Questions" });
      for (const question of questions) {
        row.createDiv({ cls: "flowdesk-subline", text: `- ${question}` });
      }
    }
  }
  renderTasksOrEvidence(container, snapshot) {
    var _a, _b;
    const tasks = (_b = (_a = snapshot.task_graph) == null ? void 0 : _a.tasks) != null ? _b : [];
    if (tasks.length) {
      this.renderChildTasks(container, tasks);
      return;
    }
    this.renderTaskEvidence(container, snapshot);
  }
  renderChildTasks(container, tasks) {
    var _a, _b, _c, _d;
    const section = createSection(container, "Task Evidence");
    const list = section.createDiv({ cls: "flowdesk-task-list" });
    for (const task of tasks) {
      const state = normalizeStatus(task.state);
      const row = list.createDiv({
        cls: `flowdesk-child-task flowdesk-task-state-${state}`
      });
      row.createSpan({ cls: `flowdesk-status-dot flowdesk-status-${state}`, text: statusSymbol(state) });
      const body = row.createDiv({ cls: "flowdesk-row-body" });
      const title = body.createDiv({ cls: "flowdesk-task-title-row" });
      title.createSpan({ cls: "flowdesk-task-badge", text: "Task" });
      title.createSpan({
        cls: "flowdesk-main-text",
        text: `[${state.toUpperCase()}] ${(_a = task.title) != null ? _a : ""}`
      });
      if (task.id) {
        body.createDiv({ cls: "flowdesk-subline", text: `id: ${task.id}` });
      }
      if ((_b = task.covers) == null ? void 0 : _b.length) {
        body.createDiv({ cls: "flowdesk-subline", text: `Covers: ${formatIds(task.covers)}` });
      }
      if ((_c = task.blocked_by) == null ? void 0 : _c.length) {
        body.createDiv({ cls: "flowdesk-subline", text: `Blocked by: ${formatIds(task.blocked_by)}` });
      }
      if (task.covers_unresolved) {
        body.createDiv({ cls: "flowdesk-warning", text: (_d = task.limitation) != null ? _d : "Task covers unresolved." });
      }
      if (task.id) {
        const openButton = row.createEl("button", {
          cls: "flowdesk-task-open-button",
          text: "\u6253\u5F00"
        });
        openButton.title = `\u6253\u5F00 ${task.id}`;
        openButton.addEventListener("click", () => {
          void this.openTask(task.id);
        });
      }
    }
  }
  async openTask(taskPath) {
    if (!taskPath) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice(`\u672A\u627E\u5230\u4EFB\u52A1\u6587\u4EF6\uFF1A${taskPath}`);
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  isPinnedToPreviousTask() {
    return Boolean(this.taskPath && !this.plugin.getActiveTaskPath());
  }
  renderTaskEvidence(container, snapshot) {
    var _a, _b, _c;
    const section = createSection(container, "Task Evidence");
    const list = section.createDiv({ cls: "flowdesk-evidence-list" });
    const evidence = (_b = (_a = snapshot.spec_contract) == null ? void 0 : _a.evidence) != null ? _b : {};
    evidenceRow(list, "Execution Result", evidence.execution_result);
    evidenceRow(list, "Verification Result", evidence.verification_result);
    evidenceRow(list, "Delivery Record", evidence.delivery_record);
    const checklist = (_c = snapshot.spec_contract) == null ? void 0 : _c.checklist;
    if (checklist == null ? void 0 : checklist.total) {
      const unchecked = numberValue(checklist.unchecked);
      const row = list.createDiv({ cls: "flowdesk-evidence-row" });
      row.createSpan({
        cls: `flowdesk-status-dot flowdesk-status-${unchecked ? "ready" : "done"}`,
        text: statusSymbol(unchecked ? "ready" : "done")
      });
      const body = row.createDiv({ cls: "flowdesk-row-body" });
      body.createDiv({
        cls: "flowdesk-main-text",
        text: `Checklist: ${numberValue(checklist.checked)}/${numberValue(checklist.total)} checked`
      });
      if (unchecked) {
        body.createDiv({
          cls: "flowdesk-warning",
          text: "\u63D0\u9192\uFF1A\u4ECD\u6709\u672A\u52FE\u9009 checklist \u9879\u3002"
        });
      }
    }
  }
  renderNotepad(container, snapshot) {
    var _a, _b;
    const section = createSection(container, "Notepad");
    const notepad = (_a = snapshot.notepad) != null ? _a : {};
    if (!notepad.exists) {
      section.createDiv({ cls: "flowdesk-muted", text: "Notepad: missing" });
      return;
    }
    section.createDiv({
      cls: "flowdesk-main-text",
      text: "Notepad: present, non-authoritative"
    });
    const priority = ((_b = notepad.priority) != null ? _b : "").trim();
    if (priority) {
      for (const line of priority.split("\n").slice(0, 5)) {
        section.createDiv({ cls: "flowdesk-subline", text: line });
      }
    }
  }
  renderNextActions(container, snapshot) {
    var _a;
    const section = createSection(container, "Next Actions");
    const list = section.createDiv({ cls: "flowdesk-next-list" });
    const actions = (_a = snapshot.next_actions) != null ? _a : [];
    if (!actions.length) {
      list.createDiv({ cls: "flowdesk-muted", text: "No next actions." });
      return;
    }
    for (const action of actions) {
      list.createDiv({
        cls: "flowdesk-next-action",
        text: `\u2192 ${formatAction(action)}`
      });
    }
  }
};
var FlowDeskDashboardSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "FlowDesk Dashboard" });
    new import_obsidian.Setting(containerEl).setName("FlowDesk repo path").setDesc("\u672C\u5730 FlowDesk-Plugin \u4ED3\u5E93\u8DEF\u5F84\uFF1Bsymlink \u5B89\u88C5\u65F6\u901A\u5E38\u53EF\u4EE5\u7559\u7A7A\u3002").addText(
      (text) => text.setPlaceholder("/Users/bjke/workspaces/flowdesk-plugin").setValue(this.plugin.settings.flowdeskRoot).onChange(async (value) => {
        this.plugin.settings.flowdeskRoot = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Working directory").setDesc("\u4F20\u7ED9 --working-directory\uFF0C\u7528\u4E8E\u8BFB\u53D6 .flowdesk/notepad.md\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528 FlowDesk repo path\u3002").addText(
      (text) => text.setPlaceholder("/Users/bjke/workspaces/flowdesk-plugin").setValue(this.plugin.settings.workingDirectory).onChange(async (value) => {
        this.plugin.settings.workingDirectory = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Schema").setDesc("\u4F20\u7ED9 --schema\uFF0C\u9ED8\u8BA4 sdd-poc\u3002").addText(
      (text) => text.setPlaceholder("sdd-poc").setValue(this.plugin.settings.schema).onChange(async (value) => {
        this.plugin.settings.schema = value.trim() || DEFAULT_SETTINGS.schema;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("TaskNotes API URL").setDesc("\u53EF\u9009\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528 FlowDesk CLI \u9ED8\u8BA4\u503C\u3002").addText(
      (text) => text.setPlaceholder("http://127.0.0.1:18090").setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
        this.plugin.settings.apiUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
};
function createSection(container, title) {
  const section = container.createDiv({ cls: "flowdesk-dashboard-section" });
  section.createDiv({ cls: "flowdesk-dashboard-section-title", text: title });
  section.createDiv({ cls: "flowdesk-dashboard-rule" });
  return section;
}
function summaryRow(container, status, label, value) {
  const row = container.createDiv({ cls: "flowdesk-summary-row" });
  const normalized = normalizeStatus(status);
  row.createSpan({ cls: `flowdesk-status-dot flowdesk-status-${normalized}`, text: "\u25CF" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}:` });
  row.createSpan({ cls: "flowdesk-summary-value", text: value });
}
function contractRow(container, label, ids) {
  const row = container.createDiv();
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}: ` });
  row.createSpan({ text: formatIds(ids) });
}
function evidenceRow(container, label, item) {
  var _a;
  const exists = Boolean(item == null ? void 0 : item.exists);
  const status = exists ? "done" : "blocked";
  const row = container.createDiv({ cls: "flowdesk-evidence-row" });
  row.createSpan({ cls: `flowdesk-status-dot flowdesk-status-${status}`, text: statusSymbol(status) });
  const body = row.createDiv({ cls: "flowdesk-row-body" });
  const items = (_a = item == null ? void 0 : item.items) != null ? _a : [];
  body.createDiv({
    cls: "flowdesk-main-text",
    text: `${label}: ${exists ? `present (${items.length} items)` : "missing"}`
  });
  for (const detail of items.slice(0, 2)) {
    body.createDiv({ cls: "flowdesk-subline", text: `- ${detail}` });
  }
  if (items.length > 2) {
    const details = body.createEl("details", { cls: "flowdesk-evidence-details" });
    details.createEl("summary", { text: `\u663E\u793A\u5269\u4F59 ${items.length - 2} \u6761` });
    for (const detail of items.slice(2)) {
      details.createDiv({ cls: "flowdesk-subline", text: `- ${detail}` });
    }
  }
}
function computeProgress(snapshot) {
  var _a, _b, _c, _d;
  const counts = (_b = (_a = snapshot.task_graph) == null ? void 0 : _a.counts) != null ? _b : {};
  const nodes = (_d = (_c = snapshot.flow_graph) == null ? void 0 : _c.nodes) != null ? _d : [];
  const total = numberValue(counts.total);
  const done = numberValue(counts.done);
  const stageTotal = nodes.length;
  const stageDone = nodes.filter((node) => node.status === "done").length;
  const progressTotal = total || stageTotal;
  const progressDone = total ? done : stageDone;
  const percent = progressTotal ? Math.round(progressDone / progressTotal * 100) : 0;
  return {
    done: progressDone,
    total: progressTotal,
    unit: total ? "tasks" : "stages",
    percent,
    status: percent >= 100 ? "done" : percent > 0 ? "running" : "blocked"
  };
}
function normalizeStatus(status) {
  const value = String(status || "unknown").toLowerCase().replace(/_/g, "-");
  if (["done", "running", "ready", "blocked"].includes(value)) {
    return value;
  }
  return "blocked";
}
function statusSymbol(status) {
  if (status === "done") return "\u2713";
  if (status === "running") return "\u25C9";
  if (status === "ready") return "\u25CF";
  if (status === "blocked") return "\u25CB";
  return "\u2022";
}
function formatIds(value) {
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
function formatId(value) {
  var _a, _b;
  if (typeof value === "object" && value !== null) {
    const record = value;
    return String((_b = (_a = record.uid) != null ? _a : record.id) != null ? _b : JSON.stringify(record));
  }
  return String(value);
}
function formatAction(action) {
  var _a;
  const kind = String((_a = action.kind) != null ? _a : "unknown");
  const fields = Object.entries(action).filter(([key]) => key !== "kind").map(([key, value]) => `${key}=${formatIds(value)}`);
  return fields.length ? `${kind} (${fields.join("; ")})` : kind;
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function formatSnapshotCommandError(error) {
  const failure = error;
  const stderr = typeof failure.stderr === "string" ? failure.stderr.trim() : "";
  const stdout = typeof failure.stdout === "string" ? failure.stdout.trim() : "";
  const message = error instanceof Error ? error.message : String(error);
  const output = stderr || stdout || message;
  const tasknotesUnavailable = output.match(/TaskNotes HTTP API unavailable at (\S+)/);
  if (tasknotesUnavailable) {
    return [
      `TaskNotes HTTP API \u5C1A\u672A\u5C31\u7EEA\uFF1A${tasknotesUnavailable[1]}`,
      "\u8BF7\u786E\u8BA4 Obsidian \u548C TaskNotes HTTP API \u5DF2\u542F\u52A8\u540E\u518D\u5237\u65B0\u3002"
    ].join("\n");
  }
  if (output.includes("Connection refused")) {
    return [
      "TaskNotes HTTP API \u8FDE\u63A5\u88AB\u62D2\u7EDD\uFF0C\u53EF\u80FD\u8FD8\u5728\u542F\u52A8\u4E2D\u3002",
      "\u8BF7\u7A0D\u540E\u70B9\u51FB\u5237\u65B0\uFF1B\u5982\u679C\u4E00\u76F4\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u7684 TaskNotes API URL\u3002"
    ].join("\n");
  }
  const runtimeError = output.match(/RuntimeError: ([\s\S]+)$/);
  if (runtimeError) {
    return `FlowDesk snapshot \u8BFB\u53D6\u5931\u8D25\uFF1A${runtimeError[1].trim()}`;
  }
  return `FlowDesk snapshot \u547D\u4EE4\u5931\u8D25\uFF1A${message}`;
}
function formatFlowNodeId(id) {
  var _a;
  const value = String(id != null ? id : "");
  const labels = {
    spec_contract: "\u89C4\u683C\u5951\u7EA6",
    task_breakdown: "\u4EFB\u52A1\u62C6\u5206",
    implementation: "\u5B9E\u73B0",
    verification: "\u9A8C\u8BC1",
    delivery: "\u4EA4\u4ED8"
  };
  return (_a = labels[value]) != null ? _a : value;
}
function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FLOWDESK_DASHBOARD_VIEW_TYPE
});
