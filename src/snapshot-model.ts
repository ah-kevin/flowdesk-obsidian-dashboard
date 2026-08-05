export type ObservationHealth =
  | "healthy"
  | "degraded"
  | "failed"
  | "error"
  | "unknown";

export type EvidenceHealth = "missing" | "invalid" | "valid";

export interface SnapshotSource {
  section?: string | null;
  field?: string | null;
  line_start?: number | null;
  line_end?: number | null;
  excerpt?: string | null;
  after_section?: string | null;
  [key: string]: unknown;
}

export interface SnapshotDiagnostic {
  code: string;
  severity: string;
  taskId: string;
  path: string;
  source?: SnapshotSource;
  reason: string;
  expected: string;
  remediation: string;
}

export interface SnapshotAcceptanceItem {
  text?: string;
  checked?: boolean;
  source?: SnapshotSource;
}

export interface SnapshotContractItem {
  id?: string;
  text?: string;
  requirement_ids?: string[];
  source?: SnapshotSource;
}

export interface SnapshotEvidenceHealth {
  execution?: EvidenceHealth;
  verification?: EvidenceHealth;
  delivery?: EvidenceHealth;
}

export interface SnapshotTaskSummary {
  id?: string;
  title?: string;
  status?: string;
  priority?: string;
  is_blocked?: boolean;
  blocked_by?: unknown[];
  parent_id?: string | null;
  goal?: string;
  has_children?: boolean;
  rollup_state?: string;
  semantic_status?: string;
  evidence_health?: SnapshotEvidenceHealth;
  trusted_done?: boolean;
  primary_diagnostic?: unknown;
}

export interface SnapshotObservation {
  health?: string;
  current_task?: string;
  parent?: string;
  children?: string;
  descendants?: string;
  tasknotes_api?: string;
  source_identity_match?: boolean;
  stale?: boolean;
}

export interface SnapshotTaskContract {
  version?: string;
  goal?: string;
  scope?: {
    included?: string[];
    excluded?: string[];
  };
  requirements?: SnapshotContractItem[];
  scenarios?: SnapshotContractItem[];
  acceptance?: SnapshotAcceptanceItem[];
  semantic_status?: string;
}

export interface RollupTaskReference {
  id?: string;
  title?: string;
  status?: string;
}

export interface SnapshotRollup {
  state?: string;
  trusted_done?: boolean;
  has_children?: boolean;
  children_total?: number;
  children_trusted_done?: number;
  children_complete?: boolean;
  blocked_children?: RollupTaskReference[];
  incomplete_children?: RollupTaskReference[];
  contradictions?: unknown[];
}

export interface SnapshotV3 {
  snapshot_schema_version?: number;
  snapshot_model?: string;
  generated_at?: string;
  source_task_id?: string;
  observation?: SnapshotObservation;
  current_task?: SnapshotTaskSummary;
  parent?: Pick<SnapshotTaskSummary, "id" | "title" | "status"> | null;
  contract?: SnapshotTaskContract;
  children?: SnapshotTaskSummary[];
  rollup?: SnapshotRollup;
  evidence?: SnapshotEvidenceHealth;
  diagnostics?: unknown[];
  next_actions?: Record<string, unknown>[];
}

export type ExecutionSnapshot = SnapshotV3;

export interface DashboardTaskViewModel {
  id: string;
  title: string;
  status: string;
  priority: string;
  isBlocked: boolean;
  blockedBy: string[];
  parentId: string | null;
  hasChildren: boolean;
  rollupState: string;
  trustedDone: boolean;
  evidenceHealth: Required<SnapshotEvidenceHealth>;
}

export interface DashboardChildViewModel {
  id: string;
  title: string;
  status: string;
  priority: string;
  isBlocked: boolean;
  blockedBy: string[];
  goal: string;
  hasChildren: boolean;
  rollupState: string;
  semanticStatus: string;
  evidenceHealth: Required<SnapshotEvidenceHealth>;
  trustedDone: boolean;
  primaryDiagnostic: SnapshotDiagnostic | null;
}

