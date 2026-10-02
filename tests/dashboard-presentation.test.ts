import assert from "node:assert/strict";
import test from "node:test";

import {
  createContractItemPresentation,
  createDiagnosticPresentation,
  createDashboardPresentation,
  formatTaskShellStatus,
  isActivationKey,
  resolveDisclosureState,
} from "../src/dashboard-presentation.ts";
import * as dashboardPresentation from "../src/dashboard-presentation.ts";
import { createDashboardViewModel } from "../src/snapshot-model.ts";

const taskId = "Tasks/Parent.md";

function createSnapshot() {
  return {
    snapshot_schema_version: 3,
    snapshot_model: "task-centric",
    generated_at: "2026-08-06T09:30:00Z",
    source_task_id: taskId,
    observation: {
      health: "healthy",
      current_task: "observed",
      parent: "not_applicable",
      children: "observed",
      tasknotes_api: "ok",
      source_identity_match: true,
      stale: false,
    },
    current_task: {
      id: taskId,
      title: "Parent",
      status: "in-progress",
      priority: "high",
      is_blocked: false,
      blocked_by: [],
      parent_id: null,
      has_children: true,
      rollup_state: "running",
      trusted_done: false,
    },
    parent: null,
    contract: {
      version: "v3",
      goal: "交付可验证的 Dashboard",
      scope: { included: ["Dashboard"], excluded: ["producer"] },
      requirements: [
        { id: "REQ-001", text: "首屏突出主阻塞" },
        { id: "REQ-002", text: "合同渐进展开" },
      ],
      scenarios: [
        { id: "SCN-001", requirement_ids: ["REQ-001"], text: "打开 Parent" },
      ],
      acceptance: [
        { text: "Parent 正确", checked: true },
        { text: "Leaf 正确", checked: false },
      ],
      semantic_status: "valid",
    },
    children: [
      {
        id: "Tasks/Child.md",
        title: "Child",
        status: "in-progress",
        priority: "normal",
        is_blocked: false,
        blocked_by: [],
        goal: "完成 child",
        has_children: false,
        rollup_state: "awaiting_current_verification",
        semantic_status: "valid",
        evidence_health: {
          execution: "valid",
          verification: "invalid",
          delivery: "valid",
        },
        trusted_done: false,
        primary_diagnostic: null,
      },
    ],
    rollup: {
      state: "running",
      trusted_done: false,
      has_children: true,
      children_total: 1,
      children_trusted_done: 0,
      children_complete: false,
      blocked_children: [],
      incomplete_children: [],
      contradictions: [],
    },
    evidence: {
      execution: "valid",
      verification: "missing",
      delivery: "valid",
    },
    diagnostics: [],
    next_actions: [],
  };
}

function createModel() {
  return createDashboardViewModel(createSnapshot(), {
    expectedTaskPath: taskId,
    loadedAt: "17:30:00",
  });
}

test("REQ 与 SCN 详情保留来源，并把场景拆为 Given When Then", () => {
  assert.deepEqual(
    createContractItemPresentation(
      {
        id: "REQ-001",
        text: "Codex App 使用原生标题工具",
        source: { section: "Requirements", line_start: 29 },
      },
      "requirement"
    ),
    {
      id: "REQ-001",
      text: "Codex App 使用原生标题工具",
      requirementIds: [],
      sourceLabel: "Requirements · 第 29 行",
      steps: null,
    }
  );

  assert.deepEqual(
    createContractItemPresentation(
      {
        id: "SCN-001",
        requirement_ids: ["REQ-001"],
        text: "Given 当前宿主是 Codex App, When 激活 orchestrator, Then 调用原生 set_thread_title",
        source: { section: "Scenarios", line_start: 36 },
      },
      "scenario"
    ),
    {
      id: "SCN-001",
      text: "Given 当前宿主是 Codex App, When 激活 orchestrator, Then 调用原生 set_thread_title",
      requirementIds: ["REQ-001"],
      sourceLabel: "Scenarios · 第 36 行",
      steps: {
        given: "当前宿主是 Codex App",
        when: "激活 orchestrator",
        then: "调用原生 set_thread_title",
      },
    }
  );
});

test("诊断默认摘要只给出可行动信息，机器字段留给技术详情", () => {
  const snapshot = createSnapshot();
  snapshot.contract.semantic_status = "invalid";
  snapshot.diagnostics = [
    {
      code: "task_goal_invalid",
      severity: "error",
      task_id: taskId,
      path: "contract.goal",
      source: { section: "Goal", line_start: 1 },
      reason: { actual: "Goal 为空或包含占位内容", expected: "单一交付目标" },
      remediation: {
        summary: "补写当前 task 的单一交付目标并删除占位内容",
      },
    },
  ];
  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });

  const presentation = createDashboardPresentation(model);

  assert.equal(presentation.primaryStatus.tone, "error");
  assert.equal(presentation.primaryStatus.title, "任务目标需要修复");
  assert.equal(presentation.primaryStatus.reason, "Goal 为空或包含占位内容");
  assert.equal(
    presentation.primaryStatus.remediation,
    "补写当前 task 的单一交付目标并删除占位内容"
  );
  assert.equal(presentation.primaryStatus.location, "Goal · 第 1 行");
  assert.equal(
    presentation.primaryStatus.title.includes("task_goal_invalid"),
    false
  );
  assert.equal(presentation.primaryStatus.diagnostic?.code, "task_goal_invalid");
});

