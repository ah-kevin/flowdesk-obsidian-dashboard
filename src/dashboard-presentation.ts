import {formatEntityStatus, groupTaskRows} from "./entity-presentation";
import {
  type DashboardChildViewModel,
  type DashboardViewModel,
  type EvidenceHealth,
  type RollupTaskReference,
  type SnapshotContractItem,
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
  scopeOpen: boolean;
  requirementsOpen: boolean;
  scenariosOpen: boolean;
  observationOpen: boolean;
  technicalDiagnosticsOpen: boolean;
  diagnosticOpen: Record<string, boolean>;
  diagnosticSupportingOpen: Record<string, boolean>;
}

export type DetailSection = "diagnostics" | "contract" | "observation";

export class DisclosureStateCache {
  private states = new Map<string, DisclosureState>();

  constructor(private capacity = 20) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  forTask(taskPath: string): DisclosureState {
    const existing = this.states.get(taskPath);
    if (existing) {
      this.states.delete(taskPath);
      this.states.set(taskPath, existing);
      return existing;
    }

    const state = resolveDisclosureState(undefined, true);
    this.states.set(taskPath, state);
    if (this.states.size > this.capacity) {
      const oldest = this.states.keys().next().value;
      if (typeof oldest === "string") this.states.delete(oldest);
    }
    return state;
  }

