# FlowDesk Dashboard 渐进披露与首次加载修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Dashboard 改造成行动优先、Parent/Leaf 职责清晰的渐进披露控制台，并消除布局恢复时首次打开偶发空白。

**Architecture:** 保持 schema 3 task-centric snapshot 解析与 fail-closed 校验不变，新建纯 TypeScript presentation 层，把可信度、主诊断、child 行和合同摘要转换为稳定的中文显示模型。Obsidian `ItemView` 只负责生命周期、DOM 与导航；首次同步由视图实例在 workspace layout ready 后触发，不再依赖插件级临时查找。完整合同与机器诊断保留在第二层详情中。

**Tech Stack:** TypeScript、Obsidian Plugin API、Node.js test runner、esbuild、CSS。

## Global Constraints

- 只修改 `/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard`，不修改 FlowDesk Plugin producer。
- 只接受 `snapshot_schema_version=3` 且 `snapshot_model=task-centric`，不增加 legacy、v1 或 v2 fallback。
- Dashboard 保持只读，不修改 TaskNotes Markdown、task 状态或依赖事实。
- 当前 task 主标题唯一；Parent、child 与诊断标题承担导航，不保留重复“打开”按钮。
- 顶部独立操作只保留“复制 CLI”和“刷新”。
- 合同与证据摘要默认展开，完整合同、证据与机器诊断默认关闭；同 task 刷新保持选择，切换 task 重置。
- 同 task 刷新失败可显示带明确 stale 标记的上次成功结果；跨 task、非 task 与 source mismatch 必须清空旧内容。
- 所有用户可见文案使用中文，机器标识只进入技术详情。
- 发布版本为 `0.1.5`，GitHub Release tag 为 `v0.1.5`。

---

### Task 1: 建立 presentation model 与渐进展开状态

**Files:**
- Create: `src/dashboard-presentation.ts`
- Create: `tests/dashboard-presentation.test.ts`
- Modify: `src/dashboard-state.ts`
- Modify: `tests/dashboard-state.test.ts`

**Interfaces:**
- Consumes: `DashboardViewModel`、`DashboardChildViewModel`、`SnapshotDiagnostic`、`EvidenceHealth`。
- Produces: `createDashboardPresentation(model)`、`DashboardPresentation`、`DisclosureState`、`resolveDisclosureState(previous, taskChanged)`。

- [ ] **Step 1: 为人类摘要、Parent/Leaf child 行和展开状态编写失败测试**

```ts
test("诊断默认摘要只给出可行动信息，机器字段留给技术详情", () => {
  const presentation = createDashboardPresentation(modelWithGoalDiagnostic);
  assert.deepEqual(presentation.primaryStatus, {
    tone: "error",
    title: "任务目标需要修复",
    reason: "Goal 为空或包含占位内容",
    remediation: "补写当前 task 的单一交付目标并删除占位内容",
    location: "Goal · 第 1 行",
    diagnostic: modelWithGoalDiagnostic.primaryDiagnostic,
  });
  assert.equal(presentation.primaryStatus.title.includes("task_goal_invalid"), false);
});

test("Parent 只生成 direct child 紧凑行，Leaf 不生成空 child 区域", () => {
  const parent = createDashboardPresentation(parentModel);
  assert.equal(parent.kind, "parent");
  assert.deepEqual(parent.children[0], {
    id: "Tasks/Child.md",
    title: "Child",
    status: "进行中",
    tone: "running",
    summary: "等待当前任务验证",
    meta: "验证无效",
  });
  assert.deepEqual(createDashboardPresentation(leafModel).children, []);
});

test("合同摘要默认展开，完整详情默认关闭，同 task 刷新保持选择", () => {
  const initial = resolveDisclosureState(undefined, true);
  assert.deepEqual(initial, { summaryOpen: true, fullOpen: false });
  assert.deepEqual(
    resolveDisclosureState({ summaryOpen: false, fullOpen: true }, false),
    { summaryOpen: false, fullOpen: true }
  );
  assert.deepEqual(
    resolveDisclosureState({ summaryOpen: false, fullOpen: true }, true),
    { summaryOpen: true, fullOpen: false }
  );
});
```

