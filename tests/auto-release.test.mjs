import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import cp,{execFileSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';

const helper=new URL('../scripts/auto-release.mjs',import.meta.url);
async function api(){assert.ok(existsSync(helper),'automatic release lifecycle helper is missing');return import(helper.href);}
const files=['manifest.json','package.json','package-lock.json','versions.json','packages/dashboard-ui/package.json'];
function fixture(t){
 const root=mkdtempSync(path.join(tmpdir(),'dashboard-auto-release-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const home=path.join(root,'home'),repo=path.join(root,'repo'),remote=path.join(root,'remote.git');mkdirSync(home);mkdirSync(repo);
 const env={PATH:process.env.PATH,HOME:home,LANG:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'};
 const git=(...args)=>execFileSync('git',args,{cwd:repo,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const put=(file,data)=>{const p=path.join(repo,file);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,JSON.stringify(data,null,2)+'\n');};
 const metadata=(version='2.0.17')=>{
  put('manifest.json',{id:'owned',version,minAppVersion:'1.5.0',extra:'keep'});put('package.json',{version,private:true,extra:'keep'});
  put('package-lock.json',{version,packages:{'':{version},'node_modules/owned':{version:'9.9.9'}}});put('versions.json',{'2.0.16':'1.4.0',[version]:'1.5.0'});put('packages/dashboard-ui/package.json',{version,private:true});
 };
 git('init','-b','main');git('config','user.name','owned');git('config','user.email','owned@example.invalid');metadata();git('add','.');git('commit','-m','base');
 const before=git('rev-parse','HEAD');git('init','--bare',remote);git('remote','add','origin',remote);git('push','-u','origin','main');
 const commit=(name='change')=>{writeFileSync(path.join(repo,'change.txt'),name);git('add','change.txt');git('commit','-m',name);git('push','origin','main');return git('rev-parse','HEAD');};
 const source=commit();return {root:repo,env,git,put,metadata,before,source,commit,read:file=>JSON.parse(readFileSync(path.join(repo,file),'utf8'))};
}

test('ordinary main change bumps all five metadata files and preserves history/dependencies',async t=>{
 const {prepareRelease}=await api(),f=fixture(t),out=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before});
 assert.equal(out.action,'bump');assert.equal(out.version,'2.0.18');assert.equal(out.release,true);
 for(const file of ['manifest.json','package.json','package-lock.json','packages/dashboard-ui/package.json'])assert.equal(f.read(file).version,'2.0.18');
 assert.equal(f.read('package-lock.json').packages[''].version,'2.0.18');assert.equal(f.read('package-lock.json').packages['node_modules/owned'].version,'9.9.9');
 assert.equal(f.read('versions.json')['2.0.16'],'1.4.0');assert.equal(f.read('versions.json')['2.0.18'],'1.5.0');assert.equal(f.read('manifest.json').extra,'keep');
 assert.equal(f.git('rev-parse','origin/main'),f.source);assert.equal(f.git('tag'),'');
});
test('explicit version upgrade is retained without another patch',async t=>{
 const {prepareRelease}=await api(),f=fixture(t);f.metadata('2.1.0');f.git('add','.');f.git('commit','-m','explicit minor');f.git('push','origin','main');const sourceSha=f.git('rev-parse','HEAD');
 const out=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha,before:f.source});assert.equal(out.action,'keep');assert.equal(out.version,'2.1.0');assert.equal(f.git('status','--porcelain'),'');
});
test('invalid metadata changes no files',async t=>{
 const {prepareRelease}=await api(),f=fixture(t);f.put('packages/dashboard-ui/package.json',{version:'2.0.16'});f.git('add','.');f.git('commit','-m','bad metadata');f.git('push','origin','main');const sourceSha=f.git('rev-parse','HEAD');
 const saved=files.map(file=>readFileSync(path.join(f.root,file),'utf8'));
 assert.throws(()=>prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha,before:f.source}),/version|align/i);assert.deepEqual(files.map(file=>readFileSync(path.join(f.root,file),'utf8')),saved);
});
test('superseded main event skips without preparing another version',async t=>{
 const {prepareRelease}=await api(),f=fixture(t),latest=f.commit('newer change');f.git('checkout','--detach',f.source);
 const out=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before});assert.equal(out.release,false);assert.equal(f.read('manifest.json').version,'2.0.17');assert.equal(f.git('rev-parse','origin/main'),latest);
});
test('non-main/manual branch and pull request cannot prepare a release',async t=>{
 const {prepareRelease}=await api(),f=fixture(t);
 for(const context of [{eventName:'pull_request',ref:'refs/pull/1/merge'},{eventName:'workflow_dispatch',ref:'refs/heads/feature'}])assert.throws(()=>prepareRelease({...f,...context,sourceSha:f.source,before:f.before}),/main|event/i);
 assert.equal(f.git('status','--porcelain'),'');
});
test('finalize publishes only version files and binds an immutable tag to the version commit',async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t),plan=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before});
 const result=finalizeRelease({...f,plan,ref:'refs/heads/main'});assert.equal(result.release,true);assert.equal(f.git('rev-parse','origin/main'),result.commit);assert.equal(f.git('rev-parse','v2.0.18^{commit}'),result.commit);
 assert.deepEqual(f.git('diff','--name-only',f.source,result.commit).split('\n').sort(),files.sort());assert.match(f.git('show','-s','--format=%B',result.commit),new RegExp('Release-Source: '+f.source));
});
test('rerun after version/tag push resumes the same version and commit',async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t),args={...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before};
 const first=finalizeRelease({...f,ref:'refs/heads/main',plan:prepareRelease(args)});f.git('checkout','--detach',f.source);
 const retry=prepareRelease(args);assert.equal(retry.action,'resume');assert.equal(retry.version,'2.0.18');const result=finalizeRelease({...f,ref:'refs/heads/main',plan:retry});assert.equal(result.commit,first.commit);assert.equal(f.git('tag'),'v2.0.18');
});
test('manual retry on the generated version commit does not increment patch',async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t),first=finalizeRelease({...f,ref:'refs/heads/main',plan:prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before})});
 const retry=prepareRelease({...f,eventName:'workflow_dispatch',ref:'refs/heads/main',sourceSha:first.commit});assert.equal(retry.action,'resume');assert.equal(retry.version,'2.0.18');
});
test('a newer main arriving during the build prevents version/tag publication',async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t),plan=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before});
 const temporary=f.git('diff');f.git('reset','--hard','HEAD');const latest=f.commit('newer main');f.git('checkout','--detach',f.source);execFileSync('git',['apply','-'],{cwd:f.root,env:f.env,input:temporary+"\n"});
 assert.equal(finalizeRelease({...f,ref:'refs/heads/main',plan}).release,false);assert.equal(f.git('rev-parse','origin/main'),latest);assert.equal(f.git('tag'),'');
});
test('existing tag at a different commit is never replaced',async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t);f.git('tag','v2.0.18',f.before);f.git('push','origin','refs/tags/v2.0.18');
 const plan=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before});assert.throws(()=>finalizeRelease({...f,ref:'refs/heads/main',plan}),/tag|conflict/i);
 assert.equal(f.git('rev-parse','origin/main'),f.source);assert.equal(f.git('rev-parse','v2.0.18^{commit}'),f.before);
});

