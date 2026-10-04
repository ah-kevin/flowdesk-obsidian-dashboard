import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, mkdirSync, writeFileSync, readFileSync, realpathSync, symlinkSync, copyFileSync, accessSync, constants } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const repositoryRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
if (!process.allowedNodeEnvironmentFlags.has("--test-isolation=none")) {
  throw new Error(`Full local tests require a Node runtime supporting --test-isolation=none (current ${process.version}; locally verified Node 24).`);
}
const coreCandidates = process.env.FLOWDESK_PLUGIN_ROOT
  ? [path.resolve(process.env.FLOWDESK_PLUGIN_ROOT)]
  : [path.resolve(repositoryRoot, "../flowdesk-plugin"), path.resolve(repositoryRoot, "../../flowdesk-plugin")];
const dependencies = ["bin/flowdesk-execution-snapshot", "bin/flowdesk-work-case-snapshot",
  "lib/flowdesk_execution_snapshot.py", "lib/flowdesk_work_case_snapshot.py",
  "mcp/src/__tests__/support/guard-preload.cjs", "tests/support/sitecustomize.py",
  "mcp/src/tools/task-update-details.ts", "mcp/node_modules/zod/package.json",
  "mcp/package.json", "mcp/dist/tools/context-builder-tools.js", "mcp/node_modules/@modelcontextprotocol/sdk/package.json",
  "tests/fixtures/execution_snapshot/sdd_v3_real_root_snapshot.json"];
const coreCandidate = coreCandidates.find(root => dependencies.every(file => {
  try { accessSync(path.join(root, file), constants.R_OK); return true; } catch { return false; }
}));
if (!coreCandidate) {
  throw new Error(`Missing real Core test dependencies. Set FLOWDESK_PLUGIN_ROOT to a Core source checkout with mcp dependencies installed. Checked: ${coreCandidates.join(", ")}`);
}
const core = realpathSync(coreCandidate);
// Keep the invocation path, including a venv's bin directory; realpath or an owned symlink loses its prefix.
const pythonCommand = process.env.FLOWDESK_TEST_PYTHON || "python3";
const pythonCandidates = pythonCommand.includes(path.sep)
  ? [path.resolve(pythonCommand)]
  : (process.env.PATH || "").split(path.delimiter).filter(Boolean).map(dir => path.resolve(dir, pythonCommand));
const python = pythonCandidates.find(file => { try { accessSync(file, constants.X_OK); return true; } catch { return false; } });
if (!python) throw new Error(`Python interpreter not found: ${pythonCommand}. Set FLOWDESK_TEST_PYTHON or provide python3 on PATH.`);
const pythonProbe = spawnSync(python, ["-I", "-c", 'import importlib.util,json,sys; spec=importlib.util.find_spec("pip"); print(json.dumps({"identity":{"prefix":sys.prefix,"base_prefix":sys.base_prefix,"pip":spec.origin if spec else None},"paths":[p for p in sys.path if p]}))'],
  { env: { LANG: "en_US.UTF-8", TZ: "Asia/Shanghai" }, encoding: "utf8" });
