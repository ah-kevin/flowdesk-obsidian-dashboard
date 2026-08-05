import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "flowdesk-dashboard-tests-")
);
const testBundle = path.join(temporaryDirectory, "snapshot-model.test.mjs");

try {
  await build({
    absWorkingDir: repositoryRoot,
    bundle: true,
    entryPoints: ["tests/snapshot-model.test.ts"],
    format: "esm",
    outfile: testBundle,
    platform: "node",
    sourcemap: "inline",
    target: "node20",
  });

  const result = spawnSync(process.execPath, ["--test", testBundle], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
