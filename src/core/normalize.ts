/** Maps a detected FieldKind onto the actual string transformation. */
import {
  toHalfWidthAscii,
  toFullWidthAscii,
  digitsToHalfWidth,
  digitsToFullWidth,
  kanaToFullWidth,
  kanaToHalfWidth,
  hiraganaToKatakana,
  katakanaToHiragana,
  normalizeProlongedMark,
  normalizeHyphen,
  collapseWhitespace,
  trimEdges,
  spacesToFullWidth,
  spacesToHalfWidth,
} from './convert.js';
import {
  HALFWIDTH_PROLONGED_SOUND_MARK,
  PROLONGED_SOUND_MARK,
} from './tables.js';
import type { FieldKind, NormalizeOptions } from './types.js';
import { DEFAULT_NORMALIZE_OPTIONS } from './types.js';

/**
 * Japanese letters: hiragana, katakana proper, kanji, and half-width katakana.
 *
 * Deliberately excludes the prolonged sound mark ー (U+30FC), which sits just
 * outside the katakana letter range, because it legitimately appears in phone
 * numbers typed with an IME and must still be normalized to a hyphen there.
 */
const JAPANESE_LETTER = /[\u3041-\u3096\u30A1-\u30FA\u4E00-\u9FFF\uFF66-\uFF9F]/;

/**
 * Convert `value` into the form `kind` requires.
 *
 * The transforms are deliberately conservative: a kana field converts kana and
 * leaves any stray latin characters alone, because silently rewriting a user's
 * text into something they did not type is worse than letting the site's own
 * validator complain.
 */
export function normalizeValue(
  value: string,
  kind: FieldKind,
  options: Partial<NormalizeOptions> = {},
): string {
  const opts = { ...DEFAULT_NORMALIZE_OPTIONS, ...options };
  let out = value;

  switch (kind) {
    case 'katakana-full': {
      out = kanaToFullWidth(out);
      out = hiraganaToKatakana(out);
      if (opts.normalizeProlonged) out = normalizeProlongedMark(out, PROLONGED_SOUND_MARK);
      out = spacesToFullWidth(out);
      break;
    }
    case 'katakana-half': {
      out = hiraganaToKatakana(out);
      out = kanaToHalfWidth(out);
      if (opts.normalizeProlonged) {
        out = normalizeProlongedMark(out, HALFWIDTH_PROLONGED_SOUND_MARK);
      }
      out = toHalfWidthAscii(out);
      break;
    }
    case 'hiragana': {
      out = kanaToFullWidth(out);
      out = katakanaToHiragana(out);
      if (opts.normalizeProlonged) out = normalizeProlongedMark(out, PROLONGED_SOUND_MARK);
      out = spacesToFullWidth(out);
      break;
    }
    case 'digits-half': {
      // Refuse to touch prose. A numeric field never legitimately contains
      // kana or kanji, so their presence means the field was misidentified --
      // and hyphen normalization would wreck the text, turning コーヒー into
      // コ-ヒ-. Doing nothing is always the safer failure here.
      if (JAPANESE_LETTER.test(out)) return value;
      out = digitsToHalfWidth(out);
      out = normalizeHyphen(out);
      out = spacesToHalfWidth(out);
      if (opts.stripSeparators) out = out.replace(/[-\s]/g, '');
      break;
    }
    case 'digits-full': {
      if (JAPANESE_LETTER.test(out)) return value;
      out = digitsToFullWidth(out);
      break;
    }
    case 'alnum-half':
    case 'text-half': {
      // Only ASCII width is touched. Narrowing kana here was actively harmful:
      // a field asking for 半角英数字 is not made valid by turning コーヒー into
      // ｺｰﾋｰ, and on a misidentified field it mangles ordinary Japanese.
      out = toHalfWidthAscii(out);
      break;
    }
    case 'alnum-full':
    case 'text-full': {
      out = kanaToFullWidth(out);
      out = toFullWidthAscii(out);
      break;
    }
  }

  if (opts.collapseSpaces) {
    const collapsed = collapseWhitespace(out);
    out = kind === 'katakana-full' || kind === 'hiragana' || kind === 'text-full'
      ? spacesToFullWidth(collapsed)
      : collapsed;
  }
  if (opts.trim) out = trimEdges(out);

  return out;
}

/** True when normalizing would actually change the value. */
export function needsNormalization(
  value: string,
  kind: FieldKind,
  options: Partial<NormalizeOptions> = {},
): boolean {
  if (value === '') return false;
  return normalizeValue(value, kind, options) !== value;
}
