import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { CORE_ROOT, ownedEnvironment, updateCapabilities } from "./support/owned-environment";

// Catches losing the portable package's content/source contract, not wrapper identity.
test("independently compiled shared models preserve canonical content and source facts", async t => {
  const owned = await ownedEnvironment(t);
  const output = owned.path("dashboard-model.cjs");
  const entry = path.resolve("packages/dashboard-ui/src/model.ts");
  const executable = process.env.FLOWDESK_TEST_ESBUILD!;
  const args = [entry, "--bundle", "--platform=node", "--format=cjs", "--target=node20", "--metafile=" + owned.path("model-meta.json"), "--outfile=" + output];
  updateCapabilities(process.env.FLOWDESK_TEST_CAPS!, data => data.commands.push({executable,args,cwd:process.cwd()}));
  const compiled = spawnSync(executable,args,{env:process.env,encoding:"utf8"});
  assert.equal(compiled.status,0,"shared consumer must compile: " + compiled.stderr);
  const api = createRequire(import.meta.url)(output);
  const input = JSON.parse(readFileSync("tests/fixtures/work-case-canonical.json","utf8"));
  const before = JSON.stringify(input);
  const model = api.createWorkCaseViewModel(input,input.source.path);
  const presentation = api.createWorkCasePresentation(model);
  assert.equal(presentation.header.title,"Demo Case");
  assert.equal(model.current.progressSummary,"producer 已开始");
  assert.deepEqual(model.sections.outcome.map((x:any)=>x.text),["第一个 Outcome。","第二个 Outcome。"]);
  assert.equal(model.tasks.observationHealth,"healthy");
  assert.equal(model.related.plans[0],"[[Notes/Plans/Demo]]");
  assert.equal(JSON.stringify(input),before);
  assert.throws(()=>api.createWorkCaseViewModel(input,"Notes/Sessions/Foreign.md"));
  const task = JSON.parse(readFileSync(path.join(CORE_ROOT,"tests/fixtures/execution_snapshot/sdd_v3_real_root_snapshot.json"),"utf8"));
  const taskBefore = JSON.stringify(task);
  const taskModel = api.createDashboardViewModel(task,{expectedTaskPath:task.current_task.id});
  assert.equal(taskModel.currentTask.title,"FlowDesk SDD v3 原生 TaskNotes 父子模型重构与 Dashboard 对齐");
  assert.equal(taskModel.content.goal,"以统一 task 合同和 task-centric 控制台消除父子双合同，使任一 TaskNotes task 都能独立执行、验证和供人 review。");
  const content = {taskId:"Tasks/A.md",goal:"",why:"",scopeText:"",steps:"",
    domainSections:[{heading:"说明",level:2,text:"中间正文",source:{line_start:12,line_end:13}}],
    records:{execution:[{heading:"Execution Result",level:2,text:"先执行",source:{line_start:5,line_end:7}}],verification:[{heading:"Verification Result",level:2,text:"后验证",source:{line_start:20,line_end:22}}],delivery:[]},
    requirements:[],scenarios:[],acceptance:[]};
  assert.deepEqual(api.createTaskReadingSections(content).sections.map((x:any)=>x.section.text),["先执行","中间正文","后验证"]);
  assert.equal(JSON.stringify(task),taskBefore);
  const meta = JSON.parse(readFileSync(owned.path("model-meta.json"),"utf8"));
  assert.equal(Object.keys(meta.inputs).some(x=>x.includes("node_modules/")||x.includes("src/main.ts")),false);
});
