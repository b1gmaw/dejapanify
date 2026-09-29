/**
 * Generates src/core/jp-area-codes.ts from the official Japanese number plan.
 *
 * Adding hyphens to a landline number needs to know where its area code ends,
 * and Japanese area codes run from 2 to 5 digits: 03-1234-5678,
 * 045-123-4567, 0467-12-3456, 01267-2-3456. The split can't be guessed; it has
 * to be looked up.
 *
 * Source: 総務省「電気通信番号指定状況」, the Ministry of Internal Affairs and
 * Communications' published assignment of every fixed-line number prefix. Each
 * row maps the first six digits of a number (area code + local exchange) to its
 * area code. Used under the Government of Japan Standard Terms of Use (v1.0),
 * which permit modification with attribution.
 *
 * The output is committed, so ordinary builds stay offline and reproducible.
 * Run this only to refresh the data:
 *
 *   node scripts/make-area-codes.mjs            # download, convert, generate
 *   node scripts/make-area-codes.mjs --from DIR # use already-downloaded .xls
 *
 * Needs LibreOffice (`soffice`) to read the ministry's .xls files.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'core', 'jp-area-codes.ts');

export const SOURCE_PAGE =
  'https://www.soumu.go.jp/main_sosiki/joho_tsusin/top/tel_number/number_shitei.html';

/** One spreadsheet per leading digit of the area code, 1 through 9. */
const FILES = [
  '000697543', '000697544', '000697545', '000697546', '000697548',
  '000697549', '000697550', '000697551', '000697552',
];

/** Minimal CSV reader: quoted fields, doubled quotes, no embedded newlines needed. */
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

function download(dir) {
  for (const id of FILES) {
    const url = `https://www.soumu.go.jp/main_content/${id}.xls`;
    execFileSync('curl', ['-sSf', '-o', join(dir, `${id}.xls`), url]);
  }
}

function convert(dir) {
  const xls = FILES.map((id) => join(dir, `${id}.xls`)).filter((f) => !existsSync(f.replace(/\.xls$/, '.csv')));
  if (xls.length === 0) return;
  execFileSync(
    'soffice',
    ['--headless', '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1', '--outdir', dir, ...xls],
    { stdio: 'ignore', timeout: 600_000 },
  );
}

/** Reads every row into number -> area code length, and collects the data date. */
export function readAssignments(dir) {
  const lengths = new Map();
  const dates = new Set();
  let rows = 0;
  for (const id of FILES) {
    const table = parseCsv(readFileSync(join(dir, `${id}.csv`), 'utf8'));
    for (const cell of table[0] ?? []) if (cell.includes('令和')) dates.add(cell.replace(/[()（）]/g, ''));
    for (const row of table.slice(2)) {
      const [, number, area, local] = row.map((c) => (c ?? '').trim());
      if (!number) continue;
      if (!/^\d{6}$/.test(number) || number !== area + local) {
        throw new Error(`unexpected row in ${id}: ${row.join(',')}`);
      }
      const known = lengths.get(number);
      if (known !== undefined && known !== area.length) {
        throw new Error(`conflicting split for ${number}: ${known} and ${area.length}`);
      }
      lengths.set(number, area.length);
      rows++;
    }
  }
  return { lengths, dates: [...dates], rows };
}

/**
 * Collapses the six-digit assignments into the shortest prefixes that decide
 * the split. A prefix becomes a rule when every assigned number under it shares
 * one area-code length. Unassigned numbers are treated as "don't care": a new
 * local exchange opened within an area code keeps that area code's length.
 */
export function compressRules(lengths) {
  const rules = [];
  const under = (prefix) => {
    const found = new Set();
    for (const [number, len] of lengths) if (number.startsWith(prefix)) found.add(len);
    return found;
  };
  const walk = (prefix, inherited) => {
    const found = under(prefix);
    if (found.size === 0) return;
    if (found.size === 1) {
      const [len] = found;
      if (len !== inherited) rules.push([prefix, len]);
      return;
    }
    for (let d = 0; d <= 9; d++) walk(prefix + d, inherited);
  };
  for (let d = 1; d <= 9; d++) walk(`0${d}`, undefined);
  return rules.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function renderModule({ rules, dates, rows }) {
  const body = rules.map(([p, l]) => `${p}:${l}`).join(',');
  const wrapped = body.match(/.{1,96}(,|$)/g).map((l) => `  '${l}'`).join(' +\n');
  return `/**
 * Japanese fixed-line area-code lengths, keyed by the leading digits of a
 * number. GENERATED by scripts/make-area-codes.mjs — do not edit by hand.
 *
 * 「電気通信番号指定状況」（出典：総務省ホームページ
 * (${SOURCE_PAGE})）を加工して作成
 * Data as of ${dates.join(', ') || 'unknown'}; ${rows} assigned number prefixes,
 * compressed to ${rules.length} rules. Used under the Government of Japan Standard
 * Terms of Use (v1.0).
 */

/** "prefix:areaCodeLength" pairs; the longest matching prefix wins. */
const RULES =
${wrapped};

export const AREA_CODE_LENGTH: ReadonlyMap<string, number> = new Map(
  RULES.split(',').map((pair) => {
    const [prefix, len] = pair.split(':');
    return [prefix!, Number(len)] as const;
  }),
);
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fromIdx = process.argv.indexOf('--from');
  const dir = fromIdx > -1 ? process.argv[fromIdx + 1] : mkdtempSync(join(tmpdir(), 'dejapanify-area-'));
  const cleanup = fromIdx === -1;
  try {
    if (fromIdx === -1) download(dir);
    convert(dir);
    const { lengths, dates, rows } = readAssignments(dir);
    const rules = compressRules(lengths);
    writeFileSync(OUT, renderModule({ rules, dates, rows }));
    const byLen = {};
    for (const [, l] of rules) byLen[l] = (byLen[l] ?? 0) + 1;
    console.log(`rows ${rows}, dates ${dates.join(' ')}, rules ${rules.length}`, byLen);
    console.log(`wrote ${OUT}`);
  } finally {
    if (cleanup) rmSync(dir, { recursive: true, force: true });
  }
}

export { parseCsv };
