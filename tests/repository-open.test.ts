import assert from "node:assert/strict";
import {mkdirSync,writeFileSync,statSync} from "node:fs";
import test from "node:test";
import {RepositoryMarkdownOpener} from "../src/repository-open.ts";
import {ownedEnvironment} from "./support/owned-environment.ts";

test("production adapter validates owned file/app, delivers one exact non-shell invocation and reports accepted only",async(t)=>{
  const fixture=await ownedEnvironment(t),file=fixture.path("中文 空格 #1.md"),app=fixture.path("Owned Obsidian.app"),binary=fixture.path("owned-binary");writeFileSync(file,"原文");mkdirSync(app);writeFileSync(binary,"owned inert metadata");
  const calls:any[]=[];const inspect=(p:string)=>statSync(p==="/Applications/Obsidian.app"?app:p==="/Applications/Obsidian.app/Contents/MacOS/Obsidian"?binary:p);
  const opener=new RepositoryMarkdownOpener({platform:"darwin",inspect,execute:async(...args:any[])=>{calls.push(args);}});
  const result=await opener.open(file);
  assert.equal(result.kind,"accepted");assert.match(result.message,/请求已提交/);assert.doesNotMatch(result.message,/文件已打开|保存成功/);
  assert.deepEqual(calls,[["/usr/bin/open",["-a","/Applications/Obsidian.app",file],{timeoutMs:10000}]]);
});
test("production adapter unsupported/missing/non-Markdown/app failure never calls executor; process failure/timeout remain unknown without retry",async(t)=>{
  const fixture=await ownedEnvironment(t),file=fixture.path("doc.md"),other=fixture.path("doc.txt");writeFileSync(file,"原文");writeFileSync(other,"其他");
  let calls=0;const valid={isFile:()=>true,isDirectory:()=>true};
  const execute=async()=>{calls++;throw Object.assign(Error("owned timeout"),{code:"ETIMEDOUT"});};
  const unsupported=new RepositoryMarkdownOpener({platform:"linux",inspect:()=>valid,execute});assert.equal((await unsupported.open(file)).kind,"unsupported");
  const missing=new RepositoryMarkdownOpener({platform:"darwin",inspect:()=>{throw Error("missing");},execute});assert.equal((await missing.open(file)).kind,"unavailable");
  const noApp=new RepositoryMarkdownOpener({platform:"darwin",inspect:(p)=>p==="/Applications/Obsidian.app"?{isFile:()=>false,isDirectory:()=>false}:valid,execute});assert.equal((await noApp.open(file)).kind,"unavailable");assert.equal(calls,0);
  const normal=new RepositoryMarkdownOpener({platform:"darwin",inspect:()=>valid,execute});assert.equal((await normal.open(other)).kind,"unavailable");assert.equal(calls,0);
  const timeout=await normal.open(file);assert.equal(timeout.kind,"unknown");assert.match(timeout.message,/超时|未知/);assert.equal(calls,1);
  const failing=new RepositoryMarkdownOpener({platform:"darwin",inspect:()=>valid,execute:async()=>{calls++;throw Error("owned rejection");}});assert.equal((await failing.open(file)).kind,"unknown");assert.equal(calls,2);
});


