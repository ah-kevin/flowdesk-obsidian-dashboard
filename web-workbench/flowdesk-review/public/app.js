'use strict';

const app = document.getElementById('app');
const notice = document.getElementById('notice');
const dialog = document.getElementById('dialog');
const decisionNames = { approve: '通过', changes: '需修改', comment: '仅反馈' };
const itemNames = { comment: '批注', highlight: '高亮', suggestion: '建议改文' };
const textLimit = 20000;
const itemLimit = 250;
const route = location.pathname.match(/^\/r\/([^/]+)(?:\/doc\/([^/]+))?\/?$/);
const annotation = /^\/annotate\/?$/.test(location.pathname);
const params = new URLSearchParams(location.search);
const annotationPath = annotation ? params.get('document') : null;
const state = route || annotation ? {
  reviewId: route ? decodeURIComponent(route[1]) : null,
  requestedDocument: route?.[2] && decodeURIComponent(route[2]),
  documentId: null,
  submission: null,
  draft: null,
  mobilePane: 'content',
  directoryMode: 'documents',
  directoryQuery: '',
  feedbackScope: 'document',
  feedbackDrawerOpen: false,
  ...(annotation && { deliveries: new Map(), preferredThreadId: params.get('thread') }),
} : {
  detail: null,
  deliveries: new Map(),
};
let noticeTimeout;
let selectionToolbar;
let paragraphMenu;
let paragraphMenuTrigger;
let inlineEditor;

function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

function button(label, onClick, className = 'button', attrs = {}) {
  return element('button', { type: 'button', className, onClick, ...attrs }, label);
}

function message(content, type = 'info') {
  clearTimeout(noticeTimeout);
  notice.textContent = content;
  notice.dataset.type = type;
  notice.hidden = false;
  noticeTimeout = setTimeout(() => { notice.hidden = true; }, 3800);
}

function formatTime(value) {
  if (!value) return '—';
  const time = new Date(value);
  if (Number.isNaN(time.valueOf())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(time);
}

function id() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

async function request(path, body) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...(body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || '请求未完成（' + response.status + '）'), { code: data.code, status: response.status });
  }
  return data;
}

function showError(err) {
  message(err.message || '操作失败，请重试。', 'error');
}

function adminPath(reviewId = '') {
  return '/api/admin/reviews' + (reviewId ? '/' + encodeURIComponent(reviewId) : '');
}

function reviewPath() {
  return '/api/review/' + encodeURIComponent(state.reviewId);
}

const directReviewPath = '/api/admin/direct-reviews';

function readReview() {
  return annotation ? request(directReviewPath + '/open', { path: annotationPath }) : request(reviewPath());
}

function workbenchLink() {
  const fallback = '/#/';
  const from = annotation ? params.get('from') : null;
  let href = fallback;
  if (from) {
    try {
      const url = new URL(from, location.origin);
      if (url.origin === location.origin && url.pathname === '/' && url.hash.startsWith('#/')) href = '/' + url.hash;
    } catch {
      // A malformed return location uses the workbench home.
    }
  }
  return element('a', { href, className: 'button compact workbench-return' }, '返回工作台');
}

function shell(mode, action) {
  return element('header', { className: 'topbar' },
    element('div', { className: 'wordmark' },
      element('span', { className: 'logo', 'aria-hidden': 'true' }, element('span'), element('span'), element('span')),
      element('span', {}, 'FlowDesk')),
    element('span', { className: 'top-divider', 'aria-hidden': 'true' }),
    element('span', { className: 'top-mode' }, mode),
    action && element('div', { className: 'top-actions' }, action));
}

function initialView(mode, title, description) {
  app.replaceChildren(shell(mode, !route && workbenchLink()), element('main', { className: 'initial' },
    element('section', { className: 'panel initial-panel' }, element('h1', {}, title),
      description && element('p', { className: 'muted' }, description))));
}

function openDialog(title, content, description) {
  if (dialog.open) dialog.close();
  dialog.replaceChildren(
    element('div', { className: 'dialog-heading' },
      element('div', {}, element('h2', { id: 'dialog-title' }, title),
        description && element('p', { className: 'muted' }, description)),
      button('×', () => dialog.close(), 'icon-button', { 'aria-label': '关闭' })),
    content,
  );
  dialog.showModal();
}

function field(label, fieldNode, hint) {
  return element('label', { className: 'field' }, element('span', {}, label), fieldNode,
    hint && element('small', { className: 'muted' }, hint));
}

function empty(text) {
  return element('p', { className: 'empty' }, text);
}

function pill(text, className = '') {
  return element('span', { className: `pill ${className}` }, text);
}

function safeSummary(submission) {
  return decisionNames[submission.decision] || '已提交';
}

function receipt(submission, options = {}) {
  if (!submission) return null;
  const items = options.items ?? submission.items ?? [];
  return element('section', { className: 'receipt', id: options.anchor, tabindex: options.anchor ? '-1' : undefined },
    element('header', { className: 'receipt-heading' },
      element('div', {}, element('h3', {}, options.title || '已提交'),
        element('p', { className: 'meta' },
          [submission.reviewer, formatTime(submission.submittedAt)].filter(Boolean).join(' · '))),
      pill(options.label || safeSummary(submission), submission.decision === 'approve' ? 'positive' : submission.decision === 'changes' ? 'attention' : '')),
    submission.summary && element('p', { className: 'receipt-summary' }, submission.summary),
    options.versionStatus && element('p', { className: 'meta' }, options.versionStatus),
    items.length > 0 && element('details', { className: 'receipt-items' },
      element('summary', {}, `${items.length} 条反馈`),
      element('div', { className: 'feedback-stack' }, items.map((item) => feedbackCard(item, {
        documents: options.documents,
        jump: options.jump,
        snapshot: options.snapshot,
        reference: options.reference,
      })))),
    options.delivery,
  );
}

function suggestionParts(before, after, byLine = false) {
  if (before === after) {
    const unchanged = before ? [{ text: before }] : [];
    return [unchanged, unchanged];
  }
  const tokenize = text => byLine ? text.match(/[^\n]*\n|[^\n]+$/gu) || [] : Array.from(text);
  const oldTokens = tokenize(before);
  const newTokens = tokenize(after);
  const shorterLength = Math.min(oldTokens.length, newTokens.length);
  let prefix = 0;
  while (prefix < shorterLength && oldTokens[prefix] === newTokens[prefix]) prefix++;
  let suffix = 0;
  while (suffix < shorterLength - prefix &&
    oldTokens[oldTokens.length - suffix - 1] === newTokens[newTokens.length - suffix - 1]) suffix++;

  const oldMiddle = oldTokens.slice(prefix, oldTokens.length - suffix);
  const newMiddle = newTokens.slice(prefix, newTokens.length - suffix);
  const pieces = [[], []];
  const append = (side, text, changed = false) => {
    if (!text) return;
    const last = pieces[side].at(-1);
    if (last?.changed === changed) last.text += text;
    else pieces[side].push({ text, changed });
  };
  const shared = text => {
    append(0, text);
    append(1, text);
  };
  shared(oldTokens.slice(0, prefix).join(''));

  const width = newMiddle.length + 1;
  const cells = (oldMiddle.length + 1) * width;
  if (!oldMiddle.length || !newMiddle.length || cells > 50_000) {
    if (!byLine && oldMiddle.length && newMiddle.length) {
      const lineParts = suggestionParts(oldMiddle.join(''), newMiddle.join(''), true);
      lineParts.forEach((parts, side) => parts.forEach(part => append(side, part.text, part.changed)));
    } else {
      append(0, oldMiddle.join(''), true);
      append(1, newMiddle.join(''), true);
    }
  } else {
    // Bounded longest common subsequence preserves separate edits within the same passage.
    const matches = new Uint16Array(cells);
    for (let row = oldMiddle.length - 1; row >= 0; row--) {
      for (let column = newMiddle.length - 1; column >= 0; column--) {
        const index = row * width + column;
        matches[index] = oldMiddle[row] === newMiddle[column]
          ? matches[index + width + 1] + 1
          : Math.max(matches[index + width], matches[index + 1]);
      }
    }
    let row = 0;
    let column = 0;
    while (row < oldMiddle.length && column < newMiddle.length) {
      const index = row * width + column;
      if (oldMiddle[row] === newMiddle[column]) {
        shared(oldMiddle[row++]);
        column++;
      } else if (matches[index + width] >= matches[index + 1]) append(0, oldMiddle[row++], true);
      else append(1, newMiddle[column++], true);
    }
    append(0, oldMiddle.slice(row).join(''), true);
    append(1, newMiddle.slice(column).join(''), true);
  }
  shared(oldTokens.slice(oldTokens.length - suffix).join(''));
  return pieces;
}

