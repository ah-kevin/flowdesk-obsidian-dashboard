import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { TestElement } from "./support/dom.ts";
import { resumeFixture } from "./support/resume-fixture.ts";
import { compilePlugin, CORE_ROOT } from "./support/owned-environment.ts";
import { buildSnapshotInvocation } from "../src/snapshot-invocation.ts";

async function setup(t:any, reading=false, references: "valid"|"gaps"|null=null) {
  const fixture=await resumeFixture(t,2,reading,references);const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);
  const Plugin=createRequire(import.meta.url)(bundle).default;const plugin=new Plugin(),root=new TestElement(),opens:string[]=[],cursors:number[]=[],copied:string[]=[];
  const files=[fixture.casePath,...fixture.tasks.map(x=>x.id),...(fixture.referenceFixture?.vaultPaths??[])].map(p=>({path:p,extension:"md"}));
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
  assert.ok(!root.allText().includes(fixture.caseText));assert.equal(root.findByClass("flowdesk-case-full-content").length,0);assert.ok(!root.allText().some(x=>x.includes("完整Case原文")));
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

test("UX: one ended Task overview shows result and verification instead of an actionable Next",async t=>{
  const {fixture,view,root}=await setup(t,true);await view.loadTask(fixture.tasks[1].id);
  assert.equal(root.findByClass("flowdesk-task-overview").length,1);
  assert.match(root.findByClass("flowdesk-overview-result")[0]?.allText().join("\n")??"",/实现结果/);
  assert.match(root.findByClass("flowdesk-overview-verification")[0]?.allText().join("\n")??"",/验证|检查/);
  assert.equal(root.findByClass("flowdesk-overview-next").length,0);
  assert.equal(root.findByClass("flowdesk-primary-status").length,0);
});

test("UX: inner reading choices and scroll survive same Task refresh and API read, but another Task is isolated",async t=>{
  const {fixture,view,root}=await setup(t,true);await view.loadTask(fixture.tasks[0].id);
  root.findByClass("flowdesk-task-specification")[0].open=true;
  root.findByClass("flowdesk-process-records")[0].open=true;
  (root as any).scrollTop=431;
  await view.refreshCurrentTask();
  assert.equal(root.findByClass("flowdesk-task-specification")[0].open,true);
  assert.equal(root.findByClass("flowdesk-process-records")[0].open,true);
  assert.equal((root as any).scrollTop,431);
  await view.loadRawTaskContent(fixture.tasks[0].id);
  assert.equal(root.findByClass("flowdesk-process-records")[0].open,true);
  await view.loadTask(fixture.tasks[1].id);
  assert.equal(root.findByClass("flowdesk-task-specification")[0].open,false);
  assert.equal((root as any).scrollTop,0);
  assert.ok(fixture.requests.every(x=>x.method==="GET"||(x.method==="POST"&&x.url==="/api/tasks/query")));
});

test("UX: short continuation copy avoids duplicated Case history while full copy remains available",async t=>{
  const {fixture,view,root,copied}=await setup(t,true);await view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  const button=root.findByClass("flowdesk-case-copy-continuation")[0];assert.ok(button);await button.click();
  const short=copied[0];assert.ok(Buffer.byteLength(short,"utf8")<=4096);
  for(const value of [fixture.casePath,fixture.cwd,"codex/2.0",fixture.tasks[0].id,fixture.tasks[1].id,"in-progress","done","明确选择","缺口"])assert.ok(short.includes(value),value);
  assert.ok(!short.includes(fixture.caseText));
  assert.equal(root.findByClass("flowdesk-case-recent-progress")[0].querySelectorAll("button").length<=4,true);
  await root.findByClass("flowdesk-case-copy-resume")[0].click();assert.match(copied[1],/上下文原文|摘要原文/);
  assert.equal(fixture.originalCase(),fixture.caseText);
});

