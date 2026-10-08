import MarkdownIt from 'markdown-it';
import { open, stat } from 'fs/promises';
import * as path from 'path';
import { TextDecoder } from 'util';

/** The reader never allocates or renders more than 2 MiB of document data. */
export const MAX_REPOSITORY_MARKDOWN_BYTES = 2 * 1024 * 1024;
export interface RepositoryMarkdown { absolutePath: string; markdown: string }
function checkCancelled(signal?: AbortSignal): void {
 if (signal?.aborted) { const error = new Error('读取已取消'); error.name = 'AbortError'; throw error; }
}
export async function readRepositoryMarkdown(absolutePath: string, signal?: AbortSignal): Promise<RepositoryMarkdown> {
 checkCancelled(signal);
 if (!path.isAbsolute(absolutePath) || path.extname(absolutePath).toLowerCase() !== '.md') throw new Error('请选择准确的绝对 Markdown 文件路径');
 const initial = await stat(absolutePath); checkCancelled(signal);
 if (!initial.isFile()) throw new Error('目标不是普通文件');
 if (initial.size > MAX_REPOSITORY_MARKDOWN_BYTES) throw new Error('Markdown 超过 2 MiB，只读视图无法显示');
 const handle = await open(absolutePath, 'r');
 try {
  const current = await handle.stat(); checkCancelled(signal);
  if (!current.isFile() || current.size > MAX_REPOSITORY_MARKDOWN_BYTES) throw new Error('目标不是可读取的有界 Markdown 文件');
  const bytes = Buffer.alloc(MAX_REPOSITORY_MARKDOWN_BYTES + 1); let length = 0;
  while (length < bytes.length) {
   checkCancelled(signal);
   const result = await handle.read(bytes, length, bytes.length - length, length);
   if (!result.bytesRead) break; length += result.bytesRead;
  }
  checkCancelled(signal);
  if (length > MAX_REPOSITORY_MARKDOWN_BYTES) throw new Error('Markdown 超过 2 MiB，只读视图无法显示');
  let markdown: string;
  try { markdown = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes.subarray(0, length)); }
  catch { throw new Error('文件不是有效的 UTF-8 Markdown'); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(markdown)) throw new Error('文件包含二进制内容');
  return {absolutePath, markdown};
 } finally { await handle.close(); }
}

/** Pure CommonMark output with no resource elements, navigation or Obsidian postprocessors. */
export function renderRepositoryMarkdown(markdown: string): string {
 const renderer = new MarkdownIt({html:false,linkify:false,typographer:false});
 renderer.renderer.rules.link_open = () => '<span class="flowdesk-repository-reference">';
 renderer.renderer.rules.link_close = () => '</span>';
 renderer.renderer.rules.image = (tokens,index) => {
  const token = tokens[index];
  return `<span class="flowdesk-repository-image-placeholder">${renderer.utils.escapeHtml(token.content)}（图片未加载：${renderer.utils.escapeHtml(String(token.attrGet('src') ?? ''))}）</span>`;
 };
 return renderer.render(markdown);
}
