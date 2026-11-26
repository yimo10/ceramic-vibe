// The clay model (no THREE): a lathe-style pot with a *variable number of rows*, a high-resolution paint canvas
// wrapped around it, a surface finish and a list of 3D ornaments.
//
//  - Rows are a fixed DY apart. "Lifting" inserts a row (the wall grows taller, thinner); pressing down removes one.
//    Inserting whole rows is exact: nothing is resampled or blurred, and the paint canvas shifts by whole rows too.
//  - The paint canvas is W x Hc. Row i sits at canvas y = Hc - (i + 0.5) * PXR; column u = 1 - theta / 2pi.
import { buildFinish, hexToRgb, rgba, FINISH_PARAMS } from './finishes.js';

const SOFT_KICK = 40, SOFT_TIME = 1.8, SOFT_K = 330, SOFT_C = 6, SOFT_KC = 140; // [v8] squish: kick strength, run time (s), spring, damping, neighbour coupling
export const TAU = Math.PI * 2;
export const SEGS = 64;
export const DY = 0.025;
export const N_MAX = 66;
export const N_MIN = 8;
export const FLOOR_ROW = 3;
export const THICK_MIN = 0.055;
export const THICK_MAX = 0.4;
export const R_MIN = 0.16;
export const R_MAX = 1.15;
// [v20] glaze-type finishes (crackle, crystal, ...) show ONLY where paint has been applied; these body looks stay on the whole pot
const BODY_IDS = ['clay', 'dry', 'trim', 'bisque', 'raw'];
const isBodyId = (id) => BODY_IDS.includes(id);
export const BARE_HEX = '#d9b99b';

export const GLAZES = [
  { id: 'bare', hex: '#d9b99b', zh: '原坯', en: 'Bare clay' },
  { id: 'snow', hex: '#efe9dd', zh: '雪白', en: 'Snow white' },
  { id: 'celadon', hex: '#8fb8ae', zh: '天青', en: 'Celadon' },
  { id: 'persimmon', hex: '#c4553b', zh: '柿红', en: 'Persimmon' },
  { id: 'honey', hex: '#d9a441', zh: '蜜黄', en: 'Honey' },
  { id: 'olive', hex: '#8a8b4e', zh: '茶叶末', en: 'Tea olive' },
  { id: 'indigo', hex: '#3f5f8c', zh: '靛蓝', en: 'Indigo' },
  { id: 'plum', hex: '#7a4a68', zh: '黛紫', en: 'Plum' },
  { id: 'ink', hex: '#2c2a2e', zh: '墨黑', en: 'Ink' }
];

// Starting shapes. pts = [height 0..1, radius]. "lump" is the blank clay used when sculpting from scratch.
export const PRESETS = {
  // [v3] "lump" is now a closed, slightly irregular ball of clay (solid: true) instead of a thick-walled blank.
  // Press the top with the push tool to open it (pinch pot), or pull it upward with the lift tool.
  // [v6] shape follows the reference photo: a wide, low, slightly flattened dome that is a little wider at the bottom
  lump: { n: 28, thick: 0.3, solid: true, pts: [[0, 0.5], [0.08, 0.64], [0.3, 0.7], [0.62, 0.62], [0.88, 0.46], [1, 0.27]] },
  bowl: { n: 26, thick: 0.065, pts: [[0, 0.26], [0.12, 0.44], [0.45, 0.68], [0.8, 0.82], [1, 0.86]] },
  plate: { n: 10, thick: 0.08, pts: [[0, 0.6], [0.3, 0.78], [1, 1.0]] },
  cup: { n: 30, thick: 0.065, pts: [[0, 0.34], [0.5, 0.38], [1, 0.46]] },
  bottle: { n: 62, thick: 0.065, pts: [[0, 0.4], [0.12, 0.5], [0.3, 0.52], [0.55, 0.32], [0.75, 0.15], [0.9, 0.16], [1, 0.25]] }
};

const catmull = (p0, p1, p2, p3, u) =>
  0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
function profileAt(pts, y) {
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    if (y <= pts[i + 1][0] || i === n - 2) {
      const a = pts[i][0], b = pts[i + 1][0];
      const u = Math.min(1, Math.max(0, (y - a) / (b - a)));
      return catmull(pts[Math.max(0, i - 1)][1], pts[i][1], pts[i + 1][1], pts[Math.min(n - 1, i + 2)][1], u);
    }
  }
  return pts[n - 1][1];
}

