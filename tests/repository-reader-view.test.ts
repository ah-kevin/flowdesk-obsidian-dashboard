import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ownedEnvironment, updateCapabilities } from './support/owned-environment.ts';
import { TestElement } from './support/dom.ts';

// DOM insertion is isolated; the production CommonMark parser and real fs run unchanged.
class HtmlElement extends TestElement {
 innerHTML='';
 createEl(tag:string,options:any={}){const element=new HtmlElement(tag,options);this.appendChild(element);return element;}
 empty(){super.empty();this.innerHTML='';}
 allText():string[]{return [...super.allText(),...(this.innerHTML ? [this.innerHTML] : [])];}
}
async function setup(t:any,app:any={},dependencies:any={}) {
 const f=await ownedEnvironment(t),bundle=f.path('reader.cjs'),executable=process.env.FLOWDESK_TEST_ESBUILD!;
 const args=['src/repository-reader-view.ts','--bundle','--platform=node','--format=cjs',`--outfile=${bundle}`,`--alias:obsidian=${path.resolve('tests/fixtures/obsidian-host.cjs')}`];
 updateCapabilities(process.env.FLOWDESK_TEST_CAPS!,d=>d.commands.push({executable,args,cwd:process.cwd()}));execFileSync(executable,args,{env:process.env,stdio:'pipe'});
 const {RepositoryReaderView}=createRequire(import.meta.url)(bundle),root=new HtmlElement(),view=new RepositoryReaderView({app,contentEl:root},dependencies);
 t.after(()=>view.onClose()); return {f,view,root};
}
function bodyHtml(root:HtmlElement):string { return (root.findByClass('flowdesk-repository-body')[0] as HtmlElement).innerHTML; }

test('compiled reader shows actual external path, refreshes the real file, and disables unsafe references',async t=>{
 const {f,view,root}=await setup(t),p=f.path('Report.md');writeFileSync(p,'# Report\n[[Same]]\n![image](secret.png)\n```\n[[literal]]\n```\n');
 await view.setState({absolutePath:p},{});assert.equal(view.ready,true);assert.equal(view.getState().absolutePath,p);
 assert.ok(root.textContent.includes(p));assert.doesNotMatch(bodyHtml(root),/<(?:a|img)\b/);assert.ok(bodyHtml(root).includes('[[literal]]'));
 writeFileSync(p,'# Updated');await root.findByClass('flowdesk-repository-refresh')[0].click();assert.ok(bodyHtml(root).includes('Updated'));
 assert.equal(readFileSync(p,'utf8'),'# Updated');
});
test('compiled reader prevents an older actual file read from replacing a newer file',async t=>{
 let hostRendererCalls=0;
 const {f,view,root}=await setup(t,{observeMarkdownScope:()=>hostRendererCalls++}),a=f.path('A.md'),b=f.path('B.md');writeFileSync(a,'Old');writeFileSync(b,'New');
 const first=view.setState({absolutePath:a},{});const second=view.setState({absolutePath:b},{});await Promise.all([first,second]);
 assert.equal(view.ready,true);assert.ok(bodyHtml(root).includes('New'));assert.ok(!bodyHtml(root).includes('Old'));
 assert.equal(hostRendererCalls,0,'external reader must not invoke Obsidian postprocessors');
 await view.onClose();assert.equal(view.ready,false);
});
test('compiled reader shows failed reads without claiming an opened file',async t=>{
 const {f,view,root}=await setup(t);await view.setState({absolutePath:f.path('missing.md')},{});
 assert.equal(view.ready,false);assert.ok(root.textContent.includes('读取失败'));
});
test('compiled reader keeps task checkboxes static and creates no navigation controls',async t=>{
 const {f,view,root}=await setup(t),p=f.path('Controls.md');writeFileSync(p,'- [ ] pending\n- [x] done\n[[Same]]\n[Same](Same.md)\nhttps://example.invalid');await view.setState({absolutePath:p},{});
 assert.equal(view.ready,true);assert.doesNotMatch(bodyHtml(root),/<(?:a|input|button|img)\b|\b(?:href|src|data-href)=/i);
 assert.ok(bodyHtml(root).includes('[ ] pending'));assert.ok(bodyHtml(root).includes('[x] done'));assert.ok(root.textContent.includes('复选框以静态文本显示'));
});
test('compiled reader does not insert an actual pending read after close',async t=>{
 const {f,view,root}=await setup(t),p=f.path('Closing.md');writeFileSync(p,'Delayed body');
 const pending=view.setState({absolutePath:p},{});await view.onClose();await pending;
 assert.equal(view.ready,false);assert.equal(root.findByClass('flowdesk-repository-body').length,0);
});
test('real CommonMark parsing does not load list-exit images or raw HTML',async t=>{
 const {f,view,root}=await setup(t),p=f.path('Ambiguous.md');
 writeFileSync(p,'- item\n  ```\n[raw](https://example.invalid/link)\n![image](secret.png)\n<img src="https://example.invalid/probe">\n  ```\n\n<script>alert(1)</script>\n<iframe src="probe"></iframe>\n');
 await view.setState({absolutePath:p},{});assert.equal(view.ready,true);
 assert.doesNotMatch(bodyHtml(root),/<(?:img|a|iframe|video|audio|object|input|script)\b|<[^>]+\s(?:href|src|data-href)=/i);
 assert.ok(bodyHtml(root).includes('secret.png'));assert.ok(bodyHtml(root).includes('&lt;img'));
});
test('readonly code and source preserve indented, blockquote and multiline code content',async t=>{
 const {f,view,root}=await setup(t),p=f.path('Code.md'),source='    [[Same]]\n\n> ```\n> [[Quoted]]\n> ```\n\n`[[line\nspan]]`\n';writeFileSync(p,source);
 await view.setState({absolutePath:p},{});const html=bodyHtml(root);
 assert.match(html,/<code>\[\[Same\]\]\n<\/code>/);assert.match(html,/<code>\[\[Quoted\]\]\n<\/code>/);assert.match(html,/<code>\[\[line span\]\]<\/code>/);
 await root.findByClass('flowdesk-repository-source-toggle')[0].click();assert.equal(root.findByClass('flowdesk-repository-source')[0].text,source);assert.equal(readFileSync(p,'utf8'),source);
 await root.findByClass('flowdesk-repository-source-toggle')[0].click();assert.equal(bodyHtml(root),html);
});
test('compiled reader opens original only on explicit request and describes submission separately',async t=>{
 const requests:string[]=[];const {f,view,root}=await setup(t,{}, {openOriginal:async(p:string)=>{requests.push(p);}}),p=f.path('Original.md');writeFileSync(p,'original');await view.setState({absolutePath:p},{});
 assert.deepEqual(requests,[]);await root.findByClass('flowdesk-repository-open-original')[0].click();assert.deepEqual(requests,[p]);assert.ok(root.textContent.includes('已提交系统打开请求；是否打开由系统决定'));assert.equal(view.ready,true);
});
