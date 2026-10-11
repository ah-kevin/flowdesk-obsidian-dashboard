import { execFile as nodeExecFile } from "child_process";
import { accessSync, constants, statSync } from "fs";
import { parseTaskNotesEnvironment } from "./tasknotes-auth";

/**
 * Obsidian started from Finder inherits launchd's minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin), so
 * `#!/usr/bin/env python3` in Core scripts resolves to the system Python instead of the user's one.
 * The user's login-shell PATH is read once, validated, and merged in front of the inherited PATH for
 * snapshot child processes only. Any failure falls back to the inherited environment unchanged.
 */
export const LOGIN_SHELL_TIMEOUT_MS = 3000;
export const LOGIN_SHELL_PATH_LIMIT = 8192;
const START = "__FD_PATH_START__";
const END = "__FD_PATH_END__";
// Constant command text: nothing from settings, the vault or the environment is interpolated into it.
const SHELL_ARGS = ["-lc", `printf "${START}%s${END}" "$PATH"`];

export type ExecFileLike = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; killSignal: NodeJS.Signals; windowsHide: boolean },
  callback: (error: Error | null, stdout: string) => void
) => unknown;

export interface LoginShellDeps {
  execFile?: ExecFileLike;
  platform?: NodeJS.Platform;
  /** Value of `process.env.SHELL`. */
  shell?: string;
  isExecutable?: (path: string) => boolean;
  timeoutMs?: number;
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch { return false; }
}

/**
 * Only an existing absolute executable `$SHELL` (Finder/launchd sets it to the account shell) is asked.
 * No shell is guessed when it is missing or unusable: the caller then keeps the inherited environment, and
 * environments without SHELL (for example the isolated test runner) never start a shell.
 */
export function pickShell(shell: string | undefined, isExecutable: (path: string) => boolean = isExecutableFile): string | undefined {
  return shell && shell.startsWith("/") && !shell.includes("\0") && isExecutable(shell) ? shell : undefined;
}

/** Take only the text between the markers (rc files may print extra output) and validate it as a PATH. */
export function parseLoginShellPath(stdout: string): string | undefined {
  const start = stdout.indexOf(START);
  if (start < 0) return undefined;
  const from = start + START.length;
  const end = stdout.indexOf(END, from);
  if (end < 0) return undefined;
  const value = stdout.slice(from, end);
  if (!value || value.length > LOGIN_SHELL_PATH_LIMIT || /[\r\n\0]/.test(value)) return undefined;
  return value.split(":").every(segment => segment.startsWith("/")) ? value : undefined;
}

/** Login-shell PATH first, then the inherited segments not already present. Order kept, duplicates and empty segments dropped. */
export function mergePath(login: string | undefined, current: string | undefined): string | undefined {
  if (!login) return current;
  const seen = new Set<string>(), merged: string[] = [];
  for (const segment of [...login.split(":"), ...(current ?? "").split(":")]) {
    if (segment && !seen.has(segment)) { seen.add(segment); merged.push(segment); }
  }
  return merged.join(":");
}

/** Returns a resolver that runs the login shell at most once; both success and failure are cached. Never rejects. */
export function createLoginShellPathResolver(deps: LoginShellDeps = {}): () => Promise<string | undefined> {
  const run = deps.execFile ?? (nodeExecFile as unknown as ExecFileLike);
  const timeoutMs = deps.timeoutMs ?? LOGIN_SHELL_TIMEOUT_MS;
  let cached: Promise<string | undefined> | undefined;
  const read = (): Promise<string | undefined> => {
    if ((deps.platform ?? process.platform) === "win32") return Promise.resolve(undefined);
    return new Promise<string | undefined>(resolve => {
      // The timer also bounds a runner that never calls back, so the view is never held longer than the timeout.
      const timer = setTimeout(() => resolve(undefined), timeoutMs + 500);
      const finish = (value: string | undefined) => { clearTimeout(timer); resolve(value); };
      try {
        const shell = pickShell("shell" in deps ? deps.shell : process.env.SHELL, deps.isExecutable);
        if (!shell) { finish(undefined); return; }
        run(shell, SHELL_ARGS, { timeout: timeoutMs, maxBuffer: 64 * 1024, killSignal: "SIGKILL", windowsHide: true }, (error, stdout) => {
          finish(error ? undefined : parseLoginShellPath(String(stdout ?? "")));
        });
      } catch { finish(undefined); }
    });
  };
  return () => (cached ??= read());
}

const defaultResolver = createLoginShellPathResolver();

/**
 * Environment for snapshot child processes. A PATH configured explicitly in the plugin's environment JSON wins;
 * otherwise the login-shell PATH is merged in front. The input object is never mutated.
 */
export async function resolveSnapshotEnv(
  env: NodeJS.ProcessEnv,
  configuration: string,
  resolver: () => Promise<string | undefined> = defaultResolver
): Promise<NodeJS.ProcessEnv> {
  try {
    if (Object.prototype.hasOwnProperty.call(parseTaskNotesEnvironment(configuration), "PATH")) return env;
    const merged = mergePath(await resolver(), env.PATH);
    return merged && merged !== env.PATH ? { ...env, PATH: merged } : env;
  } catch { return env; }
}
