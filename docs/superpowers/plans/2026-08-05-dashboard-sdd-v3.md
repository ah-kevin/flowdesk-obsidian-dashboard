# FlowDesk Obsidian Dashboard SDD v3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Obsidian Dashboard 切换为只消费 snapshot v3，围绕原生 root/children、可信观测、父子汇总和结构化诊断提供清晰的人工 review 体验。

**Architecture:** TypeScript snapshot model 直接映射 v3 producer contract，并构建专用 view model；main view 删除 inline/materialization/compatibility 分支，新增 root/children/rollup/observation 呈现。刷新与非 TaskNotes 文件状态继续由 dashboard-state 管理，任何旧数据都显式标记 stale。

**Tech Stack:** TypeScript、Obsidian Plugin API、Node test runner、esbuild。

## Global Constraints

- 只支持 snapshot schema v3，不兼容 v2/legacy。
- 同一 JSON 事实与 CLI 一致；Dashboard 不重新推断任务状态或证据排序。
- 插件只读，不修改 TaskNotes、Work Case 或 FlowDesk runtime。
- 非 TaskNotes 文件必须清空旧数据并显示不可用提示。
- 刷新失败可保留旧数据显示，但必须显著标记 stale 和失败原因。
- 不发布、不合并、不改版本号；实现完成后创建 PR，等待 leader/user gate。

---

### Task 1: 用 snapshot v3 类型和 view model 替换 v2 模型

**Files:**
- Modify: `src/snapshot-model.ts`
- Modify: `tests/snapshot-model.test.ts`
- Modify: `src/evidence-presentation.ts`
- Modify: `tests/evidence-presentation.test.ts`

**Interfaces:**
- Consumes: producer 的 schema 3 `observation/contract/task_tree/rollup/evidence/diagnostics/next_actions`。
- Produces: Dashboard hero、children、diagnostics、observation、evidence 的稳定 view model。

- [ ] **Step 1: 写 v3 model 失败测试**

fixture 包含一个 root、两个 children、一个 blocked child、一个结构化诊断。断言：

```ts
assert.equal(model.schemaLabel, "snapshot v3");
assert.equal(model.hero.workProgressLabel, "1/2 子任务可信完成");
assert.equal(model.rollup.state, "blocked");
assert.equal(model.children[1].isBlocked, true);
assert.equal(model.primaryDiagnostic?.taskId, "Tasks/Child B.md");
```

另测 schema 缺失或不是 3 时返回 `unsupported_snapshot_schema`，而不是“旧版兼容”。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm test -- --test-name-pattern='v3|unsupported|rollup'`
Expected: FAIL，当前模型仍读取 v2 compatibility/inline/materialization。

- [ ] **Step 3: 重写 `ExecutionSnapshot` 和 `DashboardViewModel`**

删除 `TaskMaterialization`、`InlineExecution`、compatibility profile；新增 `SnapshotV3`、`TaskTreeChild`、`Rollup`、`Observation`、`SnapshotDiagnostic`。`createDashboardViewModel` 只接受 schema 3 为可信输入。

- [ ] **Step 4: 保持 producer 证据顺序**

`evidence-presentation.ts` 仅使用 producer 的 items/display_order，不再为旧 snapshot 做 fallback 排序；missing/invalid/valid 映射为明确中文。

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `npm test -- --test-name-pattern='v3|unsupported|rollup|evidence'`
Expected: PASS。

- [ ] **Step 6: 提交 model 变更**

```bash
git add src/snapshot-model.ts src/evidence-presentation.ts tests/snapshot-model.test.ts tests/evidence-presentation.test.ts
git commit -m "refactor: consume FlowDesk snapshot v3"
```

### Task 2: 重构 root/children/diagnostics 主界面

**Files:**
- Modify: `src/main.ts`
- Modify: `styles.css`
- Modify: `tests/snapshot-model.test.ts`

**Interfaces:**
- Consumes: Task 1 的 v3 view model。
- Produces: root hero、可信 children 进度、child review 卡、observation、diagnostic、evidence 和 next action UI。

- [ ] **Step 1: 添加 UI helper 的失败测试**

抽出并测试纯函数标签：`formatRollupState`、`formatChildEvidenceHealth`、`formatNextAction`。断言 blocked/awaiting_parent_verification/inconsistent 均有明确中文，不出现 inline/materialization 文案。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm test -- --test-name-pattern='rollup|child evidence|next action'`
Expected: FAIL。

