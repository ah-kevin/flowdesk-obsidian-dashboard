import { createResumePresentation } from "./resume-presentation";
import { createContinuationCard } from "./continuation-card";
import { excerpt, firstParagraph, formatDisplayTime } from "./reading-presentation";
import type { CoreResolution } from "./core-resolution";
import type { SnapshotSource } from "./snapshot-model";
import {formatEntityStatus, formatReferenceLabel} from "./entity-presentation";
import type { WorkCaseRenderState } from "./work-case-adapter";
import type { WorkCaseSourceRange } from "./work-case-model";
import type { TaskNavigationOrigin, NavigationModifiers } from "./task-navigation";
import {CaseReferenceList} from "./case-reference-list";
import type { DashboardAction } from "./dashboard-dialogs";
import { parseQuotedProgress, renderProgressEvents } from "./progress-history";
import { parseReferenceText } from "./reference-text";
import {
  createWorkCasePresentation,
  type WorkCasePresentation,
  type WorkCaseTaskPresentation,
} from "./work-case-presentation";

type WorkCaseSectionPresentation = WorkCasePresentation["sections"][number];

export interface WorkCaseRendererDependencies {
  refresh(): Promise<void> | void;
  openTask(
    taskPath: string,
    origin: TaskNavigationOrigin,
    event?: NavigationModifiers
  ): Promise<void> | void;
  openCaseSource(casePath: string, source: WorkCaseSourceRange, event?:NavigationModifiers): Promise<void> | void;
  openRelated(target: string, casePath: string, event?:NavigationModifiers): Promise<void> | void;
  copyText?(text: string): Promise<void>;
  openTaskSource?(taskPath: string, source: SnapshotSource, event?:NavigationModifiers): Promise<void>;
  renderMarkdown?(text:string, element:HTMLElement, sourcePath:string):Promise<void>;
  coreInfo?():CoreResolution|null;
  openSettings?():void;
  openActions?(title:string,actions:DashboardAction[]):void;
  openContent?(title:string,render:(container:HTMLElement)=>void):void;
  editCase?(casePath:string,event?:NavigationModifiers):Promise<void>|void;
  icon?(element:HTMLElement,name:string):void;
}

export class WorkCaseDashboardRenderer {
  private readonly taskChoices = new Map<string,{selected:Set<string>;known:Set<string>}>();
  private readonly referenceList=new CaseReferenceList();
  constructor(private readonly dependencies: WorkCaseRendererDependencies) {}

  reset(container: HTMLElement): void {
    this.referenceList.deactivate();
    container.removeClass("flowdesk-case-dashboard");
  }

  render(container: HTMLElement, state: WorkCaseRenderState): void {
    this.referenceList.deactivate();
    container.addClass("flowdesk-case-dashboard");
    if (!state.model) {
      this.renderShell(container, state);
      return;
    }
    const presentation = createWorkCasePresentation(state.model);
    this.renderHeader(container, state, presentation);
    const observation=container.createEl("details", {
      cls: `flowdesk-case-observation is-${state.staleReason ? "degraded" : presentation.tasks.health}`,
      attr: {title: state.casePath,"data-disclosure-key":"case-source"},
    });
    const core=state.coreInfo;
    observation.createEl("summary",{text:`${state.staleReason?"旧数据":presentation.tasks.health==="healthy"?"来源读取完整":"关联读取不完整"}${core?` · Core ${core.version}`:""}`});
    observation.createDiv({cls:"flowdesk-muted",text:`Work Case schema 1 · ${state.loading?"刷新中 · 上次读取":"读取于"} ${formatDisplayTime(state.loadedAt)} · ${state.casePath}${core?`\n${core.source} · ${core.root}`:""}`});
    if (state.error || state.staleReason) {
      container.createDiv({
        cls: "flowdesk-case-stale-warning",
        text: state.staleReason || state.error,
      });
    }
    this.renderCurrent(container, state, presentation);
    this.renderTasks(container, presentation);
    this.renderRelated(container, state, presentation);
    this.renderProgress(container, state, presentation);
    this.renderSections(container, state, presentation);
    this.renderTechnicalContext(container, presentation);
    this.renderDiagnostics(container, presentation);
  }

