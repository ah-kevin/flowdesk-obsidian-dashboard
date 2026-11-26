import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readdir, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { liveAnchorLookup } from './store.mjs';

export const defaultVaultDir = process.env.FLOWDESK_REVIEW_VAULT
  || fileURLToPath(new URL('./demo-vault/', import.meta.url));
export const defaultDataDir = process.env.FLOWDESK_REVIEW_DATA
  || fileURLToPath(new URL('./.review-data/', import.meta.url));

function isOutside(root, path) {
  const fromRoot = relative(root, path);
  return fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
}

async function readRegularFile(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) throw new Error('Expected a regular file');
    return await file.readFile();
  } finally {
    await file.close();
  }
}

async function readDocument(vaultDir, documentPath) {
  if (typeof documentPath !== 'string' || documentPath.length === 0 || documentPath.includes('\0')) {
    throw new Error('A Markdown document path is required');
  }
  const root = await realpath(vaultDir);
  const path = await realpath(resolve(root, documentPath));
  if (isOutside(root, path)) throw new Error('Document path is outside the configured vault');
  if (extname(path).toLowerCase() !== '.md') throw new Error('Document path must reference a Markdown file');

  const bytes = await readRegularFile(path);
  return { root, document: {
    path: relative(root, path).split(sep).join('/'),
    markdown: bytes.toString('utf8'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  } };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRound(value) {
  return isRecord(value)
    && ['id', 'title', 'createdAt'].every((key) => typeof value[key] === 'string')
    && (value.closedAt == null || typeof value.closedAt === 'string')
    && Array.isArray(value.documents)
    && value.documents.every((document) => isRecord(document)
      && ['id', 'path', 'title', 'sha256'].every((key) => typeof document[key] === 'string'));
}

function isSubmission(value) {
  return isRecord(value)
    && ['id', 'reviewer', 'submittedAt', 'decision', 'summary'].every((key) => typeof value[key] === 'string')
    && Array.isArray(value.items)
    && value.items.every((item) => isRecord(item)
      && ['documentId', 'blockId', 'kind'].every((key) => typeof item[key] === 'string')
      && ['quote', 'comment', 'replacement'].every((key) => item[key] == null || typeof item[key] === 'string'));
}

async function readStoreJson(path, validate) {
  try {
    const value = JSON.parse((await readRegularFile(path)).toString('utf8'));
    if (!validate(value)) throw new Error('Unexpected file format');
    return value;
  } catch (error) {
    const reason = error instanceof SyntaxError ? 'Invalid JSON' : error.message;
    throw new Error(`Could not read review data at ${path}. ${reason}`, { cause: error });
  }
}

async function readStoreDirectory(path, allowMissing = false) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return [];
    throw new Error(`Could not list review data at ${path}. ${error.message}`, { cause: error });
  }
}

async function readRoundSubmissions(roundDir, snapshot, document, mode, submissionId) {
  const blocks = new Map((snapshot.blocks ?? []).map(block => [block.id, block]));
  const locateAnchor = mode === 'live' ? liveAnchorLookup({ id: snapshot.id, sha256: document.sha256, markdown: document.markdown }) : null;
  const submissionsDir = join(roundDir, 'submissions');
  const entries = await readStoreDirectory(submissionsDir);
  const submissions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('.')) continue;
    const { id, reviewer, submittedAt, decision, summary, items, documentVersions } = await readStoreJson(
      join(submissionsDir, entry.name), isSubmission,
    );
    if (submissionId && submissionId !== id) continue;
    const version = documentVersions?.find(entry => entry.documentId === snapshot.id);
    submissions.push({
      id,
      reviewer,
      submittedAt,
      decision,
      summary,
      summaryScope: 'round',
      ...(locateAnchor ? {
        documentVersion: version ? { ...version, sourceStatus: version.sha256 === document.sha256 ? 'current' : 'stale' } : null,
      } : {}),
      items: items.filter((item) => item.documentId === snapshot.id).map(item => {
        const { id, documentId, blockId, kind, quote, comment, replacement, offset, required, sourceFormat } = item;
        const block = blocks.get(blockId);
        return {
          id, documentId, blockId, kind, quote: quote ?? null, comment: comment ?? null,
          replacement: replacement ?? null, offset: offset ?? null, required: required === true,
          ...(sourceFormat === 'markdown' ? { sourceFormat } : {}),
          source: locateAnchor ? item.source : block ? {
            startLine: block.lineStart ?? null, endLine: block.lineEnd ?? null, markdown: block.raw ?? null,
          } : null,
          ...(locateAnchor && item.source ? { currentAnchor: locateAnchor(item) } : {}),
        };
      }),
    });
  }
  return submissions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id));
}