test("合同块缺失诊断直接说明问题并生成紧凑来源", () => {
  const snapshot = createSnapshot();
  snapshot.contract.semantic_status = "invalid";
  snapshot.diagnostics = [
    {
      code: "task_contract_count_invalid",
      severity: "error",
      task_id: taskId,
      path: "contract",
      source: { section: "Task Contract v3", line_start: 1 },
      reason: { actual: "找到 0 个 ## Task Contract v3", expected: "唯一合同块" },
      remediation: { summary: "补充唯一的 v3 task 合同块" },
    },
  ];

  const presentation = createDashboardPresentation(
    createDashboardViewModel(snapshot, { expectedTaskPath: taskId })
  );

  assert.equal(presentation.primaryStatus.title, "Task Contract v3 数量不正确");
  assert.equal(
    presentation.diagnostics[0].sourceLabel,
    "Task Contract v3 · 第 1 行"
  );
  assert.equal(
    presentation.diagnostics[0].actual,
    "找到 0 个 ## Task Contract v3"
  );
  assert.equal(presentation.diagnostics[0].expected, "唯一合同块");
  assert.equal(
    presentation.diagnostics[0].remediation,
    "补充唯一的 v3 task 合同块"
  );
});

test("v4 合同诊断由结构化 schema 决定标题而不猜 reason", () => {
  const presentation = createDiagnosticPresentation({
    code: "task_contract_count_invalid",
    severity: "error",
    taskId,
    path: "contract.task_contract",
    reason: "expected exactly one section, found",
    evidence: {
      contract_kind: "task_contract",
      schema: "flowdesk.task-contract/4",
      expected_count: 1,
      actual_count: 0,
    },
    expected: "1",
    remediation: "apply the task contract",
  }, taskId);

  assert.equal(presentation.title, "缺少 Task Contract v4");
});

test("跨 task 诊断在来源标题中加入任务名", () => {
  const diagnostic = {
    code: "verification_missing",
    severity: "error",
    taskId: "Tasks/Child Review.md",
    path: "evidence.verification",
    source: { section: "Verification Result", line_start: 41 },
    reason: "缺少验证证据",
    expected: "至少一条验证结果",
    remediation: "补充验证命令与结果",
  };

  assert.equal(
    createDiagnosticPresentation(diagnostic, taskId).sourceLabel,
    "Child Review · Verification Result · 第 41 行"
  );
});

test("Parent 只生成 direct child 紧凑行，Leaf 不生成空 child 区域", () => {
  const parent = createDashboardPresentation(createModel());

  assert.equal(parent.kind, "parent");
  assert.deepEqual(parent.children[0], {
    id: "Tasks/Child.md",
    title: "Child",
    status: "进行中",
    tone: "running",
    summary: "完成 child",
    history: false,
    meta: "",
  });

  const leafSnapshot = createSnapshot();
  leafSnapshot.current_task.has_children = false;
  leafSnapshot.children = [];
  leafSnapshot.parent = {
    id: "Tasks/Root.md",
    title: "Root",
    status: "in-progress",
  };
  leafSnapshot.observation.parent = "observed";
  const leaf = createDashboardPresentation(
    createDashboardViewModel(leafSnapshot, { expectedTaskPath: taskId })
  );

  assert.equal(leaf.kind, "leaf");
  assert.deepEqual(leaf.children, []);
  assert.equal(leaf.header.parent?.title, "Root");
});

test("子任务生命周期完成与历史诊断分别显示", () => {
  const snapshot = createSnapshot();
  snapshot.children[0].status = "done";
  snapshot.children[0].semantic_status = "invalid";
  snapshot.children[0].evidence_health = {
    execution: "invalid",
    verification: "invalid",
    delivery: "valid",
  };
  snapshot.children[0].trusted_done = false;
  snapshot.children[0].primary_diagnostic = {
    code: "task_contract_v3_missing",
    severity: "error",
    taskId: "Tasks/Child.md",
    path: "Tasks/Child.md",
    source: { section: "Task Contract v3", line_start: 1 },
    reason: "找到 0 个 ## Task Contract v3",
    expected: "恰好一个 ## Task Contract v3",
    remediation: "保留唯一的 v3 task 合同块",
  };

  const child = createDashboardPresentation(
    createDashboardViewModel(snapshot, { expectedTaskPath: taskId })
  ).children[0];

  assert.equal(child.status, "已完成");
  assert.equal(child.tone, "healthy");
  assert.equal(child.history, true);
  assert.equal(child.summary, "找到 0 个 ## Task Contract v3");
  assert.equal(child.meta, "");
});

test("child 只有真实阻塞关系存在时才在紧凑行显示", () => {
  const snapshot = createSnapshot();
  snapshot.children[0].is_blocked = true;
  snapshot.children[0].blocked_by = [
    { uid: "Tasks/Dependency.md", reltype: "blocks" },
  ];
  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });

  const child = createDashboardPresentation(model).children[0];

  assert.equal(child.meta, "阻塞于 Dependency");
});

