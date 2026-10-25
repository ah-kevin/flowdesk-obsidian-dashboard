import { ItemView, Notice, TFile, TFolder, Workspace, WorkspaceLeaf, setIcon } from 'obsidian';
import { selectContentLeaf } from './dashboard-placement';
import { AtlasIndex, confirmAndTrashCollection, openInBrowser, showReferences } from './atlas-index';
import { buildAtlasPrompt, pageMatches } from './atlas-data';
import {
  DOC_HUB_FOLDERS, DOC_HUB_KIND_LABELS, SUMMARY_LIMIT, agoText, buildAtlasDoc, buildDoc, filterDocs, freshness, groupByProject, groupRecent, isHidden, kindOfPath,
  markReviewed, pinnedDocs, resolveKey, reviewBadge, setPinned, stripFrontmatter, summaryOfBody, type DocHubDoc, type DocHubFilter, type DocHubKeyAction, type DocHubTab, type ProjectGroup,
} from './doc-hub-data';
import { DOC_HUB_STYLES, effectiveTheme, nextStyle, normalizePrefs, styleLabel, toggleTheme, type DocHubPrefs, type DocHubStyleId, type DocHubTheme } from './doc-hub-style';

export const DOC_HUB_VIEW_TYPE = 'flowdesk-doc-hub';
export const DOC_HUB_HOVER_SOURCE = 'flowdesk-doc-hub';
const RECENT_CAP = 48;
const REFRESH_DELAY = 300;
const HOVER_DELAY = 700;
const TABS: ReadonlyArray<[DocHubTab, string]> = [['recent', '最近'], ['project', '按项目'], ['pinned', '常驻']];

export interface DocHubHost { prefs(): unknown; savePrefs(prefs: DocHubPrefs): Promise<void> }

export async function openDocHub(workspace: Workspace): Promise<void> {
  const existing = workspace.getLeavesOfType(DOC_HUB_VIEW_TYPE)[0];
  const leaf = existing ?? workspace.getLeaf('tab');
  if (!existing) await leaf.setViewState({ type: DOC_HUB_VIEW_TYPE, active: true });
  await workspace.revealLeaf(leaf);
}

export class DocHubView extends ItemView {
  private docs: DocHubDoc[] = [];
  private summaries = new Map<string, { mtime: number; text: string }>();
  private filter: DocHubFilter = { kind: 'all', query: '', showSuperseded: false };
  private projectMenuOpen = false;
  private tab: DocHubTab = 'recent';
  private showAllRecent = false;
  private projectOpen = new Map<string, boolean>();
  private prefs: DocHubPrefs;
  private generation = 0;
  private timer: number | null = null;
  private hoverTimer: number | null = null;
  private closed = false;
  private readonly atlasIndex = new AtlasIndex();
  private els!: Record<'root' | 'sub' | 'tabs' | 'filters' | 'list' | 'searchBox' | 'theme' | 'preset' | 'presetName' | 'menu' | 'full', HTMLElement> & { search: HTMLInputElement };
  constructor(leaf: WorkspaceLeaf, private readonly host: DocHubHost) { super(leaf); this.prefs = normalizePrefs(host.prefs()); }
  getViewType(): string { return DOC_HUB_VIEW_TYPE; }
  getDisplayText(): string { return '文档中心'; }
  getIcon(): string { return 'library'; }

