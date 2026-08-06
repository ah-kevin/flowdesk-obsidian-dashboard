# FlowDesk Dashboard 侧栏视觉与交互精细化实施计划

> **供智能代理执行：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用复选框语法跟踪。

**目标：** 将 Dashboard 0.1.5 的 Parent/Leaf 信息结构优化为适合 Obsidian 360–420 px 右侧栏的扁平紧凑界面，并让诊断标题直接表达问题和定位来源。

**架构：** 保持 schema 3 task-centric snapshot 解析、source identity 校验和 fail-closed 刷新流程不变。先在 `dashboard-presentation.ts` 中生成稳定的人类诊断标题、来源标签和机器详情，再由 `main.ts` 只负责语义 DOM、Obsidian 导航和折叠交互，最后由 `styles.css` 实现窄侧栏密度和 A 方案工具栏布局。

**技术栈：** TypeScript、Obsidian Plugin API、Node.js test runner、esbuild、CSS。

## 全局约束

- 只修改 `/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard`，不修改 FlowDesk Plugin producer。
- 只接受 `snapshot_schema_version=3` 且 `snapshot_model=task-centric`，不增加 legacy、v1 或 v2 fallback。
- Dashboard 保持只读，不修改 TaskNotes Markdown、任务状态或证据事实。
- 当前任务标题独占完整宽度；工具按钮位于标题下方元信息行右侧。
- 主诊断只保留一个可点击的真实问题标题，不增加重复的“打开任务并定位”按钮。
- 技术诊断默认不单列“任务”“位置”“字段路径”和 diagnostic code；完整机器事实进入“机器详情”。
- Parent 只展示 direct children 紧凑摘要，Leaf 不渲染空 children 区域。
- 所有用户可见文案使用中文；机器标识只进入机器详情。
- 发布目标版本为 `0.1.6`，GitHub Release tag 为 `v0.1.6`。

---

### Task 1：建立可行动诊断展示模型

**文件：**

- 修改：`src/dashboard-presentation.ts`
- 修改：`tests/dashboard-presentation.test.ts`

**接口：**

- 消费：`SnapshotDiagnostic`、`DashboardViewModel.currentTask.id`、`DashboardViewModel.diagnostics`、合同覆盖与证据健康字段。
- 产出：`DashboardDiagnosticPresentation`、`createDiagnosticPresentation(diagnostic, currentTaskId)`、`DashboardPresentation.diagnostics`、结构化合同指标和紧凑可信来源。

- [ ] **Step 1：编写真实问题标题与来源标签失败测试**

在 `tests/dashboard-presentation.test.ts` 增加：

```ts
test("合同块缺失诊断直接说明问题并生成紧凑来源", () => {
  const snapshot = createSnapshot();
  snapshot.contract.semantic_status = "invalid";
  snapshot.diagnostics = [{
    code: "task_contract_count_invalid",
    severity: "error",
    task_id: taskId,
    path: "contract",
    source: { section: "Task Contract v3", line_start: 1 },
    reason: { actual: "找到 0 个 ## Task Contract v3", expected: "唯一合同块" },
    remediation: { summary: "补充唯一的 v3 task 合同块" },
  }];

  const presentation = createDashboardPresentation(
    createDashboardViewModel(snapshot, { expectedTaskPath: taskId })
  );

  assert.equal(presentation.primaryStatus.title, "缺少 Task Contract v3");
  assert.equal(presentation.diagnostics[0].sourceLabel, "Task Contract v3 · 第 1 行");
  assert.equal(presentation.diagnostics[0].actual, "找到 0 个 ## Task Contract v3");
  assert.equal(presentation.diagnostics[0].expected, "唯一合同块");
  assert.equal(presentation.diagnostics[0].remediation, "补充唯一的 v3 task 合同块");
});

test("跨 task 诊断在来源标题中加入任务名", () => {
  const diagnostic = {
    code: "verification_missing",
    severity: "error",
    taskId: "Tasks/Child Review.md",
    path: "evidence.verification",
    source: { section: "Verification Result", line_start: 41 },
    reason: "缺少验证证据",
    expected: "至少一条验证结果",
    remediation: "补充验证命令与结果",
  };

  assert.equal(
    createDiagnosticPresentation(diagnostic, taskId).sourceLabel,
    "Child Review · Verification Result · 第 41 行"
  );
});

test("合同摘要提供四个可直接渲染的紧凑指标", () => {
  const presentation = createDashboardPresentation(createModel());
  assert.deepEqual(presentation.contract.metrics, [
    { label: "REQ / SCN", value: "2 / 1" },
    { label: "验收", value: "1 / 2" },
    { label: "证据有效", value: "2 / 3" },
    { label: "诊断", value: "0" },
  ]);
  assert.equal(presentation.trust.sourceLabel, "snapshot v3 · task-centric");
});
```

