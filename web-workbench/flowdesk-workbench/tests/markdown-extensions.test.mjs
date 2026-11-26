import assert from 'node:assert/strict';
import { test } from 'node:test';
import MarkdownIt from 'markdown-it';
import { configureFlowDeskMarkdown } from '../markdown-extensions.mjs';

test('callouts preserve nested content, safe titles, and native fold defaults', () => {
  const md = configureFlowDeskMarkdown(new MarkdownIt({ html: true }));
  const source = [
    '> [!info] Last Status <img src=x onerror=alert(1)>',
    '> 项目进度与 **要点**。',
    '>',
    '> > [!warning]- 需要确认',
    '> > 内层',
    '> >',
    '> > > 普通引用',
    '',
    '> [!tip]+ **展开标题**',
    '> 展开后可见。',
    '',
    '> [!custom]',
  ].join('\n');

  const html = md.render(source);
  assert.match(html, /<aside class="md-callout" data-kind="info" data-tone="info">/);
  assert.match(html, /Last Status &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /<strong>要点<\/strong>/);
  assert.match(html, /<details class="md-callout" data-kind="warning" data-tone="warning"><summary/);
  assert.match(html, /<blockquote>\s*<p>普通引用<\/p>\s*<\/blockquote>/);
  assert.match(html, /<details class="md-callout" data-kind="tip" data-tone="success" open><summary class="md-callout-title">展开标题<\/summary>/);
  assert.match(html, /<aside class="md-callout" data-kind="custom" data-tone="neutral"><div class="md-callout-title">custom<\/div>/);
  assert.equal((html.match(/<details\b/g) || []).length, (html.match(/<\/details>/g) || []).length);
  assert.equal((html.match(/<aside\b/g) || []).length, (html.match(/<\/aside>/g) || []).length);
});

test('read-only task markers are limited to leading markers of list items', () => {
  const md = configureFlowDeskMarkdown(new MarkdownIt());
  const html = md.render([
    '- [ ] 未完成',
    '  - [X] 子项完成',
    '- [!] 高优先级',
    '- [?] 待确认',
    '- [R] 待审查',
    '- [f] 其他标记',
    '- 常规 [x] 文本',
    '- [x](safe.md)',
    '',
    '[x] 段落文字',
  ].join('\n'));

  assert.equal((html.match(/class="md-task-item"/g) || []).length, 5);
  assert.match(html, /<input class="md-task-marker" data-state="open" aria-label="未完成" type="checkbox" disabled>/);
  assert.match(html, /<input class="md-task-marker" data-state="completed" aria-label="已完成" type="checkbox" disabled checked>/);
  for (const status of ['blocked', 'question', 'review']) {
    assert.match(html, new RegExp('<span class="md-task-marker" data-state="' + status + '"'));
  }
  assert.match(html, /\[f\] 其他标记/);
  assert.match(html, /常规 \[x\] 文本/);
  assert.match(html, /<a href="safe\.md">x<\/a>/);
  assert.match(html, /<p>\[x\] 段落文字<\/p>/);
});

test('FlowDesk annotations disappear from reading output and remain literal in code', () => {
  const md = configureFlowDeskMarkdown(new MarkdownIt());
  const progress = '<!-- flowdesk.progress-time/1 abc -->';
  const update = '<!-- flowdesk.task-update/1 {"revision":"sample"} -->';
  const start = '<!-- flowdesk.visual-doc:diagram:start -->';
  const end = '<!-- flowdesk.visual-doc:diagram:end -->';
  const html = md.render([
    '### 日志 ' + progress,
    '',
    update,
    '',
    start + '图集入口' + end,
    '',
    '> [!info] 可读标题 ' + progress,
    '> 内文仍保留。',
    '',
    '<!-- other public sample -->',
    '',
    '行内示例：`' + update + '`',
    '',
    '```md',
    progress,
    start,
    '```',
    '',
    '    ' + end,
  ].join('\n'));

  assert.match(html, /<h3>日志 <\/h3>/);
  assert.match(html, /<p>图集入口<\/p>/);
  assert.match(html, /class="md-callout-title">可读标题<\/div>/);
  assert.match(html, /内文仍保留。/);
  assert.match(html, /&lt;!-- other public sample --&gt;/);
  assert.match(html, /<code>&lt;!-- flowdesk\.task-update\/1/);
  assert.match(html, /<pre><code class="language-md">&lt;!-- flowdesk\.progress-time\/1/);
  assert.match(html, /<pre><code>&lt;!-- flowdesk\.visual-doc:diagram:end/);
  assert.equal((html.match(/flowdesk\.progress-time/g) || []).length, 1);
  assert.equal((html.match(/flowdesk\.task-update/g) || []).length, 1);
  assert.equal((html.match(/flowdesk\.visual-doc/g) || []).length, 2);
  assert.doesNotMatch(html, /<p>[\s]*<\/p>/);
});

test('the Markdown host owns links, wiki references, and images inside transformed blocks', () => {
  const md = new MarkdownIt();
  const linkOpen = () => '<a href="/already-scoped">';
  const linkClose = () => '</a>';
  const image = () => '<span>图片占位</span>';
  md.renderer.rules.link_open = linkOpen;
  md.renderer.rules.link_close = linkClose;
  md.renderer.rules.image = image;
  md.inline.ruler.before('link', 'sample_wikilink', (state, silent) => {
    if (!state.src.startsWith('[[文档]]', state.pos)) return false;
    if (!silent) state.push('sample_wikilink', '', 0);
    state.pos += '[[文档]]'.length;
    return true;
  });
  md.renderer.rules.sample_wikilink = () => '<span>内部文档</span>';

  assert.equal(configureFlowDeskMarkdown(md), md);
  assert.equal(md.renderer.rules.link_open, linkOpen);
  assert.equal(md.renderer.rules.link_close, linkClose);
  assert.equal(md.renderer.rules.image, image);
  const html = md.render('> [!info] 资料\n> [链接](example.md) [[文档]] ![附图](diagram.png)\n\n- [x] [任务](task.md)');
  assert.equal((html.match(/href="\/already-scoped"/g) || []).length, 2);
  assert.match(html, /内部文档/);
  assert.match(html, /图片占位/);
  assert.doesNotMatch(html, /href="(?:example|task)|src="diagram/);
});