test("合同摘要默认展开，完整详情默认关闭，同 task 刷新保持选择", () => {
  assert.deepEqual(resolveDisclosureState(undefined, true), {
    summaryOpen: true,
    fullOpen: false,
    scopeOpen: false,
    requirementsOpen: false,
    scenariosOpen: false,
    observationOpen: false,
    technicalDiagnosticsOpen: false,
    diagnosticOpen: {},
    diagnosticSupportingOpen: {},
  });
  const previous = {
    summaryOpen: false,
    fullOpen: true,
    scopeOpen: true,
    requirementsOpen: true,
    scenariosOpen: false,
    observationOpen: true,
    technicalDiagnosticsOpen: true,
    diagnosticOpen: { "diagnostic-a": true },
    diagnosticSupportingOpen: { "diagnostic-a": true },
  };
  assert.deepEqual(
    resolveDisclosureState(previous, false),
    previous
  );
});

test("切换任务后恢复各自展开状态，并按最近使用淘汰旧任务", () => {
  const Cache = (
    dashboardPresentation as typeof dashboardPresentation & {
      DisclosureStateCache?: new (capacity: number) => {
        forTask(taskPath: string): ReturnType<typeof resolveDisclosureState>;
      };
    }
  ).DisclosureStateCache;

  assert.equal(typeof Cache, "function");
  if (!Cache) return;

  const cache = new Cache(2);
  const taskA = cache.forTask("Tasks/A.md");
  taskA.summaryOpen = false;
  taskA.requirementsOpen = true;
  cache.forTask("Tasks/B.md");

  assert.deepEqual(
    cache.forTask("Tasks/A.md"),
    taskA,
    "A → B → A 应恢复 A 的展开状态"
  );

  cache.forTask("Tasks/C.md");
  assert.equal(
    cache.forTask("Tasks/B.md").requirementsOpen,
    false,
    "A 被再次访问后，容量溢出应淘汰更久未使用的 B"
  );
});

test("诊断展开状态只保留当前 snapshot 仍存在的稳定 key", () => {
  const createKey = (
    dashboardPresentation as typeof dashboardPresentation & {
      createDiagnosticDisclosureKey?: (
        taskPath: string,
        diagnostic: {
          code: string;
          path: string;
          source?: { section?: string; line_start?: number };
        }
      ) => string;
    }
  ).createDiagnosticDisclosureKey;
  const reconcile = (
    dashboardPresentation as typeof dashboardPresentation & {
      reconcileDiagnosticDisclosureState?: (
        state: ReturnType<typeof resolveDisclosureState>,
        keys: Iterable<string>
      ) => void;
    }
  ).reconcileDiagnosticDisclosureState;

  assert.equal(typeof createKey, "function");
  assert.equal(typeof reconcile, "function");
  if (!createKey || !reconcile) return;

  const diagnostic = {
    code: "task_goal_invalid",
    path: "contract.goal",
    source: { section: "Goal", line_start: 12 },
  };
  const key = createKey("Tasks/A.md", diagnostic);
  assert.equal(
    key,
    createKey("Tasks/A.md", { ...diagnostic, source: { ...diagnostic.source } })
  );

  const state = resolveDisclosureState(undefined, true);
  state.diagnosticOpen[key] = true;
  state.diagnosticOpen["obsolete"] = true;
  state.diagnosticSupportingOpen[key] = true;
  state.diagnosticSupportingOpen["obsolete"] = true;
  reconcile(state, [key]);

  assert.deepEqual(state.diagnosticOpen, { [key]: true });
  assert.deepEqual(state.diagnosticSupportingOpen, { [key]: true });
});

test("技术诊断默认折叠，但保留用户主动展开的状态", () => {
  const resolveOpen = (
    dashboardPresentation as typeof dashboardPresentation & {
      resolveDiagnosticDisclosureOpen?: (
        state: ReturnType<typeof resolveDisclosureState>,
        key: string
      ) => boolean;
    }
  ).resolveDiagnosticDisclosureOpen;

  assert.equal(typeof resolveOpen, "function");
  if (!resolveOpen) return;

  const state = resolveDisclosureState(undefined, true);
  assert.equal(resolveOpen(state, "diagnostic-a"), false);
  state.diagnosticOpen["diagnostic-a"] = true;
  assert.equal(resolveOpen(state, "diagnostic-a"), true);
});

test("详情存在诊断时优先展示诊断，否则保持合同审阅顺序", () => {
  const resolveOrder = (
    dashboardPresentation as typeof dashboardPresentation & {
      resolveDetailSectionOrder?: (hasDiagnostics: boolean) => string[];
    }
  ).resolveDetailSectionOrder;

  assert.equal(typeof resolveOrder, "function");
  if (!resolveOrder) return;
  assert.deepEqual(resolveOrder(true), [
    "diagnostics",
    "contract",
    "observation",
  ]);
  assert.deepEqual(resolveOrder(false), ["contract", "observation"]);
});

test("legacy 摘要同时证明观察、来源和历史验证边界", () => {
  const presentation = createDashboardPresentation(createModel());

  assert.equal(presentation.trust.label, "来源读取完整");
  assert.equal(presentation.trust.contractLabel, "v3 历史合同有效");
  assert.equal(
    presentation.primaryStatus.title,
    "v3 历史验证已保留"
  );
  assert.equal(
    presentation.primaryStatus.reason,
    "Dashboard 明示 legacy_v3，不将历史结论伪装成 v4 attested"
  );
  assert.equal(presentation.contract.goal, "交付可验证的 Dashboard");
  assert.deepEqual(presentation.contract.metrics, []);
  assert.equal(
    presentation.trust.sourceLabel,
    "snapshot v3 · task-centric · legacy_v3"
  );
});

