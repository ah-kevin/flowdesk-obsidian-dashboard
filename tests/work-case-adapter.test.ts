import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { WorkCaseAdapter } from "../src/work-case-adapter";
import { FrozenTaskAdapter } from "../src/frozen-task-adapter";
import { ViewShellController } from "../src/view-shell";

const canonical = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "work-case-canonical.json"),
    "utf8"
  )
);

interface PendingCaseLoad {
  path: string;
  signal: AbortSignal;
  resolve(snapshot: unknown): void;
  reject(error: Error): void;
}

function createHarness() {
  const pending: PendingCaseLoad[] = [];
  let shell!: ViewShellController;
  const caseAdapter = new WorkCaseAdapter({
    shell: () => shell,
    loadSnapshot: (casePath, signal) =>
      new Promise((resolve, reject) => {
        pending.push({ path: casePath, signal, resolve, reject });
      }),
    render: () => {},
    requestRender: () => {},
    nowLabel: () => "12:00:00",
  });
  const taskAdapter = new FrozenTaskAdapter({
    shell: () => shell,
    loadSnapshot: async (taskPath) => ({
      snapshot_schema_version: 3,
      snapshot_model: "task-centric",
      source_task_id: taskPath,
    } as any),
    render: () => {},
    requestRender: () => {},
    nowLabel: () => "12:00:00",
  });
  shell = new ViewShellController([taskAdapter, caseAdapter]);
  return { caseAdapter, pending, shell };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

test("迟到 Case snapshot 不得污染最终 Task selection", async () => {
  const harness = createHarness();
  const caseLoad = harness.shell.select({
    kind: "case",
    resourcePath: canonical.source.path,
  });
  assert.equal(harness.pending.length, 1);

  await harness.shell.select({ kind: "task", resourcePath: "Tasks/A.md" });
  assert.equal(harness.pending[0].signal.aborted, true);
  harness.pending[0].resolve(canonical);
  await caseLoad;

  assert.deepEqual(harness.shell.context, {
    kind: "task",
    resourcePath: "Tasks/A.md",
  });
  assert.equal(harness.caseAdapter.getRenderState(), null);
});

test("identity mismatch 拒绝渲染，重新打开合法 Case 可恢复", async () => {
  const harness = createHarness();
  const pathA = "Notes/Sessions/A.md";
  const failed = harness.shell.select({ kind: "case", resourcePath: pathA });
  harness.pending[0].resolve(canonical);
  await failed;
  assert.match(harness.caseAdapter.getRenderState()?.error ?? "", /来源身份/);
  assert.equal(harness.caseAdapter.getRenderState()?.model, null);

  await harness.shell.select({ kind: "task", resourcePath: "Tasks/A.md" });
  const recovered = harness.shell.select({
    kind: "case",
    resourcePath: canonical.source.path,
  });
  await settle();
  harness.pending[1].resolve(canonical);
  await recovered;
  assert.equal(harness.caseAdapter.getRenderState()?.model?.workCase.title, "Demo Case");
});

test("同一 Case 刷新失败保留可读主体并明确 stale，切换后清空", async () => {
  const harness = createHarness();
  const context = { kind: "case", resourcePath: canonical.source.path };
  const first = harness.shell.select(context);
  harness.pending[0].resolve(canonical);
  await first;

  const refresh = harness.caseAdapter.refresh();
  await settle();
  harness.pending[1].reject(new Error("producer crashed"));
  await refresh;
  assert.equal(harness.caseAdapter.getRenderState()?.model?.workCase.title, "Demo Case");
  assert.match(harness.caseAdapter.getRenderState()?.staleReason ?? "", /producer crashed/);

  await harness.shell.select({ kind: "task", resourcePath: "Tasks/C.md" });
  assert.equal(harness.caseAdapter.getRenderState(), null);
});

test("同一 Case 刷新发生 identity mismatch 时清空旧主体并 fail closed", async () => {
  const harness = createHarness();
  const context = { kind: "case", resourcePath: canonical.source.path };
  const first = harness.shell.select(context);
  harness.pending[0].resolve(canonical);
  await first;
  assert.equal(harness.caseAdapter.getRenderState()?.model?.workCase.title, "Demo Case");

  const refresh = harness.caseAdapter.refresh();
  await settle();
  harness.pending[1].resolve({
    ...canonical,
    source: { ...canonical.source, identity_match: false },
  });
  await refresh;

  assert.equal(harness.caseAdapter.getRenderState()?.model, null);
  assert.match(harness.caseAdapter.getRenderState()?.error ?? "", /来源身份不匹配/);
});
