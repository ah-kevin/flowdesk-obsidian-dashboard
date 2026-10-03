import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {buildTaskUpdate,sha256} from "@flowdesk-test/task-update-details";
import {createTaskContent,type TaskContent} from "../src/task-content";
import {createTaskCurrentProgress} from "../src/task-current-progress";
import {resumeFixture} from "./support/resume-fixture";
const context={statusIsCompleted:false,observationHealthy:true,observedAt:"2026-10-04T00:00:00Z"};
const progressSection=(content:TaskContent)=>content.domainSections.find(section=>section.heading==="Progress"&&section.level===2)!;

async function realContent(t:any,index=0){const fixture=await resumeFixture(t,2,true),snapshot=await fixture.taskSnapshot(fixture.tasks[index].id);return {fixture,snapshot,content:createTaskContent(snapshot,fixture.tasks[index].id)};}

test("snapshot_progress_displays_latest_event_without_api_read",async(t)=>{
  const {fixture,content}=await realContent(t);const before=JSON.stringify(content),requests=fixture.requests.length;
  const result=createTaskCurrentProgress(content,context);
  assert.equal(result.status,"current");assert.equal(result.progress,fixture.largeProgress);assert.equal(result.next,fixture.currentNext);assert.equal(result.timestamp,"2026-10-03T13:00:00+09:00");assert.equal(result.source,progressSection(content).source);assert.deepEqual(result.gaps,[]);
  assert.equal(JSON.stringify(content),before);assert.equal(fixture.requests.length,requests);
  const noReceipts=structuredClone(content);progressSection(noReceipts).text=progressSection(noReceipts).text.split("<!-- flowdesk.task-update/")[0].trimEnd();
  assert.equal(createTaskCurrentProgress(noReceipts,context).next,fixture.currentNext,"receipt presence is not display authorization or certification");
});

test("malformed_or_missing_snapshot_progress_stays_unknown",async(t)=>{
  const {content}=await realContent(t);
  const broken:Array<{label:string;content:TaskContent}>=[];
  const add=(label:string,mutate:(c:TaskContent)=>void)=>{const copy=structuredClone(content);mutate(copy);broken.push({label,content:copy});};
  add("missing section",c=>{c.domainSections=c.domainSections.filter(s=>s.heading!=="Progress");});
  add("wrong heading level",c=>{progressSection(c).level=3;});
  add("duplicate Progress",c=>{c.domainSections.push(structuredClone(progressSection(c)));});
  add("duplicate callout",c=>{const s=progressSection(c);s.text=s.text.replace("> [!faq]- 详细过程日志","> [!faq]- 详细过程日志\n> [!faq]- 详细过程日志");});
  add("unquoted partial structure",c=>{progressSection(c).text=progressSection(c).text.replace(">   操作：","unquoted 操作：");});
  add("unclosed content fence",c=>{const s=progressSection(c);s.text=s.text.replace("<!-- flowdesk.task-update/",">   ```ts\n<!-- flowdesk.task-update/");});
  add("bare line inside quoted fence",c=>{const s=progressSection(c);s.text=s.text.replace(">   const value = 1;","const value = 1;");});
  add("bare blank inside quoted fence",c=>{const s=progressSection(c);s.text=s.text.replace(">   const value = 1;","\n>   const value = 1;");});
  for(const source of [undefined,{line_start:0,line_end:10},{line_start:2.5,line_end:10},{line_start:10,line_end:2},{line_start:10,line_end:null}])add("unreliable source",c=>{progressSection(c).source=source;});
  add("explicit source truncation",c=>{progressSection(c).source!.truncated=true;});
  add("explicit source omission",c=>{progressSection(c).source!.omitted=true;});
  add("duplicate Next with date gap",c=>{const section=progressSection(c);section.text="> [!faq]- 详细过程日志\n> - [x] `2026-10-01 10:00:00 CST` 旧日期\n>   下一步：first\n>   下一步：second\n> - [x] `2026-10-03T13:00:00+09:00` 可比较日期";});
  add("nonblank after operation with date gap",c=>{const section=progressSection(c);section.text="> [!faq]- 详细过程日志\n> - [x] 无时间事件\n>   操作：旧标记\n>   破损尾部正文\n> - [x] `2026-10-03T13:00:00+09:00` 可比较日期";});
  for(const {label,content:input} of broken){const result=createTaskCurrentProgress(input,context);assert.equal(result.status,"unknown",label);assert.equal(result.next,null,label);assert.equal(result.progress,null,label);assert.ok(result.gaps.length,label);}
  assert.equal(createTaskCurrentProgress(content,{...context,observationHealthy:false}).status,"unknown");
});

