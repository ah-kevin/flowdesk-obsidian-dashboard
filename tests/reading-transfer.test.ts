import test from "node:test";
import assert from "node:assert/strict";
import { ReadingStateCache } from "../src/reading-state";
import { CaseReferenceList } from "../src/case-reference-list";
import { TestElement } from "./support/dom";

test("a new Dashboard host restores per-resource disclosures and scroll without sharing mutable state", () => {
 const source = new ReadingStateCache(), first = new TestElement();
 const detail = first.createEl("details", {attr:{"data-disclosure-key":"task-details"}});detail.open=true;first.scrollTop=410;
 source.capture("task:A",first as any);
 assert.equal(typeof (source as any).snapshot,"function","placement must be able to carry UI choices");
 const persisted = JSON.parse(JSON.stringify((source as any).snapshot()));
 const destination = new ReadingStateCache();(destination as any).restoreSnapshot(persisted);
 source.clear();
 const next=new TestElement(), nextDetail=next.createEl("details",{attr:{"data-disclosure-key":"task-details"}});
 destination.restore("task:A",next as any);assert.equal(nextDetail.open,true);assert.equal(next.scrollTop,410);
 const other=new TestElement(), otherDetail=other.createEl("details",{attr:{"data-disclosure-key":"task-details"}});
 destination.restore("task:B",other as any);assert.equal(otherDetail.open,false);assert.equal(other.scrollTop,0);
});
test("Case search and group choices survive moving the Dashboard, old DOM stays inactive", () => {
 const references=new CaseReferenceList(), before=new TestElement();
 const groups=[{label:"Docs",targets:["[[Notes/Docs/alpha.md]]","[[Notes/Docs/beta.md]]"]}];
 references.render(before as any,"Case:A",groups,{open(){}});
 const search=before.findByClass("flowdesk-case-reference-search")[0];search.value="alpha";
 for(const handler of search.listeners.get("input")??[])handler({});
 assert.equal(typeof (references as any).snapshot,"function","placement must carry Case UI choices");
 const state=JSON.parse(JSON.stringify((references as any).snapshot()));
 const restored=new CaseReferenceList();(restored as any).restoreSnapshot(state);references.clear();
 const after=new TestElement();restored.render(after as any,"Case:A",groups,{open(){}});
 assert.equal(after.findByClass("flowdesk-case-reference-search")[0].value,"alpha");
 assert.match(after.allText().join(" "),/匹配 1 \/ 2 项/);
 search.value="beta";for(const handler of search.listeners.get("input")??[])handler({});
 const again=new TestElement();restored.render(again as any,"Case:A",groups,{open(){}});
 assert.equal(again.findByClass("flowdesk-case-reference-search")[0].value,"alpha");
 const other=new TestElement();restored.render(other as any,"Case:B",groups,{open(){}});
 assert.equal(other.findByClass("flowdesk-case-reference-search")[0].value,"");
});
