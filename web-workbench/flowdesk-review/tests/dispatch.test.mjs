import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createReviewDispatch } from '../dispatch.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'flowdesk-review-dispatch-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return {
    options: { dataDir, vaultDir: "/Vault/Today's Notes" },
    input: {
      roundId: randomUUID(), submissionId: 'saved:receipt.1', documentPaths: ['Notes/Plans/巡检管理.md'],
      targetThreadId: randomUUID(),
    },
  };
}

function queueReceipt(args) {
  return {
    operation_id: args.operation_id, attempt_id: args.attempt_id, target_thread_id: args.target_thread_id,
    authorization_ref: args.authorization_ref, result_ref: args.result_ref,
    payload_sha256: createHash('sha256').update(args.text).digest('hex'),
    outcome: 'queued', queue_message_id: randomUUID(), reason: 'queue_accepted',
  };
}

function sessionRows(sessions) {
  return [
    '## Surface Query Results',
    '',
    'Found ' + sessions.length + ' surface(s):',
    '',
    ...sessions.map(({ id, provider = 'codex-app', surface = id, state = 'active', title = '目标会话',
      lastActivity = '2026-11-26T15:20:00+08:00' }) =>
      [
        '- **Surface ID:** ' + surface,
        '  - Surface Provider: ' + provider,
        '  - Surface Locator: ' + surface,
        '  - Workspace Name: 工作区',
        '  - Agent: codex',
        '  - Agent Session ID: ' + id,
        '  - Host State: ' + state,
        '  - Last Activity: ' + lastActivity,
        '  - Host Title: ' + title,
      ].join('\n')),
  ].join('\n');
}

function registryRows(sessions) {
  return Object.fromEntries(sessions.map(({ id, home, account, provider = 'codex-app', surface = id }) => [surface, {
    agent_type: 'codex', surface_provider: provider, surface_id: surface, surface_locator: surface, agent_session_id: id,
    ...(home === undefined ? {} : { codex_home: home }), ...(account === undefined ? {} : { codex_account: account }),
  }]));
}

test('sends saved references to the confirmed thread at most once, including after restart', async t => {
  const { options, input } = await fixture(t);
  const calls = [];
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const dispatch = createReviewDispatch({ ...options, async transport(name, args) {
    calls.push([name, args]);
    started.resolve();
    await finish.promise;
    return { operation_id: args.operation_id, outcome: 'queued', receipt: queueReceipt(args) };
  } });

  const first = dispatch.send(input);
  await started.promise;
  const duplicate = await dispatch.send(input);
  assert.equal(duplicate.status, 'pending');
  assert.equal((await dispatch.status(input.roundId, input.submissionId)).status, 'pending');
  finish.resolve();
  const queued = await first;
  assert.equal(queued.operationId, duplicate.operationId);
  assert.equal(queued.status, 'queued');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'native_message_send');
  assert.equal(calls[0][1].target_thread_id, input.targetThreadId);
  assert.match(calls[0][1].text, /read_reviewable_document/);
  assert.ok(calls[0][1].text.includes(input.documentPaths[0]));
  assert.ok(calls[0][1].text.includes(input.submissionId));
  assert.deepEqual(await dispatch.getBinding(input.roundId), { targetThreadId: null });

  const afterRestart = createReviewDispatch({ ...options, transport() {
    assert.fail('an existing send must not call the tool again');
  } });
  assert.deepEqual(await afterRestart.send(input), queued);
  assert.deepEqual(await afterRestart.status(input.roundId, input.submissionId), queued);
  await assert.rejects(afterRestart.send({ ...input, targetThreadId: randomUUID() }), { status: 409 });
  await assert.rejects(afterRestart.bind(input.roundId, 'conversation-title'), { status: 400 });
});

