import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createStore } from './store.mjs';
import { serveSharedGallery } from '../flowdesk-workbench/shared-gallery.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(root, 'public', 'index.html');
const staticFiles = new Map([
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/choice-menu.js', ['choice-menu.js', 'text/javascript; charset=utf-8']],
  ['/choice-menu.css', ['choice-menu.css', 'text/css; charset=utf-8']],
]);
const mountedStaticFiles = new Map([...staticFiles].map(([path, file]) => ['/review' + path, file]));
const maximumBody = 1024 * 1024;
const cookieName = 'flowdesk_review';
const idPattern = '[A-Za-z0-9_-]{1,100}';
const reviewerPage = new RegExp('^/r/(' + idPattern + ')(?:/doc/' + idPattern + ')?/?$');
const reviewerApi = new RegExp('^/api/review/(' + idPattern + ')(?:/(session|submit|assets/(' + idPattern + ')))?/?$');
const reviewerGalleryApi = new RegExp('^/api/review/(' + idPattern + ')/galleries/([^/]{1,768})/(.{1,4096})$');
const galleryAccessApi = new RegExp('^/api/review/(' + idPattern + ')/gallery-access/([^/]{1,768})/([A-Za-z0-9_.-]{1,80})/(.{1,4096})$');
const externalRoot = '/api/admin/external-reviews';
const externalRoundApi = new RegExp('^' + externalRoot + '/(' + idPattern + ')(?:/(close|invites|invites/(' + idPattern + ')/revoke))?/?$');
const adminRoundApi = new RegExp('^/api/admin/reviews/(' + idPattern + ')(?:/(close|invites|invites/(' + idPattern + ')/revoke))?/?$');
const adminAssetApi = new RegExp('^/api/admin/reviews/(' + idPattern + ')/assets/(' + idPattern + ')/?$');
const adminTargetApi = new RegExp('^/api/admin/reviews/(' + idPattern + ')/target/?$');
const adminDispatchApi = new RegExp('^/api/admin/reviews/(' + idPattern + ')/submissions/([^/]{1,384})/dispatch/?$');
const directSubmitApi = new RegExp('^/api/admin/direct-reviews/(' + idPattern + ')/submit/?$');

function dispatchReceiptId(encoded) {
  let id;
  try { id = decodeURIComponent(encoded); } catch { throw httpError(400, '评审回执编号无效。'); }
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(id) || id === '.' || id === '..') throw httpError(400, '评审回执编号无效。');
  return id;
}

export function isGuestReviewPath(pathname) {
  return mountedStaticFiles.has(pathname) || reviewerPage.test(pathname) || reviewerApi.test(pathname) ||
    reviewerGalleryApi.test(pathname) || galleryAccessApi.test(pathname);
}

export function isAdminReviewPage(pathname) {
  return pathname === '/review' || pathname === '/review/' || pathname === '/annotate' || pathname === '/annotate/';
}

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function managedFiles(scope) {
  return [...(scope.projects ?? (scope.project ? [scope.project] : [])), ...scope.cases, ...scope.tasks, ...scope.documents];
}

function managedFileKind(scope, path) {
  if (scope.project?.path === path || scope.projects?.some(item => item.path === path)) return 'project';
  if (scope.cases.some(item => item.path === path)) return 'case';
  if (scope.tasks.some(item => item.path === path)) return 'task';
  if (scope.documents.some(item => item.path === path)) return 'document';
  return null;
}

function isLoopback(value) {
  return value === '::1' || value === '127.0.0.1' || value === '::ffff:127.0.0.1';
}

function isLocalHostHeader(request) {
  try {
    return ['127.0.0.1', '[::1]', 'localhost'].includes(new URL('http://' + request.headers.host).hostname);
  } catch {
    return false;
  }
}

function adminRequest(request) {
  return isLoopback(request.socket.remoteAddress) && isLocalHostHeader(request);
}