function suggestionDiff(before, after) {
  const pieces = suggestionParts(before, after);
  return element('div', { className: 'suggestion-diff', role: 'group', 'aria-label': '改文前后对照' },
    [['−', '修改前', 'del'], ['+', '建议改为', 'ins']].map(([sign, label, tag], index) =>
      element('div', { className: 'suggestion-diff-side' },
        element('span', { className: 'suggestion-diff-sign', 'aria-hidden': 'true' }, sign),
        element('div', { className: 'suggestion-diff-body' },
          element('span', { className: 'suggestion-diff-label' }, label),
          element('p', { className: 'suggestion-diff-text' }, pieces[index].length
            ? pieces[index].map(part => part.changed ? element(tag, {}, part.text) : part.text)
            : element('span', { className: 'muted' }, '（空）'))))));
}

function suggestionOriginal(item, block, sourceFormat = item.sourceFormat) {
  if (item.sourceSha256 || item.source?.sha256) return item.quote ?? '';
  return (sourceFormat === 'markdown' ? block?.raw : block?.text) ?? item.quote ?? '';
}

function feedbackCard(item, options = {}) {
  const document = (options.documents || []).find((entry) => entry.id === item.documentId);
  const block = document?.blocks?.find((entry) => entry.id === item.blockId);
  const source = document?.title || item.documentTitle || '资料段落';
  const actions = [];
  if (options.edit) actions.push(button('编辑', options.edit, 'text-button'));
  if (options.remove) actions.push(button('删除', options.remove, 'text-button muted'));
  let sourceNode = element('span', { className: 'source-label' }, source);
  const anchor = currentFeedbackBlock(item, document);
  if (options.reference && item.source) {
    sourceNode = element('span', { className: 'feedback-source' }, sourceNode, options.reference(item, document));
  } else if (options.snapshot && block) {
    sourceNode = element('span', { className: 'feedback-source' }, sourceNode, options.snapshot(document, block));
  } else if (options.jump && anchor) {
    sourceNode = button(source, () => options.jump(item.documentId, anchor), 'text-button source-link');
  }
  return element('article', { className: 'feedback-card' },
    element('div', { className: 'feedback-heading' },
      element('span', { className: 'feedback-labels' },
        pill(itemNames[item.kind] || '反馈', item.kind === 'suggestion' ? 'attention' : ''),
        item.required && pill('必改', 'attention')),
      sourceNode),
    item.kind === 'suggestion'
      ? suggestionDiff(suggestionOriginal(item, block), item.replacement ?? '')
      : item.quote && element('blockquote', { className: 'quote' }, item.quote),
    item.comment && element('p', { className: 'feedback-comment' }, item.comment),
    !anchor && (item.source || item.sourceSha256) && element('p', { className: 'meta' }, '当前稿中的位置待核对。'),
    actions.length > 0 && element('div', { className: 'feedback-actions' }, actions),
  );
}

function currentFeedbackBlock(item, entry) {
  if (!entry) return null;
  if (item.currentAnchor) return item.currentAnchor.blockId || null;
  const version = item.sourceSha256 || item.source?.sha256;
  if (version && version !== entry.sha256) return null;
  return entry.blocks?.some(block => block.id === item.blockId) ? item.blockId : null;
}

function adminSnapshotHref(roundId, documentId, blockId) {
  const params = new URLSearchParams({ round: roundId, doc: documentId });
  if (blockId) params.set('block', blockId);
  return '/review/?' + params;
}

function followAdminSnapshot(event, documentId, blockId) {
  if (!plainLinkClick(event)) return;
  event.preventDefault();
  openAdminSnapshot(documentId, blockId);
}

function adminSnapshotLink(roundId, documentId, blockId, label, title) {
  return element('a', {
    className: 'text-button source-link', href: adminSnapshotHref(roundId, documentId, blockId),
    title, onClick: event => followAdminSnapshot(event, documentId, blockId),
  }, label);
}

function openAdminSnapshot(documentId, blockId) {
  const review = state.detail;
  const entry = review?.documents.find(document => document.id === documentId);
  const block = blockId && entry?.blocks.find(candidate => candidate.id === blockId);
  const live = review?.mode === 'live';
  if (!entry || (blockId && !block)) {
    message('找不到这份资料或指定段落。', 'error');
    return;
  }

  const assetPrefix = '/api/review/' + review.id + '/assets/';
  const assets = new Set(review.assets.map(asset => asset.id));
  const documents = new Set(review.documents.map(document => document.id));
  const original = element('article', { className: 'markdown snapshot-text', 'aria-label': live ? '当前正文' : '送审快照正文' });
  for (const snapshotBlock of block ? [block] : entry.blocks) {
    const content = element('div', { className: 'block-content' });
    content.innerHTML = snapshotBlock.html;
    decorateTaskList(content);
    for (const link of content.querySelectorAll('a[data-doc-id]')) {
      const target = link.dataset.docId;
      if (!documents.has(target)) continue;
      const section = new URL(link.href).searchParams.get('section');
      link.href = adminSnapshotHref(review.id, target, section);
      link.addEventListener('click', event => followAdminSnapshot(event, target, section));
    }
    for (const media of content.querySelectorAll('img[src], a[href]')) {
      const attribute = media.tagName === 'IMG' ? 'src' : 'href';
      const target = media.getAttribute(attribute);
      if (target.startsWith(assetPrefix) && assets.has(target.slice(assetPrefix.length))) {
        media.setAttribute(attribute, adminPath(review.id) + '/assets/' + target.slice(assetPrefix.length));
      }
    }
    original.append(content);
  }
  const line = block && Number.isInteger(block.lineStart)
    ? block.lineEnd > block.lineStart ? '第 ' + block.lineStart + '–' + block.lineEnd + ' 行' : '第 ' + block.lineStart + ' 行'
    : '';
  const details = block && typeof block.raw === 'string' && element('details', { className: 'snapshot-markdown' },
    element('summary', {}, '查看原段 Markdown'), element('pre', {}, block.raw));
  const description = (live ? ['当前正文', line] : ['送审时保存', formatTime(review.createdAt), line]).filter(Boolean).join(' · ');
  openDialog(entry.title, element('div', { className: 'snapshot-viewer' },
    element('div', { className: 'snapshot-location' },
      element('span', { className: 'meta' }, entry.path || ''),
      block && adminSnapshotLink(review.id, entry.id, null, live ? '查看整份文档' : '查看整份快照')),
    original, details), description);
}

function submissionVersionStatus(submission, documents) {
  const versions = submission.documentVersions || [];
  if (!versions.length) return '';
  if (versions.some(version => !documents.some(entry => entry.id === version.documentId && entry.sha256)))
    return '部分已评审正文暂不可读';
  return versions.some(version => documents.find(entry => entry.id === version.documentId).sha256 !== version.sha256)
    ? '当前稿已更新，结论对应提交时阅读的版本' : '已评审版本与当前正文一致';
}

function liveReference(review, item, entry) {
  return button('查看评审原句', () => {
    const current = currentFeedbackBlock(item, entry);
    openDialog(entry?.title || '评审原句', element('div', { className: 'snapshot-viewer' },
      element('p', { className: 'meta' }, '批注创建时的引用'),
      element('p', { className: 'feedback-context' }, item.source.prefix, element('mark', {}, item.quote), item.source.suffix),
      current && adminSnapshotLink(review.id, item.documentId, current, '查看当前段落'),
      !current && element('p', { className: 'meta' }, '当前正文中还需要核对此引用的位置。')));
  }, 'text-button source-link');
}

const deliveryLabels = {
  queued: '已送入 Codex 队列', delivered: '已送达', pending: '发送状态待确认',
  unknown: '发送状态待确认', not_sent: '尚未送出', conflict: '发送记录需要核对',
};

