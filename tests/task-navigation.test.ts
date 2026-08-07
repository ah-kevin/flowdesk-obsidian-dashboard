import assert from "node:assert/strict";
import test from "node:test";

import { taskNavigationNewLeaf } from "../src/task-navigation";

test("直接子任务使用新 leaf，当前任务与父任务复用当前 leaf", () => {
  assert.equal(taskNavigationNewLeaf("child"), true);
  assert.equal(taskNavigationNewLeaf("current"), false);
  assert.equal(taskNavigationNewLeaf("parent"), false);
  assert.deepEqual(
    (["current", "parent", "child"] as const).map((origin) => [
      origin,
      taskNavigationNewLeaf(origin),
    ]),
    [
      ["current", false],
      ["parent", false],
      ["child", true],
    ]
  );
});
