# FlowDesk Obsidian Dashboard Task-centric 控制台实施计划

> **供 agent worker 使用：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐项实施；步骤使用 checkbox 跟踪。

**目标：** 将 Obsidian Dashboard 从固定 root/children 页面改为当前 task 控制台，严格消费 schema 3 + `snapshot_model=task-centric`，并针对有 children 与 leaf task 提供不同的渐进披露体验。

**架构：** `snapshot-model.ts` 只做 producer JSON 到稳定 view model 的字段映射和模型握手；`dashboard-state.ts` 管理 active file、source identity、stale 与详情展开状态；`main.ts` 只渲染 current task、可选 parent breadcrumb、direct child rollup、诊断、合同与证据。任何状态和排序均来自 producer，不在 TypeScript 侧重新判定。

**技术栈：** TypeScript、Obsidian Plugin API、Node test runner、esbuild、CSS。

## 全局约束

- 只接受 `snapshot_schema_version=3` 且 `snapshot_model=task-centric`；不兼容旧 root-centric schema 3。
- Dashboard 只读，不修改 TaskNotes、Work Case 或 FlowDesk runtime。
- current task 是唯一页面焦点；parent 只作为 breadcrumb，children 只显示 direct summaries。
- 有 children 的 task 默认先显示 rollup/child review，合同详情折叠；leaf 默认展开自身合同，不显示空 children section。
- 非 TaskNotes 文件立即清空旧 snapshot；只有同一 task 刷新失败才允许 stale fallback。
- source identity、observation 或模型握手失败必须 fail-closed，禁止把缺字段渲染成健康零值。
- 保留 CLI 命令复制、诊断定位、首次打开与 trailing refresh 能力。
- 保留 OpenSpec 启发的“状态 → 当前动作 → 证据细节”控制台节奏与渐进披露，不复制 OpenSpec 文件树或形成第二事实源。
- consumer fixture 必须与 FlowDesk Plugin canonical producer fixture字节等值。
- 不改版本号、不安装、不合并、不发布；实现完成后提交新分支并创建独立 PR，等待 leader/user gate。
- 设计依据：`Notes/Plans/2026-08-05-FlowDesk-SDD-v3-统一任务合同与Task-centric-Dashboard.md`。

---

## 文件职责映射

- `src/snapshot-model.ts`：task-centric wire types、model marker gate、中文 view model、诊断/动作格式化。
- `src/dashboard-state.ts`：current task 与 snapshot request identity、被观察 task path、详情默认展开策略、刷新去重。
- `src/main.ts`：Obsidian 生命周期、current-task 页面、breadcrumb、children review、合同/证据/诊断、CLI 复制。
- `src/evidence-presentation.ts`：三类证据的状态映射；不改变 producer 顺序。
- `src/snapshot-invocation.ts`：继续生成当前 task 的 positional CLI 命令，不引入 root 参数。
- `styles.css`：current task hero、breadcrumb、child summary、leaf contract 与 fail-closed 状态。
- `tests/snapshot-model.test.ts`：schema/model handshake 与全部字段映射。
- `tests/dashboard-state.test.ts`：active file、source identity、observed paths、详情展开与 stale。
- `tests/snapshot-invocation.test.ts`：CLI 复制仍以当前 task path 为参数。
- `tests/fixtures/sdd_v3_real_root_snapshot.json`：与 producer 完全一致的 canonical fixture。
- `README.md`：task-centric 使用方式、模型要求与刷新语义。

---

### 任务 1：用 task-centric wire model 与 view model 替换 root-centric 类型

**文件：**
- 修改：`src/snapshot-model.ts`
- 修改：`tests/snapshot-model.test.ts`
- 修改：`src/evidence-presentation.ts`
- 修改：`tests/evidence-presentation.test.ts`
- 修改：`tests/fixtures/sdd_v3_real_root_snapshot.json`

**接口：**
- 输入：producer 顶层 `snapshot_schema_version/snapshot_model/source_task_id/observation/current_task/parent/contract/children/rollup/evidence/diagnostics/next_actions`。
- 输出：`createDashboardViewModel(value, options) -> DashboardViewModel`。
- 错误码：`unsupported_snapshot_schema | unsupported_snapshot_model | null`。

- [x] **步骤 1：用 canonical task-centric 形态重写测试 factory**

