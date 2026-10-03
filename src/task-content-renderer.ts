import { createTaskReadingSections, type TaskContent } from "./task-content";
import type { SnapshotBodySection, SnapshotContractItem } from "./snapshot-model";

export class TaskContentRenderer {
  constructor(private readonly dependencies: {
    renderMarkdown(text: string, element: HTMLElement, taskPath: string): Promise<void>;
    openSource(taskPath: string, section: SnapshotBodySection): Promise<void>;
  }) {}
  render(container: HTMLElement, content: TaskContent): void {
    const body = (parent: HTMLElement, text: string) => {
      const element = parent.createDiv({ cls: "flowdesk-contract-scope-markdown markdown-rendered" });
      void this.dependencies.renderMarkdown(text, element, content.taskId).catch(() => {
        element.setText(text); // Preserve readable source on Markdown renderer failure.
      });
    };
    const source = (parent: HTMLElement, section: SnapshotBodySection) => {
      const button = parent.createEl("button", { cls: "flowdesk-content-source", text: section.source ? "打开这一条原文" : "打开任务原文", attr: { "aria-label": `${section.source ? "打开这一条原文" : "打开任务原文"}：${section.heading}` } });
      button.addEventListener("click", () => { void this.dependencies.openSource(content.taskId, section); });
      if (section.source) {
        const line=section.source.line_start,reliable=typeof line==="number"&&Number.isInteger(line)&&line>0;
        parent.createDiv({ cls: "flowdesk-muted", text: `${section.source.section ?? section.heading}${reliable ? ` · API details 第 ${line} 行` : " · API details 行位置未知"}` });
      }
    };
    const section = (heading: string, text: string, original?: SnapshotBodySection, open = false, cls = "flowdesk-contract-item-details") => {
      const element = container.createEl("details", { cls });
      element.open = open;
      element.createEl("summary", { text: heading });
      if (text) body(element, text); else element.createDiv({ cls: "flowdesk-muted", text: "投影未提供内容；可查看完整 API 原文。" });
      source(element, original ?? { heading, level: 2, text });
    };
    for (const [heading, text] of [["目标", content.goal], ["背景", content.why], ["范围", content.scopeText], ["执行清单", content.steps]]) {
      if (text || heading === "范围") section(heading, text, undefined, heading === "目标");
    }
    const items = (heading: string, entries: SnapshotContractItem[]) => {
      for (const item of entries) {
        const original = { heading, level: 2, text: item.text ?? item.label ?? "", source: item.source };
        const id = item.uid ?? item.id ?? "";
        section(`${heading}${id ? ` · ${id}` : ""}`, original.text, original);
      }
    };
    items("需求原文条目", content.requirements);
    items("场景原文条目", content.scenarios);
    for (const item of content.acceptance) {
      const original = { heading: "验收原文条目", level: 2, text: item.text ?? item.label ?? "", source: item.source };
      section("验收原文条目（原文勾选）", `- [${item.checked ? "x" : " "}] ${original.text}`, original);
    }
    const reading = createTaskReadingSections(content);
    if (!reading.orderComplete) container.createDiv({cls:"flowdesk-muted",text:"部分段落无可靠位置，完整顺序请查看 API 原文。"});
    const labels = {domain:"正文",execution:"执行",verification:"验证",delivery:"交付"};
    for (const {kind,section:original} of reading.sections) {
      const heading = `${labels[kind]} · H${original.level} · ${original.heading}${original.timestamp ? ` · ${original.timestamp}` : ""}`;
      section(heading, original.text, original, true, kind === "domain" ? "flowdesk-contract-item-details" : "flowdesk-contract-item-details flowdesk-record-round");
    }
  }
}
