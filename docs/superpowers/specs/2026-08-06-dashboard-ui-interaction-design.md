# FlowDesk Dashboard 信息层级与交互优化设计

## 背景

FlowDesk Dashboard 已完成 SDD v3 task-centric 数据模型迁移，能够展示当前 TaskNotes task、直接 children、观察可信度、合同诊断与执行证据。当前主要问题不再是“有没有数据”，而是同一事实被多个视觉层级重复呈现：面包屑、任务标题、状态条、合同状态、主诊断、下一步操作和详情卡片拥有近似权重，导致侧栏首屏难以快速回答“我现在在哪、是否可信、卡在哪里、下一步做什么”。

实际截图还暴露出两个体验问题：

- semantic error 默认平铺机器错误码、完整路径、字段路径、原因、预期与建议，信息虽完整，但人的修复路径不够突出。
- 详情默认全折叠时，用户看不到合同与证据概况；默认全部展开时，又会让侧栏被长文本占满。

本轮以真实 Parent 与 Leaf task 的完整侧栏为基础，先建立稳定的信息层级和渐进展开策略。上线后再依据实际使用调整密度，不在第一轮引入可配置布局或复杂个性化选项。

## 目标

- 首屏优先回答当前 task、观察可信度、主要阻塞和下一步修法。
- 让 Parent 与 Leaf task 使用同一套视觉语言，同时准确反映各自不同的管理职责。
- 删除重复标题、重复跳转和重复操作入口。
- semantic error 默认用人能直接行动的语言表达，机器细节按需展开。
- 合同与证据默认露出摘要，但不自动铺开全部原文。
- 保留 SDD v3 task-centric、fail-closed 与同一 snapshot JSON 数据源约束。

## 非目标

- 不改变 snapshot producer 的 SDD v3 数据合同或诊断判定规则。
- 不修改 TaskNotes Markdown，也不在 Dashboard 中写入 task 状态或合同内容。
- 不重新引入 legacy、v1 或 v2 snapshot fallback。
- 不加入布局设置页、用户自定义折叠规则或持久化 UI 偏好。
- 不在本轮解决所有文案与间距的长期调优；后续以实际使用反馈继续收敛。

## 设计原则

### 行动优先

侧栏不是合同全文阅读器，而是执行控制台。默认视图先展示当前最需要处理的一件事，再提供上下文与原始证据。

### 一份事实只给一个主入口

任务跳转由标题或整行承担；复制 CLI 和刷新只保留在顶部工具栏；同一操作不再以多个按钮重复出现。

### 先摘要，后全文

合同与证据始终默认显示一层摘要，让“没有问题”与“根本没看到数据”能够区分；完整合同、证据和机器诊断放入第二层展开区。

### Parent 管整体，Child 管自身

Parent 只聚合直接 children 的状态与阻塞，不复制 child 的 Goal、REQ、SCN 和证据。Leaf 不渲染空 children 区域，只展示自己的合同和执行事实。

## 页面信息架构

Dashboard 从上到下固定为五层：

1. 顶部任务区：当前 task 标题、Parent 上下文、状态标签以及复制 CLI、刷新。
2. 可信度区：用紧凑状态表达 snapshot 是否可信、来源是否匹配、数据生成时间。
3. 主阻塞区：展示当前最重要的一条诊断；无阻塞时展示明确健康状态。
4. 任务结构区：Parent 展示直接 children；Leaf 不显示空结构区。
5. 合同与证据区：默认展开摘要，内部可继续展开完整详情。

现有面包屑、Hero 标题、独立 Gate 卡、独立 Next Action 卡不再作为等权卡片存在，其有效信息合并到上述五层。

## 顶部任务区

- 当前 task 标题是页面唯一主标题，不再同时显示 Dashboard 标题、路径面包屑与 Hero 重复标题。
- Parent task 场景下，当前标题保持纯文本，因为编辑器已经打开当前文件。
- Leaf task 场景下，在当前标题上方显示一行可点击的 Parent 标题，用于返回父任务。
- 顶部只保留两个独立按钮：“复制 CLI”和“刷新”。
- task 状态、Parent/Leaf 类型和可信度使用紧凑标签，不再各自占据完整卡片。

## 标题即导航

- Parent 上下文标题点击后打开 Parent TaskNotes 文件。
- child 列表整行均可点击，标题承担主要导航语义，打开对应 child。
- 主诊断标题可点击；当 snapshot 提供 section/line 定位时，直接打开 task 的对应位置，否则打开 task 文件。
- 删除“打开任务”“打开诊断位置”等与标题导航重复的按钮。
- 当前 task 主标题不提供重复跳转，避免点击后没有可感知变化。

所有可点击标题需要具备 hover、focus-visible 与键盘激活状态，不能只依赖颜色表示可操作性。

