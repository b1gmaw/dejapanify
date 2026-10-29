// @vitest-environment jsdom
/**
 * Form errors over the real demo form: naming the fields a page rejects,
 * stopping a proceed that is certainly wrong, catching a rejection that comes
 * later, and a page that loads already showing one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { considerField, setSettings } from '../src/content/manager.js';
import { collectFields } from '../src/content/observer.js';
import { collectProblems, errorSignals } from '../src/content/errors.js';
import { bindProceed, checkPage, onSubmit, WATCH_MS } from '../src/content/proceed.js';
import { destroyPanel } from '../src/content/panel.js';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/types.js';

const DEMO = readFileSync(join(__dirname, '..', 'public', 'demo.html'), 'utf8');

let unbind: (() => void) | null = null;
let submitted = 0;
const countSubmit = (e: Event): void => {
  e.preventDefault();
  submitted++;
};

function loadForm(overrides: Partial<Settings> = {}): void {
  document.documentElement.innerHTML = DEMO.replace(/<script[\s\S]*?<\/script>/g, '');
  setSettings({ ...DEFAULT_SETTINGS, showIndicator: false, ...overrides });
  for (const el of collectFields(document)) considerField(el);
  document.addEventListener('submit', onSubmit, true);
  document.getElementById('form')!.addEventListener('submit', countSubmit);
  submitted = 0;
  unbind = bindProceed();
}

afterEach(() => {
  unbind?.();
  document.removeEventListener('submit', onSubmit, true);
  destroyPanel();
  vi.useRealTimers();
});

const field = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
const flagged = (id: string): boolean => field(id).hasAttribute('data-dejapanify-problem');
const proceed = (): void => (document.querySelector('#form button[type="submit"]') as HTMLButtonElement).click();

function fillRequired(): void {
  field('name').value = '山田 太郎';
  field('name_kana').value = 'ヤマダ タロウ';
}

function markRow(id: string): void {
  field(id).closest('tr')!.classList.add('has-error');
}

function showBanner(...lines: string[]): void {
  const banner = document.getElementById('form-error')!;
  banner.hidden = false;
  if (lines.length === 1) banner.textContent = lines[0]!;
  else {
    const ul = document.createElement('ul');
    for (const line of lines) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    banner.appendChild(ul);
  }
}

/** Let the MutationObserver deliver, then run out the debounce. */
async function settle(): Promise<void> {
  await Promise.resolve();
  vi.advanceTimersByTime(400);
}

describe('naming the fields a page rejected', () => {
  beforeEach(() => loadForm());

  it('finds nothing on a fresh form, 必須 markers and notes included', () => {
    expect(errorSignals().size).toBe(0);
    expect(collectProblems()).toEqual([]);
  });

  it('names a row the page marked, by its heading', () => {
    markRow('tel1');
    const problems = collectProblems();
    expect(problems.map((p) => [p.name, p.reason, p.el.id])).toEqual([['電話番号', '入力内容を確認', 'tel1']]);
  });

  it('gives the page’s own message for a row', () => {
    const note = document.createElement('span');
    note.className = 'error';
    note.textContent = '電話番号を入力してください';
    field('tel1').closest('td')!.appendChild(note);
    expect(collectProblems().map((p) => p.reason)).toEqual(['電話番号を入力してください']);
  });

  it('ignores an error-classed note that isn’t an error', () => {
    const note = document.createElement('span');
    note.className = 'error';
    note.textContent = '※半角数字';
    field('tel1').closest('td')!.appendChild(note);
    expect(collectProblems()).toEqual([]);
  });

  it('matches a summary line to the field it names', () => {
    showBanner('入力内容に誤りがあります', 'メールアドレスの形式が正しくありません');
    const problems = collectProblems();
    expect(problems.map((p) => [p.name, p.reason])).toEqual([
      ['メールアドレス', 'メールアドレスの形式が正しくありません'],
    ]);
  });

  it('lists the certainly-wrong fields behind a vague banner', () => {
    showBanner('入力内容に誤りがあります。');
    expect(collectProblems().map((p) => [p.name, p.reason])).toEqual([
      ['お名前', '未入力'],
      ['フリガナ', '未入力'],
    ]);
  });

  it('ignores a hidden banner', () => {
    const banner = document.getElementById('form-error')!;
    banner.textContent = '入力内容に誤りがあります。';
    expect(collectProblems()).toEqual([]);
  });

  it('treats aria-invalid as a mark', () => {
    field('email').setAttribute('aria-invalid', 'true');
    expect(collectProblems().map((p) => p.name)).toEqual(['メールアドレス']);
  });

  it('never examines a password field', () => {
    field('password').setAttribute('aria-invalid', 'true');
    expect(collectProblems()).toEqual([]);
  });
});

