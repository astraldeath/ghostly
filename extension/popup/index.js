import {
  $,
  request,
  applyTheme,
  statusLabel,
  showMessage,
  renderStats,
} from "../shared/ui.js";
let state;
let pending = false;
let enableRevision;
async function refresh() {
  state = await request("getState");
  applyTheme(state.settings.theme);
  renderStats(state.stats);
  const label = statusLabel(state);
  $("status-pill").textContent = label;
  $("status-pill").dataset.status = label;
  $("toggle").setAttribute("aria-checked", String(!state.settings.paused));
  $("toggle").title = state.settings.paused
    ? "Enable automatic cleanup"
    : "Pause automatic cleanup";
  $("toggle").disabled = pending;
  if (state.job.state === "error") showMessage(state.job.error, true);
}
async function openSettings(preview = false) {
  if (preview)
    await browser.tabs.create({
      url: browser.runtime.getURL("options/index.html#preview"),
    });
  else await browser.runtime.openOptionsPage();
  window.close();
}
$("settings").addEventListener("click", () =>
  openSettings().catch((e) => showMessage(e.message, true)),
);
$("brand-link").addEventListener("click", (e) => {
  e.preventDefault();
  openSettings().catch((e) => showMessage(e.message, true));
});
$("preview").addEventListener("click", () =>
  openSettings(true).catch((e) => showMessage(e.message, true)),
);
async function setPaused(paused, revision) {
  if (pending) return;
  pending = true;
  try {
    $("toggle").disabled = true;
    await request("setPaused", { paused, revision });
    await refresh();
  } catch (e) {
    showMessage(e.message, true);
  } finally {
    pending = false;
    $("toggle").disabled = false;
  }
}
$("toggle").addEventListener("click", () => {
  if (state.settings.paused) {
    enableRevision = state.settings.revision;
    $("confirm-dialog").showModal();
  } else setPaused(true, state.settings.revision);
});
$("cancel").addEventListener("click", () => $("confirm-dialog").close());
$("enable").addEventListener("click", () => {
  $("confirm-dialog").close();
  setPaused(false, enableRevision);
});
refresh().catch((e) => showMessage(e.message, true));
setInterval(() => {
  if (!pending) refresh().catch((e) => showMessage(e.message, true));
}, 3000);
