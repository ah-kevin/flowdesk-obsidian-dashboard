import { readFile, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { App, FileSystemAdapter, MarkdownRenderChild, Modal, Notice, parseLinktext, TAbstractFile, TFile, type MarkdownPostProcessorContext } from 'obsidian';
import { collectionOf, isEntryPage } from './atlas-data';

const ATLAS_LINK = 'a.internal-link[data-href]';
const PREVIEW_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; frame-src about: data: blob:; base-uri 'none'; form-action 'none'";
const unpack = promisify(gunzip);
const MAX_UNPACKED_BYTES = 32 * 1024 * 1024;

type DesktopWindow = Window & {
  require(name: 'electron'): { shell: { openExternal(url: string): Promise<void> } };
};

function isAtlasFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile
    && Boolean(collectionOf(file.path))
    && !file.path.includes('\\')
    && !file.path.split('/').some(part => !part || part === '.' || part === '..');
}

interface CollectionView {
  title: string;
  group: string;
  pageId: string;
  route: string;
  path: string;
  readerId?: string;
  diagramId?: string;
}

interface CollectionNavigation {
  views: CollectionView[];
  selected: number;
  load(view: CollectionView, signal: AbortSignal): Promise<string | null>;
}

class AtlasPreviewModal extends Modal {
  private switching: AbortController | null = null;

  constructor(
    app: App,
    private readonly title: string,
    private html: string | null,
    private readonly browserUrl: URL,
    private readonly release: () => void,
    private readonly collection: CollectionNavigation | null,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('fd-atlas-preview-modal');
    this.setTitle(this.title);
    const openInBrowser = this.titleEl.createEl('button', {
      text: '用默认浏览器打开',
      attr: { type: 'button' },
    });
    openInBrowser.addEventListener('click', async () => {
      try {
        const { shell } = (window as DesktopWindow).require('electron');
        await shell.openExternal(this.browserUrl.href);
      } catch {
        new Notice('无法用默认浏览器打开图集');
      }
    });
    const frame = this.contentEl.createEl('iframe', {
      attr: {
        title: this.title,
        sandbox: 'allow-scripts',
        referrerpolicy: 'no-referrer',
      },
    });
    frame.srcdoc = this.html ?? previewDocument('<p>没有可预览的图集子页。</p>', '');
    this.html = '';
    const collection = this.collection;
    if (!collection || collection.views.length < 2) return;

    const select = this.titleEl.createEl('select', { cls: 'fd-atlas-page-select', attr: { 'aria-label': '图集子页' } });
    const groups = new Map<string, HTMLOptGroupElement>();
    collection.views.forEach((view, index) => {
      let group = groups.get(view.group);
      if (!group) {
        group = select.createEl('optgroup', { attr: { label: view.group } });
        groups.set(view.group, group);
      }
      group.createEl('option', { text: view.title, attr: { value: String(index) } });
    });
    let selected = collection.selected;
    select.value = String(selected);
    select.addEventListener('change', async () => {
      this.switching?.abort();
      if (!select.value) return;
      const index = Number(select.value);
      const view = collection.views[index];
      if (!view || index === selected) return;
      const request = this.switching = new AbortController();
      const html = await collection.load(view, request.signal);
      if (request.signal.aborted) return;
      this.switching = null;
      if (html === null) {
        select.value = String(selected);
        new Notice('无法读取这个图集子页');
        return;
      }
      selected = index;
      this.browserUrl.hash = view.route;
      frame.srcdoc = previewDocument(html, '');
    });
  }

