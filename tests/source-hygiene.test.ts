/**
 * Keeps the source archive clean for add-on review.
 *
 * Mozilla lints the source package submitted alongside the extension, not just
 * the extension itself. Two warnings reached a real upload that `web-ext lint`
 * on dist/ could never have caught, because the files involved -- a dev script
 * and the demo page -- are not part of the packaged extension at all:
 *
 *   "Unsafe call to import for argument 0"   scripts/inspect.mjs
 *   "Inline scripts blocked by default"      public/demo.html
 *
 * These checks run over the repository so the same class of warning fails here
 * rather than at upload time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = join(__dirname, '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'web-ext-artifacts', 'coverage']);

/**
 * This file is excluded from its own scan: it necessarily quotes the very
 * patterns it looks for, in its rule descriptions and its fixtures.
 */
const SELF = 'source-hygiene.test.ts';

function filesWithin(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (SKIP.has(name)) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (exts.includes(extname(full)) && name !== SELF) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const isCommentLine = (line: string): boolean =>
  /^\s*(\/\/|\/\*|\*)/.test(line);

/**
 * A dynamic `import()` is only acceptable to the linter when its argument is a
 * plain string literal, since otherwise what gets loaded cannot be verified.
 */
function dynamicImportOffences(file: string): string[] {
  const found: string[] = [];
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
    for (const m of line.matchAll(/(?<![.\w])import\s*\(\s*([^)]*?)\s*\)/g)) {
      const arg = m[1] ?? '';
      const plainLiteral =
        /^'[^']*'$/.test(arg) || /^"[^"]*"$/.test(arg) || (/^`[^`]*`$/.test(arg) && !arg.includes('${'));
      if (!plainLiteral) found.push(`${relative(ROOT, file)}:${i + 1}  import(${arg})`);
    }
  });
  return found;
}

/** An inline <script> block, as opposed to <script src="...">. */
function inlineScriptOffences(file: string): string[] {
  const html = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    if ((m[1] ?? '').trim()) found.push(`${relative(ROOT, file)}  inline <script> block`);
  }
  return found;
}

describe('source archive hygiene', () => {
  it('uses no dynamic import() with a non-literal argument', () => {
    const offences = filesWithin(ROOT, ['.mjs', '.js', '.ts', '.mts'])
      .flatMap(dynamicImportOffences);
    expect(offences, `addons-linter reports these as "Unsafe call to import"`).toEqual([]);
  });

  it('has no inline <script> blocks in any HTML', () => {
    const offences = filesWithin(ROOT, ['.html']).flatMap(inlineScriptOffences);
    expect(offences, 'addons-linter reports these as "Inline scripts blocked by default"').toEqual([]);
  });

  it('actually inspected some files (guards against a vacuous check)', () => {
    expect(filesWithin(ROOT, ['.mjs', '.js', '.ts', '.mts']).length).toBeGreaterThan(10);
    expect(filesWithin(ROOT, ['.html']).length).toBeGreaterThan(3);
  });
});

/**
 * Assigning built-up markup to innerHTML is flagged as UNSAFE_VAR_ASSIGNMENT
 * even when every piece is a static literal, because the linter cannot tell.
 * Build DOM nodes instead.
 */
function innerHtmlOffences(file: string): string[] {
  const found: string[] = [];
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/\.innerHTML\s*=/.test(line)) found.push(`${relative(ROOT, file)}:${i + 1}`);
  });
  return found;
}

describe('no unsafe dynamic markup', () => {
  it('assigns to innerHTML nowhere that a linter will see', () => {
    // Scoped to what addons-linter actually reads: the .js/.mjs files that
    // travel in the source archive, plus src/, which becomes shipped JS. Test
    // files are .ts, are never shipped and are never scanned, and they
    // legitimately use innerHTML to build jsdom fixtures.
    const scanned = [
      ...filesWithin(ROOT, ['.mjs', '.js']),
      ...filesWithin(join(ROOT, 'src'), ['.ts']),
    ];
    const offences = scanned.flatMap(innerHtmlOffences);
    expect(offences, 'addons-linter reports these as UNSAFE_VAR_ASSIGNMENT').toEqual([]);
  });
});

describe('the checks can fail', () => {
  it('flags a template-literal import', () => {
    // Written and removed inline so the fixture never lingers in the archive.
    const tmp = join(ROOT, 'tests', '.hygiene-fixture.mjs');
    writeFileSync(tmp, ['const p = "x";', 'await ' + 'import(`file://${p}`);', ''].join('\n'));
    try {
      expect(dynamicImportOffences(tmp).length).toBe(1);
    } finally {
      rmSync(tmp, { force: true });
    }
  });

  it('accepts a literal import', () => {
    const tmp = join(ROOT, 'tests', '.hygiene-fixture2.mjs');
    writeFileSync(tmp, "await " + "import('./make-icons.mjs');\n");
    try {
      expect(dynamicImportOffences(tmp)).toEqual([]);
    } finally {
      rmSync(tmp, { force: true });
    }
  });
});
