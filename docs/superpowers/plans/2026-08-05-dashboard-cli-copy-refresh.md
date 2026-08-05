# Obsidian Dashboard CLI 复制与刷新机制实施计划

> **供 agentic worker 使用：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务实施。本计划使用 checkbox 跟踪。

**目标：** 为 FlowDesk Dashboard 增加同源 CLI 命令复制、明确的非任务暂停页，并修复首次空白、刷新竞态和不稳定重绘，发布为 `0.1.2`。

**架构：** `src/snapshot-invocation.ts` 统一生成 `execFile` 参数和 POSIX shell 命令；`src/dashboard-state.ts` 提供纯上下文、请求身份与刷新依赖判断；`src/main.ts` 只负责 Obsidian 生命周期、DOM、剪贴板和调度。snapshot JSON contract 不变。

**技术栈：** Obsidian Plugin API、TypeScript、Node.js `child_process.execFile`、esbuild、Node test runner。

## 全局约束

- Dashboard 保持只读，不修改 TaskNotes、Work Case 或 FlowDesk runtime 状态。
- JSON 与复制命令必须使用同一组 task path、working directory、schema 和可选 API URL。
- 复制命令使用 CLI 绝对路径与 `--format dashboard`，可从任意终端目录执行。
- 非 `Tasks/*.md` / `TaskNotes/*.md` 上下文不得显示上一任务 snapshot。
- 旧 snapshot 继续兼容；不新增 producer 判定逻辑，不升级 snapshot schema。
- 用户主文案使用中文，保留必要的技术标识。
- 使用当前 checkout 从最新 `main` 新建 `codex/dashboard-v0.1.2`，不创建 worktree。

---

### Task 1：建立可测试的同源命令构造器

**文件：**
- 新建：`src/snapshot-invocation.ts`
- 新建：`tests/snapshot-invocation.test.ts`
- 修改：`tests/run-tests.mjs`
- 修改：`src/main.ts:168-188`

**接口：**
- 产出：`SnapshotInvocationInput`
- 产出：`buildSnapshotInvocation(input, format) -> { executable: string; args: string[]; cwd: string }`
- 产出：`formatShellCommand(invocation) -> string`
- 消费：`FlowDeskDashboardPlugin.loadSnapshot()` 与标题栏复制操作。

- [ ] **Step 1：让测试 runner 支持多个 `*.test.ts`**

使用 `node:fs/promises.readdir` 找出 `tests/` 下全部 `*.test.ts`，分别 bundle 为临时 `.mjs`，再把所有输出路径传给 `node --test`。保留 finally 中的临时目录清理。

- [ ] **Step 2：先写命令构造失败测试**

覆盖：

```typescript
const input = {
  flowdeskRoot: "/Users/me/FlowDesk Plugin",
  taskPath: "Tasks/含 ' 引号.md",
  workingDirectory: "/Users/me/项目 A",
  schema: "sdd-poc",
  apiUrl: "",
};

assert.deepEqual(buildSnapshotInvocation(input, "json").args, [
  "Tasks/含 ' 引号.md",
  "--working-directory", "/Users/me/项目 A",
  "--schema", "sdd-poc",
  "--format", "json",
]);
assert.match(formatShellCommand(buildSnapshotInvocation(input, "dashboard")), /--format dashboard$/);
assert.match(formatShellCommand(buildSnapshotInvocation(input, "dashboard")), /'"'"'/);
```

再验证非空 `apiUrl` 位于 task path 后并完整转义。

- [ ] **Step 3：运行测试确认 RED**

```bash
npm test
```

预期：新模块不存在或导出缺失。

- [ ] **Step 4：实现命令模型与 POSIX 转义**

`buildSnapshotInvocation()` 必须返回参数数组，不通过 shell 执行。`formatShellCommand()` 让只含安全 ASCII 字符的 token 保持原样；其他 token 使用单引号包裹，并将内部单引号替换为 `'"'"'` 对应的 POSIX 序列；空白参数也必须可逆。

`loadSnapshot()` 改为调用同一 builder 的 `json` 输出，再传给 `execFileAsync(executable, args, { cwd, maxBuffer })`。

- [ ] **Step 5：运行测试、构建与类型检查**

```bash
npm test
npm run build
npx tsc --noEmit
```

预期：全部通过。

- [ ] **Step 6：提交 Task 1**

```bash
git add src/snapshot-invocation.ts src/main.ts tests/snapshot-invocation.test.ts tests/run-tests.mjs main.js
git commit -m "refactor: unify snapshot command construction"
```

### Task 2：增加 CLI 复制入口与中文动作呈现

