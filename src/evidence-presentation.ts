import type { EvidenceHealth } from "./snapshot-model";

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
