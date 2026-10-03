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


test("file_url_missing_literal_percent_does_not_decode_again",async(t)=>{
  const env=await ownedEnvironment(t),cwd=env.path("repo");mkdirSync(cwd);
  writeFileSync(path.join(cwd,"AGENTS.md"),"wrong fallback");
  const literal=path.join(cwd,"%41GENTS.md");
  const raw=`[准确原文件](<${pathToFileURL(literal).href}>)`;
  const context={casePath:"Notes/Sessions/A.md",cwd,vaultRoot:env.env.OBSIDIAN_VAULT!};
  const missing=resolveRelatedTarget(raw,context);
  assert.equal(missing.kind,"unavailable");assert.ok((missing as any).reason.includes(literal));
  writeFileSync(literal,"exact literal percent");
  const found=resolveRelatedTarget(raw,context);assert.equal(found.kind,"repository");assert.equal((found as any).absolutePath,literal);
  // Legacy raw percent paths retain their one-decode compatibility only when literal is absent.
  assert.equal((resolveRelatedTarget("%41GENTS.md",context) as any).absolutePath,literal);
  assert.equal((resolveRelatedTarget("%41GENTS.md",{...context,cwd:env.root}) as any).kind,"unavailable");
});

test("literal_hash_file_and_fragment_remain_separate",async(t)=>{
  const env=await ownedEnvironment(t),file=env.path("中文 空格 (计划) %23 #.md");writeFileSync(file,"exact");
  const url=pathToFileURL(file).href+"#Heading%20one";
  const target=resolveRelatedTarget(`[友好名称](<${url}>)`,{casePath:"Notes/Sessions/A.md",cwd:env.root,vaultRoot:env.env.OBSIDIAN_VAULT!});
  assert.equal(target.kind,"repository");assert.equal((target as any).absolutePath,file);
  assert.equal((target as any).fragment,"#Heading%20one");assert.equal((target as any).fileUrl,url);assert.equal(target.label,"友好名称");
});

test("invalid_file_url_query_authority_encoding_and_markdown_report_gap",async(t)=>{
  const env=await ownedEnvironment(t),file=env.path("valid.md");writeFileSync(file,"exact");
  const context={casePath:"A.md",cwd:env.root,vaultRoot:env.env.OBSIDIAN_VAULT!};
  for(const raw of [pathToFileURL(file).href+"?query=1",pathToFileURL(file).href+"?", "file://remote-host"+file,"file:///bad%GG.md","file:///bad%FF.md",pathToFileURL(file).href+"#bad%GG", "[broken](<file:///valid.md)"]){
    const target=resolveRelatedTarget(raw,context);assert.equal(target.kind,"unavailable",raw);assert.match((target as any).reason,/无效|本机|编码|查询/);
  }
});

test("file_url_vault_target_retains_exact_base_and_fragment_without_metadata_retarget",async(t)=>{
  const env=await ownedEnvironment(t),vaultRoot=env.env.OBSIDIAN_VAULT!;
  const file=path.join(vaultRoot,"资料 #.md");writeFileSync(file,"exact vault");const queried:string[]=[];
  const target=resolveRelatedTarget(pathToFileURL(file).href+"#^block",{casePath:"Notes/Sessions/A.md",cwd:env.root,vaultRoot,resolveVaultLink:(link)=>{queried.push(link);return "Wrong.md";}});
  assert.equal(target.kind,"vault");assert.equal((target as any).resolvedPath,"资料 #.md");assert.equal((target as any).fragment,"#^block");assert.deepEqual(queried,[]);
});


test("raw_bracket_filename_is_not_malformed_markdown_and_vault_directory_is_not_file",async(t)=>{
  const env=await ownedEnvironment(t);
  const context={casePath:"A.md",cwd:env.root,vaultRoot:env.env.OBSIDIAN_VAULT!};
  for(const raw of ["[owner].md","[owner](draft).md"]){const file=env.path(raw);writeFileSync(file,"exact raw");assert.equal((resolveRelatedTarget(raw,context) as any).absolutePath,file);}
  const directory=path.join(context.vaultRoot,"directory.md");mkdirSync(directory);
  assert.equal(resolveRelatedTarget(pathToFileURL(directory).href,context).kind,"unavailable");
});


