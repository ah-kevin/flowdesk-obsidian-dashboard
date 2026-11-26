import assert from "node:assert/strict";
import { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import type { NetworkInterfaceInfoIPv4 } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  DEFAULT_WORKBENCH_PORT,
  isWorkbenchPairingKey,
  normalizeWorkbenchSettings,
  parseWorkbenchPort,
  workbenchLanAddresses,
  workbenchReviewDataPath,
  WORKBENCH_LAN_BIND_HOST,
  WorkbenchService,
  type WorkbenchLaunch,
} from "../src/web-workbench";

const launch: WorkbenchLaunch = {
  executable: "node", entry: "server.mjs", env: {}, port: 4327, lanHost: WORKBENCH_LAN_BIND_HOST, requirePairing: true,
};

function fakeServer() {
  const runs: { child: ChildProcess; signals: NodeJS.Signals[] }[] = [];
  const service = new WorkbenchService(async () => launch, () => {
    const child = new ChildProcess();
    const signals: NodeJS.Signals[] = [];
    child.kill = signal => {
      assert.ok(signal === "SIGTERM" || signal === "SIGKILL");
      signals.push(signal);
      queueMicrotask(() => child.emit("exit", 0, null));
      return true;
    };
    runs.push({ child, signals });
    return child;
  });
  const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
  const ready = (run: number) => runs[run].child.emit("message", {
    type: "flowdesk-workbench-ready", port: launch.port, lanHost: launch.lanHost,
  });
  return { service, runs, nextTurn, ready };
}

test("Workbench settings default to loopback and the standard port", () => {
  assert.deepEqual(normalizeWorkbenchSettings(undefined), {
    port: DEFAULT_WORKBENCH_PORT, lanHost: "", nodePath: "", autoStart: false, requirePairing: false, pairingKey: "qwe123",
  });
  assert.deepEqual(normalizeWorkbenchSettings({ port: 4328, lanHost: "192.168.1.10", nodePath: " /path to/node ", autoStart: true }), {
    port: 4328, lanHost: WORKBENCH_LAN_BIND_HOST, nodePath: "/path to/node", autoStart: true, requirePairing: false, pairingKey: "qwe123",
  });
  for (const enabled of ["0.0.0.0", " 10.1.2.3 ", "172.16.0.1", "172.31.0.1"]) {
    assert.equal(normalizeWorkbenchSettings({ lanHost: enabled }).lanHost, WORKBENCH_LAN_BIND_HOST);
  }
  for (const disabled of ["", "8.8.8.8", "172.32.0.1", "127.0.0.1", "::", "invalid"]) {
    assert.equal(normalizeWorkbenchSettings({ lanHost: disabled }).lanHost, "");
  }
  for (const invalid of ["", "0", "65536", "1.0", "32e2"]) assert.equal(parseWorkbenchPort(invalid), undefined);
  assert.equal(parseWorkbenchPort("65535"), 65535);
});

test("optional author pairing preserves the configured key exactly", () => {
  const pairingKey = " 自定义配对密钥 ";
  const settings = normalizeWorkbenchSettings({ requirePairing: true, pairingKey });
  assert.equal(settings.requirePairing, true);
  assert.equal(settings.pairingKey, pairingKey);
  assert.equal(normalizeWorkbenchSettings({ requirePairing: "true", pairingKey }).requirePairing, false);
  assert.equal(isWorkbenchPairingKey(pairingKey), true);
  for (const invalid of ["", "  ", "含\r\n换行", "含\0空字符", null]) {
    assert.equal(isWorkbenchPairingKey(invalid), false);
    assert.equal(normalizeWorkbenchSettings({ pairingKey: invalid }).pairingKey, "qwe123");
  }
});

test("Workbench lists concrete non-loopback IPv4 interfaces for wildcard LAN access", () => {
  const ipv4 = (address: string, internal = false): NetworkInterfaceInfoIPv4 => ({
    address, internal, family: "IPv4", mac: "00:00:00:00:00:00", netmask: "255.255.255.0", cidr: `${address}/24`,
  });
  assert.deepEqual(workbenchLanAddresses({
    en0: [ipv4("192.168.0.3"), ipv4("0.0.0.0"), ipv4("127.0.1.1")],
    en1: [ipv4("192.168.0.3"), ipv4("203.0.113.4"), ipv4("192.168.0.5", true)],
    lo0: [{ address: "::1", internal: true, family: "IPv6", mac: "00:00:00:00:00:00", netmask: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", cidr: "::1/128", scopeid: 0 }],
  }), ["192.168.0.3", "203.0.113.4"]);
});

test("review data path is specific to the canonical Vault and independent of the runtime install", () => {
  const vault = path.join("/vaults", "Example Vault");
  const hash = createHash("sha256").update(vault).digest("hex");
  assert.equal(workbenchReviewDataPath(vault, "/user"), path.join("/user", ".flowdesk", "workbench", "review-data", hash));
  assert.notEqual(workbenchReviewDataPath(vault, "/user"), workbenchReviewDataPath(vault + " 2", "/user"));
});

test("only an owned child with the configured listeners can report readiness and be restarted", async t => {
  const { service, runs, nextTurn, ready } = fakeServer();
  t.after(() => service.dispose());
  const first = service.start();
  const duplicate = service.start();
  await nextTurn();
  assert.equal(runs.length, 1);
  runs[0].child.emit("message", { type: "flowdesk-workbench-ready", port: launch.port, lanHost: "" });
  runs[0].child.emit("message", { type: "flowdesk-workbench-ready", port: launch.port, lanHost: "192.168.1.10" });
  await nextTurn();
  assert.equal(service.status.kind, "starting");
  ready(0);
  await Promise.all([first, duplicate]);
  assert.deepEqual(service.status, { kind: "running", port: launch.port, lanHost: launch.lanHost, requirePairing: true });

  const restarted = service.restart();
  await nextTurn();
  assert.deepEqual(runs[0].signals, ["SIGTERM"]);
  assert.equal(runs.length, 2);
  ready(1);
  await restarted;
  assert.equal(service.status.kind, "running");

  runs[1].child.emit("exit", 2, null);
  assert.equal(service.status.kind, "error");
  assert.match(service.status.message, /已退出.*2/);
  await service.stop();
  assert.equal(service.status.kind, "stopped");
  assert.deepEqual(runs[1].signals, []);
});

test("reports an occupied port without attempting to stop the existing listener", async t => {
  const { service, runs, nextTurn } = fakeServer();
  t.after(() => service.dispose());
  const starting = service.start();
  await nextTurn();
  runs[0].child.emit("message", { type: "flowdesk-workbench-start-error", code: "EADDRINUSE" });
  runs[0].child.emit("exit", 1, null);
  await starting;
  assert.equal(service.status.kind, "error");
  assert.match(service.status.message, /4327 已被占用/);
  await service.stop();
  assert.deepEqual(runs[0].signals, []);
});

test("unload cancels pending startup, stops an owned child, and prevents future starts", async () => {
  const { service, runs, nextTurn } = fakeServer();
  const starting = service.start();
  await nextTurn();
  assert.equal(service.status.kind, "starting");
  await Promise.all([starting, service.dispose()]);
  assert.deepEqual(runs[0].signals, ["SIGTERM"]);
  assert.equal(service.status.kind, "stopped");
  await service.start();
  assert.equal(runs.length, 1);
});