test("compiled_related_json_has_only_copy_and_external_fragment_reads_exact_markdown_without_OS_open",async(t)=>{
  const fixture=await ownedEnvironment(t);
  const {compilePlugin}=await import("./support/owned-environment.ts");const {createRequire}=await import("node:module");
  const {pathToFileURL}=await import("node:url");const {TestElement}=await import("./support/dom.ts");
  const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);const Plugin=createRequire(import.meta.url)(bundle).default;
  const plugin=new Plugin(),root=new TestElement(),copied:string[]=[],calls:any[]=[];
  plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(){},getAbstractFileByPath(){return null;}},metadataCache:{on(){},getFirstLinkpathDest(){return null;}},workspace:{on(){},onLayoutReady(){}}};
  await plugin.onload();const view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});plugin.app.workspace.getLeavesOfType=()=>[{view}];t.after(()=>view.onClose());
  const readerRoot=new TestElement(),revealed:any[]=[],contentLeaf:any={app:plugin.app,contentEl:readerRoot};
  contentLeaf.setViewState=async(state:any)=>{contentLeaf.view=plugin.views.get(state.type)(contentLeaf);await contentLeaf.view.onOpen();await contentLeaf.view.setState(state.state,{});};
  plugin.app.workspace.getLeaf=()=>contentLeaf;plugin.app.workspace.revealLeaf=async(leaf:any)=>{revealed.push(leaf);};
  t.after(()=>contentLeaf.view?.onClose());
  const prior=Object.getOwnPropertyDescriptor(globalThis,"navigator");Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard:{writeText:async(text:string)=>{copied.push(text);}}}});
  t.after(()=>{if(prior)Object.defineProperty(globalThis,"navigator",prior);else delete (globalThis as any).navigator;});
  plugin.repositoryOpenDependencies={platform:"darwin",inspect:()=>({isFile:()=>true,isDirectory:()=>true}),execute:async(...args:any[])=>{calls.push(args);}};
  const json=fixture.path("原始 evidence.json");writeFileSync(json,"{}");const jsonRef=`[原始证据](<${pathToFileURL(json).href}>)`;
  await view.openRelated(jsonRef,"Tasks/Owned.md");
  assert.equal(view.relatedTargetPanel.findByClass("flowdesk-open-repository-document").length,0,"JSON must not offer Markdown opener");
  await view.relatedTargetPanel.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),json);
  await view.relatedTargetPanel.findByClass("flowdesk-copy-related-reference")[0].click();assert.equal(copied.pop(),jsonRef);assert.equal(calls.length,0);
  const markdown=fixture.path("中文 %23 #.md");writeFileSync(markdown,"# Heading");const raw=`[实施文档](<${pathToFileURL(markdown).href}#Heading>)`;
  await view.openRelated(raw,"Tasks/Owned.md");assert.match(view.relatedTargetPanel.allText().join("\n"),/文件可定位.*章节未验证/);
  await view.relatedTargetPanel.findByClass("flowdesk-copy-related-reference")[0].click();assert.equal(copied.pop(),raw);
  await view.relatedTargetPanel.findByClass("flowdesk-open-repository-document")[0].click();
  assert.equal(contentLeaf.view.getViewType(),"flowdesk-repository-reader");assert.equal(contentLeaf.view.ready,true);
  assert.equal(contentLeaf.view.getState().absolutePath,markdown);assert.deepEqual(revealed,[contentLeaf]);
  assert.ok(readerRoot.allText().includes(markdown));
  const body=readerRoot.findByClass("flowdesk-repository-body")[0] as any;assert.match(body.innerHTML,/<h1>Heading<\/h1>/);
  assert.deepEqual(calls,[],"opening a readonly tab must not execute the OS opener");
});


test("compiled_file_url_vault_literal_percent_uses_confirmed_file_without_native_reparse",async(t)=>{
  const fixture=await ownedEnvironment(t);const {compilePlugin}=await import("./support/owned-environment.ts");
  const {createRequire}=await import("node:module");const {pathToFileURL}=await import("node:url");const path=await import("node:path");
  const {TestElement}=await import("./support/dom.ts");const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);
  const Plugin=createRequire(import.meta.url)(bundle).default,plugin=new Plugin(),root=new TestElement();
  const relative="Literal%23.md",file={path:relative,extension:"md"},absolute=path.join(fixture.env.OBSIDIAN_VAULT!,relative);writeFileSync(absolute,"# Heading");
  const opened:any[]=[],linked:string[]=[],copied:string[]=[];
  plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(){},getAbstractFileByPath:(p:string)=>p===relative?file:null},metadataCache:{on(){},getFirstLinkpathDest(){return {path:"Wrong.md",extension:"md"};}},workspace:{on(){},onLayoutReady(){},getLeaf:()=>({openFile:async(f:any)=>{opened.push(f);}}),openLinkText:async(link:string)=>{linked.push(link);}}};
  await plugin.onload();const view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});plugin.app.workspace.getLeavesOfType=()=>[{view}];t.after(()=>view.onClose());
  const prior=Object.getOwnPropertyDescriptor(globalThis,"navigator");Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard:{writeText:async(text:string)=>{copied.push(text);}}}});
  t.after(()=>{if(prior)Object.defineProperty(globalThis,"navigator",prior);else delete (globalThis as any).navigator;});
  await view.openRelated(pathToFileURL(absolute).href,"Tasks/Owned.md");assert.deepEqual(opened,[file]);assert.deepEqual(linked,[]);
  const raw=`[准确资料](<${pathToFileURL(absolute).href}#Heading>)`;
  await view.openRelated(raw,"Tasks/Owned.md");assert.deepEqual(opened,[file,file]);assert.deepEqual(linked,[]);assert.match(view.relatedTargetPanel.allText().join("\n"),/文件可定位.*章节未验证/);
  await view.relatedTargetPanel.findByClass("flowdesk-copy-related-reference")[0].click();assert.equal(copied.pop(),raw);
});


