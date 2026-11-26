// [v10] Session logic: the scoring rules, the score bands and the 8-minute countdown. Pure logic, no DOM except a tiny sampling canvas.
// Specification (approved): total = 40% shape + 30% glaze + 30% process, each 0..100.
import { DY, SEGS, FLOOR_ROW, BARE_HEX } from './clay.js';

export const TIMED_SECONDS = 480, WARN_SECONDS = 60;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

let sampler = null;
// fraction of the pot's paint canvas that is no longer bare clay colour (sampled on a small copy)
export function paintCoverage(clay) {
  if (!sampler) { sampler = document.createElement('canvas'); sampler.width = 64; sampler.height = 32; }
  const c = sampler.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, 64, 32); c.drawImage(clay.paint, 0, 0, 64, 32);
  const d = c.getImageData(0, 0, 64, 32).data, n = parseInt(BARE_HEX.slice(1), 16), br = (n >> 16) & 255, bg = (n >> 8) & 255, bb = n & 255;
  let used = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 40) used++;
  return used / (64 * 32);
}

// ---- shape integrity (0..100): an opened vessel with a sensible, symmetric, smooth profile and a sound wall ----
export function shapeParts(clay) {
  const n = clay.n, rowMean = [];
  let cvSum = 0, cvN = 0;
  for (let i = FLOOR_ROW + 1; i < n; i++) {
    let s = 0, s2 = 0;
    for (let k = 0; k < SEGS; k++) { const r = clay.radii[i * SEGS + k]; s += r; s2 += r * r; }
    const m = s / SEGS; rowMean.push(m);
    if (m > 0.05) { cvSum += Math.sqrt(Math.max(0, s2 / SEGS - m * m)) / m; cvN++; }
  }
  const H = (n - 1) * DY, Rmax = Math.max(...rowMean, 0.01), base = rowMean[0] || 0;
  const aspect = H / (2 * Rmax);
  const form = clamp(Math.min(H / 0.4, 1)) * (aspect >= 0.22 && aspect <= 3.2 ? 1 : 0.5) * clamp(base / (0.32 * Rmax)); // tall enough, plausible proportions, a base it can stand on
  const symmetry = 1 - clamp((cvN ? cvSum / cvN : 0) / 0.1);
  let bump = 0;
  for (let i = 1; i < rowMean.length - 1; i++) bump += Math.abs(rowMean[i - 1] - 2 * rowMean[i] + rowMean[i + 1]);
  const smooth = 1 - clamp((bump / Math.max(1, rowMean.length - 2)) / 0.018);
  const th = clay.thick, wall = clay.solid ? 0 : th < 0.035 ? clamp(th / 0.035) : th > 0.16 ? clamp(1 - (th - 0.16) / 0.14) : 1;
  return { form, symmetry, smooth, wall, opened: !clay.solid };
}
export function shapeScore(clay) {
  const p = shapeParts(clay);
  const raw = 0.3 * p.form + 0.25 * p.symmetry + 0.25 * p.smooth + 0.2 * p.wall;
  return Math.round(100 * (p.opened ? raw : Math.min(raw, 0.25))); // a closed lump of clay is not a vessel yet: capped at 25
}

// ---- glaze effect (0..100): colour coverage (40) + the glaze/texture effect itself (35) + details (25) ----
// ctx = { clay, mode, anc: { chosen, finished }, maxStep }
export function glazeScore(ctx) {
  const { clay } = ctx, cov = paintCoverage(clay);
  const coverage = 40 * clamp(cov / 0.45);
  let effect = 0;
  if (ctx.anc.finished || ctx.maxStep >= 7) effect = 35;           // Ancient: glaze fired
  else if (ctx.maxStep >= 5) effect = 8;                          // chosen but not fired yet
  const id = clay.finish.id;
  if (!['glaze', 'clay', 'dry', 'trim', 'bisque', 'raw'].includes(id)) effect = Math.max(effect, 35); // Free: a real glaze texture
  else if (id === 'glaze' && cov > 0.05) effect = Math.max(effect, 15);                                  // Free: plain colour glaze
  const details = 25 * clamp((clay.ornaments.length > 0 ? 0.4 : 0) + 0.6 * clamp(cov / 0.2));
  return Math.round(coverage + effect + details);
}

// ---- process completion (0..100) ----
export function processScore(ctx) {
  const { clay } = ctx, cov = paintCoverage(clay);
  const ancient = ctx.maxStep >= 7 ? 1 : ctx.maxStep / 7;           // furthest Ancient step reached (0 = still throwing, 7 = cooled and unloaded)
  const free = ((!clay.solid ? 1 : 0) + (cov > 0.04 ? 1 : 0) + (!['glaze', 'clay', 'dry', 'trim', 'bisque', 'raw'].includes(clay.finish.id) || clay.ornaments.length ? 1 : 0)) / 3;
  return Math.round(100 * Math.max(ancient, free));
}

export const BANDS = [ // min total, id
  { id: 'record', min: 85 }, { id: 'good', min: 70 }, { id: 'fair', min: 50 }, { id: 'low', min: 30 }, { id: 'poor', min: 10 }, { id: 'empty', min: 0 }
];
export function scorePot(ctx) {
  const shape = shapeScore(ctx.clay), glaze = glazeScore(ctx), process = processScore(ctx);
  const total = Math.round(0.4 * shape + 0.3 * glaze + 0.3 * process);
  const empty = ctx.clay.solid && paintCoverage(ctx.clay) < 0.02;
  const band = empty ? 'empty' : BANDS.find((b) => total >= b.min && b.id !== 'empty').id;
  return { shape, glaze, process, total, band };
}

// ---- countdown: runs only while no pause reason is held (tutorial, hidden tab, automatic animations, dialogs) ----
export class Countdown {
  constructor(seconds, { onTick, onWarn, onEnd, warnAt = WARN_SECONDS } = {}) {
    this.warnAt = warnAt; this.total = seconds * 1000; this.left = this.total; this.on = { onTick, onWarn, onEnd };
    this.reasons = new Set(); this.started = false; this.ended = false; this.warned = false; this.last = 0; this.raf = 0;
    this._vis = () => (document.hidden ? this.hold('hidden') : this.release('hidden'));
    document.addEventListener('visibilitychange', this._vis);
  }
  start() { if (this.started) return; this.started = true; this.last = performance.now(); this._loop(); }
  hold(r) { this.reasons.add(r); }
  release(r) { this.reasons.delete(r); }
  get running() { return this.started && !this.ended && this.reasons.size === 0; }
  _loop() {
    const now = performance.now(), dt = now - this.last; this.last = now;
    if (this.running) {
      this.left = Math.max(0, this.left - dt);
      if (!this.warned && this.left <= this.warnAt * 1000) { this.warned = true; this.on.onWarn && this.on.onWarn(); }
      if (this.left <= 0) { this.ended = true; this.on.onTick && this.on.onTick(0); this.on.onEnd && this.on.onEnd(); return; }
    }
    this.on.onTick && this.on.onTick(Math.ceil(this.left / 1000));
    this.raf = requestAnimationFrame(() => this._loop());
  }
  stop() { cancelAnimationFrame(this.raf); this.ended = true; document.removeEventListener('visibilitychange', this._vis); }
}
export const fmtTime = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