function dispatchControls(review, submission, { openPicker = false, label = '发送到 Codex' } = {}) {
  const key = review.id + ':' + submission.id;
  const path = adminPath(review.id) + '/submissions/' + encodeURIComponent(submission.id) + '/dispatch';
  const status = element('span', { className: 'meta', role: 'status' });
  const action = button(label, chooseTarget, 'button compact');
  const resume = annotation && button('继续编辑批注', () => resumeAnnotation(submission), 'text-button', { hidden: true });

  async function chooseTarget() {
    const delivery = state.deliveries.get(key);
    if (['pending', 'unknown'].includes(delivery?.status)) {
      await readDelivery();
      return;
    }
    if (['not_sent', 'conflict'].includes(delivery?.status)) {
      configureDispatch([]);
      return;
    }
    action.disabled = true;
    try {
      const { clients } = await request('/api/admin/review-targets');
      if (action.isConnected) configureDispatch(clients || []);
    } catch (error) {
      if (action.isConnected) configureDispatch([], error.message);
    } finally {
      action.disabled = false;
    }
  }

  function drawDelivery(delivery) {
    if (delivery) state.deliveries.set(key, delivery);
    status.textContent = deliveryLabels[delivery?.status] || '';
    action.textContent = ['pending', 'unknown'].includes(delivery?.status) ? '查询发送状态'
      : ['not_sent', 'conflict'].includes(delivery?.status) ? '查看发送结果' : label;
    action.hidden = ['queued', 'delivered'].includes(delivery?.status);
    if (resume) resume.hidden = !['unsent', 'not_sent'].includes(delivery?.status);
    if (annotation && action.hidden) queueMicrotask(() => finishAnnotation(submission));
  }

  async function readDelivery() {
    action.disabled = true;
    try {
      const { dispatch } = await request(path);
      drawDelivery(dispatch);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      action.disabled = false;
    }
  }

  function configureDispatch(clients, discoveryError) {
    const identity = element('code', { className: 'dispatch-session-id' });
    const previous = state.deliveries.get(key);
    const finished = ['not_sent', 'conflict'].includes(previous?.status);
    const preferredClients = clients.filter(entry => entry.sessions.some(item => item.id === state.preferredThreadId));
    const preferred = preferredClients.length === 1 ? preferredClients[0] : null;
    const client = window.FlowDeskChoiceMenu.create({
      id: 'review-dispatch-client', label: '客户端', options: clients.map(entry => ({ value: entry.id, label: entry.label })),
      value: preferred?.id || clients[0]?.id || '', onSelect: updateSessions,
    });
    const session = window.FlowDeskChoiceMenu.create({
      id: 'review-dispatch-session', label: 'Codex 会话', options: [], value: '',
      placeholder: '请选择接收会话', search: '搜索会话标题或 ID', onSelect: updateSession,
    });
    const prompt = element('textarea', { rows: 4, readonly: true });
    prompt.value = '请用 read_reviewable_document 读取 FlowDesk 评审回执，核对当前稿与反馈引用。\n轮次 ' + review.id + '\n回执 ' + submission.id +
      '\n' + (review.documents || []).map(entry => entry.path).filter(Boolean).join('\n');
    const error = element('p', { className: 'inline-error', role: 'alert', hidden: true });
    if (finished || discoveryError) {
      error.textContent = discoveryError || deliveryLabels[previous.status];
      error.hidden = false;
    }
    const copy = button('复制回执引用', async () => {
      try {
        await navigator.clipboard.writeText(prompt.value);
        message('已复制回执引用。');
      } catch {
        prompt.select();
      }
    });
    const submit = button('确认发送', sendSelected, 'button primary', { disabled: true });
    const content = element('div', { className: 'dialog-form' },
      clients.length > 0 && element('div', { className: 'dispatch-target-picker' },
        element('div', { className: 'field' }, element('span', {}, '客户端'), client.element),
        element('div', { className: 'field' }, element('span', {}, 'Codex 会话'), session.element),
        element('div', { className: 'dispatch-target-identity meta', role: 'status' }, '会话 ID ', identity)),
      !clients.length && !finished && !discoveryError && empty('FlowDesk 暂未找到可选的本机 Codex 会话。'),
      finished && previous.targetThreadId && element('p', { className: 'meta' }, '会话 ID ', element('code', {}, previous.targetThreadId)),
      field('回执引用', prompt), error,
      element('div', { className: 'dialog-actions' }, button('关闭', () => dialog.close()), copy, submit));
    function updateSession() {
      identity.textContent = session.value || '待选择';
      submit.disabled = finished || !client.value || !session.value;
    }
    function updateSessions() {
      const entries = clients.find(entry => entry.id === client.value)?.sessions || [];
      const preferredSession = client.value === preferred?.id ? entries.find(entry => entry.id === state.preferredThreadId) : null;
      session.setOptions(entries.map(entry => ({
        value: entry.id, label: (entry === preferredSession ? '当前会话 · ' : '') + (entry.title || entry.id),
        detail: entry.title ? entry.id : undefined,
      })), preferredSession?.id || '');
      session.setDisabled(!entries.length);
      updateSession();
    }
    updateSessions();
    async function sendSelected() {
      if (submit.disabled) return;
      submit.disabled = true;
      client.setDisabled(true);
      session.setDisabled(true);
      error.hidden = true;
      try {
        const { dispatch } = await request(path, { targetClientId: client.value, targetThreadId: session.value });
        drawDelivery(dispatch);
        if (dispatch?.status === 'not_sent' || dispatch?.status === 'conflict') {
          error.textContent = dispatch.reason || dispatch.error || deliveryLabels[dispatch.status];
          error.hidden = false;
        } else {
          dialog.close();
          if (deliveryLabels[dispatch?.status]) message(deliveryLabels[dispatch.status]);
        }
      } catch (failure) {
        error.textContent = failure.message;
        error.hidden = false;
      } finally {
        client.setDisabled(false);
        session.setDisabled(false);
        const result = state.deliveries.get(key);
        if (['not_sent', 'conflict'].includes(result?.status)) submit.disabled = true;
        else updateSession();
      }
    }
    openDialog(annotation ? '发送本次批注' : '发送评审回执', content, '确认后通过 FlowDesk MCP 发送到所选 Codex 会话。');
  }

  if (state.deliveries.has(key)) drawDelivery(state.deliveries.get(key));
  if (openPicker) {
    requestAnimationFrame(async () => {
      if (!state.deliveries.has(key)) await readDelivery();
      if (action.isConnected && !action.hidden && action.textContent === label) await chooseTarget();
    });
  } else if (!state.deliveries.has(key)) {
    void readDelivery();
  }
  return element('div', { className: 'receipt-delivery' }, action, resume, status);
}

function emptyDraft() {
  return { id: id(), decision: null, summary: '', items: [], documentVersions: [] };
}

function pendingSubmissionKey() {
  return 'flowdesk-annotation-pending:' + state.reviewId;
}

function rememberPendingSubmission(submissionId) {
  try {
    if (submissionId) sessionStorage.setItem(pendingSubmissionKey(), submissionId);
    else sessionStorage.removeItem(pendingSubmissionKey());
  } catch {
    // The existing draft remains available if session storage is disabled.
  }
}

function pendingSubmissionId() {
  try { return sessionStorage.getItem(pendingSubmissionKey()); } catch { return null; }
}

