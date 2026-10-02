import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { ownedEnvironment, updateCapabilities, CORE_ROOT } from "./support/owned-environment.ts";

test("default runner has owned HOME/vault/auth and guards native, state and network", async (t) => {
  const fixture = await ownedEnvironment(t);
  assert.ok(process.env.HOME!.startsWith(process.env.FLOWDESK_TEST_ROOT!));
  assert.ok(process.env.OBSIDIAN_VAULT!.startsWith(process.env.FLOWDESK_TEST_ROOT!));
  assert.equal(process.env.TASKNOTES_API_TOKEN, "");
  assert.equal(process.env.TASKNOTES_AUTH_TOKEN, "");
  const caps = fixture.capabilities;
  assert.deepEqual(caps.interpreters, []);
  const probe = fixture.path("negative.cjs");
  writeFileSync(probe, `const cp=require('node:child_process'),fs=require('node:fs');
for(const executable of ['/usr/bin/open','/Applications/Obsidian.app/Contents/MacOS/Obsidian','codex','claude']) {
  try {cp.execFileSync(executable,['owned-random-id']);process.exit(10);}catch(e){if(!/test isolation violation/.test(e.message))throw e;}
}
try{fs.readFileSync(${JSON.stringify(caps.original_home + "/.codex/config.toml")});process.exit(11);}catch(e){if(!/test isolation violation/.test(e.message))throw e;}
try{fetch('http://127.0.0.1:18090/api/tasks');process.exit(12);}catch(e){if(!/test isolation violation/.test(e.message))throw e;}`);
  fixture.allowNode(probe);
  execFileSync(process.execPath, [probe], { env: fixture.env, cwd: fixture.root });
  const violations = fixture.violations();
  assert.equal(violations.length, 6);
  assert.ok(violations.some((v: any) => v.kind === "network"));
  assert.ok(violations.some((v: any) => v.kind === "state"));
  // Negative evidence belongs to this owned child capability, not the green suite.
  fixture.expectViolations(6);
  assert.throws(() => fixture.allowCommand(["/usr/bin/open", "-a", "/Applications/Obsidian.app", probe], fixture.root), /not a reviewed test command/);
  assert.ok(readFileSync(process.env.FLOWDESK_TEST_CAPS!, "utf8").includes('"interpreters":[]'));
});

test("real Python producer child refuses non-owned business API before connecting",async(t)=>{
  const fixture=await ownedEnvironment(t);
  const executable=CORE_ROOT+"/bin/flowdesk-execution-snapshot";
  const args=["Tasks/Owned negative.md","--api-url","http://127.0.0.1:18090","--working-directory",fixture.root,"--format","json"];
  fixture.allowCommand([executable,...args],CORE_ROOT);
  const result=execFileSync(executable,args,{env:fixture.env,cwd:CORE_ROOT,encoding:"utf8"});
  const snapshot=JSON.parse(result);
  assert.notEqual(snapshot.observation.health,"healthy");
  const violations=fixture.violations();
  assert.ok(violations.length>0);
  assert.ok(violations.every((v:any)=>v.kind==="network"));
  fixture.expectViolations(violations.length);
});

test("owned Python keeps the selected interpreter prefix, dependency and guard", async (t) => {
  const fixture = await ownedEnvironment(t);
  const probe = fixture.path("flowdesk-execution-snapshot");
  writeFileSync(probe, `#!/usr/bin/env python3
import importlib.util, json, sys
from support import guard
pip = __import__("pip").__file__ if importlib.util.find_spec("pip") else None
print(json.dumps({"prefix": sys.prefix, "base_prefix": sys.base_prefix, "pip": pip, "guard": guard.capabilities() is not None}))
`, { mode: 0o755 });
  updateCapabilities(fixture.file, data => data.commands.push({ executable: realpathSync(probe), args: [], cwd: realpathSync(fixture.root) }));
  const actual = JSON.parse(execFileSync(probe, [], { env: fixture.env, cwd: fixture.root, encoding: "utf8" }));
  assert.equal(actual.guard, true);
  assert.deepEqual({ prefix: realpathSync(actual.prefix), base_prefix: realpathSync(actual.base_prefix), pip: actual.pip ? realpathSync(actual.pip) : null }, JSON.parse(process.env.FLOWDESK_TEST_PYTHON_IDENTITY ?? "null"));
});
