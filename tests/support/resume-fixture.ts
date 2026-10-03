import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildSnapshotInvocation } from "../../src/snapshot-invocation.ts";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { buildTaskUpdate, sha256 } from "@flowdesk-test/task-update-details";
import { ownedEnvironment, CORE_ROOT } from "./owned-environment.ts";
import { buildWorkCaseSnapshotInvocation } from "../../src/work-case-invocation.ts";
const execAsync=promisify(execFile);

/** Real writer transform supplies owned API bodies; real Task/Case CLIs consume them. */
export async function resumeFixture(t:any, count=2, reading=false, references: "valid"|"gaps"|null=null) {
  const fixture=await ownedEnvironment(t),casePath="Notes/Sessions/Owned Case.md",contextTag="@Owned Case";
  const cwd=fixture.path("checkout");mkdirSync(path.join(cwd,"docs"),{recursive:true});writeFileSync(path.join(cwd,"docs/中文 空格 #1.md"),"仓库原文件\n");
  const base="## 目标\n\n完成中文任务。\n\n## Requirements\n\n- 原始普通需求。\n";
  const history="\n## Execution Result\n\n早期执行原文。\n\n### 实施说明\n\n普通H3原文。\n\n## Verification Result\n\n早期验证原文。\n\n## 人工说明\n\n人工说明原文。\n\n## Delivery Record\n\n早期未实施（历史原文）。\n\n## 执行清单\n\n- [ ] 写后通知（旧项原文）。\n";
  const largeProgress="最新 **进展**\n"+"受控长正文与证据。".repeat(450)+"\n```ts\nconst value = 1;\n```";
  const currentNext=`[当前方案](<${pathToFileURL(path.join(cwd,"docs/中文 空格 #1.md")).href}#Heading>)\n- 保持下一步的多行原文\n\n\`\`\`md\n下一步：代码围栏中的文字\n\`\`\``;
  const tasks=Array.from({length:count},(_,index)=>{
    const id=`Tasks/Owned ${index}.md`,done=index===1;
    let details=base+(reading?history:""),status="in-progress";
    if(done){const result=buildTaskUpdate(details,status,{task_id:id,operation_id:randomUUID(),expected:{task_id:id,status,details_sha256:sha256(details)},timestamp:"2026-10-02T12:00:00+08:00",checks:[],mode:"done",execution:"实现结果 **完整**",verification:"已运行受控验证。",delivery:"源码未安装。"});details=result.details;status=result.status;}
    else for(const [timestamp,next] of [["2026-10-02T11:00:00+08:00","旧下一步"],["2026-10-02T12:00:00+08:00","核对中文文档（最新）"]]) {
      const result=buildTaskUpdate(details,status,{task_id:id,operation_id:randomUUID(),expected:{task_id:id,status,details_sha256:sha256(details)},timestamp,checks:[],mode:"progress",progress:"已有进展",next});details=result.details;status=result.status;
    }
    if(reading&&!done)for(const [timestamp,progress,next] of [["2026-10-03T13:00:00+09:00",largeProgress,currentNext],["2026-10-03T11:30:00+08:00","时钟较早的后写事件","不可冒充最新的Next"]]) {
      const result=buildTaskUpdate(details,status,{task_id:id,operation_id:randomUUID(),expected:{task_id:id,status,details_sha256:sha256(details)},timestamp,checks:[],mode:"progress",progress,next});details=result.details;status=result.status;
    }
    const task={id,path:id,title:`Owned ${index}`,status,contexts:[contextTag],projects:[],tags:[],details,archived:false};
    const file=path.join(fixture.env.OBSIDIAN_VAULT!,id);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,("\ufeff---\nstatus: "+status+"\ncssclasses:\n  - wide\n---\n\n"+details).replace(/\n/g,"\r\n"));
    return task;
  });
  let referenceFixture: null | {plans:string[];docs:string[];related:string[];vaultPaths:string[];legacy:string;bracketPlans:string[];wiki:string;markdown:string;markdownPath:string;index:string;indexPath:string;jsonPath:string;missing:string;missingPath:string;invalid:string;decoyPath:string;rawSpaceRefs:string[];rawSpaceDecoys:string[]} = null;
  if(references){
    const vaultRoot=fixture.env.OBSIDIAN_VAULT!;
    const bracketPlans=["[owner](draft).md","[[owner]].md"];
    for(const raw of bracketPlans)writeFileSync(path.join(cwd,raw),"# Owned raw filename\n准确字面文件身份\n");
    const legacy="docs/legacy-plan.md",wiki="[[Notes/Plans/Vault plan.md#Decision|Vault方案]]";
    const markdownPath=path.join(cwd,"docs/中文 空格 (计划) %23 #.md"),indexPath=path.join(cwd,"docs/证据索引.md"),jsonPath=fixture.path("运行证据.json");
    const markdown=`[编码实施方案（中文）](<${pathToFileURL(markdownPath).href}#Heading%20one>)`,index=`[受控证据索引](<${pathToFileURL(indexPath).href}>)`;
    const missingPath=path.join(cwd,"docs/%41GENTS.md"),decoyPath=path.join(cwd,"docs/AGENTS.md"),missing=`[缺失字面百分号计划](<${pathToFileURL(missingPath).href}>)`,invalid=`[无效查询参数计划](<${pathToFileURL(markdownPath).href}?query=1>)`;
    writeFileSync(path.join(cwd,legacy),"# Legacy plan\n准确旧路径\n");writeFileSync(markdownPath,"# 编码实施方案（中文）\n\n## Heading one\n准确编码目标\n");writeFileSync(indexPath,`# 受控证据索引\n\n原始证据：${jsonPath}\n`);writeFileSync(jsonPath,'{"owned":true,"immutable_evidence":"original"}\n');writeFileSync(decoyPath,"WRONG DECODE TARGET MUST NOT BE OPENED\n");
    const vaultPaths=["Notes/Plans/Vault plan.md","Notes/Projects/Owned References.md"];
    for(const relative of vaultPaths)mkdirSync(path.dirname(path.join(vaultRoot,relative)),{recursive:true});
    writeFileSync(path.join(vaultRoot,vaultPaths[0]),"# Vault plan\n\n## Decision\n准确vault资料\n");writeFileSync(path.join(vaultRoot,vaultPaths[1]),`---\ntype: project\ncode_path: ${JSON.stringify(cwd)}\n---\n\n## Context\n受控项目背景。\n`);
    const rawSpaceDecoys=[path.join(cwd,"docs/尾空格.md"),path.join(cwd,"leading.md")],rawSpaceRefs=[rawSpaceDecoys[0]+" "," leading.md"];
    for(const decoy of rawSpaceDecoys)writeFileSync(decoy,"WRONG TRIMMED TARGET MUST NOT BE OPENED\n");
    referenceFixture={plans:[legacy,...bracketPlans,wiki,markdown,...(references==="gaps"?[missing,invalid,...rawSpaceRefs]:[])],docs:[index],related:[jsonPath],vaultPaths,legacy,bracketPlans,wiki,markdown,markdownPath,index,indexPath,jsonPath,missing,missingPath,invalid,decoyPath,rawSpaceRefs,rawSpaceDecoys};
  }
  const referencesYaml=referenceFixture?`project: "[[Notes/Projects/Owned References]]"\nplans:\n${referenceFixture.plans.map(value=>"  - "+JSON.stringify(value)).join("\n")}\ndocs:\n${referenceFixture.docs.map(value=>"  - "+JSON.stringify(value)).join("\n")}\nrelated:\n${referenceFixture.related.map(value=>"  - "+JSON.stringify(value)).join("\n")}`:"plans:\n  - 'docs/中文 空格 #1.md'";
  const caseText=`---\ntype: work-case\nstatus: active\nagent: codex\nagent_session_id: native-original-id\ndevice: old-device\ncwd: ${cwd}\nbranch: codex/2.0\n${referencesYaml}\nsessions:\n  - 'Notes/History/导出.md'\n---\n\n## Goal\n\nCase目标原文。\n\n## Current\n\n> **做到哪了**: 已有进展\n> **下一步**: 继续读取\n\n## Context\n\n上下文原文 **不丢失**。\n\n## Summary\n\n摘要原文。\n\n## Decisions\n\n决策：保持只读。\n`;
  const absoluteCase=path.join(fixture.env.OBSIDIAN_VAULT!,casePath);mkdirSync(path.dirname(absoluteCase),{recursive:true});writeFileSync(absoluteCase,caseText);
  const requests:Array<{method:string;url:string;authorization?:string}>=[];
  let code=200,partial=false,wrongIdentity=false;
  let readGate:{id:string;wait:Promise<void>}|null=null;
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
    if(readGate?.id===id)await readGate.wait;
    res.end(JSON.stringify({success:true,data:wrongIdentity?{...task,id:"Tasks/wrong.md"}:task}));
  });
  const invocation=buildWorkCaseSnapshotInvocation({flowdeskRoot:CORE_ROOT,casePath,workingDirectory:fixture.env.OBSIDIAN_VAULT!,apiUrl:url,includeResumeBundle:true});
  const legacyInvocation=buildWorkCaseSnapshotInvocation({flowdeskRoot:CORE_ROOT,casePath,workingDirectory:fixture.env.OBSIDIAN_VAULT!,apiUrl:url});
  fixture.allowParentProducer([legacyInvocation.executable,...legacyInvocation.args],legacyInvocation.cwd);
  fixture.allowCommand([invocation.executable,...invocation.args],invocation.cwd);
  fixture.allowParentProducer([invocation.executable,...invocation.args],invocation.cwd);
  return {...fixture,casePath,absoluteCase,caseText,cwd,url,tasks,requests,invocation,largeProgress,currentNext,referenceFixture,
    async taskSnapshot(taskId:string) {
      const taskInvocation=buildSnapshotInvocation({flowdeskRoot:CORE_ROOT,taskPath:taskId,workingDirectory:fixture.root,apiUrl:url},"json");
      fixture.allowCommand([taskInvocation.executable,...taskInvocation.args],taskInvocation.cwd);
      const result=await execAsync(taskInvocation.executable,taskInvocation.args,{cwd:taskInvocation.cwd,env:fixture.env});return JSON.parse(result.stdout);
    },
    pauseTaskRead(id:string) { let release:()=>void=()=>{};readGate={id,wait:new Promise<void>(resolve=>{release=resolve;})};const finish=()=>{readGate=null;release();};t.after(finish);return finish; },
    async snapshot(){const result=await execAsync(invocation.executable,invocation.args,{cwd:invocation.cwd,env:fixture.env});return JSON.parse(result.stdout);},
    setCode:(value:number)=>{code=value;},setPartial:(value:boolean)=>{partial=value;},setWrongIdentity:(value:boolean)=>{wrongIdentity=value;},
    originalCase:()=>readFileSync(absoluteCase,"utf8"),
  };
}