test('assigns sending targets per receipt and only falls back to a legacy round binding', async t => {
  const { options, input } = await fixture(t);
  const targets = [];
  const dispatch = createReviewDispatch({ ...options, async transport(name, args) {
    assert.equal(name, 'native_message_send');
    targets.push(args.target_thread_id);
    return { operation_id: args.operation_id, outcome: 'queued', receipt: queueReceipt(args) };
  } });

  const legacyTarget = randomUUID();
  await dispatch.bind(input.roundId, legacyTarget);
  const explicit = await dispatch.send(input);
  const legacy = await dispatch.send({ ...input, submissionId: 'legacy', targetThreadId: undefined });
  assert.equal(explicit.targetThreadId, input.targetThreadId);
  assert.equal(legacy.targetThreadId, legacyTarget);
  assert.deepEqual(targets, [input.targetThreadId, legacyTarget]);
  assert.deepEqual(await dispatch.getBinding(input.roundId), { targetThreadId: legacyTarget });

  const competing = await Promise.allSettled([
    dispatch.send({ ...input, submissionId: 'race' }),
    dispatch.send({ ...input, submissionId: 'race', targetThreadId: randomUUID() }),
  ]);
  assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(competing.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(targets.length, 3);
});

test('groups active registered Codex targets and revalidates the selected account at send time', async t => {
  const { options, input } = await fixture(t);
  const calls = [];
  const ambiguous = randomUUID();
  const expired = randomUUID();
  const registeredB = randomUUID();
  const registeredC = randomUUID();
  const mismatched = randomUUID();
  const unregistered = randomUUID();
  const unsupported = randomUUID();
  const registryAlias = randomUUID();
  const duplicateRegistered = randomUUID();
  const records = [
    { id: input.targetThreadId },
    { id: expired, state: 'archived', home: join(homedir(), '.codex') },
    { id: randomUUID(), state: 'unknown (host state probe failed)' },
    { id: randomUUID(), provider: 'iterm2' },
    { id: randomUUID(), surface: randomUUID() },
    { id: ambiguous },
    { id: ambiguous, surface: randomUUID(), provider: 'iterm2' },
    { id: registeredB, home: join(homedir(), '.codex-b'), account: 'b', title: 'B 上的会话' },
    { id: registeredC, home: join(homedir(), '.codex-c'), title: 'C 上的会话' },
    { id: mismatched, home: join(homedir(), '.codex-b'), account: 'c' },
    { id: unsupported, home: join(homedir(), '.codex-unknown') },
    { id: duplicateRegistered, home: join(homedir(), '.codex-b') },
  ];
  const initial = sessionRows([...records, { id: unregistered }]);
  const registry = registryRows([...records, { id: duplicateRegistered, surface: registryAlias, home: join(homedir(), '.codex-c') }]);
  let query = initial;
  const dispatch = createReviewDispatch({ ...options, readRegistry: async () => registry, async transport(name, args, vault, routing) {
    calls.push([name, args, routing]);
    if (name === 'session_query') {
      assert.deepEqual(args, { agent_type: 'codex', include_host_state: true });
      assert.deepEqual(routing, { codexHome: join(homedir(), '.codex') });
      return query;
    }
    assert.equal(name, 'native_message_send');
    return { operation_id: args.operation_id, outcome: 'queued', receipt: queueReceipt(args) };
  } });
  assert.deepEqual(await dispatch.listTargets(), {
    clients: [ {
      id: 'codex-a', label: 'Codex A（main）',
      sessions: [{ id: input.targetThreadId, title: '目标会话', lastActivity: '2026-11-26T07:20:00.000Z' }],
    }, {
      id: 'codex-b', label: 'Codex B',
      sessions: [{ id: registeredB, title: 'B 上的会话', lastActivity: '2026-11-26T07:20:00.000Z' }],
    }, {
      id: 'codex-c', label: 'Codex C',
      sessions: [{ id: registeredC, title: 'C 上的会话', lastActivity: '2026-11-26T07:20:00.000Z' }],
    } ],
  });
  await assert.rejects(dispatch.send({ ...input, targetClientId: 'unknown-client' }), { status: 400 });
  await assert.rejects(dispatch.send({ ...input, targetClientId: 'codex-app', targetThreadId: expired }), { status: 409 });
  await assert.rejects(dispatch.send({ ...input, targetClientId: 'codex-c', targetThreadId: registeredB }), { status: 409 });
  query = 'No surfaces found matching the criteria.';
  await assert.rejects(dispatch.send({ ...input, targetClientId: 'codex-app' }), { status: 409 });
  assert.deepEqual(await dispatch.status(input.roundId, input.submissionId), { status: 'unsent' });
  query = initial;
  const result = await dispatch.send({ ...input, targetClientId: 'codex-b', targetThreadId: registeredB });
  assert.equal(result.targetClientId, 'codex-b');
  assert.equal(result.targetThreadId, registeredB);
  assert.equal(result.status, 'queued');
  assert.deepEqual(calls.at(-1)[2], { codexHome: join(homedir(), '.codex-b') });
  await assert.rejects(dispatch.send({ ...input, targetClientId: 'codex-c', targetThreadId: registeredB }), { status: 409 });
  assert.deepEqual(await dispatch.send({ ...input, targetClientId: 'codex-app', targetThreadId: registeredB }), result);
  assert.deepEqual(calls.map(([name]) => name),
    ['session_query', 'session_query', 'session_query', 'session_query', 'session_query', 'native_message_send']);
});

test('drops a target whose registered home changes during the native state check', async t => {
  const { options, input } = await fixture(t);
  const rows = [{ id: input.targetThreadId }];
  let registry = registryRows(rows);
  let attempts = 0;
  const dispatch = createReviewDispatch({ ...options, readRegistry: async () => registry, async transport(name) {
    assert.equal(name, 'session_query');
    registry = registryRows([{ ...rows[0], home: join(homedir(), '.codex-b') }]);
    attempts += 1;
    return sessionRows(rows);
  } });
  assert.deepEqual(await dispatch.listTargets(), { clients: [] });
  await assert.rejects(dispatch.send({ ...input, targetClientId: 'codex-a' }), { status: 409 });
  assert.equal(attempts, 2);
});

test('a definite failure can be retried explicitly once with the same receipt and a fresh verified target', async t => {
  const { options, input } = await fixture(t);
  const nextTarget = randomUUID();
  const otherTarget = randomUUID();
  const sessions = [{ id: input.targetThreadId }, { id: nextTarget, home: join(homedir(), '.codex-b') }, { id: otherTarget }];
  const previousRuns = [];
  const retryStarted = Promise.withResolvers();
  const finishRetry = Promise.withResolvers();
  const dependencies = {
    ...options, readRegistry: async () => registryRows(sessions),
    async transport(name, args, vault, routing) {
      if (name === 'session_query') return sessionRows(sessions);
      assert.equal(name, 'native_message_send');
      previousRuns.push(args);
      if (previousRuns.length === 1) return { operation_id: args.operation_id, outcome: 'not_sent', reason: 'codex_probe_failed' };
      assert.deepEqual(routing, { codexHome: join(homedir(), '.codex-b') });
      retryStarted.resolve();
      await finishRetry.promise;
      return { operation_id: args.operation_id, outcome: 'queued', receipt: queueReceipt(args) };
    },
  };
  const dispatch = createReviewDispatch(dependencies);
  const first = await dispatch.send({ ...input, targetClientId: 'codex-a' });
  assert.equal(first.status, 'not_sent');
  assert.equal(first.retryFromOperationId, first.operationId);
  const restarted = createReviewDispatch(dependencies);
  assert.deepEqual(await restarted.status(input.roundId, input.submissionId), first);
  const again = { ...input, targetThreadId: nextTarget, targetClientId: 'codex-b', retryFromOperationId: first.operationId };
  await assert.rejects(restarted.send({ ...again, targetClientId: 'codex-a' }), { status: 409, code: 'dispatch_target_unavailable' });
  const retry = restarted.send(again);
  await retryStarted.promise;
  assert.equal((await restarted.status(input.roundId, input.submissionId)).status, 'pending');
  await assert.rejects(dispatch.send(again), { status: 409, code: 'dispatch_attempt_changed' });
  await assert.rejects(dispatch.send({ ...again, targetThreadId: otherTarget, targetClientId: 'codex-a' }),
    { status: 409, code: 'dispatch_attempt_changed' });
  finishRetry.resolve();
  const queued = await retry;
  assert.equal(queued.status, 'queued');
  assert.equal(queued.targetThreadId, nextTarget);
  assert.equal(queued.previousOperationId, first.operationId);
  assert.equal(queued.retryFromOperationId, undefined);
  assert.notEqual(queued.operationId, first.operationId);
  assert.notEqual(queued.attemptId, first.attemptId);
  assert.equal(previousRuns.length, 2);
  assert.equal(previousRuns[1].text, previousRuns[0].text);
  assert.equal(previousRuns[1].result_ref, previousRuns[0].result_ref);
  assert.deepEqual(await createReviewDispatch(dependencies).status(input.roundId, input.submissionId), queued);
  await assert.rejects(dispatch.send(again), { status: 409, code: 'dispatch_attempt_changed' });
  await assert.rejects(dispatch.send({ ...again, retryFromOperationId: queued.operationId }), { status: 409, code: 'dispatch_attempt_changed' });
  const directory = join(options.dataDir, 'dispatches', input.roundId);
  const attempts = await Promise.all((await readdir(directory)).map(async path => JSON.parse(await readFile(join(directory, path), 'utf8'))));
  assert.deepEqual(attempts.map(({ operationId, status, targetThreadId }) => [operationId, status, targetThreadId]), [
    [first.operationId, 'not_sent', input.targetThreadId], [queued.operationId, 'queued', nextTarget],
  ]);
});

test('conflict and uncertainty without definite no-queue evidence cannot retry', async t => {
  const { options, input } = await fixture(t);
  const sessions = [{ id: input.targetThreadId }];
  let outcome = 'not_sent';
  let count = 0;
  const dispatch = createReviewDispatch({ ...options, readRegistry: async () => registryRows(sessions), async transport(name, args) {
    if (name === 'session_query') return sessionRows(sessions);
    assert.equal(name, 'native_message_send');
    count++;
    return { operation_id: args.operation_id, outcome };
  } });
  const original = { ...input, targetClientId: 'codex-a' };
  const unknown = await dispatch.send(original);
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.retryFromOperationId, undefined);
  await assert.rejects(dispatch.send({ ...original, retryFromOperationId: unknown.operationId }), { status: 409 });
  outcome = 'conflict';
  const different = { ...original, submissionId: 'another' };
  const conflict = await dispatch.send(different);
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.retryFromOperationId, undefined);
  await assert.rejects(dispatch.send({ ...different, retryFromOperationId: conflict.operationId }), { status: 409 });
  assert.equal(count, 2);
});