  private renderShell(container: HTMLElement, state: WorkCaseRenderState): void {
    const header = container.createDiv({ cls: "flowdesk-case-header" });
    header.createDiv({ cls: "flowdesk-case-kicker", text: "WORK CASE" });
    header.createDiv({ cls: "flowdesk-case-title", text: caseTitle(state.casePath) });
    const refresh = header.createEl("button", {
      cls: "flowdesk-case-refresh",
      text: state.loading ? "读取中" : "刷新",
      attr: { "aria-label": state.loading ? "Work Case 读取中" : "刷新 Work Case" },
    });
    refresh.disabled = state.loading;
    refresh.addEventListener("click", () => void this.dependencies.refresh());
    container.createDiv({
      cls: state.error ? "flowdesk-case-error" : "flowdesk-case-empty",
      text: state.error || (state.loading ? "正在读取 Work Case snapshot..." : "尚未读取 Work Case snapshot。"),
    });
    if(state.error&&this.dependencies.openSettings){const button=container.createEl("button",{text:"打开 Dashboard 设置"});button.addEventListener("click",()=>this.dependencies.openSettings?.());}
  }

  private renderHeader(
    container: HTMLElement,
    state: WorkCaseRenderState,
    presentation: WorkCasePresentation
  ): void {
    const header = container.createDiv({ cls: "flowdesk-case-header" });
    const top = header.createDiv({ cls: "flowdesk-case-header-top" });
    top.createDiv({ cls: "flowdesk-case-kicker", text: "工作案卷" });
    const actions=top.createDiv({cls:"flowdesk-header-actions"});
    const refresh = actions.createEl("button", {
      cls: "flowdesk-case-refresh",
      text: state.loading ? "读取中" : "刷新",
      attr: { "aria-label": state.loading ? "Work Case 读取中" : "刷新 Work Case" },
    });
    refresh.disabled = state.loading;
    refresh.addEventListener("click", () => void this.dependencies.refresh());
    const more=actions.createEl("button",{cls:"flowdesk-more-actions",text:"⋯",attr:{"aria-label":"更多操作","data-focus-key":"case-more"}});
    more.addEventListener("click",()=>this.dependencies.openActions?.("更多操作",[
      {label:"复制交接上下文",run:()=>this.dependencies.copyText?.(createContinuationCard(state.model!,{staleReason:state.staleReason,selectedTaskIds:[...this.selectedTasks(state)]}).text)},
      {label:"查看交接上下文",run:()=>this.dependencies.openContent?.("交接上下文",container=>this.renderResume(container,state))},
      {label:"复制完整恢复资料",run:()=>this.dependencies.copyText?.(this.fullResumeText(state))},
      {label:"查看原文件",run:event=>this.dependencies.openRelated(state.casePath,state.casePath,event)},
    ]));
    const title=header.createEl("button", { cls: "flowdesk-case-title flowdesk-case-title-link", text: presentation.header.title });
    title.addEventListener("click",event=>{void this.dependencies.openRelated(state.casePath,state.casePath,event);});
    const metadata = header.createDiv({ cls: "flowdesk-case-metadata" });
    metadata.createSpan({ cls: "flowdesk-case-status", text: presentation.header.status, attr: {title: state.model?.workCase.status || "未记录"} });
    if (presentation.header.project !== "未关联 Project") {
      const project = metadata.createEl("button", {
        cls: "flowdesk-case-related-link",
        text: formatReferenceLabel(presentation.header.project),
        attr: {title: presentation.header.project},
      });
      project.addEventListener("click", event =>
        void this.dependencies.openRelated(presentation.header.project, state.casePath,event)
      );
    } else {
      metadata.createSpan({ cls: "flowdesk-case-muted", text: presentation.header.project });
    }
    metadata.createSpan({
      cls: "flowdesk-case-date",
      text: formatDisplayTime(presentation.header.dateTooltip),
      attr: { title: presentation.header.dateTooltip },
    });
    for (const badge of presentation.header.badges) {
      metadata.createSpan({ cls: "flowdesk-case-badge", text: badge });
    }
  }

  private renderTechnicalContext(container: HTMLElement, presentation: WorkCasePresentation): void {
    if (!presentation.header.recoveryContext.length) return;
    const details = container.createEl("details", { cls: "flowdesk-case-recovery" });
    details.createEl("summary", { text: "技术详情" });
    for (const item of presentation.header.recoveryContext) {
      const row = details.createDiv({ cls: "flowdesk-case-recovery-row" });
      row.createSpan({ cls: "flowdesk-case-label", text: item.label });
      row.createSpan({ cls: "flowdesk-case-long-value", text: item.value });
    }
  }

