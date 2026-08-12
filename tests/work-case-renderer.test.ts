import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { WorkCaseDashboardRenderer } from "../src/work-case-renderer";
import { createWorkCaseViewModel } from "../src/work-case-model";

const canonical = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "work-case-canonical.json"),
    "utf8"
  )
);

class FakeElement {
  children: FakeElement[] = [];
  classes = new Set<string>();
  listeners = new Map<string, Array<() => void>>();
  text = "";
  disabled = false;
  value = 0;
  attrs: Record<string, string> = {};

  constructor(
    readonly tag = "div",
    options: { cls?: string; text?: string; attr?: Record<string, string> } = {}
  ) {
    for (const name of options.cls?.split(/\s+/).filter(Boolean) ?? []) {
      this.classes.add(name);
    }
    this.text = options.text ?? "";
    this.attrs = { ...(options.attr ?? {}) };
  }

  addClass(name: string): void {
    this.classes.add(name);
  }

  removeClass(name: string): void {
    this.classes.delete(name);
  }

  createDiv(options: { cls?: string; text?: string } = {}): FakeElement {
    return this.append(new FakeElement("div", options));
  }

  createSpan(options: { cls?: string; text?: string; attr?: Record<string, string> } = {}): FakeElement {
    return this.append(new FakeElement("span", options));
  }

  createEl(
    tag: string,
    options: { cls?: string; text?: string; attr?: Record<string, string> } = {}
  ): FakeElement {
    return this.append(new FakeElement(tag, options));
  }

  addEventListener(name: string, listener: () => void): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  findByClass(name: string): FakeElement[] {
    return [
      ...(this.classes.has(name) ? [this] : []),
      ...this.children.flatMap((child) => child.findByClass(name)),
    ];
  }

  allText(): string[] {
    return [this.text, ...this.children.flatMap((child) => child.allText())].filter(Boolean);
  }