## 可信度与健康状态

可信度区必须同时表达两个问题：

- Dashboard 是否成功读取了预期 task 的 snapshot。
- snapshot 读取成功后，当前 task 的合同与执行状态是否健康。

两者不可合并成一个模糊的绿色状态。推荐状态语义：

- “观察可信”：schema、snapshot model、source task 与当前 task 均匹配。
- “观察失败”：数据源执行失败、JSON 无效或关键身份信息缺失。
- “来源不匹配”：snapshot 属于其他 task，必须 fail closed，不展示为当前 task 的健康事实。
- “合同有效”或“合同存在问题”：只在观察可信的前提下表达任务自身状态。

若刷新失败但允许保留同一 task 的旧数据，界面必须明确标记“显示上次成功结果”和生成时间，不能继续显示成当前健康数据；切换到另一 task 后读取失败则清空旧内容。

## 主阻塞与 semantic error

### 默认摘要

首屏一次只突出最重要的一条诊断，内容按人的修复顺序排列：

1. 发生了什么，例如“当前 task 的 Goal 无效”。
2. 为什么，例如“Goal 为空或包含占位内容”。
3. 怎么修，例如“补写当前 task 的单一交付目标并删除占位内容”。
4. 短位置，例如“Goal · 第 1 行”。

诊断标题本身可点击并跳转到对应位置。默认摘要不展示 `task_goal_invalid`、完整 task ID、完整文件路径、`contract.goal` 等机器字段。

### 技术详情

以下信息进入“技术详情”折叠区：

- 诊断码。
- 完整 task ID 与文件路径。
- section、line、字段路径。
- producer 返回的原始 reason、expected 与 remediation。
- 同一 task 的其他诊断列表。

技术详情不改写 producer 事实，只改变显示优先级。若 producer 没有精确 line，界面不得伪造位置，应退化为 section 或文件级定位。

### 无诊断状态

不能只显示“没有问题”。健康摘要需同时注明 snapshot 已成功读取、来源匹配以及检查范围，例如“观察可信；当前 task 合同有效；已检查合同与执行证据”。这样可以区分真实通过与数据缺失。

## Parent 的 children 区域

Parent 只显示直接 children，每个 child 使用一行紧凑摘要：

- child 标题。
- TaskNotes 状态。
- 观察可信度或主要阻塞摘要。
- 必要时显示阻塞关系或证据完成度。

整行可点击。默认不展示 child 文件路径、完整 Goal、空的 `Blocked by`、Leaf 标记、重复状态、完整合同或独立“打开”按钮。

children 的排序继续遵循 snapshot producer 提供的稳定顺序，Dashboard 不自行推断优先级。Parent 没有 children 时，不渲染空列表卡片。

## Leaf 呈现

Leaf 与 Parent 共用顶部、可信度、主阻塞及合同证据组件，但有以下差异：

- 顶部显示可点击的 Parent 标题。
- 不渲染 children 区域，也不显示“无子任务”占位卡。
- 默认摘要聚焦 Leaf 自己的 Goal、REQ/SCN、验收、执行结果、验证结果与交付记录。
- Parent 的合同细节不复制到 Leaf，只提供返回入口。

## 渐进展开

### 默认状态

无论合同有效还是无效，“当前任务合同与证据”摘要层都默认展开。摘要只显示：

- Goal 一句话。
- REQ/SCN 或验收覆盖概况。
- 执行、验证、交付证据的状态与数量。
- 诊断数量及最高优先级摘要。

摘要层内部提供“展开全部合同、证据与诊断”，默认关闭。展开后显示完整合同内容、全部证据条目、所有诊断与技术详情。

### 状态生命周期

- 同一 task 手动刷新：保持用户当前展开状态，避免阅读中跳回顶部。
- snapshot 自动刷新但 source task 未变化：同样保持展开状态。
- 切换到另一 task：重置为摘要展开、完整详情关闭。
- 视图关闭后重新打开：第一轮不持久化展开偏好，使用默认状态。

## 非 task 与异常场景

- 当前文件不是 `Tasks/*.md`：清空之前 task 内容，显示明确空状态“当前文件不是 TaskNotes task，Dashboard 不可用”。
- 没有活动文件：显示“打开一个 TaskNotes task 以查看 Dashboard”。
- snapshot model、schema 或 source task 不匹配：fail closed，显示不兼容或来源不匹配，不保留为当前 task 的内容。
- producer 命令失败或 TaskNotes API 不可用：显示失败原因与重试入口；只有同一 task 才可带明显 stale 标记保留上次成功结果。
- 数据字段缺失：对应摘要显示“未读取到”而不是默认为健康或零项。

这些状态继续保留“刷新”按钮；复制 CLI 仅在能够确定当前 task path 时提供。

