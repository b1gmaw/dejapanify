# Submitting dejapanify to the stores

## Current status

| Store | Status | Listing |
|---|---|---|
| Firefox Add-ons | **Live** — v0.1.2; **upload v0.1.3 as an update** | https://addons.mozilla.org/firefox/addon/dejapanify/ |
| Microsoft Edge Add-ons | **In review** — v0.1.0 submitted; v0.1.3 to follow once certified (skip 0.1.2) | *listing URL appears once certified* |
| Chrome Web Store | **In review** — v0.1.1 submitted; v0.1.3 to follow once approved (skip 0.1.2), see [`CHROME.md`](CHROME.md) | *listing URL appears once approved* |

**Current version: 0.1.3.**

- **0.1.1** added English and Japanese translations of the name and description,
  so stores can list it in Japanese, and stopped touching payment card and bank
  account fields.
- **0.1.2** follows each form's own format:
  - uppercase when a field asks for capitals (大文字, "capital letters");
  - hyphens in phone numbers and postal codes added or removed to match the
    page's example or instruction, with landlines split using the official area
    code table;
  - thousands commas in amounts added or removed the same way.

  It also stops treating 「町名・番地」 address fields as numbers.
- **0.1.3** replaces the icon with the new 全→半 artwork, everywhere: the
  toolbar, the extensions page, the store logo and tiles, and the website.
  Nothing else changes.

**Data disclosure from 0.1.2:** adding commas means reading amounts in money
fields. Chrome counts that as handling financial information, so `CHROME.md`
ticks it from 0.1.2 on. 0.1.3 changes nothing here.

**New store images for 0.1.3:** after uploading the package, also replace the
listing images, since the stores keep the old ones until you do:

| Store | Replace |
|---|---|
| Edge | Extension logo → `store/assets/store-logo-300.png`; small and large promo tiles |
| Chrome | Store icon (if the dashboard has the field) → `public/icons/icon128.png`; small promo tile and marquee |
| Firefox | The listing icon comes from the package. Re-upload it under **Edit product page → Images** only if the old one still shows after approval |

For a **new version**, bump `version` in `package.json`, run the checks and
`npm run package` below, then upload the new zip to each live listing as an
update rather than creating a new one. Firefox needs a fresh
`npm run source-archive` alongside it every time.

**Edge and Chrome timing:** let the version in review finish before uploading
0.1.2. Replacing a package that's still in review can restart it.

**Edge's data answers:** Edge 0.1.0 was declared as collecting nothing. Chrome
counts data *handled on the device* as disclosable; Microsoft's documentation
says "collects" and I couldn't confirm whether it applies the same rule. If
certification queries it, answer as `CHROME.md` does: personal information,
amounts typed into money fields, and the text beside fields are read on-device
to convert them, and nothing is stored or sent.

---

Follow these in order. Each store is independent; you can do one and not the
other.

Settled details, so you don't have to decide mid-form:

| | |
|---|---|
| Publisher / author | `b1gmaw` |
| Version | `0.1.3` |
| Support | `https://github.com/b1gmaw/dejapanify/issues` (no support email) |
| Privacy policy | `https://b1gmaw.github.io/dejapanify/privacy.html` |
| Privacy policy (JA) | `https://b1gmaw.github.io/dejapanify/privacy.ja.html` |
| Data collection | **None.** Pre-filled answers are in `listing.md`. Chrome also asks what is *handled* on-device; see `CHROME.md`. |

Before either: build and package.

```bash
npm ci
npm test && npm run typecheck && npm run lint:ext   # all must pass
npm run assets                                      # regenerate store images
npm run package                                     # writes web-ext-artifacts/
```

That produces:

```
web-ext-artifacts/dejapanify-<version>-firefox.zip   ← Firefox
web-ext-artifacts/dejapanify-<version>-chrome.zip    ← Edge and Chrome
```

---

## Firefox Add-ons (free)

1. Create an account at https://addons.mozilla.org/developers/ if you don't
   have one.
2. **Submit a New Add-on** → *On this site* (listed).
3. Upload `dejapanify-<version>-firefox.zip`. The automatic validator should
   report no errors — `npm run lint:ext` runs the same checks locally.