**文件：**
- 修改：`src/main.ts:431-460, 958-970, 1130-1138`
- 修改：`src/snapshot-model.ts:371-400`
- 修改：`styles.css:18-80`
- 修改：`tests/snapshot-model.test.ts`

**接口：**
- 消费：Task 1 的 `buildSnapshotInvocation(..., "dashboard")` 与 `formatShellCommand()`。
- 产出：`FlowDeskDashboardPlugin.copyDashboardCommand(taskPath) -> Promise<void>`。
- 修改：导出统一的 `formatNextAction()`，主卡与折叠详情共同使用。

- [ ] **Step 1：先写 action formatter 失败测试**

```typescript
assert.equal(
  formatNextAction({ kind: "continue_inline_implementation", task_ids: ["TASK-4.1"] }),
  "继续 inline 实施：TASK-4.1"
);
assert.equal(formatNextAction({ kind: "unknown_action" }), "unknown_action");
```

- [ ] **Step 2：运行测试确认 RED**

```bash
npm test
```

预期：`formatNextAction` 尚未导出，或详情仍使用 raw formatter。

- [ ] **Step 3：实现复制服务和标题栏按钮**

- 插件方法解析 FlowDesk root，生成 dashboard invocation，并调用 `navigator.clipboard.writeText()`；
- 成功 Notice 为“CLI 命令已复制”，按钮在 view 内短暂显示“已复制”；
- 失败 Notice 包含“无法复制 CLI 命令”与实际原因；
- snapshot 加载失败但任务上下文有效时仍允许复制；
- 标题栏按钮顺序为“复制 CLI”“刷新”。

- [ ] **Step 4：统一 Next Actions 文案**

把 `formatNextAction()` 作为唯一 formatter。主卡和折叠详情都调用它；详情不再调用 `formatAction()` 输出 raw kind。

- [ ] **Step 5：运行验证**

```bash
npm test
npm run build
npx tsc --noEmit
node -c main.js
```

预期：全部通过。

- [ ] **Step 6：提交 Task 2**

```bash
git add src/main.ts src/snapshot-model.ts styles.css tests/snapshot-model.test.ts main.js
git commit -m "feat: copy current dashboard CLI command"
```

### Task 3：修复首次空白并建立非任务上下文边界

**文件：**
- 新建：`src/dashboard-state.ts`
- 新建：`tests/dashboard-state.test.ts`
- 修改：`src/main.ts:70-165, 250-460`
- 修改：`styles.css`

**接口：**
- 产出：`DashboardContext = { kind: "task"; taskPath: string } | { kind: "non-task"; activePath: string; previousTaskPath: string } | { kind: "empty" }`
- 产出：`resolveDashboardContext(activePath, previousTaskPath) -> DashboardContext`
- 产出：`SnapshotRequestIdentity = { taskPath: string; selectionRevision: number }`
- 产出：`isCurrentSnapshotRequest(request, context, selectionRevision) -> boolean`
- 消费：`FlowDeskDashboardView.syncToActiveFile()`、`loadTaskNow()` 与 `render()`。

- [ ] **Step 1：先写上下文与请求身份失败测试**

```typescript
assert.deepEqual(resolveDashboardContext("Tasks/A.md", ""), {
  kind: "task", taskPath: "Tasks/A.md"
});
assert.deepEqual(resolveDashboardContext("Notes/A.md", "Tasks/Prev.md"), {
  kind: "non-task", activePath: "Notes/A.md", previousTaskPath: "Tasks/Prev.md"
});
assert.equal(
  isCurrentSnapshotRequest(
    { taskPath: "Tasks/A.md", selectionRevision: 1 },
    { kind: "task", taskPath: "Tasks/A.md" },
    3
  ),
  false
);
```

- [ ] **Step 2：运行测试确认 RED**

```bash
npm test
```

预期：新模块不存在。

- [ ] **Step 3：实现唯一活动文件同步入口**

- `syncToActiveFile(file = app.workspace.getActiveFile())` 解析并应用 context；
- `onOpen()` 调用同步入口；
- plugin `onload()` 使用 `workspace.onLayoutReady()` 再同步一次恢复后的 view；
- `file-open` 事件调用同一入口；
- 删除 `active-leaf-change` 的无条件 render；
- task context 切换时递增 `selectionRevision`、清理旧 task UI 状态并加载；
- non-task context 递增 revision，阻止在途 task 请求被接受。

- [ ] **Step 4：实现非任务暂停页**

暂停页必须显示当前非任务路径、支持的任务目录、上一任务路径和“回到上一次任务”。不渲染旧 snapshot hero，不显示复制、刷新、诊断或子任务按钮。返回按钮打开上一任务文件；不存在上一任务时只显示引导。

- [ ] **Step 5：用 revision + path + source identity 接受结果**

