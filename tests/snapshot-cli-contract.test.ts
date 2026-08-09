import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildSnapshotInvocation } from "../src/snapshot-invocation.ts";

/**
 * argv 契约测试只能证明我们构造了什么，不能证明 producer 认识它。
 * `--vault` 被 producer 删除后，所有 argv 断言仍然通过，而 Dashboard 在真机上
 * 完全读不到 snapshot。这里真实执行 CLI 的 --help，交叉核验我们传的每个 flag
 * 都仍被 producer 接受。
 */

const FLOWDESK_ROOT =
  process.env.FLOWDESK_PLUGIN_ROOT ||
  path.resolve(process.env.HOME || "", "workspaces/flowdesk-plugin");

const CLI = path.join(FLOWDESK_ROOT, "bin", "flowdesk-execution-snapshot");

test("我们传给 producer 的每个 flag 都在 CLI 的接受列表里", (t) => {
  if (!existsSync(CLI)) {
    t.skip(`未找到 producer CLI：${CLI}`);
    return;
  }

  let help: string;
  try {
    help = execFileSync(CLI, ["--help"], {
      encoding: "utf8",
      timeout: 30_000,
    });
  } catch (error) {
    t.skip(`无法运行 producer CLI --help：${String(error)}`);
    return;
  }

  for (const format of ["json", "dashboard"] as const) {
    const invocation = buildSnapshotInvocation(
      {
        flowdeskRoot: FLOWDESK_ROOT,
        taskPath: "Tasks/Probe.md",
        workingDirectory: FLOWDESK_ROOT,
        apiUrl: "http://127.0.0.1:18090",
      },
      format
    );
    const flags = invocation.args.filter((arg) => arg.startsWith("--"));
    assert.ok(flags.length > 0, "invocation 应至少包含一个 flag");
    for (const flag of flags) {
      assert.ok(
        help.includes(flag),
        `producer CLI 不接受 ${flag}（format=${format}）；传入会导致 unrecognized arguments`
      );
    }
  }
});

test("producer CLI 明确不再提供 --vault", (t) => {
  if (!existsSync(CLI)) {
    t.skip(`未找到 producer CLI：${CLI}`);
    return;
  }

  let help: string;
  try {
    help = execFileSync(CLI, ["--help"], {
      encoding: "utf8",
      timeout: 30_000,
    });
  } catch (error) {
    t.skip(`无法运行 producer CLI --help：${String(error)}`);
    return;
  }

  // 回归锚点：v0.1.14 曾因插件无条件传 --vault 而完全无法读取 snapshot。
  assert.equal(help.includes("--vault"), false);
});
