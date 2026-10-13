import {fdCreateEl,fdCreateDiv,fdEmpty} from './dom.js';
export interface ReadonlyBodyModel {
 title:string;status?:string;reference:string;sourceLabel:string;readAt:string;
 state:'loading'|'available'|'unavailable'|'unsupported'|'too_large';details?:string;warning?:string;
}
export interface ReadonlyBodyActions {
 renderMarkdown:(text:string,target:HTMLElement)=>Promise<void>;
 back:()=>void;refresh:()=>void;showReference:(raw:string)=>void;copyReference:(raw:string)=>void;
}
/** Pure shared presentation. Hosts own identity, sources, requests and reading state. */
export class ReadonlyBodyRenderer {
 constructor(private readonly actions:ReadonlyBodyActions){}
 render(root:HTMLElement,model:ReadonlyBodyModel):void {
  fdEmpty(root);
  const shell=fdCreateEl(root,'section',{cls:'flowdesk-body-reader'}),nav=fdCreateDiv(shell,{cls:'flowdesk-body-nav'});
  const button=(parent:HTMLElement,text:string,cls:string,run:()=>void)=>{
   const node=fdCreateEl(parent,'button',{text,cls,attr:{type:'button'}});node.addEventListener('click',run);return node;
  };
  button(nav,'← 返回 Case','flowdesk-body-back',this.actions.back);
  const refresh=button(nav,'刷新','flowdesk-body-refresh',this.actions.refresh);refresh.disabled=model.state==='loading';
  fdCreateEl(shell,'h2',{text:model.title,cls:'flowdesk-body-title'});
  if(model.status)fdCreateEl(shell,'p',{text:model.status,cls:'flowdesk-body-status'});
  fdCreateEl(shell,'p',{text:[model.sourceLabel,model.readAt?'读取于 '+model.readAt:''].filter(Boolean).join(' · '),cls:'flowdesk-body-source'});
  const refs=fdCreateDiv(shell,{cls:'flowdesk-body-actions'});
  button(refs,'查看引用','flowdesk-body-reference',()=>this.actions.showReference(model.reference));
  button(refs,'复制引用','flowdesk-body-copy',()=>this.actions.copyReference(model.reference));
  if(model.warning)fdCreateEl(shell,'p',{text:model.warning,cls:'flowdesk-body-warning',attr:{role:'status'}});
  const messages={loading:'正在读取正文…',unavailable:'正文暂不可读取，原始引用仍保留。',unsupported:'此来源暂不支持正文预览，可查看或复制引用。',too_large:'正文超出读取限额，未截断显示。'};
  if(model.state!=='available'){fdCreateEl(shell,'p',{text:messages[model.state],cls:'flowdesk-body-message',attr:{role:'status'}});return;}
  const body=fdCreateDiv(shell,{cls:'markdown-rendered flowdesk-body-content'});
  void this.actions.renderMarkdown(model.details??'',body).catch(()=>{body.textContent='正文渲染失败，可刷新后重试。';});
 }
}
