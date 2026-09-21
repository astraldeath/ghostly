export function normalizeDomain(value) {
  if (typeof value !== "string" || /[/:*?#@\s]/.test(value))
    throw new Error("Enter a valid domain.");
  let host;
  try {
    host = new URL(`https://${value}`).hostname
      .toLowerCase()
      .replace(/\.$/, "");
  } catch {
    throw new Error("Enter a valid domain.");
  }
  if (
    !host.includes(".") ||
    !/^[a-z0-9.-]+$/.test(host) ||
    host.split(".").some((x) => !x || x.startsWith("-") || x.endsWith("-"))
  )
    throw new Error("Enter a valid domain.");
  return host;
}

export function compileRule(rule) {
  if (!rule || typeof rule.value !== "string")
    throw new Error("Rule must contain text.");
  const value = rule.value.trim();
  if (!value || value.length > 500)
    throw new Error("Rules must contain 1–500 characters.");
  if (rule.type === "domain") {
    if (/[/:*?#@\s]/.test(value))
      throw new Error(
        "Enter a domain such as example.com, without a URL or wildcard.",
      );
    const host = normalizeDomain(value);
    return (url) => {
      try {
        const h = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
        return h === host || h.endsWith(`.${host}`);
      } catch {
        return false;
      }
    };
  }
  if (!["wildcard", "regex"].includes(rule.type))
    throw new Error("Unknown rule type.");
  const source =
    rule.type === "regex"
      ? value
      : value
          .split("*")
          .map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*");
  let regex;
  try {
    regex = new RegExp(source, "i");
  } catch {
    throw new Error("Invalid regular expression.");
  }
  return (url) => regex.test(url);
}

export function createMatcher(settings) {
  const protectedDomains = new Set();
  const protectedPatterns = [];
  for (const rule of settings.exclusions) {
    if (rule.type === "domain")
      protectedDomains.add(normalizeDomain(rule.value.trim()));
    else protectedPatterns.push(compileRule(rule));
  }
  const domains = new Map();
  const patterns = [];
  const lists = settings.lists.filter((list) => list.enabled);
  lists.forEach((list, index) => {
    const matchers = [];
    for (const rule of list.rules) {
      if (rule.type === "domain") {
        const domain = normalizeDomain(rule.value.trim());
        if (!domains.has(domain)) domains.set(domain, index);
      } else matchers.push(compileRule(rule));
    }
    if (matchers.length) patterns.push({ index, matchers });
  });
  return {
    explain(url) {
      let host;
      try {
        host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
      } catch {
        host = "";
      }
      let first = Infinity;
      for (let suffix = host; suffix;) {
        if (protectedDomains.has(suffix))
          return { matched: false, excluded: true, list: null };
        first = Math.min(first, domains.get(suffix) ?? Infinity);
        const dot = suffix.indexOf(".");
        if (dot < 0) break;
        suffix = suffix.slice(dot + 1);
      }
      if (protectedPatterns.some((match) => match(url)))
        return { matched: false, excluded: true, list: null };
      for (const group of patterns) {
        if (group.index >= first) break;
        if (group.matchers.some((match) => match(url))) {
          first = group.index;
          break;
        }
      }
      return {
        matched: first !== Infinity,
        excluded: false,
        list: lists[first]?.name ?? null,
      };
    },
  };
}

export function legacyRule(value) {
  if (typeof value !== "string") throw new Error("Rule must contain text.");
  const text = value.trim();
  if (text.startsWith("regex:"))
    return { type: "regex", value: text.slice(6).trim() };
  if (text.startsWith("re:"))
    return { type: "regex", value: text.slice(3).trim() };
  if (text.startsWith("/") && text.endsWith("/") && text.length > 2)
    return { type: "regex", value: text.slice(1, -1) };
  return { type: text.startsWith("^") ? "regex" : "wildcard", value: text };
}