test("UX: same Case refresh replaces an ended selected Task with a newly unfinished Task",async t=>{
  const {fixture,view,root,copied}=await setup(t,true);await view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  fixture.tasks[0].status="done";fixture.tasks[1].status="in-progress";
  await view.caseAdapter.refresh();
  await root.findByClass("flowdesk-case-copy-continuation")[0].click();
  const unfinished=copied[0].split("已结束任务摘录")[0];
  assert.ok(unfinished.includes(fixture.tasks[1].id));
  assert.ok(!unfinished.includes(fixture.tasks[0].id));
  assert.equal(root.findByClass("flowdesk-continuation-choice").length,1);
});

test("UX: a Markdown link restores focus after delayed rendering only for the same resource",async t=>{
  const {fixture,plugin,view,root}=await setup(t,true);(root as any).ownerDocument={activeElement:null};
  await view.loadTask(fixture.tasks[0].id);await new Promise(resolve=>setImmediate(resolve));
  root.findByClass("flowdesk-overview-history")[0].open=true;
  const previous=root.findByClass("flowdesk-task-current-progress")[0].querySelectorAll("a")[0];assert.ok(previous);previous.focus();
  let release:()=>void=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve;});plugin.app.markdownDelayBefore=()=>waiting;
  const refresh=view.refreshCurrentTask();await refresh;
  assert.equal(root.querySelectorAll("a").length,0);(root as any).ownerDocument.activeElement=null;
  release();await new Promise(resolve=>setImmediate(resolve));
  const restored=(root as any).ownerDocument.activeElement;
  assert.ok(restored&&restored!==previous&&root.contains(restored));assert.equal(restored.textContent,previous.textContent);
  delete plugin.app.markdownDelayBefore;
});

test("UX: a delayed loading skeleton cannot replace the saved scroll position before the successful render",async t=>{
  const {fixture,plugin,view,root}=await setup(t,true);await view.loadTask(fixture.tasks[0].id);await new Promise(resolve=>setImmediate(resolve));
  (root as any).scrollTop=431;
  const empty=root.empty.bind(root);root.empty=()=>{empty();(root as any).scrollTop=0;};
  let release:()=>void=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve;});plugin.app.markdownDelayBefore=()=>waiting;
  await view.refreshCurrentTask();assert.equal((root as any).scrollTop,0);
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal((root as any).scrollTop,431);delete plugin.app.markdownDelayBefore;
});

