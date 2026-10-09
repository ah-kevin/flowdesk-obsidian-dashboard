# FlowDesk Dashboard Obsidian 插件

FlowDesk Dashboard 是一个 desktop-only 的 Obsidian 第三方插件，用来查看当前
TaskNotes 任务或 Work Case 的 FlowDesk snapshot。插件分别调用本机 FlowDesk-Plugin
安装目录或指定仓库中的 `bin/flowdesk-execution-snapshot` 与 `bin/flowdesk-work-case-snapshot`，
在 Obsidian 侧栏或独立主区域渲染 Task Dashboard 与只读 Case 恢复驾驶舱。

本项目走 GitHub Release、BRAT 或手动安装，不以提交 Obsidian 官方 Community
Directory 作为发布路径。

## 2.0.11 更新

- 修正 `manifest.json` 的插件描述：Dashboard 仍只读，文档中心的“置顶 / 已回看”会写文档 frontmatter。代码无其他改动。

## 2.0.10 更新

- 新增命令“打开文档中心”：在 Obsidian 内浏览 `Notes/Docs`、`Notes/Plans`、`Notes/Research` 顶层 Markdown 文档，实时读取 frontmatter，不依赖 Core 或 TaskNotes。
- 三个视角：最近（按文件修改时间分今天 / 7 天 / 30 天 / 更早）、按项目（`project` 与 `projects` 合并，多项目文档在每个项目下出现）、常驻（`pinned: true`）。支持类型筛选、搜索，`superseded` / `archived` 默认隐藏并可开关。
- 常驻视角：没有 `reviewed` 的文档显示“未回看”并排最前，其余按距上次回看最久排前；绿 < 7 天、黄 < 30 天、红 ≥ 30 天。置顶会刷新文件修改时间，所以回看状态只看 `reviewed`，不看修改时间。
- `T` 切换深浅主题，`S` 循环四种风格（经典 / 信号流 / 蓝图 / 编辑）；`/` 搜索，`1` `2` `3` 切视角，`Esc` 清空。选择保存在插件设置的 `docHub`。
- 卡片上的“置顶 / 取消置顶 / 已回看”会通过 Obsidian 的 `processFrontMatter` 写入该文档的 `pinned` / `reviewed`，正文不改。`processFrontMatter` 会重新序列化整段 frontmatter，其他键的值不变，但写法可能被规范化（例如行内 `tags: [a, b]` 变为块列表）。
- 悬停卡片可预览笔记；点击在内容标签页打开，Cmd/Ctrl 点击新开标签页。

## 2.0.9 更新

- 修复 Dashboard 只读清单复选框垂直位置偏高的问题：checkbox 继承正文的字体与行高，同时保留 14px 标记、8px 间距和多行缩进。

## 2.0.8 更新

- 修正正文与过程记录中复选框被列表基础样式覆盖、与文字重叠的问题；保留多行文字的统一缩进。
- 侧栏继续跟随当前 Task/Case，移除“放大阅读 / 回到侧栏”切换按钮。
- 新增命令“在主区域打开 Dashboard”，独立打开当前 Task/Case；侧栏保留，主区域固定阅读对象，两份视图独立保存展开、搜索与阅读位置。重复打开同一对象会显示已有主区域视图。
- 桌面可通过 Obsidian 原生标签页菜单弹出独立窗口，再使用系统全屏。移动端兼容暂缓，当前仍仅支持桌面。
- 本次只发布 Dashboard；Core 的行内列表修复另见独立 PR，不随本轮合并或发布。

## 2.0.7 更新

- “放大阅读 / 回到侧栏”切换整个 Task 或 Case 看板，保留阅读位置、展开状态和精选入口搜索；在主区域查看原文件时保留看板。
- 按面板实际宽度调整布局：宽屏使用主阅读区与辅助栏，中等宽度居中单列，窄侧栏保留紧凑顺序。宽阅读可选 14/16/18px 字号。
- 库外 Markdown 在 Obsidian 内只读打开，普通点击使用内容标签页，Cmd/Ctrl 点击新标签页；显示准确绝对路径，可刷新和查看完整源码，不复制到 vault、不保存原文件。
- 库外阅读支持不超过 2 MiB 的 UTF-8 Markdown。图片、嵌入、内部导航与 Obsidian Markdown 后处理器不运行；链接显示静态文本，复选框显示原文符号。系统打开原文件是独立的可选操作，仅报告请求提交结果。
- Core 的行内字符串列表修复保留在独立 PR，尚未合并发布。本次 Dashboard 不包含该修复；旧 Case 被漏掉的引用仍需后续更新 Core，Dashboard 不改写 Case 原文。

