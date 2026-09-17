/**
 * Builds the extension before the suite runs.
 *
 * tests/bundle.test.ts asserts against the real built artefacts, so they must
 * reflect current source rather than whatever happened to be in dist/.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export default function setup(): void {
  execFileSync('node', [join(process.cwd(), 'scripts', 'build.mjs')], {
    stdio: 'pipe',
    cwd: process.cwd(),
  });
}
