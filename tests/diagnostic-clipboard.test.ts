import assert from "node:assert/strict";
import test from "node:test";

import { formatDiagnosticClipboard } from "../src/diagnostic-clipboard.ts";

test("复制问题生成固定七行且不包含原始 artifact", () => {
  assert.equal(formatDiagnosticClipboard({
    taskTitle: "清理会话",
    taskId: "Tasks/清理会话.md",
    title: "Evidence Contract 缺失",
    reason: "task store 中未找到合同",
    remediation: "重新应用合同",
    code: "task_store_missing",
    path: "contract.task_store",
    location: "",
  }), [
    "任务：清理会话（Tasks/清理会话.md）",
    "问题：Evidence Contract 缺失",
    "原因：task store 中未找到合同",
    "建议：重新应用合同",
    "错误码：task_store_missing",
    "字段：contract.task_store",
    "位置：未提供",
  ].join("\n"));
});
