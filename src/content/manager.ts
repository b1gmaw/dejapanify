/**
 * Binds detected fields and runs conversions.
 *
 * Conversion fires on blur and again as a sweep on submit. Blur is when the
 * user has finished with a field and is also when most sites run their own
 * validation, so converting there is both safe and early enough to matter. The
 * submit sweep is the safety net for values the user never focused, such as
 * browser autofill.
 *
 * A field is re-detected at each conversion, not just once, because a form's
 * clearest instruction is often the validation message it prints after the
 * first attempt: 「全角ひらがなで入力してください」 doesn't exist until then.
 */
import { detectField, isOffLimits, type FieldDescriptor } from '../core/detect.js';
import { expandProlongedMark } from '../core/convert.js';
import { normalizeValue, needsNormalization, optionsFor } from '../core/normalize.js';
import type { Detection, Settings } from '../core/types.js';
import { describeField, isEditableField, isWritable, type EditableField } from './describe.js';
import { setFieldValue, revertFieldValue, markComposing, isComposing } from './applier.js';
import { isRejected } from './errors.js';
import { showConversion, showNotice, showSuggestion, destroyIndicator } from './indicator.js';
import { bindSplitPart } from './split.js';

interface Bound {
  detection: Detection;
  /** Value before our most recent conversion, for undo. */
  lastOriginal?: string;
}

const bound = new WeakMap<EditableField, Bound>();
const seen = new WeakSet<EditableField>();
/** The value each field was last offered a respelling for. */
const offered = new WeakMap<EditableField, string>();
let settings: Settings;
let converted = 0;
let detectedCount = 0;

export function setSettings(next: Settings): void {
  settings = next;
  if (!settings.showIndicator) destroyIndicator();
}

export function currentSettings(): Settings {
  return settings;
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
  // Before the width checks: a 姓 box too vague to convert can still be split.
  bindSplitPart(el, descriptor, () => settings);
  if (isOffLimits(descriptor)) return;

  // Listens even with nothing detected yet, for a hint that appears later.
  el.addEventListener('compositionstart', () => markComposing(el, true));
  el.addEventListener('compositionend', () => {
    markComposing(el, false);
    if (settings.convertOnInput) convertField(el, 'input');
  });
  el.addEventListener('blur', () => {
    convertField(el, 'blur');
    offerProlongedFix(el);
  });

  refreshDetection(el, descriptor);
}

function unbind(el: EditableField): void {
  bound.delete(el);
  delete el.dataset.dejapanifyKind;
}

/**
 * Read the field again and record what it is now. Only an equal or stronger
 * reading replaces what was found: an error message disappears once the value
 * satisfies it, and falling back then would undo the very fix it asked for. A
 * field that has turned out to be off limits, or a kind the user switched off,
 * is dropped.
 */
function refreshDetection(el: EditableField, descriptor: FieldDescriptor): Bound | undefined {
  const entry = bound.get(el);
  if (isOffLimits(descriptor)) {
    unbind(el);
    return undefined;
  }
  const detection = detectField(descriptor);
  if (!detection) return entry;
  if (detection.confidence < settings.minConfidence) {
    if (settings.debug) {
      console.debug('[dejapanify] below threshold', descriptor.name || descriptor.id, detection);
    }
    return entry;
  }
  if (entry && detection.confidence < entry.detection.confidence) return entry;
  if (!settings.kinds[detection.kind]) {
    unbind(el);
    return undefined;
  }

  if (entry?.detection.kind !== detection.kind && settings.debug) {
    console.debug(
      `[dejapanify] ${descriptor.name || descriptor.id || '(anonymous)'} -> ${detection.kind}`,
      { confidence: detection.confidence.toFixed(2), signals: detection.signals },
    );
  }
  el.dataset.dejapanifyKind = detection.kind;
  if (entry) {
    entry.detection = detection;
    return entry;
  }
  const created: Bound = { detection };
  bound.set(el, created);
  detectedCount++;
  return created;
}

/** Convert one field if it needs it. Returns true when a change was made. */
export function convertField(el: EditableField, trigger: 'blur' | 'submit' | 'input'): boolean {
  if (!settings.enabled) return false;
  if (isComposing(el)) return false;
  if (!isWritable(el)) return false;
  const entry = refreshDetection(el, describeField(el));
  if (!entry) return false;

  const { detection } = entry;
  const options = optionsFor(detection);
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

/**
 * Some hiragana fields refuse ー, and there is no telling which until the page
 * says so: a rule like /^[ぁ-ん]+$/ usually lives in the site's script. So this
 * waits for the page to reject the value, then offers a respelling. It never
 * applies one unasked, because the spelling of a name is the user's to decide.
 */
function offerProlongedFix(el: EditableField): void {
  if (!settings.enabled || !settings.showIndicator) return;
  if (bound.get(el)?.detection.kind !== 'hiragana') return;
  if (isComposing(el) || !isWritable(el)) return;

  const current = el.value;
  if (offered.get(el) === current) return;
  const respelled = expandProlongedMark(current);
  if (!respelled || !isRejected(el)) return;

  offered.set(el, current);
  showSuggestion(el, `${respelled} に変更しますか？`, '変更する', () => {
    // The user may have kept typing while the chip was up.
    if (el.value !== current) return;
    setFieldValue(el, respelled);
    showNotice(el, `${respelled} に変更`, () => revertFieldValue(el, current));
  });
}

/** Look again at every hiragana field, after the page has changed. */
export function offerProlongedFixes(): void {
  for (const el of Array.from(document.querySelectorAll('[data-dejapanify-kind="hiragana"]'))) {
    if (isEditableField(el)) offerProlongedFix(el);
  }
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
