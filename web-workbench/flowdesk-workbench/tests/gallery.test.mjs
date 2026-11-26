import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, get as httpGet } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createGalleryHandler } from '../gallery.mjs';

const index = '<a href="pages/overview.html">Overview</a><a href="pages/alias.html">Alias</a>';
const overview = '<h1>Overview</h1>';
const privateContent = 'Private fixture content';

async function startFixture(t, indexContent = index, options) {
  const temp = await mkdtemp(join(tmpdir(), 'flowdesk-gallery-test-'));
  const gallery = join(temp, 'gallery');
  let server;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  await mkdir(join(gallery, 'pages'), { recursive: true });
  await mkdir(join(gallery, 'source'));
  const externalPage = join(temp, 'external.html');
  await Promise.all([
    writeFile(join(gallery, 'index.html'), indexContent),
    writeFile(join(gallery, 'pages', 'overview.html'), overview),
    writeFile(join(gallery, 'pages', 'physical.html'), privateContent),
    writeFile(join(gallery, 'artifacts.json'), privateContent),
    writeFile(join(gallery, 'source', 'overview.html'), privateContent),
    writeFile(externalPage, privateContent),
  ]);
  await symlink(externalPage, join(gallery, 'pages', 'alias.html'));

  server = createServer(await createGalleryHandler(gallery, options));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, get: (path, options) => fetch(origin + path, options) };
}

test('serves the gallery entry and a linked subpage as read-only HTML', async t => {
  const { get } = await startFixture(t);
  for (const [path, body] of [['/', index], ['/index.html', index], ['/pages/overview.html', overview]]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /^text\/html\b/, path);
    assert.equal(await response.text(), body, path);
  }

  const head = await get('/pages/overview.html', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');

  const post = await get('/pages/overview.html', { method: 'POST' });
  assert.equal(post.status, 405);
  await post.text();
});

test('mounted galleries accept the workbench host and retain their sandbox', async t => {
  const { get, origin } = await startFixture(t, index, { mounted: true });
  const root = await get('/gallery', { redirect: 'manual' });
  assert.equal(root.status, 308);
  assert.equal(root.headers.get('location'), '/gallery/');
  await root.text();

  const page = await new Promise((resolve, reject) => {
    httpGet(origin + '/gallery/pages/overview.html', { agent: false, headers: { Host: 'workbench.local' } }, resolve).on('error', reject);
  });
  const body = await Array.fromAsync(page).then(chunks => Buffer.concat(chunks).toString());
  assert.equal(page.statusCode, 200);
  assert.match(page.headers['content-security-policy'], /sandbox allow-scripts/u);
  assert.equal(body, overview);
});

test('keeps workbench routes, unlinked files, and symlink targets outside the gallery', async t => {
  const { get } = await startFixture(t);
  const paths = ['/api/workbench', '/artifacts.json', '/source/overview.html', '/pages/physical.html', '/pages/alias.html'];
  for (const path of paths) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.ok(!(await response.text()).includes(privateContent), path);
  }
});

const generatedVerifier = `
async function checkedText(bytes, sha, size) {
  if (!crypto.subtle || !/^[a-f0-9]{64}$/.test(sha)) throw new Error('Digest verification unavailable');
  if (size !== undefined && bytes.length !== size) throw new Error('Byte count mismatch');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== sha) throw new Error('Payload digest mismatch');
  return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}`;

function moduleUrl(source) {
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
}

test('plain HTTP fallback verifies generated gallery payloads with SHA-256', async t => {
  const { get } = await startFixture(t, '<script>' + generatedVerifier + '</script>');
  const html = await (await get('/')).text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(script, /if \(!crypto\.subtle/);
  assert.match(script, /crypto\.subtle \? .*import\('\/gallery-sha256\.mjs'\)/);

  const response = await get('/gallery-sha256.mjs');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/javascript\b/);
  const fallback = moduleUrl(await response.text());
  // Resolve the served module in Node while simulating an HTTP page without subtle crypto.
  const { checkedText } = await import(moduleUrl(
    'const crypto = {};\nexport ' + script.replace("'/gallery-sha256.mjs'", JSON.stringify(fallback)),
  ));
  const title = 'NiuSaaS 图集';
  const bytes = new TextEncoder().encode(title);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(await checkedText(bytes, digest, bytes.length), title);
  await assert.rejects(checkedText(bytes, '0'.repeat(64), bytes.length), /Payload digest mismatch/);
  await assert.rejects(checkedText(bytes, digest, bytes.length - 1), /Byte count mismatch/);
});

test('leaves unrecognized gallery verifiers intact and exposes no fallback module', async t => {
  const unrecognized = '<script>' + generatedVerifier.replace('const hash = ', 'const hash=') + '</script>';
  const { get } = await startFixture(t, unrecognized);
  assert.equal(await (await get('/')).text(), unrecognized);
  const response = await get('/gallery-sha256.mjs');
  assert.equal(response.status, 404);
  await response.text();
});
