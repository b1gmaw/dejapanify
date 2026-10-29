/**
 * Split fields: a whole 姓 名 or phone number pasted, autofilled or typed into
 * the first of several boxes is spread across them, and typing a phone number
 * moves on to the next box once one is full.
 *
 * Groups are found when an event fires rather than when fields are bound, so
 * a form that renders its boxes one at a time is still seen whole. Anything
 * that doesn't look exactly like a split field -- a box that already has a
 * value, a paste into the second box, a value with no certain boundary --
 * falls through to the page's own behaviour.
 */
import { isConvertibleType, type FieldDescriptor } from '../core/detect.js';
import { partRoleOf, splitName, splitPhone } from '../core/split.js';
import type { PartRole, Settings } from '../core/types.js';
import { describeField, isEditableField, isWritable, leadingTextFor, type EditableField } from './describe.js';
import { isComposing, revertFieldValue, setFieldValue } from './applier.js';
import { showNotice } from './indicator.js';

interface Group {
  kind: 'phone' | 'name';
  parts: EditableField[];
}

const roles = new WeakMap<EditableField, PartRole | null>();
let getSettings: () => Settings;
/** Set while fill() writes, whose own input events must not re-trigger a split. */
let filling = false;

function roleOf(el: EditableField, descriptor?: FieldDescriptor): PartRole | null {
  let role = roles.get(el);
  if (role === undefined) {
    role = partRoleOf({ ...(descriptor ?? describeField(el)), localLabel: leadingTextFor(el) }) ?? null;
    roles.set(el, role);
  }
  return role;
}

function fieldsIn(container: Element): EditableField[] {
  return Array.from(container.querySelectorAll('input, textarea')).filter(
    (n): n is EditableField =>
      isEditableField(n) && isConvertibleType(n instanceof HTMLInputElement ? n.type : 'textarea'),
  );
}

/** The fields in the nearest ancestor holding more than one: in practice, the form row. */
function rowFields(el: EditableField): EditableField[] {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const fields = fieldsIn(node);
    if (fields.length > 1) return fields;
  }
  return [el];
}

/**
 * The group `el` leads, if any: exactly three phone parts in a row, or a 姓
 * directly followed by its 名.
 */
function groupLedBy(el: EditableField): Group | null {
  const fields = rowFields(el);
  const i = fields.indexOf(el);
  const role = roleOf(el);

  if (role === 'phone') {
    const prev = fields[i - 1];
    const after = fields[i + 3];
    const parts = fields.slice(i, i + 3);
    if (prev && roleOf(prev) === 'phone') return null;
    if (after && roleOf(after) === 'phone') return null;
    if (parts.length !== 3 || !parts.every((p) => roleOf(p) === 'phone')) return null;
    return { kind: 'phone', parts };
  }
  if (role === 'family' || role === 'family-kana') {
    const next = fields[i + 1];
    const wanted = role === 'family' ? 'given' : 'given-kana';
    if (next && roleOf(next) === wanted) return { kind: 'name', parts: [el, next] };
  }
  return null;
}

/** The pieces `text` divides into for `group`, or null when unsure. */
function splitFor(group: Group, text: string): string[] | null {
  if (group.kind === 'name') return splitName(text);
  return splitPhone(text, group.parts.map((p) => p.maxLength));
}

function active(): boolean {
  const settings = getSettings();
  return !filling && settings.enabled && settings.splitFields;
}

/**
 * Write `pieces` across the group. `fromFirst` is what the first box held
 * before, which is not always its current value: on paste nothing has been
 * inserted yet, while after autofill the whole value is already there.
 */
function fill(group: Group, pieces: string[], fromFirst: string, trigger: string): void {
  const previous = group.parts.map((p, i) => (i === 0 ? fromFirst : p.value));
  filling = true;
  try {
    group.parts.forEach((p, i) => setFieldValue(p, pieces[i]!));
  } finally {
    filling = false;
  }
  const settings = getSettings();
  if (settings.debug) {
    console.debug(`[dejapanify] split ${group.kind} on ${trigger}:`, pieces);
  }
  if (settings.showIndicator) {
    const text = group.kind === 'name' ? '姓と名に分けて入力' : '電話番号を分けて入力';
    showNotice(group.parts[0]!, text, () => {
      group.parts.forEach((p, i) => revertFieldValue(p, previous[i]!));
    });
  }
}

function othersEmpty(group: Group): boolean {
  return group.parts.slice(1).every((p) => p.value === '' && isWritable(p));
}

function onPaste(event: Event): void {
  const el = event.currentTarget as EditableField;
  if (!active() || isComposing(el)) return;
  const group = groupLedBy(el);
  if (!group || !othersEmpty(group)) return;
  // The paste must replace the whole box, not land beside what is there.
  const replacesAll = el.value === '' || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
  if (!replacesAll) return;
  const text = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
  const pieces = splitFor(group, text);
  if (!pieces) return;

  event.preventDefault();
  fill(group, pieces, el.value, 'paste');
  group.parts[group.parts.length - 1]!.focus();
}

/** A whole value already in the first box: autofill, or typed then left. */
function splitWhole(el: EditableField, trigger: string): void {
  if (!active() || isComposing(el) || el.value === '') return;
  const group = groupLedBy(el);
  if (!group || !othersEmpty(group)) return;
  const pieces = splitFor(group, el.value);
  if (pieces) fill(group, pieces, el.value, trigger);
}

/** Move to the next phone box once this one holds all the digits it can. */
function advance(el: EditableField, event: InputEvent): void {
  const max = el.maxLength;
  if (max <= 0 || el.value.length !== max || !/^[0-9０-９]+$/.test(el.value)) return;
  if (el.selectionStart !== max) return;
  const fields = rowFields(el);
  const next = fields[fields.indexOf(el) + 1];
  if (!next || roleOf(next) !== 'phone' || next.value !== '' || !isWritable(next)) return;
  if (getSettings().debug) console.debug(`[dejapanify] advance after ${event.inputType}`);
  next.focus();
}

function onInput(event: Event): void {
  const el = event.currentTarget as EditableField;
  if (!active() || isComposing(el)) return;
  const inputType = (event as InputEvent).inputType;
  // Autofill reports insertReplacementText, or no inputType at all in Chrome.
  // A framework's synthetic input event has none either, and is harmless: it
  // splits only a whole value with the other boxes empty, like autofill.
  if (!inputType || inputType === 'insertReplacementText') {
    splitWhole(el, 'autofill');
    return;
  }
  if (inputType.startsWith('insert') && roleOf(el) === 'phone') advance(el, event as InputEvent);
}

/**
 * Listen on `el` if it is one part of a split value. Bound before the width
 * conversion's own listeners, so a whole value is split before either piece
 * is converted.
 */
export function bindSplitPart(
  el: EditableField,
  descriptor: FieldDescriptor,
  settings: () => Settings,
): void {
  getSettings = settings;
  if (!roleOf(el, descriptor)) return;
  el.addEventListener('paste', onPaste);
  el.addEventListener('input', onInput);
  el.addEventListener('blur', () => splitWhole(el, 'blur'));
}
