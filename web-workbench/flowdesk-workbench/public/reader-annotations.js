'use strict';

(() => {
  const feedbackNames = { highlight: '高亮', comment: '批注', suggestion: '建议改文' };
  const maximumText = 20000;
  const maximumItems = 250;
  const openPanels = new Set();
  let resetVisibleBatch;
  const sourceSelector = '[data-source-line]';
  const ownUi = '[data-reader-feedback-ui]';

  function element(tag, className, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const child of children) if (child != null) node.append(child);
    return node;
  }

  function button(label, action, className = 'reader-feedback-tool') {
    const node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }

  function newDraft() {
    return { id: newId(), items: [], saved: false };
  }

  function readDraft(storage, key) {
    try {
      const value = JSON.parse(window[storage].getItem(key));
      if (typeof value?.id === 'string' && Array.isArray(value.items) && value.items.every(item =>
        typeof item.id === 'string' && typeof item.quote === 'string' && Object.hasOwn(feedbackNames, item.kind))) {
        return value;
      }
    } catch { /* 浏览器可能禁止存储。 */ }
    return null;
  }

  function normalizeText(text) {
    return text.replace(/\s+/gu, ' ').trim();
  }

  function positions(text, quote) {
    if (!quote) return [];
    const first = text.indexOf(quote);
    if (first < 0) return [];
    const hits = [first];
    for (let next = text.indexOf(quote, first + 1); next >= 0; next = text.indexOf(quote, next + 1)) hits.push(next);
    return hits;
  }

  function sourceQuote(block, sample, useContext) {
    const exact = positions(block.text, sample.quote);
    if (exact.length === 1) return { text: block.text, start: exact[0], quote: sample.quote, offset: exact[0] };
    if (exact.length > 1 && useContext) {
      const prefix = normalizeText(sample.prefix).slice(-16);
      const suffix = normalizeText(sample.suffix).slice(0, 16);
      if (!prefix && !suffix) return null;
      const matches = exact.filter(index =>
        (!prefix || normalizeText(block.text.slice(0, index)).endsWith(prefix)) &&
        (!suffix || normalizeText(block.text.slice(index + sample.quote.length)).startsWith(suffix)));
      if (matches.length === 1) return { text: block.text, start: matches[0], quote: sample.quote, offset: matches[0] };
    }
    const text = normalizeText(block.text);
    const quote = normalizeText(sample.quote);
    const normalized = positions(text, quote);
    return normalized.length === 1 ? { text, start: normalized[0], quote } : null;
  }

  function textNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest(ownUi) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function paragraphOf(node) {
    const origin = node instanceof Element ? node : node?.parentElement;
    return origin?.closest(sourceSelector);
  }

  function lineOf(paragraph) {
    const line = Number(paragraph?.dataset.sourceLine);
    return Number.isInteger(line) && line > 0 ? line : null;
  }

  function sampleQuote(quote, paragraph, endParagraph = paragraph, offset = 0) {
    const text = paragraph ? paragraph.textContent : '';
    const selected = quote.trim().slice(0, maximumText);
    return {
      quote: selected,
      line: lineOf(paragraph),
      endLine: lineOf(endParagraph),
      displayOffset: paragraph === endParagraph ? offset : null,
      prefix: text.slice(Math.max(0, offset - 64), offset),
      suffix: text.slice(offset + selected.length, offset + selected.length + 64),
    };
  }

  function locateBlock(entry, sample) {
    const hasLine = sample.line !== null || sample.endLine !== null;
    const contains = (block, line) => line === null || (block.lineStart <= line && block.lineEnd >= line);
    const blocks = hasLine
      ? entry.blocks.filter(block => contains(block, sample.line) && contains(block, sample.endLine))
      : entry.blocks;
    const candidates = blocks.flatMap(block => {
      const match = sourceQuote(block, sample, hasLine);
      return match ? [{ block, match }] : [];
    });
    if (candidates.length !== 1) {
      throw new Error('无法唯一定位原句，请缩小选区后再试。');
    }
    return candidates[0];
  }

  function textRange(paragraph, item) {
    const nodes = textNodes(paragraph);
    const text = nodes.map(node => node.data).join('');
    let start = item.displayOffset;
    if (!Number.isInteger(start) || text.slice(start, start + item.quote.length) !== item.quote) {
      const hits = positions(text, item.quote);
      if (hits.length !== 1) return null;
      [start] = hits;
    }
    return { paragraph, nodes, start, end: start + item.quote.length };
  }

  function locateInReader(content, item, sha256) {
    if (item.sourceSha256 !== sha256) return null;
    const matching = [...content.querySelectorAll(sourceSelector)].filter(node => {
      const line = lineOf(node);
      return item.line && item.line === item.endLine ? line === item.line : item.sourceStart <= line && line <= item.sourceEnd;
    }).flatMap(node => {
      const range = textRange(node, item);
      return range ? [range] : [];
    });
    const innermost = matching.filter(candidate => !matching.some(other =>
      candidate !== other && candidate.paragraph.contains(other.paragraph)));
    return innermost.length === 1 ? innermost[0] : null;
  }

  function clearMarks(content) {
    const parents = new Set();
    for (const mark of content.querySelectorAll('mark.reader-feedback-mark')) {
      parents.add(mark.parentNode);
      mark.replaceWith(...mark.childNodes);
    }
    for (const parent of parents) parent?.normalize();
  }

  function markItems(content, items, sha256) {
    clearMarks(content);
    const marks = new Map();
    for (const item of items) {
      const range = locateInReader(content, item, sha256);
      if (!range) continue;
      let offset = 0;
      for (const node of range.nodes) {
        const start = Math.max(0, range.start - offset);
        const end = Math.min(node.length, range.end - offset);
        if (end > start) {
          if (!marks.has(node)) marks.set(node, []);
          marks.get(node).push({ start, end, kind: item.kind });
        }
        offset += node.length;
      }
    }
    for (const [node, spans] of marks) {
      const boundaries = [...new Set([0, node.length, ...spans.flatMap(span => [span.start, span.end])])].sort((a, b) => a - b);
      const fragment = document.createDocumentFragment();
      for (let index = 1; index < boundaries.length; index++) {
        const start = boundaries[index - 1];
        const end = boundaries[index];
        const text = node.data.slice(start, end);
        const touching = spans.filter(span => span.start <= start && span.end >= end);
        const kind = ['suggestion', 'comment', 'highlight'].find(value => touching.some(span => span.kind === value));
        if (kind) {
          const mark = element('mark', 'reader-feedback-mark', text);
          mark.dataset.kind = kind;
          fragment.append(mark);
        } else fragment.append(text);
      }
      node.replaceWith(fragment);
    }
  }

  function renderDiff(container, before, after) {
    let start = 0;
    let end = 0;
    const limit = Math.min(before.length, after.length);
    while (start < limit && before[start] === after[start]) start++;
    while (end < limit - start && before[before.length - end - 1] === after[after.length - end - 1]) end++;
    const removed = before.slice(start, before.length - end);
    const inserted = after.slice(start, after.length - end);
    container.replaceChildren(before.slice(0, start));
    if (removed) container.append(element('del', '', removed));
    if (inserted) container.append(element('ins', '', inserted));
    if (end) container.append(before.slice(-end));
  }

  function placePopup(popup, rect) {
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    const center = rect.left + rect.width / 2;
    popup.style.left = Math.max(8, Math.min(center - width / 2, innerWidth - width - 8)) + 'px';
    popup.style.top = Math.max(8, Math.min(rect.top > height + 12 ? rect.top - height - 7 : rect.bottom + 8, innerHeight - height - 8)) + 'px';
  }

  function attach({ content, itemPath, sourceSha256, host }) {
    if (!content || !host || typeof itemPath !== 'string' || !/^[0-9a-f]{64}$/u.test(sourceSha256)) return () => {};

    const controller = new AbortController();
    const key = 'flowdesk-reader-draft:' + itemPath;
    const storedDraft = readDraft('localStorage', key);
    let { pendingEditor, ...draft } = readDraft('sessionStorage', key) || storedDraft || newDraft();
    let savedToBrowser = draft.id === storedDraft?.id;
    let review;
    let reviewedDocument;
    let loadingReview;
    let popup;
    let editor;
    let busy = false;
    let info = '';
    let hasError = false;

    const badge = element('span', 'reader-feedback-count');
    badge.setAttribute('aria-hidden', 'true');
    const icon = element('span', 'reader-feedback-icon');
    icon.setAttribute('aria-hidden', 'true');
    const toggle = button('', () => setPanel(panel.hidden), 'reader-feedback-toggle');
    toggle.append(icon, badge);
    toggle.dataset.readerFeedbackUi = '';
    toggle.setAttribute('aria-controls', 'reader-feedback-panel');
    toggle.title = '本次批注';

    const status = element('p', 'reader-feedback-status');
    status.setAttribute('role', 'status');
    const itemsList = element('ul', 'reader-feedback-list');
    const empty = element('p', 'reader-feedback-empty', '划选正文添加高亮、批注或改文建议。');
    const clear = button('清空', clearDraft, 'button reader-feedback-clear');
    const save = button('保存草稿', saveDraft, 'button reader-feedback-save');
    const send = button('发送本次反馈', sendDraft, 'reader-feedback-send button primary');
    const close = button('关闭', () => setPanel(false, true), 'reader-feedback-close button');
    const header = element('div', 'reader-feedback-header', element('h2', '', '本次批注'), close);
    const panel = element('aside', 'reader-feedback-panel', header,
      element('div', 'reader-feedback-body', status, empty, itemsList),
      element('div', 'reader-feedback-footer', clear, save, send));
    panel.id = 'reader-feedback-panel';
    panel.dataset.readerFeedbackUi = '';
    panel.setAttribute('aria-label', '本次批注');
    host.append(toggle, panel);

    function setPanel(open, restoreFocus = false) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) openPanels.add(itemPath);
      else openPanels.delete(itemPath);
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }

    function persistSession() {
      try {
        if (draft.items.length || pendingEditor) sessionStorage.setItem(key, JSON.stringify({ ...draft, pendingEditor }));
        else sessionStorage.removeItem(key);
      } catch {
        // The in-memory copy remains available until a successful send.
      }
    }

    function persist(saveToBrowser = false) {
      persistSession();
      const value = draft.items.length ? JSON.stringify(draft) : null;
      try {
        const previous = readDraft('localStorage', key);
        if (saveToBrowser || previous?.id === draft.id) {
          if (value) localStorage.setItem(key, value);
          else localStorage.removeItem(key);
          savedToBrowser = Boolean(value);
        } else {
          savedToBrowser = false;
        }
      } catch {
        savedToBrowser = false;
      }
      return savedToBrowser;
    }

    function tell(text, error = false) {
      info = text;
      hasError = error;
      drawPanel();
      if (error) setPanel(true);
    }

    function drawPanel() {
      const count = draft.items.length;
      badge.textContent = String(count);
      badge.hidden = !count;
      toggle.setAttribute('aria-label', count ? '本次批注，' + count + ' 条' : '本次批注');
      empty.hidden = Boolean(count);
      status.textContent = info || (draft.saved ? '反馈已保存为回执，可继续查看发送状态。'
        : draft.items.some(item => item.sourceSha256 !== sourceSha256) ? '正文已更新，草稿保留原句。'
        : savedToBrowser ? '草稿已保存在此浏览器，可关页后继续。'
        : count ? '当前标签页自动保留草稿。' : '');
      status.hidden = !status.textContent;
      status.dataset.error = String(hasError);
      itemsList.replaceChildren(...draft.items.map(item => {
        const anchor = locateInReader(content, item, sourceSha256);
        const jump = button('定位', () => {
          const current = locateInReader(content, item, sourceSha256);
          if (!current) return;
          for (let details = current.paragraph.closest('details'); details;
            details = details.parentElement?.closest('details')) details.open = true;
          if (matchMedia('(max-width: 540px)').matches) setPanel(false);
          current.paragraph.scrollIntoView({ block: 'center' });
        });
        jump.disabled = !anchor;
        const edit = button('编辑', () => {
          const current = locateInReader(content, item, sourceSha256);
          if (current) openEditor(item, current.paragraph);
        });
        edit.disabled = !anchor || draft.saved || busy || Boolean(editor);
        const remove = button('删除', () => {
          if (draft.saved || busy) return;
          const index = draft.items.indexOf(item);
          draft.items = draft.items.filter(entry => entry.id !== item.id);
          info = '已删除这条反馈。';
          hasError = false;
          updateDraft();
          const next = itemsList.children[Math.min(index, itemsList.children.length - 1)];
          (next?.querySelector('.reader-feedback-delete') || close).focus({ preventScroll: true });
        }, 'reader-feedback-tool reader-feedback-delete');
        remove.disabled = draft.saved || busy || Boolean(editor);
        return element('li', 'reader-feedback-item',
          element('div', 'reader-feedback-item-head', element('strong', 'reader-feedback-kind', feedbackNames[item.kind]), jump),
          element('blockquote', 'reader-feedback-quote', item.quote),
          item.comment ? element('p', 'reader-feedback-note', item.comment) : null,
          item.kind === 'suggestion' ? element('p', 'reader-feedback-change', item.replacement || '删除所选文字') : null,
          !draft.saved ? element('div', 'reader-feedback-item-actions', edit, remove) : null);
      }));
      clear.hidden = save.hidden = draft.saved;
      clear.disabled = save.disabled = !count || busy || Boolean(editor);
      send.disabled = !count || busy || Boolean(editor);
      send.textContent = busy ? '正在准备…' : draft.saved ? '继续发送' : '发送本次反馈';
    }

    function updateDraft() {
      persist();
      markItems(content, draft.items, sourceSha256);
      drawPanel();
    }

    function saveDraft() {
      if (!draft.items.length || draft.saved || busy || editor) return;
      if (persist(true)) tell('草稿已保存在此浏览器，可关页后继续。');
      else tell('浏览器无法长期保存草稿。', true);
    }

    function clearDraft() {
      if (!draft.items.length || draft.saved || busy || editor) return;
      draft.items = [];
      persist();
      draft = newDraft();
      markItems(content, draft.items, sourceSha256);
      tell('已清空本次草稿。');
      close.focus({ preventScroll: true });
    }

    async function getReview() {
      if (review) return review;
      if (!loadingReview) {
        loadingReview = (async () => {
          const response = await fetch('/api/admin/direct-reviews/open', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: itemPath }), signal: controller.signal,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || '暂时无法读取批注来源。');
          const document = data.review?.documents.find(entry => entry.path === itemPath);
          if (!document?.sha256 || !Array.isArray(document.blocks)) throw new Error('暂时无法读取文档正文。');
          reviewedDocument = document;
          review = data.review;
          return review;
        })().finally(() => { loadingReview = null; });
      }
      return loadingReview;
    }

    async function startFeedback(sample, paragraph, kind) {
      if (busy || editor || draft.saved || !sample.quote) return;
      if (draft.items.length >= maximumItems) return tell('本次批注最多支持 250 条反馈。', true);
      busy = true;
      try {
        await getReview();
        if (controller.signal.aborted) return;
        if (reviewedDocument.sha256 !== sourceSha256) throw new Error('正文已更新，请刷新后再添加反馈。');
        const { block, match } = locateBlock(reviewedDocument, sample);
        const item = {
          id: newId(), kind, documentId: reviewedDocument.id, blockId: block.id, quote: sample.quote,
          comment: '', sourceSha256, offset: match.offset,
          prefix: match.text.slice(Math.max(0, match.start - 64), match.start),
          suffix: match.text.slice(match.start + match.quote.length, match.start + match.quote.length + 64),
          line: sample.line, endLine: sample.endLine, displayOffset: sample.displayOffset,
          sourceStart: block.lineStart, sourceEnd: block.lineEnd,
        };
        if (kind === 'highlight') saveItem(item);
        else openEditor(item, paragraph);
      } catch (error) {
        if (!controller.signal.aborted) tell(error.message, true);
      } finally {
        busy = false;
        if (!controller.signal.aborted) drawPanel();
      }
    }

    function saveItem(item) {
      const index = draft.items.findIndex(entry => entry.id === item.id);
      if (index < 0) draft.items.push(item);
      else draft.items[index] = item;
      draft.viewedSha256 = item.sourceSha256;
      info = '';
      hasError = false;
      updateDraft();
      setPanel(true);
    }

    function removeEditor() {
      if (!editor) return;
      editor.remove();
      editor = null;
      pendingEditor = undefined;
      persistSession();
      drawPanel();
    }

    function openEditor(item, paragraph, selection) {
      removeEditor();
      hidePopup();
      let kind = item.kind;
      const comment = element('textarea', '');
      comment.rows = 3;
      comment.maxLength = maximumText;
      comment.value = item.comment || '';
      const replacement = element('textarea', '');
      replacement.rows = 3;
      replacement.maxLength = maximumText;
      replacement.value = item.replacement ?? item.quote;
      const diff = element('div', 'reader-feedback-diff');
      const quoted = element('blockquote', 'reader-feedback-quote', item.quote);
      const error = element('p', 'reader-feedback-status');
      error.dataset.error = 'true';
      error.setAttribute('role', 'alert');
      error.hidden = true;
      const commentLabel = element('span', '', '批注');
      const noteField = element('label', 'reader-feedback-field', commentLabel, comment);
      const suggestionField = element('label', 'reader-feedback-field', element('span', '', '建议改为'), replacement);
      const cancel = button('取消', removeEditor);
      const save = element('button', 'button primary', '加入本次反馈');
      save.type = 'submit';
      const commentMode = button('批注', () => setKind('comment'));
      const suggestionMode = button('建议改文', () => setKind('suggestion'));
      const editorForm = element('form', 'reader-feedback-editor',
        paragraph ? null : element('p', 'reader-feedback-status', item.sourceSha256 !== sourceSha256
          ? '正文已更新，此次反馈仍引用编辑时的原句。' : '当前正文无法定位原句，此次反馈仍保留原引用。'),
        item.kind !== 'highlight' ? element('div', 'reader-feedback-tools-tabs', commentMode, suggestionMode) : null,
        quoted, suggestionField, diff, noteField, error,
        element('div', 'reader-feedback-editor-actions', cancel, save));
      editorForm.dataset.readerFeedbackUi = '';
      editor = editorForm;

      function rememberEditor() {
        const input = kind === 'suggestion' && document.activeElement !== comment ? replacement : comment;
        pendingEditor = {
          item: { ...item, kind, comment: comment.value, replacement: replacement.value },
          selection: { field: input === replacement ? 'replacement' : 'comment', start: input.selectionStart, end: input.selectionEnd },
        };
        persistSession();
      }
      editorForm.addEventListener('input', rememberEditor);
      editorForm.addEventListener('select', rememberEditor);
      replacement.addEventListener('input', () => renderDiff(diff, item.quote, replacement.value));
      function setKind(value) {
        kind = value;
        const suggesting = value === 'suggestion';
        commentMode.setAttribute('aria-pressed', String(value === 'comment'));
        suggestionMode.setAttribute('aria-pressed', String(suggesting));
        suggestionField.hidden = diff.hidden = !suggesting;
        commentLabel.textContent = suggesting ? '说明（可选）' : value === 'highlight' ? '备注（可选）' : '批注';
        if (suggesting) renderDiff(diff, item.quote, replacement.value);
        error.hidden = true;
        rememberEditor();
      }
      setKind(kind);

      editorForm.addEventListener('submit', event => {
        event.preventDefault();
        const note = comment.value.trim();
        const amended = replacement.value.trim();
        if (kind === 'comment' && !note || kind === 'suggestion' && amended === item.quote) {
          error.textContent = kind === 'comment' ? '请填写批注。' : '请填写与原文不同的建议。';
          error.hidden = false;
          return;
        }
        const next = { ...item, kind, comment: note };
        if (kind === 'suggestion') next.replacement = amended;
        else delete next.replacement;
        removeEditor();
        saveItem(next);
      });

      const mount = paragraph?.closest('table') || paragraph;
      if (mount?.tagName === 'LI') mount.append(editorForm);
      else if (mount?.isConnected) mount.insertAdjacentElement('afterend', editorForm);
      else content.prepend(editorForm);
      const input = kind === 'suggestion' && selection?.field !== 'comment' ? replacement : comment;
      input.focus({ preventScroll: true });
      if (selection && Number.isInteger(selection.start) && Number.isInteger(selection.end)) {
        input.setSelectionRange(selection.start, selection.end);
      }
      rememberEditor();
      drawPanel();
    }

    function hidePopup() {
      popup?.remove();
      popup = null;
    }

    function captureSelection() {
      const selection = document.getSelection();
      if (editor || busy || draft.saved || !selection || selection.isCollapsed || selection.rangeCount !== 1) {
        hidePopup();
        return;
      }
      const range = selection.getRangeAt(0);
      const startElement = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const endElement = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
      if (!content.contains(startElement) || !content.contains(endElement) || startElement.closest(ownUi) || endElement.closest(ownUi) ||
        [...content.querySelectorAll(ownUi)].some(element => range.intersectsNode(element))) {
        hidePopup();
        return;
      }
      const raw = range.toString();
      const rect = range.getBoundingClientRect();
      if (!raw.trim() || (!rect.width && !rect.height)) return;
      const startParagraph = paragraphOf(range.startContainer);
      const endParagraph = paragraphOf(range.endContainer);
      let offset = 0;
      if (startParagraph) {
        const before = document.createRange();
        before.selectNodeContents(startParagraph);
        before.setEnd(range.startContainer, range.startOffset);
        offset = before.toString().length + raw.length - raw.trimStart().length;
      }
      const sample = sampleQuote(raw, startParagraph, endParagraph, offset);
      hidePopup();
      popup = element('div', 'reader-feedback-tools', ...Object.entries(feedbackNames).map(([kind, name]) =>
        button(name, () => {
          hidePopup();
          selection.removeAllRanges();
          void startFeedback(sample, startParagraph || startElement.closest('p, li, blockquote'), kind);
        }, 'reader-feedback-tool')));
      popup.dataset.readerFeedbackUi = '';
      popup.setAttribute('role', 'group');
      popup.setAttribute('aria-label', '划选反馈');
      popup.addEventListener('mousedown', event => event.preventDefault());
      host.append(popup);
      placePopup(popup, rect);
    }

    async function sendDraft() {
      if (busy || editor || !draft.items.length) return;
      const sentDraft = draft;
      function finishReceipt(message) {
        for (const store of ['sessionStorage', 'localStorage']) {
          try {
            if (readDraft(store, key)?.id === sentDraft.id) window[store].removeItem(key);
          } catch { /* 当前浏览器可能已经关闭。 */ }
        }
        resetVisibleBatch?.(itemPath, sentDraft.id, message);
      }
      busy = true;
      info = '';
      hasError = false;
      drawPanel();
      try {
        const opened = await getReview();
        if (controller.signal.aborted) return;
        if (!window.FlowDeskFeedbackSender) throw new Error('发送工具暂时不可用，请刷新页面后重试。');
        await window.FlowDeskFeedbackSender.send({
          review: opened, itemPath, items: sentDraft.items, draftId: sentDraft.id, saved: sentDraft.saved,
          sourceSha256: sentDraft.viewedSha256,
          onSaved() {
            if (draft.id !== sentDraft.id) return;
            draft.saved = true;
            persist();
            if (!controller.signal.aborted) drawPanel();
          },
          onAccepted() {
            finishReceipt('已进入 Codex 发送队列。');
          },
          onRestart() {
            finishReceipt('已开始新批注。原回执仍保留。');
          },
        });
      } catch (error) {
        if (!controller.signal.aborted) tell(error.message, true);
      } finally {
        busy = false;
        if (!controller.signal.aborted) drawPanel();
      }
    }

    const listener = { signal: controller.signal };
    document.addEventListener('selectionchange', captureSelection, listener);
    document.addEventListener('scroll', hidePopup, { ...listener, capture: true, passive: true });
    window.addEventListener('resize', hidePopup, listener);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      if (popup) hidePopup();
      else if (editor) removeEditor();
      else if (!panel.hidden) setPanel(false, true);
    }, listener);

    resetVisibleBatch = (path, id, message) => {
      if (itemPath !== path || draft.id !== id) return;
      draft = newDraft();
      savedToBrowser = false;
      info = message;
      hasError = false;
      markItems(content, draft.items, sourceSha256);
      drawPanel();
    };
    setPanel(openPanels.has(itemPath));
    markItems(content, draft.items, sourceSha256);
    const editing = pendingEditor?.item;
    if (!draft.saved && typeof editing?.quote === 'string' && Object.hasOwn(feedbackNames, editing.kind)) {
      openEditor(editing, locateInReader(content, editing, sourceSha256)?.paragraph, pendingEditor.selection);
    } else drawPanel();
    return () => {
      controller.abort();
      resetVisibleBatch = undefined;
      editor?.remove();
      hidePopup();
      toggle.remove();
      panel.remove();
      clearMarks(content);
    };
  }

  window.FlowDeskReaderAnnotations = { attach };
})();
