import { describe, it, expect } from 'vitest';
import { normalizeValue, needsNormalization } from '../src/core/normalize.js';
import type { FieldKind } from '../src/core/types.js';

describe('normalizeValue per field kind', () => {
  const cases: [FieldKind, string, string, string][] = [
    ['katakana-full', 'やまだ ﾀﾛｳ', 'ヤマダ　タロウ', 'mixed hiragana + half-width kana -> full-width katakana'],
    ['katakana-full', 'ﾔﾏﾀﾞ', 'ヤマダ', 'half-width voiced kana'],
    ['katakana-half', 'ヤマダ', 'ﾔﾏﾀﾞ', 'full-width -> half-width katakana'],
    ['hiragana', 'ヤマダ', 'やまだ', 'katakana -> hiragana'],
    ['hiragana', 'ﾔﾏﾀﾞ', 'やまだ', 'half-width katakana -> hiragana'],
    ['digits-half', '０９０', '090', 'full-width digits'],
    ['digits-half', '０３－１２３４', '03-1234', 'digits and the full-width hyphen'],
    ['digits-full', '090', '０９０', 'half-width digits -> full-width'],
    ['alnum-half', 'ａｂｃ＠ｇｍａｉｌ．ｃｏｍ', 'abc@gmail.com', 'full-width email'],
    ['alnum-full', 'abc', 'ａｂｃ', 'half-width -> full-width'],
    ['text-full', 'yamada', 'ｙａｍａｄａ', 'latin -> full-width'],
    ['text-half', 'Ｔｏｋｙｏ', 'Tokyo', 'full-width -> half-width'],
  ];

  for (const [kind, input, expected, label] of cases) {
    it(`${kind}: ${label}`, () => {
      expect(normalizeValue(input, kind)).toBe(expected);
    });
  }
});

describe('separator stripping', () => {
  it('removes hyphens only when asked', () => {
    expect(normalizeValue('１５０－０００１', 'digits-half')).toBe('150-0001');
    expect(normalizeValue('１５０－０００１', 'digits-half', { stripSeparators: true })).toBe('1500001');
  });

  it('removes spaces too when stripping', () => {
    expect(normalizeValue('090 1234 5678', 'digits-half', { stripSeparators: true })).toBe('09012345678');
  });
});

describe('prolonged sound mark handling', () => {
  it('rewrites an ASCII hyphen inside a kana field', () => {
    expect(normalizeValue('ラ-メン', 'katakana-full')).toBe('ラーメン');
  });

  it('can be disabled', () => {
    expect(normalizeValue('ラ-メン', 'katakana-full', { normalizeProlonged: false })).toBe('ラ-メン');
  });

  it('never applies a prolonged mark to a numeric field', () => {
    // ー in a phone number would be wrong; digits must get an ASCII hyphen.
    expect(normalizeValue('03ー1234', 'digits-half')).toBe('03-1234');
  });
});

describe('trimming', () => {
  it('trims ASCII and ideographic whitespace by default', () => {
    expect(normalizeValue('　ヤマダ ', 'katakana-full')).toBe('ヤマダ');
  });

  it('can be disabled', () => {
    expect(normalizeValue(' 090 ', 'digits-half', { trim: false })).toBe(' 090 ');
  });
});

describe('needsNormalization', () => {
  it('is false for already-correct values', () => {
    expect(needsNormalization('ヤマダ', 'katakana-full')).toBe(false);
    expect(needsNormalization('09012345678', 'digits-half')).toBe(false);
  });

  it('is false for an empty value', () => {
    expect(needsNormalization('', 'katakana-full')).toBe(false);
  });

  it('is true when conversion would change the text', () => {
    expect(needsNormalization('やまだ', 'katakana-full')).toBe(true);
    expect(needsNormalization('０９０', 'digits-half')).toBe(true);
  });

  it('leaves kanji in a name field alone', () => {
    // We convert width, not meaning: 山田 must never become katakana.
    expect(normalizeValue('山田', 'katakana-full')).toBe('山田');
  });
});

describe('refusing to damage Japanese text', () => {
  it.each([
    'コーヒーを１杯',
    'データーベースの件',
    'お問い合わせ：全角スペース　あり',
    '山田さんへ　ご連絡ください',
  ])('leaves %s untouched in a numeric field', (text) => {
    // If a numeric field contains kana or kanji it was misidentified, and
    // hyphen normalization would turn コーヒー into コ-ヒ-. Do nothing instead.
    expect(normalizeValue(text, 'digits-half')).toBe(text);
    expect(normalizeValue(text, 'digits-full')).toBe(text);
  });

  it('still normalizes a phone number typed with a prolonged sound mark', () => {
    // ー sits outside the katakana letter range, so the guard must not catch it.
    expect(normalizeValue('０３ー１２３４', 'digits-half')).toBe('03-1234');
    expect(normalizeValue('090ー1234ー5678', 'digits-half', { stripSeparators: true }))
      .toBe('09012345678');
  });

  it('does not narrow kana in a half-width alphanumeric field', () => {
    // Turning コーヒー into ｺｰﾋｰ never makes a 半角英数字 field valid, and
    // mangles ordinary Japanese when the field was misread.
    expect(normalizeValue('コーヒー', 'alnum-half')).toBe('コーヒー');
    expect(normalizeValue('ＡＢＣ　コーヒー', 'alnum-half')).toBe('ABC コーヒー');
  });

  it('still narrows kana when the field explicitly asks for 半角カタカナ', () => {
    expect(normalizeValue('コーヒー', 'katakana-half')).toBe('ｺｰﾋｰ');
  });
});
