// [v10] Session UI: the Timed / Relaxed chooser, the HUD (countdown or score preview), the assistant's one-minute reminder and the pixel auction endings.
import { getLang, onLang } from './i18n.js';
import { sfx } from './sfx.js';
import { fmtTime } from './session.js';

const T = {
  zh: {
    chooseTitle: '选择你的创作方式', chooseSub: '进入工坊后，可随时在“古法制瓷 / 自由创作”之间切换。',
    timed: '限时挑战', timedD: '8 分钟倒计时，拍卖会等着你的作品。时间到后按成形、釉面和工序评分，迎来不同的拍卖结局。',
    relaxed: '轻松创作', relaxedD: '没有倒计时，也没有拍卖结局。只管慢慢做，随时查看评分预览。',
    left: '剩余', preview: '评分预览', shape: '成形', glaze: '釉面', process: '工序', total: '总分',
    remind: '陶艺大师！拍卖会马上开始了！', who: '助手',
    timeUp: '时间到！', lock: '工坊已封锁，拍卖开始……',
    save: '保存到陶柜', retry: '再来一次', skipEnd: '跳过',
    price: '成交价', sold: '成交！', passed: '流拍', none: '无人出价',
    'e.record': '破纪录的拍卖！', 'e.good': '竞价激烈，顺利成交', 'e.fair': '成交，价格平平', 'e.low': '勉强有人出价', 'e.poor': '几乎流拍', 'e.empty': '拍台上空空如也',
    'd.record': '全场起立鼓掌，拍卖师连敲三锤。这件作品将被载入拍卖行的成交纪录。', 'd.good': '几位藏家连连举牌，最终高价成交。', 'd.fair': '有人举牌，价格不高，但作品找到了新主人。', 'd.low': '只有一位客人举了牌，成交价让助手叹了口气。', 'd.poor': '台下一片沉默，拍卖师无奈地敲下了锤子。', 'd.empty': '陶艺大师还没做出作品，助手只好抱着空台座道歉。'
  },
  en: {
    chooseTitle: 'Choose how you want to create', chooseSub: 'Inside the studio you can switch between Ancient Craft and Free Creation at any time.',
    timed: 'Timed Challenge', timedD: 'An 8-minute countdown; the auction is waiting. When time is up your pot is scored on shape, glaze and process, and the auction ends differently.',
    relaxed: 'Relaxed Creation', relaxedD: 'No countdown and no auction ending. Take your time and check the score preview whenever you like.',
    left: 'Time left', preview: 'Score preview', shape: 'Shape', glaze: 'Glaze', process: 'Process', total: 'Total',
    remind: 'Master Potter! The auction is about to begin!', who: 'Assistant',
    timeUp: 'Time is up!', lock: 'The workshop is locked. The auction begins...',
    save: 'Save to the cabinet', retry: 'Try again', skipEnd: 'Skip',
    price: 'Hammer price', sold: 'SOLD!', passed: 'PASSED', none: 'NO BIDS',
    'e.record': 'A record-breaking auction!', 'e.good': 'Fierce bidding, a good sale', 'e.fair': 'Sold, at an average price', 'e.low': 'One reluctant bid', 'e.poor': 'Almost unsold', 'e.empty': 'An empty table',
    'd.record': 'The whole hall stands and applauds. Three strikes of the gavel: a new record for the house.', 'd.good': 'Several collectors keep raising their paddles. Sold at a fine price.', 'd.fair': 'A few paddles go up. Not a high price, but the pot has found a new home.', 'd.low': 'Only one guest bids. The hammer price makes the assistant sigh.', 'd.poor': 'Silence in the hall. The auctioneer sadly brings the gavel down.', 'd.empty': 'The master has made nothing yet. The assistant apologises to an empty pedestal.'
  }
};
const L = () => T[getLang() === 'zh' ? 'zh' : 'en'];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---- chooser ----
export function chooseSession() {
  try { const a = localStorage.getItem('gp-sess-auto'); if (a === 'timed' || a === 'relaxed') return Promise.resolve(a); } catch {} // developer / test override
  return new Promise((resolve) => {
    const root = el('div', 'sess-choose');
    const render = () => {
      const l = L();
      root.innerHTML = `<div class="sc-card"><h1>${l.chooseTitle}</h1><p>${l.chooseSub}</p><div class="sc-opts">
        <button type="button" class="sc-opt" data-m="timed"><b>⏱ ${l.timed}</b><span>${l.timedD}</span></button>
        <button type="button" class="sc-opt" data-m="relaxed"><b>☕ ${l.relaxed}</b><span>${l.relaxedD}</span></button></div></div>`;
      root.querySelectorAll('.sc-opt').forEach((b) => b.addEventListener('click', () => { try { sfx.click(); } catch {} root.remove(); resolve(b.dataset.m); }));
    };
    render(); onLang(() => { if (root.isConnected) render(); }); // switching language while the chooser is open
    document.body.appendChild(root);
    const first = root.querySelector('.sc-opt'); first && first.focus();
  });
}