test("UX: saving valid settings coalesces refresh and the new request uses the latest configured token",async t=>{
  const {fixture,plugin,view}=await setup(t,true);await view.loadTask(fixture.tasks[0].id);
  const {writeFileSync}=await import("node:fs");const config=fixture.path("preview-settings.json");
  plugin.saveData=async(data:any)=>writeFileSync(config,JSON.stringify(data));
  const start=fixture.requests.length;
  plugin.settings.tasknotesEnv='{"TASKNOTES_API_TOKEN":"owned-first-token"}';await plugin.saveSettings();
  plugin.settings.tasknotesEnv='{"TASKNOTES_API_TOKEN":"owned-latest-token"}';await plugin.saveSettings();
  const deadline=Date.now()+2500;
  while((fixture.requests.length===start||view.loading)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(fixture.requests.length>start);
  assert.ok(fixture.requests.slice(start).every(request=>request.authorization==="Bearer owned-latest-token"));
  assert.ok(fixture.requests.slice(start).every(request=>request.method==="GET"||(request.method==="POST"&&request.url==="/api/tasks/query")));
  assert.equal(JSON.parse(readFileSync(config,"utf8")).tasknotesEnv,'{"TASKNOTES_API_TOKEN":"owned-latest-token"}');
});

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


test("snapshot_progress_displays_latest_event_without_api_read via real writer HTTP producer compiled View",async(t)=>{
  const {fixture,plugin,view,root,copied,cursors}=await setup(t,true),task=fixture.tasks[0];
  const beforeCase=fixture.originalCase(),beforeTasks=fixture.tasks.map(task=>readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,task.id),"utf8"));
  const start=fixture.requests.length;await fixture.taskSnapshot(task.id);const baseline=fixture.requests.slice(start).map(({method,url})=>({method,url}));
  const viewStart=fixture.requests.length;await view.loadTask(task.id);assert.deepEqual(fixture.requests.slice(viewStart).map(({method,url})=>({method,url})),baseline,"top must add no direct GET to snapshot baseline");
  const top=root.findByClass("flowdesk-task-current-progress")[0];assert.ok(top,"current Progress is visible above collapsed task details");
  assert.ok(top.allText().includes(fixture.largeProgress));assert.ok(top.allText().includes(fixture.currentNext));assert.ok(top.findByClass("flowdesk-muted").some(x=>x.attrs.title?.includes("2026-10-03T13:00:00+09:00")));assert.doesNotMatch(top.allText().join("\n"),/不可冒充最新/);
  assert.ok(root.children.findIndex(x=>x.classes.has("flowdesk-task-overview"))<root.children.findIndex(x=>x.classes.has("flowdesk-contract-summary")));
  const currentContent=view.taskAdapter.getRenderState().snapshot.contract.task_contract.domain_sections.find((section:any)=>section.heading==="Progress");assert.ok(Buffer.byteLength(currentContent.text,"utf8")>1024);assert.ok(currentContent.text.includes(fixture.largeProgress.split("\n")[1]));
  const body=root.findByClass("flowdesk-process-records")[0].allText().join("\n");const markers=["早期执行原文。","普通H3原文。","早期验证原文。","人工说明原文。","早期未实施（历史原文）。"];assert.ok(markers.every((text,index)=>body.indexOf(text)>=0&&(index===0||body.indexOf(text)>body.indexOf(markers[index-1]))));
  const noReadStart=fixture.requests.length;view.renderShell();const details=root.findByClass("flowdesk-contract-summary")[0];details.open=true;for(const callback of details.listeners.get("toggle")??[])await callback();assert.equal(fixture.requests.length,noReadStart);
  const refreshStart=fixture.requests.length;await view.refreshCurrentTask();assert.deepEqual(fixture.requests.slice(refreshStart).map(({method,url})=>({method,url})),baseline);
  const rawStart=fixture.requests.length;await view.loadRawTaskContent(task.id);assert.deepEqual(fixture.requests.slice(rawStart).map(({method,url})=>({method,url})),[{method:"GET",url:"/api/tasks/"+encodeURIComponent(task.id)}]);assert.ok(root.allText().some(text=>text.includes("原始普通需求。")));assert.ok(root.findByClass("flowdesk-task-current-progress")[0].allText().includes(fixture.largeProgress));
  const activeTop=root.findByClass("flowdesk-task-current-progress")[0],anchor=activeTop.querySelectorAll("a").find(x=>x.textContent==="当前方案")!;assert.ok(anchor);await anchor.click();
  const deadline=Date.now()+3000;while(!view.relatedTargetPanel&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));assert.match(view.relatedTargetPanel.allText().join("\n"),/章节未验证/);await root.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),path.join(fixture.cwd,"docs/中文 空格 #1.md"));
  const sourceButton=root.findByClass("flowdesk-task-current-progress")[0].findByClass("flowdesk-content-source")[0],cursorCount=cursors.length,sourceReadStart=fixture.requests.length;
  await sourceButton.click();const sourceDeadline=Date.now()+3000;while(cursors.length===cursorCount&&Date.now()<sourceDeadline)await new Promise(resolve=>setImmediate(resolve));
  const sourceFile=readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,task.id),"utf8").replace(/\r\n/g,"\n").replace(/^\ufeff/,"");
  const prefixLines=sourceFile.slice(0,sourceFile.indexOf(task.details)).split("\n").length-1;
  assert.equal(cursors[cursors.length-1],prefixLines+currentContent.source.line_start-1,"Progress source uses whole projected API range without invented event offsets");
  assert.deepEqual(fixture.requests.slice(sourceReadStart).map(({method,url})=>({method,url})),[{method:"GET",url:"/api/tasks/"+encodeURIComponent(task.id)}]);
  assert.equal(fixture.originalCase(),beforeCase);assert.deepEqual(fixture.tasks.map(task=>readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,task.id),"utf8")),beforeTasks);assert.ok(fixture.requests.every(request=>request.method==="GET"||(request.method==="POST"&&request.url==="/api/tasks/query")));
});

