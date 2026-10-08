"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// node_modules/punycode.js/punycode.js
var require_punycode = __commonJS({
  "node_modules/punycode.js/punycode.js"(exports2, module2) {
    "use strict";
    var maxInt = 2147483647;
    var base = 36;
    var tMin = 1;
    var tMax = 26;
    var skew = 38;
    var damp = 700;
    var initialBias = 72;
    var initialN = 128;
    var delimiter = "-";
    var regexPunycode = /^xn--/;
    var regexNonASCII = /[^\0-\x7F]/;
    var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g;
    var errors = {
      "overflow": "Overflow: input needs wider integers to process",
      "not-basic": "Illegal input >= 0x80 (not a basic code point)",
      "invalid-input": "Invalid input"
    };
    var baseMinusTMin = base - tMin;
    var floor = Math.floor;
    var stringFromCharCode = String.fromCharCode;
    function error(type) {
      throw new RangeError(errors[type]);
    }
    function map(array2, callback) {
      const result = [];
      let length = array2.length;
      while (length--) {
        result[length] = callback(array2[length]);
      }
      return result;
    }
    function mapDomain(domain, callback) {
      const parts = domain.split("@");
      let result = "";
      if (parts.length > 1) {
        result = parts[0] + "@";
        domain = parts[1];
      }
      domain = domain.replace(regexSeparators, ".");
      const labels = domain.split(".");
      const encoded = map(labels, callback).join(".");
      return result + encoded;
    }
    function ucs2decode(string2) {
      const output = [];
      let counter = 0;
      const length = string2.length;
      while (counter < length) {
        const value = string2.charCodeAt(counter++);
        if (value >= 55296 && value <= 56319 && counter < length) {
          const extra = string2.charCodeAt(counter++);
          if ((extra & 64512) == 56320) {
            output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
          } else {
            output.push(value);
            counter--;
          }
        } else {
          output.push(value);
        }
      }
      return output;
    }
    var ucs2encode = (codePoints) => String.fromCodePoint(...codePoints);
    var basicToDigit = function(codePoint) {
      if (codePoint >= 48 && codePoint < 58) {
        return 26 + (codePoint - 48);
      }
      if (codePoint >= 65 && codePoint < 91) {
        return codePoint - 65;
      }
      if (codePoint >= 97 && codePoint < 123) {
        return codePoint - 97;
      }
      return base;
    };
    var digitToBasic = function(digit, flag) {
      return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
    };
    var adapt = function(delta, numPoints, firstTime) {
      let k = 0;
      delta = firstTime ? floor(delta / damp) : delta >> 1;
      delta += floor(delta / numPoints);
      for (; delta > baseMinusTMin * tMax >> 1; k += base) {
        delta = floor(delta / baseMinusTMin);
      }
      return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
    };
    var decode2 = function(input) {
      const output = [];
      const inputLength = input.length;
      let i = 0;
      let n = initialN;
      let bias = initialBias;
      let basic = input.lastIndexOf(delimiter);
      if (basic < 0) {
        basic = 0;
      }
      for (let j = 0; j < basic; ++j) {
        if (input.charCodeAt(j) >= 128) {
          error("not-basic");
        }
        output.push(input.charCodeAt(j));
      }
      for (let index = basic > 0 ? basic + 1 : 0; index < inputLength; ) {
        const oldi = i;
        for (let w = 1, k = base; ; k += base) {
          if (index >= inputLength) {
            error("invalid-input");
          }
          const digit = basicToDigit(input.charCodeAt(index++));
          if (digit >= base) {
            error("invalid-input");
          }
          if (digit > floor((maxInt - i) / w)) {
            error("overflow");
          }
          i += digit * w;
          const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
          if (digit < t) {
            break;
          }
          const baseMinusT = base - t;
          if (w > floor(maxInt / baseMinusT)) {
            error("overflow");
          }
          w *= baseMinusT;
        }
        const out = output.length + 1;
        bias = adapt(i - oldi, out, oldi == 0);
        if (floor(i / out) > maxInt - n) {
          error("overflow");
        }
        n += floor(i / out);
        i %= out;
        output.splice(i++, 0, n);
      }
      return String.fromCodePoint(...output);
    };
    var encode2 = function(input) {
      const output = [];
      input = ucs2decode(input);
      const inputLength = input.length;
      let n = initialN;
      let delta = 0;
      let bias = initialBias;
      for (const currentValue of input) {
        if (currentValue < 128) {
          output.push(stringFromCharCode(currentValue));
        }
      }
      const basicLength = output.length;
      let handledCPCount = basicLength;
      if (basicLength) {
        output.push(delimiter);
      }
      while (handledCPCount < inputLength) {
        let m = maxInt;
        for (const currentValue of input) {
          if (currentValue >= n && currentValue < m) {
            m = currentValue;
          }
        }
        const handledCPCountPlusOne = handledCPCount + 1;
        if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
          error("overflow");
        }
        delta += (m - n) * handledCPCountPlusOne;
        n = m;
        for (const currentValue of input) {
          if (currentValue < n && ++delta > maxInt) {
            error("overflow");
          }
          if (currentValue === n) {
            let q = delta;
            for (let k = base; ; k += base) {
              const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
              if (q < t) {
                break;
              }
              const qMinusT = q - t;
              const baseMinusT = base - t;
              output.push(
                stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
              );
              q = floor(qMinusT / baseMinusT);
            }
            output.push(stringFromCharCode(digitToBasic(q, 0)));
            bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
            delta = 0;
            ++handledCPCount;
          }
        }
        ++delta;
        ++n;
      }
      return output.join("");
    };
    var toUnicode = function(input) {
      return mapDomain(input, function(string2) {
        return regexPunycode.test(string2) ? decode2(string2.slice(4).toLowerCase()) : string2;
      });
    };
    var toASCII = function(input) {
      return mapDomain(input, function(string2) {
        return regexNonASCII.test(string2) ? "xn--" + encode2(string2) : string2;
      });
    };
    var punycode2 = {
      /**
       * A string representing the current Punycode.js version number.
       * @memberOf punycode
       * @type String
       */
      "version": "2.3.1",
      /**
       * An object of methods to convert from JavaScript's internal character
       * representation (UCS-2) to Unicode code points, and back.
       * @see <https://mathiasbynens.be/notes/javascript-encoding>
       * @memberOf punycode
       * @type Object
       */
      "ucs2": {
        "decode": ucs2decode,
        "encode": ucs2encode
      },
      "decode": decode2,
      "encode": encode2,
      "toASCII": toASCII,
      "toUnicode": toUnicode
    };
    module2.exports = punycode2;
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  FLOWDESK_DASHBOARD_VIEW_TYPE: () => FLOWDESK_DASHBOARD_VIEW_TYPE,
  default: () => FlowDeskDashboardPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");
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
var path8 = __toESM(require("path"));
var import_util2 = require("util");

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
  const text3 = raw.trim();
  const result = (target, label, syntax, error = null) => ({ target, label, syntax, error });
  const wiki = text3.match(/^\[\[([^\]]+)\]\]$/);
  if (wiki) {
    const separator = wiki[1].indexOf("|");
    return result(separator < 0 ? wiki[1] : wiki[1].slice(0, separator), separator < 0 ? null : wiki[1].slice(separator + 1).trim() || null, "wiki");
  }
  const markdown = text3.match(/^\[([\s\S]*)\]\(([\s\S]+)\)$/);
  if (markdown) {
    let target = markdown[2].trim();
    if (target.startsWith("<") || target.endsWith(">")) {
      if (!target.startsWith("<") || !target.endsWith(">")) return result(text3, markdown[1], "markdown", "\u5F15\u7528\u94FE\u63A5\u8BED\u6CD5\u65E0\u6548");
      target = target.slice(1, -1);
    }
    return result(target, markdown[1].trim() || null, "markdown", target ? null : "\u5F15\u7528\u76EE\u6807\u4E3A\u7A7A");
  }
  return result(/^[a-z][a-z0-9+.-]*:/i.test(text3) ? text3 : raw, null, "raw");
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
function formatSnapshotCompatibilityError(code2) {
  if (code2 === "unsupported_snapshot_model") {
    return "Snapshot model \u4E0D\u53D7\u652F\u6301\uFF1A\u9700\u8981 task-centric\u3002";
  }
  if (code2 === "unsupported_snapshot_protocol") {
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
  if (child.hasChildren) meta.push("\u542B\u540E\u4EE3 \xB7 \u8FDB\u5165\u5B50\u4EFB\u52A1\u9875");
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
function buildSnapshotInvocation(input, format2) {
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
    format2
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
  const fail = (message, code2 = "tasknotes_read_invalid") => {
    throw Object.assign(new Error(formatTaskNotesAuthError(message, auth.token)), { code: code2 });
  };
  const checkCancelled2 = () => {
    if (signal.aborted) throw Object.assign(new Error("TaskNotes \u539F\u6587\u8BFB\u53D6\u5DF2\u53D6\u6D88"), { name: "AbortError", code: "ABORT_ERR" });
  };
  checkCancelled2();
  let response;
  try {
    response = await transport({
      url: `${apiUrl.replace(/\/+$/, "")}/api/tasks/${encodeURIComponent(taskPath)}`,
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
      signal
    });
  } catch (error) {
    checkCancelled2();
    return fail(`TaskNotes \u539F\u6587\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  checkCancelled2();
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
      let text3 = "";
      response.on("data", (chunk) => {
        text3 += chunk;
      });
      response.once("end", () => {
        if (!response.complete) {
          reject(new Error("TaskNotes \u54CD\u5E94\u672A\u5B8C\u6574\u7ED3\u675F"));
          return;
        }
        resolve6({ status, statusText, text: text3 });
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
  const normalize3 = (value) => value.replace(/\r\n/g, "\n").trim();
  const details = normalize3(observation.details);
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
  return fragments.some((x) => normalize3(x) !== "" && !details.includes(normalize3(x)));
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
var utf8Bytes = (text3) => encoder.encode(text3).length;
function excerpt(text3, maxBytes = 400) {
  const value = text3.trim();
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
function firstParagraph(text3) {
  return text3.trim().split(/\r?\n\s*\r?\n/)[0] || "";
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
  let fence2 = null;
  for (const [index, line] of lines.entries()) {
    outside.push(fence2 === null);
    const visible = !fence2 && (index === 0 || line.startsWith("\u4E0B\u4E00\u6B65\uFF1A")) ? line.replace(/^(?:进展|完成|下一步)：/, "") : line;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(visible);
    if (!marker) continue;
    if (!fence2) fence2 = { marker: marker[1][0], length: marker[1].length };
    else if (marker[1][0] === fence2.marker && marker[1].length >= fence2.length && !marker[2].trim()) fence2 = null;
  }
  return { outside, closed: fence2 === null };
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
  const markdown = (parent, text3, cls, field) => {
    const el = parent.createDiv({ cls: `${cls} markdown-rendered`, attr: field ? { "data-current-field": field } : {} });
    void dependencies.renderMarkdown(text3, el, model.currentTask.id).catch(() => el.setText(text3));
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
  for (const [field, text3] of [["progress", current.progress], ["next", current.next]]) if (text3 !== null) markdown(record2, text3, "flowdesk-contract-scope-markdown", field);
  for (const gap of current.gaps) {
    record2.createDiv({ cls: "flowdesk-muted", text: gap });
    if (current.status === "unknown") card.createDiv({ cls: "flowdesk-overview-gap", text: gap });
  }
  if (current.source && dependencies.showSourceActions) {
    const source = record2.createEl("button", { cls: "flowdesk-content-source", text: "\u6253\u5F00 Progress \u539F\u6587" });
    const original = model.content.domainSections.find((s) => s.level === 2 && s.heading === "Progress");
    source.addEventListener("click", (event) => {
      var _a;
      void dependencies.openSource(model.currentTask.id, current.source, "Progress", (_a = original == null ? void 0 : original.text) != null ? _a : "", event);
    });
  }
  return card;
}

// src/progress-history.ts
function parseQuotedProgress(text3) {
  var _a;
  const lines = text3.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.shift() !== "> [!faq]- \u8BE6\u7EC6\u8FC7\u7A0B\u65E5\u5FD7") return null;
  const events = [];
  let fence2 = null, receipts = false;
  const scan = (line) => {
    const visible = line.replace(/^(?:进展|完成|下一步)：/, "");
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(visible);
    if (!match) return;
    if (!fence2) fence2 = { char: match[1][0], length: match[1].length };
    else if (match[1][0] === fence2.char && match[1].length >= fence2.length && !match[2].trim()) fence2 = null;
  };
  for (const line of lines) {
    if (/^<!-- flowdesk\.task-update\/.* -->$/.test(line)) {
      if (fence2) return null;
      receipts = true;
      continue;
    }
    if (receipts) {
      if (line.trim()) return null;
      continue;
    }
    const event = /^> - \[[xX ]\] (.*)$/.exec(line);
    if (event) {
      if (fence2) return null;
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
  if (fence2 || !events.length || events.some((event) => !event.lines.join("\n").trim())) return null;
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
var recordTitle = (heading2) => heading2.replace(/^Execution Result/, "\u6267\u884C\u7ED3\u679C").replace(/^Verification Result/, "\u9A8C\u8BC1\u7ED3\u679C").replace(/^Delivery Record/, "\u4EA4\u4ED8\u8BB0\u5F55");
var TaskContentRenderer = class {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  render(container, content) {
    var _a, _b, _c;
    const body = (parent, text3) => {
      const element = parent.createDiv({ cls: "flowdesk-contract-scope-markdown markdown-rendered" });
      void this.dependencies.renderMarkdown(text3, element, content.taskId).catch(() => element.setText(text3));
    };
    const source = (parent, section2) => {
      var _a2, _b2;
      if (!this.dependencies.showSourceActions) return;
      const row = parent.createDiv({ cls: "flowdesk-source-actions" });
      const button = row.createEl("button", { cls: "flowdesk-content-source", text: "\u5728\u539F\u6587\u67E5\u770B", attr: { "aria-label": `${section2.source ? "\u6253\u5F00\u8FD9\u4E00\u6761\u539F\u6587" : "\u6253\u5F00\u4EFB\u52A1\u539F\u6587"}\uFF1A${section2.heading}` } });
      button.addEventListener("click", (event) => {
        void this.dependencies.openSource(content.taskId, section2, event);
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
      element.createEl("summary", { text: title, attr: { "data-focus-key": `disclosure:${key}` } });
      return element;
    };
    const specification = disclosure(container, "\u4EFB\u52A1\u8BF4\u660E", "task-specification", "flowdesk-task-specification");
    specification.open = true;
    for (const [heading2, text3] of [["\u76EE\u6807", content.goal], ["\u80CC\u666F", content.why], ["\u8303\u56F4", content.scopeText], ["\u6267\u884C\u6E05\u5355", content.steps]]) {
      if (!text3) continue;
      const section2 = specification.createDiv({ cls: "flowdesk-specification-section" });
      section2.createEl("h3", { text: heading2 });
      body(section2, text3);
    }
    if (!content.goal && !content.why && !content.scopeText && !content.steps) specification.createDiv({ cls: "flowdesk-muted", text: "\u672A\u63D0\u4F9B\u4EFB\u52A1\u8BF4\u660E\uFF1B\u53EF\u4ECE\u4EFB\u52A1\u6807\u9898\u6253\u5F00\u539F\u6587\u4EF6\u3002" });
    source(specification, { heading: "\u4EFB\u52A1\u8BF4\u660E", level: 2, text: content.goal });
    const items = (heading2, entries) => {
      var _a2, _b2;
      if (!entries.length) return;
      const group = disclosure(container, `${heading2} \xB7 ${entries.length} \u6761`, `list:${heading2}`);
      for (const item of entries) {
        const entry = group.createDiv({ cls: "flowdesk-specification-section" });
        body(entry, (_b2 = (_a2 = item.text) != null ? _a2 : item.label) != null ? _b2 : "");
      }
      source(group, { heading: heading2, level: 2, text: "" });
    };
    items("\u9700\u6C42", content.requirements);
    items("\u573A\u666F", content.scenarios);
    if (content.acceptance.length) {
      const group = disclosure(container, "\u9A8C\u6536\u6807\u51C6", "acceptance", "flowdesk-acceptance-group");
      group.open = true;
      group.createDiv({ cls: "flowdesk-muted", text: "\u4EC5\u663E\u793A\u539F\u6587\u8BB0\u5F55\uFF1B\u52FE\u9009\u4E0D\u4EE3\u8868\u9A8C\u8BC1\u901A\u8FC7\u3002\u4FEE\u6539\u8BF7\u5728\u4EFB\u52A1\u539F\u6587\u8FDB\u884C\u3002" });
      const list2 = group.createEl("ul", { cls: "flowdesk-acceptance-list" });
      for (const item of content.acceptance) {
        const row = list2.createEl("li", { cls: "flowdesk-acceptance-item" });
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
      const latest = latestRecord(records);
      const result = disclosure(container, latest ? `\u6700\u8FD1${title} \xB7 \u6458\u5F55` : `${title} \xB7 \u6700\u8FD1\u8BB0\u5F55\u672A\u786E\u8BA4`, `result:${kind}`, "flowdesk-contract-item-details flowdesk-record-round");
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
      const heading2 = section2.createDiv({ cls: "flowdesk-log-heading" });
      heading2.createEl("h3", { text: "\u8FDB\u5EA6\u65E5\u5FD7" });
      const count = heading2.createSpan({ cls: "flowdesk-muted", text: `\u6700\u8FD1 ${Math.min(3, progress.events.length)} \u6761 \xB7 \u6458\u5F55` });
      const markdown = (text3, element) => {
        void this.dependencies.renderMarkdown(text3, element, content.taskId).catch(() => element.setText(text3));
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
        renderProgressEvents(entries, progress.events.slice(progress.events.length - end, progress.events.length - shown), (text3, element) => jobs.push({ text: text3, element }), true);
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
function taskNavigationLeafType(origin, modifiers) {
  return (modifiers == null ? void 0 : modifiers.metaKey) || (modifiers == null ? void 0 : modifiers.ctrlKey) ? "tab" : false;
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
  constructor(code2, message) {
    super(message);
    this.code = code2;
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
  let text3 = lines.join("\n");
  if (utf8Bytes(text3) > targetBytes) text3 += `
\u672C\u5361\u8D85\u8FC7 ${targetBytes}B \u76EE\u6807\uFF1B\u51C6\u786E ID \u4E0E\u7F3A\u53E3\u4FDD\u7559\uFF0C\u53EF\u9009\u62E9\u66F4\u5C11 Task \u540E\u590D\u5236\u3002`;
  return { text: text3, bytes: utf8Bytes(text3), targetBytes, omittedCompleted, gaps };
}

// src/case-reference-list.ts
function referenceSubtitle(raw, group, full = false) {
  const parsed = parseReferenceText(raw), target = parsed.target.replace(/\\/g, "/");
  if (/^https?:\/\//i.test(target)) return "\u7F51\u9875 \xB7 \u6D4F\u89C8\u5668";
  const kind = group === "Project" ? "\u9879\u76EE\u7B14\u8BB0" : group === "Sessions" ? "\u4F1A\u8BDD\u8BB0\u5F55" : /\.json(?:#.*)?$/i.test(target) ? "\u6570\u636E\u6587\u4EF6" : /\.docx(?:#.*)?$/i.test(target) ? "Word\u6587\u6863" : parsed.syntax === "wiki" ? "Obsidian\u7B14\u8BB0" : "\u539F\u6587\u4EF6";
  const display = target.replace(/^file:\/\/(?:localhost)?/i, "");
  const slash = display.lastIndexOf("/");
  const directory = slash < 0 ? "" : display.slice(0, slash);
  const short = directory.split("/").filter(Boolean).slice(-3).join("/");
  return full ? `${kind} \xB7 ${parsed.target}` : short ? `${kind} \xB7 ${short}` : kind;
}
var CaseReferenceList = class {
  constructor(capacity = 20) {
    this.capacity = capacity;
    this.choices = /* @__PURE__ */ new Map();
    this.generation = 0;
  }
  deactivate() {
    this.generation++;
  }
  clear() {
    this.deactivate();
    this.choices.clear();
  }
  snapshot() {
    return [...this.choices].map(([casePath, choice]) => ({ casePath, query: choice.query, open: [...choice.open], all: [...choice.all] }));
  }
  restoreSnapshot(value) {
    this.clear();
    if (!Array.isArray(value)) return;
    for (const item of value.slice(-this.capacity)) {
      if (!item || typeof item !== "object" || typeof item.casePath !== "string" || !item.casePath || item.casePath.length > 4096) continue;
      const open2 = /* @__PURE__ */ new Map(), all = /* @__PURE__ */ new Set();
      if (Array.isArray(item.open)) {
        for (const pair of item.open.slice(0, 32)) if (Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "boolean") open2.set(pair[0], pair[1]);
      }
      if (Array.isArray(item.all)) {
        for (const group of item.all.slice(0, 32)) if (typeof group === "string") all.add(group);
      }
      this.choices.set(item.casePath, { query: typeof item.query === "string" ? item.query.slice(0, 4096) : "", open: open2, all });
    }
  }
  render(container, casePath, groups, dependencies) {
    let choice = this.choices.get(casePath);
    if (!choice) {
      choice = { query: "", open: /* @__PURE__ */ new Map(), all: /* @__PURE__ */ new Set() };
      this.choices.set(casePath, choice);
    }
    this.choices.delete(casePath);
    this.choices.set(casePath, choice);
    while (this.choices.size > this.capacity) this.choices.delete(this.choices.keys().next().value);
    const selection = choice, token = ++this.generation;
    const total = groups.reduce((sum, group) => sum + group.targets.length, 0);
    const displayGroups = groups.map((group) => ({ ...group, items: group.targets.map((raw) => ({ raw, label: formatReferenceLabel(raw), subtitle: referenceSubtitle(raw, group.label) })) }));
    const identities = /* @__PURE__ */ new Map();
    for (const group of displayGroups) for (const item of group.items) {
      const key = `${item.label}\0${item.subtitle}`;
      if (!identities.has(key)) identities.set(key, /* @__PURE__ */ new Set());
      identities.get(key).add(parseReferenceText(item.raw).target);
    }
    for (const group of displayGroups) for (const item of group.items) {
      if (identities.get(`${item.label}\0${item.subtitle}`).size > 1) item.subtitle = referenceSubtitle(item.raw, group.label, true);
    }
    container.createDiv({ cls: "flowdesk-case-reference-count", text: `\u5171 ${total} \u9879 \xB7 \u5168\u90E8\u5F15\u7528\u4FDD\u7559` });
    const search = container.createEl("input", { cls: "flowdesk-case-reference-search", attr: { type: "search", placeholder: "\u67E5\u627E\u5165\u53E3\u540D\u79F0\u6216\u76EE\u5F55", "aria-label": "\u67E5\u627E\u7CBE\u9009\u5165\u53E3", "data-focus-key": "case-reference-search" } });
    search.value = selection.query;
    const results = container.createDiv({ cls: "flowdesk-case-reference-results" });
    const moreButtons = /* @__PURE__ */ new Map();
    let epoch = 0;
    const current = () => this.generation === token;
    const renderGroups = () => {
      var _a, _b, _c;
      if (!current()) return;
      const currentEpoch = ++epoch;
      results.empty();
      moreButtons.clear();
      const query = selection.query.trim().toLowerCase();
      const filtered = displayGroups.map((group) => ({ ...group, items: group.items.filter((item) => !query || `${item.label} ${item.subtitle} ${item.raw}`.toLowerCase().includes(query)) }));
      const matched = filtered.reduce((sum, group) => sum + group.items.length, 0);
      if (query) results.createDiv({ cls: "flowdesk-case-reference-match-count", text: `\u5339\u914D ${matched} / ${total} \u9879`, attr: { role: "status" } });
      if (!matched) {
        results.createDiv({ cls: "flowdesk-case-reference-empty", text: "\u6CA1\u6709\u5339\u914D\u7684\u5165\u53E3\uFF0C\u8BD5\u8BD5\u6587\u4EF6\u540D\u6216\u76EE\u5F55\u3002" });
        return;
      }
      for (const group of filtered) {
        if (!group.items.length) continue;
        const details = results.createEl("details", { cls: "flowdesk-case-reference-group", attr: { "data-reference-group": group.label, "data-disclosure-key": `case-reference:${group.label}`, "data-external-disclosure": "true" } });
        details.open = query ? true : (_a = selection.open.get(group.label)) != null ? _a : group.label === "Project";
        const summary = details.createEl("summary");
        summary.createSpan({ text: (_b = { Project: "\u9879\u76EE", Plans: "\u8BA1\u5212", Docs: "\u6587\u6863", Sessions: "\u539F\u4F1A\u8BDD", Related: "\u8D44\u6599" }[group.label]) != null ? _b : group.label });
        summary.createSpan({ cls: "flowdesk-case-reference-group-count", text: query ? `${group.items.length} / ${group.targets.length}` : String(group.targets.length) });
        details.addEventListener("toggle", () => {
          if (current() && epoch === currentEpoch && !selection.query.trim()) selection.open.set(group.label, details.open);
        });
        const links = details.createDiv({ cls: "flowdesk-case-related-links" });
        const showAll = !!query || selection.all.has(group.label);
        for (const item of showAll ? group.items : group.items.slice(0, 3)) {
          const button = links.createEl("button", { cls: "flowdesk-case-related-link", attr: { title: item.raw, "aria-label": `${item.label} \xB7 ${item.subtitle}` } });
          const web = /^https?:\/\//i.test(parseReferenceText(item.raw).target);
          const icon = button.createSpan({ cls: "flowdesk-reference-icon", attr: { "aria-hidden": "true" } });
          (_c = dependencies.icon) == null ? void 0 : _c.call(dependencies, icon, web ? "globe" : "file-text");
          const copy = button.createSpan({ cls: "flowdesk-reference-copy" });
          copy.createSpan({ cls: "flowdesk-reference-title", text: item.label });
          copy.createSpan({ cls: "flowdesk-reference-type", text: item.subtitle });
          button.createSpan({ cls: "flowdesk-reference-arrow", text: web ? "\u2197" : "\u2192", attr: { "aria-hidden": "true" } });
          const open2 = (event) => {
            if (current() && epoch === currentEpoch) void dependencies.open(item.raw, event);
          };
          button.addEventListener("click", open2);
          button.addEventListener("keydown", (event) => {
            if ((event.metaKey || event.ctrlKey) && ["Enter", " "].includes(event.key)) {
              event.preventDefault();
              open2(event);
            }
          });
        }
        if (group.items.length > 3 && !query) {
          const more = details.createEl("button", { cls: "flowdesk-case-reference-more", text: showAll ? "\u6536\u8D77\u4E3A 3 \u9879" : `\u67E5\u770B\u5168\u90E8 ${group.items.length} \u9879 \xB7 \u8FD8\u6709 ${group.items.length - 3} \u9879`, attr: { "data-reference-group": group.label } });
          moreButtons.set(group.label, more);
          more.addEventListener("click", () => {
            var _a2;
            if (!current() || epoch !== currentEpoch) return;
            showAll ? selection.all.delete(group.label) : selection.all.add(group.label);
            selection.open.set(group.label, details.open);
            renderGroups();
            (_a2 = moreButtons.get(group.label)) == null ? void 0 : _a2.focus({ preventScroll: true });
          });
        }
      }
    };
    search.addEventListener("input", () => {
      if (!current()) return;
      selection.query = search.value;
      renderGroups();
    });
    renderGroups();
  }
};

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
function progressDisplayText(text3, timestamp) {
  if (timestamp && text3.startsWith(`[x] \`${timestamp}\``)) text3 = text3.slice(`[x] \`${timestamp}\``.length).trimStart();
  if (!timestamp || !text3.startsWith(timestamp)) return text3;
  const remainder = text3.slice(timestamp.length).replace(/^\s*(?:[：:·—–-]\s*)?/, "").trim();
  return remainder || text3;
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
    this.referenceList = new CaseReferenceList();
  }
  snapshotReadingChoices() {
    return this.referenceList.snapshot();
  }
  restoreReadingChoices(value) {
    this.referenceList.restoreSnapshot(value);
  }
  reset(container) {
    this.referenceList.deactivate();
    container.removeClass("flowdesk-case-dashboard");
  }
  render(container, state) {
    this.referenceList.deactivate();
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
        { label: "\u67E5\u770B\u539F\u6587\u4EF6", run: (event) => this.dependencies.openRelated(state.casePath, state.casePath, event) }
      ]);
    });
    const title = header.createEl("button", { cls: "flowdesk-case-title flowdesk-case-title-link", text: presentation.header.title });
    title.addEventListener("click", (event) => {
      void this.dependencies.openRelated(state.casePath, state.casePath, event);
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
        (event) => void this.dependencies.openRelated(presentation.header.project, state.casePath, event)
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
  markdown(parent, text3, sourcePath, cls) {
    const body = parent.createDiv({ cls: `${cls} markdown-rendered` });
    if (this.dependencies.renderMarkdown) void this.dependencies.renderMarkdown(text3, body, sourcePath).catch(() => body.setText(text3));
    else body.setText(text3);
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
      const list2 = section2.createDiv({ cls: "flowdesk-case-task-list" });
      for (const task of presentation.tasks.primary) this.renderTask(list2, task);
    }
    if (presentation.tasks.history.length) {
      const history = section2.createEl("details", { cls: "flowdesk-case-task-history" });
      history.createEl("summary", { text: `\u5DF2\u7ED3\u675F / \u5DF2\u5F52\u6863 \xB7 ${presentation.tasks.history.length}` });
      const list2 = history.createDiv({ cls: "flowdesk-case-task-list" });
      for (const task of presentation.tasks.history) this.renderTask(list2, task);
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
      (event) => void this.dependencies.openTask(task.id, "work-case", event)
    );
  }
  renderProgress(container, state, presentation) {
    const section2 = createSection(container, "\u6700\u8FD1\u8FDB\u5C55", "flowdesk-case-recent-progress");
    if (!presentation.recentProgress.length) {
      section2.createDiv({ cls: "flowdesk-case-empty", text: "\u672A\u8BB0\u5F55\u7ED3\u6784\u5316 Progress\u3002" });
      return;
    }
    const list2 = section2.createDiv({ cls: "flowdesk-case-progress-list" });
    for (const [index, item] of presentation.recentProgress.slice(0, 3).entries()) {
      const row = list2.createDiv({ cls: `flowdesk-case-progress-item${index === 0 ? " is-latest" : ""}` });
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
        if (events) renderProgressEvents(container2, events, (text3, element) => this.markdown(element, text3, state.casePath, ""), true);
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
  renderRecordGroup(container, state, group, open2, primary) {
    var _a;
    const labels = { goal: "\u76EE\u6807", decisions: "\u5173\u952E\u51B3\u5B9A", discoveries: "\u53D1\u73B0", blockers: "\u98CE\u9669\u4E0E\u963B\u585E\u8BB0\u5F55", outcome: "\u7ED3\u679C", candidatePatterns: "\u7ECF\u9A8C\u5019\u9009", definitionOfDone: "\u5B8C\u6210\u6761\u4EF6" };
    const details = container.createEl("details", { cls: `flowdesk-case-record-group is-${group.key}${primary ? " is-primary" : ""}`, attr: { "data-disclosure-key": `case-record:${group.key}` } });
    details.open = open2;
    details.createEl("summary", { text: `${(_a = labels[group.key]) != null ? _a : group.label} \xB7 ${group.items.length}` });
    const item = group.items[0];
    if (!item) return;
    details.createDiv({ cls: "flowdesk-case-record-heading", text: "\u539F\u6587\u6458\u5F55" });
    this.markdown(details, excerpt(firstParagraph(item.text), 480), state.casePath, "flowdesk-case-record-text");
  }
  renderRelated(container, state, presentation) {
    if (!presentation.related.length) return;
    const section2 = createSection(container, "\u7CBE\u9009\u5165\u53E3", "flowdesk-case-related");
    const edit = section2.createEl("button", { cls: "flowdesk-edit-entries", text: "\u7F16\u8F91\u5165\u53E3", attr: { "aria-label": "\u7F16\u8F91\u7CBE\u9009\u5165\u53E3" } });
    edit.addEventListener("click", (event) => {
      var _a, _b;
      void ((_b = (_a = this.dependencies).editCase) == null ? void 0 : _b.call(_a, state.casePath, event));
    });
    this.referenceList.render(section2, state.casePath, presentation.related, {
      open: (target, event) => this.dependencies.openRelated(target, state.casePath, event),
      icon: this.dependencies.icon
    });
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
      taskOriginal.addEventListener("click", (event) => {
        void this.dependencies.openTask(task.id, "child", event);
      });
      for (const source of task.sources) {
        const button = sources.createEl("button", { text: `\u67E5\u770B\u6765\u6E90\u4EFB\u52A1\uFF1A${source.field} \xB7 API details ${source.line_start}\u2013${source.line_end}` });
        button.addEventListener("click", (event) => {
          var _a, _b;
          void ((_b = (_a = this.dependencies).openTaskSource) == null ? void 0 : _b.call(_a, task.id, { ...source }, event));
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
  const normalize3 = (text4) => text4.replace(/\r\n/g, "\n").replace(/^\ufeff/, "");
  const body = normalize3(details), file = normalize3(fileText);
  if (!body) return note("API\u539F\u6587\u4E3A\u7A7A\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002");
  const start = file.indexOf(body);
  if (start < 0 || file.indexOf(body, start + 1) >= 0 || start > 0 && file[start - 1] !== "\n") return note("API\u539F\u6587\u4E0E\u5F53\u524D\u6587\u4EF6\u4E0D\u540C\u6B65\u6216\u5339\u914D\u4E0D\u552F\u4E00\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002");
  const range = section2.source, startLine = range == null ? void 0 : range.line_start, endLine = (_a = range == null ? void 0 : range.line_end) != null ? _a : startLine;
  const lines = body.split("\n");
  if (typeof startLine !== "number" || typeof endLine !== "number" || !Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) return note("\u6765\u6E90\u7F3A\u5C11\u6709\u6548API\u884C\u8303\u56F4\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002");
  const span = lines.slice(startLine - 1, endLine).join("\n");
  const excerpt2 = typeof (range == null ? void 0 : range.excerpt) === "string" ? normalize3(range.excerpt) : "";
  const text3 = normalize3(section2.text);
  if (!excerpt2 && !text3 || excerpt2 && !span.includes(excerpt2) || text3 && !span.includes(text3)) return note("\u6765\u6E90\u7247\u6BB5\u4E0E\u5F53\u524DAPI\u8303\u56F4\u4E0D\u4E00\u81F4\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002");
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
  return value.replace(/&(?:#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/gi, (entity2) => {
    var _a;
    if (typeof document !== "undefined") {
      entityDecoder != null ? entityDecoder : entityDecoder = document.createElement("textarea");
      entityDecoder.innerHTML = entity2;
      return entityDecoder.value;
    }
    const numeric = entity2.match(/^&#(x[0-9a-f]+|[0-9]+);$/i);
    if (numeric) {
      const token = numeric[1], point = parseInt(token[0].toLowerCase() === "x" ? token.slice(1) : token, token[0].toLowerCase() === "x" ? 16 : 10);
      return point > 0 && point <= 1114111 && !(point >= 55296 && point <= 57343) ? String.fromCodePoint(point) : "\uFFFD";
    }
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\xA0" };
    return (_a = named[entity2.slice(1, -1)]) != null ? _a : entity2;
  });
}
var labelText = (value) => visibleLabel(decodeEntities(value.replace(/<[^>]*>/g, "").replace(/[*_~`]/g, "").replace(/\\(.)/g, "$1")));
function collectMarkdownLinkSources(text3) {
  var _a, _b;
  let fence2 = null;
  let masked = text3.split("\n").map((line) => {
    const content = line.replace(/^ {0,3}(?:>\s*)+/, "");
    const marker = content.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence2) fence2 = { marker: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence2.marker && marker[1].length >= fence2.length && !marker[2].trim()) fence2 = null;
      return "";
    }
    return fence2 || /^(?: {4}|\t)/.test(content) ? "" : line;
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
    const reference2 = masked[close + 1] === "[" ? masked.slice(close + 2, masked.indexOf("]", close + 2)) : label;
    const href = definitions.get((reference2 || label).toLowerCase());
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
  const actualGroup = rendered.map((link2, i) => ({ link: link2, i })).filter((x) => normalized(x.link.href) === href);
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
  let fence2 = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (match) {
      if (!fence2) fence2 = { marker: match[1][0], size: match[1].length };
      else if (match[1][0] === fence2.marker && match[1].length >= fence2.size && !match[2].trim()) fence2 = null;
      continue;
    }
    if (fence2) continue;
    const heading2 = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading2) headings.push({ heading: heading2[2], level: heading2[1].length, index });
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
  snapshot() {
    return [...this.entries].map(([key, state]) => ({ key, open: [...state.open], scroll: state.scroll, nested: [...state.nested].map(([id, value]) => [id, { ...value }]), focus: state.focus }));
  }
  restoreSnapshot(value) {
    this.clear();
    if (!Array.isArray(value)) return;
    for (const item of value.slice(-this.capacity)) {
      if (!item || typeof item !== "object" || typeof item.key !== "string" || !item.key || item.key.length > 4096) continue;
      const open2 = /* @__PURE__ */ new Map(), nested = /* @__PURE__ */ new Map();
      if (Array.isArray(item.open)) {
        for (const pair of item.open.slice(0, 1e3)) if (Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "boolean") open2.set(pair[0], pair[1]);
      }
      if (Array.isArray(item.nested)) {
        for (const pair of item.nested.slice(0, 1e3)) if (Array.isArray(pair) && typeof pair[0] === "string" && pair[1] && typeof pair[1] === "object") nested.set(pair[0], { scroll: Number.isFinite(pair[1].scroll) ? Math.max(0, pair[1].scroll) : 0, items: typeof pair[1].items === "string" ? pair[1].items : null });
      }
      this.entries.set(item.key, { open: open2, nested, scroll: Number.isFinite(item.scroll) ? Math.max(0, item.scroll) : 0, focus: typeof item.focus === "string" ? item.focus : null });
    }
  }
  capture(key, container, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    if (!key) return;
    const list2 = disclosures(container);
    if (!list2.length) return;
    const previous = this.entries.get(key);
    const state = { open: (_a = previous == null ? void 0 : previous.open) != null ? _a : /* @__PURE__ */ new Map(), scroll: options.position === false ? (_b = previous == null ? void 0 : previous.scroll) != null ? _b : 0 : container.scrollTop || 0, nested: (_c = previous == null ? void 0 : previous.nested) != null ? _c : /* @__PURE__ */ new Map(), focus: (_d = previous == null ? void 0 : previous.focus) != null ? _d : null };
    for (const [id, el] of list2) state.open.set(id, el.open);
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
  constructor(app, heading2, renderBody) {
    super(app);
    this.heading = heading2;
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
  constructor(app, heading2, actions) {
    let instance;
    super(app, heading2, (container) => {
      for (const action of actions) {
        const button = container.createEl("button", { cls: "flowdesk-menu-action", text: action.label });
        button.addEventListener("click", async (event) => {
          if (button.disabled) return;
          button.disabled = true;
          try {
            if (!action.label.startsWith("\u590D\u5236")) instance.close();
            await action.run(event);
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
function createReadOnlyTextModal(app, title, text3) {
  return new DashboardContentModal(app, title, (container) => {
    const input = container.createEl("textarea", { cls: "flowdesk-dialog-text", attr: { readonly: "true", "aria-label": title } });
    input.value = text3;
    const feedback = container.createDiv({ cls: "flowdesk-muted", attr: { role: "status" } }), copy = container.createEl("button", { text: "\u590D\u5236" });
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text3);
        feedback.setText("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
      } catch (e) {
        feedback.setText("\u672A\u80FD\u5199\u5165\u526A\u8D34\u677F\uFF0C\u53EF\u9009\u62E9\u6587\u672C\u624B\u52A8\u590D\u5236\u3002");
      }
    });
  });
}

// src/dashboard-layout.ts
var activeLayouts = /* @__PURE__ */ new WeakMap();
var wideContentWidth = 960;
function applyDashboardLayout(container, kind) {
  var _a, _b;
  const previous = activeLayouts.get(container);
  const nodes = previous && previous.wrapper.parentElement === container ? [...previous.nodes, ...Array.from(container.children).filter((node) => node !== previous.wrapper)] : Array.from(container.children);
  previous == null ? void 0 : previous.cleanup();
  const focused = (_a = container.ownerDocument) == null ? void 0 : _a.activeElement;
  const scrollTop = container.scrollTop, scrollLeft = container.scrollLeft;
  const wrapper = container.createDiv({ cls: "flowdesk-dashboard-layout" });
  for (const node of nodes) wrapper.appendChild(node);
  previous == null ? void 0 : previous.wrapper.remove();
  const hasChildren = kind === "task" && nodes.some((node) => node.classList.contains("flowdesk-child-section"));
  const regions = new Map(nodes.map((node) => [node, regionFor(node, kind, hasChildren)]));
  for (const node of nodes) node.setAttr("data-layout-region", regions.get(node));
  const mainNodes = nodes.filter((node) => regions.get(node) === "main");
  const auxiliaryNodes = nodes.filter((node) => regions.get(node) === "auxiliary");
  const hasColumns = mainNodes.length > 0 && auxiliaryNodes.length > 0;
  let columns = null;
  let wide;
  let disposed = false;
  const preserveInteraction = (focus, top, left) => {
    if (focus && container.contains(focus) && container.ownerDocument.activeElement !== focus) {
      focus.focus({ preventScroll: true });
    }
    container.scrollTop = top;
    container.scrollLeft = left;
  };
  const updateWidth = (width) => {
    if (disposed || wrapper.parentElement !== container) return;
    const nextWide = width >= wideContentWidth;
    if (nextWide === wide) return;
    const currentFocus = container.ownerDocument.activeElement;
    const top = container.scrollTop, left = container.scrollLeft;
    wide = nextWide;
    if (wide) wrapper.addClass("is-wide");
    else wrapper.removeClass("is-wide");
    if (wide && hasColumns) {
      wrapper.addClass("has-auxiliary");
      columns = wrapper.createDiv({ cls: "flowdesk-dashboard-columns" });
      const main = columns.createDiv({ cls: "flowdesk-dashboard-main" });
      const aside = columns.createEl("aside", { cls: "flowdesk-dashboard-aside", attr: { "aria-label": "\u8F85\u52A9\u8D44\u6599" } });
      for (const node of nodes.filter((node2) => regions.get(node2) === "full")) wrapper.appendChild(node);
      wrapper.appendChild(columns);
      for (const node of mainNodes) main.appendChild(node);
      for (const node of auxiliaryNodes) aside.appendChild(node);
    } else {
      wrapper.removeClass("has-auxiliary");
      for (const node of nodes) wrapper.appendChild(node);
      columns == null ? void 0 : columns.remove();
      columns = null;
    }
    preserveInteraction(currentFocus, top, left);
  };
  const view = container.ownerDocument.defaultView;
  const padding = view == null ? void 0 : view.getComputedStyle(container);
  updateWidth(container.clientWidth - (parseFloat((padding == null ? void 0 : padding.paddingLeft) || "0") || 0) - (parseFloat((padding == null ? void 0 : padding.paddingRight) || "0") || 0));
  preserveInteraction(focused, scrollTop, scrollLeft);
  const Observer = (_b = view == null ? void 0 : view.ResizeObserver) != null ? _b : globalThis.ResizeObserver;
  const observer = typeof Observer === "function" ? new Observer((entries) => {
    if (entries[0]) updateWidth(entries[0].contentRect.width);
  }) : null;
  observer == null ? void 0 : observer.observe(container);
  const state = {
    wrapper,
    nodes,
    cleanup: () => {
      if (disposed) return;
      disposed = true;
      observer == null ? void 0 : observer.disconnect();
    }
  };
  activeLayouts.set(container, state);
  return state.cleanup;
}
function regionFor(node, kind, hasChildren) {
  if (kind === "task") {
    if (node.classList.contains("flowdesk-child-section")) return "auxiliary";
    if (node.classList.contains("flowdesk-task-technical")) return hasChildren ? "auxiliary" : "main";
    if (["flowdesk-task-overview", "flowdesk-reading-navigation", "flowdesk-contract-summary", "flowdesk-task-process"].some((name) => node.classList.contains(name))) return "main";
  } else {
    if (["flowdesk-case-current", "flowdesk-case-recent-progress", "flowdesk-case-record"].some((name) => node.classList.contains(name))) return "main";
    if (["flowdesk-case-tasks", "flowdesk-case-related", "flowdesk-case-recovery", "flowdesk-case-diagnostics"].some((name) => node.classList.contains(name))) return "auxiliary";
  }
  return "full";
}

// src/dashboard-placement.ts
function selectContentLeaf(workspace, dashboardType, newTab = false) {
  var _a, _b;
  if (newTab) return workspace.getLeaf("tab");
  const reusable = (leaf) => {
    var _a2, _b2, _c, _d, _e;
    return !!leaf && ((_d = (_a2 = leaf.getViewState) == null ? void 0 : _a2.call(leaf).type) != null ? _d : (_c = (_b2 = leaf.view) == null ? void 0 : _b2.getViewType) == null ? void 0 : _c.call(_b2)) !== dashboardType && !((_e = leaf.getViewState) == null ? void 0 : _e.call(leaf).pinned);
  };
  const candidate = workspace.getLeaf(false);
  if (reusable(candidate)) return candidate;
  const recent = (_a = workspace.getMostRecentLeaf) == null ? void 0 : _a.call(workspace, workspace.rootSplit);
  if (reusable(recent)) return recent;
  let existing = null;
  (_b = workspace.iterateRootLeaves) == null ? void 0 : _b.call(workspace, (leaf) => {
    if (!existing && reusable(leaf)) existing = leaf;
  });
  return existing != null ? existing : workspace.getLeaf("tab");
}
async function placeDashboard(workspace, source, type, state, placement, beforeDetach) {
  const destination = placement === "main" ? workspace.getLeaf("tab") : workspace.getRightLeaf(false);
  if (!destination || destination === source) throw new Error("\u672A\u80FD\u521B\u5EFA Dashboard \u9605\u8BFB\u4F4D\u7F6E\u3002");
  try {
    await destination.setViewState({ type, active: true, pinned: placement === "main", state });
    beforeDetach == null ? void 0 : beforeDetach();
    await workspace.revealLeaf(destination);
    beforeDetach == null ? void 0 : beforeDetach();
  } catch (error) {
    destination.detach();
    throw error;
  }
  source.detach();
  return destination;
}

// src/repository-reader-view.ts
var import_obsidian2 = require("obsidian");
var path7 = __toESM(require("path"));

// node_modules/mdurl/index.mjs
var mdurl_exports = {};
__export(mdurl_exports, {
  decode: () => decode_default,
  encode: () => encode_default,
  format: () => format,
  parse: () => parse_default
});

// node_modules/mdurl/lib/decode.mjs
var decodeCache = {};
function getDecodeCache(exclude) {
  let cache = decodeCache[exclude];
  if (cache) {
    return cache;
  }
  cache = decodeCache[exclude] = [];
  for (let i = 0; i < 128; i++) {
    const ch = String.fromCharCode(i);
    cache.push(ch);
  }
  for (let i = 0; i < exclude.length; i++) {
    const ch = exclude.charCodeAt(i);
    cache[ch] = "%" + ("0" + ch.toString(16).toUpperCase()).slice(-2);
  }
  return cache;
}
function decode(string2, exclude) {
  if (typeof exclude !== "string") {
    exclude = decode.defaultChars;
  }
  const cache = getDecodeCache(exclude);
  return string2.replace(/(%[a-f0-9]{2})+/gi, function(seq) {
    let result = "";
    for (let i = 0, l = seq.length; i < l; i += 3) {
      const b1 = parseInt(seq.slice(i + 1, i + 3), 16);
      if (b1 < 128) {
        result += cache[b1];
        continue;
      }
      if ((b1 & 224) === 192 && i + 3 < l) {
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        if ((b2 & 192) === 128) {
          const chr = b1 << 6 & 1984 | b2 & 63;
          if (chr < 128) {
            result += "\uFFFD\uFFFD";
          } else {
            result += String.fromCharCode(chr);
          }
          i += 3;
          continue;
        }
      }
      if ((b1 & 240) === 224 && i + 6 < l) {
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
        if ((b2 & 192) === 128 && (b3 & 192) === 128) {
          const chr = b1 << 12 & 61440 | b2 << 6 & 4032 | b3 & 63;
          if (chr < 2048 || chr >= 55296 && chr <= 57343) {
            result += "\uFFFD\uFFFD\uFFFD";
          } else {
            result += String.fromCharCode(chr);
          }
          i += 6;
          continue;
        }
      }
      if ((b1 & 248) === 240 && i + 9 < l) {
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
        const b4 = parseInt(seq.slice(i + 10, i + 12), 16);
        if ((b2 & 192) === 128 && (b3 & 192) === 128 && (b4 & 192) === 128) {
          let chr = b1 << 18 & 1835008 | b2 << 12 & 258048 | b3 << 6 & 4032 | b4 & 63;
          if (chr < 65536 || chr > 1114111) {
            result += "\uFFFD\uFFFD\uFFFD\uFFFD";
          } else {
            chr -= 65536;
            result += String.fromCharCode(55296 + (chr >> 10), 56320 + (chr & 1023));
          }
          i += 9;
          continue;
        }
      }
      result += "\uFFFD";
    }
    return result;
  });
}
decode.defaultChars = ";/?:@&=+$,#";
decode.componentChars = "";
var decode_default = decode;

// node_modules/mdurl/lib/encode.mjs
var encodeCache = {};
function getEncodeCache(exclude) {
  let cache = encodeCache[exclude];
  if (cache) {
    return cache;
  }
  cache = encodeCache[exclude] = [];
  for (let i = 0; i < 128; i++) {
    const ch = String.fromCharCode(i);
    if (/^[0-9a-z]$/i.test(ch)) {
      cache.push(ch);
    } else {
      cache.push("%" + ("0" + i.toString(16).toUpperCase()).slice(-2));
    }
  }
  for (let i = 0; i < exclude.length; i++) {
    cache[exclude.charCodeAt(i)] = exclude[i];
  }
  return cache;
}
function encode(string2, exclude, keepEscaped) {
  if (typeof exclude !== "string") {
    keepEscaped = exclude;
    exclude = encode.defaultChars;
  }
  if (typeof keepEscaped === "undefined") {
    keepEscaped = true;
  }
  const cache = getEncodeCache(exclude);
  let result = "";
  for (let i = 0, l = string2.length; i < l; i++) {
    const code2 = string2.charCodeAt(i);
    if (keepEscaped && code2 === 37 && i + 2 < l) {
      if (/^[0-9a-f]{2}$/i.test(string2.slice(i + 1, i + 3))) {
        result += string2.slice(i, i + 3);
        i += 2;
        continue;
      }
    }
    if (code2 < 128) {
      result += cache[code2];
      continue;
    }
    if (code2 >= 55296 && code2 <= 57343) {
      if (code2 >= 55296 && code2 <= 56319 && i + 1 < l) {
        const nextCode = string2.charCodeAt(i + 1);
        if (nextCode >= 56320 && nextCode <= 57343) {
          result += encodeURIComponent(string2[i] + string2[i + 1]);
          i++;
          continue;
        }
      }
      result += "%EF%BF%BD";
      continue;
    }
    result += encodeURIComponent(string2[i]);
  }
  return result;
}
encode.defaultChars = ";/?:@&=+$,-_.!~*'()#";
encode.componentChars = "-_.!~*'()";
var encode_default = encode;

// node_modules/mdurl/lib/format.mjs
function format(url) {
  let result = "";
  result += url.protocol || "";
  result += url.slashes ? "//" : "";
  result += url.auth ? url.auth + "@" : "";
  if (url.hostname && url.hostname.indexOf(":") !== -1) {
    result += "[" + url.hostname + "]";
  } else {
    result += url.hostname || "";
  }
  result += url.port ? ":" + url.port : "";
  result += url.pathname || "";
  result += url.search || "";
  result += url.hash || "";
  return result;
}

// node_modules/mdurl/lib/parse.mjs
function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.pathname = null;
}
var protocolPattern = /^([a-z0-9.+-]+:)/i;
var portPattern = /:[0-9]*$/;
var simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;
var delims = ["<", ">", '"', "`", " ", "\r", "\n", "	"];
var unwise = ["{", "}", "|", "\\", "^", "`"].concat(delims);
var autoEscape = ["'"].concat(unwise);
var nonHostChars = ["%", "/", "?", ";", "#"].concat(autoEscape);
var hostEndingChars = ["/", "?", "#"];
var hostnameMaxLen = 255;
var hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/;
var hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/;
var hostlessProtocol = {
  javascript: true,
  "javascript:": true
};
var slashedProtocol = {
  http: true,
  https: true,
  ftp: true,
  gopher: true,
  file: true,
  "http:": true,
  "https:": true,
  "ftp:": true,
  "gopher:": true,
  "file:": true
};
function urlParse(url, slashesDenoteHost) {
  if (url && url instanceof Url) return url;
  const u = new Url();
  u.parse(url, slashesDenoteHost);
  return u;
}
Url.prototype.parse = function(url, slashesDenoteHost) {
  let lowerProto, hec, slashes;
  let rest = url;
  rest = rest.trim();
  if (!slashesDenoteHost && url.split("#").length === 1) {
    const simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
      }
      return this;
    }
  }
  let proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    lowerProto = proto.toLowerCase();
    this.protocol = proto;
    rest = rest.substr(proto.length);
  }
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    slashes = rest.substr(0, 2) === "//";
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }
  if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
    let hostEnd = -1;
    for (let i = 0; i < hostEndingChars.length; i++) {
      hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }
    let auth, atSign;
    if (hostEnd === -1) {
      atSign = rest.lastIndexOf("@");
    } else {
      atSign = rest.lastIndexOf("@", hostEnd);
    }
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = auth;
    }
    hostEnd = -1;
    for (let i = 0; i < nonHostChars.length; i++) {
      hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }
    if (hostEnd === -1) {
      hostEnd = rest.length;
    }
    if (rest[hostEnd - 1] === ":") {
      hostEnd--;
    }
    const host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);
    this.parseHost(host);
    this.hostname = this.hostname || "";
    const ipv6Hostname = this.hostname[0] === "[" && this.hostname[this.hostname.length - 1] === "]";
    if (!ipv6Hostname) {
      const hostparts = this.hostname.split(/\./);
      for (let i = 0, l = hostparts.length; i < l; i++) {
        const part = hostparts[i];
        if (!part) {
          continue;
        }
        if (!part.match(hostnamePartPattern)) {
          let newpart = "";
          for (let j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              newpart += "x";
            } else {
              newpart += part[j];
            }
          }
          if (!newpart.match(hostnamePartPattern)) {
            const validParts = hostparts.slice(0, i);
            const notHost = hostparts.slice(i + 1);
            const bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = notHost.join(".") + rest;
            }
            this.hostname = validParts.join(".");
            break;
          }
        }
      }
    }
    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = "";
    }
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
    }
  }
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  const qm = rest.indexOf("?");
  if (qm !== -1) {
    this.search = rest.substr(qm);
    rest = rest.slice(0, qm);
  }
  if (rest) {
    this.pathname = rest;
  }
  if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
    this.pathname = "";
  }
  return this;
};
Url.prototype.parseHost = function(host) {
  let port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ":") {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) {
    this.hostname = host;
  }
};
var parse_default = urlParse;

