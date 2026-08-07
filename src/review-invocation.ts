export type ReviewDecision = "approved" | "changes_requested";

export interface ReviewInvocationInput {
  flowdeskRoot: string;
  taskPath: string;
  digest: string;
  decision: ReviewDecision;
  requirementUids: string[];
  note: string;
  vaultPath: string;
  apiUrl: string;
}

export interface ReviewInvocation {
  executable: string;
  args: string[];
  cwd: string;
}

export function buildReviewInvocation(
  input: ReviewInvocationInput
): ReviewInvocation {
  const flowdeskRoot = path.resolve(input.flowdeskRoot);
  const taskPath = input.taskPath.trim();
  const digest = input.digest.trim();
  const requirementUids = [
    ...new Set(input.requirementUids.map((uid) => uid.trim()).filter(Boolean)),
  ];
  if (!taskPath) throw new Error("review task path 不能为空");
  if (!/^sha256:.+/.test(digest)) {
    throw new Error("review evidence bundle digest 必须是 sha256 值");
  }
  if (!requirementUids.length) {
    throw new Error("review 至少需要一个 requirement UID");
  }
  if (!input.vaultPath.trim()) {
    throw new Error("review vault path 不能为空");
  }
  const args = [
    "review",
    "--task-id",
    taskPath,
    "--evidence-bundle-digest",
    digest,
    "--decision",
    input.decision,
  ];
  for (const uid of requirementUids) {
    args.push("--requirement-uid", uid);
  }
  args.push(
    "--note",
    input.note,
    "--reviewer-kind",
    "user",
    "--reviewer-surface",
    "obsidian-dashboard",
    "--vault",
    path.resolve(input.vaultPath)
  );
  if (input.apiUrl.trim()) {
    args.push("--api-url", input.apiUrl.trim());
  }
  return {
    executable: path.join(flowdeskRoot, "bin", "flowdesk-evidence"),
    args,
    cwd: flowdeskRoot,
  };
}

export function parseReviewCommandFailure(error: unknown): {
  code: string;
  message: string;
} {
  const failure = isRecord(error) ? error : {};
  for (const output of [failure.stdout, failure.stderr]) {
    if (typeof output !== "string" || !output.trim()) continue;
    try {
      const payload = JSON.parse(output) as unknown;
      if (isRecord(payload)) {
        return {
          code: text(payload.code, "review_request_rejected"),
          message: text(payload.error, text(payload.message, "复核请求失败")),
        };
      }
    } catch {
      // Fall through to the process error below.
    }
  }
  return {
    code: "review_request_rejected",
    message: text(failure.message, "复核请求失败"),
  };
}

export function canReviewEvidence(input: {
  trustLevel: string;
  observationTrustworthy: boolean;
  sourceIdentity: true | false | "unknown";
  sourceIdentityMatch: boolean | "unknown";
  evidenceBundleDigest: string | null;
  requirementUids: string[];
}): boolean {
  return (
    input.trustLevel === "review_required" &&
    input.observationTrustworthy &&
    input.sourceIdentity === true &&
    input.sourceIdentityMatch === true &&
    typeof input.evidenceBundleDigest === "string" &&
    /^sha256:.+/.test(input.evidenceBundleDigest) &&
    input.requirementUids.some((uid) => Boolean(uid.trim()))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
import * as path from "path";