test("terminal_lifecycle_never_exposes_old_next_as_current and delayed full API cannot replace another Task top",async(t)=>{
  const {fixture,plugin,view,root}=await setup(t,true);await view.loadTask(fixture.tasks[0].id);
  const release=fixture.pauseTaskRead(fixture.tasks[0].id),requestStart=fixture.requests.length;const pending=view.loadRawTaskContent(fixture.tasks[0].id);
  const deadline=Date.now()+3000;while(fixture.requests.length===requestStart&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  await view.loadTask(fixture.tasks[1].id);const currentTop=root.findByClass("flowdesk-task-current-progress")[0];assert.ok(currentTop);const before=currentTop.allText();
  assert.match(before.join("\n"),/最近 Progress（历史）/);assert.doesNotMatch(before.join("\n"),/当前方案|核对中文文档|不可冒充最新/);
  assert.ok(root.allText().some(text=>text.includes("- [ ] 写后通知（旧项原文）。")),"done lifecycle cannot rewrite old unchecked business text");
  release();await pending;assert.deepEqual(root.findByClass("flowdesk-task-current-progress")[0].allText(),before);
  const persisted=readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,fixture.tasks[1].id),"utf8");
  fixture.setCode(500);await view.refreshCurrentTask();assert.match(root.findByClass("flowdesk-task-current-progress")[0].allText().join("\n"),/unknown|未知|观测/);
  assert.equal(readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,fixture.tasks[1].id),"utf8"),persisted,"failed envelope does not modify persistent Task text");
  fixture.setCode(200);await view.refreshCurrentTask();assert.ok(root.allText().some(text=>text.includes("早期执行原文。")));assert.match(root.findByClass("flowdesk-task-current-progress")[0].allText().join("\n"),/最近 Progress（历史）/);
  const validAuth=plugin.settings.tasknotesEnv,reads=fixture.requests.length;
  plugin.settings.tasknotesEnv="{invalid owned auth JSON";await view.refreshCurrentTask();
  assert.equal(fixture.requests.length,reads,"real parameter-validation failure stops before HTTP");assert.ok(view.taskAdapter.getRenderState().error);assert.ok(view.taskAdapter.getRenderState().staleReason);
  assert.match(root.findByClass("flowdesk-task-current-progress")[0].allText().join("\n"),/unknown|未知|观测/);assert.ok(root.allText().some(text=>text.includes("早期执行原文。")),"original exception-stale branch retains validated history");
  plugin.settings.tasknotesEnv=validAuth;await view.refreshCurrentTask();assert.match(root.findByClass("flowdesk-task-current-progress")[0].allText().join("\n"),/最近 Progress（历史）/);
});


