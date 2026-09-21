# Changelog

## Unreleased

- Remove icon generation tooling; maintain the bundled Lucide-derived SVG assets directly.

- Use the same text rule syntax for online subscriptions, file imports and local editing.
- Keep large lists in paged textbox-only mode.

## 1.3.0

- Index domain lists by hostname, with up to 500,000 domains and a separate 1,000 wildcard/regex limit.
- Import domain list files up to 16 MiB; page large text editors and subscription views instead of rendering every rule.
- Reuse matcher workers and keep status refreshes independent of list size.

- Ignore full-line `#` comments in the text rule editor, including indented comments. Literal hashes within rules remain unchanged.

## 1.2.2

- Show statistics above the settings tabs and in the extension popup.

## 1.2.1

- Add single-textbox list editing and restore the statistics display.

## 1.2.0

- Add HTTPS list subscriptions with cached rules and reviewable updates.
- Add persistent list folding and bundled Lucide SVG icons.

## 1.1.0

- Start empty and paused; migrate existing settings without reactivating disabled lists.
- Fix history-gap scans, serialize cleanup, checkpoint work, and report failures.
- Add domain rules, protected-site testing, regex timeouts, and last-visit retention.
- Separate Save from cleanup; add preview and permanent-deletion confirmation.
- Redesign settings and popup with light/dark/system themes and responsive layouts.
- Add versioned settings backups, regression tests, CI, and Mozilla packaging.
- Correct the manifest's data-transmission declaration to `none`.

## 1.0

Initial local extension with pattern lists, exclusions, age cleanup, and statistics.
