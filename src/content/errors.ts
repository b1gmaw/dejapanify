/**
 * Finds the fields a form is unhappy with, and names them.
 *
 * Two kinds of evidence, kept apart:
 *
 * - What the page has marked as an error: aria-invalid, an error class, or an
 *   error message shown in the field's row or in a summary banner. This is
 *   only ever looked for after the page had a chance to reject something.
 * - What is certainly wrong by the page's own declarations: a required field
 *   left empty, a value its pattern rejects. This decides pre-flight, and
 *   names the culprits behind a vague 「入力内容に誤りがあります」.
 *
 * Password, hidden, file and payment fields are never examined.
 */
import { isPaymentField } from '../core/keywords.js';
import {
  cleanLabel,
  isErrorText,
  isRequiredMarker,
  labelsInMessage,
  preflightProblem,
  REASON_TEXT,
} from '../core/errors.js';
import { displayNameFor, formRowOf, rowHeaderFor, type FormControl } from './describe.js';

export interface Problem {
  /** The field to jump to: the first in its row that needs attention. */
  el: FormControl;
  name: string;
  reason: string;
  /** Still a problem? Checked as the user edits. */
  stillWrong(): boolean;
}

const SKIPPED_TYPES = new Set(['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image']);

/** Fields worth checking in `scope`, in document order. */
export function controlsIn(scope: ParentNode): FormControl[] {
  return Array.from(scope.querySelectorAll('input, textarea, select')).filter(
    (n): n is FormControl => {
      if (!(n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || n instanceof HTMLSelectElement)) {
        return false;
      }
      if (n instanceof HTMLInputElement && SKIPPED_TYPES.has(n.type)) return false;
      if (n.disabled) return false;
      const haystack = `${n.name} ${n.id} ${rowHeaderFor(n)}`;
      return !isPaymentField(haystack, n.getAttribute('autocomplete') ?? '');
    },
  );
}

/** Is the element rendered? Layout-free, so it also holds in tests. */
export function isShown(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n instanceof HTMLElement && n.hidden) return false;
    const style = view?.getComputedStyle(n);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

/**
 * A class token naming an error state. Angular's ng-invalid is deliberately
 * not one: Angular puts it on every empty required field from the start.
 */
function isErrorClass(token: string): boolean {
  if (/^ng-/i.test(token)) return false;
  return (
    /^(error|errors|err|invalid|is-invalid|has-error|is-error|field-error|form-error|input-error)$/i.test(token) ||
    /[-_](error|err)$/i.test(token)
  );
}

function hasErrorClass(el: Element): boolean {
  return Array.from(el.classList).some(isErrorClass);
}

function isChoice(el: FormControl): el is HTMLInputElement {
  return el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');
}

/** The radio buttons or checkboxes sharing `el`'s name, or just `el`. */
function choiceGroup(el: HTMLInputElement): HTMLInputElement[] {
  const scope = el.form ?? el.ownerDocument;
  return Array.from(scope.querySelectorAll<HTMLInputElement>(`input[type="${el.type}"]`)).filter(
    (n) => n.name === el.name && (el.name !== '' || n === el),
  );
}

export function isRequired(el: FormControl): boolean {
  if (isChoice(el) && choiceGroup(el).some((n) => n.required)) return true;
  if (el.required || el.getAttribute('aria-required') === 'true') return true;
  const label = Array.from((el as HTMLInputElement).labels ?? [])
    .map((l) => l.textContent ?? '')
    .join(' ');
  return isRequiredMarker(label) || isRequiredMarker(rowHeaderFor(el));
}

/** What is certainly wrong with this field by its own declarations, if anything. */
export function certainProblem(el: FormControl): string | null {
  if (isChoice(el)) {
    if (!isRequired(el)) return null;
    return choiceGroup(el).some((n) => n.checked) ? null : REASON_TEXT.empty;
  }
  const problem = preflightProblem({
    required: isRequired(el),
    value: el.value,
    pattern: el instanceof HTMLInputElement ? el.pattern : undefined,
    maxLength: el instanceof HTMLSelectElement ? undefined : el.maxLength,
  });
  return problem ? REASON_TEXT[problem] : null;
}

interface Row {
  row: Element;
  fields: FormControl[];
  name: string;
}

/** Fields grouped by form row, so tel1/tel2/tel3 or 姓/名 are one entry. */
function rowsIn(scope: ParentNode): Row[] {
  const rows = new Map<Element, FormControl[]>();
  for (const el of controlsIn(scope)) {
    if (!isShown(el)) continue;
    const row = formRowOf(el);
    const list = rows.get(row);
    if (list) list.push(el);
    else rows.set(row, [el]);
  }
  return Array.from(rows, ([row, fields]) => {
    const distinct = new Set(fields.map((f) => (isChoice(f) ? f.name || f : f)));
    const header = distinct.size > 1 ? cleanLabel(rowHeaderFor(fields[0]!)) : '';
    return { row, fields, name: header || displayNameFor(fields[0]!) };
  });
}

