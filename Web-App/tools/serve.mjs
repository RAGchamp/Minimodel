// Small static server for local testing. Use --lan to reach it from a phone on the same Wi-Fi.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { publicDir } from './node-assets.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};
const lan = process.argv.includes('--lan');
const port = Number(process.env.PORT ?? 8080);

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = normalize(join(publicDir, path === '/' ? 'index.html' : path));
  if (!file.startsWith(publicDir + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(response);
}).listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`http://localhost:${port}`);
  if (lan) {
    for (const nets of Object.values(networkInterfaces())) {
      for (const net of nets ?? []) if (net.family === 'IPv4' && !net.internal) console.log(`http://${net.address}:${port}`);
    }
  }
});