test('workflow keeps release work in one main run after verified build and uses draft publication',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
 assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/fetch-depth: 0/);
 assert.match(workflow,/node scripts\/auto-release\.mjs prepare/);
 assert.match(workflow,/node scripts\/auto-release\.mjs finalize/);
 assert.ok(workflow.indexOf('npm run release:package')<workflow.indexOf('node scripts/auto-release.mjs finalize'));
 assert.match(workflow,/steps\.finalize\.outputs\.release == 'true'/);
 assert.match(workflow,/--verify-tag --draft/);
 assert.ok(workflow.indexOf('gh release upload')<workflow.indexOf('gh release edit'));
 assert.match(workflow,/npm run test:release/);
});

for(const action of ['keep','resume'])test(`new main arriving after tag lookup prevents ${action} publication`,async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t);let plan;
 if(action==='keep'){
  f.metadata('2.0.18');f.git('add','.');f.git('commit','-m','explicit version');f.git('push','origin','main');
  plan=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.git('rev-parse','HEAD'),before:f.source});
 }else{
  finalizeRelease({...f,ref:'refs/heads/main',plan:prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before})});
  plan=prepareRelease({...f,eventName:'workflow_dispatch',ref:'refs/heads/main',sourceSha:f.git('rev-parse','HEAD')});
 }
 f.git('commit','--allow-empty','-m','newer main');const latest=f.git('rev-parse','HEAD');f.git('push','origin','HEAD:refs/heads/owned-next');f.git('checkout','--detach',plan.baseSha);
 const original=cp.execFileSync;let injected=false,result;
 try{
  cp.execFileSync=(exe,args,options)=>{
   const value=original(exe,args,options);
   if(!injected&&exe==='git'&&args[0]==='ls-remote'){
    injected=true;original('git',['--git-dir='+path.join(path.dirname(f.root),'remote.git'),'update-ref','refs/heads/main',latest,plan.baseSha],{env:f.env,stdio:'pipe'});
   }
   return value;
  };syncBuiltinESMExports();
  result=finalizeRelease({...f,ref:'refs/heads/main',plan});
 }finally{cp.execFileSync=original;syncBuiltinESMExports();}
 assert.equal(injected,true);assert.equal(result.release,false);assert.equal(f.git('rev-parse','origin/main'),latest);
});
test('version downgrade is rejected without touching release metadata',async t=>{
 const {prepareRelease}=await api(),f=fixture(t);f.metadata('2.0.16');f.git('add','.');f.git('commit','-m','downgrade');f.git('push','origin','main');
 const saved=files.map(file=>readFileSync(path.join(f.root,file),'utf8'));
 assert.throws(()=>prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.git('rev-parse','HEAD'),before:f.source}),/downgrade/i);
 assert.deepEqual(files.map(file=>readFileSync(path.join(f.root,file),'utf8')),saved);
});
test('real CLI writes the prepared plan and matching GitHub outputs',async t=>{
 await api();const f=fixture(t);
 // GITHUB_OUTPUT belongs outside the checkout so prepare sees a clean source.
 const outputPath=path.join(path.dirname(f.root),'output.txt');
 const env={...f.env,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',GITHUB_SHA:f.source,PUSH_BEFORE:f.before,GITHUB_OUTPUT:outputPath};
 const plan=JSON.parse(execFileSync(process.execPath,[helper.pathname,'prepare'],{cwd:f.root,env,encoding:'utf8'}));
 assert.equal(plan.version,'2.0.18');assert.match(readFileSync(outputPath,'utf8'),/release=true\n/);
 const result=JSON.parse(execFileSync(process.execPath,[helper.pathname,'finalize'],{cwd:f.root,env:{...env,RELEASE_PLAN:JSON.stringify(plan)},encoding:'utf8'}));
 assert.equal(result.release,true);assert.match(readFileSync(outputPath,'utf8'),new RegExp('commit='+result.commit));
});

test('a changed release plan cannot tag an unbumped source as a new version',async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t),plan=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before});
 assert.throws(()=>finalizeRelease({...f,ref:'refs/heads/main',plan:{...plan,action:'keep'}}),/version|plan|metadata/i);
 assert.equal(f.git('tag'),'');assert.equal(f.git('rev-parse','origin/main'),f.source);
});
test('unexpected edits to version documents after preparation cannot enter the release commit',async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t),plan=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before});
 f.put('manifest.json',{...f.read('manifest.json'),extra:'unexpected'});
 assert.throws(()=>finalizeRelease({...f,ref:'refs/heads/main',plan}),/version|metadata/i);assert.equal(f.git('rev-parse','origin/main'),f.source);
});
test('a release footer does not accept extra edits inside version documents',async t=>{
 const {prepareRelease}=await api(),f=fixture(t),args={...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before};
 prepareRelease(args);f.put('manifest.json',{...f.read('manifest.json'),extra:'unexpected'});f.git('add','.');f.git('commit','-m','fake generated\n\nRelease-Source: '+f.source);f.git('push','origin','main');f.git('checkout','--detach',f.source);
 assert.throws(()=>prepareRelease(args),/version|metadata/i);
});

