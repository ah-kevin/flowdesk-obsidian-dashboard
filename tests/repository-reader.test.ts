import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { ownedEnvironment } from './support/owned-environment.ts';
import { readRepositoryMarkdown, MAX_REPOSITORY_MARKDOWN_BYTES } from '../src/repository-reader.ts';

test('repository reader reads the exact UTF-8 file without altering it', async t => {
 const f=await ownedEnvironment(t), p=f.path('中文 # %23.MD'), text='\uFEFF# Report\n- [ ] pending\n[[Same]]';
 writeFileSync(p,text); assert.deepEqual(await readRepositoryMarkdown(p),{absolutePath:p,markdown:text}); assert.equal(readFileSync(p,'utf8'),text);
});
test('repository reader rejects missing, directory, relative, non-Markdown, binary and oversized files',async t=>{
 const f=await ownedEnvironment(t); mkdirSync(f.path('folder.md'));
 const cases:[string,string|Buffer][]=[['data.json','{}'],['binary.md',Buffer.from([0,3,4])],['invalid.md',Buffer.from([0xc3,0x28])],['large.md','x'.repeat(MAX_REPOSITORY_MARKDOWN_BYTES+1)]];
 for(const [name,content] of cases)writeFileSync(f.path(name),content);
 for(const p of [f.path('absent.md'),f.path('folder.md'),'relative.md',...cases.map(([name])=>f.path(name))])await assert.rejects(readRepositoryMarkdown(p),p);
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(readRepositoryMarkdown(f.path('binary.md'),cancelled.signal),{name:'AbortError'});
});