test("合同异常但 diagnostics 为空时不显示健康", () => {
  const snapshot = createSnapshot();
  snapshot.contract.semantic_status = "invalid";
  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });

  const presentation = createDashboardPresentation(model);

  assert.equal(presentation.primaryStatus.tone, "error");
  assert.equal(presentation.primaryStatus.title, "任务规格存在问题");
  assert.equal(
    presentation.primaryStatus.reason,
    "producer 将规格标记为 invalid，但没有返回结构化诊断"
  );
  assert.equal(presentation.trust.tone, "healthy");
  assert.equal(presentation.trust.contractTone, "error");
});

function createTasknotesOnlySnapshot() {
  return {
    snapshot_schema_version: 4,
    snapshot_model: "task-centric",
    source: { task_id: taskId, generated_at: "2026-08-08T15:00:00Z" },
    observation: {
      health: "healthy",
      current_task: "observed",
      parent: "not_applicable",
      children: "observed",
      descendants: "healthy",
      tasknotes_api: "ok",
      source_identity_match: true,
      stale: false,
    },
    contract: { status: "not_applicable", task_contract: null },
    current_task: {
      id: taskId,
      title: "Parent",
      status: "in-progress",
      status_is_completed: false,
      has_children: true,
      rollup_state: "running",
      completion: {
        lifecycle_status: "in-progress",
        subtree_terminal: false,
        contract_status: "not_applicable",
        evidence_status: "not_applicable",
        verification_status: "not_applicable",
        review_status: "not_applicable",
        acceptance_status: "not_applicable",
        trust_level: "tasknotes_only",
        trusted_done: false,
      },
      evidence_requirements: [],
      acceptance: [],
      review: { status: "not_applicable" },
    },
    parent: null,
    children: [
      {
        id: "Tasks/Child A.md",
        title: "Child A",
        status: "done",
        status_is_completed: true,
        is_blocked: false,
        blocked_by: [],
        has_children: false,
        rollup_state: "done",
        completion: {
          lifecycle_status: "done",
          subtree_terminal: true,
          trust_level: "tasknotes_only",
          trusted_done: true,
        },
        evidence_requirements: [],
        acceptance: [],
        review: { status: "not_applicable" },
        primary_diagnostic: null,
      },
      {
        id: "Tasks/Child B.md",
        title: "Child B",
        status: "open",
        status_is_completed: false,
        is_blocked: true,
        blocked_by: ["Tasks/Child A.md"],
        has_children: false,
        rollup_state: "blocked",
        completion: {
          lifecycle_status: "open",
          subtree_terminal: false,
          trust_level: "tasknotes_only",
          trusted_done: false,
        },
        evidence_requirements: [],
        acceptance: [],
        review: { status: "not_applicable" },
        primary_diagnostic: null,
      },
    ],
    rollup: {
      state: "running",
      trusted_done: false,
      has_children: true,
      children_total: 2,
      children_trusted_done: 1,
      children_complete: false,
      children_terminal: false,
      blocked_children: [{ id: "Tasks/Child B.md", title: "Child B" }],
      incomplete_children: [{ id: "Tasks/Child B.md", title: "Child B" }],
    },
    diagnostics: [],
    next_actions: [
      {
        kind: "dispatch_ready_child",
        summary: "派发 Child B",
        command: "flow-spawn 'Tasks/Child B.md'",
      },
    ],
    protocol: {
      producer_protocol_version: 4,
      task_contract_schema: "flowdesk.task-contract/4",
      evidence_contract_schema: "flowdesk.evidence-contract/1",
      evidence_record_schema: "flowdesk.evidence-record/1",
      review_record_schema: "flowdesk.review-record/1",
    },
  };
}

test("tasknotes_only 父任务把父子进度作为主状态，不误报合同问题", () => {
  const model = createDashboardViewModel(createTasknotesOnlySnapshot(), {
    expectedTaskPath: taskId,
  });
  const presentation = createDashboardPresentation(model);

  // contract.status=not_applicable 不是合同异常，不得再走「任务规格存在问题」。
  assert.notEqual(presentation.primaryStatus.title, "任务规格存在问题");
  assert.equal(presentation.primaryStatus.location, "直接子任务");
  assert.match(presentation.primaryStatus.title, /1\s*\/\s*2/);
  // 有阻塞子任务时必须点名，并把 next_actions 作为下一步。
  assert.match(presentation.primaryStatus.reason, /Child B/);
  assert.equal(presentation.primaryStatus.remediation, "派发 Child B");
  assert.equal(presentation.primaryStatus.tone, "error");
});

