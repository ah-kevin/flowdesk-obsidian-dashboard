# FlowDesk 执行证据展示顺序实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 FlowDesk CLI 与 Obsidian dashboard 提供一致、稳定且结果优先的证据展示顺序，并正确显示证据有效性。

**Architecture:** producer 保留原始 `items`，新增 `display_items/display_order` 作为只读展示投影；CLI 与 Obsidian 优先消费投影，旧 snapshot 回退原字段。排序和有效性映射均由纯函数覆盖测试，不修改 TaskNotes 原文与 semantic validation 输入。

**Tech Stack:** Python 3、pytest、TypeScript、Node test runner、esbuild、Obsidian Plugin API。

## Global Constraints

- 同一 snapshot JSON 数据源服务 CLI 与 Obsidian。
- FlowDesk producer 与 Obsidian consumer 分属独立仓库。
- 不读写 TaskNotes Markdown 作为降级路径。
- 新字段必须向后兼容；旧 snapshot 仍可渲染。
- 所有实现遵循 RED → GREEN → 回归验证。

---

### Task 1: Producer 证据展示投影

**Files:**
- Modify: `/Users/bjke/workspaces/flowdesk-plugin/lib/flowdesk_execution_snapshot.py`
- Test: `/Users/bjke/workspaces/flowdesk-plugin/tests/runtime/test_execution_snapshot.py`

**Interfaces:**
- Consumes: `items: list[str]` 与合同 `task_ids: list[str]`。
- Produces: evidence 可选字段 `display_items: list[str]`、`display_order: str`。

- [ ] **Step 1: 写执行结果排序失败测试**

构造 Task Breakdown 为 `TASK-1.1, TASK-2.1, TASK-5.1`、Markdown 证据顺序为 `TASK-5.1, TASK-1.1, 未关联, TASK-2.1`；断言 `items` 原序不变，`display_items` 为 `TASK-1.1, TASK-2.1, TASK-5.1, 未关联`。

- [ ] **Step 2: 运行定向测试确认 RED**

Run: `bin/test tests/runtime/test_execution_snapshot.py -q -k 'evidence_display_order'`

Expected: FAIL，缺少 `display_items` 或顺序仍为 Markdown 原序。

- [ ] **Step 3: 写验证结果排序失败测试**

以本地检查、发布、安装态、运行态 smoke、未知证据的乱序输入，断言结果优先顺序为运行态、安装态、发布/CI、静态检查、其他，且同类别稳定。

- [ ] **Step 4: 实现最小 producer 排序函数**

新增稳定 TASK 排序与验证证据分类函数，在 `build_contract` 已取得 `task_ids` 后只填充 `display_items/display_order`；不得改写 `items`、`valid_items`、`commands` 或 `results`。

- [ ] **Step 5: 让 terminal dashboard 消费展示序**

`render_task_evidence` 使用 `display_items`，字段不存在时回退 `items`；计数仍以原始 `items` 为准。

- [ ] **Step 6: 运行 producer 定向与完整测试**

Run: `bin/test tests/runtime/test_execution_snapshot.py -q`

Expected: PASS。

Run: `bin/test tests/`

Expected: PASS，既有 semantic validation 行为不变。

### Task 2: Obsidian 证据展示与有效性三态

**Files:**
- Create: `src/evidence-presentation.ts`
- Modify: `src/snapshot-model.ts`
- Modify: `src/main.ts`
- Create: `tests/evidence-presentation.test.ts`

**Interfaces:**
- Consumes: `EvidenceItem`，包括可选 `display_items/display_order`。
- Produces: `getEvidenceDisplayItems(item)`、`getEvidenceDisplayState(item)`、`formatEvidenceSummary(label, item)`。

- [ ] **Step 1: 写 consumer 失败测试**

断言新 snapshot 优先使用 `display_items`，旧 snapshot 回退 `items`；断言 `missing → blocked`、`invalid → error`、`valid → done`，以及缺少 `valid` 的旧 evidence 仍按 `exists` 兼容。

- [ ] **Step 2: 运行测试确认 RED**

Run: `npm test`

Expected: FAIL，模块或导出函数尚不存在。

- [ ] **Step 3: 实现纯展示模型**

在 `src/evidence-presentation.ts` 实现三个纯函数；不依赖 Obsidian API，便于 Node 测试。

- [ ] **Step 4: 接入 Obsidian 渲染**

`evidenceRow` 使用纯函数决定顺序、状态色和“缺失 / 存在但无效 / 有效”文案；继续前两条直出，其余折叠。

- [ ] **Step 5: 运行 consumer 回归**

Run: `npm test`

Expected: PASS。

Run: `npm run build && npm run typecheck && npm run check:syntax`

Expected: 全部 PASS。

### Task 3: 双端真实数据验收与提交

**Files:**
- Review: 两仓库本分支全部 diff。

**Interfaces:**
- Consumes: 开发仓库 producer CLI 与当前 TaskNotes HTTP API。
- Produces: 可复现的真实 snapshot/terminal dashboard 证据与两个独立 PR。

- [ ] **Step 1: 运行真实 JSON 对照**

Run: `/Users/bjke/workspaces/flowdesk-plugin/bin/flowdesk-execution-snapshot 'Tasks/Obsidian Dashboard v2 体验升级 — 消费 snapshot v2.md' --working-directory /Users/bjke/workspaces/github/flowdesk-obsidian-dashboard --schema sdd-poc --format json | jq '.spec_contract.evidence | {execution_result, verification_result}'`

Expected: `items` 保持历史原序；execution `display_items` 从 `TASK-1.1` 开始；verification `display_items` 从运行态 smoke 与 BRAT 安装态开始。

- [ ] **Step 2: 运行真实 terminal dashboard 对照**

Run: `/Users/bjke/workspaces/flowdesk-plugin/bin/flowdesk-execution-snapshot 'Tasks/Obsidian Dashboard v2 体验升级 — 消费 snapshot v2.md' --working-directory /Users/bjke/workspaces/github/flowdesk-obsidian-dashboard --schema sdd-poc --format dashboard`

Expected: CLI 与 JSON `display_items` 的前两条一致。

- [ ] **Step 3: 人工审查 diff**

Run: `git diff --check && git diff --stat && git diff`

Expected: 无空白错误、无版本号修改、无跨仓库文件混入。

- [ ] **Step 4: 分别提交、推送并创建 PR**

Producer commit: `fix: stabilize execution evidence display order`

Obsidian commit: `fix: clarify execution evidence ordering`

Expected: 两个 PR 均基于各自最新 `main`，CI 通过后再进入合并与发布 gate。
