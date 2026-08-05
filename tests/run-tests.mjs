import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
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
try {
  const testFiles = (await readdir(path.join(repositoryRoot, "tests")))
    .filter((file) => file.endsWith(".test.ts"))
    .sort();
  const testBundles = [];

  for (const testFile of testFiles) {
    const testBundle = path.join(
      temporaryDirectory,
      testFile.replace(/\.ts$/, ".mjs")
    );
    await build({
      absWorkingDir: repositoryRoot,
      bundle: true,
      entryPoints: [path.join("tests", testFile)],
      format: "esm",
      outfile: testBundle,
      platform: "node",
      sourcemap: "inline",
      target: "node20",
    });
    testBundles.push(testBundle);
  }

  const result = spawnSync(process.execPath, ["--test", ...testBundles], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
