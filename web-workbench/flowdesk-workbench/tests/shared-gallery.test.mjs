import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { createGalleryCatalog } from '../gallery.mjs';
import { captureSharedGalleries, serveSharedGallery, sharedGalleryAsset, writeSharedGalleries } from '../shared-gallery.mjs';

const galleryId = '操作 图集';
const memberPage = 'pages/公开步骤.html';
const memberImage = 'figures/示意.svg';
const galleryRoot = 'Attachments/archify';
const generatedVerifier = `async function checkedText(bytes, sha, size) {
  if (!crypto.subtle || !/^[a-f0-9]{64}$/.test(sha)) throw new Error('Digest verification unavailable');
  if (size !== undefined && bytes.length !== size) throw new Error('Byte count mismatch');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== sha) throw new Error('Payload digest mismatch');
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}`;
const indexBody = '<html><head><title>操作图集</title></head><body><script>' + generatedVerifier + '</script></body></html>';
const memberBody = '<p>Frozen shared diagram</p>';
const imageBody = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'flowdesk-shared-gallery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vault = join(root, 'vault');
  const roundDir = join(root, 'round');
  const sourceDirectory = join(vault, galleryRoot, galleryId);
  const put = (path, bytes) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  };
  mkdirSync(roundDir);
  put(join(sourceDirectory, 'index.html'), indexBody);
  put(join(sourceDirectory, memberPage), memberBody);
  put(join(sourceDirectory, memberImage), imageBody);
  put(join(sourceDirectory, 'pages/unapproved.html'), '<p>not selected by catalog</p>');
  put(join(sourceDirectory, 'source/editable.html'), 'private');
  put(join(sourceDirectory, 'TMP/hidden.html'), 'private');
  put(join(sourceDirectory, '.meta/evidence/receipt.html'), 'private');
  put(join(sourceDirectory, 'example.archify-original.html'), 'private');
  put(join(sourceDirectory, 'artifacts.json'), '{}');
  put(join(vault, galleryRoot, 'other/index.html'), '<p>Not selected</p>');
  put(join(root, 'outside.html'), '<p>Outside vault</p>');
  symlinkSync(join(root, 'outside.html'), join(sourceDirectory, 'pages/alias.html'));
  const catalog = await createGalleryCatalog(realpathSync(vault))([], []);
  catalog.files.delete(galleryRoot + '/' + galleryId + '/pages/unapproved.html');
  return { vault, roundDir, catalog, sourceDirectory };
}

test('freezes only selected, catalog-approved regular files and records relative digests', async t => {
  const { vault, roundDir, catalog, sourceDirectory } = await fixture(t);
  const capture = captureSharedGalleries({ vault, catalog, ids: [galleryId, galleryId] });
  assert.equal(capture.groups.length, 1);
  const group = capture.groups[0];
  assert.equal(group.id, galleryId);
  assert.equal(group.entryPath, 'index.html');
  assert.deepEqual(group.pages.map(page => page.path), [memberPage]);
  assert.deepEqual(group.files.map(file => file.path).sort(), [memberImage, 'index.html', memberPage].sort());
  assert.equal(capture.totalBytes, Buffer.byteLength(indexBody + memberBody + imageBody));
  const metadata = writeSharedGalleries(roundDir, capture);
  assert.ok(metadata[0].files.every(file => !Object.hasOwn(file, 'bytes')));
  assert.doesNotMatch(JSON.stringify(metadata), /Attachments\/archify|private|outside/);

  writeFileSync(join(sourceDirectory, memberPage), 'Current edited bytes');
  const member = sharedGalleryAsset(roundDir, metadata, galleryId, encodePath(memberPage));
  assert.equal(readFileSync(member.path, 'utf8'), memberBody);
  assert.equal(member.sha256, createHash('sha256').update(memberBody).digest('hex'));
  for (const forbidden of ['pages/unapproved.html', 'source/editable.html', 'TMP/hidden.html', 'pages/alias.html',
    '.meta/evidence/receipt.html', 'example.archify-original.html', 'artifacts.json', '%2e%2e/index.html',
    'pages%2f%E5%85%AC%E5%BC%80%E6%AD%A5%E9%AA%A4.html', '%00.html', 'pages/%ZZ.html']) {
    assert.equal(sharedGalleryAsset(roundDir, metadata, galleryId, forbidden), null, forbidden);
  }
  assert.equal(sharedGalleryAsset(roundDir, metadata, 'other', 'index.html'), null);
  assert.throws(() => captureSharedGalleries({ vault, catalog, ids: ['missing'] }), { status: 404 });
  assert.throws(() => captureSharedGalleries({ vault, catalog, ids: ['../other'] }), { status: 400 });
});

