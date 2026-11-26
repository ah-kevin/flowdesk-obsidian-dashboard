import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, realpath } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import { homedir, networkInterfaces } from 'node:os';
import { dirname, join, relative, resolve, sep, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { documentKind, readManagedDocument, readPeriodCases, readPeriodDocuments, readProjectDocuments, readVaultLibrary, readVaultWorkspace } from './vault.mjs';
import { readDocHub } from './doc-hub.mjs';
import { readCaseTaskBase, readManagedWorkspaceTask, readPeriodTasks, readWorkspaceTasks, readTaskDetail } from './tasks.mjs';
import { periodRange } from './period.mjs';
import { readReviewDetails } from './review-details.mjs';
import { configureFlowDeskMarkdown } from './markdown-extensions.mjs';
import { findProgressSection, renderProgressTimeline } from './progress.mjs';
import { createGalleryCatalog, galleryCollectionsRoute, galleryVaultPath, openGallery, serveGalleryCollection } from './gallery.mjs';
import { createReviewHandler, isAdminReviewPage, isGuestReviewPath, openReviewStore } from '../flowdesk-review/server.mjs';
import { createReviewDispatch } from '../flowdesk-review/dispatch.mjs';
import { createAuthorPairing } from './author-pairing.mjs';
import { createReaderImages, readerImagesRoute } from './reader-images.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const vault = await realpath(process.env.FLOWDESK_WORKBENCH_VAULT || process.env.OBSIDIAN_VAULT
  || join(homedir(), 'Library/Mobile Documents/iCloud~md~obsidian/Documents/agent-workspaces'));
const port = Number(process.env.FLOWDESK_WORKBENCH_PORT || 4327);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('FlowDesk 端口须为 0 到 65535 之间的整数。');
function privateIPv4(address) {
  return isIPv4(address) && /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(address);
}

const configuredLan = process.env.FLOWDESK_WORKBENCH_LAN_HOST?.trim() || '';
if (configuredLan && configuredLan !== '0.0.0.0' && !privateIPv4(configuredLan)) {
  throw new Error('局域网监听配置无效。');
}
const lanHost = configuredLan ? '0.0.0.0' : '';
const dataDir = resolve(process.env.FLOWDESK_WORKBENCH_REVIEW_DATA || process.env.FLOWDESK_REVIEW_DATA
  || join(root, '.review-data', createHash('sha256').update(vault).digest('hex')));
const reviewStore = await openReviewStore({ vaultDir: vault, dataDir, defaultMode: 'live' });
const dispatch = createReviewDispatch({ vaultDir: vault, dataDir });
const externalReviewEnabled = process.env.FLOWDESK_WORKBENCH_REQUIRE_PAIRING === '1';
const authorKey = process.env.FLOWDESK_WORKBENCH_PAIRING_KEY ?? 'qwe123';
const externalPublicationEnabled = authorKey.trim() !== 'qwe123';
const authorPairing = externalReviewEnabled || reviewStore.hasOpenExternalReviews()
  ? await createAuthorPairing({ dataDir, key: authorKey })
  : null;
const gallery = await openGallery(vault);
const readerImages = createReaderImages(vault);
const maxNoteSize = 2 * 1024 * 1024;
const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/reader-annotations.js', ['reader-annotations.js', 'text/javascript; charset=utf-8']],
  ['/feedback-sender.js', ['feedback-sender.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/external-review', ['external-review.html', 'text/html; charset=utf-8']],
  ['/external-review/', ['external-review.html', 'text/html; charset=utf-8']],
  ['/external-review.css', ['external-review.css', 'text/css; charset=utf-8']],
  ['/external-review.js', ['external-review.js', 'text/javascript; charset=utf-8']],
]);
const pairingFiles = new Map([
  ['/pair', ['pair.html', 'text/html; charset=utf-8']],
  ['/pair/', ['pair.html', 'text/html; charset=utf-8']],
  ['/pair.css', ['pair.css', 'text/css; charset=utf-8']],
  ['/pair.js', ['pair.js', 'text/javascript; charset=utf-8']],
]);
const detailKinds = new Map([['case', 'cases'], ['task', 'tasks'], ['document', 'documents']]);
const projectionTTL = 6000;
const workspaces = new Map();

function invalidateWorkspace() {
  workspaces.clear();
  reviewIndex.clear();
}

const reviewHandler = await createReviewHandler({ store: reviewStore, standalone: false, dispatch,
  onChange: invalidateWorkspace, reviewScope, canManage: request => !authorPairing || authorPairing.hasAuthor(request),
  externalReviewEnabled, externalPublicationEnabled, getGalleryCatalog: () => galleryIndex.get(true),
});

function now() {
  return new Date().toISOString();
}

function sortByTime(first, second) {
  return (Date.parse(second.updatedAt || '') || 0) - (Date.parse(first.updatedAt || '') || 0);
}

