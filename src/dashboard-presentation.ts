import {
  formatRollupState,
  type DashboardChildViewModel,
  type DashboardViewModel,
  type EvidenceHealth,
  type SnapshotDiagnostic,
} from "./snapshot-model";

export type PresentationTone =
  | "healthy"
  | "warning"
  | "error"
  | "running"
  | "muted";

export interface DisclosureState {
  summaryOpen: boolean;
  fullOpen: boolean;
}

export interface DashboardHeaderPresentation {
  title: string;
  status: string;
  statusTone: PresentationTone;
  priority: string;
  kindLabel: "父任务" | "叶子任务";
  parent: { id: string; title: string } | null;
}

export interface DashboardTrustPresentation {
  tone: PresentationTone;
  label: string;
  contractLabel: string;
  sourceLabel: string;
  tooltip: string;
  meta: string;
  detail: string;
}

export interface DashboardPrimaryStatusPresentation {
  tone: PresentationTone;
  title: string;
  reason: string;
  remediation: string;
  location: string;
  diagnostic: SnapshotDiagnostic | null;
}

export interface DashboardChildRowPresentation {
  id: string;
  title: string;
  status: string;
  tone: PresentationTone;
  summary: string;
  meta: string;
}

export interface DashboardDiagnosticPresentation {
  title: string;
  sourceLabel: string;
  actual: string;
  expected: string;
  remediation: string;
  machine: {
    code: string;
    taskId: string;
    path: string;
    location: string;
  };
  diagnostic: SnapshotDiagnostic;
}

export interface DashboardContractPresentation {
  goal: string;
  coverage: string;
  acceptance: string;
  evidence: string;
  diagnostics: string;
  metrics: Array<{ label: string; value: string }>;
}

export interface DashboardPresentation {
  kind: "parent" | "leaf";
  header: DashboardHeaderPresentation;
  trust: DashboardTrustPresentation;
  primaryStatus: DashboardPrimaryStatusPresentation;
  children: DashboardChildRowPresentation[];
  contract: DashboardContractPresentation;
  diagnostics: DashboardDiagnosticPresentation[];
}

export function resolveDisclosureState(
  previous: DisclosureState | undefined,
  taskChanged: boolean
): DisclosureState {
  if (!previous || taskChanged) {
    return { summaryOpen: true, fullOpen: false };
  }
  return previous;
}

export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

export function formatTaskShellStatus(
  loading: boolean,
  error: string
): string {
  if (error) return "读取失败";
  return loading ? "正在建立可信观察…" : "尚未读取 snapshot";
}

export function createDashboardPresentation(
  model: DashboardViewModel
): DashboardPresentation {
  const kind = model.currentTask.hasChildren ? "parent" : "leaf";
  return {
    kind,
    header: {
      title: model.currentTask.title,
      status: formatTaskStatus(model.currentTask.status),
      statusTone: taskStatusTone(model.currentTask.status, model.currentTask.isBlocked),
      priority: formatPriority(model.currentTask.priority),
      kindLabel: kind === "parent" ? "父任务" : "叶子任务",
      parent: model.parent
        ? { id: model.parent.id, title: model.parent.title }
        : null,
    },
    trust: createTrustSummary(model),
    primaryStatus: createPrimaryStatus(model),
    children: kind === "parent" ? model.children.map(createChildRow) : [],
    contract: createContractSummary(model),
    diagnostics: model.diagnostics.map((diagnostic) =>
      createDiagnosticPresentation(diagnostic, model.currentTask.id)
    ),
  };
}

export function formatTaskStatus(value: unknown): string {
  const labels: Record<string, string> = {
    done: "已完成",
    complete: "已完成",
    completed: "已完成",
    "in-progress": "进行中",
    running: "进行中",
    open: "待开始",
    blocked: "已阻塞",
    error: "异常",
    unknown: "未知",
  };
  return labels[normalizeToken(value)] ?? String(value || "未知");
}

export function taskStatusTone(
  value: unknown,
  isBlocked = false
): PresentationTone {
  if (isBlocked) return "error";
  const status = normalizeToken(value);
  if (["done", "complete", "completed"].includes(status)) return "healthy";
  if (["in-progress", "running"].includes(status)) return "running";
  if (["blocked", "error", "invalid"].includes(status)) return "error";
  return "muted";
}

