import assert from "node:assert/strict";
import test from "node:test";
import { TaskContentRenderer } from "../src/task-content-renderer.ts";
import { ReadingStateCache } from "../src/reading-state.ts";
import { TestElement } from "./support/dom.ts";

const section={heading:"Execution Result (2026-10-01 10:00)",level:2,text:"\n原文\n```ts\nconst x=1;\n```",source:{section:"Execution Result",line_start:10}};
test("all Markdown and repeated rounds remain readable with a single static acceptance list", async()=>{
  const root=new TestElement();const markdown:string[]=[];const opened:any[]=[];
  const renderer=new TaskContentRenderer({showSourceActions:true,renderMarkdown:async(text,el,id)=>{markdown.push(text);(el as any).setText(text);},openSource:async(id,s)=>{opened.push([id,s]);}});
  const content:any={taskId:"Tasks/A.md",goal:"目标\n",why:"背景\n",scopeText:"范围\n",steps:"- [ ] 步骤",domainSections:[{...section,heading:"根因"},{...section,heading:"Review Record"}],records:{execution:[section,{...section,text:"第二轮"}],verification:[section],delivery:[section]},requirements:[{text:"需求原文",source:{section:"Requirements"}}],scenarios:[],acceptance:[{text:"验收原文",checked:true}]};
  renderer.render(root as any,content);
  assert.ok(markdown.includes(section.text));assert.ok(markdown.includes("第二轮"));assert.ok(markdown.includes("背景\n"));
  const rounds=root.findByClass("flowdesk-record-round");assert.equal(rounds.length,3);assert.ok(rounds.every(round=>!round.open));
  const history=root.findByClass("flowdesk-process-records");assert.equal(history.length,1);assert.equal(history[0].open,false);
  assert.equal(history[0].querySelectorAll("details").length,0);
  assert.equal(history[0].findByClass("flowdesk-process-entry").length,6);
  assert.equal(history[0].findByClass("flowdesk-content-source").length,1);
  assert.equal(root.findByClass("flowdesk-acceptance-list").length,1);
  assert.doesNotMatch(root.allText().join("\n"),/验收通过|证据有效|复核任务/);
  await history[0].findByClass("flowdesk-content-source")[0].click();
  assert.ok(opened.some(x=>x[0]==="Tasks/A.md"));
});


const readingContent=(domainSections:any[],records:any)=>({taskId:"Tasks/Reading.md",goal:"",why:"",scopeText:"",steps:"",domainSections,records,requirements:[],scenarios:[],acceptance:[]});

const renderReadingContent=(content:any)=>{
  const root=new TestElement();
  new TaskContentRenderer({renderMarkdown:async(text,element)=>(element as any).setText(text),openSource:async()=>{}}).render(root as any,content);
  return root;
};
const disclosureByKey=(root:TestElement,key:string)=>root.querySelectorAll("details").find(element=>element.getAttribute("data-disclosure-key")===key)!;

test("a new task exposes specification and acceptance while optional groups remain folded",()=>{
  const content=readingContent([],{execution:[section],verification:[section],delivery:[section]}) as any;
  content.goal="任务目标原文";content.requirements=[{text:"第一条需求"},{text:"第二条需求"}];content.scenarios=[{text:"一个场景"}];content.acceptance=[{text:"验收原文",checked:false}];
  const before=JSON.stringify(content),root=renderReadingContent(content);
  assert.equal(disclosureByKey(root,"task-specification").open,true,"the task specification is readable on first visit");
  assert.equal(disclosureByKey(root,"acceptance").open,true,"acceptance is readable on first visit");
  for(const key of ["list:需求","list:场景","result:execution","result:verification","result:delivery","process-records"])assert.equal(disclosureByKey(root,key).open,false,`${key} remains optional`);
  assert.equal(disclosureByKey(root,"list:需求").querySelectorAll("summary")[0].textContent,"需求 · 2 条");
  assert.equal(disclosureByKey(root,"list:场景").querySelectorAll("summary")[0].textContent,"场景 · 1 条");
  assert.equal(JSON.stringify(content),before);
});

