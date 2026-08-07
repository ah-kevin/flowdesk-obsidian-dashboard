---
type: plan
title: FlowDesk SDD v4 Dashboard 实施计划
date: 2026-08-07
status: active
project: "[[FlowDesk Obsidian Dashboard]]"
design: "[[Notes/Plans/2026-08-07-FlowDesk-SDD-v4-结构化验证系统设计]]"
---

# FlowDesk SDD v4 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有 Dashboard 信息架构、交互模型和视觉风格的前提下，消费 schema 4、显示结构化 evidence/acceptance/review，并通过受控 CLI 完成人工复核。

**Architecture:** 保留当前 `FlowDeskDashboardView`、刷新协调器、toolbar 和 details sections。schema/model 层扩展 v4；review 使用新的 invocation adapter 和 Obsidian Modal，成功后触发现有 refresh；不引入新页面、新主导航或新设计系统。

**Tech Stack:** TypeScript、Obsidian API、Node `execFile`、esbuild、现有无框架 DOM 渲染和测试 runner。

## Global Constraints

- 保持当前 ItemView、header、toolbar、trust strip、primary diagnostic、children、details、任务导航、刷新和 stale 策略。
- 只在现有区域添加字段或按钮；复用现有 CSS token、class naming 和 Obsidian Modal。
- schema 4/model/source/protocol 不兼容时 fail closed；不得把 v3 当 v4。
- v3 以 `legacy_v3` 增量展示，历史结论不清零。
- 不安装或更新用户 Obsidian 插件；完成 build/test/commit/push 后由用户更新验收。
- worker 协调只使用 Codex App 原生 thread 工具；完成时用原生线程消息回传，不调用 FlowDesk `notify_fire` 或 completion handler。
- 必须消费 Plugin 提供的 canonical fixture，不自行发明字段。

---

## 文件结构

- Modify `src/snapshot-model.ts`：schema 4 types、严格解析、v4 view model、legacy_v3。
- Modify `src/dashboard-state.ts`：schema 4 envelope/protocol validation，保留刷新策略。
- Modify `src/snapshot-invocation.ts`：snapshot 调用保持；新增 review invocation 独立文件。
- Create `src/review-invocation.ts`：`flowdesk-evidence review` argv builder。
- Modify `src/evidence-presentation.ts`：结构化 evidence/review display state。
- Modify `src/main.ts`：在现有 details/toolbar 内渲染字段和复核 Modal。
- Modify `styles.css`：只添加现有组件命名体系下的增量 class。
- Copy canonical `tests/fixtures/sdd_v4_real_root_snapshot.json` from Plugin byte-for-byte。
- Modify existing model/state/UI tests；Create `tests/review-invocation.test.ts`。

### Task 1: Schema 4 model 与 canonical fixture

**Files:**
- Modify: `src/snapshot-model.ts`
- Modify: `src/dashboard-state.ts`
- Create: `tests/fixtures/sdd_v4_real_root_snapshot.json`
- Modify: `tests/snapshot-model.test.ts`
- Modify: `tests/dashboard-state.test.ts`

**Interfaces:**
- Produces: `SnapshotV4`、`StructuredEvidenceRequirement`、`CompletionDimensions`、`ReviewSummary`。
- Produces: `createDashboardViewModel(snapshot, options)` 对 v4 的严格 model；v3 只走 explicit legacy model。

- [ ] **Step 1: 从 Plugin 复制 canonical fixture 并写 schema/model/source/protocol RED**

```ts
assert.equal(model.currentTask.completion.trustedDone, false);
assert.equal(model.currentTask.trustLevel, "review_required");
```

- [ ] **Step 2: 运行 RED**

Run: `npm test -- tests/snapshot-model.test.ts tests/dashboard-state.test.ts`
Expected: FAIL because only `SnapshotV3` is accepted.

- [ ] **Step 3: 增加 v4 types 与严格 normalize，不放宽现有 identity checks**
- [ ] **Step 4: 验证 v3 显式 `legacy_v3`、v4 不允许 fallback**

Run: `npm test -- tests/snapshot-model.test.ts tests/dashboard-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/snapshot-model.ts src/dashboard-state.ts tests/snapshot-model.test.ts tests/dashboard-state.test.ts tests/fixtures/sdd_v4_real_root_snapshot.json
git commit -m "feat: consume SDD v4 snapshots"
```

### Task 2: 结构化 Evidence 与 Acceptance 展示

**Files:**
- Modify: `src/evidence-presentation.ts`
- Modify: `src/main.ts`
- Modify: `tests/evidence-presentation.test.ts`
- Modify: `tests/dashboard-presentation.test.ts`
- Modify: `tests/dashboard-ui-contract.test.ts`

**Interfaces:**
- Consumes: v4 view model requirements、expected/actual/provenance/review。
- Produces: 在现有 details Evidence/Acceptance section 内的增量 DOM。

- [ ] **Step 1: 写 UI contract RED，锁定现有 section 顺序、toolbar 和 navigation 不变**

```ts
assert.deepEqual(sectionOrder, ["contract", "acceptance", "evidence", "observation", "diagnostics"]);
assert.match(rendered, /EVR-SPAWN-TEST/);
assert.match(rendered, /runner_cross_checked/);
```

