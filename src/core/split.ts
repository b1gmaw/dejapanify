/**
 * Values that Japanese forms split across several boxes: 姓 and 名, セイ and
 * メイ, and phone numbers as three boxes of area code, exchange and subscriber.
 *
 * Deciding where a pasted value divides is the whole risk here, so every
 * splitter returns null unless the boundary is certain. 山田太郎 has no
 * knowable boundary, and a phone number whose grouping isn't in the area-code
 * table could split anywhere; both are left for the page to handle as it
 * always has.
 */
import type { FieldDescriptor } from './detect.js';
import { digitsToHalfWidth, normalizeHyphen } from './convert.js';
import { isPaymentField, numberRoleOf, termMatches } from './keywords.js';
import { phoneGroups } from './numbers.js';
import type { PartRole } from './types.js';

/** A descriptor plus the text printed immediately before the field. */
export type PartDescriptor = Partial<FieldDescriptor> & {
  /** e.g. the 「姓」 in 「姓 <input> 名 <input>」. */
  localLabel?: string;
};

/**
 * Split a phone number across boxes of the given maxlengths (0 or less for
 * none). 090-1234-5678 into three boxes -> ['090', '1234', '5678'].
 *
 * Full-width digits, dash-likes, spaces, parentheses and a +81 prefix are
 * accepted. Where the user grouped the number themselves, their grouping must
 * agree with the area-code table, or the number is left alone.
 */
export function splitPhone(text: string, maxLengths: readonly number[]): string[] | null {
  let s = normalizeHyphen(digitsToHalfWidth(text.trim()));
  s = s.replace(/^\+81[-\s]*(\(0\))?[-\s]*/, '0');
  const tokens = s.split(/[-\s()（）　]+/).filter(Boolean);
  const digits = tokens.join('');
  if (!/^\d+$/.test(digits)) return null;

  const groups = phoneGroups(digits);
  if (!groups || groups.length !== maxLengths.length) return null;
  if (tokens.length > 1) {
    if (tokens.length !== groups.length) return null;
    if (tokens.some((t, i) => t.length !== groups[i])) return null;
  }

  const out: string[] = [];
  let at = 0;
  for (const [i, size] of groups.entries()) {
    const max = maxLengths[i]!;
    if (max > 0 && size > max) return null;
    out.push(digits.slice(at, at + size));
    at += size;
  }
  return out;
}

/** Kanji (with 々), kana (with ー and the iteration marks), half-width kana. */
const JAPANESE_NAME = /^[々ぁ-ゖゝゞァ-ヺー-ヾ一-鿿豈-﫿ｦ-ﾟ]+$/;

/**
 * 山田 太郎 -> ['山田', '太郎']. Exactly two words of Japanese script separated
 * by a half- or full-width space; anything else is null.
 *
 * Latin names never split: "Taro Yamada" is as often written given-name first
 * as not, so the first word cannot be assumed to be the 姓.
 */
export function splitName(text: string): [string, string] | null {
  const words = text.trim().split(/[\s　]+/);
  if (words.length !== 2) return null;
  const [family, given] = words as [string, string];
  if (!JAPANESE_NAME.test(family) || !JAPANESE_NAME.test(given)) return null;
  return [family, given];
}

const FAMILY_TERMS = [
  'sei', 'lastname', 'last_name', 'last-name', 'lname',
  'familyname', 'family_name', 'family-name', 'surname',
];
const GIVEN_TERMS = [
  'mei', 'firstname', 'first_name', 'first-name', 'fname',
  'givenname', 'given_name', 'given-name', 'forename',
];

/** Labels, once the noise around them is removed, that name each half. */
const FAMILY_LABELS = new Set(['姓', '苗字', '名字', 'せい', 'セイ', 'ｾｲ', 'みょうじ', 'ミョウジ']);
const GIVEN_LABELS = new Set(['名', 'めい', 'メイ', 'ﾒｲ']);
/** Labels that are themselves written in kana mean the field wants kana. */
const KANA_LABELS = new Set(['せい', 'セイ', 'ｾｲ', 'みょうじ', 'ミョウジ', 'めい', 'メイ', 'ﾒｲ']);