// node_modules/uc.micro/build/index.mjs
var build_exports = {};
__export(build_exports, {
  Any: () => Any,
  Cc: () => Cc,
  Cf: () => Cf,
  P: () => P,
  S: () => S,
  Z: () => Z
});
var Any = /[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var Cc = /[\0-\x1F\x7F-\x9F]/;
var Cf = /[\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;
var P = /[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061D-\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B4E\u1B4F\u1B5A-\u1B60\u1B7D-\u1B7F\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52-\u2E5D\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDD6E\uDEAD\uDED0\uDF55-\uDF59\uDF86-\uDF89]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9\uDFD4\uDFD5\uDFD7\uDFD8]|\uD805[\uDC4B-\uDC4F\uDC5A\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDEB9\uDF3C-\uDF3E]|\uD806[\uDC3B\uDD44-\uDD46\uDDE2\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2\uDF00-\uDF09\uDFE1]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8\uDF43-\uDF4F\uDFFF]|\uD809[\uDC70-\uDC74]|\uD80B[\uDFF1\uDFF2]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDD6D-\uDD6F\uDE97-\uDE9A\uDFE2]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD839\uDDFF|\uD83A[\uDD5E\uDD5F]/;
var S = /[\$\+<->\^`\|~\xA2-\xA6\xA8\xA9\xAC\xAE-\xB1\xB4\xB8\xD7\xF7\u02C2-\u02C5\u02D2-\u02DF\u02E5-\u02EB\u02ED\u02EF-\u02FF\u0375\u0384\u0385\u03F6\u0482\u058D-\u058F\u0606-\u0608\u060B\u060E\u060F\u06DE\u06E9\u06FD\u06FE\u07F6\u07FE\u07FF\u0888\u09F2\u09F3\u09FA\u09FB\u0AF1\u0B70\u0BF3-\u0BFA\u0C7F\u0D4F\u0D79\u0E3F\u0F01-\u0F03\u0F13\u0F15-\u0F17\u0F1A-\u0F1F\u0F34\u0F36\u0F38\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE\u0FCF\u0FD5-\u0FD8\u109E\u109F\u1390-\u1399\u166D\u17DB\u1940\u19DE-\u19FF\u1B61-\u1B6A\u1B74-\u1B7C\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u2044\u2052\u207A-\u207C\u208A-\u208C\u20A0-\u20C1\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u214F\u218A\u218B\u2190-\u2307\u230C-\u2328\u232B-\u2429\u2440-\u244A\u249C-\u24E9\u2500-\u2767\u2794-\u27C4\u27C7-\u27E5\u27F0-\u2982\u2999-\u29D7\u29DC-\u29FB\u29FE-\u2B73\u2B76-\u2BFF\u2CE5-\u2CEA\u2E50\u2E51\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3004\u3012\u3013\u3020\u3036\u3037\u303E\u303F\u309B\u309C\u3190\u3191\u3196-\u319F\u31C0-\u31E5\u31EF\u3200-\u321E\u322A-\u3247\u3250\u3260-\u327F\u328A-\u32B0\u32C0-\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA700-\uA716\uA720\uA721\uA789\uA78A\uA828-\uA82B\uA836-\uA839\uAA77-\uAA79\uAB5B\uAB6A\uAB6B\uFB29\uFBB2-\uFBD2\uFD40-\uFD4F\uFD90\uFD91\uFDC8-\uFDCF\uFDFC-\uFDFF\uFE62\uFE64-\uFE66\uFE69\uFF04\uFF0B\uFF1C-\uFF1E\uFF3E\uFF40\uFF5C\uFF5E\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFC\uFFFD]|\uD800[\uDD37-\uDD3F\uDD79-\uDD89\uDD8C-\uDD8E\uDD90-\uDD9C\uDDA0\uDDD0-\uDDFC]|\uD802[\uDC77\uDC78\uDEC8]|\uD803[\uDD8E\uDD8F\uDED1-\uDED8]|\uD805\uDF3F|\uD807[\uDFD5-\uDFF1]|\uD81A[\uDF3C-\uDF3F\uDF45]|\uD82F\uDC9C|\uD833[\uDC00-\uDCEF\uDCFA-\uDCFC\uDD00-\uDEB3\uDEBA-\uDED0\uDEE0-\uDEF0\uDF50-\uDFC3]|\uD834[\uDC00-\uDCF5\uDD00-\uDD26\uDD29-\uDD64\uDD6A-\uDD6C\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDDEA\uDE00-\uDE41\uDE45\uDF00-\uDF56]|\uD835[\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85\uDE86]|\uD838[\uDD4F\uDEFF]|\uD83B[\uDCAC\uDCB0\uDD2E\uDEF0\uDEF1]|\uD83C[\uDC00-\uDC2B\uDC30-\uDC93\uDCA0-\uDCAE\uDCB1-\uDCBF\uDCC1-\uDCCF\uDCD1-\uDCF5\uDD0D-\uDDAD\uDDE6-\uDE02\uDE10-\uDE3B\uDE40-\uDE48\uDE50\uDE51\uDE60-\uDE65\uDF00-\uDFFF]|\uD83D[\uDC00-\uDED8\uDEDC-\uDEEC\uDEF0-\uDEFC\uDF00-\uDFD9\uDFE0-\uDFEB\uDFF0]|\uD83E[\uDC00-\uDC0B\uDC10-\uDC47\uDC50-\uDC59\uDC60-\uDC87\uDC90-\uDCAD\uDCB0-\uDCBB\uDCC0\uDCC1\uDCD0-\uDCD8\uDD00-\uDE57\uDE60-\uDE6D\uDE70-\uDE7C\uDE80-\uDE8A\uDE8E-\uDEC6\uDEC8\uDECD-\uDEDC\uDEDF-\uDEEA\uDEEF-\uDEF8\uDF00-\uDF92\uDF94-\uDFEF\uDFFA]/;
var Z = /[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

// node_modules/entities/dist/decode-codepoint.js
var c1 = [
  8364,
  0,
  8218,
  402,
  8222,
  8230,
  8224,
  8225,
  710,
  8240,
  352,
  8249,
  338,
  0,
  381,
  0,
  0,
  8216,
  8217,
  8220,
  8221,
  8226,
  8211,
  8212,
  732,
  8482,
  353,
  8250,
  339,
  0,
  382,
  376
];
function isInvalidCodePoint(codePoint) {
  return codePoint === 0 || codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111;
}
function replaceCodePoint(codePoint) {
  if (isInvalidCodePoint(codePoint)) {
    return 65533;
  }
  if (codePoint >= 128 && codePoint <= 159) {
    return c1[codePoint - 128] || codePoint;
  }
  return codePoint;
}
function codePointToString(codePoint) {
  return codePoint - 1 >>> 0 < 127 || codePoint - 160 >>> 0 < 55136 ? String.fromCharCode(codePoint) : String.fromCodePoint(replaceCodePoint(codePoint));
}

// node_modules/entities/dist/internal/decode-shared.js
var BASE91_INVERSE = /* @__PURE__ */ (() => {
  const table2 = new Uint8Array(127);
  let code2 = 0;
  for (let char = 33; char <= 126; char++) {
    if (char !== 34 && char !== 36 && char !== 92) {
      table2[char] = code2++;
    }
  }
  return table2;
})();
function decodeTrieDict(input, resultLength, atomCount, dict1AtomCount, ngramCount, dictSize) {
  const base = 91;
  const inputLength = input.length;
  const twoCharBias = dictSize * (base - 1);
  let pos = 0;
  const readSlotCode = () => {
    const c12 = BASE91_INVERSE[input.charCodeAt(pos++)];
    return c12 < dictSize ? c12 : c12 * base - twoCharBias + BASE91_INVERSE[input.charCodeAt(pos++)];
  };
  const dict2AtomCount = atomCount - dict1AtomCount;
  const slotCount = atomCount + ngramCount;
  const single = new Int32Array(slotCount);
  single.fill(-1, dict1AtomCount, dictSize);
  single.fill(-1, dictSize + dict2AtomCount, slotCount);
  const start = new Int32Array(slotCount);
  const length = new Int32Array(slotCount);
  function decodeDelta(count, off) {
    let previous = 0;
    let slot = off;
    const end = off + count;
    while (slot < end) {
      const code2 = BASE91_INVERSE[input.charCodeAt(pos++)];
      if (code2 < 89) {
        previous += code2;
        single[slot++] = previous;
      } else if (code2 === 89) {
        let runLength = BASE91_INVERSE[input.charCodeAt(pos++)] + 2;
        while (runLength--)
          single[slot++] = ++previous;
      } else {
        const next = BASE91_INVERSE[input.charCodeAt(pos++)];
        previous += 89 + // eslint-disable-next-line unicorn/prefer-minimal-ternary -- branches read a different number of side-effecting input bytes
        (next < 90 ? next * base + BASE91_INVERSE[input.charCodeAt(pos++)] : BASE91_INVERSE[input.charCodeAt(pos++)] * 8281 + BASE91_INVERSE[input.charCodeAt(pos++)] * base + BASE91_INVERSE[input.charCodeAt(pos++)]);
        single[slot++] = previous;
      }
    }
  }
  decodeDelta(dict1AtomCount, 0);
  decodeDelta(dict2AtomCount, dictSize);
  const references = new Int32Array(ngramCount * 2);
  let poolSize = 0;
  let ngramIndex = 0;
  function readNgramReferences(count, startSlot) {
    for (let index = 0; index < count; index++) {
      const slot = startSlot + index;
      const a = readSlotCode();
      const b = readSlotCode();
      references[ngramIndex * 2] = a;
      references[ngramIndex * 2 + 1] = b;
      ngramIndex += 1;
      start[slot] = poolSize;
      const entryLength = (single[a] < 0 ? length[a] : 1) + (single[b] < 0 ? length[b] : 1);
      length[slot] = entryLength;
      poolSize += entryLength;
    }
  }
  readNgramReferences(ngramCount - dictSize + dict1AtomCount, dictSize + dict2AtomCount);
  readNgramReferences(dictSize - dict1AtomCount, dict1AtomCount);
  const pool = new Uint16Array(poolSize);
  let write = 0;
  for (let index = 0; index < ngramIndex; index++) {
    for (let half = 0; half < 2; half++) {
      const source = references[index * 2 + half];
      const value = single[source];
      if (value < 0) {
        let read = start[source];
        const readEnd = read + length[source];
        while (read < readEnd)
          pool[write++] = pool[read++];
      } else {
        pool[write++] = value;
      }
    }
  }
  const out = new Uint16Array(resultLength);
  let outIndex = 0;
  while (pos < inputLength) {
    let slot = BASE91_INVERSE[input.charCodeAt(pos++)];
    if (slot >= dictSize) {
      slot = slot * base - twoCharBias + BASE91_INVERSE[input.charCodeAt(pos++)];
    }
    const value = single[slot];
    if (value < 0) {
      let read = start[slot];
      const readEnd = read + length[slot];
      while (read < readEnd)
        out[outIndex++] = pool[read++];
    } else {
      out[outIndex++] = value;
    }
  }
  return out;
}

// node_modules/entities/dist/generated/decode-data-html.js
var htmlDecodeTree = /* @__PURE__ */ decodeTrieDict("!}.&u%}'&}*'~!6*)%&,~!J~!J~%L~y<~!R,~~%Lu~~#GD~~#|)1#%}^%}2%+#.##%##%}&%##%'#%##&%#%#'%#&#%#&#'#%%#&#%##%#)%''%&%#%#'%#%%#%%}%%%#%#&(23#%%#&-%0%('1#(##%#'##+%'*.:1}#%#6-+(%'%%#%%%}#L'2351&('%}&/N'(0(/*-%(%%}#'+&T%7.2}#&%&#%#36/5##%&%%#&#%%#))2%%##%&&'0~!#*+&'%1~!%).'3q?&%'1~!.##%6(~!+%%%(Gw'rT~!E#<nA%#jZ~!H%(~!42##~!*31&~!G%U~#)5~#`3~!J~!Z~%]~%Y~%C~!q~!u~#kz~%#~!6'~!D~!U~!?~#T~!c%~!G#'~%7|~!G~!J~!G&~#pb~(Df}#%}*&}#%##%##%##&#-}&'#'&%#.++}%mI,#,@&(}*%}*'%&##&#%##%}&0}#.},U},%}+%}&%}#%##&}B%(}(%}+%)})%##%#&}&%##%&}<%}>%#%&}*%}(%}9%}/%})%}*%}*%}?&}&%}3%}&*#%})%#%#)}#&#-#+*%E%%'%'#%}#*V##&##I}#&&##%&%#&&Qf%%))w/0+&%#(#.%-''''++++7}>%4'',##1,#%#&%##&#'##&#*#9)%&%}#*}%,#+P(%A&%#'&##wSD',9E00#y#@}(+}&%&>~!#~!X}#*}(&&}(&}(,%}%&#+&}#&}I%#%}%)#(},'%#*}4%%#%}(''}#/##(##),%-##%%)#&}(.}&%#&}%%}*&#%},&&}&%}#%*'#%})%}D&}&%}-&}6&#&}-,%}#%})-(~+`~,=?~I9'9%~!,#%})%})%}@%}?%}(~!?~#<~#pP~#BG~#=1#%K+~#?#~%;)~#A~#mF1~#A'~'X%'~#lR~#N~'N~#r~#m#-~#i'?%#'%~#B%##%,%#~#_%#0%~#]732~,w~2+#:&#%&'0%&>%}#>##F+)#%&&#(+_}4&}-%}(&}@&}O7Fdf0@+/v4}&WU##&/0#&'('B#%}.%}'+#%}#%%&#&%#%##+#&#)#6#'#.},%}c%},%#%##%&#&%#&~#>'*-.%##%##%}#%%}%'~#)D1}#%*&~#_%%'(~#S2%'.}#~#=##*'*-%}&'%'##&&~'E%.#&~#M4}%%##&'%#~#O1##%&#'+~#<B%##%%'%+~#;#@%}#&%#&&%#(~#H1}'%'##&&~#?A}&'~#D#%32}'&&&&~#[}'(#%}'~#;C})&}%%#%~#=&%,3}%'(#%%~#^'#&&)#%'~#Y%-~#d-%'~#^%%&#&&&}#~#b~2t*&'~&(~&@~0%~e~3}%*''0})&}+~!9##-}#%-hD*)1fC#%/&/fB#40~!+#)*4~!+~!K'&:~!/*7~!.#~!H~!L':~%x&~!H#~!*~%1~!I#~!+A~#p'~!F~~#-#~,,(~.Z~!V~%;'B'mq-W~!N~%I%#&&#&}#%},%%}'%}+X#%}#&}(%}'%}<%}#%}%%'}'%}:~![)9@~%>~#UA%-%##&~!C%~!-.9:~!1~!-^2/:a~!y,D*J#-5)/4~%23,~#G~!L1~!0X3`~!2+~!!0-~&E~!W~!o,>Y&]~%cZx_&~#O*9#A#'#+I'%#)~!0B*-5A+-((F&*M#)(-7-5+'-3a5Vi~!Y~!?+[)%3),ERHm~!+:D,VG.+)?fB%%*(%)'(#&80%1'8`K8?`+'Z#&O&'H5#*9)A%%5&3))0%39+.*7#()&&*=4@**L)<'_&*+..;(#*+)./&0#3)%')-8(4ixD(&.}%,('aI:,)%,k2231T)I'#/-W7,/'Q#.'Y24+h')37</31&83##&0#),H(?'&?/1##%#&&#%''-%&&&#(&''&#.-'%#%%(,')*'&#&#'##%(%(#%('#&##%%%%('%#%#%%#%#&%##h>w+v<ayvyvcg.uuhKr}g/v|g>u9i[~>g5uI~=RvdwEg;v/g;uk!!TTSx]@RT!U!#!@VBRUU!'UTe-d0c`e&gSdicedFcrdTaqb.kYcAohdYd@a3e+d}dMdtd.aJ#bqcK`dle/e.e'dwdPdodddjbEb}ogd^ofdpduc6j?l%d{drdqc)d7bacOdQ%T#Y)X.sR[yH>6Vyv3[xwLu>vo'!*.[yBacahoj>6Rew3[xqdZa#!a&#^(X-[yG>6Vyu3[xvg3sEr|g.u/Ri9db0T#^(Xa)!-[y;>6Vylg4wKs{JwNZt3@3r=c4Z([xlg;wKt!cpq's@v7A'*a(a+!-a#[y<3Dt?3Dt'>6Vym3[xmg9rxsNJwLZt4~?r?db1T#`-!(Xa,!0[yS>6Vz%NuQs.g4wKtnJwNZtS@3r>c4Z([y%g;wKtrdga8!a(!#&T*Y-Xa#!a0<or[yc3Dtq>6Vz43[y3JwNZtf@3s!Ju}!%Dti:pm3c_%X#tjB5pkd6q!r]u?voC'*-a.a2!0a&a+[yI3DtI3Ds~3DtH>6Vyw3[xx;:s#~<5pKJwNZtE@3r~d`a)!a2T#a.(!+U.X1[yT3Dt`3Dtv>6Vz&3[y&g9rxwzcxstPu.<rAJwLZtT~?r@dZa%!a.&^*Za(/Reu[ya>6Vz23[y1g3sEr}wkg{NuQRg{ci(U#5@b`~,cg#U(2WnH5wugcRh7dX#T(Y,a'Ta!!a,[yZ<]mj>6Vz,3[y+Pv#5ReZKu+=,%!H}7ABwkaS?Rh:BcW(X#<]mrj:ubv/ARekdg%!(!a.*Ta(Y.X1!#sP>Rl*Dt6[y>>6Vyo3Wf*jOvuumvuRgRJuq*!:9<B@bX~3jVv&v@s@5Re[d/rQt{uAvo&a&a*)a2!,0Wf!3Dt0=Bs'>6Re}3[xy~<5s%JwJZt1~Gs)c;&!#2sJkNuXvzq7rxu,Re8dka4!a8(aEZ+a@Y.X1Xa)[yd=Bs(3DtP>6Vz53[y4cX#X&Re:avRe9~<5s&JwJZtQ~Gs*i^rzvdRg+Jv{%!2sbB@bX}kdga,!Za?&^*T1/!a'Dt+[y6>6Vyf3Wf%g/u;s4hGu6?Rh-JvZ,!c%#&RoX54Rivj7uyvf8RgTKvZB%*!2sGh<vu5Rgq<=C::9bb~#dZ#T&Ta6Y.X*Dt>[y93Wf)coZ(T,6VyifluvRgC@95@B@bX~/hFu34cC#T,k/unq8w8Q5RkUklwQuzunq8w8Q5Rk8d/rJu?v8w9)-&!a0a;a&aIWejg3sEr/h1s<DtDJvyZqY5aws3Jvy!&Wei~Hr1:au5@Bag>23E~5c:Z&bX};kKv?w&unuVu5Rjc;>bs)#~@:Rh.=ay<a]C;b`}Vd6s/t{uAvoaxa()!a,a7%-a#a2Dt,[yF2Wo[>6Vyt3[xuNuPRi&NuPwpi#RoWh?vf8Ri%Jv]!%Ri:KvxD!.'2WeAjZu`q9rxu,Re7woeAg-unLq(qA_/*2Wg_g3u5q^9:4E}/jTrxrzv=Wkkd~0UX#^^Xa-a1a5T&a=U1a'*aEa]!a*aPaA-adok[y54Rn>;:p3~Dp5g9rpsFNvZqjg3uJp4~<5p0Pw;5qlJwNZt*@3p1Pw:5p/Ou!5p2JvG'!6Vye=<qnJvh_[xhg3v,Rh3kOwOw-sDuev/Re^dha[a%!%!a+#Ta7)-5TaCaO!aka!a)sf[yb2>Rl!9ARiq5E}Qg=ucRkBE|oJrJ_@Wk~@Wk{JrJ_@Wk|@WkyJrJ_@Wk}@WkzJvO_[y2g-vMRmiKuYC!)&>Ri;>Ri<@3RkNc](X#@9Rk=g5vuRmhKvDB!+'=]meg3u4Rmgd)#Y'Vz3CARmfd`a+!%T'!+#Ta1Ta6TaM-sTDt9[yA9sYd'%Y#s[[xpj:ueunaXRgEjRq,v-vuqdd2'`#6Rev<32@5>:2<E}5xIo9a*X#Y(;5RePJvD_g>vyRgNj8w)v8<wggs:RgXiZt|vjx,hSq3ah!-(~@:Ro/Ou!5RhWj^v(pyw8unRhUdx-UY#^Ua.a3a70!)%UX1TaDa)'omRiRRhE[y:3Dsz=Br,>6Vyj3[xkg6ruwjcqsrPw;5r*Ku]D'Zt-@3r(~?r.i[vwv]dU1a--U#`a4(g/vsRhPOu!5RhLj:rmu9Wo!~@:wdh@g/vsRiTjXuvvNr}:RhBj^v(pyw8unRn]dz1UYa'a+^Y(!aETZalaRY.Ta?a4[yDJw1!#qLsW>6Vyrfzq-pLflpwRe|Js>%!Dt@3Dt&Jvy_[xs~HrnjMuwpsw'RecKu+D#'!t<~Grl~?rjg5u-x,gwp{ah!-(~@:Rg~Ou!5Rh'jXuvvNr}:Rh#cW#X/c;&!#2sLi[v7u7RgpJv)(!iLrxu,Re6j7v@s@5Se[e7d`aW!Za(a`T.a#!a3!&aDa-!9)Dt_=6s+3[x~~DR|h~DS6avhGun5RkZj3w)v-]mkKunB!&*]kb97R|i<ARk<c:Z(6Vy}Juh'!wziMRoS:F|vkLuauJv5vtvQRh1d='T+Y#VyO~DR|jcF#T'7R|g97R|kJv3'!ay<Rj,Jvh&!:ReXcsa6*a+#a#_aIRf9aLRf?c,Z&Rf5Rf7c.Z&Rf;Rf>cQ#%T'p-Rf8Rf=ct#%'(*!,p,Rf4p+Rf6Rf:Rf<d~'Ua%U*^UYa(!a,-!#a4YaTalaEX0a8a<Weo3Dt/3Dsx=Br93Wen~Dr;~<5p<JwNZt2@3p=Pw:5p;Ou!5r3c7&!#:p>3Ds}KvGB)_6Vyk2sM=<r7x'eovA(!hFu1ARf}cV#X&@r5j6rvwQa^Rf3c=Za'wkghJv__g;unRggA53B9=b^}%j6uduo5Jq;!(hIv%2Re`Ou4ARe_e%a#^^^Xa&!a*a2!&a6YaP!*ad!#a:aE/5Rn?[y@>6Vyp;:pE~DrY~<5pBJwNZt8@3pCh=rt3rWPw:5pAJup_[xoNuPpF9c!#'45pD5ARn)d8#X'X*3@rU72s]h>v<<sSjJpqvewOJq/(!hNw'5ReBk0s2u3w/w'5ReE5@Jq.!a+JQ!&WeU23d(#Y&RjG5]jBk!u7w&u0udARjEe#+^^^Ub#!a2/a`Z(agT1!a-a;|@TaG!aS[yV=Re~fow'RguNuPRe?bz#'>RoUWeL>:Cbb|?JwPZtVg6ruRmzJvD'!6Vz(g/vmRh~Jvy_[y(g9voRgyx*cy(#2>Ri2B9b]~9kIw9u7rluJu3Rg]dI#a%UY'@=p%CAx.gQZ&RhwwygtRm{x5g_Z'+ABqR9Woa=Bp&dV#^*Xa'!&@o{g4v]Rk;Jv{!%Rk[wkkiA5RkiwwfUB=x,fUuqC&*!>RfTg8v0RfV~ARfSd;rJsAuAv9wR'ae+/aO!a@aza/a#[yQ@Wg!2Wemg3sEr0JvB_g>uvReWg2v+Re=KupB_+[y!2AbY~-~Hr2AJwD!(h<~El>h<~El?Kun@+_:9b`}Kg-v/Ri3g;vtwyk_9]k_d=&T#*U.6qh@Ab`|K9:H|CJv[!&3Dtex'fDwC%!Rf[9WlMd[(^X,!a%Z06Vz!@WgBg=v~Rgvg,QRe@awd,#Y+jTv|Q~EfWj]uNr|~FRfXdy#Y&^Ua%!aO.!(a)Ua;=!a@aKap!a-,a!Ta]a[rSa]p?[y82sK=Bq~;:p:~<5p8Pw:5p7d'#Y'Wf(;RnRi[u4w&RgJJvG'!6Vyh=<r#ijuuv/sIKuYD'ZtG@3p9~Gr&d2#`(g<vtRgFj`u5w&rqpxRf2CJuY!+:wfnTOu!5Rg}jNs1ucv&RfwJvA!&3@q|BDcC#T,k/unq8w8Q5RkTklwQuzunq8w8Q5Rk9dga#!a'!a=#a0!:+Tb*b@aO.a4!aba8aFJv^}?!VyR~Dr<g;u%Rn.~<5p[x'e`wNZtR@3p]Pw:5pZhNvjBp.woe_g5u-r4JwF!%DtO3:ooc7&!#:p^3DtpLuGw(!+%)Dtk6Vz#2sd=<r8d'#Y([y#<x3gJt`w@!)%}MRiowzikRij=]ilxAf3,U(#B2Rf#g0v-Rm[ck{`U#]giKv3>)!&6Ri154s,KuGB_%@r68r:dJ|t`#X(9<E|u2@H|rx3gJu?w'!+'1Nu7Reg4=H~+9<wxgY95Rm]xLggZ-`(X}U2:Ri4h<uOawRmsJv__5@bb{jbV~3dka#a'a]!,#a+U=a>b6a3b%!/aKa/)!arwve^VyJ;:pR~DpTg3uJpS~<5pOPw;5qmPw:5pNOu!5pQJvG'!6Vyx=<qoJvA!{~Jup!%@qk7Rn/KvyD!}''[xz;>wkh'?Rh,x8gyt`w5D!&),(SgyccRgztJ@3pPB5p#d'(Y#<]mmifubw&RgoJvE&!82s^JvF&!8Rf,ADb]~;x=h'rNu]vK!,%'*0RnORh)4Rh*AqQg-vaRnNg;wHwkh'ba~4cE#Ta*x3gctyw@'!+%RnFRnD<4Rn@hFvK5RnCxWg[#`&a0Ua()`1Rm75Rg[c]%X#qi8Rg^NvdRj>BwzgZauwji7Rm6A4wgg]d1#&(*,.0a#Rm;Rm<Rm=Rm>Rm?Rm@RmARmBe%#^^^Xaea?aC/b+(,!a+a#!a/!>a&Ta<aKbD!2wphBRnk[yPw}hE|.=Br-3Dtm>6Vy~g6urRf.x,hPrNav!%'RnqRo%Ro#Nu;q[Pw;5r+JwNZtM@3r)d'#Y'Weh;xChL#`&RnmRnoKu}>%(!Rne~Bs-;2wjcussJv+'!aYSO}6@B<5?ba~8LrNvj!.%*ROwungw~ng~:9;Ri^>wtnig;wHRnixDh@|(UZ.x1h@|)!#:2<H|*xHn]#-UX'3Ro)z=iT}6ARns=Bwsn_wpnaRncw]aR(#UXa&Ua*a/=]iPd'#Y&Ro'WnXf{QRm2hNvj]nZd`'T~&1`{|`#9b]{}c:'!#Wl{>@=be}]?cl{{U#:5Abb}Jds#^YaF!a*b4a#a3aPa>&Tb!bH!*a_!Eau?/a&RjY<]gj>6Vz*;:pe~DrZg,QRj1JwNZtX@wihspcJvZ&!VyX9WmOJu|!|N2WmHJvh&!]ht~Bpbcn&T(!#RmQ<s7Nu;padH#X'`+WmJ@>RmKCARhnKup=!)&Wf+:RhqNuPpf9c!#'45pd5AwghpARn(Ls@w!%,)!RmP@Wfe<E|IJva!&WmNg8vsRmLd`*.`#Y'Xa!axRn*]hrA8Rhug5s@rXg8u!RmMd8#X'X*3@rV72smdI*#UY&RmICARho~GsgxVgd)Ta'U-Y&Xa!T#RnEWnA@Wffg1uDRi0hFvK5RnBxGnG&#`%owp)@wsf+bX}Ze-*1!a*^^^Ua|!#a.aq&Ya2!a>.a6!a:aO`aJDtL[y`@Wg#>6Vz12@wzoYRoZNuPRi!NuPRhzg=ucRi,@=b`{Yg=ucRi-ACJvB!&Sh[ebSh]ebi`wUuFRm4Jw2_[y0JvB!.<Ju(!&SoG}6Shd}6<Ju(!&SoH}6She}6Kur@._g5vHRieJvx!{L2G{Kx6gd'T#?Rh82Wi5cZ#X(g1w)Rm5dW-Y(Ta#!a)!#aYa=wnfE=su2>>bU{0j9udv:<svj8uQv-7RgHdE%#^'sq9sp=>Bb_{TJv`!&g/r|snj6v(us5d,#Y(56H}[978H}]Jw5!&g1rushJvB!+j;v{u5?zDhd}6}bj;v{u5?zDhe}6}ce*#`(^^^a[aea!=!a6a*aoXb1a.!aAbL!b>,b'aL!aV@Wf|2Wlg3[y/JwNZt^@3piPw:5pgJunZou3@rsJva&!Vy_g<v~Rm#JvG'!6Vz0=<r{Ju{%!:pj@WfsiXuJu3Rm:JvZ&!WfA~Bph@c4Z&Dtwax5rubx(#:awRk1@d,#Y&RfjRfid1#,Y(@Wfp2Wlrg5s@ryKu[@!,'=]ig9wlk?Rk>g5u-rqJvy'!@9RkQcH(T#=>Ri~@<wkj(Wj(KuZB*!&<7rw@9RkRcH(T#=>Ri}@<wkj)Wj)dg(Ta2Xa9X#`-!a*CARhg@@=I}d9x;c~#X%so=<sj>2@@=aybb}XjWv0Q~EfEj3vLv;<d,#Y(56H}`978H}_dgaPaFa'a/!#a3Y0a_a;a|!1(a7-[yE3[xt;:pJNvZrrg3uJrvJwNZt=@3pIh=rt3rxPw:5pGOu!5rpJvG'!6Vys=<rz@c4Z&Dt(ax5rtJvZ!&~BpH@wsfNg-vaRlNci*U#=<wei<F}a5@Jq.!a*JQ!%@qZ23d(#Y&RjH5]jCk!u7w&u0udARjFd/prq=tyvpaEa(a:.!a1aZ(@@=I}:9wpd%=<sX55w_h}@@=I{t=ay<aU@@=I}T=ay<2@@=I})?C9:9au@9Cb]}DP~=x-fAZ(2Wl1=ay<aU@@=I}>5@d##Y+jTv|vV~EfFj]uNpn~FRfGdgaK!Z2&!a8a-Tb({E!acTbM*!a(DtY[yYd'%Y#sl[y*hHvh>Re5x2c{Z}.j4uCvcawRiMd+#X+_x&d!},<5RkX;2Hzw@x,gavfB-!{CcF&T#Roe;RodwWbBg5urRgaKvHC*_6Vz+<4opieuew&Rmq@d]&Y)X,T#X0Rh}<BqP=4qS9:ReMg/ujReNJw0!/<Jui%!bd{kawwnemRelAxUa?a3#*.&UX(Ya+a/RhvRnQ<o}9Wmtd-#Y&RgSRmw9;Rmxay=Rmyg-vaRmuxEhSrNu,v-voC!%(aR.a(a7+1Ro1>Ro5CE{A9b]{@;5x#eO{:g;urRi+KrNA!%(Ro3>Ro79;Ri_Ku@>{;&!x%gX|{KunA_+g5QRj/g3u5Rj#g>uERj%wio/xRhS&!,!#^1U}wba{8>>@=be}qC@:D5ba{7Ku+A&!}x?ba}t>>@=be}se(aA^^^Uat!b0#{pa+awUazbGa#aLb9bgaWac'a5TbS=Br!d1#`%scp_Jvl!#rT>Re0JvX&!VyN=H{Fcm#U&:pY=ReaJv2&!]h0=]nUJvG'!6Vy|=<r%JrM_=]h2@Wlud'#)U'Wf'b]{i=]h/Jvh!&~BpWg=v]RnMx+ny#'Nu;pVwjnu=]nwxJnx,T#`&Reqwjnt=]nvieu9vrRjLLuYwP(#+!th@wih5pX~Gr'g5v/Rh4KunA'!-CARnP@wwiN:Rm_9x'cvw>!|l=<saKvAA!0&3@q}>w^e1bp#&Re2Re3BDx7gH#T|f5H|eKuZ>!%(:qNAH{]Jv6!+3B2B9=b^{X<5<B92:E{ZLvhwA(a;a%!igQuyRmad+#Y}m@3Rh5d8#X'X*:AqUAHzmaxwbh<aXRnVcF}RT#Nw&cj#U(BWnug/vsRntdka)(a3+.Zb7aYYan1!bVa@Xa}[y^@b[{G=H{+hFu73Rj&Pv#5ReQcK%T#sig1v{Rj'Ku+D#'!t]~Grm~?rkKuMB!01d5#`'Vy.ta3Dtu~Hroc8#'{^45s85AwZbP&!#Rn!wghxWn#KvEA!)&2RlA2RlBx:h|#(T,=]j09Wobz>x]z/@awRoTd+#Y(az]hFhCrm4d,#Y+jTv|Q~EfMj]uNr|~FRfOdCa!Xa9_X#@<plJvf!%b`{(9;Rgwc;.!#2x7cw#T|UDb]|T5Ju={(!=@E{&Jv)&!Ab`{'awJvf!~*>>@=be{#KuY>!+&4Ezyi[ugv&RjIdea+T)#UXa&T-T&a!Rh9auRmW=]kLg5vuRn+g3u4Rn-Ow6ARn,hHus5xNk?#UX(U~)/g8v0RkD~AwkkF?Ri.OuNBwkkA?Ri/d|a2`a*^UYa.!aBTZaTa'Xa;!(!2!-a#b2[yC>6Vyq3[xr2Wi?g1rusVh%s?DtF~<5rbJs;%!DtBfswKtCj[uvuSsEu3RgVx3o:u+wN'*Zt;@3rd~Grh~?rfg8w)Lq)qE&-a%!>bI|`jWv0vV~EfCjTv|vV~Ef@j]uNpn~FRfBcK#T']gWNu7x,k7q4ai(0!hHv8<RhmkMu9vrsBuev/RhlCJvB!,g<v{wchh~@:Rhji[vrv{wchi~@:RhkdS&a5UY#Ta!RgPwwiI5BwciI~@:Rh`x'iJvj'!5]iJPu8Bwch]~@:Rhach)U#h3rp]gLh@t|Ax,hTq3ah!-(~@:Ro0Ou!5RhXj^v(pyw8unRhVd|)`,^UYas!a?/a2Z'a^Ta{Tb7Ta(a#!a,Wf&9sZ3DtAadamov=Bqt3[xig8vsRm~>waiL2b`{QJv*_Ouv2qgj<v]v2BqfdR'X*X#Y-@3qr~Gqv~?p6hHv-]glPup5Lq+q?_%*b_{qF{n9b^{rOu4ARhpKvCD!+&~Bqp:5Dbb}nwoiKl&unuTuBv]v+ueunaXRf0=Jvh!0nKufu8v1w&w7q%w&uHrz:Rgnj5w,uxDJq/(!hNw'5ReCk0s2u3w/w'5ReFd>Za&!*UaA=<wkgsRnSJv^!%Refifw3vyRgOKu_B'!,<]gkiiu:w&Rh<=C@a^<B57@2F{[<B5@aW:=3away9A5aW=<B=C@a^<B57@2F{Ie-#`(^^^bCara.b8aza6!/bZ,!adTbnTbOb+aFaS!aAT9@Wf~2Wli3Dtl2@d,#Y&RfnRfmJwJZtN~GqyJva&!VyMg<v~Rm%iXuJu3Rm9Jv[_=]ih9wlkDRkCd1#`(@Wg>2Wls3cH#T(@<Rj*=>Ri|b~'#23s9h<~El.d'#Y&Dtxi^rzvdRl#d*#U%(o|B2s`hJwSaxRmDKv4B&!1:Rmdd5#`'Vx}to~Hq{x'f1v3(!BA5ba|bJv_&!Wfug1v]ReIdO+U/Y#&G}-8wze=Rh{g1v]ReHg/uQRf/by#)ibQwERl/cH#T(@<Rj+=>Ri{cNu+vlax-!(#a0qa9<Rii2;;bU{H;x<i=&X#Rk`<4wwi=C9H~8xAI(Y#<azRi@45wXI<B9;5bb~7dL(X#Xa(+!aL6Vy{g5QqOau:5au2@ay547EzbxOcU(UX-T#Ta#:Cbb|A?wjh/b_|SOw6ARgtihr}u7Rhy<d1#T)X1@@=I|~=ay<2@@=aybb}Sj3vLv;<d,#Y(56H}A978H}@dGpvs@uAu`vcw9*!aFa+ai%(b!aXa8.a?a[ozWey=sU2@G}Nch&U#Rf_WexKu+D#'!t:~Gr`~?r^j]uNr|~FRg*j^psurwJt|RmcKv)@&!)7Rkv~Br[@wxfO:Rl3co#U'6Rezj_q#vIuavjRltwzeyh@vr5JqD0!>aY?C9:9au@9Cb]}9cl#U*5;5<H||jbuus1ucv&Rfvg1v~d/pppzqFr^a--a~!aMat1(hFv;Wiz@@=Izoj5uuv-7Rix~Cw`fk2WlVcZ#X,k)u3vWs@u2]ktg;wEx'fBq(_2Wg/jTv|vV~EfoJv]!15x'hzqG!(P~EfU~CRl_j6v(us5x4i-#T(2WmZ?C2F|d>Kq<aj1!*jTqIsBv=Wl`~Cw`fi2WlWj`v0u*~>RlR=c>Z,k#u3vWs@u2]kr<c1Z+jTqIsBv=Wla~Cw`fm2WlXdmb3!a{(arZa`bkTa%TbQTa-a9+c'!aM!/[yL=Bqug.w'RifhFvyDRj.g>vgwyk^9]k^Jv3_@WfbAARkhJw2_[x|JvB_wkoIRoKwkoJRoLd'(Y#<]gm=<9<H|yd'%_X#skDtb3awwqkgNulRkgdB#^',9:p'hJwSaxRmEBwVb8@4=H|qLu+w50&!)@3qs~?pU>Awwn;;Rn=c:Z'ARn<=<qwKvC@!/&~BqqJv6!&]eVb^z^xRge'/a%+^`#Sge}6<4Rn3=]n0Pw2>Rn8Jw0!&>Rn:>Rn6cY#a7+!a&=<wkaNw~h3z_c5Z{=wjh#=]nLKv^D!&)Vyz=bW|swYb<WetcG#T(2wxa@qVx@gD#Y&b^|V5JwG&!5bb|pg/w&RgD@x=kHs=uAvn!a%%/'+RmSRh694Ro`g-vaRmRhHv-]mlxCcS#`&ba~.5cD#Ta)P~=d,#Y(56H{>978H{Dd_#{2^Y%_+qbbb{6g3sERhsbU{?dfa.,`a(Xa<!aiX#(55RiG54RiHcI#T'WiU3RiVNvdwtfcRlKNvdd,#Y&RlHRlExQgf.1*^T'X#Sgf}6Wn4=]hfPrk>Rn7Jw0!&>Rn5>Rn9Lunw?&a2!,5<oq@@wqfdRlJj5Q~=d,#Y(~ARfcOuN]fdDKw;ay(}i!547E}j?cI#T(@5bV}iCbV}hdv(^^Tb?a40,b##Tbo!a*bR!a<b|a/!aKai!aU[yK=]o^g:v>ReGJwPZtK<7Rh+h<~El,Pv#5ReR@awwxjCg,ulRjDJv6&!]j!z?aQeeg>w=Sh<eeJw;!&axEzOg,Qosc!#*:wkeJ]eJ>x'h-u(!%Ro.w~h.zPdNZ(X,Ya![x{;9ReY;wkgxRiF:x?ap#Y&RmUg<s2Rkod]+UY0TZ'!a&A9sw<=bczLNvuw{gqzNhJwSaxRmCKuLay!#&s_Rf-55b^{uJvZa!!c%#(55Ri654wmiu5RiuawLu,vp!+}^%b_}Y9;wkgxba}o>A9:=b^}zKuh=a''!3awRk3c*'!#aHRk6c+Z&Rk5Rk4Jv)&!awRjSawd9*`#0?C2@EzMj8u<uJ5RmbjQrquJu3x,k>uq@_+=ayb^|W~ARkEOuN]k@7dhzV^X/X&a-#zRzSb`zXcJzTT#2WkVKvDBzW!%FzY9;5bbzWjQrquJu3Jw3%!b`zU=ayb^zQd:#X(T-a!6Vyywxh}=b]{Jg=u1RiAdGp~qHtzv!w(wA+a+a;<!aJaYai'anasb(=azRmV:Cbb{MLq2vb!%')RjuRjrRjtRjqx3jnqCw3!%')Rk(Rk+Rk&Rk)Lq2vb!%')Rj{RjxRjzRjwLq2vb!%')RjsRjpRjfRjex3jcqCw3!%')Rk'Rk*RjkRjl9<CbbzfOu4ARhxLq2vb!%')RjyRjvRjhRjgx=joq*uKvb!%')+-Rk.Rk%Rj~Rk-Rk#Rj}x=jdq*uKvb!%')+-Rk,Rk!Rj|RjmRjjRjidAq&qKs@uAv8Aa.'*-a@a&0!aM@a5[y73Dsy3Ds|3Dt):wxgI2sHJwJZt.~Gqxwsf0ikrzt}Rl0Jvy_[xj~HqzKv_A|D!&WfP8axRoVcf,U#k(v]v+ueunaXRf1Ju}'!g8u#Ri=jQw!sCunLprq>!,')~<5qeGzq9F{W=c##%s5au:5aU3CBE|;d4#X(D!a&6Vygx(b;#(=]ed?C2F{N<capoq2r[a&!aPa9,'Pw;5s:@@=I|,55w_h|@@=IzcP~=x'fCqB_2Wl2>aU@@=I|1OuNBc1Z+jTqIsBv=Wlc~Cw`fl2WlZ~AcTa%!Z+jTqIsBv=Wlb~Cw`fh2WlYk+uNqJsBv=WlSg,u3dca3#UXaMYa)TaB-=cM|7T#<bI}l5@B932:aV2G{BOuNBJq:|M!5Ezt=<B=C@a^<B57@2F{v>cB{/T#=ay<bI{3Jv6!a.6BKq0ah&+!5E}HP~Ef{978BaU@@=Iza<7d#.Y#978BaU@@=IzH~AJq0!(@@=IzG978BaU@@=IzFe,aU*Y&^^^bvJb,b:bFad!a,c2Ta>aL.bo6!a#CbTa'T#Re{2Wlh2@G{yg6t~Ro_NvdRfticuRQRllJv3&!x&c|zs@Jw3!%RflwpfkRlpKuL;%(!Re<@G|C2GzdhIvuBwgjAg-u0RjAKQB%!(GzZ@G|5NuuRl7d='T+Y#Vy[g<v~Rm!==G|>JvA!)@wma=]m1ifuaw&RmnLs@vT'!|/+[y,g:v>ReTJw1!#qX=x!eC{bLu+wT&)ZtZauq_~Graci&U#F|89:r_Lupvq!.)&2RlG8RfaC=x!eF{_h?rpWlmd&'!#X|&]k::xJey#`'T|+<E|&2@H|%dE#(^,g;u.RiEg6vjRiC9xCkA{O|zY#g=ucRmXKs0@!&*@G|m@awRknJuh!,3d(}gY}eJvj!%Rm):Jw3!%Rm+Rm-Ls0w(&!a(a#@b[|6cZ#X'7RkxWgAOu4ARn'dH'U#Y*Vz-Wm'CARm}d]*#a%^a*T'aK!a<9bV{PC=p*Jw4!&SgxcbB5r]idw(wBRmF7xFkt#&`(Rm/Rm8E|!JuY_9:Rl5=wrgr2:bbxd@xXfB(a*#T+!.X0X1Ta/a'T&RlDRfL>RlyARl9b[z[>RfZ:RlL:RfRwlg/ARl;9;RlxKv,A/!%7s69<74=BA5ba{-8Bde#`a<XaKYa1,a'P~=wxfB2bZ}}?C972@@=I}r8@55B9;5bb}G978B2@@=aybb}3j3vLv;<Jw3&!>Rfk=ayb^}4~Ad1#`*@@=aybb{w2@>==<bbz]dx+UY#^UaF!a9!bB'Ya1.!ajXa#%olRhD[y=3Dt#Ov5BrHKuMB%!(Rf^Wep~HrJwkiQjKr|~FRg)Ku+D#'!t5~GrF~?rDdV)UY,Z/_7RkuG{<~BrBg,rlsO:235B@bX}|d?a1!#`(6Vyn5@d##Y+jTv|vV~EfIj]uNpn~FRfH7Lq2vb1!a9-978BaU@@=Iz9978BbU}#~AJq0!(@@=Iz8978BaU@@=Iz7~AJQ|}!978BbU}!JvkaK!AdUa21-U#`a+(g/vsRn~Ou!5RPj:rmu9WhOjXuvvNr}:RhAj^v(pyw8unRn[kPr}p|u7vwv]RiSBd;pppzq@qHQa?(b.!a.a`@.|xa(hFv;Wiyj5uuv-7Riw~Cw`fg2WlU978BbU|wOuNBJqG!(P~EfD~CRlQcZ#X,k)u3vWs@u2]ksg;wEx'f@q1_2Wg.j]uNpn~FRfqJv]!15x'h{qG!(@@=IzK~CRl^j6v(us5x4i,#T(2WmY?C2F{1>Kq<aj1!*jTqIsBv=Wld~Cw`fj2Wl[j`v0u*~>RlT=c>Z,k#u3vWs@u2]kq<c1Z+jTqIsBv=Wle~Cw`fn2Wl]dn1#c(a(b^a2!b/bAT(bj!aDa7bu,a_a{c0!2T0g:v>ReD2@G{42@G{5~DpM~<5rc=Bx6i>{RT#RnI@zCx]y]z:2Jv[!zr5Awyk]9]k]dD(Y+X#6Vz.g=wKtgwhaCwgmTWj2Lu,w%_+/[y-B;b^xeg3u3Rj-2@bX{*KrJ<!+'@Wg(g?QRlC@Jv`!%b[zIwsfII}8JQ_@w|kW|=Jv(%!AqcOuNBJvEzh!bYzjLs@wP#(0!oy@>RkdJwMZtc3Dtd@BcG#T'9bWxg2@2Fznd*#Y+;2x'c}w<zizixNgwa#Z'U+!/!a'!a+w~g~z6wcn{Rn}wcnzRn|5Rh%=]nJg5vuRmvNvdRlvcprJu}w*az*a#!%.a.'Bot9qT]kj@Wg'ay2Gzv@Jv`!%b[zEwsfHI}1;ck#Ux`<Cbbx_Lu+w!a&0*!wko*wwo,So,}6Juqxf!E}PigQuyRm`d3(`#8>Rn%:A5B;bZ~%KvhCa!a2!x>k7#Uxb@b{#xaRk7Jw0!)>wwhlShl}6>wwhmShm}6CJvB!.x'hhvj{!!5Bwkhhbaz}x'hivjz~!5Bwkhibaz|xEhTrNu,v-vpD!a%&/)a3a.,%Ro2t[CE{)@3re9b]{%wjo09:rgc:Z&Ro6=<riifuaw&RmoKrNA!%(Ro4>Ro89;Ri`dSaL'UYzxZb)7Rka3xRhT&!,!#^1U}vbaz{>>@=be}yC@:D5bazzKu+A&!}{?ba}y>>@=be}wxBh[t`u~vJvr!%a!a()a,a0a4RoC=]o;Ju(!%RoGRhdwjh`=]oAg>w#Ro?g5vuRo=NvdRl|Ku]C.!&;RoEJvB!%RoORoMBx'h[v+_?w~h`}~5?w~hd~!xKh]oiptu-utv.vp!#%&a30a@a'a+(a/aOp(o~p!RoDJu(!%RoHRhewjha=]oBNvdRl}g>w#Ro@g5vuRo>c[#X']o<CauRoRAd-#Y':RkpauRoQKu]C.!&;RoFJvB!%RoNRoPBx'h]v+_?w~ha}t5?w~he}ue!/UbhYacXaW^Tc&a;b:a-c/#b&aja1(!cL+!bKbt!bmcRc9aIc?8[yW3Dtt94Rg`Jv}!&SiRMzBhEebShEMNuPRe>x7gL#TzuwjirRipc<Z&>on;>z=h-MSh.Mwqczx'a7vj&!>Re4@=ResJt__NuPRi*NuPRi)j]uNr|~FRfzKrJ>_+@Wfy@Wf]2WocKrJ<!+'@Wg%g/QRl@@Jv`!&awRl<wsfFIzgLu(w*!.*&ShBMwvhIRhI9;RhNx1hK'!#Sn]Mx1hK~0!#:2<H~7cNu+w7D*'1ZtW>Rn1~?rOc:Z&Rn2=<rQ<7wjh&=BSnLMc]#X(6Vz)w[b=a!U#9wzgMc3#&(RgMRitRis<x,gKt`ax!&+SioM=BSilMc3#&(RgKRinRimKurB,!&SiQMzBhDebShDM6BJQ!(P~Efx978B2@@=I}WLrJw!!,a*&@G}O@9wkibRid@@x'fKwC!&SlDMSfLMjUv~Q~EfKKv3@a+!(hFv-]mpx/hYZ(C5RiWz<o/MwkhY?So/M@x,gbvfB*&!SgEM:SoeeehFu3:Rgbda(,^TZa)X/7Sg[eb:2RgI~BrMC@wgkc:wwkcRerx3h(uUvK!&*,SnOM4Sh*MArRg;wHRh(x=h;rJvPwI!a4',a'0@Wg&=BSh/Mg>w=Rh=g3w*wwgGRgGcW(X#;Sg}M2Gzk@Jv`!&awRl=wsfGIz`dKZ*T'Y-:RhR7RhQg5u-p`j6v(us5d,#Y+~Awkia?RicOuNBwkibba}Ld6p~tyu_vbAa'a+!a/'a3aEa8a!>Sh,ebJv{!&Sh@ebSaReb9;SgwebNuPRi(NvdRl)NuPRi'hHu^<Rm^Jvv_@Wl(g;u1Si/ebKu'B&!*Sh?eb@Wl'z@aPeb95Si.ebcpputyvjB)!,&a+0a%ShAMWeK@G}C@WfJ9;RhMwvhH9w{ia}ix,hJvRA1(!zAn[MRhHx1hJ~*!#hFv(BSn[MBJQ!(@@=I~'978B2@@=I}2db.Ua<'X}+T#a0XaG2G}E;wkg|wuh!Rh!x,hZu,@)!&So0MVy)C5RiXACJvB!&5RiY5RiZg8w)cG}*T#2@bU}=KsA>(!a.3wkhZba~(x,h^u(A!&(SoCMRhb5Bz=h[eb?w~hb~6x,h_u(A!&(SoDMRhc5Bz=h]eb?w~hc~6e)aA1T#T,^^^c-bMb&blcPaP(a/!0!bA=b5c@a(!bfbrc#2afwmhARnjwchORnp2Wlf3DtsNvdRl-2@wpa<]m0bx(#:awRk2@Jw3!%RfhwpfgRlnKQB%!(G{V@G|'NuuRl6d='T+Y#VyUg<v~Rl~==G|<Jv+'!aYShC}6@B<5?ba~8@Jw3'!g2QRljhLrpWlOd+#Y'g.w'rIg>w*wgj@g-u0Rj@Lu+wT&)ZtUauq]~GrGci&U#F|39:rELrNvj!.%*RhCwunfw~nf~:9;Ri]>wtnhg;wHRnhx3hDs@v~!/+'@Wfr@9RkSNu&Rlo=@<5GzoKs0@_+@Wl+@awRkmJuh!-3d(}pY#qWJvj!%Rm(:Jw3!%Rm,Rm*de&!1U-U#`)Re;@G|.@9Ri82@wjfvRlq=@<5GzpLvOvr!).&2RlF8Rf`C=x!eE{.Jw3_g2QRlkhLrpWlPde(!#U{s,UXa*Ta'[y'g:v>ReS;x0PZ&RnlRnn~HrKJw1}f!=x!eB|2w]aP(#Xa&a*Ta.Ua2a7=]iOd'#Y&Ro&WnWg;u.RiDg6vjRiBNvdRlzhNvj]nYJuW_2Wm3x)kFze{9d])!a.!,Y01!#&aC!a3RndC=ox~BrC@2b^{pg,rlse7x'ksuq!%Rm.E{xidw(wBRmGx9o+)X#wwo-So-}69:Rl4@xSf@a#XZ'X)X,Ta(/ARl8b[xc>RfY:RlI:RfQwlg.ARl:9;Rlwdn'#^XafaQa1X1TaHTa)@b[{zcZ#X'7RkwWg@Ou4ARn&x)kG#{,g7u/RkGdH'U#Y*Vz'Wm&CARm|bx#(A]gUbUzJj9Q~=d,#Y(56H}l978H{U7d,0#U*2>ABb_xZ978BbU{e~AJQ{g!978BbU{hxMh?ad{oUYZ.x1h?{l!#:2<H{mx3n[t{vl!,&a%3Ro(z=iS}6ARnr=Bwsn^wvn`Rnbd`*T}B0!#^X'BG{c9b]{a>>@=be}F?JvS!&BG{d7BG}(Bde#`a1X,Ya@!a'P~=wxf@2bZ}I56B2@@=aybb}08@55B9;5bb}<j3vLv;<Jw3&!>Rfg=ayb^}&OuNBKuLA!)a!P~=x#fD{f2@>==<bbzl?C972@@=Ix^d6rSu,v7w*C(0a)a6#B+a%!sQ[y?3Dt%3[xn~<5rLOu!5p@Ku+D#'!t7~GrP~?rNKvlaya7'!h+v-5qMg=t|cd,U#5AAaa5Abb{S@52B5@a[@52B5Gx[iXueu;d<#`a(!/549C;ag>23ExY5@Dah89b^~689Jv)!~2b[~1Lv'w(%*!a#bX|aPrmawRe]keu7uhv-q6rxu,q`xTo]/a5aU!bNaDXbi!b-!ao!b<bwA!#5@B932:aV2G|:d-)Y#hJrL>RhG<7@C5<H|_=Cau:5aj5@B932:bJ|ng>vIbs)#?C2F|9jPv0w.vISh-MKvUaz(.!9ABbb|[5;5<H|Eg>unwfh;9:4E|YjQsBt|vjx'hYq3!(?C2F|J:2<BaY?C2F|GOu!5x,g|p{ah!-(?C2F|c9:4E|OjXuvvNr}:Rh&i[w*t|cd+U#jJvsu)vsSn~Mkfrmu9p}u7vwv]So!McW#Xa!ax5@A5aY:5;5<H|>kJv~vYrquJu3x4ib#T)2@SmZM?C2F|Bj:rmu9@xPhI(a*a#U#`a3-5Abb|L~@:RhK9:4E|0@52B5G|#C::aY?C2F|-:2<BaY?C2F|.5Jvk!a)javYrquJu3x4ia#T)2@SmYM?C2F|HAxPhH(!a#U#`a*-5Abb|4~@:RhJ9:4E|R@52B5G|F:2<BaY?C2F|Sc^#Xa2j=Qq5CJvB!-g<v{z;hhM?C2F|Zi[vrv{z;hiM?C2F|XKsA>!a)-g<v{z;h[eb?C2F|]i[vrv{z;h]eb?C2F|^iZu.vix,hZq3ah!.(?C2F|QOu!5ShXM:2<BaY?C2F|P", 13494, 2713, 49, 25, 61);

