type DashboardKind = "task" | "case";
type LayoutRegion = "full" | "main" | "auxiliary";
interface ActiveLayout {
  wrapper: HTMLElement;
  nodes: HTMLElement[];
  cleanup(): void;
}
const activeLayouts = new WeakMap<HTMLElement, ActiveLayout>();
const wideContentWidth = 960;

/** Move existing sections only when the width crosses a breakpoint. Return the render-lifetime cleanup. */
export function applyDashboardLayout(container: HTMLElement, kind: DashboardKind): () => void {
  const previous = activeLayouts.get(container);
  const nodes = previous && previous.wrapper.parentElement === container
    ? [...previous.nodes, ...Array.from(container.children).filter(node => node !== previous.wrapper)] as HTMLElement[]
    : Array.from(container.children) as HTMLElement[];
  previous?.cleanup();
  const focused = container.ownerDocument?.activeElement as HTMLElement | null;
  const scrollTop = container.scrollTop, scrollLeft = container.scrollLeft;
  const wrapper = container.createDiv({ cls: "flowdesk-dashboard-layout" });
  for (const node of nodes) wrapper.appendChild(node);
  previous?.wrapper.remove();
  const hasChildren = kind === "task" && nodes.some(node => node.classList.contains("flowdesk-child-section"));
  const regions = new Map(nodes.map(node => [node, regionFor(node, kind, hasChildren)]));
  for (const node of nodes) node.setAttr("data-layout-region", regions.get(node)!);
  const mainNodes = nodes.filter(node => regions.get(node) === "main");
  const auxiliaryNodes = nodes.filter(node => regions.get(node) === "auxiliary");
  const hasColumns = mainNodes.length > 0 && auxiliaryNodes.length > 0;
  let columns: HTMLElement | null = null;
  let wide: boolean | undefined;
  let disposed = false;
  const preserveInteraction = (focus: HTMLElement | null, top: number, left: number) => {
    if (focus && container.contains(focus) && container.ownerDocument.activeElement !== focus) {
      focus.focus({ preventScroll: true });
    }
    container.scrollTop = top;
    container.scrollLeft = left;
  };
  const updateWidth = (width: number) => {
    if (disposed || wrapper.parentElement !== container) return;
    const nextWide = width >= wideContentWidth;
    if (nextWide === wide) return;
    const currentFocus = container.ownerDocument.activeElement as HTMLElement | null;
    const top = container.scrollTop, left = container.scrollLeft;
    wide = nextWide;
    if (wide) wrapper.addClass("is-wide");
    else wrapper.removeClass("is-wide");
    if (wide && hasColumns) {
      wrapper.addClass("has-auxiliary");
      columns = wrapper.createDiv({ cls: "flowdesk-dashboard-columns" });
      const main = columns.createDiv({ cls: "flowdesk-dashboard-main" });
      const aside = columns.createEl("aside", { cls: "flowdesk-dashboard-aside", attr: { "aria-label": "辅助资料" } });
      for (const node of nodes.filter(node => regions.get(node) === "full")) wrapper.appendChild(node);
      wrapper.appendChild(columns);
      for (const node of mainNodes) main.appendChild(node);
      for (const node of auxiliaryNodes) aside.appendChild(node);
    } else {
      wrapper.removeClass("has-auxiliary");
      for (const node of nodes) wrapper.appendChild(node);
      columns?.remove();
      columns = null;
    }
    preserveInteraction(currentFocus, top, left);
  };
  const view = container.ownerDocument.defaultView;
  const padding = view?.getComputedStyle(container);
  updateWidth(container.clientWidth - (parseFloat(padding?.paddingLeft || "0") || 0) - (parseFloat(padding?.paddingRight || "0") || 0));
  preserveInteraction(focused, scrollTop, scrollLeft);
  const Observer = (view as (Window & typeof globalThis) | null)?.ResizeObserver ?? globalThis.ResizeObserver;
  const observer = typeof Observer === "function" ? new Observer(entries => {
    if (entries[0]) updateWidth(entries[0].contentRect.width);
  }) : null;
  observer?.observe(container);
  const state: ActiveLayout = {
    wrapper, nodes,
    cleanup: () => {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      // Keep the source sequence for reapplication to this same rendered content.
      // The weak key releases it with the host container; the observer is already disconnected.
    },
  };
  activeLayouts.set(container, state);
  return state.cleanup;
}

function regionFor(node: HTMLElement, kind: DashboardKind, hasChildren: boolean): LayoutRegion {
  if (kind === "task") {
    if (node.classList.contains("flowdesk-child-section")) return "auxiliary";
    if (node.classList.contains("flowdesk-task-technical")) return hasChildren ? "auxiliary" : "main";
    if (["flowdesk-task-overview", "flowdesk-reading-navigation", "flowdesk-contract-summary", "flowdesk-task-process"].some(name => node.classList.contains(name))) return "main";
  } else {
    if (["flowdesk-case-current", "flowdesk-case-recent-progress", "flowdesk-case-record"].some(name => node.classList.contains(name))) return "main";
    if (["flowdesk-case-tasks", "flowdesk-case-related", "flowdesk-case-recovery", "flowdesk-case-diagnostics"].some(name => node.classList.contains(name))) return "auxiliary";
  }
  return "full";
}
