// Adapted from the FlowDesk Dashboard progress-history and progress-time models.
const callout = '> [!faq]- 详细过程日志';
const beijing = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function beijingProgressTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, seconds, offset] = match;
  const calendar = Date.parse(seconds + 'Z');
  if (!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0, 19) !== seconds
    || (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))) return null;
  const instant = Date.parse(seconds + offset);
  return Number.isFinite(instant)
    ? new Date(instant + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ')
    : null;
}

function readProgressTime(display, content) {
  if (!content.startsWith('<!-- flowdesk.progress-time/')) return { timestamp: display, content };
  const match = /^<!-- flowdesk\.progress-time\/1 ([^ ]+) -->(?: (.*))?$/.exec(content);
  if (!match || beijingProgressTime(match[1]) !== display) return null;
  return { timestamp: match[1], content: match[2] ?? '' };
}

function parseQuotedProgress(lines, sourceOffset) {
  const start = lines.findIndex(line => line.trim());
  if (lines[start] !== callout) return null;

  const events = [];
  let fence = null;
  let receipts = false;
  function scan(line) {
    const visible = line.replace(/^(?:进展|完成|下一步)：/, '');
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(visible);
    if (!match) return;
    const [, marker, trailing] = match;
    if (!fence) fence = { char: marker[0], length: marker.length };
    else if (marker[0] === fence.char && marker.length >= fence.length && !trailing.trim()) fence = null;
  }

  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^<!-- flowdesk\.task-update\/.* -->$/.test(line)) {
      if (fence) return null;
      receipts = true;
      continue;
    }
    if (receipts) {
      if (line.trim()) return null;
      continue;
    }

    const event = /^> - \[[xX ]\] (.*)$/.exec(line);
    if (event) {
      if (fence) return null;
      const dated = /^`([^`]*)`(?: (.*))?$/.exec(event[1]);
      const parsed = dated ? readProgressTime(dated[1], dated[2] ?? '') : { timestamp: null, content: event[1] };
      if (!parsed) return null;
      events.push({ timestamp: parsed.timestamp, lines: [parsed.content], sourceLine: sourceOffset + index });
      scan(parsed.content);
      continue;
    }

    const previous = events.at(-1);
    if (!line.trim() || /^> *$/.test(line)) {
      previous?.lines.push('');
      continue;
    }
    if (!previous || !line.startsWith('>   ')) return null;
    const body = line.slice(4);
    previous.lines.push(body);
    scan(body);
  }

  if (fence || !events.length) return null;
  const result = events.map((event, sourceIndex) => ({
    timestamp: event.timestamp,
    text: event.lines.join('\n').trimEnd(),
    sourceIndex,
    sourceLine: event.sourceLine,
  }));
  return result.some(event => !event.text.trim()) ? null : result;
}

export function findProgressSection(source, tokens) {
  const topHeading = token => token.type === 'heading_open' && token.level === 0;
  const headings = tokens.flatMap((token, index) => topHeading(token) && token.tag === 'h2'
    && tokens[index + 1]?.type === 'inline' && tokens[index + 1].content.trim() === 'Progress' ? [index] : []);
  if (headings.length !== 1) return null;

  const [heading] = headings;
  const firstToken = heading + 3;
  const boundary = tokens.findIndex((token, index) => index >= firstToken
    && topHeading(token) && (token.tag === 'h1' || token.tag === 'h2'));
  const endToken = boundary === -1 ? tokens.length : boundary;
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const firstLine = tokens[heading].map?.[1];
  const endLine = boundary === -1 ? lines.length : tokens[boundary].map?.[0];
  if (!Number.isInteger(firstLine) || !Number.isInteger(endLine)
    || firstLine < 1 || endLine <= firstLine || endLine > lines.length) return null;

  const events = parseQuotedProgress(lines.slice(firstLine, endLine), firstLine);
  return events ? { firstToken, endToken, events } : null;
}

function formatDisplayTime(timestamp) {
  if (!timestamp) return '时间未记录';
  const legacy = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(timestamp);
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(timestamp);
  const match = legacy || iso;
  if (!match) return timestamp;

  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(part => Number(part ?? 0));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  const zone = iso?.[7];
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
    || hour > 23 || minute > 59 || second > 59
    || (zone && zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) return timestamp;

  const time = new Date(legacy ? timestamp.replace(' ', 'T') + ':00+08:00' : timestamp);
  if (!Number.isFinite(time.getTime())) return timestamp;
  const now = new Date();
  const today = beijing.format(now).slice(0, 10);
  const yesterday = beijing.format(new Date(now.getTime() - 86400000)).slice(0, 10);
  const rendered = beijing.format(time);
  const dateLabel = rendered.slice(0, 10);
  const dayLabel = dateLabel === today ? '今天' : dateLabel === yesterday ? '昨天' : dateLabel.replace(/-/g, '/');
  return dayLabel + ' ' + rendered.slice(-5);
}

const escapedCharacter = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => value.replace(/[&<>"']/g, char => escapedCharacter[char]);

function progressExcerpt(text) {
  const firstParagraph = text.trim().split(/\n\s*\n/u, 1)[0];
  const excerpt = firstParagraph.replace(/^(?:进展|完成)：/u, '').replace(/\s+/gu, ' ').trim();
  const chars = Array.from(excerpt);
  return chars.length > 100 ? chars.slice(0, 100).join('').trimEnd() + '…' : excerpt;
}

export function renderProgressTimeline(events, renderBody) {
  if (!events.length) return '';
  const latestFirst = [...events].reverse();
  function renderEntry(event, open = false) {
    const timestamp = escapeHtml(event.timestamp || '原文未提供日期');
    const date = escapeHtml(formatDisplayTime(event.timestamp));
    const excerpt = escapeHtml(progressExcerpt(event.text));
    return '<details class="progress-entry"' + (open ? ' open' : '') + '>'
      + '<summary class="progress-entry-heading"><time class="progress-date" title="' + timestamp + '">' + date + '</time>'
      + '<span class="progress-excerpt">' + excerpt + '</span></summary>'
      + '<div class="progress-entry-body">' + renderBody(event.text, event.sourceLine) + '</div></details>';
  }

  const recent = latestFirst.slice(0, 3).map((event, index) => renderEntry(event, index === 0)).join('');
  const older = latestFirst.slice(3);
  const archive = older.length
    ? '<details class="progress-archive"><summary>历史进展（' + older.length + ' 条）</summary>'
      + '<div class="progress-entries">' + older.map(event => renderEntry(event)).join('') + '</div></details>'
    : '';
  return '<div class="progress-timeline" data-progress-count="' + events.length + '">'
    + '<div class="progress-toolbar">共 ' + events.length + ' 条，最新追加在前</div>'
    + '<div class="progress-entries">' + recent + '</div>' + archive + '</div>';
}
