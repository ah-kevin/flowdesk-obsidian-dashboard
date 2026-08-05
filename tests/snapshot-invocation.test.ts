import assert from "node:assert/strict";
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
    schema: "sdd-poc",
    apiUrl: "",
  };

  assert.deepEqual(buildSnapshotInvocation(input, "json"), {
    executable:
      "/Users/me/FlowDesk Plugin/bin/flowdesk-execution-snapshot",
    args: [
      "Tasks/含 ' 引号.md",
      "--working-directory",
      "/Users/me/项目 A",
      "--schema",
      "sdd-poc",
      "--format",
      "json",
    ],
    cwd: "/Users/me/FlowDesk Plugin",
  });

  assert.equal(
    formatShellCommand(buildSnapshotInvocation(input, "dashboard")),
    "'/Users/me/FlowDesk Plugin/bin/flowdesk-execution-snapshot' " +
      "'Tasks/含 '\"'\"' 引号.md' --working-directory '/Users/me/项目 A' " +
      "--schema sdd-poc --format dashboard"
  );
});

test("显式 API URL 保留在 task path 后并安全转义", () => {
  const invocation = buildSnapshotInvocation(
    {
      flowdeskRoot: "/opt/flowdesk",
      taskPath: "Tasks/A.md",
      workingDirectory: "/work/project",
      schema: "sdd-poc",
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
