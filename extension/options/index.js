import {
  defaults,
  parseBackup,
  validateSettings,
  MAX_BACKUP_BYTES,
} from "../shared/settings.js";
import { isolatedMatcher } from "../shared/isolated-matcher.js";
import { formatRuleText, parseRuleText } from "../shared/rule-text.js";
import {
  subscriptionUrl,
  subscriptionPermission,
  ruleChanges,
} from "../shared/subscriptions.js";
import {
  $,
  request,
  applyTheme,
  showMessage,
  element,
  statusLabel,
  icon,
  renderStats,
} from "../shared/ui.js";

let state;
let dirty = false;
let previewToken = null;
let actionBusy = false;
let importedPaused;
let editorRevision = 0;
let editVersion = 0;
let subscriptionStates = {};
const subscriptionViews = new Map();

function subscriptionView(list, rules) {
  const box = element("div", { class: "subscription-info" });
  const source = element(
    "p",
    { class: "help subscription-source" },
    list.sourceUrl,
  );
  const status = element("p", { class: "help", role: "status" });
  const check = element(
    "button",
    { type: "button", class: "small-button" },
    "Check for updates",
  );
  const review = element("div");
  box.append(source, status, check, review);
  const render = () => {
    const latest = subscriptionStates[list.id];
    const update = latest?.sourceUrl === list.sourceUrl ? latest : null;
    const changes = update?.candidate
      ? ruleChanges(readRules(rules), update.candidate.rules)
      : null;
    review.replaceChildren();
    status.textContent = update?.error
      ? `Update failed: ${update.error} Saved rules are unchanged.`
      : update
        ? `Checked ${new Date(update.checkedAt).toLocaleString()}.`
        : "Saved rules work offline. Updates require review.";
    if (!changes || (!changes.added.length && !changes.removed.length)) return;
    const details = element("details");
    details.append(
      element(
        "summary",
        {},
        `${changes.added.length} added, ${changes.removed.length} removed`,
      ),
    );
    const entries = element("ul", { class: "subscription-diff" });
    for (const [label, items] of [
      ["Add", changes.added],
      ["Remove", changes.removed],
    ])
      for (const rule of items)
        entries.append(
          element("li", {}, `${label}: ${rule.type} — ${rule.value}`),
        );
    details.append(entries);
    const apply = element(
      "button",
      { type: "button", class: "small-button" },
      "Use update",
    );
    apply.addEventListener("click", () => {
      rules.replaceChildren(
        ...update.candidate.rules.map((rule) => ruleRow(rule)),
      );
      for (const control of rules.querySelectorAll("input, select, button"))
        control.disabled = true;
      markDirty();
      render();
      showMessage(
        "Update staged. Save to apply. Enabled rules can permanently delete matching history.",
      );
    });
    review.append(
      details,
      element(
        "p",
        { class: "help" },
        "Review the changes before applying. Enabled rules can permanently delete matching history.",
      ),
      apply,
    );
  };
  check.addEventListener("click", () => {
    if (dirty) {
      showMessage("Save or discard edits before checking for updates.", true);
      return;
    }
    const permission = browser.permissions.request({
      origins: [subscriptionPermission(list.sourceUrl)],
    });
    act(check, async () => {
      if (!(await permission)) throw new Error("Host access was not granted.");
      subscriptionStates = await request("checkSubscription", { id: list.id });
      render();
    });
  });
  subscriptionViews.set(list.id, render);
  render();
  return box;
}

