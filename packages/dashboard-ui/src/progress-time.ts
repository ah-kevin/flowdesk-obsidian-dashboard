/** Display only; preserve raw precision and reject malformed metadata. */
export function beijingProgressTime(value:string):string|null {
  const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!match)return null;
  const calendar=Date.parse(match[1]+"Z"),offset=match[2];
  if(!Number.isFinite(calendar)||new Date(calendar).toISOString().slice(0,19)!==match[1]||(offset!=="Z"&&(Number(offset.slice(1,3))>23||Number(offset.slice(4))>59)))return null;
  const instant=Date.parse(match[1]+offset);
  return Number.isFinite(instant)?new Date(instant+8*3600000).toISOString().slice(0,16).replace("T"," "):null;
}
export function readProgressTime(display:string,content:string):{timestamp:string;content:string}|null {
  if(!content.startsWith("<!-- flowdesk.progress-time/"))return {timestamp:display,content};
  const match=/^<!-- flowdesk\.progress-time\/1 ([^ ]+) -->(?: (.*))?$/.exec(content);
  if(!match||beijingProgressTime(match[1])!==display)return null;
  return {timestamp:match[1],content:match[2]??""};
}
