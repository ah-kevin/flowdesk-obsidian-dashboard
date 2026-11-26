import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import MarkdownIt from 'markdown-it';
import { createReaderImages, readerImagesRoute } from '../reader-images.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF90AAAAASUVORK5CYII=', 'base64');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const note = 'Notes/Docs/手册.md';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'flowdesk-reader-images-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vault = join(root, 'vault');
  const put = (path, bytes = png) => {
    const target = join(vault, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return target;
  };
  const screenshot = put('Attachments/手册/界面 截图 (1).png');
  put('Attachments/手册/唯一图.png');
  put('Attachments/手册/重复.png');
  put('Notes/Docs/assets/就地.png');
  put('Notes/Plans/media/重复.png');
  put('Notes/Docs/裸露.png');
  put('Attachments/archify/主题/预览.png');
  put('Attachments/.private/未发布图.png');
  put('Attachments/source/草稿图.png');
  put('Attachments/手册/临时.tmp.png');
  put('Attachments/手册/伪图.png', '<html><script>alert(1)</script></html>');
  put('Attachments/手册/echo.svg', '<svg><script>unsafe</script></svg>');
  put('Attachments/手册/截断.png', png.subarray(0, 33));
  truncateSync(put('Attachments/手册/过大.png'), 25 * 1024 * 1024 + 1);
  put('Attachments/手册/动画.gif', gif);
  const outside = join(root, 'outside.png');
  writeFileSync(outside, png);
  symlinkSync(outside, join(vault, 'Attachments/手册/外部别名.png'));
  symlinkSync(screenshot, join(vault, 'Attachments/手册/内部别名.png'));
  symlinkSync(join(vault, 'Attachments/手册'), join(vault, 'Attachments/目录别名'));
  return { vault, screenshot, outside };
}

test('resolves exact local Markdown and Obsidian paths and only unique bare embeds', t => {
  const { vault } = fixture(t);
  const images = createReaderImages(vault);
  const md = new MarkdownIt({ html: false });
  const source = '![界面](<../../Attachments/手册/界面 截图 \\(1\\).png>)';
  const inline = md.parse(source, {}).find(token => token.type === 'inline');
  const encoded = inline.children.find(token => token.type === 'image').attrGet('src');
  const result = images.resolve(note, encoded);
  assert.match(result.href, /^\/api\/reader-images\/[a-f0-9]{64}$/u);
  assert.equal(result.href, images.resolve(note, 'Attachments/手册/界面%20截图%20(1).png', { wiki: true }).href);
  assert.equal(result.href, images.resolve(note, '../../Attachments/手册/界面\\ 截图 \\(1\\).png').href);
  assert.ok(images.resolve(note, 'assets/就地.png'));
  assert.ok(images.resolve(note, '唯一图.png', { wiki: true }));
  assert.equal(images.resolve(note, '唯一图.png'), null);
  assert.equal(images.resolve(note, '重复.png', { wiki: true }), null);
  assert.ok(images.resolve(note, 'Attachments/手册/重复.png', { wiki: true }));
  assert.ok(images.resolve(note, 'Notes/Plans/media/重复.png', { wiki: true }));
});

test('ignores live Archify, raw paths outside image areas, symlinks, and malformed files', t => {
  const { vault } = fixture(t);
  const images = createReaderImages(vault);
  for (const target of [
    '/Attachments/手册/唯一图.png', 'https://example.test/image.png', '//example.test/image.png', 'data:image/png;base64,aaa',
    'Attachments/%2e%2e/Notes/Docs/assets/就地.png', '../../Attachments/source/../手册/唯一图.png',
    '../../Attachments%2F手册/唯一图.png', '../../../outside.png', 'Attachments/手册/%ZZ.png',
    'Attachments/手册/外部别名.png', 'Attachments/手册/内部别名.png', 'Attachments/目录别名/唯一图.png',
    'Attachments/手册/过大.png', 'Attachments/手册/伪图.png', 'Attachments/手册/截断.png',
    'Attachments/手册/echo.svg', 'Attachments/手册/临时.tmp.png', 'Attachments/source/草稿图.png',
    'Attachments/archify/主题/预览.png', 'Attachments/.private/未发布图.png', 'Notes/Docs/裸露.png',
  ]) {
    assert.equal(images.resolve(note, target, { wiki: true }), null, target);
  }
});

test('GET and HEAD return registered raster bytes with no-store and recheck their scope at request time', async t => {
  const { vault, screenshot, outside } = fixture(t);
  const images = createReaderImages(vault);
  const { href } = images.resolve(note, 'Attachments/手册/界面 截图 (1).png');
  const animated = images.resolve(note, 'Attachments/手册/动画.gif').href;
  const server = createServer((request, response) => {
    images.serveReaderImage(request, response, request.url).catch(() => {
      if (response.headersSent) response.destroy();
      else response.writeHead(500).end();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const image = await fetch(origin + href);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('cache-control'), 'private, no-store');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.match(image.headers.get('content-security-policy'), /default-src 'none'/u);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);

  const head = await fetch(origin + animated, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'image/gif');
  assert.equal(head.headers.get('content-length'), String(gif.length));
  assert.equal(await head.text(), '');
  assert.equal((await fetch(origin + href, { method: 'POST' })).status, 405);
  assert.equal((await fetch(origin + readerImagesRoute + '0'.repeat(64))).status, 404);
  assert.equal((await fetch(origin + readerImagesRoute + 'Attachments/手册/唯一图.png')).status, 404);

  rmSync(screenshot);
  symlinkSync(outside, screenshot);
  assert.equal((await fetch(origin + href)).status, 404);
});
