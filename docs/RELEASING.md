# Release Ghostly to Mozilla Add-ons

## Prepare

1. Use the MIT license from `LICENSE.md` and the repository issue tracker as the support URL. Preserve the bundled Lucide ISC attribution.
2. Update both `package.json` and `extension/manifest.json` versions; preserve `ghostly@extensions.invalid` as the add-on ID. Firefox treats a different add-on ID as a separate extension.
3. Update the changelog.
4. Run `npm ci --ignore-scripts`, then `npm run package`.
5. Complete `docs/TESTING.md` in a disposable Firefox profile, including an upgrade from 1.0 with synthetic rules. Test the declared minimum Firefox version separately before advertising compatibility.
6. Inspect the generated ZIP inventory. `manifest.json` must be at archive root. Only files from `extension/` belong in the upload. No source backup, preview adapter, screenshots, tests, dependencies, or credentials.

## Upload

Upload `artifacts/ghostly-<version>.zip` at [Mozilla's developer hub](https://addons.mozilla.org/developers/). Choose a listed extension for public AMO distribution or unlisted for self-distribution. This build produces an unsigned upload ZIP; Mozilla signs accepted submissions. Do not rename an unsigned ZIP and treat it as a signed release.

Supply the listing copy, original icons, screenshots, privacy statement and reviewer notes. The bundled code is readable, unminified JavaScript with no compilation step. If Mozilla asks for source, provide the repository source and lockfile with these build commands. If bundling/minification is added later, follow Mozilla's source-code submission requirements and provide reproducible instructions.

History is processed locally. Optional subscriptions request HTTPS list URLs; list hosts receive the request and IP address, but no browsing history. Review the manifest declaration and privacy statement against Mozilla requirements before submission.

After approval, download and smoke-test the signed artifact. Keep the exact uploaded ZIP, SHA-256 file, version tag and release notes together. Bump the version for a correction; do not silently replace a published release.

## CI

The GitHub workflow runs checks and builds an artifact for pushes and pull requests. Pushing a matching `v<version>` tag additionally creates a **draft GitHub release** containing the checked artifact. It never submits to AMO automatically. No AMO credentials are needed. The owner reviews and publishes any draft release.

The pinned `image-size` override updates a vulnerable transitive development dependency used by Mozilla's linter. Keep it until the parent dependency adopts a patched version. The library is never included in the extension.

References: [packaging](https://extensionworkshop.com/documentation/publish/package-your-extension/), [submission](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), [source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/).