- [ ] **Step 2: 运行 RED**

Run: `npm test -- tests/evidence-presentation.test.ts tests/dashboard-presentation.test.ts tests/dashboard-ui-contract.test.ts`
Expected: FAIL only for new structured fields.

- [ ] **Step 3: 在现有 evidence grid/item 中加入 method、expected、actual、provenance、review badge**
- [ ] **Step 4: 确认没有新增主视图、侧栏、导航入口或替换现有 CSS class**

Run: `npm test -- tests/evidence-presentation.test.ts tests/dashboard-presentation.test.ts tests/dashboard-ui-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evidence-presentation.ts src/main.ts tests/evidence-presentation.test.ts tests/dashboard-presentation.test.ts tests/dashboard-ui-contract.test.ts
git commit -m "feat: present structured evidence in existing dashboard"
```

### Task 3: Review invocation 与 Modal

**Files:**
- Create: `src/review-invocation.ts`
- Modify: `src/main.ts`
- Modify: `src/snapshot-invocation.ts`
- Create: `tests/review-invocation.test.ts`
- Modify: `tests/dashboard-ui-contract.test.ts`

**Interfaces:**
- Produces: `buildReviewInvocation({flowdeskRoot, taskPath, digest, decision, requirementUids, note})`。
- Review success calls existing refresh path; `review_conflict` displays notice and refreshes, never mutates local snapshot optimistically.

- [ ] **Step 1: 写 argv array、shell-free execution、approve/changes_requested/conflict RED**

```ts
assert.deepEqual(invocation.args.slice(0, 2), ["review", "--task"]);
assert.equal(invocation.executable.endsWith("bin/flowdesk-evidence"), true);
```

- [ ] **Step 2: 运行 RED**

Run: `npm test -- tests/review-invocation.test.ts tests/dashboard-ui-contract.test.ts`
Expected: FAIL.

- [ ] **Step 3: 使用 `execFile` 和 Obsidian Modal；按钮只在 `review_required` 且 source 当前有效时出现**
- [ ] **Step 4: 保留现有 toolbar，按钮放入已有 action 区或对应 evidence item；成功后走现有 `refreshForContext`**

Run: `npm test -- tests/review-invocation.test.ts tests/dashboard-ui-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/review-invocation.ts src/snapshot-invocation.ts src/main.ts tests/review-invocation.test.ts tests/dashboard-ui-contract.test.ts
git commit -m "feat: add evidence review actions"
```

### Task 4: Legacy、diagnostics 与 next actions

**Files:**
- Modify: `src/snapshot-model.ts`
- Modify: `src/main.ts`
- Modify: `tests/snapshot-model.test.ts`
- Modify: `tests/dashboard-presentation.test.ts`

**Interfaces:**
- Produces: `legacy_v3` trust strip label；具体 diagnostic target 和下一动作。

- [ ] **Step 1: 写 legacy trusted done 不变、v4 missing evidence/review/protocol 文案 RED**
- [ ] **Step 2: 运行 RED**
- [ ] **Step 3: 复用现有 trust strip/primary diagnostic 渲染增量状态**
- [ ] **Step 4: 跑 GREEN**

Run: `npm test -- tests/snapshot-model.test.ts tests/dashboard-presentation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/snapshot-model.ts src/main.ts tests/snapshot-model.test.ts tests/dashboard-presentation.test.ts
git commit -m "feat: show SDD v4 trust and legacy states"
```

### Task 5: 样式最小增量与 UI 回归

**Files:**
- Modify: `styles.css`
- Modify: `tests/dashboard-ui-contract.test.ts`
- Modify: `tests/task-navigation.test.ts`

- [ ] **Step 1: 写现有导航、toolbar、section、class contract 回归断言**
- [ ] **Step 2: 运行 RED/基线，确认只因新增 review 元素失败**
- [ ] **Step 3: 增加复用现有颜色、spacing、button token 的最小 class**
- [ ] **Step 4: 跑 UI contract 与 task navigation GREEN**

Run: `npm test -- tests/dashboard-ui-contract.test.ts tests/task-navigation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add styles.css tests/dashboard-ui-contract.test.ts tests/task-navigation.test.ts
git commit -m "style: integrate evidence review with existing dashboard"
```

### Task 6: Dashboard 全量验证与联合 fixture

**Files:**
- Modify only files required by observed failures.

- [ ] **Step 1: 逐字节比较 Plugin canonical fixture**

Run: `cmp tests/fixtures/sdd_v4_real_root_snapshot.json /Users/bjke/workspaces/flowdesk-plugin/tests/fixtures/execution_snapshot/sdd_v4_real_root_snapshot.json`
Expected: no output and exit 0.

- [ ] **Step 2: 完整测试**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Typecheck、build、syntax**

Run: `npm run typecheck && npm run build && npm run check:syntax`
Expected: PASS.

- [ ] **Step 4: 人工 diff review，确认未改变现有导航、视图结构与视觉系统**
- [ ] **Step 5: Commit final fixes and push**

```bash
git add <only reviewed files>
git commit -m "test: verify SDD v4 dashboard integration"
git push origin HEAD
```

不得复制构建产物到用户 Vault 的 `.obsidian/plugins`，不得 reload Obsidian；由用户自行更新并验收。
