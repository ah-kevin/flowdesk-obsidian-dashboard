import { constants } from 'node:fs';
import { open, readdir, realpath } from 'node:fs/promises';
import { posix, relative, resolve, sep } from 'node:path';
import MarkdownIt from 'markdown-it';
import { parse } from 'yaml';
import { findProgressSection } from './progress.mjs';

const markdown = new MarkdownIt();
const projectFolder = 'Notes/Projects';
const caseFolder = 'Notes/Sessions';
const documentKinds = new Map([
  ['Notes/Plans/', 'plan'],
  ['Notes/Docs/', 'doc'],
  ['Notes/Research/', 'research'],
]);
const maxNoteBytes = 2 * 1024 * 1024;
const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' });
const ongoingCaseStatuses = new Set(['active', 'in-progress', 'blocked']);

export function stringValue(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function noteParts(text) {
  const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u.exec(text);
  if (!frontmatter) return { metadata: {}, body: text };
  const metadata = parse(frontmatter[1], { maxAliasCount: 25 }) || {};
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Invalid Vault frontmatter');
  }
  return { metadata, body: text.slice(frontmatter[0].length) };
}

export function shortText(text, limit) {
  const normalized = text
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (_, target, label) => label || target.split('/').at(-1))
    .replace(/(?:file:\/\/\S+|\/Users\/\S+|\/private\/\S+|~\/\S+)/gu, '[本机路径]')
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '[原生会话 ID]')
    .replace(/\s+/gu, ' ').trim();
  const chars = Array.from(normalized);
  return chars.length > limit ? chars.slice(0, limit - 1).join('').trimEnd() + '…' : normalized || null;
}

function plain(inline) {
  return inline?.children?.map(token => {
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
    return token.type === 'text' || token.type === 'code_inline' ? token.content : '';
  }).join('') || '';
}

function section(tokens, title) {
  const start = tokens.findIndex((token, index) => token.type === 'heading_open' && token.tag === 'h2'
    && plain(tokens[index + 1]) === title);
  if (start === -1) return [];
  const end = tokens.findIndex((token, index) => index > start && token.type === 'heading_open' && token.tag === 'h2');
  return tokens.slice(start + 3, end === -1 ? undefined : end);
}

function paragraphs(tokens) {
  return tokens.flatMap((token, index) => token.type === 'inline' && tokens[index - 1]?.type === 'paragraph_open'
    ? [plain(token)] : []).filter(Boolean);
}

function firstTitle(tokens) {
  const index = tokens.findIndex(token => token.type === 'heading_open' && token.tag === 'h1');
  return index < 0 ? null : stringValue(plain(tokens[index + 1]));
}

function references(tokens) {
  return tokens.filter(token => token.type === 'inline').flatMap(token =>
    token.children.flatMap(child => {
      if (child.type === 'link_open') return [{ target: child.attrGet('href'), wiki: false }];
      if (child.type !== 'text') return [];
      return Array.from(child.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/gu),
        match => ({ target: match[1], wiki: true }));
    }));
}

export function propertyStrings(value) {
  return Array.isArray(value) ? value.flatMap(propertyStrings) : [stringValue(value)].filter(Boolean);
}

function frontmatterReferences(value, { name = false } = {}) {
  return propertyStrings(value).flatMap(entry => {
    const raw = stringValue(entry);
    if (!raw) return [];
    const wiki = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/u.exec(raw);
    if (wiki) return [{ target: wiki[1], wiki: true }];
    return name && !raw.includes('](') ? [{ target: raw, wiki: true }] : references(markdown.parseInline(raw, {}));
  });
}

function evidenceReferences(metadata, tokens, { allowBare = false } = {}) {
  return [
    ...frontmatterReferences([metadata.plans, metadata.docs, metadata.related], { name: allowBare }),
    ...references(tokens),
  ];
}

