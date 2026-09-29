import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// The host double only supplies UI base classes; plugin, files, processes and HTTP are real.
async function setup(t: any, configuration = '{"TASKNOTES_API_TOKEN":"file-token"}') {
  const dir = await mkdtemp(path.join(tmpdir(), "flowdesk-auth-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bundle = path.join(dir, "plugin.cjs");
  execFileSync(path.resolve("node_modules/.bin/esbuild"), [
    "src/main.ts", "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`,
    `--alias:obsidian=${path.resolve("tests/fixtures/obsidian-host.cjs")}`,
  ], { stdio: "pipe" });
  const Plugin = createRequire(import.meta.url)(bundle).default;
  const plugin = new Plugin();
  await mkdir(path.join(dir, "bin"));
  // Only report equality, never emit the credential from the subprocess.
  const producer = `#!/usr/bin/env node
const expected = process.argv[2];
process.stdout.write(JSON.stringify({ authenticated: (process.env.TASKNOTES_API_TOKEN || process.env.TASKNOTES_AUTH_TOKEN) === expected, extra: process.env.FLOWDESK_AUTH_TEST_EXTRA === "extra-value" }));
`;
  for (const name of ["flowdesk-execution-snapshot", "flowdesk-work-case-snapshot"]) {
    await writeFile(path.join(dir, "bin", name), producer, { mode: 0o755 });
  }
  plugin.app = { vault: { adapter: { getBasePath: () => dir } } };
  plugin.settings = {
    flowdeskRoot: dir, workingDirectory: dir, apiUrl: "", tasknotesEnv: configuration,
  };
  const old = { api: process.env.TASKNOTES_API_TOKEN, alias: process.env.TASKNOTES_AUTH_TOKEN };
  process.env.TASKNOTES_API_TOKEN = "stale-process-token";
  delete process.env.TASKNOTES_AUTH_TOKEN;
  t.after(() => {
    for (const [key, value] of [["TASKNOTES_API_TOKEN", old.api], ["TASKNOTES_AUTH_TOKEN", old.alias]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  });
  return { plugin, dir };
}

test("JSON env token reaches both snapshot subprocesses instead of stale process token", async (t) => {
  const { plugin } = await setup(t);
  const signal = new AbortController().signal;
  assert.equal((await plugin.loadSnapshot("file-token", signal)).authenticated, true);
  assert.equal((await plugin.loadWorkCaseSnapshot("file-token", signal)).authenticated, true);
});

test("refresh uses changed JSON settings without restarting the plugin", async (t) => {
  const { plugin } = await setup(t);
  assert.equal((await plugin.loadSnapshot("file-token", new AbortController().signal)).authenticated, true);
  plugin.settings.tasknotesEnv = JSON.stringify({ TASKNOTES_API_TOKEN: "rotated-token" });
  assert.equal((await plugin.loadSnapshot("rotated-token", new AbortController().signal)).authenticated, true);
});

test("JSON merges extra variables and literal aliases without mutating the parent process env", async (t) => {
  const { plugin } = await setup(t, JSON.stringify({
    TASKNOTES_API_TOKEN: " ", TASKNOTES_AUTH_TOKEN: "literal-$VALUE-$(command)",
    FLOWDESK_AUTH_TEST_EXTRA: "extra-value",
  }));
  assert.equal((await plugin.loadSnapshot("literal-$VALUE-$(command)", new AbortController().signal)).authenticated, true);
  assert.equal((await plugin.loadWorkCaseSnapshot("literal-$VALUE-$(command)", new AbortController().signal)).extra, true);
  assert.equal(process.env.FLOWDESK_AUTH_TEST_EXTRA, undefined);
  assert.equal(process.env.TASKNOTES_API_TOKEN, "stale-process-token");
});

test("invalid JSON and non-string env values fail without leaking configuration or using stale tokens", async (t) => {
  const { plugin } = await setup(t);
  for (const invalid of ['{"TASKNOTES_API_TOKEN":"private-token",broken}', '[]', 'null',
    '{"TASKNOTES_API_TOKEN":123}', '{"BAD-NAME":"value"}', '{"TASKNOTES_API_TOKEN":"bad\\nheader"}']) {
    plugin.settings.tasknotesEnv = invalid;
    await assert.rejects(plugin.loadSnapshot("stale-process-token", new AbortController().signal), (error: any) => {
      assert.match(error.message, /JSON|环境变量|token/i);
      assert.doesNotMatch(error.message, /private-token/);
      return true;
    });
  }
});

test("empty JSON preserves process token and alias compatibility", async (t) => {
  const { plugin } = await setup(t);
  plugin.settings.tasknotesEnv = "{}";
  assert.equal((await plugin.loadSnapshot("stale-process-token", new AbortController().signal)).authenticated, true);
  delete process.env.TASKNOTES_API_TOKEN;
  process.env.TASKNOTES_AUTH_TOKEN = "process-alias";
  assert.equal((await plugin.loadWorkCaseSnapshot("process-alias", new AbortController().signal)).authenticated, true);
});

test("an explicit empty API token updates that variable in the merged environment", async (t) => {
  const { plugin } = await setup(t, '{"TASKNOTES_API_TOKEN":""}');
  assert.equal((await plugin.loadSnapshot("stale-process-token", new AbortController().signal)).authenticated, false);
});

test("review GET, PATCH and append requests all carry the configured Bearer token", async (t) => {
  const { plugin } = await setup(t);
  const requests: { method: string; authorization?: string; body: any }[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method!, authorization: request.headers.authorization, body: body ? JSON.parse(body) : null });
    response.setHeader("Content-Type", "application/json");
    if (request.headers.authorization !== "Bearer file-token") {
      response.writeHead(401).end(JSON.stringify({ success: false, error: "Authentication required" }));
    } else response.end(JSON.stringify({ tags: ["existing"] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  plugin.settings.tasknotesEnv = JSON.stringify({ TASKNOTES_API_TOKEN: "file-token", TASKNOTES_API_URL: url });
  assert.equal(plugin.createSnapshotInvocation("Tasks/Test.md", "json").args[2], url);
  assert.equal(plugin.createWorkCaseSnapshotInvocation("Case.md").args[2], url);
  plugin.settings.apiUrl = "http://127.0.0.1:9999/";
  assert.equal(plugin.createSnapshotInvocation("Tasks/Test.md", "json").args[2], "http://127.0.0.1:9999");
  plugin.settings.apiUrl = "";
  await plugin.submitTaskReview({ taskPath: "Tasks/Test.md", decision: "approved", note: "verified" });
  assert.deepEqual(requests.map((request) => [request.method, request.authorization]), [
    ["GET", "Bearer file-token"], ["PATCH", "Bearer file-token"], ["POST", "Bearer file-token"],
  ]);
  assert.deepEqual(requests[1].body.tags, ["existing", "reviewed"]);
});

test("401 identifies missing versus rejected credentials without exposing the token", async (t) => {
  const { plugin } = await setup(t);
  const server = createServer((request, response) => {
    response.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: request.headers.authorization || "Authentication required" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  plugin.settings.apiUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  await assert.rejects(plugin.requestTaskNotes("GET", "/api/stats"), (error: any) => {
    assert.match(error.message, /401.*token.*拒绝|401.*token.*失效/i);
    assert.doesNotMatch(error.message, /file-token/);
    return true;
  });
  await assert.rejects(plugin.submitTaskReview({ taskPath: "Tasks/Test.md", decision: "approved", note: "" }), (error: any) => {
    assert.match(error.message, /401.*token.*拒绝|401.*token.*失效/i);
    assert.doesNotMatch(error.message, /file-token/);
    return true;
  });
  plugin.settings.tasknotesEnv = "{}";
  delete process.env.TASKNOTES_API_TOKEN;
  await assert.rejects(plugin.requestTaskNotes("GET", "/api/stats"), /401.*token.*未配置|401.*未配置.*token/i);
});

test("snapshot auth diagnostics distinguish missing versus rejected credentials without echoing secrets", async (t) => {
  const { plugin, dir } = await setup(t);
  const producer = `#!/usr/bin/env node
const token = process.env.TASKNOTES_API_TOKEN || "";
process.stdout.write(JSON.stringify({ diagnostics: [{ code: "tasknotes_unavailable", message: "[auth] TaskNotes API 401: " + token }] }));
`;
  await writeFile(path.join(dir, "bin", "flowdesk-work-case-snapshot"), producer, { mode: 0o755 });
  let snapshot = await plugin.loadWorkCaseSnapshot("Case.md", new AbortController().signal);
  assert.match(snapshot.diagnostics[0].message, /401.*token.*拒绝|401.*token.*失效/i);
  assert.doesNotMatch(snapshot.diagnostics[0].message, /file-token/);
  plugin.settings.tasknotesEnv = '{"TASKNOTES_API_TOKEN":""}';
  snapshot = await plugin.loadWorkCaseSnapshot("Case.md", new AbortController().signal);
  assert.match(snapshot.diagnostics[0].message, /401.*token.*未配置|401.*未配置.*token/i);
});

test("copied CLI commands contain paths and API address but no JSON credentials", async (t) => {
  const { plugin } = await setup(t);
  const { formatShellCommand } = await import("../src/snapshot-invocation.ts");
  const { formatWorkCaseShellCommand } = await import("../src/work-case-invocation.ts");
  for (const command of [formatShellCommand(plugin.createSnapshotInvocation("Tasks/Test.md", "dashboard")),
    formatWorkCaseShellCommand(plugin.createWorkCaseSnapshotInvocation("Case.md"))]) {
    assert.doesNotMatch(command, /file-token|stale-process-token|TASKNOTES_API_TOKEN/);
  }
});

test("JSON merges individual variables and keeps an inherited API token when only alias is configured", async (t) => {
  const { plugin } = await setup(t, '{"TASKNOTES_AUTH_TOKEN":"configured-alias"}');
  const signal = new AbortController().signal;
  assert.equal((await plugin.loadSnapshot("stale-process-token", signal)).authenticated, true);
  assert.equal((await plugin.loadWorkCaseSnapshot("stale-process-token", signal)).authenticated, true);
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ authenticated: request.headers.authorization === "Bearer stale-process-token" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  plugin.settings.apiUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  assert.equal((await plugin.requestTaskNotes("GET", "/api/stats")).authenticated, true);
  process.env.TASKNOTES_AUTH_TOKEN = "inherited-alias";
  plugin.settings.tasknotesEnv = '{"TASKNOTES_API_TOKEN":""}';
  assert.equal((await plugin.loadSnapshot("inherited-alias", signal)).authenticated, true);
});

test("non-auth review failures preserve upstream error codes and redact credential echoes", async (t) => {
  const { plugin } = await setup(t);
  const server = createServer((request, response) => {
    response.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ code: "task_not_found", error: "missing " + request.headers.authorization }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  plugin.settings.apiUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  await assert.rejects(plugin.submitTaskReview({ taskPath: "Tasks/Test.md", decision: "approved", note: "" }), (error: any) => {
    assert.equal(error.code, "task_not_found");
    assert.doesNotMatch(error.message, /file-token/);
    return true;
  });
});

test("escaped credential echoes in JSON review errors remain redacted after JSON decoding", async (t) => {
  const { plugin } = await setup(t);
  const token = 'quoted-"token\\value';
  plugin.settings.tasknotesEnv = JSON.stringify({ TASKNOTES_API_TOKEN: token });
  const server = createServer((request, response) => {
    response.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ code: "task_not_found", error: "missing " + request.headers.authorization }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  plugin.settings.apiUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  await assert.rejects(plugin.submitTaskReview({ taskPath: "Tasks/Test.md", decision: "approved", note: "" }), (error: any) => {
    assert.equal(error.code, "task_not_found");
    assert.equal(error.message.includes(token), false);
    assert.match(error.message, /REDACTED/);
    return true;
  });
});
