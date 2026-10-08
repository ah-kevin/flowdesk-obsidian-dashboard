import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
const styles = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
const presentationSource = readFileSync(
  path.join(process.cwd(), "src/dashboard-presentation.ts"),
  "utf8"
);

test("任务标题独占一行，元信息与工具栏使用独立容器", () => {
  assert.match(source, /flowdesk-task-title/);
  assert.match(source, /flowdesk-task-top-row/);
  assert.doesNotMatch(source, /flowdesk-task-path/);
  assert.match(source, /flowdesk-task-read-meta/);
  assert.match(source, /flowdesk-task-meta-row/);
  assert.match(source, /flowdesk-task-meta-actions/);
  assert.match(source, /this\.openTask\(child\.id, "child", event\)/);
  assert.match(
    styles,
    /\.flowdesk-task-title\s*\{[^}]*width:\s*100%;/s
  );
  assert.match(
    styles,
    /\.flowdesk-task-title\s*\{[^}]*white-space:\s*normal;/s
  );
  assert.match(
    styles,
    /\.flowdesk-dashboard \.flowdesk-current-task-link\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*box-shadow:\s*none;/s
  );
  assert.match(
    styles,
    /\.flowdesk-dashboard \.flowdesk-current-task-link:hover\s*\{[^}]*background:\s*transparent;/s
  );
  assert.match(
    styles,
    /\.flowdesk-task-top-row\s*\{[^}]*display:\s*flex;/s
  );
  assert.match(source, /"当前父任务"/);
  assert.match(styles, /\.flowdesk-task-context-label\s*\{/);
  assert.match(source, /const title = heading\.createDiv\(\{/);
  assert.match(source, /this\.makeNavigable\(title,/);
  assert.match(source, /text: `↑ 父任务：\$\{presentation\.header\.parent\.title\}`/);
  assert.match(source, /"当前任务"/);
  assert.match(source, /const parent = topRow\.createDiv\(\{/);
  assert.match(source, /this\.makeNavigable\(parent,/);
  assert.match(source, /"aria-label": `打开父任务：\$\{presentation\.header\.parent\.title\}`/);
  assert.match(
    styles,
    /\.flowdesk-task-heading\s*\{[^}]*width:\s*100%;/s
  );
  assert.match(
    styles,
    /\.flowdesk-dashboard \.flowdesk-parent-link\s*\{[^}]*height:\s*auto;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s
  );
});

test("CLI 与刷新使用带无障碍名称的图标按钮", () => {
  assert.match(source, /setIcon\(copy, "copy"\)/);
  assert.match(source, /"aria-label": "复制 CLI"/);
  assert.match(source, /setIcon\(refresh, "refresh-cw"\)/);
  assert.match(source, /"aria-label": this\.loading \? "刷新中" : "刷新"/);
});

test("主诊断和逐条诊断都提供复制问题按钮", () => {
  assert.match(source, /cls: "flowdesk-copy-problem"/);
  assert.match(source, /text: "复制问题"/);
  assert.match(source, /new Notice\("问题已复制"\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
});

test("Dashboard uses read-only details and retires active review writes", () => {
  assert.match(source, /loadTaskDetails/);
  assert.match(source, /TaskContentRenderer/);
  assert.doesNotMatch(source, /EvidenceReviewModal|buildTaskNotesReviewWrite|canReviewTask|submitTaskReview|details\/append/);
  assert.doesNotMatch(source, /method:\s*"PATCH"|method:\s*"PUT"|method:\s*"POST"/);
  assert.doesNotMatch(source, /shell:\s*true/);
});

test("技术诊断使用来源标题和机器详情，不再平铺任务位置字段", () => {
  assert.match(source, /flowdesk-diagnostic-source/);
  assert.match(source, /flowdesk-machine-details/);
  assert.doesNotMatch(source, /diagnosticRow\(container, "任务"/);
  assert.doesNotMatch(source, /diagnosticRow\(container, "位置"/);
});

test("侧栏工具按钮与元信息标签使用协调尺寸", () => {
  assert.match(
    styles,
    /\.flowdesk-toolbar-button\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px;/s
  );
  assert.match(
    styles,
    /\.flowdesk-state-pill[\s\S]*?min-height:\s*22px;/
  );
});

test("标题全宽且 child 使用统一背景容器与内部行分隔", () => {
  assert.match(
    styles,
    /\.flowdesk-task-header\s*\{[^}]*display:\s*block;/s
  );
  assert.match(
    styles,
    /\.flowdesk-child-section\s*\{[^}]*border:\s*1px solid var\(--fd-border\);[^}]*border-radius:\s*8px;[^}]*background:\s*var\(--background-primary-alt\);/s
  );
  assert.match(
    styles,
    /\.flowdesk-child-row\s*\{[^}]*border-bottom:/s
  );
  assert.match(
    styles,
    /\.flowdesk-child-row:last-child\s*\{[^}]*border-bottom:\s*0;/s
  );
});

test("子任务区块不被折叠区展开压缩，且仍防止长内容撑宽", () => {
  // 折叠区展开时抢占空间会压缩 child 区块，overflow: hidden 会把溢出部分裁掉，
  // 看起来像子任务被遮挡。flex-shrink: 0 防压缩，min-width: 0 让内层
  // grid 的 minmax(0, 1fr) 生效防撑宽——两者必须并存。
  const childSection = styles.match(/\.flowdesk-child-section\s*\{([^}]*)\}/s);
  assert.ok(childSection, "styles.css 必须定义 .flowdesk-child-section");
  const declarations = childSection[1];
  assert.match(declarations, /flex-shrink:\s*0;/);
  assert.match(declarations, /min-width:\s*0;/);
  assert.doesNotMatch(
    declarations,
    /overflow:\s*hidden;/,
    "overflow: hidden 会裁掉被压缩后溢出的子任务行"
  );
  // 长标题靠 overflow-wrap 在标题内换行，不依赖父级裁剪。
  assert.match(
    styles,
    /\.flowdesk-child-title\s*\{[^}]*overflow-wrap:\s*anywhere;/s
  );
});

test("极窄侧栏允许工具组换行但不改变标题宽度", () => {
  assert.match(styles, /@media \(max-width:\s*360px\)/);
  assert.match(
    styles,
    /\.flowdesk-task-meta-actions\s*\{[^}]*margin-left:\s*auto;/s
  );
});

test("合同摘要在扁平布局中仍保留明确展开指示", () => {
  assert.match(styles, /\.flowdesk-contract-summary > summary::before/);
  assert.match(styles, /\.flowdesk-contract-summary\[open\] > summary::before/);
});

test("完整投影和原文 renderer 接入 main，保留来源与观察布局", () => {
  assert.match(source, /new TaskContentRenderer/);
  assert.match(source, /\.render\(contract, model\.content\)/);
  assert.match(source, /MarkdownRenderer\.render/);
  assert.match(source, /flowdesk-observation-summary/);
  assert.doesNotMatch(source, /flowdesk-records-link|flowdesk-contract-metrics/);
});

test("判定层拆除后不再渲染 Evidence 与 Acceptance 空壳区块", () => {
  // producer 不再产出 evidence_requirements / acceptance，这些区块只会显示 0/0。
  assert.doesNotMatch(source, /"验收标准"/);
  assert.doesNotMatch(source, /"执行证据"/);
  assert.doesNotMatch(source, /flowdesk-acceptance-grid/);
  assert.doesNotMatch(source, /flowdesk-evidence-grid/);
  assert.doesNotMatch(source, /createStructuredEvidencePresentation/);
  assert.doesNotMatch(source, /createDerivedAcceptancePresentation/);
  assert.doesNotMatch(source, /producer 未提供验收项/);
});


test("技术诊断按当前任务和直接子任务分组并折叠机器字段", () => {
  assert.match(source, /flowdesk-diagnostic-task-group/);
  assert.match(source, /flowdesk-diagnostic-task-link/);
  assert.match(source, /flowdesk-diagnostic-issue/);
  assert.match(source, /flowdesk-diagnostic-issue-summary/);
  assert.match(source, /flowdesk-diagnostic-action/);
  assert.match(source, /flowdesk-diagnostic-supporting-details/);
  assert.match(source, /this\.openTask\(group\.taskId, "child", event\)/);
  assert.match(
    source,
    /resolveDiagnosticDisclosureOpen\([\s\S]*?this\.disclosureState,[\s\S]*?disclosureKey/
  );
  assert.match(styles, /\.flowdesk-diagnostic-task-group/);
  assert.match(styles, /\.flowdesk-diagnostic-issue\[open\]/);
  assert.match(styles, /\.flowdesk-diagnostic-supporting-details/);
});

test("技术诊断长内容不能撑宽侧栏", () => {
  assert.match(
    styles,
    /\.flowdesk-detail-body\s*\{[^}]*min-width:\s*0;/s
  );
  assert.match(
    styles,
    /\.flowdesk-dashboard-section\s*\{[^}]*min-width:\s*0;/s
  );
  assert.match(
    styles,
    /\.flowdesk-diagnostic-task-group,[\s\S]*?\.flowdesk-diagnostic-item-body\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s
  );
  assert.match(
    styles,
    /\.flowdesk-diagnostic-source\s*\{[^}]*min-width:\s*0;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s
  );
});

test("技术诊断整体默认折叠并保留展开状态", () => {
  assert.match(
    source,
    /const diagnostics = body\.createEl\("details"[\s\S]*?diagnostics\.open = this\.disclosureState\.technicalDiagnosticsOpen[\s\S]*?this\.disclosureState\.technicalDiagnosticsOpen = diagnostics\.open/
  );
  assert.match(
    styles,
    /\.flowdesk-diagnostics-section > summary\s*\{[^}]*list-style:\s*none;/s
  );
  assert.match(
    styles,
    /\.flowdesk-diagnostics-section > summary::before/
  );
});

test("诊断来源使用无按钮底色的文本链接", () => {
  assert.match(
    styles,
    /\.flowdesk-dashboard \.flowdesk-diagnostic-source\s*\{[^}]*height:\s*auto;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*white-space:\s*normal;/s
  );
  assert.match(
    styles,
    /\.flowdesk-dashboard \.flowdesk-diagnostic-source:hover\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s
  );
});

test("只读清单复选框继承正文行高以垂直对齐首行文字", () => {
  assert.match(
    styles,
    /\.markdown-rendered li > input\[type="checkbox"\],\s*\n:is\([^\n]+\) \.markdown-rendered li > p > input\[type="checkbox"\]\s*\{[^}]*font-size:\s*inherit;[^}]*line-height:\s*inherit;/s
  );
});

test("恢复 0.1.2 的可读字号、任务卡片与可信度条边界", () => {
  assert.match(
    styles,
    /\.flowdesk-dashboard\s*\{[^}]*font-size:\s*13px;[^}]*line-height:\s*1\.45;/s
  );
  assert.match(
    styles,
    /\.flowdesk-task-header\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*8px;/s
  );
  assert.match(
    styles,
    /\.flowdesk-trust-summary\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*7px;/s
  );
  assert.match(
    styles,
    /\.flowdesk-diagnostic-row,[\s\S]*?font-size:\s*12px;/
  );
});

test("历史结构化 evidence 的样式继续保留", () => {
  assert.match(
    styles,
    /\.flowdesk-evidence-fields\s*\{[^}]*border-top:\s*1px solid var\(--fd-border\);[^}]*overflow-wrap:\s*anywhere;/s
  );
  assert.match(
    styles,
    /\.flowdesk-acceptance-evidence\s*\{[^}]*color:\s*var\(--text-muted\);/s
  );
  assert.doesNotMatch(source, /registerView\([^)]*review/i);
  assert.doesNotMatch(source, /addRibbonIcon\([^)]*复核/);
});
