export type DashboardContext =
  | { kind: "task"; taskPath: string }
  | { kind: "non-task"; activePath: string; previousTaskPath: string }
  | { kind: "empty" };

export interface SnapshotRequestIdentity {
  taskPath: string;
  selectionRevision: number;
}

export function isTaskPath(filePath: string): boolean {
  return (
    filePath.endsWith(".md") &&
    (filePath.startsWith("Tasks/") || filePath.startsWith("TaskNotes/"))
  );
}

export function resolveDashboardContext(
  activePath: string | null,
  previousTaskPath: string
): DashboardContext {
  if (!activePath) {
    return { kind: "empty" };
  }
  if (isTaskPath(activePath)) {
    return { kind: "task", taskPath: activePath };
  }
  return { kind: "non-task", activePath, previousTaskPath };
}

export function isCurrentSnapshotRequest(
  request: SnapshotRequestIdentity,
  context: DashboardContext,
  selectionRevision: number
): boolean {
  return (
    context.kind === "task" &&
    request.taskPath === context.taskPath &&
    request.selectionRevision === selectionRevision
  );
}
