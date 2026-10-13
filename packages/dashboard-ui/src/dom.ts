/** Native DOM construction; host extensions and global prototype changes are unnecessary. */
export interface ElementOptions { cls?:string; text?:string; attr?:Record<string,string|number|boolean> }
export function fdCreateEl<K extends keyof HTMLElementTagNameMap>(parent:HTMLElement,tag:K,options:ElementOptions|string={}):HTMLElementTagNameMap[K] {
  const element=parent.ownerDocument.createElement(tag);
  const values=typeof options==="string"?{cls:options}:options;
  if(values.cls)fdAddClass(element,values.cls);
  if(values.text!==undefined)element.textContent=String(values.text);
  for(const [name,value] of Object.entries(values.attr??{}))element.setAttribute(name,String(value));
  parent.appendChild(element);
  return element;
}
export const fdCreateDiv=(parent:HTMLElement,options:ElementOptions|string={}):HTMLDivElement=>fdCreateEl(parent,"div",options);
export const fdCreateSpan=(parent:HTMLElement,options:ElementOptions|string={}):HTMLSpanElement=>fdCreateEl(parent,"span",options);
export function fdAddClass(element:HTMLElement,...names:string[]):void {element.classList.add(...names.flatMap(name=>name.split(/\s+/).filter(Boolean)));}
export function fdRemoveClass(element:HTMLElement,...names:string[]):void {element.classList.remove(...names.flatMap(name=>name.split(/\s+/).filter(Boolean)));}
export function fdSetAttr(element:HTMLElement,name:string,value:string):void {element.setAttribute(name,String(value));}
export function fdSetText(element:HTMLElement,text:string):void {element.textContent=String(text);}
export function fdEmpty(element:HTMLElement):void {element.replaceChildren();}
