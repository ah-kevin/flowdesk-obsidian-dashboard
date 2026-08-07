export interface DiagnosticClipboardInput {
  taskTitle: string;
  taskId: string;
  title: string;
  reason: string;
  remediation: string;
  code: string;
  path: string;
  location: string;
}

export function formatDiagnosticClipboard(input: DiagnosticClipboardInput): string {
  const location = input.location.trim() || "未提供";
  return [
    `任务：${input.taskTitle}（${input.taskId}）`,
    `问题：${input.title}`,
    `原因：${input.reason}`,
    `建议：${input.remediation}`,
    `错误码：${input.code}`,
    `字段：${input.path}`,
    `位置：${location}`,
  ].join("\n");
}
