/**
 * Pure string conversion primitives. No DOM, no browser APIs — everything here
 * is unit-testable in isolation.
 */
import {
  HANKAKU_KANA_TO_ZENKAKU,
  HANKAKU_DAKUTEN_TO_ZENKAKU,
  HANKAKU_HANDAKUTEN_TO_ZENKAKU,
  ZENKAKU_KANA_TO_HANKAKU,
  DAKUTEN_MARKS,
  HANDAKUTEN_MARKS,
  DASH_LIKE,
  PROLONGED_SOUND_MARK,
  HALFWIDTH_PROLONGED_SOUND_MARK,
  ASCII_HYPHEN,
  IDEOGRAPHIC_SPACE,
  EXTRA_FULL_TO_HALF,
  EXTRA_HALF_TO_FULL,
} from './tables.js';

const ASCII_WIDTH_OFFSET = 0xfee0;

/** ！-～ (U+FF01-U+FF5E) -> !-~, plus ideographic space and stray symbols. */
export function toHalfWidthAscii(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCodePoint(code - ASCII_WIDTH_OFFSET);
    } else if (ch in EXTRA_FULL_TO_HALF) {
      out += EXTRA_FULL_TO_HALF[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

/** !-~ -> ！-～, plus space -> ideographic space. */
export function toFullWidthAscii(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x21 && code <= 0x7e) {
      out += String.fromCodePoint(code + ASCII_WIDTH_OFFSET);
    } else if (ch in EXTRA_HALF_TO_FULL) {
      out += EXTRA_HALF_TO_FULL[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

/** Full-width digits ０-９ -> 0-9, leaving everything else untouched. */
export function digitsToHalfWidth(input: string): string {
  return input.replace(/[０-９]/g, (ch) =>
    String.fromCodePoint(ch.codePointAt(0)! - ASCII_WIDTH_OFFSET),
  );
}

/** 0-9 -> ０-９. */
export function digitsToFullWidth(input: string): string {
  return input.replace(/[0-9]/g, (ch) =>
    String.fromCodePoint(ch.codePointAt(0)! + ASCII_WIDTH_OFFSET),
  );
}

/**
 * Half-width katakana -> full-width, combining ﾞ/ﾟ into precomposed glyphs.
 * `ｶﾞｷﾞｮｳ` becomes `ガギョウ`, not `カ゛キ゛ョウ`.
 */
export function kanaToFullWidth(input: string): string {
  let out = '';
  const chars = [...input];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const next = chars[i + 1];
    if (next !== undefined && DAKUTEN_MARKS.has(next)) {
      const composed = HANKAKU_DAKUTEN_TO_ZENKAKU[ch];
      if (composed) {
        out += composed;
        i++;
        continue;
      }
    }
    if (next !== undefined && HANDAKUTEN_MARKS.has(next)) {
      const composed = HANKAKU_HANDAKUTEN_TO_ZENKAKU[ch];
      if (composed) {
        out += composed;
        i++;
        continue;
      }
    }
    out += HANKAKU_KANA_TO_ZENKAKU[ch] ?? ch;
  }
  return out;
}

/** Full-width katakana -> half-width, decomposing ガ into ｶﾞ. */
export function kanaToHalfWidth(input: string): string {
  let out = '';
  for (const ch of input) {
    out += ZENKAKU_KANA_TO_HANKAKU[ch] ?? ch;
  }
  return out;
}

/** ひらがな -> カタカナ (U+3041-U+3096 plus the iteration marks). */
export function hiraganaToKatakana(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x3041 && code <= 0x3096) {
      out += String.fromCodePoint(code + 0x60);
    } else if (code === 0x309d || code === 0x309e) {
      out += String.fromCodePoint(code + 0x60); // ゝゞ -> ヽヾ
    } else {
      out += ch;
    }
  }
  return out;
}

/** カタカナ -> ひらがな. Characters with no hiragana form are left alone. */
export function katakanaToHiragana(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCodePoint(code - 0x60);
    } else if (code === 0x30fd || code === 0x30fe) {
      out += String.fromCodePoint(code - 0x60); // ヽヾ -> ゝゞ
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Normalize every dash-like character to the katakana prolonged sound mark.
 * Only safe inside kana fields: `ー` in a phone number would be wrong.
 */
export function normalizeProlongedMark(input: string, target: string = PROLONGED_SOUND_MARK): string {
  let out = '';
  for (const ch of input) {
    out += DASH_LIKE.has(ch) ? target : ch;
  }
  return out;
}

/** Normalize dash-likes to an ASCII hyphen. Used for phone/postal fields. */
export function normalizeHyphen(input: string): string {
  let out = '';
  for (const ch of input) {
    out += DASH_LIKE.has(ch) ? ASCII_HYPHEN : ch;
  }
  return out;
}

/** Collapse runs of whitespace (incl. 全角スペース) and trim the ends. */
export function collapseWhitespace(input: string): string {
  return input.replace(/[\s　]+/g, ' ').trim();
}

export function trimEdges(input: string): string {
  return input.replace(/^[\s　]+|[\s　]+$/g, '');
}

/** Replace ASCII spaces with 全角スペース, the separator Japanese name fields expect. */
export function spacesToFullWidth(input: string): string {
  return input.replace(/ /g, IDEOGRAPHIC_SPACE);
}

export function spacesToHalfWidth(input: string): string {
  return input.replace(/　/g, ' ');
}

/** Strip every character that is not an ASCII digit. */
export function digitsOnly(input: string): string {
  return digitsToHalfWidth(input).replace(/[^0-9]/g, '');
}

export { PROLONGED_SOUND_MARK, HALFWIDTH_PROLONGED_SOUND_MARK, IDEOGRAPHIC_SPACE };