test("tasknotes_only 全部子任务可信完成时主状态为健康收口", () => {
  const snapshot = createTasknotesOnlySnapshot();
  snapshot.current_task.status = "done";
  snapshot.current_task.completion.lifecycle_status = "done";
  snapshot.current_task.completion.trusted_done = true;
  snapshot.children[1].status = "done";
  snapshot.children[1].is_blocked = false;
  snapshot.children[1].blocked_by = [];
  snapshot.children[1].completion.lifecycle_status = "done";
  snapshot.children[1].completion.trusted_done = true;
  snapshot.children[1].status_is_completed = true;
  snapshot.children[1].completion.subtree_terminal = true;
  snapshot.rollup.children_terminal = true;
  snapshot.rollup.trusted_done = true;
  snapshot.rollup.children_trusted_done = 2;
  snapshot.rollup.children_complete = true;
  snapshot.rollup.blocked_children = [];
  snapshot.rollup.incomplete_children = [];

  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });
  const presentation = createDashboardPresentation(model);

  assert.equal(presentation.primaryStatus.tone, "healthy");
  assert.match(presentation.primaryStatus.title, /2\s*\/\s*2/);
  assert.equal(presentation.primaryStatus.location, "直接子任务");
});

test("has_children 但 rollup 计数为 0 时不谎报可信完成", () => {
  const snapshot = createTasknotesOnlySnapshot();
  snapshot.children = [];
  snapshot.rollup.children_total = 0;
  snapshot.rollup.children_trusted_done = 0;
  snapshot.rollup.blocked_children = [];
  snapshot.rollup.incomplete_children = [];

  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });
  const presentation = createDashboardPresentation(model);

  assert.equal(presentation.primaryStatus.tone, "warning");
  assert.equal(presentation.primaryStatus.title,"未观察到直接子任务");
});

test("tasknotes_only trust strip 讲 TaskNotes 底座而非未知合同", () => {
  const model = createDashboardViewModel(createTasknotesOnlySnapshot(), {
    expectedTaskPath: taskId,
  });
  const presentation = createDashboardPresentation(model);

  // not_applicable 不是「未知」，不得再显示合同状态未知这类空壳文案。
  assert.notEqual(presentation.trust.contractLabel, "合同状态未知");
  assert.equal(presentation.trust.contractLabel, "TaskNotes 状态为准");
  assert.equal(presentation.trust.contractTone, "muted");
  assert.equal(presentation.trust.label, "来源读取完整");
});

test("tasknotes_only leaf 任务主状态讲自身进度而非子任务", () => {
  const snapshot = createTasknotesOnlySnapshot();
  snapshot.current_task.has_children = false;
  snapshot.children = [];
  snapshot.rollup = {
    state: "running",
    trusted_done: false,
    has_children: false,
    children_total: 0,
    children_trusted_done: 0,
    children_complete: true,
    blocked_children: [],
    incomplete_children: [],
  };

  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });
  const presentation = createDashboardPresentation(model);

  assert.equal(presentation.kind, "leaf");
  assert.equal(presentation.primaryStatus.location, "当前任务");
  assert.notEqual(presentation.primaryStatus.title, "任务规格存在问题");
  assert.equal(presentation.primaryStatus.remediation, "派发 Child B");
});

test("整行导航只响应 Enter 与 Space 键", () => {
  assert.equal(isActivationKey("Enter"), true);
  assert.equal(isActivationKey(" "), true);
  assert.equal(isActivationKey("Spacebar"), true);
  assert.equal(isActivationKey("Tab"), false);
  assert.equal(isActivationKey("Escape"), false);
});

test("任务壳层标题区分加载、失败和待读取", () => {
  assert.equal(formatTaskShellStatus(true, ""), "正在建立可信观察…");
  assert.equal(formatTaskShellStatus(false, "API 不可用"), "读取失败");
  assert.equal(formatTaskShellStatus(false, ""), "尚未读取 snapshot");
});

test("schema、model 与 protocol mismatch 使用具体 fail-closed 文案", () => {
  const formatError = (
    dashboardPresentation as typeof dashboardPresentation & {
      formatSnapshotCompatibilityError?: (code: string) => string;
    }
  ).formatSnapshotCompatibilityError;
  assert.equal(typeof formatError, "function");
  if (!formatError) return;
  assert.equal(
    formatError("unsupported_snapshot_schema"),
    "Snapshot schema 不受支持：需要 schema 4，或显式 legacy_v3。"
  );
  assert.equal(
    formatError("unsupported_snapshot_model"),
    "Snapshot model 不受支持：需要 task-centric。"
  );
  assert.equal(
    formatError("unsupported_snapshot_protocol"),
    "Snapshot protocol 不受支持：请核对 producer 与 Dashboard 版本。"
  );
});

test("父任务技术诊断按当前任务与直接子任务分组", () => {
  const snapshot = createSnapshot();
  snapshot.diagnostics = [
    {
      code: "task_goal_invalid",
      severity: "error",
      task_id: taskId,
      path: "contract.goal",
      source: { section: "Goal", line_start: 21 },
      reason: { actual: "Goal 为空", expected: "单一交付目标" },
      remediation: { summary: "补写当前任务 Goal" },
    },
  ];
  snapshot.children[0].primary_diagnostic = {
    code: "verification_missing",
    severity: "error",
    task_id: "Tasks/Child.md",
    path: "evidence.verification",
    source: { section: "Verification Result", line_start: 41 },
    reason: { actual: "验证证据缺失", expected: "至少一条验证结果" },
    remediation: { summary: "补充验证命令与结果" },
  };

  const presentation = createDashboardPresentation(
    createDashboardViewModel(snapshot, { expectedTaskPath: taskId })
  ) as any;

  assert.deepEqual(
    presentation.technicalDiagnostics.map((group: any) => ({
      kind: group.kind,
      taskId: group.taskId,
      taskTitle: group.taskTitle,
      count: group.diagnostics.length,
      sourceLabel: group.diagnostics[0].sourceLabel,
    })),
    [
      {
        kind: "current",
        taskId,
        taskTitle: "Parent",
        count: 1,
        sourceLabel: "Goal · 第 21 行",
      },
      {
        kind: "child",
        taskId: "Tasks/Child.md",
        taskTitle: "Child",
        count: 1,
        sourceLabel: "Verification Result · 第 41 行",
      },
    ]
  );
});

