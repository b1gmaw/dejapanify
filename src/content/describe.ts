/**
 * Builds a FieldDescriptor from a live DOM element.
 *
 * Kept separate from core/detect.ts so the classification logic stays testable
 * without a browser, and so all the messy DOM archaeology lives in one place.
 */
import type { FieldDescriptor } from '../core/detect.js';
import { cleanLabel } from '../core/errors.js';

export type EditableField = HTMLInputElement | HTMLTextAreaElement;
/** Anything a form asks the user to fill or choose, for reading only. */
export type FormControl = EditableField | HTMLSelectElement;

/**
 * Hint text is capped: a field sitting inside a content-heavy table cell would
 * otherwise absorb paragraphs of unrelated prose and trip the keyword matcher.
 */
const MAX_HINT_CHARS = 240;

export function isEditableField(node: unknown): node is EditableField {
  return (
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement
  );
}

/** Text of every <label> associated with the element. */
function labelTextFor(el: FormControl): string {
  const parts: string[] = [];

  // labels is a live list covering both `for=` and wrapping labels.
  const labels = (el as HTMLInputElement).labels;
  if (labels) {
    for (const label of Array.from(labels)) {
      parts.push(label.textContent ?? '');
    }
  }

  // aria-labelledby wins where the site uses ARIA instead of <label>.
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const node = el.ownerDocument.getElementById(id);
      if (node) parts.push(node.textContent ?? '');
    }
  }

  return clean(parts.join(' '));
}

/**
 * Collect the note text sites print beside an input. Walks outward from the
 * field through the containers Japanese forms conventionally use, stopping as
 * soon as something substantive is found.
 */
function hintTextFor(el: EditableField): string {
  const parts: string[] = [];

  const describedBy = el.getAttribute('aria-describedby');
  if (describedBy) {
    for (const id of describedBy.split(/\s+/)) {
      const node = el.ownerDocument.getElementById(id);
      if (node) parts.push(node.textContent ?? '');
    }
  }

  // Immediate siblings: 「<input><span>半角数字</span>」 is extremely common.
  for (const sib of [el.previousElementSibling, el.nextElementSibling]) {
    if (sib && !containsField(sib)) parts.push(sib.textContent ?? '');
  }

  // Then the enclosing cell / definition / form row.
  const container = el.closest('td, dd, li, .form-group, .form-item, .field, p');
  if (container) {
    parts.push(textExcludingFields(container));
    parts.push(rowHeaderFor(el));
  }

  return clean(parts.join(' ')).slice(0, MAX_HINT_CHARS);
}

/**
 * The heading of the form row a field sits in: the row's <th> in a table
 * layout, or the preceding <dt> in a definition list.
 */
export function rowHeaderFor(el: Element): string {
  const container = el.closest('td, dd, li, .form-group, .form-item, .field, p');
  const row = container?.closest('tr');
  const header = row?.querySelector('th');
  if (header) return clean(header.textContent ?? '');
  if (container?.tagName === 'DD') {
    const dt = container.previousElementSibling;
    if (dt?.tagName === 'DT') return clean(dt.textContent ?? '');
  }
  return '';
}

function legendFor(el: Element): string {
  return clean(el.closest('fieldset')?.querySelector('legend')?.textContent ?? '');
}

/** The element holding one question of a form: its label, its fields, its error message. */
export function formRowOf(el: Element): Element {
  return el.closest('tr, dd, li, .form-group, .form-item, .field, fieldset') ?? el.parentElement ?? el;
}

/**
 * What a person would call the field: 「お名前」, not "name1". A radio button's
 * own label is one of its choices (男性), so its row heading comes first.
 */
export function displayNameFor(el: FormControl): string {
  const choice = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');
  const sources = choice
    ? [rowHeaderFor(el), legendFor(el), labelTextFor(el)]
    : [labelTextFor(el), rowHeaderFor(el), leadingTextFor(el), el.getAttribute('aria-label') ?? '', legendFor(el)];
  for (const text of sources) {
    const name = cleanLabel(text);
    if (name) return name;
  }
  return el.name || el.id;
}

/**
 * The text printed directly before a field, back to the previous field: the
 * 「姓」 in 「姓 <input> 名 <input>」. Split fields often share one cell and one
 * header, so this is the only text that tells them apart. Falls back to the
 * cell before when the field sits alone in its own (「<th>姓</th><td><input>」).
 */
export function leadingTextFor(el: FormControl): string {
  const before = (start: Node | null): string => {
    let out = '';
    for (let n = start; n; n = n.previousSibling) {
      if (n instanceof Element && containsField(n)) break;
      out = `${n.textContent ?? ''} ${out}`;
      if (out.length > 40) break;
    }
    return clean(out);
  };
  const own = before(el.previousSibling);
  if (own || !el.parentElement || el.previousElementSibling) return own.slice(-40);
  return before(el.parentElement.previousSibling).slice(-40);
}

function containsField(node: Element): boolean {
  return node.querySelector('input, textarea, select') !== null || isEditableField(node);
}

/**
 * Text content of a container minus the values of any inputs inside it, so a
 * neighbouring field's contents never leak into this field's hint text.
 */
function textExcludingFields(container: Element): string {
  let out = '';
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('script, style, select, option')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    out += ` ${n.textContent ?? ''}`;
    if (out.length > MAX_HINT_CHARS * 2) break;
  }
  return out;
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function describeField(el: EditableField): FieldDescriptor {
  const type = (el instanceof HTMLInputElement ? el.type : 'textarea').toLowerCase();
  return {
    type,
    name: el.name ?? '',
    id: el.id ?? '',
    placeholder: el.placeholder ?? '',
    ariaLabel: el.getAttribute('aria-label') ?? '',
    autocomplete: el.getAttribute('autocomplete') ?? '',
    inputMode: el.getAttribute('inputmode') ?? '',
    pattern: el instanceof HTMLInputElement ? el.pattern ?? '' : '',
    maxLength: el.maxLength ?? -1,
    className: typeof el.className === 'string' ? el.className : '',
    labelText: labelTextFor(el),
    hintText: hintTextFor(el),
    value: el.value,
  };
}

/** Fields that are present but must never be written to. */
export function isWritable(el: EditableField): boolean {
  return !el.readOnly && !el.disabled;
}