function coerceStatus(source) {
  if (!source) return { status: 'unavailable', at: now(), detail: '无法读取来源。' };
  return { ...source, status: { available: 'ok', partial: 'degraded' }[source.status] || source.status };
}

async function readReviews() {
  try {
    const rounds = await reviewStore.list();
    return {
      reviews: rounds.map(round => ({
        id: round.id, title: round.title, createdAt: round.createdAt, mode: round.mode, direct: round.direct === true,
        path: round.documents[0]?.path,
        href: '/review/?round=' + encodeURIComponent(round.id),
        submissionCount: round.submissionCount,
        status: round.closedAt ? 'closed' : 'open',
        documentPaths: round.documents.map(document => document.path),
      })),
      source: { status: 'ok', at: now(), detail: '读取当前 Vault 的本机评审轮次。' },
    };
  } catch {
    return { reviews: [], source: { status: 'unavailable', at: now(), detail: '暂时无法读取本机评审数据。' } };
  }
}

function cacheProjection(build) {
  let cached;
  let pending;
  return {
    get(force = false) {
      if (pending) return !force || pending.force ? pending.promise : pending.promise.then(() => this.get(true));
      if (!force && cached && Date.now() - cached.time < projectionTTL) return cached.promise;
      const next = { force };
      next.promise = build().then(data => {
        if (pending === next) cached = { time: Date.now(), promise: Promise.resolve(data) };
        return data;
      }).finally(() => { if (pending === next) pending = null; });
      pending = next;
      return next.promise;
    },
    clear() { cached = null; pending = null; },
  };
}

const vaultIndex = cacheProjection(() => readVaultLibrary(vault));
const docHubIndex = cacheProjection(() => readDocHub(vault));
const reviewIndex = cacheProjection(readReviews);
const readGalleryCatalog = createGalleryCatalog(vault);
const galleryIndex = cacheProjection(async () => {
  const [library, hub] = await Promise.all([vaultIndex.get(), docHubIndex.get()]);
  return readGalleryCatalog(hub.documents, library.options);
});

function projectionTaskScope(projectPaths, cases) {
  return {
    vaultDir: vault,
    projectPaths,
    casePaths: cases.map(item => item.path),
    taskPaths: [...new Set(cases.flatMap(item => item.taskPaths))],
  };
}

async function buildWorkspace(library, entry, hub, force) {
  const [note, taskData, reviewData] = await Promise.all([
    readVaultWorkspace(library, entry, hub.documents),
    readWorkspaceTasks(projectionTaskScope(entry ? [entry.project.path] : [], entry?.cases ?? [])),
    reviewIndex.get(force),
  ]);
  const tasks = taskData.tasks.toSorted(sortByTime);
  const cases = note.cases.map(item => {
    const associated = tasks.filter(task => task.casePaths?.includes(item.path));
    const backlinks = note.cases.filter(candidate => candidate.casePaths.includes(item.path)).map(candidate => candidate.path);
    return {
      ...item,
      taskPaths: [...new Set([...item.taskPaths, ...associated.map(task => task.path)])],
      casePaths: [...new Set([...item.casePaths, ...backlinks])],
    };
  }).sort(sortByTime);
  const docs = note.documents.toSorted(sortByTime);
  const reviewPaths = new Set([...docs, ...cases, ...tasks].map(item => item.path));
  if (note.project) reviewPaths.add(note.project.path);
  const reviews = reviewData.reviews.filter(round => round.documentPaths.every(path => reviewPaths.has(path)));
  return {
    observedAt: now(), project: note.project, cases, tasks, documents: docs, reviews,
    sources: {
      vault: coerceStatus(note.source), tasknotes: coerceStatus(taskData.source),
      review: coerceStatus(reviewData.source),
    },
  };
}

async function workspace(force = false, requestedProject = null) {
  const [library, hub] = await Promise.all([vaultIndex.get(force), docHubIndex.get(force)]);
  const path = library.projects.has(requestedProject) ? requestedProject : library.options[0]?.path;
  const entry = library.projects.get(path);
  const prior = workspaces.get(path);
  if (!force && prior?.library === library && prior.hub === hub) {
    return { ...(await prior.promise), projects: library.options };
  }
  const promise = buildWorkspace(library, entry, hub, force);
  workspaces.set(path, { library, hub, promise });
  return { ...(await promise), projects: library.options };
}

