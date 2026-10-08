import assert from "node:assert/strict";
import test from "node:test";

import { createRequire } from "node:module";
import { TestElement } from "./support/dom";
import { ownedEnvironment, compilePlugin, CORE_ROOT } from "./support/owned-environment";
import { buildSnapshotInvocation } from "../src/snapshot-invocation";

async function setup(t: any) {
  const fixture = await ownedEnvironment(t), bundle = fixture.path("plugin.cjs");
  const tasks = [
    { id: "Tasks/Current.md", title: "Current", projects: ["Parent"] },
    { id: "Tasks/Parent.md", title: "Parent", projects: [] },
    { id: "Tasks/Child.md", title: "Child", projects: ["Current"] },
  ].map(task => ({ ...task, path: task.id, status: "open", details: "## 目标\n导航任务" }));
  const { url } = await fixture.server((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/filter-options") { res.end(JSON.stringify({ data: { statuses: [{ value: "open", isCompleted: false }] } })); return; }
    if (req.url === "/api/tasks/query") { res.end(JSON.stringify({ tasks, filtered: tasks.length })); return; }
    const id = decodeURIComponent(req.url!.slice("/api/tasks/".length));
    res.end(JSON.stringify({ success: true, data: tasks.find(task => task.id === id) }));
  });
  compilePlugin(bundle);
  const Plugin = createRequire(import.meta.url)(bundle).default;
  const plugin = new Plugin(), root = new TestElement();
  const opens: Array<{ path: string; leaf: false | "tab" }> = [];
  let view: any;
  plugin.app = {
    vault: { on() {}, adapter: { getBasePath: () => fixture.env.OBSIDIAN_VAULT }, getAbstractFileByPath: (path: string) => ({ path, extension: "md" }) },
    metadataCache: { on() {}, getFileCache() { return {}; } },
    workspace: { on() {}, onLayoutReady() {}, getLeavesOfType: () => view ? [{ view }] : [], getActiveFile: () => null,
      getLeaf: (leaf: false | "tab") => ({ async openFile(file: any) { opens.push({ path: file.path, leaf }); } }) },
  };
  await plugin.onload();
  plugin.settings = { flowdeskRoot: CORE_ROOT, workingDirectory: fixture.root, apiUrl: url, tasknotesEnv: "{}" };
  const invocation = buildSnapshotInvocation({ flowdeskRoot: CORE_ROOT, taskPath: "Tasks/Current.md", workingDirectory: fixture.root, apiUrl: url }, "json");
  fixture.allowParentProducer([invocation.executable, ...invocation.args], invocation.cwd);
  view = plugin.views.get("flowdesk-dashboard-view")({ app: plugin.app, contentEl: root });
  t.after(() => view.onClose());
  await view.loadTask("Tasks/Current.md");
  assert.ok(view.taskAdapter.getRenderState().snapshot, view.taskAdapter.getRenderState().error);
  return { plugin, view, root, opens };
}

async function activate(element: TestElement, modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {}, key?: string) {
  const event = { target: element, ...modifiers, key, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };
  for (const handler of element.listeners.get(key ? "keydown" : "click") ?? []) await handler(event);
}

// Choosing a leaf by entry origin, or dropping activation modifiers, breaks these host calls.
test("compiled current, parent and child handlers choose current leaf or tab from actual activation modifiers", async t => {
  const { root, opens } = await setup(t);
  for (const [className, taskPath] of [["flowdesk-current-task-link", "Tasks/Current.md"], ["flowdesk-parent-link", "Tasks/Parent.md"], ["flowdesk-child-row", "Tasks/Child.md"]]) {
    const element = root.findByClass(className)[0];
    for (const [modifiers, leaf] of [[{}, false], [{ metaKey: true }, "tab"], [{ ctrlKey: true }, "tab"]] as const) {
      await activate(element, modifiers);
      assert.deepEqual(opens.pop(), { path: taskPath, leaf }, `${className} click`);
      for (const key of ["Enter", " "]) {
        await activate(element, modifiers, key);
        assert.deepEqual(opens.pop(), { path: taskPath, leaf }, `${className} ${key}`);
      }
    }
  }
});

test("compiled original-file action menu preserves the click modifiers after closing its modal", async t => {
  const { root, plugin, opens } = await setup(t);
  for (const [modifiers, leaf] of [[{}, false], [{ metaKey: true }, "tab"], [{ ctrlKey: true }, "tab"]] as const) {
    await root.findByClass("flowdesk-more-actions")[0].click();
    const action = plugin.app.activeModal.contentEl.querySelectorAll("button").find((element: TestElement) => element.text === "查看原文件");
    assert.ok(action);
    await activate(action, modifiers);
    assert.equal(plugin.app.activeModal, null);
    assert.deepEqual(opens.pop(), { path: "Tasks/Current.md", leaf });
  }
});
