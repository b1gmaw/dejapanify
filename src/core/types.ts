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
  | 'hint-text'      // the page literally said 「半角数字」
  | 'pattern';       // the pattern attribute's character classes

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
