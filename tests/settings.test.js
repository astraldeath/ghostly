import { test } from "node:test";
import assert from "node:assert/strict";
import {
  migrateSettings,
  validateSettings,
  parseBackup,
} from "../extension/shared/settings.js";
import { compileRule, createMatcher } from "../extension/shared/rules.js";

test("fresh install starts empty and paused", () => {
  const s = migrateSettings({});
  assert.equal(s.paused, true);
  assert.deepEqual(s.lists, []);
});
test("explicit empty lists override legacy defaults", () => {
  assert.deepEqual(
    migrateSettings({ patternLists: [], patterns: ["*"] }).lists,
    [],
  );
});
test("disabled migrated lists stay disabled and preserve syntax", () => {
  const s = migrateSettings({
    patternLists: [
      {
        id: "a",
        name: "Old",
        enabled: false,
        patterns: ["*tracking*", "re:^https://x"],
      },
    ],
  });
  assert.equal(
    createMatcher(s).explain("https://tracking.test").matched,
    false,
  );
  assert.equal(s.lists[0].rules[1].type, "regex");
});
test("domains match the host boundary only, including subdomains", () => {
  const match = compileRule({ type: "domain", value: "example.com" });
  for (const url of ["https://example.com/a", "https://a.example.com"])
    assert.equal(match(url), true);
  for (const url of [
    "https://example.com.evil",
    "https://other.test/example.com",
    "not a URL",
  ])
    assert.equal(match(url), false);
});
test("wildcards and regex are explicit and invalid regex is rejected", () => {
  assert.equal(
    compileRule({ type: "wildcard", value: "*tracking*" })(
      "https://x.test/tracking",
    ),
    true,
  );
  assert.throws(
    () => compileRule({ type: "regex", value: "[" }),
    /regular expression/i,
  );
});
test("exclusions win over inclusion", () => {
  const s = migrateSettings({ patterns: ["*"], exclusionPatterns: ["*bank*"] });
  assert.deepEqual(createMatcher(s).explain("https://bank.test"), {
    matched: false,
    excluded: true,
    list: null,
  });
});
test("malformed imports cannot drop invalid protections or accept unsupported versions", () => {
  assert.throws(() => parseBackup('{"version":99,"lists":[]}'), /version/i);
  const s = migrateSettings({});
  s.exclusions = [{ type: "domain", value: 42 }];
  assert.throws(() => validateSettings(s), /text/i);
  assert.throws(() => parseBackup("x".repeat(64 * 1024 * 1024 + 1)), /large/i);
});
test("duplicate IDs and fractional retention are rejected", () => {
  const s = migrateSettings({ patterns: ["*x*"] });
  s.lists.push(structuredClone(s.lists[0]));
  assert.throws(() => validateSettings(s), /unique/i);
  s.lists.pop();
  s.retentionDays = 0.5;
  assert.throws(() => validateSettings(s), /whole/i);
});
test("backup roundtrip preserves protections but imports paused", () => {
  const settings = migrateSettings({
    patterns: ["*x*"],
    exclusionPatterns: ["*bank*"],
    maxAgeDays: 30,
  });
  settings.paused = false;
  const restored = parseBackup(JSON.stringify({ version: 2, settings }));
  assert.equal(restored.paused, true);
  assert.equal(restored.retentionDays, 30);
  assert.equal(restored.exclusions.length, 1);
});
