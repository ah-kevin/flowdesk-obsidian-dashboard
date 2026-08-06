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
function registerInitialDashboardSync(registerLayoutReady, sync) {
  let active = true;
  registerLayoutReady(() => {
    if (active) {
      sync();
    }
  });
  return () => {
    active = false;
  };
}
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
function validateSnapshotEnvelope(value, requestedTaskPath) {
  const snapshot = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
  if (snapshot.snapshot_schema_version !== 3) {
    return `Snapshot schema \u4E0D\u53D7\u652F\u6301\uFF1A\u9700\u8981 3\uFF1B\u8BF7\u6C42 ${requestedTaskPath}\uFF0C\u5B9E\u9645 schema ${formatEnvelopeValue(snapshot.snapshot_schema_version)}\u3002`;
  }
  if (snapshot.snapshot_model !== "task-centric") {
    return `Snapshot model \u4E0D\u53D7\u652F\u6301\uFF1A\u9700\u8981 task-centric\uFF1B\u8BF7\u6C42 ${requestedTaskPath}\uFF0C\u5B9E\u9645 model ${formatEnvelopeValue(snapshot.snapshot_model)}\u3002`;
  }
  if (snapshot.source_task_id !== requestedTaskPath) {
    return `Snapshot source identity \u4E0D\u5339\u914D\uFF1A\u8BF7\u6C42 ${requestedTaskPath}\uFF0C\u8FD4\u56DE ${formatEnvelopeValue(snapshot.source_task_id)}\u3002`;
  }
  return null;
}
function resolveRefreshFailureDisplay(displayState, requestedTaskPath, staleReason, failureKind = "recoverable") {
  if (failureKind === "invalid-envelope") {
    return null;
  }
  return (displayState == null ? void 0 : displayState.taskPath) === requestedTaskPath ? { ...displayState, staleReason } : null;
}
function resolveSnapshotEnvelopeFailure(displayState, requestedTaskPath, snapshot) {
  const error = validateSnapshotEnvelope(snapshot, requestedTaskPath);
  return {
    error,
    displayState: error ? resolveRefreshFailureDisplay(
      displayState,
      requestedTaskPath,
      error,
      "invalid-envelope"
    ) : displayState
  };
}
function formatEnvelopeValue(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "\u672A\u63D0\u4F9B";
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
function resolveDiagnosticNavigation(taskPath, source) {
  return {
    canOpen: Boolean(taskPath.trim()),
    target: resolveDiagnosticTarget(taskPath, source)
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

// src/dashboard-presentation.ts
function resolveDisclosureState(previous, taskChanged) {
  if (!previous || taskChanged) {
    return { summaryOpen: true, fullOpen: false };
  }
  return previous;
}
function isActivationKey(key) {
  return key === "Enter" || key === " " || key === "Spacebar";
}
function formatTaskShellStatus(loading, error) {
  if (error) return "\u8BFB\u53D6\u5931\u8D25";
  return loading ? "\u6B63\u5728\u5EFA\u7ACB\u53EF\u4FE1\u89C2\u5BDF\u2026" : "\u5C1A\u672A\u8BFB\u53D6 snapshot";
}
function createDashboardPresentation(model) {
  const kind = model.currentTask.hasChildren ? "parent" : "leaf";
  return {
    kind,
    header: {
      title: model.currentTask.title,
      status: formatTaskStatus(model.currentTask.status),
      statusTone: taskStatusTone(model.currentTask.status, model.currentTask.isBlocked),
      priority: formatPriority(model.currentTask.priority),
      kindLabel: kind === "parent" ? "\u7236\u4EFB\u52A1" : "\u53F6\u5B50\u4EFB\u52A1",
      parent: model.parent ? { id: model.parent.id, title: model.parent.title } : null
    },
    trust: createTrustSummary(model),
    primaryStatus: createPrimaryStatus(model),
    children: kind === "parent" ? model.children.map(createChildRow) : [],
    contract: createContractSummary(model)
  };
}
function formatTaskStatus(value) {
  var _a;
  const labels = {
    done: "\u5DF2\u5B8C\u6210",
    complete: "\u5DF2\u5B8C\u6210",
    completed: "\u5DF2\u5B8C\u6210",
    "in-progress": "\u8FDB\u884C\u4E2D",
    running: "\u8FDB\u884C\u4E2D",
    open: "\u5F85\u5F00\u59CB",
    blocked: "\u5DF2\u963B\u585E",
    error: "\u5F02\u5E38",
    unknown: "\u672A\u77E5"
  };
  return (_a = labels[normalizeToken(value)]) != null ? _a : String(value || "\u672A\u77E5");
}
function taskStatusTone(value, isBlocked = false) {
  if (isBlocked) return "error";
  const status = normalizeToken(value);
  if (["done", "complete", "completed"].includes(status)) return "healthy";
  if (["in-progress", "running"].includes(status)) return "running";
  if (["blocked", "error", "invalid"].includes(status)) return "error";
  return "muted";
}
function createTrustSummary(model) {
  const contractLabel = model.contract.semanticStatus === "valid" ? "\u5408\u540C\u6709\u6548" : model.contract.semanticStatus === "invalid" ? "\u5408\u540C\u5B58\u5728\u95EE\u9898" : "\u5408\u540C\u72B6\u6001\u672A\u77E5";
  if (model.observation.isStale) {
    return {
      tone: "warning",
      label: "\u663E\u793A\u4E0A\u6B21\u6210\u529F\u7ED3\u679C",
      contractLabel,
      meta: `${model.schemaLabel} \xB7 \u8BFB\u53D6\u4E8E ${model.observation.loadedAt}`,
      detail: model.observation.staleReason || "snapshot \u5DF2\u6807\u8BB0\u4E3A\u65E7\u6570\u636E"
    };
  }
  if (!model.observation.isTrustworthy) {
    return {
      tone: "error",
      label: "\u89C2\u5BDF\u4E0D\u53EF\u4FE1",
      contractLabel,
      meta: `${model.schemaLabel} \xB7 ${model.observation.generatedAt}`,
      detail: "\u65E0\u6CD5\u786E\u8BA4 snapshot \u662F\u5426\u5B8C\u6574\u5BF9\u5E94\u5F53\u524D\u4EFB\u52A1"
    };
  }
  return {
    tone: "healthy",
    label: "\u89C2\u5BDF\u53EF\u4FE1",
    contractLabel,
    meta: `${model.schemaLabel} \xB7 ${model.observation.generatedAt}`,
    detail: "\u6765\u6E90\u5339\u914D\uFF0C\u5DF2\u8BFB\u53D6\u5F53\u524D\u4EFB\u52A1\u3001\u7236\u4EFB\u52A1\u4E0E\u76F4\u63A5\u5B50\u4EFB\u52A1"
  };
}
function createPrimaryStatus(model) {
  if (model.observation.isStale) {
    return {
      tone: "warning",
      title: "\u5F53\u524D\u663E\u793A\u7684\u662F\u4E0A\u6B21\u6210\u529F\u7ED3\u679C",
      reason: model.observation.staleReason || "\u672C\u6B21\u5237\u65B0\u672A\u53D6\u5F97\u53EF\u4FE1 snapshot",
      remediation: "\u68C0\u67E5 TaskNotes API \u6216 FlowDesk snapshot \u547D\u4EE4\u540E\u91CD\u8BD5",
      location: "\u5F53\u524D\u4EFB\u52A1",
      diagnostic: null
    };
  }
  if (!model.observation.isTrustworthy) {
    return {
      tone: "error",
      title: "\u65E0\u6CD5\u786E\u8BA4\u5F53\u524D\u4EFB\u52A1\u72B6\u6001",
      reason: "snapshot \u89C2\u5BDF\u3001\u6765\u6E90\u6216\u6570\u636E\u5B8C\u6574\u6027\u6821\u9A8C\u672A\u901A\u8FC7",
      remediation: "\u5C55\u5F00\u6280\u672F\u8BE6\u60C5\u786E\u8BA4 observation \u4E0E source identity",
      location: "\u5F53\u524D\u4EFB\u52A1",
      diagnostic: null
    };
  }
  if (model.primaryDiagnostic) {
    return createDiagnosticStatus(model.primaryDiagnostic);
  }
  if (model.contract.semanticStatus !== "valid") {
    return {
      tone: "error",
      title: "\u4EFB\u52A1\u5408\u540C\u5B58\u5728\u95EE\u9898",
      reason: `producer \u5C06\u5408\u540C\u6807\u8BB0\u4E3A ${model.contract.semanticStatus}\uFF0C\u4F46\u6CA1\u6709\u8FD4\u56DE\u7ED3\u6784\u5316\u8BCA\u65AD`,
      remediation: "\u5C55\u5F00\u5B8C\u6574\u8BE6\u60C5\u6838\u5BF9\u5408\u540C\u5B57\u6BB5\uFF0C\u5E76\u4F7F\u7528 CLI \u83B7\u53D6 producer \u539F\u59CB\u8F93\u51FA",
      location: "\u4EFB\u52A1\u5408\u540C",
      diagnostic: null
    };
  }
  return {
    tone: "healthy",
    title: "\u5DF2\u8BFB\u53D6\u5F53\u524D\u4EFB\u52A1\uFF0C\u672A\u53D1\u73B0\u7ED3\u6784\u5316\u8BCA\u65AD",
    reason: "\u5DF2\u68C0\u67E5\u4EFB\u52A1\u5408\u540C\u4E0E\u6267\u884C\u8BC1\u636E",
    remediation: model.nextAction || "\u7EE7\u7EED\u6309\u5F53\u524D\u4EFB\u52A1\u5408\u540C\u6267\u884C",
    location: "\u5F53\u524D\u4EFB\u52A1",
    diagnostic: null
  };
}
function createDiagnosticStatus(diagnostic) {
  return {
    tone: diagnostic.severity === "warning" ? "warning" : "error",
    title: diagnosticTitle(diagnostic.path),
    reason: diagnostic.reason,
    remediation: diagnostic.remediation,
    location: diagnosticLocation(diagnostic),
    diagnostic
  };
}
function createChildRow(child) {
  var _a, _b;
  const meta = [];
  if (child.blockedBy.length) {
    meta.push(`\u963B\u585E\u4E8E ${child.blockedBy.map(formatTaskReference).join("\u3001")}`);
  }
  meta.push(formatChildEvidenceIssues(child.evidenceHealth));
  return {
    id: child.id,
    title: child.title,
    status: formatTaskStatus(child.status),
    tone: taskStatusTone(child.status, child.isBlocked),
    summary: (_b = (_a = child.primaryDiagnostic) == null ? void 0 : _a.reason) != null ? _b : formatRollupState(child.rollupState),
    meta: meta.join(" \xB7 ")
  };
}
function formatTaskReference(taskId) {
  const filename = taskId.split("/").pop() || taskId;
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}
function createContractSummary(model) {
  const checked = model.contract.acceptance.filter(
    (item) => item.checked === true
  ).length;
  return {
    goal: model.contract.goal,
    coverage: `REQ ${model.contract.requirements.length} \xB7 SCN ${model.contract.scenarios.length}`,
    acceptance: `\u9A8C\u6536 ${checked}/${model.contract.acceptance.length}`,
    evidence: formatEvidence(model.evidence),
    diagnostics: `${model.diagnostics.length} \u4E2A\u8BCA\u65AD`
  };
}
function diagnosticTitle(path3) {
  const labels = {
    "contract.goal": "\u4EFB\u52A1\u76EE\u6807\u9700\u8981\u4FEE\u590D",
    "evidence.execution": "\u6267\u884C\u7ED3\u679C\u9700\u8981\u4FEE\u590D",
    "evidence.verification": "\u9A8C\u8BC1\u7ED3\u679C\u9700\u8981\u4FEE\u590D",
    "evidence.delivery": "\u4EA4\u4ED8\u8BB0\u5F55\u9700\u8981\u4FEE\u590D"
  };
  if (labels[path3]) return labels[path3];
  if (path3.startsWith("contract.")) return "\u4EFB\u52A1\u5408\u540C\u9700\u8981\u4FEE\u590D";
  if (path3.startsWith("evidence.")) return "\u6267\u884C\u8BC1\u636E\u9700\u8981\u4FEE\u590D";
  return "\u5F53\u524D\u4EFB\u52A1\u9700\u8981\u5904\u7406\u4E00\u9879\u8BCA\u65AD";
}
function diagnosticLocation(diagnostic) {
  var _a, _b, _c;
  const section = ((_a = diagnostic.source) == null ? void 0 : _a.section) || ((_b = diagnostic.source) == null ? void 0 : _b.after_section);
  const line = (_c = diagnostic.source) == null ? void 0 : _c.line_start;
  if (section && typeof line === "number" && line > 0) {
    return `${section} \xB7 \u7B2C ${line} \u884C`;
  }
  if (section) return section;
  return "\u4EFB\u52A1\u6587\u4EF6";
}
function formatChildEvidenceIssues(evidence) {
  const labels = [
    ["\u6267\u884C", evidence.execution],
    ["\u9A8C\u8BC1", evidence.verification],
    ["\u4EA4\u4ED8", evidence.delivery]
  ];
  const issues = labels.filter(([, health]) => health !== "valid").map(([label, health]) => `${label}${health === "invalid" ? "\u65E0\u6548" : "\u7F3A\u5931"}`);
  return issues.length ? issues.join(" \xB7 ") : "\u8BC1\u636E\u5B8C\u6574";
}
function formatEvidence(evidence) {
  const healthLabel = {
    valid: "\u6709\u6548",
    invalid: "\u65E0\u6548",
    missing: "\u7F3A\u5931"
  };
  return [
    `\u6267\u884C${healthLabel[evidence.execution]}`,
    `\u9A8C\u8BC1${healthLabel[evidence.verification]}`,
    `\u4EA4\u4ED8${healthLabel[evidence.delivery]}`
  ].join(" \xB7 ");
}
function formatPriority(value) {
  var _a;
  const labels = {
    high: "\u9AD8\u4F18\u5148\u7EA7",
    normal: "\u666E\u901A\u4F18\u5148\u7EA7",
    low: "\u4F4E\u4F18\u5148\u7EA7"
  };
  return (_a = labels[value]) != null ? _a : value;
}
function normalizeToken(value) {
  return String(value || "unknown").toLowerCase().replace(/_/g, "-");
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
    this.cancelInitialSync = null;
    this.disclosureState = resolveDisclosureState(void 0, true);
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
    var _a;
    (_a = this.cancelInitialSync) == null ? void 0 : _a.call(this);
    this.cancelInitialSync = null;
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
        loadedAt: formatTime(/* @__PURE__ */ new Date()),
        staleReason: ""
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
  render() {
    var _a;
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
        text: "\u6253\u5F00\u4E00\u4E2A TaskNotes \u4EFB\u52A1\u4EE5\u67E5\u770B Dashboard\u3002"
      });
      return;
    }
    const taskPath = this.context.taskPath;
    const displayState = ((_a = this.displayState) == null ? void 0 : _a.taskPath) === taskPath ? this.displayState : null;
    const snapshot = displayState == null ? void 0 : displayState.snapshot;
    if (!snapshot) {
      this.renderLoadingHeader(
        container,
        taskPath,
        formatTaskShellStatus(this.loading, this.error)
      );
    }
    if (this.loading && !snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u4EFB\u52A1 snapshot..." });
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
      this.renderLoadingHeader(container, taskPath, "snapshot \u4E0D\u517C\u5BB9");
      container.createDiv({
        cls: "flowdesk-error",
        text: model.errorCode === "unsupported_snapshot_model" ? "Snapshot model \u4E0D\u53D7\u652F\u6301\uFF1A\u9700\u8981 task-centric\u3002" : "Snapshot schema \u4E0D\u53D7\u652F\u6301\uFF1A\u9700\u8981 3\u3002"
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
  renderLoadingHeader(container, taskPath, status) {
    const header = container.createDiv({ cls: "flowdesk-task-header" });
    const title = header.createDiv({ cls: "flowdesk-task-heading" });
    title.createDiv({ cls: "flowdesk-task-title", text: taskTitleFromPath(taskPath) });
    title.createDiv({ cls: "flowdesk-task-loading", text: status });
    this.renderToolbar(header, taskPath);
  }
  renderHeader(container, model, presentation) {
    const header = container.createDiv({ cls: "flowdesk-task-header" });
    const heading = header.createDiv({ cls: "flowdesk-task-heading" });
    if (presentation.header.parent) {
      const parent = heading.createEl("button", {
        cls: "flowdesk-parent-link",
        text: `\u2191 ${presentation.header.parent.title}`
      });
      parent.addEventListener("click", () => {
        var _a, _b;
        void this.openTask((_b = (_a = presentation.header.parent) == null ? void 0 : _a.id) != null ? _b : "");
      });
    }
    heading.createDiv({ cls: "flowdesk-task-title", text: presentation.header.title });
    const badges = heading.createDiv({ cls: "flowdesk-task-badges" });
    badges.createSpan({
      cls: `flowdesk-state-pill is-${presentation.header.statusTone}`,
      text: presentation.header.status
    });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.kindLabel });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.priority });
    if (model.currentTask.isBlocked) {
      badges.createSpan({ cls: "flowdesk-state-pill is-error", text: "\u5B58\u5728\u963B\u585E" });
    }
    this.renderToolbar(header, model.currentTask.id);
  }
  renderToolbar(container, taskPath) {
    const toolbar = container.createDiv({ cls: "flowdesk-dashboard-toolbar" });
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
  renderNonTaskState(container, context) {
    const card = container.createDiv({ cls: "flowdesk-context-pause" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "Dashboard \u4E0D\u53EF\u7528" });
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: "\u5F53\u524D\u4E0D\u662F TaskNotes \u4EFB\u52A1\uFF0CFlowDesk Dashboard \u4E0D\u53EF\u7528\u3002"
    });
    card.createDiv({ cls: "flowdesk-subline", text: `\u5F53\u524D\u6587\u4EF6\uFF1A${context.activePath}` });
  }
  renderTrustStrip(container, trust) {
    const strip = container.createDiv({
      cls: `flowdesk-trust-summary is-${trust.tone}`
    });
    const headline = strip.createDiv({ cls: "flowdesk-trust-headline" });
    headline.createSpan({ cls: "flowdesk-trust-badge", text: trust.label });
    headline.createSpan({ cls: "flowdesk-trust-contract", text: trust.contractLabel });
    strip.createDiv({ cls: "flowdesk-trust-meta", text: trust.meta });
    strip.createDiv({ cls: "flowdesk-trust-detail", text: trust.detail });
  }
  renderPrimaryDiagnostic(container, status) {
    const card = container.createDiv({
      cls: `flowdesk-primary-status is-${status.tone}`
    });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "\u5F53\u524D\u72B6\u6001" });
    if (status.diagnostic) {
      const title = card.createEl("button", {
        cls: "flowdesk-primary-title flowdesk-diagnostic-link",
        text: status.title
      });
      title.addEventListener("click", () => {
        void this.openDiagnosticLocation(status.diagnostic);
      });
    } else {
      card.createDiv({ cls: "flowdesk-primary-title", text: status.title });
    }
    diagnosticRow(card, "\u539F\u56E0", status.reason);
    diagnosticRow(card, "\u5EFA\u8BAE", status.remediation);
    card.createDiv({ cls: "flowdesk-primary-location", text: status.location });
  }
  renderDiagnosticBody(container, diagnostic) {
    const target = resolveDiagnosticTarget(diagnostic.taskId, diagnostic.source);
    diagnosticRow(container, "\u4EFB\u52A1", diagnostic.taskId);
    diagnosticRow(container, "\u4F4D\u7F6E", target.line ? `${target.linkText} \xB7 \u7B2C ${target.line} \u884C` : target.linkText);
    diagnosticRow(container, "\u5B57\u6BB5\u8DEF\u5F84", diagnostic.path);
    diagnosticRow(container, "\u539F\u56E0", diagnostic.reason);
    diagnosticRow(container, "\u9884\u671F", diagnostic.expected);
    diagnosticRow(container, "\u5EFA\u8BAE\u4FEE\u6CD5", diagnostic.remediation);
  }
  async openDiagnosticLocation(diagnostic) {
    var _a;
    const navigation = resolveDiagnosticNavigation(
      diagnostic.taskId,
      diagnostic.source
    );
    if (!navigation.canOpen) {
      new import_obsidian.Notice("producer \u672A\u63D0\u4F9B\u53EF\u6253\u5F00\u7684 task ID\u3002");
      return;
    }
    const { target } = navigation;
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
  renderChildren(container, model, children) {
    const section = container.createDiv({ cls: "flowdesk-child-section" });
    const heading = section.createDiv({ cls: "flowdesk-section-heading" });
    heading.createDiv({
      cls: "flowdesk-dashboard-section-title",
      text: `\u76F4\u63A5\u5B50\u4EFB\u52A1 \xB7 ${children.length}`
    });
    heading.createDiv({
      cls: "flowdesk-section-meta",
      text: `${model.rollup.childrenTrustedDone}/${model.rollup.childrenTotal} \u53EF\u4FE1\u5B8C\u6210`
    });
    const list = section.createDiv({ cls: "flowdesk-child-list" });
    for (const child of children) {
      const row = list.createDiv({
        cls: `flowdesk-child-row is-${child.tone}`,
        attr: { role: "button", tabindex: "0" }
      });
      const rowHeader = row.createDiv({ cls: "flowdesk-child-row-header" });
      rowHeader.createDiv({ cls: "flowdesk-child-title", text: child.title });
      rowHeader.createSpan({
        cls: `flowdesk-state-pill is-${child.tone}`,
        text: child.status
      });
      row.createDiv({ cls: "flowdesk-child-summary", text: child.summary });
      row.createDiv({ cls: "flowdesk-child-meta", text: child.meta });
      this.makeNavigable(row, () => this.openTask(child.id));
    }
  }
  renderDetails(container, model, summary) {
    var _a;
    const details = container.createEl("details", {
      cls: "flowdesk-contract-summary"
    });
    details.open = this.disclosureState.summaryOpen;
    details.addEventListener("toggle", () => {
      this.disclosureState.summaryOpen = details.open;
    });
    details.createEl("summary", { text: "\u5F53\u524D\u4EFB\u52A1\u5408\u540C\u4E0E\u8BC1\u636E" });
    const overview = details.createDiv({ cls: "flowdesk-contract-overview" });
    const goal = overview.createDiv({ cls: "flowdesk-contract-goal" });
    goal.createDiv({ cls: "flowdesk-summary-label", text: "\u76EE\u6807" });
    goal.createDiv({ cls: "flowdesk-contract-goal-text", text: summary.goal });
    const metrics = overview.createDiv({ cls: "flowdesk-contract-metrics" });
    for (const value of [
      summary.coverage,
      summary.acceptance,
      summary.evidence,
      summary.diagnostics
    ]) {
      metrics.createSpan({ cls: "flowdesk-contract-chip", text: value });
    }
    const full = overview.createEl("details", { cls: "flowdesk-technical-details" });
    full.open = this.disclosureState.fullOpen;
    full.addEventListener("toggle", () => {
      this.disclosureState.fullOpen = full.open;
    });
    full.createEl("summary", { text: "\u5C55\u5F00\u5168\u90E8\u5408\u540C\u3001\u8BC1\u636E\u4E0E\u8BCA\u65AD" });
    const body = full.createDiv({ cls: "flowdesk-detail-body" });
    const observation = createSection(body, "\u89C2\u5BDF\u8BE6\u60C5");
    childMeta(observation, "\u5065\u5EB7\u72B6\u6001", model.observation.health);
    childMeta(observation, "\u5F53\u524D\u4EFB\u52A1", model.observation.currentTask);
    childMeta(observation, "\u7236\u4EFB\u52A1", model.observation.parent);
    childMeta(observation, "\u76F4\u63A5\u5B50\u4EFB\u52A1", model.observation.children);
    childMeta(observation, "TaskNotes API", model.observation.tasknotesApi);
    childMeta(observation, "\u6765\u6E90\u4EFB\u52A1", model.observation.sourceTaskId || "\u672A\u63D0\u4F9B");
    const contract = createSection(body, "\u4EFB\u52A1\u5408\u540C v3");
    childMeta(contract, "\u7248\u672C", model.contract.version);
    childMeta(contract, "\u8BED\u4E49\u72B6\u6001", model.contract.semanticStatus);
    childMeta(contract, "\u76EE\u6807", model.contract.goal);
    renderTextList(contract, "\u8303\u56F4 \xB7 \u5305\u542B", model.contract.scope.included);
    renderTextList(contract, "\u8303\u56F4 \xB7 \u4E0D\u5305\u542B", model.contract.scope.excluded);
    renderContractItems(contract, "\u9700\u6C42", model.contract.requirements);
    renderContractItems(contract, "\u573A\u666F", model.contract.scenarios);
    const acceptance = createSection(body, "\u9A8C\u6536\u6807\u51C6");
    if (!model.contract.acceptance.length) {
      acceptance.createDiv({ cls: "flowdesk-muted", text: "producer \u672A\u63D0\u4F9B\u9A8C\u6536\u9879\u3002" });
    }
    for (const item of model.contract.acceptance) {
      acceptance.createDiv({ text: `${item.checked ? "\u2611" : "\u2610"} ${(_a = item.text) != null ? _a : "\u672A\u63D0\u4F9B"}` });
    }
    const evidence = createSection(body, "\u5F53\u524D\u4EFB\u52A1\u8BC1\u636E");
    evidenceRow(evidence, "\u6267\u884C\u7ED3\u679C", model.evidence.execution);
    evidenceRow(evidence, "\u9A8C\u8BC1\u7ED3\u679C", model.evidence.verification);
    evidenceRow(evidence, "\u4EA4\u4ED8\u8BB0\u5F55", model.evidence.delivery);
    if (model.diagnostics.length) {
      const diagnostics = createSection(body, `\u6280\u672F\u8BCA\u65AD \xB7 ${model.diagnostics.length}`);
      for (const diagnostic of model.diagnostics) {
        const item = diagnostics.createDiv({ cls: "flowdesk-diagnostic-item" });
        const diagnosticLink = item.createEl("button", {
          cls: "flowdesk-technical-diagnostic-link",
          text: diagnostic.code
        });
        diagnosticLink.addEventListener("click", () => {
          void this.openDiagnosticLocation(diagnostic);
        });
        this.renderDiagnosticBody(item, diagnostic);
      }
    }
  }
  makeNavigable(element, action) {
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
function statusSymbol(value) {
  const status = normalizeStatus(value);
  if (status === "done" || status === "valid") return "\u2713";
  if (status === "running") return "\u25C9";
  if (status === "blocked" || status === "error" || status === "invalid") return "!";
  return "\u2022";
}
function taskTitleFromPath(taskPath) {
  return path2.basename(taskPath, path2.extname(taskPath));
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
