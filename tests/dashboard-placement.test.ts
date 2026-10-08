import test from "node:test";
import assert from "node:assert/strict";
import { placeDashboard, selectContentLeaf } from "../src/dashboard-placement";

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
test("placement passes the same reading state and closes the source only after the destination is ready", async () => {
  const order: string[] = [], reading = { resourcePath: "Notes/Sessions/Case.md", fontSize: 16, query: "report", scroll: 400 };
  const source = { async setViewState() {}, detach() { order.push("source-close"); } };
  let received: Record<string, unknown> | null = null;
  const destination = { async setViewState(state: Record<string, unknown>) { received = state; order.push("state"); }, detach() { order.push("destination-close"); } };
  const workspace = { getLeaf: () => destination, getRightLeaf: () => destination, async revealLeaf() { order.push("reveal"); } };
  assert.equal(await placeDashboard(workspace, source, dashboardType, reading, "main"), destination);
  assert.deepEqual(received, { type: dashboardType, active: true, pinned: true, state: reading });
  assert.deepEqual(order, ["state", "reveal", "source-close"]);
});
test("failed placement keeps the source available and cleans up only the new destination", async () => {
  const order: string[] = [];
  const source = { async setViewState() {}, detach() { order.push("source-close"); } };
  const destination = { async setViewState() { throw new Error("read failed"); }, detach() { order.push("destination-close"); } };
  const workspace = { getLeaf: () => destination, getRightLeaf: () => destination, revealLeaf() { order.push("reveal"); } };
  await assert.rejects(placeDashboard(workspace, source, dashboardType, {}, "sidebar"), /read failed/);
  assert.deepEqual(order, ["destination-close"]);
});
