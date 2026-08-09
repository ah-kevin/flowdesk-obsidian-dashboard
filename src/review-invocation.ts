export type ReviewDecision = "approved" | "changes_requested";

/** TaskNotes 底座下的复核请求：不依赖 evidence bundle digest。 */
export interface ReviewRequest {
  taskPath: string;
  decision: ReviewDecision;
  note: string;
  reviewedAt: string;
  existingTags: string[];
}

export const REVIEWED_TAG = "reviewed";

export interface TaskNotesReviewWrite {
  /** 合并后的 tags；approved 追加 reviewed，changes_requested 移除它。 */
  tags: string[];
  /** 追加到 details 的复核记录（Markdown）。 */
  detailsAppend: string;
  heading: string;
}

/**
 * 构造 TaskNotes 复核写入内容。
 *
 * 判定层拆除后没有 evidence store，也没有 evidence_bundle_digest，因此复核不做
 * CAS 冲突检测：这是人工复核，接受「以最后一次写入为准」的乐观语义。
 */
export function buildTaskNotesReviewWrite(
  request: ReviewRequest
): TaskNotesReviewWrite {
  const taskPath = request.taskPath.trim();
  if (!taskPath) throw new Error("review task path 不能为空");
  const note = request.note.trim();
  const reviewedAt = request.reviewedAt.trim();
  if (!reviewedAt) throw new Error("review 时间不能为空");

  const tags = mergeReviewTags(request.existingTags, request.decision);
  const decisionLabel =
    request.decision === "approved" ? "通过" : "要求修改";
  const lines = [
    `- 复核结论：${decisionLabel}`,
    `- 复核时间：${reviewedAt}`,
    "- 复核来源：obsidian-dashboard",
    `- 复核说明：${note || "未填写"}`,
  ];
  return {
    tags,
    heading: "## Review Record",
    detailsAppend: lines.join("\n"),
  };
}

export function mergeReviewTags(
  existingTags: string[],
  decision: ReviewDecision
): string[] {
  const normalized = existingTags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => tag !== REVIEWED_TAG);
  return decision === "approved" ? [...normalized, REVIEWED_TAG] : normalized;
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

/**
 * 复核入口门禁：只要求观测可信、来源匹配，且当前任务已写回 done。
 * 不再要求 trust_level=untrusted_v4、evidence digest 或 requirement UID。
 */
export function canReviewTask(input: {
  lifecycleStatus: string;
  observationTrustworthy: boolean;
  sourceIdentity: true | false | "unknown";
  sourceIdentityMatch: boolean | "unknown";
  isStale: boolean;
}): boolean {
  return (
    input.lifecycleStatus === "done" &&
    input.observationTrustworthy &&
    !input.isStale &&
    input.sourceIdentity === true &&
    input.sourceIdentityMatch === true
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
