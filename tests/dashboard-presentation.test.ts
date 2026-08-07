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

  assert.equal(presentation.primaryStatus.title, "缺少 Task Contract v3");
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
    meta: "验证无效",
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
  assert.equal(child.meta, "TaskNotes 已完成 · 执行无效 · 验证无效");
});

test("child 只有真实阻塞关系存在时才在紧凑行显示", () => {
  const snapshot = createSnapshot();
  snapshot.children[0].is_blocked = true;
  snapshot.children[0].blocked_by = [
    { uid: "Tasks/Dependency.md", reltype: "blocks" },
  ];
  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });

  const child = createDashboardPresentation(model).children[0];

  assert.equal(child.meta, "阻塞于 Dependency · 验证无效");
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
    "acceptance",
    "evidence",
    "observation",
  ]);
  assert.deepEqual(resolveOrder(false), [
    "contract",
    "acceptance",
    "evidence",
    "observation",
  ]);
});

test("健康摘要同时证明观察、来源和检查范围", () => {
  const presentation = createDashboardPresentation(createModel());

  assert.equal(presentation.trust.label, "观察可信");
  assert.equal(presentation.trust.contractLabel, "合同有效");
  assert.equal(
    presentation.primaryStatus.title,
    "已读取当前任务，未发现结构化诊断"
  );
  assert.equal(presentation.primaryStatus.reason, "已检查任务合同与执行证据");
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
  assert.equal(presentation.trust.tone, "healthy");
  assert.equal(presentation.trust.contractTone, "error");
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
