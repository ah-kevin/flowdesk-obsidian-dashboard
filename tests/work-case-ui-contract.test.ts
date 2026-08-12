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
  const breakpoint = styles.match(/@container\s*\(max-width:\s*(\d+)px\)/);
  assert.ok(breakpoint);
  assert.equal(Number(breakpoint[1]), 420);
  const narrowRule = styles.match(
    /@container\s*\(max-width:\s*420px\)\s*\{([\s\S]*?)\n\}/
  );
  assert.ok(narrowRule);
  assert.match(narrowRule[1], /\.flowdesk-case-dashboard \.flowdesk-case-short-grid/);
  assert.match(narrowRule[1], /\.flowdesk-case-dashboard \.flowdesk-case-related-row/);
  assert.match(narrowRule[1], /grid-template-columns:\s*minmax\(0, 1fr\)/);

  const baseRelatedRow = styles.match(
    /\.flowdesk-case-dashboard \.flowdesk-case-recovery-row,\s*\.flowdesk-case-dashboard \.flowdesk-case-related-row\s*\{([^}]*)\}/s
  );
  assert.ok(baseRelatedRow);
  const baseColumns = baseRelatedRow[1].match(/grid-template-columns:\s*([^;]+);/);
  const narrowColumns = narrowRule[1].match(/grid-template-columns:\s*([^;]+);/);
  assert.ok(baseColumns);
  assert.ok(narrowColumns);

  const columnsAt = (width: number): string =>
    width <= Number(breakpoint[1]) ? narrowColumns[1].trim() : baseColumns[1].trim();
  assert.deepEqual(
    [320, 360, 420, 600].map((width) => [width, columnsAt(width)]),
    [
      [320, "minmax(0, 1fr)"],
      [360, "minmax(0, 1fr)"],
      [420, "minmax(0, 1fr)"],
      [600, "minmax(64px, auto) minmax(0, 1fr)"],
    ]
  );

  const caseBlocks = [...styles.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map((match) => match[1].trim())
    .filter((selector) => selector.includes("flowdesk-case-"));
  assert.ok(caseBlocks.length > 0);
  assert.ok(caseBlocks.every((selector) => selector.includes(".flowdesk-case-")));
});

test("关联导航长链接覆盖主题按钮的 nowrap 与 inline-flex 居中布局", () => {
  const relatedLinkRule = styles.match(
    /\.flowdesk-case-dashboard \.flowdesk-case-related \.flowdesk-case-related-link\s*\{([^}]*)\}/
  );
  assert.ok(relatedLinkRule, "关联导航按钮必须有独立 Case-scoped rule");

  for (const declaration of [
    /display:\s*block/,
    /width:\s*fit-content/,
    /max-width:\s*100%/,
    /white-space:\s*normal/,
    /overflow-wrap:\s*anywhere/,
    /word-break:\s*break-word/,
  ]) {
    assert.match(relatedLinkRule[1], declaration);
  }
});

