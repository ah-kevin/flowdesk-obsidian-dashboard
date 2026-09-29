export interface TaskNotesAuth {
  env: NodeJS.ProcessEnv;
  token: string;
}

/** Parse data only. Never evaluate shell expressions or expose JSON parser excerpts. */
export function parseTaskNotesEnvironment(configuration: string): Record<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(configuration.trim() || "{}");
  } catch {
    throw new Error("环境变量 JSON 格式无效，请填写键值对象，值使用字符串。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("环境变量 JSON 必须是对象，值使用字符串。");
  }
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof item !== "string" || item.includes("\0")) {
      throw new Error("环境变量 JSON 的键名必须是有效变量名，值必须是不含空字符的字符串。");
    }
  }
  return value as Record<string, string>;
}

export function resolveTaskNotesAuth(
  configuration: string,
  inherited: NodeJS.ProcessEnv = process.env
): TaskNotesAuth {
  const configured = parseTaskNotesEnvironment(configuration);
  // Add JSON variables to a copy of the current execution environment.
  const env = { ...inherited, ...configured };
  for (const key of ["TASKNOTES_API_TOKEN", "TASKNOTES_AUTH_TOKEN"]) {
    if (env[key] !== undefined) env[key] = env[key]!.trim();
    if (/[\r\n]/.test(env[key] || "")) {
      throw new Error("TaskNotes token 格式无效，不能包含换行符。");
    }
  }
  const token = env.TASKNOTES_API_TOKEN || env.TASKNOTES_AUTH_TOKEN || "";
  return { env, token };
}

export function resolveTaskNotesApiUrl(configuredUrl: string, env: NodeJS.ProcessEnv): string {
  return (configuredUrl.trim() || env.TASKNOTES_API_URL?.trim() || "http://127.0.0.1:18090").replace(/\/+$/, "");
}

export function formatTaskNotesAuthError(message: string, token: string): string {
  if (/TaskNotes API 401\b/.test(message)) {
    return token
      ? "TaskNotes API 401：已发送 token，但服务拒绝鉴权，请检查 token 是否正确或已失效。"
      : "TaskNotes API 401：token 未配置，请在插件的环境变量 JSON 中填写 TASKNOTES_API_TOKEN。";
  }
  if (!token) return message;
  // Redact the encoded form first, before replacing any literal quote/backslash.
  for (const value of [JSON.stringify(token).slice(1, -1), token]) {
    message = message.split(value).join("[REDACTED]");
  }
  return message;
}

/** Diagnostic messages may include upstream response text; sanitize before rendering/copying. */
export function sanitizeTaskNotesSnapshot<T>(snapshot: T, token: string): T {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = (key === "message" || key === "error") && typeof item === "string"
        ? formatTaskNotesAuthError(item, token)
        : visit(item);
    }
    return result;
  }
  return visit(snapshot) as T;
}
