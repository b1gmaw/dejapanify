/**
 * The landing page's live demo.
 *
 * Deliberately imports the extension's real detection and conversion modules
 * rather than reimplementing them, so what a visitor sees on the page is
 * exactly what the extension would do -- and so the demo cannot silently drift
 * away from the shipped behaviour.
 */
import { detectField, type FieldDescriptor } from '../core/detect.js';
import { normalizeValue, needsNormalization } from '../core/normalize.js';
import { FIELD_KIND_LABELS, DEFAULT_SETTINGS } from '../core/types.js';

interface DemoField {
  el: HTMLInputElement;
  descriptor: Partial<FieldDescriptor>;
  original: string;
}

const fields: DemoField[] = [];

function describeFromDom(el: HTMLInputElement): Partial<FieldDescriptor> {
  return {
    type: el.type,
    name: el.name,
    id: el.id,
    placeholder: el.placeholder,
    autocomplete: el.getAttribute('autocomplete') ?? '',
    pattern: el.pattern ?? '',
    inputMode: el.getAttribute('inputmode') ?? '',
    maxLength: el.maxLength,
    labelText: el.dataset.label ?? '',
    hintText: el.dataset.hint ?? '',
  };
}

/** Render the decision for one field into its explanation slot. */
function explain(el: HTMLInputElement, message: string, state: 'idle' | 'ok' | 'skip'): void {
  const slot = document.querySelector<HTMLElement>(`[data-explain="${el.id}"]`);
  if (!slot) return;
  slot.textContent = message;
  slot.dataset.state = state;
}

function convert(field: DemoField): void {
  const { el, descriptor } = field;
  const detection = detectField(descriptor);

  if (!detection || detection.confidence < DEFAULT_SETTINGS.minConfidence) {
    explain(el, 'No conclusive signal — left alone.', 'skip');
    el.dataset.converted = 'false';
    return;
  }

  const options = { stripSeparators: detection.stripSeparators };
  const kindLabel = FIELD_KIND_LABELS[detection.kind].split(' (')[0]!;
  const why = detection.signals[0]?.evidence ?? 'field attributes';

  if (!needsNormalization(el.value, detection.kind, options)) {
    explain(el, `Already ${kindLabel} — nothing to change.`, 'idle');
    el.dataset.converted = 'false';
    return;
  }

  const before = el.value;
  el.value = normalizeValue(before, detection.kind, options);
  el.dataset.converted = 'true';
  explain(el, `${kindLabel} に変換 · ${why}`, 'ok');

  const chip = document.querySelector<HTMLElement>(`[data-chip="${el.id}"]`);
  if (chip) {
    chip.hidden = false;
    chip.querySelector('.chip-label')!.textContent = `${kindLabel}に変換`;
    const undo = chip.querySelector<HTMLButtonElement>('.chip-undo')!;
    undo.onclick = () => {
      el.value = before;
      chip.hidden = true;
      el.dataset.converted = 'false';
      explain(el, 'Reverted.', 'idle');
    };
    window.setTimeout(() => { chip.hidden = true; }, 6000);
  }
}

function init(): void {
  for (const el of Array.from(document.querySelectorAll<HTMLInputElement>('[data-demo-field]'))) {
    const field: DemoField = { el, descriptor: describeFromDom(el), original: el.value };
    fields.push(field);
    el.addEventListener('blur', () => convert(field));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
  }

  document.getElementById('demo-fill')?.addEventListener('click', () => {
    for (const f of fields) {
      f.el.value = f.el.dataset.sample ?? '';
      f.el.dataset.converted = 'false';
      explain(f.el, '', 'idle');
      const chip = document.querySelector<HTMLElement>(`[data-chip="${f.el.id}"]`);
      if (chip) chip.hidden = true;
    }
    fields[0]?.el.focus();
  });

  document.getElementById('demo-convert')?.addEventListener('click', () => {
    for (const f of fields) convert(f);
  });

  document.getElementById('demo-reset')?.addEventListener('click', () => {
    for (const f of fields) {
      f.el.value = '';
      f.el.dataset.converted = 'false';
      explain(f.el, '', 'idle');
      const chip = document.querySelector<HTMLElement>(`[data-chip="${f.el.id}"]`);
      if (chip) chip.hidden = true;
    }
  });
}

/**
 * Point the install buttons at whatever the visitor is actually running.
 * Chromium browsers other than Edge get the honest message: without a Chrome
 * Web Store listing there is no one-click path for them.
 */
function detectBrowser(): 'firefox' | 'edge' | 'chromium' | 'other' {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome\/|Chromium\//.test(ua)) return 'chromium';
  return 'other';
}

function setupInstall(): void {
  const browser = detectBrowser();
  document.documentElement.dataset.browser = browser;

  const panel = document.querySelector<HTMLElement>(`[data-install="${browser}"]`);
  if (panel) panel.dataset.primary = 'true';

  const label = document.getElementById('detected-browser');
  if (label) {
    label.textContent = {
      firefox: 'Firefox',
      edge: 'Microsoft Edge',
      chromium: 'Chrome or another Chromium browser',
      other: 'your browser',
    }[browser];
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init(); setupInstall(); });
} else {
  init();
  setupInstall();
}
