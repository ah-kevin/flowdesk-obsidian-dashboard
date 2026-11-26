import {
  closeSync, constants, existsSync, fstatSync, linkSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, readdirSync, readSync, realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import {
  basename, dirname, extname, isAbsolute, join, posix, relative, resolve, sep,
} from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import MarkdownIt from 'markdown-it';
import { captureSharedGalleries, sharedGalleryAsset, writeSharedGalleries } from '../flowdesk-workbench/shared-gallery.mjs';

const maxDocumentBytes = 2 * 1024 * 1024;
const maxAssetBytes = 25 * 1024 * 1024;
const maxRoundBytes = 100 * 1024 * 1024;
const maxFiles = 100;
const maxLiveCacheBytes = 24 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const submissionIdPattern = /^[a-zA-Z0-9_.:-]{1,128}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const assetTypes = new Map([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.avif', 'image/avif'],
  ['.pdf', 'application/pdf'], ['.txt', 'text/plain; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'], ['.tsv', 'text/tab-separated-values; charset=utf-8'],
  ['.mp4', 'video/mp4'], ['.webm', 'video/webm'], ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
]);
const decisions = new Set(['approve', 'changes', 'comment']);
const itemKinds = new Set(['comment', 'highlight', 'suggestion']);
const publicLiveItemKinds = new Set(['comment', 'highlight']);
const managedDirectRoots = new Map([
  ['project', ['Notes/Projects/']],
  ['case', ['Notes/Sessions/']],
  ['task', ['Tasks/', 'TaskNotes/']],
  ['document', ['Notes/Research/']],
]);
const directAuthor = { id: 'local-author', reviewer: '工作台批注' };
const md = new MarkdownIt({ html: false, linkify: false });

function error(status, message) {
  return Object.assign(new Error(message), { status });
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function directRoundId(filePath) {
  const hex = hash('flowdesk-direct-annotation\0' + filePath);
  // Use the existing UUID-shaped round directory contract.
  return [hex.slice(0, 8), hex.slice(8, 12), '4' + hex.slice(13, 16), '8' + hex.slice(17, 20), hex.slice(20, 32)].join('-');
}

function visiblePath(filePath) {
  return filePath.length > 0
    && !isAbsolute(filePath)
    && !filePath.includes('\\')
    && !/[\x00-\x1f\x7f]/.test(filePath)
    && filePath.split('/').every(part => part && !part.startsWith('.'));
}

function sourceKind(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension !== '.md') return assetTypes.has(extension) ? 'asset' : null;
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.startsWith('notes/plans/')) return 'plan';
  if (lowerPath.startsWith('notes/docs/')) return 'doc';
  return 'note';
}

function cleanText(value, field, maxLength, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > maxLength || (required && !value.trim())) {
    throw error(400, `${field}格式不正确或超过 ${maxLength} 字符`);
  }
  return value;
}

function uniquePaths(value, field, required = false) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > maxFiles || (required && !value.length)) {
    throw error(400, `${field}必须包含有效的资料路径，最多 ${maxFiles} 项`);
  }
  return [...new Set(value.map(filePath => cleanText(filePath, field, 1024, true)))];
}

function decodeTarget(target) {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function splitSource(source) {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
    if (end !== -1) {
      return { frontmatter: lines.slice(1, end), lines: lines.slice(end + 1), offset: end + 1 };
    }
  }
  return { frontmatter: [], lines, offset: 0 };
}

