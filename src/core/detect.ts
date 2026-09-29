/**
 * Combines every available signal into a single Detection.
 *
 * Deliberately DOM-free: the content script builds a FieldDescriptor from an
 * element and hands it here, which keeps the classification logic testable
 * without a browser and makes its decisions easy to reason about.
 */
import { parseHintText, type HintResult } from './hints.js';
import { analyzePattern } from './pattern.js';
import { exampleFor } from './example.js';
import { matchKeywords, isPaymentField, numberRoleOf, AUTOCOMPLETE_MAP, INPUT_TYPE_MAP } from './keywords.js';
import type {
  Detection,
  FieldKind,
  LetterCase,
  NumberRole,
  SeparatorPolicy,
  Signal,
  SignalSource,
} from './types.js';

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
  // The page's own example is concrete, but a placeholder is sometimes just
  // decoration, so it sits below the printed instruction.
  example: 0.75,
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

  // Payment and banking fields are excluded outright, before any scoring, so
  // no combination of other signals (a 「半角数字」 hint, a digits pattern) can
  // talk the extension into touching a card or account number.
  const identifying = [d.name, d.id, d.className, d.labelText, d.placeholder, d.ariaLabel, d.hintText]
    .filter(Boolean)
    .join(' ');
  if (isPaymentField(identifying, d.autocomplete)) return null;

  const signals: Signal[] = [];
  let expectedDigits: number | undefined;
  let patternSeparators: SeparatorPolicy | undefined;
  let patternGroups: number[] | undefined;
  let letterCase: LetterCase | undefined;

  // --- 1. pattern attribute (strongest: it is the enforced rule) -------------
  if (d.pattern) {
    const p = analyzePattern(d.pattern);
    if (p.kind) {
      signals.push({ source: 'pattern', kind: p.kind, confidence: p.confidence, evidence: p.evidence });
    }
    if (p.stripSeparators) patternSeparators = 'strip';
    if (p.requiresHyphen) {
      patternSeparators = 'add';
      patternGroups = p.groups;
    }
    if (p.expectedDigits !== undefined) expectedDigits = p.expectedDigits;
    letterCase = p.letterCase;
    // ^[A-Z ]+$ admits only latin capitals, so it names the field's kind too,
    // even where the space kept the pattern from reading as alphanumeric.
    if (!p.kind && p.letterCase) {
      signals.push({ source: 'pattern', kind: 'alnum-half', confidence: 0.85, evidence: 'pattern admits one letter case' });
    }
  }

  // --- 2. printed hint text -------------------------------------------------
  const hintBlob = [d.labelText, d.hintText, d.placeholder, d.ariaLabel]
    .filter(Boolean)
    .join(' ');
  let hint: HintResult | undefined;
  if (hintBlob) {
    hint = parseHintText(hintBlob);
    if (hint.kind) {
      signals.push({ source: 'hint-text', kind: hint.kind, confidence: hint.confidence, evidence: `hint: ${hint.evidence}` });
    }
    // The pattern is the enforced rule, so it wins over the prose.
    letterCase ??= hint.letterCase;
    // "Name (in capital letters)" says nothing about width, but a request for
    // capitals is a request for latin letters, i.e. half-width alphanumerics.
    if (!hint.kind && hint.letterCase) {
      signals.push({ source: 'hint-text', kind: 'alnum-half', confidence: 0.9, evidence: 'hint: letter case' });
    }
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

  // --- 6. the page's own example value --------------------------------------
  // Only an example recognisable as a phone number, postal code or amount
  // counts towards the field's kind; a bare "1-2-3" could be anything.
  const example = exampleFor(d.placeholder, d.hintText);
  if (example?.role) {
    signals.push({ source: 'example', kind: 'digits-half', confidence: 0.8, evidence: `example: ${example.text}` });
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

  // --- Separators: only for half-width numeric fields -----------------------
  // Precedence: what the page says, then the enforced pattern, then the page's
  // example, and otherwise leave what the user typed.
  let separators: SeparatorPolicy = 'keep';
  let numberRole: NumberRole | undefined;
  let exampleGroups: number[] | undefined;
  if (best === 'digits-half') {
    numberRole = numberRoleOf(keywordBlob, d.autocomplete, d.type) ?? example?.role;
    const isAmount = numberRole === 'amount';

    // Hyphen instructions govern phones and postal codes; comma instructions
    // govern amounts. 数字のみ strips both.
    const fromHint = isAmount ? hint?.commas : hint?.hyphens;
    // A required hyphen on an amount is nonsense; don't act on it.
    const fromPattern = isAmount && patternSeparators === 'add' ? undefined : patternSeparators;
    // An example only counts when its separator suits the role: commas for
    // amounts, hyphens for everything else. Bare digits suit any role.
    let fromExample: SeparatorPolicy | undefined;
    if (example) {
      const commaExample = /,/.test(example.text);
      const hyphenExample = /-/.test(example.text);
      const suits =
        example.separators === 'strip' ||
        (commaExample && (isAmount || numberRole === undefined)) ||
        (hyphenExample && !isAmount);
      if (suits) fromExample = example.separators;
    }

    separators = fromHint ?? fromPattern ?? fromExample ?? 'keep';
    exampleGroups = patternGroups ?? example?.groups;
  }

  const detection: Detection = {
    kind: best,
    confidence,
    signals: signals.filter((s) => s.kind === best),
    stripSeparators: separators === 'strip',
    separators,
  };
  if (numberRole) detection.numberRole = numberRole;
  if (exampleGroups) detection.exampleGroups = exampleGroups;
  if (expectedDigits !== undefined) detection.expectedDigits = expectedDigits;
  if (d.maxLength > 0) detection.maxLength = d.maxLength;

  // --- Letter case: latin-letter fields only, never email or URLs -----------
  // Email and URLs are case-insensitive where it matters and case-sensitive
  // where it doesn't, so changing them only risks breaking them.
  const latinKind = best === 'alnum-half' || best === 'alnum-full' || best === 'text-half' || best === 'text-full';
  const acToken = d.autocomplete.toLowerCase().trim().split(/\s+/).pop() ?? '';
  const emailOrUrl =
    ['email', 'url'].includes(d.type.toLowerCase()) ||
    ['email', 'url'].includes(acToken) ||
    /mail|メール|url|ホームページ|website/i.test(keywordBlob);
  if (letterCase && latinKind && !emailOrUrl) detection.letterCase = letterCase;

  return detection;
}
