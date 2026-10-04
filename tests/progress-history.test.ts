import assert from "node:assert/strict";
import test from "node:test";
import { historyTime } from "../src/progress-history";

test("invalid calendar or time values keep the original date instead of becoming another normal instant",()=>{
  for(const value of ["2026-02-31T10:00:00Z","2026-02-29T10:00:00Z","2026-10-04T24:00:00Z","2026-10-04T12:60:00Z","2026-10-04 24:00"])
    assert.equal(historyTime(value),value);
  assert.equal(historyTime("2024-02-29T10:00:00Z"),"2024/02/29 18:00");
});
