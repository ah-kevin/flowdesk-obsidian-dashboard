/** Keep the control anchored while switching between excerpts and a bounded reader. */
export function bindProgressDisclosure(details:HTMLDetailsElement,summary:HTMLElement,recent:HTMLElement,full:HTMLElement,count:number,options:{signal?:AbortSignal;ensureHistory():Promise<void>|void;onChange?(expanded:boolean):void}):void {
  let expanded=details.open,animation:Animation|null=null,version=0;
  const window=details.ownerDocument?.defaultView;
  const clear=()=>{
    animation?.cancel();animation=null;
    for(const element of [recent,full]){element.style.height="";element.style.maxHeight="";element.style.overflow="";}
  };
  const change=(next:boolean,motion:boolean)=>{
    if(options.signal?.aborted)return;
    const revision=++version;
    const from=(expanded?full:recent).getBoundingClientRect?.().height??0;
    clear();expanded=next;details.open=next;recent.hidden=next;
    const ready=next?options.ensureHistory():undefined;
    options.onChange?.(next);
    summary.setText(`${next?"收起全部":"查看全部"}进度记录（${count} 条）`);
    if(!motion||!from||!window||typeof full.animate!=="function"||window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return;
    const target=next?full:recent;
    const collapsedHeight=recent.scrollHeight;
    target.style.maxHeight="none";target.style.height=`${from}px`;target.style.overflow=next?"auto":"hidden";
    const start=()=>{
      if(revision!==version||options.signal?.aborted)return;
      target.style.height="";
      const height=next?Math.min(target.scrollHeight,window.innerHeight*.6,520):collapsedHeight;
      target.style.height=`${from}px`;
      const current=target.animate([{height:`${from}px`,opacity:.65},{height:`${height}px`,opacity:1}],{duration:200,easing:"cubic-bezier(.2, 0, 0, 1)"});
      animation=current;current.onfinish=()=>{if(animation===current)clear();};
    };
    if(ready)void ready.then(start,start);else start();
  };
  summary.setAttr("data-focus-key","progress-history-toggle");
  summary.addEventListener("click",event=>{event.preventDefault();change(!expanded,true);});
  // Public details state is also restored by the resource reading cache, without motion.
  details.addEventListener("toggle",()=>{if(details.open!==expanded)change(details.open,false);});
  details.addEventListener("flowdesk-reading-restore",()=>change(details.open,false));
  options.signal?.addEventListener("abort",()=>{version++;clear();},{once:true});
  recent.hidden=expanded;
}
