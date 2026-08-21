import assert from "node:assert/strict";
import test from "node:test";

import { taskNavigationLeafType } from "../src/task-navigation";

test("当前任务复用现有 leaf，所有跨 Task 跳转显式创建新标签", () => {
  assert.equal(taskNavigationLeafType("current"), false);
  assert.equal(taskNavigationLeafType("parent"), "tab");
  assert.equal(taskNavigationLeafType("child"), "tab");
  assert.equal(taskNavigationLeafType("work-case"), "tab");
  assert.deepEqual(
    (["current", "parent", "child", "work-case"] as const).map((origin) => [
      origin,
      taskNavigationLeafType(origin),
    ]),
    [
      ["current", false],
      ["parent", "tab"],
      ["child", "tab"],
      ["work-case", "tab"],
    ]
  );
});
