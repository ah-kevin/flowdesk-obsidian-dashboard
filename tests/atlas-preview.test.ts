import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { TestElement } from './support/dom.ts';
import { compilePlugin, ownedEnvironment } from './support/owned-environment.ts';

test('compiled Atlas previews release their pages, pending opens, and Markdown listeners', async t => {
  const fixture = await ownedEnvironment(t);
  const vaultRoot = fixture.env.OBSIDIAN_VAULT!;
  const sourcePath = 'Notes/Plans/饲喂设计.md';
  const relativeLink = '../../Attachments/archify/饲喂/pages/overview.html';
  const atlas = { path: 'Attachments/archify/饲喂/pages/overview.html', basename: 'overview', extension: 'html' };
  const linkedOutside = { path: 'Attachments/archify/饲喂/pages/linked.html', basename: 'linked', extension: 'html' };
  const outside = { path: 'Notes/Docs/other.html', basename: 'other', extension: 'html' };

  for (const file of [atlas, outside]) {
    const path = join(vaultRoot, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '<!doctype html><p>local preview</p>');
  }
  symlinkSync(join(vaultRoot, outside.path), join(vaultRoot, linkedOutside.path));

  const bundle = fixture.path('plugin.cjs');
  compilePlugin(bundle);
  const Plugin = createRequire(import.meta.url)(bundle).default;
  const plugin = new Plugin();
  const modalRoot = new TestElement();
  let opened: any;
  let opens = 0;
  let modalReady: (modal: unknown) => void;
  const nextModal = new Promise(resolve => { modalReady = resolve; });
  plugin.app = {
    get activeModal() { return opened; },
    set activeModal(modal: unknown) { opened = modal; if (modal) { opens++; modalReady(modal); } },
    vault: {
      adapter: { getBasePath: () => vaultRoot },
      getAbstractFileByPath: (path: string) => path === atlas.path ? atlas : null,
      on() {},
    },
    metadataCache: {
      on() {},
      getFirstLinkpathDest(value: string, source: string) {
        assert.equal(source, sourcePath);
        if (value === relativeLink) return atlas;
        if (value === linkedOutside.path) return linkedOutside;
        return value === outside.path ? outside : null;
      },
    },
    workspace: {
      on() {},
      onLayoutReady() {},
      detachLeavesOfType() {},
      getLeavesOfType: () => [{ view: { contentEl: modalRoot } }],
    },
  };
  await plugin.onload();
  assert.equal(plugin.markdownPostProcessors.length, 1);

  let href = relativeLink;
  const anchor = { getAttribute: (name: string) => name === 'data-href' ? href : null };
  let listener: ((event: object) => void) | undefined;
  const element = {
    querySelector: () => anchor,
    contains: (node: unknown) => node === anchor,
    addEventListener(name: string, callback: typeof listener, options: { capture: boolean }) {
      assert.equal(name, 'click');
      assert.equal(options.capture, true);
      listener = callback;
    },
    removeEventListener(_name: string, callback: typeof listener) {
      assert.equal(callback, listener);
      listener = undefined;
    },
  };
  let scope: any;
  const mountMarkdown = () => plugin.markdownPostProcessors[0](element, {
    sourcePath,
    addChild(child: typeof scope) { scope = child; scope.load(); },
  });
  mountMarkdown();
  assert.ok(scope && listener);

  function click(link: string, extras: Record<string, unknown> = {}) {
    href = link;
    const outcome = { prevented: false, stopped: false };
    listener!({
      target: { closest: () => anchor },
      button: 0,
      preventDefault() { outcome.prevented = true; },
      stopPropagation() { outcome.stopped = true; },
      ...extras,
    });
    return outcome;
  }

  assert.deepEqual(click(relativeLink, { metaKey: true }), { prevented: false, stopped: false });
  assert.deepEqual(click(relativeLink, { button: 1 }), { prevented: false, stopped: false });
  assert.deepEqual(click('https://example.invalid/overview.html'), { prevented: false, stopped: false });
  assert.deepEqual(click(outside.path), { prevented: false, stopped: false });
  assert.deepEqual(click('missing.html'), { prevented: false, stopped: false });

  const notifications = globalThis as typeof globalThis & { __flowdeskTestNotice?: (message: string) => void };
  let receiveNotice: (message: string) => void;
  const notice = new Promise<string>(resolve => { receiveNotice = resolve; });
  notifications.__flowdeskTestNotice = message => receiveNotice(message);
  t.after(() => { delete notifications.__flowdeskTestNotice; });
  assert.deepEqual(click(linkedOutside.path), { prevented: true, stopped: true });
  assert.equal(await notice, '图集预览需要库内的图集文件');
  assert.equal(opened, undefined);

  assert.deepEqual(click(relativeLink + '#details'), { prevented: true, stopped: true });
  await nextModal;
  assert.equal(opened.titleEl.text, 'overview');
  assert.ok(opened.modalEl.classList.contains('fd-atlas-preview-modal'));
  const frames = opened.contentEl.querySelectorAll('iframe');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].getAttribute('src'), null);
  assert.match(frames[0].srcdoc, /^<!doctype html><meta http-equiv="Content-Security-Policy"/);
  assert.match(frames[0].srcdoc, /const fragment = "details"/);
  assert.match(frames[0].srcdoc, /<p>local preview<\/p>/);
  assert.equal(frames[0].getAttribute('sandbox'), 'allow-scripts');
  assert.equal(frames[0].getAttribute('referrerpolicy'), 'no-referrer');
  const externalUrls: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { require(name: string) {
      assert.equal(name, 'electron');
      return { shell: { async openExternal(url: string) { externalUrls.push(url); } } };
    } },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'window'));
  const buttons: TestElement[] = opened.modalEl.querySelectorAll('button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].text, '用默认浏览器打开');
  assert.deepEqual(externalUrls, []);
  await buttons[0].click();
  assert.equal(externalUrls.length, 1);
  const browserUrl = new URL(externalUrls[0]);
  assert.equal(fileURLToPath(browserUrl), realpathSync(join(vaultRoot, atlas.path)));
  assert.equal(browserUrl.hash, '#details');
  const modal = opened;
  const preview = plugin.atlasPreview;
  assert.equal(modal.html, '');
  modal.close();
  assert.equal(modal.contentEl.children.length, 0);
  assert.equal(opened, null);
  assert.equal(preview.modal, null);
  scope.unload();
  assert.equal(listener, undefined);
  assert.equal(preview.markdownChildren.size, 0);

  let sourceOpen = true;
  const abandoned = preview.open(atlas.path, () => sourceOpen);
  sourceOpen = false;
  await abandoned;
  assert.equal(opens, 1);

  const open = () => preview.open(atlas.path, () => true);
  await Promise.all([open(), open()]);
  assert.equal(opens, 2);
  const replaced = opened;
  await open();
  assert.equal(opens, 3);
  assert.equal(replaced.contentEl.children.length, 0);

  mountMarkdown();
  const active = opened;
  const pending = open();
  await plugin.onunload();
  await pending;
  assert.equal(opens, 3);
  assert.equal(active.contentEl.children.length, 0);
  assert.equal(active.titleEl.querySelectorAll('button').length, 0);
  assert.equal(opened, null);
  assert.equal(listener, undefined);
  assert.equal(preview.loading, null);
  assert.equal(preview.modal, null);
  assert.equal(preview.markdownChildren.size, 0);
});

