import assert from 'node:assert/strict';
import { test } from 'node:test';
import MarkdownIt from 'markdown-it';
import { findProgressSection, renderProgressTimeline } from '../progress.mjs';

const markdown = new MarkdownIt({ html: false });
const progress = [
  '## Progress',
  '',
  '> [!faq]- 详细过程日志',
  '>',
  '> - [x] `2026-11-24 11:00` <!-- flowdesk.progress-time/1 2026-11-24T03:00:24Z --> 第一条',
  '>   继续说明',
  '> - [x] `2026-11-24 11:02` 第二条',
  '> - [x] `2026-11-24 11:03` 第三条',
  '> - [x] `2026-11-24 11:04` 第四条 <script>alert(1)</script>',
  '>',
  '>   ```md',
  '>   ## Progress',
  '>   ```',
  '',
  '## Next',
  '重新读取原文。',
].join('\n');

test('FlowDesk Progress retains complete entries and keeps nearby sections outside the timeline', () => {
  const tokens = markdown.parse(progress, {});
  const matched = findProgressSection(progress, tokens);
  assert.equal(matched.events.length, 4);
  assert.equal(matched.events[0].timestamp, '2026-11-24T03:00:24Z');
  assert.match(matched.events[0].text, /继续说明/);
  assert.equal(tokens[matched.endToken + 1].content, 'Next');
  const html = renderProgressTimeline(matched.events, text => markdown.render(text));
  assert.match(html, /data-progress-count="4"/);
  assert.match(html, /历史进展（1 条）/);
  assert.ok(html.indexOf('第四条') < html.indexOf('第一条'));
  assert.match(html, /## Progress/);
  assert.doesNotMatch(html, /<script>|重新读取原文/);
});

test('Ambiguous or invalid Progress returns to ordinary Markdown', () => {
  const invalid = progress.replace('11:00`', '11:01`');
  assert.equal(findProgressSection(invalid, markdown.parse(invalid, {})), null);
  const repeated = progress + '\n\n' + progress;
  assert.equal(findProgressSection(repeated, markdown.parse(repeated, {})), null);
});
