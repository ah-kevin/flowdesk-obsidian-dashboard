import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createGalleryCatalog } from '../../flowdesk-workbench/gallery.mjs';
import { createReviewHandler, isGuestReviewPath } from '../server.mjs';
import { createStore } from '../store.mjs';

const external = '/api/admin/external-reviews';
const sourcePath = 'Notes/Plans/方案.md';
const relatedPath = 'Notes/Docs/配套资料.md';
const assetPath = 'Attachments/现场.png';
const galleryId = '现场图集';
const otherGalleryId = '另一图集';
const galleryEntry = 'Attachments/archify/' + galleryId + '/index.html';
const galleryPage = 'Attachments/archify/' + galleryId + '/pages/图一.html';
const galleryPageSource = '<!doctype html><title>子页图</title><p>图子页原稿</p>';
const author = { Cookie: 'fixture_author=yes' };

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'flowdesk-external-review-'));
  const vault = await realpath(directory);
  const dataDir = join(vault, 'review-data');
  const write = async (path, value) => {
    await mkdir(dirname(join(vault, path)), { recursive: true });
    await writeFile(join(vault, path), value);
  };
  const markdown = '# 方案\n\n需要评审的原文。\n\n[[配套资料]]\n\n![现场](../../Attachments/现场.png)\n\n'
    + `[打开原图](../../${galleryEntry}#图一)\n\n[其他网站](https://outside.example/)\n`;
  await Promise.all([
    write(sourcePath, markdown), write(relatedPath, '# 配套资料\n\n未共享的秘密资料。'),
    write(assetPath, Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    write(galleryEntry, '<!doctype html><title>总览图</title><a href="pages/图一.html">图一</a>'),
    write(galleryPage, galleryPageSource),
    write('Attachments/archify/' + otherGalleryId + '/index.html', '<title>另一图集</title>'),
  ]);
  const store = createStore({ vaultDir: vault, dataDir, defaultMode: 'live' });
  const catalog = createGalleryCatalog(vault);
  const deliveries = [];
  const handler = await createReviewHandler({
    store, standalone: false, externalReviewEnabled: true,
    canManage: request => request.headers.cookie === author.Cookie,
    ...options,
    reviewScope: async paths => ({ projects: [], cases: [], tasks: [], documents:
      paths.filter(path => [sourcePath, relatedPath].includes(path)).map(path => ({ path })) }),
    getGalleryCatalog: () => catalog([], []),
    dispatch: { status: async () => ({ status: 'unsent' }),
      send: async payload => { deliveries.push(payload); return { status: 'queued' }; } },
  });
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = (path, headers = {}) => fetch(origin + path, { headers });
  const post = (path, body, headers = {}) => fetch(origin + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: JSON.stringify(body),
  });
  return { dataDir, store, get, post, write, markdown, deliveries, httpsOrigin: origin.replace('http:', 'https:') };
}

