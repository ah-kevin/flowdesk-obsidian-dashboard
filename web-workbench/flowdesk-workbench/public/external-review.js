'use strict';

const app = document.getElementById('external-app');
const dialog = document.getElementById('external-dialog');
const notice = document.getElementById('external-notice');
const apiRoot = '/api/admin/external-reviews';
const query = new URLSearchParams(location.search);
const context = { document: query.get('document'), case: query.get('case') };
const decisionNames = { approve: '通过', changes: '需修改', comment: '仅反馈' };
const itemNames = { highlight: '高亮', comment: '评论', suggestion: '建议改文' };
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const state = {
  catalog: null,
  reviews: [],
  historyView: 'history',
  trashReviews: [],
  purgeFailures: new Map(),
  round: null,
  roundId: query.get('round') || '',
  paths: new Set(),
  attachments: new Set(),
  attachmentInput: '',
  galleries: new Set(),
  title: '',
  reviewer: '',
  expiresInHours: '72',
  query: '',
  revision: 0,
  links: new Map(),
};
let toastTimer;

function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'className') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(name, '');
    else node.setAttribute(name, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

function button(text, action, extra = {}, style = '') {
  return element('button', { type: 'button', className: 'ext-button ' + style, onClick: action, ...extra }, text);
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function items(value) {
  return Array.isArray(value) ? value : [];
}

function roundRoute(id) {
  return apiRoot + '/' + encodeURIComponent(id);
}

function toast(message) {
  clearTimeout(toastTimer);
  notice.hidden = false;
  notice.textContent = message;
  toastTimer = setTimeout(() => { notice.hidden = true; }, 3200);
}

function date(value) {
  if (!value) return '—';
  const instant = new Date(value);
  return Number.isNaN(instant.valueOf()) ? '—' : new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(instant);
}

function ordinal(value, unit) {
  return Number.isInteger(value) ? value + unit : '';
}

async function api(path = apiRoot, body) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(text(data.error) || '请求失败，请重试。'), { status: response.status, code: data.code });
  return data;
}

function internalHref(value) {
  if (!text(value)) return '';
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin && !url.username && !url.password ? url.pathname + url.search + url.hash : '';
  } catch {
    return '';
  }
}

function fullInviteUrl(invite) {
  if (!text(invite?.url)) return '';
  try {
    const url = new URL(invite.url, invite.publicOrigin || location.origin);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      /^\/r\/[^/]+\/?$/.test(url.pathname) && url.hash ? url.href : '';
  } catch {
    return '';
  }
}

function failed(err) {
  if (err.code === 'external_review_unavailable') return '外部评审尚未启用。请先启用作者配对和外部评审入口。';
  if (err.code === 'preview_changed') return '资料或选择已变化，请重新预览后创建。';
  if (err.code === 'author_pairing_required' || err.status === 401) return '请先完成作者配对，再打开外部评审。';
  if (err.status === 403 && !err.message.includes('作者配对')) return '当前会话没有外部评审的作者权限。';
  return err.message || '请求失败，请重试。';
}

function label(name, input) {
  return element('label', { className: 'ext-field' }, element('span', {}, name), input);
}

function section(title, summary, content) {
  return element('section', { className: 'ext-section' },
    element('header', { className: 'ext-section-heading' }, element('h2', {}, title), summary),
    content);
}

function blank(message) {
  return element('p', { className: 'ext-empty' }, message);
}

function status(label, tone = '') {
  return element('span', { className: 'ext-status', 'data-tone': tone }, label);
}

function setupDialog(title, content) {
  if (dialog.open) dialog.close();
  dialog.replaceChildren(element('div', { className: 'ext-dialog-heading' },
    element('h2', { id: 'external-dialog-title' }, title),
    button('×', () => dialog.close(), { 'aria-label': '关闭' }, 'icon')),
  content);
  dialog.showModal();
}

function updateRoundUrl(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('round', id);
  else url.searchParams.delete('round');
  history.replaceState({}, '', url.pathname + url.search);
}

function showHistoryView(view) {
  if (state.historyView === view) return;
  state.historyView = view;
  if (view === 'trash' && !trashBusy()) void refreshTrash();
  else updateSidebar();
}

function renderSidebar() {
  const inTrash = state.historyView === 'trash';
  const switcher = element('div', { className: 'ext-history-switch', role: 'group', 'aria-label': '轮次列表' },
    [['history', '历史'], ['trash', '废纸篓']].map(([view, label]) =>
      button(label, () => showHistoryView(view),
        { 'aria-pressed': String(state.historyView === view), 'data-history-view': view }, 'history-switch-item')));
  return element('aside', { className: 'ext-sidebar', 'aria-label': '评审轮次' },
    button('新建评审', () => {
      if (state.publishing) return;
      if (!state.roundId) {
        showHistoryView('history');
        return;
      }
      state.roundId = '';
      state.roundRequest = null;
      state.round = null;
      state.historyView = 'history';
      updateRoundUrl('');
      render();
    }, { disabled: state.publishing, 'aria-current': state.roundId ? undefined : 'page' }, 'new'),
    switcher, inTrash ? renderTrash() : renderHistory());
}

