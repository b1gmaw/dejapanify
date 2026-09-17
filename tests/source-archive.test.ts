/**
 * The source archive must be something a reviewer can actually build from.
 *
 * Mozilla's reviewers rebuild it and diff the output against the uploaded
 * package, so a missing file here is a rejected submission. It also contains no
 * manifest.json -- that is generated -- which reads as a broken upload unless
 * the archive says so itself.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OUT = join(tmpdir(), `dejapanify-source-test-${process.pid}.zip`);

let names: string[] = [];
let readFromZip: (name: string) => string;

beforeAll(async () => {
  const { makeSourceArchive } = await import('../scripts/make-source-archive.mjs');
  makeSourceArchive(OUT);
  expect(existsSync(OUT)).toBe(true);

  // Node has no zip reader, and the project deliberately has no dependencies,
  // so shell out to python's stdlib the way the rest of the tooling would.
  const listing = execFileSync('python3', [
    '-c',
    `import zipfile,sys;print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))`,
    OUT,
  ]).toString();
  names = listing.split('\n').filter(Boolean);
  readFromZip = (name: string) =>
    execFileSync('python3', [
      '-c',
      `import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))`,
      OUT,
      name,
    ]).toString();
});

describe('source archive', () => {
  it('contains everything needed to reproduce the build', () => {
    for (const required of [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      '.nvmrc',
      'scripts/build.mjs',
      'scripts/zip.mjs',
      'src/content/index.ts',
      'src/core/detect.ts',
      'docs/REVIEWER_NOTES.md',
    ]) {
      expect(names, `missing ${required}`).toContain(required);
    }
  });

  it('excludes build output and dependencies', () => {
    expect(names.filter((n) => n.startsWith('dist/'))).toEqual([]);
    expect(names.filter((n) => n.startsWith('node_modules/'))).toEqual([]);
  });

  it('explains at its root why there is no manifest.json', () => {
    expect(names).toContain('REVIEWERS-README.txt');
    const note = readFromZip('REVIEWERS-README.txt');
    expect(note).toContain('no manifest.json');
    expect(note).toContain('npm ci');
    expect(note).toContain('npm run build');
    expect(note).toContain('dist/firefox/');
  });

  it('really has no manifest.json, matching what the note says', () => {
    expect(names.filter((n) => n.endsWith('manifest.json'))).toEqual([]);
  });

  it('is byte-for-byte reproducible', async () => {
    // Reviewers may build it twice, and so may release automation; a source
    // archive that differs run to run undermines the reproducibility claim
    // the whole review rests on.
    const { makeSourceArchive } = await import('../scripts/make-source-archive.mjs');
    const second = join(tmpdir(), `dejapanify-source-test-${process.pid}-b.zip`);
    makeSourceArchive(second);
    expect(readFileSync(second).equals(readFileSync(OUT))).toBe(true);
  });
});
