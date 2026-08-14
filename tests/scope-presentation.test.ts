import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createDashboardScopePresentation } from "../src/dashboard-presentation";
import { createDashboardViewModel } from "../src/snapshot-model";

const taskId = "Tasks/Scope 示例.md";

function createV4Snapshot(taskContract: Record<string, unknown>) {
  return {
    snapshot_schema_version: 4,
    snapshot_model: "task-centric",
    source: {
      task_id: taskId,
      generated_at: "2026-08-14T05:00:00Z",
    },
    observation: {
      health: "healthy",
      current_task: "observed",
      parent: "not_applicable",
      children: "observed",
      tasknotes_api: "ok",
      source_identity_match: true,
      stale: false,
    },
    contract: {
      status: "not_applicable",
      task_contract: taskContract,
    },
    current_task: {
      id: taskId,
      title: "Scope 示例",
      status: "in-progress",
      completion: {
        lifecycle_status: "in-progress",
        contract_status: "not_applicable",
        evidence_status: "not_applicable",
        verification_status: "not_applicable",
        review_status: "not_applicable",
        acceptance_status: "not_applicable",
        trust_level: "tasknotes_only",
        trusted_done: false,
      },
    },
    parent: null,
    children: [],
    rollup: { state: "running", trusted_done: false },
    diagnostics: [],
    next_actions: [],
    protocol: {
      producer_protocol_version: 4,
      task_contract_schema: "flowdesk.task-contract/4",
      evidence_contract_schema: "flowdesk.evidence-contract/1",
      evidence_record_schema: "flowdesk.evidence-record/1",
      review_record_schema: "flowdesk.review-record/1",
    },
  };
}

test("v4 完整四条范围围栏按 scope_text 原文呈现", () => {
  const scopeText = [
    "**允许改变**：Dashboard Scope 渲染逻辑",
    "**不允许改变**：producer",
    "**不做**：发布",
    "**范围外事项处置**：只记录上报",
  ].join("\n\n");
  const model = createDashboardViewModel(
    createV4Snapshot({ scope_text: scopeText }),
    { expectedTaskPath: taskId }
  );

  assert.equal(model.contract.scope.text, scopeText);
  assert.deepEqual(createDashboardScopePresentation(model.contract.scope), {
    mode: "text",
    text: scopeText,
    included: [],
    excluded: [],
    status: "Scope 已提供",
  });
});

test("v4 缺失范围段时空 scope_text 保留待补充预警且不回退旧数组", () => {
  const model = createDashboardViewModel(
    createV4Snapshot({
      scope_text: "",
      scope: { included: ["旧包含"], excluded: ["旧不包含"] },
    }),
    { expectedTaskPath: taskId }
  );

  assert.equal(Object.hasOwn(model.contract.scope, "text"), true);
  assert.equal(model.contract.scope.text, "");
  assert.deepEqual(createDashboardScopePresentation(model.contract.scope), {
    mode: "text",
    text: "",
    included: [],
    excluded: [],
    status: "Scope 待补充",
  });
});

test("不含 scope_text 的旧结构继续按 included/excluded 宽容读取", () => {
  const model = createDashboardViewModel(
    createV4Snapshot({
      scope: { included: ["Dashboard"], excluded: ["producer"] },
    }),
    { expectedTaskPath: taskId }
  );

  assert.equal(Object.hasOwn(model.contract.scope, "text"), false);
  assert.deepEqual(createDashboardScopePresentation(model.contract.scope), {
    mode: "structured",
    text: "",
    included: ["Dashboard"],
    excluded: ["producer"],
    status: "Scope 完整",
  });
});

test("schema 4 explicit legacy_v3 即使带 scope_text 也保持旧数组路径", () => {
  const snapshot = createV4Snapshot({
    scope_text: "不应覆盖历史结构",
    scope: { included: ["历史包含"], excluded: ["历史不包含"] },
  }) as any;
  snapshot.contract.status = "legacy_v3";
  snapshot.protocol = {
    producer_protocol_version: 4,
    task_contract_schema: "legacy_v3",
    evidence_contract_schema: null,
    evidence_record_schema: null,
    review_record_schema: null,
    legacy_policy: "explicit_legacy_v3",
  };

  const model = createDashboardViewModel(snapshot, { expectedTaskPath: taskId });

  assert.equal(model.errorCode, null);
  assert.equal(Object.hasOwn(model.contract.scope, "text"), false);
  assert.deepEqual(createDashboardScopePresentation(model.contract.scope), {
    mode: "structured",
    text: "",
    included: ["历史包含"],
    excluded: ["历史不包含"],
    status: "Scope 完整",
  });
});

test("Task renderer 按 presentation 分流文本与旧结构并保留多行", () => {
  const source = readFileSync(path.join(process.cwd(), "src/main.ts"), "utf8");
  const styles = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");

  assert.match(
    source,
    /createDashboardScopePresentation\(\s*model\.contract\.scope\s*\)/
  );
  assert.match(source, /scopePresentation\.mode === "text"/);
  assert.match(
    source,
    /scopeRow\(\s*contract,\s*"范围",\s*scopePresentation\.text\s*\?\s*\[scopePresentation\.text\]\s*:\s*\[\]\s*\)/
  );
  assert.match(source, /text: scopePresentation\.status/);
  assert.match(
    styles,
    /\.flowdesk-contract-scope-row > span:last-child\s*\{[^}]*white-space:\s*pre-wrap;/s
  );
});
