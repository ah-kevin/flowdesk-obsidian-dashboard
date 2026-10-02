import type { WorkCaseSectionBlock } from "./work-case-model";
export interface CaseContentObservation {
  casePath:string; details:string; readAt:string; source:"vault-cached-read"; error:string|null;
  sections:WorkCaseSectionBlock[];
}

/** Independent cachedRead source, retaining all bytes and physical file lines. */
export function createCaseContent(casePath:string,details:string,readAt:string):CaseContentObservation {
  const lines=details.replace(/\r\n/g,"\n").replace(/^\ufeff/,"").split("\n");
  const headings:Array<{heading:string;level:number;index:number}>=[];
  let fence:{marker:string;size:number}|null=null;
  for(let index=0;index<lines.length;index++){
    const line=lines[index],match=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if(match){if(!fence)fence={marker:match[1][0],size:match[1].length};else if(match[1][0]===fence.marker&&match[1].length>=fence.size&&!match[2].trim())fence=null;continue;}
    if(fence)continue;
    const heading=line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if(heading)headings.push({heading:heading[2],level:heading[1].length,index});
  }
  const selected=new Set(["Goal","Current","Context","Summary","Decisions","目标","决策","背景","摘要"]);
  const sections=headings.filter(h=>selected.has(h.heading)).map(h=>{
    const end=headings.find(n=>n.index>h.index&&n.level<=h.level)?.index??lines.length;
    return {heading:h.heading,level:h.level,text:lines.slice(h.index+1,end).join("\n"),source:{lineStart:h.index+1,lineEnd:end}};
  });
  return {casePath,details,readAt,source:"vault-cached-read",error:null,sections};
}
