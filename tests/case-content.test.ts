import assert from "node:assert/strict";
import test from "node:test";
import { createCaseContent } from "../src/case-content.ts";
test("Case cachedRead keeps full Goal/Current/Context/Summary with file line sources",()=>{
  const text="\ufeff---\ntype: work-case\n---\n\n## Goal\n\n原目标\n\n## Context\n\n```md\n## Summary\n围栏文字\n```\n\n## Summary\n\n原摘要\n\n## Summary\n\n第二轮摘要\n";
  const result=createCaseContent("Notes/Sessions/A.md",text,"local-read-time");
  assert.equal(result.details,text);assert.equal(result.source,"vault-cached-read");
  assert.equal(result.sections.length,4);
  assert.match(result.sections[1].text,/围栏文字/);
  assert.equal(result.sections[3].source.lineStart,text.split("\n").lastIndexOf("## Summary")+1);
});