function sameHostOrigin(request) {
  const host = request.headers.host;
  const origin = request.headers.origin;
  if (typeof host !== 'string' || typeof origin !== 'string' || /[\s/@?#\\]/u.test(host)) return null;
  try {
    const url = new URL(origin);
    if (origin === url.origin && ['http:', 'https:'].includes(url.protocol) &&
      new URL(url.protocol + '//' + host).origin === origin && (!request.socket.encrypted || url.protocol === 'https:')) return url;
  } catch { /* An invalid Host or Origin cannot authorize a mutation. */ }
  return null;
}

function checkPostOrigin(request, publicOrigin) {
  const origin = request.headers.origin;
  const sameOrigin = sameHostOrigin(request) || (publicOrigin && origin === publicOrigin);
  if (request.headers['sec-fetch-site'] === 'cross-site' || (origin && !sameOrigin)) {
    throw httpError(403, '请求来源与评审服务不一致。');
  }
}

async function bodyJson(request) {
  if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw httpError(415, '此操作需要 JSON 请求。');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > maximumBody) {
      request.resume();
      throw httpError(413, '本次提交的内容过长。');
    }
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, '请求中的 JSON 格式不正确。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, '请求需要一个 JSON 对象。');
  }
  return value;
}

function json(response, data, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function sendFile(response, path, mime, method, extraHeaders = {}) {
  const { size } = await stat(path);
  const headers = { 'Content-Type': mime, 'Content-Length': size, ...extraHeaders };
  response.writeHead(200, headers);
  if (method === 'HEAD') {
    response.end();
    return;
  }
  await pipeline(createReadStream(path), response);
}

function sendSnapshotAsset(response, asset, method) {
  const inline = /^image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon)$/.test(asset.mime) || asset.mime === 'application/pdf';
  const headers = inline ? {} : { 'Content-Disposition': 'attachment' };
  if (asset.bytes) {
    response.writeHead(200, { 'Content-Type': asset.mime, 'Content-Length': asset.bytes.length, ...headers });
    return response.end(method === 'HEAD' ? undefined : asset.bytes);
  }
  return sendFile(response, asset.path, asset.mime, method, headers);
}

function inviteToken(request) {
  const cookie = request.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith(cookieName + '='));
  return cookie?.slice(cookieName.length + 1) || '';
}

function reviewCookie(request, response, roundId, token, invite, publicOrigin) {
  const https = sameHostOrigin(request)?.protocol === 'https:' ||
    (publicOrigin?.startsWith('https://') && request.headers.origin === publicOrigin);
  const secure = https ? '; Secure' : '';
  const expiry = invite.expiresAt ? '; Expires=' + new Date(invite.expiresAt).toUTCString() : '';
  const cookie = cookieName + '=' + token + '; Path=/api/review/' + roundId + '; HttpOnly; SameSite=Strict' + expiry + secure;
  response.setHeader('Set-Cookie', cookie);
}

function inviteLink(reviewId, invite, publicOrigin) {
  return {
    id: invite.id,
    reviewer: invite.reviewer,
    expiresAt: invite.expiresAt,
    url: (publicOrigin ?? '') + '/r/' + reviewId + '#' + encodeURIComponent(invite.token),
  };
}