function renderHistory() {
  return [
    state.listError && element('p', { className: 'ext-error', role: 'alert' }, state.listError),
    state.reviews.length ? element('ul', { className: 'ext-rounds' }, state.reviews.map((review) =>
      element('li', {}, button([
        element('strong', {}, review.title),
        element('span', {}, (review.closedAt ? '已关闭' : '开放') + ' · ' + (review.submissionCount ?? 0) + ' 份提交'),
      ], () => openRound(review.id), { 'aria-current': state.roundId === review.id ? 'page' : undefined }, 'round-link'))))
      : !state.listError && blank('暂无外部评审轮次。'),
  ];
}

function trashBusy() {
  return Boolean(state.trashRequest || state.restoringId || state.purgePending);
}

function renderTrash() {
  const busy = trashBusy();
  const rows = state.trashReviews;
  const toolbar = element('div', { className: 'ext-trash-toolbar' },
    button('刷新废纸篓', refreshTrash, { disabled: busy }, 'trash-refresh'),
    rows.length > 0 && button('清空废纸篓', () => confirmPurge(rows, true), { disabled: busy }, 'trash-action purge'));
  return [
    toolbar,
    state.trashError && element('p', { className: 'ext-error', role: 'alert' }, state.trashError),
    state.restoreError && element('p', { className: 'ext-error', role: 'alert' }, state.restoreError),
    state.purgePending && element('p', { className: 'ext-empty', role: 'status' }, '正在永久删除…'),
    state.trashRequest && element('p', { className: 'ext-empty', role: 'status' }, '正在读取废纸篓…'),
    rows.length ? element('ul', { className: 'ext-rounds ext-trash-rounds' }, rows.map((review) => {
      const failure = state.purgeFailures.get(review.id);
      return element('li', {},
        element('div', { className: 'ext-trash-title' },
          element('strong', {}, review.title),
          element('span', { className: 'ext-meta' }, '创建于 ' + date(review.createdAt))),
        element('div', { className: 'ext-trash-row-actions' },
          button(state.restoringId === review.id ? '恢复中…' : '恢复', () => restoreRound(review),
            { disabled: busy, title: '恢复为已关闭轮次' }, 'restore'),
          button('永久删除', () => confirmPurge([review]), { disabled: busy }, 'trash-action purge')),
        failure && element('p', { className: 'ext-error ext-purge-failure', role: 'alert' }, failure));
    })) : !state.trashRequest && !state.trashError && blank('废纸篓为空。'),
  ];
}

function updateSidebar() {
  const previous = app.querySelector('.ext-sidebar');
  if (!previous) return;
  const focusedView = document.activeElement?.dataset?.historyView;
  const next = renderSidebar();
  previous.replaceWith(next);
  if (focusedView) next.querySelector('[data-history-view="' + focusedView + '"]')?.focus({ preventScroll: true });
}

function render() {
  const main = element('main', { className: 'ext-main' });
  if (state.roundId) {
    if (state.round?.id === state.roundId) main.append(renderRound(state.round));
    else if (state.roundError) main.append(section('无法读取评审', null, [
      element('p', { className: 'ext-error', role: 'alert' }, state.roundError),
      button('重试', () => openRound(state.roundId)),
    ]));
    else main.append(element('p', { className: 'external-loading', role: 'status' }, '正在读取评审…'));
  } else if (state.catalog) main.append(renderCreation());
  else main.append(section('新建外部评审', null, state.catalogError ? [
    element('p', { className: 'ext-error', role: 'alert' }, state.catalogError),
    button('重新读取目录', async () => { await loadCatalog(); render(); }),
  ] : element('p', { className: 'external-loading', role: 'status' }, '正在读取资料目录…')));
  app.replaceChildren(renderSidebar(), main);
}

async function loadCatalog() {
  const params = new URLSearchParams();
  if (context.document) params.set('document', context.document);
  if (context.case) params.set('case', context.case);
  state.catalogError = '';
  try {
    const catalog = await api(apiRoot + '/catalog' + (params.size ? '?' + params : ''));
    state.catalog = {
      documents: items(catalog.documents).sort((left, right) =>
        Number(Boolean(right.suggested)) - Number(Boolean(left.suggested)) ||
        collator.compare(left.title || left.path, right.title || right.path)),
      galleries: items(catalog.galleries),
      reviewOrigins: items(catalog.reviewOrigins),
      publishingBlocked: text(catalog.publishingBlocked),
      caseTitle: text(catalog.caseTitle),
    };
    const initial = state.catalog.documents.find((entry) => entry.path === context.document);
    if (initial && !state.seeded) {
      state.paths.add(initial.path);
      state.title = initial.title;
    }
    state.seeded = true;
  } catch (err) {
    state.catalogError = failed(err);
  }
}

async function refreshHistory() {
  try {
    const result = await api();
    state.reviews = items(result.reviews);
    state.listError = '';
  } catch (err) {
    state.listError = failed(err);
  }
}

