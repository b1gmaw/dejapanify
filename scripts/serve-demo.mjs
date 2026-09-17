/**
 * Serves public/ over http, and collects self-test verdicts from the page.
 *
 * Two reasons this exists. Content scripts behave differently on file:// than
 * on http (Chrome refuses to inject into local files unless the user opts in),
 * so the demo needs a real origin to be a fair test. And with no WebDriver
 * installed, a POST back to this server is how a result gets out of a real
 * browser and into the terminal.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

export function serveDemo({ port = 0, onResult } = {}) {
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/selftest-result') {
      let body = '';
      for await (const chunk of req) body += chunk;
      // The page may post from a file:// origin, whose Origin header is "null".
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }).end();
      try {
        onResult?.(JSON.parse(body));
      } catch {
        onResult?.({ ok: false, error: 'unparseable result', body });
      }
      return;
    }

    const path = (req.url ?? '/').split('?')[0];
    const rel = normalize(path === '/' ? '/demo.html' : path).replace(/^(\.\.[/\\])+/, '');
    try {
      const data = await readFile(join(PUBLIC, rel));
      res.writeHead(200, {
        'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({ server, port: actual, url: `http://127.0.0.1:${actual}/demo.html` });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8123);
  const { url } = await serveDemo({ port, onResult: (r) => console.log('self-test:', r) });
  console.log(`demo: ${url}`);
  console.log('Load the extension, then open the URL above. Ctrl+C to stop.');
}
