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
- 当前 dashboard 是只读视图，只执行 snapshot 命令，不修改 TaskNotes、Work Case 或
  FlowDesk runtime 状态。
- 首次使用时，在插件设置里配置 FlowDesk repo path，例如
  `/Users/bjke/workspaces/flowdesk-plugin`。如果 `workingDirectory` 留空，插件默认使用
  FlowDesk repo path 读取 `.flowdesk/notepad.md`。

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

## Snapshot v2 展示语义

侧栏默认按高频决策顺序显示：

1. observation 可信度、snapshot schema 与 SDD profile；
2. 当前任务、执行阶段、阶段进度与 inline/children 进度；
3. 首要诊断与 producer 给出的下一动作；
4. 阶段轨道；
5. 折叠的规格契约、行内执行、执行流程、执行证据、任务物化、子任务和工作区记事板。

## 任务上下文与刷新

- 面板首次打开或 Obsidian 恢复布局时，会主动同步当前活动文件，不依赖再次切换文件来触发加载。
- 当前文件不是 `Tasks/*.md` 或 `TaskNotes/*.md` 时，面板进入醒目的暂停状态，不再保留上一任务的 dashboard；如果存在上一任务，可点击“回到上一次任务”。
- 当前父任务或 snapshot 中的子任务文件发生变化时，面板会在 500ms 内合并连续保存并自动刷新。
- 自动刷新期间保留上一次成功结果和“查看执行详情”的展开选择；手动刷新会立即执行。
- “复制 CLI”会复制带绝对可执行文件路径的完整 `--format dashboard` 命令，可在任意终端目录直接运行。

对 snapshot schema v2：

- `observation.health=healthy` 只有在 schema 为 v2、`source_task_id` 存在且数据不是 stale
  时，才会被侧栏视为可信健康。
- inline 模式显示 producer 的显式 TASK 状态和完成数，不用 materialization binding
  百分比冒充实施进度。
- semantic 与 inline diagnostic 会显示 code、section/line、excerpt、实际原因和建议修法。
  “定位”按钮只打开对应 task heading/line，不会改写文件。
- 同一任务刷新失败时可继续查看上次成功 snapshot，但顶部会标记“旧数据”并显示失败原因；
  切换任务会立即清空旧 snapshot。
- 如果返回的 `observation.source_task_id` 与请求任务不一致，该结果会被拒绝展示。

对旧 snapshot：缺少 schema、observation、capabilities 或 source identity 时仍尽量展示已有
字段，但可信度显示为“观测未知/能力未知”，不会默认显示成绿色 healthy。旧 producer 若只
提供诊断 code/message，位置和修法会明确标注为“producer 未提供”。