function periodGalleries(catalog, documents, references) {
  const documentLinks = new Map(documents.map(doc => [doc.path.normalize('NFC'), doc.relatedTo]));
  const explicitLinks = new Map();
  for (const { source, ref, relatedTo } of references) {
    const resource = galleryResource(ref, { source, galleryFiles: catalog.files });
    if (resource?.kind !== 'page') continue;
    if (!explicitLinks.has(resource.collection)) explicitLinks.set(resource.collection, []);
    explicitLinks.get(resource.collection).push(...relatedTo);
  }
  return catalog.galleries.flatMap(({ searchText, pages, ...gallery }) => {
    const links = [...(explicitLinks.get(gallery.id) || []), ...(documentLinks.get(gallery.documentPath?.normalize('NFC')) || [])];
    return links.length ? [{ ...gallery, pages: pages.map(({ title, href }) => ({ title, href })),
      relatedTo: [...new Map(links.map(entry => [entry.id, entry])).values()] }] : [];
  });
}

async function workspacePeriod(range, projectPath, force) {
  const [library, hub, catalog] = await Promise.all([vaultIndex.get(force), docHubIndex.get(force), galleryIndex.get(force)]);
  if (projectPath && !library.projects.has(projectPath)) return null;
  const cases = readPeriodCases(library, { ...range, projectPath });
  const { taskPool, completed, source: taskSource } = await readPeriodTasks({
    ...range, projectPath, vaultDir: vault, casePaths: cases.map(item => item.path),
    taskPaths: [...new Set(cases.flatMap(item => item.taskPaths))],
  });
  const { documents, unreadable, galleryReferences } = await readPeriodDocuments(library, cases,
    [...taskPool.inPeriod, ...completed], hub.documents);
  const vaultSource = coerceStatus(library.source);
  const issues = [hub.source.status !== 'ok' && hub.source.detail,
    unreadable && `${unreadable} 条阶段资料引用无法读取。`,
    catalog.unreadable && `${catalog.unreadable} 项图集资料无法读取。`].filter(Boolean);
  if (issues.length) {
    if (vaultSource.status === 'ok') vaultSource.status = 'degraded';
    vaultSource.detail = [vaultSource.detail, ...issues].filter(Boolean).join(' ');
  }
  return {
    ...range, projectPath, observedAt: now(), cases, taskPool, completed, documents,
    galleries: periodGalleries(catalog, documents, galleryReferences),
    sources: { vault: vaultSource, tasknotes: coerceStatus(taskSource) },
  };
}

function uniqueRecords(entries) {
  return [...new Map(entries.map(entry => [entry.path, entry])).values()];
}

function managedTaskPath(path) {
  return /^(?:Tasks|TaskNotes)\//u.test(path);
}

async function reviewScope(paths = []) {
  const library = await vaultIndex.get();
  const requested = new Set(paths);
  const allow = item => !requested.size || requested.has(item.path);
  const entries = [...library.projects.values()];
  const projects = library.options.filter(allow);
  const cases = [...library.cases.values()].filter(item => requested.size || !item.archived);
  const taskPaths = paths.filter(managedTaskPath);
  const taskScope = projectionTaskScope(library.options.map(item => item.path), cases);
  const tasks = paths.length
    ? (await Promise.all(taskPaths.map(path => readManagedWorkspaceTask(path, { vaultDir: vault, casePaths: taskScope.casePaths })))).filter(Boolean)
    : (await readWorkspaceTasks(taskScope)).tasks.filter(item => managedTaskPath(item.path));
  let documents = [];
  if (!requested.size || paths.some(documentKind)) {
    const hub = await docHubIndex.get();
    documents = hub.documents.filter(allow);
    if (!requested.size || paths.some(path => documentKind(path) && !documents.some(item => item.path === path))) {
      const linked = await Promise.all(entries.map(entry => readProjectDocuments(library, entry, hub.documents)));
      documents = uniqueRecords([...documents, ...linked.flatMap(result => result.documents).filter(allow)]);
    }
    const known = new Set(documents.map(item => item.path));
    const remaining = paths.filter(path => documentKind(path) && !known.has(path));
    const managed = await Promise.all(remaining.map(path => readManagedDocument(library, path, hub.documents)));
    documents.push(...managed.filter(Boolean));
  }
  return { projects, cases: cases.filter(allow), tasks, documents };
}

function isInside(path) {
  const fromRoot = relative(vault, path);
  return fromRoot && fromRoot !== '..' && !fromRoot.startsWith('..' + sep) && !fromRoot.startsWith(sep);
}

async function readMarkdownBytes(path) {
  const requested = resolve(vault, path);
  const actual = await realpath(requested);
  if (!isInside(actual) || actual.normalize('NFC') !== requested.normalize('NFC')) throw new Error('source path is unavailable');
  const file = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxNoteSize) throw new Error('source unavailable');
    return await file.readFile();
  } finally {
    await file.close();
  }
}

