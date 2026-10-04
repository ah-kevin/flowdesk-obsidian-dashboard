const encoder=new TextEncoder();
export const utf8Bytes=(text:string):number=>encoder.encode(text).length;
export function excerpt(text:string,maxBytes=400):string {
  const value=text.trim();if(utf8Bytes(value)<=maxBytes)return value;
  let out="",bytes=0;for(const ch of value){const n=utf8Bytes(ch);if(bytes+n>maxBytes)break;out+=ch;bytes+=n;}
  return out+"…（摘录，全文见原文）";
}
export function firstParagraph(text:string):string {
  return text.trim().split(/\r?\n\s*\r?\n/)[0]||"";
}
export function formatDisplayTime(value:string,now:Date=new Date()):string {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return value||"时间未记录";
  const time=new Date(value);if(!Number.isFinite(time.getTime()))return value;
  const fmt=(date:Date)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(date);
  const rendered=fmt(time),today=fmt(now).slice(0,10),yesterday=fmt(new Date(now.getTime()-86400000)).slice(0,10);
  const day=rendered.slice(0,10);return `${day===today?"今天":day===yesterday?"昨天":day.replace(/-/g,"/")} ${rendered.slice(-5)}`;
}