// node_modules/entities/dist/internal/bin-trie-flags.js
var BinTrieFlags;
(function(BinTrieFlags2) {
  BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
  BinTrieFlags2[BinTrieFlags2["FLAG13"] = 8192] = "FLAG13";
  BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 8064] = "BRANCH_LENGTH";
  BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
  BinTrieFlags2[BinTrieFlags2["VALUE_MASK"] = 8191] = "VALUE_MASK";
})(BinTrieFlags || (BinTrieFlags = {}));

// node_modules/entities/dist/decode.js
var CharCodes;
(function(CharCodes2) {
  CharCodes2[CharCodes2["AMP"] = 38] = "AMP";
  CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
  CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
  CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
  CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
  CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
  CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
  CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
})(CharCodes || (CharCodes = {}));
var TO_LOWER_BIT = 32;
var CONSUMED_SHIFT = 21;
var CODE_POINT_MASK = 2097151;
var CONSUMED_OVERFLOW = 2047;
var longNumericConsumed = 0;
function unpackConsumed(packed) {
  const consumed = packed >>> CONSUMED_SHIFT;
  return consumed === CONSUMED_OVERFLOW ? longNumericConsumed : consumed;
}
function isNumber(code2) {
  return code2 - CharCodes.ZERO >>> 0 <= 9;
}
function isHexadecimalCharacter(code2) {
  return (code2 | TO_LOWER_BIT) - CharCodes.LOWER_A >>> 0 <= 5;
}
function isAlpha(code2) {
  return (code2 | TO_LOWER_BIT) - CharCodes.LOWER_A >>> 0 <= 25;
}
function isEntityInAttributeInvalidEnd(code2) {
  return code2 === CharCodes.EQUALS || isAlpha(code2) || isNumber(code2);
}
var EntityDecoderState;
(function(EntityDecoderState2) {
  EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
  EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
  EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
  EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
  EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
})(EntityDecoderState || (EntityDecoderState = {}));
var DecodingMode;
(function(DecodingMode2) {
  DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
  DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
  DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
})(DecodingMode || (DecodingMode = {}));
function determineBranch(decodeTree, current, nodeIndex, char) {
  const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
  const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
  if (jumpOffset) {
    if (branchCount === 0) {
      return char === jumpOffset ? nodeIndex : -1;
    }
    const slot = char - jumpOffset;
    if (slot >>> 0 >= branchCount)
      return -1;
    const stored = decodeTree[nodeIndex + slot];
    return stored === 0 ? -1 : nodeIndex + branchCount + stored - 1 & 65535;
  }
  if (branchCount === 0)
    return -1;
  const packedKeySlots = branchCount + 1 >> 1;
  const branchEnd = nodeIndex + packedKeySlots + branchCount;
  for (let index = 0; index < branchCount; index++) {
    const packed = decodeTree[nodeIndex + (index >> 1)];
    const key = packed >> ((index & 1) << 3) & 255;
    if (key === char) {
      const pointerIndex = nodeIndex + packedKeySlots + index;
      return branchEnd + decodeTree[pointerIndex] & 65535;
    }
    if (key > char)
      return -1;
  }
  return -1;
}
function readTrieValue(decodeTree, nodeIndex, valueLength) {
  if (valueLength === 1) {
    return String.fromCharCode(decodeTree[nodeIndex] & BinTrieFlags.VALUE_MASK);
  }
  if (valueLength === 2) {
    return String.fromCharCode(decodeTree[nodeIndex + 1]);
  }
  return String.fromCharCode(decodeTree[nodeIndex + 1], decodeTree[nodeIndex + 2]);
}
function parseNumericEntity(input, numberStart, inputLength) {
  let offset = numberStart + 1;
  let cp = 0;
  let digitStart = offset;
  if (offset < inputLength && (input.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
    offset += 1;
    digitStart = offset;
    while (offset < inputLength) {
      const char = input.charCodeAt(offset);
      if (isNumber(char)) {
        cp = cp * 16 + (char - CharCodes.ZERO);
      } else if (isHexadecimalCharacter(char)) {
        cp = cp * 16 + ((char | TO_LOWER_BIT) - CharCodes.LOWER_A + 10);
      } else {
        break;
      }
      offset += 1;
    }
  } else {
    while (offset < inputLength) {
      const digit = input.charCodeAt(offset) - CharCodes.ZERO;
      if (digit >>> 0 > 9)
        break;
      cp = cp * 10 + digit;
      offset += 1;
    }
  }
  if (offset === digitStart)
    return 0;
  if (offset < inputLength && input.charCodeAt(offset) === CharCodes.SEMI) {
    offset += 1;
  }
  if (cp > 1114111)
    cp = 1114112;
  let consumed = offset - numberStart;
  if (consumed >= CONSUMED_OVERFLOW) {
    longNumericConsumed = consumed;
    consumed = CONSUMED_OVERFLOW;
  }
  return consumed << CONSUMED_SHIFT | cp;
}
function decodeWithTrie(input, isStrict, isAttribute) {
  const decodeTree = htmlDecodeTree;
  let offset = input.indexOf("&");
  if (offset < 0)
    return input;
  const inputLength = input.length;
  let chunkStart = 0;
  let result = "";
  const root = decodeTree[0];
  const rootJumpOffset = root & BinTrieFlags.JUMP_TABLE;
  const rootBranchCount = (root & BinTrieFlags.BRANCH_LENGTH) >> 7;
  do {
    const entityStart = offset + 1;
    const firstChar = input.charCodeAt(entityStart);
    let consumed;
    let value;
    if (firstChar === CharCodes.NUM) {
      const packed = parseNumericEntity(input, entityStart, inputLength);
      consumed = unpackConsumed(packed);
      if (isStrict && consumed > 0 && input.charCodeAt(entityStart + consumed - 1) !== CharCodes.SEMI) {
        consumed = 0;
      }
      value = consumed === 0 ? "" : codePointToString(packed & CODE_POINT_MASK);
    } else if (isAlpha(firstChar)) {
      consumed = 0;
      value = "";
      const rootSlotIndex = firstChar - rootJumpOffset;
      let nodeIndex;
      if (rootSlotIndex >>> 0 < rootBranchCount) {
        const stored = decodeTree[1 + rootSlotIndex];
        nodeIndex = stored === 0 ? -1 : rootBranchCount + stored & 65535;
      } else {
        nodeIndex = -1;
      }
      let bestNodeIndex = 0;
      let bestValueLength = 0;
      let current = nodeIndex < 0 ? 0 : decodeTree[nodeIndex];
      let index = entityStart + 1;
      trie: while (index < inputLength) {
        while (
          // Value-less, non-run node with a nonzero jump offset.
          (current & (BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13)) === 0 && (current & BinTrieFlags.JUMP_TABLE) !== 0
        ) {
          const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
          const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
          if (branchCount === 0) {
            if (input.charCodeAt(index) !== jumpOffset)
              break trie;
            nodeIndex += 1;
          } else {
            const slot = input.charCodeAt(index) - jumpOffset;
            if (slot >>> 0 >= branchCount)
              break trie;
            const stored = decodeTree[nodeIndex + 1 + slot];
            if (stored === 0)
              break trie;
            nodeIndex = nodeIndex + branchCount + stored & 65535;
          }
          current = decodeTree[nodeIndex];
          index += 1;
          if (index >= inputLength)
            break trie;
        }
        if ((current & (BinTrieFlags.VALUE_LENGTH | BinTrieFlags.FLAG13)) === BinTrieFlags.FLAG13) {
          const runLength = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
          if (input.charCodeAt(index) !== (current & BinTrieFlags.JUMP_TABLE)) {
            break;
          }
          index += 1;
          const remaining = runLength - 1;
          let wordIndex = nodeIndex + 1;
          let charIndexInPacked = 0;
          for (; charIndexInPacked + 1 < remaining; charIndexInPacked += 2) {
            const packed = decodeTree[wordIndex];
            if (input.charCodeAt(index) !== (packed & 255))
              break trie;
            index += 1;
            if (input.charCodeAt(index) !== (packed >> 8 & 255))
              break trie;
            index += 1;
            wordIndex += 1;
          }
          if (charIndexInPacked < remaining) {
            if (input.charCodeAt(index) !== (decodeTree[wordIndex] & 255))
              break;
            index += 1;
          }
          nodeIndex += 1 + (runLength >> 1);
          current = decodeTree[nodeIndex];
          continue;
        }
        const valueLength = current >>> 14;
        const char = input.charCodeAt(index);
        if (valueLength !== 0) {
          if (char === CharCodes.SEMI) {
            consumed = index - entityStart + 1;
            value = valueLength === 1 ? String.fromCharCode(current & BinTrieFlags.VALUE_MASK) : readTrieValue(decodeTree, nodeIndex, valueLength);
            break;
          }
          if (!isStrict && (current & BinTrieFlags.FLAG13) === 0) {
            consumed = index - entityStart;
            bestNodeIndex = nodeIndex;
            bestValueLength = valueLength;
          }
          if (valueLength === 1)
            break;
        }
        const next = determineBranch(decodeTree, current, nodeIndex + (valueLength || 1), char);
        if (next < 0)
          break;
        nodeIndex = next;
        current = decodeTree[nodeIndex];
        index += 1;
      }
      if (value === "") {
        const finalVL = current >>> 14;
        if (finalVL !== 0 && !isStrict && (current & BinTrieFlags.FLAG13) === 0) {
          consumed = index - entityStart;
          bestNodeIndex = nodeIndex;
          bestValueLength = finalVL;
        }
        if (consumed > 0) {
          value = readTrieValue(decodeTree, bestNodeIndex, bestValueLength);
        }
      }
    } else {
      consumed = 0;
      value = "";
    }
    if (consumed === 0 || isAttribute && firstChar !== CharCodes.NUM && input.charCodeAt(entityStart + consumed - 1) !== CharCodes.SEMI && entityStart + consumed < inputLength && isEntityInAttributeInvalidEnd(input.charCodeAt(entityStart + consumed))) {
      offset = entityStart;
    } else {
      if (chunkStart < offset) {
        result += input.slice(chunkStart, offset);
      }
      result += value;
      offset = chunkStart = entityStart + consumed;
    }
    if (input.charCodeAt(offset) !== CharCodes.AMP) {
      offset = input.indexOf("&", offset);
    }
  } while (offset >= 0);
  return result + input.slice(chunkStart);
}
function decodeHTMLStrict(htmlString) {
  return decodeWithTrie(htmlString, true, false);
}

// node_modules/entities/dist/index.js
var EntityLevel;
(function(EntityLevel2) {
  EntityLevel2[EntityLevel2["XML"] = 0] = "XML";
  EntityLevel2[EntityLevel2["HTML"] = 1] = "HTML";
})(EntityLevel || (EntityLevel = {}));
var EncodingMode;
(function(EncodingMode2) {
  EncodingMode2[EncodingMode2["UTF8"] = 0] = "UTF8";
  EncodingMode2[EncodingMode2["ASCII"] = 1] = "ASCII";
  EncodingMode2[EncodingMode2["Extensive"] = 2] = "Extensive";
  EncodingMode2[EncodingMode2["Attribute"] = 3] = "Attribute";
  EncodingMode2[EncodingMode2["Text"] = 4] = "Text";
})(EncodingMode || (EncodingMode = {}));

// node_modules/linkify-it/build/index.mjs
var REBuilder = class {
  constructor(opts = {}) {
    __publicField(this, "src_Any", Any.source);
    __publicField(this, "src_Cc", Cc.source);
    __publicField(this, "src_Z", Z.source);
    __publicField(this, "src_P", P.source);
    __publicField(this, "src_ZPCc", [
      this.src_Z,
      this.src_P,
      this.src_Cc
    ].join("|"));
    __publicField(this, "src_ZCc", [this.src_Z, this.src_Cc].join("|"));
    __publicField(this, "cache", {});
    __publicField(this, "opts", {
      maxLength: 1e4,
      urlAuth: false,
      schema_names: []
    });
    this.opts = {
      ...this.opts,
      ...opts
    };
  }
  set(opts = {}) {
    this.opts = {
      ...this.opts,
      ...opts
    };
    this.cache = {};
    return this;
  }
  escapeRE(str) {
    return str.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
  }
  nestedPairRE(open2, close, depth = 4) {
    const openRE = this.escapeRE(open2);
    const closeRE = this.escapeRE(close);
    const atom = `(?:(?!${this.src_ZCc}|${openRE}|${closeRE}).)`;
    let pair = `${openRE}${atom}{0,1000}${closeRE}`;
    for (let level = 2; level <= depth; level++) pair = `${openRE}(?:${atom}|${pair}){0,1000}${closeRE}`;
    return pair;
  }
  get_text_separators() {
    var _a, _b;
    return (_b = (_a = this.cache).text_separators) != null ? _b : _a.text_separators = /[><\uff5c]/;
  }
  get_pseudo_letter() {
    var _a, _b;
    return (_b = (_a = this.cache).src_pseudo_letter) != null ? _b : _a.src_pseudo_letter = new RegExp(`(?:(?!${this.get_text_separators().source}|${this.src_ZPCc})${this.src_Any})`);
  }
  get_ipv4_addr() {
    var _a, _b;
    return (_b = (_a = this.cache).src_ip4) != null ? _b : _a.src_ip4 = /* @__PURE__ */ new RegExp("(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])[.]){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])");
  }
  get_ipv6_addr() {
    var _a, _b;
    const h16 = "[0-9A-Fa-f]{1,4}";
    const ls32 = `(?:(?:${h16}:${h16})|${this.get_ipv4_addr().source})`;
    return (_b = (_a = this.cache).src_ip6_addr) != null ? _b : _a.src_ip6_addr = new RegExp(`(?:(?:${h16}:){6}${ls32}|::(?:${h16}:){5}${ls32}|(?:${h16})?::(?:${h16}:){4}${ls32}|(?:(?:${h16}:){0,1}${h16})?::(?:${h16}:){3}${ls32}|(?:(?:${h16}:){0,2}${h16})?::(?:${h16}:){2}${ls32}|(?:(?:${h16}:){0,3}${h16})?::${h16}:${ls32}|(?:(?:${h16}:){0,4}${h16})?::${ls32}|(?:(?:${h16}:){0,5}${h16})?::${h16}|(?:(?:${h16}:){0,6}${h16})?::)`);
  }
  get_ipv6_url_host() {
    var _a, _b;
    return (_b = (_a = this.cache).src_ip6_host) != null ? _b : _a.src_ip6_host = new RegExp(`\\[${this.get_ipv6_addr().source}\\]`);
  }
  get_ipv6_mail_host() {
    var _a, _b;
    return (_b = (_a = this.cache).src_ipv6_mail_host) != null ? _b : _a.src_ipv6_mail_host = new RegExp(`\\[IPv6:${this.get_ipv6_addr().source}\\]`);
  }
  get_auth() {
    var _a, _b;
    return (_b = (_a = this.cache).src_auth) != null ? _b : _a.src_auth = new RegExp(`(?:(?:(?!${this.src_ZCc}|[@/\\[\\]()]).){1,50}@)?`);
  }
  get_port() {
    var _a, _b;
    return (_b = (_a = this.cache).src_port) != null ? _b : _a.src_port = /* @__PURE__ */ new RegExp("(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?");
  }
  get_host_terminator() {
    var _a, _b;
    return (_b = (_a = this.cache).src_host_terminator) != null ? _b : _a.src_host_terminator = new RegExp(`(?=$|${this.get_text_separators().source}|${this.src_ZPCc})(?!${this.opts["---"] ? "-(?!--)|" : "-|"}_|:\\d|\\.-|\\.(?!$|${this.src_ZPCc}))`);
  }
  get_path_terminator() {
    var _a, _b;
    return (_b = (_a = this.cache).src_path_terminator) != null ? _b : _a.src_path_terminator = new RegExp(`${this.src_ZPCc}|${this.get_text_separators().source}`);
  }
  get_path() {
    var _a, _b;
    return (_b = (_a = this.cache).src_path) != null ? _b : _a.src_path = new RegExp(`(?:[/?#](?:${this.nestedPairRE("[", "]")}|${this.nestedPairRE("(", ")")}|${this.nestedPairRE("{", "}")}|\\"(?:(?!${this.src_ZCc}|["]).){1,100}\\"|\\'(?:(?!${this.src_ZCc}|[']).){1,100}\\'|\\'(?=${this.get_pseudo_letter().source}|[-])|\\.{2,20}[:]?[a-zA-Z0-9%/&]|\\.(?!${this.src_ZCc}|[.]|$)|` + (this.opts["---"] ? "\\-(?!--(?:[^-]|$))(?:-{0,19})|" : "\\-{1,20}|") + `,(?!${this.src_ZCc}|$)|;(?!${this.src_ZCc}|$)|\\!{1,20}(?!${this.src_ZCc}|[!]|$)|\\?(?!${this.src_ZCc}|[?]|$)|` + this.get_path_extra().source + `[\\\\/:%@#&=_~*]|(?!${this.get_path_terminator().source}).){1,${this.opts.maxLength}}|\\/)?`);
  }
  get_mail_name() {
    var _a, _b;
    return (_b = (_a = this.cache).src_mail_name) != null ? _b : _a.src_mail_name = /* @__PURE__ */ new RegExp("[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9](?:[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9]|[.](?=[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9])){0,63}");
  }
  get_xn() {
    var _a, _b;
    return (_b = (_a = this.cache).src_xn) != null ? _b : _a.src_xn = /* @__PURE__ */ new RegExp("xn--[a-z0-9\\-]{1,59}");
  }
  get_tld() {
    if (this.cache.tld) return this.cache.tld;
    const tlds_src = [...new Set(this.opts.tlds || [])].sort().reverse().join("|");
    this.cache.tld = new RegExp(`${tlds_src || "$#none#$"}|${this.get_xn().source}`);
    return this.cache.tld;
  }
  get_domain_root() {
    var _a, _b;
    return (_b = (_a = this.cache).src_domain_root) != null ? _b : _a.src_domain_root = new RegExp("(?:" + this.get_xn().source + `|${this.get_pseudo_letter().source}{1,63})`);
  }
  get_domain() {
    var _a, _b;
    return (_b = (_a = this.cache).src_domain) != null ? _b : _a.src_domain = new RegExp("(?:" + this.get_xn().source + `|(?:${this.get_pseudo_letter().source})|(?:${this.get_pseudo_letter().source}(?:-|${this.get_pseudo_letter().source}){0,61}${this.get_pseudo_letter().source}))`);
  }
  get_url_host_port() {
    var _a, _b;
    return (_b = (_a = this.cache).url_host_port) != null ? _b : _a.url_host_port = new RegExp("(?:" + this.get_ipv6_url_host().source + `|(?:(?:(?:${this.get_domain().source})\\.){0,10}${this.get_domain().source}))` + this.get_port().source + this.get_host_terminator().source);
  }
  get_fuzzy_url_host_port() {
    var _a, _b;
    return (_b = (_a = this.cache).fuzzy_url_host_port) != null ? _b : _a.fuzzy_url_host_port = new RegExp("(?:" + (this.opts.fuzzyIP ? this.get_ipv4_addr().source + "|" : "") + `(?:(?:(?:${this.get_domain().source})\\.){1,10}(?:${this.get_tld().source})))` + this.get_host_terminator().source);
  }
  get_mail_host() {
    var _a, _b;
    return (_b = (_a = this.cache).src_mail_host) != null ? _b : _a.src_mail_host = new RegExp("(?:" + this.get_ipv6_mail_host().source + `|(?:(?:(?:${this.get_domain().source})\\.){0,4}${this.get_domain().source}))` + this.get_host_terminator().source);
  }
  get_fuzzy_mail_host() {
    var _a, _b;
    return (_b = (_a = this.cache).src_fuzzy_mail_host) != null ? _b : _a.src_fuzzy_mail_host = new RegExp("(?:" + this.get_ipv6_mail_host().source + `|(?:(?:(?:${this.get_domain().source})[.]){1,4}${this.get_domain_root().source}))` + this.get_host_terminator().source);
  }
  get_path_extra() {
    var _a, _b;
    return (_b = (_a = this.cache).src_path_extra) != null ? _b : _a.src_path_extra = /* @__PURE__ */ new RegExp("");
  }
  get_fuzzy_mail_host_search() {
    var _a, _b;
    return (_b = (_a = this.cache).mail_fuzzy_host_search) != null ? _b : _a.mail_fuzzy_host_search = new RegExp(`@${this.get_fuzzy_mail_host().source}`, "ig");
  }
  get_fuzzy_link_search() {
    var _a, _b;
    return (_b = (_a = this.cache).link_fuzzy_search) != null ? _b : _a.link_fuzzy_search = new RegExp(`(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uFF5C]|${this.src_ZPCc}))(?:(?![$+<=>^\`|\uFF5C])${this.get_fuzzy_url_host_port().source}${this.get_path().source})`, "ig");
  }
  get_http_validator() {
    var _a, _b;
    return (_b = (_a = this.cache).http_validator) != null ? _b : _a.http_validator = new RegExp("\\/\\/" + (this.opts.urlAuth ? this.get_auth().source : "") + this.get_url_host_port().source + this.get_path().source, "iy");
  }
  get_relative_proto_validator() {
    var _a, _b;
    return (_b = (_a = this.cache).relative_proto_validator) != null ? _b : _a.relative_proto_validator = new RegExp((this.opts.urlAuth ? this.get_auth().source : "") + `(?:localhost|${this.get_ipv6_url_host().source}|(?:(?:${this.get_domain().source})[.]){1,10}${this.get_domain_root().source})` + this.get_port().source + this.get_host_terminator().source + this.get_path().source, "iy");
  }
  get_mail_name_validator() {
    var _a, _b;
    return (_b = (_a = this.cache).mail_name_validator) != null ? _b : _a.mail_name_validator = new RegExp(`(?:^|${this.get_text_separators().source}|"|\\(|${this.src_ZCc})(${this.get_mail_name().source})$`);
  }
  get_mailto_validator() {
    var _a, _b;
    return (_b = (_a = this.cache).mailto_validator) != null ? _b : _a.mailto_validator = new RegExp(`${this.get_mail_name().source}@${this.get_mail_host().source}`, "iy");
  }
  get_schema_names() {
    var _a, _b;
    return (_b = (_a = this.cache).schema_names) != null ? _b : _a.schema_names = new RegExp((this.opts.schema_names || []).map((name) => this.escapeRE(name)).join("|"));
  }
  get_schema_search() {
    var _a, _b;
    return (_b = (_a = this.cache).schema_search) != null ? _b : _a.schema_search = new RegExp(`(^|(?!_)(?:[><\uFF5C]|${this.src_ZPCc}))(${this.get_schema_names().source})`, "ig");
  }
  get_schema_at_start() {
    var _a, _b;
    return (_b = (_a = this.cache).schema_at_start) != null ? _b : _a.schema_at_start = new RegExp(`^${this.get_schema_search().source}`, "i");
  }
};
var web_schema = {
  validate: (text3, pos, self) => {
    const re = self.re.get_http_validator();
    re.lastIndex = pos;
    const m = re.exec(text3);
    return m ? m[0].length : 0;
  },
  normalize: (match, self) => self.normalize(match)
};
var defaultSchemas = {
  "http:": web_schema,
  "https:": web_schema,
  "ftp:": web_schema,
  "//": {
    validate: function(text3, pos, self) {
      const re = self.re.get_relative_proto_validator();
      re.lastIndex = pos;
      const m = re.exec(text3);
      if (m) {
        if (pos >= 3 && text3[pos - 3] === ":") return 0;
        if (pos >= 3 && text3[pos - 3] === "/") return 0;
        return m[0].length;
      }
      return 0;
    },
    normalize: (match, self) => self.normalize(match)
  },
  "mailto:": {
    validate: function(text3, pos, self) {
      const re = self.re.get_mailto_validator();
      re.lastIndex = pos;
      const m = re.exec(text3);
      return m ? m[0].length : 0;
    },
    normalize: (match, self) => self.normalize(match)
  }
};
var tlds_2ch = "a:cdefgilmnoqrstuwxz|b:abdefghijmnorstvwyz|c:acdfghiklmnoruvwxyz|d:ejkmoz|e:cegrstu|f:ijkmor|g:abdefghilmnpqrstuwy|h:kmnrtu|i:delmnoqrst|j:emop|k:eghimnprwyz|l:abcikrstuvy|m:acdeghklmnopqrstuvwxyz|n:acefgilopruz|o:m|p:aefghklmnrstwy|q:a|r:eosuw|s:abcdeghijklmnortuvxyz|t:cdfghjklmnortvwz|u:agksyz|v:aceginu|w:fs|y:et|z:amw";
var tlds_default = "biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|\u0440\u0444";
function unpackTlds() {
  const result = tlds_default.split("|");
  tlds_2ch.split("|").forEach((item) => {
    const sep2 = item.indexOf(":");
    const prefix = item.slice(0, sep2);
    for (const suffix of item.slice(sep2 + 1)) result.push(prefix + suffix);
  });
  return result;
}
var defaultOptions = {
  fuzzyLink: false,
  fuzzyEmail: true,
  fuzzyIP: false,
  "---": false,
  tlds: unpackTlds(),
  urlAuth: false,
  maxLength: 1e4
};
var Match = class {
  constructor(text3, schema, index, lastIndex) {
    /** Prefix (protocol) for matched string. Empty for fuzzy links. */
    __publicField(this, "schema");
    /** First position of matched string. */
    __publicField(this, "index");
    /** Next position after matched string. */
    __publicField(this, "lastIndex");
    /** Matched string. */
    __publicField(this, "raw");
    /** Normalized text of matched string. */
    __publicField(this, "text");
    /** Normalized URL of matched string. */
    __publicField(this, "url");
    const raw = text3.slice(index, lastIndex);
    this.schema = schema.toLowerCase();
    this.index = index;
    this.lastIndex = lastIndex;
    this.raw = raw;
    this.text = raw;
    this.url = raw;
  }
};
var LinkifyIt = class {
  /**
  * Creates new linkifier instance.
  *
  * By default understands:
  *
  * - `http(s)://...` , `ftp://...`, `mailto:...` & `//...` links
  * - "fuzzy" emails (foo@bar.com).
  *
  * See {@link LinkifyConstructorOptions} for available options.
  *
  * @param options Recognition options.
  *
  * @example
  * ```javascript
  * import { LinkifyIt } from 'linkify-it'
  *
  * const linkify = new LinkifyIt({ fuzzyLink: true })
  *
  * linkify
  *   .tlds(require('tlds'))       // Reload with full TLD list
  *   .tlds('onion', true)         // Add unofficial `.onion` domain
  *   .add('ftp:', null)           // Disable `ftp:` protocol
  *   .set({ fuzzyIP: true })      // Enable IPs in fuzzy links
  *
  * console.log(linkify.test('Site github.com!')) // true
  * console.log(linkify.match('Site github.com!'))
  * ```
  */
  constructor(options = {}) {
    __publicField(this, "__opts__");
    __publicField(this, "__schemas__");
    __publicField(this, "re");
    const { rebuilder, ...linkifyOptions } = options;
    this.__opts__ = {
      ...defaultOptions,
      ...linkifyOptions
    };
    this.__schemas__ = { ...defaultSchemas };
    this.re = rebuilder || new REBuilder();
    this.re.set({
      ...this.__opts__,
      schema_names: Object.keys(this.__schemas__)
    });
  }
  /**
  * Add new rule definition.
  *
  * `schema` is a link prefix (usually, protocol name with `:` at the end,
  * `skype:` for example). `linkify-it` makes sure that prefix is not
  * preceded with alphanumeric char and symbols. Only whitespaces and
  * punctuation allowed.
  *
  * `definition` is a rule to check tail after link prefix. To disable an
  * existing rule, pass `null`.
  *
  * @param schema Rule name (fixed pattern prefix).
  * @param definition Schema definition, or `null` to disable the rule.
  *
  * See [twitter mentions example](https://github.com/markdown-it/linkify-it/blob/master/examples/twitter.mjs).
  */
  add(schema, definition = null) {
    if (!definition) delete this.__schemas__[schema];
    else {
      const def = {
        normalize: (match, self) => self.normalize(match),
        ...definition
      };
      this.__schemas__[schema] = def;
    }
    this.re.set({
      ...this.__opts__,
      schema_names: Object.keys(this.__schemas__)
    });
    return this;
  }
  /**
  * Set recognition options for links without schema.
  *
  * @param options Recognition options.
  */
  set(options = {}) {
    this.__opts__ = {
      ...this.__opts__,
      ...options
    };
    this.re.set({
      ...this.__opts__,
      schema_names: Object.keys(this.__schemas__)
    });
    return this;
  }
  /**
  * Searches linkifiable pattern and returns `true` on success or `false` on fail.
  *
  * @param text Text to scan.
  */
  test(text3) {
    if (!text3.length) return false;
    let m, re;
    re = this.re.get_schema_search();
    re.lastIndex = 0;
    while ((m = re.exec(text3)) !== null) if (this.testSchemaAt(text3, m[2], re.lastIndex)) return true;
    if (this.__opts__.fuzzyLink && this.__schemas__["http:"]) {
      re = this.re.get_fuzzy_link_search();
      re.lastIndex = 0;
      if (re.exec(text3) !== null) return true;
    }
    if (this.__opts__.fuzzyEmail && this.__schemas__["mailto:"]) {
      if (text3.indexOf("@") >= 0) {
        const mailHostRe = this.re.get_fuzzy_mail_host_search();
        const mailNameRe = this.re.get_mail_name_validator();
        mailHostRe.lastIndex = 0;
        while ((m = mailHostRe.exec(text3)) !== null) {
          const name = text3.slice(Math.max(0, m.index - 65), m.index);
          if (mailNameRe.test(name)) return true;
        }
      }
    }
    return false;
  }
  /**
  * Similar to {@link LinkifyIt.test} but checks only specific protocol tail exactly
  * at given position. Returns length of found pattern (0 on fail).
  *
  * @param text Text to scan.
  * @param schema Rule (schema) name.
  * @param pos Text offset to check from.
  */
  testSchemaAt(text3, schema, pos) {
    if (!this.__schemas__[schema.toLowerCase()]) return 0;
    return this.__schemas__[schema.toLowerCase()].validate(text3.slice(0, pos + this.__opts__.maxLength), pos, this);
  }
  /**
  * Returns array of found link descriptions or `null` on fail. We strongly
  * recommend to use {@link LinkifyIt.test} first, for best speed.
  *
  * @param text Text to scan.
  */
  match(text3) {
    const result = [];
    const schemaRe = this.re.get_schema_search();
    let fuzzyLinkRe;
    let mailHostRe;
    let mailNameRe;
    let fuzzyLinkCandidate;
    let fuzzyEmailCandidate;
    let schemaPrefix;
    let schemaDone = false;
    let fuzzyLinkDone = false;
    let fuzzyEmailDone = false;
    let pos = 0;
    if (!text3.length) return null;
    schemaRe.lastIndex = 0;
    if (this.__opts__.fuzzyLink && this.__schemas__["http:"]) {
      fuzzyLinkRe = this.re.get_fuzzy_link_search();
      fuzzyLinkRe.lastIndex = 0;
    }
    if (this.__opts__.fuzzyEmail && this.__schemas__["mailto:"]) {
      mailHostRe = this.re.get_fuzzy_mail_host_search();
      mailHostRe.lastIndex = 0;
      mailNameRe = this.re.get_mail_name_validator();
    }
    for (; ; ) {
      const scanFrom = Math.max(pos - 1, 0);
      if (mailHostRe && mailNameRe && !fuzzyEmailDone && (!fuzzyEmailCandidate || fuzzyEmailCandidate.index < pos)) {
        if (mailHostRe.lastIndex < scanFrom) mailHostRe.lastIndex = scanFrom;
        for (; ; ) {
          const m = mailHostRe.exec(text3);
          if (!m) {
            fuzzyEmailDone = true;
            fuzzyEmailCandidate = void 0;
            break;
          }
          const name = mailNameRe.exec(text3.slice(Math.max(0, m.index - 65), m.index));
          if (!name) continue;
          fuzzyEmailCandidate = {
            schema: "mailto:",
            index: m.index - name[1].length,
            lastIndex: m.index + m[0].length
          };
          if (fuzzyEmailCandidate.index >= pos) break;
          if (mailHostRe.lastIndex < scanFrom) mailHostRe.lastIndex = scanFrom;
        }
      }
      if (fuzzyLinkRe && !fuzzyLinkDone && (!fuzzyLinkCandidate || fuzzyLinkCandidate.index < pos)) {
        if (fuzzyLinkRe.lastIndex < scanFrom) fuzzyLinkRe.lastIndex = scanFrom;
        for (; ; ) {
          const m = fuzzyLinkRe.exec(text3);
          if (!m) {
            fuzzyLinkDone = true;
            fuzzyLinkCandidate = void 0;
            break;
          }
          fuzzyLinkCandidate = {
            schema: "",
            index: m.index + m[1].length,
            lastIndex: m.index + m[0].length
          };
          if (fuzzyLinkCandidate.index >= pos) break;
          if (fuzzyLinkRe.lastIndex < scanFrom) fuzzyLinkRe.lastIndex = scanFrom;
        }
      }
      let fuzzyCandidate = fuzzyEmailCandidate;
      if (!fuzzyCandidate || fuzzyLinkCandidate && (fuzzyLinkCandidate.index < fuzzyCandidate.index || fuzzyLinkCandidate.index === fuzzyCandidate.index && fuzzyLinkCandidate.lastIndex > fuzzyCandidate.lastIndex)) fuzzyCandidate = fuzzyLinkCandidate;
      let schemaCandidate;
      if (!schemaDone) for (; ; ) {
        if (!schemaPrefix) {
          if (schemaRe.lastIndex < scanFrom) schemaRe.lastIndex = scanFrom;
          const m = schemaRe.exec(text3);
          if (!m) {
            schemaDone = true;
            break;
          }
          schemaPrefix = {
            schema: m[2],
            index: m.index + m[1].length,
            lastIndex: m.index + m[0].length
          };
        }
        if (schemaPrefix.index < pos) {
          schemaPrefix = void 0;
          continue;
        }
        if (fuzzyCandidate && schemaPrefix.index > fuzzyCandidate.index) break;
        const prefix = schemaPrefix;
        schemaPrefix = void 0;
        const len = this.testSchemaAt(text3, prefix.schema, prefix.lastIndex);
        if (len) {
          schemaCandidate = {
            schema: prefix.schema,
            index: prefix.index,
            lastIndex: prefix.lastIndex + len
          };
          break;
        }
      }
      let candidate = schemaCandidate;
      if (!candidate || fuzzyEmailCandidate && (fuzzyEmailCandidate.index < candidate.index || fuzzyEmailCandidate.index === candidate.index && fuzzyEmailCandidate.lastIndex > candidate.lastIndex)) candidate = fuzzyEmailCandidate;
      if (!candidate || fuzzyLinkCandidate && (fuzzyLinkCandidate.index < candidate.index || fuzzyLinkCandidate.index === candidate.index && fuzzyLinkCandidate.lastIndex > candidate.lastIndex)) candidate = fuzzyLinkCandidate;
      if (!candidate) break;
      if (candidate === fuzzyEmailCandidate) fuzzyEmailCandidate = void 0;
      else if (candidate === fuzzyLinkCandidate) fuzzyLinkCandidate = void 0;
      const match = new Match(text3, candidate.schema, candidate.index, candidate.lastIndex);
      if (match.schema) this.__schemas__[match.schema].normalize(match, this);
      else this.normalize(match);
      result.push(match);
      pos = candidate.lastIndex;
    }
    if (result.length) return result;
    return null;
  }
  /**
  * Returns fully-formed (not fuzzy) link if it starts at the beginning
  * of the string, and null otherwise.
  *
  * @param text Text to scan.
  */
  matchAtStart(text3) {
    if (!text3.length) return null;
    const m = this.re.get_schema_at_start().exec(text3);
    if (!m) return null;
    const len = this.testSchemaAt(text3, m[2], m[0].length);
    if (!len) return null;
    const match = new Match(text3, m[2], m.index + m[1].length, m.index + m[0].length + len);
    this.__schemas__[match.schema].normalize(match, this);
    return match;
  }
  /**
  * Load (or merge) new TLDs list. Those are used for fuzzy links (without
  * prefix) to avoid false positives. By default this algorithm is used:
  *
  * - hostname with any 2-letter root zones are ok.
  * - biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф
  *   are ok.
  * - encoded (`xn--...`) root zones are ok.
  *
  * If list is replaced, then exact match for 2-chars root zones will be checked.
  *
  * @param list List of TLDs.
  * @param keepOld Merge with current list if `true` (`false` by default).
  */
  tlds(list2, keepOld = false) {
    list2 = Array.isArray(list2) ? list2 : [list2];
    if (!keepOld) this.__opts__.tlds = list2;
    else this.__opts__.tlds = this.__opts__.tlds.concat(list2);
    this.re.set({
      ...this.__opts__,
      schema_names: Object.keys(this.__schemas__)
    });
    return this;
  }
  /**
  * Default normalizer (if schema does not define its own).
  *
  * @param match Match to normalize.
  */
  normalize(match) {
    if (!match.schema) match.url = `http://${match.url}`;
    if (match.schema === "mailto:" && !/^mailto:/i.test(match.url)) match.url = `mailto:${match.url}`;
  }
};

// node_modules/markdown-it/dist/markdown-it.mjs
var import_punycode = __toESM(require_punycode(), 1);
var __defProp2 = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
  let target = {};
  for (var name in all) __defProp2(target, name, {
    get: all[name],
    enumerable: true
  });
  if (!no_symbols) __defProp2(target, Symbol.toStringTag, { value: "Module" });
  return target;
};
var utils_exports = /* @__PURE__ */ __exportAll({
  arrayReplaceAt: () => arrayReplaceAt,
  asciiTrim: () => asciiTrim,
  callable: () => callable,
  escapeHtml: () => escapeHtml,
  escapeRE: () => escapeRE,
  fromCodePoint: () => fromCodePoint,
  isMdAsciiPunct: () => isMdAsciiPunct,
  isPunctChar: () => isPunctChar,
  isPunctCharCode: () => isPunctCharCode,
  isSpace: () => isSpace,
  isValidEntityCode: () => isValidEntityCode,
  isWhiteSpace: () => isWhiteSpace,
  lib: () => lib,
  normalizeReference: () => normalizeReference,
  unescapeAll: () => unescapeAll,
  unescapeMd: () => unescapeMd
});
function callable(cls) {
  const wrapper = function(...args) {
    return Reflect.construct(cls, args, new.target && new.target !== wrapper ? new.target : cls);
  };
  Object.defineProperty(wrapper, "name", { value: cls.name });
  Object.setPrototypeOf(wrapper, cls);
  wrapper.prototype = cls.prototype;
  return wrapper;
}
function arrayReplaceAt(src, pos, newElements) {
  return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
}
function isValidEntityCode(c) {
  if (c >= 55296 && c <= 57343) return false;
  if (c >= 64976 && c <= 65007) return false;
  if ((c & 65535) === 65535 || (c & 65535) === 65534) return false;
  if (c >= 0 && c <= 8) return false;
  if (c === 11) return false;
  if (c >= 14 && c <= 31) return false;
  if (c >= 127 && c <= 159) return false;
  if (c > 1114111) return false;
  return true;
}
function fromCodePoint(c) {
  if (c > 65535) {
    c -= 65536;
    const surrogate1 = 55296 + (c >> 10);
    const surrogate2 = 56320 + (c & 1023);
    return String.fromCharCode(surrogate1, surrogate2);
  }
  return String.fromCharCode(c);
}
var UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
var UNESCAPE_ALL_RE = new RegExp(`${UNESCAPE_MD_RE.source}|${/&([a-z#][a-z0-9]{1,31});/gi.source}`, "gi");
var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;
function replaceEntityPattern(match, name) {
  if (name.charCodeAt(0) === 35 && DIGITAL_ENTITY_TEST_RE.test(name)) {
    const code2 = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (isValidEntityCode(code2)) return fromCodePoint(code2);
    return match;
  }
  const decoded = decodeHTMLStrict(match);
  if (decoded !== match) return decoded;
  return match;
}
function unescapeMd(str) {
  if (str.indexOf("\\") < 0) return str;
  return str.replace(UNESCAPE_MD_RE, "$1");
}
function unescapeAll(str) {
  if (str.indexOf("\\") < 0 && str.indexOf("&") < 0) return str;
  return str.replace(UNESCAPE_ALL_RE, function(match, escaped, entity2) {
    if (escaped) return escaped;
    return replaceEntityPattern(match, entity2);
  });
}
var HTML_ESCAPE_TEST_RE = /[&<>"]/;
var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
var HTML_REPLACEMENTS = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
};
function replaceUnsafeChar(ch) {
  return HTML_REPLACEMENTS[ch];
}
function escapeHtml(str) {
  if (HTML_ESCAPE_TEST_RE.test(str)) return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
  return str;
}
var REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;
function escapeRE(str) {
  return str.replace(REGEXP_ESCAPE_RE, "\\$&");
}
function isSpace(code2) {
  switch (code2) {
    case 9:
    case 32:
      return true;
  }
  return false;
}
function isWhiteSpace(code2) {
  if (code2 >= 8192 && code2 <= 8202) return true;
  switch (code2) {
    case 9:
    case 10:
    case 11:
    case 12:
    case 13:
    case 32:
    case 160:
    case 5760:
    case 8239:
    case 8287:
    case 12288:
      return true;
  }
  return false;
}
function isPunctChar(ch) {
  return P.test(ch) || S.test(ch);
}
function isPunctCharCode(code2) {
  return isPunctChar(fromCodePoint(code2));
}
function isMdAsciiPunct(ch) {
  switch (ch) {
    case 33:
    case 34:
    case 35:
    case 36:
    case 37:
    case 38:
    case 39:
    case 40:
    case 41:
    case 42:
    case 43:
    case 44:
    case 45:
    case 46:
    case 47:
    case 58:
    case 59:
    case 60:
    case 61:
    case 62:
    case 63:
    case 64:
    case 91:
    case 92:
    case 93:
    case 94:
    case 95:
    case 96:
    case 123:
    case 124:
    case 125:
    case 126:
      return true;
    default:
      return false;
  }
}
function normalizeReference(str) {
  str = str.trim().replace(/\s+/g, " ");
  return str.toLowerCase().toUpperCase();
}
function isAsciiTrimmable(c) {
  return c === 32 || c === 9 || c === 10 || c === 13;
}
function asciiTrim(str) {
  let start = 0;
  for (; start < str.length; start++) if (!isAsciiTrimmable(str.charCodeAt(start))) break;
  let end = str.length - 1;
  for (; end >= start; end--) if (!isAsciiTrimmable(str.charCodeAt(end))) break;
  return str.slice(start, end + 1);
}
var lib = {
  mdurl: mdurl_exports,
  ucmicro: build_exports
};
function parseLinkLabel(state, start, disableNested) {
  let level, found, marker, prevPos;
  const max = state.posMax;
  const oldPos = state.pos;
  state.pos = start + 1;
  level = 1;
  while (state.pos < max) {
    marker = state.src.charCodeAt(state.pos);
    if (marker === 93) {
      level--;
      if (level === 0) {
        found = true;
        break;
      }
    }
    prevPos = state.pos;
    state.md.inline.skipToken(state);
    if (marker === 91) {
      if (prevPos === state.pos - 1) level++;
      else if (disableNested) {
        state.pos = oldPos;
        return -1;
      }
    }
  }
  let labelEnd = -1;
  if (found) labelEnd = state.pos;
  state.pos = oldPos;
  return labelEnd;
}
function parseLinkDestination(str, start, max) {
  let code2;
  let pos = start;
  const result = {
    ok: false,
    pos: 0,
    str: ""
  };
  if (str.charCodeAt(pos) === 60) {
    pos++;
    while (pos < max) {
      code2 = str.charCodeAt(pos);
      if (code2 === 10) return result;
      if (code2 === 60) return result;
      if (code2 === 62) {
        result.pos = pos + 1;
        result.str = unescapeAll(str.slice(start + 1, pos));
        result.ok = true;
        return result;
      }
      if (code2 === 92 && pos + 1 < max) {
        pos += 2;
        continue;
      }
      pos++;
    }
    return result;
  }
  let level = 0;
  while (pos < max) {
    code2 = str.charCodeAt(pos);
    if (code2 === 32) break;
    if (code2 < 32 || code2 === 127) break;
    if (code2 === 92 && pos + 1 < max) {
      if (str.charCodeAt(pos + 1) === 32) {
        pos++;
        continue;
      }
      pos += 2;
      continue;
    }
    if (code2 === 40) {
      level++;
      if (level > 32) return result;
    }
    if (code2 === 41) {
      if (level === 0) break;
      level--;
    }
    pos++;
  }
  if (start === pos) return result;
  if (level !== 0) return result;
  result.str = unescapeAll(str.slice(start, pos));
  result.pos = pos;
  result.ok = true;
  return result;
}
function parseLinkTitle(str, start, max, prev_state) {
  let code2;
  let pos = start;
  const state = {
    ok: false,
    can_continue: false,
    pos: 0,
    str: "",
    marker: 0
  };
  if (prev_state) {
    state.str = prev_state.str;
    state.marker = prev_state.marker;
  } else {
    if (pos >= max) return state;
    let marker = str.charCodeAt(pos);
    if (marker !== 34 && marker !== 39 && marker !== 40) return state;
    start++;
    pos++;
    if (marker === 40) marker = 41;
    state.marker = marker;
  }
  while (pos < max) {
    code2 = str.charCodeAt(pos);
    if (code2 === state.marker) {
      state.pos = pos + 1;
      state.str += unescapeAll(str.slice(start, pos));
      state.ok = true;
      return state;
    } else if (code2 === 40 && state.marker === 41) return state;
    else if (code2 === 92 && pos + 1 < max) pos++;
    pos++;
  }
  state.can_continue = true;
  state.str += unescapeAll(str.slice(start, pos));
  return state;
}
var helpers_exports = /* @__PURE__ */ __exportAll({
  parseLinkDestination: () => parseLinkDestination,
  parseLinkLabel: () => parseLinkLabel,
  parseLinkTitle: () => parseLinkTitle
});
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
    return typeof o2;
  } : function(o2) {
    return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
  }, _typeof(o);
}
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
var Token = class {
  constructor(type, tag, nesting) {
    _defineProperty(
      this,
      /**
      * Source map info. Format: `[ line_begin, line_end ]`
      */
      "map",
      null
    );
    _defineProperty(
      this,
      /**
      * nesting level, the same as `state.level`
      */
      "level",
      0
    );
    _defineProperty(
      this,
      /**
      * An array of child nodes (inline and img tokens)
      */
      "children",
      null
    );
    _defineProperty(
      this,
      /**
      * In a case of self-closing tag (code, html, fence, etc.),
      * it has contents of this tag.
      */
      "content",
      ""
    );
    _defineProperty(
      this,
      /**
      * '*' or '_' for emphasis, fence string for fence, etc.
      */
      "markup",
      ""
    );
    _defineProperty(
      this,
      /**
      * Additional information:
      *
      * - Info string for "fence" tokens
      * - The value "auto" for autolink "link_open" and "link_close" tokens
      * - The string value of the item marker for ordered-list "list_item_open" tokens
      */
      "info",
      ""
    );
    _defineProperty(
      this,
      /**
      * True for block-level tokens, false for inline tokens.
      * Used in renderer to calculate line breaks
      */
      "block",
      false
    );
    _defineProperty(
      this,
      /**
      * If it's true, ignore this element when rendering. Used for tight lists
      * to hide paragraphs.
      */
      "hidden",
      false
    );
    this.type = type;
    this.tag = tag;
    this.attrs = null;
    this.nesting = nesting;
    this.meta = null;
  }
  /**
  * Search attribute index by name.
  */
  attrIndex(name) {
    if (!this.attrs) return -1;
    const attrs = this.attrs;
    for (let i = 0, len = attrs.length; i < len; i++) if (attrs[i][0] === name) return i;
    return -1;
  }
  /**
  * Add `[ name, value ]` attribute to list. Init attrs if necessary
  */
  attrPush(attrData) {
    if (this.attrs) this.attrs.push(attrData);
    else this.attrs = [attrData];
  }
  /**
  * Set `name` attribute to `value`. Override old value if exists.
  */
  attrSet(name, value) {
    const idx = this.attrIndex(name);
    const attrData = [name, value];
    if (idx < 0) this.attrPush(attrData);
    else this.attrs[idx] = attrData;
  }
  /**
  * Get the value of attribute `name`, or null if it does not exist.
  */
  attrGet(name) {
    const idx = this.attrIndex(name);
    let value = null;
    if (idx >= 0) value = this.attrs[idx][1];
    return value;
  }
  /**
  * Join value to existing attribute via space. Or create new attribute if not
  * exists. Useful to operate with token classes.
  */
  attrJoin(name, value) {
    const idx = this.attrIndex(name);
    if (idx < 0) this.attrPush([name, value]);
    else this.attrs[idx][1] = `${this.attrs[idx][1]} ${value}`;
  }
};
var Ruler = class {
  constructor() {
    _defineProperty(
      this,
      /** @internal */
      "__rules__",
      []
    );
    _defineProperty(
      this,
      /** @internal */
      "__cache__",
      null
    );
  }
  /** @internal */
  __find__(name) {
    for (let i = 0; i < this.__rules__.length; i++) if (this.__rules__[i].name === name) return i;
    return -1;
  }
  /** @internal */
  __compile__() {
    const chains = /* @__PURE__ */ new Set();
    this.__rules__.forEach((rule) => {
      if (!rule.enabled) return;
      rule.alt.forEach((altName) => {
        if (altName) chains.add(altName);
      });
    });
    this.__cache__ = /* @__PURE__ */ Object.create(null);
    this.__cache__[""] = [];
    this.__rules__.forEach((rule) => {
      if (rule.enabled) this.__cache__[""].push(rule.fn);
    });
    chains.forEach((chain) => {
      this.__cache__[chain] = [];
      this.__rules__.forEach((rule) => {
        if (rule.enabled && rule.alt.indexOf(chain) >= 0) this.__cache__[chain].push(rule.fn);
      });
    });
  }
  /**
  * Replace rule by name with new function & options. Throws error if name not
  * found.
  *
  * @example Replace existing typographer replacement rule with new one
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * md.core.ruler.at('replacements', function replace(state) {
  *   //...
  * });
  * ```
  */
  at(name, fn, options = {}) {
    const index = this.__find__(name);
    if (index === -1) throw new Error(`Parser rule not found: ${name}`);
    this.__rules__[index].fn = fn;
    this.__rules__[index].alt = options.alt || [];
    this.__cache__ = null;
  }
  /**
  * Add new rule to chain before one with given name. See also
  * {@link Ruler.after}, {@link Ruler.push}.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * md.block.ruler.before('paragraph', 'my_rule', function replace(state) {
  *   //...
  * });
  * ```
  */
  before(beforeName, ruleName, fn, options = {}) {
    const index = this.__find__(beforeName);
    if (index === -1) throw new Error(`Parser rule not found: ${beforeName}`);
    this.__rules__.splice(index, 0, {
      name: ruleName,
      enabled: true,
      fn,
      alt: options.alt || []
    });
    this.__cache__ = null;
  }
  /**
  * Add new rule to chain after one with given name. See also
  * {@link Ruler.before}, {@link Ruler.push}.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * md.inline.ruler.after('text', 'my_rule', function replace(state) {
  *   //...
  * });
  * ```
  */
  after(afterName, ruleName, fn, options = {}) {
    const index = this.__find__(afterName);
    if (index === -1) throw new Error(`Parser rule not found: ${afterName}`);
    this.__rules__.splice(index + 1, 0, {
      name: ruleName,
      enabled: true,
      fn,
      alt: options.alt || []
    });
    this.__cache__ = null;
  }
  /**
  * Push new rule to the end of chain. See also
  * {@link Ruler.before}, {@link Ruler.after}.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * md.core.ruler.push('my_rule', function replace(state) {
  *   //...
  * });
  * ```
  */
  push(ruleName, fn, options = {}) {
    this.__rules__.push({
      name: ruleName,
      enabled: true,
      fn,
      alt: options.alt || []
    });
    this.__cache__ = null;
  }
  /**
  * Enable rules with given names. If any rule name not found - throw Error.
  * Errors can be disabled by second param.
  *
  * See also {@link Ruler.disable}, {@link Ruler.enableOnly}.
  *
  * Returns list of found rule names (if no exception happened).
  */
  enable(list2, ignoreInvalid = false) {
    if (!Array.isArray(list2)) list2 = [list2];
    const result = [];
    list2.forEach((name) => {
      const idx = this.__find__(name);
      if (idx < 0) {
        if (ignoreInvalid) return;
        throw new Error(`Rules manager: invalid rule name ${name}`);
      }
      this.__rules__[idx].enabled = true;
      result.push(name);
    });
    this.__cache__ = null;
    return result;
  }
  /**
  * Enable rules with given names, and disable everything else. If any rule name
  * not found - throw Error. Errors can be disabled by second param.
  *
  * See also {@link Ruler.disable}, {@link Ruler.enable}.
  */
  enableOnly(list2, ignoreInvalid = false) {
    if (!Array.isArray(list2)) list2 = [list2];
    this.__rules__.forEach((rule) => {
      rule.enabled = false;
    });
    this.enable(list2, ignoreInvalid);
  }
  /**
  * Disable rules with given names. If any rule name not found - throw Error.
  * Errors can be disabled by second param.
  *
  * See also {@link Ruler.enable}, {@link Ruler.enableOnly}.
  *
  * Returns list of found rule names (if no exception happened).
  */
  disable(list2, ignoreInvalid = false) {
    if (!Array.isArray(list2)) list2 = [list2];
    const result = [];
    list2.forEach((name) => {
      const idx = this.__find__(name);
      if (idx < 0) {
        if (ignoreInvalid) return;
        throw new Error(`Rules manager: invalid rule name ${name}`);
      }
      this.__rules__[idx].enabled = false;
      result.push(name);
    });
    this.__cache__ = null;
    return result;
  }
  /**
  * Return array of active functions (rules) for given chain name. It analyzes
  * rules configuration, compiles caches if not exists and returns result.
  *
  * Default chain name is `''` (empty string). It can't be skipped. That's
  * done intentionally, to keep signature monomorphic for high speed.
  */
  getRules(chainName) {
    if (!this.__cache__) this.__compile__();
    return this.__cache__[chainName] || [];
  }
};
var default_rules = {};
default_rules.code_inline = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  return `<code${slf.renderAttrs(token)}>${escapeHtml(token.content)}</code>`;
};
default_rules.code_block = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  return `<pre${slf.renderAttrs(token)}><code>${escapeHtml(tokens[idx].content)}</code></pre>
`;
};
default_rules.fence = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  const info = token.info ? unescapeAll(token.info).trim() : "";
  let langName = "";
  let langAttrs = "";
  if (info) {
    const arr = info.split(/(\s+)/g);
    langName = arr[0];
    langAttrs = arr.slice(2).join("");
  }
  let highlighted;
  if (options.highlight) highlighted = options.highlight(token.content, langName, langAttrs) || escapeHtml(token.content);
  else highlighted = escapeHtml(token.content);
  if (highlighted.indexOf("<pre") === 0) return highlighted + "\n";
  if (info) {
    const i = token.attrIndex("class");
    const tmpAttrs = token.attrs ? token.attrs.slice() : [];
    if (i < 0) tmpAttrs.push(["class", `${options.langPrefix}${langName}`]);
    else {
      tmpAttrs[i] = [tmpAttrs[i][0], tmpAttrs[i][1]];
      tmpAttrs[i][1] += ` ${options.langPrefix}${langName}`;
    }
    const tmpToken = { attrs: tmpAttrs };
    return `<pre><code${slf.renderAttrs(tmpToken)}>${highlighted}</code></pre>
`;
  }
  return `<pre><code${slf.renderAttrs(token)}>${highlighted}</code></pre>
`;
};
default_rules.image = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  token.attrs[token.attrIndex("alt")][1] = slf.renderInlineAsText(token.children, options, env);
  return slf.renderToken(tokens, idx, options);
};
default_rules.hardbreak = function(tokens, idx, options) {
  return options.xhtmlOut ? "<br />\n" : "<br>\n";
};
default_rules.softbreak = function(tokens, idx, options) {
  return options.breaks ? options.xhtmlOut ? "<br />\n" : "<br>\n" : "\n";
};
default_rules.text = function(tokens, idx) {
  return escapeHtml(tokens[idx].content);
};
default_rules.html_block = function(tokens, idx) {
  return tokens[idx].content;
};
default_rules.html_inline = function(tokens, idx) {
  return tokens[idx].content;
};
var Renderer = class {
  constructor() {
    _defineProperty(
      this,
      /**
      * Contains render rules for tokens. Can be updated and extended.
      *
      * See [source code](https://github.com/markdown-it/markdown-it/blob/master/src/renderer.ts)
      * for more details and examples.
      *
      * @example Custom render rules
      * ```javascript
      * import MarkdownIt from 'markdown-it'
      * const md = new MarkdownIt()
      *
      * md.renderer.rules.strong_open  = function () { return '<b>'; };
      * md.renderer.rules.strong_close = function () { return '</b>'; };
      *
      * const result = md.renderInline(...);
      * ```
      *
      * @example Each rule is called as independent static function with fixed signature
      * ```javascript
      * function my_token_render(tokens, idx, options, env, renderer) {
      *   // ...
      *   return renderedHTML;
      * }
      * ```
      */
      "rules",
      Object.assign({}, default_rules)
    );
  }
  /**
  * Render token attributes to string.
  */
  renderAttrs(token) {
    let i, l, result;
    if (!token.attrs) return "";
    result = "";
    for (i = 0, l = token.attrs.length; i < l; i++) result += ` ${escapeHtml(token.attrs[i][0])}="${escapeHtml(String(token.attrs[i][1]))}"`;
    return result;
  }
  /**
  * Default token renderer. Can be overriden by custom function
  * in {@link Renderer.rules}.
  */
  renderToken(tokens, idx, options) {
    const token = tokens[idx];
    let result = "";
    if (token.hidden) return "";
    let prev = idx - 1;
    while (prev >= 0 && tokens[prev].hidden && tokens[prev].nesting === 0) prev--;
    if (token.block && token.nesting !== -1 && prev >= 0 && tokens[prev].hidden && tokens[prev].nesting === -1) result += "\n";
    result += (token.nesting === -1 ? "</" : "<") + token.tag;
    result += this.renderAttrs(token);
    if (token.nesting === 0 && options.xhtmlOut) result += " /";
    let needLf = false;
    if (token.block) {
      needLf = true;
      if (token.nesting === 1) {
        let next = idx + 1;
        while (next < tokens.length && tokens[next].hidden && tokens[next].nesting === 0) next++;
        if (next < tokens.length) {
          const nextToken = tokens[next];
          if (nextToken.type === "inline" || nextToken.hidden) needLf = false;
          else if (nextToken.nesting === -1 && nextToken.tag === token.tag) needLf = false;
        }
      }
    }
    result += needLf ? ">\n" : ">";
    return result;
  }
  /**
  * The same as {@link Renderer.render}, but for single token of `inline` type.
  */
  renderInline(tokens, options, env) {
    let result = "";
    const rules = this.rules;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const type = tokens[i].type;
      if (typeof rules[type] !== "undefined") result += rules[type](tokens, i, options, env, this);
      else result += this.renderToken(tokens, i, options);
    }
    return result;
  }
  /**
  * Special kludge for image `alt` attributes to conform CommonMark spec.
  * Don't try to use it! Spec requires to show `alt` content with stripped markup,
  * instead of simple escaping.
  */
  renderInlineAsText(tokens, options, env) {
    let result = "";
    for (let i = 0, len = tokens.length; i < len; i++) switch (tokens[i].type) {
      case "text":
      case "code_inline":
        result += tokens[i].content;
        break;
      case "image":
        result += this.renderInlineAsText(tokens[i].children, options, env);
        break;
      case "html_inline":
      case "html_block":
        result += tokens[i].content;
        break;
      case "softbreak":
      case "hardbreak":
        result += "\n";
    }
    return result;
  }
  /**
  * Takes token stream and generates HTML. Probably, you will never need to call
  * this method directly.
  */
  render(tokens, options, env) {
    let result = "";
    const rules = this.rules;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const type = tokens[i].type;
      if (type === "inline") result += this.renderInline(tokens[i].children, options, env);
      else if (typeof rules[type] !== "undefined") result += rules[type](tokens, i, options, env, this);
      else result += this.renderToken(tokens, i, options);
    }
    return result;
  }
};
var StateCore = class {
  constructor(src, md, env) {
    _defineProperty(this, "tokens", []);
    _defineProperty(this, "inlineMode", false);
    _defineProperty(this, "Token", Token);
    this.src = src;
    this.env = env;
    this.md = md;
  }
};
var UNNORMALIZED_NEWLINE_RE = /\r\n?/g;
var NULL_RE = /\0/g;
function normalize2(state) {
  let str;
  str = state.src.replace(UNNORMALIZED_NEWLINE_RE, "\n");
  str = str.replace(NULL_RE, "\uFFFD");
  state.src = str;
}
function block(state) {
  let token;
  if (state.inlineMode) {
    token = new state.Token("inline", "", 0);
    token.content = state.src;
    token.map = [0, 1];
    token.children = [];
    state.tokens.push(token);
  } else state.md.block.parse(state.src, state.md, state.env, state.tokens);
}
function strip_references(state) {
  const tokens = state.tokens;
  let last = 0;
  for (let curr = 0; curr < tokens.length; curr++) {
    if (tokens[curr].type === "reference_definition") continue;
    if (curr !== last) tokens[last] = tokens[curr];
    last++;
  }
  if (tokens.length !== last) tokens.length = last;
}
function inline(state) {
  const tokens = state.tokens;
  for (let i = 0, l = tokens.length; i < l; i++) {
    const tok = tokens[i];
    if (tok.type === "inline") state.md.inline.parse(tok.content, state.md, state.env, tok.children);
  }
}
function isLinkOpen$1(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose$1(str) {
  return /^<\/a\s*>/i.test(str);
}
function linkify$1(state) {
  const blockTokens = state.tokens;
  if (!state.md.options.linkify) return;
  for (let j = 0, l = blockTokens.length; j < l; j++) {
    if (blockTokens[j].type !== "inline" || !state.md.linkify.test(blockTokens[j].content)) continue;
    const tokens = blockTokens[j].children;
    const replacements = [];
    let htmlLinkLevel = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const currentToken = tokens[i];
      if (currentToken.type === "link_close") {
        i--;
        while (tokens[i].level !== currentToken.level && tokens[i].type !== "link_open") i--;
        continue;
      }
      if (currentToken.type === "html_inline") {
        if (isLinkOpen$1(currentToken.content) && htmlLinkLevel > 0) htmlLinkLevel--;
        if (isLinkClose$1(currentToken.content)) htmlLinkLevel++;
      }
      if (htmlLinkLevel > 0) continue;
      if (currentToken.type === "text" && state.md.linkify.test(currentToken.content)) {
        const text3 = currentToken.content;
        let links = state.md.linkify.match(text3);
        const nodes = [];
        let level = currentToken.level;
        let lastPos = 0;
        if (links.length > 0 && links[0].index === 0 && i > 0 && tokens[i - 1].type === "text_special") links = links.slice(1);
        for (let ln = 0; ln < links.length; ln++) {
          const url = links[ln].url;
          const fullUrl = state.md.normalizeLink(url);
          if (!state.md.validateLink(fullUrl)) continue;
          let urlText = links[ln].text;
          if (!links[ln].schema) urlText = state.md.normalizeLinkText(`http://${urlText}`).replace(/^http:\/\//, "");
          else if (links[ln].schema === "mailto:" && !/^mailto:/i.test(urlText)) urlText = state.md.normalizeLinkText(`mailto:${urlText}`).replace(/^mailto:/, "");
          else urlText = state.md.normalizeLinkText(urlText);
          const pos = links[ln].index;
          if (pos > lastPos) {
            const token = new state.Token("text", "", 0);
            token.content = text3.slice(lastPos, pos);
            token.level = level;
            nodes.push(token);
          }
          const token_o = new state.Token("link_open", "a", 1);
          token_o.attrs = [["href", fullUrl]];
          token_o.level = level++;
          token_o.markup = "linkify";
          token_o.info = "auto";
          nodes.push(token_o);
          const token_t = new state.Token("text", "", 0);
          token_t.content = urlText;
          token_t.level = level;
          nodes.push(token_t);
          const token_c = new state.Token("link_close", "a", -1);
          token_c.level = --level;
          token_c.markup = "linkify";
          token_c.info = "auto";
          nodes.push(token_c);
          lastPos = links[ln].lastIndex;
        }
        if (lastPos < text3.length) {
          const token = new state.Token("text", "", 0);
          token.content = text3.slice(lastPos);
          token.level = level;
          nodes.push(token);
        }
        replacements.push({
          index: i,
          nodes
        });
      }
    }
    if (replacements.length > 0) {
      let newTokensLength = tokens.length;
      for (const replacement of replacements) newTokensLength += replacement.nodes.length - 1;
      const newTokens = new Array(newTokensLength);
      let replacementIndex = 0;
      let newTokenIndex = 0;
      replacements.reverse();
      for (let i = 0; i < tokens.length; i++) {
        const replacement = replacements[replacementIndex];
        if ((replacement === null || replacement === void 0 ? void 0 : replacement.index) === i) {
          for (const node of replacement.nodes) newTokens[newTokenIndex++] = node;
          replacementIndex++;
        } else newTokens[newTokenIndex++] = tokens[i];
      }
      blockTokens[j].children = newTokens;
    }
  }
}
var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;
var SCOPED_ABBR_TEST_RE = /\((c|tm|r)\)/i;
var SCOPED_ABBR_RE = /\((c|tm|r)\)/gi;
var SCOPED_ABBR = {
  c: "\xA9",
  r: "\xAE",
  tm: "\u2122"
};
function replaceFn(match, name) {
  return SCOPED_ABBR[name.toLowerCase()];
}
function replace_scoped(inlineTokens) {
  let inside_autolink = 0;
  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];
    if (token.type === "text" && !inside_autolink) token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
    if (token.type === "link_open" && token.info === "auto") inside_autolink--;
    if (token.type === "link_close" && token.info === "auto") inside_autolink++;
  }
}
function replace_rare(inlineTokens) {
  let inside_autolink = 0;
  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];
    if (token.type === "text" && !inside_autolink) {
      if (RARE_RE.test(token.content)) token.content = token.content.replace(/\+-/g, "\xB1").replace(/\.{2,}/g, "\u2026").replace(/([?!])…/g, "$1..").replace(/([?!]){4,}/g, "$1$1$1").replace(/,{2,}/g, ",").replace(/(^|[^-])---(?=[^-]|$)/gm, "$1\u2014").replace(/(^|\s)--(?=\s|$)/gm, "$1\u2013").replace(/(^|[^-\s])--(?=[^-\s]|$)/gm, "$1\u2013");
    }
    if (token.type === "link_open" && token.info === "auto") inside_autolink--;
    if (token.type === "link_close" && token.info === "auto") inside_autolink++;
  }
}
function replace(state) {
  let blkIdx;
  if (!state.md.options.typographer) return;
  for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline") continue;
    if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) replace_scoped(state.tokens[blkIdx].children);
    if (RARE_RE.test(state.tokens[blkIdx].content)) replace_rare(state.tokens[blkIdx].children);
  }
}
var QUOTE_TEST_RE = /['"]/;
var QUOTE_RE = /['"]/g;
var APOSTROPHE = "\u2019";
var MAX_OPENERS = 1e3;
function truncateStack(stack, heads, length) {
  while (stack.length > length) {
    const item = stack.pop();
    if (item.isSingleQuote) heads.single = item.prevSameQuoteIdx;
    else heads.double = item.prevSameQuoteIdx;
  }
}
function addReplacement(replacements, tokenIdx, pos, ch) {
  if (!replacements[tokenIdx]) replacements[tokenIdx] = [];
  replacements[tokenIdx].push({
    pos,
    ch
  });
}
function applyReplacements(str, replacements) {
  let result = "";
  let lastPos = 0;
  replacements.sort((a, b) => a.pos - b.pos);
  for (let i = 0; i < replacements.length; i++) {
    const replacement = replacements[i];
    result += str.slice(lastPos, replacement.pos) + replacement.ch;
    lastPos = replacement.pos + 1;
  }
  return result + str.slice(lastPos);
}
function process_inlines(tokens, state) {
  let j;
  const stack = [];
  const heads = {
    single: -1,
    double: -1
  };
  const replacements = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const thisLevel = tokens[i].level;
    for (j = stack.length - 1; j >= 0; j--) if (stack[j].level <= thisLevel) break;
    truncateStack(stack, heads, j + 1);
    if (token.type !== "text") continue;
    const text3 = token.content;
    let pos = 0;
    const max = text3.length;
    OUTER: while (pos < max) {
      QUOTE_RE.lastIndex = pos;
      const t = QUOTE_RE.exec(text3);
      if (!t) break;
      let canOpen = true;
      let canClose = true;
      pos = t.index + 1;
      const isSingle = t[0] === "'";
      let lastChar = 32;
      if (t.index - 1 >= 0) lastChar = text3.charCodeAt(t.index - 1);
      else for (j = i - 1; j >= 0; j--) {
        if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
        if (!tokens[j].content) continue;
        lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
        break;
      }
      let nextChar = 32;
      if (pos < max) nextChar = text3.charCodeAt(pos);
      else for (j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
        if (!tokens[j].content) continue;
        nextChar = tokens[j].content.charCodeAt(0);
        break;
      }
      const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctCharCode(lastChar);
      const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctCharCode(nextChar);
      const isLastWhiteSpace = isWhiteSpace(lastChar);
      const isNextWhiteSpace = isWhiteSpace(nextChar);
      if (isNextWhiteSpace) canOpen = false;
      else if (isNextPunctChar) {
        if (!(isLastWhiteSpace || isLastPunctChar)) canOpen = false;
      }
      if (isLastWhiteSpace) canClose = false;
      else if (isLastPunctChar) {
        if (!(isNextWhiteSpace || isNextPunctChar)) canClose = false;
      }
      if (nextChar === 34 && t[0] === '"') {
        if (lastChar >= 48 && lastChar <= 57) canClose = canOpen = false;
      }
      if (canOpen && canClose) {
        canOpen = isLastPunctChar;
        canClose = isNextPunctChar;
      }
      if (!canOpen && !canClose) {
        if (isSingle) addReplacement(replacements, i, t.index, APOSTROPHE);
        continue;
      }
      if (canClose) {
        j = isSingle ? heads.single : heads.double;
        if (j >= 0 && stack[j].level === thisLevel) {
          const item = stack[j];
          let openQuote;
          let closeQuote;
          if (isSingle) {
            openQuote = state.md.options.quotes[2];
            closeQuote = state.md.options.quotes[3];
          } else {
            openQuote = state.md.options.quotes[0];
            closeQuote = state.md.options.quotes[1];
          }
          addReplacement(replacements, i, t.index, closeQuote);
          addReplacement(replacements, item.tokenIdx, item.contentPos, openQuote);
          truncateStack(stack, heads, j);
          continue OUTER;
        }
      }
      if (canOpen) {
        if (stack.length >= MAX_OPENERS) return;
        stack.push({
          tokenIdx: i,
          contentPos: t.index,
          isSingleQuote: isSingle,
          level: thisLevel,
          prevSameQuoteIdx: isSingle ? heads.single : heads.double
        });
        if (isSingle) heads.single = stack.length - 1;
        else heads.double = stack.length - 1;
      } else if (canClose && isSingle) addReplacement(replacements, i, t.index, APOSTROPHE);
    }
  }
  Object.keys(replacements).forEach(function(tokenIdx) {
    const idx = Number(tokenIdx);
    tokens[idx].content = applyReplacements(tokens[idx].content, replacements[tokenIdx]);
  });
}
function smartquotes(state) {
  if (!state.md.options.typographer) return;
  for (let blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline" || !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) continue;
    process_inlines(state.tokens[blkIdx].children, state);
  }
}
function join_alt(tokens) {
  let curr, last;
  const max = tokens.length;
  for (curr = 0; curr < max; curr++) if (tokens[curr].type === "text_special") tokens[curr].type = "text";
  for (curr = last = 0; curr < max; curr++) if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
  else {
    if (curr !== last) tokens[last] = tokens[curr];
    last++;
  }
  if (curr !== last) tokens.length = last;
}
function text_join(state) {
  let curr, last;
  const blockTokens = state.tokens;
  const l = blockTokens.length;
  for (let j = 0; j < l; j++) {
    if (blockTokens[j].type !== "inline") continue;
    const tokens = blockTokens[j].children;
    const max = tokens.length;
    for (curr = 0; curr < max; curr++) {
      if (tokens[curr].type === "text_special") tokens[curr].type = "text";
      if (tokens[curr].children) join_alt(tokens[curr].children);
    }
    for (curr = last = 0; curr < max; curr++) if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
    else {
      if (curr !== last) tokens[last] = tokens[curr];
      last++;
    }
    if (curr !== last) tokens.length = last;
  }
}
var _rules$2 = [
  ["normalize", normalize2],
  ["block", block],
  ["strip_references", strip_references],
  ["inline", inline],
  ["linkify", linkify$1],
  ["replacements", replace],
  ["smartquotes", smartquotes],
  ["text_join", text_join]
];
var ParserCore = class {
  constructor() {
    _defineProperty(
      this,
      /**
      * {@link Ruler} instance. Keep configuration of core rules.
      */
      "ruler",
      new Ruler()
    );
    _defineProperty(this, "State", StateCore);
    for (let i = 0; i < _rules$2.length; i++) this.ruler.push(_rules$2[i][0], _rules$2[i][1]);
  }
  /**
  * Executes core chain rules.
  */
  process(state) {
    const rules = this.ruler.getRules("");
    for (let i = 0, l = rules.length; i < l; i++) rules[i](state);
  }
};
var StateBlock = class {
  constructor(src, md, env, tokens) {
    _defineProperty(this, "bMarks", []);
    _defineProperty(this, "eMarks", []);
    _defineProperty(this, "tShift", []);
    _defineProperty(this, "sCount", []);
    _defineProperty(this, "bsCount", []);
    _defineProperty(this, "blkIndent", 0);
    _defineProperty(this, "line", 0);
    _defineProperty(this, "lineMax", 0);
    _defineProperty(this, "tight", false);
    _defineProperty(this, "listIndent", -1);
    _defineProperty(this, "parentType", "root");
    _defineProperty(this, "level", 0);
    _defineProperty(this, "Token", Token);
    this.src = src;
    this.md = md;
    this.env = env;
    this.tokens = tokens;
    const s = this.src;
    for (let start = 0, pos = 0, indent = 0, offset = 0, len = s.length, indent_found = false; pos < len; pos++) {
      const ch = s.charCodeAt(pos);
      if (!indent_found) if (isSpace(ch)) {
        indent++;
        if (ch === 9) offset += 4 - offset % 4;
        else offset++;
        continue;
      } else indent_found = true;
      if (ch === 10 || pos === len - 1) {
        if (ch !== 10) pos++;
        this.bMarks.push(start);
        this.eMarks.push(pos);
        this.tShift.push(indent);
        this.sCount.push(offset);
        this.bsCount.push(0);
        indent_found = false;
        indent = 0;
        offset = 0;
        start = pos + 1;
      }
    }
    this.bMarks.push(s.length);
    this.eMarks.push(s.length);
    this.tShift.push(0);
    this.sCount.push(0);
    this.bsCount.push(0);
    this.lineMax = this.bMarks.length - 1;
  }
  push(type, tag, nesting) {
    const token = new Token(type, tag, nesting);
    token.block = true;
    if (nesting < 0) this.level--;
    token.level = this.level;
    if (nesting > 0) this.level++;
    this.tokens.push(token);
    return token;
  }
  isEmpty(line) {
    return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
  }
  skipEmptyLines(from) {
    for (let max = this.lineMax; from < max; from++) if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) break;
    return from;
  }
  skipSpaces(pos) {
    for (let max = this.src.length; pos < max; pos++) if (!isSpace(this.src.charCodeAt(pos))) break;
    return pos;
  }
  skipSpacesBack(pos, min) {
    if (pos <= min) return pos;
    while (pos > min) if (!isSpace(this.src.charCodeAt(--pos))) return pos + 1;
    return pos;
  }
  skipChars(pos, code2) {
    for (let max = this.src.length; pos < max; pos++) if (this.src.charCodeAt(pos) !== code2) break;
    return pos;
  }
  skipCharsBack(pos, code2, min) {
    if (pos <= min) return pos;
    while (pos > min) if (code2 !== this.src.charCodeAt(--pos)) return pos + 1;
    return pos;
  }
  getLines(begin, end, indent, keepLastLF) {
    if (begin >= end) return "";
    const queue = new Array(end - begin);
    for (let i = 0, line = begin; line < end; line++, i++) {
      let lineIndent = 0;
      const lineStart = this.bMarks[line];
      let first = lineStart;
      let last;
      if (line + 1 < end || keepLastLF) last = this.eMarks[line] + 1;
      else last = this.eMarks[line];
      while (first < last && lineIndent < indent) {
        const ch = this.src.charCodeAt(first);
        if (isSpace(ch)) if (ch === 9) lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
        else lineIndent++;
        else if (first - lineStart < this.tShift[line]) lineIndent++;
        else break;
        first++;
      }
      if (lineIndent > indent) queue[i] = new Array(lineIndent - indent + 1).join(" ") + this.src.slice(first, last);
      else queue[i] = this.src.slice(first, last);
    }
    return queue.join("");
  }
};
var MAX_AUTOCOMPLETED_CELLS = 65536;
function getLine(state, line) {
  const pos = state.bMarks[line] + state.tShift[line];
  const max = state.eMarks[line];
  return state.src.slice(pos, max);
}
function escapedSplit(str) {
  const result = [];
  const max = str.length;
  let pos = 0;
  let ch = str.charCodeAt(pos);
  let isEscaped = false;
  let lastPos = 0;
  let current = "";
  while (pos < max) {
    if (ch === 124) if (!isEscaped) {
      result.push(current + str.substring(lastPos, pos));
      current = "";
      lastPos = pos + 1;
    } else {
      current += str.substring(lastPos, pos - 1);
      lastPos = pos;
    }
    isEscaped = ch === 92;
    pos++;
    ch = str.charCodeAt(pos);
  }
  result.push(current + str.substring(lastPos));
  return result;
}
function table(state, startLine, endLine, silent) {
  if (startLine + 2 > endLine) return false;
  let nextLine = startLine + 1;
  if (state.sCount[nextLine] < state.blkIndent) return false;
  if (state.sCount[nextLine] - state.blkIndent >= 4) return false;
  let pos = state.bMarks[nextLine] + state.tShift[nextLine];
  if (pos >= state.eMarks[nextLine]) return false;
  const firstCh = state.src.charCodeAt(pos++);
  if (firstCh !== 124 && firstCh !== 45 && firstCh !== 58) return false;
  if (pos >= state.eMarks[nextLine]) return false;
  const secondCh = state.src.charCodeAt(pos++);
  if (secondCh !== 124 && secondCh !== 45 && secondCh !== 58 && !isSpace(secondCh)) return false;
  if (firstCh === 45 && isSpace(secondCh)) return false;
  while (pos < state.eMarks[nextLine]) {
    const ch = state.src.charCodeAt(pos);
    if (ch !== 124 && ch !== 45 && ch !== 58 && !isSpace(ch)) return false;
    pos++;
  }
  let lineText = getLine(state, startLine + 1);
  let columns = lineText.split("|");
  const aligns = [];
  for (let i = 0; i < columns.length; i++) {
    const t = columns[i].trim();
    if (!t) if (i === 0 || i === columns.length - 1) continue;
    else return false;
    if (!/^:?-+:?$/.test(t)) return false;
    if (t.charCodeAt(t.length - 1) === 58) aligns.push(t.charCodeAt(0) === 58 ? "center" : "right");
    else if (t.charCodeAt(0) === 58) aligns.push("left");
    else aligns.push("");
  }
  lineText = getLine(state, startLine).trim();
  if (lineText.indexOf("|") === -1) return false;
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  columns = escapedSplit(lineText);
  if (columns.length && columns[0] === "") columns.shift();
  if (columns.length && columns[columns.length - 1] === "") columns.pop();
  const columnCount = columns.length;
  if (columnCount === 0 || columnCount !== aligns.length) return false;
  if (silent) return true;
  const oldParentType = state.parentType;
  state.parentType = "table";
  const terminatorRules = state.md.block.ruler.getRules("blockquote");
  const token_to = state.push("table_open", "table", 1);
  const tableLines = [startLine, 0];
  token_to.map = tableLines;
  const token_tho = state.push("thead_open", "thead", 1);
  token_tho.map = [startLine, startLine + 1];
  const token_htro = state.push("tr_open", "tr", 1);
  token_htro.map = [startLine, startLine + 1];
  for (let i = 0; i < columns.length; i++) {
    const token_ho = state.push("th_open", "th", 1);
    if (aligns[i]) token_ho.attrs = [["style", `text-align:${aligns[i]}`]];
    const token_il = state.push("inline", "", 0);
    token_il.content = columns[i].trim();
    token_il.children = [];
    state.push("th_close", "th", -1);
  }
  state.push("tr_close", "tr", -1);
  state.push("thead_close", "thead", -1);
  let tbodyLines;
  let autocompletedCells = 0;
  for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
    if (state.sCount[nextLine] < state.blkIndent) break;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) break;
    lineText = getLine(state, nextLine).trim();
    if (!lineText) break;
    if (state.sCount[nextLine] - state.blkIndent >= 4) break;
    columns = escapedSplit(lineText);
    if (columns.length && columns[0] === "") columns.shift();
    if (columns.length && columns[columns.length - 1] === "") columns.pop();
    autocompletedCells += columnCount - columns.length;
    if (autocompletedCells > MAX_AUTOCOMPLETED_CELLS) break;
    if (nextLine === startLine + 2) {
      const token_tbo = state.push("tbody_open", "tbody", 1);
      token_tbo.map = tbodyLines = [startLine + 2, 0];
    }
    const token_tro = state.push("tr_open", "tr", 1);
    token_tro.map = [nextLine, nextLine + 1];
    for (let i = 0; i < columnCount; i++) {
      const token_tdo = state.push("td_open", "td", 1);
      if (aligns[i]) token_tdo.attrs = [["style", `text-align:${aligns[i]}`]];
      const token_il = state.push("inline", "", 0);
      token_il.content = columns[i] ? columns[i].trim() : "";
      token_il.children = [];
      state.push("td_close", "td", -1);
    }
    state.push("tr_close", "tr", -1);
  }
  if (tbodyLines) {
    state.push("tbody_close", "tbody", -1);
    tbodyLines[1] = nextLine;
  }
  state.push("table_close", "table", -1);
  tableLines[1] = nextLine;
  state.parentType = oldParentType;
  state.line = nextLine;
  return true;
}
function code(state, startLine, endLine) {
  if (state.sCount[startLine] - state.blkIndent < 4) return false;
  let nextLine = startLine + 1;
  let last = nextLine;
  while (nextLine < endLine) {
    if (state.isEmpty(nextLine)) {
      nextLine++;
      continue;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      nextLine++;
      last = nextLine;
      continue;
    }
    break;
  }
  state.line = last;
  const token = state.push("code_block", "code", 0);
  token.content = state.getLines(startLine, last, 4 + state.blkIndent, false) + "\n";
  token.map = [startLine, state.line];
  return true;
}
function fence(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (pos + 3 > max) return false;
  const marker = state.src.charCodeAt(pos);
  if (marker !== 126 && marker !== 96) return false;
  let mem = pos;
  pos = state.skipChars(pos, marker);
  let len = pos - mem;
  if (len < 3) return false;
  const markup = state.src.slice(mem, pos);
  const params = state.src.slice(pos, max);
  if (marker === 96) {
    if (params.indexOf(String.fromCharCode(marker)) >= 0) return false;
  }
  if (silent) return true;
  let nextLine = startLine;
  let haveEndMarker = false;
  for (; ; ) {
    nextLine++;
    if (nextLine >= endLine) break;
    pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos < max && state.sCount[nextLine] < state.blkIndent) break;
    if (state.src.charCodeAt(pos) !== marker) continue;
    if (state.sCount[nextLine] - state.blkIndent >= 4) continue;
    pos = state.skipChars(pos, marker);
    if (pos - mem < len) continue;
    pos = state.skipSpaces(pos);
    if (pos < max) continue;
    haveEndMarker = true;
    break;
  }
  len = state.sCount[startLine];
  state.line = nextLine + (haveEndMarker ? 1 : 0);
  const token = state.push("fence", "code", 0);
  token.info = params;
  token.content = state.getLines(startLine + 1, nextLine, len, true);
  token.markup = markup;
  token.map = [startLine, state.line];
  return true;
}
function blockquote(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  const oldLineMax = state.lineMax;
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (state.src.charCodeAt(pos) !== 62) return false;
  if (silent) return true;
  const oldBMarks = [];
  const oldBSCount = [];
  const oldSCount = [];
  const oldTShift = [];
  const terminatorRules = state.md.block.ruler.getRules("blockquote");
  const oldParentType = state.parentType;
  state.parentType = "blockquote";
  let lastLineEmpty = false;
  let nextLine;
  for (nextLine = startLine; nextLine < endLine; nextLine++) {
    const isOutdented = state.sCount[nextLine] < state.blkIndent;
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos >= max) break;
    if (state.src.charCodeAt(pos++) === 62 && !isOutdented) {
      let initial = state.sCount[nextLine] + 1;
      let spaceAfterMarker;
      let adjustTab;
      if (state.src.charCodeAt(pos) === 32) {
        pos++;
        initial++;
        adjustTab = false;
        spaceAfterMarker = true;
      } else if (state.src.charCodeAt(pos) === 9) {
        spaceAfterMarker = true;
        if ((state.bsCount[nextLine] + initial) % 4 === 3) {
          pos++;
          initial++;
          adjustTab = false;
        } else adjustTab = true;
      } else spaceAfterMarker = false;
      let offset = initial;
      oldBMarks.push(state.bMarks[nextLine]);
      state.bMarks[nextLine] = pos;
      while (pos < max) {
        const ch = state.src.charCodeAt(pos);
        if (isSpace(ch)) if (ch === 9) offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
        else offset++;
        else break;
        pos++;
      }
      lastLineEmpty = pos >= max;
      oldBSCount.push(state.bsCount[nextLine]);
      state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
      oldSCount.push(state.sCount[nextLine]);
      state.sCount[nextLine] = offset - initial;
      oldTShift.push(state.tShift[nextLine]);
      state.tShift[nextLine] = pos - state.bMarks[nextLine];
      continue;
    }
    if (lastLineEmpty) break;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) {
      state.lineMax = nextLine;
      if (state.blkIndent !== 0) {
        oldBMarks.push(state.bMarks[nextLine]);
        oldBSCount.push(state.bsCount[nextLine]);
        oldTShift.push(state.tShift[nextLine]);
        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] -= state.blkIndent;
      }
      break;
    }
    oldBMarks.push(state.bMarks[nextLine]);
    oldBSCount.push(state.bsCount[nextLine]);
    oldTShift.push(state.tShift[nextLine]);
    oldSCount.push(state.sCount[nextLine]);
    state.sCount[nextLine] = -1;
  }
  const oldIndent = state.blkIndent;
  state.blkIndent = 0;
  const token_o = state.push("blockquote_open", "blockquote", 1);
  token_o.markup = ">";
  const lines = [startLine, 0];
  token_o.map = lines;
  state.md.block.tokenize(state, startLine, nextLine);
  const token_c = state.push("blockquote_close", "blockquote", -1);
  token_c.markup = ">";
  state.lineMax = oldLineMax;
  state.parentType = oldParentType;
  lines[1] = state.line;
  for (let i = 0; i < oldTShift.length; i++) {
    state.bMarks[i + startLine] = oldBMarks[i];
    state.tShift[i + startLine] = oldTShift[i];
    state.sCount[i + startLine] = oldSCount[i];
    state.bsCount[i + startLine] = oldBSCount[i];
  }
  state.blkIndent = oldIndent;
  return true;
}
function hr(state, startLine, endLine, silent) {
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 95) return false;
  let cnt = 1;
  while (pos < max) {
    const ch = state.src.charCodeAt(pos++);
    if (ch !== marker && !isSpace(ch)) return false;
    if (ch === marker) cnt++;
  }
  if (cnt < 3) return false;
  if (silent) return true;
  state.line = startLine + 1;
  const token = state.push("hr", "hr", 0);
  token.map = [startLine, state.line];
  token.markup = Array(cnt + 1).join(String.fromCharCode(marker));
  return true;
}
function skipBulletListMarker(state, startLine) {
  const max = state.eMarks[startLine];
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 43) return -1;
  if (pos < max) {
    if (!isSpace(state.src.charCodeAt(pos))) return -1;
  }
  return pos;
}
function skipOrderedListMarker(state, startLine) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  let pos = start;
  if (pos + 1 >= max) return -1;
  let ch = state.src.charCodeAt(pos++);
  if (ch < 48 || ch > 57) return -1;
  for (; ; ) {
    if (pos >= max) return -1;
    ch = state.src.charCodeAt(pos++);
    if (ch >= 48 && ch <= 57) {
      if (pos - start >= 10) return -1;
      continue;
    }
    if (ch === 41 || ch === 46) break;
    return -1;
  }
  if (pos < max) {
    ch = state.src.charCodeAt(pos);
    if (!isSpace(ch)) return -1;
  }
  return pos;
}
function markTightParagraphs(state, idx) {
  const level = state.level + 2;
  for (let i = idx + 2, l = state.tokens.length - 2; i < l; i++) if (state.tokens[i].level === level && state.tokens[i].type === "paragraph_open") {
    state.tokens[i + 2].hidden = true;
    state.tokens[i].hidden = true;
    i += 2;
  }
}
function list(state, startLine, endLine, silent) {
  let max, pos, start, token;
  let nextLine = startLine;
  let tight = true;
  if (state.sCount[nextLine] - state.blkIndent >= 4) return false;
  if (state.listIndent >= 0 && state.sCount[nextLine] - state.listIndent >= 4 && state.sCount[nextLine] < state.blkIndent) return false;
  let isTerminatingParagraph = false;
  if (silent && state.parentType === "paragraph") {
    if (state.sCount[nextLine] >= state.blkIndent) isTerminatingParagraph = true;
  }
  let isOrdered;
  let markerValue;
  let posAfterMarker;
  if ((posAfterMarker = skipOrderedListMarker(state, nextLine)) >= 0) {
    isOrdered = true;
    start = state.bMarks[nextLine] + state.tShift[nextLine];
    markerValue = Number(state.src.slice(start, posAfterMarker - 1));
    if (isTerminatingParagraph && markerValue !== 1) return false;
  } else if ((posAfterMarker = skipBulletListMarker(state, nextLine)) >= 0) isOrdered = false;
  else return false;
  if (isTerminatingParagraph) {
    if (state.skipSpaces(posAfterMarker) >= state.eMarks[nextLine]) return false;
  }
  if (silent) return true;
  const markerCharCode = state.src.charCodeAt(posAfterMarker - 1);
  const listTokIdx = state.tokens.length;
  if (isOrdered) {
    token = state.push("ordered_list_open", "ol", 1);
    if (markerValue !== 1) token.attrs = [["start", markerValue]];
  } else token = state.push("bullet_list_open", "ul", 1);
  const listLines = [nextLine, 0];
  token.map = listLines;
  token.markup = String.fromCharCode(markerCharCode);
  let prevEmptyEnd = false;
  const terminatorRules = state.md.block.ruler.getRules("list");
  const oldParentType = state.parentType;
  state.parentType = "list";
  while (nextLine < endLine) {
    pos = posAfterMarker;
    max = state.eMarks[nextLine];
    const initial = state.sCount[nextLine] + posAfterMarker - (state.bMarks[nextLine] + state.tShift[nextLine]);
    let offset = initial;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (ch === 9) offset += 4 - (offset + state.bsCount[nextLine]) % 4;
      else if (ch === 32) offset++;
      else break;
      pos++;
    }
    const contentStart = pos;
    let indentAfterMarker;
    if (contentStart >= max) indentAfterMarker = 1;
    else indentAfterMarker = offset - initial;
    if (indentAfterMarker > 4) indentAfterMarker = 1;
    const indent = initial + indentAfterMarker;
    token = state.push("list_item_open", "li", 1);
    token.markup = String.fromCharCode(markerCharCode);
    const itemLines = [nextLine, 0];
    token.map = itemLines;
    if (isOrdered) token.info = state.src.slice(start, posAfterMarker - 1);
    const oldTight = state.tight;
    const oldTShift = state.tShift[nextLine];
    const oldSCount = state.sCount[nextLine];
    const oldListIndent = state.listIndent;
    state.listIndent = state.blkIndent;
    state.blkIndent = indent;
    state.tight = true;
    state.tShift[nextLine] = contentStart - state.bMarks[nextLine];
    state.sCount[nextLine] = offset;
    if (contentStart >= max && state.isEmpty(nextLine + 1)) state.line = Math.min(state.line + 2, endLine);
    else state.md.block.tokenize(state, nextLine, endLine);
    if (!state.tight || prevEmptyEnd) tight = false;
    prevEmptyEnd = state.line - nextLine > 1 && state.isEmpty(state.line - 1);
    state.blkIndent = state.listIndent;
    state.listIndent = oldListIndent;
    state.tShift[nextLine] = oldTShift;
    state.sCount[nextLine] = oldSCount;
    state.tight = oldTight;
    token = state.push("list_item_close", "li", -1);
    token.markup = String.fromCharCode(markerCharCode);
    nextLine = state.line;
    itemLines[1] = nextLine;
    if (nextLine >= endLine) break;
    if (state.sCount[nextLine] < state.blkIndent) break;
    if (state.sCount[nextLine] - state.blkIndent >= 4) break;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) break;
    if (isOrdered) {
      posAfterMarker = skipOrderedListMarker(state, nextLine);
      if (posAfterMarker < 0) break;
      start = state.bMarks[nextLine] + state.tShift[nextLine];
    } else {
      posAfterMarker = skipBulletListMarker(state, nextLine);
      if (posAfterMarker < 0) break;
    }
    if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) break;
  }
  if (isOrdered) token = state.push("ordered_list_close", "ol", -1);
  else token = state.push("bullet_list_close", "ul", -1);
  token.markup = String.fromCharCode(markerCharCode);
  listLines[1] = nextLine;
  state.line = nextLine;
  state.parentType = oldParentType;
  if (tight) markTightParagraphs(state, listTokIdx);
  return true;
}
function reference(state, startLine, _endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  let nextLine = startLine + 1;
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (state.src.charCodeAt(pos) !== 91) return false;
  function getNextLine(nextLine2) {
    const endLine = state.lineMax;
    if (nextLine2 >= endLine || state.isEmpty(nextLine2)) return null;
    let isContinuation = false;
    if (state.sCount[nextLine2] - state.blkIndent > 3) isContinuation = true;
    if (state.sCount[nextLine2] < 0) isContinuation = true;
    if (!isContinuation) {
      const terminatorRules = state.md.block.ruler.getRules("reference");
      const oldParentType = state.parentType;
      state.parentType = "reference";
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine2, endLine, true)) {
        terminate = true;
        break;
      }
      state.parentType = oldParentType;
      if (terminate) return null;
    }
    const pos2 = state.bMarks[nextLine2] + state.tShift[nextLine2];
    const max2 = state.eMarks[nextLine2];
    return state.src.slice(pos2, max2 + 1);
  }
  let str = state.src.slice(pos, max + 1);
  max = str.length;
  let labelEnd = -1;
  for (pos = 1; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 91) return false;
    else if (ch === 93) {
      labelEnd = pos;
      break;
    } else if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (ch === 92) {
      pos++;
      if (pos < max && str.charCodeAt(pos) === 10) {
        const lineContent = getNextLine(nextLine);
        if (lineContent !== null) {
          str += lineContent;
          max = str.length;
          nextLine++;
        }
      }
    }
  }
  if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58) return false;
  for (pos = labelEnd + 2; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (isSpace(ch)) {
    } else break;
  }
  const destRes = state.md.helpers.parseLinkDestination(str, pos, max);
  if (!destRes.ok) return false;
  const href = state.md.normalizeLink(destRes.str);
  if (!state.md.validateLink(href)) return false;
  pos = destRes.pos;
  const destEndPos = pos;
  const destEndLineNo = nextLine;
  const start = pos;
  for (; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (isSpace(ch)) {
    } else break;
  }
  let titleRes = state.md.helpers.parseLinkTitle(str, pos, max);
  while (titleRes.can_continue) {
    const lineContent = getNextLine(nextLine);
    if (lineContent === null) break;
    str += lineContent;
    pos = max;
    max = str.length;
    nextLine++;
    titleRes = state.md.helpers.parseLinkTitle(str, pos, max, titleRes);
  }
  let title;
  if (pos < max && start !== pos && titleRes.ok) {
    title = titleRes.str;
    pos = titleRes.pos;
  } else {
    title = "";
    pos = destEndPos;
    nextLine = destEndLineNo;
  }
  while (pos < max) {
    if (!isSpace(str.charCodeAt(pos))) break;
    pos++;
  }
  if (pos < max && str.charCodeAt(pos) !== 10) {
    if (title) {
      title = "";
      pos = destEndPos;
      nextLine = destEndLineNo;
      while (pos < max) {
        if (!isSpace(str.charCodeAt(pos))) break;
        pos++;
      }
    }
  }
  if (pos < max && str.charCodeAt(pos) !== 10) return false;
  const label = normalizeReference(str.slice(1, labelEnd));
  if (!label) return false;
  if (silent) return true;
  if (typeof state.env.references === "undefined") state.env.references = {};
  if (typeof state.env.references[label] === "undefined") state.env.references[label] = {
    title,
    href
  };
  const token = state.push("reference_definition", "", 0);
  token.map = [startLine, nextLine];
  token.hidden = true;
  const meta = /* @__PURE__ */ Object.create(null);
  meta.label = label;
  token.meta = meta;
  state.line = nextLine;
  return true;
}
var html_blocks_default = [
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul"
];
var open_tag = `<[A-Za-z][A-Za-z0-9\\-]*(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"'=<>\`\\x00-\\x20]+|'[^']*'|"[^"]*"))?)*\\s*\\/?>`;
var close_tag = "<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>";
var HTML_TAG_RE = new RegExp(`^(?:${open_tag}|${close_tag}|<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->|<[?][\\s\\S]*?[?]>|<![A-Za-z][^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)`);
var HTML_OPEN_CLOSE_TAG_RE = new RegExp(`^(?:${open_tag}|${close_tag})`);
var HTML_SEQUENCES = [
  [
    /^<(script|pre|style|textarea)(?=(\s|>|$))/i,
    /<\/(script|pre|style|textarea)>/i,
    true
  ],
  [
    /^<!--/,
    /-->/,
    true
  ],
  [
    /^<\?/,
    /\?>/,
    true
  ],
  [
    /^<![A-Za-z]/,
    />/,
    true
  ],
  [
    /^<!\[CDATA\[/,
    /\]\]>/,
    true
  ],
  [
    new RegExp(`^</?(${html_blocks_default.join("|")})(?=(\\s|/?>|$))`, "i"),
    /^$/,
    true
  ],
  [
    new RegExp(`${HTML_OPEN_CLOSE_TAG_RE.source}\\s*$`),
    /^$/,
    false
  ]
];
function html_block(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (!state.md.options.html) return false;
  if (state.src.charCodeAt(pos) !== 60) return false;
  let lineText = state.src.slice(pos, max);
  let i = 0;
  for (; i < HTML_SEQUENCES.length; i++) if (HTML_SEQUENCES[i][0].test(lineText)) break;
  if (i === HTML_SEQUENCES.length) return false;
  if (silent) return HTML_SEQUENCES[i][2];
  let nextLine = startLine + 1;
  const endsOnBlankLine = HTML_SEQUENCES[i][1].test("");
  if (!HTML_SEQUENCES[i][1].test(lineText)) for (; nextLine < endLine; nextLine++) {
    if (state.sCount[nextLine] < state.blkIndent) {
      if (endsOnBlankLine || !state.isEmpty(nextLine)) break;
    }
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    lineText = state.src.slice(pos, max);
    if (HTML_SEQUENCES[i][1].test(lineText)) {
      if (lineText.length !== 0) nextLine++;
      break;
    }
  }
  state.line = nextLine;
  const token = state.push("html_block", "", 0);
  token.map = [startLine, nextLine];
  token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
  return true;
}
function heading(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  let ch = state.src.charCodeAt(pos);
  if (ch !== 35 || pos >= max) return false;
  let level = 1;
  ch = state.src.charCodeAt(++pos);
  while (ch === 35 && pos < max && level <= 6) {
    level++;
    ch = state.src.charCodeAt(++pos);
  }
  if (level > 6 || pos < max && !isSpace(ch)) return false;
  if (silent) return true;
  max = state.skipSpacesBack(max, pos);
  const tmp = state.skipCharsBack(max, 35, pos);
  if (tmp > pos && isSpace(state.src.charCodeAt(tmp - 1))) max = tmp;
  state.line = startLine + 1;
  const token_o = state.push("heading_open", `h${level}`, 1);
  token_o.markup = "########".slice(0, level);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = asciiTrim(state.src.slice(pos, max));
  token_i.map = [startLine, state.line];
  token_i.children = [];
  const token_c = state.push("heading_close", `h${level}`, -1);
  token_c.markup = "########".slice(0, level);
  return true;
}
function lheading(state, startLine, endLine) {
  const terminatorRules = state.md.block.ruler.getRules("paragraph");
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const oldParentType = state.parentType;
  state.parentType = "paragraph";
  let level = 0;
  let marker;
  let nextLine = startLine + 1;
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    if (state.sCount[nextLine] - state.blkIndent > 3) continue;
    if (state.sCount[nextLine] >= state.blkIndent) {
      let pos = state.bMarks[nextLine] + state.tShift[nextLine];
      const max = state.eMarks[nextLine];
      if (pos < max) {
        marker = state.src.charCodeAt(pos);
        if (marker === 45 || marker === 61) {
          pos = state.skipChars(pos, marker);
          pos = state.skipSpaces(pos);
          if (pos >= max) {
            level = marker === 61 ? 1 : 2;
            break;
          }
        }
      }
    }
    if (state.sCount[nextLine] < 0) continue;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) break;
  }
  if (!level) {
    state.parentType = oldParentType;
    return false;
  }
  const content = asciiTrim(state.getLines(startLine, nextLine, state.blkIndent, false));
  state.line = nextLine + 1;
  const token_o = state.push("heading_open", `h${level}`, 1);
  token_o.markup = String.fromCharCode(marker);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = content;
  token_i.map = [startLine, state.line - 1];
  token_i.children = [];
  const token_c = state.push("heading_close", `h${level}`, -1);
  token_c.markup = String.fromCharCode(marker);
  state.parentType = oldParentType;
  return true;
}
function paragraph(state, startLine, endLine) {
  const terminatorRules = state.md.block.ruler.getRules("paragraph");
  const oldParentType = state.parentType;
  let nextLine = startLine + 1;
  state.parentType = "paragraph";
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    if (state.sCount[nextLine] - state.blkIndent > 3) continue;
    if (state.sCount[nextLine] < 0) continue;
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
      terminate = true;
      break;
    }
    if (terminate) break;
  }
  const content = asciiTrim(state.getLines(startLine, nextLine, state.blkIndent, false));
  state.line = nextLine;
  const token_o = state.push("paragraph_open", "p", 1);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = content;
  token_i.map = [startLine, state.line];
  token_i.children = [];
  state.push("paragraph_close", "p", -1);
  state.parentType = oldParentType;
  return true;
}
var _rules$1 = [
  [
    "table",
    table,
    ["paragraph", "reference"]
  ],
  ["code", code],
  [
    "fence",
    fence,
    [
      "paragraph",
      "reference",
      "blockquote",
      "list"
    ]
  ],
  [
    "blockquote",
    blockquote,
    [
      "paragraph",
      "reference",
      "blockquote",
      "list"
    ]
  ],
  [
    "hr",
    hr,
    [
      "paragraph",
      "reference",
      "blockquote",
      "list"
    ]
  ],
  [
    "list",
    list,
    [
      "paragraph",
      "reference",
      "blockquote"
    ]
  ],
  ["reference", reference],
  [
    "html_block",
    html_block,
    [
      "paragraph",
      "reference",
      "blockquote"
    ]
  ],
  [
    "heading",
    heading,
    [
      "paragraph",
      "reference",
      "blockquote"
    ]
  ],
  ["lheading", lheading],
  ["paragraph", paragraph]
];
var ParserBlock = class {
  constructor() {
    _defineProperty(
      this,
      /**
      * {@link Ruler} instance. Keep configuration of block rules.
      */
      "ruler",
      new Ruler()
    );
    _defineProperty(this, "State", StateBlock);
    for (let i = 0; i < _rules$1.length; i++) this.ruler.push(_rules$1[i][0], _rules$1[i][1], { alt: (_rules$1[i][2] || []).slice() });
  }
  tokenize(state, startLine, endLine) {
    const rules = this.ruler.getRules("");
    const len = rules.length;
    const maxNesting = state.md.options.maxNesting;
    let line = startLine;
    let hasEmptyLines = false;
    while (line < endLine) {
      state.line = line = state.skipEmptyLines(line);
      if (line >= endLine) break;
      if (state.sCount[line] < state.blkIndent) break;
      if (state.level >= maxNesting) {
        state.line = endLine;
        break;
      }
      const prevLine = state.line;
      let ok = false;
      for (let i = 0; i < len; i++) {
        ok = rules[i](state, line, endLine, false);
        if (ok) {
          if (prevLine >= state.line) throw new Error("block rule didn't increment state.line");
          break;
        }
      }
      if (!ok) throw new Error("none of the block rules matched");
      state.tight = !hasEmptyLines;
      if (state.isEmpty(state.line - 1)) hasEmptyLines = true;
      line = state.line;
      if (line < endLine && state.isEmpty(line)) {
        hasEmptyLines = true;
        line++;
        state.line = line;
      }
    }
  }
  /**
  * Process input string and push block tokens into `outTokens`
  */
  parse(src, md, env, outTokens) {
    if (!src) return;
    const state = new this.State(src, md, env, outTokens);
    this.tokenize(state, state.line, state.lineMax);
  }
};
var StateInline = class {
  constructor(src, md, env, outTokens) {
    _defineProperty(this, "pos", 0);
    _defineProperty(this, "level", 0);
    _defineProperty(this, "pending", "");
    _defineProperty(this, "pendingLevel", 0);
    _defineProperty(this, "cache", {});
    _defineProperty(this, "backticks", {});
    _defineProperty(this, "backticksScanned", false);
    _defineProperty(this, "linkLevel", 0);
    _defineProperty(this, "delimiters", []);
    _defineProperty(this, "_prev_delimiters", []);
    _defineProperty(this, "Token", Token);
    this.src = src;
    this.env = env;
    this.md = md;
    this.tokens = outTokens;
    this.tokens_meta = Array(outTokens.length);
    this.posMax = this.src.length;
  }
  pushPending() {
    const token = new Token("text", "", 0);
    token.content = this.pending;
    token.level = this.pendingLevel;
    this.tokens.push(token);
    this.pending = "";
    return token;
  }
  push(type, tag, nesting) {
    if (this.pending) this.pushPending();
    const token = new Token(type, tag, nesting);
    let token_meta = void 0;
    if (nesting < 0) {
      this.level--;
      this.delimiters = this._prev_delimiters.pop();
    }
    token.level = this.level;
    if (nesting > 0) {
      this.level++;
      this._prev_delimiters.push(this.delimiters);
      this.delimiters = [];
      token_meta = { delimiters: this.delimiters };
    }
    this.pendingLevel = this.level;
    this.tokens.push(token);
    this.tokens_meta.push(token_meta);
    return token;
  }
  scanDelims(start, canSplitWord) {
    const max = this.posMax;
    const marker = this.src.charCodeAt(start);
    let lastChar;
    if (start === 0) lastChar = 32;
    else if (start === 1) {
      lastChar = this.src.charCodeAt(0);
      if ((lastChar & 63488) === 55296) lastChar = 65533;
    } else {
      lastChar = this.src.charCodeAt(start - 1);
      if ((lastChar & 64512) === 56320) {
        const highSurr = this.src.charCodeAt(start - 2);
        lastChar = (highSurr & 64512) === 55296 ? 65536 + (highSurr - 55296 << 10) + (lastChar - 56320) : 65533;
      } else if ((lastChar & 64512) === 55296) lastChar = 65533;
    }
    let pos = start;
    while (pos < max && this.src.charCodeAt(pos) === marker) pos++;
    const count = pos - start;
    let nextChar = pos < max ? this.src.charCodeAt(pos) : 32;
    if ((nextChar & 64512) === 55296) {
      const lowSurr = this.src.charCodeAt(pos + 1);
      nextChar = (lowSurr & 64512) === 56320 ? 65536 + (nextChar - 55296 << 10) + (lowSurr - 56320) : 65533;
    } else if ((nextChar & 64512) === 56320) nextChar = 65533;
    const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctCharCode(lastChar);
    const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctCharCode(nextChar);
    const isLastWhiteSpace = isWhiteSpace(lastChar);
    const isNextWhiteSpace = isWhiteSpace(nextChar);
    const left_flanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
    const right_flanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);
    return {
      can_open: left_flanking && (canSplitWord || !right_flanking || isLastPunctChar),
      can_close: right_flanking && (canSplitWord || !left_flanking || isNextPunctChar),
      length: count
    };
  }
};
function isTerminatorChar(ch) {
  switch (ch) {
    case 10:
    case 33:
    case 35:
    case 36:
    case 37:
    case 38:
    case 42:
    case 43:
    case 45:
    case 58:
    case 60:
    case 61:
    case 62:
    case 64:
    case 91:
    case 92:
    case 93:
    case 94:
    case 95:
    case 96:
    case 123:
    case 125:
    case 126:
      return true;
    default:
      return false;
  }
}
function text2(state, silent) {
  let pos = state.pos;
  while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) pos++;
  if (pos === state.pos) return false;
  if (!silent) state.pending += state.src.slice(state.pos, pos);
  state.pos = pos;
  return true;
}
function isAsciiAlpha(code2) {
  return code2 >= 65 && code2 <= 90 || code2 >= 97 && code2 <= 122;
}
function isSchemeChar(code2) {
  return code2 >= 65 && code2 <= 90 || code2 >= 97 && code2 <= 122 || code2 >= 48 && code2 <= 57 || code2 === 43 || code2 === 45 || code2 === 46;
}
function linkify(state, silent) {
  if (!state.md.options.linkify) return false;
  if (state.linkLevel > 0) return false;
  const pos = state.pos;
  const max = state.posMax;
  if (pos + 3 > max) return false;
  if (state.src.charCodeAt(pos) !== 58) return false;
  if (state.src.charCodeAt(pos + 1) !== 47) return false;
  if (state.src.charCodeAt(pos + 2) !== 47) return false;
  const protoMin = pos - Math.min(10, state.pending.length, pos);
  let protoStart = pos;
  while (protoStart > protoMin && isSchemeChar(state.src.charCodeAt(protoStart - 1))) protoStart--;
  if (protoStart === pos || !isAsciiAlpha(state.src.charCodeAt(protoStart))) return false;
  const protoLength = pos - protoStart;
  const link2 = state.md.linkify.matchAtStart(state.src.slice(protoStart));
  if (!link2) return false;
  let url = link2.url;
  if (url.length <= protoLength) return false;
  let urlEnd = url.length;
  while (urlEnd > 0 && url.charCodeAt(urlEnd - 1) === 42) urlEnd--;
  if (urlEnd !== url.length) url = url.slice(0, urlEnd);
  const fullUrl = state.md.normalizeLink(url);
  if (!state.md.validateLink(fullUrl)) return false;
  if (!silent) {
    state.pending = state.pending.slice(0, -protoLength);
    const token_o = state.push("link_open", "a", 1);
    token_o.attrs = [["href", fullUrl]];
    token_o.markup = "linkify";
    token_o.info = "auto";
    const token_t = state.push("text", "", 0);
    token_t.content = state.md.normalizeLinkText(url);
    const token_c = state.push("link_close", "a", -1);
    token_c.markup = "linkify";
    token_c.info = "auto";
  }
  state.pos += url.length - protoLength;
  return true;
}
function newline(state, silent) {
  let pos = state.pos;
  if (state.src.charCodeAt(pos) !== 10) return false;
  const pmax = state.pending.length - 1;
  const max = state.posMax;
  if (!silent) if (pmax >= 0 && state.pending.charCodeAt(pmax) === 32) if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 32) {
    let ws = pmax - 1;
    while (ws >= 1 && state.pending.charCodeAt(ws - 1) === 32) ws--;
    state.pending = state.pending.slice(0, ws);
    state.push("hardbreak", "br", 0);
  } else {
    state.pending = state.pending.slice(0, -1);
    state.push("softbreak", "br", 0);
  }
  else state.push("softbreak", "br", 0);
  pos++;
  while (pos < max && isSpace(state.src.charCodeAt(pos))) pos++;
  state.pos = pos;
  return true;
}
var ESCAPED = [];
for (let i = 0; i < 256; i++) ESCAPED.push(0);
"\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-".split("").forEach(function(ch) {
  ESCAPED[ch.charCodeAt(0)] = 1;
});
function escape(state, silent) {
  let pos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(pos) !== 92) return false;
  pos++;
  if (pos >= max) return false;
  let ch1 = state.src.charCodeAt(pos);
  if (ch1 === 10) {
    if (!silent) state.push("hardbreak", "br", 0);
    pos++;
    while (pos < max) {
      ch1 = state.src.charCodeAt(pos);
      if (!isSpace(ch1)) break;
      pos++;
    }
    state.pos = pos;
    return true;
  }
  if (ch1 === 32) {
    if (!silent) {
      const token = state.push("text_special", "", 0);
      token.content = "\\";
      token.markup = "\\";
      token.info = "escape";
    }
    state.pos = pos;
    return true;
  }
  let escapedStr = state.src[pos];
  if (ch1 >= 55296 && ch1 <= 56319 && pos + 1 < max) {
    const ch2 = state.src.charCodeAt(pos + 1);
    if (ch2 >= 56320 && ch2 <= 57343) {
      escapedStr += state.src[pos + 1];
      pos++;
    }
  }
  const origStr = "\\" + escapedStr;
  if (!silent) {
    const token = state.push("text_special", "", 0);
    if (ch1 < 256 && ESCAPED[ch1] !== 0) token.content = escapedStr;
    else token.content = origStr;
    token.markup = origStr;
    token.info = "escape";
  }
  state.pos = pos + 1;
  return true;
}
function buildLastRuns(src) {
  const lastRuns = {};
  let pos = 0;
  while ((pos = src.indexOf("`", pos)) !== -1) {
    const start = pos;
    while (src.charCodeAt(++pos) === 96) ;
    lastRuns[pos - start] = start;
  }
  return lastRuns;
}
function backtick(state, silent) {
  var _state$backticks$open;
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 96) return false;
  const max = state.posMax;
  let pos = start + 1;
  while (pos < max && state.src.charCodeAt(pos) === 96) pos++;
  const marker = state.src.slice(start, pos);
  const openerLength = marker.length;
  if (!state.backticksScanned) {
    state.backticks = buildLastRuns(state.src);
    state.backticksScanned = true;
  }
  if (((_state$backticks$open = state.backticks[openerLength]) !== null && _state$backticks$open !== void 0 ? _state$backticks$open : -1) >= pos) {
    let matchEnd = pos;
    let matchStart;
    while ((matchStart = state.src.indexOf("`", matchEnd)) !== -1 && matchStart < max) {
      matchEnd = matchStart + 1;
      while (state.src.charCodeAt(matchEnd) === 96) matchEnd++;
      if (matchEnd > max) break;
      if (matchEnd - matchStart === openerLength) {
        if (!silent) {
          const token = state.push("code_inline", "code", 0);
          token.markup = marker;
          let content = state.src.slice(pos, matchStart).replace(/\n/g, " ");
          if (content.startsWith(" ") && content.endsWith(" ") && /[^ ]/.test(content)) content = content.slice(1, -1);
          token.content = content;
        }
        state.pos = matchEnd;
        return true;
      }
    }
  }
  if (!silent) state.pending += marker;
  state.pos = pos;
  return true;
}
function strikethrough_tokenize(state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);
  if (silent) return false;
  if (marker !== 126) return false;
  const scanned = state.scanDelims(state.pos, true);
  let len = scanned.length;
  const ch = String.fromCharCode(marker);
  if (len < 2) return false;
  let token;
  if (len % 2) {
    token = state.push("text", "", 0);
    token.content = ch;
    len--;
  }
  for (let i = 0; i < len; i += 2) {
    token = state.push("text", "", 0);
    token.content = ch + ch;
    state.delimiters.push({
      marker,
      length: 0,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close
    });
  }
  state.pos += scanned.length;
  return true;
}
function postProcess$1(state, delimiters) {
  let token;
  const loneMarkers = [];
  const max = delimiters.length;
  for (let i = 0; i < max; i++) {
    const startDelim = delimiters[i];
    if (startDelim.marker !== 126) continue;
    if (startDelim.end === -1) continue;
    const endDelim = delimiters[startDelim.end];
    token = state.tokens[startDelim.token];
    token.type = "s_open";
    token.tag = "s";
    token.nesting = 1;
    token.markup = "~~";
    token.content = "";
    token = state.tokens[endDelim.token];
    token.type = "s_close";
    token.tag = "s";
    token.nesting = -1;
    token.markup = "~~";
    token.content = "";
    if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "~") loneMarkers.push(endDelim.token - 1);
  }
  while (loneMarkers.length) {
    const i = loneMarkers.pop();
    let j = i + 1;
    while (j < state.tokens.length && state.tokens[j].type === "s_close") j++;
    j--;
    if (i !== j) {
      token = state.tokens[j];
      state.tokens[j] = state.tokens[i];
      state.tokens[i] = token;
    }
  }
}
function strikethrough_postProcess(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  postProcess$1(state, state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    var _tokens_meta$curr;
    const delimiters = (_tokens_meta$curr = tokens_meta[curr]) === null || _tokens_meta$curr === void 0 ? void 0 : _tokens_meta$curr.delimiters;
    if (delimiters) postProcess$1(state, delimiters);
  }
}
var strikethrough_default = {
  tokenize: strikethrough_tokenize,
  postProcess: strikethrough_postProcess
};
function emphasis_tokenize(state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);
  if (silent) return false;
  if (marker !== 95 && marker !== 42) return false;
  const scanned = state.scanDelims(state.pos, marker === 42);
  for (let i = 0; i < scanned.length; i++) {
    const token = state.push("text", "", 0);
    token.content = String.fromCharCode(marker);
    state.delimiters.push({
      marker,
      length: scanned.length,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close
    });
  }
  state.pos += scanned.length;
  return true;
}
function postProcess(state, delimiters) {
  const max = delimiters.length;
  for (let i = max - 1; i >= 0; i--) {
    const startDelim = delimiters[i];
    if (startDelim.marker !== 95 && startDelim.marker !== 42) continue;
    if (startDelim.end === -1) continue;
    const endDelim = delimiters[startDelim.end];
    const isStrong = i > 0 && delimiters[i - 1].end === startDelim.end + 1 && delimiters[i - 1].marker === startDelim.marker && delimiters[i - 1].token === startDelim.token - 1 && delimiters[startDelim.end + 1].token === endDelim.token + 1;
    const ch = String.fromCharCode(startDelim.marker);
    const token_o = state.tokens[startDelim.token];
    token_o.type = isStrong ? "strong_open" : "em_open";
    token_o.tag = isStrong ? "strong" : "em";
    token_o.nesting = 1;
    token_o.markup = isStrong ? ch + ch : ch;
    token_o.content = "";
    const token_c = state.tokens[endDelim.token];
    token_c.type = isStrong ? "strong_close" : "em_close";
    token_c.tag = isStrong ? "strong" : "em";
    token_c.nesting = -1;
    token_c.markup = isStrong ? ch + ch : ch;
    token_c.content = "";
    if (isStrong) {
      state.tokens[delimiters[i - 1].token].content = "";
      state.tokens[delimiters[startDelim.end + 1].token].content = "";
      i--;
    }
  }
}
function emphasis_post_process(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  postProcess(state, state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    var _tokens_meta$curr;
    const delimiters = (_tokens_meta$curr = tokens_meta[curr]) === null || _tokens_meta$curr === void 0 ? void 0 : _tokens_meta$curr.delimiters;
    if (delimiters) postProcess(state, delimiters);
  }
}
var emphasis_default = {
  tokenize: emphasis_tokenize,
  postProcess: emphasis_post_process
};
function link(state, silent) {
  let code2, label, res, ref;
  let href = "";
  let title = "";
  let start = state.pos;
  let parseReference = true;
  if (state.src.charCodeAt(state.pos) !== 91) return false;
  const oldPos = state.pos;
  const max = state.posMax;
  const labelStart = state.pos + 1;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
  if (labelEnd < 0) return false;
  let pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 40) {
    parseReference = false;
    pos++;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (!isSpace(code2) && code2 !== 10) break;
    }
    if (pos >= max) return false;
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) pos = res.pos;
      else href = "";
      start = pos;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (!isSpace(code2) && code2 !== 10) break;
      }
      res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
        for (; pos < max; pos++) {
          code2 = state.src.charCodeAt(pos);
          if (!isSpace(code2) && code2 !== 10) break;
        }
      }
    }
    if (pos >= max || state.src.charCodeAt(pos) !== 41) parseReference = true;
    pos++;
  }
  if (parseReference) {
    if (typeof state.env.references === "undefined") return false;
    if (pos < max && state.src.charCodeAt(pos) === 91) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) label = state.src.slice(start, pos++);
      else pos = labelEnd + 1;
    } else pos = labelEnd + 1;
    if (!label) label = state.src.slice(labelStart, labelEnd);
    label = normalizeReference(label);
    ref = state.env.references[label];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }
  if (!silent) {
    state.pos = labelStart;
    state.posMax = labelEnd;
    const token_o = state.push("link_open", "a", 1);
    const attrs = [["href", href]];
    token_o.attrs = attrs;
    if (title) attrs.push(["title", title]);
    if (label) {
      const meta = /* @__PURE__ */ Object.create(null);
      meta.label = label;
      token_o.meta = meta;
    }
    state.linkLevel++;
    state.md.inline.tokenize(state);
    state.linkLevel--;
    state.push("link_close", "a", -1);
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}
function image(state, silent) {
  let code2, content, label, pos, ref, res, title, start;
  let href = "";
  const oldPos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(state.pos) !== 33) return false;
  if (state.src.charCodeAt(state.pos + 1) !== 91) return false;
  const labelStart = state.pos + 2;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
  if (labelEnd < 0) return false;
  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 40) {
    pos++;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (!isSpace(code2) && code2 !== 10) break;
    }
    if (pos >= max) return false;
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) pos = res.pos;
      else href = "";
    }
    start = pos;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (!isSpace(code2) && code2 !== 10) break;
    }
    res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
    if (pos < max && start !== pos && res.ok) {
      title = res.str;
      pos = res.pos;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (!isSpace(code2) && code2 !== 10) break;
      }
    } else title = "";
    if (pos >= max || state.src.charCodeAt(pos) !== 41) {
      state.pos = oldPos;
      return false;
    }
    pos++;
  } else {
    if (typeof state.env.references === "undefined") return false;
    if (pos < max && state.src.charCodeAt(pos) === 91) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) label = state.src.slice(start, pos++);
      else pos = labelEnd + 1;
    } else pos = labelEnd + 1;
    if (!label) label = state.src.slice(labelStart, labelEnd);
    label = normalizeReference(label);
    ref = state.env.references[label];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }
  if (!silent) {
    content = state.src.slice(labelStart, labelEnd);
    const tokens = [];
    state.md.inline.parse(content, state.md, state.env, tokens);
    const token = state.push("image", "img", 0);
    const attrs = [["src", href], ["alt", ""]];
    token.attrs = attrs;
    token.children = tokens;
    token.content = content;
    if (title) attrs.push(["title", title]);
    if (label) {
      const meta = /* @__PURE__ */ Object.create(null);
      meta.label = label;
      token.meta = meta;
    }
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}
var EMAIL_RE = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
var AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;
function autolink(state, silent) {
  let pos = state.pos;
  if (state.src.charCodeAt(pos) !== 60) return false;
  const start = state.pos;
  const max = state.posMax;
  for (; ; ) {
    if (++pos >= max) return false;
    const ch = state.src.charCodeAt(pos);
    if (ch === 60) return false;
    if (ch === 62) break;
  }
  const url = state.src.slice(start + 1, pos);
  if (AUTOLINK_RE.test(url)) {
    const fullUrl = state.md.normalizeLink(url);
    if (!state.md.validateLink(fullUrl)) return false;
    if (!silent) {
      const token_o = state.push("link_open", "a", 1);
      token_o.attrs = [["href", fullUrl]];
      token_o.markup = "autolink";
      token_o.info = "auto";
      const token_t = state.push("text", "", 0);
      token_t.content = state.md.normalizeLinkText(url);
      const token_c = state.push("link_close", "a", -1);
      token_c.markup = "autolink";
      token_c.info = "auto";
    }
    state.pos += url.length + 2;
    return true;
  }
  if (EMAIL_RE.test(url)) {
    const fullUrl = state.md.normalizeLink(`mailto:${url}`);
    if (!state.md.validateLink(fullUrl)) return false;
    if (!silent) {
      const token_o = state.push("link_open", "a", 1);
      token_o.attrs = [["href", fullUrl]];
      token_o.markup = "autolink";
      token_o.info = "auto";
      const token_t = state.push("text", "", 0);
      token_t.content = state.md.normalizeLinkText(url);
      const token_c = state.push("link_close", "a", -1);
      token_c.markup = "autolink";
      token_c.info = "auto";
    }
    state.pos += url.length + 2;
    return true;
  }
  return false;
}
function isLinkOpen(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
  return /^<\/a\s*>/i.test(str);
}
function isLetter(ch) {
  const lc = ch | 32;
  return lc >= 97 && lc <= 122;
}
function html_inline(state, silent) {
  if (!state.md.options.html) return false;
  const max = state.posMax;
  const pos = state.pos;
  if (state.src.charCodeAt(pos) !== 60 || pos + 2 >= max) return false;
  const ch = state.src.charCodeAt(pos + 1);
  if (ch !== 33 && ch !== 63 && ch !== 47 && !isLetter(ch)) return false;
  const match = state.src.slice(pos).match(HTML_TAG_RE);
  if (!match) return false;
  if (!silent) {
    const token = state.push("html_inline", "", 0);
    token.content = match[0];
    if (isLinkOpen(token.content)) state.linkLevel++;
    if (isLinkClose(token.content)) state.linkLevel--;
  }
  state.pos += match[0].length;
  return true;
}
var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
var NAMED_RE = /^&([a-z][a-z0-9]{1,31});/i;
function entity(state, silent) {
  const pos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(pos) !== 38) return false;
  if (pos + 1 >= max) return false;
  if (state.src.charCodeAt(pos + 1) === 35) {
    const match = state.src.slice(pos).match(DIGITAL_RE);
    if (match) {
      if (!silent) {
        const code2 = match[1][0].toLowerCase() === "x" ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);
        const token = state.push("text_special", "", 0);
        token.content = isValidEntityCode(code2) ? fromCodePoint(code2) : fromCodePoint(65533);
        token.markup = match[0];
        token.info = "entity";
      }
      state.pos += match[0].length;
      return true;
    }
  } else {
    const match = state.src.slice(pos).match(NAMED_RE);
    if (match) {
      const decoded = decodeHTMLStrict(match[0]);
      if (decoded !== match[0]) {
        if (!silent) {
          const token = state.push("text_special", "", 0);
          token.content = decoded;
          token.markup = match[0];
          token.info = "entity";
        }
        state.pos += match[0].length;
        return true;
      }
    }
  }
  return false;
}
function processDelimiters(delimiters) {
  const openersBottom = {};
  const max = delimiters.length;
  if (!max) return;
  let headerIdx = 0;
  let lastTokenIdx = -2;
  const jumps = [];
  for (let closerIdx = 0; closerIdx < max; closerIdx++) {
    const closer = delimiters[closerIdx];
    jumps.push(0);
    if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) headerIdx = closerIdx;
    lastTokenIdx = closer.token;
    closer.length = closer.length || 0;
    if (!closer.close) continue;
    if (!openersBottom.hasOwnProperty(closer.marker)) openersBottom[closer.marker] = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + closer.length % 3];
    let openerIdx = headerIdx - jumps[headerIdx] - 1;
    let newMinOpenerIdx = openerIdx;
    for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
      const opener = delimiters[openerIdx];
      if (opener.marker !== closer.marker) continue;
      if (opener.open && opener.end < 0) {
        let isOddMatch = false;
        if (opener.close || closer.open) {
          if ((opener.length + closer.length) % 3 === 0) {
            if (opener.length % 3 !== 0 || closer.length % 3 !== 0) isOddMatch = true;
          }
        }
        if (!isOddMatch) {
          const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
          jumps[closerIdx] = closerIdx - openerIdx + lastJump;
          jumps[openerIdx] = lastJump;
          closer.open = false;
          opener.end = closerIdx;
          opener.close = false;
          newMinOpenerIdx = -1;
          lastTokenIdx = -2;
          break;
        }
      }
    }
    if (newMinOpenerIdx !== -1) openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length || 0) % 3] = newMinOpenerIdx;
  }
}
function link_pairs(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  processDelimiters(state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    var _tokens_meta$curr;
    const delimiters = (_tokens_meta$curr = tokens_meta[curr]) === null || _tokens_meta$curr === void 0 ? void 0 : _tokens_meta$curr.delimiters;
    if (delimiters) processDelimiters(delimiters);
  }
}
function fragments_join(state) {
  let curr, last;
  let level = 0;
  const tokens = state.tokens;
  const max = state.tokens.length;
  for (curr = last = 0; curr < max; curr++) {
    if (tokens[curr].nesting < 0) level--;
    tokens[curr].level = level;
    if (tokens[curr].nesting > 0) level++;
    if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
    else {
      if (curr !== last) tokens[last] = tokens[curr];
      last++;
    }
  }
  if (curr !== last) tokens.length = last;
}
var _rules = [
  ["text", text2],
  ["linkify", linkify],
  ["newline", newline],
  ["escape", escape],
  ["backticks", backtick],
  ["strikethrough", strikethrough_default.tokenize],
  ["emphasis", emphasis_default.tokenize],
  ["link", link],
  ["image", image],
  ["autolink", autolink],
  ["html_inline", html_inline],
  ["entity", entity]
];
var _rules2 = [
  ["balance_pairs", link_pairs],
  ["strikethrough", strikethrough_default.postProcess],
  ["emphasis", emphasis_default.postProcess],
  ["fragments_join", fragments_join]
];
var ParserInline = class {
  constructor() {
    _defineProperty(
      this,
      /**
      * {@link Ruler} instance. Keep configuration of inline rules.
      */
      "ruler",
      new Ruler()
    );
    _defineProperty(
      this,
      /**
      * {@link Ruler} instance. Second ruler used for post-processing
      * (e.g. in emphasis-like rules).
      */
      "ruler2",
      new Ruler()
    );
    _defineProperty(this, "State", StateInline);
    for (let i = 0; i < _rules.length; i++) this.ruler.push(_rules[i][0], _rules[i][1]);
    for (let i = 0; i < _rules2.length; i++) this.ruler2.push(_rules2[i][0], _rules2[i][1]);
  }
  skipToken(state) {
    const pos = state.pos;
    const rules = this.ruler.getRules("");
    const len = rules.length;
    const maxNesting = state.md.options.maxNesting;
    const cache = state.cache;
    if (typeof cache[pos] !== "undefined") {
      state.pos = cache[pos];
      return;
    }
    let ok = false;
    if (state.level < maxNesting) for (let i = 0; i < len; i++) {
      state.level++;
      ok = rules[i](state, true);
      state.level--;
      if (ok) {
        if (pos >= state.pos) throw new Error("inline rule didn't increment state.pos");
        break;
      }
    }
    else state.pos = state.posMax;
    if (!ok) state.pos++;
    cache[pos] = state.pos;
  }
  tokenize(state) {
    const rules = this.ruler.getRules("");
    const len = rules.length;
    const end = state.posMax;
    const maxNesting = state.md.options.maxNesting;
    while (state.pos < end) {
      const prevPos = state.pos;
      let ok = false;
      if (state.level < maxNesting) for (let i = 0; i < len; i++) {
        ok = rules[i](state, false);
        if (ok) {
          if (prevPos >= state.pos) throw new Error("inline rule didn't increment state.pos");
          break;
        }
      }
      if (ok) {
        if (state.pos >= end) break;
        continue;
      }
      state.pending += state.src[state.pos++];
    }
    if (state.pending) state.pushPending();
  }
  /**
  * Process input string and push inline tokens into `outTokens`
  */
  parse(str, md, env, outTokens) {
    const state = new this.State(str, md, env, outTokens);
    this.tokenize(state);
    const rules = this.ruler2.getRules("");
    const len = rules.length;
    for (let i = 0; i < len; i++) rules[i](state);
  }
};
var config = {
  default: {
    options: {
      html: false,
      xhtmlOut: false,
      breaks: false,
      langPrefix: "language-",
      linkify: false,
      typographer: false,
      quotes: "\u201C\u201D\u2018\u2019",
      highlight: null,
      maxNesting: 100
    },
    components: {
      core: {},
      block: {},
      inline: {}
    }
  },
  zero: {
    options: {
      html: false,
      xhtmlOut: false,
      breaks: false,
      langPrefix: "language-",
      linkify: false,
      typographer: false,
      quotes: "\u201C\u201D\u2018\u2019",
      highlight: null,
      maxNesting: 20
    },
    components: {
      core: { rules: [
        "normalize",
        "block",
        "strip_references",
        "inline",
        "text_join"
      ] },
      block: { rules: ["paragraph"] },
      inline: {
        rules: ["text"],
        rules2: ["balance_pairs", "fragments_join"]
      }
    }
  },
  commonmark: {
    options: {
      html: true,
      xhtmlOut: true,
      breaks: false,
      langPrefix: "language-",
      linkify: false,
      typographer: false,
      quotes: "\u201C\u201D\u2018\u2019",
      highlight: null,
      maxNesting: 20
    },
    components: {
      core: { rules: [
        "normalize",
        "block",
        "strip_references",
        "inline",
        "text_join"
      ] },
      block: { rules: [
        "blockquote",
        "code",
        "fence",
        "heading",
        "hr",
        "html_block",
        "lheading",
        "list",
        "reference",
        "paragraph"
      ] },
      inline: {
        rules: [
          "autolink",
          "backticks",
          "emphasis",
          "entity",
          "escape",
          "html_inline",
          "image",
          "link",
          "newline",
          "text"
        ],
        rules2: [
          "balance_pairs",
          "emphasis",
          "fragments_join"
        ]
      }
    }
  }
};
var BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
var GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;
var RECODE_HOSTNAME_FOR = [
  "http:",
  "https:",
  "mailto:"
];
var MarkdownIt = class {
  /**
  * Link validation function. CommonMark allows too much in links. By default
  * we disable `javascript:`, `vbscript:`, `file:` schemas, and almost all `data:...` schemas
  * except some embedded image types.
  *
  * You can change this behaviour:
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * const md = new MarkdownIt()
  *
  * // enable everything
  * md.validateLink = function () { return true; }
  * ```
  */
  validateLink(url) {
    const str = url.trim().toLowerCase();
    return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true;
  }
  /**
  * Function used to encode link url to a machine-readable format,
  * which includes url-encoding, punycode, etc.
  */
  normalizeLink(url) {
    const parsed = parse_default(url, true);
    if (parsed.hostname) {
      if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) try {
        parsed.hostname = import_punycode.default.toASCII(parsed.hostname);
      } catch (er) {
      }
    }
    if (parsed.auth) parsed.auth = encode_default(parsed.auth);
    if (parsed.hostname) parsed.hostname = encode_default(parsed.hostname);
    if (parsed.pathname) parsed.pathname = encode_default(parsed.pathname);
    if (parsed.search) parsed.search = encode_default(parsed.search);
    if (parsed.hash) parsed.hash = encode_default(parsed.hash);
    return format(parsed);
  }
  /**
  * Function used to decode link url to a human-readable format`
  */
  normalizeLinkText(url) {
    const parsed = parse_default(url, true);
    if (parsed.hostname) {
      if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) try {
        parsed.hostname = import_punycode.default.toUnicode(parsed.hostname);
      } catch (er) {
      }
    }
    return decode_default(format(parsed), decode_default.defaultChars + "%");
  }
  constructor(...args) {
    _defineProperty(
      this,
      /**
      * Instance of {@link ParserInline}. You may need it to add new rules when
      * writing plugins. For simple rules control use {@link MarkdownIt.disable}
      * and {@link MarkdownIt.enable}.
      */
      "inline",
      new ParserInline()
    );
    _defineProperty(
      this,
      /**
      * Instance of {@link ParserBlock}. You may need it to add new rules when
      * writing plugins. For simple rules control use {@link MarkdownIt.disable}
      * and {@link MarkdownIt.enable}.
      */
      "block",
      new ParserBlock()
    );
    _defineProperty(
      this,
      /**
      * Instance of {@link ParserCore} chain executor. You may need it to add new
      * rules when writing plugins. For simple rules control use
      * {@link MarkdownIt.disable} and {@link MarkdownIt.enable}.
      */
      "core",
      new ParserCore()
    );
    _defineProperty(
      this,
      /**
      * Instance of {@link Renderer}. Use it to modify output look. Or to add rendering
      * rules for new token types, generated by plugins.
      *
      * See {@link Renderer} docs and
      * [source code](https://github.com/markdown-it/markdown-it/blob/master/src/renderer.ts).
      *
      * @example
      * ```javascript
      * import MarkdownIt from 'markdown-it'
      * const md = new MarkdownIt()
      *
      * function myToken(tokens, idx, options, env, self) {
      *   //...
      *   return result;
      * };
      *
      * md.renderer.rules['my_token'] = myToken
      * ```
      */
      "renderer",
      new Renderer()
    );
    _defineProperty(
      this,
      /**
      * [linkify-it](https://github.com/markdown-it/linkify-it) instance.
      * Used by [linkify](https://github.com/markdown-it/markdown-it/blob/master/src/rules_core/linkify.ts)
      * rule.
      */
      "linkify",
      new LinkifyIt()
    );
    _defineProperty(
      this,
      /**
      * Assorted utility functions, useful to write plugins. See details
      * [here](https://github.com/markdown-it/markdown-it/blob/master/src/common/utils.ts).
      */
      "utils",
      utils_exports
    );
    _defineProperty(
      this,
      /**
      * Link components parser functions, useful to write plugins. See details
      * [here](https://github.com/markdown-it/markdown-it/blob/master/src/helpers).
      */
      "helpers",
      Object.assign({}, helpers_exports)
    );
    const [presetNameOrOptions, options] = args;
    if (typeof presetNameOrOptions === "string") {
      this.configure(presetNameOrOptions);
      if (options) this.set(options);
    } else {
      this.configure("default");
      this.set(presetNameOrOptions || {});
    }
  }
  /**
  * Set parser options (in the same format as in constructor). Probably, you
  * will never need it, but you can change options after constructor call.
  *
  * __Note:__ To achieve the best possible performance, don't modify a
  * `markdown-it` instance options on the fly. If you need multiple configurations
  * it's best to create multiple instances and initialize each with separate
  * config.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  *
  * const md = new MarkdownIt()
  *   .set({ html: true, breaks: true })
  *   .set({ typographer: true })
  * ```
  */
  set(options) {
    Object.assign(this.options, options);
    return this;
  }
  /**
  * Batch load of all options and compenent settings. This is internal method,
  * and you probably will not need it. But if you will - see available presets
  * and data structure [here](https://github.com/markdown-it/markdown-it/tree/master/src/presets)
  *
  * We strongly recommend to use presets instead of direct config loads. That
  * will give better compatibility with next versions.
  */
  configure(presets) {
    let p;
    if (typeof presets === "string") {
      const presetName = presets;
      p = config[presetName];
      if (!p) throw new Error(`Wrong 'markdown-it' preset "${presetName}", check name`);
    } else p = presets;
    if (!p) throw new Error("Wrong `markdown-it` preset, can't be empty");
    if (p.options) this.options = { ...p.options };
    const components = p.components;
    if (components) {
      var _components$inline;
      [
        "core",
        "block",
        "inline"
      ].forEach((name) => {
        var _components$name;
        const rules = (_components$name = components[name]) === null || _components$name === void 0 ? void 0 : _components$name.rules;
        if (rules) this[name].ruler.enableOnly(rules);
      });
      const rules2 = (_components$inline = components.inline) === null || _components$inline === void 0 ? void 0 : _components$inline.rules2;
      if (rules2) this.inline.ruler2.enableOnly(rules2);
    }
    return this;
  }
  /**
  * Enable list or rules. It will automatically find appropriate components,
  * containing rules with given names. If rule not found, and `ignoreInvalid`
  * not set - throws exception.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  *
  * const md = new MarkdownIt()
  *   .enable(['sub', 'sup'])
  *   .disable('smartquotes')
  * ```
  */
  enable(list2, ignoreInvalid = false) {
    let result = [];
    if (!Array.isArray(list2)) list2 = [list2];
    [
      "core",
      "block",
      "inline"
    ].forEach((chain) => {
      result = result.concat(this[chain].ruler.enable(list2, true));
    });
    result = result.concat(this.inline.ruler2.enable(list2, true));
    const missed = list2.filter((name) => result.indexOf(name) < 0);
    if (missed.length && !ignoreInvalid) throw new Error(`MarkdownIt. Failed to enable unknown rule(s): ${missed}`);
    return this;
  }
  /**
  * The same as {@link MarkdownIt.enable}, but turn specified rules off.
  */
  disable(list2, ignoreInvalid = false) {
    let result = [];
    if (!Array.isArray(list2)) list2 = [list2];
    [
      "core",
      "block",
      "inline"
    ].forEach((chain) => {
      result = result.concat(this[chain].ruler.disable(list2, true));
    });
    result = result.concat(this.inline.ruler2.disable(list2, true));
    const missed = list2.filter((name) => result.indexOf(name) < 0);
    if (missed.length && !ignoreInvalid) throw new Error(`MarkdownIt. Failed to disable unknown rule(s): ${missed}`);
    return this;
  }
  /**
  * Load specified plugin with given params into current parser instance.
  * It's just a sugar to call `plugin(md, params)` with curring.
  *
  * @example
  * ```javascript
  * import MarkdownIt from 'markdown-it'
  * import iterator from 'markdown-it-for-inline'
  *
  * const md = new MarkdownIt()
  *   .use(iterator, 'foo_replace', 'text', function (tokens, idx) {
  *     tokens[idx].content = tokens[idx].content.replace(/foo/g, 'bar')
  *   })
  * ```
  */
  use(plugin, ...params) {
    plugin.apply(plugin, [this, ...params]);
    return this;
  }
  /**
  * Parse input string and return list of block tokens (special token type
  * "inline" will contain list of inline tokens). You should not call this
  * method directly, until you write custom renderer (for example, to produce
  * AST).
  *
  * `env` is used to pass data between "distributed" rules and return additional
  * metadata like reference info, needed for the renderer. It also can be used to
  * inject data in specific cases. Usually, you will be ok to pass `{}`,
  * and then pass updated object to renderer.
  */
  parse(src, env) {
    if (typeof src !== "string") throw new Error("Input data should be a String");
    const state = new this.core.State(src, this, env);
    this.core.process(state);
    return state.tokens;
  }
  /**
  * Render markdown string into html. It does all magic for you :).
  *
  * `env` can be used to inject additional metadata (`{}` by default).
  * But you will not need it with high probability. See also comment
  * in {@link MarkdownIt.parse}.
  */
  render(src, env = {}) {
    return this.renderer.render(this.parse(src, env), this.options, env);
  }
  /**
  * The same as {@link MarkdownIt.parse} but skip all block rules. It returns
  * the block tokens list with the single `inline` element, containing parsed
  * inline tokens in `children` property. Also updates `env` object.
  */
  parseInline(src, env) {
    const state = new this.core.State(src, this, env);
    state.inlineMode = true;
    this.core.process(state);
    return state.tokens;
  }
  /**
  * Similar to {@link MarkdownIt.render} but for single paragraph content.
  * Result will NOT be wrapped into `<p>` tags.
  */
  renderInline(src, env = {}) {
    return this.renderer.render(this.parseInline(src, env), this.options, env);
  }
};
_defineProperty(MarkdownIt, "Token", Token);
_defineProperty(MarkdownIt, "Ruler", Ruler);
_defineProperty(MarkdownIt, "Renderer", Renderer);
_defineProperty(MarkdownIt, "ParserCore", ParserCore);
_defineProperty(MarkdownIt, "StateCore", StateCore);
_defineProperty(MarkdownIt, "ParserBlock", ParserBlock);
_defineProperty(MarkdownIt, "StateBlock", StateBlock);
_defineProperty(MarkdownIt, "ParserInline", ParserInline);
_defineProperty(MarkdownIt, "StateInline", StateInline);
var MarkdownItCallable = callable(MarkdownIt);

