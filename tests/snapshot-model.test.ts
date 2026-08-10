import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createDashboardViewModel,
  formatChildEvidenceHealth,
  formatCurrentTaskProgress,
  formatNextAction,
  formatRollupState,
  resolveDiagnosticNavigation,
  resolveDiagnosticTarget,
  validateSnapshotSource,
} from "../src/snapshot-model.ts";

const rootId = "Tasks/Root.md";

function createTaskCentricSnapshot() {
  return {
    snapshot_schema_version: 3,
    snapshot_model: "task-centric",
    generated_at: "2026-08-05T12:00:00Z",
    source_task_id: rootId,
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
      id: rootId,
      title: "SDD v3 root",
      status: "in-progress",
      priority: "high",
      is_blocked: false,
      blocked_by: [],
      parent_id: null,
      has_children: true,
      rollup_state: "blocked",
      trusted_done: false,
    },
    parent: null,
    contract: {
      version: "v3",
      goal: "完成跨仓库交付",
      scope: { included: ["Plugin 与 Dashboard"], excluded: ["自动发布"] },
      requirements: [
        { id: "REQ-001", text: "双端同源" },
        { id: "REQ-002", text: "当前任务聚焦" },
      ],
      scenarios: [
        { id: "SCN-001", requirement_ids: ["REQ-001"], text: "两端状态一致" },
      ],
      acceptance: [{ text: "跨仓库 smoke 通过", checked: false }],
      semantic_status: "valid",
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
        has_children: false,
        rollup_state: "done",
        semantic_status: "valid",
        evidence_health: {
          execution: "valid",
          verification: "valid",
          delivery: "valid",
        },
        trusted_done: true,
        primary_diagnostic: null,
      },
      {
        id: "Tasks/Child B.md",
        title: "Child B",
        status: "in-progress",
        priority: "high",
        is_blocked: true,
        blocked_by: [{ uid: "Tasks/Child A.md", reltype: "blocks" }],
        goal: "完成 Dashboard",
        has_children: true,
        rollup_state: "blocked",
        semantic_status: "valid",
        evidence_health: {
          execution: "missing",
          verification: "invalid",
          delivery: "missing",
        },
        trusted_done: false,
        primary_diagnostic: {
          code: "child_verification_invalid",
          severity: "error",
          task_id: "Tasks/Child B.md",
          path: "evidence.verification",
          source: { section: "Verification Result", line_start: 41 },
          reason: { actual: "缺少成功验证命令", expected: "至少一条通过的验证" },
          remediation: { summary: "运行验证并写回结果" },
        },
      },
    ],
    rollup: {
      state: "blocked",
      trusted_done: false,
      has_children: true,
      children_total: 2,
      children_trusted_done: 1,
      children_complete: false,
      blocked_children: [
        { id: "Tasks/Child B.md", title: "Child B", status: "in-progress" },
      ],
      incomplete_children: [
        { id: "Tasks/Child B.md", title: "Child B", status: "in-progress" },
      ],
      contradictions: [],
    },
    evidence: { execution: "missing", verification: "missing", delivery: "missing" },
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
        kind: "continue_current_task",
        task_ids: ["Tasks/Child B.md"],
      },
    ],
  };
}

test("schema 3 缺少 task-centric marker 时 fail-closed", () => {
  const snapshot = createTaskCentricSnapshot();
  delete (snapshot as { snapshot_model?: string }).snapshot_model;

  const model = createDashboardViewModel(snapshot);

  assert.equal(model.errorCode, "unsupported_snapshot_model");
  assert.equal(model.observation.isTrustworthy, false);
});

test("非 schema 3 优先返回 unsupported_snapshot_schema", () => {
  for (const snapshot of [{}, { snapshot_schema_version: 2, snapshot_model: "task-centric" }]) {
    const model = createDashboardViewModel(snapshot);
    assert.equal(model.errorCode, "unsupported_snapshot_schema");
    assert.equal(model.observation.isTrustworthy, false);
  }
});

