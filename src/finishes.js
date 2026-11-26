// Surface finishes (the "Texture" section): procedural overlay + bump canvases and material parameters.
// Pure canvas code, no THREE. The same generators run in the studio (1024 px wide) and the gallery (256 px).
export const FINISHES = [
  { id: 'glaze', zh: '光亮釉面', en: 'Smooth glaze', icon: '✨' },
  { id: 'clear', zh: '透明釉', en: 'Transparent glaze', icon: '🫧' }, // [v13] ~70 % transparent: painted patterns stay visible
  { id: 'raw', zh: '素坯', en: 'Raw clay body', icon: '🧱', ancientOnly: true }, // [v9] not offered in Free Creation any more
  { id: 'crackle', zh: '冰裂纹釉', en: 'Crackle glaze', icon: '❄️' },
  { id: 'crystal', zh: '结晶釉花', en: 'Crystalline bloom', icon: '💎' },
  { id: 'salt', zh: '盐釉颗粒面', en: 'Salt glaze', icon: '🧂' },
  { id: 'drip', zh: '流动釉', en: 'Running glaze', icon: '💧' },
  { id: 'iron', zh: '铁结晶釉', en: 'Iron-crystal glaze', icon: '🌑' }, // v7: also in free mode, so every glaze can be previewed directly
  // v7: body looks of the Ancient Craft steps (throwing / air-dried / trimmed / bisque). Never listed as glazes (stageOnly).
  { id: 'clay', zh: '湿润陶泥', en: 'Wet clay', icon: '🟤', stageOnly: true },
  { id: 'dry', zh: '阴干坯', en: 'Air-dried', icon: '⬜', stageOnly: true },
  { id: 'trim', zh: '修坯', en: 'Trimmed', icon: '⬜', stageOnly: true },
  { id: 'bisque', zh: '素烧坯', en: 'Bisque', icon: '⬜', stageOnly: true }
];
// [v5] glaze choices of the Ancient Craft glazing step, in order (raw = rough earthenware, i.e. no glaze)
export const ANCIENT_GLAZES = [ // [v10] order as requested: crackle, crystalline, salt, running, iron-crystal, then glossy; [v13] transparent glaze first
  { id: 'clear', zh: '透明釉', en: 'Transparent glaze', icon: '🫧' },
  { id: 'crackle', zh: '冰裂釉', en: 'Crackle glaze', icon: '❄️' },
  { id: 'crystal', zh: '结晶釉', en: 'Crystalline glaze', icon: '💎' },
  { id: 'salt', zh: '盐釉', en: 'Salt glaze', icon: '🧂' },
  { id: 'drip', zh: '流动釉', en: 'Running glaze', icon: '💧' },
  { id: 'iron', zh: '铁结晶釉', en: 'Iron-crystal glaze', icon: '🌑' }
]; // [v22] the glossy glaze was removed (it looked the same as the transparent one)

