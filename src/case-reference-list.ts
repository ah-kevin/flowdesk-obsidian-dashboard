import {formatReferenceLabel} from "./entity-presentation";
import {parseReferenceText} from "./reference-text";
import type {NavigationModifiers} from "./task-navigation";

interface ReferenceGroup {label:string;targets:string[]}
interface Choices {query:string;open:Map<string,boolean>;all:Set<string>}
interface Dependencies {open(raw:string,event?:NavigationModifiers):Promise<void>|void;icon?(element:HTMLElement,name:string):void}

/** Display metadata only. Navigation always receives the untouched original reference. */
function referenceSubtitle(raw:string,group:string,full=false):string {
  const parsed=parseReferenceText(raw),target=parsed.target.replace(/\\/g,"/");
  if(/^https?:\/\//i.test(target))return "网页 · 浏览器";
  const kind=group==="Project"?"项目笔记":group==="Sessions"?"会话记录":/\.json(?:#.*)?$/i.test(target)?"数据文件":/\.docx(?:#.*)?$/i.test(target)?"Word文档":parsed.syntax==="wiki"?"Obsidian笔记":"原文件";
  const display=target.replace(/^file:\/\/(?:localhost)?/i,"");
  const slash=display.lastIndexOf("/");
  const directory=slash<0?"":display.slice(0,slash);
  const short=directory.split("/").filter(Boolean).slice(-3).join("/");
  return full?`${kind} · ${parsed.target}`:short?`${kind} · ${short}`:kind;
}

/** Bounded UI choices, never a cache of Case or Task facts. */
export class CaseReferenceList {
  private readonly choices=new Map<string,Choices>();
  private generation=0;
  constructor(private readonly capacity=20){}
  deactivate():void {this.generation++;}
  clear():void {this.deactivate();this.choices.clear();}
  snapshot():unknown[] {return [...this.choices].map(([casePath,choice])=>({casePath,query:choice.query,open:[...choice.open],all:[...choice.all]}));}
  restoreSnapshot(value:unknown):void {
    this.clear();if(!Array.isArray(value))return;
    for(const item of value.slice(-this.capacity)) {
      if(!item||typeof item!=="object"||typeof item.casePath!=="string"||!item.casePath||item.casePath.length>4096)continue;
      const open=new Map<string,boolean>(),all=new Set<string>();
      if(Array.isArray(item.open))for(const pair of item.open.slice(0,32))if(Array.isArray(pair)&&typeof pair[0]==="string"&&typeof pair[1]==="boolean")open.set(pair[0],pair[1]);
      if(Array.isArray(item.all))for(const group of item.all.slice(0,32))if(typeof group==="string")all.add(group);
      this.choices.set(item.casePath,{query:typeof item.query==="string"?item.query.slice(0,4096):"",open,all});
    }
  }

  render(container:HTMLElement,casePath:string,groups:ReferenceGroup[],dependencies:Dependencies):void {
    let choice=this.choices.get(casePath);
    if(!choice){choice={query:"",open:new Map(),all:new Set()};this.choices.set(casePath,choice);}
    this.choices.delete(casePath);this.choices.set(casePath,choice);
    while(this.choices.size>this.capacity)this.choices.delete(this.choices.keys().next().value!);
    const selection=choice,token=++this.generation;
    const total=groups.reduce((sum,group)=>sum+group.targets.length,0);
    const displayGroups=groups.map(group=>({...group,items:group.targets.map(raw=>({raw,label:formatReferenceLabel(raw),subtitle:referenceSubtitle(raw,group.label)}))}));
    const identities=new Map<string,Set<string>>();
    for(const group of displayGroups)for(const item of group.items){
      const key=`${item.label}\u0000${item.subtitle}`;
      if(!identities.has(key))identities.set(key,new Set());
      identities.get(key)!.add(parseReferenceText(item.raw).target);
    }
    for(const group of displayGroups)for(const item of group.items){
      if(identities.get(`${item.label}\u0000${item.subtitle}`)!.size>1)item.subtitle=referenceSubtitle(item.raw,group.label,true);
    }
    container.createDiv({cls:"flowdesk-case-reference-count",text:`共 ${total} 项 · 全部引用保留`});
    const search=container.createEl("input",{cls:"flowdesk-case-reference-search",attr:{type:"search",placeholder:"查找入口名称或目录","aria-label":"查找精选入口","data-focus-key":"case-reference-search"}});
    search.value=selection.query;
    const results=container.createDiv({cls:"flowdesk-case-reference-results"});
    const moreButtons=new Map<string,HTMLButtonElement>();
    let epoch=0;
    const current=()=>this.generation===token;
    const renderGroups=()=>{
      if(!current())return;
      const currentEpoch=++epoch;results.empty();moreButtons.clear();
      const query=selection.query.trim().toLowerCase();
      const filtered=displayGroups.map(group=>({...group,items:group.items.filter(item=>!query||`${item.label} ${item.subtitle} ${item.raw}`.toLowerCase().includes(query))}));
      const matched=filtered.reduce((sum,group)=>sum+group.items.length,0);
      if(query)results.createDiv({cls:"flowdesk-case-reference-match-count",text:`匹配 ${matched} / ${total} 项`,attr:{role:"status"}});
      if(!matched){results.createDiv({cls:"flowdesk-case-reference-empty",text:"没有匹配的入口，试试文件名或目录。"});return;}
      for(const group of filtered){
        if(!group.items.length)continue;
        const details=results.createEl("details",{cls:"flowdesk-case-reference-group",attr:{"data-reference-group":group.label,"data-disclosure-key":`case-reference:${group.label}`,"data-external-disclosure":"true"}});
        details.open=query?true:selection.open.get(group.label)??group.label==="Project";
        const summary=details.createEl("summary");
        summary.createSpan({text:({Project:"项目",Plans:"计划",Docs:"文档",Sessions:"原会话",Related:"资料"} as Record<string,string>)[group.label]??group.label});
        summary.createSpan({cls:"flowdesk-case-reference-group-count",text:query?`${group.items.length} / ${group.targets.length}`:String(group.targets.length)});
        details.addEventListener("toggle",()=>{if(current()&&epoch===currentEpoch&&!selection.query.trim())selection.open.set(group.label,details.open);});
        const links=details.createDiv({cls:"flowdesk-case-related-links"});
        const showAll=!!query||selection.all.has(group.label);
        for(const item of showAll?group.items:group.items.slice(0,3)){
          const button=links.createEl("button",{cls:"flowdesk-case-related-link",attr:{title:item.raw,"aria-label":`${item.label} · ${item.subtitle}`}});
          const web=/^https?:\/\//i.test(parseReferenceText(item.raw).target);
          const icon=button.createSpan({cls:"flowdesk-reference-icon",attr:{"aria-hidden":"true"}});dependencies.icon?.(icon,web?"globe":"file-text");
          const copy=button.createSpan({cls:"flowdesk-reference-copy"});copy.createSpan({cls:"flowdesk-reference-title",text:item.label});copy.createSpan({cls:"flowdesk-reference-type",text:item.subtitle});
          button.createSpan({cls:"flowdesk-reference-arrow",text:web?"↗":"→",attr:{"aria-hidden":"true"}});
          const open=(event?:NavigationModifiers)=>{if(current()&&epoch===currentEpoch)void dependencies.open(item.raw,event);};
          button.addEventListener("click",open);
          button.addEventListener("keydown",event=>{if((event.metaKey||event.ctrlKey)&&["Enter"," "].includes(event.key)){event.preventDefault();open(event);}});
        }
        if(group.items.length>3&&!query){
          const more=details.createEl("button",{cls:"flowdesk-case-reference-more",text:showAll?"收起为 3 项":`查看全部 ${group.items.length} 项 · 还有 ${group.items.length-3} 项`,attr:{"data-reference-group":group.label}});
          moreButtons.set(group.label,more);
          more.addEventListener("click",()=>{if(!current()||epoch!==currentEpoch)return;showAll?selection.all.delete(group.label):selection.all.add(group.label);selection.open.set(group.label,details.open);renderGroups();moreButtons.get(group.label)?.focus({preventScroll:true});});
        }
      }
    };
    search.addEventListener("input",()=>{if(!current())return;selection.query=search.value;renderGroups();});
    renderGroups();
  }
}
