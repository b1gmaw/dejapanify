// @vitest-environment jsdom
/**
 * Split fields over the real demo form: tel1/tel2/tel3 sharing one cell, and
 * 姓/名 and セイ/メイ pairs labelled only by the text between them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { considerField, setSettings } from '../src/content/manager.js';
import { collectFields } from '../src/content/observer.js';
import { markComposing } from '../src/content/applier.js';
import { showNotice } from '../src/content/indicator.js';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/types.js';

// The chip lives in a closed shadow root; capture what it was asked to show.
vi.mock('../src/content/indicator.js', async (original) => ({
  ...(await original<typeof import('../src/content/indicator.js')>()),
  showNotice: vi.fn(),
}));

const DEMO = readFileSync(join(__dirname, '..', 'public', 'demo.html'), 'utf8');

function loadForm(overrides: Partial<Settings> = {}): void {
  document.documentElement.innerHTML = DEMO.replace(/<script[\s\S]*?<\/script>/g, '');
  setSettings({ ...DEFAULT_SETTINGS, showIndicator: false, ...overrides });
  for (const el of collectFields(document)) considerField(el);
}

const field = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
const val = (id: string): string => field(id).value;

/** Fire a paste of `text` at `id`. Returns whether the page's default ran. */
function paste(id: string, text: string): boolean {
  const el = field(id);
  el.focus();
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  return el.dispatchEvent(event);
}

/** Type `text` into `id` one character at a time, as a keyboard would. */
function type(id: string, text: string): void {
  const el = field(id);
  el.focus();
  for (const ch of text) {
    el.value += ch;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
  }
}

describe('pasting a whole value into the first box', () => {
  beforeEach(() => loadForm());

  it('spreads a phone number over tel1, tel2 and tel3', () => {
    expect(paste('tel1', '090-1234-5678')).toBe(false);
    expect([val('tel1'), val('tel2'), val('tel3')]).toEqual(['090', '1234', '5678']);
    expect(document.activeElement).toBe(field('tel3'));
  });

  it('converts full-width digits on the way', () => {
    paste('tel1', '０４６７－１２－３４５６');
    expect([val('tel1'), val('tel2'), val('tel3')]).toEqual(['0467', '12', '3456']);
  });

  it('spreads a name over 姓 and 名', () => {
    expect(paste('sei', '山田 太郎')).toBe(false);
    expect([val('sei'), val('mei')]).toEqual(['山田', '太郎']);
  });

  it('spreads a kana name over セイ and メイ', () => {
    paste('sei_kana', 'ヤマダ　タロウ');
    expect([val('sei_kana'), val('mei_kana')]).toEqual(['ヤマダ', 'タロウ']);
  });

  it('notifies the page of every box it fills', () => {
    const seen: string[] = [];
    document.addEventListener('input', (e) => seen.push((e.target as HTMLInputElement).id));
    paste('tel1', '09012345678');
    expect(seen).toEqual(['tel1', 'tel2', 'tel3']);
  });

  it('leaves a paste into a later box alone', () => {
    expect(paste('tel2', '090-1234-5678')).toBe(true);
    expect(paste('mei', '山田 太郎')).toBe(true);
    expect([val('tel1'), val('tel2'), val('tel3'), val('sei'), val('mei')]).toEqual(['', '', '', '', '']);
  });

  it('leaves a paste alone when another box already has a value', () => {
    field('tel3').value = '5678';
    expect(paste('tel1', '090-1234-5678')).toBe(true);
    expect(val('tel2')).toBe('');
  });

  it('leaves a paste alone when it would land beside existing text', () => {
    field('sei').value = '山';
    field('sei').setSelectionRange(1, 1);
    expect(paste('sei', '田 太郎')).toBe(true);
  });

  it('leaves a value with no certain split to the page', () => {
    expect(paste('sei', '山田太郎')).toBe(true);
    expect(paste('tel1', '1234567890')).toBe(true);
    expect(val('mei')).toBe('');
  });

  it('never splits the single full-name field', () => {
    expect(paste('name', '山田 太郎')).toBe(true);
  });

  it('does nothing when switched off', () => {
    loadForm({ splitFields: false });
    expect(paste('tel1', '090-1234-5678')).toBe(true);
    expect(val('tel2')).toBe('');
  });
});

describe('a whole value already in the first box', () => {
  beforeEach(() => loadForm());

  it('splits a typed name on blur', () => {
    field('sei').value = '山田 太郎';
    field('sei').dispatchEvent(new Event('blur'));
    expect([val('sei'), val('mei')]).toEqual(['山田', '太郎']);
  });

  it('splits a name filled in by autofill', () => {
    field('sei').value = '山田　太郎';
    field('sei').dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    expect([val('sei'), val('mei')]).toEqual(['山田', '太郎']);
  });

  it('does not split a romanised name', () => {
    field('sei').value = 'Van Damme';
    field('sei').dispatchEvent(new Event('blur'));
    expect(val('sei')).toBe('Van Damme');
  });
});

describe('moving on to the next phone box', () => {
  beforeEach(() => loadForm());

  it('moves to the next box once one is full', () => {
    type('tel1', '0467');
    expect(document.activeElement).toBe(field('tel2'));
  });

  it('stays put while the box still has room', () => {
    type('tel1', '090');
    expect(document.activeElement).toBe(field('tel1'));
  });

  it('stays put during IME composition', () => {
    markComposing(field('tel1'), true);
    type('tel1', '０４６７');
    expect(document.activeElement).toBe(field('tel1'));
    markComposing(field('tel1'), false);
  });

  it('does not jump into a box that already has a value', () => {
    field('tel2').value = '1234';
    type('tel1', '0467');
    expect(document.activeElement).toBe(field('tel1'));
  });

  it('stays in the last box', () => {
    type('tel3', '5678');
    expect(document.activeElement).toBe(field('tel3'));
  });
});

describe('undo', () => {
  it('restores every box', () => {
    loadForm({ showIndicator: true });
    paste('tel1', '090-1234-5678');
    const [el, text, onUndo] = vi.mocked(showNotice).mock.calls.at(-1)!;
    expect(el).toBe(field('tel1'));
    expect(text).toBe('電話番号を分けて入力');
    onUndo();
    expect([val('tel1'), val('tel2'), val('tel3')]).toEqual(['', '', '']);
  });

  it('restores what autofill put in the first box', () => {
    loadForm({ showIndicator: true });
    field('sei').value = '山田 太郎';
    field('sei').dispatchEvent(new Event('blur'));
    vi.mocked(showNotice).mock.calls.at(-1)![2]();
    expect([val('sei'), val('mei')]).toEqual(['山田 太郎', '']);
  });
});
