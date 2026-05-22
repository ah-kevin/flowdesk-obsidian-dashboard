# FlowDesk Dashboard Obsidian 插件

这是 FlowDesk Dashboard 的 Obsidian 插件，用来查看当前 TaskNotes 任务的
FlowDesk execution snapshot。它调用本机 FlowDesk-Plugin 仓库中的
`bin/flowdesk-execution-snapshot --format json`，再用 Obsidian 侧栏渲染同一份
snapshot 数据。

## 本地安装

在本目录构建：

```bash
npm install
npm run build
```

把这个目录以本地插件形式链接到 vault：

```bash
ln -s "$(pwd)" \
  "$OBSIDIAN_VAULT/.obsidian/plugins/flowdesk-dashboard"
```

然后在 Obsidian 的第三方插件列表里启用 **FlowDesk Dashboard**。

首次使用时，在插件设置里配置 FlowDesk repo path，例如
`/Users/bjke/workspaces/flowdesk-plugin`。如果 `workingDirectory` 留空，插件默认使用
FlowDesk repo path 读取 `.flowdesk/notepad.md`。

## 使用

打开一个 `Tasks/*.md` 任务文件后，执行命令面板里的
**FlowDesk Dashboard: Show dashboard for current TaskNotes task**，或点击左侧 ribbon
里的 dashboard 图标。插件会打开右侧面板并显示只读 dashboard。