const KANA_MARKERS = /フリガナ|ふりがな|ﾌﾘｶﾞﾅ|よみがな|ヨミガナ|カナ|かな|ｶﾅ/;
const KANA_ATTR = /kana|furigana|yomi|phonetic|ruby/;
/**
 * Stripped before a label is compared, so 「お名前（姓）」 and 「姓（全角）」 both
 * reduce to 姓. 名前 and 氏名 go first, before their 名 can be mistaken for the
 * label; anything left over, such as the 会社 in 会社名, means it isn't one.
 */
const LABEL_NOISE = /お名前|名前|氏名|全角|半角|必須|任意|入力|[\s　:：*＊※()（）［］[\]【】「」・/／]/g;

/** 'family' or 'given' from one label, with whether it asked for kana. */
function labelRole(text: string): { half: 'family' | 'given'; kana: boolean } | null {
  if (!text) return null;
  const kana = KANA_MARKERS.test(text);
  const core = text.replace(KANA_MARKERS, '').replace(LABEL_NOISE, '');
  if (FAMILY_LABELS.has(core)) return { half: 'family', kana: kana || KANA_LABELS.has(core) };
  if (GIVEN_LABELS.has(core)) return { half: 'given', kana: kana || KANA_LABELS.has(core) };
  return null;
}

/** True when the last autocomplete token is one of `tokens`. */
function autocompleteIs(autocomplete: string, ...tokens: string[]): boolean {
  const last = autocomplete.toLowerCase().trim().split(/\s+/).pop() ?? '';
  return tokens.includes(last);
}

/** A name or id numbered like the parts of a split phone field: tel1, phone_2. */
const NUMBERED_PHONE = /(?:tel|phone|fax|mobile|keitai|denwa)[_-]?[1-3]$/i;

/**
 * Which part of a split value a field holds, or undefined when it isn't
 * clearly one. Every source that speaks must agree: a field named "sei" but
 * labelled 名 is neither.
 */
export function partRoleOf(d: PartDescriptor): PartRole | undefined {
  const name = (d.name ?? '').toLowerCase();
  const id = (d.id ?? '').toLowerCase();
  const autocomplete = d.autocomplete ?? '';
  const attrs = `${name} ${id}`;
  const haystack = [d.name, d.id, d.labelText, d.ariaLabel, d.placeholder, d.localLabel, d.hintText]
    .filter(Boolean)
    .join(' ');
  if (isPaymentField(haystack, autocomplete)) return undefined;

  const halves = new Set<'family' | 'given'>();
  let kana = KANA_ATTR.test(attrs);
  if (autocompleteIs(autocomplete, 'family-name')) halves.add('family');
  if (autocompleteIs(autocomplete, 'given-name')) halves.add('given');
  if (FAMILY_TERMS.some((t) => termMatches(t, attrs))) halves.add('family');
  if (GIVEN_TERMS.some((t) => termMatches(t, attrs))) halves.add('given');
  for (const text of [d.localLabel, d.labelText, d.ariaLabel, d.placeholder]) {
    const found = labelRole(text ?? '');
    if (found) {
      halves.add(found.half);
      kana ||= found.kana;
    }
  }
  if (halves.size === 1) {
    const half = halves.has('family') ? 'family' : 'given';
    if (!kana) return half;
    return half === 'family' ? 'family-kana' : 'given-kana';
  }
  if (halves.size > 1) return undefined;

  // A phone part: a phone field that is also small, numbered, or marked as a
  // piece of a number. A whole-number field is none of these.
  const role = numberRoleOf(haystack, autocomplete) ?? (d.type === 'tel' ? 'phone' : undefined);
  if (role !== 'phone') return undefined;
  const max = d.maxLength ?? -1;
  if (
    (max > 0 && max <= 5) ||
    NUMBERED_PHONE.test(name) ||
    NUMBERED_PHONE.test(id) ||
    autocompleteIs(autocomplete, 'tel-area-code', 'tel-local-prefix', 'tel-local-suffix')
  ) {
    return 'phone';
  }
  return undefined;
}