test('an uncertain send only queries its existing FlowDesk receipt', async t => {
  const { options, input } = await fixture(t);
  let original;
  const first = createReviewDispatch({ ...options, async transport(name, args) {
    assert.equal(name, 'native_message_send');
    original = args;
    throw new Error('stdio closed after send');
  } });
  const unknown = await first.send(input);
  assert.equal(unknown.status, 'unknown');
  const lookups = [];
  const second = createReviewDispatch({ ...options, async transport(name, args) {
    lookups.push([name, args]);
    return { state: 'recorded', receipt: queueReceipt(original) };
  } });

  assert.deepEqual(await second.send(input), unknown);
  const queued = await second.status(input.roundId, input.submissionId);
  assert.equal(queued.status, 'queued');
  assert.equal(queued.operationId, unknown.operationId);
  assert.deepEqual(await second.status(input.roundId, input.submissionId), queued);
  assert.deepEqual(lookups, [['native_message_status', { operation_id: unknown.operationId }]]);
});

test('unverified status preserves uncertainty and prevents repeated queries or sends', async t => {
  const { options, input } = await fixture(t);
  let count = 0;
  let original;
  const dispatch = createReviewDispatch({ ...options, async transport(name, args) {
    count += 1;
    if (name === 'native_message_send') {
      original = args;
      return { operation_id: args.operation_id, outcome: 'unknown' };
    }
    return { state: 'recorded', receipt: { ...queueReceipt(original), target_thread_id: randomUUID() } };
  } });
  assert.deepEqual(await dispatch.status(input.roundId, input.submissionId), { status: 'unsent' });
  await assert.rejects(dispatch.send({ ...input, targetThreadId: undefined }), { status: 400 });
  await assert.rejects(dispatch.send({ ...input, documentPaths: ['../private.md'] }), { status: 400 });
  const unknown = await dispatch.send(input);
  assert.equal((await dispatch.status(input.roundId, input.submissionId)).status, 'unknown');
  assert.equal((await dispatch.status(input.roundId, input.submissionId)).status, 'unknown');
  assert.equal((await dispatch.send(input)).operationId, unknown.operationId);
  assert.equal(count, 2);
});
