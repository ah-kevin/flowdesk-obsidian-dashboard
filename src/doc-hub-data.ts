// 文档中心纯函数数据层：不依赖 Obsidian 运行时，便于隔离测试。
export type DocHubKind = 'doc' | 'plan' | 'research';
export type DocHubTab = 'recent' | 'project' | 'pinned';
export type Frontmatter = Record<string, unknown>;

export const DOC_HUB_KIND_LABELS: Record<DocHubKind, string> = { doc: '文档', plan: '方案', research: '调研' };
export const DOC_HUB_FOLDERS: Record<string, DocHubKind> = { 'Notes/Docs': 'doc', 'Notes/Plans': 'plan', 'Notes/Research': 'research' };
export const UNLINKED_PROJECT = '未关联项目';
export const HIDDEN_STATUSES = new Set(['superseded', 'archived']);
export const SUMMARY_LIMIT = 90;

export interface DocHubDoc {
  path: string;
  title: string;
  kind: DocHubKind;
  status: string;
  projects: string[];
  mtime: number;
  pinned: boolean;
  reviewedAt: number | null;
  summary: string;
}
export interface DocHubFilter { kind: DocHubKind | 'all'; query: string; showSuperseded: boolean }

/** 目录决定类型；只认三个目录的顶层 *.md，嵌套（如 Archive）返回 null。 */
export function kindOfPath(path: string): DocHubKind | null {
  const match = /^(Notes\/(?:Docs|Plans|Research))\/[^/]+\.md$/.exec(path);
  return match ? DOC_HUB_FOLDERS[match[1]] : null;
}

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

function flatten(value: unknown): unknown[] {
  return Array.isArray(value) ? value.flatMap(flatten) : [value];
}

