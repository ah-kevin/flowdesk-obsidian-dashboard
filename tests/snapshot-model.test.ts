import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createDashboardViewModel,
  formatChildEvidenceHealth,
  formatNextAction,
  formatRollupState,
  resolveDiagnosticTarget,
  validateSnapshotSource,
} from "../src/snapshot-model.ts";

const rootId = "Tasks/Root.md";

function createV3Snapshot() {
  return {
    snapshot_schema_version: 3,
    generated_at: "2026-08-05T12:00:00Z",
    source_task_id: rootId,
    observation: {
      health: "healthy",
      parent: "observed",
      children: "observed",
      tasknotes_api: "ok",
      source_identity_match: true,
    },
    contract: {
      version: "v3",
      role: "root",
      semantic_status: "valid",
      requirements: [],
      scenarios: [],
      overall_acceptance: [],
    },
    task_tree: {
      root: {
        id: rootId,
        title: "SDD v3 root",
        status: "in-progress",
        priority: "high",
      },
      children: [
        {
          id: "Tasks/Child A.md",
          title: "Child A",
          status: "done",
          priority: "normal",
          is_blocked: false,
          blocked_by: [],
          goal: "完成 producer",
          covers: ["REQ-001"],
          acceptance: [{ text: "producer 通过", checked: true }],
          semantic_status: "valid",
          evidence_health: {
            execution: "valid",
            verification: "valid",
            delivery: "valid",
          },
          trusted_done: true,
        },
        {
          id: "Tasks/Child B.md",
          title: "Child B",
          status: "in-progress",
          priority: "high",
          is_blocked: true,
          blocked_by: [{ uid: "Tasks/Child A.md", reltype: "blocks" }],
          goal: "完成 Dashboard",
          covers: ["REQ-002", "SCN-002"],
          acceptance: [{ text: "Dashboard 通过", checked: false }],
          semantic_status: "valid",
          evidence_health: {
            execution: "missing",
            verification: "invalid",
            delivery: "missing",
          },
          trusted_done: false,
        },
      ],
      counts: {
        total: 2,
        open: 0,
        in_progress: 1,
        blocked: 1,
        done: 1,
        trusted_done: 1,
      },
    },
    rollup: {
      state: "blocked",
      children_complete: false,
      trusted_children_complete: false,
      blocked_children: [
        { id: "Tasks/Child B.md", title: "Child B", status: "in-progress" },
      ],
      incomplete_children: [
        { id: "Tasks/Child B.md", title: "Child B", status: "in-progress" },
      ],
      contradictions: [],
    },
    evidence: {
      root: { execution: "missing", verification: "missing", delivery: "missing" },
      children: {
        "Tasks/Child A.md": {
          execution: "valid",
          verification: "valid",
          delivery: "valid",
        },
        "Tasks/Child B.md": {
          execution: "missing",
          verification: "invalid",
          delivery: "missing",
        },
      },
    },
    diagnostics: [
      {
        code: "child_verification_invalid",
        severity: "error",
        task_id: "Tasks/Child B.md",
        path: "evidence.verification",
        source: { section: "Verification Result", line_start: 41 },
        reason: { actual: "缺少成功验证命令", expected: "至少一条通过的验证" },
        remediation: { summary: "运行验证并写回结果" },
      },
    ],
    next_actions: [
      {
        kind: "resolve_child_blockers",
        summary: "处理阻塞 child",
        task_ids: ["Tasks/Child B.md"],
      },
    ],
  };
}

test("v3 模型呈现可信完成数、阻塞 child 与结构化诊断", () => {
  const model = createDashboardViewModel(createV3Snapshot());

  assert.equal(model.errorCode, null);
  assert.equal(model.schemaLabel, "snapshot v3");
  assert.equal(model.hero.workProgressLabel, "1/2 子任务可信完成");
  assert.equal(model.rollup.state, "blocked");
  assert.equal(model.children[1].isBlocked, true);
  assert.deepEqual(model.children[1].blockedBy, ["Tasks/Child A.md"]);
  assert.deepEqual(model.children[1].covers, ["REQ-002", "SCN-002"]);
  assert.equal(model.children[1].evidenceHealth.verification, "invalid");
  assert.equal(model.primaryDiagnostic?.taskId, "Tasks/Child B.md");
  assert.equal(model.primaryDiagnostic?.reason, "缺少成功验证命令");
  assert.equal(model.primaryDiagnostic?.remediation, "运行验证并写回结果");
});

test("缺失或非 3 schema 明确返回 unsupported_snapshot_schema", () => {
  for (const snapshot of [{}, { snapshot_schema_version: 2 }]) {
    const model = createDashboardViewModel(snapshot);
    assert.equal(model.errorCode, "unsupported_snapshot_schema");
    assert.equal(model.observation.isTrustworthy, false);
  }
});