test('external reviews publish only the approved preview, freeze attachments and galleries, and isolate guest access', async t => {
  const { dataDir, store, get, post, write, markdown, deliveries, httpsOrigin } = await fixture(t);
  assert.equal((await get(external)).status, 403);
  assert.equal((await post(external + '/preview', { paths: ['Notes/Sessions/案卷.md'] }, author)).status, 400);
  const { documents, assets, relatedDocuments, issues, previewDigest } = await (await post(external + '/preview', { paths: [sourcePath] }, author)).json();
  assert.deepEqual(documents.map(document => document.path), [sourcePath]);
  assert.equal(assets.find(asset => asset.path === assetPath).selected, false);
  assert.deepEqual(relatedDocuments.map(document => [document.path, document.selected]), [[relatedPath, false]]);
  assert.ok(issues.some(issue => issue.target === '配套资料'));
  assert.match(previewDigest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(await readdir(join(dataDir, 'rounds')), []);

  const info = { title: '定稿', reviewer: '邀请同事', expiresInHours: 24, paths: [sourcePath] };
  await write(sourcePath, markdown + '\n变更后的材料。');
  const stale = await post(external, { ...info, previewDigest }, author);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'preview_changed');
  assert.deepEqual(await readdir(join(dataDir, 'rounds')), []);

  const selected = { ...info, attachments: [assetPath], galleries: [galleryId, otherGalleryId] };
  const selectedPreview = await (await post(external + '/preview', selected, author)).json();
  assert.equal(selectedPreview.assets[0].selected, true);
  assert.equal(selectedPreview.galleries[0].id, galleryId);
  await write(galleryPage, galleryPageSource + '<p>预览之后出现的改动</p>');
  const staleGallery = await post(external, { ...selected, previewDigest: selectedPreview.previewDigest }, author);
  assert.equal(staleGallery.status, 409);
  assert.equal((await staleGallery.json()).code, 'preview_changed');
  await write(galleryPage, galleryPageSource);
  const created = await post(external, { ...selected, previewDigest: selectedPreview.previewDigest }, author);
  assert.equal(created.status, 201);
  const { review, invite } = await created.json();
  assert.equal(review.mode, 'snapshot');
  assert.equal(review.external, true);
  assert.deepEqual(review.documents.map(document => document.path), [sourcePath]);
  assert.equal(review.invites.length, 1);
  assert.equal(store.hasOpenExternalReviews(), true);
  const token = invite.url.split('#')[1];
  assert.match(token, /^[a-zA-Z0-9_-]{43}$/u);
  const listed = await (await get(external, author)).json();
  assert.equal(listed.reviews[0].id, review.id);
  assert.equal(listed.reviews[0].documents[0].blocks, undefined);
  assert.ok(!JSON.stringify(listed).includes(token));

  const guest = '/api/review/' + review.id;
  const data = await post(guest + '/session', { token }, { Origin: httpsOrigin });
  assert.equal(data.status, 200);
  assert.match(data.headers.get('set-cookie'), /HttpOnly; SameSite=Strict.*; Secure$/u);
  const guestHeaders = { Cookie: data.headers.get('set-cookie').split(';', 1)[0] };
  const galleryHref = review.galleries[0].href;
  const pageHref = review.galleries[0].pages[0].href;
  assert.equal(isGuestReviewPath(galleryHref), true);
  assert.equal((await get(galleryHref)).status, 401);
  assert.equal((await get(guest)).status, 401);
  assert.equal((await get(external + '/' + review.id, guestHeaders)).status, 403);

  await write(sourcePath, '# 新版\n\n这个变化不能通过评审泄漏');
  await write(galleryPage, '<!doctype html><title>变更后</title><p>不能泄漏的新图</p>');
  await write(assetPath, Buffer.from([0x00]));
  const view = await (await get(guest, guestHeaders)).json();
  const directGalleryHref = view.review.galleries[0].href;
  const directPageHref = view.review.galleries[0].pages[0].href;
  assert.ok(directGalleryHref.startsWith(guest + '/gallery-access/' + encodeURIComponent(galleryId) + '/' + invite.id + '.'));
  assert.equal(isGuestReviewPath(directPageHref), true);
  assert.ok(!JSON.stringify(view).includes(token));
  assert.equal(new URL('pages/图一.html', 'http://workbench.test' + directGalleryHref).pathname, directPageHref);
  const directPage = await get(directPageHref);
  assert.equal(directPage.status, 200);
  assert.match(await directPage.text(), /图子页原稿/u);
  assert.equal((await post(directPageHref, {})).status, 405);
  assert.equal((await get(directGalleryHref.replace(encodeURIComponent(galleryId), encodeURIComponent(otherGalleryId)))).status, 401);
  assert.equal((await get(directGalleryHref.replace(/\.[A-Za-z0-9_-]{43}\//u, '.' + 'a'.repeat(43) + '/'))).status, 401);
  assert.equal((await get(directGalleryHref.replace(/index\.html$/u, 'artifacts.json'))).status, 404);
  assert.deepEqual(view.review.documents.map(document => document.title), ['方案']);
  assert.equal(view.review.documents[0].path, undefined);
  assert.equal(view.review.assets[0].path, undefined);
  const body = view.review.documents[0].blocks.map(block => block.html).join('\n');
  assert.match(body, /需要评审的原文/u);
  assert.doesNotMatch(body, /配套资料\.md|未共享的秘密资料|outside\.example|不能通过评审/u);
  assert.ok(body.includes(directGalleryHref + '#' + encodeURIComponent('图一')));
  assert.ok(!body.includes(galleryHref));
  const assetResponse = await get(guest + '/assets/' + review.assets[0].id, guestHeaders);
  assert.deepEqual(new Uint8Array(await assetResponse.arrayBuffer()), Uint8Array.of(0x89, 0x50, 0x4e, 0x47));
  const page = await get(pageHref, guestHeaders);
  assert.match(page.headers.get('content-security-policy'), /sandbox allow-scripts/u);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /allow-same-origin/u);
  assert.match(await page.text(), /图子页原稿/u);
  assert.equal((await get(galleryHref.replace(/index\.html$/u, 'artifacts.json'), guestHeaders)).status, 404);

  const submissionId = 'guest-receipt';
  const { inviteId } = view.review;
  const submitted = await post(guest + '/submit', { id: submissionId, inviteId, decision: 'comment', summary: '意见', items: [] }, guestHeaders);
  assert.equal(submitted.status, 201);
  assert.deepEqual(deliveries, []);
  const secondInvite = await (await post(external + '/' + review.id + '/invites', { reviewer: '另一位同事' }, author)).json();
  const secondSession = await post(guest + '/session', { token: secondInvite.invite.url.split('#')[1] });
  const secondHeaders = { Cookie: secondSession.headers.get('set-cookie').split(';', 1)[0] };
  const secondView = await (await get(guest, secondHeaders)).json();
  assert.equal(secondView.submission, null);
  assert.notEqual(secondView.review.galleries[0].href, directGalleryHref);
  const duplicateId = await post(guest + '/submit', { id: submissionId, inviteId: secondView.review.inviteId,
    decision: 'comment', summary: '另一条意见', items: [] }, secondHeaders);
  assert.equal(duplicateId.status, 409);
  const savedReview = await (await get(external + '/' + review.id, author)).json();
  assert.equal(savedReview.review.submissions[0].id, submissionId);
  const dispatch = `/api/admin/reviews/${review.id}/submissions/${submissionId}/dispatch`;
  assert.equal((await post(dispatch, { targetClientId: 'codex-a' }, guestHeaders)).status, 403);
  assert.equal((await post(dispatch, { targetThreadId: 'fixture' }, author)).status, 400);
  assert.equal((await post(dispatch, { targetClientId: 'codex-a', targetThreadId: 'fixture' }, author)).status, 200);
  assert.deepEqual(deliveries[0].documentPaths, [sourcePath]);

  assert.equal((await post(external + '/' + review.id + '/invites/' + invite.id + '/revoke', {}, author)).status, 200);
  assert.equal((await get(galleryHref, guestHeaders)).status, 403);
  assert.equal((await get(directGalleryHref)).status, 403);
  const roundFile = join(dataDir, 'rounds', review.id, 'round.json');
  const record = JSON.parse(await readFile(roundFile, 'utf8'));
  record.invites.find(invite => invite.id === secondInvite.invite.id).expiresAt = '2000-01-01T00:00:00.000Z';
  await writeFile(roundFile, JSON.stringify(record));
  assert.equal((await get(secondView.review.galleries[0].href)).status, 403);
  assert.equal((await post(external + '/' + review.id + '/close', {}, author)).status, 200);
  assert.equal(store.hasOpenExternalReviews(), false);
  assert.equal((await get(guest, guestHeaders)).status, 403);
});

test('publication may be disabled while a paired author can still preview', async t => {
  const { get, post } = await fixture(t, { externalPublicationEnabled: false });
  const preview = await post(external + '/preview', { paths: [sourcePath] }, author);
  assert.equal(preview.status, 200);
  assert.equal((await get(external, author)).status, 200);
  const refused = await post(external, { paths: [sourcePath] }, author);
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).code, 'external_publication_disabled');
});

test('external reviews move to recoverable trash and can only be restored as closed', async t => {
  const { dataDir, store, get, post } = await fixture(t);
  const selection = { title: '可恢复的外部评审', reviewer: '访客', paths: [sourcePath], galleries: [galleryId] };
  const preview = await (await post(external + '/preview', selection, author)).json();
  const { review, invite } = await (await post(external, { ...selection, previewDigest: preview.previewDigest }, author)).json();
  const route = external + '/' + review.id;
  const guest = '/api/review/' + review.id;
  const guestPage = invite.url.split('#')[0];
  const token = invite.url.split('#')[1];
  const session = await post(guest + '/session', { token });
  const guestHeaders = { Cookie: session.headers.get('set-cookie').split(';', 1)[0] };
  const view = await (await get(guest, guestHeaders)).json();
  const galleryHref = view.review.galleries[0].href;
  const paper = { id: 'receipt-to-retain', inviteId: view.review.inviteId, decision: 'comment', summary: '回执保留', items: [] };
  assert.equal((await post(guest + '/submit', paper, guestHeaders)).status, 201);
  assert.equal((await get(galleryHref)).status, 200);
  assert.equal((await get(external + '/trash', guestHeaders)).status, 403);
  assert.equal((await post(route + '/trash', {}, guestHeaders)).status, 403);
  assert.equal((await post(route + '/restore', {}, guestHeaders)).status, 403);
  assert.equal((await post(route + '/restore', {}, author)).status, 404);

  const live = join(dataDir, 'rounds', review.id);
  const trash = join(dataDir, 'trash', 'rounds', review.id);
  const docs = join('snapshots', review.documents[0].id);
  const frozen = await readFile(join(live, docs));
  const [submission] = await readdir(join(live, 'submissions'));
  const saved = await readFile(join(live, 'submissions', submission));
  const dispatches = join(dataDir, 'dispatches', review.id);
  await mkdir(dispatches, { recursive: true });
  const dispatchRecord = join(dispatches, 'fixture-operation.json');
  await writeFile(dispatchRecord, 'Canned dispatch evidence');
  assert.equal(store.hasOpenExternalReviews(), true);

  assert.deepEqual(await (await post(route + '/trash', {}, author)).json(), { id: review.id });
  assert.deepEqual(await (await post(route + '/trash', {}, author)).json(), { id: review.id });
  assert.equal(store.hasOpenExternalReviews(), false);
  assert.deepEqual(await (await get(external, author)).json(), { reviews: [] });
  assert.equal((await get(route, author)).status, 404);
  assert.equal((await get(guestPage)).status, 404);
  assert.equal((await get(guest, guestHeaders)).status, 404);
  assert.equal((await get(galleryHref)).status, 404);
  assert.equal((await post(guest + '/session', { token })).status, 404);
  await assert.rejects(readFile(join(live, 'round.json')), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(trash, docs)), frozen);
  assert.deepEqual(await readFile(join(trash, 'submissions', submission)), saved);
  assert.deepEqual(await (await get(external + '/trash', author)).json(), { reviews: [
    { id: review.id, title: review.title, createdAt: review.createdAt, closedAt: null },
  ] });

  const restored = await (await post(route + '/restore', {}, author)).json();
  assert.ok(restored.review.closedAt);
  assert.equal(restored.review.id, review.id);
  assert.equal(restored.review.submissions[0].id, paper.id);
  assert.deepEqual(await (await post(route + '/restore', {}, author)).json(), restored);
  assert.equal(store.hasOpenExternalReviews(), false);
  assert.deepEqual(await readFile(join(live, docs)), frozen);
  assert.deepEqual(await readFile(join(live, 'submissions', submission)), saved);
  assert.equal(await readFile(dispatchRecord, 'utf8'), 'Canned dispatch evidence');
  await assert.rejects(readFile(join(trash, 'round.json')), { code: 'ENOENT' });
  assert.deepEqual(await (await get(external + '/trash', author)).json(), { reviews: [] });
  assert.equal((await post(guest + '/session', { token })).status, 403);
  assert.equal((await get(guest, guestHeaders)).status, 403);
  assert.equal((await get(galleryHref)).status, 403);
});