test("same_instant_conflict_and_submillisecond_events_are_not_ordered_by_line",async(t)=>{
  const {fixture}=await realContent(t);const task=fixture.tasks[0];
  const update=(timestamp:string,progress:string)=>{const result=buildTaskUpdate(task.details,task.status,{task_id:task.id,operation_id:randomUUID(),expected:{task_id:task.id,status:task.status,details_sha256:sha256(task.details)},timestamp,mode:"progress",checks:[],progress,next:progress});task.details=result.details;task.status=result.status;};
  update("2026-10-03T04:00:00Z","同刻冲突");
  assert.equal(createTaskCurrentProgress(createTaskContent(await fixture.taskSnapshot(task.id),task.id),context).status,"unknown");
  // Build a separate real writer body where fractional instants cannot collapse to milliseconds.
  task.details="## 目标\n\nowned fractional test";task.status="in-progress";
  update("2026-10-03T04:00:00.123789Z","精度较新的事件");update("2026-10-03T04:00:00.123456Z","行号较后但时刻较早");
  const result=createTaskCurrentProgress(createTaskContent(await fixture.taskSnapshot(task.id),task.id),context);assert.equal(result.status,"current");assert.equal(result.progress,"精度较新的事件");
});

test("terminal_lifecycle_never_exposes_old_next_as_current",async(t)=>{
  const {content,fixture}=await realContent(t,1);assert.equal(fixture.tasks[1].status,"done");assert.ok(fixture.tasks[1].details.includes("完成：结果、验证及交付已记录。"));assert.ok(fixture.tasks[1].details.includes("- [ ] 写后通知（旧项原文）。"));
  const terminal=createTaskCurrentProgress(content,{...context,statusIsCompleted:true});assert.equal(terminal.status,"historical");assert.equal(terminal.progress,"结果、验证及交付已记录。");assert.equal(terminal.next,null);
  const active=createTaskContent(await fixture.taskSnapshot(fixture.tasks[0].id),fixture.tasks[0].id);
  assert.equal(createTaskCurrentProgress(active,{...context,statusIsCompleted:true}).next,null);
  const unknown=createTaskCurrentProgress(active,{...context,statusIsCompleted:null});assert.equal(unknown.status,"unknown");assert.equal(unknown.next,null);assert.ok(unknown.gaps.length);
});

test("blocked_without_new_progress_does_not_fabricate_progress",async(t)=>{
  const {fixture}=await realContent(t);const task=fixture.tasks[0];
  for(const [timestamp,progress] of [["2026-10-03T14:00:00+08:00",undefined],["2026-10-03T15:00:00+08:00","阻塞前已做的真实进展"]] as const){
    const result=buildTaskUpdate(task.details,task.status,{task_id:task.id,operation_id:randomUUID(),expected:{task_id:task.id,status:task.status,details_sha256:sha256(task.details)},timestamp,checks:[],mode:"blocked",blocker:"受控外部条件未满足",next:"独立H2 Next不能冒充事件Next",...(progress?{progress}:{})});task.details=result.details;task.status=result.status;
    const current=createTaskCurrentProgress(createTaskContent(await fixture.taskSnapshot(task.id),task.id),context);assert.equal(current.status,"current");assert.equal(current.progress,progress??"阻塞及下一步已记录。");assert.equal(current.next,null);assert.match(current.gaps.join("\n"),/未提供 Next/);
  }
});


