import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { TestElement } from "./support/dom";
import { resumeFixture } from "./support/resume-fixture";
import { compilePlugin, CORE_ROOT } from "./support/owned-environment";
import { buildSnapshotInvocation } from "../src/snapshot-invocation";

const dashboardType="flowdesk-dashboard-view";
async function setup(t:any) {
 const fixture=await resumeFixture(t,2,true,"valid"),bundle=fixture.path("plugin.cjs");compilePlugin(bundle);
 const Plugin=createRequire(import.meta.url)(bundle).default,plugin=new Plugin();
 const commands=new Map<string,any>(),workspaceEvents=new Map<string,Function>(),metadataEvents=new Map<string,Function>(),vaultEvents=new Map<string,Function>(),layoutCallbacks:Function[]=[],leaves:any[]=[],revealed:any[]=[],opens:any[]=[],notices:string[]=[],hostReadErrors:unknown[]=[];
 const noticeObserver=(globalThis as any).__flowdeskTestNotice;(globalThis as any).__flowdeskTestNotice=(message:string)=>notices.push(message);t.after(()=>{if(noticeObserver)(globalThis as any).__flowdeskTestNotice=noticeObserver;else delete (globalThis as any).__flowdeskTestNotice;});
 const rootSplit={},rightSplit={},files=[fixture.casePath,...fixture.tasks.map(task=>task.id),...fixture.referenceFixture!.vaultPaths].map(p=>({path:p,extension:"md"}));
 let activePath=fixture.tasks[0].id,activeLeaf:any=null,ribbon:Function=()=>{},emitNullOnNewTab=false;
 const createLeaf=(root:any)=>{
  const leaf:any={app:plugin.app,contentEl:new TestElement(),getRoot:()=>root,closed:false};let state:any={type:"empty"},pinned=false;
  leaf.getViewState=()=>({...state,pinned});leaf.setPinned=(value:boolean)=>{pinned=value;};
  // Native setViewState ignores pinned and catches View.setState errors instead of rejecting.
  leaf.setViewState=async(next:any)=>{if(state.type!==next.type||typeof leaf.view?.setState!=="function"){await leaf.view?.onClose?.();leaf.view=plugin.views.get(next.type)(leaf);await leaf.view.onOpen();}const {pinned:ignored,...viewState}=next;state=viewState;try{await leaf.view.setState(next.state,{});}catch(error){hostReadErrors.push(error);}};
  leaf.defer=async()=>{state={...state,state:leaf.view.getState()};await leaf.view.onClose();leaf.view={getViewType:()=>state.type};};
  leaf.detach=()=>{leaf.closed=true;void leaf.view?.onClose?.();};
  leaf.openFile=async(file:any)=>{activeLeaf=leaf;activePath=file.path;opens.push({leaf,path:file.path});await workspaceEvents.get("file-open")?.(file);};
  leaves.push(leaf);return leaf;
 };
 plugin.addCommand=(command:any)=>commands.set(command.id,command);plugin.addRibbonIcon=(_icon:string,_name:string,callback:Function)=>{ribbon=callback;};plugin.saveData=async()=>{};
 plugin.app={vault:{adapter:{getBasePath:()=>fixture.env.OBSIDIAN_VAULT},on:(name:string,callback:Function)=>vaultEvents.set(name,callback),getMarkdownFiles:()=>files,getAbstractFileByPath:(p:string)=>files.find(file=>file.path===p)??null,cachedRead:async(file:any)=>readFileSync(path.join(fixture.env.OBSIDIAN_VAULT!,file.path),"utf8")},metadataCache:{on:(name:string,callback:Function)=>metadataEvents.set(name,callback),getFileCache:(file:any)=>({frontmatter:file.path===fixture.casePath?{type:"work-case"}:{}})},workspace:{rootSplit,rightSplit,on:(name:string,callback:Function)=>workspaceEvents.set(name,callback),onLayoutReady:(callback:Function)=>layoutCallbacks.push(callback),getActiveFile:()=>files.find(file=>file.path===activePath)??null,getActiveViewOfType:(Type:any)=>activeLeaf?.view instanceof Type?activeLeaf.view:null,getLeavesOfType:(type:string)=>leaves.filter(leaf=>!leaf.closed&&leaf.view?.getViewType()===type).reverse(),getRightLeaf:()=>createLeaf(rightSplit),getLeaf:(type:any)=>{if(type===false)return activeLeaf??createLeaf(rootSplit);const leaf=createLeaf(rootSplit);if(emitNullOnNewTab){activeLeaf=leaf;void workspaceEvents.get("file-open")?.(null);}return leaf;},getMostRecentLeaf:()=>leaves.find(leaf=>!leaf.closed&&leaf.getRoot()===rootSplit&&leaf.getViewState().type!==dashboardType)??null,iterateRootLeaves:(visit:Function)=>leaves.filter(leaf=>!leaf.closed&&leaf.getRoot()===rootSplit).forEach(leaf=>visit(leaf)),revealLeaf:async(leaf:any)=>{if(leaf.view?.getViewType()===dashboardType&&typeof leaf.view.setState!=="function")await leaf.setViewState(leaf.getViewState());activeLeaf=leaf;revealed.push(leaf);},setActiveLeaf:(leaf:any)=>{activeLeaf=leaf;}}};
 await plugin.onload();plugin.settings={coreMode:"fixed",flowdeskRoot:CORE_ROOT,workingDirectory:fixture.root,apiUrl:fixture.url,tasknotesEnv:'{"TASKNOTES_API_TOKEN":"controlled-token"}'};
 for(const task of fixture.tasks){const invocation=buildSnapshotInvocation({flowdeskRoot:CORE_ROOT,taskPath:task.id,workingDirectory:fixture.root,apiUrl:fixture.url},"json");fixture.allowParentProducer([invocation.executable,...invocation.args],invocation.cwd);}
 await plugin.activateDashboard(fixture.tasks[0].id);const sidebar=leaves.find(leaf=>leaf.getRoot()===rightSplit);
 t.after(async()=>{for(const leaf of leaves)await leaf.view?.onClose?.();});
 const openMain=async()=>{const command=commands.get("open-dashboard-in-main");assert.ok(command,"main-area Dashboard command must be registered");await command.callback();return revealed.at(-1);};
 const setActive=(p:string,leaf:any=null)=>{activePath=p;activeLeaf=leaf;};
 return {fixture,plugin,commands,leaves,sidebar,revealed,opens,notices,hostReadErrors,workspaceEvents,metadataEvents,vaultEvents,layoutCallbacks,openMain,setActive,ribbon:()=>ribbon(),file:(p:string)=>files.find(file=>file.path===p),removeFile:(p:string)=>{const i=files.findIndex(file=>file.path===p);if(i>=0)files.splice(i,1);},emitNullOnNewTab:()=>{emitNullOnNewTab=true;}};
}
async function settle(predicate:()=>boolean,message="async Dashboard operation did not finish"){const deadline=Date.now()+5000;while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(predicate(),message);}

