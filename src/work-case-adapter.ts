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

  constructor(private readonly dependencies: WorkCaseAdapterDependencies) {}

  async activate(selection: ViewAdapterSelection): Promise<void> {
    if (selection.adapterKind !== this.kind) {
      throw new Error(`Work Case Adapter 无法处理：${selection.adapterKind}`);
    }
    const sameCase = this.selection?.resourcePath === selection.resourcePath;
    this.selection = selection;
    if (!sameCase) {
      this.displayState = null;
      this.error = "";
    }
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading = true;
    this.error = "";
    this.dependencies.requestRender();
    try {
      const snapshot = await this.dependencies.loadSnapshot(
        selection.resourcePath,
        controller.signal
      );
      if (!this.dependencies.shell().isCurrent(selection)) return;
      const model = createWorkCaseViewModel(snapshot, selection.resourcePath);
      this.displayState = {
        casePath: selection.resourcePath,
        model,
        loadedAt: this.dependencies.nowLabel(),
        staleReason: "",
      };
    } catch (error) {
      if (!this.dependencies.shell().isCurrent(selection)) return;
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
      if (this.controller === controller) this.controller = null;
      if (this.dependencies.shell().isCurrent(selection)) {
        this.loading = false;
        this.dependencies.requestRender();
      }
    }
  }

  deactivate(): void {
    this.controller?.abort();
    this.controller = null;
    this.selection = null;
    this.displayState = null;
    this.error = "";
    this.loading = false;
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

  observesFile(filePath: string): boolean {
    return this.selection?.resourcePath === filePath;
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
      staleReason: display?.staleReason ?? "",
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
