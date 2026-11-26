import { execFile, spawn, type ChildProcess } from "child_process";
import { createHash } from "crypto";
import { realpath, stat } from "fs/promises";
import { isIPv4 } from "net";
import { homedir, networkInterfaces } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { promisify } from "util";
import { resolveSnapshotEnv } from "./login-shell-path";
import { resolveTaskNotesApiUrl, resolveTaskNotesAuth } from "./tasknotes-auth";

const execFileAsync = promisify(execFile);
export const DEFAULT_WORKBENCH_PORT = 4327;
export const WORKBENCH_LAN_BIND_HOST = "0.0.0.0";
const DEFAULT_WORKBENCH_PAIRING_KEY = "qwe123";

export interface WorkbenchSettings {
  port: number;
  lanHost: string;
  nodePath: string;
  autoStart: boolean;
  requirePairing: boolean;
  pairingKey: string;
}

export function parseWorkbenchPort(value: string): number | undefined {
  const port = Number(value);
  return /^\d{1,5}$/.test(value) && port >= 1 && port <= 65535 ? port : undefined;
}

function isPrivateIPv4(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [first, second] = address.split(".").map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function isWorkbenchPairingKey(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && !/[\0\r\n]/.test(value);
}

export function normalizeWorkbenchSettings(value: unknown): WorkbenchSettings {
  const settings = value && typeof value === "object" ? value as Partial<WorkbenchSettings> : {};
  const lanHost = typeof settings.lanHost === "string" ? settings.lanHost.trim() : "";
  return {
    port: typeof settings.port === "number" ? parseWorkbenchPort(String(settings.port)) ?? DEFAULT_WORKBENCH_PORT : DEFAULT_WORKBENCH_PORT,
    lanHost: lanHost === WORKBENCH_LAN_BIND_HOST || isPrivateIPv4(lanHost) ? WORKBENCH_LAN_BIND_HOST : "",
    nodePath: typeof settings.nodePath === "string" ? settings.nodePath.trim() : "",
    autoStart: settings.autoStart === true,
    requirePairing: settings.requirePairing === true,
    pairingKey: isWorkbenchPairingKey(settings.pairingKey) ? settings.pairingKey : DEFAULT_WORKBENCH_PAIRING_KEY,
  };
}

export function workbenchLanAddresses(interfaces = networkInterfaces()): string[] {
  const addresses = Object.values(interfaces).flatMap(entries => (entries ?? [])
    .filter(({ address, internal }) => !internal && isIPv4(address) && address !== WORKBENCH_LAN_BIND_HOST
      && !address.startsWith("127.")).map(entry => entry.address));
  return [...new Set(addresses)].sort();
}

export function workbenchReviewDataPath(canonicalVault: string, userHome = homedir()): string {
  const vaultId = createHash("sha256").update(canonicalVault).digest("hex");
  return join(userHome, ".flowdesk", "workbench", "review-data", vaultId);
}

export interface WorkbenchLaunch {
  executable: string;
  entry: string;
  env: NodeJS.ProcessEnv;
  port: number;
  lanHost: string;
  requirePairing: boolean;
}

export async function prepareWorkbenchLaunch(input: {
  vaultRoot: string;
  pluginDir: string;
  settings: WorkbenchSettings;
  tasknotesEnv: string;
  apiUrl: string;
}, signal: AbortSignal): Promise<WorkbenchLaunch> {
  const { port, lanHost, nodePath, requirePairing, pairingKey } = normalizeWorkbenchSettings(input.settings);
  const entry = resolve(input.vaultRoot, input.pluginDir, "workbench-runtime", "flowdesk-workbench", "server.mjs");
  const info = await stat(entry).catch(() => undefined);
  if (!info?.isFile()) throw new Error("缺少 Web 工作台运行文件。请安装包含 workbench-runtime 的 FlowDesk Dashboard 插件包。");
  if (nodePath && (!isAbsolute(nodePath) || nodePath.includes("\0"))) {
    throw new Error("请输入 Node.js 可执行文件的绝对路径。");
  }
  const vault = await realpath(input.vaultRoot);
  const auth = resolveTaskNotesAuth(input.tasknotesEnv);
  const nodeEnv = await resolveSnapshotEnv(auth.env, input.tasknotesEnv);
  const executable = nodePath || "node";
  const { stdout } = await execFileAsync(executable, ["--version"], {
    env: nodeEnv, signal, timeout: 5000, windowsHide: true,
  }).catch(() => { throw new Error("无法运行 Node.js。请安装 Node.js 22 或以上，或填写可执行文件的绝对路径。"); });
  const version = /^v(\d+)\.\d+\.\d+(?:[-+][\w.-]+)?$/.exec(stdout.trim());
  if (!version || Number(version[1]) < 22) throw new Error("Web 工作台需要 Node.js 22 或以上。请检查 Node.js 路径。");
  const reviewData = workbenchReviewDataPath(vault);
  return {
    executable, entry, port, lanHost, requirePairing,
    env: {
      ...nodeEnv,
      OBSIDIAN_VAULT: vault,
      TASKNOTES_API_URL: resolveTaskNotesApiUrl(input.apiUrl, auth.env),
      FLOWDESK_WORKBENCH_VAULT: vault,
      FLOWDESK_WORKBENCH_PORT: String(port),
      FLOWDESK_WORKBENCH_LAN_HOST: lanHost,
      FLOWDESK_WORKBENCH_REQUIRE_PAIRING: requirePairing ? "1" : "0",
      FLOWDESK_WORKBENCH_PAIRING_KEY: pairingKey,
      FLOWDESK_WORKBENCH_REVIEW_DATA: reviewData,
      FLOWDESK_REVIEW_DATA: reviewData,
    },
  };
}

export type WorkbenchStatus =
  | { kind: "stopped" | "starting" | "stopping" }
  | { kind: "running"; port: number; lanHost: string; requirePairing: boolean }
  | { kind: "error"; message: string; canStop?: boolean };

type Startup = { kind: "ready" | "cancelled" } | { kind: "failed"; message: string };
type ChildExit = { code: number | null; signal: NodeJS.Signals | null };

function startError(code: unknown, config: WorkbenchLaunch): string {
  if (code === "EADDRINUSE") return `端口 ${config.port} 已被占用。请更换端口，或从原服务停止它。`;
  if (code === "EACCES") return `系统拒绝监听端口 ${config.port}。请检查端口权限或更换端口。`;
  if (code === "EADDRNOTAVAIL") return `系统无法监听 ${config.lanHost || "127.0.0.1"}:${config.port}。请检查本机网络设置后重试。`;
  if (code === "ERR_MODULE_NOT_FOUND") return "Web 工作台运行依赖缺失。请重新安装完整的 Dashboard 插件包。";
  return "Web 工作台无法启动。请检查运行文件、Vault 和评审数据目录后重试。";
}

function observeChild(child: ChildProcess, config: WorkbenchLaunch, onExit: (exit: ChildExit) => void) {
  let finishStartup!: (result: Startup) => void;
  const startup = new Promise<Startup>(resolve => { finishStartup = resolve; });
  let exited = false;
  const exit = new Promise<true>(resolve => {
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (exited) return;
      exited = true;
      finishStartup({ kind: "failed", message: startError(undefined, config) });
      resolve(true);
      onExit({ code, signal });
    };
    child.once("exit", finish);
    child.once("close", finish);
  });
  child.on("error", (error: NodeJS.ErrnoException) => {
    finishStartup({ kind: "failed", message: startError(error.code, config) });
  });
  child.on("message", event => {
    if (!event || typeof event !== "object") return;
    const message = event as Record<string, unknown>;
    if (message.type === "flowdesk-workbench-start-error") {
      finishStartup({ kind: "failed", message: startError(message.code, config) });
    }
    if (message.type === "flowdesk-workbench-ready" && message.port === config.port && message.lanHost === config.lanHost) {
      finishStartup({ kind: "ready" });
    }
  });
  return { child, startup, exit, hasExited: () => exited };
}

