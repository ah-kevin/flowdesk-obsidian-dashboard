import assert from "node:assert/strict";
import test from "node:test";
import {formatEntityStatus,groupTaskRows,formatReferenceLabel} from "../src/entity-presentation";

test("native lifecycle and unknown custom statuses remain distinct from observation",()=>{
  assert.deepEqual(formatEntityStatus("task","done"),{label:"已完成",raw:"done",tone:"healthy"});
  assert.deepEqual(formatEntityStatus("case","active"),{label:"进行中",raw:"active",tone:"running"});
  assert.equal(formatEntityStatus("case","parked").label,"已停靠");
  assert.equal(formatEntityStatus("task","active").label,"active（未知状态）");
  assert.equal(formatEntityStatus("task","custom").label,"custom（未知状态）");
  assert.equal(formatEntityStatus("case",null).label,"未记录");
});

test("grouping preserves every row, prioritizes running and unfinished blocked, stable within rank",()=>{
  const rows=[
    {status:"custom",isBlocked:false,completed:null,archived:false,id:"unknown"},
    {status:"done",isBlocked:true,completed:true,archived:false,id:"done"},
    {status:"open",isBlocked:false,completed:false,archived:false,id:"open"},
    {status:"open",isBlocked:true,completed:false,archived:false,id:"blocked"},
    {status:"running",isBlocked:false,completed:false,archived:false,id:"running1"},
    {status:"in-progress",isBlocked:true,completed:false,archived:false,id:"running2"},
    {status:"custom",isBlocked:false,completed:null,archived:true,id:"archived"},
  ];
  const result=groupTaskRows(rows);
  assert.deepEqual(result.current.map(x=>x.id),["running1","running2","blocked","unknown","open"]);
  assert.deepEqual(result.history.map(x=>x.id),["done","archived"]);
  assert.equal(rows[0].id,"unknown");
});

test("reference labels use alias or filename without changing navigation target",()=>{
  assert.equal(formatReferenceLabel("[[Notes/Plans/设计#Current|实施方案]]"),"实施方案");
  assert.equal(formatReferenceLabel("[[Notes/Plans/Long English.md]]"),"Long English");
});


test("prototype property names are custom statuses and respect native ending definitions", () => {
  for (const status of ["constructor", "__proto__", "toString"]) {
    assert.deepEqual(formatEntityStatus("task", status, true), {label: `${status}（已结束）`, raw: status, tone: "muted"});
    assert.deepEqual(formatEntityStatus("task", status, false), {label: `${status}（未结束）`, raw: status, tone: "warning"});
    assert.deepEqual(formatEntityStatus("task", status, null), {label: `${status}（状态未知）`, raw: status, tone: "warning"});
    assert.equal(formatEntityStatus("case", status).label, `${status}（未知状态）`);
  }
});