function createTrustSummary(
  model: DashboardViewModel
): DashboardTrustPresentation {
  const contractLabel =
    model.contract.semanticStatus === "valid"
      ? "合同有效"
      : model.contract.semanticStatus === "invalid"
        ? "合同存在问题"
        : "合同状态未知";
  if (model.observation.isStale) {
    const detail = model.observation.staleReason || "snapshot 已标记为旧数据";
    return {
      tone: "warning",
      label: "显示上次成功结果",
      contractLabel,
      sourceLabel: model.schemaLabel,
      tooltip: `读取于 ${model.observation.loadedAt} · ${detail}`,
      meta: `${model.schemaLabel} · 读取于 ${model.observation.loadedAt}`,
      detail,
    };
  }
  if (!model.observation.isTrustworthy) {
    const detail = "无法确认 snapshot 是否完整对应当前任务";
    return {
      tone: "error",
      label: "观察不可信",
      contractLabel,
      sourceLabel: model.schemaLabel,
      tooltip: `${model.observation.generatedAt} · ${detail}`,
      meta: `${model.schemaLabel} · ${model.observation.generatedAt}`,
      detail,
    };
  }
  const detail = "来源匹配，已读取当前任务、父任务与直接子任务";
  return {
    tone: "healthy",
    label: "观察可信",
    contractLabel,
    sourceLabel: model.schemaLabel,
    tooltip: `${model.observation.generatedAt} · ${detail}`,
    meta: `${model.schemaLabel} · ${model.observation.generatedAt}`,
    detail,
  };
}

function createPrimaryStatus(
  model: DashboardViewModel
): DashboardPrimaryStatusPresentation {
  if (model.observation.isStale) {
    return {
      tone: "warning",
      title: "当前显示的是上次成功结果",
      reason: model.observation.staleReason || "本次刷新未取得可信 snapshot",
      remediation: "检查 TaskNotes API 或 FlowDesk snapshot 命令后重试",
      location: "当前任务",
      diagnostic: null,
    };
  }
  if (!model.observation.isTrustworthy) {
    return {
      tone: "error",
      title: "无法确认当前任务状态",
      reason: "snapshot 观察、来源或数据完整性校验未通过",
      remediation: "展开技术详情确认 observation 与 source identity",
      location: "当前任务",
      diagnostic: null,
    };
  }
  if (model.primaryDiagnostic) {
    return createDiagnosticStatus(model.primaryDiagnostic);
  }
  if (model.contract.semanticStatus !== "valid") {
    return {
      tone: "error",
      title: "任务合同存在问题",
      reason: `producer 将合同标记为 ${model.contract.semanticStatus}，但没有返回结构化诊断`,
      remediation: "展开完整详情核对合同字段，并使用 CLI 获取 producer 原始输出",
      location: "任务合同",
      diagnostic: null,
    };
  }
  return {
    tone: "healthy",
    title: "已读取当前任务，未发现结构化诊断",
    reason: "已检查任务合同与执行证据",
    remediation: model.nextAction || "继续按当前任务合同执行",
    location: "当前任务",
    diagnostic: null,
  };
}

function createDiagnosticStatus(
  diagnostic: SnapshotDiagnostic
): DashboardPrimaryStatusPresentation {
  return {
    tone: diagnostic.severity === "warning" ? "warning" : "error",
    title: diagnosticActionTitle(diagnostic),
    reason: diagnostic.reason,
    remediation: diagnostic.remediation,
    location: diagnosticLocation(diagnostic),
    diagnostic,
  };
}

export function createDiagnosticPresentation(
  diagnostic: SnapshotDiagnostic,
  currentTaskId: string
): DashboardDiagnosticPresentation {
  const location = diagnosticLocation(diagnostic);
  const belongsToCurrentTask = diagnostic.taskId === currentTaskId;
  const taskPrefix = belongsToCurrentTask
    ? ""
    : `${formatTaskReference(diagnostic.taskId)} · `;
  return {
    title: diagnosticActionTitle(diagnostic),
    sourceLabel: `${taskPrefix}${location}`,
    actual: diagnostic.reason,
    expected: diagnostic.expected,
    remediation: diagnostic.remediation,
    machine: {
      code: diagnostic.code,
      taskId: diagnostic.taskId,
      path: diagnostic.path,
      location,
    },
    diagnostic,
  };
}