## 2.0.3 更新

- Core 来源可选择“跟随已安装 Core”或固定路径。新配置默认跟随 Claude 安装登记，登记不可用时检查有效 Codex 缓存；已有固定配置保留。界面显示生成当前观测所用的版本和来源，路径无效时提供设置入口。
- Task 使用一张概览卡，任务说明连贯、验收标准合成只读清单；执行、验证、交付各一个结果入口，历史正文合成默认收起的过程记录，完整原文及顺序保留。
- Case 优先显示当前进展、进行中的任务、精选入口与最近三条进展；主按钮复制短继续工作卡，完整恢复数据保留。
- Task/Case 统一窄栏样式与时间格式，同一资源刷新保持折叠、滚动和焦点；资料页支持返回原 Task/Case。
- 有效设置保存后自动刷新，token 输入默认遮住。Dashboard 保持只读，不增加任务勾选写回。

## 2.0.2 更新

- Task API 原文读取改用桌面只读 HTTP，避免 renderer Origin 被 TaskNotes 拒绝；保留取消、重定向拒绝、身份核对与凭据脱敏。
- 配合 Core canonical Progress 投影修复，日志之后还有其他章节时也能呈现进展片段；日期不完整仍保留 unknown 并隐藏 Next。

## 2.0.1 更新

- Case 引用保留原始标题、路径、顺序和来源，明确展示缺失、歧义与不可用状态；仓库引用按准确 Case cwd 核对。
- Task 当前进展从 canonical Progress 的日期与来源核对最近片段；日期、生命周期或正文不完整时显示 unknown，不把历史 Next 当作当前动作。
- 完整保留 legacy Activity、Details、Steps、Implementation 与多轮记录，来源导航无法唯一定位时打开整张原文。

完整隔离测试与受控 Core 集成用于源码验收；真实 Obsidian 安装、布局与原文定位需由安装后的宿主验证。

## 运行依赖与安全边界

- 仅支持 Obsidian desktop，`manifest.json` 中 `isDesktopOnly` 固定为 `true`。
- 需要本机已安装 FlowDesk Core，或指定已有 FlowDesk-Plugin 仓库；所选目录须包含 Task 与 Work Case 两个独立 snapshot CLI。
- Task Dashboard 需要 TaskNotes HTTP API 可用；Case Dashboard 在 API 不可用时仍显示
  Work Case 主体，并把关联任务区明确标记为 unavailable。
- Task consumer 继续接受既有 task-centric schema 3/4；Case consumer 只接受
  `snapshot_schema_version=1`、`snapshot_model=work-case-centric` 与 producer protocol 1。
  两条路径都对 source identity fail-closed。
- Dashboard 是只读视图；只执行 snapshot 命令，不修改 TaskNotes、Work Case 或
  FlowDesk runtime 状态。
- 首次使用时，“Core 来源”默认跟随已安装 Core，优先读取 `~/.claude/plugins/installed_plugins.json` 中的适用安装登记，无法使用时检查 `~/.codex/plugins/cache/flowdesk-marketplace/flow-desk/` 中完整的稳定版本。缓存来源不证明其他宿主已经加载该版本。
- 已配置的固定路径不会自动切换；需要自动跟随后，在设置中选择“跟随已安装 Core”。固定模式继续使用指定目录。
- `workingDirectory` 是任务 snapshot 的工程目录；已有设置保留，留空时使用所选 Core 路径。Case snapshot 的工作目录仍为 vault，工程位置以 Case 中的准确 cwd 为准。

## TaskNotes 鉴权配置

在插件设置的 **TaskNotes token** 输入框中填写凭证，默认遮住。其他环境变量可在高级设置的 **TaskNotes 环境变量（JSON）** 中配置，例如：

```json
{
  "TASKNOTES_API_TOKEN": "your-token"
}
```

- JSON 必须是对象，环境变量值必须是字符串；无效内容会显示错误，并保留上次有效配置。
- JSON 逐项合并到现有进程环境，保留未配置的变量，同名变量按 JSON 更新。合并结果供
  Dashboard 子进程和请求使用，不修改 Obsidian 的全局环境。
