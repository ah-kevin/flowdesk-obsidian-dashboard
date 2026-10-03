// Public UI host double only. All plugin consumers, producer processes and HTTP remain real.
class HostClass {}
class Plugin {
  views = new Map();
  async loadData(){return {};}
  registerView(name,factory){this.views.set(name,factory);}
  addRibbonIcon(){} addCommand(){} registerEvent(){} addSettingTab(){}
}
class ItemView { constructor(leaf){this.app=leaf.app;this.contentEl=leaf.contentEl;this.containerEl=leaf.contentEl;} }
function visibleLabel(value){return value.replace(/&#x([0-9a-f]+);|&#([0-9]+);|&(amp|lt|gt|quot|apos|nbsp);/gi,(entity,hex,decimal,name)=>{
  if(hex||decimal){const point=parseInt(hex??decimal,hex?16:10);return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):"\ufffd";}
  return {amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:"\u00a0"}[name.toLowerCase()]??entity;
});}
// Small independent host rendering subset; original text remains available for fidelity assertions.
async function renderMarkdown(app,text,element){
  element.setText(text);
  const visible=text.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm,"").replace(/`+[^`\n]*`+/g,"").replace(/<!--[\s\S]*?-->/g,"");
  for(const match of visible.matchAll(/(?<![\\!])\[\[([^\]]+)\]\]|(?<![\\!])\[([^\]]+)\]\(([^)]+)\)/g)){
    const wiki=match[1]!==undefined,parts=wiki?match[1].split("|"):[];
    const target=wiki?parts[0]:match[3].replace(/^<|>$/g,"");
    element.createEl("a",{text:visibleLabel(wiki?(parts[1]??parts[0]):match[2]),attr:{href:target,...(wiki?{"data-href":target}:{} )}});
  }
  if(app?.markdownDelay)await app.markdownDelay();
}
class TFile { static [Symbol.hasInstance](value){return !!value && typeof value.path==='string' && typeof value.extension==='string';} constructor(path){this.path=path;this.extension='md';} }
module.exports = {
  App: HostClass, ItemView, MarkdownRenderer: { render:renderMarkdown }, MarkdownView: HostClass,
  Modal: HostClass, Notice: HostClass, Plugin, PluginSettingTab: HostClass,
  Setting: HostClass, TFile, WorkspaceLeaf: HostClass, setIcon() {},
  parseLinktext(value){const index=value.indexOf("#");return index<0?{path:value,subpath:""}:{path:value.slice(0,index),subpath:value.slice(index)};},
};
