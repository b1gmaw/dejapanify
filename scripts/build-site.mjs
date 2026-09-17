/**
 * Builds the GitHub Pages site into docs/.
 *
 * Two jobs: bundle the live demo from the extension's own source (so the page
 * cannot drift from shipped behaviour), and render the privacy policy from
 * store/privacy.md into docs/privacy.html -- the policy is quoted in store
 * listings and must have exactly one source of truth.
 */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const ASSETS = join(DOCS, 'assets');

// --- a deliberately small Markdown renderer ---------------------------------
// Handles only the constructs used by store/privacy.md. Anything more would be
// a dependency; anything less would mean maintaining the policy twice.

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Bare URLs, but not ones already inside an href.
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>');
}

function renderMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
    buf.length = 0;
  };
  const para = [];

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { flushParagraph(para); i++; continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(para);
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) { flushParagraph(para); out.push('<hr>'); i++; continue; }

    // table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      flushParagraph(para);
      const cells = (row) =>
        row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes('|')) { body.push(cells(lines[i])); i++; }
      out.push(
        '<table>' +
        `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
        `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>` +
        '</table>',
      );
      continue;
    }

    // bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph(para);
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushParagraph(para);
  return out.join('\n');
}

function privacyPage() {
  const md = readFileSync(join(ROOT, 'store', 'privacy.md'), 'utf8');
  // The H1 becomes the page title; the nav supplies the visible heading.
  const body = renderMarkdown(md);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — dejapanify</title>
<meta name="description" content="dejapanify collects nothing, transmits nothing, and has no servers.">
<link rel="icon" href="assets/icon128.png">
<link rel="stylesheet" href="styles.css">
<style>
  .prose { max-width: 720px; margin: 0 auto; padding: 56px 20px 80px; }
  .prose h1 { font-size: 34px; margin-bottom: 8px; }
  .prose h2 { font-size: 21px; margin-top: 36px; }
  .prose hr { border: 0; border-top: 1px solid var(--line); margin: 32px 0; }
  .prose table { width: 100%; border-collapse: collapse; font-size: 14.5px; margin: 16px 0; }
  .prose th, .prose td { text-align: left; padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .prose th { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .prose ul { color: var(--muted); }
  .prose p { color: var(--muted); }
  .prose h1, .prose h2, .prose strong { color: var(--fg); }
</style>
</head>
<body>
<header class="site">
  <div class="wrap">
    <a class="brand" href="./" style="text-decoration:none;color:inherit">
      <img src="assets/icon128.png" alt=""> dejapanify
    </a>
    <nav><a href="./">Home</a><a href="https://github.com/b1gmaw/dejapanify">GitHub</a></nav>
  </div>
</header>
<main class="prose">
${body}
</main>
<footer class="site">
  <div class="wrap"><p><a href="./">← Back to dejapanify</a></p></div>
</footer>
</body>
</html>
`;
}

async function build() {
  mkdirSync(ASSETS, { recursive: true });

  // The demo imports src/core directly, so the page runs the shipped engine.
  await esbuild.build({
    entryPoints: [join(ROOT, 'src/site/demo.ts')],
    outfile: join(DOCS, 'demo.js'),
    bundle: true,
    format: 'esm',
    target: ['chrome110', 'firefox115', 'safari15'],
    platform: 'browser',
    minify: true,
    legalComments: 'none',
    logLevel: 'warning',
  });

  writeFileSync(join(DOCS, 'privacy.html'), privacyPage());

  cpSync(join(ROOT, 'public/icons/icon128.png'), join(ASSETS, 'icon128.png'));
  const storeAssets = join(ROOT, 'store/assets');
  if (existsSync(storeAssets)) {
    for (const name of ['marquee-1400x560.png', 'screenshot-1-before-after.png', 'screenshot-2-undo-chip.png']) {
      const src = join(storeAssets, name);
      if (existsSync(src)) cpSync(src, join(ASSETS, name));
    }
  }

  // Tells GitHub Pages to serve the directory as-is rather than run Jekyll,
  // which would otherwise ignore files and folders beginning with an underscore.
  writeFileSync(join(DOCS, '.nojekyll'), '');

  console.log('site -> docs/');
}

build();
