'use strict';

const app = document.getElementById('app');
const searchDialog = document.getElementById('search-dialog');
const sections = {
  cases: { name: 'Case', single: 'case', icon: 'case' },
  tasks: { name: '任务', single: 'task', icon: 'task' },
  documents: { name: '资料', single: 'document', icon: 'document' },
};
const sources = {
  vault: 'Vault',
  tasknotes: 'TaskNotes',
  review: '批注与发送',
};
const statusLabels = {
  active: '进行中', 'in-progress': '进行中', running: '运行中', pending: '等待中', open: '开放',
  complete: '已完成', completed: '已完成', done: '已完成', closed: '已关闭',
  todo: '待办', 'to-do': '待办', planned: '已计划', 'not-started': '未开始', waiting: '等待中',
  parked: '暂缓', paused: '已暂停', blocked: '阻塞', idle: '空闲', archived: '已归档',
  cancel: '已取消', cancelled: '已取消', canceled: '已取消', 'on-hold': '暂缓', draft: '草稿', ready: '就绪', healthy: '正常',
  proposed: '拟议', approved: '已确认', superseded: '已被取代', unknown: '未知',
  ok: '正常', degraded: '部分可用', unavailable: '暂不可用',
};
const activeStatuses = new Set(['active', 'in-progress', 'running', 'open', 'working']);
const completedStatuses = new Set(['complete', 'completed', 'done', 'closed', 'archived', 'cancel', 'canceled', 'cancelled']);
const attentionStatuses = new Set(['blocked', 'degraded', 'unavailable']);
const priorityLabels = { low: '低', normal: '普通', medium: '中', high: '高', urgent: '紧急', critical: '紧急' };
const documentKinds = { plan: '方案', design: '设计', doc: '文档', document: '文档', note: '笔记', reference: '资料', research: '调研' };
const docHubTabs = { recent: '最近', project: '按项目', pinned: '常驻' };
const docHubKinds = { doc: '文档', plan: '方案', research: '调研', atlas: '图集' };
const periodMaterialsLimit = 6;
const uncategorizedProject = '未关联项目';
const projectOverviewHref = '#/project?view=overview';
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const dayFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' });
const timeFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
const shanghaiDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});
const narrowNavigation = matchMedia('(max-width: 865px)');
const narrowReader = matchMedia('(max-width: 1050px)');
let recentDocuments = readRecentDocuments();
let readingLocation;
let detachReaderAnnotations;
const workspaceRefreshInterval = 30000;
const recentProjectKey = 'flowdesk-workbench-recent-project';
const periodHrefKey = 'flowdesk-workbench-period-href';
const periodDateDraftKey = 'flowdesk-workbench-period-date-draft:';
const state = {
  data: null,
  error: '',
  loading: false,
  lastRefreshAttempt: 0,
  refreshError: '',
  workspaceRequest: null,
  docHub: { data: null, loading: false, error: '' },
  docHubView: { tab: 'recent', kind: '', query: '', project: '', includeArchived: false, showAll: false, openGroups: new Map() },
  details: new Map(),
  periodViews: new Map(),
  periodDateDrafts: new Map(),
  periodMaterialViews: new Map(),
  periodExpanded: new Set(),
  homeHref: rememberedPeriodHref(),
  collectionViews: new Map(),
  routeKey: null,
  readingPositions: new Map(),
  sourceDisclosureOpen: false,
  preferences: readLayoutPreferences(),
  readerViews: new Map(),
};

function rememberedPeriodHref() {
  try {
    const href = sessionStorage.getItem(periodHrefKey);
    if (href === '#/' || href?.startsWith('#/?')) return href;
  } catch { /* 当前标签页仍可保留阶段入口。 */ }
  return '#/';
}

function readLayoutPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('flowdesk-workbench-layout') || '{}');
    return { nav: ['collapsed', 'expanded'].includes(saved.nav) ? saved.nav : 'auto',
      reader: saved.reader === 'wide' ? 'wide' : 'comfortable' };
  } catch {
    return { nav: 'auto', reader: 'comfortable' };
  }
}

function navigationPreference() {
  if (state.preferences.nav !== 'auto') return state.preferences.nav;
  return narrowNavigation.matches ? 'collapsed' : 'expanded';
}

function updateLayoutPreference(key, value) {
  state.preferences[key] = value;
  try { localStorage.setItem('flowdesk-workbench-layout', JSON.stringify(state.preferences)); } catch { /* 可继续使用。 */ }
  const layout = app.querySelector('.layout');
  if (layout) layout.dataset.reader = state.preferences.reader;
  updateNavigation();
}

function updateNavigation() {
  const nav = navigationPreference();
  const layout = app.querySelector('.layout');
  if (layout) layout.dataset.nav = nav;
  const toggle = app.querySelector('.nav-toggle');
  if (toggle) {
    const open = nav === 'expanded';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '收起导航' : '展开导航');
    toggle.title = open ? '收起导航' : '展开导航';
  }
}

narrowNavigation.addEventListener('change', updateNavigation);
narrowReader.addEventListener('change', () => app.querySelector('.reader-dialog')?.dispatchEvent(new Event('layoutchange')));

function readRecentDocuments() {
  try { return array(JSON.parse(localStorage.getItem('flowdesk-workbench-recent-documents') || '[]')).filter(path => typeof path === 'string'); }
  catch { return []; }
}

function rememberDocument(path) {
  if (recentDocuments[0] === path) return;
  recentDocuments = [path, ...recentDocuments.filter(entry => entry !== path)].slice(0, 6);
  try { localStorage.setItem('flowdesk-workbench-recent-documents', JSON.stringify(recentDocuments)); } catch { /* 可继续使用。 */ }
}

function layoutMenu() {
  return window.FlowDeskChoiceMenu.create({
    id: 'workspace-layout', label: '阅读宽度', display: '布局', leading: icon('sliders'),
    className: 'choice-layout', align: 'end',
    options: [{ value: 'comfortable', label: '舒适' }, { value: 'wide', label: '宽版' }],
    value: state.preferences.reader, onSelect: value => updateLayoutPreference('reader', value),
  }).element;
}

function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function valueText(value) {
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string').join('\n');
  return typeof value === 'string' ? value.trim() : '';
}

function statusKey(value) {
  return valueText(value).toLowerCase().replace(/[_ ]+/g, '-');
}

function statusText(value) {
  return statusLabels[statusKey(value)] || valueText(value);
}

function dateValue(value) {
  if (!value) return null;
  const time = new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00' : value);
  return Number.isNaN(time.valueOf()) ? null : time;
}

function dateText(value, includeTime = false) {
  const time = dateValue(value);
  return time ? (includeTime ? timeFormat : dayFormat).format(time) : '';
}

function dateLabel(value, includeTime = false) {
  return value && dateText(value, includeTime)
    ? element('time', { datetime: value, title: dateText(value, true) }, dateText(value, includeTime))
    : null;
}

