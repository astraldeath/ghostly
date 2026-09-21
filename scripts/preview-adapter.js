// Development only: this file is outside the extension package.
import { CleanupController } from "/background/engine.js";
import { isolatedMatcher } from "/shared/isolated-matcher.js";
import { Subscriptions } from "/shared/subscriptions.js";
const seed = {
  settings: {
    version: 2,
    revision: 0,
    paused: true,
    theme: "light",
    retentionDays: 30,
    lists: [
      {
        id: "demo-1",
        name: "Tracking",
        enabled: true,
        rules: [
          { type: "domain", value: "news.example.com" },
          { type: "wildcard", value: "*example.com/redirect*" },
        ],
      },
      {
        id: "demo-2",
        name: "Shopping",
        enabled: false,
        rules: [{ type: "domain", value: "shop.example.com" }],
      },
    ],
    exclusions: [{ type: "domain", value: "work.example.com" }],
  },
  stats: {
    totalDeleted: 1248,
    totalRuns: 12,
    lastDeletedCount: 23,
    lastSuccessAt: Date.now() - 3600000,
  },
};
let data;
try {
  data = JSON.parse(localStorage.getItem("ghostly-preview")) || seed;
} catch {
  data = seed;
}
const storage = {
  get: async () => structuredClone(data),
  set: async (values) => {
    Object.assign(data, structuredClone(values));
    localStorage.setItem("ghostly-preview", JSON.stringify(data));
  },
};
const now = Date.now();
let historyItems = [
  { url: "https://news.example.com/a-long-read", lastVisitTime: now - 5000 },
  {
    url: "https://example.com/redirect?from=newsletter",
    lastVisitTime: now - 6000,
  },
  {
    url: "https://archive.example.com/last-spring",
    lastVisitTime: now - 60 * 86400000,
  },
  {
    url: "https://work.example.com/project-notes",
    lastVisitTime: now - 90 * 86400000,
  },
];
const history = {
  search: async ({ startTime, endTime, maxResults }) =>
    historyItems
      .filter((x) => x.lastVisitTime >= startTime && x.lastVisitTime <= endTime)
      .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
      .slice(0, maxResults),
  getVisits: async ({ url }) =>
    historyItems
      .filter((x) => x.url === url)
      .map((x) => ({ visitTime: x.lastVisitTime })),
  deleteUrl: async ({ url }) => {
    historyItems = historyItems.filter((x) => x.url !== url);
  },
};
const controller = new CleanupController({
  history,
  storage,
  matcherFactory: isolatedMatcher,
});
await controller.initialize();
const permissions = { contains: async () => true, request: async () => true };
const subscriptions = new Subscriptions({
  storage,
  permissions,
  fetcher: async () =>
    new Response(
      JSON.stringify({
        version: 1,
        name: "Example subscription",
        rules: [
          { type: "domain", value: "news.example.com" },
          { type: "domain", value: "shop.example.com" },
        ],
      }),
    ),
});
globalThis.browser = {
  permissions,
  runtime: {
    sendMessage: async (message) => {
      try {
        let result;
        switch (message.type) {
          case "getStatus":
            result = controller.getStatus();
            break;
          case "getSubscriptions":
            result = await subscriptions.getStates(message.summary);
            break;
          case "fetchSubscription":
            result = await subscriptions.fetchList(message.url);
            break;
          case "checkSubscription":
            result = await subscriptions.check(
              controller.settings.lists,
              message.id,
            );
            break;
          case "getState":
            result = controller.getState();
            break;
          case "getRecoveryBackup":
            result = controller.getRecoveryBackup();
            break;
          case "saveSettings":
            result = await controller.saveSettings(message.settings);
            break;
          case "setPaused":
            result = await controller.setPaused(
              message.paused,
              message.revision,
            );
            break;
          case "preview":
            result = await controller.preview(message.mode);
            break;
          case "clean":
            result = await controller.clean(message.token);
            break;
          default:
            throw new Error("Unknown preview request.");
        }
        return { ok: true, data: result };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    openOptionsPage: async () => {
      location.href = "/options/index.html";
    },
    getURL: (path) => `/${path}`,
  },
  tabs: {
    create: async ({ url }) => {
      location.href = url;
    },
  },
};
