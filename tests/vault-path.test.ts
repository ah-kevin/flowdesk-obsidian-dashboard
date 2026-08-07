import assert from "node:assert/strict";
import test from "node:test";

import {
  VaultPathResolutionError,
  resolveVaultPath,
} from "../src/vault-path.ts";

test("Evidence Vault 优先使用显式设置", () => {
  assert.equal(resolveVaultPath({
    configuredPath: "/vault/configured",
    environmentPath: "/vault/environment",
    adapterBasePath: "/vault/adapter",
  }), "/vault/configured");
});

test("Evidence Vault 依次回退环境变量和当前 Obsidian Vault", () => {
  assert.equal(resolveVaultPath({
    configuredPath: "",
    environmentPath: "/vault/environment",
    adapterBasePath: "/vault/adapter",
  }), "/vault/environment");
  assert.equal(resolveVaultPath({
    configuredPath: "",
    environmentPath: "",
    adapterBasePath: "/vault/adapter",
  }), "/vault/adapter");
});

test("Evidence Vault 无任何候选时 fail closed", () => {
  assert.throws(
    () => resolveVaultPath({ configuredPath: "" }),
    VaultPathResolutionError
  );
});
