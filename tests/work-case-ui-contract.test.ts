import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const renderer = readFileSync(
  path.join(process.cwd(), "src", "work-case-renderer.ts"),
  "utf8"
);
const presentation = readFileSync(
  path.join(process.cwd(), "src", "work-case-presentation.ts"),
  "utf8"
);
const caseUiSource = `${renderer}\n${presentation}`;
const caseImplementation = [
  "work-case-adapter.ts",
  "work-case-invocation.ts",
  "work-case-model.ts",
  "work-case-presentation.ts",
  "work-case-renderer.ts",
]
  .map((file) => readFileSync(path.join(process.cwd(), "src", file), "utf8"))
  .join("\n");
const styles = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");

test("Case renderer 只提供只读恢复驾驶舱与 Obsidian 导航", () => {
  for (const visible of [
    "WORK CASE",
    "做到哪了",
    "下一步",
    "当前风险/阻塞",
    "未提交/待处理",
    "关联任务",
    "最近 Progress",
    "案卷内容",
  ]) {
    assert.match(caseUiSource, new RegExp(visible));
  }
  for (const forbidden of ["park", "resume", "completeCase", "updateCurrent", '"PATCH"', '"POST"']) {
    assert.equal(caseImplementation.includes(forbidden), false, forbidden);
  }
  assert.match(renderer, /openTask/);
  assert.match(renderer, /openCaseSource/);
  assert.match(renderer, /openRelated/);
  assert.match(renderer, /reset\(container: HTMLElement\)/);
  const mainSource = readFileSync(path.join(process.cwd(), "src", "main.ts"), "utf8");
  assert.match(
    mainSource,
    /container\.empty\(\);\s*this\.caseRenderer\.reset\(container\);\s*container\.addClass\("flowdesk-dashboard"\)/s
  );
});

test("所有 Case CSS 均使用独立作用域并覆盖 320/360/420/600px contract", () => {
  assert.match(styles, /\.flowdesk-case-dashboard\s*\{[^}]*container-type:\s*inline-size;/s);
  assert.match(styles, /\.flowdesk-case-dashboard[^}]*min-width:\s*0;/s);
  assert.match(styles, /\.flowdesk-case-short-grid\s*\{[^}]*repeat\(auto-fit,[^}]*220px/s);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /@container\s*\(max-width:\s*420px\)/);
  const narrowRule = styles.match(
    /@container\s*\(max-width:\s*420px\)\s*\{([\s\S]*?)\n\}/
  );
  assert.ok(narrowRule);
  assert.match(narrowRule[1], /\.flowdesk-case-dashboard \.flowdesk-case-short-grid/);
  assert.match(narrowRule[1], /grid-template-columns:\s*minmax\(0, 1fr\)/);
  for (const width of [320, 360, 420, 600]) {
    const expected = width <= 420 ? "single" : "auto-fit";
    const actual = width <= 420 && narrowRule ? "single" : "auto-fit";
    assert.equal(actual, expected, `${width}px`);
  }

  const caseBlocks = [...styles.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map((match) => match[1].trim())
    .filter((selector) => selector.includes("flowdesk-case-"));
  assert.ok(caseBlocks.length > 0);
  assert.ok(caseBlocks.every((selector) => selector.includes(".flowdesk-case-")));
});
