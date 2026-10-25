/** 图集 = Attachments/archify/<目录>；页面 = 其中去品牌的展示版 HTML。 */
export const UNLINKED_PROJECT = '未关联项目';
export const ATLAS_ROOT = 'Attachments/archify';
const EXCLUDED_DIRS = new Set(['.meta', 'tmp', 'reference', 'source']);
const TEXT_LIMIT = 24000;
// Archify 页面自带的界面文案（风格、导出、分享等），不属于内容。
const CHROME_PREFIX = /^(正在检查已编译语义|没有匹配的节点|最多选择两种|选择一种类型|语义雷达需要|跳至正文)/;
const CHROME_LABEL = new Set(['系统', '浅色', '深色', '风格', '视觉表达', 'S 循环切换', '导出', '分享', '复制', '图像', '动态', '演示', '经典', '信号流', '蓝图', '编辑', '简洁', '杂志', '产品', '网格', '长图', '打印 / PDF', 'PNG', 'JPEG', 'JPG', 'WebP', 'SVG']);
const isChrome = (text: string): boolean => CHROME_LABEL.has(text) || CHROME_PREFIX.test(text);

export interface AtlasEntry {
  path: string;
  collection: string;
  project: string;
  title: string;
  headings: string[];
  text: string;
  isEntry: boolean;
  mtime: number;
}
export interface AtlasHit { entry: AtlasEntry; score: number; snippet: string }
export interface AtlasQuery { project: string | null; terms: string[] }

/** 只收展示版：排除原始版、.meta、tmp、reference、source 与 *.json 等非 HTML。 */
export function collectionOf(path: string): string | null {
  if (!path.startsWith(`${ATLAS_ROOT}/`) || !path.toLowerCase().endsWith('.html')) return null;
  const parts = path.slice(ATLAS_ROOT.length + 1).split('/');
  if (parts.length < 2) return null;
  if (parts.slice(0, -1).some(part => EXCLUDED_DIRS.has(part))) return null;
  if (/\.archify-original\.html$/i.test(path) || /残留/.test(path)) return null;
  return parts[0];
}
export function isEntryPage(path: string): boolean { return /\/index\.html$/i.test(path) && path.split('/').length === ATLAS_ROOT.split('/').length + 2; }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}
const clean = (raw: string): string => decode(raw.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function all(html: string, pattern: RegExp, group: number): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const text = clean(match[group]);
    if (text && !isChrome(text)) found.push(text);
  }
  return found;
}

/** 从展示版 HTML 提取：标题、各节标题、正文段落/表格文字、图里的节点文字（SVG <text>）。 */
export function extractPage(html: string): { title: string; headings: string[]; text: string } {
  const body = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const title = clean(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? '') || clean(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1] ?? '');
  const headings = [...new Set(all(body, /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi, 2))].filter(item => item !== title);
  const pieces = [...all(body, /<(p|li|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi, 2), ...all(body, /<text\b[^>]*>([\s\S]*?)<\/text>/gi, 1)];
  return { title, headings, text: [...new Set(pieces)].join(' · ').slice(0, TEXT_LIMIT) };
}

export function buildEntry(path: string, html: string, mtime: number, project: string): AtlasEntry | null {
  const collection = collectionOf(path);
  if (!collection) return null;
  const page = extractPage(html);
  const name = path.split('/').pop()!.replace(/\.html$/i, '');
  return { path, collection, project, title: page.title || name, headings: page.headings, text: page.text, isEntry: isEntryPage(path), mtime };
}

/** 图集目录名里的前缀（niubu-xxx / flowdesk-2.0）对上项目卡名时，当作兜底项目归属。 */
export function projectByPrefix(collection: string, projectNames: string[]): string | null {
  const key = collection.toLowerCase();
  const hit = [...projectNames].sort((a, b) => b.length - a.length).find(name => key.startsWith(name.toLowerCase()));
  return hit ?? null;
}
/** 优先主文档 frontmatter 的项目，其次目录前缀，最后归到「未关联项目」。 */
export function resolveProject(collection: string, docProjects: string[], projectNames: string[]): string {
  return docProjects[0] ?? projectByPrefix(collection, projectNames) ?? UNLINKED_PROJECT;
}
/** artifacts.json 里主文档路径：document.path 或第一个带 document.path 的产物。 */
export function manifestDocumentPath(manifest: unknown): string | null {
  const root = manifest as { document?: { path?: unknown }; artifacts?: Array<{ document?: { path?: unknown } | string }> } | null;
  if (typeof root?.document?.path === 'string') return root.document.path;
  for (const item of root?.artifacts ?? []) {
    const doc = item?.document;
    if (typeof doc === 'string') return doc;
    if (typeof doc?.path === 'string') return doc.path;
  }
  return null;
}

/** `@项目 关键词 关键词`：@ 开头的词筛选项目（包含匹配），其余词全部要命中（AND）。 */
export function parseQuery(input: string): AtlasQuery {
  let project: string | null = null;
  const terms: string[] = [];
  for (const token of input.trim().split(/\s+/)) {
    if (!token) continue;
    if (token.startsWith('@') && token.length > 1) project = token.slice(1);
    else terms.push(token.toLowerCase());
  }
  return { project, terms };
}