test("task-centric 模型映射当前 task、parent、direct children 与 rollup", () => {
  const snapshot = createTaskCentricSnapshot();
  const model = createDashboardViewModel(snapshot, { expectedTaskPath: rootId });

  assert.equal(model.errorCode, null);
  assert.equal(model.schemaSupported, true);
  assert.equal(model.modelSupported, true);
  assert.equal(model.schemaLabel, "snapshot v3 · task-centric · legacy_v3");
  assert.equal(model.currentTask.id, rootId);
  assert.equal(model.currentTask.title, "SDD v3 root");
  assert.equal(model.currentTask.hasChildren, true);
  assert.equal(model.parent, null);
  assert.equal(model.rollup.childrenTotal, 2);
  assert.equal(model.rollup.childrenTrustedDone, 1);
  assert.equal(model.children[1].isBlocked, true);
  assert.deepEqual(model.children[1].blockedBy, ["Tasks/Child A.md"]);
  assert.equal(model.children[1].hasChildren, true);
  assert.equal(model.children[1].rollupState, "blocked");
  assert.equal(model.children[1].evidenceHealth.verification, "invalid");
  assert.equal(model.children[1].primaryDiagnostic?.taskId, "Tasks/Child B.md");
  assert.equal(model.primaryDiagnostic?.reason, "缺少成功验证命令");
  assert.equal(model.observation.isTrustworthy, true);
});

test("parent 上下文可选且 leaf 合同数据完整保序", () => {
  const snapshot = createTaskCentricSnapshot();
  snapshot.current_task.has_children = false;
  snapshot.children = [];
  snapshot.parent = {
    id: "Tasks/Parent.md",
    title: "Parent",
    status: "in-progress",
  };
  snapshot.observation.parent = "observed";
  snapshot.rollup = {
    state: "running",
    trusted_done: false,
    has_children: false,
    children_total: 0,
    children_trusted_done: 0,
    children_complete: true,
    blocked_children: [],
    incomplete_children: [],
    contradictions: [],
  };

  const model = createDashboardViewModel(snapshot, { expectedTaskPath: rootId });

  assert.equal(model.currentTask.hasChildren, false);
  assert.deepEqual(model.parent, {
    id: "Tasks/Parent.md",
    title: "Parent",
    status: "in-progress",
  });
  assert.deepEqual(model.contract.scope.included, ["Plugin 与 Dashboard"]);
  assert.deepEqual(
    model.contract.requirements.map((item) => item.id),
    ["REQ-001", "REQ-002"]
  );
  assert.deepEqual(model.contract.scenarios[0].requirement_ids, ["REQ-001"]);
  assert.deepEqual(model.contract.acceptance, [
    { text: "跨仓库 smoke 通过", checked: false },
  ]);
  assert.equal(
    model.contract.requirements.some((item) => "covers" in item),
    false
  );
});

test("observation 任一必需字段不可信或 stale 时 fail-closed", () => {
  const cases = [
    ["health", "degraded"],
    ["current_task", "failed"],
    ["children", "failed"],
    ["tasknotes_api", "error"],
    ["source_identity_match", false],
    ["stale", true],
  ] as const;
  for (const [key, value] of cases) {
    const snapshot = createTaskCentricSnapshot();
    Object.assign(snapshot.observation, { [key]: value });
    assert.equal(
      createDashboardViewModel(snapshot, { expectedTaskPath: rootId }).observation
        .isTrustworthy,
      false,
      `${key}=${String(value)} 必须 fail-closed`
    );
  }

  const staleModel = createDashboardViewModel(createTaskCentricSnapshot(), {
    expectedTaskPath: rootId,
    staleReason: "刷新失败",
    loadedAt: "12:30:00",
  });
  assert.equal(staleModel.observation.isStale, true);
  assert.equal(staleModel.observation.isTrustworthy, false);
});

test("诊断定位使用 producer task_id 和 source", () => {
  const diagnostic = createDashboardViewModel(
    createTaskCentricSnapshot()
  ).primaryDiagnostic;
  assert.ok(diagnostic);
  assert.deepEqual(resolveDiagnosticTarget(diagnostic.taskId, diagnostic.source), {
    linkText: "Tasks/Child B.md#Verification Result",
    line: 41,
    editorLine: 40,
  });
});

test("诊断导航可退化到 task 文件，并支持 section 与精确行", () => {
  assert.deepEqual(resolveDiagnosticNavigation("Tasks/A.md"), {
    canOpen: true,
    target: { linkText: "Tasks/A.md", line: null, editorLine: null },
  });
  assert.deepEqual(
    resolveDiagnosticNavigation("Tasks/A.md", { section: "Goal" }),
    {
      canOpen: true,
      target: {
        linkText: "Tasks/A.md#Goal",
        line: null,
        editorLine: null,
      },
    }
  );
  assert.deepEqual(
    resolveDiagnosticNavigation("Tasks/A.md", {
      section: "Goal",
      line_start: 7,
    }),
    {
      canOpen: true,
      target: {
        linkText: "Tasks/A.md#Goal",
        line: 7,
        editorLine: 6,
      },
    }
  );
  assert.equal(resolveDiagnosticNavigation("").canOpen, false);
});

