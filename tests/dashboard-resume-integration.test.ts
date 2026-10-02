import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { TestElement } from "./support/dom.ts";
import { resumeFixture } from "./support/resume-fixture.ts";
import { compilePlugin, CORE_ROOT } from "./support/owned-environment.ts";
import { buildSnapshotInvocation } from "../src/snapshot-invocation.ts";

async function setup(t:any) {
  const fixture=await resumeFixture(t);const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);
  const Plugin=createRequire(import.meta.url)(bundle).default;const plugin=new Plugin(),root=new TestElement(),opens:string[]=[],cursors:number[]=[],copied:string[]=[];
  const files=[fixture.casePath,...fixture.tasks.map(x=>x.id)].map(p=>({path:p,extension:"md"}));
  let view:any; const events=new Map<string,Function>();
  let editorOverride:string|null=null;
  let activePath="",deferRead:(()=>Promise<string>)|null=null;
  const editor={getValue:()=>editorOverride??readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,activePath),"utf8"),lineCount:()=>readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,activePath),"utf8").split("\n").length,setCursor:(p:any)=>cursors.push(p.line),scrollIntoView(){},focus(){}};
  plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(){},getMarkdownFiles:()=>files,getAbstractFileByPath:(p:string)=>files.find(f=>f.path===p)??null,cachedRead:async(file:any)=>deferRead?deferRead():readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,file.path),"utf8")},metadataCache:{on(){},getFileCache:(file:any)=>({frontmatter:file.path===fixture.casePath?{type:"work-case"}:{}}),getFirstLinkpathDest:(p:string,sourcePath:string)=>{const paths=p.startsWith(".")?[path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath),p))]:[p,path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath),p))];return files.find(f=>paths.includes(f.path)||paths.some(candidate=>f.path===candidate+".md"))??null;}},workspace:{on(name:string,callback:Function){events.set(name,callback);},onLayoutReady(){},getActiveFile:()=>files.find(f=>f.path===activePath)??null,getLeavesOfType:()=>view?[{view}]:[],getLeaf:()=>({async openFile(file:any){activePath=file.path;opens.push(file.path);events.get("file-open")?.(file);}}),getActiveViewOfType:()=>({file:{path:activePath},editor}),async openLinkText(p:string){opens.push(p);}}};
  await plugin.onload();plugin.settings={flowdeskRoot:CORE_ROOT,workingDirectory:fixture.root,apiUrl:fixture.url,tasknotesEnv:'{"TASKNOTES_API_TOKEN":"controlled-token"}'};
  for(const task of fixture.tasks){const invocation=buildSnapshotInvocation({flowdeskRoot:CORE_ROOT,taskPath:task.id,workingDirectory:fixture.root,apiUrl:fixture.url},"json");fixture.allowParentProducer([invocation.executable,...invocation.args],invocation.cwd);}
  const old=Object.getOwnPropertyDescriptor(globalThis,"navigator");Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard:{writeText:async(text:string)=>{copied.push(text);}}}});
  t.after(()=>{if(old)Object.defineProperty(globalThis,"navigator",old);else delete (globalThis as any).navigator;});
  view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});t.after(()=>view.onClose());
  return {fixture,plugin,view,root,opens,cursors,copied,files,setEditorOverride:(text:string|null)=>{editorOverride=text;},setDeferredRead:(read:(()=>Promise<string>)|null)=>{deferRead=read;}};
}

test("compiled Case consumes same real bundle and independent full Case content, copy has zero side effects",async(t)=>{
  const {fixture,view,root,copied}=await setup(t);
  await view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  const state=view.caseAdapter.getRenderState();
  assert.ok(state.model.resumeBundle);assert.equal(state.caseContent.details,fixture.caseText);
  assert.match(root.allText().join("\n"),/核对中文文档（最新）|Case目标/);
  assert.ok(root.allText().includes(fixture.caseText));
  await root.findByClass("flowdesk-case-copy-resume")[0].click();
  assert.match(copied[0],/上下文原文|摘要原文/);assert.match(copied[0],/核对中文文档（最新）/);
  assert.match(copied[0],/本地.*读取|独立/);assert.match(copied[0],/原owner|旧执行/);
  assert.equal(fixture.originalCase(),fixture.caseText);
  assert.ok(fixture.requests.every(x=>x.method==="GET"||(x.method==="POST"&&x.url==="/api/tasks/query")));
  assert.equal(root.querySelectorAll("button").some(x=>x.text==="一键接管"),false);
});

