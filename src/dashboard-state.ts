export type DashboardContext =
  | { kind: "task"; taskPath: string }
  | { kind: "non-task"; activePath: string; previousTaskPath: string }
  | { kind: "empty" };

export interface SnapshotRequestIdentity {
  taskPath: string;
  selectionRevision: number;
}

export interface RefreshDisplayState<TSnapshot> {
  taskPath: string;
  snapshot: TSnapshot;
  loadedAt: string;
  staleReason: string;
}

interface SnapshotEnvelope {
  snapshot_schema_version?: unknown;
  snapshot_model?: unknown;
  source_task_id?: unknown;
}

interface ObservedTaskSnapshot {
  current_task?: { id?: string };
  parent?: { id?: string } | null;
  children?: Array<{ id?: string }>;
}

type ScheduleTimer = (callback: () => void, delayMs: number) => unknown;
type CancelTimer = (handle: unknown) => void;

export function registerInitialDashboardSync(
  registerLayoutReady: (callback: () => void) => void,
  sync: () => void
): () => void {
  let active = true;
  registerLayoutReady(() => {
    if (active) {
      sync();
    }
  });
  return () => {
    active = false;
  };
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

export function collectObservedTaskPaths(
  currentTaskPath: string,
  snapshot?: ObservedTaskSnapshot | null
): Set<string> {
  const paths = new Set<string>();
  if (isTaskPath(currentTaskPath)) {
    paths.add(currentTaskPath);
  }
  const observed = [
    snapshot?.current_task,
    snapshot?.parent,
    ...(snapshot?.children ?? []),
  ];
  for (const task of observed) {
    if (task?.id && isTaskPath(task.id)) {
      paths.add(task.id);
    }
  }
  return paths;
}

export function resolveDetailsOpen(
  previousOpen: boolean,
  taskChanged: boolean,
  diagnosticCount: number,
  hasChildren: boolean
): boolean {
  if (!taskChanged) {
    return previousOpen;
  }
  return diagnosticCount > 0 || !hasChildren;
}

export function validateSnapshotEnvelope(
  value: unknown,
  requestedTaskPath: string
): string | null {
  const snapshot =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as SnapshotEnvelope)
      : {};
  if (snapshot.snapshot_schema_version !== 3) {
    return `Snapshot schema 不受支持：需要 3；请求 ${requestedTaskPath}，实际 schema ${formatEnvelopeValue(snapshot.snapshot_schema_version)}。`;
  }
  if (snapshot.snapshot_model !== "task-centric") {
    return `Snapshot model 不受支持：需要 task-centric；请求 ${requestedTaskPath}，实际 model ${formatEnvelopeValue(snapshot.snapshot_model)}。`;
  }
  if (snapshot.source_task_id !== requestedTaskPath) {
    return `Snapshot source identity 不匹配：请求 ${requestedTaskPath}，返回 ${formatEnvelopeValue(snapshot.source_task_id)}。`;
  }
  return null;
}

export function resolveRefreshFailureDisplay<TSnapshot>(
  displayState: RefreshDisplayState<TSnapshot> | null,
  requestedTaskPath: string,
  staleReason: string
): RefreshDisplayState<TSnapshot> | null {
  return displayState?.taskPath === requestedTaskPath
    ? { ...displayState, staleReason }
    : null;
}

function formatEnvelopeValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "未提供";
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
