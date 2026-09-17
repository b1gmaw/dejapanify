/**
 * Generates the store listing images (screenshots, tiles, logo).
 *
 * Same approach as make-icons.mjs: the artwork is authored as SVG here and
 * rasterised with rsvg-convert, so the listing images are reproducible from
 * source and a size change is a one-line edit rather than a redesign in an
 * image editor.
 *
 * Requires `rsvg-convert` (librsvg) and a CJK font. Both are checked for up
 * front, and the script exits cleanly with an explanation if either is absent,
 * so CI never fails on a missing optional tool.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store', 'assets');
const TMP = join(ROOT, 'store', '.svg');

// --- palette, matching the extension's own UI -------------------------------
const C = {
  bg: '#f4f5f7',
  card: '#ffffff',
  ink: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
  accent: '#4f46e5',
  accentSoft: '#eef2ff',
  bad: '#dc2626',
  badSoft: '#fef2f2',
  good: '#16a34a',
  goodSoft: '#f0fdf4',
  chip: '#1f2937',
  chipTick: '#34d399',
};

const FONT = "Noto Sans CJK JP, Noto Sans JP, sans-serif";
const MONO = "monospace";

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rect = (x, y, w, h, fill, r = 0, stroke = null, sw = 1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"` +
  (stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : '') + `/>`;

const text = (x, y, s, { size = 20, fill = C.ink, weight = 400, anchor = 'start', font = FONT, spacing = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}"` +
  ` font-weight="${weight}" text-anchor="${anchor}"` +
  (spacing ? ` letter-spacing="${spacing}"` : '') + `>${esc(s)}</text>`;

/**
 * The undo arrow, drawn rather than typed. U+27F2 (⟲) is absent from Noto
 * CJK and rasterises as an unrelated glyph, so the mark is a path.
 */
const undoArrow = (x, y, color, scale = 1) =>
  `<g transform="translate(${x},${y}) scale(${scale})">` +
  `<path d="M 13 8 A 5 5 0 1 1 8 3" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>` +
  `<path d="M 8 0.6 L 8 5.4 L 4.8 3 Z" fill="${color}"/>` +
  `</g>`;

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  rect(0, 0, w, h, C.bg) + body + `</svg>`;

/** A mock form input with a label above it. */
function field(x, y, w, { label, value, note, valueColor = C.ink, borderColor = C.line, mono = false }) {
  let out = '';
  if (label) out += text(x, y, label, { size: 19, fill: C.muted, weight: 600 });
  const boxY = y + 14;
  out += rect(x, boxY, w, 52, C.card, 8, borderColor, 2);
  out += text(x + 16, boxY + 34, value, {
    size: 24, fill: valueColor, font: mono ? MONO : FONT,
  });
  if (note) out += text(x, boxY + 52 + 24, note, { size: 17, fill: C.muted });
  return out;
}

