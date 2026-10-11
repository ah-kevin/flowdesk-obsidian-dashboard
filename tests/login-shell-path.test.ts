import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGIN_SHELL_PATH_LIMIT, createLoginShellPathResolver, mergePath, parseLoginShellPath, pickShell, resolveSnapshotEnv, type ExecFileLike,
} from "../src/login-shell-path.ts";

// Every test injects a fake execFile: no real shell is ever started here (see tests/isolation.test.ts).
const wrap = (path: string) => `__FD_PATH_START__${path}__FD_PATH_END__`;
const executable = () => true;
function fake(reply: (call: number) => { error?: Error | null; stdout?: string } | "hang" | "throw") {
  const calls: Array<{ file: string; args: string[]; options: Record<string, unknown> }> = [];
  const execFile: ExecFileLike = (file, args, options, callback) => {
    calls.push({ file, args, options });
    const result = reply(calls.length);
    if (result === "throw") throw new Error("spawn failed");
    if (result !== "hang") callback(result.error ?? null, result.stdout ?? "");
    return undefined;
  };
  return { execFile, calls };
}
const resolverFor = (execFile: ExecFileLike, extra: Record<string, unknown> = {}) =>
  createLoginShellPathResolver({ execFile, shell: "/bin/zsh", isExecutable: executable, platform: "darwin", ...extra });

test("only the text between the markers is used, so rc file noise cannot leak into PATH", () => {
  assert.equal(parseLoginShellPath(`Welcome back\nnvm loaded\n${wrap("/opt/homebrew/bin:/usr/bin:/bin")}\nbye`), "/opt/homebrew/bin:/usr/bin:/bin");
  assert.equal(parseLoginShellPath(wrap("/usr/bin")), "/usr/bin");
});

test("empty, multi-line, NUL, oversized, relative, empty-segment and unmarked output is rejected", () => {
  for (const bad of [
    "", "no markers /usr/bin", "__FD_PATH_START__/usr/bin", wrap(""), wrap("/usr/bin\n/bin"), wrap("/usr/bin\r/bin"), wrap("/usr/bin\0/bin"),
    wrap("/usr/bin:bin"), wrap("/usr/bin::/bin"), wrap("/usr/bin:"), wrap("relative/path"), wrap("/" + "a".repeat(LOGIN_SHELL_PATH_LIMIT)),
  ]) assert.equal(parseLoginShellPath(bad), undefined, JSON.stringify(bad).slice(0, 60));
  assert.equal(parseLoginShellPath(wrap("/" + "a".repeat(LOGIN_SHELL_PATH_LIMIT - 1))), "/" + "a".repeat(LOGIN_SHELL_PATH_LIMIT - 1));
});

test("login-shell PATH goes first, inherited segments are appended without duplicates, order is kept", () => {
  assert.equal(mergePath("/opt/homebrew/bin:/usr/bin", "/usr/bin:/bin:/usr/sbin:/sbin"), "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin");
  assert.equal(mergePath("/a:/b:/a", "/b:/c:/c"), "/a:/b:/c");
  assert.equal(mergePath("/a", ""), "/a");
  assert.equal(mergePath("/a", undefined), "/a");
  assert.equal(mergePath("/a", "::/b"), "/a:/b");
  assert.equal(mergePath(undefined, "/usr/bin"), "/usr/bin");
});

test("the shell is only SHELL when it is an existing absolute executable; nothing is guessed otherwise", () => {
  assert.equal(pickShell("/bin/zsh", executable), "/bin/zsh");
  assert.equal(pickShell("/usr/local/bin/fish", executable), "/usr/local/bin/fish");
  assert.equal(pickShell(undefined, executable), undefined);
  assert.equal(pickShell("", executable), undefined);
  assert.equal(pickShell("zsh", executable), undefined);
  assert.equal(pickShell("/bin/zsh", () => false), undefined);
  assert.equal(pickShell("/bin/zsh\0", executable), undefined);
});

test("the shell is run with a constant -lc command, no shell option and a timeout", async () => {
  const { execFile, calls } = fake(() => ({ stdout: wrap("/opt/homebrew/bin:/usr/bin") }));
  assert.equal(await resolverFor(execFile, { shell: "/usr/local/bin/fish" })(), "/opt/homebrew/bin:/usr/bin");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "/usr/local/bin/fish");
  assert.deepEqual(calls[0].args, ["-lc", 'printf "__FD_PATH_START__%s__FD_PATH_END__" "$PATH"']);
  assert.equal("shell" in calls[0].options, false);
  assert.equal(calls[0].options.timeout, 3000);
});