test("main command retains the sidebar and copies only initial UI choices, then keeps both readers independent",async t=>{
 const f=await setup(t);await f.sidebar.view.syncToActiveFile(f.file(f.fixture.casePath));f.setActive(f.fixture.casePath,f.sidebar);
 const search=f.sidebar.contentEl.findByClass("flowdesk-case-reference-search")[0];search.value="Vault";search.dispatchEvent(new Event("input"));f.sidebar.contentEl.scrollTop=321;
 const main=await f.openMain();assert.ok(main);assert.equal(f.sidebar.closed,false);assert.equal(main.getViewState().pinned,true);assert.equal(main.view.getState().resourcePath,f.fixture.casePath);
 assert.equal(main.contentEl.findByClass("flowdesk-case-reference-search")[0].value,"Vault");assert.equal(main.contentEl.scrollTop,321);assert.equal("snapshot" in main.getViewState().state,false);
 const mainSearch=main.contentEl.findByClass("flowdesk-case-reference-search")[0];mainSearch.value="legacy";mainSearch.dispatchEvent(new Event("input"));main.contentEl.scrollTop=654;
 assert.equal(search.value,"Vault");assert.equal(f.sidebar.contentEl.scrollTop,321);
 const count=f.leaves.length;const again=await f.openMain();assert.equal(again,main);assert.equal(f.leaves.length,count);assert.equal(main.contentEl.scrollTop,654);assert.equal(main.contentEl.findByClass("flowdesk-case-reference-search")[0].value,"legacy");
 assert.equal(main.contentEl.findByClass("flowdesk-reading-expand").length,0);assert.equal(f.sidebar.contentEl.findByClass("flowdesk-reading-expand").length,0);
 assert.equal(f.sidebar.contentEl.findByClass("flowdesk-reading-controls").length,0,"sidebar must not reserve an empty reading-control row");assert.equal(main.contentEl.findByClass("flowdesk-reading-font-select").length,1);
});