async function readPendingSubmission(submissionId) {
  if (!submissionId) return null;
  try {
    const { review } = await request(adminPath(state.reviewId));
    return review.submissions.find(entry => entry.id === submissionId) ?? null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

function finishAnnotation(submission) {
  if (state.submission?.id !== submission.id) return;
  const scrollPosition = window.scrollY;
  rememberPendingSubmission(null);
  clearSubmittedDraft(submission);
  state.submission = null;
  if (!state.draft || state.draft.id === submission.id) state.draft = emptyDraft();
  renderReview();
  window.scrollTo(0, scrollPosition);
}

function resumeAnnotation(submission) {
  if (state.submission?.id !== submission.id) return;
  const scrollPosition = window.scrollY;
  rememberPendingSubmission(null);
  state.submission = null;
  if (state.draft?.id === submission.id) state.draft.id = id();
  else if (!state.draft?.items.length) state.draft = {
    ...emptyDraft(), summary: submission.summary,
    documentVersions: submission.documentVersions, items: submission.items,
  };
  saveDraft();
  renderReview();
  window.scrollTo(0, scrollPosition);
}

function canEditFeedback() {
  return state.draft && !state.review?.closedAt && (!annotation || !state.submission);
}

function draftHasContent() {
  return state.draft && Boolean(state.draft.decision || state.draft.summary || state.draft.items.length);
}

const submissionConflictMessage = '另一个标签页已用这份草稿提交了不同内容。当前草稿仍保留，可以作为新一份评审提交。';

function submissionContent(draft, compare = false) {
  const documentVersions = Array.isArray(draft.documentVersions) ? draft.documentVersions
    .map(({ documentId, sha256 }) => ({ documentId, sha256 }))
    .toSorted((a, b) => a.documentId.localeCompare(b.documentId)) : [];
  return {
    decision: draft.decision,
    summary: draft.summary.trim(),
    ...(documentVersions.length ? { documentVersions } : {}),
    items: draft.items.map(({ id, documentId, blockId, kind, quote, comment, replacement, offset, required, sourceFormat, sourceSha256, source, prefix, suffix }) => ({
      id, documentId, blockId, kind, quote: quote ?? '', comment: comment ?? '',
      replacement: replacement ?? '', offset, required: Boolean(required), sourceFormat,
      sourceSha256: sourceSha256 || source?.sha256,
      ...(!compare && (sourceSha256 || source?.sha256) ? { prefix: prefix ?? source?.prefix, suffix: suffix ?? source?.suffix } : {}),
    })),
  };
}

function sameSubmissionContent(left, right) {
  return JSON.stringify(submissionContent(left, true)) === JSON.stringify(submissionContent(right, true));
}

function clearSubmittedDraft(submission) {
  if (!state.draftKey) return;
  try {
    const stored = JSON.parse(localStorage.getItem(state.draftKey) || 'null');
    if (stored?.id === submission.id && sameSubmissionContent(stored, submission)) {
      localStorage.removeItem(state.draftKey);
    }
  } catch {
    // Keep unreadable or concurrently changed drafts intact.
  }
}

function restoreDraft() {
  if (!state.draftKey) return null;
  try {
    const draft = JSON.parse(localStorage.getItem(state.draftKey) || 'null');
    if (typeof draft?.id !== 'string' || typeof draft.summary !== 'string' || !Array.isArray(draft.items)) return null;
    if (!annotation && draft.id === state.submission?.id && sameSubmissionContent(draft, state.submission)) {
      clearSubmittedDraft(state.submission);
      return null;
    }
    state.submissionConflict = !annotation && draft.id === state.submission?.id;
    const documents = state.review.documents || [];
    const live = state.review.mode === 'live';
    return {
      id: draft.id,
      decision: Object.hasOwn(decisionNames, draft.decision) ? draft.decision : null,
      summary: draft.summary,
      documentVersions: Array.isArray(draft.documentVersions) ? draft.documentVersions : [],
      items: draft.items.filter((item) => Object.hasOwn(itemNames, item?.kind) &&
        (!live || annotation || item.kind !== 'suggestion') &&
        documents.some((entry) => entry.id === item.documentId &&
          (live || entry.blocks?.some((block) => block.id === item.blockId)))),
    };
  } catch {
    return null;
  }
}

function saveDraft() {
  const draft = state.draft;
  if (!state.draftKey || !draft) return;
  try {
    if (draftHasContent() || (!annotation && state.submission)) {
      localStorage.setItem(state.draftKey, JSON.stringify(draft));
    } else if (JSON.parse(localStorage.getItem(state.draftKey) || 'null')?.id === draft.id) {
      localStorage.removeItem(state.draftKey);
    }
  } catch {
    if (!state.storageError) message(annotation ? '浏览器无法保留批注草稿。' : '浏览器无法保存草稿，刷新前请先提交评审。', 'error');
    state.storageError = true;
  }
}

function currentDocument() {
  return state.review.documents.find((entry) => entry.id === state.documentId);
}

function recordViewedVersion(entry) {
  const draft = state.draft;
  if (state.review.mode !== 'live' || !canEditFeedback() || !entry?.sha256) return;
  const earlier = draft.documentVersions.find(version => version.documentId === entry.id);
  if (earlier?.sha256 === entry.sha256) return;
  draft.documentVersions = [...draft.documentVersions.filter(version => version.documentId !== entry.id),
    { documentId: entry.id, sha256: entry.sha256 }];
  if (draftHasContent()) saveDraft();
}

function feedbackSource(text, quote, offset) {
  if (state.review.mode !== 'live') return {};
  return {
    sourceSha256: currentDocument()?.sha256,
    prefix: text.slice(Math.max(0, offset - 64), offset),
    suffix: text.slice(offset + quote.length, offset + quote.length + 64),
  };
}

async function refreshLiveReview(control) {
  if (control.disabled || state.submitting) return;
  control.disabled = true;
  const currentScroll = window.scrollY;
  const oldVersion = currentDocument()?.sha256;
  try {
    const { review, submission } = await readReview();
    state.review = review;
    if (!annotation) state.submission = submission || state.submission;
    else if (state.submission) {
      const pendingId = state.submission.id;
      const pending = await readPendingSubmission(pendingId);
      if (pending && state.submission?.id === pendingId) state.submission = pending;
    }
    renderReview();
    window.scrollTo(0, currentScroll);
    message(oldVersion !== currentDocument()?.sha256 ? '已读取正文新版，已有批注和草稿已保留。' : '当前已是最新正文。');
  } catch (error) {
    showError(error);
  } finally {
    control.disabled = false;
  }
}

function reviewHref(documentId, sectionId) {
  if (annotation) {
    const query = new URLSearchParams(params);
    if (sectionId) query.set('section', sectionId);
    else query.delete('section');
    return '/annotate/?' + query;
  }
  const base = '/r/' + encodeURIComponent(state.reviewId);
  if (!documentId) return base;
  const documentPath = base + '/doc/' + encodeURIComponent(documentId);
  return sectionId ? documentPath + '?section=' + encodeURIComponent(sectionId) : documentPath;
}

function restoreReadingLocation(readingPosition) {
  if (Number.isFinite(readingPosition)) {
    window.scrollTo(0, readingPosition);
    return;
  }
  const section = new URLSearchParams(location.search).get('section');
  if (!section || !jumpToReviewBlock(section, 'start')) window.scrollTo(0, 0);
}

function saveReadingPosition() {
  const readingPosition = state.mobilePane === 'content' ? window.scrollY : history.state?.readingPosition || 0;
  history.replaceState({ ...history.state, readingPosition }, '');
}

function setMobilePane(pane) {
  if (pane === state.mobilePane) return;
  if (state.mobilePane === 'content') saveReadingPosition();
  state.mobilePane = pane;
  updateMobilePane();
  window.scrollTo(0, pane === 'content' ? history.state?.readingPosition || 0 : 0);
  updateCurrentChapter();
}

function jumpToReviewBlock(blockId, position = 'center') {
  const block = document.getElementById(blockId);
  if (!block?.classList.contains('review-block')) return false;
  block.scrollIntoView({ block: position });
  block.focus({ preventScroll: true });
  block.classList.remove('targeted');
  requestAnimationFrame(() => block.classList.add('targeted'));
  return true;
}

function selectReviewDocument(documentId, blockId, position = 'center') {
  const entry = state.review.documents.find((document) => document.id === documentId);
  if (!entry) return;
  const sectionId = position === 'start' && entry.blocks?.some(block => block.id === blockId) ? blockId : null;
  if (state.documentId === documentId) {
    setMobilePane('content');
    if (sectionId) history.replaceState({ ...history.state, readingPosition: null }, '', reviewHref(documentId, sectionId));
  } else {
    saveReadingPosition();
    history.pushState({ previousDocument: state.documentId }, '', reviewHref(documentId, sectionId));
    state.documentId = documentId;
    state.mobilePane = 'content';
    state.directoryQuery = '';
    renderReview();
    window.scrollTo(0, 0);
    app.querySelector('.article-title h1').focus({ preventScroll: true });
  }
  if (blockId) jumpToReviewBlock(blockId, position);
}

function updateMobilePane() {
  const grid = app.querySelector('#review-layout');
  if (!grid) return;
  grid.dataset.pane = state.mobilePane;
  const responsiveButtons = app.querySelectorAll('.mobile-pane-button');
  for (const item of responsiveButtons) item.setAttribute('aria-pressed', String(item.dataset.pane === state.mobilePane));
}

function reviewChapterList(article) {
  return Array.from(article.querySelectorAll('.markdown .block-content > h2, .markdown .block-content > h3'), heading => ({
    id: heading.closest('.review-block').id,
    label: heading.textContent.trim(),
    depth: heading.tagName.slice(1),
  }));
}

function updateDirectoryMode(mode) {
  state.directoryMode = mode;
  for (const tab of app.querySelectorAll('.directory-tab')) {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute('aria-pressed', String(selected));
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
  }
  if (mode === 'outline') updateCurrentChapter();
}

let chapterFrame;
function updateCurrentChapter() {
  if (state.directoryMode !== 'outline' || chapterFrame) return;
  chapterFrame = requestAnimationFrame(() => {
    chapterFrame = null;
    const article = app.querySelector('.article-pane');
    const outline = app.querySelector('#directory-outline');
    if (!article?.getClientRects().length || !outline?.getClientRects().length) return;
    const links = outline.querySelectorAll('.outline-link');
    if (!links.length) return;
    const toolbar = app.querySelector('.mobile-panes');
    const threshold = app.querySelector('.topbar').offsetHeight + toolbar.offsetHeight + 42;
    let active = links[0];
    for (const link of links) {
      const section = document.getElementById(link.dataset.blockId);
      if (!section) continue;
      if (section.getBoundingClientRect().top > threshold) break;
      active = link;
    }
    if (Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight && links.length > 1
      && document.documentElement.scrollHeight > window.innerHeight) active = links[links.length - 1];
    const previous = outline.querySelector('[aria-current="location"]');
    if (active === previous) return;
    previous?.removeAttribute('aria-current');
    active.setAttribute('aria-current', 'location');
    if (outline.scrollHeight <= outline.clientHeight) return;
    const frame = outline.getBoundingClientRect();
    const row = active.getBoundingClientRect();
    if (row.top < frame.top + 4) outline.scrollTop += row.top - frame.top - 4;
    else if (row.bottom > frame.bottom - 4) outline.scrollTop += row.bottom - frame.bottom + 4;
  });
}

function setFeedbackDrawer(open) {
  state.feedbackDrawerOpen = open;
  const layout = app.querySelector('#review-layout');
  const toggle = app.querySelector('.feedback-drawer-toggle');
  layout.dataset.feedbackOpen = String(open);
  toggle.setAttribute('aria-expanded', String(open));
  (open ? app.querySelector('.feedback-drawer-close') : toggle)?.focus({ preventScroll: true });
}

function renderReview() {
  hideSelectionTools();
  closeParagraphMenu();
  closeInlineEditor();
  const review = state.review;
  const entry = currentDocument();
  recordViewedVersion(entry);
  if (entry) {
    const pageTitle = annotation || entry.title === review.title ? entry.title : entry.title + ' · ' + review.title;
    document.title = pageTitle + ' · FlowDesk';
  }
  const tabs = element('nav', { className: 'mobile-panes', 'aria-label': annotation ? '批注视图' : '评审视图' },
    [['documents', annotation ? '目录' : '资料目录'], ['content', '正文'], ['feedback', annotation ? '批注' : '反馈']].map(([pane, name]) =>
      button(name, () => setMobilePane(pane), 'mobile-pane-button', {
        'data-pane': pane, 'aria-controls': pane + '-pane', 'aria-pressed': pane === state.mobilePane ? 'true' : 'false',
      })));
  const article = renderArticle(entry);
  const grid = element('div', {
    id: 'review-layout', className: 'review-layout', 'data-pane': state.mobilePane,
    'data-feedback-open': String(state.feedbackDrawerOpen),
  }, renderDocuments(reviewChapterList(article)), article,
  element('aside', { id: 'feedback-pane', className: 'feedback-pane', 'aria-label': annotation ? '批注与高亮' : '评审反馈' }));
  const feedbackCount = element('span', { className: 'count feedback-drawer-count', hidden: true });
  const actions = element('div', { className: 'review-top-actions' },
    annotation && workbenchLink(),
    button([annotation ? '批注' : '反馈', feedbackCount], () => setFeedbackDrawer(!state.feedbackDrawerOpen), 'button compact feedback-drawer-toggle', {
      'aria-controls': 'feedback-pane', 'aria-expanded': String(state.feedbackDrawerOpen),
    }),
    !annotation && pill(review.closedAt ? '已关闭' : '评审中', review.closedAt ? '' : 'positive'));
  app.replaceChildren(shell(annotation ? '提出修改' : '资料评审', actions), tabs, grid);
  renderFeedback();
  updateCurrentChapter();
}

function documentTitleWithoutProject(entry) {
  const taggedTitle = entry.title.match(/^(.+?)\s*·\s*(.+)$/u);
  const mainTitle = state.review.documents[0]?.title;
  return taggedTitle && mainTitle?.startsWith(taggedTitle[1] + ' ') ? taggedTitle[2].trim() : entry.title;
}

function documentLabel(entry) {
  const title = documentTitleWithoutProject(entry);
  return title === entry.title ? title : title.replace(/详细设计$/u, '').trim() || title;
}

function plainLinkClick(event) {
  return !event.button && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

function renderDocumentLink(entry) {
  return element('a', {
    href: reviewHref(entry.id), className: 'document-link', title: entry.title, 'aria-label': entry.title,
    'aria-current': entry.id === state.documentId ? 'page' : undefined,
    onClick: event => {
      if (!plainLinkClick(event)) return;
      event.preventDefault();
      selectReviewDocument(entry.id);
    },
  }, element('span', { className: 'file-icon', 'aria-hidden': 'true' }),
  element('span', { className: 'document-label-text' }, documentLabel(entry)));
}

function renderSharedGalleries(galleries) {
  const prefixes = ['galleries', 'gallery-access'].map(route => reviewPath() + '/' + route + '/');
  const sharedHref = href => typeof href === 'string' && prefixes.some(prefix => href.startsWith(prefix));
  const link = (href, title) => element('a', {
    href, className: 'document-link', target: '_blank', rel: 'noopener noreferrer',
  }, element('span', { className: 'file-icon asset-icon', 'aria-hidden': 'true' }),
  element('span', { className: 'document-label-text' }, title));
  return galleries.length > 0 && element('nav', { className: 'document-nav', 'aria-label': '图集' },
    element('h2', { className: 'sidebar-label' }, '图集'),
    element('ul', {}, galleries.map(gallery => {
      const pages = gallery.pages.filter(page => sharedHref(page.href));
      return element('li', { className: 'shared-gallery-group' },
        sharedHref(gallery.href) ? link(gallery.href, gallery.title) :
          element('span', { className: 'document-link' }, gallery.title),
        pages.length > 0 && element('details', { className: 'shared-gallery-pages' },
          element('summary', {}, pages.length + ' 个子页'),
          element('ul', {}, pages.map(page => element('li', {}, link(page.href, page.title))))));
    })));
}

function renderDirectoryFiles(related) {
  const search = related.length > 6 ? element('input', {
    type: 'search', className: 'directory-search', placeholder: '查找关联文档', 'aria-label': '查找关联文档',
  }) : null;
  const rows = related.map(entry => element('li', {}, renderDocumentLink(entry)));
  const resultHint = search && element('p', { className: 'empty directory-empty', role: 'status', hidden: true }, '没有匹配的文档。');
  if (search) {
    search.value = state.directoryQuery;
    const filter = () => {
      state.directoryQuery = search.value;
      const query = search.value.trim().toLocaleLowerCase();
      rows.forEach((row, index) => { row.hidden = !related[index].title.toLocaleLowerCase().includes(query); });
      resultHint.hidden = rows.some(row => !row.hidden);
    };
    search.addEventListener('input', filter);
    filter();
  }
  const assets = state.review.assets || [];
  return element('div', { id: 'directory-documents', className: 'directory-panel' },
    related.length > 0 && element('nav', { className: 'document-nav directory-related', 'aria-label': '关联文档' },
      search, element('ul', {}, rows), resultHint),
    renderSharedGalleries(state.review.galleries || []),
    assets.length > 0 && element('nav', { className: 'document-nav', 'aria-label': '附件' },
      element('h2', { className: 'sidebar-label' }, '附件'),
      element('ul', {}, assets.map(asset => element('li', {}, element('a', {
        href: reviewPath() + '/assets/' + encodeURIComponent(asset.id), className: 'document-link', target: '_blank', rel: 'noopener noreferrer',
      }, element('span', { className: 'file-icon asset-icon', 'aria-hidden': 'true' }),
      element('span', { className: 'document-label-text' }, asset.title)))))));
}

function renderDocuments(chapters) {
  const review = state.review;
  const [primary, ...related] = review.documents;
  const files = renderDirectoryFiles(related);
  const hasFiles = related.length > 0 || review.assets?.length > 0 || review.galleries?.length > 0;
  if (!chapters.length) state.directoryMode = 'documents';
  else if (!hasFiles) state.directoryMode = 'outline';
  files.hidden = state.directoryMode !== 'documents';
  const outline = chapters.length > 0 && element('div', {
    id: 'directory-outline', className: 'directory-panel', hidden: state.directoryMode !== 'outline',
  }, element('nav', { className: 'document-outline', 'aria-label': '本文目录' },
    !hasFiles && element('h2', { className: 'sidebar-label' }, '本文目录'),
    element('ul', {}, chapters.map(chapter => element('li', {}, button(chapter.label, () => {
      selectReviewDocument(state.documentId, chapter.id, 'start');
    }, 'outline-link', {
      'data-block-id': chapter.id, 'data-depth': chapter.depth, title: chapter.label,
    }))))));
  if (annotation) return element('aside', { id: 'documents-pane', className: 'documents-pane' },
    outline || empty('本文没有可展开的目录。'));
  const switcher = hasFiles && outline && element('div', { className: 'directory-switcher', role: 'group', 'aria-label': '目录视图' },
    [['documents', '关联资料'], ['outline', '本文目录']].map(([mode, label]) =>
      button(label, () => updateDirectoryMode(mode), 'directory-tab', {
        'data-mode': mode, 'aria-controls': 'directory-' + mode, 'aria-pressed': String(state.directoryMode === mode),
      })));
  return element('aside', { id: 'documents-pane', className: 'documents-pane' },
    element('div', { className: 'review-nav-title' },
      element('h2', {}, review.title),
      element('p', { className: 'meta' }, review.documents.length + ' 份文档')),
    primary && element('nav', { className: 'document-nav directory-primary', 'aria-label': '主文档' }, renderDocumentLink(primary)),
    switcher, files, outline);
}

function renderArticleNavigation(entry) {
  const primary = state.review.documents[0];
  if (!primary || entry.id === primary.id) return null;
  const previous = state.review.documents.find(document => document.id === history.state?.previousDocument);
  const source = previous || primary;
  return element('nav', { className: 'article-navigation', 'aria-label': '文档路径' },
    element('a', {
      className: 'article-return', href: reviewHref(source.id), title: source.title,
      onClick: event => {
        if (!plainLinkClick(event)) return;
        event.preventDefault();
        if (previous) history.back();
        else selectReviewDocument(primary.id);
      },
    }, '返回 ', documentLabel(source)),
    element('span', { className: 'article-path-divider', 'aria-hidden': 'true' }, '/'),
    element('span', { className: 'article-current', 'aria-current': 'page', title: entry.title }, documentLabel(entry)));
}

function renderArticle(entry) {
  const main = element('main', { id: 'content-pane', className: 'article-pane' });
  if (!entry) {
    main.append(empty(annotation ? '没有可读正文。' : '这轮评审没有可读资料。'));
    return main;
  }
  const { createdAt } = state.review;
  const live = state.review.mode === 'live';
  const editable = canEditFeedback();
  const blocks = entry.blocks || [];
  const firstBlock = blocks[0];
  const sourceTitle = firstBlock?.text?.trim();
  const hasTitleBlock = [entry.title.trim(), documentTitleWithoutProject(entry).trim()].includes(sourceTitle)
    && /^\s*<h1(?:\s|>)/i.test(firstBlock.html);
  main.append(element('article', { className: 'article-layout' },
    element('header', { className: 'article-title' },
      renderArticleNavigation(entry),
      element('div', { className: 'article-version' },
        live ? 'Vault 当前正文' : '文档快照 · ' + formatTime(createdAt),
        live && button('重新读取', event => refreshLiveReview(event.currentTarget), 'text-button')),
      hasTitleBlock ? renderBlock(firstBlock) : element('h1', { tabindex: '-1' }, entry.title),
      editable && element('p', { className: 'article-help' },
        canSuggestEdit() ? '划选文字添加高亮、批注或改文建议。' : '划选文字添加高亮或批注。')),
    entry.sourceStatus === 'unavailable' ? empty('暂时无法读取当前正文。') :
      element('div', { className: 'markdown' }, (hasTitleBlock ? blocks.slice(1) : blocks).map(renderBlock))));
  main.addEventListener('click', (event) => {
    if (!plainLinkClick(event)) return;
    const link = event.target.closest('.block-content a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (annotation && url.origin === location.origin && /^\/annotate\/?$/.test(url.pathname)
      && url.searchParams.get('document') === annotationPath && url.searchParams.has('section')) {
      event.preventDefault();
      selectReviewDocument(state.documentId, url.searchParams.get('section'), 'start');
      return;
    }
    const translated = url.pathname.match(/^\/r\/([^/]+)\/doc\/([^/]+)\/?$/);
    if (url.origin === location.origin && translated && decodeURIComponent(translated[1]) === state.reviewId) {
      event.preventDefault();
      const section = url.searchParams.get('section');
      selectReviewDocument(decodeURIComponent(translated[2]), section, 'start');
    }
  });
  return main;
}

function renderBlock(block) {
  const blockElement = element('section', { id: block.id, className: 'review-block', 'data-block-id': block.id, tabindex: '-1' });
  const content = element('div', { className: 'block-content' });
  content.innerHTML = block.html;
  content.querySelector('h1')?.setAttribute('tabindex', '-1');
  for (const link of content.querySelectorAll('a[data-doc-id]')) {
    const target = state.review.documents.find(entry => entry.id === link.dataset.docId);
    if (target) link.title = '打开 ' + target.title;
  }
  decorateTaskList(content);
  blockElement.append(content);
  if (canEditFeedback() && block.text?.trim()) {
    const trigger = button('⋯', () => openParagraphMenu(block, content, trigger), 'block-action', {
      'aria-label': '段落操作', 'aria-expanded': 'false', title: '段落操作',
    });
    blockElement.append(trigger);
  }
  paintMarks(content, block.id);
  return blockElement;
}

function closeParagraphMenu(restoreFocus = false) {
  if (!paragraphMenu) return;
  paragraphMenu.remove();
  paragraphMenuTrigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) paragraphMenuTrigger.focus({ preventScroll: true });
  paragraphMenu = null;
  paragraphMenuTrigger = null;
}

function canSuggestEdit() {
  return annotation || state.review?.external === true;
}

function openParagraphMenu(block, content, trigger) {
  const alreadyOpen = trigger === paragraphMenuTrigger;
  closeParagraphMenu();
  if (alreadyOpen || state.submitting) return;
  hideSelectionTools();
  const actions = [
    ['highlight', '高亮'],
    ['comment', '批注'],
    ...(canSuggestEdit() ? [['suggestion', '建议改文']] : []),
  ];
  const visibleText = content.textContent;
  const quote = (visibleText.trim() || block.text.trim()).slice(0, textLimit);
  paragraphMenu = element('div', { className: 'paragraph-actions', role: 'group', 'aria-label': '段落反馈方式' },
    actions.map(([kind, label]) => button(label, () => {
      closeParagraphMenu(true);
      const offset = Math.max(0, visibleText.indexOf(quote));
      const item = { kind, quote, documentId: state.documentId, blockId: block.id, offset,
        ...feedbackSource(visibleText, quote, offset) };
      if (kind === 'highlight') {
        upsertItem({ ...item, id: id(), comment: '' });
        message('已高亮此段。');
      } else {
        openFeedbackEditor(item);
      }
    })));
  paragraphMenuTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  trigger.parentElement.append(paragraphMenu);
  paragraphMenu.querySelector('button').focus({ preventScroll: true });
}

function decorateTaskList(content) {
  for (const item of content.querySelectorAll('li')) {
    const first = item.firstChild;
    const text = first instanceof HTMLParagraphElement ? first.firstChild : first;
    if (text?.nodeType !== Node.TEXT_NODE) continue;
    const marker = text.data.match(/^\[([ xX])\][ \t]+/);
    if (!marker) continue;
    const checked = marker[1] !== ' ';
    item.classList.add('markdown-task');
    text.splitText(marker[0].length);
    text.replaceWith(element('span', {
      className: 'markdown-task-marker',
      role: 'checkbox',
      'aria-checked': String(checked),
      'aria-disabled': 'true',
      'aria-label': checked ? '已完成' : '未完成',
    }, text.data));
  }
}

function paintMarks(content, blockId) {
  const allItems = annotation ? (state.submission?.items || state.draft?.items || [])
    : [...(state.submission?.items || []), ...(state.draft?.items || [])];
  const text = content.textContent;
  const entry = currentDocument();
  const ranges = allItems.flatMap((item) => {
    if (item.documentId !== state.documentId || currentFeedbackBlock(item, entry) !== blockId || !item.quote
      || (!canSuggestEdit() && item.kind === 'suggestion')) return [];
    const version = item.sourceSha256 || item.source?.sha256;
    const matches = text.indexOf(item.quote);
    const start = (!version || version === entry.sha256) &&
      Number.isInteger(item.offset) && text.slice(item.offset, item.offset + item.quote.length) === item.quote
      ? item.offset
      : matches === text.lastIndexOf(item.quote) ? matches : -1;
    return start < 0 ? [] : [{ start, end: start + item.quote.length, kind: item.kind }];
  });
  if (!ranges.length) return;

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let index = 0;
  for (const node of nodes) {
    const start = index;
    const end = start + node.length;
    index = end;
    const touching = ranges.filter((range) => range.start < end && range.end > start);
    if (!touching.length) continue;
    const boundaries = [...new Set([start, end, ...touching.flatMap((range) =>
      [Math.max(start, range.start), Math.min(end, range.end)])])].sort((left, right) => left - right);
    const fragment = document.createDocumentFragment();
    for (let boundary = 0; boundary < boundaries.length - 1; boundary += 1) {
      const from = boundaries[boundary];
      const to = boundaries[boundary + 1];
      const segment = node.data.slice(from - start, to - start);
      const active = touching.filter((range) => range.start <= from && range.end >= to);
      if (active.length) {
        const kind = active.some((range) => range.kind === 'suggestion') ? 'suggestion-mark'
          : active.some((range) => range.kind === 'comment') ? 'comment-mark' : 'highlight-mark';
        fragment.append(element('mark', { className: kind }, segment));
      } else fragment.append(segment);
    }
    node.replaceWith(fragment);
  }
}

function refreshBlock(blockId) {
  if (currentDocument() === undefined) return;
  const block = currentDocument().blocks?.find((entry) => entry.id === blockId);
  const target = [...app.querySelectorAll('.review-block')].find((entry) => entry.dataset.blockId === blockId);
  if (block && target) {
    target.replaceWith(renderBlock(block));
  }
}

function hideSelectionTools() {
  selectionToolbar?.remove();
  selectionToolbar = undefined;
}

function captureSelection() {
  if (!canEditFeedback() || state.submitting || dialog.open || state.mobilePane !== 'content') {
    hideSelectionTools();
    return;
  }
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
    hideSelectionTools();
    return;
  }
  const range = selection.getRangeAt(0);
  const start = range.startContainer.parentElement;
  const end = range.endContainer.parentElement;
  const content = (range.startContainer instanceof Element ? range.startContainer : start)?.closest('.block-content');
  const endContent = (range.endContainer instanceof Element ? range.endContainer : end)?.closest('.block-content');
  if (!content || !app.contains(content) || content !== endContent) {
    hideSelectionTools();
    return;
  }
  const raw = range.toString();
  const quote = raw.trim();
  if (!quote) {
    hideSelectionTools();
    return;
  }
  const beginning = document.createRange();
  beginning.selectNodeContents(content);
  beginning.setEnd(range.startContainer, range.startOffset);
  const sample = {
    documentId: state.documentId, blockId: content.closest('.review-block').dataset.blockId,
    quote: quote.slice(0, textLimit), offset: beginning.toString().length + raw.length - raw.trimStart().length,
  };
  Object.assign(sample, feedbackSource(content.textContent, sample.quote, sample.offset));
  const place = range.getBoundingClientRect();
  if (!place.width && !place.height) return;
  hideSelectionTools();
  const clearSelectedText = () => { hideSelectionTools(); document.getSelection()?.removeAllRanges(); };
  selectionToolbar = element('div', { className: 'selection-tools', role: 'group', 'aria-label': '划选反馈' },
    button('高亮', () => {
      clearSelectedText();
      upsertItem({ ...sample, id: id(), kind: 'highlight', comment: '' });
    }, 'selection-button'),
    button('批注', () => {
      clearSelectedText();
      openFeedbackEditor({ ...sample, kind: 'comment' });
    }, 'selection-button'),
    canSuggestEdit() && button('建议改文', () => {
      clearSelectedText();
      openFeedbackEditor({ ...sample, kind: 'suggestion' });
    }, 'selection-button'));
  selectionToolbar.addEventListener('mousedown', (event) => event.preventDefault());
  document.body.append(selectionToolbar);
  const width = selectionToolbar.offsetWidth;
  const height = selectionToolbar.offsetHeight;
  const center = place.left + place.width / 2;
  selectionToolbar.style.left = Math.max(8, Math.min(center - width / 2, innerWidth - width - 8)) + 'px';
  selectionToolbar.style.top = (place.top > height + 12 ? place.top - height - 7 : place.bottom + 8) + 'px';
}

function upsertItem(item) {
  if (!canEditFeedback() || state.submitting) return;
  const position = state.draft.items.findIndex((entry) => entry.id === item.id);
  if (position < 0 && state.draft.items.length >= itemLimit) {
    message('一份评审最多可添加 250 条反馈。', 'error');
    return;
  }
  if (position >= 0) state.draft.items[position] = item;
  else state.draft.items.push(item);
  saveDraft();
  refreshBlock(item.blockId);
  renderFeedback();
}

function removeFeedback(item) {
  if (!canEditFeedback() || state.submitting) return;
  state.draft.items = state.draft.items.filter((entry) => entry.id !== item.id);
  saveDraft();
  refreshBlock(item.blockId);
  renderFeedback();
}

function closeInlineEditor(restoreFocus = false) {
  if (!inlineEditor) return;
  const section = inlineEditor.closest('.review-block');
  inlineEditor.remove();
  inlineEditor = null;
  if (restoreFocus) section?.focus({ preventScroll: true });
}

function openFeedbackEditor(item) {
  if (!canEditFeedback() || state.submitting || (!canSuggestEdit() && item.kind === 'suggestion')) return;
  const entry = state.review.documents.find((document) => document.id === item.documentId);
  if (!entry) return;
  closeInlineEditor();
  const highlight = item.kind === 'highlight';
  let suggestion = item.kind === 'suggestion';
  const comment = element('textarea', { rows: 3, maxlength: textLimit, required: !highlight, placeholder: highlight ? '添加备注（可选）' : undefined });
  comment.value = item.comment || '';
  const replacement = canSuggestEdit() && !highlight && element('textarea', { rows: 3, maxlength: textLimit });
  if (replacement) replacement.value = item.replacement ?? item.quote ?? '';
  const replacementField = replacement && field('建议改为', replacement);
  const preview = replacement && element('div', { className: 'suggestion-preview-content' });
  const commentField = field(highlight ? '备注（可选）' : '批注', comment);
  const required = element('input', { type: 'checkbox' });
  required.checked = Boolean(item.required);
  const error = element('p', { className: 'inline-error', role: 'alert', hidden: true });
  const anchor = annotation && document.getElementById(currentFeedbackBlock(item, entry));
  const close = () => anchor ? closeInlineEditor(true) : dialog.close();
  const modes = replacement && [button('批注', () => switchKind(false), 'directory-tab'),
    button('建议改文', () => switchKind(true), 'directory-tab')];
  const form = element('form', { className: 'dialog-form' },
    element('div', { className: 'original-text' },
      element('span', { className: 'meta' }, '所选文字'),
      element('blockquote', { className: 'quote' }, item.quote)),
    modes && element('div', { className: 'inline-editor-modes directory-switcher', role: 'group', 'aria-label': '批注类型' }, modes),
    replacementField, preview, commentField,
    !highlight && element('label', { className: 'required-choice' }, required, '必改'),
    error,
    element('div', { className: 'dialog-actions' }, button('取消', close),
      element('button', { type: 'submit', className: 'button primary' }, '保存到草稿')));
  function updateSuggestion() {
    if (!replacement) return;
    const value = replacement.value.trim();
    replacementField.hidden = !suggestion;
    preview.hidden = !suggestion || value === item.quote;
    preview.replaceChildren(preview.hidden ? '' : suggestionDiff(item.quote, value));
    comment.required = !highlight && !suggestion;
    commentField.firstElementChild.textContent = suggestion ? '说明（可选）' : '批注';
    modes[0].setAttribute('aria-pressed', String(!suggestion));
    modes[1].setAttribute('aria-pressed', String(suggestion));
  }
  function switchKind(next) {
    suggestion = next;
    error.hidden = true;
    updateSuggestion();
    (suggestion ? replacement : comment).focus();
  }
  replacement && replacement.addEventListener('input', updateSuggestion);
  updateSuggestion();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const detail = comment.value.trim();
    const value = suggestion ? replacement.value.trim() : '';
    if (suggestion && value === item.quote) {
      error.textContent = '请填写和所选文字不同的改法。';
      error.hidden = false;
      return;
    }
    if (!suggestion && !highlight && !detail) {
      error.textContent = '请填写批注。';
      error.hidden = false;
      return;
    }
    close();
    upsertItem({ ...item, id: item.id || id(), kind: suggestion ? 'suggestion' : highlight ? 'highlight' : 'comment',
      replacement: value, comment: detail, required: !highlight && required.checked });
    if (anchor) document.getElementById(anchor.id)?.focus({ preventScroll: true });
  });
  const title = item.id ? '编辑' + itemNames[item.kind] : itemNames[item.kind];
  if (anchor) {
    inlineEditor = element('section', { className: 'inline-annotation-editor', 'aria-label': title },
      element('h3', {}, title), form);
    anchor.append(inlineEditor);
  } else openDialog(title, form, entry.title);
  (suggestion ? replacement : comment).focus();
}