test("v4 合同条目使用稳定 UID、label 与 covers", () => {
  assert.deepEqual(
    createContractItemPresentation(
      { uid: "REQ-001", label: "验证必须由受控 runner 产生" } as any,
      "requirement"
    ),
    {
      id: "REQ-001",
      text: "验证必须由受控 runner 产生",
      requirementIds: [],
      sourceLabel: "任务文件",
      steps: null,
    }
  );
  assert.deepEqual(
    createContractItemPresentation(
      { uid: "SCN-001", label: "runner 产生验证", covers: ["REQ-001"] } as any,
      "scenario"
    ).requirementIds,
    ["REQ-001"]
  );
});

test("legacy_v3 trust strip 明确显示历史验证且保留可信完成", () => {
  const snapshot = createSnapshot() as any;
  snapshot.current_task.status = "done";
  snapshot.current_task.trusted_done = true;
  snapshot.contract.acceptance = [{ text: "历史验收", checked: true }];
  snapshot.evidence = {
    execution: "valid",
    verification: "valid",
    delivery: "valid",
  };
  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });
  const presentation = createDashboardPresentation(model);

  assert.equal(model.currentTask.trustedDone, true);
  assert.equal(presentation.trust.label, "来源读取完整");
  assert.equal(presentation.primaryStatus.title, "v3 历史验证已保留");
});

test("v4 review_required 与缺失证据使用增量 trust/diagnostic 文案", () => {
  const base = createSnapshot() as any;
  base.snapshot_schema_version = 4;
  delete base.source_task_id;
  delete base.generated_at;
  delete base.evidence;
  base.source = { task_id: taskId, generated_at: "2026-08-07T12:00:00Z" };
  base.protocol = {
    producer_protocol_version: 4,
    task_contract_schema: "flowdesk.task-contract/4",
    evidence_contract_schema: "flowdesk.evidence-contract/1",
    evidence_record_schema: "flowdesk.evidence-record/1",
    review_record_schema: "flowdesk.review-record/1",
  };
  base.contract = {
    status: "valid",
    task_contract: {
      schema: "flowdesk.task-contract/4",
      goal: "复核证据",
      scope: { included: ["复核"], excluded: [] },
      requirements: [],
      scenarios: [],
      acceptance: [],
    },
  };
  base.current_task.completion = {
    lifecycle_status: "done",
    contract_status: "valid",
    evidence_status: "satisfied",
    verification_status: "passed",
    review_status: "pending",
    acceptance_status: "satisfied",
    trust_level: "review_required",
    trusted_done: false,
  };
  base.current_task.evidence_requirements = [];
  base.current_task.acceptance = [];
  base.current_task.review = { status: "pending" };
  base.diagnostics = [
    {
      code: "review_required",
      severity: "error",
      task_id: taskId,
      path: "reviews",
      reason: "current evidence bundle requires review",
      evidence: { requirement_uids: ["EVR-001"] },
      next_action: "approve or request changes from the Dashboard review action",
    },
  ];
  const reviewPresentation = createDashboardPresentation(
    createDashboardViewModel(base, { expectedTaskPath: taskId })
  );
  assert.equal(reviewPresentation.trust.label, "来源读取完整");
  assert.equal(reviewPresentation.primaryStatus.title, "结构化证据等待人工复核");

  base.current_task.completion.evidence_status = "missing";
  base.current_task.completion.review_status = "pending";
  base.current_task.completion.trust_level = "untrusted_v4";
  base.diagnostics[0].code = "evidence_requirement_missing";
  base.diagnostics[0].path = "evidence.requirements.EVR-001";
  const missingPresentation = createDashboardPresentation(
    createDashboardViewModel(base, { expectedTaskPath: taskId })
  );
  assert.equal(missingPresentation.trust.label, "来源读取完整");
  assert.equal(missingPresentation.primaryStatus.title, "结构化证据缺失");
});

// contract.status=not_applicable 表示「producer 不做语义判定」，不表示「没有结构化合同」。
// producer 仍会把正文 ## Requirements / ## Scenarios 解析进 task_contract，
// 因此 REQ/SCN chip 与 not_applicable 可以同时为真——判定层必须认这一点。
function createNotApplicableWithContractSnapshot() {
  const snapshot = createTasknotesOnlySnapshot();
  snapshot.current_task.has_children = false;
  snapshot.children = [];
  snapshot.rollup = {
    state: "running",
    trusted_done: false,
    has_children: false,
    children_total: 0,
    children_trusted_done: 0,
    children_complete: false,
    blocked_children: [],
    incomplete_children: [],
  };
  snapshot.contract = {
    status: "not_applicable",
    task_contract: {
      schema: "flowdesk.task-body-spec/1",
      goal: "修复文案矛盾",
      requirements: [
        { id: "REQ-1", text: "第一条需求" },
        { id: "REQ-2", text: "第二条需求" },
      ],
      scenarios: [{ id: "SCN-1", text: "第一个场景" }],
      acceptance: [],
    },
  };
  return snapshot;
}

