import {execFile} from "child_process";
import {statSync} from "fs";
import * as path from "path";
import {buildRepositoryOpenInvocation} from "./source-navigation";

export interface RepositoryFileInfo {isFile():boolean;isDirectory():boolean}
export interface RepositoryOpenDependencies {
  platform?:NodeJS.Platform;
  inspect?(absolutePath:string):RepositoryFileInfo;
  execute?(executable:string,args:string[],options:{timeoutMs:number}):Promise<void>;
}
export interface RepositoryOpenResult {kind:"accepted"|"unsupported"|"unavailable"|"unknown";message:string}
const application="/Applications/Obsidian.app";

/** Public OS file delivery only. No agent/queue/owner state and no retry. */
export class RepositoryMarkdownOpener {
  constructor(private readonly dependencies:RepositoryOpenDependencies={}) {}
  async open(absolutePath:string):Promise<RepositoryOpenResult> {
    const platform=this.dependencies.platform??process.platform;
    if(platform!=="darwin")return {kind:"unsupported",message:"当前平台没有已核对的指定Obsidian打开参数；可复制路径和手工步骤。"};
    if(!path.isAbsolute(absolutePath)||!/^\.md$/i.test(path.extname(absolutePath))||absolutePath.includes("\0"))return {kind:"unavailable",message:"仅支持准确本机绝对Markdown文件路径；可复制路径核对。"};
    const inspect=this.dependencies.inspect??statSync;
    try {
      if(!inspect(absolutePath).isFile())return {kind:"unavailable",message:"目标不是本机Markdown文件；请核对原路径。"};
      if(!inspect(application).isDirectory()||!inspect(`${application}/Contents/MacOS/Obsidian`).isFile())return {kind:"unavailable",message:"未确认指定Obsidian应用与可执行文件；保留复制路径，不改系统关联。"};
    } catch { return {kind:"unavailable",message:"无法确认本机原文件或指定Obsidian应用；请核对路径。"}; }
    const invocation=buildRepositoryOpenInvocation({kind:"repository",absolutePath,repositoryPath:absolutePath,label:absolutePath,fileUrl:""},platform)!;
    const execute=this.dependencies.execute??executePublicFileOpen;
    try {
      await execute(invocation.executable,invocation.args,{timeoutMs:10000});
      return {kind:"accepted",message:"打开请求已提交；实际准确打开、tab影响和原位保存尚未验证。"};
    } catch(error) {
      const failure=error as {code?:string;killed?:boolean};
      const timeout=failure?.code==="ETIMEDOUT"||failure?.killed===true;
      return {kind:"unknown",message:timeout ? "打开请求超时，结果未知；文件可能已打开，请先核对，不自动重试。" : "打开请求返回错误，实际是否打开未知；保留复制路径，请先核对，不自动重试。"};
    }
  }
}
function executePublicFileOpen(executable:string,args:string[],options:{timeoutMs:number}):Promise<void> {
  return new Promise((resolve,reject)=>{
    execFile(executable,args,{timeout:options.timeoutMs,shell:false,windowsHide:true},error=>error?reject(error):resolve());
  });
}
