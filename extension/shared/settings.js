import { compileRule, legacyRule } from "./rules.js";
import { subscriptionUrl } from "./subscriptions.js";
import { checkRuleCounts, MAX_BACKUP_BYTES } from "./limits.js";
export { MAX_BACKUP_BYTES } from "./limits.js";

export const SCHEMA_VERSION = 2;
export function defaults() {
  return {
    version: SCHEMA_VERSION,
    revision: 0,
    paused: true,
    theme: "system",
    retentionDays: 0,
    lists: [],
    exclusions: [],
  };
}

export function validateSettings(input) {
  if (!input || input.version !== SCHEMA_VERSION)
    throw new Error("Unsupported settings version.");
  const s = structuredClone(input);
  if (typeof s.paused !== "boolean")
    throw new Error("Paused must be true or false.");
  if (!["system", "light", "dark"].includes(s.theme))
    throw new Error("Unknown theme.");
  if (
    !Number.isInteger(s.retentionDays) ||
    s.retentionDays < 0 ||
    s.retentionDays > 36500
  )
    throw new Error("Retention must be a whole number from 0 to 36500 days.");
  if (
    !Array.isArray(s.lists) ||
    s.lists.length > 100 ||
    !Array.isArray(s.exclusions) ||
    s.exclusions.length > 500
  )
    throw new Error("Too many lists or exclusions.");
  const ids = new Set();
  const counts = checkRuleCounts(s.exclusions);
  for (const list of s.lists) {
    if (!list || typeof list.id !== "string" || !list.id || ids.has(list.id))
      throw new Error("List IDs must be unique.");
    ids.add(list.id);
    if (
      typeof list.name !== "string" ||
      !list.name.trim() ||
      list.name.length > 80
    )
      throw new Error("List names must contain 1–80 characters.");
    if (typeof list.enabled !== "boolean" || !Array.isArray(list.rules))
      throw new Error("Invalid list.");
    list.name = list.name.trim();
    checkRuleCounts(list.rules, counts);
    list.rules.forEach((rule, i) => {
      try {
        compileRule(rule);
      } catch (e) {
        throw new Error(`${list.name}, rule ${i + 1}: ${e.message}`);
      }
    });
  }
  s.exclusions.forEach((rule, i) => {
    try {
      compileRule(rule);
    } catch (e) {
      throw new Error(`Exclusion ${i + 1}: ${e.message}`);
    }
  });
  return {
    version: SCHEMA_VERSION,
    revision:
      Number.isSafeInteger(s.revision) && s.revision >= 0 ? s.revision : 0,
    paused: s.paused,
    theme: s.theme,
    retentionDays: s.retentionDays,
    lists: s.lists.map((x) => ({
      id: x.id,
      name: x.name,
      enabled: x.enabled,
      ...(x.sourceUrl ? { sourceUrl: subscriptionUrl(x.sourceUrl) } : {}),
      rules: x.rules.map((r) => ({ type: r.type, value: r.value.trim() })),
    })),
    exclusions: s.exclusions.map((r) => ({
      type: r.type,
      value: r.value.trim(),
    })),
  };
}

export function migrateSettings(data) {
  if (data.settings) return validateSettings(data.settings);
  const s = defaults();
  if (Object.hasOwn(data, "patternLists")) {
    if (!Array.isArray(data.patternLists))
      throw new Error("Invalid legacy pattern lists.");
    s.lists = data.patternLists.map((x, i) => ({
      id: String(x.id || `legacy-${i}`),
      name: x.name || "Imported list",
      enabled: x.enabled === true,
      rules: (x.patterns || []).map(legacyRule),
    }));
  } else if (Array.isArray(data.regexPatterns) && data.regexPatterns.length) {
    s.lists = [
      {
        id: "legacy",
        name: "Imported rules",
        enabled: true,
        rules: data.regexPatterns.map((value) => ({ type: "regex", value })),
      },
    ];
  } else if (Array.isArray(data.patterns) && data.patterns.length) {
    s.lists = [
      {
        id: "legacy",
        name: "Imported rules",
        enabled: true,
        rules: data.patterns.map(legacyRule),
      },
    ];
  }
  if (data.exclusionPatterns !== undefined) {
    if (!Array.isArray(data.exclusionPatterns))
      throw new Error("Invalid legacy exclusions.");
    s.exclusions = data.exclusionPatterns.map(legacyRule);
  }
  s.retentionDays = data.maxAgeDays ? Math.floor(Number(data.maxAgeDays)) : 0;
  return validateSettings(s);
}

export function parseBackup(text) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > MAX_BACKUP_BYTES
  )
    throw new Error("Backup is too large (maximum 64 MiB).");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This is not valid JSON.");
  }
  if (data?.version === 2)
    return validateSettings({ ...data.settings, paused: true });
  if (data?.version === "recovery")
    return { ...migrateSettings(data.data), paused: true };
  if (data?.version === 1 && Array.isArray(data.lists))
    return migrateSettings({ patternLists: data.lists });
  throw new Error("Unsupported backup version.");
}