4. **Source code**: answer **Yes**, this add-on requires source code review, and
   upload a source archive. Mozilla requires this because the extension is
   bundled with esbuild.

   Build the source archive:

   ```bash
   npm run source-archive
   ```

   This writes `web-ext-artifacts/dejapanify-<version>-source.zip` from HEAD.
   It deliberately contains **no `manifest.json`** — the manifest is generated
   per target by `scripts/build.mjs` — so the archive carries a
   `REVIEWERS-README.txt` at its root explaining that, and pointing at the two
   commands that produce `dist/firefox/`.

   In the **Notes to Reviewer** box, paste the block below, changing the version
   number in step 4 if it's not 0.1.2. The same steps are in
   `REVIEWERS-README.txt` at the root of the source archive, and in more detail
   in `docs/REVIEWER_NOTES.md`.

   ```
   BUILD INSTRUCTIONS (source code is attached)

   1. Environment
      OS: Ubuntu 24.04 LTS, ARM64 or x86_64
      Node.js 24.14.0 with npm 11.9.0 (the npm that ships with it)
      Nothing else: no system packages, no global installs, no web-based tools.
      The only network access is "npm ci" fetching the pinned dependencies
      from the public npm registry (exact versions in package-lock.json).

   2. Install Node.js 24.14.0 (skip if "node --version" prints v24.14.0)
      curl -O https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-arm64.tar.xz
      tar -xf node-v24.14.0-linux-arm64.tar.xz
      export PATH="$PWD/node-v24.14.0-linux-arm64/bin:$PATH"
      (on x86_64 use linux-x64; or with nvm: nvm install 24.14.0)
      Check: node --version -> v24.14.0, npm --version -> 11.9.0

   3. Build (from the root of the unpacked source archive)
      npm ci
      npm run build
      The submitted add-on is the output in dist/firefox/.

   4. Compare with the submitted add-on
      unzip dejapanify-0.1.2-firefox.zip -d submitted
      diff -r -x META-INF submitted dist/firefox && echo IDENTICAL
      Please compare the unpacked files, not zip checksums: the zip
      container's compressed bytes depend on the Node build's zlib, while the
      files are identical.

   NOTES
   - The source archive has no manifest.json; it is generated per browser by
     scripts/build.mjs and appears as dist/firefox/manifest.json.
   - Verified before submission: the source archive unpacked into an empty
     directory and built with Node 24.14.0 / npm 11.9.0 on Ubuntu reproduced
     the submitted add-on file for file.
   - The extension has no runtime dependencies; everything in dist/ comes from
     src/. No network requests and no data collection, which the test suite
     enforces (npm test).
   ```

5. Paste the listing copy from `listing.md`: summary, full description,
   category, homepage, support URL, and the privacy policy URL.

   When asked **"Does this add-on collect or transmit user data?"** answer
   **No**. The manifest already declares
   `data_collection_permissions: { required: ["none"] }`, which Firefox shows
   users at install time, so the two must agree — `listing.md` has the full
   set of answers and the justification text.
6. Upload the four screenshots from `store/assets/`.
7. Submit. Review usually takes a few days.

**Note:** the manifest sets `strict_min_version: 142.0`, required because
`data_collection_permissions` (the "no data collected" declaration) needs
Firefox 140+, and 142+ on Android.

---

## Microsoft Edge Add-ons (free)

**→ [`EDGE.md`](EDGE.md)** — the full packet, following Partner Center's own
eight-step flow, with every Privacy-page answer pre-written.

In short: register at
https://partner.microsoft.com/dashboard/microsoftedge/public/login (free; your
GitHub account can create the required Microsoft account), upload
`dejapanify-<version>-chrome.zip`, and paste the answers from `EDGE.md`.

Two things in there are easy to get wrong and worth knowing before you start:

- **Load the package in Edge yourself first.** Certification takes up to seven
  business days to report a problem that a two-minute local check would catch.
- **Fill in the "Notes for certification" box.** The extension does nothing on
  non-Japanese pages by design, so a tester on an ordinary English page will
  correctly see no effect at all. `EDGE.md` has text giving them an exact route
  to a visible conversion.

---

## Chrome Web Store (one-time registration fee)

**→ [`CHROME.md`](CHROME.md)** — the full packet, in the dashboard's own order.

One listing covers Chrome, Brave and Vivaldi, and Opera can install from it too.
Two things differ from the other stores and are worth knowing before you start:

- **Data answers are not "none".** Google requires disclosing data an extension
  handles even on the device. `CHROME.md` explains exactly what to tick and why.
- **Expect an in-depth review.** Because the content script runs on all sites,
  Google reviews more closely, and it takes longer.

---

## After a listing goes live

Firefox is done: its install button in `docs/index.html` (`STORE_URL_FIREFOX`)
points at the live listing. When Edge is certified, replace the "In review"
notice in the `data-install="edge"` box with an **Add to Edge** button carrying
the listing URL. When Chrome approves, do the same for the
`data-install="chromium"` box with **Add to Chrome**. Update the table above and
the README each time, then redeploy:

```bash
npm run site && git add docs && git commit -m "Point install buttons at the live listings"
```