async function refreshTrash() {
  if (trashBusy()) return;
  const request = {};
  state.trashRequest = request;
  state.trashError = '';
  updateSidebar();
  try {
    const { reviews } = await api(apiRoot + '/trash');
    if (state.trashRequest !== request) return;
    state.trashReviews = items(reviews);
    const remaining = new Set(state.trashReviews.map((review) => review.id));
    for (const id of state.purgeFailures.keys()) {
      if (!remaining.has(id)) state.purgeFailures.delete(id);
    }
  } catch (err) {
    if (state.trashRequest === request) state.trashError = failed(err);
  } finally {
    if (state.trashRequest === request) {
      state.trashRequest = null;
      updateSidebar();
    }
  }
}

async function moveRoundToTrash(round) {
  const { id } = await api(roundRoute(round.id) + '/trash', {});
  if (id !== round.id) throw new Error('无法确认轮次是否已移到废纸篓，请重新读取。');
  for (const invite of items(round.invites)) state.links.delete(invite.id);
  state.reviews = state.reviews.filter((entry) => entry.id !== id);
  const { title, createdAt, closedAt } = round;
  state.trashReviews = [{ id, title, createdAt, closedAt }, ...state.trashReviews.filter((entry) => entry.id !== id)];
  state.historyView = 'trash';
  state.restoreError = '';
  if (state.roundId === id) {
    state.roundId = '';
    state.roundRequest = null;
    state.round = null;
    state.roundError = '';
    updateRoundUrl('');
    render();
  } else updateSidebar();
  toast('已移到废纸篓。');
  state.trashRequest = null;
  void refreshTrash();
}

async function restoreRound(entry) {
  if (trashBusy()) return;
  state.restoringId = entry.id;
  state.restoreError = '';
  updateSidebar();
  try {
    const { review } = await api(roundRoute(entry.id) + '/restore', {});
    if (review?.id !== entry.id) throw new Error('无法确认轮次是否已恢复，请重新读取。');
    state.trashRequest = null;
    state.trashReviews = state.trashReviews.filter((item) => item.id !== entry.id);
    state.purgeFailures.delete(entry.id);
    state.reviews = [...state.reviews.filter((item) => item.id !== entry.id), review]
      .sort((left, right) => text(right.createdAt).localeCompare(text(left.createdAt)));
    toast('轮次已恢复为关闭状态。');
  } catch (err) {
    state.restoreError = failed(err);
  } finally {
    state.restoringId = null;
    updateSidebar();
  }
}

function confirmPurge(rounds, bulk = false) {
  if (trashBusy() || !rounds.length) return;
  const ids = rounds.map((round) => round.id);
  const subject = bulk ? '当前列出的 ' + ids.length + ' 轮评审' : '「' + rounds[0].title + '」';
  actionDialog(bulk ? '清空废纸篓？' : '永久删除这轮评审？',
    '将永久删除' + subject + '，包括共享快照、邀请和评审回执。此操作无法撤销。',
    bulk ? '清空废纸篓' : '永久删除', () => purgeRounds(ids), '正在永久删除…');
}

async function purgeRounds(ids) {
  if (trashBusy()) throw new Error('废纸篓正在处理其他操作，请稍后再试。');
  state.purgePending = true;
  updateSidebar();
  try {
    const { deletedIds, failures } = await api(apiRoot + '/trash/purge', { ids });
    if (!Array.isArray(deletedIds) || !Array.isArray(failures)) {
      throw new Error('删除回执不完整，请刷新废纸篓后核对。');
    }
    const requested = new Set(ids);
    const deleted = new Set(deletedIds.filter((id) => requested.has(id)));
    const errors = new Map(failures.map(({ id, message }) => [id, text(message)]));
    for (const id of ids) {
      if (deleted.has(id)) state.purgeFailures.delete(id);
      else state.purgeFailures.set(id, errors.get(id) || '仍待确认，请刷新废纸篓后重试。');
    }
    state.trashReviews = state.trashReviews.filter((round) => !deleted.has(round.id));
    state.reviews = state.reviews.filter((round) => !deleted.has(round.id));
    if (deleted.has(state.roundId)) {
      for (const invite of items(state.round?.invites)) state.links.delete(invite.id);
      state.roundId = '';
      state.roundRequest = null;
      state.round = null;
      state.roundError = '';
      updateRoundUrl('');
      render();
    }
    const remaining = ids.length - deleted.size;
    toast(remaining ? '永久删除 ' + deleted.size + ' 轮，' + remaining + ' 轮待处理。'
      : '已永久删除 ' + deleted.size + ' 轮评审。');
  } finally {
    state.purgePending = false;
    if (state.historyView === 'trash') void refreshTrash();
    else updateSidebar();
  }
}

