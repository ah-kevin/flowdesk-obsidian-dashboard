export type TaskNavigationOrigin =
  | "current"
  | "parent"
  | "child"
  | "work-case";

export interface NavigationModifiers {
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export function taskNavigationLeafType(
  origin: TaskNavigationOrigin,
  modifiers?: NavigationModifiers
): false | "tab" {
  return modifiers?.metaKey || modifiers?.ctrlKey ? "tab" : false;
}
