export type DashboardContext =
  | { kind: "task"; taskPath: string }
  | { kind: "non-task"; activePath: string; previousTaskPath: string }
  | { kind: "empty" };

export interface SnapshotRequestIdentity {
  taskPath: string;
  selectionRevision: number;
}

interface ObservedTaskSnapshot {
  task_graph?: {
    tasks?: Array<{ id?: string }>;
  };
}

type ScheduleTimer = (callback: () => void, delayMs: number) => unknown;
type CancelTimer = (handle: unknown) => void;

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

export function collectObservedTaskPaths(
  parentTaskPath: string,
  snapshot?: ObservedTaskSnapshot | null
): Set<string> {
  const paths = new Set<string>();
  if (isTaskPath(parentTaskPath)) {
    paths.add(parentTaskPath);
  }
  for (const task of snapshot?.task_graph?.tasks ?? []) {
    if (task.id && isTaskPath(task.id)) {
      paths.add(task.id);
    }
  }
  return paths;
}

export function resolveDetailsOpen(
  previousOpen: boolean,
  taskChanged: boolean,
  diagnosticCount: number
): boolean {
  return taskChanged ? diagnosticCount > 0 : previousOpen;
}

export class TrailingRefreshScheduler {
  private timer: unknown | null = null;

  constructor(
    private callback: () => void,
    private delayMs = 500,
    private scheduleTimer: ScheduleTimer = (callback, delayMs) =>
      globalThis.setTimeout(callback, delayMs),
    private cancelTimer: CancelTimer = (handle) =>
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
  ) {}

  schedule(): void {
    this.cancel();
    this.timer = this.scheduleTimer(() => {
      this.timer = null;
      this.callback();
    }, this.delayMs);
  }

  flush(): void {
    this.cancel();
    this.callback();
  }

  cancel(): void {
    if (this.timer === null) {
      return;
    }
    this.cancelTimer(this.timer);
    this.timer = null;
  }
}
