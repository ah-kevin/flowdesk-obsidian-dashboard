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
}

export function createDashboardViewModel(
  snapshot: ExecutionSnapshot
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

  return {
    schemaLabel: schemaVersion === 2 ? "snapshot v2" : "旧版 snapshot",
    state: normalizeText(snapshot.state?.value, "unknown"),
    compatibility,
    observation: {
      health,
      generatedAt: normalizeText(snapshot.observation?.generated_at, "未提供"),
      sourceTaskId: normalizeText(snapshot.observation?.source_task_id, ""),
      coverage: Object.entries(snapshot.observation?.coverage ?? {}).map(
        ([key, value]) => ({ key, value: normalizeText(value, "unknown") })
      ),
      isTrustworthy: schemaVersion === 2 && health === "healthy",
    },
    inlineProgress: inlineExecution
      ? {
          completed:
            typeof inlineExecution.completed === "number"
              ? inlineExecution.completed
              : null,
          total:
            typeof inlineExecution.total === "number" ? inlineExecution.total : 0,
          status: normalizeText(inlineExecution.status, "unknown"),
          explicit: inlineExecution.explicit === true,
          tasks: Object.entries(inlineExecution.statuses ?? {}).map(
            ([id, item]) => ({
              id,
              status: normalizeText(item.status, "unknown"),
              inferred: item.inferred === true,
            })
          ),
        }
      : null,
    primaryDiagnostic: diagnostics[0] ?? null,
    diagnostics,
  };
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

export function formatDiagnosticReason(diagnostic: {
  reason?: unknown;
  message?: unknown;
}): string {
  const reason = diagnostic.reason;
  if (isRecord(reason)) {
    return normalizeText(
      reason.actual,
      normalizeText(reason.expected, normalizeText(diagnostic.message, "原因未提供"))
    );
  }
  return normalizeText(reason, normalizeText(diagnostic.message, "原因未提供"));
}

export function formatDiagnosticRemediation(diagnostic: {
  remediation?: unknown;
}): string {
  const remediation = diagnostic.remediation;
  if (isRecord(remediation)) {
    return normalizeText(
      remediation.summary,
      normalizeText(remediation.example, "修法未提供")
    );
  }
  return normalizeText(remediation, "修法未提供");
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
      remediation: "修法未提供",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