test("saved explicit closed choices override reading defaults after a refresh and transfer",()=>{
  const content=readingContent([],{execution:[section],verification:[],delivery:[]}) as any;
  content.requirements=[{text:"需求原文"}];content.acceptance=[{text:"验收原文",checked:true}];
  const first=renderReadingContent(content),cache=new ReadingStateCache();
  assert.equal(disclosureByKey(first,"task-specification").open,true);
  assert.equal(disclosureByKey(first,"acceptance").open,true);
  disclosureByKey(first,"task-specification").open=false;disclosureByKey(first,"acceptance").open=false;
  disclosureByKey(first,"list:需求").open=true;disclosureByKey(first,"process-records").open=true;
  cache.capture("task:Tasks/Reading.md",first as any);
  const transferred=new ReadingStateCache();transferred.restoreSnapshot(cache.snapshot());
  const refreshed=renderReadingContent(content);transferred.restore("task:Tasks/Reading.md",refreshed as any);
  assert.equal(disclosureByKey(refreshed,"task-specification").open,false);
  assert.equal(disclosureByKey(refreshed,"acceptance").open,false);
  assert.equal(disclosureByKey(refreshed,"list:需求").open,true);
  assert.equal(disclosureByKey(refreshed,"process-records").open,true);
  const other=renderReadingContent({...content,taskId:"Tasks/Other.md"});transferred.restore("task:Tasks/Other.md",other as any);
  assert.equal(disclosureByKey(other,"task-specification").open,true);
  assert.equal(disclosureByKey(other,"acceptance").open,true);
  assert.equal(disclosureByKey(other,"list:需求").open,false);
  assert.equal(disclosureByKey(other,"process-records").open,false);
});

test("changed item counts retain the focused requirement group and its expanded choice",()=>{
  const content=readingContent([],{execution:[],verification:[],delivery:[]}) as any;
  content.requirements=[{text:"需求一"},{text:"需求二"}];
  const first=renderReadingContent(content),group=disclosureByKey(first,"list:需求"),summary=group.querySelectorAll("summary")[0],cache=new ReadingStateCache();
  group.open=true;summary.focus();cache.capture("task:Tasks/Reading.md",first as any);
  const refreshed=renderReadingContent({...content,requirements:[...content.requirements,{text:"需求三"}]}),nextGroup=disclosureByKey(refreshed,"list:需求"),nextSummary=nextGroup.querySelectorAll("summary")[0];
  cache.restore("task:Tasks/Reading.md",refreshed as any);
  assert.equal(nextSummary.textContent,"需求 · 3 条");
  assert.equal(nextSummary.getAttribute("data-focus-key"),"disclosure:list:需求");
  assert.equal(nextGroup.open,true);
  assert.equal(refreshed.ownerDocument.activeElement,nextSummary,"focus follows the same group when its count changes");
});

test("folded result groups identify recent excerpts without presenting unconfirmed rounds as latest",()=>{
  const earlier={heading:"Execution Result",level:2,text:"早期执行正文",source:{line_start:10}};
  const latest={heading:"Execution Result",level:2,text:"最近执行首段\n\n最近执行完整尾部",source:{line_start:30}};
  const verification={heading:"Verification Result",level:2,text:"验证首段\n\n验证完整尾部",source:{line_start:40}};
  const delivery={heading:"Delivery Record",level:2,text:"交付首段\n\n交付完整尾部",source:{line_start:50}};
  const content=readingContent([],{execution:[latest,earlier],verification:[verification],delivery:[delivery]}),before=JSON.stringify(content),root=renderReadingContent(content);
  for(const [key,title,excerptText] of [["result:execution","最近执行结果 · 摘录","最近执行首段"],["result:verification","最近验证结果 · 摘录","验证首段"],["result:delivery","最近交付记录 · 摘录","交付首段"]]) {
    const group=disclosureByKey(root,key);assert.equal(group.open,false);
    assert.equal(group.querySelectorAll("summary")[0].textContent,title);
    assert.ok(group.allText().includes(excerptText));assert.doesNotMatch(group.allText().join("\n"),/完整尾部|早期执行正文/);
  }
  const history=disclosureByKey(root,"process-records");assert.equal(history.open,false);
  assert.deepEqual(history.findByClass("flowdesk-process-entry").map(entry=>entry.findByClass("flowdesk-contract-scope-markdown")[0].textContent),[earlier.text,latest.text,verification.text,delivery.text]);
  const uncertain=renderReadingContent(readingContent([],{execution:[earlier,{...latest,source:undefined}],verification:[],delivery:[]}));
  assert.equal(disclosureByKey(uncertain,"result:execution").querySelectorAll("summary")[0].textContent,"执行结果 · 最近记录未确认");
  assert.equal(JSON.stringify(content),before);
});
test("results_keep_source_order_across_record_types_and_plain_h3",async()=>{
  const e={heading:"Execution Result",level:2,text:"执行正文",source:{line_start:10,line_end:12}};
  const h3={heading:"普通标题",level:3,text:"普通H3正文",source:{line_start:14,line_end:17}};
  const v={heading:"Verification Result",level:2,text:"验证正文",source:{line_start:20,line_end:22}};
  const manual={heading:"人工说明",level:2,text:"人工说明正文",source:{line_start:25,line_end:27}};
  const d={heading:"Delivery Record",level:2,text:"交付正文",source:{line_start:30,line_end:32}};
  const content=readingContent([h3,manual],{execution:[e],verification:[v],delivery:[d]});const original=JSON.stringify(content);
  const rendered:string[]=[],opened:any[]=[],root=new TestElement();
  new TaskContentRenderer({showSourceActions:true,renderMarkdown:async(text,el)=>{if((el as any).parentElement.classes.has("flowdesk-process-entry"))rendered.push(text);(el as any).setText(text);},openSource:async(id,section)=>{opened.push([id,section]);}}).render(root as any,content);
  assert.deepEqual(rendered,["执行正文","普通H3正文","验证正文","人工说明正文","交付正文"]);
  const output=root.allText().join("\n");assert.match(output,/执行结果/);assert.match(output,/验证结果/);assert.match(output,/交付记录/);assert.match(output,/普通标题/);assert.doesNotMatch(output,/正文 · H[23]|H3.*普通标题/);
  const sources=root.findByClass("flowdesk-record-round").flatMap(round=>round.findByClass("flowdesk-content-source"));
  for(const source of sources)await source.click();
  assert.deepEqual(opened.map(x=>x[1]),[e,v,d]);assert.equal(opened[1][1],v);assert.equal(opened[1][1].source,v.source);
  assert.ok(root.findByClass("flowdesk-record-round").every(round=>!round.open));assert.equal(JSON.stringify(content),original);
});

