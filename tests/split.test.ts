import { describe, it, expect } from 'vitest';
import { splitPhone, splitName, partRoleOf } from '../src/core/split.js';
import { phoneGroups } from '../src/core/numbers.js';

const THREE_BOXES = [4, 4, 4];

describe('splitting a phone number across boxes', () => {
  it.each([
    ['09012345678', ['090', '1234', '5678']],
    ['090-1234-5678', ['090', '1234', '5678']],
    ['０９０－１２３４－５６７８', ['090', '1234', '5678']],
    ['090ー1234ー5678', ['090', '1234', '5678']],    // IME prolonged mark
    ['03-1234-5678', ['03', '1234', '5678']],
    ['0467-12-3456', ['0467', '12', '3456']],
    ['03(1234)5678', ['03', '1234', '5678']],
    ['(03) 1234-5678', ['03', '1234', '5678']],
    ['0120-123-456', ['0120', '123', '456']],
    ['+81 90-1234-5678', ['090', '1234', '5678']],
    ['+81 (0)3-1234-5678', ['03', '1234', '5678']],
    ['  090 1234 5678  ', ['090', '1234', '5678']],
  ])('%s', (text, expected) => {
    expect(splitPhone(text, THREE_BOXES)).toEqual(expected);
  });

  it('ignores maxlength 0 or below', () => {
    expect(splitPhone('09012345678', [-1, -1, -1])).toEqual(['090', '1234', '5678']);
  });

  it.each([
    ['a piece longer than its box', '09012345678', [3, 3, 4]],
    ['the wrong number of boxes', '09012345678', [4, 4]],
    ['a number with no certain grouping', '1234567890', THREE_BOXES],
    ['a number too short to be one', '0312', THREE_BOXES],
    ['the user’s grouping disagreeing with the area code', '0467-123-456', THREE_BOXES],
    ['two groups where three are expected', '090-12345678', THREE_BOXES],
    ['text that is not a number', '電話番号', THREE_BOXES],
    ['an extension', '03-1234-5678 内線12', THREE_BOXES],
    ['nothing', '', THREE_BOXES],
  ])('refuses %s', (_why, text, boxes) => {
    expect(splitPhone(text, boxes)).toBeNull();
  });

  it('formatPhone still agrees with phoneGroups', () => {
    expect(phoneGroups('09012345678')).toEqual([3, 4, 4]);
    expect(phoneGroups('0467123456')).toEqual([4, 2, 4]);
    expect(phoneGroups('123')).toBeNull();
  });
});

describe('splitting a name into 姓 and 名', () => {
  it.each([
    ['山田 太郎', ['山田', '太郎']],
    ['山田　太郎', ['山田', '太郎']],
    [' 佐々木  花子 ', ['佐々木', '花子']],
    ['ヤマダ タロウ', ['ヤマダ', 'タロウ']],
    ['やまだ たろう', ['やまだ', 'たろう']],
    ['ﾔﾏﾀﾞ ﾀﾛｳ', ['ﾔﾏﾀﾞ', 'ﾀﾛｳ']],
    ['オオノ ユーコ', ['オオノ', 'ユーコ']],
  ])('%s', (text, expected) => {
    expect(splitName(text)).toEqual(expected);
  });

  it.each([
    ['no space, so no knowable boundary', '山田太郎'],
    ['three words', '山田 太郎 様'],
    ['a romanised name, which may be given-name first', 'Taro Yamada'],
    ['mixed scripts', '山田 Taro'],
    ['one word', '山田'],
    ['nothing', ''],
  ])('refuses %s', (_why, text) => {
    expect(splitName(text)).toBeNull();
  });
});

describe('recognising the parts of a split field', () => {
  it.each([
    [{ localLabel: '姓' }, 'family'],
    [{ localLabel: '名' }, 'given'],
    [{ localLabel: 'セイ' }, 'family-kana'],
    [{ localLabel: 'めい' }, 'given-kana'],
    [{ ariaLabel: 'お名前（姓）' }, 'family'],
    [{ placeholder: '名（全角）' }, 'given'],
    [{ labelText: '名（フリガナ）' }, 'given-kana'],
    [{ name: 'sei' }, 'family'],
    [{ name: 'name_mei' }, 'given'],
    [{ name: 'last_name' }, 'family'],
    [{ id: 'firstName' }, 'given'],
    [{ name: 'sei_kana' }, 'family-kana'],
    [{ name: 'kana_mei' }, 'given-kana'],
    [{ autocomplete: 'family-name' }, 'family'],
    [{ autocomplete: 'section-a given-name' }, 'given'],
    [{ name: 'sei', localLabel: '姓' }, 'family'],
  ])('%o -> %s', (d, role) => {
    expect(partRoleOf(d)).toBe(role);
  });

  it.each([
    ['会社名', { localLabel: '会社名' }],
    ['建物名', { labelText: '建物名' }],
    ['a whole-name label', { labelText: 'お名前' }],
    ['a whole name field named 姓名', { name: 'sei_mei' }],
    ['shimei, which only contains mei', { name: 'shimei' }],
    ['seikyu, which only starts with sei', { name: 'seikyu_no' }],
    ['sources that disagree', { name: 'sei', localLabel: '名' }],
    ['a card-holder name', { name: 'card_holder_last_name' }],
  ])('%s is not a name part', (_why, d) => {
    expect(partRoleOf(d)).toBeUndefined();
  });

  it.each([
    [{ name: 'tel1', type: 'tel' }],
    [{ name: 'tel2', labelText: '電話番号' }],
    [{ id: 'phone_3', hintText: '電話番号' }],
    [{ type: 'tel', maxLength: 4 }],
    [{ hintText: '電話番号', maxLength: 5 }],
    [{ autocomplete: 'tel-local-prefix' }],
  ])('%o is a phone part', (d) => {
    expect(partRoleOf(d)).toBe('phone');
  });

  it.each([
    ['a whole phone field', { name: 'tel', type: 'tel' }],
    ['a whole phone field with a long maxlength', { name: 'mobile', maxLength: 13 }],
    ['a split postal code', { name: 'zip1', type: 'tel', maxLength: 3, hintText: '郵便番号' }],
    ['a field with nothing phone about it', { name: 'code1', maxLength: 4 }],
  ])('%s is not a phone part', (_why, d) => {
    expect(partRoleOf(d)).toBeUndefined();
  });
});