function renderFeedback() {
  const pane = app.querySelector('#feedback-pane');
  if (!pane) return;
  const previousScroll = pane.querySelector('.feedback-scroll')?.scrollTop || 0;
  const reviewer = state.review.reviewer;
  const editable = canEditFeedback();
  const draftItems = state.draft?.items || [];
  const submittedItems = state.submission?.items || [];
  const activeItems = editable ? draftItems : submittedItems;
  const multipleDocuments = state.review.documents.length > 1;
  const relevantItems = items => !multipleDocuments || state.feedbackScope === 'all'
    ? items : items.filter(item => item.documentId === state.documentId);
  const visibleDraftItems = relevantItems(draftItems);
  const visibleSubmittedItems = relevantItems(submittedItems);
  const openPicker = state.submission?.id && state.openDispatchFor === state.submission.id;
  if (openPicker) delete state.openDispatchFor;
  const submitted = state.submission && receipt(state.submission, {
    title: annotation ? '本次批注' : state.submissionJustNow ? '本次提交成功' : '此邀请最近一次提交',
    label: annotation ? '已保存' : undefined,
    documents: state.review.documents,
    jump: selectReviewDocument,
    items: visibleSubmittedItems,
    versionStatus: submissionVersionStatus(state.submission, state.review.documents),
    delivery: annotation && dispatchControls(state.review, state.submission, { openPicker, label: '发送这份批注' }),
  });
  const counts = [
    ['document', '当前文档', activeItems.filter(item => item.documentId === state.documentId).length],
    ['all', '全部', activeItems.length],
  ];
  const filters = multipleDocuments && (editable || submitted) && element('div', {
    className: 'feedback-filters', role: 'group', 'aria-label': '反馈范围',
  }, counts.map(([scope, title, count]) => button([title, element('span', { className: 'count' }, count)], () => {
    state.feedbackScope = scope;
    pane.querySelector('.feedback-scroll').scrollTop = 0;
    renderFeedback();
    pane.querySelector('.feedback-filter[aria-pressed=true]')?.focus({ preventScroll: true });
  }, 'feedback-filter', { 'aria-pressed': String(state.feedbackScope === scope) })));

  const body = element('div', { className: 'feedback-scroll', tabindex: '0', 'aria-label': '反馈列表' },
    filters,
    state.review.closedAt && element('p', { className: 'closed-note' }, '本轮评审已关闭。'),
    editable && element('section', { className: 'draft-items' },
      !multipleDocuments && element('h3', { className: 'draft-heading' }, annotation ? '本次批注' : '段落反馈',
        element('span', { className: 'count' }, visibleDraftItems.length)),
      visibleDraftItems.length ? element('div', { className: 'feedback-stack' }, visibleDraftItems.map(item =>
        feedbackCard(item, {
          documents: state.review.documents,
          jump: selectReviewDocument,
          edit: state.submitting || (!canSuggestEdit() && item.kind === 'suggestion') ? null : () => openFeedbackEditor(item),
          remove: state.submitting ? null : () => removeFeedback(item),
        }))) : empty(draftItems.length ? '当前文档还没有草稿反馈。' : '从正文划选文字，或打开段落操作添加反馈。')),
    !annotation && !editable && !state.review.closedAt && button('开始新一份评审', () => {
      state.draft = emptyDraft();
      state.submissionJustNow = false;
      saveDraft();
      renderReview();
    }, 'button primary new-draft-button'),
    submitted,
    submittedItems.length > 0 && visibleSubmittedItems.length === 0 && empty('当前文档暂无已提交反馈。'));

  pane.replaceChildren(...[
    element('div', { className: 'feedback-pane-title' }, element('div', {},
      element('h2', {}, annotation ? '批注与高亮' : '评审反馈'),
      !annotation && element('p', { className: 'reviewer-identity meta' },
        element('span', { className: 'reviewer-avatar', 'aria-hidden': 'true' }, Array.from(reviewer || '')[0] || '评'),
        reviewer)),
      element('div', { className: 'feedback-pane-controls' },
        editable && pill('本地草稿', ''),
        button('×', () => setFeedbackDrawer(false), 'icon-button feedback-drawer-close', { 'aria-label': '关闭反馈面板' }))),
    body,
    editable && renderSubmissionForm(),
  ].filter(Boolean));
  body.scrollTop = previousScroll;
  const drawerCount = app.querySelector('.feedback-drawer-count');
  drawerCount.hidden = activeItems.length === 0;
  drawerCount.textContent = activeItems.length;
}

