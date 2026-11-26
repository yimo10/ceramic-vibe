// [v15] One audio engine for the whole site (studio, cutscenes, cabinet).
//   Graph:  sources -> bus (music | sfx | voice | ui) -> [music ducker] -> mix -> compressor/limiter -> master -> speakers
//           every bus also feeds a small room reverb, so synthesised and recorded sounds sit in the same space.
//   Sounds: each effect first looks for a recording in  public/audio/  (see audio/manifest.json and audio/SLOTS.md); when a slot has no
//           file it falls back to a synthesised version, so the site always has sound. Studio = realistic clay / kiln, cutscenes = retro 8-bit.
//   Continuous sounds (clay under the fingers, brush, scraping) are loops whose level follows how hard / fast you work: sfx.hold(kind, level).
// Nothing plays before the first click / touch (browser rule). Volumes and mute are remembered.
let ctx = null, master = null, comp = null, mix = null, duckG = null, noiseBuf = null, muted = false, amb = null;
const buses = {}, samples = {}, holds = {}, last = {};
let duckUntil = 0, timer = 0, loading = null;
const vol = { master: 0.8, music: 0.85, sfx: 1 }; // [v19] music turned up (was 0.55)
try { muted = localStorage.getItem('gp-muted') === '1'; Object.assign(vol, JSON.parse(localStorage.getItem('gp-vol') || '{}')); if (localStorage.getItem('gp-vol-ver') !== '19') { vol.music = 0.85; localStorage.setItem('gp-vol-ver', '19'); } } catch {} // [v19] one-time: a music level saved from the old default would hide the louder music
const BUS_GAIN = { music: () => vol.music, sfx: () => vol.sfx, clay: () => vol.sfx * 0.6, // [v16] every clay / tool / brush sound sits at 60 % of the other effects
  voice: () => vol.sfx * 0.9, ui: () => vol.sfx * 0.75 };
const BUS_REVERB = { music: 0.22, sfx: 0.13, clay: 0.13, voice: 0.07, ui: 0.03 };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);

function makeImpulse(sec = 1.5, decay = 2.6) { // synthetic small-room impulse response
  const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return buf;
}
function applyVolumes() {
  if (!ctx) return;
  master.gain.setTargetAtTime(muted ? 0 : vol.master, ctx.currentTime, 0.03);
  for (const k in buses) buses[k].g.gain.setTargetAtTime(BUS_GAIN[k](), ctx.currentTime, 0.05);
}
function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : vol.master; master.connect(ctx.destination);
    comp = ctx.createDynamicsCompressor(); // keeps stacked sounds (bang + music + voices) from clipping
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(master);
    mix = ctx.createGain(); mix.connect(comp);
    duckG = ctx.createGain(); duckG.connect(mix);
    const conv = ctx.createConvolver(); conv.buffer = makeImpulse(); const rev = ctx.createGain(); rev.gain.value = 0.9; conv.connect(rev); rev.connect(mix);
    for (const k of Object.keys(BUS_GAIN)) {
      const g = ctx.createGain(); g.gain.value = BUS_GAIN[k](); g.connect(k === 'music' ? duckG : mix);
      const send = ctx.createGain(); send.gain.value = BUS_REVERB[k]; g.connect(send); send.connect(conv);
      buses[k] = { g };
    }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (location.search.includes('dbg') || sessionStorage.getItem('gp-dbg')) { const an = ctx.createAnalyser(); an.fftSize = 2048; master.connect(an); window.__an = an; } // test hook: peak meter
    timer = setInterval(housekeeping, 60);
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else if (!muted) ctx.resume().catch(() => {}); }); // silent while the tab is hidden
    loading = loadSamples();
    return true;
  } catch (e) { console.warn('[sfx] audio init failed', e); ctx = null; return false; }
}
export function initSfx() { // call once at start-up; the audio context is created by the first click / key press
  const go = () => ensure();
  window.addEventListener('pointerdown', go, { once: true });
  window.addEventListener('keydown', go, { once: true });
}
export const isMuted = () => muted;
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('gp-muted', muted ? '1' : '0'); } catch {}
  applyVolumes();
}
export const getVolume = (k) => vol[k];
export function setVolume(k, v) {
  if (!(k in vol)) return; vol[k] = clamp(+v);
  try { localStorage.setItem('gp-vol', JSON.stringify(vol)); } catch {}
  applyVolumes();
}
const ok = (name, gap) => { const n = performance.now(); if (n - (last[name] || 0) < gap) return false; last[name] = n; return true; }; // per-sound throttle (ms)
const live = () => !muted && ensure();

