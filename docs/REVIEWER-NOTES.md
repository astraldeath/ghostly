# AMO reviewer notes

Ghostly processes history locally. No login or paid account is required. Required permissions are history, storage and alarms. Optional HTTPS host permissions allow fetching user-added list subscriptions. No remote code is executed. Settings open in a tab.

Test in a disposable Firefox profile. On install, Ghostly is paused with no rules. Add a list with a Domain rule for `example.com`, save it, and visit `https://example.com/`. Open Preview cleanup, choose Rules only, and preview. Confirm removal to delete the matching URL from that test profile. Add `example.com` under Protected sites and repeat; it must not be selected.

Saving does not delete history. Enabling automation explicitly authorizes immediate matching-visit deletion and 15-minute scheduled cleanup. Retention uses a URL's most recent visit and removes all visits only if older than the configured limit. All protections override both mechanisms.

Regex matching runs in a local module worker with a timeout. The script is included in the package. Settings and aggregate statistics are stored locally; temporary previews stay in memory.

Package: Node 24, `npm ci --ignore-scripts`, `npm run package`. Output is a ZIP whose root contains `manifest.json`. JavaScript, HTML, CSS and SVG assets are shipped directly from `extension/`, without compilation, minification, templating or asset generation. The packaging script verifies each archived file byte-for-byte against its source. Lucide-derived SVG assets are maintained directly in the repository with their upstream ISC license. Development tooling outside `extension/` is not distributed.