- [ ] **Step 2: 运行定向测试并确认 RED**

Run: `npm test`

Expected: FAIL，原因是 `dashboard-presentation.ts`、`createDashboardPresentation` 与 `resolveDisclosureState` 尚不存在。

- [ ] **Step 3: 实现最小 presentation model**

```ts
export interface DisclosureState {
  summaryOpen: boolean;
  fullOpen: boolean;
}

export function resolveDisclosureState(
  previous: DisclosureState | undefined,
  taskChanged: boolean
): DisclosureState {
  if (!previous || taskChanged) {
    return { summaryOpen: true, fullOpen: false };
  }
  return previous;
}

export function createDashboardPresentation(
  model: DashboardViewModel
): DashboardPresentation {
  return {
    kind: model.currentTask.hasChildren ? "parent" : "leaf",
    header: createHeader(model),
    trust: createTrustSummary(model),
    primaryStatus: createPrimaryStatus(model),
    children: model.currentTask.hasChildren
      ? model.children.map(createChildRow)
      : [],
    contract: createContractSummary(model),
  };
}
```

`createPrimaryStatus` 按 stale → 观察不可信 → primary diagnostic → 合同异常但无诊断 → 健康顺序选择唯一主状态。诊断标题只从 producer 的 `path` 映射“任务目标、执行结果、验证结果、交付记录、任务合同”等显示名；位置只使用 `source.section/line_start`，缺失时显示 section 或“任务文件”。`createChildRow` 只返回标题、状态、tone、rollup/诊断摘要和非空证据异常，不返回 Goal、路径、空 Blocked by 或 leaf 标记。

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `npm test`

Expected: 所有测试通过，新增 presentation 与 disclosure 测试为绿色。

- [ ] **Step 5: 提交 presentation model**

```bash
git add src/dashboard-presentation.ts src/dashboard-state.ts tests/dashboard-presentation.test.ts tests/dashboard-state.test.ts
git commit -m "feat: add dashboard presentation model"
```

### Task 2: 修复布局恢复时首次同步丢失

**Files:**
- Modify: `src/dashboard-state.ts`
- Modify: `tests/dashboard-state.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: Obsidian `workspace.onLayoutReady(callback)`。
- Produces: `registerInitialDashboardSync(registerLayoutReady, sync)`，返回取消函数；`FlowDeskDashboardView.onOpen/onClose` 使用该函数。

- [ ] **Step 1: 编写生命周期时序失败测试**

```ts
test("视图在 layout ready 后执行首次同步，关闭后不再执行", () => {
  let ready: (() => void) | null = null;
  let syncCount = 0;
  const cancel = registerInitialDashboardSync(
    (callback) => { ready = callback; },
    () => { syncCount += 1; }
  );

  assert.equal(syncCount, 0);
  ready?.();
  assert.equal(syncCount, 1);
  cancel();
  ready?.();
  assert.equal(syncCount, 1);
});
```

- [ ] **Step 2: 运行定向测试并确认 RED**

Run: `npm test`

Expected: FAIL，原因是 `registerInitialDashboardSync` 尚不存在。

- [ ] **Step 3: 实现绑定视图实例的 layout-ready 同步**

```ts
export function registerInitialDashboardSync(
  registerLayoutReady: (callback: () => void) => void,
  sync: () => void
): () => void {
  let active = true;
  registerLayoutReady(() => {
    if (active) sync();
  });
  return () => { active = false; };
}
```

在 `FlowDeskDashboardView.onOpen()` 中注册：

```ts
this.cancelInitialSync = registerInitialDashboardSync(
  (callback) => this.app.workspace.onLayoutReady(callback),
  () => { void this.syncToActiveFile(); }
);
```

`onClose()` 先取消首次同步，再取消 refresh scheduler。删除插件 `onload()` 中通过 `getDashboardView()?.syncToActiveFile()` 执行的插件级 `onLayoutReady` 回调，避免临时查找视图导致一次性同步被跳过。保留 `file-open` 作为后续文件切换入口。

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `npm test`

Expected: 所有测试通过，生命周期测试证明 ready 前不读取、ready 后读取一次、关闭后不再读取。

- [ ] **Step 5: 提交首次加载修复**

```bash
git add src/dashboard-state.ts tests/dashboard-state.test.ts src/main.ts
git commit -m "fix: synchronize restored dashboard after layout ready"
```

### Task 3: 重构 Parent/Leaf DOM 与 CSS 为行动优先界面

**Files:**
- Modify: `src/main.ts`
- Modify: `styles.css`
- Modify: `README.md`
- Test: `tests/dashboard-presentation.test.ts`

**Interfaces:**
- Consumes: `createDashboardPresentation(model)`、`resolveDisclosureState`、现有 `openTask` 与 `openDiagnosticLocation`。
- Produces: 顶部任务区、可信度区、主状态、紧凑 child 行、默认展开合同摘要及嵌套完整详情。

- [ ] **Step 1: 补充默认摘要与异常状态的失败测试**

```ts
test("健康摘要同时证明观察、来源和检查范围", () => {
  const presentation = createDashboardPresentation(healthyModel);
  assert.equal(presentation.trust.label, "观察可信");
  assert.equal(presentation.trust.contractLabel, "合同有效");
  assert.equal(
    presentation.primaryStatus.title,
    "已读取当前任务，未发现结构化诊断"
  );
});

