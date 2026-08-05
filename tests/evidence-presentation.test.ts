import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEvidenceSummary,
  getEvidenceDisplayItems,
  getEvidenceDisplayState,
} from "../src/evidence-presentation";

test("新 snapshot 优先使用 producer 提供的展示顺序", () => {
  const item = {
    exists: true,
    valid: true,
    items: ["TASK-5.1", "TASK-1.1"],
    display_items: ["TASK-1.1", "TASK-5.1"],
    display_order: "task-contract",
  };

  assert.deepEqual(getEvidenceDisplayItems(item), ["TASK-1.1", "TASK-5.1"]);
});

test("旧 snapshot 缺少展示字段时回退原始证据顺序", () => {
  const item = {
    exists: true,
    items: ["first", "second"],
  };

  assert.deepEqual(getEvidenceDisplayItems(item), ["first", "second"]);
});

test("证据展示状态区分缺失、无效、有效并兼容旧 snapshot", () => {
  assert.equal(getEvidenceDisplayState({ exists: false, valid: false }), "blocked");
  assert.equal(getEvidenceDisplayState({ exists: true, valid: false }), "error");
  assert.equal(getEvidenceDisplayState({ exists: true, valid: true }), "done");
  assert.equal(getEvidenceDisplayState({ exists: true }), "done");
});

test("证据摘要明确指出存在但无效", () => {
  assert.equal(
    formatEvidenceSummary("验证结果", {
      exists: true,
      valid: false,
      items: ["只有说明，没有命令"],
    }),
    "验证结果：存在但无效（1 项）"
  );
  assert.equal(
    formatEvidenceSummary("执行结果", { exists: false, valid: false, items: [] }),
    "执行结果：缺失"
  );
  assert.equal(
    formatEvidenceSummary("执行结果", { exists: true, valid: true, items: ["完成"] }),
    "执行结果：有效（1 项）"
  );
});
