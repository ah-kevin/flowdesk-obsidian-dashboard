import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, realpathSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import path from "node:path";
import type { TestContext } from "node:test";

export const CORE_ROOT = "/Users/bjke/workspaces/flowdesk-plugin";
export const PRODUCERS = ["flowdesk-execution-snapshot", "flowdesk-work-case-snapshot"];
export function updateCapabilities(file: string, mutate: (data: any) => void) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  mutate(data);
  writeFileSync(file, JSON.stringify(data));
}

/** Thin adapter for the core capability schema and core Node/Python guards. */
export async function ownedEnvironment(t: TestContext) {
  const parentFile = process.env.FLOWDESK_TEST_CAPS;
  if (!parentFile) throw new Error("Run tests with the isolated tests/run-tests.mjs runner");
  const root = mkdtempSync(path.join(process.env.TMPDIR!, "owned-"));
  const file = path.join(root, "capabilities.json");
  const capabilities = JSON.parse(readFileSync(parentFile, "utf8"));
  capabilities.fixture_root = root;
  capabilities.commands = [];
  capabilities.endpoints = [];
  capabilities.violation_file = path.join(root, "violations.jsonl");
  writeFileSync(file, JSON.stringify(capabilities));
  const env = { ...process.env, FLOWDESK_TEST_CAPS: file };
  for (const name of ["home", "vault", "state", "tmp", "bin"]) mkdirSync(path.join(root, name));
  Object.assign(env, {
    HOME: path.join(root, "home"), OBSIDIAN_VAULT: path.join(root, "vault"),
    FLOWDESK_STATE_HOME: path.join(root, "state"), TMPDIR: path.join(root, "tmp"),
    FLOWDESK_SESSION_REGISTRY_PATH: path.join(root, "registry.json"),
    FLOWDESK_SESSION_REGISTRY_LOCK_PATH: path.join(root, "registry.lock"),
    FLOWDESK_MCP_LOG_FILE: path.join(root, "mcp.log"),
    TASKNOTES_API_TOKEN: "", TASKNOTES_AUTH_TOKEN: "", TASKNOTES_API_URL: "http://127.0.0.1:1",
  });
  let expectedViolations = 0;
  const violations = () => { try {return readFileSync(capabilities.violation_file, "utf8").trim().split("\n").filter(Boolean).map(x => JSON.parse(x));} catch {return [];} };
  t.after(() => {
    try { assert.equal(violations().length, expectedViolations, "unexpected owned guard violations"); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
  const allowCommand = (argv: string[], cwd: string, manifest = file) => {
    const executable = realpathSync(argv[0]);
    const canonicalCwd = realpathSync(cwd);
    const producer = PRODUCERS.some(x => executable === path.join(CORE_ROOT, "bin", x));
    const node = executable === realpathSync(process.execPath) && argv.length === 2 && argv[1].startsWith(root + path.sep);
    if (!(producer && (canonicalCwd === CORE_ROOT || canonicalCwd.startsWith(root))) && !node)
      throw new Error("not a reviewed test command");
    updateCapabilities(manifest, data => data.commands.push({ executable, args: argv.slice(1), cwd: canonicalCwd }));
  };
  return { root, file, env, capabilities, path: (name: string) => path.join(root, name),
    violations, expectViolations: (count: number) => { expectedViolations = count; },
    allowCommand, allowNode: (script: string) => allowCommand([process.execPath, script], root),
    async server(handler: RequestListener): Promise<{ server: Server; url: string }> {
      const server = createServer(handler);
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const port = (server.address() as any).port;
      for (const target of [file, parentFile]) updateCapabilities(target, data => data.endpoints.push({ host: "127.0.0.1", port }));
      const url = `http://127.0.0.1:${port}`;
      env.TASKNOTES_API_URL = url;
      t.after(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        for (const target of [parentFile]) updateCapabilities(target, data => { data.endpoints = data.endpoints.filter((x: any) => x.port !== port); });
      });
      return { server, url };
    },
    allowParentProducer(argv: string[], cwd: string) { allowCommand(argv, cwd, parentFile); },
  };
}

export function compilePlugin(outfile: string) {
  const executable = process.env.FLOWDESK_TEST_ESBUILD!;
  const argv = ["src/main.ts", "--bundle", "--platform=node", "--format=cjs", `--outfile=${outfile}`,
    `--alias:obsidian=${path.resolve("tests/fixtures/obsidian-host.cjs")}`];
  assert.ok(outfile.startsWith(process.env.FLOWDESK_TEST_ROOT! + path.sep));
  updateCapabilities(process.env.FLOWDESK_TEST_CAPS!, data => data.commands.push({ executable, args: argv, cwd: process.cwd() }));
  execFileSync(executable, argv, { stdio: "pipe", env: process.env });
}
export function allowOwnedProducer(executable: string, args: string[], cwd: string) {
  assert.ok(executable.startsWith(process.env.FLOWDESK_TEST_ROOT! + path.sep));
  assert.ok(PRODUCERS.includes(path.basename(executable)));
  const node = realpathSync(process.execPath);
  // Guarded Node is the interpreter of this exact owned auth probe, not an unrestricted interpreter.
  updateCapabilities(process.env.FLOWDESK_TEST_CAPS!, data => {
    data.commands.push({ executable: realpathSync(executable), args, cwd: realpathSync(cwd) });
  });
}

/** Register exactly the port allocated by a test-owned loopback server. */
export async function listenOwned(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = (server.address() as any).port;
  updateCapabilities(process.env.FLOWDESK_TEST_CAPS!, data => data.endpoints.push({host:"127.0.0.1",port}));
}
