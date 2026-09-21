import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRuleText,
  parseRuleText,
} from "../extension/shared/rule-text.js";

test("text editor ignores full-line comments without stripping literal hashes", () => {
  assert.deepEqual(
    parseRuleText(
      "# comment\n  # regex: [\n*example.com/#section*\nregex: foo#bar\n",
    ),
    [
      { type: "wildcard", value: "*example.com/#section*" },
      { type: "regex", value: "foo#bar" },
    ],
  );
  assert.deepEqual(parseRuleText("# only comments\n  # another"), []);
  assert.throws(() => parseRuleText("# comment\n\nregex: ["), /Line 3/);
});

test("text editor roundtrip preserves every rule type and literal prefix", () => {
  const rules = [
    { type: "domain", value: "example.com" },
    { type: "wildcard", value: "regex:literal*" },
    { type: "regex", value: "^https://example\\.com/path$" },
  ];
  assert.deepEqual(parseRuleText(formatRuleText(rules)), rules);
});
test("text editor accepts old patterns and explicit domains", () => {
  assert.deepEqual(
    parseRuleText(
      " example.com \r\n\n*tracking*\nre: foo.*\n/bar/\ndomain: safe.example.com",
    ),
    [
      { type: "wildcard", value: "example.com" },
      { type: "wildcard", value: "*tracking*" },
      { type: "regex", value: "foo.*" },
      { type: "regex", value: "bar" },
      { type: "domain", value: "safe.example.com" },
    ],
  );
});
test("invalid lines fail with their line number without silently dropping rules", () => {
  assert.throws(() => parseRuleText("\nexample.com\nregex: ["), /Line 3/);
  assert.throws(() => parseRuleText("domain:"), /Line 1/);
  assert.throws(() => parseRuleText("domain: https://example.com"), /Line 1/);
  assert.throws(
    () => parseRuleText(Array(1001).fill("example.com").join("\n")),
    /1000/,
  );
  assert.deepEqual(parseRuleText("\n  \n"), []);
});
