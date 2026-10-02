import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { WorkCaseAdapter } from "../src/work-case-adapter";
import { FrozenTaskAdapter } from "../src/frozen-task-adapter";
import { ViewShellController } from "../src/view-shell";

const canonical = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "work-case-canonical.json"),
    "utf8"
  )
);

interface PendingCaseLoad {
  path: string;
  signal: AbortSignal;
  resolve(snapshot: unknown): void;
  reject(error: Error): void;
}

function createHarness() {
  const pending: PendingCaseLoad[] = [];
  let shell!: ViewShellController;
  const caseAdapter = new WorkCaseAdapter({
    shell: () => shell,
    loadSnapshot: (casePath, signal) =>
      new Promise((resolve, reject) => {
        pending.push({ path: casePath, signal, resolve, reject });
      }),
    render: () => {},
    requestRender: () => {},
    nowLabel: () => "12:00:00",
  });
  const taskAdapter = new FrozenTaskAdapter({
    shell: () => shell,
    loadSnapshot: async (taskPath) => ({
      snapshot_schema_version: 3,
      snapshot_model: "task-centric",
      source_task_id: taskPath,
    } as any),
    render: () => {},
    requestRender: () => {},
    nowLabel: () => "12:00:00",
  });
  shell = new ViewShellController([taskAdapter, caseAdapter]);
  return { caseAdapter, pending, shell };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

test("迟到 Case snapshot 不得污染最终 Task selection", async () => {
  const harness = createHarness();
  const caseLoad = harness.shell.select({
    kind: "case",
    resourcePath: canonical.source.path,
  });
  assert.equal(harness.pending.length, 1);

  await harness.shell.select({ kind: "task", resourcePath: "Tasks/A.md" });
  assert.equal(harness.pending[0].signal.aborted, true);
  harness.pending[0].resolve(canonical);
  await caseLoad;

  assert.deepEqual(harness.shell.context, {
    kind: "task",
    resourcePath: "Tasks/A.md",
  });
  assert.equal(harness.caseAdapter.getRenderState(), null);
});

test("identity mismatch 拒绝渲染，重新打开合法 Case 可恢复", async () => {
  const harness = createHarness();
  const pathA = "Notes/Sessions/A.md";
  const failed = harness.shell.select({ kind: "case", resourcePath: pathA });
  harness.pending[0].resolve(canonical);
  await failed;
  assert.match(harness.caseAdapter.getRenderState()?.error ?? "", /来源身份/);
  assert.equal(harness.caseAdapter.getRenderState()?.model, null);

  await harness.shell.select({ kind: "task", resourcePath: "Tasks/A.md" });
  const recovered = harness.shell.select({
    kind: "case",
    resourcePath: canonical.source.path,
  });
  await settle();
  harness.pending[1].resolve(canonical);
  await recovered;
  assert.equal(harness.caseAdapter.getRenderState()?.model?.workCase.title, "Demo Case");
});

test("同一 Case 刷新失败保留可读主体并明确 stale，切换后清空", async () => {
  const harness = createHarness();
  const context = { kind: "case", resourcePath: canonical.source.path };
  const first = harness.shell.select(context);
  harness.pending[0].resolve(canonical);
  await first;

  const refresh = harness.caseAdapter.refresh();
  await settle();
  harness.pending[1].reject(new Error("producer crashed"));
  await refresh;
  assert.equal(harness.caseAdapter.getRenderState()?.model?.workCase.title, "Demo Case");
  assert.match(harness.caseAdapter.getRenderState()?.staleReason ?? "", /producer crashed/);

  await harness.shell.select({ kind: "task", resourcePath: "Tasks/C.md" });
  assert.equal(harness.caseAdapter.getRenderState(), null);
});

test("同一 Case 刷新发生 identity mismatch 时清空旧主体并 fail closed", async () => {
  const harness = createHarness();
  const context = { kind: "case", resourcePath: canonical.source.path };
  const first = harness.shell.select(context);
  harness.pending[0].resolve(canonical);
  await first;
  assert.equal(harness.caseAdapter.getRenderState()?.model?.workCase.title, "Demo Case");

  const refresh = harness.caseAdapter.refresh();
  await settle();
  harness.pending[1].resolve({
    ...canonical,
    source: { ...canonical.source, identity_match: false },
  });
  await refresh;

  assert.equal(harness.caseAdapter.getRenderState()?.model, null);
  assert.match(harness.caseAdapter.getRenderState()?.error ?? "", /来源身份不匹配/);
});


test("late_same_case_response_cannot_overwrite_newer_generation even when abort ignored",async()=>{
  const h=createHarness();
  const old=h.shell.select({kind:"case",resourcePath:canonical.source.path});
  const newer=h.caseAdapter.refresh();
  h.pending[1].resolve({...canonical,work_case:{...canonical.work_case,title:"New"}});
  await newer;
  h.pending[0].resolve({...canonical,work_case:{...canonical.work_case,title:"Old"}});
  await old;
  assert.equal(h.caseAdapter.getRenderState()?.model?.workCase.title,"New");
  assert.equal(h.caseAdapter.getRenderState()?.error,"");
});

test("late error and finally cannot clear newer loading state",async()=>{
  const h=createHarness();
  const old=h.shell.select({kind:"case",resourcePath:canonical.source.path});
  const newer=h.caseAdapter.refresh();
  h.pending[0].reject(new Error("Old failure"));
  await old;
  assert.equal(h.caseAdapter.getRenderState()?.error,"");
  assert.equal(h.caseAdapter.getRenderState()?.loading,true);
  h.pending[1].resolve(canonical);await newer;
});

test("Case observes associated and potential Task paths only while active",async()=>{
  const h=createHarness();
  assert.equal(h.caseAdapter.observesFile("Tasks/New.md"),false);
  const load=h.shell.select({kind:"case",resourcePath:canonical.source.path});
  h.pending[0].resolve(canonical);await load;
  for(const path of [canonical.source.path,"Tasks/New.md","TaskNotes/Incoming.md"])
    assert.equal(h.caseAdapter.observesFile(path),true,path);
  assert.equal(h.caseAdapter.observesFile("Notes/Other.md"),false);
  await h.shell.select({kind:"unsupported",activePath:"Notes/Other.md",previousResourcePath:canonical.source.path});
  assert.equal(h.caseAdapter.observesFile("Tasks/New.md"),false);
});

test("scheduleRefresh marks dirty immediately, coalesces at trailing 500ms and deactivate cancels",async(t)=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  const h=createHarness();const load=h.shell.select({kind:"case",resourcePath:canonical.source.path});
  h.pending[0].resolve(canonical);await load;
  const adapter=h.caseAdapter as WorkCaseAdapter & {scheduleRefresh():void};
  assert.equal(typeof adapter.scheduleRefresh,"function");
  adapter.scheduleRefresh();
  assert.match(adapter.getRenderState()?.staleReason??"",/变化|刷新/);
  t.mock.timers.tick(400);adapter.scheduleRefresh();t.mock.timers.tick(499);
  assert.equal(h.pending.length,1);
  t.mock.timers.tick(1);assert.equal(h.pending.length,2);
  h.pending[1].resolve(canonical);await Promise.resolve();await Promise.resolve();
  assert.equal(adapter.getRenderState()?.staleReason,"");
  adapter.scheduleRefresh();
  await h.shell.select({kind:"unsupported",activePath:"Notes/Other.md",previousResourcePath:canonical.source.path});
  t.mock.timers.tick(500);assert.equal(h.pending.length,2);assert.equal(adapter.getRenderState(),null);
});


test("dirty event invalidates a pending load before the trailing generation begins",async(t)=>{
 t.mock.timers.enable({apis:["setTimeout"]});
 const h=createHarness();const initial=h.shell.select({kind:"case",resourcePath:canonical.source.path});
 h.pending[0].resolve(canonical);await initial;
 const old=h.caseAdapter.refresh();
 h.caseAdapter.scheduleRefresh();
 h.pending[1].resolve({...canonical,work_case:{...canonical.work_case,title:"Superseded"}});await old;
 assert.equal(h.caseAdapter.getRenderState()?.model?.workCase.title,"Demo Case");
 assert.match(h.caseAdapter.getRenderState()?.staleReason??"",/变化/);
 t.mock.timers.tick(500);
 h.pending[2].resolve({...canonical,work_case:{...canonical.work_case,title:"Latest"}});
 await Promise.resolve();await Promise.resolve();
 assert.equal(h.caseAdapter.getRenderState()?.model?.workCase.title,"Latest");
 assert.equal(h.caseAdapter.getRenderState()?.staleReason,"");
});