test("acceptance stays one list with true false and absent marks preserved, no interactive checkbox",async()=>{
  const content=readingContent([],{execution:[],verification:[],delivery:[]}) as any;
  content.acceptance=[{text:"测试方案经用户确认",checked:true},{text:"记录验证结果",checked:false},{text:"历史纯 bullet",checked:null}];
  const root=new TestElement();
  new TaskContentRenderer({renderMarkdown:async(text,el)=>{(el as any).setText(text);},openSource:async()=>{}}).render(root as any,content);
  assert.equal(root.findByClass("flowdesk-acceptance-list").length,1);
  assert.equal(root.findByClass("flowdesk-acceptance-item").length,3);
  assert.deepEqual(root.findByClass("flowdesk-acceptance-marker").map(x=>x.attrs["aria-label"]),["原文已勾选","原文未勾选","原文无勾选标记"]);
  assert.equal(root.querySelectorAll("input").length,0);
  assert.equal(root.allText().filter(x=>x.includes("验收原文条目")).length,0);
  assert.ok(root.allText().includes("历史纯 bullet"));
});

test("repeated_headings_and_missing_sources_preserve_every_section",async()=>{
  const make=(text:string,line:any)=>({heading:"重复标题",level:2,text,source:line===undefined?undefined:{line_start:line}});
  const a=make("同号A",5),b=make("同号B",5),c=make("缺位置",undefined),d=make("null位置",null),e=make("非法位置",0),f=make("较早",2),g=make("同号执行",5),h=make("非整数",1.2);
  const root=new TestElement(),rendered:string[]=[];
  new TaskContentRenderer({showSourceActions:true,renderMarkdown:async(text,el)=>{if((el as any).parentElement.classes.has("flowdesk-process-entry"))rendered.push(text);},openSource:async()=>{}}).render(root as any,readingContent([a,b,c,d,e,f],{execution:[g,h],verification:[],delivery:[]}));
  assert.deepEqual(rendered,["较早","同号A","同号B","同号执行","缺位置","null位置","非法位置","非整数"]);
  assert.match(root.allText().join("\n"),/部分段落无可靠位置.*原文件/);assert.doesNotMatch(root.allText().join("\n"),/第 1\.2 行/);
  assert.equal(root.findByClass("flowdesk-content-source").length,2);
  assert.match(root.findByClass("flowdesk-record-round")[0].allText().join("\n"),/无法确认最近一轮/);
});

