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
  evidence?: Record<string, unknown> | null;
}

export interface SnapshotAcceptanceItem {
  uid?: string;
  label?: string;
  required?: boolean;
  text?: string;
  checked?: boolean;
  source?: SnapshotSource;
}

export interface SnapshotContractItem {
  uid?: string;
  label?: string;
  covers?: string[];
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
  completion?: SnapshotCompletion;
  evidence_requirements?: SnapshotStructuredEvidenceRequirement[];
  acceptance?: SnapshotDerivedAcceptance[];
  review?: SnapshotReviewSummary;
  legacy_v3?: {
    semantic_status?: string;
    evidence_health?: SnapshotEvidenceHealth;
    contract?: SnapshotTaskContract;
  };
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
  schema?: string;
  task_id?: string;
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

export interface SnapshotCompletion {
  lifecycle_status?: string;
  contract_status?: string;
  evidence_status?: string;
  verification_status?: string;
  review_status?: string;
  acceptance_status?: string;
  trust_level?: string;
  trusted_done?: boolean;
}

export interface SnapshotStructuredEvidenceRequirement {
  uid?: string;
  component_uid?: string;
  semantic_revision?: number;
  method?: string;
  required?: boolean;
  satisfies?: string[];
  expected?: Record<string, unknown>;
  review_required?: boolean;
  status?: string;
  run_id?: string | null;
  actual?: Record<string, unknown> | null;
  matched_expected?: boolean | null;
  provenance?: string;
  stdout_digest?: string | null;
  stderr_digest?: string | null;
  runtime_origin?: string | null;
  implementation_digest?: string | null;
}

export interface SnapshotDerivedAcceptance {
  uid?: string;
  label?: string;
  required?: boolean;
  status?: string;
  evidence_requirement_uids?: string[];
}

export interface SnapshotReviewSummary {
  status?: string;
  requirement_uids?: string[];
  component_revisions?: Record<string, number>;
  evidence_bundle_digest?: string | null;
  record?: Record<string, unknown> | null;
}

export interface SnapshotProtocol {
  producer_protocol_version?: number;
  task_contract_schema?: string | null;
  evidence_contract_schema?: string | null;
  evidence_record_schema?: string | null;
  review_record_schema?: string | null;
  legacy_policy?: string;
}

export interface SnapshotV4 {
  snapshot_schema_version?: number;
  snapshot_model?: string;
  source?: {
    task_id?: string;
    generated_at?: string;
    working_directory?: string;
    runtime_origin?: string;
    implementation_digest?: string;
  };
  observation?: SnapshotObservation;
  contract?: {
    status?: string;
    task_contract?: SnapshotTaskContract;
    evidence_contract?: Record<string, unknown>;
    contract_digest?: string;
    mirror_status?: string;
  };
  current_task?: SnapshotTaskSummary;
  parent?: Pick<SnapshotTaskSummary, "id" | "title" | "status"> | null;
  children?: SnapshotTaskSummary[];
  rollup?: SnapshotRollup;
  diagnostics?: unknown[];
  next_actions?: Record<string, unknown>[];
  protocol?: SnapshotProtocol;
}

export type ExecutionSnapshot = SnapshotV3 | SnapshotV4;

export interface CompletionDimensions {
  lifecycleStatus: string;
  contractStatus: string;
  evidenceStatus: string;
  verificationStatus: string;
  reviewStatus: string;
  acceptanceStatus: string;
  trustLevel: string;
  trustedDone: boolean;
}

export interface StructuredEvidenceRequirement {
  uid: string;
  componentUid: string;
  semanticRevision: number;
  method: string;
  required: boolean;
  satisfies: string[];
  expected: Record<string, unknown>;
  reviewRequired: boolean;
  status: string;
  runId: string | null;
  actual: Record<string, unknown> | null;
  matchedExpected: boolean | null;
  provenance: string;
  stdoutDigest: string | null;
  stderrDigest: string | null;
  runtimeOrigin: string | null;
  implementationDigest: string | null;
}

export interface DerivedAcceptance {
  uid: string;
  label: string;
  required: boolean;
  status: string;
  evidenceRequirementUids: string[];
}

export interface ReviewSummary {
  status: string;
  requirementUids: string[];
  componentRevisions: Record<string, number>;
  evidenceBundleDigest: string | null;
  record: Record<string, unknown> | null;
}

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
  trustLevel: string;
  completion: CompletionDimensions;
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
    | "unsupported_snapshot_protocol"
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
  evidenceRequirements: StructuredEvidenceRequirement[];
  acceptance: DerivedAcceptance[];
  review: ReviewSummary;
  protocol: {
    supported: boolean;
    producerProtocolVersion: number;
    taskContractSchema: string;
    evidenceContractSchema: string;
    evidenceRecordSchema: string;
    reviewRecordSchema: string;
    legacyPolicy: string;
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
  const snapshot = isRecord(value) ? (value as ExecutionSnapshot) : {};
  const schemaVersion = snapshot.snapshot_schema_version;
  const isV4 = schemaVersion === 4;
  const isV3 = schemaVersion === 3;
  const v4Snapshot = isV4 ? (snapshot as SnapshotV4) : null;
  const v3Snapshot = isV3 ? (snapshot as SnapshotV3) : null;
  const schemaSupported = isV3 || isV4;
  const modelSupported = snapshot.snapshot_model === "task-centric";
  const protocol = normalizeProtocol(v4Snapshot?.protocol, isV3);
  const protocolSupported = protocol.supported;
  const currentTask = snapshot.current_task ?? {};
  const currentTaskId = normalizeText(
    currentTask.id,
    snapshotSourceTaskId(snapshot)
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
    protocolSupported &&
    observationHealth === "healthy" &&
    snapshot.observation?.current_task === "observed" &&
    parentObserved &&
    snapshot.observation?.children === "observed" &&
    snapshot.observation?.tasknotes_api === "ok" &&
    sourceIdentityMatch === true &&
    snapshot.observation?.stale === false &&
    sourceIdentity === true &&
    !staleReason;
  const evidenceRequirements = isV4
    ? (currentTask.evidence_requirements ?? []).map(
        normalizeStructuredEvidenceRequirement
      )
    : [];
  const acceptance = isV4
    ? (currentTask.acceptance ?? []).map(normalizeDerivedAcceptance)
    : [];
  const review = isV4
    ? normalizeReviewSummary(currentTask.review)
    : emptyReviewSummary("legacy_v3");
  const completion = isV4
    ? normalizeCompletion(currentTask.completion, currentTask.status)
    : legacyCompletion(currentTask, v3Snapshot ?? {});
  const evidence = isV4
    ? completion.trustLevel === "legacy_v3"
      ? normalizeEvidenceHealth(currentTask.legacy_v3?.evidence_health)
      : evidenceHealthFromCompletion(completion)
    : normalizeEvidenceHealth(v3Snapshot?.evidence);
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
        : !protocolSupported
          ? "unsupported_snapshot_protocol"
        : null,
    schemaSupported,
    modelSupported,
    schemaLabel:
      schemaSupported && modelSupported && protocolSupported
        ? isV4
          ? "snapshot v4 · task-centric"
          : "snapshot v3 · task-centric · legacy_v3"
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
      trustedDone: completion.trustedDone,
      trustLevel: completion.trustLevel,
      completion,
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
      version: isV4
        ? normalizeText(
            v4Snapshot?.contract?.task_contract?.schema,
            normalizeText(
              v4Snapshot?.contract?.task_contract?.version,
              "未提供"
            )
          )
        : normalizeText(v3Snapshot?.contract?.version, "未提供"),
      goal: isV4
        ? normalizeText(v4Snapshot?.contract?.task_contract?.goal, "未提供")
        : normalizeText(v3Snapshot?.contract?.goal, "未提供"),
      scope: {
        included: (isV4
          ? v4Snapshot?.contract?.task_contract?.scope?.included
          : v3Snapshot?.contract?.scope?.included ?? []
        )?.map(String) ?? [],
        excluded: (isV4
          ? v4Snapshot?.contract?.task_contract?.scope?.excluded
          : v3Snapshot?.contract?.scope?.excluded ?? []
        )?.map(String) ?? [],
      },
      semanticStatus: isV4
        ? v4Snapshot?.contract?.status === "legacy_v3"
          ? normalizeText(
              v4Snapshot.contract.task_contract?.semantic_status,
              "unknown"
            )
          : normalizeText(v4Snapshot?.contract?.status, "unknown")
        : normalizeText(
            v3Snapshot?.contract?.semantic_status,
            "unknown"
          ),
      requirements: isV4
        ? v4Snapshot?.contract?.task_contract?.requirements ?? []
        : v3Snapshot?.contract?.requirements ?? [],
      scenarios: isV4
        ? v4Snapshot?.contract?.task_contract?.scenarios ?? []
        : v3Snapshot?.contract?.scenarios ?? [],
      acceptance: isV4
        ? v4Snapshot?.contract?.task_contract?.acceptance ?? []
        : v3Snapshot?.contract?.acceptance ?? [],
    },
    evidenceRequirements,
    acceptance,
    review,
    protocol,
    evidence,
    observation: {
      health: observationHealth,
      currentTask: normalizeText(snapshot.observation?.current_task, "unknown"),
      parent: normalizeText(snapshot.observation?.parent, "unknown"),
      children: normalizeText(snapshot.observation?.children, "unknown"),
      tasknotesApi: normalizeText(snapshot.observation?.tasknotes_api, "unknown"),
      sourceIdentityMatch,
      sourceTaskId: snapshotSourceTaskId(snapshot),
      generatedAt: isV4
        ? normalizeText(v4Snapshot?.source?.generated_at, "未提供")
        : normalizeText(v3Snapshot?.generated_at, "未提供"),
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
  const snapshot = isRecord(value) ? (value as ExecutionSnapshot) : {};
  const actual = snapshotSourceTaskId(snapshot);
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

export function resolveDiagnosticNavigation(
  taskPath: string,
  source?: SnapshotSource
): {
  canOpen: boolean;
  target: ReturnType<typeof resolveDiagnosticTarget>;
} {
  return {
    canOpen: Boolean(taskPath.trim()),
    target: resolveDiagnosticTarget(taskPath, source),
  };
}

function snapshotSourceTaskId(snapshot: ExecutionSnapshot): string {
  return snapshot.snapshot_schema_version === 4
    ? normalizeText((snapshot as SnapshotV4).source?.task_id, "")
    : normalizeText((snapshot as SnapshotV3).source_task_id, "");
}

function normalizeProtocol(
  value: SnapshotProtocol | undefined,
  isLegacyV3: boolean
): DashboardViewModel["protocol"] {
  if (isLegacyV3) {
    return {
      supported: true,
      producerProtocolVersion: 3,
      taskContractSchema: "flowdesk.task-contract/3",
      evidenceContractSchema: "legacy_v3",
      evidenceRecordSchema: "legacy_v3",
      reviewRecordSchema: "legacy_v3",
      legacyPolicy: "explicit_legacy_v3",
    };
  }
  const protocol = value ?? {};
  const normalized = {
    producerProtocolVersion: finiteNumber(protocol.producer_protocol_version),
    taskContractSchema: normalizeText(protocol.task_contract_schema, ""),
    evidenceContractSchema: normalizeText(protocol.evidence_contract_schema, ""),
    evidenceRecordSchema: normalizeText(protocol.evidence_record_schema, ""),
    reviewRecordSchema: normalizeText(protocol.review_record_schema, ""),
    legacyPolicy: normalizeText(protocol.legacy_policy, ""),
  };
  // 判定层拆除后 producer 不再产 legacy_policy，因此它只作为显式 legacy 路径的
  // 附加标记，不能作为标准 v4 protocol 的必要条件——否则 supported 恒为 false。
  return {
    supported:
      (normalized.producerProtocolVersion === 4 &&
        normalized.taskContractSchema === "flowdesk.task-contract/4" &&
        normalized.evidenceContractSchema === "flowdesk.evidence-contract/1" &&
        normalized.evidenceRecordSchema === "flowdesk.evidence-record/1" &&
        normalized.reviewRecordSchema === "flowdesk.review-record/1") ||
      (normalized.producerProtocolVersion === 4 &&
        normalized.taskContractSchema === "legacy_v3" &&
        protocol.evidence_contract_schema === null &&
        protocol.evidence_record_schema === null &&
        protocol.review_record_schema === null &&
        normalized.legacyPolicy === "explicit_legacy_v3"),
    ...normalized,
  };
}

function normalizeCompletion(
  value: SnapshotCompletion | undefined,
  fallbackStatus: unknown
): CompletionDimensions {
  const completion = value ?? {};
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
    trustedDone: completion.trusted_done === true,
  };
}

function legacyCompletion(
  currentTask: SnapshotTaskSummary,
  snapshot: SnapshotV3
): CompletionDimensions {
  const evidence = normalizeEvidenceHealth(snapshot.evidence);
  const evidenceValues = [
    evidence.execution,
    evidence.verification,
    evidence.delivery,
  ];
  const acceptance = snapshot.contract?.acceptance ?? [];
  return {
    lifecycleStatus: normalizeText(currentTask.status, "unknown"),
    contractStatus: normalizeText(
      snapshot.contract?.semantic_status,
      "unknown"
    ),
    evidenceStatus: evidenceValues.every((value) => value === "valid")
      ? "satisfied"
      : evidenceValues.some((value) => value === "invalid")
        ? "invalid"
        : "missing",
    verificationStatus:
      evidence.verification === "valid"
        ? "passed"
        : evidence.verification === "invalid"
          ? "failed"
          : "missing",
    reviewStatus: "legacy_v3",
    acceptanceStatus:
      acceptance.length > 0 && acceptance.every((item) => item.checked === true)
        ? "satisfied"
        : "incomplete",
    trustLevel: "legacy_v3",
    trustedDone: currentTask.trusted_done === true,
  };
}

function evidenceHealthFromCompletion(
  completion: CompletionDimensions
): Required<SnapshotEvidenceHealth> {
  const evidence =
    completion.evidenceStatus === "satisfied"
      ? "valid"
      : completion.evidenceStatus === "failed" ||
          completion.evidenceStatus === "invalid"
        ? "invalid"
        : "missing";
  const verification =
    completion.verificationStatus === "passed"
      ? "valid"
      : completion.verificationStatus === "failed"
        ? "invalid"
        : "missing";
  const delivery =
    completion.reviewStatus === "approved" &&
    completion.acceptanceStatus === "satisfied"
      ? "valid"
      : completion.reviewStatus === "changes_requested"
        ? "invalid"
        : "missing";
  return { execution: evidence, verification, delivery };
}

function normalizeStructuredEvidenceRequirement(
  value: SnapshotStructuredEvidenceRequirement
): StructuredEvidenceRequirement {
  return {
    uid: normalizeText(value.uid, "未提供"),
    componentUid: normalizeText(value.component_uid, "未提供"),
    semanticRevision: finiteNumber(value.semantic_revision),
    method: normalizeText(value.method, "unknown"),
    required: value.required === true,
    satisfies: (value.satisfies ?? []).map(String),
    expected: isRecord(value.expected) ? value.expected : {},
    reviewRequired: value.review_required === true,
    status: normalizeText(value.status, "unknown"),
    runId: nullableText(value.run_id),
    actual: isRecord(value.actual) ? value.actual : null,
    matchedExpected:
      typeof value.matched_expected === "boolean"
        ? value.matched_expected
        : null,
    provenance: normalizeText(value.provenance, "unknown"),
    stdoutDigest: nullableText(value.stdout_digest),
    stderrDigest: nullableText(value.stderr_digest),
    runtimeOrigin: nullableText(value.runtime_origin),
    implementationDigest: nullableText(value.implementation_digest),
  };
}

function normalizeDerivedAcceptance(
  value: SnapshotDerivedAcceptance
): DerivedAcceptance {
  return {
    uid: normalizeText(value.uid, "未提供"),
    label: normalizeText(value.label, "未提供"),
    required: value.required === true,
    status: normalizeText(value.status, "unknown"),
    evidenceRequirementUids: (value.evidence_requirement_uids ?? []).map(String),
  };
}

function normalizeReviewSummary(
  value: SnapshotReviewSummary | undefined
): ReviewSummary {
  const review = value ?? {};
  return {
    status: normalizeText(review.status, "not_required"),
    requirementUids: (review.requirement_uids ?? []).map(String),
    componentRevisions: isRecord(review.component_revisions)
      ? Object.fromEntries(
          Object.entries(review.component_revisions).filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === "number" && Number.isFinite(entry[1])
          )
        )
      : {},
    evidenceBundleDigest: nullableText(review.evidence_bundle_digest),
    record: isRecord(review.record) ? review.record : null,
  };
}

function emptyReviewSummary(status: string): ReviewSummary {
  return {
    status,
    requirementUids: [],
    componentRevisions: {},
    evidenceBundleDigest: null,
    record: null,
  };
}

function createChildViewModel(
  child: SnapshotTaskSummary
): DashboardChildViewModel {
  const id = normalizeText(child.id, "");
  const completion = child.completion
    ? normalizeCompletion(child.completion, child.status)
    : null;
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
    semanticStatus: normalizeText(
      child.legacy_v3?.semantic_status,
      normalizeText(child.semantic_status, "unknown")
    ),
    evidenceHealth:
      completion?.trustLevel === "legacy_v3"
        ? normalizeEvidenceHealth(child.legacy_v3?.evidence_health)
        : completion
          ? evidenceHealthFromCompletion(completion)
          : normalizeEvidenceHealth(child.evidence_health),
    trustedDone: completion
      ? completion.trustedDone
      : child.trusted_done === true,
    primaryDiagnostic: child.primary_diagnostic
      ? normalizeDiagnostic(child.primary_diagnostic, id)
      : null,
  };
}

function normalizeParent(
  parent: ExecutionSnapshot["parent"]
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
  const evidence = isRecord(diagnostic.evidence) ? diagnostic.evidence : null;
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
    expected: normalizeText(
      reason.expected,
      normalizeText(
        diagnostic.expected,
        evidence ? JSON.stringify(evidence) : "producer 未提供"
      )
    ),
    remediation: normalizeText(
      remediation.summary,
      normalizeText(
        diagnostic.next_action,
        normalizeText(diagnostic.remediation, "producer 未提供")
      )
    ),
    evidence,
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

function nullableText(value: unknown): string | null {
  const normalized = normalizeText(value, "");
  return normalized || null;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