test("fences_on_first_progress_or_next_field_line_preserve_markdown_and_field_lookalikes",async(t)=>{
  const {fixture}=await realContent(t);const task=fixture.tasks[0];task.details="## 目标\n\nowned field-leading fence";task.status="in-progress";
  const progress="```md\n下一步：正文代码中的文字\n操作：不是结构字段\n```";
  const next="~~~md\n下一步：Next代码中的文字\n操作：仍是内容\n~~~";
  const result=buildTaskUpdate(task.details,task.status,{task_id:task.id,operation_id:randomUUID(),expected:{task_id:task.id,status:task.status,details_sha256:sha256(task.details)},timestamp:"2026-10-03T16:00:00+08:00",checks:[],mode:"progress",progress,next});task.details=result.details;task.status=result.status;
  const current=createTaskCurrentProgress(createTaskContent(await fixture.taskSnapshot(task.id),task.id),context);assert.equal(current.status,"current");assert.equal(current.progress,progress);assert.equal(current.next,next);
});


test("legacy_date_gaps_keep_readable_progress_without_claiming_latest_or_current_next",async(t)=>{
  const {content,fixture}=await realContent(t);
  for(const separator of ["\n","\n\n"])for(const legacy of ["> - [x] `2026-10-01 10:00:00 CST` 旧CST进展","> - [x] `2026-10-01T10:00:00` 旧无时区进展","> - [x] `2026-02-30T10:00:00Z` 旧非法日期进展","> - [x] 无时间的独立旧事件","> - [x] `` 无时间的旧事件"]){
    const input=structuredClone(content),section=progressSection(input);
    // Newline separation reflects the legacy Case shape; source remains the snapshot's whole section.
    section.text=section.text.split("<!-- flowdesk.task-update/")[0].trimEnd()+separator+legacy+"\n>   下一步：旧Next不能作为当前下一步";
    const before=JSON.stringify(input),result=createTaskCurrentProgress(input,context);
    assert.equal(result.status,"unknown",legacy);assert.equal(result.progress,fixture.largeProgress,legacy);assert.equal(result.next,null,legacy);
    assert.equal(result.timestamp,"2026-10-03T13:00:00+09:00");assert.equal(result.source,section.source);
    assert.match(result.gaps.join("\n"),/日期.*缺口|日期.*不完整/);assert.match(result.gaps.join("\n"),/最新性未知/);
    assert.doesNotMatch(result.gaps.join("\n"),/生命周期未知/);assert.equal(JSON.stringify(input),before);
    const terminal=createTaskCurrentProgress(input,{...context,statusIsCompleted:true});assert.equal(terminal.status,"unknown");assert.equal(terminal.next,null);
    const lifecycleUnknown=createTaskCurrentProgress(input,{...context,statusIsCompleted:null});assert.match(lifecycleUnknown.gaps.join("\n"),/生命周期未知/);
  }
});

test("undated_checked_row_is_an_independent_event_and_legacy_only_body_stays_unknown",async(t)=>{
  const {content}=await realContent(t),section=progressSection(content);
  section.text="> [!faq]- 详细过程日志\n> - [x] `2026-10-03T13:00:00+09:00` 有效进展\n>   下一步：可解析旧Next\n> - [x] 无时间的新片段";
  const mixed=createTaskCurrentProgress(content,context);assert.equal(mixed.progress,"有效进展");assert.equal(mixed.next,null);assert.equal(mixed.status,"unknown");
  section.text="> [!faq]- 详细过程日志\n\n> - [x] `2026-10-01 10:00:00 CST` 旧进展\n\n> - [x] 无时间的独立片段";
  const legacy=createTaskCurrentProgress(content,context);assert.equal(legacy.progress,null);assert.equal(legacy.timestamp,null);assert.equal(legacy.status,"unknown");assert.equal(legacy.next,null);assert.equal(legacy.source,null);
});

