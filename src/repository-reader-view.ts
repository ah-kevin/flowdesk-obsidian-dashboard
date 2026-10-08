import { ItemView, WorkspaceLeaf, ViewStateResult } from 'obsidian';
import * as path from 'path';
import { readRepositoryMarkdown, renderRepositoryMarkdown } from './repository-reader';

export const FLOWDESK_REPOSITORY_VIEW_TYPE = 'flowdesk-repository-reader';
export interface RepositoryReaderDependencies {
 openOriginal?: (absolutePath: string) => Promise<unknown>;
}
export class RepositoryReaderView extends ItemView {
 private absolutePath = '';
 private generation = 0;
 private controller: AbortController|null = null;
 private closed = false;
 ready = false;
 readError = '';
 constructor(leaf: WorkspaceLeaf, private readonly dependencies: RepositoryReaderDependencies = {}) { super(leaf); }
 getViewType(): string { return FLOWDESK_REPOSITORY_VIEW_TYPE; }
 getDisplayText(): string { return this.absolutePath ? `${path.basename(this.absolutePath)}（只读）` : '库外 Markdown（只读）'; }
 getIcon(): string { return 'file-text'; }
 getState(): Record<string,unknown> { return {absolutePath:this.absolutePath}; }
 async onOpen(): Promise<void> { this.closed = false; }
 async setState(state: unknown, _result: ViewStateResult): Promise<void> {
  const candidate = state as {absolutePath?:unknown}|null;
  this.absolutePath = typeof candidate?.absolutePath === 'string' ? candidate.absolutePath : '';
  await this.refresh();
 }
 async refresh(): Promise<void> {
  if (this.closed) return;
  const generation = ++this.generation, absolutePath = this.absolutePath;
  this.controller?.abort(); this.controller = new AbortController();
  const controller = this.controller;
  this.ready = false; this.readError = '';
  this.contentEl.empty(); this.contentEl.addClass('flowdesk-repository-reader');
  this.contentEl.createEl('h2',{text:this.getDisplayText()});
  this.contentEl.createEl('p',{text:absolutePath,cls:'flowdesk-repository-path'});
  this.contentEl.createEl('p',{text:'只读 Markdown · UTF-8 · 最大 2 MiB。图片、嵌入和内部引用未加载；链接只显示文本，暂不定位章节；复选框以静态文本显示。可查看完整只读源码。',cls:'flowdesk-repository-boundary'});
  const refresh = this.contentEl.createEl('button',{text:'刷新',cls:'flowdesk-repository-refresh'});
  refresh.addEventListener('click',()=>this.refresh());
  const status = this.contentEl.createEl('p',{text:'正在读取…',cls:'flowdesk-repository-status'});
  try {
   const document = await readRepositoryMarkdown(absolutePath,controller.signal);
   if (!this.isCurrent(generation)) return;
   const body = this.contentEl.createDiv({cls:'flowdesk-repository-body markdown-preview-view'}); body.remove();
   body.innerHTML = renderRepositoryMarkdown(document.markdown);
   if (!this.isCurrent(generation)) return;
   this.contentEl.appendChild(body); this.ready = true; status.setText('已读取原文件 · 只读');
   const sourceToggle = this.contentEl.createEl('button',{text:'查看只读源码',cls:'flowdesk-repository-source-toggle'});
   let showingSource = false;
   sourceToggle.addEventListener('click',()=>{
    if (!this.isCurrent(generation)) return;
    showingSource = !showingSource;body.empty();
    if (showingSource) body.createEl('pre',{text:document.markdown,cls:'flowdesk-repository-source'});
    else body.innerHTML = renderRepositoryMarkdown(document.markdown);
    sourceToggle.setText(showingSource ? '查看渲染正文' : '查看只读源码');
   });
   if (this.dependencies.openOriginal) {
    const original = this.contentEl.createEl('button',{text:'在系统中打开原文件',cls:'flowdesk-repository-open-original'});
    original.addEventListener('click',async()=>{
     try { await this.dependencies.openOriginal!(absolutePath); if(this.isCurrent(generation))status.setText('已提交系统打开请求；是否打开由系统决定'); }
     catch(error) { if(this.isCurrent(generation))status.setText(`系统打开请求失败：${error instanceof Error ? error.message : String(error)}`); }
    });
   }
  } catch(error) {
   if (!this.isCurrent(generation)) return;
   this.readError = error instanceof Error ? error.message : String(error);status.setText(`读取失败：${this.readError}`);
  }
 }
 private isCurrent(generation:number):boolean { return !this.closed && generation === this.generation; }
 async onClose():Promise<void> { this.closed = true;this.generation++;this.controller?.abort();this.controller = null;this.ready = false; }
}