export interface DashboardViewModel {
  errorCode:
    | "unsupported_snapshot_schema"
    | "unsupported_snapshot_model"
    | null;
  schemaSupported: boolean;
  modelSupported: boolean;
  schemaLabel: string;
  currentTask: DashboardTaskViewModel;
  parent: { id: string; title: string; status: string } | null;
  children: DashboardChildViewModel[];
  rollup: {
    state: string;
    trustedDone: boolean;
    hasChildren: boolean;
    childrenTotal: number;
    childrenTrustedDone: number;
    childrenComplete: boolean;
    blockedChildren: RollupTaskReference[];
    incompleteChildren: RollupTaskReference[];
    contradictions: unknown[];
  };
  contract: {
    version: string;
    goal: string;
    scope: { included: string[]; excluded: string[] };
    semanticStatus: string;
    requirements: SnapshotContractItem[];
    scenarios: SnapshotContractItem[];
    acceptance: SnapshotAcceptanceItem[];
  };
  evidence: Required<SnapshotEvidenceHealth>;
  observation: {
    health: ObservationHealth;
    currentTask: string;
    parent: string;
    children: string;
    tasknotesApi: string;
    sourceIdentityMatch: boolean | "unknown";
    sourceTaskId: string;
    generatedAt: string;
    isTrustworthy: boolean;
    trustMessage: string;
    isStale: boolean;
    staleReason: string;
    loadedAt: string;
    sourceIdentity: true | false | "unknown";
  };
  primaryDiagnostic: SnapshotDiagnostic | null;
  diagnostics: SnapshotDiagnostic[];
  nextAction: string | null;
}

export interface DashboardModelOptions {
  expectedTaskPath?: string;
  loadedAt?: string;
  staleReason?: string;
}

export function createDashboardViewModel(
  value: unknown,
  options: DashboardModelOptions = {}
): DashboardViewModel {
  const snapshot = isRecord(value) ? (value as SnapshotV3) : {};
  const schemaSupported = snapshot.snapshot_schema_version === 3;
  const modelSupported = snapshot.snapshot_model === "task-centric";
  const currentTask = snapshot.current_task ?? {};
  const currentTaskId = normalizeText(
    currentTask.id,
    normalizeText(snapshot.source_task_id, "")
  );
  const rollup = snapshot.rollup ?? {};
  const staleReason = normalizeText(options.staleReason, "");
  const sourceIdentity = validateSnapshotSource(
    snapshot,
    normalizeText(options.expectedTaskPath, "")
  );
  const observationHealth = normalizeObservationHealth(
    snapshot.observation?.health
  );
  const sourceIdentityMatch =
    typeof snapshot.observation?.source_identity_match === "boolean"
      ? snapshot.observation.source_identity_match
      : "unknown";
  const parentObserved =
    snapshot.observation?.parent === "observed" ||
    snapshot.observation?.parent === "not_applicable";
  const isTrustworthy =
    schemaSupported &&
    modelSupported &&
    observationHealth === "healthy" &&
    snapshot.observation?.current_task === "observed" &&
    parentObserved &&
    snapshot.observation?.children === "observed" &&
    snapshot.observation?.tasknotes_api === "ok" &&
    sourceIdentityMatch === true &&
    snapshot.observation?.stale === false &&
    sourceIdentity === true &&
    !staleReason;
  const evidence = normalizeEvidenceHealth(snapshot.evidence);
  const diagnostics = (snapshot.diagnostics ?? []).map((diagnostic) =>
    normalizeDiagnostic(diagnostic, currentTaskId)
  );
  const children = (snapshot.children ?? []).map((child) =>
    createChildViewModel(child)
  );

  return {
    errorCode: !schemaSupported
      ? "unsupported_snapshot_schema"
      : !modelSupported
        ? "unsupported_snapshot_model"
        : null,
    schemaSupported,
    modelSupported,
    schemaLabel:
      schemaSupported && modelSupported
        ? "snapshot v3 · task-centric"
        : "不支持的 snapshot 模型",
    currentTask: {
      id: currentTaskId,
      title: normalizeText(currentTask.title, "未提供任务标题"),
      status: normalizeText(currentTask.status, "unknown"),
      priority: normalizeText(currentTask.priority, "未提供"),
      isBlocked: currentTask.is_blocked === true,
      blockedBy: (currentTask.blocked_by ?? [])
        .map(normalizeBlockedBy)
        .filter(Boolean),
      parentId:
        typeof currentTask.parent_id === "string"
          ? currentTask.parent_id
          : null,
      hasChildren: currentTask.has_children === true,
      rollupState: normalizeText(currentTask.rollup_state, "unknown"),
      trustedDone: currentTask.trusted_done === true,
      evidenceHealth: evidence,
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
      blockedChildren: rollup.blocked_children ?? [],
      incompleteChildren: rollup.incomplete_children ?? [],
      contradictions: rollup.contradictions ?? [],
    },
    contract: {
      version: normalizeText(snapshot.contract?.version, "未提供"),
      goal: normalizeText(snapshot.contract?.goal, "未提供"),
      scope: {
        included: (snapshot.contract?.scope?.included ?? []).map(String),
        excluded: (snapshot.contract?.scope?.excluded ?? []).map(String),
      },
      semanticStatus: normalizeText(
        snapshot.contract?.semantic_status,
        "unknown"
      ),
      requirements: snapshot.contract?.requirements ?? [],
      scenarios: snapshot.contract?.scenarios ?? [],
      acceptance: snapshot.contract?.acceptance ?? [],
    },
    evidence,
    observation: {
      health: observationHealth,
      currentTask: normalizeText(snapshot.observation?.current_task, "unknown"),
      parent: normalizeText(snapshot.observation?.parent, "unknown"),
      children: normalizeText(snapshot.observation?.children, "unknown"),
      tasknotesApi: normalizeText(snapshot.observation?.tasknotes_api, "unknown"),
      sourceIdentityMatch,
      sourceTaskId: normalizeText(snapshot.source_task_id, ""),
      generatedAt: normalizeText(snapshot.generated_at, "未提供"),
      isTrustworthy,
      trustMessage: isTrustworthy
        ? "观测可信"
        : "观测不可信，无法判断任务是否正常",
      isStale: Boolean(staleReason) || snapshot.observation?.stale === true,
      staleReason,
      loadedAt: normalizeText(options.loadedAt, "未提供"),
      sourceIdentity,
    },
    primaryDiagnostic: diagnostics[0] ?? null,
    diagnostics,
    nextAction: formatNextAction(snapshot.next_actions?.[0]),
  };
}

