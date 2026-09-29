/** Keyword tables for classifying a field by its name/id/label text. */
import type { FieldKind, NumberRole } from './types.js';

/**
 * Money amounts. They join the numeric fields so their digits are converted,
 * and they are the only fields that ever receive thousands commas.
 */
const AMOUNT_TERMS: readonly string[] = [
  '金額', '価格', '料金', '年収', '月収', '収入', '予算', '費用', '給与', '給料', '年俸',
  '売上', '資本金', '希望額', '借入額', '預金額',
  'amount', 'price', 'salary', 'income', 'budget', 'revenue', 'fee', 'cost',
];

const PHONE_TERMS: readonly string[] = [
  '電話', 'でんわ', '携帯', 'ケータイ', 'ファックス', 'fax', 'tel', 'telephone', 'phone', 'mobile',
];

const POSTAL_TERMS: readonly string[] = [
  '郵便番号', '〒', 'zip', 'zipcode', 'postal', 'postcode', 'postal_code',
];

export interface KeywordRule {
  kind: FieldKind;
  confidence: number;
  /** Matched case-insensitively against the joined descriptor text. */
  terms: readonly (string | RegExp)[];
}

/**
 * Order matters: katakana rules are checked before the generic name rules so
 * that a field labelled 「お名前（フリガナ）」 is treated as a kana field, not a
 * plain name field.
 */
export const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    kind: 'katakana-full',
    confidence: 0.85,
    terms: [
      'フリガナ', 'ﾌﾘｶﾞﾅ', 'カナ', 'ｶﾅ', 'カタカナ',
      'furigana', 'katakana', 'kana', 'phonetic', 'ruby',
      'sei_kana', 'mei_kana', 'kana_sei', 'kana_mei',
      'name_kana', 'kana_name', 'lastname_kana', 'firstname_kana',
      /\bkana\d?\b/, /_kana(_|\b)/, /kana_/,
    ],
  },
  {
    kind: 'hiragana',
    confidence: 0.85,
    terms: ['ふりがな', 'ひらがな', 'hiragana', 'yomigana', 'よみがな', '読み仮名'],
  },
  {
    kind: 'digits-half',
    confidence: 0.8,
    terms: [
      '電話', '電話番号', 'でんわ', 'TEL', 'tel', 'telephone', 'phone', 'mobile',
      '携帯', '携帯番号', 'ケータイ', 'fax', 'FAX', 'ファックス',
      '郵便番号', '〒', 'zip', 'zipcode', 'postal', 'postcode', 'postal_code',
      // Not 番地: on real forms a 「町名・番地」 field holds a street address
      // such as 阿保1丁目1-1, not a number.
      '会員番号', '社員番号',
      '年齢', 'age', '数量', 'quantity',
      ...AMOUNT_TERMS,
    ],
  },
  {
    kind: 'alnum-half',
    confidence: 0.8,
    terms: [
      'メールアドレス', 'メール', 'email', 'e-mail', 'mail', 'mailaddress',
      'ユーザー名', 'ユーザーID', 'user_id', 'userid', 'username', 'login',
      'URL', 'url', 'ホームページ', 'website', 'domain',
      'クーポン', 'coupon', 'promo', 'ローマ字', 'romaji', 'alphabet',
    ],
  },
  {
    kind: 'text-full',
    confidence: 0.6,
    terms: [
      '氏名', 'お名前', '名前', 'なまえ', '姓', '名',
      '住所', 'ご住所', '町名', '建物名', 'マンション名',
      '会社名', '団体名', '所属', '部署',
    ],
  },
];

/** autocomplete tokens -> field kind. */
export const AUTOCOMPLETE_MAP: Readonly<Partial<Record<string, FieldKind>>> = {
  tel: 'digits-half',
  'tel-national': 'digits-half',
  'tel-local': 'digits-half',
  'tel-area-code': 'digits-half',
  'postal-code': 'digits-half',
  email: 'alnum-half',
  url: 'alnum-half',
  username: 'alnum-half',
  'address-line1': 'text-full',
  'address-line2': 'text-full',
  'address-level1': 'text-full',
  'address-level2': 'text-full',
  'street-address': 'text-full',
  'organization': 'text-full',
};

/** input type / inputmode -> field kind. */
export const INPUT_TYPE_MAP: Readonly<Partial<Record<string, FieldKind>>> = {
  tel: 'digits-half',
  email: 'alnum-half',
  url: 'alnum-half',
  number: 'digits-half',
  numeric: 'digits-half',
  decimal: 'digits-half',
};

/** A term made only of latin letters, digits and the usual field-name joiners. */
const LATIN_TERM = /^[a-z0-9][a-z0-9_-]*$/i;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const boundaryCache = new Map<string, RegExp>();

