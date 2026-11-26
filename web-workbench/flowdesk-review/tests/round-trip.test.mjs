import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createReviewServer, isGuestReviewPath } from '../server.mjs';
import { readReviewableDocument } from '../reader.mjs';

const source = 'Notes/Plans/移动端任务提醒方案.md';
const linked = 'Notes/Docs/提醒交互说明.md';
const attachment = 'Attachments/提醒处理流程.png';
const isolated = 'Notes/Docs/内部记录.md';

test('送审、跨受众访问、提交、复审和离线读取', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flowdesk-review-test-'));
  const vaultDir = join(directory, 'vault');
  const dataDir = join(directory, 'data');
  let server;
  async function closeServer() {
    if (!server?.listening) return;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  try {
    await cp(new URL('../demo-vault/', import.meta.url), vaultDir, { recursive: true });
    await writeFile(join(vaultDir, isolated), '# 内部记录\nEXCLUDED_FROM_REVIEW\n');
    const original = await readFile(join(vaultDir, source), 'utf8');
    const table = '| 情况 | 提前量 |\n| --- | --- |\n| 首次提醒 | **30 分钟** |';
    await writeFile(join(vaultDir, source), original + '\n相关但不本次共享：[[Notes/Docs/内部记录|资料引用]]。\n\n' + table + '\n');
    const session = { id: '39794ea8-8592-4557-9ca4-9b7ea8721d57', title: '测试会话', lastActivity: null };
    const client = { id: 'codex-desktop', label: 'Codex 桌面', sessions: [session] };
    const targets = { clients: [client] };
    const deliveries = [];
    const dispatch = {
      listTargets: async () => targets,
      send: async input => { deliveries.push(input); return { status: 'queued' }; },
    };
    server = await createReviewServer({ vaultDir, dataDir, dispatch });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    async function request(path, { body, cookie, expected = 200, headers = {} } = {}) {
      if (cookie) headers.Cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
      assert.equal(response.status, expected, path + ' ' + await response.clone().text());
      const mime = response.headers.get('Content-Type') ?? '';
      return { response, value: mime.includes('application/json') ? await response.json() : await response.arrayBuffer() };
    }
    const listing = (await request('/api/admin/documents')).value;
    assert.ok(listing.documents.some(item => item.path === source));
    const targetsPath = '/api/admin/review-targets';
    assert.equal(isGuestReviewPath(targetsPath), false);
    assert.deepEqual((await request(targetsPath)).value, targets);
    assert.equal(await new Promise((resolve, reject) => {
      get(origin + targetsPath, { headers: { Host: 'office-review.test' } }, response => {
        response.resume();
        resolve(response.statusCode);
      }).on('error', reject);
    }), 403);
    const remoteHostStatus = await new Promise((resolve, reject) => {
      get(origin + '/api/admin/documents', { headers: { Host: 'office-review.test' } }, response => {
        response.resume();
        resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(remoteHostStatus, 403);
    await request('/api/admin/preview', { body: { paths: [source] }, expected: 403, headers: { Origin: 'https://other.test' } });
    const preview = (await request('/api/admin/preview', { body: { paths: [source] } })).value;
    for (const path of [source, linked, attachment, isolated]) assert.ok(preview.documents.some(item => item.path === path));
    const { review, invite } = (await request('/api/admin/reviews', {
      body: { title: '提醒方案 v1', paths: [source, linked], attachments: [attachment], reviewer: '评审人甲', expiresInHours: 24 },
      expected: 201,
    })).value;
    assert.equal(review.documents.length, 2);
    const endpoint = '/api/review/' + review.id;
    await request(endpoint, { expected: 401 });
    const redeem = (await request(endpoint + '/session', { body: { token: decodeURIComponent(invite.url.split('#')[1]) } })).response;
    const cookie = redeem.headers.get('set-cookie').split(';', 1)[0];
    assert.ok(redeem.headers.get('set-cookie').includes('HttpOnly'));
    const view = (await request(endpoint, { cookie })).value;
    assert.equal(view.review.reviewer, '评审人甲');
    assert.equal(view.review.inviteId, invite.id);
    const document = view.review.documents.find(file => file.title === '移动端任务提醒方案');
    assert.ok(document);
    assert.equal(document.path, undefined);
    const exposed = JSON.stringify(view);
    assert.doesNotMatch(exposed, /EXCLUDED_FROM_REVIEW|tokenHash|Notes\/Docs\/|Notes\/Plans\//);
    const unsharedLink = document.blocks.find(block => block.text.includes('资料引用'));
    assert.equal(unsharedLink.raw, unsharedLink.text);
    const linkedDocument = view.review.documents.find(file => file.title === '提醒交互说明');
    assert.ok(document.blocks.some(block => block.html.includes('/doc/' + linkedDocument.id)));
    const assetRoute = endpoint + '/assets/' + view.review.assets[0].id;
    await request(assetRoute, { expected: 401 });
    const image = await request(assetRoute, { cookie });
    assert.equal(image.response.headers.get('Content-Type'), 'image/png');
    assert.deepEqual(Buffer.from(image.value), await readFile(join(vaultDir, attachment)));
    const adminAsset = '/api/admin/reviews/' + review.id + '/assets/' + view.review.assets[0].id;
    assert.deepEqual(Buffer.from((await request(adminAsset)).value), Buffer.from(image.value));
    assert.equal(await new Promise((resolve, reject) => {
      get(origin + adminAsset, { headers: { Host: 'office-review.test' } }, response => {
        response.resume();
        resolve(response.statusCode);
      }).on('error', reject);
    }), 403);
    const paragraph = document.blocks.find(block => block.text.includes('30 分钟'));
    assert.ok(paragraph);
    const tableBlock = document.blocks.find(block => block.html.includes('<table>') && block.text.includes('首次提醒'));
    assert.equal(tableBlock.raw, table);
    const input = {
      id: 'request-1', inviteId: invite.id, decision: 'changes', summary: '请把提前提醒调整到 15 分钟',
      items: [
        { id: 'mark-1', documentId: document.id, blockId: paragraph.id, kind: 'highlight', quote: '30 分钟', offset: 6 },
        { id: 'comment-1', documentId: document.id, blockId: paragraph.id, kind: 'comment', quote: '到期后再提醒一次', comment: '请明确间隔', required: true },
        {
          id: 'change-1', documentId: document.id, blockId: tableBlock.id, kind: 'suggestion',
          quote: tableBlock.text, replacement: tableBlock.raw.replace('30 分钟', '15 分钟'), sourceFormat: 'markdown',
        },
      ],
    };
    await request(endpoint + '/submit', { body: { ...input, inviteId: 'another-invite' }, cookie, expected: 409 });
    const saved = (await request(endpoint + '/submit', { body: input, cookie, expected: 201 })).value.submission;
    const replay = (await request(endpoint + '/submit', { body: input, cookie, expected: 201 })).value.submission;
    assert.deepEqual(saved, replay);
    const conflict = await request(endpoint + '/submit', {
      body: { ...input, summary: '其它标签页尚未提交的内容' }, cookie, expected: 409,
    });
    assert.equal(conflict.value.code, 'submission_conflict');
    const adminPath = '/api/admin/reviews/' + review.id;
    const adminView = (await request(adminPath)).value.review;
    assert.equal(adminView.submissions.length, 1);
    assert.equal(adminView.submissions[0].items[2].sourceFormat, 'markdown');
    assert.equal(adminView.documents.find(file => file.id === document.id).blocks.find(block => block.id === tableBlock.id).raw, table);
    const dispatchPath = adminPath + '/submissions/' + encodeURIComponent(saved.id) + '/dispatch';
    const target = { targetThreadId: session.id, targetClientId: client.id };
    await request(dispatchPath, { body: target, expected: 403, headers: { Origin: 'https://other.test' } });
    await request(adminPath + '/submissions/not-this-receipt/dispatch', { body: target, expected: 404 });
    assert.equal(deliveries.length, 0);
    assert.deepEqual((await request(dispatchPath, { body: target })).value, { dispatch: { status: 'queued' } });
    assert.deepEqual(deliveries, [{ roundId: review.id, submissionId: saved.id,
      ...target, documentPaths: [source, linked] }]);
    await request(adminPath + '/close', { body: {} });
    await request(endpoint + '/submit', { body: { ...input, id: 'request-2' }, cookie, expected: 409 });
    await request(adminPath + '/invites/' + invite.id + '/revoke', { body: {} });
    await request(endpoint, { cookie, expected: 403 });
    await writeFile(join(vaultDir, source), original.replace('30 分钟', '15 分钟'));
    const newer = (await request('/api/admin/reviews', {
      body: { title: '提醒方案 v2', paths: [source], attachments: [], reviewer: '评审人甲' }, expected: 201,
    })).value.review;
    await closeServer();
    const result = await readReviewableDocument({ vaultDir, dataDir, documentPath: source });
    assert.equal(result.latestRoundId, newer.id);
    assert.equal(result.reviews[0].submissions.length, 0);
    assert.equal(result.reviews[0].sourceStatus, 'current');
    assert.equal(result.reviews[1].sourceStatus, 'stale');
    assert.equal(result.reviews[1].submissions[0].decision, 'changes');
    assert.equal(result.reviews[1].submissions[0].items.length, 3);
    const [highlight, comment, suggestion] = result.reviews[1].submissions[0].items;
    assert.equal(highlight.offset, 6);
    assert.equal(comment.required, true);
    assert.match(suggestion.replacement, /15 分钟/);
    assert.equal(suggestion.sourceFormat, 'markdown');
    assert.match(suggestion.source.markdown, /30 分钟/);
    assert.ok(suggestion.source.startLine > 0);
    await mkdir(join(directory, 'different-vault'));
    await assert.rejects(createReviewServer({ vaultDir: join(directory, 'different-vault'), dataDir }), /另一个资料库/);
  } finally {
    await closeServer();
    await rm(directory, { recursive: true, force: true });
  }
});
