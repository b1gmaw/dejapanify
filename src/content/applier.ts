/**
 * Writes a converted value back into a form field.
 *
 * Three constraints make this harder than `el.value = next`:
 *
 * 1. Frameworks. React tracks input values on its own and ignores a plain
 *    assignment, so a naive write is silently reverted on the next render. The
 *    native prototype setter plus a synthetic `input` event is the standard way
 *    through, and `execCommand` avoids the problem entirely.
 * 2. Undo. Assigning to `.value` wipes the browser's native undo stack, so the
 *    user cannot Ctrl+Z our conversion. `execCommand('insertText')` registers
 *    as a normal edit and keeps undo working, so it is tried first.
 * 3. The IME. Writing mid-composition corrupts the composition buffer and can
 *    leave duplicated text, so conversion never runs while `isComposing`.
 */
import type { EditableField } from './describe.js';

const nativeValueSetter = (el: EditableField): ((v: string) => void) | null => {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (!desc?.set) return null;
  return desc.set.bind(el);
};

/** Tracks fields whose IME composition is in flight. */
const composing = new WeakSet<EditableField>();

export function markComposing(el: EditableField, active: boolean): void {
  if (active) composing.add(el);
  else composing.delete(el);
}

export function isComposing(el: EditableField): boolean {
  return composing.has(el);
}

/**
 * Set `el`'s value to `next`, preserving undo history where possible and
 * notifying any framework bound to the field.
 *
 * Returns the previous value so the caller can offer an undo.
 */
export function setFieldValue(el: EditableField, next: string): string {
  const previous = el.value;
  if (previous === next) return previous;

  const selectionWasAtEnd =
    el.selectionStart === previous.length && el.selectionEnd === previous.length;
  const anchor = el.selectionStart ?? previous.length;

  let applied = false;

  // Preferred path: an editing command the browser records in its undo stack.
  // Deprecated but still implemented in Chromium and Gecko, and nothing else
  // preserves Ctrl+Z. Guarded because it throws in some sandboxed contexts.
  if (document.activeElement === el) {
    try {
      el.setSelectionRange(0, previous.length);
      applied = document.execCommand('insertText', false, next);
    } catch {
      applied = false;
    }
  }

  // Fallback: native setter so React/Vue observe the change, then announce it.
  if (!applied || el.value !== next) {
    const setter = nativeValueSetter(el);
    if (setter) setter(next);
    else el.value = next;
    dispatch(el);
  }

  restoreCaret(el, next, anchor, previous.length, selectionWasAtEnd);
  return previous;
}

function dispatch(el: EditableField): void {
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

/**
 * Put the caret back somewhere sensible. Conversion can change the string
 * length (ｶﾞ -> ガ halves it), so the offset is scaled rather than restored
 * verbatim.
 */
function restoreCaret(
  el: EditableField,
  next: string,
  anchor: number,
  previousLength: number,
  wasAtEnd: boolean,
): void {
  if (document.activeElement !== el) return;
  try {
    if (wasAtEnd || previousLength === 0) {
      el.setSelectionRange(next.length, next.length);
      return;
    }
    const ratio = anchor / previousLength;
    const pos = Math.max(0, Math.min(next.length, Math.round(next.length * ratio)));
    el.setSelectionRange(pos, pos);
  } catch {
    /* number inputs and some types forbid selection APIs */
  }
}

/** Restore a previous value, used by the undo affordance. */
export function revertFieldValue(el: EditableField, previous: string): void {
  const setter = nativeValueSetter(el);
  if (setter) setter(previous);
  else el.value = previous;
  dispatch(el);
}
