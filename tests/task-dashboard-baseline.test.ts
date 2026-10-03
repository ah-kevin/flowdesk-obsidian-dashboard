import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createDashboardPresentation } from "../src/dashboard-presentation";
import { createDashboardViewModel } from "../src/snapshot-model";

interface BaselineFixture {
  source_commit: string;
  loaded_at: string;
  stale_reason: string;
  fixtures: Record<
    string,
    { view_model_sha256: string; presentation_sha256: string }
  >;
  task_dom_classes_sha256: string;
  task_dom_class_count: number;
}

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures");
const baseline = JSON.parse(
  readFileSync(path.join(fixtureRoot, "task-dashboard-task2-baseline.json"), "utf8")
) as BaselineFixture;

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

test("schema 3/4 Task 4 nullable ending model and presentation keep the reviewed baseline", () => {
  for (const [fixtureName, expected] of Object.entries(baseline.fixtures)) {
    const snapshot = JSON.parse(
      readFileSync(path.join(fixtureRoot, fixtureName), "utf8")
    );
    const expectedTaskPath = snapshot.source?.task_id ?? snapshot.source_task_id;
    const model = createDashboardViewModel(snapshot, {
      expectedTaskPath,
      loadedAt: baseline.loaded_at,
      staleReason: baseline.stale_reason,
    });
    const presentation = createDashboardPresentation(model);

    assert.equal(digest(model), expected.view_model_sha256, fixtureName);
    assert.equal(digest(presentation), expected.presentation_sha256, fixtureName);
  }
});

test("Task 2 renderer 的关键 DOM class 集合保持新基线 exact-equal", () => {
  const source = ["main.ts", "task-content-renderer.ts"].map(file => readFileSync(path.join(process.cwd(), "src", file), "utf8")).join("\n");
  // Task 3 adds a separate read-only navigation panel; keep the Task 2 class baseline unchanged.
  const task3Additions = new Set(["flowdesk-related-target", "flowdesk-copy-related-path", "flowdesk-copy-related-reference", "flowdesk-task-current-progress", "flowdesk-task-resume-reference", "flowdesk-copy-task-reference", "flowdesk-repository-open-feedback", "flowdesk-open-repository-document"]);
  const classes = [...source.matchAll(/cls:\s*["`']([^"`']+)["`']/g)]
    .flatMap((match) => match[1].split(/\s+/))
    .filter(
      (value) =>
        /^flowdesk-[a-z0-9_-]+$/.test(value) &&
        !value.startsWith("flowdesk-case-") && !task3Additions.has(value)
    )
    .sort();
  const uniqueClasses = [...new Set(classes)];

  assert.equal(uniqueClasses.length, baseline.task_dom_class_count);
  assert.equal(digest(uniqueClasses), baseline.task_dom_classes_sha256);
  assert.doesNotMatch(source, /flowdesk-case-/);
});