test("关联任务使用纯静态响应式层级与 tone 状态 tag", () => {
  assert.match(
    styles,
    /\.flowdesk-case-dashboard \.flowdesk-case-count-grid\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*88px\),\s*1fr\)\)/s
  );
  assert.match(
    styles,
    /\.flowdesk-case-dashboard \.flowdesk-case-count \.flowdesk-case-label\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s
  );

  for (const [tone, color] of [
    ["active", "blue"],
    ["blocked", "red"],
    ["completed", "green"],
    ["archived", "text-muted"],
    ["unknown", "yellow"],
  ]) {
    const selector = new RegExp(
      `\\.flowdesk-case-dashboard \\.flowdesk-case-task-row\\.is-${tone} \\.flowdesk-case-task-status\\s*\\{([^}]*)\\}`
    );
    const rule = styles.match(selector);
    assert.ok(rule, `${tone} task status tag 必须有 Case-scoped tone rule`);
    assert.match(rule[1], new RegExp(`color:\\s*var\\(--fd-${color}\\)|color:\\s*var\\(--${color}\\)`));
  }

  assert.match(
    styles,
    /@container\s*\(max-width:\s*320px\)[\s\S]*?\.flowdesk-case-dashboard \.flowdesk-case-task-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
  );
  assert.match(
    styles,
    /@container\s*\(max-width:\s*320px\)[\s\S]*?\.flowdesk-case-dashboard \.flowdesk-case-task-status\s*\{[^}]*justify-self:\s*start;/s
  );
  const case420Start = styles.indexOf("@container (max-width: 420px)");
  const case320Start = styles.indexOf("@container (max-width: 320px)");
  assert.ok(case420Start >= 0 && case320Start > case420Start);
  const case420Rule = styles.slice(case420Start, case320Start);
  assert.doesNotMatch(case420Rule, /\.flowdesk-case-dashboard \.flowdesk-case-task-row/);

  assert.match(
    styles,
    /\.flowdesk-dashboard\s*\{[^}]*padding:\s*8px 10px 18px;/s
  );
  assert.match(
    styles,
    /@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*?\.flowdesk-dashboard\s*\{[^}]*padding-right:\s*11px;[^}]*padding-left:\s*11px;/s
  );
  const taskColumnsAt = (
    outerWidth: number,
    horizontalPadding: 20 | 22
  ): "single" | "double" => {
    return outerWidth - horizontalPadding <= 320 ? "single" : "double";
  };
  for (const horizontalPadding of [20, 22] as const) {
    assert.deepEqual(
      [320, 360, 420, 600].map((width) => [
        width,
        taskColumnsAt(width, horizontalPadding),
      ]),
      [
        [320, "single"],
        [360, "double"],
        [420, "double"],
        [600, "double"],
      ]
    );
  }
  assert.match(renderer, /const statuses = section\.createDiv\(\{ cls: "flowdesk-case-status-list" \}\)/);
  assert.doesNotMatch(renderer, /createEl\("details", \{ cls: "flowdesk-case-status-list"/);
});

test("父子徽标以紫色和青绿色区分但不复用状态色", () => {
  const roleRule = styles.match(
    /\.flowdesk-case-dashboard \.flowdesk-case-task-role\s*\{([^}]*)\}/
  );
  assert.ok(roleRule);
  for (const declaration of [
    /border-radius:\s*50%/,
    /width:\s*18px/,
    /height:\s*18px/,
  ]) {
    assert.match(roleRule[1], declaration);
  }
  for (const [role, token] of [["parent", "parent"], ["child", "child"]]) {
    const rule = styles.match(
      new RegExp(`\\.flowdesk-case-dashboard \\.flowdesk-case-task-role\\.is-${role}\\s*\\{([^}]*)\\}`)
    );
    assert.ok(rule, `${role} 徽标必须有独立颜色规则`);
    assert.match(rule[1], new RegExp(`var\\(--fd-${token}\\)`));
    assert.doesNotMatch(rule[1], /--fd-(?:blue|red|green|yellow)/);
  }
  assert.match(renderer, /if \(task\.relationRoles\.length\)/);
  assert.match(renderer, /"aria-label": role === "parent" \? "父任务" : "子任务"/);
});

test("Progress 时间线与案卷重点层级均保持 Case scoped", () => {
  assert.match(renderer, /flowdesk-case-progress-list/);
  assert.match(renderer, /flowdesk-case-progress-item\$\{index === 0 \? " is-latest" : ""\}/);
  assert.match(renderer, /flowdesk-case-progress-latest/);
  assert.match(renderer, /const primaryKeys = \["goal", "blockers", "outcome"\]/);
  assert.match(renderer, /const secondaryKeys = \["decisions", "discoveries"\]/);
  assert.match(renderer, /const moreKeys = \["candidatePatterns", "definitionOfDone"\]/);
  assert.match(styles, /\.flowdesk-case-dashboard \.flowdesk-case-progress-list\s*\{/);
  assert.match(styles, /\.flowdesk-case-dashboard \.flowdesk-case-progress-item\.is-latest\s*\{/);
  assert.match(styles, /\.flowdesk-case-dashboard \.flowdesk-case-record-group\.is-blockers\s*\{/);
  assert.match(styles, /\.flowdesk-case-dashboard \.flowdesk-case-record-group\.is-outcome\s*\{/);
});