test("bare_legacy_blank_blocks_are_allowed_only_between_closed_events",async(t)=>{
  const {content}=await realContent(t),section=progressSection(content);
  section.text="> [!faq]- 详细过程日志\n\n> - [x] `2026-10-03T13:00:00+09:00` 可比最新片段\n>   下一步：当前Next\n>   操作：旧写入标记\n>\n \n\n> - [x] `2026-10-03T11:30:00+08:00` 较后但更早\n>   下一步：旧Next";
  const current=createTaskCurrentProgress(content,context);assert.equal(current.status,"current");assert.equal(current.progress,"可比最新片段");assert.equal(current.next,"当前Next");
  const historical=createTaskCurrentProgress(content,{...context,statusIsCompleted:true});assert.equal(historical.status,"historical");assert.equal(historical.next,null);
  for(const text of ["> [!faq]- 详细过程日志\n> - [x] `2026-10-03T13:00:00+09:00` 正文\n\n>   续行不能跨裸空行","> [!faq]- 详细过程日志\n> - [x] `2026-10-03T13:00:00+09:00` ```md\n\n> - [x] 无时间行处于坏围栏内","> [!faq]- 详细过程日志\n> - [x] `2026-10-03T13:00:00+09:00` 正文\n\n其他section正文\n> - [x] 无时间事件"]){
    section.text=text;const result=createTaskCurrentProgress(content,context);assert.equal(result.status,"unknown");assert.equal(result.progress,null);assert.equal(result.next,null);
  }
});


test("future_progress_date_is_not_ignored_as_a_legacy_gap",async(t)=>{
  const {content}=await realContent(t),section=progressSection(content);
  for(const legacy of ["","\n> - [x] 无时间的旧事件"]){
    section.text="> [!faq]- 详细过程日志\n> - [x] `2026-10-03T13:00:00+09:00` 可比进展\n>   下一步：旧Next\n> - [x] `2099-10-03T13:00:00Z` 未来异常"+legacy;
    const result=createTaskCurrentProgress(content,context);assert.equal(result.status,"unknown");assert.equal(result.progress,null);assert.equal(result.next,null);assert.match(result.gaps.join("\n"),/未来/);
  }
  section.text="> [!faq]- 详细过程日志\n> - [x] `2026-10-03T13:00:00+09:00` 可比进展\n>   下一步：旧Next";
  for(const observedAt of ["","not-a-date","2026-10-03T12:00:00"]){
    const result=createTaskCurrentProgress(content,{...context,observedAt});assert.equal(result.status,"unknown");assert.equal(result.progress,null);assert.equal(result.next,null);assert.match(result.gaps.join("\n"),/观测时间/);
  }
});


test("legacy_bare_and_quoted_blank_interval_cannot_bridge_content_or_unclosed_fence",async(t)=>{
  const {content}=await realContent(t),section=progressSection(content);
  const first="> [!faq]- 详细过程日志\n> - [x] `2026-10-03T13:00:00+09:00` 保留最新片段\n>   下一步：保留当前Next\n>   操作：旧标记";
  const interval="\n \n>\n\n>   \n";
  section.text=first+interval+"> - [x] `2026-10-03T11:30:00+08:00` 更早的另一事件";
  const current=createTaskCurrentProgress(content,context);assert.equal(current.status,"current");assert.equal(current.progress,"保留最新片段");assert.equal(current.next,"保留当前Next");
  for(const suffix of [">   续行不能跨裸空白","> [!info] 其他callout"]){
    section.text=first+interval+suffix;const result=createTaskCurrentProgress(content,context);assert.equal(result.progress,null);assert.equal(result.next,null);assert.equal(result.status,"unknown");
  }
  section.text="> [!faq]- 详细过程日志\n> - [x] `2026-10-03T13:00:00+09:00` ```md"+interval+"> - [x] `2026-10-03T11:30:00+08:00` 不得逃离围栏";
  const fence=createTaskCurrentProgress(content,context);assert.equal(fence.progress,null);assert.equal(fence.next,null);assert.equal(fence.status,"unknown");
});


test("canonical_quoted_blank_after_header_is_only_a_first_event_interval",async(t)=>{
  const {content}=await realContent(t),section=progressSection(content);
  const header="> [!faq]- 详细过程日志";
  const event="> - [x] `2026-10-03T13:00:00+09:00` 首事件进展\n>   下一步：首事件Next";
  for(const interval of ["\n>\n","\n>   \n>\n","\n>\n\n>   \n\n"]){
    section.text=header+interval+event;const result=createTaskCurrentProgress(content,context);assert.equal(result.status,"current");assert.equal(result.progress,"首事件进展");assert.equal(result.next,"首事件Next");
    const historical=createTaskCurrentProgress(content,{...context,statusIsCompleted:true});assert.equal(historical.status,"historical");assert.equal(historical.next,null);
    section.text=header+interval+event+"\n> - [x] `2026-10-01 10:00:00 CST` 旧事件";
    const mixed=createTaskCurrentProgress(content,context);assert.equal(mixed.status,"unknown");assert.equal(mixed.progress,"首事件进展");assert.equal(mixed.next,null);assert.match(mixed.gaps.join("\n"),/最新性未知/);
    for(const suffix of [">   首事件前的续行","> [!info] 其他callout",">   ```md", "非quoted非空正文"]){
      section.text=header+interval+suffix+"\n"+event;const rejected=createTaskCurrentProgress(content,context);assert.equal(rejected.status,"unknown");assert.equal(rejected.progress,null);assert.equal(rejected.next,null);
    }
  }
});


