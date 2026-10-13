export interface ParsedReferenceText {
  target: string;
  label: string | null;
  syntax: "raw" | "wiki" | "markdown";
  error: string | null;
}

/** Split display text from file identity once, shared by presentation and navigation. */
export function parseReferenceText(raw: string): ParsedReferenceText {
  const text = raw.trim();
  const result = (target: string, label: string | null, syntax: ParsedReferenceText["syntax"], error: string | null = null): ParsedReferenceText => ({target, label, syntax, error});
  const wiki = text.match(/^\[\[([^\]]+)\]\]$/);
  if (wiki) {
    const separator = wiki[1].indexOf("|");
    return result(separator < 0 ? wiki[1] : wiki[1].slice(0, separator), separator < 0 ? null : wiki[1].slice(separator + 1).trim() || null, "wiki");
  }
  const markdown = text.match(/^\[([\s\S]*)\]\(([\s\S]+)\)$/);
  if (markdown) {
    let target = markdown[2].trim();
    if (target.startsWith("<") || target.endsWith(">")) {
      if (!target.startsWith("<") || !target.endsWith(">")) return result(text, markdown[1], "markdown", "引用链接语法无效");
      target = target.slice(1, -1);
    }
    return result(target, markdown[1].trim() || null, "markdown", target ? null : "引用目标为空");
  }
  // URI syntax keeps its existing outer-space normalization. Unmatched filesystem text is literal identity.
  return result(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : raw, null, "raw");
}
