// @vitest-environment jsdom
/** Write-back, undo, and the indicator host. */
import { describe, it, expect, beforeEach } from 'vitest';
import { setFieldValue, revertFieldValue, markComposing, isComposing } from '../src/content/applier.js';
import { showConversion, hide, destroyIndicator } from '../src/content/indicator.js';

function field(value: string): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'text';
  el.value = value;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  destroyIndicator();
});

describe('setFieldValue', () => {
  it('writes the new value and returns the old one', () => {
    const el = field('０９０');
    const previous = setFieldValue(el, '090');
    expect(el.value).toBe('090');
    expect(previous).toBe('０９０');
  });

  it('is a no-op when the value is unchanged', () => {
    const el = field('090');
    const seen: string[] = [];
    el.addEventListener('input', () => seen.push('input'));
    setFieldValue(el, '090');
    expect(seen).toHaveLength(0);
  });

  it('notifies frameworks via bubbling input and change events', () => {
    const el = field('０９０');
    const seen: string[] = [];
    document.body.addEventListener('input', () => seen.push('input'));
    document.body.addEventListener('change', () => seen.push('change'));
    setFieldValue(el, '090');
    // Both must bubble: React listens at the root, not on the element.
    expect(seen).toEqual(['input', 'change']);
  });

  it('writes through the native setter so a framework value tracker sees it', () => {
    const el = field('０９０');
    // Mimic React's value tracker, which caches the last value it wrote.
    let observed: string | null = null;
    el.addEventListener('input', () => { observed = el.value; });
    setFieldValue(el, '090');
    expect(observed).toBe('090');
  });

  it('works on a textarea', () => {
    const el = document.createElement('textarea');
    el.value = 'ＡＢＣ';
    document.body.appendChild(el);
    setFieldValue(el, 'ABC');
    expect(el.value).toBe('ABC');
  });
});

describe('undo', () => {
  it('restores the previous value exactly', () => {
    const el = field('ﾔﾏﾀﾞ');
    const previous = setFieldValue(el, 'ヤマダ');
    expect(el.value).toBe('ヤマダ');
    revertFieldValue(el, previous);
    expect(el.value).toBe('ﾔﾏﾀﾞ');
  });

  it('fires events on revert so frameworks stay in sync', () => {
    const el = field('ﾔﾏﾀﾞ');
    const previous = setFieldValue(el, 'ヤマダ');
    const seen: string[] = [];
    el.addEventListener('input', () => seen.push('input'));
    revertFieldValue(el, previous);
    expect(seen).toContain('input');
  });
});

describe('composition tracking', () => {
  it('reports composition state per field', () => {
    const a = field('');
    const b = field('');
    expect(isComposing(a)).toBe(false);
    markComposing(a, true);
    expect(isComposing(a)).toBe(true);
    expect(isComposing(b)).toBe(false);
    markComposing(a, false);
    expect(isComposing(a)).toBe(false);
  });
});

describe('indicator', () => {
  it('mounts an isolated host that does not disturb page layout', () => {
    const el = field('ヤマダ');
    showConversion(el, 'katakana-full', () => {});
    const host = document.getElementById('dejapanify-indicator-host');
    expect(host).not.toBeNull();
    // Fixed and zero-sized: it must never shift the page or catch clicks.
    expect(host!.style.position).toBe('fixed');
    expect(host!.style.pointerEvents).toBe('none');
  });

  it('reuses one host across conversions', () => {
    const el = field('ヤマダ');
    showConversion(el, 'katakana-full', () => {});
    showConversion(el, 'katakana-full', () => {});
    expect(document.querySelectorAll('#dejapanify-indicator-host')).toHaveLength(1);
  });

  it('tears down cleanly', () => {
    showConversion(field('x'), 'digits-half', () => {});
    hide();
    destroyIndicator();
    expect(document.getElementById('dejapanify-indicator-host')).toBeNull();
  });
});
