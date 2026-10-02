# Dashboard Task 2：层次与关联刷新源码交付

Task 2 源码已通过主控独立 review，无 Critical/Important/Minor；Task 已真实回读 done/healthy/trusted_done。分支 `codex/2.0`、原基线 `5728464`；保留先前 Task 1 未提交实现、正文/read-only/auth 回归及报告。版本仍 `0.1.27`。本批没有 stage/commit/push/install/release/bump，没有写 Core、vault/Task/Case 或配置，没有创建 App chat 或调用 App 跨线程消息。

统一顶部顺序为标题/原生生命周期 → 来源、读取时间和读取健康 → 当前进展/下一步 → 关联任务和正文 → 技术详情。共享 `entity-presentation.ts` 只做翻译与稳定分组，不写事实；原始状态留在 model 和 tooltip。Task `done` 与来源读取完整分别显示，历史规格/验收诊断独立保留。未知自定义状态显示原词及未知标记并留在当前组；进行中在前，实际未完成阻塞其次，其他未完成/unknown 随后，各组内保留 producer 顺序。已完成/真正归档项折叠。done 仍带 blockedBy 且 is_blocked=false 时显示“历史依赖”，不称“阻塞于”；父 Task 完成、Case completed 和关联 Task 状态不会互相改写。

Case 顶部显示读取时间和任务观察健康，Current 中文标签与 Task 一致，Project/Plans 使用 alias 或文件名，导航仍收到完整原 target。工作区、agent/session/cwd/branch 移到内容之后的技术详情；关联任务优先展示当前项，历史折叠，统计折叠且去掉大字号完成仪表/progress meter。沿用 Cupertino/Obsidian 字体、颜色、背景、边框及交互 token 和现有 320/420px 规则，未建立新视觉系统。

CaseAdapter 观察 Case 本身、已关联 Task ID 和所有 `Tasks/`/`TaskNotes/` Markdown 路径，覆盖未来关联移入与移出。main 注册 modify/create/delete/rename（rename 同时检查 oldPath/newPath）及 metadata 补充事件，复用原 `TrailingRefreshScheduler` 的 trailing 500ms 合并；无新增轮询。事件立即令 cached 内容 stale，令已在途请求 generation 失效，新的 load 成功后清除 dirty。每次 activate 同时检查递增 generation、controller、selection 与 shell current；即使旧 load 忽略 abort，晚 success/error/finally 也不能覆盖新请求。切换 Task/非 FlowDesk/close 取消 timer、abort 并清除 Case view。外部 API 无本地 vault 事件时由显式刷新拉取，不宣称实时订阅。

`coverage.complete=false` 或非 healthy 观察时不显示健康完整 counts；healthy + incomplete 的异常组合降为 degraded，汇总保持 null。401/partial 保留可读 Case 主体与观察到的条目，不渲染“0/0 成功”或“没有关联任务”。

## 新增和改动范围

Task 2 产品文件：新增 `src/entity-presentation.ts`；修改 `src/work-case-model.ts`、`work-case-presentation.ts`、`work-case-renderer.ts`、`work-case-adapter.ts`、`dashboard-presentation.ts`、`main.ts`、`styles.css` 和构建 `main.js`。`dashboard-state.ts` 的原 scheduler 直接复用，无需修改。Task 1 的 `task-content*`、`tasknotes-read.ts`、auth、snapshot model、README 和 Task 1 报告未被本批改写。

新增 `tests/entity-presentation.test.ts`、`tests/dashboard-hierarchy-integration.test.ts`、`tests/fixtures/task-dashboard-task2-baseline.json`；扩展 adapter/presentation/renderer 消费回归，迁移原 native status 被质量状态替代的旧断言。移除 Dashboard UI 的“可信完成计数”静态字符串测试，由 real producer → compiled plugin 的生命周期、历史分组和只读 HTTP 回归替代；Case status-list 旧源码位置断言由 DOM 层次/统计折叠测试覆盖。Task 1 原 `task-dashboard-baseline.json` 保留，新的 baseline 测试读取 Task 2 presentation/DOM fixture；schema3/4 view model 哈希与 Task 1 完全一致，producer fixtures 未改。临时基线 probe 已删除。

## RED 与失败记录

