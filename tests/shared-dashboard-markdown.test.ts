import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import {ownedEnvironment,updateCapabilities} from "./support/owned-environment";

async function adapter(t:any) {
  const owned=await ownedEnvironment(t),out=owned.path("markdown.cjs");
  const executable=process.env.FLOWDESK_TEST_ESBUILD!,args=[path.resolve("packages/dashboard-ui/src/markdown.ts"),"--bundle","--platform=node","--format=cjs","--outfile="+out];
  updateCapabilities(process.env.FLOWDESK_TEST_CAPS!,data=>data.commands.push({executable,args,cwd:process.cwd()}));
  const result=spawnSync(executable,args,{env:process.env,encoding:"utf8"});
  assert.equal(result.status,0,"readonly Markdown consumer must compile: "+result.stderr);
  return createRequire(import.meta.url)(out).renderReadonlyMarkdown as (text:string)=>string;
}
test("rich Task body has tables code and disabled original checklist markers",async t=>{
  const render=await adapter(t);
  const html=render("# 标题\n\n**正文**\n\n|项目|状态|\n|---|---|\n|A|待验收|\n\n- [x] 已记录\n- [ ] 待确认\n\n~~~ts\nconst value = '<script>';\n~~~");
  assert.match(html,/<h1>标题<\/h1>/);
  assert.match(html,/<table>/);assert.match(html,/<strong>正文<\/strong>/);
  assert.match(html,/type="checkbox"[^>]*disabled[^>]*checked/);
  assert.equal((html.match(/type="checkbox"/g)||[]).length,2);
  assert.match(html,/&lt;script&gt;/);
});
test("FlowDesk callout folds and wiki references retain their original identity",async t=>{
  const render=await adapter(t),tick=String.fromCharCode(96);
  const html=render("> [!faq]- 详细过程日志\n> - 一条记录\n\n[[Notes/Plans/Demo|设计方案]]\n\n"+tick+"[[代码内引用]]"+tick);
  assert.match(html,/<details[^>]*flowdesk-callout/);assert.match(html,/<summary>详细过程日志<\/summary>/);
  assert.match(html,/data-reference="\[\[Notes\/Plans\/Demo\|设计方案\]\]"/);
  assert.match(html,/>设计方案<\/span>/);
  assert.equal((html.match(/data-reference=/g)||[]).length,1);
});
test("untrusted HTML and resources cannot create executable or external navigation elements",async t=>{
  const render=await adapter(t);
  const html=render('<img src=x onerror="alert(1)">\n\n[坏链接](javascript:alert(1))\n\n![截图](https://example.invalid/private.png)\n\n[资料](https://example.invalid/a)');
  assert.doesNotMatch(html,/<(?:script|img|iframe|a)\b/i);
  assert.match(html,/图片未加载/);
  assert.match(html,/data-reference="https:\/\/example.invalid\/a"/);
  assert.match(html,/&lt;img/);
});