/** `project` 与 `projects` 并存，值可为字符串/数组（未加引号的 [[X]] 会被 YAML 解析成嵌套数组）；取链接目标最后一段。 */
export function projectsOf(meta: Frontmatter): string[] {
  const names: string[] = [];
  for (const item of [...flatten(meta.projects), ...flatten(meta.project)]) {
    if (item === null || item === undefined || item === '') continue;
    const text = String(item).trim();
    const link = /\[\[([^\]|]+)/.exec(text);
    const name = (link ? link[1] : text).trim().replace(/\.md$/, '').split('/').pop()!.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export function stripFrontmatter(text: string): string {
  return text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
}

/** 摘要：跳过标题、表格、代码块、列表、图片；引用块取其文本；截 SUMMARY_LIMIT 字。 */
export function summaryOfBody(body: string): string {
  let inCode = false;
  for (const raw of body.split(/\r?\n/)) {
    let line = raw.trim();
    if (/^(```|~~~)/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (line.startsWith('>')) line = line.replace(/^[>\s]+/, '').replace(/^\[![^\]]*\][+-]?\s*/, '').trim();
    if (!line || /^[#|![\-*>`<]/.test(line) || line.startsWith('---')) continue;
    line = line.replace(WIKILINK, (_m, target: string, alias?: string) => alias?.trim() || target.split('/').pop()!.replace(/\.md$/, '')).replace(/[*_`]/g, '');
    return Array.from(line).slice(0, SUMMARY_LIMIT).join('');
  }
  return '';
}

/** `reviewed` 为 YYYY-MM-DD（字符串或 Date），按本地零点解析；无效返回 null。 */
export function parseReviewed(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim()) : null;
  if (!match) return null;
  const time = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  return Number.isNaN(time) ? null : time;
}

export function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function buildDoc(path: string, basename: string, mtime: number, meta: Frontmatter | null | undefined, summary: string): DocHubDoc | null {
  const kind = kindOfPath(path);
  if (!kind) return null;
  const fm = meta ?? {};
  const title = typeof fm.title === 'string' && fm.title.trim() ? fm.title.trim() : basename;
  const status = fm.status === undefined || fm.status === null ? '' : String(fm.status).trim();
  return { path, title, kind, status, projects: projectsOf(fm), mtime, pinned: fm.pinned === true, reviewedAt: parseReviewed(fm.reviewed), summary };
}

export function isHidden(doc: DocHubDoc): boolean { return HIDDEN_STATUSES.has(doc.status.toLowerCase()); }

export function filterDocs(docs: DocHubDoc[], filter: DocHubFilter): DocHubDoc[] {
  const query = filter.query.trim().toLowerCase();
  return docs.filter(doc => (filter.showSuperseded || !isHidden(doc)) && (filter.kind === 'all' || doc.kind === filter.kind)
    && (!query || `${doc.title} ${doc.summary} ${doc.projects.join(' ')} ${doc.path}`.toLowerCase().includes(query)));
}

const DAY = 86400000;
export interface RecentGroup { id: 'today' | 'week' | 'month' | 'older'; label: string; docs: DocHubDoc[] }

/** 最近视角：mtime 倒序；今天=本地自然日，其余按滚动 7/30 天。 */
export function groupRecent(docs: DocHubDoc[], now: number): RecentGroup[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const groups: RecentGroup[] = [{ id: 'today', label: '今天', docs: [] }, { id: 'week', label: '7 天内', docs: [] }, { id: 'month', label: '30 天内', docs: [] }, { id: 'older', label: '更早', docs: [] }];
  for (const doc of [...docs].sort((a, b) => b.mtime - a.mtime)) {
    const index = doc.mtime >= startOfToday ? 0 : now - doc.mtime < 7 * DAY ? 1 : now - doc.mtime < 30 * DAY ? 2 : 3;
    groups[index].docs.push(doc);
  }
  return groups.filter(group => group.docs.length);
}

export interface ProjectGroup { name: string; docs: DocHubDoc[]; latest: number }

/** 按项目视角：多项目文档出现在每个项目下；组按篇数倒序（未关联项目固定最后），组内 mtime 倒序。 */
export function groupByProject(docs: DocHubDoc[]): ProjectGroup[] {
  const map = new Map<string, DocHubDoc[]>();
  for (const doc of docs) for (const name of doc.projects.length ? doc.projects : [UNLINKED_PROJECT]) map.set(name, [...(map.get(name) ?? []), doc]);
  return [...map.entries()].map(([name, list]) => {
    const sorted = [...list].sort((a, b) => b.mtime - a.mtime);
    return { name, docs: sorted, latest: sorted[0].mtime };
  }).sort((a, b) => Number(a.name === UNLINKED_PROJECT) - Number(b.name === UNLINKED_PROJECT) || b.docs.length - a.docs.length || b.latest - a.latest || a.name.localeCompare(b.name));
}

/** 常驻视角：pinned 文档；从未回看（无 reviewed）的排最前，其余按距上次回看最久的排前。
 *  置顶写 frontmatter 会刷新 mtime，所以 mtime 不能当回看时间。 */
export function pinnedDocs(docs: DocHubDoc[]): DocHubDoc[] {
  return docs.filter(doc => doc.pinned).sort((a, b) => Number(b.reviewedAt === null) - Number(a.reviewedAt === null)
    || (a.reviewedAt ?? 0) - (b.reviewedAt ?? 0) || a.title.localeCompare(b.title));
}

/** 常驻卡片的回看标记：无 reviewed 一律“未回看”并按红色处理，有则按距今天数着色。 */
export function reviewBadge(doc: DocHubDoc, now: number): { text: string; tone: 'fresh' | 'aging' | 'stale' } {
  if (doc.reviewedAt === null) return { text: '未回看', tone: 'stale' };
  return { text: `回看 ${agoText(doc.reviewedAt, now)}`, tone: freshness(doc.reviewedAt, now) };
}

export function freshness(timestamp: number, now: number): 'fresh' | 'aging' | 'stale' {
  const days = (now - timestamp) / DAY;
  return days < 7 ? 'fresh' : days < 30 ? 'aging' : 'stale';
}

export function agoText(timestamp: number, now: number): string {
  const seconds = Math.max(0, (now - timestamp) / 1000);
  if (seconds < 3600) return '刚刚';
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)} 天前`;
  if (seconds < 86400 * 365) return `${Math.floor(seconds / 86400 / 30)} 个月前`;
  return `${Math.floor(seconds / 86400 / 365)} 年前`;
}

// ---- 写回：只改 frontmatter 的 pinned / reviewed，正文不经手 ----
export type FrontmatterMutator = (frontmatter: Frontmatter) => void;
export type ProcessFrontmatter<F> = (file: F, mutate: FrontmatterMutator) => Promise<void>;

export function pinMutator(pinned: boolean): FrontmatterMutator {
  return frontmatter => { if (pinned) frontmatter.pinned = true; else delete frontmatter.pinned; };
}
export function reviewMutator(date: string): FrontmatterMutator {
  return frontmatter => { frontmatter.reviewed = date; };
}
export function setPinned<F>(process: ProcessFrontmatter<F>, file: F, pinned: boolean): Promise<void> { return process(file, pinMutator(pinned)); }
export function markReviewed<F>(process: ProcessFrontmatter<F>, file: F, now: Date): Promise<void> { return process(file, reviewMutator(formatLocalDate(now))); }

// ---- 键盘：焦点在输入框时只响应 Esc ----
export type DocHubKeyAction = { type: 'focus-search' } | { type: 'tab'; tab: DocHubTab } | { type: 'theme' } | { type: 'style' } | { type: 'clear' };
const TAB_KEYS: Record<string, DocHubTab> = { '1': 'recent', '2': 'project', '3': 'pinned' };

export function resolveKey(key: string, typing: boolean, modified: boolean): DocHubKeyAction | null {
  if (key === 'Escape') return { type: 'clear' };
  if (typing || modified) return null;
  if (key === '/') return { type: 'focus-search' };
  if (TAB_KEYS[key]) return { type: 'tab', tab: TAB_KEYS[key] };
  if (key === 't' || key === 'T') return { type: 'theme' };
  if (key === 's' || key === 'S') return { type: 'style' };
  return null;
}
