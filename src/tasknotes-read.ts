import { formatTaskNotesAuthError, type TaskNotesAuth } from "./tasknotes-auth";

export interface TaskDetailsRead {
  id: string; details: string;
  contexts?: string[] | null;
  source: { kind: "tasknotes-api"; taskId: string; readAt: string };
}
export interface TaskNotesReadResponse { status: number; statusText: string; text: string }
export type TaskNotesReadTransport = (request: {
  url: string; headers: Record<string, string>; signal: AbortSignal;
}) => Promise<TaskNotesReadResponse>;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export async function readTaskDetails({taskPath,apiUrl,auth,signal,transport}: {
  taskPath: string; apiUrl: string; auth: TaskNotesAuth; signal: AbortSignal; transport: TaskNotesReadTransport;
}): Promise<TaskDetailsRead> {
  const fail = (message: string, code = "tasknotes_read_invalid"): never => {
    throw Object.assign(new Error(formatTaskNotesAuthError(message, auth.token)), { code });
  };
  const checkCancelled = (): void => {
    if (signal.aborted) throw Object.assign(new Error("TaskNotes 原文读取已取消"), { name: "AbortError", code: "ABORT_ERR" });
  };
  checkCancelled();
  let response: TaskNotesReadResponse;
  try {
    response = await transport({
      url: `${apiUrl.replace(/\/+$/, "")}/api/tasks/${encodeURIComponent(taskPath)}`,
      headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {}, signal,
    });
  } catch (error) {
    checkCancelled();
    return fail(`TaskNotes 原文读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
  // A completed transport cannot publish a result after cancellation/task switching.
  checkCancelled();
  const raw = response.text;
  const ok = response.status >= 200 && response.status < 300;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { if (ok) return fail("TaskNotes 原文响应不是有效 JSON"); }
  if (!ok) {
    const upstream = isRecord(value) ? value : {};
    return fail(`TaskNotes API ${response.status}: ${typeof upstream.error === "string" ? upstream.error : raw || response.statusText}`,
      typeof upstream.code === "string" ? formatTaskNotesAuthError(upstream.code, auth.token) : "tasknotes_http_failed");
  }
  if (isRecord(value) && value.success === false) return fail(`TaskNotes API error: ${typeof value.error === "string" ? value.error : "读取失败"}`);
  if (isRecord(value) && "data" in value) value = value.data;
  if (!isRecord(value)) return fail("TaskNotes 原文响应缺少 Task 对象");
  const identities = [value.id, value.path].filter(x => x !== undefined);
  if (!identities.length || identities.some(x => typeof x !== "string" || x !== taskPath)) return fail("TaskNotes 原文身份不匹配或缺失");
  if (typeof value.details !== "string") return fail("TaskNotes 原文 details 必须是字符串");
  return { id: taskPath, details: value.details, ...(value.contexts === undefined ? {} : {contexts:Array.isArray(value.contexts) && value.contexts.every(x => typeof x === "string") ? value.contexts as string[] : null}), source: { kind: "tasknotes-api", taskId: taskPath, readAt: new Date().toISOString() } };
}
