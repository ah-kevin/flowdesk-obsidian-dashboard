import assert from "node:assert/strict";
import test from "node:test";

import {
  collectObservedTaskPaths,
  isCurrentSnapshotRequest,
  registerInitialDashboardSync,
  resolveSnapshotEnvelopeFailure,
  resolveRefreshFailureDisplay,
  resolveDashboardContext,
  TrailingRefreshScheduler,
  validateSnapshotEnvelope,
} from "../src/dashboard-state.ts";

test("视图在 layout ready 后执行首次同步，关闭后不再执行", () => {
  let ready: (() => void) | null = null;
  let syncCount = 0;
  const cancel = registerInitialDashboardSync(
    (callback) => {
      ready = callback;
    },
    () => {
      syncCount += 1;
    }
  );

  assert.equal(syncCount, 0);
  assert.ok(ready);
  (ready as () => void)();
  assert.equal(syncCount, 1);
  cancel();
  (ready as () => void)();
  assert.equal(syncCount, 1);
});

test("活动文件解析为任务、非任务或空上下文", () => {
  assert.deepEqual(resolveDashboardContext("Tasks/A.md", ""), {
    kind: "task",
    taskPath: "Tasks/A.md",
  });
  assert.deepEqual(
    resolveDashboardContext("Notes/Session.md", "Tasks/Previous.md"),
    {
      kind: "non-task",
      activePath: "Notes/Session.md",
      previousTaskPath: "Tasks/Previous.md",
    }
  );
  assert.deepEqual(resolveDashboardContext(null, "Tasks/Previous.md"), {
    kind: "empty",
  });
});

test("观察当前 task、可选 parent 与 direct children", () => {
  assert.deepEqual(
    [
      ...collectObservedTaskPaths("Tasks/Child.md", {
        current_task: { id: "Tasks/Child.md" },
        parent: { id: "Tasks/Root.md" },
        children: [
          { id: "Tasks/Grandchild.md" },
          { id: "TaskNotes/Grandchild B.md" },
          { id: "Notes/Not a task.md" },
          { id: "Tasks/Grandchild.md" },
        ],
      }),
    ],
    [
      "Tasks/Child.md",
      "Tasks/Root.md",
      "Tasks/Grandchild.md",
      "TaskNotes/Grandchild B.md",
    ]
  );
});

test("task-centric snapshot 缺少 parent 时仍安全观察当前 task 和 children", () => {
  assert.deepEqual(
    [...collectObservedTaskPaths("Tasks/Parent.md", {
      current_task: { id: "Tasks/Parent.md" },
      parent: null,
      children: [{ id: "Tasks/Child.md" }],
    })],
    ["Tasks/Parent.md", "Tasks/Child.md"]
  );
});

test("连续调度只执行最后一次刷新，手动 flush 立即执行", () => {
  let refreshCount = 0;
  let pending: (() => void) | null = null;
  const scheduler = new TrailingRefreshScheduler(
    () => {
      refreshCount += 1;
    },
    500,
    (callback) => {
      pending = callback;
      return 1;
    },
    () => {
      pending = null;
    }
  );

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(refreshCount, 0);
  assert.ok(pending);
  (pending as () => void)();
  assert.equal(refreshCount, 1);

  scheduler.schedule();
  scheduler.flush();
  assert.equal(refreshCount, 2);
  assert.equal(pending, null);
});

test("请求必须同时匹配任务路径与 selection revision", () => {
  const context = { kind: "task" as const, taskPath: "Tasks/A.md" };

  assert.equal(
    isCurrentSnapshotRequest(
      { taskPath: "Tasks/A.md", selectionRevision: 3 },
      context,
      3
    ),
    true
  );
  assert.equal(
    isCurrentSnapshotRequest(
      { taskPath: "Tasks/A.md", selectionRevision: 1 },
      context,
      3
    ),
    false
  );
  assert.equal(
    isCurrentSnapshotRequest(
      { taskPath: "Tasks/B.md", selectionRevision: 3 },
      context,
      3
    ),
    false
  );
  assert.equal(
    isCurrentSnapshotRequest(
      { taskPath: "Tasks/A.md", selectionRevision: 3 },
      {
        kind: "non-task",
        activePath: "Notes/Session.md",
        previousTaskPath: "Tasks/A.md",
      },
      3
    ),
    false
  );
});

test("首次打开 task 会形成可加载上下文，切到非 task 后不再接受旧请求", () => {
  const firstTask = resolveDashboardContext("Tasks/A.md", "");
  assert.deepEqual(firstTask, { kind: "task", taskPath: "Tasks/A.md" });
  assert.equal(
    isCurrentSnapshotRequest(
      { taskPath: "Tasks/A.md", selectionRevision: 1 },
      firstTask,
      1
    ),
    true
  );

  const nonTask = resolveDashboardContext("Notes/Session.md", "Tasks/A.md");
  assert.equal(nonTask.kind, "non-task");
  assert.equal(
    isCurrentSnapshotRequest(
      { taskPath: "Tasks/A.md", selectionRevision: 1 },
      nonTask,
      2
    ),
    false
  );
});

test("旧 root-centric schema 3 缺少 model marker 时加载 fail-closed", () => {
  assert.equal(
    validateSnapshotEnvelope(
      { snapshot_schema_version: 3, task_tree: {} },
      "Tasks/A.md"
    ),
    "Snapshot model 不受支持：需要 task-centric；请求 Tasks/A.md，实际 model 未提供。"
  );
  assert.equal(
    validateSnapshotEnvelope(
      {
        snapshot_schema_version: 3,
        snapshot_model: "task-centric",
        source_task_id: "Tasks/A.md",
      },
      "Tasks/A.md"
    ),
    null
  );
});

test("stale 只复用同一 task，跨 task 刷新失败清空旧 snapshot", () => {
  const taskA = {
    taskPath: "Tasks/A.md",
    snapshot: { source_task_id: "Tasks/A.md" },
    loadedAt: "12:00:00",
    staleReason: "",
  };

  assert.equal(
    resolveRefreshFailureDisplay(taskA, "Tasks/B.md", "B 刷新失败"),
    null
  );
  assert.deepEqual(
    resolveRefreshFailureDisplay(taskA, "Tasks/A.md", "A 刷新失败"),
    { ...taskA, staleReason: "A 刷新失败" }
  );
});

test("同一 task 的 schema、model 或 source mismatch 必须清空旧 snapshot", () => {
  const taskA = {
    taskPath: "Tasks/A.md",
    snapshot: { source_task_id: "Tasks/A.md" },
    loadedAt: "12:00:00",
    staleReason: "",
  };
  const invalidSnapshots = [
    {
      snapshot_schema_version: 2,
      snapshot_model: "task-centric",
      source_task_id: "Tasks/A.md",
    },
    {
      snapshot_schema_version: 3,
      snapshot_model: "root-centric",
      source_task_id: "Tasks/A.md",
    },
    {
      snapshot_schema_version: 3,
      snapshot_model: "task-centric",
      source_task_id: "Tasks/B.md",
    },
  ];

  for (const snapshot of invalidSnapshots) {
    const outcome = resolveSnapshotEnvelopeFailure(
      taskA,
      "Tasks/A.md",
      snapshot
    );
    assert.ok(outcome.error);
    assert.equal(outcome.displayState, null);
  }
});
