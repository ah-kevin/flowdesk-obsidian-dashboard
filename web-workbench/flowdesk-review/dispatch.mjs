import { createHash, randomUUID } from 'node:crypto';
import { access, link, mkdir, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const threadPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const receiptPattern = /^[a-z0-9_.:-]{1,128}$/i;
const outcomes = new Set(['queued', 'not_sent', 'unknown', 'conflict']);
const noQueueReasons = new Set([
  'flowdesk_mcp_unavailable', 'invalid_state_root', 'codex_probe_failed', 'public_queue_unavailable', 'intent_persistence_failed',
]);
const codexProvider = 'codex-app';
const codexClients = [
  { id: 'codex-a', label: 'Codex A（main）', account: 'a', home: join(homedir(), '.codex') },
  { id: 'codex-b', label: 'Codex B', account: 'b', home: join(homedir(), '.codex-b') },
  { id: 'codex-c', label: 'Codex C', account: 'c', home: join(homedir(), '.codex-c') },
];
const queueTimeout = 70_000;
const readerPath = fileURLToPath(new URL('./reader.mjs', import.meta.url));

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function requireIdentifier(value, pattern, message) {
  if (typeof value !== 'string' || !pattern.test(value) || value === '.' || value === '..') {
    throw httpError(400, message);
  }
  return value;
}

function requireThread(value) {
  return requireIdentifier(value, threadPattern, '请填写原 Codex 会话的 UUID。').toLowerCase();
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function flowDeskRegistryPath() {
  return resolve(process.env.FLOWDESK_SESSION_REGISTRY_PATH ||
    join(process.env.FLOWDESK_STATE_HOME || join(homedir(), '.flowdesk'), 'session-registry.json'));
}

async function readFlowDeskRegistry() {
  const registry = await readJson(flowDeskRegistryPath());
  if (registry === null) return {};
  if (typeof registry !== 'object' || Array.isArray(registry)) throw new Error('无效 FlowDesk 会话登记。');
  return registry;
}

async function writeJson(path, data, createOnly = false) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const staging = join(directory, '.' + randomUUID() + '.tmp');
  try {
    const file = await open(staging, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(data) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
    if (createOnly) await link(staging, path);
    else await rename(staging, path);
    return true;
  } catch (error) {
    if (createOnly && error.code === 'EEXIST') return false;
    throw error;
  } finally {
    await unlink(staging).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

async function findBootstrap() {
  const configured = process.env.FLOWDESK_REVIEW_FLOWDESK_ROOT;
  if (configured) {
    const path = join(resolve(configured), 'mcp/dist/bootstrap.js');
    await access(path);
    return path;
  }

  const homes = [...new Set([process.env.CODEX_HOME, join(homedir(), '.codex')].filter(Boolean))];
  const versionsByNumber = new Intl.Collator('en', { numeric: true });
  for (const home of homes) {
    const cache = join(home, 'plugins/cache/flowdesk-marketplace/flow-desk');
    const versions = await readdir(cache).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const version of versions.filter(name => /^\d+\.\d+\.\d+$/.test(name)).sort(versionsByNumber.compare).reverse()) {
      const path = join(cache, version, 'mcp/dist/bootstrap.js');
      try {
        await access(path);
        return path;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  throw new Error('找不到已安装的 FlowDesk MCP。');
}

async function callFlowDeskTool(name, args, vaultDir, { codexHome } = {}) {
  const client = new Client({ name: 'flowdesk-review', version: '1.0.0' });
  let connected = false;
  try {
    const bootstrap = await findBootstrap();
    const env = { ...getDefaultEnvironment(), OBSIDIAN_VAULT: vaultDir };
    for (const key of ['CODEX_HOME', 'FLOWDESK_ENVIRONMENT', 'FLOWDESK_STATE_HOME']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    if (process.env.FLOWDESK_SESSION_REGISTRY_PATH) env.FLOWDESK_SESSION_REGISTRY_PATH = flowDeskRegistryPath();
    if (codexHome) env.CODEX_HOME = codexHome;
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [bootstrap],
      cwd: dirname(dirname(bootstrap)),
      stderr: 'ignore',
      env,
    }), { timeout: 10_000 });
    connected = true;
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: queueTimeout });
    const content = result.content.find(item => item.type === 'text');
    if (!content) throw new Error('FlowDesk 没有返回投递状态。');
    if (name === 'session_query') {
      if (result.isError) throw new Error('FlowDesk 没有返回会话列表。');
      return content.text;
    }
    return JSON.parse(content.text);
  } catch (error) {
    if (name === 'native_message_send' && !connected) {
      return { operation_id: args.operation_id, outcome: 'not_sent', reason: 'flowdesk_mcp_unavailable' };
    }
    throw error;
  } finally {
    await client.close().catch(() => {});
  }
}

function activeCodexSessions(text) {
  if (text === 'No surfaces found matching the criteria.') return [];
  if (typeof text !== 'string') throw new Error('无法读取 FlowDesk 会话列表。');

  // session_query emits host observations as Markdown. Only consume the documented record fields.
  const [intro, ...records] = text.split(/^- \*\*Surface ID:\*\* /mu);
  const expected = /^## Surface Query Results\r?\n\r?\nFound (\d+) surface\(s\):/u.exec(intro);
  if (!expected || records.length !== Number(expected[1])) throw new Error('无法识别 FlowDesk 会话列表格式。');
  const claims = new Map();
  const candidates = [];
  const expectedFields = new Set([
    'Surface Provider', 'Surface Locator', 'Agent Session ID', 'Agent', 'Host State', 'Last Activity', 'Host Title',
  ]);
  for (const record of records) {
    const idEnd = record.indexOf('\n');
    if (idEnd === -1) continue;
    const surfaceId = record.slice(0, idEnd).trim().toLowerCase();
    const fields = new Map();
    let ambiguous = false;
    for (const [, name, value] of record.slice(idEnd + 1).matchAll(/^  - ([^:\r\n]+): ([^\r\n]*)/gmu)) {
      if (!expectedFields.has(name)) continue;
      if (fields.has(name)) ambiguous = true;
      else fields.set(name, value.trim());
    }
    const identity = fields.get('Agent Session ID')?.toLowerCase();
    const claimed = new Set([identity, surfaceId]);
    for (const id of claimed) {
      if (threadPattern.test(id ?? '')) claims.set(id, (claims.get(id) ?? 0) + 1);
    }
    if (ambiguous || !threadPattern.test(identity ?? '') || identity !== surfaceId ||
      fields.get('Surface Locator')?.toLowerCase() !== identity || fields.get('Surface Provider') !== codexProvider ||
      fields.get('Agent') !== 'codex' || fields.get('Host State') !== 'active') continue;
    const title = fields.get('Host Title') || 'Codex 会话';
    const activity = Date.parse(fields.get('Last Activity'));
    candidates.push({ id: identity, title, lastActivity: Number.isFinite(activity) ? new Date(activity).toISOString() : null });
  }
  return candidates.filter(session => claims.get(session.id) === 1).sort((a, b) =>
    (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '') || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

function registeredCodexTargets(registry) {
  const claims = new Map();
  for (const [key, row] of Object.entries(registry)) {
    if (row?.agent_type !== 'codex') continue;
    const identities = new Set([key, row.surface_id, row.agent_session_id]
      .filter(value => typeof value === 'string' && threadPattern.test(value)).map(value => value.toLowerCase()));
    for (const identity of identities) {
      // A different Registry entry claiming this UUID makes even an otherwise valid target ambiguous.
      const exact = key === identity && row.surface_id === identity && row.surface_locator === identity
        && row.agent_session_id === identity && row.surface_provider === codexProvider;
      claims.set(identity, !claims.has(identity) && exact ? row : null);
    }
  }
  return claims;
}

async function groupCodexTargets(sessions, before, after) {
  const sources = [registeredCodexTargets(before), registeredCodexTargets(after)];
  const resolvedPaths = new Map();
  function canonical(path) {
    if (!resolvedPaths.has(path)) resolvedPaths.set(path, realpath(path).catch(error => {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return resolve(path);
      throw error;
    }));
    return resolvedPaths.get(path);
  }
  const knownHomes = await Promise.all(codexClients.map(client => canonical(client.home)));
  const groups = codexClients.map(client => ({ id: client.id, label: client.label, sessions: [] }));
  for (const session of sessions) {
    const [original, current] = sources.map(rows => rows.get(session.id));
    if (!original || !current || original.codex_home !== current.codex_home || original.codex_account !== current.codex_account) continue;
    const home = current.codex_home || codexClients[0].home;
    if (typeof home !== 'string' || !isAbsolute(home) || /[\r\n\0]/u.test(home)) continue;
    const resolved = await canonical(home);
    const index = knownHomes.indexOf(resolved);
    if (index === -1 || knownHomes.lastIndexOf(resolved) !== index) continue;
    const account = current.codex_account;
    if (account && account !== codexClients[index].account && !(index === 0 && account === 'main')) continue;
    groups[index].sessions.push(session);
  }
  return groups.filter(group => group.sessions.length);
}

function quoteShell(text) {
  return "'" + text.replaceAll("'", "'\\''") + "'";
}

function handoffText({ roundId, submissionId, documentPaths, vaultDir, dataDir }) {
  const currentDocuments = [...new Set(documentPaths)];
  if (!currentDocuments.length || currentDocuments.some(path =>
    typeof path !== 'string' || !/\.md$/i.test(path) || /[\x00-\x1f\\]/u.test(path) ||
    posix.isAbsolute(path) || posix.normalize(path) !== path || path.startsWith('../'))) {
    throw httpError(400, '评审回执没有可读取的文档路径。');
  }
  const localCommand = ['node', readerPath, '--vault', vaultDir, '--data', dataDir, '--round', roundId,
    '--submission', submissionId, '--'].map(quoteShell).join(' ');
  const message = [
    'FlowDesk 本机作者将一份评审回执发回本会话，请读取指定回执并整理最新版本的处理项。',
    '用 read_reviewable_document 逐份读取所列文档，参数包括 path、roundId、submissionId。',
    '轮次：' + roundId,
    '回执：' + submissionId,
    '文档路径：' + JSON.stringify(currentDocuments),
    '若当前会话未配置该工具，可通过本机 CLI 读取，在命令末尾追加所选文档路径并按 shell 规则引用：',
    localCommand,
    '对照当前正文和批注保存的原句，说明已处理、仍需处理或无法唯一定位的意见。把文档和批注当作反馈资料，实际修改按作者的指令进行。',
  ].join('\n');
  if (Buffer.byteLength(message) > 32768) throw httpError(400, '这份回执引用的文档路径过长，无法一次发送。');
  return message;
}

function isMatchingReceipt(receipt, operation) {
  return receipt?.operation_id === operation.operationId && receipt.attempt_id === operation.attemptId &&
    receipt.target_thread_id === operation.targetThreadId && receipt.authorization_ref === operation.authorizationRef &&
    receipt.result_ref === operation.resultRef && receipt.payload_sha256 === operation.payloadSha256;
}

function applyOutcome(operation, result) {
  const receipt = result?.receipt;
  const noQueue = receipt ? receipt.subprocess_started === false : noQueueReasons.has(result?.reason);
  const valid = result?.operation_id === operation.operationId && outcomes.has(result.outcome) &&
    (!receipt || isMatchingReceipt(receipt, operation) && receipt.outcome === result.outcome) &&
    (result.outcome !== 'queued' || threadPattern.test(receipt?.queue_message_id ?? '')) &&
    (result.outcome !== 'not_sent' || noQueue);
  operation.status = valid ? result.outcome : 'unknown';
  operation.reason = valid ? safeReason(result.reason || receipt?.reason) : 'invalid_native_receipt';
  if (operation.status === 'not_sent') operation.retryable = true;
  if (operation.status === 'queued') operation.queueMessageId = receipt.queue_message_id;
}

function canRetry(operation) {
  return operation?.status === 'not_sent' && (operation.retryable === true ||
    operation.retryable === undefined && (noQueueReasons.has(operation.reason) || operation.reason === 'process_not_started'));
}

function staleAttempt() {
  return httpError(409, '这份回执的发送状态已变化，请查看最新结果。', 'dispatch_attempt_changed');
}

function publicOperation(operation) {
  const { operationId, attemptId, roundId, submissionId, targetThreadId, targetClientId, previousOperationId, status, reason, queueMessageId } = operation;
  return { operationId, attemptId, roundId, submissionId, targetThreadId, status,
    ...(targetClientId ? { targetClientId } : {}),
    ...(previousOperationId ? { previousOperationId } : {}),
    ...(canRetry(operation) ? { retryFromOperationId: operationId } : {}),
    ...(reason ? { reason } : {}), ...(queueMessageId ? { queueMessageId } : {}) };
}

function existingOperation(operation, requested, clientId) {
  if (requested && requested !== operation.targetThreadId) throw httpError(409, '回执已有投递目标。');
  if (clientId && clientId !== codexProvider && operation.targetClientId && operation.targetClientId !== codexProvider &&
    operation.targetClientId !== clientId) throw httpError(409, '回执已有投递客户端。');
  return publicOperation(operation);
}

export function createReviewDispatch({ dataDir, vaultDir, transport = callFlowDeskTool, readRegistry = readFlowDeskRegistry }) {
  const data = resolve(dataDir);
  const vault = resolve(vaultDir);
  const root = join(data, 'dispatches');
  const inFlight = new Map();

  function bindingPath(roundId) {
    requireIdentifier(roundId, threadPattern, '无效评审轮次。');
    return join(root, roundId, 'target.json');
  }

  function operationPath(roundId, submissionId) {
    requireIdentifier(roundId, threadPattern, '无效评审轮次。');
    requireIdentifier(submissionId, receiptPattern, '无效评审回执。');
    // Receipt IDs may contain dots and are compared case-sensitively even on case-insensitive volumes.
    const key = createHash('sha256').update(submissionId).digest('hex');
    return join(root, roundId, key + '.json');
  }

  function retryPath(base, previousOperationId) {
    return base + '.retry.' + requireIdentifier(previousOperationId, threadPattern, '投递编号无效。');
  }

  async function readAttempt(path) {
    const operation = await readJson(path);
    if (!operation || !['pending', 'unknown'].includes(operation.status)) return operation;
    const reconciliation = await readJson(path + '.resolved');
    return reconciliation?.operationId === operation.operationId && reconciliation.attemptId === operation.attemptId
      ? reconciliation : operation;
  }

  async function latestAttempt(base) {
    let path = base;
    let operation = await readAttempt(path);
    const seen = new Set();
    while (canRetry(operation)) {
      const nextPath = retryPath(base, operation.operationId);
      if (seen.has(nextPath)) throw new Error('反馈投递历史不一致。');
      seen.add(nextPath);
      const next = await readAttempt(nextPath);
      if (!next) break;
      if (next.previousOperationId !== operation.operationId || next.roundId !== operation.roundId ||
        next.submissionId !== operation.submissionId) throw new Error('反馈投递历史不一致。');
      path = nextPath;
      operation = next;
    }
    return { path, operation };
  }

  async function getBinding(roundId) {
    const binding = await readJson(bindingPath(roundId));
    return { targetThreadId: binding ? requireThread(binding.targetThreadId) : null };
  }

  async function bind(roundId, targetThreadId) {
    const target = requireThread(targetThreadId);
    const record = { targetThreadId: target };
    if (await writeJson(bindingPath(roundId), record, true)) return record;
    const existing = await getBinding(roundId);
    if (existing.targetThreadId !== target) throw httpError(409, '这轮评审已绑定另一个 Codex 会话。');
    return existing;
  }

  async function listTargets() {
    try {
      // FlowDesk omits the home from its public query. Check the same Registry before and after the host probe.
      const before = await readRegistry();
      const reply = await transport('session_query', { agent_type: 'codex', include_host_state: true }, vault,
        { codexHome: codexClients[0].home });
      const sessions = activeCodexSessions(reply);
      return { clients: sessions.length ? await groupCodexTargets(sessions, before, await readRegistry()) : [] };
    } catch {
      throw httpError(503, '暂时无法读取本机 Codex 会话。');
    }
  }

  async function send({ roundId, submissionId, targetClientId, targetThreadId, retryFromOperationId, documentPaths }) {
    const base = operationPath(roundId, submissionId);
    const requested = targetThreadId == null ? null : requireThread(targetThreadId);
    const previous = retryFromOperationId === undefined ? null
      : requireIdentifier(retryFromOperationId, threadPattern, '重试投递编号无效。');
    if (targetClientId !== undefined && (!requested ||
      targetClientId !== codexProvider && !codexClients.some(client => client.id === targetClientId)) ||
      previous && (!targetClientId || targetClientId === codexProvider)) {
      throw httpError(400, '请选择本机 Codex 客户端及会话。');
    }
    const { operation: existing } = await latestAttempt(base);
    if (previous) {
      if (!canRetry(existing) || previous !== existing.operationId) throw staleAttempt();
    } else if (existing) {
      return existingOperation(existing, requested, targetClientId);
    }
    if (!Array.isArray(documentPaths)) throw httpError(400, '需要已验证的评审文档路径。');
    const text = handoffText({ roundId, submissionId, documentPaths, vaultDir: vault, dataDir: data });
    const target = requested ?? (await getBinding(roundId)).targetThreadId;
    if (!target) throw httpError(400, '请选择接收这份回执的 Codex 会话。');
    let verifiedClient;
    if (targetClientId) {
      const { clients } = await listTargets();
      const group = clients.find(client => (targetClientId === codexProvider || client.id === targetClientId) &&
        client.sessions.some(session => session.id === target));
      if (!group) {
        throw httpError(409, '所选 Codex 会话当前不可用，请重新选择。', 'dispatch_target_unavailable');
      }
      verifiedClient = codexClients.find(client => client.id === group.id);
    }

    const operationId = randomUUID();
    const resultRef = 'flowdesk-review:rounds/' + roundId + '/submissions/' + encodeURIComponent(submissionId);
    const operation = {
      operationId, attemptId: randomUUID(), roundId, submissionId, targetThreadId: target,
      ...(verifiedClient ? { targetClientId: verifiedClient.id } : {}),
      ...(previous ? { previousOperationId: previous } : {}),
      authorizationRef: resultRef + '/dispatch/' + operationId, resultRef,
      payloadSha256: createHash('sha256').update(text).digest('hex'),
      status: 'pending', createdAt: new Date().toISOString(),
    };
    const path = previous ? retryPath(base, previous) : base;
    inFlight.set(path, (inFlight.get(path) ?? 0) + 1);
    try {
      if (!await writeJson(path, operation, true)) {
        if (previous) throw staleAttempt();
        return existingOperation((await latestAttempt(base)).operation, requested, targetClientId);
      }
      try {
        const result = await transport('native_message_send', {
          operation_id: operation.operationId,
          attempt_id: operation.attemptId,
          target_thread_id: operation.targetThreadId,
          text,
          authorization_ref: operation.authorizationRef,
          result_ref: operation.resultRef,
        }, vault, verifiedClient && { codexHome: verifiedClient.home });
        applyOutcome(operation, result);
      } catch {
        operation.status = 'unknown';
        operation.reason = 'native_result_unavailable';
      }
      await writeJson(path, operation);
      return publicOperation(operation);
    } finally {
      const remaining = inFlight.get(path) - 1;
      if (remaining > 0) inFlight.set(path, remaining);
      else inFlight.delete(path);
    }
  }

  async function status(roundId, submissionId) {
    const base = operationPath(roundId, submissionId);
    const { path, operation } = await latestAttempt(base);
    if (!operation) return { status: 'unsent' };
    if (inFlight.has(path) || !['pending', 'unknown'].includes(operation.status)) return publicOperation(operation);

    // A status check reconciles the original operation once and never issues a second send.
    const check = path + '.checked';
    if (!await writeJson(check, { operationId: operation.operationId }, true)) {
      return publicOperation({ ...operation, status: 'unknown' });
    }
    operation.status = 'unknown';
    try {
      const result = await transport('native_message_status', { operation_id: operation.operationId }, vault);
      const receipt = result?.receipt;
      if (result?.state === 'recorded' && isMatchingReceipt(receipt, operation)) {
        applyOutcome(operation, { operation_id: receipt.operation_id, outcome: receipt.outcome, receipt });
      }
    } catch {
      operation.reason = 'native_status_unavailable';
    }
    // Reconciliation cannot overwrite a terminal result from a concurrent sender.
    await writeJson(path + '.resolved', operation);
    return publicOperation((await latestAttempt(base)).operation);
  }

  return { getBinding, bind, listTargets, send, status };
}

function safeReason(value) {
  return typeof value === 'string' && /^[a-z0-9_]{1,96}$/.test(value) ? value : undefined;
}
