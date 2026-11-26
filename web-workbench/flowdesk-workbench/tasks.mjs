import { posix, resolve } from 'node:path';
import { readVaultNote } from './vault.mjs';

const defaultApiUrl = 'http://127.0.0.1:18090';
const maxResponseBytes = 8 * 1024 * 1024;
const maxConcurrentTaskReads = 6;
const shanghaiDateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

class TaskNotesError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function strings(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
}

function markdownPath(value) {
  return typeof value === 'string'
    && value.length <= 2048
    && /\.md$/i.test(value)
    && !/[\\:\x00-\x1f\x7f]/.test(value)
    && value.split('/').every(part => part && !part.startsWith('.'));
}

function managedTaskPath(path) {
  return markdownPath(path) && /^(?:Tasks|TaskNotes)\//u.test(path);
}

function referenceTarget(value) {
  const clean = value.trim();
  if (!clean.startsWith('[[') || !clean.endsWith(']]')) return clean;
  return clean.slice(2, -2).split('|', 1)[0].trim();
}

function projectName(value) {
  return referenceTarget(value).replace(/^Notes\/Projects\//, '').replace(/\.md$/i, '').normalize('NFC');
}

function contextCasePath(value) {
  const reference = referenceTarget(value);
  if (reference.startsWith('Notes/Sessions/') && markdownPath(reference)) return reference;
  const basename = reference.replace(/^@/, '').replace(/\.md$/i, '');
  if (!reference.startsWith('@') || !/^\d{4}-\d{2}-\d{2}-[^/]+$/u.test(basename)) return null;
  const path = 'Notes/Sessions/' + basename + '.md';
  return markdownPath(path) ? path : null;
}

function caseScopeFor(casePaths) {
  return new Map(strings(casePaths).filter(path => path.startsWith('Notes/Sessions/') && markdownPath(path))
    .map(path => [path.normalize('NFC'), path]));
}

function taskCasePaths(contexts, caseScope) {
  return [...new Set(strings(contexts).map(contextCasePath).filter(Boolean)
    .map(path => caseScope ? caseScope.get(path.normalize('NFC')) : path).filter(Boolean))];
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function byLatestTask(left, right) {
  const leftTime = Date.parse(left.updatedAt ?? '') || 0;
  const rightTime = Date.parse(right.updatedAt ?? '') || 0;
  return rightTime - leftTime || left.path.localeCompare(right.path, 'zh-CN');
}

function taskMetadata(task, caseScope, expectedPath) {
  if (!isRecord(task)) throw new TaskNotesError('TaskNotes 返回了无效的任务记录。');
  const path = task.path ?? task.id;
  const title = optionalText(task.title);
  if (!markdownPath(path) || !title || (task.id !== undefined && task.id !== path)
    || (expectedPath !== undefined && path !== expectedPath)) {
    throw new TaskNotesError('TaskNotes 的任务标识或标题缺失或不匹配。');
  }
  return {
    id: path, path, title,
    status: optionalText(task.status), priority: optionalText(task.priority),
    due: optionalText(task.due), scheduled: optionalText(task.scheduled),
    updatedAt: optionalText(task.dateModified) ?? optionalText(task.updatedAt),
    projects: [...new Set(strings(task.projects).map(projectName).filter(Boolean))],
    casePaths: taskCasePaths(task.contexts, caseScope),
    isCompleted: [task.status_is_completed, task.statusIsCompleted, task.isCompleted]
      .find(value => typeof value === 'boolean') ?? null,
    ...(typeof task.archived === 'boolean' ? { archived: task.archived } : {}),
    ...(optionalText(task.summary) ? { summary: task.summary.slice(0, 600) } : {}),
  };
}

async function api(endpoint, query) {
  const baseUrl = process.env.TASKNOTES_API_URL?.replace(/\/+$/, '') || defaultApiUrl;
  const token = process.env.TASKNOTES_API_TOKEN || process.env.TASKNOTES_AUTH_TOKEN;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let body;
  if (query) {
    headers['Content-Type'] = 'application/json';
    // Older TaskNotes versions decode each HTTP chunk before concatenating it.
    body = JSON.stringify(query).replace(/[^\x00-\x7f]/g, unit =>
      '\\u' + unit.charCodeAt(0).toString(16).padStart(4, '0'));
  }
  try {
    const response = await fetch(baseUrl + endpoint, {
      method: query ? 'POST' : 'GET', headers, body, redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      throw new TaskNotesError('TaskNotes API 拒绝访问，请检查当前认证配置。');
    }
    if (response.status === 404) throw new TaskNotesError('TaskNotes 中未找到对应记录。', 404);
    if (!response.ok) throw new TaskNotesError(`TaskNotes API 返回 HTTP ${response.status}。`);
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      throw new TaskNotesError('TaskNotes API 返回了非 JSON 响应。');
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw) > maxResponseBytes) throw new TaskNotesError('TaskNotes API 响应超过读取上限。');
    const payload = JSON.parse(raw);
    if (!isRecord(payload) || payload.success === false) throw new TaskNotesError('TaskNotes API 响应不可用。');
    return Object.hasOwn(payload, 'data') ? payload.data : payload;
  } catch (error) {
    if (error instanceof TaskNotesError) throw error;
    if (error instanceof SyntaxError) throw new TaskNotesError('TaskNotes API 返回了无效的 JSON。');
    if (error?.name === 'TimeoutError') throw new TaskNotesError('TaskNotes API 响应超时。');
    throw new TaskNotesError('无法连接 TaskNotes API。');
  }
}

function scopeQuery(projects, casePaths) {
  const conditions = [...projects].map(value => ({ property: 'projects', value }));
  for (const path of casePaths) {
    const filename = path.split('/').at(-1).replace(/\.md$/i, '');
    conditions.push({ property: 'contexts', value: '@' + filename }, { property: 'contexts', value: path });
  }
  return {
    id: 'flowdesk-workbench', type: 'group', conjunction: 'or',
    children: conditions.map(({ property, value }, index) =>
      ({ id: `source-${index + 1}`, type: 'condition', property, operator: 'contains', value })),
  };
}

async function findWorkspaceTasks(projects, caseScope) {
  return queryTasks(scopeQuery(projects, caseScope.values()), '无法确认项目任务范围。');
}

async function queryTasks(query, incompleteDetail) {
  const result = await api('/api/tasks/query', query);
  if (!isRecord(result) || !Array.isArray(result.tasks) || !Number.isInteger(result.filtered)
    || result.filtered !== result.tasks.length || result.truncated === true || result.complete === false
    || result.hasMore === true || result.pagination?.hasMore === true) {
    throw new TaskNotesError('TaskNotes 查询结果不完整，' + incompleteDetail);
  }
  return result.tasks;
}

async function getTask(path) {
  return api('/api/tasks/' + encodeURIComponent(path));
}

async function readCompletionDefinitions() {
  const options = await api('/api/filter-options');
  const statuses = new Map();
  for (const item of Array.isArray(options?.statuses) ? options.statuses : []) {
    const key = optionalText(item?.value) || optionalText(item?.id);
    if (key && typeof item.isCompleted === 'boolean') statuses.set(key, item.isCompleted);
  }
  return statuses;
}

async function checkVault(vaultDir) {
  const health = await api('/api/health');
  if (health?.status !== 'ok') throw new TaskNotesError('TaskNotes API 健康检查未通过。');
  if (vaultDir && (typeof health.vault?.path !== 'string'
    || resolve(health.vault.path).normalize('NFC') !== resolve(vaultDir).normalize('NFC'))) {
    throw new TaskNotesError('TaskNotes API 连接的资料库与当前工作台不一致。');
  }
}

function taskScope({ projectPaths, casePaths, taskPaths }) {
  return {
    projects: new Set(strings(projectPaths).map(projectName).filter(Boolean)),
    cases: caseScopeFor(casePaths),
    explicit: new Set(strings(taskPaths).filter(markdownPath)),
  };
}

function taskMatches(task, scope) {
  return scope.explicit.has(task.path) || task.casePaths.length || task.projects.some(project => scope.projects.has(project));
}

export async function readWorkspaceTask(path, options) {
  if (!markdownPath(path)) return null;
  const scope = taskScope(options);
  try {
    await checkVault(options.vaultDir);
    const task = taskMetadata(await getTask(path), scope.cases, path);
    return taskMatches(task, scope) ? task : null;
  } catch {
    return null;
  }
}

export async function readManagedWorkspaceTask(path, { vaultDir, casePaths } = {}) {
  if (!vaultDir || !managedTaskPath(path)) return null;
  try {
    await checkVault(vaultDir);
    const [record] = await Promise.all([getTask(path), readVaultNote(vaultDir, path)]);
    return taskMetadata(record, caseScopeFor(casePaths), path);
  } catch {
    return null;
  }
}

export async function readWorkspaceTasks({ vaultDir = process.env.OBSIDIAN_VAULT, ...options } = {}) {
  const scope = taskScope(options);
  if (!scope.projects.size && !scope.cases.size && !scope.explicit.size) {
    return { tasks: [], source: { status: 'ok', at: new Date().toISOString() } };
  }
  const tasks = new Map();
  const issues = [];
  let collectionAvailable = false;
  try {
    await checkVault(vaultDir);
  } catch (error) {
    return { tasks: [], source: { status: 'unavailable', at: new Date().toISOString(), detail: error.message } };
  }

  const definitions = readCompletionDefinitions().catch(() => new Map());
  try {
    const candidates = await findWorkspaceTasks(scope.projects, scope.cases);
    let malformed = 0;
    for (const candidate of candidates) {
      try {
        const task = taskMetadata(candidate, scope.cases);
        if (taskMatches(task, scope)) {
          tasks.set(task.path, task);
        }
      } catch {
        malformed++;
      }
    }
    if (malformed) issues.push(`${malformed} 条 TaskNotes 任务的标识或标题不可用。`);
    collectionAvailable = true;
  } catch (error) {
    issues.push(error.message);
  }

  const missing = [...scope.explicit].filter(path => !tasks.has(path));
  let unreadable = 0;
  for (let index = 0; index < missing.length; index += maxConcurrentTaskReads) {
    const batch = missing.slice(index, index + maxConcurrentTaskReads);
    await Promise.all(batch.map(async path => {
      try {
        tasks.set(path, taskMetadata(await getTask(path), scope.cases, path));
      } catch {
        unreadable++;
      }
    }));
  }
  if (unreadable) issues.push(`${unreadable} 个 Case 引用的任务无法从 TaskNotes 读取。`);

  const statuses = await definitions;
  const entries = [...tasks.values()].map(task => ({ ...task, isCompleted: statuses.get(task.status) ?? task.isCompleted }));
  const unknownStatuses = entries.filter(task => task.isCompleted === null).length;
  if (unknownStatuses) issues.push(`${unknownStatuses} 个任务缺少 TaskNotes 的完成状态定义。`);

  return {
    tasks: entries.sort(byLatestTask),
    source: {
      status: issues.length ? (collectionAvailable || tasks.size ? 'degraded' : 'unavailable') : 'ok',
      at: new Date().toISOString(),
      ...(issues.length ? { detail: issues.join(' ') } : {}),
    },
  };
}

function taskNoteKey(path) {
  return path.normalize('NFC');
}

function taskParent(row, byPath, byName) {
  for (const raw of row.projectLinks) {
    if (!raw.trim().startsWith('[[') || !raw.trim().endsWith(']]')) continue;
    const target = referenceTarget(raw).split('#', 1)[0];
    if (!target) continue;
    const file = /\.md$/iu.test(target) ? target : target + '.md';
    const next = [posix.normalize(posix.join(posix.dirname(row.path), file)), file]
      .map(candidate => byPath.get(taskNoteKey(candidate))).find(Boolean);
    const names = file.includes('/') ? [] : byName.get(taskNoteKey(file)) ?? [];
    const parent = next ?? (names.length === 1 ? names[0] : null);
    if (parent && parent !== row) return parent;
  }
  return null;
}

function nestCaseTaskRows(rows) {
  const byPath = new Map(rows.map(row => [taskNoteKey(row.path), row]));
  const byName = new Map();
  const parents = new Map();
  for (const row of rows) {
    const name = taskNoteKey(posix.basename(row.path));
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(row);
  }
  for (const row of rows) {
    const parent = taskParent(row, byPath, byName);
    if (!parent) continue;
    let owner = parent;
    while (owner && owner !== row) owner = parents.get(owner);
    if (!owner) parents.set(row, parent);
  }
  for (const row of rows) {
    delete row.projectLinks;
    const parent = parents.get(row);
    if (parent) parent.children.push(row);
  }
  return rows.filter(row => !parents.has(row));
}

export async function readCaseTaskBase({ vaultDir, casePath }) {
  const scope = caseScopeFor([casePath]);
  const observed = (status, detail, tasks = []) => ({ tasks, source: { status, ...(detail ? { detail } : {}) } });
  if (!vaultDir || !scope.size) return observed('unavailable', '无法确认当前 Case。');
  const context = '@' + posix.basename(casePath, '.md');
  const contains = (property, value) => ({ id: property, type: 'condition', property, operator: 'contains', value });
  try {
    await checkVault(vaultDir);
    const [candidates, options] = await Promise.all([
      queryTasks({ id: 'flowdesk-case-task-base', type: 'group', conjunction: 'and',
        children: [contains('contexts', context), contains('tags', 'task')] }, '无法确认当前 Case 的关联任务。'),
      api('/api/filter-options').catch(() => null),
    ]);
    const definitions = items => new Map((Array.isArray(items) ? items : [])
      .filter(item => isRecord(item) && typeof item.value === 'string').map(item => [item.value, item]));
    const statusOptions = definitions(options?.statuses);
    const priorityOptions = definitions(options?.priorities);
    const rows = new Map();
    let malformed = 0;
    for (const candidate of candidates) {
      if (!strings(candidate?.contexts).includes(context) ||
        !strings(candidate?.tags).some(tag => tag.replace(/^#/u, '') === 'task')) continue;
      try {
        const task = taskMetadata(candidate, scope);
        if (!managedTaskPath(task.path)) continue;
        const status = statusOptions.get(task.status);
        const priority = priorityOptions.get(task.priority);
        const key = taskNoteKey(task.path);
        if (rows.has(key)) {
          malformed++;
          continue;
        }
        const due = shanghaiDay(task.due);
        rows.set(key, {
          path: task.path, title: task.title, status: task.status, priority: task.priority,
          statusLabel: optionalText(status?.label) || task.status, priorityLabel: optionalText(priority?.label) || task.priority,
          ...(Number.isFinite(status?.order) ? { statusOrder: status.order } : {}),
          ...(Number.isFinite(priority?.weight) ? { priorityWeight: priority.weight } : {}),
          due, dueLabel: caseTaskDueLabel(due), projects: task.projects, projectLinks: strings(candidate.projects),
          archived: task.archived === true, children: [],
        });
      } catch {
        malformed++;
      }
    }
    const sorted = [...rows.values()].sort((left, right) =>
      (left.statusOrder ?? Number.MAX_SAFE_INTEGER) - (right.statusOrder ?? Number.MAX_SAFE_INTEGER) ||
      (left.status || '').localeCompare(right.status || '') ||
      (right.priorityWeight ?? -1) - (left.priorityWeight ?? -1) ||
      (right.priority || '').localeCompare(left.priority || '') || left.path.localeCompare(right.path, 'zh-CN'));
    return observed(malformed ? 'degraded' : 'ok', malformed ? `${malformed} 条关联任务未能核验。` : null, nestCaseTaskRows(sorted));
  } catch (error) {
    return observed('unavailable', error.message);
  }
}

function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function shanghaiDay(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/u.exec(value);
  if (!match || !calendarDay(match[1])) return null;
  if (!match[2]) return match[1];
  const date = new Date(match[1] + 'T' + match[2] + (match[3] || 'Z'));
  if (!Number.isFinite(date.getTime())) return null;
  return match[3] ? shanghaiDateFormat.format(date) : match[1];
}

function caseTaskDueLabel(due) {
  if (!due) return null;
  const today = shanghaiDateFormat.format(new Date());
  const days = (Date.parse(due) - Date.parse(today)) / 86400000;
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days === -1) return '昨天';
  if (days < 0) return `逾期 ${-days} 天`;
  if (days <= 7) return new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', weekday: 'short' }).format(new Date(due));
  return `${Number(due.slice(5, 7))} 月 ${Number(due.slice(8))} 日`;
}

function shiftDay(day, amount) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function periodQuery(conditions) {
  return {
    id: 'flowdesk-workbench-period', type: 'group', conjunction: 'and',
    children: conditions.map(([property, operator, value], index) =>
      ({ id: `source-${index + 1}`, type: 'condition', property, operator, ...(value === undefined ? {} : { value }) })),
  };
}

export async function readPeriodTasks({ vaultDir, from, to, today, projectPath, casePaths, taskPaths } = {}) {
  const taskPool = { inPeriod: [], carryover: [] };
  const completed = [];
  const result = (status, detail) => ({ taskPool, completed, source: { status, at: new Date().toISOString(), ...(detail ? { detail } : {}) } });
  if (!calendarDay(from) || !calendarDay(to) || !calendarDay(today) || from > to) {
    return result('unavailable', '任务统计日期范围无效。');
  }
  try {
    await checkVault(vaultDir);
  } catch (error) {
    return result('unavailable', error.message);
  }

  const scope = taskScope({ projectPaths: projectPath ? [projectPath] : [], casePaths, taskPaths });
  const containsDay = day => day !== null && day >= from && day <= to;
  // Widen native day filters for UTC/Shanghai boundaries, then apply the exact local days below.
  const dateRange = property => [
    [property, 'is-on-or-after', shiftDay(from, -1)], [property, 'is-on-or-before', shiftDay(to, 1)],
  ];
  const queries = [
    periodQuery([['archived', 'is-not-checked']]),
    periodQuery(dateRange('completedDate')),
    periodQuery([['status', 'is', 'cancel'], ...dateRange('dateModified')]),
  ];
  // Separate flat queries preserve the upstream filter semantics and the complete-result contract.
  const [definitions, ...responses] = await Promise.allSettled([
    readCompletionDefinitions(), ...queries.map(query => queryTasks(query, '无法确认周期内的任务范围。')),
  ]);
  const issues = [];
  if (definitions.status === 'rejected') issues.push('无法读取 TaskNotes 的完成状态定义。');
  const statuses = definitions.status === 'fulfilled' ? definitions.value : new Map();
  const candidates = new Map();
  const activePaths = new Set();
  let malformed = 0;
  for (const [index, response] of responses.entries()) {
    if (response.status === 'rejected') {
      issues.push(response.reason.message);
      continue;
    }
    const seen = new Set();
    for (const record of response.value) {
      try {
        const task = taskMetadata(record, scope.cases);
        if (!managedTaskPath(task.path) || projectPath && !taskMatches(task, scope)) continue;
        if (seen.has(task.path)) {
          malformed++;
          continue;
        }
        seen.add(task.path);
        if (index === 0) activePaths.add(task.path);
        task.isCompleted = statuses.get(task.status) ?? task.isCompleted;
        const modification = Date.parse(task.updatedAt ?? '') || 0;
        const previous = candidates.get(task.path);
        if (!previous || modification >= previous.modification) {
          candidates.set(task.path, { task, modification, completion: shanghaiDay(record.completedDate), modifiedDay: shanghaiDay(record.dateModified) });
        }
      } catch {
        malformed++;
      }
    }
  }
  if (malformed) issues.push(`${malformed} 条 TaskNotes 任务记录不完整或标识重复。`);

  let unknownStatuses = 0;
  for (const { task, completion, modifiedDay } of candidates.values()) {
    if (task.status === 'cancel') {
      if (containsDay(modifiedDay)) completed.push({ ...task, periodDate: modifiedDay, periodOutcome: 'cancelled' });
      continue;
    }
    if (task.isCompleted === true) {
      if (containsDay(completion)) completed.push({ ...task, periodDate: completion, periodOutcome: 'completed' });
      continue;
    }
    if (task.isCompleted === null) {
      unknownStatuses++;
      continue;
    }
    if (task.archived === true || !activePaths.has(task.path)) continue;
    const dates = [shanghaiDay(task.due), shanghaiDay(task.scheduled)].filter(Boolean).sort();
    const within = dates.find(containsDay);
    if (within || task.casePaths.length || scope.explicit.has(task.path)) {
      taskPool.inPeriod.push({ ...task, periodDate: within ?? null });
    } else {
      taskPool.carryover.push(task);
    }
  }
  if (unknownStatuses) issues.push(`${unknownStatuses} 个任务缺少 TaskNotes 的完成状态定义。`);

  taskPool.inPeriod.sort((left, right) => (left.periodDate || '9999').localeCompare(right.periodDate || '9999') || byLatestTask(left, right));
  function overdue(task) {
    const due = shanghaiDay(task.due);
    return due !== null && due < today;
  }
  taskPool.carryover.sort((left, right) => Number(overdue(right)) - Number(overdue(left)) || byLatestTask(left, right));
  completed.sort((left, right) => right.periodDate.localeCompare(left.periodDate) || byLatestTask(left, right));

  const available = responses.some(response => response.status === 'fulfilled');
  return result(available ? issues.length ? 'degraded' : 'ok' : 'unavailable', [...new Set(issues)].join(' '));
}

export async function readTaskDetail(path) {
  if (!markdownPath(path)) throw new TaskNotesError('任务路径无效。', 400);
  const task = await getTask(path);
  const metadata = taskMetadata(task, null, path);
  if (typeof task.details !== 'string') throw new TaskNotesError('TaskNotes 未返回此任务的 Markdown 正文。');
  return { ...metadata, markdown: task.details };
}
