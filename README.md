# dejapanify

A browser extension that fixes the unintuitive parts of Japanese websites.
First target: the **half-width / full-width (半角・全角) form guessing game**.

Works in Chromium (Chrome, Edge, Brave, Arc) and Firefox. Written in TypeScript,
no runtime dependencies, no network access.

---

## The problem

In Japanese text, the same logical character exists in two Unicode forms:

| | half-width (半角) | full-width (全角) |
|---|---|---|
| Digits | `1500001` | `１５００００１` |
| Latin | `example@mail.jp` | `ｅｘａｍｐｌｅ＠ｍａｉｌ．ｊｐ` |
| Katakana | `ﾔﾏﾀﾞ ﾀﾛｳ` | `ヤマダ　タロウ` |

Japanese web forms usually accept **exactly one** of them per field, and which
one is rarely indicated by the input itself. It's printed in Japanese beside the
field (「半角数字で入力してください」) or buried in a `pattern` attribute.

Meanwhile your IME emits whichever form its current mode produces. So you type a
phone number that *looks* correct, submit, and get バリデーションエラー — with no
visual difference between what you typed and what was wanted. Then you retype it
by hand.

dejapanify reads what each field actually wants and converts your text to match.

```
フリガナ  やまだ たろう   →  ヤマダ　タロウ     (page said 全角カタカナ)
郵便番号  １５０－０００１ →  1500001          (pattern="^[0-9]{7}$")
メール    ｅｘａｍｐｌｅ＠… →  example@…        (page said 半角英数字)
```

## How it decides

The extension never guesses blindly. It collects signals and converts only when
they're conclusive — the form usually *states* its requirement, so the trick is
reading it rather than inferring it.

| Signal | Example | Trust |
|---|---|---|
| `pattern` attribute | `pattern="^[ァ-ヶー]+$"` | highest — it's what the site enforces |
| Printed hint text | 「半角数字で入力してください」 | very high |
| `autocomplete` | `autocomplete="postal-code"` | high |
| `type` / `inputmode` | `type="tel"` | medium |
| Field name / label keywords | `name="name_kana"`, 「フリガナ」 | supporting |

Signals are scored and combined. The threshold is calibrated so that one
unambiguous signal converts and one merely suggestive signal does not:

- A bare 「フリガナ」 label scores **0.55** → converted (this is the single most
  common field in Japanese forms).
- A bare 「住所」 label scores **0.39** → **left alone**. Rewriting an address to
  full-width on a hunch is worse than doing nothing.

Adding an explicit hint (「住所は全角で入力」) pushes it over the line.

### What it will never do

- Touch `type="password"`, `hidden`, `file`, checkboxes, radios or date pickers.
- Convert a field it could not identify.
- Convert *meaning*. 山田 never becomes ヤマダ; only character width changes.
- Run while your IME is mid-composition.
- Send anything anywhere. There is no network code and no host permission.

## Install

