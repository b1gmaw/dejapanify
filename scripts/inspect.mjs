/**
 * Reports what the detector makes of a real page's form fields.
 *
 * The demo page is markup I wrote, so it can only ever confirm the detector
 * agrees with my own assumptions. This runs the same code against real HTML and
 * prints every field with the decision and the evidence behind it, which is
 * also what makes a "this site doesn't work" report actionable.
 *
 * Read-only: it fetches and analyses, and never installs or runs the extension.
 *
 *   node scripts/inspect.mjs https://example.co.jp/form
 *   node scripts/inspect.mjs ./public/demo.html
 */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Bundle the shipped detector so this script tests the real thing. */
async function loadEngine() {
  const out = join(tmpdir(), `dejapanify-inspect-${process.pid}.mjs`);
  await esbuild.build({
    stdin: {
      contents: `
        export { describeField, isEditableField } from './src/content/describe.js';
        export { detectField } from './src/core/detect.js';
        export { FIELD_KIND_LABELS, DEFAULT_SETTINGS } from './src/core/types.js';
      `,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    logLevel: 'error',
  });
  const mod = await import(`file://${out}`);
  rmSync(out, { force: true });
  return mod;
}

async function fetchHtml(target) {
  if (!/^https?:/i.test(target)) {
    return { html: readFileSync(resolve(target), 'utf8'), url: `file://${resolve(target)}` };
  }
  const res = await fetch(target, {
    headers: {
      // Identify honestly; ask for Japanese so sites serve the ja variant.
      'User-Agent': 'dejapanify-inspect/0.1 (+https://github.com/b1gmaw/dejapanify)',
      'Accept-Language': 'ja,en;q=0.8',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return { html: await res.text(), url: res.url };
}

const clip = (s, n) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function inspect(target) {
  const { describeField, isEditableField, detectField, FIELD_KIND_LABELS, DEFAULT_SETTINGS } =
    await loadEngine();

  const { html, url } = await fetchHtml(target);
  const dom = new JSDOM(html, { url: /^https?:/i.test(url) ? url : undefined });
  const doc = dom.window.document;

  // describeField uses instanceof against the page's own realm.
  const g = globalThis;
  const saved = { HTMLInputElement: g.HTMLInputElement, HTMLTextAreaElement: g.HTMLTextAreaElement, NodeFilter: g.NodeFilter };
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  g.NodeFilter = dom.window.NodeFilter;

  const fields = Array.from(doc.querySelectorAll('input, textarea')).filter(isEditableField);

  console.log(`\n\x1b[1m${url}\x1b[0m`);
  console.log(`lang="${doc.documentElement.lang || '(none)'}"  fields=${fields.length}`);

  if (fields.length === 0) {
    console.log('  \x1b[33mNo form fields in the served HTML.\x1b[0m');
    console.log('  Likely rendered client-side; this tells us nothing either way.');
    Object.assign(g, saved);
    return { url, total: 0, detected: 0, below: 0, rows: [] };
  }

  const rows = [];
  for (const el of fields) {
    const d = describeField(el);
    const detection = detectField(d);
    const name = d.name || d.id || `<${d.type}>`;
    const label = clip(d.labelText || d.hintText, 34);

    if (!detection) {
      rows.push({ name, kind: null, conf: 0, label, why: '' });
      continue;
    }
    rows.push({
      name,
      kind: detection.kind,
      conf: detection.confidence,
      label,
      why: detection.signals.map((s) => s.source).join(','),
      strip: detection.stripSeparators,
      below: detection.confidence < DEFAULT_SETTINGS.minConfidence,
    });
  }

  for (const r of rows) {
    const mark = !r.kind ? '\x1b[90m·\x1b[0m' : r.below ? '\x1b[33m~\x1b[0m' : '\x1b[32m✓\x1b[0m';
    const kind = r.kind ? FIELD_KIND_LABELS[r.kind].split(' (')[0] : '—';
    const conf = r.kind ? r.conf.toFixed(2) : '   ';
    console.log(
      `  ${mark} ${clip(r.name, 22).padEnd(22)} ${kind.padEnd(12)} ${conf}  ` +
      `${r.why ? `[${r.why}]` : ''}${r.strip ? ' strip' : ''}  ${r.label ? `“${r.label}”` : ''}`,
    );
  }

  const detected = rows.filter((r) => r.kind && !r.below).length;
  const below = rows.filter((r) => r.below).length;
  console.log(`  → ${detected} would convert, ${below} below threshold, ${rows.length - detected - below} ignored`);

  Object.assign(g, saved);
  return { url, total: rows.length, detected, below, rows };
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node scripts/inspect.mjs <url-or-file> [...]');
  process.exit(2);
}
for (const t of targets) {
  try {
    await inspect(t);
  } catch (e) {
    console.log(`\n\x1b[1m${t}\x1b[0m\n  \x1b[31mfailed: ${e.message}\x1b[0m`);
  }
}
