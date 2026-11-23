import { readFile, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { App, FileSystemAdapter, MarkdownRenderChild, Modal, Notice, parseLinktext, TAbstractFile, TFile, type MarkdownPostProcessorContext } from 'obsidian';
import { collectionOf } from './atlas-data';

const ATLAS_LINK = 'a.internal-link[data-href]';
const PREVIEW_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; frame-src about: data: blob:; base-uri 'none'; form-action 'none'";

type DesktopWindow = Window & {
  require(name: 'electron'): { shell: { openExternal(url: string): Promise<void> } };
};

function isAtlasFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile
    && Boolean(collectionOf(file.path))
    && !file.path.includes('\\')
    && !file.path.split('/').some(part => !part || part === '.' || part === '..');
}

class AtlasPreviewModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private html: string,
    private readonly browserUrl: URL,
    private readonly release: () => void,
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
    frame.srcdoc = this.html;
    this.html = '';
  }

  onClose(): void {
    this.titleEl.empty();
    this.contentEl.empty();
    this.release();
  }
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
      if (!collectionOf(actualVaultPath) || file.path !== vaultPath) {
        new Notice('图集预览需要库内的图集文件');
        return;
      }

      const html = await readFile(resource, { encoding: 'utf8', signal: request.signal });
      if (!isCurrent()) return;

      const browserUrl = pathToFileURL(resource);
      browserUrl.hash = subpath;
      const modal = new AtlasPreviewModal(this.app, file.basename, previewDocument(html, subpath), browserUrl, () => {
        if (this.modal === modal) this.modal = null;
      });
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
