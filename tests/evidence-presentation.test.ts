import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEvidenceSummary,
  getEvidenceDisplayState,
} from "../src/evidence-presentation";

test("v3 证据健康只接受 missing、invalid、valid", () => {
  assert.equal(getEvidenceDisplayState("missing"), "blocked");
  assert.equal(getEvidenceDisplayState("invalid"), "error");
  assert.equal(getEvidenceDisplayState("valid"), "done");
});

test("v3 证据摘要明确区分缺失、无效和有效", () => {
  assert.equal(formatEvidenceSummary("验证结果", "missing"), "验证结果：缺失");
  assert.equal(formatEvidenceSummary("验证结果", "invalid"), "验证结果：无效");
  assert.equal(formatEvidenceSummary("验证结果", "valid"), "验证结果：有效");
});
