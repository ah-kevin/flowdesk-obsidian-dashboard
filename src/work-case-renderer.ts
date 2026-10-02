import { createResumePresentation } from "./resume-presentation";
import type { SnapshotSource } from "./snapshot-model";
import {formatEntityStatus, formatReferenceLabel} from "./entity-presentation";
import type { WorkCaseRenderState } from "./work-case-adapter";
import type { WorkCaseSourceRange } from "./work-case-model";
import type { TaskNavigationOrigin } from "./task-navigation";
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
    origin: TaskNavigationOrigin
  ): Promise<void> | void;
  openCaseSource(casePath: string, source: WorkCaseSourceRange): Promise<void> | void;
  openRelated(target: string, casePath: string): Promise<void> | void;
  renderMarkdown?(text: string, element: HTMLElement, sourcePath: string): Promise<void>;
  copyText?(text: string): Promise<void>;
  openTaskSource?(taskPath: string, source: SnapshotSource): Promise<void>;
}

export class WorkCaseDashboardRenderer {
  constructor(private readonly dependencies: WorkCaseRendererDependencies) {}

  reset(container: HTMLElement): void {
    container.removeClass("flowdesk-case-dashboard");
  }

  render(container: HTMLElement, state: WorkCaseRenderState): void {
    container.addClass("flowdesk-case-dashboard");
    if (!state.model) {
      this.renderShell(container, state);
      this.renderFullCaseContent(container, state);
      return;
    }
    const presentation = createWorkCasePresentation(state.model);
    this.renderHeader(container, state, presentation);
    container.createDiv({
      cls: `flowdesk-case-observation is-${state.staleReason ? "degraded" : presentation.tasks.health}`,
      text: `来源：Work Case schema 1 · ${state.loading ? "正在刷新 · 上次读取" : "读取于"} ${state.loadedAt} · ${state.staleReason ? "来源已过期，等待刷新" : presentation.tasks.health === "healthy" ? "来源读取完整" : "关联任务读取不完整"}`,
      attr: {title: state.casePath},
    });
    if (state.error || state.staleReason) {
      container.createDiv({
        cls: "flowdesk-case-stale-warning",
        text: state.staleReason || state.error,
      });
    }
    this.renderCurrent(container, state, presentation);
    this.renderTasks(container, presentation);
    this.renderProgress(container, state, presentation);
    this.renderSections(container, state, presentation);
    this.renderRelated(container, state, presentation);
    this.renderFullCaseContent(container, state);
    this.renderResume(container, state);
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
  }

