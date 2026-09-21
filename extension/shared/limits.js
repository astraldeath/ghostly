export const MAX_DOMAIN_RULES = 500000;
export const MAX_PATTERN_RULES = 1000;
export const MAX_LIST_BYTES = 16 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
export const MAX_EDITOR_BYTES = 64 * 1024 * 1024;
export const ROW_EDITOR_LIMIT = 200;

export function checkRuleCounts(rules, counts = { domains: 0, patterns: 0 }) {
  for (const rule of rules) {
    if (rule.type === "domain") counts.domains++;
    else counts.patterns++;
    if (counts.domains > MAX_DOMAIN_RULES)
      throw new Error("Use no more than 500000 domain rules in total.");
    if (counts.patterns > MAX_PATTERN_RULES)
      throw new Error("Use no more than 1000 wildcard/regex rules in total.");
  }
  return counts;
}
