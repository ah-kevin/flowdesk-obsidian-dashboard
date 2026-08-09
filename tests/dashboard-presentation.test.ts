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
    summary: "等待当前任务验证",
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

test("子任务已完成但未可信时优先显示需处理而不是绿色完成", () => {
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

  assert.equal(child.status, "需处理");
  assert.equal(child.tone, "error");
  assert.equal(child.summary, "找到 0 个 ## Task Contract v3");
  assert.equal(child.meta, "TaskNotes 已完成");
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

  assert.equal(presentation.trust.label, "v3 历史验证");
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
  assert.deepEqual(presentation.contract.metrics, [
    { label: "REQ / SCN", value: "2 / 1" },
    { label: "验收", value: "1 / 2" },
    { label: "证据有效", value: "2 / 3" },
  ]);
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
  assert.equal(presentation.primaryStatus.title, "任务合同存在问题");
  assert.equal(
    presentation.primaryStatus.reason,
    "producer 将合同标记为 invalid，但没有返回结构化诊断"
  );
  assert.equal(presentation.trust.tone, "warning");
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
      has_children: true,
      rollup_state: "running",
      completion: {
        lifecycle_status: "in-progress",
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
        is_blocked: false,
        blocked_by: [],
        has_children: false,
        rollup_state: "done",
        completion: {
          lifecycle_status: "done",
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
        is_blocked: true,
        blocked_by: ["Tasks/Child A.md"],
        has_children: false,
        rollup_state: "blocked",
        completion: {
          lifecycle_status: "open",
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

  // contract.status=not_applicable 不是合同异常，不得再走「任务合同存在问题」。
  assert.notEqual(presentation.primaryStatus.title, "任务合同存在问题");
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
  assert.match(presentation.primaryStatus.title, /0\s*\/\s*0/);
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
  assert.equal(presentation.trust.label, "观察可信");
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
  assert.notEqual(presentation.primaryStatus.title, "任务合同存在问题");
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
  assert.equal(presentation.trust.label, "v3 历史验证");
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
  assert.equal(reviewPresentation.trust.label, "等待人工复核");
  assert.equal(reviewPresentation.primaryStatus.title, "结构化证据等待人工复核");

  base.current_task.completion.evidence_status = "missing";
  base.current_task.completion.review_status = "pending";
  base.current_task.completion.trust_level = "untrusted_v4";
  base.diagnostics[0].code = "evidence_requirement_missing";
  base.diagnostics[0].path = "evidence.requirements.EVR-001";
  const missingPresentation = createDashboardPresentation(
    createDashboardViewModel(base, { expectedTaskPath: taskId })
  );
  assert.equal(missingPresentation.trust.label, "证据待补充");
  assert.equal(missingPresentation.primaryStatus.title, "结构化证据缺失");
});
