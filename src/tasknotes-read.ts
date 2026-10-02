import { formatTaskNotesAuthError, type TaskNotesAuth } from "./tasknotes-auth";

export interface TaskDetailsRead {
  id: string; details: string;
  source: { kind: "tasknotes-api"; taskId: string; readAt: string };
}
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export async function readTaskDetails({taskPath,apiUrl,auth,signal}: {
  taskPath: string; apiUrl: string; auth: TaskNotesAuth; signal: AbortSignal;
}): Promise<TaskDetailsRead> {
  const fail = (message: string, code = "tasknotes_read_invalid"): never => {
    throw Object.assign(new Error(formatTaskNotesAuthError(message, auth.token)), { code });
  };
  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/tasks/${encodeURIComponent(taskPath)}`, {
      method: "GET", headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {}, signal,
      redirect: "error",
    });
  } catch (error) { return fail(`TaskNotes 原文读取失败：${error instanceof Error ? error.message : String(error)}`); }
  const raw = await response.text();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { if (response.ok) return fail("TaskNotes 原文响应不是有效 JSON"); }
  if (!response.ok) {
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
  return { id: taskPath, details: value.details, source: { kind: "tasknotes-api", taskId: taskPath, readAt: new Date().toISOString() } };
}