/** Exercise the real compiled registered Core consumer through the installed SDK's in-memory transport. */
async function compiledCoreContext(t:any,fixture:any,snapshot:any){
  const {pathToFileURL}=await import("node:url");
  const [core,serverModule,clientModule,transportModule]=await Promise.all([
    import(pathToFileURL(path.join(CORE_ROOT,"mcp/dist/tools/context-builder-tools.js")).href),
    import(pathToFileURL(path.join(CORE_ROOT,"mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js")).href),
    import(pathToFileURL(path.join(CORE_ROOT,"mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js")).href),
    import(pathToFileURL(path.join(CORE_ROOT,"mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js")).href),
  ]);
  const server=new serverModule.McpServer({name:"owned-case-reference-server",version:"0"}),client=new clientModule.Client({name:"owned-case-reference-client",version:"0"});
  t.after(async()=>{await client.close();await server.close();});
  core.registerContextBuilderTools(server);const [a,b]=transportModule.InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
  const result=await client.callTool({name:"context_builder_load",arguments:{vault:fixture.env.OBSIDIAN_VAULT,project_name:"Owned References",cwd:fixture.cwd,session_file:fixture.absoluteCase,profile:"compact",resume_context_mode:"cross-device-bootstrap",lightweight_bundle:snapshot.resume_bundle}});
  assert.equal(result.isError,undefined,JSON.stringify(result.content));
  const payload=JSON.parse(result.content[0].text);assert.ok(payload.path.startsWith(process.env.FLOWDESK_TEST_ROOT+path.sep),"Core context output must stay inside runner-owned root");
  const {rmSync}=await import("node:fs");t.after(()=>rmSync(payload.path,{force:true}));
  return {payload,text:readFileSync(payload.path,"utf8")};
}
async function clickCaseReference(view:any,root:TestElement,raw:string){
  const button=root.findByClass("flowdesk-case-related-link").find(button=>button.attrs.title===raw);assert.ok(button,raw);
  const old=view.relatedTargetPanel;await button.click();const deadline=Date.now()+3000;
  while(view.relatedTargetPanel===old&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  assert.notEqual(view.relatedTargetPanel,old,"reference button must enter real navigation consumer");
}

for(const scenario of ["valid","gaps"] as const)test(`joint_case_references_${scenario}_preserve_producer_core_and_compiled_dashboard_identity`,async(t)=>{
  const {fixture,plugin,view,root,copied,opens,files}=await setup(t,false,scenario),refs=fixture.referenceFixture!;
  const {existsSync}=await import("node:fs"),{createHash}=await import("node:crypto");
  const hash=(file:string)=>createHash("sha256").update(readFileSync(file)).digest("hex");
  const tracked=[fixture.absoluteCase,...fixture.tasks.map(task=>path.join(fixture.env.OBSIDIAN_VAULT!,task.id)),refs.markdownPath,refs.indexPath,refs.jsonPath,refs.decoyPath,...refs.rawSpaceDecoys,...refs.bracketPlans.map(raw=>path.join(fixture.cwd,raw)),...refs.vaultPaths.map(relative=>path.join(fixture.env.OBSIDIAN_VAULT!,relative))];
  const before=tracked.map(file=>({file,hash:hash(file)})),vaultPathsBefore=files.map(file=>file.path);assert.equal(existsSync(refs.missingPath),false);
  const snapshot=await fixture.snapshot();assert.deepEqual(snapshot.related.plans,refs.plans);assert.deepEqual(snapshot.related.docs,refs.docs);assert.deepEqual(snapshot.related.related,refs.related);assert.ok(snapshot.resume_bundle);
  const context=await compiledCoreContext(t,fixture,snapshot);
  for(const raw of refs.plans)assert.ok(context.text.includes(raw),raw);
  for(const task of fixture.tasks)assert.ok(context.text.includes(task.id),"same real hydrated Task bundle retained");
  if(scenario==="valid"){
    assert.doesNotMatch(context.text,/missing_plan|invalid_plan_reference/);assert.ok(!context.payload.context_bundle_manifest.data_health.reasons.includes("missing_plan"));assert.ok(!context.payload.context_bundle_manifest.data_health.reasons.includes("invalid_plan_reference"));
  }else{
    assert.match(context.text,/missing_plan/);assert.match(context.text,/invalid_plan_reference/);assert.ok(context.text.includes(refs.missing));assert.ok(context.text.includes(refs.invalid));assert.equal(context.payload.context_bundle_manifest.data_health.status,"degraded");assert.ok(context.payload.context_bundle_manifest.data_health.reasons.includes("missing_plan"));assert.ok(context.payload.context_bundle_manifest.data_health.reasons.includes("invalid_plan_reference"));
    for(const raw of refs.rawSpaceRefs)assert.ok(context.text.includes(`> Resume gap: missing_plan ${raw}`),"quoted raw whitespace must remain the missing file, not trimmed decoy");
  }
  const calls:any[]=[];plugin.repositoryOpenDependencies={platform:"darwin",inspect:()=>({isFile:()=>true,isDirectory:()=>true}),execute:async(...args:any[])=>{calls.push(args);}};
  await view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  const state=view.caseAdapter.getRenderState();assert.deepEqual(state.model.related.plans,refs.plans);assert.equal(state.caseContent.details,fixture.caseText);
  const buttons=root.findByClass("flowdesk-case-related-link");assert.equal(buttons.find(button=>button.attrs.title===refs.markdown)?.text,"编码实施方案（中文）");assert.equal(buttons.find(button=>button.attrs.title===refs.wiki)?.text,"Vault方案");assert.equal(buttons.find(button=>button.attrs.title===refs.index)?.text,"受控证据索引");
  await clickCaseReference(view,root,refs.markdown);assert.match(view.relatedTargetPanel.allText().join("\n"),/章节未验证/);assert.ok(view.relatedTargetPanel.allText().some((text:string)=>text.includes("#Heading%20one")));
  await root.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),refs.markdownPath);await root.findByClass("flowdesk-copy-related-reference")[0].click();assert.equal(copied.pop(),refs.markdown);
  await root.findByClass("flowdesk-open-repository-document")[0].click();assert.deepEqual(calls,[["/usr/bin/open",["-a","/Applications/Obsidian.app",refs.markdownPath],{timeoutMs:10000}]]);
  await clickCaseReference(view,root,refs.jsonPath);assert.equal(root.findByClass("flowdesk-open-repository-document").length,0);await root.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),refs.jsonPath);await root.findByClass("flowdesk-copy-related-reference")[0].click();assert.equal(copied.pop(),refs.jsonPath);assert.equal(calls.length,1,"JSON has zero additional executor calls");
  if(scenario==="gaps")for(const raw of [refs.missing,refs.invalid,...refs.rawSpaceRefs]){
    await clickCaseReference(view,root,raw);assert.equal(root.findByClass("flowdesk-open-repository-document").length,0);await root.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),raw);assert.equal(calls.length,1);assert.ok(view.relatedTargetPanel.allText().some((text:string)=>text.includes(raw===refs.invalid?"查询":raw===refs.missing?refs.missingPath:path.isAbsolute(raw)?raw:path.join(fixture.cwd,raw))));
  }
  for(const raw of refs.bracketPlans){
    await clickCaseReference(view,root,raw);await root.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),path.join(fixture.cwd,raw));
    await root.findByClass("flowdesk-copy-related-reference")[0].click();assert.equal(copied.pop(),raw);assert.equal(calls.length,1,"raw filename copies are not implicit opener calls");
  }
  // Wiki navigation remains the real source-aware route, without a filesystem/percent fallback.
  const wikiButton=root.findByClass("flowdesk-case-related-link").find(button=>button.attrs.title===refs.wiki)!;await wikiButton.click();const wikiDeadline=Date.now()+3000;while(!opens.includes("Notes/Plans/Vault plan.md#Decision")&&Date.now()<wikiDeadline)await new Promise(resolve=>setImmediate(resolve));assert.ok(opens.includes("Notes/Plans/Vault plan.md#Decision"));
  assert.equal(existsSync(refs.missingPath),false);assert.deepEqual(tracked.map(file=>({file,hash:hash(file)})),before);assert.deepEqual(files.map(file=>file.path),vaultPathsBefore);assert.ok(!opens.some(opened=>opened.includes("AGENTS.md")||refs.rawSpaceDecoys.includes(opened)));
  assert.ok(fixture.requests.every(request=>request.method==="GET"||(request.method==="POST"&&request.url==="/api/tasks/query")),"producer/Core/View recovery is read-only; zero PUT or task write tool");
});


