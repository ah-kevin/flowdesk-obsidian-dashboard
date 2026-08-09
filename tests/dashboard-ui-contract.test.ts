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
  assert.match(source, /this\.openTask\(child\.id, "child"\)/);
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
  assert.match(source, /text: "↑ 父任务"/);
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

test("人工复核复用原生 Modal 并以 TaskNotes 为写入底座", () => {
  assert.match(source, /class EvidenceReviewModal extends Modal/);
  assert.match(source, /buildTaskNotesReviewWrite\(/);
  assert.match(source, /canReviewTask\(/);
  assert.match(source, /"approved"/);
  assert.match(source, /"changes_requested"/);
  assert.match(source, /details\/append/);
  assert.match(source, /await this\.refreshCurrentTask\(\)/);
  assert.doesNotMatch(source, /shell:\s*true/);
  // 不再依赖 evidence CLI 与 digest CAS。
  assert.doesNotMatch(source, /flowdesk-evidence/);
  assert.doesNotMatch(source, /evidenceBundleDigest/);
  assert.doesNotMatch(source, /review_conflict/);
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

test("REQ 与 SCN 使用独立详情，并为场景保留结构和来源入口", () => {
  assert.match(source, /flowdesk-contract-item-details/);
  assert.match(source, /flowdesk-contract-item-source/);
  assert.match(source, /flowdesk-scenario-steps/);
  assert.match(source, /createContractItemPresentation\(/);
  assert.match(source, /openSnapshotSource\(/);
  assert.match(styles, /\.flowdesk-contract-item-details > summary/);
  assert.match(styles, /\.flowdesk-contract-item-id/);
  assert.match(styles, /\.flowdesk-scenario-steps/);
  assert.match(source, /section\.open = open/);
  assert.match(source, /onToggle\(section\.open\)/);
});

test("完整详情保留合同与观察的原型布局", () => {
  assert.match(source, /text: "合同与交付详情"/);
  assert.match(source, /flowdesk-contract-section-head/);
  assert.match(source, /flowdesk-observation-summary/);
  assert.match(source, /flowdesk-observation-details/);
  assert.match(source, /"任务合同 v4"[\s\S]*?"观察与来源"/);
  assert.match(
    source,
    /const body = full\.createDiv[\s\S]*?resolveDetailSectionOrder\(diagnosticCount > 0\)/
  );
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

test("父子进度在主区展示可信完成计数、阻塞与下一步", () => {
  assert.match(source, /flowdesk-child-section/);
  assert.match(source, /直接子任务 · \$\{children\.length\}/);
  assert.match(source, /childrenTrustedDone\}\/\$\{model\.rollup\.childrenTotal\}/);
  // 主状态卡必须消费 rollup 与 next_actions，而不是只讲合同状态。
  assert.match(presentationSource, /createProgressStatus/);
  assert.match(presentationSource, /blockedChildren/);
  assert.match(presentationSource, /incompleteChildren/);
  assert.match(presentationSource, /个子任务可信完成/);
});

test("技术诊断按当前任务和直接子任务分组并折叠机器字段", () => {
  assert.match(source, /flowdesk-diagnostic-task-group/);
  assert.match(source, /flowdesk-diagnostic-task-link/);
  assert.match(source, /flowdesk-diagnostic-issue/);
  assert.match(source, /flowdesk-diagnostic-issue-summary/);
  assert.match(source, /flowdesk-diagnostic-action/);
  assert.match(source, /flowdesk-diagnostic-supporting-details/);
  assert.match(source, /this\.openTask\(group\.taskId, "child"\)/);
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

test("review 与结构化 evidence 只复用现有视觉 token 做最小增量", () => {
  assert.match(
    styles,
    /\.flowdesk-review-button\s*\{[^}]*color:\s*var\(--text-accent\);/s
  );
  assert.match(
    styles,
    /\.flowdesk-evidence-fields\s*\{[^}]*border-top:\s*1px solid var\(--fd-border\);[^}]*overflow-wrap:\s*anywhere;/s
  );
  assert.match(
    styles,
    /\.flowdesk-acceptance-evidence\s*\{[^}]*color:\s*var\(--text-muted\);/s
  );
  assert.match(
    styles,
    /\.flowdesk-review-modal textarea\s*\{[^}]*width:\s*100%;/s
  );
  assert.doesNotMatch(source, /registerView\([^)]*review/i);
  assert.doesNotMatch(source, /addRibbonIcon\([^)]*复核/);
});
