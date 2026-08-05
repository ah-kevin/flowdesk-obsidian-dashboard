import assert from "node:assert/strict";
import test from "node:test";

import {
  isCurrentSnapshotRequest,
  resolveDashboardContext,
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
