import * as path from "path";

export interface WorkCaseSnapshotInvocationInput {
  flowdeskRoot: string;
  casePath: string;
  workingDirectory: string;
  apiUrl: string;
}

export interface WorkCaseSnapshotInvocation {
  executable: string;
  args: string[];
  cwd: string;
}

export function buildWorkCaseSnapshotInvocation(
  input: WorkCaseSnapshotInvocationInput
): WorkCaseSnapshotInvocation {
  const flowdeskRoot = path.resolve(input.flowdeskRoot);
  const workingDirectory = path.resolve(input.workingDirectory);
  const args = [input.casePath];
  if (input.apiUrl) args.push("--api-url", input.apiUrl);
  args.push("--working-directory", workingDirectory, "--format", "json");
  return {
    executable: path.join(flowdeskRoot, "bin", "flowdesk-work-case-snapshot"),
    args,
    cwd: flowdeskRoot,
  };
}

export function formatWorkCaseShellCommand(
  invocation: WorkCaseSnapshotInvocation
): string {
  return [invocation.executable, ...invocation.args].map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