test("task-centric UI helper 格式化 rollup、child evidence 与下一动作", () => {
  assert.equal(formatRollupState("blocked"), "存在阻塞子任务");
  assert.equal(
    formatRollupState("awaiting_current_verification"),
    "等待当前任务验证"
  );
  assert.equal(
    formatChildEvidenceHealth({
      execution: "missing",
      verification: "invalid",
      delivery: "valid",
    }),
    "执行缺失 · 验证无效 · 交付有效"
  );
  assert.equal(
    formatNextAction({
      kind: "continue_current_task",
      task_ids: ["Tasks/Child B.md"],
    }),
    "继续当前任务：Tasks/Child B.md"
  );
});

test("当前任务进度文案区分 direct children 与 leaf 自身 gate", () => {
  assert.equal(
    formatCurrentTaskProgress({
      hasChildren: true,
      childrenTrustedDone: 1,
      childrenTotal: 2,
      acceptance: [],
      evidence: { execution: "missing", verification: "missing", delivery: "missing" },
    }),
    "1/2 个直接子任务可信完成"
  );
  assert.equal(
    formatCurrentTaskProgress({
      hasChildren: false,
      childrenTrustedDone: 0,
      childrenTotal: 0,
      acceptance: [
        { text: "A", checked: true },
        { text: "B", checked: false },
      ],
      evidence: { execution: "valid", verification: "missing", delivery: "valid" },
    }),
    "自身验收 1/2 · 证据 2/3"
  );
});

test("真实 producer fixture 完整等值并映射 task-centric 字段", () => {
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
  assert.equal(snapshot.snapshot_model, "task-centric");
  assert.equal(model.currentTask.id, snapshot.current_task.id);
  assert.equal(model.currentTask.title, snapshot.current_task.title);
  assert.equal(model.parent, snapshot.parent);
  assert.deepEqual(
    model.children.map((child) => child.id),
    snapshot.children.map((child: { id: string }) => child.id)
  );
  assert.equal(model.rollup.childrenTotal, snapshot.rollup.children_total);
  assert.equal(
    model.rollup.childrenTrustedDone,
    snapshot.rollup.children_trusted_done
  );
  assert.deepEqual(model.contract.requirements, snapshot.contract.requirements);
  assert.deepEqual(model.contract.scenarios, snapshot.contract.scenarios);
  assert.deepEqual(model.evidence, snapshot.evidence);
  assert.equal(model.observation.isTrustworthy, true);
  assert.equal(model.primaryDiagnostic, null);
  assert.equal(model.nextAction, snapshot.next_actions[0].summary);
});

test("source identity 只接受 task-centric 顶层 source_task_id", () => {
  const snapshot = createTaskCentricSnapshot();
  assert.equal(validateSnapshotSource(snapshot, rootId), true);
  assert.equal(validateSnapshotSource(snapshot, "Tasks/Other.md"), false);
  assert.equal(validateSnapshotSource({}, rootId), "unknown");

  delete (snapshot as { source_task_id?: string }).source_task_id;
  const model = createDashboardViewModel(snapshot, { expectedTaskPath: rootId });
  assert.equal(model.observation.sourceIdentity, "unknown");
  assert.equal(model.observation.isTrustworthy, false);
});

test("真实 producer fixture 映射 tasknotes_only completion 与父子 rollup", () => {
  const fixturePath = path.join(
    process.cwd(),
    "tests/fixtures/sdd_v4_real_root_snapshot.json"
  );
  const snapshot = JSON.parse(readFileSync(fixturePath, "utf8"));
  const model = createDashboardViewModel(snapshot, {
    expectedTaskPath: snapshot.source.task_id,
  });

  assert.equal(model.errorCode, null);
  assert.equal(model.schemaLabel, "snapshot v4 · task-centric");
  assert.equal(model.currentTask.id, snapshot.current_task.id);
  assert.equal(model.currentTask.completion.trustedDone, true);
  assert.equal(model.currentTask.trustLevel, "tasknotes_only");
  assert.equal(model.currentTask.completion.contractStatus, "not_applicable");
  assert.equal(model.protocol.supported, true);
  assert.equal(model.observation.isTrustworthy, true);
  // 判定层拆除后 evidence 与 acceptance 不再由 producer 产出。
  assert.deepEqual(model.evidenceRequirements, []);
  assert.deepEqual(model.acceptance, []);
  // 父子进度是本版本 dashboard 的主信息，必须完整映射。
  assert.equal(model.currentTask.hasChildren, true);
  assert.equal(model.rollup.childrenTotal, 4);
  assert.equal(model.rollup.childrenTrustedDone, 4);
  assert.equal(model.children.length, 4);
  assert.equal(model.diagnostics.length, 0);
});