  private renderCurrent(
    container: HTMLElement,
    state: WorkCaseRenderState,
    presentation: WorkCasePresentation
  ): void {
    const section = createSection(container, "当前进展", "flowdesk-case-current");
    const grid = section.createDiv({ cls: "flowdesk-case-short-grid" });
    for (const item of presentation.current) {
      const card = grid.createDiv({cls:`flowdesk-case-current-card is-${item.key}`});
      card.createDiv({cls:"flowdesk-case-label",text:item.label});
      const short=excerpt(firstParagraph(item.value),420);
      this.markdown(card,short,state.casePath,"flowdesk-case-current-value");
      if(short!==item.value.trim()) {
        const full=card.createEl("details",{cls:"flowdesk-case-current-full",attr:{"data-disclosure-key":`current:${item.key}`}});
        full.createEl("summary",{text:"展开全文"});this.markdown(full,item.value,state.casePath,"flowdesk-case-current-original");
      }
    }
  }

  private markdown(parent:HTMLElement,text:string,sourcePath:string,cls:string):void {
    const body=parent.createDiv({cls:`${cls} markdown-rendered`});
    if(this.dependencies.renderMarkdown)void this.dependencies.renderMarkdown(text,body,sourcePath).catch(()=>body.setText(text));
    else body.setText(text);
  }

  private renderTasks(container: HTMLElement, presentation: WorkCasePresentation): void {
    const section = createSection(container, "关联任务", "flowdesk-case-tasks");
    section.createDiv({cls: "flowdesk-case-task-summary", text: presentation.tasks.health === "healthy"
      ? `已结束 ${presentation.tasks.completedLabel} 个关联任务` : "关联任务尚未完整读取；以下仅展示已观察条目。"});
    if (presentation.tasks.driftWarning) {
      section.createDiv({ cls: "flowdesk-case-drift", text: presentation.tasks.driftWarning });
    }
    if (!presentation.tasks.primary.length && !presentation.tasks.history.length) {
      section.createDiv({
        cls: "flowdesk-case-empty",
        text:
          presentation.tasks.health === "healthy"
            ? "没有关联任务。"
            : "任务数据暂不可用，Case 主体仍可阅读。",
      });
      return;
    }
    if (presentation.tasks.primary.length) {
      const list = section.createDiv({ cls: "flowdesk-case-task-list" });
      for (const task of presentation.tasks.primary) this.renderTask(list, task);
    }
    if (presentation.tasks.history.length) {
      const history = section.createEl("details", { cls: "flowdesk-case-task-history" });
      history.createEl("summary", { text: `已结束 / 已归档 · ${presentation.tasks.history.length}` });
      const list = history.createDiv({ cls: "flowdesk-case-task-list" });
      for (const task of presentation.tasks.history) this.renderTask(list, task);
    }
    const counts = section.createEl("details", {cls: "flowdesk-case-task-counts"});
    counts.createEl("summary", {text: "状态统计"});
    const grid = counts.createDiv({cls: "flowdesk-case-count-grid"});
    for (const count of presentation.tasks.counts) {
      const item = grid.createDiv({cls: "flowdesk-case-count"});
      item.createDiv({cls: "flowdesk-case-count-value", text: count.value});
      item.createDiv({cls: "flowdesk-case-label", text: count.label});
    }
    if (presentation.tasks.byStatus.length) {
      const statuses = counts.createDiv({ cls: "flowdesk-case-status-list" });
      for (const item of presentation.tasks.byStatus) statuses.createSpan({cls: "flowdesk-case-status-chip", text: `${formatEntityStatus("task", item.status).label} ${item.count}`, attr: {title: item.status}});
    }
  }

  private renderTask(container: HTMLElement, task: WorkCaseTaskPresentation): void {
    const accessibleRelations = task.relationRoles
      .map((role) => (role === "parent" ? "父任务" : "子任务"))
      .join("、");
    const row = container.createEl("button", {
      cls: `flowdesk-case-task-row is-${task.tone}`,
      attr: {
        "aria-label": `打开任务：${task.title}${accessibleRelations ? `；关系：${accessibleRelations}` : ""}`,
      },
    });
    const content = row.createDiv({ cls: "flowdesk-case-task-content" });
    const title = content.createDiv({ cls: "flowdesk-case-task-title" });
    if (task.relationRoles.length) {
      const roles = title.createSpan({ cls: "flowdesk-case-task-roles" });
      for (const role of task.relationRoles) {
        roles.createSpan({
          cls: `flowdesk-case-task-role is-${role}`,
          text: role === "parent" ? "父" : "子",
          attr: {
            "aria-label": role === "parent" ? "父任务" : "子任务",
          },
        });
      }
    }
    title.createSpan({ cls: "flowdesk-case-task-title-text", text: task.title });
    content.createDiv({
      cls: "flowdesk-case-task-meta",
      text: `${task.associationSource}${task.archived ? " · archived" : ""}`,
    });
    row.createSpan({ cls: "flowdesk-case-task-status", text: formatEntityStatus("task", task.status).label, attr: {title: task.status} });
    row.addEventListener("click", event =>
      void this.dependencies.openTask(task.id, "work-case",event)
    );
  }

