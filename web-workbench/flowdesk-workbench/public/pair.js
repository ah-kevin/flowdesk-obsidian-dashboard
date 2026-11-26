'use strict';

const endpoint = '/api/author-pairing';
const form = document.getElementById('pair-form');
const field = document.getElementById('pair-key');
const submit = document.getElementById('pair-submit');
const retry = document.getElementById('pair-retry');
const statusMessage = document.getElementById('pair-status');
const errorMessage = document.getElementById('pair-error');

function continueToWorkbench() {
  const hash = window.location.hash;
  const route = /^#\/(?!\/)[^#\\\s\u0000-\u001f\u007f]*$/u.test(hash) ? hash : '';
  statusMessage.textContent = '正在打开工作台…';
  window.location.replace('/' + route);
}

function setBusy(busy) {
  form.setAttribute('aria-busy', String(busy));
  field.disabled = busy;
  submit.disabled = busy;
}

async function checkStatus() {
  setBusy(true);
  retry.hidden = true;
  errorMessage.textContent = '';
  statusMessage.textContent = '正在检查配对状态…';
  try {
    const response = await fetch(endpoint, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.paired === true || data.required === false) {
      continueToWorkbench();
      return;
    }
    if (data.required !== true || data.paired !== false) throw new Error();
    statusMessage.textContent = '';
    setBusy(false);
  } catch {
    statusMessage.textContent = '';
    form.removeAttribute('aria-busy');
    errorMessage.textContent = '暂时无法读取配对状态，请重试。';
    retry.hidden = false;
  }
}

function pairingError(status) {
  if (status === 401 || status === 403) return '配对密钥不正确，请重新输入。';
  if (status === 429) return '尝试次数过多，请稍后再试。';
  if (status === 400) return '请检查配对密钥后重试。';
  return '暂时无法完成配对，请重试。';
}

retry.addEventListener('click', checkStatus);
field.addEventListener('input', () => {
  field.removeAttribute('aria-invalid');
  errorMessage.textContent = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submit.disabled || !field.value) return;

  const body = JSON.stringify({ key: field.value });
  field.value = '';
  setBusy(true);
  submit.textContent = '正在匹配…';
  errorMessage.textContent = '';
  statusMessage.textContent = '正在验证配对密钥…';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body,
    });
    if (response.ok && (await response.json()).paired === true) {
      continueToWorkbench();
      return;
    }
    if ([400, 401, 403].includes(response.status)) field.setAttribute('aria-invalid', 'true');
    errorMessage.textContent = pairingError(response.status);
  } catch {
    errorMessage.textContent = '暂时无法完成配对，请重试。';
  }

  statusMessage.textContent = '';
  submit.textContent = '开始匹配';
  setBusy(false);
  field.focus();
});

checkStatus();
