import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import webExt from "web-ext";

// web-ext creates a new disposable profile; no personal profile is accepted.
const sourceDir = path.resolve(".local-backup/firefox-smoke-" + randomUUID());
await mkdir(sourceDir, { recursive: true });
await cp("extension", sourceDir, { recursive: true });
let resolveResult;
const result = new Promise((resolve) => {
  resolveResult = resolve;
});
const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  let body = "";
  for await (const part of req) {
    body += part;
    if (body.length > 10000) {
      res.writeHead(413);
      res.end();
      return;
    }
  }
  try {
    resolveResult(JSON.parse(body));
    res.end("ok");
  } catch {
    res.writeHead(400);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const manifest = JSON.parse(
  await readFile(path.join(sourceDir, "manifest.json"), "utf8"),
);
manifest.browser_specific_settings.gecko.id = "ghostly-smoke@local.invalid";
manifest.host_permissions = [`http://127.0.0.1/*`];
manifest.options_ui.page = "smoke.html";
await writeFile(
  path.join(sourceDir, "manifest.json"),
  JSON.stringify(manifest),
);
await writeFile(
  path.join(sourceDir, "smoke.html"),
  '<!doctype html><html><head><meta charset="utf-8"><title>Ghostly disposable-profile smoke test</title><script type="module" src="smoke.js"></script></head><body>Testing synthetic history in a disposable Firefox profile.</body></html>',
);
const smoke = async function (reportUrl) {
  const checks = [];
  const assert = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const call = async (type, extra = {}) => {
    const r = await browser.runtime.sendMessage({ type, ...extra });
    if (!r?.ok) throw new Error(r?.error || "No background response");
    return r.data;
  };
  try {
    const initial = await call("getState");
    assert(
      Object.keys(await call("getSubscriptions")).length === 0,
      "subscription state starts empty",
    );
    const permissionDenied = await browser.runtime.sendMessage({
      type: "fetchSubscription",
      url: "https://example.com/list.txt",
    });
    assert(
      !permissionDenied.ok && permissionDenied.error.includes("Allow access"),
      "subscription fetch requires Firefox host permission",
    );
    assert(
      initial.settings.paused && initial.settings.lists.length === 0,
      "fresh install empty and paused",
    );
    const settings = {
      ...initial.settings,
      lists: [
        {
          id: "smoke",
          name: "Synthetic",
          enabled: true,
          rules: [{ type: "domain", value: "ghostly-test.invalid" }],
        },
      ],
      exclusions: [{ type: "domain", value: "keep.ghostly-test.invalid" }],
    };
    await call("saveSettings", { settings });
    await browser.history.addUrl({
      url: "https://ghostly-test.invalid/remove",
    });
    await browser.history.addUrl({
      url: "https://keep.ghostly-test.invalid/keep",
    });
    const preview = await call("preview", { mode: "patterns" });
    assert(
      preview.count === 1,
      "preview uses real Firefox history and worker matcher",
    );
    const before = await browser.history.search({
      text: "ghostly-test.invalid",
      startTime: 0,
    });
    assert(before.length === 2, "preview does not delete");
    const clean = await call("clean", { token: preview.token });
    assert(clean.count === 1, "confirmed cleanup removes one synthetic URL");
    const after = await browser.history.search({
      text: "ghostly-test.invalid",
      startTime: 0,
    });
    assert(
      after.length === 1 && after[0].url.includes("keep."),
      "exclusion survives actual deleteUrl",
    );
    const state = await call("getState");
    assert(
      state.stats.totalDeleted === 1 && state.job.state === "complete",
      "completion and stats persist",
    );
    await fetch(reportUrl, {
      method: "POST",
      body: JSON.stringify({ ok: true, checks, firefox: navigator.userAgent }),
    });
  } catch (error) {
    await fetch(reportUrl, {
      method: "POST",
      body: JSON.stringify({ ok: false, checks, error: error.message }),
    });
  }
};
await writeFile(
  path.join(sourceDir, "smoke.js"),
  `(${smoke.toString()})(${JSON.stringify(`http://127.0.0.1:${port}`)});`,
);
let runner;
let timeout;
try {
  runner = await webExt.cmd.run(
    {
      sourceDir,
      artifactsDir: path.resolve("artifacts"),
      firefox:
        process.env.FIREFOX_BINARY ||
        (process.platform === "win32"
          ? "C:/Program Files/Mozilla Firefox/firefox.exe"
          : "firefox"),
      noReload: true,
      noInput: true,
      args: ["-headless"],
    },
    { shouldExitProgram: false },
  );
  const outcome = await Promise.race([
    result,
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Firefox smoke report timed out")),
        45000,
      );
    }),
  ]);
  console.log(JSON.stringify(outcome, null, 2));
  await writeFile(
    "artifacts/firefox-smoke-result.json",
    JSON.stringify(outcome, null, 2),
  );
  if (!outcome.ok) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  let exitTimer;
  const stopped = runner
    ? new Promise((resolve) => {
        runner.registerCleanup(resolve);
        exitTimer = setTimeout(resolve, 10000);
      })
    : Promise.resolve();
  await runner?.exit();
  await stopped;
  clearTimeout(exitTimer);
  server.closeAllConnections();
  server.close();
}
// web-ext's debugging socket can retain a timer after Firefox exits.
process.exit(process.exitCode || 0);
