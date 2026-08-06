import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
const styles = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");

test("任务标题独占一行，元信息与工具栏使用独立容器", () => {
  assert.match(source, /flowdesk-task-title/);
  assert.match(source, /flowdesk-task-path/);
  assert.match(source, /flowdesk-task-read-meta/);
  assert.match(source, /flowdesk-task-meta-row/);
  assert.match(source, /flowdesk-task-meta-actions/);
});

test("CLI 与刷新恢复 v0.1.1 风格文字按钮并保留无障碍名称", () => {
  assert.match(source, /text: "复制 CLI"/);
  assert.match(source, /"aria-label": "复制 CLI"/);
  assert.match(source, /text: this\.loading \? "刷新中" : "刷新"/);
  assert.match(source, /"aria-label": this\.loading \? "刷新中" : "刷新"/);
  assert.doesNotMatch(source, /setIcon\(/);
});

test("技术诊断使用来源标题和机器详情，不再平铺任务位置字段", () => {
  assert.match(source, /flowdesk-diagnostic-source/);
  assert.match(source, /flowdesk-machine-details/);
  assert.doesNotMatch(source, /diagnosticRow\(container, "任务"/);
  assert.doesNotMatch(source, /diagnosticRow\(container, "位置"/);
});

test("OpenSpec 元信息标签保持紧凑描边而不是胶囊卡片", () => {
  assert.match(
    styles,
    /\.flowdesk-toolbar-button\s*\{[^}]*min-width:\s*58px;[^}]*white-space:\s*nowrap;/s
  );
  assert.match(
    styles,
    /\.flowdesk-state-pill\s*\{[^}]*border-radius:\s*4px;[^}]*background:\s*transparent;[^}]*font-size:\s*10px;/s
  );
});

test("标题全宽且 child 使用分隔线列表", () => {
  assert.match(
    styles,
    /\.flowdesk-task-header\s*\{[^}]*display:\s*block;/s
  );
  assert.match(
    styles,
    /\.flowdesk-child-row\s*\{[^}]*border-bottom:/s
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

test("恢复 v0.1.1 的可读字号与线性 OpenSpec 分区", () => {
  assert.match(
    styles,
    /\.flowdesk-dashboard\s*\{[^}]*font-size:\s*13px;[^}]*line-height:\s*1\.45;/s
  );
  const taskHeader = styles.match(/\.flowdesk-task-header\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(taskHeader, /border-bottom:\s*1px solid/);
  assert.doesNotMatch(taskHeader, /border-radius|background:/);
  const trust = styles.match(/\.flowdesk-trust-summary\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(trust, /border-bottom:\s*1px solid/);
  assert.doesNotMatch(trust, /border-radius|background:/);
  const contract = styles.match(/\.flowdesk-contract-summary\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(contract, /border-top:\s*1px solid/);
  assert.doesNotMatch(contract, /border-radius|background:/);
  assert.match(
    styles,
    /\.flowdesk-diagnostic-row,[\s\S]*?font-size:\s*12px;/
  );
});