test('trash and restore preserve both records during collisions and refuse local and legacy reviews', async t => {
  const { dataDir, store, get, post } = await fixture(t);
  const legacy = store.create({ title: '旧评审', paths: [sourcePath] });
  const { review: direct } = store.openDirect(sourcePath);
  for (const id of [legacy.id, direct.id, 'not-a-round']) {
    assert.equal((await post(`${external}/${id}/trash`, {}, author)).status, 404);
    assert.equal((await post(`${external}/${id}/restore`, {}, author)).status, 404);
  }

  const selection = { title: '冲突评审', reviewer: '访客', paths: [sourcePath] };
  const preview = await (await post(external + '/preview', selection, author)).json();
  const { review } = await (await post(external, { ...selection, previewDigest: preview.previewDigest }, author)).json();
  const route = external + '/' + review.id;
  const live = join(dataDir, 'rounds', review.id);
  const trash = join(dataDir, 'trash', 'rounds', review.id);
  const original = await readFile(join(live, 'round.json'), 'utf8');

  await mkdir(trash, { recursive: true });
  assert.equal((await post(route + '/trash', {}, author)).status, 409);
  assert.equal((await post(route + '/restore', {}, author)).status, 409);
  assert.deepEqual(await (await get(external + '/trash', author)).json(), { reviews: [] });
  assert.deepEqual(await readdir(trash), []);
  assert.equal(await readFile(join(live, 'round.json'), 'utf8'), original);

  await cp(live, trash, { recursive: true });
  assert.equal((await post(route + '/trash', {}, author)).status, 409);
  assert.equal((await post(route + '/restore', {}, author)).status, 409);
  assert.equal(await readFile(join(live, 'round.json'), 'utf8'), original);
  assert.equal(await readFile(join(trash, 'round.json'), 'utf8'), original);
});

