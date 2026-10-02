import assert from "node:assert/strict";
import test from "node:test";
import { readTaskDetails } from "../src/tasknotes-read.ts";
import { resolveTaskNotesAuth } from "../src/tasknotes-auth.ts";
import { ownedEnvironment } from "./support/owned-environment.ts";
const taskPath="Tasks/中文 空格 #.md";
const token='quoted-"token\\value';
const auth=resolveTaskNotesAuth(JSON.stringify({TASKNOTES_API_TOKEN:token}));
test("readonly_http_rejects_identity_and_envelope_errors", async (t) => {
  const fixture=await ownedEnvironment(t);
  let body:any;
  const requests:any[]=[];
  const {url}=await fixture.server((req,res)=>{
    requests.push([req.method,req.url,req.headers.authorization]);
    res.setHeader("Content-Type","application/json");res.end(JSON.stringify(body));
  });
  for (body of [{id:"wrong",details:"x"},{path:"wrong",details:"x"},{id:taskPath,path:"wrong",details:"x"},{details:"x"},{id:taskPath,details:4},{success:false,error:"echo "+token,data:{id:taskPath,details:"x"}}]) {
    await assert.rejects(readTaskDetails({taskPath,apiUrl:url,auth,signal:new AbortController().signal}), (error:any)=>{
      assert.equal(error.message.includes(token),false);return true;
    });
  }
  assert.ok(requests.every(x=>x[0]==="GET" && x[1]===`/api/tasks/${encodeURIComponent(taskPath)}` && x[2]===`Bearer ${token}`));
});
test("empty_details_is_a_successful_empty_observation and data/path envelopes work", async(t)=>{
  const fixture=await ownedEnvironment(t);
  const {url}=await fixture.server((req,res)=>res.end(JSON.stringify({success:true,data:{path:taskPath,details:"",status:"done"}})));
  const result=await readTaskDetails({taskPath,apiUrl:url,auth,signal:new AbortController().signal});
  assert.equal(result.id,taskPath);assert.equal(result.details,"");
  assert.equal(result.source.kind,"tasknotes-api");assert.equal(result.source.taskId,taskPath);
  assert.ok(Number.isFinite(Date.parse(result.source.readAt)));assert.equal("status" in result,false);
});
