// [v3] "Firing" animation + result card. No THREE here: everything is drawn on 2D canvases.
//   playKiln(canvas, sprite, opts)   short brick-kiln scene: the pot rolls in on a board, the iron door closes,
//                                    the kiln glows while smoke rises from the chimney, then the door opens.
//   composeCard({...})               the finished picture: pot on a warm background, name, and the QR code at the bottom right.
// The scene is a pure function of time (drawKiln), so it can be rendered for any frame, tested, or skipped.

const W = 960, H = 600; // logical scene size; the canvas backing store is scaled to this
export const TOTAL = 5.7; // seconds
const PH = { slide: [0.4, 1.3], enter: [1.3, 2.2], door: [2.2, 2.8], fire: [2.8, 5.0], open: [5.0, 5.7] };

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
const span = (t, [a, b]) => clamp((t - a) / (b - a));
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ---- progress info for the caption / bar / temperature readout -----------------------------------------------------
// [v5] maxTemp: the bisque firing peaks at about 900 C, the glaze firing at 1280 C (same scene, different readout)
export function kilnProgress(t, maxTemp = 1280) {
  const phase = t < PH.door[1] ? 'load' : t < PH.open[0] ? 'fire' : 'open';
  const temp = Math.round(lerp(25, maxTemp, ease(span(t, [PH.door[1], PH.open[0]]))));
  return { p: clamp(t / TOTAL), phase, temp };
}

// ---- sprite: where the pot really is inside its square picture ------------------------------------------------------
export function spriteInfo(img) {
  const n = 128, c = mk(n, n), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n).data;
  let x0 = n, x1 = 0, y0 = n, y1 = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[(y * n + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return { cx: 0.5, bottom: 0.9, w: 0.6, h: 0.6, top: 0.3 };
  return { cx: (x0 + x1 + 1) / 2 / n, bottom: (y1 + 1) / n, top: y0 / n, w: (x1 - x0 + 1) / n, h: (y1 - y0 + 1) / n };
}

// ---- cached art ------------------------------------------------------------------------------------------------------
let brick = null;
function brickPattern(ctx) {
  if (!brick) {
    const c = mk(72, 36), g = c.getContext('2d'), rnd = mulberry(7);
    const cols = ['#a4503a', '#94432e', '#b0603f', '#8a3d2b', '#9d4b35'];
    g.fillStyle = '#4a2a1e'; g.fillRect(0, 0, 72, 36);
    for (let row = 0; row < 2; row++) for (let b = -1; b < 3; b++) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.fillRect(b * 36 + (row ? 18 : 0) + 1.5, row * 18 + 1.5, 33, 15);
      g.fillStyle = 'rgba(255,220,170,.10)'; g.fillRect(b * 36 + (row ? 18 : 0) + 1.5, row * 18 + 1.5, 33, 3);
    }
    brick = c;
  }
  return ctx.createPattern(brick, 'repeat');
}

function arch(g, left, right, baseY, springY, topY) { // an arch: straight sides, elliptical top
  const cx = (left + right) / 2, rx = (right - left) / 2;
  g.beginPath();
  g.moveTo(left, baseY); g.lineTo(left, springY);
  g.ellipse(cx, springY, rx, springY - topY, 0, Math.PI, Math.PI * 2);
  g.lineTo(right, baseY); g.closePath();
}


