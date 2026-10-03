import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { ownedEnvironment, compilePlugin } from "./support/owned-environment.ts";

const taskPath = "Tasks/中文 空格 #.md";
const token = 'quoted-"token\\value';
async function setup(t: any, handler: Parameters<Awaited<ReturnType<typeof ownedEnvironment>>["server"]>[0]) {
  const fixture = await ownedEnvironment(t);
  const { url } = await fixture.server(handler);
  const bundle = fixture.path("plugin.cjs");
  compilePlugin(bundle);
  const Plugin = createRequire(import.meta.url)(bundle).default;
  const plugin = new Plugin();
  plugin.settings = { apiUrl: url, tasknotesEnv: JSON.stringify({ TASKNOTES_API_TOKEN: token }) };
  return plugin;
}

test("compiled desktop read avoids renderer Origin and decodes split UTF-8 in one authenticated GET", async t => {
  const requests: any[] = [];
  const plugin = await setup(t, (req, res) => {
    requests.push({ method: req.method, url: req.url, origin: req.headers.origin, auth: req.headers.authorization, encoding: req.headers["accept-encoding"] });
    if (req.headers.origin) { res.writeHead(403).end(JSON.stringify({ error: "CORS origin is not allowed" })); return; }
    const body = Buffer.from(JSON.stringify({ id: taskPath, path: taskPath, details: "完整中文原文🐄" }));
    const split = body.indexOf(Buffer.from("完整")) + 1;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(body.subarray(0, split));
    setImmediate(() => res.end(body.subarray(split)));
  });
  // Characterize the actual renderer boundary: fetch sends the Obsidian origin.
  const originalFetch = globalThis.fetch;
  let rendererReads = 0;
  globalThis.fetch = (input, options) => {
    rendererReads++;
    const headers = new Headers(options?.headers);
    headers.set("Origin", "app://obsidian.md");
    return originalFetch(input, { ...options, headers });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const result = await plugin.loadTaskDetails(taskPath, new AbortController().signal);
  assert.equal(result.details, "完整中文原文🐄");
  assert.equal(result.id, taskPath);
  assert.equal(rendererReads, 0);
  assert.deepEqual(requests, [{ method: "GET", url: "/api/tasks/Tasks%2F%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC%20%23.md", origin: undefined, auth: `Bearer ${token}`, encoding: "identity" }]);
});

test("desktop read rejects every redirect status without following or exposing credentials", async t => {
  let status = 301;
  const requests: any[] = [];
  const plugin = await setup(t, (req, res) => {
    requests.push([req.method, req.url]);
    res.writeHead(status, { Location: "/redirect-target", "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "redirect " + req.headers.authorization }));
  });
  for (status of [301, 302, 303, 307, 308]) {
    await assert.rejects(plugin.loadTaskDetails(taskPath, new AbortController().signal), (error: any) => {
      assert.equal(error.code, "tasknotes_http_failed");
      assert.match(error.message, new RegExp(`TaskNotes API ${status}:`));
      assert.equal(error.message.includes(token), false);
      return true;
    });
  }
  assert.equal(requests.length, 5);
  assert.ok(requests.every(([method, url]) => method === "GET" && url.startsWith("/api/tasks/") && !url.includes("redirect-target")));
});

test("already cancelled desktop read performs no HTTP request", async t => {
  let requests = 0;
  const plugin = await setup(t, (_req, res) => { requests++; res.end(JSON.stringify({ id: taskPath, details: "unexpected" })); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(plugin.loadTaskDetails(taskPath, controller.signal), { name: "AbortError" });
  assert.equal(requests, 0);
});

test("cancelling a desktop read stops the in-flight response body and accepts no result", async t => {
  let seen!: () => void, closed!: () => void;
  const requestSeen = new Promise<void>(resolve => { seen = resolve; });
  const connectionClosed = new Promise<void>(resolve => { closed = resolve; });
  let requests = 0;
  const plugin = await setup(t, (_req, res) => {
    requests++;
    res.on("close", closed);
    t.after(() => connectionClosed);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"id":' + JSON.stringify(taskPath) + ',"details":"partial');
    seen();
  });
  const controller = new AbortController();
  const pending = plugin.loadTaskDetails(taskPath, controller.signal);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await requestSeen;
  controller.abort();
  await rejected;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([connectionClosed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("cancelled HTTP connection stayed open")), 1000); })]);
  } finally { clearTimeout(timer); }
  assert.equal(requests, 1);
});

test("desktop read rejects unexpected compressed responses instead of treating bytes as Task JSON", async t => {
  const plugin = await setup(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Encoding": "gzip" });
    res.end(JSON.stringify({ id: taskPath, details: "wrong encoding" }));
  });
  await assert.rejects(plugin.loadTaskDetails(taskPath, new AbortController().signal), /Content-Encoding/);
});

test("desktop read reports a truncated body as a read failure and never retries", async t => {
  let requests = 0;
  const plugin = await setup(t, (_req, res) => {
    requests++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"id":' + JSON.stringify(taskPath) + ',"details":"partial');
    setImmediate(() => res.destroy());
  });
  await assert.rejects(plugin.loadTaskDetails(taskPath, new AbortController().signal), /TaskNotes 原文读取失败/);
  assert.equal(requests, 1);
});

test("desktop read refuses URL credentials before sending any request and redacts them", async t => {
  let requests = 0;
  const plugin = await setup(t, (_req, res) => { requests++; res.end(JSON.stringify({ id: taskPath, details: "unexpected credential URL" })); });
  const url = new URL(plugin.settings.apiUrl);
  url.username = "embedded-user";
  url.password = token;
  plugin.settings.apiUrl = url.href;
  await assert.rejects(plugin.loadTaskDetails(taskPath, new AbortController().signal), (error: any) => {
    assert.match(error.message, /地址.*凭据/);
    assert.equal(error.message.includes(token), false);
    assert.equal(error.message.includes(encodeURIComponent(token)), false);
    return true;
  });
  assert.equal(requests, 0);
});
