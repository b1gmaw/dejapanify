/**
 * Reads the example value a form gives for a field.
 *
 * Japanese forms very often show the exact format they want: a placeholder of
 * 090-1234-5678, or a note saying 例：1500001. That example settles questions
 * the label leaves open, such as whether the phone number should carry hyphens
 * or the salary should carry commas.
 */
import type { NumberRole, SeparatorPolicy } from './types.js';

export interface ExampleInfo {
  /** The numeric example as found, width-normalised. */
  text: string;
  /** Hyphens or commas present means 'add'; bare digits means 'strip'. */
  separators: SeparatorPolicy;
  /** Group sizes for a hyphenated example, e.g. [3, 4, 4]. */
  groups?: number[];
  /** What the example looks like: a phone number, a postal code, an amount. */
  role?: NumberRole;
}

/** Markers that introduce an example in hint text: 例：…, 入力例) …, e.g. … */
const MARKER = /(?:入力例|記入例|例)\s*[:：)）]?\s*|(?:e\.g\.|ex\.|example:?)\s*/gi;

/** A number written with optional hyphens or commas, in either width. */
const NUMBER_TOKEN = /[0-9０-９](?:[0-9０-９]|[-－‐―ー−,，](?=[0-9０-９]))*/;

function toHalf(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－‐―ー−]/g, '-')
    .replace(/，/g, ',');
}

/**
 * Candidate examples: the whole placeholder, and whatever follows an example
 * marker in the hint text. An example only counts when the number is the whole
 * of it: "1-2-3 〇〇マンション101" is an address, not a number format.
 */
export function findExamples(placeholder: string, hintText: string): string[] {
  const found: string[] = [];
  const consider = (candidate: string) => {
    const trimmed = candidate
      .trim()
      .replace(/^[(（「『〈]+|[)）」』〉。、．.]+$/g, '')
      .replace(/^(?:入力例|記入例|例)\s*[:：)）]?\s*/, '')
      .trim();
    if (!trimmed) return;
    const m = NUMBER_TOKEN.exec(trimmed);
    if (m && m.index === 0 && m[0].length === trimmed.length) found.push(m[0]);
  };

  if (placeholder) consider(placeholder);
  for (const m of hintText.matchAll(MARKER)) {
    // The example runs until the next space or closing punctuation.
    const rest = hintText.slice(m.index + m[0].length);
    const token = /^[^\s)）」』、。]+/.exec(rest);
    if (token) consider(token[0]);
  }
  return found;
}

/** Interprets a numeric example's format. */
export function analyzeExample(example: string): ExampleInfo | null {
  const text = toHalf(example);

  if (/^\d{1,3}(,\d{3})+$/.test(text)) {
    return { text, separators: 'add', role: 'amount' };
  }

  if (/^\d+(-\d+)+$/.test(text)) {
    const groups = text.split('-').map((g) => g.length);
    const digits = text.replace(/-/g, '');
    let role: NumberRole | undefined;
    if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) role = 'phone';
    else if (groups.length === 2 && groups[0] === 3 && groups[1] === 4) role = 'postal';
    return role ? { text, separators: 'add', groups, role } : { text, separators: 'add', groups };
  }

  if (/^\d+$/.test(text)) {
    let role: NumberRole | undefined;
    if (text.startsWith('0') && (text.length === 10 || text.length === 11)) role = 'phone';
    else if (text.length === 7) role = 'postal';
    else if (text.length >= 4 && !text.startsWith('0')) role = 'amount';
    return role ? { text, separators: 'strip', role } : { text, separators: 'strip' };
  }

  return null;
}

/** The first usable example for a field, if the page gives one. */
export function exampleFor(placeholder: string, hintText: string): ExampleInfo | null {
  for (const candidate of findExamples(placeholder, hintText)) {
    const info = analyzeExample(candidate);
    if (info) return info;
  }
  return null;
}
