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
