import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readReviewableDocument } from '../reader.mjs';
import { createStore } from '../store.mjs';

test('live reviews keep their selected files and exact receipts as the vault changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'flowdesk-live-review-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vaultDir = join(root, 'vault');
  const dataDir = join(root, 'review-data');
  const documentPath = 'Notes/巡检.md';
  const path = join(vaultDir, documentPath);
  const hiddenPath = join(vaultDir, 'Notes/其他资料.md');
  const imagePath = join(vaultDir, 'Notes/现场图.png');
  const quote = '重试间隔为 10 分钟';
  const documentBody = '# 巡检\n\n原计划中，' + quote + '，最多重试三次。\n\n[[其他资料]]\n\n![[现场图.png]]\n';
  await mkdir(join(vaultDir, 'Notes'), { recursive: true });
  await writeFile(path, documentBody);
  await writeFile(hiddenPath, '# 不在邀请范围\n');
  await writeFile(imagePath, 'initial image');

  const store = createStore({ vaultDir, dataDir, defaultMode: 'live' });
  const round = store.create({ title: '巡检评审', paths: [documentPath], attachments: ['Notes/现场图.png'] });
  assert.equal(round.mode, 'live');
  const storedRound = JSON.parse(await readFile(join(dataDir, 'rounds', round.id, 'round.json'), 'utf8'));
  assert.equal(storedRound.documents[0].blocks, undefined);
  await assert.rejects(stat(join(dataDir, 'rounds', round.id, 'snapshots')), { code: 'ENOENT' });

  const invite = store.issueInvite(round.id, { reviewer: '产品' });
  const recipient = store.authorize(round.id, invite.token);
  const [viewed] = store.reviewerView(round.id, recipient).review.documents;
  assert.equal(viewed.path, undefined);
  assert.ok(viewed.blocks.every(block => !block.html.includes('data-doc-id')));
  const block = viewed.blocks.find(entry => entry.text.includes(quote));
  const item = {
    id: 'note-1', kind: 'comment', documentId: viewed.id, blockId: block.id,
    quote, comment: '补充为什么选择这个间隔', sourceSha256: viewed.sha256,
  };
  const payload = {
    id: 'review-1', decision: 'changes', summary: '补足设计依据',
    documentVersions: [{ documentId: viewed.id, sha256: viewed.sha256 }], items: [item],
  };

  const updated = documentBody.replace('原计划中', '最新方案中').replace('# 巡检\n\n', '# 巡检\n\n新版说明\n\n');
  await writeFile(path, updated);
  const [latest] = store.reviewerView(round.id, recipient).review.documents;
  assert.notEqual(latest.sha256, viewed.sha256);

  const receipt = store.submit(round.id, recipient, payload);
  assert.equal(receipt.documentVersions[0].sourceStatus, 'stale');
  assert.equal(receipt.items[0].quote, quote);
  assert.deepEqual(receipt.items[0].source, {
    sha256: viewed.sha256, verified: true, startLine: 3, endLine: 3, prefix: '原计划中，', suffix: '，最多重试三次。',
  });
  assert.deepEqual(receipt.items[0].currentAnchor, {
    status: 'relocated', blockId: latest.blocks.find(entry => entry.text.includes(quote)).id, startLine: 5, endLine: 5,
  });
  assert.equal((await readFile(path)).toString(), updated);
  assert.deepEqual(store.submit(round.id, recipient, payload), receipt);
  assert.throws(() => store.submit(round.id, recipient, { ...payload, items: [{ ...item, kind: 'suggestion' }] }), { status: 400 });

  const nextInvite = store.issueInvite(round.id, { reviewer: '其他评审人' });
  assert.throws(() => store.submit(round.id, nextInvite, payload), { status: 409, code: 'submission_conflict' });

  await writeFile(path, updated + '\n' + quote + '\n');
  const stale = store.get(round.id).submissions[0];
  assert.equal(stale.items[0].currentAnchor.status, 'unresolved');
  const offline = await readReviewableDocument({ vaultDir, dataDir, documentPath, roundId: round.id, submissionId: receipt.id });
  assert.equal(offline.reviews[0].sourceStatus, 'stale');
  assert.deepEqual(offline.reviews[0].submissions[0].items[0].source, receipt.items[0].source);
  assert.equal(offline.reviews[0].submissions[0].items[0].currentAnchor.status, 'unresolved');

  await writeFile(imagePath, 'updated image');
  assert.equal(store.asset(round.id, round.assets[0].id).bytes.toString(), 'updated image');
  await rm(path);
  await symlink(hiddenPath, path);
  const [unavailable] = store.reviewerView(round.id, recipient).review.documents;
  assert.equal(unavailable.sourceStatus, 'unavailable');
  assert.deepEqual(unavailable.blocks, []);
});
