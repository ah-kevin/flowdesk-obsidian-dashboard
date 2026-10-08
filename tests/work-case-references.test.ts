import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {WorkCaseDashboardRenderer} from "../src/work-case-renderer";
import {createWorkCaseViewModel} from "../src/work-case-model";
import {TestElement} from "./support/dom";

const canonical=JSON.parse(readFileSync("tests/fixtures/work-case-canonical.json","utf8"));
function sample() {
  const snapshot=structuredClone(canonical);
  snapshot.related={project:"[[Notes/Projects/NiuBase]]",
    plans:Array.from({length:8},(_,i)=>`NiuBase:docs/plans/plan-${i}.md`),
    docs:["NiuBase:apps/demo/docs/evidence/xiaomu-route/verification.json",
      ...Array.from({length:17},(_,i)=>`NiuBase:apps/demo/docs/document-${i}.md`),
      "NiuBase:apps/demo/docs/evidence/health-product/verification.json",
      "[[Notes/Docs/Exact Target|友好名称]]"],sessions:["[[Codex-Sessions/Original]]"],related:[]};
  return {casePath:snapshot.source.path,model:createWorkCaseViewModel(snapshot,snapshot.source.path),loadedAt:"2026-10-08T05:00:00Z",staleReason:"",error:"",loading:false};
}
function renderer(opened:Array<{raw:string;casePath:string;meta:boolean}>=[]) {
  return new WorkCaseDashboardRenderer({refresh(){},openTask(){},openCaseSource(){},
    openRelated(raw,casePath,event?:{metaKey?:boolean}){opened.push({raw,casePath,meta:event?.metaKey===true});}});
}
function emit(el:TestElement,type:string,props:Record<string,unknown>={}) {
  el.dispatchEvent(Object.assign(new Event(type),props));
}
function related(root:TestElement){const matches=root.findByClass("flowdesk-case-related");assert.equal(matches.length,1);return matches[0];}

test("30 references are all reachable in original order, and opening passes the exact raw target with modifiers",async()=>{
  const state=sample(),opened:Array<{raw:string;casePath:string;meta:boolean}>=[];
  const root=new TestElement(),view=renderer(opened);view.render(root as any,state);
  const section=related(root),groups=section.findByClass("flowdesk-case-reference-group");
  assert.equal(groups.length,4,"reference groups must provide bounded entry lists");
  assert.deepEqual(groups.map(x=>x.open),[true,false,false,false]);
  assert.equal(section.findByClass("flowdesk-case-related-link").length,8);
  await section.findByClass("flowdesk-case-reference-more").find(x=>x.attrs["data-reference-group"]==="Plans")!.click();
  await section.findByClass("flowdesk-case-reference-more").find(x=>x.attrs["data-reference-group"]==="Docs")!.click();
  const links=section.findByClass("flowdesk-case-related-link");
  assert.equal(links.length,30);
  assert.deepEqual(links.map(x=>x.attrs.title),[state.model!.related.project,...state.model!.related.plans,...state.model!.related.docs,...state.model!.related.sessions]);
  emit(links[29],"click",{metaKey:true,ctrlKey:false});
  assert.deepEqual(opened,[{raw:"[[Codex-Sessions/Original]]",casePath:state.casePath,meta:true}]);
  assert.ok(section.allText().includes("友好名称"));
});

test("search disambiguates identical filenames without dropping original identity and restores expanded groups after clearing",()=>{
  const state=sample(),view=renderer(),root=new TestElement();view.render(root as any,state);
  const section=related(root),docs=section.findByClass("flowdesk-case-reference-group").find(x=>x.attrs["data-reference-group"]==="Docs");
  assert.ok(docs,"document group must be independently expandable");
  docs.open=true;emit(docs,"toggle");
  const search=section.findByClass("flowdesk-case-reference-search")[0];assert.ok(search);
  (search as any).value="verification.json";emit(search,"input");
  assert.deepEqual(section.findByClass("flowdesk-case-related-link").map(x=>x.attrs.title),[
    "NiuBase:apps/demo/docs/evidence/xiaomu-route/verification.json",
    "NiuBase:apps/demo/docs/evidence/health-product/verification.json"]);
  const text=section.allText().join("\n");assert.match(text,/xiaomu-route/);assert.match(text,/health-product/);assert.match(text,/2.*30/);
  (search as any).value="";emit(search,"input");
  assert.equal(section.findByClass("flowdesk-case-reference-group").find(x=>x.attrs["data-reference-group"]==="Docs")!.open,true);
  (search as any).value="友好名称";emit(search,"input");
  assert.equal(section.findByClass("flowdesk-case-related-link")[0].attrs.title,"[[Notes/Docs/Exact Target|友好名称]]");
  const refreshed=new TestElement();view.render(refreshed as any,state);
  assert.equal((related(refreshed).findByClass("flowdesk-case-reference-search")[0] as any).value,"友好名称");
  assert.equal(related(refreshed).findByClass("flowdesk-case-related-link").length,1);
});

test("reference choices stay with the exact Case and old detached input handlers cannot overwrite a refreshed view",()=>{
  const state=sample(),view=renderer(),oldRoot=new TestElement();view.render(oldRoot as any,state);
  const oldSearch=related(oldRoot).findByClass("flowdesk-case-reference-search")[0];assert.ok(oldSearch);
  (oldSearch as any).value="verification";emit(oldSearch,"input");
  const fresh=new TestElement();view.render(fresh as any,state);
  (oldSearch as any).value="stale";emit(oldSearch,"input");
  const rerendered=new TestElement();view.render(rerendered as any,state);
  assert.equal((related(rerendered).findByClass("flowdesk-case-reference-search")[0] as any).value,"verification");
  const different={...state,casePath:"Notes/Sessions/Other.md"};
  const other=new TestElement();view.render(other as any,different);
  assert.equal((related(other).findByClass("flowdesk-case-reference-search")[0] as any).value,"");
  const detachedSearch=related(rerendered).findByClass("flowdesk-case-reference-search")[0];
  (detachedSearch as any).value="late-previous-case";emit(detachedSearch,"input");
  const returned=new TestElement();view.render(returned as any,state);
  assert.equal((related(returned).findByClass("flowdesk-case-reference-search")[0] as any).value,"verification");
});

test("same filenames with the same three trailing directories expose the earlier distinguishing path in text and accessible labels",()=>{
  const state=sample();
  state.model!.related.docs[0]="NiuBase:apps/alpha/docs/evidence/shared/verification.json";
  state.model!.related.docs[1]="NiuBase:apps/beta/docs/evidence/shared/verification.json";
  const root=new TestElement();renderer().render(root as any,state);
  const links=related(root).findByClass("flowdesk-case-related-link").filter(x=>x.attrs.title.includes("/shared/verification.json"));
  assert.equal(links.length,2);
  assert.match(links[0].allText().join(" "),/\/alpha\//);
  assert.match(links[1].allText().join(" "),/\/beta\//);
  assert.notEqual(links[0].attrs["aria-label"],links[1].attrs["aria-label"]);
});