/**
 * Latin terms must match as whole words, not as fragments of longer ones.
 *
 * Plain substring matching classified a free-text 「お問い合わせ内容」 textarea on
 * a real government form as a numeric field, because its name was
 * "your-message" and "age" is a keyword. The extension would then have run
 * hyphen normalization over the message and turned コーヒー into コ-ヒ-.
 *
 * The lookahead stops at letters but allows digits, because Japanese forms
 * routinely number split fields: tel1/tel2/tel3, zip1/zip2, kana1.
 */
function latinBoundary(term: string): RegExp {
  let re = boundaryCache.get(term);
  if (!re) {
    re = new RegExp(`(?<![a-z0-9])${escapeRegExp(term)}(?![a-z])`, 'i');
    boundaryCache.set(term, re);
  }
  return re;
}

function termMatches(term: string, lower: string): boolean {
  // Japanese is written without word separators, so substring matching is the
  // only option there -- and is correct, since these terms are distinctive.
  return LATIN_TERM.test(term) ? latinBoundary(term).test(lower) : lower.includes(term.toLowerCase());
}

/**
 * Payment and banking fields the extension deliberately never touches: card
 * numbers, security codes, expiry dates, card-holder names, and bank account,
 * branch and institution codes.
 *
 * Chrome Web Store policy counts data an extension merely handles on the device
 * as data it must disclose. Leaving these fields alone keeps financial and
 * payment information out of that disclosure entirely, which is the honest
 * position for a tool whose whole promise is that it takes nothing from people.
 *
 * Account holder names (口座名義, 振込名義) are deliberately not listed: they are
 * names, not numbers, and the classic 半角カタカナ requirement.
 */
const PAYMENT_TERMS: readonly string[] = [
  // Cards
  'card', 'cardnumber', 'card_number', 'card_no', 'cardno', 'cc', 'ccnum', 'ccnumber',
  'cc_number', 'cc_num', 'cardholder', 'card_holder', 'cvc', 'cvv', 'cvv2', 'csc',
  'securitycode', 'security_code', 'expiry', 'expiration', 'exp_month', 'exp_year',
  'expdate', 'exp_date',
  'クレジット', 'カード番号', 'カード名義', 'セキュリティコード', '有効期限',
  // Bank accounts
  'iban', 'bic', 'swift', 'routing', 'sort_code', 'account_number', 'account_no',
  'accountnumber', 'bank_account', 'bankaccount',
  '口座番号', '支店番号', '支店コード', '銀行コード', '金融機関コード',
];

/** True when any of the text identifying a field marks it as payment data. */
export function isPaymentField(haystack: string, autocomplete = ''): boolean {
  // Every card-related autocomplete token starts with "cc-" (cc-number,
  // cc-csc, cc-exp, cc-name, ...), and transaction-* are payment amounts.
  const tokens = autocomplete.toLowerCase().trim().split(/\s+/);
  if (tokens.some((t) => t.startsWith('cc-') || t.startsWith('transaction-'))) return true;
  const lower = haystack.toLowerCase();
  return PAYMENT_TERMS.some((term) => termMatches(term, lower));
}

/**
 * What a numeric field holds, from its attributes and label: phone, postal
 * code or money amount. Undefined when nothing says; the page's example may
 * still decide it.
 */
export function numberRoleOf(haystack: string, autocomplete = '', type = ''): NumberRole | undefined {
  const token = autocomplete.toLowerCase().trim().split(/\s+/).pop() ?? '';
  if (token.startsWith('tel') || type.toLowerCase() === 'tel') return 'phone';
  if (token === 'postal-code') return 'postal';
  const lower = haystack.toLowerCase();
  // Postal before phone: 「〒・電話番号」 style combined labels are rare, but a
  // label naming 郵便番号 is never a phone number.
  if (POSTAL_TERMS.some((t) => termMatches(t, lower))) return 'postal';
  if (PHONE_TERMS.some((t) => termMatches(t, lower))) return 'phone';
  if (AMOUNT_TERMS.some((t) => termMatches(t, lower))) return 'amount';
  return undefined;
}

export function matchKeywords(haystack: string): { kind: FieldKind; confidence: number; evidence: string } | null {
  const lower = haystack.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const term of rule.terms) {
      if (typeof term === 'string') {
        if (termMatches(term, lower)) {
          return { kind: rule.kind, confidence: rule.confidence, evidence: `matched "${term}"` };
        }
      } else if (term.test(lower)) {
        return { kind: rule.kind, confidence: rule.confidence, evidence: `matched ${term}` };
      }
    }
  }
  return null;
}