- token 同时供 Task snapshot、Work Case snapshot 和完整 Task 原文 GET 使用，兼容 `TASKNOTES_AUTH_TOKEN`。
  三个入口都从合并后的环境读取凭证：先读取非空的 `TASKNOTES_API_TOKEN`，再读取
  `TASKNOTES_AUTH_TOKEN`。填写空字符串只清空对应变量。
- 留空或填写 `{}` 时使用进程环境；不读取 env 文件。有效设置保存后会自动刷新当前面板，原文读取也使用新配置。
- 可在 JSON 中配置 `TASKNOTES_API_URL`；单独填写的“TaskNotes API 地址”优先级更高。
- 设置保存在插件本地 `data.json` 中。token 不进入 CLI 参数、复制命令或鉴权错误内容。

401 提示会区分“未配置 token”和“已发送 token 但服务拒绝鉴权”。

## GitHub Actions 发布

发布由 GitHub Actions 执行，本地不直接创建 GitHub Release。

CI 触发规则：

- Pull request：安装依赖、构建、类型检查、语法检查、release 校验和打包。
- Push 到 `main`：同上，并上传 workflow artifact 便于检查。
- Push `v*` tag：同上，然后创建或更新 GitHub Release 并上传 release assets。

本地完整发布前检查需要真实 Core checkout（含已安装的 `mcp` 依赖）、Python 3 和支持
`--test-isolation=none` 的 Node（当前验证 Node 24）。可运行：

```bash
npm install
FLOWDESK_PLUGIN_ROOT="/path/to/flowdesk-plugin" \
FLOWDESK_TEST_PYTHON="/path/to/python3" npm run release:prepare
```

`release:prepare` 会依次执行：

- `npm test`
- `npm run build`
- `npm run typecheck`
- `npm run check:syntax`
- `npm run release:verify`
- `npm run release:package`

Release 必需文件：

- `main.js`
- `manifest.json`
- `styles.css`
- `versions.json`

脚本会生成 `release/flowdesk-dashboard-<version>/`，并在本机有 `zip` 命令时生成
`release/flowdesk-dashboard-<version>.zip`。GitHub Release 由 CI 上传上面的四个必需文件，
并同时上传 zip 方便手动安装。

发布一个版本（版本号以 `manifest.json` 为准）：

```bash
git tag "v2.0.6"
git push origin "v2.0.6"
```

CI 会校验 tag 必须等于 `v<manifest.version>`。例如 `manifest.json` 版本为 `2.0.6`
时，release tag 必须是 `v2.0.6`。推送标签前，先将同一份已验证提交推送到 `main`。

版本要求：

- `package.json` 的 `version` 必须和 `manifest.json` 的 `version` 一致。
- `versions.json` 必须把当前版本映射到 `manifest.json` 的 `minAppVersion`。
- 本插件当前为本机工作站插件，不需要 npm publish。

## BRAT 安装/更新

适合已安装 BRAT 的用户：

1. 在 Obsidian 安装并启用 BRAT。
2. 执行 BRAT 的 `Add a beta plugin for testing` 命令。
3. 输入本仓库的 GitHub 地址，例如 `owner/flowdesk-obsidian-dashboard`。
4. BRAT 安装后，在 Obsidian 第三方插件列表里启用 **FlowDesk Dashboard**。

BRAT 更新依赖仓库中的 `manifest.json`、`main.js`、`styles.css` 和 `versions.json`。
如果使用 release 资产分发，保持 GitHub Release 的 tag 与 `manifest.json` 版本一致。

## 手动安装

适合不使用 BRAT 的用户：

1. 从 GitHub Release 下载 `flowdesk-dashboard-<version>.zip`，或下载
   `main.js`、`manifest.json`、`styles.css`、`versions.json`。
2. 在目标 vault 中创建插件目录：

   ```bash
   mkdir -p "$OBSIDIAN_VAULT/.obsidian/plugins/flowdesk-dashboard"
   ```

3. 把 release 文件放入该目录，至少包含：

   ```text
   .obsidian/plugins/flowdesk-dashboard/main.js
   .obsidian/plugins/flowdesk-dashboard/manifest.json
   .obsidian/plugins/flowdesk-dashboard/styles.css
   .obsidian/plugins/flowdesk-dashboard/versions.json
   ```

4. 重启 Obsidian 或刷新第三方插件列表，启用 **FlowDesk Dashboard**。

