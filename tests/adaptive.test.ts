/**
 * Capitals, hyphens and commas, driven through the real detect -> normalize
 * path. Each case is a field as a page presents it, plus what the user typed.
 */
import { describe, it, expect } from 'vitest';
import { detectField, type FieldDescriptor } from '../src/core/detect.js';
import { normalizeValue, optionsFor } from '../src/core/normalize.js';

/** What the extension would leave in the field; the input itself if untouched. */
function convert(field: Partial<FieldDescriptor>, typed: string): string {
  const detection = detectField(field);
  if (!detection || detection.confidence < 0.5) return typed;
  return normalizeValue(typed, detection.kind, optionsFor(detection));
}

describe('capital letters', () => {
  it.each([
    [{ labelText: 'お名前（ローマ字・大文字）' }, 'yamada taro', 'YAMADA TARO'],
    [{ labelText: 'Name (in capital letters)' }, 'yamada taro', 'YAMADA TARO'],
    [{ labelText: 'Name', hintText: 'Please use BLOCK CAPITALS' }, 'Taro', 'TARO'],
    [{ name: 'passport_name', hintText: '半角英大文字で入力' }, 'ｙａｍａｄａ', 'YAMADA'],
    [{ name: 'name_en', pattern: '^[A-Z ]+$' }, 'yamada taro', 'YAMADA TARO'],
    [{ name: 'code', hintText: '半角英小文字でご入力ください' }, 'ABC', 'abc'],
  ])('%j: %s -> %s', (field, typed, expected) => {
    expect(convert(field, typed)).toBe(expected);
  });

  it.each([
    // Case-sensitivity notices: changing case would change the value.
    [{ name: 'user_id', hintText: '半角英数字（大文字・小文字を区別します）' }, 'AbC123'],
    [{ name: 'user_id', hintText: '大文字と小文字は区別されます' }, 'AbC123'],
    [{ name: 'login', hintText: 'User ID (case sensitive)' }, 'AbC123'],
    // A password-style rule is a requirement, not a request to convert.
    [{ name: 'secret_word', hintText: '英大文字を1文字以上含む半角英数字' }, 'abc123'],
    [{ name: 'code', hintText: 'must contain at least one uppercase letter' }, 'abc123'],
    // Email is never case-changed, even beside a capitals instruction.
    [{ type: 'email', name: 'email', hintText: '大文字で入力' }, 'Taro@Example.jp'],
    // An example alone never decides case: IDs can be case-sensitive.
    [{ name: 'member_id', placeholder: 'ABC123', hintText: '半角英数字' }, 'abc123'],
  ])('%j leaves %s unchanged', (field, typed) => {
    expect(convert(field, typed)).toBe(typed);
  });

  it('leaves kana and kanji alone when capitalising', () => {
    expect(convert({ labelText: 'Name (in capital letters)' }, 'yamada 太郎')).toBe('YAMADA 太郎');
  });
});