function shortText(value) {
  const text = valueText(value).replace(/^#{1,6}\s+/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, path, label) => label || path.split('/').at(-1))
    .replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 310 ? text.slice(0, 309).trimEnd() + '…' : text;
}

function normalizePath(value) {
  return valueText(value).replace(/^\[\[|\]\]$/g, '').split('|')[0].replace(/^\.\//, '').replace(/\.md$/i, '').normalize('NFC');
}

function sameReference(left, right) {
  return typeof left === 'string' && typeof right === 'string' && normalizePath(left) === normalizePath(right);
}

function byNewest(items) {
  return [...items].sort((left, right) => (dateValue(right.updatedAt || right.createdAt)?.valueOf() ?? 0) -
    (dateValue(left.updatedAt || left.createdAt)?.valueOf() ?? 0) || collator.compare(left.title || '', right.title || ''));
}

function icon(name) {
  return element('span', { className: 'icon icon-' + name, 'aria-hidden': 'true' });
}

function arrow() {
  return element('span', { className: 'arrow', 'aria-hidden': 'true' }, '→');
}

function linkHref(section, id) {
  const path = section === 'home' ? state.homeHref : '#/' + section;
  return id === undefined ? path : path + '/' + encodeURIComponent(id);
}

function safeHref(value) {
  if (!valueText(value)) return '';
  try {
    const url = new URL(value, location.href);
    return ['http:', 'https:', 'obsidian:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function statusPill(value) {
  const label = statusText(value);
  if (!label) return null;
  const key = statusKey(value);
  let tone = 'neutral';
  if (activeStatuses.has(key) || key === 'ok') tone = 'live';
  else if (completedStatuses.has(key)) tone = 'complete';
  else if (attentionStatuses.has(key)) tone = 'attention';
  return element('span', { className: 'status', 'data-tone': tone }, element('span', { 'aria-hidden': 'true' }), label);
}

function sourceStatus(key) {
  return state.data?.sources?.[key] || { status: 'unavailable' };
}

function collection(section) {
  return section === 'doc-hub' ? array(state.docHub.data?.documents) : array(state.data?.[section]);
}

function lookupInCollection(section, id) {
  return collection(section).find((item) => item.id === id || item.path === id) ||
    collection(section).find((item) => sameReference(item.path, id));
}

function lookup(section, id) {
  const source = readerSection(section);
  return lookupInCollection(section, id) ||
    (section === 'documents' ? lookupInCollection('doc-hub', id) : lookupInCollection(source, id)) ||
    state.details.get(source + ':' + id)?.data?.record ||
    periodLookup(source, id);
}

function periodLookup(section, id) {
  for (const { data } of [...state.periodViews.values()].reverse()) {
    const rows = section === 'tasks'
      ? [...array(data?.taskPool?.inPeriod), ...array(data?.taskPool?.carryover), ...array(data?.completed)]
      : array(data?.[section]);
    const found = rows.find(item => item.id === id || sameReference(item.path, id));
    if (found) return found;
  }
}

function readerSection(section) {
  return section === 'doc-hub' ? 'documents' : section;
}

function projectPath(project) {
  return project?.path || project?.id || '';
}

function requestedProject() {
  const path = new URLSearchParams(location.search).get('project');
  if (path) return path;
  try { return localStorage.getItem(recentProjectKey) || ''; }
  catch { return ''; }
}

function detailRouteItem(route) {
  if (route?.section === 'project') {
    return route.view === 'overview' ? null : state.data?.project;
  }
  return route?.id && lookup(route.section, route.id);
}

function route(hash = location.hash) {
  const [path, query] = hash.slice(1).split('?', 2);
  if (!path) return { section: 'project', view: 'overview' };
  const params = new URLSearchParams(query);
  if (path === '/') {
    const from = params.get('from') || '';
    const to = params.get('to') || '';
    const range = params.get('range');
    const lastWeek = range === 'last' ? weekBounds(true) : null;
    const relativeLast = lastWeek && ((!from && !to) || (from === lastWeek.from && to === lastWeek.to));
    return {
      section: 'home',
      period: {
        from, to,
        range: relativeLast ? 'last' : range === 'custom' || from || to ? 'custom' : 'week',
        project: params.get('project') || '', taskTab: params.get('tasks') === 'done' ? 'done' : 'pool',
      },
    };
  }
  if (path === 'workbench-main') return state.route || { section: 'project', view: 'overview' };
  const match = path.match(/^\/([^/]+)(?:\/(.+))?\/?$/);
  if (!match) return { section: 'unknown' };
  const [, section, encoded] = match;
  if (section === 'project' && !encoded) return {
    section, view: params.get('view') === 'overview' ? 'overview' : 'read',
    heading: params.get('heading') || '',
  };
  if (section !== 'doc-hub' && !Object.hasOwn(sections, section)) return { section: 'unknown' };
  try {
    return { section, id: encoded ? decodeURIComponent(encoded) : undefined,
      heading: params.get('heading') || '' };
  } catch {
    return { section: 'unknown' };
  }
}

function openLink(section, id, children, className) {
  return element('a', { href: linkHref(section, id), className }, children);
}

function actionLink(name, section, id, primary = false) {
  return openLink(section, id, [name, arrow()], 'button' + (primary ? ' primary' : ''));
}

function emptyState(title, description) {
  return element('div', { className: 'empty-state' },
    element('strong', {}, title),
    description && element('p', {}, description));
}

function pageHeader(title, description, actions) {
  return element('header', { className: 'page-header' },
    element('div', {}, element('h1', {}, title), description && element('p', {}, description)),
    actions && element('div', { className: 'page-actions' }, actions));
}

function blockHeader(title, link) {
  return element('div', { className: 'block-header' }, element('h2', {}, title), link);
}

function navItem(section, title, iconName, href = linkHref(section)) {
  const current = state.route?.section === section;
  return element('a', { href, className: 'nav-item', 'aria-current': current ? 'page' : undefined, title, 'aria-label': title },
    icon(iconName), element('span', {}, title));
}

function workspaceProjectSelector() {
  const projects = array(state.data?.projects);
  if (!projects.length) return null;
  return window.FlowDeskChoiceMenu.create({
    id: 'workspace-project-selector', label: '切换工作台项目', className: 'workspace-project-select',
    leading: icon('project'), search: '搜索项目',
    beside: () => navigationPreference() === 'collapsed' && !narrowNavigation.matches,
    options: projects.map(project => ({ value: projectPath(project), label: project.title || projectPath(project), keywords: projectPath(project) })),
    value: requestedProject() || projectPath(state.data.project),
    onSelect: path => {
      const url = new URL(location.href);
      url.searchParams.set('project', path);
      if (state.route?.section === 'project') url.hash = projectOverviewHref;
      else if (state.route?.id && state.route.section !== 'doc-hub') url.hash = linkHref(state.route.section);
      history.pushState(history.state, '', url);
      void loadWorkbench();
    },
  }).element;
}

function sidebar() {
  return element('aside', { id: 'workbench-navigation', className: 'sidebar' },
    element('a', { href: linkHref('home'), className: 'brand', 'aria-label': 'FlowDesk 首页' },
      element('span', { className: 'brand-symbol', 'aria-hidden': 'true' }, element('i'), element('i'), element('i')),
      element('span', {}, 'FlowDesk')),
    element('nav', { className: 'primary-nav', 'aria-label': '工作台导航' },
      navItem('home', '工作台', 'home'),
      element('div', { className: 'nav-section' },
        element('p', { className: 'nav-label' }, '项目'),
        workspaceProjectSelector(),
        navItem('project', '项目概览', 'project', projectOverviewHref)),
      element('div', { className: 'nav-section' },
        element('p', { className: 'nav-label' }, '浏览'),
        navItem('doc-hub', '文档中心', 'library'),
        navItem('external-review', '外部评审', 'review', '/external-review'),
        Object.entries(sections).map(([section, settings]) => navItem(section, settings.name, settings.icon)))),
    element('footer', { className: 'sidebar-footer' },
      icon('local'), element('span', {}, 'Vault 只读')));
}

function breadcrumbs() {
  const { section, id } = state.route;
  const collectionName = section === 'doc-hub' ? '文档中心' : sections[section]?.name;
  if (section === 'home') return element('nav', { className: 'breadcrumb', 'aria-label': '当前位置' }, element('span', { 'aria-current': 'page' }, '工作台'));
  const name = section === 'project' ? state.data?.project?.title || '项目' : collectionName || '页面';
  const title = id && lookup(section, id)?.title;
  return element('nav', { className: 'breadcrumb', 'aria-label': '当前位置' },
    openLink('home', undefined, '工作台'),
    element('span', { 'aria-hidden': 'true', className: 'crumb-divider' }, '/'),
    id ? openLink(section, undefined, name) : element('span', { 'aria-current': 'page' }, name),
    title && element('span', { 'aria-hidden': 'true', className: 'crumb-divider' }, '/'),
    title && element('span', { 'aria-current': 'page', className: 'crumb-title', title }, title));
}

function commandHint() {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
}

function render() {
  detachReaderAnnotations?.();
  detachReaderAnnotations = undefined;
  state.route = route();
  if (state.route.section === 'home' && location.hash !== '#workbench-main') {
    state.homeHref = location.hash;
    try { sessionStorage.setItem(periodHrefKey, state.homeHref); } catch { /* 保留内存入口。 */ }
  }
  let key = requestedProject() + ':' + state.route.section + '/' + (state.route.id || state.route.view || '');
  if (location.hash === '#workbench-main') key = state.routeKey;
  const previousRoute = state.routeKey;
  const changed = previousRoute !== key;
  if (changed && previousRoute) state.readingPositions.set(previousRoute, window.scrollY);
  const heading = state.route.heading || '';
  if (changed || readingLocation?.heading !== heading) {
    readingLocation = { heading, pending: true, scrollY: changed ? state.readingPositions.get(key) || 0 : window.scrollY };
  }
  state.routeKey = key;
  const waitingForProject = state.data && requestedProject() !== projectPath(state.data.project);
  const main = element('main', { id: 'workbench-main', className: 'content', tabindex: '-1' });
  const navOpen = navigationPreference() === 'expanded';
  const toggleTitle = navOpen ? '收起导航' : '展开导航';
  const navigationToggle = element('button', {
    type: 'button', className: 'nav-toggle button', 'aria-controls': 'workbench-navigation',
    'aria-expanded': String(navOpen), 'aria-label': toggleTitle, title: toggleTitle,
    onClick: () => {
      updateLayoutPreference('nav', navigationPreference() === 'expanded' ? 'collapsed' : 'expanded');
      if (narrowNavigation.matches && navigationPreference() === 'expanded')
        app.querySelector('.primary-nav [aria-current], .primary-nav a')?.focus();
    },
  }, icon('sidebar'));
  const search = searchScope();
  const searchButton = element('button', {
    type: 'button', className: 'global-search button', 'aria-haspopup': 'dialog', 'aria-label': search.label,
    onClick: openSearch, disabled: !search.available,
  }, icon('search'), element('span', {}, search.label), element('kbd', {}, commandHint()));
  const topbar = element('header', { className: 'topbar' },
    element('div', { className: 'topbar-leading' }, navigationToggle, breadcrumbs()),
    element('div', { className: 'topbar-actions' }, searchButton, createRefreshControl(), layoutMenu()));
  app.replaceChildren(element('div', {
    className: 'layout', 'data-nav': navigationPreference(), 'data-reader': state.preferences.reader,
  }, sidebar(), element('div', { className: 'workspace' }, topbar, main)));
  let title = '工作台';
  if (state.route.section === 'home') {
    title = '阶段工作台';
    main.append(homePage());
  } else if (state.error && (!state.data || waitingForProject)) {
    main.append(pageHeader(title), element('div', { className: 'panel load-error', role: 'alert' },
      emptyState('无法读取工作台', state.error),
      element('button', { type: 'button', className: 'button primary', onClick: loadWorkbench }, '重新读取')));
  } else if (!state.data || waitingForProject) {
    main.append(pageHeader(title), element('div', { className: 'panel loading', role: 'status' }, '正在读取工作台…'));
  } else if (state.route.section === 'project') {
    title = state.data.project?.title || '项目';
    const project = detailRouteItem(state.route);
    main.append(project ? readerPage('project', project) : projectPage());
  } else if (state.route.section === 'doc-hub') {
    const item = detailRouteItem(state.route);
    title = item?.title || '文档中心';
    if (item) {
      rememberDocument(item.path);
      main.append(readerPage('documents', item));
    } else if (state.route.id) main.append(directReaderPage('documents', state.route.id));
    else main.append(docHubPage());
  } else if (Object.hasOwn(sections, state.route.section)) {
    const { section, id } = state.route;
    const item = id && lookup(section, id);
    title = item?.title || sections[section].name;
    if (id) {
      if (item) viewState(section).lastOpened = item.id || item.path;
      if (item && section === 'documents') rememberDocument(item.path || item.id);
      main.append(item ? readerPage(section, item) : directReaderPage(section, id));
    } else main.append(collectionPage(section));
  } else {
    main.append(missingPage('home'));
  }
  const feedbackHost = main.querySelector('.reader-feedback-host');
  if (feedbackHost) {
    detachReaderAnnotations = window.FlowDeskReaderAnnotations?.attach({
      host: feedbackHost,
      content: main.querySelector('.reader-prose'),
      itemPath: feedbackHost.dataset.document,
      sourceSha256: feedbackHost.dataset.sourceSha256,
    });
  }
  document.title = title + ' · FlowDesk';
  if (changed && previousRoute) main.focus({ preventScroll: true });
  if (readingLocation?.pending) applyReadingLocation(main);
  if (state.data && docHubRouteNeedsIndex(state.route) && !state.docHub.data && !state.docHub.error) void loadDocHub();
  if (state.route.section === 'home') void loadPeriod();
}

function headingKey(value) {
  return value.normalize('NFC').trim().toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/[\s_]+/g, '-');
}

function applyReadingLocation(main) {
  const pending = readingLocation;
  const loading = !state.data || main.querySelector('.reader-document.loading, .doc-hub-loading, .period-loading') ||
    (state.loading && requestedProject() !== projectPath(state.data?.project));
  if (loading) {
    window.scrollTo(0, pending.scrollY);
    return;
  }
  pending.pending = false;
  if (pending.heading) {
    const headings = [...main.querySelectorAll('.reader-prose :is(h1, h2, h3, h4, h5, h6)')];
    const labels = heading => [heading.textContent.trim(), heading.dataset.sourceHeading].filter(Boolean);
    const exact = headings.filter(heading => labels(heading).includes(pending.heading));
    const related = exact.length ? exact : headings.filter(heading =>
      labels(heading).some(label => headingKey(label) === headingKey(pending.heading)));
    if (related.length === 1) {
      jumpToHeading(related[0]);
      return;
    }
  }
  window.scrollTo(0, pending.scrollY);
}

function sourceBlock(data = state.data, keys = Object.keys(sources)) {
  const entries = keys.map(key => ({ name: sources[key], status: 'unavailable', ...data.sources?.[key] }));
  const readable = entries.filter(entry => entry.status === 'ok').length;
  const panel = element('details', {
    className: 'source-block', 'aria-label': '数据来源', open: state.sourceDisclosureOpen,
  }, element('summary', {},
    element('strong', {}, '数据来源'),
    element('span', { className: 'source-health', 'data-health': readable === entries.length ? 'ok' : 'partial' },
      readable + '/' + entries.length + ' 正常'),
    data.observedAt && element('span', { className: 'meta' }, '更新于 ', dateLabel(data.observedAt, true))),
  element('div', { className: 'source-grid' }, entries.map(source =>
    element('div', { className: 'source-item' },
      element('div', {}, element('strong', {}, source.name), statusPill(source.status)),
      (source.at || source.detail) && element('p', { className: 'meta' }, source.detail || dateLabel(source.at, true))))));
  panel.addEventListener('toggle', () => { state.sourceDisclosureOpen = panel.open; });
  return panel;
}

function collectionOverview() {
  return element('nav', { className: 'metrics home-quick-links', 'aria-label': '项目条目' },
    Object.entries(sections).map(([section, settings]) => {
      const count = collection(section).length;
      return openLink(section, undefined, [
        element('div', { className: 'metric-top' }, element('span', {}, icon(settings.icon), settings.name), arrow()),
        element('strong', {}, String(count)),
      ], 'metric');
    }));
}

function entityIcon(section) {
  return element('span', { className: 'entity-icon', 'aria-hidden': 'true' }, icon(sections[section].icon));
}

function itemMeta(section, item) {
  if (section === 'tasks') {
    return item.due ? element('span', {}, '截止 ', dateLabel(item.due) || item.due) :
      item.scheduled ? element('span', {}, '安排于 ', dateLabel(item.scheduled) || item.scheduled) :
      dateLabel(item.updatedAt);
  }
  if (section === 'documents') {
    return item.path ? element('span', { title: item.path }, item.path) : dateLabel(item.updatedAt);
  }
  return dateLabel(item.updatedAt);
}

function entityRow(section, item, expanded = false, { meta, status = item.status, action } = {}) {
  const summary = section === 'cases' ? item.current || item.summary || item.goal : item.summary;
  const secondary = meta ?? itemMeta(section, item);
  return element('li', { className: action ? 'period-linked-row' : undefined }, openLink(section, item.id || item.path, [
    entityIcon(section),
    element('div', { className: 'entity-text' },
      element('strong', {}, item.title || item.path || item.id),
      expanded && shortText(summary) && element('p', { className: 'entity-summary' }, shortText(summary)),
      secondary && element('div', { className: 'entity-meta' }, secondary)),
    statusPill(status),
    arrow(),
  ], 'entity-row'), action);
}

function entityList(section, items, expanded) {
  return element('ul', { className: 'entity-list' }, items.map((item) => entityRow(section, item, expanded)));
}

function shiftDay(day, delta) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function weekBounds(previous = false) {
  const parts = Object.fromEntries(shanghaiDayFormat.formatToParts(new Date()).map(part => [part.type, part.value]));
  const today = [parts.year, parts.month, parts.day].join('-');
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay();
  const from = shiftDay(today, -((weekday + 6) % 7) - (previous ? 7 : 0));
  return { from, to: shiftDay(from, 6) };
}

function periodQuery(period) {
  const query = new URLSearchParams();
  const range = period.from || period.to || period.range === 'custom' ? period : weekBounds(period.range === 'last');
  if (range.from) query.set('from', range.from);
  if (range.to) query.set('to', range.to);
  if (period.project) query.set('project', period.project);
  return query;
}

function currentPeriodView(period = state.route?.period) {
  return period ? state.periodViews.get(periodQuery(period).toString()) : undefined;
}

function changePeriod(changes) {
  const period = { ...state.route.period, ...changes };
  const query = periodQuery(period);
  if (period.range !== 'custom') {
    query.delete('from');
    query.delete('to');
  }
  if (period.range !== 'week') query.set('range', period.range);
  if (period.taskTab === 'done') query.set('tasks', 'done');
  location.hash = '#/' + (query.size ? '?' + query : '');
}

function periodSegments(label, entries, selected, onSelect, prefix) {
  return element('div', { className: 'doc-hub-tabs period-segments', role: 'group', 'aria-label': label },
    entries.map(([value, text, count]) => element('button', {
      id: prefix + value, type: 'button', className: 'doc-hub-tab',
      'aria-pressed': String(value === selected), onClick: () => onSelect(value),
    }, text, count != null && element('span', { className: 'doc-hub-tab-count' }, count))));
}

function readPeriodDateDraft(key) {
  if (state.periodDateDrafts.has(key)) return state.periodDateDrafts.get(key);
  try {
    const draft = JSON.parse(sessionStorage.getItem(periodDateDraftKey + key));
    if (typeof draft?.from === 'string' && typeof draft.to === 'string') return draft;
  } catch { /* 继续使用页面内的日期草稿。 */ }
}

function savePeriodDateDraft(key, draft) {
  if (draft) state.periodDateDrafts.set(key, draft);
  else state.periodDateDrafts.delete(key);
  try {
    if (draft) sessionStorage.setItem(periodDateDraftKey + key, JSON.stringify(draft));
    else sessionStorage.removeItem(periodDateDraftKey + key);
  } catch { /* 继续使用页面内的日期草稿。 */ }
}

function periodDateForm(range, period) {
  const key = periodQuery(period).toString();
  const draft = readPeriodDateDraft(key) || range;
  const from = element('input', { id: 'period-from', type: 'date', required: true, value: draft.from });
  const to = element('input', { id: 'period-to', type: 'date', required: true, value: draft.to, min: draft.from });
  const saveDraft = () => {
    to.min = from.value;
    savePeriodDateDraft(key, from.value === range.from && to.value === range.to ? null : { from: from.value, to: to.value });
  };
  for (const input of [from, to]) {
    input.addEventListener('input', saveDraft);
    input.addEventListener('change', saveDraft);
  }
  return element('form', {
    className: 'period-date-form',
    onSubmit: event => {
      event.preventDefault();
      savePeriodDateDraft(key, null);
      changePeriod({ range: 'custom', from: from.value, to: to.value });
    },
  },
  element('label', {}, '开始日期', from),
  element('label', {}, '结束日期', to),
  element('button', { type: 'submit', className: 'button primary' }, '应用'));
}

function periodHeading(period, data) {
  const activeRange = data || (dateValue(period.from) && dateValue(period.to) ? period : weekBounds(period.range === 'last'));
  const projects = array(state.data?.projects);
  const known = projects.some(project => projectPath(project) === period.project);
  const projectControl = window.FlowDeskChoiceMenu.create({
    id: 'period-project', label: '阶段项目', className: 'choice-filter period-project', leading: icon('project'),
    search: '搜索项目', value: period.project,
    options: [{ value: '', label: '全部项目' },
      ...projects.map(project => ({
        value: projectPath(project), label: project.title || projectPath(project), keywords: projectPath(project),
      })),
      ...(period.project && !known ? [{ value: period.project, label: period.project }] : [])],
    onSelect: project => changePeriod({ project }),
  }).element;

  return element('header', { className: 'period-heading panel' },
    element('div', { className: 'period-title' },
      element('h1', {}, '阶段工作台'),
      element('p', { className: 'period-range' }, dateLabel(activeRange.from), ' 至 ', dateLabel(activeRange.to))),
    element('div', { className: 'period-controls' },
      periodSegments('阶段范围', [['week', '本周'], ['last', '上周'], ['custom', '自定义']], period.range, range => {
        const bounds = range === 'custom' ? activeRange : { from: '', to: '' };
        changePeriod({ from: bounds.from, to: bounds.to, range });
      }, 'period-range-'),
      projectControl),
    period.range === 'custom' && periodDateForm(activeRange, period));
}

function recordProjects(item) {
  const projects = array(item.projects).length ? item.projects : array(item.projectPaths).map(path => {
    const project = array(state.data?.projects).find(project => sameReference(projectPath(project), path));
    return project?.title || path.split('/').at(-1).replace(/\.md$/i, '');
  });
  return projects.length ? element('span', {}, projects.join(' · ')) : null;
}

function periodCaseRows(data, materials) {
  const cases = array(data.cases);
  const activity = cases.filter(item => item.stageReason !== 'carryover');
  const carryover = cases.filter(item => item.stageReason === 'carryover');
  const row = (item) => {
    const reason = { created: '阶段内创建', progress: '阶段内有进展', carryover: '此前未结' }[item.stageReason];
    const at = item.stageActivityAt || (item.stageReason === 'created' ? item.date : null);
    return entityRow('cases', item, true, {
      meta: [reason && element('span', { className: 'period-reason' }, reason), dateLabel(at), recordProjects(item)],
      action: materials.sourceButton('case', item),
    });
  };
  return element('section', { className: 'period-panel panel' },
    blockHeader('Case'),
    activity.length ? element('ul', { className: 'entity-list' }, activity.map(row)) :
      emptyState(data.sources?.vault?.status === 'unavailable' ? 'Case 暂不可用' : '阶段内没有新建或有进展的 Case'),
    periodCarryover('cases', '延续 Case', carryover, row));
}

function periodCarryover(key, label, items, row) {
  if (!items.length) return null;
  const panel = element('details', { className: 'period-carryover', open: state.periodExpanded.has(key) },
    element('summary', {}, label, element('span', { className: 'meta' }, items.length + ' 项')),
    element('ul', { className: 'entity-list' }, items.map(row)));
  panel.addEventListener('toggle', () => {
    if (panel.open) state.periodExpanded.add(key);
    else state.periodExpanded.delete(key);
  });
  return panel;
}

function periodTaskRows(data, tab, materials) {
  const inPeriod = array(data.taskPool?.inPeriod);
  const carryover = array(data.taskPool?.carryover);
  const completed = array(data.completed);
  const taskRow = item => entityRow('tasks', item, false, {
    meta: [itemMeta('tasks', item), recordProjects(item)], action: materials.sourceButton('task', item),
  });
  const outcomeRow = item => entityRow('tasks', item, false, {
    meta: [dateLabel(item.periodDate), recordProjects(item)], status: item.periodOutcome,
    action: materials.sourceButton('task', item),
  });
  const emptyTitle = data.sources?.tasknotes?.status === 'unavailable' ? 'TaskNotes 暂不可用' :
    tab === 'done' ? '阶段内没有已完成或取消的任务' : '阶段内没有待处理任务';
  return element('section', { className: 'period-panel panel' },
    blockHeader('任务'),
    element('div', { className: 'period-task-tabs' },
      periodSegments('阶段任务分类', [['pool', '任务池', inPeriod.length + carryover.length], ['done', '阶段完成', completed.length]],
        tab, taskTab => changePeriod({ taskTab }), 'period-task-')),
    tab === 'done' ? (completed.length ? element('ul', { className: 'entity-list' }, completed.map(outcomeRow)) : emptyState(emptyTitle)) : [
      inPeriod.length ? [
        element('h3', { className: 'period-task-subheading' }, '当前待处理 · 阶段相关'),
        element('ul', { className: 'entity-list' }, inPeriod.map(taskRow)),
      ] : emptyState(emptyTitle),
      periodCarryover('tasks', '其他待处理任务', carryover, taskRow),
    ]);
}

function periodMaterialSourceLink(link) {
  return openLink(link.kind === 'case' ? 'cases' : 'tasks', link.id,
    [icon(link.kind), element('span', { title: link.title || link.id }, link.title || link.id)], 'period-material-source');
}

function periodMaterialRow({ item, links }, selectedSource) {
  const isGallery = item.kind === 'atlas';
  const title = item.title || item.path || item.id;
  const pages = isGallery ? array(item.pages).filter(page => isGalleryHref(page.href)) : [];
  const activeLink = selectedSource && links.find(link => link.kind + ':' + link.id === selectedSource);
  const primary = activeLink || links[0];
  const others = links.filter(link => link !== primary);
  const titleElement = isGallery
    ? isGalleryHref(item.href) ? element('a', {
      href: item.href, target: '_blank', rel: 'noopener noreferrer', className: 'period-material-title', title,
    }, title) : element('strong', { className: 'period-material-title', title }, title)
    : element('a', { href: linkHref('documents', item.path || item.id), className: 'period-material-title', title: item.path || title }, title);
  const pagesDisclosure = pages.length > 0 && element('details', { className: 'period-material-pages' },
    element('summary', {}, pages.length + ' 个子页'),
    element('ul', { className: 'period-material-detail-list' }, pages.map(page => element('li', {},
      element('a', { href: page.href, target: '_blank', rel: 'noopener noreferrer' }, page.title)))));
  return element('li', { className: 'period-material-row', 'data-kind': item.kind },
    element('div', { className: 'period-material-main' }, icon(isGallery ? 'library' : 'document'), titleElement,
      element('span', { className: 'period-material-type' }, docHubKinds[item.kind] || '文档')),
    primary && element('div', { className: 'period-material-sources' }, periodMaterialSourceLink(primary),
      others.length > 0 && element('details', { className: 'period-material-disclosure' },
        element('summary', {}, '另有 ' + others.length + ' 项'),
        element('ul', { className: 'period-material-detail-list' }, others.map(link => element('li', {}, periodMaterialSourceLink(link)))))),
    pagesDisclosure);
}

function periodMaterialBrowser(data) {
  const key = [data.from, data.to, data.projectPath].join(':');
  if (!state.periodMaterialViews.has(key)) {
    state.periodMaterialViews.set(key, { kind: '', source: '', query: '', expanded: false });
  }
  const view = state.periodMaterialViews.get(key);
  const progressCases = new Set(array(data.cases).filter(item => item.stageReason === 'progress').map(item => item.id));
  const hasProgress = link => link.kind === 'case' && progressCases.has(link.id);
  const sources = new Map();
  const rows = [...array(data.documents), ...array(data.galleries)].map(item => {
    const links = array(item.relatedTo).filter(link => link.id && (link.kind === 'case' || link.kind === 'task'))
      .toSorted((left, right) => Number(hasProgress(right)) - Number(hasProgress(left)));
    for (const link of links) {
      const sourceKey = link.kind + ':' + link.id;
      if (!sources.has(sourceKey)) sources.set(sourceKey, { title: link.title || link.id, count: 0 });
      sources.get(sourceKey).count++;
    }
    const searchText = [item.title, item.path, item.summary, ...links.map(link => link.title),
      ...array(item.pages).map(page => page.title)].filter(Boolean).join(' ').toLocaleLowerCase().normalize('NFC');
    return { item, links, searchText, current: links.some(hasProgress) };
  }).sort((left, right) => Number(right.current) - Number(left.current)
    || valueText(right.item.updatedAt).localeCompare(valueText(left.item.updatedAt))
    || collator.compare(left.item.title, right.item.title));
  const sourceButtons = new Map();
  if (view.source && !sources.has(view.source)) view.source = '';
  const heading = element('h2', { id: 'period-materials-heading', tabindex: '-1' }, '资料');
  const typeButtons = Object.entries({ '': '全部', doc: '文档', plan: '方案', atlas: '图集' }).map(([kind, label]) =>
    element('button', { type: 'button', className: 'doc-hub-tab', 'data-kind': kind, 'aria-controls': 'period-material-results',
      onClick: () => { view.kind = kind; view.expanded = false; draw(); },
    }, label));
  const search = element('input', { id: 'period-material-filter', type: 'search', className: 'filter-input',
    placeholder: '搜索资料或关联来源', 'aria-label': '搜索阶段资料',
    onInput: event => { view.query = event.currentTarget.value; view.expanded = false; draw(); },
  });
  search.value = view.query;
  const sourceLabel = element('span', {}, '');
  const sourceContext = element('div', { className: 'period-material-context' }, sourceLabel,
    element('button', { type: 'button', className: 'button', onClick: () => {
      view.source = '';
      view.expanded = false;
      draw();
      heading.focus({ preventScroll: true });
    } }, '清除来源筛选'));
  const results = element('div', { id: 'period-material-results', className: 'period-material-results' });
  const count = element('span', { className: 'meta', role: 'status' });
  const more = element('button', { type: 'button', className: 'button', 'aria-controls': results.id,
    onClick: () => {
      view.expanded = !view.expanded;
      draw();
      const newRow = view.expanded && results.querySelectorAll('.period-material-row')[periodMaterialsLimit];
      const firstAction = newRow && newRow.querySelector('a[href], summary');
      if (firstAction) {
        firstAction.focus();
      } else {
        section.scrollIntoView({ block: 'start' });
        heading.focus({ preventScroll: true });
      }
    },
  });
  const footer = element('div', { className: 'period-material-footer' }, count, more);
  const section = element('section', { id: 'period-materials', className: 'period-materials panel', 'aria-labelledby': heading.id },
    element('div', { className: 'block-header' }, heading, actionLink('文档中心', 'doc-hub')),
    rows.length > 0 && element('div', { className: 'period-material-controls' },
      element('div', { className: 'doc-hub-tabs', role: 'group', 'aria-label': '阶段资料类型' }, typeButtons),
      element('label', { className: 'filter-wrap period-material-search' }, icon('search'), search)),
    sourceContext, results, footer);

  function draw() {
    for (const button of typeButtons) button.setAttribute('aria-pressed', String(button.dataset.kind === view.kind));
    for (const [source, button] of sourceButtons) button.setAttribute('aria-pressed', String(source === view.source));
    sourceContext.hidden = !view.source;
    sourceLabel.textContent = view.source ? '关联来源 ' + sources.get(view.source).title : '';
    const terms = view.query.trim().toLocaleLowerCase().normalize('NFC').split(/\s+/u).filter(Boolean);
    const filtered = rows.filter(row => {
      const kind = row.item.kind === 'research' ? 'doc' : row.item.kind;
      return (!view.kind || kind === view.kind) && terms.every(term => row.searchText.includes(term))
        && (!view.source || row.links.some(link => link.kind + ':' + link.id === view.source));
    });
    const shown = view.expanded ? filtered : filtered.slice(0, periodMaterialsLimit);
    results.replaceChildren(shown.length ? element('ul', { className: 'period-material-list' },
      shown.map(row => periodMaterialRow(row, view.source))) : emptyState(rows.length ? '没有匹配的资料' :
      data.sources?.vault?.status === 'unavailable' ? '资料暂不可用' : '阶段内暂无关联资料'));
    count.textContent = '显示 ' + shown.length + ' / ' + filtered.length + ' 项';
    footer.hidden = !rows.length;
    more.hidden = filtered.length <= periodMaterialsLimit;
    more.textContent = view.expanded ? '收起' : '查看全部 ' + filtered.length + ' 项';
    more.setAttribute('aria-expanded', String(view.expanded));
  }

  draw();
  return {
    section,
    sourceButton(kind, item) {
      const sourceKey = kind + ':' + (item.id || item.path);
      const source = sources.get(sourceKey);
      if (!source) return null;
      const button = element('button', { type: 'button', className: 'button period-material-entry', 'aria-controls': results.id,
        'aria-label': '查看「' + source.title + '」的 ' + source.count + ' 项资料',
        'aria-pressed': String(view.source === sourceKey),
        onClick: () => {
          view.source = sourceKey;
          view.query = search.value = '';
          view.kind = '';
          view.expanded = false;
          draw();
          section.scrollIntoView({ block: 'start' });
          heading.focus({ preventScroll: true });
        },
      }, '资料 ', source.count);
      sourceButtons.set(sourceKey, button);
      return button;
    },
  };
}

function homePage() {
  const { period } = state.route;
  const view = currentPeriodView(period);
  const data = view?.data;
  const materials = data && periodMaterialBrowser(data);
  return element('div', { className: 'page period-page' },
    periodHeading(period, data),
    view?.error && element('div', { className: 'panel load-error', role: 'alert' },
      emptyState(data ? '阶段数据刷新失败，仍显示上次读取的结果' : '无法读取阶段数据', view.error),
      element('button', { type: 'button', className: 'button', onClick: () => loadPeriod(true) }, '重新读取')),
    !data && !view?.error && element('div', { className: 'panel loading period-loading', role: 'status' }, '正在读取阶段数据…'),
    data && [
      element('div', { className: 'period-work-grid' }, periodCaseRows(data, materials), periodTaskRows(data, period.taskTab, materials)),
      materials.section,
      sourceBlock(data, ['vault', 'tasknotes']),
    ]);
}

function metaPair(label, value) {
  return value ? element('div', {}, element('dt', {}, label), element('dd', {}, value)) : null;
}

function projectPage() {
  const project = state.data.project;
  if (!project) return element('div', { className: 'page' }, pageHeader('项目'), emptyState('暂无项目'));
  const cases = byNewest(collection('cases'));
  const overview = valueText(project.overview);
  const description = valueText(project.description);
  const relatedProjects = array(project.relatedProjects);
  return element('div', { className: 'page project-page' },
    pageHeader(project.title, description, [statusPill(project.status), actionLink('阅读项目正文', 'project')]),
    collectionOverview(),
    element('div', { className: 'dashboard-grid project-grid' },
      element('section', { className: 'panel prose-panel' },
        blockHeader('项目概览'),
        overview && overview !== description ? element('p', { className: 'long-text' }, overview) :
          !description && emptyState('暂无项目概览'),
        element('dl', { className: 'meta-grid' },
          metaPair('状态', statusText(project.status)),
          metaPair('优先级', priorityLabels[statusKey(project.priority)] || project.priority),
          metaPair('项目卡', project.path))),
      element('section', { className: 'panel dashboard-panel' },
        blockHeader('项目 Case', actionLink('全部 Case', 'cases')),
        cases.length ? entityList('cases', cases.slice(0, 5)) : emptyState('暂无 Case'))),
    relatedProjects.length > 0 && element('section', { className: 'panel prose-panel' },
      blockHeader('关联项目'),
      element('ul', { className: 'related-projects' }, relatedProjects.map((entry) =>
        element('li', {}, element('a', {
          className: 'related-project-link', href: '?project=' + encodeURIComponent(entry.path) + projectOverviewHref,
        }, icon('project'), element('div', {}, element('strong', {}, entry.title),
          element('p', { className: 'meta' }, entry.path)), arrow()))))),
    sourceBlock());
}

function viewState(section) {
  if (!state.collectionViews.has(section)) state.collectionViews.set(section, { query: '', status: '' });
  return state.collectionViews.get(section);
}

function collectionPage(section) {
  const config = sections[section];
  const view = viewState(section);
  const entries = byNewest(collection(section));
  const sourceKey = section === 'tasks' ? 'tasknotes' : 'vault';
  const source = sourceStatus(sourceKey);
  const statuses = new Map(entries.filter(item => statusKey(item.status)).map(item => [statusKey(item.status), statusText(item.status)]));
  const query = element('input', {
    type: 'search', placeholder: '筛选' + config.name, 'aria-label': '筛选' + config.name, className: 'filter-input',
  });
  query.value = view.query;
  if (view.status && !statuses.has(view.status)) view.status = '';
  const statusFilter = statuses.size > 0 && window.FlowDeskChoiceMenu.create({
    id: section + '-status-filter', label: '筛选状态', className: 'choice-filter',
    options: [{ value: '', label: '全部状态' }, ...Array.from(statuses, ([value, label]) => ({ value, label }))],
    value: view.status, onSelect: value => { view.status = value; updateResults(); },
  }).element;
  const resultCount = element('span', { className: 'meta result-count', role: 'status' });
  const results = element('div', { className: 'collection-results collection-list' });
  const columns = element('div', { className: 'collection-columns', 'aria-hidden': 'true' },
    element('span', { className: 'collection-column-name' }, '名称'),
    element('span', { className: 'collection-column-status' }, '状态'));
  const page = element('div', { className: 'page collection-page' }, pageHeader(config.name, null, statusPill(source.status === 'ok' ? '' : source.status)),
    source.status !== 'ok' && source.detail && element('p', { className: 'source-note' }, source.detail),
    element('section', { className: 'panel collection-panel', 'aria-label': config.name + '列表' },
      element('div', { className: 'collection-tools' },
        element('label', { className: 'filter-wrap' }, icon('search'), query), statusFilter, resultCount), columns, results));

  function updateResults() {
    const words = valueText(view.query).toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const visible = entries.filter((item) => (!view.status || statusKey(item.status) === view.status) &&
      words.every((word) => [item.title, item.path, item.cwd, item.summary]
        .map(valueText).join(' ').toLocaleLowerCase().includes(word)));
    resultCount.textContent = view.query || view.status ? `${visible.length} / ${entries.length} 条` : `${entries.length} 条`;
    columns.hidden = visible.length === 0;
    if (!visible.length) {
      results.replaceChildren(emptyState(entries.length ? '没有匹配结果' : '暂无' + config.name,
        entries.length ? '试试其他关键词或状态。' : source.status === 'ok' ? '' : source.detail || '数据源暂未返回内容。'));
      return;
    }
    const list = entityList(section, visible, true);
    const selected = visible.findIndex(item => (item.id || item.path) === view.lastOpened);
    if (selected !== -1) list.children[selected].firstElementChild.dataset.selected = 'true';
    results.replaceChildren(list);
  }

  query.addEventListener('input', () => { view.query = query.value; updateResults(); });
  updateResults();
  return page;
}

function docHubRouteNeedsIndex(current) {
  return current?.section === 'doc-hub' && !current.id;
}

function documentProjectNames(document) {
  return document.projects?.length ? document.projects : [uncategorizedProject];
}

function docHubProjectGroups(documents) {
  const groups = new Map();
  for (const document of documents) {
    for (const name of documentProjectNames(document)) {
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(document);
    }
  }
  return [...groups].sort(([left, leftItems], [right, rightItems]) =>
    Number(left === uncategorizedProject) - Number(right === uncategorizedProject) || rightItems.length - leftItems.length ||
    rightItems[0].mtime - leftItems[0].mtime || collator.compare(left, right));
}

function docHubDocumentCard(document, pinnedView) {
  const kind = docHubKinds[document.kind];
  const reviewed = dateValue(document.reviewedAt);
  const daysSinceReview = (Date.now() - reviewed) / 86400000;
  const reviewTone = !reviewed || daysSinceReview >= 30 ? 'stale' : daysSinceReview >= 7 ? 'aging' : 'fresh';
  return element('li', {}, element('a', {
    href: linkHref('doc-hub', document.id), className: 'doc-hub-card', 'data-kind': document.kind, title: document.path,
  }, element('div', { className: 'doc-hub-card-top' },
    element('span', { className: 'doc-hub-kind' }, icon('document'), kind),
    statusPill(document.status), arrow()),
  element('strong', { className: 'doc-hub-card-title' }, document.title),
  document.summary && element('p', { className: 'doc-hub-card-summary' }, document.summary),
  element('div', { className: 'doc-hub-card-meta' },
    element('span', { title: documentProjectNames(document).join('、') }, documentProjectNames(document).join(' · ')),
    pinnedView ? element('span', { className: 'doc-hub-review-date', 'data-tone': reviewTone },
      reviewed ? '回看于 ' + dateText(reviewed) : '未回看') : [document.pinned && element('span', {}, '常驻'), dateLabel(document.updatedAt)])));
}

function isGalleryHref(link) {
  return typeof link === 'string' && (link === '/gallery/' || link.startsWith('/gallery/collections/'));
}

function docHubGalleryCard(gallery, terms) {
  const pages = array(gallery.pages).filter(page => isGalleryHref(page.href));
  const orderedPages = pages.map(page => {
    const text = [page.title, page.searchText].join(' ').toLocaleLowerCase().normalize('NFC');
    return { page, matches: terms.filter(term => text.includes(term)).length };
  }).sort((left, right) => right.matches - left.matches);
  const projects = documentProjectNames(gallery).join(' · ');
  const overview = isGalleryHref(gallery.href) && gallery.href;
  const note = gallery.documentPath && lookup('documents', gallery.documentPath);
  return element('li', {}, element('article', { className: 'doc-hub-card doc-hub-atlas-card', 'data-kind': 'atlas' },
    element('div', { className: 'doc-hub-card-top' },
      element('span', { className: 'doc-hub-kind' }, icon('library'), '图集'),
      element('span', { className: 'doc-hub-atlas-count' }, pages.length + ' 页')),
    element('strong', { className: 'doc-hub-card-title' }, gallery.title),
    gallery.summary && element('p', { className: 'doc-hub-card-summary' }, gallery.summary),
    (overview || note) && element('div', { className: 'doc-hub-atlas-actions' },
      overview && element('a', { href: overview, target: '_blank', rel: 'noopener noreferrer', className: 'button doc-hub-atlas-open',
        'aria-label': '打开 ' + gallery.title + ' 的总览（新标签页）',
      }, '打开总览', element('span', { 'aria-hidden': 'true' }, '↗')),
      note && openLink('documents', note.path || note.id, '关联文档', 'button doc-hub-atlas-note')),
    orderedPages.length > 0 && element('ul', { className: 'doc-hub-atlas-pages', 'aria-label': '图集子页' },
      orderedPages.map(({ page, matches }) => element('li', {}, element('a', {
        href: page.href, target: '_blank', rel: 'noopener noreferrer', className: 'doc-hub-atlas-page',
        'data-match': String(matches > 0), title: page.title,
      }, page.title, element('span', { 'aria-hidden': 'true' }, '↗'))))),
    element('div', { className: 'doc-hub-card-meta' }, element('span', { title: projects }, projects), dateLabel(gallery.updatedAt))));
}

function docHubItemCount(items) {
  const galleries = items.filter(item => item.kind === 'atlas').length;
  const notes = items.length - galleries;
  return [notes && notes + ' 份文档', galleries && galleries + ' 个图集'].filter(Boolean).join(' · ') || '0 项';
}

function docHubGrid(items, { pinnedView = false, terms = [] } = {}) {
  return element('ul', { className: 'doc-hub-grid' }, items.map(item =>
    item.kind === 'atlas' ? docHubGalleryCard(item, terms) : docHubDocumentCard(item, pinnedView)));
}

function docHubRecent(documents, view, terms, onMore) {
  const now = Date.now();
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups = [[], [], [], []];
  const groupLabels = ['今天', '7 天内', '30 天内', '更早'];
  const day = 86400000;
  for (const document of documents) {
    const index = document.mtime >= startOfToday ? 0 : now - document.mtime < 7 * day ? 1 : now - document.mtime < 30 * day ? 2 : 3;
    groups[index].push(document);
  }
  let remaining = view.showAll ? documents.length : 48;
  const recent = groups.flatMap((group, index) => {
    const displayed = group.slice(0, remaining);
    remaining -= displayed.length;
    return displayed.length ? [element('section', { className: 'doc-hub-group' },
      element('h2', {}, groupLabels[index], element('small', {}, docHubItemCount(group))), docHubGrid(displayed, { terms }))] : [];
  });
  if (!view.showAll && documents.length > 48) recent.push(element('button', {
    id: 'doc-hub-more', className: 'button doc-hub-more', type: 'button', onClick: onMore,
  }, `显示全部 ${documents.length} 项`));
  return recent;
}

function docHubPage() {
  const { data, loading, error } = state.docHub;
  const source = data?.source;
  const documents = [...collection('doc-hub'), ...array(data?.galleries)]
    .sort((left, right) => right.mtime - left.mtime || collator.compare(left.title, right.title));
  const title = pageHeader('文档中心', data && docHubItemCount(documents));
  const page = element('div', { className: 'page doc-hub-page' }, title);
  if (!data || error && !documents.length || source?.status === 'unavailable' && !documents.length) {
    const message = error || (source?.status === 'unavailable' && (source.detail || 'Vault 暂不可读。'));
    page.append(message && !loading ? element('div', { className: 'panel load-error', role: 'alert' },
      emptyState('无法读取文档中心', message),
      element('button', { type: 'button', className: 'button primary', onClick: () => loadDocHub(true) }, '重新读取')) :
      element('div', { className: 'panel loading doc-hub-loading', role: 'status' }, '正在读取文档中心…'));
    return page;
  }
  if (error || source?.status && source.status !== 'ok') {
    page.append(element('p', { className: 'source-note', role: 'status' }, error || source.detail || '部分文档暂不可用。'));
  }
  const view = state.docHubView;
  const search = element('input', { id: 'doc-hub-filter', type: 'search', className: 'filter-input',
    placeholder: '搜索标题、摘要、项目或图集内容', 'aria-label': '搜索文档', 'aria-keyshortcuts': '/', spellcheck: 'false' });
  search.value = view.query;
  const projectOptions = [{ value: '', label: '全部项目' }, ...docHubProjectGroups(documents).map(([name]) => ({ value: name, label: name }))];
  if (!projectOptions.some(option => option.value === view.project)) view.project = '';
  const projectFilter = window.FlowDeskChoiceMenu.create({
    id: 'doc-hub-project-filter', label: '按项目筛选文档', className: 'choice-filter',
    options: projectOptions, value: view.project, search: '搜索项目',
    onSelect: value => { view.project = value; updateResults(); },
  }).element;
  const tabButtons = Object.entries(docHubTabs).map(([key, label]) => element('button', {
    type: 'button', className: 'doc-hub-tab', id: 'doc-hub-tab-' + key, 'data-tab': key, 'aria-controls': 'doc-hub-results',
    onClick: () => { view.tab = key; updateResults(); },
  }, label, element('small', { className: 'doc-hub-tab-count' })));
  const typeButtons = Object.entries({ '': '全部', ...docHubKinds }).map(([key, label]) => element('button', {
    type: 'button', className: 'doc-hub-filter-chip', id: 'doc-hub-type-' + (key || 'all'), 'data-kind': key,
    onClick: () => {
      view.kind = key;
      if (key === 'atlas' && view.tab === 'pinned') view.tab = 'recent';
      updateResults();
    },
  }, label));
  const archived = element('input', { type: 'checkbox', id: 'doc-hub-archived', checked: view.includeArchived });
  const results = element('div', { id: 'doc-hub-results', className: 'doc-hub-results' });
  const count = element('span', { className: 'meta doc-hub-result-count', role: 'status' });
  const controls = element('section', { className: 'doc-hub-controls', 'aria-label': '浏览与筛选文档' },
    element('div', { className: 'doc-hub-controls-row' },
      element('div', { className: 'doc-hub-tabs', role: 'group', 'aria-label': '文档视角' }, tabButtons),
      element('label', { className: 'filter-wrap doc-hub-search' }, icon('search'), search)),
    element('div', { className: 'doc-hub-controls-row doc-hub-filters' },
      element('div', { className: 'doc-hub-types', role: 'group', 'aria-label': '文档类型' }, typeButtons),
      projectFilter, element('label', { className: 'doc-hub-archived' }, archived, '显示已取代 / 归档'), count));
  page.append(controls, results);
  const searchable = new Map(documents.map(document => [document, [
    document.title, document.summary, document.path || document.id, ...documentProjectNames(document), document.searchText,
    ...array(document.pages).flatMap(page => [page.title, page.searchText]),
  ].join(' ').toLocaleLowerCase().normalize('NFC')]));

  function updateResults() {
    const terms = valueText(view.query).toLocaleLowerCase().normalize('NFC').split(/\s+/).filter(Boolean);
    const visible = documents.filter(document => (view.includeArchived || !['archived', 'superseded'].includes(statusKey(document.status))) &&
      (!view.kind || view.kind === document.kind) && (!view.project || documentProjectNames(document).includes(view.project)) &&
      terms.every(term => searchable.get(document).includes(term)));
    const groups = docHubProjectGroups(visible);
    const pinned = visible.filter(document => document.pinned).sort((left, right) => (left.reviewedAt ?? 0) - (right.reviewedAt ?? 0) ||
      collator.compare(left.title, right.title));
    const counts = { recent: visible.length, project: groups.length, pinned: pinned.length };
    for (const tab of tabButtons) {
      tab.setAttribute('aria-pressed', String(view.tab === tab.dataset.tab));
      tab.querySelector('small').textContent = counts[tab.dataset.tab];
    }
    for (const chip of typeButtons) chip.setAttribute('aria-pressed', String(view.kind === chip.dataset.kind));
    count.textContent = '匹配 ' + docHubItemCount(view.tab === 'pinned' ? pinned : visible);
    if (!visible.length || view.tab === 'pinned' && !pinned.length) {
      results.replaceChildren(element('div', { className: 'panel' }, emptyState(
        view.tab === 'pinned' ? '没有匹配的常驻文档' : view.kind === 'atlas' ? '没有匹配的图集' : '没有匹配的内容')));
    } else if (view.tab === 'pinned') {
      results.replaceChildren(docHubGrid(pinned, { pinnedView: true, terms }));
    } else if (view.tab === 'project') {
      results.replaceChildren(...groups.map(([name, group], index) => element('details', {
        className: 'doc-hub-project-group', open: view.openGroups.get(name) ?? (index < 3 || Boolean(view.project || terms.length)),
        onToggle: event => { if (event.currentTarget.isConnected) view.openGroups.set(name, event.currentTarget.open); },
      }, element('summary', {}, element('strong', {}, name), element('span', { className: 'meta' }, docHubItemCount(group))), docHubGrid(group, { terms }))));
    } else {
      results.replaceChildren(...docHubRecent(visible, view, terms, () => {
        view.showAll = true;
        updateResults();
        const firstNew = results.querySelectorAll('.doc-hub-card')[48];
        (firstNew?.matches('a') ? firstNew : firstNew?.querySelector('a'))?.focus();
      }));
    }
  }

  search.addEventListener('input', () => { view.query = search.value; updateResults(); });
  archived.addEventListener('change', () => { view.includeArchived = archived.checked; updateResults(); });
  updateResults();
  return page;
}

function pathMatch(paths, item) {
  return array(paths).some((path) => sameReference(path, item.path || item.id));
}

function linkedEntries(section, item) {
  const links = {};
  if (section === 'cases') {
    links.cases = collection('cases').filter((entry) => entry.id !== item.id &&
      (pathMatch(item.casePaths, entry) || pathMatch(entry.casePaths, item)));
    links.tasks = collection('tasks').filter((task) => pathMatch(item.taskPaths, task) || pathMatch(task.casePaths, item));
    links.documents = collection('documents').filter((document) => pathMatch(item.documentPaths, document));
  } else if (section === 'tasks') {
    links.cases = collection('cases').filter((entry) => pathMatch(item.casePaths, entry) || pathMatch(entry.taskPaths, item));
  } else if (section === 'documents') {
    links.cases = collection('cases').filter((entry) => pathMatch(entry.documentPaths, item));
  } else if (section === 'project') {
    links.cases = collection('cases');
  }
  return links;
}

function factBlock(section, item) {
  let facts;
  if (section === 'cases') {
    facts = [
      metaPair('目标', valueText(item.goal)),
      metaPair('当前进展', valueText(item.current)),
      metaPair('更新时间', dateLabel(item.updatedAt, true)),
      metaPair('分支', item.branch),
      metaPair('工作目录', item.cwd),
    ];
  } else if (section === 'tasks') {
    facts = [
      metaPair('截止日期', dateLabel(item.due) || item.due),
      metaPair('安排日期', dateLabel(item.scheduled) || item.scheduled),
      metaPair('优先级', priorityLabels[statusKey(item.priority)] || item.priority),
      metaPair('更新时间', dateLabel(item.updatedAt, true)),
    ];
  } else if (section === 'project') {
    facts = [
      metaPair('状态', statusText(item.status)),
      metaPair('优先级', priorityLabels[statusKey(item.priority)] || item.priority),
      metaPair('项目卡', item.path),
      metaPair('更新时间', dateLabel(item.updatedAt, true)),
    ];
  } else {
    facts = [
      metaPair('类型', documentKinds[statusKey(item.kind)] || item.kind),
      metaPair('更新时间', dateLabel(item.updatedAt, true)),
      metaPair('路径', item.path),
    ];
  }
  return facts.some(Boolean) ? element('dl', { className: 'meta-grid detail-facts' }, facts) : null;
}

function readDetail(section, item, previousData) {
  const id = item.id || item.path;
  const key = section + ':' + id;
  const record = { data: previousData, loading: true };
  state.details.set(key, record);
  const params = new URLSearchParams({ kind: section === 'project' ? 'project' : sections[section].single, id });
  const project = projectPath(state.data?.project);
  if (project) params.set('project', project);
  request('/api/detail?' + params).then(
    (data) => {
      if (state.details.get(key) !== record) return;
      record.data = data;
      for (const alias of [data.id, data.path, data.record?.id, data.record?.path]) {
        if (alias) state.details.set(section + ':' + alias, record);
      }
    },
    (err) => { record.error = err.message; record.status = err.status; },
  ).finally(() => {
    record.loading = false;
    const current = detailRouteItem(state.route);
    if (state.details.get(key) === record &&
      readerSection(state.route?.section) === section &&
      (state.route.id === id || (current?.id || current?.path) === id)) renderWithReadingPosition();
  });
  return record;
}

function directReaderPage(section, id) {
  const key = section + ':' + id;
  const cached = state.details.get(key);
  const record = cached && !cached.stale ? cached : readDetail(section, { id }, cached?.data);
  return element('div', { className: 'page' }, pageHeader(sections[section].name),
    record.error
      ? element('div', { className: 'panel load-error', role: 'alert' },
        emptyState(record.status === 404 ? '找不到此条目' : '无法读取详情', record.error),
        element('button', {
          type: 'button', className: 'button', onClick: () => { readDetail(section, { id }); render(); },
        }, '重新读取'))
      : element('section', { className: 'reader-document loading', role: 'status' }, '正在读取详情…'));
}

function sourceDocument(section, item) {
  const key = section + ':' + (item.id || item.path);
  const cached = state.details.get(key);
  const record = cached && !cached.stale ? cached : readDetail(section, item, cached?.data);
  if (record.error && !record.data) {
    return { body: element('section', { className: 'reader-document load-error', role: 'alert' },
      emptyState('无法读取详情', record.error),
      element('button', { type: 'button', className: 'button', onClick: () => { readDetail(section, item); render(); } }, '重新读取')), headings: [] };
  }
  if (!record.data) return {
    body: element('section', { className: 'reader-document loading', role: 'status' }, '正在读取详情…'),
    headings: [],
  };
  const detail = record.data;
  const content = element('div', { className: 'markdown reader-prose' });
  if (valueText(detail.html)) content.innerHTML = detail.html;
  else if (valueText(detail.markdown)) content.append(element('pre', { className: 'plain-text' }, detail.markdown));
  else content.append(emptyState('暂无正文'));

  const first = content.firstElementChild;
  if (first?.tagName === 'H1' && first.textContent.trim() === item.title?.trim()) first.remove();
  const timeline = content.querySelector('.progress-timeline');
  const progressHeading = timeline?.previousElementSibling;
  if (progressHeading?.matches('h2')) {
    progressHeading.dataset.sourceHeading = progressHeading.textContent.trim();
    progressHeading.textContent = '进展记录';
  }
  const headings = [...content.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .filter(heading => !heading.closest('.progress-timeline, .md-callout'));
  headings.forEach((heading, index) => {
    heading.id = 'workbench-chapter-' + (index + 1);
    heading.tabIndex = -1;
  });
  const references = [...content.querySelectorAll('a[href^="#/"]')].map(link => route(link.getAttribute('href')));
  const current = section === 'cases' && headings.find(heading => /^(?:Current\b|当前(?:状态|进展|工作))/iu.test(heading.textContent.trim()));
  return {
    headings, current, references, sourceUrl: safeHref(detail.sourceUrl),
    sourceSha256: valueText(detail.sourceSha256),
    progress: timeline && progressHeading?.matches('h2')
      ? { heading: progressHeading, count: Number(timeline.dataset.progressCount) || 0 } : null,
    body: element('article', { className: 'reader-document', 'aria-label': '正文' },
      record.error && element('p', { className: 'source-note', role: 'status' }, '正文更新失败，仍显示上次读取的内容。'),
      content),
  };
}

let readerOutlineFrame;
function updateReaderOutline() {
  if (readerOutlineFrame) return;
  readerOutlineFrame = requestAnimationFrame(() => {
    readerOutlineFrame = null;
    const outline = app.querySelector('.reader-outline');
    if (!outline?.getClientRects().length) return;
    const buttons = [...outline.querySelectorAll('button[data-heading]')];
    const previous = outline.querySelector('[aria-current="location"]');
    let active = buttons[0];
    const toolbarBottom = app.querySelector('.reader-toolbar')?.getBoundingClientRect().bottom || 0;
    const threshold = toolbarBottom + 44;
    for (const button of buttons) {
      const heading = document.getElementById(button.dataset.heading);
      if (!heading || heading.getBoundingClientRect().top > threshold) break;
      active = button;
    }
    if (buttons.length > 1 && window.scrollY > 0 &&
      Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight) active = buttons.at(-1);
    const focusedHeading = document.activeElement;
    const focusedButton = buttons.find(button => button.dataset.heading === focusedHeading?.id);
    if (focusedButton) {
      const top = focusedHeading.getBoundingClientRect().top;
      if (top >= toolbarBottom - 4 && top <= toolbarBottom + 148) active = focusedButton;
    }
    for (const button of buttons) {
      if (button === active) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    }
    if (active && active !== previous) {
      const panel = outline.closest('.reader-context');
      if (panel && panel.scrollHeight > panel.clientHeight) {
        const frame = panel.getBoundingClientRect();
        const tabsBottom = panel.querySelector('.reader-context-tabs')?.getBoundingClientRect().bottom || frame.top;
        const top = Math.max(frame.top, tabsBottom) + 5;
        const bottom = frame.bottom - 5;
        const row = active.getBoundingClientRect();
        if (row.top < top) panel.scrollTop += row.top - top;
        else if (row.bottom > bottom) panel.scrollTop += row.bottom - bottom;
      }
    }
  });
}

function readerOutline(headings, onNavigate) {
  if (!headings.length) return null;
  const baseLevel = Math.min(...headings.map(heading => Number(heading.tagName.slice(1))));
  return element('nav', { className: 'reader-outline reader-panel', 'aria-label': '本文目录' },
    element('ul', {}, headings.map(heading => element('li', {},
      element('button', {
        className: 'reader-chapter', type: 'button', 'data-heading': heading.id,
        'data-depth': Math.min(3, Number(heading.tagName.slice(1)) - baseLevel),
        title: heading.textContent.trim(),
        onClick: () => { onNavigate(); jumpToHeading(heading); },
      }, heading.textContent.trim())))));
}

function jumpToHeading(heading) {
  for (let disclosure = heading.closest('details'); disclosure; disclosure = disclosure.parentElement?.closest('details')) {
    disclosure.open = true;
  }
  heading.tabIndex = -1;
  const topbarHeight = app.querySelector('.topbar')?.getBoundingClientRect().height || 0;
  const toolbarHeight = app.querySelector('.reader-toolbar')?.getBoundingClientRect().height || 0;
  window.scrollTo(0, window.scrollY + heading.getBoundingClientRect().top - topbarHeight - toolbarHeight - 22);
  heading.focus({ preventScroll: true });
  updateReaderOutline();
}

function readerRelatedGroups(section, item, references) {
  const links = linkedEntries(section, item);
  for (const ref of array(references)) {
    if (!ref.id || !Object.hasOwn(sections, ref.section)) continue;
    const target = lookup(ref.section, ref.id);
    if (!target || target.id === item.id) continue;
    const group = links[ref.section] ??= [];
    if (!group.some(entry => entry.id === target.id)) group.push(target);
  }
  return Object.entries(links).filter(([, entries]) => entries.length);
}

function readerRelatedGroup(section, entries) {
  return element('section', { className: 'reader-related-group' },
    element('h3', {}, sections[section].name, element('span', { className: 'meta' }, entries.length)),
    entityList(section, entries));
}

function readerHeading(section, item, title) {
  const kind = section === 'documents' ? documentKinds[statusKey(item.kind)] || '资料'
    : section === 'cases' ? 'Work Case' : section === 'project' ? 'Project' : sections[section].name;
  return element('header', { className: 'reader-header' },
    element('h1', {}, title),
    element('div', { className: 'reader-header-meta' }, element('span', {}, kind),
      statusPill(item.status),
      item.updatedAt && element('span', {}, '更新于 ', dateLabel(item.updatedAt)),
      section === 'project' && element('a', { className: 'project-overview-link', href: '#/project?view=overview' }, '项目概览')));
}

function readerPage(section, item) {
  const key = section + ':' + (item.id || item.path);
  const view = state.readerViews.get(key) || { contextOpen: false, contextPage: 'outline' };
  state.readerViews.set(key, view);
  const source = sourceDocument(section, item);
  const links = readerRelatedGroups(section, item, source.references);
  const title = item.title || item.path || item.id;
  const outlineId = 'reader-outline-panel';
  const relatedId = 'reader-related-panel';
  const linkCount = links.reduce((total, [, entries]) => total + entries.length, 0);
  const outlinePane = element('div', { id: outlineId }, readerOutline(source.headings, () => {
    if (narrowReader.matches) setContext(false);
  }) || element('p', { className: 'reader-context-empty meta' }, '本文没有章节标题。'));
  const relatedPane = element('div', { id: relatedId },
    links.map(([kind, entries]) => readerRelatedGroup(kind, entries)),
    !linkCount && element('p', { className: 'reader-context-empty meta' }, '暂无关联条目。'),
    element('details', { className: 'reader-panel reader-source-facts' },
      element('summary', {}, '来源信息'), factBlock(section, item)));
  const contextTabs = [
    element('button', { type: 'button', className: 'reader-context-tab',
      'data-context-page': 'outline', 'aria-controls': outlineId, onClick: () => setContextPage('outline') }, '目录'),
    element('button', { type: 'button', className: 'reader-context-tab',
      'data-context-page': 'related', 'aria-controls': relatedId, onClick: () => setContextPage('related') }, '关联',
      linkCount > 0 && element('span', { className: 'reader-tab-count' }, linkCount)),
  ];
  const readPanel = element('div', { className: 'reader-context-content' },
    element('div', { className: 'reader-context-tabs', role: 'group', 'aria-label': '阅读侧栏' }, contextTabs),
    outlinePane, relatedPane);
  const contextButton = element('button', {
    className: 'button reader-context-toggle', type: 'button', 'aria-haspopup': 'dialog', 'aria-controls': 'reader-drawer',
    onClick: () => setContext(true),
  }, '目录与关联');
  const closeContext = element('button', { className: 'button reader-context-close', type: 'button',
    autofocus: true, onClick: () => setContext(false, true) }, '关闭');
  const drawerTitle = element('strong', { id: 'reader-drawer-title' }, '目录与关联');
  const context = element('aside', { className: 'reader-context', id: 'reader-context', 'aria-label': '阅读侧栏' },
    element('div', { className: 'reader-context-bar' }, drawerTitle, closeContext),
    readPanel);
  const dialog = element('dialog', { id: 'reader-drawer', className: 'reader-dialog', 'aria-labelledby': 'reader-drawer-title',
    onCancel: (event) => { event.preventDefault(); setContext(false, true); },
    onClick: (event) => { if (event.target === dialog) setContext(false, true); } });
  const shell = element('div', { className: 'reading-shell' },
    element('div', { className: 'reader-main' }, source.body), context, dialog);
  function syncContext() {
    if (!shell.isConnected) return;
    if (narrowReader.matches) {
      if (context.parentElement !== dialog) dialog.append(context);
      if (view.contextOpen && !dialog.open) dialog.showModal();
      if (!view.contextOpen && dialog.open) dialog.close();
    } else {
      if (dialog.open) dialog.close();
      if (context.parentElement !== shell) shell.insertBefore(context, dialog);
    }
  }

  function setContextPage(page) {
    view.contextPage = page;
    outlinePane.hidden = page !== 'outline';
    relatedPane.hidden = page !== 'related';
    contextTabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.contextPage === page)));
    if (page === 'outline') updateReaderOutline();
  }

  function setContext(open, focus = false) {
    view.contextOpen = open;
    contextButton.setAttribute('aria-expanded', String(open));
    syncContext();
    if (focus) contextButton.focus();
    updateReaderOutline();
  }
  dialog.addEventListener('layoutchange', syncContext);
  queueMicrotask(syncContext);
  setContextPage(view.contextPage);
  setContext(view.contextOpen);
  const actions = source.sourceUrl ? element('a', {
    href: source.sourceUrl, target: '_blank', rel: 'noopener noreferrer', className: 'button',
  }, 'Obsidian 原文') : null;
  const externalReview = item.path && (section === 'documents' || section === 'cases') && element('a', {
    href: '/external-review?' + new URLSearchParams({ [section === 'cases' ? 'case' : 'document']: item.path }),
    className: 'button',
  }, '发起外部评审');
  const feedbackHost = source.sourceSha256 && item.path && element('div', {
    className: 'reader-feedback-host', 'data-document': item.path, 'data-source-sha256': source.sourceSha256,
  });
  const progressLink = source.progress && element('button', {
    type: 'button', className: 'button reader-progress-link',
    onClick: () => jumpToHeading(source.progress.heading),
  }, '查看进展', source.progress.count > 0 && element('span', { className: 'reader-tab-count' }, source.progress.count));
  return element('div', { className: 'page reading-page' },
    readerHeading(section, item, title),
    element('div', { className: 'reader-toolbar' },
      element('div', { className: 'reader-toolbar-label' }, source.current && element('button', {
          type: 'button', className: 'button reader-current-link', onClick: () => jumpToHeading(source.current),
        }, '当前状态'), progressLink),
      element('div', { className: 'reader-toolbar-actions' }, contextButton, actions, externalReview)),
    shell, feedbackHost);
}

function missingPage(section) {
  const target = section === 'doc-hub' || Object.hasOwn(sections, section) ? section : 'home';
  const label = target === 'doc-hub' ? '文档中心' : sections[target]?.name || '工作台';
  return element('div', { className: 'page' },
    pageHeader('找不到此页面'),
    element('div', { className: 'panel load-error' }, emptyState('当前投影中没有这个条目'), actionLink('返回' + label, target, undefined, true)));
}

function searchScope() {
  if (state.route?.section === 'home') return {
    kind: 'period', label: '搜索阶段', placeholder: '搜索阶段内的项目、Case、任务和资料', available: Boolean(currentPeriodView()?.data),
  };
  if (state.route?.section === 'doc-hub') return {
    kind: 'hub', label: '搜索文档中心', placeholder: '搜索文档、方案、调研和图集', available: Boolean(state.data || state.docHub.data),
  };
  return {
    kind: 'project', label: '搜索当前项目', placeholder: '搜索项目、Case、任务和资料',
    available: Boolean(state.data && requestedProject() === projectPath(state.data.project)),
  };
}

function indexSearch(kind) {
  const period = kind === 'period' ? currentPeriodView()?.data : null;
  const hub = kind === 'hub' ? state.docHub.data : null;
  const workspace = kind === 'project' ? state.data : null;
  const records = period ? {
    ...period, tasks: [...array(period.taskPool?.inPeriod), ...array(period.taskPool?.carryover), ...array(period.completed)],
  } : hub ? {
    ...hub, documents: array(hub.documents).filter(item => state.docHubView.includeArchived || !['archived', 'superseded'].includes(statusKey(item.status))),
  } : workspace || {};
  const entries = Object.entries(sections).flatMap(([section, config]) => array(records[section]).map(item => {
    const category = kind !== 'project' && section === 'documents' ? docHubKinds[item.kind] || config.name : config.name;
    return {
      href: linkHref(hub && section === 'documents' ? 'doc-hub' : section, item.id || item.path), category, icon: config.icon,
      title: item.title || item.path || item.id, path: item.path,
      words: [item.title, item.path, item.cwd, item.summary, category, statusText(item.status),
        ...(kind !== 'project' ? array(item.projects) : [])],
      updatedAt: item.updatedAt,
    };
  }));
  const projects = period ? array(state.data?.projects).filter(project => !period.projectPath || sameReference(project.path, period.projectPath))
    : workspace?.project ? [workspace.project] : [];
  for (const project of projects) entries.push({
    href: period ? '?project=' + encodeURIComponent(project.path) + projectOverviewHref : linkHref('project'),
    category: '项目', icon: 'project', title: project.title, path: project.path,
    words: [project.title, project.path, project.description, '项目'], updatedAt: workspace?.observedAt || project.updatedAt,
  });
  for (const gallery of array(records.galleries)) {
    const pages = array(gallery.pages).filter(page => isGalleryHref(page.href));
    const firstPage = isGalleryHref(gallery.href) ? null : pages[0];
    const href = firstPage?.href || gallery.href;
    if (!isGalleryHref(href)) continue;
    entries.push({
      href, external: true, category: '图集', icon: 'library', title: gallery.title, path: firstPage?.title,
      words: [gallery.title, gallery.summary, gallery.searchText, '图集', ...array(gallery.projects),
        ...pages.flatMap(page => [page.title, page.searchText])], updatedAt: gallery.updatedAt,
    });
  }
  return byNewest([...new Map(entries.map(entry => [entry.href, entry])).values()]).map((entry) => ({
    ...entry, searchText: entry.words.map(valueText).join(' ').toLocaleLowerCase().normalize('NFC'),
  }));
}

function openSearch() {
  const scope = searchScope();
  if (searchDialog.open || document.querySelector('.reader-dialog[open], .reader-feedback-dialog[open]') ||
    !scope.available) return;
  const resultList = element('div', { id: 'search-results', className: 'search-results', role: 'listbox', 'aria-label': '搜索结果' });
  const feedback = element('p', { className: 'search-feedback meta', role: 'status' });
  const input = element('input', {
    type: 'search', placeholder: scope.placeholder, 'aria-label': scope.label,
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'search-results', 'aria-expanded': 'true',
  });
  let entries = indexSearch(scope.kind);
  let loading = scope.kind === 'hub' && !state.docHub.data;
  let results = [];
  let active = -1;
  const pageSize = 12;
  let limit = pageSize;
  const more = element('button', { type: 'button', className: 'button search-more', hidden: true, onClick: () => {
    const next = results.length;
    limit += pageSize;
    update();
    input.focus({ preventScroll: true });
    highlight(next);
  } }, '显示更多');

  function highlight(index) {
    active = index;
    [...resultList.children].forEach((option, position) => option.setAttribute('aria-selected', String(position === active)));
    if (active >= 0) {
      const option = resultList.children[active];
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function update() {
    const raw = valueText(input.value).toLocaleLowerCase().normalize('NFC');
    const terms = raw.split(/\s+/).filter(Boolean);
    const matches = entries.filter((entry) => terms.every((term) => entry.searchText.includes(term)));
    if (raw) matches.sort((left, right) => Number(right.title.toLocaleLowerCase().includes(raw)) -
      Number(left.title.toLocaleLowerCase().includes(raw)));
    results = matches.slice(0, limit);
    more.hidden = matches.length <= results.length;
    resultList.replaceChildren(...results.map((entry, index) => element('a', {
      id: 'search-result-' + index, role: 'option', href: entry.href, className: 'search-result',
      ...(entry.external && { target: '_blank', rel: 'noopener noreferrer' }),
      'aria-selected': 'false', tabindex: '-1', onClick: () => searchDialog.close(),
    }, entitySearchIcon(entry.icon),
    element('span', { className: 'search-result-text' }, element('strong', {}, entry.title),
      entry.path && element('small', {}, entry.path)),
    element('span', { className: 'meta' }, entry.category))));
    if (loading) feedback.textContent = '正在读取文档中心…';
    else if (scope.kind === 'hub' && !state.docHub.data) feedback.textContent = '文档中心暂不可用。';
    else if (raw) feedback.textContent = matches.length ? `${matches.length} 条匹配` + (!more.hidden ? `，已显示 ${results.length} 条` : '') : '没有匹配结果。';
    else feedback.textContent = matches.length ? '最近更新' : '暂无可搜索条目。';
    highlight(-1);
  }

  input.addEventListener('input', () => { limit = pageSize; update(); });
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || !results.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlight(active < 0 ? (step === 1 ? 0 : results.length - 1) :
        (active + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      resultList.children[Math.max(0, active)].click();
    }
  });

  searchDialog.replaceChildren(element('div', { className: 'search-dialog-content' },
    element('div', { className: 'search-heading' },
      element('h2', { id: 'search-heading' }, scope.label),
      element('button', { type: 'button', className: 'icon-button', 'aria-label': '关闭搜索', onClick: () => searchDialog.close() }, '×')),
    element('div', { className: 'search-field' }, icon('search'), input),
    feedback,
    resultList,
    more));
  update();
  searchDialog.showModal();
  input.focus();
  if (loading) void loadDocHub().then(() => {
    if (!searchDialog.open || !input.isConnected) return;
    loading = false;
    entries = indexSearch(scope.kind);
    update();
  });
}

function entitySearchIcon(name) {
  return element('span', { className: 'entity-icon' }, icon(name));
}

async function request(path) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('服务返回了无法读取的数据。');
  }
  if (response.status === 401 && data.code === 'author_pairing_required') {
    location.replace('/pair' + location.hash);
  }
  if (!response.ok) throw Object.assign(new Error(data.error || '读取失败（' + response.status + '）'), { status: response.status });
  return data;
}

