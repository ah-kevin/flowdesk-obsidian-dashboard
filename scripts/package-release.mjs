import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REQUIRED_RELEASE_FILES, verifyRelease } from "./verify-release.mjs";

const SUPPORT_FILES = ["README.md", "LICENSE"];

export function packageRelease(options = {}) {
  const root = options.root ?? process.cwd();
  const release = verifyRelease({ root, log: options.log });
  const releaseRoot = path.join(root, "release");
  const packageName = `flowdesk-dashboard-${release.version}`;
  const packageDir = path.join(releaseRoot, packageName);
  const zipName = `${packageName}.zip`;
  const zipPath = path.join(releaseRoot, zipName);

  rmSync(packageDir, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  mkdirSync(packageDir, { recursive: true });

  for (const file of REQUIRED_RELEASE_FILES) {
    copyFileSync(path.join(root, file), path.join(packageDir, file));
  }

  for (const file of SUPPORT_FILES) {
    copyFileSync(path.join(root, file), path.join(packageDir, file));
  }

  let zipCreated = false;
  try {
    execFileSync("zip", ["-qr", zipName, packageName], {
      cwd: releaseRoot,
      stdio: "inherit",
    });
    zipCreated = true;
  } catch (error) {
    console.warn(`zip command failed; release folder was still created: ${error.message}`);
  }

  if (options.log !== false) {
    console.log(`Release folder: ${path.relative(root, packageDir)}`);
    if (zipCreated) {
      console.log(`Release zip: ${path.relative(root, zipPath)}`);
    }
  }

  return { packageDir, zipPath: zipCreated ? zipPath : null };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    packageRelease();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