  clear(): void {
    this.states.clear();
  }
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
  contractTone: PresentationTone;
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
  history: boolean;
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

export interface DashboardScopePresentation {
  mode: "text" | "structured";
  text: string;
  included: string[];
  excluded: string[];
  status: "Scope 已提供" | "Scope 完整" | "Scope 待补充";
}

export function createDashboardScopePresentation(
  scope: DashboardViewModel["contract"]["scope"]
): DashboardScopePresentation {
  if (Object.prototype.hasOwnProperty.call(scope, "text")) {
    const text = scope.text?.trim() ?? "";
    return {
      mode: "text",
      text,
      included: [],
      excluded: [],
      status: text ? "Scope 已提供" : "Scope 待补充",
    };
  }
  return {
    mode: "structured",
    text: "",
    included: scope.included,
    excluded: scope.excluded,
    status:
      scope.included.length && scope.excluded.length
        ? "Scope 完整"
        : "Scope 待补充",
  };
}

export interface DashboardTechnicalDiagnosticGroup {
  kind: "current" | "child";
  taskId: string;
  taskTitle: string;
  status: string;
  tone: PresentationTone;
  diagnostics: DashboardDiagnosticPresentation[];
}

export interface ContractItemPresentation {
  id: string;
  text: string;
  requirementIds: string[];
  sourceLabel: string;
  steps: { given: string; when: string; then: string } | null;
}

export function createContractItemPresentation(
  item: SnapshotContractItem,
  kind: "requirement" | "scenario"
): ContractItemPresentation {
  const text = String(item.label || item.text || "未提供").trim() || "未提供";
  return {
    id: String(item.uid || item.id || "未编号").trim() || "未编号",
    text,
    requirementIds: Array.isArray(item.covers)
      ? item.covers.map(String).filter(Boolean)
      : Array.isArray(item.requirement_ids)
        ? item.requirement_ids.map(String).filter(Boolean)
        : [],
    sourceLabel: formatContractSource(item),
    steps: kind === "scenario" ? parseScenarioSteps(text) : null,
  };
}

function formatContractSource(item: SnapshotContractItem): string {
  const section = item.source?.section || item.source?.after_section || "任务文件";
  const line = item.source?.line_start;
  return typeof line === "number" && line > 0
    ? `${section} · 第 ${line} 行`
    : section;
}

function parseScenarioSteps(
  text: string
): { given: string; when: string; then: string } | null {
  const match = text.match(
    /^\s*Given\s+([\s\S]*?)[,，]\s*When\s+([\s\S]*?)[,，]\s*Then\s+([\s\S]+?)\s*$/i
  );
  if (!match) return null;
  return {
    given: match[1].trim(),
    when: match[2].trim(),
    then: match[3].trim(),
  };
}

export interface DashboardPresentation {
  kind: "parent" | "leaf";
  header: DashboardHeaderPresentation;
  trust: DashboardTrustPresentation;
  primaryStatus: DashboardPrimaryStatusPresentation;
  children: DashboardChildRowPresentation[];
  contract: DashboardContractPresentation;
  diagnostics: DashboardDiagnosticPresentation[];
  technicalDiagnostics: DashboardTechnicalDiagnosticGroup[];
}

export function resolveDisclosureState(
  previous: DisclosureState | undefined,
  taskChanged: boolean
): DisclosureState {
  if (!previous || taskChanged) {
    return {
      summaryOpen: true,
      fullOpen: false,
      scopeOpen: false,
      requirementsOpen: false,
      scenariosOpen: false,
      observationOpen: false,
      technicalDiagnosticsOpen: false,
      diagnosticOpen: {},
      diagnosticSupportingOpen: {},
    };
  }
  return previous;
}

export function createDiagnosticDisclosureKey(
  taskPath: string,
  diagnostic: Pick<SnapshotDiagnostic, "code" | "path" | "source">
): string {
  const section = diagnostic.source?.section || diagnostic.source?.after_section || "";
  const line = diagnostic.source?.line_start ?? "";
  return JSON.stringify([
    taskPath,
    diagnostic.code,
    diagnostic.path,
    section,
    line,
  ]);
}

export function reconcileDiagnosticDisclosureState(
  state: DisclosureState,
  activeKeys: Iterable<string>
): void {
  const active = new Set(activeKeys);
  for (const key of Object.keys(state.diagnosticOpen)) {
    if (!active.has(key)) delete state.diagnosticOpen[key];
  }
  for (const key of Object.keys(state.diagnosticSupportingOpen)) {
    if (!active.has(key)) delete state.diagnosticSupportingOpen[key];
  }
}

export function resolveDiagnosticDisclosureOpen(
  state: DisclosureState,
  key: string
): boolean {
  return state.diagnosticOpen[key] ?? false;
}

export function resolveDetailSectionOrder(
  hasDiagnostics: boolean
): DetailSection[] {
  const reviewOrder: DetailSection[] = ["contract", "observation"];
  return hasDiagnostics ? ["diagnostics", ...reviewOrder] : reviewOrder;
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

export function formatSnapshotCompatibilityError(code: string): string {
  if (code === "unsupported_snapshot_model") {
    return "Snapshot model 不受支持：需要 task-centric。";
  }
  if (code === "unsupported_snapshot_protocol") {
    return "Snapshot protocol 不受支持：请核对 producer 与 Dashboard 版本。";
  }
  return "Snapshot schema 不受支持：需要 schema 4，或显式 legacy_v3。";
}

export function createDashboardPresentation(
  model: DashboardViewModel
): DashboardPresentation {
  const kind = model.currentTask.hasChildren ? "parent" : "leaf";
  const diagnostics = model.diagnostics.map((diagnostic) =>
    createDiagnosticPresentation(diagnostic, model.currentTask.id)
  );
  return {
    kind,
    header: {
      title: model.currentTask.title,
      status: formatTaskStatus(model.currentTask.status, model.currentTask.trustLevel === "legacy_v3"),
      statusTone: taskStatusTone(model.currentTask.status, model.currentTask.isBlocked),
      priority: formatPriority(model.currentTask.priority),
      kindLabel: kind === "parent" ? "父任务" : "叶子任务",
      parent: model.parent
        ? { id: model.parent.id, title: model.parent.title }
        : null,
    },
    trust: createTrustSummary(model),
    primaryStatus: createPrimaryStatus(model),
    children: kind === "parent" ? (() => {
      const legacy = model.currentTask.trustLevel === "legacy_v3";
      const grouped = groupTaskRows(model.children.map(child => ({...child,
        completed: lifecycleCompleted(child.status, legacy), archived: false,
      })));
      return [...grouped.current.map(child => createChildRow(child, legacy, false)),
        ...grouped.history.map(child => createChildRow(child, legacy, true))];
    })() : [],
    contract: createContractSummary(model),
    diagnostics,
    technicalDiagnostics: createTechnicalDiagnosticGroups(model, diagnostics),
  };
}

export function createTechnicalDiagnosticGroups(
  model: DashboardViewModel,
  currentDiagnostics = model.diagnostics.map((diagnostic) =>
    createDiagnosticPresentation(diagnostic, model.currentTask.id)
  )
): DashboardTechnicalDiagnosticGroup[] {
  const groups: DashboardTechnicalDiagnosticGroup[] = [];
  if (currentDiagnostics.length) {
    groups.push({
      kind: "current",
      taskId: model.currentTask.id,
      taskTitle: model.currentTask.title,
      status: formatTaskStatus(model.currentTask.status, model.currentTask.trustLevel === "legacy_v3"),
      tone: taskStatusTone(model.currentTask.status, model.currentTask.isBlocked),
      diagnostics: currentDiagnostics,
    });
  }
  for (const child of model.children) {
    if (!child.primaryDiagnostic) continue;
    groups.push({
      kind: "child",
      taskId: child.id,
      taskTitle: child.title,
      status: formatTaskStatus(child.status),
      tone: taskStatusTone(child.status, child.isBlocked),
      diagnostics: [
        createDiagnosticPresentation(child.primaryDiagnostic, child.id),
      ],
    });
  }
  return groups;
}

export function formatTaskStatus(value: unknown, legacy = false): string {
  const raw = String(value ?? "");
  if (legacy && ["complete", "completed"].includes(normalizeToken(raw))) return "已完成";
  return formatEntityStatus("task", raw).label;
}

export function taskStatusTone(value: unknown, isBlocked = false): PresentationTone {
  const result = formatEntityStatus("task", String(value ?? ""));
  return normalizeToken(value) !== "done" && isBlocked ? "error" : result.tone;
}

function lifecycleCompleted(status: string, legacy = false): boolean | null {
  const token = normalizeToken(status);
  if (token === "done" || (legacy && ["complete", "completed"].includes(token))) return true;
  return ["open", "in-progress", "running", "blocked"].includes(token) ? false : null;
}

/**
 * 判定层是否不适用于当前任务。
 *
 * `not_applicable` 的语义是「producer 不对规格做语义判定，事实以 TaskNotes 为准」，
 * **不是**「没有结构化合同」——producer 仍会把正文 ## Requirements / ## Scenarios
 * 解析进 `task_contract`，所以 REQ/SCN chip 与 not_applicable 完全可以同时为真。
 *
 * `completion.contract_status` 与顶层 `contract.status` 是两个独立字段，任一写着
 * not_applicable 都说明判定层不适用。只认前者会在上游裁剪掉 completion 字段时漏判，
 * 把「不做判定」误报成「规格存在问题」，与同卡的 REQ/SCN chip 自相矛盾。
 */
function isContractJudgmentNotApplicable(model: DashboardViewModel): boolean {
  return (
    model.currentTask.completion.contractStatus === "not_applicable" ||
    model.contract.semanticStatus === "not_applicable"
  );
}

function createTrustSummary(
  model: DashboardViewModel
): DashboardTrustPresentation {
  const isLegacy = model.currentTask.trustLevel === "legacy_v3";
  const isTasknotesOnly = isContractJudgmentNotApplicable(model);
  const contractLabel = isTasknotesOnly
    ? "TaskNotes 状态为准"
    : isLegacy
      ? model.contract.semanticStatus === "valid"
        ? "v3 历史合同有效"
        : "v3 历史合同需检查"
      : model.contract.semanticStatus === "valid"
        ? "规格有效"
        : model.contract.semanticStatus === "invalid"
          ? "规格存在问题"
          : "规格状态未知";
  const contractTone: PresentationTone = isTasknotesOnly
    ? "muted"
    : model.contract.semanticStatus === "valid"
      ? "healthy"
      : model.contract.semanticStatus === "invalid"
        ? "error"
        : "muted";
  if (model.observation.isStale) {
    const detail = model.observation.staleReason || "snapshot 已标记为旧数据";
    return {
      tone: "warning",
      label: "显示上次成功结果",
      contractLabel,
      contractTone,
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
      contractTone,
      sourceLabel: model.schemaLabel,
      tooltip: `${model.observation.generatedAt} · ${detail}`,
      meta: `${model.schemaLabel} · ${model.observation.generatedAt}`,
      detail,
    };
  }
  const detail = "来源匹配，已读取当前任务、父任务与直接子任务";
  return {
    tone: "healthy",
    label: "来源读取完整",
    contractLabel,
    contractTone,
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
  // 判定层拆除后 contract.status=not_applicable 是常态，不是合同异常。
  // 这一支改为回答「做到哪了 / 下一步 / 卡在哪」。
  if (isContractJudgmentNotApplicable(model)) {
    return createProgressStatus(model);
  }
  if (model.contract.semanticStatus !== "valid") {
    return {
      tone: "error",
      title: "任务规格存在问题",
      reason: `producer 将规格标记为 ${model.contract.semanticStatus}，但没有返回结构化诊断`,
      remediation: "展开完整详情核对规格字段，并使用 CLI 获取 producer 原始输出",
      location: "任务规格",
      diagnostic: null,
    };
  }
  if (model.currentTask.trustLevel === "legacy_v3") {
    return {
      tone: model.currentTask.trustedDone ? "healthy" : "warning",
      title: "v3 历史验证已保留",
      reason: "Dashboard 明示 legacy_v3，不将历史结论伪装成 v4 attested",
      remediation: model.nextAction || "按需显式迁移到 SDD v4",
      location: "当前任务",
      diagnostic: null,
    };
  }
  if (model.currentTask.trustLevel === "review_required") {
    return {
      tone: "warning",
      title: "结构化证据等待人工复核",
      reason: "必需 evidence 已满足，但当前 bundle 尚未批准",
      remediation: model.nextAction || "查看历史证据与原文确认下一步",
      location: "执行证据",
      diagnostic: null,
    };
  }
  return {
    tone: "healthy",
    title: "已读取当前任务，未发现结构化诊断",
    reason: "已检查任务规格与执行证据",
    remediation: model.nextAction || "继续按当前任务规格执行",
    location: "当前任务",
    diagnostic: null,
  };
}

/**
 * tasknotes_only 下的主状态：直接回答「整体做到哪了、下一个做什么、有没有卡住」。
 * 父任务讲 direct children 的 rollup，leaf 讲自身生命周期。
 */
function createProgressStatus(
  model: DashboardViewModel
): DashboardPrimaryStatusPresentation {
  const nextStep = model.nextAction;
  if (!model.currentTask.hasChildren) {
    return createLeafProgressStatus(model, nextStep);
  }
  const legacy = model.currentTask.trustLevel === "legacy_v3";
  const completed = model.children.filter(child => lifecycleCompleted(child.status, legacy) === true);
  const unfinished = model.children.filter(child => lifecycleCompleted(child.status, legacy) !== true);
  const blocked = unfinished.filter(child => child.isBlocked);
  const progress = model.children.length ? `${completed.length}/${model.children.length} 个直接子任务已完成` : "未观察到直接子任务";
  return {
    tone: blocked.length ? "error" : unfinished.length ? "running" : model.children.length ? "healthy" : "warning",
    title: progress,
    reason: blocked.length
      ? `${blocked.length} 个未完成子任务被阻塞：${formatTaskReferences(blocked)}`
      : unfinished.length
        ? `还有 ${unfinished.length} 个子任务未完成或状态未知：${formatTaskReferences(unfinished)}`
        : model.children.length ? "直接子任务生命周期均为已完成；当前任务状态独立显示。" : "producer 未返回直接子任务，不据此判定完成。",
    remediation: nextStep || "未记录下一步",
    location: "直接子任务",
    diagnostic: null,
  };
}

function createLeafProgressStatus(model: DashboardViewModel, nextStep: string | null): DashboardPrimaryStatusPresentation {
  const completed = lifecycleCompleted(model.currentTask.status, model.currentTask.trustLevel === "legacy_v3") === true;
  const blocked = !completed && model.currentTask.isBlocked;
  const dependencies = model.currentTask.blockedBy.map(formatTaskReference).join("、");
  return {
    tone: blocked ? "error" : taskStatusTone(model.currentTask.status),
    title: `当前任务${formatTaskStatus(model.currentTask.status, model.currentTask.trustLevel === "legacy_v3")}`,
    reason: blocked ? dependencies ? `阻塞于 ${dependencies}` : "TaskNotes 将当前任务标记为阻塞"
      : dependencies ? `${completed ? "历史依赖" : "依赖于"} ${dependencies}` : "进度以当前任务自身生命周期为准；验收结论独立。",
    remediation: nextStep || "未记录下一步",
    location: "当前任务", diagnostic: null,
  };
}

function formatTaskReferences(items: RollupTaskReference[]): string {
  return items
    .map((item) => item.title || formatTaskReference(item.id || ""))
    .filter(Boolean)
    .join("、");
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

function createChildRow(child: DashboardChildViewModel, legacy = false, history = false): DashboardChildRowPresentation {
  const meta: string[] = [];
  const completed = lifecycleCompleted(child.status, legacy) === true;
  if (child.blockedBy.length) meta.push(`${!completed && child.isBlocked ? "阻塞于" : completed ? "历史依赖" : "依赖于"} ${child.blockedBy.map(formatTaskReference).join("、")}`);
  if (child.hasChildren) meta.push("含子任务");
  return {
    id: child.id, title: child.title, history,
    status: formatTaskStatus(child.status, legacy),
    tone: taskStatusTone(child.status, !completed && child.isBlocked),
    summary: child.primaryDiagnostic?.reason ?? child.goal,
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
  return {
    goal: model.content.goal,
    coverage: "投影条目；完整正文见 API 原文",
    acceptance: "原文勾选仅按正文展示",
    evidence: "执行、验证、交付记录按原文展示",
    diagnostics: `${model.diagnostics.length} 个诊断`,
    metrics: [],
  };
}

function diagnosticActionTitle(diagnostic: SnapshotDiagnostic): string {
  if (diagnostic.code === "task_contract_count_invalid") {
    const schema = String(diagnostic.evidence?.schema || "");
    const version = schema === "flowdesk.task-contract/4" ? "v4" : "v3";
    return diagnostic.evidence?.actual_count === 0
      ? `缺少 Task Contract ${version}`
      : `Task Contract ${version} 数量不正确`;
  }
  const labels: Record<string, string> = {
    review_required: "结构化证据等待人工复核",
    review_conflict: "复核记录与当前证据冲突",
    review_changes_requested: "复核要求修改",
    evidence_requirement_missing: "结构化证据缺失",
    stale_against_component_revision: "结构化证据版本已过期",
    record_unconfirmed: "Evidence Record 未确认",
    record_drift: "Evidence Record 已漂移",
    failed_as_observed: "运行结果不符合声明预期",
    protocol_mismatch: "证据协议不匹配",
    contract_missing: "Evidence Contract 存储缺失",
    task_store_missing: "Evidence Contract 存储缺失",
    inline_v4_migration_required: "旧版 v4 技术数据需要迁移",
    contract_drift: "Evidence Contract 已漂移",
    contract_invalid: "结构化规格无效",
    observation_unavailable: "TaskNotes 观察不可用",
    reference_unaccepted: "实验参考真值不被规格接受",
    "contract.goal": "任务目标需要修复",
    "evidence.execution": "执行结果需要修复",
    "evidence.verification": "验证结果需要修复",
    "evidence.delivery": "交付记录需要修复",
  };
  if (labels[diagnostic.code]) return labels[diagnostic.code];
  if (labels[diagnostic.path]) return labels[diagnostic.path];
  if (diagnostic.path.startsWith("contract.")) return "任务规格需要修复";
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
