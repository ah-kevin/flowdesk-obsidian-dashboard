# FlowDesk 2.0 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 主控按以下三块派负责人实施并独立 review；worker 使用 gpt-6.1-sol/high。既有整体授权持续有效，不重复要求设计批准；各块完成只交源码与验证证据，不 stage/commit/push/install/release。

**Goal:** 在现有 Obsidian/Cupertino 侧栏中完整阅读 Task/Case、找到准确原文与仓库文件，并从同源恢复摘要进入可核实的接续路径。

**Architecture:** 复用 Task schema3/4 与 Case schema1 的 producer、既有 ViewShell/adapters 和 MarkdownRenderer；Dashboard 只做展示、导航与显式复制，不成为 Task writer 或宿主控制服务。先交完整正文，再统一状态/刷新，最后在核心恢复 producer 完成后接入有界 bundle 与按能力分流的恢复入口。

**Tech Stack:** TypeScript、Obsidian public API、现有 esbuild、node:test、真实 Python snapshot CLI、controlled TaskNotes HTTP server。

**Spec:** [总体设计](</Users/bjke/Library/Mobile Documents/iCloud~md~obsidian/Documents/agent-workspaces/Notes/Plans/2026-10-01-FlowDesk-Plugin-2.0总体设计与能力取舍.md>) §4.1、§4.2、§6.1；[核心恢复计划](</Users/bjke/workspaces/flowdesk-plugin/docs/superpowers/plans/2026-10-02-flowdesk-v2-resume-handoff.md>)；[真实 Dashboard 审查](../../reports/2026-10-02-dashboard-audit/audit.md)。已读报告并打开 `02-task-records.png`、`05-resume-context.png`。本计划仅写 Dashboard repo，不改 vault、Task、核心源码或已安装插件。

## Global Constraints

- “消费核心真实snapshot/TaskNotes，不维护第三份状态；读取失败/stale/缺权限不显示为0任务或已完成”。
- “Case只观察关联任务”；“不做新旧业务状态双写”；保留 TaskNotes 原生父子、projects、blockedBy、状态、日期和优先级。
- “查看不默认夺取控制；CLI→App执行接续先正常释放旧writer”；“没真实可核验证据就保留unknown”。
- 源码、受控外部 API、已安装 runtime、真实 Obsidian UI/宿主运行分别留结论。host/DOM double 只证明本地 consumer 行为，不当真实宿主；不使用 mock 代替真实集成。
- 保留 `tasknotes-auth.ts` 的 JSON 逐项合并、未配置变量保留、token alias、child env、HTTP Authorization、错误脱敏；不读 data.json/env 文件或输出凭据。
- 保留 desktop-only、legacy schema3/4、`type: session`、历史 Markdown/Review Record 与已有引用；不批量改历史业务数据、不复活 controller/固定角色。
- 沿现有 Cupertino/Obsidian theme token、字体、侧栏、details/按钮语义；不建新视觉系统、网站或 hero。
- Obsidian 当前应用 1.14.3；不改系统 Markdown 关联、不安装新版安装包、不逆向私有 API、不造常驻桥。
- 默认测试必须使用临时文件/API 与真实 producer，不访问用户真实 TaskNotes或启动宿主；安装与真实执行接续在相应授权后单独验收。
- **默认suite隔离固定合同：** 现有 `tests/run-tests.mjs` 保持唯一runner；仅增加 `tests/support/owned-environment.ts` 薄fixture适配，复用core `tests/support/isolation.py` 的capabilities/owned-root形状和 `mcp/src/__tests__/support/guard-preload.cjs` 低层guard，接node:test的清理生命周期，不直接依赖Vitest setup/hooks，也不建立第二runner。runner及其测试/producer child使用显式白名单env：HOME/vault/state/tmp都指临时owned目录，TASKNOTES_API_TOKEN/AUTH_TOKEN只放测试值或空值，TASKNOTES_API_URL只指本测试owned loopback端口；不展开继承 `process.env`，不沿用真实HOME/vault/auth/api。PATH仅含owned bin和经核对的解释器；保护真实HOME/vault/runtime路径，源码和必要依赖仅只读allowlist。只allow实际Node/test bundle、esbuild和两条真实snapshot Python脚本的精确argv/cwd及owned HTTP端口；`/usr/bin/open`、Obsidian、codex、claude、queue/native executable始终拒绝。随机file/session ID不是隔离证明，所有guard violations令suite失败并用t.after清理owned文件。默认source-navigation仅调用owned adapter检查参数/结果，真实LaunchServices仅后续真人UI验收。

## Review Focus

1. 多轮中文 Markdown、代码围栏、未知领域段和重复标题：正文完整可读，原文定位不能把 API details 行直接当 vault 文件行。
2. done 任务仍保留 blockedBy、Case closed 但 Task active、自定义/未知状态：显示各自原始事实，不误称阻塞或验收通过，不把未知项藏掉。
3. Task 被增删/移动/关联移入移出、同 Case 刷新晚返回、API 401/partial：旧数据显式 stale，晚响应不覆盖新内容，不渲染健康空集合。
4. 含空格/中文/井号路径、缺 cwd、换机/缺 checkout：vault/仓库/历史分流，保留相对路径，失败不给假成功、不创建错误 vault 笔记。
5. 恢复 next 歧义/截断、缺 nativeID、App idle 或旧 writer 状态未知：只读与复制仍可用，执行接手无证明时不开放，不从标题/agent 字段猜宿主或 owner。