test("daily reader shows at most three source-ordered progress excerpts and preserves every full event without source controls",async()=>{
  const progress={heading:"Progress",level:2,text: "> [!faq]- 详细过程日志\n> - [x] `2026-10-01 01:17` 第一轮原文。\n> - [x] `2026-10-02T01:00:00Z` 第二轮原文。\n> - [x] `2026-10-03T01:00:00Z` 第三轮原文。\n>   下一步：历史Next。\n> - [x] `2026-10-04T01:00:00Z` 第四轮原文。\n>   ```md\n>   ## 围栏内正文\n>   - [x] 不是新事件\n>   ```\n> - [x] `2026-10-04T02:00:00Z` 第五轮原文。\n>   操作：保留原引用",source:{line_start:10,line_end:24}};
  const content=readingContent([progress],{execution:[],verification:[],delivery:[]}),before=JSON.stringify(content),root=new TestElement();
  new TaskContentRenderer({renderMarkdown:async(text,element)=>{(element as any).setText(text);},openSource:async()=>{}}).render(root as any,content);
  const recent=root.findByClass("flowdesk-log-recent")[0];assert.ok(recent);
  assert.equal(recent.findByClass("flowdesk-log-entry").length,3);
  const text=recent.allText().join("\n");assert.ok(text.indexOf("第五轮")<text.indexOf("第四轮"));assert.ok(text.indexOf("第四轮")<text.indexOf("第三轮"));assert.doesNotMatch(text,/第一轮|第二轮/);
  const all=root.findByClass("flowdesk-log-all")[0];assert.equal(all.open,false);
  assert.equal(all.findByClass("flowdesk-log-entry").length,0,"collapsed history does not render Markdown or create events");
  assert.equal(root.findByClass("flowdesk-content-source").length,0);
  assert.equal(JSON.stringify(content),before);
  await all.querySelectorAll("summary")[0].click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(all.findByClass("flowdesk-log-entry").length,5);
  assert.match(all.allText().join("\n"),/历史Next|## 围栏内正文|不是新事件|保留原引用/);
  assert.equal(all.open,true);assert.equal((recent as any).hidden,true);
  await all.querySelectorAll("summary")[0].click();
  assert.equal(all.open,false);assert.equal((recent as any).hidden,false);
});

test("full history renders only the requested batch and an aborted resource stops queued Markdown",async()=>{
  const events=Array.from({length:61},(_,index)=>`> - [x] \`2026-10-04T01:00:00Z\` 原记录${index}`);
  const progress={heading:"Progress",level:2,text:["> [!faq]- 详细过程日志",...events].join("\n"),source:{line_start:1,line_end:63}};
  const root=new TestElement(),signal=new AbortController(),fullTexts:string[]=[];
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  new TaskContentRenderer({signal:signal.signal,renderMarkdown:async(text,element)=>{
    if((element as any).classes.has("flowdesk-log-body")){fullTexts.push(text);await gate;}
    (element as any).setText(text);
  },openSource:async()=>{}}).render(root as any,readingContent([progress],{execution:[],verification:[],delivery:[]}));
  const all=root.findByClass("flowdesk-log-all")[0];assert.equal(all.findByClass("flowdesk-log-entry").length,0);
  await all.querySelectorAll("summary")[0].click();
  assert.equal(all.findByClass("flowdesk-log-entry").length,12);assert.equal(fullTexts.length,1);
  signal.abort();release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fullTexts.length,1,"no remaining history render after resource removal");
});

test("older history batches preserve all 61 source events exactly once in display order",async()=>{
  const text=["> [!faq]- 详细过程日志",...Array.from({length:61},(_,index)=>`> - [x] \`2026-10-04T01:00:00Z\` 原记录${index}`)].join("\n");
  const root=new TestElement();
  new TaskContentRenderer({renderMarkdown:async(text,element)=>(element as any).setText(text),openSource:async()=>{}}).render(root as any,readingContent([{heading:"Progress",level:2,text,source:{line_start:1,line_end:63}}],{execution:[],verification:[],delivery:[]}));
  const all=root.findByClass("flowdesk-log-all")[0],more=root.findByClass("flowdesk-log-more")[0] as any;
  await all.querySelectorAll("summary")[0].click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(all.findByClass("flowdesk-log-entry").length,12);
  while(!more.hidden){await more.click();await new Promise(resolve=>setImmediate(resolve));}
  const entries=all.findByClass("flowdesk-log-entry");
  assert.deepEqual(entries.map(entry=>Number(entry.attrs["data-source-index"])),Array.from({length:61},(_,index)=>60-index));
});

test("unrecognized or truncated Progress stays complete in original reading instead of silently dropping its tail",()=>{
  for(const source of [{line_start:2,line_end:8},{line_start:2,line_end:8,truncated:true}]) {
    const text="> [!faq]- 详细过程日志\n> - [x] `2026-10-04T01:00:00Z` 可读开头\n未引用的关键尾部";
    const root=new TestElement(),rendered:string[]=[];
    new TaskContentRenderer({renderMarkdown:async(value,element)=>{rendered.push(value);(element as any).setText(value);},openSource:async()=>{}}).render(root as any,readingContent([{heading:"Progress",level:2,text,source}],{execution:[],verification:[],delivery:[]}));
    assert.ok(rendered.includes(text));assert.equal(root.findByClass("flowdesk-log-recent").length,0);
  }
});
