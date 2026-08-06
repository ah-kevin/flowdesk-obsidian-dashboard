import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardPresentation,
  isActivationKey,
  resolveDisclosureState,
} from "../src/dashboard-presentation.ts";
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

test("child 只有真实阻塞关系存在时才在紧凑行显示", () => {
  const snapshot = createSnapshot();
  snapshot.children[0].is_blocked = true;
  snapshot.children[0].blocked_by = [
    { uid: "Tasks/Dependency.md", reltype: "blocks" },
  ];
  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });

  const child = createDashboardPresentation(model).children[0];

  assert.equal(child.meta, "阻塞于 Tasks/Dependency.md · 验证无效");
});

test("合同摘要默认展开，完整详情默认关闭，同 task 刷新保持选择", () => {
  assert.deepEqual(resolveDisclosureState(undefined, true), {
    summaryOpen: true,
    fullOpen: false,
  });
  assert.deepEqual(
    resolveDisclosureState({ summaryOpen: false, fullOpen: true }, false),
    { summaryOpen: false, fullOpen: true }
  );
  assert.deepEqual(
    resolveDisclosureState({ summaryOpen: false, fullOpen: true }, true),
    { summaryOpen: true, fullOpen: false }
  );
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
  assert.deepEqual(presentation.contract, {
    goal: "交付可验证的 Dashboard",
    coverage: "REQ 2 · SCN 1",
    acceptance: "验收 1/2",
    evidence: "执行有效 · 验证缺失 · 交付有效",
    diagnostics: "0 个诊断",
  });
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
});

test("整行导航只响应 Enter 与 Space 键", () => {
  assert.equal(isActivationKey("Enter"), true);
  assert.equal(isActivationKey(" "), true);
  assert.equal(isActivationKey("Spacebar"), true);
  assert.equal(isActivationKey("Tab"), false);
  assert.equal(isActivationKey("Escape"), false);
});