function publishFixture(t,f){
 const parent=path.dirname(f.root),bin=path.join(parent,'bin'),state=path.join(parent,'release-state.json');mkdirSync(bin);
 writeFileSync(path.join(bin,'gh'),`#!/usr/bin/env node
const fs=require('node:fs'),file=process.env.OWNED_RELEASE_STATE,args=process.argv.slice(2);
let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{created:0,draft:true,assets:[]};
if(args[0]!=='release')process.exit(2);
if(args[1]==='view')process.exit(state.created?0:1);
if(args[1]==='create'){if(state.created||!args.includes('--draft')||!args.includes('--verify-tag'))process.exit(3);state.created++;state.draft=true;}
else if(args[1]==='upload'){
 if(process.env.OWNED_UPLOAD_FAIL==='1')process.exit(4);
 const files=args.slice(3).filter(arg=>!arg.startsWith('--'));if(files.some(file=>!fs.existsSync(file)))process.exit(5);state.assets=files;
}else if(args[1]==='edit'){if(state.assets.length<8||!args.includes('--draft=false'))process.exit(6);state.draft=false;}
else process.exit(7);
fs.writeFileSync(file,JSON.stringify(state));
`,{mode:0o755});
 const workflow=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
 const section=workflow.slice(workflow.indexOf('      - name: Publish GitHub Release'));
 const script=section.split('        run: |\n')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
 const env={...f.env,PATH:bin+path.delimiter+f.env.PATH,OWNED_RELEASE_STATE:state,GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'owned/local',TAG_NAME:'v2.0.18',VERSION:'2.0.18',ZIP_PATH:'release/flowdesk-dashboard-2.0.18.zip'};
 for(const file of ['main.js','styles.css','release/flowdesk-dashboard-2.0.18.zip','release/flowdesk-dashboard-ui-2.0.18.tgz','release/flowdesk-dashboard-ui-2.0.18.tgz.sha256','release/dashboard-ui-lock.json']){
  mkdirSync(path.dirname(path.join(f.root,file)),{recursive:true});writeFileSync(path.join(f.root,file),'owned asset');
 }
 return {state,env,script,run:(extra={})=>cp.spawnSync('bash',['-e','-c',script],{cwd:f.root,env:{...env,...extra},encoding:'utf8'})};
}
test('actual workflow publication leaves failed uploads in draft and resumes the same release',async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t),plan=prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before});
 const target=finalizeRelease({...f,ref:'refs/heads/main',plan}),publisher=publishFixture(t,f);
 assert.notEqual(publisher.run({OWNED_UPLOAD_FAIL:'1'}).status,0);assert.equal(JSON.parse(readFileSync(publisher.state,'utf8')).draft,true);
 const retried=publisher.run();assert.equal(retried.status,0,retried.stderr);const state=JSON.parse(readFileSync(publisher.state,'utf8'));assert.equal(state.created,1);assert.equal(state.draft,false);
 assert.equal(publisher.run().status,0);assert.equal(JSON.parse(readFileSync(publisher.state,'utf8')).created,1);assert.equal(f.git('rev-parse','v2.0.18^{commit}'),target.commit);
});
test('actual publication shell skips the Release API when main advanced after finalize',async t=>{
 const {prepareRelease,finalizeRelease}=await api(),f=fixture(t),target=finalizeRelease({...f,ref:'refs/heads/main',plan:prepareRelease({...f,eventName:'push',ref:'refs/heads/main',sourceSha:f.source,before:f.before})});
 f.commit('newer before API');f.git('checkout','--detach',target.commit);const publisher=publishFixture(t,f),result=publisher.run();
 assert.equal(result.status,0,result.stderr);assert.equal(existsSync(publisher.state),false);assert.match(result.stdout,/newer main/);
});