test("review_compiled_raw_parenthesized_filename_keeps_original_identity",async(t)=>{
  const fixture=await ownedEnvironment(t);const {compilePlugin}=await import("./support/owned-environment.ts");const {createRequire}=await import("node:module");
  const {TestElement}=await import("./support/dom.ts");const path=await import("node:path");const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);
  const Plugin=createRequire(import.meta.url)(bundle).default,plugin=new Plugin(),root=new TestElement(),linked:string[]=[];
  const raw="[owner](draft).md",file={path:raw,extension:"md"};writeFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,raw),"owned original");
  plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(){},getAbstractFileByPath:(p:string)=>p===raw?file:null},metadataCache:{on(){},getFirstLinkpathDest(){return null;}},workspace:{on(){},onLayoutReady(){},openLinkText:async(link:string)=>{linked.push(link);}}};
  await plugin.onload();const view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});plugin.app.workspace.getLeavesOfType=()=>[{view}];t.after(()=>view.onClose());
  await view.openRelated(raw,"Tasks/Owned.md");assert.deepEqual(linked,[raw]);assert.equal(root.findByClass("flowdesk-related-target").length,0);
});

test("review_compiled_wiki_and_raw_json_fragments_copy_exact_base_without_open",async(t)=>{
  const fixture=await ownedEnvironment(t);const {compilePlugin}=await import("./support/owned-environment.ts");const {createRequire}=await import("node:module");
  const {TestElement}=await import("./support/dom.ts");const path=await import("node:path");const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);
  const Plugin=createRequire(import.meta.url)(bundle).default,plugin=new Plugin(),root=new TestElement(),linked:string[]=[],opened:any[]=[],copied:string[]=[],executed:any[]=[];
  const base="Notes/evidence.json",file={path:base,extension:"json"},absolute=path.join(fixture.env.OBSIDIAN_VAULT!,base);mkdirSync(path.dirname(absolute),{recursive:true});writeFileSync(absolute,"{}");
  plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(){},getAbstractFileByPath:(p:string)=>p===base?file:null},metadataCache:{on(){},getFirstLinkpathDest:(p:string,source:string)=>{assert.equal(source,"Tasks/Owned.md");return p===base?file:null;}},workspace:{on(){},onLayoutReady(){},openLinkText:async(link:string)=>{linked.push(link);},getLeaf:()=>({openFile:async(f:any)=>{opened.push(f);}})}};
  await plugin.onload();const view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});plugin.app.workspace.getLeavesOfType=()=>[{view}];t.after(()=>view.onClose());
  plugin.repositoryOpenDependencies={platform:"darwin",inspect:()=>({isFile:()=>true,isDirectory:()=>true}),execute:async(...args:any[])=>{executed.push(args);}};
  const prior=Object.getOwnPropertyDescriptor(globalThis,"navigator");Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard:{writeText:async(text:string)=>{copied.push(text);}}}});
  t.after(()=>{if(prior)Object.defineProperty(globalThis,"navigator",prior);else delete (globalThis as any).navigator;});
  for(const raw of ["[[Notes/evidence.json#Heading|证据]]","Notes/evidence.json#Heading","[[Notes/evidence.json#^block]]","Notes/evidence.json#^block"]){
    await view.openRelated(raw,"Tasks/Owned.md");assert.deepEqual(linked,[],raw);assert.deepEqual(opened,[],raw);assert.equal(view.relatedTargetPanel.findByClass("flowdesk-open-repository-document").length,0);
    await view.relatedTargetPanel.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),absolute);
    await view.relatedTargetPanel.findByClass("flowdesk-copy-related-reference")[0].click();assert.equal(copied.pop(),raw);
    assert.ok(view.relatedTargetPanel.allText().some(text=>text.includes(raw.includes("#^block")?"#^block":"#Heading")),"fragment retained separately from path");assert.match(view.relatedTargetPanel.allText().join("\n"),/JSON资料仅提供/);
  }
  assert.deepEqual(executed,[]);
});


