import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {mkdirSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {ownedEnvironment} from "./support/owned-environment";
import {packageDashboardUi} from "../scripts/dashboard-ui-package.mjs";

test("packaging rejects bytes different from the shared artifact before npm or output",async t=>{
  const owned=await ownedEnvironment(t),root=owned.path("source"),pkg=path.join(root,"packages/dashboard-ui");
  mkdirSync(path.join(pkg,"dist"),{recursive:true});
  writeFileSync(path.join(root,"package.json"),JSON.stringify({version:"2.0.14"}));
  writeFileSync(path.join(pkg,"package.json"),JSON.stringify({name:"@flowdesk/dashboard-ui",version:"2.0.14"}));
  writeFileSync(path.join(pkg,"dist/browser.js"),"tampered");
  writeFileSync(path.join(pkg,"dist/artifact.json"),JSON.stringify({version:"2.0.14",displayProtocol:"association-dashboard/1",sha256:{"browser.js":createHash("sha256").update("reviewed").digest("hex")}}));
  assert.throws(()=>packageDashboardUi({root,output:owned.path("out"),log:false}),/checksum mismatch/);
});
