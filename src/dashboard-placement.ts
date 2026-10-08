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

interface PlacementLeaf { setViewState(state: {type:string;active:boolean;state:Record<string,unknown>}): Promise<void>; setPinned(pinned:boolean):void; detach(): void }
interface PlacementWorkspace<TLeaf> { getLeaf(type: "tab"): TLeaf; revealLeaf(leaf: TLeaf): Promise<void> | void }

/** Open a separate reader; only its newly created leaf is owned by this operation. */
export async function openDashboardInMain<TLeaf extends PlacementLeaf>(workspace: PlacementWorkspace<TLeaf>, type: string, state: Record<string, unknown>, validate:(leaf:TLeaf)=>void): Promise<TLeaf> {
  const destination=workspace.getLeaf("tab");
  try {
    await destination.setViewState({type,active:true,state:{...state,placement:"main"}});
    destination.setPinned(true);
    await workspace.revealLeaf(destination);
    // Obsidian can resolve setViewState even when View.setState logged an error.
    validate(destination);
  } catch(error) {destination.detach();throw error;}
  return destination;
}