if (pythonProbe.status !== 0) throw new Error(`Configured Python probe failed: ${pythonProbe.stderr || pythonProbe.error?.message || pythonProbe.status}`);
const pythonRuntime = JSON.parse(pythonProbe.stdout);
for (const key of ["prefix", "base_prefix", "pip"]) {
  if (pythonRuntime.identity[key]) pythonRuntime.identity[key] = realpathSync(pythonRuntime.identity[key]);
}
const temporaryDirectory = realpathSync(mkdtempSync(path.join(tmpdir(), "flowdesk-dashboard-tests-")));
// The Core guard has no relative dependencies. An owned copy keeps NODE_OPTIONS valid when Core's path contains spaces.
const preload = path.join(temporaryDirectory, "guard-preload.cjs");
copyFileSync(path.join(core, "mcp/src/__tests__/support/guard-preload.cjs"), preload);
const support = path.join(core, "tests/support");
const node = realpathSync(process.execPath);
const esbuild = realpathSync(require.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`));
const capsFile = path.join(temporaryDirectory, "capabilities.json");
const violationFile = path.join(temporaryDirectory, "violations.jsonl");
const originalHome = realpathSync(homedir());
const originalVault = process.env.OBSIDIAN_VAULT;
const data = {version:1, fixture_root:temporaryDirectory, original_home:originalHome,
  executables:[], interpreters:[], shells:[], scripts:[], shell_commands:[], commands:[], endpoints:[],
  protected_roots:[originalHome,"/tmp/flowdesk-mcp.log","/private/tmp/flowdesk-mcp.log","/tmp/flowdesk-session-registry.json","/tmp/flowdesk-session-registry.lock", ...(originalVault ? [originalVault] : [])],
  readable_roots:[path.join(repositoryRoot,"src"), path.join(repositoryRoot,"tests"), path.join(repositoryRoot,"styles.css"), path.join(repositoryRoot,"node_modules"),
    path.join(core,"lib"),path.join(core,"bin"),
    // Actual Core version shown by the fixed-path consumer; these two metadata files are read-only.
    path.join(core,".claude-plugin/plugin.json"),path.join(core,".codex-plugin/plugin.json"),
    // Read-only compiled consumer and its installed runtime dependencies, never arbitrary HOME/state.
    path.join(core,"mcp/dist"),path.join(core,"mcp/package.json"),path.join(core,"mcp/node_modules"),support,path.dirname(preload),path.join(core,"tests/fixtures/execution_snapshot/sdd_v3_real_root_snapshot.json"),node,...pythonRuntime.paths], violation_file:violationFile};
for (const name of ["home", "vault", "state", "tmp", "bin"]) mkdirSync(path.join(temporaryDirectory, name));
symlinkSync(node, path.join(temporaryDirectory, "bin/node"));
const quoteShell = value => "'" + value.replaceAll("'", "'\\''") + "'";
writeFileSync(path.join(temporaryDirectory, "bin/python3"), `#!/bin/sh\nexec ${quoteShell(python)} "$@"\n`, { mode: 0o755 });
const env = {
  LANG:"en_US.UTF-8", TZ:"Asia/Shanghai", HOME:path.join(temporaryDirectory,"home"),
  OBSIDIAN_VAULT:path.join(temporaryDirectory,"vault"), FLOWDESK_STATE_HOME:path.join(temporaryDirectory,"state"),
  TMPDIR:path.join(temporaryDirectory,"tmp"), XDG_CONFIG_HOME:path.join(temporaryDirectory,"home/.config"),
  XDG_CACHE_HOME:path.join(temporaryDirectory,"home/.cache"), PATH:path.join(temporaryDirectory,"bin"),
  TASKNOTES_API_URL:"http://127.0.0.1:1", TASKNOTES_API_TOKEN:"", TASKNOTES_AUTH_TOKEN:"",
  FLOWDESK_SESSION_REGISTRY_PATH:path.join(temporaryDirectory,"registry.json"), FLOWDESK_SESSION_REGISTRY_LOCK_PATH:path.join(temporaryDirectory,"registry.lock"),
  FLOWDESK_MCP_LOG_FILE:path.join(temporaryDirectory,"mcp.log"), FLOWDESK_PLUGIN_ROOT:core,
  FLOWDESK_TEST_ROOT:temporaryDirectory, FLOWDESK_TEST_CAPS:capsFile, FLOWDESK_TEST_ESBUILD:esbuild,
  FLOWDESK_TEST_NODE_PRELOAD:preload, FLOWDESK_TEST_PYTHON_SUPPORT:support,
  FLOWDESK_TEST_PYTHON_IDENTITY:JSON.stringify(pythonRuntime.identity),
  NODE_OPTIONS:`--require=${preload}`, PYTHONPATH:support, PYTHONDONTWRITEBYTECODE:"1", PYTHONPYCACHEPREFIX:path.join(temporaryDirectory,"pycache"),
};
writeFileSync(capsFile, JSON.stringify(data));
// Sanitize before any bundler or descendant starts. No host loader options or credentials survive.
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env);
require(preload);
function command(executable,args,cwd) {
  const current = JSON.parse(readFileSync(capsFile,"utf8"));
  current.commands.push({ executable, args, cwd });
  writeFileSync(capsFile,JSON.stringify(current));
  return spawnSync(executable,args,{cwd,env,encoding:"utf8"});
}
try {
  const discovered = readdirSync(path.join(repositoryRoot,"tests")).filter(x=>x.endsWith(".test.ts")).sort();
  const requested = process.argv.slice(2);
  if (requested.some(x=>!discovered.includes(x))) throw Error("未知测试文件");
  const bundles=[];
  for (const testFile of requested.length ? requested : discovered) {
    const bundle = path.join(temporaryDirectory,testFile.replace(/\.ts$/,".mjs"));
    const result=command(esbuild,[`tests/${testFile}`,"--bundle","--format=esm",`--outfile=${bundle}`,"--platform=node","--sourcemap=inline","--target=node20",`--alias:@flowdesk-test/task-update-details=${path.join(core,"mcp/src/tools/task-update-details.ts")}`],repositoryRoot);
    if(result.status!==0) throw Error(result.stderr || result.error?.message || "bundle failed");
    bundles.push(bundle);
  }
  // Run bundles in the same guarded process; exact argv avoids unrestricted Node capabilities.
  const result=command(node,["--test","--test-isolation=none",...bundles],repositoryRoot);
  process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || "");
  if(result.error) console.error(result.error.message);
  process.exitCode=result.status ?? 1;
  const violations = (()=>{try{return readFileSync(violationFile,"utf8").trim();}catch{return "";}})();
  if(violations) {console.error("Unexpected test isolation violations:\n"+violations);process.exitCode=1;}
} finally { rmSync(temporaryDirectory,{force:true,recursive:true}); }
