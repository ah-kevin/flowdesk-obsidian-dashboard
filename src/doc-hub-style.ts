// 文档中心视觉 token：明暗默认跟随 Obsidian（theme 缺省），用户切换后写入显式值；四种风格的形状 / 强调色在 styles.css 的 data-style 变量里。
export type DocHubTheme = 'dark' | 'light';
export type DocHubStyleId = 'classic' | 'signal' | 'blueprint' | 'editorial';
/** atlasPinned：置顶的图集目录名。图集不是 Markdown、没有 frontmatter，置顶只能记在插件设置里。 */
export interface DocHubPrefs { theme?: DocHubTheme; style: DocHubStyleId; atlasPinned?: string[] }

export const DOC_HUB_STYLES: ReadonlyArray<{ id: DocHubStyleId; label: string; hint: string }> = [
  { id: 'classic', label: '经典', hint: '稳定的技术默认风格' },
  { id: 'signal', label: '信号流', hint: '突出动态流向' },
  { id: 'blueprint', label: '蓝图', hint: '工程评审' },
  { id: 'editorial', label: '编辑风格', hint: '适合发布与上线说明' },
];

/** 设置读回做校验：未知值回退，theme 缺省表示跟随 Obsidian。 */
export function normalizePrefs(value: unknown): DocHubPrefs {
  const raw = (value ?? {}) as Partial<Record<keyof DocHubPrefs, unknown>>;
  const style = DOC_HUB_STYLES.find(item => item.id === raw.style)?.id ?? 'classic';
  const atlasPinned = Array.isArray(raw.atlasPinned) ? [...new Set(raw.atlasPinned.filter((item): item is string => typeof item === 'string' && item.length > 0))] : [];
  const prefs: DocHubPrefs = raw.theme === 'dark' || raw.theme === 'light' ? { theme: raw.theme, style } : { style };
  return atlasPinned.length ? { ...prefs, atlasPinned } : prefs;
}
/** 生效明暗：用户显式选择优先，否则跟随 Obsidian 当前明暗。 */
export function effectiveTheme(prefs: DocHubPrefs, obsidian: DocHubTheme): DocHubTheme { return prefs.theme ?? obsidian; }
export function toggleTheme(current: DocHubTheme): DocHubTheme { return current === 'dark' ? 'light' : 'dark'; }
export function nextStyle(current: DocHubStyleId): DocHubStyleId {
  const index = DOC_HUB_STYLES.findIndex(item => item.id === current);
  return DOC_HUB_STYLES[(index + 1) % DOC_HUB_STYLES.length].id;
}
export function styleLabel(id: DocHubStyleId): string { return DOC_HUB_STYLES.find(item => item.id === id)?.label ?? id; }