export const FINISH_PARAMS = {
  glaze: { roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.12, bumpScale: 0, iridescence: 0 },
  clay: { roughness: 0.78, clearcoat: 0.12, clearcoatRoughness: 0.55, bumpScale: 1.2, iridescence: 0 }, // v7 body looks of the Ancient Craft steps
  dry: { roughness: 0.94, clearcoat: 0, clearcoatRoughness: 0.6, bumpScale: 1, iridescence: 0 },
  trim: { roughness: 0.94, clearcoat: 0, clearcoatRoughness: 0.6, bumpScale: 1, iridescence: 0 },
  bisque: { roughness: 0.92, clearcoat: 0, clearcoatRoughness: 0.6, bumpScale: 0.8, iridescence: 0 },
  raw: { roughness: 0.92, clearcoat: 0, clearcoatRoughness: 0.5, bumpScale: 1.2, iridescence: 0 },
  clear: { roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, bumpScale: 0, iridescence: 0 },
  gloss: { roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.01, bumpScale: 0, iridescence: 0 },
  crackle: { roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.03, bumpScale: 1.6, iridescence: 0 },
  crystal: { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, bumpScale: 0, iridescence: 0.08 },
  salt: { roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1, bumpScale: 0.7, iridescence: 0 },
  volcanic: { roughness: 0.66, clearcoat: 0.12, clearcoatRoughness: 0.5, bumpScale: 3, iridescence: 0 },
  drip: { roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, bumpScale: 1.2, iridescence: 0 },
  iron: { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, bumpScale: 1.1, iridescence: 0.3 } // [v5]
};

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
export function shadeRgb(hex, f) { // f > 0 lightens towards white, f < 0 darkens towards black
  return hexToRgb(hex).map((v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)));
}
export function shade(hex, f) {
  const c = shadeRgb(hex, f);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// [v9] colour shifted by f, returned with an alpha (rgba(shade(..)) is wrong: rgba() wants a hex string)
export const rgbaShade = (hex, f, a) => { const c = shadeRgb(hex, f); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

// [v9] Jittered-grid Voronoi on a canvas that wraps sideways (so the pattern closes at the seam). The coordinates are warped a little
// so cell borders become irregular, curved cracks. Returns, per pixel of the band, the id of the nearest seed and e = distance(2nd) - distance(1st):
// e is ~0 on a border, so "e < line width" draws the crack lines.
function voronoi(W, band, cell, R, warp) {
  const cols = Math.max(3, Math.round(W / cell)), rows = Math.max(2, Math.round(band / cell)), cw = W / cols, ch = band / rows;
  const sx = new Float32Array(cols * rows), sy = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { sx[j * cols + i] = (i + 0.1 + R() * 0.8) * cw; sy[j * cols + i] = (j + 0.1 + R() * 0.8) * ch; }
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28];
  const id = new Int32Array(W * band), e = new Float32Array(W * band);
  for (let y = 0; y < band; y++) {
    for (let x = 0; x < W; x++) {
      const wx = x + Math.sin(y * 0.021 + ph[0]) * warp + Math.sin(y * 0.057 + x * 0.013 + ph[1]) * warp * 0.5;
      const wy = y + Math.sin(x * 0.019 + ph[2]) * warp + Math.sin(x * 0.047 + y * 0.011 + ph[3]) * warp * 0.5;
      const gi = Math.floor(wx / cw), gj = Math.floor(wy / ch);
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const j = gj + dj; if (j < 0 || j >= rows) continue;
        for (let di = -1; di <= 1; di++) {
          let i = gi + di, off = 0;
          if (i < 0) { i += cols; off = -W; } else if (i >= cols) { i -= cols; off = W; }
          const k = j * cols + i, dx = sx[k] + off - wx, dy = sy[k] - wy, d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
        }
      }
      id[y * W + x] = best; e[y * W + x] = d2 - d1;
    }
  }
  return { id, e, count: cols * rows };
}

