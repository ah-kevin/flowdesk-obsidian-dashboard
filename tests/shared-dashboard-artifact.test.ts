import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {readFileSync,realpathSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {ownedEnvironment,updateCapabilities} from "./support/owned-environment";

test("shared artifact builds offline browser and model exports with verified bytes",async t=>{
  const owned=await ownedEnvironment(t),out=owned.path("ui-dist"),root=process.cwd();
  const node=realpathSync(process.execPath),esbuild=process.env.FLOWDESK_TEST_ESBUILD!;
  const entry=path.join(root,"scripts/build-dashboard-ui.mjs"),args=[entry,"--out-dir",out];
  const commands=[
    {executable:node,args,cwd:root},
    ...[["browser","browser","iife"],["model","node","esm"],["index","browser","esm"]].map(([name,platform,format])=>({
      executable:esbuild,args:[path.join(root,"packages/dashboard-ui/src",name+".ts"),"--bundle","--platform="+platform,"--format="+format,"--target=es2018",...(name==="browser"?["--global-name=FlowDeskDashboardUI"]:[]),"--outfile="+path.join(out,name+".js"),"--metafile="+path.join(out,name+"-meta.json")],cwd:root})),
    {executable:node,args:[path.join(root,"node_modules/typescript/bin/tsc"),"-p",path.join(root,"packages/dashboard-ui/tsconfig.json"),"--outDir",out],cwd:root}
  ];
  updateCapabilities(process.env.FLOWDESK_TEST_CAPS!,data=>data.commands.push(...commands));
  const result=spawnSync(node,args,{env:process.env,encoding:"utf8"});
  assert.equal(result.status,0,"shared artifact must build: "+result.stderr);
  const metadata=JSON.parse(readFileSync(path.join(out,"artifact.json"),"utf8"));
  assert.equal(metadata.displayProtocol,"association-dashboard/1");
  for(const file of ["browser.js","model.js","index.js","styles.css"]){
    assert.equal(metadata.sha256[file],createHash("sha256").update(readFileSync(path.join(out,file))).digest("hex"));
  }
  const browserMeta=JSON.parse(readFileSync(path.join(out,"browser-meta.json"),"utf8"));
  assert.equal(Object.values(browserMeta.outputs).some((value:any)=>value.imports.some((x:any)=>x.external)),false);
  assert.equal(Object.keys(browserMeta.inputs).some(x=>x.includes("obsidian")||x.includes("src/main.ts")),false);
  const second=spawnSync(node,args,{env:process.env,encoding:"utf8"});
  assert.equal(second.status,0);
  assert.deepEqual(JSON.parse(readFileSync(path.join(out,"artifact.json"),"utf8")).sha256,metadata.sha256);
});
