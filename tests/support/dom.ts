/** DOM double only; no installed Obsidian or browser acceptance. */
export class TestElement {
  children: TestElement[]=[]; classes=new Set<string>(); listeners=new Map<string,Function[]>();
  text=""; open=false; disabled=false; attrs:Record<string,string>={}; style:any={}; parentElement:TestElement|null=null;
  ownerDocument:any=null;
  constructor(readonly tag="div",options:any={}){this.text=options.text??"";this.attrs=options.attr??{};this.addClass(options.cls??"");}
  addClass(...names:string[]){for(const name of names.join(" ").split(/\s+/).filter(Boolean))this.classes.add(name);}
  removeClass(name:string){this.classes.delete(name);}
  createDiv(options:any={}){return this.createEl("div",options);}
  createSpan(options:any={}){return this.createEl("span",options);}
  createEl(tag:string,options:any={}){const el=new TestElement(tag,options);this.appendChild(el);return el;}
  appendChild(el:TestElement){el.parentElement=this;el.ownerDocument=this.ownerDocument;this.children.push(el);return el;}
  empty(){this.children=[];this.text="";}
  setText(text:string){this.text=text;}
  focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
  setAttr(k:string,v:string){this.attrs[k]=v;}
  addEventListener(name:string,fn:Function){this.listeners.set(name,[...(this.listeners.get(name)??[]),fn]);}
  dispatchEvent(event:Event){for(const fn of this.listeners.get(event.type)??[])fn(event);return true;}
  async click(){const target=this;let stopped=false;const event={target,stopPropagation(){stopped=true;},stopImmediatePropagation(){stopped=true;},preventDefault(){}};for(let element:TestElement|null=this;element&&!stopped;element=element.parentElement)for(const fn of element.listeners.get("click")??[])await fn(event);}
  closest(selector:string):TestElement|null {for(let element:TestElement|null=this;element;element=element.parentElement)if(element.tag===selector)return element;return null;}
  contains(node:TestElement):boolean {for(let element:TestElement|null=node;element;element=element.parentElement)if(element===this)return true;return false;}
  get textContent():string {return this.allText().join("");}
  getAttribute(key:string){return this.attrs[key]??null;}
  querySelectorAll(selector:string):TestElement[]{return [...this.children.filter(x=>x.tag===selector),...this.children.flatMap(x=>x.querySelectorAll(selector))];}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);}
  findByClass(name:string):TestElement[]{return [...(this.classes.has(name)?[this]:[]),...this.children.flatMap(x=>x.findByClass(name))];}
  allText():string[]{return [this.text,...this.children.flatMap(x=>x.allText())].filter(Boolean);}
}