async function loadPeriod(refresh = false) {
  const period = state.route?.period;
  if (!period || state.route.section !== 'home') return;
  const params = periodQuery(period);
  const key = params.toString();
  const existing = state.periodViews.get(key);
  if (existing?.loading || (existing && !refresh && Date.now() - existing.lastRefreshAttempt < workspaceRefreshInterval)) return;
  const view = { data: existing?.data, loading: true, lastRefreshAttempt: Date.now() };
  state.periodViews.set(key, view);
  if (refresh) params.set('refresh', '1');
  updateRefreshControl();
  try {
    view.data = await request('/api/workbench/period' + (params.size ? '?' + params : ''));
  } catch (err) {
    view.error = err.message;
  } finally {
    view.loading = false;
    if (currentPeriodView() === view) renderWithReadingPosition();
  }
}

function loadDocHub(refresh = false) {
  const hub = state.docHub;
  if (hub.loading) return hub.loading;
  hub.loading = Promise.resolve().then(async () => {
    if (hub.error && !hub.data) {
      hub.error = '';
      if (docHubRouteNeedsIndex(state.route)) renderWithReadingPosition();
    }
    try {
      const data = await request('/api/doc-hub' + (refresh ? '?refresh=1' : ''));
      if (data.source?.status === 'unavailable' && hub.data?.documents?.length) {
        data.documents = hub.data.documents;
        data.source.detail = [data.source.detail, '仍显示上次读取的文档。'].filter(Boolean).join(' ');
      }
      hub.data = data;
      hub.error = '';
    } catch (err) {
      hub.error = (hub.data ? '文档中心刷新失败，仍显示上次读取的文档。' : '') + err.message;
    } finally {
      hub.loading = false;
      if (docHubRouteNeedsIndex(state.route)) renderWithReadingPosition();
    }
  });
  return hub.loading;
}

