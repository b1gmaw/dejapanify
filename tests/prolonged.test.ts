// @vitest-environment jsdom
/**
 * The ー suggestion: offered only once the page has rejected a value, and
 * applied only when the user accepts. The chip lives in a closed shadow root,
 * so the indicator is replaced to capture what it was asked to show.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { expandProlongedMark } from '../src/core/convert.js';
import { DEFAULT_SETTINGS } from '../src/core/types.js';

const chips = vi.hoisted(() => ({
  suggestions: [] as { text: string; accept: () => void }[],
  notices: [] as { text: string; undo: () => void }[],
}));

vi.mock('../src/content/indicator.js', () => ({
  showConversion: () => {},
  destroyIndicator: () => {},
  showSuggestion: (_el: unknown, text: string, _action: string, accept: () => void) => {
    chips.suggestions.push({ text, accept });
  },
  showNotice: (_el: unknown, text: string, undo: () => void) => {
    chips.notices.push({ text, undo });
  },
}));

const { considerField, offerProlongedFixes, setSettings } = await import('../src/content/manager.js');
const { collectFields } = await import('../src/content/observer.js');

describe('expandProlongedMark', () => {
  it.each([
    ['まー', 'まあ'],
    ['しーな', 'しいな'],
    ['すーじー', 'すうじい'],
    ['けーこ', 'けいこ'],
    ['そーま', 'そうま'],
    ['きょーこ', 'きょうこ'],
    ['まー　たろー', 'まあ　たろう'],
  ])('respells %s as %s', (input, expected) => {
    expect(expandProlongedMark(input)).toBe(expected);
  });

  it.each([
    ['nothing to change', 'やまだ'],
    ['no text at all', ''],
    ['a leading mark', 'ーま'],
    ['a mark after ん', 'んー'],
    ['a mark after っ', 'まっー'],
    ['a doubled mark', 'まーー'],
    ['a mark after a space', 'ま　ーた'],
  ])('gives up on %s', (_name, input) => {
    expect(expandProlongedMark(input)).toBeNull();
  });
});

describe('the suggestion', () => {
  /** Osho's kana box: the note makes it hiragana, the site's rule refuses ー. */
  function load(settings = {}): HTMLInputElement {
    document.body.innerHTML = `<form><div class="in"><div>
      <div><label for="kana">せい</label><div><input id="kana" name="user_kana1" type="text"></div></div>
      <span>姓名の読み仮名をひらがなでご入力ください</span>
    </div></div></form>`;
    setSettings({ ...DEFAULT_SETTINGS, ...settings });
    for (const el of collectFields(document)) considerField(el);
    return document.getElementById('kana') as HTMLInputElement;
  }

  const reject = (el: HTMLInputElement) => el.setAttribute('aria-invalid', 'true');

  beforeEach(() => {
    chips.suggestions.length = 0;
    chips.notices.length = 0;
  });

  it('waits for the page to reject the value', () => {
    const el = load();
    el.value = 'まー';
    el.dispatchEvent(new Event('blur'));
    offerProlongedFixes();
    expect(chips.suggestions).toHaveLength(0);

    reject(el);
    offerProlongedFixes();
    expect(chips.suggestions.map((s) => s.text)).toEqual(['まあ に変更しますか？']);
  });

  it('takes a printed error as a rejection too', () => {
    const el = load();
    el.value = 'まー';
    const note = document.createElement('span');
    note.className = 'field-error';
    note.textContent = '全角ひらがなで入力してください';
    el.parentElement!.append(note);
    offerProlongedFixes();
    expect(chips.suggestions).toHaveLength(1);
  });

  it('leaves the value alone until accepted, then offers an undo', () => {
    const el = load();
    el.value = 'まー';
    reject(el);
    offerProlongedFixes();
    expect(el.value).toBe('まー');

    chips.suggestions[0]!.accept();
    expect(el.value).toBe('まあ');
    chips.notices[0]!.undo();
    expect(el.value).toBe('まー');
  });

  it('tells a framework about the accepted value', () => {
    const el = load();
    const heard: string[] = [];
    el.addEventListener('input', () => heard.push(el.value));
    el.value = 'まー';
    reject(el);
    offerProlongedFixes();
    chips.suggestions[0]!.accept();
    expect(heard).toEqual(['まあ']);
  });

  it('does not overwrite what was typed while the chip was up', () => {
    const el = load();
    el.value = 'まー';
    reject(el);
    offerProlongedFixes();
    el.value = 'まーく';
    chips.suggestions[0]!.accept();
    expect(el.value).toBe('まーく');
  });

  it('offers once per value, and again for a new one', () => {
    const el = load();
    el.value = 'まー';
    reject(el);
    offerProlongedFixes();
    offerProlongedFixes();
    expect(chips.suggestions).toHaveLength(1);

    el.value = 'そーま';
    offerProlongedFixes();
    expect(chips.suggestions).toHaveLength(2);
  });

  it('notices a rejection already showing when the field is left', () => {
    const el = load();
    reject(el);
    el.value = 'まー';
    el.dispatchEvent(new Event('blur'));
    expect(chips.suggestions).toHaveLength(1);
  });

  it('stays quiet when chips are switched off, or the extension is', () => {
    for (const settings of [{ showIndicator: false }, { enabled: false }]) {
      const el = load(settings);
      el.value = 'まー';
      reject(el);
      offerProlongedFixes();
    }
    expect(chips.suggestions).toHaveLength(0);
  });

  it('ignores a value it cannot respell', () => {
    const el = load();
    el.value = 'んー';
    reject(el);
    offerProlongedFixes();
    expect(chips.suggestions).toHaveLength(0);
  });

  it('ignores a katakana field, where ー belongs', () => {
    document.body.innerHTML = `<form><div><input id="k" name="kana" type="text"></div></form>`;
    setSettings(DEFAULT_SETTINGS);
    for (const el of collectFields(document)) considerField(el);
    const el = document.getElementById('k') as HTMLInputElement;
    el.value = 'マー';
    reject(el);
    offerProlongedFixes();
    expect(chips.suggestions).toHaveLength(0);
  });
});