// src/repository-reader.ts
var import_promises = require("fs/promises");
var path6 = __toESM(require("path"));
var import_util = require("util");
var MAX_REPOSITORY_MARKDOWN_BYTES = 2 * 1024 * 1024;
function checkCancelled(signal) {
  if (signal == null ? void 0 : signal.aborted) {
    const error = new Error("\u8BFB\u53D6\u5DF2\u53D6\u6D88");
    error.name = "AbortError";
    throw error;
  }
}
async function readRepositoryMarkdown(absolutePath, signal) {
  checkCancelled(signal);
  if (!path6.isAbsolute(absolutePath) || path6.extname(absolutePath).toLowerCase() !== ".md") throw new Error("\u8BF7\u9009\u62E9\u51C6\u786E\u7684\u7EDD\u5BF9 Markdown \u6587\u4EF6\u8DEF\u5F84");
  const initial = await (0, import_promises.stat)(absolutePath);
  checkCancelled(signal);
  if (!initial.isFile()) throw new Error("\u76EE\u6807\u4E0D\u662F\u666E\u901A\u6587\u4EF6");
  if (initial.size > MAX_REPOSITORY_MARKDOWN_BYTES) throw new Error("Markdown \u8D85\u8FC7 2 MiB\uFF0C\u53EA\u8BFB\u89C6\u56FE\u65E0\u6CD5\u663E\u793A");
  const handle = await (0, import_promises.open)(absolutePath, "r");
  try {
    const current = await handle.stat();
    checkCancelled(signal);
    if (!current.isFile() || current.size > MAX_REPOSITORY_MARKDOWN_BYTES) throw new Error("\u76EE\u6807\u4E0D\u662F\u53EF\u8BFB\u53D6\u7684\u6709\u754C Markdown \u6587\u4EF6");
    const bytes = Buffer.alloc(MAX_REPOSITORY_MARKDOWN_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      checkCancelled(signal);
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    checkCancelled(signal);
    if (length > MAX_REPOSITORY_MARKDOWN_BYTES) throw new Error("Markdown \u8D85\u8FC7 2 MiB\uFF0C\u53EA\u8BFB\u89C6\u56FE\u65E0\u6CD5\u663E\u793A");
    let markdown;
    try {
      markdown = new import_util.TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
    } catch (e) {
      throw new Error("\u6587\u4EF6\u4E0D\u662F\u6709\u6548\u7684 UTF-8 Markdown");
    }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(markdown)) throw new Error("\u6587\u4EF6\u5305\u542B\u4E8C\u8FDB\u5236\u5185\u5BB9");
    return { absolutePath, markdown };
  } finally {
    await handle.close();
  }
}
function renderRepositoryMarkdown(markdown) {
  const renderer = new MarkdownItCallable({ html: false, linkify: false, typographer: false });
  renderer.renderer.rules.link_open = () => '<span class="flowdesk-repository-reference">';
  renderer.renderer.rules.link_close = () => "</span>";
  renderer.renderer.rules.image = (tokens, index) => {
    var _a;
    const token = tokens[index];
    return `<span class="flowdesk-repository-image-placeholder">${renderer.utils.escapeHtml(token.content)}\uFF08\u56FE\u7247\u672A\u52A0\u8F7D\uFF1A${renderer.utils.escapeHtml(String((_a = token.attrGet("src")) != null ? _a : ""))}\uFF09</span>`;
  };
  return renderer.render(markdown);
}

