# FlowDesk Obsidian Dashboard v2 体验升级实施计划

> **供 agentic worker 使用：** 必须使用 `superpowers:executing-plans` 逐任务实施；每项行为先按 `superpowers:test-driven-development` 完成 RED → GREEN。步骤使用 checkbox 追踪。

**目标：** 让现有 Obsidian 只读侧栏完整消费 FlowDesk snapshot schema v2，以可信概览、inline 进度和可定位诊断替代当前的平铺信息列表。

**架构：** `src/snapshot-model.ts` 负责兼容读取 snapshot v2/旧 snapshot，并产出稳定的 `DashboardViewModel`；`src/main.ts` 只负责调用 CLI、维护刷新状态、调用 Obsidian 导航 API 与渲染 DOM。刷新失败时仅可保留同一 task 的最后成功 snapshot，并显式标为 stale；切换 task 后禁止复用旧 snapshot。

**技术栈：** TypeScript、Obsidian Plugin API、Node.js `child_process.execFile`、Node 24 内建 `node:test`、esbuild、CSS。

## 全局约束

- 只修改 `/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard`，不再修改 FlowDesk producer。
- 数据事实只来自 `flowdesk-execution-snapshot --format json`；不直接解析 TaskNotes Markdown，不复制 producer 判定逻辑。
- 保持 desktop-only 与只读边界，不增加完成、修复、派工或 TaskNotes 写操作。
- 当前 TaskNotes 文件继续是唯一入口；Work Case 入口依赖尚未定义的 task-resolution contract，不混入本次 consumer 改造。
- 旧 snapshot 缺少 schema/observation/capabilities 时显示 unknown/degraded，不默认为 healthy。
- 用户可见文案使用中文；snapshot 字段名、类型和代码标识使用英文。
- 不创建 worktree；在当前 checkout 的 `codex/obsidian-dashboard-v2-ux` 分支实施。

---

### Task 1：建立可测试的 snapshot v2 consumer model

**文件：**

- 新建：`src/snapshot-model.ts`
- 新建：`tests/snapshot-model.test.ts`
- 修改：`src/main.ts`
- 修改：`package.json`

**接口：**

- 产出：`ExecutionSnapshot`、`SnapshotDiagnostic`、`DashboardViewModel` 类型。
- 产出：`createDashboardViewModel(snapshot, options) -> DashboardViewModel`。
- 产出：`resolveDiagnosticTarget(taskPath, source) -> { linkText, line }`。
- `src/main.ts` 从新模块导入 contract，不再在插件类文件内定义 snapshot 类型和重复计算状态。

- [ ] **Step 1：添加 Node 内建测试命令**

在 `package.json` 增加：

```json
"test": "node --test tests/*.test.ts"
```

- [ ] **Step 2：写旧 snapshot 不得伪装 healthy 的失败测试**

```ts
test("缺少 schema 与 observation 的旧 snapshot 显示未知观测", () => {
  const model = createDashboardViewModel({ state: { value: "running" } });
  assert.equal(model.observation.health, "unknown");
  assert.equal(model.compatibility.label, "旧版 snapshot · 能力未知");
  assert.equal(model.observation.isTrustworthy, false);
});
```

- [ ] **Step 3：运行 RED**

运行：

```bash
npm test
```

预期：FAIL，`src/snapshot-model.ts` 尚不存在。

- [ ] **Step 4：实现 contract 类型与兼容 view model**

`createDashboardViewModel` 必须直接读取 producer 字段：

```ts
export interface DashboardViewModel {
  schemaLabel: string;
  state: string;
  compatibility: { label: string; profile: string };
  observation: {
    health: "healthy" | "degraded" | "error" | "unknown";
    generatedAt: string;
    coverage: Array<{ key: string; value: string }>;
    isTrustworthy: boolean;
  };
  inlineProgress: null | {
    completed: number | null;
    total: number;
    status: string;
    explicit: boolean;
    tasks: Array<{ id: string; status: string; inferred: boolean }>;
  };
  primaryDiagnostic: SnapshotDiagnostic | null;
  diagnostics: SnapshotDiagnostic[];
}
```

`isTrustworthy` 只在 schema version 为 `2` 且 observation health 为 `healthy` 时为 true。

- [ ] **Step 5：写 v2 inline、诊断优先级与定位目标测试**

覆盖以下手工期望：

