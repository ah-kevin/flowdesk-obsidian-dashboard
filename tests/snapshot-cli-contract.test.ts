import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildSnapshotInvocation } from "../src/snapshot-invocation.ts";
import { validateSnapshotEnvelope } from "../src/dashboard-state.ts";
import { createDashboardViewModel } from "../src/snapshot-model.ts";

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

/** 用于取真实 snapshot 的探针任务；可用 FLOWDESK_PROBE_TASK 覆盖。 */
const PROBE_TASK = "Tasks/阶段 1：拆除 SDD 判定层.md";

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

/**
 * 回归锚点：不手写 protocol 对象。手写 fixture 是连续两次事故的共同成因
 * （82 测试全绿掩盖白屏；96 测试全绿掩盖 protocol 不受支持）。
 * 这里直接拿 producer 真实输出，走完 envelope 校验与 view model 两道关。
 */
test("producer 真实 snapshot 能通过 envelope 校验并映射出父子进度", (t) => {
  if (!existsSync(CLI)) {
    t.skip(`未找到 producer CLI：${CLI}`);
    return;
  }
  const taskPath = process.env.FLOWDESK_PROBE_TASK || PROBE_TASK;

  let stdout: string;
  try {
    const invocation = buildSnapshotInvocation(
      {
        flowdeskRoot: FLOWDESK_ROOT,
        taskPath,
        workingDirectory: FLOWDESK_ROOT,
        apiUrl: "",
      },
      "json"
    );
    stdout = execFileSync(invocation.executable, invocation.args, {
      cwd: invocation.cwd,
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    t.skip(`无法取得真实 snapshot（TaskNotes 可能未运行）：${String(error)}`);
    return;
  }

  const snapshot = JSON.parse(stdout);
  // producer 当前确实不产 legacy_policy —— 这是判定必须容忍的现实。
  assert.equal("legacy_policy" in (snapshot.protocol ?? {}), false);

  // 第一道关：envelope 校验必须放行，否则 Dashboard 直接报 protocol 不受支持。
  assert.equal(validateSnapshotEnvelope(snapshot, taskPath), null);

  // 第二道关：view model 必须无 errorCode，并映射出父子进度。
  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskPath });
  assert.equal(model.errorCode, null);
  assert.equal(model.protocol.supported, true);
  assert.equal(model.observation.isTrustworthy, true);
  assert.equal(typeof model.rollup.childrenTotal, "number");
  assert.equal(model.children.length, model.rollup.childrenTotal);
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
