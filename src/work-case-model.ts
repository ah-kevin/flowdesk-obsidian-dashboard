export type WorkCaseSourceType = "work-case" | "session";
export type WorkCaseObservationHealth = "healthy" | "degraded" | "unavailable";

export interface WorkCaseSourceRange {
  lineStart: number;
  lineEnd: number;
}

export interface WorkCaseSectionBlock {
  heading: string;
  level: number;
  text: string;
  source: WorkCaseSourceRange;
}

export interface WorkCaseTaskItem {
  id: string;
  title: string;
  status: string;
  statusIsCompleted: boolean | null;
  archived: boolean;
  isBlocked: boolean;
  associationSource: "canonical" | "legacy";
}

export interface WorkCaseDiagnostic {
  code: string;
  severity: string;
  path: string;
  message: string;
}

export interface WorkCaseViewModel {
  source: {
    path: string;
    type: WorkCaseSourceType;
    archived: boolean;
  };
  workCase: {
    title: string;
    status: string | null;
    date: string | null;
    project: string | null;
    agent: string | null;
    workspace: string | null;
    agentSessionId: string | null;
    device: string | null;
    cwd: string | null;
    branch: string | null;
    summaryLastUpdated: string | null;
  };
  current: {
    progressSummary: string | null;
    next: string | null;
    blockers: string | null;
    pending: string | null;
    raw: WorkCaseSectionBlock | null;
  };
  tasks: {
    observationHealth: WorkCaseObservationHealth;
    contextTag: string;
    coverage: { complete: boolean; pages: number };
    counts: {
      total: number | null;
      active: number | null;
      blocked: number | null;
      completed: number | null;
      archived: number | null;
      byStatus: Record<string, number>;
    };
    items: WorkCaseTaskItem[];
    legacyLinks: string[];
  };
  recentProgress: Array<{
    text: string;
    timestamp: string | null;
    source: WorkCaseSourceRange;
  }>;
  sections: {
    goal: WorkCaseSectionBlock[];
    decisions: WorkCaseSectionBlock[];
    discoveries: WorkCaseSectionBlock[];
    blockers: WorkCaseSectionBlock[];
    outcome: WorkCaseSectionBlock[];
    candidatePatterns: WorkCaseSectionBlock[];
    definitionOfDone: WorkCaseSectionBlock[];
  };
  related: {
    project: string | null;
    plans: string[];
    docs: string[];
    sessions: string[];
    related: string[];
  };
  diagnostics: WorkCaseDiagnostic[];
}

export type WorkCaseCompatibilityErrorCode =
  | "unsupported_snapshot_schema"
  | "unsupported_snapshot_model"
  | "unsupported_producer_protocol"
  | "source_identity_mismatch"
  | "unsupported_source_type"
  | "invalid_snapshot_envelope";

export class WorkCaseSnapshotCompatibilityError extends Error {
  constructor(
    readonly code: WorkCaseCompatibilityErrorCode,
    message: string
  ) {
    super(message);
    this.name = "WorkCaseSnapshotCompatibilityError";
  }
}

const SECTION_KEYS = [
  "goal",
  "decisions",
  "discoveries",
  "blockers",
  "outcome",
  "candidate_patterns",
  "definition_of_done",
] as const;

