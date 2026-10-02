import type { ExecutionSnapshot, SnapshotTaskContract, SnapshotBodySection, SnapshotContractItem, SnapshotAcceptanceItem, SnapshotV4 } from "./snapshot-model";

export interface TaskContent {
  taskId: string; goal: string; why: string; scopeText: string; steps: string;
  domainSections: SnapshotBodySection[];
  records: { execution: SnapshotBodySection[]; verification: SnapshotBodySection[]; delivery: SnapshotBodySection[] };
  requirements: SnapshotContractItem[]; scenarios: SnapshotContractItem[]; acceptance: SnapshotAcceptanceItem[];
}
export interface TaskRawContentObservation {
  taskId: string; details: string; readAt: string; source: "tasknotes-api"; error: string | null;
}
const text = (value: unknown): string => typeof value === "string" ? value : "";
export function createTaskContent(snapshot: ExecutionSnapshot, taskPath: string): TaskContent {
  const v4 = snapshot.snapshot_schema_version === 4;
  const contract: SnapshotTaskContract = (v4 ? (snapshot as SnapshotV4).contract?.task_contract : snapshot.contract as SnapshotTaskContract) ?? {};
  const records = snapshot.current_task?.records ?? {};
  const hasScopeText = v4 && (snapshot as SnapshotV4).contract?.status !== "legacy_v3" && Object.prototype.hasOwnProperty.call(contract, "scope_text");
  return {
    taskId: taskPath, goal: text(contract.goal), why: text(contract.why), steps: text(contract.steps),
    scopeText: hasScopeText ? text(contract.scope_text) : [
      ...(contract.scope?.included ?? []).map(x => `- 包含：${x}`),
      ...(contract.scope?.excluded ?? []).map(x => `- 不包含：${x}`),
    ].join("\n"),
    domainSections: contract.domain_sections ?? [],
    records: { execution: Array.isArray(records.execution) ? records.execution : [], verification: Array.isArray(records.verification) ? records.verification : [], delivery: Array.isArray(records.delivery) ? records.delivery : [] },
    requirements: contract.requirements ?? [], scenarios: contract.scenarios ?? [], acceptance: contract.acceptance ?? [],
  };
}

/** Compare only known projection fragments, never infer completion from prose. */
export function rawContentDiffers(content: TaskContent, observation: TaskRawContentObservation, snapshot?: ExecutionSnapshot): boolean {
  if (observation.error || content.taskId !== observation.taskId) return false;
  const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();
  const details = normalize(observation.details);
  const contract = snapshot?.snapshot_schema_version === 4 ? (snapshot as SnapshotV4).contract : null;
  const rawScope = contract?.status !== "legacy_v3" ? text(contract?.task_contract?.scope_text) : "";
  const fragments = [content.goal, content.why, content.steps, rawScope,
    ...content.requirements.map(x => text(x.text)), ...content.scenarios.map(x => text(x.text)), ...content.acceptance.map(x => text(x.text)),
    ...content.domainSections.map(x => x.text),
    ...Object.values(content.records).flat().map(x => x.text)];
  // Legacy structured scope is generated prose, so compare scope through source-backed fields only.
  return fragments.some(x => normalize(x) !== "" && !details.includes(normalize(x)));
}
