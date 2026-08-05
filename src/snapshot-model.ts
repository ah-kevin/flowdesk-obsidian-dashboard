export type ObservationHealth = "healthy" | "degraded" | "error" | "unknown";

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
  message: string;
  reason: string;
  remediation: string;
  source?: SnapshotSource;
  severity?: string;
  path?: string;
}

interface RawDiagnostic {
  code?: unknown;
  message?: unknown;
  reason?: unknown;
  remediation?: unknown;
  source?: unknown;
  severity?: unknown;
  path?: unknown;
  [key: string]: unknown;
}

export interface FlowNode {
  id?: string;
  label?: string;
  status?: string;
  missing_deps?: string[];
  evidence?: unknown[];
}

export interface ChildTask {
  id?: string;
  title?: string;
  status?: string;
  state?: string;
  covers?: string[];
  blocked_by?: unknown[];
  limitation?: string;
  covers_unresolved?: boolean;
}

export interface IdList {
  count?: number;
  ids?: string[];
}

export interface EvidenceItem {
  exists?: boolean;
  valid?: boolean;
  items?: string[];
  valid_items?: string[];
}

interface InlineTaskStatus {
  status?: string;
  evidence_ref?: string;
  inferred?: boolean;
}

export interface InlineExecution {
  total?: number;
  completed?: number;
  status?: string;
  explicit?: boolean;
  revision?: string;
  revision_match?: boolean;
  derived_from?: string;
  statuses?: Record<string, InlineTaskStatus>;
  diagnostics?: unknown[];
}

export interface TaskMaterialization {
  mode?: string;
  status?: string;
  revision?: string;
  declared?: string[];
  materialized?: string[];
  missing?: string[];
  duplicate?: string[];
  orphan?: string[];
  drifted?: string[];
  conflicts?: string[];
  limitations?: string[];
  coverage?: { complete?: boolean };
}

export interface ExecutionSnapshot {
  snapshot_schema_version?: number | string;
  observation?: {
    generated_at?: string;
    source_task_id?: string;
    health?: string;
    coverage?: Record<string, string>;
    diagnostics?: unknown[];
  };
  compatibility?: {
    contract_version?: string;
    semantic_mode?: string;
    profile?: string;
    label?: string;
  };
  capabilities?: Record<string, boolean>;
  state?: {
    value?: string;
    blocked_reason?: string;
    read_only?: boolean;
  };
  flow_graph?: {
    mode?: string;
    current?: string;
    nodes?: FlowNode[];
    ready?: string[];
    blocked?: string[];
  };
  task_graph?: {
    parent?: {
      id?: string;
      title?: string;
      status?: string;
    };
    counts?: Record<string, number>;
    tasks?: ChildTask[];
    task_materialization?: TaskMaterialization;
    inline_execution?: InlineExecution;
  };
  spec_contract?: {
    version?: string;
    status?: string;
    contract_phase?: string;
    execution_mode?: string;
    requirements?: IdList;
    scenarios?: IdList;
    tasks?: IdList;
    checklist?: {
      total?: number;
      checked?: number;
      unchecked?: number;
    };
    open_questions?: {
      count?: number;
      items?: string[];
    };
    evidence?: Record<string, EvidenceItem>;
    semantic_validation?: {
      mode?: string;
      status?: string;
      errors?: unknown[];
      warnings?: unknown[];
      limitations?: unknown[];
    };
  };
  notepad?: {
    exists?: boolean;
    path?: string;
    priority?: string;
    authoritative?: boolean;
  };
  next_actions?: Record<string, unknown>[];
  task_materialization?: TaskMaterialization;
  inline_execution?: InlineExecution;
}

