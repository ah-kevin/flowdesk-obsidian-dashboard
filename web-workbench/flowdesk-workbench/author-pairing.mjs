import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const cookieName = 'flowdesk_author';
const grantSeconds = 90 * 24 * 60 * 60;
const failureWindow = 5 * 60 * 1000;
const failureLimit = 5;
const maxSources = 1024;
const maxBodyBytes = 2048;
const digestPattern = /^[A-Za-z0-9_-]{43}$/u;

function hmac(secret, scope, text) {
  return createHmac('sha256', secret).update(scope + '\0').update(text).digest('base64url');
}

function keyDigest(value) {
  return createHash('sha256').update(value).digest();
}

async function readSecret(path) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!info.isFile() || info.size > 256 || (info.mode & 0o077) ||
      (process.getuid && info.uid !== process.getuid())) throw new Error('Author pairing state permissions are invalid.');
    const { secret, keyTag } = JSON.parse(await file.readFile('utf8'));
    if (typeof secret !== 'string' || !digestPattern.test(secret) || typeof keyTag !== 'string' || !digestPattern.test(keyTag)) {
      throw new Error('Author pairing state is invalid.');
    }
    return { secret: Buffer.from(secret, 'base64url'), keyTag };
  } catch (error) {
    if (!file && error.code === 'ENOENT') return null;
    throw error;
  } finally {
    await file?.close();
  }
}

async function writeSecret(directory, path, secret, keyTag, createOnly) {
  const staging = join(directory, '.author-pairing-' + randomBytes(12).toString('hex') + '.tmp');
  const file = await open(staging, 'wx', 0o600);
  try {
    try {
      await file.writeFile(JSON.stringify({ secret: secret.toString('base64url'), keyTag }) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
    if (createOnly) await link(staging, path);
    else await rename(staging, path);
    return true;
  } catch (error) {
    if (createOnly && error.code === 'EEXIST') return false;
    throw error;
  } finally {
    await unlink(staging).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function loadSecret(directory, key) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'author-pairing.json');
  for (;;) {
    const saved = await readSecret(path);
    if (saved && saved.keyTag === hmac(saved.secret, 'key', key)) return saved.secret;
    // Rotating the stored secret prevents old cookies from becoming valid again if the key is restored later.
    const secret = randomBytes(32);
    if (await writeSecret(directory, path, secret, hmac(secret, 'key', key), !saved)) return secret;
  }
}

function trustedOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  const site = request.headers['sec-fetch-site'];
  if (typeof origin !== 'string' || typeof host !== 'string' || /[\s/@?#\\]/u.test(host) ||
    (site !== undefined && site !== 'same-origin')) return null;
  try {
    const url = new URL(origin);
    if (origin !== url.origin || !['http:', 'https:'].includes(url.protocol) ||
      (request.socket.encrypted && url.protocol !== 'https:') || new URL(url.protocol + '//' + host).origin !== origin) return null;
    return url;
  } catch {
    return null;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

async function pairBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      request.resume();
      return { tooLarge: true };
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1 &&
      typeof body.key === 'string' ? { supplied: body.key } : {};
  } catch {
    return {};
  }
}

export async function createAuthorPairing({ dataDir, key }) {
  if (typeof key !== 'string' || !key.length || Buffer.byteLength(key) > 512) throw new Error('Author pairing key is invalid.');
  const secret = await loadSecret(dataDir, key);
  const expectedKey = keyDigest(key);
  const failures = new Map();

  function rateLimited(source, response) {
    const now = Date.now();
    for (const [id, failure] of failures) if (failure.until <= now) failures.delete(id);
    const failure = failures.get(source);
    if (failure ? failure.count < failureLimit : failures.size < maxSources) return false;
    const until = failure?.until ?? now + failureWindow;
    response.setHeader('Retry-After', String(Math.max(1, Math.ceil((until - now) / 1000))));
    sendJson(response, 429, { error: '配对尝试过多，请稍后再试。' });
    return true;
  }

  function hasAuthor(request) {
    const cookie = request.headers.cookie;
    if (typeof cookie !== 'string') return false;
    const values = cookie.split(';').map(part => part.trim()).filter(part => part.startsWith(cookieName + '='));
    if (values.length !== 1) return false;
    const match = /^v1\.(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/u.exec(values[0].slice(cookieName.length + 1));
    if (!match || Number(match[1]) <= Math.floor(Date.now() / 1000)) return false;
    const expected = hmac(secret, 'session', `v1.${match[1]}.${match[2]}`);
    return timingSafeEqual(Buffer.from(match[3]), Buffer.from(expected));
  }

  async function handlePair(request, response) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: '此操作需要 POST 请求。' });
    }
    const origin = trustedOrigin(request);
    if (!origin) return sendJson(response, 403, { error: '请求来源与当前工作台不一致。' });
    if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return sendJson(response, 415, { error: '此操作需要 JSON 请求。' });
    }
    const source = hmac(secret, 'rate-limit', request.socket.remoteAddress || 'unknown');
    if (rateLimited(source, response)) return request.resume();
    const { tooLarge, supplied } = await pairBody(request);
    // Concurrent requests may have completed their body reads while this request was pending.
    if (rateLimited(source, response)) return;
    if (typeof supplied !== 'string' || !timingSafeEqual(keyDigest(supplied), expectedKey)) {
      const failure = failures.get(source) ?? { count: 0, until: Date.now() + failureWindow };
      failure.count++;
      failures.set(source, failure);
      if (tooLarge) return sendJson(response, 413, { error: '配对请求过长。' });
      return sendJson(response, typeof supplied === 'string' ? 401 : 400, { error: '请输入有效的作者配对口令。' });
    }
    failures.delete(source);
    const expires = Math.floor(Date.now() / 1000) + grantSeconds;
    const value = `v1.${expires}.${randomBytes(16).toString('base64url')}`;
    const cookie = value + '.' + hmac(secret, 'session', value);
    // A reverse proxy can terminate TLS, while the browser's validated Origin still reflects HTTPS.
    response.setHeader('Set-Cookie', `${cookieName}=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${grantSeconds}` +
      (origin.protocol === 'https:' ? '; Secure' : ''));
    return sendJson(response, 200, { paired: true });
  }

  return { hasAuthor, handlePair };
}
