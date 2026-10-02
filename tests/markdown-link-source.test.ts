import assert from "node:assert/strict";
import test from "node:test";
import { collectMarkdownLinkSources, renderedLinkSource } from "../src/markdown-link-source.ts";
test("actual source occurrences distinguish mixed same-href syntax and ignore non-link text",()=>{
  const text="[[docs/spec.md|相同标签]] [相同标签](docs/spec.md)\n```md\n[[docs/spec.md]]\n```\n`[[docs/spec.md]]` \\[\\[docs/spec.md]] <!-- [[docs/spec.md]] -->";
  const sources=collectMarkdownLinkSources(text);assert.deepEqual(sources.map(s=>s.kind),["wiki","markdown"]);
  const anchors=[{href:"docs/spec.md",label:"相同标签"},{href:"docs/spec.md",label:"相同标签"}];
  assert.equal(renderedLinkSource(sources,anchors,0,true),"wiki");assert.equal(renderedLinkSource(sources,anchors,1,true),"markdown");
  assert.equal(renderedLinkSource(sources,[anchors[0]],0,false),null);
  assert.equal(renderedLinkSource(sources,[...anchors,anchors[0]],1,true),null);
});
test("reference Markdown definitions are not rendered link occurrences",()=>{
  const sources=collectMarkdownLinkSources("[仓库文档][doc]\n\n[doc]: docs/spec.md");
  assert.deepEqual(sources,[{kind:"markdown",href:"docs/spec.md",label:"仓库文档"}]);
});

test("numeric entities share visible-label semantics without allowing mixed-source early wiki exemption",()=>{
  const sources=collectMarkdownLinkSources("[[docs/spec.md|中文]] [&#x4E2D;&#x6587;](docs/spec.md)");
  const rendered=[{href:"docs/spec.md",label:"中文"},{href:"docs/spec.md",label:"中文"}];
  assert.equal(sources[1].label,"中文");
  assert.equal(renderedLinkSource(sources,rendered,1,true),"markdown");
  assert.equal(renderedLinkSource(sources,rendered,1,false),null);
  assert.equal(renderedLinkSource(sources,[rendered[1]],0,false),null);
});