test("canonical_progress_survives_later_headings_without_receipt_based_display_authorization",async(t)=>{
  const {fixture}=await realContent(t),task=fixture.tasks[0];
  for(const laterHeading of [false,true])for(const legacy of [false,true]){
    task.details="## 目标\n\nOwned projection regression.\n\n## Progress\n\n> [!faq]- 详细过程日志\n"+
      (legacy?"> - [x] `2026-10-01 10:00` 旧日期原文。\n":"")+
      (laterHeading?"\n## 历史说明\n\n独立历史段，不与 Progress 拼接。\n":"");
    task.status="in-progress";
    const update=buildTaskUpdate(task.details,task.status,{task_id:task.id,operation_id:randomUUID(),expected:{task_id:task.id,status:task.status,details_sha256:sha256(task.details)},timestamp:"2026-10-03T13:00:00Z",mode:"progress",checks:[],progress:"真实 writer 新进展 **原文**",next:"新 Next 仅在当前性可确认时显示。"});
    task.details=update.details;task.status=update.status;
    const snapshot=await fixture.taskSnapshot(task.id),content=createTaskContent(snapshot,task.id),section=progressSection(content);
    assert.ok(section,"projection missing: laterHeading="+laterHeading+", legacy="+legacy);
    assert.equal(section.source?.line_start,5);
    assert.ok(section.text.includes("真实 writer 新进展 **原文**"));
    assert.equal(section.text.includes("旧日期原文。"),legacy);
    assert.equal(section.text.includes("<!-- flowdesk.task-update/"),!laterHeading);
    assert.ok(!section.text.includes("独立历史段"));
    const requests=fixture.requests.length,current=createTaskCurrentProgress(content,context);
    assert.equal(current.status,legacy?"unknown":"current");
    assert.equal(current.progress,"真实 writer 新进展 **原文**");
    assert.equal(current.next,legacy?null:"新 Next 仅在当前性可确认时显示。");
    assert.equal(current.timestamp,"2026-10-03T13:00:00Z");
    assert.equal(current.source,section.source);
    if(legacy)assert.match(current.gaps.join("\n"),/日期.*缺口.*最新性未知/);
    assert.equal(fixture.requests.length,requests,"display performs no additional API read");
    assert.equal(snapshot.snapshot_schema_version,4);
    assert.equal(snapshot.protocol.producer_protocol_version,4);
  }
});

test("real_producer_preserves_duplicate_and_malformed_progress_for_unknown_display",async(t)=>{
  const {fixture}=await realContent(t),task=fixture.tasks[0];
  for(const body of [
    "> [!faq]- 详细过程日志\n> - [x] `2026-10-03T13:00:00Z` 第一候选。\n\n## Progress\n\n> [!faq]- 详细过程日志\n>   缺事件的候选。",
    "> [!faq]- 详细过程日志\n>   只有续行，没有事件。",
    "人工普通正文不符合 canonical callout。",
  ]){
    task.details="## 目标\n\nOwned projection regression.\n\n## Progress\n\n"+body;task.status="in-progress";
    const content=createTaskContent(await fixture.taskSnapshot(task.id),task.id),requests=fixture.requests.length;
    assert.equal(content.domainSections.filter(s=>s.heading==="Progress"&&s.level===2).length,body.includes("\n## Progress")?2:1);
    const current=createTaskCurrentProgress(content,context);
    assert.equal(current.status,"unknown");assert.equal(current.progress,null);assert.equal(current.next,null);
    assert.equal(fixture.requests.length,requests);
  }
});
