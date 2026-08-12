import type {
  WorkCaseSectionBlock,
  WorkCaseSourceRange,
  WorkCaseTaskItem,
  WorkCaseViewModel,
} from "./work-case-model";

export interface WorkCaseTaskPresentation extends WorkCaseTaskItem {
  tone: "active" | "blocked" | "completed" | "archived" | "unknown";
}

export interface WorkCasePresentation {
  header: {
    typeLabel: "WORK CASE";
    title: string;
    status: string;
    project: string;
    dateLabel: string;
    dateTooltip: string;
    badges: string[];
    recoveryContext: Array<{ label: string; value: string }>;
  };
  current: Array<{
    key: "progressSummary" | "next" | "blockers" | "pending";
    label: string;
    value: string;
    source: WorkCaseSourceRange | null;
  }>;
  tasks: {
    health: string;
    completedLabel: string;
    progressPercent: number | null;
    counts: Array<{ label: string; value: string }>;
    byStatus: Array<{ status: string; count: number }>;
    primary: WorkCaseTaskPresentation[];
    history: WorkCaseTaskPresentation[];
    driftWarning: string;
  };
  recentProgress: WorkCaseViewModel["recentProgress"];
  sections: Array<{
    key: keyof WorkCaseViewModel["sections"];
    label: string;
    items: WorkCaseSectionBlock[];
  }>;
  related: Array<{ label: string; targets: string[] }>;
  diagnostics: WorkCaseViewModel["diagnostics"];
}

export function createWorkCasePresentation(
  model: WorkCaseViewModel
): WorkCasePresentation {
  const total = model.tasks.counts.total;
  const completed = model.tasks.counts.completed;
  const primary = model.tasks.items
    .filter(
      (item) =>
        !item.archived && (item.isBlocked || item.statusIsCompleted === false)
    )
    .map(taskPresentation);
  const history = model.tasks.items
    .filter((item) => item.statusIsCompleted === true || item.archived)
    .map(taskPresentation);
  const active = model.tasks.counts.active;
  const caseStatus = (model.workCase.status ?? "").trim();
  const driftWarning =
    active !== null && active > 0 && isClosedCaseStatus(caseStatus)
      ? `Case 状态为 ${caseStatus}，但仍有 ${active} 个 active Task；两者均按原始事实显示。`
      : "";
  const currentSource = model.current.raw?.source ?? null;
  const timestamp = formatWorkCaseTimestamp(
    model.workCase.summaryLastUpdated || model.workCase.date || "时间未记录"
  );

  return {
    header: {
      typeLabel: "WORK CASE",
      title: model.workCase.title,
      status: model.workCase.status || "未记录",
      project: model.workCase.project || "未关联 Project",
      dateLabel: timestamp.label,
      dateTooltip: timestamp.tooltip,
      badges: [
        ...(model.source.type === "session" ? ["legacy"] : []),
        ...(model.source.archived ? ["已归档"] : []),
      ],
      recoveryContext: [
        ["Agent", model.workCase.agent],
        ["Workspace", model.workCase.workspace],
        ["Session", model.workCase.agentSessionId],
        ["Device", model.workCase.device],
        ["CWD", model.workCase.cwd],
        ["Branch", model.workCase.branch],
      ]
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
        .map(([label, value]) => ({ label, value })),
    },
    current: [
      { key: "progressSummary", label: "做到哪了", value: model.current.progressSummary || "未记录", source: currentSource },
      { key: "next", label: "下一步", value: model.current.next || "未记录", source: currentSource },
      { key: "blockers", label: "当前风险/阻塞", value: model.current.blockers || "未记录", source: currentSource },
      { key: "pending", label: "未提交/待处理", value: model.current.pending || "未记录", source: currentSource },
    ],
    tasks: {
      health: model.tasks.observationHealth,
      completedLabel:
        completed === null || total === null ? "— / —" : `${completed} / ${total}`,
      progressPercent:
        completed === null || total === null
          ? null
          : total === 0
            ? 0
            : Math.round((completed / total) * 100),
      counts: [
        ["active", active],
        ["blocked", model.tasks.counts.blocked],
        ["archived", model.tasks.counts.archived],
      ].map(([label, value]) => ({
        label: String(label),
        value: typeof value === "number" ? String(value) : "—",
      })),
      byStatus: Object.entries(model.tasks.counts.byStatus).map(([status, count]) => ({
        status,
        count,
      })),
      primary,
      history,
      driftWarning,
    },
    recentProgress: model.recentProgress,
    sections: [
      { key: "goal", label: "Goal", items: model.sections.goal },
      { key: "decisions", label: "Decisions", items: model.sections.decisions },
      { key: "discoveries", label: "Discoveries", items: model.sections.discoveries },
      { key: "blockers", label: "Blockers", items: model.sections.blockers },
      { key: "outcome", label: "Outcome", items: model.sections.outcome },
      { key: "candidatePatterns", label: "Candidate Patterns", items: model.sections.candidatePatterns },
      { key: "definitionOfDone", label: "Definition of Done", items: model.sections.definitionOfDone },
    ],
    related: [
      { label: "Project", targets: model.related.project ? [model.related.project] : [] },
      { label: "Plans", targets: model.related.plans },
      { label: "Docs", targets: model.related.docs },
      { label: "Sessions", targets: model.related.sessions },
      { label: "Related", targets: model.related.related },
    ].filter((group) => group.targets.length > 0),
    diagnostics: model.diagnostics,
  };
}

export function formatWorkCaseTimestamp(value: string): {
  label: string;
  tooltip: string;
} {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/
  );
  if (!match) return { label: value, tooltip: value };

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  const valid =
    calendarCheck.getUTCFullYear() === year &&
    calendarCheck.getUTCMonth() === month - 1 &&
    calendarCheck.getUTCDate() === day &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59;
  if (!valid) return { label: value, tooltip: value };

  return {
    label: `${year}年${month}月${day}日 ${hourText}:${minuteText}`,
    tooltip: value,
  };
}

function taskPresentation(item: WorkCaseTaskItem): WorkCaseTaskPresentation {
  return {
    ...item,
    tone: item.archived
      ? "archived"
      : item.isBlocked
        ? "blocked"
        : item.statusIsCompleted === true
          ? "completed"
          : item.statusIsCompleted === false
            ? "active"
            : "unknown",
  };
}

function isClosedCaseStatus(status: string): boolean {
  return ["done", "complete", "completed", "closed"].includes(status.toLowerCase());
}