function referencePath(ref, sourcePath) {
  const raw = stringValue(ref.target)?.split('#', 1)[0];
  if (!raw || raw.startsWith('/') || raw.startsWith('~') || /^[\w+-]+:/u.test(raw)) return null;
  let target;
  try {
    target = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!target || /[\\\u0000-\u001f\u007f]/u.test(target) || target.startsWith('/') || target.startsWith('Attachments/')) return null;
  if (ref.wiki && !target.endsWith('.md')) target += '.md';
  if (!target.endsWith('.md')) return null;
  const path = /^(Notes|Tasks|TaskNotes)\//u.test(target)
    ? posix.normalize(target)
    : posix.join(posix.dirname(sourcePath), target);
  return path.split('/').some(part => !part || part.startsWith('.')) ? null : path;
}

function pathsFor(refs, sourcePath, allowedPath) {
  return Array.from(new Set(refs.map(ref => referencePath(ref, sourcePath))
    .filter(path => path && allowedPath(path))));
}

function calendarDay(value) {
  const date = stringValue(value);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const utc = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(utc) && new Date(utc).toISOString().slice(0, 10) === date ? date : null;
}

function progressActivity(timestamp) {
  if (!timestamp) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)? ?(CST|Z|[+-]\d{2}:\d{2})?)?$/u.exec(timestamp);
  if (!match) return null;
  const [, day, hour, minute, second = '00', fraction = '', zone] = match;
  if (!calendarDay(day)) return null;
  if (!hour) return { day, at: day };
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  const offset = zone && zone !== 'CST' ? zone : '+08:00';
  const instant = new Date(day + 'T' + hour + ':' + minute + ':' + second + fraction + offset);
  return Number.isFinite(instant.getTime()) ? { day: localDate.format(instant), at: instant.toISOString() } : null;
}

function evidenceTime(value) {
  if (!value) return Number.MIN_SAFE_INTEGER;
  return Date.parse(value.length === 10 ? value + 'T00:00:00+08:00' : value);
}

export function documentKind(path) {
  for (const [prefix, kind] of documentKinds) {
    if (path.startsWith(prefix)) return kind;
  }
  return null;
}

export async function readVaultNote(vault, path) {
  const expectedPath = resolve(vault, path);
  const filePath = await realpath(expectedPath);
  const actualPath = relative(vault, filePath).split(sep).join('/');
  if (actualPath.split('/').some(part => !part || part.startsWith('.'))
    || filePath.normalize('NFC') !== expectedPath.normalize('NFC')) throw new Error('Vault note path is not canonical');
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stats = await file.stat();
    if (!stats.isFile() || stats.size > maxNoteBytes) throw new Error('Unsupported Vault note size');
    const { metadata, body } = noteParts(await file.readFile({ encoding: 'utf8' }));
    return { path: actualPath, metadata, body, mtime: stats.mtimeMs, updatedAt: stats.mtime.toISOString() };
  } finally {
    await file.close();
  }
}

function parseNote(path, note) {
  const tokens = markdown.parse(note.body, {});
  const title = stringValue(note.metadata.title) || firstTitle(tokens) || posix.basename(path, '.md');
  return { ...note, tokens, title };
}

