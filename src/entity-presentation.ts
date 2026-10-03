import { parseReferenceText } from "./reference-text";
import type { PresentationTone } from "./dashboard-presentation";

/** Display translation only; this never changes producer lifecycle or acceptance. */
export function formatEntityStatus(kind: "task" | "case", raw: string | null, statusIsCompleted?: boolean | null): {label: string; raw: string; tone: PresentationTone} {
  const value = raw ?? "";
  const token = value.trim().toLowerCase();
  const shared: Record<string, [string, PresentationTone]> = {
    done: ["已完成", "healthy"], cancel: ["已取消", "muted"],
    "in-progress": ["进行中", "running"], running: ["进行中", "running"],
    open: ["待开始", "muted"], blocked: ["已阻塞", "error"],
    error: ["异常", "error"], unknown: ["未知状态", "warning"],
  };
  const cases: Record<string, [string, PresentationTone]> = {
    active: ["进行中", "running"], parked: ["已停靠", "muted"],
    complete: ["已完成", "healthy"], completed: ["已完成", "healthy"], closed: ["已关闭", "muted"],
  };
  const sharedStatus = Object.prototype.hasOwnProperty.call(shared, token) ? shared[token] : undefined;
  const caseStatus = Object.prototype.hasOwnProperty.call(cases, token) ? cases[token] : undefined;
  const translated = kind === "case" ? caseStatus ?? sharedStatus : sharedStatus;
  if (!token) return {label: "未记录", raw: value, tone: "muted"};
  if (kind === "task" && statusIsCompleted !== undefined) {
    const ended = statusIsCompleted === true ? "已结束" : statusIsCompleted === false ? "未结束" : "状态未知";
    // Native definitions classify custom values; translated spelling never supplies that fact.
    if (!translated || (token === "done" && statusIsCompleted !== true)) {
      return {label: `${value}（${ended}）`, raw: value, tone: statusIsCompleted === true ? "muted" : "warning"};
    }
  }
  return {label: translated?.[0] ?? `${value}（未知状态）`, raw: value, tone: translated?.[1] ?? "warning"};
}

export function groupTaskRows<T extends {status: string; isBlocked: boolean; completed: boolean | null; archived: boolean}>(rows: T[]): {current: T[]; history: T[]} {
  const current: T[] = []; const history: T[] = [];
  for (const row of rows) (row.completed === true || row.archived ? history : current).push(row);
  const rank = (row: T) => ["in-progress", "running"].includes(row.status.trim().toLowerCase()) ? 0 : row.isBlocked ? 1 : 2;
  // Explicit index tie-break keeps producer order even on older embedded runtimes.
  return {current: current.map((row,index)=>({row,index})).sort((a,b)=>rank(a.row)-rank(b.row)||a.index-b.index).map(x=>x.row), history};
}

export function formatReferenceLabel(raw: string): string {
  const parsed = parseReferenceText(raw);
  if (parsed.label) return parsed.label;
  const target = parsed.target.split("#")[0].replace(/\\/g,"/");
  return (target.split("/").pop() || target).replace(/\.md$/i, "") || raw;
}
