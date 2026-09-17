/**
 * Enforces the privacy policy against the built extension.
 *
 * store/privacy.md and store/privacy.ja.md promise that the extension collects
 * nothing and transmits nothing, and both store listings repeat that promise.
 * A claim that lives only in prose drifts the moment someone adds an
 * "anonymous usage ping". These assertions run over the shipped artefacts, so
 * the promise fails the build before it can become a lie on a public listing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const TARGETS = ['chrome', 'firefox'] as const;

/** Every JavaScript file that ships inside the extension package. */
function bundledScripts(target: string): string[] {
  const dir = join(ROOT, 'dist', target);
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) out.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/**
 * Network primitives. These are globals, so a minifier cannot rename them --
 * if any appear in the output, the extension can talk to the network.
 */
const NETWORK_APIS: [string, RegExp][] = [
  ['fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['EventSource', /\bEventSource\b/],
  ['importScripts', /\bimportScripts\s*\(/],
  ['RTCPeerConnection', /\bRTCPeerConnection\b/],
];

describe.each(TARGETS)('the built %s package cannot phone home', (target) => {
  const scripts = bundledScripts(target);

  it('ships at least one script (guards against an empty check)', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  it.each(NETWORK_APIS)('contains no use of %s', (name, pattern) => {
    const offenders = scripts.filter((f) => pattern.test(readFileSync(f, 'utf8')));
    expect(offenders, `${name} found in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('embeds no remote URL to talk to', () => {
    // Links to the repo and the site are fine; anything else is suspicious.
    const allowed = /^https?:\/\/(github\.com\/b1gmaw|b1gmaw\.github\.io)/;
    for (const file of scripts) {
      const urls = readFileSync(file, 'utf8').match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      const foreign = urls.filter((u) => !allowed.test(u));
      expect(foreign, `unexpected URL in ${file}`).toEqual([]);
    }
  });
});

describe.each(TARGETS)('%s manifest asks for nothing it does not need', (target) => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'dist', target, 'manifest.json'), 'utf8'));

  it('requests storage and nothing else', () => {
    expect(manifest.permissions).toEqual(['storage']);
  });

  it('declares no host permissions', () => {
    // The content script's own matches are enough; a host permission would
    // additionally grant fetch access to those origins from the extension.
    expect(manifest.host_permissions).toBeUndefined();
  });

  it('declares no optional permissions', () => {
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
  });

  it('has no background script that could run unattended', () => {
    expect(manifest.background).toBeUndefined();
  });

  it('defines no content security policy loophole for remote code', () => {
    const csp = JSON.stringify(manifest.content_security_policy ?? {});
    expect(csp).not.toMatch(/https?:/);
  });
});

describe('the declarations stores rely on', () => {
  it('tells Firefox that no data is collected', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'dist/firefox/manifest.json'), 'utf8'));
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions).toEqual({
      required: ['none'],
    });
  });

  it('ships no runtime dependencies', () => {
    // Everything in dist/ comes from src/. Nothing from node_modules is
    // bundled, so a compromised dev dependency cannot reach users.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});

describe('the policy is published in both languages', () => {
  it.each([
    ['store/privacy.md', 'collects nothing'],
    ['store/privacy.ja.md', 'データを一切収集しません'],
    ['docs/privacy.html', 'collects nothing'],
    ['docs/privacy.ja.html', 'データを一切収集しません'],
  ])('%s states that nothing is collected', (file, phrase) => {
    expect(readFileSync(join(ROOT, file), 'utf8')).toContain(phrase);
  });
});
