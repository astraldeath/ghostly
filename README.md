# Ghostly

A Firefox extension for removing history with domain, wildcard, and regex rules. Includes protected sites, retention, online list subscriptions, and a preview before manual deletion. History is processed locally.

## Develop

Use Node 24 (minimum 22.16) and Firefox 142 or later.

```sh
npm ci --ignore-scripts
npm run dev
```

`web-ext run` uses a disposable Firefox profile. Never point development runs at your personal browser profile. Load `extension/manifest.json` through `about:debugging` if you prefer manual installation.

```sh
npm test              # cleanup and settings regression tests
npm run test:firefox  # real API smoke test in a disposable headless profile
npm run check        # tests, JS lint, Mozilla lint, formatting
npm run format       # format source
npm run preview      # synthetic UI at http://127.0.0.1:4173
npm run package      # checked ZIP, checksum and file inventory in artifacts/
```

The preview uses the production UI and cleanup engine with a synthetic browser adapter. It cannot read your browser history and is never packaged. UI screenshots are in `docs/screenshots/`.

## Behavior

- New installs have no rules and start paused. Upgrades preserve legacy rules and protections but pause automation for review.
- Save edits before using them. Saving never starts a cleanup.
- Enable automation explicitly: matching new visits are removed, with a catch-up and retention scan every 15 minutes and at startup.
- Pause stops automatic deletion. Manual preview and confirmed cleanup remain available.
- Protected sites always win over rules and retention.
- Retention removes a URL and all its visits only when the most recent visit is older than the chosen age. It does not remove individual old visits from recently visited URLs.
- Manual cleanup requires a fresh preview and confirmation. The engine rechecks current history, so counts can change. There is no undo.
- Rules concern Firefox history, not cookies, cache, bookmarks, downloads, synced copies on other devices, or records held by websites or network operators.

### Rules

| Type | Example | Meaning |
| --- | --- | --- |
| Domain | `example.com` | Exact host and subdomains; does not match a URL path or `example.com.evil` |
| URL wildcard | `*example.com/search*` | Case-insensitive substring matching across the complete URL; `*` means any text |
| Advanced regex | `^https://example\.com/search` | Case-insensitive JavaScript regex, without slash delimiters or flags |

Advanced regex runs in a worker with a 1.5-second evaluation deadline. Timeouts stop the operation and report an error. Keep expressions simple. Blank/invalid rules cannot be saved. An empty list or all-disabled lists never activate fallback rules.

For large domain lists, use **Import list file**. Up to 500,000 domain rules are indexed by hostname; wildcard/regex rules have a separate 1,000-rule cap. See [limits and benchmarks](docs/LARGE-LISTS.md).

## Repository map

- `extension/shared/`: settings schema, rules, isolated matcher, UI helpers and theme.
- `extension/background/`: event handlers and serialized cleanup controller.
- `extension/options/`, `extension/popup/`: accessible vanilla JS interfaces.
- `tests/`: Node regression tests with history/storage boundary fixtures.
- `scripts/`: development preview and verified packaging.
- `docs/`: privacy, release, reviewer, backup and validation guidance.

See [release instructions](docs/RELEASING.md), [privacy statement](docs/PRIVACY.md), [reviewer notes](docs/REVIEWER-NOTES.md), and [manual checks](docs/TESTING.md).

## Limitations and recovery

Scans split dense timestamp ranges until results fit a batch. If one millisecond still exceeds the cap, cleanup stops visibly instead of silently skipping data. Completed batches are checkpointed. Restart recovery replays an incomplete batch; URLs already deleted will be absent. Counts can undercount if Firefox exits between deleting a URL and persisting its batch. Do not treat statistics as an audit log.

Invalid stored settings fail closed. Keep a settings export before upgrading. Ghostly 1.0 backups contain lists only; a full 1.1 backup also contains protections, retention and appearance. Importing replaces the editor contents, starts paused, and requires Save.

## Contributing and support

See [contributing](CONTRIBUTING.md) for development checks and the Conventional Commits workflow. Report bugs through [GitHub issues](https://github.com/astraldeath/ghostly/issues) using synthetic examples, without private browsing data.

## License

[MIT](LICENSE.md). Bundled Lucide icons retain their [ISC license](extension/assets/lucide-LICENSE.txt).
