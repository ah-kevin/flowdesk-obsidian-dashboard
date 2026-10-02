import * as path from "path";
import { existsSync, statSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import type { SnapshotBodySection } from "./snapshot-model";

export type RelatedTarget =
  | { kind: "vault"; linkText: string; label: string; resolvedPath?: string; exactFile?: boolean }
  | { kind: "repository"; absolutePath: string; repositoryPath: string; label: string; fileUrl: string }
  | { kind: "url"; url: string; label: string }
  | { kind: "unavailable"; label: string; reason: string };
export interface RelatedContext { casePath: string; cwd: string | null; vaultRoot: string; resolveVaultLink?: (linkText:string)=>string|null }

export function locateTaskSource(fileText: string, details: string, section: SnapshotBodySection): {kind:"line";editorLine:number}|{kind:"note";reason:string} {
  const note=(reason:string):{kind:"note";reason:string}=>({kind:"note",reason});
  const normalize=(text:string)=>text.replace(/\r\n/g,"\n").replace(/^\ufeff/,"");
  const body=normalize(details),file=normalize(fileText);
  if(!body) return note("API原文为空；打开整张任务原文。");
  const start=file.indexOf(body);
  if(start<0||file.indexOf(body,start+1)>=0||(start>0&&file[start-1]!=="\n")) return note("API原文与当前文件不同步或匹配不唯一；打开整张任务原文。");
  const range=section.source,startLine=range?.line_start,endLine=range?.line_end ?? startLine;
  const lines=body.split("\n");
  if(typeof startLine!=="number"||typeof endLine!=="number"||!Number.isInteger(startLine)||!Number.isInteger(endLine)||startLine<1||endLine<startLine||endLine>lines.length) return note("来源缺少有效API行范围；打开整张任务原文。");
  const span=lines.slice(startLine-1,endLine).join("\n");
  const excerpt=typeof range?.excerpt==="string"?normalize(range.excerpt):"";
  const text=normalize(section.text);
  if((!excerpt&&!text)||(excerpt&&!span.includes(excerpt))||(text&&!span.includes(text))) return note("来源片段与当前API范围不一致；打开整张任务原文。");
  const offset=file.slice(0,start).split("\n").length-1;
  return {kind:"line",editorLine:offset+startLine-1};
}

export function resolveRelatedTarget(raw: string, context: RelatedContext): RelatedTarget {
  let target=raw.trim(),label=target;
  const unavailable=(reason:string):RelatedTarget=>({kind:"unavailable",label,reason});
  const wiki=target.match(/^\[\[([^\]]+)\]\]$/);
  if(wiki){const parts=wiki[1].split("|");return {kind:"vault",linkText:parts[0],label:parts[1]??parts[0]};}
  const markdown=target.match(/^\[([^\]]*)\]\((.+)\)$/);
  if(markdown){label=markdown[1];target=markdown[2];if(target.startsWith("<")&&target.endsWith(">"))target=target.slice(1,-1);}
  if(/^https?:\/\//i.test(target)) {try{const url=new URL(target);return {kind:"url",url:url.href,label};}catch{return unavailable("网页链接无效");}}
  if(/^file:/i.test(target)){try{target=fileURLToPath(target);}catch{return unavailable("文件URL无效或不属于本机文件系统");}}
  else if(/^[a-z][a-z0-9+.-]*:/i.test(target))return unavailable("当前不支持此链接类型");
  if(!path.isAbsolute(target)) {
    let decoded=target;try{decoded=decodeURIComponent(target);}catch{/* keep exact literal for vault resolution */}
    const exactResolution=context.resolveVaultLink?.(target);
    const decodedResolution=!exactResolution&&decoded!==target?context.resolveVaultLink?.(decoded):null;
    const resolvedPath=exactResolution||decodedResolution;
    if(resolvedPath){
      const linkText=exactResolution?target:decoded;
      const exactFile=path.posix.normalize(linkText)===resolvedPath||path.posix.normalize(path.posix.join(path.posix.dirname(context.casePath),linkText))===resolvedPath;
      return {kind:"vault",linkText,label,resolvedPath,exactFile};
    }
  }
  if(/^(?:Notes|Tasks|TaskNotes)\//.test(target)||target.startsWith("#"))return {kind:"vault",linkText:target,label};
  if(!target||(!path.isAbsolute(target)&&!/[./\\]/.test(target)))return unavailable("引用没有明确vault或仓库来源；可复制原引用核对");
  if(!path.isAbsolute(target)&&(!context.cwd||!path.isAbsolute(context.cwd)))return unavailable("缺少唯一明确的Case cwd，不能定位仓库相对路径");
  if(!path.isAbsolute(target)&&!existsSync(context.cwd!))return unavailable("Case checkout目录在本机不存在");
  let absolutePath=path.isAbsolute(target)?path.normalize(target):path.resolve(context.cwd!,target);
  if(!existsSync(absolutePath)&&/%[0-9a-f]{2}/i.test(target)) {
    try { const decoded=decodeURIComponent(target); absolutePath=path.isAbsolute(decoded)?path.normalize(decoded):path.resolve(context.cwd!,decoded); }
    catch { return unavailable("文件路径编码无效"); }
  }
  const vaultRelative=path.relative(context.vaultRoot,absolutePath);
  if(vaultRelative&&!vaultRelative.startsWith(".."+path.sep)&&vaultRelative!==".."&&!path.isAbsolute(vaultRelative))return {kind:"vault",linkText:vaultRelative.split(path.sep).join("/"),label,resolvedPath:vaultRelative.split(path.sep).join("/"),exactFile:true};
  if(!existsSync(absolutePath))return unavailable(`仓库文件在本机不存在：${absolutePath}`);
  try { if(!statSync(absolutePath).isFile())return unavailable(`引用不是文件：${absolutePath}`); }
  catch { return unavailable(`无法确认仓库文件：${absolutePath}`); }
  return {kind:"repository",absolutePath,repositoryPath:context.cwd?path.relative(context.cwd,absolutePath):target,label,fileUrl:pathToFileURL(absolutePath).href};
}

export function buildRepositoryOpenInvocation(target: Extract<RelatedTarget,{kind:"repository"}>, platform: NodeJS.Platform): {executable:string;args:string[]}|null {
  if(platform!=="darwin"||!path.isAbsolute(target.absolutePath))return null;
  return {executable:"/usr/bin/open",args:["-a","/Applications/Obsidian.app",target.absolutePath]};
}
export function chooseTaskCase(contexts: string[]|null, candidates: Array<{path:string;contextTag:string;cwd:string|null}>): {casePath:string|null;cwd:string|null;reason:string|null} {
  const matches=contexts?candidates.filter(candidate=>contexts.includes(candidate.contextTag)):[];
  if(matches.length!==1)return {casePath:null,cwd:null,reason:matches.length?"Task关联多个Case，不能自动选择cwd":"Task没有唯一已确认的Case关联"};
  const match=matches[0];
  if(!match.cwd||!path.isAbsolute(match.cwd))return {casePath:match.path,cwd:null,reason:"Case未提供本机绝对cwd"};
  return {casePath:match.path,cwd:match.cwd,reason:null};
}
