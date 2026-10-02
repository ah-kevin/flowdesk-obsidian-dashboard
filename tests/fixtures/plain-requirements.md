## 目标

保留普通需求的原始正文。

## Requirements

- 一个app_completion工具六动作prepare/bind/build/check/record/read，严格输入与真实生产消费者；不只交无人调用的库或文档exec parser。
- 新wire /3四个机器字段与展示分离；旧/2七行表格仍严格读取，旧opaque值不套新UUID约束。
- 固定跨cwd私有state，单request原子绑定/单调mutation，冲突/损坏/遗留lock/写后未知保守对账，不换ID、不自动重发或重建。
- check零状态写入；record只记录caller_reported_native_match且tool_authenticated=false/task_mutated=false。父宿主必须独立核对原生metadata与Registry，body/自注册/record都不替代认证。
- Local/Worktree child均在实际身份及自身Registry核验后先幂等bind，再允许build；父侧独立正式身份门禁保持，早到push只留原消息待核对，不要求重发/重做。
- 真实Task写回成功才build/send；failed信号以blocked mode保存失败事实，不调用task-update failed；unknown零发送。done signal不代写Task done。
- 合法duplicate不重复mutation/业务执行，但重新核对原生来源后仍读取当前TaskNotes/snapshot；同digest progress的新事实、record后读失败/中断能只读恢复。
- legacy mapping仅明确旧cwd安全只读，无法证明状态历史则unknown，不自动重置new或迁移；全链日志只有限元数据/hash，不落wire/Task正文/来源报告。

## 根因

中文 Markdown `代码`。

## Review Record

- 历史 reviewed 记录保留。

## Execution Result (2026-10-01 10:00)

第一轮执行。

## Execution Result (2026-10-02 10:00)

第二轮执行。