async function publishFixture(post, title, galleries = []) {
  const selection = { title, reviewer: '访客', paths: [sourcePath], galleries };
  const preview = await (await post(external + '/preview', selection, author)).json();
  const created = await post(external, { ...selection, previewDigest: preview.previewDigest }, author);
  assert.equal(created.status, 201);
  return created.json();
}

test('permanent purge removes only selected valid trash rounds and preserves source and dispatch history', async t => {
  const { dataDir, get, post, markdown } = await fixture(t);
  const { review, invite } = await publishFixture(post, '首个清理目标', [galleryId]);
  const { review: second } = await publishFixture(post, '第二个清理目标');
  const { review: unselected } = await publishFixture(post, '不清理');
  const { review: active } = await publishFixture(post, '仍在列表');
  const guest = '/api/review/' + review.id;
  const token = invite.url.split('#')[1];
  const session = await post(guest + '/session', { token });
  const guestHeaders = { Cookie: session.headers.get('set-cookie').split(';', 1)[0] };
  const view = await (await get(guest, guestHeaders)).json();
  const signedGallery = view.review.galleries[0].href;
  const receipt = { id: 'verified-receipt', inviteId: view.review.inviteId, decision: 'comment', summary: '评审意见', items: [] };
  assert.equal((await post(guest + '/submit', receipt, guestHeaders)).status, 201);
  const dispatchDir = join(dataDir, 'dispatches', review.id);
  const dispatchFile = join(dispatchDir, 'operation.json');
  await mkdir(dispatchDir, { recursive: true });
  await writeFile(dispatchFile, 'fixture routing identifiers');

  for (const round of [review, second, unselected]) {
    assert.equal((await post(`${external}/${round.id}/trash`, {}, author)).status, 200);
  }
  const purge = external + '/trash/purge';
  assert.equal((await post(purge, { ids: [review.id] }, guestHeaders)).status, 403);
  assert.equal((await post(purge, { ids: [review.id] }, { ...author, Origin: 'http://foreign.example' })).status, 403);
  assert.equal((await post(purge, { ids: [review.id, '../rounds/' + second.id] }, author)).status, 400);
  assert.equal((await post(purge, { ids: [review.id], all: true }, author)).status, 400);
  assert.equal((await post(purge, { ids: [] }, author)).status, 400);
  assert.equal((await (await get(external + '/trash', author)).json()).reviews.length, 3);

  const deleted = await post(purge, { ids: [review.id, active.id, second.id, review.id] }, author);
  assert.equal(deleted.status, 200);
  const result = await deleted.json();
  assert.deepEqual(result.deletedIds, [review.id, second.id]);
  assert.deepEqual(result.failures.map(({ id }) => id), [active.id]);
  assert.match(result.failures[0].message, /先移入回收站/u);
  const remaining = await (await get(external + '/trash', author)).json();
  assert.deepEqual(remaining.reviews.map(({ id }) => id), [unselected.id]);
  assert.equal((await get(`${external}/${active.id}`, author)).status, 200);
  assert.equal((await post(`${external}/${review.id}/restore`, {}, author)).status, 404);
  assert.equal((await get(guest, guestHeaders)).status, 404);
  assert.equal((await get(signedGallery)).status, 404);
  assert.equal((await post(guest + '/session', { token })).status, 404);
  for (const id of result.deletedIds) {
    await assert.rejects(readdir(join(dataDir, 'trash', 'rounds', id)), { code: 'ENOENT' });
  }
  assert.equal(await readFile(join(dirname(dataDir), sourcePath), 'utf8'), markdown);
  assert.equal(await readFile(dispatchFile, 'utf8'), 'fixture routing identifiers');
  assert.deepEqual(await (await post(purge, { ids: [unselected.id] }, author)).json(), { deletedIds: [unselected.id], failures: [] });
  assert.deepEqual((await (await post(purge, { ids: [unselected.id] }, author)).json()).deletedIds, []);
});

