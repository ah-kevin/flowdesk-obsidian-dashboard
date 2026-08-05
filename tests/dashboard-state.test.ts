import assert from "node:assert/strict";
import test from "node:test";

import {
  collectObservedTaskPaths,
  isCurrentSnapshotRequest,
  resolveDetailsOpen,
  resolveDashboardContext,
  TrailingRefreshScheduler,
} from "../src/dashboard-state.ts";

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

test("刷新观察父任务和当前 snapshot 中的有效子任务路径", () => {
  assert.deepEqual(
    [...collectObservedTaskPaths("Tasks/Parent.md", {
      task_graph: {
        tasks: [
          { id: "Tasks/Child A.md" },
          { id: "TaskNotes/Child B.md" },
          { id: "Notes/Not a task.md" },
          { id: "Tasks/Child A.md" },
        ],
      },
    })],
    ["Tasks/Parent.md", "Tasks/Child A.md", "TaskNotes/Child B.md"]
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

test("同任务刷新保持详情展开选择，切换任务恢复诊断默认值", () => {
  assert.equal(resolveDetailsOpen(true, false, 0), true);
  assert.equal(resolveDetailsOpen(false, false, 3), false);
  assert.equal(resolveDetailsOpen(false, true, 2), true);
  assert.equal(resolveDetailsOpen(true, true, 0), false);
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
