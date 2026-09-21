import { CleanupController } from "./engine.js";
import { isolatedMatcher } from "../shared/isolated-matcher.js";
import { Subscriptions } from "../shared/subscriptions.js";
const subscriptions = new Subscriptions({
  storage: browser.storage.local,
  permissions: browser.permissions,
});

const controller = new CleanupController({
  history: browser.history,
  storage: browser.storage.local,
  matcherFactory: isolatedMatcher,
});
const ready = controller.initialize();
// Keep rejected initialization observable through messages, without an unhandled rejection.
ready.catch(() => {});

async function report(error) {
  if (controller.busy) return;
  controller.job = { state: "error", error: error.message };
  await browser.storage.local.set({ job: controller.job });
}
async function schedule() {
  await browser.alarms.create("ghostly-subscriptions", {
    periodInMinutes: 60,
  });
  await browser.alarms.create("ghostly-cleanup", { periodInMinutes: 15 });
  await browser.alarms.create("ghostly-resume", { periodInMinutes: 1 });
}
browser.runtime.onInstalled.addListener(() => {
  ready
    .then(schedule)
    .then(() => browser.runtime.openOptionsPage())
    .catch(report);
});
browser.runtime.onStartup.addListener(() => {
  ready
    .then(() => subscriptions.check(controller.settings.lists, undefined, true))
    .catch(() => {});
  ready
    .then(schedule)
    .then(() => controller.resume())
    .then(() => controller.run({ automatic: true }))
    .catch(report);
});
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "ghostly-subscriptions") {
    ready
      .then(() =>
        subscriptions.check(controller.settings.lists, undefined, true),
      )
      .catch(() => {});
    return;
  }
  if (!["ghostly-cleanup", "ghostly-resume"].includes(alarm.name)) return;
  ready
    .then(async () => {
      if (controller.busy) return;
      if (controller.job.state === "running") return controller.resume();
      if (alarm.name === "ghostly-cleanup")
        return controller.run({ automatic: true });
    })
    .catch(report);
});
browser.history.onVisited.addListener((item) => {
  ready.then(() => controller.visit(item)).catch(report);
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id) return false;
  return ready
    .then(async () => {
      switch (message?.type) {
        case "getStatus":
          return controller.getStatus();
        case "fetchSubscription":
          return subscriptions.fetchList(message.url);
        case "getSubscriptions":
          return subscriptions.getStates(message.summary);
        case "checkSubscription":
          return subscriptions.check(controller.settings.lists, message.id);
        case "getState":
          return controller.getState();
        case "getRecoveryBackup":
          return controller.getRecoveryBackup();
        case "saveSettings":
          return controller.saveSettings(message.settings);
        case "setPaused":
          return controller.setPaused(message.paused, message.revision);
        case "preview":
          return controller.preview(message.mode);
        case "clean":
          return controller.clean(message.token);
        default:
          throw new Error("Unknown request.");
      }
    })
    .then(
      (data) => ({ ok: true, data }),
      (error) => ({ ok: false, error: error.message }),
    );
});