export interface DashboardViewModel {
  schemaLabel: string;
  state: string;
  hero: {
    title: string;
    status: string;
    currentStage: string;
    progressLabel: string;
    workProgressKind: "inline" | "children" | "unknown";
    workProgressLabel: string;
    inlineLabel: string | null;
  };
  compatibility: {
    label: string;
    profile: string;
  };
  observation: {
    health: ObservationHealth;
    generatedAt: string;
    sourceTaskId: string;
    coverage: Array<{ key: string; value: string }>;
    isTrustworthy: boolean;
    isStale: boolean;
    staleReason: string;
    loadedAt: string;
    sourceIdentity: true | false | "unknown";
  };
  inlineProgress: null | {
    completed: number | null;
    total: number;
    status: string;
    explicit: boolean;
    tasks: Array<{ id: string; status: string; inferred: boolean }>;
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
  snapshot: ExecutionSnapshot,
  options: DashboardModelOptions = {}
): DashboardViewModel {
  const schemaVersion = Number(snapshot.snapshot_schema_version);
  const health = normalizeObservationHealth(snapshot.observation?.health);
  const compatibility = createCompatibility(snapshot);
  const inlineExecution =
    snapshot.inline_execution ?? snapshot.task_graph?.inline_execution;
  const semanticDiagnostics = snapshot.spec_contract?.semantic_validation?.errors ?? [];
  const inlineDiagnostics = inlineExecution?.diagnostics ?? [];
  const observationDiagnostics = snapshot.observation?.diagnostics ?? [];
  const diagnostics = [
    ...semanticDiagnostics,
    ...inlineDiagnostics,
    ...observationDiagnostics,
  ].map(normalizeDiagnostic);
  const inlineProgress = inlineExecution
    ? {
        completed:
          typeof inlineExecution.completed === "number"
            ? inlineExecution.completed
            : null,
        total: typeof inlineExecution.total === "number" ? inlineExecution.total : 0,
        status: normalizeText(inlineExecution.status, "unknown"),
        explicit: inlineExecution.explicit === true,
        tasks: Object.entries(inlineExecution.statuses ?? {}).map(([id, item]) => ({
          id,
          status: normalizeText(item.status, "unknown"),
          inferred: item.inferred === true,
        })),
      }
    : null;
  const hero = createHero(snapshot, inlineProgress);
  const staleReason = normalizeText(options.staleReason, "");
  const sourceIdentity = validateSnapshotSource(
    snapshot,
    normalizeText(options.expectedTaskPath, "")
  );
  const hasObservedSource = Boolean(snapshot.observation?.source_task_id?.trim());

  return {
    schemaLabel: schemaVersion === 2 ? "snapshot v2" : "旧版 snapshot",
    state: normalizeText(snapshot.state?.value, "unknown"),
    hero,
    compatibility,
    observation: {
      health,
      generatedAt: normalizeText(snapshot.observation?.generated_at, "未提供"),
      sourceTaskId: normalizeText(snapshot.observation?.source_task_id, ""),
      coverage: Object.entries(snapshot.observation?.coverage ?? {}).map(
        ([key, value]) => ({ key, value: normalizeText(value, "unknown") })
      ),
      isTrustworthy:
        schemaVersion === 2 &&
        health === "healthy" &&
        hasObservedSource &&
        sourceIdentity !== false &&
        !staleReason,
      isStale: Boolean(staleReason),
      staleReason,
      loadedAt: normalizeText(options.loadedAt, "未提供"),
      sourceIdentity,
    },
    inlineProgress,
    primaryDiagnostic: diagnostics[0] ?? null,
    diagnostics,
    nextAction: formatNextAction(snapshot.next_actions?.[0]),
  };
}

export function validateSnapshotSource(
  snapshot: ExecutionSnapshot,
  expectedTaskPath: string
): true | false | "unknown" {
  const actual = normalizeText(snapshot.observation?.source_task_id, "");
  const expected = normalizeText(expectedTaskPath, "");
  if (!actual || !expected) {
    return "unknown";
  }
  return actual === expected;
}

function createHero(
  snapshot: ExecutionSnapshot,
  inlineProgress: DashboardViewModel["inlineProgress"]
): DashboardViewModel["hero"] {
  const nodes = snapshot.flow_graph?.nodes ?? [];
  const completedStages = nodes.filter((node) => node.status === "done").length;
  const progressLabel = nodes.length
    ? `${completedStages}/${nodes.length} 阶段`
    : "阶段未知";
  const parent = snapshot.task_graph?.parent;
  const counts = snapshot.task_graph?.counts ?? {};
  const childTotal = finiteNumber(counts.total);
  const childDone = finiteNumber(counts.done);

  if (inlineProgress) {
    const completed = inlineProgress.completed ?? "?";
    const inlineLabel = `${completed}/${inlineProgress.total} TASK`;
    return {
      title: normalizeText(parent?.title, "未提供任务标题"),
      status: normalizeText(parent?.status, normalizeText(snapshot.state?.value, "unknown")),
      currentStage: normalizeText(snapshot.flow_graph?.current, "未提供"),
      progressLabel,
      workProgressKind: "inline",
      workProgressLabel: inlineLabel,
      inlineLabel,
    };
  }

  const materializationMode = normalizeText(
    snapshot.task_materialization?.mode,
    normalizeText(snapshot.task_graph?.task_materialization?.mode, "")
  );
  if (materializationMode === "children" || childTotal > 0) {
    return {
      title: normalizeText(parent?.title, "未提供任务标题"),
      status: normalizeText(parent?.status, normalizeText(snapshot.state?.value, "unknown")),
      currentStage: normalizeText(snapshot.flow_graph?.current, "未提供"),
      progressLabel,
      workProgressKind: "children",
      workProgressLabel: `${childDone}/${childTotal} 子任务`,
      inlineLabel: null,
    };
  }

  return {
    title: normalizeText(parent?.title, "未提供任务标题"),
    status: normalizeText(parent?.status, normalizeText(snapshot.state?.value, "unknown")),
    currentStage: normalizeText(snapshot.flow_graph?.current, "未提供"),
    progressLabel,
    workProgressKind: "unknown",
    workProgressLabel: "任务进度未知",
    inlineLabel: null,
  };
}

function formatNextAction(action?: Record<string, unknown>): string | null {
  if (!action) {
    return null;
  }

  const kind = normalizeText(action.kind, "unknown");
  const labels: Record<string, string> = {
    complete_parent_task: "完成父任务",
    continue_inline_implementation: "继续 inline 实施",
    create_task_breakdown: "补充任务拆分",
    dispatch_ready_task: "派发就绪任务",
    materialize_missing_tasks: "物化缺失任务",
    reconcile_plan_revision: "对齐计划版本",
    record_delivery: "记录交付结果",
    refine_spec_contract: "完善 Spec Contract",
    refine_task_granularity: "调整任务粒度",
    resolve_blockers: "处理阻塞项",
    resolve_inline_execution_conflict: "处理 inline 执行冲突",
    resolve_materialization_conflict: "处理任务物化冲突",
    start_implementation: "开始实施",
    verify_scenarios: "验证验收场景",
    wait_for_running_task: "等待运行中的任务",
  };
  const ids = Array.isArray(action.task_ids)
    ? action.task_ids.map(String).filter(Boolean)
    : [];
  const label = labels[kind] ?? kind;
  return ids.length ? `${label}：${ids.join("、")}` : label;
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

export function formatDiagnosticReason(value: unknown): string {
  const diagnostic = isRecord(value) ? value : {};
  const hasWrapper = "reason" in diagnostic || "message" in diagnostic;
  const reason = hasWrapper ? diagnostic.reason : value;
  const message = hasWrapper ? diagnostic.message : undefined;
  if (isRecord(reason)) {
    return normalizeText(
      reason.actual,
      normalizeText(reason.expected, normalizeText(message, "producer 未提供"))
    );
  }
  return normalizeText(reason, normalizeText(message, "producer 未提供"));
}

export function formatDiagnosticRemediation(value: unknown): string {
  const diagnostic = isRecord(value) ? value : {};
  const remediation = "remediation" in diagnostic ? diagnostic.remediation : value;
  if (isRecord(remediation)) {
    return normalizeText(
      remediation.summary,
      normalizeText(remediation.example, "producer 未提供")
    );
  }
  return normalizeText(remediation, "producer 未提供");
}

function createCompatibility(snapshot: ExecutionSnapshot): {
  label: string;
  profile: string;
} {
  const profile = normalizeText(
    snapshot.compatibility?.profile,
    normalizeText(
      snapshot.spec_contract?.execution_mode,
      normalizeText(snapshot.task_materialization?.mode, "unknown")
    )
  );
  const producerLabel = normalizeText(snapshot.compatibility?.label, "");
  if (producerLabel) {
    return { label: producerLabel, profile };
  }

  const contractVersion = normalizeText(
    snapshot.compatibility?.contract_version,
    normalizeText(snapshot.spec_contract?.version, "")
  );
  if (contractVersion) {
    return {
      label: `SDD ${contractVersion}${profile !== "unknown" ? ` · ${profile}` : ""}`,
      profile,
    };
  }

  return { label: "旧版 snapshot · 能力未知", profile: "unknown" };
}

function normalizeDiagnostic(value: unknown): SnapshotDiagnostic {
  if (typeof value === "string") {
    return {
      code: value,
      message: value,
      reason: value,
      remediation: "producer 未提供",
    };
  }

  const diagnostic: RawDiagnostic = isRecord(value) ? value : {};
  const code = normalizeText(diagnostic.code, "unknown_diagnostic");
  return {
    code,
    message: normalizeText(diagnostic.message, code),
    reason: formatDiagnosticReason(diagnostic),
    remediation: formatDiagnosticRemediation(diagnostic),
    source: isRecord(diagnostic.source)
      ? (diagnostic.source as SnapshotSource)
      : undefined,
    severity: normalizeOptionalText(diagnostic.severity),
    path: normalizeOptionalText(diagnostic.path),
  };
}

function normalizeObservationHealth(value: unknown): ObservationHealth {
  return value === "healthy" || value === "degraded" || value === "error"
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

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = normalizeText(value, "");
  return normalized || undefined;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
