import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { TestElement } from "./support/dom.ts";
import { ownedEnvironment, compilePlugin, CORE_ROOT } from "./support/owned-environment.ts";
import { buildSnapshotInvocation } from "../src/snapshot-invocation.ts";
import { TaskContentRenderer } from "../src/task-content-renderer";
import { renderTaskOverview } from "../src/task-overview";
import { createDashboardViewModel } from "../src/snapshot-model";
const details=readFileSync("tests/fixtures/plain-requirements.md","utf8");
const requirementLines=details.match(/## Requirements[\s\S]*?(?=\n## )/)![0].split("\n").filter(x=>x.startsWith("- "));

async function setup(t:any) {
  const fixture=await ownedEnvironment(t); const taskPath="Tasks/Owned 中文.md";
  let currentDetails=details; let slow=false; let release:(()=>void)|null=null;
  const requests:any[]=[];
  const {url}=await fixture.server(async(req,res)=>{
    requests.push([req.method,req.url,req.headers.authorization]);res.setHeader("Content-Type","application/json");
    if(req.url==="/api/filter-options"){res.end(JSON.stringify({data:{statuses:[{value:"done",isCompleted:true},{value:"open",isCompleted:false}]}}));return;}
    if(req.url==="/api/tasks/query"){res.end(JSON.stringify({tasks:[],filtered:0}));return;}
    const id=decodeURIComponent(req.url!.slice("/api/tasks/".length));
    if(slow && (!req.headers["user-agent"] || req.headers["user-agent"].startsWith("node"))) await new Promise<void>(resolve=>{release=resolve;});
    res.end(JSON.stringify({success:true,data:{id,path:id,title:id,status:"done",projects:[],tags:["reviewed"],details:currentDetails}}));
  });
  const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);
  const Plugin=createRequire(import.meta.url)(bundle).default;
  const plugin=new Plugin();const root=new TestElement(); const opens:any[]=[],leaves:Array<false|"tab">=[];
  const files=new Set([taskPath,"Tasks/Other.md"]);let view:any;
  const addVaultFile=(filePath:string,text:string)=>{files.add(filePath);const absolute=path.join(fixture.env.OBSIDIAN_VAULT!,filePath);mkdirSync(path.dirname(absolute),{recursive:true});writeFileSync(absolute,text);return absolute;};
  plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(){},getAbstractFileByPath:(filePath:string)=>files.has(filePath)?{path:filePath,extension:"md"}:null,cachedRead:async(file:any)=>readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,file.path),"utf8")},metadataCache:{on(){},getFileCache(){return {};},getFirstLinkpathDest:(filePath:string)=>files.has(filePath)?{path:filePath,extension:"md"}:null},workspace:{on(){},onLayoutReady(){},getActiveFile:()=>null,getLeavesOfType:()=>view?[{view}]:[],getActiveViewOfType:()=>null,getLeaf:(leaf:false|"tab")=>({async openFile(file:any){leaves.push(leaf);opens.push(file.path);}}),async openLinkText(...args:any[]){leaves.push(args[2]);opens.push(args);}}};
  await plugin.onload();
  plugin.settings={flowdeskRoot:CORE_ROOT,workingDirectory:fixture.root,apiUrl:url,tasknotesEnv:'{"TASKNOTES_API_TOKEN":"controlled-token"}'};
  const allowTask=(id:string)=>{
    const invocation=buildSnapshotInvocation({flowdeskRoot:CORE_ROOT,taskPath:id,workingDirectory:fixture.root,apiUrl:url},"json");
    fixture.allowParentProducer([invocation.executable,...invocation.args],invocation.cwd);
  };
  allowTask(taskPath);allowTask("Tasks/Other.md");
  view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});
  t.after(()=>view.onClose());
  return {fixture,plugin,view,root,taskPath,requests,opens,leaves,addVaultFile,setDetails:(d:string)=>{currentDetails=d;},setSlow:()=>{slow=true;},release:()=>{release?.();},hasWaiting:()=>!!release};
}