// --- 1. the problem, before and after ---------------------------------------
function screenshotBeforeAfter() {
  const W = 1280, H = 800;
  let b = '';
  b += text(64, 86, 'Japanese forms demand a specific character width', { size: 40, weight: 700 });
  b += text(64, 132, '半角・全角の入力ミスを自動で修正します', { size: 25, fill: C.muted });

  const colW = 520, top = 190;
  // before
  b += rect(64, top, colW, 500, C.badSoft, 16, '#fecaca', 2);
  b += text(96, top + 48, 'What you typed', { size: 23, weight: 700, fill: C.bad });
  b += text(96, top + 80, '入力した値', { size: 18, fill: C.muted });
  let y = top + 130;
  for (const f of [
    { label: 'フリガナ', value: 'やまだ たろう' },
    { label: '郵便番号', value: '１５０－０００１' },
    { label: 'メールアドレス', value: 'ｅｘａｍｐｌｅ＠ｍａｉｌ．ｊｐ' },
  ]) {
    b += field(96, y, colW - 64, { ...f, borderColor: '#fca5a5', valueColor: C.bad });
    y += 108;
  }
  b += text(96, top + 462, '✕  エラー: 全角カタカナで入力してください', { size: 21, fill: C.bad, weight: 600 });

  // arrow
  b += `<path d="M 612 ${top + 250} l 44 0 m -14 -13 l 14 13 l -14 13" stroke="${C.accent}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

  // after
  b += rect(696, top, colW, 500, C.goodSoft, 16, '#bbf7d0', 2);
  b += text(728, top + 48, 'What dejapanify sends', { size: 23, weight: 700, fill: C.good });
  b += text(728, top + 80, '自動変換後', { size: 18, fill: C.muted });
  y = top + 130;
  for (const f of [
    { label: 'フリガナ', value: 'ヤマダ　タロウ' },
    { label: '郵便番号', value: '1500001', mono: true },
    { label: 'メールアドレス', value: 'example@mail.jp', mono: true },
  ]) {
    b += field(728, y, colW - 64, { ...f, borderColor: '#86efac', valueColor: C.good });
    y += 108;
  }
  b += text(728, top + 462, '✓  そのまま送信できます', { size: 21, fill: C.good, weight: 600 });

  b += text(64, 742, 'Works on any Japanese site. No setup, no account, no data leaves your browser.',
    { size: 21, fill: C.muted });
  b += text(64, 772, 'どの日本語サイトでも動作します。設定不要・アカウント不要・外部送信なし。',
    { size: 19, fill: C.muted });

  return svg(W, H, b);
}

// --- 2. the undo chip -------------------------------------------------------
function screenshotChip() {
  const W = 1280, H = 800;
  let b = '';
  b += text(64, 86, 'It tells you what it changed', { size: 40, weight: 700 });
  b += text(64, 132, '変換内容を表示し、ワンクリックで元に戻せます', { size: 25, fill: C.muted });

  b += rect(64, 190, 1152, 500, C.card, 16, C.line, 2);
  b += text(112, 252, 'お申し込みフォーム', { size: 27, weight: 700 });
  b += rect(112, 276, 1056, 2, C.line);

  b += field(112, 324, 620, {
    label: 'フリガナ　必須',
    value: 'ヤマダ　タロウ',
    borderColor: C.accent,
  });

  // the chip, as the content script renders it
  const cx = 112, cy = 404;
  b += rect(cx, cy, 392, 44, C.chip, 10);
  b += text(cx + 18, cy + 30, '✓', { size: 20, fill: C.chipTick, weight: 700 });
  b += text(cx + 44, cy + 30, '全角カタカナに変換', { size: 19, fill: '#f9fafb', weight: 500 });
  b += rect(cx + 232, cy + 8, 144, 28, 'rgba(255,255,255,0.14)', 7);
  b += undoArrow(cx + 244, cy + 14, '#f9fafb', 1.0);
  b += text(cx + 268, cy + 29, '元に戻す', { size: 17, fill: '#f9fafb' });

  b += text(112, 512, 'was: やまだ たろう', { size: 20, fill: C.muted, font: MONO });

  b += field(112, 560, 620, { label: '郵便番号', value: '1500001', mono: true, note: '半角数字・ハイフンなし' });

  // right-hand explanation
  let y = 340;
  for (const [h, s] of [
    ['Converts when you leave a field', 'フォーカスを外したときに変換'],
    ['Never interrupts your IME', 'IME入力中は何もしません'],
    ['Ctrl+Z still works', '通常の取り消しも有効'],
  ]) {
    b += `<circle cx="800" cy="${y - 7}" r="7" fill="${C.accent}"/>`;
    b += text(824, y, h, { size: 22, weight: 600 });
    b += text(824, y + 30, s, { size: 18, fill: C.muted });
    y += 92;
  }
  return svg(W, H, b);
}

// --- 3. detection signals ---------------------------------------------------
function screenshotDetection() {
  const W = 1280, H = 800;
  let b = '';
  b += text(64, 86, 'It reads what each field asks for', { size: 40, weight: 700 });
  b += text(64, 132, '推測ではなく、フォーム自身の指示を読み取ります', { size: 25, fill: C.muted });

  const rows = [
    ['pattern="^[0-9]{7}$"', 'the rule the site enforces', '半角数字 7桁', MONO],
    ['「半角数字で入力してください」', 'the printed instruction', '半角数字', FONT],
    ['autocomplete="postal-code"', 'the standard attribute', '半角数字', MONO],
    ['name="name_kana" / 「フリガナ」', 'the label and field name', '全角カタカナ', FONT],
  ];
  let y = 200;
  for (const [signal, why, result, font] of rows) {
    b += rect(64, y, 1152, 108, C.card, 14, C.line, 2);
    b += text(96, y + 46, signal, { size: 23, weight: 600, font });
    b += text(96, y + 78, why, { size: 18, fill: C.muted });
    b += rect(900, y + 32, 284, 44, C.accentSoft, 10);
    b += text(1042, y + 61, result, { size: 21, fill: C.accent, weight: 700, anchor: 'middle' });
    y += 124;
  }
  b += text(64, 742, 'When the signals are not conclusive, it leaves your text alone.', { size: 21, fill: C.muted });
  return svg(W, H, b);
}

// --- 4. privacy -------------------------------------------------------------
function screenshotPrivacy() {
  const W = 1280, H = 800;
  let b = '';
  b += text(64, 86, 'Everything happens on your machine', { size: 40, weight: 700 });
  b += text(64, 132, '外部送信は一切ありません', { size: 25, fill: C.muted });

  const items = [
    ['No network requests', 'The extension contains no fetch, no XHR, no remote scripts.', '通信コードなし'],
    ['No data collection', 'Nothing is logged, transmitted or shared. Ever.', 'データ収集なし'],
    ['No account', 'Install and it works. There is nothing to sign up for.', 'アカウント不要'],
    ['Open source, MIT', 'Every line is public and reproducible from source.', 'ソース公開'],
  ];
  let y = 196;
  for (const [h, s, jp] of items) {
    b += rect(64, y, 1152, 116, C.card, 14, C.line, 2);
    b += `<circle cx="120" cy="${y + 58}" r="22" fill="${C.goodSoft}" stroke="#86efac" stroke-width="2"/>`;
    b += `<path d="M 110 ${y + 58} l 7 8 l 14 -16" stroke="${C.good}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    b += text(166, y + 50, h, { size: 24, weight: 700 });
    b += text(166, y + 82, s, { size: 19, fill: C.muted });
    b += text(1184, y + 66, jp, { size: 19, fill: C.accent, weight: 600, anchor: 'end' });
    y += 132;
  }
  return svg(W, H, b);
}

