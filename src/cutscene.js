// [v10] Opening pixel-art cutscene (about 14.5 s, skippable): the assistant knocks and pushes the door open (creak, then BANG against the wall); only then
// does the procrastinating master potter jump off the sofa in surprise, the assistant speaks, and the master scrambles for tools and promises "ten more minutes". Drawn live on a 256x144 canvas with rectangles only (no image files),
// scaled up with nearest-neighbour. Dialogue is DOM text (crisp, bilingual). Returns a promise that resolves when it ends or is skipped.
import { getLang } from './i18n.js';
import { sfx } from './sfx.js';

const W = 256, H = 144, FLOOR = 100;
const C = { wall: '#d9b48c', wall2: '#c99f75', wood: '#8a5a38', wood2: '#6e4529', plank: '#a8714a', door: '#7a4a2c', door2: '#5c3720', knob: '#f0c850', sofa: '#4f7f8a', sofa2: '#3d6670', sofa3: '#6a9ba6', skin: '#f2c9a0', hair: '#3b2a22', robe: '#e8e0d0', robe2: '#c9bfa8', apron: '#b25a3c', ast: '#e05a4a', ast2: '#b03c32', hat: '#f4d35e', ink: '#23160f', white: '#fff6e0', clay: '#c98a62', tool: '#8f8f9a', win: '#9ec8e0', winL: '#d8eef8' };
const T = {
  zh: { name1: '助手', name2: '陶艺大师', knock: '咚咚咚！', l1: '陶艺大师！拍卖会马上开始了，您的作品完成了吗？', l2: '快好了！再给我八分钟！', skip: '跳过 ▶' },
  en: { name1: 'Assistant', name2: 'Master Potter', knock: 'KNOCK KNOCK!', l1: 'Master Potter! The auction is about to begin. Have you finished your work?', l2: 'Almost done! Give me eight more minutes!', skip: 'Skip ▶' }
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function cutsceneWanted() {
  try {
    if (new URLSearchParams(location.search).has('nocut')) return false;
    if (localStorage.getItem('gp-cut-off') === '1') return false;
  } catch {}
  return true;
}

export function playCutscene() {
  if (!cutsceneWanted()) return Promise.resolve(false);
  const L = () => T[getLang() === 'zh' ? 'zh' : 'en'];
  const calm = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'cutscene';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Opening scene');
  root.innerHTML = '<canvas class="cs-cv" width="' + W + '" height="' + H + '"></canvas><div class="cs-box" hidden><b class="cs-name"></b><p class="cs-line"></p></div><div class="cs-knock" hidden></div><button type="button" class="cs-skip"></button>';
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const box = root.querySelector('.cs-box'), nameEl = root.querySelector('.cs-name'), lineEl = root.querySelector('.cs-line'), knockEl = root.querySelector('.cs-knock'), skipBtn = root.querySelector('.cs-skip');
  skipBtn.textContent = L().skip;
  return new Promise((resolve) => {
    let done = false, raf = 0, t0 = performance.now(), endAt = -1, lastKnock = -1;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const ease = (a) => a * a * (3 - 2 * a);
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const seg = (t, a, b) => clamp((t - a) / (b - a));

    function room(t, doorOpen) {
      R(0, 0, W, FLOOR, C.wall);
      for (let x = 0; x < W; x += 16) R(x, 0, 1, FLOOR, C.wall2);
      R(0, FLOOR, W, H - FLOOR, C.wood);
      for (let y = FLOOR + 6; y < H; y += 8) R(0, y, W, 1, C.wood2);
      for (let x = 0; x < W; x += 24) R(x + ((y2(x)) % 7), FLOOR, 1, H - FLOOR, C.wood2);
      R(0, FLOOR - 2, W, 3, C.wood2);
      // window
      R(104, 14, 46, 34, C.wood2); R(107, 17, 40, 28, C.win); R(107, 17, 40, 4, C.winL); R(126, 17, 2, 28, C.wood2); R(107, 30, 40, 2, C.wood2);
      // shelf with pots
      R(160, 36, 50, 3, C.wood2); R(166, 24, 9, 12, C.clay); R(168, 22, 5, 2, C.clay); R(184, 28, 11, 8, C.robe2); R(198, 26, 8, 10, C.clay);
      // door
      R(6, 28, 38, 74, C.wood2);
      if (doorOpen > 0) { R(9, 31, 32, 71, '#2d2018'); const w = Math.round(32 - doorOpen * 24); R(9, 31, w, 71, C.door); R(9, 31, w, 3, C.door2); R(9 + w - 4, 66, 3, 3, C.knob); }
      else { R(9, 31, 32, 71, C.door); R(9, 31, 32, 3, C.door2); R(12, 38, 12, 26, C.door2); R(26, 38, 12, 26, C.door2); R(34, 66, 4, 4, C.knob); }
    }
    const y2 = (x) => (x * 37) % 11;
    function sofa() {
      R(66, 66, 70, 10, C.sofa2); R(66, 74, 70, 20, C.sofa); R(60, 70, 10, 26, C.sofa3); R(132, 70, 10, 26, C.sofa3);
      R(66, 74, 70, 3, C.sofa3); R(68, 94, 4, 6, C.wood2); R(130, 94, 4, 6, C.wood2);
    }
    function bench(shake) {
      R(164, 72, 86, 6, C.plank); R(164, 78, 86, 2, C.wood2); R(168, 80, 5, 20, C.wood); R(241, 80, 5, 20, C.wood); R(168, 92, 78, 3, C.wood2);
      if (!shake) { R(176, 66, 10, 6, C.clay); R(178, 62, 6, 4, C.clay); R(196, 69, 14, 3, C.tool); R(214, 67, 3, 5, C.tool); R(222, 68, 12, 4, C.apron); R(238, 64, 8, 8, C.robe2); }
    }
    // a simple potter: facing right; pose 'lie' | 'stand' | 'walk' (frame) | 'arms' (arms up)
    function potter(x, y, pose, frame, wob) {
      if (pose === 'lie') {
        R(x, y + 8, 30, 8, C.robe); R(x, y + 14, 30, 2, C.robe2); R(x + 28, y + 6, 10, 10, C.skin); R(x + 28, y + 4, 10, 4, C.hair); R(x + 34, y + 10, 2, 2, C.ink); R(x + 2, y + 16, 12, 3, C.skin); R(x + 14, y + 16, 12, 3, C.skin);
        return;
      }
      const bob = wob || 0;
      R(x + 3, y + 8 + bob, 12, 14, C.robe); R(x + 3, y + 16 + bob, 12, 6, C.apron); R(x + 3, y + 20 + bob, 12, 2, C.robe2);
      R(x + 4, y + bob, 10, 9, C.skin); R(x + 3, y - 2 + bob, 12, 4, C.hair); R(x + 12, y + 4 + bob, 2, 2, C.ink); R(x + 4, y - 4 + bob, 10, 3, C.hat);
      if (pose === 'arms') { R(x, y + 2 + bob, 3, 10, C.robe); R(x + 15, y + 2 + bob, 3, 10, C.robe); R(x, y + bob, 3, 3, C.skin); R(x + 15, y + bob, 3, 3, C.skin); }
      else { const sw = pose === 'walk' ? (frame ? 3 : -3) : 0; R(x + sw, y + 10 + bob, 3, 9, C.robe); R(x + 15 - sw, y + 10 + bob, 3, 9, C.robe); R(x + sw, y + 18 + bob, 3, 3, C.skin); R(x + 15 - sw, y + 18 + bob, 3, 3, C.skin); }
      const lf = pose === 'walk' ? (frame ? 2 : -2) : 0;
      R(x + 4 + lf, y + 22 + bob, 4, 8 - Math.abs(lf) * 0 , C.wood2); R(x + 10 - lf, y + 22 + bob, 4, 8, C.wood2);
    }
    function assistant(x, y, bob) {
      R(x + 2, y + 8 + bob, 12, 14, C.ast); R(x + 2, y + 18 + bob, 12, 4, C.ast2); R(x + 3, y + bob, 10, 9, C.skin); R(x + 2, y - 3 + bob, 12, 4, C.ink); R(x + 3, y - 5 + bob, 10, 3, C.ink);
      R(x + 5, y + 4 + bob, 2, 2, C.ink); R(x + 9, y + 4 + bob, 2, 2, C.ink); R(x + 6, y + 7 + bob, 4, 1, C.ink);
      R(x + 13, y + 10 + bob, 3, 8, C.ast); R(x + 3, y + 22 + bob, 4, 8, C.ink); R(x + 9, y + 22 + bob, 4, 8, C.ink);
    }
    function zzz(t, x, y) { const k = Math.floor(t * 1.5) % 3; for (let i = 0; i <= k; i++) { const s = 2 + i; R(x + i * 7, y - i * 9, s * 2, 1, C.ink); R(x + i * 7 + s, y - i * 9 + 1, 1, s, C.ink); R(x + i * 7, y - i * 9 + s, s * 2, 1, C.ink); } }
    let spoken = { key: '', n: 0 };
    const once = new Set(); const fire = (k, fn) => { if (!once.has(k)) { once.add(k); try { fn(); } catch {} } };
    function say(who, text, t, from, voice) { // typewriter + gibberish talk blips (every second letter, never readable speech)
      const shown = Math.floor((t - from) * 28);
      const key = from + text; if (spoken.key !== key) spoken = { key, n: 0 };
      const upto = Math.min(Math.max(0, shown), text.length);
      for (let k = spoken.n; k < upto; k++) if (k % 2 === 0 && /[^\s，。,.!?！？’'…]/.test(text[k])) sfx.blip(voice);
      spoken.n = upto;
      box.hidden = false; nameEl.textContent = who; lineEl.textContent = text.slice(0, Math.max(0, shown));
    }
    const debris = [];
    for (let i = 0; i < 9; i++) debris.push({ a: Math.random() * 6.28, v: 30 + Math.random() * 50, c: [C.tool, C.clay, C.apron, C.robe2, C.hat][i % 5], w: 3 + (i % 3) * 2 });

    function frame(now) {
      const t = (now - t0) / 1000;
      const lang = L();
      g.clearRect(0, 0, W, H);
      g.save(); if (!calm && t > 3.5 && t < 3.8) g.translate(Math.floor(t * 40) % 2 ? 2 : -2, 0); // the wall-hit shakes the picture
      const step = Math.floor(t * 10) % 2;
      const doorOpen = ease(seg(t, 3.0, 3.5));
      // scene
      const sh = !calm && t > 1.3 && t < 3.0 ? (Math.floor(t * 8) % 2 ? 1 : -1) : 0; // door shake while knocking
      g.save(); g.translate(0, 0); room(t, doorOpen); g.restore();
      if (sh) { R(9 + sh, 31, 32, 71, C.door); R(9 + sh, 31, 32, 3, C.door2); R(12 + sh, 38, 12, 26, C.door2); R(26 + sh, 38, 12, 26, C.door2); R(34 + sh, 66, 4, 4, C.knob); }
      if (t > 3.5 && t < 4.0 && !calm) { const k = (t - 3.5) / 0.5; for (let i = 0; i < 6; i++) R(8 + i * 5 - k * 6, 40 + k * 20 - (i % 3) * 5, 3, 3, C.white); } // dust shaken off the wall
      sofa(); bench(t > 10.3 && t < 12.5);
      // potter
      const jump = seg(t, 3.7, 4.4), run = seg(t, 9.0, 11.0); // [v13] the jump follows the door bang; the talk comes after it
      if (t < 3.7) {
        const twitch = t > 2.7 && t < 3.0 ? -1 : 0;
        potter(72, 58 + twitch, 'lie', 0, 0); if (t < 3.5) zzz(t, 104, 58);
      } else if (t < 4.4) {
        const p = jump, up = Math.sin(p * Math.PI) * 22;
        potter(94 + p * 8, 70 - up, 'arms', 0, 0);
        R(104, 40 - up * 0.3, 3, 9, C.ink); R(104, 51 - up * 0.3, 3, 3, C.ink); // "!"
      } else if (t < 9.0) {
        potter(102, 70, 'stand', 0, Math.floor(t * 3) % 2 ? 0 : 1); // stands at the sofa while the assistant talks
      } else {
        const x = 102 + ease(run) * 66, step = Math.floor(t * 10) % 2, moving = run < 1;
        potter(x, 70, moving ? 'walk' : 'arms', step, moving ? (step ? -1 : 0) : 0);
        if (t > 10.3 && t < 12.7) { // tools fly everywhere
          const k = seg(t, 10.3, 11.5);
          for (const d of debris) { const dx = Math.cos(d.a) * d.v * k, dy = Math.sin(d.a) * d.v * k * 0.6 - 30 * Math.sin(k * Math.PI) + 40 * k * k; R(176 + dx, 66 + dy, d.w, d.w, d.c); }
        }
      }
      // assistant at the door
      if (t > 3.2) assistant(14 + (1 - doorOpen) * 0, 70, 0);
      // knock text
      const kn = t > 1.3 && t < 3.0;
      knockEl.hidden = !kn; if (kn) { knockEl.textContent = lang.knock; knockEl.style.transform = 'scale(' + (Math.floor(t * 8) % 2 ? 1 : 1.12) + ')'; }
      if (kn) { const k = Math.floor((t - 1.3) / 0.45); if (k !== lastKnock) { lastKnock = k; try { sfx.thud(); } catch {} } }
      // sounds: door creak, snoring, surprise + jump, footsteps, clatter, assistant steps in
      if (t > 2.95) fire('creak', () => sfx.creak()); // door starts to swing open
      if (t > 3.5) fire('bang', () => sfx.bang()); // ...and hits the wall
      if (t > 3.4 && t < 3.6) fire('ast-step', () => sfx.step());
      if (t > 0.4 && t < 1.3) { const sn = Math.floor(t / 0.45); if (sn !== frame.sn) { frame.sn = sn; sfx.snore(); } }
      if (t > 3.7) fire('jump', () => { sfx.jump(); sfx.surprise(); }); // only after the bang does the master jump
      if (t > 9.0 && t < 11.0 && step !== frame.ls) { frame.ls = step; sfx.step(); }
      if (t > 10.3) fire('clatter', () => sfx.clatter());
      // dialogue
      if (t >= 4.7 && t < 9.0) say(lang.name1, lang.l1, t, 4.8, 'ast');
      else if (t >= 11.3 && t < 14.0) say(lang.name2, lang.l2, t, 11.4, 'master');
      else box.hidden = true;
      box.classList.toggle('right', t >= 11.3);
      g.restore();
      // dither-out
      if (t > 14.0 || endAt > 0) {
        const p = clamp(((endAt > 0 ? now - endAt : (t - 14.0) * 1000)) / 700);
        const th = p * 16;
        g.fillStyle = C.ink;
        for (let by = 0; by < H; by += 4) for (let bx = 0; bx < W; bx += 4) if (BAYER[((by / 4) % 4) * 4 + ((bx / 4) % 4)] < th) g.fillRect(bx, by, 4, 4);
        root.style.opacity = String(1 - clamp((p - 0.7) / 0.3));
        if (p >= 1) return finish();
      }
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      if (done) return; done = true; cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey, true); root.remove(); resolve(true);
    }
    function skip() { if (endAt < 0) endAt = performance.now(); try { sfx.click(); } catch {} }
    const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); skip(); } };
    addEventListener('keydown', onKey, true);
    skipBtn.addEventListener('click', skip);
    raf = requestAnimationFrame((n) => { t0 = n; frame(n); });
  });
}
