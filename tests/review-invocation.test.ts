import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReviewInvocation,
  canReviewEvidence,
  parseReviewCommandFailure,
} from "../src/review-invocation.ts";

test("review invocation 使用 canonical flowdesk-evidence argv 且不经过 shell", () => {
  const invocation = buildReviewInvocation({
    flowdeskRoot: "/Users/me/FlowDesk Plugin",
    taskPath: "Tasks/含 空格.md",
    digest: "sha256:abc123",
    decision: "approved",
    requirementUids: ["EVR-001", "EVR-002"],
    note: "人工确认",
    vaultPath: "/Users/me/Vault",
    apiUrl: "http://127.0.0.1:18090",
  });

  assert.equal(
    invocation.executable,
    "/Users/me/FlowDesk Plugin/bin/flowdesk-evidence"
  );
  assert.deepEqual(invocation.args, [
    "review",
    "--task-id",
    "Tasks/含 空格.md",
    "--evidence-bundle-digest",
    "sha256:abc123",
    "--decision",
    "approved",
    "--requirement-uid",
    "EVR-001",
    "--requirement-uid",
    "EVR-002",
    "--note",
    "人工确认",
    "--reviewer-kind",
    "user",
    "--reviewer-surface",
    "obsidian-dashboard",
    "--vault",
    "/Users/me/Vault",
    "--api-url",
    "http://127.0.0.1:18090",
  ]);
  assert.equal(invocation.cwd, "/Users/me/FlowDesk Plugin");
});

test("review invocation 拒绝无效 digest 与空 requirement UIDs", () => {
  const base = {
    flowdeskRoot: "/opt/flowdesk",
    taskPath: "Tasks/A.md",
    digest: "sha256:valid",
    decision: "approved" as const,
    requirementUids: ["EVR-001"],
    note: "",
    vaultPath: "/vault",
    apiUrl: "",
  };
  assert.throws(
    () => buildReviewInvocation({ ...base, digest: "stale" }),
    /evidence bundle digest/
  );
  assert.throws(
    () => buildReviewInvocation({ ...base, requirementUids: [] }),
    /requirement UID/
  );
});

test("review_conflict 从 CLI JSON 错误中结构化识别", () => {
  assert.deepEqual(
    parseReviewCommandFailure({
      stdout: JSON.stringify({
        status: "rejected",
        code: "review_conflict",
        error: "evidence bundle changed",
      }),
      stderr: "",
    }),
    { code: "review_conflict", message: "evidence bundle changed" }
  );
});

test("复核按钮只对 review_required 且 identity/digest 有效的 v4 model 开放", () => {
  const base = {
    trustLevel: "review_required",
    observationTrustworthy: true,
    sourceIdentity: true as const,
    sourceIdentityMatch: true as const,
    evidenceBundleDigest: "sha256:abc123",
    requirementUids: ["EVR-001"],
  };
  assert.equal(canReviewEvidence(base), true);
  assert.equal(canReviewEvidence({ ...base, trustLevel: "attested_v4" }), false);
  assert.equal(canReviewEvidence({ ...base, observationTrustworthy: false }), false);
  assert.equal(canReviewEvidence({ ...base, sourceIdentity: false }), false);
  assert.equal(canReviewEvidence({ ...base, evidenceBundleDigest: null }), false);
  assert.equal(canReviewEvidence({ ...base, requirementUids: [] }), false);
});