export async function readReviewableDocument({
  vaultDir = defaultVaultDir,
  dataDir = defaultDataDir,
  documentPath,
  roundId,
  submissionId,
}) {
  const selector = /^[A-Za-z0-9_.:-]{1,128}$/;
  for (const [label, value] of [['轮次', roundId], ['回执', submissionId]]) {
    if (value !== undefined && (typeof value !== 'string' || !selector.test(value))) throw new Error(label + '标识无效');
  }
  if (submissionId !== undefined && roundId === undefined) throw new Error('按回执读取时需要轮次标识');
  const { root, document } = await readDocument(vaultDir, documentPath);
  try {
    const binding = (await readRegularFile(resolve(dataDir, '.vault-origin'))).toString('utf8').trimEnd();
    if (binding !== root) throw new Error('Review data directory belongs to a different vault');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const roundsDir = resolve(dataDir, 'rounds');
  const entries = await readStoreDirectory(roundsDir, true);
  const reviews = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.endsWith('.tmp')) continue;
    if (roundId && entry.name !== roundId) continue;
    const roundDir = join(roundsDir, entry.name);
    const round = await readStoreJson(join(roundDir, 'round.json'), isRound);
    const snapshot = round.documents.find((candidate) => candidate.path === document.path);
    if (!snapshot) continue;
    const isLive = round.mode === 'live';
    const submissions = await readRoundSubmissions(roundDir, snapshot, document, round.mode, submissionId);
    if ((submissionId || round.direct) && !submissions.length) continue;
    const sourceSha256 = isLive ? submissions.find(submission => submission.documentVersion)?.documentVersion.sha256 ?? null
      : snapshot.sha256;

    reviews.push({
      id: round.id,
      title: round.title,
      createdAt: round.createdAt,
      closedAt: round.closedAt ?? null,
      documentId: snapshot.id,
      ...(isLive ? { mode: 'live' } : {}),
      ...(round.direct ? { direct: true } : {}),
      sourceSha256,
      sourceStatus: sourceSha256 ? (sourceSha256 === document.sha256 ? 'current' : 'stale') : 'unreviewed',
      submissions,
    });
  }
  reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));

  return {
    document,
    latestRoundId: reviews[0]?.id ?? null,
    feedbackStatus: reviews.some((review) => review.submissions.length > 0) ? 'available' : 'none',
    reviews,
  };
}

export function parseReaderArgs(args) {
  return parseArgs({
    args,
    options: {
      vault: { type: 'string' },
      data: { type: 'string' },
      round: { type: 'string' },
      submission: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const usage = 'Usage: node reader.mjs [--vault <dir>] [--data <dir>] [--round <id>] [--submission <id>] <document.md>';
  try {
    const { values, positionals } = parseReaderArgs(process.argv.slice(2));
    if (values.help) {
      console.log(usage);
    } else {
      if (positionals.length !== 1) throw new Error(usage);
      const result = await readReviewableDocument({
        vaultDir: values.vault, dataDir: values.data, documentPath: positionals[0],
        roundId: values.round, submissionId: values.submission,
      });
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