test("合同异常但 diagnostics 为空时不显示健康", () => {
  invalidContractModel.contract.semanticStatus = "invalid";
  invalidContractModel.diagnostics = [];
  const presentation = createDashboardPresentation(invalidContractModel);
  assert.equal(presentation.primaryStatus.tone, "error");
  assert.equal(presentation.primaryStatus.title, "任务合同存在问题");
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npm test`

Expected: FAIL，现有 presentation 尚未覆盖健康证明与“合同异常但无诊断”。

- [ ] **Step 3: 调整 presentation 后重写渲染顺序**

`render()` 在成功解析 model 后按以下顺序调用：

```ts
const presentation = createDashboardPresentation(model);
this.renderTaskHeader(container, model, presentation);
this.renderTrustSummary(container, presentation.trust);
this.renderPrimaryStatus(container, presentation.primaryStatus);
if (presentation.children.length) {
  this.renderChildRows(container, model, presentation.children);
}
this.renderContractDisclosure(container, model, presentation.contract);
```

删除旧的 `renderBreadcrumb`、`renderCurrentTaskHero`、`renderNextAction`、平铺 `renderDiagnosticBody` 和 child card 详情。顶部只显示可选 Parent 链接、当前标题、状态/类型/优先级标签、复制 CLI 与刷新。child 行使用 `role="button"`、`tabindex="0"`，支持 click、Enter 与 Space。诊断标题使用同样的可访问导航，点击后复用 `openDiagnosticLocation`。

- [ ] **Step 4: 实现两层合同与技术详情**

外层 `details` 绑定 `disclosureState.summaryOpen`，summary 为“当前任务合同与证据”；主体显示 Goal、REQ/SCN 数量、验收完成数、三类证据和诊断数量。内部 `details` 绑定 `disclosureState.fullOpen`，summary 为“展开全部合同、证据与诊断”；内部保留 Observation、Scope、Requirements、Scenarios、Acceptance、Evidence 与所有诊断机器字段。

同 task render 不重置 `disclosureState`；`loadTask()` 发现 source task 变化时调用 `resolveDisclosureState(previous, true)`。

- [ ] **Step 5: 重写视觉层级与窄侧栏样式**

`styles.css` 使用：

- `.flowdesk-task-header`：唯一主标题和顶部工具栏。
- `.flowdesk-trust-summary`：紧凑左边框状态，不作为大卡片。
- `.flowdesk-primary-status`：唯一高权重行动卡。
- `.flowdesk-child-row`：单行/多行自适应的整行点击面板。
- `.flowdesk-contract-summary` 与 `.flowdesk-technical-details`：摘要和技术层级。
- `.is-clickable:focus-visible`：明确键盘焦点。

删除 Hero metrics、重复 breadcrumb、Next Action 卡与大面积 uppercase 标签样式。小于 520px 时标题与工具栏分行，长标题和机器路径允许换行。

- [ ] **Step 6: 更新 README 的实际显示与刷新语义**

把旧的“breadcrumb → hero → next action → child cards → leaf 自动展开全文”说明改为“唯一任务标题 → 可信度 → 主状态 → direct child 紧凑行 → 默认摘要/完整详情”。记录 layout-ready 首次同步、同 task 展开保持、跨 task 重置以及无独立打开按钮。

- [ ] **Step 7: 运行完整开发验证**

Run: `npm test && npm run build && npx tsc --noEmit && node -c main.js`

Expected: 测试 0 失败；build、typecheck、syntax 均退出 0。

- [ ] **Step 8: 提交 UI 重构**

```bash
git add src/main.ts src/dashboard-presentation.ts tests/dashboard-presentation.test.ts styles.css README.md main.js
git commit -m "feat: streamline dashboard task presentation"
```

### Task 4: 版本升级、真实验收与发布

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `manifest.json`
- Modify: `versions.json`
- Modify: `main.js`
- Create: `release/flowdesk-dashboard-0.1.5/*`（本地生成，不提交）

**Interfaces:**
- Consumes: GitHub Actions `v*` release workflow、BRAT release 资产。
- Produces: `v0.1.5` GitHub Release，包含 `main.js`、`manifest.json`、`styles.css`、`versions.json` 与 zip。

- [ ] **Step 1: 将版本统一升级到 0.1.5**

使用 `npm version 0.1.5 --no-git-tag-version` 更新 `package.json/package-lock.json`；将 `manifest.json.version` 改为 `0.1.5`，并在 `versions.json` 增加：

```json
"0.1.5": "1.5.0"
```

- [ ] **Step 2: 运行发布前全量验证**

Run: `npm run release:prepare`

Expected: 依次通过 test、build、typecheck、syntax、release verify 和 release package；生成 `release/flowdesk-dashboard-0.1.5.zip`。

- [ ] **Step 3: 对真实 producer fixture 做等值与版本检查**

Run: `npm test && node scripts/verify-release.mjs && git diff --check`

Expected: canonical producer fixture equality 通过；release 显示版本 0.1.5；diff 无空白错误。

- [ ] **Step 4: 提交发布版本**

```bash
git add package.json package-lock.json manifest.json versions.json main.js styles.css
git commit -m "chore: release dashboard v0.1.5"
```

- [ ] **Step 5: 请求只读代码审查并处理 Critical/Important 问题**

以 `origin/main` 为 base、当前 HEAD 为 head，审查设计覆盖、首次加载时序、stale/source fail-closed、Parent/Leaf 信息边界、键盘导航、测试真实性与 release 文件一致性。修复所有 Critical/Important 问题并重新运行 `npm run release:prepare`。

- [ ] **Step 6: 推送分支、创建 PR、等待 CI 并合并**

```bash
git push -u origin codex/dashboard-ui-progressive-disclosure
gh pr create --base main --head codex/dashboard-ui-progressive-disclosure --title "feat: optimize dashboard task UI and refresh" --body "## 变更\n- 重构 Parent/Leaf 信息层级与渐进展开\n- 修复布局恢复时首次同步丢失\n- 发布 Dashboard 0.1.5\n\n## 验证\n- npm run release:prepare"
gh pr checks codex/dashboard-ui-progressive-disclosure --watch
gh pr merge codex/dashboard-ui-progressive-disclosure --merge --delete-branch
```

PR 正文记录设计文档、Parent/Leaf UI、首次同步根因、测试与发布版本。CI 未通过时停止合并并按失败证据修复。

- [ ] **Step 7: 在合并后的 main 创建并推送 v0.1.5 tag**

```bash
git switch main
git pull --ff-only origin main
git tag v0.1.5
git push origin v0.1.5
```

- [ ] **Step 8: 验证 GitHub Release 与资产**

Run: `gh run list --workflow release.yml --limit 5`、`gh release view v0.1.5 --json tagName,isDraft,isPrerelease,assets,url`

Expected: tag workflow 成功；Release 非 draft、非 prerelease；包含四个必需文件与 `flowdesk-dashboard-0.1.5.zip`。最终向用户提供 Release URL 与 Obsidian/BRAT 验证步骤。
