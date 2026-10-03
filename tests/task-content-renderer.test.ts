import assert from "node:assert/strict";
import test from "node:test";
import { TaskContentRenderer } from "../src/task-content-renderer.ts";
import { TestElement } from "./support/dom.ts";

const section={heading:"Execution Result (2026-10-01 10:00)",level:2,text:"\n原文\n```ts\nconst x=1;\n```",source:{section:"Execution Result",line_start:10}};
test("all Markdown and repeated rounds are rendered intact expanded and source preserved", async()=>{
  const root=new TestElement();const markdown:string[]=[];const opened:any[]=[];
  const renderer=new TaskContentRenderer({renderMarkdown:async(text,el,id)=>{markdown.push(text);(el as any).setText(text);},openSource:async(id,s)=>{opened.push([id,s]);}});
  const content:any={taskId:"Tasks/A.md",goal:"目标\n",why:"背景\n",scopeText:"范围\n",steps:"- [ ] 步骤",domainSections:[{...section,heading:"根因"},{...section,heading:"Review Record"}],records:{execution:[section,{...section,text:"第二轮"}],verification:[section],delivery:[section]},requirements:[{text:"需求原文",source:{section:"Requirements"}}],scenarios:[],acceptance:[{text:"验收原文",checked:true}]};
  renderer.render(root as any,content);
  assert.ok(markdown.includes(section.text));assert.ok(markdown.includes("第二轮"));assert.ok(markdown.includes("背景\n"));
  const rounds=root.findByClass("flowdesk-record-round");assert.equal(rounds.length,4);assert.ok(rounds.every(round=>round.open));
  assert.match(root.allText().join("\n"),/原文勾选/);
  assert.doesNotMatch(root.allText().join("\n"),/验收通过|证据有效|复核任务/);
  await root.findByClass("flowdesk-content-source")[4].click();
  assert.ok(opened.some(x=>x[0]==="Tasks/A.md"));
});


const readingContent=(domainSections:any[],records:any)=>({taskId:"Tasks/Reading.md",goal:"",why:"",scopeText:"",steps:"",domainSections,records,requirements:[],scenarios:[],acceptance:[]});
test("results_keep_source_order_across_record_types_and_plain_h3",async()=>{
  const e={heading:"Execution Result",level:2,text:"执行正文",source:{line_start:10,line_end:12}};
  const h3={heading:"普通标题",level:3,text:"普通H3正文",source:{line_start:14,line_end:17}};
  const v={heading:"Verification Result",level:2,text:"验证正文",source:{line_start:20,line_end:22}};
  const manual={heading:"人工说明",level:2,text:"人工说明正文",source:{line_start:25,line_end:27}};
  const d={heading:"Delivery Record",level:2,text:"交付正文",source:{line_start:30,line_end:32}};
  const content=readingContent([h3,manual],{execution:[e],verification:[v],delivery:[d]});const original=JSON.stringify(content);
  const rendered:string[]=[],opened:any[]=[],root=new TestElement();
  new TaskContentRenderer({renderMarkdown:async(text,el)=>{rendered.push(text);(el as any).setText(text);},openSource:async(id,section)=>{opened.push([id,section]);}}).render(root as any,content);
  assert.deepEqual(rendered,["执行正文","普通H3正文","验证正文","人工说明正文","交付正文"]);
  const output=root.allText().join("\n");assert.match(output,/执行.*Execution Result/);assert.match(output,/验证.*Verification Result/);assert.match(output,/交付.*Delivery Record/);assert.match(output,/H3.*普通标题/);
  const sources=root.findByClass("flowdesk-content-source").slice(1);
  for(const source of sources)await source.click();
  assert.deepEqual(opened.map(x=>x[1]),[e,h3,v,manual,d]);assert.equal(opened[1][1],h3);assert.equal(opened[1][1].source,h3.source);
  assert.ok(root.findByClass("flowdesk-record-round").every(round=>round.open));assert.equal(JSON.stringify(content),original);
});

test("repeated_headings_and_missing_sources_preserve_every_section",async()=>{
  const make=(text:string,line:any)=>({heading:"重复标题",level:2,text,source:line===undefined?undefined:{line_start:line}});
  const a=make("同号A",5),b=make("同号B",5),c=make("缺位置",undefined),d=make("null位置",null),e=make("非法位置",0),f=make("较早",2),g=make("同号执行",5),h=make("非整数",1.2);
  const root=new TestElement(),rendered:string[]=[];
  new TaskContentRenderer({renderMarkdown:async(text)=>{rendered.push(text);},openSource:async()=>{}}).render(root as any,readingContent([a,b,c,d,e,f],{execution:[g,h],verification:[],delivery:[]}));
  assert.deepEqual(rendered,["较早","同号A","同号B","同号执行","缺位置","null位置","非法位置","非整数"]);
  assert.match(root.allText().join("\n"),/部分段落无可靠位置.*API 原文/);assert.doesNotMatch(root.allText().join("\n"),/第 1\.2 行/);
  assert.equal(root.findByClass("flowdesk-content-source").length,9);
});