function renderSubmissionForm() {
  const draft = state.draft;
  const error = element('p', { className: 'inline-error', role: 'alert', hidden: true });
  const summary = !annotation && element('textarea', { rows: 3, maxlength: textLimit, disabled: state.submitting, placeholder: '补充本轮评审的总体说明' });
  if (summary) {
    summary.value = draft.summary;
    summary.addEventListener('input', () => {
      draft.summary = summary.value;
      saveDraft();
    });
  }
  const canSubmit = () => !state.submitting && (annotation ? draft.items.length > 0 : Boolean(draft.decision));
  const submit = element('button', { type: 'submit', className: 'button primary full', disabled: !canSubmit() },
    annotation ? state.submitting ? '正在保存批注…' : '发送到 Codex' :
      state.submitting ? '正在提交…' : state.submissionConflict ? '作为新评审提交' : '提交评审');
  const choices = !annotation && Object.entries(decisionNames).map(([key, name]) => {
    const input = element('input', { type: 'radio', name: 'decision', value: key, disabled: state.submitting });
    input.checked = draft.decision === key;
    input.addEventListener('change', () => {
      draft.decision = key;
      submit.disabled = false;
      if (!state.submissionConflict) error.hidden = true;
      saveDraft();
    });
    return element('label', { className: 'decision-choice' }, input, element('span', {}, name));
  });
  const form = element('form', { className: 'submission-form' },
    choices && element('fieldset', {}, element('legend', {}, '评审结论'), element('div', { className: 'decision-choices' }, choices)),
    summary && field('总体说明（可选）', summary), error, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canSubmit() || state.review.closedAt) return;
    if (state.submissionConflict) {
      draft.id = id();
      state.submissionConflict = false;
      saveDraft();
    }
    if (annotation) {
      draft.decision = 'comment';
      saveDraft();
    }
    const attempt = { id: draft.id, inviteId: state.review.inviteId, ...submissionContent(draft) };
    const readingPosition = window.scrollY;
    if (annotation) rememberPendingSubmission(attempt.id);
    state.submitting = true;
    renderFeedback();
    try {
      const endpoint = annotation ? directReviewPath + '/' + encodeURIComponent(state.reviewId) : reviewPath();
      const { submission } = await request(endpoint + '/submit', attempt);
      if (submission?.id !== attempt.id || !sameSubmissionContent(submission, attempt)) {
        throw Object.assign(new Error(submissionConflictMessage), { code: 'submission_conflict' });
      }
      state.submission = submission;
      state.submissionJustNow = true;
      if (annotation) state.openDispatchFor = submission.id;
      if (!annotation) {
        state.draft = null;
        clearSubmittedDraft(submission);
      }
      state.submitting = false;
      renderReview();
      if (annotation) window.scrollTo(0, readingPosition);
      else message('评审已提交。');
    } catch (err) {
      state.submitting = false;
      state.submissionConflict = err.code === 'submission_conflict';
      if (annotation && err.status < 500) rememberPendingSubmission(null);
      if (state.submissionConflict) saveDraft();
      state.submissionError = err.message;
      renderFeedback();
    }
  });
  if (state.submissionConflict || state.submissionError) {
    error.textContent = state.submissionConflict ?
      annotation ? '该草稿在另一个标签页有不同的保存内容。再次发送可单独保存当前批注。' : submissionConflictMessage :
      state.submissionError;
    error.hidden = false;
    state.submissionError = null;
  }
  return form;
}

