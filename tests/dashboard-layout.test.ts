import assert from "node:assert/strict";
import test from "node:test";
import { applyDashboardLayout } from "../src/dashboard-layout";
import { TestElement } from "./support/dom";

class LayoutElement extends TestElement {
  clientWidth = 420;
  scrollTop = 0;
  scrollLeft = 0;
  classList = { contains: (name: string) => this.classes.has(name) };
  createEl(tag: string, options: any = {}): LayoutElement {
    return this.appendChild(new LayoutElement(tag, options)) as LayoutElement;
  }
  appendChild(element: TestElement): TestElement {
    if (element.parentElement && element.ownerDocument?.activeElement && element.contains(element.ownerDocument.activeElement)) element.ownerDocument.activeElement = null;
    element.remove();
    return super.appendChild(element);
  }
  focus(): void { this.ownerDocument.activeElement = this; }
  empty(): void { for (const child of this.children) child.parentElement = null; super.empty(); }
}

function fixture(classes: string[], width = 1040) {
  let resize: ((entries: Array<{ contentRect: { width: number } }>) => void) | undefined;
  let disconnects = 0;
  const root = new LayoutElement();
  root.clientWidth = width;
  root.ownerDocument = {
    activeElement: null,
    defaultView: {
      getComputedStyle: () => ({ paddingLeft: "0px", paddingRight: "0px" }),
      ResizeObserver: class {
        constructor(callback: typeof resize) { resize = callback; }
        observe() {}
        disconnect() { disconnects++; }
      },
    },
  };
  const nodes = classes.map(cls => root.createDiv({ cls }) as LayoutElement);
  return { root, nodes, resize: (width: number) => resize?.([{ contentRect: { width } }]), disconnected: () => disconnects };
}

const taskClasses = ["flowdesk-task-header", "flowdesk-trust-summary", "flowdesk-task-overview", "flowdesk-reading-navigation", "flowdesk-child-section", "flowdesk-contract-summary", "flowdesk-task-process", "flowdesk-task-technical"];

test("wide Task retains header/source above stable columns and restores the original nodes in narrow order", () => {
  const { root, nodes, resize } = fixture(taskClasses);
  applyDashboardLayout(root as unknown as HTMLElement, "task");
  const layout = root.findByClass("flowdesk-dashboard-layout")[0];
  assert.ok(layout, "the rendered content needs an internal layout layer");
  const main = root.findByClass("flowdesk-dashboard-main")[0];
  const aside = root.findByClass("flowdesk-dashboard-aside")[0];
  assert.deepEqual(main.children, [nodes[2], nodes[3], nodes[5], nodes[6]]);
  assert.deepEqual(aside.children, [nodes[4], nodes[7]]);
  assert.deepEqual(layout.children.slice(0, 2), nodes.slice(0, 2));
  resize(959);
  assert.deepEqual(layout.children, nodes, "narrow mode restores the source sequence without cloning");
  assert.equal(root.findByClass("flowdesk-dashboard-columns").length, 0);
  resize(960);
  assert.deepEqual(root.findByClass("flowdesk-dashboard-main")[0].children, [nodes[2], nodes[3], nodes[5], nodes[6]]);
});

test("Task without children keeps technical details in the full single reading column", () => {
  const { root, nodes } = fixture(taskClasses.filter(cls => cls !== "flowdesk-child-section"));
  applyDashboardLayout(root as unknown as HTMLElement, "task");
  assert.equal(root.findByClass("flowdesk-dashboard-aside").length, 0);
  assert.equal(root.findByClass("flowdesk-dashboard-columns").length, 0);
  assert.ok(root.findByClass("flowdesk-dashboard-layout")[0]);
  assert.deepEqual(root.findByClass("flowdesk-dashboard-layout")[0].children, nodes);
});

test("Case separates primary reading from references and technical context without moving warnings into a column", () => {
  const { root, nodes, resize } = fixture(["flowdesk-case-header", "flowdesk-case-observation", "flowdesk-case-stale-warning", "flowdesk-case-current", "flowdesk-case-tasks", "flowdesk-case-related", "flowdesk-case-recent-progress", "flowdesk-case-record", "flowdesk-case-recovery", "flowdesk-case-diagnostics"]);
  applyDashboardLayout(root as unknown as HTMLElement, "case");
  assert.ok(root.findByClass("flowdesk-dashboard-main")[0], "Case primary reading is grouped separately");
  assert.deepEqual(root.findByClass("flowdesk-dashboard-main")[0].children, [nodes[3], nodes[6], nodes[7]]);
  assert.deepEqual(root.findByClass("flowdesk-dashboard-aside")[0].children, [nodes[4], nodes[5], nodes[8], nodes[9]]);
  assert.deepEqual(root.findByClass("flowdesk-dashboard-layout")[0].children.slice(0, 3), nodes.slice(0, 3));
  resize(420);
  assert.deepEqual(root.findByClass("flowdesk-dashboard-layout")[0].children, nodes);
});

test("breakpoint moves preserve the focused element, scroll position and its existing click listener", async () => {
  const { root, nodes, resize } = fixture(taskClasses, 420);
  const focused = nodes[4].createEl("button") as LayoutElement;
  let clicked = 0;
  focused.addEventListener("click", () => { clicked++; });
  focused.focus();
  root.scrollTop = 312;
  root.scrollLeft = 7;
  applyDashboardLayout(root as unknown as HTMLElement, "task");
  resize(1040);
  assert.ok(nodes[4].parentElement?.classes.has("flowdesk-dashboard-aside"), "crossing the breakpoint moves the actual focused section");
  assert.equal(root.ownerDocument.activeElement, focused);
  assert.equal(root.scrollTop, 312);
  assert.equal(root.scrollLeft, 7);
  await focused.click();
  assert.equal(clicked, 1);
  resize(420);
  assert.equal(root.ownerDocument.activeElement, focused);
  assert.equal(root.scrollTop, 312);
});

test("reapplying and cleanup disconnect prior observers and cannot reattach cleared content", () => {
  const { root, nodes, resize, disconnected } = fixture(taskClasses);
  const first = applyDashboardLayout(root as unknown as HTMLElement, "task");
  const second = applyDashboardLayout(root as unknown as HTMLElement, "task");
  assert.equal(disconnected(), 1);
  assert.equal(root.findByClass("flowdesk-dashboard-layout").length, 1);
  assert.equal(root.findByClass("flowdesk-dashboard-aside")[0].children[0], nodes[4]);
  first();
  assert.equal(disconnected(), 1, "superseded cleanup is idempotent");
  second();
  second();
  assert.equal(disconnected(), 2);
  root.empty();
  resize(420);
  assert.deepEqual(root.children, []);
});

test("cleanup followed by reapplication of the same rendered content preserves the original source sequence", () => {
  const { root, nodes, resize } = fixture(taskClasses);
  const cleanup = applyDashboardLayout(root as unknown as HTMLElement, "task");
  cleanup();
  applyDashboardLayout(root as unknown as HTMLElement, "task");
  assert.equal(root.findByClass("flowdesk-dashboard-layout").length, 1);
  resize(420);
  assert.deepEqual(root.findByClass("flowdesk-dashboard-layout")[0].children, nodes);
});