## 组件边界

实现应保持数据合同、展示模型与 DOM 渲染分离：

- snapshot 解析与 task/source 校验继续在数据层完成。
- 新增轻量 presentation model，将可信度、主诊断、证据摘要和导航目标整理为稳定的显示结构。
- DOM helper 分为顶部任务区、可信度区、主阻塞、children 列表、合同摘要和完整详情。
- CSS 使用少量层级 token 区分主阻塞、普通摘要和技术详情，避免每段信息都成为等权边框卡片。

本轮不要求 snapshot producer 新增字段；若精确位置或人类可读修法缺失，Dashboard 只使用现有字段做保守降级，不在消费者侧推断不存在的事实。

## 刷新与渲染规则

刷新流程保持先校验、后写入视图：

1. 根据活动文件确定 source task。
2. 调用 snapshot producer。
3. 依次验证 schema、`snapshot_model=task-centric` 与 source task identity。
4. 构建 presentation model。
5. 仅在验证完成后替换当前可见数据。

同一 source task 的失败可保留 stale 数据；不同 source task 或非 task 场景必须清空。展开状态按 source task ID 管理，不能仅凭 DOM 是否存在决定。

## 可访问性与窄侧栏适配

- 可点击行使用按钮或可键盘激活的语义元素，并提供清晰焦点样式。
- 状态不仅依赖红绿颜色，同时有中文文本和图标/形状差异。
- 长标题优先换行；机器路径只在技术详情中使用可断行样式。
- 顶部工具栏在窄宽度下保持操作可见，不与标题争夺同一行空间。
- 展开控件使用原生或等价的 `aria-expanded` 语义。

## 测试与验收

### 纯函数与状态测试

- Parent、Leaf、非 task、无活动文件、观察失败、来源不匹配和 stale 同 task 状态。
- 主诊断从多个 diagnostics 中稳定选择最高优先级项。
- 技术字段不会进入默认摘要，但完整详情中仍可访问。
- 同 task 刷新保留展开状态，切换 task 重置状态。
- 缺失字段显示“未读取到”，不误判为健康。

### 渲染测试

- Parent 只显示直接 children，整行可点击，且不含冗余打开按钮。
- Leaf 不渲染空 children 卡片，并显示 Parent 返回入口。
- 顶部只保留复制 CLI 与刷新两个独立操作。
- 默认合同摘要展开、完整详情关闭；两层均可键盘操作。
- 非 task 或 source mismatch 不显示上一 task 的无标记内容。

### 项目验证

- `npm test`
- `npm run build`
- `npx tsc --noEmit`
- `node -c main.js`
- 使用 canonical task-centric producer fixture 验证解析等值。
- 在真实 Obsidian 中分别打开 Parent、Leaf、非 task 文件，并验证首次打开、切换文件、手动刷新与失败后恢复。

## 跨仓库归属

- `/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard`：本轮 UI、交互、展开状态、导航与刷新呈现的全部实现及测试。
- `/Users/bjke/workspaces/flowdesk-plugin`：本轮不改。只有后续发现 snapshot 缺少真实诊断位置、修法或可信度事实时，才在 producer 侧扩充 schema 3 字段；Dashboard 只消费，不复制判定逻辑。

## 取舍

- 选择行动优先的单列控制台，放弃同时展示所有合同字段；侧栏首屏更易扫描，全文仍可展开访问。
- 选择默认展开摘要，放弃“全部折叠”和“全部展开”两个极端；用户无需先点击才知道当前状态，也不会被长合同淹没。
- 选择标题和整行作为导航，放弃独立打开按钮；减少视觉噪音，但必须补齐 hover、focus 与键盘语义。
- 选择 Parent 只聚合直接 children，放弃在 Parent 重复 child 详情；符合 TaskNotes 原生父子职责，也避免双份事实漂移。
- 选择消费者侧只做保守展示降级，放弃从错误码猜测位置或修法；精确事实仍归 snapshot producer 所有。
- 选择第一轮不持久化展开偏好、不提供布局设置；实现和行为更可控，真实使用证明有价值后再增加配置。

## 上线后的观察点

- 用户是否能在首屏快速找到真正的主阻塞。
- 默认摘要是否仍然过长，或是否缺少关键验收信息。
- Parent child 行中的状态信息是否足以支持人工 review。
- semantic error 的人类摘要是否真的减少了查看技术详情的次数。
- stale、非 task 和来源不匹配状态是否足够醒目，不再产生“看起来没问题但其实没读到”的误解。
- 展开状态在自动刷新期间是否稳定，首次打开是否仍出现空白或需要切换文件才能恢复。

这些观察结果用于后续小步优化，不改变本设计确定的 task-centric、fail-closed 和单一 snapshot 数据源边界。
