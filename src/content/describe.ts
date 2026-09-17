/**
 * Builds a FieldDescriptor from a live DOM element.
 *
 * Kept separate from core/detect.ts so the classification logic stays testable
 * without a browser, and so all the messy DOM archaeology lives in one place.
 */
import type { FieldDescriptor } from '../core/detect.js';

export type EditableField = HTMLInputElement | HTMLTextAreaElement;

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
function labelTextFor(el: EditableField): string {
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
    // Table layouts put the label in the <th> or the preceding <td>.
    const row = container.closest('tr');
    if (row) {
      const header = row.querySelector('th');
      if (header) parts.push(header.textContent ?? '');
    }
    // Definition lists put it in the preceding <dt>.
    if (container.tagName === 'DD') {
      const dt = container.previousElementSibling;
      if (dt?.tagName === 'DT') parts.push(dt.textContent ?? '');
    }
  }

  return clean(parts.join(' ')).slice(0, MAX_HINT_CHARS);
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