async function openRound(id) {
  if (state.publishing) return;
  const pending = {};
  state.roundRequest = pending;
  state.roundId = id;
  state.historyView = 'history';
  state.previewing = null;
  state.round = null;
  state.roundError = '';
  updateRoundUrl(id);
  render();
  try {
    const { review } = await api(roundRoute(id));
    if (state.roundRequest !== pending) return;
    state.round = review;
    state.reviews = state.reviews.map((entry) => entry.id === id ? { ...entry, ...review } : entry);
  } catch (err) {
    if (state.roundRequest !== pending) return;
    state.roundError = failed(err);
  }
  render();
}

function sameSelection(preview) {
  return preview?.revision === state.revision && Boolean(preview.previewDigest);
}

function selectionBody() {
  return { paths: [...state.paths], attachments: [...state.attachments], galleries: [...state.galleries] };
}

function optionRow(item, checked, onChange, metadata, extra, disabled, documentPath) {
  const input = element('input', { type: 'checkbox', disabled, 'data-document-path': documentPath });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return element('div', { className: 'ext-option' },
    element('label', {},
      input, element('span', { className: 'ext-option-text' },
        element('strong', {}, item.title || item.path || item.id),
        metadata && element('span', { className: 'ext-meta' }, metadata))),
    extra);
}

function galleryPageCount(gallery) {
  return Number.isInteger(gallery.pages) ? gallery.pages :
    Array.isArray(gallery.pages) ? gallery.pages.length : gallery.pageCount;
}

