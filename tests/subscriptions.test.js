import test from "node:test";
import assert from "node:assert/strict";
import {
  Subscriptions,
  parseList,
  subscriptionUrl,
  ruleChanges,
  MAX_LIST_BYTES,
  subscriptionPermission,
} from "../extension/shared/subscriptions.js";
import {
  defaults,
  validateSettings,
  parseBackup,
} from "../extension/shared/settings.js";
import { parseRuleText } from "../extension/shared/rule-text.js";

test("online lists use the text editor syntax", () => {
  assert.deepEqual(
    parseList("# comment\nexample.com\nexample.com\n! comment").rules,
    [{ type: "wildcard", value: "example.com" }],
  );
  const text =
    "# comment\n! comment\ndomain: example.com\n*example.com/path*\nre: foo.*\n/bar/\n^https://example\\.com\nregex: test\nwildcard: *track*";
  assert.deepEqual(parseList(text).rules, parseRuleText(text));
  assert.equal(
    parseList(
      JSON.stringify({
        version: 1,
        name: "List",
        rules: [{ type: "wildcard", value: "*example.com/path*" }],
      }),
    ).name,
    "List",
  );
  for (const text of [
    "regex: [",
    "domain: invalid/domain",
    "",
    "{bad",
    '{"version":2,"rules":[]}',
    "a".repeat(MAX_LIST_BYTES + 1),
  ])
    assert.throws(() => parseList(text));
});
test("subscription URLs reject non-HTTPS, credentials and fragments", () => {
  assert.equal(
    subscriptionPermission("https://example.com:8443/list"),
    "https://example.com/*",
  );
  for (const url of [
    "http://example.com/list",
    "https://user:pass@example.com/list",
    "https://example.com/list#x",
    "file:///list",
  ])
    assert.throws(() => subscriptionUrl(url));
  assert.equal(
    subscriptionUrl("https://example.com/list"),
    "https://example.com/list",
  );
});

test("daily checks skip recent checks but catch up after a restart", async () => {
  let requests = 0;
  const { manager } = fixture(async () => {
    requests++;
    return new Response("example.com");
  });
  const lists = [{ id: "a", sourceUrl: "https://example.com/list", rules: [] }];
  await manager.check(lists, undefined, true);
  assert.equal(requests, 1);
  await manager.check(lists, undefined, true);
  assert.equal(requests, 1);
  manager.now = () => 86400001 + 123;
  await manager.check(lists, undefined, true);
  assert.equal(requests, 2);
});
test("subscription metadata and cached rules survive validation and backup", () => {
  const settings = validateSettings({
    ...defaults(),
    lists: [
      {
        id: "a",
        name: "List",
        enabled: true,
        sourceUrl: "https://example.com/list",
        rules: [{ type: "domain", value: "example.com" }],
      },
    ],
  });
  assert.equal(
    parseBackup(JSON.stringify({ version: 2, settings })).lists[0].sourceUrl,
    settings.lists[0].sourceUrl,
  );
});
test("diff uses rule type and value and ignores reordering", () => {
  const a = { type: "domain", value: "example.com" };
  const b = { type: "wildcard", value: "example.com" };
  assert.deepEqual(ruleChanges([a], [b]), { added: [b], removed: [a] });
  assert.deepEqual(ruleChanges([a, b], [b, a]), { added: [], removed: [] });
});
function fixture(fetcher, allowed = true) {
  const data = {};
  return {
    data,
    manager: new Subscriptions({
      storage: {
        get: async () => structuredClone(data),
        set: async (x) => Object.assign(data, structuredClone(x)),
      },
      permissions: { contains: async () => allowed },
      fetcher,
      now: () => 123,
    }),
  };
}
test("downloads omit credentials, refuse redirects and require host permission", async () => {
  const { manager } = fixture(async (url, options) => {
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.referrerPolicy, "no-referrer");
    return new Response("example.com");
  });
  assert.equal(
    (await manager.fetchList("https://example.com/list")).rules.length,
    1,
  );
  const denied = fixture(() => {
    throw new Error("Must not fetch");
  }, false);
  await assert.rejects(
    denied.manager.fetchList("https://example.com/list"),
    /Allow access/,
  );
});
test("checks stage candidates without mutating active rules; errors keep cached rules", async () => {
  let fail = false;
  const { manager, data } = fixture(async () => {
    if (fail) throw new Error("Offline");
    return new Response("new.example.com");
  });
  const lists = [
    {
      id: "a",
      sourceUrl: "https://example.com/list",
      rules: [{ type: "domain", value: "old.example.com" }],
    },
  ];
  const before = structuredClone(lists);
  await manager.check(lists);
  assert.equal(
    data.subscriptionChecks.a.candidate.rules[0].value,
    "new.example.com",
  );
  assert.deepEqual(lists, before);
  fail = true;
  await manager.check(lists);
  assert.equal(data.subscriptionChecks.a.error, "Offline");
  assert.deepEqual(lists, before);
});
test("download body limit is enforced even without content length", async () => {
  const { manager } = fixture(
    async () => new Response("a".repeat(MAX_LIST_BYTES + 1)),
  );
  await assert.rejects(manager.fetchList("https://example.com/list"), /16 MiB/);
});
