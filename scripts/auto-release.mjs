import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

export const VERSION_FILES=['manifest.json','package.json','package-lock.json','versions.json','packages/dashboard-ui/package.json'];
const semver=value=>{
 if(typeof value!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))throw Error('Invalid release version: '+value);
 return value.split('.').map(BigInt);
};
const nextPatch=value=>{const parts=semver(value);return `${parts[0]}.${parts[1]}.${parts[2]+1n}`;};
const compare=(a,b)=>{const left=semver(a),right=semver(b);for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]>right[i]?1:-1;return 0;};
const git=(root,env,...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const revision=value=>{if(!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value??''))throw Error('Exact source revision required');return value;};
function documents(root,env,ref){
 const read=file=>JSON.parse(ref?git(root,env,'show',`${ref}:${file}`):readFileSync(path.join(root,file),'utf8'));
 const values=Object.fromEntries(VERSION_FILES.map(file=>[file,read(file)])),version=values['manifest.json'].version;
 semver(version);
 if([values['package.json'].version,values['package-lock.json'].version,values['package-lock.json'].packages?.['']?.version,values['packages/dashboard-ui/package.json'].version].some(value=>value!==version))throw Error('Release versions are not aligned');
 if(!values['manifest.json'].minAppVersion||values['versions.json'][version]!==values['manifest.json'].minAppVersion)throw Error('Version compatibility map is not aligned');
 return {values,version};
}
function bumped({values,version:previous}){
 const version=nextPatch(previous);
 for(const file of ['manifest.json','package.json','package-lock.json','packages/dashboard-ui/package.json'])values[file].version=version;
 values['package-lock.json'].packages[''].version=version;
 values['versions.json'][version]=values['manifest.json'].minAppVersion;
 return {version,values};
}
function generatedRelease(root,env,ref){
 const body=git(root,env,'show','-s','--format=%B',ref),matches=[...body.matchAll(/^Release-Source: ([a-f0-9]{40}(?:[a-f0-9]{24})?)$/gm)];
 if(!matches.length)return null;
 if(matches.length!==1)throw Error('Ambiguous generated release provenance');
 const source=matches[0][1],parent=git(root,env,'rev-parse',`${ref}^`);
 if(parent!==source)throw Error('Generated release source is not its parent');
 const changed=git(root,env,'diff','--name-only',parent,ref).split('\n');
 if(changed.some(file=>!VERSION_FILES.includes(file)))throw Error('Generated release changes non-version files');
 const current=documents(root,env,ref),previous=documents(root,env,parent);
 const expected=bumped(previous);
 if(current.version!==expected.version||!isDeepStrictEqual(current.values,expected.values))throw Error('Generated release version metadata contains unexpected changes');
 return {sourceSha:source,version:current.version};
}
function fetchMain(root,env){
 git(root,env,'fetch','--no-tags','origin','refs/heads/main:refs/remotes/origin/main');
 return git(root,env,'rev-parse','refs/remotes/origin/main');
}
export function prepareRelease({root=process.cwd(),env=process.env,eventName,ref,sourceSha,before}){
 if(ref!=='refs/heads/main'||!['push','workflow_dispatch'].includes(eventName))throw Error('Only a main push or manual main event may prepare a release');
 revision(sourceSha);
 if(git(root,env,'rev-parse','HEAD')!==sourceSha)throw Error('Checkout does not match event source');
 if(git(root,env,'status','--porcelain'))throw Error('Release checkout must be clean');
 const main=fetchMain(root,env);
 if(main!==sourceSha){
  const resumed=generatedRelease(root,env,main);
  if(resumed?.sourceSha!==sourceSha)return {release:false,reason:'superseded-main'};
  git(root,env,'checkout','--detach',main);
  return {release:true,action:'resume',baseSha:main,...resumed};
 }
 const resumed=generatedRelease(root,env,sourceSha);
 if(resumed)return {release:true,action:'resume',baseSha:sourceSha,...resumed};
 const current=documents(root,env),previous=eventName==='push'?revision(before):git(root,env,'rev-parse','HEAD^');
 const previousVersion=JSON.parse(git(root,env,'show',`${previous}:manifest.json`)).version,order=compare(current.version,previousVersion);
 if(order<0)throw Error('Release version downgrade rejected');
 if(order>0)return {release:true,action:'keep',baseSha:sourceSha,sourceSha,version:current.version};
 const {version,values}=bumped(current);
 for(const file of VERSION_FILES)writeFileSync(path.join(root,file),JSON.stringify(values[file],null,2)+'\n');
 return {release:true,action:'bump',baseSha:sourceSha,sourceSha,version};
}
export function finalizeRelease({root=process.cwd(),env=process.env,ref,plan}){
 if(ref!=='refs/heads/main'||plan.release!==true||!['bump','keep','resume'].includes(plan.action))throw Error('Only a prepared main release may finalize');
 revision(plan.baseSha);revision(plan.sourceSha);semver(plan.version);
 if(git(root,env,'rev-parse','HEAD')!==plan.baseSha)throw Error('Release checkout changed during build');
 if(fetchMain(root,env)!==plan.baseSha)return {release:false,reason:'superseded-during-build'};
 const source=documents(root,env,plan.baseSha),expected=plan.action==='bump'?bumped(source):source;
 if(expected.version!==plan.version||!isDeepStrictEqual(documents(root,env).values,expected.values))throw Error('Built release version metadata does not match its source plan');
 if(plan.action==='resume'){
  if(generatedRelease(root,env,plan.baseSha)?.sourceSha!==plan.sourceSha)throw Error('Resume source plan mismatch');
 }else if(plan.sourceSha!==plan.baseSha)throw Error('Release source plan mismatch');
 const tag='v'+plan.version;
 const remote=git(root,env,'ls-remote','origin',`refs/tags/${tag}`,`refs/tags/${tag}^{}`);
 const rows=remote?remote.split('\n').map(line=>line.split(/\s+/)):[];
 const target=(rows.find(row=>row[1].endsWith('^{}'))??rows[0])?.[0];
 if(target&&(plan.action==='bump'||target!==plan.baseSha))throw Error('Release tag conflict: '+tag);
 if(fetchMain(root,env)!==plan.baseSha)return {release:false,reason:'superseded-before-tag'};
 if(git(root,env,'diff','--cached','--name-only'))throw Error('Unexpected staged files before release commit');
 if(plan.action==='bump'){
  git(root,env,'add','--',...VERSION_FILES);git(root,env,'diff','--cached','--check');
  git(root,env,'-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m',`chore: release Dashboard ${plan.version} [skip ci]\n\nRelease-Source: ${plan.sourceSha}`);
 }
 const commit=git(root,env,'rev-parse','HEAD');
 if(!target){
  const local=git(root,env,'tag','--list',tag);
  if(local&&git(root,env,'rev-parse',`${tag}^{commit}`)!==commit)throw Error('Local release tag conflict');
  if(!local)git(root,env,'tag',tag,commit);
  git(root,env,'push','--atomic','origin',...(plan.action==='bump'?['HEAD:refs/heads/main']:[]),`refs/tags/${tag}`);
 }
 if(fetchMain(root,env)!==commit)return {release:false,reason:'superseded-after-tag',version:plan.version,tag,commit};
 return {release:true,version:plan.version,tag,commit};
}
function output(result){
 if(process.env.GITHUB_OUTPUT)for(const [key,value] of Object.entries(result))appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);
 console.log(JSON.stringify(result));
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 try{
  if(process.argv[2]==='prepare')output(prepareRelease({eventName:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF,sourceSha:process.env.GITHUB_SHA,before:process.env.PUSH_BEFORE}));
  else if(process.argv[2]==='finalize')output(finalizeRelease({ref:process.env.GITHUB_REF,plan:JSON.parse(process.env.RELEASE_PLAN??'null')}));
  else throw Error('Use prepare or finalize');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
