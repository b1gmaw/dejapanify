/**
 * Binds detected fields and runs conversions.
 *
 * Conversion fires on blur and again as a sweep on submit. Blur is when the
 * user has finished with a field and is also when most sites run their own
 * validation, so converting there is both safe and early enough to matter. The
 * submit sweep is the safety net for values the user never focused, such as
 * browser autofill.
 */
import { detectField } from '../core/detect.js';
import { normalizeValue, needsNormalization } from '../core/normalize.js';
import type { Detection, Settings } from '../core/types.js';
import { describeField, isEditableField, isWritable, type EditableField } from './describe.js';
import { setFieldValue, revertFieldValue, markComposing, isComposing } from './applier.js';
import { showConversion, destroyIndicator } from './indicator.js';

interface Bound {
  detection: Detection;
  /** Value before our most recent conversion, for undo. */
  lastOriginal?: string;
}

const bound = new WeakMap<EditableField, Bound>();
const seen = new WeakSet<EditableField>();
let settings: Settings;
let converted = 0;
let detectedCount = 0;

export function setSettings(next: Settings): void {
  settings = next;
  if (!settings.showIndicator) destroyIndicator();
}

export function getStats(): { detected: number; converted: number } {
  return { detected: detectedCount, converted };
}

/** Examine an element and, if it looks convertible, bind our listeners. */
export function considerField(el: EditableField): void {
  if (seen.has(el)) return;
  seen.add(el);
  if (!isWritable(el)) return;

  const descriptor = describeField(el);
  const detection = detectField(descriptor);
  if (!detection) return;
  if (detection.confidence < settings.minConfidence) {
    if (settings.debug) {
      console.debug('[dejapanify] below threshold', descriptor.name || descriptor.id, detection);
    }
    return;
  }
  if (!settings.kinds[detection.kind]) return;

  bound.set(el, { detection });
  detectedCount++;

  if (settings.debug) {
    console.debug(
      `[dejapanify] ${descriptor.name || descriptor.id || '(anonymous)'} -> ${detection.kind}`,
      { confidence: detection.confidence.toFixed(2), signals: detection.signals },
    );
  }

  el.addEventListener('compositionstart', () => markComposing(el, true));
  el.addEventListener('compositionend', () => {
    markComposing(el, false);
    if (settings.convertOnInput) convertField(el, 'input');
  });
  el.addEventListener('blur', () => convertField(el, 'blur'));

  el.dataset.dejapanifyKind = detection.kind;
}

/** Convert one field if it needs it. Returns true when a change was made. */
export function convertField(el: EditableField, trigger: 'blur' | 'submit' | 'input'): boolean {
  const entry = bound.get(el);
  if (!entry || !settings.enabled) return false;
  if (isComposing(el)) return false;
  if (!isWritable(el)) return false;

  const { detection } = entry;
  const options = { stripSeparators: detection.stripSeparators };
  const current = el.value;
  if (!needsNormalization(current, detection.kind, options)) return false;

  const next = normalizeValue(current, detection.kind, options);
  const previous = setFieldValue(el, next);
  entry.lastOriginal = previous;
  converted++;

  if (settings.debug) {
    console.debug(`[dejapanify] ${trigger}: ${JSON.stringify(previous)} -> ${JSON.stringify(next)}`);
  }

  // A submit sweep must not paint chips over a page that is navigating away.
  if (settings.showIndicator && trigger !== 'submit') {
    showConversion(el, detection.kind, () => {
      revertFieldValue(el, previous);
      converted = Math.max(0, converted - 1);
    });
  }

  return true;
}

/** Convert every bound field inside a form. Used on submit. */
export function sweepForm(form: HTMLFormElement): number {
  let changed = 0;
  for (const el of Array.from(form.elements)) {
    if (isEditableField(el) && bound.has(el)) {
      if (convertField(el, 'submit')) changed++;
    }
  }
  return changed;
}

/** Convert every bound field on the page, regardless of form membership. */
export function sweepAll(rootNode: ParentNode = document): number {
  let changed = 0;
  for (const el of Array.from(rootNode.querySelectorAll('input, textarea'))) {
    if (isEditableField(el) && bound.has(el)) {
      if (convertField(el, 'submit')) changed++;
    }
  }
  return changed;
}

export function isBound(el: EditableField): boolean {
  return bound.has(el);
}
