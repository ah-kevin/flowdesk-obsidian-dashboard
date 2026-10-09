import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDoc, filterDocs, formatLocalDate, groupByProject, groupRecent, kindOfPath, markReviewed, parseReviewed, pinnedDocs, projectsOf, resolveKey, reviewBadge, setPinned,
  stripFrontmatter, summaryOfBody, type DocHubDoc, type Frontmatter,
} from "../src/doc-hub-data.ts";
import { DOC_HUB_STYLES, nextStyle, normalizePrefs, toggleTheme } from "../src/doc-hub-style.ts";

const DAY = 86400000, NOW = new Date(2026, 9, 9, 15, 0, 0).getTime();
const doc = (path: string, patch: Partial<DocHubDoc> = {}): DocHubDoc => ({ path, title: path, kind: "doc", status: "", projects: [], mtime: NOW, pinned: false, reviewedAt: null, summary: "", ...patch });

test("目录决定类型，嵌套目录与非 Markdown 不收录", () => {
  assert.equal(kindOfPath("Notes/Docs/a.md"), "doc");
  assert.equal(kindOfPath("Notes/Plans/b.md"), "plan");
  assert.equal(kindOfPath("Notes/Research/c.md"), "research");
  assert.equal(kindOfPath("Notes/Docs/Archive/a.md"), null);
  assert.equal(kindOfPath("Notes/Archive/a.md"), null);
  assert.equal(kindOfPath("Notes/Docs/a.txt"), null);
  assert.equal(buildDoc("Notes/Docs/Archive/a.md", "a", 1, {}, ""), null);
  // frontmatter 的 type 不参与分类
  assert.equal(buildDoc("Notes/Plans/x.md", "x", 1, { type: "doc" }, "")?.kind, "plan");
});

test("project 与 projects 两种写法归一，取链接最后一段并去重", () => {
  assert.deepEqual(projectsOf({ project: "[[FlowDesk]]" }), ["FlowDesk"]);
  assert.deepEqual(projectsOf({ project: "[[Notes/Projects/FlowDesk Obsidian Dashboard|Dashboard]]" }), ["FlowDesk Obsidian Dashboard"]);
  assert.deepEqual(projectsOf({ projects: ["[[A]]", "[[Notes/Projects/B|B]]", "A"] }), ["A", "B"]);
  assert.deepEqual(projectsOf({ projects: ["[[A]]"], project: "[[B]]" }), ["A", "B"]);
  assert.deepEqual(projectsOf({ project: "Plain Name" }), ["Plain Name"]);
  assert.deepEqual(projectsOf({ project: [["X"]] }), ["X"], "未加引号的 [[X]] 会被 YAML 解析成嵌套数组");
  assert.deepEqual(projectsOf({ project: "", projects: [null, ""] }), []);
  assert.deepEqual(projectsOf({}), []);
});

test("摘要优先正文第一段：跳过 frontmatter、标题、表格、代码块，引用块取文本，截 90 字", () => {
  const body = stripFrontmatter("---\ntitle: T\n---\n# 标题\n\n| a | b |\n|---|---|\n```\ncode line\n```\n![img](x.png)\n- 列表项\n> [!note]\n> 引用里的**正文** [[Notes/X|别名]]\n后面的段落");
  assert.equal(summaryOfBody(body), "引用里的正文 别名");
  assert.equal(summaryOfBody("# only heading\n\n---\n"), "");
  assert.equal(summaryOfBody("> 普通引用"), "普通引用");
  assert.equal(summaryOfBody("> [!tip] 提示标题\n> 内容"), "提示标题");
  assert.equal(summaryOfBody("链接 [[Notes/Docs/Target]] 文本"), "链接 Target 文本");
  assert.equal(Array.from(summaryOfBody("字".repeat(200))).length, 90);
  assert.equal(stripFrontmatter("---\r\na: 1\r\n---\r\nbody"), "body");
  assert.equal(stripFrontmatter("no frontmatter"), "no frontmatter");
});

