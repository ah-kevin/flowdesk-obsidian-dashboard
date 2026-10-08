import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import {ownedEnvironment,compilePlugin,CORE_ROOT} from "./support/owned-environment";
import {buildWorkCaseSnapshotInvocation} from "../src/work-case-invocation";
import {buildSnapshotInvocation} from "../src/snapshot-invocation";
import {TestElement} from "./support/dom";

async function until(predicate:()=>boolean) {
 const deadline=Date.now()+4000;
 while(!predicate() && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(predicate(),true,"bounded consumer refresh did not settle");
}
async function setup(t:any, rootTitle="Root") {
 const fixture=await ownedEnvironment(t); const casePath="Notes/Sessions/Owned Case.md"; const context="@Owned Case";
 mkdirSync(path.join(fixture.env.OBSIDIAN_VAULT!,"Notes/Sessions"),{recursive:true});
 writeFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,casePath),`---\ntype: work-case\ntitle: Owned Case\nstatus: completed\nagent: codex-app\nproject: "[[Notes/Projects/Owned|项目]]"\n---\n## Current\n> **做到哪了**: 保留正文\n> **下一步**: 检查关联任务\n`);
 let tasks:any[]=[];let mode="normal";let queries=0; const requests:Array<[string,string,string|undefined]>=[];
 const taskRoot={id:"Tasks/Root.md",path:"Tasks/Root.md",title:rootTitle,status:"in-progress",projects:[],details:"## 目标\n保留原文"};
 const {url}=await fixture.server(async(req,res)=>{
  requests.push([req.method!,req.url!,req.headers.authorization]);res.setHeader("Content-Type","application/json");
  if(mode==="401"){res.writeHead(401).end(JSON.stringify({error:"unauthorized"}));return;}
  if(req.url==="/api/filter-options"){res.end(JSON.stringify({data:{statuses:[{value:"done",isCompleted:true},{value:"cancel",isCompleted:true},{value:"in-progress",isCompleted:false},{value:"open",isCompleted:false}]}}));return;}
  if(req.url==="/api/tasks/query"){queries++;res.end(JSON.stringify({data:{tasks,filtered:tasks.length,hasMore:mode==="partial"}}));return;}
  const id=decodeURIComponent(req.url!.slice("/api/tasks/".length));const task=id===taskRoot.id?taskRoot:tasks.find(x=>x.id===id);
  if(!task){res.writeHead(404).end(JSON.stringify({error:"absent"}));return;}res.end(JSON.stringify({success:true,data:task}));
 });
 const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);const Plugin=createRequire(import.meta.url)(bundle).default;
 const plugin=new Plugin();const root=new TestElement();const callbacks=new Map<string,Function>();const opens:Array<{path:string;leaf:false|"tab"}>=[];let active:any=null;let view:any;
 plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(event:string,callback:Function){callbacks.set(`vault:${event}`,callback);},getAbstractFileByPath:(p:string)=>({path:p,extension:"md"}),cachedRead:async(file:any)=>readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,file.path),"utf8")},metadataCache:{on(event:string,callback:Function){callbacks.set(`metadata:${event}`,callback);},getFileCache(file:any){return {frontmatter:{type:file.path===casePath?"work-case":"note"}};}},workspace:{on(){},onLayoutReady(){},getActiveFile:()=>active,getLeavesOfType:()=>view?[{view}]:[],getLeaf:(leaf:false|"tab")=>({async openFile(file:any){opens.push({path:file.path,leaf});}}),async openLinkText(){}}};
 await plugin.onload();
 plugin.settings={flowdeskRoot:CORE_ROOT,workingDirectory:fixture.root,apiUrl:url,tasknotesEnv:JSON.stringify({TASKNOTES_API_TOKEN:"owned-token",OBSIDIAN_VAULT:fixture.env.OBSIDIAN_VAULT})};
 const invocation=buildWorkCaseSnapshotInvocation({flowdeskRoot:CORE_ROOT,casePath,workingDirectory:fixture.env.OBSIDIAN_VAULT!,apiUrl:url,includeResumeBundle:true});
 fixture.allowParentProducer([invocation.executable,...invocation.args],invocation.cwd);
 const allowTask=(taskPath:string)=>{const taskInvocation=buildSnapshotInvocation({flowdeskRoot:CORE_ROOT,taskPath,workingDirectory:fixture.root,apiUrl:url},"json");fixture.allowParentProducer([taskInvocation.executable,...taskInvocation.args],taskInvocation.cwd);};
 allowTask(taskRoot.id);
 view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});t.after(()=>view.onClose());
 const file=(p:string)=>({path:p,extension:"md"});
 return {view,root,casePath,context,requests,file,opens,allowTask,setActive:(p:string)=>{active=file(p);},setTasks:(value:any[])=>{tasks=value;},setMode:(value:string)=>{mode=value;},queries:()=>queries,
  event:(event:string,p:string,old?:string)=>{const callback=callbacks.get(event);assert.ok(callback,`event registered: ${event}`);return callback(file(p),old);}};
}
function task(id:string,status:string,context:string,extra:any={}){return {id,path:id,title:id,status,contexts:[context],projects:["Root"],details:"## 目标\n逐字内容",...extra};}

