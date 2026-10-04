import { createTaskReadingSections, type TaskContent } from "./task-content";
import type { SnapshotBodySection, SnapshotContractItem } from "./snapshot-model";
import { excerpt, firstParagraph } from "./reading-presentation";
import { latestRecord } from "./task-overview";
import { readProgressSection, renderProgressEvents } from "./progress-history";
import { bindProgressDisclosure } from "./progress-disclosure";

const recordTitle = (heading: string): string => heading
  .replace(/^Execution Result/, "执行结果")
  .replace(/^Verification Result/, "验证结果")
  .replace(/^Delivery Record/, "交付记录");

export class TaskContentRenderer {
  constructor(private readonly dependencies: {
    renderMarkdown(text: string, element: HTMLElement, taskPath: string): Promise<void>;
    openSource(taskPath: string, section: SnapshotBodySection): Promise<void>;
    showSourceActions?: boolean;
    historyContainer?:HTMLElement;
    signal?:AbortSignal;
    trackRender?(promise:Promise<void>):void;
  }) {}

  render(container: HTMLElement, content: TaskContent): void {
    const body = (parent: HTMLElement, text: string) => {
      const element = parent.createDiv({ cls: "flowdesk-contract-scope-markdown markdown-rendered" });
      void this.dependencies.renderMarkdown(text, element, content.taskId).catch(() => element.setText(text));
    };
    const source = (parent: HTMLElement, section: SnapshotBodySection) => {
      if(!this.dependencies.showSourceActions)return;
      const row = parent.createDiv({cls:"flowdesk-source-actions"});
      const button = row.createEl("button", { cls: "flowdesk-content-source", text: "在原文查看", attr: { "aria-label": `${section.source ? "打开这一条原文" : "打开任务原文"}：${section.heading}` } });
      button.addEventListener("click", () => { void this.dependencies.openSource(content.taskId, section); });
      if (section.source) {
        const details=row.createEl("details",{cls:"flowdesk-source-details",attr:{"data-disclosure-key":`source:${section.heading}:${section.source.line_start ?? "unknown"}`}});
        details.createEl("summary",{text:"来源"});
        const line=section.source.line_start,reliable=typeof line==="number"&&Number.isInteger(line)&&line>0;
        details.createDiv({ cls: "flowdesk-muted", text: `${section.source.section ?? section.heading}${reliable ? ` · API details 第 ${line} 行` : " · API details 行位置未知"}` });
      }
    };
    const disclosure = (parent:HTMLElement, title:string, key:string, cls="flowdesk-contract-item-details") => {
      const element=parent.createEl("details",{cls,attr:{"data-disclosure-key":key}});
      element.createEl("summary",{text:title});return element;
    };
    const specification=disclosure(container,"任务说明","task-specification","flowdesk-task-specification");
    for(const [heading,text] of [["目标",content.goal],["背景",content.why],["范围",content.scopeText],["执行清单",content.steps]]) {
      if(!text)continue;
      const section=specification.createDiv({cls:"flowdesk-specification-section"});section.createEl("h3",{text:heading});body(section,text);
    }
    if(!content.goal&&!content.why&&!content.scopeText&&!content.steps)specification.createDiv({cls:"flowdesk-muted",text:"未提供任务说明；可从任务标题打开原文件。"});
    source(specification,{heading:"任务说明",level:2,text:content.goal});
    const items=(heading:string,entries:SnapshotContractItem[])=>{
      if(!entries.length)return;
      const group=disclosure(container,heading,`list:${heading}`);
      for(const item of entries){const entry=group.createDiv({cls:"flowdesk-specification-section"});body(entry,item.text??item.label??"");}
      source(group,{heading,level:2,text:""});
    };
    items("需求",content.requirements);items("场景",content.scenarios);
    if(content.acceptance.length) {
      const group=disclosure(container,"验收标准","acceptance","flowdesk-acceptance-group");
      group.createDiv({cls:"flowdesk-muted",text:"仅显示原文记录；勾选不代表验证通过。修改请在任务原文进行。"});
      const list=group.createEl("ul",{cls:"flowdesk-acceptance-list"});
      for(const item of content.acceptance) {
        const row=list.createEl("li",{cls:"flowdesk-acceptance-item"});
        const marked=item.checked===true?"原文已勾选":item.checked===false?"原文未勾选":"原文无勾选标记";
        row.createSpan({cls:`flowdesk-acceptance-marker is-${item.checked===true?"checked":item.checked===false?"unchecked":"plain"}`,text:item.checked===true?"✓":item.checked===false?"○":"•",attr:{"aria-label":marked,title:marked}});
        body(row,item.text??item.label??"");
      }
      source(group,{heading:"验收",level:2,text:""});
    }
    const reading=createTaskReadingSections(content);
    if(!reading.orderComplete)container.createDiv({cls:"flowdesk-muted",text:"部分段落无可靠位置，完整顺序请查看原文件。"});
    for(const [kind,title] of [["execution","执行结果"],["verification","验证结果"],["delivery","交付记录"]] as const) {
      const records=content.records[kind];if(!records.length)continue;
      const result=disclosure(container,title,`result:${kind}`,"flowdesk-contract-item-details flowdesk-record-round");
      const latest=latestRecord(records);
      if(latest) {
        result.createDiv({cls:"flowdesk-muted",text:"最近一条结果的首段摘录；全文和历轮结果保留在过程记录。"});
        body(result,excerpt(firstParagraph(latest.text)));source(result,latest);
      } else result.createDiv({cls:"flowdesk-muted",text:"无法确认最近一轮；完整结果保留在过程记录。"});
    }
    const progress=readProgressSection(content.domainSections);
    const historyContainer=this.dependencies.historyContainer??container;
    if(progress){
      const section=historyContainer.createEl("section",{cls:"flowdesk-progress-log"});
      const heading=section.createDiv({cls:"flowdesk-log-heading"});heading.createEl("h3",{text:"进度日志"});const count=heading.createSpan({cls:"flowdesk-muted",text:`最近 ${Math.min(3,progress.events.length)} 条 · 摘录`});
      const markdown=(text:string,element:HTMLElement)=>{void this.dependencies.renderMarkdown(text,element,content.taskId).catch(()=>element.setText(text));};
      const all=disclosure(section,`查看全部进度记录（${progress.events.length} 条）`,"all-progress","flowdesk-log-all");
      const full=all.createDiv({cls:"flowdesk-log-full",attr:{"data-reading-scroll-key":"progress-history",role:"region","aria-label":"完整进度记录",tabindex:"0"}});
      const entries=full.createDiv({cls:"flowdesk-log-full-entries"});
      const more=full.createEl("button",{cls:"flowdesk-log-more",attr:{"data-focus-key":"progress-history-more"}});
      let shown=0,busy=false,loading:Promise<void>|undefined;
      const caption=(expanded:boolean)=>count.setText(expanded?`已显示 ${shown}/${progress.events.length} 条 · 原文`:`最近 ${Math.min(3,progress.events.length)} 条 · 摘录`);
      const load=(desired=Math.max(12,Number(full.getAttribute("data-reading-items"))||0))=>{
        if(this.dependencies.signal?.aborted)return;
        if(busy)return loading;
        if(shown>=progress.events.length)return;
        const end=Math.min(progress.events.length,Math.max(shown,desired)),jobs:Array<{text:string;element:HTMLElement}>=[];
        if(end===shown)return;
        renderProgressEvents(entries,progress.events.slice(progress.events.length-end,progress.events.length-shown),(text,element)=>jobs.push({text,element}),true);
        shown=end;full.setAttr("data-reading-items",String(shown));busy=true;more.disabled=true;
        caption(all.open);
        more.setText(`加载更早记录（剩余 ${progress.events.length-shown} 条）`);more.hidden=shown===progress.events.length;
        const render=(async()=>{
          try{for(const job of jobs){if(this.dependencies.signal?.aborted)return;try{await this.dependencies.renderMarkdown(job.text,job.element,content.taskId);}catch{if(!this.dependencies.signal?.aborted)job.element.setText(job.text);}}}
          finally{busy=false;more.disabled=Boolean(this.dependencies.signal?.aborted);}
        })();
        loading=render;
        this.dependencies.trackRender?.(render);
        return render;
      };
      more.addEventListener("click",()=>load(shown+12));
      const recent=section.createDiv({cls:"flowdesk-log-recent"});
      renderProgressEvents(recent,progress.events.slice(-3),markdown,false);
      bindProgressDisclosure(all,all.querySelectorAll("summary")[0],recent,full,progress.events.length,{signal:this.dependencies.signal,ensureHistory:()=>load(),onChange:caption});
    }
    const remaining=reading.sections.filter(item=>item.section!==progress?.section);
    if(!remaining.length)return;
    const history=disclosure(historyContainer,`其他过程资料（${remaining.length} 段）`,"process-records","flowdesk-contract-item-details flowdesk-process-records");
    history.createDiv({cls:"flowdesk-muted",text:"按原文顺序连续保留正文、历史进度与历轮结果。"});
    for(const {kind,section:original} of remaining) {
      const entry=history.createDiv({cls:"flowdesk-process-entry",attr:{"data-record-kind":kind}});
      entry.createEl(original.level===3?"h3":"h2",{text:recordTitle(original.heading)});
      body(entry,original.text);
    }
    source(history,{heading:"过程记录",level:2,text:""});
  }
}
