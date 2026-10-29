// @vitest-environment jsdom
/** Refilling a form the site wiped: off by default, careful about what it keeps. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { considerField, setSettings } from '../src/content/manager.js';
import { collectFields } from '../src/content/observer.js';
import { clearDraft, DRAFT_TTL_MS, restoreOffer, saveDraft } from '../src/content/recovery.js';
import { bindProceed, onSubmit } from '../src/content/proceed.js';
import { destroyPanel } from '../src/content/panel.js';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/types.js';

const DEMO = readFileSync(join(__dirname, '..', 'public', 'demo.html'), 'utf8');
const KEY = 'dejapanify:draft';

function loadForm(overrides: Partial<Settings> = {}): void {
  document.documentElement.innerHTML = DEMO.replace(/<script[\s\S]*?<\/script>/g, '');
  setSettings({ ...DEFAULT_SETTINGS, showIndicator: false, ...overrides });
  for (const el of collectFields(document)) considerField(el);
}

const field = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
const form = (): HTMLFormElement => document.getElementById('form') as HTMLFormElement;
const stored = (): string => sessionStorage.getItem(KEY) ?? '';

function fill(): void {
  field('name').value = '山田 太郎';
  field('name_kana').value = 'ヤマダ タロウ';
  field('email').value = 'taro@example.jp';
  field('tel1').value = '090';
}

function wipe(): void {
  for (const id of ['name', 'name_kana', 'email', 'tel1']) field(id).value = '';
}

function addField(name: string, label = ''): HTMLInputElement {
  const input = document.createElement('input');
  input.name = name;
  input.setAttribute('aria-label', label);
  form().appendChild(input);
  return input;
}

beforeEach(() => {
  sessionStorage.clear();
  loadForm();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  destroyPanel();
});

describe('saving and offering a draft', () => {
  it('offers back a wiped form', () => {
    fill();
    saveDraft(form());
    wipe();
    const offer = restoreOffer();
    expect(offer?.count).toBe(4);
    offer!.restore();
    expect([field('name').value, field('email').value, field('tel1').value]).toEqual(['山田 太郎', 'taro@example.jp', '090']);
    expect(stored()).toBe('');
  });

  it('never overwrites what the user has typed since', () => {
    fill();
    saveDraft(form());
    wipe();
    field('email').value = 'new@example.jp';
    restoreOffer()!.restore();
    expect(field('email').value).toBe('new@example.jp');
    expect(field('name').value).toBe('山田 太郎');
  });

  it('restores a radio choice', () => {
    fill();
    const a = addField('plan');
    a.type = 'radio';
    a.value = 'a';
    const b = addField('plan');
    b.type = 'radio';
    b.value = 'b';
    b.checked = true;
    saveDraft(form());
    wipe();
    b.checked = false;
    restoreOffer()!.restore();
    expect(b.checked).toBe(true);
    expect(a.checked).toBe(false);
  });

  it('offers nothing when the form was not wiped', () => {
    fill();
    saveDraft(form());
    expect(restoreOffer()).toBeNull();
  });

  it('offers nothing for one wiped field', () => {
    fill();
    saveDraft(form());
    field('email').value = '';
    expect(restoreOffer()).toBeNull();
  });

  it('forgets a dismissed draft', () => {
    fill();
    saveDraft(form());
    wipe();
    restoreOffer()!.dismiss();
    expect(restoreOffer()).toBeNull();
  });
});

describe('what is never kept', () => {
  it.each([
    ['a one-time code', 'otp', ''],
    ['a CAPTCHA answer', 'captcha_answer', ''],
    ['a card number', 'card_number', ''],
    ['a PIN', 'pin', ''],
    ['an マイナンバー', 'x1', 'マイナンバー'],
    ['a CSRF token', 'csrf_token', ''],
  ])('%s', (_what, name, label) => {
    fill();
    addField(name, label).value = 'SECRET-123';
    saveDraft(form());
    expect(stored()).toContain('taro@example.jp');
    expect(stored()).not.toContain('SECRET-123');
  });

  it('a password', () => {
    fill();
    field('password').value = 'hunter2';
    saveDraft(form());
    expect(stored()).not.toContain('hunter2');
  });
});

describe('when the draft goes away', () => {
  it('expires after 30 minutes', () => {
    vi.useFakeTimers();
    fill();
    saveDraft(form());
    wipe();
    vi.advanceTimersByTime(DRAFT_TTL_MS + 1);
    expect(restoreOffer()).toBeNull();
    expect(stored()).toBe('');
  });

  it('is deleted on a page saying the application is complete', () => {
    fill();
    saveDraft(form());
    document.body.textContent = 'お申し込みが完了しました。ありがとうございました。';
    expect(restoreOffer()).toBeNull();
    expect(stored()).toBe('');
  });

  it('survives a confirmation page without the form', () => {
    fill();
    saveDraft(form());
    document.body.textContent = '入力内容の確認';
    expect(restoreOffer()).toBeNull();
    expect(stored()).not.toBe('');
  });

  it('clearDraft removes it', () => {
    fill();
    saveDraft(form());
    clearDraft();
    expect(stored()).toBe('');
  });
});

describe('storage that refuses', () => {
  it('saves and offers nothing, without throwing', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    fill();
    expect(() => saveDraft(form())).not.toThrow();
    expect(restoreOffer()).toBeNull();
  });

  it('ignores a corrupt draft', () => {
    sessionStorage.setItem(KEY, '{not json');
    expect(restoreOffer()).toBeNull();
    expect(stored()).toBe('');
  });
});

describe('the setting', () => {
  function pressProceed(): void {
    const unbind = bindProceed();
    document.addEventListener('submit', onSubmit, true);
    form().addEventListener('submit', (e) => e.preventDefault());
    (document.querySelector('#form button[type="submit"]') as HTMLButtonElement).click();
    document.removeEventListener('submit', onSubmit, true);
    unbind();
  }

  it('is off by default: proceeding saves nothing', () => {
    expect(DEFAULT_SETTINGS.restoreInput).toBe(false);
    fill();
    pressProceed();
    expect(stored()).toBe('');
  });

  it('saves on proceed when switched on', () => {
    loadForm({ restoreInput: true });
    fill();
    pressProceed();
    expect(stored()).toContain('taro@example.jp');
  });
});
