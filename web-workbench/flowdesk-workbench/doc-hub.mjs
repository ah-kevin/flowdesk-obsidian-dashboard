import { posix } from 'node:path';
import { documentKind, projectOwnerPaths, propertyStrings, readVaultNoteFolder, shortText, stringValue } from './vault.mjs';

// Keep the Markdown scope and frontmatter semantics aligned with src/doc-hub-data.ts.
const folders = ['Notes/Docs', 'Notes/Plans', 'Notes/Research'];

function projectNames(metadata) {
  const values = [...propertyStrings(metadata.projects), ...propertyStrings(metadata.project)];
  return [...new Set(values.map(text => {
    const link = /\[\[([^\]|]+)/u.exec(text);
    return posix.basename((link ? link[1] : text).trim(), '.md').trim().normalize('NFC');
  }).filter(Boolean))];
}

function reviewedAt(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})/u.exec(value.trim());
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() : null;
}

function summaryOfBody(body) {
  let inCode = false;
  for (const raw of body.split(/\r?\n/u)) {
    let line = raw.trim();
    if (/^(```|~~~)/u.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (line.startsWith('>')) line = line.replace(/^[>\s]+/u, '').replace(/^\[![^\]]*\][+-]?\s*/u, '').trim();
    if (!line || /^[#|![\-*> `<]/u.test(line)) continue;
    return shortText(line.replace(/[*_`]/gu, ''), 90) || '';
  }
  return '';
}

function docEntry(path, { metadata, body, mtime, updatedAt }) {
  const tags = [...new Set(propertyStrings(metadata.tags).flatMap(value =>
    value.split(/\s+/u).map(tag => tag.replace(/^#/u, '')).filter(Boolean)))];
  return {
    id: path,
    path,
    title: stringValue(metadata.title) || posix.basename(path, '.md'),
    kind: documentKind(path),
    status: metadata.archived === true ? 'archived' : String(metadata.status ?? '').trim(),
    projects: projectNames(metadata),
    projectPaths: projectOwnerPaths(metadata, path),
    tags,
    mtime,
    updatedAt,
    pinned: metadata.pinned === true,
    reviewedAt: reviewedAt(metadata.reviewed),
    summary: summaryOfBody(body),
  };
}

export async function readDocHub(vault) {
  const outcomes = await Promise.allSettled(folders.map(folder => readVaultNoteFolder(vault, folder, docEntry)));
  const readable = outcomes.filter(result => result.status === 'fulfilled');
  const unreadable = outcomes.length - readable.length + readable.reduce((total, result) => total + result.value.unreadable, 0);
  const documents = readable.flatMap(result => result.value.entries)
    .sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path, 'zh-CN'));
  return {
    documents,
    source: {
      status: readable.length === 0 ? 'unavailable' : unreadable ? 'degraded' : 'ok',
      at: new Date().toISOString(),
      ...(unreadable ? { detail: `有 ${unreadable} 项 Vault 文档或目录无法读取。` } : {}),
    },
  };
}