test("failure, throw, bad output, missing SHELL and win32 all fall back to undefined without starting anything unexpected", async () => {
  assert.equal(await resolverFor(fake(() => ({ error: new Error("exit 1") })).execFile)(), undefined);
  assert.equal(await resolverFor(fake(() => "throw").execFile)(), undefined);
  assert.equal(await resolverFor(fake(() => ({ stdout: wrap("relative") })).execFile)(), undefined);
  const noShell = fake(() => ({ stdout: wrap("/usr/bin") }));
  assert.equal(await resolverFor(noShell.execFile, { shell: undefined })(), undefined);
  assert.equal(noShell.calls.length, 0);
  const windows = fake(() => ({ stdout: wrap("/usr/bin") }));
  assert.equal(await resolverFor(windows.execFile, { platform: "win32" })(), undefined);
  assert.equal(windows.calls.length, 0);
});

test("a shell that never answers cannot hold the caller beyond the timeout", async () => {
  const { execFile } = fake(() => "hang");
  const started = Date.now();
  assert.equal(await resolverFor(execFile, { timeoutMs: 20 })(), undefined);
  assert.ok(Date.now() - started < 1500, "resolved within the bounded wait");
});

test("the shell runs once; concurrent and later callers share the cached result, failures are cached too", async () => {
  const ok = fake(() => ({ stdout: wrap("/opt/homebrew/bin:/usr/bin") }));
  const resolve = resolverFor(ok.execFile);
  assert.deepEqual(await Promise.all([resolve(), resolve(), resolve()]), Array(3).fill("/opt/homebrew/bin:/usr/bin"));
  assert.equal(await resolve(), "/opt/homebrew/bin:/usr/bin");
  assert.equal(ok.calls.length, 1);
  const failing = fake(call => (call === 1 ? { error: new Error("boom") } : { stdout: wrap("/usr/bin") }));
  const again = resolverFor(failing.execFile);
  assert.equal(await again(), undefined);
  assert.equal(await again(), undefined);
  assert.equal(failing.calls.length, 1);
  assert.equal(await resolverFor(fake(() => ({ stdout: wrap("/x/bin") })).execFile)(), "/x/bin", "a new resolver (plugin reload) asks again");
});

test("snapshot env gets the merged PATH, keeps other variables and never mutates the input", async () => {
  const input = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: "/Users/x", TASKNOTES_API_TOKEN: "secret" };
  const snapshot = { ...input };
  const env = await resolveSnapshotEnv(input, "{}", async () => "/opt/homebrew/bin:/usr/bin");
  assert.equal(env.PATH, "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin");
  assert.equal(env.HOME, "/Users/x");
  assert.equal(env.TASKNOTES_API_TOKEN, "secret");
  assert.deepEqual(input, snapshot);
  assert.notEqual(env, input);
});

test("a PATH configured in the environment JSON wins and the login shell is not even asked", async () => {
  let asked = 0;
  const env = { PATH: "/custom/bin" };
  const result = await resolveSnapshotEnv(env, '{"PATH":"/custom/bin","OTHER":"1"}', async () => { asked++; return "/opt/homebrew/bin"; });
  assert.equal(result, env);
  assert.equal(result.PATH, "/custom/bin");
  assert.equal(asked, 0);
  const withoutPath = await resolveSnapshotEnv({ PATH: "/usr/bin" }, '{"OTHER":"1"}', async () => "/opt/homebrew/bin");
  assert.equal(withoutPath.PATH, "/opt/homebrew/bin:/usr/bin");
});

test("snapshot env falls back to the inherited environment when the login PATH is unavailable or the resolver misbehaves", async () => {
  const env = { PATH: "/usr/bin:/bin" };
  assert.equal(await resolveSnapshotEnv(env, "{}", async () => undefined), env);
  assert.equal(await resolveSnapshotEnv(env, "{}", async () => { throw new Error("nope"); }), env);
  assert.equal(await resolveSnapshotEnv(env, "{not json", async () => "/opt/homebrew/bin"), env);
  assert.equal(await resolveSnapshotEnv(env, "{}", async () => "/usr/bin:/bin"), env, "nothing new to add keeps the same object");
  const noPath = await resolveSnapshotEnv({ HOME: "/h" }, "{}", async () => "/opt/homebrew/bin");
  assert.equal(noPath.PATH, "/opt/homebrew/bin");
});
