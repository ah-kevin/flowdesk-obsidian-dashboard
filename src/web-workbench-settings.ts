import { Setting, type ButtonComponent } from "obsidian";
import { isWorkbenchPairingKey, parseWorkbenchPort, workbenchLanAddresses, WORKBENCH_LAN_BIND_HOST, type WorkbenchService, type WorkbenchSettings } from "./web-workbench";

export function addWorkbenchSettings(container: HTMLElement, actions: {
  settings: WorkbenchSettings;
  service: WorkbenchService;
  save: (settings: Partial<WorkbenchSettings>) => Promise<void>;
  open: () => void;
}): () => void {
  const { settings, service, save, open } = actions;
  new Setting(container).setName("Web 工作台").setHeading();

  const controls = new Setting(container).setName("服务状态").setDesc("修改 TaskNotes 连接设置后，重启工作台生效。");
  const statusText = controls.descEl.createDiv({ attr: { role: "status" } });
  const endpoints = controls.descEl.createDiv();
  let start!: ButtonComponent;
  let stop!: ButtonComponent;
  let restart!: ButtonComponent;
  let browser!: ButtonComponent;
  controls.addButton(button => { start = button.setButtonText("启动").onClick(() => service.start()); });
  controls.addButton(button => { stop = button.setButtonText("停止").onClick(() => service.stop()); });
  controls.addButton(button => { restart = button.setButtonText("重启").onClick(() => service.restart()); });
  controls.addButton(button => { browser = button.setButtonText("在浏览器打开").onClick(open); });

  const portRow = new Setting(container).setName("端口").setDesc("本机和局域网共用同一个端口。修改后重启生效。");
  const portStatus = portRow.descEl.createDiv({ attr: { role: "status" } });
  portRow.addText(text => {
    text.setValue(String(settings.port));
    text.inputEl.inputMode = "numeric";
    text.inputEl.addEventListener("change", async () => {
      const port = parseWorkbenchPort(text.getValue().trim());
      if (port === undefined) {
        portStatus.setText("请输入 1 到 65535 之间的整数。");
        return;
      }
      try {
        await save({ port });
        portStatus.setText("");
      } catch {
        portStatus.setText("端口设置未能保存。");
      }
    });
  });

  new Setting(container).setName("局域网访问")
    .setDesc("开启时监听所有 IPv4 网卡。同网段设备可通过当前网卡地址访问工作台。关闭时仅本机可访问。修改后重启生效。")
    .addToggle(toggle => toggle.setValue(Boolean(settings.lanHost)).onChange(enabled =>
      save({ lanHost: enabled ? WORKBENCH_LAN_BIND_HOST : "" })));
  new Setting(container).setName("作者配对")
    .setDesc("开启后，浏览器需先配对才能使用作者操作。修改后重启生效。")
    .addToggle(toggle => toggle.setValue(settings.requirePairing).onChange(requirePairing => save({ requirePairing })));
  const pairingKeyRow = new Setting(container).setName("配对密钥")
    .setDesc("作者配对时输入此密钥。修改后重启生效。");
  const pairingKeyStatus = pairingKeyRow.descEl.createDiv({ attr: { role: "status" } });
  pairingKeyRow.addText(text => {
    text.inputEl.type = "password";
    text.inputEl.autocomplete = "new-password";
    text.inputEl.spellcheck = false;
    text.inputEl.setAttribute("aria-label", "配对密钥");
    text.setValue(settings.pairingKey);
    text.inputEl.addEventListener("change", async () => {
      const pairingKey = text.getValue();
      if (!isWorkbenchPairingKey(pairingKey)) {
        text.inputEl.setAttribute("aria-invalid", "true");
        pairingKeyStatus.setText("请输入有效的配对密钥。");
        return;
      }
      text.inputEl.removeAttribute("aria-invalid");
      try {
        await save({ pairingKey });
        pairingKeyStatus.setText("");
      } catch {
        pairingKeyStatus.setText("配对密钥未能保存。");
      }
    });
  });
  new Setting(container).setName("Node.js 路径")
    .setDesc("需要 Node.js 22 或以上。留空时从 PATH 查找，也可填写可执行文件的绝对路径。修改后重启生效。")
    .addText(text => text.setPlaceholder("自动查找").setValue(settings.nodePath)
      .onChange(nodePath => save({ nodePath: nodePath.trim() })));
  new Setting(container).setName("随插件启动")
    .setDesc("加载 Dashboard 时自动启动 Web 工作台。")
    .addToggle(toggle => toggle.setValue(settings.autoStart).onChange(autoStart => save({ autoStart })));

  const renderEndpoints = () => {
    endpoints.empty();
    const state = service.status;
    if (state.kind !== "running") return;
    const addLink = (label: string, address: string) => {
      const origin = `http://${address}:${state.port}`;
      const href = origin + "/";
      const line = endpoints.createDiv();
      line.createSpan({ text: `${label} ` });
      line.createEl("a", { text: href, cls: "external-link", attr: { href, target: "_blank", rel: "noopener noreferrer" } });
      if (state.requirePairing) {
        line.createSpan({ text: " · " });
        line.createEl("a", { text: "作者配对", cls: "external-link", attr: {
          href: origin + "/pair", target: "_blank", rel: "noopener noreferrer", "aria-label": `作者配对 ${origin}`,
        } });
      }
    };
    addLink("本机", "127.0.0.1");
    if (!state.lanHost) return;
    endpoints.createDiv({ text: `局域网监听 ${state.lanHost}` });
    const addresses = workbenchLanAddresses();
    if (!addresses.length) endpoints.createDiv({ text: "当前没有局域网 IPv4 地址。" });
    for (const address of addresses) addLink("局域网", address);
  };

  const unsubscribe = service.subscribe(state => {
    renderEndpoints();
    const busy = state.kind === "starting" || state.kind === "stopping";
    const owned = state.kind === "running" || (state.kind === "error" && state.canStop);
    start.setDisabled(busy || Boolean(owned));
    stop.setDisabled(state.kind !== "starting" && !owned);
    restart.setDisabled(!owned);
    browser.setDisabled(state.kind !== "running");
    if (state.kind === "running") {
      statusText.setText("运行中");
    } else if (state.kind === "error") {
      statusText.setText(state.message);
    } else {
      statusText.setText({ stopped: "已停止", starting: "正在启动…", stopping: "正在停止…" }[state.kind]);
    }
  });
  const trackedWindow = container.ownerDocument.defaultView;
  trackedWindow?.addEventListener("online", renderEndpoints);
  trackedWindow?.addEventListener("focus", renderEndpoints);
  return () => {
    unsubscribe();
    trackedWindow?.removeEventListener("online", renderEndpoints);
    trackedWindow?.removeEventListener("focus", renderEndpoints);
  };
}
