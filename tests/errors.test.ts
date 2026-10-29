import { describe, it, expect } from 'vitest';
import {
  isErrorText,
  isRequiredMarker,
  cleanLabel,
  labelsInMessage,
  isProceedText,
  preflightProblem,
} from '../src/core/errors.js';

describe('error text', () => {
  it.each([
    '入力内容に誤りがあります',
    'お名前が入力されていません',
    '電話番号を正しく入力してください',
    'メールアドレスが一致しません',
    '性別を選択してください',
    'This field is required.',
  ])('%s is an error', (text) => {
    expect(isErrorText(text)).toBe(true);
  });

  it.each(['山田 太郎', 'お名前', '確認画面へ進む', ''])('%s is not', (text) => {
    expect(isErrorText(text)).toBe(false);
  });
});

describe('required markers', () => {
  it.each(['お名前 必須', '【必須】電話番号', 'メールアドレス*', '* 住所', 'Email (required)'])(
    '%s is required',
    (text) => expect(isRequiredMarker(text)).toBe(true),
  );

  it.each(['お名前', 'FAX 任意', '電話番号（任意）', '※半角数字', 'Company (optional)', '5*3'])(
    '%s is not',
    (text) => expect(isRequiredMarker(text)).toBe(false),
  );
});

describe('field names', () => {
  it.each([
    ['お名前 必須', 'お名前'],
    ['フリガナ（全角カタカナ）', 'フリガナ'],
    ['【必須】電話番号：', '電話番号'],
    ['※メールアドレス *', 'メールアドレス'],
    ['  ご住所  ', 'ご住所'],
  ])('%s -> %s', (text, expected) => {
    expect(cleanLabel(text)).toBe(expected);
  });

  it('caps a long label', () => {
    expect(cleanLabel('あ'.repeat(50))).toHaveLength(20);
  });
});

describe('matching a summary line to its fields', () => {
  const labels = ['お名前', '名', '電話番号', 'メールアドレス'];

  it('finds the field a line names', () => {
    expect(labelsInMessage('電話番号の形式が正しくありません', labels)).toEqual([2]);
  });

  it('lets a longer label claim its text first', () => {
    expect(labelsInMessage('お名前を入力してください', labels)).toEqual([0]);
  });

  it('still finds a short label standing alone', () => {
    expect(labelsInMessage('名を入力してください', labels)).toEqual([1]);
  });

  it('finds several fields in one line', () => {
    expect(labelsInMessage('お名前、メールアドレスは必須です', labels)).toEqual([0, 3]);
  });

  it('finds nothing in a vague message', () => {
    expect(labelsInMessage('入力内容に誤りがあります', labels)).toEqual([]);
  });

  it('ignores empty labels', () => {
    expect(labelsInMessage('anything', ['', 'x'])).toEqual([]);
  });
});

describe('proceed buttons', () => {
  it.each(['確認画面へ', '入力内容を確認する', '次へ進む', '送信', '申し込む', '同意して進む', 'Submit', 'Next', '注文を確定する'])(
    '%s proceeds',
    (text) => expect(isProceedText(text)).toBe(true),
  );

  it.each(['戻る', '入力内容を修正する', '検索', 'クリア', '確認をキャンセル', 'Search', 'お問い合わせ', '', '確認'.repeat(20)])(
    '%s does not',
    (text) => expect(isProceedText(text)).toBe(false),
  );
});

describe('pre-flight', () => {
  it('flags an empty required field', () => {
    expect(preflightProblem({ required: true, value: '' })).toBe('empty');
    expect(preflightProblem({ required: true, value: '   ' })).toBe('empty');
  });

  it('leaves an empty optional field alone, whatever its pattern', () => {
    expect(preflightProblem({ required: false, value: '', pattern: '\\d{7}' })).toBeNull();
  });

  it('flags a value its pattern rejects', () => {
    expect(preflightProblem({ required: false, value: '150-0001', pattern: '\\d{7}' })).toBe('pattern');
    expect(preflightProblem({ required: false, value: '1500001', pattern: '\\d{7}' })).toBeNull();
  });

  it('anchors the pattern to the whole value, as the browser does', () => {
    expect(preflightProblem({ required: false, value: '12345678', pattern: '\\d{7}' })).toBe('pattern');
  });

  it('compiles with the v flag where the browser would', () => {
    expect(preflightProblem({ required: false, value: 'ア', pattern: '[\\p{sc=Katakana}]+' })).toBeNull();
  });

  it('ignores a pattern that does not compile', () => {
    expect(preflightProblem({ required: false, value: 'x', pattern: '([' })).toBeNull();
  });

  it('flags a value longer than its maxlength', () => {
    expect(preflightProblem({ required: false, value: '12345', maxLength: 4 })).toBe('too-long');
    expect(preflightProblem({ required: false, value: '1234', maxLength: 4 })).toBeNull();
    expect(preflightProblem({ required: false, value: '12345', maxLength: -1 })).toBeNull();
  });
});
