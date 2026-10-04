import { App, Component, Modal, Notice } from "obsidian";
export interface DashboardAction { label:string; run:()=>Promise<void>|void }
export class DashboardContentModal extends Modal {
  readonly markdownScope=new Component();
  private renderController=new AbortController();
  get renderSignal():AbortSignal{return this.renderController.signal;}
  constructor(app:App,private readonly heading:string,private readonly renderBody:(container:HTMLElement)=>void){super(app);}
  onOpen():void {if(this.renderController.signal.aborted)this.renderController=new AbortController();this.markdownScope.load();this.titleEl.setText(this.heading);this.contentEl.empty();this.contentEl.addClass("flowdesk-dialog-content");this.renderBody(this.contentEl);}
  onClose():void {this.renderController.abort();this.markdownScope.unload();this.contentEl.empty();}
}
export class DashboardActionsModal extends DashboardContentModal {
  constructor(app:App,heading:string,actions:DashboardAction[]){let instance:DashboardActionsModal;super(app,heading,container=>{
    for(const action of actions){const button=container.createEl("button",{cls:"flowdesk-menu-action",text:action.label});button.addEventListener("click",async()=>{if(button.disabled)return;button.disabled=true;try{if(!action.label.startsWith("复制"))instance.close();await action.run();if(action.label.startsWith("复制"))new Notice("已复制到剪贴板");}catch{new Notice("操作未完成，请核对后重试。");}finally{button.disabled=false;}});}
  });instance=this;}
}
export function createReadOnlyTextModal(app:App,title:string,text:string):DashboardContentModal {
  return new DashboardContentModal(app,title,container=>{
    const input=container.createEl("textarea",{cls:"flowdesk-dialog-text",attr:{readonly:"true","aria-label":title}});input.value=text;
    const feedback=container.createDiv({cls:"flowdesk-muted",attr:{role:"status"}}),copy=container.createEl("button",{text:"复制"});
    copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(text);feedback.setText("已复制到剪贴板");}catch{feedback.setText("未能写入剪贴板，可选择文本手动复制。");}});
  });
}