// ---- recorded samples (optional files in public/audio/, listed in audio/manifest.json) ----
const CLAY_SLOT = /^(grab|release|squish|scrape|smooth|brush|stamp|place|clay|lift)(_loop)?$/;
async function loadSamples() {
  try {
    const base = new URL('audio/', document.baseURI);
    const r = await fetch(new URL('manifest.json', base)); if (!r.ok) return;
    const m = await r.json();
    await Promise.allSettled(Object.entries(m).filter(([k]) => !k.startsWith('_')).map(async ([name, def]) => {
      const files = [].concat(def.files || def), bufs = [];
      for (const f of files) { try { const q = await fetch(new URL(f, base)); if (q.ok) bufs.push(await ctx.decodeAudioData(await q.arrayBuffer())); } catch {} }
      if (bufs.length) samples[name] = { bufs, gain: def.gain ?? 1, rate: def.rate || [0.95, 1.05], bus: def.bus || (CLAY_SLOT.test(name) ? 'clay' : 'sfx') };
    }));
  } catch {}
}
function smp(name, { gain = 1, rate, bus, delay = 0 } = {}) { // plays a recording of this slot (random variant, slight random pitch); false if there is none
  const s = samples[name]; if (!s) return false;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = s.bufs[Math.floor(Math.random() * s.bufs.length)];
  src.playbackRate.value = rate ?? rnd(s.rate[0], s.rate[1]);
  g.gain.value = gain * s.gain; src.connect(g); g.connect(buses[bus || s.bus].g); src.start(ctx.currentTime + delay);
  return true;
}
export const hasSample = (n) => !!samples[n];