function renderWithReadingPosition() {
  const routeKey = state.routeKey;
  const pendingReadingLocation = readingLocation?.pending;
  const position = window.scrollY;
  const context = app.querySelector('.reader-context');
  const contextPosition = context?.scrollTop;
  const progressOpen = app.querySelector('.progress-archive')?.open;
  const focused = document.activeElement;
  const focusSelector = ['.workbench-refresh', '.filter-input', '.reader-context-close', '.reader-context-toggle']
    .find(selector => focused?.matches(selector));
  const focusId = app.contains(focused) && focused.id;
  render();
  if (state.routeKey !== routeKey || pendingReadingLocation) return;
  const archive = app.querySelector('.progress-archive');
  if (archive && progressOpen !== undefined) archive.open = progressOpen;
  const newFocus = focusSelector ? app.querySelector(focusSelector) : focusId && document.getElementById(focusId);
  const newContext = app.querySelector('.reader-context');
  queueMicrotask(() => {
    if (newContext?.isConnected && contextPosition) newContext.scrollTo(0, contextPosition);
    if (newFocus?.isConnected) newFocus.focus({ preventScroll: true });
  });
  window.scrollTo(0, position);
}

function updateRefreshControl(control = app.querySelector('.workbench-refresh-control')) {
  if (!control) return;
  const button = control.querySelector('button');
  const status = control.querySelector('.workbench-refresh-status');
  const stage = state.route?.section === 'home';
  const period = currentPeriodView();
  const loading = stage ? Boolean(period?.loading) : state.loading;
  const error = stage ? period?.error : state.refreshError;
  const data = stage ? period?.data : state.data;
  const message = loading ? '正在刷新工作台…' : error || (data ? '工作台已更新' : '');
  status.textContent = message;
  button.setAttribute('aria-disabled', String(loading));
  button.dataset.refreshState = loading ? 'loading' : error ? 'error' : 'ready';
  button.title = loading || error ? message :
    data?.observedAt ? '刷新工作台 · 最近更新 ' + dateText(data.observedAt, true) : '刷新工作台';
}