## 开发 symlink 安装

本地开发时仍可把源码目录链接到 vault：

```bash
npm install
npm run build
ln -s "$(pwd)" \
  "$OBSIDIAN_VAULT/.obsidian/plugins/flowdesk-dashboard"
```

如果目标目录已存在，先确认它是否是旧 symlink 或旧 release 安装目录，再自行清理。

## 使用

打开一个 `Tasks/*.md` 或 `TaskNotes/*.md` 任务文件后，执行命令面板里的
**FlowDesk Dashboard: Show dashboard for current TaskNotes task**，或点击左侧 ribbon
里的 dashboard 图标。插件会打开右侧面板并显示只读 dashboard。

Dashboard 已打开时，切换到 frontmatter `type: work-case` 或 legacy `type: session`
文件会自动进入 Case 恢复驾驶舱；明确打开的 archived Case 仍完整显示并标记“已归档”。
其他 Markdown 文件继续显示非 FlowDesk 提示。Case 内容由独立 producer 解析，Dashboard
不从散文猜测任务或 Current 字段。

## Task-centric snapshot v3/v4 展示语义

侧栏使用行动优先的单列控制台，默认按以下顺序显示：

1. 唯一的当前任务标题、可选 Parent 返回入口、状态标签以及“复制 CLI”“刷新”；
2. snapshot 观察可信度、来源匹配和当前 task 合同状态；
3. 一条首要状态或诊断，优先说明发生了什么、为什么、怎么修和短位置；
4. Parent task 的 direct children 紧凑行，整行点击打开 child；Leaf 不显示空 children 区域；
5. 任务详情：目标、背景、范围、执行清单、静态验收与执行/验证/交付结果使用轻量章节；进度日志默认最近 3 条摘录，完整历史按需展开。机器诊断按需查看。

打开任一 TaskNotes task 都只解释该 task。Parent 上下文只提供返回入口，children 只展示
direct summaries，不从 parent 拼接当前 task 合同。Parent 自己仍持有并展示自己的合同；Leaf
只展示自身合同，并通过标题上方的 Parent 链接返回父任务。

任务标题、Parent 链接、child 整行与诊断标题承担导航，不再额外显示“打开任务”或“打开诊断
位置”按钮。机器错误码、完整 task path、字段路径、原始 expected 等信息只出现在完整技术
详情中；默认诊断摘要保留原因、建议修法和 producer 提供的 section/line。

Dashboard 不自行推断 task 状态、证据有效性或完成顺序。`rollup`、children counts、
`trusted_done`、diagnostics 和 next actions 都直接来自同一份 producer JSON。

## 完整正文与只读边界

snapshot 的普通 Requirements/Scenarios 可能未结构化；投影条目为空不代表正文没有需求。
Dashboard 保留独立的 TaskNotes GET 完整 `details` 读取与来源核对，不因精简界面截断或去重原文。
Task 的概览、任务详情、进度历史和技术信息按大分组组织；卡内章节保持轻量行，正文列表只保留标记所需缩进。
设置页采用平面分隔行；Case 主体保持，标题左对齐、技术详情有独立容器。
日常界面不重复展示 API 全文和逐节原文按钮；点击任务标题可打开原文件，技术信息按需查看。
成功空字符串按空正文处理；缺身份、身份不匹配、错误 envelope 或非字符串正文会拒绝读取，
失败不会伪装为空任务。

完整读取保留准确 Task、独立 API 读取时间和 snapshot 时间。两次读取不能证明同轮一致；
可比片段变化会将展示中的 snapshot 标为 stale 并提示刷新，不改变原生 Task status、验收或
观察健康。切换 Task、刷新、关闭面板会取消旧原文请求，晚响应不会落到另一张 Task。

结果章节默认收起，展开查看最近一轮摘录；全部原记录及其他过程资料保留。进度日志的完整
历史首次展开渲染 12 条，再点击“加载更早记录”追加下一批；阅读区最高 520px，支持平滑开合
及减少动态效果设置。展开时显示已加载/总条数；未加载部分仍在原始数据中，不据此推断遗漏。
刷新保留已加载批次和阅读位置。切换 Task/Case 会清空旧快照、取消后续渲染并卸载 Markdown
组件；最多缓存 20 个资源的阅读选择，不缓存旧 DOM。已进入原生 MarkdownRenderer 的调用
需等待返回，旧结果忽略。