test("producer 未输出 records 时降级为全 0 而不是报错", () => {
  // 早于 records 特性的真实 producer 输出缺该字段，必须安全降级。
  //
  // 注意：含 records 的正向计数（ER/VR/DR 各若干段 → 对应数字）在此没有数据层
  // 覆盖。含 records 的真实 producer 输出会把 flowdesk-plugin 的内部执行记录
  // 全文与本机绝对路径带进这个公开仓库，因此不入库；手写 fixture 又违反本卡
  // 「不手写 fixture」的硬要求。正向路径目前只由
  // tests/dashboard-ui-contract.test.ts 的源码断言覆盖（只消费 .length、
  // 不渲染 text）。改动 records 映射时请另跑真实 producer 输出人工回放。
  const fixturePath = path.join(
    process.cwd(),
    "tests/fixtures/sdd_v4_real_root_snapshot.json"
  );
  const snapshot = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.equal(snapshot.current_task.records, undefined);

  const model = createDashboardViewModel(snapshot, {
    expectedTaskPath: snapshot.source.task_id,
  });

  assert.equal(model.errorCode, null);
  assert.deepEqual(model.records, {
    execution: 0,
    verification: 0,
    delivery: 0,
  });
  // 键恒为三类，缺字段不改变形状。
  assert.deepEqual(Object.keys(model.records).sort(), [
    "delivery",
    "execution",
    "verification",
  ]);
});

test("child 未可信完成与阻塞关系在 tasknotes_only 下不被伪装为完成", () => {
  const fixturePath = path.join(
    process.cwd(),
    "tests/fixtures/sdd_v4_real_root_snapshot.json"
  );
  const snapshot = JSON.parse(readFileSync(fixturePath, "utf8"));
  snapshot.current_task.completion.trusted_done = false;
  snapshot.rollup.trusted_done = false;
  snapshot.rollup.children_trusted_done = 3;
  snapshot.rollup.children_complete = false;
  snapshot.children[3].status = "open";
  snapshot.children[3].completion.lifecycle_status = "open";
  snapshot.children[3].completion.trusted_done = false;
  snapshot.children[3].is_blocked = true;

  const model = createDashboardViewModel(snapshot, {
    expectedTaskPath: snapshot.source.task_id,
  });

  assert.equal(model.currentTask.completion.trustedDone, false);
  assert.equal(model.currentTask.trustLevel, "tasknotes_only");
  assert.equal(model.rollup.childrenTrustedDone, 3);
  assert.equal(model.children[3].trustedDone, false);
  assert.equal(model.children[3].isBlocked, true);
  assert.deepEqual(model.children[3].blockedBy, ["Tasks/删除 evidence 层.md"]);
});

test("schema 3 只作为 explicit legacy_v3，schema 4 不回退到 v3 source", () => {
  const legacy = createDashboardViewModel(createTaskCentricSnapshot(), {
    expectedTaskPath: rootId,
  });
  assert.equal(legacy.currentTask.trustLevel, "legacy_v3");
  assert.equal(legacy.schemaLabel, "snapshot v3 · task-centric · legacy_v3");

  const fixturePath = path.join(
    process.cwd(),
    "tests/fixtures/sdd_v4_real_root_snapshot.json"
  );
  const snapshot = JSON.parse(readFileSync(fixturePath, "utf8"));
  snapshot.source_task_id = snapshot.source.task_id;
  delete snapshot.source.task_id;
  const model = createDashboardViewModel(snapshot, {
    expectedTaskPath: "Tasks/SDD v4 Example.md",
  });
  assert.equal(model.observation.sourceIdentity, "unknown");
  assert.equal(model.observation.isTrustworthy, false);
});

