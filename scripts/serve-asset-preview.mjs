import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = join(root, 'public', 'pygem');
const userNobleRoot = join(root, 'public', 'custom-nobles');
const manifestPath = join(root, 'assets', 'pygem-manifest.json');
const previewPage = join(root, 'tools', 'asset-preview.html');
const option = process.argv.slice(2).find(arg => arg.startsWith('--port='));
const port = option ? Number(option.slice(7)) : 0;
if (!Number.isInteger(port) || port < 0 || port > 65535 || process.argv.slice(2).some(arg => !arg.startsWith('--port='))) {
  console.error('Usage: node scripts/serve-asset-preview.mjs [--port=4174]');
  process.exit(2);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
  catch { response.writeHead(400).end(); return; }
  let file;
  if (pathname === '/' || pathname === '/tools/asset-preview.html') {
    file = previewPage;
  } else if (pathname === '/pygem/manifest.json') {
    file = manifestPath;
  } else if (pathname.startsWith('/pygem/')) {
    const relative = pathname.slice('/pygem/'.length).replaceAll('\\', '/');
    file = resolve(assetRoot, relative);
    if (!file.startsWith(assetRoot + sep)) {
      response.writeHead(403).end();
      return;
    }
  } else if (pathname.startsWith('/custom-nobles/')) {
    const relative = pathname.slice('/custom-nobles/'.length).replaceAll('\\', '/');
    file = resolve(userNobleRoot, relative);
    if (!file.startsWith(userNobleRoot + sep)) {
      response.writeHead(403).end();
      return;
    }
  } else {
    response.writeHead(404).end();
    return;
  }
  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Asset preview: http://127.0.0.1:${server.address().port}/`);
});
