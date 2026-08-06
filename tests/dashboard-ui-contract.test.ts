import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
const styles = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");

test("任务标题独占一行，元信息与工具栏使用独立容器", () => {
  assert.match(source, /flowdesk-task-title/);
  assert.match(source, /flowdesk-task-meta-row/);
  assert.match(source, /flowdesk-task-meta-actions/);
});

test("CLI 与刷新使用带无障碍名称的图标按钮", () => {
  assert.match(source, /setIcon\(copy, "copy"\)/);
  assert.match(source, /"aria-label": "复制 CLI"/);
  assert.match(source, /setIcon\(refresh, "refresh-cw"\)/);
  assert.match(source, /"aria-label": this\.loading \? "刷新中" : "刷新"/);
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