export async function listVaultNotePaths(vault, folder) {
  const directory = resolve(vault, folder);
  try {
    if (await realpath(directory) !== directory) throw new Error('Vault note folder is not canonical');
    return (await readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.isFile() && !entry.name.startsWith('.') && entry.name.endsWith('.md')
        && !/[\\\u0000-\u001f\u007f]/u.test(entry.name))
      .map(entry => folder + '/' + entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function readVaultNoteFolder(vault, folder, build) {
  const paths = await listVaultNotePaths(vault, folder);
  const entries = [];
  let unreadable = 0;
  for (let index = 0; index < paths.length; index += 12) {
    const batch = await Promise.allSettled(paths.slice(index, index + 12).map(async path => {
      const note = await readVaultNote(vault, path);
      return build(note.path, note);
    }));
    for (const result of batch) {
      if (result.status === 'rejected') unreadable += 1;
      else if (result.value) entries.push(result.value);
    }
  }
  return { entries, unreadable };
}

function readCase(path, note) {
  const { metadata, tokens, title, updatedAt } = note;
  const current = section(tokens, 'Current');
  const context = section(tokens, 'Context');
  const taskRefs = [
    ...references(section(tokens, 'Tasks')),
    ...references(current),
    ...references(context.filter(token => token.type !== 'inline' || /^\s*Remaining:/iu.test(plain(token)))),
  ];
  const caseRefs = [...frontmatterReferences(metadata.sessions), ...frontmatterReferences(metadata.related)];
  return {
    id: path,
    path,
    title,
    date: calendarDay(metadata.date),
    agent: stringValue(metadata.agent),
    archived: metadata.archived === true || metadata.status === 'archived',
    status: stringValue(metadata.status) || 'unknown',
    goal: shortText(paragraphs(section(tokens, 'Goal')).slice(0, 2).join(' '), 210),
    current: shortText(paragraphs(current).slice(0, 2).map(text => text.replace(/^\[!\w+\][^\n]*? (?=做到哪了)/u, '')).join(' '), 260),
    summary: shortText(paragraphs(section(tokens, 'Summary')).slice(0, 2).join(' '), 240),
    updatedAt,
    taskPaths: pathsFor(taskRefs, path, target => /^(Tasks|TaskNotes)\//u.test(target)),
    documentPaths: pathsFor(evidenceReferences(metadata, current), path, documentKind),
    casePaths: pathsFor(caseRefs, path, target => target !== path && target.startsWith('Notes/Sessions/')),
    cwd: stringValue(metadata.cwd),
    branch: stringValue(metadata.branch),
  };
}

function projectReferences(metadata) {
  return [metadata.project, metadata.projects].flatMap(value => frontmatterReferences(value, { name: true }));
}

function ownerPaths(refs, sourcePath) {
  return [...new Set(refs.flatMap(ref => {
    const path = referencePath(ref, sourcePath);
    if (path?.startsWith(projectFolder + '/')) return [path];
    if (ref.wiki && !ref.target.includes('/')) {
      return [referencePath(ref, projectFolder + '/.project')].filter(Boolean);
    }
    return [];
  }))];
}

export function projectOwnerPaths(metadata, sourcePath) {
  return ownerPaths(projectReferences(metadata), sourcePath);
}

function projectEntry(path, note) {
  if (note.metadata.type !== 'project') return null;
  const { metadata, body, updatedAt } = note;
  const tokens = markdown.parse(body, {});
  const refs = references(tokens);
  const explicitRelations = metadata.related_projects;
  const relatedRefs = Array.isArray(explicitRelations) || stringValue(explicitRelations)
    ? frontmatterReferences(explicitRelations, { name: true }) : refs;
  const casePaths = pathsFor([...refs, ...frontmatterReferences(metadata.sessions)],
    path, target => target.startsWith(caseFolder + '/'));
  const documentPaths = pathsFor([...refs, ...frontmatterReferences([metadata.plans, metadata.docs, metadata.related])],
    path, documentKind);
  return {
    project: {
      id: path,
      path,
      title: posix.basename(path, '.md'),
      description: shortText(stringValue(metadata.description) || '', 180),
      status: metadata.archived === true ? 'archived' : stringValue(metadata.status) || 'unknown',
      priority: stringValue(metadata.priority) || 'unknown',
      overview: shortText(paragraphs(section(tokens, 'Info'))[0] || '', 210),
      relatedProjects: [],
      updatedAt,
    },
    relatedPaths: pathsFor([...relatedRefs, ...frontmatterReferences(metadata.parent_project, { name: true })],
      path, target => target !== path && target.startsWith(projectFolder + '/')),
    casePaths,
    documentPaths,
  };
}

function caseEntry(path, note) {
  const { metadata } = note;
  if (!['work-case', 'session'].includes(metadata.type)) return null;
  const parsed = parseNote(path, note);
  const progress = (findProgressSection(note.body, parsed.tokens)?.events ?? []).map(event => progressActivity(event.timestamp))
    .filter(Boolean).sort((left, right) => evidenceTime(right.at) - evidenceTime(left.at));
  return {
    record: readCase(path, parsed), owners: projectOwnerPaths(metadata, path), progress,
    refs: evidenceReferences(metadata, section(parsed.tokens, 'Current'), { allowBare: true }),
  };
}

function projectSort(a, b) {
  const rank = item => item.status === 'active' ? 0 : item.status === 'archived' ? 2 : 1;
  return rank(a) - rank(b) || a.title.localeCompare(b.title, 'zh-CN') || a.path.localeCompare(b.path, 'zh-CN');
}

export async function readVaultLibrary(vault) {
  const at = new Date().toISOString();
  const all = await Promise.allSettled([
    readVaultNoteFolder(vault, projectFolder, projectEntry),
    readVaultNoteFolder(vault, caseFolder, caseEntry),
  ]);
  const [projectNotes, allCases] = all.map(result => result.status === 'fulfilled' ? result.value.entries : []);
  const caseNotes = allCases.filter(item => !item.record.archived);
  const projects = new Map(projectNotes.map(item => [item.project.path, item]));
  const cases = new Map(allCases.map(item => [item.record.path, item.record]));
  const caseKeys = new Map(allCases.map(item => [item.record.path.normalize('NFC'), item.record]));
  const caseEvidence = new Map(allCases.map(({ record, progress, refs }) => [record.path, { progress, refs }]));
  const projectKeys = new Map(projectNotes.map(item => [item.project.path.normalize('NFC'), item]));
  const findCase = path => cases.get(path) ?? caseKeys.get(path.normalize('NFC'));
  for (const { record, owners } of allCases) {
    record.casePaths = record.casePaths.map(path => findCase(path)?.path ?? path);
    record.projectPaths = [...new Set(owners.map(path => projectKeys.get(path.normalize('NFC'))?.project.path).filter(Boolean))];
  }
  for (const item of projectNotes) {
    item.project.relatedProjects = item.relatedPaths.flatMap(path => {
      const related = (projects.get(path) ?? projectKeys.get(path.normalize('NFC')))?.project;
      return related ? [{ id: related.path, path: related.path, title: related.title }] : [];
    });
    for (const path of item.casePaths) {
      const record = findCase(path);
      if (record && !record.projectPaths.includes(item.project.path)) record.projectPaths.push(item.project.path);
    }
    item.casePaths = item.casePaths.filter(path => !findCase(path)?.archived).map(path => findCase(path)?.path ?? path);
    item.cases = [...new Set([
      ...item.casePaths,
      ...caseNotes.filter(entry => entry.owners.some(owner => owner.normalize('NFC') === item.project.path.normalize('NFC')))
        .map(entry => entry.record.path),
    ])].map(findCase).filter(Boolean);
  }
  for (const record of cases.values()) {
    record.projects = record.projectPaths.map(path => projects.get(path).project.title);
  }
  const options = projectNotes.map(({ project: { id, path, title, status, priority, updatedAt } }) =>
    ({ id, path, title, status, priority, updatedAt })).sort(projectSort);
  const errors = all.reduce((count, result) => count + (result.status === 'fulfilled' ? result.value.unreadable : 1), 0);
  const source = { status: all[0].status === 'rejected' ? 'unavailable' : errors ? 'degraded' : 'ok', at };
  if (errors) source.detail = `有 ${errors} 项 Vault 项目或 Case 资料无法读取。`;
  return { vault, projects, options, cases, caseEvidence, source, linkedDocuments: new Map() };
}

export function readPeriodCases(library, { from, to, today, projectPath }) {
  const within = day => day && day >= from && day <= to;
  const currentPeriod = within(today);
  const scopedProject = projectPath?.normalize('NFC');
  return [...library.cases.values()].flatMap(record => {
    if (scopedProject && !record.projectPaths.some(path => path.normalize('NFC') === scopedProject)) return [];
    if (within(record.date)) return [{ ...record, stageReason: 'created', stageActivityAt: record.date }];
    const activity = library.caseEvidence.get(record.path)?.progress.find(event => within(event.day));
    if (activity) return [{ ...record, stageReason: 'progress', stageActivityAt: activity.at }];
    if (currentPeriod && !record.archived && ongoingCaseStatuses.has(record.status)) {
      return [{ ...record, stageReason: 'carryover', stageActivityAt: null }];
    }
    return [];
  }).sort((left, right) => evidenceTime(right.stageActivityAt) - evidenceTime(left.stageActivityAt)
    || left.title.localeCompare(right.title, 'zh-CN') || left.path.localeCompare(right.path, 'zh-CN'));
}

function readLinkedDocument(library, path) {
  if (!library.linkedDocuments.has(path)) {
    const entry = readVaultNote(library.vault, path).then(note => {
      const { metadata, tokens, title, updatedAt } = parseNote(note.path, note);
      return { tokens, metadata, document: {
        id: note.path,
        path: note.path,
        title,
        kind: documentKind(note.path),
        status: metadata.archived === true ? 'archived' : stringValue(metadata.status) || 'unknown',
        summary: shortText(stringValue(metadata.summary) || paragraphs(tokens)[0] || '', 200),
        updatedAt,
      } };
    }).catch(() => null);
    library.linkedDocuments.set(path, entry);
  }
  return library.linkedDocuments.get(path);
}

function canonicalMarkdownPath(path) {
  return typeof path === 'string' && path.endsWith('.md') && !/[\\\u0000-\u001f\u007f]/u.test(path)
    && path.split('/').every(part => part && !part.startsWith('.'));
}

function managedDocumentPath(path) {
  return canonicalMarkdownPath(path) && Boolean(documentKind(path))
    && !path.split('/').slice(2, -1).some(part => part.toLowerCase() === 'archive');
}

export async function readManagedDocument(library, path, hubDocuments) {
  if (!managedDocumentPath(path)) return null;
  const indexed = hubDocuments.find(document => document.path.normalize('NFC') === path.normalize('NFC'));
  return indexed ?? (await readLinkedDocument(library, path))?.document ?? null;
}

function rawGalleryReference(ref) {
  try {
    const path = decodeURIComponent(ref.split('#', 1)[0]);
    return /(?:^|\/)Attachments\/archify\/.+\.html?$/iu.test(path) && !/^(?:[a-z][a-z\d+.-]*:|\/)/iu.test(path);
  } catch {
    return false;
  }
}

export async function readPeriodDocuments(library, cases, tasks, hubDocuments) {
  const indexed = new Map(hubDocuments.filter(document => managedDocumentPath(document.path))
    .map(document => [document.path.normalize('NFC'), document]));
  const basenamePaths = new Map();
  for (const document of indexed.values()) {
    const basename = posix.basename(document.path).normalize('NFC');
    if (basenamePaths.has(basename)) basenamePaths.set(basename, null);
    else basenamePaths.set(basename, document.path);
  }
  const documentLinks = new Map();
  const galleryLinks = new Map();
  let unreadable = 0;

  function addDocument(path, related) {
    if (!managedDocumentPath(path)) return;
    const key = path.normalize('NFC');
    if (!documentLinks.has(key)) documentLinks.set(key, { path: indexed.get(key)?.path ?? path, relatedTo: new Map() });
    documentLinks.get(key).relatedTo.set(related.kind + ':' + related.id, related);
  }

  function addGalleryLinks(source, refs, relatedTo) {
    for (const { target } of refs) {
      const ref = stringValue(target);
      if (!ref || !rawGalleryReference(ref)) continue;
      const key = source.normalize('NFC') + '\0' + ref;
      if (!galleryLinks.has(key)) galleryLinks.set(key, { source, ref, relatedTo: new Map() });
      for (const related of relatedTo) galleryLinks.get(key).relatedTo.set(related.kind + ':' + related.id, related);
    }
  }

  function addReferences(record, kind, refs) {
    const related = { kind, id: record.id, title: record.title };
    for (const path of record.documentPaths ?? []) addDocument(path, related);
    for (const ref of refs) {
      const path = referencePath(ref, record.path);
      if (managedDocumentPath(path)) {
        addDocument(path, related);
      } else if (ref.wiki && typeof path === 'string' && !ref.target.includes('/')) {
        addDocument(basenamePaths.get(posix.basename(path).normalize('NFC')), related);
      }
    }
    addGalleryLinks(record.path, refs, [related]);
  }

  for (const record of cases) addReferences(record, 'case', library.caseEvidence.get(record.path)?.refs ?? []);
  const managedTasks = [...new Map(tasks.filter(task => canonicalMarkdownPath(task.path) && /^(?:Tasks|TaskNotes)\//u.test(task.path))
    .map(task => [task.path.normalize('NFC'), task])).values()];
  for (let offset = 0; offset < managedTasks.length; offset += 12) {
    const batch = managedTasks.slice(offset, offset + 12);
    const notes = await Promise.allSettled(batch.map(task => readVaultNote(library.vault, task.path)));
    notes.forEach((result, index) => {
      if (result.status === 'rejected') unreadable++;
      const note = result.status === 'fulfilled' ? result.value : null;
      addReferences(batch[index], 'task', note ? evidenceReferences(note.metadata, markdown.parse(note.body, {}), { allowBare: true }) : []);
    });
  }

  const documents = [];
  const candidates = [...documentLinks];
  for (let offset = 0; offset < candidates.length; offset += 12) {
    const batch = candidates.slice(offset, offset + 12);
    const notes = await Promise.all(batch.map(([, item]) => readLinkedDocument(library, item.path)));
    notes.forEach((note, index) => {
      if (!note) { unreadable++; return; }
      const [key, relation] = batch[index];
      const relatedTo = [...relation.relatedTo.values()];
      documents.push({ ...(indexed.get(key) ?? note.document), relatedTo });
      addGalleryLinks(note.document.path, evidenceReferences(note.metadata, note.tokens, { allowBare: true }), relatedTo);
    });
  }
  return {
    documents: documents.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.path.localeCompare(right.path, 'zh-CN')),
    unreadable,
    galleryReferences: [...galleryLinks.values()].map(item => ({ ...item, relatedTo: [...item.relatedTo.values()] })),
  };
}

export async function readProjectDocuments(library, entry, hubDocuments) {
  const { documentPaths, cases, project } = entry;
  const hubPaths = new Set(hubDocuments.map(document => document.path));
  const hubKeys = new Map(hubDocuments.map(document => [document.path.normalize('NFC'), document.path]));
  const exactPath = path => hubPaths.has(path) ? path : hubKeys.get(path.normalize('NFC')) ?? path;
  const links = documentPaths.map(exactPath);
  const linked = await Promise.all(links.map(path => readLinkedDocument(library, path)));
  const nestedPaths = linked.flatMap(item => item ? pathsFor(references(item.tokens), item.document.path,
    path => documentKind(path) && path.split('/').length > 3 && !path.split('/').slice(2, -1).includes('Archive')) : []);
  const ids = new Set([...links, ...cases.flatMap(item => item.documentPaths.map(exactPath)), ...nestedPaths]);
  const owned = hubDocuments.filter(doc => doc.projectPaths.some(path => path.normalize('NFC') === project.path.normalize('NFC')));
  const docs = await Promise.all([...ids].map(path => readLinkedDocument(library, path)));
  const byPath = new Map(owned.map(item => [item.path, item]));
  for (const item of docs) if (item) byPath.set(item.document.path, item.document);
  return { documents: [...byPath.values()], unreadable: docs.filter(item => !item).length };
}

export async function readVaultWorkspace(library, entry, hubDocuments) {
  if (!entry) return { project: null, cases: [], documents: [], source: library.source };
  const { documents, unreadable } = await readProjectDocuments(library, entry, hubDocuments);
  const source = { ...library.source };
  const missingCases = entry.casePaths.length - entry.cases.filter(item => entry.casePaths.includes(item.path)).length;
  if (unreadable || missingCases) {
    source.status = source.status === 'unavailable' ? 'unavailable' : 'degraded';
    source.detail = [source.detail, `${unreadable + missingCases} 条项目引用无法读取。`].filter(Boolean).join(' ');
  }
  return { project: entry.project, cases: entry.cases, documents, source };
}
