// @vitest-environment jsdom
/**
 * Drives the landing page's live demo against the real docs/index.html.
 *
 * The page advertises that it runs the extension's actual engine, so this
 * asserts it genuinely converts -- a broken demo on the install page would be
 * worse than no demo.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HTML = readFileSync(join(__dirname, '..', 'docs', 'index.html'), 'utf8');

const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
const explainOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-explain="${id}"]`)!;

beforeAll(async () => {
  document.documentElement.innerHTML = HTML.replace(/<script[\s\S]*?<\/script>/g, '');
  // Imported after the DOM exists: the module wires itself up on load.
  await import('../src/site/demo.js');
});

function fillAndConvert(): void {
  document.getElementById('demo-fill')!.dispatchEvent(new Event('click'));
  document.getElementById('demo-convert')!.dispatchEvent(new Event('click'));
}

describe('landing page demo', () => {
  it('has the fields the page describes', () => {
    for (const id of ['d-kana', 'd-zip', 'd-mail', 'd-furikomi', 'd-name']) {
      expect($(id), `missing #${id}`).toBeTruthy();
      expect($(id).dataset.sample, `#${id} has no sample`).toBeTruthy();
    }
  });

  it('fills every field with a deliberately wrong width', () => {
    document.getElementById('demo-fill')!.dispatchEvent(new Event('click'));
    expect($('d-kana').value).toBe('やまだ たろう');
    expect($('d-zip').value).toBe('１５０－０００１');
  });

  it('converts each field to what its hint text demands', () => {
    fillAndConvert();
    expect($('d-kana').value).toBe('ヤマダ　タロウ');
    expect($('d-zip').value).toBe('1500001');
    expect($('d-mail').value).toBe('example@mail.jp');
    expect($('d-furikomi').value).toBe('ﾔﾏﾀﾞﾀﾛｳ');
  });

  it('leaves the unlabelled field alone, as the page claims', () => {
    fillAndConvert();
    expect($('d-name').value).toBe('ﾔﾏﾀﾞ ﾀﾛｳ');
    expect(explainOf('d-name').dataset.state).toBe('skip');
  });

  it('explains what it decided', () => {
    fillAndConvert();
    expect(explainOf('d-kana').textContent).toContain('全角カタカナ');
    expect(explainOf('d-kana').dataset.state).toBe('ok');
  });

  it('converts on blur, not only via the button', () => {
    document.getElementById('demo-reset')!.dispatchEvent(new Event('click'));
    $('d-zip').value = '１５０－０００１';
    $('d-zip').dispatchEvent(new Event('blur'));
    expect($('d-zip').value).toBe('1500001');
  });

  it('offers a working undo', () => {
    document.getElementById('demo-reset')!.dispatchEvent(new Event('click'));
    $('d-kana').value = 'やまだ たろう';
    $('d-kana').dispatchEvent(new Event('blur'));
    expect($('d-kana').value).toBe('ヤマダ　タロウ');

    const chip = document.querySelector<HTMLElement>('[data-chip="d-kana"]')!;
    expect(chip.hidden).toBe(false);
    chip.querySelector<HTMLButtonElement>('.chip-undo')!.click();
    expect($('d-kana').value).toBe('やまだ たろう');
    expect(chip.hidden).toBe(true);
  });

  it('is idempotent', () => {
    fillAndConvert();
    const after = ['d-kana', 'd-zip', 'd-mail', 'd-furikomi'].map((id) => $(id).value);
    document.getElementById('demo-convert')!.dispatchEvent(new Event('click'));
    expect(['d-kana', 'd-zip', 'd-mail', 'd-furikomi'].map((id) => $(id).value)).toEqual(after);
  });

  it('clears every field on reset', () => {
    fillAndConvert();
    document.getElementById('demo-reset')!.dispatchEvent(new Event('click'));
    for (const id of ['d-kana', 'd-zip', 'd-mail', 'd-furikomi', 'd-name']) {
      expect($(id).value).toBe('');
    }
  });
});

describe('stylesheet', () => {
  it('hides chips that carry the hidden attribute', () => {
    // An author-level `display` overrides the UA stylesheet's rule for
    // [hidden], so without this the undo chips render on page load.
    const css = readFileSync(join(__dirname, '..', 'docs', 'styles.css'), 'utf8');
    expect(css.replace(/\s+/g, ' ')).toContain('.chip[hidden] { display: none; }');
  });
});

describe('landing page content', () => {
  it('links the privacy policy and the source', () => {
    expect(HTML).toContain('privacy.html');
    expect(HTML).toContain('github.com/b1gmaw/dejapanify');
  });

  it('has an install panel for every browser the demo detects', () => {
    for (const browser of ['firefox', 'edge', 'chromium', 'other']) {
      expect(
        document.querySelector(`[data-install="${browser}"]`),
        `missing install panel for ${browser}`,
      ).toBeTruthy();
    }
  });

  it('is honest that Chromium browsers need a manual install', () => {
    const panel = document.querySelector('[data-install="chromium"]')!;
    // The phrase wraps across source lines, so compare on collapsed whitespace.
    const prose = (panel.textContent ?? '').replace(/\s+/g, ' ');
    expect(prose).toContain('Chrome Web Store');
    expect(prose).toContain('Developer mode');
    expect(panel.querySelector('.badge')!.textContent).toBe('Manual');
  });
});
