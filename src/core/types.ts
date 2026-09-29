/** What a given form field actually wants, expressed as a normalization target. */
export type FieldKind =
  | 'katakana-full'   // 全角カタカナ  — フリガナ fields
  | 'katakana-half'   // 半角カタカナ  — legacy banking / 振込名義
  | 'hiragana'        // ひらがな      — ふりがな fields
  | 'digits-half'     // 半角数字      — 電話番号 / 郵便番号
  | 'digits-full'     // 全角数字      — rare, some government forms
  | 'alnum-half'      // 半角英数字    — email, IDs, passwords-adjacent
  | 'alnum-full'      // 全角英数字    — rare
  | 'text-full'       // 全角          — 氏名, 住所
  | 'text-half';      // 半角          — generic half-width

/** Where a detection came from, in ascending order of trustworthiness. */
export type SignalSource =
  | 'keyword'        // matched 電話 / kana / etc. in a label or name attribute
  | 'autocomplete'   // the autocomplete attribute
  | 'inputmode'      // inputmode / type attributes
  | 'example'        // the page's own example value, e.g. 例：090-1234-5678
  | 'hint-text'      // the page literally said 「半角数字」
  | 'pattern';       // the pattern attribute's character classes

/** What a numeric field holds, which decides how separators are applied. */
export type NumberRole = 'phone' | 'postal' | 'amount';

/**
 * What to do with hyphens or commas in a numeric field:
 *   strip — remove them (ハイフンなし, or an example with none)
 *   add   — insert them where they belong (ハイフンあり, or an example with them)
 *   keep  — leave what the user typed, only normalising width
 */
export type SeparatorPolicy = 'strip' | 'add' | 'keep';

export type LetterCase = 'upper' | 'lower';

export interface Signal {
  source: SignalSource;
  kind: FieldKind;
  /** 0-1. Combined multiplicatively with the source weight. */
  confidence: number;
  /** Human-readable reason, surfaced in the popup and in debug mode. */
  evidence: string;
}

export interface Detection {
  kind: FieldKind;
  confidence: number;
  signals: Signal[];
  /** The page asked for no hyphens (ハイフンなし) in a numeric field. */
  stripSeparators: boolean;
  /** Separator handling for numeric fields; 'strip' iff stripSeparators. */
  separators: SeparatorPolicy;
  /** What the numeric field holds, when it can be told. */
  numberRole?: NumberRole;
  /** Group sizes from a hyphenated example or pattern, e.g. [3, 4]. */
  exampleGroups?: number[];
  /** The page asked for capitals (or lowercase) — latin letters only. */
  letterCase?: LetterCase;
  /** The field's maxlength; formatting never produces a longer value. */
  maxLength?: number;
  /** The page asked for a fixed digit count, e.g. pattern="\d{7}". */
  expectedDigits?: number;
}

export interface NormalizeOptions {
  /** Trim leading/trailing whitespace. Safe and almost always wanted. */
  trim: boolean;
  /** Collapse internal whitespace runs to a single separator. */
  collapseSpaces: boolean;
  /** Remove hyphens/spaces from numeric fields that ask for digits only. */
  stripSeparators: boolean;
  /** Rewrite dash-likes to ー inside kana fields. */
  normalizeProlonged: boolean;
  /** Overrides stripSeparators when set. */
  separators?: SeparatorPolicy;
  numberRole?: NumberRole;
  exampleGroups?: number[];
  letterCase?: LetterCase;
  maxLength?: number;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  trim: true,
  collapseSpaces: false,
  stripSeparators: false,
  normalizeProlonged: true,
};

export interface Settings {
  enabled: boolean;
  /** Convert as the user types (after IME commit) rather than only on blur. */
  convertOnInput: boolean;
  /** Show the small inline "converted" indicator. */
  showIndicator: boolean;
  /** Only run on pages that look Japanese. */
  japaneseOnly: boolean;
  /** Minimum confidence before a field is touched. 0-1. */
  minConfidence: number;
  /** Hostnames where the extension must never run. */
  blocklist: string[];
  /** Hostnames to run on even when japaneseOnly would skip them. */
  allowlist: string[];
  /** Per-kind master switches. */
  kinds: Record<FieldKind, boolean>;
  /** Log detection decisions to the console. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  convertOnInput: false,
  showIndicator: true,
  japaneseOnly: true,
  minConfidence: 0.5,
  blocklist: [],
  allowlist: [],
  kinds: {
    'katakana-full': true,
    'katakana-half': true,
    'hiragana': true,
    'digits-half': true,
    'digits-full': true,
    'alnum-half': true,
    'alnum-full': true,
    'text-full': true,
    'text-half': true,
  },
  debug: false,
};

export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  'katakana-full': '全角カタカナ (full-width katakana)',
  'katakana-half': '半角カタカナ (half-width katakana)',
  'hiragana': 'ひらがな (hiragana)',
  'digits-half': '半角数字 (half-width digits)',
  'digits-full': '全角数字 (full-width digits)',
  'alnum-half': '半角英数字 (half-width alphanumeric)',
  'alnum-full': '全角英数字 (full-width alphanumeric)',
  'text-full': '全角 (full-width)',
  'text-half': '半角 (half-width)',
};
