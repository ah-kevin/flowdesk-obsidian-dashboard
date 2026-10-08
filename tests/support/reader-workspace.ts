import { TestElement } from './dom.ts';
/** Only public Workspace/leaf APIs are doubled; registered ReaderView and filesystem reads stay real. */
export function installReaderWorkspace(plugin:any,t:any) {
 const workspace=plugin.app.workspace,originalGetLeaf=workspace.getLeaf.bind(workspace),leaves:any[]=[],revealed:any[]=[];
 const createLeaf=()=>{
  const leaf:any={...originalGetLeaf(),app:plugin.app,contentEl:new TestElement()};let state:any={};
  leaf.getViewState=()=>state;
  leaf.setViewState=async(next:any)=>{
   if(state.type!==next.type){await leaf.view?.onClose?.();const factory=plugin.views.get(next.type);if(!factory)throw Error(`Unregistered view: ${next.type}`);leaf.view=factory(leaf);await leaf.view.onOpen?.();}
   state=next;await leaf.view.setState(next.state,{});
  };
  leaves.push(leaf);return leaf;
 };
 let current=createLeaf();
 workspace.getLeaf=(type:false|'tab')=>{if(type==='tab')current=createLeaf();return current;};
 workspace.revealLeaf=async(leaf:any)=>{revealed.push(leaf);current=leaf;};
 t.after(async()=>{for(const leaf of leaves)await leaf.view?.onClose?.();});
 return {leaves,revealed,get current(){return current;}};
}
