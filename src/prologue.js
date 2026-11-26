// [v12] Prologue for Relaxed creation (about 15 s, skippable): the master potter is calmly preparing for an exhibition.
// The assistant reports that only one pedestal is still empty; the master walks into the hall and decides to make a piece worthy of it.
// Same technique as cutscene.js: a 256x144 canvas of rectangles, nearest-neighbour scaled; dialogue is DOM text (bilingual).
import { getLang } from './i18n.js';
import { sfx } from './sfx.js';
import { cutsceneWanted } from './cutscene.js';

const W = 256, H = 144, FLOOR = 100;
const C = { wall: '#d9b48c', wall2: '#c99f75', wood: '#8a5a38', wood2: '#6e4529', plank: '#a8714a', skin: '#f2c9a0', hair: '#3b2a22', robe: '#e8e0d0', robe2: '#c9bfa8', apron: '#b25a3c', ast: '#e05a4a', ast2: '#b03c32', hat: '#f4d35e', ink: '#23160f', clay: '#c98a62', glaze: '#5f8fa8', glaze2: '#d8a23c', win: '#9ec8e0', winL: '#d8eef8', hall: '#efe4cf', hall2: '#d9cbb0', floor: '#9a8a76', floor2: '#857562', ped: '#f7f1e4', ped2: '#d8cdb8', banner: '#b03c32', gold: '#f0c850', beam: '#fff3c4', cal: '#fff6e0' };
const T = {
  zh: { n0: '旁白', n1: '助手', n2: '陶艺大师', l0: '展览三天后开幕，大师的工坊里一片忙碌。', l1: '大师，展厅已经布置好了，只剩最后一个展台还空着。', l2: '那就做一件配得上它的作品。不急，慢慢来。', skip: '跳过 ▶' },
  en: { n0: 'Narrator', n1: 'Assistant', n2: 'Master Potter', l0: 'The exhibition opens in three days, and the master’s studio is busy.', l1: 'Master, the hall is ready. Only the last pedestal is still empty.', l2: 'Then I will make a piece worthy of it. No rush, I will take my time.', skip: 'Skip ▶' }
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function playPrologue() {
  if (!cutsceneWanted()) return Promise.resolve(false);
  const L = () => T[getLang() === 'zh' ? 'zh' : 'en'];
  const calm = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'cutscene';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Prologue');
  root.innerHTML = '<canvas class="cs-cv" width="' + W + '" height="' + H + '"></canvas><div class="cs-box" hidden><b class="cs-name"></b><p class="cs-line"></p></div><button type="button" class="cs-skip"></button>';
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const box = root.querySelector('.cs-box'), nameEl = root.querySelector('.cs-name'), lineEl = root.querySelector('.cs-line'), skipBtn = root.querySelector('.cs-skip');
  skipBtn.textContent = L().skip;
  return new Promise((resolve) => {
    let done = false, raf = 0, t0 = performance.now(), endAt = -1;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const ease = (a) => a * a * (3 - 2 * a);
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const seg = (t, a, b) => clamp((t - a) / (b - a));

    function pot(x, y, s, c, c2) { R(x + 2 * s, y, 4 * s, s, c2); R(x + s, y + s, 6 * s, 2 * s, c); R(x, y + 3 * s, 8 * s, 4 * s, c); R(x + s, y + 7 * s, 6 * s, 2 * s, c); R(x + 2 * s, y + 9 * s, 4 * s, s, c2); R(x + 2 * s, y + 4 * s, 4 * s, s, c2); }
    function studio(t) {
      R(0, 0, W, FLOOR, C.wall); for (let x = 0; x < W; x += 16) R(x, 0, 1, FLOOR, C.wall2);
      R(0, FLOOR, W, H - FLOOR, C.wood); for (let y = FLOOR + 6; y < H; y += 8) R(0, y, W, 1, C.wood2);
      R(0, FLOOR - 2, W, 3, C.wood2);
      R(104, 14, 46, 34, C.wood2); R(107, 17, 40, 28, C.win); R(107, 17, 40, 4, C.winL); R(126, 17, 2, 28, C.wood2); R(107, 30, 40, 2, C.wood2);
      // shelves full of finished pieces
      R(160, 36, 90, 3, C.wood2); R(160, 62, 90, 3, C.wood2);
      pot(164, 26, 1, C.clay, C.wood2); pot(182, 24, 1, C.robe2, C.wood2); pot(200, 27, 1, C.glaze, C.wood2); pot(220, 25, 1, C.glaze2, C.wood2); pot(236, 28, 1, C.clay, C.wood2);
      pot(168, 52, 1, C.glaze2, C.wood2); pot(190, 50, 1, C.clay, C.wood2); pot(214, 52, 1, C.robe2, C.wood2); pot(234, 51, 1, C.glaze, C.wood2);
      // calendar with a circled date
      R(50, 20, 28, 32, C.cal); R(50, 20, 28, 6, C.banner);
      for (let i = 0; i < 12; i++) R(53 + (i % 4) * 6, 30 + Math.floor(i / 4) * 6, 4, 3, C.robe2);
      R(65, 36, 6, 1, C.banner); R(65, 40, 6, 1, C.banner); R(65, 36, 1, 5, C.banner); R(70, 36, 1, 5, C.banner);
      // wheel + bench
      R(20, 90, 56, 6, C.plank); R(24, 96, 5, 4, C.wood2); R(67, 96, 5, 4, C.wood2);
      R(100, 84, 36, 5, C.wood2); R(114, 89, 8, 11, C.wood2);
      const spin = calm ? 0 : Math.floor(t * 8) % 2;
      R(104, 79, 28, 5, spin ? '#a89888' : '#b8a898');
      const k = (Math.sin(t * 2) + 1) / 2; // clay rises and falls
      R(112, 70 - Math.round(k * 6), 12, 9 + Math.round(k * 6), C.clay);
    }
    function hall() {
      R(0, 0, W, FLOOR, C.hall); for (let x = 0; x < W; x += 32) R(x, 0, 1, FLOOR, C.hall2);
      R(0, FLOOR, W, H - FLOOR, C.floor); for (let y = FLOOR + 8; y < H; y += 10) R(0, y, W, 1, C.floor2);
      R(0, FLOOR - 2, W, 3, C.hall2);
      // banner
      R(66, 6, 124, 18, C.banner); R(66, 22, 124, 2, C.wood2);
      for (let i = 0; i < 9; i++) R(76 + i * 13, 12, 6, 6, C.gold);
      R(72, 6, 2, 18, C.gold); R(182, 6, 2, 18, C.gold);
    }
    function pedestal(x, h, c, empty) { R(x, FLOOR - h, 26, 5, C.ped); R(x + 3, FLOOR - h + 5, 20, h - 5, C.ped2); R(x + 1, FLOOR - h + 5, 2, h - 5, C.ped); if (!empty) pot(x + 9, FLOOR - h - 12, 1, c[0], c[1]); }
    function beam(x, a) { // spotlight over the last empty pedestal
      g.save(); g.globalAlpha = a; g.fillStyle = C.beam;
      g.beginPath(); g.moveTo(x + 11, 0); g.lineTo(x + 15, 0); g.lineTo(x + 30, FLOOR - 24); g.lineTo(x - 4, FLOOR - 24); g.closePath(); g.fill(); g.restore();
    }
    function person(x, y, ast, frame, moving) {
      const bob = moving && frame ? 1 : 0, sw = moving ? (frame ? 3 : -3) : 0;
      if (ast) { R(x + 2, y + 8 + bob, 12, 14, C.ast); R(x + 2, y + 18 + bob, 12, 4, C.ast2); R(x + 3, y + bob, 10, 9, C.skin); R(x + 2, y - 3 + bob, 12, 4, C.ink); R(x + 3, y - 5 + bob, 10, 3, C.ink); R(x + 9, y + 4 + bob, 2, 2, C.ink); R(x + 13, y + 10 + bob, 3, 8, C.ast); R(x + 3, y + 22 + bob, 4, 8, C.ink); R(x + 9, y + 22 + bob, 4, 8, C.ink); return; }
      R(x + 3, y + 8 + bob, 12, 14, C.robe); R(x + 3, y + 16 + bob, 12, 6, C.apron); R(x + 4, y + bob, 10, 9, C.skin); R(x + 3, y - 2 + bob, 12, 4, C.hair); R(x + 12, y + 4 + bob, 2, 2, C.ink); R(x + 4, y - 4 + bob, 10, 3, C.hat);
      R(x + sw, y + 10 + bob, 3, 9, C.robe); R(x + 15 - sw, y + 10 + bob, 3, 9, C.robe); R(x + sw, y + 18 + bob, 3, 3, C.skin); R(x + 15 - sw, y + 18 + bob, 3, 3, C.skin);
      R(x + 4 + sw / 3, y + 22 + bob, 4, 8, C.wood2); R(x + 10 - sw / 3, y + 22 + bob, 4, 8, C.wood2);
    }
    let spoken = { key: '', n: 0 };
    const once = new Set(); const fire = (k, fn) => { if (!once.has(k)) { once.add(k); try { fn(); } catch {} } };
    function say(who, text, t, from, voice) { const shown = Math.floor((t - from) * 28);
      const key = from + text; if (spoken.key !== key) spoken = { key, n: 0 };
      const upto = Math.min(Math.max(0, shown), text.length);
      for (let k = spoken.n; k < upto; k++) if (k % 2 === 0 && /[^\s，。,.!?！？’'…]/.test(text[k])) sfx.blip(voice);
      spoken.n = upto; box.hidden = false; nameEl.textContent = who; lineEl.textContent = text.slice(0, Math.max(0, shown)); }
    const wipe = (p, col) => { g.fillStyle = col; const th = p * 16; for (let by = 0; by < H; by += 4) for (let bx = 0; bx < W; bx += 4) if (BAYER[((by / 4) % 4) * 4 + ((bx / 4) % 4)] < th) g.fillRect(bx, by, 4, 4); };

    function frame(now) {
      const t = (now - t0) / 1000, lang = L();
      g.clearRect(0, 0, W, H);
      const step = Math.floor(t * 8) % 2;
      // sounds: assistant's and master's footsteps, scene wipes, sparkle
      if (t > 3.0 && t < 4.6 && step !== frame.ls) { frame.ls = step; sfx.step(); }
      if (t > 8.6 && t < 10.8 && step !== frame.ms) { frame.ms = step; sfx.step(); }
      if (t > 7.3) fire('w1', () => sfx.whoosh());
      if (t > 13.9) fire('w2', () => sfx.whoosh());
      if (t > 10.9) fire('spark', () => sfx.star(1));
      if (t < 8.0) {
        studio(t);
        person(40, 70, false, 0, false); // master at the wheel side, working
        // arms toward the clay
        R(56, 80, 46, 3, C.skin);
        const ax = ease(seg(t, 3.0, 4.6)) * 34; // assistant walks in from the left, stops beside the bench
        if (t > 3.0) person(-20 + ax, 70, true, step, t < 4.6);
        if (t >= 0.4 && t < 3.6) say(lang.n0, lang.l0, t, 0.5, 'narr');
        else if (t >= 4.7 && t < 8.0) say(lang.n1, lang.l1, t, 4.8, 'ast');
        else box.hidden = true;
        if (t > 7.3) wipe(seg(t, 7.3, 8.0) , C.ink);
      } else if (t < 14.6) {
        hall();
        const lit = seg(t, 8.4, 9.4);
        pedestal(30, 24, [C.glaze, C.wood2]); pedestal(58, 30, [C.glaze2, C.wood2]); pedestal(150, 28, [C.clay, C.wood2]); pedestal(194, 22, [C.robe2, C.wood2]);
        pedestal(118, 26, [], true); beam(118, lit * 0.45);
        // master walks in from the left and stops by the empty pedestal
        const k = ease(seg(t, 8.6, 10.8)), x = -20 + k * 112, moving = k < 1;
        person(x, 70, false, step, moving);
        // a small pot sparkle above the empty pedestal once he arrives
        if (t > 10.9 && !calm && Math.floor(t * 4) % 2) { R(128, 58, 2, 2, C.gold); R(132, 52, 2, 2, C.gold); R(124, 54, 2, 2, C.beam); }
        if (t >= 11.0 && t < 14.4) say(lang.n2, lang.l2, t, 11.1, 'master'); else box.hidden = true;
        if (t < 8.5) wipe(1 - seg(t, 8.0, 8.5), C.ink);
        if (t > 13.9) wipe(seg(t, 13.9, 14.6), C.ink);
      } else { return finish(); }
      if (endAt > 0) {
        const p = clamp((now - endAt) / 600); wipe(p, C.ink); root.style.opacity = String(1 - clamp((p - 0.7) / 0.3));
        if (p >= 1) return finish();
      }
      raf = requestAnimationFrame(frame);
    }
    function finish() { if (done) return; done = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); root.remove(); resolve(true); }
    function skip() { if (endAt < 0) endAt = performance.now(); try { sfx.click(); } catch {} }
    const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); skip(); } };
    addEventListener('keydown', onKey, true);
    skipBtn.addEventListener('click', skip);
    raf = requestAnimationFrame((n) => { t0 = n; frame(n); });
  });
}
