# Validation and release smoke tests

## Automated

Run `npm run check` and `npm run package`. Node fixtures exercise the real matching/settings/controller code with browser history and storage boundaries replaced by controlled local data. They do not prove every Firefox lifecycle or history API behavior.

Run `npm run test:firefox` for a headless, disposable-profile smoke test against actual history APIs, extension messaging and worker matching. Set `FIREFOX_BINARY` if Firefox is installed outside its standard location. The report is saved to `artifacts/firefox-smoke-result.json`. This command never accepts a personal profile.

## Browser UI

Run `npm run preview`. This serves the production UI on localhost with a development-only synthetic history adapter. Confirm:

- Rule tester identifies a protected URL, a matching domain and a nonmatch.
- Domain matching ignores unrelated paths and suffix lookalikes.
- Save does not change deletion counts. Discard restores saved edits.
- Preview reports three matches in the default fixture and protects `work.example.com`.
- Cleanup requires confirmation; Cancel keeps the preview intact.
- Invalid regex and invalid retention display persistent errors.
- Import leaves edits unsaved and pauses automation on save.
- Keyboard navigation reaches controls; Escape closes dialogs.
- Dark, light and narrow layouts remain readable without horizontal overflow.
- Popup shows state and opens the settings/preview route.

Screenshots in `docs/screenshots/` use synthetic data. Do not upload screenshots of a personal browsing history.

## Real Firefox — disposable profile only

Run `npm run dev`; do not supply your normal Firefox profile.

1. Install: settings should be empty and paused. Add a domain list and save.
2. Visit the matching site while paused: it should stay in history.
3. Preview and confirm: only matching, unprotected URLs should disappear.
4. Protect the domain, enable automation, revisit: history must remain.
5. Remove protection, save, revisit: new matching visits should disappear.
6. Disable all lists and revisit: history must remain (retention off).
7. Enable retention; test an old URL and the same URL revisited recently. Only stale URLs should be selected.
8. Restart Firefox during a large synthetic cleanup; verify safe resumption and an honest completion/error state.
9. Upgrade from 1.0 with synthetic rules/exclusions. Rules must migrate and automation must be paused.
10. Test Firefox 142 minimum and the current release; also test the signed build after AMO acceptance.

Counters are aggregate best-effort metrics. A browser shutdown between deletion and checkpoint may undercount; Ghostly never stores a history audit log.
