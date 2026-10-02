import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, mkdirSync, writeFileSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const repositoryRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const temporaryDirectory = realpathSync(mkdtempSync(path.join(tmpdir(), "flowdesk-dashboard-tests-")));
const core = "/Users/bjke/workspaces/flowdesk-plugin";
const preload = path.join(core, "mcp/src/__tests__/support/guard-preload.cjs");
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
    path.join(core,"lib"),path.join(core,"bin"),support,path.dirname(preload),path.join(core,"tests/fixtures/execution_snapshot/sdd_v3_real_root_snapshot.json"),node], violation_file:violationFile};
for (const name of ["home", "vault", "state", "tmp", "bin"]) mkdirSync(path.join(temporaryDirectory, name));
symlinkSync(node, path.join(temporaryDirectory, "bin/node"));
symlinkSync("/opt/homebrew/bin/python3", path.join(temporaryDirectory, "bin/python3"));
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
    const result=command(esbuild,[`tests/${testFile}`,"--bundle","--format=esm",`--outfile=${bundle}`,"--platform=node","--sourcemap=inline","--target=node20"],repositoryRoot);
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
