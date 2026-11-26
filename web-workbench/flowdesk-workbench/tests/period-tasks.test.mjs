import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readManagedWorkspaceTask, readPeriodTasks } from '../tasks.mjs';

const alpha = 'Notes/Projects/Alpha.md';
const linkedCase = 'Notes/Sessions/2026-11-24-Alpha-联调.md';
const options = { from: '2026-11-23', to: '2026-11-29', today: '2026-11-26' };

function task(key, fields) {
  const path = 'Tasks/' + key + '.md';
  return { id: path, path, title: key, status: 'open', archived: false, ...fields };
}

test('reads the TaskNotes period with exact Shanghai dates, project relationships and safe detail reads', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'flowdesk-period-tasks-'));
  const vault = await realpath(directory);
  const tasks = join(vault, 'Tasks');
  await mkdir(tasks);
  const localTask = task('unassigned', {});
  await writeFile(join(vault, localTask.path), '# 普通任务\n');
  const unrelated = join(vault, 'reference.md');
  await writeFile(unrelated, '# 参考资料\n');
  await symlink(unrelated, join(tasks, 'alias.md'));

  const due = task('due', { due: '2026-11-24', projects: ['[[Alpha]]'] });
  const scheduled = task('scheduled', { scheduled: '2026-11-22T17:00:00Z', projects: ['[[Alpha]]'] });
  const contextual = task('context', { contexts: ['@2026-11-24-Alpha-联调'] });
  const explicit = task('explicit', { status: 'on-hold' });
  const overdue = task('overdue', { due: '2026-11-21', projects: ['Notes/Projects/Alpha.md'] });
  const other = task('other', { projects: ['[[Alpha-Similar]]'] });
  const archivedOpen = task('archived-open', { archived: true, projects: ['[[Alpha]]'] });
  const done = task('done', { status: 'done', archived: true, projects: ['[[Alpha]]'],
    completedDate: '2026-11-28T21:00:00Z', dateModified: '2026-12-02T09:20:00Z' });
  const reopened = task('reopened', { status: 'open', archived: false, projects: ['[[Alpha]]'], completedDate: '2026-11-26' });
  const doneOutside = task('done-outside', { status: 'done', projects: ['[[Alpha]]'], completedDate: '2026-11-30', dateModified: '2026-11-25' });
  const noCompletion = task('no-completion', { status: 'done', projects: ['[[Alpha]]'], dateModified: '2026-11-25' });
  const cancel = task('cancel', { status: 'cancel', archived: true, projects: ['[[Alpha]]'],
    completedDate: '2026-11-14', dateModified: '2026-11-22T18:30:00Z' });
  const cancelOutside = task('cancel-outside', { status: 'cancel', projects: ['[[Alpha]]'],
    completedDate: '2026-11-25', dateModified: '2026-11-22T13:30:00Z' });
  const source = [due, scheduled, contextual, explicit, overdue, localTask, other, archivedOpen, done, reopened, doneOutside, noCompletion, cancel, cancelOutside];
  const filters = [];
  let incomplete = false;
  const server = createServer(async (request, response) => {
    let data;
    if (request.url === '/api/health') {
      data = { status: 'ok', vault: { path: vault } };
    } else if (request.url === '/api/filter-options') {
      data = { statuses: ['open', 'in-progress', 'on-hold', 'done', 'cancel'].map(value => ({ value, isCompleted: ['done', 'cancel'].includes(value) })) };
    } else if (request.url === '/api/tasks/query') {
      const query = JSON.parse(await Array.fromAsync(request).then(chunks => Buffer.concat(chunks).toString()));
      filters.push(query);
      const property = query.children[0].property;
      let candidates;
      if (property === 'archived') candidates = incomplete ? source.filter(entry => !entry.archived).slice(0, 1) : source.filter(entry => !entry.archived);
      else if (property === 'completedDate') candidates = [done, reopened, doneOutside, cancelOutside];
      else candidates = [cancel, cancelOutside];
      data = { tasks: candidates, filtered: candidates.length + Number(property === 'archived' && incomplete) };
    } else if (request.url === '/api/tasks/' + encodeURIComponent(localTask.path)) {
      data = localTask;
    } else if (request.url === '/api/tasks/' + encodeURIComponent('Tasks/alias.md')) {
      data = task('alias', {});
    } else if (request.url === '/api/tasks/' + encodeURIComponent('reference.md')) {
      data = { ...localTask, id: 'reference.md', path: 'reference.md' };
    }
    response.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const previousUrl = process.env.TASKNOTES_API_URL;
  process.env.TASKNOTES_API_URL = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    if (previousUrl === undefined) delete process.env.TASKNOTES_API_URL;
    else process.env.TASKNOTES_API_URL = previousUrl;
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  const scoped = await readPeriodTasks({ ...options, vaultDir: vault, projectPath: alpha, casePaths: [linkedCase], taskPaths: [explicit.path] });
  assert.equal(scoped.source.status, 'ok');
  assert.deepEqual(scoped.taskPool.inPeriod.map(({ title, periodDate }) => [title, periodDate]), [
    ['scheduled', '2026-11-23'], ['due', '2026-11-24'], ['context', null], ['explicit', null],
  ]);
  assert.deepEqual(scoped.taskPool.carryover.map(({ title }) => title), ['overdue', 'reopened']);
  assert.deepEqual(scoped.completed.map(({ title, periodDate, periodOutcome, archived }) => [title, periodDate, periodOutcome, archived]), [
    ['done', '2026-11-29', 'completed', true], ['cancel', '2026-11-23', 'cancelled', true],
  ]);
  assert.equal(filters.length, 3);
  const completionQuery = filters.find(query => query.children[0].property === 'completedDate');
  assert.deepEqual(completionQuery.children.map(condition => condition.value), ['2026-11-22', '2026-11-30']);

  const all = await readPeriodTasks({ ...options, vaultDir: vault });
  assert.ok(all.taskPool.carryover.some(item => item.path === localTask.path));
  assert.ok(all.taskPool.carryover.some(item => item.path === other.path));
  assert.equal((await readManagedWorkspaceTask(localTask.path, { vaultDir: vault })).path, localTask.path);
  assert.equal(await readManagedWorkspaceTask('Tasks/alias.md', { vaultDir: vault }), null);
  assert.equal(await readManagedWorkspaceTask('reference.md', { vaultDir: vault }), null);

  incomplete = true;
  const limited = await readPeriodTasks({ ...options, vaultDir: vault, projectPath: alpha });
  assert.equal(limited.source.status, 'degraded');
  assert.match(limited.source.detail, /查询结果不完整/u);
  assert.deepEqual(limited.taskPool, { inPeriod: [], carryover: [] });
  assert.equal(limited.completed.length, 2);
});