function findTarget(decoded, source, byPath) {
  if (!decoded) return byPath.get(source);
  const candidates = [posix.normalize(posix.join(posix.dirname(source), decoded)), decoded.replace(/^\//, '')];
  for (const path of candidates) {
    const match = byPath.get(path) || byPath.get(path + '.md');
    if (match) return match;
  }
  const keys = candidates.flatMap(path => [path.normalize('NFC'), path.normalize('NFC') + '.md']);
  const matches = [...byPath.values()].filter(item =>
    keys.includes(item.path.normalize('NFC')) || posix.basename(item.path, '.md').normalize('NFC') === decoded.normalize('NFC'));
  return matches.length === 1 ? matches[0] : null;
}

function internalHref(ref, env) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref)) return null;
  const separator = ref.indexOf('#');
  try {
    const path = decodeURIComponent(separator === -1 ? ref : ref.slice(0, separator));
    const heading = separator === -1 ? '' : decodeURIComponent(ref.slice(separator + 1)).trim();
    if ((!path && !heading) || heading.startsWith('^')) return null;
    const target = findTarget(path, env.source, env.byPath);
    if (!target) return null;
    const href = target.kind === 'project'
      ? (target.path === env.projectPath ? '' : '/?project=' + encodeURIComponent(target.path)) + '#/project'
      : '#/' + detailKinds.get(target.kind) + '/' + encodeURIComponent(target.path);
    return heading ? href + '?heading=' + encodeURIComponent(heading) : href;
  } catch {
    return null;
  }
}

function galleryResource(ref, env) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(ref)) return null;
  try {
    const [path, fragment] = ref.split('#', 2);
    const decoded = decodeURIComponent(path);
    const candidates = [decoded, posix.normalize(posix.join(posix.dirname(env.source), decoded))];
    for (const candidate of candidates) {
      const entry = env.galleryFiles.get(candidate.normalize('NFC'));
      if (!entry) continue;
      const href = entry.path === galleryVaultPath && gallery ? '/gallery/' : entry.href;
      return { kind: entry.kind, collection: entry.collection,
        href: fragment ? href + '#' + encodeURIComponent(decodeURIComponent(fragment)) : href };
    }
    return null;
  } catch {
    return null;
  }
}