// radii of a preset, used to draw its little icon in the studio
export function presetOutline(name) {
  const p = PRESETS[name] || PRESETS.lump;
  const rs = [];
  for (let i = 0; i < p.n; i++) rs.push(profileAt(p.pts, i / (p.n - 1)));
  return { n: p.n, rs };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// [v3] soft limits: instead of cutting the radius flat at R_MIN / R_MAX (which made hard, stepped plateaus), the value
// eases into the limit along an exponential knee, so extreme pulls keep a rounded profile.
const KNEE = 0.12;
function softLimit(v) {
  const hi = R_MAX - KNEE, lo = R_MIN + KNEE;
  if (v > hi) return hi + KNEE * (1 - Math.exp(-(v - hi) / KNEE));
  if (v < lo) return lo - KNEE * (1 - Math.exp(-(lo - v) / KNEE));
  return v;
}
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export class Clay {
  // scale: 1 for the studio (1024 px wide paint canvas), 0.25 for the gallery.
  constructor(scale = 1) {
    this.scale = scale;
    this.W = Math.round(1024 * scale);
    this.PXR = Math.max(1, Math.round(8 * scale));
    this.Hc = N_MAX * this.PXR;
    this.n = PRESETS.lump.n;
    this.thick = PRESETS.lump.thick;
    this.solid = true; // [v3] true while the clay is still a closed lump
    this.radii = new Float32Array(N_MAX * SEGS);
    this.el = new Float32Array(N_MAX * SEGS); this.elv = new Float32Array(N_MAX * SEGS); this.softT = 0; // [v8] transient soft-body offset
    this.innerColor = BARE_HEX;
    this.finish = { id: 'glaze', color: '#8fb8ae' }; // free mode: the smooth porcelain look (v7: back to the v3 default; Ancient Craft sets its own clay looks)
    this.ornaments = [];
    this.paint = mkCanvas(this.W, this.Hc);
    this.pctx = this.paint.getContext('2d', { willReadFrequently: true }); // the painted-area mask reads it back
    // [v21] glaze mask: where the player has brushed the glaze on (alpha). Independent of the colour/pattern paint above.
    this.gmask = mkCanvas(this.W, this.Hc); this.gctx = this.gmask.getContext('2d', { willReadFrequently: false });
    // [v24] relief map: mid-grey = flat, lighter = raised (convex), darker = sunken (concave); painted along with brush strokes / pattern stamps
    this.relief = mkCanvas(this.W, this.Hc); this.rctx = this.relief.getContext('2d'); this.hasRelief = false; this.reliefSign = 0;
    this.rctx.fillStyle = '#808080'; this.rctx.fillRect(0, 0, this.W, this.Hc);
    this.display = mkCanvas(this.W, this.Hc);
    this.dctx = this.display.getContext('2d');
    this.overlay = null;
    this.bump = null;
    this.gl = null; this.glazeLayer = null; this.bodyParams = FINISH_PARAMS.glaze; this.bumpShown = null; this.matMap = null; this._maskVer = -1; // [v20] masked glaze layer
    this.fparams = FINISH_PARAMS.glaze; // [v8] must match finish.id ('glaze'); it was the matte clay look, so the white pot flipped matte <-> glossy
    this.paintVersion = 0;
    this.geoDirty = true; this.texDirty = true; this.finishDirty = true; this.innerDirty = true; this.ornDirty = true;
    this._snapPaint = null;
    this.setPreset('lump');
  }

  height() { return (this.n - 1) * DY; }
  maxRadius() {
    let m = 0;
    for (let i = 0; i < this.n * SEGS; i++) if (this.radii[i] > m) m = this.radii[i];
    return m;
  }
  yPx(y) { return this.Hc - (y / DY + 0.5) * this.PXR; }
  uOf(theta) { let u = 1 - theta / TAU; u -= Math.floor(u); return u; }

  radiusAt(y, theta = 0) {
    const f = clamp(y / DY, 0, this.n - 1), i0 = Math.floor(f), i1 = Math.min(this.n - 1, i0 + 1), t = f - i0;
    const k = ((Math.round((((theta % TAU) + TAU) % TAU) / TAU * SEGS)) % SEGS + SEGS) % SEGS;
    return this.radii[i0 * SEGS + k] * (1 - t) + this.radii[i1 * SEGS + k] * t;
  }

  // ---- presets / reset -------------------------------------------------------------------------
  setPreset(name) {
    const p = PRESETS[name] || PRESETS.lump;
    this.n = p.n;
    this.thick = p.thick;
    this.solid = !!p.solid; // [v3] only the lump is closed; bowl / plate / cup / bottle are hollow vessels
    this.radii.fill(0);
    for (let i = 0; i < this.n; i++) {
      const r = profileAt(p.pts, i / (this.n - 1));
      for (let k = 0; k < SEGS; k++) this.radii[i * SEGS + k] = r;
    }
    if (this.solid) this._roughen();
    this.ornaments = [];
    this.resetPaint();
    this.geoDirty = true; this.ornDirty = true;
    this.refreshFinish(true);
  }

  resetAll() { // "restart": a fresh lump, smooth glaze
    this.finish = { id: 'glaze', color: this.finish.color }; // v7: smooth glaze again
    this.setPreset('lump');
    this.clearGlazeMask();
    this.rebuildFinish();
  }

  clearRelief() { this.rctx.globalCompositeOperation = 'source-over'; this.rctx.fillStyle = '#808080'; this.rctx.fillRect(0, 0, this.W, this.Hc); if (this.hasRelief) { this.hasRelief = false; this.rebuildFinish(); } }
  _markRelief() { if (!this.hasRelief) { this.hasRelief = true; this.rebuildFinish(); } } // first raised / sunken mark: the surface now needs a bump map
  paintReliefStroke(st, theta, y, sign, sigma, alpha, opacity = 1) {
    this._markRelief();
    const sp = this.paint, sc = this.pctx;
    this.paint = this.relief; this.pctx = this.rctx;
    try { this.paintStroke(st, theta, y, sign > 0 ? '#ffffff' : '#000000', sigma, alpha, opacity); } finally { this.paint = sp; this.pctx = sc; }
  }
  clearGlazeMask() { this.gctx.globalCompositeOperation = 'source-over'; this.gctx.clearRect(0, 0, this.W, this.Hc); this.touchPaint(); }
  // a stroke of the glaze brush: the normal soft stroke code, run on the mask canvas (white = glazed)
  paintMaskStroke(st, theta, y, sigma, alpha, opacity = 1) {
    const sp = this.paint, sc = this.pctx;
    this.paint = this.gmask; this.pctx = this.gctx;
    try { this.paintStroke(st, theta, y, '#ffffff', sigma, alpha, opacity); } finally { this.paint = sp; this.pctx = sc; }
  }
  resetPaint() {
    this.pctx.globalCompositeOperation = 'source-over';
    this.pctx.fillStyle = BARE_HEX;
    this.pctx.fillRect(0, 0, this.W, this.Hc);
    this.innerColor = BARE_HEX;
    this.innerDirty = true;
    this.clearRelief();
    this.touchPaint();
  }

  touchPaint() { this.paintVersion++; this.texDirty = true; }

  // ---- shaping ---------------------------------------------------------------------------------
  // [v3] A hand-made lump is never perfectly round: low-frequency, smooth variation of the radius (no random per-vertex
  // noise, so the surface stays a clean continuous curve and can still be pinched freely).
  _roughen() {
    // [v6] stronger, still smooth lumps (a hand-squeezed clay ball) plus a soft fold ring low on the side, as in the reference photo
    const ph = Array.from({ length: 8 }, () => Math.random() * TAU), foldAt = 0.24 + Math.random() * 0.1;
    for (let i = 0; i < this.n; i++) {
      const v = i / (this.n - 1), fold = Math.exp(-(((v - foldAt) / 0.045) ** 2));
      for (let k = 0; k < SEGS; k++) {
        const th = (k * TAU) / SEGS;
        const f = 1 + 0.07 * Math.sin(2 * th + ph[0] + v * 1.6) + 0.055 * Math.sin(3 * th + ph[1] - v * 2.2) +
          0.03 * Math.sin(5 * th + ph[2] + v * 3) + 0.04 * Math.sin(v * 5.5 + ph[3] + th * 0.5) +
          0.04 * Math.sin(4 * th + ph[4] + v * 4) * (0.4 + v) -
          fold * (0.05 + 0.03 * Math.sin(th * 2 + ph[5])); // the pressed fold: a shallow groove
        this.radii[i * SEGS + k] *= f;
      }
    }
  }

  // [v3] Pressing the top of a closed lump opens it: the dome is dropped and the wall thickness is set so that a
  // clean ring-shaped rim with an opening appears (like pushing a thumb into a pinch pot). Returns true if it opened.
  openClay() {
    if (!this.solid) return false;
    this.solid = false;
    const top = (this.n - 1) * SEGS;
    let r = 0;
    for (let k = 0; k < SEGS; k++) r += this.radii[top + k];
    r /= SEGS;
    this.thick = clamp(Math.min(0.3, r - 0.14), THICK_MIN, THICK_MAX);
    this.geoDirty = true; this.ornDirty = true; this.innerDirty = true;
    return true;
  }

  // theta/y are in the pot's own (non-rotating) space. dir: +1 pushes the wall outwards, -1 inwards.
  // ring = true shapes the whole ring at that height (like a finger held against a spinning wheel).
  // [v3] Rewritten for smooth, continuous surfaces:
  //   1. the kernel is never narrower than ~2 mesh columns / rows, so a bump always spans several vertices;
  //   2. the kernel fades to exactly 0 at 3 sigma (no 1 % cut-off step);
  //   3. radii use a soft limit instead of a hard clamp;
  //   4. after each change the touched patch is relaxed in BOTH directions (rows and columns), not just vertically.
  // [v22] pull every row of the wall towards its own circular mean: the lump slowly becomes rotationally symmetric (k = share per call, 0..1)
  regularize(k) {
    k = Math.min(0.5, Math.max(0, k)); if (!k) return;
    const n = this.n, R = this.radii;
    for (let i = 0; i < n; i++) {
      let m = 0; for (let j = 0; j < SEGS; j++) m += R[i * SEGS + j]; m /= SEGS;
      for (let j = 0; j < SEGS; j++) { const q = i * SEGS + j; R[q] += (m - R[q]) * k; }
    }
    this.geoDirty = true;
  }
  deform(theta, y, dir, amount, sigma, ring) {
    const n = this.n;
    const rc = Math.max(this.radiusAt(y, theta), 0.2);
    const colW = (TAU * rc) / SEGS;
    const kc = Math.round((((theta % TAU) + TAU) % TAU) / TAU * SEGS) % SEGS;
    const g3 = Math.exp(-4.5), inv = 1 / (1 - g3);
    // [v8] one Gaussian pass; `sc` scales the effect and `kick` feeds the springy "squish" (see softStep)
    const pass = (sg, sc, kick) => {
      const sA = Math.max(sg, colW * 1.6), sY = Math.max(sg, DY * 1.6);
      const spanY = Math.ceil((3 * sY) / DY), iC = Math.round(y / DY);
      const i0 = Math.max(0, iC - spanY), i1 = Math.min(n - 1, iC + spanY);
      const spanK = ring ? SEGS / 2 : Math.min(SEGS / 2, Math.ceil((3 * sA) / colW));
      const kn = ring ? SEGS : 2 * spanK + 1;
      for (let i = i0; i <= i1; i++) {
        const dy = i * DY - y;
        const gy = Math.exp(-(dy * dy) / (2 * sY * sY));
        const wy = Math.max(0, (gy - g3) * inv);
        if (wy <= 0) continue;
        for (let j = 0; j < kn; j++) {
          const k = ring ? j : (kc - spanK + j + SEGS) % SEGS;
          let w = wy;
          if (!ring) {
            const arc = angDiff((k * TAU) / SEGS, theta) * rc;
            const ga = Math.exp(-(arc * arc) / (2 * sA * sA));
            w *= Math.max(0, (ga - g3) * inv);
          }
          const idx = i * SEGS + k;
          this.radii[idx] = softLimit(this.radii[idx] + dir * sc * amount * w);
          if (kick) this.elv[idx] += dir * amount * w * kick;
        }
      }
      return [i0, i1, spanK];
    };
    const [i0, i1, spanK] = pass(sigma, 1, 0); // [v9] firm wheel clay again: no springy kick
    this._smoothPatch(Math.max(1, i0 - 1), Math.min(n - 2, i1 + 1), kc, ring ? SEGS / 2 : spanK + 2, 0.3);
    this.geoDirty = true;
  }

  // [v8] Soft-body feel. A damped spring (+ coupling to the neighbours, so waves run over the surface) acts on a TRANSIENT offset `el`
  // added to the radii only for display: the clay squishes where it is pressed, overshoots a little and settles back, while the shape
  // that was actually formed (`radii`) stays. Runs only for about a second after each push / pull.
  softStep(dt) {
    if (this.softT <= 0) return;
    this.softT -= dt;
    const n = this.n, el = this.el, v = this.elv;
    const steps = 2, h = Math.min(dt, 0.05) / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n; i++) {
        const up = (i < n - 1 ? i + 1 : i) * SEGS, dn = (i > 0 ? i - 1 : i) * SEGS; // rows at the ends use themselves as the missing neighbour
        for (let k = 0; k < SEGS; k++) {
          const idx = i * SEGS + k, l = el[i * SEGS + ((k + SEGS - 1) % SEGS)], r = el[i * SEGS + ((k + 1) % SEGS)];
          const lap = l + r + el[dn + k] + el[up + k] - 4 * el[idx];
          v[idx] += (-SOFT_K * el[idx] - SOFT_C * v[idx] + SOFT_KC * lap) * h;
        }
      }
      for (let idx = 0; idx < n * SEGS; idx++) { let e = el[idx] + v[idx] * h; el[idx] = e > 0.04 ? 0.04 : e < -0.04 ? -0.04 : e; }
    }
    if (this.softT <= 0) { el.fill(0); v.fill(0); }
    this.geoDirty = true;
  }
  // radii to draw: the formed shape plus the transient squish
  viewRadii() {
    if (this.softT <= 0) return this.radii;
    if (!this._view) this._view = new Float32Array(N_MAX * SEGS);
    const m = this.n * SEGS;
    for (let i = 0; i < m; i++) this._view[i] = this.radii[i] + this.el[i];
    return this._view;
  }

  // [v3] 4-neighbour relaxation of a patch (rows i0..i1, columns kc +- spanK, wrapping). Uses a copy so the result
  // does not depend on the visiting order. a = blend towards the neighbour average (0..1).
  _smoothPatch(i0, i1, kc, spanK, a) {
    if (i1 < i0) return;
    const r = this.radii;
    if (!this._sm) this._sm = new Float32Array(N_MAX * SEGS);
    const t = this._sm, full = spanK >= SEGS / 2, kn = full ? SEGS : 2 * spanK + 1;
    for (let i = i0; i <= i1; i++) {
      for (let j = 0; j < kn; j++) {
        const k = full ? j : (kc - spanK + j + SEGS) % SEGS, idx = i * SEGS + k;
        const l = r[i * SEGS + ((k + SEGS - 1) % SEGS)], rt = r[i * SEGS + ((k + 1) % SEGS)];
        t[idx] = r[idx] + a * ((l + rt + r[idx - SEGS] + r[idx + SEGS]) * 0.25 - r[idx]);
      }
    }
    for (let i = i0; i <= i1; i++) {
      for (let j = 0; j < kn; j++) {
        const k = full ? j : (kc - spanK + j + SEGS) % SEGS;
        r[i * SEGS + k] = t[i * SEGS + k];
      }
    }
  }

  // [v3] rounds the shoulder around a row that was just lifted, so the pulled wall flows in a curve instead of
  // ending in a straight tube with a sharp corner.
  smoothAround(row, half = 4, a = 0.35) {
    this._smoothPatch(Math.max(1, row - half), Math.min(this.n - 2, row + half), 0, SEGS / 2, a);
    this.geoDirty = true;
  }

  // gentle vertical smoothing keeps vessels clean and removes pitted, lumpy surfaces
  smoothRows(i0, i1, a) {
    const r = this.radii;
    for (let i = i0; i <= i1; i++) {
      for (let k = 0; k < SEGS; k++) {
        const idx = i * SEGS + k;
        r[idx] += a * (0.5 * (r[idx - SEGS] + r[idx + SEGS]) - r[idx]) * 0.5;
      }
    }
  }

  // [v10] after rows were pulled up at row k: spread the stretch over a band so the wall flows in a smooth S-curve
  // instead of a stepped shoulder (clay pulled between the fingers thins out gradually above the pinch)
  liftBlend(k, half = 6, passes = 2) {
    const r = this.radii, lo = Math.max(FLOOR_ROW + 1, k - half), hi = Math.min(this.n - 2, k + half);
    for (let ps = 0; ps < passes; ps++) {
      for (let i = lo; i <= hi; i++) {
        const w = 0.5 * (1 + Math.cos(Math.PI * Math.min(1, Math.abs(i - k) / (half + 1)))) * 0.7;
        for (let j = 0; j < SEGS; j++) {
          const idx = i * SEGS + j;
          r[idx] += w * (0.5 * (r[idx - SEGS] + r[idx + SEGS]) - r[idx]);
        }
      }
    }
    // the cut top edge is rounded off a little
    if (k + half >= this.n - 3) for (let j = 0; j < SEGS; j++) { const i = (this.n - 1) * SEGS + j; r[i] += 0.35 * (r[i - SEGS] - r[i]); }
    this.geoDirty = true;
  }

  clampRow(k) { return clamp(k, FLOOR_ROW + 1, this.n - 1); }

  insertRow(k) {
    if (this.n >= N_MAX) return false;
    k = this.clampRow(k);
    this.radii.copyWithin((k + 1) * SEGS, k * SEGS, this.n * SEGS);
    this.n++;
    if (!this.solid) this.thick = Math.max(THICK_MIN, this.thick - 0.012); // pulling clay thins the wall (a solid lump has no wall yet)
    this._shiftPaint(k, 1);
    this.geoDirty = true; this.ornDirty = true;
    return true;
  }

  removeRow(k) {
    if (this.n <= N_MIN) return false;
    k = this.clampRow(k);
    this.radii.copyWithin(k * SEGS, (k + 1) * SEGS, this.n * SEGS);
    this.n--;
    if (!this.solid) this.thick = Math.min(THICK_MAX, this.thick + 0.006);
    this._shiftPaint(k, -1);
    this.geoDirty = true; this.ornDirty = true;
    return true;
  }

  _shiftPaint(k, dir) {
    const { W, PXR, Hc } = this;
    const B = Hc - k * PXR;
    if (!this._tmp) this._tmp = mkCanvas(W, Hc);
    const t = this._tmp.getContext('2d');
    t.clearRect(0, 0, W, Hc);
    t.drawImage(this.paint, 0, 0);
    if (dir > 0) this.pctx.drawImage(this._tmp, 0, 0, W, B, 0, -PXR, W, B); // everything above row k moves up
    else this.pctx.drawImage(this._tmp, 0, 0, W, B - PXR, 0, PXR, W, B - PXR);
    this.touchPaint();
  }

  // ---- painting ----------------------------------------------------------------------------------
  paintDab(theta, y, hex, sigma, alpha, target) { // [v5] target: optional private layer canvas context (translucent strokes)
    const { W, PXR } = this;
    const x = this.uOf(theta) * W, yp = this.yPx(y);
    const r = Math.max(this.radiusAt(y, theta), 0.12);
    const sx = W / (TAU * r), sy = PXR / DY, Rr = sigma * 1.5;
    const ctx = target || this.pctx;
    for (const off of [0, W, -W]) {
      const xx = x + off;
      if (xx + Rr * sx < 0 || xx - Rr * sx > W) continue;
      ctx.save();
      ctx.translate(xx, yp);
      ctx.scale(sx, sy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Rr);
      // [v6] soft-edged stamp: smooth-step falloff (no visible rim, neighbouring stamps merge)
      g.addColorStop(0, rgba(hex, alpha));
      g.addColorStop(0.35, rgba(hex, alpha * 0.93));
      g.addColorStop(0.65, rgba(hex, alpha * 0.55));
      g.addColorStop(0.85, rgba(hex, alpha * 0.18));
      g.addColorStop(1, rgba(hex, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, Rr, 0, TAU); ctx.fill();
      ctx.restore();
    }
    this.touchPaint();
  }

  // [v6] Continuous brush stroke.
  // Input are the UV positions (theta = around the pot, y = height) where the finger touches the mesh, one per frame. They are
  //  1. unwrapped (theta never jumps at the seam), 2. stabilised (exponential smoothing removes hand jitter),
  //  3. joined by a Catmull-Rom curve through the last stabilised points (the end is extrapolated, so nothing waits for the next sample),
  //  4. resampled at a FIXED distance (45 % of the brush sigma, i.e. well under the brush radius of 1.5 sigma), so the gap between
  //     two stamps can never exceed the radius however fast the hand moves,
  //  5. stamped with a soft-edged round brush onto a private layer (opaque, alpha-blended into each other), and the layer is blended
  //     over the paint at `opacity` (the slider), so the stroke is one smooth shape and crossing your own stroke does not darken it.
  // `alpha` (the old per-dab strength) is no longer needed and is ignored.
  paintStroke(st, theta, y, hex, sigma, alpha, opacity = 1) {
    if (!st.lctx) this._beginLayerStroke(st);
    const ctx = st.lctx, DAB = 0.6;
    const ru = st.ru == null ? theta : st.ru + angDiff(theta, st.ru); // 1. unwrap
    st.ru = ru;
    if (!st.sm) st.sm = { u: ru, y };
    else { st.sm.u += (ru - st.sm.u) * 0.55; st.sm.y += (y - st.sm.y) * 0.55; } // 2. stabilise
    const p = { u: st.sm.u, y: st.sm.y }, P = st.P || (st.P = []);
    const spacing = Math.max(0.0018, sigma * 0.45);
    if (!P.length) { this.paintDab(p.u, p.y, hex, sigma, DAB, ctx); P.push(p); st.acc = 0; }
    else {
      const q = P[P.length - 1];
      if (Math.hypot(p.u - q.u, p.y - q.y) > 1e-5) {
        P.push(p); if (P.length > 4) P.shift();
        const n = P.length, p1 = P[n - 2], p2 = P[n - 1], p0 = n >= 3 ? P[n - 3] : p1;
        const p3 = { u: 2 * p2.u - p1.u, y: 2 * p2.y - p1.y }; // extrapolated end tangent
        const rr = Math.max(this.radiusAt(p2.y, p2.u), 0.12);
        const world = (a, b) => Math.hypot((b.u - a.u) * rr, b.y - a.y);
        const M = clamp(Math.ceil(world(p1, p2) / (spacing * 1.5)), 2, 48); // 3. dense samples of the curve
        let prev = p1, dabs = 0;
        for (let i = 1; i <= M; i++) {
          const t = i / M;
          const cur = { u: catmull(p0.u, p1.u, p2.u, p3.u, t), y: catmull(p0.y, p1.y, p2.y, p3.y, t) };
          let seg = world(prev, cur);
          while (st.acc + seg >= spacing && dabs < 80) { // 4. stamp at fixed distance steps
            const need = spacing - st.acc, f = seg > 0 ? need / seg : 0;
            prev = { u: prev.u + (cur.u - prev.u) * f, y: prev.y + (cur.y - prev.y) * f };
            this.paintDab(prev.u, prev.y, hex, sigma, DAB, ctx);
            dabs++; seg = world(prev, cur); st.acc = 0;
          }
          st.acc += seg; prev = cur;
        }
      }
    }
    this._blendLayerStroke(st, opacity); // 5. layer over paint at the chosen opacity
  }
  _beginLayerStroke(st) {
    const { W, Hc } = this;
    if (!this._strokeBase) { this._strokeBase = mkCanvas(W, Hc); this._strokeLayer = mkCanvas(W, Hc); }
    const bctx = this._strokeBase.getContext('2d'), lctx = this._strokeLayer.getContext('2d');
    bctx.globalCompositeOperation = 'source-over'; bctx.globalAlpha = 1;
    bctx.clearRect(0, 0, W, Hc); bctx.drawImage(this.paint, 0, 0); // what the paint looked like before this stroke
    lctx.clearRect(0, 0, W, Hc);
    st.lctx = lctx;
  }
  _blendLayerStroke(st, opacity) {
    const p = this.pctx;
    p.globalCompositeOperation = 'source-over';
    p.globalAlpha = 1;
    p.clearRect(0, 0, this.W, this.Hc);
    p.drawImage(this._strokeBase, 0, 0);
    p.globalAlpha = opacity;
    p.drawImage(this._strokeLayer, 0, 0);
    p.globalAlpha = 1;
    this.touchPaint();
  }

  stampOne(theta, y, pat, ink, size) {
    const { W, PXR } = this;
    const x = this.uOf(theta) * W, yp = this.yPx(y);
    const r = Math.max(this.radiusAt(y, theta), 0.12);
    const sx = (W / (TAU * r)) * size, sy = (PXR / DY) * size;
    const ctx = this.pctx;
    for (const off of [0, W, -W]) {
      const xx = x + off;
      if (xx + sx * 0.8 < 0 || xx - sx * 0.8 > W) continue;
      ctx.save();
      ctx.translate(xx, yp);
      ctx.scale(sx, sy);
      pat.render(ctx, ink);
      ctx.restore();
    }
    if (this.reliefSign) { // [v24] the same shape on the relief map (white = raised, black = sunken), slightly softened into a bevel
      this._markRelief();
      const rc = this.rctx, ink2 = this.reliefSign > 0 ? '#ffffff' : '#000000';
      rc.save(); try { rc.filter = 'blur(1.2px)'; } catch {}
      for (const off of [0, W, -W]) {
        const xx = x + off;
        if (xx + sx * 0.8 < 0 || xx - sx * 0.8 > W) continue;
        rc.save(); rc.translate(xx, yp); rc.scale(sx, sy); pat.render(rc, ink2); rc.restore();
      }
      rc.restore();
    }
    this.touchPaint();
  }

  // stamps a pattern repeatedly along the finger path, `spacing` world units apart
  stampStroke(st, theta, y, pat, ink, size, spacing) {
    if (st.th == null) { this.stampOne(theta, y, pat, ink, size); st.th = theta; st.y = y; st.acc = 0; return; }
    const r = this.radiusAt(y, theta);
    const dth = angDiff(theta, st.th), dx = dth * r, dy = y - st.y, d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    let t = 0, need = spacing - st.acc, count = 0;
    while (t + need <= d && count < 12) {
      t += need;
      const f = t / d;
      this.stampOne(st.th + dth * f, st.y + dy * f, pat, ink, size);
      need = spacing;
      st.acc = 0;
      count++;
    }
    st.acc += d - t;
    st.th = theta; st.y = y;
  }

  setInnerColor(hex) {
    if (this.innerColor === hex) return;
    this.innerColor = hex;
    this.innerDirty = true;
  }

  // ---- finish ------------------------------------------------------------------------------------
  setFinish(id, color, base) { // base: body look that stays on the unpainted areas under a glaze-type finish (e.g. 'bisque')
    this.finish = { id, color: color || this.finish.color, alpha: this.finish.alpha == null ? 1 : this.finish.alpha };
    if (base) this.finish.base = base;
    this.rebuildFinish();
  }
  // [v17] texture opacity slider: how strongly the finish overlay covers the painted surface (1 = as designed)
  setFinishAlpha(a) { this.finish = { ...this.finish, alpha: Math.max(0.05, Math.min(1, a)) }; this.finishDirty = true; this.texDirty = true; }
  // [v20] a glaze preview on top of a body look (traditional mode: the chosen glaze shows on the painted areas of the biscuit at once)
  setGlazeLayer(id, color) { this.glazeLayer = id ? { id, color } : null; this.rebuildFinish(); }
  rebuildFinish() {
    const dims = { W: this.W, Hc: this.Hc, PXR: this.PXR, n: this.n };
    const fid = this.finish.id, body = isBodyId(fid);
    const f = buildFinish(body ? fid : (this.finish.base || 'glaze'), this.finish.color, dims);
    this.overlay = f.overlay; this.bump = f.bump; this.bodyParams = f.params;
    const spec = this.glazeLayer || (!body && fid !== 'glaze' ? this.finish : null);
    this.gl = null; this.fparams = f.params;
    if (spec) {
      const g = buildFinish(spec.id, spec.color || this.finish.color, dims);
      if (g.overlay || g.bump) {
        this.gl = { ...g, id: spec.id };
        const a = f.params, b = g.params, mx = (x, y) => Math.max(x, y, 0.001);
        this.fparams = { roughness: mx(a.roughness, b.roughness), clearcoat: mx(a.clearcoat, b.clearcoat), clearcoatRoughness: b.clearcoatRoughness, bumpScale: Math.max(a.bumpScale, b.bumpScale), iridescence: 0 };
        const P = this.fparams;
        this.matRatio = { out: [a.clearcoat / P.clearcoat, a.roughness / P.roughness], in: [b.clearcoat / P.clearcoat, b.roughness / P.roughness] };
        if (!this.matMap) { this.matMap = mkCanvas(this.W, this.Hc); this.bumpShown = mkCanvas(this.W, this.Hc); this._tmpA = mkCanvas(this.W, this.Hc); }
        this._maskVer = -1;
      }
    }
    this._finishN = this.n;
    if (this.hasRelief) { // [v24] raised / sunken marks need a bump map and enough bump strength even on a smooth glaze
      if (!this.bumpShown) this.bumpShown = mkCanvas(this.W, this.Hc);
      this.fparams = { ...this.fparams, bumpScale: Math.max(this.fparams.bumpScale || 0, 6) };
    }
    this.finishDirty = true; this.texDirty = true;
  }
  // the drip pattern starts at the rim, so it must follow a changing height
  refreshFinish(force) {
    if (force ? this.finish.id !== 'glaze' : this.finish.id === 'drip' && this._finishN !== this.n) this.rebuildFinish();
  }

  // pushes the paint (+ overlay) into the display canvas that the texture reads from
  composite() {
    const d = this.dctx, al = this.finish.alpha == null ? 1 : this.finish.alpha;
    d.globalCompositeOperation = 'source-over';
    d.drawImage(this.paint, 0, 0);
    if (this.overlay) { d.globalAlpha = this.gl ? 1 : al; d.drawImage(this.overlay, 0, 0); d.globalAlpha = 1; }
    if (this.gl) { // [v20] the glaze texture, only where something has been painted
      const mask = this._mask();
      if (this.gl.overlay && this.gl.id !== 'gloss') { // (a glossy glaze is all shine: it must not recolour what was painted)
        const t = this._tmpA.getContext('2d');
        t.globalCompositeOperation = 'copy'; t.drawImage(this.gl.overlay, 0, 0);
        t.globalCompositeOperation = 'destination-in'; t.drawImage(mask, 0, 0);
        d.globalAlpha = al * (this.gl.id === 'clear' ? 1 : 0.85); d.drawImage(this._tmpA, 0, 0); d.globalAlpha = 1;
      }
      this._maps(mask);
    } else if (this.hasRelief) this._bumpOnly();
    if (this.hasRelief) this._reliefTone();
  }
  // [v25] softened copy of the relief height map (half resolution + blur): turns the flat white / black marks into rounded beads and grooves
  _soft() {
    if (this._softV === this.paintVersion && this._softC) return this._softC;
    const hw = this.W >> 1, hh = this.Hc >> 1;
    if (!this._softC) { this._softC = mkCanvas(this.W, this.Hc); this._softH = mkCanvas(hw, hh); }
    const h = this._softH.getContext('2d'), o = this._softC.getContext('2d');
    h.globalCompositeOperation = 'copy'; h.drawImage(this.relief, 0, 0, hw, hh);
    o.globalCompositeOperation = 'source-over'; o.fillStyle = '#808080'; o.fillRect(0, 0, this.W, this.Hc);
    o.save(); try { o.filter = 'blur(1.2px)'; } catch {} o.imageSmoothingEnabled = true; o.drawImage(this._softH, 0, 0, this.W, this.Hc); o.restore();
    this._softV = this.paintVersion; return this._softC;
  }
  // [v26] shape only, no colour change: a baked emboss shading (light from the upper left) from the softened height map.
  // Raised lines get a bright upper-left edge and a dark lower-right edge, carved lines the reverse; flat areas stay untouched.
  _reliefTone() {
    const S = this._soft(), { W, Hc } = this;
    if (this._toneV !== this.paintVersion || !this._toneC) {
      if (!this._toneC) this._toneC = mkCanvas(W, Hc);
      const sx = S.getContext('2d', { willReadFrequently: true }), src = sx.getImageData(0, 0, W, Hc).data;
      const tc = this._toneC.getContext('2d'), out = tc.createImageData(W, Hc), o = out.data, K = 5, D = 3;
      for (let y = 0; y < Hc; y++) {
        const y2 = Math.min(Hc - 1, y + D), row = y * W, row2 = y2 * W;
        for (let x = 0; x < W; x++) {
          const x2 = (x + D) % W, a = src[(row + x) * 4], b = src[(row2 + x2) * 4];
          const v = Math.max(0, Math.min(255, 128 + (a - b) * K)); const k = (row + x) * 4;
          o[k] = o[k + 1] = o[k + 2] = v; o[k + 3] = 255;
        }
      }
      tc.putImageData(out, 0, 0); this._toneV = this.paintVersion;
    }
    const d = this.dctx; d.save(); d.globalCompositeOperation = 'overlay'; d.globalAlpha = 0.9; d.drawImage(this._toneC, 0, 0); d.restore();
  }
  _mask() { return this.gmask; } // [v21] the glaze brush's own mask (not derived from the colour paint)
  // bump + (clear-coat, roughness) maps that follow the mask, so the shine and relief of the glaze exist only on the painted areas
  _maps(mask) {
    const { W, Hc } = this, q = this._tmpA.getContext('2d'), bs = this.bumpShown.getContext('2d'), mm = this.matMap.getContext('2d');
    const rgb = (c, r) => `rgb(${Math.round(c * 255)},${Math.round(r * 255)},0)`;
    mm.globalCompositeOperation = 'source-over'; mm.fillStyle = rgb(this.matRatio.out[0], this.matRatio.out[1]); mm.fillRect(0, 0, W, Hc);
    q.globalCompositeOperation = 'copy'; q.fillStyle = rgb(this.matRatio.in[0], this.matRatio.in[1]); q.fillRect(0, 0, W, Hc);
    q.globalCompositeOperation = 'destination-in'; q.drawImage(mask, 0, 0); mm.drawImage(this._tmpA, 0, 0);
    bs.globalCompositeOperation = 'source-over'; bs.fillStyle = '#808080'; bs.fillRect(0, 0, W, Hc);
    if (this.bump) bs.drawImage(this.bump, 0, 0);
    q.globalCompositeOperation = 'copy'; q.fillStyle = '#808080'; q.fillRect(0, 0, W, Hc); q.globalCompositeOperation = 'destination-in'; q.drawImage(mask, 0, 0);
    bs.drawImage(this._tmpA, 0, 0); // flat inside the painted area first (the body relief is replaced there) ...
    if (this.gl.bump) { q.globalCompositeOperation = 'copy'; q.drawImage(this.gl.bump, 0, 0); q.globalCompositeOperation = 'destination-in'; q.drawImage(mask, 0, 0); bs.drawImage(this._tmpA, 0, 0); } // ... then the glaze's own relief
    if (this.hasRelief) { bs.globalCompositeOperation = 'hard-light'; bs.drawImage(this._soft(), 0, 0); bs.globalCompositeOperation = 'source-over'; } // [v24] raised / sunken marks on top (mid-grey = no change)
  }
  // bump map without a masked glaze: the body/finish relief plus the raised / sunken marks
  _bumpOnly() {
    const { W, Hc } = this, bs = this.bumpShown.getContext('2d');
    bs.globalCompositeOperation = 'source-over'; bs.fillStyle = '#808080'; bs.fillRect(0, 0, W, Hc);
    if (this.bump) bs.drawImage(this.bump, 0, 0);
    bs.globalCompositeOperation = 'hard-light'; bs.drawImage(this._soft(), 0, 0); bs.globalCompositeOperation = 'source-over';
  }

  // ---- undo / redo -------------------------------------------------------------------------------
  snapshot() {
    let paint;
    if (this._snapPaint && this._snapPaint.version === this.paintVersion) paint = this._snapPaint.canvas;
    else {
      paint = mkCanvas(this.W, this.Hc);
      paint.getContext('2d').drawImage(this.paint, 0, 0);
      this._snapPaint = { version: this.paintVersion, canvas: paint };
    }
    return {
      n: this.n, thick: this.thick, solid: this.solid, radii: this.radii.slice(0, this.n * SEGS), paint, gmask: this._copyMask(), relief: this.hasRelief ? this._copyCanvas(this.relief) : null,
      innerColor: this.innerColor, finish: { ...this.finish }, ornaments: this.ornaments.map((o) => ({ ...o }))
    };
  }
  _copyCanvas(src) { const c = mkCanvas(this.W, this.Hc); c.getContext('2d').drawImage(src, 0, 0); return c; }
  _copyMask() { const c = mkCanvas(this.W, this.Hc); c.getContext('2d').drawImage(this.gmask, 0, 0); return c; }
  restore(s) {
    this.n = s.n; this.thick = s.thick; this.solid = !!s.solid; // [v3] solid flag is part of the undo state
    this.radii.fill(0);
    this.radii.set(s.radii);
    this.pctx.globalCompositeOperation = 'source-over';
    this.pctx.clearRect(0, 0, this.W, this.Hc);
    this.pctx.drawImage(s.paint, 0, 0);
    this.gctx.globalCompositeOperation = 'source-over'; this.gctx.clearRect(0, 0, this.W, this.Hc); if (s.gmask) this.gctx.drawImage(s.gmask, 0, 0);
    this.rctx.globalCompositeOperation = 'source-over'; this.rctx.fillStyle = '#808080'; this.rctx.fillRect(0, 0, this.W, this.Hc);
    if (s.relief) this.rctx.drawImage(s.relief, 0, 0);
    if (!!s.relief !== this.hasRelief) { this.hasRelief = !!s.relief; this.rebuildFinish(); }
    this.innerColor = s.innerColor;
    this.ornaments = s.ornaments.map((o) => ({ ...o }));
    this.finish = { ...s.finish };
    this.rebuildFinish();
    this.touchPaint();
    this.geoDirty = true; this.innerDirty = true; this.ornDirty = true;
  }

  // ---- ornaments ---------------------------------------------------------------------------------
  addOrnament(type, theta, y, scale = 1) {
    const o = { id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, theta, y, scale, rot: 0 };
    this.ornaments.push(o);
    this.ornDirty = true;
    return o;
  }
  removeOrnament(id) {
    this.ornaments = this.ornaments.filter((o) => o.id !== id);
    this.ornDirty = true;
  }

  // ---- saving / loading --------------------------------------------------------------------------
  toRecord() {
    return {
      v: 2, rows: this.n, segs: SEGS, thick: this.thick, solid: this.solid, // [v3] solid = still a closed lump
      radii: this.radii.slice(0, this.n * SEGS),
      paint: this.paint.toDataURL('image/png'), gmask: this.gmask.toDataURL('image/png'), relief: this.hasRelief ? this.relief.toDataURL('image/png') : null,
      innerColor: this.innerColor, finish: { ...this.finish },
      ornaments: this.ornaments.map((o) => ({ ...o }))
    };
  }

  static async fromRecord(rec, scale = 1) {
    const c = new Clay(scale);
    const n = rec.rows | 0;
    if (!(n >= N_MIN && n <= N_MAX) || !rec.radii || rec.radii.length !== n * SEGS) return c; // damaged: blank clay
    c.n = n;
    c.radii.fill(0);
    c.radii.set(rec.radii);
    c.thick = clamp(+rec.thick || 0.07, THICK_MIN, THICK_MAX);
    c.solid = !!rec.solid; // [v3] older works have no flag = hollow vessels
    c.pctx.fillStyle = BARE_HEX;
    c.pctx.fillRect(0, 0, c.W, c.Hc);
    if (rec.v >= 2 && rec.paint) {
      try {
        const img = new Image();
        img.src = rec.paint;
        await img.decode();
        c.pctx.drawImage(img, 0, 0, c.W, c.Hc);
      } catch (e) { console.warn('[clay] could not decode paint', e); }
      if (rec.gmask) { try { const gi = new Image(); gi.src = rec.gmask; await gi.decode(); c.gctx.drawImage(gi, 0, 0, c.W, c.Hc); } catch (e) { console.warn('[clay] could not decode glaze mask', e); } }
      if (rec.relief) { try { const ri = new Image(); ri.src = rec.relief; await ri.decode(); c.rctx.drawImage(ri, 0, 0, c.W, c.Hc); c.hasRelief = true; } catch (e) { console.warn('[clay] could not decode relief', e); } }
      c.innerColor = rec.innerColor || BARE_HEX;
      c.finish = rec.finish && rec.finish.id ? { id: rec.finish.id, color: rec.finish.color || '#8fb8ae', alpha: rec.finish.alpha == null ? 1 : rec.finish.alpha, ...(rec.finish.base ? { base: rec.finish.base } : {}) } : { id: 'glaze', color: '#8fb8ae' };
      c.ornaments = Array.isArray(rec.ornaments) ? rec.ornaments.map((o) => ({ ...o })) : [];
    } else if (rec.colors && rec.colors.length === 49 * SEGS * 3) {
      // version 1 works stored one colour per row/column; resample them onto the paint canvas
      const small = mkCanvas(SEGS, 49);
      const sctx = small.getContext('2d');
      const id = sctx.createImageData(SEGS, 49);
      for (let i = 0; i < 49; i++) {
        for (let k = 0; k < SEGS; k++) {
          const src = (i * SEGS + k) * 3, dst = ((48 - i) * SEGS + ((SEGS - k) % SEGS)) * 4;
          id.data[dst] = rec.colors[src]; id.data[dst + 1] = rec.colors[src + 1]; id.data[dst + 2] = rec.colors[src + 2]; id.data[dst + 3] = 255;
        }
      }
      sctx.putImageData(id, 0, 0);
      c.pctx.imageSmoothingEnabled = true;
      c.pctx.drawImage(small, 0, c.Hc - 49 * c.PXR, c.W, 49 * c.PXR);
      const t = (48 * SEGS) * 3;
      c.innerColor = '#' + [0, 1, 2].map((j) => rec.colors[t + j].toString(16).padStart(2, '0')).join('');
      c.finish = { id: 'glaze', color: '#8fb8ae' };
    }
    if (!rec.gmask && c.finish && !['glaze', 'clay', 'dry', 'trim', 'bisque', 'raw'].includes(c.finish.id)) { c.gctx.fillStyle = '#fff'; c.gctx.fillRect(0, 0, c.W, c.Hc); } // works saved before v21: the texture covered the whole pot
    c.rebuildFinish();
    c.paintVersion++;
    return c;
  }
}

export { hexToRgb };