原文定位能力仍核对准确Task API身份、完整details唯一匹配与当前片段，再映射frontmatter偏移；
同时检查当前编辑器正文。BOM/CRLF、重复heading、旧内容、缺来源或歧义不会产生猜测行号，
无法确认时明确打开整张Task。Case来源行使用vault-file空间并检查当前片段；实际Obsidian定位仍需UI验收。

Dashboard 已退出主动人工 review：没有复核 Modal、reviewed 标签 PATCH 或记录 append。
已有 reviewed tags、Review Record 和历史记录继续可读。正文 checkbox 只表示“原文勾选”，
不推出测试、质量或验收通过；已移除 REQ/SCN、证据比例仪表。

“更多”提供交接上下文及完整恢复资料；“查看全部进展”和引用缺口使用 Obsidian 原生弹窗。
精选入口逐行标明类型和打开方式；明确点击已核对的本机 Markdown 才提交一次既有 Obsidian
打开请求，失败即时反馈。“编辑入口”打开准确 Case 原文件的编辑模式，由用户维护属性，
不自动写回 Task/Case，也不执行交接上下文中的任务。

## 任务上下文与刷新

- 面板首次打开或 Obsidian 恢复布局时，由当前 Dashboard 视图实例在 workspace layout ready
  后同步活动文件，不依赖插件级临时查找视图，也不需要再次切换文件。
- 当前文件不是 `Tasks/*.md` 或 `TaskNotes/*.md` 时，面板进入醒目的不可用状态，并立即清空上一任务的 dashboard。
- 当前 task、可选 parent 或 snapshot 中的 direct child 文件发生变化时，面板会在 500ms 内
  合并连续保存并自动刷新。
- 自动刷新和手动刷新都保留同一 task 的摘要/完整详情展开选择；切换到另一 task 时重置为
  “摘要展开、完整详情关闭”。
- 顶部唯一的“复制 CLI”会复制以当前 task path 为首个 positional 参数、带绝对可执行文件
  路径的完整 `--format dashboard` 命令；不使用 `--parent` 或 root 假设。

对 snapshot schema 3：

- 必须同时存在 `snapshot_model=task-centric`；model marker 缺失或不匹配时显示明确错误，
  不把缺失字段渲染成健康零值。
- 只有 schema/model 握手通过，且 `observation.health=healthy`、current task 与 children 为
  `observed`、parent 为 `observed` 或 `not_applicable`、TaskNotes API 为 `ok`、source identity
  匹配且数据不是 stale 时，才显示为可信观测。
- observation 非 healthy 时明确显示“观测不可信，无法判断任务是否正常”，不会把不完整数据
  渲染为健康成功。
- diagnostic 默认显示人类可读的原因、建议修法与短位置；点击诊断标题可打开 root 或具体
  child 的对应 heading。`task_id`、path、预期形态等机器字段位于完整技术详情中。
- 同一任务刷新失败时可继续查看上次成功 snapshot，但顶部标记“旧数据”并显示失败原因；
  切换任务或切到非 TaskNotes 文件会立即清空旧 snapshot。
- 如果顶层 `source_task_id` 与请求任务不一致，该结果会被拒绝展示，并同时显示请求路径与
  返回路径。
- schema 缺失或不为 3 时返回 `unsupported_snapshot_schema`；model marker 缺失或不匹配时
  返回 `unsupported_snapshot_model`。两者都不提供旧版降级展示。

复制入口等价于：

```bash
/path/to/flowdesk-plugin/bin/flowdesk-execution-snapshot \
  "Tasks/Current Task.md" \
  --working-directory "/path/to/flowdesk-plugin" \
  --format dashboard
```

## 源码测试与验收边界

`npm test` 使用唯一 `tests/run-tests.mjs` runner（支持 `--test-isolation=none` 的 node:test 无子进程隔离模式，
当前已验证 Node 24）。runner 将 HOME/vault/state/tmp/auth/API 替换为临时 owned 环境，
复用 Core 的 Node/Python cooperative guard，只允许精确 Node/esbuild/两条 producer argv/cwd
及当前测试实际创建的 loopback 端口；真实 open、Obsidian、codex、claude、queue 与业务
TaskNotes 地址被拒绝。guard 违规会令测试失败；不声称这是 native syscall 安全沙箱。

