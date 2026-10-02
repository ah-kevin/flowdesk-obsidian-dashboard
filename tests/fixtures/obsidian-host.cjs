// Public UI host double only. All plugin consumers, producer processes and HTTP remain real.
class HostClass {}
class Plugin {
  views = new Map();
  async loadData(){return {};}
  registerView(name,factory){this.views.set(name,factory);}
  addRibbonIcon(){} addCommand(){} registerEvent(){} addSettingTab(){}
}
class ItemView { constructor(leaf){this.app=leaf.app;this.contentEl=leaf.contentEl;this.containerEl=leaf.contentEl;} }
class TFile { static [Symbol.hasInstance](value){return !!value && typeof value.path==='string' && value.extension==='md';} constructor(path){this.path=path;this.extension='md';} }
module.exports = {
  App: HostClass, ItemView, MarkdownRenderer: { async render(app,text,element){element.setText(text);} }, MarkdownView: HostClass,
  Modal: HostClass, Notice: HostClass, Plugin, PluginSettingTab: HostClass,
  Setting: HostClass, TFile, WorkspaceLeaf: HostClass, setIcon() {},
};