test("file-open follows only the sidebar; old command and Ribbon still reveal that sidebar",async t=>{
 const f=await setup(t),main=await f.openMain();await f.workspaceEvents.get("file-open")!(null);assert.equal(f.sidebar.view.getState().resourcePath,f.fixture.tasks[0].id);f.setActive(f.fixture.tasks[1].id);await f.workspaceEvents.get("file-open")!(f.file(f.fixture.tasks[1].id));
 await settle(()=>f.sidebar.view.getState().resourcePath===f.fixture.tasks[1].id&&!f.sidebar.view.taskAdapter.getRenderState()?.loading);
 assert.equal(main.view.getState().resourcePath,f.fixture.tasks[0].id);
 await f.plugin.refreshDashboard();assert.equal(f.revealed.at(-1),f.sidebar);assert.equal(main.view.getState().resourcePath,f.fixture.tasks[0].id);
 f.ribbon();await settle(()=>f.revealed.at(-1)===f.sidebar);
});

test("active Dashboard resource wins over a different active file; valid sidebar is the final fallback",async t=>{
 const f=await setup(t),main=await f.openMain();f.setActive(f.fixture.tasks[1].id,main);assert.equal(await f.openMain(),main);
 f.setActive(f.fixture.tasks[1].id);const other=await f.openMain();assert.notEqual(other,main);assert.equal(other.view.getState().resourcePath,f.fixture.tasks[1].id);assert.equal(f.sidebar.view.getState().resourcePath,f.fixture.tasks[0].id);
 f.setActive("Notes/unrelated.md");assert.equal(await f.openMain(),main);
});

test("new main read failure cleans up only its new leaf and keeps sidebar state intact",async t=>{
 const f=await setup(t),before=f.sidebar.view.getState();f.setActive(f.fixture.tasks[1].id);f.plugin.loadSnapshot=async()=>{throw Error("owned snapshot read failed");};await f.openMain();
 assert.equal(f.sidebar.closed,false);assert.deepEqual(f.sidebar.view.getState(),before);assert.equal(f.leaves.filter(leaf=>!leaf.closed&&leaf.view?.getViewType()===dashboardType).length,1);
 assert.equal(f.hostReadErrors.length,1,"native host swallowed the read failure");assert.ok(f.notices.some(text=>text.includes("未能打开主区域 Dashboard")));
});

test("Case read failure is validated after a resolving native setViewState and cleans up only the new main",async t=>{
 const f=await setup(t),before=f.sidebar.view.getState();f.setActive(f.fixture.casePath);f.plugin.loadWorkCaseSnapshot=async()=>{throw Error("owned Case snapshot failed");};await f.openMain();
 assert.equal(f.leaves.filter(leaf=>!leaf.closed&&leaf.view?.getViewType()===dashboardType).length,1);assert.equal(f.hostReadErrors.length,1);assert.deepEqual(f.sidebar.view.getState(),before);assert.ok(f.notices.some(text=>text.includes("未能打开主区域 Dashboard")));
});

