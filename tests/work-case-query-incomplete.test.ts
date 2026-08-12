import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { WorkCaseAdapter } from "../src/work-case-adapter";
import { createWorkCasePresentation } from "../src/work-case-presentation";
import { ViewShellController } from "../src/view-shell";

const incompleteSnapshot = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      "tests",
      "fixtures",
      "work-case-query-incomplete.json"
    ),
    "utf8"
  )
);

test("complete=false/task_query_incomplete 进入既有 degraded 路径且不产生可信完整汇总", async () => {
  let shell!: ViewShellController;
  const adapter = new WorkCaseAdapter({
    shell: () => shell,
    loadSnapshot: async () => incompleteSnapshot,
    render: () => {},
    requestRender: () => {},
    nowLabel: () => "12:00:00",
  });
  shell = new ViewShellController([adapter]);

  await shell.select({
    kind: "case",
    resourcePath: incompleteSnapshot.source.path,
  });

  const state = adapter.getRenderState();
  assert.ok(state?.model);
  assert.equal(state.error, "");
  assert.equal(state.model.tasks.observationHealth, "degraded");
  assert.deepEqual(state.model.tasks.coverage, { complete: false, pages: 1 });
  assert.equal(state.model.tasks.counts.total, null);
  assert.equal(state.model.tasks.items.length, 1);
  assert.ok(
    state.model.diagnostics.some(
      (diagnostic) => diagnostic.code === "task_query_incomplete"
    )
  );

  const presentation = createWorkCasePresentation(state.model);
  assert.equal(presentation.tasks.health, "degraded");
  assert.equal(presentation.tasks.completedLabel, "— / —");
  assert.equal(presentation.tasks.progressPercent, null);
  assert.ok(presentation.tasks.counts.every((count) => count.value === "—"));
});
