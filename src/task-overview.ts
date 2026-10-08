import type {DashboardViewModel,SnapshotBodySection,SnapshotSource} from "./snapshot-model";
import {createTaskCurrentProgress} from "./task-current-progress";
import {excerpt,firstParagraph,formatDisplayTime} from "./reading-presentation";
import type {NavigationModifiers} from "./task-navigation";

export function latestRecord(records:SnapshotBodySection[]):SnapshotBodySection|null {
  if(!records.length)return null;
  if(records.length===1)return records[0];
  if(records.some(r=>!Number.isInteger(r.source?.line_start)||Number(r.source?.line_start)<1))return null;
  const ordered=[...records].sort((a,b)=>Number(a.source!.line_start)-Number(b.source!.line_start));
  if(ordered[ordered.length-1].source?.line_start===ordered[ordered.length-2].source?.line_start)return null;
  return ordered[ordered.length-1];
}
export function renderTaskOverview(container:HTMLElement,model:DashboardViewModel,dependencies:{
  renderMarkdown(text:string,el:HTMLElement,taskId:string):Promise<void>;
  openSource(taskId:string,source:SnapshotSource,heading:string,text:string,event?:NavigationModifiers):Promise<void>;
  showSourceActions?:boolean;
}):HTMLElement {
  const healthy=model.observation.isTrustworthy&&!model.observation.isStale;
  const current=createTaskCurrentProgress(model.content,{statusIsCompleted:model.currentTask.statusIsCompleted,observedAt:model.observation.generatedAt,observationHealthy:healthy&&!model.diagnostics.some(d=>/truncat|body_omitted|progress_omitted|response_too_large/i.test(d.code))});
  const card=container.createDiv({cls:"flowdesk-task-overview flowdesk-dashboard-section"});
  card.createDiv({cls:"flowdesk-dashboard-section-title",text:model.currentTask.statusIsCompleted===true?"结果概览":model.currentTask.isBlocked?"当前工作 · 有阻塞":"当前工作"});
  const markdown=(parent:HTMLElement,text:string,cls:string,field?:string)=>{
    const el=parent.createDiv({cls:`${cls} markdown-rendered`,attr:field?{"data-current-field":field}:{}});
    void dependencies.renderMarkdown(text,el,model.currentTask.id).catch(()=>el.setText(text));
  };
  if(model.currentTask.hasChildren)card.createDiv({cls:"flowdesk-overview-rollup",text:`直接子任务：成功 ${model.rollup.childrenTrustedDone}/${model.children.length} · 已结束 ${model.children.filter(c=>c.subtreeTerminal===true).length}/${model.children.length}${model.children.some(c=>c.subtreeTerminal===null)?" · 含未知状态":""}`});
  if(!healthy)card.createDiv({cls:"flowdesk-overview-gap",text:"当前观测不完整或已过期；以下内容仅供查阅，刷新后再判断当前工作。"});
  if(model.currentTask.statusIsCompleted===true) {
    for(const [kind,label,records] of [["result","执行结果摘录",model.content.records.execution],["verification","验证记录摘录",model.content.records.verification]] as const) {
      const row=card.createDiv({cls:`flowdesk-overview-${kind}`});row.createDiv({cls:"flowdesk-summary-label",text:label});const record=latestRecord(records);
      if(record){markdown(row,excerpt(firstParagraph(record.text)),"flowdesk-overview-excerpt");if(record.timestamp)row.createDiv({cls:"flowdesk-muted",text:`记录时间：${formatDisplayTime(record.timestamp)}`,attr:{title:record.timestamp}});}
      else row.createDiv({cls:"flowdesk-muted",text:records.length?"无法确认最近一轮；请展开工作记录。":"未提供记录；可读取 API 原文。"});
    }
    card.createDiv({cls:"flowdesk-muted",text:"完成时间：未提供准确字段；记录时间独立显示。验证摘录不代表新增验收结论。"});
  } else {
    const progress=card.createDiv({cls:"flowdesk-overview-progress"});
    if(current.progress)markdown(progress,excerpt(firstParagraph(current.progress)),"flowdesk-overview-excerpt");
    else progress.createDiv({cls:"flowdesk-muted",text:"当前进展未确认，请查看记录或读取 API 原文。"});
    if(current.next!==null){const next=card.createDiv({cls:"flowdesk-overview-next"});next.createDiv({cls:"flowdesk-summary-label",text:"下一步"});markdown(next,excerpt(current.next),"flowdesk-overview-excerpt");}
    if(model.currentTask.isBlocked)card.createDiv({cls:"flowdesk-overview-gap",text:`TaskNotes 标记为阻塞${model.currentTask.blockedBy.length?`；关联：${model.currentTask.blockedBy.join("、")}`:""}`});
  }
  const progressPanel=card.createDiv({cls:"flowdesk-task-current-progress"});
  const record=progressPanel.createEl("details",{cls:"flowdesk-overview-history",attr:{"data-disclosure-key":"overview-progress"}});
  record.createEl("summary",{text:current.status==="historical"?"最近 Progress（历史）":current.status==="current"?"查看完整进展与下一步":current.progress?"Progress 片段（当前性未确认）":"当前 Progress：unknown"});
  if(current.timestamp)record.createDiv({cls:"flowdesk-muted",text:`事件时间：${formatDisplayTime(current.timestamp)} · snapshot 生成于 ${formatDisplayTime(model.observation.generatedAt)}`,attr:{title:`${current.timestamp} · ${model.observation.generatedAt}`}});
  // Full original text remains in the expandable reading view. Only the top excerpt is bounded.
  for(const [field,text] of [["progress",current.progress],["next",current.next]] as const)if(text!==null)markdown(record,text,"flowdesk-contract-scope-markdown",field);
  for(const gap of current.gaps){record.createDiv({cls:"flowdesk-muted",text:gap});if(current.status==="unknown")card.createDiv({cls:"flowdesk-overview-gap",text:gap});}
  if(current.source&&dependencies.showSourceActions){const source=record.createEl("button",{cls:"flowdesk-content-source",text:"打开 Progress 原文"});const original=model.content.domainSections.find(s=>s.level===2&&s.heading==="Progress");source.addEventListener("click",event=>{void dependencies.openSource(model.currentTask.id,current.source!,"Progress",original?.text??"",event);});}
  return card;
}