## 已核实消费者与退役结论

| 链路 | 当前源码事实 | 本计划处理 |
|---|---|---|
| core `lib/flowdesk_execution_snapshot.py:440–483,578–615,620–628,733–760,778–811,1062–1129` → `src/snapshot-model.ts:394–612` | producer 有 goal/why/scope_text/steps/domain_sections、全量 records；consumer 丢 why/steps/domain_sections，仅 records.length | 保留投影正文与 source；补why/steps/domain_sections不能证明全文：Requirements/Scenarios为typed段，普通无REQ/SCN-ID列表未解析且被domain_sections排除，完整原文必须另读真实API details，不扩core/parser范围 |
| `src/dashboard-presentation.ts:createContractSummary` / `src/main.ts:renderContract` | REQ/SCN、验收计数及硬编码证据分母3；记录计数链接仅 heading | 去质量门槛/比例，显示正文、时间、来源与准确这一条原文 |
| core `_summarize_v4_node` → review toolbar | TaskNotes-only 所有 review/evidence/verification 为 not_applicable；Dashboard canReviewTask 只检查 done/读健康 | **退役主动人工 review 写入**：删 canReviewTask/Modal/submitTaskReview、reviewed tag 合并及两段 PATCH/POST，不用新 writer 替它换实现；历史 Review Record、reviewed 标签作为原文保留且不再授权或影响完成 |
| `src/review-invocation.ts` / `main.ts:requestTaskNotes` | 无 revision/owner；PATCH 成功后 POST 可失败；“最后一次写入”无法保证完整记录 | 无有效新 review 合同，不能保留双写或造第二状态。错误/鉴权逻辑移到下述有实际消费者的只读 GET；移除写入专用文件/测试，补“不发送任何写请求”回归 |
| `WorkCaseAdapter.observesFile` / `main.ts:vault modify` | 只看 Case 本身；同 selection 并行刷新只校验 selection，未拦晚返回 | 监听关联与潜在关联 Task 变化、500ms 合并刷新、request generation 拦晚返回 |
| `work-case-renderer.ts:openRelated` → `main.ts:openRelated` | 所有引用都 normalizeWikiLink 后 openLinkText | 区分 vault note / repository Markdown / exported history / native history；不造 TFile 表示仓库外文件 |
| `work-case-model.ts` / invocation | Case details 已由 core API hydration 保存，consumer 丢 details；当前 CLI 尚无 --resume-bundle | 正文仍走 Task producer；第3块只消费核心实际完成的 opt-in bundle，不提前猜接口 |

### Obsidian 外部 Markdown：公开能力与待验收项

