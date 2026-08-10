import {
  collectObservedTaskPaths,
  resolveRefreshFailureDisplay,
  resolveSnapshotEnvelopeFailure,
  SnapshotRequestAbortCoordinator,
  TrailingRefreshScheduler,
} from "./dashboard-state";
import {
  DisclosureStateCache,
  resolveDisclosureState,
  type DisclosureState,
} from "./dashboard-presentation";
import type { ExecutionSnapshot } from "./snapshot-model";
import type {
  ViewAdapter,
  ViewAdapterSelection,
  ViewShellController,
} from "./view-shell";

interface SnapshotDisplayState {
  taskPath: string;
  snapshot: ExecutionSnapshot;
  loadedAt: string;
  staleReason: string;
}

export interface FrozenTaskRenderState {
  taskPath: string;
  snapshot: ExecutionSnapshot | null;
  loadedAt: string;
  staleReason: string;
  error: string;
  loading: boolean;
  disclosureState: DisclosureState;
}

export interface FrozenTaskAdapterDependencies {
  shell(): ViewShellController;
  loadSnapshot(taskPath: string, signal: AbortSignal): Promise<ExecutionSnapshot>;
  render(container: HTMLElement, state: FrozenTaskRenderState): void;
  requestRender(): void;
  nowLabel(): string;
}

/**
 * 现有 Task Dashboard 的冻结边界。
 *
 * 该 adapter 独占 Task request identity、abort、loading、error、cache、
 * disclosure state 与 renderer；不得在这里加入其他业务实体的条件分支。
 */
export class FrozenTaskAdapter implements ViewAdapter {
  readonly kind = "task";
  private selection: ViewAdapterSelection | null = null;
  private displayState: SnapshotDisplayState | null = null;
  private error = "";
  private loading = false;
  private queuedRequest: ViewAdapterSelection | null = null;
  private refreshPromise: Promise<void> | null = null;
  private readonly refreshScheduler: TrailingRefreshScheduler;
  private readonly abortCoordinator = new SnapshotRequestAbortCoordinator();
  private readonly disclosureStateCache = new DisclosureStateCache(20);
  private disclosureState: DisclosureState = resolveDisclosureState(undefined, true);

  constructor(private readonly dependencies: FrozenTaskAdapterDependencies) {
    this.refreshScheduler = new TrailingRefreshScheduler(() => {
      void this.refresh();
    });
  }

  async activate(selection: ViewAdapterSelection): Promise<void> {
    if (selection.adapterKind !== this.kind) {
      throw new Error(`Frozen Task Adapter 无法处理：${selection.adapterKind}`);
    }
    const sameTask = this.selection?.resourcePath === selection.resourcePath;
    this.selection = selection;
    if (!sameTask) {
      this.displayState = null;
      this.error = "";
      this.loading = true;
      this.refreshScheduler.cancel();
      this.abortCoordinator.cancel();
      this.disclosureState = this.disclosureStateCache.forTask(
        selection.resourcePath
      );
      this.dependencies.requestRender();
    }

    this.queuedRequest = selection;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.drainRefreshQueue();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  deactivate(): void {
    this.selection = null;
    this.displayState = null;
    this.queuedRequest = null;
    this.refreshScheduler.cancel();
    this.abortCoordinator.cancel();
    this.loading = false;
    this.error = "";
  }

  shouldReactivate(selection: ViewAdapterSelection): boolean {
    const state = this.getRenderState();
    return (
      this.selection?.revision === selection.revision &&
      this.selection.resourcePath === selection.resourcePath &&
      state !== null &&
      state.snapshot === null &&
      !state.loading
    );
  }

  close(): void {
    this.deactivate();
    this.disclosureStateCache.clear();
  }

  async refresh(): Promise<void> {
    this.refreshScheduler.cancel();
    if (this.selection) {
      await this.activate(this.selection);
    }
  }

  scheduleRefresh(): void {
    if (this.selection) {
      this.refreshScheduler.schedule();
    }
  }

  observesTaskFile(filePath: string): boolean {
    const taskPath = this.selection?.resourcePath;
    return taskPath
      ? collectObservedTaskPaths(taskPath, this.displayState?.snapshot).has(filePath)
      : false;
  }

  render(container: HTMLElement): void {
    const state = this.getRenderState();
    if (state) {
      this.dependencies.render(container, state);
    }
  }

  getRenderState(): FrozenTaskRenderState | null {
    const taskPath = this.selection?.resourcePath;
    if (!taskPath) return null;
    const displayState =
      this.displayState?.taskPath === taskPath ? this.displayState : null;
    return {
      taskPath,
      snapshot: displayState?.snapshot ?? null,
      loadedAt: displayState?.loadedAt ?? "",
      staleReason: displayState?.staleReason ?? "",
      error: this.error,
      loading: this.loading,
      disclosureState: this.disclosureState,
    };
  }

  private async drainRefreshQueue(): Promise<void> {
    while (this.queuedRequest) {
      const request = this.queuedRequest;
      this.queuedRequest = null;
      await this.loadTaskNow(request);
    }
  }

  private async loadTaskNow(request: ViewAdapterSelection): Promise<void> {
    const signal = this.abortCoordinator.begin();
    this.loading = true;
    this.error = "";
    this.dependencies.requestRender();
    try {
      const snapshot = await this.dependencies.loadSnapshot(
        request.resourcePath,
        signal
      );
      if (!this.dependencies.shell().isCurrent(request)) return;
      const envelopeFailure = resolveSnapshotEnvelopeFailure(
        this.displayState,
        request.resourcePath,
        snapshot
      );
      if (envelopeFailure.error) {
        this.error = envelopeFailure.error;
        this.displayState = envelopeFailure.displayState;
        return;
      }
      this.displayState = {
        taskPath: request.resourcePath,
        snapshot,
        loadedAt: this.dependencies.nowLabel(),
        staleReason: "",
      };
    } catch (error) {
      if (!this.dependencies.shell().isCurrent(request)) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.displayState = resolveRefreshFailureDisplay(
        this.displayState,
        request.resourcePath,
        this.error
      );
    } finally {
      this.abortCoordinator.finish(signal);
      if (this.dependencies.shell().isCurrent(request)) {
        this.loading = false;
        this.dependencies.requestRender();
      }
    }
  }
}
