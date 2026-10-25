import assert from "node:assert/strict";
import test from "node:test";
import { buildEntry, collectionOf, entryOf, extractPage, buildAtlasPrompt, groupCollections, pageMatches, isEntryPage, manifestDocumentPath, parseQuery, projectByPrefix, resolveProject, searchAtlas, UNLINKED_PROJECT, type AtlasEntry } from "../src/atlas-data.ts";

const R = "Attachments/archify";
const page = (path: string, html: string, project = "NiuBu") => buildEntry(`${R}/${path}`, html, 1, project)!;

test("只收展示版 HTML：排除原始版、.meta、tmp、reference、source 与根目录文件", () => {
  assert.equal(collectionOf(`${R}/niubu-iam/pages/foundation.html`), "niubu-iam");
  assert.equal(collectionOf(`${R}/niubu-iam/pages/foundation.archify-original.html`), null);
  assert.equal(collectionOf(`${R}/niubu-platform/.meta/evidence/x/hardware.html`), null);
  assert.equal(collectionOf(`${R}/tmp/niubu-设备链路汇报-index-残留.html`), null);
  assert.equal(collectionOf(`${R}/reference/a.html`), null);
  assert.equal(collectionOf(`${R}/niubu-platform/source/hardware/x.html`), null);
  assert.equal(collectionOf(`${R}/loose.html`), null);
  assert.equal(collectionOf(`${R}/a/pages/x.json`), null);
  assert.equal(collectionOf("Notes/Docs/x.html"), null);
});

test("统一入口只认图集根目录的 index.html", () => {
  assert.equal(isEntryPage(`${R}/niubu-技术架构/index.html`), true);
  assert.equal(isEntryPage(`${R}/niubu-技术架构/pages/index.html`), false);
});

test("提取标题、节标题、正文与 SVG 节点文字，剔除脚本样式与界面文案", () => {
  const html = `<html><head><title>IAM &amp; 权限</title><style>.a{}</style><script>var x="假文字"</script></head><body>
    <button>风格</button><li>深色</li><h1>IAM &amp; 权限</h1><h2>模块端口</h2><p>membership 管<b>成员</b></p>
    <p>正在检查已编译语义 界面提示</p><svg><text>device_model</text><text><tspan>PK</tspan> id</text></svg></body></html>`;
  const out = extractPage(html);
  assert.equal(out.title, "IAM & 权限");
  assert.deepEqual(out.headings, ["模块端口"]);
  assert.ok(out.text.includes("membership 管 成员".replace(" ", "")) || out.text.includes("membership 管成员") || out.text.includes("membership 管 成员"));
  assert.ok(out.text.includes("device_model") && out.text.includes("PK id"));
  assert.ok(!out.text.includes("假文字") && !out.text.includes("界面提示") && !/深色/.test(out.text));
});

test("项目归属：主文档 frontmatter 优先，其次目录前缀，最后未关联", () => {
  assert.equal(resolveProject("niubu-iam", ["NiuBu"], ["FlowDesk"]), "NiuBu");
  assert.equal(resolveProject("niubu-2026-10-18", [], ["FlowDesk", "NiuBu"]), "NiuBu");
  assert.equal(resolveProject("flowdesk-2.0", [], ["FlowDesk", "NiuBu"]), "FlowDesk");
  assert.equal(resolveProject("misc", [], ["FlowDesk"]), UNLINKED_PROJECT);
  assert.equal(projectByPrefix("niubu-x", ["Niu", "NiuBu"]), "NiuBu", "取最长前缀");
});

test("清单里的主文档路径：document.path 或产物内 document", () => {
  assert.equal(manifestDocumentPath({ document: { path: "Notes/Docs/a.md" } }), "Notes/Docs/a.md");
  assert.equal(manifestDocumentPath({ artifacts: [{ id: "x" }, { document: { path: "Notes/Docs/b.md" } }] }), "Notes/Docs/b.md");
  assert.equal(manifestDocumentPath({ artifacts: [] }), null);
  assert.equal(manifestDocumentPath(null), null);
});