async function loadReview() {
  const title = annotation ? '提出修改' : '资料评审';
  initialView(title, annotation ? '正在读取正文…' : '正在打开评审…');
  try {
    const key = location.hash.slice(1);
    if (!annotation && key) {
      await request(reviewPath() + '/session', { token: decodeURIComponent(key) });
      history.replaceState({}, '', location.pathname + location.search);
    }
    const { review, submission } = await readReview();
    state.review = review;
    state.reviewId = review.id;
    if (annotation) {
      const pendingId = pendingSubmissionId();
      state.submission = await readPendingSubmission(pendingId);
      if (pendingId && !state.submission) rememberPendingSubmission(null);
    } else state.submission = submission || null;
    const inviteScope = review.inviteId || review.reviewer;
    if (inviteScope) state.draftKey = (annotation ? 'flowdesk-annotation-draft:' : 'flowdesk-review-draft:') + state.reviewId + ':' + inviteScope;
    state.draft = restoreDraft() || (review.closedAt || (!annotation && state.submission) ? null : emptyDraft());
    state.documentId = review.documents.some((entry) => entry.id === state.requestedDocument)
      ? state.requestedDocument : review.documents[0]?.id;
    renderReview();
    restoreReadingLocation(history.state?.readingPosition);
  } catch (err) {
    initialView(title, annotation ? '无法打开正文' : '无法打开评审', err.message);
  }
}