- 隔离先行：`node tests/run-tests.mjs isolation.test.ts` 2/2 passed，随后才运行任何产品测试；唯一 runner、低层 guard 和 owned fixture 支持均未改动。
- 首轮 adapter + Case presentation：9 passed / 6 failed。真实失败为旧 success `Old !== New`、旧 error 污染新请求、潜在 Task path 未观察、scheduleRefresh 缺失、unknown 漏项/完成项进入 current、incomplete coverage 仍显示 healthy。
- 新 entity module 首次不存在，bundle 明确拒绝；随后 Dashboard presentation 的实际 RED 为 children 原始顺序没有当前优先。Case hierarchy 的 DOM RED 缺少顶部 observation 区且 recovery 仍在 header。独立读取健康 RED 返回 `v3 历史验证`，未与历史规格/验收分开。
- 初次 compiled Case 集成错误使用 fixture root 注册 working-directory 白名单，而生产入口实际使用 owned vault root；guard 在执行前拒绝两条不匹配 command，suite 失败。只修正测试确切 argv/working-directory，不放宽 guard、不换 mock producer。之后 controlled Case/Task 集成 3/3 passed，默认完整 suite 没有 unexpected violations。
- 中间还观察到 TypeScript Obsidian `on` overload 不接受 union event，以及原 FakeElement 不支持 appendChild；依照公开 types 将事件逐一注册，直接在统计 details 内创建 status list，未给生产类加测试专用方法。旧文本/顺序/语义断言按有意新合同迁移；typecheck、最终全部检查通过。

## 已观测验证

| 检查 | 结果与证据边界 |
|---|---|
| `node tests/run-tests.mjs isolation.test.ts` | 2 passed，默认 owned HOME/vault/state/auth 与 Python child guard 负向探针；没有真实宿主访问 |
| 12 文件 Task 2 聚焦 suite | 100 passed / 0 failed / 0 skipped，含 adapter generation/timer、DOM 层次/折叠、legacy、partial、read-only consumer |
| Task 1 内容/auth/新基线 5 文件回归 | 23 passed / 0 failed / 0 skipped；完整 Markdown/全部记录、全文 GET/身份/401/脱敏保持；schema3/4 Task view model hashes 不变 |
| `node tests/run-tests.mjs`（`npm test` 唯一脚本的直接入口） | 一次完整运行 180 passed / 0 failed / 0 skipped，exit 0；main/common wiring 改动后执行；无 unexpected guard violations |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0，仓库 `main.js` 157.9kb；未安装 |
| `npm run check:syntax` | exit 0 |
| `git diff --check` | exit 0 |

controlled HTTP → 真实 Core `flowdesk-work-case-snapshot` → compiled Dashboard 完整事件回归包含关联 Task 状态变更、关联移入移出、create/modify/delete/rename old/new path、metadata burst、切换非 FlowDesk 后 timer 取消。一批事件只增加一次 query；后续显示真实 hydration 的新关联集合。partial/401 仍显示正文且不称健康空集合。真实 `flowdesk-execution-snapshot` 的 done + retained blockedBy + isBlocked=false child 显示历史依赖；未知 `completed` 自定义字符串保留 current，历史 done 折叠。受控服务器记录仅 GET 和 producer 只读 POST `/api/tasks/query`，Authorization 为 owned 测试值，没有 PATCH/PUT/append 写入。

## 裁定和实际限制

- 已批准整体方案，本轮仅 Task 2；由主控统一持有任务状态与独立 review，不创建新 worktree/子 agent、不自行提交或运行全计划生命周期写回。报告作为本批实现和验证 ledger；若误执行 Task 3 或写回 vault 会越出派发范围。
- Task producer `summarize_identity` 没有 archived 布尔字段，Task consumer 也无法观察真实归档；不因 `status=archived` 猜归档。Task children 只按当前明确 `done` 生命周期归入历史；明确 legacy_v3 才沿用已有 complete/completed 兼容语义。Case 使用真实 `status_is_completed`/`archived`，自定义或未知词保留原词。若上游以后提供 Task archive 合同，需要再接消费者；本批不改 Core。
- 来源读取健康不等于生命周期或验收。legacy 历史结论/原文保留在各自展示与技术诊断中，不将 contract/acceptance/evidence 问题染成当前读取失败。
- Node DOM/Obsidian host double 只验证本地 consumer 参数、行顺序、按钮与原生 details 状态；不能证明真实 UI、键盘焦点或已安装 runtime。

## 未运行验收

真实 Obsidian 320/420px 侧栏、浅/深 Cupertino 主题、缩放、Tab/Enter/Space、焦点保留及截图均未运行，不能声明布局/可访问性或 WCAG 通过。安装、真实 API 修改与真实 vault 事件、Task 3 精确导航/外部 Markdown/恢复接续及宿主动作均未验收。验收需要按上述尺寸和主题分别观察同一 Task/Case 的生命周期/health/当前关系/历史折叠，确认中文与长路径换行、控件焦点、刷新后状态与点击来源；这份源码报告不替代该证明。


## 主控独立审查与源码收口（2026-10-02 12:22 CST）

独立 reviewer 实际复验75项：58纯消费者、3真实producer/owned HTTP/compiled consumer集成、14隔离与Case model/Task1基线，0 skip。首次3集成因owned listen EPERM失败；限定许可复验3/3通过。未重复全suite/typecheck/build，和实施helper之前180项证据分别记录。

主控作为Task owner已通过当前API写回执行/验证/交付记录并回读schema4、healthy、source/current ID一致及trusted_done=true。当前Core通知模式撤回待授权是独立事项，不影响本块前端验收。Task3、真实Obsidian/UI、安装/宿主验收仍未执行；未提交、安装或发布。
