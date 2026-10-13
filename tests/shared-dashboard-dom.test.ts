import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { TestElement } from "./support/dom";
import { TaskContentRenderer } from "../src/task-content-renderer";
import { WorkCaseDashboardRenderer } from "../src/work-case-renderer";
import { createWorkCaseViewModel } from "../src/work-case-model";

// Standard DOM boundary; intentionally offers no Obsidian HTMLElement methods.
class NativeElement extends TestElement {
  constructor(tag="div") {
    super(tag);
    for(const name of ["createDiv","createEl","createSpan","addClass","removeClass","setAttr","setText","empty"])
      Object.defineProperty(this,name,{value:undefined});
    this.ownerDocument={activeElement:null,defaultView:null,createElement:(tag:string)=>new NativeElement(tag)};
    this.classList={
      contains:(name:string)=>this.classes.has(name),
      add:(...names:string[])=>{for(const name of names)this.classes.add(name);},
      remove:(...names:string[])=>{for(const name of names)this.classes.delete(name);},
    };
    Object.defineProperty(this,"textContent",{get:()=>this.allText().join(""),set:(value:string)=>{this.text=String(value);this.replaceChildren();}});
  }
  setAttribute(name:string,value:string){this.attrs[name]=String(value);}
  replaceChildren(...nodes:TestElement[]){for(const child of this.children)child.parentElement=null;this.children=[];for(const node of nodes)this.appendChild(node);}
}

test("shared Task reader renders complete source-order content on standard DOM only",()=>{
  const root=new NativeElement();
  const content:any={taskId:"Tasks/A.md",goal:"目标正文",why:"背景",scopeText:"范围",steps:"- [ ] 原始步骤",
    domainSections:[{heading:"正文",level:2,text:"中间说明",source:{line_start:12,line_end:14}}],
    records:{execution:[{heading:"Execution Result",level:2,text:"先执行",source:{line_start:5,line_end:8}}],verification:[{heading:"Verification Result",level:2,text:"后验证",source:{line_start:20,line_end:24}}],delivery:[]},
    requirements:[],scenarios:[],acceptance:[{text:"原始验收条目",checked:true}]};
  const original=JSON.stringify(content);
  const renderer=new TaskContentRenderer({renderMarkdown:async(text,el)=>{el.textContent=text;},openSource:async()=>{}});
  assert.doesNotThrow(()=>renderer.render(root as any,content));
  assert.ok(root.textContent.includes("目标正文"));
  assert.deepEqual(root.findByClass("flowdesk-process-entry").map(x=>x.findByClass("flowdesk-contract-scope-markdown")[0].textContent),["先执行","中间说明","后验证"]);
  assert.equal(root.querySelectorAll("input").length,0);
  assert.equal(JSON.stringify(content),original);
});

test("shared Case reader preserves source facts without Obsidian DOM helpers",()=>{
  const root=new NativeElement();
  const snapshot=JSON.parse(readFileSync("tests/fixtures/work-case-canonical.json","utf8"));
  const model=createWorkCaseViewModel(snapshot,snapshot.source.path);
  const renderer=new WorkCaseDashboardRenderer({refresh(){},openTask(){},openCaseSource(){},openRelated(){},fullSections:true,renderMarkdown:async(text,el)=>{el.textContent=text;}});
  assert.doesNotThrow(()=>renderer.render(root as any,{casePath:snapshot.source.path,model,loading:false,error:"",staleReason:"",loadedAt:"2026-10-12T10:00:00Z"}));
  assert.ok(root.textContent.includes("Demo Case"));
  assert.ok(root.textContent.includes("producer 已开始"));
  assert.ok(root.textContent.includes("第一个 Outcome。"));
  assert.ok(root.textContent.includes("第二个 Outcome。"));
});

test('complete Case mode exposes source-only background and noncanonical history',()=>{
  const root=new NativeElement(),snapshot=JSON.parse(readFileSync('tests/fixtures/work-case-canonical.json','utf8'));
  const model=createWorkCaseViewModel(snapshot,snapshot.source.path);model.recentProgress=[];
  let history='';
  const sections=['Summary','Context','Current','Progress'].map((heading,index)=>({heading,level:2,text:heading+'_SOURCE_ONLY',source:{lineStart:10+index*4,lineEnd:12+index*4}}));
  const renderer=new WorkCaseDashboardRenderer({refresh(){},openTask(){},openCaseSource(){},openRelated(){},fullSections:true,renderMarkdown:async(text,el)=>{el.textContent=text;},openContent:(_,render)=>{const body=new NativeElement();render(body as any);history=body.textContent;}});
  renderer.render(root as any,{casePath:snapshot.source.path,model,loading:false,error:'',staleReason:'',loadedAt:'2026-10-12T10:00:00Z',caseContent:{casePath:snapshot.source.path,details:'',readAt:'2026-10-12T10:00:00Z',sections}});
  for(const heading of ['Summary','Context','Current'])assert.ok(root.textContent.includes(heading+'_SOURCE_ONLY'),heading+' remains readable');
  const button=root.findByClass('flowdesk-case-progress-history')[0];assert.ok(button);button.click();assert.ok(history.includes('Progress_SOURCE_ONLY'));
});

import * as shared from "../packages/dashboard-ui/src/index";
test("readonly body reader shows complete text and preserves exact action references",()=>{
 const Renderer=(shared as any).ReadonlyBodyRenderer;
 assert.ok(Renderer,"readonly body reader missing");
 const root=new NativeElement(),calls:string[]=[],markdown:string[]=[];
 const renderer=new Renderer({renderMarkdown:async(text:string,el:HTMLElement)=>{markdown.push(text);el.textContent=text;},back:()=>calls.push('back'),refresh:()=>calls.push('refresh'),showReference:(raw:string)=>calls.push('show:'+raw),copyReference:(raw:string)=>calls.push('copy:'+raw)});
 const ref='[[Notes/Docs/Exact|资料]]',body='## A\r\n\r\nfirst\r\n## A\r\n\r\nsecond';
 renderer.render(root as any,{title:'<img src=x onerror=attack()>',status:'custom',reference:ref,sourceLabel:'TaskNotes API',readAt:'13:20',state:'available',details:body});
 assert.deepEqual(markdown,[body]);assert.ok(root.textContent.includes('<img src=x onerror=attack()>'));
 for(const cls of ['flowdesk-body-back','flowdesk-body-refresh','flowdesk-body-reference','flowdesk-body-copy'])root.findByClass(cls)[0].click();
 assert.deepEqual(calls,['back','refresh','show:'+ref,'copy:'+ref]);assert.equal(root.querySelectorAll('img').length,0);
});
test("readonly error and loading views never render an old supplied body",()=>{
 const Renderer=(shared as any).ReadonlyBodyRenderer;assert.ok(Renderer,"readonly body reader missing");
 const root=new NativeElement(),markdown:string[]=[];
 const renderer=new Renderer({renderMarkdown:async(text:string)=>{markdown.push(text);},back(){},refresh(){},showReference(){},copyReference(){}});
 for(const state of ['loading','unavailable','unsupported','too_large']){
  renderer.render(root as any,{title:'A',reference:'exact.md',sourceLabel:'Markdown',readAt:'',state,details:'OLD_SECRET'});
  assert.ok(!root.textContent.includes('OLD_SECRET'));assert.ok(root.textContent.includes('A'));
 }
 assert.deepEqual(markdown,[]);
});
