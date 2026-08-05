# FlowDesk 执行证据展示顺序设计

## 背景

当前 snapshot producer 将 TaskNotes 的 `Execution Result`、`Verification Result` 与 `Delivery Record` 按 Markdown 行原序写入 `items`。CLI 与 Obsidian 都直接取 `items` 的前两条展示，因此多轮追加后会出现 `TASK-5.1 → TASK-1.1`，也会把本地检查放在运行态 smoke 之前。界面顺序稳定但缺少业务含义。

同时，Obsidian 证据状态只检查 `exists`。对于“章节存在但 strict-v2 判为无效”的证据，界面仍显示绿色完成状态，造成错误的健康暗示。

## 目标

- 保留原始证据事实与原始顺序，避免展示需求改变语义验证输入。
- CLI 与 Obsidian 使用同一份 producer 提供的展示顺序。
- 执行结果按合同 TASK 声明顺序展示。
- 验证结果优先展示最接近用户结果的证据。
- Obsidian 明确区分缺失、存在但无效、有效三态。
- 旧 snapshot 不含新字段时保持兼容。

## 非目标

- 不修改 TaskNotes Markdown 的内容或行顺序。
- 不改变 `valid_items`、`commands`、`results` 的语义校验规则。
- 不引入人工维护的证据时间戳或新必填合同字段。
- 不改变交付记录的原始顺序。

## 数据合同

每个 evidence 对象保留已有字段，并可新增：

```json
{
  "items": ["原始 Markdown 顺序"],
  "display_items": ["面向 CLI/Obsidian 的稳定顺序"],
  "display_order": "task-contract | verification-outcome | source"
}
```

`items` 是事实层，继续供语义校验和兼容消费者使用。`display_items` 是展示提示，不参与合同有效性判定。消费者仅在该字段为数组时使用它，否则回退 `items`。

## 排序规则

### 执行结果

1. 从每条证据中提取第一个 `TASK-N.N` 标识。
2. 已知 TASK 按 `Spec Contract → Task Breakdown` 的声明顺序排列。
3. 同一 TASK 的多条证据保持 Markdown 原序。
4. 未关联 TASK 或引用未知 TASK 的条目排在已知 TASK 之后，并保持 Markdown 原序。

排序必须稳定，不修改 `items`。

### 验证结果

采用结果优先顺序：

1. 运行态 smoke：`smoke`、`runtime`、`运行态`、`真实验收`。
2. 安装态：`BRAT`、`安装态`、`安装目录`、`installed`。
3. 发布与 CI：`GitHub Actions`、`workflow`、独立词 `CI`、`发布`、`Latest Release`。
4. 静态检查与构建：`typecheck`、`build`、`syntax`、`lint`、`compile`、`静态检查`。
5. 完整回归：`完整`、`full suite`、`regression`、`回归`。
6. 定向验证：`定向`、`targeted`、`focused`。
7. 其他证据。

一条证据同时命中多个类别时采用优先级更高的类别；同类别保持 Markdown 原序。规则无法识别时进入“其他”，不丢弃、不报错。

### 交付记录

保持 Markdown 原序，`display_order` 为 `source`。

## Obsidian 呈现

- 优先展示 `display_items`，旧 snapshot 回退 `items`。
- 继续默认展示前两条、其余折叠；因为验证展示序已经是结果优先，运行态与安装态结论自然出现在首屏。
- `exists=false`：红色阻塞状态，文案“缺失”。
- `exists=true, valid=false`：异常状态，文案“存在但无效（N 项）”。
- `exists=true, valid=true`：完成状态，文案“有效（N 项）”。
- 旧 snapshot 缺少 `valid` 时，以 `exists` 作为兼容判断，不把历史数据误标为无效。

## 跨仓库归属

- `/Users/bjke/workspaces/flowdesk-plugin`：生成 `display_items/display_order`，并让 terminal dashboard 使用同一展示序。
- `/Users/bjke/workspaces/github/flowdesk-obsidian-dashboard`：声明兼容类型、消费展示序、修正 evidence 三态文案与状态色。

## 测试与验收

- producer 单元测试证明原始 `items` 未改变，而执行结果与验证结果分别生成预期展示序。
- producer CLI 测试证明 dashboard 前两条来自 `display_items`。
- Obsidian 纯函数测试覆盖新字段优先、旧字段回退及 valid 三态。
- 双端完整测试、构建、类型检查和真实 TaskNotes snapshot 对照通过。

## 取舍

- 放弃直接重排 `items`：这会混淆事实层与展示层，并可能影响现有消费者和语义诊断。
- 放弃给 TaskNotes 增加必填时间戳：合同摩擦成本高，且现有历史卡无法自动补齐可靠时间。
- 接受验证分类是保守关键词映射：未识别项稳定落入“其他”，优于猜测时间或静默丢弃；后续如证据合同结构化，可替换分类器而不改消费者接口。
