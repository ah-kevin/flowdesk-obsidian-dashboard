import { isTaskPath, TrailingRefreshScheduler } from "./dashboard-state";
import {
  createWorkCaseViewModel,
  WorkCaseSnapshotCompatibilityError,
  type WorkCaseViewModel,
} from "./work-case-model";
import type {
  ViewAdapter,
  ViewAdapterSelection,
  ViewShellController,
} from "./view-shell";

export interface WorkCaseRenderState {
  casePath: string;
  model: WorkCaseViewModel | null;
  loadedAt: string;
  staleReason: string;
  error: string;
  loading: boolean;
}

export interface WorkCaseAdapterDependencies {
  shell(): ViewShellController;
  loadSnapshot(casePath: string, signal: AbortSignal): Promise<unknown>;
  render(container: HTMLElement, state: WorkCaseRenderState): void;
  requestRender(): void;
  nowLabel(): string;
}

interface WorkCaseDisplayState {
  casePath: string;
  model: WorkCaseViewModel;
  loadedAt: string;
  staleReason: string;
}

export class WorkCaseAdapter implements ViewAdapter {
  readonly kind = "case";
  private selection: ViewAdapterSelection | null = null;
  private displayState: WorkCaseDisplayState | null = null;
  private error = "";
  private loading = false;
  private controller: AbortController | null = null;
  private requestGeneration = 0;
  private dirtyReason = "";
  private readonly refreshScheduler: TrailingRefreshScheduler;

  constructor(private readonly dependencies: WorkCaseAdapterDependencies) {
    this.refreshScheduler = new TrailingRefreshScheduler(() => { void this.refresh(); }, 500);
  }

  async activate(selection: ViewAdapterSelection): Promise<void> {
    if (selection.adapterKind !== this.kind) {
      throw new Error(`Work Case Adapter 无法处理：${selection.adapterKind}`);
    }
    this.refreshScheduler.cancel();
    const generation = ++this.requestGeneration;
    const sameCase = this.selection?.resourcePath === selection.resourcePath;
    this.selection = selection;
    if (!sameCase) {
      this.displayState = null;
      this.error = "";
      this.dirtyReason = "";
    }
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const isCurrent = () => this.requestGeneration === generation && this.controller === controller && this.selection === selection && this.dependencies.shell().isCurrent(selection);
    this.loading = true;
    this.error = "";
    this.dependencies.requestRender();
    try {
      const snapshot = await this.dependencies.loadSnapshot(
        selection.resourcePath,
        controller.signal
      );
      if (!isCurrent()) return;
      const model = createWorkCaseViewModel(snapshot, selection.resourcePath);
      this.dirtyReason = "";
      this.displayState = {
        casePath: selection.resourcePath,
        model,
        loadedAt: this.dependencies.nowLabel(),
        staleReason: "",
      };
    } catch (error) {
      if (!isCurrent()) return;
      this.error = formatWorkCaseError(error);
      if (error instanceof WorkCaseSnapshotCompatibilityError) {
        this.displayState = null;
      } else if (sameCase && this.displayState?.casePath === selection.resourcePath) {
        this.displayState = {
          ...this.displayState,
          staleReason: this.error,
        };
      } else {
        this.displayState = null;
      }
    } finally {
      if (isCurrent()) {
        this.controller = null;
        this.loading = false;
        this.dependencies.requestRender();
      }
    }
  }

  deactivate(): void {
    ++this.requestGeneration;
    this.refreshScheduler.cancel();
    this.controller?.abort();
    this.controller = null;
    this.selection = null;
    this.displayState = null;
    this.error = "";
    this.loading = false;
    this.dirtyReason = "";
  }

  shouldReactivate(selection: ViewAdapterSelection): boolean {
    const state = this.getRenderState();
    return (
      this.selection?.revision === selection.revision &&
      state !== null &&
      state.model === null &&
      !state.loading
    );
  }

  async refresh(): Promise<void> {
    if (this.selection) await this.activate(this.selection);
  }

  scheduleRefresh(): void {
    if (!this.selection) return;
    // Invalidate in-flight loads now, before the trailing refresh starts.
    ++this.requestGeneration;
    this.controller?.abort();
    this.controller = null;
    this.loading = this.displayState === null;
    this.dirtyReason = "关联资料发生变化，等待刷新。";
    if (this.displayState) this.displayState = {...this.displayState, staleReason: this.dirtyReason};
    this.dependencies.requestRender();
    this.refreshScheduler.schedule();
  }

  observesFile(filePath: string): boolean {
    if (!this.selection) return false;
    return this.selection.resourcePath === filePath || isTaskPath(filePath) ||
      Boolean(this.displayState?.model.tasks.items.some(task => task.id === filePath));
  }

  render(container: HTMLElement): void {
    const state = this.getRenderState();
    if (state) this.dependencies.render(container, state);
  }

  getRenderState(): WorkCaseRenderState | null {
    const casePath = this.selection?.resourcePath;
    if (!casePath) return null;
    const display = this.displayState?.casePath === casePath ? this.displayState : null;
    return {
      casePath,
      model: display?.model ?? null,
      loadedAt: display?.loadedAt ?? "",
      staleReason: display?.staleReason || this.dirtyReason,
      error: this.error,
      loading: this.loading,
    };
  }
}

function formatWorkCaseError(error: unknown): string {
  if (error instanceof WorkCaseSnapshotCompatibilityError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  return `Work Case snapshot 读取失败：${message}`;
}
