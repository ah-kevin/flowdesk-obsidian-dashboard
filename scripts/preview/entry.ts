import DashboardPlugin from "../../src/main";
import {formatDisplayTime} from "../../src/reading-presentation";
const data=(window as any).__PREVIEW_DATA__,root=document.getElementById("dashboard")!;
const files=new Map<string,{path:string;extension:string;raw:string;details?:string;contexts?:string[]}>();
for(const task of data.tasks)files.set(task.id,{path:task.id,extension:"md",raw:task.fileText,details:task.details,contexts:task.contexts});
files.set(data.case.source.path,{path:data.case.source.path,extension:"md",raw:data.caseText});
files.set("Notes/Docs/本地预览说明.md",{path:"Notes/Docs/本地预览说明.md",extension:"md",raw:"# 本地预览说明\n\n此页使用当前源码的真实 compiled View，数据取材于只读观测。\n不安装、不启动 Core、不写业务 Task。\n"});
let view:any,active=files.get(data.tasks[0].id)!,sourceTextarea:HTMLTextAreaElement|null=null;
let plugin:any,activeLeaf:any,activeMainLeaf:any;const slots:any[]=[];
(window as any).Buffer={alloc:(size:number)=>new Uint8Array(size)};
const makeLeaf=()=>{
 const contentEl=document.createElement("div");contentEl.className="preview-panel view-content";
 const frame=document.createElement("div");frame.className="preview-view-frame";const label=document.createElement("div");label.className="preview-view-label";frame.append(label,contentEl);
 const leaf:any={app:null,contentEl,frame,label,view:null,pinned:false,state:{type:"empty"},getViewState(){return {...this.state,pinned:this.pinned,state:this.view?.getState?.()??this.state.state};},setPinned(value:boolean){this.pinned=value;},getRoot(){return this.state.state?.placement==="main"?app.workspace.rootSplit:app.workspace.rightSplit;},
  async setViewState(state:any){this.state=state;if(this.view)await this.view.onClose?.();this.view=plugin.views.get(state.type)(this);await this.view.onOpen?.();try{await this.view.setState?.(state.state,{});}catch(error){(window as any).previewNotify?.("视图读取失败："+String(error));}},
  async openFile(file:any){await source(file);},detach(){void this.view?.onClose?.();const index=slots.indexOf(this);if(index>=0)slots.splice(index,1);this.frame.remove();}};
 leaf.app=app;slots.push(leaf);return leaf;
};
const events=new Map<string,Function>();
(window as any).previewNotify=(text:string)=>{const notice=document.getElementById("notice")!;notice.textContent=text;notice.hidden=false;setTimeout(()=>{notice.hidden=true;},4500);};
const source=async(file:any)=>{
  active=file;const overlay=document.createElement("div");overlay.className="preview-modal-overlay";const box=document.createElement("div");box.className="preview-modal";
  const title=document.createElement("h2");title.textContent="只读原文样本 · "+file.path;sourceTextarea=document.createElement("textarea");sourceTextarea.className="preview-source";sourceTextarea.readOnly=true;sourceTextarea.value=file.raw;
  const close=document.createElement("button");close.textContent="关闭";close.onclick=()=>{overlay.remove();sourceTextarea=null;};box.append(title,sourceTextarea,close);overlay.appendChild(box);document.body.appendChild(overlay);
  await events.get("file-open")?.(file);
};
const editor={getValue:()=>active.raw,lineCount:()=>active.raw.split("\n").length,setCursor:({line}:any)=>{if(sourceTextarea){const offset=active.raw.split("\n").slice(0,line).join("\n").length+1;sourceTextarea.setSelectionRange(offset,offset);sourceTextarea.scrollTop=line*18;}},scrollIntoView(){},focus(){sourceTextarea?.focus();}};
const app:any={
  vault:{adapter:{getBasePath:()=>data.vaultRoot},on(){},getMarkdownFiles:()=>[...files.values()],getAbstractFileByPath:(id:string)=>files.get(id)??null,cachedRead:async(file:any)=>file.raw},
  metadataCache:{on(){},getFileCache:(file:any)=>({frontmatter:file.path===data.case.source.path?{type:"work-case"}:{}}),getFirstLinkpathDest:(target:string)=>files.get(target)??files.get(target+".md")??null},
  workspace:{rootSplit:{},rightSplit:{},on:(name:string,callback:Function)=>{events.set(name,callback);},onLayoutReady(){},getActiveFile:()=>active,
   getLeavesOfType:(type?:string)=>slots.filter(slot=>!type||slot.state.type===type),
   getLeaf:(type:boolean|string)=>type===false?(activeLeaf??makeLeaf()):makeLeaf(),getRightLeaf:()=>makeLeaf(),getMostRecentLeaf:()=>slots.find(slot=>slot.state.type!=="flowdesk-dashboard-view")??null,
   iterateRootLeaves:(visit:Function)=>slots.forEach(slot=>visit(slot)),setActiveLeaf:(leaf:any)=>{activeLeaf=leaf;},
   async revealLeaf(leaf:any){activeLeaf=leaf;const isDashboard=leaf.state.type==="flowdesk-dashboard-view",isMain=leaf.state.state?.placement==="main";
    if(isDashboard){view=leaf.view;(window as any).__PREVIEW_VIEW__=view;if(isMain)activeMainLeaf=leaf;if(!leaf.contentEl.style.width)leaf.contentEl.style.width=isMain?"840px":"420px";}else leaf.contentEl.style.width="840px";
    const width=document.getElementById("width") as HTMLSelectElement;if([...width.options].some(option=>option.value===String(parseInt(leaf.contentEl.style.width))))width.value=String(parseInt(leaf.contentEl.style.width));
    const sidebar=slots.find(slot=>slot.state.type==="flowdesk-dashboard-view"&&slot.state.state?.placement!=="main"),canvas=document.querySelector(".preview-canvas")!;
    for(const slot of slots){slot.frame.style.display="none";slot.label.textContent=slot.state.state?.placement==="main"?"主区域 · 固定阅读对象":"侧栏 · 跟随当前文件";slot.frame.dataset.active=String(slot===leaf);}
    const primary=isDashboard?activeMainLeaf:leaf;
    if(primary){primary.frame.style.display="";canvas.appendChild(primary.frame);}
    if(sidebar){sidebar.frame.style.display="";canvas.appendChild(sidebar.frame);}
   },
   getActiveViewOfType:(type:any)=>activeLeaf?.view instanceof type?activeLeaf.view:null,
   openLinkText:async(target:string)=>{const file=files.get(target)??files.get(target+".md");if(file)await source(file);else (window as any).previewNotify("该资料没有取材到本地预览；实际插件提供准确原文导航。");},detachLeavesOfType(){}},
};
async function main(){
 plugin=new DashboardPlugin();plugin.app=app;await plugin.onload();
 plugin.loadSnapshot=async(id:string,signal:AbortSignal)=>{if(signal.aborted)throw Error("已取消");const task=data.tasks.find((x:any)=>x.id===id);if(!task)throw Error("本地预览没有此 Task 数据");return structuredClone(task.snapshot);};
 plugin.loadWorkCaseSnapshot=async()=>structuredClone(data.case);
 plugin.loadTaskDetails=async(id:string,signal:AbortSignal)=>{if(signal.aborted)throw Error("已取消");const task=data.tasks.find((x:any)=>x.id===id);if(!task)throw Error("本地预览没有此 Task 原文");return {id,details:task.details,contexts:task.contexts,source:{kind:"tasknotes-api",taskId:id,readAt:data.sampledAt}};};
 plugin.snapshotCoreInfo=()=>data.core;plugin.inspectCore=()=>data.core;
 plugin.copyDashboardCommand=async()=>{(window as any).previewNotify("预览不提供运行命令；实际插件中可复制所用 Core 的 CLI。");};
 const initial=makeLeaf();initial.contentEl.remove();initial.contentEl=root;initial.frame.replaceChildren(initial.label,root);initial.state={type:"flowdesk-dashboard-view"};initial.view=plugin.views.get("flowdesk-dashboard-view")(initial);view=initial.view;activeLeaf=initial;
 const select=async(kind:string)=>{document.querySelectorAll(".preview-tab").forEach(x=>x.classList.toggle("active",(x as HTMLElement).dataset.kind===kind));sourceTextarea=null;
   if(kind==="repository"){const sample=Object.keys(data.repositoryFiles??{})[0];if(sample)await plugin.openRepositoryInWorkspace(sample,{metaKey:true});return;}
   const dashboard=slots.find(slot=>slot.state.type==="flowdesk-dashboard-view");if(dashboard)await app.workspace.revealLeaf(dashboard);
   if(kind==="case"){active=files.get(data.case.source.path)!;await view.syncToActiveFile(active);}
   else if(kind==="guide"){active=files.get("Notes/Docs/本地预览说明.md")!;await view.syncToActiveFile(active);}
   else if(kind==="settings")plugin.openDashboardSettings();
   else{active=files.get(data.tasks[kind==="done"?1:0].id)!;await view.loadTask(active.path);}
 };
 document.querySelectorAll(".preview-tab").forEach(button=>button.addEventListener("click",()=>{void select((button as HTMLElement).dataset.kind!);}));
 document.getElementById("open-main")!.addEventListener("click",()=>{void plugin.commands.find((command:any)=>command.id==="open-dashboard-in-main")?.callback();});
 document.getElementById("focus-sidebar")!.addEventListener("click",()=>{const sidebar=slots.find(slot=>slot.state.type==="flowdesk-dashboard-view"&&slot.state.state?.placement!=="main");if(sidebar)void app.workspace.revealLeaf(sidebar);});
 document.getElementById("width")!.addEventListener("change",event=>{view.contentEl.style.width=(event.target as HTMLSelectElement).value+"px";});
 document.getElementById("theme")!.addEventListener("click",()=>document.body.classList.toggle("dark"));
 document.getElementById("slow")!.addEventListener("change",event=>{app.markdownDelay=(event.target as HTMLInputElement).checked?()=>new Promise(resolve=>setTimeout(resolve,240)):undefined;});
 document.getElementById("auto-refresh")!.addEventListener("click",()=>view.scheduleRefresh());
 document.getElementById("sampled")!.textContent="取材时间："+formatDisplayTime(data.sampledAt);
 await select("running");(window as any).previewView=view;(window as any).previewReady=true;
}
void main().catch(error=>{document.getElementById("notice")!.textContent=String(error);});
