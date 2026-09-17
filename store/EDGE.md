# Submitting to Microsoft Edge Add-ons

Free, no registration fee. Everything below is pre-answered — work down the page
as Partner Center asks for each field.

**Before you start:** load the package in Edge yourself and confirm it converts.
Certification takes up to seven business days to tell you otherwise.

```bash
npm run package                 # writes web-ext-artifacts/dejapanify-<version>-chrome.zip
unzip -d /tmp/dejapanify-edge web-ext-artifacts/dejapanify-0.1.0-chrome.zip
npm run demo                    # serves the test form over http
```

Then `edge://extensions` → **Developer mode** on → **Load unpacked** →
`/tmp/dejapanify-edge`, and try the form at the address `npm run demo` printed.
The page states at the top whether it can see the extension.

---

## Step 1 — Account

https://partner.microsoft.com/dashboard/microsoftedge/public/login

Free. A Microsoft account is required, and **a GitHub account can create one**,
which is the quickest route. Choose an **Individual** account — verification is
faster than a company account.

## Step 2–3 — Create the extension and upload the package

Upload **`dejapanify-0.1.0-chrome.zip`** — Edge takes the Chromium package.

This is the same artefact published on the
[v0.1.0 release](https://github.com/b1gmaw/dejapanify/releases/tag/v0.1.0), and a
rebuild reproduces it byte for byte.

Two fields are read from the manifest and are **read-only** in Partner Center:

| Field | Value |
|---|---|
| Extension name | `dejapanify` |
| Short description | `Auto-converts Japanese form fields between half-width and full-width (半角・全角) so forms stop rejecting correct input.` |

Changing either means editing `scripts/build.mjs`, rebuilding and re-uploading.

## Step 4 — Availability

- **Visibility**: Public
- **Markets**: all (the default). Japanese forms are filled in from everywhere.

## Step 5 — Properties

| Field | Value |
|---|---|
| Category | **Productivity** |
| Website | `https://b1gmaw.github.io/dejapanify/` |
| Support contact detail | `https://github.com/b1gmaw/dejapanify/issues` |
| Mature content | No |

## Step 6 — Privacy

### Single Purpose Description

> dejapanify converts text typed into Japanese web forms between half-width
> (半角) and full-width (全角) character forms, so that a field which accepts only
> one of them does not reject input that is otherwise correct. It reads each
> field's own attributes and the instructions printed beside it to determine
> which form that field requires, and rewrites the value accordingly when the
> user leaves the field. It does nothing else.

### Permission justification

**`storage`** — the only permission requested:

> Stores the user's own preferences: which conversion types are enabled, the
> confidence threshold before a field is converted, whether the undo notice is
> shown, and per-site enable/disable lists. No personal data is stored, and
> nothing derived from page content is stored.

**Content script host access** (the extension's content script matches all
sites):

> Japanese web forms are not confined to a single domain or top-level domain, so
> the extension cannot know in advance which pages contain them. The content
> script takes no action unless the page is identified as Japanese and a field's
> own attributes or printed instructions identify the character width it
> requires. It reads and rewrites only form field values, in page memory, at the
> moment the user leaves a field. It makes no network requests and transmits
> nothing. The extension declares no host permissions beyond the content script
> itself, and has no background script.

### Are you using remote code?

**No, I am not using remote code.**

> All executed code ships inside the package. There are no remotely hosted
> scripts, no `eval`, and no dynamically loaded modules. The build embeds no
> third-party runtime dependencies — `package.json` declares none — and the test
> suite (`tests/privacy.test.ts`) scans the built package on every build and
> fails if a network primitive appears.

### Data usage

**What user data do you plan to collect from users now or in the future?**
→ Select **nothing**. No categories apply.

Then tick every certification checkbox — each is true:

- The extension collects no personally identifiable information.
- The extension collects and transmits no user data.
- No data is shared with third parties.
- No data is sold.

### Privacy Policy URL

```
https://b1gmaw.github.io/dejapanify/privacy.html
```

Japanese version, if a second listing asks for one:

```
https://b1gmaw.github.io/dejapanify/privacy.ja.html
```

## Step 7 — Store listings

Fill in **English (en-US)** first, then add **Japanese (ja)** with
**Add a language**. Assets can be copied across with *Duplicate this … for all
languages*, so only the description differs.

### Assets (both languages)

| Field | File | Size |
|---|---|---|
| Extension logo | `store/assets/store-logo-300.png` | 300×300 |
| Small promotional tile | `store/assets/promo-tile-440x280.png` | 440×280 |
| Large promotional tile | `store/assets/marquee-1400x560.png` | 1400×560 |
| Screenshots (4) | `store/assets/screenshot-*.png` | 1280×800 |

Regenerate with `npm run assets` if they are missing.

### Description

Use the **full description** from [`listing.md`](listing.md) — English for the
en-US listing, 日本語 for the ja listing. Both are well over Edge's 250-character
minimum.

### Search terms

Not shown to users; they exist only for search. Edge allows at most 7 terms, 30
characters each, 21 words total.

**English:**

```
japanese forms
half-width full-width
katakana
furigana
zenkaku hankaku
japanese input
form autofill
```

**日本語:**

```
半角 全角
半角全角 変換
フリガナ
カタカナ 変換
日本語 フォーム
入力 自動変換
郵便番号 半角
```

## Step 8 — Notes for certification

**This matters more than anything else on this page.** The extension is
deliberately inert on non-Japanese pages, so a tester who installs it and types
into an ordinary English form will correctly observe that nothing happens.

Paste this into the **Notes for certification** box:

```
WHAT THIS EXTENSION DOES

Japanese web forms accept either half-width (hankaku) or full-width (zenkaku)
characters, almost never both, and rarely say which. The same character exists
in two Unicode forms: "1500001" and "１５００００１" are both a postal code, but
a given field usually rejects one of them. This extension detects which form a
field requires and converts the user's text to match when they leave the field.

IMPORTANT FOR TESTING: BY DESIGN IT DOES NOTHING ON NON-JAPANESE PAGES

To avoid interfering with the rest of the web, the extension takes no action
unless the page is identified as Japanese AND a field's own attributes or the
instructions printed beside it identify the character width it requires. On an
ordinary English page, nothing will happen. This is intended behaviour, not a
fault.

HOW TO SEE IT WORK (about one minute)

1. Install the extension.
2. Open https://b1gmaw.github.io/dejapanify/
3. Scroll to the section titled "Try it right here".
   A notice at the top of the form states whether the extension is detected.
4. Click the button "Fill with wrong widths". The fields are filled with
   deliberately incorrect character widths.
5. Click into the first field (labelled フリガナ) and then press Tab to leave it.

   Expected: "やまだ たろう" becomes "ヤマダ　タロウ".

6. Tab through the remaining fields. Expected:

   Postal code:  "１５０－０００１"  becomes  "1500001"
   Email:        "ｅｘａｍｐｌｅ＠ｍａｉｌ．ｊｐ"  becomes  "example@mail.jp"

   The field labelled お名前 is deliberately left unchanged: nothing on the page
   states which width it requires, so the extension declines to guess.

7. After each conversion a small notice appears naming what changed, with a
   one-click undo. Ctrl+Z also works.

The same form is in the repository at public/demo.html and can be served
locally with "npm run demo" if you prefer not to use the hosted page.

PRIVACY

No data collection, no network requests, no remote code, no account. The
package contains no fetch, XMLHttpRequest, WebSocket or sendBeacon; the only
permission is "storage", which holds the user's own settings. This is enforced
by the project's test suite, which scans the built package on every build.

Source code: https://github.com/b1gmaw/dejapanify
Privacy policy: https://b1gmaw.github.io/dejapanify/privacy.html
```

---

## After it goes live

Update the install buttons on the landing page — search `docs/index.html` for
`data-install="edge"` — and replace the "not published yet" notice with the
listing URL. Then `npm run site` and commit.
