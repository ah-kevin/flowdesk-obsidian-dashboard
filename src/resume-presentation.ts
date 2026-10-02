import type { WorkCaseViewModel, WorkCaseTaskItem } from "./work-case-model";

export interface ResumeSource {
  field:string; task_id:string; section:string; line_start:number; line_end:number;
  timestamp?:string; truncated:boolean; original_bytes:number; included_bytes:number;
}
export interface ResumeTask {
  id:string; title:string; status:string; source:string;
  goal?:string; result?:string; blocker?:string; next?:string;
  resume_sources:ResumeSource[]; resume_missing:string[];
  resume_operation_refs:Array<{operation_id:string;line:number}>;
}
export interface ResumeBundle {
  source:string; tasks:ResumeTask[];
  resume_observation:{api_health:string;api_complete:boolean;projection_truncated:boolean;omitted_count:number;diagnostics:Array<{code:string;path:string;message:string}>};
}
export interface ResumeTaskPresentation {
  id:string;title:string;status:string;goal:string|null;result:string|null;blocker:string|null;next:string|null;
  sources:ResumeSource[];missing:string[];operationRefs:ResumeTask["resume_operation_refs"];
}
export interface ResumePresentation {
  summary:string;gaps:string[];tasks:ResumeTaskPresentation[];
  history:{agent:string|null;nativeId:string|null;device:string|null}; continuationInstructions:string;
}

/** Validate optional producer data without upgrading its observation or changing its values. */
export function validateResumeBundle(value:unknown,casePath:string,items:WorkCaseTaskItem[]):ResumeBundle|null {
  if(value===undefined||value===null)return null;
  const fail=():never=>{throw Error("resume_bundle 来源、身份或字段无效");};
  const record=(x:any)=>x&&typeof x==="object"&&!Array.isArray(x);
  const strings=(x:any)=>Array.isArray(x)&&x.every((y:any)=>typeof y==="string");
  const integer=(x:any,min=0)=>Number.isInteger(x)&&x>=min;
  const b=value as any;
  if(!record(b)||b.source!==`TaskNotes API details via Work Case snapshot: ${casePath}`||!Array.isArray(b.tasks)||!record(b.resume_observation))return fail();
  const o=b.resume_observation;
  if(typeof o.api_health!=="string"||typeof o.api_complete!=="boolean"||typeof o.projection_truncated!=="boolean"||!integer(o.omitted_count)||!Array.isArray(o.diagnostics)||!o.diagnostics.every((d:any)=>record(d)&&[d.code,d.path,d.message].every(x=>typeof x==="string")))return fail();
  const ids=new Set<string>();
  for(const task of b.tasks){
    if(!record(task)||![task.id,task.title,task.status,task.source].every(x=>typeof x==="string")||ids.has(task.id)||task.source!==`TaskNotes API ${task.id} details`)return fail();
    ids.add(task.id);
    const owner=items.find(x=>x.id===task.id);
    if(!owner||owner.status!==task.status)return fail();
    for(const field of ["goal","result","next","blocker"])if(task[field]!==undefined&&typeof task[field]!=="string")return fail();
    if(!strings(task.resume_missing)||!Array.isArray(task.resume_sources)||!Array.isArray(task.resume_operation_refs))return fail();
    for(const s of task.resume_sources)if(!record(s)||s.task_id!==task.id||![s.field,s.section].every(x=>typeof x==="string")||!integer(s.line_start,1)||!integer(s.line_end,s.line_start)||typeof s.truncated!=="boolean"||!integer(s.original_bytes)||!integer(s.included_bytes)||s.included_bytes>s.original_bytes||(s.timestamp!==undefined&&typeof s.timestamp!=="string"))return fail();
    for(const ref of task.resume_operation_refs)if(!record(ref)||typeof ref.operation_id!=="string"||!integer(ref.line,1))return fail();
  }
  return value as ResumeBundle;
}

export function createResumePresentation(bundle:ResumeBundle|null,caseModel:WorkCaseViewModel):ResumePresentation {
  const c=caseModel.workCase;
  const history={agent:c.agent,nativeId:c.agentSessionId,device:c.device};
  const continuationInstructions=`在原owner会话使用 work 继续准确Case/Task，先重新读取TaskNotes状态与结果，避免重做已完成项。换载体前先保存并回读进展，正常停止旧执行及已知后台工作；释放未知时仅只读恢复或回原owner。多个未完成Task需明确选择准确ID。Dashboard没有已验证的宿主历史自动打开/一键接管能力；原标识仅为历史指针。`;
  const gaps:string[]=[];
  if(!bundle)gaps.push("当前producer未提供resume_bundle；恢复投影不可用，仍可读完整Case/Task原文。");
  else {
    const o=bundle.resume_observation;
    if(!o.api_complete||o.api_health!=="healthy")gaps.push(`恢复API读取不完整：${o.api_health} / api_complete=${o.api_complete}`);
    if(o.projection_truncated)gaps.push("恢复投影被截断；完整正文仍需原文读取。");
    if(o.omitted_count)gaps.push(`恢复投影省略 ${o.omitted_count} 个Task（omitted_count）；不是零任务。`);
    gaps.push(...o.diagnostics.map(d=>`${d.code} · ${d.path}：${d.message}`));
  }
  if(!history.nativeId)gaps.push("原生会话标识缺失，不能从agent/workspace或标题推断。");
  if(!c.cwd)gaps.push("Case cwd未记录，不能推断当前checkout。");
  const tasks=(bundle?.tasks??[]).map(task=>({id:task.id,title:task.title,status:task.status,goal:task.goal??null,result:task.result??null,blocker:task.blocker??null,next:task.next??null,sources:task.resume_sources,missing:task.resume_missing,operationRefs:task.resume_operation_refs}));
  const lines=[`Case：${caseModel.source.path}`,`Case原生状态：${c.status??"未记录"}`,`cwd：${c.cwd??"未记录"}`,`branch：${c.branch??"未记录"}`,
    ...caseModel.sections.goal.map(s=>`Case目标：\n${s.text}`),
    ...caseModel.sections.decisions.map(s=>`Case决策：\n${s.text}\n决策来源：${caseModel.source.path} · vault-file ${s.source.lineStart}–${s.source.lineEnd}`),`Case当前：${caseModel.current.progressSummary??"未记录"}`,`Case下一步：${caseModel.current.next??"未记录"}`,
    `恢复来源：${bundle?.source??"未提供"}`,
    ...tasks.flatMap(task=>[`\nTask：${task.id} · 原生状态 ${task.status}`,`目标：${task.goal??"未提供"}`,`结果：${task.result??"未提供"}`,`阻塞：${task.blocker??"未提供"}`,`下一步：${task.next??"未提供"}`,`缺失字段：${task.missing.join("、")||"无"}`,
      ...task.sources.map(s=>`来源 ${s.field}：${s.task_id} / ${s.section} / API details ${s.line_start}–${s.line_end}${s.timestamp?` / ${s.timestamp}`:""} / 字节 ${s.included_bytes}/${s.original_bytes}${s.truncated?"（截断或候选被拒）":""}`),
      ...task.operationRefs.map(ref=>`操作仅引用：${ref.operation_id} · API details 第${ref.line}行；不证明已完成`)]),
    `\n历史指针：agent=${history.agent??"缺失"} / nativeId=${history.nativeId??"缺失"} / device=${history.device??"缺失"}`,
    `读取缺口：\n${gaps.join("\n")||"producer未报告缺口"}`,continuationInstructions];
  return {summary:lines.join("\n"),gaps,tasks,history,continuationInstructions};
}
