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
