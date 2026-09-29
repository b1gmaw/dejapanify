# Submitting dejapanify to the stores

## Current status

| Store | Status | Listing |
|---|---|---|
| Firefox Add-ons | **Live** — v0.1.0 approved; **v0.1.1 to upload as an update** | https://addons.mozilla.org/firefox/addon/dejapanify/ |
| Microsoft Edge Add-ons | **In review** — v0.1.0 submitted; v0.1.1 to follow once certified | *listing URL appears once certified* |
| Chrome Web Store | **In review** — v0.1.1 submitted, see [`CHROME.md`](CHROME.md) | *listing URL appears once approved* |

**Current version: 0.1.1.** Compared with 0.1.0 it adds English and Japanese
translations of the name and description, so stores can list it in Japanese, and
it stops touching payment card and bank account fields.

For a **new version**, bump `version` in `package.json`, run the checks and
`npm run package` below, then upload the new zip to each live listing as an
update rather than creating a new one. Firefox needs a fresh
`npm run source-archive` alongside it every time.

**Edge timing:** let 0.1.0 finish certification before uploading 0.1.1.
Replacing a package that's still in review can restart certification.

**Edge's data answers:** Edge 0.1.0 was declared as collecting nothing. Chrome
counts data *handled on the device* as disclosable; Microsoft's documentation
says "collects" and I couldn't confirm whether it applies the same rule. If
certification queries it, answer as `CHROME.md` does: personal information
typed into form fields and the text beside them are read on-device to convert
the field, and nothing is stored or sent.

---

Follow these in order. Each store is independent; you can do one and not the
other.

Settled details, so you don't have to decide mid-form:

| | |
|---|---|
| Publisher / author | `b1gmaw` |
| Version | `0.1.1` |
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

   Point reviewers at `docs/REVIEWER_NOTES.md`, which documents the toolchain
   and the exact commands. In the "notes to reviewer" box, paste:

   > Build instructions are in `docs/REVIEWER_NOTES.md`.
   > `npm ci && npm run build` reproduces `dist/firefox/` byte for byte;
   > the build embeds no timestamps and the archive writer is deterministic.
   > Node 24 (see `.nvmrc`). No network access or data collection.

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