```ts
assert.equal(model.inlineProgress?.completed, 1);
assert.equal(model.inlineProgress?.total, 2);
assert.equal(model.primaryDiagnostic?.code, "why_placeholder_detected");
assert.deepEqual(resolveDiagnosticTarget("Tasks/A.md", source), {
  linkText: "Tasks/A.md#Why",
  line: 41,
});
```

诊断优先级固定为 semantic errors → inline diagnostics → observation diagnostics；同类保持 producer 顺序。

- [ ] **Step 6：运行 GREEN 与类型检查**

```bash
npm test
npm run typecheck
```

- [ ] **Step 7：提交 Task 1**

```bash
git add package.json src/snapshot-model.ts src/main.ts tests/snapshot-model.test.ts
git commit -m "feat: add snapshot v2 consumer model"
```

### Task 2：把侧栏重排为可信概览优先

**文件：**

- 修改：`src/main.ts`
- 修改：`styles.css`
- 测试：`tests/snapshot-model.test.ts`

**接口：**

- 消费：`createDashboardViewModel`。
- 产出 UI 顺序：header → trust strip → task hero → primary issue → next action → stage rail → 折叠详情。
- 折叠详情保留 Contract、Materialization/Inline、Evidence、Child Tasks、Notepad，不删除既有信息。

- [ ] **Step 1：写概览摘要纯模型的失败测试**

断言已完成 inline 卡生成：

```ts
assert.equal(model.hero.progressLabel, "6/6 阶段");
assert.equal(model.hero.inlineLabel, "1/1 TASK");
assert.equal(model.nextAction, null);
```

断言 children 卡优先使用 child counts，而 inline 卡不显示 `0/N bound`。

- [ ] **Step 2：运行 RED**

```bash
npm test
```

预期：FAIL，view model 尚未提供 `hero` 字段。

- [ ] **Step 3：实现 hero/trust/next-action model 并转绿**

```bash
npm test
```

- [ ] **Step 4：重排 `FlowDeskDashboardView.render()`**

新增小型 renderer helper：

```ts
renderTrustStrip(container, model);
renderTaskHero(container, model);
renderPrimaryDiagnostic(container, model);
renderPrimaryNextAction(container, model);
renderStageRail(container, snapshot);
renderDetails(container, snapshot, model);
```

低频详情使用原生 `<details>`，默认折叠；存在错误的对应详情默认展开。所有空值显示“未提供”或“不适用”，禁止使用绿色状态点。

- [ ] **Step 5：更新 CSS 形成 Obsidian 原生侧栏层级**

使用 Obsidian CSS variables；新增 trust badge、hero card、primary issue card、stage rail、detail group。不得固定浅色背景，不引入外部图标、字体或图片。

- [ ] **Step 6：构建与静态检查**

```bash
npm run build
npm run typecheck
npm run check:syntax
```

- [ ] **Step 7：提交 Task 2**

```bash
git add src/main.ts src/snapshot-model.ts styles.css tests/snapshot-model.test.ts main.js
git commit -m "feat: prioritize trust in dashboard sidebar"
```

### Task 3：呈现可操作诊断并支持只读定位

**文件：**

- 修改：`src/main.ts`
- 修改：`src/snapshot-model.ts`
- 修改：`styles.css`
- 测试：`tests/snapshot-model.test.ts`

**接口：**

- 诊断卡显示：code、section/line、excerpt、reason、remediation。
- “定位”按钮调用 `openDiagnosticLocation(diagnostic)`；只导航，不改写 task。
- 有 line 时在 source editor 定位到 `line_start - 1`；否则通过 `TaskPath#Section` 打开 heading。

- [ ] **Step 1：写 source 缺 line 与 remediation shape 的失败测试**

```ts
assert.deepEqual(resolveDiagnosticTarget("Tasks/A.md", {
  section: "Why",
  line_start: null,
  after_section: "Contract Phase",
}), {
  linkText: "Tasks/A.md#Contract Phase",
  line: null,
});
assert.equal(formatDiagnosticReason({ actual: "检测到占位词", expected: "真实动机" }), "检测到占位词");
assert.equal(formatDiagnosticRemediation({ summary: "改写 Why" }), "改写 Why");
```

- [ ] **Step 2：运行 RED 后实现纯格式化 helper**

```bash
npm test
```

- [ ] **Step 3：实现 Obsidian 只读定位**