function markDirty() {
  editVersion++;
  dirty = true;
  previewToken = null;
  $("clean-button").disabled = true;
  $("save").disabled = false;
  $("discard").disabled = false;
  $("savebar").hidden = false;
  $("save-note").textContent = "Unsaved changes";
  $("preview-results").hidden = true;
}
function ruleRow(rule = { type: "domain", value: "" }, exclusion = false) {
  const row = element("div", { class: "rule-row" });
  const type = element("select", {
    "aria-label": exclusion ? "Protection type" : "Rule type",
  });
  for (const [value, label] of [
    ["domain", "Domain"],
    ["wildcard", "Wildcard"],
    ["regex", "Regex"],
  ])
    type.append(element("option", { value }, label));
  type.value = rule.type;
  const input = element("input", {
    type: "text",
    "aria-label": exclusion ? "Protected site or pattern" : "Site or pattern",
    placeholder: "example.com",
    maxlength: "500",
    spellcheck: "false",
  });
  input.value = rule.value;
  const remove = element("button", {
    type: "button",
    class: "icon-button",
    "aria-label": exclusion ? "Remove protected site" : "Remove rule",
    title: exclusion ? "Remove protected site" : "Remove rule",
  });
  remove.append(icon("x"));
  remove.addEventListener("click", () => {
    row.remove();
    markDirty();
  });
  const hint = () => {
    input.placeholder =
      type.value === "domain"
        ? "example.com"
        : type.value === "wildcard"
          ? "*example.com/path*"
          : "^https://example\\.com/";
  };
  type.addEventListener("change", () => {
    hint();
    markDirty();
  });
  input.addEventListener("input", markDirty);
  hint();
  row.append(type, input, remove);
  return row;
}
function listCard(
  list = {
    id: crypto.randomUUID(),
    name: "New list",
    enabled: true,
    rules: [{ type: "domain", value: "" }],
  },
) {
  const card = element("article", {
    class: "card list-card",
    "data-list-id": list.id,
  });
  if (list.sourceUrl) card.dataset.sourceUrl = list.sourceUrl;
  const header = element("div", { class: "list-header" });
  const name = element("input", {
    class: "list-name",
    "aria-label": "List name",
    maxlength: "80",
  });
  name.value = list.name;
  name.addEventListener("input", markDirty);
  const enabled = element("input", { type: "checkbox" });
  enabled.checked = list.enabled;
  enabled.addEventListener("change", markDirty);
  const label = element("label", { class: "check" });
  label.append(enabled, document.createTextNode("Enabled"));
  header.append(name, label);
  const rules = element("div", { class: "rules" });
  list.rules.forEach((rule) => rules.append(ruleRow(rule)));
  const footer = element("div", { class: "list-footer row between" });
  const add = element("button", { class: "text-button" }, "Add rule");
  add.prepend(icon("plus"));
  add.addEventListener("click", () => {
    rules.append(ruleRow());
    markDirty();
    rules.lastElementChild.querySelector("input").focus();
  });
  const remove = element("button", {
    class: "icon-button",
    "aria-label": "Remove list",
    title: "Remove list",
  });
  remove.append(icon("trash-2"));
  remove.addEventListener("click", () => {
    card.remove();
    markDirty();
    renderEmpty();
  });
  header.append(remove);
  footer.append(add);
  const body = element("div", { id: `list-body-${crypto.randomUUID()}` });
  body.append(rules, footer);
  if (!list.sourceUrl) {
    const modeKey = `ghostly:editor:${list.id}`;
    const modes = element("div", {
      class: "editor-modes",
      role: "group",
      "aria-label": "List editor mode",
    });
    const rowsMode = element(
      "button",
      { type: "button", class: "small-button" },
      "Rows",
    );
    const textMode = element(
      "button",
      { type: "button", class: "small-button" },
      "Text",
    );
    const textPanel = element("div");
    const helpId = `text-help-${crypto.randomUUID()}`;
    const textarea = element("textarea", {
      class: "rule-text",
      rows: "8",
      spellcheck: "false",
      "aria-label": "List rules",
      "aria-describedby": helpId,
      placeholder: "*tracking*\ndomain: example.com\nregex: ^https://",
    });
    textarea.value = formatRuleText(list.rules);
    textarea.addEventListener("input", markDirty);
    textPanel.append(
      textarea,
      element(
        "p",
        { id: helpId, class: "help" },
        "One rule per line; lines starting with # are ignored. Plain text matches anywhere in a URL; * matches any text. Use domain: for sites or regex: for regular expressions.",
      ),
    );
    const setMode = (mode) => {
      if (mode === "rows" && card.dataset.editorMode === "text") {
        let parsed;
        try {
          parsed = parseRuleText(textarea.value);
        } catch (error) {
          showMessage(`${name.value}: ${error.message}`, true);
          textarea.focus();
          return;
        }
        rules.replaceChildren(...parsed.map((rule) => ruleRow(rule)));
      } else if (mode === "text" && card.dataset.editorMode !== "text") {
        textarea.value = formatRuleText(readRules(rules));
      }
      card.dataset.editorMode = mode;
      rules.hidden = mode === "text";
      footer.hidden = mode === "text";
      textPanel.hidden = mode !== "text";
      rowsMode.setAttribute("aria-pressed", String(mode === "rows"));
      textMode.setAttribute("aria-pressed", String(mode === "text"));
      try {
        localStorage.setItem(modeKey, mode);
      } catch {
        /* Preference only. */
      }
    };
    rowsMode.addEventListener("click", () => setMode("rows"));
    textMode.addEventListener("click", () => setMode("text"));
    modes.append(rowsMode, textMode);
    body.prepend(modes);
    body.append(textPanel);
    let preferred = "rows";
    try {
      preferred = localStorage.getItem(modeKey) || "rows";
    } catch {
      /* Default to rows. */
    }
    setMode(preferred === "text" ? "text" : "rows");
  }
  if (list.sourceUrl) {
    footer.hidden = true;
    for (const control of rules.querySelectorAll("input, select, button"))
      control.disabled = true;
    body.prepend(subscriptionView(list, rules));
  }
  const fold = element("button", {
    type: "button",
    class: "icon-button list-fold",
    "aria-controls": body.id,
  });
  fold.append(icon("chevron-down"));
  const foldKey = `ghostly:folded:${list.id}`;
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(foldKey) === "true";
  } catch {
    // Folding still works when UI preference storage is unavailable.
  }
  const renderFold = () => {
    body.hidden = collapsed;
    card.classList.toggle("is-collapsed", collapsed);
    fold.setAttribute("aria-expanded", String(!collapsed));
    const description = `${collapsed ? "Expand" : "Collapse"} ${name.value || "list"}`;
    fold.setAttribute("aria-label", description);
    fold.title = description;
  };
  fold.addEventListener("click", () => {
    collapsed = !collapsed;
    renderFold();
    try {
      localStorage.setItem(foldKey, String(collapsed));
    } catch {
      // This preference does not affect saved cleanup settings.
    }
  });
  name.addEventListener("input", renderFold);
  renderFold();
  header.prepend(fold);
  card.append(header, body);
  return card;
}
function renderEmpty() {
  $("lists").querySelector(".empty")?.remove();
  if ($("lists").querySelector(".list-card")) return;
  const empty = element("div", { class: "empty" });
  empty.append(
    element("h3", {}, "No rules yet"),
    element("p", { class: "help" }, "Add sites or patterns to a list."),
  );
  const add = element("button", { class: "primary" }, "Add list");
  add.prepend(icon("plus"));
  add.addEventListener("click", addList);
  empty.append(add);
  $("lists").append(empty);
}
function addList() {
  $("lists").querySelector(".empty")?.remove();
  const card = listCard();
  $("lists").append(card);
  markDirty();
  card.querySelector("input").focus();
}
function readRules(container) {
  return [...container.querySelectorAll(".rule-row")].map((row) => ({
    type: row.querySelector("select").value,
    value: row.querySelector("input").value.trim(),
  }));
}
function readEditor() {
  return validateSettings({
    ...state.settings,
    revision: editorRevision,
    paused: importedPaused ?? state.settings.paused,
    theme: $("theme").value,
    retentionDays: $("retention-enabled").checked
      ? Number($("retention-days").value)
      : 0,
    lists: [...$("lists").querySelectorAll(".list-card")].map((card) => ({
      id: card.dataset.listId,
      name: card.querySelector(".list-name").value.trim(),
      enabled: card.querySelector("[type=checkbox]").checked,
      ...(card.dataset.sourceUrl ? { sourceUrl: card.dataset.sourceUrl } : {}),
      rules:
        card.dataset.editorMode === "text"
          ? parseRuleText(card.querySelector(".rule-text").value)
          : readRules(card.querySelector(".rules")),
    })),
    exclusions: readRules($("exclusions")),
  });
}
function renderEditor(settings) {
  subscriptionViews.clear();
  editorRevision = settings.revision;
  $("lists").replaceChildren(...settings.lists.map(listCard));
  renderEmpty();
  $("exclusions").replaceChildren(
    ...settings.exclusions.map((rule) => ruleRow(rule, true)),
  );
  $("retention-enabled").checked = settings.retentionDays > 0;
  $("retention-days").value = settings.retentionDays || 30;
  $("retention-days").disabled = !settings.retentionDays;
  $("theme").value = settings.theme;
  applyTheme(settings.theme);
}
function renderSummary() {
  renderStats(state.stats);
  const label = statusLabel(state);
  $("status-pill").textContent = label;
  $("status-pill").dataset.status = label;
  $("toggle").setAttribute("aria-checked", String(!state.settings.paused));
  $("toggle").title = state.settings.paused
    ? "Enable automatic cleanup"
    : "Pause automatic cleanup";
  $("toggle").disabled = actionBusy;
  $("preview-button").disabled = actionBusy || state.busy;
  if (state.job.state === "error") showMessage(state.job.error, true);
  if (state.recoveryError)
    showMessage(
      `Settings need repair: ${state.recoveryError} Export a recovery backup from Settings. Automation is paused.`,
      true,
    );
  const exportLabel = state.recoveryError ? "Export recovery backup" : "Export";
  if ($("export").textContent.trim() !== exportLabel)
    $("export").replaceChildren(
      icon("download"),
      document.createTextNode(exportLabel),
    );
}
function navigate(name) {
  if (name === "exclusions" || name === "retention") {
    $(
      name === "exclusions" ? "protected-disclosure" : "retention-disclosure",
    ).open = true;
    name = "rules";
  }
  if (!$(`panel-${name}`)) name = "rules";
  document
    .querySelectorAll(".panel-section")
    .forEach((el) => (el.hidden = el.id !== `panel-${name}`));
  document.querySelectorAll("[data-panel]").forEach((el) => {
    if (el.dataset.panel === name) {
      el.setAttribute("aria-current", "page");
    } else el.removeAttribute("aria-current");
  });
  history.replaceState(null, "", `#${name}`);
}
function confirmAction(title, copy, accept = "Continue") {
  $("confirm-title").textContent = title;
  $("confirm-copy").textContent = copy;
  $("confirm-accept").textContent = accept;
  return new Promise((resolve) => {
    const dialog = $("confirm-dialog");
    dialog.returnValue = "cancel";
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "accept"),
      { once: true },
    );
    dialog.showModal();
    $("confirm-cancel").focus();
  });
}
$("confirm-cancel").addEventListener("click", () =>
  $("confirm-dialog").close("cancel"),
);
$("confirm-accept").addEventListener("click", () =>
  $("confirm-dialog").close("accept"),
);
async function act(button, fn) {
  if (actionBusy) return;
  actionBusy = true;
  button.disabled = true;
  try {
    await fn();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    actionBusy = false;
    button.disabled = false;
    if (state) renderSummary();
  }
}

