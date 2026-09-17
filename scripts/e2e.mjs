/**
 * End-to-end check in a real browser.
 *
 * Loads the actual built extension into a real Firefox (or Chromium) via
 * web-ext, opens the demo page, and waits for the page's self-test to report
 * back. No WebDriver is involved: the page POSTs its verdict to the local
 * server, which is enough to prove a real browser really converted real fields.
 *
 * Usage:
 *   node scripts/e2e.mjs                 # Firefox, headless, http + file://
 *   node scripts/e2e.mjs --headed        # watch it happen
 *   node scripts/e2e.mjs --target=chromium
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveDemo } from './serve-demo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const headed = args.includes('--headed');
const target = (args.find((a) => a.startsWith('--target=')) ?? '--target=firefox-desktop').split('=')[1];
const onlyHttp = args.includes('--http-only');

const SOURCE = join(ROOT, target === 'chromium' ? 'dist/chrome' : 'dist/firefox');
const TIMEOUT_MS = 45_000;

function runBrowser(startUrl) {
  const argv = [
    'run',
    `--source-dir=${SOURCE}`,
    `--target=${target}`,
    `--start-url=${startUrl}`,
    '--no-reload',
  ];
  if (!headed) argv.push('--args=--headless');

  const child = spawn(join(ROOT, 'node_modules/.bin/web-ext'), argv, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  return { child, getLog: () => log };
}

async function runCase(label, startUrl, waitForResult) {
  process.stdout.write(`\n▶ ${label}\n  ${startUrl}\n`);
  const { child, getLog } = runBrowser(startUrl);

  const verdict = await Promise.race([
    waitForResult(),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), TIMEOUT_MS)),
  ]);

  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 400));
  try { child.kill('SIGKILL'); } catch { /* already gone */ }

  if (verdict.timedOut) {
    console.log('  ✕ TIMEOUT — no self-test result came back');
    const log = getLog();
    if (log.trim()) console.log(log.split('\n').slice(-12).map((l) => `    ${l}`).join('\n'));
    return false;
  }

  console.log(`  content script active: ${verdict.active ? 'yes' : 'NO'}`);
  for (const r of verdict.results ?? []) {
    console.log(`  ${r.pass ? '✓' : '✕'} ${r.id.padEnd(10)} ${JSON.stringify(r.got)}${r.pass ? '' : `  expected ${JSON.stringify(r.expect)}`}`);
  }
  console.log(`  ${verdict.ok ? '✓ PASS' : '✕ FAIL'}`);
  return Boolean(verdict.ok);
}

const pending = { resolve: null };
const { server, port } = await serveDemo({
  port: 0,
  onResult: (r) => pending.resolve?.(r),
});
const waitForResult = () => new Promise((resolve) => { pending.resolve = resolve; });
const endpoint = `http://127.0.0.1:${port}/selftest-result`;

console.log(`browser: ${target}${headed ? ' (headed)' : ' (headless)'}`);
console.log(`extension: ${SOURCE}`);

const cases = [
  ['served over http', `http://127.0.0.1:${port}/demo.html?selftest`],
];
if (!onlyHttp) {
  const fileUrl = pathToFileURL(join(ROOT, 'public/demo.html')).href;
  cases.push(['opened as a local file', `${fileUrl}?selftest&report=${encodeURIComponent(endpoint)}`]);
}

const outcomes = [];
for (const [label, url] of cases) {
  outcomes.push([label, await runCase(label, url, waitForResult)]);
}

server.close();

console.log('\n─── summary ───');
for (const [label, ok] of outcomes) console.log(`  ${ok ? '✓' : '✕'} ${label}`);

// http is the contract. file:// is informational: Chrome deliberately refuses
// to inject there without an explicit opt-in, so it must not fail the run.
const httpOk = outcomes[0]?.[1];
process.exit(httpOk ? 0 : 1);
