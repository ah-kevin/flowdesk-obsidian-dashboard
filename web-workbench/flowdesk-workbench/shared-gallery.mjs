import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, join, posix, relative } from 'node:path';

const galleryRoot = 'Attachments/archify';
const snapshotDirectory = 'galleries';
const maximumSelections = 20;
const maximumFiles = 256;
const maximumFileBytes = 32 * 1024 * 1024;
const maximumCaptureBytes = 100 * 1024 * 1024;
const excludedDirectories = new Set(['tmp', 'reference', 'source']);
const htmlType = 'text/html; charset=utf-8';
const mimeByExtension = new Map([
  ['.html', htmlType], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp'],
  ['.avif', 'image/avif'], ['.svg', 'image/svg+xml'],
]);

function failure(status, message) {
  return Object.assign(new Error(message), { status });
}

function safeSegment(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 255 && !name.startsWith('.')
    && !/[:/\\\x00-\x1f\x7f]/u.test(name);
}

function allowedDirectory(name) {
  return safeSegment(name) && !excludedDirectories.has(name.toLowerCase());
}

function sharedFileType(parts) {
  const name = parts.at(-1);
  if (!safeSegment(name) || !parts.slice(0, -1).every(allowedDirectory)
    || /\.archify-original\.html$|残留/iu.test(parts.join('/'))) return null;
  return mimeByExtension.get(posix.extname(name).toLowerCase()) ?? null;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readGallerySource(expected, remainingBytes) {
  let descriptor;
  try {
    const actual = realpathSync(expected);
    if (actual.normalize('NFC') !== expected.normalize('NFC')) {
      throw failure(409, '图集文件路径已变化，请刷新资料清单。');
    }
    descriptor = openSync(actual, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw failure(409, '图集项不是可共享的普通文件。');
    if (before.size > maximumFileBytes || before.size > remainingBytes) {
      throw failure(413, '已选图集超过可共享的文件大小上限。');
    }
    const bytes = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!count) throw failure(409, '图集文件在冻结期间发生变更，请重试。');
      offset += count;
    }
    const after = fstatSync(descriptor);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw failure(409, '图集文件在冻结期间发生变更，请重试。');
    }
    return bytes;
  } catch (error) {
    if (error.status) throw error;
    if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM'].includes(error.code)) {
      throw failure(409, '图集文件已移动或不可读取，请刷新资料清单。');
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function catalogMembers(catalog, id) {
  const prefix = galleryRoot + '/' + id.normalize('NFC') + '/';
  const members = [];
  for (const member of catalog.files.values()) {
    if (typeof member?.path !== 'string' || member.collection?.normalize('NFC') !== id.normalize('NFC')) continue;
    const normalized = member.path.normalize('NFC');
    if (!normalized.startsWith(prefix)) continue;
    const path = normalized.slice(prefix.length);
    const mime = sharedFileType(path.split('/'));
    if (mime && member.type === mime) members.push({ member, path, mime });
  }
  return members;
}

export function captureSharedGalleries({ vault, catalog, ids = [] }) {
  if (!Array.isArray(ids) || ids.length > maximumSelections || !ids.every(allowedDirectory)) {
    throw failure(400, '请选择有效的图集，每轮最多选择 20 个。');
  }
  if (!ids.length) return { groups: [], totalBytes: 0 };
  if (!catalog || !Array.isArray(catalog.galleries) || !(catalog.files instanceof Map)) {
    throw failure(503, '图集目录暂不可用。');
  }
  const root = realpathSync(vault);
  const groups = [];
  const selected = new Set(ids.map(id => id.normalize('NFC')));
  let totalBytes = 0;
  let filesCount = 0;

  for (const id of selected) {
    const gallery = catalog.galleries.find(candidate => candidate.id.normalize('NFC') === id);
    if (!gallery) throw failure(404, '所选图集已不在可共享目录中。');
    const files = [];
    const pages = [];
    let entryPath = null;
    const members = catalogMembers(catalog, id);
    const galleryPages = new Map((gallery.pages ?? []).map(page => [page.href, page.title]));
    const included = new Set();
    for (const { member, path, mime } of members) {
      if (included.has(path)) throw failure(409, '图集包含重名文件，无法安全冻结。');
      included.add(path);
      filesCount++;
      if (filesCount > maximumFiles) throw failure(413, '已选图集包含过多的文件。');
      const bytes = readGallerySource(join(root, member.path), maximumCaptureBytes - totalBytes);
      totalBytes += bytes.length;
      files.push({ path, mime, size: bytes.length, sha256: sha256(bytes), bytes });
      if (mime !== htmlType) continue;
      if (member.isEntry) entryPath = path;
      else pages.push({ title: galleryPages.get(member.href) || member.title || posix.basename(path), path });
    }
    if (!entryPath && pages.length === 1) entryPath = pages[0].path;
    if (!entryPath && pages.length === 0) throw failure(409, '所选图集没有可共享的页面。');
    pages.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN', { numeric: true }));
    groups.push({ id, title: gallery.title || id, entryPath, pages, files });
  }
  return { groups, totalBytes };
}

export function writeSharedGalleries(stagedRoundDir, capture) {
  const directory = join(stagedRoundDir, snapshotDirectory);
  return capture.groups.map(({ files, ...gallery }) => {
    const groupPath = join(directory, gallery.id);
    return {
      ...gallery,
      files: files.map(({ path, bytes, ...file }) => {
        const target = join(groupPath, path);
        mkdirSync(dirname(target), { mode: 0o700, recursive: true });
        writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' });
        return { path, ...file };
      }),
    };
  });
}

export function sharedGalleryAsset(roundDir, galleries, id, encodedRelativePath) {
  if (!allowedDirectory(id) || typeof encodedRelativePath !== 'string' || encodedRelativePath.length > 4096) return null;
  let parts;
  try {
    parts = encodedRelativePath.split('/').map(part => decodeURIComponent(part).normalize('NFC'));
  } catch {
    return null;
  }
  const mime = sharedFileType(parts);
  if (!mime) return null;
  const gallery = Array.isArray(galleries) && galleries.find(entry => entry?.id === id.normalize('NFC'));
  const relativePath = parts.join('/');
  const file = Array.isArray(gallery?.files) && gallery.files.find(entry => entry?.path === relativePath && entry.mime === mime);
  if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > maximumFileBytes
    || !/^[a-f0-9]{64}$/u.test(file.sha256)) return null;
  return {
    path: join(roundDir, snapshotDirectory, gallery.id, relativePath), roundDir,
    mime, sha256: file.sha256, size: file.size, isEntry: gallery.entryPath === relativePath,
  };
}

