/** Popup: on/off, per-site opt-out, and a live count from the active tab. */
import { ext } from '../shared/browser.js';
import { loadSettings, saveSettings, normalizeHost, hostMatches } from '../shared/settings.js';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const enabledEl = $<HTMLInputElement>('enabled');
const blockedEl = $<HTMLInputElement>('site-blocked');
const hostEl = $('host');
const detectedEl = $('detected');
const convertedEl = $('converted');
const statusEl = $('status');
const convertBtn = $<HTMLButtonElement>('convert-now');

let host = '';
let tabId: number | undefined;

async function activeTab(): Promise<{ id?: number; url?: string } | undefined> {
  const tabs = await ext.tabs?.query({ active: true, currentWindow: true });
  return tabs?.[0];
}

/**
 * Ask the content script for its stats. A rejection just means no content
 * script is running here (a chrome:// page, or a site we skipped), which is a
 * normal state rather than an error.
 */
async function fetchStats(): Promise<{ detected: number; converted: number; running: boolean } | null> {
  if (tabId === undefined || !ext.tabs) return null;
  try {
    const res = (await ext.tabs.sendMessage(tabId, { type: 'dejapanify:stats' })) as
      | { detected: number; converted: number; running: boolean }
      | undefined;
    return res ?? null;
  } catch {
    return null;
  }
}

async function render(): Promise<void> {
  const settings = await loadSettings();
  enabledEl.checked = settings.enabled;
  blockedEl.checked = hostMatches(host, settings.blocklist);

  const stats = await fetchStats();
  if (stats) {
    detectedEl.textContent = String(stats.detected);
    convertedEl.textContent = String(stats.converted);
    convertBtn.disabled = stats.detected === 0;
    statusEl.textContent = stats.running
      ? stats.detected === 0
        ? 'No convertible fields found on this page.'
        : `Watching ${stats.detected} field${stats.detected === 1 ? '' : 's'}.`
      : 'Not active here — the page does not look Japanese.';
  } else {
    detectedEl.textContent = '–';
    convertedEl.textContent = '–';
    convertBtn.disabled = true;
    statusEl.textContent = 'No content script on this page.';
  }
}

enabledEl.addEventListener('change', async () => {
  const settings = await loadSettings();
  settings.enabled = enabledEl.checked;
  await saveSettings(settings);
  void render();
});

blockedEl.addEventListener('change', async () => {
  const settings = await loadSettings();
  const h = normalizeHost(host);
  settings.blocklist = blockedEl.checked
    ? Array.from(new Set([...settings.blocklist, h]))
    : settings.blocklist.filter((e) => normalizeHost(e) !== h);
  await saveSettings(settings);
  void render();
});

convertBtn.addEventListener('click', async () => {
  if (tabId === undefined || !ext.tabs) return;
  try {
    const res = (await ext.tabs.sendMessage(tabId, { type: 'dejapanify:convert-now' })) as
      | { changed: number }
      | undefined;
    statusEl.textContent = `Converted ${res?.changed ?? 0} field${res?.changed === 1 ? '' : 's'}.`;
    void render();
  } catch {
    statusEl.textContent = 'Could not reach the page.';
  }
});

$('options').addEventListener('click', () => {
  void ext.runtime.openOptionsPage?.();
  window.close();
});

void (async () => {
  const tab = await activeTab();
  tabId = tab?.id;
  try {
    host = tab?.url ? new URL(tab.url).hostname : '';
  } catch {
    host = '';
  }
  hostEl.textContent = host || 'unknown page';
  blockedEl.disabled = !host;
  await render();
})();
