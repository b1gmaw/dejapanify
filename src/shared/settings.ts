/** Typed accessors over the extension's persisted settings. */
import { DEFAULT_SETTINGS, type Settings, type FieldKind } from '../core/types.js';
import { storageGet, storageSet, onStorageChanged } from './browser.js';

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const raw = await storageGet({ [KEY]: DEFAULT_SETTINGS });
  const stored = raw[KEY] as Partial<Settings> | undefined;
  return mergeSettings(stored);
}

/** Merge persisted values over the defaults so new options appear on upgrade. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    kinds: { ...DEFAULT_SETTINGS.kinds, ...(stored.kinds ?? {}) } as Record<FieldKind, boolean>,
    blocklist: Array.isArray(stored.blocklist) ? stored.blocklist : [],
    allowlist: Array.isArray(stored.allowlist) ? stored.allowlist : [],
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await storageSet({ [KEY]: settings });
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = mergeSettings({ ...(await loadSettings()), ...patch });
  await saveSettings(next);
  return next;
}

export function watchSettings(cb: (settings: Settings) => void): void {
  onStorageChanged(() => {
    void loadSettings().then(cb);
  });
}

/** Normalize a hostname for list comparison: strip a leading "www.". */
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/**
 * Does `host` match a list entry? Entries match the exact host or any
 * subdomain, so "example.com" also covers "shop.example.com".
 */
export function hostMatches(host: string, list: readonly string[]): boolean {
  const h = normalizeHost(host);
  return list.some((entry) => {
    const e = normalizeHost(entry.trim());
    if (!e) return false;
    return h === e || h.endsWith(`.${e}`);
  });
}

/** Should the extension act on this host at all? */
export function isEnabledForHost(settings: Settings, host: string): boolean {
  if (!settings.enabled) return false;
  if (hostMatches(host, settings.blocklist)) return false;
  return true;
}
