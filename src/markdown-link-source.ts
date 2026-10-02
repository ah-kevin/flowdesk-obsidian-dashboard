export interface MarkdownLinkSource {kind:"wiki"|"markdown";href:string;label:string}
export interface RenderedLink {href:string;label:string}
const normalized=(value:string)=>{try{return decodeURIComponent(value).replace(/\\([\\[\]()<>|])/g,"$1");}catch{return value;}};
const visibleLabel=(value:string)=>value.replace(/\s+/g," ").trim();
let entityDecoder:HTMLTextAreaElement|null=null;
function decodeEntities(value:string):string {
  return value.replace(/&(?:#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/gi,entity=>{
    if(typeof document!=="undefined") {
      entityDecoder ??= document.createElement("textarea");
      // Decode only the matched entity, never arbitrary HTML from task content.
      entityDecoder.innerHTML=entity;return entityDecoder.value;
    }
    const numeric=entity.match(/^&#(x[0-9a-f]+|[0-9]+);$/i);
    if(numeric){const token=numeric[1],point=parseInt(token[0].toLowerCase()==="x"?token.slice(1):token,token[0].toLowerCase()==="x"?16:10);return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):"\ufffd";}
    const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:"\u00a0"};
    return named[entity.slice(1,-1)]??entity;
  });
}
const labelText=(value:string)=>visibleLabel(decodeEntities(value.replace(/<[^>]*>/g,"").replace(/[*_~`]/g,"").replace(/\\(.)/g,"$1")));

/** Link syntax only. Code/escaped text never grants a navigation exemption. */
export function collectMarkdownLinkSources(text:string):MarkdownLinkSource[] {
  let fence:{marker:string;length:number}|null=null;
  let masked=text.split("\n").map(line=>{
    const content=line.replace(/^ {0,3}(?:>\s*)+/,"");
    const marker=content.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if(marker){if(!fence)fence={marker:marker[1][0],length:marker[1].length};else if(marker[1][0]===fence.marker&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;return "";}
    return fence||/^(?: {4}|\t)/.test(content)?"":line;
  }).join("\n").replace(/<!--[\s\S]*?(?:-->|$)/g,"").replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi,"");
  const definitions=new Map<string,string>();
  for(const match of masked.matchAll(/^ {0,3}\[([^\]^][^\]]*)\]:\s*(?:<([^>]+)>|(\S+))/gm))definitions.set(match[1].toLowerCase(),match[2]??match[3]);
  masked=masked.replace(/^ {0,3}\[[^\]]+\]:.*$/gm,"");
  const links:MarkdownLinkSource[]=[];
  const unescape=(value:string)=>value.replace(/\\(.)/g,"$1");
  for(let i=0;i<masked.length;i++){
    if(masked[i]==="\\"){i++;continue;}
    if(masked[i]==="`"){
      const run=masked.slice(i).match(/^`+/)![0],end=masked.indexOf(run,i+run.length);
      if(end>=0){i=end+run.length-1;continue;}
    }
    if(masked[i]!=="[")continue;
    if(masked[i-1]==="!")continue; // embedded notes/images have their own source context
    if(masked[i+1]==="["){
      const end=masked.indexOf("]]",i+2);if(end<0)continue;
      const parts=masked.slice(i+2,end).split("|");links.push({kind:"wiki",href:unescape(parts[0]),label:labelText(parts[1]??parts[0])});i=end+1;continue;
    }
    let close=i+1,depth=1;
    for(;close<masked.length;close++){if(masked[close]==="\\"){close++;continue;}if(masked[close]==="[")depth++;if(masked[close]==="]"&&--depth===0)break;}
    if(depth)continue;
    const label=masked.slice(i+1,close);
    if(masked[close+1]==="("){
      let end=close+2,paren=1,angle=false;
      for(;end<masked.length;end++){const char=masked[end];if(char==="\\"){end++;continue;}if(char==="<")angle=true;if(char===">")angle=false;if(!angle&&char==="(")paren++;if(!angle&&char===")"&&--paren===0)break;}
      if(paren)continue;
      const value=masked.slice(close+2,end).trim(),href=value.startsWith("<")?value.slice(1,value.indexOf(">")):value.replace(/\s+["'][\s\S]*["']$/,"");
      links.push({kind:"markdown",href:unescape(href),label:labelText(label)});i=end;continue;
    }
    const reference=masked[close+1]==="["?masked.slice(close+2,masked.indexOf("]",close+2)):label;
    const href=definitions.get((reference||label).toLowerCase());
    if(href){links.push({kind:"markdown",href,label:labelText(label)});if(masked[close+1]==="[")i=masked.indexOf("]",close+2);else i=close;}
  }
  return links;
}

/** Match this rendered occurrence, not a document-wide href whitelist. Ambiguity fails closed. */
export function renderedLinkSource(sources:MarkdownLinkSource[],rendered:RenderedLink[],index:number,complete:boolean):"wiki"|"markdown"|null {
  const clicked=rendered[index];if(!clicked)return null;
  const href=normalized(clicked.href);
  const sourceGroup=sources.filter(source=>normalized(source.href)===href);
  const actualGroup=rendered.map((link,i)=>({link,i})).filter(x=>normalized(x.link.href)===href);
  if(actualGroup.length>sourceGroup.length)return null;
  const matching=sourceGroup.filter(source=>source.label===visibleLabel(clicked.label));
  if(matching.length===1&&sourceGroup.every(source=>source.kind===matching[0].kind))return matching[0].kind;
  if(!complete||sourceGroup.length!==actualGroup.length)return null;
  const ordinal=actualGroup.findIndex(x=>x.i===index),source=sourceGroup[ordinal];
  return source&&source.label===visibleLabel(clicked.label)?source.kind:null;
}
