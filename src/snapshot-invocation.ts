export type SnapshotFormat = "json" | "dashboard";

export interface SnapshotInvocationInput {
  flowdeskRoot: string;
  taskPath: string;
  workingDirectory: string;
  schema: string;
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
  const args = [input.taskPath];
  if (input.apiUrl) {
    args.push("--api-url", input.apiUrl);
  }
  args.push(
    "--working-directory",
    input.workingDirectory,
    "--schema",
    input.schema,
    "--format",
    format
  );
  return {
    executable: path.join(
      input.flowdeskRoot,
      "bin",
      "flowdesk-execution-snapshot"
    ),
    args,
    cwd: input.flowdeskRoot,
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
import * as path from "path";
