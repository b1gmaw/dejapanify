# Privacy Policy — dejapanify

**Last updated: 17 September 2026**

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
the field. Field values are never stored, logged, or sent anywhere.

## What the extension stores

Only your own settings, kept in your browser's extension storage:

- Which conversion types you have enabled
- The confidence threshold
- Whether the undo notice is shown
- Lists of sites where you have enabled or disabled the extension

If your browser has extension sync turned on, your browser syncs these settings
between your own devices using your browser account. That is your browser's
sync, not ours — the extension author has no access to it and receives nothing.

You can erase all of it at any time by removing the extension, or with **Reset
to defaults** on the settings page.

## What is never collected

To be explicit, the extension does **not** collect, transmit or store:

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
