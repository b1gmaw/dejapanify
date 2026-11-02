// @vitest-environment jsdom
/**
 * End-to-end test over the real demo form.
 *
 * Exercises the full path a field takes in a browser -- DOM -> descriptor ->
 * detection -> conversion -> write-back -- against public/demo.html, which
 * reproduces the field patterns real Japanese sites use. This is what covers
 * describe.ts's label and hint-text archaeology, which the unit tests cannot
 * reach.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { considerField, setSettings, sweepAll } from '../src/content/manager.js';
import { collectFields } from '../src/content/observer.js';
import { describeField } from '../src/content/describe.js';
import { detectField } from '../src/core/detect.js';
import { DEFAULT_SETTINGS } from '../src/core/types.js';

const DEMO = readFileSync(join(__dirname, '..', 'public', 'demo.html'), 'utf8');

/** The wrong-width values the demo seeds, as an IME would produce them. */
const SAMPLES: Record<string, string> = {
  name: 'ﾔﾏﾀﾞ ﾀﾛｳ',
  name_kana: 'やまだ たろう',
  name_hira: 'ヤマダ タロウ',
  zip: '１５０－０００１',
  tel1: '０３',
  tel2: '１２３４',
  tel3: '５６７８',
  mobile: '０９０１２３４５６７８',
  home_tel: '03-1234-5678',
  income: '６０００００００',
  name_roman: 'yamada taro',
  address: 'Tokyo-to Shibuya-ku 1-2-3',
  email: 'ｅｘａｍｐｌｅ＠ｅｘａｍｐｌｅ．ｃｏ．ｊｐ',
  member_id: 'ＡＢＣ１２３４',
  furikomi: 'ヤマダタロウ',
  password: 'ＳｅｃｒｅｔＰａｓｓ１',
};

function loadForm(): void {
  // Strip the demo's own <script>: we drive the fields directly.
  document.documentElement.innerHTML = DEMO.replace(/<script[\s\S]*?<\/script>/g, '');
  setSettings({ ...DEFAULT_SETTINGS, showIndicator: false });
  for (const el of collectFields(document)) considerField(el);
  for (const [id, value] of Object.entries(SAMPLES)) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = value;
  }
}

const val = (id: string): string => (document.getElementById(id) as HTMLInputElement).value;

describe('detection over the demo form', () => {
  beforeEach(loadForm);

  it.each([
    ['name_kana', 'katakana-full'],
    ['name_hira', 'hiragana'],
    ['zip', 'digits-half'],
    ['tel1', 'digits-half'],
    ['tel2', 'digits-half'],
    ['mobile', 'digits-half'],
    ['home_tel', 'digits-half'],
    ['income', 'digits-half'],
    ['name_roman', 'alnum-half'],
    ['email', 'alnum-half'],
    ['member_id', 'alnum-half'],
    ['furikomi', 'katakana-half'],
    ['address', 'text-full'],
  ])('classifies #%s as %s', (id, kind) => {
    const el = document.getElementById(id) as HTMLInputElement;
    const detection = detectField(describeField(el));
    expect(detection?.kind).toBe(kind);
    expect(detection!.confidence).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.minConfidence);
  });

  it('reads the hint from the note beside the field', () => {
    const el = document.getElementById('name_kana') as HTMLInputElement;
    expect(describeField(el).hintText).toContain('全角カタカナ');
  });

  it('reads the label from the row header in a table layout', () => {
    const el = document.getElementById('zip') as HTMLInputElement;
    expect(describeField(el).hintText).toContain('郵便番号');
  });

  it('does not leak a neighbouring field value into the hint text', () => {
    // tel1/tel2/tel3 share a cell; their hint must not include each other's text.
    const el = document.getElementById('tel2') as HTMLInputElement;
    expect(describeField(el).hintText).not.toContain('０３');
  });
});