| 证据 | 已证 | 未证 / 决策 |
|---|---|---|
| [官方 1.14.2 changelog](https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/) | 外部文件原生命令在当前窗口打开；系统 Open with 依赖最新安装包 | 没承诺插件参数化 API；主案记录替换当前 tab。先新建空 tab/固定 tab的规避行为需实际UI验证 |
| [官方 Obsidian URI](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI) | `open?path=<absolute>` 查找包含路径的 vault，再按该 vault 相对 file 打开；可选 paneType=tab | 不是仓库外文件支持证据；不能把 repo 绝对路径塞 URI 后宣称完成 |
| [官方 CLI](https://help.obsidian.md/cli) 与 2026-10-02 本地 `obsidian help open` | CLI 文档 path 是 vault 根相对路径；本地 help 为 file=<name> / path=<path> / newtab | 未看到 external 参数；绝对 repo path + newtab只可作实际UI候选，不能用 exit0 证明打开正确文件 |
| macOS `/usr/bin/open` 本地 usage 与 `/Applications/Obsidian.app/Contents/Info.plist` | `-a`指定应用、`-b`指定bundle；实际bundle ID为 `md.obsidian`，不依赖默认文件关联 | **第一候选**为 `execFile("/usr/bin/open",["-a","/Applications/Obsidian.app",absolutePath])`；只读核对参数/metadata，不曾对文件执行open；当前安装包是否接收原路径、tab影响与原位保存均需UI验收 |
| Dashboard `node_modules/obsidian/obsidian.d.ts` | `Workspace.openLinkText`、`WorkspaceLeaf.openFile(TFile)`、`MarkdownRenderer.render` 公开 | 检查的 types 无参数化外部Markdown打开接口；`eState` 的任意字典不构成新外部API合同 |

当前首选产品动作明确为“在 Obsidian 打开仓库文档”，实施时先验证macOS LaunchServices指定Obsidian应用的第一候选是否确实打开checkout原文件；再按需要验公开CLI候选。公开OS投递不是私有Obsidian API，亦不改变默认关联。证明支持后才启用一步打开。若不支持，该自动能力保持“未验证/当前不可用”，提供“复制路径 → Obsidian 命令面板 → Open file from outside the vault…”的真实手工入口；不能把这个降级写成自动功能已通过。标准 file URL 单独标“交给系统打开”，显示系统目的地边界，既不改关联，也不默认为 Obsidian。只读 help 在沙箱内连接失败，许可沙箱外读取后成功；从未对文件运行 open/command 或改设置。Windows/Linux无已证打开方法则明确能力不支持并保留原生命令人工入口，不猜启动参数。

## 文件职责与交付顺序

| 块 | 独立价值 | 文件 |
|---|---|---|
| 1. 内容与读合同 | Task完整可读，旧 review 双写退役 | modify `src/snapshot-model.ts`, `src/dashboard-presentation.ts`, `src/main.ts`, `src/tasknotes-auth.ts`（仅必要接线）, `README.md`; create `src/task-content.ts`, `src/task-content-renderer.ts`, `src/tasknotes-read.ts`; delete `src/review-invocation.ts` |
| 2. 一致层次与可靠刷新 | Task/Case一致且当前行动优先，关联变化及时可见 | modify `src/work-case-model.ts`, `src/work-case-presentation.ts`, `src/work-case-renderer.ts`, `src/work-case-adapter.ts`, `src/dashboard-state.ts`, `src/dashboard-presentation.ts`, `src/main.ts`, `styles.css`; create `src/entity-presentation.ts` |
| 3. 导航与接续 | 准确原文/仓库位置及同源恢复摘要，显式宿主边界 | modify `src/task-navigation.ts`, `src/work-case-invocation.ts`, `src/work-case-model.ts`, `src/work-case-renderer.ts`, `src/main.ts`, `README.md`; create `src/source-navigation.ts`, `src/resume-presentation.ts` |

顺序 1→2→3。第1/2块不等核心恢复；第3块开始前核对核心实际 producer/consumer/CLI 已完成及 tests 通过。不能为过 --help 临时在 Dashboard 自造 next/result 或将 `--resume-bundle` 默传旧 CLI。整体 UI 验收跟各块交付区分；保留 manifest/package 0.1.27，暂不 bump。

## Task 1: 完整 Task 正文与只读合同

**Files:** 上表第1块；modify existing runner `tests/run-tests.mjs`，create thin fixture `tests/support/owned-environment.ts`；test `tests/task-content.test.ts`, `tests/task-content-renderer.test.ts`, `tests/tasknotes-read.test.ts`, `tests/snapshot-cli-contract.test.ts`, `tests/tasknotes-auth.test.ts`, `tests/snapshot-model.test.ts`, `tests/dashboard-presentation.test.ts`, `tests/dashboard-ui-contract.test.ts`; delete `tests/review-invocation.test.ts`（其生产写入路径随实现退役）。

**Interfaces:**
- Extend `SnapshotTaskContract` with `why?: string`, `steps?: string`, `domain_sections?: SnapshotBodySection[]`; define `SnapshotBodySection={heading:string,level:number,text:string,source?:SnapshotSource}`。`SnapshotTaskSummary.records` 保留三类 section 数组。
- `src/task-content.ts`: `createTaskContent(snapshot: ExecutionSnapshot, taskPath: string): TaskContent`。`TaskContent={taskId:string,goal:string,why:string,scopeText:string,steps:string,domainSections:SnapshotBodySection[],records:{execution:SnapshotBodySection[],verification:SnapshotBodySection[],delivery:SnapshotBodySection[]},requirements:SnapshotContractItem[],scenarios:SnapshotContractItem[],acceptance:SnapshotAcceptanceItem[]}`。原文不截断/去重，缺项空值；旧 schema3/legacy contract 保持可读。
- `DashboardViewModel.content: TaskContent`；`records` 从 count 改完整 arrays，其数量只用于折叠摘要。所有调用者在本块一起改，不保留两个事实副本。
- `TaskContentRenderer` constructor 依赖 `{renderMarkdown(text:string,element:HTMLElement,taskPath:string):Promise<void>;openSource(taskPath:string,section:SnapshotBodySection):Promise<void>}`；`render(container:HTMLElement,content:TaskContent):void`。typed字段无 source 时只“打开任务原文”；不伪造行号。
- `src/tasknotes-read.ts`: `readTaskDetails({taskPath,apiUrl,auth,signal}:{taskPath:string,apiUrl:string,auth:TaskNotesAuth,signal:AbortSignal}):Promise<{id:string,details:string,source:{kind:"tasknotes-api",taskId:string,readAt:string}}>`。真实 GET `/api/tasks/${encodeURIComponent(taskPath)}`，复用现有 HTTP Authorization/错误脱敏，按 core `decode_tasknotes_response` 支持 data envelope并拒绝 success=false；ID/path有一项则必须与 requested匹配，两项均有则都匹配，缺身份/非字符串details明确拒绝。空字符串details合法，不是API失败。第1块在Task正文区提供明确“完整API原文 / 未投影内容”折叠入口，调用此GET后直接渲染整个details，不另造散文parser；readAt由本次成功响应确定，来源明确为该Task的独立API读取。接口不读取/返回业务status，不成为新snapshot状态源；第3块复用同一函数确认精确来源。
- 原文视图使用独立 `TaskRawContentObservation={taskId:string,details:string,readAt:string,source:"tasknotes-api",error:string|null}`，由当前selection/request generation持有，不混进 `TaskContent` 的producer投影或完成判定。typed投影缺段≠原文缺内容；成功空字符串显示“API原文为空”与整张任务原文入口。不能证明同轮一致时明确“单独API原文观测”，可比片段不一致则标snapshot stale并提示刷新，分别保留两次来源/时间；不得用新的details自动升级观测健康、改Task status或验收。切换任务/身份不符清理该视图，失败不能装成空正文。

- [ ] **Step 1: RED—内容与副作用测试。** `task_content_preserves_all_sections_and_record_rounds` 断言 why/steps/未知“根因”/多轮ER VR DR中文Markdown逐字保留且有source；`healthy_done_is_not_verification_pass` 断言 TaskNotes-only healthy done不输出“证据有效0/3”“验收通过”或 review动作；legacy条目仍可读，Review Record进入domainSections而非主动写入口。`readonly_http_rejects_identity_and_envelope_errors` 断言 mismatched id/path、details非字符串、success=false拒绝并脱敏。`empty_details_is_a_successful_empty_observation` 断言details=""成功返回身份/时间，不是API故障；无可定位片段时locate返回note，UI显示原文为空及整张任务入口。`plain_requirements_remain_visible_in_full_api_text` 将此次真实Completion Task `## Requirements` 的8条无REQ-ID列表（首条“一个app_completion工具六动作prepare/bind/build/check/record/read，严格输入与真实生产消费者；不只交无人调用的库或文档exec parser。”及其余7条逐字复制）固化到ownedfixture，不在运行时读用户Task；调用真实producer确认requirements=[]且该段不在domain_sections，再经真实controlled GET→compiledDashboard完整原文视图断言8条逐字可见，无“REQ0=没有需求”的结论。另测snapshot与后取API片段不同/时间不可证同轮时显式stale或单独观测，原生status不变。compiled plugin调用内容刷新/导航时，controlled HTTP计数 PATCH/PUT/POST-append=0。
- [ ] **Step 2: 运行RED。** `npm test -- task-content.test.ts task-content-renderer.test.ts tasknotes-read.test.ts snapshot-model.test.ts dashboard-presentation.test.ts`。新接口/正文数组应失败；不要用真实Task状态变化制造RED。
- [ ] **Step 3: 实现类型与模型保真。** 在上述确切文件接 Task body spec/records；修所有 records数字消费者。renderer最新一轮先展开、较早轮按文档顺序收起，但每轮完整可展开；时间有producer timestamp则显示，无字段仅保留带时间原heading，不猜timestamp。需求/场景/验收只作正文条目，checkbox标“原文勾选”，不能推理执行成功；删除失去合同的REQ/SCN仪表与证据比例。
- [ ] **Step 4: 接真实Markdown渲染与review退役。** `main.ts` 用已存在 `MarkdownRenderer.render(app,text,el,taskId,this)`；拆正文renderer，不重写整个ItemView；接“完整API原文 / 未投影内容”入口并直接渲染readTaskDetails的原文，显示准确Task身份与成功读取时间，独立处理空/失败/stale，不以投影字段齐全声称全文完整。删除 review imports/toolbar/Modal/submitTaskReview/formatReviewTimestamp及写专用错误类；将有效 HTTP鉴权错误代码移到 `tasknotes-read.ts`，GET无需复核前置。历史 reviewed tags/Review Record不删除，不把非not_applicable旧snapshot恢复成可写。README更新只读行为与历史解释。
- [ ] **Step 5: 用真实producer修测试链。** 把 `snapshot-cli-contract.test.ts` 默认live探针改为controlled临时HTTP返回真实Task API形状，调用真实 `bin/flowdesk-execution-snapshot`→实际 envelope/model/content/renderer消费者。保留--help真实flags交叉核对；默认不从真实API拿固定旧“阶段1”Task，也不把skip称通过。core路径不可用明确报告集成未执行；不能偷偷换手写snapshot。auth tests保留child env/refresh token/escaped errors，原review GET/PATCH/POST测试替换为有消费者的只读GET及无写请求测试。
- [ ] **Step 6: GREEN与交付。** `npm test -- task-content.test.ts task-content-renderer.test.ts tasknotes-read.test.ts snapshot-cli-contract.test.ts snapshot-model.test.ts dashboard-presentation.test.ts dashboard-ui-contract.test.ts tasknotes-auth.test.ts`；`npm run typecheck`。内容、身份与鉴权回归通过后独立review，只报告源码/controlled链；真实Obsidian布局/原文定位未验收。

## Task 2: 统一层次、当前行动与 Case 关联刷新

**Files:** 上表第2块；test `tests/entity-presentation.test.ts`, `tests/work-case-adapter.test.ts`, `tests/work-case-model.test.ts`, `tests/work-case-presentation.test.ts`, `tests/work-case-renderer.test.ts`, `tests/dashboard-presentation.test.ts`, `tests/work-case-ui-contract.test.ts`, `tests/dashboard-ui-contract.test.ts`。

**Interfaces:**
- `src/entity-presentation.ts`: `formatEntityStatus(kind:"task"|"case",raw:string|null):{label:string,raw:string,tone:PresentationTone}` 仅显示层翻译；Case active/parked/completed与Task in-progress/open/done等各自语义保留，未知返回原词+未知标记。`groupTaskRows<T extends {status:string;isBlocked:boolean;completed:boolean|null;archived:boolean}>(rows:T[]):{current:T[],history:T[]}` 稳定分组：进行中、实际未完成阻塞、其他未完成/unknown在current；已完成/归档在history，不根据blockedBy存在判断阻塞。
- 两边presentation都用同一顶部顺序：实体标题/原生状态→来源/读取时间/健康→当前进展/下一步→Task关系/完整内容→技术详情。读健康文案“来源读取完整”与Task“已完成”分别出现，不用“可信完成”表示业务验收。
- `WorkCaseAdapter.scheduleRefresh():void`、`observesFile(filePath:string):boolean`：激活Case时Case本身、已关联Task，以及所有 `isTaskPath` 变动使缓存dirty（包含未来关联移入）；复用 `TrailingRefreshScheduler(...,500)`，不新增轮询。

- [ ] **Step 1: RED—状态及隐藏项回归。** `completed_dependencies_are_history_not_blockers` 用真实producer done且blockedBy保留、is_blocked=false形状断言“依赖于/历史依赖”或详情关系，绝无“阻塞于”；`unknown_status_stays_visible` 断言statusIsCompleted=null不会从Case两组消失；`closed_case_active_tasks_do_not_complete_each_other` 断言Case与Task分别显示原状态/差异，不改写；Task current优先、完成项可展开。读partial/401不显示0/0成功。
- [ ] **Step 2: RED—缓存与晚响应。** `case_refreshes_on_task_association_change` 断言已关联任务details/状态变动、新Task关联移入/移出、create/delete/rename都合并刷新；`late_same_case_response_cannot_overwrite_newer_generation` 让旧load忽略abort、较新load先返回，旧响应不得覆盖；Case→Task/非FlowDesk切换立即清旧数据并取消timer。
- [ ] **Step 3: 跑RED。** `npm test -- entity-presentation.test.ts work-case-adapter.test.ts work-case-model.test.ts work-case-presentation.test.ts dashboard-presentation.test.ts`；检查实际失败涉及上述行为。
- [ ] **Step 4: 接一致层次与主题。** 在Task/Case renderer内复用status/分组小函数，不合并其snapshot权威。标题、刷新、来源、Current中文标签一致；project/计划显示wikilink alias或人类可读文件名，原target留导航/tooltip。删除obsolete controller/固定role显示若有实际consumer；agent/workspace/session/cwd/branch仍放技术详情。styles使用现有font/text/background/border/interactive tokens、已有320/420px规则，长中文/路径自然换行，取消大块质量仪表。
- [ ] **Step 5: 接失效与请求顺序。** main注册modify/create/delete/rename，经 `observesFile`/scheduleRefresh路由；metadata changed仅用于自身类型/关联变化补充，事件合并。CaseAdapter立即标dirty/stale，刷新成功回清；每次activate有递增request generation并核对controller/selection，错误/完成回调也不能覆写新请求。deactivate/close取消timer与abort。无本地vault事件的外部API变化由“刷新”拉最新，不声称实时订阅。
- [ ] **Step 6: GREEN及必要UI后验收定义。** 上述test加 `work-case-renderer.test.ts work-case-query-incomplete.test.ts work-case-ui-contract.test.ts dashboard-ui-contract.test.ts frozen-task-adapter.test.ts view-shell.test.ts` 全过、typecheck通过。DOM double断言按钮/折叠/行顺序仅作为consumer测试；之后真实Obsidian分别看320/420px、浅/深主题、缩放、Tab/Enter/Space、焦点保留，截图证明与现有Cupertino匹配。未测无障碍项不写WCAG通过。独立review后交付，安装验证另列。

## Task 3: 精确文件导航与同源恢复入口

**依赖门：** 先读核心 `lib/flowdesk_work_case_snapshot.py`、`context-builder-tools.ts`、实际workflow和 `--help`，确认恢复块已完成且 `--resume-bundle` 是公开选项。记录实际field与预算；如果和前置计划不同，按源码同步本任务的类型/fixture，不硬套计划或在UI重建。第1/2块继续独立可交付。

**Files:** 上表第3块；test `tests/source-navigation.test.ts`, `tests/resume-presentation.test.ts`, `tests/work-case-invocation.test.ts`, `tests/work-case-model.test.ts`, `tests/work-case-renderer.test.ts`, `tests/tasknotes-read.test.ts`, `tests/dashboard-resume-integration.test.ts`, `tests/task-navigation.test.ts`。

**Interfaces:**
- `src/source-navigation.ts`: `resolveRelatedTarget(raw:string,{casePath,cwd,vaultRoot}:{casePath:string,cwd:string|null,vaultRoot:string}): RelatedTarget`。`RelatedTarget`为 `{kind:"vault",linkText,label}` / `{kind:"repository",absolutePath,repositoryPath,label,fileUrl}` / `{kind:"url",url,label}` / `{kind:"unavailable",label,reason}` 的判别联合。明确wiki/vault路径走vault；Markdown file URL或绝对/显式repo相对路径走repo，repo相对只按Case cwd（Task必须有唯一明确Case/cwd，否则展示歧义并复制原引用）。未知bare path不随意选vault/当前进程cwd；保留原引用。HTTP引用为普通文档，native历史不由普通link推断。
- `buildRepositoryOpenInvocation(target:Extract<RelatedTarget,{kind:"repository"}>,platform:NodeJS.Platform):{executable:string,args:string[]}|null` 位于 `src/source-navigation.ts`：macOS返回公开 `/usr/bin/open` 与 `["-a","/Applications/Obsidian.app",target.absolutePath]`（应用路径实施时核对实际存在），不经过shell、不用default handler、不传`--args`/`-n`/`-F`，绝对路径不能成为flag；其他平台返回null。process返回仅映射accepted/not_opened，不作UI成功状态。
- `locateTaskSource(fileText:string,details:string,section:SnapshotBodySection):{kind:"line",editorLine:number}|{kind:"note",reason:string}`：details来源行与片段匹配，映射到当前vault原文件；同一details在fileText唯一匹配才加offset，CRLF/BOM只做换行对齐不改文本。若不同步/多重匹配/超界，不猜行，明确打开整张Task。Case sourceSpace为vault-file，其line_start才直接-1。没有producer source的typed字段只开原文。
- `buildWorkCaseSnapshotInvocation`新增可选 `includeResumeBundle?: boolean`（默认false）。核心已支持后Case consumer显式true，旧CLI/不支持的配置只显示恢复能力不可用并保留正文read，不静默生成bundle。
- `WorkCaseViewModel.resumeBundle` 保存producer可选bundle；`src/resume-presentation.ts`定义与已完成core完全一致的 `ResumeBundle`/`ResumeSource` 类型及 `createResumePresentation(bundle:ResumeBundle|null,caseModel:WorkCaseViewModel):ResumePresentation`。只列source/Task id/status/goal/result/blocker/next/resume_sources/resume_missing/operation refs/observation，缺失/歧义/截断保留，不重新按status挑Next。`ResumeTaskPresentation={id:string,title:string,status:string,goal:string|null,result:string|null,blocker:string|null,next:string|null,sources:ResumeSource[],missing:string[]}`；`ResumePresentation={summary:string,gaps:string[],tasks:ResumeTaskPresentation[],history:{agent:string|null,nativeId:string|null,device:string|null},continuationInstructions:string}`。

- [ ] **Step 1: RED—路径与来源。** `api_details_lines_map_after_frontmatter` 用有长frontmatter/CRLF的临时Task及真实API details验证精确记录行；重复heading多轮按section原text区分，变化/歧义返回note。`repository_paths_use_case_cwd` 验中文、空格、#、Markdown/file URL、绝对路径、repo相对、wiki alias、缺cwd/缺文件/换机；原vault引用不被当repo，repo不经openLinkText创建笔记。Task多Case/cwd冲突只报告，不能选第一个。`repository_open_targets_obsidian_explicitly` 断言macOS argv指向核对的Obsidian app及完整文件路径，不调用shell/default handler，其他平台为null；owned adapter只验投递参数/失败，默认suite禁止真实/usr/bin/open/宿主executable，即使目标文件/会话ID随机也不放行；不能记作真实打开通过。
- [ ] **Step 2: RED—恢复事实与动作边界。** `producer_bundle_keeps_latest_canonical_next_and_sources`/`ambiguous_next_does_not_become_instruction`/`resume_read_has_zero_side_effects` 使用真实coreproducer进controlled HTTP。断言done结果/未完成Next来自其投影，API缺口/utf8截断/omitted_count显式呈现；缺bundle非空猜摘要。原文操作引用写“仅引用”，不证明完成。idle/pid/TTL/queued/surface==nativeID/codex agent均不能产生released/host kind或接手授权。多个未完Task须用户显式选准确ID，绝不自动start全部。
- [ ] **Step 3: 跑RED。** `npm test -- source-navigation.test.ts resume-presentation.test.ts work-case-invocation.test.ts work-case-model.test.ts dashboard-resume-integration.test.ts`；缺核心producer时标依赖未完成，不靠dummy bundle令集成绿。
- [ ] **Step 4: 接精确原文与三类引用。** main统一Task/Case source导航，调用 `readTaskDetails` 确认API身份+局部原文，vault.cachedRead确认fileText；仅在匹配时使用public MarkdownView.editor setCursor/scrollIntoView/focus，阅读模式不能定位则明确开原文，不假称精准成功。records每条有自己的“打开这一条原文”；关联文件经resolver分流。MarkdownRenderer中的repo引用同样采用已解析target，不留仅Case related列表修好而Task正文继续误路由的洞；只拦识别出的repo引用，其余现有vault/web语义保持。
- [ ] **Step 5: 源码先接公开外部Markdown打开适配器，联合升级再实机验证。** 按支持vault外文件的Obsidian目标版本开发，安装/UI不是源码接线前置。沿已选公开 `execFile("/usr/bin/open",["-a","/Applications/Obsidian.app",absolutePath])` 接实际main消费者，仅明确点击“在Obsidian打开文档”触发，校验准确本机.md文件与固定App/可执行文件，非shell、不改系统关联，不用默认应用、--args/-n/-F或私有桥，不自动重试。bounded timeout；进程成功只反馈accepted/打开请求已提交，错误与超时反馈结果未知，不能保证失败绝未打开，并保留复制路径。其他平台不猜命令。默认suite仍禁止真实native，只注入owned元数据/执行边界验证生产适配器与compiled点击的一次调用、精确argv和反馈。官方1.14.2外部文件支持与man open -a指定应用的组合为待实机验证路线，不能证明准确打开/保存。当前不安装或实际执行open/Obsidian；2.0联合发布/整体升级时核实准确原文件、打开方、tab影响、原位保存与无vault副本，未测不记PASS。源码文档打开不混成Agent启动或跨宿主接管。
- [ ] **Step 6: 接同源恢复预览与显式复制。** Case刷新同次获取opt-in bundle；用renderer列目标/Current/决策/准确Task结果和Next、cwd/branch、缺口、来源原文。复制摘要使用该bundle的原值，注明其bounds/时间/来源；不得调用context-builder写临时文件才可查看，也不复制整个聊天。Task-only无Case时保留完整Task内容/原文入口及复制准确Task引用给现有work入口，由host读最新API，不能为恢复强建Case或伪造Case bundle。预览/复制本身均不改Task/Case、不启动/发送/native queue。
- [ ] **Step 7: 历史与继续工作分别给真实能力。** vault导出历史按文件打开，并注明“导出记录”；原nativeID/device保留历史指针，缺失不从surface/workspace/title猜。Dashboard不存在Codex App MCP app tools或Claude Desktop控制入口，不能直接照抄agent的App工具当Obsidian能力。未经验证provider-aware公开历史入口时按钮为“复制原会话标识与查看步骤”，不是运行CLI resume（它可能启动writer）。继续工作展示/复制明确Case/Task path、已完成项、待做项、cwd/branch和当前core work恢复指令；要求既有owner原链继续，换载体先完成已授权写回及正常停止旧执行/已知后台工作。unknown保留只读/回原owner分支，不自动接管/kill/标blocked。CLI resume命令仅在实际host/nativeID/cwd已核对后作为明确执行指令复制；App/Claude Desktop未验证能力分别标不可自动控制，不声称四宿主对称。无公开能力不造桥；此交付不承诺一键跨宿主执行。
- [ ] **Step 8: GREEN—生产链及无副作用。** `dashboard-resume-integration.test.ts`临时HTTP返回真实writer正文/状态与filter definitions→真实Task/Case CLI→compiledDashboard adapter/model/content/resume renderer→复制相同summary。正常canonical progress-only最新Next须自动来自核心；歧义显示sources/gap，done缺结果显示status+missing。恢复阶段Task PUT/PATCH/details append=0、native queue/host create/launch=0，临时Case bytes不变。覆盖401/partial/错误身份/缺目录/缺外部文件/原history不可用。只证明读取投影消费，不证明真实writer释放或执行不重复。
- [ ] **Step 9: 必要检查与独立review。** `npm test`（默认已去live依赖）、`npm run typecheck`、`npm run build`、`npm run check:syntax`。构建产物不安装；检查差异只限本块文件，保留他人未提交改动，清理本次测试临时文件。README解释内容、原文定位、关联刷新、手工/自动能力矩阵及证据层，不保留review旧承诺。失败修复后重跑受影响闭包，不对未测项写pass。

## 真实 UI 与执行恢复验收（单独于源码）

| 场景 | 要观察的结果 | 未通过如何记录 |
|---|---|---|
| 同一真实父/子Task与Case五步重走 | 最新行动优先、正文直接可读、这一条来源准确、两边来源/状态一致 | 逐步截图与精确定位；不能用原先02/05截图证明新实现 |
| 真实关联Task保存/关联改动 | Case无需离开/回来即更新，当前展开与焦点保留，旧请求不闪回 | 报本地事件范围，外部API仅手动refresh的限制 |
| 原生打开checkout外部md | 确认打开方是Obsidian、准确原文件、tab影响与原位保存；不改系统关联 | 先验macOS指定Obsidian应用的公开投递，再按需CLI；accepted不证明正确文件，原生命令人工行为与参数化能力分别报告 |
| 有进展Task停靠→新会话继续 | 先核对实际正常停止与已知后台收束，再原ID历史/明确bootstrap；说清已完成/未做/决定/Next/cwd/branch，完成项业务副作用不增加 | 真实原生运行才能证明该host接续；idle/fixture不代替，未授权或缺接口格子unknown |
| 原会话失效/目录迁移/API失败/文件缺失 | 可见gap与准确人工步骤，无错误执行/新Task状态，无静默丢上下文 | 不以fallback作为“无损迁移”通过 |

此计划阶段不安装、不操作UI、不运行真实resume。主控后续组织已授权的必要UI/宿主验收，集中呈现需用户介入的实际边界；全部完成前不宣称FlowDesk 2.0 Dashboard已整体验收。

## 计划自检与边界

- [x] 主案§4.1/4.2/6.1已映射三块，各有独立交付价值；没有修改核心writer/Completion/Task状态。
- [x] 五个Review Focus都有明确consumer/集成测试；保留真实producer flags与JSON接线，避免手写healthy掩盖接口漂移。
- [x] 新接口与后续调用名一致；Task全量正文与恢复有限投影分开，source行空间明确，未知/缺项/截断不补造。
- [x] review退役有源码依据，不换成新CAS/owner/第二状态；历史审查正文与鉴权合同保留。
- [x] Obsidian URI/CLI/macOS指定应用打开/原生命令各自证据边界已查证；一步外部打开需准确原文件UI结果，不以系统默认应用代替。
- [x] 当前owner继续与换载体分开；没有native能力的产品给实用复制/步骤，并标未验证自动能力，不造桥。
- [x] 本次只创建此计划；无stage/commit/push/install/release。执行后仅报告真正完成的证据层与剩余边界，不重复要求批准已授权设计。


## 2026-10-02 主控本批裁定（仅计划修订，未实施）

- 已核对 recognized-but-unparsed：普通Requirements列表不会进入REQ结构，并被typed heading过滤排除domain_sections。完整性改由真实API details全文入口保证；投影与单独API原文观测分别标身份、时间和差异，不扩核心worker范围、不加散文parser/新完成状态。
- details非字符串/身份或envelope错误拒绝；details=""是合法成功读取，只表示无正文和无可定位片段，不降级为API故障，不伪造空任务状态。
- 默认suite隔离HOME/vault/auth/api与native executable，沿唯一node:test runner复用低层guard/owned fixture；真实LaunchServices只留真人UI验收。三块顺序、review退役和公开指定Obsidian打开第一候选保留。本批未实施产品、未运行产品测试/宿主/UI，未修改Task/vault/core/已安装插件。


## Task 3 实施前接口核对（2026-10-02 checkpoint后）

- 当前Core checkpoint为3157475874240ecfc7a93f6272a9e7a728403c91，Dashboard前两块checkpoint为1f649f1170ec14df2d5f28fe0c9502616c2dc0e3；均仅本地提交。Task3后续改动保持未提交，Core只读。
- 已核对真实producer：bundle仅source/tasks/resume_observation；Task源字段使用resume_sources/resume_missing/resume_operation_refs。没有bounds、生成时间或source_space字段；预算是当前producer合同，本地loadedAt只能标本地观测时间，原文时间仅用可选source.timestamp，不制造字段。
- Core snapshot/model没有Context和Summary全文投影；Task3沿vault.cachedRead提供准确Case原文/恢复展示，保留Goal/Current/Context/Summary及来源，不改Core、Task或Case。独立读取与同次snapshot不能证实时分别标示，旧响应不得覆盖新选择。
- Task API details行号不能直接作为vault editor行号；修复Task正文/记录/诊断全部入口。Case source行号已含frontmatter偏移。匹配失败/歧义明确退整张原文，不猜位置。
- work-case-ui-contract旧测试对任何resume字串的禁止收窄为真实写入/host create/launch/send/queue边界；允许读取resume_bundle，保留合法只读POST /api/tasks/query。
- 外部Markdown准确打开、tab影响、原位保存尚未真实UI验收。默认suite只验证owned adapter参数/失败，能力不能用exit0或file URL默认应用冒充；这一UI门与Task3源码/受控集成交付分开记录。

## 联合发布与整体升级时点调整（2026-10-02 14:31）

用户最新约束为“Obsidian现在没法安装，跟2.0一起发布，到时候整体升级”。当前继续已批准源码/controlled验证；不安装/升级Obsidian或Dashboard，不替换已安装构建、不切运行版本，不再请求当前本地安装。真实Obsidian UI、精确外部Markdown打开/tab影响/原位保存与安装后恢复接续，移到FlowDesk2.0联合发布/整体升级阶段验收，保持未验收。此未来安排不是当前commit/push/install/release/bump授权，也不是源码开发前置阻塞。

源码状态分开记录：Task精确来源、普通vault链接/明确repo分流、同源恢复/决策/具体接续上下文复制及只读保护已实际接线并受控验证，尚未实机验证。外部Markdown自动指定Obsidian打开仍只有准确路径解析、argv候选和说明/复制的源码，执行适配器及accepted/not_opened反馈尚未接线；原Task3 Step5“先验证公开候选再接线”仍有源码工作未完成，须联合升级阶段继续完成并验证，不能仅标“未验收”冒充自动功能已实现，也不以手工复制替代取消原自动目标。原生历史/跨宿主自动控制不在本Task承诺范围，指针与明确步骤已接线，实际接续验收仍联合阶段单列。


## Step5源码时序补充裁定（2026-10-02）

按主控转达的用户原目标“按支持外部md的版本开发，后面整体升级默认支持”及最新“不提前安装”，先完成外部文档生产执行适配器与明确点击消费者，不能将自动目标源码开发留到发布以后。上面的14:31“适配器尚未接线”是当时状态，现由本补充与最新报告覆盖；不采用手工复制缩水替代。其他范围/4项review/只读/身份/权限/协作默认保持。依据：[官方1.14.2](https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/)确认桌面vault外文件支持，系统Open with需新installer；本机公开man open确认-a指定应用。组合路由仍是推断候选，源码已接与实机未验收分别记录。未来一起发布仍不是当前安装/发布授权。
