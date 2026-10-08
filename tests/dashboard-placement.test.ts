import test from "node:test";
import assert from "node:assert/strict";
import { openDashboardInMain, selectContentLeaf } from "../src/dashboard-placement";

const dashboardType = "flowdesk-dashboard-view";
const leaf = (type: string, pinned = false) => ({ view: { getViewType: () => type }, getViewState: () => ({ pinned }) });
test("ordinary navigation reuses a content tab while the Dashboard is active", () => {
  const dashboard = leaf(dashboardType), content = leaf("markdown");
  const calls: unknown[] = [];
  const workspace = { getLeaf(type: false | "tab") { calls.push(type); return dashboard; }, getMostRecentLeaf: () => content };
  assert.equal(selectContentLeaf(workspace, dashboardType), content);
  assert.deepEqual(calls, [false]);
});
test("ordinary navigation creates a content tab only when every existing tab is protected", () => {
  const dashboard = leaf(dashboardType), pinned = leaf("markdown", true), content = leaf("empty");
  const calls: unknown[] = [];
  const workspace = { getLeaf(type: false | "tab") { calls.push(type); return type === false ? dashboard : content; }, getMostRecentLeaf: () => pinned, iterateRootLeaves(visit: (value: typeof dashboard) => void) { [dashboard, pinned].forEach(visit); } };
  assert.equal(selectContentLeaf(workspace, dashboardType), content);
  assert.deepEqual(calls, [false, "tab"]);
});
test("Cmd navigation creates a new tab even when another content tab exists", () => {
  const content = leaf("markdown"), created = leaf("empty");
  const calls: unknown[] = [];
  const workspace = { getLeaf(type: false | "tab") { calls.push(type); return created; }, getMostRecentLeaf: () => content };
  assert.equal(selectContentLeaf(workspace, dashboardType, true), created);
  assert.deepEqual(calls, ["tab"]);
});
test("opening an independent main reader preserves reading choices and pins the new leaf", async () => {
  const order: string[] = [], reading = { resourcePath: "Notes/Sessions/Case.md", fontSize: 16, query: "report", scroll: 400 };
  let received: Record<string, unknown> | null = null;
  const destination = { async setViewState(state: Record<string, unknown>) { received = state; order.push("state"); },setPinned(value:boolean){assert.equal(value,true);order.push("pin");}, detach() { order.push("destination-close"); } };
  const workspace = { getLeaf: () => destination, async revealLeaf() { order.push("reveal"); } };
  assert.equal(await openDashboardInMain(workspace, dashboardType, reading,leaf=>{assert.equal(leaf,destination);order.push("validate");}), destination);
  assert.deepEqual(received, { type: dashboardType, active: true, state: {...reading,placement:"main"} });
  assert.deepEqual(order, ["state", "pin", "reveal", "validate"]);
});
test("failed main reader creation cleans up only the newly created destination", async () => {
  const order: string[] = [];
  const destination = { async setViewState() { throw new Error("read failed"); },setPinned(){order.push("pin");}, detach() { order.push("destination-close"); } };
  const workspace = { getLeaf: () => destination, revealLeaf() { order.push("reveal"); } };
  await assert.rejects(openDashboardInMain(workspace, dashboardType, {},()=>{order.push("validate");}), /read failed/);
  assert.deepEqual(order, ["destination-close"]);
});
