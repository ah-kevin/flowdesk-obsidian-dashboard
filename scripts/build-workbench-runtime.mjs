import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const workbenchRuntimeDir = 'workbench-runtime';

export function buildWorkbenchRuntime(root = repositoryRoot) {
  const source = path.join(root, 'web-workbench');
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const runtimePackages = Object.entries(lock.packages).filter(([name, entry]) =>
    name.startsWith('node_modules/') && !entry.dev);
  const stage = mkdtempSync(path.join(root, '.workbench-runtime-'));
  const target = path.join(root, workbenchRuntimeDir);
  try {
    for (const name of ['flowdesk-workbench', 'flowdesk-review']) {
      const from = path.join(source, name);
      const to = path.join(stage, name);
      mkdirSync(to);
      for (const file of readdirSync(from, { withFileTypes: true })) {
        if (file.isFile() && file.name.endsWith('.mjs') || file.isDirectory() && file.name === 'public') {
          cpSync(path.join(from, file.name), path.join(to, file.name), { recursive: file.isDirectory() });
        }
      }
    }
    for (const [name, entry] of runtimePackages) {
      const dependency = path.join(root, name);
      if (!existsSync(dependency)) {
        if (entry.optional) continue;
        throw new Error(`缺少工作台依赖 ${name}。请先执行 npm ci。`);
      }
      cpSync(dependency, path.join(stage, name), {
        recursive: true,
        verbatimSymlinks: true,
        filter: file => file === dependency || path.basename(file) !== 'node_modules',
      });
    }
    rmSync(target, { recursive: true, force: true });
    renameSync(stage, target);
    return target;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Built ' + path.relative(repositoryRoot, buildWorkbenchRuntime()));
}