export function validateSnapshotSource(
  value: unknown,
  expectedTaskPath: string
): true | false | "unknown" {
  const snapshot = isRecord(value) ? (value as SnapshotV3) : {};
  const actual = normalizeText(snapshot.source_task_id, "");
  const expected = normalizeText(expectedTaskPath, "");
  if (!actual || !expected) {
    return "unknown";
  }
  return actual === expected;
}

export function formatRollupState(value: unknown): string {
  const state = normalizeText(value, "unknown");
  const labels: Record<string, string> = {
    running: "任务进行中",
    blocked: "存在阻塞子任务",
    awaiting_current_verification: "等待当前任务验证",
    inconsistent: "父子状态矛盾",
    contract_invalid: "任务合同无效",
    done: "任务可信完成",
    unknown: "汇总状态未知",
  };
  return labels[state] ?? state;
}

export function formatChildEvidenceHealth(value: unknown): string {
  const labels: Record<EvidenceHealth, string> = {
    missing: "缺失",
    invalid: "无效",
    valid: "有效",
  };
  if (isRecord(value)) {
    return [
      `执行${labels[normalizeEvidenceValue(value.execution)]}`,
      `验证${labels[normalizeEvidenceValue(value.verification)]}`,
      `交付${labels[normalizeEvidenceValue(value.delivery)]}`,
    ].join(" · ");
  }
  return labels[normalizeEvidenceValue(value)];
}

export function formatCurrentTaskProgress(input: {
  hasChildren: boolean;
  childrenTrustedDone: number;
  childrenTotal: number;
  acceptance: SnapshotAcceptanceItem[];
  evidence: SnapshotEvidenceHealth;
}): string {
  if (input.hasChildren) {
    return `${input.childrenTrustedDone}/${input.childrenTotal} 个直接子任务可信完成`;
  }
  const acceptanceChecked = input.acceptance.filter(
    (item) => item.checked === true
  ).length;
  const evidenceValid = [
    input.evidence.execution,
    input.evidence.verification,
    input.evidence.delivery,
  ].filter((health) => health === "valid").length;
  return `自身验收 ${acceptanceChecked}/${input.acceptance.length} · 证据 ${evidenceValid}/3`;
}

