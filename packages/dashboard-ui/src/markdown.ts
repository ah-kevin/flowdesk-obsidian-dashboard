import MarkdownIt from "markdown-it";
import {readProgressTime} from "./progress-time.js";

/** Read-only browser markup. Raw HTML/resources and automatic navigation are never emitted. */
const markdown=new MarkdownIt({html:false,linkify:false,typographer:false});
const escape=(value:unknown):string=>markdown.utils.escapeHtml(String(value??""));
markdown.inline.ruler.before("html_inline","flowdesk_progress_time",(state)=>{
  const prefix=/`(\d{4}-\d{2}-\d{2} \d{2}:\d{2})`[ \t]+$/.exec(state.src.slice(0,state.pos));
  const marker=/^<!-- flowdesk\.progress-time\/1 [^ ]+ -->/.exec(state.src.slice(state.pos));
  if(!prefix||!marker||state.tokens[state.tokens.length-1]?.type!=="code_inline"||!readProgressTime(prefix[1],marker[0]))return false;
  state.pos+=marker[0].length;return true;
});
markdown.inline.ruler.before("link","flowdesk_wiki",(state,silent)=>{
  const start=state.pos;
  if(state.src.slice(start,start+2)!=="[["||state.src[start-1]==="!")return false;
  const end=state.src.indexOf("]]",start+2);
  if(end<0)return false;
  const inside=state.src.slice(start+2,end);
  if(!inside.trim()||inside.includes("\n"))return false;
  if(!silent){
    const split=inside.indexOf("|"),token=state.push("flowdesk_reference","span",0);
    token.content=split<0?inside:inside.slice(split+1);
    token.meta={reference:state.src.slice(start,end+2)};
  }
  state.pos=end+2;
  return true;
});
markdown.renderer.rules.flowdesk_reference=(tokens,index)=>{
  const token=tokens[index];
  return '<span class="flowdesk-markdown-reference" data-reference="'+escape(token.meta?.reference)+'" role="button" tabindex="0">'+escape(token.content)+'</span>';
};
markdown.renderer.rules.link_open=(tokens,index)=>{
  const target=tokens[index].attrGet("href")??"";
  return '<span class="flowdesk-markdown-reference" data-reference="'+escape(target)+'" role="button" tabindex="0">';
};
markdown.renderer.rules.link_close=()=>"</span>";
markdown.renderer.rules.image=(tokens,index)=>{
  const token=tokens[index];
  return '<span class="flowdesk-markdown-image-placeholder">'+escape(token.content)+"（图片未加载："+escape(token.attrGet("src")??"")+"）</span>";
};
markdown.renderer.rules.flowdesk_checkbox=(tokens,index)=>
  '<input type="checkbox" disabled aria-readonly="true"'+(tokens[index].meta?.checked===true?' checked="checked"':"")+"> ";
markdown.renderer.rules.flowdesk_callout_open=(tokens,index)=>{
  const meta=tokens[index].meta??{};
  const cls="flowdesk-callout is-"+meta.kind;
  return meta.fold?
    '<details class="'+cls+'"'+(meta.expanded?' open="open"':"")+"><summary>"+escape(meta.title)+"</summary>\n":
    '<aside class="'+cls+'"><div class="flowdesk-callout-title">'+escape(meta.title)+"</div>\n";
};
markdown.renderer.rules.flowdesk_callout_close=(tokens,index)=>tokens[index].meta?.fold?"</details>\n":"</aside>\n";

markdown.core.ruler.after("inline","flowdesk_readonly",state=>{
  const tokens=state.tokens;
  const quotes:Array<any>=[],pairs:Array<[any,any]>=[];
  for(const token of tokens){
    if(token.type==="blockquote_open")quotes.push(token);
    else if(token.type==="blockquote_close"&&quotes.length)pairs.push([quotes.pop(),token]);
  }
  for(const [open,close] of pairs){
    const start=tokens.indexOf(open),paragraph=tokens[start+1],inline=tokens[start+2],end=tokens[start+3];
    if(paragraph?.type!=="paragraph_open"||inline?.type!=="inline"||end?.type!=="paragraph_close")continue;
    const lines=inline.content.split("\n"),match=/^\[!([a-z][a-z0-9_-]*)\]([+-]?)(?:[ \t]+(.*))?$/i.exec(lines[0]);
    if(!match)continue;
    const meta={kind:match[1].toLowerCase(),title:match[3]||match[1],fold:!!match[2],expanded:match[2]==="+"};
    open.type="flowdesk_callout_open";open.meta=meta;
    close.type="flowdesk_callout_close";close.meta=meta;
    const remaining=lines.slice(1).join("\n");
    if(!remaining)tokens.splice(start+1,3);
    else {inline.content=remaining;inline.children=[];state.md.inline.parse(remaining,state.md,state.env,inline.children);}
  }
  const items:Array<{token:any;seen:boolean}>=[];
  for(const token of tokens){
    if(token.type==="list_item_open")items.push({token,seen:false});
    else if(token.type==="list_item_close")items.pop();
    else if(token.type==="inline"&&items.length){
      const item=items[items.length-1];
      if(item.seen)continue;
      item.seen=true;
      const mark=/^\[([ xX])\][ \t]+/.exec(token.content);
      if(!mark)continue;
      item.token.attrJoin("class","task-list-item");
      token.content=token.content.slice(mark[0].length);token.children=[];
      state.md.inline.parse(token.content,state.md,state.env,token.children);
      const checkbox=new state.Token("flowdesk_checkbox","input",0);
      checkbox.meta={checked:mark[1].toLowerCase()==="x"};
      token.children.unshift(checkbox);
    }
  }
});

export function renderReadonlyMarkdown(text:string):string {
  return markdown.render(text);
}
