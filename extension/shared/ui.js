export const $ = (id) => document.getElementById(id);
export async function request(type, extra = {}) {
  const response = await browser.runtime.sendMessage({ type, ...extra });
  if (!response?.ok)
    throw new Error(
      response?.error ||
        "Ghostly could not connect. Reload this page and try again.",
    );
  return response.data;
}
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}
export function renderStats(stats = {}) {
  const number = new Intl.NumberFormat();
  $("stats-deleted").textContent = number.format(stats.totalDeleted || 0);
  $("stats-runs").textContent = number.format(stats.totalRuns || 0);
  $("stats-last-count").textContent = number.format(
    stats.lastDeletedCount || 0,
  );
  const time = $("stats-last-time");
  time.textContent = stats.lastSuccessAt
    ? new Date(stats.lastSuccessAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Never";
  time.title = stats.lastSuccessAt
    ? new Date(stats.lastSuccessAt).toLocaleString()
    : "No completed cleanup yet";
}
export function statusLabel(state) {
  if (state.busy || state.job.state === "running") return "Cleaning";
  if (state.job.state === "error") return "Needs attention";
  return state.settings.paused ? "Paused" : "Active";
}
export function showMessage(message, error = false) {
  const el = $("message");
  el.textContent = message;
  el.className = `message ${error ? "error" : "success"}`;
  el.hidden = false;
}
export function element(tag, attributes = {}, text = "") {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes))
    el.setAttribute(key, value);
  el.textContent = text;
  return el;
}
export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute(
    "href",
    new URL(`../assets/lucide.svg#${name}`, import.meta.url).href,
  );
  svg.append(use);
  return svg;
}
