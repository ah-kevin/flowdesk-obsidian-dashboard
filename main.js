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
var import_child_process2 = require("child_process");

// src/tasknotes-auth.ts
function parseTaskNotesEnvironment(configuration) {
  let value;
  try {
    value = JSON.parse(configuration.trim() || "{}");
  } catch (e) {
    throw new Error("\u73AF\u5883\u53D8\u91CF JSON \u683C\u5F0F\u65E0\u6548\uFF0C\u8BF7\u586B\u5199\u952E\u503C\u5BF9\u8C61\uFF0C\u503C\u4F7F\u7528\u5B57\u7B26\u4E32\u3002");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("\u73AF\u5883\u53D8\u91CF JSON \u5FC5\u987B\u662F\u5BF9\u8C61\uFF0C\u503C\u4F7F\u7528\u5B57\u7B26\u4E32\u3002");
  }
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof item !== "string" || item.includes("\0")) {
      throw new Error("\u73AF\u5883\u53D8\u91CF JSON \u7684\u952E\u540D\u5FC5\u987B\u662F\u6709\u6548\u53D8\u91CF\u540D\uFF0C\u503C\u5FC5\u987B\u662F\u4E0D\u542B\u7A7A\u5B57\u7B26\u7684\u5B57\u7B26\u4E32\u3002");
    }
  }
  return value;
}
function resolveTaskNotesAuth(configuration, inherited = process.env) {
  const configured = parseTaskNotesEnvironment(configuration);
  const env = { ...inherited, ...configured };
  for (const key of ["TASKNOTES_API_TOKEN", "TASKNOTES_AUTH_TOKEN"]) {
    if (env[key] !== void 0) env[key] = env[key].trim();
    if (/[\r\n]/.test(env[key] || "")) {
      throw new Error("TaskNotes token \u683C\u5F0F\u65E0\u6548\uFF0C\u4E0D\u80FD\u5305\u542B\u6362\u884C\u7B26\u3002");
    }
  }
  const token = env.TASKNOTES_API_TOKEN || env.TASKNOTES_AUTH_TOKEN || "";
  return { env, token };
}
function resolveTaskNotesApiUrl(configuredUrl, env) {
  var _a;
  return (configuredUrl.trim() || ((_a = env.TASKNOTES_API_URL) == null ? void 0 : _a.trim()) || "http://127.0.0.1:18090").replace(/\/+$/, "");
}
function formatTaskNotesAuthError(message, token) {
  if (/TaskNotes API 401\b/.test(message)) {
    return token ? "TaskNotes API 401\uFF1A\u5DF2\u53D1\u9001 token\uFF0C\u4F46\u670D\u52A1\u62D2\u7EDD\u9274\u6743\uFF0C\u8BF7\u68C0\u67E5 token \u662F\u5426\u6B63\u786E\u6216\u5DF2\u5931\u6548\u3002" : "TaskNotes API 401\uFF1Atoken \u672A\u914D\u7F6E\uFF0C\u8BF7\u5728\u63D2\u4EF6\u7684\u73AF\u5883\u53D8\u91CF JSON \u4E2D\u586B\u5199 TASKNOTES_API_TOKEN\u3002";
  }
  if (!token) return message;
  for (const value of [JSON.stringify(token).slice(1, -1), token]) {
    message = message.split(value).join("[REDACTED]");
  }
  return message;
}
function sanitizeTaskNotesSnapshot(snapshot, token) {
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = (key === "message" || key === "error") && typeof item === "string" ? formatTaskNotesAuthError(item, token) : visit(item);
    }
    return result;
  }
  return visit(snapshot);
}

// src/main.ts
var import_fs3 = require("fs");
var import_os = require("os");
var path5 = __toESM(require("path"));
var import_util = require("util");

// src/dashboard-state.ts
var MAX_SNAPSHOT_BUFFER = 8 * 1024 * 1024;
var SNAPSHOT_TIMEOUT_MS = 3e4;
function createSnapshotExecutionOptions(cwd, signal) {
  return {
    cwd,
    maxBuffer: MAX_SNAPSHOT_BUFFER,
    timeout: SNAPSHOT_TIMEOUT_MS,
    signal
  };
}
var SnapshotRequestAbortCoordinator = class {
  constructor() {
    this.controller = null;
  }
  begin() {
    this.cancel();
    this.controller = new AbortController();
    return this.controller.signal;
  }
  finish(signal) {
    var _a;
    if (((_a = this.controller) == null ? void 0 : _a.signal) === signal) {
      this.controller = null;
    }
  }
  cancel() {
    var _a;
    (_a = this.controller) == null ? void 0 : _a.abort();
    this.controller = null;
  }
};
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
  var _a;
  const snapshot = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
  const schemaVersion = snapshot.snapshot_schema_version;
  if (schemaVersion !== 3 && schemaVersion !== 4) {
    return `Snapshot schema \u4E0D\u53D7\u652F\u6301\uFF1A\u9700\u8981 3\uFF08legacy_v3\uFF09\u6216 4\uFF1B\u8BF7\u6C42 ${requestedTaskPath}\uFF0C\u5B9E\u9645 schema ${formatEnvelopeValue(schemaVersion)}\u3002`;
  }
  if (snapshot.snapshot_model !== "task-centric") {
    return `Snapshot model \u4E0D\u53D7\u652F\u6301\uFF1A\u9700\u8981 task-centric\uFF1B\u8BF7\u6C42 ${requestedTaskPath}\uFF0C\u5B9E\u9645 model ${formatEnvelopeValue(snapshot.snapshot_model)}\u3002`;
  }
  const sourceTaskId = schemaVersion === 4 ? (_a = snapshot.source) == null ? void 0 : _a.task_id : snapshot.source_task_id;
  if (sourceTaskId !== requestedTaskPath) {
    return `Snapshot source identity \u4E0D\u5339\u914D\uFF1A\u8BF7\u6C42 ${requestedTaskPath}\uFF0C\u8FD4\u56DE ${formatEnvelopeValue(sourceTaskId)}\u3002`;
  }
  if (schemaVersion === 4) {
    const protocol = snapshot.protocol;
    const v4ProtocolValid = (protocol == null ? void 0 : protocol.producer_protocol_version) === 4 && protocol.task_contract_schema === "flowdesk.task-contract/4" && protocol.evidence_contract_schema === "flowdesk.evidence-contract/1" && protocol.evidence_record_schema === "flowdesk.evidence-record/1" && protocol.review_record_schema === "flowdesk.review-record/1";
    const legacyProtocolValid = (protocol == null ? void 0 : protocol.producer_protocol_version) === 4 && protocol.task_contract_schema === "legacy_v3" && protocol.evidence_contract_schema === null && protocol.evidence_record_schema === null && protocol.review_record_schema === null && protocol.legacy_policy === "explicit_legacy_v3";
    if (!v4ProtocolValid && !legacyProtocolValid) {
      return `Snapshot protocol \u4E0D\u53D7\u652F\u6301\uFF1A\u8BF7\u6C42 ${requestedTaskPath} \u5FC5\u987B\u4F7F\u7528\u5B8C\u6574 SDD v4 protocol\u3002`;
    }
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

// src/reference-text.ts
function parseReferenceText(raw) {
  const text2 = raw.trim();
  const result = (target, label, syntax, error = null) => ({ target, label, syntax, error });
  const wiki = text2.match(/^\[\[([^\]]+)\]\]$/);
  if (wiki) {
    const separator = wiki[1].indexOf("|");
    return result(separator < 0 ? wiki[1] : wiki[1].slice(0, separator), separator < 0 ? null : wiki[1].slice(separator + 1).trim() || null, "wiki");
  }
  const markdown = text2.match(/^\[([\s\S]*)\]\(([\s\S]+)\)$/);
  if (markdown) {
    let target = markdown[2].trim();
    if (target.startsWith("<") || target.endsWith(">")) {
      if (!target.startsWith("<") || !target.endsWith(">")) return result(text2, markdown[1], "markdown", "\u5F15\u7528\u94FE\u63A5\u8BED\u6CD5\u65E0\u6548");
      target = target.slice(1, -1);
    }
    return result(target, markdown[1].trim() || null, "markdown", target ? null : "\u5F15\u7528\u76EE\u6807\u4E3A\u7A7A");
  }
  return result(/^[a-z][a-z0-9+.-]*:/i.test(text2) ? text2 : raw, null, "raw");
}

// src/entity-presentation.ts
function formatEntityStatus(kind, raw, statusIsCompleted) {
  var _a, _b;
  const value = raw != null ? raw : "";
  const token = value.trim().toLowerCase();
  const shared = {
    done: ["\u5DF2\u5B8C\u6210", "healthy"],
    cancel: ["\u5DF2\u53D6\u6D88", "muted"],
    "in-progress": ["\u8FDB\u884C\u4E2D", "running"],
    running: ["\u8FDB\u884C\u4E2D", "running"],
    open: ["\u5F85\u5F00\u59CB", "muted"],
    blocked: ["\u5DF2\u963B\u585E", "error"],
    error: ["\u5F02\u5E38", "error"],
    unknown: ["\u672A\u77E5\u72B6\u6001", "warning"]
  };
  const cases = {
    active: ["\u8FDB\u884C\u4E2D", "running"],
    parked: ["\u5DF2\u505C\u9760", "muted"],
    complete: ["\u5DF2\u5B8C\u6210", "healthy"],
    completed: ["\u5DF2\u5B8C\u6210", "healthy"],
    closed: ["\u5DF2\u5173\u95ED", "muted"]
  };
  const sharedStatus = Object.prototype.hasOwnProperty.call(shared, token) ? shared[token] : void 0;
  const caseStatus = Object.prototype.hasOwnProperty.call(cases, token) ? cases[token] : void 0;
  const translated = kind === "case" ? caseStatus != null ? caseStatus : sharedStatus : sharedStatus;
  if (!token) return { label: "\u672A\u8BB0\u5F55", raw: value, tone: "muted" };
  if (kind === "task" && statusIsCompleted !== void 0) {
    const ended = statusIsCompleted === true ? "\u5DF2\u7ED3\u675F" : statusIsCompleted === false ? "\u672A\u7ED3\u675F" : "\u72B6\u6001\u672A\u77E5";
    if (!translated || token === "done" && statusIsCompleted !== true) {
      return { label: `${value}\uFF08${ended}\uFF09`, raw: value, tone: statusIsCompleted === true ? "muted" : "warning" };
    }
  }
  return { label: (_a = translated == null ? void 0 : translated[0]) != null ? _a : `${value}\uFF08\u672A\u77E5\u72B6\u6001\uFF09`, raw: value, tone: (_b = translated == null ? void 0 : translated[1]) != null ? _b : "warning" };
}
function groupTaskRows(rows) {
  const current = [];
  const history = [];
  for (const row of rows) (row.completed === true || row.archived ? history : current).push(row);
  const rank = (row) => ["in-progress", "running"].includes(row.status.trim().toLowerCase()) ? 0 : row.isBlocked ? 1 : 2;
  return { current: current.map((row, index) => ({ row, index })).sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index).map((x) => x.row), history };
}
function formatReferenceLabel(raw) {
  const parsed = parseReferenceText(raw);
  if (parsed.label) return parsed.label;
  const target = parsed.target.split("#")[0].replace(/\\/g, "/");
  return (target.split("/").pop() || target).replace(/\.md$/i, "") || raw;
}

// src/dashboard-presentation.ts
var DisclosureStateCache = class {
  constructor(capacity = 20) {
    this.capacity = capacity;
    this.states = /* @__PURE__ */ new Map();
    this.capacity = Math.max(1, Math.floor(capacity));
  }
  forTask(taskPath) {
    const existing = this.states.get(taskPath);
    if (existing) {
      this.states.delete(taskPath);
      this.states.set(taskPath, existing);
      return existing;
    }
    const state = resolveDisclosureState(void 0, true);
    this.states.set(taskPath, state);
    if (this.states.size > this.capacity) {
      const oldest = this.states.keys().next().value;
      if (typeof oldest === "string") this.states.delete(oldest);
    }
    return state;
  }
  clear() {
    this.states.clear();
  }
};
function resolveDisclosureState(previous, taskChanged) {
  if (!previous || taskChanged) {
    return {
      summaryOpen: true,
      fullOpen: false,
      scopeOpen: false,
      requirementsOpen: false,
      scenariosOpen: false,
      observationOpen: false,
      technicalDiagnosticsOpen: false,
      diagnosticOpen: {},
      diagnosticSupportingOpen: {}
    };
  }
  return previous;
}
function createDiagnosticDisclosureKey(taskPath, diagnostic) {
  var _a, _b, _c, _d;
  const section2 = ((_a = diagnostic.source) == null ? void 0 : _a.section) || ((_b = diagnostic.source) == null ? void 0 : _b.after_section) || "";
  const line = (_d = (_c = diagnostic.source) == null ? void 0 : _c.line_start) != null ? _d : "";
  return JSON.stringify([
    taskPath,
    diagnostic.code,
    diagnostic.path,
    section2,
    line
  ]);
}
function reconcileDiagnosticDisclosureState(state, activeKeys) {
  const active = new Set(activeKeys);
  for (const key of Object.keys(state.diagnosticOpen)) {
    if (!active.has(key)) delete state.diagnosticOpen[key];
  }
  for (const key of Object.keys(state.diagnosticSupportingOpen)) {
    if (!active.has(key)) delete state.diagnosticSupportingOpen[key];
  }
}
function resolveDiagnosticDisclosureOpen(state, key) {
  var _a;
  return (_a = state.diagnosticOpen[key]) != null ? _a : false;
}
function resolveDetailSectionOrder(hasDiagnostics) {
  const reviewOrder = ["contract", "observation"];
  return hasDiagnostics ? ["diagnostics", ...reviewOrder] : reviewOrder;
}
function isActivationKey(key) {
  return key === "Enter" || key === " " || key === "Spacebar";
}
function formatTaskShellStatus(loading, error) {
  if (error) return "\u8BFB\u53D6\u5931\u8D25";
  return loading ? "\u6B63\u5728\u5EFA\u7ACB\u53EF\u4FE1\u89C2\u5BDF\u2026" : "\u5C1A\u672A\u8BFB\u53D6 snapshot";
}
function formatSnapshotCompatibilityError(code) {
  if (code === "unsupported_snapshot_model") {
    return "Snapshot model \u4E0D\u53D7\u652F\u6301\uFF1A\u9700\u8981 task-centric\u3002";
  }
  if (code === "unsupported_snapshot_protocol") {
    return "Snapshot protocol \u4E0D\u53D7\u652F\u6301\uFF1A\u8BF7\u6838\u5BF9 producer \u4E0E Dashboard \u7248\u672C\u3002";
  }
  return "Snapshot schema \u4E0D\u53D7\u652F\u6301\uFF1A\u9700\u8981 schema 4\uFF0C\u6216\u663E\u5F0F legacy_v3\u3002";
}
function createDashboardPresentation(model) {
  const kind = model.currentTask.hasChildren ? "parent" : "leaf";
  const legacy = model.currentTask.trustLevel === "legacy_v3";
  const diagnostics = model.diagnostics.map(
    (diagnostic) => createDiagnosticPresentation(diagnostic, model.currentTask.id)
  );
  return {
    kind,
    header: {
      title: model.currentTask.title,
      status: formatTaskStatus(model.currentTask.status, model.currentTask.trustLevel === "legacy_v3", model.currentTask.trustLevel === "legacy_v3" ? void 0 : model.currentTask.statusIsCompleted),
      statusTone: taskStatusTone(model.currentTask.status, model.currentTask.isBlocked, model.currentTask.trustLevel === "legacy_v3" ? void 0 : model.currentTask.statusIsCompleted),
      priority: formatPriority(model.currentTask.priority),
      kindLabel: kind === "parent" ? "\u7236\u4EFB\u52A1" : "\u53F6\u5B50\u4EFB\u52A1",
      parent: model.parent ? { id: model.parent.id, title: model.parent.title } : null
    },
    trust: createTrustSummary(model),
    primaryStatus: createPrimaryStatus(model),
    children: kind === "parent" ? (() => {
      const grouped = groupTaskRows(model.children.map((child) => ({
        ...child,
        completed: legacy ? legacyLifecycleCompleted(child.status) : child.subtreeTerminal,
        isBlocked: legacy ? child.isBlocked : child.statusIsCompleted !== true && child.isBlocked,
        archived: false
      })));
      return [
        ...grouped.current.map((child) => createChildRow(child, legacy, false)),
        ...grouped.history.map((child) => createChildRow(child, legacy, true))
      ];
    })() : [],
    contract: createContractSummary(model),
    diagnostics,
    technicalDiagnostics: createTechnicalDiagnosticGroups(model, diagnostics)
  };
}
function createTechnicalDiagnosticGroups(model, currentDiagnostics = model.diagnostics.map(
  (diagnostic) => createDiagnosticPresentation(diagnostic, model.currentTask.id)
)) {
  const groups = [];
  if (currentDiagnostics.length) {
    groups.push({
      kind: "current",
      taskId: model.currentTask.id,
      taskTitle: model.currentTask.title,
      status: formatTaskStatus(model.currentTask.status, model.currentTask.trustLevel === "legacy_v3", model.currentTask.trustLevel === "legacy_v3" ? void 0 : model.currentTask.statusIsCompleted),
      tone: taskStatusTone(model.currentTask.status, model.currentTask.isBlocked, model.currentTask.trustLevel === "legacy_v3" ? void 0 : model.currentTask.statusIsCompleted),
      diagnostics: currentDiagnostics
    });
  }
  for (const child of model.children) {
    if (!child.primaryDiagnostic) continue;
    groups.push({
      kind: "child",
      taskId: child.id,
      taskTitle: child.title,
      status: formatTaskStatus(child.status, false, model.currentTask.trustLevel === "legacy_v3" ? void 0 : child.statusIsCompleted),
      tone: taskStatusTone(child.status, child.isBlocked, model.currentTask.trustLevel === "legacy_v3" ? void 0 : child.statusIsCompleted),
      diagnostics: [
        createDiagnosticPresentation(child.primaryDiagnostic, child.id)
      ]
    });
  }
  return groups;
}
function formatTaskStatus(value, legacy = false, statusIsCompleted) {
  const raw = String(value != null ? value : "");
  if (legacy && ["complete", "completed", "done"].includes(normalizeToken(raw))) return "\u5DF2\u5B8C\u6210";
  return formatEntityStatus("task", raw, statusIsCompleted).label;
}
function taskStatusTone(value, isBlocked = false, statusIsCompleted) {
  const result = formatEntityStatus("task", String(value != null ? value : ""), statusIsCompleted);
  return (statusIsCompleted === false || statusIsCompleted === void 0) && normalizeToken(value) !== "done" && isBlocked ? "error" : result.tone;
}
function legacyLifecycleCompleted(status) {
  const token = normalizeToken(status);
  if (["done", "complete", "completed"].includes(token)) return true;
  return ["open", "in-progress", "running", "blocked"].includes(token) ? false : null;
}
function isContractJudgmentNotApplicable(model) {
  return model.currentTask.completion.contractStatus === "not_applicable" || model.contract.semanticStatus === "not_applicable";
}
function createTrustSummary(model) {
  const isLegacy = model.currentTask.trustLevel === "legacy_v3";
  const isTasknotesOnly = isContractJudgmentNotApplicable(model);
  const contractLabel = isTasknotesOnly ? "TaskNotes \u72B6\u6001\u4E3A\u51C6" : isLegacy ? model.contract.semanticStatus === "valid" ? "v3 \u5386\u53F2\u5408\u540C\u6709\u6548" : "v3 \u5386\u53F2\u5408\u540C\u9700\u68C0\u67E5" : model.contract.semanticStatus === "valid" ? "\u89C4\u683C\u6709\u6548" : model.contract.semanticStatus === "invalid" ? "\u89C4\u683C\u5B58\u5728\u95EE\u9898" : "\u89C4\u683C\u72B6\u6001\u672A\u77E5";
  const contractTone = isTasknotesOnly ? "muted" : model.contract.semanticStatus === "valid" ? "healthy" : model.contract.semanticStatus === "invalid" ? "error" : "muted";
  if (model.observation.isStale) {
    const detail2 = model.observation.staleReason || "snapshot \u5DF2\u6807\u8BB0\u4E3A\u65E7\u6570\u636E";
    return {
      tone: "warning",
      label: "\u663E\u793A\u4E0A\u6B21\u6210\u529F\u7ED3\u679C",
      contractLabel,
      contractTone,
      sourceLabel: model.schemaLabel,
      tooltip: `\u8BFB\u53D6\u4E8E ${model.observation.loadedAt} \xB7 ${detail2}`,
      meta: `${model.schemaLabel} \xB7 \u8BFB\u53D6\u4E8E ${model.observation.loadedAt}`,
      detail: detail2
    };
  }
  if (!model.observation.isTrustworthy) {
    const detail2 = "\u65E0\u6CD5\u786E\u8BA4 snapshot \u662F\u5426\u5B8C\u6574\u5BF9\u5E94\u5F53\u524D\u4EFB\u52A1";
    return {
      tone: "error",
      label: "\u89C2\u5BDF\u4E0D\u53EF\u4FE1",
      contractLabel,
      contractTone,
      sourceLabel: model.schemaLabel,
      tooltip: `${model.observation.generatedAt} \xB7 ${detail2}`,
      meta: `${model.schemaLabel} \xB7 ${model.observation.generatedAt}`,
      detail: detail2
    };
  }
  const detail = "\u6765\u6E90\u5339\u914D\uFF0C\u5DF2\u8BFB\u53D6\u5F53\u524D\u4EFB\u52A1\u3001\u7236\u4EFB\u52A1\u4E0E\u76F4\u63A5\u5B50\u4EFB\u52A1";
  return {
    tone: "healthy",
    label: "\u6765\u6E90\u8BFB\u53D6\u5B8C\u6574",
    contractLabel,
    contractTone,
    sourceLabel: model.schemaLabel,
    tooltip: `${model.observation.generatedAt} \xB7 ${detail}`,
    meta: `${model.schemaLabel} \xB7 ${model.observation.generatedAt}`,
    detail
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
  if (isContractJudgmentNotApplicable(model)) {
    return createProgressStatus(model);
  }
  if (model.contract.semanticStatus !== "valid") {
    return {
      tone: "error",
      title: "\u4EFB\u52A1\u89C4\u683C\u5B58\u5728\u95EE\u9898",
      reason: `producer \u5C06\u89C4\u683C\u6807\u8BB0\u4E3A ${model.contract.semanticStatus}\uFF0C\u4F46\u6CA1\u6709\u8FD4\u56DE\u7ED3\u6784\u5316\u8BCA\u65AD`,
      remediation: "\u5C55\u5F00\u5B8C\u6574\u8BE6\u60C5\u6838\u5BF9\u89C4\u683C\u5B57\u6BB5\uFF0C\u5E76\u4F7F\u7528 CLI \u83B7\u53D6 producer \u539F\u59CB\u8F93\u51FA",
      location: "\u4EFB\u52A1\u89C4\u683C",
      diagnostic: null
    };
  }
  if (model.currentTask.trustLevel === "legacy_v3") {
    return {
      tone: model.currentTask.trustedDone ? "healthy" : "warning",
      title: "v3 \u5386\u53F2\u9A8C\u8BC1\u5DF2\u4FDD\u7559",
      reason: "Dashboard \u660E\u793A legacy_v3\uFF0C\u4E0D\u5C06\u5386\u53F2\u7ED3\u8BBA\u4F2A\u88C5\u6210 v4 attested",
      remediation: model.nextAction || "\u6309\u9700\u663E\u5F0F\u8FC1\u79FB\u5230 SDD v4",
      location: "\u5F53\u524D\u4EFB\u52A1",
      diagnostic: null
    };
  }
  if (model.currentTask.trustLevel === "review_required") {
    return {
      tone: "warning",
      title: "\u7ED3\u6784\u5316\u8BC1\u636E\u7B49\u5F85\u4EBA\u5DE5\u590D\u6838",
      reason: "\u5FC5\u9700 evidence \u5DF2\u6EE1\u8DB3\uFF0C\u4F46\u5F53\u524D bundle \u5C1A\u672A\u6279\u51C6",
      remediation: model.nextAction || "\u67E5\u770B\u5386\u53F2\u8BC1\u636E\u4E0E\u539F\u6587\u786E\u8BA4\u4E0B\u4E00\u6B65",
      location: "\u6267\u884C\u8BC1\u636E",
      diagnostic: null
    };
  }
  return {
    tone: "healthy",
    title: "\u5DF2\u8BFB\u53D6\u5F53\u524D\u4EFB\u52A1\uFF0C\u672A\u53D1\u73B0\u7ED3\u6784\u5316\u8BCA\u65AD",
    reason: "\u5DF2\u68C0\u67E5\u4EFB\u52A1\u89C4\u683C\u4E0E\u6267\u884C\u8BC1\u636E",
    remediation: model.nextAction || "\u7EE7\u7EED\u6309\u5F53\u524D\u4EFB\u52A1\u89C4\u683C\u6267\u884C",
    location: "\u5F53\u524D\u4EFB\u52A1",
    diagnostic: null
  };
}
function createProgressStatus(model) {
  const nextStep = model.nextAction;
  if (!model.currentTask.hasChildren) {
    return createLeafProgressStatus(model, nextStep);
  }
  const ended = model.children.filter((child) => child.subtreeTerminal === true);
  const unfinished = model.children.filter((child) => child.subtreeTerminal === false);
  const unknown2 = model.children.filter((child) => child.subtreeTerminal === null);
  const blocked = unfinished.filter((child) => child.statusIsCompleted === false && child.isBlocked);
  const total = model.children.length;
  const allEnded = total > 0 && model.rollup.childrenTerminal === true && ended.length === total;
  return {
    tone: blocked.length ? "error" : unknown2.length || model.rollup.childrenTerminal === null ? "warning" : allEnded ? "healthy" : total ? "running" : "warning",
    title: total ? `\u76F4\u63A5\u5B50\u4EFB\u52A1\uFF1A\u6210\u529F ${model.rollup.childrenTrustedDone}/${total} \xB7 \u5DF2\u7ED3\u675F ${ended.length}/${total}` : "\u672A\u89C2\u5BDF\u5230\u76F4\u63A5\u5B50\u4EFB\u52A1",
    reason: blocked.length ? `${blocked.length} \u4E2A\u672A\u7ED3\u675F\u5B50\u4EFB\u52A1\u88AB\u963B\u585E\uFF1A${formatTaskReferences(blocked)}` : unknown2.length ? `${unknown2.length} \u4E2A\u5B50\u4EFB\u52A1\u7684\u5B50\u6811\u72B6\u6001\u672A\u77E5\uFF1A${formatTaskReferences(unknown2)}` : unfinished.length ? `${unfinished.length} \u4E2A\u5B50\u4EFB\u52A1\u6216\u5176\u540E\u4EE3\u672A\u7ED3\u675F\uFF1A${formatTaskReferences(unfinished)}` : allEnded ? "\u76F4\u63A5\u5B50\u4EFB\u52A1\u53CA\u5176\u540E\u4EE3\u5747\u5DF2\u7ED3\u675F\uFF1B\u6210\u529F\u5B8C\u6210\u4E0E\u5F53\u524D\u4EFB\u52A1\u72B6\u6001\u72EC\u7ACB\u663E\u793A\u3002" : total ? "\u5B50\u4EFB\u52A1\u6C47\u603B\u72B6\u6001\u672A\u77E5\uFF0C\u9700\u6838\u5BF9\u6765\u6E90\u3002" : "\u672A\u89C2\u5BDF\u5230\u76F4\u63A5\u5B50\u4EFB\u52A1\uFF0C\u4E0D\u636E\u6B64\u5224\u5B9A\u7ED3\u675F\u3002",
    remediation: nextStep || "\u672A\u8BB0\u5F55\u4E0B\u4E00\u6B65",
    location: "\u76F4\u63A5\u5B50\u4EFB\u52A1",
    diagnostic: null
  };
}
function createLeafProgressStatus(model, nextStep) {
  const completed = model.currentTask.statusIsCompleted === true;
  const blocked = model.currentTask.statusIsCompleted === false && model.currentTask.isBlocked;
  const dependencies = model.currentTask.blockedBy.map(formatTaskReference).join("\u3001");
  const state = completed ? "\u5DF2\u7ED3\u675F" : model.currentTask.statusIsCompleted === false ? "\u672A\u7ED3\u675F" : "\u72B6\u6001\u672A\u77E5";
  return {
    tone: blocked ? "error" : taskStatusTone(model.currentTask.status, false, model.currentTask.statusIsCompleted),
    title: `\u5F53\u524D\u4EFB\u52A1${formatTaskStatus(model.currentTask.status, model.currentTask.trustLevel === "legacy_v3", model.currentTask.trustLevel === "legacy_v3" ? void 0 : model.currentTask.statusIsCompleted)}`,
    reason: blocked ? dependencies ? `\u963B\u585E\u4E8E ${dependencies}` : "TaskNotes \u5C06\u5F53\u524D\u4EFB\u52A1\u6807\u8BB0\u4E3A\u963B\u585E" : `${state}${dependencies ? ` \xB7 ${completed ? "\u5386\u53F2\u4F9D\u8D56" : "\u4F9D\u8D56\u4E8E"} ${dependencies}` : "\uFF1B\u6210\u529F\u5B8C\u6210\u4E0E\u9A8C\u6536\u7ED3\u8BBA\u72EC\u7ACB\u3002"}`,
    remediation: nextStep || "\u672A\u8BB0\u5F55\u4E0B\u4E00\u6B65",
    location: "\u5F53\u524D\u4EFB\u52A1",
    diagnostic: null
  };
}
function formatTaskReferences(items) {
  return items.map((item) => item.title || formatTaskReference(item.id || "")).filter(Boolean).join("\u3001");
}
function createDiagnosticStatus(diagnostic) {
  return {
    tone: diagnostic.severity === "warning" ? "warning" : "error",
    title: diagnosticActionTitle(diagnostic),
    reason: diagnostic.reason,
    remediation: diagnostic.remediation,
    location: diagnosticLocation(diagnostic),
    diagnostic
  };
}
function createDiagnosticPresentation(diagnostic, currentTaskId) {
  const location = diagnosticLocation(diagnostic);
  const belongsToCurrentTask = diagnostic.taskId === currentTaskId;
  const taskPrefix = belongsToCurrentTask ? "" : `${formatTaskReference(diagnostic.taskId)} \xB7 `;
  return {
    title: diagnosticActionTitle(diagnostic),
    sourceLabel: `${taskPrefix}${location}`,
    actual: diagnostic.reason,
    expected: diagnostic.expected,
    remediation: diagnostic.remediation,
    machine: {
      code: diagnostic.code,
      taskId: diagnostic.taskId,
      path: diagnostic.path,
      location
    },
    diagnostic
  };
}
function createChildRow(child, legacy = false, history = false) {
  var _a, _b;
  const meta = [];
  const completed = legacy ? legacyLifecycleCompleted(child.status) === true : child.statusIsCompleted === true;
  const blocked = legacy ? !completed && child.isBlocked : child.statusIsCompleted === false && child.isBlocked;
  if (!legacy) {
    meta.push(completed ? "\u5DF2\u7ED3\u675F" : child.statusIsCompleted === false ? "\u672A\u7ED3\u675F" : "\u72B6\u6001\u672A\u77E5");
    if (child.subtreeTerminal === null) meta.push("\u5B50\u6811\u72B6\u6001\u672A\u77E5");
    else if (completed && child.subtreeTerminal === false) meta.push("\u540E\u4EE3\u672A\u7ED3\u675F");
  }
  if (child.blockedBy.length) meta.push(`${blocked ? "\u963B\u585E\u4E8E" : completed ? "\u5386\u53F2\u4F9D\u8D56" : "\u4F9D\u8D56\u4E8E"} ${child.blockedBy.map(formatTaskReference).join("\u3001")}`);
  if (child.hasChildren) meta.push("\u542B\u5B50\u4EFB\u52A1");
  return {
    id: child.id,
    title: child.title,
    history,
    status: formatTaskStatus(child.status, legacy, legacy ? void 0 : child.statusIsCompleted),
    tone: taskStatusTone(child.status, blocked, legacy ? void 0 : child.statusIsCompleted),
    summary: (_b = (_a = child.primaryDiagnostic) == null ? void 0 : _a.reason) != null ? _b : child.goal,
    meta: meta.join(" \xB7 ")
  };
}
function formatTaskReference(taskId) {
  const filename = taskId.split("/").pop() || taskId;
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}
function createContractSummary(model) {
  return {
    goal: model.content.goal,
    coverage: "\u6295\u5F71\u6761\u76EE\uFF1B\u5B8C\u6574\u6B63\u6587\u89C1 API \u539F\u6587",
    acceptance: "\u539F\u6587\u52FE\u9009\u4EC5\u6309\u6B63\u6587\u5C55\u793A",
    evidence: "\u6267\u884C\u3001\u9A8C\u8BC1\u3001\u4EA4\u4ED8\u8BB0\u5F55\u6309\u539F\u6587\u5C55\u793A",
    diagnostics: `${model.diagnostics.length} \u4E2A\u8BCA\u65AD`,
    metrics: []
  };
}
function diagnosticActionTitle(diagnostic) {
  var _a, _b;
  if (diagnostic.code === "task_contract_count_invalid") {
    const schema = String(((_a = diagnostic.evidence) == null ? void 0 : _a.schema) || "");
    const version = schema === "flowdesk.task-contract/4" ? "v4" : "v3";
    return ((_b = diagnostic.evidence) == null ? void 0 : _b.actual_count) === 0 ? `\u7F3A\u5C11 Task Contract ${version}` : `Task Contract ${version} \u6570\u91CF\u4E0D\u6B63\u786E`;
  }
  const labels = {
    review_required: "\u7ED3\u6784\u5316\u8BC1\u636E\u7B49\u5F85\u4EBA\u5DE5\u590D\u6838",
    review_conflict: "\u590D\u6838\u8BB0\u5F55\u4E0E\u5F53\u524D\u8BC1\u636E\u51B2\u7A81",
    review_changes_requested: "\u590D\u6838\u8981\u6C42\u4FEE\u6539",
    evidence_requirement_missing: "\u7ED3\u6784\u5316\u8BC1\u636E\u7F3A\u5931",
    stale_against_component_revision: "\u7ED3\u6784\u5316\u8BC1\u636E\u7248\u672C\u5DF2\u8FC7\u671F",
    record_unconfirmed: "Evidence Record \u672A\u786E\u8BA4",
    record_drift: "Evidence Record \u5DF2\u6F02\u79FB",
    failed_as_observed: "\u8FD0\u884C\u7ED3\u679C\u4E0D\u7B26\u5408\u58F0\u660E\u9884\u671F",
    protocol_mismatch: "\u8BC1\u636E\u534F\u8BAE\u4E0D\u5339\u914D",
    contract_missing: "Evidence Contract \u5B58\u50A8\u7F3A\u5931",
    task_store_missing: "Evidence Contract \u5B58\u50A8\u7F3A\u5931",
    inline_v4_migration_required: "\u65E7\u7248 v4 \u6280\u672F\u6570\u636E\u9700\u8981\u8FC1\u79FB",
    contract_drift: "Evidence Contract \u5DF2\u6F02\u79FB",
    contract_invalid: "\u7ED3\u6784\u5316\u89C4\u683C\u65E0\u6548",
    observation_unavailable: "TaskNotes \u89C2\u5BDF\u4E0D\u53EF\u7528",
    reference_unaccepted: "\u5B9E\u9A8C\u53C2\u8003\u771F\u503C\u4E0D\u88AB\u89C4\u683C\u63A5\u53D7",
    "contract.goal": "\u4EFB\u52A1\u76EE\u6807\u9700\u8981\u4FEE\u590D",
    "evidence.execution": "\u6267\u884C\u7ED3\u679C\u9700\u8981\u4FEE\u590D",
    "evidence.verification": "\u9A8C\u8BC1\u7ED3\u679C\u9700\u8981\u4FEE\u590D",
    "evidence.delivery": "\u4EA4\u4ED8\u8BB0\u5F55\u9700\u8981\u4FEE\u590D"
  };
  if (labels[diagnostic.code]) return labels[diagnostic.code];
  if (labels[diagnostic.path]) return labels[diagnostic.path];
  if (diagnostic.path.startsWith("contract.")) return "\u4EFB\u52A1\u89C4\u683C\u9700\u8981\u4FEE\u590D";
  if (diagnostic.path.startsWith("evidence.")) return "\u6267\u884C\u8BC1\u636E\u9700\u8981\u4FEE\u590D";
  return "\u5F53\u524D\u4EFB\u52A1\u5B58\u5728\u7ED3\u6784\u5316\u8BCA\u65AD";
}
function diagnosticLocation(diagnostic) {
  var _a, _b, _c;
  const section2 = ((_a = diagnostic.source) == null ? void 0 : _a.section) || ((_b = diagnostic.source) == null ? void 0 : _b.after_section);
  const line = (_c = diagnostic.source) == null ? void 0 : _c.line_start;
  if (section2 && typeof line === "number" && line > 0) {
    return `${section2} \xB7 \u7B2C ${line} \u884C`;
  }
  if (section2) return section2;
  return "\u4EFB\u52A1\u6587\u4EF6";
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

// src/frozen-task-adapter.ts
var FrozenTaskAdapter = class {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.kind = "task";
    this.selection = null;
    this.displayState = null;
    this.error = "";
    this.loading = false;
    this.queuedRequest = null;
    this.refreshPromise = null;
    this.abortCoordinator = new SnapshotRequestAbortCoordinator();
    this.disclosureStateCache = new DisclosureStateCache(20);
    this.disclosureState = resolveDisclosureState(void 0, true);
    this.refreshScheduler = new TrailingRefreshScheduler(() => {
      void this.refresh();
    });
  }
  async activate(selection) {
    var _a;
    if (selection.adapterKind !== this.kind) {
      throw new Error(`Frozen Task Adapter \u65E0\u6CD5\u5904\u7406\uFF1A${selection.adapterKind}`);
    }
    const sameTask = ((_a = this.selection) == null ? void 0 : _a.resourcePath) === selection.resourcePath;
    this.selection = selection;
    if (!sameTask) {
      this.displayState = null;
      this.error = "";
      this.loading = true;
      this.refreshScheduler.cancel();
      this.abortCoordinator.cancel();
      this.disclosureState = this.disclosureStateCache.forTask(
        selection.resourcePath
      );
      this.dependencies.requestRender();
    }
    this.queuedRequest = selection;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.drainRefreshQueue();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }
  deactivate() {
    this.selection = null;
    this.displayState = null;
    this.queuedRequest = null;
    this.refreshScheduler.cancel();
    this.abortCoordinator.cancel();
    this.loading = false;
    this.error = "";
  }
  shouldReactivate(selection) {
    var _a;
    const state = this.getRenderState();
    return ((_a = this.selection) == null ? void 0 : _a.revision) === selection.revision && this.selection.resourcePath === selection.resourcePath && state !== null && state.snapshot === null && !state.loading;
  }
  close() {
    this.deactivate();
    this.disclosureStateCache.clear();
  }
  async refresh() {
    this.refreshScheduler.cancel();
    if (this.selection) {
      await this.activate(this.selection);
    }
  }
  scheduleRefresh() {
    if (this.selection) {
      this.refreshScheduler.schedule();
    }
  }
  observesTaskFile(filePath) {
    var _a, _b;
    const taskPath = (_a = this.selection) == null ? void 0 : _a.resourcePath;
    return taskPath ? collectObservedTaskPaths(taskPath, (_b = this.displayState) == null ? void 0 : _b.snapshot).has(filePath) : false;
  }
  render(container) {
    const state = this.getRenderState();
    if (state) {
      this.dependencies.render(container, state);
    }
  }
  getRenderState() {
    var _a, _b, _c, _d, _e;
    const taskPath = (_a = this.selection) == null ? void 0 : _a.resourcePath;
    if (!taskPath) return null;
    const displayState = ((_b = this.displayState) == null ? void 0 : _b.taskPath) === taskPath ? this.displayState : null;
    return {
      taskPath,
      snapshot: (_c = displayState == null ? void 0 : displayState.snapshot) != null ? _c : null,
      loadedAt: (_d = displayState == null ? void 0 : displayState.loadedAt) != null ? _d : "",
      staleReason: (_e = displayState == null ? void 0 : displayState.staleReason) != null ? _e : "",
      error: this.error,
      loading: this.loading,
      disclosureState: this.disclosureState
    };
  }
  async drainRefreshQueue() {
    while (this.queuedRequest) {
      const request = this.queuedRequest;
      this.queuedRequest = null;
      await this.loadTaskNow(request);
    }
  }
  async loadTaskNow(request) {
    const signal = this.abortCoordinator.begin();
    this.loading = true;
    this.error = "";
    this.dependencies.requestRender();
    try {
      const snapshot = await this.dependencies.loadSnapshot(
        request.resourcePath,
        signal
      );
      if (!this.dependencies.shell().isCurrent(request)) return;
      const envelopeFailure = resolveSnapshotEnvelopeFailure(
        this.displayState,
        request.resourcePath,
        snapshot
      );
      if (envelopeFailure.error) {
        this.error = envelopeFailure.error;
        this.displayState = envelopeFailure.displayState;
        return;
      }
      this.displayState = {
        taskPath: request.resourcePath,
        snapshot,
        loadedAt: this.dependencies.nowLabel(),
        staleReason: ""
      };
    } catch (error) {
      if (!this.dependencies.shell().isCurrent(request)) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.displayState = resolveRefreshFailureDisplay(
        this.displayState,
        request.resourcePath,
        this.error
      );
    } finally {
      this.abortCoordinator.finish(signal);
      if (this.dependencies.shell().isCurrent(request)) {
        this.loading = false;
        this.dependencies.requestRender();
      }
    }
  }
};

// src/view-shell.ts
function resolveViewShellContext(activePath, previousResourcePath, frontmatterType = "") {
  if (!activePath) return { kind: "empty" };
  if (isTaskPath(activePath)) {
    return { kind: "task", resourcePath: activePath };
  }
  if (frontmatterType === "work-case" || frontmatterType === "session") {
    return { kind: "case", resourcePath: activePath };
  }
  return {
    kind: "unsupported",
    activePath,
    previousResourcePath
  };
}
var ViewShellController = class {
  constructor(adapters) {
    this.adapters = /* @__PURE__ */ new Map();
    this.activeAdapter = null;
    this.revision = 0;
    this.context = { kind: "empty" };
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.kind)) {
        throw new Error(`View adapter \u91CD\u590D\u6CE8\u518C\uFF1A${adapter.kind}`);
      }
      this.adapters.set(adapter.kind, adapter);
    }
  }
  async select(context, options = {}) {
    var _a, _b;
    const nextAdapter = this.resolveAdapter(context);
    const unchanged = sameContext(this.context, context);
    const currentSelection = unchanged && nextAdapter && isActiveContext(context) ? {
      adapterKind: context.kind,
      resourcePath: context.resourcePath,
      revision: this.revision
    } : null;
    const shouldReactivate = Boolean(
      currentSelection && ((_a = nextAdapter == null ? void 0 : nextAdapter.shouldReactivate) == null ? void 0 : _a.call(nextAdapter, currentSelection))
    );
    if (unchanged && !options.force && !shouldReactivate) {
      return;
    }
    if (!unchanged) {
      this.revision += 1;
      (_b = this.activeAdapter) == null ? void 0 : _b.deactivate();
      this.activeAdapter = nextAdapter;
      this.context = context;
    }
    if (!nextAdapter || !isActiveContext(context)) {
      return;
    }
    await nextAdapter.activate({
      adapterKind: context.kind,
      resourcePath: context.resourcePath,
      revision: this.revision
    });
  }
  isCurrent(selection) {
    var _a;
    return isActiveContext(this.context) && ((_a = this.activeAdapter) == null ? void 0 : _a.kind) === selection.adapterKind && this.context.kind === selection.adapterKind && this.context.resourcePath === selection.resourcePath && this.revision === selection.revision;
  }
  close() {
    var _a;
    this.revision += 1;
    (_a = this.activeAdapter) == null ? void 0 : _a.deactivate();
    this.activeAdapter = null;
    this.context = { kind: "empty" };
  }
  resolveAdapter(context) {
    var _a;
    return isActiveContext(context) ? (_a = this.adapters.get(context.kind)) != null ? _a : null : null;
  }
};
function isActiveContext(context) {
  return "resourcePath" in context;
}
function isUnsupportedContext(context) {
  return "activePath" in context;
}
function sameContext(left, right) {
  if (left.kind !== right.kind) return false;
  if (isActiveContext(left) && isActiveContext(right)) {
    return left.resourcePath === right.resourcePath;
  }
  if (isUnsupportedContext(left) && isUnsupportedContext(right)) {
    return left.activePath === right.activePath && left.previousResourcePath === right.previousResourcePath;
  }
  return left.kind === "empty" && right.kind === "empty";
}

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