**→ [b1gmaw.github.io/dejapanify](https://b1gmaw.github.io/dejapanify/)** — install links,
plus a live demo you can try without installing anything.

> **Not in the stores yet.** The Firefox and Edge listings have been prepared but
> not submitted, so for now every browser installs from source — see below. The
> table is what it will look like once they are live.

| Browser | How |
|---|---|
| **Firefox** | One click from Mozilla Add-ons *(not published yet)*. Requires Firefox 142+. |
| **Edge** | One click from Microsoft Edge Add-ons *(not published yet)*. |
| **Chrome, Brave, Vivaldi, Opera** | Manual install — Chrome allows no other route. |

### Chrome and other Chromium browsers

Chrome only permits installing extensions from the Chrome Web Store, and listing
there carries a one-time fee this project has not paid. So these browsers need a
manual install. Once, and it takes about two minutes:

1. Download the ZIP from [Releases](https://github.com/b1gmaw/dejapanify/releases/latest)
   and unzip it somewhere permanent — deleting the folder uninstalls the extension.
2. Open `chrome://extensions` (Brave: `brave://extensions`).
3. Enable **Developer mode**, top right.
4. Click **Load unpacked** and select the unzipped folder.

Chrome shows a "Disable developer mode extensions" notice on startup; that is its
standard warning for anything not from its store.

### From source

```bash
git clone https://github.com/b1gmaw/dejapanify.git
cd dejapanify
npm install
npm run build
```

Then load it, per browser:

**Firefox** — open `about:debugging#/runtime/this-firefox`, click **Load
Temporary Add-on**, and select `dist/firefox/manifest.json`. A temporary add-on
is removed when Firefox closes, so repeat this after a restart.

**Chrome, Brave, Vivaldi, Opera** — open `chrome://extensions` (Brave:
`brave://extensions`), enable **Developer mode**, click **Load unpacked** and
select the `dist/chrome` folder.

### Trying it

```bash
npm run demo
```

That serves the test form at `http://127.0.0.1:8123/demo.html`. Click
「サンプル入力を挿入」 and tab through the fields.

**Open the demo through that address, not by double-clicking
`public/demo.html`.** Browsers do not run extensions on `file://` pages: Firefox
will not inject a content script there at all, and Chrome only does so if you
tick *Allow access to file URLs* on the extension's details page. Opened as a
local file the demo looks broken even when the extension is working perfectly.

The demo page says at the top whether it can see the extension, so you are never
left guessing.

## Usage

Conversion runs when you **leave a field**, and again as a sweep **on submit**
(which catches browser-autofilled values you never focused). After each
conversion a small chip appears naming what changed, with an undo:

```
✓ 全角カタカナに変換   ⟲ 元に戻す
```

`Ctrl+Z` also works: writes go through `execCommand` where possible
specifically so the browser's native undo stack survives.

### Settings

| Setting | Default | Notes |
|---|---|---|
| Japanese pages only | on | Skips pages that aren't Japanese |
| Show the undo chip | on | |
| Convert while typing | **off** | Converts on each IME commit instead of on blur |
| Confidence threshold | 0.50 | Lower catches more fields, risks more mistakes |
| Per-conversion switches | all on | Disable individual conversion types |
| Block / allow lists | empty | Per-host, covers subdomains |

## Development

```bash
npm run dev        # watch build for both targets
npm test           # 227 tests
npm run typecheck
npm run lint:ext   # web-ext lint over dist/firefox
npm run package    # store-ready zips in web-ext-artifacts/
npm run icons      # regenerate the toolbar icons
npm run assets     # regenerate the store listing images
npm run site       # build the GitHub Pages site into docs/
npm run demo       # serve the test form over http
npm run e2e        # load the built extension into a real Firefox and verify it
node scripts/inspect.mjs <url>   # what the detector makes of a real page
```

`npm run e2e` is the one that answers "does this actually work": it installs the
built extension into a real headless Firefox via `web-ext`, opens the demo, and
the page reports its own conversion results back. `npm run e2e:headed` shows the
browser while it happens.

Icons, store images and the ZIP container are all generated from code rather
than checked in as binary artefacts or produced by an external tool. The build
is deterministic — the same source always yields byte-identical packages, which
Mozilla's reviewers rely on. See [`docs/REVIEWER_NOTES.md`](docs/REVIEWER_NOTES.md).

### Layout

```
src/core/      pure logic, no DOM — fully unit tested
  tables.ts      character tables
  convert.ts     conversion primitives
  normalize.ts   FieldKind -> transform pipeline
  hints.ts       parses printed Japanese instructions
  pattern.ts     reads pattern attributes
  detect.ts      combines signals into one decision
src/content/   DOM layer: descriptor extraction, IME-safe write-back, undo chip
src/shared/    cross-browser storage shim
src/popup/     toolbar popup
src/options/   settings page
src/site/      the landing page's live demo (imports src/core directly)
docs/          GitHub Pages site + reviewer notes
store/         listing copy, privacy policy, generated store images
```

`src/core/` is deliberately DOM-free so the interesting logic can be tested
without a browser. `tests/integration.test.ts` runs the whole pipeline against
`public/demo.html` under jsdom.

### Dependencies and security

The extension has **no runtime dependencies**. `package.json` declares an empty
`dependencies` block; esbuild, TypeScript, Vitest, jsdom and web-ext are build
and test tooling. Nothing from `node_modules` is bundled — every line in `dist/`
comes from `src/`, which is why the package is around 18 KB.

So a vulnerability reported by `npm audit` affects contributors' machines, never
anyone who installed the extension. They are still worth fixing, and `npm audit`
should report zero.

One warning is expected and harmless:

```
npm warn install-scripts 1 package had install scripts blocked
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
```

esbuild ships its platform binary as an optional dependency; the `postinstall`
script is only a fallback. The build works with it blocked, and produces
identical output.

### A note on NFKC

`String.prototype.normalize('NFKC')` looks like it would solve this in one line.
It doesn't: it decomposes voiced katakana inconsistently across engines, erases
the ー / ｰ / － distinction that Japanese forms validate against, and rewrites
characters in fields that should be left alone. The character tables in
`src/core/tables.ts` are written out explicitly for these reasons.

## Roadmap

Width conversion is the first module. Other Japanese-web friction worth fixing:

- [ ] Auto-split and auto-join 姓/名 and 3-part phone number fields
- [ ] Auto-fill 住所 from 郵便番号
- [ ] Convert half-width katakana appearing anywhere it's clearly unintended
- [ ] Suppress the 「Internet Explorer を推奨」 banners
- [ ] Unblock paste on fields that disable it (common on email confirm fields)
- [ ] Make required-field errors say which field

## Contributing

Site-specific reports are the most useful contribution. If a field is missed or
converted wrongly, open an issue with the URL, the field's label, and what you
expected.

Two things make such a report easy to act on:

```bash
node scripts/inspect.mjs https://example.co.jp/form
```

This prints every field on a page with the kind that was detected, the
confidence, and which signals fired — no install required, and it runs the same
detector the extension does. Enabling **Debug logging** in the extension's
settings prints the same decisions to the page console.

A false positive — something converted that should have been left alone — is
more serious than a miss, since it changes text the user typed. Those are worth
reporting even if the field is obscure.

## License

MIT