let hashScript;
function compatibleGalleryEntry(bytes) {
  const html = bytes.toString('utf8');
  const guard = 'if (!crypto.subtle || !/^[a-f0-9]{64}$/.test(sha))';
  const digest = "Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')";
  const digestLine = 'const hash = ' + digest + ';';
  if (!html.includes(guard) || !html.includes(digestLine)) return bytes;
  // The workbench's Archify collection verifier also uses this fallback on plain HTTP.
  hashScript ??= readFileSync(new URL(import.meta.resolve('js-sha256/build/sha256.min.js')), 'utf8');
  const script = '<script>' + hashScript.replace(/<\/script/gi, '<\\/script') + '</script>';
  const compatible = html.replace(guard, 'if (!/^[a-f0-9]{64}$/.test(sha))')
    .replace(digestLine, 'const hash = crypto.subtle ? ' + digest + ' : globalThis.sha256(bytes);');
  return Buffer.from(/<head\b[^>]*>/i.test(compatible)
    ? compatible.replace(/<head\b[^>]*>/i, head => head + script) : script + compatible);
}

function galleryPolicy(request, routePrefix, interactive) {
  const host = request.headers.host;
  const scoped = /^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?$/iu.test(host ?? '')
    && typeof routePrefix === 'string' && /^\/api\/[A-Za-z0-9%._~!'()*+/-]+\/$/u.test(routePrefix)
    ? ` http://${host}${routePrefix} https://${host}${routePrefix}` : '';
  return [
    "default-src 'none'",
    "connect-src 'none'",
    interactive ? "sandbox allow-scripts allow-downloads allow-popups" : 'sandbox',
    interactive ? "script-src 'unsafe-inline'" : "script-src 'none'",
    "style-src 'unsafe-inline'" + scoped,
    'img-src data: blob:' + scoped,
    'font-src data:' + scoped,
    'media-src data: blob:' + scoped,
    interactive ? 'frame-src about: blob:' + scoped : "frame-src 'none'",
    'base-uri' + (scoped || " 'none'"),
    "frame-ancestors 'self'",
    "form-action 'none'",
  ].join('; ');
}

export async function serveSharedGallery(request, response, asset, { routePrefix } = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response.writeHead(405, { Allow: 'GET, HEAD' }).end();
  if (!asset) return response.writeHead(404).end();
  let file;
  try {
    const expected = join(await realpath(asset.roundDir), relative(asset.roundDir, asset.path));
    const actual = await realpath(expected);
    if (actual.normalize('NFC') !== expected.normalize('NFC')) return response.writeHead(404).end();
    file = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!info.isFile() || info.size !== asset.size) return response.writeHead(404).end();
    const bytes = await file.readFile();
    if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256) return response.writeHead(404).end();
    const interactive = asset.mime === htmlType;
    const body = interactive && asset.isEntry ? compatibleGalleryEntry(bytes) : bytes;
    response.writeHead(200, {
      'Content-Type': asset.mime, 'Content-Length': body.length,
      'Content-Security-Policy': galleryPolicy(request, routePrefix, interactive),
      'X-Frame-Options': 'SAMEORIGIN', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Cache-Control': 'private, no-store',
    });
    return response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM'].includes(error.code)) return response.writeHead(404).end();
    throw error;
  } finally {
    await file?.close().catch(() => {});
  }
}
