import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEvidenceSummary,
  getEvidenceDisplayState,
} from "../src/evidence-presentation";
import * as evidencePresentation from "../src/evidence-presentation";

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

test("结构化 evidence 展示 method、expected、actual、provenance 与 review", () => {
  const createPresentation = (
    evidencePresentation as typeof evidencePresentation & {
      createStructuredEvidencePresentation?: (
        requirement: any,
        reviewStatus: string
      ) => any;
    }
  ).createStructuredEvidencePresentation;
  assert.equal(typeof createPresentation, "function");
  if (!createPresentation) return;

  const presentation = createPresentation(
    {
      uid: "EVR-002",
      componentUid: "component-review",
      semanticRevision: 2,
      method: "command",
      required: true,
      satisfies: ["AC-002"],
      expected: { exit_code: 7 },
      reviewRequired: true,
      status: "satisfied",
      runId: "run_v4_2",
      actual: { duration_ms: 10, exit_code: 7, timed_out: false },
      matchedExpected: true,
      provenance: "runner_cross_checked",
      stdoutDigest: "sha256:stdout",
      stderrDigest: "sha256:stderr",
      runtimeOrigin: "/fixture/runner.py",
      implementationDigest: "sha256:runner",
    },
    "approved"
  );

  assert.deepEqual(presentation, {
    uid: "EVR-002",
    state: "done",
    method: "command",
    expected: "exit_code=7",
    actual: "退出码 7 · 未超时 · 用时 10 ms",
    provenance: "runner_cross_checked",
    review: "已复核",
    status: "satisfied",
  });
});

test("artifact 与 experiment 只显示人类摘要而不展开原始 JSON", () => {
  const createPresentation = evidencePresentation.createStructuredEvidencePresentation;
  const artifact = createPresentation({
    uid: "EVR-A",
    method: "artifact",
    status: "satisfied",
    matchedExpected: true,
    expected: { outcome: "success" },
    actual: {
      exists: true,
      checks_passed: 2,
      checks_total: 2,
      sha256: "sha256:1234567890abcdef",
      checks: [{ kind: "json", matched: true, observed: { count: 51 } }],
    },
    provenance: "runner_cross_checked",
    reviewRequired: false,
  } as any, "not_required");
  const experiment = createPresentation({
    uid: "EVR-E",
    method: "experiment",
    status: "satisfied",
    matchedExpected: true,
    expected: { outcome: "success" },
    actual: { trial_count: 6, aggregate_value: "success", source: "adapter:registry" },
    provenance: "runner_cross_checked",
    reviewRequired: false,
  } as any, "not_required");

  assert.equal(artifact.actual, "文件存在 · 检查 2/2 通过 · 摘要 sha256:12345678…");
  assert.equal(experiment.actual, "实验 6 次 · 汇总 success · 来源 adapter:registry");
  assert.doesNotMatch(artifact.actual, /\[\{|\{\"/);
  assert.doesNotMatch(experiment.actual, /\[\{|\{\"/);
});

test("结构化 acceptance 由 evidence 关系派生，不读取 checkbox", () => {
  const createPresentation = (
    evidencePresentation as typeof evidencePresentation & {
      createDerivedAcceptancePresentation?: (acceptance: any) => any;
    }
  ).createDerivedAcceptancePresentation;
  assert.equal(typeof createPresentation, "function");
  if (!createPresentation) return;

  assert.deepEqual(
    createPresentation({
      uid: "AC-001",
      label: "全部结构化证据满足",
      required: true,
      status: "satisfied",
      evidenceRequirementUids: ["EVR-001"],
    }),
    {
      uid: "AC-001",
      label: "全部结构化证据满足",
      state: "done",
      status: "satisfied",
      evidence: "EVR-001",
    }
  );
});
