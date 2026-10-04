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
var import_obsidian2 = require("obsidian");
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
var import_os = require("os");
var path6 = __toESM(require("path"));
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
async function readTaskDetails({ taskPath, apiUrl, auth, signal, transport }) {
  const fail = (message, code = "tasknotes_read_invalid") => {
    throw Object.assign(new Error(formatTaskNotesAuthError(message, auth.token)), { code });
  };
  const checkCancelled = () => {
    if (signal.aborted) throw Object.assign(new Error("TaskNotes \u539F\u6587\u8BFB\u53D6\u5DF2\u53D6\u6D88"), { name: "AbortError", code: "ABORT_ERR" });
  };
  checkCancelled();
  let response;
  try {
    response = await transport({
      url: `${apiUrl.replace(/\/+$/, "")}/api/tasks/${encodeURIComponent(taskPath)}`,
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
      signal
    });
  } catch (error) {
    checkCancelled();
    return fail(`TaskNotes \u539F\u6587\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  checkCancelled();
  const raw = response.text;
  const ok = response.status >= 200 && response.status < 300;
  let value;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    if (ok) return fail("TaskNotes \u539F\u6587\u54CD\u5E94\u4E0D\u662F\u6709\u6548 JSON");
  }
  if (!ok) {
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

// src/tasknotes-desktop-http.ts
var import_http = require("http");
var import_https = require("https");
var desktopTaskNotesRead = ({ url, headers, signal }) => {
  if (signal.aborted) return Promise.reject(Object.assign(new Error("TaskNotes \u539F\u6587\u8BFB\u53D6\u5DF2\u53D6\u6D88"), { name: "AbortError", code: "ABORT_ERR" }));
  return new Promise((resolve6, reject) => {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      reject(new Error("TaskNotes API \u5730\u5740\u5FC5\u987B\u4F7F\u7528 HTTP/HTTPS"));
      return;
    }
    if (target.username || target.password) {
      reject(new Error("TaskNotes API \u5730\u5740\u4E0D\u80FD\u5305\u542B\u5185\u5D4C\u51ED\u636E"));
      return;
    }
    const request = target.protocol === "https:" ? import_https.request : import_http.request;
    const pending = request(target, {
      method: "GET",
      headers: { ...headers, "Accept-Encoding": "identity" },
      signal,
      agent: false
    }, (response) => {
      var _a, _b;
      response.once("error", reject);
      response.once("aborted", () => reject(new Error("TaskNotes \u54CD\u5E94\u672A\u5B8C\u6574\u7ED3\u675F")));
      const status = (_a = response.statusCode) != null ? _a : 0;
      const statusText = (_b = response.statusMessage) != null ? _b : "";
      if (status >= 300 && status < 400) {
        resolve6({ status, statusText, text: "" });
        response.destroy();
        return;
      }
      const encoding = response.headers["content-encoding"];
      if (encoding && encoding.trim().toLowerCase() !== "identity") {
        reject(new Error("TaskNotes Content-Encoding \u4E0D\u53D7\u652F\u6301\uFF08\u53EA\u63A5\u53D7 identity\uFF09"));
        response.destroy();
        return;
      }
      response.setEncoding("utf8");
      let text2 = "";
      response.on("data", (chunk) => {
        text2 += chunk;
      });
      response.once("end", () => {
        if (!response.complete) {
          reject(new Error("TaskNotes \u54CD\u5E94\u672A\u5B8C\u6574\u7ED3\u675F"));
          return;
        }
        resolve6({ status, statusText, text: text2 });
      });
    });
    pending.once("error", reject);
    pending.end();
  });
};

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

// src/reading-presentation.ts
var encoder = new TextEncoder();
var utf8Bytes = (text2) => encoder.encode(text2).length;
function excerpt(text2, maxBytes = 400) {
  const value = text2.trim();
  if (utf8Bytes(value) <= maxBytes) return value;
  let out = "", bytes = 0;
  for (const ch of value) {
    const n = utf8Bytes(ch);
    if (bytes + n > maxBytes) break;
    out += ch;
    bytes += n;
  }
  return out + "\u2026\uFF08\u6458\u5F55\uFF0C\u5168\u6587\u89C1\u539F\u6587\uFF09";
}
function firstParagraph(text2) {
  return text2.trim().split(/\r?\n\s*\r?\n/)[0] || "";
}
function formatDisplayTime(value, now = /* @__PURE__ */ new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return value || "\u65F6\u95F4\u672A\u8BB0\u5F55";
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return value;
  const fmt = (date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const rendered = fmt(time), today = fmt(now).slice(0, 10), yesterday = fmt(new Date(now.getTime() - 864e5)).slice(0, 10);
  const day = rendered.slice(0, 10);
  return `${day === today ? "\u4ECA\u5929" : day === yesterday ? "\u6628\u5929" : day.replace(/-/g, "/")} ${rendered.slice(-5)}`;
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
  if (sections.length !== 1) return unknown(sections.length ? "Progress \u6BB5\u4E0D\u552F\u4E00\uFF1B\u5F53\u524D\u8FDB\u5C55 unknown\u3002" : "snapshot \u672A\u63D0\u4F9B\u5B8C\u6574 canonical Progress\uFF1B\u53EF\u67E5\u770B\u4EFB\u52A1\u539F\u6587\u4EF6\u3002");
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

// src/task-overview.ts
function latestRecord(records) {
  var _a, _b;
  if (!records.length) return null;
  if (records.length === 1) return records[0];
  if (records.some((r) => {
    var _a2, _b2;
    return !Number.isInteger((_a2 = r.source) == null ? void 0 : _a2.line_start) || Number((_b2 = r.source) == null ? void 0 : _b2.line_start) < 1;
  })) return null;
  const ordered = [...records].sort((a, b) => Number(a.source.line_start) - Number(b.source.line_start));
  if (((_a = ordered[ordered.length - 1].source) == null ? void 0 : _a.line_start) === ((_b = ordered[ordered.length - 2].source) == null ? void 0 : _b.line_start)) return null;
  return ordered[ordered.length - 1];
}
function renderTaskOverview(container, model, dependencies) {
  const healthy = model.observation.isTrustworthy && !model.observation.isStale;
  const current = createTaskCurrentProgress(model.content, { statusIsCompleted: model.currentTask.statusIsCompleted, observedAt: model.observation.generatedAt, observationHealthy: healthy && !model.diagnostics.some((d) => /truncat|body_omitted|progress_omitted|response_too_large/i.test(d.code)) });
  const card = container.createDiv({ cls: "flowdesk-task-overview flowdesk-dashboard-section" });
  card.createDiv({ cls: "flowdesk-dashboard-section-title", text: model.currentTask.statusIsCompleted === true ? "\u7ED3\u679C\u6982\u89C8" : model.currentTask.isBlocked ? "\u5F53\u524D\u5DE5\u4F5C \xB7 \u6709\u963B\u585E" : "\u5F53\u524D\u5DE5\u4F5C" });
  const markdown = (parent, text2, cls, field) => {
    const el = parent.createDiv({ cls: `${cls} markdown-rendered`, attr: field ? { "data-current-field": field } : {} });
    void dependencies.renderMarkdown(text2, el, model.currentTask.id).catch(() => el.setText(text2));
  };
  if (model.currentTask.hasChildren) card.createDiv({ cls: "flowdesk-overview-rollup", text: `\u76F4\u63A5\u5B50\u4EFB\u52A1\uFF1A\u6210\u529F ${model.rollup.childrenTrustedDone}/${model.children.length} \xB7 \u5DF2\u7ED3\u675F ${model.children.filter((c) => c.subtreeTerminal === true).length}/${model.children.length}${model.children.some((c) => c.subtreeTerminal === null) ? " \xB7 \u542B\u672A\u77E5\u72B6\u6001" : ""}` });
  if (!healthy) card.createDiv({ cls: "flowdesk-overview-gap", text: "\u5F53\u524D\u89C2\u6D4B\u4E0D\u5B8C\u6574\u6216\u5DF2\u8FC7\u671F\uFF1B\u4EE5\u4E0B\u5185\u5BB9\u4EC5\u4F9B\u67E5\u9605\uFF0C\u5237\u65B0\u540E\u518D\u5224\u65AD\u5F53\u524D\u5DE5\u4F5C\u3002" });
  if (model.currentTask.statusIsCompleted === true) {
    for (const [kind, label, records] of [["result", "\u6267\u884C\u7ED3\u679C\u6458\u5F55", model.content.records.execution], ["verification", "\u9A8C\u8BC1\u8BB0\u5F55\u6458\u5F55", model.content.records.verification]]) {
      const row = card.createDiv({ cls: `flowdesk-overview-${kind}` });
      row.createDiv({ cls: "flowdesk-summary-label", text: label });
      const record3 = latestRecord(records);
      if (record3) {
        markdown(row, excerpt(firstParagraph(record3.text)), "flowdesk-overview-excerpt");
        if (record3.timestamp) row.createDiv({ cls: "flowdesk-muted", text: `\u8BB0\u5F55\u65F6\u95F4\uFF1A${formatDisplayTime(record3.timestamp)}`, attr: { title: record3.timestamp } });
      } else row.createDiv({ cls: "flowdesk-muted", text: records.length ? "\u65E0\u6CD5\u786E\u8BA4\u6700\u8FD1\u4E00\u8F6E\uFF1B\u8BF7\u5C55\u5F00\u5DE5\u4F5C\u8BB0\u5F55\u3002" : "\u672A\u63D0\u4F9B\u8BB0\u5F55\uFF1B\u53EF\u8BFB\u53D6 API \u539F\u6587\u3002" });
    }
    card.createDiv({ cls: "flowdesk-muted", text: "\u5B8C\u6210\u65F6\u95F4\uFF1A\u672A\u63D0\u4F9B\u51C6\u786E\u5B57\u6BB5\uFF1B\u8BB0\u5F55\u65F6\u95F4\u72EC\u7ACB\u663E\u793A\u3002\u9A8C\u8BC1\u6458\u5F55\u4E0D\u4EE3\u8868\u65B0\u589E\u9A8C\u6536\u7ED3\u8BBA\u3002" });
  } else {
    const progress = card.createDiv({ cls: "flowdesk-overview-progress" });
    if (current.progress) markdown(progress, excerpt(firstParagraph(current.progress)), "flowdesk-overview-excerpt");
    else progress.createDiv({ cls: "flowdesk-muted", text: "\u5F53\u524D\u8FDB\u5C55\u672A\u786E\u8BA4\uFF0C\u8BF7\u67E5\u770B\u8BB0\u5F55\u6216\u8BFB\u53D6 API \u539F\u6587\u3002" });
    if (current.next !== null) {
      const next = card.createDiv({ cls: "flowdesk-overview-next" });
      next.createDiv({ cls: "flowdesk-summary-label", text: "\u4E0B\u4E00\u6B65" });
      markdown(next, excerpt(current.next), "flowdesk-overview-excerpt");
    }
    if (model.currentTask.isBlocked) card.createDiv({ cls: "flowdesk-overview-gap", text: `TaskNotes \u6807\u8BB0\u4E3A\u963B\u585E${model.currentTask.blockedBy.length ? `\uFF1B\u5173\u8054\uFF1A${model.currentTask.blockedBy.join("\u3001")}` : ""}` });
  }
  const progressPanel = card.createDiv({ cls: "flowdesk-task-current-progress" });
  const record2 = progressPanel.createEl("details", { cls: "flowdesk-overview-history", attr: { "data-disclosure-key": "overview-progress" } });
  record2.createEl("summary", { text: current.status === "historical" ? "\u6700\u8FD1 Progress\uFF08\u5386\u53F2\uFF09" : current.status === "current" ? "\u67E5\u770B\u5B8C\u6574\u8FDB\u5C55\u4E0E\u4E0B\u4E00\u6B65" : current.progress ? "Progress \u7247\u6BB5\uFF08\u5F53\u524D\u6027\u672A\u786E\u8BA4\uFF09" : "\u5F53\u524D Progress\uFF1Aunknown" });
  if (current.timestamp) record2.createDiv({ cls: "flowdesk-muted", text: `\u4E8B\u4EF6\u65F6\u95F4\uFF1A${formatDisplayTime(current.timestamp)} \xB7 snapshot \u751F\u6210\u4E8E ${formatDisplayTime(model.observation.generatedAt)}`, attr: { title: `${current.timestamp} \xB7 ${model.observation.generatedAt}` } });
  for (const [field, text2] of [["progress", current.progress], ["next", current.next]]) if (text2 !== null) markdown(record2, text2, "flowdesk-contract-scope-markdown", field);
  for (const gap of current.gaps) {
    record2.createDiv({ cls: "flowdesk-muted", text: gap });
    if (current.status === "unknown") card.createDiv({ cls: "flowdesk-overview-gap", text: gap });
  }
  if (current.source && dependencies.showSourceActions) {
    const source = record2.createEl("button", { cls: "flowdesk-content-source", text: "\u6253\u5F00 Progress \u539F\u6587" });
    const original = model.content.domainSections.find((s) => s.level === 2 && s.heading === "Progress");
    source.addEventListener("click", () => {
      var _a;
      void dependencies.openSource(model.currentTask.id, current.source, "Progress", (_a = original == null ? void 0 : original.text) != null ? _a : "");
    });
  }
  return card;
}

// src/progress-history.ts
function parseQuotedProgress(text2) {
  var _a;
  const lines = text2.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.shift() !== "> [!faq]- \u8BE6\u7EC6\u8FC7\u7A0B\u65E5\u5FD7") return null;
  const events = [];
  let fence = null, receipts = false;
  const scan = (line) => {
    const visible = line.replace(/^(?:进展|完成|下一步)：/, "");
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(visible);
    if (!match) return;
    if (!fence) fence = { char: match[1][0], length: match[1].length };
    else if (match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim()) fence = null;
  };
  for (const line of lines) {
    if (/^<!-- flowdesk\.task-update\/.* -->$/.test(line)) {
      if (fence) return null;
      receipts = true;
      continue;
    }
    if (receipts) {
      if (line.trim()) return null;
      continue;
    }
    const event = /^> - \[[xX ]\] (.*)$/.exec(line);
    if (event) {
      if (fence) return null;
      const dated = /^`([^`]*)`(?: (.*))?$/.exec(event[1]);
      const body2 = dated ? (_a = dated[2]) != null ? _a : "" : event[1];
      events.push({ timestamp: dated ? dated[1] : null, lines: [body2] });
      scan(body2);
      continue;
    }
    if (!line.trim() || /^> *$/.test(line)) {
      if (events.length) events[events.length - 1].lines.push("");
      continue;
    }
    if (!events.length || !line.startsWith(">   ")) return null;
    const body = line.slice(4);
    events[events.length - 1].lines.push(body);
    scan(body);
  }
  if (fence || !events.length || events.some((event) => !event.lines.join("\n").trim())) return null;
  return events.map((event, sourceIndex) => ({ timestamp: event.timestamp, text: event.lines.join("\n").trimEnd(), sourceIndex }));
}
function readProgressSection(sections) {
  const candidates = sections.filter((section3) => section3.level === 2 && section3.heading === "Progress");
  if (candidates.length !== 1) return null;
  const section2 = candidates[0], source = section2.source;
  if (!Number.isInteger(source == null ? void 0 : source.line_start) || Number(source == null ? void 0 : source.line_start) < 1 || !Number.isInteger(source == null ? void 0 : source.line_end) || Number(source == null ? void 0 : source.line_end) < Number(source == null ? void 0 : source.line_start) || (source == null ? void 0 : source.truncated) === true || (source == null ? void 0 : source.omitted) === true) return null;
  const events = parseQuotedProgress(section2.text);
  return events ? { section: section2, events } : null;
}
function historyTime(value) {
  if (!value) return "\u65F6\u95F4\u672A\u8BB0\u5F55";
  const legacy = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if (legacy) {
    const [year, month, day, hour, minute] = legacy.slice(1).map(Number), date = /* @__PURE__ */ new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && hour < 24 && minute < 60) return formatDisplayTime(value.replace(" ", "T") + ":00+08:00");
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (iso) {
    const [year, month, day, hour, minute, second] = iso.slice(1, 7).map((part) => Number(part != null ? part : 0)), date = /* @__PURE__ */ new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    const zone = iso[7];
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59 || zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return value;
  }
  return formatDisplayTime(value);
}
function renderProgressEvents(parent, events, renderMarkdown, full) {
  var _a;
  for (const event of [...events].reverse()) {
    const row = parent.createDiv({ cls: "flowdesk-log-entry", attr: { "data-source-index": String(event.sourceIndex) } });
    row.createEl("time", { cls: "flowdesk-log-date", text: historyTime(event.timestamp), attr: { title: (_a = event.timestamp) != null ? _a : "\u539F\u6587\u672A\u63D0\u4F9B\u65E5\u671F" } });
    const content = row.createDiv({ cls: full ? "flowdesk-log-body markdown-rendered" : "flowdesk-log-excerpt markdown-rendered" });
    renderMarkdown(full ? event.text : excerpt(firstParagraph(event.text).replace(/^(?:进展|完成)：/, ""), 600), content);
  }
}

// src/progress-disclosure.ts
function bindProgressDisclosure(details, summary, recent, full, count, options) {
  var _a, _b;
  let expanded = details.open, animation = null, version = 0;
  const window2 = (_a = details.ownerDocument) == null ? void 0 : _a.defaultView;
  const clear = () => {
    animation == null ? void 0 : animation.cancel();
    animation = null;
    for (const element of [recent, full]) {
      element.style.height = "";
      element.style.maxHeight = "";
      element.style.overflow = "";
    }
  };
  const change = (next, motion) => {
    var _a2, _b2, _c, _d, _e, _f;
    if ((_a2 = options.signal) == null ? void 0 : _a2.aborted) return;
    const revision = ++version;
    const from = (_d = (_c = (_b2 = expanded ? full : recent).getBoundingClientRect) == null ? void 0 : _c.call(_b2).height) != null ? _d : 0;
    clear();
    expanded = next;
    details.open = next;
    recent.hidden = next;
    const ready = next ? options.ensureHistory() : void 0;
    (_e = options.onChange) == null ? void 0 : _e.call(options, next);
    summary.setText(`${next ? "\u6536\u8D77\u5168\u90E8" : "\u67E5\u770B\u5168\u90E8"}\u8FDB\u5EA6\u8BB0\u5F55\uFF08${count} \u6761\uFF09`);
    if (!motion || !from || !window2 || typeof full.animate !== "function" || ((_f = window2.matchMedia) == null ? void 0 : _f.call(window2, "(prefers-reduced-motion: reduce)").matches)) return;
    const target = next ? full : recent;
    const collapsedHeight = recent.scrollHeight;
    target.style.maxHeight = "none";
    target.style.height = `${from}px`;
    target.style.overflow = next ? "auto" : "hidden";
    const start = () => {
      var _a3;
      if (revision !== version || ((_a3 = options.signal) == null ? void 0 : _a3.aborted)) return;
      target.style.height = "";
      const height = next ? Math.min(target.scrollHeight, window2.innerHeight * 0.6, 520) : collapsedHeight;
      target.style.height = `${from}px`;
      const current = target.animate([{ height: `${from}px`, opacity: 0.65 }, { height: `${height}px`, opacity: 1 }], { duration: 200, easing: "cubic-bezier(.2, 0, 0, 1)" });
      animation = current;
      current.onfinish = () => {
        if (animation === current) clear();
      };
    };
    if (ready) void ready.then(start, start);
    else start();
  };
  summary.setAttr("data-focus-key", "progress-history-toggle");
  summary.addEventListener("click", (event) => {
    event.preventDefault();
    change(!expanded, true);
  });
  details.addEventListener("toggle", () => {
    if (details.open !== expanded) change(details.open, false);
  });
  details.addEventListener("flowdesk-reading-restore", () => change(details.open, false));
  (_b = options.signal) == null ? void 0 : _b.addEventListener("abort", () => {
    version++;
    clear();
  }, { once: true });
  recent.hidden = expanded;
}

// src/task-content-renderer.ts
var recordTitle = (heading) => heading.replace(/^Execution Result/, "\u6267\u884C\u7ED3\u679C").replace(/^Verification Result/, "\u9A8C\u8BC1\u7ED3\u679C").replace(/^Delivery Record/, "\u4EA4\u4ED8\u8BB0\u5F55");
var TaskContentRenderer = class {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  render(container, content) {
    var _a, _b, _c;
    const body = (parent, text2) => {
      const element = parent.createDiv({ cls: "flowdesk-contract-scope-markdown markdown-rendered" });
      void this.dependencies.renderMarkdown(text2, element, content.taskId).catch(() => element.setText(text2));
    };
    const source = (parent, section2) => {
      var _a2, _b2;
      if (!this.dependencies.showSourceActions) return;
      const row = parent.createDiv({ cls: "flowdesk-source-actions" });
      const button = row.createEl("button", { cls: "flowdesk-content-source", text: "\u5728\u539F\u6587\u67E5\u770B", attr: { "aria-label": `${section2.source ? "\u6253\u5F00\u8FD9\u4E00\u6761\u539F\u6587" : "\u6253\u5F00\u4EFB\u52A1\u539F\u6587"}\uFF1A${section2.heading}` } });
      button.addEventListener("click", () => {
        void this.dependencies.openSource(content.taskId, section2);
      });
      if (section2.source) {
        const details = row.createEl("details", { cls: "flowdesk-source-details", attr: { "data-disclosure-key": `source:${section2.heading}:${(_a2 = section2.source.line_start) != null ? _a2 : "unknown"}` } });
        details.createEl("summary", { text: "\u6765\u6E90" });
        const line = section2.source.line_start, reliable = typeof line === "number" && Number.isInteger(line) && line > 0;
        details.createDiv({ cls: "flowdesk-muted", text: `${(_b2 = section2.source.section) != null ? _b2 : section2.heading}${reliable ? ` \xB7 API details \u7B2C ${line} \u884C` : " \xB7 API details \u884C\u4F4D\u7F6E\u672A\u77E5"}` });
      }
    };
    const disclosure = (parent, title, key, cls = "flowdesk-contract-item-details") => {
      const element = parent.createEl("details", { cls, attr: { "data-disclosure-key": key } });
      element.createEl("summary", { text: title });
      return element;
    };
    const specification = disclosure(container, "\u4EFB\u52A1\u8BF4\u660E", "task-specification", "flowdesk-task-specification");
    for (const [heading, text2] of [["\u76EE\u6807", content.goal], ["\u80CC\u666F", content.why], ["\u8303\u56F4", content.scopeText], ["\u6267\u884C\u6E05\u5355", content.steps]]) {
      if (!text2) continue;
      const section2 = specification.createDiv({ cls: "flowdesk-specification-section" });
      section2.createEl("h3", { text: heading });
      body(section2, text2);
    }
    if (!content.goal && !content.why && !content.scopeText && !content.steps) specification.createDiv({ cls: "flowdesk-muted", text: "\u672A\u63D0\u4F9B\u4EFB\u52A1\u8BF4\u660E\uFF1B\u53EF\u4ECE\u4EFB\u52A1\u6807\u9898\u6253\u5F00\u539F\u6587\u4EF6\u3002" });
    source(specification, { heading: "\u4EFB\u52A1\u8BF4\u660E", level: 2, text: content.goal });
    const items = (heading, entries) => {
      var _a2, _b2;
      if (!entries.length) return;
      const group = disclosure(container, heading, `list:${heading}`);
      for (const item of entries) {
        const entry = group.createDiv({ cls: "flowdesk-specification-section" });
        body(entry, (_b2 = (_a2 = item.text) != null ? _a2 : item.label) != null ? _b2 : "");
      }
      source(group, { heading, level: 2, text: "" });
    };
    items("\u9700\u6C42", content.requirements);
    items("\u573A\u666F", content.scenarios);
    if (content.acceptance.length) {
      const group = disclosure(container, "\u9A8C\u6536\u6807\u51C6", "acceptance", "flowdesk-acceptance-group");
      group.createDiv({ cls: "flowdesk-muted", text: "\u4EC5\u663E\u793A\u539F\u6587\u8BB0\u5F55\uFF1B\u52FE\u9009\u4E0D\u4EE3\u8868\u9A8C\u8BC1\u901A\u8FC7\u3002\u4FEE\u6539\u8BF7\u5728\u4EFB\u52A1\u539F\u6587\u8FDB\u884C\u3002" });
      const list = group.createEl("ul", { cls: "flowdesk-acceptance-list" });
      for (const item of content.acceptance) {
        const row = list.createEl("li", { cls: "flowdesk-acceptance-item" });
        const marked = item.checked === true ? "\u539F\u6587\u5DF2\u52FE\u9009" : item.checked === false ? "\u539F\u6587\u672A\u52FE\u9009" : "\u539F\u6587\u65E0\u52FE\u9009\u6807\u8BB0";
        row.createSpan({ cls: `flowdesk-acceptance-marker is-${item.checked === true ? "checked" : item.checked === false ? "unchecked" : "plain"}`, text: item.checked === true ? "\u2713" : item.checked === false ? "\u25CB" : "\u2022", attr: { "aria-label": marked, title: marked } });
        body(row, (_b = (_a = item.text) != null ? _a : item.label) != null ? _b : "");
      }
      source(group, { heading: "\u9A8C\u6536", level: 2, text: "" });
    }
    const reading = createTaskReadingSections(content);
    if (!reading.orderComplete) container.createDiv({ cls: "flowdesk-muted", text: "\u90E8\u5206\u6BB5\u843D\u65E0\u53EF\u9760\u4F4D\u7F6E\uFF0C\u5B8C\u6574\u987A\u5E8F\u8BF7\u67E5\u770B\u539F\u6587\u4EF6\u3002" });
    for (const [kind, title] of [["execution", "\u6267\u884C\u7ED3\u679C"], ["verification", "\u9A8C\u8BC1\u7ED3\u679C"], ["delivery", "\u4EA4\u4ED8\u8BB0\u5F55"]]) {
      const records = content.records[kind];
      if (!records.length) continue;
      const result = disclosure(container, title, `result:${kind}`, "flowdesk-contract-item-details flowdesk-record-round");
      const latest = latestRecord(records);
      if (latest) {
        result.createDiv({ cls: "flowdesk-muted", text: "\u6700\u8FD1\u4E00\u6761\u7ED3\u679C\u7684\u9996\u6BB5\u6458\u5F55\uFF1B\u5168\u6587\u548C\u5386\u8F6E\u7ED3\u679C\u4FDD\u7559\u5728\u8FC7\u7A0B\u8BB0\u5F55\u3002" });
        body(result, excerpt(firstParagraph(latest.text)));
        source(result, latest);
      } else result.createDiv({ cls: "flowdesk-muted", text: "\u65E0\u6CD5\u786E\u8BA4\u6700\u8FD1\u4E00\u8F6E\uFF1B\u5B8C\u6574\u7ED3\u679C\u4FDD\u7559\u5728\u8FC7\u7A0B\u8BB0\u5F55\u3002" });
    }
    const progress = readProgressSection(content.domainSections);
    const historyContainer = (_c = this.dependencies.historyContainer) != null ? _c : container;
    if (progress) {
      const section2 = historyContainer.createEl("section", { cls: "flowdesk-progress-log" });
      const heading = section2.createDiv({ cls: "flowdesk-log-heading" });
      heading.createEl("h3", { text: "\u8FDB\u5EA6\u65E5\u5FD7" });
      const count = heading.createSpan({ cls: "flowdesk-muted", text: `\u6700\u8FD1 ${Math.min(3, progress.events.length)} \u6761 \xB7 \u6458\u5F55` });
      const markdown = (text2, element) => {
        void this.dependencies.renderMarkdown(text2, element, content.taskId).catch(() => element.setText(text2));
      };
      const all = disclosure(section2, `\u67E5\u770B\u5168\u90E8\u8FDB\u5EA6\u8BB0\u5F55\uFF08${progress.events.length} \u6761\uFF09`, "all-progress", "flowdesk-log-all");
      const full = all.createDiv({ cls: "flowdesk-log-full", attr: { "data-reading-scroll-key": "progress-history", role: "region", "aria-label": "\u5B8C\u6574\u8FDB\u5EA6\u8BB0\u5F55", tabindex: "0" } });
      const entries = full.createDiv({ cls: "flowdesk-log-full-entries" });
      const more = full.createEl("button", { cls: "flowdesk-log-more", attr: { "data-focus-key": "progress-history-more" } });
      let shown = 0, busy = false, loading;
      const caption = (expanded) => count.setText(expanded ? `\u5DF2\u663E\u793A ${shown}/${progress.events.length} \u6761 \xB7 \u539F\u6587` : `\u6700\u8FD1 ${Math.min(3, progress.events.length)} \u6761 \xB7 \u6458\u5F55`);
      const load = (desired = Math.max(12, Number(full.getAttribute("data-reading-items")) || 0)) => {
        var _a2, _b2, _c2;
        if ((_a2 = this.dependencies.signal) == null ? void 0 : _a2.aborted) return;
        if (busy) return loading;
        if (shown >= progress.events.length) return;
        const end = Math.min(progress.events.length, Math.max(shown, desired)), jobs = [];
        if (end === shown) return;
        renderProgressEvents(entries, progress.events.slice(progress.events.length - end, progress.events.length - shown), (text2, element) => jobs.push({ text: text2, element }), true);
        shown = end;
        full.setAttr("data-reading-items", String(shown));
        busy = true;
        more.disabled = true;
        caption(all.open);
        more.setText(`\u52A0\u8F7D\u66F4\u65E9\u8BB0\u5F55\uFF08\u5269\u4F59 ${progress.events.length - shown} \u6761\uFF09`);
        more.hidden = shown === progress.events.length;
        const render = (async () => {
          var _a3, _b3, _c3;
          try {
            for (const job of jobs) {
              if ((_a3 = this.dependencies.signal) == null ? void 0 : _a3.aborted) return;
              try {
                await this.dependencies.renderMarkdown(job.text, job.element, content.taskId);
              } catch (e) {
                if (!((_b3 = this.dependencies.signal) == null ? void 0 : _b3.aborted)) job.element.setText(job.text);
              }
            }
          } finally {
            busy = false;
            more.disabled = Boolean((_c3 = this.dependencies.signal) == null ? void 0 : _c3.aborted);
          }
        })();
        loading = render;
        (_c2 = (_b2 = this.dependencies).trackRender) == null ? void 0 : _c2.call(_b2, render);
        return render;
      };
      more.addEventListener("click", () => load(shown + 12));
      const recent = section2.createDiv({ cls: "flowdesk-log-recent" });
      renderProgressEvents(recent, progress.events.slice(-3), markdown, false);
      bindProgressDisclosure(all, all.querySelectorAll("summary")[0], recent, full, progress.events.length, { signal: this.dependencies.signal, ensureHistory: () => load(), onChange: caption });
    }
    const remaining = reading.sections.filter((item) => item.section !== (progress == null ? void 0 : progress.section));
    if (!remaining.length) return;
    const history = disclosure(historyContainer, `\u5176\u4ED6\u8FC7\u7A0B\u8D44\u6599\uFF08${remaining.length} \u6BB5\uFF09`, "process-records", "flowdesk-contract-item-details flowdesk-process-records");
    history.createDiv({ cls: "flowdesk-muted", text: "\u6309\u539F\u6587\u987A\u5E8F\u8FDE\u7EED\u4FDD\u7559\u6B63\u6587\u3001\u5386\u53F2\u8FDB\u5EA6\u4E0E\u5386\u8F6E\u7ED3\u679C\u3002" });
    for (const { kind, section: original } of remaining) {
      const entry = history.createDiv({ cls: "flowdesk-process-entry", attr: { "data-record-kind": kind } });
      entry.createEl(original.level === 3 ? "h3" : "h2", { text: recordTitle(original.heading) });
      body(entry, original.text);
    }
    source(history, { heading: "\u8FC7\u7A0B\u8BB0\u5F55", level: 2, text: "" });
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
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
        coreInfo: (_h = (_g = (_f = this.dependencies).coreForSnapshot) == null ? void 0 : _g.call(_f, snapshot)) != null ? _h : null,
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
      } else if (sameCase && ((_i = this.displayState) == null ? void 0 : _i.casePath) === selection.resourcePath) {
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
    var _a, _b, _c, _d, _e;
    const casePath = (_a = this.selection) == null ? void 0 : _a.resourcePath;
    if (!casePath) return null;
    const display = ((_b = this.displayState) == null ? void 0 : _b.casePath) === casePath ? this.displayState : null;
    return {
      casePath,
      caseContent: this.caseContent,
      coreInfo: (_c = display == null ? void 0 : display.coreInfo) != null ? _c : null,
      model: (_d = display == null ? void 0 : display.model) != null ? _d : null,
      loadedAt: (_e = display == null ? void 0 : display.loadedAt) != null ? _e : "",
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

// src/continuation-card.ts
function createContinuationCard(model, options = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const full = createResumePresentation(model.resumeBundle, model), targetBytes = (_a = options.targetBytes) != null ? _a : 4096;
  const selected = options.selectedTaskIds ? new Set(options.selectedTaskIds) : null;
  const active = model.tasks.items.filter((t) => t.statusIsCompleted !== true && (!selected || selected.has(t.id)));
  const finished = model.tasks.items.filter((t) => t.statusIsCompleted === true);
  const shown = finished.slice(0, 3), gaps = [...full.gaps];
  if (options.staleReason) gaps.unshift(`\u65E7\u89C2\u6D4B\uFF1A${options.staleReason}\uFF1B\u5F53\u524D\u6027\u672A\u786E\u8BA4\u3002`);
  const lines = [
    "\u7EE7\u7EED\u5DE5\u4F5C\u5361\uFF08\u53EA\u8BFB\u89C2\u6D4B\uFF1B\u4F7F\u7528\u524D\u56DE\u8BFB\uFF09",
    `Case\uFF1A${model.source.path}`,
    `cwd\uFF1A${(_b = model.workCase.cwd) != null ? _b : "\u672A\u8BB0\u5F55"}`,
    `branch\uFF1A${(_c = model.workCase.branch) != null ? _c : "\u672A\u8BB0\u5F55"}`,
    `\u5F53\u524D\u8FDB\u5C55\uFF08\u6458\u5F55\uFF09\uFF1A${excerpt((_d = model.current.progressSummary) != null ? _d : "\u672A\u8BB0\u5F55", 350)}`,
    `\u4E0B\u4E00\u6B65\uFF08\u539F\u89C2\u6D4B\u6458\u5F55\uFF09\uFF1A${excerpt((_e = model.current.next) != null ? _e : "\u672A\u8BB0\u5F55", 300)}`
  ];
  const decisions = model.sections.decisions[0];
  if (decisions) lines.push(`\u5173\u952E\u51B3\u5B9A\uFF08\u539F\u6587\u6458\u5F55\uFF09\uFF1A${excerpt(firstParagraph(decisions.text), 220)}`);
  lines.push("\n\u672A\u7ED3\u675F\u6216\u72B6\u6001\u672A\u77E5\u7684 Task\uFF1A");
  if (!active.length) lines.push(model.tasks.observationHealth === "healthy" ? "\u672C\u6B21\u9009\u62E9\u4E2D\u6CA1\u6709\u672A\u7ED3\u675F Task\u3002" : "\u5173\u8054\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u4E0D\u80FD\u786E\u8BA4\u6CA1\u6709\u672A\u7ED3\u675F Task\u3002");
  for (const task of active) {
    const projection = full.tasks.find((t) => t.id === task.id);
    lines.push(`- ${task.id} \xB7 \u539F\u72B6\u6001 ${task.status}${task.isBlocked ? " \xB7 \u6709\u963B\u585E" : ""}${task.statusIsCompleted === null ? " \xB7 \u751F\u547D\u5468\u671F\u672A\u77E5" : ""}`);
    lines.push(`  Next\uFF08\u539F\u89C2\u6D4B\u6458\u5F55\uFF09\uFF1A${excerpt((_f = projection == null ? void 0 : projection.next) != null ? _f : "\u672A\u63D0\u4F9B\uFF1B\u56DE\u8BFB\u51C6\u786E Task \u539F\u6587", 240)}`);
    if (projection == null ? void 0 : projection.missing.length) gaps.push(`${task.id}\uFF1A${projection.missing.join("\u3001")}`);
    if (!projection) gaps.push(`${task.id}\uFF1A\u6CA1\u6709\u6062\u590D\u6295\u5F71\uFF0CNext \u672A\u786E\u8BA4\u3002`);
    const source = projection == null ? void 0 : projection.sources.find((s) => s.field === "next");
    if (source) lines.push(`  \u6765\u6E90\uFF1A${source.task_id} / ${source.section} / API details ${source.line_start}\u2013${source.line_end}${source.truncated ? "\uFF08\u6E90\u6295\u5F71\u622A\u65AD\uFF09" : ""}`);
  }
  if (selected) {
    const excluded = model.tasks.items.filter((t) => t.statusIsCompleted !== true && !selected.has(t.id));
    if (excluded.length) lines.push(`\u672C\u5361\u672A\u9009\u62E9 ${excluded.length} \u4E2A\u672A\u7ED3\u675F/\u672A\u77E5 Task\uFF1B\u5B8C\u6574\u5217\u8868\u89C1 Case\u3002`);
  }
  lines.push(`
\u5DF2\u7ED3\u675F\u4EFB\u52A1\u6458\u5F55\uFF08\u6765\u6E90\u987A\u5E8F ${shown.length}/${finished.length}\uFF0C\u4E0D\u4EE3\u8868\u5168\u90E8\u6210\u529F\uFF09\uFF1A`);
  for (const task of shown) {
    const projection = full.tasks.find((t) => t.id === task.id);
    lines.push(`- ${task.title} \xB7 ${task.status} \xB7 ${task.id} \xB7 ${excerpt(firstParagraph((_g = projection == null ? void 0 : projection.result) != null ? _g : "\u672A\u63D0\u4F9B\u7ED3\u679C\uFF1B\u67E5\u770B Task \u539F\u6587"), 160)}`);
  }
  const omittedCompleted = finished.length - shown.length;
  if (omittedCompleted) lines.push(`\u7701\u7565 ${omittedCompleted} \u4E2A\u5DF2\u7ED3\u675F\u4EFB\u52A1\uFF1B\u5B8C\u6574\u7ED3\u679C\u4ECE Case/Task \u539F\u6587\u67E5\u770B\u3002`);
  if (model.tasks.observationHealth !== "healthy" || !model.tasks.coverage.complete) gaps.push("\u5173\u8054\u4EFB\u52A1\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u5F53\u524D\u5217\u8868\u4E0D\u662F\u5168\u90E8\u4EFB\u52A1\u3002");
  lines.push(
    `
\u7F3A\u53E3\uFF1A${gaps.length ? gaps.join("\uFF1B") : "\u672C\u6B21\u6765\u6E90\u672A\u62A5\u544A\u7F3A\u53E3"}`,
    `\u6765\u6E90\uFF1A${(_i = (_h = model.resumeBundle) == null ? void 0 : _h.source) != null ? _i : model.source.path}`,
    "\u63A5\u7EED\u524D\u56DE\u8BFB\u51C6\u786E Case \u4E0E\u6700\u65B0 TaskNotes\uFF1B\u660E\u786E\u9009\u62E9\u8981\u7EE7\u7EED\u7684 Task ID\uFF0C\u5DF2\u7ED3\u675F\u9879\u4E0D\u91CD\u505A\u3002\u6362\u8F7D\u4F53\u5148\u4FDD\u5B58\u8FDB\u5C55\u5E76\u6B63\u5E38\u7ED3\u675F\u65E7\u6267\u884C\uFF1B\u91CA\u653E\u672A\u77E5\u53EA\u8BFB\u6216\u56DE\u539F owner\u3002"
  );
  let text2 = lines.join("\n");
  if (utf8Bytes(text2) > targetBytes) text2 += `
\u672C\u5361\u8D85\u8FC7 ${targetBytes}B \u76EE\u6807\uFF1B\u51C6\u786E ID \u4E0E\u7F3A\u53E3\u4FDD\u7559\uFF0C\u53EF\u9009\u62E9\u66F4\u5C11 Task \u540E\u590D\u5236\u3002`;
  return { text: text2, bytes: utf8Bytes(text2), targetBytes, omittedCompleted, gaps };
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
    (model.workCase.summaryLastUpdated && !/^(null|none|undefined)$/i.test(model.workCase.summaryLastUpdated) ? model.workCase.summaryLastUpdated : null) || model.workCase.date || "\u65F6\u95F4\u672A\u8BB0\u5F55"
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
  if (timestamp && text2.startsWith(`[x] \`${timestamp}\``)) text2 = text2.slice(`[x] \`${timestamp}\``.length).trimStart();
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
    this.taskChoices = /* @__PURE__ */ new Map();
  }
  reset(container) {
    container.removeClass("flowdesk-case-dashboard");
  }
  render(container, state) {
    container.addClass("flowdesk-case-dashboard");
    if (!state.model) {
      this.renderShell(container, state);
      return;
    }
    const presentation = createWorkCasePresentation(state.model);
    this.renderHeader(container, state, presentation);
    const observation = container.createEl("details", {
      cls: `flowdesk-case-observation is-${state.staleReason ? "degraded" : presentation.tasks.health}`,
      attr: { title: state.casePath, "data-disclosure-key": "case-source" }
    });
    const core = state.coreInfo;
    observation.createEl("summary", { text: `${state.staleReason ? "\u65E7\u6570\u636E" : presentation.tasks.health === "healthy" ? "\u6765\u6E90\u8BFB\u53D6\u5B8C\u6574" : "\u5173\u8054\u8BFB\u53D6\u4E0D\u5B8C\u6574"}${core ? ` \xB7 Core ${core.version}` : ""}` });
    observation.createDiv({ cls: "flowdesk-muted", text: `Work Case schema 1 \xB7 ${state.loading ? "\u5237\u65B0\u4E2D \xB7 \u4E0A\u6B21\u8BFB\u53D6" : "\u8BFB\u53D6\u4E8E"} ${formatDisplayTime(state.loadedAt)} \xB7 ${state.casePath}${core ? `
${core.source} \xB7 ${core.root}` : ""}` });
    if (state.error || state.staleReason) {
      container.createDiv({
        cls: "flowdesk-case-stale-warning",
        text: state.staleReason || state.error
      });
    }
    this.renderCurrent(container, state, presentation);
    this.renderTasks(container, presentation);
    this.renderRelated(container, state, presentation);
    this.renderProgress(container, state, presentation);
    this.renderSections(container, state, presentation);
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
    if (state.error && this.dependencies.openSettings) {
      const button = container.createEl("button", { text: "\u6253\u5F00 Dashboard \u8BBE\u7F6E" });
      button.addEventListener("click", () => {
        var _a, _b;
        return (_b = (_a = this.dependencies).openSettings) == null ? void 0 : _b.call(_a);
      });
    }
  }
  renderHeader(container, state, presentation) {
    var _a;
    const header = container.createDiv({ cls: "flowdesk-case-header" });
    const top = header.createDiv({ cls: "flowdesk-case-header-top" });
    top.createDiv({ cls: "flowdesk-case-kicker", text: "\u5DE5\u4F5C\u6848\u5377" });
    const actions = top.createDiv({ cls: "flowdesk-header-actions" });
    const refresh = actions.createEl("button", {
      cls: "flowdesk-case-refresh",
      text: state.loading ? "\u8BFB\u53D6\u4E2D" : "\u5237\u65B0",
      attr: { "aria-label": state.loading ? "Work Case \u8BFB\u53D6\u4E2D" : "\u5237\u65B0 Work Case" }
    });
    refresh.disabled = state.loading;
    refresh.addEventListener("click", () => void this.dependencies.refresh());
    const more = actions.createEl("button", { cls: "flowdesk-more-actions", text: "\u22EF", attr: { "aria-label": "\u66F4\u591A\u64CD\u4F5C", "data-focus-key": "case-more" } });
    more.addEventListener("click", () => {
      var _a2, _b;
      return (_b = (_a2 = this.dependencies).openActions) == null ? void 0 : _b.call(_a2, "\u66F4\u591A\u64CD\u4F5C", [
        { label: "\u590D\u5236\u4EA4\u63A5\u4E0A\u4E0B\u6587", run: () => {
          var _a3, _b2;
          return (_b2 = (_a3 = this.dependencies).copyText) == null ? void 0 : _b2.call(_a3, createContinuationCard(state.model, { staleReason: state.staleReason, selectedTaskIds: [...this.selectedTasks(state)] }).text);
        } },
        { label: "\u67E5\u770B\u4EA4\u63A5\u4E0A\u4E0B\u6587", run: () => {
          var _a3, _b2;
          return (_b2 = (_a3 = this.dependencies).openContent) == null ? void 0 : _b2.call(_a3, "\u4EA4\u63A5\u4E0A\u4E0B\u6587", (container2) => this.renderResume(container2, state));
        } },
        { label: "\u590D\u5236\u5B8C\u6574\u6062\u590D\u8D44\u6599", run: () => {
          var _a3, _b2;
          return (_b2 = (_a3 = this.dependencies).copyText) == null ? void 0 : _b2.call(_a3, this.fullResumeText(state));
        } },
        { label: "\u67E5\u770B\u539F\u6587\u4EF6", run: () => this.dependencies.openRelated(state.casePath, state.casePath) }
      ]);
    });
    const title = header.createEl("button", { cls: "flowdesk-case-title flowdesk-case-title-link", text: presentation.header.title });
    title.addEventListener("click", () => {
      void this.dependencies.openRelated(state.casePath, state.casePath);
    });
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
      text: formatDisplayTime(presentation.header.dateTooltip),
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
      const card = grid.createDiv({ cls: `flowdesk-case-current-card is-${item.key}` });
      card.createDiv({ cls: "flowdesk-case-label", text: item.label });
      const short = excerpt(firstParagraph(item.value), 420);
      this.markdown(card, short, state.casePath, "flowdesk-case-current-value");
      if (short !== item.value.trim()) {
        const full = card.createEl("details", { cls: "flowdesk-case-current-full", attr: { "data-disclosure-key": `current:${item.key}` } });
        full.createEl("summary", { text: "\u5C55\u5F00\u5168\u6587" });
        this.markdown(full, item.value, state.casePath, "flowdesk-case-current-original");
      }
    }
  }
  markdown(parent, text2, sourcePath, cls) {
    const body = parent.createDiv({ cls: `${cls} markdown-rendered` });
    if (this.dependencies.renderMarkdown) void this.dependencies.renderMarkdown(text2, body, sourcePath).catch(() => body.setText(text2));
    else body.setText(text2);
  }
  renderTasks(container, presentation) {
    const section2 = createSection(container, "\u5173\u8054\u4EFB\u52A1", "flowdesk-case-tasks");
    section2.createDiv({ cls: "flowdesk-case-task-summary", text: presentation.tasks.health === "healthy" ? `\u5DF2\u7ED3\u675F ${presentation.tasks.completedLabel} \u4E2A\u5173\u8054\u4EFB\u52A1` : "\u5173\u8054\u4EFB\u52A1\u5C1A\u672A\u5B8C\u6574\u8BFB\u53D6\uFF1B\u4EE5\u4E0B\u4EC5\u5C55\u793A\u5DF2\u89C2\u5BDF\u6761\u76EE\u3002" });
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
      history.createEl("summary", { text: `\u5DF2\u7ED3\u675F / \u5DF2\u5F52\u6863 \xB7 ${presentation.tasks.history.length}` });
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
    const section2 = createSection(container, "\u6700\u8FD1\u8FDB\u5C55", "flowdesk-case-recent-progress");
    if (!presentation.recentProgress.length) {
      section2.createDiv({ cls: "flowdesk-case-empty", text: "\u672A\u8BB0\u5F55\u7ED3\u6784\u5316 Progress\u3002" });
      return;
    }
    const list = section2.createDiv({ cls: "flowdesk-case-progress-list" });
    for (const [index, item] of presentation.recentProgress.slice(0, 3).entries()) {
      const row = list.createDiv({ cls: `flowdesk-case-progress-item${index === 0 ? " is-latest" : ""}` });
      const meta = row.createSpan({ cls: "flowdesk-case-progress-meta" });
      if (item.timestamp) meta.createSpan({ cls: "flowdesk-case-progress-time", text: formatDisplayTime(item.timestamp), attr: { title: item.timestamp } });
      if (index === 0) meta.createSpan({ cls: "flowdesk-case-progress-latest", text: "\u6700\u65B0" });
      this.markdown(row, item.text, state.casePath, "flowdesk-case-progress-text");
    }
    const history = section2.createEl("button", { cls: "flowdesk-case-progress-history", text: "\u67E5\u770B\u5168\u90E8\u8FDB\u5C55 \u2192" });
    history.addEventListener("click", () => {
      var _a, _b;
      return (_b = (_a = this.dependencies).openContent) == null ? void 0 : _b.call(_a, "\u5168\u90E8\u8FDB\u5C55", (container2) => {
        var _a2, _b2;
        const progress = (_b2 = (_a2 = state.caseContent) == null ? void 0 : _a2.sections.filter((item) => item.heading === "Progress")) != null ? _b2 : [];
        const events = progress.length === 1 ? parseQuotedProgress(progress[0].text) : null;
        if (events) renderProgressEvents(container2, events, (text2, element) => this.markdown(element, text2, state.casePath, ""), true);
        else {
          container2.createDiv({ cls: "flowdesk-muted", text: "\u5B8C\u6574\u8FDB\u5C55\u672A\u80FD\u6574\u7406\uFF1B\u4EE5\u4E0B\u4FDD\u7559\u53EF\u8BFB\u53D6\u7684\u539F\u6587\uFF0C\u4E0D\u4EE3\u8868\u5B8C\u6574\u5386\u53F2\u3002" });
          for (const item of progress) this.markdown(container2, item.text, state.casePath, "flowdesk-log-body");
          if (!progress.length) for (const item of state.model.recentProgress) this.markdown(container2, item.text, state.casePath, "flowdesk-log-body");
        }
      });
    });
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
      this.renderRecordGroup(grid, state, group, false, true);
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
    var _a;
    const labels = { goal: "\u76EE\u6807", decisions: "\u5173\u952E\u51B3\u5B9A", discoveries: "\u53D1\u73B0", blockers: "\u98CE\u9669\u4E0E\u963B\u585E\u8BB0\u5F55", outcome: "\u7ED3\u679C", candidatePatterns: "\u7ECF\u9A8C\u5019\u9009", definitionOfDone: "\u5B8C\u6210\u6761\u4EF6" };
    const details = container.createEl("details", { cls: `flowdesk-case-record-group is-${group.key}${primary ? " is-primary" : ""}`, attr: { "data-disclosure-key": `case-record:${group.key}` } });
    details.open = open;
    details.createEl("summary", { text: `${(_a = labels[group.key]) != null ? _a : group.label} \xB7 ${group.items.length}` });
    const item = group.items[0];
    if (!item) return;
    details.createDiv({ cls: "flowdesk-case-record-heading", text: "\u539F\u6587\u6458\u5F55" });
    this.markdown(details, excerpt(firstParagraph(item.text), 480), state.casePath, "flowdesk-case-record-text");
  }
  renderRelated(container, state, presentation) {
    var _a, _b, _c;
    if (!presentation.related.length) return;
    const section2 = createSection(container, "\u7CBE\u9009\u5165\u53E3", "flowdesk-case-related");
    const edit = section2.createEl("button", { cls: "flowdesk-edit-entries", text: "\u7F16\u8F91\u5165\u53E3", attr: { "aria-label": "\u7F16\u8F91\u7CBE\u9009\u5165\u53E3" } });
    edit.addEventListener("click", () => {
      var _a2, _b2;
      void ((_b2 = (_a2 = this.dependencies).editCase) == null ? void 0 : _b2.call(_a2, state.casePath));
    });
    for (const group of presentation.related) {
      const row = section2.createDiv({ cls: "flowdesk-case-related-row" });
      row.createSpan({ cls: "flowdesk-case-label", text: (_a = { Project: "\u9879\u76EE", Plans: "\u8BA1\u5212", Docs: "\u6587\u6863", Sessions: "\u539F\u4F1A\u8BDD", Related: "\u8D44\u6599" }[group.label]) != null ? _a : group.label });
      const links = row.createDiv({ cls: "flowdesk-case-related-links" });
      for (const target of group.targets) {
        const link = links.createEl("button", {
          cls: "flowdesk-case-related-link",
          attr: { title: target }
        });
        const web = /^https?:\/\//i.test(parseReferenceText(target).target);
        const icon = link.createSpan({ cls: "flowdesk-reference-icon", attr: { "aria-hidden": "true" } });
        (_c = (_b = this.dependencies).icon) == null ? void 0 : _c.call(_b, icon, web ? "globe" : "file-text");
        const copy = link.createSpan({ cls: "flowdesk-reference-copy" });
        copy.createSpan({ cls: "flowdesk-reference-title", text: formatReferenceLabel(target) });
        copy.createSpan({ cls: "flowdesk-reference-type", text: web ? "\u7F51\u9875 \xB7 \u6D4F\u89C8\u5668" : group.label === "Project" ? "\u9879\u76EE \xB7 Obsidian \u7B14\u8BB0" : "\u6587\u6863 \xB7 \u539F\u6587\u4EF6" });
        link.createSpan({ cls: "flowdesk-reference-arrow", text: web ? "\u2197" : "\u2192", attr: { "aria-hidden": "true" } });
        link.addEventListener(
          "click",
          () => void this.dependencies.openRelated(target, state.casePath)
        );
      }
    }
  }
  selectedTasks(state) {
    const ids = new Set(state.model.tasks.items.filter((task) => task.statusIsCompleted !== true).map((task) => task.id)), previous = this.taskChoices.get(state.casePath);
    const selected = new Set(previous ? [...previous.selected].filter((id) => ids.has(id)) : ids);
    for (const id of ids) if (!(previous == null ? void 0 : previous.known.has(id))) selected.add(id);
    this.taskChoices.set(state.casePath, { selected, known: ids });
    while (this.taskChoices.size > 20) this.taskChoices.delete(this.taskChoices.keys().next().value);
    return selected;
  }
  fullResumeText(state) {
    const presentation = createResumePresentation(state.model.resumeBundle, state.model), independent = state.caseContent;
    const caseLines = (independent == null ? void 0 : independent.error) ? [`Case\u72EC\u7ACB\u539F\u6587\u8BFB\u53D6\u5931\u8D25\uFF1A${independent.error}`] : independent ? [`Case\u72EC\u7ACB\u539F\u6587\u8BFB\u53D6\u65F6\u95F4\uFF1A${independent.readAt}`, ...independent.sections.filter((section2) => section2.heading !== "Progress").map((section2) => `${section2.heading}\uFF08vault-file ${section2.source.lineStart}\u2013${section2.source.lineEnd}\uFF09\uFF1A
${section2.text}`)] : ["Case\u72EC\u7ACB\u539F\u6587\u672A\u8BFB\u53D6\uFF1BContext/Summary\u9700\u67E5\u770B\u6574\u5F20Case\u3002"];
    return [presentation.summary, `\u672C\u5730snapshot\u8BFB\u53D6\u65F6\u95F4\uFF1A${state.loadedAt}`, state.staleReason ? `\u65E7\u89C2\u6D4B\uFF1A${state.staleReason}` : "", ...caseLines].filter(Boolean).join("\n\n");
  }
  renderResume(container, state) {
    if (!state.model) return;
    container.addClass("flowdesk-case-dashboard");
    const presentation = createResumePresentation(state.model.resumeBundle, state.model);
    const section2 = createSection(container, "\u4EA4\u63A5\u4E0A\u4E0B\u6587", "flowdesk-case-resume");
    const summary = this.fullResumeText(state);
    const active = state.model.tasks.items.filter((t) => t.statusIsCompleted !== true);
    const selected = this.selectedTasks(state);
    const short = section2.createEl("details", { cls: "flowdesk-continuation-preview", attr: { "data-disclosure-key": "continuation-preview" } });
    short.createEl("summary", { text: "\u67E5\u770B\u4EA4\u63A5\u4E0A\u4E0B\u6587" });
    const content = short.createEl("pre", { cls: "flowdesk-continuation-text" });
    const size = section2.createDiv({ cls: "flowdesk-muted" });
    const update = () => {
      const card = createContinuationCard(state.model, { staleReason: state.staleReason, selectedTaskIds: [...selected] });
      content.setText(card.text);
      size.setText(`${(card.bytes / 1024).toFixed(1)} KB \xB7 ${card.bytes > card.targetBytes ? "\u8D85\u8FC7\u76EE\u6807\uFF0C\u51C6\u786E ID \u548C\u7F3A\u53E3\u4FDD\u7559" : "\u6458\u5F55\u7248"} \xB7 \u5B8C\u6574\u6570\u636E\u4FDD\u7559`);
      return card;
    };
    update();
    if (active.length) {
      const choices = section2.createEl("details", { cls: "flowdesk-continuation-choices", attr: { "data-disclosure-key": "continuation-choices" } });
      choices.createEl("summary", { text: `\u9009\u62E9\u63A5\u7EED Task \xB7 ${active.length}` });
      for (const task of active) {
        const label = choices.createEl("label", { cls: "flowdesk-continuation-choice" });
        const input = label.createEl("input", { attr: { type: "checkbox", "aria-label": `\u63A5\u7EED\u6750\u6599\u5305\u542B\uFF1A${task.title}` } });
        input.checked = selected.has(task.id);
        label.createSpan({ text: task.title });
        input.addEventListener("change", () => {
          input.checked ? selected.add(task.id) : selected.delete(task.id);
          update();
        });
      }
    }
    const actions = section2.createDiv({ cls: "flowdesk-continuation-actions" });
    const copyShort = actions.createEl("button", { cls: "flowdesk-case-copy-continuation mod-cta", text: "\u590D\u5236\u7EE7\u7EED\u5DE5\u4F5C\u5361" });
    copyShort.addEventListener("click", () => {
      var _a, _b;
      void ((_b = (_a = this.dependencies).copyText) == null ? void 0 : _b.call(_a, update().text));
    });
    const full = section2.createEl("details", { cls: "flowdesk-case-recovery", attr: { "data-disclosure-key": "full-resume" } });
    full.createEl("summary", { text: "\u5B8C\u6574\u6062\u590D\u8D44\u6599\u4E0E\u6765\u6E90" });
    full.createDiv({ cls: "flowdesk-muted", text: `\u672C\u5730 snapshot \u8BFB\u53D6\u65F6\u95F4\uFF1A${formatDisplayTime(state.loadedAt)}\uFF1B\u5B8C\u6574\u6062\u590D\u8D44\u6599\u4E0D\u66FF\u4EE3 Case/Task \u539F\u6587\u3002` });
    const fullText = full.createEl("pre", { cls: "flowdesk-continuation-text" });
    full.addEventListener("toggle", () => {
      if (full.open) fullText.setText(summary);
    });
    for (const task of presentation.tasks) {
      const sources = full.createEl("details", { cls: "flowdesk-case-recovery" });
      sources.createEl("summary", { text: `Task\u6765\u6E90\u4E0E\u5B8C\u6574\u539F\u6587\uFF1A${task.title} \xB7 ${task.status}` });
      const taskOriginal = sources.createEl("button", { text: "\u6253\u5F00\u5B8C\u6574Task\u539F\u6587" });
      taskOriginal.addEventListener("click", () => {
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
    const copy = actions.createEl("button", { cls: "flowdesk-case-copy-resume", text: "\u590D\u5236\u5B8C\u6574\u6062\u590D\u8D44\u6599" });
    copy.addEventListener("click", () => {
      var _a, _b;
      void ((_b = (_a = this.dependencies).copyText) == null ? void 0 : _b.call(_a, summary));
    });
    const instructions = full.createEl("button", { text: "\u590D\u5236\u7EE7\u7EED\u5DE5\u4F5C\u6B65\u9AA4" });
    instructions.addEventListener("click", () => {
      var _a, _b;
      void ((_b = (_a = this.dependencies).copyText) == null ? void 0 : _b.call(_a, `\u7EE7\u7EED\u5DE5\u4F5C\u4E0A\u4E0B\u6587\uFF08\u53EA\u8BFB\uFF0C\u4E0D\u81EA\u52A8\u6267\u884C\u4EFB\u4F55Task\uFF09
${summary}

\u660E\u786E\u9009\u62E9\u8981\u7EE7\u7EED\u7684\u51C6\u786ETask ID\uFF1B\u5DF2\u5B8C\u6210\u9879\u4FDD\u7559\u7ED3\u679C\uFF0C\u4E0D\u91CD\u65B0\u6267\u884C\u3002`));
    });
    const history = full.createEl("button", { text: "\u590D\u5236\u539F\u4F1A\u8BDD\u6807\u8BC6\u4E0E\u67E5\u770B\u6B65\u9AA4" });
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
  const excerpt2 = typeof (range == null ? void 0 : range.excerpt) === "string" ? normalize2(range.excerpt) : "";
  const text2 = normalize2(section2.text);
  if (!excerpt2 && !text2 || excerpt2 && !span.includes(excerpt2) || text2 && !span.includes(text2)) return note("\u6765\u6E90\u7247\u6BB5\u4E0E\u5F53\u524DAPI\u8303\u56F4\u4E0D\u4E00\u81F4\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002");
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
  return new Promise((resolve6, reject) => {
    (0, import_child_process.execFile)(executable, args, { timeout: options.timeoutMs, shell: false, windowsHide: true }, (error) => error ? reject(error) : resolve6());
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
  const selected = /* @__PURE__ */ new Set(["Goal", "Current", "Context", "Summary", "Decisions", "Progress", "\u76EE\u6807", "\u51B3\u7B56", "\u80CC\u666F", "\u6458\u8981"]);
  const sections = headings.filter((h) => selected.has(h.heading)).map((h) => {
    var _a, _b;
    const end = (_b = (_a = headings.find((n) => n.index > h.index && n.level <= h.level)) == null ? void 0 : _a.index) != null ? _b : lines.length;
    return { heading: h.heading, level: h.level, text: lines.slice(h.index + 1, end).join("\n"), source: { lineStart: h.index + 1, lineEnd: end } };
  });
  return { casePath, details, readAt, source: "vault-cached-read", error: null, sections };
}

// src/core-resolution.ts
var import_fs3 = require("fs");
var path5 = __toESM(require("path"));
var stableVersion = (value) => typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
var json = (file) => JSON.parse((0, import_fs3.readFileSync)(file, "utf8"));
function validate(root, installed) {
  var _a;
  const canonical = (0, import_fs3.realpathSync)(root);
  for (const name of ["flowdesk-execution-snapshot", "flowdesk-work-case-snapshot"]) (0, import_fs3.accessSync)(path5.join(canonical, "bin", name), import_fs3.constants.X_OK);
  const manifests = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"].flatMap((file) => {
    try {
      return [json(path5.join(canonical, file))];
    } catch (e) {
      return [];
    }
  });
  if (installed && (!manifests.length || manifests.some((m) => m.name !== "flow-desk" || !stableVersion(m.version)))) throw Error("Core \u540D\u79F0\u6216\u7248\u672C\u65E0\u6CD5\u786E\u8BA4");
  if (new Set(manifests.map((m) => m.version)).size > 1) throw Error("Core \u7684\u7248\u672C\u58F0\u660E\u4E0D\u4E00\u81F4");
  return { root: canonical, version: typeof ((_a = manifests[0]) == null ? void 0 : _a.version) === "string" ? manifests[0].version : "\u672A\u8BB0\u5F55" };
}
function resolveCore(options) {
  var _a;
  if (options.mode === "fixed") {
    if (!options.fixedPath) throw Error("\u56FA\u5B9A Core \u8DEF\u5F84\u4E3A\u7A7A\uFF0C\u8BF7\u6253\u5F00\u8BBE\u7F6E\u586B\u5199\u8DEF\u5F84\u3002");
    try {
      return { ...validate(options.fixedPath, false), source: "fixed", notices: [] };
    } catch (error) {
      throw Error(`\u56FA\u5B9A Core \u8DEF\u5F84\u65E0\u6548\uFF1A${options.fixedPath}\uFF1B${error instanceof Error ? error.message : String(error)}\u3002\u8BF7\u6253\u5F00\u8BBE\u7F6E\u68C0\u67E5\u3002`);
    }
  }
  const notices = [];
  try {
    const registry = json(path5.join(options.home, ".claude/plugins/installed_plugins.json"));
    const rows = (_a = registry == null ? void 0 : registry.plugins) == null ? void 0 : _a["flow-desk@flowdesk-marketplace"];
    if (!Array.isArray(rows)) throw Error("\u6CA1\u6709 FlowDesk \u5B89\u88C5\u767B\u8BB0");
    const applicable = rows.filter((r) => r && (r.scope === "user" || (r.scope === "project" || r.scope === "local") && typeof r.projectPath === "string" && options.workingDirectory && path5.resolve(r.projectPath) === path5.resolve(options.workingDirectory)));
    const scoped = applicable.filter((r) => r.scope !== "user");
    const candidates2 = (scoped.length ? scoped : applicable).map((r) => {
      if (typeof r.installPath !== "string" || !path5.isAbsolute(r.installPath)) throw Error("\u5B89\u88C5\u767B\u8BB0\u8DEF\u5F84\u65E0\u6548");
      const found = validate(r.installPath, true);
      if (r.version && r.version !== found.version) throw Error("\u5B89\u88C5\u767B\u8BB0\u4E0E Core \u7248\u672C\u4E0D\u4E00\u81F4");
      return found;
    });
    const unique = [...new Map(candidates2.map((r) => [r.root, r])).values()];
    if (unique.length > 1) throw Error("\u5B58\u5728\u591A\u4E2A\u9002\u7528\u7684 Core \u5B89\u88C5\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u9009\u62E9\u56FA\u5B9A\u8DEF\u5F84\u3002");
    if (unique.length === 1) return { ...unique[0], source: "claude-installed", notices };
    throw Error("\u6CA1\u6709\u9002\u7528\u7684 Core \u5B89\u88C5\u767B\u8BB0");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("\u5B58\u5728\u591A\u4E2A\u9002\u7528")) throw error;
    notices.push(`Claude \u5B89\u88C5\u767B\u8BB0\u4E0D\u53EF\u7528\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  const cache = path5.join(options.home, ".codex/plugins/cache/flowdesk-marketplace/flow-desk");
  const candidates = [];
  try {
    for (const name of (0, import_fs3.readdirSync)(cache).filter(stableVersion)) {
      try {
        const found = validate(path5.join(cache, name), true);
        if (found.version === name) candidates.push(found);
      } catch (e) {
      }
    }
  } catch (e) {
  }
  candidates.sort((a, b) => {
    const aa = a.version.split(".").map(Number), bb = b.version.split(".").map(Number);
    return bb[0] - aa[0] || bb[1] - aa[1] || bb[2] - aa[2];
  });
  if (candidates.length) return { ...candidates[0], source: "codex-cache", notices: [...notices, "\u4F7F\u7528\u6709\u6548\u7684 Codex \u7F13\u5B58\u5019\u9009\uFF1B\u6B64\u6765\u6E90\u4E0D\u8BC1\u660E\u5BBF\u4E3B\u5B9E\u9645\u52A0\u8F7D\u3002"] };
  throw Error(`\u672A\u627E\u5230\u6709\u6548 Core\u3002${notices.join("\uFF1B")}\uFF1BCodex \u7F13\u5B58\u6CA1\u6709\u5B8C\u6574\u7248\u672C\u3002\u8BF7\u6253\u5F00\u8BBE\u7F6E\u9009\u62E9\u56FA\u5B9A\u8DEF\u5F84\u3002`);
}

// src/reading-state.ts
var get = (el, key) => {
  var _a, _b;
  return (_b = (_a = el.getAttribute) == null ? void 0 : _a.call(el, key)) != null ? _b : null;
};
var set = (el, key, value) => {
  var _a;
  if (el.setAttribute) el.setAttribute(key, value);
  else (_a = el.setAttr) == null ? void 0 : _a.call(el, key, value);
};
function disclosures(container) {
  const occurrences = /* @__PURE__ */ new Map();
  return Array.from(container.querySelectorAll("details")).filter((el) => get(el, "data-external-disclosure") !== "true").map((el) => {
    var _a, _b;
    const base = get(el, "data-disclosure-key") || ((_a = Array.from(el.querySelectorAll("summary"))[0]) == null ? void 0 : _a.textContent) || "details";
    const n = (_b = occurrences.get(base)) != null ? _b : 0;
    occurrences.set(base, n + 1);
    return [`${base}:${n}`, el];
  });
}
function focusTargets(container) {
  var _a;
  const targets = ["button", "a", "summary", "input", "select", "textarea"].flatMap((tag) => Array.from(container.querySelectorAll(tag)));
  const occurrences = /* @__PURE__ */ new Map();
  for (const el of targets) {
    const base = get(el, "aria-label") || get(el, "data-focus-key") || `${el.tagName || "element"}:${(el.textContent || "").slice(0, 180)}`;
    const n = (_a = occurrences.get(base)) != null ? _a : 0;
    occurrences.set(base, n + 1);
    set(el, "data-reading-focus", `${base}:${n}`);
  }
  return targets;
}
function scrollTargets(container) {
  return Array.from(container.querySelectorAll("div")).filter((el) => get(el, "data-reading-scroll-key")).map((el) => [get(el, "data-reading-scroll-key"), el]);
}
var ReadingStateCache = class {
  constructor(capacity = 20) {
    this.capacity = capacity;
    this.entries = /* @__PURE__ */ new Map();
  }
  capture(key, container, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    if (!key) return;
    const list = disclosures(container);
    if (!list.length) return;
    const previous = this.entries.get(key);
    const state = { open: (_a = previous == null ? void 0 : previous.open) != null ? _a : /* @__PURE__ */ new Map(), scroll: options.position === false ? (_b = previous == null ? void 0 : previous.scroll) != null ? _b : 0 : container.scrollTop || 0, nested: (_c = previous == null ? void 0 : previous.nested) != null ? _c : /* @__PURE__ */ new Map(), focus: (_d = previous == null ? void 0 : previous.focus) != null ? _d : null };
    for (const [id, el] of list) state.open.set(id, el.open);
    focusTargets(container);
    const active = (_e = container.ownerDocument) == null ? void 0 : _e.activeElement;
    if (options.position !== false) {
      for (const [id, element] of scrollTargets(container)) state.nested.set(id, { scroll: element.scrollTop || 0, items: get(element, "data-reading-items") });
      if (active && container.contains(active)) state.focus = get(active, "data-reading-focus");
      else if (active && active !== ((_f = container.ownerDocument) == null ? void 0 : _f.body)) state.focus = null;
    }
    this.entries.delete(key);
    this.entries.set(key, state);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value);
  }
  restore(key, container, options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const state = this.entries.get(key);
    if (options.disclosures !== false) {
      for (const [id, el] of scrollTargets(container)) {
        const items = (_a = state == null ? void 0 : state.nested.get(id)) == null ? void 0 : _a.items;
        if (items) set(el, "data-reading-items", items);
      }
      for (const [id, el] of disclosures(container)) if (state == null ? void 0 : state.open.has(id)) {
        el.open = state.open.get(id);
        (_b = el.dispatchEvent) == null ? void 0 : _b.call(el, new Event("flowdesk-reading-restore"));
      }
    }
    const targets = focusTargets(container);
    if (options.position === false) return;
    container.scrollTop = (_c = state == null ? void 0 : state.scroll) != null ? _c : 0;
    for (const [id, element] of scrollTargets(container)) element.scrollTop = (_e = (_d = state == null ? void 0 : state.nested.get(id)) == null ? void 0 : _d.scroll) != null ? _e : 0;
    const active = (_f = container.ownerDocument) == null ? void 0 : _f.activeElement;
    if ((state == null ? void 0 : state.focus) && (!active || active === ((_g = container.ownerDocument) == null ? void 0 : _g.body) || container.contains(active))) {
      const target = targets.find((el) => get(el, "data-reading-focus") === state.focus);
      if (target && !target.disabled && (!target.getClientRects || target.getClientRects().length)) (_h = target.focus) == null ? void 0 : _h.call(target, { preventScroll: true });
    }
  }
  clear() {
    this.entries.clear();
  }
};

// src/dashboard-dialogs.ts
var import_obsidian = require("obsidian");
var DashboardContentModal = class extends import_obsidian.Modal {
  constructor(app, heading, renderBody) {
    super(app);
    this.heading = heading;
    this.renderBody = renderBody;
    this.markdownScope = new import_obsidian.Component();
    this.renderController = new AbortController();
  }
  get renderSignal() {
    return this.renderController.signal;
  }
  onOpen() {
    if (this.renderController.signal.aborted) this.renderController = new AbortController();
    this.markdownScope.load();
    this.titleEl.setText(this.heading);
    this.contentEl.empty();
    this.contentEl.addClass("flowdesk-dialog-content");
    this.renderBody(this.contentEl);
  }
  onClose() {
    this.renderController.abort();
    this.markdownScope.unload();
    this.contentEl.empty();
  }
};
var DashboardActionsModal = class extends DashboardContentModal {
  constructor(app, heading, actions) {
    let instance;
    super(app, heading, (container) => {
      for (const action of actions) {
        const button = container.createEl("button", { cls: "flowdesk-menu-action", text: action.label });
        button.addEventListener("click", async () => {
          if (button.disabled) return;
          button.disabled = true;
          try {
            if (!action.label.startsWith("\u590D\u5236")) instance.close();
            await action.run();
            if (action.label.startsWith("\u590D\u5236")) new import_obsidian.Notice("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
          } catch (e) {
            new import_obsidian.Notice("\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u6838\u5BF9\u540E\u91CD\u8BD5\u3002");
          } finally {
            button.disabled = false;
          }
        });
      }
    });
    instance = this;
  }
};
function createReadOnlyTextModal(app, title, text2) {
  return new DashboardContentModal(app, title, (container) => {
    const input = container.createEl("textarea", { cls: "flowdesk-dialog-text", attr: { readonly: "true", "aria-label": title } });
    input.value = text2;
    const feedback = container.createDiv({ cls: "flowdesk-muted", attr: { role: "status" } }), copy = container.createEl("button", { text: "\u590D\u5236" });
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text2);
        feedback.setText("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
      } catch (e) {
        feedback.setText("\u672A\u80FD\u5199\u5165\u526A\u8D34\u677F\uFF0C\u53EF\u9009\u62E9\u6587\u672C\u624B\u52A8\u590D\u5236\u3002");
      }
    });
  });
}

// src/main.ts
var FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";
var execFileAsync = (0, import_util.promisify)(import_child_process2.execFile);
var DEFAULT_SETTINGS = {
  coreMode: "installed",
  flowdeskRoot: "",
  workingDirectory: "",
  apiUrl: "",
  tasknotesEnv: "{}"
};
var FlowDeskDashboardPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.coreResolution = null;
    this.settingsRefresh = null;
    this.snapshotCores = /* @__PURE__ */ new WeakMap();
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
      name: "\u663E\u793A\u5F53\u524D Task \u6216 Case",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = this.isTaskFile(file) || ["work-case", "session"].includes(this.workCaseType(file));
        if (checking) return canRun;
        if (!file || !canRun) {
          new import_obsidian2.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A TaskNotes \u4EFB\u52A1\u6216 Work Case\u3002");
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
      if (view && file instanceof import_obsidian2.TFile && view.observesFile(file.path)) view.scheduleRefresh();
    };
    this.registerEvent(this.app.vault.on("modify", refreshOnChange));
    this.registerEvent(this.app.vault.on("create", refreshOnChange));
    this.registerEvent(this.app.vault.on("delete", refreshOnChange));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const view = this.getDashboardView();
      if (view && file instanceof import_obsidian2.TFile && (view.observesFile(file.path) || view.observesFile(oldPath))) view.scheduleRefresh();
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
    new import_obsidian2.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A TaskNotes \u4EFB\u52A1\u6216 Work Case\u3002");
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
    const usedCore = this.coreResolution ? { ...this.coreResolution, notices: [...this.coreResolution.notices] } : null;
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
      const snapshot = sanitizeTaskNotesSnapshot(JSON.parse(stdout), auth.token);
      if (snapshot && typeof snapshot === "object" && usedCore) this.snapshotCores.set(snapshot, usedCore);
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(formatTaskNotesAuthError(`Snapshot JSON \u89E3\u6790\u5931\u8D25\uFF1A${message}`, auth.token));
    }
  }
  async loadWorkCaseSnapshot(casePath, signal) {
    var _a, _b;
    const auth = resolveTaskNotesAuth((_a = this.settings.tasknotesEnv) != null ? _a : "{}");
    const invocation = this.createWorkCaseSnapshotInvocation(casePath);
    const usedCore = this.coreResolution ? { ...this.coreResolution, notices: [...this.coreResolution.notices] } : null;
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
      if (snapshot && typeof snapshot === "object" && usedCore) this.snapshotCores.set(snapshot, usedCore);
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
    return readTaskDetails({ taskPath, signal, auth, apiUrl: resolveTaskNotesApiUrl(this.settings.apiUrl, auth.env), transport: desktopTaskNotesRead });
  }
  async loadCaseContent(casePath, signal) {
    const file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof import_obsidian2.TFile) || file.path !== casePath) throw new Error("\u672A\u627E\u5230\u51C6\u786ECase\u539F\u6587");
    const details = await this.app.vault.cachedRead(file);
    if (signal.aborted) throw new Error("Case\u539F\u6587\u8BF7\u6C42\u5DF2\u53D6\u6D88");
    return createCaseContent(casePath, details, (/* @__PURE__ */ new Date()).toISOString());
  }
  async loadSettings() {
    var _a;
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (!(saved == null ? void 0 : saved.coreMode) && ((_a = saved == null ? void 0 : saved.flowdeskRoot) == null ? void 0 : _a.trim())) this.settings.coreMode = "fixed";
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.coreResolution = null;
    if (this.settingsRefresh) clearTimeout(this.settingsRefresh);
    this.settingsRefresh = setTimeout(() => {
      var _a;
      this.settingsRefresh = null;
      void ((_a = this.getDashboardView()) == null ? void 0 : _a.settingsChanged());
    }, 350);
  }
  openDashboardSettings() {
    new DashboardSettingsModal(this.app, this).open();
  }
  inspectCore() {
    this.resolveFlowDeskRoot();
    return this.coreResolution;
  }
  snapshotCoreInfo(snapshot) {
    var _a;
    return snapshot && typeof snapshot === "object" ? (_a = this.snapshotCores.get(snapshot)) != null ? _a : null : null;
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
    var _a;
    this.coreResolution = null;
    this.coreResolution = resolveCore({
      mode: (_a = this.settings.coreMode) != null ? _a : this.settings.flowdeskRoot.trim() ? "fixed" : "installed",
      fixedPath: expandHomePath(this.settings.flowdeskRoot.trim()),
      home: (0, import_os.homedir)(),
      workingDirectory: expandHomePath(this.settings.workingDirectory.trim())
    });
    return this.coreResolution.root;
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
    return path6.resolve(basePath);
  }
};
var FlowDeskDashboardView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.readingState = new ReadingStateCache();
    this.renderedResource = "";
    this.renderGeneration = 0;
    this.renderController = new AbortController();
    this.markdownScope = null;
    this.pendingMarkdown = [];
    this.rendering = false;
    this.readingInteraction = 0;
    this.positionRestored = true;
    this.lastRenderInteraction = 0;
    this.onReadingInteraction = (event) => {
      if (event.isTrusted) this.readingInteraction++;
    };
    this.previousTaskPath = "";
    this.cancelInitialSync = null;
    this.rawTaskContent = null;
    this.rawContentController = null;
    this.rawContentGeneration = 0;
    this.rawContentLoading = false;
    this.navigationController = null;
    this.navigationOpening = null;
    this.relatedTargetPanel = null;
    this.resourceModal = null;
    this.taskAdapter = new FrozenTaskAdapter({
      shell: () => this.shell,
      loadSnapshot: (taskPath, signal) => this.plugin.loadSnapshot(taskPath, signal),
      render: (container, state) => this.renderFrozenTask(container, state),
      requestRender: () => this.renderShell(),
      nowLabel: () => (/* @__PURE__ */ new Date()).toISOString()
    });
    this.caseAdapter = new WorkCaseAdapter({
      shell: () => this.shell,
      loadSnapshot: (casePath, signal) => this.plugin.loadWorkCaseSnapshot(casePath, signal),
      loadCaseContent: (casePath, signal) => this.plugin.loadCaseContent(casePath, signal),
      coreForSnapshot: (snapshot) => this.plugin.snapshotCoreInfo(snapshot),
      render: (container, state) => this.renderWorkCase(container, state),
      requestRender: () => this.renderShell(),
      nowLabel: () => (/* @__PURE__ */ new Date()).toISOString()
    });
    this.caseRenderer = new WorkCaseDashboardRenderer({
      refresh: () => {
        this.cancelNavigation();
        return this.caseAdapter.refresh();
      },
      openTask: (taskPath, origin) => this.openTask(taskPath, origin),
      openCaseSource: (casePath, source) => this.openCaseSource(casePath, source),
      openRelated: (target, casePath) => this.openRelated(target, casePath, void 0, true),
      copyText: (text2) => navigator.clipboard.writeText(text2),
      openTaskSource: (taskPath, source) => this.openSnapshotSource(taskPath, source, "\u6062\u590D\u5F15\u7528"),
      renderMarkdown: (text2, element, sourcePath) => this.renderSourceMarkdown(text2, element, sourcePath),
      openSettings: () => this.plugin.openDashboardSettings(),
      openActions: (title, actions) => {
        this.displayResourceModal(new DashboardActionsModal(this.app, title, actions));
      },
      openContent: (title, render) => {
        this.displayResourceModal(new DashboardContentModal(this.app, title, render));
      },
      editCase: (casePath) => this.openCaseProperties(casePath),
      icon: import_obsidian2.setIcon
    });
    this.shell = new ViewShellController([this.taskAdapter, this.caseAdapter]);
    for (const name of ["pointerdown", "keydown", "wheel"]) this.contentEl.addEventListener(name, this.onReadingInteraction);
  }
  closeResourceModal() {
    const modal = this.resourceModal;
    this.resourceModal = null;
    this.relatedTargetPanel = null;
    modal == null ? void 0 : modal.close();
  }
  displayResourceModal(modal) {
    this.closeResourceModal();
    const close = modal.onClose.bind(modal);
    modal.onClose = () => {
      close();
      if (this.resourceModal === modal) {
        this.resourceModal = null;
        this.relatedTargetPanel = null;
      }
    };
    this.resourceModal = modal;
    modal.open();
    return modal;
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
  }
  async loadRawTaskContent(taskPath) {
    var _a;
    if (this.shell.context.kind !== "task" || !("resourcePath" in this.shell.context) || this.shell.context.resourcePath !== taskPath) return;
    (_a = this.rawContentController) == null ? void 0 : _a.abort();
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
    var _a, _b, _c;
    this.closeResourceModal();
    this.renderGeneration++;
    this.clearRenderLifetime();
    for (const name of ["pointerdown", "keydown", "wheel"]) (_b = (_a = this.contentEl).removeEventListener) == null ? void 0 : _b.call(_a, name, this.onReadingInteraction);
    this.readingState.clear();
    this.clearRawTaskContent();
    (_c = this.cancelInitialSync) == null ? void 0 : _c.call(this);
    this.cancelInitialSync = null;
    this.shell.close();
    this.taskAdapter.close();
    this.pendingMarkdown = [];
    this.contentEl.empty();
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
  async settingsChanged() {
    this.clearRawTaskContent();
    if ("resourcePath" in this.shell.context) await this.shell.select(this.shell.context, { force: true });
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
  clearRenderLifetime() {
    this.renderController.abort();
    if (this.markdownScope) this.removeChild(this.markdownScope);
    this.markdownScope = null;
  }
  renderShell() {
    const container = this.contentEl;
    const generation = ++this.renderGeneration, interaction = this.readingInteraction;
    this.pendingMarkdown = [];
    this.rendering = true;
    this.readingState.capture(this.renderedResource, container, { position: this.positionRestored || interaction !== this.lastRenderInteraction });
    this.clearRenderLifetime();
    this.renderController = new AbortController();
    this.markdownScope = this.addChild(new import_obsidian2.Component());
    this.positionRestored = false;
    this.lastRenderInteraction = interaction;
    const nextResource = "resourcePath" in this.shell.context ? `${this.shell.context.kind}:${this.shell.context.resourcePath}` : "";
    if (nextResource !== this.renderedResource) this.closeResourceModal();
    this.renderedResource = nextResource;
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
          previousTaskPath: this.shell.context.previousResourcePath
        });
        return;
      }
      if (this.shell.context.kind === "empty") {
        container.createDiv({
          cls: "flowdesk-empty",
          text: "\u6253\u5F00\u4E00\u4E2A TaskNotes \u4EFB\u52A1\u6216 Work Case \u4EE5\u67E5\u770B Dashboard\u3002"
        });
      }
    } finally {
      const resource = this.renderedResource;
      this.readingState.restore(resource, container, { position: false });
      this.rendering = false;
      const pending = [...this.pendingMarkdown];
      const restore = () => {
        if (generation !== this.renderGeneration || resource !== this.renderedResource) return;
        if (interaction === this.readingInteraction) this.readingState.restore(resource, container, { disclosures: false });
        this.positionRestored = true;
      };
      if (!pending.length) restore();
      else void Promise.allSettled(pending).then(() => {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
        else restore();
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
      this.renderSettingsAction(container);
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
      this.renderSettingsAction(container);
      return;
    }
    const presentation = createDashboardPresentation(model);
    this.renderHeader(container, model, presentation);
    this.renderTrustStrip(container, presentation.trust, this.plugin.snapshotCoreInfo(snapshot));
    const overview = renderTaskOverview(container, model, {
      renderMarkdown: (text2, element, taskId) => this.renderSourceMarkdown(text2, element, taskId),
      openSource: (taskId, source, heading, text2) => this.openSnapshotSource(taskId, source, heading, text2)
    });
    if (presentation.primaryStatus.diagnostic) this.renderPrimaryDiagnostic(overview, presentation.primaryStatus, model.currentTask.title, model.currentTask.id);
    const navigation = container.createDiv({ cls: "flowdesk-reading-navigation" });
    const read = navigation.createEl("button", { text: "\u9605\u8BFB\u6B63\u6587", attr: { "data-focus-key": "read-body" } });
    read.addEventListener("click", () => {
      var _a;
      const target = this.contentEl.querySelector(".flowdesk-contract-summary");
      (_a = target == null ? void 0 : target.scrollIntoView) == null ? void 0 : _a.call(target, { block: "start", behavior: "smooth" });
    });
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
  renderSettingsAction(container) {
    const settings = container.createEl("button", { cls: "flowdesk-open-settings", text: "\u6253\u5F00 Dashboard \u8BBE\u7F6E" });
    settings.addEventListener("click", () => this.plugin.openDashboardSettings());
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
    const more = actions.createEl("button", { cls: "flowdesk-more-actions", text: "\u22EF", attr: { "aria-label": "\u66F4\u591A\u64CD\u4F5C", "data-focus-key": "task-more" } });
    more.addEventListener("click", () => this.displayResourceModal(new DashboardActionsModal(this.app, "\u66F4\u591A\u64CD\u4F5C", [
      { label: "\u590D\u5236\u4EA4\u63A5\u4E0A\u4E0B\u6587", run: () => navigator.clipboard.writeText(this.taskHandoffText(model)) },
      { label: "\u67E5\u770B\u4EA4\u63A5\u4E0A\u4E0B\u6587", run: () => {
        this.displayResourceModal(createReadOnlyTextModal(this.app, "\u4EA4\u63A5\u4E0A\u4E0B\u6587", this.taskHandoffText(model)));
      } },
      { label: "\u67E5\u770B\u539F\u6587\u4EF6", run: () => this.openTask(model.currentTask.id) }
    ])));
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
    if (presentation.kind === "parent") badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.kindLabel });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.priority });
    if (model.currentTask.isBlocked) {
      badges.createSpan({ cls: "flowdesk-state-pill is-error", text: "\u5B58\u5728\u963B\u585E" });
    }
    metaRow.createDiv({
      cls: "flowdesk-task-read-meta",
      text: `${this.loading ? "\u5237\u65B0\u4E2D \xB7 \u4E0A\u6B21\u8BFB\u53D6" : "\u8BFB\u53D6\u4E8E"} ${formatDisplayTime(model.observation.loadedAt)}`,
      attr: { title: `producer \u751F\u6210\u4E8E ${model.observation.generatedAt}` }
    });
  }
  renderToolbar(container, taskPath, model) {
    const toolbar = container.createDiv({ cls: "flowdesk-dashboard-toolbar" });
    const copy = toolbar.createEl("button", {
      cls: "flowdesk-toolbar-button",
      attr: { "aria-label": "\u590D\u5236 CLI", title: "\u590D\u5236 CLI" }
    });
    (0, import_obsidian2.setIcon)(copy, "copy");
    copy.addEventListener("click", async () => {
      try {
        await this.plugin.copyDashboardCommand(taskPath);
        new import_obsidian2.Notice("CLI \u547D\u4EE4\u5DF2\u590D\u5236");
      } catch (error) {
        new import_obsidian2.Notice(`\u65E0\u6CD5\u590D\u5236 CLI \u547D\u4EE4\uFF1A${String(error)}`);
      }
    });
    const refresh = toolbar.createEl("button", {
      cls: "flowdesk-toolbar-button",
      attr: {
        "aria-label": this.loading ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0",
        title: this.loading ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0"
      }
    });
    (0, import_obsidian2.setIcon)(refresh, "refresh-cw");
    refresh.disabled = this.loading;
    refresh.addEventListener("click", () => void this.refreshCurrentTask());
  }
  renderNonTaskState(container, context) {
    const card = container.createDiv({ cls: "flowdesk-context-pause" });
    card.createDiv({ cls: "flowdesk-card-kicker", text: "Dashboard \u4E0D\u53EF\u7528" });
    card.createDiv({
      cls: "flowdesk-primary-title",
      text: "\u5F53\u524D\u6587\u4EF6\u662F\u8D44\u6599\u9875\uFF1B\u6253\u5F00 Task \u6216 Case \u53EF\u67E5\u770B\u770B\u677F\u3002"
    });
    card.createDiv({ cls: "flowdesk-subline", text: `\u5F53\u524D\u6587\u4EF6\uFF1A${context.activePath}` });
    if (context.previousTaskPath) {
      const file = this.app.vault.getAbstractFileByPath(context.previousTaskPath);
      const available = file instanceof import_obsidian2.TFile && (this.plugin.isTaskFile(file) || ["work-case", "session"].includes(this.plugin.workCaseType(file)));
      const back = card.createEl("button", { cls: "flowdesk-return-resource", text: "\u2190 \u8FD4\u56DE\u5DE5\u4F5C\u770B\u677F", attr: { title: "\u56DE\u5230\u521A\u624D\u67E5\u770B\u7684\u4EFB\u52A1\u6216Case" } });
      back.disabled = !available;
      back.addEventListener("click", () => {
        void this.openTask(context.previousTaskPath);
      });
      if (!available) card.createDiv({ cls: "flowdesk-muted", text: "\u539F Task/Case \u5DF2\u4E0D\u53EF\u5B9A\u4F4D\uFF0C\u8BF7\u4ECE\u6587\u4EF6\u5217\u8868\u91CD\u65B0\u9009\u62E9\u3002" });
    }
  }
  renderTrustStrip(container, trust, core) {
    const strip = container.createEl("details", {
      cls: `flowdesk-trust-summary is-${trust.tone}`,
      attr: { title: trust.tooltip, "data-disclosure-key": "task-source" }
    });
    const summary = strip.createEl("summary");
    summary.createSpan({ cls: "flowdesk-trust-dot", attr: { "aria-hidden": "true" } });
    summary.createSpan({ cls: "flowdesk-trust-badge", text: trust.label });
    if (core) summary.createSpan({ cls: "flowdesk-core-version", text: `Core ${core.version}` });
    strip.createSpan({ cls: "flowdesk-trust-source", text: trust.sourceLabel });
    strip.createSpan({
      cls: `flowdesk-trust-contract is-${trust.contractTone}`,
      text: trust.contractLabel
    });
    strip.createDiv({ cls: "flowdesk-muted", text: trust.tooltip });
    if (core) strip.createDiv({ cls: "flowdesk-muted", text: `${core.source} \xB7 ${core.root}${core.notices.length ? "\n" + core.notices.join("\n") : ""}` });
  }
  renderPrimaryDiagnostic(container, status, taskTitle, taskId) {
    const card = container.createDiv({
      cls: `flowdesk-primary-status is-${status.tone}`
    });
    card.createDiv({
      cls: "flowdesk-card-kicker",
      text: "\u9700\u5904\u7406\u7684\u95EE\u9898"
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
    diagnosticRow(card, "\u539F\u56E0", status.reason);
    diagnosticRow(card, "\u5EFA\u8BAE\u5904\u7406", status.remediation);
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
      new import_obsidian2.Notice("\u95EE\u9898\u5DF2\u590D\u5236");
    } catch (error) {
      new import_obsidian2.Notice(`\u65E0\u6CD5\u590D\u5236\u95EE\u9898\uFF1A${String(error)}`);
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
      if (!signal.aborted) new import_obsidian2.Notice(`\u65E0\u6CD5\u6253\u5F00\u51C6\u786E\u539F\u6587\uFF1A${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      if (this.navigationOpening === opening) this.navigationOpening = null;
    }
  }
  async openSnapshotSource(taskPath, source, sourceKind = "\u6765\u6E90", text2 = "") {
    var _a, _b;
    if (!taskPath) {
      new import_obsidian2.Notice("producer\u672A\u63D0\u4F9B\u51C6\u786ETask ID");
      return;
    }
    if (!source) {
      await this.openTask(taskPath);
      return;
    }
    const request = this.beginNavigation();
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof import_obsidian2.TFile) || file.path !== taskPath) {
      new import_obsidian2.Notice(`\u672A\u627E\u5230\u4EFB\u52A1\u6587\u4EF6\uFF1A${taskPath}`);
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
      new import_obsidian2.Notice(location.reason);
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
    if (!view || ((_a = view.file) == null ? void 0 : _a.path) !== taskPath || ((_b = view.getMode) == null ? void 0 : _b.call(view)) === "preview" || location.editorLine >= view.editor.lineCount()) {
      new import_obsidian2.Notice("\u4EFB\u52A1\u5DF2\u6253\u5F00\uFF1B\u5F53\u524D\u89C6\u56FE\u4E0D\u80FD\u786E\u8BA4\u7CBE\u786E\u4F4D\u7F6E\uFF0C\u8BF7\u67E5\u770B\u539F\u6587\u3002");
      return;
    }
    if (apiDetails === null || typeof view.editor.getValue !== "function") {
      new import_obsidian2.Notice("\u5F53\u524D\u7F16\u8F91\u5668\u4E0D\u80FD\u6838\u5BF9\u539F\u6587\uFF1B\u5DF2\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u3002");
      return;
    }
    location = locateTaskSource(view.editor.getValue(), apiDetails, { heading: sourceKind, level: 2, text: text2, source });
    if (location.kind === "note") {
      new import_obsidian2.Notice(location.reason);
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
      const candidates = [linkText, path6.posix.normalize(path6.posix.join(path6.posix.dirname(sourcePath), linkText))];
      for (const candidate of candidates) {
        const file = this.app.vault.getAbstractFileByPath(candidate);
        if (file instanceof import_obsidian2.TFile && file.path === candidate) return file.path;
      }
      const { path: linkpath } = (0, import_obsidian2.parseLinktext)(linkText);
      return (_d = (_c = (_b = (_a = this.app.metadataCache).getFirstLinkpathDest) == null ? void 0 : _b.call(_a, linkpath, sourcePath)) == null ? void 0 : _c.path) != null ? _d : null;
    };
  }
  async renderSourceMarkdown(text2, element, sourcePath) {
    var _a, _b, _c, _d;
    const modal = ((_a = this.resourceModal) == null ? void 0 : _a.contentEl.contains(element)) ? this.resourceModal : null;
    const signal = (_b = modal == null ? void 0 : modal.renderSignal) != null ? _b : this.renderController.signal;
    const component = (_d = (_c = modal == null ? void 0 : modal.markdownScope) != null ? _c : this.markdownScope) != null ? _d : this;
    const sources = collectMarkdownLinkSources(text2);
    let complete = false;
    element.addEventListener("click", (event) => {
      var _a2, _b2, _c2;
      const anchor = (_b2 = (_a2 = event.target) == null ? void 0 : _a2.closest) == null ? void 0 : _b2.call(_a2, "a");
      if (!anchor || !element.contains(anchor)) return;
      const href = anchor.getAttribute("data-href") || anchor.getAttribute("href");
      if (!href) return;
      const anchors = Array.from(element.querySelectorAll("a"));
      const origin = renderedLinkSource(sources, anchors.map((link) => {
        var _a3;
        return { href: link.getAttribute("data-href") || link.getAttribute("href") || "", label: (_a3 = link.textContent) != null ? _a3 : "" };
      }), anchors.indexOf(anchor), complete);
      if (origin === "wiki") return;
      const target = resolveRelatedTarget(href, { casePath: sourcePath, cwd: null, vaultRoot: this.plugin.vaultRoot(), resolveVaultLink: this.vaultLinkResolver(sourcePath) });
      const explicitFile = /^file:/i.test(href) || path6.isAbsolute(href);
      const literalHashFile = target.kind === "vault" && target.exactFile === true && ((_c2 = target.resolvedPath) == null ? void 0 : _c2.includes("#"));
      if (target.kind === "vault" && !explicitFile && !literalHashFile || target.kind === "url") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void this.openRelated(href, sourcePath, origin === "markdown" ? void 0 : "\u94FE\u63A5\u8BED\u6CD5\u6765\u6E90\u65E0\u6CD5\u552F\u4E00\u6838\u5BF9\uFF1B\u8BF7\u67E5\u770B\u539F\u6587\u6216\u590D\u5236\u5F15\u7528\u3002");
    }, true);
    const rendered = (async () => {
      await import_obsidian2.MarkdownRenderer.render(this.app, text2, element, sourcePath, component);
      if (signal.aborted) return;
      for (const checkbox of Array.from(element.querySelectorAll('input[type="checkbox"]'))) {
        checkbox.disabled = true;
        checkbox.setAttribute("aria-readonly", "true");
      }
      complete = true;
    })();
    if (this.rendering) this.pendingMarkdown.push(rendered);
    await rendered;
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
    const candidates = contexts ? this.app.vault.getMarkdownFiles().filter((file) => ["work-case", "session"].includes(this.plugin.workCaseType(file)) && contexts.includes(`@${path6.basename(file.path, ".md")}`)) : [];
    const chosen = chooseTaskCase(contexts, candidates.map((file) => ({ path: file.path, contextTag: `@${path6.basename(file.path, ".md")}`, cwd: null })));
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
      const history = section2.createEl("details", { cls: "flowdesk-task-history", attr: { "data-disclosure-key": "task-children-history" } });
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
    const details = container.createDiv({ cls: "flowdesk-contract-summary flowdesk-reading-card" });
    const heading = details.createDiv({ cls: "flowdesk-dashboard-section-title flowdesk-content-heading" });
    const icon = heading.createSpan({ cls: "flowdesk-content-icon" });
    (0, import_obsidian2.setIcon)(icon, "file-text");
    heading.createSpan({ text: "\u4EFB\u52A1\u8BE6\u60C5" });
    heading.createSpan({ cls: "flowdesk-content-caption", text: "\u8BF4\u660E \xB7 \u9A8C\u6536 \xB7 \u7ED3\u679C" });
    const body = details.createDiv({ cls: "flowdesk-detail-body" });
    const process2 = container.createDiv({ cls: "flowdesk-task-process flowdesk-reading-card" });
    const technical = container.createEl("details", { cls: "flowdesk-task-technical flowdesk-reading-card", attr: { "data-disclosure-key": "task-technical" } });
    technical.createEl("summary", { text: diagnosticCount ? `\u6280\u672F\u8BE6\u60C5 \xB7 ${diagnosticCount} \u9879\u8BCA\u65AD` : "\u6280\u672F\u8BE6\u60C5" });
    const renderedSections = /* @__PURE__ */ new Map();
    const contract = body.createDiv({ cls: "flowdesk-detail-section flowdesk-contract-reading" });
    renderedSections.set("contract", contract);
    new TaskContentRenderer({
      historyContainer: process2,
      signal: this.renderController.signal,
      trackRender: (promise) => {
        if (this.rendering) this.pendingMarkdown.push(promise);
      },
      renderMarkdown: (text2, element, taskPath) => this.renderSourceMarkdown(text2, element, taskPath),
      openSource: (taskPath, section2) => this.openSnapshotSource(taskPath, section2.source, section2.heading, section2.text)
    }).render(contract, model.content);
    if (!process2.children.length) process2.remove();
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
      if (section2) (sectionName === "contract" ? body : technical).appendChild(section2);
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
    if (!(file instanceof import_obsidian2.TFile)) {
      new import_obsidian2.Notice(`\u672A\u627E\u5230\u4EFB\u52A1\u6587\u4EF6\uFF1A${taskPath}`);
      return;
    }
    await this.app.workspace.getLeaf(taskNavigationLeafType(origin)).openFile(file);
  }
  async openCaseSource(casePath, source) {
    var _a, _b, _c;
    const request = this.beginNavigation(), file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof import_obsidian2.TFile) || file.path !== casePath) {
      new import_obsidian2.Notice(`\u672A\u627E\u5230Work Case\u6587\u4EF6\uFF1A${casePath}`);
      return;
    }
    let text2;
    try {
      text2 = await this.app.vault.cachedRead(file);
    } catch (error) {
      if (!request.current()) return;
      const opened = await this.openNavigationFile(file, request.signal);
      if (opened && !request.signal.aborted) new import_obsidian2.Notice(`Case\u6765\u6E90\u8BFB\u53D6\u5931\u8D25\uFF0C\u4EC5\u6253\u5F00\u6574\u5F20\u539F\u6587\uFF1A${error instanceof Error ? error.message : String(error)}`);
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
      new import_obsidian2.Notice("Case\u6765\u6E90\u5DF2\u53D8\u5316\u6216\u8D8A\u754C\uFF1B\u5DF2\u6253\u5F00\u6574\u5F20Case\u539F\u6587\u3002");
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
    if (!view || ((_b = view.file) == null ? void 0 : _b.path) !== casePath || ((_c = view.getMode) == null ? void 0 : _c.call(view)) === "preview" || source.lineStart - 1 >= view.editor.lineCount()) {
      new import_obsidian2.Notice("Case\u5DF2\u6253\u5F00\uFF1B\u5F53\u524D\u89C6\u56FE\u65E0\u6CD5\u786E\u8BA4\u7CBE\u786E\u4F4D\u7F6E\u3002");
      return;
    }
    const liveLines = view.editor.getValue().replace(/\r\n/g, "\n").split("\n");
    const liveSpan = liveLines.slice(source.lineStart - 1, source.lineEnd).join("\n");
    if (source.lineEnd > liveLines.length || expected && !liveSpan.includes(expected.text.replace(/\r\n/g, "\n"))) {
      new import_obsidian2.Notice("Case\u7F16\u8F91\u5668\u539F\u6587\u5DF2\u53D8\u5316\uFF1B\u4E0D\u731C\u4F4D\u7F6E\u3002");
      return;
    }
    const position = { line: source.lineStart - 1, ch: 0 };
    view.editor.setCursor(position);
    view.editor.scrollIntoView({ from: position, to: position }, true);
    view.editor.focus();
  }
  taskHandoffText(model) {
    const progress = createTaskCurrentProgress(model.content, { statusIsCompleted: model.currentTask.statusIsCompleted, observedAt: model.observation.generatedAt, observationHealthy: model.observation.isTrustworthy && !model.observation.isStale && !model.diagnostics.some((item) => /truncat|omitted|too_large/i.test(item.code)) });
    const lines = ["\u4EA4\u63A5\u4E0A\u4E0B\u6587\uFF08\u53EA\u8BFB\u89C2\u6D4B\uFF1B\u7EE7\u7EED\u524D\u56DE\u8BFB\uFF09", `\u51C6\u786E Task\uFF1A${model.currentTask.id}`, `\u539F\u72B6\u6001\uFF1A${model.currentTask.status}`, `\u76EE\u6807\uFF1A${excerpt(model.content.goal, 450)}`, `\u89C2\u6D4B\u65F6\u95F4\uFF1A${model.observation.generatedAt}`];
    if (model.currentTask.statusIsCompleted === true) {
      const result = latestRecord(model.content.records.execution);
      lines.push(`\u7ED3\u679C\u6458\u5F55\uFF1A${result ? excerpt(firstParagraph(result.text), 650) : "\u6700\u8FD1\u7ED3\u679C\u672A\u786E\u8BA4\uFF0C\u67E5\u770B\u539F\u6587\u4EF6"}`);
    } else {
      if (progress.progress) lines.push(`\u8FDB\u5C55\u6458\u5F55\uFF1A${excerpt(firstParagraph(progress.progress), 650)}`);
      if (progress.next !== null) lines.push(`\u4E0B\u4E00\u6B65\u6458\u5F55\uFF1A${excerpt(progress.next, 500)}`);
    }
    if (progress.gaps.length) lines.push(`\u7F3A\u53E3\uFF1A${progress.gaps.join("\uFF1B")}`);
    lines.push("\u6750\u6599\u4E0D\u542F\u52A8Task\u6216\u6388\u4E88\u63A5\u624B\u6743\u9650\u3002\u7EE7\u7EED\u524D\u56DE\u8BFB\u6700\u65B0TaskNotes\u4E0E\u539F\u6587\uFF0C\u660E\u786E\u672A\u5B8C\u6210Next\uFF0C\u5DF2\u7ED3\u675F\u9879\u4E0D\u91CD\u505A\uFF1B\u6362\u8F7D\u4F53\u5148\u4FDD\u5B58\u8FDB\u5C55\u5E76\u6B63\u5E38\u7ED3\u675F\u65E7\u6267\u884C\uFF0C\u91CA\u653E\u672A\u77E5\u65F6\u53EA\u8BFB\u6216\u56DE\u539Fowner\u3002");
    return lines.join("\n");
  }
  async openCaseProperties(casePath) {
    const file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof import_obsidian2.TFile) || file.path !== casePath || !["work-case", "session"].includes(this.plugin.workCaseType(file))) {
      new import_obsidian2.Notice("\u65E0\u6CD5\u786E\u8BA4\u539FCase\u6587\u4EF6\uFF0C\u8BF7\u4ECE\u6587\u4EF6\u5217\u8868\u6838\u5BF9\u3002");
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file, { active: true, state: { mode: "source" } });
    new import_obsidian2.Notice("\u5728Case\u9876\u90E8\u5C5E\u6027\u4E2D\u7EF4\u62A4project\u3001plans\u3001docs\u548Crelated\uFF1B\u4FDD\u5B58\u540E\u770B\u677F\u4F1A\u5237\u65B0\u3002Dashboard\u4E0D\u4F1A\u4EE3\u5199\u8FD9\u4E9B\u5C5E\u6027\u3002");
  }
  async openRelated(raw, sourcePath, sourceError, direct = false) {
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
      if (!(baseFile instanceof import_obsidian2.TFile) || target.exactFile && baseFile.path !== target.resolvedPath) {
        target = { kind: "unavailable", label: target.label, reason: `\u672A\u627E\u5230\u5DF2\u786E\u8BA4\u7684vault\u539F\u6587\u4EF6\uFF1A${target.linkText}\uFF1B\u4E0D\u4F1A\u521B\u5EFA\u6216\u6539\u9009\u540C\u540D\u7B14\u8BB0\u3002` };
      } else if (baseFile.extension.toLowerCase() === "json") {
        const fragment = (_b = target.fragment) != null ? _b : target.exactFile ? void 0 : (0, import_obsidian2.parseLinktext)(target.linkText).subpath || void 0;
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
    let firstOutcome = null;
    if (direct && target.kind === "repository" && /\.md$/i.test(path6.extname(target.absolutePath))) {
      new import_obsidian2.Notice("\u6B63\u5728\u6253\u5F00\u6587\u6863\u2026");
      try {
        firstOutcome = await this.plugin.openRepositoryMarkdown(target.absolutePath);
      } catch (e) {
        firstOutcome = { kind: "unknown", message: "\u6253\u5F00\u7ED3\u679C\u672A\u77E5\uFF1B\u8BF7\u6838\u5BF9\u539F\u6587\u4EF6\uFF0C\u4E0D\u81EA\u52A8\u91CD\u8BD5\u3002" };
      }
      if (!request.current()) return;
      if (firstOutcome.kind === "accepted") {
        new import_obsidian2.Notice(firstOutcome.message);
        return;
      }
    }
    const modal = this.displayResourceModal(new DashboardContentModal(this.app, "\u5F15\u7528\u8D44\u6599", () => {
    }));
    const panel = modal.contentEl.createDiv({ cls: "flowdesk-dashboard-section flowdesk-related-target" });
    this.relatedTargetPanel = panel;
    const isFileTarget = target.kind === "repository" || target.kind === "vault";
    const pathText = target.kind === "repository" ? target.absolutePath : target.kind === "vault" && target.resolvedPath ? path6.join(context.vaultRoot, target.resolvedPath) : raw;
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
    if (target.kind === "repository" && /\.md$/i.test(path6.extname(target.absolutePath))) {
      const documentPath = target.absolutePath;
      const result = panel.createDiv({ cls: "flowdesk-repository-open-feedback", attr: { role: "status" }, text: (_e = firstOutcome == null ? void 0 : firstOutcome.message) != null ? _e : "\u70B9\u51FB\u540E\u5411 Obsidian \u63D0\u4EA4\u6253\u5F00\u6B64\u539F\u6587\u4EF6\u7684\u8BF7\u6C42\u3002" });
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
    } else if (isFileTarget && /\.json$/i.test(path6.extname(pathText))) {
      panel.createDiv({ cls: "flowdesk-muted", text: "JSON\u8D44\u6599\u4EC5\u63D0\u4F9B\u51C6\u786E\u8DEF\u5F84\u4E0E\u539F\u5F15\u7528\uFF1B\u53EF\u901A\u8FC7\u5173\u8054\u7684Markdown\u8BC1\u636E\u7D22\u5F15\u67E5\u770B\u8BF4\u660E\u3002" });
    }
  }
};
var DashboardSettingsModal = class extends import_obsidian2.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.tab = null;
  }
  onOpen() {
    this.tab = new FlowDeskDashboardSettingTab(this.app, this.plugin);
    this.tab.containerEl = this.contentEl;
    this.tab.display();
  }
  onClose() {
    var _a;
    (_a = this.tab) == null ? void 0 : _a.hide();
    this.contentEl.empty();
  }
};
var FlowDeskDashboardSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("flowdesk-dashboard-settings");
    containerEl.createEl("h2", { text: "FlowDesk Dashboard" });
    new import_obsidian2.Setting(containerEl).setName("Core \u6765\u6E90").setDesc("\u8DDF\u968F\u6A21\u5F0F\u4F18\u5148\u4F7F\u7528 Claude \u5B89\u88C5\u767B\u8BB0\uFF0C\u7F3A\u5931\u65F6\u68C0\u67E5 Codex \u7F13\u5B58\uFF1B\u56FA\u5B9A\u6A21\u5F0F\u4F7F\u7528\u6307\u5B9A\u8DEF\u5F84\u3002").addDropdown((dropdown) => {
      var _a;
      return dropdown.addOption("installed", "\u8DDF\u968F\u5DF2\u5B89\u88C5 Core").addOption("fixed", "\u56FA\u5B9A\u8DEF\u5F84").setValue((_a = this.plugin.settings.coreMode) != null ? _a : this.plugin.settings.flowdeskRoot ? "fixed" : "installed").onChange(async (value) => {
        this.plugin.settings.coreMode = value;
        await this.plugin.saveSettings();
        this.display();
      });
    });
    const status = containerEl.createDiv({ cls: "flowdesk-core-settings-status", attr: { role: "status" } });
    const inspect = () => {
      status.empty();
      const heading = status.createDiv({ cls: "flowdesk-core-status-head" });
      try {
        const core = this.plugin.inspectCore();
        heading.createSpan({ cls: "flowdesk-core-version", text: `Core ${core.version}` });
        const recheck = heading.createEl("button", { cls: "flowdesk-core-recheck", text: "\u91CD\u65B0\u68C0\u67E5" });
        recheck.addEventListener("click", inspect);
        const source = status.createDiv({ cls: "flowdesk-core-row" });
        source.createSpan({ cls: "flowdesk-core-label", text: "\u6765\u6E90" });
        source.createSpan({ text: { fixed: "\u56FA\u5B9A\u8DEF\u5F84", "claude-installed": "Claude \u5B89\u88C5\u767B\u8BB0", "codex-cache": "Codex \u7F13\u5B58" }[core.source] });
        const location = status.createDiv({ cls: "flowdesk-core-row" });
        location.createSpan({ cls: "flowdesk-core-label", text: "\u8DEF\u5F84" });
        location.createSpan({ cls: "flowdesk-core-path", text: core.root });
        for (const note of core.notices) status.createDiv({ cls: "flowdesk-core-note", text: note });
      } catch (error2) {
        heading.createSpan({ cls: "flowdesk-core-version", text: "Core \u672A\u786E\u8BA4" });
        status.createDiv({ cls: "flowdesk-error", text: error2 instanceof Error ? error2.message : String(error2) });
        const recheck = heading.createEl("button", { cls: "flowdesk-core-recheck", text: "\u91CD\u65B0\u68C0\u67E5" });
        recheck.addEventListener("click", inspect);
      }
    };
    inspect();
    new import_obsidian2.Setting(containerEl).setName("\u56FA\u5B9A Core \u8DEF\u5F84").setDesc("\u4FDD\u7559\u539F\u8DEF\u5F84\uFF1B\u53EA\u6709\u56FA\u5B9A\u6A21\u5F0F\u4F7F\u7528\u3002\u9700\u5305\u542B Task \u4E0E Case producer\u3002").addText((text2) => text2.setPlaceholder("/Users/me/workspaces/flowdesk-plugin").setValue(this.plugin.settings.flowdeskRoot).onChange(async (value) => {
      this.plugin.settings.flowdeskRoot = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("\u5DE5\u4F5C\u76EE\u5F55").setDesc("\u4F20\u7ED9 Task snapshot \u7684 --working-directory\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528\u6240\u9009 Core \u8DEF\u5F84\u3002").addText((text2) => text2.setValue(this.plugin.settings.workingDirectory).onChange(async (value) => {
      this.plugin.settings.workingDirectory = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("TaskNotes API \u5730\u5740").setDesc("\u7559\u7A7A\u4F7F\u7528\u73AF\u5883\u914D\u7F6E\u6216\u672C\u673A\u9ED8\u8BA4\u5730\u5740\u3002").addText((text2) => text2.setPlaceholder("http://127.0.0.1:18090").setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
      this.plugin.settings.apiUrl = value.trim();
      await this.plugin.saveSettings();
    }));
    let tokenInput, jsonInput;
    let configured = {};
    try {
      configured = parseTaskNotesEnvironment(this.plugin.settings.tasknotesEnv);
    } catch (e) {
    }
    const token = new import_obsidian2.Setting(containerEl).setName("TaskNotes token").setDesc("\u9ED8\u8BA4\u906E\u4F4F\uFF0C\u4FDD\u5B58\u5728\u65E2\u6709\u73AF\u5883\u53D8\u91CF\u914D\u7F6E\u4E2D\u3002\u6709\u6548\u8BBE\u7F6E\u4FDD\u5B58\u540E\u4F1A\u81EA\u52A8\u5237\u65B0\u770B\u677F\u3002");
    const tokenError = token.descEl.createDiv({ attr: { role: "status" } });
    token.addText((text2) => {
      tokenInput = text2.inputEl;
      tokenInput.type = "password";
      tokenInput.autocomplete = "off";
      text2.setPlaceholder("\u672A\u914D\u7F6E").setValue(configured.TASKNOTES_API_TOKEN || configured.TASKNOTES_AUTH_TOKEN || "").onChange(async (value) => {
        try {
          const environment = parseTaskNotesEnvironment(this.plugin.settings.tasknotesEnv);
          environment.TASKNOTES_API_TOKEN = value;
          environment.TASKNOTES_AUTH_TOKEN = "";
          const serialized = JSON.stringify(environment, null, 2);
          resolveTaskNotesAuth(serialized, {});
          this.plugin.settings.tasknotesEnv = serialized;
          tokenError.setText("");
          if (jsonInput) jsonInput.value = serialized;
          await this.plugin.saveSettings();
        } catch (error2) {
          tokenError.setText(error2 instanceof Error ? error2.message : "token \u5C1A\u672A\u4FDD\u5B58");
        }
      });
    });
    token.addExtraButton((button) => button.setIcon("eye").setTooltip("\u663E\u793A\u6216\u906E\u4F4F token").onClick(() => {
      if (tokenInput) tokenInput.type = tokenInput.type === "password" ? "text" : "password";
    }));
    const advanced = containerEl.createEl("details", { cls: "flowdesk-advanced-settings" });
    advanced.createEl("summary", { text: "\u9AD8\u7EA7\u73AF\u5883\u53D8\u91CF JSON" });
    const environmentSetting = new import_obsidian2.Setting(advanced).setName("TaskNotes \u73AF\u5883\u53D8\u91CF").setDesc("\u4FDD\u7559\u539F\u6709\u53D8\u91CF\u5408\u5E76\u89C4\u5219\uFF1B\u5C55\u5F00\u540E\u53EF\u67E5\u770B\u5E76\u7F16\u8F91\u5168\u90E8\u914D\u7F6E\u3002");
    const error = environmentSetting.descEl.createDiv({ attr: { role: "status" } });
    environmentSetting.addTextArea((text2) => {
      jsonInput = text2.inputEl;
      jsonInput.rows = 5;
      jsonInput.spellcheck = false;
      text2.setValue(this.plugin.settings.tasknotesEnv).onChange(async (value) => {
        try {
          resolveTaskNotesAuth(value);
          const environment = parseTaskNotesEnvironment(value);
          this.plugin.settings.tasknotesEnv = value.trim() || "{}";
          error.setText("");
          if (tokenInput) tokenInput.value = environment.TASKNOTES_API_TOKEN || environment.TASKNOTES_AUTH_TOKEN || "";
          await this.plugin.saveSettings();
        } catch (failure) {
          error.setText(`${failure instanceof Error ? failure.message : "\u73AF\u5883\u914D\u7F6E\u65E0\u6548"} \u5C1A\u672A\u4FDD\u5B58\u3002`);
        }
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
  return path6.basename(taskPath, path6.extname(taskPath));
}
function expandHomePath(value) {
  if (value === "~") return (0, import_os.homedir)();
  if (value.startsWith("~/")) return path6.join((0, import_os.homedir)(), value.slice(2));
  return value;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FLOWDESK_DASHBOARD_VIEW_TYPE
});