test("compiled_raw_namespace_tail_space_never_reenables_rejected_metadata_target",async(t)=>{
  const {fixture,view,plugin,root,files,opens,copied}=await setup(t);const {mkdirSync,writeFileSync}=await import("node:fs");
  const decoys=["Notes/decoy.md","Tasks/decoy.md","TaskNotes/decoy.md"];
  for(const decoy of decoys){const absolute=path.join(fixture.env.OBSIDIAN_VAULT!,decoy);mkdirSync(path.dirname(absolute),{recursive:true});writeFileSync(absolute,"wrong trimmed target");files.push({path:decoy,extension:"md"});}
  const original=plugin.app.metadataCache.getFirstLinkpathDest;
  plugin.app.metadataCache.getFirstLinkpathDest=(value:string,source:string)=>decoys.includes(value.trim())?files.find(file=>file.path===value.trim()):original(value,source);
  await view.syncToActiveFile({path:fixture.casePath,extension:"md"});
  for(const decoy of decoys){
    const raw=decoy+" ",opened=opens.length;await view.openRelated(raw,fixture.casePath);assert.equal(opens.length,opened,raw);assert.ok(view.relatedTargetPanel);assert.equal(root.findByClass("flowdesk-open-repository-document").length,0);
    await root.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),raw);
  }
  // Actual literal vault identity and actual literal repository path remain available.
  const literal="Notes/literal.md ",vaultAbsolute=path.join(fixture.env.OBSIDIAN_VAULT!,literal);writeFileSync(vaultAbsolute,"literal note");files.push({path:literal,extension:"md "});
  await view.openRelated(literal,fixture.casePath);assert.equal(opens.pop(),literal);
  const repoRaw="Tasks/repository.md ",repoAbsolute=path.join(fixture.cwd,repoRaw);mkdirSync(path.dirname(repoAbsolute),{recursive:true});writeFileSync(repoAbsolute,"literal repo document");
  await view.openRelated(repoRaw,fixture.casePath);await root.findByClass("flowdesk-copy-related-path")[0].click();assert.equal(copied.pop(),repoAbsolute);assert.equal(root.findByClass("flowdesk-open-repository-document").length,0,".md suffix with literal trailing space does not widen Markdown opener");
  assert.ok(fixture.requests.every(request=>request.method==="GET"||(request.method==="POST"&&request.url==="/api/tasks/query")));
});


