/** Options page: every persisted setting, edited directly. */
import { loadSettings, saveSettings } from '../shared/settings.js';
import { DEFAULT_SETTINGS, FIELD_KIND_LABELS, type FieldKind, type Settings } from '../core/types.js';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const toggles = ['enabled', 'japaneseOnly', 'showIndicator', 'convertOnInput', 'debug'] as const;
type ToggleKey = (typeof toggles)[number];

const kindsEl = $('kinds');
const confEl = $<HTMLInputElement>('minConfidence');
const confOut = $<HTMLOutputElement>('minConfidenceOut');
const blockEl = $<HTMLTextAreaElement>('blocklist');
const allowEl = $<HTMLTextAreaElement>('allowlist');
const savedEl = $('saved');

function buildKindCheckboxes(): void {
  for (const [kind, label] of Object.entries(FIELD_KIND_LABELS) as [FieldKind, string][]) {
    const wrap = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.kind = kind;
    const text = document.createElement('span');
    text.textContent = label;
    wrap.append(box, text);
    kindsEl.appendChild(wrap);
  }
}

function apply(settings: Settings): void {
  for (const key of toggles) {
    $<HTMLInputElement>(key).checked = settings[key as ToggleKey];
  }
  confEl.value = String(settings.minConfidence);
  confOut.textContent = settings.minConfidence.toFixed(2);
  blockEl.value = settings.blocklist.join('\n');
  allowEl.value = settings.allowlist.join('\n');
  for (const box of Array.from(kindsEl.querySelectorAll<HTMLInputElement>('input[data-kind]'))) {
    box.checked = settings.kinds[box.dataset.kind as FieldKind] ?? true;
  }
}

function collect(base: Settings): Settings {
  const kinds = { ...base.kinds };
  for (const box of Array.from(kindsEl.querySelectorAll<HTMLInputElement>('input[data-kind]'))) {
    kinds[box.dataset.kind as FieldKind] = box.checked;
  }
  const lines = (v: string) =>
    v.split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    ...base,
    enabled: $<HTMLInputElement>('enabled').checked,
    japaneseOnly: $<HTMLInputElement>('japaneseOnly').checked,
    showIndicator: $<HTMLInputElement>('showIndicator').checked,
    convertOnInput: $<HTMLInputElement>('convertOnInput').checked,
    debug: $<HTMLInputElement>('debug').checked,
    minConfidence: Number(confEl.value),
    blocklist: lines(blockEl.value),
    allowlist: lines(allowEl.value),
    kinds,
  };
}

function flash(message: string): void {
  savedEl.textContent = message;
  window.setTimeout(() => (savedEl.textContent = ''), 1800);
}

confEl.addEventListener('input', () => {
  confOut.textContent = Number(confEl.value).toFixed(2);
});

$('save').addEventListener('click', async () => {
  const current = await loadSettings();
  await saveSettings(collect(current));
  flash('Saved');
});

$('reset').addEventListener('click', async () => {
  await saveSettings({ ...DEFAULT_SETTINGS });
  apply({ ...DEFAULT_SETTINGS });
  flash('Reset to defaults');
});

void (async () => {
  buildKindCheckboxes();
  apply(await loadSettings());
})();