// ---- synthesis helpers (all route to a bus) ----
function noise(dur, { type = 'lowpass', f = 600, q = 0.8, gain = 0.3, attack = 0.01, sweep = 0, bus = 'sfx', delay = 0 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  const g = ctx.createGain(), t = ctx.currentTime + delay;
  fl.frequency.setValueAtTime(f, t); if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f + sweep), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(buses[bus].g);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(freq, dur, { type = 'sine', gain = 0.2, delay = 0, glide = 0, bus = 'sfx', attack = 0.012 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + delay;
  freq = Math.min(freq, 16000); o.type = type; o.frequency.setValueAtTime(freq, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(buses[bus].g); o.start(t); o.stop(t + dur + 0.05);
}
// a ceramic "tink": a few inharmonic partials with a fast decay
function tink(f = 3000, gain = 0.07, delay = 0, bus = 'sfx') { tone(f, 0.35, { gain, delay, bus, attack: 0.002 }); tone(f * 2.76, 0.18, { gain: gain * 0.4, delay, bus, attack: 0.002 }); tone(f * 5.4, 0.08, { gain: gain * 0.2, delay, bus, attack: 0.002 }); }

// ---- continuous sounds: a looping voice whose level follows the action (call every frame while it happens) ----
const HOLD = {
  clay: { type: 'bandpass', f: 380, q: 0.9, gain: 0.34, wob: 0.5 }, // wet clay moving under the fingers
  lift: { type: 'bandpass', f: 620, q: 1.0, gain: 0.3, wob: 0.8 },
  smooth: { type: 'bandpass', f: 950, q: 0.7, gain: 0.2, wob: 0.3 },
  scrape: { type: 'bandpass', f: 2600, q: 1.3, gain: 0.17, wob: 1.2 },
  brush: { type: 'highpass', f: 3300, q: 0.5, gain: 0.1, wob: 0.6 }
};
const csmp = (n, o = {}) => smp(n, { ...o, bus: 'clay' }), cnoise = (d, o = {}) => noise(d, { ...o, bus: 'clay' }), ctone = (f, d, o = {}) => tone(f, d, { ...o, bus: 'clay' });
function hold(kind, level = 1) {
  if (!live()) return; const def = HOLD[kind]; if (!def) return;
  let h = holds[kind];
  if (!h) {
    const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    const rec = samples[kind + '_loop'];
    src.buffer = rec ? rec.bufs[0] : noiseBuf; src.loop = true; fl.type = rec ? 'allpass' : def.type; fl.Q.value = def.q; fl.frequency.value = def.f; g.gain.value = 0;
    src.connect(fl); fl.connect(g); g.connect(buses[rec ? rec.bus : 'clay'].g); src.start(0, Math.random());
    h = holds[kind] = { fl, g, until: 0, cur: 0, rec: !!rec };
  }
  const now = performance.now(); level = clamp(level);
  h.until = now + 140; h.cur = level;
  const t = ctx.currentTime;
  h.g.gain.setTargetAtTime((h.rec ? 0.6 : def.gain) * (0.25 + 0.75 * level), t, 0.045);
  if (!h.rec) h.fl.frequency.setTargetAtTime(def.f * (0.8 + 0.5 * level + def.wob * 0.15 * Math.sin(now / 90)), t, 0.05);
}
function housekeeping() {
  if (!ctx) return; const now = performance.now(), t = ctx.currentTime;
  for (const k in holds) { const h = holds[k]; if (h.cur > 0 && now > h.until) { h.cur = 0; h.g.gain.setTargetAtTime(0, t, 0.07); } }
  if (duckUntil && now > duckUntil) { duckUntil = 0; duckG.gain.setTargetAtTime(1, t, 0.35); } // music comes back
}
function duck(depth = 0.35, holdMs = 900) { // music dips under voices, alerts and big hits
  if (!ctx || !duckG) return; duckG.gain.setTargetAtTime(depth, ctx.currentTime, 0.03); duckUntil = performance.now() + holdMs;
}

export const sfx = {
  hold,
  // ---------- studio: hands, clay, tools ----------
  grab() { if (!live() || !ok('grab', 90)) return; if (csmp('grab')) return; cnoise(0.07, { f: 800, q: 0.8, gain: 0.12 }); ctone(210, 0.08, { gain: 0.08, glide: 140 }); }, // fingers pinch the clay
  release() { if (!live() || !ok('release', 90)) return; if (csmp('release')) return; cnoise(0.05, { f: 1400, q: 0.8, gain: 0.05 }); ctone(320, 0.05, { gain: 0.03, glide: 220 }); },
  squish(k = 1) { // a wet slap with a short suction and a couple of tiny bubbles
    if (!live() || !ok('squish', 150)) return; if (csmp('squish', { gain: 0.5 + 0.5 * k })) return;
    cnoise(0.26, { f: 520 + 160 * k, q: 1.0, gain: 0.24 * k, sweep: -330 }); ctone(100 + 30 * k, 0.2, { gain: 0.09 * k, glide: 55 });
    for (let i = 0; i < 2; i++) ctone(rnd(420, 900), 0.05, { gain: 0.025, delay: 0.05 + i * rnd(0.05, 0.1), glide: rnd(900, 1500) });
  },
  scrape() { if (!live() || !ok('scrape', 90)) return; if (csmp('scrape')) return; cnoise(0.12, { type: 'bandpass', f: 2400 + Math.random() * 1200, q: 1.4, gain: 0.12 }); },
  smooth() { if (!live() || !ok('smooth', 120)) return; if (csmp('smooth')) return; cnoise(0.18, { type: 'bandpass', f: 900, q: 0.7, gain: 0.1 }); },
  brush() { if (!live() || !ok('brush', 140)) return; if (csmp('brush')) return; cnoise(0.16, { type: 'highpass', f: 3500, q: 0.5, gain: 0.06 }); },
  stamp() { if (!live() || !ok('stamp', 110)) return; if (csmp('stamp')) return; cnoise(0.05, { type: 'bandpass', f: 1300, q: 1.2, gain: 0.1 }); ctone(rnd(260, 330), 0.07, { gain: 0.07, glide: 170 }); },
  place() { if (!live() || !ok('place', 120)) return; if (csmp('place')) return; ctone(rnd(480, 560), 0.06, { type: 'triangle', gain: 0.09, glide: 300 }); cnoise(0.08, { f: 700, q: 1, gain: 0.12 }); }, // a small ornament pressed on
  thud() { if (!live() || !ok('thud', 200)) return; if (smp('thud')) return; noise(0.25, { f: 180, gain: 0.35 }); tone(70, 0.25, { gain: 0.25, glide: 40 }); },
  // ---------- studio: interface ----------
  click() { if (!live() || !ok('click', 40)) return; if (smp('click', { bus: 'ui' })) return; tone(rnd(820, 900), 0.05, { type: 'triangle', gain: 0.06, bus: 'ui' }); },
  tool() { if (!live() || !ok('tool', 60)) return; if (smp('tool', { bus: 'ui' })) return; tone(520, 0.06, { type: 'triangle', gain: 0.07, bus: 'ui' }); tone(780, 0.07, { type: 'triangle', gain: 0.05, delay: 0.05, bus: 'ui' }); },
  pick(i = 0) { if (!live() || !ok('pick', 45)) return; if (smp('pick', { bus: 'ui', rate: Math.pow(1.06, i % 8) })) return; tink(1400 * Math.pow(1.06, i % 8), 0.05, 0, 'ui'); }, // colour / glaze chosen
  undo() { if (!live() || !ok('undo', 120)) return; if (smp('undo', { bus: 'ui' })) return; tone(620, 0.08, { type: 'triangle', gain: 0.06, glide: 420, bus: 'ui' }); tone(420, 0.1, { type: 'triangle', gain: 0.05, delay: 0.07, glide: 300, bus: 'ui' }); },
  camOn() { if (!live()) return; if (smp('camOn', { bus: 'ui' })) return; tone(660, 0.07, { type: 'triangle', gain: 0.07, bus: 'ui' }); tone(990, 0.1, { type: 'triangle', gain: 0.07, delay: 0.08, bus: 'ui' }); },
  handFound() { if (!live() || !ok('handF', 700)) return; if (smp('handFound', { bus: 'ui' })) return; tone(700, 0.07, { type: 'sine', gain: 0.045, glide: 940, bus: 'ui' }); },
  handLost() { if (!live() || !ok('handL', 900)) return; if (smp('handLost', { bus: 'ui' })) return; tone(560, 0.09, { type: 'sine', gain: 0.04, glide: 380, bus: 'ui' }); },
  chime(n = 0) { // step complete: a rising two-note bell
    if (!live()) return; if (smp('chime', { rate: Math.pow(1.06, n) })) return;
    const b = 523.25 * Math.pow(1.122, n);
    tone(b, 0.9, { gain: 0.14 }); tone(b * 1.5, 1.1, { gain: 0.1, delay: 0.12 }); tone(b * 2, 0.6, { gain: 0.04, delay: 0.12 }); tink(b * 4, 0.025, 0.1);
  },
  saved() { if (!live()) return; if (smp('saved')) return; sfx.chime(2); [0, 1, 2].forEach((i) => tink(2400 * Math.pow(1.26, i), 0.04, 0.35 + i * 0.12)); },
  star(i = 0) { if (!live()) return; if (smp('star', { rate: Math.pow(1.19, i) })) return; tone(1046 * Math.pow(1.19, i), 0.45, { type: 'triangle', gain: 0.1, delay: i * 0.16 }); },
  ding(k = 0.6) { if (!live()) return; if (smp('ding')) return; tink(1760, 0.09 * k + 0.04); tone(880, 0.9, { gain: 0.07 * k + 0.03 }); }, // a new piece lands in the cabinet
  tick() { if (!live() || !ok('tick', 50)) return; if (smp('tick', { bus: 'ui' })) return; tone(rnd(1500, 1700), 0.025, { type: 'triangle', gain: 0.025, bus: 'ui' }); }, // hover
  // ---------- kiln ----------
  kiln() { // roaring fire: deep rumble + flickering flame + crackling pops
    if (!live()) return; if (smp('kiln')) return;
    noise(3.2, { f: 140, q: 0.5, gain: 0.34, attack: 0.5 }); noise(3.2, { type: 'bandpass', f: 520, q: 0.6, gain: 0.1, attack: 0.8 });
    for (let i = 0; i < 16; i++) noise(0.03, { type: 'bandpass', f: rnd(1800, 4200), q: 2, gain: rnd(0.05, 0.14), delay: rnd(0.2, 3.0) });
  },
  // [v18] kiln: iron door slides shut (scrape + clang + latch), the fire crackles and roars, the door scrapes open with a rush of hot air
  kilnDoorClose() {
    if (!live()) return; if (smp('kilnDoorClose')) return;
    noise(0.55, { type: 'bandpass', f: 700, q: 0.9, gain: 0.16, attack: 0.15, sweep: 260 }); // iron sliding down its rails
    noise(0.1, { f: 300, gain: 0.45, attack: 0.002, delay: 0.55 }); tone(110, 0.5, { gain: 0.22, glide: 90, delay: 0.55 }); // clang
    tink(780, 0.12, 0.55); noise(0.05, { type: 'bandpass', f: 1500, q: 3, gain: 0.2, delay: 0.85 }); // latch click
  },
  kilnFire() {
    if (!live()) return; if (smp('kilnFire')) return;
    noise(2.4, { f: 120, q: 0.5, gain: 0.3, attack: 0.5 }); noise(2.4, { type: 'bandpass', f: 480, q: 0.6, gain: 0.1, attack: 0.6 }); // whoomph + roar
    noise(0.35, { type: 'bandpass', f: 900, q: 0.7, gain: 0.2, attack: 0.05, sweep: 300 }); // ignition
    for (let i = 0; i < 26; i++) noise(0.03, { type: 'bandpass', f: rnd(1600, 4600), q: 2, gain: rnd(0.04, 0.15), delay: rnd(0.1, 2.3) }); // crackles
  },
  kilnDoorOpen() {
    if (!live()) return; if (smp('kilnDoorOpen')) return;
    noise(0.05, { type: 'bandpass', f: 1500, q: 3, gain: 0.2 }); // latch released
    noise(0.6, { type: 'bandpass', f: 520, q: 0.9, gain: 0.16, attack: 0.12, sweep: 1000, delay: 0.15 }); // door scraping up
    noise(0.8, { f: 900, gain: 0.07, attack: 0.3, delay: 0.3 }); // hot air
  },
  kilnDone() { if (!live()) return; if (smp('kilnDone')) return; noise(0.3, { f: 200, gain: 0.3 }); tone(80, 0.3, { gain: 0.2, glide: 50 }); }, // the kiln door unlatches
  glazePings(n = 6) { if (!live()) return; if (smp('glazePings')) return; for (let i = 0; i < n; i++) tink(rnd(2200, 4600), rnd(0.02, 0.05), rnd(0, 3.2)); }, // glaze "singing" as it cools
  // ---------- timed challenge ----------
  tickdown(sec = 10) { // countdown: a clock tick, brighter and louder for the last three seconds
    if (!live()) return; const last3 = sec <= 3; if (smp('tickdown', { rate: last3 ? 1.25 : 1 })) return;
    tone(last3 ? 1500 : 1100, 0.04, { type: 'triangle', gain: last3 ? 0.14 : 0.08, bus: 'ui' }); noise(0.025, { type: 'bandpass', f: 2800, q: 2, gain: 0.07, bus: 'ui' });
  },
  gong() { // time is up: a low bronze gong that rings out
    if (!live()) return; duck(0.25, 3200); if (smp('gong')) return;
    [[110, 0.3, 4], [165, 0.17, 3.4], [232, 0.13, 3], [341, 0.08, 2.4], [507, 0.05, 1.8]].forEach(([f, g, d]) => tone(f * rnd(0.997, 1.003), d, { gain: g, attack: 0.01 }));
    noise(0.5, { f: 900, q: 0.7, gain: 0.12, attack: 0.002 });
  },
  lock() { if (!live()) return; if (smp('lock')) return; noise(0.12, { f: 260, gain: 0.3, attack: 0.003 }); tone(90, 0.18, { gain: 0.22, glide: 48 }); tink(1500, 0.05, 0.02); }, // the studio locks
  scoreTick(i = 0) { if (!live() || !ok('scoreTick', 35)) return; tone(380 + i * 26, 0.05, { type: 'square', gain: 0.045, bus: 'voice' }); }, // retro: score bars filling
  // [v19] auction: a bidding paddle flicks up, the bidder calls out, the price steps up a tier
  paddle() { if (!live() || !ok('paddle', 90)) return; if (smp('paddle')) return; noise(0.14, { type: 'bandpass', f: 1800, q: 0.8, gain: 0.12, attack: 0.02, sweep: 900 }); noise(0.04, { type: 'bandpass', f: 1100, q: 1.2, gain: 0.14, delay: 0.1 }); }, // card on a stick: swish + tap
  bid() { if (!live() || !ok('bid', 90)) return; if (smp('bid')) return; const f = 480 + Math.random() * 160; [0, 0.07].forEach((d, i) => tone(f * (i ? 1.26 : 1), 0.07, { type: 'square', gain: 0.05, delay: d, bus: 'voice' })); }, // a gibberish "bid!" call
  priceUp(tier = 1) { // the price board ticks up: a bright chime that rises with every tier (sparkle on the top tiers)
    if (!live() || !ok('priceUp', 90)) return; if (smp('priceUp', { rate: Math.pow(1.06, tier - 1) })) return;
    const f = 523 * Math.pow(2, (tier * 1.5) / 12);
    tone(f, 0.16, { type: 'square', gain: 0.05, bus: 'voice' }); tone(f * 2, 0.22, { type: 'triangle', gain: 0.06 });
    if (tier >= 8) tink(f * 2.4, 0.05, 0.05);
  },
  hammer() { // auction gavel: two wooden knocks
    if (!live()) return; duck(0.3, 900); if (smp('hammer')) return;
    [0, 0.17].forEach((d, i) => { noise(0.08, { type: 'bandpass', f: 1700, q: 1.2, gain: 0.3, attack: 0.002, delay: d }); tone(190 - i * 20, 0.12, { type: 'triangle', gain: 0.3, glide: 90, delay: d, attack: 0.002 }); });
  },
  sting(kind = 'ok') { // auction ending stings (retro 8-bit): sold high / sold / sold low / passed / no bids
    if (!live()) return; duck(0.3, 1800);
    const L = { high: [0, 4, 7, 12, 16], ok: [0, 4, 7, 12], low: [0, 3, 7], passed: [7, 3, 0], none: [3, 0, -4] }[kind] || [0, 4, 7];
    const down = kind === 'passed' || kind === 'none';
    L.forEach((s, i) => tone(392 * Math.pow(2, s / 12), down ? 0.28 : 0.2, { type: 'square', gain: 0.07, delay: i * (down ? 0.2 : 0.11), bus: 'voice' }));
  },
  fanfare() { if (!live()) return; duck(0.3, 1500); [0, 4, 7, 12].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.8, { gain: 0.12, delay: i * 0.14 })); },
  // ---------- retro pixel stories: Animalese-style gibberish talk, footsteps, door, etc. (square / triangle waves on the voice bus) ----------
  blip(voice = 'ast') {
    if (!live() || !ok('blip', 38)) return; duck(0.55, 450);
    const v = { ast: [560, 'square'], master: [300, 'square'], narr: [430, 'triangle'] }[voice] || [440, 'square'];
    tone(v[0] * (0.82 + Math.random() * 0.4), 0.06, { type: v[1], gain: 0.05, bus: 'voice' });
  },
  step() { if (!live() || !ok('step', 110)) return; noise(0.06, { f: 520, q: 0.7, gain: 0.14 }); tone(130, 0.07, { type: 'square', gain: 0.03, glide: 85, bus: 'voice' }); },
  jump() { if (!live()) return; tone(250, 0.2, { type: 'square', gain: 0.06, glide: 640, bus: 'voice' }); },
  surprise() { if (!live()) return; tone(880, 0.08, { type: 'square', gain: 0.05, bus: 'voice' }); tone(1180, 0.12, { type: 'square', gain: 0.05, delay: 0.09, bus: 'voice' }); },
  creak() { if (!live()) return; if (smp('creak')) return; tone(190, 0.45, { type: 'sawtooth', gain: 0.035, glide: 120 }); tone(205, 0.45, { type: 'sawtooth', gain: 0.02, glide: 130 }); },
  clatter() { if (!live()) return; if (smp('clatter')) return; for (let i = 0; i < 7; i++) { tone(500 + Math.random() * 1400, 0.05, { type: 'square', gain: 0.035, delay: i * 0.07 + Math.random() * 0.04, bus: 'voice' }); noise(0.05, { type: 'bandpass', f: 2000 + Math.random() * 2500, q: 1.5, gain: 0.07, delay: i * 0.07 }); } },
  whoosh() { if (!live() || !ok('whoosh', 300)) return; noise(0.5, { type: 'bandpass', f: 500, q: 0.8, gain: 0.12, attack: 0.2, sweep: 1800 }); },
  snore() { if (!live() || !ok('snore', 600)) return; tone(120, 0.5, { type: 'triangle', gain: 0.05, glide: 85, bus: 'voice' }); },
  bang() { if (!live()) return; duck(0.3, 900); if (smp('bang')) return; noise(0.45, { f: 260, q: 0.6, gain: 0.55, attack: 0.004 }); noise(0.12, { type: 'highpass', f: 2200, q: 0.6, gain: 0.3, attack: 0.002 }); tone(62, 0.4, { gain: 0.4, glide: 34 }); tone(150, 0.12, { type: 'square', gain: 0.06, glide: 70, bus: 'voice' }); },
  alert() { // one-minute alert: urgent two-tone bell, then a rising babble of gibberish "voice" blips
    if (!live()) return; duck(0.3, 2400);
    [0, 0.26, 0.52].forEach((d, i) => tone(i % 2 ? 784 : 1046, 0.22, { type: 'triangle', gain: 0.13, delay: d }));
    let t = 0.85; for (let i = 0; i < 11; i++) { tone((520 + i * 22) * (0.85 + Math.random() * 0.35), 0.075, { type: 'square', gain: 0.05, delay: t, bus: 'voice' }); t += 0.085 + (i % 4 === 3 ? 0.09 : 0); }
  },
  // ---------- music ----------
  ambientStart(kind = 'studio') { // gentle bed for pottery interaction: soft pad chords (Am - F - C - G) with sparse pentatonic plucks through a faint echo
    if (amb || !ensure()) return;
    const bus = ctx.createGain(), lp = ctx.createBiquadFilter(), dl = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain(), out = buses.music.g;
    bus.gain.setValueAtTime(0.0001, ctx.currentTime); bus.gain.linearRampToValueAtTime(0.34, ctx.currentTime + 4); // [v19] was 0.2
    lp.type = 'lowpass'; lp.frequency.value = 1500; dl.delayTime.value = 0.42; fb.gain.value = 0.38; wet.gain.value = 0.35;
    bus.connect(lp); lp.connect(out); lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(out);
    const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const cab = kind === 'cabinet'; // [v16] cabinet: brighter, slower music-box melody over a warm C - Am - F - G pad
    const chords = cab ? [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]] : [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], penta = cab ? [72, 74, 76, 79, 81, 84, 88] : [69, 72, 74, 76, 79, 81];
    let ci = 0;
    const voice = (freq, dur, g, type, att) => {
      const t = ctx.currentTime, o = ctx.createOscillator(), e = ctx.createGain();
      o.type = type; o.frequency.value = freq; e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + att); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(e); e.connect(bus); o.start(t); o.stop(t + dur + 0.1);
    };
    const pad = () => { for (const m of chords[ci++ % chords.length]) { voice(f(m) * 0.5, 8.5, 0.07, 'sine', 2.2); voice(f(m) * 0.5 * 1.004, 8.5, 0.05, 'triangle', 2.6); } };
    const pluck = () => { if (Math.random() < (cab ? 0.8 : 0.65)) voice(f(penta[Math.floor(Math.random() * penta.length)]), cab ? 1.8 : 2.4, cab ? 0.05 : 0.06, cab ? 'triangle' : 'sine', 0.01); };
    pad(); const t1 = setInterval(pad, cab ? 9000 : 8000), t2 = setInterval(pluck, cab ? 1500 : 2100);
    // [v23/v24] the last minute of the timed challenge: the same warm bed, just livelier. Same chords and tone as the calm music (no dissonance,
    // no heartbeat), but the chords change faster, the plucks come about twice as often and a soft broken-chord figure keeps a light, brisk pulse.
    const tense = () => {
      if (amb.isTense) return; amb.isTense = true;
      clearInterval(amb.t1); clearInterval(amb.t2);
      const t = ctx.currentTime;
      bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0.36, t + 2.5);
      lp.frequency.cancelScheduledValues(t); lp.frequency.setValueAtTime(lp.frequency.value, t); lp.frequency.linearRampToValueAtTime(2000, t + 2.5);
      let q = 0;
      const arp = () => { const ch = chords[Math.floor(q / 4) % chords.length]; voice(f(ch[q % 3] + 12), 0.9, 0.035, 'triangle', 0.01); q++; };
      pad(); amb.timers.push(setInterval(pad, 5200), setInterval(pluck, 950), setInterval(arp, 420)); // ~140 bpm eighths over a chord change every 5 s
    };
    amb = { bus, t1, t2, nodes: [lp, dl, fb, wet], timers: [], tense };
  },
  ambientTense() { if (amb && amb.tense) amb.tense(); },
  ambientStop() {
    if (!amb) return; const a = amb; amb = null; clearInterval(a.t1); clearInterval(a.t2); (a.timers || []).forEach(clearInterval);
    try { a.bus.gain.cancelScheduledValues(ctx.currentTime); a.bus.gain.setValueAtTime(a.bus.gain.value, ctx.currentTime); a.bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.5); } catch {}
    setTimeout(() => { try { a.bus.disconnect(); a.nodes.forEach((n) => n.disconnect()); } catch {} }, 4500);
  }
};
export const sfxNames = () => Object.keys(sfx).filter((k) => !['hold', 'ambientStart', 'ambientStop', 'ambientTense'].includes(k));
export async function sfxReady() { ensure(); try { await loading; } catch {} return Object.keys(samples); }
