# Dashboard Task 1：源码自检交付

仅实施 Task 1 与全局测试隔离合同。分支 `codex/2.0`，原基线 `5728464`；本批未提交，版本仍 `0.1.27`。主控独立 review 已通过（93 项复验，无 Critical/Important/Minor），本 Task 已写入 `done`，真实回读为 healthy / trusted_done=true / tasknotes_only。本报告不是安装或真实 Obsidian 验收。

Task 内容通过 `src/task-content.ts` / `task-content-renderer.ts` 接入 main：goal/why/scope/steps、未知领域段和全部 ER/VR/DR 数组保留原文、来源与重复 heading。每类最新轮默认展开，历史可展开；条目 checkbox 标为原文勾选。删除 REQ/SCN 和证据比例仪表、主动 review toolbar/Modal、reviewed 标签 PATCH 与 details append 实现及专用测试；历史 Review Record 和 tags 无修改。保留 legacy schema3/4 的读取、JSON env 合并、child env、token alias、Bearer 与脱敏。

`readTaskDetails` 经真实 GET 读取全文，支持 data envelope，拒绝 success=false、缺失/错误 id/path 与非字符串 details；空字符串合法。全文视图标 Task 身份、snapshot 时间、独立成功读取时间；不能证明同轮一致时保留单独观测语义，可比片段变化只令显示 snapshot stale，不修改原 snapshot、业务 status 或验收。selection/generation 与 abort 防止旧响应落到另一 Task。Task 1 的来源按钮明确打开整张 Task，不把 API 行号用于 vault 行；精确导航属 Task 3。

唯一 runner `tests/run-tests.mjs` 使用 owned HOME/vault/state/tmp/auth 和 whitelist env，复用 Core `tests/support/sitecustomize.py` / `guard.py` 与 `mcp/src/__tests__/support/guard-preload.cjs`；capability 沿 Core isolation schema，interpreters=[]，精确 executable/argv/cwd、owned server 实际端口。source/dependency 仅明确只读 allowlist；真实 home/runtime、open/Obsidian/codex/claude 与业务 API 拒绝。guard 为 cooperative 限制，不是 native syscall 安全沙箱。首个 sandbox HTTP 测试保留 `listen EPERM`，随后仅 runner owned loopback 获准，guard 未放宽。

## 已观测证据

- `npm test`：165 passed，0 failed，0 skipped；2026-10-02 本轮最终运行 exit 0。
- `npm run typecheck`、`npm run build`、`npm run check:syntax`、`git diff --check`：exit 0。构建 `main.js` 留在源码仓库，未安装。
- controlled HTTP→真实 Core `bin/flowdesk-execution-snapshot`→compiled plugin/View/renderer：八条普通 Requirements 来自本次 Completion Task 的授权只读 baseline，已固化 fixture；producer 确认 requirements=[] 且该段不在 domain_sections，全文 GET 仍完整交给 MarkdownRenderer。fixture 测试不读用户 Task。
- compiled 的读取按钮、刷新、整张 Task 导航保留只读闭包；受控请求只含 GET 与 producer 的只读 POST `/api/tasks/query`，无 PATCH/PUT/POST-append。历史 reviewed 内容仍显示。
- 多轮内容、中文 Markdown/代码围栏、重复 heading、legacy/空 scope、错误 envelope/identity/details、合法空原文、片段差异和跨 Task 晚响应均有 consumer 回归。
- Node 子进程 native/state/network 负向探针与真实 Python producer 子进程访问非 owned 业务地址均在实际访问前被 guard 拒绝；负向 violation 单独存在 owned capability，并验证计数，其余 suite 违规为失败。
- 13 项 auth 生产方法回归：child env、token 更新、JSON 逐项合并、literal token alias、缺失/失效 401、普通 HTTP 错误 code 与 escaped token 脱敏。

## RED→GREEN 与迁移

