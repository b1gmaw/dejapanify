/**
 * Reads the instructions Japanese forms print next to their inputs.
 *
 * This is the single highest-signal detector in the extension. Sites that
 * demand a particular width almost always say so in the label or a note beside
 * the field — 「半角数字で入力してください」, 「全角カタカナ」, 「ハイフンなし」 —
 * so parsing that text tells us the answer directly instead of guessing from
 * the field's name.
 */
import type { FieldKind, LetterCase } from './types.js';

export type SeparatorInstruction = 'strip' | 'add';

export interface HintResult {
  kind?: FieldKind;
  confidence: number;
  /** 「ハイフンなし」/「ハイフン抜き」: remove separators after converting. */
  stripSeparators: boolean;
  /** What the page said about hyphens: ハイフンなし → strip, ハイフンあり → add. */
  hyphens?: SeparatorInstruction;
  /** What the page said about commas: カンマ不要 → strip, 3桁区切り → add. */
  commas?: SeparatorInstruction;
  /** The page asked for capitals (大文字, "capital letters") or lowercase. */
  letterCase?: LetterCase;
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

const STRIP_HYPHEN_RULES: readonly RegExp[] = [
  /ハイフン\s*(?:なし|無し|ぬき|抜き|不要|は不要|は入力しない)/,
  /[-－ー]\s*(?:なし|無し|不要)/,
  /\b(?:without|no)\s+(?:hyphens?|dashes)\b/i,
];

const ADD_HYPHEN_RULES: readonly RegExp[] = [
  /ハイフン\s*(?:あり|有り|込み|を含|必須|付き)/,
  /ハイフン\s*[（(]?\s*[-－]\s*[)）]?\s*(?:を|も)?\s*(?:入力|含)/,
  /\b(?:with|including)\s+(?:hyphens?|dashes)\b/i,
];

const STRIP_COMMA_RULES: readonly RegExp[] = [
  /(?:カンマ|コンマ|[,，])\s*(?:なし|無し|ぬき|抜き|不要|は不要|は入力しない)/,
  /\bwithout\s+commas?\b|\bno\s+commas?\b/i,
];

/**
 * Deliberately narrow. 「カンマ区切りで入力」 on its own usually means "separate
 * several items with commas", a list, not thousands grouping; only phrasing
 * that names three-digit grouping counts.
 */
const ADD_COMMA_RULES: readonly RegExp[] = [
  /[3３]\s*桁\s*(?:ごと|毎)?\s*(?:に|で)?\s*(?:の)?\s*(?:カンマ|コンマ|[,，])?\s*(?:区切|を付)/,
  /(?:カンマ|コンマ)\s*(?:付き|あり|有り)/,
];

/** Instructions that remove every separator at once. */
const STRIP_ALL_RULES: readonly RegExp[] = [
  /記号\s*(?:なし|無し|不要)/,
  /(?:数字|番号)\s*のみ/,
  /スペース\s*(?:なし|無し|不要)/,
  /\b(?:digits|numbers)\s+only\b/i,
];

/**
 * Phrases that mention letter case without asking for a conversion: a
 * case-sensitivity notice, or a rule a password must satisfy. Any of these
 * vetoes case conversion outright, because uppercasing a case-sensitive value
 * changes what it is.
 */
const CASE_VETO_RULES: readonly RegExp[] = [
  /区別/,                                      // 大文字・小文字を区別します
  /大文字.{0,6}小文字|小文字.{0,6}大文字/,     // both cases named together
  /大小/,                                      // 大小文字
  /(?:大文字|小文字)\s*(?:を|が)?\s*(?:[0-9０-９一二三]+\s*文字以上)?\s*(?:含|混)/, // must contain
  /case[-\s]?(?:in)?sensitive/i,
  /\b(?:upper|lower)\s*(?:and|&|\/|or)\s*(?:upper|lower)\s*case\b/i,
  /\bmixed\s*case\b/i,
  /\bat\s+least\s+(?:one|1)\b/i,
  /\bmust\s+(?:contain|include)\b/i,
];

const UPPER_RULES: readonly RegExp[] = [
  /大文字/,
  /\b(?:capital|block)\s+letters?\b/i,
  /\b(?:in|block|all)\s+capitals\b/i,
  /\bupper\s*-?\s*case\b/i,
  /\ball\s+caps\b/i,
];

const LOWER_RULES: readonly RegExp[] = [
  /小文字/,
  /\blower\s*-?\s*case\b/i,
  /\bsmall\s+letters\b/i,
];

/** What the text says about letter case, or nothing if it's unclear. */
export function parseLetterCase(text: string): LetterCase | undefined {
  if (CASE_VETO_RULES.some((re) => re.test(text))) return undefined;
  const upper = UPPER_RULES.some((re) => re.test(text));
  const lower = LOWER_RULES.some((re) => re.test(text));
  if (upper && !lower) return 'upper';
  if (lower && !upper) return 'lower';
  return undefined;
}

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

  const note = (re: RegExp) => {
    if (!result.evidence) result.evidence = re.exec(normalized)?.[0] ?? '';
  };
  const first = (rules: readonly RegExp[]) => rules.find((re) => re.test(normalized));

  // An explicit "with" beats a "without", so an add instruction is checked
  // first: 「ハイフンありで入力（ハイフンなしは不可）」 means add.
  const addHyphen = first(ADD_HYPHEN_RULES);
  const stripHyphen = first(STRIP_HYPHEN_RULES);
  const stripAll = first(STRIP_ALL_RULES);
  if (addHyphen) {
    result.hyphens = 'add';
  } else if (stripHyphen ?? stripAll) {
    result.hyphens = 'strip';
    note((stripHyphen ?? stripAll)!);
  }

  const addComma = first(ADD_COMMA_RULES);
  const stripComma = first(STRIP_COMMA_RULES);
  if (addComma) result.commas = 'add';
  else if (stripComma ?? stripAll) {
    result.commas = 'strip';
    note((stripComma ?? stripAll)!);
  }

  result.stripSeparators = result.hyphens === 'strip';
  const letterCase = parseLetterCase(normalized);
  if (letterCase) result.letterCase = letterCase;
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
