import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardViewModel,
  formatDiagnosticReason,
  formatDiagnosticRemediation,
  isSnapshotRequestCurrent,
  resolveDiagnosticTarget,
  shouldResetDisplayState,
  validateSnapshotSource,
} from "../src/snapshot-model.ts";

test("缺少 schema 与 observation 的旧 snapshot 显示未知观测", () => {
  const model = createDashboardViewModel({ state: { value: "running" } });

  assert.equal(model.observation.health, "unknown");
  assert.equal(model.compatibility.label, "旧版 snapshot · 能力未知");
  assert.equal(model.observation.isTrustworthy, false);
});

test("读取 v2 inline 进度与兼容信息", () => {
  const model = createDashboardViewModel({
    snapshot_schema_version: 2,
    observation: {
      generated_at: "2026-08-05T04:14:58Z",
      source_task_id: "Tasks/A.md",
      health: "healthy",
      coverage: { parent: "ok", children_canonical: "ok" },
      diagnostics: [],
    },
    compatibility: {
      contract_version: "v2",
      semantic_mode: "strict-v2",
      profile: "inline",
      label: "SDD v2 · inline",
    },
    task_graph: {
      inline_execution: {
        total: 2,
        completed: 1,
        status: "in-progress",
        explicit: true,
        statuses: {
          "TASK-1.1": { status: "done", inferred: false },
          "TASK-2.1": { status: "in-progress", inferred: false },
        },
      },
    },
  });

  assert.equal(model.schemaLabel, "snapshot v2");
  assert.equal(model.compatibility.label, "SDD v2 · inline");
  assert.equal(model.observation.isTrustworthy, true);
  assert.equal(model.inlineProgress?.completed, 1);
  assert.equal(model.inlineProgress?.total, 2);
  assert.deepEqual(model.inlineProgress?.tasks, [
    { id: "TASK-1.1", status: "done", inferred: false },
    { id: "TASK-2.1", status: "in-progress", inferred: false },
  ]);
});

test("首要诊断按 semantic、inline、observation 顺序选择", () => {
  const model = createDashboardViewModel({
    observation: {
      diagnostics: [{ code: "observation_incomplete", reason: "观测不完整" }],
    },
    task_graph: {
      inline_execution: {
        diagnostics: [{ code: "inline_status_missing", reason: "缺少 inline 状态" }],
      },
    },
    spec_contract: {
      semantic_validation: {
        errors: [
          {
            code: "why_placeholder_detected",
            source: { section: "Why", line_start: 41 },
            reason: { actual: "检测到占位词", expected: "真实动机" },
            remediation: { summary: "改写 Why" },
          },
        ],
      },
    },
  });

  assert.equal(model.primaryDiagnostic?.code, "why_placeholder_detected");
  assert.deepEqual(
    model.diagnostics.map((diagnostic) => diagnostic.code),
    ["why_placeholder_detected", "inline_status_missing", "observation_incomplete"]
  );
  assert.equal(model.primaryDiagnostic?.reason, "检测到占位词");
  assert.equal(model.primaryDiagnostic?.remediation, "改写 Why");
  assert.deepEqual(
    resolveDiagnosticTarget("Tasks/A.md", model.primaryDiagnostic?.source),
    { linkText: "Tasks/A.md#Why", line: 41 }
  );
});

test("已完成 inline 卡生成阶段与 TASK 概览", () => {
  const model = createDashboardViewModel({
    snapshot_schema_version: 2,
    observation: { health: "healthy", diagnostics: [] },
    task_graph: {
      parent: { title: "Dashboard upgrade", status: "done" },
      counts: { total: 0, done: 0 },
      inline_execution: {
        total: 1,
        completed: 1,
        status: "complete",
        explicit: true,
        statuses: { "TASK-1.1": { status: "done", inferred: false } },
      },
    },
    flow_graph: {
      current: "delivery",
      nodes: Array.from({ length: 6 }, (_, index) => ({
        id: `stage-${index + 1}`,
        status: "done",
      })),
    },
    next_actions: [],
  });

  assert.equal(model.hero.progressLabel, "6/6 阶段");
  assert.equal(model.hero.inlineLabel, "1/1 TASK");
  assert.equal(model.hero.workProgressKind, "inline");
  assert.equal(model.nextAction, null);
});

test("children 卡优先显示子任务计数，不展示 binding 百分比", () => {
  const model = createDashboardViewModel({
    task_graph: {
      counts: { total: 5, done: 3 },
      task_materialization: { mode: "children", status: "ready" },
    },
  });

  assert.equal(model.hero.workProgressKind, "children");
  assert.equal(model.hero.workProgressLabel, "3/5 子任务");
  assert.equal(model.hero.inlineLabel, null);
  assert.doesNotMatch(model.hero.workProgressLabel, /bound/i);
});

test("无行号诊断定位到 after_section，并格式化结构化修复信息", () => {
  assert.deepEqual(
    resolveDiagnosticTarget("Tasks/A.md", {
      section: "Why",
      line_start: null,
      after_section: "Contract Phase",
    }),
    { linkText: "Tasks/A.md#Contract Phase", line: null }
  );
  assert.equal(
    formatDiagnosticReason({ actual: "检测到占位词", expected: "真实动机" }),
    "检测到占位词"
  );
  assert.equal(formatDiagnosticRemediation({ summary: "改写 Why" }), "改写 Why");
});

test("旧 producer 只有 code/message 时保留消息并明确缺少修法", () => {
  const model = createDashboardViewModel({
    spec_contract: {
      semantic_validation: {
        errors: [{ code: "why_missing", message: "缺少有效 Why" }],
      },
    },
  });

  assert.equal(model.primaryDiagnostic?.message, "缺少有效 Why");
  assert.equal(model.primaryDiagnostic?.reason, "缺少有效 Why");
  assert.equal(model.primaryDiagnostic?.remediation, "producer 未提供");
  assert.equal(model.primaryDiagnostic?.source, undefined);
});

test("校验 snapshot source identity，并将同任务刷新失败标为旧数据", () => {
  const snapshot = {
    snapshot_schema_version: 2,
    observation: {
      source_task_id: "Tasks/A.md",
      health: "healthy",
      diagnostics: [],
    },
  };

  assert.equal(validateSnapshotSource(snapshot, "Tasks/A.md"), true);
  assert.equal(validateSnapshotSource(snapshot, "Tasks/B.md"), false);
  assert.equal(validateSnapshotSource({ state: { value: "running" } }, "Tasks/A.md"), "unknown");

  const model = createDashboardViewModel(snapshot, {
    staleReason: "刷新失败",
    loadedAt: "12:30:00",
  });
  assert.equal(model.observation.isStale, true);
  assert.equal(model.observation.staleReason, "刷新失败");
  assert.equal(model.observation.loadedAt, "12:30:00");
  assert.equal(model.observation.isTrustworthy, false);
});

test("切换任务立即清空旧显示，并拒绝迟到的旧任务结果", () => {
  assert.equal(shouldResetDisplayState("Tasks/A.md", "Tasks/B.md"), true);
  assert.equal(shouldResetDisplayState("Tasks/A.md", "Tasks/A.md"), false);
  assert.equal(isSnapshotRequestCurrent("Tasks/A.md", "Tasks/B.md"), false);
  assert.equal(isSnapshotRequestCurrent("Tasks/B.md", "Tasks/B.md"), true);
});
