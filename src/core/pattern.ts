/**
 * Infers the wanted width from an input's `pattern` attribute.
 *
 * A pattern is the site telling us its validation rule in machine-readable
 * form, which makes it the most reliable signal available — more reliable even
 * than the printed hint text, because it is what the form actually enforces.
 */
import type { FieldKind } from './types.js';

export interface PatternResult {
  kind?: FieldKind;
  confidence: number;
  evidence: string;
  /** Pattern admits no hyphen/space, so separators must be stripped. */
  stripSeparators: boolean;
  /** Fixed length demanded by a {n} quantifier over a digit class. */
  expectedDigits?: number;
}

/** Character-range probes, checked against the raw pattern source. */
const PROBES: readonly { re: RegExp; kind: FieldKind; confidence: number; label: string }[] = [
  // Half-width katakana ranges: ｦ-ﾟ / uFF66-uFF9F
  { re: /(?:ｦ-ﾟ|\\uFF66|ｦ-ﾟ|ｱ-ﾝ)/i, kind: 'katakana-half', confidence: 0.95, label: 'half-width katakana range' },
  // Full-width katakana ranges: ァ-ヶ / ア-ン / u30A1-u30F6
  { re: /(?:ァ-ヶ|ァ-ヺ|ア-ン|\\u30A1|ァ-ヶ|ァ-ン|ア-ン|ァ-ヴ)/i, kind: 'katakana-full', confidence: 0.95, label: 'full-width katakana range' },
  // Hiragana: ぁ-ん / u3041-u3096
  { re: /(?:ぁ-ゖ|ぁ-ゟ|あ-ん|\\u3041|ぁ-ん|あ-ん|ぁ-ゖ)/i, kind: 'hiragana', confidence: 0.95, label: 'hiragana range' },
  // Full-width digits
  { re: /(?:０-９|０-９)/, kind: 'digits-full', confidence: 0.9, label: 'full-width digit range' },
  // Full-width latin
  { re: /(?:Ａ-Ｚ|ａ-ｚ|Ａ-Ｚ|ａ-ｚ)/, kind: 'alnum-full', confidence: 0.9, label: 'full-width latin range' },
];

/** Patterns that are purely ASCII digits, e.g. ^[0-9]{7}$ or ^\d{3}-?\d{4}$. */
const DIGITS_ONLY = /^\^?(?:\[(?:0-9|\\d)\]|\\d)[*+?]?(?:\{\d+(?:,\d*)?\})?\$?$/;

export function analyzePattern(source: string): PatternResult {
  const result: PatternResult = { confidence: 0, evidence: '', stripSeparators: false };
  if (!source) return result;

  for (const probe of PROBES) {
    if (probe.re.test(source)) {
      result.kind = probe.kind;
      result.confidence = probe.confidence;
      result.evidence = `pattern contains ${probe.label}`;
      break;
    }
  }

  if (!result.kind) {
    const body = source.replace(/^\^/, '').replace(/\$$/, '');
    const digitish = /^(?:\[0-9\]|\\d|[0-9-]|\{\d+(?:,\d*)?\}|[*+?()|]|\\-)+$/.test(body);
    if (digitish && /(?:\\d|0-9)/.test(body)) {
      result.kind = 'digits-half';
      result.confidence = 0.92;
      result.evidence = 'pattern accepts ASCII digits only';
      // No hyphen anywhere in the pattern => the field rejects separators.
      result.stripSeparators = !/-/.test(body);
    } else if (/^[\w\\\[\]{}()+*?.,|^$@-]*$/.test(source) && /(?:a-z|A-Z)/.test(source)) {
      result.kind = 'alnum-half';
      result.confidence = 0.8;
      result.evidence = 'pattern accepts ASCII letters only';
    }
  }

  if (DIGITS_ONLY.test(source)) {
    result.stripSeparators = true;
  }

  const fixed = /(?:\\d|\[0-9\])\{(\d+)\}/.exec(source);
  if (fixed?.[1]) {
    const n = Number(fixed[1]);
    if (Number.isFinite(n) && n > 0 && n <= 32) result.expectedDigits = n;
  }

  return result;
}