function awaitStartup(startup: Promise<Startup>, signal: AbortSignal): Promise<Startup> {
  if (signal.aborted) return Promise.resolve({ kind: "cancelled" });
  return new Promise(resolve => {
    const finish = (result: Startup) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = () => finish({ kind: "cancelled" });
    const timeout = setTimeout(() => finish({ kind: "failed", message: "等待 Web 工作台启动超时。" }), 15000);
    signal.addEventListener("abort", abort, { once: true });
    void startup.then(finish);
  });
}

function awaitExit(exit: Promise<true>, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    void exit.then(closed => { clearTimeout(timeout); resolve(closed); });
  });
}

function spawnWorkbench(config: WorkbenchLaunch): ChildProcess {
  return spawn(config.executable, [config.entry], {
    cwd: dirname(config.entry), env: config.env, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
}

export class WorkbenchService {
  private current: WorkbenchStatus = { kind: "stopped" };
  private child?: ReturnType<typeof observeChild>;
  private startRequest?: AbortController;
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly listeners = new Set<(state: WorkbenchStatus) => void>();

  constructor(
    private readonly prepare: (signal: AbortSignal) => Promise<WorkbenchLaunch>,
    private readonly spawnChild = spawnWorkbench,
  ) {}

  get status(): WorkbenchStatus { return this.current; }

  subscribe(listener: (state: WorkbenchStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => { this.listeners.delete(listener); };
  }

  private update(state: WorkbenchStatus): void {
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const pending = this.tail.then(operation);
    this.tail = pending.catch(() => {});
    return pending;
  }

  start(): Promise<void> {
    if (this.disposed || this.startRequest) return this.tail;
    const request = this.startRequest = new AbortController();
    return this.enqueue(async () => {
      try { await this.startOwned(request.signal); }
      finally { if (this.startRequest === request) this.startRequest = undefined; }
    });
  }

  stop(): Promise<void> {
    this.startRequest?.abort();
    this.startRequest = undefined;
    return this.enqueue(() => this.stopOwned());
  }

  restart(): Promise<void> {
    void this.stop();
    return this.start();
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.listeners.clear();
    return this.stop();
  }

  private async startOwned(signal: AbortSignal): Promise<void> {
    if (signal.aborted || this.child) return;
    this.update({ kind: "starting" });
    try {
      const config = await this.prepare(signal);
      if (signal.aborted) return;
      const run = observeChild(this.spawnChild(config), config, exit => {
        if (this.child !== run) return;
        this.child = undefined;
        if (this.current.kind === "running") {
          this.update({ kind: "error", message: `Web 工作台已退出（${exit.signal ?? exit.code ?? "原因未知"}）。` });
        } else if (this.current.kind === "error" && this.current.canStop) {
          this.update({ kind: "error", message: this.current.message });
        }
      });
      this.child = run;
      const startup = await awaitStartup(run.startup, signal);
      if (signal.aborted) return;
      if (startup.kind === "ready" && !run.hasExited()) {
        this.update({ kind: "running", port: config.port, lanHost: config.lanHost, requirePairing: config.requirePairing });
        return;
      }
      const stopped = await this.terminate(run);
      if (signal.aborted) return;
      const message = startup.kind === "failed" ? startup.message : "Web 工作台在启动后退出。";
      this.update({ kind: "error", message, canStop: !stopped });
    } catch (error) {
      if (!signal.aborted) this.update({ kind: "error", message: error instanceof Error ? error.message : "Web 工作台无法启动。" });
    }
  }

  private async stopOwned(): Promise<void> {
    const run = this.child;
    if (run) {
      this.update({ kind: "stopping" });
      if (!await this.terminate(run)) {
        this.update({ kind: "error", message: "未收到 Web 工作台进程的退出确认。", canStop: true });
        return;
      }
    }
    this.update({ kind: "stopped" });
  }

  private async terminate(run: ReturnType<typeof observeChild>): Promise<boolean> {
    if (run.hasExited()) return true;
    run.child.kill("SIGTERM");
    if (await awaitExit(run.exit, 2500)) return true;
    run.child.kill("SIGKILL");
    return awaitExit(run.exit, 1000);
  }
}