describe('conversion over the demo form', () => {
  beforeEach(loadForm);

  it('converts every detected field on submit sweep', () => {
    const changed = sweepAll();
    expect(changed).toBeGreaterThan(0);

    expect(val('name_kana')).toBe('ヤマダ　タロウ');
    expect(val('name_hira')).toBe('やまだ　たろう');
    expect(val('zip')).toBe('1500001');
    expect(val('tel1')).toBe('03');
    expect(val('tel2')).toBe('1234');
    expect(val('tel3')).toBe('5678');
    // Separators follow each field's own example, read from the real DOM.
    expect(val('mobile')).toBe('090-1234-5678');
    expect(val('home_tel')).toBe('0312345678');
    expect(val('income')).toBe('60,000,000');
    // Capitals, because the note beside the field asks for 大文字.
    expect(val('name_roman')).toBe('YAMADA TARO');
    expect(val('email')).toBe('example@example.co.jp');
    expect(val('member_id')).toBe('ABC1234');
    expect(val('furikomi')).toBe('ﾔﾏﾀﾞﾀﾛｳ');
    expect(val('address')).toBe('Ｔｏｋｙｏ－ｔｏ　Ｓｈｉｂｕｙａ－ｋｕ　１－２－３');
  });

  it('converts on blur', () => {
    const el = document.getElementById('name_kana') as HTMLInputElement;
    el.dispatchEvent(new Event('blur'));
    expect(el.value).toBe('ヤマダ　タロウ');
  });

  it('strips the hyphen only where the pattern forbids it', () => {
    sweepAll();
    // zip pattern is ^[0-9]{7}$ -> no separator allowed.
    expect(val('zip')).toBe('1500001');
    expect(val('zip')).not.toContain('-');
  });

  it('never touches a password field', () => {
    sweepAll();
    expect(val('password')).toBe(SAMPLES.password);
  });

  it('leaves an unidentifiable field alone', () => {
    // #name has no width instruction anywhere, so we decline to guess.
    sweepAll();
    expect(val('name')).toBe(SAMPLES.name);
  });

  it('is idempotent', () => {
    sweepAll();
    const after = Object.keys(SAMPLES).map(val);
    expect(sweepAll()).toBe(0);
    expect(Object.keys(SAMPLES).map(val)).toEqual(after);
  });

  it('fires input and change events so frameworks observe the write', () => {
    const el = document.getElementById('zip') as HTMLInputElement;
    const seen: string[] = [];
    el.addEventListener('input', () => seen.push('input'));
    el.addEventListener('change', () => seen.push('change'));
    el.dispatchEvent(new Event('blur'));
    expect(seen).toContain('input');
    expect(seen).toContain('change');
  });
});

const OSHO_NOTE = '姓名の読み仮名をひらがなでご入力ください';

/**
 * Osho's guest order form as rendered at order_guest_entry.html: nothing but
 * nested divs, with the instruction under the second box. Its two 姓 名 boxes
 * come first, and the form holds seven fields in all.
 */
function muiRow(opts: { linked: boolean; note?: boolean }): void {
  const box = (id: string, label: string, extra = '') => `
    <div class="box">
      <div class="MuiFormControl-root">
        <label ${opts.linked ? `for="${id}"` : ''}>${label}</label>
        <div class="MuiInputBase-root"><input id="${id}" name="${id}" type="text"></div>
      </div>
      ${extra}
    </div>`;
  const note = opts.note === false ? '' : `<span class="helper-text-span">${OSHO_NOTE}</span>`;
  document.body.innerHTML = `<form>
    <section><div class="in">${box('user_name1', '姓')}${box('user_name2', '名')}</div></section>
    <section class="furigana-padding"><div class="in">${box('user_kana1', 'せい')}${box('user_kana2', 'めい', note)}</div></section>
    ${box('user_tel', '電話番号（ハイフンなし）')}
    ${box('user_email', 'メールアドレス')}
    ${box('user_email_confirm', 'メールアドレス（確認用）')}
  </form>`;
  setSettings({ ...DEFAULT_SETTINGS, showIndicator: false });
  for (const el of collectFields(document)) considerField(el);
}

const field = (id: string) => document.getElementById(id) as HTMLInputElement;

/** Type into a field and leave it. */
function enter(id: string, value: string): void {
  field(id).value = value;
  field(id).dispatchEvent(new Event('blur'));
}

function showError(id: string, message: string): void {
  const span = document.createElement('span');
  span.className = 'mdl-form-error-note';
  span.textContent = message;
  field(id).closest('.box')!.append(span);
}

