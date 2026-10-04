import {accessSync, constants, readFileSync, readdirSync, realpathSync} from "fs";
import * as path from "path";

export type CoreMode = "installed" | "fixed";
export interface CoreResolution { root: string; version: string; source: "fixed" | "claude-installed" | "codex-cache"; notices: string[] }
const stableVersion = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
const json = (file: string): any => JSON.parse(readFileSync(file,"utf8"));
function validate(root: string, installed: boolean): {root:string; version:string} {
  const canonical = realpathSync(root);
  for (const name of ["flowdesk-execution-snapshot", "flowdesk-work-case-snapshot"]) accessSync(path.join(canonical,"bin",name),constants.X_OK);
  const manifests = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"].flatMap(file => {
    try {return [json(path.join(canonical,file))];} catch {return [];}
  });
  if (installed && (!manifests.length || manifests.some(m => m.name!=="flow-desk" || !stableVersion(m.version)))) throw Error("Core 名称或版本无法确认");
  if (new Set(manifests.map(m=>m.version)).size>1) throw Error("Core 的版本声明不一致");
  return {root:canonical,version:typeof manifests[0]?.version==="string"?manifests[0].version:"未记录"};
}

/** Resolve on every explicit refresh. Cache directories are disclosed as cache candidates, never runtime evidence. */
export function resolveCore(options: {mode:CoreMode; fixedPath:string; home:string; workingDirectory?:string}): CoreResolution {
  if (options.mode==="fixed") {
    if (!options.fixedPath) throw Error("固定 Core 路径为空，请打开设置填写路径。");
    try {return {...validate(options.fixedPath,false),source:"fixed",notices:[]};}
    catch(error){throw Error(`固定 Core 路径无效：${options.fixedPath}；${error instanceof Error?error.message:String(error)}。请打开设置检查。`);}
  }
  const notices:string[]=[];
  try {
    const registry=json(path.join(options.home,".claude/plugins/installed_plugins.json"));
    const rows=registry?.plugins?.["flow-desk@flowdesk-marketplace"];
    if (!Array.isArray(rows)) throw Error("没有 FlowDesk 安装登记");
    const applicable=rows.filter(r => r && (r.scope==="user" || ((r.scope==="project" || r.scope==="local") && typeof r.projectPath==="string" && options.workingDirectory && path.resolve(r.projectPath)===path.resolve(options.workingDirectory))));
    const scoped=applicable.filter(r=>r.scope!=="user");
    const candidates=(scoped.length?scoped:applicable).map(r=>{
      if(typeof r.installPath!=="string" || !path.isAbsolute(r.installPath)) throw Error("安装登记路径无效");
      const found=validate(r.installPath,true);
      if(r.version && r.version!==found.version) throw Error("安装登记与 Core 版本不一致");
      return found;
    });
    const unique=[...new Map(candidates.map(r=>[r.root,r])).values()];
    if(unique.length>1) throw Error("存在多个适用的 Core 安装，请在设置中选择固定路径。");
    if(unique.length===1)return {...unique[0],source:"claude-installed",notices};
    throw Error("没有适用的 Core 安装登记");
  } catch(error) {
    if(error instanceof Error && error.message.startsWith("存在多个适用"))throw error;
    notices.push(`Claude 安装登记不可用：${error instanceof Error?error.message:String(error)}`);
  }
  const cache=path.join(options.home,".codex/plugins/cache/flowdesk-marketplace/flow-desk");
  const candidates:Array<{root:string;version:string}>=[];
  try {
    for(const name of readdirSync(cache).filter(stableVersion)) {
      try {const found=validate(path.join(cache,name),true);if(found.version===name)candidates.push(found);}catch{/* Incomplete caches are not executable candidates. */}
    }
  } catch {/* Report the discovery failure below, without choosing unrelated directories. */}
  candidates.sort((a,b)=>{const aa=a.version.split(".").map(Number),bb=b.version.split(".").map(Number);return bb[0]-aa[0]||bb[1]-aa[1]||bb[2]-aa[2];});
  if(candidates.length)return {...candidates[0],source:"codex-cache",notices:[...notices,"使用有效的 Codex 缓存候选；此来源不证明宿主实际加载。"]};
  throw Error(`未找到有效 Core。${notices.join("；")}；Codex 缓存没有完整版本。请打开设置选择固定路径。`);
}