- [ ] **Step 3: 删除 v2 UI**

从 `main.ts` 删除 `renderInlineExecution`、`renderMaterialization`、compatibility profile 与 TASK badge；从 CSS 删除对应 selectors。

- [ ] **Step 4: 实现 v3 hero 和 child review 列表**

hero 显示 root status、rollup state、trusted_done/total、当前阻塞和下一动作。child 卡显示 status、priority、blockedBy、Covers、Acceptance 与 evidence health，并保留“打开”按钮。

- [ ] **Step 5: 实现 observation 与诊断优先呈现**

observation 非 healthy 时 hero 首先显示“观测不可信，无法判断任务是否正常”；诊断卡使用 producer 的 task_id/source/reason/remediation，支持定位到 root 或具体 child。

- [ ] **Step 6: 运行测试与构建确认 GREEN**

Run: `npm test`
Expected: PASS。

Run: `npm run build`
Expected: PASS。

- [ ] **Step 7: 提交 UI 重构**

```bash
git add src/main.ts styles.css tests
git commit -m "feat: present native TaskNotes child progress"
```

### Task 3: 收紧刷新、非 TaskNotes 和 stale 行为

**Files:**
- Modify: `src/dashboard-state.ts`
- Modify: `tests/dashboard-state.test.ts`
- Modify: `src/main.ts`
- Modify: `tests/snapshot-invocation.test.ts`

**Interfaces:**
- Consumes: Obsidian active-file events、snapshot v3 source_task_id、刷新结果。
- Produces: 不串数据的 display state 和明确不可用/stale UI。

- [ ] **Step 1: 写首次打开、切换和非 task 的失败测试**

覆盖：首次打开 TaskNotes task 立即加载；同 task 刷新失败保留旧 snapshot 且 stale；切到非 `Tasks/*.md` 清空 snapshot；从非 task 切回 task 强制刷新；旧 source_task_id 不得展示给新 task。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm test -- --test-name-pattern='首次|非 task|stale|source identity'`
Expected: 至少一个行为在当前状态机中失败或缺少 schema 3 source 校验。

- [ ] **Step 3: 修正 display state 转换**

`ObservedTaskSnapshot` 保存 taskPath、snapshot、loadedAt、staleReason；active file 不可用时返回专用 `unavailable` 状态，不保留 previous snapshot；只有同 task 刷新失败才允许 stale fallback。

- [ ] **Step 4: 更新用户提示**

非 task 文案固定为“当前不是 TaskNotes 任务，FlowDesk Dashboard 不可用。”；首次加载显示明确 loading；source mismatch 显示请求路径与 snapshot source，不静默回退。

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `npm test`
Expected: PASS。

- [ ] **Step 6: 提交刷新修正**

```bash
git add src/dashboard-state.ts src/main.ts tests/dashboard-state.test.ts tests/snapshot-invocation.test.ts
git commit -m "fix: keep dashboard task observation trustworthy"
```

### Task 4: 集成验证与 PR

**Files:**
- Modify: `README.md`
- Review: all changed files

**Interfaces:**
- Consumes: FlowDesk Plugin worker 提供的真实 snapshot v3 JSON/CLI。
- Produces: 构建产物、真实 Obsidian smoke 说明和 Dashboard PR。

- [ ] **Step 1: 用 producer JSON fixture 跑模型测试**

把 Plugin worker 的实际 schema 3 输出作为测试 fixture 或内联对象，确认字段名、状态、诊断和 evidence 完全一致，不在 consumer 侧添加猜测分支。

- [ ] **Step 2: 更新 README**

说明仅支持 FlowDesk Plugin 的 snapshot v3、TaskNotes 原生 root/child、非 task/stale 行为和 CLI 复制入口；删除 v2/inline/materialization 说明。

- [ ] **Step 3: 运行发布前验证**

Run: `npm test`
Expected: PASS。

Run: `npm run build`
Expected: PASS。

Run: `npx tsc --noEmit`
Expected: PASS。

Run: `node -c main.js`
Expected: exit 0。

- [ ] **Step 4: 人工 diff review**

确认无 v2 类型/UI、无 TaskNotes 写操作、无版本号或 release 变更、无 unrelated 用户改动。

- [ ] **Step 5: 创建 feature branch、最终提交、push 与 PR**

分支名使用 `codex/dashboard-sdd-v3`。PR 描述关联 Plugin PR、列出 snapshot contract、刷新/非 task 行为和全部验证；不合并、不发布。

