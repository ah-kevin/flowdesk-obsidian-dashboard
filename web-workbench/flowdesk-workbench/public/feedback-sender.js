(() => {
  'use strict';

  const acceptedStatuses = new Set(['queued', 'delivered']);
  const statusLabels = {
    pending: '正在等待投递结果。',
    unknown: '投递结果待确认。',
    not_sent: '回执已保存，这次发送未进入 Codex 队列。',
    conflict: '这份反馈的投递记录需要核对。',
  };
  let preparing;
  let activeDialog;

  async function request(path, body) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : {
        Accept: 'application/json', 'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      throw Object.assign(new Error(result?.error || '请求未完成（' + response.status + '）'), {
        status: response.status, code: result?.code,
      });
    }
    return result;
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function button(label, primary = false) {
    const control = node('button', primary ? 'button primary' : 'button', label);
    control.type = 'button';
    return control;
  }

  function choiceField(label, control) {
    const wrapper = node('div', 'reader-feedback-dialog-field');
    wrapper.append(node('span', null, label), control.element);
    return wrapper;
  }

  function submissionBody({ review, itemPath, sourceSha256, draftId, items }) {
    const sourceDocument = review?.documents?.find(entry => !itemPath || entry.path === itemPath);
    if (!review?.id || !sourceDocument || !draftId || !Array.isArray(items) || !items.length) {
      throw new Error('请先在当前资料添加反馈。');
    }
    const content = items.map(item => ({
      id: item.id,
      documentId: item.documentId,
      blockId: item.blockId,
      kind: item.kind,
      quote: item.quote,
      comment: item.comment ?? '',
      ...(item.kind === 'suggestion' ? { replacement: item.replacement ?? '' } : {}),
      offset: item.offset,
      required: Boolean(item.required),
      sourceSha256: item.sourceSha256 || item.source?.sha256,
      prefix: item.prefix ?? item.source?.prefix,
      suffix: item.suffix ?? item.source?.suffix,
    }));
    // The stored items pin the version when retrying a saved draft after a reader refresh.
    const sha256 = content.at(-1).sourceSha256 || sourceSha256 || sourceDocument.sha256;
    return {
      id: draftId,
      decision: 'comment',
      summary: '',
      documentVersions: [{ documentId: sourceDocument.id, sha256 }],
      items: content,
    };
  }

  function openDeliveryDialog(path, initialDelivery, saveReceipt, onAccepted, onRestart) {
    const dialog = node('dialog', 'reader-feedback-dialog');
    const title = node('h2', null, '发送本次反馈');
    title.id = 'reader-feedback-send-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const header = node('header', 'reader-feedback-dialog-header');
    header.append(title);
    const form = node('form', 'reader-feedback-dialog-form');
    const fields = node('div', 'reader-feedback-dialog-fields');
    const status = node('p', 'reader-feedback-dialog-status');
    status.setAttribute('role', 'status');
    const error = node('p', 'reader-feedback-dialog-error');
    error.setAttribute('role', 'alert');
    const actions = node('div', 'reader-feedback-dialog-actions');
    const close = button('关闭');
    let dispatching = false;
    let accepted = false;
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => {
      if (dispatching) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      if (activeDialog === dialog) activeDialog = null;
      dialog.remove();
    });
    form.addEventListener('submit', event => event.preventDefault());
    form.append(fields, status, error, actions);
    dialog.append(header, form);
    document.body.append(dialog);
    activeDialog = dialog;
    dialog.showModal();

    function setFeedback(statusText, errorText = '') {
      status.textContent = statusText;
      status.hidden = !statusText;
      error.textContent = errorText;
      error.hidden = !errorText;
    }

    async function checkDelivery(detail = '') {
      const check = button('查询发送状态', true);
      check.disabled = true;
      actions.replaceChildren(close, check);
      setFeedback('正在查询原投递…');
      try {
        const { dispatch } = await request(path);
        if (dialog.open) await renderDelivery(dispatch, detail);
      } catch (failure) {
        if (!dialog.open) return;
        await renderDelivery({ status: 'unknown' }, failure.message);
      }
    }

    async function showTargets(retryFromOperationId, detail = '') {
      fields.replaceChildren();
      actions.replaceChildren(close);
      setFeedback('正在读取 Codex 会话…');
      let clients;
      try {
        const result = await request('/api/admin/review-targets');
        clients = Array.isArray(result.clients) ? result.clients : [];
      } catch (failure) {
        if (!dialog.open) return;
        setFeedback('', failure.message);
      }
      if (!dialog.open) return;
      if (!clients?.length) {
        if (clients) setFeedback('FlowDesk 暂未找到可选的本机 Codex 会话。', detail);
        const reload = button('重新读取会话', true);
        reload.addEventListener('click', () => void showTargets(retryFromOperationId));
        actions.append(reload);
        return;
      }

      const identity = node('p', 'reader-feedback-dialog-meta');
      const confirm = button('确认发送', true);
      const client = window.FlowDeskChoiceMenu.create({
        id: 'feedback-codex-client', label: 'Codex 环境', placeholder: '请选择 Codex 环境',
        options: clients.map(entry => ({ value: entry.id, label: entry.label })),
        value: clients.length === 1 ? clients[0].id : '', onSelect: selectClient,
      });
      const session = window.FlowDeskChoiceMenu.create({
        id: 'feedback-codex-session', label: 'Codex 会话', placeholder: '请选择接收会话',
        search: '搜索会话标题或 ID', onSelect: selectSession,
      });
      fields.append(choiceField('Codex 环境', client), choiceField('Codex 会话', session), identity);
      actions.append(confirm);
      setFeedback(retryFromOperationId ? '请选择这份已保存回执的接收会话。' : '', detail);

      function selectSession() {
        identity.textContent = session.value ? '会话 ID ' + session.value : '';
        identity.hidden = !session.value;
        confirm.disabled = !client.value || !session.value;
      }

      function selectClient() {
        const entries = clients.find(entry => entry.id === client.value)?.sessions || [];
        session.setOptions(entries.map(entry => ({
          value: entry.id, label: entry.title || entry.id, detail: entry.title ? entry.id : '',
        })));
        selectSession();
      }

      selectClient();
      (client.value ? session : client).trigger.focus();
      confirm.addEventListener('click', async () => {
        if (confirm.disabled || dispatching) return;
        dispatching = true;
        client.setDisabled(true);
        session.setDisabled(true);
        confirm.disabled = close.disabled = true;
        if (!retryFromOperationId) {
          setFeedback('正在保存反馈回执…');
          try {
            await saveReceipt();
          } catch (failure) {
            dispatching = close.disabled = false;
            if (failure.code === 'submission_conflict') {
              await renderDelivery({ status: 'conflict' }, failure.message);
              return;
            }
            client.setDisabled(false);
            session.setDisabled(false);
            selectSession();
            setFeedback('', failure.message);
            return;
          }
        }
        setFeedback('正在发送到所选 Codex 会话…');
        let result;
        let failure;
        try {
          result = await request(path, {
            targetClientId: client.value, targetThreadId: session.value,
            ...(retryFromOperationId ? { retryFromOperationId } : {}),
          });
        } catch (reason) {
          failure = reason;
        } finally {
          dispatching = close.disabled = false;
        }
        if (!dialog.open) return;
        if (failure) {
          if (failure.code === 'dispatch_target_unavailable') {
            await showTargets(retryFromOperationId, failure.message);
            return;
          }
          if (failure.code === 'dispatch_attempt_changed') {
            await checkDelivery(failure.message);
            return;
          }
          await renderDelivery({ status: 'unknown' }, failure.message);
          return;
        }
        await renderDelivery(result.dispatch);
      });
    }

    async function renderDelivery(delivery, detail = '') {
      if (!dialog.open || accepted) return;
      if (acceptedStatuses.has(delivery?.status)) {
        accepted = true;
        dialog.close();
        onAccepted?.(delivery);
        return;
      }
      if (delivery?.status === 'unsent') {
        await showTargets(undefined, detail);
        return;
      }
      const state = delivery?.status || 'unknown';
      const destination = delivery?.targetThreadId;
      fields.replaceChildren();
      if (destination) fields.append(node('p', 'reader-feedback-dialog-meta', '会话 ID ' + destination));
      setFeedback(statusLabels[state] || statusLabels.unknown, detail);
      actions.replaceChildren(close);
      if (state === 'not_sent' || state === 'conflict') {
        if (onRestart) {
          const restart = button('开始新批注');
          restart.addEventListener('click', () => {
            dialog.close();
            onRestart();
          });
          actions.append(restart);
        }
        if (state === 'not_sent' && delivery.retryFromOperationId) {
          const selectAgain = button('重新选择会话', true);
          selectAgain.addEventListener('click', () => void showTargets(delivery.retryFromOperationId));
          actions.append(selectAgain);
        }
      } else {
        const check = button('查询发送状态', true);
        check.addEventListener('click', () => void checkDelivery());
        actions.append(check);
      }
    }

    void renderDelivery(initialDelivery);
  }

  async function prepare(options) {
    const body = submissionBody(options);
    const round = encodeURIComponent(options.review.id);
    const path = '/api/admin/reviews/' + round + '/submissions/' + encodeURIComponent(body.id) + '/dispatch';
    const saveReceipt = async () => {
      const { submission } = await request('/api/admin/direct-reviews/' + round + '/submit', body);
      if (submission?.id !== body.id) throw new Error('无法核对已保存的反馈回执。');
      options.onSaved?.(submission);
    };
    let delivery = { status: 'unsent' };
    if (options.saved) {
      try {
        ({ dispatch: delivery } = await request(path));
      } catch {
        delivery = { status: 'unknown' };
      }
    }
    if (acceptedStatuses.has(delivery?.status)) {
      options.onAccepted?.(delivery);
      return delivery;
    }
    openDeliveryDialog(path, delivery, saveReceipt, options.onAccepted, options.onRestart);
  }

  function send(options) {
    if (activeDialog?.open) return Promise.resolve();
    if (!preparing) {
      preparing = prepare(options).finally(() => { preparing = null; });
    }
    return preparing;
  }

  window.FlowDeskFeedbackSender = { send };
})();
