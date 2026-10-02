import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import test from "node:test";
import { buildSnapshotInvocation } from "../src/snapshot-invocation.ts";
import { validateSnapshotEnvelope } from "../src/dashboard-state.ts";
import { createDashboardViewModel } from "../src/snapshot-model.ts";
import { CORE_ROOT, ownedEnvironment } from "./support/owned-environment.ts";
const CLI=path.join(CORE_ROOT,"bin/flowdesk-execution-snapshot");
const execAsync=promisify(execFile);
const details=readFileSync("tests/fixtures/plain-requirements.md","utf8");

test("真实 producer CLI flags contract remains accepted without --vault", async(t)=>{
  const fixture=await ownedEnvironment(t);
  fixture.allowCommand([CLI,"--help"],CORE_ROOT);
  const help=execFileSync(CLI,["--help"],{cwd:CORE_ROOT,env:fixture.env,encoding:"utf8"});
  for(const format of ["json","dashboard"] as const){
    const invocation=buildSnapshotInvocation({flowdeskRoot:CORE_ROOT,taskPath:"Tasks/Owned.md",workingDirectory:fixture.root,apiUrl:"http://127.0.0.1:1"},format);
    for(const flag of invocation.args.filter(x=>x.startsWith("--")))assert.ok(help.includes(flag),flag);
  }
  assert.equal(help.includes("--vault"),false);
});

test("真实 controlled HTTP→producer→envelope/model/content preserves parent and multiple rounds",async(t)=>{
  const fixture=await ownedEnvironment(t);
  const root={id:"Tasks/Owned.md",path:"Tasks/Owned.md",title:"Owned",status:"in-progress",projects:[],details};
  const child={id:"Tasks/Child.md",path:"Tasks/Child.md",title:"Child",status:"done",projects:["Owned"],details:"## 目标\n\n子任务内容。"};
  const requests:string[]=[];
  const {url}=await fixture.server(async(req,res)=>{
    requests.push(`${req.method} ${req.url}`);res.setHeader("Content-Type","application/json");
    if(req.method==="POST"&&req.url==="/api/tasks/query") {res.end(JSON.stringify({success:true,data:{tasks:[child],filtered:1}}));return;}
    const id=decodeURIComponent(req.url!.replace("/api/tasks/",""));
    const task=id===root.id?root: id===child.id?child:null;
    if(!task){res.writeHead(404).end();return;}res.end(JSON.stringify({success:true,data:task}));
  });
  const invocation=buildSnapshotInvocation({flowdeskRoot:CORE_ROOT,taskPath:root.id,workingDirectory:fixture.root,apiUrl:url},"json");
  fixture.allowCommand([invocation.executable,...invocation.args],invocation.cwd);
  const result=await execAsync(invocation.executable,invocation.args,{env:fixture.env,cwd:invocation.cwd});
  const snapshot=JSON.parse(result.stdout);
  assert.equal(validateSnapshotEnvelope(snapshot,root.id),null);
  const model=createDashboardViewModel(snapshot,{expectedTaskPath:root.id});
  assert.equal(model.errorCode,null);assert.equal(model.observation.isTrustworthy,true);
  assert.equal(model.children.length,1);assert.equal(model.rollup.childrenTotal,1);
  assert.equal(model.content.records.execution.length,2);
  assert.ok(model.content.domainSections.some(x=>x.heading==="Review Record"));
  assert.deepEqual(model.content.requirements,[]);
  assert.ok(!model.content.domainSections.some(x=>x.heading==="Requirements"));
  assert.ok(requests.every(x=>x.startsWith("GET ")||x==="POST /api/tasks/query"));
});