  onClose(): void {
    this.switching?.abort();
    this.switching = null;
    this.titleEl.empty();
    this.contentEl.empty();
    this.release();
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
}

function embeddedJson(html: string, id: string): Record<string, unknown> | undefined {
  const blob = new RegExp(`<script\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</script>`, 'i').exec(html)?.[1];
  if (blob === undefined) return;
  try { return asRecord(JSON.parse(blob)); } catch { return undefined; }
}

function collectionIndex(html: string, base: URL, root: string, collection: string): { title?: string; views: CollectionView[] } | null {
  const metadata = embeddedJson(html, 'collection-data');
  if (metadata?.schema !== 'flowdesk.visual-doc-collection/2' || !Array.isArray(metadata.groups) || !Array.isArray(metadata.pages)) return null;

  const views: CollectionView[] = [];
  for (const rawGroup of metadata.groups) {
    const group = asRecord(rawGroup);
    if (typeof group?.id !== 'string' || typeof group.label !== 'string') continue;
    for (const rawPage of metadata.pages) {
      const page = asRecord(rawPage);
      const view = asRecord(asRecord(page?.views)?.[group.id]);
      if (typeof page?.id !== 'string' || typeof view?.url !== 'string') continue;
      let path: string;
      try {
        if (/^(?:[a-z][a-z0-9+.-]*:|[/\\\\])/i.test(view.url)) continue;
        path = fileURLToPath(new URL(view.url, base));
      } catch { continue; }
      const vaultPath = relative(root, path).split(sep).join('/');
      if (collectionOf(vaultPath) !== collection || isEntryPage(vaultPath)) continue;
      views.push({
        title: typeof view.title === 'string' ? view.title : typeof page.title === 'string' ? page.title : vaultPath.split('/').pop()!,
        group: group.label,
        pageId: page.id,
        route: `${page.id}/${group.id}`,
        path,
        readerId: typeof view.readerId === 'string' ? view.readerId : undefined,
        diagramId: typeof view.embeddedId === 'string' ? view.embeddedId : undefined,
      });
    }
  }
  return { title: typeof metadata.title === 'string' ? metadata.title : undefined, views };
}

async function unpackHtml(payload: Record<string, unknown> | undefined): Promise<string | null> {
  if (typeof payload?.htmlGzip === 'string') {
    try {
      const bytes = await unpack(Buffer.from(payload.htmlGzip, 'base64'), { maxOutputLength: MAX_UNPACKED_BYTES });
      return bytes.toString('utf8');
    } catch { return null; }
  }
  return typeof payload?.html === 'string' ? payload.html : null;
}

function collectionLoader(html: string, root: string, collection: string): CollectionNavigation['load'] {
  // Decode bundled content only when the original file is unavailable.
  let readers: Record<string, unknown> | undefined;
  let diagrams: Record<string, unknown> | undefined;
  return async (view, signal) => {
    let reader: string | null = null;
    try {
      const resource = await realpath(view.path);
      const vaultPath = relative(root, resource).split(sep).join('/');
      if (collectionOf(vaultPath) === collection && !isEntryPage(vaultPath)) {
        reader = await readFile(resource, { encoding: 'utf8', signal });
      }
    } catch { /* A bundled copy may still be readable. */ }
    if (signal.aborted) return null;
    if (reader === null && view.readerId) {
      readers ??= embeddedJson(html, 'collection-readers') ?? {};
      reader = await unpackHtml(asRecord(readers[view.readerId]));
    }
    if (reader === null || signal.aborted || !view.diagramId) return reader;

    diagrams ??= embeddedJson(html, 'collection-diagrams') ?? {};
    const diagram = asRecord(diagrams[view.diagramId]);
    if (typeof diagram?.childId !== 'string') return reader;
    const prepared = asRecord(embeddedJson(reader, 'archify-explainer-prepared')?.preparedDiagrams);
    const child = asRecord(asRecord(prepared?.diagrams)?.[diagram.childId]);
    return await unpackHtml(child) ?? reader;
  };
}

function previewDocument(html: string, subpath: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_POLICY}">`;
  let fragmentScript = '';
  if (subpath.length > 1) {
    const anchor = JSON.stringify(subpath.slice(1)).replace(/</g, '\\u003c');
    fragmentScript = `<script>
      document.addEventListener('DOMContentLoaded', () => {
        const fragment = ${anchor};
        let id = fragment;
        try { id = decodeURIComponent(fragment); } catch {}
        (document.getElementById(id) || document.getElementsByName(id)[0])?.scrollIntoView();
      }, { once: true });
    </script>`;
  }
  // Obsidian's app: resource URL is inaccessible from an isolated preview frame.
  // Keep the doctype and put the policy before the diagram's resources and scripts.
  return html.replace(/^(\s*<!doctype\s+html\s*>)?/i,
    doctype => `${doctype || '<!doctype html>'}${policy}${fragmentScript}`);
}