/** The page's own error message inside a row, if it shows one. */
function rowMessage(row: Element): string | null {
  for (const node of Array.from(row.querySelectorAll('[role="alert"], [class]'))) {
    if (node.querySelector('input, textarea, select')) continue;
    if (!(node.getAttribute('role') === 'alert' || hasErrorClass(node))) continue;
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    // A red note that is always there (「※半角数字」) is styling, not an error.
    if (text && isErrorText(text) && isShown(node)) return text.slice(0, 60);
  }
  return null;
}

function rowIsMarked(r: Row): boolean {
  return (
    hasErrorClass(r.row) ||
    r.fields.some((f) => f.getAttribute('aria-invalid') === 'true' || hasErrorClass(f))
  );
}

/** Lines of a summary banner: its list items, else its text split at <br> and blocks. */
function linesOf(el: Element): string[] {
  const items = Array.from(el.querySelectorAll('li'));
  if (items.length > 0) return items.map((li) => (li.textContent ?? '').trim()).filter(Boolean);
  const lines: string[] = [''];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) lines[lines.length - 1] += child.textContent ?? '';
      else if (child instanceof Element) {
        const block = child.tagName === 'BR' || /^(P|DIV)$/.test(child.tagName);
        if (block) lines.push('');
        walk(child);
        if (block) lines.push('');
      }
    }
  };
  walk(el);
  return lines.map((l) => l.trim()).filter(Boolean);
}

/** Visible error banners outside any field's row: 「入力内容に誤りがあります」. */
export function summaryBanners(scope: ParentNode, rows: readonly Element[]): Element[] {
  const found: Element[] = [];
  for (const node of Array.from(scope.querySelectorAll('[role="alert"], [class]'))) {
    if (!(node.getAttribute('role') === 'alert' || hasErrorClass(node))) continue;
    if (node.querySelector('input, textarea, select')) continue;
    if (rows.some((r) => r.contains(node))) continue;
    if (found.some((f) => f.contains(node))) continue;
    const text = node.textContent ?? '';
    if (isErrorText(text) && isShown(node)) found.push(node);
  }
  return found;
}

/**
 * Error elements the page is showing now. Used as a baseline before a proceed
 * attempt, so only what appears afterwards counts as a rejection.
 */
export function errorSignals(scope: ParentNode = document): Set<Element> {
  const rows = rowsIn(scope);
  const signals = new Set<Element>(summaryBanners(scope, rows.map((r) => r.row)));
  for (const r of rows) {
    if (rowIsMarked(r) || rowMessage(r.row)) signals.add(r.row);
  }
  return signals;
}

function problemFor(r: Row, reason: string): Problem {
  const first = r.fields.find((f) => certainProblem(f)) ?? r.fields[0]!;
  return {
    el: first,
    name: r.name,
    reason,
    stillWrong: () => r.fields.some((f) => certainProblem(f) !== null),
  };
}

/**
 * Every field the page has rejected, named. When the page rejected something
 * without saying what -- a banner and no marked fields -- the fields that are
 * certainly wrong are listed instead, since they are the likely culprits.
 */
export function collectProblems(scope: ParentNode = document): Problem[] {
  const rows = rowsIn(scope);
  const banners = summaryBanners(scope, rows.map((r) => r.row));
  const lines = banners.flatMap(linesOf);
  const fromBanner = new Map<number, string>();
  for (const line of lines) {
    for (const i of labelsInMessage(line, rows.map((r) => r.name))) {
      if (!fromBanner.has(i)) fromBanner.set(i, line.slice(0, 60));
    }
  }

  const problems: Problem[] = [];
  rows.forEach((r, i) => {
    const message = rowMessage(r.row) ?? fromBanner.get(i);
    if (message || rowIsMarked(r)) {
      problems.push(problemFor(r, message ?? REASON_TEXT.marked));
    }
  });
  if (problems.length > 0 || banners.length === 0) return problems;
  return certainProblems(scope);
}

/** Fields that are certainly wrong right now, for pre-flight. */
export function certainProblems(scope: ParentNode = document): Problem[] {
  const problems: Problem[] = [];
  for (const r of rowsIn(scope)) {
    const reason = r.fields.map(certainProblem).find((p) => p !== null);
    if (reason) problems.push(problemFor(r, reason));
  }
  return problems;
}
