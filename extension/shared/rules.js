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
  const exclusions = settings.exclusions.map(compileRule);
  const lists = settings.lists
    .filter((x) => x.enabled)
    .map((list) => ({ name: list.name, rules: list.rules.map(compileRule) }));
  return {
    explain(url) {
      if (exclusions.some((match) => match(url)))
        return { matched: false, excluded: true, list: null };
      const list = lists.find((x) => x.rules.some((match) => match(url)));
      return { matched: !!list, excluded: false, list: list?.name ?? null };
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