// ---- HUD ----
export function createHud(kind, getScore) {
  const host = document.querySelector('.topbar'), anchor = document.querySelector('#btnView');
  const chip = el('div', 'sess-chip ' + kind);
  host.insertBefore(chip, anchor);
  let pop = null, timer = 0;
  const bars = (s) => `<div class="sp-row"><span>${L().shape}</span><i><u style="width:${s.shape}%"></u></i><b>${s.shape}</b></div><div class="sp-row"><span>${L().glaze}</span><i><u style="width:${s.glaze}%"></u></i><b>${s.glaze}</b></div><div class="sp-row"><span>${L().process}</span><i><u style="width:${s.process}%"></u></i><b>${s.process}</b></div>`;
  const hud = {
    chip,
    setTime(sec) { chip.textContent = '⏱ ' + fmtTime(sec); chip.classList.toggle('warn', sec <= 60); },
    startPreview() {
      const paint = () => { const s = getScore(); chip.innerHTML = `<button type="button" class="sp-btn">${L().preview}: <b>${s.total}</b> ▾</button>`; chip.querySelector('.sp-btn').onclick = toggle; if (pop) pop.innerHTML = `<h4>${L().total} ${s.total}</h4>${bars(s)}`; };
      const toggle = () => { if (pop) { pop.remove(); pop = null; } else { pop = el('div', 'sess-pop panel'); chip.appendChild(pop); paint(); } };
      paint(); timer = setInterval(paint, 1500); onLang(() => { if (chip.isConnected && timer) paint(); });
    },
    stop() { clearInterval(timer); }
  };
  return hud;
}

// ---- the assistant's reminder (pixel bubble) ----
function drawAssistant(cv) {
  const g = cv.getContext('2d'), R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  g.clearRect(0, 0, cv.width, cv.height);
  const x = 2, y = 4;
  R(x + 2, y + 8, 12, 14, '#e05a4a'); R(x + 2, y + 18, 12, 4, '#b03c32'); R(x + 3, y, 10, 9, '#f2c9a0'); R(x + 2, y - 3, 12, 4, '#23160f'); R(x + 3, y - 5, 10, 3, '#23160f');
  R(x + 5, y + 4, 2, 2, '#23160f'); R(x + 9, y + 4, 2, 2, '#23160f'); R(x + 6, y + 7, 4, 2, '#23160f'); R(x + 13, y + 6, 3, 8, '#e05a4a'); R(x + 3, y + 22, 4, 6, '#23160f'); R(x + 9, y + 22, 4, 6, '#23160f');
}
export function showReminder() {
  const box = el('div', 'sess-remind'); box.innerHTML = `<canvas width="20" height="34"></canvas><div><b>${L().who}</b><p>${L().remind}</p></div>`;
  drawAssistant(box.querySelector('canvas'));
  document.body.appendChild(box); try { sfx.alert(); } catch {}
  onLang(() => { if (box.isConnected) { box.querySelector('b').textContent = L().who; box.querySelector('p').textContent = L().remind; } });
  setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 500); }, 6500);
}
export function showTimeUp() {
  const b = el('div', 'sess-timeup', `<b>${L().timeUp}</b><span>${L().lock}</span>`);
  onLang(() => { if (b.isConnected) b.innerHTML = `<b>${L().timeUp}</b><span>${L().lock}</span>`; });
  document.body.appendChild(b); try { sfx.gong(); } catch {} // [v15] time is up: a bronze gong
  return () => b.remove();
}

