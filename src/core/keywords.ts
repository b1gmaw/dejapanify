/** Keyword tables for classifying a field by its name/id/label text. */
import type { FieldKind } from './types.js';

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
      '番地', '口座番号', '会員番号', '社員番号', 'カード番号', 'card_number',
      '年齢', 'age', '数量', 'quantity',
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
  'cc-number': 'digits-half',
  'cc-csc': 'digits-half',
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

export function matchKeywords(haystack: string): { kind: FieldKind; confidence: number; evidence: string } | null {
  const lower = haystack.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const term of rule.terms) {
      if (typeof term === 'string') {
        const needle = term.toLowerCase();
        if (lower.includes(needle)) {
          return { kind: rule.kind, confidence: rule.confidence, evidence: `matched "${term}"` };
        }
      } else if (term.test(lower)) {
        return { kind: rule.kind, confidence: rule.confidence, evidence: `matched ${term}` };
      }
    }
  }
  return null;
}
