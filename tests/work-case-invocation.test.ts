import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkCaseSnapshotInvocation,
  formatWorkCaseShellCommand,
} from "../src/work-case-invocation";

test("Case invocation 使用独立 producer 与 Vault working directory", () => {
  const invocation = buildWorkCaseSnapshotInvocation({
    flowdeskRoot: "/repo/flowdesk-plugin",
    casePath: "Notes/Sessions/Case A.md",
    workingDirectory: "/vault",
    apiUrl: "http://127.0.0.1:18090",
  });

  assert.deepEqual(invocation, {
    executable: "/repo/flowdesk-plugin/bin/flowdesk-work-case-snapshot",
    args: [
      "Notes/Sessions/Case A.md",
      "--api-url",
      "http://127.0.0.1:18090",
      "--working-directory",
      "/vault",
      "--format",
      "json",
    ],
    cwd: "/repo/flowdesk-plugin",
  });
  assert.equal(
    formatWorkCaseShellCommand(invocation),
    "/repo/flowdesk-plugin/bin/flowdesk-work-case-snapshot 'Notes/Sessions/Case A.md' --api-url http://127.0.0.1:18090 --working-directory /vault --format json"
  );
});