async function preserveVaultBinding(vaultDir, dataDir) {
  const canonicalVault = await realpath(vaultDir);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const bindingPath = join(dataDir, '.vault-origin');
  try {
    await writeFile(bindingPath, canonicalVault + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const markedVault = (await readFile(bindingPath, 'utf8')).trimEnd();
    if (markedVault !== canonicalVault) {
      throw new Error('评审数据目录已关联另一个资料库。请用 --data 指定本资料库的评审数据目录。');
    }
  }
  return canonicalVault;
}

export async function openReviewStore({ vaultDir, dataDir, defaultMode }) {
  vaultDir = await preserveVaultBinding(vaultDir, dataDir);
  return createStore({ vaultDir, dataDir, defaultMode });
}

export async function createReviewHandler({ vaultDir, dataDir, publicOrigin = null, store,
  allowAdmin = true, standalone = true, onChange, dispatch, reviewScope, canManage = adminRequest,
  externalReviewEnabled = false, externalPublicationEnabled = true, getGalleryCatalog } = {}) {
  store ??= await openReviewStore({ vaultDir, dataDir });

  function coveredByScope(review, scope) {
    const paths = new Set(managedFiles(scope).map(file => file.path));
    return review.documents.every(document => paths.has(document.path));
  }

  async function managedReview(id) {
    const review = await store.get(id);
    if (review.external && !externalReviewEnabled) throw httpError(404, '未找到外部评审。');
    if (!review.external && reviewScope && !coveredByScope(review, await reviewScope(review.documents.map(document => document.path)))) {
      throw httpError(404, '这轮评审不在当前工作台范围内。');
    }
    return review;
  }

  function requirePublication() {
    if (!externalPublicationEnabled) throw httpError(409, '请先在 Obsidian 修改默认配对密钥并重启工作台，再发布外部链接。', 'external_publication_disabled');
  }

  function externalReviewer(input) {
    const reviewer = typeof input.reviewer === 'string' ? input.reviewer.trim() : '';
    if (!reviewer || reviewer.length > 80) throw httpError(400, '请填写不超过 80 字的评审人姓名。');
    const expiresInHours = Number(input.expiresInHours ?? 168);
    if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 720) {
      throw httpError(400, '邀请有效期须为 1 至 720 小时。');
    }
    return { reviewer, expiresInHours };
  }

  async function externalInput(input, publishing = false) {
    const { paths, attachments, galleries } = input;
    if (!Array.isArray(paths) || !paths.length || paths.length > 100 || paths.some(path => typeof path !== 'string' || path.length > 1024
      || !/^Notes\/(?:Docs|Plans|Research)\/.+\.md$/u.test(path))) throw httpError(400, '请选择文档中心中的 Markdown。');
    if (reviewScope) {
      const pathsInScope = new Set((await reviewScope(paths)).documents.map(file => file.path.normalize('NFC')));
      if (paths.some(path => !pathsInScope.has(path.normalize('NFC')))) {
        if (publishing) throw httpError(409, '评审资料已变化，请重新预览。', 'preview_changed');
        throw httpError(404, '此资料不在工作台的外部评审范围内。');
      }
    }
    const galleryCatalog = Array.isArray(galleries) && galleries.length ? await getGalleryCatalog?.() : undefined;
    if (Array.isArray(galleries) && galleries.length && !galleryCatalog) throw httpError(503, '暂时无法读取图集资料。');
    return { paths, attachments, galleries, galleryCatalog };
  }

  return async (request, response) => {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw httpError(400, '无效请求。');
      const { pathname, searchParams } = new URL(request.url, 'http://review.local');
      const invitationOrigin = typeof publicOrigin === 'function' ? publicOrigin() : publicOrigin;
      if (request.method === 'POST') checkPostOrigin(request, reviewerApi.test(pathname) ? invitationOrigin : null);
      const readOnly = request.method === 'GET' || request.method === 'HEAD';
      const staticFile = mountedStaticFiles.get(pathname) || (standalone && staticFiles.get(pathname));
      if (readOnly && staticFile) {
        return await sendFile(response, join(root, 'public', staticFile[0]), staticFile[1], request.method);
      }
      if (readOnly && (isAdminReviewPage(pathname) || (standalone && pathname === '/'))) {
        if ((pathname === '/annotate/' || pathname === '/annotate') && !reviewScope) throw httpError(404, '找不到此页面。');
        if (!allowAdmin || !canManage(request)) throw httpError(403, '当前入口无法打开评审管理。');
        if (reviewScope && (pathname === '/review/' || pathname === '/review') && !searchParams.get('round')) {
          response.writeHead(302, { Location: '/' });
          response.end();
          return;
        }
        return await sendFile(response, htmlPath, 'text/html; charset=utf-8', request.method);
      }
      if (readOnly && reviewerPage.test(pathname)) {
        return await sendFile(response, htmlPath, 'text/html; charset=utf-8', request.method);
      }

      if (pathname.startsWith('/api/admin/')) {
        if (!allowAdmin || !canManage(request)) throw httpError(403, '当前入口无法操作评审管理。');
        if (pathname === externalRoot || pathname.startsWith(externalRoot + '/')) {
          if (!externalReviewEnabled) throw httpError(403, '当前未启用外部评审。', 'external_review_unavailable');
          if (request.method === 'GET' && pathname === externalRoot) return json(response, { reviews: await store.listExternalReviews() });
          if (request.method === 'POST' && pathname === externalRoot + '/preview') {
            return json(response, await store.previewExternal(await externalInput(await bodyJson(request))));
          }
          if (request.method === 'POST' && pathname === externalRoot) {
            requirePublication();
            const input = await bodyJson(request);
            const { review, invite } = await store.createExternal({ ...await externalInput(input, true), ...externalReviewer(input),
              title: input.title, previewDigest: input.previewDigest });
            onChange?.();
            return json(response, { review, invite: inviteLink(review.id, invite, invitationOrigin) }, 201);
          }
          const externalRoute = externalRoundApi.exec(pathname);
          if (externalRoute) {
            const [, roundId, action, inviteId] = externalRoute;
            if (request.method === 'GET' && !action) return json(response, { review: await store.getExternal(roundId) });
            if (request.method === 'POST' && action) {
              await store.getExternal(roundId);
              if (action === 'invites') {
                requirePublication();
                const invite = await store.issueInvite(roundId, externalReviewer(await bodyJson(request)));
                return json(response, { invite: inviteLink(roundId, invite, invitationOrigin) }, 201);
              }
              if (action === 'close') await store.close(roundId);
              if (inviteId) await store.revokeInvite(roundId, inviteId);
              onChange?.();
              return json(response, { review: await store.getExternal(roundId) });
            }
          }
          throw httpError(404, '未找到外部评审操作。');
        }
        if (reviewScope && request.method === 'POST') {
          if (pathname === '/api/admin/direct-reviews/open') {
            const { path } = await bodyJson(request);
            if (typeof path !== 'string' || !path) throw httpError(400, '请选择一份要批注的工作台文档。');
            const scope = await reviewScope([path]);
            const kind = managedFileKind(scope, path);
            if (!kind) {
              throw httpError(404, '这份资料不在当前工作台范围内。');
            }
            return json(response, await store.openDirect(path, { managedKind: kind }));
          }
          const directRoute = directSubmitApi.exec(pathname);
          if (directRoute) {
            const [, roundId] = directRoute;
            await managedReview(roundId);
            const submission = await store.submitDirect(roundId, await bodyJson(request));
            onChange?.();
            return json(response, { submission }, 201);
          }
        }
        if (dispatch) {
          if (request.method === 'GET' && pathname === '/api/admin/review-targets') {
            return json(response, await dispatch.listTargets());
          }
          const targetRoute = adminTargetApi.exec(pathname);
          if (targetRoute) {
            const [, roundId] = targetRoute;
            await managedReview(roundId);
            if (request.method === 'GET') return json(response, await dispatch.getBinding(roundId));
            if (request.method === 'POST') {
              const { targetThreadId } = await bodyJson(request);
              return json(response, await dispatch.bind(roundId, targetThreadId));
            }
          }
          const dispatchRoute = adminDispatchApi.exec(pathname);
          if (dispatchRoute) {
            const [, roundId, encodedReceipt] = dispatchRoute;
            const submissionId = dispatchReceiptId(encodedReceipt);
            const review = await managedReview(roundId);
            const submission = review.submissions.find(item => item.id === submissionId);
            if (!submission) throw httpError(404, '找不到本轮的这份评审回执。');
            if (request.method === 'GET') return json(response, { dispatch: await dispatch.status(roundId, submissionId) });
            if (request.method === 'POST') {
              const { targetThreadId, targetClientId, retryFromOperationId } = await bodyJson(request);
              if (review.external && (typeof targetClientId !== 'string' || !targetClientId)) {
                throw httpError(400, '请选择接收这份回执的 Codex 环境和会话。');
              }
              const documentPaths = review.documents.map(document => document.path);
              return json(response, { dispatch: await dispatch.send({
                roundId, submissionId, targetThreadId, targetClientId, documentPaths,
                ...(retryFromOperationId === undefined ? {} : { retryFromOperationId }),
              }) });
            }
          }
        }
        const snapshotAsset = adminAssetApi.exec(pathname);
        if (readOnly && snapshotAsset) {
          const [, roundId, assetId] = snapshotAsset;
          if (reviewScope) await managedReview(roundId);
          return await sendSnapshotAsset(response, await store.asset(roundId, assetId), request.method);
        }
        if (request.method === 'GET' && pathname === '/api/admin/documents') {
          if (reviewScope) {
            const scope = await reviewScope();
            return json(response, { documents: managedFiles(scope) });
          }
          return json(response, { documents: await store.documents() });
        }
        if (request.method === 'POST' && pathname === '/api/admin/preview') {
          if (reviewScope) throw httpError(404, '工作台通过文档正文添加批注。');
          return json(response, await store.preview((await bodyJson(request)).paths));
        }
        if (pathname === '/api/admin/reviews') {
          if (request.method === 'GET') {
            const reviews = (await store.list()).filter(review => !review.external || externalReviewEnabled);
            if (!reviewScope) return json(response, { reviews });
            const scope = await reviewScope();
            return json(response, { reviews: reviews.filter(review => coveredByScope(review, scope)), workflow: 'direct' });
          }
          if (request.method === 'POST') {
            if (reviewScope) throw httpError(404, '工作台通过文档正文添加批注。');
            const input = await bodyJson(request);
            const reviewer = typeof input.reviewer === 'string' ? input.reviewer.trim() : '';
            if (!reviewer || reviewer.length > 80) throw httpError(400, '请填写不超过 80 字的评审人姓名。');
            const hours = Number(input.expiresInHours ?? 168);
            if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw httpError(400, '邀请有效期须为 1 至 720 小时。');
            const suppliedThread = typeof input.threadId === 'string' ? input.threadId.trim() : input.threadId;
            if (suppliedThread != null && suppliedThread !== '' && (!dispatch || typeof suppliedThread !== 'string'
              || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(suppliedThread))) {
              throw httpError(400, '请提供原 Codex 会话的完整 UUID。');
            }
            const created = await store.create({ ...input, ...(!standalone && { mode: 'live' }) });
            onChange?.();
            const invite = await store.issueInvite(created.id, { reviewer, expiresInHours: hours });
            const review = await store.get(created.id);
            let bindingError;
            if (suppliedThread) {
              try { await dispatch.bind(created.id, suppliedThread); }
              catch { bindingError = '轮次已创建，但未能保存原会话，请在回执中重新绑定。'; }
            }
            return json(response, { review, invite: inviteLink(review.id, invite, invitationOrigin), bindingError }, 201);
          }
        }
        const adminRoute = adminRoundApi.exec(pathname);
        if (adminRoute) {
          const [, roundId, action, inviteId] = adminRoute;
          if (request.method === 'GET' && !action) return json(response, { review: await managedReview(roundId) });
          if (reviewScope && request.method === 'POST') await managedReview(roundId);
          if (request.method === 'POST' && action === 'invites') {
            if (reviewScope) throw httpError(404, '工作台通过文档正文添加批注。');
            const invite = await store.issueInvite(roundId, await bodyJson(request));
            return json(response, { invite: inviteLink(roundId, invite, invitationOrigin) }, 201);
          }
          if (request.method === 'POST' && action === 'close') {
            await store.close(roundId);
            onChange?.();
            return json(response, { review: await store.get(roundId) });
          }
          if (request.method === 'POST' && inviteId) {
            await store.revokeInvite(roundId, inviteId);
            return json(response, { review: await store.get(roundId) });
          }
        }
      }

      const guestGallery = reviewerGalleryApi.exec(pathname);
      const galleryAccess = galleryAccessApi.exec(pathname);
      if (guestGallery || galleryAccess) {
        if (!readOnly) {
          response.setHeader('Allow', 'GET, HEAD');
          throw httpError(405, '图集仅支持查看。');
        }
        const [, roundId, encodedGalleryId] = galleryAccess ?? guestGallery;
        let galleryId;
        try { galleryId = decodeURIComponent(encodedGalleryId); }
        catch { throw httpError(404, '未找到图集资料。'); }
        const encodedId = encodeURIComponent(galleryId.normalize('NFC'));
        if (galleryAccess) {
          const [, , , capability, suffix] = galleryAccess;
          const asset = await store.galleryAssetWithAccess(roundId, galleryId, capability, suffix);
          const routePrefix = `/api/review/${roundId}/gallery-access/${encodedId}/${capability}/`;
          return await serveSharedGallery(request, response, asset, { routePrefix });
        }
        const token = inviteToken(request);
        if (!token) throw httpError(401, '请先打开此轮的评审邀请链接。');
        await store.authorize(roundId, token);
        const asset = await store.galleryAsset(roundId, galleryId, guestGallery[3]);
        const routePrefix = `/api/review/${roundId}/galleries/${encodedId}/`;
        return await serveSharedGallery(request, response, asset, { routePrefix });
      }

      const reviewerRoute = reviewerApi.exec(pathname);
      if (reviewerRoute) {
        const [, roundId, action, assetId] = reviewerRoute;
        if (request.method === 'POST' && action === 'session') {
          const { token } = await bodyJson(request);
          if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
            throw httpError(401, '此评审需要有效的邀请链接。');
          }
          const invite = await store.authorize(roundId, token);
          reviewCookie(request, response, roundId, token, invite, invitationOrigin);
          return json(response, { reviewer: invite.reviewer });
        }
        const token = inviteToken(request);
        if (!token) throw httpError(401, '请先打开此轮的评审邀请链接。');
        const invite = await store.authorize(roundId, token);
        if (request.method === 'GET' && !action) {
          const view = await store.reviewerView(roundId, invite);
          view.review.reviewer = invite.reviewer;
          view.review.inviteId = invite.id;
          return json(response, view);
        }
        if (request.method === 'POST' && action === 'submit') {
          const input = await bodyJson(request);
          if (input.inviteId !== invite.id) {
            throw httpError(409, '此标签页的评审邀请已变化，请重新打开本人的邀请链接。');
          }
          const submission = await store.submit(roundId, invite, input);
          onChange?.();
          return json(response, { submission }, 201);
        }
        if (readOnly && assetId) {
          return await sendSnapshotAsset(response, await store.asset(roundId, assetId), request.method);
        }
      }

      throw httpError(404, '找不到此页面或操作。');
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
      if (status === 500) console.error('评审服务内部错误', error);
      json(response, {
        error: status === 500 ? '评审服务暂时无法完成此操作，请查看本机服务输出。' : error.message,
        ...([403, 409].includes(status) && ['submission_conflict', 'dispatch_attempt_changed', 'dispatch_target_unavailable',
          'preview_changed', 'external_review_unavailable', 'external_publication_disabled'].includes(error.code)
          ? { code: error.code } : {}),
      }, status);
    }
  };
}

