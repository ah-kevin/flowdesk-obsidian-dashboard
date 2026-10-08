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
  open = false;
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

  setText(text: string): void { this.text = text; }
  empty(): void { this.children=[];this.text=""; }

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
  const openedTasks: Array<{ taskPath: string; origin: string }> = [];
  const openedSources: number[] = [];
  const openedRelated: Array<{ target: string; casePath: string }> = [];
  const renderer = new WorkCaseDashboardRenderer({
    refresh: () => {},
    openTask: (taskPath, origin) => openedTasks.push({ taskPath, origin }),
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
  for (const text of ["工作案卷", "当前进展", "关联任务", "最近进展", "案卷内容", "精选入口"]) {
    assert.ok(root.allText().includes(text), text);
  }
  root.findByClass("flowdesk-case-task-row")[0].click();
  assert.equal(root.findByClass("flowdesk-case-source-action").length,0);
  root.findByClass("flowdesk-case-related-link")[0].click();
  assert.deepEqual(openedTasks, [
    { taskPath: "Tasks/Long.md", origin: "work-case" },
  ]);
  assert.deepEqual(openedSources, []);
  assert.deepEqual(openedRelated, [
    {
      target: "[[Notes/Projects/FlowDesk]]",
      casePath: snapshot.source.path,
    },
  ]);
  const date = root.findByClass("flowdesk-case-date")[0];
  assert.equal(date.text, "2026/08/10 12:00");
  assert.equal(date.attrs.title, "2026-08-10T12:00:00+08:00");

  renderer.reset(root as unknown as HTMLElement);
  assert.equal(root.classes.has("flowdesk-case-dashboard"), false);
});

