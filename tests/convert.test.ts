import { describe, it, expect } from 'vitest';
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
  digitsOnly,
  collapseWhitespace,
} from '../src/core/convert.js';

describe('half-width katakana -> full-width', () => {
  it('composes dakuten into a single precomposed glyph', () => {
    expect(kanaToFullWidth('ﾔﾏﾀﾞ')).toBe('ヤマダ');
    expect(kanaToFullWidth('ｶﾞｷﾞｮｳ')).toBe('ガギョウ');
    // The naive approach leaves a bare combining mark behind; assert it doesn't.
    expect(kanaToFullWidth('ｶﾞ')).toBe('ガ');
    expect(kanaToFullWidth('ｶﾞ')).not.toBe('カ゛');
    expect([...kanaToFullWidth('ｶﾞ')]).toHaveLength(1);
  });

  it('composes handakuten', () => {
    expect(kanaToFullWidth('ﾊﾟﾝ')).toBe('パン');
    expect(kanaToFullWidth('ﾎﾟﾎﾟ')).toBe('ポポ');
  });

  it('handles the rare voiced forms', () => {
    expect(kanaToFullWidth('ｳﾞ')).toBe('ヴ');
    expect(kanaToFullWidth('ﾜﾞ')).toBe('ヷ');
    expect(kanaToFullWidth('ｦﾞ')).toBe('ヺ');
  });

  it('converts punctuation and the prolonged sound mark', () => {
    expect(kanaToFullWidth('ﾗｰﾒﾝ')).toBe('ラーメン');
    expect(kanaToFullWidth('｢ｱ｣')).toBe('「ア」');
    expect(kanaToFullWidth('ｱ､ｲ｡')).toBe('ア、イ。');
  });

  it('leaves a dakuten with no valid base alone', () => {
    // ｱ has no voiced form, so the mark must survive as its own character.
    expect(kanaToFullWidth('ｱﾞ')).toBe('ア゛');
  });
});

describe('full-width katakana -> half-width', () => {
  it('decomposes voiced glyphs into base + mark', () => {
    expect(kanaToHalfWidth('ガ')).toBe('ｶﾞ');
    expect(kanaToHalfWidth('ヤマダ')).toBe('ﾔﾏﾀﾞ');
    expect(kanaToHalfWidth('パン')).toBe('ﾊﾟﾝ');
    expect(kanaToHalfWidth('ヴ')).toBe('ｳﾞ');
  });

  it('falls back to the large form for small kana with no half-width glyph', () => {
    expect(kanaToHalfWidth('ヵ')).toBe('ｶ');
    expect(kanaToHalfWidth('ヶ')).toBe('ｹ');
    expect(kanaToHalfWidth('ヮ')).toBe('ﾜ');
  });

  it('round-trips through full-width', () => {
    for (const s of ['ヤマダタロウ', 'ガギグゲゴ', 'パピプペポ', 'ラーメン', 'ヴァイオリン']) {
      expect(kanaToFullWidth(kanaToHalfWidth(s))).toBe(s);
    }
  });
});

describe('ASCII width', () => {
  it('converts full-width ASCII to half-width', () => {
    expect(toHalfWidthAscii('１２３ＡＢＣ')).toBe('123ABC');
    expect(toHalfWidthAscii('ａｂｃ＠ｇｍａｉｌ．ｃｏｍ')).toBe('abc@gmail.com');
  });

  it('converts the ideographic space', () => {
    expect(toHalfWidthAscii('あ　い')).toBe('あ い');
  });

  it('maps the JIS yen sign to a backslash', () => {
    expect(toHalfWidthAscii('￥')).toBe('\\');
  });

  it('converts half-width ASCII to full-width', () => {
    expect(toFullWidthAscii('123ABC')).toBe('１２３ＡＢＣ');
    expect(toFullWidthAscii('a b')).toBe('ａ　ｂ');
  });

  it('leaves kanji and kana untouched', () => {
    expect(toHalfWidthAscii('東京都')).toBe('東京都');
    expect(toFullWidthAscii('東京都')).toBe('東京都');
  });
});

describe('digits', () => {
  it('converts width in both directions', () => {
    expect(digitsToHalfWidth('０９０')).toBe('090');
    expect(digitsToFullWidth('090')).toBe('０９０');
  });

  it('leaves non-digits alone when converting digits only', () => {
    expect(digitsToHalfWidth('ＡＢ０９')).toBe('ＡＢ09');
  });

  it('extracts digits across mixed width and separators', () => {
    expect(digitsOnly('０９０-1234-５６７８')).toBe('09012345678');
    expect(digitsOnly('〒１５０－０００１')).toBe('1500001');
  });
});

describe('kana script conversion', () => {
  it('converts hiragana to katakana', () => {
    expect(hiraganaToKatakana('やまだたろう')).toBe('ヤマダタロウ');
    expect(hiraganaToKatakana('ゔ')).toBe('ヴ');
    expect(hiraganaToKatakana('ぁぃぅ')).toBe('ァィゥ');
  });

  it('converts katakana to hiragana', () => {
    expect(katakanaToHiragana('ヤマダタロウ')).toBe('やまだたろう');
    expect(katakanaToHiragana('ヴ')).toBe('ゔ');
  });

  it('leaves the prolonged sound mark alone in both directions', () => {
    // ー is shared between the scripts and has no hiragana counterpart.
    expect(katakanaToHiragana('ラーメン')).toBe('らーめん');
  });
});

describe('dash normalization', () => {
  it('rewrites every dash-like character to the prolonged sound mark', () => {
    for (const dash of ['-', '−', '－', 'ｰ', '–', '—', '‐']) {
      expect(normalizeProlongedMark(`ラ${dash}メン`)).toBe('ラーメン');
    }
  });

  it('rewrites dash-likes to an ASCII hyphen for numeric fields', () => {
    expect(normalizeHyphen('０３－１２３４')).toBe('０３-１２３４');
    expect(normalizeHyphen('03ー1234')).toBe('03-1234');
  });
});

describe('whitespace', () => {
  it('collapses runs including the ideographic space', () => {
    expect(collapseWhitespace('  山田　　太郎 ')).toBe('山田 太郎');
  });
});