// [v18] pixel-art flames: a coarse grid of square cells whose column heights flicker with time; colours step from white-hot
// at the base to deep red at the tips (no smoothing, so it reads as a retro sprite). Stateless: a function of t.
function pixFlame(g, x, baseY, cols, rows, t, seed, k = 1) {
  const C = 6;
  for (let i = 0; i < cols; i++) {
    const mid = 1 - Math.abs(i - (cols - 1) / 2) / (cols / 2); // tall in the middle, short at the edges
    const fl = 0.5 + 0.5 * Math.sin(t * 11 + i * 1.9 + seed) * Math.sin(t * 5.3 + i * 0.7 + seed * 2.1) + 0.25 * Math.sin(t * 27 + i * 3.3 + seed);
    const h = Math.max(1, Math.round(rows * (0.35 + 0.65 * mid) * (0.55 + 0.45 * Math.min(1, Math.max(0, fl))) * k));
    for (let j = 0; j < h; j++) {
      const r = j / h;
      g.fillStyle = r < 0.28 ? '#fff6c0' : r < 0.55 ? '#ffc23a' : r < 0.8 ? '#ff7a1a' : '#d8340f';
      g.fillRect(Math.round(x + i * C), Math.round(baseY - (j + 1) * C), C, C);
    }
  }
  for (let i = 0; i < 3; i++) { // a few flying pixel embers
    const age = (t * 0.8 + i / 3 + seed * 0.13) % 1;
    g.fillStyle = age < 0.5 ? '#ffd35a' : '#ff8a2a';
    g.fillRect(Math.round(x + (cols * C) * (0.2 + 0.3 * i) + Math.sin(age * 9 + i) * 8), Math.round(baseY - rows * C - age * 46), 4, 4);
  }
}

const KX = 500, GROUND = 520;
const MOUTH = { l: 390, r: 610, spring: 440, top: 352 };

let tmp = null;
function drawPot(g, img, info, cx, bottom, S, dark) { // pot with its bottom centre at (cx, bottom); dark 0..1 = deeper into the kiln
  const x = cx - info.cx * S, y = bottom - info.bottom * S;
  if (dark <= 0.01) { g.drawImage(img, x, y, S, S); return; }
  if (!tmp) tmp = mk(512, 512);
  const t = tmp.getContext('2d');
  t.clearRect(0, 0, 512, 512);
  t.drawImage(img, 0, 0, 512, 512);
  t.globalCompositeOperation = 'source-atop';
  t.fillStyle = `rgba(14,6,2,${dark})`; t.fillRect(0, 0, 512, 512);
  t.globalCompositeOperation = 'source-over';
  g.drawImage(tmp, x, y, S, S);
}

