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
var path4 = __toESM(require("path"));
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
    const v4ProtocolValid = (protocol == null ? void 0 : protocol.producer_protocol_version) === 4 && protocol.task_contract_schema === "flowdesk.task-contract/4" && protocol.evidence_contract_schema === "flowdesk.evidence-contract/1" && protocol.evidence_record_schema === "flowdesk.evidence-record/1" && protocol.review_record_schema === "flowdesk.review-record/1" && protocol.legacy_policy === "explicit_legacy_v3";
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

// src/snapshot-invocation.ts
var path = __toESM(require("path"));
function buildSnapshotInvocation(input, format) {
  const flowdeskRoot = path.resolve(input.flowdeskRoot);
  const workingDirectory = path.isAbsolute(input.workingDirectory) ? input.workingDirectory : path.resolve(flowdeskRoot, input.workingDirectory);
  const args = [input.taskPath];
  if (input.apiUrl) {
    args.push("--api-url", input.apiUrl);
  }
  args.push("--vault", path.resolve(input.vaultPath));
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

// src/review-invocation.ts
var path2 = __toESM(require("path"));
function buildReviewInvocation(input) {
  const flowdeskRoot = path2.resolve(input.flowdeskRoot);
  const taskPath = input.taskPath.trim();
  const digest = input.digest.trim();
  const requirementUids = [
    ...new Set(input.requirementUids.map((uid) => uid.trim()).filter(Boolean))
  ];
  if (!taskPath) throw new Error("review task path \u4E0D\u80FD\u4E3A\u7A7A");
  if (!/^sha256:.+/.test(digest)) {
    throw new Error("review evidence bundle digest \u5FC5\u987B\u662F sha256 \u503C");
  }
  if (!requirementUids.length) {
    throw new Error("review \u81F3\u5C11\u9700\u8981\u4E00\u4E2A requirement UID");
  }
  if (!input.vaultPath.trim()) {
    throw new Error("review vault path \u4E0D\u80FD\u4E3A\u7A7A");
  }
  const args = [
    "review",
    "--task-id",
    taskPath,
    "--evidence-bundle-digest",
    digest,
    "--decision",
    input.decision
  ];
  for (const uid of requirementUids) {
    args.push("--requirement-uid", uid);
  }
  args.push(
    "--note",
    input.note,
    "--reviewer-kind",
    "user",
    "--reviewer-surface",
    "obsidian-dashboard",
    "--vault",
    path2.resolve(input.vaultPath)
  );
  if (input.apiUrl.trim()) {
    args.push("--api-url", input.apiUrl.trim());
  }
  return {
    executable: path2.join(flowdeskRoot, "bin", "flowdesk-evidence"),
    args,
    cwd: flowdeskRoot
  };
}
function parseReviewCommandFailure(error) {
  const failure = isRecord(error) ? error : {};
  for (const output of [failure.stdout, failure.stderr]) {
    if (typeof output !== "string" || !output.trim()) continue;
    try {
      const payload = JSON.parse(output);
      if (isRecord(payload)) {
        return {
          code: text(payload.code, "review_request_rejected"),
          message: text(payload.error, text(payload.message, "\u590D\u6838\u8BF7\u6C42\u5931\u8D25"))
        };
      }
    } catch (e) {
    }
  }
  return {
    code: "review_request_rejected",
    message: text(failure.message, "\u590D\u6838\u8BF7\u6C42\u5931\u8D25")
  };
}
function canReviewEvidence(input) {
  return input.trustLevel === "review_required" && input.observationTrustworthy && input.sourceIdentity === true && input.sourceIdentityMatch === true && typeof input.evidenceBundleDigest === "string" && /^sha256:.+/.test(input.evidenceBundleDigest) && input.requirementUids.some((uid) => Boolean(uid.trim()));
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

// src/snapshot-model.ts
function createDashboardViewModel(value, options = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$, _aa, _ba, _ca, _da, _ea, _fa, _ga, _ha, _ia, _ja, _ka, _la, _ma, _na, _oa, _pa;
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
  return {
    errorCode: !schemaSupported ? "unsupported_snapshot_schema" : !modelSupported ? "unsupported_snapshot_model" : !protocolSupported ? "unsupported_snapshot_protocol" : null,
    schemaSupported,
    modelSupported,
    schemaLabel: schemaSupported && modelSupported && protocolSupported ? isV4 ? "snapshot v4 \xB7 task-centric" : "snapshot v3 \xB7 task-centric \xB7 legacy_v3" : "\u4E0D\u652F\u6301\u7684 snapshot \u6A21\u578B",
    currentTask: {
      id: currentTaskId,
      title: normalizeText(currentTask.title, "\u672A\u63D0\u4F9B\u4EFB\u52A1\u6807\u9898"),
      status: normalizeText(currentTask.status, "unknown"),
      priority: normalizeText(currentTask.priority, "\u672A\u63D0\u4F9B"),
      isBlocked: currentTask.is_blocked === true,
      blockedBy: ((_p = currentTask.blocked_by) != null ? _p : []).map(normalizeBlockedBy).filter(Boolean),
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
      blockedChildren: (_q = rollup.blocked_children) != null ? _q : [],
      incompleteChildren: (_r = rollup.incomplete_children) != null ? _r : [],
      contradictions: (_s = rollup.contradictions) != null ? _s : []
    },
    contract: {
      version: isV4 ? normalizeText(
        (_u = (_t = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _t.task_contract) == null ? void 0 : _u.schema,
        normalizeText(
          (_w = (_v = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _v.task_contract) == null ? void 0 : _w.version,
          "\u672A\u63D0\u4F9B"
        )
      ) : normalizeText((_x = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _x.version, "\u672A\u63D0\u4F9B"),
      goal: isV4 ? normalizeText((_z = (_y = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _y.task_contract) == null ? void 0 : _z.goal, "\u672A\u63D0\u4F9B") : normalizeText((_A = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _A.goal, "\u672A\u63D0\u4F9B"),
      scope: {
        included: (_I = (_H = isV4 ? (_D = (_C = (_B = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _B.task_contract) == null ? void 0 : _C.scope) == null ? void 0 : _D.included : (_G = (_F = (_E = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _E.scope) == null ? void 0 : _F.included) != null ? _G : []) == null ? void 0 : _H.map(String)) != null ? _I : [],
        excluded: (_Q = (_P = isV4 ? (_L = (_K = (_J = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _J.task_contract) == null ? void 0 : _K.scope) == null ? void 0 : _L.excluded : (_O = (_N = (_M = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _M.scope) == null ? void 0 : _N.excluded) != null ? _O : []) == null ? void 0 : _P.map(String)) != null ? _Q : []
      },
      semanticStatus: isV4 ? ((_R = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _R.status) === "legacy_v3" ? normalizeText(
        (_S = v4Snapshot.contract.task_contract) == null ? void 0 : _S.semantic_status,
        "unknown"
      ) : normalizeText((_T = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _T.status, "unknown") : normalizeText(
        (_U = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _U.semantic_status,
        "unknown"
      ),
      requirements: isV4 ? (_X = (_W = (_V = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _V.task_contract) == null ? void 0 : _W.requirements) != null ? _X : [] : (_Z = (_Y = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _Y.requirements) != null ? _Z : [],
      scenarios: isV4 ? (_aa = (_$ = (__ = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : __.task_contract) == null ? void 0 : _$.scenarios) != null ? _aa : [] : (_ca = (_ba = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _ba.scenarios) != null ? _ca : [],
      acceptance: isV4 ? (_fa = (_ea = (_da = v4Snapshot == null ? void 0 : v4Snapshot.contract) == null ? void 0 : _da.task_contract) == null ? void 0 : _ea.acceptance) != null ? _fa : [] : (_ha = (_ga = v3Snapshot == null ? void 0 : v3Snapshot.contract) == null ? void 0 : _ga.acceptance) != null ? _ha : []
    },
    evidenceRequirements,
    acceptance,
    review,
    protocol,
    evidence,
    observation: {
      health: observationHealth,
      currentTask: normalizeText((_ia = snapshot.observation) == null ? void 0 : _ia.current_task, "unknown"),
      parent: normalizeText((_ja = snapshot.observation) == null ? void 0 : _ja.parent, "unknown"),
      children: normalizeText((_ka = snapshot.observation) == null ? void 0 : _ka.children, "unknown"),
      tasknotesApi: normalizeText((_la = snapshot.observation) == null ? void 0 : _la.tasknotes_api, "unknown"),
      sourceIdentityMatch,
      sourceTaskId: snapshotSourceTaskId(snapshot),
      generatedAt: isV4 ? normalizeText((_ma = v4Snapshot == null ? void 0 : v4Snapshot.source) == null ? void 0 : _ma.generated_at, "\u672A\u63D0\u4F9B") : normalizeText(v3Snapshot == null ? void 0 : v3Snapshot.generated_at, "\u672A\u63D0\u4F9B"),
      isTrustworthy,
      trustMessage: isTrustworthy ? "\u89C2\u6D4B\u53EF\u4FE1" : "\u89C2\u6D4B\u4E0D\u53EF\u4FE1\uFF0C\u65E0\u6CD5\u5224\u65AD\u4EFB\u52A1\u662F\u5426\u6B63\u5E38",
      isStale: Boolean(staleReason) || ((_na = snapshot.observation) == null ? void 0 : _na.stale) === true,
      staleReason,
      loadedAt: normalizeText(options.loadedAt, "\u672A\u63D0\u4F9B"),
      sourceIdentity
    },
    primaryDiagnostic: (_oa = diagnostics[0]) != null ? _oa : null,
    diagnostics,
    nextAction: formatNextAction((_pa = snapshot.next_actions) == null ? void 0 : _pa[0])
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
  const normalized = {
    producerProtocolVersion: finiteNumber(protocol.producer_protocol_version),
    taskContractSchema: normalizeText(protocol.task_contract_schema, ""),
    evidenceContractSchema: normalizeText(protocol.evidence_contract_schema, ""),
    evidenceRecordSchema: normalizeText(protocol.evidence_record_schema, ""),
    reviewRecordSchema: normalizeText(protocol.review_record_schema, ""),
    legacyPolicy: normalizeText(protocol.legacy_policy, "")
  };
  return {
    supported: normalized.producerProtocolVersion === 4 && normalized.taskContractSchema === "flowdesk.task-contract/4" && normalized.evidenceContractSchema === "flowdesk.evidence-contract/1" && normalized.evidenceRecordSchema === "flowdesk.evidence-record/1" && normalized.reviewRecordSchema === "flowdesk.review-record/1" && normalized.legacyPolicy === "explicit_legacy_v3" || normalized.producerProtocolVersion === 4 && normalized.taskContractSchema === "legacy_v3" && protocol.evidence_contract_schema === null && protocol.evidence_record_schema === null && protocol.review_record_schema === null && normalized.legacyPolicy === "explicit_legacy_v3",
    ...normalized
  };
}
function normalizeCompletion(value, fallbackStatus) {
  const completion = value != null ? value : {};
  return {
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
  var _a, _b, _c;
  const evidence = normalizeEvidenceHealth(snapshot.evidence);
  const evidenceValues = [
    evidence.execution,
    evidence.verification,
    evidence.delivery
  ];
  const acceptance = (_b = (_a = snapshot.contract) == null ? void 0 : _a.acceptance) != null ? _b : [];
  return {
    lifecycleStatus: normalizeText(currentTask.status, "unknown"),
    contractStatus: normalizeText(
      (_c = snapshot.contract) == null ? void 0 : _c.semantic_status,
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
  var _a, _b, _c;
  const id = normalizeText(child.id, "");
  const completion = child.completion ? normalizeCompletion(child.completion, child.status) : null;
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
    semanticStatus: normalizeText(
      (_b = child.legacy_v3) == null ? void 0 : _b.semantic_status,
      normalizeText(child.semantic_status, "unknown")
    ),
    evidenceHealth: (completion == null ? void 0 : completion.trustLevel) === "legacy_v3" ? normalizeEvidenceHealth((_c = child.legacy_v3) == null ? void 0 : _c.evidence_health) : completion ? evidenceHealthFromCompletion(completion) : normalizeEvidenceHealth(child.evidence_health),
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
function nullableText(value) {
  const normalized = normalizeText(value, "");
  return normalized || null;
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
function createContractItemPresentation(item, kind) {
  const text2 = String(item.label || item.text || "\u672A\u63D0\u4F9B").trim() || "\u672A\u63D0\u4F9B";
  return {
    id: String(item.uid || item.id || "\u672A\u7F16\u53F7").trim() || "\u672A\u7F16\u53F7",
    text: text2,
    requirementIds: Array.isArray(item.covers) ? item.covers.map(String).filter(Boolean) : Array.isArray(item.requirement_ids) ? item.requirement_ids.map(String).filter(Boolean) : [],
    sourceLabel: formatContractSource(item),
    steps: kind === "scenario" ? parseScenarioSteps(text2) : null
  };
}
function formatContractSource(item) {
  var _a, _b, _c;
  const section = ((_a = item.source) == null ? void 0 : _a.section) || ((_b = item.source) == null ? void 0 : _b.after_section) || "\u4EFB\u52A1\u6587\u4EF6";
  const line = (_c = item.source) == null ? void 0 : _c.line_start;
  return typeof line === "number" && line > 0 ? `${section} \xB7 \u7B2C ${line} \u884C` : section;
}
function parseScenarioSteps(text2) {
  const match = text2.match(
    /^\s*Given\s+([\s\S]*?)[,，]\s*When\s+([\s\S]*?)[,，]\s*Then\s+([\s\S]+?)\s*$/i
  );
  if (!match) return null;
  return {
    given: match[1].trim(),
    when: match[2].trim(),
    then: match[3].trim()
  };
}
function resolveDisclosureState(previous, taskChanged) {
  if (!previous || taskChanged) {
    return {
      summaryOpen: true,
      fullOpen: false,
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
  const section = ((_a = diagnostic.source) == null ? void 0 : _a.section) || ((_b = diagnostic.source) == null ? void 0 : _b.after_section) || "";
  const line = (_d = (_c = diagnostic.source) == null ? void 0 : _c.line_start) != null ? _d : "";
  return JSON.stringify([
    taskPath,
    diagnostic.code,
    diagnostic.path,
    section,
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
  const reviewOrder = [
    "contract",
    "acceptance",
    "evidence",
    "observation"
  ];
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
  const diagnostics = model.diagnostics.map(
    (diagnostic) => createDiagnosticPresentation(diagnostic, model.currentTask.id)
  );
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
      status: formatTaskStatus(model.currentTask.status),
      tone: taskStatusTone(model.currentTask.status, model.currentTask.isBlocked),
      diagnostics: currentDiagnostics
    });
  }
  for (const child of model.children) {
    if (!child.primaryDiagnostic) continue;
    groups.push({
      kind: "child",
      taskId: child.id,
      taskTitle: child.title,
      status: formatTaskStatus(child.status),
      tone: taskStatusTone(child.status, child.isBlocked),
      diagnostics: [
        createDiagnosticPresentation(child.primaryDiagnostic, child.id)
      ]
    });
  }
  return groups;
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
  const isLegacy = model.currentTask.trustLevel === "legacy_v3";
  const contractLabel = isLegacy ? model.contract.semanticStatus === "valid" ? "v3 \u5386\u53F2\u5408\u540C\u6709\u6548" : "v3 \u5386\u53F2\u5408\u540C\u9700\u68C0\u67E5" : model.contract.semanticStatus === "valid" ? "\u5408\u540C\u6709\u6548" : model.contract.semanticStatus === "invalid" ? "\u5408\u540C\u5B58\u5728\u95EE\u9898" : "\u5408\u540C\u72B6\u6001\u672A\u77E5";
  const contractTone = model.contract.semanticStatus === "valid" ? "healthy" : model.contract.semanticStatus === "invalid" ? "error" : "muted";
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
  if (isLegacy) {
    const detail2 = model.currentTask.trustedDone ? "\u4FDD\u7559 SDD v3 \u5386\u53F2\u53EF\u4FE1\u7ED3\u8BBA\uFF1B\u672A\u81EA\u52A8\u8FC1\u79FB\u4E3A v4 attested" : "\u4FDD\u7559 SDD v3 \u5386\u53F2\u9A8C\u8BC1\u72B6\u6001\uFF1B\u672A\u81EA\u52A8\u8FC1\u79FB\u4E3A v4";
    return {
      tone: model.currentTask.trustedDone ? "healthy" : "warning",
      label: "v3 \u5386\u53F2\u9A8C\u8BC1",
      contractLabel,
      contractTone,
      sourceLabel: model.schemaLabel,
      tooltip: `${model.observation.generatedAt} \xB7 ${detail2}`,
      meta: `${model.schemaLabel} \xB7 ${model.observation.generatedAt}`,
      detail: detail2
    };
  }
  if (model.currentTask.trustLevel === "review_required") {
    const detail2 = "\u7ED3\u6784\u5316\u8BC1\u636E\u5DF2\u6EE1\u8DB3\uFF0C\u7B49\u5F85\u5BF9\u5F53\u524D evidence bundle \u4EBA\u5DE5\u590D\u6838";
    return {
      tone: "warning",
      label: "\u7B49\u5F85\u4EBA\u5DE5\u590D\u6838",
      contractLabel,
      contractTone,
      sourceLabel: model.schemaLabel,
      tooltip: `${model.observation.generatedAt} \xB7 ${detail2}`,
      meta: `${model.schemaLabel} \xB7 ${model.observation.generatedAt}`,
      detail: detail2
    };
  }
  if (["missing", "incomplete", "invalid", "failed"].includes(
    model.currentTask.completion.evidenceStatus
  )) {
    const detail2 = "\u5FC5\u9700\u7ED3\u6784\u5316 Evidence requirement \u5C1A\u672A\u5168\u90E8\u6EE1\u8DB3";
    return {
      tone: "warning",
      label: "\u8BC1\u636E\u5F85\u8865\u5145",
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
    label: model.currentTask.trustLevel === "attested_v4" ? "v4 \u53EF\u4FE1\u9A8C\u8BC1" : "\u89C2\u5BDF\u53EF\u4FE1",
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
      remediation: model.nextAction || "\u4F7F\u7528 Dashboard \u590D\u6838\u64CD\u4F5C\u786E\u8BA4\u6216\u8981\u6C42\u4FEE\u6539",
      location: "\u6267\u884C\u8BC1\u636E",
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
function createChildRow(child) {
  var _a, _b;
  const meta = [];
  const rawStatus = formatTaskStatus(child.status);
  const status = childStatusPresentation(child);
  if (!child.trustedDone && ["done", "complete", "completed"].includes(normalizeToken(child.status))) {
    meta.push(`TaskNotes ${rawStatus}`);
  }
  if (child.blockedBy.length) {
    meta.push(`\u963B\u585E\u4E8E ${child.blockedBy.map(formatTaskReference).join("\u3001")}`);
  }
  meta.push(formatChildEvidenceIssues(child.evidenceHealth));
  return {
    id: child.id,
    title: child.title,
    status: status.label,
    tone: status.tone,
    summary: (_b = (_a = child.primaryDiagnostic) == null ? void 0 : _a.reason) != null ? _b : formatRollupState(child.rollupState),
    meta: meta.join(" \xB7 ")
  };
}
function childStatusPresentation(child) {
  if (child.isBlocked) return { label: "\u5DF2\u963B\u585E", tone: "error" };
  if (child.trustedDone) return { label: "\u53EF\u4FE1\u5B8C\u6210", tone: "healthy" };
  if (child.primaryDiagnostic) {
    return {
      label: "\u9700\u5904\u7406",
      tone: child.primaryDiagnostic.severity === "warning" ? "warning" : "error"
    };
  }
  if (["done", "complete", "completed"].includes(normalizeToken(child.status))) {
    return { label: "\u5F85\u9A8C\u6536", tone: "warning" };
  }
  return {
    label: formatTaskStatus(child.status),
    tone: taskStatusTone(child.status)
  };
}
function formatTaskReference(taskId) {
  const filename = taskId.split("/").pop() || taskId;
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}
function createContractSummary(model) {
  const acceptanceTotal = model.acceptance.length || model.contract.acceptance.length;
  const checked = model.acceptance.length ? model.acceptance.filter((item) => item.status === "satisfied").length : model.contract.acceptance.filter((item) => item.checked === true).length;
  const evidenceTotal = model.evidenceRequirements.length || 3;
  const validEvidence = model.evidenceRequirements.length ? model.evidenceRequirements.filter(
    (item) => item.status === "satisfied" && item.matchedExpected !== false
  ).length : Object.values(model.evidence).filter((health) => health === "valid").length;
  return {
    goal: model.contract.goal,
    coverage: `REQ ${model.contract.requirements.length} \xB7 SCN ${model.contract.scenarios.length}`,
    acceptance: `\u9A8C\u6536 ${checked}/${acceptanceTotal}`,
    evidence: model.evidenceRequirements.length ? `\u7ED3\u6784\u5316\u8BC1\u636E ${validEvidence}/${evidenceTotal}` : formatEvidence(model.evidence),
    diagnostics: `${model.diagnostics.length} \u4E2A\u8BCA\u65AD`,
    metrics: [
      {
        label: "REQ / SCN",
        value: `${model.contract.requirements.length} / ${model.contract.scenarios.length}`
      },
      {
        label: "\u9A8C\u6536",
        value: `${checked} / ${acceptanceTotal}`
      },
      { label: "\u8BC1\u636E\u6709\u6548", value: `${validEvidence} / ${evidenceTotal}` }
    ]
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
    contract_invalid: "\u7ED3\u6784\u5316\u5408\u540C\u65E0\u6548",
    observation_unavailable: "TaskNotes \u89C2\u5BDF\u4E0D\u53EF\u7528",
    reference_unaccepted: "\u5B9E\u9A8C\u53C2\u8003\u771F\u503C\u4E0D\u88AB\u5408\u540C\u63A5\u53D7",
    "contract.goal": "\u4EFB\u52A1\u76EE\u6807\u9700\u8981\u4FEE\u590D",
    "evidence.execution": "\u6267\u884C\u7ED3\u679C\u9700\u8981\u4FEE\u590D",
    "evidence.verification": "\u9A8C\u8BC1\u7ED3\u679C\u9700\u8981\u4FEE\u590D",
    "evidence.delivery": "\u4EA4\u4ED8\u8BB0\u5F55\u9700\u8981\u4FEE\u590D"
  };
  if (labels[diagnostic.code]) return labels[diagnostic.code];
  if (labels[diagnostic.path]) return labels[diagnostic.path];
  if (diagnostic.path.startsWith("contract.")) return "\u4EFB\u52A1\u5408\u540C\u9700\u8981\u4FEE\u590D";
  if (diagnostic.path.startsWith("evidence.")) return "\u6267\u884C\u8BC1\u636E\u9700\u8981\u4FEE\u590D";
  return "\u5F53\u524D\u4EFB\u52A1\u5B58\u5728\u7ED3\u6784\u5316\u8BCA\u65AD";
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
function createStructuredEvidencePresentation(requirement, reviewStatus) {
  const status = requirement.status;
  const state = status === "satisfied" && requirement.matchedExpected !== false ? "done" : ["failed", "invalid", "record_drift", "stale"].includes(status) || requirement.matchedExpected === false ? "error" : "blocked";
  return {
    uid: requirement.uid,
    state,
    method: requirement.method,
    expected: formatStructuredRecord(requirement.expected, [
      "outcome",
      "exit_code"
    ]),
    actual: requirement.actual ? formatEvidenceActual(requirement.method, requirement.actual) : "\u5C1A\u65E0\u8FD0\u884C\u7ED3\u679C",
    provenance: requirement.provenance,
    review: !requirement.reviewRequired ? "\u65E0\u9700\u590D\u6838" : reviewStatus === "approved" ? "\u5DF2\u590D\u6838" : reviewStatus === "changes_requested" ? "\u8981\u6C42\u4FEE\u6539" : "\u5F85\u590D\u6838",
    status
  };
}
function formatEvidenceActual(method, actual) {
  if (method === "command") {
    const parts = [];
    if ("exit_code" in actual) parts.push(`\u9000\u51FA\u7801 ${String(actual.exit_code)}`);
    if (typeof actual.timed_out === "boolean") {
      parts.push(actual.timed_out ? "\u5DF2\u8D85\u65F6" : "\u672A\u8D85\u65F6");
    }
    if (typeof actual.duration_ms === "number") parts.push(`\u7528\u65F6 ${actual.duration_ms} ms`);
    if (typeof actual.signal === "number") parts.push(`\u4FE1\u53F7 ${actual.signal}`);
    return parts.join(" \xB7 ") || "\u547D\u4EE4\u5DF2\u8FD0\u884C";
  }
  if (method === "artifact") {
    const parts = [actual.exists === true ? "\u6587\u4EF6\u5B58\u5728" : "\u6587\u4EF6\u4E0D\u5B58\u5728"];
    if (typeof actual.checks_passed === "number" && typeof actual.checks_total === "number") {
      parts.push(`\u68C0\u67E5 ${actual.checks_passed}/${actual.checks_total} \u901A\u8FC7`);
    }
    if (typeof actual.sha256 === "string" && actual.sha256) {
      parts.push(`\u6458\u8981 ${shortDigest(actual.sha256)}`);
    }
    return parts.join(" \xB7 ");
  }
  if (method === "experiment") {
    const parts = [];
    if (typeof actual.trial_count === "number") parts.push(`\u5B9E\u9A8C ${actual.trial_count} \u6B21`);
    if (actual.aggregate_value !== void 0) parts.push(`\u6C47\u603B ${String(actual.aggregate_value)}`);
    if (typeof actual.source === "string") parts.push(`\u6765\u6E90 ${actual.source}`);
    return parts.join(" \xB7 ") || "\u5B9E\u9A8C\u5DF2\u5B8C\u6210";
  }
  if (method === "ci") {
    const parts = [];
    if (typeof actual.outcome === "string") parts.push(`\u7ED3\u679C ${actual.outcome}`);
    if (typeof actual.source === "string") parts.push(`\u6765\u6E90 ${actual.source}`);
    return parts.join(" \xB7 ") || "\u53C2\u8003\u7ED3\u679C\u5DF2\u8BFB\u53D6";
  }
  return formatTechnicalActual(actual);
}
function formatTechnicalActual(actual) {
  const scalarEntries = Object.entries(actual).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).sort(([left], [right]) => left.localeCompare(right));
  if (!scalarEntries.length) return "\u5DF2\u751F\u6210\u7ED3\u6784\u5316\u7ED3\u679C";
  return scalarEntries.map(([key, value]) => `${key}=${String(value)}`).join(" \xB7 ");
}
function shortDigest(value) {
  return value.length > 16 ? `${value.slice(0, 15)}\u2026` : value;
}
function createDerivedAcceptancePresentation(acceptance) {
  const state = acceptance.status === "satisfied" ? "done" : ["failed", "invalid"].includes(acceptance.status) ? "error" : "blocked";
  return {
    uid: acceptance.uid,
    label: acceptance.label,
    state,
    status: acceptance.status,
    evidence: acceptance.evidenceRequirementUids.join("\u3001") || "\u672A\u5173\u8054\u8BC1\u636E"
  };
}
function formatStructuredRecord(value, preferredKeys) {
  const keys = [
    ...preferredKeys.filter((key) => key in value),
    ...Object.keys(value).filter((key) => !preferredKeys.includes(key)).sort()
  ];
  if (!keys.length) return "\u672A\u63D0\u4F9B";
  return keys.map((key) => `${key}=${formatStructuredValue(value[key])}`).join(" \xB7 ");
}
function formatStructuredValue(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

// src/task-navigation.ts
function taskNavigationNewLeaf(origin) {
  return origin === "child";
}

// src/vault-path.ts
var path3 = __toESM(require("path"));
var VaultPathResolutionError = class extends Error {
  constructor() {
    super("\u672A\u627E\u5230 Evidence Vault \u8DEF\u5F84\uFF0C\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u914D\u7F6E\uFF0C\u6216\u4F7F\u7528\u672C\u5730\u6587\u4EF6\u7CFB\u7EDF Vault\u3002");
    this.name = "VaultPathResolutionError";
  }
};
function resolveVaultPath(input) {
  const candidate = [
    input.configuredPath,
    input.environmentPath || "",
    input.adapterBasePath || ""
  ].map((value) => value.trim()).find(Boolean);
  if (!candidate) throw new VaultPathResolutionError();
  return path3.resolve(candidate);
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

// src/main.ts
var FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
var DEFAULT_SETTINGS = {
  flowdeskRoot: "",
  workingDirectory: "",
  vaultPath: "",
  apiUrl: ""
};
var EvidenceReviewCommandError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "EvidenceReviewCommandError";
  }
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
  async loadSnapshot(taskPath, signal) {
    const invocation = this.createSnapshotInvocation(taskPath, "json");
    let stdout;
    try {
      const result = await execFileAsync(invocation.executable, invocation.args, {
        ...createSnapshotExecutionOptions(invocation.cwd, signal)
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
        vaultPath: this.resolveEvidenceVaultPath(),
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
  async submitEvidenceReview(input) {
    const invocation = buildReviewInvocation({
      flowdeskRoot: this.resolveFlowDeskRoot(),
      taskPath: input.taskPath,
      digest: input.digest,
      decision: input.decision,
      requirementUids: input.requirementUids,
      note: input.note,
      vaultPath: this.resolveEvidenceVaultPath(),
      apiUrl: this.settings.apiUrl.trim()
    });
    try {
      await execFileAsync(invocation.executable, invocation.args, {
        cwd: invocation.cwd,
        maxBuffer: 1024 * 1024,
        timeout: 3e4
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
      path4.resolve(__dirname, "..", "..")
    ].filter(Boolean);
    for (const candidate of candidates) {
      if ((0, import_fs.existsSync)(path4.join(candidate, "bin", "flowdesk-execution-snapshot"))) {
        return candidate;
      }
    }
    throw new Error("\u672A\u627E\u5230 FlowDesk \u4ED3\u5E93\u8DEF\u5F84\uFF0C\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u914D\u7F6E FlowDesk repo path\u3002");
  }
  resolveEvidenceVaultPath() {
    const adapter = this.app.vault.adapter;
    const adapterBasePath = adapter instanceof import_obsidian.FileSystemAdapter ? adapter.getBasePath() : "";
    return resolveVaultPath({
      configuredPath: expandHomePath(this.settings.vaultPath.trim()),
      environmentPath: expandHomePath(process.env.OBSIDIAN_VAULT || ""),
      adapterBasePath
    });
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
    this.snapshotAbortCoordinator = new SnapshotRequestAbortCoordinator();
    this.cancelInitialSync = null;
    this.disclosureStateCache = new DisclosureStateCache(20);
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
    this.snapshotAbortCoordinator.cancel();
    this.disclosureStateCache.clear();
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
    this.snapshotAbortCoordinator.cancel();
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
      this.snapshotAbortCoordinator.finish(signal);
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
        text: formatSnapshotCompatibilityError(model.errorCode)
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
      text: presentation.header.status
    });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.kindLabel });
    badges.createSpan({ cls: "flowdesk-state-pill", text: presentation.header.priority });
    if (model.currentTask.isBlocked) {
      badges.createSpan({ cls: "flowdesk-state-pill is-error", text: "\u5B58\u5728\u963B\u585E" });
    }
    metaRow.createDiv({
      cls: "flowdesk-task-read-meta",
      text: this.loading ? `\u6B63\u5728\u5237\u65B0 \xB7 \u4E0A\u6B21\u8BFB\u53D6 ${model.observation.loadedAt}` : `\u672C\u5730\u8BFB\u53D6 ${model.observation.loadedAt}`
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
    if (model && canReviewEvidence({
      trustLevel: model.currentTask.trustLevel,
      observationTrustworthy: model.observation.isTrustworthy,
      sourceIdentity: model.observation.sourceIdentity,
      sourceIdentityMatch: model.observation.sourceIdentityMatch,
      evidenceBundleDigest: model.review.evidenceBundleDigest,
      requirementUids: model.review.requirementUids
    })) {
      const review = toolbar.createEl("button", {
        cls: "flowdesk-toolbar-button flowdesk-review-button",
        attr: { "aria-label": "\u590D\u6838\u8BC1\u636E", title: "\u590D\u6838\u8BC1\u636E" }
      });
      (0, import_obsidian.setIcon)(review, "clipboard-check");
      review.addEventListener("click", () => this.openEvidenceReview(model));
    }
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
  openEvidenceReview(model) {
    const digest = model.review.evidenceBundleDigest;
    if (!digest) {
      new import_obsidian.Notice("\u5F53\u524D snapshot \u6CA1\u6709\u53EF\u590D\u6838\u7684 evidence bundle digest\u3002");
      return;
    }
    new EvidenceReviewModal(this.app, async (decision, note) => {
      try {
        await this.plugin.submitEvidenceReview({
          taskPath: model.currentTask.id,
          digest,
          decision,
          requirementUids: model.review.requirementUids,
          note
        });
        new import_obsidian.Notice(decision === "approved" ? "\u590D\u6838\u5DF2\u786E\u8BA4" : "\u5DF2\u8981\u6C42\u4FEE\u6539");
        await this.refreshCurrentTask();
      } catch (error) {
        const failure = error instanceof EvidenceReviewCommandError ? error : new EvidenceReviewCommandError(
          "review_request_rejected",
          error instanceof Error ? error.message : String(error)
        );
        if (failure.code === "review_conflict") {
          new import_obsidian.Notice("\u8BC1\u636E\u5DF2\u53D8\u5316\uFF0C\u5DF2\u5237\u65B0 Dashboard\uFF1B\u8BF7\u590D\u6838\u6700\u65B0\u7ED3\u679C\u3002");
          await this.refreshCurrentTask();
          return;
        }
        new import_obsidian.Notice(`\u590D\u6838\u5931\u8D25\uFF1A${failure.message}`);
      }
    }).open();
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
      text: status.tone === "healthy" ? "\u72B6\u6001\u6B63\u5E38" : "\u9700\u8981\u5904\u7406"
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
    diagnosticRow(card, "\u5EFA\u8BAE", status.remediation);
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
  async openSnapshotSource(taskPath, source, sourceKind = "\u6765\u6E90") {
    var _a;
    const navigation = resolveDiagnosticNavigation(
      taskPath,
      source
    );
    if (!navigation.canOpen) {
      new import_obsidian.Notice("producer \u672A\u63D0\u4F9B\u53EF\u6253\u5F00\u7684 task ID\u3002");
      return;
    }
    const { target } = navigation;
    try {
      await this.app.workspace.openLinkText(target.linkText, taskPath, false);
      if (target.editorLine === null) return;
      const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (!view || ((_a = view.file) == null ? void 0 : _a.path) !== taskPath) {
        new import_obsidian.Notice("\u4EFB\u52A1\u5DF2\u6253\u5F00\uFF0C\u4F46\u5F53\u524D\u89C6\u56FE\u65E0\u6CD5\u5B9A\u4F4D\u5230\u5177\u4F53\u884C\u3002");
        return;
      }
      if (target.editorLine >= view.editor.lineCount()) {
        new import_obsidian.Notice(`${sourceKind}\u884C\u53F7\u5DF2\u8D85\u51FA\u5F53\u524D\u6587\u4EF6\u8303\u56F4\uFF1A${target.line}`);
        return;
      }
      const position = { line: target.editorLine, ch: 0 };
      view.editor.setCursor(position);
      view.editor.scrollIntoView({ from: position, to: position }, true);
      view.editor.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian.Notice(`\u65E0\u6CD5\u5B9A\u4F4D${sourceKind}\u4F4D\u7F6E\uFF1A${message}`);
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
        text: child.status
      });
      this.makeNavigable(row, () => this.openTask(child.id, "child"));
    }
  }
  renderDetails(container, model, summary, diagnosticGroups) {
    var _a;
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
    summaryToggle.createSpan({ text: "\u5F53\u524D\u4EFB\u52A1\u5408\u540C\u4E0E\u8BC1\u636E" });
    summaryToggle.createSpan({
      cls: "flowdesk-contract-diagnostic-count",
      text: `${diagnosticCount} \u9879\u8BCA\u65AD`
    });
    const overview = details.createDiv({ cls: "flowdesk-contract-overview" });
    const goal = overview.createDiv({ cls: "flowdesk-contract-goal" });
    goal.createDiv({ cls: "flowdesk-summary-label", text: "\u76EE\u6807" });
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
    full.createEl("summary", { text: "\u5408\u540C\u4E0E\u4EA4\u4ED8\u8BE6\u60C5" });
    const body = full.createDiv({ cls: "flowdesk-detail-body" });
    const renderedSections = /* @__PURE__ */ new Map();
    const contract = createSection(
      body,
      model.currentTask.trustLevel === "legacy_v3" ? "\u4EFB\u52A1\u5408\u540C v3" : "\u4EFB\u52A1\u5408\u540C v4",
      formatSemanticStatus(model.contract.semanticStatus)
    );
    renderedSections.set("contract", contract);
    scopeRow(contract, "\u5305\u542B", model.contract.scope.included);
    scopeRow(contract, "\u4E0D\u5305\u542B", model.contract.scope.excluded);
    const contractMeta = contract.createDiv({ cls: "flowdesk-contract-chip-row" });
    contractMeta.createSpan({
      cls: "flowdesk-contract-chip",
      text: `REQ ${model.contract.requirements.length}`
    });
    contractMeta.createSpan({
      cls: "flowdesk-contract-chip",
      text: `SCN ${model.contract.scenarios.length}`
    });
    contractMeta.createSpan({
      cls: "flowdesk-contract-chip",
      text: model.contract.scope.included.length && model.contract.scope.excluded.length ? "Scope \u5B8C\u6574" : "Scope \u5F85\u8865\u5145"
    });
    renderContractItems(
      contract,
      "\u9700\u6C42\u8BE6\u60C5",
      "requirement",
      model.contract.requirements,
      (source) => {
        void this.openSnapshotSource(model.currentTask.id, source, "\u9700\u6C42");
      },
      this.disclosureState.requirementsOpen,
      (open) => {
        this.disclosureState.requirementsOpen = open;
      }
    );
    renderContractItems(
      contract,
      "\u573A\u666F\u8BE6\u60C5",
      "scenario",
      model.contract.scenarios,
      (source) => {
        void this.openSnapshotSource(model.currentTask.id, source, "\u573A\u666F");
      },
      this.disclosureState.scenariosOpen,
      (open) => {
        this.disclosureState.scenariosOpen = open;
      }
    );
    const derivedAcceptance = model.acceptance.map(
      (item) => createDerivedAcceptancePresentation(item)
    );
    const acceptanceTotal = derivedAcceptance.length || model.contract.acceptance.length;
    const checkedAcceptance = derivedAcceptance.length ? derivedAcceptance.filter((item) => item.state === "done").length : model.contract.acceptance.filter((item) => item.checked === true).length;
    const acceptance = createSection(
      body,
      "\u9A8C\u6536\u6807\u51C6",
      `${checkedAcceptance} / ${acceptanceTotal} \u5DF2\u901A\u8FC7`
    );
    renderedSections.set("acceptance", acceptance);
    if (!acceptanceTotal) {
      acceptance.createDiv({ cls: "flowdesk-muted", text: "producer \u672A\u63D0\u4F9B\u9A8C\u6536\u9879\u3002" });
    } else {
      const progress = acceptance.createDiv({ cls: "flowdesk-acceptance-progress" });
      progress.createDiv({
        cls: "flowdesk-acceptance-progress-value",
        attr: {
          style: `width: ${Math.round(
            checkedAcceptance / acceptanceTotal * 100
          )}%`
        }
      });
      const acceptanceGrid = acceptance.createDiv({
        cls: "flowdesk-acceptance-grid"
      });
      if (derivedAcceptance.length) {
        for (const item of derivedAcceptance) {
          const row = acceptanceGrid.createDiv({ cls: "flowdesk-acceptance-item" });
          row.createSpan({
            cls: item.state === "done" ? "flowdesk-acceptance-check is-checked" : "flowdesk-acceptance-check",
            text: item.state === "done" ? "\u2713" : "\u25CB"
          });
          const copy = row.createDiv({ cls: "flowdesk-acceptance-copy" });
          copy.createDiv({ text: `${item.uid} \xB7 ${item.label}` });
          copy.createDiv({
            cls: "flowdesk-acceptance-evidence",
            text: `${item.status} \xB7 ${item.evidence}`
          });
        }
      } else {
        for (const item of model.contract.acceptance) {
          const row = acceptanceGrid.createDiv({ cls: "flowdesk-acceptance-item" });
          row.createSpan({
            cls: item.checked ? "flowdesk-acceptance-check is-checked" : "flowdesk-acceptance-check",
            text: item.checked ? "\u2713" : "\u25CB"
          });
          row.createSpan({ text: (_a = item.text) != null ? _a : "\u672A\u63D0\u4F9B" });
        }
      }
    }
    const structuredEvidence = model.evidenceRequirements.map(
      (requirement) => createStructuredEvidencePresentation(requirement, model.review.status)
    );
    const validEvidence = structuredEvidence.length ? structuredEvidence.filter((item) => item.state === "done").length : Object.values(model.evidence).filter((health) => health === "valid").length;
    const evidenceTotal = structuredEvidence.length || 3;
    const evidence = createSection(
      body,
      "\u6267\u884C\u8BC1\u636E",
      validEvidence === evidenceTotal ? "\u5168\u90E8\u6709\u6548" : `${validEvidence} / ${evidenceTotal} \u6709\u6548`
    );
    renderedSections.set("evidence", evidence);
    const evidenceGrid = evidence.createDiv({ cls: "flowdesk-evidence-grid" });
    if (structuredEvidence.length) {
      for (const item of structuredEvidence) {
        structuredEvidenceItem(evidenceGrid, item);
      }
    } else {
      evidenceItem(evidenceGrid, "\u6267\u884C\u7ED3\u679C", model.evidence.execution);
      evidenceItem(evidenceGrid, "\u9A8C\u8BC1\u7ED3\u679C", model.evidence.verification);
      evidenceItem(evidenceGrid, "\u4EA4\u4ED8\u8BB0\u5F55", model.evidence.delivery);
    }
    const observation = createSection(
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
          var _a2, _b;
          const baseKey = createDiagnosticDisclosureKey(
            group.taskId,
            diagnostic.diagnostic
          );
          const occurrence = (_a2 = diagnosticKeyOccurrences.get(baseKey)) != null ? _a2 : 0;
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
      const section = renderedSections.get(sectionName);
      if (section) body.appendChild(section);
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
    await this.app.workspace.getLeaf(taskNavigationNewLeaf(origin)).openFile(file);
  }
};
var EvidenceReviewModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
    this.note = "";
    this.submitted = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("flowdesk-review-modal");
    contentEl.createEl("h2", { text: "\u590D\u6838\u7ED3\u6784\u5316\u8BC1\u636E" });
    contentEl.createDiv({
      cls: "flowdesk-muted",
      text: "\u63D0\u4EA4\u65F6\u4F1A\u6309\u5F53\u524D evidence bundle digest \u505A\u51B2\u7A81\u68C0\u67E5\u3002"
    });
    new import_obsidian.Setting(contentEl).setName("\u590D\u6838\u8BF4\u660E").setDesc("\u53EF\u9009\uFF1B\u8981\u6C42\u4FEE\u6539\u65F6\u5EFA\u8BAE\u8BF4\u660E\u539F\u56E0\u3002").addTextArea(
      (text2) => text2.setPlaceholder("\u8865\u5145\u590D\u6838\u8BF4\u660E").onChange((value) => {
        this.note = value;
      })
    );
    new import_obsidian.Setting(contentEl).setClass("flowdesk-review-actions").addButton(
      (button) => button.setButtonText("\u8981\u6C42\u4FEE\u6539").onClick(() => {
        void this.submit("changes_requested");
      })
    ).addButton(
      (button) => button.setCta().setButtonText("\u590D\u6838\u786E\u8BA4").onClick(() => {
        void this.submit("approved");
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
  async submit(decision) {
    if (this.submitted) return;
    this.submitted = true;
    this.close();
    await this.onSubmit(decision, this.note.trim());
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
    new import_obsidian.Setting(containerEl).setName("Evidence Vault \u8DEF\u5F84").setDesc("\u7559\u7A7A\u65F6\u4F9D\u6B21\u4F7F\u7528 OBSIDIAN_VAULT \u548C\u5F53\u524D Obsidian \u672C\u5730 Vault\u3002").addText(
      (text2) => text2.setPlaceholder("/Users/me/Documents/Vault").setValue(this.plugin.settings.vaultPath).onChange(async (value) => {
        this.plugin.settings.vaultPath = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5DE5\u4F5C\u76EE\u5F55").setDesc("\u4F20\u7ED9 --working-directory\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528 FlowDesk \u4ED3\u5E93\u8DEF\u5F84\u3002").addText(
      (text2) => text2.setValue(this.plugin.settings.workingDirectory).onChange(async (value) => {
        this.plugin.settings.workingDirectory = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("TaskNotes API \u5730\u5740").setDesc("\u53EF\u9009\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528 FlowDesk CLI \u9ED8\u8BA4\u503C\u3002").addText(
      (text2) => text2.setPlaceholder("http://127.0.0.1:18090").setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
        this.plugin.settings.apiUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
};
function createSection(container, title, meta = "", className = "") {
  const section = container.createDiv({
    cls: `flowdesk-dashboard-section ${className}`.trim()
  });
  const heading = section.createDiv({ cls: "flowdesk-contract-section-head" });
  heading.createDiv({ cls: "flowdesk-dashboard-section-title", text: title });
  if (meta) {
    heading.createDiv({ cls: "flowdesk-contract-section-meta", text: meta });
  }
  return section;
}
function scopeRow(container, label, values) {
  const row = container.createDiv({ cls: "flowdesk-contract-scope-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: label });
  row.createSpan({ text: values.length ? values.join("\u3001") : "\u65E0" });
}
function renderContractItems(container, label, kind, items, openSource, open, onToggle) {
  const section = container.createEl("details", {
    cls: "flowdesk-contract-item-details"
  });
  section.open = open;
  section.addEventListener("toggle", () => onToggle(section.open));
  const summary = section.createEl("summary");
  summary.createSpan({ text: label });
  summary.createSpan({
    cls: "flowdesk-contract-item-count",
    text: `${items.length} \u6761`
  });
  if (!items.length) {
    section.createDiv({ cls: "flowdesk-muted", text: "\u65E0" });
    return;
  }
  const list = section.createDiv({ cls: "flowdesk-contract-item-list" });
  for (const item of items) {
    const presentation = createContractItemPresentation(item, kind);
    const row = list.createDiv({ cls: "flowdesk-contract-item" });
    const header = row.createDiv({ cls: "flowdesk-contract-item-head" });
    header.createSpan({
      cls: "flowdesk-contract-item-id",
      text: presentation.id
    });
    for (const requirementId of presentation.requirementIds) {
      header.createSpan({
        cls: "flowdesk-contract-requirement-ref",
        text: requirementId
      });
    }
    const source = header.createEl("button", {
      cls: "flowdesk-contract-item-source",
      text: `${presentation.sourceLabel} \u2197`,
      attr: { "aria-label": `\u6253\u5F00\u6765\u6E90\uFF1A${presentation.sourceLabel}` }
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
        text: presentation.text
      });
    }
  }
}
function scenarioStep(container, label, value) {
  container.createSpan({ cls: "flowdesk-scenario-step-label", text: label });
  container.createSpan({ text: value });
}
function diagnosticRow(container, label, value) {
  const row = container.createDiv({ cls: "flowdesk-diagnostic-row" });
  row.createSpan({ cls: "flowdesk-summary-label", text: `${label}\uFF1A` });
  row.createSpan({ text: value });
}
function evidenceItem(container, label, health) {
  const state = getEvidenceDisplayState(health);
  const item = container.createDiv({ cls: "flowdesk-evidence-item" });
  item.createDiv({
    cls: `flowdesk-evidence-title is-${state}`,
    text: `${statusSymbol(state)} ${label}`
  });
  item.createDiv({
    cls: "flowdesk-evidence-summary",
    text: formatEvidenceSummary(label, health).split("\uFF1A").pop() || "\u672A\u77E5"
  });
}
function structuredEvidenceItem(container, presentation) {
  const item = container.createDiv({ cls: "flowdesk-evidence-item" });
  item.createDiv({
    cls: `flowdesk-evidence-title is-${presentation.state}`,
    text: `${statusSymbol(presentation.state)} ${presentation.uid}`
  });
  item.createDiv({
    cls: "flowdesk-evidence-summary",
    text: presentation.status
  });
  const details = item.createDiv({ cls: "flowdesk-evidence-fields" });
  diagnosticRow(details, "\u65B9\u6CD5", presentation.method);
  diagnosticRow(details, "\u9884\u671F", presentation.expected);
  diagnosticRow(details, "\u5B9E\u9645", presentation.actual);
  diagnosticRow(details, "\u6765\u6E90", presentation.provenance);
  diagnosticRow(details, "\u590D\u6838", presentation.review);
}
function observationField(container, label, value) {
  const cell = container.createDiv({ cls: "flowdesk-observation-cell" });
  cell.createDiv({ cls: "flowdesk-summary-label", text: label });
  cell.createDiv({ cls: "flowdesk-observation-value", text: value });
}
function formatSemanticStatus(value) {
  if (value === "valid") return "\u8BED\u4E49\u6709\u6548";
  if (value === "invalid") return "\u8BED\u4E49\u65E0\u6548";
  return "\u8BED\u4E49\u5F85\u786E\u8BA4";
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
  return path4.basename(taskPath, path4.extname(taskPath));
}
function expandHomePath(value) {
  if (value === "~") return (0, import_os.homedir)();
  if (value.startsWith("~/")) return path4.join((0, import_os.homedir)(), value.slice(2));
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
