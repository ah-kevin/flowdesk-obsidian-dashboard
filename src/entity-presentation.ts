import type { PresentationTone } from "./dashboard-presentation";

/** Display translation only; this never changes producer lifecycle or acceptance. */
export function formatEntityStatus(kind: "task" | "case", raw: string | null): {label: string; raw: string; tone: PresentationTone} {
  const value = raw ?? "";
  const token = value.trim().toLowerCase();
  const shared: Record<string, [string, PresentationTone]> = {
    done: ["已完成", "healthy"],
    "in-progress": ["进行中", "running"], running: ["进行中", "running"],
    open: ["待开始", "muted"], blocked: ["已阻塞", "error"],
    error: ["异常", "error"], unknown: ["未知状态", "warning"],
  };
  const cases: Record<string, [string, PresentationTone]> = {
    active: ["进行中", "running"], parked: ["已停靠", "muted"],
    complete: ["已完成", "healthy"], completed: ["已完成", "healthy"], closed: ["已关闭", "muted"],
  };
  const translated = kind === "case" ? cases[token] ?? shared[token] : shared[token];
  if (!token) return {label: "未记录", raw: value, tone: "muted"};
  return {label: translated?.[0] ?? `${value}（未知状态）`, raw: value, tone: translated?.[1] ?? "warning"};
}

export function groupTaskRows<T extends {status: string; isBlocked: boolean; completed: boolean | null; archived: boolean}>(rows: T[]): {current: T[]; history: T[]} {
  const current: T[] = []; const history: T[] = [];
  for (const row of rows) (row.completed === true || row.archived ? history : current).push(row);
  const rank = (row: T) => ["in-progress", "running"].includes(row.status.trim().toLowerCase()) ? 0 : row.isBlocked ? 1 : 2;
  // Explicit index tie-break keeps producer order even on older embedded runtimes.
  return {current: current.map((row,index)=>({row,index})).sort((a,b)=>rank(a.row)-rank(b.row)||a.index-b.index).map(x=>x.row), history};
}

export function formatReferenceLabel(target: string): string {
  const link = target.trim().replace(/^\[\[/, "").replace(/\]\]$/, "");
  const alias = link.indexOf("|");
  if (alias >= 0 && link.slice(alias + 1).trim()) return link.slice(alias + 1).trim();
  const path = link.split("#")[0].replace(/\\/g,"/");
  return (path.split("/").pop() || path).replace(/\.md$/i, "") || target;
}
