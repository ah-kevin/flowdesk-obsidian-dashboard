import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const file = '2026-11-22-样例日志 Case';
const casePath = `Notes/Sessions/${file}.md`;
const context = '@' + file;
const embed = '![[Tasks.base#Session关联任务]]';

function task(name, fields = {}) {
  const path = `Tasks/${name}.md`;
  return { id: path, path, title: name, contexts: [context], tags: ['task'], status: 'open', priority: 'low', ...fields };
}

test('an accessible Case renders the exact read-only TaskNotes view without changing the source or its anchors', { timeout: 12000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flowdesk-task-base-'));
  const vault = await realpath(dir);
  const parent = task('父任务', { title: '父任务 <标记>', priority: 'high', due: '2026-11-22', projects: ['[[NiuSaaS]]'] });
  const child = task('子任务', { status: 'cancel', archived: true, projects: ['[[父任务]]'] });
  const done = task('已完成任务', { status: 'done', archived: true });
  const normal = task('普通任务');
  const records = [done, normal, child, parent, task('相似 Case 其他任务', { contexts: [context + '-不同'] }),
    task('遗漏正式标签', { tags: ['reference'] }), task('项目相关任务', { contexts: [], projects: ['[[NiuSaaS]]'] })];
  const source = ['---', 'type: work-case', '---', '# Case 样例', '', '嵌入之前。', '', embed, '', '嵌入之后。', '',
    '```md', embed, '```', '', '行内示例 ' + embed, '', '![[Bases/Tasks.base#Session关联任务]]', ''].join('\n');
  const files = [[casePath, source], ['Notes/Docs/展示语法.md', '# 展示语法\n\n' + embed], ...records.map(row => [row.path, '# ' + row.title])];
  await Promise.all(files.map(async ([path, text]) => {
    const target = join(vault, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }));

  let state = 'ok';
  const queries = [];
  let service;
  const taskNotes = createServer(async (request, response) => {
    let data;
    if (request.url === '/api/health') data = { status: 'ok', vault: { path: state === 'different-vault' ? '/out-of-scope' : vault } };
    if (request.url === '/api/filter-options') data = {
      statuses: ['open', 'done', 'cancel'].map((value, order) => ({ value, order, label: ['待办', '完成', '取消'][order] })),
      priorities: [{ value: 'low', label: '低', weight: 1 }, { value: 'high', label: '高', weight: 3 }],
    };
    if (request.url === '/api/tasks/query') {
      const query = JSON.parse(Buffer.concat(await Array.fromAsync(request)).toString());
      if (query.id === 'flowdesk-case-task-base') queries.push(query);
      const selected = state === 'empty' ? [] : records;
      data = { tasks: selected, filtered: selected.length + Number(state === 'partial') };
    }
    if (request.url?.startsWith('/api/tasks/')) data ??= records.find(row => encodeURIComponent(row.path) === request.url.slice('/api/tasks/'.length));
    response.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data }));
  });
  taskNotes.listen(0, '127.0.0.1');
  await once(taskNotes, 'listening');
  t.after(async () => {
    if (service && service.exitCode === null && service.signalCode === null) {
      const stopped = once(service, 'exit');
      service.kill();
      await stopped;
    }
    await new Promise(resolve => taskNotes.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  service = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], {
    env: { ...process.env, FLOWDESK_WORKBENCH_VAULT: vault, FLOWDESK_WORKBENCH_REVIEW_DATA: join(vault, 'reviews'),
      FLOWDESK_WORKBENCH_PORT: '0', FLOWDESK_WORKBENCH_LAN_HOST: '', FLOWDESK_WORKBENCH_REQUIRE_PAIRING: '0',
      TASKNOTES_API_URL: 'http://127.0.0.1:' + taskNotes.address().port, TASKNOTES_API_TOKEN: '', TASKNOTES_AUTH_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let origin;
  for await (const line of createInterface({ input: service.stdout })) {
    const address = line.match(/http:\/\/127\.0\.0\.1:\d+/u);
    if (address) { [origin] = address; break; }
  }
  assert.ok(origin);
  const detail = async (kind, id) => {
    const response = await fetch(origin + '/api/detail?' + new URLSearchParams({ kind, id }));
    assert.equal(response.status, 200);
    return response.json();
  };

  const current = await detail('case', casePath);
  assert.equal(current.markdown, source);
  assert.match(current.html, /<p data-source-line="6">嵌入之前。<\/p>/u);
  assert.match(current.html, /<p data-source-line="10">嵌入之后。<\/p>/u);
  assert.equal([...current.html.matchAll(/<section class="reader-case-task-base" data-reader-feedback-ui /gu)].length, 2);
  assert.match(current.html, /<code data-source-line="12" class="language-md">!\[\[Tasks\.base#Session关联任务\]\]/u);
  assert.match(current.html, /行内示例 !\[\[Tasks\.base#Session关联任务\]\]/u);
  assert.match(current.html, /父任务 &lt;标记&gt;/u);
  assert.match(current.html, /<summary>1 项子任务<\/summary>.*子任务.*已归档.*取消/u);
  assert.match(current.html, /已完成任务<\/a> <small>已归档<\/small>/u);
  assert.match(current.html, /2026-11-22/u);
  assert.doesNotMatch(current.html, /相似 Case 其他任务|遗漏正式标签|项目相关任务/u);
  assert.ok(current.html.indexOf('父任务 &lt;标记&gt;') < current.html.indexOf('普通任务'));
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].children.map(({ property, value }) => [property, value]), [['contexts', context], ['tags', 'task']]);
  assert.equal(queries[0].conjunction, 'and');

  const taskHref = '#/tasks/' + encodeURIComponent(child.path);
  assert.ok(current.html.includes(`href="${taskHref}"`));
  assert.equal((await detail('task', child.path)).path, child.path);
  assert.match((await detail('document', 'Notes/Docs/展示语法.md')).html, /!\[\[Tasks\.base#Session关联任务\]\]/u);
  assert.equal(queries.length, 1);

  state = 'empty';
  assert.match((await detail('case', casePath)).html, /当前 Case 暂无关联任务/u);
  state = 'partial';
  assert.match((await detail('case', casePath)).html, /当前无法读取关联任务/u);
  state = 'different-vault';
  assert.match((await detail('case', casePath)).html, /当前无法读取关联任务/u);
});
