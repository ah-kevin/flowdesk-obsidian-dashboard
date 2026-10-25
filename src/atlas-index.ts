import { App, FileSystemAdapter, Modal, Notice, TFile, TFolder } from 'obsidian';
import { ATLAS_ROOT, buildEntry, collectionOf, groupCollections, manifestDocumentPath, resolveProject, type AtlasCollection, type AtlasEntry } from './atlas-data';
import { projectsOf } from './doc-hub-data';

const SKIP_DIRS = new Set(['.meta', 'tmp', 'reference', 'source']);
const REFERENCE_LIST_CAP = 8;

/** 内存索引：按 mtime 复用已提取的页面，每次刷新只重读改动过的 HTML。 */
export class AtlasIndex {
  private pages = new Map<string, { mtime: number; entry: AtlasEntry }>();

  async load(app: App): Promise<AtlasCollection[]> {
    const adapter = app.vault.adapter;
    if (!(await adapter.exists(ATLAS_ROOT))) return [];
    const paths: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const listing = await adapter.list(dir);
      for (const file of listing.files) if (collectionOf(file)) paths.push(file);
      for (const folder of listing.folders) if (!SKIP_DIRS.has(folder.split('/').pop() ?? '')) await walk(folder);
    };
    await walk(ATLAS_ROOT);

    const projectNames = this.projectNames(app);
    const context = new Map<string, { project: string; doc: { title: string; path: string } | null }>();
    const entries: AtlasEntry[] = [];
    for (const path of paths) {
      const collection = collectionOf(path)!;
      if (!context.has(collection)) context.set(collection, await this.contextFor(app, collection, projectNames));
      const { project } = context.get(collection)!;
      const mtime = (await adapter.stat(path))?.mtime ?? 0;
      let cached = this.pages.get(path);
      if (!cached || cached.mtime !== mtime) {
        const entry = buildEntry(path, await adapter.read(path), mtime, project);
        if (!entry) continue;
        cached = { mtime, entry };
        this.pages.set(path, cached);
      }
      cached.entry.project = project;
      entries.push(cached.entry);
    }
    const alive = new Set(paths);
    for (const path of [...this.pages.keys()]) if (!alive.has(path)) this.pages.delete(path);
    const docs: Record<string, { title: string; path: string }> = {};
    for (const [collection, value] of context) if (value.doc) docs[collection] = value.doc;
    return groupCollections(entries, docs);
  }

  private projectNames(app: App): string[] {
    const folder = app.vault.getAbstractFileByPath('Notes/Projects');
    return folder instanceof TFolder ? folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === 'md').map(file => file.basename) : [];
  }
  /** 项目与标题都取自 artifacts.json 指向的主文档；清单缺失或不可读时只按目录前缀兜底，不阻断。 */
  private async contextFor(app: App, collection: string, projectNames: string[]): Promise<{ project: string; doc: { title: string; path: string } | null }> {
    let docProjects: string[] = [];
    let doc: { title: string; path: string } | null = null;
    try {
      const manifestPath = `${ATLAS_ROOT}/${collection}/artifacts.json`;
      if (await app.vault.adapter.exists(manifestPath)) {
        const docPath = manifestDocumentPath(JSON.parse(await app.vault.adapter.read(manifestPath)));
        const file = docPath ? app.vault.getAbstractFileByPath(docPath) : null;
        if (file instanceof TFile) {
          const meta = app.metadataCache.getFileCache(file)?.frontmatter;
          if (meta) docProjects = projectsOf(meta);
          doc = { title: typeof meta?.title === 'string' && meta.title.trim() ? meta.title.trim() : file.basename, path: file.path };
        }
      }
    } catch { /* 清单不可读：保持兜底 */ }
    return { project: resolveProject(collection, docProjects, projectNames), doc };
  }
}

