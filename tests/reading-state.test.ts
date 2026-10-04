import assert from "node:assert/strict";
import test from "node:test";
import { ReadingStateCache } from "../src/reading-state.ts";
import { TestElement } from "./support/dom.ts";

test("refresh keeps the full progress reading position and does not take another task's position",()=>{
  const cache=new ReadingStateCache();
  const make=()=>{
    const root=new TestElement();
    const disclosure=root.createEl("details",{attr:{"data-disclosure-key":"all-progress"}});
    const full=disclosure.createDiv({attr:{"data-reading-scroll-key":"progress-history"}}) as any;
    return {root,disclosure,full};
  };
  const first=make();first.disclosure.open=true;first.full.scrollTop=840;first.full.setAttr("data-reading-items","24");
  cache.capture("task:A",first.root as any);
  const skeleton=new TestElement();cache.capture("task:A",skeleton as any,{position:false});
  const refreshed=make();cache.restore("task:A",refreshed.root as any);
  assert.equal(refreshed.disclosure.open,true);assert.equal(refreshed.full.scrollTop,840);
  assert.equal(refreshed.full.getAttribute("data-reading-items"),"24");
  const other=make();cache.restore("task:B",other.root as any);
  assert.equal(other.disclosure.open,false);assert.equal(other.full.scrollTop,0);
});