test("compiled_missing_raw_absolute_trailing_space_only_copies_original_and_never_opens_decoy",async(t)=>{
  const fixture=await ownedEnvironment(t),{compilePlugin}=await import("./support/owned-environment.ts"),{createRequire}=await import("node:module"),{TestElement}=await import("./support/dom.ts");
  const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);const Plugin=createRequire(import.meta.url)(bundle).default,plugin=new Plugin(),root=new TestElement(),copied:string[]=[],executed:any[]=[];
  plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(){},getAbstractFileByPath(){return null;}},metadataCache:{on(){},getFirstLinkpathDest(){return null;}},workspace:{on(){},onLayoutReady(){}}};await plugin.onload();
  const view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});plugin.app.workspace.getLeavesOfType=()=>[{view}];t.after(()=>view.onClose());
  const prior=Object.getOwnPropertyDescriptor(globalThis,"navigator");Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard:{writeText:async(text:string)=>{copied.push(text);}}}});t.after(()=>{if(prior)Object.defineProperty(globalThis,"navigator",prior);else delete (globalThis as any).navigator;});
  plugin.repositoryOpenDependencies={platform:"darwin",inspect:()=>({isFile:()=>true,isDirectory:()=>true}),execute:async(...args:any[])=>{executed.push(args);}};
  const decoy=fixture.path("tail.md"),raw=decoy+" ";writeFileSync(decoy,"wrong trimmed target");await view.openRelated(raw,"Tasks/Owned.md");
  assert.equal(view.relatedTargetPanel.findByClass("flowdesk-open-repository-document").length,0);await view.relatedTargetPanel.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),raw);assert.deepEqual(executed,[]);
});


test("compiled_literal_raw_vault_space_uses_confirmed_TFile_without_link_normalization",async(t)=>{
  const fixture=await ownedEnvironment(t),{compilePlugin}=await import("./support/owned-environment.ts"),{createRequire}=await import("node:module"),{TestElement}=await import("./support/dom.ts"),path=await import("node:path");
  const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);const Plugin=createRequire(import.meta.url)(bundle).default,plugin=new Plugin(),root=new TestElement(),opened:any[]=[],linked:string[]=[];
  const raw=" leading.md",literal={path:raw,extension:"md"},decoy={path:"leading.md",extension:"md"};for(const file of [literal,decoy])writeFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,file.path),"owned original or decoy");
  plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(){},getAbstractFileByPath:(p:string)=>[literal,decoy].find(file=>file.path===p)??null},metadataCache:{on(){},getFirstLinkpathDest(){return decoy;}},workspace:{on(){},onLayoutReady(){},getLeaf:()=>({openFile:async(file:any)=>{opened.push(file);}}),openLinkText:async(link:string)=>{linked.push(link);}}};await plugin.onload();
  const view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});plugin.app.workspace.getLeavesOfType=()=>[{view}];t.after(()=>view.onClose());await view.openRelated(raw,"Tasks/Owned.md");assert.deepEqual(opened,[literal]);assert.deepEqual(linked,[]);
});
