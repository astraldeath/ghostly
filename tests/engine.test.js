import { test } from "node:test";
import assert from "node:assert/strict";
import { CleanupController } from "../extension/background/engine.js";
import { defaults } from "../extension/shared/settings.js";

const NOW = 1800000000000;
function fixture(items = [], overrides = {}) {
  const data = {};
  const removed = [];
  let searches = 0;
  const history = {
    search: async ({ startTime, endTime, maxResults }) => {
      searches++;
      return items
        .filter(
          (x) =>
            !removed.includes(x.url) &&
            (x.visits || [x.lastVisitTime]).some(
              (time) => time >= startTime && time <= endTime,
            ),
        )
        .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
        .slice(0, maxResults);
    },
    getVisits: async ({ url }) =>
      items
        .filter((x) => x.url === url)
        .map((x) => ({ visitTime: x.lastVisitTime })),
    deleteUrl: async ({ url }) => {
      removed.push(url);
    },
    ...overrides,
  };
  const storage = {
    get: async () => structuredClone(data),
    set: async (values) => Object.assign(data, structuredClone(values)),
  };
  const controller = new CleanupController({
    history,
    storage,
    now: () => NOW,
    batchSize: 3,
  });
  return { controller, data, removed, searches: () => searches };
}
function settings() {
  return {
    ...defaults(),
    paused: false,
    lists: [
      {
        id: "a",
        name: "Trackers",
        enabled: true,
        rules: [{ type: "wildcard", value: "*tracking*" }],
      },
    ],
  };
}
async function setup(f, s = settings()) {
  await f.controller.initialize();
  await f.controller.saveSettings(s);
}