test("observation 非 healthy 或 stale 时无法可信判断", () => {
  const degraded = createV3Snapshot();
  degraded.observation.health = "degraded";
  const degradedModel = createDashboardViewModel(degraded);
  assert.equal(degradedModel.observation.isTrustworthy, false);
  assert.equal(degradedModel.observation.trustMessage, "观测不可信，无法判断任务是否正常");

  const staleModel = createDashboardViewModel(createV3Snapshot(), {
    expectedTaskPath: rootId,
    staleReason: "刷新失败",
    loadedAt: "12:30:00",
  });
  assert.equal(staleModel.observation.isStale, true);
  assert.equal(staleModel.observation.isTrustworthy, false);
});

test("诊断定位使用 producer task_id 和 source", () => {
  const diagnostic = createDashboardViewModel(createV3Snapshot()).primaryDiagnostic;
  assert.ok(diagnostic);
  assert.deepEqual(resolveDiagnosticTarget(diagnostic.taskId, diagnostic.source), {
    linkText: "Tasks/Child B.md#Verification Result",
    line: 41,
    editorLine: 40,
  });
});

test("next action 使用 producer v3 summary", () => {
  assert.equal(
    formatNextAction({ kind: "continue_child_work", summary: "继续当前 child" }),
    "继续当前 child"
  );
});

test("UI helper 清晰格式化 rollup、child evidence 与无 summary 的下一动作", () => {
  assert.equal(formatRollupState("blocked"), "存在阻塞子任务");
  assert.equal(formatRollupState("awaiting_parent_verification"), "等待父任务整体验证");
  assert.equal(formatRollupState("inconsistent"), "父子状态矛盾");
  assert.equal(
    formatChildEvidenceHealth({
      execution: "missing",
      verification: "invalid",
      delivery: "valid",
    }),
    "执行缺失 · 验证无效 · 交付有效"
  );
  assert.equal(
    formatNextAction({ kind: "resolve_child_blockers", task_ids: ["Tasks/Child B.md"] }),
    "处理子任务阻塞：Tasks/Child B.md"
  );
});

test("真实 producer fixture 字段级映射保持一致", () => {
  const producerPath = path.join(
    process.env.FLOWDESK_PLUGIN_ROOT ?? "/Users/bjke/workspaces/flowdesk-plugin",
    "tests/fixtures/execution_snapshot/sdd_v3_real_root_snapshot.json"
  );
  const bundledPath = path.join(
    process.cwd(),
    "tests/fixtures/sdd_v3_real_root_snapshot.json"
  );
  assert.equal(existsSync(bundledPath), true, `缺少 Dashboard fixture: ${bundledPath}`);
  const fixturePath = existsSync(producerPath) ? producerPath : bundledPath;
  const snapshot = JSON.parse(readFileSync(fixturePath, "utf8"));
  if (existsSync(producerPath)) {
    assert.deepEqual(
      JSON.parse(readFileSync(bundledPath, "utf8")),
      snapshot,
      "Dashboard 内置 fixture 必须与真实 producer fixture 完全一致"
    );
  }
  const model = createDashboardViewModel(snapshot, {
    expectedTaskPath: snapshot.source_task_id,
  });

  assert.equal(model.errorCode, null);
  assert.equal(model.hero.title, snapshot.task_tree.root.title);
  assert.equal(
    model.hero.workProgressLabel,
    `${snapshot.task_tree.counts.trusted_done}/${snapshot.task_tree.counts.total} 子任务可信完成`
  );
  assert.equal(model.rollup.state, snapshot.rollup.state);
  assert.deepEqual(
    model.children.map((child) => child.id),
    snapshot.task_tree.children.map((child: { id: string }) => child.id)
  );
  assert.equal(model.children[0].priority, snapshot.task_tree.children[0].priority);
  assert.deepEqual(model.children[0].covers, snapshot.task_tree.children[0].covers);
  assert.deepEqual(
    model.children[0].evidenceHealth,
    snapshot.task_tree.children[0].evidence_health
  );
  assert.equal(model.observation.isTrustworthy, true);
  assert.equal(model.nextAction, snapshot.next_actions[0].summary);
});

test("source identity 只接受 v3 顶层 source_task_id", () => {
  const snapshot = createV3Snapshot();
  assert.equal(validateSnapshotSource(snapshot, rootId), true);
  assert.equal(validateSnapshotSource(snapshot, "Tasks/Other.md"), false);
  assert.equal(validateSnapshotSource({}, rootId), "unknown");

  const missingSource = createV3Snapshot();
  delete (missingSource as { source_task_id?: string }).source_task_id;
  const missingSourceModel = createDashboardViewModel(missingSource, {
    expectedTaskPath: rootId,
  });
  assert.equal(missingSourceModel.observation.sourceIdentity, "unknown");
  assert.equal(missingSourceModel.observation.isTrustworthy, false);
});