test('collection previews prefer readable local pages and can open packaged pages without a matching digest', async t => {
  const fixture = await ownedEnvironment(t);
  const vaultRoot = fixture.env.OBSIDIAN_VAULT!;
  const index = { path: 'Attachments/archify/饲喂/index.html', basename: 'index', extension: 'html' };
  const indexPath = join(vaultRoot, index.path);
  const pagesPath = join(dirname(indexPath), 'pages');
  const temporaryPage = join(pagesPath, 'temporary.html');
  const outsidePage = join(vaultRoot, 'private.html');
  mkdirSync(pagesPath, { recursive: true });
  writeFileSync(join(pagesPath, 'local.html'), '<!doctype html><p>current local reader</p>');
  writeFileSync(temporaryPage, '<!doctype html><p>temporary reader</p>');
  writeFileSync(outsidePage, '<!doctype html><p>unrelated local file</p>');
  symlinkSync(outsidePage, join(pagesPath, 'outside.html'));

  const collection = {
    schema: 'flowdesk.visual-doc-collection/2',
    title: '饲喂图集',
    groups: [{ id: 'content', label: '内容' }],
    pages: [
      { id: 'outside', title: '库内其他文件', views: { content: { url: 'pages/outside.html' } } },
      { id: 'missing', title: '缺失', views: { content: { url: 'pages/missing.html', readerId: 'missing' } } },
      { id: 'local', title: '本地', views: { content: { url: 'pages/local.html', readerId: 'local' } } },
      { id: 'packed', title: '内嵌', views: { content: { url: 'pages/packed.html', readerId: 'packed' } } },
      { id: 'temporary', title: '临时', views: { content: { url: 'pages/temporary.html', readerId: 'temporary' } } },
    ],
  };
  const readers = {
    local: { htmlGzip: gzipSync('<p>stale packaged reader</p>').toString('base64'), sha256: '0'.repeat(64), bytes: 0 },
    packed: { htmlGzip: gzipSync('<p>available packaged reader</p>').toString('base64'), sha256: '0'.repeat(64), bytes: 0 },
  };
  writeFileSync(indexPath, `<!doctype html><p>collection shell</p>
    <script type="application/json" id="collection-data">${JSON.stringify(collection)}</script>
    <script type="application/json" id="collection-readers">${JSON.stringify(readers)}</script>`);

  const bundle = fixture.path('plugin.cjs');
  compilePlugin(bundle);
  const Plugin = createRequire(import.meta.url)(bundle).default;
  const plugin = new Plugin();
  type PreviewModal = { modalEl: TestElement; contentEl: TestElement };
  let opened: PreviewModal | null = null;
  plugin.app = {
    get activeModal() { return opened; },
    set activeModal(modal: PreviewModal | null) { opened = modal; },
    vault: {
      adapter: { getBasePath: () => vaultRoot },
      getAbstractFileByPath: (path: string) => path === index.path ? index : null,
      on() {},
    },
    metadataCache: { on() {}, getFirstLinkpathDest: (path: string) => path === index.path ? index : null },
    workspace: {
      on() {},
      onLayoutReady() {},
      detachLeavesOfType() {},
      getLeavesOfType: () => [{ view: { contentEl: new TestElement() } }],
    },
  };
  await plugin.onload();
  t.after(() => plugin.onunload());

  const activeModal = () => opened;
  const frameSource = () => {
    const frame = activeModal()?.contentEl.querySelectorAll('iframe')[0] as (TestElement & { srcdoc?: string }) | undefined;
    assert.equal(frame?.getAttribute('sandbox'), 'allow-scripts');
    return frame?.srcdoc ?? '';
  };
  const settle = async (predicate: () => boolean, message: string) => {
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await delay(10);
    assert.ok(predicate(), message);
  };

  await plugin.atlasPreview.open(index.path, () => true);
  assert.match(frameSource(), /current local reader/);
  assert.doesNotMatch(frameSource(), /collection shell|stale packaged reader/);

  type SelectElement = TestElement & { value: string };
  const select = activeModal()?.modalEl.querySelectorAll('select')[0] as SelectElement | undefined;
  assert.ok(select);
  const changeTo = (label: string) => {
    const options = select.querySelectorAll('option');
    const option = options.find(item => item.text.includes(label)) as SelectElement | undefined;
    assert.ok(option);
    select.value = option.getAttribute('value') ?? option.value;
    const change = new Event('change');
    select.dispatchEvent(change);
    return select.value;
  };
  const packedValue = changeTo('内嵌');
  await settle(() => frameSource().includes('available packaged reader'), 'packaged page should open despite its mismatched digest and size');

  unlinkSync(temporaryPage);
  changeTo('临时');
  await settle(() => select.value === packedValue, 'an unavailable page should leave the previous selection active');
  assert.match(frameSource(), /available packaged reader/);

  const anchor = { getAttribute: () => `${index.path}#packed/content` };
  let onClick: ((event: object) => void) | undefined;
  plugin.markdownPostProcessors[0]({
    querySelector: () => anchor,
    contains: () => true,
    addEventListener(_type: string, listener: typeof onClick) { onClick = listener; },
    removeEventListener() { onClick = undefined; },
  }, { sourcePath: 'Notes/Plans/饲喂设计.md', addChild() {} });
  const previousModal = activeModal();
  onClick?.({ target: { closest: () => anchor }, button: 0, preventDefault() {}, stopPropagation() {} });
  await settle(() => activeModal() !== previousModal && frameSource().includes('available packaged reader'), 'the Markdown link should open the requested collection view');
});
