/** Content script entry point. */
import { looksJapanese } from '../core/hints.js';
import { loadSettings, watchSettings, isEnabledForHost, hostMatches } from '../shared/settings.js';
import { ext } from '../shared/browser.js';
import { observeFields, type Observer } from './observer.js';
import { considerField, setSettings, sweepForm, sweepAll, getStats } from './manager.js';
import { destroyIndicator } from './indicator.js';

let observer: Observer | null = null;

/**
 * Should we run here? Defaults to Japanese-looking pages only, because the
 * conversions are meaningless elsewhere and the cheapest way to avoid breaking
 * non-Japanese sites is to never touch them.
 */
function shouldRun(settings: Awaited<ReturnType<typeof loadSettings>>): boolean {
  const host = location.hostname;
  if (!isEnabledForHost(settings, host)) return false;
  if (hostMatches(host, settings.allowlist)) return true;
  if (!settings.japaneseOnly) return true;

  const lang = document.documentElement.lang?.toLowerCase() ?? '';
  if (lang.startsWith('ja')) return true;
  const contentLang = document
    .querySelector('meta[http-equiv="content-language" i]')
    ?.getAttribute('content')
    ?.toLowerCase();
  if (contentLang?.startsWith('ja')) return true;

  // Fall back to sniffing the text: many Japanese sites omit lang entirely.
  return looksJapanese(document.body?.innerText?.slice(0, 4000) ?? '');
}

/**
 * Marks the document so a page (and a human in devtools) can tell the content
 * script is alive. Without this the extension fails completely silently: if it
 * is never injected there is nothing at all to distinguish that from a page
 * where it simply found no convertible fields.
 */
const ACTIVE_MARKER = 'dejapanify';

function start(): void {
  if (observer) return;
  observer = observeFields(considerField);
  try {
    document.documentElement.dataset[ACTIVE_MARKER] = 'active';
  } catch {
    /* documentElement is always present in practice; never fail startup for it */
  }

  // Capture phase: some sites call stopPropagation on submit handlers.
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement) sweepForm(form);
    },
    true,
  );
}

function stop(): void {
  observer?.disconnect();
  observer = null;
  destroyIndicator();
  try {
    delete document.documentElement.dataset[ACTIVE_MARKER];
  } catch {
    /* nothing meaningful to do if the marker cannot be removed */
  }
}

async function init(): Promise<void> {
  const settings = await loadSettings();
  setSettings(settings);
  if (shouldRun(settings)) start();

  watchSettings((next) => {
    setSettings(next);
    if (shouldRun(next)) start();
    else stop();
  });
}

// Let the popup ask what this page looks like, and drive a manual conversion.
ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as { type?: string } | null;
  if (msg?.type === 'dejapanify:stats') {
    sendResponse({ ...getStats(), host: location.hostname, running: observer !== null });
    return true;
  }
  if (msg?.type === 'dejapanify:convert-now') {
    sendResponse({ changed: sweepAll() });
    return true;
  }
  return false;
});

void init();
