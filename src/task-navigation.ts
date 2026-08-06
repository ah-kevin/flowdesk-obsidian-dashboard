export type TaskNavigationOrigin = "current" | "parent" | "child";

export function taskNavigationNewLeaf(
  origin: TaskNavigationOrigin
): boolean {
  return origin === "child";
}
