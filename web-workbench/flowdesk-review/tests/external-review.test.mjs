import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
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
    store, standalone: false, externalReviewEnabled: true, ...options,
    canManage: request => request.headers.cookie === author.Cookie,
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