test("resource and settings changes refresh every observing view without changing fixed identities",async t=>{
 const f=await setup(t),main=await f.openMain();let sideRefresh=0,mainRefresh=0,sideSettings=0,mainSettings=0;
 const count=(view:any,name:string,onCall:()=>void)=>{const original=view[name].bind(view);view[name]=(...args:any[])=>{onCall();return original(...args);};};
 count(f.sidebar.view,"scheduleRefresh",()=>sideRefresh++);count(main.view,"scheduleRefresh",()=>mainRefresh++);count(f.sidebar.view,"settingsChanged",()=>sideSettings++);count(main.view,"settingsChanged",()=>mainSettings++);
 for(const event of ["modify","create","delete"]){f.vaultEvents.get(event)!(f.file(f.fixture.tasks[0].id));assert.equal(sideRefresh,mainRefresh);}
 f.vaultEvents.get("rename")!(f.file(f.fixture.tasks[1].id),f.fixture.tasks[0].id);assert.equal(sideRefresh,4);assert.equal(mainRefresh,4);
 f.metadataEvents.get("changed")!(f.file(f.fixture.tasks[0].id));assert.equal(sideRefresh,5);assert.equal(mainRefresh,5);
 f.setActive(f.fixture.tasks[1].id);await f.workspaceEvents.get("file-open")!(f.file(f.fixture.tasks[1].id));await settle(()=>!f.sidebar.view.taskAdapter.getRenderState()?.loading);
 sideRefresh=0;mainRefresh=0;f.vaultEvents.get("modify")!(f.file(f.fixture.tasks[0].id));assert.equal(sideRefresh,0);assert.equal(mainRefresh,1);
 f.vaultEvents.get("modify")!(f.file(f.fixture.tasks[1].id));assert.equal(sideRefresh,1);assert.equal(mainRefresh,1);
 await f.plugin.saveSettings();await settle(()=>sideSettings===1&&mainSettings===1);assert.equal(main.view.getState().resourcePath,f.fixture.tasks[0].id);
});

test("commands reuse deferred restored main and sidebar leaves without creating duplicate Dashboards",async t=>{
 const f=await setup(t),main=await f.openMain(),count=f.leaves.length;await main.defer();f.setActive(f.fixture.tasks[0].id);
 assert.ok((await f.openMain())===main,"saved main identity must be reused before its View is loaded");assert.equal(f.leaves.length,count);
 await f.sidebar.defer();f.setActive(f.fixture.tasks[1].id);await f.plugin.refreshDashboard();assert.ok(f.revealed.at(-1)===f.sidebar,"existing deferred sidebar must be loaded and reused");assert.equal(f.leaves.length,count);assert.equal(f.sidebar.view.getState().resourcePath,f.fixture.tasks[1].id);
});

test("fixed main restore does not follow layout-ready file, and ordinary/Cmd navigation never overwrites either Dashboard",async t=>{
 const f=await setup(t),main=await f.openMain(),persisted=JSON.parse(JSON.stringify(main.view.getState()));f.setActive(f.fixture.tasks[1].id);
 await main.view.setState(persisted,{});for(const callback of f.layoutCallbacks)callback();await settle(()=>!main.view.taskAdapter.getRenderState()?.loading);assert.equal(main.view.getState().resourcePath,f.fixture.tasks[0].id);
 f.setActive(f.fixture.tasks[0].id,main);await main.view.openTask(f.fixture.tasks[1].id,"current");assert.notEqual(f.opens.at(-1).leaf,main);assert.notEqual(f.opens.at(-1).leaf,f.sidebar);assert.equal(main.getViewState().type,dashboardType);
 const ordinary=f.opens.at(-1).leaf;f.setActive(f.fixture.tasks[0].id,main);await main.view.openTask(f.fixture.tasks[1].id,"current",{metaKey:true});assert.notEqual(f.opens.at(-1).leaf,ordinary);assert.equal(main.view.getState().resourcePath,f.fixture.tasks[0].id);assert.equal(f.sidebar.closed,false);
});

test("restored sidebar follows the active Task when layout is ready instead of retaining the saved Task",async t=>{
 const f=await setup(t),saved=JSON.parse(JSON.stringify(f.sidebar.view.getState()));await f.sidebar.view.setState(saved,{});f.setActive(f.fixture.tasks[1].id);
 for(const callback of f.layoutCallbacks)callback();await settle(()=>f.sidebar.view.getState().resourcePath===f.fixture.tasks[1].id&&!f.sidebar.view.taskAdapter.getRenderState()?.loading,"restored sidebar must follow the layout's active file");
});

