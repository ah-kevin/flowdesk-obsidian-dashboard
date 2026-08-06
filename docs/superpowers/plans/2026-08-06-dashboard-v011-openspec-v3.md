# Dashboard v0.1.1 OpenSpec 视觉与 SDD v3 融合实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 原样恢复 v0.1.1 的线性 OpenSpec Dashboard 视觉语言，并继续展示 SDD v3 task-centric 数据。

**架构：** 保留现有 snapshot 校验、刷新、导航和 presentation 映射，只调整 `main.ts` 的工具按钮表达与 `styles.css` 的视觉结构。当前任务、父任务、直接子任务、合同、证据和诊断继续来自 schema 3 task-centric snapshot，不恢复任何 v1/v2 数据 fallback。

**技术栈：** TypeScript、Obsidian Plugin API、CSS、Node.js test runner、esbuild。

## 全局约束

- 视觉基线直接取自 Git tag `v0.1.1`，不再设计新的卡片系统。
- 顶部、概览、子任务、合同和证据使用透明背景、章节标题与分隔线。
- 仅错误、暂停和刷新状态允许使用弱边框提示块。
- 保留复制 CLI、手动刷新、任务标题导航和诊断定位。
- 保留 schema 3、task-centric、source identity 与 fail-closed 规则。

---

### Task 1：锁定 v0.1.1 线性视觉契约

**文件：**
- 修改：`tests/dashboard-ui-contract.test.ts`
- 修改：`styles.css`

- [x] 写失败测试：要求任务头仅使用底部分隔线，可信度区域无卡片边框，合同区域无卡片边框，基础字号和间距与 v0.1.1 一致。
- [x] 运行 `npm test -- tests/dashboard-ui-contract.test.ts`，确认现有 0.1.7 卡片样式导致失败。
- [x] 以 v0.1.1 CSS 为基线重写当前 v3 类名的外观。
- [x] 再次运行定向测试并确认通过。

### Task 2：恢复 v0.1.1 顶部工具表达

**文件：**
- 修改：`src/main.ts`
- 修改：`tests/dashboard-ui-contract.test.ts`

- [x] 写失败测试：要求复制 CLI 与刷新使用 v0.1.1 风格文字按钮。
- [x] 运行定向测试确认失败。
- [x] 将图标按钮改为“复制 CLI”“刷新”文字按钮，保留 aria-label、title、loading 和 Notice 行为。
- [x] 运行定向测试确认通过。

### Task 3：0.1.8 发布

**文件：**
- 修改：`manifest.json`
- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`versions.json`
- 生成：`main.js`

- [x] 运行测试、build、typecheck 与语法检查。
- [x] 更新版本为 0.1.8。
- [x] 运行 `npm run release:prepare` 与 `git diff --check`。
- [ ] 提交、推送、创建并合并 PR。
- [ ] 创建并推送 `v0.1.8`，确认 GitHub Release 资产齐全。
