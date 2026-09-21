import { compileRule, legacyRule } from "./rules.js";

export function formatRuleText(rules) {
  return rules.map((rule) => `${rule.type}: ${rule.value}`).join("\n");
}

export function parseRuleText(text) {
  const rules = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const value = line.trim();
    if (!value) continue;
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
    if (rules.length > 1000) throw new Error("Use no more than 1000 rules.");
  }
  return rules;
}
