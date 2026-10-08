export type DashboardPlacement = "main" | "sidebar";
export interface NavigationWorkspace<TLeaf> {
  getLeaf(type: false | "tab"): TLeaf;
  getMostRecentLeaf?(root?: unknown): TLeaf | null;
  rootSplit?: unknown;
  iterateRootLeaves?(visit: (leaf: TLeaf) => void): void;
}
interface NavigableLeaf { view?: { getViewType?(): string }; getViewState?(): { pinned?: boolean;type?:string } }

/** A normal file open can reuse a content tab, never the Dashboard itself. */
export function selectContentLeaf<TLeaf extends NavigableLeaf>(workspace: NavigationWorkspace<TLeaf>, dashboardType: string, newTab = false): TLeaf {
  if(newTab)return workspace.getLeaf("tab");
  const reusable=(leaf:TLeaf|null|undefined):leaf is TLeaf=>!!leaf&&(leaf.getViewState?.().type??leaf.view?.getViewType?.())!==dashboardType&&!leaf.getViewState?.().pinned;
  const candidate=workspace.getLeaf(false);
  if(reusable(candidate))return candidate;
  const recent=workspace.getMostRecentLeaf?.(workspace.rootSplit);
  if(reusable(recent))return recent;
  let existing:TLeaf|null=null;
  workspace.iterateRootLeaves?.(leaf=>{if(!existing&&reusable(leaf))existing=leaf;});
  return existing??workspace.getLeaf("tab");
}

interface PlacementLeaf { setViewState(state: {type:string;active:boolean;pinned:boolean;state:Record<string,unknown>}): Promise<void>; detach(): void }
interface PlacementWorkspace<TLeaf> { getLeaf(type: "tab"): TLeaf; getRightLeaf(split: boolean): TLeaf | null; revealLeaf(leaf: TLeaf): Promise<void> | void }

/** Use public Workspace APIs; retain the original view if handoff fails. */
export async function placeDashboard<TLeaf extends PlacementLeaf>(workspace: PlacementWorkspace<TLeaf>, source: TLeaf, type: string, state: Record<string, unknown>, placement: DashboardPlacement, beforeDetach?:()=>void): Promise<TLeaf> {
  const destination=placement==="main"?workspace.getLeaf("tab"):workspace.getRightLeaf(false);
  if(!destination||destination===source)throw new Error("未能创建 Dashboard 阅读位置。");
  try {
    await destination.setViewState({type,active:true,pinned:placement==="main",state});
    beforeDetach?.();
    await workspace.revealLeaf(destination);
    beforeDetach?.();
  } catch(error) {destination.detach();throw error;}
  source.detach();
  return destination;
}
