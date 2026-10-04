import DashboardPlugin from "../../src/main";
import {formatDisplayTime} from "../../src/reading-presentation";
const data=(window as any).__PREVIEW_DATA__,root=document.getElementById("dashboard")!;
const files=new Map<string,{path:string;extension:string;raw:string;details?:string;contexts?:string[]}>();
for(const task of data.tasks)files.set(task.id,{path:task.id,extension:"md",raw:task.fileText,details:task.details,contexts:task.contexts});
files.set(data.case.source.path,{path:data.case.source.path,extension:"md",raw:data.caseText});
files.set("Notes/Docs/本地预览说明.md",{path:"Notes/Docs/本地预览说明.md",extension:"md",raw:"# 本地预览说明\n\n此页使用当前源码的真实 compiled View，数据取材于只读观测。\n不安装、不启动 Core、不写业务 Task。\n"});
let view:any,active=files.get(data.tasks[0].id)!,sourceTextarea:HTMLTextAreaElement|null=null;
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
  workspace:{on:(name:string,callback:Function)=>{events.set(name,callback);},onLayoutReady(){},getActiveFile:()=>active,getLeavesOfType:()=>view?[{view}]:[],getLeaf:()=>({openFile:source}),getActiveViewOfType:()=>({file:active,editor,getMode:()=>"source"}),openLinkText:async(target:string)=>{const file=files.get(target)??files.get(target+".md");if(file)await source(file);else (window as any).previewNotify("该资料没有取材到本地预览；实际插件提供准确原文导航。");},detachLeavesOfType(){}},
};
async function main(){
 const plugin:any=new DashboardPlugin();plugin.app=app;await plugin.onload();
 plugin.loadSnapshot=async(id:string,signal:AbortSignal)=>{if(signal.aborted)throw Error("已取消");const task=data.tasks.find((x:any)=>x.id===id);if(!task)throw Error("本地预览没有此 Task 数据");return structuredClone(task.snapshot);};
 plugin.loadWorkCaseSnapshot=async()=>structuredClone(data.case);
 plugin.loadTaskDetails=async(id:string,signal:AbortSignal)=>{if(signal.aborted)throw Error("已取消");const task=data.tasks.find((x:any)=>x.id===id);if(!task)throw Error("本地预览没有此 Task 原文");return {id,details:task.details,contexts:task.contexts,source:{kind:"tasknotes-api",taskId:id,readAt:data.sampledAt}};};
 plugin.snapshotCoreInfo=()=>data.core;plugin.inspectCore=()=>data.core;
 plugin.copyDashboardCommand=async()=>{(window as any).previewNotify("预览不提供运行命令；实际插件中可复制所用 Core 的 CLI。");};
 view=plugin.views.get("flowdesk-dashboard-view")({app,contentEl:root});
 const select=async(kind:string)=>{document.querySelectorAll(".preview-tab").forEach(x=>x.classList.toggle("active",(x as HTMLElement).dataset.kind===kind));sourceTextarea=null;
   if(kind==="case"){active=files.get(data.case.source.path)!;await view.syncToActiveFile(active);}
   else if(kind==="guide"){active=files.get("Notes/Docs/本地预览说明.md")!;await view.syncToActiveFile(active);}
   else if(kind==="settings")plugin.openDashboardSettings();
   else{active=files.get(data.tasks[kind==="done"?1:0].id)!;await view.loadTask(active.path);}
 };
 document.querySelectorAll(".preview-tab").forEach(button=>button.addEventListener("click",()=>{void select((button as HTMLElement).dataset.kind!);}));
 document.getElementById("width")!.addEventListener("change",event=>{root.style.width=(event.target as HTMLSelectElement).value+"px";});
 document.getElementById("theme")!.addEventListener("click",()=>document.body.classList.toggle("dark"));
 document.getElementById("slow")!.addEventListener("change",event=>{app.markdownDelay=(event.target as HTMLInputElement).checked?()=>new Promise(resolve=>setTimeout(resolve,240)):undefined;});
 document.getElementById("auto-refresh")!.addEventListener("click",()=>view.scheduleRefresh());
 document.getElementById("sampled")!.textContent="取材时间："+formatDisplayTime(data.sampledAt);
 await select("running");(window as any).previewView=view;(window as any).previewReady=true;
}
void main().catch(error=>{document.getElementById("notice")!.textContent=String(error);});
