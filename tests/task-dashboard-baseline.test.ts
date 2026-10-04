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

// The approved UX redesign replaces the old exact DOM-class hash.
// Actual compiled view behavior and source fidelity are covered by dashboard-resume-integration.test.ts.