export function createWorkCaseViewModel(
  snapshot: unknown,
  expectedPath: string
): WorkCaseViewModel {
  const root = record(snapshot, "snapshot");
  if (root.snapshot_schema_version !== 1) {
    throw new WorkCaseSnapshotCompatibilityError(
      "unsupported_snapshot_schema",
      `不支持的 Work Case snapshot schema：${String(root.snapshot_schema_version)}`
    );
  }
  if (root.snapshot_model !== "work-case-centric") {
    throw new WorkCaseSnapshotCompatibilityError(
      "unsupported_snapshot_model",
      `不支持的 Work Case snapshot model：${String(root.snapshot_model)}`
    );
  }
  const protocol = record(root.protocol, "protocol");
  if (protocol.producer_protocol_version !== 1) {
    throw new WorkCaseSnapshotCompatibilityError(
      "unsupported_producer_protocol",
      `不支持的 Work Case producer protocol：${String(protocol.producer_protocol_version)}`
    );
  }
  const source = record(root.source, "source");
  const sourcePath = string(source.path, "source.path");
  if (source.identity_match !== true || sourcePath !== expectedPath) {
    throw new WorkCaseSnapshotCompatibilityError(
      "source_identity_mismatch",
      `Work Case 来源身份不匹配：请求 ${expectedPath}，实际 ${sourcePath}`
    );
  }
  if (source.type !== "work-case" && source.type !== "session") {
    throw new WorkCaseSnapshotCompatibilityError(
      "unsupported_source_type",
      `不支持的 Work Case type：${String(source.type || "(missing)")}`
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
    invalid(`tasks.observation_health 无效：${observationHealth}`);
  }

  for (const key of SECTION_KEYS) array(sections[key], `sections.${key}`);

  return {
    source: {
      path: sourcePath,
      type: source.type,
      archived: boolean(source.archived, "source.archived"),
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
      ),
    },
    current: {
      progressSummary: nullableString(current.progress_summary, "current.progress_summary"),
      next: nullableString(current.next, "current.next"),
      blockers: nullableString(current.blockers, "current.blockers"),
      pending: nullableString(current.pending, "current.pending"),
      raw: current.raw === null ? null : section(current.raw, "current.raw"),
    },
    tasks: {
      observationHealth,
      contextTag: string(tasks.context_tag, "tasks.context_tag"),
      coverage: {
        complete: boolean(coverage.complete, "tasks.coverage.complete"),
        pages: number(coverage.pages, "tasks.coverage.pages"),
      },
      counts: {
        total: nullableNumber(counts.total, "tasks.counts.total"),
        active: nullableNumber(counts.active, "tasks.counts.active"),
        blocked: nullableNumber(counts.blocked, "tasks.counts.blocked"),
        completed: nullableNumber(counts.completed, "tasks.counts.completed"),
        archived: nullableNumber(counts.archived, "tasks.counts.archived"),
        byStatus: numberRecord(counts.by_status, "tasks.counts.by_status"),
      },
      items: array(tasks.items, "tasks.items").map((item, index) =>
        taskItem(item, `tasks.items[${index}]`)
      ),
      legacyLinks: stringArray(tasks.legacy_links, "tasks.legacy_links"),
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
          source: sourceRange(value.source, `recent_progress[${index}].source`),
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
      ),
    },
    related: {
      project: nullableString(related.project, "related.project"),
      plans: stringArray(related.plans, "related.plans"),
      docs: stringArray(related.docs, "related.docs"),
      sessions: stringArray(related.sessions, "related.sessions"),
      related: stringArray(related.related, "related.related"),
    },
    diagnostics: array(root.diagnostics, "diagnostics").map((item, index) => {
      const value = record(item, `diagnostics[${index}]`);
      return {
        code: string(value.code, `diagnostics[${index}].code`),
        severity: string(value.severity, `diagnostics[${index}].severity`),
        path: string(value.path, `diagnostics[${index}].path`),
        message: string(value.message, `diagnostics[${index}].message`),
      };
    }),
  };
}

function taskItem(value: unknown, at: string): WorkCaseTaskItem {
  const item = record(value, at);
  const associationSource = string(item.association_source, `${at}.association_source`);
  if (associationSource !== "canonical" && associationSource !== "legacy") {
    invalid(`${at}.association_source 无效`);
  }
  const completed = item.status_is_completed;
  if (completed !== null && typeof completed !== "boolean") {
    invalid(`${at}.status_is_completed 必须为 boolean 或 null`);
  }
  return {
    id: string(item.id, `${at}.id`),
    title: string(item.title, `${at}.title`),
    status: string(item.status, `${at}.status`),
    statusIsCompleted: completed,
    archived: boolean(item.archived, `${at}.archived`),
    isBlocked: boolean(item.is_blocked, `${at}.is_blocked`),
    associationSource,
  };
}

function sectionArray(value: unknown, at: string): WorkCaseSectionBlock[] {
  return array(value, at).map((item, index) => section(item, `${at}[${index}]`));
}

function section(value: unknown, at: string): WorkCaseSectionBlock {
  const item = record(value, at);
  return {
    heading: string(item.heading, `${at}.heading`),
    level: number(item.level, `${at}.level`),
    text: string(item.text, `${at}.text`),
    source: sourceRange(item.source, `${at}.source`),
  };
}

function sourceRange(value: unknown, at: string): WorkCaseSourceRange {
  const range = record(value, at);
  return {
    lineStart: number(range.line_start, `${at}.line_start`),
    lineEnd: number(range.line_end, `${at}.line_end`),
  };
}

function record(value: unknown, at: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${at} 必须为 object`);
  }
  return value as Record<string, any>;
}

function array(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) invalid(`${at} 必须为 array`);
  return value;
}

function string(value: unknown, at: string): string {
  if (typeof value !== "string") invalid(`${at} 必须为 string`);
  return value;
}

function nullableString(value: unknown, at: string): string | null {
  if (value === null) return null;
  return string(value, at);
}

function boolean(value: unknown, at: string): boolean {
  if (typeof value !== "boolean") invalid(`${at} 必须为 boolean`);
  return value;
}

function number(value: unknown, at: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${at} 必须为 number`);
  return value;
}

function nullableNumber(value: unknown, at: string): number | null {
  if (value === null) return null;
  return number(value, at);
}

function stringArray(value: unknown, at: string): string[] {
  return array(value, at).map((item, index) => string(item, `${at}[${index}]`));
}

function numberRecord(value: unknown, at: string): Record<string, number> {
  const input = record(value, at);
  return Object.fromEntries(
    Object.entries(input).map(([key, item]) => [key, number(item, `${at}.${key}`)])
  );
}

function isObservationHealth(value: string): value is WorkCaseObservationHealth {
  return value === "healthy" || value === "degraded" || value === "unavailable";
}

function invalid(message: string): never {
  throw new WorkCaseSnapshotCompatibilityError(
    "invalid_snapshot_envelope",
    `Work Case snapshot envelope 无效：${message}`
  );
}