`loadTaskNow()` 捕获 `{ taskPath, selectionRevision }`。成功、失败和 finally 更新 UI 前都调用 `isCurrentSnapshotRequest()`；成功后继续执行现有 `validateSnapshotSource()`。

- [ ] **Step 6：运行验证并提交**

```bash
npm test
npm run build
npx tsc --noEmit
node -c main.js
git diff --check
```

```bash
git add src/dashboard-state.ts src/main.ts styles.css tests/dashboard-state.test.ts main.js
git commit -m "fix: synchronize dashboard task context on open"
```

### Task 4：收敛自动刷新与保持显示状态

**文件：**
- 修改：`src/dashboard-state.ts`
- 修改：`tests/dashboard-state.test.ts`
- 修改：`src/main.ts:112-120, 250-430, 700-710`
- 修改：`styles.css`

**接口：**
- 产出：`collectObservedTaskPaths(parentTaskPath, snapshot) -> Set<string>`
- 产出：`TrailingRefreshScheduler`，支持 `schedule()`、`flush()`、`cancel()`。
- 消费：Vault modify 事件、手动刷新与 view `onClose()`。

- [ ] **Step 1：先写 observed paths 和 scheduler 失败测试**

验证 parent 与 `task_graph.tasks[].id` 都进入集合；非 `.md` 值忽略。使用注入的 fake `setTimer`/`clearTimer` 证明连续三次 `schedule()` 只执行最后一个 callback，`flush()` 立即执行且取消等待。

- [ ] **Step 2：运行测试确认 RED**

```bash
npm test
```

预期：新导出不存在。

- [ ] **Step 3：实现 500ms trailing debounce**

- Vault modify 只在 task context 且路径属于 `collectObservedTaskPaths()` 时调用 `schedule()`；
- 手动刷新调用 `flush()` 并立即进入现有请求队列；
- view 关闭或切换到非任务时 `cancel()`；
- 请求队列继续只保留当前请求与最新待执行请求。

- [ ] **Step 4：保持折叠状态并消除布局跳动**

- view 保存 `detailsOpen`；details 的 `toggle` 事件写回；
- 同任务刷新保留该值，切换任务重置；
- 删除 body 中独立的“正在刷新 snapshot...”块；
- 刷新状态只体现在按钮和 header meta。

- [ ] **Step 5：运行验证并提交**

```bash
npm test
npm run build
npx tsc --noEmit
node -c main.js
git diff --check
```

```bash
git add src/dashboard-state.ts src/main.ts styles.css tests/dashboard-state.test.ts main.js
git commit -m "fix: stabilize dashboard refresh lifecycle"
```

### Task 5：中文化、文档与 `0.1.2` 发布准备

**文件：**
- 修改：`src/main.ts`
- 修改：`README.md`
- 修改：`manifest.json`
- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`versions.json`
- 修改：`main.js`

**接口：**
- 消费：Task 1–4 的最终 UI 与命令行为。
- 产出：可由 BRAT 识别的 `0.1.2` release assets。

- [ ] **Step 1：整理用户可见文案**

把 `Pinned`、`No task selected`、`No flow nodes`、`Next Actions`、`present/missing` 等主界面文案改为中文；保留 `snapshot v2`、`SDD v2`、TASK ID 和诊断 code。

- [ ] **Step 2：更新 README**

记录：复制 CLI、非任务暂停页、首次同步、自动刷新范围、手动刷新边界和 BRAT 更新方式。

- [ ] **Step 3：升级版本到 `0.1.2`**

```bash
npm version 0.1.2 --no-git-tag-version
```

同步 `manifest.json` 为 `0.1.2`，并在 `versions.json` 增加 `"0.1.2": "1.5.0"`。

- [ ] **Step 4：运行完整发布验证**

```bash
npm run release:prepare
git diff --check
```

预期：全部测试、build、typecheck、syntax、release verify 和本地 package 均通过。

- [ ] **Step 5：提交发布准备**

```bash
git add README.md manifest.json package.json package-lock.json versions.json src main.js styles.css tests scripts
git commit -m "chore: prepare FlowDesk Dashboard 0.1.2"
```

- [ ] **Step 6：人工安装态 smoke 清单**

- Obsidian 启动且 Dashboard view 已恢复时，当前 task 首次显示；
- task → 普通 note 显示暂停页且隐藏旧 snapshot；
- “回到上一次任务”恢复并刷新；
- “复制 CLI”粘贴到任意终端目录可执行；
- 快速 A → B → A 不闪回旧数据；
- 同任务失败显示 stale，source mismatch 拒绝展示；
- 展开的执行详情在同任务刷新后保持展开；
- children 子任务修改会刷新父 Dashboard；
- 约 320px 侧栏无横向滚动。
