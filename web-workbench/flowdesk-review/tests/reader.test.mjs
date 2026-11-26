import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readReviewableDocument } from '../reader.mjs';

const documentPath = 'Notes/评审.md';
const markdown = '# 评审\n\n当前内容。\n';
const writeJson = (path, contents) => writeFile(path, JSON.stringify(contents));
const cli = fileURLToPath(new URL('../reader.mjs', import.meta.url));
const mcp = fileURLToPath(new URL('../mcp.mjs', import.meta.url));
const run = promisify(execFile);

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'flowdesk-review-reader-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vaultDir = join(root, 'vault');
  const dataDir = join(root, 'data');
  await mkdir(join(vaultDir, 'Notes'), { recursive: true });
  await writeFile(join(vaultDir, documentPath), markdown);
  return { root, vaultDir, dataDir, documentPath };
}

async function writeRound(dataDir, { id, createdAt, sha256, submissions }) {
  const roundDir = join(dataDir, 'rounds', id);
  await mkdir(join(roundDir, 'submissions'), { recursive: true });
  await writeJson(join(roundDir, 'round.json'), {
    id, title: id, createdAt, closedAt: null,
    documents: [
      { id: 'selected', path: documentPath, title: '评审', sha256, blocks: [] },
      { id: 'other', path: 'Other.md', title: '另一个文档', sha256, blocks: [] },
    ],
  });
  for (const submission of submissions) {
    await writeJson(join(roundDir, 'submissions', `${submission.id}.json`), submission);
  }
}

test('reads current and stale rounds while limiting items to the selected document', async (t) => {
  const { vaultDir, dataDir } = await fixture(t);
  const sha256 = createHash('sha256').update(markdown).digest('hex');
  const quote = '原始引用\n第二行';
  const replacement = '原始引用 → 中文替换\n';
  await writeRound(dataDir, {
    id: 'old', createdAt: '2026-11-24T00:00:00.000Z', sha256: 'a'.repeat(64),
    submissions: [{
      id: 'stale-feedback', reviewer: '甲', submittedAt: '2026-11-24T10:00:00.000Z',
      decision: 'changes', summary: '整轮需要修改',
      items: [
        { documentId: 'selected', blockId: 'one', kind: 'replacement', quote, replacement },
        { documentId: 'other', blockId: 'two', kind: 'comment', comment: '其他文档的条目' },
      ],
    }],
  });
  await writeRound(dataDir, {
    id: 'latest', createdAt: '2026-11-25T00:00:00.000Z', sha256,
    submissions: [{
      id: 'round-only-feedback', reviewer: '乙', submittedAt: '2026-11-25T10:00:00.000Z',
      decision: 'approve', summary: '整轮可通过',
      items: [{ documentId: 'other', blockId: 'two', kind: 'comment', comment: '另一个文档的条目' }],
    }],
  });
  await mkdir(join(dataDir, 'rounds', '.in-progress.tmp'));

  const { stdout } = await run(process.execPath, [cli, '--vault', vaultDir, '--data', dataDir, join(vaultDir, documentPath)]);
  const result = JSON.parse(stdout);
  assert.deepEqual(result.document, { path: documentPath, markdown, sha256 });
  assert.equal(result.latestRoundId, 'latest');
  assert.equal(result.feedbackStatus, 'available');
  assert.deepEqual(result.reviews.map(({ id, sourceStatus }) => [id, sourceStatus]), [
    ['latest', 'current'], ['old', 'stale'],
  ]);
  const [latest, old] = result.reviews.map(({ submissions }) => submissions[0]);
  assert.deepEqual(latest.items, []);
  assert.equal(latest.summary, '整轮可通过');
  assert.equal(latest.summaryScope, 'round');
  assert.deepEqual(old.items, [
    { documentId: 'selected', blockId: 'one', kind: 'replacement', quote, comment: null, replacement, offset: null, required: false, source: null },
  ]);
});

test('empty data succeeds, broken review data and vault escape fail', async (t) => {
  const options = await fixture(t);
  const { root, vaultDir, dataDir } = options;
  const outside = join(root, 'outside.md');
  await writeFile(outside, 'outside');
  await symlink(outside, join(vaultDir, 'alias.md'));

  const result = await readReviewableDocument(options);
  assert.equal(result.feedbackStatus, 'none');
  assert.equal(result.latestRoundId, null);
  assert.deepEqual(result.reviews, []);
  for (const escapedPath of [outside, '../outside.md', 'alias.md']) {
    await assert.rejects(readReviewableDocument({ ...options, documentPath: escapedPath }), /outside the configured vault/);
  }

  const roundDir = join(dataDir, 'rounds', 'broken');
  await mkdir(roundDir, { recursive: true });
  await writeFile(join(roundDir, 'round.json'), '{');
  await assert.rejects(readReviewableDocument(options), /Could not read review data .*Invalid JSON/);
  await assert.rejects(
    run(process.execPath, [cli, '--vault', vaultDir, '--data', dataDir, documentPath]),
    { code: 1, stdout: '' },
  );
});

test('MCP client initializes and reads the document without an HTTP server', async (t) => {
  const { vaultDir, dataDir } = await fixture(t);
  const client = new Client({ name: 'flowdesk-review-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcp, '--vault', vaultDir, '--data', dataDir],
  });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name, annotations }) => [name, annotations.readOnlyHint]), [
    ['read_reviewable_document', true],
  ]);
  const result = await client.callTool({ name: tools[0].name, arguments: { path: documentPath } });
  assert.equal(result.structuredContent.document.markdown, markdown);
  assert.equal(result.structuredContent.feedbackStatus, 'none');
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  const missing = await client.callTool({ name: tools[0].name, arguments: { path: 'missing.md' } });
  assert.equal(missing.isError, true);
});
