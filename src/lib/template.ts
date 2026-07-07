// Pure template helpers (no deps) — checked by scripts/check-template.mjs
export function fillTemplate(content: string, vars: Record<string, string | null | undefined>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null || v === "" ? `[${key.replace(/_/g, " ").toUpperCase()}]` : String(v);
  });
}

export function missingVariables(content: string, vars: Record<string, string | null | undefined>): string[] {
  const needed = [...content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return [...new Set(needed.filter((k) => vars[k] == null || vars[k] === ""))];
}
