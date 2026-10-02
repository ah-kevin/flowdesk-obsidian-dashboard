import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { buildTaskUpdate, sha256 } from "@flowdesk-test/task-update-details";
import { ownedEnvironment, CORE_ROOT } from "./owned-environment.ts";
import { buildWorkCaseSnapshotInvocation } from "../../src/work-case-invocation.ts";
const execAsync=promisify(execFile);

/** Real writer transform supplies owned API bodies; real Task/Case CLIs consume them. */
export async function resumeFixture(t:any, count=2) {
  const fixture=await ownedEnvironment(t),casePath="Notes/Sessions/Owned Case.md",contextTag="@Owned Case";
  const cwd=fixture.path("checkout");mkdirSync(path.join(cwd,"docs"),{recursive:true});writeFileSync(path.join(cwd,"docs/中文 空格 #1.md"),"仓库原文件\n");
  const base="## 目标\n\n完成中文任务。\n\n## Requirements\n\n- 原始普通需求。\n";
  const tasks=Array.from({length:count},(_,index)=>{
    const id=`Tasks/Owned ${index}.md`,done=index===1;
    let details=base,status="in-progress";
    if(done){const result=buildTaskUpdate(details,status,{task_id:id,operation_id:randomUUID(),expected:{task_id:id,status,details_sha256:sha256(details)},timestamp:"2026-10-02T12:00:00+08:00",checks:[],mode:"done",execution:"实现结果 **完整**",verification:"已运行受控验证。",delivery:"源码未安装。"});details=result.details;status=result.status;}
    else for(const [timestamp,next] of [["2026-10-02T11:00:00+08:00","旧下一步"],["2026-10-02T12:00:00+08:00","核对中文文档（最新）"]]) {
      const result=buildTaskUpdate(details,status,{task_id:id,operation_id:randomUUID(),expected:{task_id:id,status,details_sha256:sha256(details)},timestamp,checks:[],mode:"progress",progress:"已有进展",next});details=result.details;status=result.status;
    }
    const task={id,path:id,title:`Owned ${index}`,status,contexts:[contextTag],projects:[],tags:[],details,archived:false};
    const file=path.join(fixture.env.OBSIDIAN_VAULT!,id);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,("\ufeff---\nstatus: "+status+"\ncssclasses:\n  - wide\n---\n\n"+details).replace(/\n/g,"\r\n"));
    return task;
  });
  const caseText=`---\ntype: work-case\nstatus: active\nagent: codex\nagent_session_id: native-original-id\ndevice: old-device\ncwd: ${cwd}\nbranch: codex/2.0\nplans:\n  - 'docs/中文 空格 #1.md'\nsessions:\n  - 'Notes/History/导出.md'\n---\n\n## Goal\n\nCase目标原文。\n\n## Current\n\n> **做到哪了**: 已有进展\n> **下一步**: 继续读取\n\n## Context\n\n上下文原文 **不丢失**。\n\n## Summary\n\n摘要原文。\n\n## Decisions\n\n决策：保持只读。\n`;
  const absoluteCase=path.join(fixture.env.OBSIDIAN_VAULT!,casePath);mkdirSync(path.dirname(absoluteCase),{recursive:true});writeFileSync(absoluteCase,caseText);
  const requests:Array<{method:string;url:string;authorization?:string}>=[];
  let code=200,partial=false,wrongIdentity=false;
  const {url}=await fixture.server(async(req,res)=>{
    requests.push({method:req.method!,url:req.url!,authorization:req.headers.authorization});res.setHeader("Content-Type","application/json");
    if(code!==200){res.writeHead(code).end(JSON.stringify({error:"controlled API failure"}));return;}
    if(req.url==="/api/filter-options"){res.end(JSON.stringify({statuses:[{value:"in-progress",isCompleted:false},{value:"done",isCompleted:true}]}));return;}
    if(req.method==="POST"&&req.url==="/api/tasks/query"){
      let raw="";for await(const chunk of req)raw+=chunk;const query=JSON.parse(raw);const rows=query.children?.[0]?.property==="contexts"?tasks:[];
      res.end(JSON.stringify({tasks:rows,filtered:rows.length+(partial?1:0),hasMore:false}));return;
    }
    if(req.method!=="GET"){res.writeHead(405).end();return;}
    const id=decodeURIComponent(req.url!.slice("/api/tasks/".length));const task=tasks.find(x=>x.id===id);
    if(!task){res.writeHead(404).end();return;}
    res.end(JSON.stringify({success:true,data:wrongIdentity?{...task,id:"Tasks/wrong.md"}:task}));
  });
  const invocation=buildWorkCaseSnapshotInvocation({flowdeskRoot:CORE_ROOT,casePath,workingDirectory:fixture.env.OBSIDIAN_VAULT!,apiUrl:url,includeResumeBundle:true});
  const legacyInvocation=buildWorkCaseSnapshotInvocation({flowdeskRoot:CORE_ROOT,casePath,workingDirectory:fixture.env.OBSIDIAN_VAULT!,apiUrl:url});
  fixture.allowParentProducer([legacyInvocation.executable,...legacyInvocation.args],legacyInvocation.cwd);
  fixture.allowCommand([invocation.executable,...invocation.args],invocation.cwd);
  fixture.allowParentProducer([invocation.executable,...invocation.args],invocation.cwd);
  return {...fixture,casePath,absoluteCase,caseText,cwd,url,tasks,requests,invocation,
    async snapshot(){const result=await execAsync(invocation.executable,invocation.args,{cwd:invocation.cwd,env:fixture.env});return JSON.parse(result.stdout);},
    setCode:(value:number)=>{code=value;},setPartial:(value:boolean)=>{partial=value;},setWrongIdentity:(value:boolean)=>{wrongIdentity=value;},
    originalCase:()=>readFileSync(absoluteCase,"utf8"),
  };
}