// --- tiles ------------------------------------------------------------------
function logoMark(cx, cy, scale, bg = C.accent) {
  // The same wide-bar-over-narrow-bar mark as the toolbar icon.
  const s = 100 * scale;
  const x = cx - s / 2, y = cy - s / 2;
  let b = rect(x, y, s, s, bg, s * 0.22);
  const barH = s * 0.13, gap = s * 0.12;
  const wide = s * 0.58, narrow = s * 0.29, left = x + (s - wide) / 2;
  b += rect(left, cy - gap / 2 - barH, wide, barH, '#fff', barH / 2);
  b += rect(left, cy + gap / 2, narrow, barH, '#fff', barH / 2);
  return b;
}

function storeLogo() {
  return svg(300, 300, rect(0, 0, 300, 300, C.card) + logoMark(150, 150, 2.1));
}

function promoTile() {
  const W = 440, H = 280;
  let b = rect(0, 0, W, H, C.card);
  b += logoMark(84, 104, 0.92);
  b += text(140, 96, 'dejapanify', { size: 30, weight: 700 });
  b += text(140, 126, '半角・全角 自動変換', { size: 18, fill: C.muted });
  b += rect(36, 168, 368, 76, C.bg, 12, C.line, 2);
  // Full-width digits occupy a full em each, so the arrow needs clearance
  // that a latin-width estimate would not give it.
  b += text(56, 200, '１５０－０００１', { size: 19, fill: C.bad });
  b += text(240, 200, '→', { size: 20, fill: C.accent, weight: 700 });
  b += text(278, 200, '1500001', { size: 20, fill: C.good, font: MONO });
  b += text(56, 228, 'Japanese forms, fixed automatically', { size: 15, fill: C.muted });
  return svg(W, H, b);
}

function marquee() {
  const W = 1400, H = 560;
  let b = rect(0, 0, W, H, C.card);
  b += logoMark(180, 280, 1.5);
  b += text(310, 250, 'dejapanify', { size: 66, weight: 700 });
  b += text(312, 300, '半角・全角の入力ミスを自動で修正', { size: 30, fill: C.muted });
  b += rect(312, 340, 700, 90, C.bg, 14, C.line, 2);
  b += text(340, 378, 'やまだ たろう', { size: 26, fill: C.bad });
  b += text(560, 378, '→', { size: 26, fill: C.accent, weight: 700 });
  b += text(610, 378, 'ヤマダ　タロウ', { size: 26, fill: C.good });
  b += text(340, 410, 'Converts as you leave each field. Undo with one click.', { size: 18, fill: C.muted });
  return svg(W, H, b);
}

// --- render -----------------------------------------------------------------
const ASSETS = [
  { name: 'screenshot-1-before-after', w: 1280, h: 800, build: screenshotBeforeAfter },
  { name: 'screenshot-2-undo-chip', w: 1280, h: 800, build: screenshotChip },
  { name: 'screenshot-3-detection', w: 1280, h: 800, build: screenshotDetection },
  { name: 'screenshot-4-privacy', w: 1280, h: 800, build: screenshotPrivacy },
  { name: 'store-logo-300', w: 300, h: 300, build: storeLogo },
  { name: 'promo-tile-440x280', w: 440, h: 280, build: promoTile },
  { name: 'marquee-1400x560', w: 1400, h: 560, build: marquee },
];

function have(cmd) {
  try {
    execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function generateStoreAssets() {
  if (!have('rsvg-convert')) {
    console.log('store assets: rsvg-convert not found, skipping.');
    console.log('  install librsvg to regenerate (Debian/Ubuntu: apt install librsvg2-bin).');
    return [];
  }
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  const written = [];
  for (const asset of ASSETS) {
    const svgPath = join(TMP, `${asset.name}.svg`);
    const pngPath = join(OUT, `${asset.name}.png`);
    writeFileSync(svgPath, asset.build());
    execFileSync('rsvg-convert', ['-w', String(asset.w), '-h', String(asset.h), svgPath, '-o', pngPath]);
    written.push({ path: pngPath, ...asset });
  }
  rmSync(TMP, { recursive: true, force: true });
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const written = generateStoreAssets();
  for (const a of written) console.log(`wrote ${a.path} (${a.w}x${a.h})`);
}