使用 `workspace.openLinkText()` 打开 heading；若目标 leaf 为 `MarkdownView` 且有行号，再调用 editor cursor/scroll API。找不到文件或无法定位时显示中文 `Notice`，不降级为写文件。

- [ ] **Step 4：渲染 primary 与完整 diagnostics**

首个阻断诊断放在概览后；完整列表放入折叠详情。旧 producer 只有 `code/message` 时仍显示 message，并将位置与修法标为“producer 未提供”。

- [ ] **Step 5：运行验证并提交**

```bash
npm test
npm run build
npm run typecheck
git add src/main.ts src/snapshot-model.ts styles.css tests/snapshot-model.test.ts main.js
git commit -m "feat: add actionable diagnostic navigation"
```

### Task 4：实现 stale-while-revalidate 的可信边界

**文件：**

- 修改：`src/main.ts`
- 修改：`src/snapshot-model.ts`
- 修改：`styles.css`
- 测试：`tests/snapshot-model.test.ts`

**接口：**

- `SnapshotDisplayState = { taskPath, snapshot, loadedAt, staleReason }`。
- 同一 task 刷新失败：保留 snapshot，但 `staleReason` 非空且顶部显示“旧数据”。
- 切换 task：立即清除旧 snapshot；任何 source_task_id 与请求 taskPath 不一致的结果都不得显示。

- [ ] **Step 1：写 source identity 与 stale label 的失败测试**

```ts
assert.equal(validateSnapshotSource(snapshot, "Tasks/A.md"), true);
assert.equal(validateSnapshotSource(snapshot, "Tasks/B.md"), false);
assert.equal(createDashboardViewModel(snapshot, { staleReason: "刷新失败" }).observation.isStale, true);
```

旧 snapshot 没有 `source_task_id` 时返回 `unknown` 而非 false，允许显示但观测不可信。

- [ ] **Step 2：运行 RED 后实现 helper**

```bash
npm test
```

- [ ] **Step 3：修改刷新状态机**

`loadTaskNow()` 在 taskPath 变化时清空 `SnapshotDisplayState`；成功结果先校验 source identity 再替换；失败只在同 task 且已有 snapshot 时设置 staleReason。

- [ ] **Step 4：渲染 stale banner 和刷新时间**

同时显示 producer `observation.generated_at` 与 consumer `loadedAt`；不得用当前时间覆盖 producer 生成时间。

- [ ] **Step 5：运行验证并提交**

```bash
npm test
npm run build
npm run typecheck
git add src/main.ts src/snapshot-model.ts styles.css tests/snapshot-model.test.ts main.js
git commit -m "fix: prevent stale snapshot mislabeling"
```

### Task 5：文档、安装态 smoke 与 PR 交付

**文件：**

- 修改：`README.md`
- 修改：`main.js`

- [ ] **Step 1：更新 README**

说明 snapshot schema v2 展示、observation/stale 语义、inline 进度、诊断定位与兼容降级；明确当前仍仅支持 TaskNotes task 文件入口，仍为只读。

- [ ] **Step 2：完整开发态验证**

```bash
npm test
npm run build
npm run typecheck
npm run check:syntax
npm run release:verify
git diff --check
```

- [ ] **Step 3：确认开发 symlink 并做 Obsidian smoke**

只读确认 vault 插件路径仍指向本仓库。重新加载插件后，用真实已完成 v2 inline 卡验证：

- trust strip 显示 `healthy / SDD v2 · inline / schema v2`；
- hero 显示 `6/6 阶段` 与 `1/1 TASK`；
- Next Action 显示“无需后续动作”；
- 刷新成功且没有错误；
- 切换非 Task 文件只显示 pinned/stale 边界，不把旧 task 标成当前 task。

- [ ] **Step 4：人工检查旧 snapshot fixture 与窄侧栏**

确认旧字段缺失时显示 unknown，而非 healthy；侧栏宽度 320px 时无横向溢出。

- [ ] **Step 5：提交文档并检查分支**

```bash
git add README.md main.js
git commit -m "docs: describe dashboard v2 experience"
git status --short
git log --oneline main..HEAD
git diff --stat main...HEAD
```

- [ ] **Step 6：推送并创建 PR**

PR 必须声明：未修改 FlowDesk producer、未增加写操作、Work Case 入口未包含、安装态 smoke 使用的 task 与结果、未合并/未发布。

