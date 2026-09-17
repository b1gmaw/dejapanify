# Submitting dejapanify to the stores

Follow these in order. Each store is independent; you can do one and not the
other.

Settled details, so you don't have to decide mid-form:

| | |
|---|---|
| Publisher / author | `b1gmaw` |
| Version | `0.1.0` |
| Support | `https://github.com/b1gmaw/dejapanify/issues` (no support email) |
| Privacy policy | `https://b1gmaw.github.io/dejapanify/privacy.html` |
| Privacy policy (JA) | `https://b1gmaw.github.io/dejapanify/privacy.ja.html` |
| Data collection | **None.** Pre-filled answers are in `listing.md`. |

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
web-ext-artifacts/dejapanify-<version>-chrome.zip    ← Edge (and Chrome, if ever)
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

## Chrome Web Store (not currently used)

Deliberately skipped: it charges a one-time **US$5** developer registration fee.

Everything needed is nonetheless ready — `dejapanify-<version>-chrome.zip` is
the correct package and `listing.md` covers the copy — so if you change your
mind, submission is a short session rather than a project.

Worth knowing: **Chrome, Brave, Vivaldi and Opera can only install extensions
from the Chrome Web Store.** Chrome blocks installing from anywhere else. Those
users currently have to install manually from source, which the landing page
explains. The $5 is what unlocks one-click installation for the majority of
desktop browser users.

---

## After a listing goes live

Update the two placeholder URLs in `docs/index.html` (search for
`STORE_URLS`) with the real listing links, then redeploy the page:

```bash
npm run site && git add docs && git commit -m "Point install buttons at the live listings"
```
