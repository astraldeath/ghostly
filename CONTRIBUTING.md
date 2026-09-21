# Contributing

Run `npm ci --ignore-scripts` with Node 24, then `npm run check` before submitting changes. Use `npm run test:firefox` when changing Firefox API integration, and test UI changes with `npm run preview` using synthetic data.

Use Conventional Commits, such as `feat: add a list format`, `fix: preserve protected history`, or `docs: clarify setup`. After the initial commit, keep changes in focused, incremental commits. Do not rewrite published history unless explicitly agreed with the maintainer.

Report bugs through the repository's issue tracker with the Firefox version, Ghostly version, and a synthetic reproduction. Do not include browsing history, private rules, or credentials.
