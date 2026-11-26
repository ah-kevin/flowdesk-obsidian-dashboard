import { createHash } from 'node:crypto';
import { closeSync, constants, createReadStream, fstatSync, openSync, readSync, readdirSync, realpathSync } from 'node:fs';
import { join, posix } from 'node:path';
import { pipeline } from 'node:stream/promises';

export const readerImagesRoute = '/api/reader-images/';
const imageTypes = new Map([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.avif', 'image/avif'],
]);
const mediaFolders = new Set(['assets', 'attachments', 'images', 'media', 'screenshots']);
const excludedDirectories = new Set(['archify', 'tmp', 'reference', 'source']);
const noteRoots = ['Notes/Docs', 'Notes/Plans'];
const scanRoots = ['Attachments', ...noteRoots];
const missing = new Set(['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM']);
const maximumFileBytes = 25 * 1024 * 1024;
const maximumNamedEntries = 10_000;
const maximumPublished = 4096;
const filenameIndexLifetime = 6000;
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

function safePart(name) {
  return Boolean(name && !name.startsWith('.') && !/[:/\\\x00-\x1f\x7f]/u.test(name));
}

function safeDirectory(name) {
  return safePart(name) && !excludedDirectories.has(name.toLowerCase());
}

function allowedImageType(path) {
  const parts = path.split('/');
  const filename = parts.at(-1);
  const directories = parts.slice(0, -1);
  if (!safePart(filename) || !directories.every(safeDirectory)
    || /\.(?:archify-original|tmp|temp)\.[^.]+$|残留/u.test(filename)) return null;
  const inAttachments = parts[0] === 'Attachments' && parts.length >= 2;
  const inNoteMedia = noteRoots.includes(parts.slice(0, 2).join('/'))
    && directories.slice(2).some(name => mediaFolders.has(name.toLowerCase()));
  if (!inAttachments && !inNoteMedia) return null;
  return imageTypes.get(posix.extname(filename).toLowerCase()) ?? null;
}