function createChildRow(
  child: DashboardChildViewModel
): DashboardChildRowPresentation {
  const meta = [];
  if (child.blockedBy.length) {
    meta.push(`阻塞于 ${child.blockedBy.map(formatTaskReference).join("、")}`);
  }
  meta.push(formatChildEvidenceIssues(child.evidenceHealth));
  return {
    id: child.id,
    title: child.title,
    status: formatTaskStatus(child.status),
    tone: taskStatusTone(child.status, child.isBlocked),
    summary: child.primaryDiagnostic?.reason ?? formatRollupState(child.rollupState),
    meta: meta.join(" · "),
  };
}

function formatTaskReference(taskId: string): string {
  const filename = taskId.split("/").pop() || taskId;
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}

function createContractSummary(
  model: DashboardViewModel
): DashboardContractPresentation {
  const checked = model.contract.acceptance.filter(
    (item) => item.checked === true
  ).length;
  const validEvidence = Object.values(model.evidence).filter(
    (health) => health === "valid"
  ).length;
  return {
    goal: model.contract.goal,
    coverage: `REQ ${model.contract.requirements.length} · SCN ${model.contract.scenarios.length}`,
    acceptance: `验收 ${checked}/${model.contract.acceptance.length}`,
    evidence: formatEvidence(model.evidence),
    diagnostics: `${model.diagnostics.length} 个诊断`,
    metrics: [
      {
        label: "REQ / SCN",
        value: `${model.contract.requirements.length} / ${model.contract.scenarios.length}`,
      },
      {
        label: "验收",
        value: `${checked} / ${model.contract.acceptance.length}`,
      },
      { label: "证据有效", value: `${validEvidence} / 3` },
      { label: "诊断", value: String(model.diagnostics.length) },
    ],
  };
}

function diagnosticActionTitle(diagnostic: SnapshotDiagnostic): string {
  if (diagnostic.code === "task_contract_count_invalid") {
    return /找到\s*0\s*个/.test(diagnostic.reason)
      ? "缺少 Task Contract v3"
      : "Task Contract v3 数量不正确";
  }
  const labels: Record<string, string> = {
    "contract.goal": "任务目标需要修复",
    "evidence.execution": "执行结果需要修复",
    "evidence.verification": "验证结果需要修复",
    "evidence.delivery": "交付记录需要修复",
  };
  if (labels[diagnostic.path]) return labels[diagnostic.path];
  if (diagnostic.path.startsWith("contract.")) return "任务合同需要修复";
  if (diagnostic.path.startsWith("evidence.")) return "执行证据需要修复";
  return "当前任务存在结构化诊断";
}

function diagnosticLocation(diagnostic: SnapshotDiagnostic): string {
  const section = diagnostic.source?.section || diagnostic.source?.after_section;
  const line = diagnostic.source?.line_start;
  if (section && typeof line === "number" && line > 0) {
    return `${section} · 第 ${line} 行`;
  }
  if (section) return section;
  return "任务文件";
}

function formatChildEvidenceIssues(
  evidence: Record<"execution" | "verification" | "delivery", EvidenceHealth>
): string {
  const labels = [
    ["执行", evidence.execution],
    ["验证", evidence.verification],
    ["交付", evidence.delivery],
  ] as const;
  const issues = labels
    .filter(([, health]) => health !== "valid")
    .map(([label, health]) => `${label}${health === "invalid" ? "无效" : "缺失"}`);
  return issues.length ? issues.join(" · ") : "证据完整";
}

function formatEvidence(
  evidence: Record<"execution" | "verification" | "delivery", EvidenceHealth>
): string {
  const healthLabel: Record<EvidenceHealth, string> = {
    valid: "有效",
    invalid: "无效",
    missing: "缺失",
  };
  return [
    `执行${healthLabel[evidence.execution]}`,
    `验证${healthLabel[evidence.verification]}`,
    `交付${healthLabel[evidence.delivery]}`,
  ].join(" · ");
}

function formatPriority(value: string): string {
  const labels: Record<string, string> = {
    high: "高优先级",
    normal: "普通优先级",
    low: "低优先级",
  };
  return labels[value] ?? value;
}

function normalizeToken(value: unknown): string {
  return String(value || "unknown").toLowerCase().replace(/_/g, "-");
}