  async onOpen(): Promise<void> {
    this.closed = false;
    this.buildShell();
    const touch = (path: string) => { if (kindOfPath(path) || path.startsWith('Attachments/archify/')) this.scheduleReload(); };
    this.registerEvent(this.app.metadataCache.on('changed', file => touch(file.path)));
    this.registerEvent(this.app.vault.on('create', file => touch(file.path)));
    this.registerEvent(this.app.vault.on('delete', file => touch(file.path)));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { touch(file.path); touch(oldPath); }));
    // 未显式选择明暗时跟随 Obsidian：主题切换后同步开关与 data-theme，不需要重开视图。
    this.registerEvent(this.app.workspace.on('css-change', () => this.syncChrome()));
    // 图集是 HTML，Obsidian 不一定为它发文件事件；回到文档中心时顺带按 mtime 增量刷新。
    this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => { if (leaf === this.leaf) this.scheduleReload(); }));
    await this.reload();
  }
  async onClose(): Promise<void> { this.closed = true; this.generation++; if (this.timer !== null) window.clearTimeout(this.timer); this.timer = null; this.cancelHover(); }

  private currentTheme(): DocHubTheme { return effectiveTheme(this.prefs, this.contentEl.ownerDocument.body.classList.contains('theme-light') ? 'light' : 'dark'); }
  private scheduleReload(): void {
    if (this.closed) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = null; void this.reload(); }, REFRESH_DELAY);
  }

  /** 实时读取三个目录的顶层 *.md；摘要缺失时读正文，并按 mtime 缓存。 */
  private async reload(): Promise<void> {
    const generation = ++this.generation;
    const files: TFile[] = [];
    for (const folder of Object.keys(DOC_HUB_FOLDERS)) {
      const dir = this.app.vault.getAbstractFileByPath(folder);
      if (dir instanceof TFolder) for (const child of dir.children) if (child instanceof TFile && child.extension === 'md') files.push(child);
    }
    const docs = (await Promise.all(files.map(file => this.toDoc(file)))).filter((doc): doc is DocHubDoc => !!doc);
    try { docs.push(...(await this.atlasIndex.load(this.app)).map(buildAtlasDoc)); }
    catch (error) { new Notice(`图集读取失败：${error instanceof Error ? error.message : String(error)}`); }
    const atlasPinned = new Set(this.prefs.atlasPinned ?? []);
    for (const doc of docs) if (doc.atlas) doc.pinned = atlasPinned.has(doc.atlas.collection);
    if (this.closed || generation !== this.generation) return;
    this.docs = docs;
    this.renderAll();
  }
  private async toDoc(file: TFile): Promise<DocHubDoc | null> {
    const meta = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    let summary = typeof meta?.summary === 'string' ? Array.from(meta.summary.trim()).slice(0, SUMMARY_LIMIT).join('') : '';
    if (!summary) {
      const cached = this.summaries.get(file.path);
      if (cached && cached.mtime === file.stat.mtime) summary = cached.text;
      else {
        summary = await this.app.vault.cachedRead(file).then(text => summaryOfBody(stripFrontmatter(text)), () => '');
        this.summaries.set(file.path, { mtime: file.stat.mtime, text: summary });
      }
    }
    return buildDoc(file.path, file.basename, file.stat.mtime, meta, summary);
  }

  private buildShell(): void {
    const root = this.contentEl;
    root.empty(); root.addClass('fd-dochub'); root.setAttr('tabindex', '-1');
    const head = root.createDiv({ cls: 'fd-dochub-head' });
    const titles = head.createDiv();
    titles.createEl('h1', { text: '文档中心' });
    const sub = titles.createDiv({ cls: 'fd-dochub-sub' });
    const tools = head.createDiv({ cls: 'fd-dochub-tools' });
    const tabs = tools.createDiv({ cls: 'fd-dochub-tabs', attr: { role: 'tablist' } });
    const searchBox = tools.createDiv({ cls: 'fd-dochub-searchbox' });
    searchBox.createSpan({ cls: 'fd-dochub-ticon fd-dochub-search-icon', attr: { 'aria-hidden': 'true' } });
    const search = searchBox.createEl('input', { cls: 'fd-dochub-search', attr: { type: 'search', placeholder: '搜索标题 / 摘要 / 项目 / 图集内容…', 'aria-label': '搜索文档', 'aria-keyshortcuts': '/', spellcheck: 'false' } });
    searchBox.createEl('kbd', { cls: 'fd-dochub-search-kbd', text: '/', attr: { 'aria-hidden': 'true' } });
    const clear = searchBox.createEl('button', { cls: 'fd-dochub-search-clear', attr: { type: 'button', title: '清除搜索（Esc）', 'aria-label': '清除搜索' } });
    clear.createSpan({ cls: 'fd-dochub-ticon', attr: { 'aria-hidden': 'true' } });
    search.addEventListener('input', () => { this.filter.query = search.value; this.syncSearch(); this.renderBody(); });
    clear.addEventListener('click', () => { search.value = ''; this.filter.query = ''; this.syncSearch(); this.renderBody(); search.focus(); });
    const bar = tools.createDiv({ cls: 'fd-dochub-toolbar', attr: { role: 'toolbar', 'aria-label': '文档中心工具' } });
    const theme = bar.createEl('button', { cls: 'fd-dochub-tbtn fd-dochub-theme', attr: { type: 'button', title: '切换主题（T）', 'aria-keyshortcuts': 'T' } });
    theme.createSpan({ cls: 'fd-dochub-ticon fd-dochub-theme-icon', attr: { 'aria-hidden': 'true' } });
    const wrap = bar.createDiv({ cls: 'fd-dochub-preset-wrap' });
    const preset = wrap.createEl('button', { cls: 'fd-dochub-tbtn fd-dochub-preset', attr: { type: 'button', title: '选择视觉风格（S 循环切换）', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-keyshortcuts': 'S' } });
    preset.createSpan({ cls: 'fd-dochub-mark', attr: { 'aria-hidden': 'true' } });
    const presetName = preset.createSpan({ cls: 'fd-dochub-preset-name' });
    preset.createSpan({ cls: 'fd-dochub-ticon fd-dochub-chevron', attr: { 'aria-hidden': 'true' } });
    const menu = wrap.createDiv({ cls: 'fd-dochub-menu', attr: { role: 'menu', 'aria-label': '视觉风格' } });
    const heading = menu.createDiv({ cls: 'fd-dochub-menu-heading', attr: { role: 'presentation' } });
    heading.createSpan({ text: '视觉表达' });
    const shortcut = heading.createSpan({ cls: 'fd-dochub-menu-shortcut' });
    shortcut.createEl('kbd', { text: 'S' }); shortcut.appendText('循环切换');
    for (const item of DOC_HUB_STYLES) {
      const option = menu.createEl('button', { cls: 'fd-dochub-option', attr: { type: 'button', role: 'menuitemradio', 'aria-checked': 'false', tabindex: '-1', 'data-style-id': item.id } });
      option.createSpan({ cls: `fd-dochub-swatch is-${item.id}`, attr: { 'aria-hidden': 'true' } });
      const copy = option.createSpan({ cls: 'fd-dochub-option-copy' });
      copy.createEl('strong', { text: item.label }); copy.createEl('small', { text: item.hint });
      option.createSpan({ cls: 'fd-dochub-check', attr: { 'aria-hidden': 'true' } });
    }
    const full = bar.createEl('button', { cls: 'fd-dochub-tbtn fd-dochub-full', attr: { type: 'button', title: '全屏（F）', 'aria-keyshortcuts': 'F' } });
    full.createSpan({ cls: 'fd-dochub-ticon fd-dochub-full-icon', attr: { 'aria-hidden': 'true' } });
    theme.addEventListener('click', () => this.act({ type: 'theme' }));
    full.addEventListener('click', () => this.act({ type: 'fullscreen' }));
    preset.addEventListener('click', () => (this.menuOpen() ? this.closeMenu(false) : this.openMenu(false)));
    preset.addEventListener('keydown', event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); if (!this.menuOpen()) this.openMenu(event.key === 'ArrowUp'); } });
    menu.addEventListener('click', event => {
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-style-id]');
      if (option) { this.setStyle(option.dataset.styleId as DocHubStyleId); this.closeMenu(true); }
    });
    menu.addEventListener('keydown', event => this.onMenuKey(event));
    const filters = root.createDiv({ cls: 'fd-dochub-filters' });
    const list = root.createDiv({ cls: 'fd-dochub-list' });
    this.els = { root, sub, tabs, filters, list, searchBox, theme, preset, presetName, menu, full, search };
    this.registerDomEvent(root, 'keydown', event => {
      const target = event.target as HTMLElement;
      const action = resolveKey(event.key, ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable || !!target.closest?.('.fd-dochub-project-wrap'), event.metaKey || event.ctrlKey || event.altKey);
      if (action) { event.preventDefault(); this.act(action); }
    });
    // 点击菜单与触发按钮之外的位置关闭风格菜单；全屏状态变化时同步按钮。
    this.registerDomEvent(root.ownerDocument, 'click', event => {
      const target = event.target as Node;
      if (!this.els.menu.contains(target) && !this.els.preset.contains(target)) this.closeMenu(false);
      if (this.projectMenuOpen && !(target as HTMLElement).closest?.('.fd-dochub-project-wrap')) this.closeProjectMenu(false);
    });
    this.registerDomEvent(root.ownerDocument, 'fullscreenchange', () => this.syncChrome());
    this.renderAll();
    root.focus();
  }


  private act(action: DocHubKeyAction): void {
    if (action.type === 'focus-search') this.els.search.focus();
    else if (action.type === 'tab') { this.tab = action.tab; this.renderAll(); }
    else if (action.type === 'theme') { this.prefs = { ...this.prefs, theme: toggleTheme(this.currentTheme()) }; this.persistPrefs(); }
    else if (action.type === 'style') this.setStyle(nextStyle(this.prefs.style));
    else if (action.type === 'fullscreen') void this.toggleFullscreen();
    else { this.closeMenu(false); this.filter.query = ''; this.els.search.value = ''; this.syncSearch(); this.els.search.blur(); this.els.root.focus(); this.renderBody(); }
  }
  /** 有内容时才显示清除按钮、隐藏 `/` 提示。 */
  private syncSearch(): void { this.els.searchBox.toggleClass('has-value', this.els.search.value.length > 0); }
  private setStyle(style: DocHubStyleId): void { this.prefs = { ...this.prefs, style }; this.persistPrefs(); }
  private persistPrefs(): void {
    this.syncChrome();
    this.host.savePrefs(this.prefs).catch(error => new Notice(`文档中心设置未能保存：${error instanceof Error ? error.message : String(error)}`));
  }

  private renderAll(): void { this.syncChrome(); this.renderBody(); }
  /** 同步工具栏与根元素状态：生效明暗、风格、菜单选中项、全屏按钮。 */
  private syncChrome(): void {
    const { root, theme, preset, presetName, menu, full } = this.els;
    const dark = this.currentTheme() === 'dark', fullscreen = root.ownerDocument.fullscreenElement === root;
    root.setAttr('data-theme', dark ? 'dark' : 'light'); root.setAttr('data-style', this.prefs.style);
    theme.setAttr('aria-pressed', String(dark)); theme.setAttr('aria-label', `切换颜色主题（当前${dark ? '深色' : '浅色'}）`);
    presetName.setText(styleLabel(this.prefs.style)); preset.setAttr('aria-label', `选择视觉风格（当前${styleLabel(this.prefs.style)}）`);
    menu.querySelectorAll<HTMLElement>('[data-style-id]').forEach(option => option.setAttr('aria-checked', String(option.dataset.styleId === this.prefs.style)));
    full.setAttr('aria-pressed', String(fullscreen)); full.setAttr('aria-label', fullscreen ? '退出全屏' : '进入全屏'); full.title = fullscreen ? '退出全屏（F / Esc）' : '全屏（F）';
  }

  /** 项目筛选菜单：沿用视觉风格菜单的外观与键盘交互；筛选行每次重绘，所以展开状态单独记在 projectMenuOpen 里。 */
  private renderProjectMenu(parent: HTMLElement, projects: ProjectGroup[], total: number): void {
    const wrap = parent.createDiv({ cls: 'fd-dochub-project-wrap' });
    const current = this.filter.project;
    const trigger = wrap.createEl('button', { cls: `fd-dochub-chip fd-dochub-project-trigger${current ? ' is-on' : ''}`, attr: { type: 'button', title: '按项目筛选', 'aria-haspopup': 'menu', 'aria-expanded': String(this.projectMenuOpen) } });
    trigger.createSpan({ cls: 'fd-dochub-project-label', text: current ?? `全部项目（${projects.length}）` });
    trigger.createSpan({ cls: 'fd-dochub-ticon fd-dochub-chevron', attr: { 'aria-hidden': 'true' } });
    const menu = wrap.createDiv({ cls: `fd-dochub-menu is-project${this.projectMenuOpen ? ' is-open' : ''}`, attr: { role: 'menu', 'aria-label': '按项目筛选' } });
    const heading = menu.createDiv({ cls: 'fd-dochub-menu-heading', attr: { role: 'presentation' } });
    heading.createSpan({ text: '按项目筛选' }); heading.createSpan({ text: `${projects.length} 个项目` });
    const entries: Array<[string, string, number]> = [['', '全部项目', total], ...projects.map((group): [string, string, number] => [group.name, group.name, group.docs.length])];
    for (const [value, name, count] of entries) {
      const on = (current ?? '') === value;
      const option = menu.createEl('button', { cls: 'fd-dochub-option', attr: { type: 'button', role: 'menuitemradio', 'aria-checked': String(on), tabindex: '-1', 'data-project': value } });
      option.createEl('strong', { cls: 'fd-dochub-option-name', text: name });
      option.createSpan({ cls: 'fd-dochub-option-count', text: String(count) });
      option.createSpan({ cls: 'fd-dochub-check', attr: { 'aria-hidden': 'true' } });
    }
    trigger.addEventListener('click', () => (this.projectMenuOpen ? this.closeProjectMenu(false) : this.openProjectMenu(false)));
    trigger.addEventListener('keydown', event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); if (!this.projectMenuOpen) this.openProjectMenu(event.key === 'ArrowUp'); } });
    menu.addEventListener('click', event => {
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-project]');
      if (!option) return;
      this.filter.project = option.dataset.project || undefined;
      this.projectMenuOpen = false;
      this.renderBody();
      this.els.filters.querySelector<HTMLElement>('.fd-dochub-project-trigger')?.focus();
    });
    menu.addEventListener('keydown', event => this.onProjectMenuKey(event));
  }
  private projectMenuEls(): { trigger: HTMLElement | null; menu: HTMLElement | null; options: HTMLElement[] } {
    const wrap = this.els.filters.querySelector<HTMLElement>('.fd-dochub-project-wrap');
    const menu = wrap?.querySelector<HTMLElement>('.fd-dochub-menu') ?? null;
    return { trigger: wrap?.querySelector<HTMLElement>('.fd-dochub-project-trigger') ?? null, menu, options: menu ? Array.from(menu.querySelectorAll<HTMLElement>('[data-project]')) : [] };
  }
  private openProjectMenu(focusLast: boolean): void {
    const { trigger, menu, options } = this.projectMenuEls();
    if (!trigger || !menu) return;
    this.closeMenu(false);
    this.projectMenuOpen = true; menu.addClass('is-open'); trigger.setAttr('aria-expanded', 'true');
    const selected = options.find(option => option.getAttr('aria-checked') === 'true');
    (focusLast ? options[options.length - 1] : selected ?? options[0])?.focus();
    selected?.scrollIntoView({ block: 'nearest' });
  }
  private closeProjectMenu(focusTrigger: boolean): void {
    if (!this.projectMenuOpen) return;
    const { trigger, menu } = this.projectMenuEls();
    this.projectMenuOpen = false; menu?.removeClass('is-open'); trigger?.setAttr('aria-expanded', 'false');
    if (focusTrigger) trigger?.focus();
  }
  private onProjectMenuKey(event: KeyboardEvent): void {
    if (event.key === 'Tab') { this.closeProjectMenu(false); return; }
    const { options } = this.projectMenuEls(), active = options.indexOf(event.target as HTMLElement), last = options.length - 1;
    const target = event.key === 'ArrowDown' ? options[(active + 1) % options.length] : event.key === 'ArrowUp' ? options[(active - 1 + options.length) % options.length]
      : event.key === 'Home' ? options[0] : event.key === 'End' ? options[last] : null;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeProjectMenu(true); }
    else if (target) { event.preventDefault(); event.stopPropagation(); target.focus(); }
  }
  private menuOpen(): boolean { return this.els.menu.hasClass('is-open'); }
  private menuOptions(): HTMLElement[] { return Array.from(this.els.menu.querySelectorAll<HTMLElement>('[data-style-id]')); }
  private openMenu(focusLast: boolean): void {
    this.closeProjectMenu(false);
    this.els.menu.addClass('is-open'); this.els.preset.setAttr('aria-expanded', 'true');
    const options = this.menuOptions();
    (focusLast ? options[options.length - 1] : options.find(option => option.dataset.styleId === this.prefs.style) ?? options[0])?.focus();
  }
  private closeMenu(focusTrigger: boolean): void {
    if (!this.menuOpen()) return;
    this.els.menu.removeClass('is-open'); this.els.preset.setAttr('aria-expanded', 'false');
    if (focusTrigger) this.els.preset.focus();
  }
  /** 菜单内键盘：方向键 / Home / End 移动，Esc 关闭并回到触发按钮；这些键不再冒泡成文档中心的全局快捷键。 */
  private onMenuKey(event: KeyboardEvent): void {
    if (event.key === 'Tab') { this.closeMenu(false); return; }
    const options = this.menuOptions(), active = options.indexOf(event.target as HTMLElement), last = options.length - 1;
    const target = event.key === 'ArrowDown' ? options[(active + 1) % options.length] : event.key === 'ArrowUp' ? options[(active - 1 + options.length) % options.length]
      : event.key === 'Home' ? options[0] : event.key === 'End' ? options[last] : null;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeMenu(true); }
    else if (target) { event.preventDefault(); event.stopPropagation(); target.focus(); }
  }
  /** 全屏作用于文档中心根元素；失败只提示，不抛出。退出由再次触发或浏览器原生 Esc 完成。 */
  private async toggleFullscreen(): Promise<void> {
    const doc = this.els.root.ownerDocument;
    try {
      if (doc.fullscreenElement === this.els.root) await doc.exitFullscreen();
      else await this.els.root.requestFullscreen();
    } catch (error) { new Notice(`全屏切换失败：${error instanceof Error ? error.message : String(error)}`); }
  }
  private renderBody(): void {
    const { sub, tabs, filters, list } = this.els, now = Date.now();
    // 项目下拉的候选与篇数按“除项目外的其他条件”统计；已选项目不再存在时回到全部项目。
    const base = filterDocs(this.docs, { ...this.filter, project: undefined });
    const projects = groupByProject(base);
    if (this.filter.project && !projects.some(group => group.name === this.filter.project)) this.filter.project = undefined;
    const visible = filterDocs(this.docs, this.filter), hidden = this.docs.filter(isHidden).length;
    const atlasCount = this.docs.filter(doc => doc.atlas).length;
    sub.setText(`${this.docs.length - atlasCount} 份文档 · ${atlasCount} 个图集 · Notes/Docs、Plans、Research、Attachments/archify`);
    tabs.empty();
    const counts: Record<DocHubTab, number> = { recent: visible.length, project: groupByProject(visible).length, pinned: visible.filter(doc => doc.pinned).length };
    for (const [id, label] of TABS) {
      const button = tabs.createEl('button', { cls: `fd-dochub-tab${this.tab === id ? ' is-on' : ''}`, attr: { role: 'tab', 'aria-selected': String(this.tab === id) } });
      button.createSpan({ text: label }); button.createSpan({ cls: 'fd-dochub-count', text: String(counts[id]) });
      button.addEventListener('click', () => this.act({ type: 'tab', tab: id }));
    }
    filters.empty();
    const chip = (text: string, on: boolean, click: () => void) => {
      const el = filters.createEl('button', { cls: `fd-dochub-chip${on ? ' is-on' : ''}`, text, attr: { 'aria-pressed': String(on) } });
      el.addEventListener('click', click);
    };
    chip('全部', this.filter.kind === 'all', () => { this.filter.kind = 'all'; this.renderBody(); });
    for (const [kind, label] of Object.entries(DOC_HUB_KIND_LABELS)) chip(label, this.filter.kind === kind, () => { this.filter.kind = kind as DocHubDoc['kind']; this.renderBody(); });
    this.renderProjectMenu(filters, projects, base.length);
    filters.createSpan({ cls: 'fd-dochub-spacer' });
    chip(`显示已取代/归档（${hidden}）`, this.filter.showSuperseded, () => { this.filter.showSuperseded = !this.filter.showSuperseded; this.renderBody(); });
    list.empty();
    if (this.tab === 'recent') this.renderRecent(visible, now);
    else if (this.tab === 'project') this.renderProjects(visible, now);
    else this.renderPinned(visible, now);
  }

  private renderRecent(docs: DocHubDoc[], now: number): void {
    const groups = groupRecent(docs, now);
    let shown = 0;
    for (const group of groups) {
      const take = group.docs.slice(0, this.showAllRecent ? Infinity : Math.max(0, RECENT_CAP - shown));
      shown += take.length;
      if (!take.length) continue;
      const heading = this.els.list.createEl('h2', { cls: 'fd-dochub-group', text: group.label });
      heading.createSpan({ cls: 'fd-dochub-count', text: String(group.docs.length) });
      this.renderGrid(take, now, false);
    }
    if (shown < docs.length) this.els.list.createEl('button', { cls: 'fd-dochub-chip fd-dochub-more', text: `显示全部 ${docs.length} 份` }).addEventListener('click', () => { this.showAllRecent = true; this.renderBody(); });
    if (!docs.length) this.empty('没有匹配的文档');
  }
  private renderProjects(docs: DocHubDoc[], now: number): void {
    const groups = groupByProject(docs);
    groups.forEach((group, index) => {
      const details = this.els.list.createEl('details', { cls: 'fd-dochub-project' });
      details.open = this.projectOpen.get(group.name) ?? (index < 3 || !!this.filter.query || !!this.filter.project);
      details.addEventListener('toggle', () => this.projectOpen.set(group.name, details.open));
      const summary = details.createEl('summary');
      summary.createSpan({ cls: 'fd-dochub-project-name', text: group.name });
      summary.createSpan({ cls: 'fd-dochub-count', text: `${group.docs.length} 份` });
      summary.createSpan({ cls: 'fd-dochub-last', text: `最近 ${agoText(group.latest, now)}` });
      this.renderGrid(group.docs, now, false, details);
    });
    if (!groups.length) this.empty('没有匹配的文档');
  }
  private renderPinned(docs: DocHubDoc[], now: number): void {
    const pinned = pinnedDocs(docs);
    this.els.list.createDiv({ cls: 'fd-dochub-banner', text: '从未回看（无 reviewed）的排最前；其余按“距上次回看”最久排前。绿 < 7 天，黄 < 30 天，红 ≥ 30 天。置顶会刷新修改时间，所以不用修改时间判断回看。' });
    if (pinned.length) this.renderGrid(pinned, now, true);
    else this.empty('没有常驻文档。在任意卡片上点“置顶”，或给文档 frontmatter 加 pinned: true。');
  }
  private empty(text: string): void { this.els.list.createDiv({ cls: 'fd-dochub-empty', text }); }

  private renderGrid(docs: DocHubDoc[], now: number, showFreshness: boolean, parent: HTMLElement = this.els.list): void {
    const grid = parent.createDiv({ cls: 'fd-dochub-grid' });
    for (const doc of docs) this.renderCard(grid, doc, now, showFreshness);
  }
  private renderCard(grid: HTMLElement, doc: DocHubDoc, now: number, showFreshness: boolean): void {
    if (doc.atlas) { this.renderAtlasCard(grid, doc, now); return; }
    // 常驻视角里全部都是置顶，标记没有信息量；其余视角里置顶状态不能只靠 hover 才出现的按钮文字来表达。
    const marked = doc.pinned && !showFreshness;
    const card = grid.createDiv({ cls: `fd-dochub-card is-${doc.kind}${isHidden(doc) ? ' is-dim' : ''}${marked ? ' is-pinned' : ''}`, attr: { role: 'link', tabindex: '0', title: doc.path } });
    // 置顶角标放右上角（左侧已有类型色条），常驻可见，不依赖悬停。
    if (marked) setIcon(card.createDiv({ cls: 'fd-dochub-pinbadge', attr: { 'aria-label': '已置顶', title: '已置顶' } }), 'pin');
    card.createDiv({ cls: 'fd-dochub-title', text: doc.title });
    card.createDiv({ cls: 'fd-dochub-desc', text: doc.summary });
    const meta = card.createDiv({ cls: 'fd-dochub-meta' });
    meta.createSpan({ cls: 'fd-dochub-pill is-kind', text: DOC_HUB_KIND_LABELS[doc.kind] });
    if (doc.status) meta.createSpan({ cls: `fd-dochub-pill is-status-${doc.status.toLowerCase().replace(/[^a-z-]/g, '')}`, text: doc.status });
    for (const name of doc.projects.slice(0, 2)) meta.createSpan({ cls: 'fd-dochub-pill is-project', text: name });
    if (doc.projects.length > 2) meta.createSpan({ cls: 'fd-dochub-pill', text: `+${doc.projects.length - 2}` });
    const badge = showFreshness ? reviewBadge(doc, now) : null;
    meta.createSpan({ cls: `fd-dochub-when${badge ? ` is-${badge.tone}` : ''}`, text: badge ? badge.text : agoText(doc.mtime, now) });
    const actions = card.createDiv({ cls: 'fd-dochub-actions' });
    const pin = actions.createEl('button', { cls: `fd-dochub-action${doc.pinned ? ' is-on' : ''}`, text: doc.pinned ? '取消置顶' : '置顶', attr: { 'aria-pressed': String(doc.pinned) } });
    pin.addEventListener('click', () => void this.write(() => setPinned(this.processor, this.fileOf(doc), !doc.pinned), () => { doc.pinned = !doc.pinned; }));
    if (doc.pinned) {
      const review = actions.createEl('button', { cls: 'fd-dochub-action', text: '已回看' });
      review.addEventListener('click', () => void this.write(() => markReviewed(this.processor, this.fileOf(doc), new Date()), () => { doc.reviewedAt = new Date().setHours(0, 0, 0, 0); }));
    }
    const open = (event: MouseEvent | KeyboardEvent) => this.openDoc(doc, event.metaKey || event.ctrlKey);
    card.addEventListener('click', event => { if (!(event.target as HTMLElement).closest('button')) open(event); });
    card.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === card) { event.preventDefault(); event.stopPropagation(); open(event); } });
    card.addEventListener('mouseenter', event => this.scheduleHover(card, doc, event));
    card.addEventListener('mouseleave', () => this.cancelHover());
  }

  /** 图集卡：一个图集一张卡。卡内列出各页，点页面用浏览器打开；有总览页（或只有一页）的卡左下角带标识，点卡片直接打开它。搜索时命中的页排前并高亮。 */
  private renderAtlasCard(grid: HTMLElement, doc: DocHubDoc, now: number): void {
    const atlas = doc.atlas!;
    const entry = atlas.entryPath ?? (atlas.pages.length === 1 ? atlas.pages[0].path : null);
    const card = grid.createDiv({ cls: `fd-dochub-card is-atlas${entry ? '' : ' is-static'}${doc.pinned ? ' is-pinned' : ''}`, attr: entry ? { role: 'link', tabindex: '0', title: entry } : { title: doc.title } });
    if (doc.pinned) setIcon(card.createDiv({ cls: 'fd-dochub-pinbadge', attr: { 'aria-label': '已置顶', title: '已置顶' } }), 'pin');
    card.createDiv({ cls: 'fd-dochub-title', text: doc.title });
    const query = this.filter.query.trim();
    const hits = query ? atlas.pages.filter(page => pageMatches(page, query)) : [];
    const ordered = [...hits, ...atlas.pages.filter(page => !hits.includes(page))];
    // 页面区固定高度，页面再多也在区内滚动，所有图集卡一样高。
    const pages = card.createDiv({ cls: 'fd-dochub-pages' });
    for (const page of ordered) {
      const chip = pages.createEl('button', { cls: `fd-dochub-page${hits.includes(page) ? ' is-hit' : ''}`, text: page.title, attr: { type: 'button', title: page.path } });
      chip.addEventListener('click', event => { event.stopPropagation(); openInBrowser(this.app, page.path); });
    }
    const meta = card.createDiv({ cls: 'fd-dochub-meta' });
    if (entry) setIcon(meta.createSpan({ cls: 'fd-dochub-entrymark', attr: { 'aria-label': '点卡片打开总览页', title: '点卡片打开总览页' } }), 'layout-dashboard');
    meta.createSpan({ cls: 'fd-dochub-pill is-kind', text: DOC_HUB_KIND_LABELS.atlas });
    for (const name of doc.projects.slice(0, 2)) meta.createSpan({ cls: 'fd-dochub-pill is-project', text: name });
    meta.createSpan({ cls: 'fd-dochub-pill', text: `${atlas.pages.length} 页` });
    meta.createSpan({ cls: 'fd-dochub-when', text: agoText(doc.mtime, now) });
    const actions = card.createDiv({ cls: 'fd-dochub-actions' });
    const refs = actions.createEl('button', { cls: 'fd-dochub-action', text: '关联文档', attr: { type: 'button', title: '哪些文档引用了这个图集，点击跳转' } });
    refs.addEventListener('click', event => { event.stopPropagation(); void showReferences(this.app, atlas.collection, doc.title).catch(error => new Notice(`读取关联文档失败：${error instanceof Error ? error.message : String(error)}`)); });
    const prompt = actions.createEl('button', { cls: 'fd-dochub-action', text: '复制提示词', attr: { type: 'button', title: '复制给 agent 的提示词：评估并优化这个图集的组织方式' } });
    prompt.addEventListener('click', event => { event.stopPropagation(); void this.copyAtlasPrompt(doc); });
    const pin = actions.createEl('button', { cls: `fd-dochub-action${doc.pinned ? ' is-on' : ''}`, text: doc.pinned ? '取消置顶' : '置顶', attr: { type: 'button', 'aria-pressed': String(doc.pinned) } });
    pin.addEventListener('click', event => { event.stopPropagation(); this.setAtlasPinned(atlas.collection, !doc.pinned); });
    const remove = actions.createEl('button', { cls: 'fd-dochub-action is-danger', text: '删除', attr: { type: 'button', title: '整个图集目录移到废纸篓（先确认）' } });
    remove.addEventListener('click', event => { event.stopPropagation(); void this.deleteAtlas(doc); });
    if (entry) {
      const open = (event: Event) => { event.preventDefault(); openInBrowser(this.app, entry); };
      card.addEventListener('click', event => { if (!(event.target as HTMLElement).closest('button')) open(event); });
      card.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === card) { event.stopPropagation(); open(event); } });
    }
  }
  private async copyAtlasPrompt(doc: DocHubDoc): Promise<void> {
    const atlas = doc.atlas!;
    try {
      await navigator.clipboard.writeText(buildAtlasPrompt({ collection: atlas.collection, project: doc.projects[0] ?? '未关联项目', title: doc.title, documentPath: atlas.documentPath, entryPath: atlas.entryPath, pages: atlas.pages }));
      new Notice('提示词已复制，粘贴给 agent 即可');
    } catch (error) { new Notice(`复制失败：${error instanceof Error ? error.message : String(error)}`); }
  }

  private setAtlasPinned(collection: string, pinned: boolean): void {
    const current = new Set(this.prefs.atlasPinned ?? []);
    if (pinned) current.add(collection); else current.delete(collection);
    this.prefs = normalizePrefs({ ...this.prefs, atlasPinned: [...current] });
    for (const doc of this.docs) if (doc.atlas?.collection === collection) doc.pinned = pinned;
    this.persistPrefs();
    this.renderBody();
  }
  private async deleteAtlas(doc: DocHubDoc): Promise<void> {
    const atlas = doc.atlas!;
    try {
      if (!(await confirmAndTrashCollection(this.app, atlas.collection, doc.title))) return;
      if (this.prefs.atlasPinned?.includes(atlas.collection)) this.setAtlasPinned(atlas.collection, false);
      new Notice(`已移到废纸篓：${doc.title}`);
      await this.reload();
    } catch (error) { new Notice(`删除失败：${error instanceof Error ? error.message : String(error)}`); }
  }

  /** 悬停预览防抖：停留满 HOVER_DELAY 才触发，划过不弹；同一时间只保留一个待触发。 */
  private scheduleHover(card: HTMLElement, doc: DocHubDoc, event: MouseEvent): void {
    this.cancelHover();
    this.hoverTimer = window.setTimeout(() => {
      this.hoverTimer = null;
      if (this.closed || !card.isConnected) return;
      this.app.workspace.trigger('hover-link', { event, source: DOC_HUB_HOVER_SOURCE, hoverParent: this, targetEl: card, linktext: doc.path });
    }, HOVER_DELAY);
  }
  private cancelHover(): void {
    if (this.hoverTimer !== null) window.clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
  }

  private readonly processor = (file: TFile, mutate: (frontmatter: Record<string, unknown>) => void) => this.app.fileManager.processFrontMatter(file, mutate);
  private fileOf(doc: DocHubDoc): TFile {
    const file = this.app.vault.getAbstractFileByPath(doc.path);
    if (!(file instanceof TFile)) throw new Error(`未找到文档：${doc.path}`);
    return file;
  }
  /** 写回只经 processFrontMatter；成功后乐观更新本地视图，随后 metadataCache 事件会按真实内容刷新。 */
  private async write(run: () => Promise<void>, apply: () => void): Promise<void> {
    try { await run(); apply(); this.renderBody(); }
    catch (error) { new Notice(`写回失败：${error instanceof Error ? error.message : String(error)}`); }
  }
  private openDoc(doc: DocHubDoc, newTab: boolean): void {
    try {
      const leaf = selectContentLeaf(this.app.workspace, DOC_HUB_VIEW_TYPE, newTab);
      void leaf.openFile(this.fileOf(doc)).then(() => this.app.workspace.setActiveLeaf(leaf, { focus: true }));
    } catch (error) { new Notice(`未能打开文档：${error instanceof Error ? error.message : String(error)}`); }
  }
}