const md = new MarkdownIt({ html: false, linkify: false });
configureFlowDeskMarkdown(md);
md.inline.ruler.before('link', 'workbench_wikilink', (state, silent) => {
  const embed = state.src.startsWith('![[', state.pos);
  if (state.linkLevel || !embed && !state.src.startsWith('[[', state.pos)) return false;
  const start = state.pos + (embed ? 3 : 2);
  const close = state.src.indexOf(']]', start);
  if (close === -1 || close + 2 > state.posMax) return false;
  const body = state.src.slice(start, close);
  if (!body.trim() || /[\r\n]/.test(body)) return false;
  const separator = body.indexOf('|');
  const target = (separator === -1 ? body : body.slice(0, separator)).trim();
  const path = target.split('#', 1)[0];
  const label = separator === -1 ? posix.basename(path, '.md') || target.slice(1) : body.slice(separator + 1).trim();
  if (!silent) {
    const token = state.push('workbench_wikilink', '', 0);
    token.content = label;
    token.meta = { target, embed, raw: state.src.slice(state.pos, close + 2) };
  }
  state.pos = close + 2;
  return true;
});
md.renderer.rules.workbench_wikilink = (tokens, index, options, env) => {
  const token = tokens[index];
  const href = internalHref(token.meta.target, env);
  const resource = galleryResource(token.meta.target, env);
  const label = md.utils.escapeHtml(token.content);
  const image = token.meta.embed && (resource?.kind === 'image' ? resource : readerImages.resolve(env.source, token.meta.target, { wiki: true }));
  if (image) {
    const size = /^(\d{1,4})(?:x(\d{1,4}))?$/u.exec(token.content);
    const alt = size ? md.utils.escapeHtml(posix.basename(token.meta.target.split('#', 1)[0])) : label;
    const width = size && Number(size[1]) > 0 ? ' width="' + Number(size[1]) + '"' : '';
    const height = size && Number(size[2]) > 0 ? ' height="' + Number(size[2]) + '"' : '';
    return '<img src="' + md.utils.escapeHtml(image.href) + '" alt="' + alt + '"' + width + height + ' loading="lazy" decoding="async">';
  }
  if (resource) return '<a href="' + md.utils.escapeHtml(resource.href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  if (token.meta.embed) return md.utils.escapeHtml(token.meta.raw);
  return href ? '<a href="' + md.utils.escapeHtml(href) + '">' + label + '</a>' : label;
};

const caseTaskBaseEmbeds = new Set(['![[Tasks.base#Session关联任务]]', '![[Bases/Tasks.base#Session关联任务]]']);
md.core.ruler.after('flowdesk_reading_markup', 'workbench_case_task_base', state => {
  if (state.env.kind !== 'case') return;
  const { tokens } = state;
  for (let index = tokens.length - 3; index >= 0; index--) {
    const [open, inline, close] = tokens.slice(index, index + 3);
    if (open.type !== 'paragraph_open' || inline.type !== 'inline' || close.type !== 'paragraph_close' ||
      inline.children.length !== 1 || inline.children[0].type !== 'workbench_wikilink' ||
      !caseTaskBaseEmbeds.has(inline.children[0].meta.raw)) continue;
    const embed = new state.Token('workbench_case_task_base', '', 0);
    embed.content = inline.children[0].meta.raw;
    tokens.splice(index, 3, embed);
  }
});

function renderCaseTaskRows(tasks) {
  const escape = value => md.utils.escapeHtml(value || '—');
  return tasks.map(task => {
    const href = '#/tasks/' + encodeURIComponent(task.path);
    const title = `<a href="${escape(href)}">${escape(task.title)}</a>`;
    const badge = task.archived ? ' <small>已归档</small>' : '';
    const due = task.due ? `<time datetime="${escape(task.due)}">${escape(task.due)}</time>` : '—';
    const children = !task.children.length ? '' : `<tr class="reader-case-task-children"><td colspan="6"><details>` +
      `<summary>${task.children.length} 项子任务</summary>${renderCaseTaskTable(task.children)}</details></td></tr>`;
    return `<tr><td>${title}${badge}</td><td>${escape(task.statusLabel)}</td><td>${escape(task.priorityLabel)}</td>` +
      `<td>${escape(task.dueLabel)}</td><td>${due}</td><td>${escape(task.projects.join('、'))}</td></tr>${children}`;
  }).join('');
}

function renderCaseTaskTable(tasks) {
  return '<table><thead><tr><th scope="col">任务</th><th scope="col">状态</th><th scope="col">优先级</th>' +
    '<th scope="col">截止</th><th scope="col">截止日期</th><th scope="col">项目</th></tr></thead>' +
    `<tbody>${renderCaseTaskRows(tasks)}</tbody></table>`;
}

md.renderer.rules.workbench_case_task_base = (tokens, index, _options, env) => {
  if (!env.caseTaskBase) return md.utils.escapeHtml(tokens[index].content);
  const { tasks, source } = env.caseTaskBase;
  const status = source.status === 'unavailable' ? '当前无法读取关联任务。'
    : source.status === 'degraded' ? source.detail : !tasks.length ? '当前 Case 暂无关联任务。' : '';
  return '<section class="reader-case-task-base" data-reader-feedback-ui aria-label="Session 关联任务">' +
    '<strong>Session 关联任务</strong>' + (status ? `<p role="status">${md.utils.escapeHtml(status)}</p>` : '') +
    (tasks.length ? renderCaseTaskTable(tasks) : '') + '</section>\n';
};

const progressFields = { '进展': 'progress', '完成': 'result', '结果': 'result', '下一步': 'next', '操作': 'operation' };
md.inline.ruler.before('text', 'workbench_progress_field', (state, silent) => {
  if (!state.env.workbenchProgress || (state.pos && state.src[state.pos - 1] !== '\n')) return false;
  const matched = /^(进展|完成|结果|下一步|操作)[：:][ \t]*/u.exec(state.src.slice(state.pos));
  if (!matched) return false;
  if (!silent) state.push('workbench_progress_field', '', 0).content = matched[1];
  state.pos += matched[0].length;
  return true;
});
md.renderer.rules.workbench_progress_field = (tokens, index) => {
  const label = tokens[index].content;
  return '<strong class="progress-field" data-field="' + progressFields[label] + '">' + label + '</strong>';
};
const defaultSoftbreak = md.renderer.rules.softbreak;
md.renderer.rules.softbreak = (tokens, index, options, env, self) => env.workbenchProgress ? '<br>\n'
  : defaultSoftbreak(tokens, index, options, env, self);
md.renderer.rules.workbench_progress = (tokens, index, options, env) => {
  return renderProgressTimeline(tokens[index].meta.events, (text, sourceLine) => {
    const progressEnvironment = { ...env, workbenchProgress: true,
      annotationLineOffset: env.annotationLineOffset === null ? null : env.annotationLineOffset + sourceLine };
    return renderTokens(md.parse(text, progressEnvironment), progressEnvironment);
  });
};

async function renderMarkdown(markdown, path, title, linked, kind, annotationLineOffset, projectPath, galleryFiles) {
  const byPath = new Map(linked.map(entry => [entry.path, entry]));
  const source = markdownBody(markdown);
  const env = { source: path, kind, byPath, projectPath, galleryFiles,
    annotationLineOffset: annotationLineOffset === null ? null : annotationLineOffset + removedLineCount(markdown, source) };
  const tokens = md.parse(source, env);
  if (tokens.some(token => token.type === 'workbench_case_task_base')) {
    env.caseTaskBase = await readCaseTaskBase({ vaultDir: vault, casePath: path });
  }
  if (tokens[0]?.type === 'heading_open' && tokens[0].tag === 'h1' && tokens[1]?.content?.trim() === title.trim()) {
    tokens.splice(0, 3);
  }
  const progress = kind === 'case' || kind === 'task' ? findProgressSection(source, tokens) : null;
  if (progress) {
    tokens.splice(progress.firstToken, progress.endToken - progress.firstToken, {
      type: 'workbench_progress', meta: { events: progress.events },
    });
  }
  return renderTokens(tokens, env);
}

function markdownBody(text) {
  return text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
}

function removedLineCount(original, body) {
  return original.slice(0, original.length - body.length).match(/\r\n?|\n/g)?.length ?? 0;
}

function renderTokens(tokens, env) {
  for (const token of tokens) {
    if (env.annotationLineOffset !== null && token.map
      && (token.nesting === 1 || token.type === 'fence' || token.type === 'code_block')) {
      token.attrSet('data-source-line', String(env.annotationLineOffset + token.map[0] + 1));
    }
    if (!token.children) continue;
    for (const child of token.children) {
      if (child.type === 'link_open') {
        const href = child.attrGet('href');
        const internal = href && internalHref(href, env);
        const resource = href && galleryResource(href, env);
        if (internal) {
          child.attrSet('href', internal);
        } else if (resource || (href && /^https?:\/\//i.test(href))) {
          if (resource) child.attrSet('href', resource.href);
          child.attrSet('target', '_blank');
          child.attrSet('rel', 'noopener noreferrer');
        } else {
          child.attrs = child.attrs.filter(([name]) => name !== 'href');
          child.attrSet('aria-disabled', 'true');
          child.attrSet('title', '从 Obsidian 原文查看此引用');
        }
      }
      if (child.type === 'image') {
        const src = child.attrGet('src');
        const resource = src && galleryResource(src, env);
        const image = resource?.kind === 'image' ? resource : src && readerImages.resolve(env.source, src);
        if (image) {
          child.attrSet('src', image.href);
          child.attrSet('loading', 'lazy');
          child.attrSet('decoding', 'async');
          continue;
        }
        child.type = 'text';
        child.content = child.content ? '〔图片：' + child.content + '〕' : '〔图片〕';
        child.children = null;
      }
    }
  }
  return md.renderer.render(tokens, md.options, env);
}

async function detail(kind, id, projectPath) {
  if (!id || (kind !== 'project' && !detailKinds.has(kind))) return null;
  const [library, hub, reviewData, galleryData] = await Promise.all([vaultIndex.get(), docHubIndex.get(), reviewIndex.get(), galleryIndex.get()]);
  const indexed = kind === 'document' && hub.documents.find(item => item.id === id);
  const snapshot = indexed && !library.projects.has(projectPath)
    ? null : await workspace(false, kind === 'project' ? id : projectPath);
  const collection = detailKinds.get(kind);
  let record = kind === 'project' ? library.projects.get(id)?.project
    : snapshot?.[collection].find(item => item.id === id) || indexed;
  if (!record && collection) record = (await reviewScope([id]))[collection].find(item => item.id === id);
  if (!record) return null;
  const knownDocumentPaths = new Set([...hub.documents, ...(snapshot?.documents ?? [])].map(item => item.path));
  const caseDocuments = kind === 'case' ? await Promise.all((record.documentPaths || [])
    .filter(path => !knownDocumentPaths.has(path)).map(path => readManagedDocument(library, path, hub.documents))) : [];
  const links = uniqueRecords([
    ...library.options.map(item => ({ ...item, kind: 'project' })),
    ...[...hub.documents, ...(snapshot?.documents ?? []), ...caseDocuments.filter(Boolean)].map(item => ({ ...item, kind: 'document' })),
    ...library.cases.values().map(item => ({ ...item, kind: 'case' })),
    ...(snapshot?.tasks ?? []).map(item => ({ ...item, kind: 'task' })),
    { ...record, kind },
  ]);
  const file = await readMarkdownBytes(record.path).catch(() => null);
  if (!file && kind !== 'task') return null;
  const rawMarkdown = file?.toString('utf8');
  const canAnnotate = Boolean(file) && reviewData.source.status === 'ok' && (kind !== 'task' || managedTaskPath(record.path));
  // TaskNotes owns task metadata. Use the same readable Vault source for the body and its annotations.
  const markdown = kind === 'task'
    ? (file ? markdownBody(rawMarkdown) : (await readTaskDetail(record.path))?.markdown)
    : rawMarkdown;
  if (typeof markdown !== 'string') throw new Error('invalid source body');
  const relatedSet = new Set([
    ...(record.taskPaths || []), ...(record.documentPaths || []), ...(record.casePaths || []),
    ...(kind === 'project' ? [...snapshot.documents, ...snapshot.cases].map(item => item.path) : []),
  ].map(path => path.normalize('NFC')));
  const relatedLinks = links.filter(item => relatedSet.has(item.path.normalize('NFC')))
    .map(({ kind, id, title }) => ({ kind, id, title }));
  const annotationLineOffset = canAnnotate ? removedLineCount(rawMarkdown, markdown) : null;
  return {
    id: record.id, path: record.path, title: record.title, markdown,
    record: { ...record, kind: record.kind || kind },
    html: await renderMarkdown(markdown, record.path, record.title, links, kind, annotationLineOffset, snapshot?.project?.path, galleryData.files),
    sourceUrl: 'obsidian://open?path=' + encodeURIComponent(join(vault, record.path)),
    annotationUrl: canAnnotate ? '/annotate/?document=' + encodeURIComponent(record.path) : null,
    sourceSha256: canAnnotate ? createHash('sha256').update(file).digest('hex') : null,
    relatedLinks,
  };
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function servePublicFile(request, response, [filename, contentType]) {
  const content = await readFile(join(root, 'public', filename));
  response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.length });
  response.end(request.method === 'HEAD' ? undefined : content);
}

function localRequest(request, guestRead) {
  const host = request.headers.host?.toLowerCase();
  const { localPort, remoteAddress } = request.socket;
  return remoteAddress === '127.0.0.1' && (host === '127.0.0.1:' + localPort || host === 'localhost:' + localPort)
    && (guestRead || request.headers['sec-fetch-site'] !== 'cross-site');
}

async function externalReviewCatalog(url, port) {
  const [vaultData, hub, galleryData] = await Promise.all([vaultIndex.get(), docHubIndex.get(), galleryIndex.get()]);
  const workCase = vaultData.cases.get(url.searchParams.get('case'));
  const requestedDocument = url.searchParams.get('document');
  const [linked, selected] = await Promise.all([
    workCase ? readPeriodDocuments(vaultData, [workCase], [], hub.documents) : { documents: [] },
    requestedDocument ? readManagedDocument(vaultData, requestedDocument, hub.documents) : null,
  ]);
  const suggested = new Set(linked.documents.map(item => item.path));
  const items = uniqueRecords([...hub.documents, ...linked.documents, ...[selected].filter(Boolean)]);
  const addresses = lanHost ? Object.values(networkInterfaces()).flat().filter(entry =>
    !entry.internal && privateIPv4(entry.address))
    .map(entry => 'http://' + entry.address + ':' + port) : [];
  return {
    caseTitle: workCase?.title,
    reviewOrigins: [...new Set(addresses)],
    ...(!externalPublicationEnabled && { publishingBlocked: '请先在 Obsidian 修改默认配对密钥并重启工作台，再发布外部链接。' }),
    documents: items.map(({ path, title, kind }) => ({ path, title, kind, suggested: suggested.has(path) })),
    galleries: galleryData.galleries.map(({ id, title, documentPath, href, pages }) =>
      ({ id, title, documentPath, href, pages: pages.map(({ title }) => ({ title })) })),
  };
}

async function handleWorkbench(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  try {
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) return json(response, 400, { error: '无效请求。' });
    const url = new URL(request.url, 'http://127.0.0.1');
    const readOnly = request.method === 'GET' || request.method === 'HEAD';
    const guestRoute = isGuestReviewPath(url.pathname);
    if (!lanHost && !localRequest(request, readOnly && guestRoute)) {
      return json(response, 403, { error: '无效工作台入口。' });
    }
    const pairingFile = pairingFiles.get(url.pathname);
    if (readOnly && pairingFile) return await servePublicFile(request, response, pairingFile);
    if (url.pathname === '/api/author-pairing') {
      if (readOnly) return json(response, 200, { required: Boolean(authorPairing), paired: Boolean(authorPairing?.hasAuthor(request)) });
      if (authorPairing) return await authorPairing.handlePair(request, response);
      return json(response, 409, { error: '作者配对尚未开启。' });
    }
    if (authorPairing && !guestRoute && !authorPairing.hasAuthor(request)) {
      if (readOnly && url.pathname === '/') return response.writeHead(302, { Location: '/pair' }).end();
      return json(response, 401, { code: 'author_pairing_required', error: '请先配对这个浏览器。' });
    }
    if (url.pathname.startsWith(readerImagesRoute)) {
      return await readerImages.serveReaderImage(request, response, url.pathname);
    }
    if (url.pathname === '/api/admin/external-reviews/catalog') {
      if (!readOnly) return json(response, 405, { error: '此操作需要读取请求。' });
      if (!externalReviewEnabled) return json(response, 403, { error: '请在 Obsidian 中开启作者配对，再发起外部评审。' });
      return json(response, 200, await externalReviewCatalog(url, request.socket.localPort));
    }
    if (url.pathname.startsWith(galleryCollectionsRoute)) {
      return await serveGalleryCollection(vault, await galleryIndex.get(), url.pathname, request, response);
    }
    if (isGalleryPath(url.pathname)) {
      return gallery ? await gallery(request, response) : json(response, 404, { error: '未找到图集。' });
    }
    if (isAdminReviewPage(url.pathname) || guestRoute
      || url.pathname.startsWith('/api/admin/')) {
      return await reviewHandler(request, response);
    }
    if (!readOnly) return json(response, 405, { error: '工作台仅提供读取。' });
    const force = url.searchParams.get('refresh') === '1';
    const projectPath = url.searchParams.get('project');
    if (url.pathname === '/api/workbench') return json(response, 200, await workspace(force, projectPath));
    if (url.pathname === '/api/workbench/period') {
      const range = periodRange(url.searchParams.get('from'), url.searchParams.get('to'));
      if (!range) return json(response, 400, { error: '请选择有效的开始和结束日期。' });
      const stage = await workspacePeriod(range, projectPath, force);
      return stage ? json(response, 200, stage) : json(response, 404, { error: '未找到指定项目。' });
    }
    if (url.pathname === '/api/doc-hub') {
      const [hub, reviewData, galleryData] = await Promise.all([docHubIndex.get(force), reviewIndex.get(force), galleryIndex.get(force)]);
      const paths = new Set(hub.documents.map(item => item.path));
      const reviews = reviewData.reviews.filter(round => round.documentPaths.every(path => paths.has(path)));
      const source = { ...hub.source };
      if (galleryData.galleries.length && source.status === 'unavailable') source.status = 'degraded';
      if (galleryData.unreadable) {
        if (source.status === 'ok') source.status = 'degraded';
        source.detail = [source.detail, `有 ${galleryData.unreadable} 项图集文件或目录无法读取。`].filter(Boolean).join('');
      }
      return json(response, 200, { ...hub, source, galleries: galleryData.galleries, reviews });
    }
    if (url.pathname === '/api/review-summary') {
      const documentPath = url.searchParams.get('document');
      const roundId = url.searchParams.get('round');
      const { reviews } = await reviewIndex.get();
      const round = reviews.find(review => review.id === roundId && review.documentPaths.includes(documentPath));
      const scope = round && await reviewScope(round.documentPaths);
      const allowed = scope && new Set([...scope.projects, ...scope.cases, ...scope.tasks, ...scope.documents].map(item => item.path));
      if (!allowed || !round.documentPaths.every(path => allowed.has(path))) {
        return json(response, 404, { error: '这份资料在当前工作台中没有对应评审。' });
      }
      try {
        const data = await readReviewDetails({ store: reviewStore, roundId, documentPath });
        if (data.round.mode !== 'live') {
          const currentSha256 = await readMarkdownBytes(documentPath).then(bytes => createHash('sha256').update(bytes).digest('hex'), () => null);
          data.document.sourceStatus = currentSha256 === null ? 'unavailable'
            : currentSha256 === data.document.sha256 ? 'current' : 'stale';
        }
        return json(response, 200, data);
      } catch (error) {
        const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
        return json(response, status, { error: '暂时读不到这轮的评审回执。' });
      }
    }
    if (url.pathname === '/api/detail') {
      const result = await detail(url.searchParams.get('kind'), url.searchParams.get('id'), projectPath);
      return result ? json(response, 200, result) : json(response, 404, { error: '此条目不在当前工作台，或来源暂不可读。' });
    }
    const file = publicFiles.get(url.pathname);
    if (!file) return json(response, 404, { error: '找不到页面。' });
    return await servePublicFile(request, response, file);
  } catch (error) {
    console.error('Workbench request failed:', error.code || error.name || 'error');
    if (!response.headersSent) json(response, 500, { error: '本机资料暂不可读，请刷新后重试。' });
    else response.destroy();
  }
}

function isGalleryPath(pathname) {
  return pathname === '/gallery' || pathname.startsWith('/gallery/');
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

const server = createServer(handleWorkbench);
let activePort;
try {
  activePort = await listen(server, port, lanHost || '127.0.0.1');
} catch (error) {
  if (process.connected) await new Promise(done => process.send({
    type: 'flowdesk-workbench-start-error', code: error.code || 'START_FAILED', errorMessage: error.message,
  }, done));
  server.close();
  throw error;
}

console.log('FlowDesk 工作台 http://127.0.0.1:' + activePort);
console.log('评审数据 ' + dataDir);
if (lanHost) console.log('局域网监听 ' + lanHost + ':' + activePort);
if (process.connected) process.send({ type: 'flowdesk-workbench-ready', port: activePort, lanHost });
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  if (process.connected) process.disconnect();
}
for (const event of ['SIGTERM', 'SIGINT', 'disconnect']) process.once(event, shutdown);