function renderCreation() {
  const search = element('input', { type: 'search', placeholder: '搜索文档或图集', 'aria-label': '搜索文档或图集' });
  search.value = state.query;
  const library = element('div', { className: 'ext-library' });
  const candidates = element('div', { className: 'ext-candidates' });
  const pickedCount = element('span', { className: 'ext-meta', role: 'status' });
  const previewArea = element('div', { className: 'ext-preview' });
  const previewNotice = element('p', { className: 'ext-meta ext-inline-message', role: 'status' });
  const previewError = element('p', { className: 'ext-error ext-inline-message', role: 'alert' });
  const publishError = element('p', { className: 'ext-error ext-inline-message', role: 'alert' });
  const attachment = element('input', { type: 'text', placeholder: '例如 Notes/Docs/附件.pdf', 'aria-label': '附件路径' });
  attachment.value = state.attachmentInput;
  attachment.addEventListener('input', () => { state.attachmentInput = attachment.value; });
  const attachmentButton = button('添加附件', addAttachment);
  const selectionMessage = element('p', { className: 'ext-error ext-inline-message', role: 'alert' });
  const previewButton = button('生成预览', makePreview, {}, 'secondary');
  const fields = [
    ['评审名称', 'title', element('input', { type: 'text', maxlength: 200, required: true })],
    ['评审人', 'reviewer', element('input', { type: 'text', maxlength: 80, required: true })],
    ['有效期（小时）', 'expiresInHours', element('input', { type: 'number', min: 1, max: 720, step: 1, required: true })],
  ];
  for (const [, name, field] of fields) {
    field.value = state[name];
    field.addEventListener('input', () => { state[name] = field.value; });
  }
  const submit = element('button', { type: 'submit', className: 'ext-button primary' }, '创建评审并生成邀请');
  const form = element('form', { className: 'ext-create-form', onSubmit: publish },
    element('div', { className: 'ext-fields' }, fields.map(([name, , field]) => label(name, field))),
    state.catalog.publishingBlocked && element('p', { className: 'ext-error', role: 'status' }, state.catalog.publishingBlocked),
    publishError, element('div', { className: 'ext-actions' }, submit));

  function updateControls() {
    const busy = Boolean(state.publishing);
    const ready = sameSelection(state.preview);
    pickedCount.textContent = `${state.paths.size} 份文档 · ${state.attachments.size} 个附件 · ${state.galleries.size} 个图集`;
    submit.disabled = busy || !ready || Boolean(state.previewing || state.catalog.publishingBlocked);
    submit.textContent = busy ? '正在创建…' : '创建评审并生成邀请';
    previewButton.disabled = busy || state.paths.size === 0 || Boolean(state.previewing);
    previewButton.textContent = state.previewing ? '正在生成…' : ready ? '重新预览' : '生成预览';
    form.setAttribute('aria-busy', String(busy));
    previewArea.setAttribute('aria-busy', String(Boolean(state.previewing)));
    for (const input of [search, attachment, attachmentButton, ...fields.map(([, , field]) => field),
      ...library.querySelectorAll('input'), ...candidates.querySelectorAll('input, button')]) input.disabled = busy;
  }

  function changeChoice(set, key, selected) {
    if (state.publishing || set.has(key) === selected) return;
    if (selected) set.add(key);
    else set.delete(key);
    if (set === state.paths) {
      for (const input of [...library.querySelectorAll('input[data-document-path]'), ...candidates.querySelectorAll('input[data-document-path]')]) {
        if (input.dataset.documentPath === key) input.checked = selected;
      }
    }
    state.revision += 1;
    state.previewing = null;
    previewError.textContent = '';
    publishError.textContent = '';
    renderPreviewArea();
    updateControls();
  }

  function renderLibrary() {
    const term = state.query.trim().toLocaleLowerCase();
    const matches = (entry) => [entry.path, entry.id, entry.title].filter(Boolean).join(' ').toLocaleLowerCase().includes(term);
    const docs = state.catalog.documents.filter(matches);
    const galleries = state.catalog.galleries.filter(matches);
    library.replaceChildren(
      element('div', { className: 'ext-library-group' }, element('h3', {}, 'Markdown 文档'),
        docs.length ? element('div', { className: 'ext-option-list' }, docs.map((entry) => optionRow(entry,
          state.paths.has(entry.path), (checked) => changeChoice(state.paths, entry.path, checked), entry.path,
          entry.suggested && status('Case 关联'), state.publishing, entry.path))) : blank('没有匹配的文档。')),
      element('div', { className: 'ext-library-group' }, element('h3', {}, '图集'),
        galleries.length ? element('div', { className: 'ext-option-list' }, galleries.map((entry) => {
          const href = internalHref(entry.href);
          return optionRow(entry, state.galleries.has(entry.id), (checked) => changeChoice(state.galleries, entry.id, checked),
            ordinal(galleryPageCount(entry), ' 页'), href && element('a', {
              href, target: '_blank', rel: 'noopener noreferrer', className: 'ext-text-link',
            }, '查看图集'), state.publishing);
        })) : blank('没有匹配的图集。')),
    );
  }

  function renderCandidates() {
    const previewDocs = items(state.preview?.relatedDocuments);
    const previewAssets = items(state.preview?.assets);
    const explicitAssets = [...state.attachments].filter((path) => !previewAssets.some((asset) => asset.path === path));
    candidates.replaceChildren(element('div', { className: 'ext-attachment-list' }, [
      previewAssets.map((entry) => optionRow(entry,
        state.attachments.has(entry.path), (checked) => changeChoice(state.attachments, entry.path, checked),
        entry.path, null, state.publishing)),
      explicitAssets.map((path) => optionRow({ path }, true,
        (checked) => changeChoice(state.attachments, path, checked), null, null, state.publishing)),
    ]));
    if (previewDocs.length) candidates.append(
      element('div', { className: 'ext-library-group ext-related' },
        element('h3', {}, '建议纳入的关联文档'),
        element('div', { className: 'ext-option-list' }, previewDocs.map((entry) => optionRow(entry,
          state.paths.has(entry.path), (checked) => changeChoice(state.paths, entry.path, checked),
          entry.path, null, state.publishing, entry.path)))));
  }

  function addAttachment() {
    if (state.publishing) return;
    const path = attachment.value.trim();
    if (!path) {
      selectionMessage.textContent = '请输入 Obsidian 资料库中的附件相对路径。';
      attachment.focus();
      return;
    }
    selectionMessage.textContent = '';
    attachment.value = '';
    state.attachmentInput = '';
    changeChoice(state.attachments, path, true);
    renderCandidates();
    updateControls();
  }

  function renderPreviewArea() {
    const valid = sameSelection(state.preview);
    previewNotice.textContent = state.previewing ? '正在生成对外预览…' :
      valid ? '预览对应当前勾选内容。' : state.preview ? '请重新生成预览。' : '检查对外内容后即可生成邀请。';
    previewArea.replaceChildren();
    if (valid) previewArea.append(publication(state.preview));
  }

  async function makePreview() {
    if (previewButton.disabled) return;
    const request = { revision: state.revision };
    state.previewing = request;
    previewError.textContent = '';
    publishError.textContent = '';
    renderPreviewArea();
    updateControls();
    try {
      const result = await api(apiRoot + '/preview', selectionBody());
      if (state.previewing !== request || state.revision !== request.revision) return;
      if (!text(result.previewDigest) || !Array.isArray(result.documents)) throw new Error('预览数据不完整，请重新预览。');
      state.preview = { ...result, revision: request.revision };
      renderCandidates();
    } catch (err) {
      if (state.previewing !== request) return;
      if (state.preview) state.preview.revision = -1;
      previewError.textContent = failed(err);
    } finally {
      if (state.previewing === request) {
        state.previewing = null;
        renderPreviewArea();
        updateControls();
      }
    }
  }

  async function publish(event) {
    event.preventDefault();
    if (submit.disabled || !sameSelection(state.preview)) return;
    const title = state.title.trim();
    const reviewer = state.reviewer.trim();
    if (!title || !reviewer) {
      publishError.textContent = '请填写评审名称和评审人。';
      return;
    }
    const payload = { title, reviewer, expiresInHours: Number(state.expiresInHours),
      ...selectionBody(), previewDigest: state.preview.previewDigest };
    state.publishing = true;
    publishError.textContent = '';
    updateControls();
    let created;
    try {
      created = await api(apiRoot, payload);
      if (!created.review?.id || !created.invite?.id) throw new Error('创建回执不完整，请先检查历史轮次。');
      state.round = created.review;
      state.roundId = created.review.id;
      state.historyView = 'history';
      state.roundError = '';
      if (created.invite.url) state.links.set(created.invite.id, created.invite);
      state.reviews = [created.review, ...state.reviews.filter((review) => review.id !== created.review.id)];
      state.paths.clear();
      state.attachments.clear();
      state.attachmentInput = '';
      state.galleries.clear();
      state.preview = null;
      state.revision += 1;
      state.title = '';
      state.reviewer = '';
      state.query = '';
      state.expiresInHours = '72';
      updateRoundUrl(state.roundId);
    } catch (err) {
      created = null;
      if (err.code === 'preview_changed') {
        state.preview.revision = -1;
        renderPreviewArea();
      }
      publishError.textContent = failed(err);
    } finally {
      state.publishing = false;
      updateControls();
    }
    if (created) {
      render();
      showInvitation(created.invite);
    }
  }

  search.addEventListener('input', () => {
    state.query = search.value;
    renderLibrary();
  });
  attachment.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); addAttachment(); }
  });
  renderLibrary();
  renderCandidates();
  renderPreviewArea();
  updateControls();

  return element('div', { className: 'ext-content' },
    element('header', { className: 'ext-heading' }, element('h1', {}, '新建外部评审'),
      element('p', { className: 'ext-meta' }, '选择至少一份 Markdown 文档，可附带附件和图集。'),
      context.case && element('p', { className: 'ext-meta ext-context' }, '来源 Case · ' + (state.catalog.caseTitle || context.case)),
      context.document && !state.catalog.documents.some((entry) => entry.path === context.document) &&
        element('p', { className: 'ext-error' }, '入口文档不在当前可分享目录中。')),
    section('选择资料', pickedCount, [
      search, library,
      element('div', { className: 'ext-library-group ext-attachments' },
        element('h3', {}, '附件'),
        element('div', { className: 'ext-attachment-input' }, attachment, attachmentButton),
        selectionMessage, candidates),
    ]),
    section('对外预览', null, [
      previewNotice, previewError, element('div', { className: 'ext-actions' }, previewButton), previewArea,
    ]),
    section('生成邀请', null, form));
}