async function loadAdmin() {
  const roundId = params.get('round');
  const submissionId = params.get('submission');
  const docId = params.get('doc');
  if (!roundId || (!submissionId && !docId)) {
    initialView('反馈回执', '请从正文提出修改');
    return;
  }
  initialView('反馈回执', '正在加载回执…');
  try {
    const { review } = await request(adminPath(roundId));
    state.detail = review;
    state.preferredThreadId = params.get('thread') || '';
    const submission = review.submissions.find(entry => entry.id === submissionId);
    if (submissionId && !submission) {
      initialView('反馈回执', '没有找到这份回执');
      return;
    }
    const savedReceipt = submission && receipt(submission, {
      title: submission.reviewer || '反馈回执',
      label: review.direct ? '已保存' : undefined,
      documents: review.documents,
      versionStatus: submissionVersionStatus(submission, review.documents),
      delivery: dispatchControls(review, submission),
      reference: review.mode === 'live' ? (item, entry) => liveReference(review, item, entry) : undefined,
      snapshot: review.mode !== 'live' ?
        (entry, block) => adminSnapshotLink(review.id, entry.id, block.id, '查看快照原段', entry.title) : undefined,
    });
    app.replaceChildren(shell('反馈回执', workbenchLink()), element('main', { className: 'initial' },
      element('section', { className: 'panel initial-panel' }, element('h1', {}, review.title), savedReceipt)));
    if (docId) openAdminSnapshot(docId, params.get('block'));
  } catch (err) {
    initialView('反馈回执', '无法读取这份回执', err.message);
  }
}

if (route || annotation) {
  history.scrollRestoration = 'manual';
  document.addEventListener('selectionchange', captureSelection);
  document.addEventListener('click', event => {
    if (!event.target.closest('.block-action, .paragraph-actions')) closeParagraphMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || dialog.open) return;
    if (inlineEditor?.contains(event.target)) closeInlineEditor(true);
    else if (paragraphMenu) closeParagraphMenu(true);
    else if (state.feedbackDrawerOpen && matchMedia('(800px < width <= 1100px)').matches) setFeedbackDrawer(false);
  });
  window.addEventListener('resize', () => {
    hideSelectionTools();
    updateCurrentChapter();
  });
  window.addEventListener('scroll', event => {
    hideSelectionTools();
    if (event.target === document) updateCurrentChapter();
  }, { capture: true, passive: true });
  window.addEventListener('popstate', event => {
    if (!state.review) return;
    const documentId = location.pathname.match(/\/doc\/([^/]+)\/?$/)?.[1];
    const requested = documentId ? decodeURIComponent(documentId) : null;
    state.documentId = state.review.documents.find((entry) => entry.id === requested)?.id || state.review.documents[0]?.id;
    state.mobilePane = 'content';
    state.directoryQuery = '';
    renderReview();
    restoreReadingLocation(event.state?.readingPosition);
  });
  loadReview();
} else loadAdmin();