function documentTitle(parts, filePath) {
  const yamlTitle = parts.frontmatter.find(line => /^title\s*:/i.test(line))
    ?.replace(/^title\s*:\s*/i, '').trim().replace(/^(["'])(.*)\1$/, '$2');
  const heading = parts.lines.find(line => /^#\s+\S/.test(line))
    ?.replace(/^#\s+/, '').trim().replace(/\s+#+$/, '');
  return yamlTitle || heading || basename(filePath, extname(filePath));
}

function wikiLabel(target) {
  const [localPath, section] = target.split('#', 2);
  return basename(localPath, extname(localPath)) || section || '链接';
}

md.inline.ruler.before('link', 'review_wiki', (state, silent) => {
  const start = state.pos;
  const embed = state.src.startsWith('![[', start);
  if (!embed && !state.src.startsWith('[[', start)) return false;

  const open = start + (embed ? 3 : 2);
  const close = state.src.indexOf(']]', open);
  if (close === -1 || close >= state.posMax) return false;

  const content = state.src.slice(open, close);
  if (!content || /[\r\n]/.test(content)) return false;

  const separator = content.indexOf('|');
  const target = (separator === -1 ? content : content.slice(0, separator)).trim();
  if (!target) return false;

  if (!silent) {
    const token = state.push('review_wiki', '', 0);
    const alias = separator === -1 ? '' : content.slice(separator + 1).trim();
    token.content = alias && !(embed && /^\d+(?:x\d+)?$/.test(alias)) ? alias : wikiLabel(target);
    token.meta = { target, style: 'wiki', embed, insideLink: state.linkLevel > 0 };
  }

  state.pos = close + 2;
  return true;
});

function tokenReference(token) {
  if (token.type === 'review_wiki') return token.meta;
  if (token.type === 'link_open') return { target: token.attrGet('href'), style: 'markdown' };
  if (token.type === 'image') return { target: token.attrGet('src'), style: 'markdown', embed: true };
  return null;
}

function collectReferences(tokens, references = []) {
  for (const token of tokens) {
    const reference = tokenReference(token);
    if (reference?.target) references.push(reference);
    if (token.children) collectReferences(token.children, references);
  }
  return references;
}

function renderedReference(token, env) {
  const reference = tokenReference(token);
  return env.sharedReference(reference);
}

function safeLink(href, label, docId) {
  const escape = md.utils.escapeHtml;
  const documentData = docId ? ` data-doc-id="${escape(docId)}"` : '';
  return `<a href="${escape(href)}"${documentData}>${label}</a>`;
}

function safeImage(href, label) {
  const escape = md.utils.escapeHtml;
  return `<img src="${escape(href)}" alt="${escape(label)}" loading="lazy">`;
}

md.renderer.rules.review_wiki = (tokens, index, options, env) => {
  const token = tokens[index];
  const link = renderedReference(token, env);
  if (token.meta.embed && link?.mime?.startsWith('image/')) {
    return safeImage(link.href, token.content);
  }
  const label = md.utils.escapeHtml(token.content);
  return link && !token.meta.insideLink ? safeLink(link.href, label, link.docId) : label;
};

md.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const link = renderedReference(token, env);
  const label = renderer.renderInlineAsText(token.children, options, env);
  if (link?.mime?.startsWith('image/')) return safeImage(link.href, label);
  return link ? safeLink(link.href, md.utils.escapeHtml(label), link.docId) : md.utils.escapeHtml(label);
};

md.renderer.rules.link_open = (tokens, index, options, env) => {
  const link = renderedReference(tokens[index], env);
  const closing = tokens.find((token, tokenIndex) => tokenIndex > index && token.type === 'link_close');
  if (closing) closing.meta = { linked: !!link };
  if (!link) return '<span>';
  const escape = md.utils.escapeHtml;
  const documentData = link.docId ? ` data-doc-id="${escape(link.docId)}"` : '';
  return `<a href="${escape(link.href)}"${documentData}>`;
};
md.renderer.rules.link_close = (tokens, index) => tokens[index].meta?.linked ? '</a>' : '</span>';

function textForTokens(tokens) {
  return tokens.map(token => {
    if (token.children) return textForTokens(token.children);
    if (['text', 'code_inline', 'review_wiki', 'fence', 'code_block'].includes(token.type)) {
      return token.content;
    }
    if (['softbreak', 'hardbreak', 'paragraph_close', 'heading_close', 'tr_close'].includes(token.type)) {
      return '\n';
    }
    if (token.type === 'td_close' || token.type === 'th_close') return ' ';
    return '';
  }).join('');
}

function parseDocument(source) {
  const parts = splitSource(source);
  return { ...parts, tokens: md.parse(parts.lines.join('\n'), {}) };
}

function documentBlocks(parsed, documentId) {
  const starts = [];
  parsed.tokens.forEach((token, index) => {
    if (token.map && token.level === 0 && token.nesting !== -1) starts.push(index);
  });
  return starts.map((start, index) => {
    const tokens = parsed.tokens.slice(start, starts[index + 1]);
    const [lineStart, lineEnd] = tokens[0].map;
    return {
      id: `${documentId}-${index + 1}`,
      lineStart: parsed.offset + lineStart + 1,
      lineEnd: parsed.offset + lineEnd,
      text: textForTokens(tokens).trim(),
      raw: parsed.lines.slice(lineStart, lineEnd).join('\n'),
      tokens,
    };
  });
}

function comparableText(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

function quoteMatch(block, quote, offset) {
  if (Number.isInteger(offset) && block.text.slice(offset, offset + quote.length) === quote) {
    return { text: block.text, quote, index: offset };
  }
  const text = comparableText(block.text);
  const normalized = comparableText(quote);
  if (!normalized) return null;
  const index = text.indexOf(normalized);
  if (index === -1 || text.indexOf(normalized, index + 1) !== -1) return null;
  return { text, quote: normalized, index };
}

function locateLiveAnchor(document, item) {
  if (!document?.sha256) return { status: 'unavailable' };
  const matchResult = (status, block) => ({
    status, blockId: block.id, startLine: block.lineStart, endLine: block.lineEnd,
  });
  if (item.source.sha256 === document.sha256) {
    const block = document.blocks.find(candidate => candidate.id === item.blockId);
    return block && quoteMatch(block, item.quote, item.offset) ? matchResult('current', block) : { status: 'unresolved' };
  }

  const needle = comparableText(item.quote);
  if (!needle) return { status: 'unresolved' };
  let unique = null;
  for (const block of document.blocks) {
    const text = comparableText(block.text);
    const hit = text.indexOf(needle);
    if (hit === -1) continue;
    if (unique || text.indexOf(needle, hit + 1) !== -1) return { status: 'unresolved' };
    unique = block;
  }
  return unique ? matchResult('relocated', unique) : { status: 'unresolved' };
}

export function liveAnchorLookup({ id, sha256, markdown }) {
  const document = { sha256, blocks: documentBlocks(parseDocument(markdown), id) };
  return item => locateLiveAnchor(document, item);
}

function referenceLocation(sourcePath, { target, style }) {
  if (!target || target.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(target)) return null;
  const separator = target.indexOf('#');
  const section = separator < 0 ? '' : decodeTarget(target.slice(separator + 1));
  const path = decodeTarget(target.split(/[?#]/, 1)[0]);
  if (!path) return section ? { section, paths: [sourcePath] } : null;
  if (path.includes('\\') || /[\x00-\x1f\x7f]/.test(path)) return { issue: '资料路径无效' };

  const localPath = path.replace(/^\/+/, '');
  const relativePath = posix.normalize(posix.join(posix.dirname(sourcePath), localPath));
  const rootPath = posix.normalize(localPath);
  const candidates = path.startsWith('/')
    ? [rootPath]
    : style === 'wiki' && localPath.includes('/') && !localPath.startsWith('.')
      ? [rootPath, relativePath]
      : [relativePath, rootPath];
  const paths = [...new Set(candidates)].flatMap(candidate =>
    style === 'wiki' && extname(candidate).toLowerCase() !== '.md'
      ? [candidate, `${candidate}.md`]
      : [candidate]);
  const wikiName = style === 'wiki' && !localPath.includes('/') ? localPath : null;
  return { section, paths, localPath, wikiName };
}

function sectionKey(title) {
  return title.normalize('NFC').trim().toLowerCase().replace(/\s+/gu, ' ');
}

function headingIndex(blocks) {
  const headings = new Map();
  for (const { id, tokens } of blocks) {
    tokens.forEach((token, index) => {
      if (token.type !== 'heading_open') return;
      const title = sectionKey(textForTokens([tokens[index + 1]]));
      if (!title) return;
      const slug = title.replace(/[^\p{L}\p{M}\p{N}_ -]/gu, '').replaceAll(' ', '-');
      for (const key of new Set([title, slug])) {
        if (key) headings.set(key, headings.has(key) ? null : id);
      }
    });
  }
  return headings;
}

function filesByName(files) {
  const names = new Map();
  for (const file of files) {
    const name = basename(file.path).normalize('NFC').toLowerCase();
    const entries = names.get(name) ?? [];
    entries.push(file);
    names.set(name, entries);
  }
  return names;
}

function frozenReferences(round, blocksByDocument) {
  const galleryFiles = (round.galleries ?? []).flatMap(group => group.files.map(file => ({
    path: `Attachments/archify/${group.id}/${file.path}`, mime: file.mime,
    href: galleryHref(round.id, group.id, file.path),
  })));
  const files = [...round.documents, ...round.assets, ...galleryFiles];
  const filesByPath = new Map(files.map(file => [file.path.normalize('NFC'), file]));
  const names = filesByName(files);
  const headings = new Map([...blocksByDocument].map(([id, blocks]) => [id, headingIndex(blocks)]));
  return (source, reference) => {
    const location = referenceLocation(source.path, reference);
    if (!location || location.issue) return null;
    const { paths, wikiName, section } = location;
    let file;
    for (const path of paths) {
      if (!visiblePath(path)) continue;
      file = filesByPath.get(path.normalize('NFC'));
      if (file) break;
    }
    if (!file && wikiName) {
      const name = wikiName.normalize('NFC').toLowerCase();
      const matches = names.get(name) ?? names.get(`${name}.md`) ?? [];
      if (matches.length === 1) [file] = matches;
    }
    if (!file) return null;
    if (file.href) return { href: file.href + (section ? '#' + encodeURIComponent(section) : ''), mime: file.mime };
    if (file.mime) return { href: `/api/review/${round.id}/assets/${file.id}`, mime: file.mime };

    const blockId = section && headings.get(file.id)?.get(sectionKey(section));
    if (round.direct) {
      const params = new URLSearchParams({ document: file.path });
      if (blockId) params.set('section', blockId);
      return { href: '/annotate/?' + params, docId: file.id, blockId };
    }
    const suffix = blockId ? `?section=${encodeURIComponent(blockId)}` : '';
    return { href: `/r/${round.id}/doc/${file.id}${suffix}`, docId: file.id, blockId };
  };
}

function galleryHref(roundId, groupId, path) {
  return `/api/review/${roundId}/galleries/${encodeURIComponent(groupId)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function gallerySignature(roundId, galleryId, invite) {
  return createHmac('sha256', Buffer.from(invite.tokenHash, 'hex'))
    .update(JSON.stringify(['flowdesk-gallery-access-v1', roundId, galleryId, invite.id])).digest('base64url');
}

function withReviewerGalleryAccess(round, invite, review) {
  const prefixes = new Map((round.galleries ?? []).map(({ id }) => {
    const base = `/api/review/${round.id}/`;
    const gallery = encodeURIComponent(id);
    const signature = gallerySignature(round.id, id, invite);
    return [`${base}galleries/${gallery}/`, `${base}gallery-access/${gallery}/${invite.id}.${signature}/`];
  }));
  if (!prefixes.size) return review;
  const withAccess = path => {
    for (const [from, to] of prefixes) {
      if (path.startsWith(from)) return to + path.slice(from.length);
    }
    return path;
  };
  for (const gallery of review.galleries) {
    if (gallery.href) gallery.href = withAccess(gallery.href);
    for (const page of gallery.pages) page.href = withAccess(page.href);
  }
  // Saved Markdown renders escaped text and generates gallery URLs only in these link/image attributes.
  for (const document of review.documents) {
    for (const block of document.blocks) {
      block.html = block.html.replace(/(<a href="|<img src=")([^"<>]+)"/gu,
        (_, attribute, path) => attribute + withAccess(path) + '"');
    }
  }
  return review;
}

function gallerySummary(groups, roundId) {
  return (groups ?? []).map(({ id, title, entryPath, pages }) => ({
    id, title, entryPath,
    ...(roundId && (entryPath || pages.length === 1) ? { href: galleryHref(roundId, id, entryPath || pages[0].path) } : {}),
    pages: pages.map(({ title, path }) => ({ title, path, ...(roundId ? { href: galleryHref(roundId, id, path) } : {}) })),
  }));
}

function externalDocumentPath(path) {
  return /^Notes\/(?:Plans|Docs|Research)\//u.test(path) && /\.md$/iu.test(path);
}

function renderSnapshotBlock(tokens, sharedReference) {
  return md.renderer.render(tokens, md.options, { sharedReference });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, object, createOnly = false) {
  const temporary = join(dirname(filePath), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(object, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    if (createOnly) linkSync(temporary, filePath);
    else renameSync(temporary, filePath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function publicInvite(record) {
  const { tokenHash, ...invite } = record;
  return invite;
}

function publicSubmission(record) {
  const { inviteId, submittedAtMilliseconds, requestHash, ...submission } = record;
  return submission;
}

function reviewerMarkdown(block) {
  // A rendered block can omit link destinations, HTML, and fence metadata.
  // Keep those blocks on the text basis instead of sharing their original Markdown.
  const { raw } = block;
  if (typeof raw === 'string' && !/[\[<]|`{3,}|~{3,}/.test(raw)) return raw;
}

function submissionContent(round, payload) {
  const { decision } = payload;
  if (!decisions.has(decision)) throw error(400, '请选择有效的评审结论');
  if (!Array.isArray(payload.items) || payload.items.length > 250) {
    throw error(400, '批注须为数组，最多 250 项');
  }

  const documentBlocks = new Map(round.documents.map(document => [
    document.id, new Map(document.blocks.map(block => [block.id, block])),
  ]));
  const itemIds = new Set();
  const items = payload.items.map(item => {
    const block = item && documentBlocks.get(item.documentId)?.get(item.blockId);
    if (!item || typeof item.id !== 'string' || !submissionIdPattern.test(item.id) || itemIds.has(item.id)
      || !itemKinds.has(item.kind) || !block) {
      throw error(400, '批注 ID、类型或定位无效');
    }
    itemIds.add(item.id);
    return {
      id: item.id, documentId: item.documentId, blockId: item.blockId, kind: item.kind,
      quote: cleanText(item.quote, '引用', 20000),
      comment: cleanText(item.comment, '批注', 20000),
      replacement: cleanText(item.replacement, '建议修改', 20000),
      required: item.required === true,
      ...(item.kind === 'suggestion' && item.sourceFormat === 'markdown' && reviewerMarkdown(block) !== undefined
        ? { sourceFormat: 'markdown' } : {}),
      ...(Number.isSafeInteger(item.offset) && item.offset >= 0 && item.offset <= maxDocumentBytes
        ? { offset: item.offset } : {}),
    };
  });
  return { decision, summary: cleanText(payload.summary, '评审意见', 20000), items };
}

function repeatedSubmission(round, previous, content) {
  if (!isDeepStrictEqual(submissionContent(round, previous), content)) throw submissionConflict();
  return publicSubmission(previous);
}

function liveSubmissionContent(round, payload) {
  const { decision } = payload;
  if (!decisions.has(decision)) throw error(400, '请选择有效的评审结论');
  const allowedItemKinds = round.direct ? itemKinds : publicLiveItemKinds;
  const sharedDocuments = new Set(round.documents.map(document => document.id));
  const versions = payload.documentVersions;
  if (!Array.isArray(versions) || !versions.length || versions.length > sharedDocuments.size) {
    throw error(400, '缺少有效的文档评审版本');
  }
  const seen = new Set();
  const documentVersions = versions.map(entry => {
    if (!entry || !sharedDocuments.has(entry.documentId) || seen.has(entry.documentId)
      || typeof entry.sha256 !== 'string' || !sha256Pattern.test(entry.sha256)) {
      throw error(400, '文档评审版本无效');
    }
    seen.add(entry.documentId);
    return { documentId: entry.documentId, sha256: entry.sha256 };
  }).sort((first, second) => first.documentId.localeCompare(second.documentId));
  if (!Array.isArray(payload.items) || payload.items.length > 250) {
    throw error(400, '批注须为数组，最多 250 项');
  }
  const itemIds = new Set();
  const items = payload.items.map(item => {
    if (!item || typeof item.id !== 'string' || !submissionIdPattern.test(item.id) || itemIds.has(item.id)
      || !seen.has(item.documentId) || !allowedItemKinds.has(item.kind)
      || typeof item.blockId !== 'string' || !item.blockId.startsWith(item.documentId + '-')
      || !/^[1-9][0-9]{0,6}$/.test(item.blockId.slice(item.documentId.length + 1))
      || typeof item.sourceSha256 !== 'string' || !sha256Pattern.test(item.sourceSha256)) {
      throw error(400, '批注 ID、类型、版本或定位无效');
    }
    itemIds.add(item.id);
    let suggestion;
    if (item.kind === 'suggestion') {
      if (typeof item.replacement !== 'string') throw error(400, '请提供建议改文的内容');
      suggestion = { replacement: cleanText(item.replacement, '建议改文', 20000) };
    }
    return {
      id: item.id, documentId: item.documentId, blockId: item.blockId, kind: item.kind,
      quote: cleanText(item.quote, '引用', 20000, true),
      comment: cleanText(item.comment, '批注', 20000, item.kind === 'comment'),
      ...suggestion,
      required: item.required === true,
      sourceSha256: item.sourceSha256,
      prefix: cleanText(item.prefix, '引用前文', 200),
      suffix: cleanText(item.suffix, '引用后文', 200),
      ...(Number.isSafeInteger(item.offset) && item.offset >= 0 && item.offset <= maxDocumentBytes
        ? { offset: item.offset } : {}),
    };
  });
  return { decision, summary: cleanText(payload.summary, '评审意见', 20000), documentVersions, items };
}

function submissionConflict() {
  return Object.assign(error(409, '此提交编号已用于另一份反馈，请核对当前草稿。'), {
    code: 'submission_conflict',
  });
}

export function createStore({ vaultDir, dataDir, defaultMode = 'snapshot' }) {
  if (!['live', 'snapshot'].includes(defaultMode)) throw new Error('无效的评审模式');
  const vault = realpathSync(vaultDir);
  const rounds = join(resolve(dataDir), 'rounds');
  mkdirSync(rounds, { recursive: true, mode: 0o700 });
  const legacySectionCache = new Map();
  const liveVersionCache = new Map();
  let liveVersionBytes = 0;

  function sourceFile(filePath) {
    if (!visiblePath(filePath)) throw error(400, '资料路径无效');
    const kind = sourceKind(filePath);
    if (!kind) throw error(400, '附件类型不受支持');

    let absolute;
    try {
      absolute = realpathSync(join(vault, filePath));
    } catch (failure) {
      if (['ENOENT', 'ENOTDIR'].includes(failure.code)) throw error(404, '未找到资料');
      if (failure.code === 'ELOOP') throw error(400, '资料路径无效');
      if (['EACCES', 'EPERM'].includes(failure.code)) throw error(403, '无法读取资料');
      throw failure;
    }

    const actualPath = relative(vault, absolute).split(sep).join('/');
    if (!visiblePath(actualPath) || !sourceKind(actualPath)
      || extname(filePath).toLowerCase() !== extname(actualPath).toLowerCase()) {
      throw error(400, '资料路径无效');
    }
    return { path: actualPath, kind: sourceKind(actualPath), absolute };
  }

  function readSource(source, limit) {
    let descriptor;
    try {
      descriptor = openSync(source.absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (failure) {
      if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(failure.code)) throw error(409, '资料在读取时发生变化，请重试');
      if (['EACCES', 'EPERM'].includes(failure.code)) throw error(403, '无法读取资料');
      throw failure;
    }
    try {
      const info = fstatSync(descriptor);
      if (!info.isFile()) throw error(400, '评审资料必须是普通文件');
      if (info.size > limit) throw error(413, '资料超过大小限制');

      const bytes = Buffer.allocUnsafe(info.size);
      let offset = 0;
      while (offset < bytes.length) {
        const size = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
        if (size === 0) throw error(409, '资料在读取时发生变化，请重试');
        offset += size;
      }
      const after = fstatSync(descriptor);
      if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) {
        throw error(409, '资料在读取时发生变化，请重试');
      }
      return bytes;
    } finally {
      closeSync(descriptor);
    }
  }

  function scan(start, add) {
    let entries;
    try {
      entries = readdirSync(join(vault, start), { withFileTypes: true });
    } catch (failure) {
      if (failure.code === 'ENOENT' || failure.code === 'EACCES') return;
      throw failure;
    }
    for (const entry of entries) {
      const filePath = posix.join(start, entry.name);
      if (!visiblePath(filePath)) continue;
      if (entry.isDirectory()) scan(filePath, add);
      else if (entry.isFile() && sourceKind(filePath)) add(filePath);
    }
  }

  function references() {
    let names;
    return (source, reference) => {
      const location = referenceLocation(source.path, reference);
      if (!location) return {};
      if (location.issue) return { issue: location.issue };
      const { paths, localPath, wikiName } = location;
      if (localPath === undefined) return { resolved: source };
      if (extname(localPath) && !sourceKind(localPath) && reference.style !== 'wiki') {
        return { issue: '附件类型不受支持' };
      }

      let invalid;
      for (const path of paths) {
        if (!visiblePath(path)) {
          invalid = '资料路径无效';
          continue;
        }
        if (!sourceKind(path)) continue;
        try {
          return { resolved: sourceFile(path) };
        } catch (failure) {
          if (!failure.status) throw failure;
          if (failure.status !== 404) invalid = failure.message;
        }
      }

      if (wikiName) {
        if (!names) {
          const files = [];
          scan('', filePath => files.push({ path: filePath }));
          names = filesByName(files);
        }
        const name = wikiName.normalize('NFC').toLowerCase();
        const matches = names.get(name) ?? names.get(`${name}.md`) ?? [];
        if (matches.length === 1) {
          try {
            return { resolved: sourceFile(matches[0].path) };
          } catch (failure) {
            if (!failure.status) throw failure;
            return { issue: failure.message };
          }
        }
        if (matches.length > 1) return { issue: '存在多个同名资料' };
      }

      if (extname(localPath) && !sourceKind(localPath)) return { issue: '未找到资料或附件类型不受支持' };
      return { issue: invalid ?? '未找到资料' };
    };
  }

  function describe(source) {
    const title = source.kind === 'asset'
      ? basename(source.path)
      : documentTitle(splitSource(readSource(source, maxDocumentBytes).toString('utf8')), source.path);
    return { path: source.path, title, kind: source.kind };
  }

  function documents() {
    const entries = [];
    for (const directory of ['Notes/Plans', 'Notes/Docs']) {
      try {
        const absolute = realpathSync(join(vault, directory));
        if (!visiblePath(relative(vault, absolute).split(sep).join('/'))) continue;
      } catch (failure) {
        if (failure.code === 'ENOENT') continue;
        throw failure;
      }
      scan(directory, filePath => {
        if (sourceKind(filePath) === 'asset') return;
        try {
          entries.push(describe(sourceFile(filePath)));
        } catch (failure) {
          if (!failure.status) throw failure;
        }
      });
    }
    return entries.sort((first, second) => first.path.localeCompare(second.path, 'zh-CN'));
  }

  function preview(paths) {
    const sources = uniquePaths(paths, '资料路径').map(sourceFile);
    const resolveReference = references();
    const entries = new Map();
    const issues = [];
    const knownIssues = new Set();

    function addIssue(source, target, reason) {
      const key = JSON.stringify([source, target, reason]);
      if (knownIssues.has(key)) return;
      knownIssues.add(key);
      issues.push({ source, target, reason });
    }

    for (const source of sources) entries.set(source.path, { ...describe(source), selected: true });
    for (const source of sources) {
      if (source.kind === 'asset') continue;
      const parsed = parseDocument(readSource(source, maxDocumentBytes).toString('utf8'));
      const bodyReferences = collectReferences(parsed.tokens);
      const metadataReferences = collectReferences(md.parseInline(parsed.frontmatter.join('\n'), {}));
      for (const reference of [...bodyReferences, ...metadataReferences]) {
        const { resolved, issue } = resolveReference(source, reference);
        if (issue) addIssue(source.path, reference.target, issue);
        if (!resolved || entries.has(resolved.path)) continue;
        try {
          entries.set(resolved.path, { ...describe(resolved), selected: true });
        } catch (failure) {
          if (!failure.status) throw failure;
          addIssue(source.path, reference.target, failure.message);
        }
      }
    }

    return { documents: [...entries.values()], issues };
  }

  function roundDir(id) {
    if (typeof id !== 'string' || !uuidPattern.test(id)) throw error(404, '评审轮次不存在');
    return join(rounds, id);
  }

  function readRound(id) {
    try {
      return readJson(join(roundDir(id), 'round.json'));
    } catch (failure) {
      if (failure.code === 'ENOENT') throw error(404, '评审轮次不存在');
      throw failure;
    }
  }

  function guestRound(id) {
    const round = readRound(id);
    if (round.direct) throw error(404, '评审轮次不存在');
    return round;
  }

  function directRound(id) {
    const round = readRound(id);
    if (round.direct !== true || round.mode !== 'live') throw error(404, '本机批注不存在');
    return round;
  }

  function saveRound(round, populate) {
    const staged = mkdtempSync(join(rounds, '.' + round.id + '-'));
    try {
      mkdirSync(join(staged, 'submissions'), { mode: 0o700 });
      populate?.(staged);
      writeJson(join(staged, 'round.json'), round);
      renameSync(staged, roundDir(round.id));
    } finally {
      rmSync(staged, { recursive: true, force: true });
    }
  }

  function readSubmissions(id) {
    const directory = join(roundDir(id), 'submissions');
    return readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^[0-9a-f]{64}\.json$/.test(entry.name))
      .map(entry => readJson(join(directory, entry.name)))
      .sort((first, second) => {
        const firstTime = first.submittedAtMilliseconds ?? Date.parse(first.submittedAt);
        const secondTime = second.submittedAtMilliseconds ?? Date.parse(second.submittedAt);
        return firstTime - secondTime;
      });
  }

  function frozenDocumentBlocks(roundId, document) {
    if (!uuidPattern.test(document.id)) return null;
    const absolute = join(roundDir(roundId), 'snapshots', document.id);
    let bytes;
    try {
      bytes = readSource({ absolute }, maxDocumentBytes);
    } catch (failure) {
      if (failure.status) return null;
      throw failure;
    }
    if (hash(bytes) !== document.sha256) return null;

    const blocks = documentBlocks(parseDocument(bytes.toString('utf8')), document.id);
    if (blocks.length !== document.blocks.length) return null;
    for (const [index, block] of blocks.entries()) {
      const previous = document.blocks[index];
      if (previous.lineStart !== block.lineStart || previous.lineEnd !== block.lineEnd || previous.raw !== block.raw) return null;
      block.id = previous.id;
    }
    return blocks;
  }

  function legacySectionHtml(round) {
    if (round.version >= 2) return null;
    const previous = legacySectionCache.get(round.id);
    if (previous) return previous;

    const blocks = new Map();
    for (const document of round.documents) {
      const frozen = frozenDocumentBlocks(round.id, document);
      if (frozen) blocks.set(document.id, frozen);
    }
    const resolveReference = frozenReferences(round, blocks);
    const html = new Map();
    for (const document of round.documents) {
      const sharedReference = reference => resolveReference(document, reference);
      for (const block of blocks.get(document.id) ?? []) {
        if (collectReferences(block.tokens).some(reference => reference.target.includes('#') && sharedReference(reference)?.docId)) {
          html.set(block.id, renderSnapshotBlock(block.tokens, sharedReference));
        }
      }
    }
    if (blocks.size === round.documents.length) {
      if (legacySectionCache.size >= 2) legacySectionCache.delete(legacySectionCache.keys().next().value);
      legacySectionCache.set(round.id, html);
    }
    return html;
  }

  function liveSource(entry, limit) {
    const source = sourceFile(entry.path);
    if (source.path !== entry.path) throw error(404, '此资料已移至共享范围外');
    return { source, bytes: readSource(source, limit) };
  }

  function cacheLiveVersion(document) {
    const key = document.id + ':' + document.sha256;
    if (liveVersionCache.has(key)) {
      const cached = liveVersionCache.get(key);
      liveVersionCache.delete(key);
      liveVersionCache.set(key, cached);
      return;
    }
    const size = document.blocks.reduce((sum, { text }) => sum + text.length * 2 + 128, 0);
    if (size > maxLiveCacheBytes) return;
    while (liveVersionBytes + size > maxLiveCacheBytes || liveVersionCache.size >= maxFiles * 2) {
      const [oldestKey, oldest] = liveVersionCache.entries().next().value;
      liveVersionCache.delete(oldestKey);
      liveVersionBytes -= oldest.size;
    }
    const blocks = new Map(document.blocks.map(({ id, text, lineStart, lineEnd }) => [
      id, { text, lineStart, lineEnd },
    ]));
    liveVersionCache.set(key, { size, blocks });
    liveVersionBytes += size;
  }

  function liveDocuments(round, render = false) {
    let totalBytes = 0;
    const documents = round.documents.map(entry => {
      try {
        const { bytes } = liveSource(entry, maxDocumentBytes);
        totalBytes += bytes.length;
        if (totalBytes > maxRoundBytes) throw error(413, '评审资料超过总大小限制');
        const sha256 = hash(bytes);
        const parsed = parseDocument(bytes.toString('utf8'));
        const document = {
          ...entry, title: documentTitle(parsed, entry.path), sha256,
          sourceStatus: 'current', blocks: documentBlocks(parsed, entry.id),
        };
        cacheLiveVersion(document);
        return document;
      } catch (failure) {
        if (!failure.status) throw failure;
        return { ...entry, sourceStatus: 'unavailable', sha256: null, blocks: [] };
      }
    });
    if (render) {
      const resolveReference = frozenReferences(round, new Map(documents.map(document => [document.id, document.blocks])));
      for (const document of documents) {
        const sharedReference = reference => resolveReference(document, reference);
        document.blocks = document.blocks.map(({ tokens, ...block }) => ({
          ...block,
          html: renderSnapshotBlock(tokens, sharedReference),
        }));
      }
    }
    return documents;
  }

  function liveReceipt(record, documents) {
    const result = publicSubmission(record);
    const byId = new Map(documents.map(document => [document.id, document]));
    return {
      ...result,
      documentVersions: result.documentVersions.map(version => {
        const sha256 = byId.get(version.documentId)?.sha256;
        return { ...version, sourceStatus: !sha256 ? 'unavailable' : sha256 === version.sha256 ? 'current' : 'stale' };
      }),
      items: result.items.map(item => ({ ...item, currentAnchor: locateLiveAnchor(byId.get(item.documentId), item) })),
    };
  }

  function captureLiveSource(item) {
    const version = liveVersionCache.get(item.documentId + ':' + item.sourceSha256);
    const block = version?.blocks.get(item.blockId);
    const match = block && quoteMatch(block, item.quote, item.offset);
    if (!match) {
      return {
        sha256: item.sourceSha256, startLine: null, endLine: null,
        prefix: item.prefix, suffix: item.suffix, verified: false,
      };
    }
    return {
      sha256: item.sourceSha256, startLine: block.lineStart, endLine: block.lineEnd,
      prefix: match.text.slice(Math.max(0, match.index - 120), match.index),
      suffix: match.text.slice(match.index + match.quote.length, match.index + match.quote.length + 120),
      verified: true,
    };
  }

  function roundSummary(round, submissionCount, reviewer = false, documents = round.documents) {
    const { id, title, createdAt, closedAt } = round;
    const isLive = round.mode === 'live';
    const sectionHtml = reviewer && !isLive ? legacySectionHtml(round) : null;
    return {
      id, title, createdAt, closedAt, submissionCount,
      mode: isLive ? 'live' : 'snapshot',
      ...(round.direct ? { direct: true } : {}),
      ...(round.external ? { external: true, galleries: gallerySummary(round.galleries, round.id) } : {}),
      documents: documents.map(document => {
        if (!reviewer) return document;
        const { id, title, sha256, blocks } = document;
        return {
          id, title, sha256,
          ...(round.direct ? { path: document.path } : {}),
          ...(isLive ? { sourceStatus: document.sourceStatus } : {}),
          blocks: blocks.map(block => ({
            id: block.id, text: block.text, raw: isLive ? block.text : reviewerMarkdown(block) ?? block.text,
            html: sectionHtml?.get(block.id) ?? block.html,
            ...(isLive ? { lineStart: block.lineStart, lineEnd: block.lineEnd } : {}),
          })),
        };
      }),
      assets: round.assets.map(({ id, title, mime, path }) => ({ id, title, mime, ...(round.external && !reviewer ? { path } : {}) })),
    };
  }

  function externalSource(path, document) {
    const source = sourceFile(path);
    const allowed = document ? externalDocumentPath(source.path) : source.kind === 'asset';
    if (!allowed || source.path.normalize('NFC') !== path.normalize('NFC')) {
      throw error(400, document ? '只能共享选中的文档中心 Markdown。' : '只能共享选中的有效附件。');
    }
    return source;
  }

  function captureExternal({ paths, attachments, galleries, galleryCatalog } = {}, id = randomUUID()) {
    const documents = uniquePaths(paths, '资料路径', true);
    const assetPaths = uniquePaths(attachments, '附件路径');
    const ids = uniquePaths(galleries, '图集标识');
    if (documents.length + assetPaths.length + ids.length > maxFiles) throw error(400, `请选择至多 ${maxFiles} 项评审资料。`);
    const round = { version: 2, external: true, id, documents: [], assets: [], invites: [] };
    const galleryCapture = ids.length ? captureSharedGalleries({ vault, catalog: galleryCatalog, ids }) : { groups: [], totalBytes: 0 };
    round.galleries = galleryCapture.groups;
    const files = [];
    const sourcePaths = new Set();
    const bytesById = new Map();
    let totalBytes = galleryCapture.totalBytes;
    for (const [selected, document] of [[documents, true], [assetPaths, false]]) {
      for (const path of selected) {
        const source = externalSource(path, document);
        const key = source.path.normalize('NFC');
        if (sourcePaths.has(key)) continue;
        sourcePaths.add(key);
        const bytes = readSource(source, document ? maxDocumentBytes : maxAssetBytes);
        totalBytes += bytes.length;
        if (totalBytes > maxRoundBytes) throw error(413, '评审资料超过总大小限制');
        const fileId = randomUUID();
        const sha256 = hash(bytes);
        files.push([source.path, sha256]);
        bytesById.set(fileId, bytes);
        if (document) {
          const parsed = parseDocument(bytes.toString('utf8'));
          round.documents.push({ id: fileId, path: source.path, title: documentTitle(parsed, source.path), sha256,
            blocks: documentBlocks(parsed, fileId) });
        } else {
          round.assets.push({ id: fileId, path: source.path, title: basename(source.path), sha256,
            mime: assetTypes.get(extname(source.path).toLowerCase()) });
        }
      }
    }
    const previewDigest = hash(JSON.stringify({
      files, galleries: galleryCapture.groups.map(group => [group.id, group.title, group.entryPath,
        group.pages.map(page => [page.path, page.title]), group.files.map(file => [file.path, file.sha256])]),
    }));
    return { round, bytesById, galleryCapture, previewDigest };
  }

  function previewExternal(input) {
    const { round, previewDigest } = captureExternal(input, 'preview');
    const selected = frozenReferences(round, new Map(round.documents.map(document => [document.id, document.blocks])));
    const assets = new Map(round.assets.map(({ path, title, mime }) => [path, { path, title, mime, selected: true }]));
    const relatedDocuments = new Map();
    const issues = new Map();
    const resolveReference = references();
    const documents = round.documents.map(document => ({
      path: document.path, title: document.title,
      blocks: document.blocks.map(block => {
        for (const reference of collectReferences(block.tokens)) {
          if (selected(document, reference)) continue;
          const { resolved, issue } = resolveReference(document, reference);
          const reason = resolved ? '未选择，不会包含在分享中。' : issue;
          if (reason) issues.set(JSON.stringify([document.path, reference.target]), { source: document.path, target: reference.target, reason });
          if (resolved?.kind === 'asset' && !assets.has(resolved.path)) {
            assets.set(resolved.path, { ...describe(resolved), mime: assetTypes.get(extname(resolved.path).toLowerCase()), selected: false });
          } else if (resolved && externalDocumentPath(resolved.path) && !relatedDocuments.has(resolved.path)) {
            try {
              relatedDocuments.set(resolved.path, { ...describe(resolved), selected: false });
            } catch (failure) {
              if (!failure.status) throw failure;
            }
          }
        }
        // The preview has no guest link or served assets until publishing.
        return { id: block.id, text: block.text, html: renderSnapshotBlock(block.tokens, () => null) };
      }),
    }));
    return { documents, assets: [...assets.values()], relatedDocuments: [...relatedDocuments.values()],
      issues: [...issues.values()], galleries: gallerySummary(round.galleries), previewDigest };
  }

  function createExternal(input = {}) {
    const title = cleanText(input.title, '评审标题', 200, true).trim();
    if (typeof input.previewDigest !== 'string' || !sha256Pattern.test(input.previewDigest)) {
      throw error(400, '请先预览选中的评审资料。');
    }
    const changed = () => Object.assign(error(409, '评审资料已变化，请重新预览。'), { code: 'preview_changed' });
    let capture;
    try {
      capture = captureExternal(input);
    } catch (failure) {
      if (failure.status === 404 || failure.status === 409) throw changed();
      throw failure;
    }
    const { round, bytesById, galleryCapture, previewDigest } = capture;
    if (input.previewDigest !== previewDigest) {
      throw changed();
    }
    const { invite, record } = prepareInvite(input);
    Object.assign(round, { title, createdAt: new Date().toISOString(), closedAt: null, invites: [record] });

    const resolveReference = frozenReferences(round, new Map(round.documents.map(document => [document.id, document.blocks])));
    for (const document of round.documents) {
      const resolve = reference => resolveReference(document, reference);
      document.blocks = document.blocks.map(({ tokens, ...block }) => ({ ...block, html: renderSnapshotBlock(tokens, resolve) }));
    }
    saveRound(round, staged => {
      const directory = join(staged, 'snapshots');
      mkdirSync(directory, { mode: 0o700 });
      for (const [id, bytes] of bytesById) writeFileSync(join(directory, id), bytes, { flag: 'wx', mode: 0o600 });
      round.galleries = writeSharedGalleries(staged, galleryCapture);
    });
    return { review: get(round.id), invite };
  }

  function create({ title, paths, attachments, mode = defaultMode } = {}) {
    title = cleanText(title, '评审标题', 200, true).trim();
    if (!['live', 'snapshot'].includes(mode)) throw error(400, '无效的评审模式');
    const selected = [...uniquePaths(paths, '资料路径'), ...uniquePaths(attachments, '附件路径')];
    if (!selected.length || selected.length > maxFiles) throw error(400, `请选择资料，最多 ${maxFiles} 项`);

    const sources = new Map();
    for (const filePath of selected) {
      const source = sourceFile(filePath);
      sources.set(source.path, source);
    }

    if (![...sources.values()].some(source => source.kind !== 'asset')) {
      throw error(400, '请选择至少一份 Markdown 资料');
    }

    const id = randomUUID();
    const isLive = mode === 'live';
    const round = { version: isLive ? 3 : 2, ...(isLive ? { mode } : {}), id, title, createdAt: new Date().toISOString(), closedAt: null,
      documents: [], assets: [], invites: [] };

    let totalBytes = 0;
    saveRound(round, staged => {
      if (!isLive) mkdirSync(join(staged, 'snapshots'), { mode: 0o700 });
      for (const source of sources.values()) {
        const fileId = randomUUID();
        const mime = assetTypes.get(extname(source.path).toLowerCase());
        const bytes = readSource(source, mime ? maxAssetBytes : maxDocumentBytes);
        totalBytes += bytes.length;
        if (totalBytes > maxRoundBytes) throw error(413, '评审资料超过总大小限制');

        const sha256 = hash(bytes);
        if (!isLive) writeFileSync(join(staged, 'snapshots', fileId), bytes, { flag: 'wx', mode: 0o600 });
        if (mime) {
          round.assets.push({ id: fileId, title: basename(source.path), path: source.path, sha256, mime });
          continue;
        }
        const parsed = parseDocument(bytes.toString('utf8'));
        round.documents.push({
          id: fileId,
          title: documentTitle(parsed, source.path),
          path: source.path,
          sha256,
          ...(!isLive ? { blocks: documentBlocks(parsed, fileId) } : {}),
        });
      }
      if (!isLive) {
        const resolveReference = frozenReferences(round, new Map(round.documents.map(document => [document.id, document.blocks])));
        for (const document of round.documents) {
          const sharedReference = reference => resolveReference(document, reference);
          document.blocks = document.blocks.map(({ tokens, ...block }) => ({
            ...block,
            html: renderSnapshotBlock(tokens, sharedReference),
          }));
        }
      }
    });

    return roundSummary(round, 0);
  }

  function openDirect(filePath, { managedKind } = {}) {
    filePath = cleanText(filePath, '资料路径', 1024, true);
    const kind = sourceKind(filePath);
    const approvedRoots = managedDirectRoots.get(managedKind);
    const approvedManagedNote = kind === 'note' && approvedRoots?.some(root => filePath.startsWith(root));
    if (kind !== 'plan' && kind !== 'doc' && !approvedManagedNote) {
      throw error(404, '此资料不在工作台的批注范围内');
    }
    const source = sourceFile(filePath);
    if (source.path !== filePath) throw error(404, '此资料不在工作台的批注范围内');

    const id = directRoundId(source.path);
    if (!existsSync(join(roundDir(id), 'round.json'))) {
      const bytes = readSource(source, maxDocumentBytes);
      const title = documentTitle(parseDocument(bytes.toString('utf8')), source.path);
      const round = {
        version: 3, mode: 'live', direct: true, id, title, createdAt: new Date().toISOString(), closedAt: null,
        documents: [{ id: randomUUID(), title, path: source.path, sha256: hash(bytes) }], assets: [], invites: [],
      };
      try {
        saveRound(round);
      } catch (failure) {
        if (!['EEXIST', 'ENOTEMPTY'].includes(failure.code)) throw failure;
      }
    }

    const round = directRound(id);
    if (round.documents.length !== 1 || round.documents[0].path !== source.path) {
      throw error(409, '工作台批注的文档记录不一致');
    }
    const review = roundSummary(round, 0, true, liveDocuments(round, true));
    return {
      review: { ...review, reviewer: directAuthor.reviewer, inviteId: directAuthor.id },
      submission: null,
    };
  }

  function list() {
    return readdirSync(rounds, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && uuidPattern.test(entry.name))
      .flatMap(entry => {
        const round = readRound(entry.name);
        const count = readSubmissions(round.id).length;
        return round.direct && count === 0 ? [] : [roundSummary(round, count)];
      })
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }

  function externalRounds() {
    return readdirSync(rounds, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && uuidPattern.test(entry.name))
      .map(entry => readRound(entry.name)).filter(round => round.external === true);
  }

  function hasOpenExternalReviews() {
    return externalRounds().some(round => !round.closedAt);
  }

  function listExternalReviews() {
    return externalRounds().map(round => roundSummary(round, readSubmissions(round.id).length, false,
      round.documents.map(({ blocks, ...document }) => document)))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }

  function externalRound(id) {
    const round = readRound(id);
    if (round.external !== true) throw error(404, '未找到外部评审。');
    return round;
  }

  function getExternal(id) {
    externalRound(id);
    return get(id);
  }

  function get(id) {
    const round = readRound(id);
    const submissions = readSubmissions(id);
    const isLive = round.mode === 'live';
    const documents = isLive ? liveDocuments(round, true) : round.documents;
    return {
      ...roundSummary(round, submissions.length, false, documents),
      invites: round.invites.map(publicInvite),
      submissions: submissions.map(record => isLive ? liveReceipt(record, documents) : publicSubmission(record)),
    };
  }

  function prepareInvite({ reviewer, expiresInHours = 168 } = {}) {
    reviewer = cleanText(reviewer, '评审人', 120, true).trim();
    if (!Number.isFinite(expiresInHours) || expiresInHours <= 0 || expiresInHours > 24 * 365) {
      throw error(400, '邀请有效期必须大于 0 小时且不超过 365 天');
    }

    const time = Date.now();
    const token = randomBytes(32).toString('base64url');
    const record = {
      id: randomUUID(),
      reviewer,
      createdAt: new Date(time).toISOString(),
      expiresAt: new Date(time + expiresInHours * 3600000).toISOString(),
      revokedAt: null,
      tokenHash: hash(token),
    };
    return { record, invite: { id: record.id, reviewer, expiresAt: record.expiresAt, token } };
  }

  function issueInvite(id, options) {
    const round = guestRound(id);
    if (round.closedAt) throw error(409, '评审轮次已关闭');
    const { record, invite } = prepareInvite(options);
    round.invites.push(record);
    writeJson(join(roundDir(id), 'round.json'), round);
    return invite;
  }

  function revokeInvite(id, inviteId) {
    const round = guestRound(id);
    const invite = round.invites.find(candidate => candidate.id === inviteId);
    if (!invite) throw error(404, '邀请不存在');
    if (!invite.revokedAt) {
      invite.revokedAt = new Date().toISOString();
      writeJson(join(roundDir(id), 'round.json'), round);
    }
    return publicInvite(invite);
  }

  function close(id) {
    const round = guestRound(id);
    if (!round.closedAt) {
      round.closedAt = new Date().toISOString();
      writeJson(join(roundDir(id), 'round.json'), round);
    }
    return roundSummary(round, readSubmissions(id).length);
  }

  function usableInvite(invite) {
    if (!invite || invite.revokedAt || Date.parse(invite.expiresAt) <= Date.now()) {
      throw error(403, '邀请已失效');
    }
    return invite;
  }

  function authorize(id, token) {
    const round = guestRound(id);
    if (round.external && round.closedAt) throw error(403, '评审已关闭。');
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(token)) {
      throw error(401, '需要有效的评审邀请');
    }

    const supplied = Buffer.from(hash(token), 'hex');
    const invite = round.invites.find(candidate => timingSafeEqual(supplied, Buffer.from(candidate.tokenHash, 'hex')));
    if (!invite) throw error(401, '需要有效的评审邀请');
    return publicInvite(usableInvite(invite));
  }

  function reviewerView(id, invite) {
    const round = guestRound(id);
    if (round.external && round.closedAt) throw error(403, '评审已关闭。');
    const actor = usableInvite(round.invites.find(candidate => candidate.id === invite?.id));
    return viewFor(round, actor);
  }

  function viewFor(round, actor) {
    const submissions = readSubmissions(round.id);
    const lastSubmission = submissions.findLast(record => record.inviteId === actor.id);
    const isLive = round.mode === 'live';
    const documents = isLive ? liveDocuments(round, true) : round.documents;
    const review = roundSummary(round, submissions.length, true, documents);
    return {
      review: round.external ? withReviewerGalleryAccess(round, actor, review) : review,
      submission: lastSubmission ? (isLive ? liveReceipt(lastSubmission, documents) : publicSubmission(lastSubmission)) : null,
    };
  }

  function asset(id, assetId) {
    const round = readRound(id);
    const entry = round.assets.find(candidate => candidate.id === assetId);
    if (!entry) throw error(404, '本轮评审未共享此附件');
    if (round.mode === 'live') {
      return { bytes: liveSource(entry, maxAssetBytes).bytes, mime: entry.mime, live: true };
    }
    return { path: join(roundDir(id), 'snapshots', entry.id), mime: entry.mime };
  }

  function galleryAsset(id, galleryId, relativePath) {
    const round = externalRound(id);
    if (round.closedAt) throw error(403, '评审已关闭。');
    const file = sharedGalleryAsset(roundDir(id), round.galleries ?? [], galleryId, relativePath);
    if (!file) throw error(404, '本轮评审未共享此图集页面。');
    return file;
  }

  function galleryAssetWithAccess(id, galleryId, capability, relativePath) {
    const round = externalRound(id);
    if (round.closedAt) throw error(403, '评审已关闭。');
    const match = /^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/u.exec(capability);
    const invite = match && uuidPattern.test(match[1]) && round.invites.find(candidate => candidate.id === match[1]);
    const normalized = galleryId.normalize('NFC');
    const selected = (round.galleries ?? []).some(group => group.id === normalized);
    if (!selected || !invite || !sha256Pattern.test(invite.tokenHash ?? '') ||
      !timingSafeEqual(Buffer.from(match[2]), Buffer.from(gallerySignature(id, normalized, invite)))) {
      throw error(401, '此图集需要有效的访问链接。');
    }
    usableInvite(invite);
    const file = sharedGalleryAsset(roundDir(id), round.galleries ?? [], normalized, relativePath);
    if (!file) throw error(404, '本轮评审未共享此图集页面。');
    return file;
  }

  function submit(id, invite, payload) {
    const round = guestRound(id);
    if (round.external && round.closedAt) throw error(403, '评审已关闭。');
    const actor = usableInvite(round.invites.find(candidate => candidate.id === invite?.id));
    return saveSubmission(round, actor, payload);
  }

  function submitDirect(id, payload) {
    const round = directRound(id);
    if (!Array.isArray(payload?.items) || payload.items.length === 0) throw error(400, '请先添加批注、高亮或改文建议');
    return saveSubmission(round, directAuthor, { ...payload, decision: 'comment' });
  }

  function saveSubmission(round, actor, payload) {
    if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string' || !submissionIdPattern.test(payload.id)) {
      throw error(400, '批注提交 ID 无效');
    }

    const isLive = round.mode === 'live';
    const fileName = hash(`${isLive ? 'live' : round.external ? 'external' : actor.id}\0${payload.id}`);
    const filePath = join(roundDir(round.id), 'submissions', `${fileName}.json`);
    const previous = existsSync(filePath) ? readJson(filePath) : null;
    if (round.closedAt && !previous) throw error(409, '评审轮次已关闭');
    const content = isLive ? liveSubmissionContent(round, payload) : submissionContent(round, payload);
    const requestHash = isLive ? hash(JSON.stringify(content)) : null;
    const repeat = record => {
      if (!isLive) {
        if (round.external && record.inviteId !== actor.id) throw submissionConflict();
        return repeatedSubmission(round, record, content);
      }
      if (record.inviteId !== actor.id || record.requestHash !== requestHash) throw submissionConflict();
      return liveReceipt(record, liveDocuments(round));
    };
    if (previous) return repeat(previous);
    const documents = isLive ? liveDocuments(round) : null;

    // Keep fractional milliseconds so rapid submissions still have a stable latest record.
    const submittedAtMilliseconds = performance.timeOrigin + performance.now();
    const submission = {
      id: payload.id, inviteId: actor.id, reviewer: actor.reviewer,
      submittedAt: new Date(submittedAtMilliseconds).toISOString(), submittedAtMilliseconds,
      ...content,
    };
    if (isLive) {
      submission.requestHash = requestHash;
      submission.items = content.items.map(item => {
        const { sourceSha256, prefix, suffix, ...fields } = item;
        return { ...fields, source: captureLiveSource(item) };
      });
    }
    try {
      writeJson(filePath, submission, true);
    } catch (failure) {
      if (failure.code === 'EEXIST') return repeat(readJson(filePath));
      throw failure;
    }
    return isLive ? liveReceipt(submission, documents) : publicSubmission(submission);
  }

  return {
    documents, preview, create, list, get, issueInvite, revokeInvite, close,
    authorize, reviewerView, asset, submit, openDirect, submitDirect,
    previewExternal, createExternal, getExternal, listExternalReviews, hasOpenExternalReviews, galleryAsset, galleryAssetWithAccess,
  };
}
