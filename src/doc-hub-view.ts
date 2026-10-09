import { ItemView, Notice, TFile, TFolder, Workspace, WorkspaceLeaf } from 'obsidian';
import { selectContentLeaf } from './dashboard-placement';
import {
  DOC_HUB_FOLDERS, DOC_HUB_KIND_LABELS, SUMMARY_LIMIT, agoText, buildDoc, filterDocs, freshness, groupByProject, groupRecent, isHidden, kindOfPath,
  markReviewed, pinnedDocs, resolveKey, reviewBadge, setPinned, stripFrontmatter, summaryOfBody, type DocHubDoc, type DocHubFilter, type DocHubKeyAction, type DocHubTab,
} from './doc-hub-data';
import { nextStyle, normalizePrefs, styleLabel, toggleTheme, type DocHubPrefs, type DocHubTheme } from './doc-hub-style';

export const DOC_HUB_VIEW_TYPE = 'flowdesk-doc-hub';
export const DOC_HUB_HOVER_SOURCE = 'flowdesk-doc-hub';
const RECENT_CAP = 48;
const REFRESH_DELAY = 300;
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
  private tab: DocHubTab = 'recent';
  private showAllRecent = false;
  private projectOpen = new Map<string, boolean>();
  private prefs: DocHubPrefs;
  private generation = 0;
  private timer: number | null = null;
  private closed = false;
  private els!: Record<'root' | 'sub' | 'tabs' | 'filters' | 'list' | 'theme' | 'style', HTMLElement> & { search: HTMLInputElement };
  constructor(leaf: WorkspaceLeaf, private readonly host: DocHubHost) { super(leaf); this.prefs = normalizePrefs(host.prefs()); }
  getViewType(): string { return DOC_HUB_VIEW_TYPE; }
  getDisplayText(): string { return '文档中心'; }
  getIcon(): string { return 'library'; }

  async onOpen(): Promise<void> {
    this.closed = false;
    this.buildShell();
    const touch = (path: string) => { if (kindOfPath(path)) this.scheduleReload(); };
    this.registerEvent(this.app.metadataCache.on('changed', file => touch(file.path)));
    this.registerEvent(this.app.vault.on('create', file => touch(file.path)));
    this.registerEvent(this.app.vault.on('delete', file => touch(file.path)));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { touch(file.path); touch(oldPath); }));
    await this.reload();
  }
  async onClose(): Promise<void> { this.closed = true; this.generation++; if (this.timer !== null) window.clearTimeout(this.timer); this.timer = null; }

  private currentTheme(): DocHubTheme { return this.prefs.theme ?? (document.body.classList.contains('theme-light') ? 'light' : 'dark'); }
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
    const search = tools.createEl('input', { cls: 'fd-dochub-search', attr: { type: 'search', placeholder: '搜索标题 / 摘要 / 项目…（/）' } });
    search.addEventListener('input', () => { this.filter.query = search.value; this.renderBody(); });
    const style = tools.createEl('button', { cls: 'fd-dochub-icon', attr: { 'aria-label': '切换风格（S）' } });
    const theme = tools.createEl('button', { cls: 'fd-dochub-icon', attr: { 'aria-label': '切换明暗（T）' } });
    style.addEventListener('click', () => this.act({ type: 'style' }));
    theme.addEventListener('click', () => this.act({ type: 'theme' }));
    const filters = root.createDiv({ cls: 'fd-dochub-filters' });
    const list = root.createDiv({ cls: 'fd-dochub-list' });
    this.els = { root, sub, tabs, filters, list, theme, style, search };
    this.registerDomEvent(root, 'keydown', event => {
      const target = event.target as HTMLElement;
      const action = resolveKey(event.key, ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable, event.metaKey || event.ctrlKey || event.altKey);
      if (action) { event.preventDefault(); this.act(action); }
    });
    this.renderAll();
    root.focus();
  }

  private act(action: DocHubKeyAction): void {
    if (action.type === 'focus-search') this.els.search.focus();
    else if (action.type === 'tab') { this.tab = action.tab; this.renderAll(); }
    else if (action.type === 'theme') { this.prefs = { ...this.prefs, theme: toggleTheme(this.currentTheme()) }; this.persistPrefs(); }
    else if (action.type === 'style') { this.prefs = { ...this.prefs, style: nextStyle(this.prefs.style) }; this.persistPrefs(); }
    else { this.filter.query = ''; this.els.search.value = ''; this.els.search.blur(); this.els.root.focus(); this.renderBody(); }
  }
  private persistPrefs(): void {
    this.renderAll();
    this.host.savePrefs(this.prefs).catch(error => new Notice(`文档中心设置未能保存：${error instanceof Error ? error.message : String(error)}`));
  }

  private renderAll(): void {
    const { root, theme, style } = this.els;
    root.setAttr('data-theme', this.currentTheme()); root.setAttr('data-style', this.prefs.style);
    theme.setText(this.currentTheme() === 'dark' ? '☾' : '☀'); style.setText(styleLabel(this.prefs.style));
    this.renderBody();
  }
  private renderBody(): void {
    const { sub, tabs, filters, list } = this.els, now = Date.now();
    const visible = filterDocs(this.docs, this.filter), hidden = this.docs.filter(isHidden).length;
    sub.setText(`${this.docs.length} 份文档 · Notes/Docs、Plans、Research · 实时读取 frontmatter`);
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
      details.open = this.projectOpen.get(group.name) ?? (index < 3 || !!this.filter.query);
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
    const card = grid.createDiv({ cls: `fd-dochub-card is-${doc.kind}${isHidden(doc) ? ' is-dim' : ''}`, attr: { role: 'link', tabindex: '0', title: doc.path } });
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
    card.addEventListener('mouseover', event => this.app.workspace.trigger('hover-link', { event, source: DOC_HUB_HOVER_SOURCE, hoverParent: this, targetEl: card, linktext: doc.path }));
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
