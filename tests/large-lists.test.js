import test from "node:test";
import assert from "node:assert/strict";
import { createMatcher, compileRule } from "../extension/shared/rules.js";
import { defaults, validateSettings } from "../extension/shared/settings.js";
import { parseList } from "../extension/shared/subscriptions.js";
import { checkRuleCounts } from "../extension/shared/limits.js";
import {
  formatRuleText,
  parseRuleText,
} from "../extension/shared/rule-text.js";

test("indexed domains match the reference matcher and preserve list priority", () => {
  const settings = {
    ...defaults(),
    exclusions: [
      { type: "domain", value: "keep.example.com" },
      { type: "wildcard", value: "*protected*" },
    ],
    lists: [
      {
        name: "First",
        enabled: true,
        rules: [
          { type: "wildcard", value: "*special*" },
          { type: "domain", value: "example.com" },
        ],
      },
      {
        name: "Second",
        enabled: true,
        rules: [
          { type: "domain", value: "sub.example.com" },
          { type: "domain", value: "bücher.de" },
        ],
      },
      {
        name: "Disabled",
        enabled: false,
        rules: [{ type: "domain", value: "disabled.test" }],
      },
    ],
  };
  const matcher = createMatcher(settings);
  for (const url of [
    "https://sub.example.com",
    "https://KEEP.example.com/a",
    "https://example.com.evil.test",
    "https://unlisted.test/special",
    "https://example.com/protected",
    "https://bücher.de",
    "https://EXAMPLE.COM./",
    "https://disabled.test",
    "bad-url",
  ]) {
    const excluded = settings.exclusions.some((rule) => compileRule(rule)(url));
    const list = excluded
      ? null
      : settings.lists.find(
          (list) =>
            list.enabled && list.rules.some((rule) => compileRule(rule)(url)),
        );
    assert.deepEqual(
      matcher.explain(url),
      { matched: !!list, excluded, list: list?.name ?? null },
      url,
    );
  }
});
test("large domain lists are accepted while expensive rules have a separate cap", () => {
  const rules = Array.from({ length: 5000 }, (_, i) => ({
    type: "domain",
    value: `site${i}.example.com`,
  }));
  const settings = {
    ...defaults(),
    lists: [{ id: "large", name: "Large", enabled: true, rules }],
  };
  assert.equal(validateSettings(settings).lists[0].rules.length, 5000);
  assert.equal(
    createMatcher(settings).explain("https://sub.site4999.example.com").matched,
    true,
  );
  assert.throws(
    () => checkRuleCounts(Array(1001).fill({ type: "regex", value: ".*" })),
    /1000 wildcard\/regex/,
  );
  assert.throws(
    () =>
      checkRuleCounts(
        Array(500001).fill({ type: "domain", value: "example.com" }),
      ),
    /500000 domain/,
  );
  assert.throws(
    () =>
      validateSettings({
        ...settings,
        lists: [
          ...settings.lists,
          {
            id: "patterns",
            name: "Patterns",
            enabled: false,
            rules: Array(1001).fill({ type: "wildcard", value: "*" }),
          },
        ],
      }),
    /1000 wildcard\/regex/,
  );
});
test("list files accept explicit domain prefixes and attribution comments", () => {
  assert.deepEqual(
    parseList("# attribution\ndomain:example.com\nplain.example.com").rules,
    [
      { type: "domain", value: "example.com" },
      { type: "wildcard", value: "plain.example.com" },
    ],
  );
});

test("formatted domain text can exceed the download cap without rejecting valid rules", () => {
  const rules = Array(450000).fill({
    type: "domain",
    value: "a".repeat(27) + ".com",
  });
  const text = formatRuleText(rules);
  assert.ok(new TextEncoder().encode(text).length > 16 * 1024 * 1024);
  assert.equal(parseRuleText(text).length, rules.length);
});