export class AtlasPreview {
  private readonly markdownChildren = new Set<MarkdownRenderChild>();
  private loading: AbortController | null = null;
  private modal: AtlasPreviewModal | null = null;
  private disposed = false;

  constructor(private readonly app: App) {}

  dispose(): void {
    this.disposed = true;
    this.loading?.abort();
    this.loading = null;
    this.modal?.close();
    for (const child of this.markdownChildren) child.unload();
    this.markdownChildren.clear();
  }

  async open(vaultPath: string, sourceIsOpen: () => boolean): Promise<void> {
    if (this.disposed || !sourceIsOpen()) return;
    const file = this.app.vault.getAbstractFileByPath(vaultPath);
    if (isAtlasFile(file)) await this.show(file, '', sourceIsOpen);
    else new Notice('未找到可预览的图集页面');
  }

  addMarkdownLinks(element: HTMLElement, context: MarkdownPostProcessorContext): void {
    if (this.disposed || !element.querySelector(ATLAS_LINK)) return;
    const child = new MarkdownRenderChild(element);
    const sourceIsOpen = () => this.markdownChildren.has(child);
    const sourcePath = context.sourcePath;
    child.registerDomEvent(element, 'click', event => {
      if (this.disposed || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as Element | null;
      const link = target?.closest?.(ATLAS_LINK);
      if (!link || !element.contains(link)) return;
      const href = link.getAttribute('data-href');
      if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return;
      const { path, subpath } = parseLinktext(href);
      if (!/\.html$/i.test(path)) return;
      const file = this.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
      if (!isAtlasFile(file)) return;
      event.preventDefault();
      event.stopPropagation();
      void this.show(file, subpath, sourceIsOpen);
    }, { capture: true });
    child.register(() => this.markdownChildren.delete(child));
    this.markdownChildren.add(child);
    context.addChild(child);
  }

  private async show(file: TFile, subpath: string, sourceIsOpen: () => boolean): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice('图集预览需要桌面端本地库');
      return;
    }
    this.loading?.abort();
    const request = new AbortController();
    this.loading = request;
    const isCurrent = () => !request.signal.aborted && sourceIsOpen();
    const vaultPath = file.path;
    try {
      const root = await realpath(adapter.getBasePath());
      if (!isCurrent()) return;
      const resource = await realpath(join(root, vaultPath));
      if (!isCurrent()) return;
      const actualVaultPath = relative(root, resource).split(sep).join('/');
      const collection = collectionOf(actualVaultPath);
      if (!collection || file.path !== vaultPath) {
        new Notice('图集预览需要库内的图集文件');
        return;
      }

      const html = await readFile(resource, { encoding: 'utf8', signal: request.signal });
      if (!isCurrent()) return;

      const browserUrl = pathToFileURL(resource);
      browserUrl.hash = subpath;
      const index = isEntryPage(actualVaultPath) ? collectionIndex(html, browserUrl, root, collection) : null;
      let navigation: CollectionNavigation | null = null;
      let content: string | null = null;
      if (index) {
        const { views } = index;
        const load = collectionLoader(html, root, collection);
        navigation = { views, selected: -1, load };
        let fragment = subpath.slice(1);
        try { fragment = decodeURIComponent(fragment); } catch { /* Use the original fragment. */ }
        const preferred = views.findIndex(view => view.route === fragment || view.pageId === fragment);
        const candidates = views.map((_, index) => index).filter(index => index !== preferred);
        if (preferred >= 0) candidates.unshift(preferred);
        for (const candidate of candidates) {
          const view = views[candidate];
          const member = await load(view, request.signal);
          if (!isCurrent()) return;
          if (member === null) continue;
          navigation.selected = candidate;
          browserUrl.hash = view.route;
          content = previewDocument(member, '');
          break;
        }
      } else {
        content = previewDocument(html, subpath);
      }
      const modal = new AtlasPreviewModal(this.app, index?.title ?? file.basename, content, browserUrl, () => {
        if (this.modal === modal) this.modal = null;
      }, navigation);
      this.modal?.close();
      this.modal = modal;
      modal.open();
    } catch {
      if (isCurrent()) new Notice('无法打开本地图集预览');
    } finally {
      if (this.loading === request) this.loading = null;
    }
  }
}