  private append(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
}

test("renderer 用 canonical model 渲染三层驾驶舱并接通只读导航", () => {
  const snapshot = structuredClone(canonical);
  snapshot.tasks.counts = {
    total: 1,
    active: 1,
    blocked: 0,
    completed: 0,
    archived: 0,
    by_status: { open: 1 },
  };
  snapshot.tasks.items = [
    {
      id: "Tasks/Long.md",
      title: "连续英文路径/" + "A".repeat(180),
      status: "open",
      status_is_completed: false,
      archived: false,
      is_blocked: false,
      association_source: "canonical",
    },
  ];
  snapshot.current.next = "很长的中文内容".repeat(60);
  const model = createWorkCaseViewModel(snapshot, snapshot.source.path);
  const openedTasks: string[] = [];
  const openedSources: number[] = [];
  const openedRelated: Array<{ target: string; casePath: string }> = [];
  const renderer = new WorkCaseDashboardRenderer({
    refresh: () => {},
    openTask: (taskPath) => openedTasks.push(taskPath),
    openCaseSource: (_casePath, source) => openedSources.push(source.lineStart),
    openRelated: (target, casePath) => openedRelated.push({ target, casePath }),
  });
  const root = new FakeElement();

  renderer.render(root as unknown as HTMLElement, {
    casePath: snapshot.source.path,
    model,
    loadedAt: "12:00:00",
    staleReason: "",
    error: "",
    loading: false,
  });

  assert.equal(root.classes.has("flowdesk-case-dashboard"), true);
  for (const text of ["WORK CASE", "Current", "关联任务", "最近 Progress", "案卷内容", "关联导航"]) {
    assert.ok(root.allText().includes(text), text);
  }
  root.findByClass("flowdesk-case-task-row")[0].click();
  root.findByClass("flowdesk-case-current-card")[0].click();
  root.findByClass("flowdesk-case-related-link")[0].click();
  assert.deepEqual(openedTasks, ["Tasks/Long.md"]);
  assert.deepEqual(openedSources, [31]);
  assert.deepEqual(openedRelated, [
    {
      target: "[[Notes/Projects/FlowDesk]]",
      casePath: snapshot.source.path,
    },
  ]);
  const date = root.findByClass("flowdesk-case-date")[0];
  assert.equal(date.text, "2026年8月10日 12:00");
  assert.equal(date.attrs.title, "2026-08-10T12:00:00+08:00");

  renderer.reset(root as unknown as HTMLElement);
  assert.equal(root.classes.has("flowdesk-case-dashboard"), false);
});

test("关联任务按父、子固定顺序显示中性圆徽标，旧 snapshot 与空角色不占位", () => {
  const snapshot = structuredClone(canonical);
  snapshot.tasks.counts = {
    total: 4,
    active: 4,
    blocked: 0,
    completed: 0,
    archived: 0,
    by_status: { open: 4 },
  };
  snapshot.tasks.items = [
    { id: "Tasks/Parent.md", title: "Parent", status: "open", status_is_completed: false, archived: false, is_blocked: false, association_source: "canonical", relation_roles: ["parent"] },
    { id: "Tasks/Child.md", title: "Child", status: "open", status_is_completed: false, archived: false, is_blocked: false, association_source: "canonical", relation_roles: ["child"] },
    { id: "Tasks/Both.md", title: "Both", status: "open", status_is_completed: false, archived: false, is_blocked: false, association_source: "canonical", relation_roles: ["child", "parent"] },
    { id: "Tasks/Legacy.md", title: "Legacy", status: "open", status_is_completed: false, archived: false, is_blocked: false, association_source: "canonical" },
  ];
  const openedTasks: string[] = [];
  const root = new FakeElement();
  new WorkCaseDashboardRenderer({
    refresh: () => {},
    openTask: (taskPath) => openedTasks.push(taskPath),
    openCaseSource: () => {},
    openRelated: () => {},
  }).render(root as unknown as HTMLElement, {
    casePath: snapshot.source.path,
    model: createWorkCaseViewModel(snapshot, snapshot.source.path),
    loadedAt: "12:00:00",
    staleReason: "",
    error: "",
    loading: false,
  });

  const rows = root.findByClass("flowdesk-case-task-row");
  assert.deepEqual(
    rows.map((row) =>
      row.findByClass("flowdesk-case-task-role").map((badge) => [
        badge.text,
        badge.attrs["aria-label"],
      ])
    ),
    [
      [["父", "父任务"]],
      [["子", "子任务"]],
      [["父", "父任务"], ["子", "子任务"]],
      [],
    ]
  );
  assert.equal(rows[3].findByClass("flowdesk-case-task-roles").length, 0);
  assert.deepEqual(
    rows.map((row) => row.findByClass("flowdesk-case-task-title-text")[0].text),
    ["Parent", "Child", "Both", "Legacy"]
  );
  assert.deepEqual(
    rows.map((row) => row.findByClass("flowdesk-case-task-status")[0].text),
    ["open", "open", "open", "open"]
  );
  assert.deepEqual(
    rows.map((row) => row.attrs["aria-label"]),
    [
      "打开任务：Parent；关系：父任务",
      "打开任务：Child；关系：子任务",
      "打开任务：Both；关系：父任务、子任务",
      "打开任务：Legacy",
    ]
  );

  for (const row of rows) row.click();
  assert.deepEqual(openedTasks, [
    "Tasks/Parent.md",
    "Tasks/Child.md",
    "Tasks/Both.md",
    "Tasks/Legacy.md",
  ]);
});

test("任务观察 unavailable 时正文仍渲染，任务区不伪装成零任务", () => {
  const snapshot = structuredClone(canonical);
  snapshot.tasks.observation_health = "unavailable";
  snapshot.tasks.coverage.complete = false;
  snapshot.tasks.counts = {
    total: null,
    active: null,
    blocked: null,
    completed: null,
    archived: null,
    by_status: {},
  };
  const root = new FakeElement();
  new WorkCaseDashboardRenderer({
    refresh: () => {},
    openTask: () => {},
    openCaseSource: () => {},
    openRelated: () => {},
  }).render(root as unknown as HTMLElement, {
    casePath: snapshot.source.path,
    model: createWorkCaseViewModel(snapshot, snapshot.source.path),
    loadedAt: "12:00:00",
    staleReason: "",
    error: "",
    loading: false,
  });

  assert.ok(root.allText().includes("Demo Case"));
  assert.ok(root.allText().includes("任务数据暂不可用，Case 主体仍可阅读。"));
  assert.equal(root.allText().includes("没有关联任务。"), false);
});

test("关联导航完整保留中英文及无空格长链接并逐项保持可点击", () => {
  const snapshot = structuredClone(canonical);
  const targets = [
    "[[Notes/项目/超长中文关联计划显示增强实施方案]]",
    "[[Notes/Plans/Long English Work Case Navigation Plan]]",
    `[[Notes/Plans/${"UnbrokenPath".repeat(20)}]]`,
  ];
  snapshot.related = {
    project: targets[0],
    plans: [targets[1]],
    docs: [targets[2]],
    sessions: [],
    related: [],
  };
  const openedRelated: Array<{ target: string; casePath: string }> = [];
  const root = new FakeElement();
  new WorkCaseDashboardRenderer({
    refresh: () => {},
    openTask: () => {},
    openCaseSource: () => {},
    openRelated: (target, casePath) => openedRelated.push({ target, casePath }),
  }).render(root as unknown as HTMLElement, {
    casePath: snapshot.source.path,
    model: createWorkCaseViewModel(snapshot, snapshot.source.path),
    loadedAt: "12:00:00",
    staleReason: "",
    error: "",
    loading: false,
  });

  const relatedSection = root.findByClass("flowdesk-case-related")[0];
  const links = relatedSection.findByClass("flowdesk-case-related-link");
  assert.deepEqual(links.map((link) => link.text), targets);
  for (const link of links) link.click();
  assert.deepEqual(
    openedRelated,
    targets.map((target) => ({ target, casePath: snapshot.source.path }))
  );
});