// ---- auction ending (pixel scene, 256x144) ----
// [v19] ten price tiers: the bidding climbs the ladder one tier at a time and stops at the tier the score earns.
// Tier 1 is the reserve (nobody follows it up: the lot is passed); tiers 2..10 are sales, chosen from the total score 30..100.
const TIERS = [500, 1200, 3000, 6800, 15000, 32000, 68000, 140000, 290000, 600000];
export const auctionTier = (res) => res.band === 'empty' ? 0 : res.band === 'poor' ? 1 : Math.min(10, 2 + Math.floor(Math.max(0, res.total - 30) / 70 * 8.999));
const fmtPrice = (n) => '¥' + n.toLocaleString('en-US');
export function playEnding(res, potUrl, { onSave, onRetry }) {
  const W = 256, H = 144, band = res.band, tier = auctionTier(res), price = tier ? TIERS[tier - 1] : 0;
  const root = el('div', 'cutscene ending');
  root.innerHTML = `<canvas class="cs-cv" width="${W}" height="${H}"></canvas><div class="end-box"><h2 class="end-title"></h2><p class="end-desc"></p><div class="end-bars"></div><div class="end-btns"><button type="button" class="end-btn primary" data-a="save"></button><button type="button" class="end-btn" data-a="retry"></button></div></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const l = L(), R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  root.querySelector('.end-title').textContent = l['e.' + band];
  root.querySelector('.end-desc').textContent = l['d.' + band];
  root.querySelector('.end-bars').innerHTML = `<div class="sp-row"><span>${l.shape}</span><i><u style="width:${res.shape}%"></u></i><b>${res.shape}</b></div><div class="sp-row"><span>${l.glaze}</span><i><u style="width:${res.glaze}%"></u></i><b>${res.glaze}</b></div><div class="sp-row"><span>${l.process}</span><i><u style="width:${res.process}%"></u></i><b>${res.process}</b></div><div class="sp-row total"><span>${l.total}</span><i><u style="width:${res.total}%"></u></i><b>${res.total}</b></div>`;
  const btnS = root.querySelector('[data-a=save]'), btnR = root.querySelector('[data-a=retry]');
  btnS.textContent = l.save; btnR.textContent = l.retry; btnS.hidden = band === 'empty';
  btnS.onclick = () => onSave && onSave(); btnR.onclick = () => onRetry && onRetry();
  const img = new Image(); let ready = false; img.onload = () => { ready = true; }; if (potUrl && band !== 'empty') img.src = potUrl;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bidders = []; for (let i = 0; i < 12; i++) bidders.push({ x: 20 + (i % 6) * 32 + (Math.floor(i / 6) ? 14 : 0), y: 108 + Math.floor(i / 6) * 16, hair: ['#3b2a22', '#23160f', '#7a4a2c', '#c9a050', '#5a5a66'][i % 5] });
  const order = [0, 7, 3, 9, 5, 1, 11, 4, 8, 2, 10, 6];
  const confetti = []; for (let i = 0; i < 70; i++) confetti.push({ x: Math.random() * W, y: -Math.random() * 120, v: 30 + Math.random() * 40, c: ['#f4d35e', '#e05a4a', '#6a9ba6', '#fff6e0'][i % 4] });
  // timeline: bidding starts at T0 and takes one step per tier; then the gavel falls; then the score card appears
  const T0 = 0.9, STEP = 0.36, steps = Math.max(tier, 1), tStrike = T0 + steps * STEP + 0.7, tBars = tStrike + 0.6;
  let t0 = 0, raf = 0, struck = false, barsHeard = false, lastStep = -1;
  function frame(now) {
    if (!t0) t0 = now; const t = (now - t0) / 1000;
    g.clearRect(0, 0, W, H);
    R(0, 0, W, H, '#3a1620'); R(0, 0, W, 8, '#5a1f2c'); for (let x = 0; x < W; x += 16) R(x, 8, 8, 70, x % 32 ? '#5a1f2c' : '#4a1824'); // curtains
    R(0, 96, W, 48, '#6e4529'); for (let y = 100; y < H; y += 8) R(0, y, W, 1, '#4f2f1a');
    // which tier is the bidding at?
    const stepNow = tier ? Math.min(tier, Math.max(0, Math.floor((t - T0) / STEP) + 1)) : 0;
    if (stepNow !== lastStep && stepNow > 0) { // a new bid: paddle flick, the call, and a rising price cue
      lastStep = stepNow; try { sfx.paddle(); setTimeout(() => sfx.bid(), 60); setTimeout(() => sfx.priceUp(stepNow), 120); } catch {}
    }
    const flash = stepNow > 0 && ((t - T0) % STEP) < 0.14 && t < tStrike;
    // price board with the ten-tier ladder under it
    R(78, 8, 100, 38, '#23160f'); R(80, 10, 96, 34, '#101010');
    g.textAlign = 'center'; g.fillStyle = flash ? '#fff6e0' : '#f4d35e'; g.font = 'bold 13px "Courier New", monospace';
    g.fillText(stepNow ? fmtPrice(TIERS[stepNow - 1]) : '---', 128, 25);
    for (let i = 0; i < 10; i++) { const on = i < stepNow, top = i === stepNow - 1; R(84 + i * 9, 32, 7, 8, on ? (top ? '#fff6e0' : i >= 8 ? '#e05a4a' : '#f4d35e') : '#3a3a3a'); R(84 + i * 9, 39, 7, 1, on ? '#a88a2a' : '#222'); }
    // the player's work, centre stage on a pedestal
    R(96, 86, 64, 5, '#f0d8b4'); R(102, 91, 52, 8, '#c9a075'); R(98, 83, 60, 4, '#d9b48c');
    const glow = stepNow ? 0.05 + 0.014 * stepNow : 0; if (glow) { g.fillStyle = `rgba(255,230,160,${glow})`; g.beginPath(); g.ellipse(128, 66, 32, 22, 0, 0, Math.PI * 2); g.fill(); } // a soft spotlight that grows with the bidding
    if (ready) { const s = 40 / Math.max(img.width, img.height); const w = img.width * s, h = img.height * s; g.drawImage(img, 128 - w / 2, 85 - h, w, h); } else if (band === 'empty') { R(120, 82, 16, 2, '#c9a075'); }
    // auctioneer's podium (right) with the gavel
    R(196, 70, 46, 26, '#7a4a2c'); R(196, 70, 46, 4, '#a8714a'); R(210, 44, 12, 12, '#f2c9a0'); R(208, 40, 16, 6, '#23160f'); R(206, 56, 20, 16, '#23160f'); R(212, 54, 8, 3, '#fff6e0');
    const strike = t > tStrike; const arm = strike && t < tStrike + 0.25 ? 8 : 0; R(226, 56 + arm, 4, 12 - arm, '#23160f'); R(230, 54 + arm * 1.4, 10, 5, '#a8714a');
    if (strike && !struck) { struck = true; try { sfx.hammer(); const k = { record: 'high', good: 'high', fair: 'ok', low: 'low', poor: 'passed', empty: 'none' }[band]; setTimeout(() => sfx.sting(k), 450); } catch {} }
    if (t > tBars && !barsHeard) { barsHeard = true; for (let i = 0; i < 16; i++) setTimeout(() => { try { sfx.scoreTick(i); } catch {} }, i * 55); }
    R(222, 90, 16, 4, '#d9b48c'); // sound block
    // banner after the gavel
    if (strike) { g.fillStyle = price ? (band === 'poor' ? '#e05a4a' : '#fff6e0') : '#e05a4a'; g.font = 'bold 10px "Courier New", monospace'; g.fillText(price ? (band === 'poor' ? l.passed : l.sold) : l.none, 50, 66); }
    // bidders (backs of heads): the bidder of each step raises a paddle for a moment
    bidders.forEach((b, i) => {
      R(b.x - 6, b.y, 12, 14, '#2d2540'); R(b.x - 5, b.y - 7, 10, 9, b.hair);
      let up = 0; for (let k = 1; k <= tier; k++) if (order[(k - 1) % 12] === i) { const tk = T0 + (k - 1) * STEP, d = t - tk; if (d > 0 && d < STEP * 1.6) up = Math.min(1, d * 6, (STEP * 1.6 - d) * 6); }
      if (strike && band !== 'poor' && order[(tier - 1) % 12] === i) up = 1; // the winning paddle stays up
      if (up > 0) { const k = up; R(b.x + 6, b.y - 10 - k * 14, 2, 14 + k * 14, '#d9b48c'); R(b.x + 1, b.y - 24 - k * 14 + 8, 14, 10, '#fff6e0'); R(b.x + 3, b.y - 22 - k * 14 + 8, 10, 2, '#e05a4a'); }
    });
    if (band === 'record' && strike) for (const c of confetti) { c.y += c.v * 0.016; if (c.y > H) c.y = -4; R(c.x + Math.sin(c.y * 0.1) * 3, c.y, 3, 3, c.c); }
    // fade in
    if (t < 0.6) { g.fillStyle = '#23160f'; const th = (1 - t / 0.6) * 16; for (let by = 0; by < H; by += 4) for (let bx = 0; bx < W; bx += 4) if (BAY[((by / 4) % 4) * 4 + ((bx / 4) % 4)] < th) g.fillRect(bx, by, 4, 4); }
    root.querySelector('.end-box').classList.toggle('show', t > tBars);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { close() { cancelAnimationFrame(raf); root.remove(); }, skipAhead() { t0 = performance.now() - (tBars + 0.1) * 1000; }, root };
}