- [ ] **Step 2：运行测试并确认 RED**

运行：`npm test`

预期：失败，提示 `createDiagnosticPresentation` 未导出且 `DashboardPresentation` 没有 `diagnostics`。

- [ ] **Step 3：定义诊断展示类型和转换函数**

在 `src/dashboard-presentation.ts` 增加：

```ts
export interface DashboardDiagnosticPresentation {
  title: string;
  sourceLabel: string;
  actual: string;
  expected: string;
  remediation: string;
  machine: {
    code: string;
    taskId: string;
    path: string;
    location: string;
  };
  diagnostic: SnapshotDiagnostic;
}

export function createDiagnosticPresentation(
  diagnostic: SnapshotDiagnostic,
  currentTaskId: string
): DashboardDiagnosticPresentation {
  const location = diagnosticLocation(diagnostic);
  const belongsToCurrentTask = diagnostic.taskId === currentTaskId;
  const taskPrefix = belongsToCurrentTask
    ? ""
    : `${formatTaskReference(diagnostic.taskId)} · `;
  return {
    title: diagnosticActionTitle(diagnostic),
    sourceLabel: `${taskPrefix}${location}`,
    actual: diagnostic.reason,
    expected: diagnostic.expected,
    remediation: diagnostic.remediation,
    machine: {
      code: diagnostic.code,
      taskId: diagnostic.taskId,
      path: diagnostic.path,
      location,
    },
    diagnostic,
  };
}
```

`DashboardPresentation` 增加 `diagnostics: DashboardDiagnosticPresentation[]`，`createDashboardPresentation` 使用：

```ts
diagnostics: model.diagnostics.map((diagnostic) =>
  createDiagnosticPresentation(diagnostic, model.currentTask.id)
),
```

`DashboardContractPresentation` 增加结构化 `metrics: Array<{ label: string; value: string }>`，证据指标以 execution、verification、delivery 中 `valid` 的数量计算。`DashboardTrustPresentation` 增加 `sourceLabel: string` 与 `tooltip: string`：前者只显示 `model.schemaLabel`，后者保存 generated/loaded time、stale reason 和完整观察说明。DOM 不得从展示字符串中反向拆分字段。

- [ ] **Step 4：实现稳定的人类诊断标题**

用诊断 code、path 和实际原因生成标题，至少覆盖：

```ts
function diagnosticActionTitle(diagnostic: SnapshotDiagnostic): string {
  if (diagnostic.code === "task_contract_count_invalid") {
    return /找到\s*0\s*个/.test(diagnostic.reason)
      ? "缺少 Task Contract v3"
      : "Task Contract v3 数量不正确";
  }
  const labels: Record<string, string> = {
    "contract.goal": "任务目标需要修复",
    "evidence.execution": "执行结果需要修复",
    "evidence.verification": "验证结果需要修复",
    "evidence.delivery": "交付记录需要修复",
  };
  if (labels[diagnostic.path]) return labels[diagnostic.path];
  if (diagnostic.path.startsWith("contract.")) return "任务合同需要修复";
  if (diagnostic.path.startsWith("evidence.")) return "执行证据需要修复";
  return "当前任务存在结构化诊断";
}
```