describe('pre-flight on proceed', () => {
  beforeEach(() => loadForm());

  it('stops the first press when a 必須 field is empty, and jumps to it', () => {
    proceed();
    expect(submitted).toBe(0);
    expect(flagged('name')).toBe(true);
    expect(flagged('name_kana')).toBe(true);
    expect(document.activeElement).toBe(field('name'));
  });

  it('lets the second press through', () => {
    proceed();
    proceed();
    expect(submitted).toBe(1);
  });

  it('lets a complete form through first time', () => {
    fillRequired();
    proceed();
    expect(submitted).toBe(1);
    expect(flagged('name')).toBe(false);
  });

  it('counts a value width conversion fixes as fine', () => {
    fillRequired();
    field('zip').value = '１５０００１';   // pattern wants 7 half-width digits; this is 6
    proceed();
    expect(submitted).toBe(0);
    field('zip').value = '１５０－０００１';
    proceed();   // bypassed anyway, but the sweep has converted it
    expect(field('zip').value).toBe('1500001');
  });

  it('flags a value the field’s pattern rejects', () => {
    fillRequired();
    field('member_id').value = 'abc-123';
    proceed();
    expect(submitted).toBe(0);
    expect(flagged('member_id')).toBe(true);
  });

  it('ignores required fields that are hidden', () => {
    field('name_kana').value = 'ヤマダ タロウ';
    (field('name').closest('tr') as HTMLElement).style.display = 'none';
    proceed();
    expect(submitted).toBe(1);
  });

  it('drops a field from the list once it is fixed', () => {
    proceed();
    field('name').value = '山田 太郎';
    field('name').dispatchEvent(new Event('input', { bubbles: true }));
    expect(flagged('name')).toBe(false);
    expect(flagged('name_kana')).toBe(true);
  });

  it('ignores buttons that do not proceed', () => {
    (document.getElementById('seed') as HTMLButtonElement).click();
    expect(flagged('name')).toBe(false);
  });

  it('does nothing when switched off', () => {
    unbind?.();
    loadForm({ preflight: false });
    proceed();
    expect(submitted).toBe(1);
  });
});

describe('a rejection that comes later', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadForm();
    fillRequired();
  });

  it('names and jumps to the rows the page marks after a proceed', async () => {
    proceed();
    vi.advanceTimersByTime(1500);
    showBanner('入力内容に誤りがあります。');
    markRow('tel1');
    await settle();
    expect(flagged('tel1')).toBe(true);
    expect(document.activeElement).toBe(field('tel1'));
  });

  it('ignores errors that appear after the watch has ended', async () => {
    proceed();
    vi.advanceTimersByTime(WATCH_MS + 1);
    markRow('tel1');
    await settle();
    expect(flagged('tel1')).toBe(false);
  });

  it('ignores errors that were already showing before the press', async () => {
    markRow('tel1');
    proceed();
    document.body.classList.add('loading');   // some unrelated change wakes the watcher
    await settle();
    expect(flagged('tel1')).toBe(false);
  });

  it('does not watch when the helper is off', async () => {
    unbind?.();
    loadForm({ errorHelper: false });
    fillRequired();
    proceed();
    markRow('tel1');
    await settle();
    expect(flagged('tel1')).toBe(false);
  });
});

describe('a page that loads showing errors', () => {
  beforeEach(() => loadForm());

  it('names and jumps to them', () => {
    showBanner('入力内容に誤りがあります。');
    markRow('email');
    checkPage();
    expect(flagged('email')).toBe(true);
    expect(document.activeElement).toBe(field('email'));
  });

  it('stays quiet on an ordinary form', () => {
    checkPage();
    expect(document.querySelector('[data-dejapanify-problem]')).toBeNull();
  });
});
