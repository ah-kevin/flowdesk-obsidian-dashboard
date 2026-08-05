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
  covers?: string[];
  source?: SnapshotSource;
}

export interface SnapshotEvidenceHealth {
  execution?: EvidenceHealth;
  verification?: EvidenceHealth;
  delivery?: EvidenceHealth;
}

export interface TaskTreeRoot {
  id?: string;
  title?: string;
  status?: string;
  priority?: string;
}

export interface TaskTreeChild extends TaskTreeRoot {
  is_blocked?: boolean;
  blocked_by?: unknown[];
  goal?: string;
  covers?: string[];
  acceptance?: SnapshotAcceptanceItem[];
  semantic_status?: string;
  evidence_health?: SnapshotEvidenceHealth;
  trusted_done?: boolean;
}

export interface RollupTaskReference {
  id?: string;
  title?: string;
  status?: string;
}

export interface SnapshotV3 {
  snapshot_schema_version?: number;
  generated_at?: string;
  source_task_id?: string;
  observation?: {
    health?: string;
    parent?: string;
    children?: string;
    tasknotes_api?: string;
    source_identity_match?: boolean;
  };
  contract?: {
    version?: string;
    role?: string;
    why?: string;
    what?: {
      allowed?: string[];
      forbidden?: string[];
    };
    requirements?: SnapshotContractItem[];
    scenarios?: SnapshotContractItem[];
    overall_acceptance?: SnapshotAcceptanceItem[];
    semantic_status?: string;
  };
  task_tree?: {
    root?: TaskTreeRoot;
    children?: TaskTreeChild[];
    counts?: {
      total?: number;
      open?: number;
      in_progress?: number;
      blocked?: number;
      done?: number;
      trusted_done?: number;
    };
  };
  rollup?: {
    state?: string;
    children_complete?: boolean;
    trusted_children_complete?: boolean;
    blocked_children?: RollupTaskReference[];
    incomplete_children?: RollupTaskReference[];
    contradictions?: unknown[];
  };
  evidence?: {
    root?: SnapshotEvidenceHealth;
    children?: Record<string, SnapshotEvidenceHealth>;
  };
  diagnostics?: unknown[];
  next_actions?: Record<string, unknown>[];
}

export type ExecutionSnapshot = SnapshotV3;

export interface DashboardChildViewModel {
  id: string;
  title: string;
  status: string;
  priority: string;
  isBlocked: boolean;
  blockedBy: string[];
  goal: string;
  covers: string[];
  acceptance: Array<{ text: string; checked: boolean; source?: SnapshotSource }>;
  semanticStatus: string;
  evidenceHealth: Required<SnapshotEvidenceHealth>;
  trustedDone: boolean;
}