const FIELD_WEIGHT = { title: 10, heading: 5, collection: 3, text: 1 } as const;
function snippetAround(text: string, term: string): string {
  const index = text.toLowerCase().indexOf(term);
  if (index < 0) return '';
  const start = Math.max(0, index - 18);
  return `${start > 0 ? '…' : ''}${text.slice(start, index + term.length + 42)}${index + term.length + 42 < text.length ? '…' : ''}`;
}
export function searchAtlas(entries: AtlasEntry[], query: AtlasQuery): AtlasHit[] {
  const pool = entries.filter(entry => !entry.isEntry && (!query.project || entry.project.toLowerCase().includes(query.project.toLowerCase())));
  if (!query.terms.length) return pool.map(entry => ({ entry, score: 0, snippet: entry.headings.slice(0, 3).join(' · ') })).sort(compareBrowse);
  const hits: AtlasHit[] = [];
  for (const entry of pool) {
    let score = 0;
    let snippet = '';
    let matchedAll = true;
    for (const term of query.terms) {
      const heading = entry.headings.find(item => item.toLowerCase().includes(term));
      const field = entry.title.toLowerCase().includes(term) ? FIELD_WEIGHT.title
        : heading ? FIELD_WEIGHT.heading
        : entry.collection.toLowerCase().includes(term) ? FIELD_WEIGHT.collection
        : entry.text.toLowerCase().includes(term) ? FIELD_WEIGHT.text : 0;
      if (!field) { matchedAll = false; break; }
      score += field;
      if (!snippet) snippet = field === FIELD_WEIGHT.heading ? heading! : field === FIELD_WEIGHT.text ? snippetAround(entry.text, term) : '';
    }
    if (matchedAll) hits.push({ entry, score, snippet: snippet || entry.headings.slice(0, 3).join(' · ') });
  }
  return hits.sort((a, b) => b.score - a.score || compareBrowse(a, b));
}
/** 无搜索词时的浏览顺序：项目 → 图集（最近改动靠前）→ 页面路径。 */
function compareBrowse(a: AtlasHit, b: AtlasHit): number {
  return a.entry.project.localeCompare(b.entry.project, 'zh')
    || a.entry.collection.localeCompare(b.entry.collection, 'zh')
    || a.entry.path.localeCompare(b.entry.path, 'zh');
}

/** 同一图集的统一入口（若有）。 */
export function entryOf(entries: AtlasEntry[], collection: string): AtlasEntry | undefined {
  return entries.find(entry => entry.collection === collection && entry.isEntry);
}

export interface AtlasPage { title: string; path: string; haystack: string }
/** 文档中心里的一张卡 = 一个图集：有统一入口就以入口为主，页面列在卡内。 */
export interface AtlasCollection { collection: string; project: string; title: string; documentPath: string | null; entryPath: string | null; pages: AtlasPage[]; mtime: number; searchText: string }

/** 把页面按图集归并。标题优先用统一入口页的标题，其次主文档标题，最后目录名。 */
export function groupCollections(entries: AtlasEntry[], docs: Record<string, { title: string; path: string }> = {}): AtlasCollection[] {
  const byCollection = new Map<string, AtlasEntry[]>();
  for (const entry of entries) byCollection.set(entry.collection, [...(byCollection.get(entry.collection) ?? []), entry]);
  const result: AtlasCollection[] = [];
  for (const [collection, list] of byCollection) {
    const entry = list.find(item => item.isEntry);
    const pages: AtlasPage[] = list.filter(item => !item.isEntry).sort((a, b) => a.path.localeCompare(b.path, 'zh', { numeric: true }))
      .map(item => ({ title: item.title, path: item.path, haystack: [item.title, ...item.headings, item.text].join(' ').toLowerCase() }));
    if (!pages.length) continue;
    result.push({
      collection, project: list[0].project, title: entry?.title || docs[collection]?.title || collection, documentPath: docs[collection]?.path ?? null, entryPath: entry?.path ?? null, pages,
      mtime: Math.max(...list.map(item => item.mtime)), searchText: `${collection} ${pages.map(page => page.haystack).join(' ')}`.toLowerCase(),
    });
  }
  return result;
}
export function pageMatches(page: AtlasPage, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !!needle && page.haystack.includes(needle);
}

/** 复制给 agent 的提示词：不预设一定要入口；有入口就评估怎么改，没有就评估是否需要。复用现有页面，不覆盖定制入口，不发布。 */
export function buildAtlasPrompt(c: { collection: string; project: string; title: string; documentPath: string | null; entryPath: string | null; pages: Array<{ title: string; path: string }> }): string {
  const dir = `${ATLAS_ROOT}/${c.collection}`;
  const pages = c.pages.map((page, index) => `${index + 1}. ${page.title}（${page.path}）`).join('\n');
  const lines = [
    '/flow-desk:visual-doc 请评估并优化下面这个 Archify 图集的阅读组织方式。',
    '',
    `图集：${c.title}`,
    `目录：${dir}`,
    `项目：${c.project}`,
    `清单：${dir}/artifacts.json`,
    c.documentPath ? `主文档：${c.documentPath}` : '主文档：（清单里没有，请先确认对应的文档）',
    c.entryPath ? `现有总览页：${c.entryPath}` : '现有总览页：无（各页单独阅读）',
    '',
    `现有页面（${c.pages.length} 页）：`,
    pages,
    '',
    '要求：',
    c.entryPath
      ? '- 先看现有总览页是否已经够用；是标准模板才可以刷新，有手工定制就保留，只提出可改之处，不要覆盖。'
      : '- 先判断这些页面是否需要一个总览页：各页独立阅读更合适就保持现状并说明理由；需要的话再提出分组与命名，我确认后再生成。',
    '- 先读主文档和各页标题再提方案；复用现有页面，不重画、不重新生成图，只调整导航与组织。',
    '- 已有 HTML 不得覆盖；完成后做登记与检查并告诉我结果；不要发布到 OBS。',
  ];
  return lines.join('\n');
}
