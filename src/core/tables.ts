/**
 * Character tables for half-width (半角) <-> full-width (全角) conversion.
 *
 * These are written out explicitly rather than derived from Unicode
 * normalization forms. `String.prototype.normalize('NFKC')` is tempting but
 * wrong for this job: it decomposes voiced katakana inconsistently across
 * engines, destroys the prolonged sound mark distinction (ー vs ｰ vs －), and
 * happily rewrites characters in fields we must leave alone.
 */

/** Half-width katakana base letters -> full-width katakana. */
export const HANKAKU_KANA_TO_ZENKAKU: Readonly<Record<string, string>> = {
  '｡': '。', '｢': '「', '｣': '」', '､': '、', '･': '・',
  'ｦ': 'ヲ', 'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
  'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ', 'ｯ': 'ッ', 'ｰ': 'ー',
  'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
  'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
  'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
  'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
  'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
  'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
  'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
  'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
  'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
  'ﾜ': 'ワ', 'ﾝ': 'ン',
  'ﾞ': '゛', 'ﾟ': '゜',
};

/** Half-width base + ﾞ (dakuten) -> single precomposed full-width katakana. */
export const HANKAKU_DAKUTEN_TO_ZENKAKU: Readonly<Record<string, string>> = {
  'ｳ': 'ヴ',
  'ｶ': 'ガ', 'ｷ': 'ギ', 'ｸ': 'グ', 'ｹ': 'ゲ', 'ｺ': 'ゴ',
  'ｻ': 'ザ', 'ｼ': 'ジ', 'ｽ': 'ズ', 'ｾ': 'ゼ', 'ｿ': 'ゾ',
  'ﾀ': 'ダ', 'ﾁ': 'ヂ', 'ﾂ': 'ヅ', 'ﾃ': 'デ', 'ﾄ': 'ド',
  'ﾊ': 'バ', 'ﾋ': 'ビ', 'ﾌ': 'ブ', 'ﾍ': 'ベ', 'ﾎ': 'ボ',
  'ﾜ': 'ヷ', 'ｦ': 'ヺ',
};

/** Half-width base + ﾟ (handakuten) -> single precomposed full-width katakana. */
export const HANKAKU_HANDAKUTEN_TO_ZENKAKU: Readonly<Record<string, string>> = {
  'ﾊ': 'パ', 'ﾋ': 'ピ', 'ﾌ': 'プ', 'ﾍ': 'ペ', 'ﾎ': 'ポ',
};

function invert(...maps: Readonly<Record<string, string>>[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const map of maps) {
    for (const [from, to] of Object.entries(map)) {
      if (!(to in out)) out[to] = from;
    }
  }
  return out;
}

/** Full-width katakana -> half-width, including the two-codepoint voiced forms. */
export const ZENKAKU_KANA_TO_HANKAKU: Readonly<Record<string, string>> = (() => {
  const plain = invert(HANKAKU_KANA_TO_ZENKAKU);
  const out: Record<string, string> = { ...plain };
  for (const [base, composed] of Object.entries(HANKAKU_DAKUTEN_TO_ZENKAKU)) {
    out[composed] = base + 'ﾞ';
  }
  for (const [base, composed] of Object.entries(HANKAKU_HANDAKUTEN_TO_ZENKAKU)) {
    out[composed] = base + 'ﾟ';
  }
  // Small kana with no half-width equivalent fall back to their large form.
  out['ヵ'] = 'ｶ';
  out['ヶ'] = 'ｹ';
  out['ヮ'] = 'ﾜ';
  return out;
})();

/** Standalone voiced marks that may arrive as combining or spacing characters. */
export const DAKUTEN_MARKS = new Set(['ﾞ', '゛', '゙']);
export const HANDAKUTEN_MARKS = new Set(['ﾟ', '゜', '゚']);

/**
 * Dash-like characters that users and IMEs produce where a katakana prolonged
 * sound mark (ー U+30FC) is required. Japanese forms reject every one of these.
 */
export const DASH_LIKE = new Set([
  '-', // - hyphen-minus
  '‐', // ‐ hyphen
  '‑', // ‑ non-breaking hyphen
  '‒', // ‒ figure dash
  '–', // – en dash
  '—', // — em dash
  '―', // ― horizontal bar
  '−', // − minus sign
  '－', // － full-width hyphen-minus
  'ｰ', // ｰ half-width prolonged sound mark
  'ー', // ー full-width prolonged sound mark
  '­', // soft hyphen
]);

export const PROLONGED_SOUND_MARK = 'ー'; // ー
export const HALFWIDTH_PROLONGED_SOUND_MARK = 'ｰ'; // ｰ
export const ASCII_HYPHEN = '-';
export const IDEOGRAPHIC_SPACE = '　';

/** Full-width punctuation/symbols with no ASCII counterpart in the FF01-FF5E block. */
export const EXTRA_FULL_TO_HALF: Readonly<Record<string, string>> = {
  '　': ' ',
  '￥': '\\', // ￥ -> backslash (JIS keyboards produce ￥ where \ is meant)
  '￣': '~',  // ￣
  '￤': '|',  // ￤
  '‘': "'", '’': "'",
  '“': '"', '”': '"',
};

export const EXTRA_HALF_TO_FULL: Readonly<Record<string, string>> = {
  ' ': '　',
};
