/**
 * Combines every available signal into a single Detection.
 *
 * Deliberately DOM-free: the content script builds a FieldDescriptor from an
 * element and hands it here, which keeps the classification logic testable
 * without a browser and makes its decisions easy to reason about.
 */
import { parseHintText } from './hints.js';
import { analyzePattern } from './pattern.js';
import { matchKeywords, AUTOCOMPLETE_MAP, INPUT_TYPE_MAP } from './keywords.js';
import type { Detection, FieldKind, Signal, SignalSource } from './types.js';

/** A plain, serializable snapshot of everything we know about one input. */
export interface FieldDescriptor {
  /** input type, lowercased. */
  type: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  autocomplete: string;
  inputMode: string;
  pattern: string;
  maxLength: number;
  className: string;
  /** Text of the associated <label>. */
  labelText: string;
  /** Nearby note/hint text: aria-describedby, sibling nodes, table cell. */
  hintText: string;
  /** Current value, used only to break ties. */
  value?: string;
}

/** How much each source is trusted relative to the others. */
const SOURCE_WEIGHT: Record<SignalSource, number> = {
  pattern: 1.0,
  'hint-text': 0.95,
  autocomplete: 0.8,
  inputmode: 0.7,
  keyword: 0.65,
};

export const EMPTY_DESCRIPTOR: FieldDescriptor = {
  type: 'text',
  name: '',
  id: '',
  placeholder: '',
  ariaLabel: '',
  autocomplete: '',
  inputMode: '',
  pattern: '',
  maxLength: -1,
  className: '',
  labelText: '',
  hintText: '',
};

/** Field types we must never touch. */
const UNSAFE_TYPES = new Set([
  'password', 'hidden', 'file', 'submit', 'reset', 'button', 'image',
  'checkbox', 'radio', 'range', 'color', 'date', 'datetime-local',
  'month', 'week', 'time',
]);

export function isConvertibleType(type: string): boolean {
  return !UNSAFE_TYPES.has(type.toLowerCase());
}

export function detectField(descriptor: Partial<FieldDescriptor>): Detection | null {
  const d: FieldDescriptor = { ...EMPTY_DESCRIPTOR, ...descriptor };
  if (!isConvertibleType(d.type)) return null;

  const signals: Signal[] = [];
  let stripSeparators = false;
  let expectedDigits: number | undefined;

  // --- 1. pattern attribute (strongest: it is the enforced rule) -------------
  if (d.pattern) {
    const p = analyzePattern(d.pattern);
    if (p.kind) {
      signals.push({ source: 'pattern', kind: p.kind, confidence: p.confidence, evidence: p.evidence });
    }
    if (p.stripSeparators) stripSeparators = true;
    if (p.expectedDigits !== undefined) expectedDigits = p.expectedDigits;
  }

  // --- 2. printed hint text -------------------------------------------------
  const hintBlob = [d.labelText, d.hintText, d.placeholder, d.ariaLabel]
    .filter(Boolean)
    .join(' ');
  if (hintBlob) {
    const h = parseHintText(hintBlob);
    if (h.kind) {
      signals.push({ source: 'hint-text', kind: h.kind, confidence: h.confidence, evidence: `hint: ${h.evidence}` });
    }
    if (h.stripSeparators) stripSeparators = true;
  }

  // --- 3. autocomplete ------------------------------------------------------
  if (d.autocomplete) {
    // "shipping tel" / "section-a billing postal-code" -> last token wins
    const token = d.autocomplete.toLowerCase().trim().split(/\s+/).pop() ?? '';
    const kind = AUTOCOMPLETE_MAP[token];
    if (kind) {
      signals.push({ source: 'autocomplete', kind, confidence: 0.85, evidence: `autocomplete="${token}"` });
    }
  }

  // --- 4. type / inputmode --------------------------------------------------
  const typeKind = INPUT_TYPE_MAP[d.type] ?? INPUT_TYPE_MAP[d.inputMode.toLowerCase()];
  if (typeKind) {
    const attr = INPUT_TYPE_MAP[d.type] ? `type="${d.type}"` : `inputmode="${d.inputMode}"`;
    signals.push({ source: 'inputmode', kind: typeKind, confidence: 0.8, evidence: attr });
  }

  // --- 5. keywords in name/id/label/placeholder/class -----------------------
  const keywordBlob = [d.name, d.id, d.className, d.labelText, d.placeholder, d.ariaLabel]
    .filter(Boolean)
    .join(' ');
  const kw = matchKeywords(keywordBlob);
  if (kw) {
    signals.push({ source: 'keyword', kind: kw.kind, confidence: kw.confidence, evidence: kw.evidence });
  }

  if (signals.length === 0) return null;

  // --- Score: sum weighted confidence per kind, highest wins ----------------
  const scores = new Map<FieldKind, number>();
  for (const s of signals) {
    const weighted = s.confidence * SOURCE_WEIGHT[s.source];
    scores.set(s.kind, (scores.get(s.kind) ?? 0) + weighted);
  }

  let best: FieldKind | null = null;
  let bestScore = 0;
  for (const [kind, score] of scores) {
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  if (!best) return null;

  // Saturate into 0-1. Calibrated so one unambiguous signal already clears the
  // default 0.5 threshold -- a bare 「フリガナ」 label (0.85 x 0.65 = 0.55) is the
  // most common field in Japanese forms and must convert on its own -- while a
  // merely suggestive one does not. A plain 「住所」 label scores 0.39 and is
  // left alone, because rewriting an address to full-width on a guess is worse
  // than doing nothing. Agreeing signals stack toward certainty.
  const confidence = Math.min(1, bestScore);

  const detection: Detection = {
    kind: best,
    confidence,
    signals: signals.filter((s) => s.kind === best),
    stripSeparators: stripSeparators && (best === 'digits-half' || best === 'digits-full'),
  };
  if (expectedDigits !== undefined) detection.expectedDigits = expectedDigits;
  return detection;
}
