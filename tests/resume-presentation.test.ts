import assert from "node:assert/strict";
import test from "node:test";
import { createWorkCaseViewModel } from "../src/work-case-model.ts";
import { createResumePresentation } from "../src/resume-presentation.ts";
import { resumeFixture } from "./support/resume-fixture.ts";

test("producer_bundle_keeps_latest_canonical_next_and_sources via real writer/Case CLI",async(t)=>{
  const fixture=await resumeFixture(t);const snapshot=await fixture.snapshot();
  assert.equal(snapshot.resume_bundle.tasks[0].next,"核对中文文档（最新）");
  const model=createWorkCaseViewModel(snapshot,fixture.casePath);
  assert.deepEqual(model.resumeBundle,snapshot.resume_bundle);
  const presentation=createResumePresentation(model.resumeBundle,model);
  assert.equal(presentation.tasks[0].next,snapshot.resume_bundle.tasks[0].next);
  assert.equal(presentation.tasks[1].result,snapshot.resume_bundle.tasks[1].result);
  assert.deepEqual(presentation.tasks[0].sources,snapshot.resume_bundle.tasks[0].resume_sources);
  assert.match(presentation.summary,/仅引用/);assert.match(presentation.continuationInstructions,/旧.*执行|原.*owner/);
  assert.equal(presentation.history.nativeId,"native-original-id");
  assert.doesNotMatch(presentation.summary,/writer已释放|可自动接管/);
  assert.equal(fixture.originalCase(),fixture.caseText);
});
test("ambiguous_next_does_not_become_instruction and omitted UTF8 projection remain visible",async(t)=>{
  const fixture=await resumeFixture(t,66);
  fixture.tasks[0].details="## 目标\n\n"+"中文".repeat(1200)+"\n\n## Next\n\nA\n\n## Next\n\nB\n";
  const snapshot=await fixture.snapshot(),model=createWorkCaseViewModel(snapshot,fixture.casePath);
  const presentation=createResumePresentation(model.resumeBundle,model);
  assert.equal(presentation.tasks[0].next,null);
  assert.ok(presentation.tasks[0].sources.some(x=>x.field==="next_candidate"));
  assert.ok(presentation.gaps.some(x=>x.includes("ambiguous_next")));
  assert.ok(presentation.gaps.some(x=>x.includes("2")&&/省略|omitted/.test(x)));
  assert.match(presentation.summary,/included_bytes|字节/);
});
test("missing bundle, partial/401 and wrong source never produce healthy empty resume",async(t)=>{
  const fixture=await resumeFixture(t);const snapshot=await fixture.snapshot();
  delete snapshot.resume_bundle;const legacy=createWorkCaseViewModel(snapshot,fixture.casePath);
  const missing=createResumePresentation(legacy.resumeBundle,legacy);
  assert.ok(missing.gaps.length);assert.equal(missing.tasks.length,0);
  fixture.setPartial(true);const partial=createWorkCaseViewModel(await fixture.snapshot(),fixture.casePath);
  assert.match(createResumePresentation(partial.resumeBundle,partial).gaps.join("\n"),/完整|complete|partial/);
  fixture.setCode(401);const failed=createWorkCaseViewModel(await fixture.snapshot(),fixture.casePath);
  assert.ok(createResumePresentation(failed.resumeBundle,failed).gaps.length);
  const malformed=await (async()=>{fixture.setCode(200);return fixture.snapshot();})();malformed.resume_bundle.tasks[0].resume_sources[0].task_id="Tasks/wrong.md";
  assert.throws(()=>createWorkCaseViewModel(malformed,fixture.casePath),/resume|来源|identity/i);
});
