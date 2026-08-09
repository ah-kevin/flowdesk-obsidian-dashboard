import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskNotesReviewWrite,
  canReviewTask,
  mergeReviewTags,
  parseReviewCommandFailure,
  REVIEWED_TAG,
} from "../src/review-invocation.ts";

test("通过复核时向 TaskNotes 写入 reviewed 标签与复核记录", () => {
  const write = buildTaskNotesReviewWrite({
    taskPath: "Tasks/含 空格.md",
    decision: "approved",
    note: "人工确认",
    reviewedAt: "2026-08-08 23:45",
    existingTags: ["task", "dashboard"],
  });

  assert.deepEqual(write.tags, ["task", "dashboard", REVIEWED_TAG]);
  assert.equal(write.heading, "## Review Record");
  assert.match(write.detailsAppend, /复核结论：通过/);
  assert.match(write.detailsAppend, /复核时间：2026-08-08 23:45/);
  assert.match(write.detailsAppend, /复核来源：obsidian-dashboard/);
  assert.match(write.detailsAppend, /复核说明：人工确认/);
});

test("要求修改时移除 reviewed 标签并记录结论", () => {
  const write = buildTaskNotesReviewWrite({
    taskPath: "Tasks/A.md",
    decision: "changes_requested",
    note: "",
    reviewedAt: "2026-08-08 23:50",
    existingTags: ["task", REVIEWED_TAG],
  });

  assert.deepEqual(write.tags, ["task"]);
  assert.match(write.detailsAppend, /复核结论：要求修改/);
  assert.match(write.detailsAppend, /复核说明：未填写/);
});

test("reviewed 标签不重复累加", () => {
  assert.deepEqual(mergeReviewTags(["task", REVIEWED_TAG], "approved"), [
    "task",
    REVIEWED_TAG,
  ]);
  assert.deepEqual(mergeReviewTags([" task ", ""], "approved"), [
    "task",
    REVIEWED_TAG,
  ]);
});

test("复核写入拒绝空 task path 与空时间", () => {
  const base = {
    taskPath: "Tasks/A.md",
    decision: "approved" as const,
    note: "",
    reviewedAt: "2026-08-08 23:50",
    existingTags: [],
  };
  assert.throws(
    () => buildTaskNotesReviewWrite({ ...base, taskPath: "  " }),
    /task path/
  );
  assert.throws(
    () => buildTaskNotesReviewWrite({ ...base, reviewedAt: "" }),
    /时间/
  );
});

test("TaskNotes API 失败从 JSON 响应中结构化识别", () => {
  assert.deepEqual(
    parseReviewCommandFailure({
      stdout: JSON.stringify({
        code: "task_not_found",
        error: "task does not exist",
      }),
      stderr: "",
    }),
    { code: "task_not_found", message: "task does not exist" }
  );
});

test("复核按钮只对已完成、观测可信且来源匹配的任务开放", () => {
  const base = {
    lifecycleStatus: "done",
    observationTrustworthy: true,
    sourceIdentity: true as const,
    sourceIdentityMatch: true as const,
    isStale: false,
  };
  assert.equal(canReviewTask(base), true);
  // 未完成的任务没有复核对象。
  assert.equal(canReviewTask({ ...base, lifecycleStatus: "in-progress" }), false);
  assert.equal(canReviewTask({ ...base, observationTrustworthy: false }), false);
  assert.equal(canReviewTask({ ...base, sourceIdentity: false }), false);
  assert.equal(canReviewTask({ ...base, sourceIdentityMatch: "unknown" }), false);
  // stale snapshot 下看到的不是当前事实，不允许复核。
  assert.equal(canReviewTask({ ...base, isStale: true }), false);
});