```ts
function createTaskCentricSnapshot() {
  return {
    snapshot_schema_version: 3,
    snapshot_model: "task-centric",
    generated_at: "2026-08-05T12:00:00Z",
    source_task_id: "Tasks/Root.md",
    observation: {
      health: "healthy",
      current_task: "observed",
      parent: "not_applicable",
      children: "observed",
      tasknotes_api: "ok",
      source_identity_match: true,
    },
    current_task: {
      id: "Tasks/Root.md",
      title: "Root",
      status: "in-progress",
      priority: "high",
      has_children: true,
      trusted_done: false,
    },
    parent: null,
    contract: {
      version: "v3",
      goal: "完成跨仓库交付",
      scope: { included: ["Plugin 与 Dashboard"], excluded: ["自动发布"] },
      requirements: [{ id: "REQ-001", text: "双端同源" }],
      scenarios: [{ id: "SCN-001", covers: ["REQ-001"], text: "两端状态一致" }],
      acceptance: [{ text: "跨仓库 smoke 通过", checked: false }],
      semantic_status: "valid",
    },
    children: [{
      id: "Tasks/Child.md",
      title: "Child",
      status: "in-progress",
      priority: "normal",
      blocked_by: [],
      goal: "实现 Dashboard",
      has_children: false,
      rollup_state: "running",
      semantic_status: "valid",
      evidence_health: { execution: "valid", verification: "missing", delivery: "valid" },
      trusted_done: false,
    }],
    rollup: { state: "running", has_children: true, total: 1, trusted_done: 0 },
    evidence: { execution: "valid", verification: "missing", delivery: "valid" },
    diagnostics: [],
    next_actions: [{ kind: "continue_current_task", summary: "继续当前任务" }],
  };
}
```

- [x] **步骤 2：添加模型握手 RED 测试**

```ts
test("schema 3 缺少 task-centric marker 时 fail-closed", () => {
  const snapshot = createTaskCentricSnapshot();
  delete (snapshot as { snapshot_model?: string }).snapshot_model;
  const model = createDashboardViewModel(snapshot);
  assert.equal(model.errorCode, "unsupported_snapshot_model");
  assert.equal(model.observation.isTrustworthy, false);
});
```

另测 schema 非 3 返回 `unsupported_snapshot_schema`，model marker 错误不退回 root-centric 解析。

- [x] **步骤 3：运行 RED 测试**

运行：`npm test -- --test-name-pattern='task-centric|marker|schema'`

预期：FAIL，当前类型只读取 `task_tree.root` 并只校验 schema number。

- [x] **步骤 4：重写 wire types**

删除 `TaskTreeRoot/TaskTreeChild/task_tree/evidence.root/evidence.children/role/covers/overall_acceptance`，新增：

```ts
export interface SnapshotTaskSummary {
  id?: string;
  title?: string;
  status?: string;
  priority?: string;
  blocked_by?: unknown[];
  goal?: string;
  has_children?: boolean;
  rollup_state?: string;
  semantic_status?: string;
  evidence_health?: SnapshotEvidenceHealth;
  trusted_done?: boolean;
  primary_diagnostic?: unknown;
}

export interface SnapshotObservation {
  health?: string;
  current_task?: string;
  parent?: string;
  children?: string;
  tasknotes_api?: string;
  source_identity_match?: boolean;
}

export interface SnapshotTaskContract {
  version?: string;
  goal?: string;
  scope?: { included?: string[]; excluded?: string[] };
  requirements?: SnapshotContractItem[];
  scenarios?: SnapshotContractItem[];
  acceptance?: SnapshotAcceptanceItem[];
  semantic_status?: string;
}

export interface SnapshotRollup {
  state?: string;
  has_children?: boolean;
  total?: number;
  trusted_done?: number;
  blocked_children?: RollupTaskReference[];
  incomplete_children?: RollupTaskReference[];
  contradictions?: unknown[];
}

export interface SnapshotV3 {
  snapshot_schema_version?: number;
  snapshot_model?: string;
  generated_at?: string;
  source_task_id?: string;
  observation?: SnapshotObservation;
  current_task?: SnapshotTaskSummary;
  parent?: Pick<SnapshotTaskSummary, "id" | "title" | "status"> | null;
  contract?: SnapshotTaskContract;
  children?: SnapshotTaskSummary[];
  rollup?: SnapshotRollup;
  evidence?: SnapshotEvidenceHealth;
  diagnostics?: unknown[];
  next_actions?: Record<string, unknown>[];
}
```