describe('phone hyphens follow the page', () => {
  const phone = { name: 'tel', labelText: '電話番号' };

  it.each([
    ['090-1234-5678', '09012345678', '090-1234-5678'],
    ['090-1234-5678', '０９０１２３４５６７８', '090-1234-5678'],
    ['09012345678', '090-1234-5678', '09012345678'],
    ['09012345678', '０９０－１２３４－５６７８', '09012345678'],
    // A landline split by the national plan, not by the mobile example.
    ['090-1234-5678', '0451234567', '045-123-4567'],
    ['03-1234-5678', '0467123456', '0467-12-3456'],
  ])('placeholder %s: %s -> %s', (placeholder, typed, expected) => {
    expect(convert({ ...phone, placeholder }, typed)).toBe(expected);
  });

  it('reads an example from the note beside the field', () => {
    expect(convert({ ...phone, hintText: '（例：03-1234-5678）' }, '0312345678')).toBe('03-1234-5678');
    expect(convert({ ...phone, hintText: '例）0312345678' }, '03-1234-5678')).toBe('0312345678');
  });

  it('lets an explicit instruction beat the example', () => {
    expect(
      convert({ ...phone, placeholder: '090-1234-5678', hintText: 'ハイフンなし' }, '090-1234-5678'),
    ).toBe('09012345678');
    expect(
      convert({ ...phone, placeholder: '09012345678', hintText: 'ハイフンありで入力' }, '09012345678'),
    ).toBe('090-1234-5678');
  });

  it('never writes more than maxlength allows', () => {
    // 090-1234-5678 is 13 characters; a maxlength of 11 means bare digits.
    expect(convert({ ...phone, placeholder: '090-1234-5678', maxLength: 11 }, '09012345678')).toBe(
      '09012345678',
    );
  });

  it('never hyphenates one part of a split phone field', () => {
    const part = { name: 'tel1', labelText: '電話番号', hintText: '例：090-1234-5678', maxLength: 4 };
    expect(convert(part, '090')).toBe('090');
    expect(convert(part, '０９０')).toBe('090');
  });

  it('leaves a number the national plan does not recognise as typed', () => {
    expect(convert({ ...phone, placeholder: '090-1234-5678' }, '12345')).toBe('12345');
    expect(convert({ ...phone, placeholder: '090-1234-5678' }, '0921234567')).toBe('0921234567');
  });

  it('keeps what the user typed when the page gives no example or instruction', () => {
    expect(convert(phone, '090-1234-5678')).toBe('090-1234-5678');
    expect(convert(phone, '09012345678')).toBe('09012345678');
  });
});

describe('postal codes follow the page', () => {
  const zip = { name: 'zip', labelText: '郵便番号' };

  it.each([
    [{ placeholder: '123-4567' }, '1500001', '150-0001'],
    [{ placeholder: '1234567' }, '150-0001', '1500001'],
    [{ pattern: '^\\d{3}-\\d{4}$' }, '1500001', '150-0001'],
    [{ pattern: '^[0-9]{7}$' }, '150-0001', '1500001'],
  ])('%j: %s -> %s', (extra, typed, expected) => {
    expect(convert({ ...zip, ...extra }, typed)).toBe(expected);
  });
});

describe('commas in amounts follow the page', () => {
  const salary = { name: 'income', labelText: '希望年収' };

  it.each([
    ['5,000,000', '6000000', '6,000,000'],
    ['5,000,000', '６，０００，０００', '6,000,000'],
    ['5,000,000', '６００００００', '6,000,000'],
    ['5000000', '6,000,000', '6000000'],
    ['5000000', '６，０００，０００', '6000000'],
  ])('placeholder %s: %s -> %s', (placeholder, typed, expected) => {
    expect(convert({ ...salary, placeholder }, typed)).toBe(expected);
  });

  it('follows an explicit instruction', () => {
    expect(convert({ ...salary, hintText: 'カンマ不要' }, '6,000,000')).toBe('6000000');
    expect(convert({ ...salary, hintText: '3桁区切りのカンマを付けてください' }, '6000000')).toBe('6,000,000');
  });

  it('treats 「カンマ区切りで入力」 as a list instruction, not grouping', () => {
    expect(convert({ ...salary, hintText: '複数ある場合はカンマ区切りで入力' }, '6000000')).toBe('6000000');
  });

  it('only converts the comma width when the page says nothing', () => {
    expect(convert({ name: 'price', labelText: '金額' }, '１，０００')).toBe('1,000');
    expect(convert({ name: 'price', labelText: '金額' }, '1000')).toBe('1000');
  });

  it('never puts commas into a phone or postal number', () => {
    expect(convert({ name: 'tel', labelText: '電話番号', placeholder: '1,000' }, '0312345678')).toBe(
      '0312345678',
    );
    expect(convert({ name: 'zip', labelText: '郵便番号', hintText: '3桁区切り' }, '1500001')).toBe('1500001');
  });

  it('leaves an amount with a currency sign or unit untouched', () => {
    expect(convert({ ...salary, placeholder: '5,000,000' }, '￥6000000')).toBe('￥6000000');
    expect(convert({ ...salary, placeholder: '5,000,000' }, '600万円')).toBe('600万円');
  });

  it('still never touches card numbers, whatever the example shows', () => {
    expect(detectField({ name: 'card_number', placeholder: '1234-5678-9012-3456' })).toBeNull();
  });
});
