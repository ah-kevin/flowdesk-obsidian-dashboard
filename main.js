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
var path2 = __toESM(require("path"));
var import_util = require("util");

// src/dashboard-state.ts
function isTaskPath(filePath) {
  return filePath.endsWith(".md") && (filePath.startsWith("Tasks/") || filePath.startsWith("TaskNotes/"));
}
function resolveDashboardContext(activePath, previousTaskPath) {
  if (!activePath) {
    return { kind: "empty" };
  }
  if (isTaskPath(activePath)) {
    return { kind: "task", taskPath: activePath };
  }
  return { kind: "non-task", activePath, previousTaskPath };
}
function isCurrentSnapshotRequest(request, context, selectionRevision) {
  return context.kind === "task" && request.taskPath === context.taskPath && request.selectionRevision === selectionRevision;
}

// src/snapshot-invocation.ts
var path = __toESM(require("path"));
function buildSnapshotInvocation(input, format) {
  const args = [input.taskPath];
  if (input.apiUrl) {
    args.push("--api-url", input.apiUrl);
  }
  args.push(
    "--working-directory",
    input.workingDirectory,
    "--schema",
    input.schema,
    "--format",
    format
  );
  return {
    executable: path.join(
      input.flowdeskRoot,
      "bin",
      "flowdesk-execution-snapshot"
    ),
    args,
    cwd: input.flowdeskRoot
  };
}
function formatShellCommand(invocation) {
  return [invocation.executable, ...invocation.args].map(shellQuote).join(" ");
}
function shellQuote(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

// src/snapshot-model.ts
function createDashboardViewModel(snapshot, options = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s;
  const schemaVersion = Number(snapshot.snapshot_schema_version);
  const health = normalizeObservationHealth((_a = snapshot.observation) == null ? void 0 : _a.health);
  const compatibility = createCompatibility(snapshot);
  const inlineExecution = (_c = snapshot.inline_execution) != null ? _c : (_b = snapshot.task_graph) == null ? void 0 : _b.inline_execution;
  const semanticDiagnostics = (_f = (_e = (_d = snapshot.spec_contract) == null ? void 0 : _d.semantic_validation) == null ? void 0 : _e.errors) != null ? _f : [];
  const inlineDiagnostics = (_g = inlineExecution == null ? void 0 : inlineExecution.diagnostics) != null ? _g : [];
  const observationDiagnostics = (_i = (_h = snapshot.observation) == null ? void 0 : _h.diagnostics) != null ? _i : [];
  const diagnostics = [
    ...semanticDiagnostics,
    ...inlineDiagnostics,
    ...observationDiagnostics
  ].map(normalizeDiagnostic);
  const inlineProgress = inlineExecution ? {
    completed: typeof inlineExecution.completed === "number" ? inlineExecution.completed : null,
    total: typeof inlineExecution.total === "number" ? inlineExecution.total : 0,
    status: normalizeText(inlineExecution.status, "unknown"),
    explicit: inlineExecution.explicit === true,
    tasks: Object.entries((_j = inlineExecution.statuses) != null ? _j : {}).map(([id, item]) => ({
      id,
      status: normalizeText(item.status, "unknown"),
      inferred: item.inferred === true
    }))
  } : null;
  const hero = createHero(snapshot, inlineProgress);
  const staleReason = normalizeText(options.staleReason, "");
  const sourceIdentity = validateSnapshotSource(
    snapshot,
    normalizeText(options.expectedTaskPath, "")
  );
  const hasObservedSource = Boolean((_l = (_k = snapshot.observation) == null ? void 0 : _k.source_task_id) == null ? void 0 : _l.trim());
  return {
    schemaLabel: schemaVersion === 2 ? "snapshot v2" : "\u65E7\u7248 snapshot",
    state: normalizeText((_m = snapshot.state) == null ? void 0 : _m.value, "unknown"),
    hero,
    compatibility,
    observation: {
      health,
      generatedAt: normalizeText((_n = snapshot.observation) == null ? void 0 : _n.generated_at, "\u672A\u63D0\u4F9B"),
      sourceTaskId: normalizeText((_o = snapshot.observation) == null ? void 0 : _o.source_task_id, ""),
      coverage: Object.entries((_q = (_p = snapshot.observation) == null ? void 0 : _p.coverage) != null ? _q : {}).map(
        ([key, value]) => ({ key, value: normalizeText(value, "unknown") })
      ),
      isTrustworthy: schemaVersion === 2 && health === "healthy" && hasObservedSource && sourceIdentity !== false && !staleReason,
      isStale: Boolean(staleReason),
      staleReason,
      loadedAt: normalizeText(options.loadedAt, "\u672A\u63D0\u4F9B"),
      sourceIdentity
    },
    inlineProgress,
    primaryDiagnostic: (_r = diagnostics[0]) != null ? _r : null,
    diagnostics,
    nextAction: formatNextAction((_s = snapshot.next_actions) == null ? void 0 : _s[0])
  };
}
function validateSnapshotSource(snapshot, expectedTaskPath) {
  var _a;
  const actual = normalizeText((_a = snapshot.observation) == null ? void 0 : _a.source_task_id, "");
  const expected = normalizeText(expectedTaskPath, "");
  if (!actual || !expected) {
    return "unknown";
  }
  return actual === expected;
}
function createHero(snapshot, inlineProgress) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
  const nodes = (_b = (_a = snapshot.flow_graph) == null ? void 0 : _a.nodes) != null ? _b : [];
  const completedStages = nodes.filter((node) => node.status === "done").length;
  const progressLabel = nodes.length ? `${completedStages}/${nodes.length} \u9636\u6BB5` : "\u9636\u6BB5\u672A\u77E5";
  const parent = (_c = snapshot.task_graph) == null ? void 0 : _c.parent;
  const counts = (_e = (_d = snapshot.task_graph) == null ? void 0 : _d.counts) != null ? _e : {};
  const childTotal = finiteNumber(counts.total);
  const childDone = finiteNumber(counts.done);
  if (inlineProgress) {
    const completed = (_f = inlineProgress.completed) != null ? _f : "?";
    const inlineLabel = `${completed}/${inlineProgress.total} TASK`;
    return {
      title: normalizeText(parent == null ? void 0 : parent.title, "\u672A\u63D0\u4F9B\u4EFB\u52A1\u6807\u9898"),
      status: normalizeText(parent == null ? void 0 : parent.status, normalizeText((_g = snapshot.state) == null ? void 0 : _g.value, "unknown")),
      currentStage: normalizeText((_h = snapshot.flow_graph) == null ? void 0 : _h.current, "\u672A\u63D0\u4F9B"),
      progressLabel,
      workProgressKind: "inline",
      workProgressLabel: inlineLabel,
      inlineLabel
    };
  }
  const materializationMode = normalizeText(
    (_i = snapshot.task_materialization) == null ? void 0 : _i.mode,
    normalizeText((_k = (_j = snapshot.task_graph) == null ? void 0 : _j.task_materialization) == null ? void 0 : _k.mode, "")
  );
  if (materializationMode === "children" || childTotal > 0) {
    return {
      title: normalizeText(parent == null ? void 0 : parent.title, "\u672A\u63D0\u4F9B\u4EFB\u52A1\u6807\u9898"),
      status: normalizeText(parent == null ? void 0 : parent.status, normalizeText((_l = snapshot.state) == null ? void 0 : _l.value, "unknown")),
      currentStage: normalizeText((_m = snapshot.flow_graph) == null ? void 0 : _m.current, "\u672A\u63D0\u4F9B"),
      progressLabel,
      workProgressKind: "children",
      workProgressLabel: `${childDone}/${childTotal} \u5B50\u4EFB\u52A1`,
      inlineLabel: null
    };
  }
  return {
    title: normalizeText(parent == null ? void 0 : parent.title, "\u672A\u63D0\u4F9B\u4EFB\u52A1\u6807\u9898"),
    status: normalizeText(parent == null ? void 0 : parent.status, normalizeText((_n = snapshot.state) == null ? void 0 : _n.value, "unknown")),
    currentStage: normalizeText((_o = snapshot.flow_graph) == null ? void 0 : _o.current, "\u672A\u63D0\u4F9B"),
    progressLabel,
    workProgressKind: "unknown",
    workProgressLabel: "\u4EFB\u52A1\u8FDB\u5EA6\u672A\u77E5",
    inlineLabel: null
  };
}
function formatNextAction(action) {
  var _a;
  if (!action) {
    return null;
  }
  const kind = normalizeText(action.kind, "unknown");
  const labels = {
    complete_parent_task: "\u5B8C\u6210\u7236\u4EFB\u52A1",
    continue_inline_implementation: "\u7EE7\u7EED inline \u5B9E\u65BD",
    create_task_breakdown: "\u8865\u5145\u4EFB\u52A1\u62C6\u5206",
    dispatch_ready_task: "\u6D3E\u53D1\u5C31\u7EEA\u4EFB\u52A1",
    materialize_missing_tasks: "\u7269\u5316\u7F3A\u5931\u4EFB\u52A1",
    reconcile_plan_revision: "\u5BF9\u9F50\u8BA1\u5212\u7248\u672C",
    record_delivery: "\u8BB0\u5F55\u4EA4\u4ED8\u7ED3\u679C",
    refine_spec_contract: "\u5B8C\u5584 Spec Contract",
    refine_task_granularity: "\u8C03\u6574\u4EFB\u52A1\u7C92\u5EA6",
    resolve_blockers: "\u5904\u7406\u963B\u585E\u9879",
    resolve_inline_execution_conflict: "\u5904\u7406 inline \u6267\u884C\u51B2\u7A81",
    resolve_materialization_conflict: "\u5904\u7406\u4EFB\u52A1\u7269\u5316\u51B2\u7A81",
    start_implementation: "\u5F00\u59CB\u5B9E\u65BD",
    start_inline_implementation: "\u5F00\u59CB inline \u5B9E\u65BD",
    verify_scenarios: "\u9A8C\u8BC1\u9A8C\u6536\u573A\u666F",
    wait_for_running_task: "\u7B49\u5F85\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1"
  };
  const ids = Array.isArray(action.task_ids) ? action.task_ids.map(String).filter(Boolean) : [];
  const label = (_a = labels[kind]) != null ? _a : kind;
  return ids.length ? `${label}\uFF1A${ids.join("\u3001")}` : label;
}
function resolveDiagnosticTarget(taskPath, source) {
  const line = typeof (source == null ? void 0 : source.line_start) === "number" && source.line_start > 0 ? source.line_start : null;
  const heading = line === null ? normalizeText(source == null ? void 0 : source.after_section, normalizeText(source == null ? void 0 : source.section, "")) : normalizeText(source == null ? void 0 : source.section, "");
  return {
    linkText: heading ? `${taskPath}#${heading}` : taskPath,
    line
  };
}
function formatDiagnosticReason(value) {
  const diagnostic = isRecord(value) ? value : {};
  const hasWrapper = "reason" in diagnostic || "message" in diagnostic;
  const reason = hasWrapper ? diagnostic.reason : value;
  const message = hasWrapper ? diagnostic.message : void 0;
  if (isRecord(reason)) {
    return normalizeText(
      reason.actual,
      normalizeText(reason.expected, normalizeText(message, "producer \u672A\u63D0\u4F9B"))
    );
  }
  return normalizeText(reason, normalizeText(message, "producer \u672A\u63D0\u4F9B"));
}
function formatDiagnosticRemediation(value) {
  const diagnostic = isRecord(value) ? value : {};
  const remediation = "remediation" in diagnostic ? diagnostic.remediation : value;
  if (isRecord(remediation)) {
    return normalizeText(
      remediation.summary,
      normalizeText(remediation.example, "producer \u672A\u63D0\u4F9B")
    );
  }
  return normalizeText(remediation, "producer \u672A\u63D0\u4F9B");
}
function createCompatibility(snapshot) {
  var _a, _b, _c, _d, _e, _f;
  const profile = normalizeText(
    (_a = snapshot.compatibility) == null ? void 0 : _a.profile,
    normalizeText(
      (_b = snapshot.spec_contract) == null ? void 0 : _b.execution_mode,
      normalizeText((_c = snapshot.task_materialization) == null ? void 0 : _c.mode, "unknown")
    )
  );
  const producerLabel = normalizeText((_d = snapshot.compatibility) == null ? void 0 : _d.label, "");
  if (producerLabel) {
    return { label: producerLabel, profile };
  }
  const contractVersion = normalizeText(
    (_e = snapshot.compatibility) == null ? void 0 : _e.contract_version,
    normalizeText((_f = snapshot.spec_contract) == null ? void 0 : _f.version, "")
  );
  if (contractVersion) {
    return {
      label: `SDD ${contractVersion}${profile !== "unknown" ? ` \xB7 ${profile}` : ""}`,
      profile
    };
  }
  return { label: "\u65E7\u7248 snapshot \xB7 \u80FD\u529B\u672A\u77E5", profile: "unknown" };
}
function normalizeDiagnostic(value) {
  if (typeof value === "string") {
    return {
      code: value,
      message: value,
      reason: value,
      remediation: "producer \u672A\u63D0\u4F9B"
    };
  }
  const diagnostic = isRecord(value) ? value : {};
  const code = normalizeText(diagnostic.code, "unknown_diagnostic");
  return {
    code,
    message: normalizeText(diagnostic.message, code),
    reason: formatDiagnosticReason(diagnostic),
    remediation: formatDiagnosticRemediation(diagnostic),
    source: isRecord(diagnostic.source) ? diagnostic.source : void 0,
    severity: normalizeOptionalText(diagnostic.severity),
    path: normalizeOptionalText(diagnostic.path)
  };
}
function normalizeObservationHealth(value) {
  return value === "healthy" || value === "degraded" || value === "error" ? value : "unknown";
}
function normalizeText(value, fallback) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}
function normalizeOptionalText(value) {
  const normalized = normalizeText(value, "");
  return normalized || void 0;
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/main.ts
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
        var _a;
        void ((_a = this.getDashboardView()) == null ? void 0 : _a.syncToActiveFile(file));
      })
    );
    this.app.workspace.onLayoutReady(() => {
      var _a;
      void ((_a = this.getDashboardView()) == null ? void 0 : _a.syncToActiveFile());
    });
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
    const invocation = this.createSnapshotInvocation(taskPath, "json");
    let stdout;
    try {
      const result = await execFileAsync(invocation.executable, invocation.args, {
        cwd: invocation.cwd,
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
  createSnapshotInvocation(taskPath, format) {
    const flowdeskRoot = this.resolveFlowDeskRoot();
    const workingDirectory = expandHomePath(this.settings.workingDirectory.trim()) || flowdeskRoot;
    const apiUrl = this.settings.apiUrl.trim();
    return buildSnapshotInvocation(
      {
        flowdeskRoot,
        taskPath,
        workingDirectory,
        schema: this.settings.schema.trim() || DEFAULT_SETTINGS.schema,
        apiUrl
      },
      format
    );
  }
  async copyDashboardCommand(taskPath) {
    const invocation = this.createSnapshotInvocation(taskPath, "dashboard");
    await navigator.clipboard.writeText(formatShellCommand(invocation));
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  isTaskFile(file) {
    return Boolean(file && file.extension === "md" && isTaskPath(file.path));
  }
  resolveFlowDeskRoot() {
    const candidates = [
      expandHomePath(this.settings.flowdeskRoot.trim()),
      expandHomePath(process.env.FLOWDESK_PLUGIN_ROOT || ""),
      path2.resolve(__dirname, "..", "..")
    ].filter(Boolean);
    for (const candidate of candidates) {
      const cli = path2.join(candidate, "bin", "flowdesk-execution-snapshot");
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
    return path2.join((0, import_os.homedir)(), value.slice(2));
  }
  return value;
}
var FlowDeskDashboardView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.context = { kind: "empty" };
    this.previousTaskPath = "";
    this.selectionRevision = 0;
    this.displayState = null;
    this.error = "";
    this.loading = false;
    this.queuedRequest = null;
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
    await this.syncToActiveFile();
  }
  get currentTaskPath() {
    return this.context.kind === "task" ? this.context.taskPath : "";
  }
  async syncToActiveFile(file = this.app.workspace.getActiveFile()) {
    var _a;
    const nextContext = resolveDashboardContext(
      (_a = file == null ? void 0 : file.path) != null ? _a : null,
      this.previousTaskPath
    );
    if (nextContext.kind === "task") {
      if (this.context.kind === "task" && this.context.taskPath === nextContext.taskPath) {
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
    this.loading = false;
    this.error = "";
    this.render();
  }
  async loadTask(taskPath) {
    var _a;
    const isSameSelection = this.context.kind === "task" && this.context.taskPath === taskPath;
    if (!isSameSelection) {
      this.selectionRevision += 1;
      this.context = { kind: "task", taskPath };
      this.previousTaskPath = taskPath;
      if (((_a = this.displayState) == null ? void 0 : _a.taskPath) !== taskPath) {
        this.displayState = null;
      }
      this.error = "";
      this.loading = true;
      this.render();
    }
    this.queuedRequest = {
      taskPath,
      selectionRevision: this.selectionRevision
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
    if (this.context.kind === "task") {
      await this.loadTask(this.context.taskPath);
    }
  }
  async drainRefreshQueue() {
    while (this.queuedRequest) {
      const request = this.queuedRequest;
      this.queuedRequest = null;
      await this.loadTaskNow(request);
    }
  }
  async loadTaskNow(request) {
    var _a, _b, _c;
    this.loading = true;
    this.error = "";
    this.render();
    try {
      const snapshot = await this.plugin.loadSnapshot(request.taskPath);
      if (!isCurrentSnapshotRequest(
        request,
        this.context,
        this.selectionRevision
      )) {
        return;
      }
      const sourceIdentity = validateSnapshotSource(snapshot, request.taskPath);
      if (sourceIdentity === false) {
        throw new Error(
          `Snapshot source identity \u4E0D\u5339\u914D\uFF1A\u8BF7\u6C42 ${request.taskPath}\uFF0C\u8FD4\u56DE ${(_b = (_a = snapshot.observation) == null ? void 0 : _a.source_task_id) != null ? _b : "\u672A\u63D0\u4F9B"}\u3002`
        );
      }
      this.displayState = {
        taskPath: request.taskPath,
        snapshot,
        loadedAt: formatTime(/* @__PURE__ */ new Date()),
        staleReason: ""
      };
    } catch (error) {
      if (!isCurrentSnapshotRequest(
        request,
        this.context,
        this.selectionRevision
      )) {
        return;
      }
      this.error = error instanceof Error ? error.message : String(error);
      if (((_c = this.displayState) == null ? void 0 : _c.taskPath) === request.taskPath) {
        this.displayState = {
          ...this.displayState,
          staleReason: this.error
        };
      } else {
        this.displayState = null;
      }
    } finally {
      if (isCurrentSnapshotRequest(
        request,
        this.context,
        this.selectionRevision
      )) {
        this.loading = false;
        this.render();
      }
    }
  }
  render() {
    var _a, _b;
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
        text: "\u8BF7\u6253\u5F00\u4E00\u4E2A Tasks/*.md \u6216 TaskNotes/*.md \u4EFB\u52A1\u6587\u4EF6\u3002"
      });
      return;
    }
    const taskPath = this.context.taskPath;
    const displayState = ((_a = this.displayState) == null ? void 0 : _a.taskPath) === taskPath ? this.displayState : null;
    const snapshot = (_b = displayState == null ? void 0 : displayState.snapshot) != null ? _b : null;
    if (this.loading && !snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "\u6B63\u5728\u8BFB\u53D6 snapshot..." });
      return;
    }
    if (this.error) {
      if (!snapshot) {
        container.createDiv({ cls: "flowdesk-error", text: this.error });
        return;
      }
    }
    if (!snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "\u5C1A\u672A\u8BFB\u53D6 snapshot\u3002" });
      return;
    }
    if (this.loading) {
      container.createDiv({ cls: "flowdesk-refreshing", text: "\u6B63\u5728\u5237\u65B0 snapshot..." });
    }
    const model = createDashboardViewModel(snapshot, {
      expectedTaskPath: taskPath,
      loadedAt: displayState == null ? void 0 : displayState.loadedAt,
      staleReason: displayState == null ? void 0 : displayState.staleReason
    });
    this.renderTrustStrip(container, model);
    this.renderTaskHero(container, model, snapshot);
    this.renderPrimaryDiagnostic(container, model);
    this.renderPrimaryNextAction(container, model);
    this.renderStageRail(container, snapshot);
    this.renderDetails(container, snapshot, model);
  }
  renderNonTaskState(container, context) {
    const card = container.createDiv({ cls: "flowdesk-context-pause" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "Dashboard \u5DF2\u6682\u505C" });
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: "\u5F53\u524D\u6587\u4EF6\u4E0D\u662F TaskNotes \u4EFB\u52A1"
    });
    card.createDiv({
      cls: "flowdesk-card-copy",
      text: "FlowDesk Dashboard \u4EC5\u652F\u6301 Tasks/*.md \u4E0E TaskNotes/*.md\u3002"
    });
    card.createDiv({
      cls: "flowdesk-context-path",
      text: `\u5F53\u524D\u6587\u4EF6\uFF1A${context.activePath}`
    });
    if (!context.previousTaskPath) {
      return;
    }
    card.createDiv({
      cls: "flowdesk-context-path",
      text: `\u4E0A\u4E00\u6B21\u4EFB\u52A1\uFF1A${context.previousTaskPath}`
    });
    const back = card.createEl("button", {
      cls: "flowdesk-context-back",
      text: "\u56DE\u5230\u4E0A\u4E00\u6B21\u4EFB\u52A1"
    });
    back.addEventListener("click", () => {
      void this.openTask(context.previousTaskPath);
    });
  }
  renderHeader(container) {
    var _a;
    const header = container.createDiv({ cls: "flowdesk-dashboard-header" });
    const titleBlock = header.createDiv();
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-title",
      text: "FlowDesk Execution Dashboard"
    });
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-path",
      text: this.context.kind === "task" ? this.context.taskPath : this.context.kind === "non-task" ? this.context.activePath : "\u672A\u9009\u62E9\u6587\u4EF6"
    });
    titleBlock.createDiv({
      cls: "flowdesk-dashboard-meta",
      text: ((_a = this.displayState) == null ? void 0 : _a.loadedAt) ? `\u672C\u5730\u8BFB\u53D6 ${this.displayState.loadedAt}` : "\u7B49\u5F85\u5237\u65B0"
    });
    const toolbar = header.createDiv({ cls: "flowdesk-dashboard-toolbar" });
    if (this.context.kind !== "task") {
      return;
    }
    const taskPath = this.context.taskPath;
    const copy = toolbar.createEl("button", {
      cls: "flowdesk-copy-button",
      text: "\u590D\u5236 CLI"
    });
    copy.title = "\u590D\u5236\u5F53\u524D\u4EFB\u52A1\u7684 terminal dashboard \u547D\u4EE4";
    copy.addEventListener("click", async () => {
      copy.disabled = true;
      try {
        await this.plugin.copyDashboardCommand(taskPath);
        copy.setText("\u5DF2\u590D\u5236");
        new import_obsidian.Notice("CLI \u547D\u4EE4\u5DF2\u590D\u5236");
        window.setTimeout(() => {
          if (copy.isConnected) {
            copy.setText("\u590D\u5236 CLI");
            copy.disabled = false;
          }
        }, 1500);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new import_obsidian.Notice(`\u65E0\u6CD5\u590D\u5236 CLI \u547D\u4EE4\uFF1A${message}`);
        copy.disabled = false;
      }
    });
    const refresh = toolbar.createEl("button", {
      cls: "flowdesk-refresh-button",
      text: this.loading ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0"
    });
    refresh.disabled = this.loading;
    refresh.title = "\u91CD\u65B0\u8BFB\u53D6\u5F53\u524D TaskNotes task \u7684 FlowDesk snapshot";
    refresh.addEventListener("click", () => {
      void this.plugin.refreshDashboard(taskPath);
    });
  }
  renderTrustStrip(container, model) {
    var _a;
    const trustState = model.observation.isStale ? "stale" : model.observation.health;
    const strip = container.createDiv({
      cls: `flowdesk-trust-strip flowdesk-trust-${trustState}`
    });
    const labels = {
      healthy: "\u89C2\u6D4B\u5065\u5EB7",
      degraded: "\u89C2\u6D4B\u964D\u7EA7",
      error: "\u89C2\u6D4B\u5F02\u5E38",
      unknown: "\u89C2\u6D4B\u672A\u77E5"
    };
    strip.createSpan({
      cls: "flowdesk-trust-badge",
      text: model.observation.isStale ? "\u65E7\u6570\u636E" : (_a = labels[model.observation.health]) != null ? _a : "\u89C2\u6D4B\u672A\u77E5"
    });
    strip.createSpan({
      cls: "flowdesk-trust-contract",
      text: `${model.schemaLabel} \xB7 ${model.compatibility.label}`
    });
    strip.createSpan({
      cls: "flowdesk-trust-generated",
      text: `producer ${model.observation.generatedAt} \xB7 \u672C\u5730 ${model.observation.loadedAt}`
    });
    if (model.observation.isStale) {
      strip.createDiv({
        cls: "flowdesk-stale-reason",
        text: `\u5237\u65B0\u5931\u8D25\uFF1A${model.observation.staleReason}`
      });
    }
  }
  renderTaskHero(container, model, snapshot) {
    var _a;
    const hero = container.createDiv({ cls: "flowdesk-hero" });
    const titleRow = hero.createDiv({ cls: "flowdesk-hero-title-row" });
    titleRow.createDiv({ cls: "flowdesk-hero-title", text: model.hero.title });
    titleRow.createSpan({
      cls: `flowdesk-state-pill flowdesk-state-${normalizeStatus(model.hero.status)}`,
      text: model.hero.status
    });
    const metrics = hero.createDiv({ cls: "flowdesk-hero-metrics" });
    metricCard(metrics, "\u5F53\u524D\u9636\u6BB5", formatFlowNodeId(model.hero.currentStage));
    metricCard(metrics, "\u6D41\u7A0B\u8FDB\u5EA6", model.hero.progressLabel);
    metricCard(
      metrics,
      model.hero.workProgressKind === "inline" ? "Inline \u8FDB\u5EA6" : "\u4EFB\u52A1\u8FDB\u5EA6",
      model.hero.workProgressLabel
    );
    if ((_a = snapshot.state) == null ? void 0 : _a.blocked_reason) {
      hero.createDiv({
        cls: "flowdesk-hero-blocked",
        text: `\u963B\u585E\u539F\u56E0\uFF1A${snapshot.state.blocked_reason}`
      });
    }
  }
  renderPrimaryDiagnostic(container, model) {
    const diagnostic = model.primaryDiagnostic;
    if (!diagnostic) {
      const empty = container.createDiv({
        cls: `flowdesk-primary-status ${model.observation.isTrustworthy ? "is-clear" : "is-unknown"}`
      });
      empty.createDiv({ cls: "flowdesk-card-kicker", text: "\u9996\u8981\u95EE\u9898" });
      empty.createDiv({
        cls: "flowdesk-primary-title",
        text: model.observation.isTrustworthy ? "\u672A\u53D1\u73B0\u5408\u540C\u6216\u6267\u884C\u8BCA\u65AD" : "\u5F53\u524D\u6CA1\u6709\u53EF\u9A8C\u8BC1\u7684\u8BCA\u65AD\u7ED3\u8BBA"
      });
      if (!model.observation.isTrustworthy) {
        empty.createDiv({
          cls: "flowdesk-card-copy",
          text: "\u89C2\u6D4B\u5E76\u975E healthy v2\uFF0C\u4E0D\u80FD\u636E\u6B64\u5224\u65AD\u4EFB\u52A1\u6CA1\u6709\u95EE\u9898\u3002"
        });
      }
      return;
    }
    const card = container.createDiv({ cls: "flowdesk-primary-issue" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "\u9996\u8981\u95EE\u9898" });
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: diagnostic.message || diagnostic.code
    });
    card.createDiv({ cls: "flowdesk-diagnostic-code", text: diagnostic.code });
    this.renderDiagnosticBody(card, diagnostic);
  }
  renderDiagnosticBody(container, diagnostic) {
    const source = diagnostic.source;
    if (source) {
      const location = [
        source.section ? `\xA7 ${source.section}` : "",
        source.field ? `\u5B57\u6BB5 ${source.field}` : "",
        source.line_start ? `\u7B2C ${source.line_start} \u884C` : ""
      ].filter(Boolean).join(" \xB7 ");
      if (location) {
        container.createDiv({ cls: "flowdesk-diagnostic-location", text: location });
      }
      if (source.excerpt) {
        container.createEl("code", {
          cls: "flowdesk-diagnostic-excerpt",
          text: source.excerpt
        });
      }
    } else {
      container.createDiv({
        cls: "flowdesk-diagnostic-location",
        text: "\u4F4D\u7F6E\uFF1Aproducer \u672A\u63D0\u4F9B"
      });
    }
    diagnosticRow(container, "\u539F\u56E0", diagnostic.reason);
    diagnosticRow(container, "\u5EFA\u8BAE\u4FEE\u6CD5", diagnostic.remediation);
    const canLocate = Boolean(
      (source == null ? void 0 : source.line_start) || (source == null ? void 0 : source.section) || (source == null ? void 0 : source.after_section)
    );
    if (canLocate) {
      const actions = container.createDiv({ cls: "flowdesk-diagnostic-actions" });
      const locate = actions.createEl("button", {
        cls: "flowdesk-diagnostic-locate",
        text: "\u5B9A\u4F4D"
      });
      locate.title = "\u53EA\u8BFB\u6253\u5F00\u8BCA\u65AD\u6240\u5728\u7684 TaskNotes \u4F4D\u7F6E";
      locate.addEventListener("click", () => {
        void this.openDiagnosticLocation(diagnostic);
      });
    }
  }
  async openDiagnosticLocation(diagnostic) {
    var _a;
    const taskPath = this.currentTaskPath;
    if (!taskPath) {
      new import_obsidian.Notice("\u5F53\u524D\u6587\u4EF6\u4E0D\u662F TaskNotes \u4EFB\u52A1\u3002");
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice(`\u672A\u627E\u5230\u4EFB\u52A1\u6587\u4EF6\uFF1A${taskPath}`);
      return;
    }
    const target = resolveDiagnosticTarget(taskPath, diagnostic.source);
    if (target.linkText === taskPath && target.line === null) {
      new import_obsidian.Notice("producer \u672A\u63D0\u4F9B\u53EF\u5B9A\u4F4D\u7684 section \u6216\u884C\u53F7\u3002");
      return;
    }
    try {
      await this.app.workspace.openLinkText(target.linkText, taskPath, false);
      if (target.line === null) {
        return;
      }
      const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (!view || ((_a = view.file) == null ? void 0 : _a.path) !== taskPath) {
        new import_obsidian.Notice("\u4EFB\u52A1\u5DF2\u6253\u5F00\uFF0C\u4F46\u5F53\u524D\u89C6\u56FE\u65E0\u6CD5\u5B9A\u4F4D\u5230\u5177\u4F53\u884C\u3002");
        return;
      }
      const line = target.line - 1;
      if (line < 0 || line >= view.editor.lineCount()) {
        new import_obsidian.Notice(`\u8BCA\u65AD\u884C\u53F7\u5DF2\u8D85\u51FA\u5F53\u524D\u6587\u4EF6\u8303\u56F4\uFF1A${target.line}`);
        return;
      }
      const position = { line, ch: 0 };
      view.editor.setCursor(position);
      view.editor.scrollIntoView({ from: position, to: position }, true);
      view.editor.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian.Notice(`\u65E0\u6CD5\u5B9A\u4F4D\u8BCA\u65AD\u4F4D\u7F6E\uFF1A${message}`);
    }
  }
  renderPrimaryNextAction(container, model) {
    var _a;
    const card = container.createDiv({ cls: "flowdesk-primary-action" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "\u4E0B\u4E00\u52A8\u4F5C" });
    const noAction = model.state === "done" && model.observation.isTrustworthy ? "\u65E0\u540E\u7EED\u52A8\u4F5C" : "snapshot \u672A\u63D0\u4F9B\u4E0B\u4E00\u52A8\u4F5C";
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: (_a = model.nextAction) != null ? _a : noAction
    });
  }
  renderStageRail(container, snapshot) {
    var _a, _b;
    const section = createSection(container, "\u6267\u884C\u9636\u6BB5");
    const rail = section.createDiv({ cls: "flowdesk-stage-rail" });
    const nodes = (_b = (_a = snapshot.flow_graph) == null ? void 0 : _a.nodes) != null ? _b : [];
    if (!nodes.length) {
      rail.createDiv({ cls: "flowdesk-muted", text: "\u672A\u63D0\u4F9B\u9636\u6BB5\u6570\u636E\u3002" });
      return;
    }
    for (const node of nodes) {
      const status = normalizeStatus(node.status);
      const item = rail.createDiv({
        cls: `flowdesk-stage-item flowdesk-stage-${status}`
      });
      item.createSpan({ cls: "flowdesk-stage-symbol", text: statusSymbol(status) });
      item.createSpan({
        cls: "flowdesk-stage-label",
        text: formatFlowNodeId(node.id) || node.label || "\u672A\u547D\u540D\u9636\u6BB5"
      });
    }
  }
  renderDetails(container, snapshot, model) {
    const details = container.createEl("details", { cls: "flowdesk-detail-group" });
    details.open = model.diagnostics.length > 0;
    details.createEl("summary", { text: "\u67E5\u770B\u6267\u884C\u8BE6\u60C5" });
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
  renderObservationDetails(container, model) {
    const section = createSection(container, "Observation\uFF08\u89C2\u6D4B\uFF09");
    const list = section.createDiv({ cls: "flowdesk-contract-list" });
    contractRow(list, "Source task", [model.observation.sourceTaskId || "\u672A\u63D0\u4F9B"]);
    contractRow(list, "Source identity", [String(model.observation.sourceIdentity)]);
    contractRow(list, "Profile", [model.compatibility.profile]);
    if (!model.observation.coverage.length) {
      list.createDiv({ cls: "flowdesk-muted", text: "Coverage\uFF1A\u672A\u63D0\u4F9B" });
      return;
    }
    for (const item of model.observation.coverage) {
      contractRow(list, item.key, [item.value]);
    }
  }
  renderInlineExecution(container, model) {
    var _a;
    const inline = model.inlineProgress;
    if (!inline) {
      return;
    }
    const section = createSection(container, "Inline Execution");
    section.createDiv({
      cls: "flowdesk-main-text",
      text: `${(_a = inline.completed) != null ? _a : "?"}/${inline.total} TASK \xB7 ${inline.status} \xB7 ${inline.explicit ? "\u663E\u5F0F\u8BB0\u5F55" : "\u63A8\u65AD\u72B6\u6001"}`
    });
    const list = section.createDiv({ cls: "flowdesk-inline-task-list" });
    for (const task of inline.tasks) {
      const row = list.createDiv({ cls: "flowdesk-inline-task" });
      row.createSpan({
        cls: `flowdesk-status-dot flowdesk-status-${normalizeStatus(task.status)}`,
        text: statusSymbol(normalizeStatus(task.status))
      });
      row.createSpan({ text: `${task.id} \xB7 ${task.status}` });
      if (task.inferred) {
        row.createSpan({ cls: "flowdesk-inferred-label", text: "\u63A8\u65AD" });
      }
    }
  }
  renderMaterialization(container, snapshot) {
    var _a, _b, _c, _d;
    const materialization = (_b = snapshot.task_materialization) != null ? _b : (_a = snapshot.task_graph) == null ? void 0 : _a.task_materialization;
    if (!materialization) {
      return;
    }
    const section = createSection(container, "Materialization\uFF08\u7269\u5316\uFF09");
    const list = section.createDiv({ cls: "flowdesk-contract-list" });
    contractRow(list, "Mode", [(_c = materialization.mode) != null ? _c : "\u672A\u63D0\u4F9B"]);
    contractRow(list, "Status", [(_d = materialization.status) != null ? _d : "\u672A\u63D0\u4F9B"]);
    contractRow(list, "Declared", materialization.declared);
    contractRow(list, "Materialized", materialization.materialized);
    contractRow(list, "Missing", materialization.missing);
    contractRow(list, "Conflicts", materialization.conflicts);
  }
  renderAllDiagnostics(container, diagnostics) {
    const section = createSection(container, `\u5168\u90E8\u8BCA\u65AD\uFF08${diagnostics.length}\uFF09`);
    const list = section.createDiv({ cls: "flowdesk-diagnostic-list" });
    for (const diagnostic of diagnostics) {
      const item = list.createDiv({ cls: "flowdesk-diagnostic-item" });
      item.createDiv({ cls: "flowdesk-main-text", text: diagnostic.code });
      this.renderDiagnosticBody(item, diagnostic);
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
    var _a, _b;
    const section = createSection(container, "Next Actions");
    const list = section.createDiv({ cls: "flowdesk-next-list" });
    const actions = (_a = snapshot.next_actions) != null ? _a : [];
    if (!actions.length) {
      list.createDiv({ cls: "flowdesk-muted", text: "No next actions." });
      return;
    }
    for (const action of actions) {
      const label = (_b = formatNextAction(action)) != null ? _b : "\u672A\u77E5\u52A8\u4F5C";
      list.createDiv({
        cls: "flowdesk-next-action",
        text: `\u2192 ${label}`
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
function metricCard(container, label, value) {
  const card = container.createDiv({ cls: "flowdesk-metric" });
  card.createDiv({ cls: "flowdesk-metric-label", text: label });
  card.createDiv({ cls: "flowdesk-metric-value", text: value });
}
function diagnosticRow(container, label, value) {
  const row = container.createDiv({ cls: "flowdesk-diagnostic-row" });
  row.createSpan({ cls: "flowdesk-diagnostic-label", text: `${label}\uFF1A` });
  row.createSpan({ text: value });
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
function normalizeStatus(status) {
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
    task_materialization: "\u4EFB\u52A1\u7269\u5316",
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
