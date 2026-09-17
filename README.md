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

| Browser | How |
|---|---|
| **Firefox** | One click from Mozilla Add-ons. Requires Firefox 142+. |
| **Edge** | One click from Microsoft Edge Add-ons. |
| **Chrome, Brave, Vivaldi, Opera** | Manual install — see below. |

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

Then load `dist/chrome` or `dist/firefox` as an unpacked extension. Open
`public/demo.html`, click 「サンプル入力を挿入」 and tab through the fields to
watch it work.

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
npm test           # 138 tests
npm run typecheck
npm run lint:ext   # web-ext lint over dist/firefox
npm run package    # store-ready zips in web-ext-artifacts/
npm run icons      # regenerate the toolbar icons
npm run assets     # regenerate the store listing images
npm run site       # build the GitHub Pages site into docs/
```

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
expected. Enable **Debug logging** in settings to get the detection decision
printed to the page console.

## License

MIT
