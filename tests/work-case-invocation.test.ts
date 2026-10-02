import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkCaseSnapshotInvocation,
  formatWorkCaseShellCommand,
} from "../src/work-case-invocation";

test("Case invocation 使用独立 producer 与 Vault working directory", () => {
  const invocation = buildWorkCaseSnapshotInvocation({
    flowdeskRoot: "/repo/flowdesk-plugin",
    casePath: "Notes/Sessions/Case A.md",
    workingDirectory: "/vault",
    apiUrl: "http://127.0.0.1:18090",
  });

  assert.deepEqual(invocation, {
    executable: "/repo/flowdesk-plugin/bin/flowdesk-work-case-snapshot",
    args: [
      "Notes/Sessions/Case A.md",
      "--api-url",
      "http://127.0.0.1:18090",
      "--working-directory",
      "/vault",
      "--format",
      "json",
    ],
    cwd: "/repo/flowdesk-plugin",
  });
  assert.equal(
    formatWorkCaseShellCommand(invocation),
    "/repo/flowdesk-plugin/bin/flowdesk-work-case-snapshot 'Notes/Sessions/Case A.md' --api-url http://127.0.0.1:18090 --working-directory /vault --format json"
  );
});

test("resume bundle is explicitly opt-in and actual Core CLI accepts it",async(t)=>{
  const { ownedEnvironment, CORE_ROOT }=await import("./support/owned-environment.ts");
  const { execFileSync }=await import("node:child_process");
  const fixture=await ownedEnvironment(t);
  const invocation=buildWorkCaseSnapshotInvocation({flowdeskRoot:CORE_ROOT,casePath:"Notes/Sessions/A.md",workingDirectory:fixture.root,apiUrl:"http://127.0.0.1:1",includeResumeBundle:true});
  assert.ok(invocation.args.includes("--resume-bundle"));
  fixture.allowCommand([invocation.executable,"--help"],invocation.cwd);
  const help=execFileSync(invocation.executable,["--help"],{cwd:invocation.cwd,env:fixture.env,encoding:"utf8"});
  for(const flag of invocation.args.filter(x=>x.startsWith("--")))assert.ok(help.includes(flag),flag);
});