test("not_applicable 与结构化 REQ/SCN 并存时，主状态讲进度而不误报规格问题", () => {
  const model = createDashboardViewModel(createNotApplicableWithContractSnapshot(), {
    expectedTaskPath: taskId,
  });
  const presentation = createDashboardPresentation(model);

  // chip 侧是对的：producer 真的返回了 REQ/SCN，必须继续渲染。
  assert.equal(model.contract.requirements.length, 2);
  assert.equal(model.contract.scenarios.length, 1);
  assert.equal(presentation.contract.coverage, "投影条目；完整正文见 API 原文");

  // 文案侧不得把「不做判定」说成「规格有问题」。
  assert.notEqual(presentation.primaryStatus.title, "任务规格存在问题");
  assert.equal(presentation.primaryStatus.location, "当前任务");
  assert.equal(presentation.trust.contractLabel, "TaskNotes 状态为准");
});

test("completion.contract_status 缺失时仍以 contract.status 认定判定层不适用", () => {
  const snapshot = createNotApplicableWithContractSnapshot();
  // 模拟上游字段裁剪：completion 不再回传 contract_status，
  // 但顶层 contract.status 仍然明确写着 not_applicable。
  delete (snapshot.current_task.completion as { contract_status?: string })
    .contract_status;

  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });
  const presentation = createDashboardPresentation(model);

  assert.equal(model.currentTask.completion.contractStatus, "unknown");
  assert.equal(model.contract.semanticStatus, "not_applicable");

  // REQ/SCN chip 仍在，文案不得与之矛盾。
  assert.equal(presentation.contract.coverage, "投影条目；完整正文见 API 原文");
  assert.notEqual(presentation.primaryStatus.title, "任务规格存在问题");
  assert.notEqual(presentation.trust.contractLabel, "规格状态未知");
  assert.equal(presentation.trust.contractLabel, "TaskNotes 状态为准");
  assert.equal(presentation.trust.contractTone, "muted");
});


test("completed_dependencies_are_history_not_blockers and unfinished rows first",()=>{
 const snapshot=createTasknotesOnlySnapshot();
 snapshot.children=[
  {...snapshot.children[0],id:"Tasks/Done.md",title:"Done",status:"done",is_blocked:false,blocked_by:["Tasks/Dependency.md"]},
  {...snapshot.children[1],id:"Tasks/Unknown.md",title:"Unknown",status:"custom-state",status_is_completed:null,is_blocked:false,blocked_by:[],completion:{...snapshot.children[1].completion,subtree_terminal:null}},
  {...snapshot.children[1],id:"Tasks/Running.md",title:"Running",status:"in-progress",is_blocked:false,blocked_by:[]},
 ];
 const result=createDashboardPresentation(createDashboardViewModel(snapshot,{expectedTaskPath:taskId}));
 assert.deepEqual(result.children.map(x=>x.id),["Tasks/Running.md","Tasks/Unknown.md","Tasks/Done.md"]);
 assert.equal(result.children[2].status,"已完成");
 assert.match(result.children[2].meta,/历史依赖|依赖于/);
 assert.doesNotMatch(result.children[2].meta,/阻塞于/);
 assert.match(result.children[1].status,/custom-state.*未知/);
 assert.doesNotMatch(JSON.stringify(result),/可信完成|待验收/);
 assert.equal(result.trust.label,"来源读取完整");
});


test("observation health is independent from legacy completion and acceptance diagnostics",()=>{
 const snapshot=createSnapshot();snapshot.contract.semantic_status="invalid";
 const result=createDashboardPresentation(createDashboardViewModel(snapshot,{expectedTaskPath:taskId}));
 assert.equal(result.trust.label,"来源读取完整");
 assert.equal(result.trust.tone,"healthy");
 assert.equal(result.primaryStatus.tone,"error");
 assert.equal(result.header.status,"进行中");
});


function terminalSnapshot(): any {
  const snapshot: any = createTasknotesOnlySnapshot();
  snapshot.current_task.status_is_completed = false;
  snapshot.current_task.completion.subtree_terminal = false;
  snapshot.children[0].status_is_completed = true;
  snapshot.children[0].completion.subtree_terminal = true;
  snapshot.children[1].status = "cancel";
  snapshot.children[1].status_is_completed = true;
  snapshot.children[1].completion.subtree_terminal = true;
  snapshot.rollup.children_terminal = true;
  snapshot.next_actions = [{kind: "summary", summary: "复核当前父任务的收口事实"}];
  return snapshot;
}

