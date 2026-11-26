import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createStore } from '../store.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(join(tmpdir(), 'flowdesk-submission-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(join(root, '方案.md'), '# 方案\n\n待评审段落。\n');
  const dataDir = join(root, 'data');
  const store = createStore({ vaultDir: root, dataDir });
  const round = store.create({ title: '第一轮', paths: ['方案.md'] });
  const [document] = round.documents;
  const invite = store.authorize(round.id, store.issueInvite(round.id, { reviewer: '甲' }).token);
  const submit = payload => store.submit(round.id, invite, payload);
  const item = { id: 'item-1', documentId: document.id, blockId: document.blocks[1].id, kind: 'comment' };
  const input = { id: 'submission-1', decision: 'comment', items: [item] };
  return { store, round, invite, input, item, submit, dataDir };
}

const conflict = { status: 409, code: 'submission_conflict' };

test('submission retries require the same normalized content, including old and closed records', t => {
  const { store, round, invite, input, item, submit, dataDir } = fixture(t);
  const accepted = submit(input);
  const equivalent = { ...input, summary: '', items: [{ ...item, quote: '', required: false, offset: null }] };
  assert.deepEqual(submit(equivalent), accepted);
  assert.throws(() => submit({ ...input, decision: 'changes' }), conflict);
  assert.throws(() => submit({ ...input, summary: '另一份总体说明' }), conflict);
  assert.throws(() => submit({ ...input, items: [{ ...item, comment: '补充一条批注' }] }), conflict);
  assert.throws(() => submit({ ...input, items: [{ ...item, required: true }] }), conflict);
  assert.throws(() => submit({ ...input, items: [{ ...item, offset: 0 }] }), conflict);
  assert.deepEqual(store.reviewerView(round.id, invite).submission, accepted);
  assert.equal(store.get(round.id).submissionCount, 1);

  const directory = join(dataDir, 'rounds', round.id, 'submissions');
  const [savedFile] = fs.readdirSync(directory).map(name => join(directory, name));
  const saved = JSON.parse(fs.readFileSync(savedFile, 'utf8'));
  delete saved.items[0].required;
  fs.writeFileSync(savedFile, JSON.stringify(saved));
  const { required, ...oldItem } = accepted.items[0];
  assert.deepEqual(submit(equivalent), { ...accepted, items: [oldItem] });

  const next = submit({ ...input, id: 'submission-2', summary: '追加反馈' });
  store.close(round.id);
  assert.deepEqual(submit({ ...input, id: next.id, summary: '追加反馈' }), next);
  assert.throws(() => submit({ ...input, id: next.id, summary: '改动已提交内容' }), conflict);
  assert.throws(() => submit({ ...input, id: 'submission-3' }), { status: 409, message: '评审轮次已关闭' });
  assert.deepEqual(store.reviewerView(round.id, invite).submission, next);
  assert.equal(store.get(round.id).submissionCount, 2);
});

test('a competing atomic write uses the same retry and conflict semantics', t => {
  const { store, round, input, submit } = fixture(t);
  const linkSync = fs.linkSync;
  let winningSummary = '';
  t.mock.method(fs, 'linkSync', (source, destination) => {
    const candidate = JSON.parse(fs.readFileSync(source, 'utf8'));
    fs.writeFileSync(destination, JSON.stringify({ ...candidate, summary: winningSummary }), { flag: 'wx' });
    return linkSync(source, destination);
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });

  assert.equal(submit(input).id, input.id);
  winningSummary = '竞争者的反馈';
  assert.throws(() => submit({ ...input, id: 'submission-2' }), conflict);
  assert.deepEqual(store.get(round.id).submissions.map(record => record.summary), ['', winningSummary]);
});
