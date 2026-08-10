import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  resolveViewShellContext,
  ViewShellController,
  type ActiveViewContext,
  type ViewAdapter,
  type ViewAdapterSelection,
} from "../src/view-shell";

test("Shell 将当前文件分类为 Task、unsupported 或 empty", () => {
  assert.deepEqual(resolveViewShellContext("Tasks/A.md", ""), {
    kind: "task",
    resourcePath: "Tasks/A.md",
  });
  assert.deepEqual(
    resolveViewShellContext("Notes/Sessions/A.md", "Tasks/Previous.md"),
    {
      kind: "unsupported",
      activePath: "Notes/Sessions/A.md",
      previousResourcePath: "Tasks/Previous.md",
    }
  );
  assert.deepEqual(resolveViewShellContext(null, "Tasks/Previous.md"), {
    kind: "empty",
  });
});

test("Shell 只按明确 frontmatter type 路由 Work Case，且 Task path 优先", () => {
  assert.deepEqual(
    resolveViewShellContext("Notes/Sessions/A.md", "", "work-case"),
    { kind: "case", resourcePath: "Notes/Sessions/A.md" }
  );
  assert.deepEqual(
    resolveViewShellContext("Notes/Sessions/Legacy.md", "", "session"),
    { kind: "case", resourcePath: "Notes/Sessions/Legacy.md" }
  );
  assert.deepEqual(
    resolveViewShellContext("Notes/Sessions/Plain.md", "", "note"),
    {
      kind: "unsupported",
      activePath: "Notes/Sessions/Plain.md",
      previousResourcePath: "",
    }
  );
  assert.deepEqual(
    resolveViewShellContext("Tasks/Still-A-Task.md", "", "work-case"),
    { kind: "task", resourcePath: "Tasks/Still-A-Task.md" }
  );
});

class DeferredAdapter implements ViewAdapter {
  readonly activations: ViewAdapterSelection[] = [];
  deactivateCount = 0;
  committedResource = "";
  error = "";
  private pending: Array<{
    selection: ViewAdapterSelection;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(
    readonly kind: string,
    private shell: () => ViewShellController
  ) {}

  activate(selection: ViewAdapterSelection): Promise<void> {
    this.activations.push(selection);
    return new Promise((resolve, reject) => {
      this.pending.push({ selection, resolve, reject });
    });
  }

  deactivate(): void {
    this.deactivateCount += 1;
    this.error = "";
  }

  complete(index: number): void {
    const request = this.pending[index];
    if (this.shell().isCurrent(request.selection)) {
      this.committedResource = request.selection.resourcePath;
      this.error = "";
    }
    request.resolve();
  }

  fail(index: number, message: string): void {
    const request = this.pending[index];
    if (this.shell().isCurrent(request.selection)) {
      this.error = message;
    }
    request.reject(new Error(message));
  }
}

function active(kind: string, resourcePath: string): ActiveViewContext {
  return { kind, resourcePath };
}

test("Task → Case → Task 快速切换只接受最终 adapter selection", async () => {
  let shell!: ViewShellController;
  const task = new DeferredAdapter("task", () => shell);
  const caseAdapter = new DeferredAdapter("case", () => shell);
  shell = new ViewShellController([task, caseAdapter]);

  const firstTask = shell.select(active("task", "Tasks/A.md"));
  const caseLoad = shell.select(active("case", "Notes/Sessions/A.md"));
  const finalTask = shell.select(active("task", "Tasks/A.md"));

  task.complete(0);
  caseAdapter.complete(0);
  task.complete(1);
  await Promise.all([firstTask, caseLoad, finalTask]);

  assert.deepEqual(shell.context, active("task", "Tasks/A.md"));
  assert.equal(task.committedResource, "Tasks/A.md");
  assert.equal(caseAdapter.committedResource, "");
  assert.equal(task.deactivateCount, 1);
  assert.equal(caseAdapter.deactivateCount, 1);
});

test("Case 失败后切回 Task 不保留 Case error 或 request identity", async () => {
  let shell!: ViewShellController;
  const task = new DeferredAdapter("task", () => shell);
  const caseAdapter = new DeferredAdapter("case", () => shell);
  shell = new ViewShellController([task, caseAdapter]);

  const caseLoad = shell.select(active("case", "Notes/Sessions/B.md"));
  caseAdapter.fail(0, "Case producer failed");
  await assert.rejects(caseLoad, /Case producer failed/);
  assert.equal(caseAdapter.error, "Case producer failed");

  const taskLoad = shell.select(active("task", "Tasks/B.md"));
  task.complete(0);
  await taskLoad;

  assert.deepEqual(shell.context, active("task", "Tasks/B.md"));
  assert.equal(task.committedResource, "Tasks/B.md");
  assert.equal(task.error, "");
  assert.equal(caseAdapter.error, "");
});

test("Shell 源码不包含 Task completion/trust 或 Case Current/Summary 语义", () => {
  const shell = new ViewShellController([]);
  assert.deepEqual(shell.context, { kind: "empty" });
  const source = readFileSync(
    path.join(process.cwd(), "src", "view-shell.ts"),
    "utf8"
  );
  for (const forbidden of [
    "trusted_done",
    "current_task",
    "rollup",
    "progress_summary",
    "summary_last_updated",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});

test("Obsidian view 实际通过 Shell 激活 Frozen Task Adapter", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "main.ts"),
    "utf8"
  );
  assert.match(source, /new FrozenTaskAdapter\(\{/);
  assert.match(source, /new ViewShellController\(\[this\.taskAdapter, this\.caseAdapter\]\)/);
  assert.match(
    source,
    /resolveViewShellContext\([\s\S]*?this\.shell\.select\(nextContext\)/
  );
  assert.match(source, /this\.taskAdapter\.render\(container\)/);
});
