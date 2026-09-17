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

   Build a source archive that excludes artefacts:

   ```bash
   git archive --format=zip -o web-ext-artifacts/source.zip HEAD
   ```

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

1. Register at https://partner.microsoft.com/dashboard/microsoftedge/public/login
   — free, no fee. You need a Microsoft account; **your GitHub account can
   create one**, which is the quickest route. Choose an **Individual** account
   (verification is faster than a company account).
2. Wait for account verification, then **Create new extension**.
3. Upload `dejapanify-<version>-chrome.zip` (Edge takes the Chromium package).
4. Fill in the listing from `listing.md`.
5. Upload `store-logo-300.png` as the store logo and the four screenshots.
6. Set the privacy policy URL, and work through the Privacy section using the
   pre-filled answers in `listing.md` — every one is **No**. Partner Center also
   asks whether the extension uses remote code: it does not, everything executed
   ships inside the package.
7. Submit for certification.

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