describe('a Material UI form with no recognised containers', () => {
  it.each([
    ['user_kana1', true],
    ['user_kana2', true],
    ['user_kana1', false],
    ['user_kana2', false],
  ])('applies the printed note to %s (label linked: %s)', (id, linked) => {
    muiRow({ linked });
    expect(describeField(field(id)).hintText).toContain(OSHO_NOTE);
    enter(id, 'ヤマダ');
    expect(field(id).value).toBe('やまだ');
    expect(field(id).dataset.dejapanifyKind).toBe('hiragana');
  });

  it('does not give the note to the 姓 名 boxes above it', () => {
    muiRow({ linked: true });
    expect(describeField(field('user_name1')).hintText).not.toContain(OSHO_NOTE);
  });

  it('does not guess hiragana from a label when the page says nothing', () => {
    muiRow({ linked: true, note: false });
    enter('user_kana1', 'やまだ');
    expect(field('user_kana1').value).toBe('ヤマダ');
  });

  it('obeys a validation message that appears after the first blur', () => {
    muiRow({ linked: true, note: false });
    enter('user_kana1', 'やまだ');
    expect(field('user_kana1').value).toBe('ヤマダ');

    showError('user_kana1', '全角ひらがなで入力してください');
    enter('user_kana1', 'ヤマダ');
    expect(field('user_kana1').value).toBe('やまだ');
    expect(field('user_kana1').dataset.dejapanifyKind).toBe('hiragana');
  });

  it('stays hiragana after the message goes away', () => {
    muiRow({ linked: true, note: false });
    showError('user_kana1', '全角ひらがなで入力してください');
    enter('user_kana1', 'ヤマダ');
    expect(field('user_kana1').value).toBe('やまだ');

    // The site clears its error once the value passes; a later blur must not
    // convert the value back and bring the error straight back.
    document.querySelector('.mdl-form-error-note')!.remove();
    enter('user_kana1', 'やまだ');
    expect(field('user_kana1').value).toBe('やまだ');
  });

  it('starts converting a field once a late message identifies it', () => {
    document.body.innerHTML = `<form><div class="row"><div><input id="plain" type="text"></div></div></form>`;
    setSettings({ ...DEFAULT_SETTINGS, showIndicator: false });
    for (const el of collectFields(document)) considerField(el);
    enter('plain', 'ヤマダ');
    expect(field('plain').value).toBe('ヤマダ');

    const note = document.createElement('span');
    note.textContent = '全角ひらがなで入力してください';
    document.querySelector('.row')!.append(note);
    enter('plain', 'ヤマダ');
    expect(field('plain').value).toBe('やまだ');
  });

  it('does not borrow the note of another field in a larger form', () => {
    document.body.innerHTML = `<div class="form">
      <div><div><input id="a" type="text"></div></div>
      <div><div><input id="b" type="text"></div><span>全角ひらがな</span></div>
      <div><div><input id="c" type="text"></div></div>
    </div>`;
    expect(describeField(field('a')).hintText).not.toContain('全角ひらがな');
    expect(describeField(field('b')).hintText).toContain('全角ひらがな');
  });

  it('keeps what it found when a re-render drops the note', () => {
    muiRow({ linked: true });
    document.querySelector('.helper-text-span')!.remove();
    enter('user_kana1', 'ヤマダ');
    expect(field('user_kana1').value).toBe('やまだ');
  });

  it('never binds a payment field, and drops one that turns out to be', () => {
    document.body.innerHTML = `<form>
      <div><div><input id="card" name="cardnumber" type="text"></div></div>
      <div class="late"><div><input id="late" name="tel" type="text"></div></div>
    </form>`;
    setSettings({ ...DEFAULT_SETTINGS, showIndicator: false });
    for (const el of collectFields(document)) considerField(el);

    enter('card', '１２３４');
    expect(field('card').value).toBe('１２３４');

    expect(field('late').dataset.dejapanifyKind).toBe('digits-half');
    const note = document.createElement('span');
    note.textContent = 'カード番号';
    document.querySelector('.late')!.append(note);
    enter('late', '０９０');
    expect(field('late').value).toBe('０９０');
    expect(field('late').dataset.dejapanifyKind).toBeUndefined();
  });
});

describe('IME safety', () => {
  beforeEach(loadForm);

  it('does not convert mid-composition', () => {
    const el = document.getElementById('name_kana') as HTMLInputElement;
    el.dispatchEvent(new Event('compositionstart'));
    el.value = 'やまだ';
    el.dispatchEvent(new Event('blur'));
    // Still composing: the value must be left exactly as typed.
    expect(el.value).toBe('やまだ');
  });

  it('converts once composition ends', () => {
    const el = document.getElementById('name_kana') as HTMLInputElement;
    el.dispatchEvent(new Event('compositionstart'));
    el.value = 'やまだ';
    el.dispatchEvent(new Event('compositionend'));
    el.dispatchEvent(new Event('blur'));
    expect(el.value).toBe('ヤマダ');
  });
});