function refreshPage() {
  if (state.route?.section === 'home') return loadPeriod(true);
  return loadWorkbench({ refresh: true });
}

function createRefreshControl() {
  const control = element('span', { className: 'workbench-refresh-control' },
    element('button', {
      type: 'button', className: 'button workbench-refresh', 'aria-label': '刷新工作台',
      onClick: refreshPage,
    }, icon('refresh')),
    element('span', { className: 'workbench-refresh-status', role: 'status' }));
  updateRefreshControl(control);
  return control;
}

function keepUnavailableSources(data, previous) {
  if (!previous) return;
  const sourceCollections = { vault: ['project', 'projects', 'cases', 'documents'], tasknotes: ['tasks'] };
  for (const [source, keys] of Object.entries(sourceCollections)) {
    const current = data.sources?.[source];
    if (current?.status !== 'unavailable' ||
      !keys.some(key => Array.isArray(previous[key]) ? previous[key].length : previous[key])) continue;
    for (const key of keys) data[key] = previous[key];
    data.sources[source] = {
      ...current,
      at: previous.sources?.[source]?.at,
      detail: [current.detail, '仍显示上次读取的数据。'].filter(Boolean).join(' '),
    };
  }
}

async function loadWorkbench({ refresh = false } = {}) {
  const project = requestedProject();
  if (state.loading && state.workspaceRequest?.project === project) return;
  const requestState = { project };
  state.workspaceRequest = requestState;
  const previousProject = projectPath(state.data?.project);
  const switching = state.data && project !== previousProject;
  state.loading = true;
  state.lastRefreshAttempt = Date.now();
  state.refreshError = '';
  state.error = '';
  if (state.data && !switching) updateRefreshControl();
  else render();
  if (refresh && state.docHub.data) void loadDocHub(true);
  let replaced = false;
  try {
    const params = new URLSearchParams();
    if (refresh) params.set('refresh', '1');
    if (project) params.set('project', project);
    const data = await request('/api/workbench' + (params.size ? '?' + params : ''));
    if (state.workspaceRequest !== requestState) return;
    if (!switching) keepUnavailableSources(data, state.data);
    const current = detailRouteItem(state.route);
    const id = state.route?.id || current?.id || current?.path;
    const detailSection = readerSection(state.route?.section);
    const detailKeys = [...new Set([id, current?.id, current?.path].filter(Boolean))].map(key => detailSection + ':' + key);
    const detail = !switching && detailKeys.map(key => state.details.get(key)).find(Boolean);
    state.data = data;
    state.details.clear();
    if (detail?.loading || detail?.data) {
      const retained = detail.loading ? detail : { data: detail.data, stale: true };
      for (const key of detailKeys) state.details.set(key, retained);
    }
    const selected = projectPath(data.project);
    try {
      if (selected) localStorage.setItem(recentProjectKey, selected);
      else localStorage.removeItem(recentProjectKey);
    } catch { /* 当前页面仍保留项目。 */ }
    const url = new URL(location.href);
    if (selected !== (url.searchParams.get('project') || '')) {
      if (selected) url.searchParams.set('project', selected);
      else url.searchParams.delete('project');
      history.replaceState(history.state, '', url);
    }
    requestState.project = selected;
    replaced = true;
  } catch (err) {
    if (state.workspaceRequest !== requestState) return;
    if (state.data && !switching) state.refreshError = '工作台刷新失败，仍显示上次读取的数据。' + err.message;
    else state.error = err.message;
  } finally {
    if (state.workspaceRequest === requestState) {
      state.loading = false;
      if (replaced || !state.data || switching) renderWithReadingPosition();
      else updateRefreshControl();
    }
  }
}

