import { compileRule } from "./rules.js";
import { parseRuleText } from "./rule-text.js";
import { checkRuleCounts, MAX_LIST_BYTES } from "./limits.js";
export { MAX_LIST_BYTES } from "./limits.js";

export function subscriptionPermission(value) {
  return `https://${new URL(subscriptionUrl(value)).hostname}/*`;
}
export function subscriptionUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid HTTPS list URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("Use an HTTPS URL without credentials or a fragment.");
  return url.href;
}
export function parseList(text) {
  if (new TextEncoder().encode(text).length > MAX_LIST_BYTES)
    throw new Error("List exceeds 16 MiB.");
  let name = "Online list";
  let rules;
  if (text.trimStart().startsWith("{")) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid list JSON.");
    }
    if (data.version !== 1 || !Array.isArray(data.rules))
      throw new Error(
        "Expected a Ghostly list with version 1 and a rules array.",
      );
    if (
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 80
    )
      throw new Error("List name must contain 1–80 characters.");
    name = data.name.trim();
    rules = data.rules;
  } else {
    rules = parseRuleText(text);
  }
  if (!rules.length) throw new Error("A list must contain at least one rule.");
  checkRuleCounts(rules);
  const unique = new Map();
  for (const rule of rules) {
    compileRule(rule);
    const clean = { type: rule.type, value: rule.value.trim() };
    unique.set(JSON.stringify(clean), clean);
  }
  return { name, rules: [...unique.values()] };
}
export function ruleChanges(before, after) {
  const key = (r) => JSON.stringify([r.type, r.value]);
  const previous = new Set(before.map(key));
  const next = new Set(after.map(key));
  return {
    added: after.filter((r) => !previous.has(key(r))),
    removed: before.filter((r) => !next.has(key(r))),
  };
}

export class Subscriptions {
  constructor({ storage, permissions, fetcher = fetch, now = Date.now }) {
    Object.assign(this, { storage, permissions, fetcher, now });
    this.busy = false;
  }
  async fetchList(value) {
    const url = subscriptionUrl(value);
    const origin = subscriptionPermission(url);
    if (!(await this.permissions.contains({ origins: [origin] })))
      throw new Error("Allow access to this list's host to check for updates.");
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await this.fetcher(url, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        cache: "no-cache",
        signal: abort.signal,
      });
      if (!response.ok)
        throw new Error(`List request failed (${response.status}).`);
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > MAX_LIST_BYTES) throw new Error("List exceeds 16 MiB.");
          chunks.push(chunk);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return {
        ...parseList(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        sourceUrl: url,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  async getStates(summary = false) {
    this.states ??=
      (await this.storage.get("subscriptionChecks")).subscriptionChecks || {};
    if (!summary) return this.states;
    return Object.fromEntries(
      Object.entries(this.states).map(([id, state]) => [
        id,
        {
          sourceUrl: state.sourceUrl,
          checkedAt: state.checkedAt,
          error: state.error,
        },
      ]),
    );
  }
  async check(lists, onlyId, dueOnly = false) {
    if (this.busy) throw new Error("List updates are already being checked.");
    this.busy = true;
    try {
      const previous = await this.getStates();
      const states = {};
      for (const list of lists.filter((x) => x.sourceUrl)) {
        if (
          (onlyId && list.id !== onlyId) ||
          (dueOnly &&
            previous[list.id]?.sourceUrl === list.sourceUrl &&
            this.now() - previous[list.id].checkedAt < 86400000)
        ) {
          if (previous[list.id]) states[list.id] = previous[list.id];
          continue;
        }
        try {
          const candidate = await this.fetchList(list.sourceUrl);
          states[list.id] = {
            sourceUrl: list.sourceUrl,
            checkedAt: this.now(),
            candidate,
          };
        } catch (error) {
          states[list.id] = {
            sourceUrl: list.sourceUrl,
            checkedAt: this.now(),
            error: error.message,
          };
        }
      }
      await this.storage.set({ subscriptionChecks: states });
      this.states = states;
      return states;
    } finally {
      this.busy = false;
    }
  }
}
