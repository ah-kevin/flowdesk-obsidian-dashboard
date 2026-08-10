import type { WorkCaseRenderState } from "./work-case-adapter";
import type { WorkCaseSourceRange } from "./work-case-model";
import {
  createWorkCasePresentation,
  type WorkCasePresentation,
  type WorkCaseTaskPresentation,
} from "./work-case-presentation";

export interface WorkCaseRendererDependencies {
  refresh(): Promise<void> | void;
  openTask(taskPath: string): Promise<void> | void;
  openCaseSource(casePath: string, source: WorkCaseSourceRange): Promise<void> | void;
  openRelated(target: string, casePath: string): Promise<void> | void;
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
      return;
    }
    const presentation = createWorkCasePresentation(state.model);
    this.renderHeader(container, state, presentation);
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
    metadata.createSpan({ cls: "flowdesk-case-status", text: presentation.header.status });
    if (presentation.header.project !== "未关联 Project") {
      const project = metadata.createEl("button", {
        cls: "flowdesk-case-related-link",
        text: presentation.header.project,
      });
      project.addEventListener("click", () =>
        void this.dependencies.openRelated(presentation.header.project, state.casePath)
      );
    } else {
      metadata.createSpan({ cls: "flowdesk-case-muted", text: presentation.header.project });
    }
    metadata.createSpan({ cls: "flowdesk-case-date", text: presentation.header.dateLabel });
    for (const badge of presentation.header.badges) {
      metadata.createSpan({ cls: "flowdesk-case-badge", text: badge });
    }
    if (presentation.header.recoveryContext.length) {
      const details = header.createEl("details", { cls: "flowdesk-case-recovery" });
      details.createEl("summary", { text: "恢复上下文" });
      for (const item of presentation.header.recoveryContext) {
        const row = details.createDiv({ cls: "flowdesk-case-recovery-row" });
        row.createSpan({ cls: "flowdesk-case-label", text: item.label });
        row.createSpan({ cls: "flowdesk-case-long-value", text: item.value });
      }
    }
  }

  private renderCurrent(
    container: HTMLElement,
    state: WorkCaseRenderState,
    presentation: WorkCasePresentation
  ): void {
    const section = createSection(container, "Current", "flowdesk-case-current");
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
    const summary = section.createDiv({ cls: "flowdesk-case-task-summary" });
    const completion = summary.createDiv({ cls: "flowdesk-case-completion" });
    completion.createDiv({ cls: "flowdesk-case-completion-value", text: presentation.tasks.completedLabel });
    completion.createDiv({ cls: "flowdesk-case-label", text: "completed / total" });
    if (presentation.tasks.progressPercent !== null) {
      const progress = summary.createEl("progress", {
        cls: "flowdesk-case-progress-bar",
        attr: { max: "100", value: String(presentation.tasks.progressPercent) },
      });
      progress.value = presentation.tasks.progressPercent;
    }
    summary.createDiv({
      cls: `flowdesk-case-observation is-${presentation.tasks.health}`,
      text: `任务观察：${presentation.tasks.health}`,
    });
    const counts = section.createDiv({ cls: "flowdesk-case-count-grid" });
    for (const count of presentation.tasks.counts) {
      const item = counts.createDiv({ cls: "flowdesk-case-count" });
      item.createDiv({ cls: "flowdesk-case-count-value", text: count.value });
      item.createDiv({ cls: "flowdesk-case-label", text: count.label });
    }
    if (presentation.tasks.byStatus.length) {
      const statuses = section.createDiv({ cls: "flowdesk-case-status-list" });
      for (const item of presentation.tasks.byStatus) {
        statuses.createSpan({
          cls: "flowdesk-case-status-chip",
          text: `${item.status} ${item.count}`,
        });
      }
    }
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
  }

  private renderTask(container: HTMLElement, task: WorkCaseTaskPresentation): void {
    const row = container.createEl("button", {
      cls: `flowdesk-case-task-row is-${task.tone}`,
      attr: { "aria-label": `打开任务：${task.title}` },
    });
    const content = row.createDiv({ cls: "flowdesk-case-task-content" });
    content.createDiv({ cls: "flowdesk-case-task-title", text: task.title });
    content.createDiv({
      cls: "flowdesk-case-task-meta",
      text: `${task.associationSource}${task.archived ? " · archived" : ""}`,
    });
    row.createSpan({ cls: "flowdesk-case-task-status", text: task.status || "未记录" });
    row.addEventListener("click", () => void this.dependencies.openTask(task.id));
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
    for (const item of presentation.recentProgress) {
      const row = section.createEl("button", { cls: "flowdesk-case-progress-item" });
      if (item.timestamp) row.createSpan({ cls: "flowdesk-case-progress-time", text: item.timestamp });
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
    const grid = section.createDiv({ cls: "flowdesk-case-section-grid" });
    for (const group of presentation.sections) {
      const details = grid.createEl("details", { cls: "flowdesk-case-record-group" });
      details.createEl("summary", { text: `${group.label} · ${group.items.length}` });
      if (!group.items.length) {
        details.createDiv({ cls: "flowdesk-case-empty", text: "未记录" });
        continue;
      }
      for (const item of group.items) {
        const entry = details.createEl("button", { cls: "flowdesk-case-record-entry" });
        entry.createDiv({ cls: "flowdesk-case-record-heading", text: item.heading });
        entry.createDiv({ cls: "flowdesk-case-record-text", text: item.text });
        entry.addEventListener("click", () =>
          void this.dependencies.openCaseSource(state.casePath, item.source)
        );
      }
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
          text: target,
        });
        link.addEventListener("click", () =>
          void this.dependencies.openRelated(target, state.casePath)
        );
      }
    }
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
