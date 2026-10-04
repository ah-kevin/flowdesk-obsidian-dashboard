import {createResumePresentation} from "./resume-presentation";
import type {WorkCaseViewModel} from "./work-case-model";
import {excerpt,firstParagraph,utf8Bytes} from "./reading-presentation";

export interface ContinuationCard {text:string;bytes:number;targetBytes:number;omittedCompleted:number;gaps:string[]}
/** A readable projection with explicit omissions. It never grants ownership or mutates the full resume bundle. */
export function createContinuationCard(model:WorkCaseViewModel,options:{staleReason?:string;selectedTaskIds?:string[];targetBytes?:number}={}):ContinuationCard {
  const full=createResumePresentation(model.resumeBundle,model),targetBytes=options.targetBytes??4096;
  const selected=options.selectedTaskIds?new Set(options.selectedTaskIds):null;
  const active=model.tasks.items.filter(t=>t.statusIsCompleted!==true&&(!selected||selected.has(t.id)));
  const finished=model.tasks.items.filter(t=>t.statusIsCompleted===true);
  const shown=finished.slice(0,3),gaps=[...full.gaps];
  if(options.staleReason)gaps.unshift(`旧观测：${options.staleReason}；当前性未确认。`);
  const lines=["继续工作卡（只读观测；使用前回读）",`Case：${model.source.path}`,`cwd：${model.workCase.cwd??"未记录"}`,`branch：${model.workCase.branch??"未记录"}`,
    `当前进展（摘录）：${excerpt(model.current.progressSummary??"未记录",350)}`,`下一步（原观测摘录）：${excerpt(model.current.next??"未记录",300)}`];
  const decisions=model.sections.decisions[0];if(decisions)lines.push(`关键决定（原文摘录）：${excerpt(firstParagraph(decisions.text),220)}`);
  lines.push("\n未结束或状态未知的 Task：");
  if(!active.length)lines.push(model.tasks.observationHealth==="healthy"?"本次选择中没有未结束 Task。":"关联读取不完整，不能确认没有未结束 Task。");
  for(const task of active) {
    const projection=full.tasks.find(t=>t.id===task.id);
    lines.push(`- ${task.id} · 原状态 ${task.status}${task.isBlocked?" · 有阻塞":""}${task.statusIsCompleted===null?" · 生命周期未知":""}`);
    lines.push(`  Next（原观测摘录）：${excerpt(projection?.next??"未提供；回读准确 Task 原文",240)}`);
    if(projection?.missing.length)gaps.push(`${task.id}：${projection.missing.join("、")}`);
    if(!projection)gaps.push(`${task.id}：没有恢复投影，Next 未确认。`);
    const source=projection?.sources.find(s=>s.field==="next");
    if(source)lines.push(`  来源：${source.task_id} / ${source.section} / API details ${source.line_start}–${source.line_end}${source.truncated?"（源投影截断）":""}`);
  }
  if(selected){const excluded=model.tasks.items.filter(t=>t.statusIsCompleted!==true&&!selected.has(t.id));if(excluded.length)lines.push(`本卡未选择 ${excluded.length} 个未结束/未知 Task；完整列表见 Case。`);}
  lines.push(`\n已结束任务摘录（来源顺序 ${shown.length}/${finished.length}，不代表全部成功）：`);
  for(const task of shown){const projection=full.tasks.find(t=>t.id===task.id);lines.push(`- ${task.title} · ${task.status} · ${task.id} · ${excerpt(firstParagraph(projection?.result??"未提供结果；查看 Task 原文"),160)}`);}
  const omittedCompleted=finished.length-shown.length;if(omittedCompleted)lines.push(`省略 ${omittedCompleted} 个已结束任务；完整结果从 Case/Task 原文查看。`);
  if(model.tasks.observationHealth!=="healthy"||!model.tasks.coverage.complete)gaps.push("关联任务读取不完整，当前列表不是全部任务。");
  lines.push(`\n缺口：${gaps.length?gaps.join("；"):"本次来源未报告缺口"}`,`来源：${model.resumeBundle?.source??model.source.path}`,
    "接续前回读准确 Case 与最新 TaskNotes；明确选择要继续的 Task ID，已结束项不重做。换载体先保存进展并正常结束旧执行；释放未知只读或回原 owner。");
  let text=lines.join("\n");if(utf8Bytes(text)>targetBytes)text+=`\n本卡超过 ${targetBytes}B 目标；准确 ID 与缺口保留，可选择更少 Task 后复制。`;
  return {text,bytes:utf8Bytes(text),targetBytes,omittedCompleted,gaps};
}