test("关联任务按父、子固定顺序显示克制彩色圆徽标，旧 snapshot 与空角色不占位", () => {
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
    ["待开始", "待开始", "待开始", "待开始"]
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

test("最近 Progress 使用新到旧时间线并只标记第一条为最新", () => {
  const snapshot = structuredClone(canonical);
  const openedSources: number[] = [];
  const root = new FakeElement();
  new WorkCaseDashboardRenderer({
    refresh: () => {},
    openTask: () => {},
    openCaseSource: (_casePath, source) => openedSources.push(source.lineStart),
    openRelated: () => {},
  }).render(root as unknown as HTMLElement, {
    casePath: snapshot.source.path,
    model: createWorkCaseViewModel(snapshot, snapshot.source.path),
    loadedAt: "12:00:00",
    staleReason: "",
    error: "",
    loading: false,
  });

  const rows = root.findByClass("flowdesk-case-progress-item");
  assert.deepEqual(
    rows.map((row) => row.findByClass("flowdesk-case-progress-time")[0].text),
    ["2026-08-10 13:00", "2026-08-10 12:00", "2026-08-10 11:00"]
  );
  assert.deepEqual(
    rows.map((row) => row.findByClass("flowdesk-case-progress-text")[0].text),
    ["第四条", "第三条", "第二条"]
  );
  assert.equal(rows[0].classes.has("is-latest"), true);
  assert.equal(rows[1].classes.has("is-latest"), false);
  assert.equal(rows[2].classes.has("is-latest"), false);
  assert.deepEqual(
    rows.map((row) => row.findByClass("flowdesk-case-progress-latest").map((item) => item.text)),
    [["最新"], [], []]
  );

  assert.ok(rows.every(row=>row.findByClass("flowdesk-case-source-action").length===0));
  assert.deepEqual(openedSources, []);
});

test("案卷内容优先展开 Goal Blockers Outcome 并隐藏空分组", () => {
  const snapshot = structuredClone(canonical);
  snapshot.sections = {
    goal: [{ heading: "Goal", level: 2, text: "目标", source: { line_start: 10, line_end: 11 } }],
    decisions: [{ heading: "Decisions", level: 3, text: "决策", source: { line_start: 20, line_end: 21 } }],
    discoveries: [],
    blockers: [{ heading: "Blockers", level: 3, text: "阻塞", source: { line_start: 30, line_end: 31 } }],
    outcome: [{ heading: "Outcome", level: 3, text: "结果", source: { line_start: 40, line_end: 41 } }],
    candidate_patterns: [{ heading: "Candidate Patterns", level: 2, text: "模式", source: { line_start: 50, line_end: 51 } }],
    definition_of_done: [],
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

  const groups = root.findByClass("flowdesk-case-record-group");
  assert.deepEqual(
    groups.map((group) => group.children[0].text),
    ["目标 · 1", "风险与阻塞记录 · 1", "结果 · 1", "关键决定 · 1", "经验候选 · 1"]
  );
  assert.deepEqual(groups.map((group) => group.open), [false, false, false, false, false]);
  assert.ok(groups.slice(0,3).every(group=>group.classes.has("is-primary")));
  assert.ok(groups[0].classes.has("is-goal"));
  assert.ok(groups[1].classes.has("is-blockers"));
  assert.ok(groups[2].classes.has("is-outcome"));
  assert.equal(root.allText().includes("Discoveries · 0"), false);
  assert.equal(root.allText().includes("Definition of Done · 0"), false);
  assert.ok(root.allText().includes("更多案卷内容 · 1"));
});

test("案卷内容全空时只显示一个空状态", () => {
  const snapshot = structuredClone(canonical);
  for (const key of Object.keys(snapshot.sections)) snapshot.sections[key] = [];
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

  assert.equal(root.findByClass("flowdesk-case-record-group").length, 0);
  assert.deepEqual(
    root.findByClass("flowdesk-case-record")[0].findByClass("flowdesk-case-empty").map((item) => item.text),
    ["暂无案卷内容。"]
  );
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
  assert.deepEqual(links.map((link) => link.findByClass("flowdesk-reference-title")[0].text), ["超长中文关联计划显示增强实施方案", "Long English Work Case Navigation Plan", "UnbrokenPath".repeat(20)]);
  for (const link of links) link.click();
  assert.deepEqual(
    openedRelated,
    targets.map((target) => ({ target, casePath: snapshot.source.path }))
  );
});


test("Case hierarchy puts read health and current ahead of relations and technical fields",()=>{
 const snapshot=structuredClone(canonical);snapshot.work_case.status="completed";
 snapshot.work_case.project="[[Notes/Projects/FlowDesk|工作站]]";
 snapshot.tasks.items=[
  {id:"Tasks/Done.md",title:"Done",status:"done",status_is_completed:true,archived:false,is_blocked:false,association_source:"canonical"},
  {id:"Tasks/Custom.md",title:"Custom",status:"awaiting-human",status_is_completed:null,archived:false,is_blocked:false,association_source:"canonical"},
  {id:"Tasks/Active.md",title:"Active",status:"in-progress",status_is_completed:false,archived:false,is_blocked:false,association_source:"canonical"},
 ];
 snapshot.tasks.counts.active=1;
 const root=new FakeElement();
 new WorkCaseDashboardRenderer({refresh(){},openTask(){},openCaseSource(){},openRelated(){}}).render(root as unknown as HTMLElement,{
  casePath:snapshot.source.path,model:createWorkCaseViewModel(snapshot,snapshot.source.path),loadedAt:"12:34:56",staleReason:"",error:"",loading:false,
 });
 const classes=root.children.map(x=>[...x.classes].join(" ")).join("|");
 assert.match(classes,/flowdesk-case-header.*flowdesk-case-observation.*flowdesk-case-current.*flowdesk-case-tasks.*flowdesk-case-recovery/);
 assert.ok(root.allText().includes("当前进展"));
 assert.ok(root.allText().join(" ").includes("12:34:56"));
 assert.ok(root.allText().join(" ").includes("来源读取完整"));
 assert.ok(root.allText().includes("已完成"));
 assert.ok(root.allText().join(" ").includes("awaiting-human（未知状态）"));
 assert.deepEqual(root.findByClass("flowdesk-case-task-title-text").map(x=>x.text),["Active","Custom","Done"]);
 assert.equal(root.findByClass("flowdesk-case-task-history")[0].open,false);
 assert.ok(root.allText().join(" ").includes("Case 状态为 completed"));
 assert.ok(root.findByClass("flowdesk-case-related-link").some(x=>x.text==="工作站"));
 assert.equal(root.findByClass("flowdesk-case-progress-bar").length,0);
});

test("model 存在与缺失两条路线都不重复渲染完整Case原文，恢复数据与动作保留", async () => {
  const { createCaseContent } = await import("../src/case-content");
  const snapshot = structuredClone(canonical);
  const model = createWorkCaseViewModel(snapshot, snapshot.source.path);
  const caseContent = createCaseContent(snapshot.source.path, "## Context\n\n唯一独立全文标记", "local-read");
  const copied: string[] = [];
  let menu:Array<{label:string;run:()=>unknown}>=[];
  const renderer = new WorkCaseDashboardRenderer({
    openActions: (_title,actions)=>{menu=actions;},
    refresh: () => {},
    openTask: () => {},
    openCaseSource: () => {},
    openRelated: () => {},
    copyText: (text) => { copied.push(text); },
  });
  const base = { casePath: snapshot.source.path, loadedAt: "12:00:00", staleReason: "", error: "", loading: false, caseContent };

  const withModel = new FakeElement();
  renderer.render(withModel as unknown as HTMLElement, { ...base, model });
  const withoutModel = new FakeElement();
  renderer.render(withoutModel as unknown as HTMLElement, { ...base, model: null });

  for (const root of [withModel, withoutModel]) {
    assert.equal(root.findByClass("flowdesk-case-full-content").length, 0);
    assert.equal(root.allText().some((text) => text.includes("完整Case原文")), false);
  }
  // 无 model 路线没有恢复摘要，独立全文不应出现在任何文本里；有 model 时仅由恢复摘要承载 sections。
  assert.equal(withoutModel.allText().some((text) => text.includes("唯一独立全文标记")), false);
  assert.equal(withModel.allText().includes(caseContent.details), false);
  assert.ok(withoutModel.allText().includes("WORK CASE"));
  assert.ok(withoutModel.findByClass("flowdesk-case-header").length > 0);

  assert.equal(withModel.findByClass("flowdesk-case-resume").length, 0);
  withModel.findByClass("flowdesk-more-actions")[0].click();
  menu.find(action=>action.label==="复制完整恢复资料")!.run();
  assert.equal(copied.length, 1);
  assert.match(copied[0], /Case独立原文读取时间：local-read/);
});
