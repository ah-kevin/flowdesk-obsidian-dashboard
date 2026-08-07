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
      ? formatStructuredRecord(requirement.actual, [
          "exit_code",
          "timed_out",
          "duration_ms",
          "signal",
        ])
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