function documentSnapshot(entry, index) {
  const blocks = items(entry.blocks);
  return element('details', { className: 'ext-disclosure ext-snapshot', open: index === 0 },
    element('summary', {},
      element('span', {}, entry.title || entry.path),
      element('span', { className: 'ext-meta' }, ordinal(blocks.length, ' 段'))),
    element('div', { className: 'ext-disclosure-body' },
      entry.path && element('p', { className: 'ext-meta ext-path' }, entry.path),
      blocks.length ? element('div', { className: 'ext-snapshot-text' },
        blocks.map((block) => text(block.text).trim() && element('p', {}, block.text))) :
        blank('此文档没有可预览的正文。')));
}

function publication(preview) {
  const documents = items(preview.documents);
  const assets = items(preview.assets).filter((asset) => asset.selected === true);
  const galleries = items(preview.galleries);
  const issues = items(preview.issues);
  return element('div', { className: 'ext-publication' },
    element('p', { className: 'ext-publication-title' },
      '将共享 ' + documents.length + ' 份文档 · ' + assets.length + ' 个附件 · ' + galleries.length + ' 个图集'),
    documents.map(documentSnapshot),
    assets.length > 0 && element('div', { className: 'ext-publication-group' },
      element('h3', {}, '附件'), element('ul', {}, assets.map((asset) =>
        element('li', {}, element('strong', {}, asset.title || asset.path),
          asset.path && element('span', { className: 'ext-meta ext-path' }, asset.path))))),
    galleries.length > 0 && element('div', { className: 'ext-publication-group' },
      element('h3', {}, '图集'), galleries.map((gallery) => element('details', { className: 'ext-disclosure' },
        element('summary', {}, element('span', {}, gallery.title || gallery.id),
          element('span', { className: 'ext-meta' }, ordinal(galleryPageCount(gallery), ' 页'))),
        items(gallery.pages).length > 0 && element('ul', { className: 'ext-disclosure-body' },
          gallery.pages.map((page) => element('li', {}, page.title || page.path || text(page))))))),
    issues.length > 0 && element('details', { className: 'ext-disclosure ext-issues' },
      element('summary', {}, `${issues.length} 条引用未纳入`),
      element('ul', { className: 'ext-disclosure-body' }, issues.map((issue) =>
        element('li', {}, [issue.target, issue.reason, issue.source].filter(Boolean).join(' · '))))));
}

function loopback(hostname) {
  return /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(hostname);
}

function originsForInvitation(invite) {
  if (/^https?:\/\//i.test(invite.url || '')) return [];
  const available = [invite.publicOrigin, ...items(state.catalog?.reviewOrigins)].flatMap((entry) => {
    try {
      const url = new URL(entry);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? [url.origin] : [];
    } catch {
      return [];
    }
  });
  if (!loopback(location.hostname)) available.unshift(location.origin);
  return [...new Set(available.length ? available : [location.origin])];
}

async function copyLink(input) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(input.value);
      toast('邀请链接已复制。');
      return;
    } catch {
      // Local HTTP may not offer the asynchronous clipboard.
    }
  }
  input.focus();
  input.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  toast(copied ? '邀请链接已复制。' : '链接已选中，请手动复制。');
}