// src/tasknotes-read.ts
var isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
async function readTaskDetails({ taskPath, apiUrl, auth, signal }) {
  const fail = (message, code = "tasknotes_read_invalid") => {
    throw Object.assign(new Error(formatTaskNotesAuthError(message, auth.token)), { code });
  };
  let response;
  try {
    response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/tasks/${encodeURIComponent(taskPath)}`, {
      method: "GET",
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
      signal,
      redirect: "error"
    });
  } catch (error) {
    return fail(`TaskNotes \u539F\u6587\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  const raw = await response.text();
  let value;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    if (response.ok) return fail("TaskNotes \u539F\u6587\u54CD\u5E94\u4E0D\u662F\u6709\u6548 JSON");
  }
  if (!response.ok) {
    const upstream = isRecord(value) ? value : {};
    return fail(
      `TaskNotes API ${response.status}: ${typeof upstream.error === "string" ? upstream.error : raw || response.statusText}`,
      typeof upstream.code === "string" ? formatTaskNotesAuthError(upstream.code, auth.token) : "tasknotes_http_failed"
    );
  }
  if (isRecord(value) && value.success === false) return fail(`TaskNotes API error: ${typeof value.error === "string" ? value.error : "\u8BFB\u53D6\u5931\u8D25"}`);
  if (isRecord(value) && "data" in value) value = value.data;
  if (!isRecord(value)) return fail("TaskNotes \u539F\u6587\u54CD\u5E94\u7F3A\u5C11 Task \u5BF9\u8C61");
  const identities = [value.id, value.path].filter((x) => x !== void 0);
  if (!identities.length || identities.some((x) => typeof x !== "string" || x !== taskPath)) return fail("TaskNotes \u539F\u6587\u8EAB\u4EFD\u4E0D\u5339\u914D\u6216\u7F3A\u5931");
  if (typeof value.details !== "string") return fail("TaskNotes \u539F\u6587 details \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
  return { id: taskPath, details: value.details, ...value.contexts === void 0 ? {} : { contexts: Array.isArray(value.contexts) && value.contexts.every((x) => typeof x === "string") ? value.contexts : null }, source: { kind: "tasknotes-api", taskId: taskPath, readAt: (/* @__PURE__ */ new Date()).toISOString() } };
}

// src/task-current-progress.ts
var unknown = (gap) => ({ status: "unknown", progress: null, next: null, timestamp: null, source: null, gaps: [gap] });
function instant(value) {
  var _a;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = /* @__PURE__ */ new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  const offset = match[8];
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) return null;
  const epoch = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${offset}`);
  return Number.isFinite(epoch) ? { seconds: epoch / 1e3, fraction: ((_a = match[7]) != null ? _a : "").replace(/0+$/, "") } : null;
}
function compare(a, b) {
  if (a.seconds !== b.seconds) return a.seconds - b.seconds;
  const length = Math.max(a.fraction.length, b.fraction.length), left = a.fraction.padEnd(length, "0"), right = b.fraction.padEnd(length, "0");
  return left === right ? 0 : left < right ? -1 : 1;
}
function fenceScan(lines) {
  const outside = [];
  let fence = null;
  for (const [index, line] of lines.entries()) {
    outside.push(fence === null);
    const visible = !fence && (index === 0 || line.startsWith("\u4E0B\u4E00\u6B65\uFF1A")) ? line.replace(/^(?:进展|完成|下一步)：/, "") : line;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(visible);
    if (!marker) continue;
    if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
    else if (marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
  }
  return { outside, closed: fence === null };
}
function parseEvent(event) {
  var _a, _b, _c;
  const time = event.timestamp === null ? null : instant(event.timestamp), scan = fenceScan(event.lines);
  if (!scan.closed) return null;
  const fields = (prefix) => event.lines.flatMap((line, index) => scan.outside[index] && line.startsWith(prefix) ? [index] : []);
  const operations = fields("\u64CD\u4F5C\uFF1A"), nexts = fields("\u4E0B\u4E00\u6B65\uFF1A");
  if (operations.length > 1 || nexts.length > 1 || operations.length === 1 && event.lines.slice(operations[0] + 1).some((line) => line.trim()) || nexts[0] === 0) return null;
  const end = (_a = operations[0]) != null ? _a : event.lines.length, nextIndex = nexts[0];
  if (nextIndex !== void 0 && nextIndex >= end) return null;
  const progressLines = event.lines.slice(0, nextIndex != null ? nextIndex : end);
  progressLines[0] = (_c = (_b = progressLines[0]) == null ? void 0 : _b.replace(/^(?:进展|完成)：/, "")) != null ? _c : "";
  const progress = progressLines.join("\n");
  const next = nextIndex === void 0 ? null : [event.lines[nextIndex].slice("\u4E0B\u4E00\u6B65\uFF1A".length), ...event.lines.slice(nextIndex + 1, end)].join("\n");
  return progress.trim() && (next === null || next.trim()) ? { progress, next, time } : null;
}
function createTaskCurrentProgress(content, context) {
  var _a, _b;
  if (!context.observationHealthy) return unknown("snapshot \u89C2\u6D4B\u6709\u7F3A\u53E3\u6216\u5DF2\u8FC7\u671F\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
  const sections = content.domainSections.filter((section3) => section3.level === 2 && section3.heading === "Progress");
  if (sections.length !== 1) return unknown(sections.length ? "Progress \u6BB5\u4E0D\u552F\u4E00\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002" : "snapshot \u672A\u63D0\u4F9B\u5B8C\u6574 canonical Progress\uFF1B\u53EF\u4E3B\u52A8\u8BFB\u53D6 API \u539F\u6587\u3002");
  const section2 = sections[0], source = section2.source, start = source == null ? void 0 : source.line_start, end = source == null ? void 0 : source.line_end;
  if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || (source == null ? void 0 : source.truncated) === true || (source == null ? void 0 : source.omitted) === true) return unknown("Progress \u6765\u6E90\u8303\u56F4\u7F3A\u5931\u6216\u660E\u786E\u4E0D\u5B8C\u6574\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
  const lines = section2.text.replace(/\r\n/g, "\n").split("\n");
  const boundary = lines.findIndex((line) => line.startsWith("<!-- flowdesk.task-update/"));
  if (boundary >= 0) {
    if (lines.slice(boundary).some((line) => line.trim() && !/^<!-- flowdesk\.task-update\/.* -->$/.test(line))) return unknown("Progress \u5C3E\u90E8\u7ED3\u6784\u4E0D\u5B8C\u6574\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
    lines.splice(boundary);
  }
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines[0] !== "> [!faq]- \u8BE6\u7EC6\u8FC7\u7A0B\u65E5\u5FD7" || lines.filter((line) => line === "> [!faq]- \u8BE6\u7EC6\u8FC7\u7A0B\u65E5\u5FD7").length !== 1) return unknown("Progress callout \u7F3A\u5931\u3001\u91CD\u590D\u6216\u7ED3\u6784\u7834\u635F\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
  const events = [];
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index], match = /^> - \[x\] (.*)$/.exec(line);
    if (match) {
      const dated = /^`([^`]*)`(?: (.*))?$/.exec(match[1]);
      events.push({ timestamp: dated ? dated[1] : null, lines: [dated ? (_a = dated[2]) != null ? _a : "" : match[1]] });
      continue;
    }
    if (!line.trim() || !events.length && /^> *$/.test(line)) {
      let following = index + 1;
      while (following < lines.length && (!lines[following].trim() || /^> *$/.test(lines[following]))) following++;
      if (/^> - \[x\] /.test((_b = lines[following]) != null ? _b : "") && (!events.length || fenceScan(events[events.length - 1].lines).closed)) {
        index = following - 1;
        continue;
      }
      return unknown("Progress \u4E8B\u4EF6\u6216\u7EED\u884C\u7ED3\u6784\u4E0D\u5B8C\u6574\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
    }
    if (!events.length || line !== ">" && !line.startsWith(">   ")) return unknown("Progress \u4E8B\u4EF6\u6216\u7EED\u884C\u7ED3\u6784\u4E0D\u5B8C\u6574\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
    events[events.length - 1].lines.push(line === ">" ? "" : line.slice(4));
  }
  if (!events.length) return unknown("Progress \u6CA1\u6709\u53EF\u6838\u5BF9\u65E5\u671F\u7684\u4E8B\u4EF6\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
  const parsed = events.map((event) => ({ event, value: parseEvent(event) }));
  if (parsed.some((item) => !item.value)) return unknown("Progress \u5B57\u6BB5\u6216 Markdown \u56F4\u680F\u6709\u7F3A\u53E3\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
  const readable = parsed;
  const valid = readable.filter((item) => item.value.time !== null);
  if (!valid.length) return unknown("Progress \u65E5\u671F\u4E0D\u5B8C\u6574\uFF0C\u6CA1\u6709\u53EF\u6BD4\u8F83\u65E5\u671F\u7684\u7247\u6BB5\uFF1B\u6700\u65B0\u6027\u672A\u77E5\uFF0C\u4E0D\u5C55\u793A\u5F53\u524D Next\u3002");
  const observedAt = instant(context.observedAt);
  if (!observedAt) return unknown("snapshot \u89C2\u6D4B\u65F6\u95F4\u7F3A\u5931\u6216\u4E0D\u53EF\u6BD4\u8F83\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
  if (valid.some((item) => compare(item.value.time, observedAt) > 0)) return unknown("Progress \u542B\u672A\u6765\u65E5\u671F\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
  const byInstant = /* @__PURE__ */ new Map();
  for (const { value } of valid) {
    const key = `${value.time.seconds}:${value.time.fraction}`, previous = byInstant.get(key);
    if (previous && (previous.progress !== value.progress || previous.next !== value.next)) return unknown("\u540C\u4E00\u65F6\u523B\u7684 Progress \u5185\u5BB9\u51B2\u7A81\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002");
    byInstant.set(key, value);
  }
  const latest = valid.reduce((a, b) => compare(a.value.time, b.value.time) > 0 ? a : b);
  if (valid.length !== readable.length) {
    const gaps2 = ["Progress \u65E5\u671F\u6709\u7F3A\u53E3\uFF1B\u4EC5\u5C55\u793A\u53EF\u6BD4\u8F83\u65E5\u671F\u4E2D\u6700\u8FD1\u7684\u7247\u6BB5\uFF0C\u6700\u65B0\u6027\u672A\u77E5\uFF1B\u4E0D\u5C55\u793A\u5F53\u524D Next\u3002"];
    if (context.statusIsCompleted === null) gaps2.push("\u751F\u547D\u5468\u671F\u672A\u77E5\u3002");
    return { status: "unknown", progress: latest.value.progress, next: null, timestamp: latest.event.timestamp, source, gaps: gaps2 };
  }
  const status = context.statusIsCompleted === true ? "historical" : context.statusIsCompleted === false ? "current" : "unknown";
  const next = status === "current" ? latest.value.next : null;
  const gaps = status === "unknown" ? ["\u751F\u547D\u5468\u671F\u672A\u77E5\uFF1B\u4E0D\u5C55\u793A\u5F53\u524D Next\u3002"] : status === "current" && next === null ? ["\u8BE5\u6B21 Progress \u672A\u63D0\u4F9B Next\u3002"] : [];
  return { status, progress: latest.value.progress, next, timestamp: latest.event.timestamp, source, gaps };
}

// src/task-content.ts
var text = (value) => typeof value === "string" ? value : "";
function createTaskContent(snapshot, taskPath) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  const v4 = snapshot.snapshot_schema_version === 4;
  const contract = (_b = v4 ? (_a = snapshot.contract) == null ? void 0 : _a.task_contract : snapshot.contract) != null ? _b : {};
  const records = (_d = (_c = snapshot.current_task) == null ? void 0 : _c.records) != null ? _d : {};
  const hasScopeText = v4 && ((_e = snapshot.contract) == null ? void 0 : _e.status) !== "legacy_v3" && Object.prototype.hasOwnProperty.call(contract, "scope_text");
  return {
    taskId: taskPath,
    goal: text(contract.goal),
    why: text(contract.why),
    steps: text(contract.steps),
    scopeText: hasScopeText ? text(contract.scope_text) : [
      ...((_g = (_f = contract.scope) == null ? void 0 : _f.included) != null ? _g : []).map((x) => `- \u5305\u542B\uFF1A${x}`),
      ...((_i = (_h = contract.scope) == null ? void 0 : _h.excluded) != null ? _i : []).map((x) => `- \u4E0D\u5305\u542B\uFF1A${x}`)
    ].join("\n"),
    domainSections: (_j = contract.domain_sections) != null ? _j : [],
    records: { execution: Array.isArray(records.execution) ? records.execution : [], verification: Array.isArray(records.verification) ? records.verification : [], delivery: Array.isArray(records.delivery) ? records.delivery : [] },
    requirements: (_k = contract.requirements) != null ? _k : [],
    scenarios: (_l = contract.scenarios) != null ? _l : [],
    acceptance: (_m = contract.acceptance) != null ? _m : []
  };
}
function rawContentDiffers(content, observation, snapshot) {
  var _a;
  if (observation.error || content.taskId !== observation.taskId) return false;
  const normalize2 = (value) => value.replace(/\r\n/g, "\n").trim();
  const details = normalize2(observation.details);
  const contract = (snapshot == null ? void 0 : snapshot.snapshot_schema_version) === 4 ? snapshot.contract : null;
  const rawScope = (contract == null ? void 0 : contract.status) !== "legacy_v3" ? text((_a = contract == null ? void 0 : contract.task_contract) == null ? void 0 : _a.scope_text) : "";
  const fragments = [
    content.goal,
    content.why,
    content.steps,
    rawScope,
    ...content.requirements.map((x) => text(x.text)),
    ...content.scenarios.map((x) => text(x.text)),
    ...content.acceptance.map((x) => text(x.text)),
    ...content.domainSections.map((x) => x.text),
    ...Object.values(content.records).flat().map((x) => x.text)
  ];
  return fragments.some((x) => normalize2(x) !== "" && !details.includes(normalize2(x)));
}
function createTaskReadingSections(content) {
  const entries = [
    ...content.domainSections.map((section2) => ({ kind: "domain", section: section2 })),
    ...["execution", "verification", "delivery"].flatMap((kind) => content.records[kind].map((section2) => ({ kind, section: section2 })))
  ];
  const position = (entry) => {
    var _a;
    const line = (_a = entry.section.source) == null ? void 0 : _a.line_start;
    return typeof line === "number" && Number.isInteger(line) && line > 0 ? line : null;
  };
  return {
    orderComplete: entries.every((entry) => position(entry) !== null),
    sections: entries.map((entry, index) => ({ entry, index, line: position(entry) })).sort((a, b) => {
      if (a.line === null || b.line === null) return a.line === b.line ? a.index - b.index : a.line === null ? 1 : -1;
      return a.line - b.line || a.index - b.index;
    }).map((item) => item.entry)
  };
}

// src/task-content-renderer.ts
var TaskContentRenderer = class {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  render(container, content) {
    var _a, _b;
    const body = (parent, text2) => {
      const element = parent.createDiv({ cls: "flowdesk-contract-scope-markdown markdown-rendered" });
      void this.dependencies.renderMarkdown(text2, element, content.taskId).catch(() => {
        element.setText(text2);
      });
    };
    const source = (parent, section3) => {
      var _a2;
      const button = parent.createEl("button", { cls: "flowdesk-content-source", text: section3.source ? "\u6253\u5F00\u8FD9\u4E00\u6761\u539F\u6587" : "\u6253\u5F00\u4EFB\u52A1\u539F\u6587", attr: { "aria-label": `${section3.source ? "\u6253\u5F00\u8FD9\u4E00\u6761\u539F\u6587" : "\u6253\u5F00\u4EFB\u52A1\u539F\u6587"}\uFF1A${section3.heading}` } });
      button.addEventListener("click", () => {
        void this.dependencies.openSource(content.taskId, section3);
      });
      if (section3.source) {
        const line = section3.source.line_start, reliable = typeof line === "number" && Number.isInteger(line) && line > 0;
        parent.createDiv({ cls: "flowdesk-muted", text: `${(_a2 = section3.source.section) != null ? _a2 : section3.heading}${reliable ? ` \xB7 API details \u7B2C ${line} \u884C` : " \xB7 API details \u884C\u4F4D\u7F6E\u672A\u77E5"}` });
      }
    };
    const section2 = (heading, text2, original, open = false, cls = "flowdesk-contract-item-details") => {
      const element = container.createEl("details", { cls });
      element.open = open;
      element.createEl("summary", { text: heading });
      if (text2) body(element, text2);
      else element.createDiv({ cls: "flowdesk-muted", text: "\u6295\u5F71\u672A\u63D0\u4F9B\u5185\u5BB9\uFF1B\u53EF\u67E5\u770B\u5B8C\u6574 API \u539F\u6587\u3002" });
      source(element, original != null ? original : { heading, level: 2, text: text2 });
    };
    for (const [heading, text2] of [["\u76EE\u6807", content.goal], ["\u80CC\u666F", content.why], ["\u8303\u56F4", content.scopeText], ["\u6267\u884C\u6E05\u5355", content.steps]]) {
      if (text2 || heading === "\u8303\u56F4") section2(heading, text2, void 0, heading === "\u76EE\u6807");
    }
    const items = (heading, entries) => {
      var _a2, _b2, _c, _d;
      for (const item of entries) {
        const original = { heading, level: 2, text: (_b2 = (_a2 = item.text) != null ? _a2 : item.label) != null ? _b2 : "", source: item.source };
        const id = (_d = (_c = item.uid) != null ? _c : item.id) != null ? _d : "";
        section2(`${heading}${id ? ` \xB7 ${id}` : ""}`, original.text, original);
      }
    };
    items("\u9700\u6C42\u539F\u6587\u6761\u76EE", content.requirements);
    items("\u573A\u666F\u539F\u6587\u6761\u76EE", content.scenarios);
    for (const item of content.acceptance) {
      const original = { heading: "\u9A8C\u6536\u539F\u6587\u6761\u76EE", level: 2, text: (_b = (_a = item.text) != null ? _a : item.label) != null ? _b : "", source: item.source };
      section2("\u9A8C\u6536\u539F\u6587\u6761\u76EE\uFF08\u539F\u6587\u52FE\u9009\uFF09", `- [${item.checked ? "x" : " "}] ${original.text}`, original);
    }
    const reading = createTaskReadingSections(content);
    if (!reading.orderComplete) container.createDiv({ cls: "flowdesk-muted", text: "\u90E8\u5206\u6BB5\u843D\u65E0\u53EF\u9760\u4F4D\u7F6E\uFF0C\u5B8C\u6574\u987A\u5E8F\u8BF7\u67E5\u770B API \u539F\u6587\u3002" });
    const labels = { domain: "\u6B63\u6587", execution: "\u6267\u884C", verification: "\u9A8C\u8BC1", delivery: "\u4EA4\u4ED8" };
    for (const { kind, section: original } of reading.sections) {
      const heading = `${labels[kind]} \xB7 H${original.level} \xB7 ${original.heading}${original.timestamp ? ` \xB7 ${original.timestamp}` : ""}`;
      section2(heading, original.text, original, true, kind === "domain" ? "flowdesk-contract-item-details" : "flowdesk-contract-item-details flowdesk-record-round");
    }
  }
};

// src/snapshot-model.ts
function createDashboardViewModel(value, options = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$, _aa, _ba, _ca, _da, _ea, _fa, _ga, _ha, _ia, _ja, _ka, _la, _ma, _na;
  const snapshot = isRecord2(value) ? value : {};
  const schemaVersion = snapshot.snapshot_schema_version;
  const isV4 = schemaVersion === 4;
  const isV3 = schemaVersion === 3;
  const v4Snapshot = isV4 ? snapshot : null;
  const v3Snapshot = isV3 ? snapshot : null;
  const schemaSupported = isV3 || isV4;
  const modelSupported = snapshot.snapshot_model === "task-centric";
  const protocol = normalizeProtocol(v4Snapshot == null ? void 0 : v4Snapshot.protocol, isV3);
  const protocolSupported = protocol.supported;
  const currentTask = (_a = snapshot.current_task) != null ? _a : {};
  const currentTaskId = normalizeText(
    currentTask.id,
    snapshotSourceTaskId(snapshot)
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
  const isTrustworthy = schemaSupported && modelSupported && protocolSupported && observationHealth === "healthy" && ((_g = snapshot.observation) == null ? void 0 : _g.current_task) === "observed" && parentObserved && ((_h = snapshot.observation) == null ? void 0 : _h.children) === "observed" && ((_i = snapshot.observation) == null ? void 0 : _i.tasknotes_api) === "ok" && sourceIdentityMatch === true && ((_j = snapshot.observation) == null ? void 0 : _j.stale) === false && sourceIdentity === true && !staleReason;
  const evidenceRequirements = isV4 ? ((_k = currentTask.evidence_requirements) != null ? _k : []).map(
    normalizeStructuredEvidenceRequirement
  ) : [];
  const acceptance = isV4 ? ((_l = currentTask.acceptance) != null ? _l : []).map(normalizeDerivedAcceptance) : [];
  const review = isV4 ? normalizeReviewSummary(currentTask.review) : emptyReviewSummary("legacy_v3");
  const completion = isV4 ? normalizeCompletion(currentTask.completion, currentTask.status) : legacyCompletion(currentTask, v3Snapshot != null ? v3Snapshot : {});
  const evidence = isV4 ? completion.trustLevel === "legacy_v3" ? normalizeEvidenceHealth((_m = currentTask.legacy_v3) == null ? void 0 : _m.evidence_health) : evidenceHealthFromCompletion(completion) : normalizeEvidenceHealth(v3Snapshot == null ? void 0 : v3Snapshot.evidence);
  const diagnostics = ((_n = snapshot.diagnostics) != null ? _n : []).map(
    (diagnostic) => normalizeDiagnostic(diagnostic, currentTaskId)
  );
  const children = ((_o = snapshot.children) != null ? _o : []).map(
    (child) => createChildViewModel(child)
  );
  const v4TaskContract = (_p = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _p.task_contract;
  const v4HasScopeText = isV4 && ((_q = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _q.status) !== "legacy_v3" && isRecord2(v4TaskContract) && Object.prototype.hasOwnProperty.call(v4TaskContract, "scope_text");
  const content = createTaskContent(snapshot, currentTaskId);
  return {
    content,
    errorCode: !schemaSupported ? "unsupported_snapshot_schema" : !modelSupported ? "unsupported_snapshot_model" : !protocolSupported ? "unsupported_snapshot_protocol" : null,
    schemaSupported,
    modelSupported,
    schemaLabel: schemaSupported && modelSupported && protocolSupported ? isV4 ? "snapshot v4 \xB7 task-centric" : "snapshot v3 \xB7 task-centric \xB7 legacy_v3" : "\u4E0D\u652F\u6301\u7684 snapshot \u6A21\u578B",
    currentTask: {
      id: currentTaskId,
      title: normalizeText(currentTask.title, "\u672A\u63D0\u4F9B\u4EFB\u52A1\u6807\u9898"),
      status: normalizeText(currentTask.status, "unknown"),
      statusIsCompleted: nullableBoolean(currentTask.status_is_completed),
      priority: normalizeText(currentTask.priority, "\u672A\u63D0\u4F9B"),
      isBlocked: currentTask.is_blocked === true,
      blockedBy: ((_r = currentTask.blocked_by) != null ? _r : []).map(normalizeBlockedBy).filter(Boolean),
      parentId: typeof currentTask.parent_id === "string" ? currentTask.parent_id : null,
      hasChildren: currentTask.has_children === true,
      rollupState: normalizeText(currentTask.rollup_state, "unknown"),
      trustedDone: completion.trustedDone,
      trustLevel: completion.trustLevel,
      completion,
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
      childrenTerminal: nullableBoolean(rollup.children_terminal),
      blockedChildren: (_s = rollup.blocked_children) != null ? _s : [],
      incompleteChildren: (_t = rollup.incomplete_children) != null ? _t : [],
      contradictions: (_u = rollup.contradictions) != null ? _u : []
    },
    contract: {
      version: isV4 ? normalizeText(
        (_w = (_v = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _v.task_contract) == null ? void 0 : _w.schema,
        normalizeText(
          (_y = (_x = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _x.task_contract) == null ? void 0 : _y.version,
          "\u672A\u63D0\u4F9B"
        )
      ) : normalizeText((_z = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _z.version, "\u672A\u63D0\u4F9B"),
      goal: isV4 ? normalizeText((_B = (_A = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _A.task_contract) == null ? void 0 : _B.goal, "\u672A\u63D0\u4F9B") : normalizeText((_C = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _C.goal, "\u672A\u63D0\u4F9B"),
      scope: {
        included: (_I = (_H = v4HasScopeText ? [] : isV4 ? (_D = v4TaskContract == null ? void 0 : v4TaskContract.scope) == null ? void 0 : _D.included : (_G = (_F = (_E = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _E.scope) == null ? void 0 : _F.included) != null ? _G : []) == null ? void 0 : _H.map(String)) != null ? _I : [],
        excluded: (_O = (_N = v4HasScopeText ? [] : isV4 ? (_J = v4TaskContract == null ? void 0 : v4TaskContract.scope) == null ? void 0 : _J.excluded : (_M = (_L = (_K = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _K.scope) == null ? void 0 : _L.excluded) != null ? _M : []) == null ? void 0 : _N.map(String)) != null ? _O : [],
        ...v4HasScopeText ? { text: normalizeText(v4TaskContract == null ? void 0 : v4TaskContract.scope_text, "") } : {}
      },
      semanticStatus: isV4 ? ((_P = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _P.status) === "legacy_v3" ? normalizeText(
        (_Q = v4Snapshot.contract.task_contract) == null ? void 0 : _Q.semantic_status,
        "unknown"
      ) : normalizeText((_R = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _R.status, "unknown") : normalizeText(
        (_S = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _S.semantic_status,
        "unknown"
      ),
      requirements: isV4 ? (_V = (_U = (_T = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _T.task_contract) == null ? void 0 : _U.requirements) != null ? _V : [] : (_X = (_W = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _W.requirements) != null ? _X : [],
      scenarios: isV4 ? (__ = (_Z = (_Y = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _Y.task_contract) == null ? void 0 : _Z.scenarios) != null ? __ : [] : (_aa = (_$ = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _$.scenarios) != null ? _aa : [],
      acceptance: isV4 ? (_da = (_ca = (_ba = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _ba.task_contract) == null ? void 0 : _ca.acceptance) != null ? _da : [] : (_fa = (_ea = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _ea.acceptance) != null ? _fa : []
    },
    evidenceRequirements,
    acceptance,
    review,
    protocol,
    evidence,
    observation: {
      health: observationHealth,
      currentTask: normalizeText((_ga = snapshot.observation) == null ? void 0 : _ga.current_task, "unknown"),
      parent: normalizeText((_ha = snapshot.observation) == null ? void 0 : _ha.parent, "unknown"),
      children: normalizeText((_ia = snapshot.observation) == null ? void 0 : _ia.children, "unknown"),
      tasknotesApi: normalizeText((_ja = snapshot.observation) == null ? void 0 : _ja.tasknotes_api, "unknown"),
      sourceIdentityMatch,
      sourceTaskId: snapshotSourceTaskId(snapshot),
      generatedAt: isV4 ? normalizeText((_ka = v4Snapshot == null ? void 0 : v4Snapshot.source) == null ? void 0 : _ka.generated_at, "\u672A\u63D0\u4F9B") : normalizeText(v3Snapshot == null ? void 0 : v3Snapshot.generated_at, "\u672A\u63D0\u4F9B"),
      isTrustworthy,
      trustMessage: isTrustworthy ? "\u89C2\u6D4B\u53EF\u4FE1" : "\u89C2\u6D4B\u4E0D\u53EF\u4FE1\uFF0C\u65E0\u6CD5\u5224\u65AD\u4EFB\u52A1\u662F\u5426\u6B63\u5E38",
      isStale: Boolean(staleReason) || ((_la = snapshot.observation) == null ? void 0 : _la.stale) === true,
      staleReason,
      loadedAt: normalizeText(options.loadedAt, "\u672A\u63D0\u4F9B"),
      sourceIdentity
    },
    primaryDiagnostic: (_ma = diagnostics[0]) != null ? _ma : null,
    diagnostics,
    nextAction: formatNextAction((_na = snapshot.next_actions) == null ? void 0 : _na[0]),
    records: content.records
  };
}
function validateSnapshotSource(value, expectedTaskPath) {
  const snapshot = isRecord2(value) ? value : {};
  const actual = snapshotSourceTaskId(snapshot);
  const expected = normalizeText(expectedTaskPath, "");
  if (!actual || !expected) {
    return "unknown";
  }
  return actual === expected;
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
    repair_contract: "\u4FEE\u590D\u5F53\u524D\u4EFB\u52A1\u89C4\u683C"
  };
  const taskIds = Array.isArray(action.task_ids) ? action.task_ids.map(String).filter(Boolean) : [];
  const label = (_a = labels[kind]) != null ? _a : kind;
  return taskIds.length ? `${label}\uFF1A${taskIds.join("\u3001")}` : label;
}
function snapshotSourceTaskId(snapshot) {
  var _a;
  return snapshot.snapshot_schema_version === 4 ? normalizeText((_a = snapshot.source) == null ? void 0 : _a.task_id, "") : normalizeText(snapshot.source_task_id, "");
}
function normalizeProtocol(value, isLegacyV3) {
  if (isLegacyV3) {
    return {
      supported: true,
      producerProtocolVersion: 3,
      taskContractSchema: "flowdesk.task-contract/3",
      evidenceContractSchema: "legacy_v3",
      evidenceRecordSchema: "legacy_v3",
      reviewRecordSchema: "legacy_v3",
      legacyPolicy: "explicit_legacy_v3"
    };
  }
  const protocol = value != null ? value : {};
  const normalized2 = {
    producerProtocolVersion: finiteNumber(protocol.producer_protocol_version),
    taskContractSchema: normalizeText(protocol.task_contract_schema, ""),
    evidenceContractSchema: normalizeText(protocol.evidence_contract_schema, ""),
    evidenceRecordSchema: normalizeText(protocol.evidence_record_schema, ""),
    reviewRecordSchema: normalizeText(protocol.review_record_schema, ""),
    legacyPolicy: normalizeText(protocol.legacy_policy, "")
  };
  return {
    supported: normalized2.producerProtocolVersion === 4 && normalized2.taskContractSchema === "flowdesk.task-contract/4" && normalized2.evidenceContractSchema === "flowdesk.evidence-contract/1" && normalized2.evidenceRecordSchema === "flowdesk.evidence-record/1" && normalized2.reviewRecordSchema === "flowdesk.review-record/1" || normalized2.producerProtocolVersion === 4 && normalized2.taskContractSchema === "legacy_v3" && protocol.evidence_contract_schema === null && protocol.evidence_record_schema === null && protocol.review_record_schema === null && normalized2.legacyPolicy === "explicit_legacy_v3",
    ...normalized2
  };
}
function normalizeCompletion(value, fallbackStatus) {
  const completion = value != null ? value : {};
  return {
    subtreeTerminal: nullableBoolean(completion.subtree_terminal),
    lifecycleStatus: normalizeText(
      completion.lifecycle_status,
      normalizeText(fallbackStatus, "unknown")
    ),
    contractStatus: normalizeText(completion.contract_status, "unknown"),
    evidenceStatus: normalizeText(completion.evidence_status, "unknown"),
    verificationStatus: normalizeText(
      completion.verification_status,
      "unknown"
    ),
    reviewStatus: normalizeText(completion.review_status, "unknown"),
    acceptanceStatus: normalizeText(completion.acceptance_status, "unknown"),
    trustLevel: normalizeText(completion.trust_level, "unknown"),
    trustedDone: completion.trusted_done === true
  };
}
function legacyCompletion(currentTask, snapshot) {
  var _a, _b, _c, _d;
  const evidence = normalizeEvidenceHealth(snapshot.evidence);
  const evidenceValues = [
    evidence.execution,
    evidence.verification,
    evidence.delivery
  ];
  const acceptance = (_b = (_a = snapshot.contract) == null ? void 0 : _a.acceptance) != null ? _b : [];
  return {
    subtreeTerminal: nullableBoolean((_c = currentTask.completion) == null ? void 0 : _c.subtree_terminal),
    lifecycleStatus: normalizeText(currentTask.status, "unknown"),
    contractStatus: normalizeText(
      (_d = snapshot.contract) == null ? void 0 : _d.semantic_status,
      "unknown"
    ),
    evidenceStatus: evidenceValues.every((value) => value === "valid") ? "satisfied" : evidenceValues.some((value) => value === "invalid") ? "invalid" : "missing",
    verificationStatus: evidence.verification === "valid" ? "passed" : evidence.verification === "invalid" ? "failed" : "missing",
    reviewStatus: "legacy_v3",
    acceptanceStatus: acceptance.length > 0 && acceptance.every((item) => item.checked === true) ? "satisfied" : "incomplete",
    trustLevel: "legacy_v3",
    trustedDone: currentTask.trusted_done === true
  };
}
function evidenceHealthFromCompletion(completion) {
  const evidence = completion.evidenceStatus === "satisfied" ? "valid" : completion.evidenceStatus === "failed" || completion.evidenceStatus === "invalid" ? "invalid" : "missing";
  const verification = completion.verificationStatus === "passed" ? "valid" : completion.verificationStatus === "failed" ? "invalid" : "missing";
  const delivery = completion.reviewStatus === "approved" && completion.acceptanceStatus === "satisfied" ? "valid" : completion.reviewStatus === "changes_requested" ? "invalid" : "missing";
  return { execution: evidence, verification, delivery };
}
function normalizeStructuredEvidenceRequirement(value) {
  var _a;
  return {
    uid: normalizeText(value.uid, "\u672A\u63D0\u4F9B"),
    componentUid: normalizeText(value.component_uid, "\u672A\u63D0\u4F9B"),
    semanticRevision: finiteNumber(value.semantic_revision),
    method: normalizeText(value.method, "unknown"),
    required: value.required === true,
    satisfies: ((_a = value.satisfies) != null ? _a : []).map(String),
    expected: isRecord2(value.expected) ? value.expected : {},
    reviewRequired: value.review_required === true,
    status: normalizeText(value.status, "unknown"),
    runId: nullableText(value.run_id),
    actual: isRecord2(value.actual) ? value.actual : null,
    matchedExpected: typeof value.matched_expected === "boolean" ? value.matched_expected : null,
    provenance: normalizeText(value.provenance, "unknown"),
    stdoutDigest: nullableText(value.stdout_digest),
    stderrDigest: nullableText(value.stderr_digest),
    runtimeOrigin: nullableText(value.runtime_origin),
    implementationDigest: nullableText(value.implementation_digest)
  };
}
function normalizeDerivedAcceptance(value) {
  var _a;
  return {
    uid: normalizeText(value.uid, "\u672A\u63D0\u4F9B"),
    label: normalizeText(value.label, "\u672A\u63D0\u4F9B"),
    required: value.required === true,
    status: normalizeText(value.status, "unknown"),
    evidenceRequirementUids: ((_a = value.evidence_requirement_uids) != null ? _a : []).map(String)
  };
}
function normalizeReviewSummary(value) {
  var _a;
  const review = value != null ? value : {};
  return {
    status: normalizeText(review.status, "not_required"),
    requirementUids: ((_a = review.requirement_uids) != null ? _a : []).map(String),
    componentRevisions: isRecord2(review.component_revisions) ? Object.fromEntries(
      Object.entries(review.component_revisions).filter(
        (entry) => typeof entry[1] === "number" && Number.isFinite(entry[1])
      )
    ) : {},
    evidenceBundleDigest: nullableText(review.evidence_bundle_digest),
    record: isRecord2(review.record) ? review.record : null
  };
}
function emptyReviewSummary(status) {
  return {
    status,
    requirementUids: [],
    componentRevisions: {},
    evidenceBundleDigest: null,
    record: null
  };
}
function createChildViewModel(child) {
  var _a, _b, _c, _d;
  const id = normalizeText(child.id, "");
  const completion = child.completion ? normalizeCompletion(child.completion, child.status) : null;
  return {
    id,
    title: normalizeText(child.title, id || "\u672A\u547D\u540D\u5B50\u4EFB\u52A1"),
    status: normalizeText(child.status, "unknown"),
    statusIsCompleted: nullableBoolean(child.status_is_completed),
    subtreeTerminal: nullableBoolean((_a = child.completion) == null ? void 0 : _a.subtree_terminal),
    priority: normalizeText(child.priority, "\u672A\u63D0\u4F9B"),
    isBlocked: child.is_blocked === true,
    blockedBy: ((_b = child.blocked_by) != null ? _b : []).map(normalizeBlockedBy).filter(Boolean),
    goal: normalizeText(child.goal, "\u672A\u63D0\u4F9B"),
    hasChildren: child.has_children === true,
    rollupState: normalizeText(child.rollup_state, "unknown"),
    semanticStatus: normalizeText(
      (_c = child.legacy_v3) == null ? void 0 : _c.semantic_status,
      normalizeText(child.semantic_status, "unknown")
    ),
    evidenceHealth: (completion == null ? void 0 : completion.trustLevel) === "legacy_v3" ? normalizeEvidenceHealth((_d = child.legacy_v3) == null ? void 0 : _d.evidence_health) : completion ? evidenceHealthFromCompletion(completion) : normalizeEvidenceHealth(child.evidence_health),
    trustedDone: completion ? completion.trustedDone : child.trusted_done === true,
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
  const diagnostic = isRecord2(value) ? value : {};
  const reason = isRecord2(diagnostic.reason) ? diagnostic.reason : {};
  const remediation = isRecord2(diagnostic.remediation) ? diagnostic.remediation : {};
  const evidence = isRecord2(diagnostic.evidence) ? diagnostic.evidence : null;
  return {
    code: normalizeText(diagnostic.code, "unknown_diagnostic"),
    severity: normalizeText(diagnostic.severity, "error"),
    taskId: normalizeText(diagnostic.task_id, fallbackTaskId),
    path: normalizeText(diagnostic.path, "\u672A\u63D0\u4F9B"),
    source: isRecord2(diagnostic.source) ? diagnostic.source : void 0,
    reason: normalizeText(
      reason.actual,
      normalizeText(diagnostic.reason, "producer \u672A\u63D0\u4F9B")
    ),
    expected: normalizeText(
      reason.expected,
      normalizeText(
        diagnostic.expected,
        evidence ? JSON.stringify(evidence) : "producer \u672A\u63D0\u4F9B"
      )
    ),
    remediation: normalizeText(
      remediation.summary,
      normalizeText(
        diagnostic.next_action,
        normalizeText(diagnostic.remediation, "producer \u672A\u63D0\u4F9B")
      )
    ),
    evidence
  };
}
function normalizeBlockedBy(value) {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord2(value)) {
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
function nullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}
function nullableText(value) {
  const normalized2 = normalizeText(value, "");
  return normalized2 || null;
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/task-navigation.ts
function taskNavigationLeafType(origin) {
  return origin === "current" ? false : "tab";
}

// src/diagnostic-clipboard.ts
function formatDiagnosticClipboard(input) {
  const location = input.location.trim() || "\u672A\u63D0\u4F9B";
  return [
    `\u4EFB\u52A1\uFF1A${input.taskTitle}\uFF08${input.taskId}\uFF09`,
    `\u95EE\u9898\uFF1A${input.title}`,
    `\u539F\u56E0\uFF1A${input.reason}`,
    `\u5EFA\u8BAE\uFF1A${input.remediation}`,
    `\u9519\u8BEF\u7801\uFF1A${input.code}`,
    `\u5B57\u6BB5\uFF1A${input.path}`,
    `\u4F4D\u7F6E\uFF1A${location}`
  ].join("\n");
}

// src/resume-presentation.ts
function validateResumeBundle(value, casePath, items) {
  if (value === void 0 || value === null) return null;
  const fail = () => {
    throw Error("resume_bundle \u6765\u6E90\u3001\u8EAB\u4EFD\u6216\u5B57\u6BB5\u65E0\u6548");
  };
  const record2 = (x) => x && typeof x === "object" && !Array.isArray(x);
  const strings = (x) => Array.isArray(x) && x.every((y) => typeof y === "string");
  const integer = (x, min = 0) => Number.isInteger(x) && x >= min;
  const b = value;
  if (!record2(b) || b.source !== `TaskNotes API details via Work Case snapshot: ${casePath}` || !Array.isArray(b.tasks) || !record2(b.resume_observation)) return fail();
  const o = b.resume_observation;
  if (typeof o.api_health !== "string" || typeof o.api_complete !== "boolean" || typeof o.projection_truncated !== "boolean" || !integer(o.omitted_count) || !Array.isArray(o.diagnostics) || !o.diagnostics.every((d) => record2(d) && [d.code, d.path, d.message].every((x) => typeof x === "string"))) return fail();
  const ids = /* @__PURE__ */ new Set();
  for (const task of b.tasks) {
    if (!record2(task) || ![task.id, task.title, task.status, task.source].every((x) => typeof x === "string") || ids.has(task.id) || task.source !== `TaskNotes API ${task.id} details`) return fail();
    ids.add(task.id);
    const owner = items.find((x) => x.id === task.id);
    if (!owner || owner.status !== task.status) return fail();
    for (const field of ["goal", "result", "next", "blocker"]) if (task[field] !== void 0 && typeof task[field] !== "string") return fail();
    if (!strings(task.resume_missing) || !Array.isArray(task.resume_sources) || !Array.isArray(task.resume_operation_refs)) return fail();
    for (const s of task.resume_sources) if (!record2(s) || s.task_id !== task.id || ![s.field, s.section].every((x) => typeof x === "string") || !integer(s.line_start, 1) || !integer(s.line_end, s.line_start) || typeof s.truncated !== "boolean" || !integer(s.original_bytes) || !integer(s.included_bytes) || s.included_bytes > s.original_bytes || s.timestamp !== void 0 && typeof s.timestamp !== "string") return fail();
    for (const ref of task.resume_operation_refs) if (!record2(ref) || typeof ref.operation_id !== "string" || !integer(ref.line, 1)) return fail();
  }
  return value;
}
function createResumePresentation(bundle, caseModel) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const c = caseModel.workCase;
  const history = { agent: c.agent, nativeId: c.agentSessionId, device: c.device };
  const continuationInstructions = `\u5728\u539Fowner\u4F1A\u8BDD\u4F7F\u7528 work \u7EE7\u7EED\u51C6\u786ECase/Task\uFF0C\u5148\u91CD\u65B0\u8BFB\u53D6TaskNotes\u72B6\u6001\u4E0E\u7ED3\u679C\uFF0C\u907F\u514D\u91CD\u505A\u5DF2\u5B8C\u6210\u9879\u3002\u6362\u8F7D\u4F53\u524D\u5148\u4FDD\u5B58\u5E76\u56DE\u8BFB\u8FDB\u5C55\uFF0C\u6B63\u5E38\u505C\u6B62\u65E7\u6267\u884C\u53CA\u5DF2\u77E5\u540E\u53F0\u5DE5\u4F5C\uFF1B\u91CA\u653E\u672A\u77E5\u65F6\u4EC5\u53EA\u8BFB\u6062\u590D\u6216\u56DE\u539Fowner\u3002\u591A\u4E2A\u672A\u5B8C\u6210Task\u9700\u660E\u786E\u9009\u62E9\u51C6\u786EID\u3002Dashboard\u6CA1\u6709\u5DF2\u9A8C\u8BC1\u7684\u5BBF\u4E3B\u5386\u53F2\u81EA\u52A8\u6253\u5F00/\u4E00\u952E\u63A5\u7BA1\u80FD\u529B\uFF1B\u539F\u6807\u8BC6\u4EC5\u4E3A\u5386\u53F2\u6307\u9488\u3002`;
  const gaps = [];
  if (!bundle) gaps.push("\u5F53\u524Dproducer\u672A\u63D0\u4F9Bresume_bundle\uFF1B\u6062\u590D\u6295\u5F71\u4E0D\u53EF\u7528\uFF0C\u4ECD\u53EF\u8BFB\u5B8C\u6574Case/Task\u539F\u6587\u3002");
  else {
    const o = bundle.resume_observation;
    if (!o.api_complete || o.api_health !== "healthy") gaps.push(`\u6062\u590DAPI\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF1A${o.api_health} / api_complete=${o.api_complete}`);
    if (o.projection_truncated) gaps.push("\u6062\u590D\u6295\u5F71\u88AB\u622A\u65AD\uFF1B\u5B8C\u6574\u6B63\u6587\u4ECD\u9700\u539F\u6587\u8BFB\u53D6\u3002");
    if (o.omitted_count) gaps.push(`\u6062\u590D\u6295\u5F71\u7701\u7565 ${o.omitted_count} \u4E2ATask\uFF08omitted_count\uFF09\uFF1B\u4E0D\u662F\u96F6\u4EFB\u52A1\u3002`);
    gaps.push(...o.diagnostics.map((d) => `${d.code} \xB7 ${d.path}\uFF1A${d.message}`));
  }
  if (!history.nativeId) gaps.push("\u539F\u751F\u4F1A\u8BDD\u6807\u8BC6\u7F3A\u5931\uFF0C\u4E0D\u80FD\u4ECEagent/workspace\u6216\u6807\u9898\u63A8\u65AD\u3002");
  if (!c.cwd) gaps.push("Case cwd\u672A\u8BB0\u5F55\uFF0C\u4E0D\u80FD\u63A8\u65AD\u5F53\u524Dcheckout\u3002");
  const tasks = ((_a = bundle == null ? void 0 : bundle.tasks) != null ? _a : []).map((task) => {
    var _a2, _b2, _c2, _d2;
    return { id: task.id, title: task.title, status: task.status, goal: (_a2 = task.goal) != null ? _a2 : null, result: (_b2 = task.result) != null ? _b2 : null, blocker: (_c2 = task.blocker) != null ? _c2 : null, next: (_d2 = task.next) != null ? _d2 : null, sources: task.resume_sources, missing: task.resume_missing, operationRefs: task.resume_operation_refs };
  });
  const lines = [
    `Case\uFF1A${caseModel.source.path}`,
    `Case\u539F\u751F\u72B6\u6001\uFF1A${(_b = c.status) != null ? _b : "\u672A\u8BB0\u5F55"}`,
    `cwd\uFF1A${(_c = c.cwd) != null ? _c : "\u672A\u8BB0\u5F55"}`,
    `branch\uFF1A${(_d = c.branch) != null ? _d : "\u672A\u8BB0\u5F55"}`,
    ...caseModel.sections.goal.map((s) => `Case\u76EE\u6807\uFF1A
${s.text}`),
    ...caseModel.sections.decisions.map((s) => `Case\u51B3\u7B56\uFF1A
${s.text}
\u51B3\u7B56\u6765\u6E90\uFF1A${caseModel.source.path} \xB7 vault-file ${s.source.lineStart}\u2013${s.source.lineEnd}`),
    `Case\u5F53\u524D\uFF1A${(_e = caseModel.current.progressSummary) != null ? _e : "\u672A\u8BB0\u5F55"}`,
    `Case\u4E0B\u4E00\u6B65\uFF1A${(_f = caseModel.current.next) != null ? _f : "\u672A\u8BB0\u5F55"}`,
    `\u6062\u590D\u6765\u6E90\uFF1A${(_g = bundle == null ? void 0 : bundle.source) != null ? _g : "\u672A\u63D0\u4F9B"}`,
    ...tasks.flatMap((task) => {
      var _a2, _b2, _c2, _d2;
      return [
        `
Task\uFF1A${task.id} \xB7 \u539F\u751F\u72B6\u6001 ${task.status}`,
        `\u76EE\u6807\uFF1A${(_a2 = task.goal) != null ? _a2 : "\u672A\u63D0\u4F9B"}`,
        `\u7ED3\u679C\uFF1A${(_b2 = task.result) != null ? _b2 : "\u672A\u63D0\u4F9B"}`,
        `\u963B\u585E\uFF1A${(_c2 = task.blocker) != null ? _c2 : "\u672A\u63D0\u4F9B"}`,
        `\u4E0B\u4E00\u6B65\uFF1A${(_d2 = task.next) != null ? _d2 : "\u672A\u63D0\u4F9B"}`,
        `\u7F3A\u5931\u5B57\u6BB5\uFF1A${task.missing.join("\u3001") || "\u65E0"}`,
        ...task.sources.map((s) => `\u6765\u6E90 ${s.field}\uFF1A${s.task_id} / ${s.section} / API details ${s.line_start}\u2013${s.line_end}${s.timestamp ? ` / ${s.timestamp}` : ""} / \u5B57\u8282 ${s.included_bytes}/${s.original_bytes}${s.truncated ? "\uFF08\u622A\u65AD\u6216\u5019\u9009\u88AB\u62D2\uFF09" : ""}`),
        ...task.operationRefs.map((ref) => `\u64CD\u4F5C\u4EC5\u5F15\u7528\uFF1A${ref.operation_id} \xB7 API details \u7B2C${ref.line}\u884C\uFF1B\u4E0D\u8BC1\u660E\u5DF2\u5B8C\u6210`)
      ];
    }),
    `
\u5386\u53F2\u6307\u9488\uFF1Aagent=${(_h = history.agent) != null ? _h : "\u7F3A\u5931"} / nativeId=${(_i = history.nativeId) != null ? _i : "\u7F3A\u5931"} / device=${(_j = history.device) != null ? _j : "\u7F3A\u5931"}`,
    `\u8BFB\u53D6\u7F3A\u53E3\uFF1A
${gaps.join("\n") || "producer\u672A\u62A5\u544A\u7F3A\u53E3"}`,
    continuationInstructions
  ];
  return { summary: lines.join("\n"), gaps, tasks, history, continuationInstructions };
}

// src/work-case-model.ts
var WorkCaseSnapshotCompatibilityError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "WorkCaseSnapshotCompatibilityError";
  }
};
var SECTION_KEYS = [
  "goal",
  "decisions",
  "discoveries",
  "blockers",
  "outcome",
  "candidate_patterns",
  "definition_of_done"
];
function createWorkCaseViewModel(snapshot, expectedPath) {
  const root = record(snapshot, "snapshot");
  if (root.snapshot_schema_version !== 1) {
    throw new WorkCaseSnapshotCompatibilityError(
      "unsupported_snapshot_schema",
      `\u4E0D\u652F\u6301\u7684 Work Case snapshot schema\uFF1A${String(root.snapshot_schema_version)}`
    );
  }
  if (root.snapshot_model !== "work-case-centric") {
    throw new WorkCaseSnapshotCompatibilityError(
      "unsupported_snapshot_model",
      `\u4E0D\u652F\u6301\u7684 Work Case snapshot model\uFF1A${String(root.snapshot_model)}`
    );
  }
  const protocol = record(root.protocol, "protocol");
  if (protocol.producer_protocol_version !== 1) {
    throw new WorkCaseSnapshotCompatibilityError(
      "unsupported_producer_protocol",
      `\u4E0D\u652F\u6301\u7684 Work Case producer protocol\uFF1A${String(protocol.producer_protocol_version)}`
    );
  }
  const source = record(root.source, "source");
  const sourcePath = string(source.path, "source.path");
  if (source.identity_match !== true || sourcePath !== expectedPath) {
    throw new WorkCaseSnapshotCompatibilityError(
      "source_identity_mismatch",
      `Work Case \u6765\u6E90\u8EAB\u4EFD\u4E0D\u5339\u914D\uFF1A\u8BF7\u6C42 ${expectedPath}\uFF0C\u5B9E\u9645 ${sourcePath}`
    );
  }
  if (source.type !== "work-case" && source.type !== "session") {
    throw new WorkCaseSnapshotCompatibilityError(
      "unsupported_source_type",
      `\u4E0D\u652F\u6301\u7684 Work Case type\uFF1A${String(source.type || "(missing)")}`
    );
  }
  const workCase = record(root.work_case, "work_case");
  const current = record(root.current, "current");
  const tasks = record(root.tasks, "tasks");
  const coverage = record(tasks.coverage, "tasks.coverage");
  const counts = record(tasks.counts, "tasks.counts");
  const sections = record(root.sections, "sections");
  const related = record(root.related, "related");
  const observationHealth = string(
    tasks.observation_health,
    "tasks.observation_health"
  );
  if (!isObservationHealth(observationHealth)) {
    invalid(`tasks.observation_health \u65E0\u6548\uFF1A${observationHealth}`);
  }
  const complete = boolean(coverage.complete, "tasks.coverage.complete");
  const effectiveHealth = !complete && observationHealth === "healthy" ? "degraded" : observationHealth;
  const completeCounts = effectiveHealth === "healthy" && complete;
  for (const key of SECTION_KEYS) array(sections[key], `sections.${key}`);
  const model = {
    resumeBundle: null,
    source: {
      path: sourcePath,
      type: source.type,
      archived: boolean(source.archived, "source.archived")
    },
    workCase: {
      title: string(workCase.title, "work_case.title"),
      status: nullableString(workCase.status, "work_case.status"),
      date: nullableString(workCase.date, "work_case.date"),
      project: nullableString(workCase.project, "work_case.project"),
      agent: nullableString(workCase.agent, "work_case.agent"),
      workspace: nullableString(workCase.workspace, "work_case.workspace"),
      agentSessionId: nullableString(
        workCase.agent_session_id,
        "work_case.agent_session_id"
      ),
      device: nullableString(workCase.device, "work_case.device"),
      cwd: nullableString(workCase.cwd, "work_case.cwd"),
      branch: nullableString(workCase.branch, "work_case.branch"),
      summaryLastUpdated: nullableString(
        workCase.summary_last_updated,
        "work_case.summary_last_updated"
      )
    },
    current: {
      progressSummary: nullableString(current.progress_summary, "current.progress_summary"),
      next: nullableString(current.next, "current.next"),
      blockers: nullableString(current.blockers, "current.blockers"),
      pending: nullableString(current.pending, "current.pending"),
      raw: current.raw === null ? null : section(current.raw, "current.raw")
    },
    tasks: {
      observationHealth: effectiveHealth,
      contextTag: string(tasks.context_tag, "tasks.context_tag"),
      coverage: {
        complete: boolean(coverage.complete, "tasks.coverage.complete"),
        pages: number(coverage.pages, "tasks.coverage.pages")
      },
      counts: {
        total: completeCounts ? nullableNumber(counts.total, "tasks.counts.total") : null,
        active: completeCounts ? nullableNumber(counts.active, "tasks.counts.active") : null,
        blocked: completeCounts ? nullableNumber(counts.blocked, "tasks.counts.blocked") : null,
        completed: completeCounts ? nullableNumber(counts.completed, "tasks.counts.completed") : null,
        archived: completeCounts ? nullableNumber(counts.archived, "tasks.counts.archived") : null,
        byStatus: numberRecord(counts.by_status, "tasks.counts.by_status")
      },
      items: array(tasks.items, "tasks.items").map(
        (item, index) => taskItem(item, `tasks.items[${index}]`)
      ),
      legacyLinks: stringArray(tasks.legacy_links, "tasks.legacy_links")
    },
    recentProgress: array(root.recent_progress, "recent_progress").map(
      (item, index) => {
        const value = record(item, `recent_progress[${index}]`);
        return {
          text: string(value.text, `recent_progress[${index}].text`),
          timestamp: nullableString(
            value.timestamp,
            `recent_progress[${index}].timestamp`
          ),
          source: sourceRange(value.source, `recent_progress[${index}].source`)
        };
      }
    ),
    sections: {
      goal: sectionArray(sections.goal, "sections.goal"),
      decisions: sectionArray(sections.decisions, "sections.decisions"),
      discoveries: sectionArray(sections.discoveries, "sections.discoveries"),
      blockers: sectionArray(sections.blockers, "sections.blockers"),
      outcome: sectionArray(sections.outcome, "sections.outcome"),
      candidatePatterns: sectionArray(
        sections.candidate_patterns,
        "sections.candidate_patterns"
      ),
      definitionOfDone: sectionArray(
        sections.definition_of_done,
        "sections.definition_of_done"
      )
    },
    related: {
      project: nullableString(related.project, "related.project"),
      plans: stringArray(related.plans, "related.plans"),
      docs: stringArray(related.docs, "related.docs"),
      sessions: stringArray(related.sessions, "related.sessions"),
      related: stringArray(related.related, "related.related")
    },
    diagnostics: array(root.diagnostics, "diagnostics").map((item, index) => {
      const value = record(item, `diagnostics[${index}]`);
      return {
        code: string(value.code, `diagnostics[${index}].code`),
        severity: string(value.severity, `diagnostics[${index}].severity`),
        path: string(value.path, `diagnostics[${index}].path`),
        message: string(value.message, `diagnostics[${index}].message`)
      };
    })
  };
  try {
    model.resumeBundle = validateResumeBundle(root.resume_bundle, sourcePath, model.tasks.items);
  } catch (error) {
    invalid(error instanceof Error ? error.message : "resume_bundle \u65E0\u6548");
  }
  return model;
}
function taskItem(value, at) {
  const item = record(value, at);
  const associationSource = string(item.association_source, `${at}.association_source`);
  if (associationSource !== "canonical" && associationSource !== "legacy") {
    invalid(`${at}.association_source \u65E0\u6548`);
  }
  const completed = item.status_is_completed;
  if (completed !== null && typeof completed !== "boolean") {
    invalid(`${at}.status_is_completed \u5FC5\u987B\u4E3A boolean \u6216 null`);
  }
  return {
    id: string(item.id, `${at}.id`),
    title: string(item.title, `${at}.title`),
    status: string(item.status, `${at}.status`),
    statusIsCompleted: completed,
    archived: boolean(item.archived, `${at}.archived`),
    isBlocked: boolean(item.is_blocked, `${at}.is_blocked`),
    associationSource,
    relationRoles: relationRoles(item.relation_roles, `${at}.relation_roles`)
  };
}
function relationRoles(value, at) {
  if (value === void 0) return [];
  const roles = array(value, at).map(
    (item, index) => string(item, `${at}[${index}]`)
  );
  for (const role of roles) {
    if (role !== "parent" && role !== "child") {
      invalid(`${at} \u53EA\u5141\u8BB8 parent \u6216 child`);
    }
  }
  return ["parent", "child"].filter((role) => roles.includes(role));
}
function sectionArray(value, at) {
  return array(value, at).map((item, index) => section(item, `${at}[${index}]`));
}
function section(value, at) {
  const item = record(value, at);
  return {
    heading: string(item.heading, `${at}.heading`),
    level: number(item.level, `${at}.level`),
    text: string(item.text, `${at}.text`),
    source: sourceRange(item.source, `${at}.source`)
  };
}
function sourceRange(value, at) {
  const range = record(value, at);
  return {
    lineStart: number(range.line_start, `${at}.line_start`),
    lineEnd: number(range.line_end, `${at}.line_end`)
  };
}
function record(value, at) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${at} \u5FC5\u987B\u4E3A object`);
  }
  return value;
}
function array(value, at) {
  if (!Array.isArray(value)) invalid(`${at} \u5FC5\u987B\u4E3A array`);
  return value;
}
function string(value, at) {
  if (typeof value !== "string") invalid(`${at} \u5FC5\u987B\u4E3A string`);
  return value;
}
function nullableString(value, at) {
  if (value === null) return null;
  return string(value, at);
}
function boolean(value, at) {
  if (typeof value !== "boolean") invalid(`${at} \u5FC5\u987B\u4E3A boolean`);
  return value;
}
function number(value, at) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${at} \u5FC5\u987B\u4E3A number`);
  return value;
}
function nullableNumber(value, at) {
  if (value === null) return null;
  return number(value, at);
}
function stringArray(value, at) {
  return array(value, at).map((item, index) => string(item, `${at}[${index}]`));
}
function numberRecord(value, at) {
  const input = record(value, at);
  return Object.fromEntries(
    Object.entries(input).map(([key, item]) => [key, number(item, `${at}.${key}`)])
  );
}
function isObservationHealth(value) {
  return value === "healthy" || value === "degraded" || value === "unavailable";
}
function invalid(message) {
  throw new WorkCaseSnapshotCompatibilityError(
    "invalid_snapshot_envelope",
    `Work Case snapshot envelope \u65E0\u6548\uFF1A${message}`
  );
}

// src/work-case-adapter.ts
var WorkCaseAdapter = class {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.kind = "case";
    this.selection = null;
    this.displayState = null;
    this.error = "";
    this.loading = false;
    this.controller = null;
    this.requestGeneration = 0;
    this.dirtyReason = "";
    this.caseContent = null;
    this.refreshScheduler = new TrailingRefreshScheduler(() => {
      void this.refresh();
    }, 500);
  }
  async activate(selection) {
    var _a, _b, _c, _d, _e, _f;
    if (selection.adapterKind !== this.kind) {
      throw new Error(`Work Case Adapter \u65E0\u6CD5\u5904\u7406\uFF1A${selection.adapterKind}`);
    }
    this.refreshScheduler.cancel();
    const generation = ++this.requestGeneration;
    const sameCase = ((_a = this.selection) == null ? void 0 : _a.resourcePath) === selection.resourcePath;
    this.selection = selection;
    if (!sameCase) {
      this.caseContent = null;
      this.displayState = null;
      this.error = "";
      this.dirtyReason = "";
    }
    (_b = this.controller) == null ? void 0 : _b.abort();
    const controller = new AbortController();
    this.controller = controller;
    const isCurrent = () => this.requestGeneration === generation && this.controller === controller && this.selection === selection && this.dependencies.shell().isCurrent(selection);
    this.loading = true;
    this.error = "";
    this.dependencies.requestRender();
    try {
      const [snapshotResult, contentResult] = await Promise.allSettled([
        this.dependencies.loadSnapshot(selection.resourcePath, controller.signal),
        (_e = (_d = (_c = this.dependencies).loadCaseContent) == null ? void 0 : _d.call(_c, selection.resourcePath, controller.signal)) != null ? _e : Promise.resolve(null)
      ]);
      if (!isCurrent()) return;
      this.caseContent = contentResult.status === "fulfilled" ? contentResult.value : { casePath: selection.resourcePath, details: "", readAt: "", source: "vault-cached-read", error: contentResult.reason instanceof Error ? contentResult.reason.message : String(contentResult.reason), sections: [] };
      if (this.caseContent && this.caseContent.casePath !== selection.resourcePath) this.caseContent = { casePath: selection.resourcePath, details: "", readAt: "", source: "vault-cached-read", error: "Case\u72EC\u7ACB\u8BFB\u53D6\u6765\u6E90\u8EAB\u4EFD\u9519\u8BEF", sections: [] };
      if (snapshotResult.status === "rejected") throw snapshotResult.reason;
      const snapshot = snapshotResult.value;
      const model = createWorkCaseViewModel(snapshot, selection.resourcePath);
      this.dirtyReason = "";
      this.displayState = {
        casePath: selection.resourcePath,
        model,
        loadedAt: this.dependencies.nowLabel(),
        staleReason: ""
      };
    } catch (error) {
      if (!isCurrent()) return;
      this.error = formatWorkCaseError(error);
      if (error instanceof WorkCaseSnapshotCompatibilityError) {
        this.displayState = null;
      } else if (sameCase && ((_f = this.displayState) == null ? void 0 : _f.casePath) === selection.resourcePath) {
        this.displayState = {
          ...this.displayState,
          staleReason: this.error
        };
      } else {
        this.displayState = null;
      }
    } finally {
      if (isCurrent()) {
        this.controller = null;
        this.loading = false;
        this.dependencies.requestRender();
      }
    }
  }
  deactivate() {
    var _a;
    ++this.requestGeneration;
    this.refreshScheduler.cancel();
    (_a = this.controller) == null ? void 0 : _a.abort();
    this.controller = null;
    this.selection = null;
    this.displayState = null;
    this.error = "";
    this.loading = false;
    this.dirtyReason = "";
    this.caseContent = null;
  }
  shouldReactivate(selection) {
    var _a;
    const state = this.getRenderState();
    return ((_a = this.selection) == null ? void 0 : _a.revision) === selection.revision && state !== null && state.model === null && !state.loading;
  }
  async refresh() {
    if (this.selection) await this.activate(this.selection);
  }
  scheduleRefresh() {
    var _a;
    if (!this.selection) return;
    ++this.requestGeneration;
    (_a = this.controller) == null ? void 0 : _a.abort();
    this.controller = null;
    this.loading = this.displayState === null;
    this.dirtyReason = "\u5173\u8054\u8D44\u6599\u53D1\u751F\u53D8\u5316\uFF0C\u7B49\u5F85\u5237\u65B0\u3002";
    if (this.displayState) this.displayState = { ...this.displayState, staleReason: this.dirtyReason };
    this.dependencies.requestRender();
    this.refreshScheduler.schedule();
  }
  observesFile(filePath) {
    var _a;
    if (!this.selection) return false;
    return this.selection.resourcePath === filePath || isTaskPath(filePath) || Boolean((_a = this.displayState) == null ? void 0 : _a.model.tasks.items.some((task) => task.id === filePath));
  }
  render(container) {
    const state = this.getRenderState();
    if (state) this.dependencies.render(container, state);
  }
  getRenderState() {
    var _a, _b, _c, _d;
    const casePath = (_a = this.selection) == null ? void 0 : _a.resourcePath;
    if (!casePath) return null;
    const display = ((_b = this.displayState) == null ? void 0 : _b.casePath) === casePath ? this.displayState : null;
    return {
      casePath,
      caseContent: this.caseContent,
      model: (_c = display == null ? void 0 : display.model) != null ? _c : null,
      loadedAt: (_d = display == null ? void 0 : display.loadedAt) != null ? _d : "",
      staleReason: (display == null ? void 0 : display.staleReason) || this.dirtyReason,
      error: this.error,
      loading: this.loading
    };
  }
};
function formatWorkCaseError(error) {
  if (error instanceof WorkCaseSnapshotCompatibilityError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  return `Work Case snapshot \u8BFB\u53D6\u5931\u8D25\uFF1A${message}`;
}

// src/work-case-invocation.ts
var path2 = __toESM(require("path"));
function buildWorkCaseSnapshotInvocation(input) {
  const flowdeskRoot = path2.resolve(input.flowdeskRoot);
  const workingDirectory = path2.resolve(input.workingDirectory);
  const args = [input.casePath];
  if (input.apiUrl) args.push("--api-url", input.apiUrl);
  args.push("--working-directory", workingDirectory, "--format", "json");
  if (input.includeResumeBundle) args.push("--resume-bundle");
  return {
    executable: path2.join(flowdeskRoot, "bin", "flowdesk-work-case-snapshot"),
    args,
    cwd: flowdeskRoot
  };
}

// src/work-case-presentation.ts
function createWorkCasePresentation(model) {
  var _a, _b, _c;
  const total = model.tasks.counts.total;
  const completed = model.tasks.counts.completed;
  const grouped = groupTaskRows(model.tasks.items.map((item) => ({ ...item, completed: item.statusIsCompleted })));
  const primary = grouped.current.map(taskPresentation);
  const history = grouped.history.map(taskPresentation);
  const active = model.tasks.counts.active;
  const caseStatus = ((_a = model.workCase.status) != null ? _a : "").trim();
  const driftWarning = active !== null && active > 0 && isClosedCaseStatus(caseStatus) ? `Case \u72B6\u6001\u4E3A ${caseStatus}\uFF0C\u4F46\u4ECD\u6709 ${active} \u4E2A active Task\uFF1B\u4E24\u8005\u5747\u6309\u539F\u59CB\u4E8B\u5B9E\u663E\u793A\u3002` : "";
  const currentSource = (_c = (_b = model.current.raw) == null ? void 0 : _b.source) != null ? _c : null;
  const timestamp = formatWorkCaseTimestamp(
    model.workCase.summaryLastUpdated || model.workCase.date || "\u65F6\u95F4\u672A\u8BB0\u5F55"
  );
  return {
    header: {
      typeLabel: "WORK CASE",
      title: model.workCase.title,
      status: formatEntityStatus("case", model.workCase.status).label,
      project: model.workCase.project || "\u672A\u5173\u8054 Project",
      dateLabel: timestamp.label,
      dateTooltip: timestamp.tooltip,
      badges: [
        ...model.source.type === "session" ? ["legacy"] : [],
        ...model.source.archived ? ["\u5DF2\u5F52\u6863"] : []
      ],
      recoveryContext: [
        ["Agent", model.workCase.agent],
        ["Workspace", model.workCase.workspace],
        ["Session", model.workCase.agentSessionId],
        ["Device", model.workCase.device],
        ["CWD", model.workCase.cwd],
        ["Branch", model.workCase.branch]
      ].filter((entry) => Boolean(entry[1])).map(([label, value]) => ({ label, value }))
    },
    current: [
      { key: "progressSummary", label: "\u505A\u5230\u54EA\u4E86", value: model.current.progressSummary || "\u672A\u8BB0\u5F55", source: currentSource },
      { key: "next", label: "\u4E0B\u4E00\u6B65", value: model.current.next || "\u672A\u8BB0\u5F55", source: currentSource },
      { key: "blockers", label: "\u5F53\u524D\u98CE\u9669/\u963B\u585E", value: model.current.blockers || "\u672A\u8BB0\u5F55", source: currentSource },
      { key: "pending", label: "\u672A\u63D0\u4EA4/\u5F85\u5904\u7406", value: model.current.pending || "\u672A\u8BB0\u5F55", source: currentSource }
    ],
    tasks: {
      health: model.tasks.observationHealth,
      completedLabel: completed === null || total === null ? "\u2014 / \u2014" : `${completed} / ${total}`,
      progressPercent: completed === null || total === null ? null : total === 0 ? 0 : Math.round(completed / total * 100),
      counts: [
        ["active", active],
        ["blocked", model.tasks.counts.blocked],
        ["archived", model.tasks.counts.archived]
      ].map(([label, value]) => ({
        label: String(label),
        value: typeof value === "number" ? String(value) : "\u2014"
      })),
      byStatus: Object.entries(model.tasks.counts.byStatus).map(([status, count]) => ({
        status,
        count
      })),
      primary,
      history,
      driftWarning
    },
    recentProgress: [...model.recentProgress].reverse().map((item) => ({ ...item, text: progressDisplayText(item.text, item.timestamp) })),
    sections: [
      { key: "goal", label: "Goal", items: model.sections.goal },
      { key: "decisions", label: "Decisions", items: model.sections.decisions },
      { key: "discoveries", label: "Discoveries", items: model.sections.discoveries },
      { key: "blockers", label: "Blockers", items: model.sections.blockers },
      { key: "outcome", label: "Outcome", items: model.sections.outcome },
      { key: "candidatePatterns", label: "Candidate Patterns", items: model.sections.candidatePatterns },
      { key: "definitionOfDone", label: "Definition of Done", items: model.sections.definitionOfDone }
    ],
    related: [
      { label: "Project", targets: model.related.project ? [model.related.project] : [] },
      { label: "Plans", targets: model.related.plans },
      { label: "Docs", targets: model.related.docs },
      { label: "Sessions", targets: model.related.sessions },
      { label: "Related", targets: model.related.related }
    ].filter((group) => group.targets.length > 0),
    diagnostics: model.diagnostics
  };
}
function progressDisplayText(text2, timestamp) {
  if (!timestamp || !text2.startsWith(timestamp)) return text2;
  const remainder = text2.slice(timestamp.length).replace(/^\s*(?:[：:·—–-]\s*)?/, "").trim();
  return remainder || text2;
}
function formatWorkCaseTimestamp(value) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/
  );
  if (!match) return { label: value, tooltip: value };
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  const valid = calendarCheck.getUTCFullYear() === year && calendarCheck.getUTCMonth() === month - 1 && calendarCheck.getUTCDate() === day && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
  if (!valid) return { label: value, tooltip: value };
  return {
    label: `${year}\u5E74${month}\u6708${day}\u65E5 ${hourText}:${minuteText}`,
    tooltip: value
  };
}
function taskPresentation(item) {
  return {
    ...item,
    tone: item.archived ? "archived" : item.statusIsCompleted === true ? "completed" : item.isBlocked ? "blocked" : item.statusIsCompleted === false ? "active" : "unknown"
  };
}
function isClosedCaseStatus(status) {
  return ["done", "complete", "completed", "closed"].includes(status.toLowerCase());
}

// src/work-case-renderer.ts
var WorkCaseDashboardRenderer = class {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  reset(container) {
    container.removeClass("flowdesk-case-dashboard");
  }
  render(container, state) {
    container.addClass("flowdesk-case-dashboard");
    if (!state.model) {
      this.renderShell(container, state);
      this.renderFullCaseContent(container, state);
      return;
    }
    const presentation = createWorkCasePresentation(state.model);
    this.renderHeader(container, state, presentation);
    container.createDiv({
      cls: `flowdesk-case-observation is-${state.staleReason ? "degraded" : presentation.tasks.health}`,
      text: `\u6765\u6E90\uFF1AWork Case schema 1 \xB7 ${state.loading ? "\u6B63\u5728\u5237\u65B0 \xB7 \u4E0A\u6B21\u8BFB\u53D6" : "\u8BFB\u53D6\u4E8E"} ${state.loadedAt} \xB7 ${state.staleReason ? "\u6765\u6E90\u5DF2\u8FC7\u671F\uFF0C\u7B49\u5F85\u5237\u65B0" : presentation.tasks.health === "healthy" ? "\u6765\u6E90\u8BFB\u53D6\u5B8C\u6574" : "\u5173\u8054\u4EFB\u52A1\u8BFB\u53D6\u4E0D\u5B8C\u6574"}`,
      attr: { title: state.casePath }
    });
    if (state.error || state.staleReason) {
      container.createDiv({
        cls: "flowdesk-case-stale-warning",
        text: state.staleReason || state.error
      });
    }
    this.renderCurrent(container, state, presentation);
    this.renderTasks(container, presentation);
    this.renderProgress(container, state, presentation);
    this.renderSections(container, state, presentation);
    this.renderRelated(container, state, presentation);
    this.renderFullCaseContent(container, state);
    this.renderResume(container, state);
    this.renderTechnicalContext(container, presentation);
    this.renderDiagnostics(container, presentation);
  }
  renderShell(container, state) {
    const header = container.createDiv({ cls: "flowdesk-case-header" });
    header.createDiv({ cls: "flowdesk-case-kicker", text: "WORK CASE" });
    header.createDiv({ cls: "flowdesk-case-title", text: caseTitle(state.casePath) });
    const refresh = header.createEl("button", {
      cls: "flowdesk-case-refresh",
      text: state.loading ? "\u8BFB\u53D6\u4E2D" : "\u5237\u65B0",
      attr: { "aria-label": state.loading ? "Work Case \u8BFB\u53D6\u4E2D" : "\u5237\u65B0 Work Case" }
    });
    refresh.disabled = state.loading;
    refresh.addEventListener("click", () => void this.dependencies.refresh());
    container.createDiv({
      cls: state.error ? "flowdesk-case-error" : "flowdesk-case-empty",
      text: state.error || (state.loading ? "\u6B63\u5728\u8BFB\u53D6 Work Case snapshot..." : "\u5C1A\u672A\u8BFB\u53D6 Work Case snapshot\u3002")
    });
  }
  renderHeader(container, state, presentation) {
    var _a;
    const header = container.createDiv({ cls: "flowdesk-case-header" });
    const top = header.createDiv({ cls: "flowdesk-case-header-top" });
    top.createDiv({ cls: "flowdesk-case-kicker", text: presentation.header.typeLabel || "WORK CASE" });
    const refresh = top.createEl("button", {
      cls: "flowdesk-case-refresh",
      text: state.loading ? "\u8BFB\u53D6\u4E2D" : "\u5237\u65B0",
      attr: { "aria-label": state.loading ? "Work Case \u8BFB\u53D6\u4E2D" : "\u5237\u65B0 Work Case" }
    });
    refresh.disabled = state.loading;
    refresh.addEventListener("click", () => void this.dependencies.refresh());
    header.createDiv({ cls: "flowdesk-case-title", text: presentation.header.title });
    const metadata = header.createDiv({ cls: "flowdesk-case-metadata" });
    metadata.createSpan({ cls: "flowdesk-case-status", text: presentation.header.status, attr: { title: ((_a = state.model) == null ? void 0 : _a.workCase.status) || "\u672A\u8BB0\u5F55" } });
    if (presentation.header.project !== "\u672A\u5173\u8054 Project") {
      const project = metadata.createEl("button", {
        cls: "flowdesk-case-related-link",
        text: formatReferenceLabel(presentation.header.project),
        attr: { title: presentation.header.project }
      });
      project.addEventListener(
        "click",
        () => void this.dependencies.openRelated(presentation.header.project, state.casePath)
      );
    } else {
      metadata.createSpan({ cls: "flowdesk-case-muted", text: presentation.header.project });
    }
    metadata.createSpan({
      cls: "flowdesk-case-date",
      text: presentation.header.dateLabel,
      attr: { title: presentation.header.dateTooltip }
    });
    for (const badge of presentation.header.badges) {
      metadata.createSpan({ cls: "flowdesk-case-badge", text: badge });
    }
  }
  renderTechnicalContext(container, presentation) {
    if (!presentation.header.recoveryContext.length) return;
    const details = container.createEl("details", { cls: "flowdesk-case-recovery" });
    details.createEl("summary", { text: "\u6280\u672F\u8BE6\u60C5" });
    for (const item of presentation.header.recoveryContext) {
      const row = details.createDiv({ cls: "flowdesk-case-recovery-row" });
      row.createSpan({ cls: "flowdesk-case-label", text: item.label });
      row.createSpan({ cls: "flowdesk-case-long-value", text: item.value });
    }
  }
  renderCurrent(container, state, presentation) {
    const section2 = createSection(container, "\u5F53\u524D\u8FDB\u5C55", "flowdesk-case-current");
    const grid = section2.createDiv({ cls: "flowdesk-case-short-grid" });
    for (const item of presentation.current) {
      const card = grid.createEl("button", {
        cls: `flowdesk-case-current-card is-${item.key}`,
        attr: { "aria-label": `\u6253\u5F00 Current\uFF1A${item.label}` }
      });
      card.createDiv({ cls: "flowdesk-case-label", text: item.label });
      card.createDiv({ cls: "flowdesk-case-current-value", text: item.value });
      if (item.source) {
        card.addEventListener(
          "click",
          () => void this.dependencies.openCaseSource(state.casePath, item.source)
        );
      } else {
        card.disabled = true;
      }
    }
  }
  renderTasks(container, presentation) {
    const section2 = createSection(container, "\u5173\u8054\u4EFB\u52A1", "flowdesk-case-tasks");
    section2.createDiv({ cls: "flowdesk-case-task-summary", text: presentation.tasks.health === "healthy" ? `\u751F\u547D\u5468\u671F\u5DF2\u5B8C\u6210 / \u5173\u8054\u4EFB\u52A1\uFF1A${presentation.tasks.completedLabel}` : "\u5173\u8054\u4EFB\u52A1\u5C1A\u672A\u5B8C\u6574\u8BFB\u53D6\uFF1B\u4EE5\u4E0B\u4EC5\u5C55\u793A\u5DF2\u89C2\u5BDF\u6761\u76EE\u3002" });
    if (presentation.tasks.driftWarning) {
      section2.createDiv({ cls: "flowdesk-case-drift", text: presentation.tasks.driftWarning });
    }
    if (!presentation.tasks.primary.length && !presentation.tasks.history.length) {
      section2.createDiv({
        cls: "flowdesk-case-empty",
        text: presentation.tasks.health === "healthy" ? "\u6CA1\u6709\u5173\u8054\u4EFB\u52A1\u3002" : "\u4EFB\u52A1\u6570\u636E\u6682\u4E0D\u53EF\u7528\uFF0CCase \u4E3B\u4F53\u4ECD\u53EF\u9605\u8BFB\u3002"
      });
      return;
    }
    if (presentation.tasks.primary.length) {
      const list = section2.createDiv({ cls: "flowdesk-case-task-list" });
      for (const task of presentation.tasks.primary) this.renderTask(list, task);
    }
    if (presentation.tasks.history.length) {
      const history = section2.createEl("details", { cls: "flowdesk-case-task-history" });
      history.createEl("summary", { text: `\u5DF2\u5B8C\u6210 / \u5DF2\u5F52\u6863 \xB7 ${presentation.tasks.history.length}` });
      const list = history.createDiv({ cls: "flowdesk-case-task-list" });
      for (const task of presentation.tasks.history) this.renderTask(list, task);
    }
    const counts = section2.createEl("details", { cls: "flowdesk-case-task-counts" });
    counts.createEl("summary", { text: "\u72B6\u6001\u7EDF\u8BA1" });
    const grid = counts.createDiv({ cls: "flowdesk-case-count-grid" });
    for (const count of presentation.tasks.counts) {
      const item = grid.createDiv({ cls: "flowdesk-case-count" });
      item.createDiv({ cls: "flowdesk-case-count-value", text: count.value });
      item.createDiv({ cls: "flowdesk-case-label", text: count.label });
    }
    if (presentation.tasks.byStatus.length) {
      const statuses = counts.createDiv({ cls: "flowdesk-case-status-list" });
      for (const item of presentation.tasks.byStatus) statuses.createSpan({ cls: "flowdesk-case-status-chip", text: `${formatEntityStatus("task", item.status).label} ${item.count}`, attr: { title: item.status } });
    }
  }
  renderTask(container, task) {
    const accessibleRelations = task.relationRoles.map((role) => role === "parent" ? "\u7236\u4EFB\u52A1" : "\u5B50\u4EFB\u52A1").join("\u3001");
    const row = container.createEl("button", {
      cls: `flowdesk-case-task-row is-${task.tone}`,
      attr: {
        "aria-label": `\u6253\u5F00\u4EFB\u52A1\uFF1A${task.title}${accessibleRelations ? `\uFF1B\u5173\u7CFB\uFF1A${accessibleRelations}` : ""}`
      }
    });
    const content = row.createDiv({ cls: "flowdesk-case-task-content" });
    const title = content.createDiv({ cls: "flowdesk-case-task-title" });
    if (task.relationRoles.length) {
      const roles = title.createSpan({ cls: "flowdesk-case-task-roles" });
      for (const role of task.relationRoles) {
        roles.createSpan({
          cls: `flowdesk-case-task-role is-${role}`,
          text: role === "parent" ? "\u7236" : "\u5B50",
          attr: {
            "aria-label": role === "parent" ? "\u7236\u4EFB\u52A1" : "\u5B50\u4EFB\u52A1"
          }
        });
      }
    }
    title.createSpan({ cls: "flowdesk-case-task-title-text", text: task.title });
    content.createDiv({
      cls: "flowdesk-case-task-meta",
      text: `${task.associationSource}${task.archived ? " \xB7 archived" : ""}`
    });
    row.createSpan({ cls: "flowdesk-case-task-status", text: formatEntityStatus("task", task.status).label, attr: { title: task.status } });
    row.addEventListener(
      "click",
      () => void this.dependencies.openTask(task.id, "work-case")
    );
  }
  renderProgress(container, state, presentation) {
    const section2 = createSection(container, "\u6700\u8FD1 Progress", "flowdesk-case-recent-progress");
    if (!presentation.recentProgress.length) {
      section2.createDiv({ cls: "flowdesk-case-empty", text: "\u672A\u8BB0\u5F55\u7ED3\u6784\u5316 Progress\u3002" });
      return;
    }
    const list = section2.createDiv({ cls: "flowdesk-case-progress-list" });
    for (const [index, item] of presentation.recentProgress.entries()) {
      const row = list.createEl("button", {
        cls: `flowdesk-case-progress-item${index === 0 ? " is-latest" : ""}`,
        attr: { "aria-label": `${index === 0 ? "\u6700\u65B0\u8FDB\u5C55" : "\u5386\u53F2\u8FDB\u5C55"}\uFF1A${item.text}` }
      });
      const meta = row.createSpan({ cls: "flowdesk-case-progress-meta" });
      if (item.timestamp) meta.createSpan({ cls: "flowdesk-case-progress-time", text: item.timestamp });
      if (index === 0) meta.createSpan({ cls: "flowdesk-case-progress-latest", text: "\u6700\u65B0" });
      row.createSpan({ cls: "flowdesk-case-progress-text", text: item.text });
      row.addEventListener(
        "click",
        () => void this.dependencies.openCaseSource(state.casePath, item.source)
      );
    }
  }
  renderSections(container, state, presentation) {
    const section2 = createSection(container, "\u6848\u5377\u5185\u5BB9", "flowdesk-case-record");
    const primaryKeys = ["goal", "blockers", "outcome"];
    const secondaryKeys = ["decisions", "discoveries"];
    const moreKeys = ["candidatePatterns", "definitionOfDone"];
    const byKey = new Map(presentation.sections.map((group) => [group.key, group]));
    const selectVisible = (keys) => keys.map((key) => byKey.get(key)).filter(
      (group) => Boolean(group && group.items.length)
    );
    const primary = selectVisible(primaryKeys);
    const secondary = selectVisible(secondaryKeys);
    const moreGroups = selectVisible(moreKeys);
    if (!primary.length && !secondary.length && !moreGroups.length) {
      section2.createDiv({ cls: "flowdesk-case-empty", text: "\u6682\u65E0\u6848\u5377\u5185\u5BB9\u3002" });
      return;
    }
    const grid = section2.createDiv({ cls: "flowdesk-case-section-grid" });
    for (const group of primary) {
      this.renderRecordGroup(grid, state, group, true, true);
    }
    for (const group of secondary) {
      this.renderRecordGroup(grid, state, group, false, false);
    }
    if (moreGroups.length) {
      const more = grid.createEl("details", { cls: "flowdesk-case-record-more" });
      const itemCount = moreGroups.reduce((total, group) => total + group.items.length, 0);
      more.createEl("summary", { text: `\u66F4\u591A\u6848\u5377\u5185\u5BB9 \xB7 ${itemCount}` });
      const moreGrid = more.createDiv({ cls: "flowdesk-case-record-more-grid" });
      for (const group of moreGroups) {
        this.renderRecordGroup(moreGrid, state, group, false, false);
      }
    }
  }
  renderRecordGroup(container, state, group, open, primary) {
    const details = container.createEl("details", {
      cls: `flowdesk-case-record-group is-${group.key}${primary ? " is-primary" : ""}`
    });
    details.open = open;
    details.createEl("summary", { text: `${group.label} \xB7 ${group.items.length}` });
    for (const item of group.items) {
      const entry = details.createEl("button", { cls: "flowdesk-case-record-entry" });
      entry.createDiv({ cls: "flowdesk-case-record-heading", text: item.heading });
      entry.createDiv({ cls: "flowdesk-case-record-text", text: item.text });
      entry.addEventListener(
        "click",
        () => void this.dependencies.openCaseSource(state.casePath, item.source)
      );
    }
  }
  renderRelated(container, state, presentation) {
    if (!presentation.related.length) return;
    const section2 = createSection(container, "\u5173\u8054\u5BFC\u822A", "flowdesk-case-related");
    for (const group of presentation.related) {
      const row = section2.createDiv({ cls: "flowdesk-case-related-row" });
      row.createSpan({ cls: "flowdesk-case-label", text: group.label });
      const links = row.createDiv({ cls: "flowdesk-case-related-links" });
      for (const target of group.targets) {
        const link = links.createEl("button", {
          cls: "flowdesk-case-related-link",
          text: formatReferenceLabel(target),
          attr: { title: target }
        });
        link.addEventListener(
          "click",
          () => void this.dependencies.openRelated(target, state.casePath)
        );
      }
    }
  }
  renderFullCaseContent(container, state) {
    if (!state.caseContent) return;
    const observation = state.caseContent;
    const section2 = container.createEl("details", { cls: "flowdesk-case-recovery flowdesk-case-full-content" });
    section2.createEl("summary", { text: "\u5B8C\u6574Case\u539F\u6587\uFF08\u5355\u72ECvault\u8BFB\u53D6\uFF09" });
    if (observation.error) {
      section2.createDiv({ cls: "flowdesk-case-error", text: `Case\u539F\u6587\u8BFB\u53D6\u5931\u8D25\uFF1A${observation.error}` });
      return;
    }
    section2.createDiv({ cls: "flowdesk-muted", text: `${observation.source} \xB7 ${observation.casePath} \xB7 \u72EC\u7ACB\u8BFB\u53D6\u65F6\u95F4 ${observation.readAt}\uFF1B\u4E0D\u80FD\u8BC1\u660E\u4E0Esnapshot\u540C\u8F6E\u4E00\u81F4\u3002` });
    const body = section2.createDiv({ cls: "flowdesk-contract-scope-markdown markdown-rendered" });
    if (this.dependencies.renderMarkdown) void this.dependencies.renderMarkdown(observation.details, body, observation.casePath).catch(() => body.setText(observation.details));
    else body.setText(observation.details);
  }
  renderResume(container, state) {
    if (!state.model) return;
    const presentation = createResumePresentation(state.model.resumeBundle, state.model);
    const section2 = container.createEl("details", { cls: "flowdesk-case-recovery flowdesk-case-resume" });
    section2.createEl("summary", { text: "\u6062\u590D\u6458\u8981\u4E0E\u7EE7\u7EED\u5DE5\u4F5C\u6B65\u9AA4" });
    section2.createDiv({ cls: "flowdesk-muted", text: `\u672C\u5730snapshot\u8BFB\u53D6\u65F6\u95F4\uFF1A${state.loadedAt}\uFF1B\u6765\u6E90\u65F6\u95F4\u4EC5\u4FDD\u7559producer\u5DF2\u6709timestamp\u3002\u6062\u590D\u6458\u8981\u4E0D\u66FF\u4EE3\u5B8C\u6574Case/Task\u539F\u6587\u3002` });
    const independent = state.caseContent;
    const caseLines = (independent == null ? void 0 : independent.error) ? [`Case\u72EC\u7ACB\u539F\u6587\u8BFB\u53D6\u5931\u8D25\uFF1A${independent.error}`] : independent ? [`Case\u72EC\u7ACB\u539F\u6587\u8BFB\u53D6\u65F6\u95F4\uFF1A${independent.readAt}`, ...independent.sections.map((s) => `${s.heading}\uFF08vault-file ${s.source.lineStart}\u2013${s.source.lineEnd}\uFF09\uFF1A
${s.text}`)] : ["Case\u72EC\u7ACB\u539F\u6587\u672A\u8BFB\u53D6\uFF1BContext/Summary\u9700\u67E5\u770B\u6574\u5F20Case\u3002"];
    const summary = [presentation.summary, `\u672C\u5730snapshot\u8BFB\u53D6\u65F6\u95F4\uFF1A${state.loadedAt}`, state.staleReason ? `\u65E7\u89C2\u6D4B\uFF1A${state.staleReason}` : "", ...caseLines].filter(Boolean).join("\n\n");
    section2.createDiv({ cls: "flowdesk-case-record-text", text: summary });
    for (const task of presentation.tasks) {
      const sources = section2.createEl("details", { cls: "flowdesk-case-recovery" });
      sources.createEl("summary", { text: `Task\u6765\u6E90\u4E0E\u5B8C\u6574\u539F\u6587\uFF1A${task.title} \xB7 ${task.status}` });
      const full = sources.createEl("button", { text: "\u6253\u5F00\u5B8C\u6574Task\u539F\u6587" });
      full.addEventListener("click", () => {
        void this.dependencies.openTask(task.id, "child");
      });
      for (const source of task.sources) {
        const button = sources.createEl("button", { text: `\u67E5\u770B\u6765\u6E90\u4EFB\u52A1\uFF1A${source.field} \xB7 API details ${source.line_start}\u2013${source.line_end}` });
        button.addEventListener("click", () => {
          var _a, _b;
          void ((_b = (_a = this.dependencies).openTaskSource) == null ? void 0 : _b.call(_a, task.id, { ...source }));
        });
      }
    }
    const copy = section2.createEl("button", { cls: "flowdesk-case-copy-resume", text: "\u590D\u5236\u6062\u590D\u6458\u8981" });
    copy.addEventListener("click", () => {
      var _a, _b;
      void ((_b = (_a = this.dependencies).copyText) == null ? void 0 : _b.call(_a, summary));
    });
    const instructions = section2.createEl("button", { text: "\u590D\u5236\u7EE7\u7EED\u5DE5\u4F5C\u6B65\u9AA4" });
    instructions.addEventListener("click", () => {
      var _a, _b;
      void ((_b = (_a = this.dependencies).copyText) == null ? void 0 : _b.call(_a, `\u7EE7\u7EED\u5DE5\u4F5C\u4E0A\u4E0B\u6587\uFF08\u53EA\u8BFB\uFF0C\u4E0D\u81EA\u52A8\u6267\u884C\u4EFB\u4F55Task\uFF09
${summary}

\u660E\u786E\u9009\u62E9\u8981\u7EE7\u7EED\u7684\u51C6\u786ETask ID\uFF1B\u5DF2\u5B8C\u6210\u9879\u4FDD\u7559\u7ED3\u679C\uFF0C\u4E0D\u91CD\u65B0\u6267\u884C\u3002`));
    });
    const history = section2.createEl("button", { text: "\u590D\u5236\u539F\u4F1A\u8BDD\u6807\u8BC6\u4E0E\u67E5\u770B\u6B65\u9AA4" });
    history.addEventListener("click", () => {
      var _a, _b;
      void ((_b = (_a = this.dependencies).copyText) == null ? void 0 : _b.call(_a, `\u539F\u751F\u5386\u53F2\u6307\u9488\uFF1A${JSON.stringify(presentation.history)}
\u5386\u53F2\u6307\u9488\u4E0D\u662F\u6267\u884C\u63A5\u624B\u6388\u6743\u3002\u5F53\u524D\u6CA1\u6709\u5DF2\u9A8C\u8BC1\u7684\u516C\u5F00\u81EA\u52A8\u5386\u53F2\u5165\u53E3\uFF1B\u56DE\u539F\u5BBF\u4E3B\u6309\u51C6\u786E\u6807\u8BC6\u67E5\u770B\u3002`));
    });
  }
  renderDiagnostics(container, presentation) {
    if (!presentation.diagnostics.length) return;
    const details = container.createEl("details", { cls: "flowdesk-case-diagnostics" });
    details.createEl("summary", { text: `\u89E3\u6790\u4E0E\u89C2\u5BDF\u8BCA\u65AD \xB7 ${presentation.diagnostics.length}` });
    for (const diagnostic of presentation.diagnostics) {
      const row = details.createDiv({ cls: `flowdesk-case-diagnostic is-${diagnostic.severity}` });
      row.createDiv({ cls: "flowdesk-case-diagnostic-code", text: diagnostic.code });
      row.createDiv({ cls: "flowdesk-case-diagnostic-message", text: diagnostic.message });
      row.createDiv({ cls: "flowdesk-case-diagnostic-path", text: diagnostic.path });
    }
  }
};
function createSection(container, title, className) {
  const section2 = container.createDiv({ cls: `flowdesk-case-section ${className}` });
  section2.createDiv({ cls: "flowdesk-case-section-title", text: title });
  return section2;
}
function caseTitle(casePath) {
  const name = casePath.split("/").pop() || casePath;
  return name.replace(/\.md$/i, "");
}

// src/source-navigation.ts
var path3 = __toESM(require("path"));
var import_fs = require("fs");
var import_url = require("url");
function locateTaskSource(fileText, details, section2) {
  var _a;
  const note = (reason) => ({ kind: "note", reason });
  const normalize2 = (text3) => text3.replace(/\r\n/g, "\n").replace(/^\ufeff/, "");
  const body = normalize2(details), file = normalize2(fileText);
  if (!body) return note("API\u539F\u6587\u4E3A\u7A7A\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002");
  const start = file.indexOf(body);
  if (start < 0 || file.indexOf(body, start + 1) >= 0 || start > 0 && file[start - 1] !== "\n") return note("API\u539F\u6587\u4E0E\u5F53\u524D\u6587\u4EF6\u4E0D\u540C\u6B65\u6216\u5339\u914D\u4E0D\u552F\u4E00\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002");
  const range = section2.source, startLine = range == null ? void 0 : range.line_start, endLine = (_a = range == null ? void 0 : range.line_end) != null ? _a : startLine;
  const lines = body.split("\n");
  if (typeof startLine !== "number" || typeof endLine !== "number" || !Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) return note("\u6765\u6E90\u7F3A\u5C11\u6709\u6548API\u884C\u8303\u56F4\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002");
  const span = lines.slice(startLine - 1, endLine).join("\n");
  const excerpt = typeof (range == null ? void 0 : range.excerpt) === "string" ? normalize2(range.excerpt) : "";
  const text2 = normalize2(section2.text);
  if (!excerpt && !text2 || excerpt && !span.includes(excerpt) || text2 && !span.includes(text2)) return note("\u6765\u6E90\u7247\u6BB5\u4E0E\u5F53\u524DAPI\u8303\u56F4\u4E0D\u4E00\u81F4\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002");
  const offset = file.slice(0, start).split("\n").length - 1;
  return { kind: "line", editorLine: offset + startLine - 1 };
}
function resolveRelatedTarget(raw, context) {
  var _a;
  const parsed = parseReferenceText(raw);
  let target = parsed.target;
  const label = (_a = parsed.label) != null ? _a : target;
  const unavailable = (reason) => ({ kind: "unavailable", label, reason });
  if (parsed.error) return unavailable(parsed.error);
  if (parsed.syntax === "wiki") return { kind: "vault", linkText: target, label };
  if (/^https?:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      return { kind: "url", url: url.href, label };
    } catch (e) {
      return unavailable("\u7F51\u9875\u94FE\u63A5\u65E0\u6548");
    }
  }
  let explicitFileUrl, fragment;
  if (/^file:/i.test(target)) {
    try {
      const url = new URL(target);
      if (target.split("#", 1)[0].includes("?")) return unavailable("\u6587\u4EF6URL\u67E5\u8BE2\u53C2\u6570\u65E0\u6548\uFF1B\u4FDD\u7559\u539F\u5F15\u7528\u6838\u5BF9");
      if (url.hostname && url.hostname !== "localhost") return unavailable("\u6587\u4EF6URL\u4E0D\u5C5E\u4E8E\u672C\u673A\u6587\u4EF6\u7CFB\u7EDF");
      fragment = url.hash || void 0;
      if (fragment) decodeURIComponent(fragment.slice(1));
      explicitFileUrl = url.href;
      target = (0, import_url.fileURLToPath)(url);
      if (target.includes("\0")) return unavailable("\u6587\u4EF6URL\u8DEF\u5F84\u65E0\u6548");
    } catch (e) {
      return unavailable("\u6587\u4EF6URL\u65E0\u6548\u3001\u7F16\u7801\u975E\u6CD5\u6216\u4E0D\u5C5E\u4E8E\u672C\u673A\u6587\u4EF6\u7CFB\u7EDF");
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return unavailable("\u5F53\u524D\u4E0D\u652F\u6301\u6B64\u94FE\u63A5\u7C7B\u578B");
  const literalWhitespace = !explicitFileUrl && parsed.syntax === "raw" && target !== target.trim();
  if (!path3.isAbsolute(target)) {
    let decoded = target;
    try {
      decoded = decodeURIComponent(target);
    } catch (e) {
    }
    const resolveVaultCandidate = (candidate) => {
      var _a2;
      const resolved = (_a2 = context.resolveVaultLink) == null ? void 0 : _a2.call(context, candidate);
      if (!resolved) return null;
      if (literalWhitespace && path3.posix.normalize(candidate) !== resolved && path3.posix.normalize(path3.posix.join(path3.posix.dirname(context.casePath), candidate)) !== resolved) return null;
      return resolved;
    };
    const exactResolution = resolveVaultCandidate(target);
    const decodedResolution = !exactResolution && decoded !== target ? resolveVaultCandidate(decoded) : null;
    const resolvedPath = exactResolution || decodedResolution;
    if (resolvedPath) {
      const linkText = exactResolution ? target : decoded;
      const exactFile = path3.posix.normalize(linkText) === resolvedPath || path3.posix.normalize(path3.posix.join(path3.posix.dirname(context.casePath), linkText)) === resolvedPath;
      return { kind: "vault", linkText, label, resolvedPath, exactFile };
    }
  }
  if (!literalWhitespace && /^(?:Notes|Tasks|TaskNotes)\//.test(target) || target.startsWith("#")) return { kind: "vault", linkText: target, label };
  if (!target || !path3.isAbsolute(target) && !/[./\\]/.test(target)) return unavailable("\u5F15\u7528\u6CA1\u6709\u660E\u786Evault\u6216\u4ED3\u5E93\u6765\u6E90\uFF1B\u53EF\u590D\u5236\u539F\u5F15\u7528\u6838\u5BF9");
  if (!path3.isAbsolute(target) && (!context.cwd || !path3.isAbsolute(context.cwd))) return unavailable("\u7F3A\u5C11\u552F\u4E00\u660E\u786E\u7684Case cwd\uFF0C\u4E0D\u80FD\u5B9A\u4F4D\u4ED3\u5E93\u76F8\u5BF9\u8DEF\u5F84");
  if (!path3.isAbsolute(target) && !(0, import_fs.existsSync)(context.cwd)) return unavailable("Case checkout\u76EE\u5F55\u5728\u672C\u673A\u4E0D\u5B58\u5728");
  let absolutePath = path3.isAbsolute(target) ? path3.normalize(target) : path3.resolve(context.cwd, target);
  if (!explicitFileUrl && !(0, import_fs.existsSync)(absolutePath) && /%[0-9a-f]{2}/i.test(target)) {
    try {
      const decoded = decodeURIComponent(target);
      absolutePath = path3.isAbsolute(decoded) ? path3.normalize(decoded) : path3.resolve(context.cwd, decoded);
    } catch (e) {
      return unavailable("\u6587\u4EF6\u8DEF\u5F84\u7F16\u7801\u65E0\u6548");
    }
  }
  if (!(0, import_fs.existsSync)(absolutePath)) return unavailable(`\u6587\u4EF6\u5728\u672C\u673A\u4E0D\u5B58\u5728\uFF1A${absolutePath}`);
  try {
    if (!(0, import_fs.statSync)(absolutePath).isFile()) return unavailable(`\u5F15\u7528\u4E0D\u662F\u6587\u4EF6\uFF1A${absolutePath}`);
  } catch (e) {
    return unavailable(`\u65E0\u6CD5\u786E\u8BA4\u539F\u6587\u4EF6\uFF1A${absolutePath}`);
  }
  const vaultRelative = path3.relative(context.vaultRoot, absolutePath);
  if (vaultRelative && !vaultRelative.startsWith(".." + path3.sep) && vaultRelative !== ".." && !path3.isAbsolute(vaultRelative)) {
    const resolvedPath = vaultRelative.split(path3.sep).join("/");
    return { kind: "vault", linkText: resolvedPath + (fragment ? "#" + decodeURIComponent(fragment.slice(1)) : ""), label, resolvedPath, exactFile: true, ...explicitFileUrl ? { fileUrl: explicitFileUrl } : {}, ...fragment ? { fragment } : {} };
  }
  return { kind: "repository", absolutePath, repositoryPath: context.cwd ? path3.relative(context.cwd, absolutePath) : target, label, fileUrl: explicitFileUrl != null ? explicitFileUrl : (0, import_url.pathToFileURL)(absolutePath).href, ...fragment ? { fragment } : {} };
}
function buildRepositoryOpenInvocation(target, platform) {
  if (platform !== "darwin" || !path3.isAbsolute(target.absolutePath)) return null;
  return { executable: "/usr/bin/open", args: ["-a", "/Applications/Obsidian.app", target.absolutePath] };
}
function chooseTaskCase(contexts, candidates) {
  const matches = contexts ? candidates.filter((candidate) => contexts.includes(candidate.contextTag)) : [];
  if (matches.length !== 1) return { casePath: null, cwd: null, reason: matches.length ? "Task\u5173\u8054\u591A\u4E2ACase\uFF0C\u4E0D\u80FD\u81EA\u52A8\u9009\u62E9cwd" : "Task\u6CA1\u6709\u552F\u4E00\u5DF2\u786E\u8BA4\u7684Case\u5173\u8054" };
  const match = matches[0];
  if (!match.cwd || !path3.isAbsolute(match.cwd)) return { casePath: match.path, cwd: null, reason: "Case\u672A\u63D0\u4F9B\u672C\u673A\u7EDD\u5BF9cwd" };
  return { casePath: match.path, cwd: match.cwd, reason: null };
}

// src/repository-open.ts
var import_child_process = require("child_process");
var import_fs2 = require("fs");
var path4 = __toESM(require("path"));
var application = "/Applications/Obsidian.app";
var RepositoryMarkdownOpener = class {
  constructor(dependencies = {}) {
    this.dependencies = dependencies;
  }
  async open(absolutePath) {
    var _a, _b, _c;
    const platform = (_a = this.dependencies.platform) != null ? _a : process.platform;
    if (platform !== "darwin") return { kind: "unsupported", message: "\u5F53\u524D\u5E73\u53F0\u6CA1\u6709\u5DF2\u6838\u5BF9\u7684\u6307\u5B9AObsidian\u6253\u5F00\u53C2\u6570\uFF1B\u53EF\u590D\u5236\u8DEF\u5F84\u548C\u624B\u5DE5\u6B65\u9AA4\u3002" };
    if (!path4.isAbsolute(absolutePath) || !/^\.md$/i.test(path4.extname(absolutePath)) || absolutePath.includes("\0")) return { kind: "unavailable", message: "\u4EC5\u652F\u6301\u51C6\u786E\u672C\u673A\u7EDD\u5BF9Markdown\u6587\u4EF6\u8DEF\u5F84\uFF1B\u53EF\u590D\u5236\u8DEF\u5F84\u6838\u5BF9\u3002" };
    const inspect = (_b = this.dependencies.inspect) != null ? _b : import_fs2.statSync;
    try {
      if (!inspect(absolutePath).isFile()) return { kind: "unavailable", message: "\u76EE\u6807\u4E0D\u662F\u672C\u673AMarkdown\u6587\u4EF6\uFF1B\u8BF7\u6838\u5BF9\u539F\u8DEF\u5F84\u3002" };
      if (!inspect(application).isDirectory() || !inspect(`${application}/Contents/MacOS/Obsidian`).isFile()) return { kind: "unavailable", message: "\u672A\u786E\u8BA4\u6307\u5B9AObsidian\u5E94\u7528\u4E0E\u53EF\u6267\u884C\u6587\u4EF6\uFF1B\u4FDD\u7559\u590D\u5236\u8DEF\u5F84\uFF0C\u4E0D\u6539\u7CFB\u7EDF\u5173\u8054\u3002" };
    } catch (e) {
      return { kind: "unavailable", message: "\u65E0\u6CD5\u786E\u8BA4\u672C\u673A\u539F\u6587\u4EF6\u6216\u6307\u5B9AObsidian\u5E94\u7528\uFF1B\u8BF7\u6838\u5BF9\u8DEF\u5F84\u3002" };
    }
    const invocation = buildRepositoryOpenInvocation({ kind: "repository", absolutePath, repositoryPath: absolutePath, label: absolutePath, fileUrl: "" }, platform);
    const execute = (_c = this.dependencies.execute) != null ? _c : executePublicFileOpen;
    try {
      await execute(invocation.executable, invocation.args, { timeoutMs: 1e4 });
      return { kind: "accepted", message: "\u6253\u5F00\u8BF7\u6C42\u5DF2\u63D0\u4EA4\uFF1B\u5B9E\u9645\u51C6\u786E\u6253\u5F00\u3001tab\u5F71\u54CD\u548C\u539F\u4F4D\u4FDD\u5B58\u5C1A\u672A\u9A8C\u8BC1\u3002" };
    } catch (error) {
      const failure = error;
      const timeout = (failure == null ? void 0 : failure.code) === "ETIMEDOUT" || (failure == null ? void 0 : failure.killed) === true;
      return { kind: "unknown", message: timeout ? "\u6253\u5F00\u8BF7\u6C42\u8D85\u65F6\uFF0C\u7ED3\u679C\u672A\u77E5\uFF1B\u6587\u4EF6\u53EF\u80FD\u5DF2\u6253\u5F00\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF0C\u4E0D\u81EA\u52A8\u91CD\u8BD5\u3002" : "\u6253\u5F00\u8BF7\u6C42\u8FD4\u56DE\u9519\u8BEF\uFF0C\u5B9E\u9645\u662F\u5426\u6253\u5F00\u672A\u77E5\uFF1B\u4FDD\u7559\u590D\u5236\u8DEF\u5F84\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF0C\u4E0D\u81EA\u52A8\u91CD\u8BD5\u3002" };
    }
  }
};
function executePublicFileOpen(executable, args, options) {
  return new Promise((resolve5, reject) => {
    (0, import_child_process.execFile)(executable, args, { timeout: options.timeoutMs, shell: false, windowsHide: true }, (error) => error ? reject(error) : resolve5());
  });
}

// src/markdown-link-source.ts
var normalized = (value) => {
  try {
    return decodeURIComponent(value).replace(/\\([\\[\]()<>|])/g, "$1");
  } catch (e) {
    return value;
  }
};
var visibleLabel = (value) => value.replace(/\s+/g, " ").trim();
var entityDecoder = null;
function decodeEntities(value) {
  return value.replace(/&(?:#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/gi, (entity) => {
    var _a;
    if (typeof document !== "undefined") {
      entityDecoder != null ? entityDecoder : entityDecoder = document.createElement("textarea");
      entityDecoder.innerHTML = entity;
      return entityDecoder.value;
    }
    const numeric = entity.match(/^&#(x[0-9a-f]+|[0-9]+);$/i);
    if (numeric) {
      const token = numeric[1], point = parseInt(token[0].toLowerCase() === "x" ? token.slice(1) : token, token[0].toLowerCase() === "x" ? 16 : 10);
      return point > 0 && point <= 1114111 && !(point >= 55296 && point <= 57343) ? String.fromCodePoint(point) : "\uFFFD";
    }
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\xA0" };
    return (_a = named[entity.slice(1, -1)]) != null ? _a : entity;
  });
}
var labelText = (value) => visibleLabel(decodeEntities(value.replace(/<[^>]*>/g, "").replace(/[*_~`]/g, "").replace(/\\(.)/g, "$1")));
function collectMarkdownLinkSources(text2) {
  var _a, _b;
  let fence = null;
  let masked = text2.split("\n").map((line) => {
    const content = line.replace(/^ {0,3}(?:>\s*)+/, "");
    const marker = content.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return "";
    }
    return fence || /^(?: {4}|\t)/.test(content) ? "" : line;
  }).join("\n").replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const definitions = /* @__PURE__ */ new Map();
  for (const match of masked.matchAll(/^ {0,3}\[([^\]^][^\]]*)\]:\s*(?:<([^>]+)>|(\S+))/gm)) definitions.set(match[1].toLowerCase(), (_a = match[2]) != null ? _a : match[3]);
  masked = masked.replace(/^ {0,3}\[[^\]]+\]:.*$/gm, "");
  const links = [];
  const unescape = (value) => value.replace(/\\(.)/g, "$1");
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === "\\") {
      i++;
      continue;
    }
    if (masked[i] === "`") {
      const run = masked.slice(i).match(/^`+/)[0], end = masked.indexOf(run, i + run.length);
      if (end >= 0) {
        i = end + run.length - 1;
        continue;
      }
    }
    if (masked[i] !== "[") continue;
    if (masked[i - 1] === "!") continue;
    if (masked[i + 1] === "[") {
      const end = masked.indexOf("]]", i + 2);
      if (end < 0) continue;
      const parts = masked.slice(i + 2, end).split("|");
      links.push({ kind: "wiki", href: unescape(parts[0]), label: labelText((_b = parts[1]) != null ? _b : parts[0]) });
      i = end + 1;
      continue;
    }
    let close = i + 1, depth = 1;
    for (; close < masked.length; close++) {
      if (masked[close] === "\\") {
        close++;
        continue;
      }
      if (masked[close] === "[") depth++;
      if (masked[close] === "]" && --depth === 0) break;
    }
    if (depth) continue;
    const label = masked.slice(i + 1, close);
    if (masked[close + 1] === "(") {
      let end = close + 2, paren = 1, angle = false;
      for (; end < masked.length; end++) {
        const char = masked[end];
        if (char === "\\") {
          end++;
          continue;
        }
        if (char === "<") angle = true;
        if (char === ">") angle = false;
        if (!angle && char === "(") paren++;
        if (!angle && char === ")" && --paren === 0) break;
      }
      if (paren) continue;
      const value = masked.slice(close + 2, end).trim(), href2 = value.startsWith("<") ? value.slice(1, value.indexOf(">")) : value.replace(/\s+["'][\s\S]*["']$/, "");
      links.push({ kind: "markdown", href: unescape(href2), label: labelText(label) });
      i = end;
      continue;
    }
    const reference = masked[close + 1] === "[" ? masked.slice(close + 2, masked.indexOf("]", close + 2)) : label;
    const href = definitions.get((reference || label).toLowerCase());
    if (href) {
      links.push({ kind: "markdown", href, label: labelText(label) });
      if (masked[close + 1] === "[") i = masked.indexOf("]", close + 2);
      else i = close;
    }
  }
  return links;
}
function renderedLinkSource(sources, rendered, index, complete) {
  const clicked = rendered[index];
  if (!clicked) return null;
  const href = normalized(clicked.href);
  const sourceGroup = sources.filter((source2) => normalized(source2.href) === href);
  const actualGroup = rendered.map((link, i) => ({ link, i })).filter((x) => normalized(x.link.href) === href);
  if (actualGroup.length > sourceGroup.length) return null;
  const matching = sourceGroup.filter((source2) => source2.label === visibleLabel(clicked.label));
  if (matching.length === 1 && sourceGroup.every((source2) => source2.kind === matching[0].kind)) return matching[0].kind;
  if (!complete || sourceGroup.length !== actualGroup.length) return null;
  const ordinal = actualGroup.findIndex((x) => x.i === index), source = sourceGroup[ordinal];
  return source && source.label === visibleLabel(clicked.label) ? source.kind : null;
}

// src/case-content.ts
function createCaseContent(casePath, details, readAt) {
  const lines = details.replace(/\r\n/g, "\n").replace(/^\ufeff/, "").split("\n");
  const headings = [];
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (match) {
      if (!fence) fence = { marker: match[1][0], size: match[1].length };
      else if (match[1][0] === fence.marker && match[1].length >= fence.size && !match[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) headings.push({ heading: heading[2], level: heading[1].length, index });
  }
  const selected = /* @__PURE__ */ new Set(["Goal", "Current", "Context", "Summary", "Decisions", "\u76EE\u6807", "\u51B3\u7B56", "\u80CC\u666F", "\u6458\u8981"]);
  const sections = headings.filter((h) => selected.has(h.heading)).map((h) => {
    var _a, _b;
    const end = (_b = (_a = headings.find((n) => n.index > h.index && n.level <= h.level)) == null ? void 0 : _a.index) != null ? _b : lines.length;
    return { heading: h.heading, level: h.level, text: lines.slice(h.index + 1, end).join("\n"), source: { lineStart: h.index + 1, lineEnd: end } };
  });
  return { casePath, details, readAt, source: "vault-cached-read", error: null, sections };
}

// src/main.ts
var FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";
var execFileAsync = (0, import_util.promisify)(import_child_process2.execFile);
var DEFAULT_SETTINGS = {
  flowdeskRoot: "",
  workingDirectory: "",
  apiUrl: "",
  tasknotesEnv: "{}"
};
var FlowDeskDashboardPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.repositoryOpenDependencies = {};
  }
  openRepositoryMarkdown(absolutePath) {
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
      this.app.metadataCache.on("changed", (file) => {
        var _a;
        const view = this.getDashboardView();
        if (view == null ? void 0 : view.observesFile(file.path)) view.scheduleRefresh();
        const activeFile = this.app.workspace.getActiveFile();
        if ((activeFile == null ? void 0 : activeFile.path) === file.path && !this.isTaskFile(activeFile)) {
          void ((_a = this.getDashboardView()) == null ? void 0 : _a.syncToActiveFile(file));
        }
      })
    );
    const refreshOnChange = (file) => {
      const view = this.getDashboardView();
      if (view && file instanceof import_obsidian.TFile && view.observesFile(file.path)) view.scheduleRefresh();
    };
    this.registerEvent(this.app.vault.on("modify", refreshOnChange));
    this.registerEvent(this.app.vault.on("create", refreshOnChange));
    this.registerEvent(this.app.vault.on("delete", refreshOnChange));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const view = this.getDashboardView();
      if (view && file instanceof import_obsidian.TFile && (view.observesFile(file.path) || view.observesFile(oldPath))) view.scheduleRefresh();
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
    new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Tasks/*.md \u4EFB\u52A1\u6587\u4EF6\u3002");
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
  async activateWorkCaseDashboard(file) {
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
      await leaf.view.syncToActiveFile(file);
    }
    workspace.revealLeaf(leaf);
  }
  async loadSnapshot(taskPath, signal) {
    var _a;
    const auth = resolveTaskNotesAuth((_a = this.settings.tasknotesEnv) != null ? _a : "{}");
    const invocation = this.createSnapshotInvocation(taskPath, "json");
    let stdout;
    try {
      const result = await execFileAsync(invocation.executable, invocation.args, {
        ...createSnapshotExecutionOptions(invocation.cwd, signal),
        env: auth.env
      });
      stdout = result.stdout;
    } catch (error) {
      throw new Error(formatTaskNotesAuthError(formatSnapshotCommandError(error), auth.token));
    }
    try {
      return sanitizeTaskNotesSnapshot(JSON.parse(stdout), auth.token);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(formatTaskNotesAuthError(`Snapshot JSON \u89E3\u6790\u5931\u8D25\uFF1A${message}`, auth.token));
    }
  }
  async loadWorkCaseSnapshot(casePath, signal) {
    var _a, _b;
    const auth = resolveTaskNotesAuth((_a = this.settings.tasknotesEnv) != null ? _a : "{}");
    const invocation = this.createWorkCaseSnapshotInvocation(casePath);
    let stdout;
    let resumeUnavailable = false;
    const execute = (args) => execFileAsync(invocation.executable, args, {
      ...createSnapshotExecutionOptions(invocation.cwd, signal),
      env: auth.env
    });
    try {
      const result = await execute(invocation.args);
      stdout = result.stdout;
    } catch (error) {
      const failure = error;
      if (failure.code !== 2 || !/^.*: error: unrecognized arguments: --resume-bundle\s*$/m.test((_b = failure.stderr) != null ? _b : "")) throw new Error(formatTaskNotesAuthError(formatWorkCaseCommandError(error), auth.token));
      try {
        const result = await execute(invocation.args.filter((arg) => arg !== "--resume-bundle"));
        stdout = result.stdout;
        resumeUnavailable = true;
      } catch (retryError) {
        throw new Error(formatTaskNotesAuthError(formatWorkCaseCommandError(retryError), auth.token));
      }
    }
    try {
      const snapshot = sanitizeTaskNotesSnapshot(JSON.parse(stdout), auth.token);
      if (resumeUnavailable && Array.isArray(snapshot.diagnostics)) snapshot.diagnostics.push({ code: "resume_bundle_unavailable", severity: "warning", path: "resume_bundle", message: "\u5F53\u524Dproducer\u4E0D\u652F\u6301\u6062\u590D\u6295\u5F71\uFF1B\u9ED8\u8BA4schema1\u53EA\u8BFB\u5185\u5BB9\u4FDD\u7559\u3002" });
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(formatTaskNotesAuthError(`Work Case snapshot JSON \u89E3\u6790\u5931\u8D25\uFF1A${message}`, auth.token));
    }
  }
  createSnapshotInvocation(taskPath, format) {
    var _a;
    const flowdeskRoot = this.resolveFlowDeskRoot();
    const workingDirectory = expandHomePath(this.settings.workingDirectory.trim()) || flowdeskRoot;
    return buildSnapshotInvocation(
      {
        flowdeskRoot,
        taskPath,
        workingDirectory,
        apiUrl: resolveTaskNotesApiUrl(this.settings.apiUrl, resolveTaskNotesAuth((_a = this.settings.tasknotesEnv) != null ? _a : "{}").env)
      },
      format
    );
  }
  createWorkCaseSnapshotInvocation(casePath, includeResumeBundle = true) {
    var _a;
    return buildWorkCaseSnapshotInvocation({
      flowdeskRoot: this.resolveFlowDeskRoot(),
      casePath,
      includeResumeBundle,
      workingDirectory: this.resolveVaultRoot(),
      apiUrl: resolveTaskNotesApiUrl(this.settings.apiUrl, resolveTaskNotesAuth((_a = this.settings.tasknotesEnv) != null ? _a : "{}").env)
    });
  }
  async copyDashboardCommand(taskPath) {
    await navigator.clipboard.writeText(
      formatShellCommand(this.createSnapshotInvocation(taskPath, "dashboard"))
    );
  }
  async loadTaskDetails(taskPath, signal) {
    var _a;
    const auth = resolveTaskNotesAuth((_a = this.settings.tasknotesEnv) != null ? _a : "{}");
    return readTaskDetails({ taskPath, signal, auth, apiUrl: resolveTaskNotesApiUrl(this.settings.apiUrl, auth.env) });
  }
  async loadCaseContent(casePath, signal) {
    const file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof import_obsidian.TFile) || file.path !== casePath) throw new Error("\u672A\u627E\u5230\u51C6\u786ECase\u539F\u6587");
    const details = await this.app.vault.cachedRead(file);
    if (signal.aborted) throw new Error("Case\u539F\u6587\u8BF7\u6C42\u5DF2\u53D6\u6D88");
    return createCaseContent(casePath, details, (/* @__PURE__ */ new Date()).toISOString());
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
  workCaseType(file) {
    var _a, _b;
    if (!file || file.extension !== "md" || this.isTaskFile(file)) return "";
    const type = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) == null ? void 0 : _b.type;
    return typeof type === "string" ? type : "";
  }
  getDashboardView() {
    const leaf = this.app.workspace.getLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE)[0];
    return (leaf == null ? void 0 : leaf.view) instanceof FlowDeskDashboardView ? leaf.view : null;
  }
  resolveFlowDeskRoot() {
    const candidates = [
      expandHomePath(this.settings.flowdeskRoot.trim()),
      expandHomePath(process.env.FLOWDESK_PLUGIN_ROOT || ""),
      path5.resolve(__dirname, "..", "..")
    ].filter(Boolean);
    for (const candidate of candidates) {
      if ((0, import_fs3.existsSync)(path5.join(candidate, "bin", "flowdesk-execution-snapshot"))) {
        return candidate;
      }
    }
    throw new Error("\u672A\u627E\u5230 FlowDesk \u4ED3\u5E93\u8DEF\u5F84\uFF0C\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u914D\u7F6E FlowDesk repo path\u3002");
  }
  vaultRoot() {
    return this.resolveVaultRoot();
  }
  resolveVaultRoot() {
    const adapter = this.app.vault.adapter;
    const basePath = typeof adapter.getBasePath === "function" ? adapter.getBasePath() : adapter.basePath;
    if (!basePath) {
      throw new Error("Work Case Dashboard \u4EC5\u652F\u6301\u672C\u5730\u6587\u4EF6\u7CFB\u7EDF Vault\u3002");
    }
    return path5.resolve(basePath);
  }
};
var FlowDeskDashboardView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.previousTaskPath = "";
    this.cancelInitialSync = null;
    this.rawTaskContent = null;
    this.rawContentController = null;
    this.rawContentGeneration = 0;
    this.rawContentLoading = false;
    this.rawContentOpen = false;
    this.navigationController = null;
    this.navigationOpening = null;
    this.relatedTargetPanel = null;
    this.taskAdapter = new FrozenTaskAdapter({
      shell: () => this.shell,
      loadSnapshot: (taskPath, signal) => this.plugin.loadSnapshot(taskPath, signal),
      render: (container, state) => this.renderFrozenTask(container, state),
      requestRender: () => this.renderShell(),
      nowLabel: () => formatTime(/* @__PURE__ */ new Date())
    });
    this.caseAdapter = new WorkCaseAdapter({
      shell: () => this.shell,
      loadSnapshot: (casePath, signal) => this.plugin.loadWorkCaseSnapshot(casePath, signal),
      loadCaseContent: (casePath, signal) => this.plugin.loadCaseContent(casePath, signal),
      render: (container, state) => this.renderWorkCase(container, state),
      requestRender: () => this.renderShell(),
      nowLabel: () => formatTime(/* @__PURE__ */ new Date())
    });
    this.caseRenderer = new WorkCaseDashboardRenderer({
      refresh: () => {
        this.cancelNavigation();
        return this.caseAdapter.refresh();
      },
      openTask: (taskPath, origin) => this.openTask(taskPath, origin),
      openCaseSource: (casePath, source) => this.openCaseSource(casePath, source),
      openRelated: (target, casePath) => this.openRelated(target, casePath),
      renderMarkdown: (text2, element, sourcePath) => this.renderSourceMarkdown(text2, element, sourcePath),
      copyText: (text2) => navigator.clipboard.writeText(text2),
      openTaskSource: (taskPath, source) => this.openSnapshotSource(taskPath, source, "\u6062\u590D\u5F15\u7528")
    });
    this.shell = new ViewShellController([this.taskAdapter, this.caseAdapter]);
  }
  cancelNavigation() {
    var _a;
    (_a = this.navigationController) == null ? void 0 : _a.abort();
    this.navigationController = null;
  }
  clearRawTaskContent(cancelNavigation = true) {
    var _a;
    if (cancelNavigation) this.cancelNavigation();
    this.rawContentGeneration += 1;
    (_a = this.rawContentController) == null ? void 0 : _a.abort();
    this.rawContentController = null;
    this.rawTaskContent = null;
    this.rawContentLoading = false;
    this.rawContentOpen = false;
  }
  async loadRawTaskContent(taskPath) {
    var _a;
    if (this.shell.context.kind !== "task" || !("resourcePath" in this.shell.context) || this.shell.context.resourcePath !== taskPath) return;
    (_a = this.rawContentController) == null ? void 0 : _a.abort();
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
  renderRawTaskContent(container, model) {
    var _a;
    const section2 = container.createEl("details", { cls: "flowdesk-contract-item-details flowdesk-raw-content" });
    section2.open = this.rawContentOpen;
    section2.addEventListener("toggle", () => {
      this.rawContentOpen = section2.open;
    });
    section2.createEl("summary", { text: "\u5B8C\u6574API\u539F\u6587 / \u672A\u6295\u5F71\u5185\u5BB9" });
    section2.createDiv({ cls: "flowdesk-muted", text: `\u5355\u72ECAPI\u539F\u6587\u89C2\u6D4B\uFF1B\u4E0D\u4EE3\u8868\u4E0E snapshot \u540C\u8F6E\u4E00\u81F4\u3002Task\uFF1A${model.currentTask.id}\uFF1Bsnapshot \u65F6\u95F4\uFF1A${model.observation.generatedAt}` });
    const read = section2.createEl("button", { text: this.rawContentLoading ? "\u539F\u6587\u8BFB\u53D6\u4E2D" : "\u8BFB\u53D6 / \u5237\u65B0 API \u539F\u6587", cls: "flowdesk-content-read" });
    read.disabled = this.rawContentLoading;
    read.addEventListener("click", () => {
      void this.loadRawTaskContent(model.currentTask.id);
    });
    const original = section2.createEl("button", { text: "\u6253\u5F00\u4EFB\u52A1\u539F\u6587", cls: "flowdesk-content-source" });
    original.addEventListener("click", () => {
      void this.openSnapshotSource(model.currentTask.id, { line_start: 1, line_end: 1, excerpt: observationFirstLine(this.rawTaskContent) }, "\u5B8C\u6574\u539F\u6587");
    });
    const observation = this.rawTaskContent;
    if (!observation || observation.taskId !== model.currentTask.id) return;
    if (observation.error) {
      section2.createDiv({ cls: "flowdesk-error", text: `API\u539F\u6587\u8BFB\u53D6\u5931\u8D25\uFF1A${observation.error}` });
      return;
    }
    section2.createDiv({ cls: "flowdesk-muted", text: `tasknotes-api \xB7 ${observation.taskId} \xB7 \u6210\u529F\u8BFB\u53D6\u65F6\u95F4\uFF1A${observation.readAt}` });
    if (rawContentDiffers(model.content, observation, (_a = this.taskRenderState.snapshot) != null ? _a : void 0)) section2.createDiv({ cls: "flowdesk-error", text: "API\u539F\u6587\u4E0E snapshot \u6295\u5F71\u7247\u6BB5\u5B58\u5728\u5DEE\u5F02\uFF1Bsnapshot \u5DF2\u6807\u8BB0 stale\uFF0C\u8BF7\u5237\u65B0\u6838\u5BF9\u3002" });
    if (observation.details === "") section2.createDiv({ cls: "flowdesk-muted", text: "API\u539F\u6587\u4E3A\u7A7A\uFF1B\u53EF\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002" });
    else {
      const markdown = section2.createDiv({ cls: "flowdesk-contract-scope-markdown" });
      void this.renderSourceMarkdown(observation.details, markdown, observation.taskId).catch(() => {
        markdown.setText(observation.details);
      });
    }
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
    this.clearRawTaskContent();
    (_a = this.cancelInitialSync) == null ? void 0 : _a.call(this);
    this.cancelInitialSync = null;
    this.shell.close();
    this.taskAdapter.close();
  }
  async syncToActiveFile(file = this.app.workspace.getActiveFile()) {
    var _a;
    const nextContext = resolveViewShellContext(
      (_a = file == null ? void 0 : file.path) != null ? _a : null,
      this.previousTaskPath,
      this.plugin.workCaseType(file)
    );
    if (!("resourcePath" in nextContext) || nextContext.kind !== "task" || this.shell.context.kind !== "task" || !("resourcePath" in this.shell.context) || this.shell.context.resourcePath !== nextContext.resourcePath) this.clearRawTaskContent(!(this.navigationOpening && this.navigationOpening.path === (file == null ? void 0 : file.path) && !this.navigationOpening.signal.aborted));
    if ("resourcePath" in nextContext) {
      this.previousTaskPath = nextContext.resourcePath;
      await this.shell.select(nextContext);
      this.renderShell();
      return;
    }
    await this.shell.select(nextContext);
    this.renderShell();
  }
  async loadTask(taskPath) {
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
    this.cancelNavigation();
    if (this.shell.context.kind === this.caseAdapter.kind) {
      this.caseAdapter.scheduleRefresh();
    } else {
      this.clearRawTaskContent();
      this.taskAdapter.scheduleRefresh();
    }
  }
  observesTaskFile(filePath) {
    return this.taskAdapter.observesTaskFile(filePath);
  }
  observesFile(filePath) {
    return this.shell.context.kind === this.caseAdapter.kind ? this.caseAdapter.observesFile(filePath) : this.observesTaskFile(filePath);
  }
  get taskRenderState() {
    const state = this.taskAdapter.getRenderState();
    if (!state) throw new Error("Frozen Task Adapter \u5C1A\u672A\u6FC0\u6D3B");
    return state;
  }
  get loading() {
    return this.taskRenderState.loading;
  }
  get disclosureState() {
    return this.taskRenderState.disclosureState;
  }
  renderShell() {
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
        previousTaskPath: this.shell.context.previousResourcePath
      });
      return;
    }
    if (this.shell.context.kind === "empty") {
      container.createDiv({
        cls: "flowdesk-empty",
        text: "\u6253\u5F00\u4E00\u4E2A TaskNotes \u4EFB\u52A1\u4EE5\u67E5\u770B Dashboard\u3002"
      });
    }
  }
  renderWorkCase(container, state) {
    this.caseRenderer.render(container, state);
  }
  renderFrozenTask(container, state) {
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
      container.createDiv({ cls: "flowdesk-empty", text: "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u4EFB\u52A1 snapshot..." });
      return;
    }
    if (state.error && !snapshot) {
      container.createDiv({ cls: "flowdesk-error", text: state.error });
      return;
    }
    if (!snapshot) {
      container.createDiv({ cls: "flowdesk-empty", text: "\u5C1A\u672A\u8BFB\u53D6 snapshot\u3002" });
      return;
    }
    const rawDifference = this.rawTaskContent && !this.rawTaskContent.error && rawContentDiffers(
      createDashboardViewModel(snapshot).content,
      this.rawTaskContent,
      snapshot
    );
    const model = createDashboardViewModel(snapshot, {
      expectedTaskPath: taskPath,
      loadedAt: state.loadedAt,
      staleReason: state.staleReason || (rawDifference ? "API\u539F\u6587\u4E0E snapshot \u7247\u6BB5\u5B58\u5728\u5DEE\u5F02\uFF0C\u8BF7\u5237\u65B0\u6838\u5BF9\u3002" : "")
    });
    if (model.errorCode) {
      this.renderLoadingHeader(container, taskPath, "snapshot \u4E0D\u517C\u5BB9");
      container.createDiv({
        cls: "flowdesk-error",
        text: formatSnapshotCompatibilityError(model.errorCode)
      });
      return;
    }
    const presentation = createDashboardPresentation(model);
    this.renderHeader(container, model, presentation);
    this.renderTrustStrip(container, presentation.trust);
    const current = createTaskCurrentProgress(model.content, {
      statusIsCompleted: model.currentTask.statusIsCompleted,
      observedAt: model.observation.generatedAt,
      observationHealthy: model.observation.isTrustworthy && !model.observation.isStale && !state.error && !model.diagnostics.some((diagnostic) => /truncat|body_omitted|progress_omitted|response_too_large/i.test(diagnostic.code))
    });
    const progressPanel = container.createDiv({ cls: "flowdesk-task-current-progress flowdesk-dashboard-section" });
    progressPanel.createDiv({ cls: "flowdesk-dashboard-section-title", text: current.status === "historical" ? "\u6700\u8FD1 Progress\uFF08\u5386\u53F2\uFF09" : current.status === "current" ? "\u5F53\u524D Progress / Next" : current.progress ? "Progress \u7247\u6BB5\uFF08\u5F53\u524D\u6027\u672A\u786E\u8BA4\uFF09" : "\u5F53\u524D Progress\uFF1Aunknown" });
    if (current.timestamp) progressPanel.createDiv({ cls: "flowdesk-muted", text: `\u4E8B\u4EF6\u65F6\u95F4\uFF1A${current.timestamp} \xB7 snapshot \u751F\u6210\u4E8E ${model.observation.generatedAt}` });
    for (const [field, text2] of [["progress", current.progress], ["next", current.next]]) {
      if (text2 === null) continue;
      if (field === "next") progressPanel.createDiv({ cls: "flowdesk-summary-label", text: "Next\uFF08\u4EC5\u5C55\u793A\uFF09" });
      const body = progressPanel.createDiv({ cls: "flowdesk-contract-scope-markdown markdown-rendered", attr: { "data-current-field": field } });
      void this.renderSourceMarkdown(text2, body, model.currentTask.id).catch(() => {
        body.setText(text2);
      });
    }
    for (const gap of current.gaps) progressPanel.createDiv({ cls: "flowdesk-muted", text: gap });
    if (current.source) {
      const source = progressPanel.createEl("button", { cls: "flowdesk-content-source", text: "\u6253\u5F00 Progress \u539F\u6587" });
      const projected = model.content.domainSections.find((section2) => section2.level === 2 && section2.heading === "Progress");
      source.addEventListener("click", () => {
        var _a;
        void this.openSnapshotSource(model.currentTask.id, current.source, "Progress", (_a = projected == null ? void 0 : projected.text) != null ? _a : "");
      });
    }
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
  renderLoadingHeader(container, taskPath, status) {
    const header = container.createDiv({ cls: "flowdesk-task-header" });
    const topRow = header.createDiv({ cls: "flowdesk-task-top-row" });
    const actions = topRow.createDiv({ cls: "flowdesk-task-meta-actions" });
    this.renderToolbar(actions, taskPath);
    const heading = header.createDiv({ cls: "flowdesk-task-heading" });
    const title = heading.createDiv({
      cls: "flowdesk-task-title flowdesk-current-task-link",
      text: taskTitleFromPath(taskPath),
      attr: { role: "link", tabindex: "0" }
    });
    this.makeNavigable(title, () => this.openTask(taskPath));
    const metaRow = header.createDiv({ cls: "flowdesk-task-meta-row" });
    metaRow.createDiv({ cls: "flowdesk-task-read-meta", text: status });
  }
  renderHeader(container, model, presentation) {
    const header = container.createDiv({ cls: "flowdesk-task-header" });
    const topRow = header.createDiv({ cls: "flowdesk-task-top-row" });
    if (presentation.header.parent) {
      const parent = topRow.createDiv({
        cls: "flowdesk-parent-link",
        text: "\u2191 \u7236\u4EFB\u52A1",
        attr: {
          role: "link",
          tabindex: "0",
          title: presentation.header.parent.title,
          "aria-label": `\u6253\u5F00\u7236\u4EFB\u52A1\uFF1A${presentation.header.parent.title}`
        }
      });
      this.makeNavigable(
        parent,
        () => {
          var _a, _b;
          return this.openTask((_b = (_a = presentation.header.parent) == null ? void 0 : _a.id) != null ? _b : "", "parent");
        }
      );
    } else {
      topRow.createDiv({
        cls: "flowdesk-task-context-label",
        text: presentation.kind === "parent" ? "\u5F53\u524D\u7236\u4EFB\u52A1" : "\u5F53\u524D\u4EFB\u52A1"
      });
    }
    const actions = topRow.createDiv({ cls: "flowdesk-task-meta-actions" });
    this.renderToolbar(actions, model.currentTask.id, model);
    const heading = header.createDiv({ cls: "flowdesk-task-heading" });
    const title = heading.createDiv({
      cls: "flowdesk-task-title flowdesk-current-task-link",
      text: presentation.header.title,
      attr: { role: "link", tabindex: "0" }
    });
    this.makeNavigable(title, () => this.openTask(model.currentTask.id));
    const metaRow = header.createDiv({ cls: "flowdesk-task-meta-row" });
    const badges = metaRow.createDiv({ cls: "flowdesk-task-badges" });
    badges.createSpan({
      cls: `flowdesk-state-pill is-${presentation.header.statusTone}`,
      text: presentation.header.status,
      attr: { title: model.currentTask.status }
    });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.kindLabel });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.priority });
    if (model.currentTask.isBlocked) {
      badges.createSpan({ cls: "flowdesk-state-pill is-error", text: "\u5B58\u5728\u963B\u585E" });
    }
    metaRow.createDiv({
      cls: "flowdesk-task-read-meta",
      text: `\u6765\u6E90\uFF1A${model.schemaLabel} \xB7 ${this.loading ? "\u6B63\u5728\u5237\u65B0 \xB7 \u4E0A\u6B21\u8BFB\u53D6" : "\u8BFB\u53D6\u4E8E"} ${model.observation.loadedAt}`,
      attr: { title: `producer \u751F\u6210\u4E8E ${model.observation.generatedAt}` }
    });
  }
  renderToolbar(container, taskPath, model) {
    const toolbar = container.createDiv({ cls: "flowdesk-dashboard-toolbar" });
    const copy = toolbar.createEl("button", {
      cls: "flowdesk-toolbar-button",
      attr: { "aria-label": "\u590D\u5236 CLI", title: "\u590D\u5236 CLI" }
    });
    (0, import_obsidian.setIcon)(copy, "copy");
    copy.addEventListener("click", async () => {
      try {
        await this.plugin.copyDashboardCommand(taskPath);
        new import_obsidian.Notice("CLI \u547D\u4EE4\u5DF2\u590D\u5236");
      } catch (error) {
        new import_obsidian.Notice(`\u65E0\u6CD5\u590D\u5236 CLI \u547D\u4EE4\uFF1A${String(error)}`);
      }
    });
    const refresh = toolbar.createEl("button", {
      cls: "flowdesk-toolbar-button",
      attr: {
        "aria-label": this.loading ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0",
        title: this.loading ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0"
      }
    });
    (0, import_obsidian.setIcon)(refresh, "refresh-cw");
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
      cls: `flowdesk-trust-summary is-${trust.tone}`,
      attr: { title: trust.tooltip }
    });
    strip.createSpan({ cls: "flowdesk-trust-dot", attr: { "aria-hidden": "true" } });
    strip.createSpan({ cls: "flowdesk-trust-badge", text: trust.label });
    strip.createSpan({ cls: "flowdesk-trust-source", text: trust.sourceLabel });
    strip.createSpan({
      cls: `flowdesk-trust-contract is-${trust.contractTone}`,
      text: trust.contractLabel
    });
  }
  renderPrimaryDiagnostic(container, status, taskTitle, taskId) {
    const card = container.createDiv({
      cls: `flowdesk-primary-status is-${status.tone}`
    });
    card.createDiv({
      cls: "flowdesk-card-kicker",
      text: "\u5F53\u524D\u8FDB\u5C55"
    });
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
    diagnosticRow(card, "\u505A\u5230\u54EA\u4E86", status.reason);
    diagnosticRow(card, "\u4E0B\u4E00\u6B65", status.remediation);
    if (status.diagnostic) {
      const copyProblem = card.createEl("button", {
        cls: "flowdesk-copy-problem",
        text: "\u590D\u5236\u95EE\u9898",
        attr: { "aria-label": "\u590D\u5236\u95EE\u9898" }
      });
      copyProblem.addEventListener("click", (event) => {
        var _a, _b;
        event.stopPropagation();
        void this.copyDiagnostic({
          taskTitle,
          taskId,
          title: status.title,
          reason: status.reason,
          remediation: status.remediation,
          code: ((_a = status.diagnostic) == null ? void 0 : _a.code) || "unknown_diagnostic",
          path: ((_b = status.diagnostic) == null ? void 0 : _b.path) || "\u672A\u63D0\u4F9B",
          location: status.location
        });
      });
    }
  }
  async copyDiagnostic(input) {
    try {
      await navigator.clipboard.writeText(formatDiagnosticClipboard(input));
      new import_obsidian.Notice("\u95EE\u9898\u5DF2\u590D\u5236");
    } catch (error) {
      new import_obsidian.Notice(`\u65E0\u6CD5\u590D\u5236\u95EE\u9898\uFF1A${String(error)}`);
    }
  }
  async openDiagnosticLocation(diagnostic) {
    await this.openSnapshotSource(diagnostic.taskId, diagnostic.source, "\u8BCA\u65AD");
  }
  beginNavigation() {
    this.cancelNavigation();
    const controller = new AbortController();
    this.navigationController = controller;
    const context = this.shell.context;
    return { signal: controller.signal, current: () => !controller.signal.aborted && this.shell.context === context };
  }
  async openNavigationFile(file, signal) {
    const opening = { path: file.path, signal };
    this.navigationOpening = opening;
    try {
      await this.app.workspace.getLeaf(false).openFile(file);
      return true;
    } catch (error) {
      if (!signal.aborted) new import_obsidian.Notice(`\u65E0\u6CD5\u6253\u5F00\u51C6\u786E\u539F\u6587\uFF1A${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      if (this.navigationOpening === opening) this.navigationOpening = null;
    }
  }
  async openSnapshotSource(taskPath, source, sourceKind = "\u6765\u6E90", text2 = "") {
    var _a, _b;
    if (!taskPath) {
      new import_obsidian.Notice("producer\u672A\u63D0\u4F9B\u51C6\u786ETask ID");
      return;
    }
    if (!source) {
      await this.openTask(taskPath);
      return;
    }
    const request = this.beginNavigation();
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof import_obsidian.TFile) || file.path !== taskPath) {
      new import_obsidian.Notice(`\u672A\u627E\u5230\u4EFB\u52A1\u6587\u4EF6\uFF1A${taskPath}`);
      return;
    }
    let apiDetails = null;
    let location = { kind: "note", reason: "\u6765\u6E90\u65E0\u6CD5\u6838\u5BF9\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002" };
    try {
      const [api, fileText] = await Promise.all([this.plugin.loadTaskDetails(taskPath, request.signal), this.app.vault.cachedRead(file)]);
      apiDetails = api.details;
      location = locateTaskSource(fileText, api.details, { heading: sourceKind, level: 2, text: text2, source });
    } catch (error) {
      location = { kind: "note", reason: `\u6765\u6E90\u6838\u5BF9\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002` };
    }
    if (!request.current()) return;
    if (!await this.openNavigationFile(file, request.signal)) return;
    if (request.signal.aborted) return;
    if (location.kind === "note") {
      new import_obsidian.Notice(location.reason);
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!view || ((_a = view.file) == null ? void 0 : _a.path) !== taskPath || ((_b = view.getMode) == null ? void 0 : _b.call(view)) === "preview" || location.editorLine >= view.editor.lineCount()) {
      new import_obsidian.Notice("\u4EFB\u52A1\u5DF2\u6253\u5F00\uFF1B\u5F53\u524D\u89C6\u56FE\u4E0D\u80FD\u786E\u8BA4\u7CBE\u786E\u4F4D\u7F6E\uFF0C\u8BF7\u67E5\u770B\u539F\u6587\u3002");
      return;
    }
    if (apiDetails === null || typeof view.editor.getValue !== "function") {
      new import_obsidian.Notice("\u5F53\u524D\u7F16\u8F91\u5668\u4E0D\u80FD\u6838\u5BF9\u539F\u6587\uFF1B\u5DF2\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u3002");
      return;
    }
    location = locateTaskSource(view.editor.getValue(), apiDetails, { heading: sourceKind, level: 2, text: text2, source });
    if (location.kind === "note") {
      new import_obsidian.Notice(location.reason);
      return;
    }
    const position = { line: location.editorLine, ch: 0 };
    view.editor.setCursor(position);
    view.editor.scrollIntoView({ from: position, to: position }, true);
    view.editor.focus();
  }
  vaultLinkResolver(sourcePath) {
    return (linkText) => {
      var _a, _b, _c, _d;
      const candidates = [linkText, path5.posix.normalize(path5.posix.join(path5.posix.dirname(sourcePath), linkText))];
      for (const candidate of candidates) {
        const file = this.app.vault.getAbstractFileByPath(candidate);
        if (file instanceof import_obsidian.TFile && file.path === candidate) return file.path;
      }
      const { path: linkpath } = (0, import_obsidian.parseLinktext)(linkText);
      return (_d = (_c = (_b = (_a = this.app.metadataCache).getFirstLinkpathDest) == null ? void 0 : _b.call(_a, linkpath, sourcePath)) == null ? void 0 : _c.path) != null ? _d : null;
    };
  }
  async renderSourceMarkdown(text2, element, sourcePath) {
    const sources = collectMarkdownLinkSources(text2);
    let complete = false;
    element.addEventListener("click", (event) => {
      var _a, _b, _c;
      const anchor = (_b = (_a = event.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, "a");
      if (!anchor || !element.contains(anchor)) return;
      const href = anchor.getAttribute("data-href") || anchor.getAttribute("href");
      if (!href) return;
      const anchors = Array.from(element.querySelectorAll("a"));
      const origin = renderedLinkSource(sources, anchors.map((link) => {
        var _a2;
        return { href: link.getAttribute("data-href") || link.getAttribute("href") || "", label: (_a2 = link.textContent) != null ? _a2 : "" };
      }), anchors.indexOf(anchor), complete);
      if (origin === "wiki") return;
      const target = resolveRelatedTarget(href, { casePath: sourcePath, cwd: null, vaultRoot: this.plugin.vaultRoot(), resolveVaultLink: this.vaultLinkResolver(sourcePath) });
      const explicitFile = /^file:/i.test(href) || path5.isAbsolute(href);
      const literalHashFile = target.kind === "vault" && target.exactFile === true && ((_c = target.resolvedPath) == null ? void 0 : _c.includes("#"));
      if (target.kind === "vault" && !explicitFile && !literalHashFile || target.kind === "url") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void this.openRelated(href, sourcePath, origin === "markdown" ? void 0 : "\u94FE\u63A5\u8BED\u6CD5\u6765\u6E90\u65E0\u6CD5\u552F\u4E00\u6838\u5BF9\uFF1B\u8BF7\u67E5\u770B\u539F\u6587\u6216\u590D\u5236\u5F15\u7528\u3002");
    }, true);
    await import_obsidian.MarkdownRenderer.render(this.app, text2, element, sourcePath, this);
    complete = true;
  }
  async relatedContext(sourcePath, signal) {
    var _a, _b, _c, _d;
    const vaultRoot = this.plugin.vaultRoot();
    if (!isTaskPath(sourcePath)) {
      const active = this.caseAdapter.getRenderState();
      if (((_a = active == null ? void 0 : active.model) == null ? void 0 : _a.source.path) === sourcePath) return { casePath: sourcePath, cwd: active.model.workCase.cwd, vaultRoot };
      const model2 = createWorkCaseViewModel(await this.plugin.loadWorkCaseSnapshot(sourcePath, signal), sourcePath);
      return { casePath: sourcePath, cwd: model2.workCase.cwd, vaultRoot };
    }
    const api = await this.plugin.loadTaskDetails(sourcePath, signal);
    const contexts = (_b = api.contexts) != null ? _b : null;
    const candidates = contexts ? this.app.vault.getMarkdownFiles().filter((file) => ["work-case", "session"].includes(this.plugin.workCaseType(file)) && contexts.includes(`@${path5.basename(file.path, ".md")}`)) : [];
    const chosen = chooseTaskCase(contexts, candidates.map((file) => ({ path: file.path, contextTag: `@${path5.basename(file.path, ".md")}`, cwd: null })));
    if (!chosen.casePath) throw new Error((_c = chosen.reason) != null ? _c : "\u7F3A\u5C11\u552F\u4E00Case");
    const model = createWorkCaseViewModel(await this.plugin.loadWorkCaseSnapshot(chosen.casePath, signal), chosen.casePath);
    if (model.tasks.observationHealth !== "healthy" || !model.tasks.coverage.complete || !model.tasks.items.some((task) => task.id === sourcePath)) throw new Error("Case\u5173\u8054\u8BFB\u53D6\u4E0D\u5B8C\u6574\u6216\u672A\u786E\u8BA4\u51C6\u786ETask");
    const result = chooseTaskCase(contexts, [{ path: chosen.casePath, contextTag: model.tasks.contextTag, cwd: model.workCase.cwd }]);
    if (!result.cwd) throw new Error((_d = result.reason) != null ? _d : "Case cwd\u4E0D\u53EF\u7528");
    return { casePath: chosen.casePath, cwd: result.cwd, vaultRoot };
  }
  renderChildren(container, model, children) {
    var _a;
    const legacy = model.currentTask.trustLevel === "legacy_v3";
    const section2 = container.createDiv({ cls: "flowdesk-child-section" });
    const heading = section2.createDiv({ cls: "flowdesk-section-heading" });
    heading.createDiv({
      cls: "flowdesk-dashboard-section-title",
      text: `\u76F4\u63A5\u5B50\u4EFB\u52A1 \xB7 ${children.length}`
    });
    heading.createDiv({
      cls: "flowdesk-section-meta",
      text: `${children.filter((child) => !child.history).length} \u9879${legacy ? "\u672A\u5B8C\u6210" : "\u672A\u7ED3\u675F"}\u6216\u72B6\u6001\u672A\u77E5`
    });
    const list = section2.createDiv({ cls: "flowdesk-child-list" });
    const historical = children.filter((child) => child.history);
    let historyList = null;
    if (historical.length) {
      const history = section2.createEl("details", { cls: "flowdesk-task-history" });
      history.createEl("summary", { text: `${legacy ? "\u5DF2\u5B8C\u6210" : "\u5DF2\u7ED3\u675F"} \xB7 ${historical.length}` });
      historyList = history.createDiv({ cls: "flowdesk-child-list" });
    }
    for (const child of children) {
      const row = (child.history ? historyList : list).createDiv({
        cls: `flowdesk-child-row is-${child.tone}`,
        attr: { role: "button", tabindex: "0" }
      });
      row.createSpan({
        cls: `flowdesk-child-state-dot is-${child.tone}`,
        attr: { "aria-hidden": "true" }
      });
      const content = row.createDiv({ cls: "flowdesk-child-content" });
      content.createDiv({ cls: "flowdesk-child-title", text: child.title });
      content.createDiv({ cls: "flowdesk-child-summary", text: child.summary });
      content.createDiv({ cls: "flowdesk-child-meta", text: child.meta });
      row.createSpan({
        cls: `flowdesk-child-status is-${child.tone}`,
        text: child.status,
        attr: { title: ((_a = model.children.find((item) => item.id === child.id)) == null ? void 0 : _a.status) || "\u672A\u8BB0\u5F55" }
      });
      this.makeNavigable(row, () => this.openTask(child.id, "child"));
    }
  }
  renderDetails(container, model, summary, diagnosticGroups) {
    const diagnosticCount = diagnosticGroups.reduce(
      (total, group) => total + group.diagnostics.length,
      0
    );
    const details = container.createEl("details", {
      cls: "flowdesk-contract-summary"
    });
    details.open = this.disclosureState.summaryOpen;
    details.addEventListener("toggle", () => {
      this.disclosureState.summaryOpen = details.open;
    });
    const summaryToggle = details.createEl("summary");
    summaryToggle.createSpan({ text: "\u9700\u6C42\u4E0E\u8BB0\u5F55" });
    summaryToggle.createSpan({
      cls: "flowdesk-contract-diagnostic-count",
      text: `${diagnosticCount} \u9879\u8BCA\u65AD`
    });
    const overview = details.createDiv({ cls: "flowdesk-contract-overview" });
    const goal = overview.createDiv({ cls: "flowdesk-contract-goal" });
    goal.createDiv({ cls: "flowdesk-summary-label", text: "\u76EE\u6807" });
    goal.createDiv({ cls: "flowdesk-contract-goal-text", text: summary.goal });
    const full = overview.createEl("details", { cls: "flowdesk-technical-details" });
    full.open = this.disclosureState.fullOpen;
    full.addEventListener("toggle", () => {
      this.disclosureState.fullOpen = full.open;
    });
    full.createEl("summary", { text: "\u89C4\u683C\u4E0E\u4EA4\u4ED8\u8BE6\u60C5" });
    const body = full.createDiv({ cls: "flowdesk-detail-body" });
    const renderedSections = /* @__PURE__ */ new Map();
    const contract = createSection2(body, "\u4EFB\u52A1\u89C4\u683C\u4E0E\u8BB0\u5F55", "producer \u6295\u5F71");
    renderedSections.set("contract", contract);
    new TaskContentRenderer({
      renderMarkdown: (text2, element, taskPath) => this.renderSourceMarkdown(text2, element, taskPath),
      openSource: (taskPath, section2) => this.openSnapshotSource(taskPath, section2.source, section2.heading, section2.text)
    }).render(contract, model.content);
    this.renderRawTaskContent(contract, model);
    const continuation = contract.createDiv({ cls: "flowdesk-task-resume-reference" });
    continuation.createDiv({ cls: "flowdesk-muted", text: "Task\u53EF\u72EC\u7ACB\u7EE7\u7EED\uFF1B\u5F15\u7528\u4E0D\u521B\u5EFACase\u3001\u4E0D\u542F\u52A8\u5BBF\u4E3B\u3002\u5148\u7531\u539Fowner\u8BFB\u53D6\u6700\u65B0TaskNotes\u6B63\u6587\u3002" });
    const copyTask = continuation.createEl("button", { cls: "flowdesk-copy-task-reference", text: "\u590D\u5236Task\u5F15\u7528\u4E0E\u7EE7\u7EED\u6B65\u9AA4" });
    copyTask.addEventListener("click", () => {
      void navigator.clipboard.writeText(`\u51C6\u786ETask\uFF1A${model.currentTask.id}
\u5728\u539Fowner\u4F1A\u8BDD\u4F7F\u7528 work \u7EE7\u7EED\uFF1B\u5148\u8BFB\u6700\u65B0TaskNotes/snapshot\uFF0C\u533A\u5206\u5DF2\u505A\u7ED3\u679C\u4E0E\u672A\u5B8C\u6210Next\uFF0C\u907F\u514D\u91CD\u590D\u6267\u884C\u3002\u6362\u8F7D\u4F53\u524D\u5148\u4FDD\u5B58\u5E76\u56DE\u8BFB\u8FDB\u5C55\u5E76\u6B63\u5E38\u505C\u6B62\u65E7\u6267\u884C\u4E0E\u5DF2\u77E5\u540E\u53F0\u5DE5\u4F5C\uFF1B\u91CA\u653E\u672A\u77E5\u65F6\u53EA\u8BFB\u6216\u56DE\u539Fowner\u3002`);
    });
    const observation = createSection2(
      body,
      "\u89C2\u5BDF\u4E0E\u6765\u6E90",
      model.observation.isTrustworthy ? "\u5065\u5EB7" : "\u9700\u68C0\u67E5",
      `flowdesk-observation-summary ${model.observation.isTrustworthy ? "is-healthy" : "is-warning"}`
    );
    renderedSections.set("observation", observation);
    observation.createDiv({
      cls: "flowdesk-observation-copy",
      text: model.observation.trustMessage
    });
    const observationChips = observation.createDiv({
      cls: "flowdesk-contract-chip-row"
    });
    observationChips.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.observation.currentTask === "observed" ? "Task \u5DF2\u8BFB\u53D6" : "Task \u672A\u786E\u8BA4"
    });
    observationChips.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.observation.parent === "not_applicable" ? "\u65E0\u7236\u4EFB\u52A1" : model.observation.parent === "observed" ? "\u7236\u4EFB\u52A1\u5DF2\u8BFB\u53D6" : "\u7236\u4EFB\u52A1\u672A\u786E\u8BA4"
    });
    observationChips.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.observation.children === "observed" ? model.currentTask.hasChildren ? "\u5B50\u4EFB\u52A1\u5DF2\u8BFB\u53D6" : "\u65E0\u5B50\u4EFB\u52A1" : "\u5B50\u4EFB\u52A1\u672A\u786E\u8BA4"
    });
    observationChips.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.observation.sourceIdentity === true ? "\u6765\u6E90\u4E00\u81F4" : "\u6765\u6E90\u5F85\u786E\u8BA4"
    });
    const observationDetails = observation.createEl("details", {
      cls: "flowdesk-observation-details"
    });
    observationDetails.open = this.disclosureState.observationOpen;
    observationDetails.addEventListener("toggle", () => {
      this.disclosureState.observationOpen = observationDetails.open;
    });
    observationDetails.createEl("summary", { text: "\u67E5\u770B 6 \u4E2A\u6280\u672F\u5B57\u6BB5" });
    const observationGrid = observationDetails.createDiv({
      cls: "flowdesk-observation-grid"
    });
    observationField(observationGrid, "\u5F53\u524D\u4EFB\u52A1", model.observation.currentTask);
    observationField(observationGrid, "\u7236\u4EFB\u52A1", model.observation.parent);
    observationField(observationGrid, "\u76F4\u63A5\u5B50\u4EFB\u52A1", model.observation.children);
    observationField(observationGrid, "TaskNotes API", model.observation.tasknotesApi);
    observationField(
      observationGrid,
      "\u6765\u6E90\u8EAB\u4EFD",
      model.observation.sourceIdentity === true ? "match" : model.observation.sourceIdentity === false ? "mismatch" : "unknown"
    );
    observationField(
      observationGrid,
      "\u6570\u636E\u9648\u65E7",
      model.observation.isStale ? "true" : "false"
    );
    const activeDiagnosticKeys = [];
    const diagnosticKeyOccurrences = /* @__PURE__ */ new Map();
    if (diagnosticGroups.length) {
      const diagnostics = body.createEl("details", {
        cls: "flowdesk-dashboard-section flowdesk-diagnostics-section"
      });
      diagnostics.open = this.disclosureState.technicalDiagnosticsOpen;
      diagnostics.addEventListener("toggle", () => {
        this.disclosureState.technicalDiagnosticsOpen = diagnostics.open;
      });
      const diagnosticsSummary = diagnostics.createEl("summary", {
        cls: "flowdesk-contract-section-head"
      });
      diagnosticsSummary.createSpan({
        cls: "flowdesk-dashboard-section-title",
        text: "\u6280\u672F\u8BCA\u65AD"
      });
      diagnosticsSummary.createSpan({
        cls: "flowdesk-contract-section-meta",
        text: `${diagnosticCount} \u9879`
      });
      renderedSections.set("diagnostics", diagnostics);
      for (const group of diagnosticGroups) {
        const groupContainer = diagnostics.createDiv({
          cls: `flowdesk-diagnostic-task-group is-${group.kind}`
        });
        const groupHeader = groupContainer.createDiv({
          cls: "flowdesk-diagnostic-task-head"
        });
        groupHeader.createSpan({
          cls: "flowdesk-diagnostic-task-kind",
          text: group.kind === "current" ? "\u5F53\u524D\u4EFB\u52A1" : "\u76F4\u63A5\u5B50\u4EFB\u52A1"
        });
        if (group.kind === "child") {
          const taskLink = groupHeader.createEl("button", {
            cls: "flowdesk-diagnostic-task-link",
            text: group.taskTitle,
            attr: { title: `\u5728\u65B0\u6807\u7B7E\u6253\u5F00\uFF1A${group.taskTitle}` }
          });
          taskLink.addEventListener("click", () => {
            void this.openTask(group.taskId, "child");
          });
        } else {
          groupHeader.createSpan({
            cls: "flowdesk-diagnostic-task-title",
            text: group.taskTitle
          });
        }
        groupHeader.createSpan({
          cls: `flowdesk-diagnostic-task-status is-${group.tone}`,
          text: `${group.status} \xB7 ${group.diagnostics.length} \u9879`
        });
        group.diagnostics.forEach((diagnostic) => {
          var _a, _b;
          const baseKey = createDiagnosticDisclosureKey(
            group.taskId,
            diagnostic.diagnostic
          );
          const occurrence = (_a = diagnosticKeyOccurrences.get(baseKey)) != null ? _a : 0;
          diagnosticKeyOccurrences.set(baseKey, occurrence + 1);
          const disclosureKey = occurrence ? `${baseKey}#${occurrence + 1}` : baseKey;
          activeDiagnosticKeys.push(disclosureKey);
          const item = groupContainer.createEl("details", {
            cls: "flowdesk-diagnostic-issue"
          });
          item.open = resolveDiagnosticDisclosureOpen(
            this.disclosureState,
            disclosureKey
          );
          item.addEventListener("toggle", () => {
            this.disclosureState.diagnosticOpen[disclosureKey] = item.open;
          });
          const itemHead = item.createEl("summary", {
            cls: "flowdesk-diagnostic-issue-summary"
          });
          itemHead.createSpan({
            cls: `flowdesk-diagnostic-severity is-${diagnostic.diagnostic.severity}`,
            attr: { "aria-hidden": "true" }
          });
          itemHead.createSpan({
            cls: "flowdesk-diagnostic-action",
            text: diagnostic.title
          });
          const diagnosticLink = itemHead.createEl("button", {
            cls: "flowdesk-diagnostic-source",
            text: `${diagnostic.sourceLabel} \u2197`
          });
          diagnosticLink.addEventListener("click", (event) => {
            event.stopPropagation();
            void this.openDiagnosticLocation(diagnostic.diagnostic);
          });
          const copyProblem = itemHead.createEl("button", {
            cls: "flowdesk-copy-problem",
            text: "\u590D\u5236\u95EE\u9898",
            attr: { "aria-label": "\u590D\u5236\u95EE\u9898" }
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
              location: diagnostic.machine.location
            });
          });
          const itemBody = item.createDiv({ cls: "flowdesk-diagnostic-item-body" });
          diagnosticRow(itemBody, "\u5B9E\u9645", diagnostic.actual);
          diagnosticRow(itemBody, "\u4FEE\u590D", diagnostic.remediation);
          const supporting = itemBody.createEl("details", {
            cls: "flowdesk-diagnostic-supporting-details flowdesk-machine-details"
          });
          supporting.open = (_b = this.disclosureState.diagnosticSupportingOpen[disclosureKey]) != null ? _b : false;
          supporting.addEventListener("toggle", () => {
            this.disclosureState.diagnosticSupportingOpen[disclosureKey] = supporting.open;
          });
          supporting.createEl("summary", { text: "\u67E5\u770B\u9884\u671F\u4E0E\u673A\u5668\u5B57\u6BB5" });
          diagnosticRow(supporting, "\u9884\u671F", diagnostic.expected);
          diagnosticRow(supporting, "\u9519\u8BEF\u7801", diagnostic.machine.code);
          diagnosticRow(supporting, "\u5B57\u6BB5", diagnostic.machine.path);
        });
      }
    }
    reconcileDiagnosticDisclosureState(
      this.disclosureState,
      activeDiagnosticKeys
    );
    for (const sectionName of resolveDetailSectionOrder(diagnosticCount > 0)) {
      const section2 = renderedSections.get(sectionName);
      if (section2) body.appendChild(section2);
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
  async openTask(taskPath, origin = "current") {
    if (!taskPath) return;
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice(`\u672A\u627E\u5230\u4EFB\u52A1\u6587\u4EF6\uFF1A${taskPath}`);
      return;
    }
    await this.app.workspace.getLeaf(taskNavigationLeafType(origin)).openFile(file);
  }
  async openCaseSource(casePath, source) {
    var _a, _b, _c;
    const request = this.beginNavigation(), file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof import_obsidian.TFile) || file.path !== casePath) {
      new import_obsidian.Notice(`\u672A\u627E\u5230Work Case\u6587\u4EF6\uFF1A${casePath}`);
      return;
    }
    let text2;
    try {
      text2 = await this.app.vault.cachedRead(file);
    } catch (error) {
      if (!request.current()) return;
      const opened = await this.openNavigationFile(file, request.signal);
      if (opened && !request.signal.aborted) new import_obsidian.Notice(`Case\u6765\u6E90\u8BFB\u53D6\u5931\u8D25\uFF0C\u4EC5\u6253\u5F00\u6574\u5F20\u539F\u6587\uFF1A${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!request.current()) return;
    if (!await this.openNavigationFile(file, request.signal)) return;
    if (request.signal.aborted) return;
    const lines = text2.replace(/\r\n/g, "\n").split("\n");
    const model = (_a = this.caseAdapter.getRenderState()) == null ? void 0 : _a.model;
    const blocks = model ? [...Object.values(model.sections).flat(), ...model.current.raw ? [model.current.raw] : [], ...model.recentProgress] : [];
    const expected = blocks.find((block) => block.source.lineStart === source.lineStart && block.source.lineEnd === source.lineEnd);
    const validRange = Number.isInteger(source.lineStart) && source.lineStart >= 1 && Number.isInteger(source.lineEnd) && source.lineEnd >= source.lineStart && source.lineEnd <= lines.length;
    const span = validRange ? lines.slice(source.lineStart - 1, source.lineEnd).join("\n") : "";
    if (!validRange || !expected || !span.includes(expected.text.replace(/\r\n/g, "\n"))) {
      new import_obsidian.Notice("Case\u6765\u6E90\u5DF2\u53D8\u5316\u6216\u8D8A\u754C\uFF1B\u5DF2\u6253\u5F00\u6574\u5F20Case\u539F\u6587\u3002");
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!view || ((_b = view.file) == null ? void 0 : _b.path) !== casePath || ((_c = view.getMode) == null ? void 0 : _c.call(view)) === "preview" || source.lineStart - 1 >= view.editor.lineCount()) {
      new import_obsidian.Notice("Case\u5DF2\u6253\u5F00\uFF1B\u5F53\u524D\u89C6\u56FE\u65E0\u6CD5\u786E\u8BA4\u7CBE\u786E\u4F4D\u7F6E\u3002");
      return;
    }
    const liveLines = view.editor.getValue().replace(/\r\n/g, "\n").split("\n");
    const liveSpan = liveLines.slice(source.lineStart - 1, source.lineEnd).join("\n");
    if (source.lineEnd > liveLines.length || expected && !liveSpan.includes(expected.text.replace(/\r\n/g, "\n"))) {
      new import_obsidian.Notice("Case\u7F16\u8F91\u5668\u539F\u6587\u5DF2\u53D8\u5316\uFF1B\u4E0D\u731C\u4F4D\u7F6E\u3002");
      return;
    }
    const position = { line: source.lineStart - 1, ch: 0 };
    view.editor.setCursor(position);
    view.editor.scrollIntoView({ from: position, to: position }, true);
    view.editor.focus();
  }
  async openRelated(raw, sourcePath, sourceError) {
    var _a, _b, _c, _d, _e;
    const request = this.beginNavigation();
    let context = { casePath: sourcePath, cwd: null, vaultRoot: this.plugin.vaultRoot(), resolveVaultLink: this.vaultLinkResolver(sourcePath) };
    let target = sourceError ? { kind: "unavailable", label: raw, reason: sourceError } : resolveRelatedTarget(raw, context);
    if (target.kind === "unavailable" && target.reason.includes("cwd") || !isTaskPath(sourcePath) && target.kind === "repository") {
      try {
        context = { ...await this.relatedContext(sourcePath, request.signal), resolveVaultLink: this.vaultLinkResolver(sourcePath) };
        target = resolveRelatedTarget(raw, context);
      } catch (error) {
        target = { kind: "unavailable", label: raw, reason: error instanceof Error ? error.message : String(error) };
      }
    }
    if (!request.current()) return;
    if (target.kind === "url") {
      window.open(target.url, "_blank");
      return;
    }
    if (target.kind === "vault") {
      const destination = (_a = target.resolvedPath) != null ? _a : this.vaultLinkResolver(sourcePath)(target.linkText);
      const baseFile = destination ? this.app.vault.getAbstractFileByPath(destination) : null;
      if (!(baseFile instanceof import_obsidian.TFile) || target.exactFile && baseFile.path !== target.resolvedPath) {
        target = { kind: "unavailable", label: target.label, reason: `\u672A\u627E\u5230\u5DF2\u786E\u8BA4\u7684vault\u539F\u6587\u4EF6\uFF1A${target.linkText}\uFF1B\u4E0D\u4F1A\u521B\u5EFA\u6216\u6539\u9009\u540C\u540D\u7B14\u8BB0\u3002` };
      } else if (baseFile.extension.toLowerCase() === "json") {
        const fragment = (_b = target.fragment) != null ? _b : target.exactFile ? void 0 : (0, import_obsidian.parseLinktext)(target.linkText).subpath || void 0;
        target = { ...target, resolvedPath: baseFile.path, ...fragment ? { fragment } : {} };
      } else {
        const directFile = target.exactFile === true && (((_c = target.resolvedPath) == null ? void 0 : _c.includes("#")) || target.resolvedPath && target.resolvedPath !== target.resolvedPath.trim() || target.fileUrl && (!target.fragment || ((_d = target.resolvedPath) == null ? void 0 : _d.includes("%"))));
        if (directFile) {
          await this.openNavigationFile(baseFile, request.signal);
          if (!target.fragment) return;
        } else {
          await this.app.workspace.openLinkText(target.linkText, sourcePath, false);
          return;
        }
      }
    }
    (_e = this.relatedTargetPanel) == null ? void 0 : _e.remove();
    const panel = this.contentEl.createDiv({ cls: "flowdesk-dashboard-section flowdesk-related-target" });
    this.relatedTargetPanel = panel;
    const isFileTarget = target.kind === "repository" || target.kind === "vault";
    const pathText = target.kind === "repository" ? target.absolutePath : target.kind === "vault" && target.resolvedPath ? path5.join(context.vaultRoot, target.resolvedPath) : raw;
    panel.createDiv({ cls: "flowdesk-dashboard-section-title", text: isFileTarget ? "\u5F15\u7528\u8D44\u6599" : "\u5F15\u7528\u5B9A\u4F4D\u7F3A\u53E3" });
    panel.createDiv({ cls: "flowdesk-muted", text: target.kind === "repository" ? `\u539F\u6587\u4EF6\uFF1A${pathText}\uFF1B\u4ED3\u5E93\u5F15\u7528\uFF1A${target.repositoryPath}` : target.kind === "vault" ? `\u539F\u6587\u4EF6\uFF1A${pathText}` : target.reason });
    if ((target.kind === "repository" || target.kind === "vault") && target.fragment) panel.createDiv({ cls: "flowdesk-muted", text: `\u6587\u4EF6\u53EF\u5B9A\u4F4D\uFF0C\u7AE0\u8282\u672A\u9A8C\u8BC1\uFF08${target.fragment}\uFF09\uFF1B\u6253\u5F00\u6574\u6587\u4EF6\uFF0C\u4E0D\u731C\u7AE0\u8282\u4F4D\u7F6E\u3002` });
    const copy = panel.createEl("button", { cls: "flowdesk-copy-related-path", text: isFileTarget ? "\u590D\u5236\u539F\u6587\u4EF6\u8DEF\u5F84" : "\u590D\u5236\u539F\u5F15\u7528" });
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(pathText);
    });
    if (isFileTarget) {
      const reference = panel.createEl("button", { cls: "flowdesk-copy-related-reference", text: "\u590D\u5236\u539F\u5F15\u7528" });
      reference.addEventListener("click", () => {
        void navigator.clipboard.writeText(raw);
      });
    }
    if (target.kind === "repository" && /\.md$/i.test(path5.extname(target.absolutePath))) {
      const documentPath = target.absolutePath;
      const result = panel.createDiv({ cls: "flowdesk-repository-open-feedback", attr: { role: "status" }, text: "\u70B9\u51FB\u540E\u5411 Obsidian \u63D0\u4EA4\u6253\u5F00\u6B64\u539F\u6587\u4EF6\u7684\u8BF7\u6C42\u3002" });
      const openDocument = panel.createEl("button", { cls: "flowdesk-open-repository-document", text: "\u5728 Obsidian \u6253\u5F00\u6587\u6863", attr: { "aria-label": "\u660E\u786E\u5411\u6307\u5B9AObsidian\u63D0\u4EA4\u6B64Markdown\u539F\u6587\u4EF6" } });
      openDocument.addEventListener("click", async () => {
        if (openDocument.disabled) return;
        openDocument.disabled = true;
        result.setText("\u6B63\u5728\u63D0\u4EA4\u6253\u5F00\u8BF7\u6C42\u2026");
        try {
          const outcome = await this.plugin.openRepositoryMarkdown(documentPath);
          result.setText(outcome.message);
        } catch (e) {
          result.setText("\u6253\u5F00\u8BF7\u6C42\u7ED3\u679C\u672A\u77E5\uFF1B\u8BF7\u6838\u5BF9\u539F\u6587\u4EF6\uFF0C\u4FDD\u7559\u590D\u5236\u8DEF\u5F84\uFF0C\u4E0D\u81EA\u52A8\u91CD\u8BD5\u3002");
        } finally {
          openDocument.disabled = false;
        }
      });
      const steps = `${pathText}
\u5728Obsidian\u547D\u4EE4\u9762\u677F\u9009\u62E9 Open file from outside the vault\u2026\uFF0C\u9009\u62E9\u6B64\u8DEF\u5F84\u5BF9\u5E94\u7684\u539F\u6587\u4EF6\u3002`;
      panel.createDiv({ cls: "flowdesk-muted", text: steps });
      const copySteps = panel.createEl("button", { text: "\u590D\u5236\u6253\u5F00\u6B65\u9AA4" });
      copySteps.addEventListener("click", () => {
        void navigator.clipboard.writeText(steps);
      });
    } else if (isFileTarget && /\.json$/i.test(path5.extname(pathText))) {
      panel.createDiv({ cls: "flowdesk-muted", text: "JSON\u8D44\u6599\u4EC5\u63D0\u4F9B\u51C6\u786E\u8DEF\u5F84\u4E0E\u539F\u5F15\u7528\uFF1B\u53EF\u901A\u8FC7\u5173\u8054\u7684Markdown\u8BC1\u636E\u7D22\u5F15\u67E5\u770B\u8BF4\u660E\u3002" });
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
    new import_obsidian.Setting(containerEl).setName("FlowDesk \u4ED3\u5E93\u8DEF\u5F84").setDesc("\u672C\u5730 FlowDesk-Plugin \u4ED3\u5E93\u8DEF\u5F84\u3002").addText(
      (text2) => text2.setPlaceholder("/Users/me/workspaces/flowdesk-plugin").setValue(this.plugin.settings.flowdeskRoot).onChange(async (value) => {
        this.plugin.settings.flowdeskRoot = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5DE5\u4F5C\u76EE\u5F55").setDesc("\u4F20\u7ED9 --working-directory\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528 FlowDesk \u4ED3\u5E93\u8DEF\u5F84\u3002").addText(
      (text2) => text2.setValue(this.plugin.settings.workingDirectory).onChange(async (value) => {
        this.plugin.settings.workingDirectory = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("TaskNotes API \u5730\u5740").setDesc("\u53EF\u9009\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528\u73AF\u5883\u53D8\u91CF TASKNOTES_API_URL \u6216\u672C\u673A\u9ED8\u8BA4\u5730\u5740\u3002").addText(
      (text2) => text2.setPlaceholder("http://127.0.0.1:18090").setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
        this.plugin.settings.apiUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    const environmentSetting = new import_obsidian.Setting(containerEl).setName("TaskNotes \u73AF\u5883\u53D8\u91CF\uFF08JSON\uFF09").setDesc("\u586B\u5199 JSON \u5BF9\u8C61\uFF0C\u503C\u4F7F\u7528\u5B57\u7B26\u4E32\u3002\u9010\u9879\u5408\u5E76\u5230\u672C\u6B21\u6267\u884C\u73AF\u5883\uFF0C\u4FDD\u7559\u672A\u914D\u7F6E\u7684\u73B0\u6709\u53D8\u91CF\uFF0C\u540C\u540D\u53D8\u91CF\u6309 JSON \u66F4\u65B0\u3002");
    const environmentError = environmentSetting.descEl.createDiv({ attr: { role: "status" } });
    environmentSetting.addTextArea((text2) => {
      text2.inputEl.rows = 5;
      text2.inputEl.cols = 38;
      text2.inputEl.spellcheck = false;
      text2.setPlaceholder('{\n  "TASKNOTES_API_TOKEN": "your-token"\n}').setValue(this.plugin.settings.tasknotesEnv).onChange(async (value) => {
        try {
          resolveTaskNotesAuth(value);
        } catch (error) {
          environmentError.setText(`${error instanceof Error ? error.message : "\u73AF\u5883\u53D8\u91CF\u914D\u7F6E\u65E0\u6548"} \u5C1A\u672A\u4FDD\u5B58\u3002`);
          return;
        }
        environmentError.setText("");
        this.plugin.settings.tasknotesEnv = value.trim() || "{}";
        await this.plugin.saveSettings();
      });
    });
  }
};
function createSection2(container, title, meta = "", className = "") {
  const section2 = container.createDiv({
    cls: `flowdesk-dashboard-section ${className}`.trim()
  });
  const heading = section2.createDiv({ cls: "flowdesk-contract-section-head" });
  heading.createDiv({ cls: "flowdesk-dashboard-section-title", text: title });
  if (meta) {
    heading.createDiv({ cls: "flowdesk-contract-section-meta", text: meta });
  }
  return section2;
}
function diagnosticRow(container, label, value) {
  const row = container.createDiv({ cls: "flowdesk-diagnostic-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}\uFF1A` });
  row.createSpan({ text: value });
}
function observationField(container, label, value) {
  const cell = container.createDiv({ cls: "flowdesk-observation-cell" });
  cell.createDiv({ cls: "flowdesk-summary-label", text: label });
  cell.createDiv({ cls: "flowdesk-observation-value", text: value });
}
function taskTitleFromPath(taskPath) {
  return path5.basename(taskPath, path5.extname(taskPath));
}
function expandHomePath(value) {
  if (value === "~") return (0, import_os.homedir)();
  if (value.startsWith("~/")) return path5.join((0, import_os.homedir)(), value.slice(2));
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
function formatWorkCaseCommandError(error) {
  const failure = error;
  const stderr = typeof failure.stderr === "string" ? failure.stderr.trim() : "";
  const stdout = typeof failure.stdout === "string" ? failure.stdout.trim() : "";
  const message = error instanceof Error ? error.message : String(error);
  return `Work Case snapshot \u547D\u4EE4\u5931\u8D25\uFF1A${stderr || stdout || message}`;
}
function observationFirstLine(observation) {
  var _a;
  return (observation == null ? void 0 : observation.error) ? "" : (_a = observation == null ? void 0 : observation.details.split(/\r?\n/)[0]) != null ? _a : "";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FLOWDESK_DASHBOARD_VIEW_TYPE
});