export function formatNextAction(action?: Record<string, unknown>): string | null {
  if (!action) {
    return null;
  }
  const summary = normalizeText(action.summary, "");
  if (summary) {
    return summary;
  }
  const kind = normalizeText(action.kind, "unknown");
  const labels: Record<string, string> = {
    continue_current_task: "继续当前任务",
    resolve_child_blockers: "处理直接子任务阻塞",
    complete_current_verification: "完成当前任务验证",
    resolve_contradictions: "处理父子状态矛盾",
    repair_contract: "修复当前任务合同",
  };
  const taskIds = Array.isArray(action.task_ids)
    ? action.task_ids.map(String).filter(Boolean)
    : [];
  const label = labels[kind] ?? kind;
  return taskIds.length ? `${label}：${taskIds.join("、")}` : label;
}

export function resolveDiagnosticTarget(
  taskPath: string,
  source?: SnapshotSource
): { linkText: string; line: number | null; editorLine: number | null } {
  const line =
    typeof source?.line_start === "number" && source.line_start > 0
      ? source.line_start
      : null;
  const heading =
    line === null
      ? normalizeText(source?.after_section, normalizeText(source?.section, ""))
      : normalizeText(source?.section, "");
  return {
    linkText: heading ? `${taskPath}#${heading}` : taskPath,
    line,
    editorLine: line === null ? null : line - 1,
  };
}

function createChildViewModel(
  child: SnapshotTaskSummary
): DashboardChildViewModel {
  const id = normalizeText(child.id, "");
  return {
    id,
    title: normalizeText(child.title, id || "未命名子任务"),
    status: normalizeText(child.status, "unknown"),
    priority: normalizeText(child.priority, "未提供"),
    isBlocked: child.is_blocked === true,
    blockedBy: (child.blocked_by ?? []).map(normalizeBlockedBy).filter(Boolean),
    goal: normalizeText(child.goal, "未提供"),
    hasChildren: child.has_children === true,
    rollupState: normalizeText(child.rollup_state, "unknown"),
    semanticStatus: normalizeText(child.semantic_status, "unknown"),
    evidenceHealth: normalizeEvidenceHealth(child.evidence_health),
    trustedDone: child.trusted_done === true,
    primaryDiagnostic: child.primary_diagnostic
      ? normalizeDiagnostic(child.primary_diagnostic, id)
      : null,
  };
}

function normalizeParent(
  parent: SnapshotV3["parent"]
): { id: string; title: string; status: string } | null {
  if (!parent) {
    return null;
  }
  return {
    id: normalizeText(parent.id, ""),
    title: normalizeText(parent.title, "未命名父任务"),
    status: normalizeText(parent.status, "unknown"),
  };
}

function normalizeDiagnostic(
  value: unknown,
  fallbackTaskId: string
): SnapshotDiagnostic {
  const diagnostic = isRecord(value) ? value : {};
  const reason = isRecord(diagnostic.reason) ? diagnostic.reason : {};
  const remediation = isRecord(diagnostic.remediation)
    ? diagnostic.remediation
    : {};
  return {
    code: normalizeText(diagnostic.code, "unknown_diagnostic"),
    severity: normalizeText(diagnostic.severity, "error"),
    taskId: normalizeText(diagnostic.task_id, fallbackTaskId),
    path: normalizeText(diagnostic.path, "未提供"),
    source: isRecord(diagnostic.source)
      ? (diagnostic.source as SnapshotSource)
      : undefined,
    reason: normalizeText(
      reason.actual,
      normalizeText(diagnostic.reason, "producer 未提供")
    ),
    expected: normalizeText(reason.expected, "producer 未提供"),
    remediation: normalizeText(
      remediation.summary,
      normalizeText(diagnostic.remediation, "producer 未提供")
    ),
  };
}

function normalizeBlockedBy(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value)) {
    return normalizeText(value.uid, normalizeText(value.id, ""));
  }
  return "";
}

function normalizeEvidenceHealth(
  value?: SnapshotEvidenceHealth
): Required<SnapshotEvidenceHealth> {
  return {
    execution: normalizeEvidenceValue(value?.execution),
    verification: normalizeEvidenceValue(value?.verification),
    delivery: normalizeEvidenceValue(value?.delivery),
  };
}

function normalizeEvidenceValue(value: unknown): EvidenceHealth {
  return value === "valid" || value === "invalid" ? value : "missing";
}

function normalizeObservationHealth(value: unknown): ObservationHealth {
  return value === "healthy" ||
    value === "degraded" ||
    value === "failed" ||
    value === "error"
    ? value
    : "unknown";
}

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