function localReference(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) return null;
  try {
    const escaped = value.trim().replace(/\\([ ()\[\]#?])/gu, (_whole, part) => encodeURIComponent(part));
    const encoded = escaped.split(/[?#]/u, 1)[0];
    if (/%(?:2f|5c|00)/iu.test(encoded)) return null;
    const decoded = decodeURIComponent(encoded);
    if (!decoded || decoded.startsWith('/') || /[:\\\x00-\x1f\x7f]/u.test(decoded)) return null;
    const parts = decoded.split('/');
    const raw = encoded.split('/');
    if (parts.some((part, index) => (part === '.' || part === '..') && part !== raw[index])) return null;
    if (parts.slice(0, -1).some(part => part !== '.' && part !== '..' && !safeDirectory(part))) return null;
    return decoded;
  } catch {
    return null;
  }
}

function imageSignature(mime, head, tail, size) {
  if (mime === 'image/png') return size >= 45
    && head.subarray(0, 8).equals(pngSignature)
    && head.readUInt32BE(8) === 13 && head.toString('ascii', 12, 16) === 'IHDR'
    && head.readUInt32BE(16) > 0 && head.readUInt32BE(20) > 0
    && tail.toString('ascii', 4, 8) === 'IEND';
  if (mime === 'image/jpeg') return size >= 12 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
    && tail.at(-2) === 0xff && tail.at(-1) === 0xd9;
  if (mime === 'image/gif') return size >= 14 && /^GIF8[79]a$/u.test(head.toString('ascii', 0, 6))
    && head.readUInt16LE(6) > 0 && head.readUInt16LE(8) > 0 && tail.at(-1) === 0x3b;
  if (mime === 'image/webp') return size >= 20 && head.toString('ascii', 0, 4) === 'RIFF'
    && head.readUInt32LE(4) + 8 === size && head.toString('ascii', 8, 12) === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(head.toString('ascii', 12, 16));
  if (mime === 'image/avif') {
    if (size < 24 || head.toString('ascii', 4, 8) !== 'ftyp') return false;
    const typeBytes = head.readUInt32BE(0);
    if (typeBytes < 16 || typeBytes > head.length || typeBytes % 4 !== 0) return false;
    if (['avif', 'avis'].includes(head.toString('ascii', 8, 12))) return true;
    for (let offset = 16; offset < typeBytes; offset += 4) {
      if (['avif', 'avis'].includes(head.toString('ascii', offset, offset + 4))) return true;
    }
  }
  return false;
}

function openImage(vault, path) {
  const mime = allowedImageType(path);
  if (!mime) return null;
  const expected = join(vault, path);
  let descriptor;
  let opened;
  try {
    const actual = realpathSync(expected);
    if (actual.normalize('NFC') !== expected.normalize('NFC')) return null;
    descriptor = openSync(actual, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = fstatSync(descriptor);
    const { size } = info;
    if (!info.isFile() || size < 12 || size > maximumFileBytes) return null;
    const head = Buffer.alloc(Math.min(256, size));
    const tail = Buffer.alloc(12);
    if (readSync(descriptor, head, 0, head.length, 0) !== head.length
      || readSync(descriptor, tail, 0, tail.length, size - tail.length) !== tail.length
      || !imageSignature(mime, head, tail, size)) return null;
    opened = { descriptor, size, mime };
    return opened;
  } catch (error) {
    if (missing.has(error.code)) return null;
    throw error;
  } finally {
    if (descriptor !== undefined && !opened) closeSync(descriptor);
  }
}

function indexFilenames(vault) {
  const names = new Map();
  let seen = 0;
  function collect(relativePath) {
    let entries;
    try {
      const expected = join(vault, relativePath);
      if (realpathSync(expected).normalize('NFC') !== expected.normalize('NFC')) return true;
      entries = readdirSync(expected, { withFileTypes: true });
    } catch (error) {
      return error.code === 'ENOENT' || error.code === 'ENOTDIR';
    }
    for (const entry of entries) {
      if (++seen > maximumNamedEntries) return false;
      const path = relativePath + '/' + entry.name;
      if (entry.isDirectory() && safeDirectory(entry.name)) {
        if (!collect(path)) return false;
      } else if (entry.isFile() && allowedImageType(path)) {
        const name = entry.name.normalize('NFC').toLowerCase();
        names.set(name, names.has(name) ? null : path);
      }
    }
    return true;
  }
  return scanRoots.every(collect) ? names : new Map();
}

export function createReaderImages(vaultPath) {
  const vault = realpathSync(vaultPath);
  const published = new Map();
  let filenameIndex;
  let indexedAt = 0;

  function publish(path) {
    const asset = openImage(vault, path);
    if (!asset) return null;
    closeSync(asset.descriptor);
    const id = createHash('sha256').update(path.normalize('NFC')).digest('hex');
    published.delete(id);
    if (published.size >= maximumPublished) published.delete(published.keys().next().value);
    published.set(id, path);
    return { href: readerImagesRoute + id };
  }

  function resolve(sourcePath, reference, { wiki = false } = {}) {
    if (typeof sourcePath !== 'string' || !/\.md$/iu.test(sourcePath) || !sourcePath.split('/').every(safePart)) return null;
    const path = localReference(reference);
    if (!path || !imageTypes.has(posix.extname(path).toLowerCase())) return null;
    if (wiki && !path.includes('/')) {
      if (!filenameIndex || Date.now() - indexedAt >= filenameIndexLifetime) {
        filenameIndex = indexFilenames(vault);
        indexedAt = Date.now();
      }
      const known = filenameIndex.get(path.normalize('NFC').toLowerCase());
      return known ? publish(known) : null;
    }
    const rooted = path.startsWith('Attachments/') || path.startsWith('Notes/');
    if (rooted) return path.split('/').every(safePart) ? publish(path) : null;
    const candidates = [posix.normalize(posix.join(posix.dirname(sourcePath), path)), posix.normalize(path)];
    for (const candidate of new Set(candidates)) {
      const found = publish(candidate);
      if (found) return found;
    }
    return null;
  }

  async function serveReaderImage(request, response, pathname) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    }
    const id = typeof pathname === 'string' && pathname.startsWith(readerImagesRoute) ? pathname.slice(readerImagesRoute.length) : '';
    const path = /^[a-f0-9]{64}$/u.test(id) && published.get(id);
    if (!path) return response.writeHead(404).end();
    const asset = openImage(vault, path);
    if (!asset) return response.writeHead(404).end();
    try {
      response.writeHead(200, { 'Content-Type': asset.mime, 'Content-Length': asset.size });
      if (request.method === 'HEAD') return response.end();
      const stream = createReadStream(null, { fd: asset.descriptor, autoClose: false, start: 0, end: asset.size - 1 });
      await pipeline(stream, response);
    } finally {
      closeSync(asset.descriptor);
    }
  }

  return { resolve, serveReaderImage };
}