export async function createReviewServer(options) {
  return createServer(await createReviewHandler(options));
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '4317' },
      vault: { type: 'string' },
      data: { type: 'string' },
      'public-origin': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log('用法：node server.mjs [--vault <目录>] [--data <目录>] [--host <地址>] [--port 4317] [--public-origin <网址>]');
    return;
  }
  const vaultDir = resolve(values.vault ?? process.env.FLOWDESK_REVIEW_VAULT ?? join(root, 'demo-vault'));
  const dataDir = resolve(values.data ?? process.env.FLOWDESK_REVIEW_DATA ?? join(root, '.review-data'));
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('端口须在 0 到 65535 之间。');
  const host = values.host;
  const publicOriginInput = values['public-origin'];
  let publicOrigin = null;
  if (publicOriginInput) {
    const url = new URL(publicOriginInput);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('--public-origin 须为 http 或 https 的网站地址，例如 http://192.168.1.25:4317。');
    }
    publicOrigin = url.origin;
  }
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !publicOrigin) {
    throw new Error('对局域网开放时，请用 --public-origin 指定评审人使用的内网地址。管理页面仍从本机打开。');
  }
  const handler = await createReviewHandler({ vaultDir, dataDir, publicOrigin });
  const server = createServer(handler);
  await listen(server, port, host);
  const { address, port: actualPort } = server.address();
  let managementServer;
  if (!['0.0.0.0', '::'].includes(address) && !isLoopback(address)) {
    managementServer = createServer(handler);
    try {
      await listen(managementServer, actualPort, '127.0.0.1');
    } catch (error) {
      server.close();
      throw error;
    }
  }
  const localAddress = address === '::1' ? '[::1]' : '127.0.0.1';
  console.log('本机管理 http://' + localAddress + ':' + actualPort);
  if (publicOrigin) console.log('评审链接 ' + publicOrigin);
  console.log('资料库 ' + vaultDir);
  console.log('评审数据 ' + dataDir);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { server.close(); managementServer?.close(); });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
