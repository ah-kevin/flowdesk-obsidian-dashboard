/** DOM double only; no installed Obsidian or browser acceptance. */
export class TestElement {
  children: TestElement[]=[]; classes=new Set<string>(); listeners=new Map<string,Function[]>();
  text=""; open=false; disabled=false; attrs:Record<string,string>={}; style:any={}; parentElement:TestElement|null=null;
  constructor(readonly tag="div",options:any={}){this.text=options.text??"";this.attrs=options.attr??{};this.addClass(options.cls??"");}
  addClass(...names:string[]){for(const name of names.join(" ").split(/\s+/).filter(Boolean))this.classes.add(name);}
  removeClass(name:string){this.classes.delete(name);}
  createDiv(options:any={}){return this.createEl("div",options);}
  createSpan(options:any={}){return this.createEl("span",options);}
  createEl(tag:string,options:any={}){const el=new TestElement(tag,options);this.appendChild(el);return el;}
  appendChild(el:TestElement){el.parentElement=this;this.children.push(el);return el;}
  empty(){this.children=[];this.text="";}
  setText(text:string){this.text=text;}
  setAttr(k:string,v:string){this.attrs[k]=v;}
  addEventListener(name:string,fn:Function){this.listeners.set(name,[...(this.listeners.get(name)??[]),fn]);}
  async click(){for(const fn of this.listeners.get("click")??[])await fn({stopPropagation(){}});}
  findByClass(name:string):TestElement[]{return [...(this.classes.has(name)?[this]:[]),...this.children.flatMap(x=>x.findByClass(name))];}
  allText():string[]{return [this.text,...this.children.flatMap(x=>x.allText())].filter(Boolean);}
}
