import type {TaskContent} from "./task-content";
import type {SnapshotSource} from "./snapshot-model";

export interface TaskCurrentProgress {
  status: "current" | "historical" | "unknown";
  progress: string | null; next: string | null; timestamp: string | null; source: SnapshotSource | null; gaps: string[];
}
type Instant = {seconds:number; fraction:string};
type Event = {timestamp:string|null; lines:string[]};
const unknown = (gap:string):TaskCurrentProgress => ({status:"unknown",progress:null,next:null,timestamp:null,source:null,gaps:[gap]});

function instant(value:string):Instant|null {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!match)return null;
  const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number);
  const calendar=new Date(0);calendar.setUTCFullYear(year,month-1,day);
  if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day||hour>23||minute>59||second>59)return null;
  const offset=match[8];if(offset!=="Z"&&(Number(offset.slice(1,3))>23||Number(offset.slice(4))>59))return null;
  const epoch=Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${offset}`);
  return Number.isFinite(epoch)?{seconds:epoch/1000,fraction:(match[7]??"").replace(/0+$/,"")}:null;
}
function compare(a:Instant,b:Instant):number {
  if(a.seconds!==b.seconds)return a.seconds-b.seconds;
  const length=Math.max(a.fraction.length,b.fraction.length),left=a.fraction.padEnd(length,"0"),right=b.fraction.padEnd(length,"0");
  return left===right?0:left<right?-1:1;
}
/** Markdown fence state is local to event content; field-like text inside a fence stays text. */
function fenceScan(lines:string[]):{outside:boolean[];closed:boolean} {
  const outside:boolean[]=[];let fence:{marker:string;length:number}|null=null;
  for(const [index,line] of lines.entries()){
    outside.push(fence===null);
    const visible=!fence&&(index===0||line.startsWith("下一步："))?line.replace(/^(?:进展|完成|下一步)：/,""):line;
    const marker=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(visible);
    if(!marker)continue;
    if(!fence)fence={marker:marker[1][0],length:marker[1].length};
    else if(marker[1][0]===fence.marker&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;
  }
  return {outside,closed:fence===null};
}
function parseEvent(event:Event):{progress:string;next:string|null;time:Instant|null}|null {
  const time=event.timestamp===null?null:instant(event.timestamp),scan=fenceScan(event.lines);if(!scan.closed)return null;
  const fields=(prefix:string)=>event.lines.flatMap((line,index)=>scan.outside[index]&&line.startsWith(prefix)?[index]:[]);
  const operations=fields("操作："),nexts=fields("下一步：");
  if(operations.length>1||nexts.length>1||(operations.length===1&&event.lines.slice(operations[0]+1).some(line=>line.trim()))||nexts[0]===0)return null;
  const end=operations[0]??event.lines.length,nextIndex=nexts[0];
  if(nextIndex!==undefined&&nextIndex>=end)return null;
  const progressLines=event.lines.slice(0,nextIndex??end);progressLines[0]=progressLines[0]?.replace(/^(?:进展|完成)：/,"")??"";
  const progress=progressLines.join("\n");
  const next=nextIndex===undefined?null:[event.lines[nextIndex].slice("下一步：".length),...event.lines.slice(nextIndex+1,end)].join("\n");
  return progress.trim()&&(next===null||next.trim())?{progress,next,time}:null;
}

/** Display only: consume the complete existing snapshot projection, never authenticate receipts or fetch. */
export function createTaskCurrentProgress(content:TaskContent,context:{statusIsCompleted:boolean|null;observationHealthy:boolean;observedAt:string}):TaskCurrentProgress {
  if(!context.observationHealthy)return unknown("snapshot 观测有缺口或已过期；当前进展 unknown。");
  const sections=content.domainSections.filter(section=>section.level===2&&section.heading==="Progress");
  if(sections.length!==1)return unknown(sections.length?"Progress 段不唯一；当前进展 unknown。":"snapshot 未提供完整 canonical Progress；可查看任务原文件。");
  const section=sections[0],source=section.source,start=source?.line_start,end=source?.line_end;
  if(typeof start!=="number"||typeof end!=="number"||!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||source?.truncated===true||source?.omitted===true)return unknown("Progress 来源范围缺失或明确不完整；当前进展 unknown。");
  const lines=section.text.replace(/\r\n/g,"\n").split("\n");
  const boundary=lines.findIndex(line=>line.startsWith("<!-- flowdesk.task-update/"));
  if(boundary>=0){
    // Marker comments are only a structural boundary. Their payload, identity and hashes are not certification here.
    if(lines.slice(boundary).some(line=>line.trim()&&!/^<!-- flowdesk\.task-update\/.* -->$/.test(line)))return unknown("Progress 尾部结构不完整；当前进展 unknown。");
    lines.splice(boundary);
  }
  while(lines.length&&!lines[0].trim())lines.shift();while(lines.length&&!lines[lines.length-1].trim())lines.pop();
  if(lines[0]!=="> [!faq]- 详细过程日志"||lines.filter(line=>line==="> [!faq]- 详细过程日志").length!==1)return unknown("Progress callout 缺失、重复或结构破损；当前进展 unknown。");
  const events:Event[]=[];
  for(let index=1;index<lines.length;index++){
    const line=lines[index],match=/^> - \[x\] (.*)$/.exec(line);
    if(match){
      // A checked legacy row is its own event even when its date is absent or incomparable.
      const dated=/^`([^`]*)`(?: (.*))?$/.exec(match[1]);
      events.push({timestamp:dated?dated[1]:null,lines:[dated?(dated[2]??""):match[1]]});continue;
    }
    if(!line.trim()||(!events.length&&/^> *$/.test(line))){
      let following=index+1;while(following<lines.length&&(!lines[following].trim()||/^> *$/.test(lines[following])))following++;
      // Legacy bare blanks may split closed event blocks, never a fence or a continuation.
      if(/^> - \[x\] /.test(lines[following]??"")&&(!events.length||fenceScan(events[events.length-1].lines).closed)){index=following-1;continue;}
      return unknown("Progress 事件或续行结构不完整；当前进展 unknown。");
    }
    if(!events.length||(line!==">"&&!line.startsWith(">   ")))return unknown("Progress 事件或续行结构不完整；当前进展 unknown。");
    events[events.length-1].lines.push(line===">"?"":line.slice(4));
  }
  if(!events.length)return unknown("Progress 没有可核对日期的事件；当前进展 unknown。");
  const parsed=events.map(event=>({event,value:parseEvent(event)}));
  if(parsed.some(item=>!item.value))return unknown("Progress 字段或 Markdown 围栏有缺口；当前进展 unknown。");
  const readable=parsed as Array<{event:Event;value:NonNullable<ReturnType<typeof parseEvent>>}>;
  const valid=readable.filter((item):item is {event:Event;value:NonNullable<ReturnType<typeof parseEvent>>&{time:Instant}}=>item.value.time!==null);
  if(!valid.length)return unknown("Progress 日期不完整，没有可比较日期的片段；最新性未知，不展示当前 Next。");
  const observedAt=instant(context.observedAt);
  if(!observedAt)return unknown("snapshot 观测时间缺失或不可比较；当前进展 unknown。");
  if(valid.some(item=>compare(item.value.time,observedAt)>0))return unknown("Progress 含未来日期；当前进展 unknown。");
  const byInstant=new Map<string,{progress:string;next:string|null}>();
  for(const {value} of valid){
    const key=`${value.time.seconds}:${value.time.fraction}`,previous=byInstant.get(key);
    if(previous&&(previous.progress!==value.progress||previous.next!==value.next))return unknown("同一时刻的 Progress 内容冲突；当前进展 unknown。");
    byInstant.set(key,value);
  }
  const latest=valid.reduce((a,b)=>compare(a.value.time,b.value.time)>0?a:b);
  if(valid.length!==readable.length){
    const gaps=["Progress 日期有缺口；仅展示可比较日期中最近的片段，最新性未知；不展示当前 Next。"];
    if(context.statusIsCompleted===null)gaps.push("生命周期未知。");
    return {status:"unknown",progress:latest.value.progress,next:null,timestamp:latest.event.timestamp,source:source!,gaps};
  }
  const status=context.statusIsCompleted===true?"historical":context.statusIsCompleted===false?"current":"unknown";
  const next=status==="current"?latest.value.next:null;
  const gaps=status==="unknown"?["生命周期未知；不展示当前 Next。"]:status==="current"&&next===null?["该次 Progress 未提供 Next。"]:[];
  return {status,progress:latest.value.progress,next,timestamp:latest.event.timestamp,source:source!,gaps};
}
