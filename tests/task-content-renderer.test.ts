import assert from "node:assert/strict";
import test from "node:test";
import { TaskContentRenderer } from "../src/task-content-renderer.ts";
import { TestElement } from "./support/dom.ts";

const section={heading:"Execution Result (2026-10-01 10:00)",level:2,text:"\n原文\n```ts\nconst x=1;\n```",source:{section:"Execution Result",line_start:10}};
test("all Markdown and repeated rounds are rendered intact with latest expanded and source preserved", async()=>{
  const root=new TestElement();const markdown:string[]=[];const opened:any[]=[];
  const renderer=new TaskContentRenderer({renderMarkdown:async(text,el,id)=>{markdown.push(text);(el as any).setText(text);},openSource:async(id,s)=>{opened.push([id,s]);}});
  const content:any={taskId:"Tasks/A.md",goal:"目标\n",why:"背景\n",scopeText:"范围\n",steps:"- [ ] 步骤",domainSections:[{...section,heading:"根因"},{...section,heading:"Review Record"}],records:{execution:[section,{...section,text:"第二轮"}],verification:[section],delivery:[section]},requirements:[{text:"需求原文",source:{section:"Requirements"}}],scenarios:[],acceptance:[{text:"验收原文",checked:true}]};
  renderer.render(root as any,content);
  assert.ok(markdown.includes(section.text));assert.ok(markdown.includes("第二轮"));assert.ok(markdown.includes("背景\n"));
  const rounds=root.findByClass("flowdesk-record-round");assert.equal(rounds.length,4);assert.equal(rounds[0].open,false);assert.equal(rounds[1].open,true);
  assert.match(root.allText().join("\n"),/原文勾选/);
  assert.doesNotMatch(root.allText().join("\n"),/验收通过|证据有效|复核任务/);
  await root.findByClass("flowdesk-content-source")[4].click();
  assert.ok(opened.some(x=>x[0]==="Tasks/A.md"));
});
