/**
 * Reads the instructions Japanese forms print next to their inputs.
 *
 * This is the single highest-signal detector in the extension. Sites that
 * demand a particular width almost always say so in the label or a note beside
 * the field — 「半角数字で入力してください」, 「全角カタカナ」, 「ハイフンなし」 —
 * so parsing that text tells us the answer directly instead of guessing from
 * the field's name.
 */
import type { FieldKind } from './types.js';

export interface HintResult {
  kind?: FieldKind;
  confidence: number;
  /** 「ハイフンなし」/「ハイフン抜き」: remove separators after converting. */
  stripSeparators: boolean;
  /** The matched substring, kept for the debug overlay. */
  evidence: string;
}

interface HintRule {
  pattern: RegExp;
  kind: FieldKind;
  confidence: number;
}

/**
 * Ordered most-specific first. `半角カタカナ` must win over a bare `半角`,
 * so the first match short-circuits.
 */
const HINT_RULES: readonly HintRule[] = [
  // --- Kana, fully qualified -------------------------------------------------
  { pattern: /全角\s*[カかｶ][タたﾀ][カかｶ][ナなﾅ]/, kind: 'katakana-full', confidence: 0.99 },
  { pattern: /半角\s*[カかｶ][タたﾀ][カかｶ][ナなﾅ]/, kind: 'katakana-half', confidence: 0.99 },
  { pattern: /全角\s*[カか]ナ/, kind: 'katakana-full', confidence: 0.97 },
  { pattern: /半角\s*[カか]ナ/, kind: 'katakana-half', confidence: 0.97 },
  { pattern: /カタカナ(?:で|のみ|で入力|で記入)/, kind: 'katakana-full', confidence: 0.9 },
  { pattern: /全角\s*(?:ひらがな|平仮名)/, kind: 'hiragana', confidence: 0.99 },
  { pattern: /(?:ひらがな|平仮名)(?:で|のみ|で入力|で記入)/, kind: 'hiragana', confidence: 0.9 },

  // --- Alphanumeric ----------------------------------------------------------
  { pattern: /半角\s*(?:英数字?|英字と数字|英数記号|ローマ字|アルファベット)/, kind: 'alnum-half', confidence: 0.97 },
  { pattern: /全角\s*(?:英数字?|英字|アルファベット)/, kind: 'alnum-full', confidence: 0.95 },

  // --- Digits ----------------------------------------------------------------
  { pattern: /半角\s*(?:の)?\s*数字/, kind: 'digits-half', confidence: 0.98 },
  { pattern: /全角\s*(?:の)?\s*数字/, kind: 'digits-full', confidence: 0.95 },
  { pattern: /数字(?:は)?半角/, kind: 'digits-half', confidence: 0.95 },

  // --- Bare width markers (weakest, must stay last) --------------------------
  { pattern: /半角\s*(?:で|にて)?(?:入力|記入|ご入力)/, kind: 'alnum-half', confidence: 0.7 },
  { pattern: /全角\s*(?:で|にて)?(?:入力|記入|ご入力)/, kind: 'text-full', confidence: 0.7 },
  { pattern: /半角/, kind: 'alnum-half', confidence: 0.55 },
  { pattern: /全角/, kind: 'text-full', confidence: 0.55 },
];

const STRIP_SEPARATOR_RULES: readonly RegExp[] = [
  /ハイフン\s*(?:なし|無し|ぬき|抜き|不要|は不要|は入力しない)/,
  /[-－ー]\s*(?:なし|無し|不要)/,
  /記号\s*(?:なし|無し|不要)/,
  /(?:数字|番号)\s*のみ/,
  /スペース\s*(?:なし|無し|不要)/,
];

const KEEP_SEPARATOR_RULES: readonly RegExp[] = [
  /ハイフン\s*(?:あり|有り|込み|を含|必須|付き)/,
  /ハイフン\s*[（(]?\s*[-－]\s*[)）]?\s*(?:を|も)?\s*(?:入力|含)/,
];

/**
 * Scan a blob of label / placeholder / note text for width instructions.
 * Returns the first (most specific) match.
 */
export function parseHintText(text: string): HintResult {
  const normalized = text.replace(/\s+/g, ' ');
  const result: HintResult = { confidence: 0, stripSeparators: false, evidence: '' };

  for (const rule of HINT_RULES) {
    const match = rule.pattern.exec(normalized);
    if (match) {
      result.kind = rule.kind;
      result.confidence = rule.confidence;
      result.evidence = match[0];
      break;
    }
  }

  const keeps = KEEP_SEPARATOR_RULES.some((re) => re.test(normalized));
  if (!keeps) {
    const stripMatch = STRIP_SEPARATOR_RULES.find((re) => re.test(normalized));
    if (stripMatch) {
      result.stripSeparators = true;
      if (!result.evidence) result.evidence = stripMatch.exec(normalized)?.[0] ?? '';
    }
  }

  return result;
}

/** Does this page look Japanese enough to be worth processing? */
export function looksJapanese(text: string): boolean {
  let japanese = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= 0x3040 && code <= 0x30ff) || // kana
      (code >= 0x4e00 && code <= 0x9fff) || // CJK unified ideographs
      (code >= 0xff66 && code <= 0xff9f)    // half-width katakana
    ) {
      japanese++;
      if (japanese >= 8) return true;
    }
  }
  return false;
}
