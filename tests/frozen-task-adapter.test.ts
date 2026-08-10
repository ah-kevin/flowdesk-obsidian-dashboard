import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { FrozenTaskAdapter } from "../src/frozen-task-adapter";
import {
  ViewShellController,
  type ViewAdapter,
  type ViewAdapterSelection,
} from "../src/view-shell";

interface PendingLoad {
  taskPath: string;
  signal: AbortSignal;
  resolve(snapshot: any): void;
  reject(error: Error): void;
}

const passiveCaseAdapter: ViewAdapter = {
  kind: "case",
  activate: async () => {},
  deactivate: () => {},
};

function taskSnapshot(taskPath: string, marker: string) {
  return {
    snapshot_schema_version: 3,
    snapshot_model: "task-centric",
    source_task_id: taskPath,
    marker,
  };
}

function createHarness() {
  const pending: PendingLoad[] = [];
  let renderCount = 0;
  let shell!: ViewShellController;
  const adapter = new FrozenTaskAdapter({
    shell: () => shell,
    loadSnapshot: (taskPath, signal) =>
      new Promise((resolve, reject) => {
        pending.push({ taskPath, signal, resolve, reject });
      }),
    render: () => {},
    requestRender: () => {
      renderCount += 1;
    },
    nowLabel: () => "12:34:56",
  });
  shell = new ViewShellController([adapter, passiveCaseAdapter]);
  return { adapter, pending, shell, get renderCount() { return renderCount; } };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

test("Task → Case → Task 丢弃迟到 Task snapshot，只提交最终 request", async () => {
  const harness = createHarness();
  const first = harness.shell.select({ kind: "task", resourcePath: "Tasks/A.md" });
  assert.equal(harness.pending.length, 1);

  await harness.shell.select({ kind: "case", resourcePath: "Notes/Sessions/A.md" });
  assert.equal(harness.pending[0].signal.aborted, true);
  const final = harness.shell.select({ kind: "task", resourcePath: "Tasks/A.md" });

  harness.pending[0].resolve(taskSnapshot("Tasks/A.md", "late"));
  await settle();
  assert.equal(harness.pending.length, 2);
  assert.equal(harness.adapter.getRenderState()?.snapshot, null);

  harness.pending[1].resolve(taskSnapshot("Tasks/A.md", "final"));
  await Promise.all([first, final]);

  const state = harness.adapter.getRenderState();
  assert.equal((state?.snapshot as any)?.marker, "final");
  assert.equal(state?.loading, false);
  assert.equal(state?.error, "");
  assert.equal(state?.staleReason, "");
});

test("Task 失败后切到 Case 会清空 error/cache，返回 Task 可正常恢复", async () => {
  const harness = createHarness();
  const failed = harness.shell.select({ kind: "task", resourcePath: "Tasks/B.md" });
  harness.pending[0].reject(new Error("Task API failed"));
  await failed;
  assert.equal(harness.adapter.getRenderState()?.error, "Task API failed");

  await harness.shell.select({ kind: "case", resourcePath: "Notes/Sessions/B.md" });
  assert.equal(harness.adapter.getRenderState(), null);

  const recovered = harness.shell.select({ kind: "task", resourcePath: "Tasks/B.md" });
  harness.pending[1].resolve(taskSnapshot("Tasks/B.md", "recovered"));
  await recovered;

  const state = harness.adapter.getRenderState();
  assert.equal((state?.snapshot as any)?.marker, "recovered");
  assert.equal(state?.error, "");
  assert.equal(state?.loading, false);
});

test("首次失败后再次同步同一 Task 会自动重试", async () => {
  const harness = createHarness();
  const context = { kind: "task", resourcePath: "Tasks/Retry.md" };

  const first = harness.shell.select(context);
  await harness.shell.select(context);
  assert.equal(harness.pending.length, 1, "首次加载仍在进行时不得重复请求");
  harness.pending[0].reject(new Error("first load failed"));
  await first;
  assert.equal(harness.adapter.getRenderState()?.loading, false);
  assert.equal(harness.adapter.getRenderState()?.snapshot, null);

  const retry = harness.shell.select(context);
  await settle();
  assert.equal(harness.pending.length, 2, "同一 Task 再次同步必须发起重试");

  harness.pending[1].resolve(taskSnapshot("Tasks/Retry.md", "retried"));
  await retry;
  assert.equal((harness.adapter.getRenderState()?.snapshot as any)?.marker, "retried");
  await harness.shell.select(context);
  assert.equal(harness.pending.length, 2, "已有 snapshot 时不得重复请求");
});

test("Frozen Task Adapter 不包含 Case 条件分支", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "frozen-task-adapter.ts"),
    "utf8"
  );
  assert.doesNotMatch(source, /\bcase\b/i);
  assert.doesNotMatch(source, /flowdesk-case-/);
});
