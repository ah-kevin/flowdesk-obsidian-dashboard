import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, get as httpGet } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { galleryVaultPath } from '../gallery.mjs';
import { periodRange } from '../period.mjs';
import { createStore } from '../../flowdesk-review/store.mjs';

test('the default period starts on Monday in Shanghai', () => {
  assert.deepEqual(periodRange(null, null, new Date('2026-11-22T16:00:00Z')),
    { from: '2026-11-23', to: '2026-11-29', today: '2026-11-23' });
});

test('author pairing protects the workspace while preserving scoped guest review links', { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'flowdesk-pair-integration-'));
  const vault = join(directory, 'vault');
  const dataDir = join(directory, 'reviews');
  const document = 'Notes/Docs/评审配对测试.md';
  const note = join(vault, document);
  await mkdir(dirname(note), { recursive: true });
  await writeFile(note, '# 配对测试\n\n可见正文。\n');
  const store = await createStore({ vaultDir: vault, dataDir });
  const round = await store.create({ title: '访客评审', paths: [document], mode: 'snapshot' });
  const invite = await store.issueInvite(round.id, { reviewer: '测试访客', expiresInHours: 1 });
  const env = { ...process.env, FLOWDESK_WORKBENCH_VAULT: vault, FLOWDESK_WORKBENCH_REVIEW_DATA: dataDir,
    FLOWDESK_WORKBENCH_PORT: '0', FLOWDESK_WORKBENCH_LAN_HOST: '', FLOWDESK_WORKBENCH_REQUIRE_PAIRING: '1' };
  delete env.FLOWDESK_WORKBENCH_PAIRING_KEY;
  const service = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], {
    env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  service.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    if (service.exitCode === null && service.signalCode === null) {
      const exited = once(service, 'exit');
      service.kill();
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const [ready] = await once(service, 'message', { signal: AbortSignal.timeout(5000) });
  assert.equal(ready.type, 'flowdesk-workbench-ready', stderr);
  const origin = 'http://127.0.0.1:' + ready.port;
  const get = (path, options) => fetch(origin + path, options);
  const post = (path, input) => get(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(input),
  });
  const unpaired = await get('/', { redirect: 'manual' });
  assert.equal(unpaired.status, 302);
  assert.equal(unpaired.headers.get('location'), '/pair');
  assert.match(await (await get('/pair')).text(), /作者配对/);
  assert.equal((await get('/pair.js')).status, 200);
  const authorApi = '/api/author-pairing';
  assert.deepEqual(await (await get(authorApi)).json(), { required: true, paired: false });
  const guestPage = await get('/r/' + round.id);
  assert.equal(guestPage.status, 200);
  const guestApi = '/api/review/' + round.id;
  const guestLogin = await post(guestApi + '/session', { token: invite.token });
  assert.equal(guestLogin.status, 200);
  const guestCookie = guestLogin.headers.get('set-cookie').split(';', 1)[0];
  const guestOptions = { headers: { cookie: guestCookie } };
  const shared = await (await get(guestApi, guestOptions)).json();
  assert.equal(shared.review.documents.length, 1);
  assert.equal((await get(guestApi, { headers: { cookie: guestCookie, 'sec-fetch-site': 'cross-site' } })).status, 200);
  for (const privatePath of ['/api/workbench', '/api/doc-hub', '/api/admin/documents', '/api/admin/review-targets',
    '/api/admin/external-reviews/catalog', '/api/admin/external-reviews', '/external-review', '/gallery/', '/api/reader-images/' + '0'.repeat(64)]) {
    assert.equal((await get(privatePath, guestOptions)).status, 401, privatePath);
  }
  const pairing = await post(authorApi, { key: 'qwe123' });
  assert.equal(pairing.status, 200);
  assert.deepEqual(await pairing.json(), { paired: true });
  const authorCookie = pairing.headers.get('set-cookie').split(';', 1)[0];
  const authorOptions = { headers: { cookie: authorCookie } };
  assert.equal((await get('/', authorOptions)).status, 200);
  assert.deepEqual(await (await get(authorApi, authorOptions)).json(), { required: true, paired: true });
  const catalog = await (await get('/api/admin/external-reviews/catalog', authorOptions)).json();
  assert.ok(catalog.documents.some(item => item.path === document));
  assert.match(catalog.publishingBlocked, /修改默认配对密钥/);
  const publication = await get('/api/admin/external-reviews', {
    method: 'POST', headers: { ...authorOptions.headers, 'Content-Type': 'application/json', Origin: origin }, body: '{}',
  });
  assert.equal(publication.status, 409);
  assert.match((await publication.json()).error, /修改默认配对密钥/);
});

