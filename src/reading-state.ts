interface ReadingState { open: Map<string,boolean>; scroll: number; nested:Map<string,{scroll:number;items:string|null}>; focus: string | null }
const get = (el:HTMLElement,key:string) => el.getAttribute?.(key) ?? null;
const set = (el:HTMLElement,key:string,value:string) => {
  if(el.setAttribute)el.setAttribute(key,value);else (el as any).setAttr?.(key,value);
};
function disclosures(container:HTMLElement): Array<[string,HTMLDetailsElement]> {
  const occurrences=new Map<string,number>();
  return Array.from(container.querySelectorAll<HTMLDetailsElement>("details")).filter(el=>get(el,"data-external-disclosure")!=="true").map(el=>{
    const base=get(el,"data-disclosure-key") || Array.from(el.querySelectorAll("summary"))[0]?.textContent || "details";
    const n=occurrences.get(base)??0;occurrences.set(base,n+1);return [`${base}:${n}`,el];
  });
}
function focusTargets(container:HTMLElement):HTMLElement[] {
  const targets=["button","a","summary","input","select","textarea"].flatMap(tag=>Array.from(container.querySelectorAll<HTMLElement>(tag)));
  const occurrences=new Map<string,number>();
  for(const el of targets) {
    const base=get(el,"aria-label")||get(el,"data-focus-key")||`${el.tagName||"element"}:${(el.textContent||"").slice(0,180)}`;
    const n=occurrences.get(base)??0;occurrences.set(base,n+1);set(el,"data-reading-focus",`${base}:${n}`);
  }
  return targets;
}
function scrollTargets(container:HTMLElement):Array<[string,HTMLElement]> {
  return Array.from(container.querySelectorAll<HTMLElement>("div")).filter(el=>get(el,"data-reading-scroll-key")).map(el=>[get(el,"data-reading-scroll-key")!,el]);
}
/** UI choices only. No snapshots, task facts or request lifecycle live in this bounded cache. */
export class ReadingStateCache {
  private readonly entries=new Map<string,ReadingState>();
  constructor(private readonly capacity=20) {}
  snapshot(): unknown[] {
    return [...this.entries].map(([key,state])=>({key,open:[...state.open],scroll:state.scroll,nested:[...state.nested].map(([id,value])=>[id,{...value}]),focus:state.focus}));
  }
  restoreSnapshot(value:unknown):void {
    this.clear();if(!Array.isArray(value))return;
    for(const item of value.slice(-this.capacity)) {
      if(!item||typeof item!=="object"||typeof item.key!=="string"||!item.key||item.key.length>4096)continue;
      const open=new Map<string,boolean>(),nested=new Map<string,{scroll:number;items:string|null}>();
      if(Array.isArray(item.open))for(const pair of item.open.slice(0,1000))if(Array.isArray(pair)&&typeof pair[0]==="string"&&typeof pair[1]==="boolean")open.set(pair[0],pair[1]);
      if(Array.isArray(item.nested))for(const pair of item.nested.slice(0,1000))if(Array.isArray(pair)&&typeof pair[0]==="string"&&pair[1]&&typeof pair[1]==="object")nested.set(pair[0],{scroll:Number.isFinite(pair[1].scroll)?Math.max(0,pair[1].scroll):0,items:typeof pair[1].items==="string"?pair[1].items:null});
      this.entries.set(item.key,{open,nested,scroll:Number.isFinite(item.scroll)?Math.max(0,item.scroll):0,focus:typeof item.focus==="string"?item.focus:null});
    }
  }
  capture(key:string,container:HTMLElement,options:{position?:boolean}={}):void {
    if(!key)return;
    const list=disclosures(container);if(!list.length)return;
    const previous=this.entries.get(key);const state:ReadingState={open:previous?.open??new Map(),scroll:options.position===false?(previous?.scroll??0):(container.scrollTop||0),nested:previous?.nested??new Map(),focus:previous?.focus??null};
    for(const [id,el] of list)state.open.set(id,el.open);
    focusTargets(container);const active=container.ownerDocument?.activeElement as HTMLElement|null;
    if(options.position!==false){
      for(const [id,element] of scrollTargets(container))state.nested.set(id,{scroll:element.scrollTop||0,items:get(element,"data-reading-items")});
      if(active&&container.contains(active))state.focus=get(active,"data-reading-focus");
      else if(active&&active!==container.ownerDocument?.body)state.focus=null;
    }
    this.entries.delete(key);this.entries.set(key,state);
    while(this.entries.size>this.capacity)this.entries.delete(this.entries.keys().next().value!);
  }
  restore(key:string,container:HTMLElement,options:{disclosures?:boolean;position?:boolean}={}):void {
    const state=this.entries.get(key);
    if(options.disclosures!==false){
      for(const [id,el] of scrollTargets(container)){const items=state?.nested.get(id)?.items;if(items)set(el,"data-reading-items",items);}
      for(const [id,el] of disclosures(container))if(state?.open.has(id)){el.open=state.open.get(id)!;el.dispatchEvent?.(new Event("flowdesk-reading-restore"));}
    }
    const targets=focusTargets(container);
    if(options.position===false)return;
    container.scrollTop=state?.scroll??0;
    for(const [id,element] of scrollTargets(container))element.scrollTop=state?.nested.get(id)?.scroll??0;
    const active=container.ownerDocument?.activeElement;
    if(state?.focus&&(!active||active===container.ownerDocument?.body||container.contains(active))) {
      const target=targets.find(el=>get(el,"data-reading-focus")===state.focus);
      if(target && !(target as HTMLButtonElement).disabled && (!target.getClientRects || target.getClientRects().length))target.focus?.({preventScroll:true});
    }
  }
  clear():void {this.entries.clear();}
}
