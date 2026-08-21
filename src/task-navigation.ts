export type TaskNavigationOrigin =
  | "current"
  | "parent"
  | "child"
  | "work-case";

export function taskNavigationLeafType(
  origin: TaskNavigationOrigin
): false | "tab" {
  return origin === "current" ? false : "tab";
}
