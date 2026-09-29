// Minimal host classes: tests execute the real plugin methods without an Obsidian UI.
class HostClass {}
module.exports = {
  App: HostClass, ItemView: HostClass, MarkdownRenderer: {}, MarkdownView: HostClass,
  Modal: HostClass, Notice: HostClass, Plugin: HostClass, PluginSettingTab: HostClass,
  Setting: HostClass, TFile: HostClass, WorkspaceLeaf: HostClass, setIcon() {},
};