  private renderHeader(
    container: HTMLElement,
    state: WorkCaseRenderState,
    presentation: WorkCasePresentation
  ): void {
    const header = container.createDiv({ cls: "flowdesk-case-header" });
    const top = header.createDiv({ cls: "flowdesk-case-header-top" });
    top.createDiv({ cls: "flowdesk-case-kicker", text: presentation.header.typeLabel || "WORK CASE" });
    const refresh = top.createEl("button", {
      cls: "flowdesk-case-refresh",
      text: state.loading ? "读取中" : "刷新",
      attr: { "aria-label": state.loading ? "Work Case 读取中" : "刷新 Work Case" },
    });
    refresh.disabled = state.loading;
    refresh.addEventListener("click", () => void this.dependencies.refresh());
    header.createDiv({ cls: "flowdesk-case-title", text: presentation.header.title });
    const metadata = header.createDiv({ cls: "flowdesk-case-metadata" });
    metadata.createSpan({ cls: "flowdesk-case-status", text: presentation.header.status, attr: {title: state.model?.workCase.status || "未记录"} });
    if (presentation.header.project !== "未关联 Project") {
      const project = metadata.createEl("button", {
        cls: "flowdesk-case-related-link",
        text: formatReferenceLabel(presentation.header.project),
        attr: {title: presentation.header.project},
      });
      project.addEventListener("click", () =>
        void this.dependencies.openRelated(presentation.header.project, state.casePath)
      );
    } else {
      metadata.createSpan({ cls: "flowdesk-case-muted", text: presentation.header.project });
    }
    metadata.createSpan({
      cls: "flowdesk-case-date",
      text: presentation.header.dateLabel,
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
      const card = grid.createEl("button", {
        cls: `flowdesk-case-current-card is-${item.key}`,
        attr: { "aria-label": `打开 Current：${item.label}` },
      });
      card.createDiv({ cls: "flowdesk-case-label", text: item.label });
      card.createDiv({ cls: "flowdesk-case-current-value", text: item.value });
      if (item.source) {
        card.addEventListener("click", () =>
          void this.dependencies.openCaseSource(state.casePath, item.source as WorkCaseSourceRange)
        );
      } else {
        card.disabled = true;
      }
    }
  }

  private renderTasks(container: HTMLElement, presentation: WorkCasePresentation): void {
    const section = createSection(container, "关联任务", "flowdesk-case-tasks");
    section.createDiv({cls: "flowdesk-case-task-summary", text: presentation.tasks.health === "healthy"
      ? `生命周期已完成 / 关联任务：${presentation.tasks.completedLabel}` : "关联任务尚未完整读取；以下仅展示已观察条目。"});
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
      history.createEl("summary", { text: `已完成 / 已归档 · ${presentation.tasks.history.length}` });
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
    row.addEventListener("click", () =>
      void this.dependencies.openTask(task.id, "work-case")
    );
  }

  private renderProgress(
    container: HTMLElement,
    state: WorkCaseRenderState,
    presentation: WorkCasePresentation
  ): void {
    const section = createSection(container, "最近 Progress", "flowdesk-case-recent-progress");
    if (!presentation.recentProgress.length) {
      section.createDiv({ cls: "flowdesk-case-empty", text: "未记录结构化 Progress。" });
      return;
    }
    const list = section.createDiv({ cls: "flowdesk-case-progress-list" });
    for (const [index, item] of presentation.recentProgress.entries()) {
      const row = list.createEl("button", {
        cls: `flowdesk-case-progress-item${index === 0 ? " is-latest" : ""}`,
        attr: { "aria-label": `${index === 0 ? "最新进展" : "历史进展"}：${item.text}` },
      });
      const meta = row.createSpan({ cls: "flowdesk-case-progress-meta" });
      if (item.timestamp) meta.createSpan({ cls: "flowdesk-case-progress-time", text: item.timestamp });
      if (index === 0) meta.createSpan({ cls: "flowdesk-case-progress-latest", text: "最新" });
      row.createSpan({ cls: "flowdesk-case-progress-text", text: item.text });
      row.addEventListener("click", () =>
        void this.dependencies.openCaseSource(state.casePath, item.source)
      );
    }
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
      this.renderRecordGroup(grid, state, group, true, true);
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
    const details = container.createEl("details", {
      cls: `flowdesk-case-record-group is-${group.key}${primary ? " is-primary" : ""}`,
    });
    details.open = open;
    details.createEl("summary", { text: `${group.label} · ${group.items.length}` });
    for (const item of group.items) {
      const entry = details.createEl("button", { cls: "flowdesk-case-record-entry" });
      entry.createDiv({ cls: "flowdesk-case-record-heading", text: item.heading });
      entry.createDiv({ cls: "flowdesk-case-record-text", text: item.text });
      entry.addEventListener("click", () =>
        void this.dependencies.openCaseSource(state.casePath, item.source)
      );
    }
  }

  private renderRelated(
    container: HTMLElement,
    state: WorkCaseRenderState,
    presentation: WorkCasePresentation
  ): void {
    if (!presentation.related.length) return;
    const section = createSection(container, "关联导航", "flowdesk-case-related");
    for (const group of presentation.related) {
      const row = section.createDiv({ cls: "flowdesk-case-related-row" });
      row.createSpan({ cls: "flowdesk-case-label", text: group.label });
      const links = row.createDiv({ cls: "flowdesk-case-related-links" });
      for (const target of group.targets) {
        const link = links.createEl("button", {
          cls: "flowdesk-case-related-link",
          text: formatReferenceLabel(target),
          attr: {title: target},
        });
        link.addEventListener("click", () =>
          void this.dependencies.openRelated(target, state.casePath)
        );
      }
    }
  }

  private renderFullCaseContent(container: HTMLElement, state: WorkCaseRenderState): void {
    if (!state.caseContent) return;
    const observation = state.caseContent;
    const section = container.createEl("details", {cls:"flowdesk-case-recovery flowdesk-case-full-content"});
    section.createEl("summary", {text:"完整Case原文（单独vault读取）"});
    if (observation.error) { section.createDiv({cls:"flowdesk-case-error",text:`Case原文读取失败：${observation.error}`}); return; }
    section.createDiv({cls:"flowdesk-muted",text:`${observation.source} · ${observation.casePath} · 独立读取时间 ${observation.readAt}；不能证明与snapshot同轮一致。`});
    const body = section.createDiv({cls:"flowdesk-contract-scope-markdown markdown-rendered"});
    if (this.dependencies.renderMarkdown) void this.dependencies.renderMarkdown(observation.details, body, observation.casePath).catch(() => body.setText(observation.details));
    else body.setText(observation.details);
  }

  private renderResume(container: HTMLElement, state: WorkCaseRenderState): void {
    if (!state.model) return;
    const presentation = createResumePresentation(state.model.resumeBundle, state.model);
    const section = container.createEl("details", {cls:"flowdesk-case-recovery flowdesk-case-resume"});
    section.createEl("summary", {text:"恢复摘要与继续工作步骤"});
    section.createDiv({cls:"flowdesk-muted",text:`本地snapshot读取时间：${state.loadedAt}；来源时间仅保留producer已有timestamp。恢复摘要不替代完整Case/Task原文。`});
    const independent = state.caseContent;
    const caseLines = independent?.error ? [`Case独立原文读取失败：${independent.error}`] : independent ? [`Case独立原文读取时间：${independent.readAt}`, ...independent.sections.map(s => `${s.heading}（vault-file ${s.source.lineStart}–${s.source.lineEnd}）：\n${s.text}`)] : ["Case独立原文未读取；Context/Summary需查看整张Case。"];
    const summary = [presentation.summary, `本地snapshot读取时间：${state.loadedAt}`, state.staleReason ? `旧观测：${state.staleReason}` : "", ...caseLines].filter(Boolean).join("\n\n");
    section.createDiv({cls:"flowdesk-case-record-text",text:summary});
    for (const task of presentation.tasks) {
      const sources = section.createEl("details", {cls:"flowdesk-case-recovery"});
      sources.createEl("summary", {text:`Task来源与完整原文：${task.title} · ${task.status}`});
      const full = sources.createEl("button", {text:"打开完整Task原文"});full.addEventListener("click",()=>{void this.dependencies.openTask(task.id,"child");});
      for (const source of task.sources) {
        const button = sources.createEl("button", {text:`查看来源任务：${source.field} · API details ${source.line_start}–${source.line_end}`});
        button.addEventListener("click",()=>{void this.dependencies.openTaskSource?.(task.id,{...source});});
      }
    }
    const copy = section.createEl("button", {cls:"flowdesk-case-copy-resume",text:"复制恢复摘要"});
    copy.addEventListener("click",()=>{void this.dependencies.copyText?.(summary);});
    const instructions = section.createEl("button", {text:"复制继续工作步骤"});
    instructions.addEventListener("click",()=>{void this.dependencies.copyText?.(`继续工作上下文（只读，不自动执行任何Task）\n${summary}\n\n明确选择要继续的准确Task ID；已完成项保留结果，不重新执行。`);});
    const history = section.createEl("button", {text:"复制原会话标识与查看步骤"});
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