test('rejects a catalog member swapped to a symlink before capture', async t => {
  const fixtureState = await fixture(t);
  const target = join(fixtureState.sourceDirectory, memberPage);
  rmSync(target);
  symlinkSync(join(fixtureState.sourceDirectory, 'index.html'), target);
  assert.throws(() => captureSharedGalleries({ ...fixtureState, ids: [galleryId] }), { status: 409 });
});

test('serves frozen gallery pages with a scoped opaque sandbox and a working HTTP digest fallback', async t => {
  const { vault, roundDir, catalog } = await fixture(t);
  const metadata = writeSharedGalleries(roundDir, captureSharedGalleries({ vault, catalog, ids: [galleryId] }));
  const routePrefix = '/api/review/sample/galleries/' + encodeURIComponent(galleryId) + '/';
  const server = createServer((request, response) => {
    const relativePath = request.url.slice(routePrefix.length);
    const asset = request.url.startsWith(routePrefix) && sharedGalleryAsset(roundDir, metadata, galleryId, relativePath);
    response.setHeader('X-Frame-Options', 'DENY');
    serveSharedGallery(request, response, asset, { routePrefix }).catch(() => response.writeHead(500).end());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(origin + routePrefix + 'index.html');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  const policy = response.headers.get('content-security-policy');
  assert.match(policy, /sandbox allow-scripts allow-downloads allow-popups/);
  assert.match(policy, /connect-src 'none'/);
  assert.ok(policy.includes(origin + routePrefix));
  assert.doesNotMatch(policy, /allow-same-origin|unsafe-eval|\/gallery\/collections/);

  const html = await response.text();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map(match => match[1]);
  const context = createContext({ crypto: {}, TextDecoder });
  runInContext('globalThis.window = globalThis;', context);
  for (const script of scripts) runInContext(script, context);
  const bytes = new TextEncoder().encode('画廊');
  const sha = createHash('sha256').update(bytes).digest('hex');
  assert.equal(await context.checkedText(bytes, sha, bytes.length), '画廊');
  await assert.rejects(context.checkedText(bytes, '0'.repeat(64), bytes.length), /digest mismatch/i);
  assert.match(readFileSync(join(roundDir, 'galleries', galleryId, 'index.html'), 'utf8'), /!crypto\.subtle/);

  const memberResponse = await fetch(origin + routePrefix + encodePath(memberPage));
  assert.equal(await memberResponse.text(), memberBody);
  const head = await fetch(origin + routePrefix + 'index.html', { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), response.headers.get('content-length'));
  assert.equal(await head.text(), '');
  const img = await fetch(origin + routePrefix + encodePath(memberImage));
  assert.match(img.headers.get('content-security-policy'), /script-src 'none'/);
  assert.equal(await img.text(), imageBody);

  const member = sharedGalleryAsset(roundDir, metadata, galleryId, encodePath(memberPage));
  writeFileSync(member.path, 'x'.repeat(member.size));
  assert.equal((await fetch(origin + routePrefix + encodePath(memberPage))).status, 404);
  assert.equal((await fetch(origin + routePrefix + 'source/editable.html')).status, 404);
});