test("compiled Task records/diagnostics/full API source map real frontmatter and repo links share resolver",async(t)=>{
  const {fixture,view,root,opens,cursors,copied}=await setup(t);const task=fixture.tasks[1];
  task.details+="\n\n[仓库文档](<docs/中文 空格 #1.md>)\n";
  // Keep the real file synchronized with the API; no business API mutation occurs.
  const {writeFileSync}=await import("node:fs");const file=path.join(fixture.env.OBSIDIAN_VAULT!,task.id);
  const text=("\ufeff---\nstatus: done\ncssclasses:\n  - wide\n---\n\n"+task.details).replace(/\n/g,"\r\n");writeFileSync(file,text);
  await view.loadTask(task.id);
  const record=view.taskAdapter.getRenderState().snapshot.current_task.records.execution[0];
  await view.openSnapshotSource(task.id,record.source,"执行",record.text);
  assert.equal(cursors.pop(),text.replace(/\r\n/g,"\n").split("\n").findIndex(x=>x.startsWith("## Execution Result")));
  await view.openDiagnosticLocation({taskId:task.id,source:record.source});assert.ok(cursors.length);
  await view.loadRawTaskContent(task.id);
  await view.openRelated("docs/中文 空格 #1.md",task.id);
  await root.findByClass("flowdesk-copy-related-path")[0].click();
  assert.match(copied[copied.length-1],/中文 空格 #1\.md/);
  assert.ok(opsAreVaultOnly(opens));
  const links=root.querySelectorAll("a");assert.ok(links.length);
  const oldPanel=view.relatedTargetPanel;
  await links[links.length-1].click();
  const deadline=Date.now()+3000;
  while(view.relatedTargetPanel===oldPanel && Date.now()<deadline) await new Promise(resolve=>setImmediate(resolve));
  assert.notEqual(view.relatedTargetPanel,oldPanel);
  assert.ok(opsAreVaultOnly(opens));
  assert.ok(fixture.requests.every(x=>x.method==="GET"||(x.method==="POST"&&x.url==="/api/tasks/query")));
});
const opsAreVaultOnly=(opens:string[])=>opens.every(p=>p.startsWith("Tasks/")||p.startsWith("Notes/"));

test("independent cachedRead late result cannot replace another selection; partial API gaps remain visible",async(t)=>{
  const {fixture,view,root,setDeferredRead}=await setup(t);let release:(text:string)=>void=()=>{};
  setDeferredRead(()=>new Promise(resolve=>{release=resolve;}));
  const old=view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  await new Promise(resolve=>setImmediate(resolve));
  await view.loadTask(fixture.tasks[0].id);release(fixture.caseText);await old;
  assert.equal(view.caseAdapter.getRenderState(),null);assert.ok(!root.allText().includes(fixture.caseText));
  setDeferredRead(null);fixture.setPartial(true);await view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  assert.match(root.allText().join("\n"),/不完整|partial|complete=false/);
  assert.equal(view.caseAdapter.getRenderState().model.tasks.counts.total,null);
});


test("source navigation survives its own public file-open event and refuses changed unsaved editor body",async(t)=>{
  const {fixture,view,cursors,setEditorOverride}=await setup(t);
  await view.loadTask(fixture.tasks[0].id);
  const task=fixture.tasks[1];
  const snapshot=await view.plugin.loadSnapshot(task.id,new AbortController().signal);
  const record=snapshot.current_task.records.execution[0];
  await view.openSnapshotSource(task.id,record.source,"跨Task诊断",record.text);
  assert.ok(cursors.length,"own file-open must not cancel intended target positioning");
  await view.loadTask(task.id);cursors.length=0;
  const file=readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,task.id),"utf8");
  setEditorOverride(file.replace("实现结果 **完整**","未保存的编辑"));
  await view.openSnapshotSource(task.id,record.source,"执行",record.text);
  assert.equal(cursors.length,0,"stale editor must open whole note without guessed cursor");
  setEditorOverride(null);
});