// src/repository-reader-view.ts
var FLOWDESK_REPOSITORY_VIEW_TYPE = "flowdesk-repository-reader";
var RepositoryReaderView = class extends import_obsidian2.ItemView {
  constructor(leaf, dependencies = {}) {
    super(leaf);
    this.dependencies = dependencies;
    this.absolutePath = "";
    this.generation = 0;
    this.controller = null;
    this.closed = false;
    this.ready = false;
    this.readError = "";
  }
  getViewType() {
    return FLOWDESK_REPOSITORY_VIEW_TYPE;
  }
  getDisplayText() {
    return this.absolutePath ? `${path7.basename(this.absolutePath)}\uFF08\u53EA\u8BFB\uFF09` : "\u5E93\u5916 Markdown\uFF08\u53EA\u8BFB\uFF09";
  }
  getIcon() {
    return "file-text";
  }
  getState() {
    return { absolutePath: this.absolutePath };
  }
  async onOpen() {
    this.closed = false;
  }
  async setState(state, _result) {
    const candidate = state;
    this.absolutePath = typeof (candidate == null ? void 0 : candidate.absolutePath) === "string" ? candidate.absolutePath : "";
    await this.refresh();
  }
  async refresh() {
    var _a;
    if (this.closed) return;
    const generation = ++this.generation, absolutePath = this.absolutePath;
    (_a = this.controller) == null ? void 0 : _a.abort();
    this.controller = new AbortController();
    const controller = this.controller;
    this.ready = false;
    this.readError = "";
    this.contentEl.empty();
    this.contentEl.addClass("flowdesk-repository-reader");
    this.contentEl.createEl("h2", { text: this.getDisplayText() });
    this.contentEl.createEl("p", { text: absolutePath, cls: "flowdesk-repository-path" });
    this.contentEl.createEl("p", { text: "\u53EA\u8BFB Markdown \xB7 UTF-8 \xB7 \u6700\u5927 2 MiB\u3002\u56FE\u7247\u3001\u5D4C\u5165\u548C\u5185\u90E8\u5F15\u7528\u672A\u52A0\u8F7D\uFF1B\u94FE\u63A5\u53EA\u663E\u793A\u6587\u672C\uFF0C\u6682\u4E0D\u5B9A\u4F4D\u7AE0\u8282\uFF1B\u590D\u9009\u6846\u4EE5\u9759\u6001\u6587\u672C\u663E\u793A\u3002\u53EF\u67E5\u770B\u5B8C\u6574\u53EA\u8BFB\u6E90\u7801\u3002", cls: "flowdesk-repository-boundary" });
    const refresh = this.contentEl.createEl("button", { text: "\u5237\u65B0", cls: "flowdesk-repository-refresh" });
    refresh.addEventListener("click", () => this.refresh());
    const status = this.contentEl.createEl("p", { text: "\u6B63\u5728\u8BFB\u53D6\u2026", cls: "flowdesk-repository-status" });
    try {
      const document2 = await readRepositoryMarkdown(absolutePath, controller.signal);
      if (!this.isCurrent(generation)) return;
      const body = this.contentEl.createDiv({ cls: "flowdesk-repository-body markdown-preview-view" });
      body.remove();
      body.innerHTML = renderRepositoryMarkdown(document2.markdown);
      if (!this.isCurrent(generation)) return;
      this.contentEl.appendChild(body);
      this.ready = true;
      status.setText("\u5DF2\u8BFB\u53D6\u539F\u6587\u4EF6 \xB7 \u53EA\u8BFB");
      const sourceToggle = this.contentEl.createEl("button", { text: "\u67E5\u770B\u53EA\u8BFB\u6E90\u7801", cls: "flowdesk-repository-source-toggle" });
      let showingSource = false;
      sourceToggle.addEventListener("click", () => {
        if (!this.isCurrent(generation)) return;
        showingSource = !showingSource;
        body.empty();
        if (showingSource) body.createEl("pre", { text: document2.markdown, cls: "flowdesk-repository-source" });
        else body.innerHTML = renderRepositoryMarkdown(document2.markdown);
        sourceToggle.setText(showingSource ? "\u67E5\u770B\u6E32\u67D3\u6B63\u6587" : "\u67E5\u770B\u53EA\u8BFB\u6E90\u7801");
      });
      if (this.dependencies.openOriginal) {
        const original = this.contentEl.createEl("button", { text: "\u5728\u7CFB\u7EDF\u4E2D\u6253\u5F00\u539F\u6587\u4EF6", cls: "flowdesk-repository-open-original" });
        original.addEventListener("click", async () => {
          try {
            await this.dependencies.openOriginal(absolutePath);
            if (this.isCurrent(generation)) status.setText("\u5DF2\u63D0\u4EA4\u7CFB\u7EDF\u6253\u5F00\u8BF7\u6C42\uFF1B\u662F\u5426\u6253\u5F00\u7531\u7CFB\u7EDF\u51B3\u5B9A");
          } catch (error) {
            if (this.isCurrent(generation)) status.setText(`\u7CFB\u7EDF\u6253\u5F00\u8BF7\u6C42\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
          }
        });
      }
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      this.readError = error instanceof Error ? error.message : String(error);
      status.setText(`\u8BFB\u53D6\u5931\u8D25\uFF1A${this.readError}`);
    }
  }
  isCurrent(generation) {
    return !this.closed && generation === this.generation;
  }
  async onClose() {
    var _a;
    this.closed = true;
    this.generation++;
    (_a = this.controller) == null ? void 0 : _a.abort();
    this.controller = null;
    this.ready = false;
  }
};

// src/main.ts
var FLOWDESK_DASHBOARD_VIEW_TYPE = "flowdesk-dashboard-view";
var execFileAsync = (0, import_util2.promisify)(import_child_process2.execFile);
var DEFAULT_SETTINGS = {
  coreMode: "installed",
  flowdeskRoot: "",
  workingDirectory: "",
  apiUrl: "",
  tasknotesEnv: "{}"
};
var FlowDeskDashboardPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.coreResolution = null;
    this.settingsRefresh = null;
    this.snapshotCores = /* @__PURE__ */ new WeakMap();
    this.repositoryOpenDependencies = {};
    this.openingRepository = 0;
    this.changingPlacement = 0;
  }
  openRepositoryMarkdown(absolutePath) {
    return new RepositoryMarkdownOpener(this.repositoryOpenDependencies).open(absolutePath);
  }
  async openRepositoryInWorkspace(absolutePath, event, stillCurrent = () => true) {
    this.openingRepository++;
    try {
      const leaf = selectContentLeaf(this.app.workspace, FLOWDESK_DASHBOARD_VIEW_TYPE, !!((event == null ? void 0 : event.metaKey) || (event == null ? void 0 : event.ctrlKey)));
      await leaf.setViewState({ type: FLOWDESK_REPOSITORY_VIEW_TYPE, active: false, state: { absolutePath } });
      if (!stillCurrent()) return;
      await this.app.workspace.revealLeaf(leaf);
      if (!(leaf.view instanceof RepositoryReaderView) || !leaf.view.ready) throw new Error(leaf.view instanceof RepositoryReaderView ? leaf.view.readError || "\u539F\u6587\u4EF6\u5C1A\u672A\u8BFB\u53D6\u5B8C\u6210" : "\u53EA\u8BFB\u89C6\u56FE\u672A\u80FD\u52A0\u8F7D");
    } finally {
      this.openingRepository--;
    }
  }
  async changeDashboardPlacement(view, placement) {
    const state = { ...view.getState(), placement };
    this.changingPlacement++;
    try {
      await placeDashboard(this.app.workspace, view.leaf, FLOWDESK_DASHBOARD_VIEW_TYPE, state, placement, () => {
        if (view.getState().resourcePath !== state.resourcePath) throw new Error("\u9605\u8BFB\u5BF9\u8C61\u5DF2\u5207\u6362\uFF0C\u8BF7\u5728\u5F53\u524D\u770B\u677F\u91CD\u8BD5\u3002");
      });
    } finally {
      this.changingPlacement--;
    }
  }
  async onload() {
    await this.loadSettings();
    this.registerView(
      FLOWDESK_DASHBOARD_VIEW_TYPE,
      (leaf) => new FlowDeskDashboardView(leaf, this)
    );
    this.registerView(FLOWDESK_REPOSITORY_VIEW_TYPE, (leaf) => new RepositoryReaderView(leaf, { openOriginal: async (absolutePath) => {
      const outcome = await this.openRepositoryMarkdown(absolutePath);
      if (outcome.kind !== "accepted") throw new Error(outcome.message);
    } }));
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
          new import_obsidian3.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A TaskNotes \u4EFB\u52A1\u6216 Work Case\u3002");
          return false;
        }
        void this.refreshDashboard();
        return true;
      }
    });
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        var _a;
        if (!file && (this.openingRepository || this.changingPlacement || this.app.workspace.getActiveViewOfType(FlowDeskDashboardView) || this.app.workspace.getActiveViewOfType(RepositoryReaderView))) return;
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
      if (view && file instanceof import_obsidian3.TFile && view.observesFile(file.path)) view.scheduleRefresh();
    };
    this.registerEvent(this.app.vault.on("modify", refreshOnChange));
    this.registerEvent(this.app.vault.on("create", refreshOnChange));
    this.registerEvent(this.app.vault.on("delete", refreshOnChange));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const view = this.getDashboardView();
      if (view && file instanceof import_obsidian3.TFile && (view.observesFile(file.path) || view.observesFile(oldPath))) view.scheduleRefresh();
    }));
    this.addSettingTab(new FlowDeskDashboardSettingTab(this.app, this));
  }
  async onunload() {
    if (this.settingsRefresh) clearTimeout(this.settingsRefresh);
    this.app.workspace.detachLeavesOfType(FLOWDESK_DASHBOARD_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(FLOWDESK_REPOSITORY_VIEW_TYPE);
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
    new import_obsidian3.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A TaskNotes \u4EFB\u52A1\u6216 Work Case\u3002");
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
  createSnapshotInvocation(taskPath, format2) {
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
      format2
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
    if (!(file instanceof import_obsidian3.TFile) || file.path !== casePath) throw new Error("\u672A\u627E\u5230\u51C6\u786ECase\u539F\u6587");
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
    return path8.resolve(basePath);
  }
};
var FlowDeskDashboardView = class extends import_obsidian3.ItemView {
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
    this.readingFontSize = 16;
    this.placement = "sidebar";
    this.restoredInitialState = false;
    this.layoutCleanup = null;
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
      openTask: (taskPath, origin, event) => this.openTask(taskPath, origin, event),
      openCaseSource: (casePath, source, event) => this.openCaseSource(casePath, source, event),
      openRelated: (target, casePath, event) => this.openRelated(target, casePath, void 0, true, event),
      copyText: (text3) => navigator.clipboard.writeText(text3),
      openTaskSource: (taskPath, source, event) => this.openSnapshotSource(taskPath, source, "\u6062\u590D\u5F15\u7528", "", event),
      renderMarkdown: (text3, element, sourcePath) => this.renderSourceMarkdown(text3, element, sourcePath),
      openSettings: () => this.plugin.openDashboardSettings(),
      openActions: (title, actions) => {
        this.displayResourceModal(new DashboardActionsModal(this.app, title, actions));
      },
      openContent: (title, render) => {
        this.displayResourceModal(new DashboardContentModal(this.app, title, render));
      },
      editCase: (casePath, event) => this.openCaseProperties(casePath, event),
      icon: import_obsidian3.setIcon
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
  getState() {
    this.readingState.capture(this.renderedResource, this.contentEl);
    return { resourcePath: "resourcePath" in this.shell.context ? this.shell.context.resourcePath : "", placement: this.placement, fontSize: this.readingFontSize, reading: this.readingState.snapshot(), references: this.caseRenderer.snapshotReadingChoices() };
  }
  async setState(value, _result) {
    var _a, _b;
    if (!value || typeof value !== "object") return;
    const state = value;
    this.placement = state.placement === "main" ? "main" : "sidebar";
    this.readingFontSize = [14, 16, 18].includes(state.fontSize) ? state.fontSize : 16;
    this.readingState.restoreSnapshot(state.reading);
    this.caseRenderer.restoreReadingChoices(state.references);
    if (typeof state.resourcePath !== "string" || !state.resourcePath) return;
    const file = this.app.vault.getAbstractFileByPath(state.resourcePath);
    if (!(file instanceof import_obsidian3.TFile) || file.path !== state.resourcePath || !(this.plugin.isTaskFile(file) || ["work-case", "session"].includes(this.plugin.workCaseType(file)))) throw new Error("\u539F Task/Case \u5DF2\u65E0\u6CD5\u786E\u8BA4\uFF0C\u4FDD\u7559\u539F\u9605\u8BFB\u4F4D\u7F6E\u3002");
    this.restoredInitialState = true;
    await this.syncToActiveFile(file);
    if (this.shell.context.kind === "task" && !((_a = this.taskAdapter.getRenderState()) == null ? void 0 : _a.snapshot)) throw new Error("\u4EFB\u52A1\u8BFB\u53D6\u5931\u8D25\uFF0C\u4FDD\u7559\u539F Dashboard\u3002");
    if (this.shell.context.kind === this.caseAdapter.kind && !((_b = this.caseAdapter.getRenderState()) == null ? void 0 : _b.model)) throw new Error("\u6848\u5377\u8BFB\u53D6\u5931\u8D25\uFF0C\u4FDD\u7559\u539F Dashboard\u3002");
  }
  renderReadingControls(container) {
    var _a, _b, _c;
    const row = container.createDiv({ cls: "flowdesk-reading-controls" });
    const inMain = this.placement === "main" || ((_b = (_a = this.leaf) == null ? void 0 : _a.getRoot) == null ? void 0 : _b.call(_a)) === this.app.workspace.rootSplit && !!this.app.workspace.rootSplit;
    const expand = row.createEl("button", { cls: "flowdesk-reading-expand", text: inMain ? "\u56DE\u5230\u4FA7\u680F" : "\u653E\u5927\u9605\u8BFB", attr: { "aria-label": inMain ? "\u56DE\u5230\u4FA7\u680F" : "\u5728\u4E3B\u533A\u57DF\u653E\u5927\u9605\u8BFB" } });
    expand.disabled = !this.renderedResource;
    expand.addEventListener("click", async () => {
      if (expand.disabled) return;
      expand.disabled = true;
      try {
        await this.plugin.changeDashboardPlacement(this, inMain ? "sidebar" : "main");
      } catch (error) {
        new import_obsidian3.Notice(`\u672A\u80FD\u5207\u6362\u9605\u8BFB\u4F4D\u7F6E\uFF1A${error instanceof Error ? error.message : String(error)}`);
        expand.disabled = false;
      }
    });
    const size = row.createEl("select", { cls: "flowdesk-reading-font-select", attr: { "aria-label": "\u9605\u8BFB\u5B57\u53F7" } });
    for (const value of [14, 16, 18]) size.createEl("option", { text: `${value}px`, value: String(value) });
    size.value = String(this.readingFontSize);
    size.addEventListener("change", () => {
      var _a2;
      const value = Number(size.value);
      if (![14, 16, 18].includes(value)) return;
      this.readingFontSize = value;
      (_a2 = container.style) == null ? void 0 : _a2.setProperty("--fd-reading-font-size", `${value}px`);
    });
    (_c = container.style) == null ? void 0 : _c.setProperty("--fd-reading-font-size", `${this.readingFontSize}px`);
  }
  async onOpen() {
    this.cancelInitialSync = registerInitialDashboardSync(
      (callback) => this.app.workspace.onLayoutReady(callback),
      () => {
        if (!this.restoredInitialState) void this.syncToActiveFile();
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
    var _a;
    (_a = this.layoutCleanup) == null ? void 0 : _a.call(this);
    this.layoutCleanup = null;
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
    this.markdownScope = this.addChild(new import_obsidian3.Component());
    this.positionRestored = false;
    this.lastRenderInteraction = interaction;
    const nextResource = "resourcePath" in this.shell.context ? `${this.shell.context.kind}:${this.shell.context.resourcePath}` : "";
    if (nextResource !== this.renderedResource) this.closeResourceModal();
    this.renderedResource = nextResource;
    container.empty();
    this.caseRenderer.reset(container);
    container.addClass("flowdesk-dashboard");
    this.renderReadingControls(container);
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
      if (this.shell.context.kind === this.taskAdapter.kind || this.shell.context.kind === this.caseAdapter.kind) this.layoutCleanup = applyDashboardLayout(container, this.shell.context.kind === this.taskAdapter.kind ? "task" : "case");
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
      renderMarkdown: (text3, element, taskId) => this.renderSourceMarkdown(text3, element, taskId),
      openSource: (taskId, source, heading2, text3, event) => this.openSnapshotSource(taskId, source, heading2, text3, event)
    });
    if (presentation.primaryStatus.diagnostic) this.renderPrimaryDiagnostic(overview, presentation.primaryStatus, model.currentTask.title, model.currentTask.id);
    const navigation = container.createDiv({ cls: "flowdesk-reading-navigation" });
    const read = navigation.createEl("button", { text: "\u9605\u8BFB\u6B63\u6587", attr: { "data-focus-key": "read-body" } });
    read.addEventListener("click", () => {
      var _a, _b;
      const target = this.contentEl.querySelector(".flowdesk-contract-summary");
      if (!target) return;
      for (const section2 of Array.from(target.querySelectorAll("details"))) {
        if (["task-specification", "acceptance"].includes((_a = section2.getAttribute("data-disclosure-key")) != null ? _a : "")) section2.open = true;
      }
      (_b = target.scrollIntoView) == null ? void 0 : _b.call(target, { block: "start", behavior: "smooth" });
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
    const heading2 = header.createDiv({ cls: "flowdesk-task-heading" });
    const title = heading2.createDiv({
      cls: "flowdesk-task-title flowdesk-current-task-link",
      text: taskTitleFromPath(taskPath),
      attr: { role: "link", tabindex: "0" }
    });
    this.makeNavigable(title, (event) => this.openTask(taskPath, "current", event));
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
        text: `\u2191 \u7236\u4EFB\u52A1\uFF1A${presentation.header.parent.title}`,
        attr: {
          role: "link",
          tabindex: "0",
          title: presentation.header.parent.title,
          "aria-label": `\u6253\u5F00\u7236\u4EFB\u52A1\uFF1A${presentation.header.parent.title}`
        }
      });
      this.makeNavigable(
        parent,
        (event) => {
          var _a, _b;
          return this.openTask((_b = (_a = presentation.header.parent) == null ? void 0 : _a.id) != null ? _b : "", "parent", event);
        }
      );
      topRow.createDiv({ cls: "flowdesk-task-context-label", text: "\u5F53\u524D\u4EFB\u52A1" });
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
      { label: "\u67E5\u770B\u539F\u6587\u4EF6", run: (event) => this.openTask(model.currentTask.id, "current", event) }
    ])));
    const heading2 = header.createDiv({ cls: "flowdesk-task-heading" });
    const title = heading2.createDiv({
      cls: "flowdesk-task-title flowdesk-current-task-link",
      text: presentation.header.title,
      attr: { role: "link", tabindex: "0" }
    });
    this.makeNavigable(title, (event) => this.openTask(model.currentTask.id, "current", event));
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
    (0, import_obsidian3.setIcon)(copy, "copy");
    copy.addEventListener("click", async () => {
      try {
        await this.plugin.copyDashboardCommand(taskPath);
        new import_obsidian3.Notice("CLI \u547D\u4EE4\u5DF2\u590D\u5236");
      } catch (error) {
        new import_obsidian3.Notice(`\u65E0\u6CD5\u590D\u5236 CLI \u547D\u4EE4\uFF1A${String(error)}`);
      }
    });
    const refresh = toolbar.createEl("button", {
      cls: "flowdesk-toolbar-button",
      attr: {
        "aria-label": this.loading ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0",
        title: this.loading ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0"
      }
    });
    (0, import_obsidian3.setIcon)(refresh, "refresh-cw");
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
      const available = file instanceof import_obsidian3.TFile && (this.plugin.isTaskFile(file) || ["work-case", "session"].includes(this.plugin.workCaseType(file)));
      const back = card.createEl("button", { cls: "flowdesk-return-resource", text: "\u2190 \u8FD4\u56DE\u5DE5\u4F5C\u770B\u677F", attr: { title: "\u56DE\u5230\u521A\u624D\u67E5\u770B\u7684\u4EFB\u52A1\u6216Case" } });
      back.disabled = !available;
      back.addEventListener("click", (event) => {
        void this.openTask(context.previousTaskPath, "current", event);
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
      title.addEventListener("click", (event) => {
        void this.openDiagnosticLocation(status.diagnostic, event);
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
      new import_obsidian3.Notice("\u95EE\u9898\u5DF2\u590D\u5236");
    } catch (error) {
      new import_obsidian3.Notice(`\u65E0\u6CD5\u590D\u5236\u95EE\u9898\uFF1A${String(error)}`);
    }
  }
  async openDiagnosticLocation(diagnostic, event) {
    await this.openSnapshotSource(diagnostic.taskId, diagnostic.source, "\u8BCA\u65AD", "", event);
  }
  beginNavigation() {
    this.cancelNavigation();
    const controller = new AbortController();
    this.navigationController = controller;
    const context = this.shell.context;
    return { signal: controller.signal, current: () => !controller.signal.aborted && this.shell.context === context };
  }
  async openNavigationFile(file, signal, event) {
    const opening = { path: file.path, signal };
    this.navigationOpening = opening;
    try {
      await this.navigationLeaf("current", event).openFile(file);
      return true;
    } catch (error) {
      if (!signal.aborted) new import_obsidian3.Notice(`\u65E0\u6CD5\u6253\u5F00\u51C6\u786E\u539F\u6587\uFF1A${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      if (this.navigationOpening === opening) this.navigationOpening = null;
    }
  }
  navigationLeaf(origin, event) {
    return selectContentLeaf(this.app.workspace, FLOWDESK_DASHBOARD_VIEW_TYPE, taskNavigationLeafType(origin, event) === "tab");
  }
  async openSnapshotSource(taskPath, source, sourceKind = "\u6765\u6E90", text3 = "", event) {
    var _a, _b;
    if (!taskPath) {
      new import_obsidian3.Notice("producer\u672A\u63D0\u4F9B\u51C6\u786ETask ID");
      return;
    }
    if (!source) {
      await this.openTask(taskPath, "current", event);
      return;
    }
    const request = this.beginNavigation();
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof import_obsidian3.TFile) || file.path !== taskPath) {
      new import_obsidian3.Notice(`\u672A\u627E\u5230\u4EFB\u52A1\u6587\u4EF6\uFF1A${taskPath}`);
      return;
    }
    let apiDetails = null;
    let location = { kind: "note", reason: "\u6765\u6E90\u65E0\u6CD5\u6838\u5BF9\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002" };
    try {
      const [api, fileText] = await Promise.all([this.plugin.loadTaskDetails(taskPath, request.signal), this.app.vault.cachedRead(file)]);
      apiDetails = api.details;
      location = locateTaskSource(fileText, api.details, { heading: sourceKind, level: 2, text: text3, source });
    } catch (error) {
      location = { kind: "note", reason: `\u6765\u6E90\u6838\u5BF9\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}\uFF1B\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u539F\u6587\u3002` };
    }
    if (!request.current()) return;
    if (!await this.openNavigationFile(file, request.signal, event)) return;
    if (request.signal.aborted) return;
    if (location.kind === "note") {
      new import_obsidian3.Notice(location.reason);
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
    if (!view || ((_a = view.file) == null ? void 0 : _a.path) !== taskPath || ((_b = view.getMode) == null ? void 0 : _b.call(view)) === "preview" || location.editorLine >= view.editor.lineCount()) {
      new import_obsidian3.Notice("\u4EFB\u52A1\u5DF2\u6253\u5F00\uFF1B\u5F53\u524D\u89C6\u56FE\u4E0D\u80FD\u786E\u8BA4\u7CBE\u786E\u4F4D\u7F6E\uFF0C\u8BF7\u67E5\u770B\u539F\u6587\u3002");
      return;
    }
    if (apiDetails === null || typeof view.editor.getValue !== "function") {
      new import_obsidian3.Notice("\u5F53\u524D\u7F16\u8F91\u5668\u4E0D\u80FD\u6838\u5BF9\u539F\u6587\uFF1B\u5DF2\u6253\u5F00\u6574\u5F20\u4EFB\u52A1\u3002");
      return;
    }
    location = locateTaskSource(view.editor.getValue(), apiDetails, { heading: sourceKind, level: 2, text: text3, source });
    if (location.kind === "note") {
      new import_obsidian3.Notice(location.reason);
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
      const candidates = [linkText, path8.posix.normalize(path8.posix.join(path8.posix.dirname(sourcePath), linkText))];
      for (const candidate of candidates) {
        const file = this.app.vault.getAbstractFileByPath(candidate);
        if (file instanceof import_obsidian3.TFile && file.path === candidate) return file.path;
      }
      const { path: linkpath } = (0, import_obsidian3.parseLinktext)(linkText);
      return (_d = (_c = (_b = (_a = this.app.metadataCache).getFirstLinkpathDest) == null ? void 0 : _b.call(_a, linkpath, sourcePath)) == null ? void 0 : _c.path) != null ? _d : null;
    };
  }
  async renderSourceMarkdown(text3, element, sourcePath) {
    var _a, _b, _c, _d;
    const modal = ((_a = this.resourceModal) == null ? void 0 : _a.contentEl.contains(element)) ? this.resourceModal : null;
    const signal = (_b = modal == null ? void 0 : modal.renderSignal) != null ? _b : this.renderController.signal;
    const component = (_d = (_c = modal == null ? void 0 : modal.markdownScope) != null ? _c : this.markdownScope) != null ? _d : this;
    const sources = collectMarkdownLinkSources(text3);
    let complete = false;
    element.addEventListener("click", (event) => {
      var _a2, _b2, _c2;
      const anchor = (_b2 = (_a2 = event.target) == null ? void 0 : _a2.closest) == null ? void 0 : _b2.call(_a2, "a");
      if (!anchor || !element.contains(anchor)) return;
      const href = anchor.getAttribute("data-href") || anchor.getAttribute("href");
      if (!href) return;
      const anchors = Array.from(element.querySelectorAll("a"));
      const origin = renderedLinkSource(sources, anchors.map((link2) => {
        var _a3;
        return { href: link2.getAttribute("data-href") || link2.getAttribute("href") || "", label: (_a3 = link2.textContent) != null ? _a3 : "" };
      }), anchors.indexOf(anchor), complete);
      if (origin === "wiki") return;
      const target = resolveRelatedTarget(href, { casePath: sourcePath, cwd: null, vaultRoot: this.plugin.vaultRoot(), resolveVaultLink: this.vaultLinkResolver(sourcePath) });
      const explicitFile = /^file:/i.test(href) || path8.isAbsolute(href);
      const literalHashFile = target.kind === "vault" && target.exactFile === true && ((_c2 = target.resolvedPath) == null ? void 0 : _c2.includes("#"));
      if (target.kind === "vault" && !explicitFile && !literalHashFile || target.kind === "url") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void this.openRelated(href, sourcePath, origin === "markdown" ? void 0 : "\u94FE\u63A5\u8BED\u6CD5\u6765\u6E90\u65E0\u6CD5\u552F\u4E00\u6838\u5BF9\uFF1B\u8BF7\u67E5\u770B\u539F\u6587\u6216\u590D\u5236\u5F15\u7528\u3002", false, event);
    }, true);
    const rendered = (async () => {
      await import_obsidian3.MarkdownRenderer.render(this.app, text3, element, sourcePath, component);
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
    const candidates = contexts ? this.app.vault.getMarkdownFiles().filter((file) => ["work-case", "session"].includes(this.plugin.workCaseType(file)) && contexts.includes(`@${path8.basename(file.path, ".md")}`)) : [];
    const chosen = chooseTaskCase(contexts, candidates.map((file) => ({ path: file.path, contextTag: `@${path8.basename(file.path, ".md")}`, cwd: null })));
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
    const heading2 = section2.createDiv({ cls: "flowdesk-section-heading" });
    heading2.createDiv({
      cls: "flowdesk-dashboard-section-title",
      text: `\u76F4\u63A5\u5B50\u4EFB\u52A1 \xB7 ${children.length}`
    });
    heading2.createDiv({
      cls: "flowdesk-section-meta",
      text: `${children.filter((child) => !child.history).length} \u9879${legacy ? "\u672A\u5B8C\u6210" : "\u672A\u7ED3\u675F"}\u6216\u72B6\u6001\u672A\u77E5`
    });
    const list2 = section2.createDiv({ cls: "flowdesk-child-list" });
    const historical = children.filter((child) => child.history);
    let historyList = null;
    if (historical.length) {
      const history = section2.createEl("details", { cls: "flowdesk-task-history", attr: { "data-disclosure-key": "task-children-history" } });
      history.createEl("summary", { text: `${legacy ? "\u5DF2\u5B8C\u6210" : "\u5DF2\u7ED3\u675F"} \xB7 ${historical.length}` });
      historyList = history.createDiv({ cls: "flowdesk-child-list" });
    }
    for (const child of children) {
      const row = (child.history ? historyList : list2).createDiv({
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
      this.makeNavigable(row, (event) => this.openTask(child.id, "child", event));
    }
  }
  renderDetails(container, model, summary, diagnosticGroups) {
    const diagnosticCount = diagnosticGroups.reduce(
      (total, group) => total + group.diagnostics.length,
      0
    );
    const details = container.createDiv({ cls: "flowdesk-contract-summary flowdesk-reading-card" });
    const heading2 = details.createDiv({ cls: "flowdesk-dashboard-section-title flowdesk-content-heading" });
    const icon = heading2.createSpan({ cls: "flowdesk-content-icon" });
    (0, import_obsidian3.setIcon)(icon, "file-text");
    heading2.createSpan({ text: "\u4EFB\u52A1\u8BE6\u60C5" });
    heading2.createSpan({ cls: "flowdesk-content-caption", text: "\u8BF4\u660E \xB7 \u9A8C\u6536 \xB7 \u7ED3\u679C" });
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
      renderMarkdown: (text3, element, taskPath) => this.renderSourceMarkdown(text3, element, taskPath),
      openSource: (taskPath, section2, event) => this.openSnapshotSource(taskPath, section2.source, section2.heading, section2.text, event)
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
            attr: { title: `\u6253\u5F00\u4EFB\u52A1\uFF1A${group.taskTitle}` }
          });
          taskLink.addEventListener("click", (event) => {
            void this.openTask(group.taskId, "child", event);
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
            void this.openDiagnosticLocation(diagnostic.diagnostic, event);
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
    element.addEventListener("click", (event) => {
      void action(event);
    });
    element.addEventListener("keydown", (event) => {
      if (!isActivationKey(event.key)) return;
      event.preventDefault();
      void action(event);
    });
  }
  async openTask(taskPath, origin = "current", event) {
    if (!taskPath) return;
    const file = this.app.vault.getAbstractFileByPath(taskPath);
    if (!(file instanceof import_obsidian3.TFile)) {
      new import_obsidian3.Notice(`\u672A\u627E\u5230\u4EFB\u52A1\u6587\u4EF6\uFF1A${taskPath}`);
      return;
    }
    await this.navigationLeaf(origin, event).openFile(file);
  }
  async openCaseSource(casePath, source, event) {
    var _a, _b, _c;
    const request = this.beginNavigation(), file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof import_obsidian3.TFile) || file.path !== casePath) {
      new import_obsidian3.Notice(`\u672A\u627E\u5230Work Case\u6587\u4EF6\uFF1A${casePath}`);
      return;
    }
    let text3;
    try {
      text3 = await this.app.vault.cachedRead(file);
    } catch (error) {
      if (!request.current()) return;
      const opened = await this.openNavigationFile(file, request.signal, event);
      if (opened && !request.signal.aborted) new import_obsidian3.Notice(`Case\u6765\u6E90\u8BFB\u53D6\u5931\u8D25\uFF0C\u4EC5\u6253\u5F00\u6574\u5F20\u539F\u6587\uFF1A${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!request.current()) return;
    if (!await this.openNavigationFile(file, request.signal, event)) return;
    if (request.signal.aborted) return;
    const lines = text3.replace(/\r\n/g, "\n").split("\n");
    const model = (_a = this.caseAdapter.getRenderState()) == null ? void 0 : _a.model;
    const blocks = model ? [...Object.values(model.sections).flat(), ...model.current.raw ? [model.current.raw] : [], ...model.recentProgress] : [];
    const expected = blocks.find((block2) => block2.source.lineStart === source.lineStart && block2.source.lineEnd === source.lineEnd);
    const validRange = Number.isInteger(source.lineStart) && source.lineStart >= 1 && Number.isInteger(source.lineEnd) && source.lineEnd >= source.lineStart && source.lineEnd <= lines.length;
    const span = validRange ? lines.slice(source.lineStart - 1, source.lineEnd).join("\n") : "";
    if (!validRange || !expected || !span.includes(expected.text.replace(/\r\n/g, "\n"))) {
      new import_obsidian3.Notice("Case\u6765\u6E90\u5DF2\u53D8\u5316\u6216\u8D8A\u754C\uFF1B\u5DF2\u6253\u5F00\u6574\u5F20Case\u539F\u6587\u3002");
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
    if (!view || ((_b = view.file) == null ? void 0 : _b.path) !== casePath || ((_c = view.getMode) == null ? void 0 : _c.call(view)) === "preview" || source.lineStart - 1 >= view.editor.lineCount()) {
      new import_obsidian3.Notice("Case\u5DF2\u6253\u5F00\uFF1B\u5F53\u524D\u89C6\u56FE\u65E0\u6CD5\u786E\u8BA4\u7CBE\u786E\u4F4D\u7F6E\u3002");
      return;
    }
    const liveLines = view.editor.getValue().replace(/\r\n/g, "\n").split("\n");
    const liveSpan = liveLines.slice(source.lineStart - 1, source.lineEnd).join("\n");
    if (source.lineEnd > liveLines.length || expected && !liveSpan.includes(expected.text.replace(/\r\n/g, "\n"))) {
      new import_obsidian3.Notice("Case\u7F16\u8F91\u5668\u539F\u6587\u5DF2\u53D8\u5316\uFF1B\u4E0D\u731C\u4F4D\u7F6E\u3002");
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
  async openCaseProperties(casePath, event) {
    const file = this.app.vault.getAbstractFileByPath(casePath);
    if (!(file instanceof import_obsidian3.TFile) || file.path !== casePath || !["work-case", "session"].includes(this.plugin.workCaseType(file))) {
      new import_obsidian3.Notice("\u65E0\u6CD5\u786E\u8BA4\u539FCase\u6587\u4EF6\uFF0C\u8BF7\u4ECE\u6587\u4EF6\u5217\u8868\u6838\u5BF9\u3002");
      return;
    }
    await this.navigationLeaf("current", event).openFile(file, { active: true, state: { mode: "source" } });
    new import_obsidian3.Notice("\u5728Case\u9876\u90E8\u5C5E\u6027\u4E2D\u7EF4\u62A4project\u3001plans\u3001docs\u548Crelated\uFF1B\u4FDD\u5B58\u540E\u770B\u677F\u4F1A\u5237\u65B0\u3002Dashboard\u4E0D\u4F1A\u4EE3\u5199\u8FD9\u4E9B\u5C5E\u6027\u3002");
  }
  async openRelated(raw, sourcePath, sourceError, direct = false, event) {
    var _a, _b, _c, _d, _e, _f;
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
      if (!(baseFile instanceof import_obsidian3.TFile) || target.exactFile && baseFile.path !== target.resolvedPath) {
        target = { kind: "unavailable", label: target.label, reason: `\u672A\u627E\u5230\u5DF2\u786E\u8BA4\u7684vault\u539F\u6587\u4EF6\uFF1A${target.linkText}\uFF1B\u4E0D\u4F1A\u521B\u5EFA\u6216\u6539\u9009\u540C\u540D\u7B14\u8BB0\u3002` };
      } else if (baseFile.extension.toLowerCase() === "json") {
        const fragment = (_b = target.fragment) != null ? _b : target.exactFile ? void 0 : (0, import_obsidian3.parseLinktext)(target.linkText).subpath || void 0;
        target = { ...target, resolvedPath: baseFile.path, ...fragment ? { fragment } : {} };
      } else {
        const directFile = target.exactFile === true && (((_c = target.resolvedPath) == null ? void 0 : _c.includes("#")) || target.resolvedPath && target.resolvedPath !== target.resolvedPath.trim() || target.fileUrl && (!target.fragment || ((_d = target.resolvedPath) == null ? void 0 : _d.includes("%"))));
        if (directFile) {
          await this.openNavigationFile(baseFile, request.signal, event);
          if (!target.fragment) return;
        } else {
          if (taskNavigationLeafType("current", event) === false) (_f = (_e = this.app.workspace).setActiveLeaf) == null ? void 0 : _f.call(_e, this.navigationLeaf("current", event), { focus: false });
          await this.app.workspace.openLinkText(target.linkText, sourcePath, taskNavigationLeafType("current", event));
          return;
        }
      }
    }
    let firstError = "";
    if (direct && target.kind === "repository" && /\.md$/i.test(path8.extname(target.absolutePath))) {
      try {
        await this.plugin.openRepositoryInWorkspace(target.absolutePath, event, request.current);
        if (request.current() && target.fragment) new import_obsidian3.Notice("\u5DF2\u6253\u5F00\u51C6\u786E\u539F\u6587\u4EF6\uFF0C\u7AE0\u8282\u4F4D\u7F6E\u5C1A\u672A\u5B9A\u4F4D\u3002");
        if (request.current()) return;
      } catch (error) {
        firstError = `\u53EA\u8BFB\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`;
      }
      if (!request.current()) return;
    }
    const modal = this.displayResourceModal(new DashboardContentModal(this.app, "\u5F15\u7528\u8D44\u6599", () => {
    }));
    const panel = modal.contentEl.createDiv({ cls: "flowdesk-dashboard-section flowdesk-related-target" });
    this.relatedTargetPanel = panel;
    const isFileTarget = target.kind === "repository" || target.kind === "vault";
    const pathText = target.kind === "repository" ? target.absolutePath : target.kind === "vault" && target.resolvedPath ? path8.join(context.vaultRoot, target.resolvedPath) : raw;
    panel.createDiv({ cls: "flowdesk-dashboard-section-title", text: isFileTarget ? "\u5F15\u7528\u8D44\u6599" : "\u5F15\u7528\u5B9A\u4F4D\u7F3A\u53E3" });
    panel.createDiv({ cls: "flowdesk-muted", text: target.kind === "repository" ? `\u539F\u6587\u4EF6\uFF1A${pathText}\uFF1B\u4ED3\u5E93\u5F15\u7528\uFF1A${target.repositoryPath}` : target.kind === "vault" ? `\u539F\u6587\u4EF6\uFF1A${pathText}` : target.reason });
    if ((target.kind === "repository" || target.kind === "vault") && target.fragment) panel.createDiv({ cls: "flowdesk-muted", text: `\u6587\u4EF6\u53EF\u5B9A\u4F4D\uFF0C\u7AE0\u8282\u672A\u9A8C\u8BC1\uFF08${target.fragment}\uFF09\uFF1B\u6253\u5F00\u6574\u6587\u4EF6\uFF0C\u4E0D\u731C\u7AE0\u8282\u4F4D\u7F6E\u3002` });
    const copy = panel.createEl("button", { cls: "flowdesk-copy-related-path", text: isFileTarget ? "\u590D\u5236\u539F\u6587\u4EF6\u8DEF\u5F84" : "\u590D\u5236\u539F\u5F15\u7528" });
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(pathText);
    });
    if (isFileTarget) {
      const reference2 = panel.createEl("button", { cls: "flowdesk-copy-related-reference", text: "\u590D\u5236\u539F\u5F15\u7528" });
      reference2.addEventListener("click", () => {
        void navigator.clipboard.writeText(raw);
      });
    }
    if (target.kind === "repository" && /\.md$/i.test(path8.extname(target.absolutePath))) {
      const documentPath = target.absolutePath;
      const result = panel.createDiv({ cls: "flowdesk-repository-open-feedback", attr: { role: "status" }, text: firstError || "\u5728 Obsidian \u5185\u53EA\u8BFB\u67E5\u770B\u51C6\u786E\u539F\u6587\u4EF6\uFF0CCmd/Ctrl \u70B9\u51FB\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00\u3002" });
      const openDocument = panel.createEl("button", { cls: "flowdesk-open-repository-document", text: "\u53EA\u8BFB\u6253\u5F00\u6587\u6863", attr: { "aria-label": "\u5728Obsidian\u53EA\u8BFB\u67E5\u770B\u51C6\u786EMarkdown\u539F\u6587\u4EF6" } });
      openDocument.addEventListener("click", async (event2) => {
        if (openDocument.disabled) return;
        openDocument.disabled = true;
        result.setText("\u6B63\u5728\u8BFB\u53D6\u539F\u6587\u4EF6\u2026");
        try {
          await this.plugin.openRepositoryInWorkspace(documentPath, event2, request.current);
          if (request.current()) this.closeResourceModal();
        } catch (error) {
          if (request.current()) result.setText(`\u53EA\u8BFB\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
        } finally {
          openDocument.disabled = false;
        }
      });
    } else if (isFileTarget && /\.json$/i.test(path8.extname(pathText))) {
      panel.createDiv({ cls: "flowdesk-muted", text: "JSON\u8D44\u6599\u4EC5\u63D0\u4F9B\u51C6\u786E\u8DEF\u5F84\u4E0E\u539F\u5F15\u7528\uFF1B\u53EF\u901A\u8FC7\u5173\u8054\u7684Markdown\u8BC1\u636E\u7D22\u5F15\u67E5\u770B\u8BF4\u660E\u3002" });
    }
  }
};
var DashboardSettingsModal = class extends import_obsidian3.Modal {
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
var FlowDeskDashboardSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("flowdesk-dashboard-settings");
    containerEl.createEl("h2", { text: "FlowDesk Dashboard" });
    new import_obsidian3.Setting(containerEl).setName("Core \u6765\u6E90").setDesc("\u8DDF\u968F\u6A21\u5F0F\u4F18\u5148\u4F7F\u7528 Claude \u5B89\u88C5\u767B\u8BB0\uFF0C\u7F3A\u5931\u65F6\u68C0\u67E5 Codex \u7F13\u5B58\uFF1B\u56FA\u5B9A\u6A21\u5F0F\u4F7F\u7528\u6307\u5B9A\u8DEF\u5F84\u3002").addDropdown((dropdown) => {
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
      const heading2 = status.createDiv({ cls: "flowdesk-core-status-head" });
      try {
        const core = this.plugin.inspectCore();
        heading2.createSpan({ cls: "flowdesk-core-version", text: `Core ${core.version}` });
        const recheck = heading2.createEl("button", { cls: "flowdesk-core-recheck", text: "\u91CD\u65B0\u68C0\u67E5" });
        recheck.addEventListener("click", inspect);
        const source = status.createDiv({ cls: "flowdesk-core-row" });
        source.createSpan({ cls: "flowdesk-core-label", text: "\u6765\u6E90" });
        source.createSpan({ text: { fixed: "\u56FA\u5B9A\u8DEF\u5F84", "claude-installed": "Claude \u5B89\u88C5\u767B\u8BB0", "codex-cache": "Codex \u7F13\u5B58" }[core.source] });
        const location = status.createDiv({ cls: "flowdesk-core-row" });
        location.createSpan({ cls: "flowdesk-core-label", text: "\u8DEF\u5F84" });
        location.createSpan({ cls: "flowdesk-core-path", text: core.root });
        for (const note of core.notices) status.createDiv({ cls: "flowdesk-core-note", text: note });
      } catch (error2) {
        heading2.createSpan({ cls: "flowdesk-core-version", text: "Core \u672A\u786E\u8BA4" });
        status.createDiv({ cls: "flowdesk-error", text: error2 instanceof Error ? error2.message : String(error2) });
        const recheck = heading2.createEl("button", { cls: "flowdesk-core-recheck", text: "\u91CD\u65B0\u68C0\u67E5" });
        recheck.addEventListener("click", inspect);
      }
    };
    inspect();
    new import_obsidian3.Setting(containerEl).setName("\u56FA\u5B9A Core \u8DEF\u5F84").setDesc("\u4FDD\u7559\u539F\u8DEF\u5F84\uFF1B\u53EA\u6709\u56FA\u5B9A\u6A21\u5F0F\u4F7F\u7528\u3002\u9700\u5305\u542B Task \u4E0E Case producer\u3002").addText((text3) => text3.setPlaceholder("/Users/me/workspaces/flowdesk-plugin").setValue(this.plugin.settings.flowdeskRoot).onChange(async (value) => {
      this.plugin.settings.flowdeskRoot = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("\u5DE5\u4F5C\u76EE\u5F55").setDesc("\u4F20\u7ED9 Task snapshot \u7684 --working-directory\uFF1B\u7559\u7A7A\u65F6\u4F7F\u7528\u6240\u9009 Core \u8DEF\u5F84\u3002").addText((text3) => text3.setValue(this.plugin.settings.workingDirectory).onChange(async (value) => {
      this.plugin.settings.workingDirectory = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("TaskNotes API \u5730\u5740").setDesc("\u7559\u7A7A\u4F7F\u7528\u73AF\u5883\u914D\u7F6E\u6216\u672C\u673A\u9ED8\u8BA4\u5730\u5740\u3002").addText((text3) => text3.setPlaceholder("http://127.0.0.1:18090").setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
      this.plugin.settings.apiUrl = value.trim();
      await this.plugin.saveSettings();
    }));
    let tokenInput, jsonInput;
    let configured = {};
    try {
      configured = parseTaskNotesEnvironment(this.plugin.settings.tasknotesEnv);
    } catch (e) {
    }
    const token = new import_obsidian3.Setting(containerEl).setName("TaskNotes token").setDesc("\u9ED8\u8BA4\u906E\u4F4F\uFF0C\u4FDD\u5B58\u5728\u65E2\u6709\u73AF\u5883\u53D8\u91CF\u914D\u7F6E\u4E2D\u3002\u6709\u6548\u8BBE\u7F6E\u4FDD\u5B58\u540E\u4F1A\u81EA\u52A8\u5237\u65B0\u770B\u677F\u3002");
    const tokenError = token.descEl.createDiv({ attr: { role: "status" } });
    token.addText((text3) => {
      tokenInput = text3.inputEl;
      tokenInput.type = "password";
      tokenInput.autocomplete = "off";
      text3.setPlaceholder("\u672A\u914D\u7F6E").setValue(configured.TASKNOTES_API_TOKEN || configured.TASKNOTES_AUTH_TOKEN || "").onChange(async (value) => {
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
    const environmentSetting = new import_obsidian3.Setting(advanced).setName("TaskNotes \u73AF\u5883\u53D8\u91CF").setDesc("\u4FDD\u7559\u539F\u6709\u53D8\u91CF\u5408\u5E76\u89C4\u5219\uFF1B\u5C55\u5F00\u540E\u53EF\u67E5\u770B\u5E76\u7F16\u8F91\u5168\u90E8\u914D\u7F6E\u3002");
    const error = environmentSetting.descEl.createDiv({ attr: { role: "status" } });
    environmentSetting.addTextArea((text3) => {
      jsonInput = text3.inputEl;
      jsonInput.rows = 5;
      jsonInput.spellcheck = false;
      text3.setValue(this.plugin.settings.tasknotesEnv).onChange(async (value) => {
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
  const heading2 = section2.createDiv({ cls: "flowdesk-contract-section-head" });
  heading2.createDiv({ cls: "flowdesk-dashboard-section-title", text: title });
  if (meta) {
    heading2.createDiv({ cls: "flowdesk-contract-section-meta", text: meta });
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
  return path8.basename(taskPath, path8.extname(taskPath));
}
function expandHomePath(value) {
  if (value === "~") return (0, import_os.homedir)();
  if (value.startsWith("~/")) return path8.join((0, import_os.homedir)(), value.slice(2));
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
/*! Bundled license information:

markdown-it/dist/markdown-it.mjs:
  (*! markdown-it 15.0.2 https://github.com/markdown-it/markdown-it @license MIT *)
*/