function showInvitation(invite) {
  const origins = originsForInvitation(invite);
  const url = fullInviteUrl({ ...invite, publicOrigin: origins[0] });
  if (!url) {
    setupDialog('邀请已生成', element('div', {},
      element('p', { className: 'ext-error', role: 'alert' }, '邀请链接没有随回执返回。请检查轮次后重新生成邀请。'),
      element('div', { className: 'ext-dialog-actions' }, button('完成', () => dialog.close()))));
    return;
  }
  const link = element('input', { type: 'url', value: url, readonly: true });
  const warning = element('p', { className: 'ext-meta ext-inline-message' });
  const originPicker = origins.length > 1 && element('select', { 'aria-label': '评审访问地址' },
    origins.map((origin) => element('option', { value: origin }, origin)));
  function updateWarning() {
    warning.textContent = loopback(new URL(link.value).hostname) ? '此链接只能在本机打开。' : '';
  }
  if (originPicker) originPicker.addEventListener('change', () => {
    link.value = fullInviteUrl({ ...invite, publicOrigin: originPicker.value });
    updateWarning();
  });
  updateWarning();
  setupDialog('邀请已生成', element('div', { className: 'ext-dialog-form' },
    element('p', { className: 'ext-meta' }, invite.reviewer + ' · 有效期至 ' + date(invite.expiresAt)),
    originPicker && label('评审访问地址', originPicker),
    label('邀请链接', link), warning,
    element('div', { className: 'ext-dialog-actions' }, button('完成', () => dialog.close()),
      button('复制邀请链接', () => copyLink(link), {}, 'primary'))));
  link.focus();
  link.select();
}

function actionDialog(title, summary, actionName, operation, pendingLabel) {
  const error = element('p', { className: 'ext-error ext-inline-message', role: 'alert' });
  const cancel = button('取消', () => dialog.close());
  const preventCancel = (event) => event.preventDefault();
  const act = button(actionName, async () => {
    if (act.disabled) return;
    act.disabled = true;
    error.textContent = '';
    const closeButton = pendingLabel && dialog.querySelector('.ext-dialog-heading button');
    if (pendingLabel) {
      act.textContent = pendingLabel;
      cancel.disabled = true;
      closeButton.disabled = true;
      dialog.addEventListener('cancel', preventCancel);
    }
    try {
      await operation();
      if (dialog.contains(act)) dialog.close();
    } catch (err) {
      error.textContent = failed(err);
    } finally {
      act.disabled = false;
      if (pendingLabel) {
        act.textContent = actionName;
        cancel.disabled = false;
        closeButton.disabled = false;
        dialog.removeEventListener('cancel', preventCancel);
      }
    }
  }, pendingLabel ? { 'aria-live': 'polite' } : {}, 'danger');
  setupDialog(title, element('div', {}, element('p', {}, summary), error,
    element('div', { className: 'ext-dialog-actions' }, cancel, act)));
}

function adoptRound(review) {
  if (state.roundId === review.id) state.round = review;
  state.reviews = state.reviews.map((entry) => entry.id === review.id ? { ...entry, ...review } : entry);
  render();
}

function inviteMore(round) {
  const reviewer = element('input', { type: 'text', required: true, maxlength: 80 });
  const hours = element('input', { type: 'number', required: true, min: 1, max: 720, step: 1, value: '72' });
  const err = element('p', { className: 'ext-error ext-inline-message', role: 'alert' });
  const submit = element('button', { type: 'submit', className: 'ext-button primary' }, '生成邀请');
  const form = element('form', { className: 'ext-dialog-form' }, label('评审人', reviewer),
    label('有效期（小时）', hours), err,
    element('div', { className: 'ext-dialog-actions' }, button('取消', () => dialog.close()), submit));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    if (!reviewer.value.trim()) {
      err.textContent = '请填写评审人。';
      return;
    }
    submit.disabled = true;
    err.textContent = '';
    try {
      const { invite } = await api(roundRoute(round.id) + '/invites',
        { reviewer: reviewer.value.trim(), expiresInHours: Number(hours.value) });
      if (!invite?.id) throw new Error('邀请回执不完整，请检查该轮评审。');
      if (invite.url) state.links.set(invite.id, invite);
      adoptRound({ ...round, invites: [...items(round.invites), invite] });
      showInvitation(invite);
    } catch (error) {
      err.textContent = failed(error);
    } finally {
      submit.disabled = false;
    }
  });
  setupDialog('添加邀请', form);
  reviewer.focus();
}