test("查询：@ 筛项目，其余词 AND；标题 > 节标题 > 图集名 > 正文", () => {
  assert.deepEqual(parseQuery("  @NiuBu  网关  Kafka "), { project: "NiuBu", terms: ["网关", "kafka"] });
  assert.deepEqual(parseQuery("@"), { project: null, terms: ["@"] });
  const a = page("c1/pages/a.html", "<title>数据接入</title><h2>能力网关</h2><p>kafka 消费</p>");
  const b = page("c1/pages/b.html", "<title>能力网关</title><p>其他</p>");
  const c = page("c2/pages/c.html", "<title>别的</title><svg><text>capability-gateway</text></svg>", "FlowDesk");
  const all = [a, b, c];
  assert.deepEqual(searchAtlas(all, parseQuery("网关")).map(h => h.entry.path.split("/").pop()), ["b.html", "a.html"]);
  assert.deepEqual(searchAtlas(all, parseQuery("capability-gateway")).map(h => h.entry.path.split("/").pop()), ["c.html"]);
  assert.deepEqual(searchAtlas(all, parseQuery("网关 kafka")).map(h => h.entry.path.split("/").pop()), ["a.html"], "两个词都要命中");
  assert.deepEqual(searchAtlas(all, parseQuery("@flowdesk")).map(h => h.entry.path.split("/").pop()), ["c.html"], "项目筛选不区分大小写");
  assert.equal(searchAtlas(all, parseQuery("不存在的词")).length, 0);
  assert.match(searchAtlas(all, parseQuery("capability-gateway"))[0].snippet, /capability-gateway/);
});

test("空查询按项目→图集→路径浏览，入口页不进结果但可作为图集入口", () => {
  const idx = page("c1/index.html", "<title>总入口</title>", "NiuBu");
  const list: AtlasEntry[] = [page("c2/pages/z.html", "<title>Z</title>", "NiuBu"), page("c1/pages/y.html", "<title>Y</title>", "NiuBu"), idx, page("c3/pages/x.html", "<title>X</title>", "FlowDesk")];
  assert.deepEqual(searchAtlas(list, parseQuery("")).map(h => h.entry.title), ["X", "Y", "Z"]);
  assert.equal(entryOf(list, "c1")?.title, "总入口");
  assert.equal(entryOf(list, "c2"), undefined);
});

test("按图集归并：入口页标题优先，其次主文档标题；页面按路径自然排序；没有页面的不成卡", () => {
  const list: AtlasEntry[] = [page("c1/pages/10-b.html", "<title>B</title>"), page("c1/pages/2-a.html", "<title>A</title>"), page("c1/index.html", "<title>总入口</title>"), page("c2/pages/x.html", "<title>X</title>", "FlowDesk"), page("c3/index.html", "<title>只有入口</title>")];
  const cards = groupCollections(list, { c2: { title: "主文档标题", path: "Notes/Docs/c2.md" } });
  assert.deepEqual(cards.map(card => [card.collection, card.title, card.entryPath, card.pages.map(item => item.title)]),
    [["c1", "总入口", `${R}/c1/index.html`, ["A", "B"]], ["c2", "主文档标题", null, ["X"]]]);
  assert.equal(cards[0].project, "NiuBu");
  assert.ok(cards[0].searchText.includes("c1") && cards[0].searchText.includes("总入口") === false, "入口页自身不进内容检索");
});

test("页面命中：整句子串、不区分大小写，空查询不命中", () => {
  const card = groupCollections([page("c/pages/a.html", "<title>数据接入</title><svg><text>Capability-Gateway</text></svg>")])[0];
  assert.equal(pageMatches(card.pages[0], "capability-gateway"), true);
  assert.equal(pageMatches(card.pages[0], "  "), false);
  assert.equal(pageMatches(card.pages[0], "不存在"), false);
});

test("提示词：带目录、清单、主文档与全部页面；有无入口分别给出评估要求，且不预设一定要生成", () => {
  const base = { collection: "niubu-saas-api", project: "NiuBu", title: "saas-api 技术文档", documentPath: "Notes/Docs/NiuBu-saas-api-技术文档.md", pages: [{ title: "服务连线", path: `${R}/niubu-saas-api/pages/service-wiring.html` }, { title: "计划模型", path: `${R}/niubu-saas-api/pages/plan-model.html` }] };
  const none = buildAtlasPrompt({ ...base, entryPath: null });
  assert.match(none, /^\/flow-desk:visual-doc /);
  for (const need of [`${R}/niubu-saas-api/artifacts.json`, "Notes/Docs/NiuBu-saas-api-技术文档.md", "1. 服务连线", "2. 计划模型", "（2 页）", "现有总览页：无"]) assert.ok(none.includes(need), need);
  assert.match(none, /各页独立阅读更合适就保持现状/);
  assert.match(none, /不要发布到 OBS/);
  const has = buildAtlasPrompt({ ...base, entryPath: `${R}/niubu-saas-api/index.html` });
  assert.match(has, /现有总览页：Attachments\/archify\/niubu-saas-api\/index\.html/);
  assert.match(has, /手工定制就保留/);
  assert.match(buildAtlasPrompt({ ...base, documentPath: null, entryPath: null }), /清单里没有/);
});
