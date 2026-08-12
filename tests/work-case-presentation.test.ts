import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createWorkCaseViewModel } from "../src/work-case-model";
import {
  createWorkCasePresentation,
  formatWorkCaseTimestamp,
} from "../src/work-case-presentation";

const canonical = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "work-case-canonical.json"),
    "utf8"
  )
);

function presentation(snapshot = canonical) {
  return createWorkCasePresentation(
    createWorkCaseViewModel(snapshot, snapshot.source.path)
  );
}

test("Current 缺失只显示未记录，不从其他 section 推断", () => {
  const result = presentation(canonical);
  assert.deepEqual(
    result.current.map((item) => [item.label, item.value]),
    [
      ["做到哪了", "producer 已开始"],
      ["下一步", "完成 contract"],
      ["当前风险/阻塞", "未记录"],
      ["未提交/待处理", "尚未提交"],
    ]
  );
});

test("legacy 与 archived 身份均明确显示", () => {
  const snapshot = structuredClone(canonical);
  snapshot.source.type = "session";
  snapshot.source.archived = true;
  const result = presentation(snapshot);
  assert.deepEqual(result.header.badges, ["legacy", "已归档"]);
});

test("header 时间使用稳定中文绝对格式并保留原始 tooltip", () => {
  assert.deepEqual(formatWorkCaseTimestamp("2026-08-12T12:30:21+08:00"), {
    label: "2026年8月12日 12:30",
    tooltip: "2026-08-12T12:30:21+08:00",
  });
  assert.deepEqual(formatWorkCaseTimestamp("not-an-iso-time"), {
    label: "not-an-iso-time",
    tooltip: "not-an-iso-time",
  });
  assert.deepEqual(formatWorkCaseTimestamp("2026-02-30T12:30:21+08:00"), {
    label: "2026-02-30T12:30:21+08:00",
    tooltip: "2026-02-30T12:30:21+08:00",
  });

  const result = presentation(canonical);
  assert.equal(result.header.dateLabel, "2026年8月10日 12:00");
  assert.equal(result.header.dateTooltip, "2026-08-10T12:00:00+08:00");
});

test("任务分组保留原始 status，并只显示不修复 Case/Task drift", () => {
  const snapshot = structuredClone(canonical);
  snapshot.work_case.status = "done";
  snapshot.tasks.counts = {
    total: 4,
    active: 1,
    blocked: 1,
    completed: 2,
    archived: 1,
    by_status: { open: 1, blocked: 1, cancel: 1, done: 1 },
  };
  snapshot.tasks.items = [
    { id: "Tasks/A.md", title: "A", status: "open", status_is_completed: false, archived: false, is_blocked: false, association_source: "canonical", relation_roles: ["parent"] },
    { id: "Tasks/B.md", title: "B", status: "blocked", status_is_completed: false, archived: false, is_blocked: true, association_source: "canonical", relation_roles: ["child", "parent"] },
    { id: "Tasks/C.md", title: "C", status: "cancel", status_is_completed: true, archived: false, is_blocked: false, association_source: "canonical" },
    { id: "Tasks/D.md", title: "D", status: "done", status_is_completed: true, archived: true, is_blocked: false, association_source: "legacy" },
  ];

  const result = presentation(snapshot);
  assert.equal(result.tasks.completedLabel, "2 / 4");
  assert.deepEqual(result.tasks.counts, [
    { label: "active", value: "1" },
    { label: "blocked", value: "1" },
    { label: "archived", value: "1" },
  ]);
  assert.deepEqual(result.tasks.byStatus, [
    { status: "open", count: 1 },
    { status: "blocked", count: 1 },
    { status: "cancel", count: 1 },
    { status: "done", count: 1 },
  ]);
  assert.deepEqual(result.tasks.primary.map((item) => item.status), ["open", "blocked"]);
  assert.deepEqual(result.tasks.primary.map((item) => item.relationRoles), [
    ["parent"],
    ["parent", "child"],
  ]);
  assert.deepEqual(result.tasks.history.map((item) => item.status), ["cancel", "done"]);
  assert.match(result.tasks.driftWarning, /Case 状态为 done/);
});