// ---- the scene ------------------------------------------------------------------------------------------------------
export function drawKiln(ctx, img, info, t, reduce = false) {
  const sc = ctx.canvas.width / W;
  ctx.setTransform(sc, 0, 0, sc, 0, 0);
  const slide = ease(span(t, PH.slide)), enter = ease(span(t, PH.enter)), door = ease(span(t, PH.door));
  const fireK = ease(span(t, [PH.door[1], PH.door[1] + 1.2]));
  const openK = ease(span(t, PH.open));
  const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3 + 1) + 0.05 * Math.sin(t * 41);
  const glow = (fireK * (1 - 0.25 * openK) + openK * 0.6) * flick;

  // sky and ground
  let g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#1d1420'); g.addColorStop(0.6, '#4a2c2a'); g.addColorStop(1, '#8a5a3a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
  g = ctx.createLinearGradient(0, GROUND, 0, H);
  g.addColorStop(0, '#4b3322'); g.addColorStop(1, '#241810');
  ctx.fillStyle = g; ctx.fillRect(0, GROUND, W, H - GROUND);
  const rnd = mulberry(3);
  for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,240,210,${0.25 + rnd() * 0.5})`; ctx.fillRect(rnd() * W, rnd() * 230, 1.6, 1.6); } // stars

  // chimney (behind the body)
  ctx.fillStyle = brickPattern(ctx); ctx.fillRect(610, 70, 60, 200);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(650, 70, 20, 200);
  ctx.fillStyle = '#6e3626'; ctx.fillRect(600, 52, 80, 20);

  // kiln body
  ctx.save();
  arch(ctx, 270, 730, GROUND, 330, 150);
  ctx.fillStyle = brickPattern(ctx); ctx.fill();
  ctx.clip();
  g = ctx.createLinearGradient(270, 0, 730, 0);
  g.addColorStop(0, 'rgba(255,220,170,.22)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.42)');
  ctx.fillStyle = g; ctx.fillRect(270, 140, 460, 390);
  for (const y of [260, 330, 400]) { ctx.fillStyle = 'rgba(40,20,12,.55)'; ctx.fillRect(270, y, 460, 7); } // iron bands
  ctx.restore();

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(KX, GROUND + 8, 270, 22, 0, 0, Math.PI * 2); ctx.fill();

  // mouth: dark inside, warm once the fire is on
  ctx.save();
  arch(ctx, MOUTH.l, MOUTH.r, GROUND, MOUTH.spring, MOUTH.top);
  g = ctx.createRadialGradient(KX, 470, 10, KX, 470, 150);
  g.addColorStop(0, `rgb(${40 + 215 * glow * 0.6},${18 + 70 * glow * 0.6},${8 + 10 * glow})`);
  g.addColorStop(1, '#0f0704');
  ctx.fillStyle = g; ctx.fill();
  ctx.clip();

  // the pot going in
  const potS = lerp(1, 0.42, enter);
  const S0 = 300;
  const slideX = lerp(170, KX, slide);
  const potBottom = lerp(500, 478, enter);
  if (enter > 0 && potS < 0.7) drawPot(ctx, img, info, KX, potBottom, S0 * potS, enter * 0.82);
  ctx.restore();

  if (enter < 1 && !(enter > 0 && potS < 0.7)) { // still in front of the kiln: board, wheels and pot
    const S = S0 * potS, bw = Math.max(180, info.w * S * 1.25) * 1;
    const bx = slideX, by = potBottom;
    ctx.fillStyle = '#6b4a2e'; ctx.fillRect(bx - bw / 2, by, bw, 14);
    ctx.fillStyle = '#3d2918'; ctx.fillRect(bx - bw / 2, by + 11, bw, 3);
    ctx.fillStyle = '#2a1a10';
    for (const dx of [-bw / 2 + 24, bw / 2 - 24]) { ctx.beginPath(); ctx.arc(bx + dx, by + 20, 9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(bx, by + 28, bw / 2, 6, 0, 0, Math.PI * 2); ctx.fill();
    drawPot(ctx, img, info, bx, by, S, enter * 0.5);
  }

  // iron door sliding down over the mouth
  const dy = -(1 - door) * 200 + openK * -210;
  if (door > 0) {
    ctx.save();
    ctx.translate(0, dy);
    arch(ctx, MOUTH.l - 8, MOUTH.r + 8, GROUND + 4, MOUTH.spring, MOUTH.top - 8);
    g = ctx.createLinearGradient(MOUTH.l, 0, MOUTH.r, 0);
    g.addColorStop(0, '#4d4a4a'); g.addColorStop(0.5, '#2e2c2d'); g.addColorStop(1, '#1b1a1b');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#141212'; ctx.stroke();
    ctx.fillStyle = '#8a8584';
    for (const [x, y] of [[420, 400], [580, 400], [420, 490], [580, 490]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); } // rivets
    ctx.fillStyle = '#171515'; ctx.fillRect(KX - 70, 450, 140, 10); // latch bar
    // spy hole, glowing when hot
    ctx.beginPath(); ctx.arc(KX, 405, 15, 0, Math.PI * 2);
    g = ctx.createRadialGradient(KX, 405, 1, KX, 405, 15);
    g.addColorStop(0, `rgb(255,${200 + 40 * glow},${120 + 100 * glow})`); g.addColorStop(1, `rgb(${60 + 190 * glow},${20 + 90 * glow},8)`);
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }

  // [v18] pixel flames in two fire-boxes at the foot of the kiln (and a small one at the chimney top) while it is firing
  if (fireK > 0.02) {
    const fk = fireK * (1 - openK);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const [bx, seed] of [[292, 1.3], [626, 4.1]]) {
      ctx.fillStyle = '#120806'; ctx.fillRect(bx - 6, GROUND - 74, 94, 74); // the stoke hole
      ctx.fillStyle = '#2a1510'; ctx.fillRect(bx - 6, GROUND - 74, 94, 6);
      ctx.save(); ctx.beginPath(); ctx.rect(bx - 6, GROUND - 74, 94, 74); ctx.clip();
      pixFlame(ctx, bx, GROUND - 2, 14, 11, t, seed, fk);
      ctx.restore();
    }
    pixFlame(ctx, 628, 62, 7, 4, t, 7.7, fk * 0.8); // tongue of flame out of the chimney
    ctx.restore();
  }

  // heat: light leaking around the door, glow on the ground and the lower bricks
  if (glow > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    g = ctx.createRadialGradient(KX, 470, 20, KX, 470, 400);
    g.addColorStop(0, `rgba(255,130,40,${0.34 * glow})`); g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 150, W, 450);
    g = ctx.createRadialGradient(KX, 405 + dy, 0, KX, 405 + dy, 70);
    g.addColorStop(0, `rgba(255,190,90,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g; ctx.fillRect(KX - 90, 320 + dy, 180, 160);
    ctx.restore();
  }

  // smoke + sparks from the chimney (stateless: every particle is a function of time)
  const smokeLevel = reduce ? 0 : clamp(0.25 + 0.75 * fireK) * (1 - 0.6 * openK);
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const age = (t * 0.45 + i / 26) % 1, drift = Math.sin(age * 5 + i * 1.7) * 16 + age * 55;
    const x = 640 + drift, y = 62 - age * 190, r = 9 + age * 38, a = (1 - age) * 0.3 * smokeLevel * Math.min(1, age * 6);
    g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(190,180,175,${a})`); g.addColorStop(1, 'rgba(190,180,175,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (fireK > 0.05 && !reduce) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const age = (t * 0.9 + i / 14) % 1, x = 640 + Math.sin(i * 12.9 + age * 4) * 26 + age * 30, y = 56 - age * 150;
      ctx.fillStyle = `rgba(255,${150 + 80 * age},60,${(1 - age) * 0.9 * fireK})`;
      ctx.fillRect(x, y, 2.4, 2.4);
    }
  }
  ctx.restore();

  // final flash when the door opens
  if (openK > 0) { ctx.fillStyle = `rgba(255,244,220,${Math.pow(openK, 2.2)})`; ctx.fillRect(0, 0, W, H); }
}

// ---- playing it -------------------------------------------------------------------------------------------------------
export function playKiln(canvas, img, { onFrame, onCue, reduce = false, maxTemp = 1280 } = {}) { // [v5] maxTemp; [v18] onCue('kilnDoorClose' | 'kilnFire' | 'kilnDoorOpen') once each, at the real animation times
  canvas.width = W * 1.5; canvas.height = H * 1.5;
  const ctx = canvas.getContext('2d'), info = spriteInfo(img), total = reduce ? 1.2 : TOTAL;
  let raf = 0, stopped = false, skipped = false;
  const cues = [[PH.door[0], 'kilnDoorClose'], [PH.door[1], 'kilnFire'], [PH.open[0], 'kilnDoorOpen']];
  const t0 = performance.now();
  let finish = () => {};
  const done = new Promise((resolve) => {
    finish = resolve; // [v5] stop() resolves too, so a caller never waits forever on a closed dialog
    const step = (now) => {
      if (stopped) { resolve('stopped'); return; }
      const t = skipped ? TOTAL : reduce ? TOTAL * ((now - t0) / 1000 / total) : (now - t0) / 1000;
      if (onCue && !skipped) while (cues.length && t >= cues[0][0]) { const c = cues.shift(); if (t - c[0] < 0.6) onCue(c[1]); } // sounds only while the scene really passes them
      drawKiln(ctx, img, info, Math.min(t, TOTAL), reduce);
      if (onFrame) onFrame(kilnProgress(Math.min(t, TOTAL), maxTemp));
      if (t >= TOTAL) { resolve('done'); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  return { done, skip() { skipped = true; }, stop() { stopped = true; cancelAnimationFrame(raf); finish('stopped'); } };
}

// ---- the finished picture ---------------------------------------------------------------------------------------------
export const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// potUrl: transparent PNG of the pot. qr: matrix from qr.js or null. cap: { name, brand, scan } strings.
// With qr = null the picture has no code (this is the clean photo that is uploaded and shown on the phone).
export async function composeCard({ potUrl, qr, drawQR, cap, size = 1080 }) {
  const img = await loadImage(potUrl), info = spriteInfo(img);
  const c = mk(size, size), g = c.getContext('2d');
  let bg = g.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#f4ebdd'); bg.addColorStop(1, '#d6bf9f');
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  bg = g.createRadialGradient(size / 2, size * 0.42, size * 0.1, size / 2, size * 0.5, size * 0.78);
  bg.addColorStop(0, 'rgba(255,248,235,.75)'); bg.addColorStop(1, 'rgba(120,80,40,.18)');
  g.fillStyle = bg; g.fillRect(0, 0, size, size);

  // fit the pot (its real silhouette) into the upper area
  const maxW = size * 0.72, maxH = size * 0.58;
  const S = Math.min(maxW / info.w, maxH / info.h);
  const cx = size / 2, bottom = size * 0.7; // pot sits well above the QR panel
  g.fillStyle = 'rgba(70,40,20,.28)';
  g.beginPath(); g.ellipse(cx, bottom + size * 0.006, info.w * S * 0.52, size * 0.02, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(img, cx - info.cx * S, bottom - info.bottom * S, S, S);

  // caption (bottom left)
  g.fillStyle = '#3b2a1d'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `700 ${Math.round(size * 0.05)}px "Noto Serif SC","Songti SC","STSong","SimSun",Georgia,serif`;
  g.fillText(cap.name, size * 0.06, size * 0.905, size * 0.55);
  g.font = `${Math.round(size * 0.022)}px system-ui,"PingFang SC","Microsoft YaHei",sans-serif`;
  g.fillStyle = 'rgba(59,42,29,.7)';
  g.fillText(cap.brand, size * 0.06, size * 0.945, size * 0.55);

  // QR code (bottom right) on a white rounded panel
  if (qr && drawQR) {
    const quiet = 4, target = size * 0.2, // 4-module quiet zone = what the QR standard asks for; scanners are most reliable with it
       px = Math.max(3, Math.floor(target / (qr.size + quiet * 2)));
    const qs = (qr.size + quiet * 2) * px, pad = size * 0.012, capH = size * 0.03;
    const pw = qs + pad * 2, ph = qs + pad * 2 + capH;
    const x = size - size * 0.045 - pw, y = size - size * 0.04 - ph;
    g.save();
    g.shadowColor = 'rgba(60,35,15,.3)'; g.shadowBlur = size * 0.015; g.shadowOffsetY = size * 0.004;
    g.fillStyle = '#ffffff'; roundRect(g, x, y, pw, ph, size * 0.014); g.fill();
    g.restore();
    drawQR(g, qr, x + pad, y + pad, px, { quiet });
    g.fillStyle = '#3b2a1d'; g.textAlign = 'center';
    g.font = `600 ${Math.round(size * 0.019)}px system-ui,"PingFang SC","Microsoft YaHei",sans-serif`;
    g.fillText(cap.scan, x + pw / 2, y + ph - size * 0.01, pw - 6);
  }
  return c;
}

// uploads the clean photo (JPEG) and resolves { url } or null when no share server answers
export async function uploadPhoto(canvas, endpoint, timeoutMs = 8000) {
  try {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(endpoint, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' }, signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.url === 'string' && /^https?:\/\//.test(j.url) ? j : null;
  } catch { return null; }
}
