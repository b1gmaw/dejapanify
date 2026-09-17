/**
 * Builds dist/chrome and dist/firefox from one source tree.
 *
 * The two browsers differ in only a handful of manifest keys, so the manifest
 * is defined once as an object and specialised per target rather than kept as
 * two files that drift apart.
 */
import * as esbuild from 'esbuild';
import { mkdirSync, rmSync, writeFileSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { zipDirectory } from './zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = createRequire(import.meta.url)(join(ROOT, 'package.json'));

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

const WATCH = flag('watch');
const ZIP = flag('zip');
const ONLY = value('target', null);
const TARGETS = ONLY ? [ONLY] : ['chrome', 'firefox'];

const DESCRIPTION =
  'Auto-converts Japanese form fields between half-width and full-width (半角・全角) so forms stop rejecting correct input.';

function manifest(target) {
  const base = {
    manifest_version: 3,
    name: 'dejapanify',
    version: pkg.version,
    description: DESCRIPTION,
    // storage is the only permission needed: content scripts declared in the
    // manifest are injected without a separate host permission grant.
    permissions: ['storage'],
    icons: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    action: {
      default_title: 'dejapanify',
      default_popup: 'popup/popup.html',
      default_icon: {
        16: 'icons/icon16.png',
        32: 'icons/icon32.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      },
    },
    options_ui: {
      page: 'options/options.html',
      open_in_tab: true,
    },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        // Forms live in iframes often enough (payment and address widgets)
        // that skipping them would miss a real share of the problem.
        all_frames: true,
        run_at: 'document_idle',
      },
    ],
  };

  if (target === 'firefox') {
    base.browser_specific_settings = {
      gecko: {
        id: 'dejapanify@maw.dev',
        // 142 is the floor for data_collection_permissions below on Android (140
        // on desktop). Nothing else here needs a version that recent, but the
        // declaration is mandatory for new listings, so the floor follows it.
        strict_min_version: '142.0',
        // Mandatory for new Firefox extensions since November 2025. Ours is
        // the simple case: the extension reads and rewrites form values in the
        // page and never transmits anything, so it collects no data at all.
        data_collection_permissions: {
          required: ['none'],
        },
      },
    };
  }

  return base;
}

const ENTRIES = [
  { in: 'src/content/index.ts', out: 'content', format: 'iife' },
  { in: 'src/popup/popup.ts', out: 'popup/popup', format: 'esm' },
  { in: 'src/options/options.ts', out: 'options/options', format: 'esm' },
];

async function buildTarget(target) {
  const outdir = join(ROOT, 'dist', target);
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });

  for (const entry of ENTRIES) {
    await esbuild.build({
      entryPoints: [join(ROOT, entry.in)],
      outfile: join(outdir, `${entry.out}.js`),
      bundle: true,
      format: entry.format,
      target: ['chrome110', 'firefox142'],
      platform: 'browser',
      sourcemap: WATCH ? 'inline' : false,
      minify: !WATCH,
      legalComments: 'none',
      logLevel: 'warning',
    });
  }

  // Static assets: HTML, CSS and icons keep their source-relative paths.
  cpSync(join(ROOT, 'src/popup/popup.html'), join(outdir, 'popup/popup.html'));
  cpSync(join(ROOT, 'src/popup/popup.css'), join(outdir, 'popup/popup.css'));
  cpSync(join(ROOT, 'src/options/options.html'), join(outdir, 'options/options.html'));
  cpSync(join(ROOT, 'src/options/options.css'), join(outdir, 'options/options.css'));

  const icons = join(ROOT, 'public/icons');
  if (!existsSync(icons)) {
    const { generateIcons } = await import('./make-icons.mjs');
    generateIcons();
  }
  cpSync(icons, join(outdir, 'icons'), { recursive: true });

  writeFileSync(
    join(outdir, 'manifest.json'),
    `${JSON.stringify(manifest(target), null, 2)}\n`,
  );

  return outdir;
}

function dirSize(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    total += s.isDirectory() ? dirSize(p) : s.size;
  }
  return total;
}

async function zip(target, outdir) {
  const artifacts = join(ROOT, 'web-ext-artifacts');
  mkdirSync(artifacts, { recursive: true });
  const out = join(artifacts, `dejapanify-${pkg.version}-${target}.zip`);
  rmSync(out, { force: true });
  const bytes = zipDirectory(outdir, out);
  console.log(`  packaged ${out} (${(bytes / 1024).toFixed(1)} KB)`);
}

for (const target of TARGETS) {
  const outdir = await buildTarget(target);
  console.log(`built ${target} -> dist/${target} (${(dirSize(outdir) / 1024).toFixed(1)} KB)`);
  if (ZIP) await zip(target, outdir);
}

if (WATCH) {
  const { watch } = await import('node:fs');
  console.log('watching src/ ...');
  let timer;
  watch(join(ROOT, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      for (const target of TARGETS) await buildTarget(target);
      console.log(`rebuilt ${new Date().toLocaleTimeString()}`);
    }, 120);
  });
}
