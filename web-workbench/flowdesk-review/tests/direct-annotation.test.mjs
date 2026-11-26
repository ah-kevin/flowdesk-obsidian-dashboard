import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { readReviewableDocument } from '../reader.mjs';
import { createStore } from '../store.mjs';

test('workbench annotations use one private live container per authorized file', async t => {
  const root = await mkdtemp(join(tmpdir(), 'flowdesk-direct-review-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vaultDir = join(root, 'vault');
  const dataDir = join(root, 'review-data');
  const projectPath = 'Notes/Projects/生产管理.md';
  const planPath = 'Notes/Plans/执行方案.md';
  const project = join(vaultDir, projectPath);
  const plan = join(vaultDir, planPath);
  const body = '# 生产管理\n\n[[#下一步]]\n\n## 下一步\n\n增加现场巡检。\n';
  await mkdir(dirname(project), { recursive: true });
  await mkdir(dirname(plan), { recursive: true });
  await writeFile(project, body);
  await writeFile(plan, '# 执行方案\n');
  await symlink(project, join(dirname(plan), '别名.md'));

  const store = createStore({ vaultDir, dataDir });
  assert.throws(() => store.openDirect(projectPath), { status: 404 });
  assert.throws(() => store.openDirect('Notes/Plans/别名.md', { managedKind: 'project' }), { status: 404 });
  assert.ok(store.openDirect(planPath).review.direct);
  assert.equal(store.documents().some(entry => entry.path === projectPath), false);

  for (const [managedKind, managedPath] of [
    ['case', 'Notes/Sessions/2026-11-26-NiuSaaS-巡检.md'], ['task', 'Tasks/补充巡检方案.md'],
  ]) {
    await mkdir(dirname(join(vaultDir, managedPath)), { recursive: true });
    await writeFile(join(vaultDir, managedPath), '# 巡检\n');
    assert.throws(() => store.openDirect(managedPath), { status: 404 });
    assert.throws(() => store.openDirect(managedPath, { managedKind: 'project' }), { status: 404 });
    const { review } = store.openDirect(managedPath, { managedKind });
    assert.equal(review.documents[0].path, managedPath);
    assert.equal(review.direct, true);
  }

  const projectScope = { managedKind: 'project' };
  const first = store.openDirect(projectPath, projectScope);
  assert.equal(first.review.direct, true);
  assert.equal(first.review.mode, 'live');
  assert.equal(first.review.reviewer, '工作台批注');
  assert.equal(first.submission, null);
  assert.deepEqual(store.list(), []);
  assert.throws(() => store.issueInvite(first.review.id, { reviewer: '访客' }), { status: 404 });
  assert.throws(() => store.reviewerView(first.review.id, { id: first.review.inviteId }), { status: 404 });
  assert.throws(() => store.authorize(first.review.id, 'A'.repeat(43)), { status: 404 });
  await assert.rejects(stat(join(dataDir, 'rounds', first.review.id, 'snapshots')), { code: 'ENOENT' });

  const reopened = createStore({ vaultDir, dataDir }).openDirect(projectPath, projectScope);
  assert.equal(reopened.review.id, first.review.id);
  const [document] = reopened.review.documents;
  assert.equal(document.id, first.review.documents[0].id);
  assert.equal(document.path, projectPath);
  assert.ok(document.blocks.some(block => block.html.includes('/annotate/?')));
  const paragraph = document.blocks.find(block => block.text.includes('增加现场巡检'));
  const request = {
    id: 'workbench-receipt', inviteId: 'foreign-sender', decision: 'approve',
    documentVersions: [{ documentId: document.id, sha256: document.sha256 }],
    items: [
      { id: 'workbench-comment', kind: 'comment', documentId: document.id, blockId: paragraph.id,
        quote: '现场巡检', comment: '请补足触发条件', sourceSha256: document.sha256 },
      { id: 'workbench-suggestion', kind: 'suggestion', documentId: document.id, blockId: paragraph.id,
        quote: '现场巡检', replacement: '每日现场巡检', sourceSha256: document.sha256 },
    ],
  };
  assert.throws(() => store.submit(first.review.id, { id: first.review.inviteId }, request), { status: 404 });
  assert.throws(() => store.submitDirect(first.review.id, { ...request, items: [] }), { status: 400 });
  assert.throws(() => store.submitDirect(first.review.id, {
    ...request, items: [{ ...request.items[1], replacement: undefined }],
  }), { status: 400 });
  const reply = store.submitDirect(first.review.id, request);
  assert.equal(reply.decision, 'comment');
  assert.equal(reply.reviewer, '工作台批注');
  assert.deepEqual(store.submitDirect(first.review.id, request), reply);
  const saved = store.get(first.review.id);
  assert.equal(saved.invites.length, 0);
  assert.equal(saved.submissions[0].items[1].replacement, '每日现场巡检');
  assert.equal(saved.submissions[0].items[1].source.verified, true);
  assert.equal(store.list()[0].submissionCount, 1);
  const next = store.openDirect(projectPath, projectScope);
  assert.equal(next.review.id, first.review.id);
  assert.equal(next.review.submissionCount, 0);
  assert.equal(next.submission, null);
  assert.equal(await readFile(project, 'utf8'), body);

  await writeFile(project, body.replace('增加现场巡检', '补充日常现场巡检'));
  const offline = await readReviewableDocument({
    vaultDir, dataDir, documentPath: projectPath, roundId: first.review.id, submissionId: reply.id,
  });
  const [review] = offline.reviews;
  assert.equal(review.direct, true);
  assert.equal(review.sourceStatus, 'stale');
  assert.equal(review.submissions[0].items[0].currentAnchor.status, 'relocated');
  assert.equal(review.submissions[0].items[1].replacement, '每日现场巡检');
  assert.equal(review.submissions[0].items[1].source.sha256, document.sha256);
});