`createPrimaryStatus` 与完整诊断共用 `diagnosticActionTitle`，避免主卡和技术详情使用两套标题。

- [ ] **Step 5：运行测试并确认 GREEN**

运行：`npm test`

预期：全部测试通过，新增测试证明诊断标题、当前 task 来源和跨 task 来源稳定。

- [ ] **Step 6：提交展示模型**

```bash
git add src/dashboard-presentation.ts tests/dashboard-presentation.test.ts
git commit -m "feat: refine dashboard diagnostic presentation"
```

---

### Task 2：重构侧栏 DOM 与导航语义

**文件：**

- 修改：`src/main.ts`
- 新建：`tests/dashboard-ui-contract.test.ts`

**接口：**

- 消费：`DashboardPresentation.diagnostics`、`openTask(taskPath)`、`openDiagnosticLocation(diagnostic)`、Obsidian `setIcon`。
- 产出：全宽标题、标题下方元信息工具栏、单入口主诊断、紧凑 child 行、诊断机器详情。

- [ ] **Step 1：编写 DOM 结构契约失败测试**

新建 `tests/dashboard-ui-contract.test.ts`：

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");

test("任务标题独占一行，元信息与工具栏使用独立容器", () => {
  assert.match(source, /flowdesk-task-title/);
  assert.match(source, /flowdesk-task-meta-row/);
  assert.match(source, /flowdesk-task-meta-actions/);
});

test("CLI 与刷新使用带无障碍名称的图标按钮", () => {
  assert.match(source, /setIcon\(copy, "copy"\)/);
  assert.match(source, /aria-label.*复制 CLI/);
  assert.match(source, /setIcon\(refresh, "refresh-cw"\)/);
  assert.match(source, /aria-label.*刷新/);
});

