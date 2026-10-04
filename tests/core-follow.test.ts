import assert from "node:assert/strict";
import {mkdirSync,writeFileSync,chmodSync} from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import test from "node:test";
import {ownedEnvironment,compilePlugin,allowOwnedProducer} from "./support/owned-environment.ts";
const require=createRequire(import.meta.url);
function core(root:string,version:string){
  mkdirSync(path.join(root,"bin"),{recursive:true});mkdirSync(path.join(root,".claude-plugin"),{recursive:true});
  for(const name of ["flowdesk-execution-snapshot","flowdesk-work-case-snapshot"]){writeFileSync(path.join(root,"bin",name),"#!/bin/sh\nexit 99\n");chmodSync(path.join(root,"bin",name),0o755);}
  writeFileSync(path.join(root,".claude-plugin/plugin.json"),JSON.stringify({name:"flow-desk",version}));return root;
}
async function plugin(t:any){const f=await ownedEnvironment(t);const output=f.path("plugin.cjs");compilePlugin(output);const Plugin=require(output).default;const p=new Plugin();p.app={vault:{adapter:{getBasePath:()=>f.env.OBSIDIAN_VAULT}}};return {f,p};}
test("installed mode rereads Claude registration after an upgrade and shares its actual version",async t=>{
  const {f,p}=await plugin(t);const previous=process.env.HOME;process.env.HOME=f.env.HOME;t.after(()=>{process.env.HOME=previous;});
  const first=core(f.path("core-2.0.4"),"2.0.4"),second=core(f.path("core-2.0.5"),"2.0.5");
  const registry=path.join(f.env.HOME!,".claude/plugins/installed_plugins.json");mkdirSync(path.dirname(registry),{recursive:true});
  const save=(root:string,version:string)=>writeFileSync(registry,JSON.stringify({version:2,plugins:{"flow-desk@flowdesk-marketplace":[{scope:"user",installPath:root,version}]}}));
  p.settings={coreMode:"installed",flowdeskRoot:"",workingDirectory:"",tasknotesEnv:"{}",apiUrl:""};
  save(first,"2.0.4");assert.equal(p.createSnapshotInvocation("Tasks/Owned.md","json").executable,path.join(first,"bin/flowdesk-execution-snapshot"));
  save(second,"2.0.5");assert.equal(p.createWorkCaseSnapshotInvocation("Notes/Sessions/Owned.md").executable,path.join(second,"bin/flowdesk-work-case-snapshot"));
  assert.equal(p.coreResolution.version,"2.0.5");assert.equal(p.coreResolution.source,"claude-installed");
});
test("fixed mode refuses an invalid explicit path instead of silently choosing the environment Core",async t=>{
  const {f,p}=await plugin(t);p.settings={coreMode:"fixed",flowdeskRoot:f.path("missing"),workingDirectory:"",tasknotesEnv:"{}",apiUrl:""};
  assert.throws(()=>p.createSnapshotInvocation("Tasks/Owned.md","json"),/固定|不存在|无效/);
});
test("Codex fallback selects numeric stable versions and identifies the cache source",async t=>{
  const {f,p}=await plugin(t);const previous=process.env.HOME;process.env.HOME=f.env.HOME;t.after(()=>{process.env.HOME=previous;});
  const cache=path.join(f.env.HOME!,".codex/plugins/cache/flowdesk-marketplace/flow-desk");
  core(path.join(cache,"2.0.9"),"2.0.9");const wanted=core(path.join(cache,"2.0.10"),"2.0.10");core(path.join(cache,"99.0.0-beta"),"99.0.0-beta");
  p.settings={coreMode:"installed",flowdeskRoot:"",workingDirectory:"",tasknotesEnv:"{}",apiUrl:""};
  assert.equal(p.createSnapshotInvocation("Tasks/Owned.md","json").executable,path.join(wanted,"bin/flowdesk-execution-snapshot"));
  assert.equal(p.coreResolution.source,"codex-cache");
});

test("the Core that produced an existing snapshot survives a later failed resolution and invocation",async t=>{
  const {f,p}=await plugin(t);const first=core(f.path("old-core"),"2.0.4"),second=core(f.path("new-core"),"2.0.5");
  writeFileSync(path.join(first,"bin/flowdesk-execution-snapshot"),'#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({source:{task_id:"Tasks/Owned.md"}}));\n',{mode:0o755});
  p.settings={coreMode:"fixed",flowdeskRoot:first,workingDirectory:f.root,tasknotesEnv:"{}",apiUrl:""};
  for(const root of [first,second]){p.settings.flowdeskRoot=root;const invocation=p.createSnapshotInvocation("Tasks/Owned.md","json");allowOwnedProducer(invocation.executable,invocation.args,invocation.cwd);}
  p.settings.flowdeskRoot=first;const snapshot=await p.loadSnapshot("Tasks/Owned.md",new AbortController().signal);
  p.settings.flowdeskRoot=second;await assert.rejects(p.loadSnapshot("Tasks/Owned.md",new AbortController().signal));
  assert.equal(p.coreResolution.version,"2.0.5");
  assert.equal((p.snapshotCoreInfo?.(snapshot)??p.coreResolution).version,"2.0.4");
});
