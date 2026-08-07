import * as path from "path";

export interface VaultPathInput {
  configuredPath: string;
  environmentPath?: string;
  adapterBasePath?: string;
}

export class VaultPathResolutionError extends Error {
  constructor() {
    super("未找到 Evidence Vault 路径，请在插件设置中配置，或使用本地文件系统 Vault。");
    this.name = "VaultPathResolutionError";
  }
}

export function resolveVaultPath(input: VaultPathInput): string {
  const candidate = [
    input.configuredPath,
    input.environmentPath || "",
    input.adapterBasePath || "",
  ].map((value) => value.trim()).find(Boolean);
  if (!candidate) throw new VaultPathResolutionError();
  return path.resolve(candidate);
}