  private renderProgress(
    container: HTMLElement,
    state: WorkCaseRenderState,
    presentation: WorkCasePresentation
  ): void {
    const section = createSection(container, "最近进展", "flowdesk-case-recent-progress");
    if (!presentation.recentProgress.length) {
      section.createDiv({ cls: "flowdesk-case-empty", text: "未记录结构化 Progress。" });
      return;
    }
    const list = section.createDiv({ cls: "flowdesk-case-progress-list" });
    for (const [index, item] of presentation.recentProgress.slice(0,3).entries()) {
      const row=list.createDiv({cls:`flowdesk-case-progress-item${index===0?" is-latest":""}`});
      const meta=row.createSpan({cls:"flowdesk-case-progress-meta"});
      if(item.timestamp)meta.createSpan({cls:"flowdesk-case-progress-time",text:formatDisplayTime(item.timestamp),attr:{title:item.timestamp}});
      if(index===0)meta.createSpan({cls:"flowdesk-case-progress-latest",text:"最新"});
      this.markdown(row,item.text,state.casePath,"flowdesk-case-progress-text");
    }
    const history=section.createEl("button",{cls:"flowdesk-case-progress-history",text:"查看全部进展 →"});
    history.addEventListener("click",()=>this.dependencies.openContent?.("全部进展",container=>{
      const progress=state.caseContent?.sections.filter(item=>item.heading==="Progress")??[];
      const events=progress.length===1?parseQuotedProgress(progress[0].text):null;
      if(events)renderProgressEvents(container,events,(text,element)=>this.markdown(element,text,state.casePath,""),true);
      else {container.createDiv({cls:"flowdesk-muted",text:"完整进展未能整理；以下保留可读取的原文，不代表完整历史。"});for(const item of progress)this.markdown(container,item.text,state.casePath,"flowdesk-log-body");if(!progress.length)for(const item of state.model!.recentProgress)this.markdown(container,item.text,state.casePath,"flowdesk-log-body");}
    }));
  }

  private renderSections(
    container: HTMLElement,
    state: WorkCaseRenderState,
    presentation: WorkCasePresentation
  ): void {
    const section = createSection(container, "案卷内容", "flowdesk-case-record");
    const primaryKeys = ["goal", "blockers", "outcome"] as const;
    const secondaryKeys = ["decisions", "discoveries"] as const;
    const moreKeys = ["candidatePatterns", "definitionOfDone"] as const;
    const byKey = new Map(presentation.sections.map((group) => [group.key, group]));
    const selectVisible = (
      keys: readonly WorkCaseSectionPresentation["key"][]
    ): WorkCaseSectionPresentation[] =>
      keys
        .map((key) => byKey.get(key))
        .filter(
          (group): group is WorkCaseSectionPresentation =>
            Boolean(group && group.items.length)
        );
    const primary = selectVisible(primaryKeys);
    const secondary = selectVisible(secondaryKeys);
    const moreGroups = selectVisible(moreKeys);

    if (!primary.length && !secondary.length && !moreGroups.length) {
      section.createDiv({ cls: "flowdesk-case-empty", text: "暂无案卷内容。" });
      return;
    }

    const grid = section.createDiv({ cls: "flowdesk-case-section-grid" });
    for (const group of primary) {
      this.renderRecordGroup(grid, state, group, false, true);
    }
    for (const group of secondary) {
      this.renderRecordGroup(grid, state, group, false, false);
    }
    if (moreGroups.length) {
      const more = grid.createEl("details", { cls: "flowdesk-case-record-more" });
      const itemCount = moreGroups.reduce((total, group) => total + group.items.length, 0);
      more.createEl("summary", { text: `更多案卷内容 · ${itemCount}` });
      const moreGrid = more.createDiv({ cls: "flowdesk-case-record-more-grid" });
      for (const group of moreGroups) {
        this.renderRecordGroup(moreGrid, state, group, false, false);
      }
    }
  }