test("mixed done and cancel subtrees are ended while success count stays one", () => {
  const result = createDashboardPresentation(createDashboardViewModel(terminalSnapshot(), {expectedTaskPath: taskId}));
  assert.match(result.primaryStatus.title, /成功\s*1\s*\/\s*2/);
  assert.match(result.primaryStatus.title, /已结束\s*2\s*\/\s*2/);
  assert.equal(result.primaryStatus.tone, "healthy");
  assert.equal(result.primaryStatus.remediation, "复核当前父任务的收口事实");
  assert.ok(result.children.every(row => row.history));
  const cancelled = result.children.find(row => row.id === "Tasks/Child B.md")!;
  assert.doesNotMatch(cancelled.status, /未知/);
  assert.notEqual(cancelled.tone, "error");
  assert.match(cancelled.meta, /历史依赖/);
  assert.doesNotMatch(cancelled.meta, /阻塞于/);
});

test("ended nodes with active or unknown descendants stay visible for attention", () => {
  for (const subtree of [false, null]) {
    const snapshot = terminalSnapshot();
    snapshot.children[1].completion.subtree_terminal = subtree;
    snapshot.rollup.children_terminal = subtree;
    const result = createDashboardPresentation(createDashboardViewModel(snapshot, {expectedTaskPath: taskId}));
    const cancelled = result.children.find(row => row.id === "Tasks/Child B.md")!;
    assert.equal(cancelled.history, false);
    assert.notEqual(cancelled.tone, "error");
    assert.doesNotMatch(cancelled.meta, /阻塞于/);
    assert.match(cancelled.meta, subtree === false ? /后代未结束/ : /子树状态未知/);
    assert.notEqual(result.primaryStatus.tone, "healthy");
    assert.doesNotMatch(result.primaryStatus.reason, /被阻塞/);
  }
});

test("missing terminal fields never hide done rows in ended group", () => {
  const snapshot: any = createTasknotesOnlySnapshot();
  delete snapshot.rollup.children_terminal;
  for (const child of snapshot.children) {
    delete child.status_is_completed;
    delete child.completion.subtree_terminal;
  }
  const result = createDashboardPresentation(createDashboardViewModel(snapshot, {expectedTaskPath: taskId}));
  assert.equal(result.children.find(row => row.id === "Tasks/Child A.md")!.history, false);
  assert.match(result.children.find(row => row.id === "Tasks/Child A.md")!.meta, /状态未知/);
  assert.notEqual(result.primaryStatus.tone, "healthy");
});

test("native ended leaf with old dependency remains read only and preserves custom status", () => {
  const snapshot = terminalSnapshot();
  snapshot.current_task.has_children = false;
  snapshot.current_task.status = "custom-closed";
  snapshot.current_task.status_is_completed = true;
  snapshot.current_task.completion.subtree_terminal = true;
  snapshot.current_task.is_blocked = true;
  snapshot.current_task.blocked_by = ["Tasks/Old dependency.md"];
  const result = createDashboardPresentation(createDashboardViewModel(snapshot, {expectedTaskPath: taskId}));
  assert.match(result.header.status, /custom-closed.*已结束/);
  assert.doesNotMatch(result.header.status, /未知|成功/);
  assert.notEqual(result.header.statusTone, "error");
  assert.notEqual(result.primaryStatus.tone, "error");
  assert.match(result.primaryStatus.reason, /历史依赖/);
  assert.doesNotMatch(result.primaryStatus.reason, /阻塞/);
  assert.equal(result.primaryStatus.remediation, "复核当前父任务的收口事实");
});


test("explicit legacy_v3 keeps historical lifecycle grouping and dependencies without inventing native fields", () => {
  const cases = [
    {status: "done", history: true, tone: "healthy", label: "已完成"},
    {status: "complete", history: true, tone: "warning", label: "已完成"},
    {status: "completed", history: true, tone: "warning", label: "已完成"},
    {status: "blocked", history: false, tone: "error", label: "已阻塞"},
    {status: "in-progress", history: false, tone: "error", label: "进行中"},
    {status: "custom", history: false, tone: "error", label: "custom（未知状态）"},
  ];
  for (const schema of [3, 4]) {
    const snapshot: any = createSnapshot();
    if (schema === 4) {
      snapshot.snapshot_schema_version = 4;
      snapshot.source = {task_id: taskId};
      snapshot.protocol = {producer_protocol_version: 4};
      snapshot.current_task.completion = {trust_level: "legacy_v3"};
    }
    snapshot.children = cases.map(item => ({...snapshot.children[0], id: `Tasks/${item.status}.md`, status: item.status, is_blocked: true, blocked_by: ["Tasks/Past.md"]}));
    const model = createDashboardViewModel(snapshot, {expectedTaskPath: taskId});
    const result = createDashboardPresentation(model);
    for (const expected of cases) {
      const row = result.children.find(child => child.id === `Tasks/${expected.status}.md`)!;
      assert.equal(row.history, expected.history, `${schema}:${expected.status}`);
      assert.equal(row.tone, expected.tone, `${schema}:${expected.status}`);
      assert.equal(row.status, expected.label, `${schema}:${expected.status}`);
      assert.match(row.meta, expected.history ? /历史依赖 Past/ : /阻塞于 Past/);
      assert.doesNotMatch(row.meta, /子树|状态未知/);
    }
    assert.ok(model.children.every(child => child.statusIsCompleted === null && child.subtreeTerminal === null));
    assert.deepEqual(result.children.filter(row => row.history).map(row => row.id), ["Tasks/done.md", "Tasks/complete.md", "Tasks/completed.md"]);
  }
});
