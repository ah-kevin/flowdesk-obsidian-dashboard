const itemKinds = new Set(['highlight', 'comment', 'suggestion']);
const decisions = new Set(['approve', 'changes', 'comment']);
const roundIdPattern = /^[A-Za-z0-9_-]{1,100}$/;

function reviewError(status, message) {
  return Object.assign(new Error(message), { status });
}

function validateSelection(roundId, documentPath) {
  if (typeof roundId !== 'string' || !roundIdPattern.test(roundId)
    || typeof documentPath !== 'string' || /[\\\u0000-\u001f\u007f]/u.test(documentPath)
    || documentPath.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw reviewError(400, '评审轮次或文档路径无效。');
  }
}

function invalidResponse() {
  return reviewError(502, '本机评审服务返回了无法识别的评审详情。');
}

function selectedDetails(review, roundId, documentPath) {
  if (!review || review.id !== roundId || typeof review.title !== 'string'
    || typeof review.createdAt !== 'string' || (review.closedAt != null && typeof review.closedAt !== 'string')
    || !Array.isArray(review.documents) || !Array.isArray(review.submissions)) {
    throw invalidResponse();
  }

  const matches = review.documents.filter(document => document?.path === documentPath);
  if (matches.length === 0) throw reviewError(404, '本轮评审未包含此文档。');
  const [document] = matches;
  const live = review.mode === 'live';
  const available = !live || document.sourceStatus !== 'unavailable';
  if (matches.length !== 1 || typeof document.id !== 'string' || !document.id
    || review.documents.filter(candidate => candidate?.id === document.id).length !== 1
    || typeof document.title !== 'string' || (available && typeof document.sha256 !== 'string')
    || !Array.isArray(document.blocks)) {
    throw invalidResponse();
  }

  const blocks = new Map(document.blocks.map(block => [block?.id, block]));
  const viewParameters = new URLSearchParams({ round: roundId, doc: document.id });
  const authorHref = '/review/?' + viewParameters;
  return {
    round: { id: review.id, title: review.title, createdAt: review.createdAt, closedAt: review.closedAt ?? null, mode: review.mode },
    document: { id: document.id, title: document.title, path: document.path, sha256: document.sha256,
      sourceStatus: document.sourceStatus, snapshotHref: available ? authorHref : null },
    // Conclusions and summaries are round-wide, even when this document has no items.
    submissions: review.submissions.map(submission => {
      if (!submission || typeof submission.id !== 'string' || typeof submission.reviewer !== 'string'
        || !decisions.has(submission.decision) || typeof submission.submittedAt !== 'string'
        || !Array.isArray(submission.items)) {
        throw invalidResponse();
      }
      const documentVersion = submission.documentVersions?.find(version => version.documentId === document.id);
      const reviewedSourceStatus = !documentVersion ? null : !available ? 'unavailable'
        : documentVersion.sha256 === document.sha256 ? 'current' : 'stale';
      return {
        id: submission.id,
        reviewer: submission.reviewer,
        decision: submission.decision,
        summary: typeof submission.summary === 'string' ? submission.summary : '',
        submittedAt: submission.submittedAt,
        ...(live && { documentVersions: submission.documentVersions, reviewedSourceStatus }),
        items: submission.items.filter(item => item?.documentId === document.id).map(item => {
          if (!itemKinds.has(item.kind) || typeof item.blockId !== 'string') throw invalidResponse();
          const block = blocks.get(live ? item.currentAnchor?.blockId : item.blockId);
          const line = block?.lineStart ?? item.source?.startLine;
          const original = (item.sourceFormat === 'markdown' ? block?.raw : block?.text) ?? item.quote;
          const anchor = new URLSearchParams(viewParameters);
          if (block) anchor.set('block', block.id);
          return {
            kind: item.kind,
            quote: typeof item.quote === 'string' ? item.quote : '',
            comment: typeof item.comment === 'string' ? item.comment : '',
            replacement: typeof item.replacement === 'string' ? item.replacement : '',
            required: item.required === true,
            blockId: item.blockId,
            lineStart: Number.isSafeInteger(line) && line > 0 ? line : null,
            snapshotHref: block ? '/review/?' + anchor : null,
            ...(live && { source: item.source, currentAnchor: item.currentAnchor }),
            ...(item.kind === 'suggestion' && typeof original === 'string' ? { original } : {}),
          };
        }),
      };
    }),
  };
}

export async function readReviewDetails({ store, roundId, documentPath }) {
  validateSelection(roundId, documentPath);
  return selectedDetails(await store.get(roundId), roundId, documentPath);
}