真实 producer、writer 和 guard 使用同一个 canonical Core root：显式 `FLOWDESK_PLUGIN_ROOT`
优先，未配置时仅查找仓库相邻的 `flowdesk-plugin`（同级或上一级目录中的同级 checkout）。
显式配置无效或缺源码/依赖时明确失败，不访问安装 cache 或用户 API，不跳过真实集成。
Python 由 `FLOWDESK_TEST_PYTHON` 或当前 PATH 的 `python3` 选择，owned launcher 保留所选
解释器路径与 venv prefix；不继承宿主凭据、PYTHONPATH 或 NODE_OPTIONS。

公开 GitHub CI 使用 Node 20，仅运行现有 build/typecheck/check:syntax/release:verify/release:package，
不读取私有 Core、不运行完整测试。完整隔离 suite 与 Core 联调在本地 `release:prepare` 执行，
CI 构建成功不能作为完整测试通过或真实 Obsidian 验收的证据。默认 suite 已无 live Task 探针。
受控 HTTP→真实 producer→compiled Dashboard 的 host/DOM double 只证明 consumer 合同；
构建产物不意味着插件已安装，真实 Obsidian 布局/安装/精确原文定位和宿主接续须另验收。

## 导航与恢复（Task 3 源码能力）

Task记录、诊断、完整API原文与Case正文/关联列表使用同一来源和路径边界。公开vault解析确认的已有笔记（含普通目录/相对路径）优先保留原语义。wiki与Markdown来源按实际链接逐条核对，代码/转义文本不产生豁免；无法唯一核对显示缺口。仓库相对引用只使用准确Case cwd。Task通过API原生contexts与Case路径的
context标识核对唯一关联，再由真实Case producer确认Task关联与cwd。缺关联、多Case、
缺checkout/文件或API不完整会显示缺口并提供原引用复制，不按进程cwd、标题或第一个Case猜。
正文的repository链接也会拦截，避免误交给vault创建同名笔记；普通网页链接保留网页语义。

仓库文件导航提供准确原文件路径和“Open file from outside the vault…”手工步骤。
macOS用户明确点击“在Obsidian打开文档”后，通过已接的生产适配器校验本机.md与固定应用，
按公开非shell argv向指定Obsidian提交请求。成功只显示“打开请求已提交”；失败/超时结果
未知，不自动重试，保留复制路径。组合路线仍待实机验证，accepted不证明准确打开/保存。
Windows/Linux不猜自动参数。真实打开方、tab影响、原位保存和无vault副本
仍须单独UI验收，不通过file URL默认应用、私有API或系统关联改变代替。

Case显式读取Core `--resume-bundle`，默认schema1保持兼容。仅在CLI精确拒绝该opt-in参数时，
做一次默认只读调用并明确显示恢复投影不可用；其他失败不走此分支。bundle的source、准确
Task状态/goal/result/blocker/next、resume_sources、resume_missing和operation refs原值保留。
歧义候选、字节截断、omitted_count、401和partial均可见；操作refs只表示引用，不证明完成。

Core不投影Context/Summary全文，因此Case全文独立使用vault.cachedRead，保留全部
正文和Goal/Current/Context/Summary来源，标单独读取时间，不能证明与snapshot同轮一致。
Dashboard不再单独渲染“完整Case原文”区块（Obsidian可直接打开Case）；该读取结果仅作为数据
供恢复摘要和其他载体使用，snapshot失败时仍可读取。旧请求和取消响应仍受selection/controller/generation门禁，
原有500ms关联事件合并刷新保持。读取时间只标本地观测，原来源时间只使用已有timestamp。

恢复摘要包含Case决策及来源；继续工作复制包含当前观测的准确Task ID/原状态/结果/Next、cwd/branch、缺口与来源，并要求显式选择，不自动全部执行。

“复制恢复摘要”“复制继续工作步骤”“复制原会话标识与查看步骤”都只读，不发消息、queue、
启动或接管宿主。Case的sessions引用与原生agent_session_id/device历史指针分别保留；没有
已验证的公开自动历史入口就提供准确标识及步骤。Task无Case时可复制准确Task引用给既有
work入口，不强建Case或伪造bundle。换载体先保存并回读进展、正常停止旧执行及已知后台
工作；释放未知只读或回原owner，多个未完Task需明确选择，不能自动全部开始。

本块仍是源码/controlled integration交付；新构建不意味着已安装，真实UI/外部文件打开与
跨宿主执行接续另验收。本轮不新增controller、broker或宿主控制桥。
