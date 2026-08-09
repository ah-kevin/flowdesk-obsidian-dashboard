import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildSnapshotInvocation,
  formatShellCommand,
} from "../src/snapshot-invocation.ts";

test("JSON 与 dashboard invocation 只改变输出格式且不传 --vault", () => {
  const input = {
    flowdeskRoot: "/Users/me/FlowDesk Plugin",
    taskPath: "Tasks/含 ' 引号.md",
    workingDirectory: "/Users/me/项目 A",
    apiUrl: "",
  };

  assert.deepEqual(buildSnapshotInvocation(input, "json"), {
    executable: "/Users/me/FlowDesk Plugin/bin/flowdesk-execution-snapshot",
    args: [
      "Tasks/含 ' 引号.md",
      "--working-directory",
      "/Users/me/项目 A",
      "--format",
      "json",
    ],
    cwd: "/Users/me/FlowDesk Plugin",
  });

  const command = formatShellCommand(buildSnapshotInvocation(input, "dashboard"));
  assert.match(command, /--working-directory '\/Users\/me\/项目 A'/);
  assert.match(command, /--format dashboard$/);
});

test("判定层拆除后 CLI 不再接受 --vault，invocation 不得传该参数", () => {
  // producer 的 argparse 只认 --api-url / --working-directory / --fixture / --format；
  // 传 --vault 会 unrecognized arguments 退出，Dashboard 因此完全读不到 snapshot。
  for (const format of ["json", "dashboard"] as const) {
    const invocation = buildSnapshotInvocation(
      {
        flowdeskRoot: "/opt/flowdesk",
        taskPath: "Tasks/A.md",
        workingDirectory: "/work/project",
        apiUrl: "http://127.0.0.1:18090",
      },
      format
    );
    assert.equal(invocation.args.includes("--vault"), false);
    assert.doesNotMatch(formatShellCommand(invocation), /--vault/);
  }
});

test("显式 API URL 保留在 task path 后并安全转义", () => {
  const invocation = buildSnapshotInvocation({
    flowdeskRoot: "/opt/flowdesk",
    taskPath: "Tasks/A.md",
    workingDirectory: "/work/project",
    apiUrl: "http://127.0.0.1:18090/api value",
  }, "dashboard");

  assert.deepEqual(invocation.args.slice(0, 4), [
    "Tasks/A.md",
    "--api-url",
    "http://127.0.0.1:18090/api value",
    "--working-directory",
  ]);
});

test("相对仓库和工作目录会转换为绝对路径", () => {
  const invocation = buildSnapshotInvocation({
    flowdeskRoot: "flowdesk-plugin",
    taskPath: "Tasks/A.md",
    workingDirectory: "projects/demo",
    apiUrl: "",
  }, "dashboard");

  const expectedRoot = path.resolve("flowdesk-plugin");
  assert.equal(invocation.executable, path.join(expectedRoot, "bin", "flowdesk-execution-snapshot"));
  assert.equal(invocation.cwd, expectedRoot);
  assert.deepEqual(invocation.args.slice(1, 3), [
    "--working-directory",
    path.join(expectedRoot, "projects/demo"),
  ]);
});

test("当前 task CLI 以 child path 为首个参数且无 parent 假设", () => {
  const invocation = buildSnapshotInvocation({
    flowdeskRoot: "/opt/flowdesk",
    taskPath: "Tasks/Child.md",
    workingDirectory: "/work/project",
    apiUrl: "",
  }, "dashboard");

  assert.equal(invocation.args[0], "Tasks/Child.md");
  assert.equal(invocation.args.includes("--parent"), false);
  assert.equal(invocation.args.includes("--root"), false);
});
