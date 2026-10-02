# FlowDesk Dashboard 2.0：当前界面审查

日期：2026-10-02，09:47–09:51 CST。对象为本机 Obsidian 1.14.3 中现有 FlowDesk Dashboard，使用当前真实父任务、Completion 子任务和整体升级 Case。截图通过 CUA 获取，逐张保存并打开检查；没有修改任务状态、安装插件或启动恢复执行。截图表现对应当时数据，后续任务进展可能变化。

目标：从“当前在做什么”到“看到实际记录、找到文档、继续未完成工作”，减少来回打开原文和自行查找。

## 五步观察

| 步骤 | 操作 | 健康状况 | 证据 |
|---|---|---|---|
| 1 | 查看父任务 Dashboard | 可用，但信息层次需调整 | 9/10 进度清楚；已完成项占据长列表，当前未完成项在下方；已完成项同时出现“阻塞于…” |
| 2 | 打开进行中的子任务并展开规格/交付详情 | 记录展示不足 | 展示目标、范围及计数；执行/验证/交付各1条，正文未在面板展开；同时显示“证据有效0/3” |
| 3 | 点击“执行1 · 验证1 · 交付1” | 定位体验不足 | 仍打开当前Task原文上方，截图没有定位到对应记录，需要继续手动查找 |
| 4 | 切换到Case | 内容可读、样式与Task不一致 | Current和关联任务有呈现；Case用active/WORK CASE/COMPLETED等另一套词；原始wikilink直接显示 |
| 5 | 展开“恢复上下文” | 仅信息展示 | 显示agent/workspace/session/device/cwd/branch，没有继续工作或打开原生历史的操作 |

### 1. 父任务

![父任务Dashboard](/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard/docs/reports/2026-10-02-dashboard-audit/01-parent.png)

优点：任务标题、生命周期、更新时间和子任务汇总可见。主要问题：当前需要跟进的子任务没有优先展示；“可信完成”和“阻塞于”同时出现，依赖关系与当前阻塞容易混淆。建议只有真实is_blocked成立才用“阻塞”，已完成依赖作为历史关系展示；状态完成与测试验收分别说明。

### 2. 子任务详情

![子任务记录](/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard/docs/reports/2026-10-02-dashboard-audit/02-task-records.png)

目标有原文，范围可展开；但REQ/SCN及“证据有效0/3”占突出位置，实际执行、验证、交付只有数量。建议按用户问题展示“目标与范围”“最新进展与下一步”“执行/验证/交付原文”，保留时间和来源，历史记录按需展开。缺少结构化REQ/SCN不等于Task不完整，不能用计数代替内容或质量判断。

### 3. 记录链接

![点击记录链接后的状态](/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard/docs/reports/2026-10-02-dashboard-audit/03-record-link.png)

本次点击后截图仍停留在Task标题、属性、目标和背景附近；未直接显示记录段。建议面板可读正文，并提供准确的“打开这一条原文”定位；若只能打开整张Task，按钮应明确写“打开任务原文”。

### 4. Case

![Case面板](/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard/docs/reports/2026-10-02-dashboard-audit/04-case.png)

Current直接可读，关联任务区分父子关系并折叠完成/归档项，这是可沿用的行为。建议Task/Case采用一致的标题、状态、刷新和来源区域；项目/计划显示人类可读标题，技术字段放详情中。保留Cupertino/Obsidian现有字体、间距与主题token，不另造视觉系统。

### 5. 恢复上下文

![恢复上下文](/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard/docs/reports/2026-10-02-dashboard-audit/05-resume-context.png)

当前展开的是元信息表。后续应区分“查看恢复摘要”“打开原生历史”和“继续工作”；点击继续前先看目标、准确Task、已完成结果、待做Next、cwd/branch与资料缺口。不能把打开聊天或App idle当旧writer已释放；没有可核验能力时提供只读摘要/明确人工步骤，不伪造自动接管。

## 可访问性观察

截图中多数状态同时有文字和颜色，能减少仅靠颜色识别的困难。小字号灰色元信息对比度存在可读性风险；未测量颜色比值，不下WCAG通过/失败结论。已看到部分图标按钮在AX中有“复制CLI/刷新”名称；未完成完整键盘路径、屏幕阅读器、缩放、深色主题或窄屏验证。实现验收需覆盖焦点、折叠/导航语义、可点击目标及主题适配。

## 改版优先级

1. 实际正文可见：保留Task目标/背景/范围/步骤与执行/验证/交付原文；状态、数据观察健康和验收结论分开，删除失去合同依据的质量计数。
2. 当前行动明确：优先展示进行中/待处理子任务，完成/归档按需展开；准确Next来自确定性恢复投影，歧义保留并给原文入口。
3. 导航与接续：区分vault笔记、仓库Markdown、原生会话；文件引用按Case cwd解析，缺失不给假成功。恢复摘要、历史查看与执行接手独立。
4. 统一布局和可靠刷新：复用现有主题与组件风格；Case关联Task变化也应刷新。人工review写入需明确owner/revision与部分失败处理，不能由UI自造完成状态。

## 证据边界

这里只验了上述五步；没有点击仓库外部Markdown链接、真实resume/跨宿主接管、人工review提交、修改关联Task来验证自动刷新，也没有做安装升级。上述后三类的源码缺口与这次截图证据分开；后续须用明确fixture或已授权真实操作单独验收。截图没有证明数据获取/TaskNotes写入合同正确，更不证明四宿主运行或完整无障碍合规。

下一步：将这些界面问题映射到已有Dashboard代码和稳定的FlowDesk数据合同，再形成实施计划。