test("schema 4 explicit legacy_v3 保留历史 trusted done 与证据健康", () => {
  const snapshot = {
    snapshot_schema_version: 4,
    snapshot_model: "task-centric",
    source: {
      task_id: rootId,
      generated_at: "2026-08-07T12:00:00Z",
    },
    observation: {
      health: "healthy",
      current_task: "observed",
      parent: "not_applicable",
      children: "observed",
      tasknotes_api: "ok",
      source_identity_match: true,
      stale: false,
    },
    contract: {
      status: "legacy_v3",
      task_contract: {
        version: "v3",
        goal: "保留历史结论",
        scope: { included: ["历史任务"], excluded: ["自动迁移"] },
        requirements: [],
        scenarios: [],
        acceptance: [],
        semantic_status: "valid",
      },
    },
    current_task: {
      id: rootId,
      title: "Legacy root",
      status: "done",
      priority: "normal",
      is_blocked: false,
      blocked_by: [],
      has_children: false,
      completion: {
        lifecycle_status: "done",
        contract_status: "legacy_v3_valid",
        evidence_status: "satisfied",
        verification_status: "passed",
        review_status: "legacy_v3",
        acceptance_status: "satisfied",
        trust_level: "legacy_v3",
        trusted_done: true,
      },
      evidence_requirements: [],
      acceptance: [],
      review: { status: "legacy_v3" },
      legacy_v3: {
        semantic_status: "valid",
        evidence_health: {
          execution: "valid",
          verification: "valid",
          delivery: "valid",
        },
      },
    },
    parent: null,
    children: [],
    rollup: { state: "done", trusted_done: true },
    diagnostics: [],
    next_actions: [{ kind: "review_done_snapshot", summary: "复核历史 snapshot" }],
    protocol: {
      producer_protocol_version: 4,
      task_contract_schema: "legacy_v3",
      evidence_contract_schema: null,
      evidence_record_schema: null,
      review_record_schema: null,
      legacy_policy: "explicit_legacy_v3",
    },
  };

  const model = createDashboardViewModel(snapshot, { expectedTaskPath: rootId });
  assert.equal(model.errorCode, null);
  assert.equal(model.currentTask.trustLevel, "legacy_v3");
  assert.equal(model.currentTask.trustedDone, true);
  assert.deepEqual(model.evidence, {
    execution: "valid",
    verification: "valid",
    delivery: "valid",
  });
  assert.equal(model.contract.version, "v3");
  assert.equal(model.nextAction, "复核历史 snapshot");
});

test("判定层拆除后的 producer protocol 不带 legacy_policy 时仍受支持", () => {
  const snapshot = {
    snapshot_schema_version: 4,
    snapshot_model: "task-centric",
    source: { task_id: rootId, generated_at: "2026-08-08T15:00:00Z" },
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
      id: rootId,
      title: "Root",
      status: "done",
      has_children: true,
      rollup_state: "done",
      completion: {
        lifecycle_status: "done",
        contract_status: "not_applicable",
        evidence_status: "not_applicable",
        verification_status: "not_applicable",
        review_status: "not_applicable",
        acceptance_status: "not_applicable",
        trust_level: "tasknotes_only",
        trusted_done: true,
      },
      evidence_requirements: [],
      acceptance: [],
      review: { status: "not_applicable" },
    },
    parent: null,
    children: [],
    rollup: {
      state: "done",
      trusted_done: true,
      has_children: true,
      children_total: 4,
      children_trusted_done: 4,
    },
    diagnostics: [],
    next_actions: [],
    // 判定层拆除后 producer 只产这五个字段，不再产 legacy_policy。
    protocol: {
      producer_protocol_version: 4,
      task_contract_schema: "flowdesk.task-contract/4",
      evidence_contract_schema: "flowdesk.evidence-contract/1",
      evidence_record_schema: "flowdesk.evidence-record/1",
      review_record_schema: "flowdesk.review-record/1",
    },
  };

  const model = createDashboardViewModel(snapshot, { expectedTaskPath: rootId });
  assert.equal(model.errorCode, null);
  assert.equal(model.protocol.supported, true);
  assert.equal(model.currentTask.trustLevel, "tasknotes_only");
  assert.equal(model.currentTask.trustedDone, true);
});

test("v4 diagnostic 映射 reason 与 next_action，不丢失可行动信息", () => {
  const fixturePath = path.join(
    process.cwd(),
    "tests/fixtures/sdd_v4_real_root_snapshot.json"
  );
  const snapshot = JSON.parse(readFileSync(fixturePath, "utf8"));
  snapshot.current_task.completion.trusted_done = false;
  snapshot.diagnostics = [
    {
      code: "tasknotes_observation_failed",
      severity: "error",
      blocking: true,
      task_id: snapshot.source.task_id,
      path: "observation",
      reason: "TaskNotes API 未返回 direct children",
      next_action: "确认 TaskNotes 插件已启动后重新读取 snapshot",
    },
  ];

  const model = createDashboardViewModel(snapshot, {
    expectedTaskPath: snapshot.source.task_id,
  });
  assert.equal(
    model.primaryDiagnostic?.reason,
    "TaskNotes API 未返回 direct children"
  );
  assert.equal(
    model.primaryDiagnostic?.remediation,
    "确认 TaskNotes 插件已启动后重新读取 snapshot"
  );
});
