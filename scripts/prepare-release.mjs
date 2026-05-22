import { spawnSync } from "node:child_process";

const steps = [
  ["npm", ["run", "build"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "check:syntax"]],
  ["npm", ["run", "release:verify"]],
  ["npm", ["run", "release:package"]],
];

for (const [command, args] of steps) {
  const label = [command, ...args].join(" ");
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
