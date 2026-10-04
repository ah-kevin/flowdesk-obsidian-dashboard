import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TestElement } from "./support/dom.ts";
import { ownedEnvironment, compilePlugin, CORE_ROOT } from "./support/owned-environment.ts";
import { buildSnapshotInvocation } from "../src/snapshot-invocation.ts";
const details=readFileSync("tests/fixtures/plain-requirements.md","utf8");
const requirementLines=details.match(/## Requirements[\s\S]*?(?=\n## )/)![0].split("\n").filter(x=>x.startsWith("- "));

async function setup(t:any) {
  const fixture=await ownedEnvironment(t); const taskPath="Tasks/Owned 中文.md";
  let currentDetails=details; let slow=false; let release:(()=>void)|null=null;
  const requests:any[]=[];
  const {url}=await fixture.server(async(req,res)=>{
    requests.push([req.method,req.url,req.headers.authorization]);res.setHeader("Content-Type","application/json");
    if(req.url==="/api/tasks/query"){res.end(JSON.stringify({tasks:[],filtered:0}));return;}
    const id=decodeURIComponent(req.url!.slice("/api/tasks/".length));
    if(slow && (!req.headers["user-agent"] || req.headers["user-agent"].startsWith("node"))) await new Promise<void>(resolve=>{release=resolve;});
    res.end(JSON.stringify({success:true,data:{id,path:id,title:id,status:"done",projects:[],tags:["reviewed"],details:currentDetails}}));
  });
  const bundle=fixture.path("plugin.cjs");compilePlugin(bundle);
  const Plugin=createRequire(import.meta.url)(bundle).default;
  const plugin=new Plugin();const root=new TestElement(); const opens:any[]=[];
  plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on(){},getAbstractFileByPath:(path:string)=>({path,extension:"md"})},metadataCache:{on(){},getFileCache(){return {};}},workspace:{on(){},onLayoutReady(){},getActiveFile:()=>null,getLeavesOfType:()=>[],getLeaf:()=>({async openFile(file:any){opens.push(file.path);}}),async openLinkText(...args:any[]){opens.push(args);}}};
  await plugin.onload();
  plugin.settings={flowdeskRoot:CORE_ROOT,workingDirectory:fixture.root,apiUrl:url,tasknotesEnv:'{"TASKNOTES_API_TOKEN":"controlled-token"}'};
  const allowTask=(id:string)=>{
    const invocation=buildSnapshotInvocation({flowdeskRoot:CORE_ROOT,taskPath:id,workingDirectory:fixture.root,apiUrl:url},"json");
    fixture.allowParentProducer([invocation.executable,...invocation.args],invocation.cwd);
  };
  allowTask(taskPath);allowTask("Tasks/Other.md");
  const view=plugin.views.get("flowdesk-dashboard-view")({app:plugin.app,contentEl:root});
  t.after(()=>view.onClose());
  return {fixture,plugin,view,root,taskPath,requests,opens,setDetails:(d:string)=>{currentDetails=d;},setSlow:()=>{slow=true;},release:()=>{release?.();},hasWaiting:()=>!!release};
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
