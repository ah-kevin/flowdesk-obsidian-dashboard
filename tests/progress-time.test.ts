import assert from "node:assert/strict";
import test from "node:test";
import {parseQuotedProgress,historyTime} from "../packages/dashboard-ui/src/progress-history";
import {createTaskCurrentProgress} from "../packages/dashboard-ui/src/task-current-progress";

test("Progress history reads raw clock metadata before scanning a first-line fence",()=>{
  const text="> [!faq]- 详细过程日志\n> - [x] `2026-10-17 14:21` <!-- flowdesk.progress-time/1 2026-10-17T06:21:32Z --> 进展：```text\n>   actual\n>   ```\n> - [x] `2026-10-17 14:22` <!-- flowdesk.progress-time/1 2026-10-17T06:22:01Z --> second";
  const events=parseQuotedProgress(text);assert.ok(events);assert.equal(events.length,2);
  assert.equal(events[0].timestamp,"2026-10-17T06:21:32Z");assert.equal(events[0].text,"进展：```text\nactual\n```");
  assert.equal(parseQuotedProgress(text.replace("`2026-10-17 14:21`","`2026-10-17 14:23`")),null);
});
test("Dashboard keeps its original timezone and date presentation",()=>{
  assert.equal(historyTime("2024-02-29T10:00:00Z"),"2024/02/29 18:00");
  assert.equal(historyTime("2024-02-29T10:00Z"),"2024/02/29 18:00");
});
test("current Progress preserves nanosecond order beneath identical friendly labels",()=>{
  const text="> [!faq]- 详细过程日志\n> - [x] `2026-10-17 14:21` <!-- flowdesk.progress-time/1 2026-10-17T06:21:32.000000002Z --> 进展：new\n>   下一步：continue\n> - [x] `2026-10-17 14:21` <!-- flowdesk.progress-time/1 2026-10-17T06:21:32.000000001Z --> 进展：old";
  const content={domainSections:[{level:2,heading:"Progress",text,source:{line_start:1,line_end:7}}]} as any;
  const result=createTaskCurrentProgress(content,{statusIsCompleted:false,observationHealthy:true,observedAt:"2026-10-17T07:00:00Z"});
  assert.equal(result.status,"current");assert.equal(result.progress,"new");assert.equal(result.next,"continue");assert.equal(result.timestamp,"2026-10-17T06:21:32.000000002Z");
});