test('permanent purge refuses collisions, corrupt records, non-external rounds and redirected trash roots', async t => {
  const { dataDir, store, post } = await fixture(t);
  const { review: collision } = await publishFixture(post, '重复记录');
  const { review: relocated } = await publishFixture(post, '非原目录');
  const legacy = store.create({ title: '旧评审', paths: [sourcePath] });
  const { review: direct } = store.openDirect(sourcePath);
  const active = join(dataDir, 'rounds');
  const trash = join(dataDir, 'trash', 'rounds');
  const corrupt = randomUUID();
  await mkdir(join(trash, corrupt), { recursive: true });
  await cp(join(active, collision.id), join(trash, collision.id), { recursive: true });
  await rename(join(active, legacy.id), join(trash, legacy.id));
  await rename(join(active, direct.id), join(trash, direct.id));

  const purge = external + '/trash/purge';
  const ids = [collision.id, corrupt, legacy.id, direct.id];
  const refused = await (await post(purge, { ids }, author)).json();
  assert.deepEqual(refused.deletedIds, []);
  assert.deepEqual(refused.failures.map(({ id }) => id), ids);
  assert.deepEqual(new Set(await readdir(trash)), new Set(ids));
  assert.equal((await readFile(join(active, collision.id, 'round.json'), 'utf8')),
    await readFile(join(trash, collision.id, 'round.json'), 'utf8'));

  assert.equal((await post(`${external}/${relocated.id}/trash`, {}, author)).status, 200);
  const other = join(dataDir, 'redirected-rounds');
  await rename(trash, other);
  await symlink(other, trash);
  const redirected = await (await post(purge, { ids: [relocated.id] }, author)).json();
  assert.deepEqual(redirected.deletedIds, []);
  assert.match(redirected.failures[0].message, /位置无法核验/u);
  assert.ok(await readFile(join(other, relocated.id, 'round.json'), 'utf8'));
});

test('implicit loopback administration cannot permanently purge external reviews', async t => {
  const { dataDir, store, post } = await fixture(t, { canManage: undefined });
  const { review } = await publishFixture(post, '尚未配对');
  store.trashExternal(review.id);
  const denied = await post(external + '/trash/purge', { ids: [review.id] }, author);
  assert.equal(denied.status, 403);
  assert.ok(await readFile(join(dataDir, 'trash', 'rounds', review.id, 'round.json'), 'utf8'));
});
