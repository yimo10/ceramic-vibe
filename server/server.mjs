// [v3] Production server: serves the built site (dist/) plus the share endpoint.   npm run build && npm run serve
// Behind a domain / reverse proxy set PUBLIC_BASE=https://your.domain so QR codes carry the public address.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShareHandler } from './share.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = +process.env.PORT || 8787;
const share = createShareHandler({ dir: process.env.SHARE_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'shared') });
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  share(req, res, () => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, p === '/' ? 'index.html' : p);
    if (!file.startsWith(root)) { res.statusCode = 403; res.end('Forbidden'); return; } // no path escape
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end('Not found'); return; }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, '0.0.0.0', () => console.log(`Gesture Pottery on http://localhost:${port}  (share links use ${process.env.PUBLIC_BASE || 'your LAN address'})`));
