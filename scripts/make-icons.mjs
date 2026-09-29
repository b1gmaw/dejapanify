/**
 * Produces the extension's icons from the artwork in art/.
 *
 *   art/icon-128.png  -> public/icons/icon128.png (used as-is)
 *   art/icon-300.png  -> public/icons/icon48.png, icon32.png, icon16.png
 *
 * The small sizes are scaled down from the 300px artwork rather than the 128px
 * one: the more source pixels, the cleaner the result at 16px.
 *
 * The generated PNGs are committed, so an ordinary build never runs this and
 * stays free of image tooling. Run it after changing the artwork:
 *
 *   npm run icons
 *
 * Needs ImageMagick (`magick`).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_300 = join(ROOT, 'art', 'icon-300.png');
const ART_128 = join(ROOT, 'art', 'icon-128.png');

/** Sizes the manifest names; 128 comes from its own artwork. */
const SCALED = [48, 32, 16];

export function generateIcons(outDir = join(ROOT, 'public', 'icons')) {
  for (const art of [ART_300, ART_128]) {
    if (!existsSync(art)) throw new Error(`missing artwork: ${art}`);
  }
  mkdirSync(outDir, { recursive: true });

  const written = [];
  const out128 = join(outDir, 'icon128.png');
  copyFileSync(ART_128, out128);
  written.push(out128);

  for (const size of SCALED) {
    const out = join(outDir, `icon${size}.png`);
    // -strip drops timestamps and other metadata, so the output depends only
    // on the artwork and the files stay reproducible.
    execFileSync('magick', [
      ART_300,
      '-filter', 'Lanczos',
      '-resize', `${size}x${size}`,
      '-strip',
      `PNG32:${out}`,
    ]);
    written.push(out);
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of generateIcons()) console.log(`wrote ${f}`);
}
