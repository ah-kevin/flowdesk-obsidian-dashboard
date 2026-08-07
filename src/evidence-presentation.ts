import type {
  DerivedAcceptance,
  EvidenceHealth,
  StructuredEvidenceRequirement,
} from "./snapshot-model";

export type EvidenceDisplayState = "blocked" | "error" | "done";

export function getEvidenceDisplayState(
  health: EvidenceHealth
): EvidenceDisplayState {
  if (health === "valid") {
    return "done";
  }
  return health === "invalid" ? "error" : "blocked";
}

export function formatEvidenceSummary(
  label: string,
  health: EvidenceHealth
): string {
  const labels: Record<EvidenceHealth, string> = {
    missing: "缺失",
    invalid: "无效",
    valid: "有效",
  };
  return `${label}：${labels[health]}`;
}

export interface StructuredEvidencePresentation {
  uid: string;
  state: EvidenceDisplayState;
  method: string;
  expected: string;
  actual: string;
  provenance: string;
  review: string;
  status: string;
}

export interface DerivedAcceptancePresentation {
  uid: string;
  label: string;
  state: EvidenceDisplayState;
  status: string;
  evidence: string;
}

export function createStructuredEvidencePresentation(
  requirement: StructuredEvidenceRequirement,
  reviewStatus: string
): StructuredEvidencePresentation {
  const status = requirement.status;
  const state: EvidenceDisplayState =
    status === "satisfied" && requirement.matchedExpected !== false
      ? "done"
      : ["failed", "invalid", "record_drift", "stale"].includes(status) ||
          requirement.matchedExpected === false
        ? "error"
        : "blocked";
  return {
    uid: requirement.uid,
    state,
    method: requirement.method,
    expected: formatStructuredRecord(requirement.expected, [
      "outcome",
      "exit_code",
    ]),
    actual: requirement.actual
      ? formatEvidenceActual(requirement.method, requirement.actual)
      : "尚无运行结果",
    provenance: requirement.provenance,
    review: !requirement.reviewRequired
      ? "无需复核"
      : reviewStatus === "approved"
        ? "已复核"
        : reviewStatus === "changes_requested"
          ? "要求修改"
          : "待复核",
    status,
  };
}

export function formatEvidenceActual(
  method: string,
  actual: Record<string, unknown>
): string {
  if (method === "command") {
    const parts = [];
    if ("exit_code" in actual) parts.push(`退出码 ${String(actual.exit_code)}`);
    if (typeof actual.timed_out === "boolean") {
      parts.push(actual.timed_out ? "已超时" : "未超时");
    }
    if (typeof actual.duration_ms === "number") parts.push(`用时 ${actual.duration_ms} ms`);
    if (typeof actual.signal === "number") parts.push(`信号 ${actual.signal}`);
    return parts.join(" · ") || "命令已运行";
  }
  if (method === "artifact") {
    const parts = [actual.exists === true ? "文件存在" : "文件不存在"];
    if (typeof actual.checks_passed === "number" && typeof actual.checks_total === "number") {
      parts.push(`检查 ${actual.checks_passed}/${actual.checks_total} 通过`);
    }
    if (typeof actual.sha256 === "string" && actual.sha256) {
      parts.push(`摘要 ${shortDigest(actual.sha256)}`);
    }
    return parts.join(" · ");
  }
  if (method === "experiment") {
    const parts = [];
    if (typeof actual.trial_count === "number") parts.push(`实验 ${actual.trial_count} 次`);
    if (actual.aggregate_value !== undefined) parts.push(`汇总 ${String(actual.aggregate_value)}`);
    if (typeof actual.source === "string") parts.push(`来源 ${actual.source}`);
    return parts.join(" · ") || "实验已完成";
  }
  if (method === "ci") {
    const parts = [];
    if (typeof actual.outcome === "string") parts.push(`结果 ${actual.outcome}`);
    if (typeof actual.source === "string") parts.push(`来源 ${actual.source}`);
    return parts.join(" · ") || "参考结果已读取";
  }
  return formatTechnicalActual(actual);
}

export function formatTechnicalActual(actual: Record<string, unknown>): string {
  const scalarEntries = Object.entries(actual)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .sort(([left], [right]) => left.localeCompare(right));
  if (!scalarEntries.length) return "已生成结构化结果";
  return scalarEntries.map(([key, value]) => `${key}=${String(value)}`).join(" · ");
}

function shortDigest(value: string): string {
  return value.length > 16 ? `${value.slice(0, 15)}…` : value;
}

export function createDerivedAcceptancePresentation(
  acceptance: DerivedAcceptance
): DerivedAcceptancePresentation {
  const state: EvidenceDisplayState =
    acceptance.status === "satisfied"
      ? "done"
      : ["failed", "invalid"].includes(acceptance.status)
        ? "error"
        : "blocked";
  return {
    uid: acceptance.uid,
    label: acceptance.label,
    state,
    status: acceptance.status,
    evidence: acceptance.evidenceRequirementUids.join("、") || "未关联证据",
  };
}

function formatStructuredRecord(
  value: Record<string, unknown>,
  preferredKeys: string[]
): string {
  const keys = [
    ...preferredKeys.filter((key) => key in value),
    ...Object.keys(value)
      .filter((key) => !preferredKeys.includes(key))
      .sort(),
  ];
  if (!keys.length) return "未提供";
  return keys.map((key) => `${key}=${formatStructuredValue(value[key])}`).join(" · ");
}

function formatStructuredValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
