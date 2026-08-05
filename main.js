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
function collectObservedTaskPaths(currentTaskPath, snapshot) {
  var _a;
  const paths = /* @__PURE__ */ new Set();
  if (isTaskPath(currentTaskPath)) {
    paths.add(currentTaskPath);
  }
  const observed = [
    snapshot == null ? void 0 : snapshot.current_task,
    snapshot == null ? void 0 : snapshot.parent,
    ...(_a = snapshot == null ? void 0 : snapshot.children) != null ? _a : []
  ];
  for (const task of observed) {
    if ((task == null ? void 0 : task.id) && isTaskPath(task.id)) {
      paths.add(task.id);
    }
  }
  return paths;
}
function resolveDetailsOpen(previousOpen, taskChanged, diagnosticCount, hasChildren) {
  if (!taskChanged) {
    return previousOpen;
  }
  return diagnosticCount > 0 || !hasChildren;
}
var TrailingRefreshScheduler = class {
  constructor(callback, delayMs = 500, scheduleTimer = (callback2, delayMs2) => globalThis.setTimeout(callback2, delayMs2), cancelTimer = (handle) => globalThis.clearTimeout(handle)) {
    this.callback = callback;
    this.delayMs = delayMs;
    this.scheduleTimer = scheduleTimer;
    this.cancelTimer = cancelTimer;
    this.timer = null;
  }
  schedule() {
    this.cancel();
    this.timer = this.scheduleTimer(() => {
      this.timer = null;
      this.callback();
    }, this.delayMs);
  }
  flush() {
    this.cancel();
    this.callback();
  }
  cancel() {
    if (this.timer === null) {
      return;
    }
    this.cancelTimer(this.timer);
    this.timer = null;
  }
};