- [x] **步骤 5：重写 DashboardViewModel 映射**

view model 使用 `currentTask/parent/children/contract/rollup/evidence`。`supported` 必须拆成 `schemaSupported` 与 `modelSupported`；`isTrustworthy` 同时要求两者、healthy observation、current task 与 children 已观测、source identity 一致且非 stale。

- [x] **步骤 6：添加 current task、parent、leaf 与 child summary 映射测试**

断言：parent breadcrumb 可空；leaf `hasChildren=false`；child goal/blockedBy/evidence/primary diagnostic 保留；REQ/SCN/Acceptance 顺序与 producer 一致；不产生 `covers` 字段。

- [x] **步骤 7：运行模型与证据测试确认 GREEN**

运行：`npm test -- --test-name-pattern='task-centric|marker|schema|contract|evidence|parent|leaf'`

预期：全部 PASS。

- [x] **步骤 8：提交 wire/view model**

```bash
git add src/snapshot-model.ts src/evidence-presentation.ts tests/snapshot-model.test.ts tests/evidence-presentation.test.ts tests/fixtures/sdd_v3_real_root_snapshot.json
git commit -m "refactor: consume task-centric snapshots"
```

---

### 任务 2：收紧 current-task 状态、observed paths 与详情展开策略

**文件：**
- 修改：`src/dashboard-state.ts`
- 修改：`tests/dashboard-state.test.ts`
- 修改：`src/main.ts`

**接口：**
- `collectObservedTaskPaths(currentTaskPath, snapshot)` 返回 current task、可选 parent 与 direct children 的路径集合。
- `resolveDetailsOpen(previousOpen, taskChanged, diagnosticCount, hasChildren)` 决定合同详情默认状态。
- 现有 `resolveDashboardContext/isCurrentSnapshotRequest/TrailingRefreshScheduler` 行为保持。

- [x] **步骤 1：添加 observed paths RED 测试**

```ts
test("观察当前 task、parent 与 direct children", () => {
  const paths = collectObservedTaskPaths("Tasks/Child.md", {
    current_task: { id: "Tasks/Child.md" },
    parent: { id: "Tasks/Root.md" },
    children: [{ id: "Tasks/Grandchild.md" }],
  });
  assert.deepEqual([...paths].sort(), [
    "Tasks/Child.md", "Tasks/Grandchild.md", "Tasks/Root.md",
  ]);
});
```

- [x] **步骤 2：添加 parent/leaf 默认展开 RED 测试**

```ts
assert.equal(resolveDetailsOpen(false, true, 0, true), false);
assert.equal(resolveDetailsOpen(false, true, 0, false), true);
assert.equal(resolveDetailsOpen(false, true, 1, true), true);
```

含义：有 children 默认折叠；leaf 默认展开；任一首要诊断强制展开相关详情。

- [x] **步骤 3：运行 RED 测试**

运行：`npm test -- --test-name-pattern='观察当前|默认展开|leaf'`

预期：FAIL，当前 helper 仍读取 `task_tree.root/children` 且无 `hasChildren` 参数。

- [x] **步骤 4：修改纯状态 helper**

`ObservedTaskSnapshot` 改为 task-centric 最小类型；paths 只接受合法 `Tasks/*.md`；details 状态只在 task identity 改变时重置，同一 task 手动展开状态不被后台刷新覆盖。

- [x] **步骤 5：让 view 生命周期使用新 helper**

`loadTask()` 完成后根据 `model.currentTask.hasChildren` 设置 details 默认值；切换非 task 时继续取消 pending request、清空 display state 和 observed paths；同一 task refresh failure 只写 staleReason。

- [x] **步骤 6：运行状态机回归确认 GREEN**

运行：`npm test -- --test-name-pattern='dashboard context|request|观察当前|默认展开|refresh|stale'`

预期：全部 PASS。

- [x] **步骤 7：提交状态机变更**

```bash
git add src/dashboard-state.ts src/main.ts tests/dashboard-state.test.ts
git commit -m "refactor: focus dashboard state on current tasks"
```

---

### 任务 3：实现 current-task 控制台、breadcrumb 与两种渐进披露

**文件：**
- 修改：`src/main.ts`
- 修改：`styles.css`
- 修改：`tests/snapshot-model.test.ts`

