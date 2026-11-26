// [v3] Share endpoint for the "scan the QR code to get your artwork photo" feature. No dependencies.
//   POST /api/share        body = the JPEG / PNG bytes  ->  { id, url, image }
//   GET  /s/<id>           small mobile page with the picture and a Save button (this is what the QR code opens)
//   GET  /s/<id>.jpg|.png  the picture itself (add ?dl=1 to force a download)
// Used in two places: as a Vite middleware (npm run dev / preview) and by server/server.mjs for a real deployment.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const ALPHA = 'abcdefghijklmnopqrstuvwxyz234567';
const ID_RE = /^\/s\/([a-z2-7]{10})(?:\.(jpg|png))?$/;
const MAX_FILES = 500, MAX_AGE_MS = 30 * 24 * 3600 * 1000; // old photos are removed automatically

const newId = () => Array.from(crypto.randomBytes(10), (b) => ALPHA[b % 32]).join('');
const kind = (buf) => {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  return null; // anything that is not a real JPEG / PNG is refused
};
const MIME = { jpg: 'image/jpeg', png: 'image/png' };

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return null;
}

// The address a PHONE must use. On localhost that is the computer's LAN address; online it is the public host name.
export function publicBase(req, fixed) {
  if (fixed) return fixed.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const m = host.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  const name = m ? m[1] : host, port = m && m[2] ? ':' + m[2] : '';
  if (/^(localhost|127\.|\[::1\])/.test(name)) {
    const ip = lanAddress();
    if (ip) return `${proto}://${ip}${port}`;
  }
  return `${proto}://${host}`;
}

const page = (id) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>手势陶艺 · Gesture Pottery</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:20px;box-sizing:border-box;background:#2a1d15;color:#f4e8d8;font:16px system-ui,sans-serif}
img{max-width:100%;max-height:70vh;border-radius:12px;box-shadow:0 10px 40px #0008}a.b{background:#fff;color:#2a1d15;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:600}
small{opacity:.7}</style></head><body>
<img src="/s/${id}.jpg" alt="artwork"><a class="b" href="/s/${id}.jpg?dl=1" download="pottery-${id}.jpg">保存图片 · Save image</a>
<small>长按图片也可保存 · Long-press the picture to save it</small></body></html>`;

export function createShareHandler({ dir = path.resolve('server/shared'), maxBytes = 4 * 1024 * 1024, base = process.env.PUBLIC_BASE || '' } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const hits = new Map(); // ip -> upload timestamps (simple rate limit)

  const tidy = () => {
    try {
      const files = fs.readdirSync(dir).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => a.t - b.t);
      const now = Date.now();
      files.forEach((x, i) => { if (now - x.t > MAX_AGE_MS || i < files.length - MAX_FILES) fs.rmSync(path.join(dir, x.f), { force: true }); });
    } catch {}
  };
  const find = (id) => ['jpg', 'png'].map((e) => ({ e, p: path.join(dir, id + '.' + e) })).find((x) => fs.existsSync(x.p));
  const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

  return function shareHandler(req, res, next) {
    const url = new URL(req.url, 'http://x');

    if (req.method === 'POST' && url.pathname === '/api/share') {
      const ip = req.socket.remoteAddress || '?', now = Date.now();
      const list = (hits.get(ip) || []).filter((t) => now - t < 600000);
      if (list.length >= 20) return json(res, 429, { error: 'rate' });
      list.push(now); hits.set(ip, list);
      const parts = []; let size = 0, dead = false;
      req.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) { dead = true; json(res, 413, { error: 'too-large' }); req.destroy(); return; }
        parts.push(c);
      });
      req.on('end', () => {
        if (dead) return;
        const buf = Buffer.concat(parts), ext = kind(buf);
        if (!ext) return json(res, 400, { error: 'not-an-image' });
        const id = newId();
        try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${id}.${ext}`), buf); } catch { return json(res, 500, { error: 'write' }); } // the folder is re-created if someone deleted it
        tidy();
        const b = publicBase(req, base);
        json(res, 200, { id, url: `${b}/s/${id}`, image: `${b}/s/${id}.${ext}` });
      });
      req.on('error', () => {});
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const m = ID_RE.exec(url.pathname);
      if (m) {
        const f = find(m[1]);
        if (!f) { res.statusCode = 404; res.end('Not found'); return; }
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (!m[2]) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page(m[1])); return; }
        res.setHeader('Content-Type', MIME[f.e]);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (url.searchParams.get('dl')) res.setHeader('Content-Disposition', `attachment; filename="pottery-${m[1]}.${f.e}"`);
        fs.createReadStream(f.p).pipe(res);
        return;
      }
    }
    next();
  };
}
