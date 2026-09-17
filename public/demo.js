/**
 * Behaviour for the dejapanify test form.
 *
 * Kept in its own file rather than inline in demo.html. Extension pages may not
 * run inline scripts under the default content security policy, and Mozilla's
 * linter flags inline blocks in any HTML it sees -- including the HTML that
 * travels in the source archive submitted for review.
 */
// Deliberately wrong widths, matching what an IME actually produces.
  const SAMPLES = {
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

  // --- extension status -----------------------------------------------------
  // The content script sets data-dejapanify="active" on <html> when it starts.
  // Without a signal like this the extension failing to inject is
  // indistinguishable from it finding nothing to convert, which makes a broken
  // install impossible to diagnose.
  const isActive = () => document.documentElement.dataset.dejapanify === 'active';

  const IS_FILE = location.protocol === 'file:';

  function showStatus(active) {
    const box = document.getElementById('status');
    const title = document.getElementById('status-title');
    const detail = document.getElementById('status-detail');
    box.classList.remove('status-checking');

    if (active) {
      box.classList.add('status-active');
      title.textContent = '\u2713 \u62e1\u5f35\u6a5f\u80fd\u304c\u6709\u52b9\u3067\u3059 \u2014 extension is running';
      detail.textContent = 'Fill the fields below and press Tab to see it convert.';
      return;
    }

    box.classList.add('status-inactive');
    title.textContent = '\u2715 \u62e1\u5f35\u6a5f\u80fd\u304c\u691c\u51fa\u3055\u308c\u307e\u305b\u3093 \u2014 extension not detected';
    // Built with DOM calls rather than innerHTML. The content is entirely
    // static, but assigning concatenated markup to innerHTML is exactly the
    // pattern Mozilla's linter flags, and this file ships in the source
    // archive submitted for review.
    detail.textContent =
      'Nothing on this page will convert until the extension is loaded and allowed to run here.';

    const steps = document.createElement('ol');

    // Renders "plain <tag>marked</tag> plain" without parsing any HTML.
    const step = (parts) => {
      const li = document.createElement('li');
      for (const part of parts) {
        if (typeof part === 'string') {
          li.appendChild(document.createTextNode(part));
        } else {
          const el = document.createElement(part.tag);
          el.textContent = part.text;
          li.appendChild(el);
        }
      }
      steps.appendChild(li);
    };

    step([
      { tag: 'strong', text: 'Firefox:' }, ' open ',
      { tag: 'code', text: 'about:debugging#/runtime/this-firefox' }, ' \u2192 ',
      { tag: 'em', text: 'Load Temporary Add-on' }, ' \u2192 select ',
      { tag: 'code', text: 'dist/firefox/manifest.json' }, '. Run ',
      { tag: 'code', text: 'npm run build' }, ' first if ',
      { tag: 'code', text: 'dist/' }, ' is missing.',
    ]);

    step([
      { tag: 'strong', text: 'Chrome:' }, ' open ',
      { tag: 'code', text: 'chrome://extensions' }, ', enable ',
      { tag: 'em', text: 'Developer mode' }, ', ',
      { tag: 'em', text: 'Load unpacked' }, ' \u2192 ',
      { tag: 'code', text: 'dist/chrome' }, '.',
    ]);

    if (IS_FILE) {
      step([
        { tag: 'strong', text: 'You opened this page as a local file.' },
        ' Browsers do not run extensions on ',
        { tag: 'code', text: 'file://' },
        ' pages. Firefox will not inject a content script there at all, and Chrome only does so if you enable ',
        { tag: 'em', text: 'Allow access to file URLs' },
        ' on the extension\u2019s details page. Easier: run ',
        { tag: 'code', text: 'npm run demo' },
        ' and use the http:// address it prints.',
      ]);
    }

    step(['Already loaded? Reload the extension, then reload this page.']);

    detail.appendChild(steps);
  }

  // document_idle means the content script can start after this script does,
  // so poll briefly rather than checking once and declaring failure.
  (function waitForExtension() {
    const deadline = Date.now() + 1500; // document_idle lands well inside this
    (function poll() {
      if (isActive()) return showStatus(true);
      if (Date.now() > deadline) return showStatus(false);
      setTimeout(poll, 100);
    })();
  })();

  // --- automated self-test (?selftest) --------------------------------------
  // Drives a real conversion and reports the verdict, so a real browser can be
  // checked end to end without a WebDriver.
  async function selfTest() {
    const active = isActive();
    const checks = [
      { id: 'name_kana', input: '\u3084\u307e\u3060 \u305f\u308d\u3046', expect: '\u30e4\u30de\u30c0\u3000\u30bf\u30ed\u30a6' },
      { id: 'zip', input: '\uff11\uff15\uff10\uff0d\uff10\uff10\uff10\uff11', expect: '1500001' },
      { id: 'email', input: '\uff45\uff58\uff41\uff4d\uff50\uff4c\uff45\uff20\uff4d\uff41\uff49\uff4c\uff0e\uff4a\uff50', expect: 'example@mail.jp' },
    ];

    const results = [];
    for (const c of checks) {
      const el = document.getElementById(c.id);
      el.focus();
      el.value = c.input;
      el.blur();
      await new Promise((r) => setTimeout(r, 120));
      results.push({ id: c.id, got: el.value, expect: c.expect, pass: el.value === c.expect });
    }

    const verdict = {
      ok: active && results.every((r) => r.pass),
      active,
      protocol: location.protocol,
      userAgent: navigator.userAgent,
      results,
    };

    try {
      await fetch(SELFTEST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // simple request: no preflight
        body: JSON.stringify(verdict),
      });
    } catch (e) {
      console.error('[dejapanify selftest] could not report:', e);
    }
    console.log('[dejapanify selftest]', JSON.stringify(verdict));
  }

  const params = new URLSearchParams(location.search);
  const SELFTEST_ENDPOINT =
    params.get('report') || (IS_FILE ? null : '/selftest-result');
  if (params.has('selftest') && SELFTEST_ENDPOINT) {
    // Give document_idle injection time to land before judging it.
    setTimeout(selfTest, 1200);
  }

  document.getElementById('seed').addEventListener('click', () => {
    for (const [id, value] of Object.entries(SAMPLES)) {
      const el = document.getElementById(id);
      if (el) el.value = value;
    }
    document.getElementById('result').style.display = 'none';
  });

  document.getElementById('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const out = [];
    for (const id of Object.keys(SAMPLES)) {
      const el = document.getElementById(id);
      if (el) out.push(`${id.padEnd(12)} = ${JSON.stringify(el.value)}`);
    }
    const result = document.getElementById('result');
    result.textContent = '送信値:\n' + out.join('\n');
    result.style.display = 'block';
  });
