import type { CaseContentObservation } from "./case-content";
import type { CoreResolution } from "./core-resolution";
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
  caseContent?: CaseContentObservation | null;
  coreInfo?: CoreResolution | null;
  model: WorkCaseViewModel | null;
  loadedAt: string;
  staleReason: string;
  error: string;
  loading: boolean;
}

export interface WorkCaseAdapterDependencies {
  shell(): ViewShellController;
  loadSnapshot(casePath: string, signal: AbortSignal): Promise<unknown>;
  loadCaseContent?(casePath: string, signal: AbortSignal): Promise<CaseContentObservation>;
  coreForSnapshot?(snapshot: unknown): CoreResolution | null;
  render(container: HTMLElement, state: WorkCaseRenderState): void;
  requestRender(): void;
  nowLabel(): string;
}

interface WorkCaseDisplayState {
  coreInfo: CoreResolution | null;
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
  private caseContent: CaseContentObservation | null = null;
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
      this.caseContent = null;
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
      const [snapshotResult, contentResult] = await Promise.allSettled([
        this.dependencies.loadSnapshot(selection.resourcePath, controller.signal),
        this.dependencies.loadCaseContent?.(selection.resourcePath, controller.signal) ?? Promise.resolve(null),
      ]);
      if (!isCurrent()) return;
      this.caseContent = contentResult.status === "fulfilled" ? contentResult.value : {casePath:selection.resourcePath,details:"",readAt:"",source:"vault-cached-read",error:contentResult.reason instanceof Error ? contentResult.reason.message : String(contentResult.reason),sections:[]};
      if (this.caseContent && this.caseContent.casePath !== selection.resourcePath) this.caseContent = {casePath:selection.resourcePath,details:"",readAt:"",source:"vault-cached-read",error:"Case独立读取来源身份错误",sections:[]};
      if (snapshotResult.status === "rejected") throw snapshotResult.reason;
      const snapshot = snapshotResult.value;
      const model = createWorkCaseViewModel(snapshot, selection.resourcePath);
      this.dirtyReason = "";
      this.displayState = {
        coreInfo: this.dependencies.coreForSnapshot?.(snapshot) ?? null,
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
    this.caseContent = null;
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
      caseContent: this.caseContent,
      coreInfo: display?.coreInfo ?? null,
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
