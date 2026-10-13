import {execFileSync} from "node:child_process";
import {mkdir,readFile,writeFile,copyFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const require=createRequire(import.meta.url);
const packageRoot=path.join(root,"packages/dashboard-ui");
const argv=process.argv.slice(2);
if(argv.length&&!(argv.length===2&&argv[0]==="--out-dir"))throw Error("Use --out-dir <absolute path>");
const out=argv.length?path.resolve(argv[1]):path.join(packageRoot,"dist");
await mkdir(out,{recursive:true});
const esbuild=require.resolve("@esbuild/"+process.platform+"-"+process.arch+"/bin/esbuild");
for(const [name,platform,format] of [["browser","browser","iife"],["model","node","esm"],["index","browser","esm"]]){
  const args=[path.join(packageRoot,"src",name+".ts"),"--bundle","--platform="+platform,"--format="+format,"--target=es2018",
    ...(name==="browser"?["--global-name=FlowDeskDashboardUI"]:[]),"--outfile="+path.join(out,name+".js"),"--metafile="+path.join(out,name+"-meta.json")];
  execFileSync(esbuild,args,{cwd:root,stdio:"pipe"});
}
execFileSync(process.execPath,[path.join(root,"node_modules/typescript/bin/tsc"),"-p",path.join(packageRoot,"tsconfig.json"),"--outDir",out],{cwd:root,stdio:"pipe"});
await copyFile(path.join(packageRoot,"styles.css"),path.join(out,"styles.css"));
const metadata=JSON.parse(await readFile(path.join(packageRoot,"package.json"),"utf8"));
const sha256={};
for(const file of ["browser.js","model.js","index.js","styles.css"])sha256[file]=createHash("sha256").update(await readFile(path.join(out,file))).digest("hex");
for(const name of ["browser","model","index"]){
  const graph=JSON.parse(await readFile(path.join(out,name+"-meta.json"),"utf8"));
  if(Object.values(graph.outputs).some(value=>value.imports.some(item=>item.external)))throw Error("Shared runtime export must be self-contained");
  if(Object.keys(graph.inputs).some(file=>file.includes("obsidian")||file.startsWith("src/")))throw Error("Shared artifact contains a host dependency");
}
await writeFile(path.join(out,"artifact.json"),JSON.stringify({name:metadata.name,version:metadata.version,displayProtocol:metadata.flowdesk.displayProtocol,status:"source-candidate",sha256},null,2)+"\n");
console.log(JSON.stringify({out,version:metadata.version,displayProtocol:metadata.flowdesk.displayProtocol}));
