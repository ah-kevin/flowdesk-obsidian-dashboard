// Browser preview boundary: no filesystem, process launch, credentials or business network.
const unavailable=()=>{throw Error("本地预览不执行 Core 命令或访问本机文件系统。");};
export const existsSync=()=>false,statSync=unavailable,accessSync=unavailable,readFileSync=unavailable,readdirSync=unavailable,realpathSync=unavailable;
export const constants={X_OK:1};
export const homedir=()=>"/preview-home";
export const execFile=(...args:any[])=>{const callback=args[args.length-1];if(typeof callback==="function")callback(Error("预览不启动进程"));else unavailable();};
export const promisify=(fn:any)=>(...args:any[])=>new Promise((resolve,reject)=>fn(...args,(error:any,value:any)=>error?reject(error):resolve(value)));
export const sep="/";
export function normalize(value:string):string {const absolute=value.startsWith("/");const parts:string[]=[];for(const item of value.split("/")){if(!item||item===".")continue;if(item===".."&&parts.length&&parts[parts.length-1]!=="..")parts.pop();else if(item!==".."||!absolute)parts.push(item);}return (absolute?"/":"")+parts.join("/")||".";}
export const isAbsolute=(value:string)=>value.startsWith("/");
export const join=(...parts:string[])=>normalize(parts.filter(Boolean).join("/"));
export const resolve=(...parts:string[])=>{let result="";for(const part of parts){if(isAbsolute(part))result=part;else result+="/"+part;}return normalize(result.startsWith("/")?result:"/"+result);};
export const dirname=(value:string)=>value.replace(/\/[^/]*\/?$/,"" )||"/";
export const basename=(value:string,suffix="")=>{const name=value.split("/").pop()||"";return suffix&&name.endsWith(suffix)?name.slice(0,-suffix.length):name;};
export const extname=(value:string)=>{const name=basename(value),i=name.lastIndexOf(".");return i>0?name.slice(i):"";};
export const relative=(from:string,to:string)=>{const a=resolve(from).split("/").filter(Boolean),b=resolve(to).split("/").filter(Boolean);let i=0;while(a[i]===b[i]&&i<a.length&&i<b.length)i++;return [...a.slice(i).map(()=>".."),...b.slice(i)].join("/");};
export const posix={sep,normalize,join,resolve,dirname,basename,extname,isAbsolute,relative};
export const request=unavailable;
export const fileURLToPath=(value:string|URL)=>decodeURIComponent((typeof value==="string"?new URL(value):value).pathname);
export const pathToFileURL=(value:string)=>new URL("file://"+resolve(value).split("/").map(encodeURIComponent).join("/"));