function renderInvites(round) {
  const publicationBlocked = state.catalog?.publishingBlocked;
  const invites = items(round.invites);
  const rows = invites.map((invite) => {
    const expired = Date.parse(invite.expiresAt) <= Date.now();
    const live = !round.closedAt && !invite.revokedAt && !expired;
    const savedLink = state.links.get(invite.id);
    const stateLabel = invite.revokedAt ? '已撤销' : expired ? '已过期' : round.closedAt ? '轮次已关闭' : '有效';
    return element('li', {},
      element('div', {}, element('strong', {}, invite.reviewer),
        element('p', { className: 'ext-meta' }, '有效期至 ' + date(invite.expiresAt))),
      element('div', { className: 'ext-item-actions' }, status(stateLabel, live ? 'live' : ''),
        live && savedLink && button('查看链接', () => showInvitation(savedLink)),
        live && button('撤销', () => actionDialog('撤销邀请？',
          '撤销后，这条链接将无法打开共享资料或提交反馈。', '撤销邀请', async () => {
            const { review } = await api(roundRoute(round.id) + '/invites/' + encodeURIComponent(invite.id) + '/revoke', {});
            state.links.delete(invite.id);
            adoptRound(review);
          }), {}, 'text')));
  });
  return section('邀请', !round.closedAt && button('添加邀请', () => inviteMore(round), { disabled: Boolean(publicationBlocked) }),
    [
      !round.closedAt && publicationBlocked && element('p', { className: 'ext-error' }, publicationBlocked),
      rows.length ? element('ul', { className: 'ext-invites' }, rows) : blank('本轮还没有邀请。'),
    ]);
}

function feedbackItem(entry, documents) {
  const document = documents.find((item) => item.id === entry.documentId);
  return element('li', { className: 'ext-feedback-item' },
    element('div', { className: 'ext-item-header' },
      status(itemNames[entry.kind] || '反馈'),
      entry.required && status('必改', 'attention'),
      (document || entry.documentTitle || entry.galleryTitle) &&
        element('span', { className: 'ext-meta' }, document?.title || entry.documentTitle || entry.galleryTitle)),
    entry.quote && element('blockquote', {}, entry.quote),
    entry.comment && element('p', {}, entry.comment),
    entry.replacement && element('div', {},
      element('span', { className: 'ext-meta' }, '建议修改为'), element('p', {}, entry.replacement)));
}

function renderFeedback(round) {
  const submissions = [...items(round.submissions)].sort((left, right) =>
    String(right.submittedAt).localeCompare(String(left.submittedAt)));
  const documents = items(round.documents);
  const detailHref = '/review/?round=' + encodeURIComponent(round.id);
  return section('结论与反馈', element('span', { className: 'ext-meta' }, submissions.length + ' 份提交'),
    submissions.length ? [
      element('ul', { className: 'ext-receipts' }, submissions.map((receipt) => element('li', {},
        element('div', { className: 'ext-receipt-heading' },
          element('div', {}, element('strong', {}, receipt.reviewer || '评审人'),
            element('p', { className: 'ext-meta' }, date(receipt.submittedAt))),
          status(decisionNames[receipt.decision] || text(receipt.decision) || '已提交',
            receipt.decision === 'changes' ? 'attention' : '')),
        receipt.summary && element('p', { className: 'ext-receipt-summary' }, receipt.summary),
        items(receipt.items).length > 0 && element('ul', { className: 'ext-feedback-list' },
          receipt.items.map((entry) => feedbackItem(entry, documents)))))),
      element('div', { className: 'ext-actions' }, element('a', {
        href: detailHref, className: 'ext-button secondary',
      }, '打开评审收件箱')),
    ] : blank('等待评审人提交。'));
}

function renderRound(round) {
  const assetList = items(round.assets).map((asset) => ({ ...asset, selected: true }));
  return element('div', { className: 'ext-content' },
    element('header', { className: 'ext-heading ext-round-heading' },
      element('div', {}, element('h1', {}, round.title),
        element('p', { className: 'ext-meta' }, '创建于 ' + date(round.createdAt) +
          (round.closedAt ? ' · 关闭于 ' + date(round.closedAt) : ''))),
      element('div', { className: 'ext-item-actions' },
        status(round.closedAt ? '已关闭' : '开放', round.closedAt ? '' : 'live'),
        !round.closedAt && button('关闭评审', () => actionDialog('关闭这轮评审？',
          '关闭后，本轮所有邀请将无法打开共享资料或提交反馈。', '关闭评审', async () => {
            const { review } = await api(roundRoute(round.id) + '/close', {});
            adoptRound(review);
          })),
        button('移到废纸篓', () => actionDialog('把这轮评审移到废纸篓？',
          '原有邀请会立即失效，评审人将无法打开资料或提交反馈。恢复时轮次保持关闭，原有邀请仍然失效。',
          '移到废纸篓', () => moveRoundToTrash(round)), {}, 'trash-action'))),
    renderInvites(round),
    renderFeedback(round),
    section('已纳入的资料', null, publication({ documents: round.documents, assets: assetList, galleries: round.galleries })));
}

async function start() {
  await Promise.all([loadCatalog(), refreshHistory()]);
  if (state.roundId) await openRound(state.roundId);
  else render();
}

start();
