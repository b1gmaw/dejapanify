/**
 * Thin cross-browser shim.
 *
 * Firefox exposes the promise-based `browser` namespace; Chrome exposes
 * callback-style `chrome`. Chrome's MV3 APIs also return promises, so picking
 * whichever global exists gives one promise-based API on both.
 */

type Area = 'sync' | 'local';

interface StorageArea {
  get(keys: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface ExtensionApi {
  storage: {
    sync?: StorageArea;
    local: StorageArea;
    onChanged: {
      addListener(cb: (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => void): void;
      removeListener(cb: (...args: unknown[]) => void): void;
    };
  };
  runtime: {
    id?: string;
    getURL(path: string): string;
    onMessage: {
      addListener(
        cb: (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void,
      ): void;
    };
    sendMessage(message: unknown): Promise<unknown>;
    openOptionsPage?(): Promise<void>;
    lastError?: { message?: string };
  };
  tabs?: {
    query(info: Record<string, unknown>): Promise<{ id?: number; url?: string }[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
}

declare const browser: ExtensionApi | undefined;

export const ext: ExtensionApi = (() => {
  const g = globalThis as unknown as { browser?: ExtensionApi; chrome?: ExtensionApi };
  const api = g.browser ?? g.chrome;
  if (!api) throw new Error('dejapanify: no extension API available');
  return api;
})();

/** True when running inside an extension context (as opposed to a test page). */
export function hasExtensionContext(): boolean {
  try {
    return Boolean(ext.runtime?.id);
  } catch {
    return false;
  }
}

/**
 * Prefer `storage.sync` so settings follow the user between machines, but fall
 * back to `local`: on Firefox `sync` is unavailable without a signed-in
 * account, and Chrome enforces a small sync quota that a long blocklist can
 * exceed.
 */
function area(name: Area): StorageArea {
  if (name === 'sync' && ext.storage.sync) return ext.storage.sync;
  return ext.storage.local;
}

export async function storageGet(defaults: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const got = await area('sync').get(defaults);
    return { ...defaults, ...got };
  } catch {
    try {
      const got = await area('local').get(defaults);
      return { ...defaults, ...got };
    } catch {
      return { ...defaults };
    }
  }
}

export async function storageSet(items: Record<string, unknown>): Promise<void> {
  try {
    await area('sync').set(items);
  } catch {
    await ext.storage.local.set(items);
  }
}

export function onStorageChanged(cb: () => void): void {
  try {
    ext.storage.onChanged.addListener(cb);
  } catch {
    /* storage change events are a nicety, not a requirement */
  }
}