test("plain_requirements_remain_available_in_full_api_data via compiled Dashboard and real producer, zero writes",async(t)=>{
  const {view,root,taskPath,requests,opens}=await setup(t);
  await view.loadTask(taskPath);
  const model=view.taskAdapter.getRenderState().snapshot;
  assert.deepEqual(model.contract.task_contract.requirements,[]);
  assert.ok(!model.contract.task_contract.domain_sections.some((x:any)=>x.heading==="Requirements"));
  await view.refreshCurrentTask();
  await root.findByClass("flowdesk-current-task-link")[0].click();
  assert.deepEqual(opens,[taskPath]);
  await view.loadRawTaskContent(taskPath);
  const deadline=Date.now()+2000;
  while(view.rawContentLoading && Date.now()<deadline) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(view.rawContentLoading,false);
  for(const line of requirementLines)assert.ok(view.rawTaskContent.details.includes(line),line);
  assert.equal(requirementLines.length,8);
  assert.equal(view.rawTaskContent.source,"tasknotes-api");
  assert.equal(view.rawTaskContent.taskId,taskPath);
  assert.equal(root.findByClass("flowdesk-raw-content").length,0);
  assert.doesNotMatch(root.allText().join("\n"),/证据有效|验收通过|复核任务/);
  assert.equal(typeof view.plugin.submitTaskReview,"undefined");
  assert.ok(requests.every(x=>x[0]==="GET"||(x[0]==="POST"&&x[1]==="/api/tasks/query")));
  assert.ok(requests.every(x=>x[2]==="Bearer controlled-token"));
});

test("raw empty, error and changed observations never overwrite status or upgrade snapshot health",async(t)=>{
  const {view,root,taskPath,setDetails}=await setup(t);
  await view.loadTask(taskPath);setDetails("");await view.loadRawTaskContent(taskPath);
  assert.equal(view.rawTaskContent.details,"");
  assert.equal(view.rawTaskContent.error,null);
  assert.match(root.allText().join("\n"),/snapshot.*差异|snapshot.*变化/);
  assert.equal(view.taskAdapter.getRenderState().snapshot.current_task.status,"done");
});

test("late API response is discarded after task switch",async(t)=>{
  const {view,root,taskPath,setSlow,release,hasWaiting}=await setup(t);
  await view.loadTask(taskPath);setSlow();
  const old=view.loadRawTaskContent(taskPath);
  while(!hasWaiting()) await new Promise(resolve=>setImmediate(resolve));
  await view.loadTask("Tasks/Other.md");release();await old;
  assert.ok(!root.allText().includes(taskPath));
  assert.equal(view.rawTaskContent,null);
});

async function clickWithModifiers(element:TestElement,modifiers:{metaKey?:boolean;ctrlKey?:boolean}={}) {
  let stopped=false,prevented=false;
  const event={target:element,...modifiers,preventDefault(){prevented=true;},stopPropagation(){stopped=true;},stopImmediatePropagation(){stopped=true;}};
  for(let current:TestElement|null=element;current&&!stopped;current=current.parentElement)for(const handler of current.listeners.get("click")??[])await handler(event);
  await new Promise(resolve=>setImmediate(resolve));
  return prevented;
}

test("compiled intercepted Markdown vault files preserve modifiers while native Markdown and wiki links stay delegated",async t=>{
  const h=await setup(t);h.addVaultFile(h.taskPath,details);
  const exactPath="Docs/字面#文件.md",normalPath="Docs/Normal.md";
  const exact=h.addVaultFile(exactPath,"准确原文件"),normal=h.addVaultFile(normalPath,"## Heading\n正文");
  await h.view.loadTask(h.taskPath);
  for(const [raw,expected] of [[pathToFileURL(exact).href,exactPath],[`${pathToFileURL(normal).href}#Heading`,[`${normalPath}#Heading`,h.taskPath,"tab"]]] as const) {
    const body=h.root.createDiv();await h.view.renderSourceMarkdown(`[资料](<${raw}>)`,body,h.taskPath);
    assert.equal(await clickWithModifiers(body.querySelectorAll("a")[0],{ctrlKey:true}),true);
    assert.deepEqual(h.opens.pop(),expected);assert.equal(h.leaves.pop(),"tab");
    assert.equal(await clickWithModifiers(body.querySelectorAll("a")[0]),true);
    const regularExpected=Array.isArray(expected)?[`${normalPath}#Heading`,h.taskPath,false]:expected;
    assert.deepEqual(h.opens.pop(),regularExpected);assert.equal(h.leaves.pop(),false);
  }
  const nativeBody=h.root.createDiv();await h.view.renderSourceMarkdown(`[资料](${normalPath}#Heading) [[${normalPath}#Heading|Wiki]]`,nativeBody,h.taskPath);
  for(const anchor of nativeBody.querySelectorAll("a"))assert.equal(await clickWithModifiers(anchor,{metaKey:true}),false);
  assert.deepEqual(h.opens,[]);assert.deepEqual(h.leaves,[]);
  const resolve=h.plugin.app.vault.getAbstractFileByPath;
  h.plugin.app.vault.getAbstractFileByPath=(filePath:string)=>filePath===exactPath?{path:"Docs/Decoy.md",extension:"md"}:resolve(filePath);
  const wrong=h.root.createDiv();await h.view.renderSourceMarkdown(`[原文件](<${pathToFileURL(exact).href}>)`,wrong,h.taskPath);
  await clickWithModifiers(wrong.querySelectorAll("a")[0],{metaKey:true});
  assert.deepEqual(h.opens,[]);assert.deepEqual(h.leaves,[]);
  assert.match(h.view.relatedTargetPanel.allText().join(" "),/不会创建或改选同名笔记/);
});

