/**
 * End-to-end test against the BUILT extension.
 *
 * Every other test imports the source modules and drives them directly, which
 * means none of them execute src/content/index.ts -- the real entry point that
 * loads settings, decides whether to run, and starts the observer. A bug there,
 * or in the bundling, produced an extension that converted nothing while the
 * whole suite stayed green.
 *
 * So this loads the actual dist/<target>/content.js into a real page and checks
 * that conversion happens through the genuine startup path.
 */
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const DEMO = readFileSync(join(ROOT, 'public', 'demo.html'), 'utf8');

const TARGETS = ['chrome', 'firefox'] as const;

/** The slice of the extension API a content script actually touches. */
function fakeExtensionApi() {
  const store: Record<string, unknown> = {};
  const area = {
    get: async (d: Record<string, unknown>) => ({ ...d, ...store }),
    set: async (o: Record<string, unknown>) => { Object.assign(store, o); },
    remove: async () => {},
  };
  return {
    runtime: {
      id: 'test',
      getURL: (p: string) => p,
      onMessage: { addListener: () => {} },
      sendMessage: async () => {},
    },
    storage: { sync: area, local: area, onChanged: { addListener: () => {}, removeListener: () => {} } },
  };
}

/**
 * The page's window, plus the two things this test pokes at: an injectable
 * `chrome` global and `eval` for loading the bundle the way a browser would.
 */
type TestWindow = JSDOM['window'] & {
  eval(code: string): void;
};

interface Mounted {
  window: TestWindow;
  field(id: string): HTMLInputElement;
}

function open(html: string, url: string, runPageScripts: boolean): TestWindow {
  const dom = new JSDOM(html, {
    url,
    runScripts: runPageScripts ? 'dangerously' : 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window as unknown as TestWindow;
  // Cast at the assignment: the ambient `chrome` global from @types/chrome
  // describes the whole API surface, and this stub is only the used slice.
  (w as unknown as { chrome: unknown }).chrome = fakeExtensionApi();
  return w;
}

function loadBundle(w: TestWindow, target: string): void {
  const bundle = join(ROOT, 'dist', target, 'content.js');
  if (!existsSync(bundle)) throw new Error(`missing ${bundle} — run npm run build`);
  w.eval(readFileSync(bundle, 'utf8'));
}

function mount(
  target: string,
  { withExtension = true, url = 'https://example.co.jp/apply', runPageScripts = false } = {},
): Mounted {
  const w = open(DEMO, url, runPageScripts);
  if (withExtension) loadBundle(w, target);
  return {
    window: w,
    field: (id: string) => w.document.getElementById(id) as HTMLInputElement,
  };
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.each(TARGETS)('built %s bundle on the demo page', (target) => {
  it('starts up and marks the document as active', async () => {
    const { window } = mount(target);
    await tick(150);
    expect(window.document.documentElement.dataset.dejapanify).toBe('active');
  });

  it('binds the fields it can identify', async () => {
    const { field } = mount(target);
    await tick(150);
    expect(field('name_kana').dataset.dejapanifyKind).toBe('katakana-full');
    expect(field('zip').dataset.dejapanifyKind).toBe('digits-half');
  });

  it('converts on blur', async () => {
    const { window, field } = mount(target);
    await tick(150);

    const kana = field('name_kana');
    kana.value = 'やまだ たろう';
    kana.dispatchEvent(new window.Event('blur'));

    const zip = field('zip');
    zip.value = '１５０－０００１';
    zip.dispatchEvent(new window.Event('blur'));

    await tick(50);
    expect(kana.value).toBe('ヤマダ　タロウ');
    expect(zip.value).toBe('1500001');
  });

  it('converts the whole form on submit', async () => {
    const { window, field } = mount(target);
    await tick(150);
    field('email').value = 'ｅｘａｍｐｌｅ＠ｍａｉｌ．ｊｐ';
    field('furikomi').value = 'ヤマダタロウ';

    const form = window.document.getElementById('form') as HTMLFormElement;
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await tick(50);

    expect(field('email').value).toBe('example@mail.jp');
    expect(field('furikomi').value).toBe('ﾔﾏﾀﾞﾀﾛｳ');
  });

  it('leaves passwords alone', async () => {
    const { window, field } = mount(target);
    await tick(150);
    const pw = field('password');
    pw.value = 'ＳｅｃｒｅｔＰａｓｓ１';
    pw.dispatchEvent(new window.Event('blur'));
    await tick(50);
    expect(pw.value).toBe('ＳｅｃｒｅｔＰａｓｓ１');
  });

  it('does nothing at all when the page is not Japanese', async () => {
    // Guards the japaneseOnly gate: an English page must be untouched.
    const w = open(
      '<!DOCTYPE html><html lang="en"><body><input id="a" name="zip"></body></html>',
      'https://example.com/',
      false,
    );
    loadBundle(w, target);
    await tick(150);
    expect(w.document.documentElement.dataset.dejapanify).toBeUndefined();
  });
});

describe('the demo page reports whether the extension is running', () => {
  it('says active once the content script starts', async () => {
    const { window } = mount('firefox', { runPageScripts: true });
    await tick(400);
    const box = window.document.getElementById('status')!;
    expect(box.className).toContain('status-active');
    expect(box.textContent).toContain('extension is running');
  });

  it('says not detected, with instructions, when it never starts', async () => {
    // This is the state the user hit: no extension, and previously no signal
    // of any kind that something was wrong.
    const { window } = mount('firefox', { withExtension: false, runPageScripts: true });
    await tick(1800);
    const box = window.document.getElementById('status')!;
    expect(box.className).toContain('status-inactive');
    expect(box.textContent).toContain('extension not detected');
    expect(box.textContent).toContain('about:debugging');
  });

  it('warns about local files when opened over file://', async () => {
    const { window } = mount('firefox', {
      withExtension: false,
      runPageScripts: true,
      url: 'file:///home/user/dejapanify/public/demo.html',
    });
    await tick(1800);
    const text = window.document.getElementById('status')!.textContent ?? '';
    expect(text).toContain('local file');
    expect(text).toContain('npm run demo');
  });
});