test("compiled Progress date gaps show snapshot fragment and precise gap with zero extra reads",async(t)=>{
  const {fixture,view,root}=await setup(t,true),task=fixture.tasks[0];
  task.details=task.details.replace("> [!faq]- 详细过程日志","> [!faq]- 详细过程日志\n\n> - [x] `2026-10-01 10:00:00 CST` 旧CST事件\n\n> - [x] `2026-10-01T11:00:00` 旧无时区事件\n\n> - [x] 无时间的独立事件\n");
  const before=fixture.tasks.map(task=>readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,task.id),"utf8"));
  const start=fixture.requests.length;await fixture.taskSnapshot(task.id);const baseline=fixture.requests.slice(start).map(({method,url})=>({method,url}));
  const viewStart=fixture.requests.length;await view.loadTask(task.id);assert.deepEqual(fixture.requests.slice(viewStart).map(({method,url})=>({method,url})),baseline);
  const panel=root.findByClass("flowdesk-task-current-progress")[0],text=panel.allText().join("\n");
  assert.ok(panel.allText().includes(fixture.largeProgress));assert.match(text,/最新性未知/);assert.match(text,/日期.*缺口|日期.*不完整/);assert.doesNotMatch(text,/生命周期未知/);
  assert.doesNotMatch(text,/当前 Progress \/ Next|Next（仅展示）|当前方案|核对中文文档/);assert.equal(panel.findByClass("flowdesk-content-source").length,1);
  const readStart=fixture.requests.length;view.renderShell();assert.equal(fixture.requests.length,readStart);
  assert.deepEqual(fixture.tasks.map(task=>readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,task.id),"utf8")),before);
  fixture.setWrongIdentity(true);await view.refreshCurrentTask();assert.equal(root.findByClass("flowdesk-task-current-progress").length,0,"source mismatch rejects the entire snapshot before the Progress panel");assert.ok(!root.allText().includes(fixture.largeProgress));
  assert.ok(fixture.requests.every(request=>request.method==="GET"||(request.method==="POST"&&request.url==="/api/tasks/query")));
});