function refreshWhenVisible() {
  if (window.FlowDeskChoiceMenu.isOpen() || document.querySelector('.reader-feedback-panel:not([hidden]), .reader-feedback-dialog[open], .reader-feedback-editor')) return;
  if (document.visibilityState !== 'visible') return;
  const period = currentPeriodView();
  const stage = state.route?.section === 'home';
  const lastAttempt = stage ? period?.lastRefreshAttempt : state.lastRefreshAttempt;
  if ((stage && !period) || (lastAttempt && Date.now() - lastAttempt >= workspaceRefreshInterval)) void refreshPage();
}

window.addEventListener('hashchange', renderWithReadingPosition);
window.addEventListener('popstate', () => {
  if (requestedProject() !== state.workspaceRequest?.project) void loadWorkbench();
});
window.addEventListener('scroll', updateReaderOutline, { passive: true });
window.addEventListener('focus', refreshWhenVisible);
document.addEventListener('visibilitychange', refreshWhenVisible);
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  document.getElementById('workbench-main')?.focus();
});
document.addEventListener('keydown', (event) => {
  if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || event.key === '/' &&
    !event.target.closest('input, textarea, select, [contenteditable]')) {
    event.preventDefault();
    const docFilter = event.key === '/' &&
      (document.getElementById('period-material-filter') || document.getElementById('doc-hub-filter'));
    if (docFilter) docFilter.focus();
    else openSearch();
  }
});
searchDialog.addEventListener('click', (event) => {
  if (event.target === searchDialog) searchDialog.close();
});
loadWorkbench();
