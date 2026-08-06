# FlowDesk Dashboard Obsidian 插件

FlowDesk Dashboard 是一个 desktop-only 的 Obsidian 第三方插件，用来查看当前
TaskNotes 任务的 FlowDesk execution snapshot。插件调用本机 FlowDesk-Plugin 仓库中的
`bin/flowdesk-execution-snapshot --format json`，再在 Obsidian 侧栏渲染同一份只读
snapshot 数据。

本项目走 GitHub Release、BRAT 或手动安装，不以提交 Obsidian 官方 Community
Directory 作为发布路径。

## 运行依赖与安全边界

- 仅支持 Obsidian desktop，`manifest.json` 中 `isDesktopOnly` 固定为 `true`。
- 需要本机已存在 FlowDesk-Plugin 仓库，并包含
  `bin/flowdesk-execution-snapshot`。
- 需要 TaskNotes HTTP API 可用；插件不会直接读写 TaskNotes markdown 文件作为降级。
- Dashboard 只接受 `snapshot_schema_version=3` 且
  `snapshot_model=task-centric`；缺少或错配 model marker 时 fail-closed，不兼容旧
  root-centric schema 3。
- Dashboard 是只读视图；只执行 snapshot 命令，不修改 TaskNotes、Work Case 或
  FlowDesk runtime 状态。
- 首次使用时，在插件设置里配置 FlowDesk repo path，例如
  `/Users/bjke/workspaces/flowdesk-plugin`。如果 `workingDirectory` 留空，插件默认使用
  FlowDesk repo path 作为 snapshot 命令工作目录。

## GitHub Actions 发布

发布由 GitHub Actions 执行，本地不直接创建 GitHub Release。

CI 触发规则：

- Pull request：安装依赖、构建、类型检查、语法检查、release 校验和打包。
- Push 到 `main`：同上，并上传 workflow artifact 便于检查。
- Push `v*` tag：同上，然后创建或更新 GitHub Release 并上传 release assets。

本地发布前检查可运行：

```bash
npm install
npm run release:prepare
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
git tag "v0.1.2"
git push origin "v0.1.2"
```

CI 会校验 tag 必须等于 `v<manifest.version>`。例如 `manifest.json` 版本为 `0.1.2`
时，release tag 必须是 `v0.1.2`。

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

当前入口仍以正在打开的 TaskNotes task 文件为准；插件不会从 Work Case 猜测任务，也不会
自行解析 TaskNotes Markdown。

## Task-centric snapshot v3 展示语义

侧栏使用行动优先的单列控制台，默认按以下顺序显示：

1. 唯一的当前任务标题、可选 Parent 返回入口、状态标签以及“复制 CLI”“刷新”；
2. snapshot 观察可信度、来源匹配和当前 task 合同状态；
3. 一条首要状态或诊断，优先说明发生了什么、为什么、怎么修和短位置；
4. Parent task 的 direct children 紧凑行，整行点击打开 child；Leaf 不显示空 children 区域；
5. 默认展开的合同与证据摘要，以及默认关闭的完整合同、证据和机器诊断详情。

打开任一 TaskNotes task 都只解释该 task。Parent 上下文只提供返回入口，children 只展示
direct summaries，不从 parent 拼接当前 task 合同。Parent 自己仍持有并展示自己的合同；Leaf
只展示自身合同，并通过标题上方的 Parent 链接返回父任务。

任务标题、Parent 链接、child 整行与诊断标题承担导航，不再额外显示“打开任务”或“打开诊断
位置”按钮。机器错误码、完整 task path、字段路径、原始 expected 等信息只出现在完整技术
详情中；默认诊断摘要保留原因、建议修法和 producer 提供的 section/line。

Dashboard 不自行推断 task 状态、证据有效性或完成顺序。`rollup`、children counts、
`trusted_done`、diagnostics 和 next actions 都直接来自同一份 producer JSON。

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
