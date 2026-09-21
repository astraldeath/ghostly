import { compileRule, legacyRule } from "./rules.js";
import { checkRuleCounts, MAX_EDITOR_BYTES } from "./limits.js";

export function formatRuleText(rules) {
  return rules.map((rule) => `${rule.type}: ${rule.value}`).join("\n");
}

export function parseRuleText(text) {
  if (new TextEncoder().encode(text).length > MAX_EDITOR_BYTES)
    throw new Error("Editor text exceeds 64 MiB.");
  const rules = [];
  const counts = { domains: 0, patterns: 0 };
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const value = line.trim();
    if (!value || value.startsWith("#") || value.startsWith("!")) continue;
    const explicit = /^(domain|wildcard|regex):\s*(.*)$/.exec(value);
    const rule = explicit
      ? { type: explicit[1], value: explicit[2].trim() }
      : legacyRule(value);
    try {
      compileRule(rule);
    } catch (error) {
      throw new Error(`Line ${index + 1}: ${error.message}`);
    }
    rules.push(rule);
    checkRuleCounts([rule], counts);
  }
  return rules;
}
