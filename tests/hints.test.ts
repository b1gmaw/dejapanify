import { describe, it, expect } from 'vitest';
import { parseHintText, looksJapanese } from '../src/core/hints.js';
import { analyzePattern } from '../src/core/pattern.js';

describe('hint specificity', () => {
  it('prefers 半角カタカナ over a bare 半角', () => {
    const r = parseHintText('半角カタカナで入力してください');
    expect(r.kind).toBe('katakana-half');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('prefers 全角カタカナ over a bare 全角', () => {
    expect(parseHintText('全角カタカナ').kind).toBe('katakana-full');
  });

  it('falls back to a bare width marker with lower confidence', () => {
    const bare = parseHintText('半角で入力');
    const explicit = parseHintText('半角数字で入力');
    expect(bare.kind).toBe('alnum-half');
    expect(explicit.kind).toBe('digits-half');
    expect(explicit.confidence).toBeGreaterThan(bare.confidence);
  });

  it('recognises the common phrasings', () => {
    expect(parseHintText('半角数字').kind).toBe('digits-half');
    expect(parseHintText('全角数字でご記入ください').kind).toBe('digits-full');
    expect(parseHintText('半角英数字').kind).toBe('alnum-half');
    expect(parseHintText('半角英数').kind).toBe('alnum-half');
    expect(parseHintText('半角ローマ字').kind).toBe('alnum-half');
    expect(parseHintText('ひらがなで入力').kind).toBe('hiragana');
    expect(parseHintText('カタカナで入力').kind).toBe('katakana-full');
  });

  it('returns nothing for text with no width instruction', () => {
    expect(parseHintText('お名前を入力してください').kind).toBeUndefined();
    expect(parseHintText('').kind).toBeUndefined();
  });
});

describe('separator instructions', () => {
  it.each([
    'ハイフンなし',
    'ハイフン無し',
    'ハイフン不要',
    'ハイフン抜き',
    '数字のみ',
    'ハイフンなしで入力してください',
  ])('detects %s', (text) => {
    expect(parseHintText(text).stripSeparators).toBe(true);
  });

  it.each(['ハイフンあり', 'ハイフン有り', 'ハイフンを含めて入力', 'ハイフン付き'])(
    'suppresses stripping for %s',
    (text) => {
      expect(parseHintText(text).stripSeparators).toBe(false);
    },
  );

  it('does not strip when nothing was said', () => {
    expect(parseHintText('電話番号').stripSeparators).toBe(false);
  });
});

describe('pattern analysis', () => {
  it('reads character-class ranges', () => {
    expect(analyzePattern('^[ｦ-ﾟ]+$').kind).toBe('katakana-half');
    expect(analyzePattern('^[ァ-ヶー]+$').kind).toBe('katakana-full');
    expect(analyzePattern('^[ぁ-ん]+$').kind).toBe('hiragana');
    expect(analyzePattern('^[０-９]+$').kind).toBe('digits-full');
    expect(analyzePattern('^[Ａ-Ｚ]+$').kind).toBe('alnum-full');
  });

  it('reads escaped unicode ranges', () => {
    expect(analyzePattern('^[\\u30A1-\\u30F6]+$').kind).toBe('katakana-full');
    expect(analyzePattern('^[\\u3041-\\u3096]+$').kind).toBe('hiragana');
  });

  it('identifies digit-only patterns and their separator rule', () => {
    const strict = analyzePattern('^[0-9]{7}$');
    expect(strict.kind).toBe('digits-half');
    expect(strict.stripSeparators).toBe(true);
    expect(strict.expectedDigits).toBe(7);

    const hyphenated = analyzePattern('^\\d{3}-\\d{4}$');
    expect(hyphenated.kind).toBe('digits-half');
    expect(hyphenated.stripSeparators).toBe(false);
  });

  it('returns nothing for an empty or unrecognised pattern', () => {
    expect(analyzePattern('').kind).toBeUndefined();
    expect(analyzePattern('.*').kind).toBeUndefined();
  });
});

describe('looksJapanese', () => {
  it('accepts text with enough Japanese characters', () => {
    expect(looksJapanese('お名前とご住所をご入力ください')).toBe(true);
  });

  it('rejects latin text', () => {
    expect(looksJapanese('Please enter your name and address')).toBe(false);
  });

  it('rejects a stray Japanese word in an English page', () => {
    expect(looksJapanese('The word 東京 appears here')).toBe(false);
  });
});