document
  .querySelectorAll("[data-panel]")
  .forEach((button) =>
    button.addEventListener("click", () => navigate(button.dataset.panel)),
  );
window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
$("add-list").addEventListener("click", addList);
$("add-exclusion").addEventListener("click", () => {
  $("exclusions").append(ruleRow(undefined, true));
  markDirty();
  $("exclusions").lastElementChild.querySelector("input").focus();
});
$("theme").addEventListener("change", () => {
  applyTheme($("theme").value);
  markDirty();
});
$("retention-enabled").addEventListener("change", () => {
  $("retention-days").disabled = !$("retention-enabled").checked;
  markDirty();
});
$("retention-days").addEventListener("input", markDirty);
$("save").addEventListener("click", () =>
  act($("save"), async () => {
    if (
      state.recoveryError &&
      !(await confirmAction(
        "Replace settings that need recovery?",
        "Export a recovery backup first if you have not already. Saving replaces the settings that could not be loaded with the editor contents. Automation stays paused.",
        "Save repaired settings",
      ))
    )
      return;
    const savedEditVersion = editVersion;
    state = await request("saveSettings", { settings: readEditor() });
    editorRevision = state.settings.revision;
    if (savedEditVersion !== editVersion) return;
    dirty = false;
    $("savebar").hidden = true;
    importedPaused = undefined;
    renderEditor(state.settings);
    $("discard").disabled = true;
    $("save-note").textContent = "Saved";
    $("message").hidden = true;
  }).then(() => {
    $("save").disabled = !dirty;
  }),
);
$("discard").addEventListener("click", () => {
  renderEditor(state.settings);
  dirty = false;
  $("savebar").hidden = true;
  importedPaused = undefined;
  $("save").disabled = true;
  $("discard").disabled = true;
  $("save-note").textContent = "Saved";
  $("message").hidden = true;
});
$("toggle").addEventListener("click", () =>
  act($("toggle"), async () => {
    if (dirty)
      throw new Error("Save or discard your edits before changing automation.");
    if (
      state.settings.paused &&
      !(await confirmAction(
        "Enable automatic cleanup?",
        "Deletes matching new visits immediately and runs saved rules and retention every 15 minutes. Deletion is permanent.",
        "Enable",
      ))
    )
      return;
    state = await request("setPaused", {
      paused: !state.settings.paused,
      revision: state.settings.revision,
    });
    renderEditor(state.settings);
    previewToken = null;
    $("preview-results").hidden = true;
    $("message").hidden = true;
  }),
);
$("test-rule").addEventListener("click", () =>
  act($("test-rule"), async () => {
    const url = $("test-url").value;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Enter a full URL, including https://.");
    }
    if (!["https:", "http:"].includes(parsed.protocol))
      throw new Error("Enter an HTTP or HTTPS URL.");
    const matcher = isolatedMatcher(readEditor());
    try {
      const match = await matcher.explain(url);
      $("test-result").textContent = match.excluded
        ? "Protected. This URL is kept."
        : match.matched
          ? `Matches ${match.list}.`
          : "No rule matches. Retention may still apply.";
    } finally {
      matcher.dispose();
    }
  }),
);
$("preview-button").addEventListener("click", () =>
  act($("preview-button"), async () => {
    if (dirty) throw new Error("Save your changes before previewing.");
    $("preview-help").textContent = "Checking history...";
    $("preview-results").hidden = true;
    previewToken = null;
    const previewEditVersion = editVersion;
    const mode = $("preview-mode").value;
    $("preview-mode").disabled = true;
    let result;
    try {
      result = await request("preview", { mode });
    } finally {
      $("preview-mode").disabled = false;
    }
    if (
      previewEditVersion !== editVersion ||
      mode !== $("preview-mode").value
    ) {
      $("preview-help").textContent =
        "Settings changed. Save and preview again.";
      return;
    }
    previewToken = result.token;
    $("preview-count").textContent = new Intl.NumberFormat().format(
      result.count,
    );
    $("preview-detail").textContent =
      `${result.scanned} URLs checked${result.count > result.samples.length ? `; first ${result.samples.length} matches shown` : ""}.`;
    $("preview-list").replaceChildren(
      ...result.samples.map((sample) => {
        const li = element("li", {}, sample.url);
        li.append(element("span", {}, sample.reason));
        return li;
      }),
    );
    $("preview-results").hidden = false;
    $("clean-button").disabled = !result.count;
    $("preview-help").textContent = "";
  }),
);
$("preview-mode").addEventListener("change", () => {
  previewToken = null;
  $("preview-results").hidden = true;
});
$("clean-button").addEventListener("click", () =>
  act($("clean-button"), async () => {
    if (!previewToken) throw new Error("Preview again before deleting.");
    if (
      !(await confirmAction(
        "Delete matching history?",
        "Removes all visits to currently matching URLs. This cannot be undone.",
        "Delete",
      ))
    )
      return;
    const token = previewToken;
    previewToken = null;
    showMessage("Cleaning history...");
    $("status-pill").textContent = "Cleaning";
    const result = await request("clean", { token });
    state = await request("getState");
    $("preview-results").hidden = true;
    showMessage(`${result.count} URLs removed.`);
  }),
);
$("export").addEventListener("click", () =>
  act($("export"), async () => {
    const payload = state.recoveryError
      ? await request("getRecoveryBackup")
      : { version: 2, settings: readEditor() };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = element("a", {
      href: url,
      download: state.recoveryError
        ? "ghostly-recovery.json"
        : "ghostly-settings.json",
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showMessage(
      state.recoveryError
        ? "Exported your original settings for recovery."
        : "Settings exported.",
    );
  }),
);
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", () =>
  act($("import"), async () => {
    const file = $("import-file").files[0];
    $("import-file").value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES)
      throw new Error("Backup is too large (maximum 1 MB).");
    const text = await file.text();
    const imported = parseBackup(text);
    renderEditor(imported);
    editorRevision = state.settings.revision;
    importedPaused = true;
    markDirty();
    showMessage(
      "Imported. Review and save to apply. Automation will be paused.",
    );
  }),
);
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});

