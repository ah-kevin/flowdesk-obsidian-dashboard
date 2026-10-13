import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync,cpSync,rmSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";

export function packageDashboardUi({root=fileURLToPath(new URL("../",import.meta.url)),output=path.join(root,"release"),log=true}={}) {
  const pkgRoot=path.join(root,"packages/dashboard-ui"),pkg=JSON.parse(readFileSync(path.join(pkgRoot,"package.json"),"utf8"));
  const artifact=JSON.parse(readFileSync(path.join(pkgRoot,"dist/artifact.json"),"utf8"));
  const host=JSON.parse(readFileSync(path.join(root,"package.json"),"utf8"));
  if(pkg.version!==host.version||artifact.version!==host.version||artifact.displayProtocol!=="association-dashboard/1")throw Error("Shared UI version/protocol mismatch");
  for(const [file,digest] of Object.entries(artifact.sha256))if(createHash("sha256").update(readFileSync(path.join(pkgRoot,"dist",file))).digest("hex")!==digest)throw Error("Shared UI asset checksum mismatch: "+file);
  mkdirSync(output,{recursive:true});
  const staged=path.join(output,".dashboard-ui-package");
  rmSync(staged,{recursive:true,force:true});mkdirSync(staged,{recursive:true});
  cpSync(path.join(pkgRoot,"dist"),path.join(staged,"dist"),{recursive:true,filter:file=>!file.endsWith("-meta.json")});
  const stagedPkg={...pkg};
  writeFileSync(path.join(staged,"package.json"),JSON.stringify(stagedPkg,null,2)+"\n");
  cpSync(path.join(pkgRoot,"styles.css"),path.join(staged,"styles.css"));
  cpSync(path.join(root,"LICENSE"),path.join(staged,"LICENSE"));
  const dependencies=JSON.parse(readFileSync(path.join(root,"node_modules/markdown-it/package.json"),"utf8")).dependencies??{};
  const notices=["markdown-it",...Object.keys(dependencies)].map(name=>{
    const dir=path.join(root,"node_modules",name);
    let license="";for(const file of ["LICENSE","LICENSE.md","LICENSE.txt","LICENSE-MIT.txt"])try{license=readFileSync(path.join(dir,file),"utf8");break;}catch{}
    if(!license)throw Error("Missing bundled dependency license: "+name);
    return name+"\n"+license;
  }).join("\n\n");
  writeFileSync(path.join(staged,"THIRD-PARTY-NOTICES.txt"),notices);
  const packed=JSON.parse(execFileSync("npm",["pack","--offline","--ignore-scripts","--json","--pack-destination",output,"--cache",path.join(output,".npm-cache")],{cwd:staged,encoding:"utf8"}));
  const archive=path.join(output,packed[0].filename),sha256=createHash("sha256").update(readFileSync(archive)).digest("hex");
  const manifest={name:pkg.name,version:pkg.version,displayProtocol:artifact.displayProtocol,status:"source-candidate",file:path.basename(archive),sha256,assetSha256:artifact.sha256};
  writeFileSync(archive+".sha256",sha256+"  "+path.basename(archive)+"\n");
  writeFileSync(path.join(output,"dashboard-ui-lock.json"),JSON.stringify(manifest,null,2)+"\n");
  rmSync(staged,{recursive:true,force:true});
  if(log)console.log(JSON.stringify(manifest));
  return {archive,sha256,manifest};
}
