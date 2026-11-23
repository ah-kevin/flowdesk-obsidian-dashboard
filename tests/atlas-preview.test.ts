import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
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
