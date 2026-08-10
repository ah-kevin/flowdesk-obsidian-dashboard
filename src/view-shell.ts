import { isTaskPath } from "./dashboard-state";

export type ActiveViewContext = {
  kind: string;
  resourcePath: string;
};

export type ViewShellContext =
  | ActiveViewContext
  | { kind: "empty" }
  | {
      kind: "unsupported";
      activePath: string;
      previousResourcePath: string;
    };

export interface ViewAdapterSelection {
  adapterKind: string;
  resourcePath: string;
  revision: number;
}

export interface ViewAdapter {
  readonly kind: string;
  activate(selection: ViewAdapterSelection): Promise<void> | void;
  deactivate(): void;
  shouldReactivate?(selection: ViewAdapterSelection): boolean;
}

export interface SelectViewOptions {
  force?: boolean;
}

export function resolveViewShellContext(
  activePath: string | null,
  previousResourcePath: string,
  frontmatterType = ""
): ViewShellContext {
  if (!activePath) return { kind: "empty" };
  if (isTaskPath(activePath)) {
    return { kind: "task", resourcePath: activePath };
  }
  if (frontmatterType === "work-case" || frontmatterType === "session") {
    return { kind: "case", resourcePath: activePath };
  }
  return {
    kind: "unsupported",
    activePath,
    previousResourcePath,
  };
}

/**
 * 无业务语义的 View Shell 生命周期控制器。
 *
 * 它只按 adapter kind / resource path 切换生命周期并生成 request revision；
 * 业务状态、加载错误、缓存和渲染全部由各 adapter 自己持有。
 */
export class ViewShellController {
  private readonly adapters = new Map<string, ViewAdapter>();
  private activeAdapter: ViewAdapter | null = null;
  private revision = 0;
  context: ViewShellContext = { kind: "empty" };

  constructor(adapters: ViewAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.kind)) {
        throw new Error(`View adapter 重复注册：${adapter.kind}`);
      }
      this.adapters.set(adapter.kind, adapter);
    }
  }

  async select(
    context: ViewShellContext,
    options: SelectViewOptions = {}
  ): Promise<void> {
    const nextAdapter = this.resolveAdapter(context);
    const unchanged = sameContext(this.context, context);
    const currentSelection =
      unchanged && nextAdapter && isActiveContext(context)
        ? {
            adapterKind: context.kind,
            resourcePath: context.resourcePath,
            revision: this.revision,
          }
        : null;
    const shouldReactivate = Boolean(
      currentSelection && nextAdapter?.shouldReactivate?.(currentSelection)
    );
    if (unchanged && !options.force && !shouldReactivate) {
      return;
    }

    if (!unchanged) {
      this.revision += 1;
      this.activeAdapter?.deactivate();
      this.activeAdapter = nextAdapter;
      this.context = context;
    }

    if (!nextAdapter || !isActiveContext(context)) {
      return;
    }

    await nextAdapter.activate({
      adapterKind: context.kind,
      resourcePath: context.resourcePath,
      revision: this.revision,
    });
  }

  isCurrent(selection: ViewAdapterSelection): boolean {
    return (
      isActiveContext(this.context) &&
      this.activeAdapter?.kind === selection.adapterKind &&
      this.context.kind === selection.adapterKind &&
      this.context.resourcePath === selection.resourcePath &&
      this.revision === selection.revision
    );
  }

  close(): void {
    this.revision += 1;
    this.activeAdapter?.deactivate();
    this.activeAdapter = null;
    this.context = { kind: "empty" };
  }

  private resolveAdapter(context: ViewShellContext): ViewAdapter | null {
    return isActiveContext(context) ? this.adapters.get(context.kind) ?? null : null;
  }
}

export function isActiveContext(context: ViewShellContext): context is ActiveViewContext {
  return "resourcePath" in context;
}

export function isUnsupportedContext(
  context: ViewShellContext
): context is Extract<ViewShellContext, { activePath: string }> {
  return "activePath" in context;
}

function sameContext(left: ViewShellContext, right: ViewShellContext): boolean {
  if (left.kind !== right.kind) return false;
  if (isActiveContext(left) && isActiveContext(right)) {
    return left.resourcePath === right.resourcePath;
  }
  if (isUnsupportedContext(left) && isUnsupportedContext(right)) {
    return (
      left.activePath === right.activePath &&
      left.previousResourcePath === right.previousResourcePath
    );
  }
  return left.kind === "empty" && right.kind === "empty";
}