test("reviewed 接受 YYYY-MM-DD 字符串与 Date，无效值为 null", () => {
  assert.equal(parseReviewed("2026-10-01"), new Date(2026, 9, 1).getTime());
  assert.equal(parseReviewed(new Date(2026, 9, 2)), new Date(2026, 9, 2).getTime());
  assert.equal(parseReviewed("昨天"), null);
  assert.equal(parseReviewed(undefined), null);
  assert.equal(formatLocalDate(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("最近视角：mtime 倒序，分今天 / 7 天内 / 30 天内 / 更早，空组不输出", () => {
  const docs = [doc("old", { mtime: NOW - 90 * DAY }), doc("today", { mtime: NOW - 1000 }), doc("week", { mtime: NOW - 3 * DAY }), doc("week2", { mtime: NOW - 5 * DAY }), doc("month", { mtime: NOW - 20 * DAY })];
  const groups = groupRecent(docs, NOW);
  assert.deepEqual(groups.map(g => g.label), ["今天", "7 天内", "30 天内", "更早"]);
  assert.deepEqual(groups.map(g => g.docs.map(d => d.path)), [["today"], ["week", "week2"], ["month"], ["old"]]);
  assert.deepEqual(groupRecent([doc("x", { mtime: NOW - 40 * DAY })], NOW).map(g => g.id), ["older"]);
  assert.equal(groupRecent([doc("midnight", { mtime: new Date(2026, 9, 9, 0, 0, 1).getTime() })], NOW)[0].id, "today");
  assert.equal(groupRecent([doc("yesterday", { mtime: new Date(2026, 9, 8, 23, 59).getTime() })], NOW)[0].id, "week");
});

test("按项目视角：多项目文档归入每个项目，无项目归未关联，组内 mtime 倒序，组按篇数排序", () => {
  const docs = [
    doc("a", { projects: ["P"], mtime: NOW - 3 * DAY }), doc("b", { projects: ["P", "Q"], mtime: NOW - DAY }), doc("c", { mtime: NOW }), doc("d", { projects: ["P"], mtime: NOW - 2 * DAY }),
  ];
  const groups = groupByProject(docs);
  assert.deepEqual(groups.map(g => [g.name, g.docs.map(d => d.path)]), [["P", ["b", "d", "a"]], ["Q", ["b"]], ["未关联项目", ["c"]]]);
  const many = groupByProject([doc("u1"), doc("u2"), doc("p", { projects: ["Solo"] })]);
  assert.deepEqual(many.map(g => g.name), ["Solo", "未关联项目"], "未关联项目即使篇数更多也排最后");
  assert.equal(groups[0].latest, NOW - DAY);
});

test("superseded / archived 默认隐藏，开关后显示；类型与搜索叠加", () => {
  const docs = [doc("a", { status: "active", title: "Alpha" }), doc("b", { status: "superseded" }), doc("c", { status: "Archived" }), doc("d", { kind: "plan", summary: "含 关键词", projects: ["Proj"] })];
  const base = { kind: "all" as const, query: "", showSuperseded: false };
  assert.deepEqual(filterDocs(docs, base).map(d => d.path), ["a", "d"]);
  assert.deepEqual(filterDocs(docs, { ...base, showSuperseded: true }).map(d => d.path), ["a", "b", "c", "d"]);
  assert.deepEqual(filterDocs(docs, { ...base, kind: "plan" }).map(d => d.path), ["d"]);
  assert.deepEqual(filterDocs(docs, { ...base, query: " 关键词 " }).map(d => d.path), ["d"]);
  assert.deepEqual(filterDocs(docs, { ...base, query: "proj" }).map(d => d.path), ["d"]);
  assert.deepEqual(filterDocs(docs, { ...base, query: "alpha" }).map(d => d.path), ["a"]);
});

test("常驻视角：只收 pinned === true；从未回看的排最前，其余按距上次回看最久排前，mtime 不参与", () => {
  const reviewed = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
  const docs = [
    doc("fresh-review", { pinned: true, mtime: NOW - 100 * DAY, reviewedAt: reviewed(2026, 9, 8) }),
    doc("just-pinned-never-reviewed", { pinned: true, mtime: NOW }),
    doc("stale-review", { pinned: true, mtime: NOW, reviewedAt: reviewed(2026, 7, 1) }),
    doc("old-mtime-never-reviewed", { pinned: true, mtime: NOW - 50 * DAY }),
    doc("not-pinned", { mtime: NOW - 400 * DAY }),
  ];
  assert.deepEqual(pinnedDocs(docs).map(d => d.path), ["just-pinned-never-reviewed", "old-mtime-never-reviewed", "stale-review", "fresh-review"]);
  assert.equal(buildDoc("Notes/Docs/x.md", "x", 1, { pinned: "true" }, "")?.pinned, false, "仅布尔 true 才算置顶");
  assert.equal(buildDoc("Notes/Docs/x.md", "x", 1, { pinned: true, reviewed: "2026-10-01" }, "")?.reviewedAt, new Date(2026, 9, 1).getTime());
});

test("回看标记：无 reviewed 一律“未回看”且为红，刚写过 frontmatter（mtime 为现在）也不变；有 reviewed 按天数着色", () => {
  assert.deepEqual(reviewBadge(doc("p", { pinned: true, mtime: NOW }), NOW), { text: "未回看", tone: "stale" });
  assert.deepEqual(reviewBadge(doc("p", { pinned: true, reviewedAt: NOW - 2 * DAY }), NOW), { text: "回看 2 天前", tone: "fresh" });
  assert.equal(reviewBadge(doc("p", { reviewedAt: NOW - 10 * DAY }), NOW).tone, "aging");
  assert.equal(reviewBadge(doc("p", { reviewedAt: NOW - 40 * DAY }), NOW).tone, "stale");
});

test("buildDoc 取 frontmatter title / status，缺失时回退到文件名与空状态", () => {
  const full = buildDoc("Notes/Docs/f.md", "f", 5, { title: " 标题 ", status: "Active" }, "摘要")!;
  assert.deepEqual([full.title, full.status, full.summary], ["标题", "Active", "摘要"]);
  const bare = buildDoc("Notes/Docs/f.md", "f", 5, null, "")!;
  assert.deepEqual([bare.title, bare.status, bare.projects, bare.pinned], ["f", "", [], false]);
});

// 注入 fake processFrontMatter：只交给 mutator frontmatter 对象，正文由另一份变量代表，写回不得触碰。
function fakeVault(frontmatter: Frontmatter, body: string) {
  const state = { frontmatter, body, calls: 0 };
  const process = async (_file: string, mutate: (fm: Frontmatter) => void) => { state.calls++; mutate(state.frontmatter); };
  return { state, process };
}

test("置顶 / 取消置顶只改 pinned，其余键与正文保持不变；取消时删除键而不是写 false", async () => {
  const original = { title: "T", status: "active", projects: ["[[A]]"], reviewed: "2026-09-01", tags: ["x"] };
  const { state, process } = fakeVault({ ...original }, "# 正文\n内容");
  await setPinned(process, "Notes/Docs/a.md", true);
  assert.deepEqual(state.frontmatter, { ...original, pinned: true });
  await setPinned(process, "Notes/Docs/a.md", false);
  assert.deepEqual(state.frontmatter, original);
  assert.equal("pinned" in state.frontmatter, false);
  assert.equal(state.body, "# 正文\n内容");
  assert.equal(state.calls, 2);
});

test("标记已回看只写本地日期 reviewed，不改 pinned 与其他键", async () => {
  const { state, process } = fakeVault({ title: "T", pinned: true, reviewed: "2026-01-01" }, "正文");
  await markReviewed(process, "Notes/Docs/a.md", new Date(2026, 9, 9, 23, 30));
  assert.deepEqual(state.frontmatter, { title: "T", pinned: true, reviewed: "2026-10-09" });
  const empty = fakeVault({}, "正文");
  await markReviewed(empty.process, "f", new Date(2026, 0, 2));
  assert.deepEqual(empty.state.frontmatter, { reviewed: "2026-01-02" });
});

test("写回失败向调用方抛出且不吞错", async () => {
  await assert.rejects(setPinned(async () => { throw new Error("磁盘只读"); }, "f", true), /磁盘只读/);
});

test("键盘：输入框内只响应 Esc；带修饰键不响应；/ 1 2 3 T S 在视图内生效", () => {
  assert.deepEqual(resolveKey("/", false, false), { type: "focus-search" });
  assert.deepEqual([resolveKey("1", false, false), resolveKey("2", false, false), resolveKey("3", false, false)], [{ type: "tab", tab: "recent" }, { type: "tab", tab: "project" }, { type: "tab", tab: "pinned" }]);
  assert.deepEqual([resolveKey("t", false, false), resolveKey("T", false, false)], [{ type: "theme" }, { type: "theme" }]);
  assert.deepEqual([resolveKey("s", false, false), resolveKey("S", false, false)], [{ type: "style" }, { type: "style" }]);
  assert.deepEqual(resolveKey("Escape", true, false), { type: "clear" });
  for (const key of ["/", "1", "t", "s"]) assert.equal(resolveKey(key, true, false), null, `输入框中 ${key} 不触发`);
  for (const key of ["t", "s", "1", "/"]) assert.equal(resolveKey(key, false, true), null, `Cmd/Ctrl+${key} 不触发`);
  assert.equal(resolveKey("x", false, false), null);
});

test("风格 S 按 经典 → 信号流 → 蓝图 → 编辑 循环，主题 T 切明暗，设置读回做校验", () => {
  assert.deepEqual(DOC_HUB_STYLES.map(s => s.label), ["经典", "信号流", "蓝图", "编辑"]);
  assert.deepEqual(DOC_HUB_STYLES.map(s => nextStyle(s.id)), ["signal", "blueprint", "editorial", "classic"]);
  assert.equal(toggleTheme("dark"), "light");
  assert.equal(toggleTheme("light"), "dark");
  assert.deepEqual(normalizePrefs(undefined), { style: "classic" });
  assert.deepEqual(normalizePrefs({ theme: "light", style: "blueprint" }), { theme: "light", style: "blueprint" });
  assert.deepEqual(normalizePrefs({ theme: "sepia", style: "neon" }), { style: "classic" });
});