test("concurrent main commands ignore the host's transient null file-open before the new View exists",async t=>{
 const f=await setup(t),before=f.sidebar.view.getState();f.setActive(f.fixture.tasks[0].id);f.emitNullOnNewTab();
 const [one,two]=await Promise.all([f.openMain(),f.openMain()]);assert.ok(one===two);assert.equal(f.leaves.filter(leaf=>leaf.getRoot()===f.plugin.app.workspace.rootSplit).length,1);assert.deepEqual(f.sidebar.view.getState(),before);assert.equal(f.sidebar.closed,false);
});

test("deferred sidebar restored after immediate layout-ready keeps the active Task instead of the saved Task",async t=>{
 const f=await setup(t),savedTask=f.fixture.tasks[0].id,activeTask=f.fixture.tasks[1].id;await f.sidebar.defer();f.setActive(activeTask);
 f.plugin.app.workspace.onLayoutReady=(callback:Function)=>callback();const before=f.fixture.requests.filter(request=>request.method==="GET"&&request.url===`/api/tasks/${encodeURIComponent(savedTask)}`).length;
 await f.sidebar.setViewState(f.sidebar.getViewState());await settle(()=>!f.sidebar.view.taskAdapter.getRenderState()?.loading);
 assert.equal(f.sidebar.view.getState().resourcePath,activeTask);assert.equal(f.sidebar.view.taskAdapter.getRenderState().snapshot.current_task.id,activeTask);
 assert.equal(f.fixture.requests.filter(request=>request.method==="GET"&&request.url===`/api/tasks/${encodeURIComponent(savedTask)}`).length,before,"restoring sidebar choices must not read the saved Task");
});

test("a deleted saved sidebar Task does not block the current valid Task after immediate layout-ready",async t=>{
 const f=await setup(t);await f.sidebar.defer();f.removeFile(f.fixture.tasks[0].id);f.setActive(f.fixture.tasks[1].id);f.plugin.app.workspace.onLayoutReady=(callback:Function)=>callback();
 await f.sidebar.setViewState(f.sidebar.getViewState());await settle(()=>!f.sidebar.view.taskAdapter.getRenderState()?.loading);assert.equal(f.hostReadErrors.length,0);assert.equal(f.sidebar.view.getState().resourcePath,f.fixture.tasks[1].id);
});

test("sidebar restore keeps a valid previous work resource while the active file is a reference page",async t=>{
 const f=await setup(t);await f.sidebar.defer();f.setActive(f.fixture.referenceFixture!.vaultPaths[0]);f.plugin.app.workspace.onLayoutReady=(callback:Function)=>callback();await f.sidebar.setViewState(f.sidebar.getViewState());
 assert.equal(f.sidebar.view.getState().resourcePath,"");const back=f.sidebar.contentEl.findByClass("flowdesk-return-resource")[0];assert.ok(back&&!back.disabled);await back.click();assert.equal(f.opens.at(-1).path,f.fixture.tasks[0].id);
});

test("a delayed initial sidebar read cannot replace a newer active Task chosen during state restoration",async t=>{
 const f=await setup(t);await f.sidebar.defer();const saved=f.sidebar.getViewState().state,oldTask=f.fixture.tasks[0].id,newTask=f.fixture.tasks[1].id;
 const release=f.fixture.pauseTaskRead(oldTask),before=f.fixture.requests.length;f.setActive(oldTask);f.plugin.app.workspace.onLayoutReady=(callback:Function)=>callback();
 const view=f.plugin.views.get(dashboardType)(f.sidebar);f.sidebar.view=view;await view.onOpen();
 await settle(()=>f.fixture.requests.slice(before).some(request=>request.method==="GET"&&decodeURIComponent(request.url.slice("/api/tasks/".length))===oldTask),"old Task read must actually be pending before switching");
 f.setActive(newTask);await view.setState(saved,{});await settle(()=>view.getState().resourcePath===newTask&&!view.taskAdapter.getRenderState()?.loading);release();
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(view.getState().resourcePath,newTask);assert.equal(view.taskAdapter.getRenderState().snapshot.current_task.id,newTask);
});
