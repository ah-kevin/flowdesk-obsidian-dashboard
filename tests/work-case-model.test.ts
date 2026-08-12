import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createWorkCaseViewModel,
  WorkCaseSnapshotCompatibilityError,
} from "../src/work-case-model";

const canonical = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "work-case-canonical.json"),
    "utf8"
  )
);

test("canonical schema 1 snapshot 保留 Case、Current、section 与来源事实", () => {
  const model = createWorkCaseViewModel(canonical, canonical.source.path);

  assert.equal(model.source.path, "Notes/Sessions/2026-08-10-demo.md");
  assert.equal(model.workCase.title, "Demo Case");
  assert.equal(model.current.progressSummary, "producer 已开始");
  assert.equal(model.current.blockers, null);
  assert.deepEqual(
    model.sections.outcome.map((item) => item.text),
    ["第一个 Outcome。", "第二个 Outcome。"]
  );
  assert.equal(model.tasks.observationHealth, "healthy");
  assert.equal(model.related.plans[0], "[[Notes/Plans/Demo]]");
  assert.deepEqual(model.tasks.items, []);
});

test("relation_roles 可选并固定归一化为父、子顺序", () => {
  const snapshot = structuredClone(canonical);
  snapshot.tasks.counts = {
    total: 4,
    active: 4,
    blocked: 0,
    completed: 0,
    archived: 0,
    by_status: { open: 4 },
  };
  snapshot.tasks.items = [
    { id: "Tasks/Parent.md", title: "Parent", status: "open", status_is_completed: false, archived: false, is_blocked: false, association_source: "canonical", relation_roles: ["parent"] },
    { id: "Tasks/Child.md", title: "Child", status: "open", status_is_completed: false, archived: false, is_blocked: false, association_source: "canonical", relation_roles: ["child"] },
    { id: "Tasks/Both.md", title: "Both", status: "open", status_is_completed: false, archived: false, is_blocked: false, association_source: "canonical", relation_roles: ["child", "parent", "child"] },
    { id: "Tasks/Legacy.md", title: "Legacy", status: "open", status_is_completed: false, archived: false, is_blocked: false, association_source: "canonical" },
  ];

  const model = createWorkCaseViewModel(snapshot, snapshot.source.path);
  assert.deepEqual(
    model.tasks.items.map((item) => item.relationRoles),
    [["parent"], ["child"], ["parent", "child"], []]
  );
});

test("source identity mismatch 与不兼容 envelope 均 fail closed", () => {
  assert.throws(
    () => createWorkCaseViewModel(canonical, "Notes/Sessions/Other.md"),
    (error: unknown) =>
      error instanceof WorkCaseSnapshotCompatibilityError &&
      error.code === "source_identity_mismatch"
  );
  assert.throws(
    () =>
      createWorkCaseViewModel(
        { ...canonical, snapshot_schema_version: 2 },
        canonical.source.path
      ),
    (error: unknown) =>
      error instanceof WorkCaseSnapshotCompatibilityError &&
      error.code === "unsupported_snapshot_schema"
  );
  assert.throws(
    () =>
      createWorkCaseViewModel(
        { ...canonical, snapshot_model: "task-centric" },
        canonical.source.path
      ),
    (error: unknown) =>
      error instanceof WorkCaseSnapshotCompatibilityError &&
      error.code === "unsupported_snapshot_model"
  );
});

test("TaskNotes unavailable 仍保留 Case 主体并将未知汇总保持为 null", () => {
  const snapshot = structuredClone(canonical);
  snapshot.tasks.observation_health = "unavailable";
  snapshot.tasks.coverage.complete = false;
  snapshot.tasks.counts = {
    total: null,
    active: null,
    blocked: null,
    completed: null,
    archived: null,
    by_status: {},
  };
  snapshot.tasks.items = [];
  snapshot.diagnostics = [
    {
      code: "tasknotes_unavailable",
      severity: "warning",
      path: "tasks",
      message: "offline",
    },
  ];

  const model = createWorkCaseViewModel(snapshot, snapshot.source.path);
  assert.equal(model.workCase.title, "Demo Case");
  assert.equal(model.tasks.counts.total, null);
  assert.equal(model.diagnostics[0].code, "tasknotes_unavailable");
});