export interface DashboardViewModel {
  errorCode: "unsupported_snapshot_schema" | null;
  schemaLabel: string;
  hero: {
    title: string;
    status: string;
    priority: string;
    rollupLabel: string;
    workProgressLabel: string;
    trustedDone: number;
    total: number;
    blockedCount: number;
  };
  root: {
    id: string;
    title: string;
    status: string;
    priority: string;
    evidenceHealth: Required<SnapshotEvidenceHealth>;
  };
  children: DashboardChildViewModel[];
  rollup: {
    state: string;
    childrenComplete: boolean;
    trustedChildrenComplete: boolean;
    blockedChildren: RollupTaskReference[];
    incompleteChildren: RollupTaskReference[];
    contradictions: unknown[];
  };
  contract: {
    version: string;
    role: string;
    semanticStatus: string;
    requirements: SnapshotContractItem[];
    scenarios: SnapshotContractItem[];
    overallAcceptance: SnapshotAcceptanceItem[];
  };
  observation: {
    health: ObservationHealth;
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
  const supported = snapshot.snapshot_schema_version === 3;
  const root = snapshot.task_tree?.root ?? {};
  const counts = snapshot.task_tree?.counts ?? {};
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
  const isTrustworthy =
    supported &&
    observationHealth === "healthy" &&
    snapshot.observation?.parent === "observed" &&
    snapshot.observation?.children === "observed" &&
    snapshot.observation?.tasknotes_api === "ok" &&
    sourceIdentityMatch === true &&
    sourceIdentity !== false &&
    !staleReason;
  const rootId = normalizeText(root.id, normalizeText(snapshot.source_task_id, ""));
  const children = (snapshot.task_tree?.children ?? []).map((child) =>
    createChildViewModel(child, snapshot.evidence?.children)
  );
  const diagnostics = (snapshot.diagnostics ?? []).map((diagnostic) =>
    normalizeDiagnostic(diagnostic, rootId)
  );
  const total = finiteNumber(counts.total);
  const trustedDone = finiteNumber(counts.trusted_done);
  const blockedCount = finiteNumber(counts.blocked);

  return {
    errorCode: supported ? null : "unsupported_snapshot_schema",
    schemaLabel: supported ? "snapshot v3" : "不支持的 snapshot schema",
    hero: {
      title: normalizeText(root.title, "未提供任务标题"),
      status: normalizeText(root.status, "unknown"),
      priority: normalizeText(root.priority, "未提供"),
      rollupLabel: formatRollupState(rollup.state),
      workProgressLabel: `${trustedDone}/${total} 子任务可信完成`,
      trustedDone,
      total,
      blockedCount,
    },
    root: {
      id: rootId,
      title: normalizeText(root.title, "未提供任务标题"),
      status: normalizeText(root.status, "unknown"),
      priority: normalizeText(root.priority, "未提供"),
      evidenceHealth: normalizeEvidenceHealth(snapshot.evidence?.root),
    },
    children,
    rollup: {
      state: normalizeText(rollup.state, "unknown"),
      childrenComplete: rollup.children_complete === true,
      trustedChildrenComplete: rollup.trusted_children_complete === true,
      blockedChildren: rollup.blocked_children ?? [],
      incompleteChildren: rollup.incomplete_children ?? [],
      contradictions: rollup.contradictions ?? [],
    },
    contract: {
      version: normalizeText(snapshot.contract?.version, "未提供"),
      role: normalizeText(snapshot.contract?.role, "未提供"),
      semanticStatus: normalizeText(snapshot.contract?.semantic_status, "unknown"),
      requirements: snapshot.contract?.requirements ?? [],
      scenarios: snapshot.contract?.scenarios ?? [],
      overallAcceptance: snapshot.contract?.overall_acceptance ?? [],
    },
    observation: {
      health: observationHealth,
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
      isStale: Boolean(staleReason),
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
    running: "子任务进行中",
    blocked: "存在阻塞子任务",
    awaiting_parent_verification: "等待父任务整体验证",
    inconsistent: "父子状态矛盾",
    contract_invalid: "任务合同无效",
    done: "整体完成",
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
  return labels[normalizeEvidenceValue(value)];
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
    continue_child_work: "继续当前子任务",
    resolve_child_blockers: "处理子任务阻塞",
    complete_parent_verification: "完成父任务整体验证",
    resolve_contradictions: "处理父子状态矛盾",
    repair_contract: "修复任务合同",
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
): { linkText: string; line: number | null } {
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
  };
}

function createChildViewModel(
  child: TaskTreeChild,
  evidenceByChild?: Record<string, SnapshotEvidenceHealth>
): DashboardChildViewModel {
  const id = normalizeText(child.id, "");
  const childEvidence = child.evidence_health ?? evidenceByChild?.[id];
  return {
    id,
    title: normalizeText(child.title, id || "未命名子任务"),
    status: normalizeText(child.status, "unknown"),
    priority: normalizeText(child.priority, "未提供"),
    isBlocked: child.is_blocked === true,
    blockedBy: (child.blocked_by ?? []).map(normalizeBlockedBy).filter(Boolean),
    goal: normalizeText(child.goal, "未提供"),
    covers: (child.covers ?? []).map(String),
    acceptance: (child.acceptance ?? []).map((item) => ({
      text: normalizeText(item.text, "未提供"),
      checked: item.checked === true,
      source: item.source,
    })),
    semanticStatus: normalizeText(child.semantic_status, "unknown"),
    evidenceHealth: normalizeEvidenceHealth(childEvidence),
    trustedDone: child.trusted_done === true,
  };
}

function normalizeDiagnostic(value: unknown, fallbackTaskId: string): SnapshotDiagnostic {
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