**接口：**
- 输入：任务 1 的 `DashboardViewModel`。
- 输出顺序：Header → breadcrumb → trust strip → current task hero → primary diagnostic → next action/CLI copy → optional child rollup/cards → current contract/evidence details。

- [x] **步骤 1：添加 UI 文案 helper RED 测试**

对 `formatRollupState/formatNextAction/formatChildEvidenceHealth` 断言 task-centric 中文：

```ts
assert.equal(formatRollupState("awaiting_current_verification"), "等待当前任务验证");
assert.equal(
  formatNextAction({ kind: "continue_current_task", task_ids: ["Tasks/Child.md"] }),
  "继续当前任务：Tasks/Child.md"
);
```

旧 `parent/child work package` 专属动作不再出现。

- [x] **步骤 2：运行 RED 测试**

运行：`npm test -- --test-name-pattern='当前任务|rollup|next action'`

预期：至少 task-centric 新 action/label FAIL。

- [x] **步骤 3：将 root hero 改为 current task hero**

`renderRootHero` 重命名为 `renderCurrentTaskHero`，固定展示 title/status/priority/trust/rollup。工作进度：有 children 时显示 `trusted/total direct children`；leaf 显示自身合同、Acceptance 和证据 gate，不显示 `0/0 子任务`。

- [x] **步骤 4：实现可选 parent breadcrumb**

parent 非空时在 hero 前显示 `父任务 / 当前任务`；点击 parent 调用 Obsidian `openLinkText(parent.id, currentTask.id, false)`。root/无 parent 不创建空 breadcrumb DOM。

- [x] **步骤 5：重写 child cards**

child card 固定显示 Goal、status、priority、blockedBy、trusted state、hasChildren、rollup state、三类 evidence 和首要诊断；删除 Covers 与完整 Acceptance 列表。保留“打开任务”按钮。

- [x] **步骤 6：实现 parent/leaf 两种 details 默认展示**

有 children：先显示 rollup 与 child cards，合同/证据使用折叠容器。leaf：不调用 `renderChildren`，Goal/Scope/Requirements/Scenarios/Acceptance 默认展开；三类证据按 missing/invalid/valid 使用现有状态样式。

- [x] **步骤 7：保留诊断与 CLI 复制的优先级**

首要诊断始终位于 next action 前，展示 task/path/line/reason/expected/remediation；CLI copy 继续使用 `createSnapshotInvocation(model.currentTask.id, "dashboard")`，复制的是当前 task 命令。

- [x] **步骤 8：更新 CSS**

新增 `.flowdesk-breadcrumb`、`.flowdesk-current-task-hero`、`.flowdesk-child-rollup`、`.flowdesk-leaf-contract`；删除只服务 root/Covers 的 selectors。窄侧栏下 breadcrumb 可换行，按钮不溢出。

- [x] **步骤 9：运行测试、构建与语法检查确认 GREEN**

运行：`npm test`

运行：`npm run build`

运行：`npx tsc --noEmit`

运行：`node -c main.js`

预期：全部 PASS / exit 0。

- [x] **步骤 10：提交 UI 变更**

```bash
git add src/main.ts src/snapshot-model.ts styles.css tests/snapshot-model.test.ts main.js
git commit -m "feat: present a current-task dashboard"
```

---

### 任务 4：锁定模型握手、刷新失败与非 task fail-closed 行为

**文件：**
- 修改：`src/main.ts`
- 修改：`src/dashboard-state.ts`
- 修改：`tests/dashboard-state.test.ts`
- 修改：`tests/snapshot-model.test.ts`
- 修改：`tests/snapshot-invocation.test.ts`

**接口：**
- 加载入口必须在写入 display state 前同时校验 schema、model marker 与 source identity。
- stale 只允许复用 `displayState.taskPath === request.taskPath` 的 snapshot。

- [x] **步骤 1：添加旧 schema 3 marker 缺失的加载 RED 测试**

模拟 CLI 返回 `{ snapshot_schema_version: 3, task_tree: {} }`；断言 display state 不进入正常页面，而显示 `Snapshot model 不受支持：需要 task-centric`。

- [x] **步骤 2：添加跨 task stale 泄漏 RED 测试**

先成功加载 Task A，再切换 Task B 并让 B 刷新失败；断言 A snapshot 不渲染为 B，B 只显示错误状态。Task A 自身随后刷新失败时，才允许 A stale snapshot 保留并显示时间与原因。