// src/snapshot-invocation.ts
var path = __toESM(require("path"));
function buildSnapshotInvocation(input, format) {
  const flowdeskRoot = path.resolve(input.flowdeskRoot);
  const workingDirectory = path.isAbsolute(input.workingDirectory) ? input.workingDirectory : path.resolve(flowdeskRoot, input.workingDirectory);
  const args = [input.taskPath];
  if (input.apiUrl) {
    args.push("--api-url", input.apiUrl);
  }
  args.push(
    "--working-directory",
    workingDirectory,
    "--format",
    format
  );
  return {
    executable: path.join(
      flowdeskRoot,
      "bin",
      "flowdesk-execution-snapshot"
    ),
    args,
    cwd: flowdeskRoot
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

// src/evidence-presentation.ts
function getEvidenceDisplayState(health) {
  if (health === "valid") {
    return "done";
  }
  return health === "invalid" ? "error" : "blocked";
}
function formatEvidenceSummary(label, health) {
  const labels = {
    missing: "\u7F3A\u5931",
    invalid: "\u65E0\u6548",
    valid: "\u6709\u6548"
  };
  return `${label}\uFF1A${labels[health]}`;
}

// src/snapshot-model.ts
function createDashboardViewModel(value, options = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L;
  const snapshot = isRecord(value) ? value : {};
  const schemaSupported = snapshot.snapshot_schema_version === 3;
  const modelSupported = snapshot.snapshot_model === "task-centric";
  const currentTask = (_a = snapshot.current_task) != null ? _a : {};
  const currentTaskId = normalizeText(
    currentTask.id,
    normalizeText(snapshot.source_task_id, "")
  );
  const rollup = (_b = snapshot.rollup) != null ? _b : {};
  const staleReason = normalizeText(options.staleReason, "");
  const sourceIdentity = validateSnapshotSource(
    snapshot,
    normalizeText(options.expectedTaskPath, "")
  );
  const observationHealth = normalizeObservationHealth(
    (_c = snapshot.observation) == null ? void 0 : _c.health
  );
  const sourceIdentityMatch = typeof ((_d = snapshot.observation) == null ? void 0 : _d.source_identity_match) === "boolean" ? snapshot.observation.source_identity_match : "unknown";
  const parentObserved = ((_e = snapshot.observation) == null ? void 0 : _e.parent) === "observed" || ((_f = snapshot.observation) == null ? void 0 : _f.parent) === "not_applicable";
  const isTrustworthy = schemaSupported && modelSupported && observationHealth === "healthy" && ((_g = snapshot.observation) == null ? void 0 : _g.current_task) === "observed" && parentObserved && ((_h = snapshot.observation) == null ? void 0 : _h.children) === "observed" && ((_i = snapshot.observation) == null ? void 0 : _i.tasknotes_api) === "ok" && sourceIdentityMatch === true && ((_j = snapshot.observation) == null ? void 0 : _j.stale) === false && sourceIdentity === true && !staleReason;
  const evidence = normalizeEvidenceHealth(snapshot.evidence);
  const diagnostics = ((_k = snapshot.diagnostics) != null ? _k : []).map(
    (diagnostic) => normalizeDiagnostic(diagnostic, currentTaskId)
  );
  const children = ((_l = snapshot.children) != null ? _l : []).map(
    (child) => createChildViewModel(child)
  );
  return {
    errorCode: !schemaSupported ? "unsupported_snapshot_schema" : !modelSupported ? "unsupported_snapshot_model" : null,
    schemaSupported,
    modelSupported,
    schemaLabel: schemaSupported && modelSupported ? "snapshot v3 \xB7 task-centric" : "\u4E0D\u652F\u6301\u7684 snapshot \u6A21\u578B",
    currentTask: {
      id: currentTaskId,
      title: normalizeText(currentTask.title, "\u672A\u63D0\u4F9B\u4EFB\u52A1\u6807\u9898"),
      status: normalizeText(currentTask.status, "unknown"),
      priority: normalizeText(currentTask.priority, "\u672A\u63D0\u4F9B"),
      isBlocked: currentTask.is_blocked === true,
      blockedBy: ((_m = currentTask.blocked_by) != null ? _m : []).map(normalizeBlockedBy).filter(Boolean),
      parentId: typeof currentTask.parent_id === "string" ? currentTask.parent_id : null,
      hasChildren: currentTask.has_children === true,
      rollupState: normalizeText(currentTask.rollup_state, "unknown"),
      trustedDone: currentTask.trusted_done === true,
      evidenceHealth: evidence
    },
    parent: normalizeParent(snapshot.parent),
    children,
    rollup: {
      state: normalizeText(rollup.state, "unknown"),
      trustedDone: rollup.trusted_done === true,
      hasChildren: rollup.has_children === true,
      childrenTotal: finiteNumber(rollup.children_total),
      childrenTrustedDone: finiteNumber(rollup.children_trusted_done),
      childrenComplete: rollup.children_complete === true,
      blockedChildren: (_n = rollup.blocked_children) != null ? _n : [],
      incompleteChildren: (_o = rollup.incomplete_children) != null ? _o : [],
      contradictions: (_p = rollup.contradictions) != null ? _p : []
    },
    contract: {
      version: normalizeText((_q = snapshot.contract) == null ? void 0 : _q.version, "\u672A\u63D0\u4F9B"),
      goal: normalizeText((_r = snapshot.contract) == null ? void 0 : _r.goal, "\u672A\u63D0\u4F9B"),
      scope: {
        included: ((_u = (_t = (_s = snapshot.contract) == null ? void 0 : _s.scope) == null ? void 0 : _t.included) != null ? _u : []).map(String),
        excluded: ((_x = (_w = (_v = snapshot.contract) == null ? void 0 : _v.scope) == null ? void 0 : _w.excluded) != null ? _x : []).map(String)
      },
      semanticStatus: normalizeText(
        (_y = snapshot.contract) == null ? void 0 : _y.semantic_status,
        "unknown"
      ),
      requirements: (_A = (_z = snapshot.contract) == null ? void 0 : _z.requirements) != null ? _A : [],
      scenarios: (_C = (_B = snapshot.contract) == null ? void 0 : _B.scenarios) != null ? _C : [],
      acceptance: (_E = (_D = snapshot.contract) == null ? void 0 : _D.acceptance) != null ? _E : []
    },
    evidence,
    observation: {
      health: observationHealth,
      currentTask: normalizeText((_F = snapshot.observation) == null ? void 0 : _F.current_task, "unknown"),
      parent: normalizeText((_G = snapshot.observation) == null ? void 0 : _G.parent, "unknown"),
      children: normalizeText((_H = snapshot.observation) == null ? void 0 : _H.children, "unknown"),
      tasknotesApi: normalizeText((_I = snapshot.observation) == null ? void 0 : _I.tasknotes_api, "unknown"),
      sourceIdentityMatch,
      sourceTaskId: normalizeText(snapshot.source_task_id, ""),
      generatedAt: normalizeText(snapshot.generated_at, "\u672A\u63D0\u4F9B"),
      isTrustworthy,
      trustMessage: isTrustworthy ? "\u89C2\u6D4B\u53EF\u4FE1" : "\u89C2\u6D4B\u4E0D\u53EF\u4FE1\uFF0C\u65E0\u6CD5\u5224\u65AD\u4EFB\u52A1\u662F\u5426\u6B63\u5E38",
      isStale: Boolean(staleReason) || ((_J = snapshot.observation) == null ? void 0 : _J.stale) === true,
      staleReason,
      loadedAt: normalizeText(options.loadedAt, "\u672A\u63D0\u4F9B"),
      sourceIdentity
    },
    primaryDiagnostic: (_K = diagnostics[0]) != null ? _K : null,
    diagnostics,
    nextAction: formatNextAction((_L = snapshot.next_actions) == null ? void 0 : _L[0])
  };
}
function validateSnapshotSource(value, expectedTaskPath) {
  const snapshot = isRecord(value) ? value : {};
  const actual = normalizeText(snapshot.source_task_id, "");
  const expected = normalizeText(expectedTaskPath, "");
  if (!actual || !expected) {
    return "unknown";
  }
  return actual === expected;
}
function formatRollupState(value) {
  var _a;
  const state = normalizeText(value, "unknown");
  const labels = {
    running: "\u4EFB\u52A1\u8FDB\u884C\u4E2D",
    blocked: "\u5B58\u5728\u963B\u585E\u5B50\u4EFB\u52A1",
    awaiting_current_verification: "\u7B49\u5F85\u5F53\u524D\u4EFB\u52A1\u9A8C\u8BC1",
    inconsistent: "\u7236\u5B50\u72B6\u6001\u77DB\u76FE",
    contract_invalid: "\u4EFB\u52A1\u5408\u540C\u65E0\u6548",
    done: "\u4EFB\u52A1\u53EF\u4FE1\u5B8C\u6210",
    unknown: "\u6C47\u603B\u72B6\u6001\u672A\u77E5"
  };
  return (_a = labels[state]) != null ? _a : state;
}
function formatChildEvidenceHealth(value) {
  const labels = {
    missing: "\u7F3A\u5931",
    invalid: "\u65E0\u6548",
    valid: "\u6709\u6548"
  };
  if (isRecord(value)) {
    return [
      `\u6267\u884C${labels[normalizeEvidenceValue(value.execution)]}`,
      `\u9A8C\u8BC1${labels[normalizeEvidenceValue(value.verification)]}`,
      `\u4EA4\u4ED8${labels[normalizeEvidenceValue(value.delivery)]}`
    ].join(" \xB7 ");
  }
  return labels[normalizeEvidenceValue(value)];
}
function formatCurrentTaskProgress(input) {
  if (input.hasChildren) {
    return `${input.childrenTrustedDone}/${input.childrenTotal} \u4E2A\u76F4\u63A5\u5B50\u4EFB\u52A1\u53EF\u4FE1\u5B8C\u6210`;
  }
  const acceptanceChecked = input.acceptance.filter(
    (item) => item.checked === true
  ).length;
  const evidenceValid = [
    input.evidence.execution,
    input.evidence.verification,
    input.evidence.delivery
  ].filter((health) => health === "valid").length;
  return `\u81EA\u8EAB\u9A8C\u6536 ${acceptanceChecked}/${input.acceptance.length} \xB7 \u8BC1\u636E ${evidenceValid}/3`;
}
function formatNextAction(action) {
  var _a;
  if (!action) {
    return null;
  }
  const summary = normalizeText(action.summary, "");
  if (summary) {
    return summary;
  }
  const kind = normalizeText(action.kind, "unknown");
  const labels = {
    continue_current_task: "\u7EE7\u7EED\u5F53\u524D\u4EFB\u52A1",
    resolve_child_blockers: "\u5904\u7406\u76F4\u63A5\u5B50\u4EFB\u52A1\u963B\u585E",
    complete_current_verification: "\u5B8C\u6210\u5F53\u524D\u4EFB\u52A1\u9A8C\u8BC1",
    resolve_contradictions: "\u5904\u7406\u7236\u5B50\u72B6\u6001\u77DB\u76FE",
    repair_contract: "\u4FEE\u590D\u5F53\u524D\u4EFB\u52A1\u5408\u540C"
  };
  const taskIds = Array.isArray(action.task_ids) ? action.task_ids.map(String).filter(Boolean) : [];
  const label = (_a = labels[kind]) != null ? _a : kind;
  return taskIds.length ? `${label}\uFF1A${taskIds.join("\u3001")}` : label;
}
function resolveDiagnosticTarget(taskPath, source) {
  const line = typeof (source == null ? void 0 : source.line_start) === "number" && source.line_start > 0 ? source.line_start : null;
  const heading = line === null ? normalizeText(source == null ? void 0 : source.after_section, normalizeText(source == null ? void 0 : source.section, "")) : normalizeText(source == null ? void 0 : source.section, "");
  return {
    linkText: heading ? `${taskPath}#${heading}` : taskPath,
    line,
    editorLine: line === null ? null : line - 1
  };
}
function createChildViewModel(child) {
  var _a;
  const id = normalizeText(child.id, "");
  return {
    id,
    title: normalizeText(child.title, id || "\u672A\u547D\u540D\u5B50\u4EFB\u52A1"),
    status: normalizeText(child.status, "unknown"),
    priority: normalizeText(child.priority, "\u672A\u63D0\u4F9B"),
    isBlocked: child.is_blocked === true,
    blockedBy: ((_a = child.blocked_by) != null ? _a : []).map(normalizeBlockedBy).filter(Boolean),
    goal: normalizeText(child.goal, "\u672A\u63D0\u4F9B"),
    hasChildren: child.has_children === true,
    rollupState: normalizeText(child.rollup_state, "unknown"),
    semanticStatus: normalizeText(child.semantic_status, "unknown"),
    evidenceHealth: normalizeEvidenceHealth(child.evidence_health),
    trustedDone: child.trusted_done === true,
    primaryDiagnostic: child.primary_diagnostic ? normalizeDiagnostic(child.primary_diagnostic, id) : null
  };
}
function normalizeParent(parent) {
  if (!parent) {
    return null;
  }
  return {
    id: normalizeText(parent.id, ""),
    title: normalizeText(parent.title, "\u672A\u547D\u540D\u7236\u4EFB\u52A1"),
    status: normalizeText(parent.status, "unknown")
  };
}
function normalizeDiagnostic(value, fallbackTaskId) {
  const diagnostic = isRecord(value) ? value : {};
  const reason = isRecord(diagnostic.reason) ? diagnostic.reason : {};
  const remediation = isRecord(diagnostic.remediation) ? diagnostic.remediation : {};
  return {
    code: normalizeText(diagnostic.code, "unknown_diagnostic"),
    severity: normalizeText(diagnostic.severity, "error"),
    taskId: normalizeText(diagnostic.task_id, fallbackTaskId),
    path: normalizeText(diagnostic.path, "\u672A\u63D0\u4F9B"),
    source: isRecord(diagnostic.source) ? diagnostic.source : void 0,
    reason: normalizeText(
      reason.actual,
      normalizeText(diagnostic.reason, "producer \u672A\u63D0\u4F9B")
    ),
    expected: normalizeText(reason.expected, "producer \u672A\u63D0\u4F9B"),
    remediation: normalizeText(
      remediation.summary,
      normalizeText(diagnostic.remediation, "producer \u672A\u63D0\u4F9B")
    )
  };
}
function normalizeBlockedBy(value) {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value)) {
    return normalizeText(value.uid, normalizeText(value.id, ""));
  }
  return "";
}
function normalizeEvidenceHealth(value) {
  return {
    execution: normalizeEvidenceValue(value == null ? void 0 : value.execution),
    verification: normalizeEvidenceValue(value == null ? void 0 : value.verification),
    delivery: normalizeEvidenceValue(value == null ? void 0 : value.delivery)
  };
}
function normalizeEvidenceValue(value) {
  return value === "valid" || value === "invalid" ? value : "missing";
}
function normalizeObservationHealth(value) {
  return value === "healthy" || value === "degraded" || value === "failed" || value === "error" ? value : "unknown";
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
      name: "\u663E\u793A\u5F53\u524D TaskNotes \u4EFB\u52A1",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = this.isTaskFile(file);
        if (checking) return canRun;
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
        if (view && file instanceof import_obsidian.TFile && view.observesTaskFile(file.path)) {
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
    if (leaf.view instanceof FlowDeskDashboardView) {
      await leaf.view.loadTask(taskPath);
    }
    workspace.revealLeaf(leaf);
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
    return buildSnapshotInvocation(
      {
        flowdeskRoot,
        taskPath,
        workingDirectory,
        apiUrl: this.settings.apiUrl.trim()
      },
      format
    );
  }
  async copyDashboardCommand(taskPath) {
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
  isTaskFile(file) {
    return Boolean(file && file.extension === "md" && isTaskPath(file.path));
  }
  getDashboardView() {
    const leaf = this.app.workspace.getLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE)[0];
    return (leaf == null ? void 0 : leaf.view) instanceof FlowDeskDashboardView ? leaf.view : null;
  }
  resolveFlowDeskRoot() {
    const candidates = [
      expandHomePath(this.settings.flowdeskRoot.trim()),
      expandHomePath(process.env.FLOWDESK_PLUGIN_ROOT || ""),
      path2.resolve(__dirname, "..", "..")
    ].filter(Boolean);
    for (const candidate of candidates) {
      if ((0, import_fs.existsSync)(path2.join(candidate, "bin", "flowdesk-execution-snapshot"))) {
        return candidate;
      }
    }
    throw new Error("\u672A\u627E\u5230 FlowDesk \u4ED3\u5E93\u8DEF\u5F84\uFF0C\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u914D\u7F6E FlowDesk repo path\u3002");
  }
};
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
    this.detailsOpen = false;
    this.detailsOpenInitialized = false;
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
  async syncToActiveFile(file = this.app.workspace.getActiveFile()) {
    var _a;
    const nextContext = resolveDashboardContext((_a = file == null ? void 0 : file.path) != null ? _a : null, this.previousTaskPath);
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
    this.displayState = null;
    this.queuedRequest = null;
    this.refreshScheduler.cancel();
    this.loading = false;
    this.error = "";
    this.render();
  }
  async loadTask(taskPath) {
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
  observesTaskFile(filePath) {
    var _a;
    return this.context.kind === "task" ? collectObservedTaskPaths(this.context.taskPath, (_a = this.displayState) == null ? void 0 : _a.snapshot).has(filePath) : false;
  }
  async loadCurrentTask() {
    if (this.context.kind === "task") await this.loadTask(this.context.taskPath);
  }
  async drainRefreshQueue() {
    while (this.queuedRequest) {
      const request = this.queuedRequest;
      this.queuedRequest = null;
      await this.loadTaskNow(request);
    }
  }
  async loadTaskNow(request) {
    var _a, _b;
    this.loading = true;
    this.error = "";
    this.render();
    try {
      const snapshot = await this.plugin.loadSnapshot(request.taskPath);
      if (!isCurrentSnapshotRequest(request, this.context, this.selectionRevision)) return;
      if (snapshot.snapshot_schema_version !== 3) {
        throw new Error("unsupported_snapshot_schema\uFF1ADashboard \u53EA\u652F\u6301 snapshot schema 3\u3002");
      }
      const sourceIdentity = validateSnapshotSource(snapshot, request.taskPath);
      if (sourceIdentity !== true) {
        throw new Error(
          `Snapshot source identity \u4E0D\u5339\u914D\uFF1A\u8BF7\u6C42 ${request.taskPath}\uFF0C\u8FD4\u56DE ${(_a = snapshot.source_task_id) != null ? _a : "\u672A\u63D0\u4F9B"}\u3002`
        );
      }
      this.displayState = {
        taskPath: request.taskPath,
        snapshot,
        loadedAt: formatTime(/* @__PURE__ */ new Date()),
        staleReason: ""
      };
    } catch (error) {
      if (!isCurrentSnapshotRequest(request, this.context, this.selectionRevision)) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.displayState = ((_b = this.displayState) == null ? void 0 : _b.taskPath) === request.taskPath ? { ...this.displayState, staleReason: this.error } : null;
    } finally {
      if (isCurrentSnapshotRequest(request, this.context, this.selectionRevision)) {
        this.loading = false;
        this.render();
      }
    }
  }
  render() {
    var _a;
    const container = this.contentEl;
    container.empty();
    container.addClass("flowdesk-dashboard");
    this.renderHeader(container);
    if (this.context.kind === "non-task") {
      this.renderNonTaskState(container, this.context);
      return;
    }
    if (this.context.kind === "empty") {
      container.createDiv({ cls: "flowdesk-empty", text: "\u5F53\u524D\u4E0D\u662F TaskNotes \u4EFB\u52A1\uFF0CFlowDesk Dashboard \u4E0D\u53EF\u7528\u3002" });
      return;
    }
    const taskPath = this.context.taskPath;
    const displayState = ((_a = this.displayState) == null ? void 0 : _a.taskPath) === taskPath ? this.displayState : null;
    const snapshot = displayState == null ? void 0 : displayState.snapshot;
    if (this.loading && !snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "\u6B63\u5728\u9996\u6B21\u8BFB\u53D6 snapshot v3..." });
      return;
    }
    if (this.error && !snapshot) {
      container.createDiv({ cls: "flowdesk-error", text: this.error });
      return;
    }
    if (!snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "\u5C1A\u672A\u8BFB\u53D6 snapshot\u3002" });
      return;
    }
    const model = createDashboardViewModel(snapshot, {
      expectedTaskPath: taskPath,
      loadedAt: displayState == null ? void 0 : displayState.loadedAt,
      staleReason: displayState == null ? void 0 : displayState.staleReason
    });
    if (model.errorCode) {
      container.createDiv({ cls: "flowdesk-error", text: "Dashboard \u53EA\u652F\u6301 snapshot schema 3\u3002" });
      return;
    }
    this.renderBreadcrumb(container, model);
    this.renderTrustStrip(container, model);
    this.renderCurrentTaskHero(container, model);
    this.renderPrimaryDiagnostic(container, model);
    this.renderNextAction(container, model);
    if (model.currentTask.hasChildren) {
      this.renderChildren(container, model);
    }
    this.renderDetails(container, model);
  }
  renderHeader(container) {
    const header = container.createDiv({ cls: "flowdesk-dashboard-header" });
    const title = header.createDiv();
    title.createDiv({ cls: "flowdesk-dashboard-title", text: "FlowDesk \u5F53\u524D\u4EFB\u52A1 Dashboard" });
    title.createDiv({
      cls: "flowdesk-dashboard-path",
      text: this.context.kind === "task" ? this.context.taskPath : this.context.kind === "non-task" ? this.context.activePath : "\u672A\u9009\u62E9\u4EFB\u52A1"
    });
    const toolbar = header.createDiv({ cls: "flowdesk-dashboard-toolbar" });
    if (this.context.kind !== "task") return;
    const taskPath = this.context.taskPath;
    const copy = toolbar.createEl("button", { text: "\u590D\u5236 CLI" });
    copy.addEventListener("click", async () => {
      try {
        await this.plugin.copyDashboardCommand(taskPath);
        new import_obsidian.Notice("CLI \u547D\u4EE4\u5DF2\u590D\u5236");
      } catch (error) {
        new import_obsidian.Notice(`\u65E0\u6CD5\u590D\u5236 CLI \u547D\u4EE4\uFF1A${String(error)}`);
      }
    });
    const refresh = toolbar.createEl("button", { text: this.loading ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0" });
    refresh.disabled = this.loading;
    refresh.addEventListener("click", () => void this.refreshCurrentTask());
  }
  renderBreadcrumb(container, model) {
    if (!model.parent) {
      return;
    }
    const breadcrumb = container.createDiv({ cls: "flowdesk-breadcrumb" });
    const parent = breadcrumb.createEl("button", { text: model.parent.title });
    parent.addEventListener("click", () => {
      var _a, _b;
      void this.app.workspace.openLinkText(
        (_b = (_a = model.parent) == null ? void 0 : _a.id) != null ? _b : "",
        model.currentTask.id,
        false
      );
    });
    breadcrumb.createSpan({ text: "/" });
    breadcrumb.createSpan({ cls: "flowdesk-breadcrumb-current", text: model.currentTask.title });
  }
  renderNonTaskState(container, context) {
    const card = container.createDiv({ cls: "flowdesk-context-pause" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "Dashboard \u4E0D\u53EF\u7528" });
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: "\u5F53\u524D\u4E0D\u662F TaskNotes \u4EFB\u52A1\uFF0CFlowDesk Dashboard \u4E0D\u53EF\u7528\u3002"
    });
    card.createDiv({ cls: "flowdesk-subline", text: `\u5F53\u524D\u6587\u4EF6\uFF1A${context.activePath}` });
    if (context.previousTaskPath) {
      const back = card.createEl("button", { text: "\u56DE\u5230\u4E0A\u4E00\u6B21\u4EFB\u52A1" });
      back.addEventListener("click", () => void this.openTask(context.previousTaskPath));
    }
  }
  renderTrustStrip(container, model) {
    const state = model.observation.isStale ? "stale" : model.observation.health;
    const strip = container.createDiv({ cls: `flowdesk-trust-strip is-${state}` });
    strip.createSpan({
      cls: "flowdesk-trust-badge",
      text: model.observation.isStale ? "\u65E7\u6570\u636E" : model.observation.trustMessage
    });
    strip.createSpan({ text: `${model.schemaLabel} \xB7 ${model.observation.generatedAt}` });
    if (!model.observation.isTrustworthy) {
      strip.createDiv({ cls: "flowdesk-warning", text: "\u89C2\u6D4B\u4E0D\u53EF\u4FE1\uFF0C\u65E0\u6CD5\u5224\u65AD\u4EFB\u52A1\u662F\u5426\u6B63\u5E38" });
    }
    if (model.observation.isStale) {
      strip.createDiv({ cls: "flowdesk-stale-reason", text: `\u5237\u65B0\u5931\u8D25\uFF1A${model.observation.staleReason}` });
    }
  }
  renderCurrentTaskHero(container, model) {
    const hero = container.createDiv({ cls: "flowdesk-current-task-hero" });
    hero.createDiv({ cls: "flowdesk-card-kicker", text: "\u5F53\u524D\u4EFB\u52A1" });
    const title = hero.createDiv({ cls: "flowdesk-hero-title-row" });
    title.createDiv({ cls: "flowdesk-hero-title", text: model.currentTask.title });
    title.createSpan({
      cls: `flowdesk-state-pill is-${normalizeStatus(model.currentTask.status)}`,
      text: formatStatusLabel(model.currentTask.status)
    });
    const metrics = hero.createDiv({ cls: "flowdesk-hero-metrics" });
    metricCard(metrics, "\u5F53\u524D gate", formatRollupState(model.currentTask.rollupState));
    metricCard(
      metrics,
      "\u53EF\u4FE1\u8FDB\u5EA6",
      formatCurrentTaskProgress({
        hasChildren: model.currentTask.hasChildren,
        childrenTrustedDone: model.rollup.childrenTrustedDone,
        childrenTotal: model.rollup.childrenTotal,
        acceptance: model.contract.acceptance,
        evidence: model.evidence
      })
    );
    metricCard(metrics, "Priority", formatPriority(model.currentTask.priority));
    if (model.currentTask.isBlocked) {
      hero.createDiv({
        cls: "flowdesk-warning",
        text: model.currentTask.blockedBy.length ? `\u5F53\u524D\u4EFB\u52A1\u88AB\u963B\u585E\uFF1A${model.currentTask.blockedBy.join("\u3001")}` : "\u5F53\u524D\u4EFB\u52A1\u5904\u4E8E\u963B\u585E\u72B6\u6001"
      });
    }
  }
  renderPrimaryDiagnostic(container, model) {
    const card = container.createDiv({ cls: "flowdesk-primary-status" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "\u9996\u8981\u8BCA\u65AD" });
    if (!model.primaryDiagnostic) {
      card.createDiv({
        cls: "flowdesk-primary-title",
        text: model.observation.isTrustworthy ? "\u5F53\u524D\u6CA1\u6709\u7ED3\u6784\u5316\u8BCA\u65AD" : "\u89C2\u6D4B\u4E0D\u53EF\u4FE1\uFF0C\u65E0\u6CD5\u786E\u8BA4\u65E0\u5F02\u5E38"
      });
      return;
    }
    card.createDiv({ cls: "flowdesk-primary-title", text: model.primaryDiagnostic.code });
    this.renderDiagnosticBody(card, model.primaryDiagnostic);
  }
  renderDiagnosticBody(container, diagnostic) {
    const target = resolveDiagnosticTarget(diagnostic.taskId, diagnostic.source);
    diagnosticRow(container, "\u4EFB\u52A1", diagnostic.taskId);
    diagnosticRow(container, "\u4F4D\u7F6E", target.line ? `${target.linkText} \xB7 \u7B2C ${target.line} \u884C` : target.linkText);
    diagnosticRow(container, "\u5B57\u6BB5\u8DEF\u5F84", diagnostic.path);
    diagnosticRow(container, "\u539F\u56E0", diagnostic.reason);
    diagnosticRow(container, "\u9884\u671F", diagnostic.expected);
    diagnosticRow(container, "\u5EFA\u8BAE\u4FEE\u6CD5", diagnostic.remediation);
    const open = container.createEl("button", { text: "\u6253\u5F00\u8BCA\u65AD\u4F4D\u7F6E" });
    open.addEventListener("click", () => {
      void this.openDiagnosticLocation(diagnostic);
    });
  }
  async openDiagnosticLocation(diagnostic) {
    var _a;
    const target = resolveDiagnosticTarget(diagnostic.taskId, diagnostic.source);
    if (!diagnostic.taskId || target.linkText === diagnostic.taskId && target.line === null) {
      new import_obsidian.Notice("producer \u672A\u63D0\u4F9B\u53EF\u5B9A\u4F4D\u7684 task\u3001section \u6216\u884C\u53F7\u3002");
      return;
    }
    try {
      await this.app.workspace.openLinkText(target.linkText, diagnostic.taskId, false);
      if (target.editorLine === null) return;
      const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (!view || ((_a = view.file) == null ? void 0 : _a.path) !== diagnostic.taskId) {
        new import_obsidian.Notice("\u4EFB\u52A1\u5DF2\u6253\u5F00\uFF0C\u4F46\u5F53\u524D\u89C6\u56FE\u65E0\u6CD5\u5B9A\u4F4D\u5230\u5177\u4F53\u884C\u3002");
        return;
      }
      if (target.editorLine >= view.editor.lineCount()) {
        new import_obsidian.Notice(`\u8BCA\u65AD\u884C\u53F7\u5DF2\u8D85\u51FA\u5F53\u524D\u6587\u4EF6\u8303\u56F4\uFF1A${target.line}`);
        return;
      }
      const position = { line: target.editorLine, ch: 0 };
      view.editor.setCursor(position);
      view.editor.scrollIntoView({ from: position, to: position }, true);
      view.editor.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian.Notice(`\u65E0\u6CD5\u5B9A\u4F4D\u8BCA\u65AD\u4F4D\u7F6E\uFF1A${message}`);
    }
  }
  renderNextAction(container, model) {
    var _a;
    const card = container.createDiv({ cls: "flowdesk-primary-action" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "\u4E0B\u4E00\u52A8\u4F5C" });
    card.createDiv({ cls: "flowdesk-primary-title", text: (_a = model.nextAction) != null ? _a : "snapshot \u672A\u63D0\u4F9B\u4E0B\u4E00\u52A8\u4F5C" });
    const copy = card.createEl("button", { text: "\u590D\u5236\u5F53\u524D\u4EFB\u52A1 CLI" });
    copy.addEventListener("click", async () => {
      try {
        await this.plugin.copyDashboardCommand(model.currentTask.id);
        new import_obsidian.Notice("\u5F53\u524D\u4EFB\u52A1 CLI \u547D\u4EE4\u5DF2\u590D\u5236");
      } catch (error) {
        new import_obsidian.Notice(`\u65E0\u6CD5\u590D\u5236 CLI \u547D\u4EE4\uFF1A${String(error)}`);
      }
    });
  }
  renderChildren(container, model) {
    const children = model.children;
    const section = createSection(container, `\u76F4\u63A5\u5B50\u4EFB\u52A1\uFF08${children.length}\uFF09`);
    section.addClass("flowdesk-child-rollup");
    childMeta(
      section,
      "\u53EF\u4FE1\u8FDB\u5EA6",
      `${model.rollup.childrenTrustedDone}/${model.rollup.childrenTotal}`
    );
    childMeta(section, "\u6C47\u603B\u72B6\u6001", formatRollupState(model.rollup.state));
    const list = section.createDiv({ cls: "flowdesk-child-list" });
    for (const child of children) {
      const card = list.createDiv({ cls: `flowdesk-child-card${child.isBlocked ? " is-blocked" : ""}` });
      const header = card.createDiv({ cls: "flowdesk-child-header" });
      header.createSpan({ cls: `flowdesk-status-dot is-${normalizeStatus(child.status)}`, text: statusSymbol(child.status) });
      header.createDiv({ cls: "flowdesk-child-title", text: child.title });
      header.createSpan({ cls: "flowdesk-priority", text: formatPriority(child.priority) });
      card.createDiv({ cls: "flowdesk-subline", text: child.id });
      card.createDiv({ cls: "flowdesk-child-goal", text: child.goal });
      childMeta(card, "\u72B6\u6001", `${formatStatusLabel(child.status)}${child.trustedDone ? " \xB7 \u53EF\u4FE1\u5B8C\u6210" : ""}`);
      childMeta(card, "Blocked by", child.blockedBy.length ? child.blockedBy.join("\u3001") : "\u65E0");
      childMeta(card, "\u4E0B\u4E00\u5C42", child.hasChildren ? "\u6709 direct children" : "leaf task");
      childMeta(card, "\u6C47\u603B", formatRollupState(child.rollupState));
      childMeta(card, "\u8BC1\u636E", formatChildEvidenceHealth(child.evidenceHealth));
      if (child.primaryDiagnostic) {
        childMeta(card, "\u9996\u8981\u8BCA\u65AD", child.primaryDiagnostic.reason);
      }
      const open = card.createEl("button", { text: "\u6253\u5F00\u4EFB\u52A1" });
      open.addEventListener("click", () => void this.openTask(child.id));
    }
  }
  renderDetails(container, model) {
    var _a;
    const details = container.createEl("details", {
      cls: `flowdesk-detail-group${model.currentTask.hasChildren ? "" : " flowdesk-leaf-contract"}`
    });
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
    details.addEventListener("toggle", () => this.detailsOpen = details.open);
    details.createEl("summary", { text: "\u5F53\u524D\u4EFB\u52A1\u5408\u540C\u4E0E\u8BC1\u636E" });
    const body = details.createDiv({ cls: "flowdesk-detail-body" });
    const observation = createSection(body, "Observation");
    childMeta(observation, "health", model.observation.health);
    childMeta(observation, "parent", model.observation.parent);
    childMeta(observation, "children", model.observation.children);
    childMeta(observation, "TaskNotes API", model.observation.tasknotesApi);
    childMeta(observation, "source", model.observation.sourceTaskId || "\u672A\u63D0\u4F9B");
    const contract = createSection(body, "Task Contract v3");
    childMeta(contract, "\u7248\u672C", model.contract.version);
    childMeta(contract, "\u8BED\u4E49\u72B6\u6001", model.contract.semanticStatus);
    childMeta(contract, "Goal", model.contract.goal);
    renderTextList(contract, "Scope \xB7 \u5305\u542B", model.contract.scope.included);
    renderTextList(contract, "Scope \xB7 \u4E0D\u5305\u542B", model.contract.scope.excluded);
    renderContractItems(contract, "Requirements", model.contract.requirements);
    renderContractItems(contract, "Scenarios", model.contract.scenarios);
    const acceptance = createSection(body, "Acceptance Criteria");
    if (!model.contract.acceptance.length) {
      acceptance.createDiv({ cls: "flowdesk-muted", text: "producer \u672A\u63D0\u4F9B\u9A8C\u6536\u9879\u3002" });
    }
    for (const item of model.contract.acceptance) {
      acceptance.createDiv({ text: `${item.checked ? "\u2611" : "\u2610"} ${(_a = item.text) != null ? _a : "\u672A\u63D0\u4F9B"}` });
    }
    const evidence = createSection(body, "Current task evidence");
    evidenceRow(evidence, "\u6267\u884C\u7ED3\u679C", model.evidence.execution);
    evidenceRow(evidence, "\u9A8C\u8BC1\u7ED3\u679C", model.evidence.verification);
    evidenceRow(evidence, "\u4EA4\u4ED8\u8BB0\u5F55", model.evidence.delivery);
    if (model.diagnostics.length > 1) {
      const diagnostics = createSection(body, `\u5168\u90E8\u8BCA\u65AD\uFF08${model.diagnostics.length}\uFF09`);
      for (const diagnostic of model.diagnostics) {
        const item = diagnostics.createDiv({ cls: "flowdesk-diagnostic-item" });
        item.createDiv({ cls: "flowdesk-main-text", text: diagnostic.code });
        this.renderDiagnosticBody(item, diagnostic);
      }
    }
  }
  async openTask(taskPath) {
    if (!taskPath) return;
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice(`\u672A\u627E\u5230\u4EFB\u52A1\u6587\u4EF6\uFF1A${taskPath}`);
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file);
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
    new import_obsidian.Setting(containerEl).setName("FlowDesk \u4ED3\u5E93\u8DEF\u5F84").setDesc("\u672C\u5730 FlowDesk-Plugin \u4ED3\u5E93\u8DEF\u5F84\u3002").addText(
      (text) => text.setPlaceholder("/Users/me/workspaces/flowdesk-plugin").setValue(this.plugin.settings.flowdeskRoot).onChange(async (value) => {
        this.plugin.settings.flowdeskRoot = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5DE5\u4F5C\u76EE\u5F55").setDesc("\u4F20\u7ED9 --working-directory\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528 FlowDesk \u4ED3\u5E93\u8DEF\u5F84\u3002").addText(
      (text) => text.setValue(this.plugin.settings.workingDirectory).onChange(async (value) => {
        this.plugin.settings.workingDirectory = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("TaskNotes API \u5730\u5740").setDesc("\u53EF\u9009\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528 FlowDesk CLI \u9ED8\u8BA4\u503C\u3002").addText(
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
  return section;
}
function metricCard(container, label, value) {
  const card = container.createDiv({ cls: "flowdesk-metric" });
  card.createDiv({ cls: "flowdesk-metric-label", text: label });
  card.createDiv({ cls: "flowdesk-metric-value", text: value });
}
function childMeta(container, label, value) {
  const row = container.createDiv({ cls: "flowdesk-meta-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}\uFF1A` });
  row.createSpan({ text: value });
}
function renderTextList(container, label, values) {
  const section = container.createDiv({ cls: "flowdesk-contract-list" });
  section.createDiv({ cls: "flowdesk-summary-label", text: label });
  if (!values.length) {
    section.createDiv({ cls: "flowdesk-muted", text: "\u65E0" });
    return;
  }
  for (const value of values) {
    section.createDiv({ text: `\u2022 ${value}` });
  }
}
function renderContractItems(container, label, items) {
  var _a, _b, _c;
  const section = container.createDiv({ cls: "flowdesk-contract-list" });
  section.createDiv({ cls: "flowdesk-summary-label", text: label });
  if (!items.length) {
    section.createDiv({ cls: "flowdesk-muted", text: "\u65E0" });
    return;
  }
  for (const item of items) {
    const coverage = ((_a = item.requirement_ids) == null ? void 0 : _a.length) ? ` (${item.requirement_ids.join("\u3001")})` : "";
    section.createDiv({
      text: `${(_b = item.id) != null ? _b : "\u672A\u7F16\u53F7"}${coverage}\uFF1A${(_c = item.text) != null ? _c : "\u672A\u63D0\u4F9B"}`
    });
  }
}
function diagnosticRow(container, label, value) {
  const row = container.createDiv({ cls: "flowdesk-diagnostic-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}\uFF1A` });
  row.createSpan({ text: value });
}
function evidenceRow(container, label, health) {
  const state = getEvidenceDisplayState(health);
  const row = container.createDiv({ cls: "flowdesk-evidence-row" });
  row.createSpan({ cls: `flowdesk-status-dot is-${state}`, text: statusSymbol(state) });
  row.createSpan({ text: formatEvidenceSummary(label, health) });
}
function normalizeStatus(value) {
  const status = String(value || "unknown").toLowerCase().replace(/_/g, "-");
  if (status === "in-progress") return "running";
  if (status === "complete" || status === "completed") return "done";
  return ["done", "running", "open", "blocked", "error", "valid", "invalid", "unknown"].includes(status) ? status : "unknown";
}
function formatStatusLabel(value) {
  var _a;
  const labels = {
    done: "\u5DF2\u5B8C\u6210",
    running: "\u8FDB\u884C\u4E2D",
    open: "\u5F85\u5F00\u59CB",
    blocked: "\u5DF2\u963B\u585E",
    error: "\u5F02\u5E38",
    unknown: "\u672A\u77E5"
  };
  return (_a = labels[normalizeStatus(value)]) != null ? _a : String(value || "\u672A\u77E5");
}
function formatPriority(value) {
  var _a;
  const labels = { high: "\u9AD8", normal: "\u666E\u901A", low: "\u4F4E" };
  return (_a = labels[value]) != null ? _a : value;
}
function statusSymbol(value) {
  const status = normalizeStatus(value);
  if (status === "done" || status === "valid") return "\u2713";
  if (status === "running") return "\u25C9";
  if (status === "blocked" || status === "error" || status === "invalid") return "!";
  return "\u2022";
}
function expandHomePath(value) {
  if (value === "~") return (0, import_os.homedir)();
  if (value.startsWith("~/")) return path2.join((0, import_os.homedir)(), value.slice(2));
  return value;
}
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function formatSnapshotCommandError(error) {
  const failure = error;
  const stderr = typeof failure.stderr === "string" ? failure.stderr.trim() : "";
  const stdout = typeof failure.stdout === "string" ? failure.stdout.trim() : "";
  const message = error instanceof Error ? error.message : String(error);
  const output = stderr || stdout || message;
  const unavailable = output.match(/TaskNotes HTTP API unavailable at (\S+)/);
  if (unavailable) {
    return `TaskNotes HTTP API \u5C1A\u672A\u5C31\u7EEA\uFF1A${unavailable[1]}
\u8BF7\u786E\u8BA4 Obsidian \u548C TaskNotes HTTP API \u5DF2\u542F\u52A8\u540E\u518D\u5237\u65B0\u3002`;
  }
  if (output.includes("Connection refused")) {
    return "TaskNotes HTTP API \u8FDE\u63A5\u88AB\u62D2\u7EDD\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0\u5E76\u68C0\u67E5 API URL\u3002";
  }
  const runtime = output.match(/RuntimeError: ([\s\S]+)$/);
  return runtime ? `FlowDesk snapshot \u8BFB\u53D6\u5931\u8D25\uFF1A${runtime[1].trim()}` : `FlowDesk snapshot \u547D\u4EE4\u5931\u8D25\uFF1A${message}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FLOWDESK_DASHBOARD_VIEW_TYPE
});