$("subscribe").addEventListener("click", () => {
  let url;
  try {
    url = subscriptionUrl($("subscription-url").value);
  } catch (error) {
    showMessage(error.message, true);
    return;
  }
  const permission = browser.permissions.request({
    origins: [subscriptionPermission(url)],
  });
  act($("subscribe"), async () => {
    if (!(await permission)) throw new Error("Host access was not granted.");
    const downloaded = await request("fetchSubscription", { url });
    if (
      [...$("lists").querySelectorAll(".list-card")].some(
        (card) => card.dataset.sourceUrl === downloaded.sourceUrl,
      )
    )
      throw new Error("This list is already added.");
    $("lists").querySelector(".empty")?.remove();
    const card = listCard({
      ...downloaded,
      id: crypto.randomUUID(),
      enabled: false,
    });
    $("lists").append(card);
    markDirty();
    $("subscription-url").value = "";
    showMessage(
      "List loaded and disabled. Review its rules, enable it when ready, then save.",
    );
  });
});

async function refresh() {
  const checks = await request("getSubscriptions");
  if (JSON.stringify(checks) !== JSON.stringify(subscriptionStates)) {
    subscriptionStates = checks;
    for (const render of subscriptionViews.values()) render();
  }
  const next = await request("getState");
  if (state && next.settings.revision !== state.settings.revision) {
    previewToken = null;
    $("preview-results").hidden = true;
    if (!dirty) renderEditor(next.settings);
    else
      showMessage(
        "Settings changed in another window. Discard edits to load them, or review before saving.",
        true,
      );
  }
  state = next;
  renderSummary();
}
try {
  subscriptionStates = await request("getSubscriptions");
  state = await request("getState");
  renderEditor(state.settings);
  renderSummary();
  navigate(location.hash.slice(1));
  setInterval(() => {
    if (!actionBusy)
      refresh().catch((error) => showMessage(error.message, true));
  }, 3000);
} catch (error) {
  state = {
    settings: defaults(),
    stats: { totalDeleted: 0 },
    job: { state: "error" },
  };
  showMessage(error.message, true);
}
