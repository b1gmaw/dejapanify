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

## Step-by-step build

### 1. Environment

| | |
|---|---|
| Operating system | Ubuntu 24.04 LTS (Mozilla's default review environment) |
| CPU | ARM64 or x86_64 |
| Node.js | **24.14.0** (also in `.nvmrc`) |
| npm | **11.9.0**, which ships with Node 24.14.0 |

Nothing else is needed: no system packages, no global npm installs, no
web-based tools. The only network access is `npm ci` downloading the pinned
dependencies from the public npm registry. Every build dependency is open
source, and the exact versions are pinned in the committed
`package-lock.json`.

**Tested:** Ubuntu with exactly Node 24.14.0 and npm 11.9.0, on x86_64. The
published source archive was unpacked into an empty directory and the steps
below were followed; the output matched the submitted add-on file for file.
The lockfile pins esbuild's native binary for every platform, including
`@esbuild/linux-arm64` for ARM64 builders. esbuild is designed to give the same
output on every platform, but the ARM64 build itself has not been tried.

### 2. Install Node.js 24.14.0

Skip this step if `node --version` already prints `v24.14.0`.

Using the official binary (no root needed; use `linux-x64` instead of
`linux-arm64` on x86_64):

```bash
curl -O https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-arm64.tar.xz
tar -xf node-v24.14.0-linux-arm64.tar.xz
export PATH="$PWD/node-v24.14.0-linux-arm64/bin:$PATH"
```

Or with [nvm](https://github.com/nvm-sh/nvm): `nvm install 24.14.0`.

Check both versions:

```bash
node --version   # v24.14.0
npm --version    # 11.9.0
```

### 3. Build

```bash
unzip dejapanify-<version>-source.zip -d dejapanify-src
cd dejapanify-src
npm ci          # installs the exact pinned dependency tree
npm run build   # writes dist/firefox/ and dist/chrome/
```

**`dist/firefox/` is the submitted add-on.** The build takes a few seconds.

### 4. Compare with the submitted add-on

Unpack the submitted file, then diff it against the build output:

```bash
unzip dejapanify-<version>-firefox.zip -d submitted   # the uploaded file
diff -r -x META-INF submitted dist/firefox && echo IDENTICAL
```

- **`-x META-INF`** ignores the signature folder that Mozilla adds to a signed
  add-on. The unsigned uploaded file doesn't have one, so it makes no
  difference there.
- **Compare the unpacked files, not zip checksums.** The files are identical, but
  the zip container's compressed bytes depend on the zlib library bundled with
  whichever Node build compresses them. The same files compressed by different
  Node versions can produce a different `.zip` checksum.

**The extension itself has no dependencies at all.** `package.json` declares an
empty `dependencies` block — esbuild, TypeScript, Vitest, jsdom and web-ext are
build and test tooling only. Nothing from `node_modules` is bundled into the
shipped package; every line in `dist/` comes from `src/`.

If npm reports that esbuild's install script was blocked, the build still works
and the output is unaffected: esbuild ships its platform binary as an
`optionalDependencies` package, and the `postinstall` script is only a fallback
for environments where that resolution fails.

### Producing the uploaded files

For completeness, these are the commands that made the uploaded files:

```bash
npm run package         # the extension zips, in web-ext-artifacts/
npm run source-archive  # this source archive
```

## Why the output is reproducible

The build is deterministic by construction, so a rebuild can be diffed directly
against the uploaded package:

- **esbuild is version-pinned** in `package-lock.json`. Its output depends on
  the esbuild version, not the Node version.
- **No timestamps, hashes or build IDs** are embedded in the output. Nothing in
  the build reads the clock, the environment or the git state.
- **The archive writer is deterministic** (`scripts/zip.mjs`): entries are
  sorted by name and every timestamp is pinned to the ZIP epoch (1980-01-01).
  With a given Node build, the same files always give the same zip bytes. It's
  plain Node over `node:zlib`; no `zip` binary is required. As noted in step 4,
  compare unpacked contents across different Node versions, not zip checksums.

## Verifying the extension

```bash
npm test            # 371 unit and integration tests
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
| `src/core/jp-area-codes.ts` | **Committed data**, not built: Japanese landline area-code lengths, generated from the Ministry of Internal Affairs and Communications' published number assignments by `scripts/make-area-codes.mjs`. It is not regenerated during the build (that needs network access and LibreOffice), so the build stays offline and reproducible. `tests/numbers.test.ts` checks the file is exactly what the generator emits for its rules. |