  private renderRecordGroup(
    container: HTMLElement,
    state: WorkCaseRenderState,
    group: WorkCaseSectionPresentation,
    open: boolean,
    primary: boolean
  ): void {
    const labels:Record<string,string>={goal:"目标",decisions:"关键决定",discoveries:"发现",blockers:"风险与阻塞记录",outcome:"结果",candidatePatterns:"经验候选",definitionOfDone:"完成条件"};
    const details=container.createEl("details",{cls:`flowdesk-case-record-group is-${group.key}${primary?" is-primary":""}`,attr:{"data-disclosure-key":`case-record:${group.key}`}});
    details.open=open;
    details.createEl("summary",{text:`${labels[group.key]??group.label} · ${group.items.length}`});
    // Source order and an explicit excerpt, without inventing event chronology from prose.
    const item=group.items[0];if(!item)return;
    details.createDiv({cls:"flowdesk-case-record-heading",text:"原文摘录"});
    this.markdown(details,excerpt(firstParagraph(item.text),480),state.casePath,"flowdesk-case-record-text");
  }

  private renderRelated(
    container: HTMLElement,
    state: WorkCaseRenderState,
    presentation: WorkCasePresentation
  ): void {
    if (!presentation.related.length) return;
    const section = createSection(container, "精选入口", "flowdesk-case-related");
    const edit=section.createEl("button",{cls:"flowdesk-edit-entries",text:"编辑入口",attr:{"aria-label":"编辑精选入口"}});edit.addEventListener("click",event=>{void this.dependencies.editCase?.(state.casePath,event);});
    this.referenceList.render(section,state.casePath,presentation.related,{
      open:(target,event)=>this.dependencies.openRelated(target,state.casePath,event),
      icon:this.dependencies.icon,
    });
  }

  private selectedTasks(state:WorkCaseRenderState):Set<string> {
    const ids=new Set(state.model!.tasks.items.filter(task=>task.statusIsCompleted!==true).map(task=>task.id)),previous=this.taskChoices.get(state.casePath);
    const selected=new Set(previous?[...previous.selected].filter(id=>ids.has(id)):ids);
    for(const id of ids)if(!previous?.known.has(id))selected.add(id);
    this.taskChoices.set(state.casePath,{selected,known:ids});while(this.taskChoices.size>20)this.taskChoices.delete(this.taskChoices.keys().next().value!);return selected;
  }

  private fullResumeText(state:WorkCaseRenderState):string {
    const presentation=createResumePresentation(state.model!.resumeBundle,state.model!),independent=state.caseContent;
    const caseLines=independent?.error?[`Case独立原文读取失败：${independent.error}`]:independent?[`Case独立原文读取时间：${independent.readAt}`,...independent.sections.filter(section=>section.heading!=="Progress").map(section=>`${section.heading}（vault-file ${section.source.lineStart}–${section.source.lineEnd}）：\n${section.text}`)]:["Case独立原文未读取；Context/Summary需查看整张Case。"];
    return [presentation.summary,`本地snapshot读取时间：${state.loadedAt}`,state.staleReason?`旧观测：${state.staleReason}`:"",...caseLines].filter(Boolean).join("\n\n");
  }

