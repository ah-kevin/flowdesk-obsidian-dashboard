import assert from "node:assert/strict";
import test from "node:test";
import { bindProgressDisclosure } from "../src/progress-disclosure.ts";
import { TestElement } from "./support/dom.ts";

const setup=(reduced:boolean)=>{
  const details=new TestElement("details"),summary=details.createEl("summary"),recent=new TestElement(),full=details.createDiv() as any;
  details.ownerDocument={defaultView:{innerHeight:900,matchMedia:()=>({matches:reduced})}};
  (recent as any).getBoundingClientRect=()=>({height:220});(recent as any).scrollHeight=220;
  full.getBoundingClientRect=()=>({height:520});full.scrollHeight=3000;
  const animations:any[]=[];full.animate=(frames:any,options:any)=>{const animation={cancelled:0,onfinish:()=>{},cancel(){this.cancelled++;}};animations.push(animation);return animation;};
  (recent as any).animate=full.animate;
  return {details,summary,recent,full,animations};
};
test("reduced motion switches once without animation while retaining complete-history access",async()=>{
  const fixture=setup(true);let requests=0;
  bindProgressDisclosure(fixture.details as any,fixture.summary as any,fixture.recent as any,fixture.full,61,{ensureHistory:()=>{requests++;}});
  await fixture.summary.click();assert.equal(fixture.details.open,true);assert.equal((fixture.recent as any).hidden,true);
  assert.equal(requests,1);assert.equal(fixture.animations.length,0);
  await fixture.summary.click();assert.equal(fixture.details.open,false);assert.equal((fixture.recent as any).hidden,false);
});
test("rapid switching cancels superseded animations and resource abort cancels the active one",async()=>{
  const fixture=setup(false),controller=new AbortController();
  bindProgressDisclosure(fixture.details as any,fixture.summary as any,fixture.recent as any,fixture.full,61,{signal:controller.signal,ensureHistory:()=>{}});
  for(let index=0;index<3;index++)await fixture.summary.click();
  assert.equal(fixture.details.open,true);assert.equal(fixture.animations.length,3);
  assert.equal(fixture.animations[0].cancelled,1);assert.equal(fixture.animations[1].cancelled,1);
  fixture.animations[0].onfinish();assert.equal(fixture.animations[2].cancelled,0);
  controller.abort();assert.equal(fixture.animations[2].cancelled,1);
  await fixture.summary.click();assert.equal(fixture.animations.length,3);
});
test("delayed history rendering keeps the previous height and cannot start an animation after removal",async()=>{
  const fixture=setup(false),controller=new AbortController();
  let release:()=>void=()=>{};const ready=new Promise<void>(resolve=>{release=resolve;});
  bindProgressDisclosure(fixture.details as any,fixture.summary as any,fixture.recent as any,fixture.full,61,{signal:controller.signal,ensureHistory:()=>ready});
  await fixture.summary.click();assert.equal(fixture.full.style.height,"220px");assert.equal(fixture.animations.length,0);
  controller.abort();release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fixture.animations.length,0);assert.equal(fixture.full.style.height,"");
});
