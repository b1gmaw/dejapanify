# Submitting to the Chrome Web Store

One listing here covers Chrome, Brave and Vivaldi, and Opera can install from it
too. Work down the page in order; every answer you paste is in its own block.

> **One rule differs from Firefox and Edge.** Google requires disclosing data an
> extension *handles*, even when it never leaves the device ("Extensions are
> required to disclose how they handle user data, even when data is processed or
> stored locally on a user's device" — Chrome Web Store user data FAQ, Q3). So
> the data answers below are not "nothing", as they were for Edge. They describe
> what dejapanify reads while converting, which is still collected by no one.

## Updating to 0.2.0

0.2.0 adds split fields (姓/名, three-box phone numbers) and form-error help,
including an optional, off-by-default form refill that keeps a copy of form
input in the tab. The privacy answers change with it, so update them in the
same submission.

1. Open the existing item in the developer dashboard → **Package** → upload
   `dejapanify-0.2.0-chrome.zip`. If an earlier update is still in review, let
   it finish first; replacing a package in review can restart the review.
2. **Privacy practices:**
   - **Single purpose:** replace with the new text in Step 4.
   - **Permission justification — `storage`:** replace with the new text in
     Step 4. It now mentions the optional form recovery.
   - **Data usage:** keep **Personally identifiable information**, **Financial
     and payment information** and **Website content** ticked. Paste the updated
     explanations from Step 4. No new category is needed: the form-recovery
     copy is personally identifiable information, which is already declared.
   - The privacy policy URL is unchanged; the page itself was updated on
     29 October 2026 to describe form recovery.
3. **Store listing:** paste the updated descriptions from
   [`listing.md`](listing.md), which add a "Split boxes and form errors"
   section. If the 0.1.3 graphics were never uploaded, replace the store icon,
   small promo tile and marquee too.
4. **Test instructions:** replace with the Step 6 text, which adds the split
   boxes and form-error steps.
5. Submit for review.

---

**Before you start:** build the package and load it in Chrome or Edge once.

```bash
npm ci
npm run package        # writes web-ext-artifacts/dejapanify-0.2.0-chrome.zip
```

Then `chrome://extensions` → **Developer mode** on → **Load unpacked** →
`dist/chrome`, run `npm run demo`, and try the form. The zip is also attached to
the v0.2.0 release on GitHub.

---

## Step 1 — Developer account

https://chrome.google.com/webstore/devconsole

The documentation pages I could check confirm that registration carries a
**one-time fee** and that you must **verify your contact email**. They don't
state the amount or the other account rules, so confirm these on the
registration screen:

- **Fee:** US$5 at last report, paid once and covering every extension you ever
  publish.
- **2-Step Verification** on the Google account: widely reported as mandatory.
  Turn it on first so the dashboard doesn't send you back to do it.
- **Publisher name:** `b1gmaw`, matching Firefox and Edge.
- **Trader / non-trader status:** if the dashboard asks (an EU requirement), this
  is your own legal self-declaration. A free, unmonetised, open-source project
  run by an individual is typically a **non-trader**. If you declare yourself a
  trader, your contact details are shown publicly on the listing. The choice is
  yours.

## Step 2 — Upload

**Add new item** → upload **`dejapanify-0.2.0-chrome.zip`**.

The name and short description come from the package, per language, and can't
be edited in the dashboard:

| | English | 日本語 |
|---|---|---|
| Name | `dejapanify` | `dejapanify` |
| Summary | `Auto-converts Japanese form fields between half-width and full-width (半角・全角) so forms stop rejecting correct input.` | `日本語フォームの半角・全角を自動で変換します。入力欄が求める文字幅に合わせて、正しい入力がエラーにならないようにします。` |

To change either, edit `src/_locales/<lang>/messages.json`, rebuild and upload.

Expect a notice that the extension **may need an in-depth review** because its
content script runs on all sites. That's normal for this design and only means
a slower review.

## Step 3 — Store listing

The language dropdown at the top offers **English** and **Japanese** because the
package ships both in `_locales/`. Fill in English first, then switch to
Japanese.

### Description

Copy from [`listing.md`](listing.md) → **Full description**:

- **English** → the block under `**English:**`
- **Japanese** → the block under `**日本語:**`

### Category and language

| Field | Value |
|---|---|
| Category | **Productivity**; if it offers subcategories, **Tools** |
| Language | English (default), Japanese |

### Graphic assets (both languages)

| Field | File | Size |
|---|---|---|
| Store icon | `public/icons/icon128.png` (upload it if the dashboard asks; otherwise the package's icon is used) | 128×128 |
| Screenshots (4 of max 5) | `store/assets/screenshot-*.png` | 1280×800 |
| Small promo tile (**required**) | `store/assets/promo-tile-440x280.png` | 440×280 |
| Marquee promo tile (optional) | `store/assets/marquee-1400x560.png` | 1400×560 |

Google recommends 96×96 of artwork inside the 128×128 icon, with 16px of
transparent padding on each side. Ours has about 103×92 of artwork with roughly
12px of transparent margin, close to that guideline.

### Additional fields

| Field | Value |
|---|---|
| Official URL / homepage | `https://b1gmaw.github.io/dejapanify/` |
| Support URL | `https://github.com/b1gmaw/dejapanify/issues` |
| Mature content | No |

## Step 4 — Privacy practices

### Single purpose

```
dejapanify helps people fill in Japanese web forms without correct input being rejected. It converts text typed into a field between half-width (半角) and full-width (全角) character forms to match what that field requires, reading the field's own attributes and the instructions printed beside it. It spreads a pasted name or phone number across a form's split boxes (姓/名, three-part phone numbers). And when a form rejects input, it names the fields at fault and moves the user to them, optionally offering to refill a form the site emptied. Every feature serves that single purpose: getting a Japanese form accepted.
```

### Permission justification — `storage`

```
Stores only the user's own preferences: which conversion types and form helpers are enabled, the confidence threshold before a field is converted, whether the undo notice is shown, and per-site enable/disable lists. No personal data and nothing derived from page content is kept in extension storage. An optional form-recovery setting, off by default, keeps a temporary copy of form input in the web page's own sessionStorage rather than in extension storage; it is described in the privacy policy.
```

### Host permission justification — content script on all sites

```
Japanese web forms are not confined to a single domain or top-level domain, so the extension cannot know in advance which pages contain them. The content script takes no action unless the page is identified as Japanese and a field's own attributes or printed instructions identify the character width it requires. It then reads and rewrites that field's value in page memory at the moment the user leaves the field. It never reads or changes password fields, payment card fields (number, security code, expiry, holder name) or bank account numbers. It makes no network requests and transmits nothing. There is no background script and no other host permission.
```

### Remote code

**No, I am not using remote code.**

```
All executed code ships inside the package. There are no remotely hosted scripts, no eval, and no dynamically loaded modules. The package contains no third-party runtime code, and the project's test suite scans the built package on every build and fails if a network primitive (fetch, XMLHttpRequest, WebSocket, sendBeacon) appears.
```

### Data usage — what the extension handles

Under Google's on-device rule, tick exactly these three (for 0.1.2 onward):

- **Personally identifiable information:** yes. To convert a field, the
  extension reads the value typed into it, and those fields include names,
  addresses, phone numbers and email addresses. The value is read and rewritten
  in page memory and is never sent. It is stored only if the user turns on the
  optional, off-by-default form recovery, which keeps a copy in that tab's
  sessionStorage for at most 30 minutes.
- **Financial and payment information:** yes, for amounts only. In number fields
  that hold money, such as a price, budget or annual income, it reads the amount
  to add or remove thousands separators to match the form (5,000,000 or
  5000000). Card numbers, security codes, expiry dates and bank account numbers
  are excluded outright in code (`isPaymentField` in `src/core/keywords.ts`) and
  are never read.
- **Website content:** yes. It reads the text beside a field (its label and
  instructions such as 「半角数字で入力してください」) and any example value the
  page shows, to decide what the field requires.

If a justification box accompanies the financial category, paste:

```
Only amounts typed into number fields that hold money, such as a price, a budget or an annual income, and only to add or remove thousands separators so the value matches the form's own example (for example 5,000,000 or 5000000). The value is read and rewritten in page memory when the user leaves the field, and is never stored or transmitted. Payment card numbers, security codes, expiry dates and bank account numbers are excluded in code and are never read.
```

> **About 0.1.1, which is in review now.** It was submitted with personal
> information and website content only. 0.1.1 doesn't add commas, but it does
> already convert the width of digits in a money field when the page asks for
> 半角数字, so under Google's rule its disclosure arguably should have ticked
> financial information too. Updating the privacy practices when you upload
> 0.1.2 corrects that. If the reviewer queries 0.1.1 in the meantime, give the
> explanation above.

Leave these **unticked**, for the reasons given:

| Category | Why not |
|---|---|
| Authentication information | Password fields are excluded by input type. |
| Health information, Personal communications, Location | Nothing of the kind is read. |
| Web history | No browsing history is read or kept. The per-site lists hold only hostnames the user adds themselves. |
| User activity | No keystrokes, clicks or scrolling are logged. The final field value is read once, when the user leaves the field. A press of a button such as 確認画面へ is noticed only to check the form at that moment, and is not recorded. |

If the dashboard's category names differ from these, keep the same substance:
disclose what's read from form fields and from the page, and nothing else.

### Certifications

Tick all three. Each is true:

- I do not sell or transfer user data to third parties, outside of the approved
  use cases.
- I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

### Privacy policy URL

```
https://b1gmaw.github.io/dejapanify/privacy.html
```

The policy states the same thing as the data answers above. It says which
fields the extension never touches, that it reads amounts only to regroup their
digits, and that it "handles" personal and financial information and website
content only in the on-device sense, collecting none of it. Google requires the
two to agree.

## Step 5 — Distribution

- **Visibility:** Public
- **Regions:** all

## Step 6 — Test instructions

The extension deliberately does nothing on non-Japanese pages, so a reviewer on
an ordinary English page will correctly see no effect. Paste this into the
**Test instructions** tab:

```
IMPORTANT: BY DESIGN THIS EXTENSION DOES NOTHING ON NON-JAPANESE PAGES.

Japanese web forms accept either half-width (hankaku) or full-width (zenkaku) characters, and usually only one of them. This extension detects which form a field requires and converts the user's text when they leave the field. To avoid interfering with the rest of the web, it only acts on pages identified as Japanese, and only on fields whose attributes or printed instructions identify the width required. On an ordinary English page, nothing happens. This is intended.

HOW TO SEE IT WORK (about one minute)

1. Install the extension.
2. Open https://b1gmaw.github.io/dejapanify/
3. Scroll to "Try it right here". A notice there says whether the extension is detected.
4. Click "Fill with wrong widths".
5. Click into the first field (labelled フリガナ), then press Tab.
   Expected: "やまだ たろう" becomes "ヤマダ　タロウ".
6. Tab through the rest. Expected:
   Postal code: "１５０－０００１" becomes "1500001"
   Email: "ｅｘａｍｐｌｅ＠ｍａｉｌ．ｊｐ" becomes "example@mail.jp"
   Mobile: "０９０１２３４５６７８" becomes "090-1234-5678" (hyphens added to match the field's example)
   Annual income: "６０００００００" becomes "60,000,000" (commas added to match the field's example)
   Name in romaji: "yamada taro" becomes "YAMADA TARO" (the field asks for capitals)
   The お名前 field is deliberately left unchanged, because nothing on the page says which width it needs.
7. Each conversion shows a small notice with a one-click undo. Ctrl+Z also works.

SPLIT BOXES AND FORM ERRORS (new in 0.2.0)

8. Open https://b1gmaw.github.io/dejapanify/form/ (a Japanese test form).
9. Copy 090-1234-5678 and paste it into the first of the three 電話番号 boxes.
   Expected: the three boxes fill with 090 / 1234 / 5678.
10. Paste 山田 太郎 into the 姓 box. Expected: 姓 = 山田, 名 = 太郎.
11. Leave お名前 empty and click 確認画面へ進む at the bottom.
    Expected: the press is stopped once, a panel at the top right lists お名前 (and フリガナ) as 未入力, and the page scrolls to お名前.
12. Click 確認画面へ進む again. This time it goes through. The test form imitates a site that checks input afterwards: 1.5 seconds later it rejects any empty 電話番号 boxes or an invalid メールアドレス, showing only 「入力内容に誤りがあります」 and red rows.
    Expected: the panel names the rejected rows (for example 電話番号) and the page jumps to the first.
13. Optional form refill (off by default): enable "Offer to refill a wiped form" on the extension's options page and reload the test form. Tick 「送信エラー時にページを再読み込みする」, fill in お名前, フリガナ and a few other fields but leave 電話番号 empty, and click 確認画面へ進む. The test form reloads with every field empty.
    Expected: the panel offers 「前回の入力を復元」, and clicking it refills the fields.

No account, credentials or payment is needed to test any feature.

Source: https://github.com/b1gmaw/dejapanify
Privacy policy: https://b1gmaw.github.io/dejapanify/privacy.html
```

## Step 7 — Submit

**Submit for review.** Review time varies; the in-depth review for all-sites
access makes it slower than a narrowly scoped extension's.

---

## After it goes live

Send the listing URL, or do it yourself: in `docs/index.html`, change the
`data-install="chromium"` box from the manual instructions to an
**Add to Chrome** button carrying the listing URL. Then update the status table
in `SUBMITTING.md` and the README install table to match, run `npm run site`,
and commit.
