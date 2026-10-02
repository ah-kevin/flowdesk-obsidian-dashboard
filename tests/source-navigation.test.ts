import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { locateTaskSource, resolveRelatedTarget, buildRepositoryOpenInvocation, chooseTaskCase } from "../src/source-navigation.ts";
import { ownedEnvironment } from "./support/owned-environment.ts";

const details="## 目标\n\n中文目标\n\n## Execution Result\n\n第一轮\n\n## Execution Result\n\n第二轮\n";
const section={heading:"Execution Result",level:2,text:"第二轮",source:{section:"Execution Result",line_start:9,line_end:11,excerpt:"第二轮"}};
test("api_details_lines_map_after_frontmatter without confusing repeated headings",()=>{
  const prefix="\ufeff---\nstatus: in-progress\ncssclasses:\n  - wide\n---\n\n";
  for(const eol of ["\n","\r\n"]) {
    const file=(prefix+details).replace(/\n/g,eol);
    assert.deepEqual(locateTaskSource(file,details,section),{kind:"line",editorLine:prefix.split("\n").length-1+8});
  }
});
test("changed, ambiguous, empty or out-of-bounds API source opens whole note",()=>{
  for(const [file,body,s] of [[details.replace("第二轮","新内容"),details,section],[details+details,details,section],[details,"",section],[details,details,{...section,source:{...section.source,line_end:200}}],[details,details,{...section,source:{...section.source,excerpt:"第一轮"}}],[details,details,{...section,source:undefined}]])
    assert.equal(locateTaskSource(file as string,body as string,s as any).kind,"note");
});
test("repository_paths_use_case_cwd and never create wrong vault note",async(t)=>{
  const env=await ownedEnvironment(t);const cwd=env.path("repo"),vaultRoot=env.env.OBSIDIAN_VAULT!;
  mkdirSync(path.join(cwd,"docs"),{recursive:true});
  const file=path.join(cwd,"docs/中文 空格 #1.md");writeFileSync(file,"原文件");
  const context={casePath:"Notes/Sessions/A.md",cwd,vaultRoot};
  for(const raw of [file,pathToFileURL(file).href,"docs/中文 空格 #1.md", "docs/%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC%20%231.md", "[文档](<docs/中文 空格 #1.md>)"]){
    const target=resolveRelatedTarget(raw,context);assert.equal(target.kind,"repository");assert.equal((target as any).absolutePath,file);
  }
  assert.equal(resolveRelatedTarget("[[Notes/资料|中文]]",context).kind,"vault");
  assert.equal(resolveRelatedTarget("https://example.com/docs",context).kind,"url");
  assert.equal(resolveRelatedTarget("docs/missing.md",context).kind,"unavailable");
  assert.equal(resolveRelatedTarget("./docs",context).kind,"unavailable");
  assert.equal(resolveRelatedTarget("docs/中文 空格 #1.md",{...context,cwd:null}).kind,"unavailable");
  assert.equal(resolveRelatedTarget("javascript:alert(1)",context).kind,"unavailable");
  const vaultFile=path.join(vaultRoot,"Notes/同名.md");mkdirSync(path.dirname(vaultFile),{recursive:true});writeFileSync(vaultFile,"vault");
  assert.equal(resolveRelatedTarget(vaultFile,context).kind,"vault");
});
test("multiple Task Cases or missing association cannot choose first cwd",()=>{
  const a={path:"Notes/Sessions/A.md",contextTag:"@A",cwd:"/repo/a"};const b={path:"Notes/Sessions/B.md",contextTag:"@B",cwd:"/repo/b"};
  assert.equal(chooseTaskCase(["@A"],[a,b]).cwd,"/repo/a");
  assert.equal(chooseTaskCase(["@A","@B"],[a,b]).cwd,null);
  assert.equal(chooseTaskCase(null,[a]).cwd,null);
});
test("repository_open_targets_obsidian_explicitly, owned adapter only proves delivery argv",async(t)=>{
  const env=await ownedEnvironment(t),file=env.path("外部 #.md");writeFileSync(file,"fixture");
  const target=resolveRelatedTarget(file,{casePath:"A.md",cwd:env.root,vaultRoot:env.env.OBSIDIAN_VAULT!});assert.equal(target.kind,"repository");
  const invocation=buildRepositoryOpenInvocation(target as any,"darwin");
  assert.deepEqual(invocation,{executable:"/usr/bin/open",args:["-a","/Applications/Obsidian.app",file]});
  assert.equal(buildRepositoryOpenInvocation(target as any,"linux"),null);
  assert.equal(buildRepositoryOpenInvocation(target as any,"win32"),null);
  const delivered:any[]=[];const ownedAdapter=async(input:any)=>{delivered.push(input);return {accepted:false};};
  assert.equal((await ownedAdapter(invocation)).accepted,false);assert.deepEqual(delivered,[invocation]);
  // No executable was called. Default runner's native rejection remains independently tested.
});
