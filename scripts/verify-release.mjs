import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_RELEASE_FILES = [
  "main.js",
  "manifest.json",
  "styles.css",
  "versions.json",
];

function readJson(root, file, errors) {
  const target = path.join(root, file);
  try {
    return JSON.parse(readFileSync(target, "utf8"));
  } catch (error) {
    errors.push(`${file} is not valid JSON: ${error.message}`);
    return {};
  }
}

export function verifyRelease(options = {}) {
  const root = options.root ?? process.cwd();
  const errors = [];
  const warnings = [];

  const pkg = readJson(root, "package.json", errors);
  const manifest = readJson(root, "manifest.json", errors);
  const versions = readJson(root, "versions.json", errors);

  for (const file of REQUIRED_RELEASE_FILES) {
    const target = path.join(root, file);
    if (!existsSync(target)) {
      errors.push(`${file} is missing`);
      continue;
    }
    if (statSync(target).size === 0) {
      errors.push(`${file} is empty`);
    }
  }

  const requiredManifestFields = [
    "id",
    "name",
    "version",
    "minAppVersion",
    "description",
    "author",
    "main",
  ];

  for (const field of requiredManifestFields) {
    if (!manifest[field]) {
      errors.push(`manifest.json is missing ${field}`);
    }
  }

  if (manifest.main !== "main.js") {
    errors.push('manifest.json main must be "main.js"');
  }

  if (manifest.isDesktopOnly !== true) {
    errors.push("manifest.json must set isDesktopOnly to true");
  }

  if (pkg.version && manifest.version && pkg.version !== manifest.version) {
    errors.push(
      `package.json version ${pkg.version} does not match manifest.json version ${manifest.version}`
    );
  }

  if (manifest.version && versions[manifest.version] !== manifest.minAppVersion) {
    errors.push(
      `versions.json must map ${manifest.version} to ${manifest.minAppVersion}`
    );
  }

  if (pkg.private !== true) {
    warnings.push("package.json is not private; npm publishing is not required for this plugin");
  }

  if (errors.length) {
    throw new Error(`Release verification failed:\n- ${errors.join("\n- ")}`);
  }

  const result = {
    version: manifest.version,
    minAppVersion: manifest.minAppVersion,
    files: REQUIRED_RELEASE_FILES,
    warnings,
  };

  if (options.log !== false) {
    console.log(
      `Release verification passed for ${manifest.id} ${manifest.version} ` +
        `(minAppVersion ${manifest.minAppVersion}).`
    );
    if (warnings.length) {
      console.log(`Warnings:\n- ${warnings.join("\n- ")}`);
    }
  }

  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifyRelease();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