test("navigation identity or Case cachedRead failures never move a guessed cursor",async(t)=>{
  const {fixture,view,cursors,setDeferredRead}=await setup(t);
  await view.loadTask(fixture.tasks[1].id);
  const record=view.taskAdapter.getRenderState().snapshot.current_task.records.execution[0];
  fixture.setWrongIdentity(true);
  await view.openSnapshotSource(fixture.tasks[1].id,record.source,"执行",record.text);
  assert.equal(cursors.length,0);
  assert.equal(view.taskAdapter.getRenderState().snapshot.current_task.status,"done");
  fixture.setWrongIdentity(false);
  await view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  const source=view.caseAdapter.getRenderState().model.sections.goal[0].source;
  setDeferredRead(async()=>{throw Error("owned Case read failed");});
  await assert.doesNotReject(view.openCaseSource(fixture.casePath,source));
  assert.equal(cursors.length,0);setDeferredRead(null);
});

test("vault file URL with literal hash stays in public vault navigation and body uses same route",async(t)=>{
  const {fixture,view,root,files,opens}=await setup(t);
  const {mkdirSync,writeFileSync}=await import("node:fs");const {pathToFileURL}=await import("node:url");
  const notePath="Notes/中文 空格 #1.md",absolute=path.join(fixture.env.OBSIDIAN_VAULT!,notePath);
  mkdirSync(path.dirname(absolute),{recursive:true});writeFileSync(absolute,"vault原文件");files.push({path:notePath,extension:"md"});
  await view.loadTask(fixture.tasks[0].id);
  await view.openRelated(pathToFileURL(absolute).href,fixture.tasks[0].id);
  assert.equal(opens.pop(),notePath);
  await view.loadTask(fixture.tasks[0].id);
  fixture.tasks[0].details+=`\n\n[vault原文件](<${pathToFileURL(absolute).href}>)\n`;
  await view.loadRawTaskContent(fixture.tasks[0].id);
  const anchors=root.querySelectorAll("a");await anchors[anchors.length-1].click();
  const deadline=Date.now()+1000;while(opens[opens.length-1]!==notePath&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(opens[opens.length-1],notePath);
});

test("repository click is intercepted before an asynchronous MarkdownRenderer completes",async(t)=>{
  const {fixture,plugin,view,root}=await setup(t);await view.loadTask(fixture.tasks[0].id);
  let release:()=>void=()=>{};plugin.app.markdownDelay=()=>new Promise<void>(resolve=>{release=resolve;});
  const body=root.createDiv();const render=view.renderSourceMarkdown(`[文档](<${path.join(fixture.cwd,"docs/中文 空格 #1.md")}>)`,body,fixture.tasks[0].id);
  const anchor=body.querySelectorAll("a")[0];await anchor.click();
  const deadline=Date.now()+200;while(!view.relatedTargetPanel&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  release();await render;delete plugin.app.markdownDelay;
  assert.ok(view.relatedTargetPanel,"native vault default must not run during an awaited render");
});

test("review P2: existing ordinary and relative vault Markdown targets precede Case cwd",async(t)=>{
  const {fixture,view,root,files,opens}=await setup(t);const {mkdirSync,writeFileSync}=await import("node:fs");
  for(const note of ["Docs/资料.md","Clients/客户.md"]){const file=path.join(fixture.env.OBSIDIAN_VAULT!,note);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"已有vault原文");files.push({path:note,extension:"md"});}
  await view.loadTask(fixture.tasks[0].id);
  for(const raw of ["../Docs/资料.md","Clients/客户.md"]){
    await view.openRelated(raw,fixture.tasks[0].id);assert.equal(opens.pop(),raw);
  }
  const element=root.createDiv();await view.renderSourceMarkdown("[资料](../Docs/资料.md) [客户](Clients/客户.md)",element,fixture.tasks[0].id);
  for(const anchor of element.querySelectorAll("a"))await anchor.click();
  assert.equal(view.relatedTargetPanel,null,"existing vault links keep native routing without repo-gap panel");
});

test("review P2: same href mixed wiki/Markdown and code wiki text do not globally exempt repository links",async(t)=>{
  const {fixture,view,root}=await setup(t);const {writeFileSync,mkdirSync}=await import("node:fs");
  mkdirSync(path.join(fixture.cwd,"docs"),{recursive:true});writeFileSync(path.join(fixture.cwd,"docs/spec.md"),"repo原文件");await view.loadTask(fixture.tasks[0].id);
  for(const text of ["[[docs/spec.md]] [仓库文档](docs/spec.md)","[[docs/spec.md|仓库文档]] [仓库文档](docs/spec.md)","```md\n[[docs/spec.md]]\n```\n[仓库文档](docs/spec.md)","`[[docs/spec.md]]` [仓库文档](docs/spec.md)","\\[\\[docs/spec.md]] [仓库文档](docs/spec.md)"]){
    const body=root.createDiv();await view.renderSourceMarkdown(text,body,fixture.tasks[0].id);
    const old=view.relatedTargetPanel;const anchors=body.querySelectorAll("a");if(text.startsWith("[[")){assert.equal(anchors.length,2);await anchors[0].click();assert.equal(view.relatedTargetPanel,old,"actual wiki occurrence retains native behavior");}await anchors[anchors.length-1].click();
    const deadline=Date.now()+3000;while(view.relatedTargetPanel===old&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
    assert.notEqual(view.relatedTargetPanel,old,text);assert.match(view.relatedTargetPanel.allText().join("\n"),/spec\.md/);
  }
});

test("review P2: actual resume and continuation clipboard include Decisions and full observed Task context",async(t)=>{
  const {fixture,view,root,copied}=await setup(t);await view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  await root.findByClass("flowdesk-case-copy-resume")[0].click();assert.match(copied[0],/决策：保持只读。/);assert.match(copied[0],/Decisions.*vault-file|决策来源/s);

});

test("review P2: continue clipboard contains exact observed Task IDs/results/Next/cwd and explicit choice",async(t)=>{
  const {fixture,view,root,copied}=await setup(t);await view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  const button=root.querySelectorAll("button").find(element=>element.text==="复制继续工作步骤")!;await button.click();
  const payload=copied[0];
  for(const value of [fixture.casePath,fixture.tasks[0].id,fixture.tasks[1].id,"in-progress","done","实现结果 **完整**","核对中文文档（最新）",fixture.cwd,"codex/2.0","缺失字段","明确选择"])
    assert.ok(payload.includes(value),value);
  assert.ok(fixture.requests.every(request=>request.method==="GET"||(request.method==="POST"&&request.url==="/api/tasks/query")));
});

test("navigation follow-up P2: vault existence uses linkpath while navigation preserves heading/block and literal hash",async(t)=>{
  const {fixture,plugin,view,root,files,opens}=await setup(t);const {mkdirSync,writeFileSync}=await import("node:fs");
  for(const note of ["Clients/客户.md","Docs/资料.md","Clients/字面#文件.md"]){const file=path.join(fixture.env.OBSIDIAN_VAULT!,note);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"已有vault文件");files.push({path:note,extension:"md"});}
  const queried:string[]=[];const original=plugin.app.metadataCache.getFirstLinkpathDest;
  plugin.app.metadataCache.getFirstLinkpathDest=(p:string,source:string)=>{queried.push(p);return original(p,source);};
  await view.loadTask(fixture.tasks[0].id);
  for(const link of ["Clients/客户.md#概况","../Docs/资料.md#^block"]){await view.openRelated(link,fixture.tasks[0].id);assert.equal(opens.pop(),link);}
  assert.ok(queried.includes("Clients/客户.md"));assert.ok(queried.includes("../Docs/资料.md"));
  assert.ok(!queried.some(p=>p.endsWith("#概况")||p.endsWith("#^block")));
  await view.openRelated("Clients/字面#文件.md",fixture.tasks[0].id);assert.equal(opens.pop(),"Clients/字面#文件.md");
  const body=root.createDiv();await view.renderSourceMarkdown("[客户](Clients/客户.md#概况) [资料](../Docs/资料.md#^block)",body,fixture.tasks[0].id);
  for(const anchor of body.querySelectorAll("a"))await anchor.click();assert.equal(view.relatedTargetPanel,null);
});

test("navigation follow-up P2: decoded entity label cannot grant another occurrence wiki exemption",async(t)=>{
  const {fixture,plugin,view,root}=await setup(t);const {writeFileSync}=await import("node:fs");writeFileSync(path.join(fixture.cwd,"docs/spec.md"),"repo");await view.loadTask(fixture.tasks[0].id);
  const text="[[docs/spec.md|中文]] [&#x4E2D;&#x6587;](docs/spec.md)";
  for(const delayed of [false,true]){
    let release:()=>void=()=>{};if(delayed)plugin.app.markdownDelay=()=>new Promise<void>(resolve=>{release=resolve;});
    const body=root.createDiv();const render=view.renderSourceMarkdown(text,body,fixture.tasks[0].id);if(!delayed)await render;
    const anchors=body.querySelectorAll("a");assert.equal(anchors[1].textContent,"中文","host double must model actual DOM entity decoding");
    const old=view.relatedTargetPanel;await anchors[1].click();
    const deadline=Date.now()+3000;while(view.relatedTargetPanel===old&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
    if(delayed){release();await render;delete plugin.app.markdownDelay;}
    assert.notEqual(view.relatedTargetPanel,old); // ambiguous partial render may show a source gap, but never native wiki routing
  }
});

test("explicit compiled document-open click consumes production adapter through owned boundary once and retains feedback/path on error",async(t)=>{
  const {fixture,plugin,view,root}=await setup(t);const {statSync,mkdirSync,writeFileSync}=await import("node:fs");
  const app=fixture.path("owned-app"),binary=fixture.path("owned-app-binary");mkdirSync(app);writeFileSync(binary,"owned inert binary metadata");
  const file=path.join(fixture.cwd,"docs/中文 空格 #1.md");const calls:any[]=[];let reject=false;
  plugin.repositoryOpenDependencies={platform:"darwin",inspect:(p:string)=>statSync(p==="/Applications/Obsidian.app"?app:p==="/Applications/Obsidian.app/Contents/MacOS/Obsidian"?binary:p),execute:async(...args:any[])=>{calls.push(args);if(reject)throw Error("owned failed submission");}};
  await view.loadTask(fixture.tasks[0].id);await view.openRelated(file,fixture.tasks[0].id);assert.equal(calls.length,0,"viewing/navigating/copying is not an implicit launch");
  const open=root.findByClass("flowdesk-open-repository-document")[0];assert.ok(open);
  await open.click();assert.deepEqual(calls,[["/usr/bin/open",["-a","/Applications/Obsidian.app",file],{timeoutMs:10000}]]);
  assert.match(root.allText().join("\n"),/打开请求已提交/);assert.doesNotMatch(root.allText().join("\n"),/文件已打开|原位保存成功/);
  reject=true;await open.click();assert.equal(calls.length,2,"one attempt per new explicit click, no auto retry");
  assert.match(root.allText().join("\n"),/结果未知|是否打开未知/);assert.equal(root.findByClass("flowdesk-copy-related-path").length,1);
  reject=false;let release:()=>void=()=>{};
  plugin.repositoryOpenDependencies.execute=async(...args:any[])=>{calls.push(args);await new Promise<void>(resolve=>{release=resolve;});};
  const pending=open.click();await new Promise(resolve=>setImmediate(resolve));await open.click();assert.equal(calls.length,3,"busy button rejects concurrent duplicate click");release();await pending;
  plugin.repositoryOpenDependencies.platform="linux";await open.click();assert.equal(calls.length,3);assert.match(root.allText().join("\n"),/当前平台.*参数/);
  assert.ok(fixture.requests.every(r=>r.method==="GET"||(r.method==="POST"&&r.url==="/api/tasks/query")));
});

test("final navigation P2: Markdown body literal hash opens confirmed vault TFile instead of native subpath",async(t)=>{
  const {fixture,view,root,files,opens}=await setup(t);const {mkdirSync,writeFileSync}=await import("node:fs");
  const note="Clients/字面#文件.md",file=path.join(fixture.env.OBSIDIAN_VAULT!,note);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"原文件");files.push({path:note,extension:"md"});await view.loadTask(fixture.tasks[0].id);
  const body=root.createDiv();await view.renderSourceMarkdown("[文件](Clients/字面#文件.md)",body,fixture.tasks[0].id);await body.querySelectorAll("a")[0].click();
  const deadline=Date.now()+1000;while(opens[opens.length-1]!==note&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(opens[opens.length-1],note);
});

test("final navigation P2: relative related literal hash retains confirmed vault identity for public openFile",async(t)=>{
  const {fixture,view,files,opens}=await setup(t);const {mkdirSync,writeFileSync}=await import("node:fs");
  const note="Docs/字面#文件.md",file=path.join(fixture.env.OBSIDIAN_VAULT!,note);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,"原文件");files.push({path:note,extension:"md"});await view.loadTask(fixture.tasks[0].id);
  await view.openRelated("../Docs/字面#文件.md",fixture.tasks[0].id);assert.equal(opens[opens.length-1],note);
});
