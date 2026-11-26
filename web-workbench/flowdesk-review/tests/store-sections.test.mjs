import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createStore } from '../store.mjs';

const sourcePath = 'Notes/Plans/NiuSaaS-详细设计/经营看板与报表.md';
const targetPath = 'Notes/Docs/NiuSaaS-系统总览.md';
const assetPath = 'Attachments/看板图.png';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'flowdesk-sections-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vaultDir = join(root, 'vault');
  const dataDir = join(root, 'data');
  const write = (path, content) => {
    const absolute = join(vaultDir, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  };
  write(sourcePath, [
    '# 经营看板与报表',
    '[总览章节](../../Docs/NiuSaaS-系统总览.md#3%20详细设计)',
    '[[NiuSaaS-系统总览#3 详细设计|Wiki 章节]]',
    '[引用式章节][overview]',
    '[overview]: ../../Docs/NiuSaaS-系统总览.md#3%20详细设计',
    '[英文标题](../../Docs/NiuSaaS-系统总览.md#shared-heading)',
    '[本文章节](#本文%202)',
    '[[#本文 2|Wiki 本文]]',
    '[同名标题](../../Docs/NiuSaaS-系统总览.md#重复章节)',
    '[缺失标题](../../Docs/NiuSaaS-系统总览.md#缺失章节)',
    '[没有分享](../../Docs/其他笔记.md#隐私章节)',
    '[附件链接](../../../Attachments/看板图.png#片段)',
    '## 本文 2',
  ].join('\n\n'));
  write(targetPath, '# NiuSaaS 系统总览\n\n## 3 **详细设计**\n\n### Shared Heading\n\n## 重复章节\n\n## 重复章节\n');
  write('Notes/Docs/其他笔记.md', '# 隐私章节\n');
  write(assetPath, 'sample image bytes');

  const options = { vaultDir, dataDir };
  const store = createStore(options);
  const round = store.create({ title: '章节链接', paths: [sourcePath, targetPath], attachments: [assetPath] });
  const inviteToken = store.issueInvite(round.id, { reviewer: '甲' }).token;
  const invite = store.authorize(round.id, inviteToken);
  return { store, round, invite, options, write, roundFile: join(dataDir, 'rounds', round.id, 'round.json') };
}

function hrefIn(document, label) {
  const block = document.blocks.find(block => block.text === label);
  assert.ok(block, label);
  return block.html.match(/href="([^"]+)"/)?.[1];
}

test('new snapshots write links only to uniquely resolved sections in shared documents', t => {
  const { store, round, invite, write } = fixture(t);
  const [source, target] = round.documents;
  const base = '/r/' + round.id + '/doc/';
  const targetHref = base + target.id;
  const mainSection = target.blocks.find(block => block.text === '3 详细设计').id;
  const englishSection = target.blocks.find(block => block.text === 'Shared Heading').id;
  const ownSection = source.blocks.find(block => block.text === '本文 2').id;
  for (const label of ['总览章节', 'Wiki 章节', '引用式章节']) {
    assert.equal(hrefIn(source, label), targetHref + '?section=' + mainSection);
  }
  assert.equal(hrefIn(source, '英文标题'), targetHref + '?section=' + englishSection);
  for (const label of ['本文章节', 'Wiki 本文']) {
    assert.equal(hrefIn(source, label), base + source.id + '?section=' + ownSection);
  }
  assert.equal(hrefIn(source, '同名标题'), targetHref);
  assert.equal(hrefIn(source, '缺失标题'), targetHref);
  assert.equal(hrefIn(source, '没有分享'), undefined);
  assert.equal(hrefIn(source, '附件链接'), '/api/review/' + round.id + '/assets/' + round.assets[0].id);

  write(targetPath, '# 已修改\n');
  const view = store.reviewerView(round.id, invite).review;
  assert.equal(hrefIn(view.documents[0], '总览章节'), targetHref + '?section=' + mainSection);
  assert.equal(view.documents[1].sha256, target.sha256);
});

test('old rounds regain section links from frozen bytes without changing block IDs or stored feedback', t => {
  const { round, invite, options, write, roundFile } = fixture(t);
  const stored = JSON.parse(readFileSync(roundFile, 'utf8'));
  stored.version = 1;
  for (const document of stored.documents) {
    for (const block of document.blocks) block.html = block.html.replace(/\?section=[^"\s]+/g, '');
  }
  const [source, target] = stored.documents;
  const heading = target.blocks.find(block => block.text === '3 详细设计');
  heading.id = 'original-section-id';
  writeFileSync(roundFile, JSON.stringify(stored));
  const before = readFileSync(roundFile);
  write(targetPath, '# 本机稿已改名\n\n## 其他章节\n');
  rmSync(join(options.vaultDir, sourcePath));

  const reopened = createStore(options);
  const feedback = reopened.submit(round.id, invite, { id: 'legacy-feedback', decision: 'comment', items: [{
    id: 'legacy-item', documentId: target.id, blockId: heading.id, kind: 'comment', comment: '基于冻结章节',
  }] });
  const { review, submission } = reopened.reviewerView(round.id, invite);
  const [viewSource, viewTarget] = review.documents;
  const href = '/r/' + round.id + '/doc/' + target.id + '?section=' + heading.id;
  assert.equal(hrefIn(viewSource, '总览章节'), href);
  assert.equal(hrefIn(viewTarget, '3 详细设计'), undefined);
  assert.equal(viewSource.path, undefined);
  assert.deepEqual(review.documents.map(doc => doc.blocks.map(block => block.id)), [source, target].map(doc => doc.blocks.map(block => block.id)));
  assert.deepEqual(submission, feedback);
  assert.deepEqual(readFileSync(roundFile), before);
});