test("disabled lists delete nothing even with legacy-like rules", async () => {
  const f = fixture([
    { url: "https://tracking.test", lastVisitTime: NOW - 100 },
  ]);
  const s = settings();
  s.lists[0].enabled = false;
  await setup(f, s);
  await f.controller.run({ mode: "patterns" });
  assert.deepEqual(f.removed, []);
});
test("full scan crosses empty days and preview never deletes", async () => {
  const f = fixture([
    { url: "https://tracking.test", lastVisitTime: NOW - 7 * 86400000 },
  ]);
  await setup(f);
  const preview = await f.controller.preview("patterns");
  assert.equal(preview.count, 1);
  assert.deepEqual(f.removed, []);
  await f.controller.clean(preview.token);
  assert.deepEqual(f.removed, ["https://tracking.test"]);
  assert.equal(f.data.stats.totalDeleted, 1);
});
test("empty age cleanup finishes with one search", async () => {
  const f = fixture();
  await setup(f, { ...settings(), retentionDays: 30 });
  await f.controller.run({ mode: "age" });
  assert.equal(f.searches(), 1);
});
test("range splitting visits dense history without missing entries or exclusions", async () => {
  const items = Array.from({ length: 9 }, (_, i) => ({
    url: `https://tracking.test/${i}`,
    lastVisitTime: NOW - i * 1000,
  }));
  const f = fixture(items);
  const s = settings();
  s.exclusions = [{ type: "wildcard", value: "*/4" }];
  await setup(f, s);
  await f.controller.run({ mode: "patterns" });
  assert.equal(f.removed.length, 8);
  assert.ok(!f.removed.includes("https://tracking.test/4"));
});
test("saturated identical timestamps report an error instead of silently skipping", async () => {
  const f = fixture(
    Array.from({ length: 4 }, (_, i) => ({
      url: `https://tracking.test/${i}`,
      lastVisitTime: 5,
    })),
  );
  await setup(f);
  await assert.rejects(f.controller.run({ mode: "patterns" }), /timestamp/i);
  assert.equal(f.data.job.state, "error");
});
test("age removal rechecks recent visits and protects boundary", async () => {
  const cutoff = NOW - 30 * 86400000;
  const f = fixture(
    [
      { url: "https://old.test", lastVisitTime: cutoff - 1 },
      { url: "https://revisited.test", lastVisitTime: cutoff - 1 },
      { url: "https://boundary.test", lastVisitTime: cutoff },
    ],
    {
      getVisits: async ({ url }) => [
        { visitTime: url.includes("revisited") ? NOW : cutoff - 1 },
      ],
    },
  );
  await setup(f, { ...settings(), retentionDays: 30 });
  await f.controller.run({ mode: "age" });
  assert.deepEqual(f.removed, ["https://old.test"]);
});
test("settings save does not clean and invalidates prior preview", async () => {
  const f = fixture([{ url: "https://tracking.test", lastVisitTime: NOW }]);
  await setup(f);
  const p = await f.controller.preview("patterns");
  await f.controller.saveSettings({
    ...settings(),
    revision: f.controller.settings.revision,
  });
  assert.deepEqual(f.removed, []);
  await assert.rejects(f.controller.clean(p.token), /preview/i);
});
test("overlapping jobs are rejected and failure retains partial counts", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const f = fixture(
    [
      { url: "https://tracking.test/1", lastVisitTime: 10 },
      { url: "https://tracking.test/2", lastVisitTime: 9 },
    ],
    {
      deleteUrl: async ({ url }) => {
        await gate;
        if (url.endsWith("2")) throw new Error("Denied");
      },
    },
  );
  await setup(f);
  const job = f.controller.run({ mode: "patterns" });
  await assert.rejects(f.controller.run({ mode: "patterns" }), /already/i);
  release();
  await assert.rejects(job, /could not/i);
  assert.equal(f.data.stats.totalDeleted, 1);
  assert.equal(f.data.job.state, "error");
});
test("paused automatic cleanup leaves history untouched", async () => {
  const f = fixture([{ url: "https://tracking.test", lastVisitTime: NOW }]);
  await setup(f, { ...settings(), paused: true });
  await f.controller.run({ mode: "both", automatic: true });
  assert.deepEqual(f.removed, []);
});
test("saved pending ranges resume after background restart", async () => {
  const f = fixture([{ url: "https://tracking.test", lastVisitTime: 100 }]);
  await setup(f);
  f.data.job = {
    state: "running",
    mode: "patterns",
    revision: f.data.settings.revision,
    startedAt: NOW,
    pending: [[0, 200]],
    deleted: 0,
    scanned: 0,
    automatic: false,
  };
  await f.controller.initialize();
  await f.controller.resume();
  assert.deepEqual(f.removed, ["https://tracking.test"]);
  assert.equal(f.data.job.state, "complete");
});
test("settings change during search cancels deletion", async () => {
  let f;
  f = fixture([], {
    search: async () => {
      await f.controller.saveSettings({
        ...f.controller.settings,
        paused: true,
      });
      return [{ url: "https://tracking.test", lastVisitTime: NOW }];
    },
  });
  await setup(f);
  await assert.rejects(f.controller.run({ mode: "patterns" }), /cancelled/i);
  assert.deepEqual(f.removed, []);
});
test("new matching visits are removed once and exclusions remain safe", async () => {
  const f = fixture();
  await setup(f);
  await f.controller.visit({ url: "https://tracking.test" });
  assert.deepEqual(f.removed, ["https://tracking.test"]);
  assert.equal(f.data.stats.totalDeleted, 1);
});
test("saving protections gates visits while persistence is pending", async () => {
  const f = fixture();
  await setup(f);
  let release;
  const gate = new Promise((r) => (release = r));
  const original = f.controller.storage.set;
  f.controller.storage.set = async (values) => {
    await gate;
    return original(values);
  };
  const saving = f.controller.saveSettings({
    ...f.controller.settings,
    exclusions: [{ type: "domain", value: "tracking.test" }],
  });
  const visiting = f.controller.visit({ url: "https://tracking.test" });
  await Promise.resolve();
  await Promise.resolve();
  release();
  await Promise.all([saving, visiting]);
  assert.deepEqual(f.removed, []);
  await f.controller.visit({ url: "https://tracking.test" });
  assert.deepEqual(f.removed, []);
});
test("stale initial revision and stale pause intent cannot overwrite settings", async () => {
  const f = fixture();
  await setup(f);
  await assert.rejects(f.controller.saveSettings(settings()), /changed/i);
  const revision = f.controller.settings.revision;
  await f.controller.setPaused(true, revision);
  await assert.rejects(f.controller.setPaused(false, revision), /changed/i);
  assert.equal(f.controller.settings.paused, true);
});
test("failed save retains old settings and blocks concurrent saves", async () => {
  const f = fixture();
  await setup(f);
  let release;
  const gate = new Promise((r) => (release = r));
  f.controller.storage.set = async () => {
    await gate;
    throw new Error("Storage unavailable");
  };
  const before = structuredClone(f.controller.settings);
  const saving = f.controller.saveSettings({ ...before, paused: true });
  const concurrent = f.controller.saveSettings({ ...before, paused: true });
  release();
  await assert.rejects(concurrent, /saving/i);
  await assert.rejects(saving, /Storage/);
  assert.deepEqual(f.controller.settings, before);
});
test("preview deduplicates URLs returned by multiple visit ranges", async () => {
  const f = fixture([
    { url: "https://tracking.test/a", lastVisitTime: 17, visits: [3, 17] },
    { url: "https://tracking.test/b", lastVisitTime: 8, visits: [8] },
  ]);
  f.controller.now = () => 20;
  f.controller.batchSize = 1;
  await setup(f);
  const result = await f.controller.preview("patterns");
  assert.equal(result.count, 2);
  assert.equal(result.samples.length, 2);
});
test("range splitting does not lose fractional-millisecond visits", async () => {
  const f = fixture([
    { url: "https://tracking.test/a", lastVisitTime: 10, visits: [10.5] },
    { url: "https://tracking.test/b", lastVisitTime: 8, visits: [8] },
  ]);
  f.controller.now = () => 20;
  f.controller.batchSize = 1;
  await setup(f);
  const result = await f.controller.preview("patterns");
  assert.equal(result.count, 2);
});
test("invalid legacy settings remain exportable and recover without deletion", async () => {
  const f = fixture();
  f.data.patternLists = [
    { id: "old", name: "x".repeat(81), enabled: true, patterns: ["*"] },
  ];
  f.data.exclusionPatterns = ["*bank*"];
  const state = await f.controller.initialize();
  assert.equal(state.settings.paused, true);
  assert.match(state.recoveryError, /80/);
  assert.equal(
    f.controller.getRecoveryBackup().data.patternLists[0].name.length,
    81,
  );
  assert.equal(f.data.settings, undefined);
  await f.controller.saveSettings(defaults());
  assert.equal(f.controller.getState().recoveryError, null);
});
