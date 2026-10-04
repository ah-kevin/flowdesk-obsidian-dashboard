import type { SnapshotBodySection } from "./snapshot-model";
import { excerpt, firstParagraph, formatDisplayTime } from "./reading-presentation";

export interface ProgressEvent { timestamp: string | null; text: string; sourceIndex: number }

/** Presentation only: this parser supplies no currentness or completion judgment. */
export function parseQuotedProgress(text: string): ProgressEvent[] | null {
  const lines=text.replace(/\r\n/g,"\n").split("\n");
  while(lines.length&&!lines[0].trim())lines.shift();
  if(lines.shift()!=="> [!faq]- 详细过程日志")return null;
  const events:Array<{timestamp:string|null;lines:string[]}> = [];
  let fence:{char:string;length:number}|null=null,receipts=false;
  const scan=(line:string)=>{
    const visible=line.replace(/^(?:进展|完成|下一步)：/,"");
    const match=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(visible);if(!match)return;
    if(!fence)fence={char:match[1][0],length:match[1].length};
    else if(match[1][0]===fence.char&&match[1].length>=fence.length&&!match[2].trim())fence=null;
  };
  for(const line of lines) {
    if(/^<!-- flowdesk\.task-update\/.* -->$/.test(line)){if(fence)return null;receipts=true;continue;}
    if(receipts){if(line.trim())return null;continue;}
    const event=/^> - \[[xX ]\] (.*)$/.exec(line);
    if(event){
      if(fence)return null;
      const dated=/^`([^`]*)`(?: (.*))?$/.exec(event[1]);
      const body=dated?(dated[2]??""):event[1];events.push({timestamp:dated?dated[1]:null,lines:[body]});scan(body);continue;
    }
    if(!line.trim()||/^> *$/.test(line)){if(events.length)events[events.length-1].lines.push("");continue;}
    if(!events.length||!line.startsWith(">   "))return null;
    const body=line.slice(4);events[events.length-1].lines.push(body);scan(body);
  }
  if(fence||!events.length||events.some(event=>!event.lines.join("\n").trim()))return null;
  return events.map((event,sourceIndex)=>({timestamp:event.timestamp,text:event.lines.join("\n").trimEnd(),sourceIndex}));
}

export function readProgressSection(sections:SnapshotBodySection[]):{section:SnapshotBodySection;events:ProgressEvent[]}|null {
  const candidates=sections.filter(section=>section.level===2&&section.heading==="Progress");if(candidates.length!==1)return null;
  const section=candidates[0],source=section.source;
  if(!Number.isInteger(source?.line_start)||Number(source?.line_start)<1||!Number.isInteger(source?.line_end)||Number(source?.line_end)<Number(source?.line_start)||source?.truncated===true||source?.omitted===true)return null;
  const events=parseQuotedProgress(section.text);return events?{section,events}:null;
}

export function historyTime(value:string|null):string {
  if(!value)return "时间未记录";
  const legacy=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if(legacy){
    const [year,month,day,hour,minute]=legacy.slice(1).map(Number),date=new Date(0);date.setUTCFullYear(year,month-1,day);
    if(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day&&hour<24&&minute<60)return formatDisplayTime(value.replace(" ","T")+":00+08:00");
  }
  const iso=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(iso){
    const [year,month,day,hour,minute,second]=iso.slice(1,7).map(part=>Number(part??0)),date=new Date(0);date.setUTCFullYear(year,month-1,day);
    const zone=iso[7];
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||hour>23||minute>59||second>59||(zone!=="Z"&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59)))return value;
  }
  return formatDisplayTime(value);
}

export function renderProgressEvents(parent:HTMLElement,events:ProgressEvent[],renderMarkdown:(text:string,element:HTMLElement)=>void,full:boolean):void {
  for(const event of [...events].reverse()) {
    const row=parent.createDiv({cls:"flowdesk-log-entry",attr:{"data-source-index":String(event.sourceIndex)}});
    row.createEl("time",{cls:"flowdesk-log-date",text:historyTime(event.timestamp),attr:{title:event.timestamp??"原文未提供日期"}});
    const content=row.createDiv({cls:full?"flowdesk-log-body markdown-rendered":"flowdesk-log-excerpt markdown-rendered"});
    renderMarkdown(full?event.text:excerpt(firstParagraph(event.text).replace(/^(?:进展|完成)：/,""),600),content);
  }
}
