import type { EvidenceItem } from "./snapshot-model";

export type EvidenceDisplayState = "blocked" | "error" | "done";

export function getEvidenceDisplayItems(item?: EvidenceItem): string[] {
  if (Array.isArray(item?.display_items)) {
    return item.display_items;
  }
  return item?.items ?? [];
}

export function getEvidenceDisplayState(item?: EvidenceItem): EvidenceDisplayState {
  if (!item?.exists) {
    return "blocked";
  }
  if (item.valid === false) {
    return "error";
  }
  return "done";
}

export function formatEvidenceSummary(label: string, item?: EvidenceItem): string {
  if (!item?.exists) {
    return `${label}：缺失`;
  }

  const itemCount = item.items?.length ?? getEvidenceDisplayItems(item).length;
  if (item.valid === false) {
    return `${label}：存在但无效（${itemCount} 项）`;
  }
  if (item.valid === true) {
    return `${label}：有效（${itemCount} 项）`;
  }
  return `${label}：已提供（${itemCount} 项）`;
}
