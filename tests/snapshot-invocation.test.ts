import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildSnapshotInvocation,
  formatShellCommand,
} from "../src/snapshot-invocation.ts";

test("JSON 与 dashboard invocation 共享参数且只改变输出格式", () => {
  const input = {
    flowdeskRoot: "/Users/me/FlowDesk Plugin",
    taskPath: "Tasks/含 ' 引号.md",
    workingDirectory: "/Users/me/项目 A",
    apiUrl: "",
  };

  assert.deepEqual(buildSnapshotInvocation(input, "json"), {
    executable:
      "/Users/me/FlowDesk Plugin/bin/flowdesk-execution-snapshot",
    args: [
      "Tasks/含 ' 引号.md",
      "--working-directory",
      "/Users/me/项目 A",
      "--format",
      "json",
    ],
    cwd: "/Users/me/FlowDesk Plugin",
  });

  assert.equal(
    formatShellCommand(buildSnapshotInvocation(input, "dashboard")),
    "'/Users/me/FlowDesk Plugin/bin/flowdesk-execution-snapshot' " +
      "'Tasks/含 '\"'\"' 引号.md' --working-directory '/Users/me/项目 A' " +
      "--format dashboard"
  );
});

test("显式 API URL 保留在 task path 后并安全转义", () => {
  const invocation = buildSnapshotInvocation(
    {
      flowdeskRoot: "/opt/flowdesk",
      taskPath: "Tasks/A.md",
      workingDirectory: "/work/project",
      apiUrl: "http://127.0.0.1:18090/api value",
    },
    "dashboard"
  );

  assert.deepEqual(invocation.args.slice(0, 4), [
    "Tasks/A.md",
    "--api-url",
    "http://127.0.0.1:18090/api value",
    "--working-directory",
  ]);
  assert.match(
    formatShellCommand(invocation),
    /--api-url 'http:\/\/127\.0\.0\.1:18090\/api value'/
  );
});

test("相对仓库和工作目录会转换为不依赖当前终端目录的绝对路径", () => {
  const invocation = buildSnapshotInvocation(
    {
      flowdeskRoot: "flowdesk-plugin",
      taskPath: "Tasks/A.md",
      workingDirectory: "projects/demo",
      apiUrl: "",
    },
    "dashboard"
  );

  const expectedRoot = path.resolve("flowdesk-plugin");
  assert.equal(
    invocation.executable,
    path.join(expectedRoot, "bin", "flowdesk-execution-snapshot")
  );
  assert.equal(invocation.cwd, expectedRoot);
  assert.deepEqual(invocation.args.slice(1, 3), [
    "--working-directory",
    path.join(expectedRoot, "projects/demo"),
  ]);
});