test('LAN mode uses a single wildcard listener and accepts requests addressed by another host name', { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'flowdesk-wildcard-'));
  const vault = join(directory, 'vault');
  const gallery = join(vault, galleryVaultPath);
  await mkdir(dirname(gallery), { recursive: true });
  await writeFile(gallery, '<title>局域网图集</title>');
  const service = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], {
    env: { ...process.env, FLOWDESK_WORKBENCH_VAULT: vault, FLOWDESK_WORKBENCH_REVIEW_DATA: join(directory, 'reviews'),
      FLOWDESK_WORKBENCH_PORT: '0', FLOWDESK_WORKBENCH_LAN_HOST: '0.0.0.0' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  t.after(async () => {
    if (service.exitCode === null && service.signalCode === null) {
      const exited = once(service, 'exit');
      service.kill();
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const [message] = await once(service, 'message', { signal: AbortSignal.timeout(5000) });
  assert.equal(message.type, 'flowdesk-workbench-ready');
  assert.equal(message.lanHost, '0.0.0.0');
  for (const path of ['/', '/annotate/', '/gallery/', '/api/admin/documents']) {
    const response = await new Promise((resolve, reject) => {
      httpGet({ hostname: '127.0.0.1', port: message.port, path,
        headers: { host: 'flowdesk.test', 'sec-fetch-site': 'cross-site' } }, incoming => {
        incoming.resume();
        resolve(incoming.statusCode);
      }).on('error', reject);
    });
    assert.equal(response, 200, path);
  }
});

test('one local HTTP entry serves workbench, gallery, and live review receipts', { timeout: 12000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'flowdesk-local-service-'));
  const vault = join(directory, 'vault');
  const data = join(directory, 'reviews');
  const notePath = 'Notes/Docs/巡检方案.md';
  const projectPath = 'Notes/Projects/Alpha.md';
  const otherProjectPath = 'Notes/Projects/Beta 项目.md';
  const unrelatedPath = 'Notes/Docs/其他项目资料.md';
  const researchPath = 'Notes/Research/Cafe\u0301 现场调研.md';
  const nestedPath = 'Notes/Plans/Alpha details/边界规则.md';
  const privatePath = 'Notes/Docs/Archive/历史私有资料.md';
  const outsidePath = 'Private/隐私记录.md';
  const symlinkPath = 'Notes/Research/非索引文件.md';
  const casePath = 'Notes/Sessions/2026-11-25-Alpha-联调.md';
  const archivedCasePath = 'Notes/Sessions/归档 Case.md';
  const otherCasePath = 'Notes/Sessions/2026-11-25-Beta-联调.md';
  const unassignedCasePath = 'Notes/Sessions/2026-11-25-跨项目联调.md';
  const taskPath = 'Tasks/工作台联调任务.md';
  const otherTaskPath = 'Tasks/Beta 项目任务.md';
  const unrelatedTask = 'Tasks/其他项目任务.md';
  const completedTask = 'Tasks/阶段完成.md';
  const otherGalleryName = 'Alpha 图集';
  const otherGalleryPath = 'Attachments/archify/' + otherGalleryName;
  const otherGalleryPage = otherGalleryPath + '/pages/执行说明.html';
  const previewPath = otherGalleryPath + '/pages/预览.svg';
  const ordinaryImage = 'Attachments/手册资料/常规图片.png';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF90AAAAASUVORK5CYII=', 'base64');
  const hiddenGalleryPage = otherGalleryPath + '/source/内部源稿.html';
  const linkedGalleryPage = otherGalleryPath + '/pages/别名.html';
  const otherGalleryEntry = '<title>调研图集</title><a href="pages/执行说明.html">执行说明</a>';
  const pageHTML = '<title>执行说明</title><h2>公开图集内容</h2>';
  const note = join(vault, notePath);
  const project = join(vault, projectPath);
  const gallery = join(vault, galleryVaultPath);
  let service;
  let tasksService;
  t.after(async () => {
    if (service && service.exitCode === null && service.signalCode === null) {
      const exited = once(service, 'exit');
      service.kill();
      await exited;
    }
    if (tasksService?.listening) await new Promise(resolve => tasksService.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const paths = [casePath, taskPath, researchPath, nestedPath, privatePath, outsidePath, otherGalleryPage, hiddenGalleryPage, ordinaryImage];
  await Promise.all([note, project, gallery, ...paths.map(path => join(vault, path))]
    .map(path => mkdir(dirname(path), { recursive: true })));
  const initial = '# 巡检方案\n\n间隔十分钟，最多重试三次。\n\n[边界规则](../Plans/Alpha%20details/边界规则.md)\n\n'
    + `[图集子页](../../${otherGalleryPage.replace(' ', '%20')})\n\n[[${otherGalleryPage}|图集子页别名]]\n\n`
    + `![[${previewPath}|图库预览]]\n\n![图集内插图](../../${previewPath.replace(' ', '%20')})\n\n`
    + `![普通截图](../../${ordinaryImage})\n\n![[${ordinaryImage}|120]]\n`;
  const projectSource = '---\ntype: project\ntitle: 项目属性标题\n---\n# Alpha 原文标题\n\n项目正文可读取。\n\n[[Notes/Docs/巡检方案]]\n\n[['
    + casePath + ']]\n\n[[' + archivedCasePath + ']]\n\n[[' + otherProjectPath + '|配套项目]]\n';
  const otherProjectSource = '---\ntype: project\nstatus: parked\nrelated_projects: []\n---\n# Beta 原文标题\n\n[[Alpha]]\n\n[['
    + researchPath.normalize('NFC') + ']]';
  const caseSource = [
    '---', 'type: work-case', '---', '# 联调 Case', '', 'Case 当前稿可读取。', '',
    '## Progress', '', '> [!faq]- 详细过程日志', '>', '> - [x] 第一条进展可定位。', '',
  ].join('\n');
  const taskSource = ['\uFEFF---', 'title: 工作台联调任务', '---', '# 联调 Task', '', 'Task 当前稿可读取。', ''].join('\r\n');
  const researchSource = '---\ntitle: 调研报告\nprojects: [[Beta 项目]]\ntags: [field, visit]\npinned: true\nreviewed: 2026-11-24\nstatus: superseded\n---\n# 调研报告\n\n留存到场数据。\n';
  await Promise.all([
    writeFile(project, projectSource),
    writeFile(join(vault, otherProjectPath), otherProjectSource),
    writeFile(join(vault, 'Notes/Projects/参考索引.md'), '---\ntype: reference\n---\n# 参考索引'),
    writeFile(note, initial),
    writeFile(join(vault, casePath), caseSource),
    writeFile(join(vault, archivedCasePath), '---\ntype: work-case\narchived: true\n---\n# 归档 Case'),
    writeFile(join(vault, otherCasePath), '---\ntype: work-case\nproject: "[[Notes/Projects/Beta 项目]]"\n---\n# Beta Case'),
    writeFile(join(vault, unassignedCasePath), '---\ntype: work-case\ndate: 2026-11-25\nstatus: active\ndocs: ["[[Notes/Docs/巡检方案]]"]\n---\n# 跨项目 Case'),
    writeFile(join(vault, taskPath), taskSource),
    writeFile(join(vault, otherTaskPath), '# Beta 项目任务'),
    writeFile(join(vault, unrelatedTask), '# 其他项目任务'),
    writeFile(join(vault, completedTask), '# 阶段完成任务'),
    writeFile(join(vault, unrelatedPath), '# 未收录资料\n'),
    writeFile(join(vault, researchPath), researchSource),
    writeFile(join(vault, nestedPath), '# 边界规则\n\n通用模块目录。\n'),
    writeFile(join(vault, privatePath), '# 历史私有资料\n'),
    writeFile(join(vault, outsidePath), '# 隐私记录\n'),
    writeFile(gallery, '<!doctype html><title>技术图集</title>'),
    writeFile(join(vault, otherGalleryPath, 'index.html'), otherGalleryEntry),
    writeFile(join(vault, otherGalleryPath, 'artifacts.json'), JSON.stringify({ document: { path: researchPath.normalize('NFC') } })),
    writeFile(join(vault, otherGalleryPage), pageHTML),
    writeFile(join(vault, hiddenGalleryPage), '<title>内部源稿</title>'),
    writeFile(join(vault, previewPath), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>'),
    writeFile(join(vault, ordinaryImage), png),
  ]);
  await symlink(join(vault, outsidePath), join(vault, symlinkPath));
  await symlink(join(vault, outsidePath), join(vault, linkedGalleryPage));
  const oldStore = await createStore({ vaultDir: vault, dataDir: data, defaultMode: 'live' });
  const review = await oldStore.create({ title: '历史评审', paths: [notePath] });
  const invite = await oldStore.issueInvite(review.id, { reviewer: '测试评审人', expiresInHours: 1 });

  const canonicalVault = await realpath(vault);
  const taskRecord = { id: taskPath, path: taskPath, title: '联调 Task', projects: ['Alpha'], status: 'open', isCompleted: false };
  const otherRecord = { ...taskRecord, id: otherTaskPath, path: otherTaskPath, projects: ['[[Notes/Projects/Beta 项目]]'] };
  const unrelatedRecord = { ...taskRecord, id: unrelatedTask, path: unrelatedTask, projects: [], scheduled: '2026-11-26' };
  const completedRecord = { ...unrelatedRecord, id: completedTask, path: completedTask, title: '阶段完成',
    status: 'done', isCompleted: true, completedDate: '2026-11-25' };
  const queries = [];
  tasksService = createServer(async (request, response) => {
    if (request.url === '/api/tasks/query') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      queries.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    }
    const payloads = {
      '/api/health': { status: 'ok', vault: { path: canonicalVault } },
      '/api/filter-options': { statuses: [{ value: 'open', isCompleted: false }, { value: 'done', isCompleted: true }] },
      '/api/tasks/query': { tasks: [taskRecord, otherRecord, unrelatedRecord, completedRecord], total: 4, filtered: 4 },
      ['/api/tasks/' + encodeURIComponent(taskPath)]: { ...taskRecord, details: 'TaskNotes 的旧正文。' },
      ['/api/tasks/' + encodeURIComponent(otherTaskPath)]: otherRecord,
      ['/api/tasks/' + encodeURIComponent(unrelatedTask)]: unrelatedRecord,
      ['/api/tasks/' + encodeURIComponent(completedTask)]: completedRecord,
    };
    const value = payloads[request.url];
    response.writeHead(value ? 200 : 404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(value ? { data: value } : {}));
  });
  await new Promise((resolve, reject) => {
    tasksService.once('error', reject);
    tasksService.listen(0, '127.0.0.1', resolve);
  });

  const launcher = fileURLToPath(new URL('../server.mjs', import.meta.url));
  service = spawn(process.execPath, [launcher], {
    env: {
      ...process.env,
      FLOWDESK_WORKBENCH_VAULT: vault, FLOWDESK_WORKBENCH_REVIEW_DATA: data, FLOWDESK_WORKBENCH_PORT: '0',
      FLOWDESK_WORKBENCH_LAN_HOST: '',
      TASKNOTES_API_URL: 'http://127.0.0.1:' + tasksService.address().port, TASKNOTES_API_TOKEN: '', TASKNOTES_AUTH_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  service.stderr.on('data', chunk => { stderr += chunk; });
  let origin;
  const lines = createInterface({ input: service.stdout });
  for await (const line of lines) {
    const address = line.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (address) { [origin] = address; break; }
  }
  assert.ok(origin, stderr);
  const get = path => fetch(origin + path);
  const post = (path, input, headers = {}) => fetch(origin + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input),
  });
  const api = '/api/admin/reviews';
  assert.equal((await get('/')).status, 200);
  const retiredReviewPage = await fetch(origin + '/review/', { redirect: 'manual' });
  assert.equal(retiredReviewPage.status, 302);
  assert.equal(retiredReviewPage.headers.get('location'), '/');
  assert.equal((await get('/review/?round=' + review.id)).status, 200);
  assert.equal((await get('/annotate/')).status, 200);
  assert.equal((await get('/review/app.js')).status, 200);
  assert.match((await get('/review/choice-menu.js')).headers.get('content-type'), /javascript/);
  assert.match((await get('/review/choice-menu.css')).headers.get('content-type'), /text\/css/);
  assert.match((await get('/gallery/')).headers.get('content-security-policy'), /sandbox allow-scripts/);
  assert.equal((await get('/gallery/unknown.html')).status, 404);
  assert.equal((await post(api, {}, { origin: 'http://10.1.0.2:4327' })).status, 403);
  assert.equal((await post(api, { title: '新的邀请', paths: [notePath], reviewer: '测试评审人' })).status, 404);
  assert.equal((await post(api + '/' + review.id + '/invites', { reviewer: '新评审人' })).status, 404);
  const { documents: library } = await (await get('/api/admin/documents')).json();
  assert.deepEqual(new Set(library.map(document => document.path)),
    new Set([projectPath, otherProjectPath, casePath, otherCasePath, unassignedCasePath, taskPath, otherTaskPath, notePath, unrelatedPath, researchPath, nestedPath]));
  const foreignHostStatus = await new Promise((resolve, reject) => {
    httpGet(origin + '/', { headers: { host: 'unknown.invalid' } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);

  assert.equal(review.mode, 'live');
  assert.equal((await get('/r/' + review.id)).status, 200);
  const reviewerApi = '/api/review/' + review.id;
  const login = await post(reviewerApi + '/session', { token: invite.token });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const current = await (await fetch(origin + reviewerApi, { headers: { cookie } })).json();
  const [document] = current.review.documents;
  const original = document.blocks.find(block => block.text.includes('间隔十分钟'));
  await writeFile(note, initial.replace('\n\n', '\n\n补充说明\n\n'));
  const receipt = await post(reviewerApi + '/submit', {
    id: 'receipt:1', inviteId: current.review.inviteId, decision: 'changes', summary: '补充重试依据',
    documentVersions: [{ documentId: document.id, sha256: document.sha256 }],
    items: [{ id: 'note-1', documentId: document.id, blockId: original.id, kind: 'comment',
      quote: '间隔十分钟', comment: '补充依据', sourceSha256: document.sha256 }],
  }, { cookie });
  assert.equal(receipt.status, 201);
  assert.equal((await receipt.json()).submission.documentVersions[0].sourceStatus, 'stale');
  const status = await get(api + '/' + review.id + '/submissions/receipt%3A1/dispatch');
  assert.deepEqual(await status.json(), { dispatch: { status: 'unsent' } });
  const selected = path => '/api/workbench?' + new URLSearchParams({ project: path, refresh: 1 });
  const projection = await (await get(selected(projectPath))).json();
  assert.deepEqual(new Set(projection.projects.map(item => item.path)), new Set([projectPath, otherProjectPath]));
  assert.equal(projection.project.path, projectPath);
  assert.equal(projection.project.title, 'Alpha');
  assert.deepEqual(projection.projects.map(item => item.title), ['Alpha', 'Beta 项目']);
  assert.deepEqual(projection.project.relatedProjects.map(item => item.title), ['Beta 项目']);
  assert.deepEqual(projection.cases.map(item => item.path), [casePath]);
  assert.equal(projection.sources.vault.status, 'ok');
  assert.deepEqual(projection.tasks.map(item => item.path), [taskPath]);
  assert.deepEqual(new Set(projection.documents.map(item => item.path)), new Set([notePath, nestedPath]));
  const other = await (await get(selected(otherProjectPath))).json();
  assert.equal(other.project.path, otherProjectPath);
  assert.deepEqual(other.project.relatedProjects, []);
  assert.deepEqual(other.cases.map(item => item.path), [otherCasePath]);
  assert.deepEqual(other.tasks.map(item => item.path), [otherTaskPath]);
  assert.deepEqual(other.documents.map(item => item.path), [researchPath]);
  assert.deepEqual(queries.at(-1).children.filter(filter => filter.property === 'projects').map(filter => filter.value), ['Beta 项目']);
  const dates = { from: '2026-11-23', to: '2026-11-29' };
  const stage = options => '/api/workbench/period?' + new URLSearchParams({ ...dates, ...options });
  const stageResponse = await get(stage({}));
  assert.equal(stageResponse.status, 200);
  const periodData = await stageResponse.json();
  assert.ok(periodData.cases.some(item => item.id === unassignedCasePath && item.stageReason === 'created'));
  assert.ok(periodData.taskPool.inPeriod.some(item => item.id === unrelatedTask));
  assert.ok(periodData.completed.some(item => item.id === completedTask && item.periodOutcome === 'completed'));
  assert.ok(periodData.documents.some(item => item.id === notePath && item.relatedTo.some(item => item.id === unassignedCasePath)));
  assert.ok(periodData.galleries.some(item => item.id === otherGalleryName));
  assert.equal((await get(stage({ to: '2026-11-01' }))).status, 400);
  assert.equal((await get(stage({ from: '2026-02-30' }))).status, 400);
  assert.equal((await get(stage({ project: 'Notes/Projects/不存在.md' }))).status, 404);
  const filteredStage = await (await get(stage({ project: projectPath }))).json();
  assert.ok(!filteredStage.cases.some(item => item.path === unassignedCasePath));
  assert.ok(!filteredStage.taskPool.inPeriod.some(item => item.path === unrelatedTask));
  for (const [kind, id] of [['case', unassignedCasePath], ['task', unrelatedTask]]) {
    const fromStage = await get('/api/detail?' + new URLSearchParams({ kind, id, project: projectPath }));
    assert.equal(fromStage.status, 200);
    assert.equal((await fromStage.json()).record.path, id);
  }
  assert.equal(projection.reviews[0].href, '/review/?round=' + review.id);
  const details = await (await get('/api/review-summary?' + new URLSearchParams({
    document: notePath, round: review.id,
  }))).json();
  assert.equal(details.round.mode, 'live');
  assert.equal(details.submissions[0].reviewedSourceStatus, 'stale');
  assert.equal(details.submissions[0].items[0].currentAnchor.status, 'relocated');
  assert.equal((await readFile(note, 'utf8')).includes('补充依据'), false);

  const projectDetail = await get('/api/detail?' + new URLSearchParams({ kind: 'project', id: projectPath }));
  assert.equal(projectDetail.status, 200);
  const projectPayload = await projectDetail.json();
  assert.equal(projectPayload.title, 'Alpha');
  assert.equal(projectPayload.markdown, projectSource);
  assert.match(projectPayload.html, /<h1 data-source-line="5">Alpha 原文标题<\/h1>/);
  assert.match(projectPayload.html, /<p data-source-line="7">项目正文可读取。<\/p>/);
  assert.match(projectPayload.html, /href="#\/documents\//);
  assert.ok(projectPayload.html.includes('/?project=' + encodeURIComponent(otherProjectPath) + '#/project'));
  assert.equal(new URL(projectPayload.annotationUrl, origin).searchParams.get('document'), projectPath);
  assert.equal((await get('/api/detail?' + new URLSearchParams({ kind: 'project', id: unrelatedPath }))).status, 404);

  const openDirect = '/api/admin/direct-reviews/open';
  const hub = await (await get('/api/doc-hub')).json();
  assert.deepEqual(new Set(hub.documents.map(item => item.path)), new Set([notePath, unrelatedPath, researchPath]));
  assert.equal(hub.reviews[0].id, review.id);
  const collection = hub.galleries.find(item => item.id === otherGalleryName);
  assert.equal(collection.title, '调研图集');
  assert.equal(collection.documentPath, researchPath);
  assert.deepEqual(collection.projects, ['Beta 项目']);
  assert.deepEqual(collection.pages.map(page => page.title), ['执行说明']);
  const [galleryPage] = collection.pages;
  assert.match(galleryPage.searchText, /公开图集内容/u);
  assert.equal(await (await get(collection.href)).text(), otherGalleryEntry);
  const galleryResponse = await get(galleryPage.href);
  assert.match(galleryResponse.headers.get('content-security-policy'), /sandbox allow-scripts/);
  assert.equal(await galleryResponse.text(), pageHTML);
  assert.equal((await post(galleryPage.href, {})).status, 405);
  for (const route of ['/artifacts.json', '/source/' + encodeURIComponent('内部源稿.html'), '/pages/' + encodeURIComponent('别名.html')]) {
    assert.equal((await get(collection.href.replace(/\/index\.html$/u, route))).status, 404);
  }
  const detailRoute = '/api/detail?' + new URLSearchParams({ kind: 'document', id: notePath });
  const hubReader = await (await get(detailRoute)).json();
  const projectReader = await (await get(detailRoute + '&project=' + encodeURIComponent(projectPath))).json();
  const galleryMarkup = html => html.split('\n').filter(line => line.includes('/gallery/collections/'));
  assert.deepEqual(galleryMarkup(hubReader.html), galleryMarkup(projectReader.html));
  assert.ok(hubReader.html.includes(`href="${galleryPage.href}"`));
  assert.ok(hubReader.html.includes('>图集子页别名</a>'));
  const previewHref = galleryPage.href.replace(/[^/]+$/u, encodeURIComponent('预览.svg'));
  assert.ok(hubReader.html.includes(`<img src="${previewHref}" alt="图库预览"`));
  assert.ok(hubReader.html.includes(`<img src="${previewHref}" alt="图集内插图"`));
  assert.equal((await get(previewHref)).headers.get('content-type'), 'image/svg+xml');
  const imageHref = /<img src="(\/api\/reader-images\/[^"]+)" alt="普通截图"/u.exec(hubReader.html)?.[1];
  assert.ok(imageHref);
  assert.ok(hubReader.html.includes(`<img src="${imageHref}" alt="常规图片.png" width="120"`));
  assert.ok(projectReader.html.includes(imageHref));
  const raster = await get(imageHref);
  assert.equal(raster.status, 200);
  assert.equal(raster.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await raster.arrayBuffer()), png);
  const research = hub.documents.find(item => item.path === researchPath);
  assert.deepEqual({ title: research.title, projects: research.projects, tags: research.tags, pinned: research.pinned,
    status: research.status, kind: research.kind, summary: research.summary },
  { title: '调研报告', projects: ['Beta 项目'], tags: ['field', 'visit'], pinned: true, status: 'superseded',
    kind: 'research', summary: '留存到场数据。' });
  assert.equal(research.reviewedAt, new Date(2026, 10, 24).getTime());
  assert.ok(research.mtime > 0);
  for (const path of [privatePath, outsidePath, symlinkPath]) {
    assert.equal((await get('/api/detail?' + new URLSearchParams({ kind: 'document', id: path }))).status, 404);
    assert.equal((await post(openDirect, { path })).status, 404);
  }
  assert.equal((await get('/api/detail?' + new URLSearchParams({ kind: 'document', id: unrelatedPath }))).status, 200);
  assert.equal((await post(openDirect, { path: unrelatedPath })).status, 200);
  assert.equal((await post(openDirect, { path: unrelatedTask })).status, 200);
  assert.equal((await post(openDirect, { path: projectPath }, { origin: 'http://other.invalid' })).status, 403);
  const opened = await post(openDirect, { path: projectPath });
  assert.equal(opened.status, 200);
  const { review: direct } = await opened.json();
  assert.equal(direct.direct, true);
  const [projectDocument] = direct.documents;
  const projectBlock = projectDocument.blocks.find(block => block.text.includes('项目正文可读取'));
  assert.ok(projectBlock);
  assert.equal(projectBlock.lineStart, 7);
  assert.equal(projectPayload.sourceSha256, projectDocument.sha256);
  assert.equal((await post('/api/review/' + direct.id + '/session', { token: invite.token })).status, 404);
  const draft = {
    id: 'direct-receipt',
    documentVersions: [{ documentId: projectDocument.id, sha256: projectDocument.sha256 }],
    items: [{ id: 'project-note', documentId: projectDocument.id, blockId: projectBlock.id, kind: 'comment',
      quote: '项目正文', comment: '补充项目验收说明', sourceSha256: projectDocument.sha256 }],
  };
  const submitted = await post('/api/admin/direct-reviews/' + direct.id + '/submit', draft);
  assert.equal(submitted.status, 201);
  assert.equal((await submitted.json()).submission.id, 'direct-receipt');
  const summary = await get('/api/review-summary?' + new URLSearchParams({ document: projectPath, round: direct.id }));
  assert.equal(summary.status, 200);
  assert.equal((await summary.json()).submissions[0].items[0].comment, '补充项目验收说明');
  assert.equal(await readFile(project, 'utf8'), projectSource);

  for (const [kind, path, expected, source] of [
    ['case', casePath, 'Case 当前稿可读取', caseSource],
    ['task', taskPath, 'Task 当前稿可读取', taskSource],
    ['document', researchPath, '留存到场数据', researchSource],
  ]) {
    const detail = await get('/api/detail?' + new URLSearchParams({ kind, id: path }));
    assert.equal(detail.status, 200);
    const body = await detail.json();
    const line = kind === 'document' ? 11 : 6;
    assert.ok(body.html.includes('<p data-source-line="' + line + '">' + expected + '。'));
    assert.equal(new URL(body.annotationUrl, origin).searchParams.get('document'), path);
    const open = await post(openDirect, { path });
    assert.equal(open.status, 200);
    const { review } = await open.json();
    const [document] = review.documents;
    const block = document.blocks.find(item => item.text.includes(expected));
    assert.ok(block);
    assert.equal(block.lineStart, line);
    assert.equal(body.sourceSha256, document.sha256);
    if (kind === 'case') {
      const progressBlock = document.blocks.find(item => item.text.includes('第一条进展可定位'));
      const eventLine = 12;
      assert.ok(eventLine >= progressBlock.lineStart && eventLine <= progressBlock.lineEnd);
      assert.match(body.html, /<div class="progress-entry-body"><p data-source-line="12">第一条进展可定位。<\/p>/);
    }
    const submit = await post('/api/admin/direct-reviews/' + review.id + '/submit', {
      id: kind + '-receipt',
      documentVersions: [{ documentId: document.id, sha256: document.sha256 }],
      items: [{ id: kind + '-annotation', documentId: document.id, blockId: block.id, kind: 'highlight',
        quote: expected, sourceSha256: document.sha256 }],
    });
    assert.equal(submit.status, 201);
    const readback = await get('/api/review-summary?' + new URLSearchParams({ document: path, round: review.id }));
    assert.equal(readback.status, 200);
    assert.equal((await readback.json()).submissions[0].items[0].quote, expected);
    assert.equal(await readFile(join(vault, path), 'utf8'), source);
  }
  await writeFile(join(vault, otherProjectPath), otherProjectSource.replace('[[Alpha]]', '')
    .replace('related_projects: []', 'related_projects: ["[[Alpha|别名]]"]'));
  const curated = await (await get(selected(otherProjectPath))).json();
  assert.deepEqual(curated.project.relatedProjects, [{ id: projectPath, path: projectPath, title: 'Alpha' }]);
});