test("compiled Case observes Task association create/modify/delete/rename/metadata bursts with real producer",async(t)=>{
 const h=await setup(t);h.setActive(h.casePath);
 h.setTasks([task("Tasks/Done.md","done",h.context,{blockedBy:["Tasks/Past.md"],isBlocked:false}),task("Tasks/Running.md","in-progress",h.context)]);
 await h.view.syncToActiveFile(h.file(h.casePath));
 assert.ok(h.view.caseAdapter.getRenderState().model,h.view.caseAdapter.getRenderState().error);
 assert.equal(h.view.caseAdapter.getRenderState().model.workCase.status,"completed");
 assert.deepEqual(h.view.caseAdapter.getRenderState().model.tasks.items.map((x:any)=>x.status),["done","in-progress"]);
 const initial=h.queries();
 h.setTasks([task("Tasks/Running.md","done",h.context),task("Tasks/Incoming.md","open",h.context)]);
 for(const event of ["vault:create","vault:modify","vault:delete","metadata:changed"])h.event(event,"Tasks/Incoming.md");
 // Rename old Task -> non Task must also invalidate through the old path.
 h.event("vault:rename","Notes/Moved.md","Tasks/Done.md");
 assert.match(h.view.caseAdapter.getRenderState().staleReason,/变化/);
 await until(()=>h.queries()>initial && !h.view.caseAdapter.getRenderState().loading && !h.view.caseAdapter.getRenderState().staleReason);
 assert.equal(h.queries(),initial+1,"one producer query for coalesced burst");
 assert.deepEqual(h.view.caseAdapter.getRenderState().model.tasks.items.map((x:any)=>x.id),["Tasks/Running.md","Tasks/Incoming.md"]);
 assert.deepEqual(h.root.findByClass("flowdesk-case-task-title-text").map(x=>x.text),["Tasks/Incoming.md","Tasks/Running.md"]);
 h.setTasks([task("Tasks/Unknown.md","custom-state",h.context)]);
 h.event("vault:rename","Tasks/Unknown.md","Notes/New association.md");
 await until(()=>h.queries()>initial+1 && !h.view.caseAdapter.getRenderState().loading && !h.view.caseAdapter.getRenderState().staleReason);
 assert.match(h.root.allText().join(" "),/custom-state（未知状态）/);
 assert.ok(!h.root.allText().includes("没有关联任务。"));
 const count=h.queries();h.event("vault:modify","Tasks/Unknown.md");
 await h.view.syncToActiveFile(h.file("Notes/Unrelated.md"));
 assert.equal(h.view.caseAdapter.getRenderState(),null);
 await new Promise(resolve=>setTimeout(resolve,550));assert.equal(h.queries(),count);
 assert.ok(!h.root.allText().includes("Owned Case"));
 assert.ok(h.requests.every(([method,url])=>method==="GET" || method==="POST"&&url==="/api/tasks/query"));
 assert.ok(h.requests.every(([, ,auth])=>auth==="Bearer owned-token"));
});

