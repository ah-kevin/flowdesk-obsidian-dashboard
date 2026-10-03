import assert from "node:assert/strict";
import test from "node:test";
import * as readingHelpers from "../src/task-content.ts";
import { createTaskContent, rawContentDiffers } from "../src/task-content.ts";
import { createDashboardViewModel } from "../src/snapshot-model.ts";
import { createDashboardPresentation } from "../src/dashboard-presentation.ts";
import { readFileSync } from "node:fs";

const baseline = JSON.parse(readFileSync("tests/fixtures/sdd_v4_real_root_snapshot.json", "utf8"));
test("task_content_preserves_all_sections_and_record_rounds", () => {
  const snapshot = structuredClone(baseline);
  const section = { heading: "根因", level: 2, text: "\n中文\n```ts\nlet x = 1;\n```\n", source: { section: "根因", line_start: 4, line_end: 9 } };
  Object.assign(snapshot.contract.task_contract ??= {}, { why: "  背景\n", steps: "- [ ] 步骤\n", scope_text: "原范围\n", domain_sections: [section, {...section}, { ...section, heading: "Review Record" }] });
  snapshot.current_task.records = { execution: [section, {...section,text:"第二轮\n"}], verification: [section], delivery:[section] };
  const content = createTaskContent(snapshot, snapshot.current_task.id);
  assert.equal(content.why, "  背景\n");
  assert.equal(content.steps, "- [ ] 步骤\n");
  assert.equal(content.domainSections.length, 3);
  assert.deepEqual(content.domainSections[0], section);
  assert.deepEqual(content.records, snapshot.current_task.records);
  const model = createDashboardViewModel(snapshot);
  assert.deepEqual(model.content, content);
  assert.deepEqual(model.records, content.records);
});
test("healthy_done_is_not_verification_pass", () => {
  const snapshot = structuredClone(baseline);
  snapshot.current_task.status = "done";
  snapshot.current_task.completion.trusted_done = true;
  const model = createDashboardViewModel(snapshot);
  const summary = createDashboardPresentation(model).contract;
  assert.deepEqual(summary.metrics, []);
  assert.doesNotMatch(JSON.stringify(summary), /证据有效|验收通过|0 \/ 3/);
});
test("legacy contract items and sources remain readable without trimming body", () => {
  const snapshot = { snapshot_schema_version: 3, contract: { goal:"  原文\n", scope:{included:["A"],excluded:["B"]}, requirements:[{id:"REQ-1",text:"正文\n",source:{section:"需求"}}] } };
  const content = createTaskContent(snapshot, "Tasks/旧版.md");
  assert.equal(content.goal, "  原文\n");
  assert.deepEqual(content.requirements, snapshot.contract.requirements);
  assert.match(content.scopeText, /A/);
});

test("raw comparison detects scope, acceptance and typed fragment changes without changing status", () => {
  const snapshot = structuredClone(baseline);
  snapshot.contract.task_contract = { goal: "目标", scope_text: "最新范围", acceptance: [{text:"新验收",checked:false}], requirements:[{text:"新需求"}], scenarios:[] };
  const content=createTaskContent(snapshot,snapshot.current_task.id);
  const raw:any={taskId:content.taskId,details:"目标\n旧范围\n旧验收\n旧需求",source:"tasknotes-api",readAt:"2026-10-02T03:00:00Z",error:null};
  assert.equal(rawContentDiffers(content,raw,snapshot),true);
});


test("reading_union_copies_arrays_and_keeps_exact_source_objects",()=>{
  const content=createTaskContent(structuredClone(baseline),baseline.current_task.id);
  const e={heading:"Execution Result",level:2,text:"E",source:{line_start:1,line_end:2}};
  const h3={heading:"普通标题",level:3,text:"H3",source:{line_start:3,line_end:4}};
  content.domainSections=[h3];content.records={execution:[e],verification:[],delivery:[]};
  const original=JSON.stringify(content),helper=(readingHelpers as any).createTaskReadingSections;
  assert.equal(typeof helper,"function");const result=helper(content);
  assert.equal(result.orderComplete,true);assert.deepEqual(result.sections.map((x:any)=>x.kind),["execution","domain"]);
  assert.equal(result.sections[1].section,h3);assert.equal(result.sections[0].section.source,e.source);assert.equal(JSON.stringify(content),original);
});
