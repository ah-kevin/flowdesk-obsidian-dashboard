import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REQUIRED_RELEASE_FILES, verifyRelease } from "./verify-release.mjs";
import { packageDashboardUi } from "./dashboard-ui-package.mjs";
import { workbenchRuntimeDir } from "./build-workbench-runtime.mjs";

const SUPPORT_FILES = ["README.md", "LICENSE"];

export function packageRelease(options = {}) {
  const root = options.root ?? process.cwd();
  const release = verifyRelease({ root, log: options.log });
  const includesWorkbench = existsSync(path.join(root, "web-workbench", "flowdesk-workbench", "server.mjs"));
  const runtime = path.join(root, workbenchRuntimeDir);
  if (includesWorkbench && !existsSync(path.join(runtime, "flowdesk-workbench", "server.mjs"))) {
    throw new Error("工作台后台尚未构建，请先执行 npm run build。");
  }
  const releaseRoot = path.join(root, "release");
  const packageName = `flowdesk-dashboard-${release.version}`;
  const packageDir = path.join(releaseRoot, packageName);
  const zipName = `${packageName}.zip`;
  const zipPath = path.join(releaseRoot, zipName);

  rmSync(packageDir, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  mkdirSync(packageDir, { recursive: true });
  const ui=packageDashboardUi({root,output:releaseRoot,log:options.log});

  for (const file of REQUIRED_RELEASE_FILES) {
    copyFileSync(path.join(root, file), path.join(packageDir, file));
  }

  for (const file of SUPPORT_FILES) {
    copyFileSync(path.join(root, file), path.join(packageDir, file));
  }
  if (includesWorkbench) {
    cpSync(runtime, path.join(packageDir, workbenchRuntimeDir), { recursive: true, verbatimSymlinks: true });
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

  return { packageDir, zipPath: zipCreated ? zipPath : null, uiArchive:ui.archive };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    packageRelease();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
