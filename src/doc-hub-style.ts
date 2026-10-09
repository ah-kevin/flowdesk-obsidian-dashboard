// 文档中心视觉 token：明暗主题 × 四种风格，实际色值在 styles.css 的 data-theme / data-style 变量里。
export type DocHubTheme = 'dark' | 'light';
export type DocHubStyleId = 'classic' | 'signal' | 'blueprint' | 'editorial';
export interface DocHubPrefs { theme?: DocHubTheme; style: DocHubStyleId }

export const DOC_HUB_STYLES: ReadonlyArray<{ id: DocHubStyleId; label: string }> = [
  { id: 'classic', label: '经典' }, { id: 'signal', label: '信号流' }, { id: 'blueprint', label: '蓝图' }, { id: 'editorial', label: '编辑' },
];

/** 设置读回做校验：未知值回退，theme 缺省表示跟随 Obsidian。 */
export function normalizePrefs(value: unknown): DocHubPrefs {
  const raw = (value ?? {}) as Partial<Record<keyof DocHubPrefs, unknown>>;
  const style = DOC_HUB_STYLES.find(item => item.id === raw.style)?.id ?? 'classic';
  return raw.theme === 'dark' || raw.theme === 'light' ? { theme: raw.theme, style } : { style };
}
export function toggleTheme(current: DocHubTheme): DocHubTheme { return current === 'dark' ? 'light' : 'dark'; }
export function nextStyle(current: DocHubStyleId): DocHubStyleId {
  const index = DOC_HUB_STYLES.findIndex(item => item.id === current);
  return DOC_HUB_STYLES[(index + 1) % DOC_HUB_STYLES.length].id;
}
export function styleLabel(id: DocHubStyleId): string { return DOC_HUB_STYLES.find(item => item.id === id)?.label ?? id; }
