# Privacy Policy — dejapanify

**Last updated: 29 October 2026**

## The short version

dejapanify collects nothing, transmits nothing, and has no servers.

Everything the extension does happens locally in your browser. There is no
analytics, no telemetry, no crash reporting, no account, and no network code of
any kind in the extension.

## What the extension accesses

To convert form input between half-width (半角) and full-width (全角), the
extension reads and rewrites the **values of form fields on pages you visit**,
along with the surrounding labels and attributes that indicate which character
width a field requires.

This happens entirely in your browser's memory, at the moment you interact with
the field. Field values are never logged or sent anywhere, and are not stored
unless you switch on form recovery, described below.

To point out which field a form rejected, it also reads which fields the page
marks as required or as errors, and the error messages the page shows. It does
this when you press a button that moves the form on, such as 確認画面へ or 次へ,
and when a page loads already showing errors. It notices that press only to
check the form at that moment; clicks are not recorded.

Some fields are never read or changed at all, whatever the page asks for:
**passwords**, **payment card details** (number, security code, expiry date,
card-holder name), and **bank account, branch and institution numbers**. The
extension leaves them exactly as you typed them.

In number fields that hold money, such as a price, a budget or an annual income,
it reads the amount you typed in order to add or remove thousands separators
(5,000,000 or 5000000) to match the form. It never reads card numbers, security
codes or bank account numbers.

Because it reads what you type into these fields, such as names, addresses,
phone numbers, email addresses and amounts, some stores describe the extension
as *handling* personal and financial information and website content. That
handling is the on-device conversion described above and nothing more; none of
it is collected.

## What the extension stores

Only your own settings, kept in your browser's extension storage:

- Which conversion types you have enabled
- The confidence threshold
- Whether the undo notice is shown
- Which form helpers are switched on (naming rejected fields, checking before
  proceeding, refilling a wiped form)
- Lists of sites where you have enabled or disabled the extension

If your browser has extension sync turned on, your browser syncs these settings
between your own devices using your browser account. That is your browser's
sync, not ours — the extension author has no access to it and receives nothing.

You can erase all of it at any time by removing the extension, or with **Reset
to defaults** on the settings page.

### Form recovery (off unless you turn it on)

Some sites empty the whole form when they reject it. If you switch on **Offer to
refill a wiped form** in the settings, then each time you press a button such as
確認画面へ or 次へ, the extension keeps a copy of the fields you filled in, so it
can offer them back if the site wipes them.

- **Where:** in that website's session storage, for that tab only. Not in the
  extension's own storage, never synced, never sent anywhere.
- **What is left out:** passwords, payment card and bank details, one-time
  codes, CAPTCHA answers, マイナンバー and hidden fields are never copied.
- **How long:** deleted when you restore it or dismiss the offer, after 30
  minutes, when a page says your application is complete, or when you close the
  tab, whichever comes first.
- **Who can see it:** scripts running on that website, including any analytics
  or advertising scripts it loads, can read session storage while the copy
  exists. They can already read the same values from the form itself, but the
  copy keeps them readable for up to 30 minutes after the site emptied the form.
  If that matters to you, leave this setting off.

The setting is off by default.

## What is never collected

To be explicit, the extension does **not** collect or transmit any of the
following, and apart from the optional form recovery above, it does not store
any of it either:

- Anything you type into forms
- Page contents, URLs or browsing history
- Personal or identifying information
- IP addresses
- Analytics or usage statistics of any kind

## Permissions

| Permission | Why |
|---|---|
| `storage` | Saves your settings, described above. Nothing else. |
| Content script on all sites | Japanese forms are not limited to one domain, so the extension cannot know in advance which pages have them. It takes no action unless a page looks Japanese and a field identifies the width it needs. |

## Third parties

There are none. The extension makes no network requests, loads no remote code,
bundles no third-party analytics or advertising, and shares data with nobody —
because it has no data to share.

## Verifying this yourself

You don't have to take our word for it. The extension is open source under the
MIT licence, and the published package is reproducible from that source:

- Source: https://github.com/b1gmaw/dejapanify
- Searching the source for `fetch`, `XMLHttpRequest`, `WebSocket` or
  `sendBeacon` returns nothing. This is checked automatically: the test suite
  scans the built package for network primitives, so adding any would fail the
  build rather than quietly contradict this page.

## Contact

Questions or concerns: https://github.com/b1gmaw/dejapanify/issues

## Changes

If this policy ever changes, the updated version will be published at this
address and the date above will change. Since the extension collects no data,
no change can retroactively affect information already gathered.
