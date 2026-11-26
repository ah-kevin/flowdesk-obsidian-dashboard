const calloutTones = new Map([
  ...['note', 'abstract', 'summary', 'tldr', 'info', 'todo', 'question', 'help', 'faq'].map(kind => [kind, 'info']),
  ...['tip', 'hint', 'important', 'success', 'check', 'done'].map(kind => [kind, 'success']),
  ...['warning', 'caution', 'attention'].map(kind => [kind, 'warning']),
  ...['failure', 'fail', 'missing', 'danger', 'error', 'bug'].map(kind => [kind, 'danger']),
]);
const taskMarkers = new Map([
  [' ', { state: 'open', label: '未完成', checked: false }],
  ['x', { state: 'completed', label: '已完成', checked: true }],
  ['!', { state: 'blocked', label: '高优先级或阻塞', symbol: '!' }],
  ['?', { state: 'question', label: '待确认', symbol: '?' }],
  ['R', { state: 'review', label: '待审查', symbol: 'R' }],
]);
const internalComment = /^<!--[ \t]+flowdesk\.(?:(?:progress-time|task-update)\/\d+[ \t]+\S[^\r\n]*|visual-doc:[a-zA-Z][a-zA-Z0-9_-]*:(?:start|end))[ \t]+-->$/u;

function parseInline(state, token, content) {
  token.content = content;
  token.children = [];
  state.md.inline.parse(content, state.md, state.env, token.children);
}

function titleText(state, content) {
  if (!content) return '';
  const tokens = [];
  state.md.inline.parse(content, state.md, state.env, tokens);
  return tokens.map(token => token.content).join('').trim();
}

function convertCallouts(state) {
  const { tokens } = state;
  const quotes = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'blockquote_close') {
      const callout = quotes.pop();
      if (callout) {
        token.type = 'flowdesk_callout_close';
        token.meta = callout;
      }
      continue;
    }
    if (token.type !== 'blockquote_open') continue;

    quotes.push(null);
    const paragraph = tokens[index + 1];
    const inline = tokens[index + 2];
    const end = tokens[index + 3];
    if (paragraph?.type !== 'paragraph_open' || inline?.type !== 'inline' || end?.type !== 'paragraph_close') continue;
    const [first, ...bodyLines] = inline.content.split('\n');
    const match = /^\[!([a-z][a-z0-9_-]*)\]([+-]?)(?:[ \t]+(.*))?$/iu.exec(first.trimEnd());
    if (!match) continue;

    const kind = match[1].toLowerCase();
    const callout = {
      kind, tone: calloutTones.get(kind) ?? 'neutral', fold: match[2], title: titleText(state, match[3]) || match[1],
    };
    quotes[quotes.length - 1] = callout;
    token.type = 'flowdesk_callout_open';
    token.meta = callout;
    if (bodyLines.length) parseInline(state, inline, bodyLines.join('\n'));
    else tokens.splice(index + 1, 3);
  }
}

function convertTaskListItems(state) {
  for (const [index, token] of state.tokens.entries()) {
    if (token.type !== 'list_item_open') continue;
    const paragraph = state.tokens[index + 1];
    const inline = state.tokens[index + 2];
    if (paragraph?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;

    const match = /^\[([ xX!?R])\](?:[ \t]+|(?=\n|$))/u.exec(inline.content);
    if (!match) continue;
    const marker = taskMarkers.get(match[1] === 'X' ? 'x' : match[1]);
    token.attrJoin('class', 'md-task-item');
    parseInline(state, inline, inline.content.slice(match[0].length));
    const checkbox = new state.Token('flowdesk_task_marker', '', 0);
    checkbox.meta = marker;
    inline.children.unshift(checkbox);
  }
}

function removeEmptyAnnotationParagraphs({ tokens }) {
  for (let index = 0; index < tokens.length - 2; index++) {
    const [paragraph, inline, close] = [tokens[index], tokens[index + 1], tokens[index + 2]];
    if (paragraph.type !== 'paragraph_open' || inline.type !== 'inline' || close.type !== 'paragraph_close') continue;
    const annotation = child => child.type === 'flowdesk_internal_comment';
    if (!inline.children.some(annotation)) continue;
    if (inline.children.every(child => annotation(child) || child.type === 'softbreak'
      || child.type === 'hardbreak' || (child.type === 'text' && !child.content.trim()))) {
      paragraph.hidden = true;
      close.hidden = true;
      inline.children = [];
    }
  }
}

export function configureFlowDeskMarkdown(md) {
  md.set({ html: false });
  const escape = md.utils.escapeHtml;
  md.inline.ruler.before('html_inline', 'flowdesk_internal_comment', (state, silent) => {
    const start = state.pos;
    if (!state.src.startsWith('<!--', start)) return false;
    const end = state.src.indexOf('-->', start + 4);
    if (end === -1 || end + 3 > state.posMax || !internalComment.test(state.src.slice(start, end + 3))) return false;
    if (!silent) state.push('flowdesk_internal_comment', '', 0);
    state.pos = end + 3;
    return true;
  });

  md.core.ruler.after('inline', 'flowdesk_reading_markup', state => {
    convertCallouts(state);
    convertTaskListItems(state);
    removeEmptyAnnotationParagraphs(state);
  });
  md.renderer.rules.flowdesk_internal_comment = () => '';
  md.renderer.rules.flowdesk_callout_open = (tokens, index) => {
    const { kind, tone, fold, title } = tokens[index].meta;
    const attrs = `class="md-callout" data-kind="${escape(kind)}" data-tone="${tone}"`;
    const heading = escape(title);
    return fold
      ? `<details ${attrs}${fold === '+' ? ' open' : ''}><summary class="md-callout-title">${heading}</summary>\n<div class="md-callout-body">\n`
      : `<aside ${attrs}><div class="md-callout-title">${heading}</div>\n<div class="md-callout-body">\n`;
  };
  md.renderer.rules.flowdesk_callout_close = (tokens, index) =>
    tokens[index].meta.fold ? '</div>\n</details>\n' : '</div>\n</aside>\n';
  md.renderer.rules.flowdesk_task_marker = (tokens, index) => {
    const { state, label, checked, symbol } = tokens[index].meta;
    const attrs = `class="md-task-marker" data-state="${state}" aria-label="${label}"`;
    return symbol
      ? `<span ${attrs} role="img">${symbol}</span> `
      : `<input ${attrs} type="checkbox" disabled${checked ? ' checked' : ''}> `;
  };
  return md;
}