/** 用系统默认浏览器打开 vault 内的 HTML。 */
export function openInBrowser(app: App, vaultPath: string): void {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) { new Notice('仅桌面端支持用浏览器打开'); return; }
  const absolute = `${adapter.getBasePath()}/${vaultPath}`;
  try {
    const { shell } = (window as unknown as { require(name: string): { shell: { openPath(path: string): Promise<string> } } }).require('electron');
    void shell.openPath(absolute).then(error => { if (error) new Notice(`打开失败：${error}`); });
  } catch { new Notice(`无法调用系统打开：${absolute}`); }
}

/** 整个图集目录：文件数、体积，以及哪些 Markdown 文档还在引用它。 */
async function describeCollection(app: App, collection: string): Promise<{ files: number; bytes: number; references: string[] }> {
  const adapter = app.vault.adapter;
  let files = 0, bytes = 0;
  const walk = async (dir: string): Promise<void> => {
    const listing = await adapter.list(dir);
    for (const file of listing.files) { files++; bytes += (await adapter.stat(file))?.size ?? 0; }
    for (const folder of listing.folders) await walk(folder);
  };
  await walk(`${ATLAS_ROOT}/${collection}`);
  const needle = `archify/${collection}`;
  const references: string[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path.startsWith(`${ATLAS_ROOT}/`)) continue;
    if ((await app.vault.cachedRead(file)).includes(needle)) references.push(file.path);
  }
  return { files, bytes, references };
}
const sizeText = (bytes: number): string => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

class ConfirmTrashModal extends Modal {
  constructor(app: App, private readonly title: string, private readonly collection: string, private readonly info: { files: number; bytes: number; references: string[] }, private readonly onConfirm: () => void) { super(app); }
  onOpen(): void {
    const { contentEl, info } = this;
    this.setTitle('删除图集');
    contentEl.createEl('p', { text: `将「${this.title}」整个目录移到废纸篓：${ATLAS_ROOT}/${this.collection}（${info.files} 个文件，${sizeText(info.bytes)}）。` });
    contentEl.createEl('p', { cls: 'mod-warning', text: '包含页面、源稿、回执和 artifacts.json 清单；移到系统废纸篓，可从废纸篓还原。' });
    if (info.references.length) {
      contentEl.createEl('p', { text: `仍有 ${info.references.length} 篇文档引用它，删除后这些文档里的图会打不开：` });
      const list = contentEl.createEl('ul');
      for (const path of info.references.slice(0, REFERENCE_LIST_CAP)) list.createEl('li', { text: path });
      if (info.references.length > REFERENCE_LIST_CAP) list.createEl('li', { text: `…另有 ${info.references.length - REFERENCE_LIST_CAP} 篇` });
    }
    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    buttons.createEl('button', { cls: 'mod-warning', text: '移到废纸篓' }).addEventListener('click', () => { this.onConfirm(); this.close(); }); // 先记下确认再关闭：关闭会触发 onClose 去 resolve，顺序反了就永远是「未确认」
    buttons.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
  }
  onClose(): void { this.contentEl.empty(); }
}

/** 确认后把整个图集目录移到废纸篓（优先系统废纸篓，失败退回 vault 的 .trash）；返回是否已删除。 */
export async function confirmAndTrashCollection(app: App, collection: string, title: string): Promise<boolean> {
  const info = await describeCollection(app, collection);
  const confirmed = await new Promise<boolean>(resolve => {
    let accepted = false;
    const modal = new ConfirmTrashModal(app, title, collection, info, () => { accepted = true; });
    const close = modal.onClose.bind(modal);
    modal.onClose = () => { close(); resolve(accepted); };
    modal.open();
  });
  if (!confirmed) return false;
  const dir = `${ATLAS_ROOT}/${collection}`;
  const adapter = app.vault.adapter;
  let moved = await adapter.trashSystem(dir);
  if (!moved) { await adapter.trashLocal(dir); moved = !(await adapter.exists(dir)); }
  if (!moved) throw new Error('未能移到废纸篓');
  return true;
}