  private renderResume(container: HTMLElement, state: WorkCaseRenderState): void {
    if (!state.model) return;
    container.addClass("flowdesk-case-dashboard");
    const presentation = createResumePresentation(state.model.resumeBundle, state.model);
    const section=createSection(container,"交接上下文","flowdesk-case-resume");
    const summary=this.fullResumeText(state);
    const active=state.model.tasks.items.filter(t=>t.statusIsCompleted!==true);
    const selected=this.selectedTasks(state);
    const short=section.createEl("details",{cls:"flowdesk-continuation-preview",attr:{"data-disclosure-key":"continuation-preview"}});
    short.createEl("summary",{text:"查看交接上下文"});
    const content=short.createEl("pre",{cls:"flowdesk-continuation-text"});
    const size=section.createDiv({cls:"flowdesk-muted"});
    const update=()=>{
      const card=createContinuationCard(state.model!,{staleReason:state.staleReason,selectedTaskIds:[...selected]});
      content.setText(card.text);size.setText(`${(card.bytes/1024).toFixed(1)} KB · ${card.bytes>card.targetBytes?"超过目标，准确 ID 和缺口保留":"摘录版"} · 完整数据保留`);return card;
    };
    update();
    if(active.length) {
      const choices=section.createEl("details",{cls:"flowdesk-continuation-choices",attr:{"data-disclosure-key":"continuation-choices"}});
      choices.createEl("summary",{text:`选择接续 Task · ${active.length}`});
      for(const task of active){const label=choices.createEl("label",{cls:"flowdesk-continuation-choice"});const input=label.createEl("input",{attr:{type:"checkbox","aria-label":`接续材料包含：${task.title}`}});input.checked=selected.has(task.id);label.createSpan({text:task.title});input.addEventListener("change",()=>{input.checked?selected.add(task.id):selected.delete(task.id);update();});}
    }
    const actions=section.createDiv({cls:"flowdesk-continuation-actions"});
    const copyShort=actions.createEl("button",{cls:"flowdesk-case-copy-continuation mod-cta",text:"复制继续工作卡"});
    copyShort.addEventListener("click",()=>{void this.dependencies.copyText?.(update().text);});
    const full=section.createEl("details",{cls:"flowdesk-case-recovery",attr:{"data-disclosure-key":"full-resume"}});
    full.createEl("summary",{text:"完整恢复资料与来源"});
    full.createDiv({cls:"flowdesk-muted",text:`本地 snapshot 读取时间：${formatDisplayTime(state.loadedAt)}；完整恢复资料不替代 Case/Task 原文。`});
    const fullText=full.createEl("pre",{cls:"flowdesk-continuation-text"});
    full.addEventListener("toggle",()=>{if(full.open)fullText.setText(summary);});
    for (const task of presentation.tasks) {
      const sources = full.createEl("details", {cls:"flowdesk-case-recovery"});
      sources.createEl("summary", {text:`Task来源与完整原文：${task.title} · ${task.status}`});
      const taskOriginal = sources.createEl("button", {text:"打开完整Task原文"});taskOriginal.addEventListener("click",event=>{void this.dependencies.openTask(task.id,"child",event);});
      for (const source of task.sources) {
        const button = sources.createEl("button", {text:`查看来源任务：${source.field} · API details ${source.line_start}–${source.line_end}`});
        button.addEventListener("click",event=>{void this.dependencies.openTaskSource?.(task.id,{...source},event);});
      }
    }
    const copy = actions.createEl("button", {cls:"flowdesk-case-copy-resume",text:"复制完整恢复资料"});
    copy.addEventListener("click",()=>{void this.dependencies.copyText?.(summary);});
    const instructions = full.createEl("button", {text:"复制继续工作步骤"});
    instructions.addEventListener("click",()=>{void this.dependencies.copyText?.(`继续工作上下文（只读，不自动执行任何Task）\n${summary}\n\n明确选择要继续的准确Task ID；已完成项保留结果，不重新执行。`);});
    const history = full.createEl("button", {text:"复制原会话标识与查看步骤"});
    history.addEventListener("click",()=>{void this.dependencies.copyText?.(`原生历史指针：${JSON.stringify(presentation.history)}\n历史指针不是执行接手授权。当前没有已验证的公开自动历史入口；回原宿主按准确标识查看。`);});
  }

  private renderDiagnostics(
    container: HTMLElement,
    presentation: WorkCasePresentation
  ): void {
    if (!presentation.diagnostics.length) return;
    const details = container.createEl("details", { cls: "flowdesk-case-diagnostics" });
    details.createEl("summary", { text: `解析与观察诊断 · ${presentation.diagnostics.length}` });
    for (const diagnostic of presentation.diagnostics) {
      const row = details.createDiv({ cls: `flowdesk-case-diagnostic is-${diagnostic.severity}` });
      row.createDiv({ cls: "flowdesk-case-diagnostic-code", text: diagnostic.code });
      row.createDiv({ cls: "flowdesk-case-diagnostic-message", text: diagnostic.message });
      row.createDiv({ cls: "flowdesk-case-diagnostic-path", text: diagnostic.path });
    }
  }
}

function createSection(container: HTMLElement, title: string, className: string): HTMLElement {
  const section = container.createDiv({ cls: `flowdesk-case-section ${className}` });
  section.createDiv({ cls: "flowdesk-case-section-title", text: title });
  return section;
}

function caseTitle(casePath: string): string {
  const name = casePath.split("/").pop() || casePath;
  return name.replace(/\.md$/i, "");
}
