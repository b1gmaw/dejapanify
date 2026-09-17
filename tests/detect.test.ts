import { describe, it, expect } from 'vitest';
import { detectField, isConvertibleType } from '../src/core/detect.js';
import { DEFAULT_SETTINGS } from '../src/core/types.js';

const THRESHOLD = DEFAULT_SETTINGS.minConfidence;

describe('the common Japanese form fields', () => {
  it('detects a フリガナ field from its label alone', () => {
    // The single most common case. A bare label with no hint text and no
    // pattern must still clear the default confidence threshold.
    const d = detectField({ name: 'kana_sei', labelText: 'フリガナ' });
    expect(d?.kind).toBe('katakana-full');
    expect(d!.confidence).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it('detects half-width katakana when the page says so', () => {
    const d = detectField({ name: 'kana', labelText: 'カナ', hintText: '半角カタカナでご入力ください' });
    expect(d?.kind).toBe('katakana-half');
  });

  it('prefers the printed hint over the field name', () => {
    // Named "kana" but the page explicitly demands hiragana.
    const d = detectField({ name: 'name_kana', labelText: 'ふりがな（全角ひらがな）' });
    expect(d?.kind).toBe('hiragana');
  });

  it('detects a postal code and strips its hyphen', () => {
    const d = detectField({
      name: 'zip', labelText: '郵便番号', pattern: '^[0-9]{7}$', maxLength: 7,
    });
    expect(d?.kind).toBe('digits-half');
    expect(d?.stripSeparators).toBe(true);
    expect(d?.expectedDigits).toBe(7);
  });

  it('keeps the hyphen when the pattern requires one', () => {
    const d = detectField({ name: 'zip', labelText: '郵便番号', pattern: '^\\d{3}-\\d{4}$' });
    expect(d?.kind).toBe('digits-half');
    expect(d?.stripSeparators).toBe(false);
  });

  it('detects a phone field from autocomplete', () => {
    const d = detectField({ type: 'tel', autocomplete: 'tel' });
    expect(d?.kind).toBe('digits-half');
    expect(d!.confidence).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it('reads the last token of a sectioned autocomplete value', () => {
    const d = detectField({ autocomplete: 'section-a shipping postal-code' });
    expect(d?.kind).toBe('digits-half');
  });

  it('detects an email field', () => {
    const d = detectField({ type: 'email', name: 'email', labelText: 'メールアドレス' });
    expect(d?.kind).toBe('alnum-half');
  });

  it('honours 半角数字 hint text on an otherwise plain field', () => {
    const d = detectField({ name: 'num', hintText: '半角数字で入力してください' });
    expect(d?.kind).toBe('digits-half');
    expect(d!.confidence).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it('detects ハイフンなし instructions', () => {
    const d = detectField({ name: 'tel', labelText: '電話番号', hintText: 'ハイフンなしで入力' });
    expect(d?.kind).toBe('digits-half');
    expect(d?.stripSeparators).toBe(true);
  });

  it('respects ハイフンあり and keeps separators', () => {
    const d = detectField({ name: 'tel', labelText: '電話番号', hintText: 'ハイフンありで入力してください' });
    expect(d?.stripSeparators).toBe(false);
  });
});

describe('signals reinforce each other', () => {
  it('scores a label plus an explicit hint near certainty', () => {
    const d = detectField({ name: 'kana', labelText: 'フリガナ', hintText: '全角カタカナ' });
    expect(d?.kind).toBe('katakana-full');
    expect(d!.confidence).toBeGreaterThan(0.9);
  });

  it('lets the pattern override a misleading name', () => {
    const d = detectField({ name: 'name', pattern: '^[ァ-ヶー]+$' });
    expect(d?.kind).toBe('katakana-full');
  });
});

describe('safety: fields we must not touch', () => {
  it.each(['password', 'hidden', 'file', 'checkbox', 'radio', 'date', 'submit', 'color', 'range'])(
    'returns null for type=%s',
    (type) => {
      expect(detectField({ type, name: 'kana', labelText: 'フリガナ' })).toBeNull();
      expect(isConvertibleType(type)).toBe(false);
    },
  );

  it('returns null when nothing identifies the field', () => {
    expect(detectField({ name: 'field1', id: 'f1' })).toBeNull();
    expect(detectField({})).toBeNull();
  });

  it('does not convert a bare 住所 field on a guess', () => {
    // Suggestive but not conclusive: rewriting an address to full-width
    // because of one weak keyword is worse than leaving it alone.
    const d = detectField({ name: 'address', labelText: '住所' });
    expect(d === null || d.confidence < THRESHOLD).toBe(true);
  });

  it('does convert 住所 once the page asks for 全角', () => {
    const d = detectField({ name: 'address', labelText: '住所', hintText: '全角で入力してください' });
    expect(d?.kind).toBe('text-full');
    expect(d!.confidence).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it('never reports stripSeparators for a non-numeric field', () => {
    const d = detectField({ name: 'kana', labelText: 'フリガナ', hintText: 'ハイフンなし' });
    expect(d?.stripSeparators).toBe(false);
  });
});

describe('regressions found by auditing real Japanese sites', () => {
  // Patterns below are reproduced from real pages, written out here rather
  // than copied, so the repo carries no third-party markup.

  it('does not treat a free-text 問い合わせ textarea as a numeric field', () => {
    // Found on a real government contact form: the field was named
    // "your-message", and "age" matched inside "message", so the extension
    // would have run hyphen normalization over the user's prose.
    const d = detectField({
      type: 'textarea',
      name: 'your-message',
      labelText: 'お問い合わせ内容必須',
    });
    expect(d === null || d.kind !== 'digits-half').toBe(true);
  });

  it.each(['message', 'your-message', 'messages', 'page', 'usage', 'package', 'language'])(
    'does not match the "age" keyword inside %s',
    (name) => {
      const d = detectField({ name });
      expect(d === null || d.kind !== 'digits-half').toBe(true);
    },
  );

  it('still detects a standalone age field', () => {
    expect(detectField({ name: 'age' })?.kind).toBe('digits-half');
    expect(detectField({ name: 'user_age' })?.kind).toBe('digits-half');
  });

  it.each(['tel1', 'tel2', 'tel3', 'zip1', 'zip2'])(
    'still detects numbered split field %s',
    (name) => {
      // Japanese forms split phone and postal codes across numbered inputs,
      // so a word boundary must not stop at a trailing digit.
      expect(detectField({ name })?.kind).toBe('digits-half');
    },
  );

  it('detects a bare zip field, as on the Japan Post search form', () => {
    const d = detectField({ name: 'zip' });
    expect(d?.kind).toBe('digits-half');
    expect(d!.confidence).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.minConfidence);
  });

  it.each(['hotel_name', 'client_name', 'title'])('does not match "tel" inside %s', (name) => {
    const d = detectField({ name });
    expect(d === null || d.kind !== 'digits-half').toBe(true);
  });

  it('does not read kanagawa as a kana field', () => {
    const d = detectField({ name: 'kanagawa', labelText: '神奈川' });
    expect(d === null || d.kind !== 'katakana-full').toBe(true);
  });

  it('still detects numbered kana fields', () => {
    expect(detectField({ name: 'kana1' })?.kind).toBe('katakana-full');
    expect(detectField({ name: 'name_kana' })?.kind).toBe('katakana-full');
  });

  it('ignores the hidden bookkeeping fields form plugins add', () => {
    for (const name of ['_wpcf7', '_wpcf7_version', '_wpcf7_unit_tag', 'cx', 'cof', 'ie']) {
      const d = detectField({ name });
      expect(d === null || d.confidence < DEFAULT_SETTINGS.minConfidence).toBe(true);
    }
  });
});