- [x] **步骤 3：运行 RED 测试**

运行：`npm test -- --test-name-pattern='model 不受支持|跨 task|stale|source identity|非 task'`

预期：至少 marker gate 的加载路径 FAIL。

- [x] **步骤 4：集中加载校验**

在 `loadTask()` 中按 schema → model marker → source identity 顺序校验；错误文案包含请求 task 和实际 source/model。不要只依赖后续 view model 的 `errorCode` 才发现不匹配。

- [x] **步骤 5：验证刷新触发与请求去重**

保持 `file-open`、`onLayoutReady`、vault modify trailing refresh 三个入口；`selectionRevision` 与 `isCurrentSnapshotRequest` 必须阻止过期 promise 回写。测试 scheduler 多次 modify 只执行一次 trailing callback。

- [x] **步骤 6：确认 CLI invocation 无 root 假设**

测试 `buildSnapshotInvocation("Tasks/Child.md", "json", config)` 的第一个 positional arg 正是 Child path；复制 dashboard 命令不出现 `--parent` 或旧 schema 参数。

- [x] **步骤 7：运行状态回归确认 GREEN**

运行：`npm test`

预期：全部 PASS。

- [x] **步骤 8：提交 fail-closed 变更**

```bash
git add src/main.ts src/dashboard-state.ts tests/dashboard-state.test.ts tests/snapshot-model.test.ts tests/snapshot-invocation.test.ts
git commit -m "fix: fail closed on dashboard model mismatches"
```

---

### 任务 5：真实 producer 等值、README、全量验证与 PR

**文件：**
- 修改：`tests/fixtures/sdd_v3_real_root_snapshot.json`
- 修改：`tests/snapshot-model.test.ts`
- 修改：`README.md`
- 修改：`docs/superpowers/plans/2026-08-05-dashboard-task-centric.md`（只勾执行步骤）
- 审查：全部 changed files

**接口：**
- 输入：FlowDesk Plugin `tests/fixtures/execution_snapshot/sdd_v3_real_root_snapshot.json`。
- 产出：Dashboard PR，不合并、不改版本、不发布。

- [x] **步骤 1：复制 Plugin canonical fixture 并保持字节等值**

实现完成时，从 `/Users/bjke/workspaces/flowdesk-plugin/tests/fixtures/execution_snapshot/sdd_v3_real_root_snapshot.json` 更新 Dashboard fixture。测试在 producer repo 存在时使用 `assert.deepEqual` 比较完整 JSON，不允许字段级宽松兼容。

- [x] **步骤 2：添加真实 fixture 映射断言**

至少断言：model marker、current task id/title、可选 parent、direct child ids、rollup counts、contract 条目顺序、current evidence、observation trust、primary diagnostic、next action 全部与 producer 相等。

- [x] **步骤 3：更新 README**

说明：最低 producer 要求为 schema 3 + task-centric marker；打开任一 TaskNotes task 即查看该 task；有 children/leaf 的默认展示差异；非 task、stale、source mismatch、CLI copy 的行为；Dashboard 仍只读。

- [x] **步骤 4：运行发布前全量验证**

运行：`npm test`

预期：全部 PASS。

运行：`npm run build`

预期：PASS 并更新 `main.js`。

运行：`npx tsc --noEmit`

预期：PASS。

运行：`node -c main.js`

预期：exit 0。

运行：`git diff --check`

预期：exit 0 且无输出。

- [x] **步骤 5：执行旧模型零命中审查**

运行：

```bash
rg -n 'task_tree|TaskTreeRoot|TaskTreeChild|\.covers|overallAcceptance|renderRootHero|0/0 子任务' src tests --glob '!tests/fixtures/**'
```

预期：运行代码零旧模型命中；反向测试若引用旧字段，必须明确用于 fail-closed 输入。

- [x] **步骤 6：人工 diff review**

确认：无 TaskNotes 写操作；无 consumer 侧状态推断；无版本/release 改动；非 task 与跨 task stale 不泄漏；CSS 在窄侧栏无显著溢出；未覆盖用户无关改动。

- [ ] **步骤 7：创建新分支、最终提交、push 与 PR**

分支：`codex/dashboard-task-centric`。PR 描述关联 Plugin PR，列出 breaking model handshake、parent/leaf UX、刷新边界与全部验证；不合并、不发布。
