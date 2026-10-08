import {marked} from "marked";
const notify=(text:string)=>(window as any).previewNotify?.(text);
const element=(tag:string,options:any={})=>{const el=document.createElement(tag);if(typeof options==="string")options={cls:options};if(options.cls)el.className=options.cls;if(options.text!==undefined)el.textContent=options.text;if(options.value!==undefined)(el as HTMLInputElement).value=String(options.value);for(const [key,value]of Object.entries(options.attr??{}))el.setAttribute(key,String(value));return el;};
Object.assign(HTMLElement.prototype,{
  createEl(this:HTMLElement,tag:string,options:any={}){const el=element(tag,options);this.appendChild(el);return el;},
  createDiv(this:HTMLElement,options:any={}){return (this as any).createEl("div",options);},
  createSpan(this:HTMLElement,options:any={}){return (this as any).createEl("span",options);},
  empty(this:HTMLElement){this.replaceChildren();},setText(this:HTMLElement,value:string){this.textContent=value;},
  setAttr(this:HTMLElement,key:string,value:string){this.setAttribute(key,value);},
  addClass(this:HTMLElement,...names:string[]){for(const name of names.join(" ").split(/\s+/).filter(Boolean))this.classList.add(name);},
  removeClass(this:HTMLElement,name:string){this.classList.remove(name);},
});
export class App {}
export class Component {
  children:Component[]=[];callbacks:Array<()=>void>=[];loaded=false;
  load(){this.loaded=true;for(const child of this.children)child.load();}
  unload(){for(const child of this.children)child.unload();for(const callback of this.callbacks)callback();this.callbacks=[];this.loaded=false;}
  addChild<T extends Component>(child:T):T{this.children.push(child);if(this.loaded)child.load();return child;}
  removeChild<T extends Component>(child:T):T{child.unload();this.children=this.children.filter(value=>value!==child);return child;}
  register(callback:()=>void){this.callbacks.push(callback);}
}
export class Plugin {
  app:any;manifest={id:"flowdesk-dashboard"};views=new Map();commands:any[]=[];
  async loadData(){return (window as any).__PREVIEW_DATA__.settings??{};}
  async saveData(value:any){(window as any).__PREVIEW_DATA__.settings={...value};notify("已更新本地预览配置；实际插件配置未修改。");}
  registerView(type:string,factory:any){this.views.set(type,factory);}
  addRibbonIcon(){}addCommand(command:any){this.commands.push(command);}registerEvent(){}addSettingTab(){}
}
export class ItemView extends Component {app:any;leaf:any;contentEl:HTMLElement;containerEl:HTMLElement;constructor(leaf:any){super();this.leaf=leaf;this.app=leaf.app;this.contentEl=leaf.contentEl;this.containerEl=leaf.contentEl;this.load();}}
export class MarkdownView {}
export class WorkspaceLeaf {}
export class TAbstractFile {}
export class TFile {path:string;extension="md";constructor(path:string){this.path=path;}static [Symbol.hasInstance](value:any){return value?.extension==="md"&&typeof value.path==="string";}}
export class Notice {constructor(message:string){notify(message);}}
export class Modal {
  app:any;containerEl:HTMLElement;contentEl:HTMLElement;titleEl:HTMLElement;
  constructor(app:any){this.app=app;this.containerEl=element("div",{cls:"preview-modal-overlay"});const box=element("div",{cls:"preview-modal"});this.containerEl.appendChild(box);this.titleEl=element("h2");this.contentEl=element("div");box.append(this.titleEl,this.contentEl);const close=element("button",{text:"关闭",cls:"preview-modal-close"});close.addEventListener("click",()=>this.close());box.appendChild(close);}
  open(){document.body.appendChild(this.containerEl);(this as any).onOpen?.();}
  close(){(this as any).onClose?.();this.containerEl.remove();}
}
export class PluginSettingTab {app:any;containerEl:HTMLElement;constructor(app:any){this.app=app;this.containerEl=element("div");}hide(){}}
class Value {
  inputEl:any;constructor(parent:HTMLElement,tag:string){this.inputEl=element(tag);parent.appendChild(this.inputEl);}
  setPlaceholder(value:string){this.inputEl.placeholder=value;return this;}
  setValue(value:string){this.inputEl.value=value;return this;}
  addOption(value:string,label:string){const option=element("option",{text:label});(option as HTMLOptionElement).value=value;this.inputEl.appendChild(option);return this;}
  onChange(callback:any){this.inputEl.addEventListener(this.inputEl.tagName==="SELECT"?"change":"input",()=>callback(this.inputEl.value));return this;}
}
class Button {
  buttonEl:HTMLButtonElement;constructor(parent:HTMLElement){this.buttonEl=element("button") as HTMLButtonElement;parent.appendChild(this.buttonEl);}
  setButtonText(value:string){this.buttonEl.textContent=value;return this;}setTooltip(value:string){this.buttonEl.title=value;this.buttonEl.setAttribute("aria-label",value);return this;}
  setIcon(value:string){setIcon(this.buttonEl,value);return this;}onClick(callback:any){this.buttonEl.addEventListener("click",callback);return this;}
}
export class Setting {
  nameEl:HTMLElement;descEl:HTMLElement;controlEl:HTMLElement;
  constructor(parent:HTMLElement){const row=element("div",{cls:"setting-item"});parent.appendChild(row);const info=element("div",{cls:"setting-item-info"});row.appendChild(info);this.nameEl=element("div",{cls:"setting-item-name"});this.descEl=element("div",{cls:"setting-item-description"});info.append(this.nameEl,this.descEl);this.controlEl=element("div",{cls:"setting-item-control"});row.appendChild(this.controlEl);}
  setName(value:string){this.nameEl.textContent=value;return this;}setDesc(value:string){this.descEl.textContent=value;return this;}
  addText(callback:any){callback(new Value(this.controlEl,"input"));return this;}addTextArea(callback:any){callback(new Value(this.controlEl,"textarea"));return this;}
  addDropdown(callback:any){callback(new Value(this.controlEl,"select"));return this;}addButton(callback:any){callback(new Button(this.controlEl));return this;}addExtraButton(callback:any){callback(new Button(this.controlEl));return this;}
}
export function setIcon(el:HTMLElement,name:string){const shapes:Record<string,string>={"file-text":'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',"refresh-cw":'<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 7M4 12l2 7a8 8 0 0 0 13-3"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'};el.innerHTML=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${shapes[name]??""}</svg>`;}
export const parseLinktext=(value:string)=>{const index=value.indexOf("#");return index<0?{path:value,subpath:""}:{path:value.slice(0,index),subpath:value.slice(index)};};
export const MarkdownRenderer={async render(app:any,text:string,el:HTMLElement){
  if(app.markdownDelay)await app.markdownDelay();
  const html=marked.parse(text,{async:false}) as string;const temp=document.createElement("div");temp.innerHTML=html;
  for(const forbidden of temp.querySelectorAll("script,iframe,object,embed,link,meta,style,img"))forbidden.remove();
  for(const node of temp.querySelectorAll("*"))for(const attr of [...node.attributes])if(/^on/i.test(attr.name)||/^(javascript|data):/i.test(attr.value))node.removeAttribute(attr.name);
  el.replaceChildren(...temp.childNodes);
}};