test("compiled read-only Case partial and 401 preserve body without healthy empty success",async(t)=>{
 const h=await setup(t);h.setActive(h.casePath);h.setMode("partial");
 await h.view.syncToActiveFile(h.file(h.casePath));
 assert.ok(h.view.caseAdapter.getRenderState().model,h.view.caseAdapter.getRenderState().error);
 assert.equal(h.view.caseAdapter.getRenderState().model.tasks.observationHealth,"degraded");
 assert.equal(h.view.caseAdapter.getRenderState().model.tasks.counts.total,null);
 assert.doesNotMatch(h.root.allText().join(" "),/来源读取完整|没有关联任务|0 \/ 0/);
 assert.ok(h.root.allText().join(" ").includes("保留正文"));
 h.setMode("401");await h.view.caseAdapter.refresh();
 assert.equal(h.view.caseAdapter.getRenderState().model.tasks.observationHealth,"unavailable");
 assert.doesNotMatch(h.root.allText().join(" "),/来源读取完整|没有关联任务|0 \/ 0/);
 assert.ok(h.root.allText().join(" ").includes("Owned Case"));
});

test("compiled Task keeps done and cancel ended subtrees separate from successful progress",async(t)=>{
 const h=await setup(t);h.setTasks([task("Tasks/Done.md","done",h.context,{blockedBy:["Tasks/Past.md"],isBlocked:false}),task("Tasks/Cancel.md","cancel",h.context,{blockedBy:["Tasks/Past.md"],isBlocked:true}),task("Tasks/Running.md","in-progress",h.context)]);
 await h.view.loadTask("Tasks/Root.md");
 const rows=h.root.findByClass("flowdesk-child-title").map(x=>x.text);
 assert.deepEqual(rows,["Tasks/Running.md","Tasks/Done.md","Tasks/Cancel.md"]);
 assert.equal(h.root.findByClass("flowdesk-task-history")[0].open,false);
 assert.match(h.root.allText().join(" "),/历史依赖 Past/);
 assert.match(h.root.allText().join(" "),/成功 1\/3.*已结束 2\/3/);
 assert.equal(h.root.findByClass("flowdesk-child-row").filter(row=>row.classes.has("is-error")).length,0);
 assert.equal(h.root.findByClass("flowdesk-task-history")[0].findByClass("flowdesk-child-row").length,2);
 assert.doesNotMatch(h.root.allText().join(" "),/可信完成|验收通过|阻塞于 Past/);
 assert.match(h.root.allText().join(" "),/来源读取完整/);
 const classes=h.root.findByClass("flowdesk-dashboard-layout")[0].children.map(x=>[...x.classes].join(" ")).join("|");
 assert.match(classes,/flowdesk-task-header.*flowdesk-trust-summary.*flowdesk-task-overview.*flowdesk-child-section.*flowdesk-contract-summary/);
});

test("compiled nested Task shows its complete parent context and makes entering descendants explicit",async t=>{
 const parentTitle="完整父任务名称：Dashboard使用体验修复与导航层级说明";
 const h=await setup(t,parentTitle);
 h.setTasks([task("Tasks/Child.md","in-progress",h.context,{title:"Child"}),task("Tasks/Grandchild.md","open",h.context,{title:"Grandchild",projects:["Child"]})]);
 h.allowTask("Tasks/Child.md");
 await h.view.loadTask("Tasks/Child.md");
 assert.ok(h.root.findByClass("flowdesk-parent-link")[0].text.includes(parentTitle),"parent name is visible without hovering");
 assert.ok(h.root.findByClass("flowdesk-task-context-label")[0].text.includes("当前任务"));
 assert.equal(h.root.findByClass("flowdesk-current-task-link")[0].text,"Child");
 await h.root.findByClass("flowdesk-parent-link")[0].click();
 assert.deepEqual(h.opens.pop(),{path:"Tasks/Root.md",leaf:false});
 await h.view.loadTask("Tasks/Root.md");
 const row=h.root.findByClass("flowdesk-child-row")[0];
 assert.match(row.allText().join(" "),/含后代.*进入子任务页/);
 assert.deepEqual(h.root.findByClass("flowdesk-child-title").map(x=>x.text),["Child"],"only direct children are expanded here");
 await row.click();assert.deepEqual(h.opens.pop(),{path:"Tasks/Child.md",leaf:false});
 for(const handler of row.listeners.get("click")??[])await handler({metaKey:true,preventDefault(){}});
 assert.deepEqual(h.opens.pop(),{path:"Tasks/Child.md",leaf:"tab"});
});
