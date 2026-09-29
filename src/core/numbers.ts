/**
 * Formatting for numeric fields: where hyphens and commas belong.
 *
 * Every formatter returns null when it isn't certain, and callers then leave
 * the user's text as it was. A number split in the wrong place is worse than
 * one left alone.
 */
import { AREA_CODE_LENGTH } from './jp-area-codes.js';

/**
 * Non-geographic Japanese numbers, which have fixed groupings. Checked before
 * the landline table, since several share leading digits with area codes.
 */
const FIXED_FORMATS: readonly { test: RegExp; groups: number[] }[] = [
  // 0800 first: it would otherwise match the 080 mobile rule. The 0800 block is
  // freephone, so no mobile number starts with it.
  { test: /^0800\d{7}$/, groups: [4, 3, 4] },     // freephone (11 digits)
  { test: /^0[789]0\d{8}$/, groups: [3, 4, 4] },  // mobile
  { test: /^050\d{8}$/, groups: [3, 4, 4] },      // IP phone
  { test: /^020\d{8}$/, groups: [3, 4, 4] },      // M2M / pager
  { test: /^0120\d{6}$/, groups: [4, 3, 3] },     // freephone
  { test: /^0570\d{6}$/, groups: [4, 3, 3] },     // navi dial
  { test: /^0180\d{6}$/, groups: [4, 3, 3] },     // telephone service
  { test: /^0990\d{6}$/, groups: [4, 3, 3] },     // premium rate
];

function split(digits: string, groups: readonly number[]): string {
  const out: string[] = [];
  let at = 0;
  for (const size of groups) {
    out.push(digits.slice(at, at + size));
    at += size;
  }
  return out.join('-');
}

/** Area-code length for a ten-digit landline, by longest matching prefix. */
export function areaCodeLength(digits: string): number | undefined {
  for (let n = 6; n >= 2; n--) {
    const len = AREA_CODE_LENGTH.get(digits.slice(0, n));
    if (len !== undefined) return len;
  }
  return undefined;
}

/**
 * 09012345678 -> 090-1234-5678, 0451234567 -> 045-123-4567,
 * 0467123456 -> 0467-12-3456. A ten-digit landline splits as area code,
 * local exchange, then four subscriber digits; the area code and exchange
 * together are always six digits.
 */
export function formatPhone(digits: string): string | null {
  if (!/^\d+$/.test(digits)) return null;
  for (const { test, groups } of FIXED_FORMATS) {
    if (test.test(digits)) return split(digits, groups);
  }
  if (/^0\d{9}$/.test(digits)) {
    const area = areaCodeLength(digits);
    if (area !== undefined && area >= 2 && area <= 5) return split(digits, [area, 6 - area, 4]);
  }
  return null;
}

/** 1500001 -> 150-0001. */
export function formatPostal(digits: string): string | null {
  return /^\d{7}$/.test(digits) ? split(digits, [3, 4]) : null;
}

/**
 * 5000000 -> 5,000,000. Keeps a sign and a decimal part; anything else in the
 * text (a currency sign, a unit) means it isn't a plain amount, so null.
 */
export function formatAmount(text: string): string | null {
  const plain = text.replace(/[,\s]/g, '');
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(plain);
  if (!m) return null;
  const [, sign, int, frac = ''] = m;
  return sign + int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + frac;
}

/** Applies an example's grouping, only when the digit counts match exactly. */
export function groupLikeExample(digits: string, groups: readonly number[]): string | null {
  if (!/^\d+$/.test(digits) || groups.length < 2) return null;
  const total = groups.reduce((a, b) => a + b, 0);
  return total === digits.length ? split(digits, groups) : null;
}