先完成 isolation 再测试，没有运行旧 live baseline。内容和全文入口先缺模块/无实现，随后断言失败（why/legacy text/record rounds/质量 metrics/合法空原文）；compiled 入口首次失败 `loadRawTaskContent is not a function`，接线后通过。真实 producer children fixture 按其 native projects 形状修正，未改 Core。迁移旧“只计数”、review 写入与 renderer 静态断言，保留对应新行为测试；真实 producer snapshot fixture 不变。两项 full-content 修复有 RED→GREEN：空 scope 不退回旧数组；scope/typed 片段变化可见。冻结 model/DOM 基线按本块有意接口变化重新生成并保持 exact-equal，未删除基线检查。

## 未完成的证据层

主控独立 review 联合项已满足并回勾；真实 Obsidian 布局/Markdown 交互、安装、精确原文定位、Task 2 Case 关联刷新、Task 3 文件导航/恢复和真实宿主执行均未运行；DOM/host double 不代表已安装 Obsidian。Core 仓库、用户 vault/已安装插件、凭据与系统文件关联无本批修改，未 stage/commit/push/install/release/bump。

## 本批裁定

- 按派发只实施 Task 1；主控统一独立 review，无额外 reviewer/worktree/提交。若误用全计划执行会越出授权，因此保留 Task 2/3。
- 测试隔离先于 live baseline；依赖缺失会令集成明确失败，不替换真实 producer。不能证明同轮原文一致时显示独立观测而不升级 snapshot 健康。
- 原文来源保留 API details 行空间，当前按钮只打开整张 Task；若把它当精确定位会误导，明确留待 Task 3。

## 回传结果

Task progress、E/V/D 与清单均已真实写回并回读。已按派发要求只读核对指定原始真人消息（第3022行，user，2026-10-01T13:28:03.417Z）含本次重构双向协调授权；随后唯一一次 App-native 最小 progress signal 被 auto-review 拒绝，理由是当前可信用户内容未明确授权该线程发送、仅由代理上下文提出。消息未发送，按合同停止此通道，不重试、不换通道。拒绝与 Next 已追加并回读本 Task Progress；状态仍 in-progress，主控可直接读取 Task/本报告继续 review。

2026-10-02 11:22 更新：当前聊天真人回复“允许”后，已先写回并回读本 Task Progress，再按既定格式发送最小 Completion v2 progress。App-native 发送工具返回主控 threadId 且 isError=false，信号已受理；尚不据此宣称主控已完成读取或独立 review。worker 保持 idle，Task 仍 in-progress。


## 主控独立审查与收口（2026-10-02 11:47）

主控在原生聊天明确确认独立 review 已完成，无 Critical/Important/Minor；独立 reviewer 复验 93 个不同测试：isolation 2、内容/model/presentation/UI 五文件 71、全文/真实 producer/auth/compiled consumer 四文件 20。typecheck、diff --check 通过。初次 sandbox 80 passed / 11 owned listen EPERM 保留；许可 owned loopback 后相关 20/20 通过。93 为独立审查选择的不同测试数，与本 worker 之前默认 suite 的 165 项分别记录，没有冒称本轮重新跑全部测试。

主控批准本 Task 剩余联合清单收口，未提出产品代码返修；本轮仅更新当前 Task、E/V/D 和本报告，未改产品代码、未开始 Task 2/3、未写 parent/Case、未提交/安装/发布。真实安装/UI/精确导航/恢复和宿主执行仍未验收。Task 已通过真实 schema4/task-centric/protocol4 回读：source/current ID一致、health=healthy、status=done、completion.trusted_done=true、trust_level=tasknotes_only。完整baseline与contexts/projects/tags保留，全部人类联合清单已回勾，E/V/D各两轮可见。计时开关False，未调用计时写入。

按本次主控明确指示不反向发送 Completion 或 send_message_to_thread，主控通过原生只读状态与 TaskNotes 回收事实。先前手动允许回传只用于当时那次动作，不作为今后持续发送授权。
