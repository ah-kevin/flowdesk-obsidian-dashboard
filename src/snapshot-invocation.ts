import * as path from "path";

export type SnapshotFormat = "json" | "dashboard";

export interface SnapshotInvocationInput {
  flowdeskRoot: string;
  taskPath: string;
  workingDirectory: string;
  vaultPath: string;
  apiUrl: string;
}

export interface SnapshotInvocation {
  executable: string;
  args: string[];
  cwd: string;
}

export function buildSnapshotInvocation(
  input: SnapshotInvocationInput,
  format: SnapshotFormat
): SnapshotInvocation {
  const flowdeskRoot = path.resolve(input.flowdeskRoot);
  const workingDirectory = path.isAbsolute(input.workingDirectory)
    ? input.workingDirectory
    : path.resolve(flowdeskRoot, input.workingDirectory);
  const args = [input.taskPath];
  if (input.apiUrl) {
    args.push("--api-url", input.apiUrl);
  }
  args.push("--vault", path.resolve(input.vaultPath));
  args.push(
    "--working-directory",
    workingDirectory,
    "--format",
    format
  );
  return {
    executable: path.join(
      flowdeskRoot,
      "bin",
      "flowdesk-execution-snapshot"
    ),
    args,
    cwd: flowdeskRoot,
  };
}

export function formatShellCommand(invocation: SnapshotInvocation): string {
  return [invocation.executable, ...invocation.args].map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
