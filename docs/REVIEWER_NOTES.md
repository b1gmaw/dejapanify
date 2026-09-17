# Build instructions for add-on reviewers

These notes accompany the source-code submission required for
`addons.mozilla.org`. The extension is bundled with [esbuild], so the uploaded
`content.js`, `popup/popup.js` and `options/options.js` are generated files. The
steps below reproduce them **byte for byte** from the submitted source.

[esbuild]: https://esbuild.github.io/

> **There is no `manifest.json` in the source archive, and that is expected.**
> The manifest is generated per browser target by `scripts/build.mjs`, because
> Chromium and Firefox need different keys from otherwise identical input. It
> appears in the build output — `dist/firefox/manifest.json` — after running the
> two commands below. The source archive is not an installable extension.

## Environment

| | |
|---|---|
| Operating system | Ubuntu 24.04 (any Linux x64 works) |
| Node.js | 24.x — see `.nvmrc` |
| npm | 10 or newer |

No other tools, downloads or network services are needed. Every build
dependency is open source and installs from the public npm registry; the exact
versions are pinned in the committed `package-lock.json`.

**The extension itself has no dependencies at all.** `package.json` declares an
empty `dependencies` block — esbuild, TypeScript, Vitest, jsdom and web-ext are
build and test tooling only. Nothing from `node_modules` is bundled into the
shipped package; every line in `dist/` comes from `src/`.

If npm reports that esbuild's install script was blocked, the build still works
and the output is unaffected: esbuild ships its platform binary as an
`optionalDependencies` package, and the `postinstall` script is only a fallback
for environments where that resolution fails.

## Commands

```bash
npm ci          # installs the exact pinned dependency tree
npm run build   # writes dist/chrome/ and dist/firefox/
```

The submitted package corresponds to **`dist/firefox/`**.

To produce the uploaded archives:

```bash
npm run package         # the extension packages
npm run source-archive  # this source archive
```

## Why the output is reproducible

The build is deterministic by construction, so a rebuild can be diffed directly
against the uploaded package:

- **esbuild is version-pinned** in `package-lock.json`. Its output depends on
  the esbuild version rather than on the Node version, so any Node 20+ runtime
  produces identical bundles.
- **No timestamps, hashes or build IDs** are embedded in the output. Nothing in
  the build reads the clock, the environment or the git state.
- **The archive writer is deterministic** (`scripts/zip.mjs`): entries are
  sorted by name and every timestamp is pinned to the ZIP epoch
  (1980-01-01), so the same input always yields the same bytes. It is a plain
  Node implementation over `node:zlib` — no `zip` binary is required.

You can confirm this locally:

```bash
npm run package && sha256sum web-ext-artifacts/*.zip
npm run package && sha256sum web-ext-artifacts/*.zip   # identical
```

## Verifying the extension

```bash
npm test            # 126 unit and integration tests
npm run typecheck   # tsc --noEmit
npm run lint:ext    # web-ext lint (0 errors, 0 warnings)
```

## What the extension does

It converts text typed into Japanese web forms between half-width (半角) and
full-width (全角) so that a field which demands one form is not rejected for
containing the other. All logic is local:

- **No network access.** There is no `fetch`, `XMLHttpRequest`, `WebSocket` or
  remote script anywhere in the source. The extension requests no host
  permissions beyond its content script.
- **No data collection.** Declared as `data_collection_permissions: { required:
  ["none"] }`. Nothing is transmitted, logged or persisted except the user's own
  settings via `storage`.
- **No remote code.** Everything executed is in the submitted package.

The `storage` permission holds only user preferences (which conversions are
enabled, per-site block/allow lists). The content script matches `<all_urls>`
because Japanese sites are not confined to a single domain; it takes no action
unless a page looks Japanese and a field's own attributes or printed
instructions identify the width it requires. See `src/core/detect.ts`.

## Source map

| Path | Role |
|---|---|
| `src/core/` | Pure conversion and detection logic, no DOM access |
| `src/content/` | Content script: field discovery, conversion, undo chip |
| `src/shared/` | Cross-browser storage wrapper |
| `src/popup/`, `src/options/` | Extension UI |
| `scripts/build.mjs` | esbuild bundling and manifest generation |
| `scripts/zip.mjs` | Deterministic ZIP writer |
| `scripts/make-icons.mjs` | Generates the PNG icons from code |