test("compiled diagnostic source click selects a tab without positioning a different active file",async t=>{
  const h=await setup(t);h.addVaultFile(h.taskPath,details);await h.view.loadTask(h.taskPath);
  const record=h.view.taskAdapter.getRenderState().snapshot.current_task.records.execution[0];
  assert.ok(record.source);
  const cursors:any[]=[];
  h.plugin.app.workspace.getActiveViewOfType=()=>({file:{path:"Tasks/Other.md"},editor:{lineCount:()=>100,getValue:()=>details,setCursor:(position:any)=>cursors.push(position)}});
  const card=h.root.createDiv();h.view.renderPrimaryDiagnostic(card,{tone:"warning",title:"查看来源",reason:"核对原文",remediation:"查看",location:"执行",diagnostic:{taskId:h.taskPath,source:record.source}},"Owned",h.taskPath);
  await clickWithModifiers(card.findByClass("flowdesk-diagnostic-link")[0],{metaKey:true});
  const deadline=Date.now()+2000;while(!h.opens.length&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.opens.pop(),h.taskPath);assert.equal(h.leaves.pop(),"tab");assert.deepEqual(cursors,[]);
});

async function sourceFixture(t:any) {
  const h=await setup(t),withProgress=details+"\n\n## Progress\n> [!faq]- 详细过程日志\n> - [x] `2026-10-01T01:00:00Z` 已读取原文。\n>   下一步：核对来源。\n";
  h.setDetails(withProgress);h.addVaultFile(h.taskPath,withProgress);await h.view.loadTask(h.taskPath);
  const model=createDashboardViewModel(h.view.taskAdapter.getRenderState().snapshot,{expectedTaskPath:h.taskPath});
  return {...h,model};
}

test("Task body source action carries modifiers through accurate source validation",async t=>{
  const h=await sourceFixture(t),model=h.model;
  const body=h.root.createDiv();
  new TaskContentRenderer({showSourceActions:true,renderMarkdown:(text,element,taskPath)=>h.view.renderSourceMarkdown(text,element,taskPath),openSource:(taskPath,section,event?:any)=>h.view.openSnapshotSource(taskPath,section.source,section.heading,section.text,event)}).render(body as unknown as HTMLElement,model.content);
  const recordSource=body.findByClass("flowdesk-record-round")[0].findByClass("flowdesk-content-source")[0];assert.ok(recordSource);
  await clickWithModifiers(recordSource,{ctrlKey:true});
  const deadline=Date.now()+2000;while(!h.opens.length&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.opens.pop(),h.taskPath);assert.equal(h.leaves.pop(),"tab");
});

test("Progress source action carries modifiers through accurate source validation",async t=>{
  const h=await sourceFixture(t),model=h.model;
  const overview=h.root.createDiv();renderTaskOverview(overview as unknown as HTMLElement,model,{showSourceActions:true,renderMarkdown:(text,element,taskPath)=>h.view.renderSourceMarkdown(text,element,taskPath),openSource:(taskPath,source,heading,text,event?:any)=>h.view.openSnapshotSource(taskPath,source,heading,text,event)});
  const progressSource=overview.findByClass("flowdesk-content-source")[0];assert.ok(progressSource,"healthy, identity-checked Progress exposes its original source");
  await clickWithModifiers(progressSource,{metaKey:true});
  const progressDeadline=Date.now()+2000;while(!h.opens.length&&Date.now()<progressDeadline)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.opens.pop(),h.taskPath);assert.equal(h.leaves.pop(),"tab");
});
