# Dashboard 0.1.2 视觉基线与 SDD v3 融合实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 恢复 Dashboard 0.1.2 的舒展层级、卡片边界和可读字号，同时完整保留 SDD v3 task-centric 父子任务、合同、证据和诊断语义。

**架构：** 不回退 snapshot schema，也不恢复 v2 的阶段轨道与 inline/materialization 模型。`dashboard-presentation.ts` 继续负责 v3 数据到展示语义的映射，`main.ts` 只组合任务壳层、可信度、诊断、子任务和合同详情，`styles.css` 以 0.1.2 的 13px 基准、卡片边界和章节节奏重新组织当前 DOM。

**技术栈：** TypeScript、Obsidian Plugin API、原生 DOM、CSS、Node.js test runner、esbuild。

## 全局约束

- 只消费 `snapshot_schema_version: 3` 与 `snapshot_model: task-centric`，不增加 legacy fallback。
- 当前任务标题可点击打开当前 TaskNotes；父任务保留单独的上行入口。
- 复制 CLI 与刷新按钮位于标题下方的元信息行，不挤压标题。
- 首要诊断正文只显示原因和建议；错误码、任务、字段路径继续收进机器详情。
- Parent 展示 direct children，Leaf 不渲染空子任务区域。
- 本计划仅修改 Dashboard consumer；CLI producer 的文字布局在 FlowDesk Plugin 仓库单独处理。

---

### Task 1：锁定 0.1.2 视觉层级的 UI 契约

**文件：**
- 修改：`tests/dashboard-ui-contract.test.ts`
- 修改：`src/main.ts`

**接口：**
- 消费：现有 `DashboardPresentation`、`DashboardViewModel`。
- 产出：任务标题、路径/读取元信息、状态标签和工具栏彼此独立的任务 Hero DOM。

- [x] **Step 1：写失败测试**

  在 UI 契约测试中要求任务壳层包含独立的 `flowdesk-task-path` 与 `flowdesk-task-read-meta`，并要求标题保持当前任务的唯一主标题。

- [x] **Step 2：运行测试确认 RED**

  运行：`npm test -- tests/dashboard-ui-contract.test.ts`

  预期：因新类名尚不存在而失败。

- [x] **Step 3：实现最小 DOM 调整**

  在 `renderHeader()` 与 `renderLoadingHeader()` 中加入当前任务路径和读取状态；保留标题点击、父任务入口、状态标签、复制和刷新行为。

- [x] **Step 4：运行测试确认 GREEN**

  运行：`npm test -- tests/dashboard-ui-contract.test.ts`

  预期：全部通过。

### Task 2：恢复 0.1.2 的视觉节奏

**文件：**
- 修改：`styles.css`
- 修改：`tests/dashboard-ui-contract.test.ts`

**接口：**
- 消费：Task 1 的任务 Hero DOM 与现有 trust、diagnostic、children、contract 类名。
- 产出：13px 基准字号、1.45 行高、带边界的可信度条和任务 Hero、舒展的诊断卡、分隔清晰的子任务与合同详情。

- [x] **Step 1：写失败测试**

  增加可读性契约：Dashboard 基准字号为 13px、可信度区域恢复完整边框与圆角、任务头恢复卡片边界、主诊断标题不小于 13px、次级正文使用 12px。

- [x] **Step 2：运行测试确认 RED**

  运行：`npm test -- tests/dashboard-ui-contract.test.ts`

  预期：当前 0.1.6 的扁平样式不满足契约。

- [x] **Step 3：最小重写 CSS**

  以 v0.1.2 的颜色变量、边框、圆角、字号和间距为基线改写当前类；保留 v3 新增的 parent、child、contract metrics、machine details 与窄侧栏响应式规则。

- [x] **Step 4：运行测试确认 GREEN**

  运行：`npm test -- tests/dashboard-ui-contract.test.ts`

  预期：全部通过。

### Task 3：版本发布与完整验证

**文件：**
- 修改：`manifest.json`
- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`versions.json`
- 生成：`main.js`

**接口：**
- 消费：Task 1–2 的最终源码和样式。
- 产出：可由 BRAT 安装的下一个 patch release。

- [x] **Step 1：运行实现验证**

  运行：`npm test`、`npm run build`、`npm run typecheck`、`npm run check:syntax`。

- [x] **Step 2：更新 patch 版本**

  将版本从 `0.1.6` 更新为 `0.1.7`，同步四个版本文件。

- [x] **Step 3：运行发布验证**

  运行：`npm run release:prepare` 与 `git diff --check`。

- [ ] **Step 4：提交、推送并创建 PR**

  提交中文语义对应的英文 Conventional Commit，推送 `codex/dashboard-v012-v3-visual` 并创建 ready PR。

- [ ] **Step 5：合并并发布**

  合并 PR，基于合并后的 `main` 创建并推送 `v0.1.7`，等待 GitHub Release 成功后提供 BRAT 验收步骤。
