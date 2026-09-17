/**
 * Generates the extension icons as PNGs.
 *
 * Written by hand against the PNG spec so the repo needs no image toolchain or
 * binary assets checked in: `npm run icons` reproduces them from source.
 *
 * The mark is two stacked bars, the upper one wide and the lower one narrow --
 * a full-width character above its half-width equivalent, which is the whole
 * problem the extension solves.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 128];

const BG = [79, 70, 229, 255];      // indigo 600
const BG_EDGE = [67, 56, 202, 255]; // indigo 700, for the subtle rim
const FG = [255, 255, 255, 255];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type byte (0 = None).
  const raw = Buffer.alloc(height * (width * 4 + 1));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
      raw[o++] = rgba[i + 3];
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Coverage of a pixel by a rounded rectangle, sampled for anti-aliasing. */
function roundedRectCoverage(px, py, x0, y0, x1, y1, r, samples = 4) {
  let hits = 0;
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const x = px + (sx + 0.5) / samples;
      const y = py + (sy + 0.5) / samples;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const cx = Math.min(Math.max(x, x0 + r), x1 - r);
      const cy = Math.min(Math.max(y, y0 + r), y1 - r);
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r + 1e-9) hits++;
    }
  }
  return hits / (samples * samples);
}

function blend(dst, i, colour, alpha) {
  if (alpha <= 0) return;
  const a = Math.min(1, alpha);
  dst[i] = Math.round(dst[i] * (1 - a) + colour[0] * a);
  dst[i + 1] = Math.round(dst[i + 1] * (1 - a) + colour[1] * a);
  dst[i + 2] = Math.round(dst[i + 2] * (1 - a) + colour[2] * a);
  dst[i + 3] = Math.round(dst[i + 3] * (1 - a) + colour[3] * a);
}

function render(size) {
  const rgba = new Uint8Array(size * size * 4); // transparent
  const s = size;
  const radius = s * 0.22;

  // Background plate.
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const cov = roundedRectCoverage(x, y, 0, 0, s, s, radius);
      blend(rgba, (y * s + x) * 4, BG, cov);
    }
  }

  // A one-pixel darker rim reads better against light toolbars.
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const outer = roundedRectCoverage(x, y, 0, 0, s, s, radius);
      const inner = roundedRectCoverage(x, y, 1, 1, s - 1, s - 1, radius - 1);
      blend(rgba, (y * s + x) * 4, BG_EDGE, Math.max(0, outer - inner) * 0.85);
    }
  }

  // Two bars: wide over narrow. Scaled so they stay crisp at 16px.
  const barH = Math.max(2, Math.round(s * 0.13));
  const gap = Math.max(2, Math.round(s * 0.12));
  const wideW = Math.round(s * 0.58);
  const narrowW = Math.round(s * 0.29);
  const left = Math.round((s - wideW) / 2);
  const topY = Math.round(s / 2 - gap / 2 - barH);
  const botY = Math.round(s / 2 + gap / 2);
  const br = Math.min(barH / 2, s * 0.05);

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      blend(rgba, i, FG, roundedRectCoverage(x, y, left, topY, left + wideW, topY + barH, br));
      blend(rgba, i, FG, roundedRectCoverage(x, y, left, botY, left + narrowW, botY + barH, br));
    }
  }

  return png(s, s, rgba);
}

export function generateIcons(outDir = join(ROOT, 'public', 'icons')) {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const size of SIZES) {
    const file = join(outDir, `icon${size}.png`);
    writeFileSync(file, render(size));
    written.push(file);
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of generateIcons()) console.log(`wrote ${f}`);
}
