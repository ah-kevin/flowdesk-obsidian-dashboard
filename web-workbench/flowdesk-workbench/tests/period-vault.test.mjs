import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { readDocHub } from '../doc-hub.mjs';
import { readManagedDocument, readPeriodCases, readPeriodDocuments, readVaultLibrary } from '../vault.mjs';

async function fixture(t, files) {
  const vault = await realpath(await mkdtemp(join(tmpdir(), 'flowdesk-period-vault-')));
  t.after(() => rm(vault, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    const target = join(vault, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return vault;
}

test('Stage Cases use authored dates and Progress, with ongoing carryover limited to the current Stage', async t => {
  const project = 'Notes/Projects/Alpha.md';
  const created = 'Notes/Sessions/2026-11-23-新建.md';
  const worked = 'Notes/Sessions/2026-10-26-历史活动.md';
  const carryover = 'Notes/Sessions/2026-10-22-阻塞.md';
  const parked = 'Notes/Sessions/2026-10-20-暂放.md';
  const untimed = 'Notes/Sessions/2026-11-25-未记录日期.md';
  const endDay = 'Notes/Sessions/2026-11-29-边界.md';
  const vault = await fixture(t, {
    [project]: `---\ntype: project\n---\n[[${created}]]\n[[${worked}]]\n`,
    [created]: '---\ntype: work-case\ndate: 2026-11-23\nagent: codex\n---\n# 新建',
    [worked]: [
      '---', 'type: work-case', 'date: 2026-10-26', 'status: done', 'archived: true', '---',
      '# 历史活动', '', '## Progress', '', '> [!faq]- 详细过程日志', '>',
      '> - [x] `2026-11-23 00:03` <!-- flowdesk.progress-time/1 2026-11-22T16:03:00Z --> 阶段活动',
      '> - [x] `2026-11-30 00:02` <!-- flowdesk.progress-time/1 2026-11-29T16:02:00Z --> 下个阶段',
    ].join('\n'),
    [carryover]: '---\ntype: session\ndate: 2026-10-22\nstatus: blocked\n---\n# 阻塞',
    [parked]: '---\ntype: work-case\ndate: 2026-10-20\nstatus: parked\n---\n# 暂放',
    [untimed]: '---\ntype: work-case\nstatus: done\n---\n# 未记录日期',
    [endDay]: '---\ntype: work-case\ndate: 2026-11-29\nstatus: done\n---\n# 边界',
  });
  const library = await readVaultLibrary(vault);
  const range = { from: '2026-11-23', to: '2026-11-29', today: '2026-11-26' };
  const rows = readPeriodCases(library, range);
  assert.deepEqual(rows.map(row => [row.path, row.stageReason, row.stageActivityAt]), [
    [endDay, 'created', '2026-11-29'], [worked, 'progress', '2026-11-22T16:03:00.000Z'],
    [created, 'created', '2026-11-23'], [carryover, 'carryover', null],
  ]);
  assert.equal(library.cases.get(untimed).date, null);
  assert.equal(library.cases.get(worked).archived, true);
  assert.equal(library.cases.get(created).agent, 'codex');
  assert.deepEqual(library.cases.get(carryover).projects, []);
  assert.deepEqual(library.projects.get(project).cases.map(record => record.path), [created]);
  assert.deepEqual(readPeriodCases(library, { ...range, projectPath: project }).map(row => row.path), [worked, created]);
  assert.deepEqual(readPeriodCases(library, { ...range, today: '2026-12-01' }).map(row => row.path), [endDay, worked, created]);
});

test('Stage evidence joins explicit managed files and raw gallery links with their Case and Task origins', async t => {
  const casePath = 'Notes/Sessions/2026-11-25-阶段.md';
  const taskPath = 'Tasks/阶段任务.md';
  const notePath = 'Notes/Docs/阶段说明.md';
  const nested = 'Notes/Plans/模块/联调.md';
  const archived = 'Notes/Plans/Archive/旧稿.md';
  const privateNote = 'Private/秘密.md';
  const symlinkPath = 'Notes/Plans/模块/软链.md';
  const caseGallery = '../../Attachments/archify/试点/index.html#map';
  const taskGallery = '../Attachments/archify/联调/pages/runtime.html';
  const noteGallery = '../../Attachments/archify/说明/index.html';
  const vault = await fixture(t, {
    [casePath]: [
      '---', 'type: work-case', 'date: 2026-11-25', 'plans:', `  - "[[${nested}]]"`, `  - "[[${archived}]]"`,
      'docs: "[[阶段说明]]"', '---', '# 阶段 Case', '', '## Current', '', `[图集](${caseGallery})`,
    ].join('\n'),
    [taskPath]: [
      '---', `related: "[[${nested}]]"`, '---', '# 阶段任务', '',
      '[[Notes/Docs/阶段说明|原文]]', '', `[运行图](${taskGallery})`, '',
      '[[Notes/Docs/目前缺失]]', '', `[[${privateNote}]]`, '', '`[[Notes/Docs/代码中的引用]]`',
    ].join('\n'),
    [notePath]: `# 阶段说明\n\n[图集](${noteGallery})`,
    [nested]: '# 联调正文', [archived]: '# 旧稿', [privateNote]: '# 私有',
  });
  await symlink(join(vault, privateNote), join(vault, symlinkPath));
  const [library, hub] = await Promise.all([readVaultLibrary(vault), readDocHub(vault)]);
  const cases = readPeriodCases(library, { from: '2026-11-23', to: '2026-11-29', today: '2026-11-26' });
  const task = { id: taskPath, path: taskPath, title: '阶段任务' };
  const relatedCase = { kind: 'case', id: casePath, title: '阶段 Case' };
  const relatedTask = { kind: 'task', id: taskPath, title: '阶段任务' };
  const result = await readPeriodDocuments(library, cases, [task, task], hub.documents);
  assert.deepEqual(new Set(result.documents.map(doc => doc.path)), new Set([notePath, nested]));
  for (const document of result.documents) assert.deepEqual(document.relatedTo, [relatedCase, relatedTask]);
  assert.equal(result.unreadable, 1);
  assert.deepEqual(result.galleryReferences, [
    { source: casePath, ref: encodeURI(caseGallery), relatedTo: [relatedCase] },
    { source: taskPath, ref: encodeURI(taskGallery), relatedTo: [relatedTask] },
    { source: notePath, ref: encodeURI(noteGallery), relatedTo: [relatedCase, relatedTask] },
  ]);
  assert.equal((await readManagedDocument(library, nested, hub.documents)).path, nested);
  for (const path of [archived, privateNote, symlinkPath, 'Notes/Plans/../../../秘密.md', '/Notes/Plans/秘密.md']) {
    assert.equal(await readManagedDocument(library, path, hub.documents), null);
  }
});