test("技术诊断使用来源标题和机器详情，不再平铺任务位置字段", () => {
  assert.match(source, /flowdesk-diagnostic-source/);
  assert.match(source, /flowdesk-machine-details/);
  assert.doesNotMatch(source, /diagnosticRow\(container, "任务"/);
  assert.doesNotMatch(source, /diagnosticRow\(container, "位置"/);
});
```

- [ ] **Step 2：运行测试并确认 RED**

运行：`npm test`

预期：失败，因为新容器、图标按钮和机器详情尚未实现，旧代码仍平铺“任务”“位置”。

- [ ] **Step 3：将标题与工具栏改为 A 方案**

从 `obsidian` 导入 `setIcon`。`renderHeader` 按以下 DOM 顺序创建：

```ts
const header = container.createDiv({ cls: "flowdesk-task-header" });
const heading = header.createDiv({ cls: "flowdesk-task-heading" });
// 可选 Parent 返回标题
const currentTitle = heading.createEl("button", {
  cls: "flowdesk-task-title flowdesk-current-task-link",
  text: presentation.header.title,
});
currentTitle.addEventListener("click", () => void this.openTask(model.currentTask.id));

const metaRow = header.createDiv({ cls: "flowdesk-task-meta-row" });
const badges = metaRow.createDiv({ cls: "flowdesk-task-badges" });
// status、kind、priority、blocked
const actions = metaRow.createDiv({ cls: "flowdesk-task-meta-actions" });
this.renderToolbar(actions, model.currentTask.id);
```

`renderLoadingHeader` 使用同一结构，保证首次加载与成功态不会发生大幅跳版。

- [ ] **Step 4：将文字按钮改成图标按钮**

`renderToolbar` 创建约 26 px 的按钮，并设置 Obsidian 图标、tooltip 和无障碍名称：

```ts
const copy = toolbar.createEl("button", {
  cls: "flowdesk-toolbar-button",
  attr: { "aria-label": "复制 CLI", title: "复制 CLI" },
});
setIcon(copy, "copy");

const refresh = toolbar.createEl("button", {
  cls: "flowdesk-toolbar-button",
  attr: {
    "aria-label": this.loading ? "刷新中" : "刷新",
    title: this.loading ? "刷新中" : "刷新",
  },
});
setIcon(refresh, "refresh-cw");
```

保留现有复制成功/失败 Notice、loading disabled 和刷新逻辑。

- [ ] **Step 5：重构可信状态、主诊断和 child 行 DOM**

- 可信状态只保留一行：状态点、`trust.label`、`trust.sourceLabel`、右侧 `contractLabel`。
- 完整时间和 `trust.detail` 放入 `title` 或内部技术信息，不在首屏平铺。
- 主诊断存在 warning/error 时 kicker 使用“需要处理”；健康状态使用“状态正常”。可点击标题是唯一跳转入口；保留紧凑“原因”和“建议”，删除独立位置行。
- child 行改为状态点、标题/摘要和单行状态，删除每行大胶囊与卡片容器视觉依赖。

主诊断结构使用：

```ts
card.createDiv({ cls: "flowdesk-card-kicker", text: "需要处理" });
const title = card.createEl("button", {
  cls: "flowdesk-primary-title flowdesk-diagnostic-link",
  text: status.title,
});
title.addEventListener("click", () => {
  void this.openDiagnosticLocation(status.diagnostic as SnapshotDiagnostic);
});
diagnosticRow(card, "原因", status.reason);
diagnosticRow(card, "建议", status.remediation);
```

- [ ] **Step 6：重构合同指标与技术诊断 DOM**

- 合同 summary 标题右侧显示诊断数量。
- 遍历 `summary.metrics` 渲染四个独立指标单元，每个单元直接使用 `metric.value` 与 `metric.label`，不解析旧 chip 文案。
- `renderDetails` 遍历 `presentation.diagnostics`，来源标题作为定位按钮。
- “实际、预期、修复”默认显示；机器 code、task ID、path 和位置进入嵌套 `details.flowdesk-machine-details`。

技术诊断结构使用：

```ts
const diagnosticLink = item.createEl("button", {
  cls: "flowdesk-diagnostic-source",
  text: `${diagnostic.sourceLabel} →`,
});
diagnosticLink.addEventListener("click", () => {
  void this.openDiagnosticLocation(diagnostic.diagnostic);
});
diagnosticRow(item, "实际", diagnostic.actual);
diagnosticRow(item, "预期", diagnostic.expected);
diagnosticRow(item, "修复", diagnostic.remediation);

const machine = item.createEl("details", { cls: "flowdesk-machine-details" });
machine.createEl("summary", { text: "机器详情" });
diagnosticRow(machine, "错误码", diagnostic.machine.code);
diagnosticRow(machine, "任务", diagnostic.machine.taskId);
diagnosticRow(machine, "字段", diagnostic.machine.path);
diagnosticRow(machine, "来源", diagnostic.machine.location);
```

- [ ] **Step 7：运行测试与静态检查**

运行：

```bash
npm test
npx tsc --noEmit
npm run build
node -c main.js
```

预期：全部通过；构建后的 `main.js` 语法有效。

- [ ] **Step 8：提交 DOM 与交互重构**

```bash
git add src/main.ts tests/dashboard-ui-contract.test.ts main.js
git commit -m "feat: streamline dashboard sidebar interactions"
```

---

### Task 3：实现窄侧栏视觉层级与响应式密度

**文件：**

- 修改：`styles.css`
- 修改：`tests/dashboard-ui-contract.test.ts`

**接口：**

- 消费：Task 2 新增的 `.flowdesk-task-meta-row`、`.flowdesk-toolbar-button`、`.flowdesk-diagnostic-source`、`.flowdesk-machine-details` 等 DOM class。
- 产出：360–420 px 单列侧栏视觉、A 方案工具行、扁平 child 列表和轻量合同区。

- [ ] **Step 1：补充 CSS 契约失败测试**

在 `tests/dashboard-ui-contract.test.ts` 增加：

```ts
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("侧栏工具按钮与元信息标签使用协调尺寸", () => {
  assert.match(styles, /\.flowdesk-toolbar-button[\s\S]*width:\s*26px/);
  assert.match(styles, /\.flowdesk-toolbar-button[\s\S]*height:\s*26px/);
  assert.match(styles, /\.flowdesk-state-pill[\s\S]*min-height:\s*22px/);
});

test("标题全宽且 child 使用分隔线列表", () => {
  assert.match(styles, /\.flowdesk-task-header[\s\S]*display:\s*block/);
  assert.match(styles, /\.flowdesk-child-row[\s\S]*border-bottom:/);
});

test("极窄侧栏允许工具组换行但不改变标题宽度", () => {
  assert.match(styles, /@media \(max-width:\s*360px\)/);
  assert.match(styles, /\.flowdesk-task-meta-actions[\s\S]*margin-left:\s*auto/);
});
```

- [ ] **Step 2：运行测试并确认 RED**

运行：`npm test`

预期：失败，现有 CSS 仍使用横向 header、大按钮、child 卡片和 520 px 粗粒度断点。

- [ ] **Step 3：建立侧栏密度 token 和全宽标题**

- Dashboard 根间距改为 10–12 px，横向 padding 改为 12–14 px。
- `.flowdesk-task-header` 使用 `display: block`；标题 15–16 px、约 700 字重、1.35 行高。
- `.flowdesk-current-task-link` 重置通用 button 的边框、背景和 padding，保持普通主标题颜色；仅在 hover/focus 时显示可导航反馈，不能渲染成紫色大按钮。
- `.flowdesk-task-meta-row` 使用 flex，标签组在左、工具组在右，统一 `align-items: center` 和 4–6 px gap。
- `.flowdesk-state-pill` 使用约 22 px 最小高度；`.flowdesk-toolbar-button` 固定 26 × 26 px，图标 13–14 px。
- 工具按钮使用与标签协调的中性背景和圆角，但 hover/focus 对比度高于不可点击标签。

- [ ] **Step 4：扁平化可信状态、child 和合同区域**

- `.flowdesk-trust-summary` 改为上下分隔线的一行状态，不使用大面积背景和 4 px 左边。
- `.flowdesk-child-list` 取消 grid card gap；`.flowdesk-child-row` 使用上下 padding 和 `border-bottom`，移除圆角、面板背景和粗左边。
- child 状态用 7–8 px 状态点和单行状态文字，标题约 12.5–13 px。
- `.flowdesk-contract-summary` 只保留上下分隔线，移除独立面板背景和大圆角。
- 合同指标使用四等分轻背景单元，单元之间仅用细分隔线。

- [ ] **Step 5：细化主诊断与机器详情**

- 主诊断保留轻 error/warning/healthy 背景和 3 px 左边，圆角 7–8 px，padding 10–12 px。
- 主诊断标题约 14 px，不使用高饱和品牌紫作为正文色。
- `.flowdesk-diagnostic-source` 使用 11 px 强调链接；实际/预期/修复使用紧凑两列行。
- `.flowdesk-machine-details` 默认关闭，字号 9.5–10.5 px，颜色弱于普通详情。

- [ ] **Step 6：增加 360 px 极窄状态**

在 `@media (max-width: 360px)` 中：

- `.flowdesk-task-meta-row` 允许换行。
- `.flowdesk-task-meta-actions` 整组保持右对齐并使用 `margin-left: auto`。
- 标签允许换行，工具按钮不缩小、不纵向断字。
- 合同四指标允许变为两列，但不得出现水平滚动。

- [ ] **Step 7：运行测试与构建验证**

运行：

```bash
npm test
npm run build
npx tsc --noEmit
node -c main.js
git diff --check
```

预期：全部通过且 `git diff --check` 无输出。

- [ ] **Step 8：提交侧栏样式**

```bash
git add styles.css tests/dashboard-ui-contract.test.ts main.js
git commit -m "style: polish dashboard for narrow sidebars"
```

---

### Task 4：版本、发布包与发布后侧栏验收

**文件：**

- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`manifest.json`
- 修改：`versions.json`
- 修改：`main.js`
- 生成：`release/flowdesk-dashboard-0.1.6.zip`

**接口：**

- 消费：Task 1–3 已验证的源码、样式和构建产物。
- 产出：版本一致的 0.1.6 release commit、tag 和 GitHub Release 资产。

- [ ] **Step 1：将版本统一更新为 0.1.6**

- `package.json` 和 `package-lock.json` 的 version 改为 `0.1.6`。
- `manifest.json.version` 改为 `0.1.6`。
- `versions.json` 增加 `"0.1.6": "1.5.0"`。

- [ ] **Step 2：运行完整发布验证**

运行：`npm run release:prepare`

预期依次通过：

- `npm test`
- `npm run build`
- `npm run typecheck`
- `npm run check:syntax`
- `npm run release:verify`
- `npm run release:package`

并生成 `release/flowdesk-dashboard-0.1.6.zip`。

- [ ] **Step 3：验证 canonical producer fixture 等值**

运行：`npm test`

预期：`tests/snapshot-model.test.ts` 中 canonical producer fixture 与 bundled fixture 等值测试通过，schema 3 task-centric 解析没有发生漂移。

- [ ] **Step 4：完成发布前静态视觉契约检查**

检查 `styles.css` 和 `src/main.ts` 的最终 diff，确认：

1. 标题 DOM 在元信息行之前，且标题容器不包含工具栏。
2. 元信息标签约 22 px，按钮为 26 × 26 px，并使用相同对齐基线。
3. 360 px media query 只让元信息与工具组换行，不修改标题宽度。
4. child 行没有面板背景、粗左边和大状态胶囊。
5. 默认技术诊断没有独立“任务”“位置”“字段路径”和错误码行。
6. 完整 task path、字段 path 和 diagnostic code 只存在于机器详情。

- [ ] **Step 5：提交 0.1.6 发布准备**

```bash
git add package.json package-lock.json manifest.json versions.json main.js styles.css
git commit -m "chore: release dashboard v0.1.6"
```

- [ ] **Step 6：推送分支并创建 PR**

```bash
git push -u origin codex/dashboard-sidebar-polish
gh pr create --base main --head codex/dashboard-sidebar-polish --title "优化 Dashboard 侧栏视觉与诊断交互" --body-file /tmp/flowdesk-dashboard-sidebar-pr.md
```

PR 正文必须列出 Parent、Leaf、技术诊断和 360 px smoke 结果，以及完整验证命令。

- [ ] **Step 7：PR 合并后发布 v0.1.6**

```bash
gh pr merge --merge --delete-branch
git switch main
git pull --ff-only origin main
git tag v0.1.6
git push origin v0.1.6
```

tag push 后由 `.github/workflows/release.yml` 自动创建 GitHub Release 并上传 `main.js`、`manifest.json`、`styles.css`、`versions.json` 和 zip。

- [ ] **Step 8：验证 GitHub Release**

运行：

```bash
gh release view v0.1.6 --json tagName,isDraft,isPrerelease,assets,url
gh run list --workflow release.yml --limit 3
```

预期：Release 非 draft、非 prerelease；tag 为 `v0.1.6`；五个资产完整；最新 tag workflow 成功。

Release 可供 BRAT 获取后，由用户在 Obsidian 中按约 360 px 和 420 px 两种宽度完成 smoke：Parent 首次打开、Leaf 返回 Parent、标题全宽、工具行对齐、诊断定位、非 task 清空、同 task stale 与跨 task fail closed。发现问题时在当前任务和分支上修正，不另建无关实施卡。