test("raw_filesystem_spaces_keep_literal_target_and_do_not_choose_trimmed_decoy",async(t)=>{
  const fixture=await ownedEnvironment(t),cwd=fixture.path("checkout");mkdirSync(cwd);const context={casePath:"Notes/Sessions/A.md",cwd,vaultRoot:fixture.env.OBSIDIAN_VAULT!};
  const absoluteDecoy=path.join(cwd,"tail.md"),absoluteRaw=absoluteDecoy+" ",relativeRaw=" leading.md";writeFileSync(absoluteDecoy,"wrong trimmed absolute");writeFileSync(path.join(cwd,"leading.md"),"wrong trimmed relative");
  for(const raw of [absoluteRaw,relativeRaw]){const missing=resolveRelatedTarget(raw,context);assert.equal(missing.kind,"unavailable",raw);assert.ok((missing as any).reason.includes(path.isAbsolute(raw)?raw:path.join(cwd,raw)));}
  writeFileSync(absoluteRaw,"exact trailing space");writeFileSync(path.join(cwd,relativeRaw),"exact leading space");
  for(const raw of [absoluteRaw,relativeRaw]){const target=resolveRelatedTarget(raw,context);assert.equal(target.kind,"repository");assert.equal((target as any).absolutePath,path.isAbsolute(raw)?raw:path.join(cwd,raw));}
  const uri=pathToFileURL(path.join(cwd,"leading.md")).href;assert.equal((resolveRelatedTarget(" "+uri+" ",context) as any).absolutePath,path.join(cwd,"leading.md"),"existing URI recognition stays normalized");
});

test("raw_filesystem_space_cannot_be_retargeted_by_normalizing_metadata_cache",async(t)=>{
  const fixture=await ownedEnvironment(t),cwd=fixture.path("checkout");mkdirSync(cwd);const vaultRoot=fixture.env.OBSIDIAN_VAULT!;mkdirSync(path.join(vaultRoot,"Notes"));writeFileSync(path.join(vaultRoot,"Notes/decoy.md"),"trimmed vault decoy");
  const target=resolveRelatedTarget(" Notes/decoy.md",{casePath:"Notes/Sessions/A.md",cwd,vaultRoot,resolveVaultLink:()=>"Notes/decoy.md"});assert.equal(target.kind,"unavailable");assert.ok((target as any).reason.includes(path.join(cwd," Notes/decoy.md")));
});


test("raw_namespace_tail_space_veto_survives_vault_prefix_fallback",async(t)=>{
  const fixture=await ownedEnvironment(t),cwd=fixture.path("checkout");mkdirSync(cwd);const vaultRoot=fixture.env.OBSIDIAN_VAULT!;
  for(const prefix of ["Notes","Tasks","TaskNotes"]){
    const raw=prefix+"/decoy.md ",decoy=raw.trim();mkdirSync(path.join(vaultRoot,prefix));writeFileSync(path.join(vaultRoot,decoy),"wrong normalized note");
    const context={casePath:"Notes/Sessions/A.md",cwd,vaultRoot,resolveVaultLink:(value:string)=>value.trim()===decoy?decoy:null};
    assert.equal(resolveRelatedTarget(raw,context).kind,"unavailable",raw);
    mkdirSync(path.join(cwd,prefix));writeFileSync(path.join(cwd,raw),"correct literal repo target");const repository=resolveRelatedTarget(raw,context);assert.equal(repository.kind,"repository");assert.equal((repository as any).absolutePath,path.join(cwd,raw));
    const vault=resolveRelatedTarget(raw,{...context,resolveVaultLink:(value:string)=>value===raw?raw:decoy});assert.equal(vault.kind,"vault");assert.equal((vault as any).resolvedPath,raw);assert.equal((vault as any).exactFile,true);
  }
});
