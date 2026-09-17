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
      out = digitsToHalfWidth(out);
      out = normalizeHyphen(out);
      out = spacesToHalfWidth(out);
      if (opts.stripSeparators) out = out.replace(/[-\s]/g, '');
      break;
    }
    case 'digits-full': {
      out = digitsToFullWidth(out);
      break;
    }
    case 'alnum-half':
    case 'text-half': {
      out = toHalfWidthAscii(out);
      if (kind === 'alnum-half') out = kanaToHalfWidth(out);
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