// d = { W, Hc, PXR, n }: canvas size, pixels per clay row, current number of rows.
export function buildFinish(id, color, d) {
  const params = FINISH_PARAMS[id] || FINISH_PARAMS.glaze;
  if (id === 'glaze' || !FINISH_PARAMS[id]) return { overlay: null, bump: null, params };

  const { W, Hc, PXR, n } = d;
  const s = W / 1024;
  const R = rng(9100 + id.length * 77 + id.charCodeAt(0));
  const overlay = mk(W, Hc), o = overlay.getContext('2d');
  const bump = mk(W, Hc), b = bump.getContext('2d');
  b.fillStyle = '#808080';
  b.fillRect(0, 0, W, Hc);
  const y0 = Hc - n * PXR; // top of the part of the canvas that the pot really uses
  const band = Hc - y0;
  const frac = n / 66;
  const cnt = (k) => Math.max(1, Math.round(k * s * s * frac));
  const px = (v) => Math.max(1, v * s);
  const rimY = Hc - (n - 0.5) * PXR;
  const wrapX = (x, m, f) => { f(x); if (x < m) f(x + W); if (x > W - m) f(x - W); };

  if (id === 'clay' || id === 'dry' || id === 'trim' || id === 'bisque') {
    // v7: body looks of the Ancient Craft steps, after the reference photos. Matte, no creases or fingerprints: soft tone patches,
    // faint horizontal throwing rings, fine grain. They cover the WHOLE canvas, so they still fit after the pot is pulled taller.
    // (the pale looks are a translucent wash over the bare-clay paint, so underglaze colours painted on the bisque still show through)
    const K = (k) => Math.max(1, Math.round(k * s * s));
    const SP = {
      clay:   { c: '176,126,90',  a: 0.62, l: '208,160,122', d: '120,78,52',   bl: 0.22, ring: 0.2,  scr: 0,  pit: 50 },
      dry:    { c: '196,188,178', a: 0.9, l: '216,208,198', d: '150,140,130', bl: 0.2,  ring: 0.1,  scr: 0,  pit: 40 },
      trim:   { c: '236,218,190', a: 0.9, l: '248,236,214', d: '190,168,136', bl: 0.18, ring: 0.07, scr: 80, pit: 40 },
      bisque: { c: '255,255,252', a: 0.28, l: '255,255,255', d: '200,192,182', bl: 0.14, ring: 0.04, scr: 20, pit: 30 }
    }[id];
    o.fillStyle = `rgba(${SP.c},${SP.a})`;
    o.fillRect(0, 0, W, Hc);
    const blot = (ctx, x, y, r, rgb, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    for (let i = 0; i < K(110); i++) { // soft tone patches
      const x = R() * W, y = R() * Hc, r = px(30 + R() * 90), light = R() < 0.5;
      wrapX(x, r, (xx) => { blot(o, xx, y, r, light ? SP.l : SP.d, SP.bl * (light ? 1.1 : 0.9)); blot(b, xx, y, r, light ? '170,170,170' : '92,92,92', 0.35); });
    }
    for (let y = R() * px(4); y < Hc; y += px(2.5 + R() * 5)) { // throwing rings: faint horizontal lines with a slight wobble (whole turns, so they close at the seam)
      const k = 1 + Math.floor(R() * 3), ph = R() * 6.28, amp = px(0.4 + R() * 1.4), lw = px(0.7 + R() * 1.3), dark = R() < 0.6;
      const line = (ctx, col, dy) => { ctx.beginPath(); for (let x = 0; x <= W; x += 16 * s) { const yy = y + dy + Math.sin((x / W) * 6.2832 * k + ph) * amp; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); };
      line(o, dark ? `rgba(${SP.d},${SP.ring})` : `rgba(${SP.l},${SP.ring * 1.2})`, 0);
      line(b, dark ? '#707070' : '#999999', 0);
    }
    for (let i = 0; i < K(SP.scr); i++) { // fine trimming scratches
      const x = R() * W, y = R() * Hc, ang = (R() - 0.5) * 1.2, len = px(14 + R() * 50);
      const sg = (ctx, col, lw, dy) => { ctx.beginPath(); ctx.moveTo(x, y + dy); ctx.lineTo(x + Math.cos(ang) * len, y + dy + Math.sin(ang) * len * 0.3); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke(); };
      sg(o, `rgba(${SP.d},.3)`, px(0.7), 0); sg(o, 'rgba(255,255,255,.35)', px(0.6), px(0.9)); sg(b, '#8a8a8a', px(0.8), 0);
    }
    for (let i = 0; i < K(22000); i++) { // fine grain
      const x = R() * W, y = R() * Hc, z = px(0.7 + R() * 1.2), dark = R() < 0.5;
      o.fillStyle = dark ? `rgba(${SP.d},.16)` : `rgba(${SP.l},.2)`;
      o.fillRect(x, y, z, z);
      if (R() < 0.3) { b.fillStyle = dark ? '#767676' : '#8c8c8c'; b.fillRect(x, y, z, z); }
    }
    for (let i = 0; i < K(SP.pit); i++) { // a few tiny pits and specks
      const x = R() * W, y = R() * Hc, z = px(1 + R() * 1.6);
      o.fillStyle = `rgba(${SP.d},.55)`; o.fillRect(x, y, z, z);
      b.fillStyle = '#5a5a5a'; b.fillRect(x, y, z, z);
    }
  } else if (id === 'raw') {
    for (let i = 0; i < cnt(30000); i++) {
      const x = R() * W, y = y0 + R() * band, z = px(0.7 + R() * 1.6), dark = R() < 0.5;
      o.fillStyle = dark ? 'rgba(95,58,36,.5)' : 'rgba(255,236,208,.32)';
      o.fillRect(x, y, z, z);
      b.fillStyle = dark ? '#5a5a5a' : '#a8a8a8';
      b.fillRect(x, y, z, z);
    }
    for (let i = 0; i < cnt(900); i++) { // grog flecks
      const x = R() * W, y = y0 + R() * band, z = px(1.5 + R() * 2.5);
      o.fillStyle = 'rgba(60,38,26,.55)';
      o.fillRect(x, y, z, z);
    }
  } else if (id === 'clear') {
    // [v13] transparent glaze: a thin, glassy veil of exactly 30 % opacity (= 70 % transparent) whatever colour is chosen, so painted patterns show through.
    // Only the glaze colour tints the veil; its strength never changes. A soft highlight at the shoulder and a pale rim give it a wet, glassy look.
    const cc = shadeRgb(color, 0.35);
    o.fillStyle = `rgba(${Math.round(cc[0])},${Math.round(cc[1])},${Math.round(cc[2])},0.30)`; o.fillRect(0, y0, W, band);
    o.fillStyle = 'rgba(255,255,255,.12)'; o.fillRect(0, y0, W, px(3));
  } else if (id === 'gloss') {
    // [v10] glossy glaze (reference: pale blue porcelain vase): a perfectly smooth, deep colour that is lighter and thinner on the shoulder and rim and
    // pools darker and more saturated towards the foot. No speckles: all the character comes from the mirror-like clear-coat of the material.
    const g = o.createLinearGradient(0, y0, 0, Hc);
    g.addColorStop(0, rgbaShade(color, 0.2, 0.97)); g.addColorStop(0.3, rgbaShade(color, 0.06, 0.98)); g.addColorStop(0.7, rgbaShade(color, -0.1, 0.99)); g.addColorStop(0.93, rgbaShade(color, -0.26, 1)); g.addColorStop(1, rgbaShade(color, -0.1, 1));
    o.fillStyle = g; o.fillRect(0, y0, W, band);
    o.fillStyle = 'rgba(255,255,255,.28)'; o.fillRect(0, y0, W, px(4)); // thin, pale rim
  } else if (id === 'crackle') {
    // [v9] crackle glaze after the references: irregular, curved plates (a warped Voronoi), each a slightly different tone, separated by
    // thin bright cracks with a soft glow beside them; the cracks are grooves in the bump map.
    const cell = Math.max(10, 70 * s), V = voronoi(W, band, cell, R, 14 * s);
    const tone = new Float32Array(V.count);
    for (let k = 0; k < V.count; k++) tone[k] = R() - 0.5;
    const base = shadeRgb(color, -0.08), lite = shadeRgb(color, 0.5);
    const oi = o.createImageData(W, band), bi = b.createImageData(W, band), od = oi.data, bd = bi.data, lw = Math.max(0.9, 1.5 * s);
    for (let p = 0; p < W * band; p++) {
      const e = V.e[p], t = tone[V.id[p]], q = p * 4;
      const xx = p % W, yy = (p / W) | 0, fade = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(xx * 0.031 + yy * 0.047 + t * 9)), crack = Math.max(0, 1 - e / lw) * fade, glow = Math.max(0, 1 - e / (9 * s)) * 0.34 * (0.5 + 0.5 * fade);
      const k = Math.min(1, crack * 0.95 + glow * (1 - crack));
      od[q] = base[0] + (lite[0] - base[0]) * (0.3 + t * 0.7) * (1 - k) + 255 * k * 0.9 + lite[0] * 0.1 * k;
      od[q + 1] = base[1] + (lite[1] - base[1]) * (0.3 + t * 0.7) * (1 - k) + 255 * k * 0.9 + lite[1] * 0.1 * k;
      od[q + 2] = base[2] + (lite[2] - base[2]) * (0.3 + t * 0.7) * (1 - k) + 255 * k * 0.9 + lite[2] * 0.1 * k;
      od[q + 3] = Math.round(255 * Math.max(0.7 + t * 0.1, k * 0.92));
      const hv = crack > 0.2 ? 38 : 128 + t * 26 + Math.min(16, e * 1.3);
      bd[q] = bd[q + 1] = bd[q + 2] = hv; bd[q + 3] = 255;
    }
    o.putImageData(oi, 0, y0); b.putImageData(bi, 0, y0);
  } else if (id === 'crystal') {
    // [v10] crystalline glaze after the references: a saturated, glossy ground with big, soft-edged crystal flowers. Each flower is a fan of
    // wide translucent wedges (rays) of varying brightness with a scalloped edge and a faint shadow where it overlaps its neighbours; no outlines.
    o.fillStyle = rgbaShade(color, 0.02, 0.98); o.fillRect(0, y0, W, band);
    const pale = shadeRgb(color, 0.78), mid = shadeRgb(color, 0.45), deep = shadeRgb(color, -0.25);
    const pc = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const flowers = Math.max(6, cnt(48));
    const fl = [];
    for (let i = 0; i < flowers; i++) fl.push({ x: R() * W, y: y0 + R() * band, r: px(50 + R() * 120), arc0: R() * 6.28, span: R() < 0.4 ? 3.2 + R() * 2.2 : 6.4, fold: R() });
    fl.sort((a, c) => a.r - c.r); // small ones on top of the big ones
    for (const f of fl) {
      const { r, arc0, span } = f, nw = Math.round(30 + r * 0.35);
      wrapX(f.x, r * 1.2, (xx) => {
        o.save(); o.translate(xx, f.y);
        // soft shadow on the ground around the flower
        const sg = o.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.12); sg.addColorStop(0, pc(deep, 0)); sg.addColorStop(0.8, pc(deep, 0.28)); sg.addColorStop(1, pc(deep, 0));
        o.fillStyle = sg; o.beginPath(); o.arc(0, 0, r * 1.12, 0, 6.2832); o.fill();
        const tri = (ctx, a, w, len, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len); ctx.arc(0, 0, len, a - w, a + w); ctx.closePath(); ctx.fill(); };
        for (let k = 0; k < nw; k++) {
          const a = arc0 + ((k + 0.5) / nw) * span, w = (span / nw) * 0.62, len = r * (0.82 + R() * 0.18), br = R();
          tri(o, a, w, len, br < 0.35 ? pc(mid, 0.5) : br < 0.8 ? pc(pale, 0.58) : pc(pale, 0.82));
        }
        const cg = o.createRadialGradient(0, 0, 0, 0, 0, r * 0.4); cg.addColorStop(0, pc(deep, 0.5)); cg.addColorStop(1, pc(deep, 0));
        o.fillStyle = cg; o.beginPath(); o.arc(0, 0, r * 0.4, arc0, arc0 + span); o.lineTo(0, 0); o.fill(); // darker pinched centre
        const eg = o.createRadialGradient(0, 0, r * 0.82, 0, 0, r); eg.addColorStop(0, pc(pale, 0)); eg.addColorStop(1, pc(pale, 0.75)); // brighter fibres at the rim
        o.fillStyle = eg; o.beginPath(); o.moveTo(0, 0); o.arc(0, 0, r, arc0, arc0 + span); o.closePath(); o.fill();
        o.restore();
      });
    }
    for (let i = 0; i < cnt(140); i++) { // satellite droplets
      const x = R() * W, y = y0 + R() * band, r = px(2 + R() * 5);
      wrapX(x, r + 2, (xx) => { o.fillStyle = pc(pale, 0.5); o.beginPath(); o.arc(xx, y, r, 0, 6.28); o.fill(); o.strokeStyle = pc(pale, 0.8); o.lineWidth = px(1); o.stroke(); });
    }
  } else if (id === 'salt') {
    // [v10] salt glaze after the references: a glossy, pale olive-cream glaze (not a gravel surface) with fine sandy grains, a few dark iron-brown
    // pools ringed with tiny pale bubbles, short olive runs at the rim and a dark speckled foot.
    o.fillStyle = 'rgba(214,205,166,.97)'; o.fillRect(0, y0, W, band);
    const og = o.createLinearGradient(0, y0, 0, Hc);
    og.addColorStop(0, 'rgba(150,150,70,.5)'); og.addColorStop(0.18, 'rgba(176,170,100,.2)'); og.addColorStop(0.55, 'rgba(176,170,120,0)'); og.addColorStop(0.9, 'rgba(150,130,90,.25)'); og.addColorStop(1, 'rgba(96,66,44,.7)');
    o.fillStyle = og; o.fillRect(0, y0, W, band);
    for (let i = 0; i < cnt(40); i++) { // soft glaze thickness stains
      const x = R() * W, y = y0 + R() * band, r = px(40 + R() * 90), lite = R() < 0.5;
      wrapX(x, r, (xx) => { const g = o.createRadialGradient(xx, y, 0, xx, y, r); g.addColorStop(0, lite ? 'rgba(236,230,200,.4)' : 'rgba(170,160,110,.3)'); g.addColorStop(1, lite ? 'rgba(236,230,200,0)' : 'rgba(170,160,110,0)'); o.fillStyle = g; o.beginPath(); o.arc(xx, y, r, 0, 6.28); o.fill(); });
    }
    const drips = Math.max(8, Math.round(26 * s)); // short olive runs from the rim
    for (let i = 0; i < drips; i++) { const x = R() * W, w = px(5 + R() * 9), h = px(10 + R() * 26), y = rimY; wrapX(x, w * 2, (xx) => { o.fillStyle = 'rgba(160,150,70,.6)'; o.beginPath(); o.moveTo(xx - w, y); o.lineTo(xx - w, y + h); o.arc(xx, y + h, w, Math.PI, 0, true); o.lineTo(xx + w, y); o.fill(); }); }
    for (let i = 0; i < Math.max(2, cnt(5)); i++) { // iron-brown pools with bubbles round the edge
      const x = R() * W, y = y0 + band * (0.25 + R() * 0.55), rx = px(36 + R() * 70), ry = px(14 + R() * 20);
      wrapX(x, rx * 1.4, (xx) => {
        o.save(); o.translate(xx, y); o.scale(1, ry / rx);
        const g = o.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, 'rgba(70,30,22,.97)'); g.addColorStop(0.75, 'rgba(96,44,30,.9)'); g.addColorStop(1, 'rgba(110,60,38,0)');
        o.fillStyle = g; o.beginPath(); o.arc(0, 0, rx, 0, 6.28); o.fill(); o.restore();
        for (let k = 0; k < 22; k++) { const a = R() * 6.28, d = 0.7 + R() * 0.45; o.fillStyle = 'rgba(244,238,220,.85)'; o.beginPath(); o.arc(xx + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, px(0.9 + R() * 1.1), 0, 6.28); o.fill(); }
      });
    }
    const foot = Hc - Math.min(band * 0.12, PXR * 5);
    o.fillStyle = 'rgba(92,62,42,.92)'; o.fillRect(0, foot, W, Hc - foot); // dark, speckled foot
    for (let i = 0; i < cnt(20000); i++) { const x = R() * W, y = foot + R() * (Hc - foot), z = px(0.8 + R() * 1.4); o.fillStyle = R() < 0.5 ? 'rgba(210,170,120,.55)' : 'rgba(40,24,16,.6)'; o.fillRect(x, y, z, z); }
    for (let i = 0; i < cnt(30000); i++) { // fine sandy grains over the glaze
      const x = R() * W, y = y0 + R() * band, z = px(0.6 + R() * 1.0), k = R();
      o.fillStyle = k < 0.45 ? 'rgba(255,248,230,.6)' : k < 0.8 ? 'rgba(176,112,58,.5)' : 'rgba(110,80,50,.4)';
      o.fillRect(x, y, z, z);
    }
    for (let i = 0; i < cnt(26000); i++) { // very small bumps only: the glaze itself stays glossy
      const x = R() * W, y = y0 + R() * band, z = px(0.8 + R() * 1.1);
      b.fillStyle = R() < 0.5 ? '#9a9a9a' : '#6a6a6a'; b.beginPath(); b.arc(x, y, z, 0, 6.28); b.fill();
    }
  } else if (id === 'volcanic') {} else if (id === 'volcanic') {
    for (let i = 0; i < cnt(520); i++) {
      const x = R() * W, y = y0 + R() * band, r = px(3 + R() * R() * 20);
      wrapX(x, r + 3, (xx) => {
        o.beginPath(); o.arc(xx, y, r, 0, Math.PI * 2);
        o.fillStyle = 'rgba(22,14,12,.34)'; o.fill();
        o.strokeStyle = 'rgba(40,26,20,.62)'; o.lineWidth = px(1.5); o.stroke();
        o.beginPath(); o.arc(xx - r * 0.2, y - r * 0.2, r * 0.7, Math.PI * 1.05, Math.PI * 1.7);
        o.strokeStyle = 'rgba(255,225,190,.35)'; o.lineWidth = px(1.2); o.stroke();
        b.beginPath(); b.arc(xx, y, r, 0, Math.PI * 2);
        b.fillStyle = '#4c4c4c'; b.fill();
        b.strokeStyle = '#d8d8d8'; b.lineWidth = px(2); b.stroke();
      });
    }
    for (let i = 0; i < cnt(5000); i++) { // fine pitting
      const x = R() * W, y = y0 + R() * band, z = px(1 + R() * 1.5);
      o.fillStyle = 'rgba(30,20,16,.4)'; o.fillRect(x, y, z, z);
      b.fillStyle = '#505050'; b.fillRect(x, y, z, z);
    }
  } else if (id === 'iron') {
    // [v9] iron crystalline glaze after the references: a black-brown glaze covered with silver-blue feather crystals (rounded top,
    // central rib, fine herringbone barbs, warm tan core) packed like scales; black glaze shows in the gaps. The colour argument is ignored.
    o.fillStyle = 'rgba(14,12,14,.96)'; o.fillRect(0, y0, W, band);
    const feathers = [];
    for (let i = 0; i < cnt(800); i++) feathers.push({ x: R() * W, y: y0 + R() * band, L: px(34 + R() * R() * 120), tilt: (R() - 0.5) * 0.5, warm: R() });
    feathers.sort((p, q) => p.y - q.y);
    for (const f of feathers) {
      const L = f.L, Wd = L * 0.2;
      wrapX(f.x, Wd, (xx) => {
        o.save(); o.translate(xx, f.y); o.rotate(f.tilt);
        const path = (ctx) => { ctx.beginPath(); ctx.moveTo(0, L * 0.55); ctx.bezierCurveTo(Wd * 0.7, L * 0.2, Wd * 0.62, -L * 0.45, 0, -L * 0.5); ctx.bezierCurveTo(-Wd * 0.62, -L * 0.45, -Wd * 0.7, L * 0.2, 0, L * 0.55); ctx.closePath(); };
        const g = o.createLinearGradient(0, -L * 0.5, 0, L * 0.55);
        const tealish = f.warm > 0.7, tan = f.warm < 0.25; g.addColorStop(0, tan ? 'rgba(206,170,120,.95)' : tealish ? 'rgba(150,196,190,.95)' : 'rgba(196,210,218,.95)'); g.addColorStop(0.4, tealish ? 'rgba(96,136,140,.95)' : 'rgba(112,128,142,.95)'); g.addColorStop(1, 'rgba(24,30,38,.97)');
        path(o); o.fillStyle = g; o.fill();
        o.strokeStyle = 'rgba(8,8,12,.85)'; o.lineWidth = px(1.1); o.stroke();
        o.strokeStyle = 'rgba(214,226,236,.55)'; o.lineWidth = px(0.9); o.beginPath(); o.moveTo(0, -L * 0.42); o.lineTo(0, L * 0.5); o.stroke(); // rib
        o.strokeStyle = 'rgba(200,214,226,.3)'; o.lineWidth = px(0.7);
        for (let k = 0; k < 7; k++) { const yy = -L * 0.34 + k * L * 0.12, w = Wd * 0.46 * (1 - Math.abs(yy) / (L * 0.8)); o.beginPath(); o.moveTo(0, yy); o.lineTo(-w, yy + w * 0.7); o.moveTo(0, yy); o.lineTo(w, yy + w * 0.7); o.stroke(); }
        o.restore();
        b.save(); b.translate(xx, f.y); b.rotate(f.tilt); path(b); b.fillStyle = '#a2a2a2'; b.fill(); b.strokeStyle = '#303030'; b.lineWidth = px(1.4); b.stroke(); b.restore();
      });
    }
  } else if (id === 'drip') {
    // [v9] runny glaze after the references: a thick glaze band at the rim from which long, fat tongues of glaze run down, two-toned
    // (lighter near the rim, deeper towards the rounded tips), with a bright highlight on every tip. Below the tongues the body stays bare.
    const top = rimY - PXR * 1.2;
    const lw = Math.min(band * 0.8, 260 * s);
    const c1 = shadeRgb(color, 0.3), c2 = shadeRgb(color, -0.05), c3 = shadeRgb(color, -0.38);
    const rgbA = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const drops = Math.max(7, Math.round(11 * Math.sqrt(s)));
    const shapes = [];
    for (let i = 0; i < drops; i++) shapes.push({ x: ((i + 0.1 + R() * 0.8) / drops) * W, len: 34 * s + R() * R() * lw + R() * lw * 0.25, w: px(58 + R() * 56), sh: R() });
    o.fillStyle = 'rgba(247,245,241,.98)'; o.fillRect(0, y0, W, band); // [v10] the body is white porcelain; the coloured glaze runs over it
    const rimH = px(64);
    const tongues = (ctx, bumpMode) => {
      for (const sp of shapes) {
        const h = sp.len, w = sp.w, x0 = sp.x, y = top + rimH * 0.6, r = w / 2;
        wrapX(x0, w * 2, (xx) => {
          const path = () => { ctx.beginPath(); ctx.moveTo(xx - w * 1.1, y - rimH * 0.7); ctx.quadraticCurveTo(xx - r, y - rimH * 0.2, xx - r, y + px(10)); ctx.lineTo(xx - r, y + h); ctx.arc(xx, y + h, r, Math.PI, 0, true); ctx.lineTo(xx + r, y + px(10)); ctx.quadraticCurveTo(xx + r, y - rimH * 0.2, xx + w * 1.1, y - rimH * 0.7); ctx.closePath(); };
          path();
          if (bumpMode) { ctx.fillStyle = '#b4b4b4'; ctx.fill(); ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = px(1.8); ctx.stroke(); return; }
          const g = ctx.createLinearGradient(0, y, 0, y + h + r);
          g.addColorStop(0, rgbA(sp.sh < 0.5 ? c1 : c2, 0.95)); g.addColorStop(0.55, rgbA(sp.sh < 0.5 ? c2 : c3, 0.95)); g.addColorStop(1, rgbA(c3, 0.97));
          ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = rgbA(c3, 0.45); ctx.lineWidth = px(1.4); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.lineWidth = px(2); ctx.beginPath(); ctx.moveTo(xx - r * 0.45, y + px(14)); ctx.lineTo(xx - r * 0.45, y + h - r * 0.2); ctx.stroke(); // highlight along the tongue
          ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(xx - r * 0.3, y + h + r * 0.15, r * 0.28, r * 0.18, 0, 0, 6.28); ctx.fill(); // tip highlight
        });
      }
    };
    o.fillStyle = rgbA(c1, 0.97); o.fillRect(0, top - px(2), W, rimH + px(2));
    for (let i = 0; i < 70; i++) { const x = R() * W, w = px(10 + R() * 26); o.fillStyle = rgbA(R() < 0.5 ? c2 : shadeRgb(color, 0.5), 0.35); o.fillRect(x, top, w, rimH + px(2)); } // streaky two-tone rim band
    b.fillStyle = '#b4b4b4'; b.fillRect(0, top - px(2), W, rimH);
    tongues(o, false); tongues(b, true);
  }
  return { overlay, bump, params };
}
