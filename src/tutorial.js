// [v34] Hands-on tutorial in the MASTER'S OWN voice: the player IS the master, so every line is first-person inner monologue (never "you", never "apprentice"). Strictly one action per step:
//   every step is split into sub-steps shown ONE at a time; the next prompt appears only after the previous action really happened,
//   and after the last action the master points at the RESULT on the clay before moving on.
//   tool steps (Push -> Pull -> Lift):  tap the tool -> fingertip on the dot -> pinch -> do the motion -> "look, it opened!"
//   wheel step:  push the wall and watch two live mini pots (wheel ON stays round / wheel OFF dents), then try it on the real pot
//   brush step (free creation only):    tap the stage -> tap Brush -> move to the pot -> point -> draw
// The hand is the main path; the mouse is offered only when the camera fails to start. A light spotlight mask dims the rest of the screen
// and leaves holes round what matters (it never blocks input, never covers the clay). The box sits in the free space left or right of the clay.
// Practice happens on a scratch lump that keeps the pot's current material; the player's own pot is restored afterwards.
import { getLang, t, onLang } from './i18n.js';
import { PINCH_ON } from './gestures.js';
import { sfx } from './sfx.js';

const S = {
  zh: {
    who: '师傅（我）', skip: '跳过教程', next: '下一步 ›', skipStep: '跳过这一步 ›', ok: '好！', ready: '手热开了！', readyT: '倒计时开始，做件好东西！', readyR: '不赶时间，慢慢捏。', go: '开工', mouse: '改用鼠标',
    camOff: '先让摄像头看见我的手——打开摄像头。', camWait: '浏览器在问摄像头，点“允许”。', camFail: '摄像头没醒。', camFailDetail: { 'cam.denied': '浏览器没给权限。', 'cam.noDevice': '找不到摄像头。', 'cam.busy': '摄像头被别人占着。', 'cam.modelFail': '手势模型没加载上。', 'cam.error': '摄像头出错了。' },
    hand: '举起一只手，离镜头一臂远。', pinch0: '老手艺的手劲：拇指指尖碰食指指尖。', pinch1: '握得稳。现在松手——把手指张开。',
    tool: '拿起“{b}”这把工具。', stage: '切到“{b}”。', brushTab: '再选“{b}”。',
    move: { press: '指尖放到圆点上（泥团顶），然后拇指食指一捏。', pull: '指尖放到圆点上（侧壁），然后拇指食指一捏。', lift: '指尖放到圆点上（近口沿），然后拇指食指一捏。' },
    pinchT: '捏住：拇指和食指指尖碰在一起。', point: '只伸出食指，指向陶罐。',
    motion: { press: ['捏住别松，往下压——把泥团压开。', '按住左键，从圆点往下拖。'], pull: ['捏住别松，往外拉——让壁变宽。', '按住左键，从圆点往右拖。'], lift: ['捏住别松，手往上提——把壁拉高。', '按住左键，从圆点往上拖。'] }, draw: ['在陶罐上画一笔。', '在陶罐上按住左键拖一笔。'],
    res: { press: '泥团被我压开了！', pull: '壁变宽了！', lift: '整圈壁一起升高了！', draw: '第一笔颜色上去了！' },
    cmp: ['推侧壁，对照两个小陶罐：左边转盘开着，右边转盘停着。', '在侧壁按住左键向左拖，对照两个小陶罐：左边转盘开着，右边转盘停着。'], cmpOn: '转盘开', cmpOff: '转盘停',
    cmpRes: '原来如此：转盘转着，整圈一起动，永远圆润；转盘停了，只凹一块，随我捏。提拉不管转不转，都是整圈升高。',
    spinOff: '来真的——点“{b}”让转盘停下。', wheelOff: ['转盘停了。再推一次侧壁——只有我碰的那一块会动。', '转盘停了。再向左拖一次侧壁——只有我碰的那一块会动。'],
    wheelRes: '凹下去一块！做圆器开转盘，手捏造型停转盘。', spinOn: '最后，点“{b}”让转盘重新转起来。',
    orbit: '按住鼠标中键拖一拖转视角，滚轮拉近拉远。', mode: '“古法制瓷”和“自由创作”随时能切，点一个看看。', flow: '挑战赛按时间线一步步做，做完一步点“下一步”。',
    chipNone: '没看到手', chipHand: '看到了：{g}',
    hNoHand: '摄像头没看到我的手：举到镜头前，手心朝镜头，光线亮一点。', hTool: '点那个发光的按钮。', hMove: '挪手，让圆点落在指尖下。', hPinch: '指尖碰一起（条越过黑线）。', hPoint: '把中指、无名指、小指收起来。',
    hTop: '还没压开：对准泥团顶部中央往下压。', hMotion: '别松手，沿着箭头慢慢动。', hDraw: '指尖贴着陶罐，慢慢动。', hBack: '工具放下了，重新拿起它。',
    menuTitle: '想先练哪一段？', menuAll: '从头全部来一遍', menuBasics: '摄像头与手势', menuShape: '按压 · 拉伸 · 提拉', menuWheel: '转盘', menuPaint: '画笔上色', menuView: '视角与模式', menuNo: '算了', menuNA: '（现在用不了）',
    askT: '先热热手，过一遍基本功？', askP: '大约一分钟：怎么捏、换工具、用转盘。只出现一次，之后点“说明”随时重来。', askY: '好，热热手', askN: '不用了'
  },
  en: {
    who: 'Master (me)', skip: 'Skip tutorial', next: 'Next ›', skipStep: 'Skip this step ›', ok: 'Good!', ready: 'Hands warmed up!', readyT: 'The clock starts. Make something fine!', readyR: 'No rush. Take it slow.', go: 'Get to work', mouse: 'Use mouse instead',
    camOff: 'First, let the camera see my hands. Turn it on.', camWait: 'The browser is asking about the camera. Allow it.', camFail: 'The camera did not wake.', camFailDetail: { 'cam.denied': 'The browser said no.', 'cam.noDevice': 'No camera found.', 'cam.busy': 'Someone else is using it.', 'cam.modelFail': 'The hand model did not load.', 'cam.error': 'The camera complained.' },
    hand: 'Raise one hand, an arm’s length from the lens.', pinch0: 'The old potter’s grip: thumb tip to index fingertip.', pinch1: 'A steady grip. Now let go: open the fingers.',
    tool: 'Pick up the “{b}” tool.', stage: 'Switch to “{b}”.', brushTab: 'Then choose “{b}”.',
    move: { press: 'Fingertip on the dot (top of the clay), then pinch thumb and index.', pull: 'Fingertip on the dot (side wall), then pinch thumb and index.', lift: 'Fingertip on the dot (near the rim), then pinch thumb and index.' },
    pinchT: 'Pinch: thumb and index fingertips together.', point: 'Point at the pot with just the index finger.',
    motion: { press: ['Keep pinching and press down: open the clay.', 'Hold the left button and drag down from the dot.'], pull: ['Keep pinching and pull outward: widen the wall.', 'Hold the left button and drag right from the dot.'], lift: ['Keep pinching and raise the hand: pull the wall up.', 'Hold the left button and drag up from the dot.'] }, draw: ['Draw a line on the pot.', 'Hold the left button and draw a line on the pot.'],
    res: { press: 'I opened the clay!', pull: 'The wall grew wider!', lift: 'The whole wall rose together!', draw: 'Colour on clay. My first stroke!' },
    cmp: ['Push the side wall and compare the two little pots: wheel ON on the left, wheel OFF on the right.', 'Hold the left button on the side wall and drag left. Compare the two little pots: wheel ON on the left, OFF on the right.'], cmpOn: 'Wheel ON', cmpOff: 'Wheel OFF',
    cmpRes: 'I see: a turning wheel moves the whole ring, so it stays round. A stopped wheel dents one spot, so I can shape it freely. Lifting raises the whole ring either way.',
    spinOff: 'For real now: tap “{b}” to stop the wheel.', wheelOff: ['The wheel is still. Push the side wall again: only the spot I touch moves.', 'The wheel is still. Drag left on the side wall again: only the spot I touch moves.'],
    wheelRes: 'A dent! Wheel on for round vessels, off for hand-built shapes.', spinOn: 'Last, tap “{b}” to set the wheel turning again.',
    orbit: 'Hold the middle mouse button and drag to turn the view; scroll to zoom.', mode: 'Ancient craft and Free creation switch any time. Try one.', flow: 'The challenge follows the timeline step by step; press Next when a step is done.',
    chipNone: 'No hand seen', chipHand: 'Seen: {g}',
    hNoHand: 'The camera cannot see my hand: raise it to the camera, palm toward the lens, in good light.', hTool: 'Tap the glowing button.', hMove: 'Move the hand so the dot is under the fingertip.', hPinch: 'Bring the fingertips together (bar passes the line).', hPoint: 'Curl the middle, ring and little fingers.',
    hTop: 'Not open yet: aim at the top centre and press down.', hMotion: 'Keep pinching and move slowly along the arrow.', hDraw: 'Fingertip on the pot, move slowly.', hBack: 'The tool is down. Pick it up again.',
    menuTitle: 'What shall I practise?', menuAll: 'Everything, from the start', menuBasics: 'Camera & hand', menuShape: 'Push · Pull · Lift', menuWheel: 'The wheel', menuPaint: 'Brush painting', menuView: 'View & modes', menuNo: 'Never mind', menuNA: '(not available now)',
    askT: 'Warm up first and run through the basics?', askP: 'About a minute: how to shape, switch tools and use the wheel. Shown once; press Help any time to go again.', askY: 'Yes, warm up', askN: 'No thanks'
  }
};
const L = () => S[getLang() === 'zh' ? 'zh' : 'en'];

const TOOLS = {
  press: { btn: '#toolPush', tool: 'push', work: 'push', need: 0.9, dir: [0, 1] },
  pull: { btn: '#toolPull', tool: 'pull', work: 'pull', need: 0.9, dir: [1, 0] },
  lift: { btn: '#toolLift', tool: 'lift', work: 'lift', need: 0.8, dir: [0, -1] }
};
const CHAPTERS = { basics: ['cam', 'hand', 'pinch'], shape: ['press', 'pull', 'lift'], wheel: ['wheel'], paint: ['paint'], view: ['orbit', 'mode', 'flow'] };

// the master's pixel portrait (rectangles only, like the cutscenes)
function drawMaster(cv) {
  const g = cv.getContext('2d'), P = 4, R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x * P, y * P, w * P, h * P); };
  g.clearRect(0, 0, cv.width, cv.height);
  R(3, 0, 8, 2, '#3a2a22'); R(2, 2, 10, 2, '#3a2a22'); R(4, 1, 6, 1, '#d9d2c4'); // hair + white headband
  R(3, 3, 8, 6, '#f2c9a0'); R(4, 5, 2, 2, '#23160f'); R(8, 5, 2, 2, '#23160f'); R(5, 8, 4, 1, '#b86b4b'); // face
  R(3, 8, 8, 2, '#d9d2c4'); R(4, 10, 6, 1, '#d9d2c4'); // grey beard
  R(2, 11, 10, 5, '#8a5a3a'); R(5, 11, 4, 5, '#c98a5a'); R(1, 12, 2, 4, '#8a5a3a'); R(11, 12, 2, 4, '#8a5a3a'); // robe + apron
}
const speak = (voice = 'master') => { try { sfx.blip(voice); } catch {} };

// ---- chapter menu opened by the Help button ----
export function pickChapter({ prac = true, paint = true } = {}) {
  return new Promise((resolve) => {
    const box = document.createElement('div'); box.className = 'tut-ask';
    box.innerHTML = '<div class="tut-ask-card pixel" role="dialog" aria-modal="true"><div class="tut-who"><canvas width="56" height="64"></canvas><h2></h2></div><div class="tut-menu"></div></div>';
    drawMaster(box.querySelector('canvas'));
    const paintMenu = () => { const l = L(); box.querySelector('h2').textContent = l.menuTitle;
      const items = [['all', l.menuAll, true], ['basics', l.menuBasics, true], ['shape', l.menuShape, prac], ['wheel', l.menuWheel, prac], ['paint', l.menuPaint, paint], ['view', l.menuView, true], ['no', l.menuNo, true]];
      const m = box.querySelector('.tut-menu'); m.innerHTML = '';
      for (const [k, label, ok] of items) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (k === 'all' ? ' primary' : ''); b.textContent = label + (ok ? '' : ' ' + l.menuNA); b.disabled = !ok;
        b.onclick = () => { box.remove(); resolve(k === 'no' ? null : k === 'all' ? [] : CHAPTERS[k]); }; m.appendChild(b); } };
    paintMenu(); onLang(() => { if (box.isConnected) paintMenu(); });
    document.body.appendChild(box); box.querySelector('.tut-menu button').focus();
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { box.remove(); resolve(null); } });
  });
}

export function runTutorial({ api, bus, kind, isHand, expandTimeline, only }) {
  return new Promise((resolve) => {
    const $ = (q) => document.querySelector(q);
    const btnLabel = (sel) => { const el = $(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
    const prac = api.canPractice(), paint = prac && api.canPaint() && kind !== 'timed';
    const all = [...(api.camLive() ? [] : ['cam']), 'hand', 'pinch', ...(prac ? ['press', 'pull', 'lift', 'wheel'] : []), ...(paint ? ['paint'] : []), 'orbit', kind === 'timed' ? 'flow' : 'mode'];
    let ids = only ? all.filter((k) => only.includes(k) || (k === 'cam' && only.includes('hand'))) : all;
    if (!ids.length) { resolve(); return; }
    const HANDONLY = new Set(['hand', 'pinch']);
    let steps = ids.slice(), mouseMode = !!only && !only.includes('hand') && !api.camLive(); // a chapter replay without a camera simply uses the mouse
    if (mouseMode) steps = steps.filter((s) => !HANDONLY.has(s) && s !== 'cam');
    let i = -1, ph = 0, phases = [], glow = null, raf = 0, finished = false, done = false, lastT = 0, S_ = {}, ended = false, camClicked = 0, inOutro = false;
    api.begin();
    const bubble = document.createElement('div'); bubble.className = 'tut pixel';
    bubble.innerHTML = '<canvas class="tut-face" width="56" height="64"></canvas><div class="tut-main"><div class="tut-top"><span class="tut-name"></span><span class="tut-step"></span><button type="button" class="tut-skip"></button></div><p class="tut-text"></p>' +
      '<div class="tut-cmp" hidden><div><canvas width="150" height="92" data-w="on"></canvas><b class="cmp-on"></b></div><div><canvas width="150" height="92" data-w="off"></canvas><b class="cmp-off"></b></div></div>' +
      '<div class="tut-chip" hidden></div><div class="tut-meter" hidden><i></i><b></b></div><div class="tut-prog" hidden><i></i></div><div class="tut-hint"></div>' +
      '<div class="tut-btns"><button type="button" class="tut-mouse" hidden></button><button type="button" class="tut-next" hidden></button></div></div>';
    document.body.appendChild(bubble); drawMaster(bubble.querySelector('.tut-face'));
    const mark = document.createElement('div'); mark.className = 'tut-mark'; mark.hidden = true; mark.innerHTML = '<i></i>'; document.body.appendChild(mark);
    const arrow = document.createElement('div'); arrow.className = 'tut-arrow'; arrow.hidden = true; arrow.innerHTML = '<span></span>'; document.body.appendChild(arrow);
    // spotlight mask: a light dim with holes (pointer-events: none, so nothing is ever locked)
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'tut-mask');
    svg.innerHTML = '<defs><mask id="tutHoles"><rect width="100%" height="100%" fill="#fff"/><g></g></mask></defs><rect width="100%" height="100%" fill="rgba(24,14,8,.36)" mask="url(#tutHoles)"/>';
    document.body.appendChild(svg); const holesG = svg.querySelector('g');
    const q = (s) => bubble.querySelector(s);
    const clearGlow = () => { if (glow) glow.classList.remove('tut-glow'); glow = null; };
    const handMode = () => !mouseMode;
    q('.tut-name').textContent = L().who;

    // ---- the sub-steps of every step ----
    function phasesOf(id) {
      const hand = handMode();
      if (id === 'cam') return [{ id: 'cam' }];
      if (id === 'hand') return [{ id: 'hand', chip: true, prog: true }];
      if (id === 'pinch') return [{ id: 'pinch0', chip: true, meter: true, prog: true, focus: 'pinch' }, { id: 'pinch1', chip: true, prog: true, focus: 'pinch' }];
      if (TOOLS[id]) {
        const c = TOOLS[id], toolP = { id: 'tool', glow: c.btn, ev: 'tool:' + c.tool };
        const motionP = { id: 'motion', mark: id, arrow: c.dir, prog: true, focus: hand ? 'pinch' : null, result: 'res.' + id };
        return hand ? [toolP, { id: 'move', mark: id, chip: true }, { id: 'pinchT', mark: id, chip: true, meter: true, focus: 'pinch' }, motionP] : [toolP, motionP];
      }
      if (id === 'wheel') {
        const c = TOOLS.press, dir = [-1, 0], f = hand ? 'pinch' : null;
        return [{ id: 'tool', glow: c.btn, ev: 'tool:' + c.tool },
          { id: 'cmp', mark: 'pull', arrow: dir, prog: true, focus: f, cmp: true, result: 'cmpRes', enter: () => { api.ensureOpen(); api.setPaused(false); api.cmpStart(); } },
          { id: 'spinOff', glow: '#btnPause', enter: () => api.cmpStop() }, { id: 'wheelOff', mark: 'pull', arrow: dir, prog: true, focus: f, result: 'wheelRes' },
          { id: 'spinOn', glow: '#btnPause' }];
      }
      if (id === 'paint') {
        const a = { id: 'stage', glow: '#stGlaze', ev: 'stage:glaze' }, b = { id: 'brushTab', glow: '#tabBrush', ev: 'paintTool:brush' };
        const d = { id: 'draw', prog: true, focus: hand ? 'point' : null, result: 'res.draw' };
        return hand ? [a, b, { id: 'move', mark: 'pull', chip: true }, { id: 'point', chip: true, focus: 'point' }, d] : [a, b, d];
      }
      if (id === 'orbit') return [{ id: 'orbit', glow: '#btnView', ev: 'orbit' }];
      if (id === 'mode') return [{ id: 'mode', glow: '.tl-head .seg', ev: 'mode' }];
      return [{ id: 'flow', glow: '#timeline', info: true }];
    }
    const cfgOf = () => TOOLS[steps[i]] || (steps[i] === 'wheel' ? TOOLS.press : null);
    function textOf(p) {
      const l = L(), sid = steps[i], c = cfgOf(), hm = handMode() ? 0 : 1;
      switch (p.id) {
        case 'cam': return S_.err ? l.camFail + ' ' + (l.camFailDetail[S_.err] || '') : S_.clicked ? l.camWait : l.camOff;
        case 'tool': return l.tool.replace('{b}', btnLabel(c.btn));
        case 'stage': return l.stage.replace('{b}', btnLabel('#stGlaze'));
        case 'brushTab': return l.brushTab.replace('{b}', btnLabel('#tabBrush'));
        case 'move': return sid === 'paint' ? (getLang() === 'zh' ? '指尖挪到陶罐上。' : 'Move the fingertip onto the pot.') : l.move[sid];
        case 'motion': return l.motion[sid][hm];
        case 'draw': return l.draw[hm];
        case 'cmp': case 'wheelOff': return l[p.id][hm];
        case 'spinOff': case 'spinOn': return l[p.id].replace('{b}', btnLabel('#btnPause'));
        default: return l[p.id] || '';
      }
    }
    // the master "speaks": text types out with blips (instant for language switches, so nothing is retyped)
    function setText(str, type) {
      S_.full = str; S_.shown = type ? 0 : str.length; paintText();
    }
    function paintText() { const full = S_.full || '', n = Math.floor(S_.shown); q('.tut-text').innerHTML = ''; const a = document.createElement('span'), b = document.createElement('span'); a.textContent = full.slice(0, n); b.textContent = full.slice(n); b.style.visibility = 'hidden'; q('.tut-text').append(a, b); }
    function applyPhase() {
      clearGlow(); const l = L(), p = phases[ph]; done = false; bubble.classList.remove('ok'); S_ = { ...S_, t: 0, stall: 0, hint: null, w0: null, err: S_.err, clicked: S_.clicked };
      setText(textOf(p), true); q('.tut-name').textContent = l.who;
      q('.tut-chip').hidden = !(p.chip && handMode()); q('.tut-meter').hidden = !(p.meter && handMode()); q('.tut-prog').hidden = !p.prog; q('.tut-prog i').style.width = '0%';
      q('.tut-cmp').hidden = !p.cmp; q('.cmp-on').textContent = l.cmpOn; q('.cmp-off').textContent = l.cmpOff;
      q('.tut-hint').textContent = ''; q('.tut-mouse').hidden = true; q('.tut-next').textContent = l.next; q('.tut-next').hidden = !p.info;
      const sel = p.glow || (p.id === 'cam' && !S_.clicked ? '#camOpen' : null);
      const ge = sel ? $(sel) : null; if (ge) { ge.classList.add('tut-glow'); glow = ge; }
      mark.hidden = !p.mark; arrow.hidden = !p.arrow;
      api.focus(handMode() ? p.focus || null : null);
      if (p.id === 'flow' || p.id === 'mode') expandTimeline && expandTimeline();
      if (p.enter) p.enter();
      bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
    }
    function show(n) {
      i = n; ph = 0; S_ = {}; if (i >= steps.length) return outro();
      q('.tut-skip').textContent = L().skip; q('.tut-step').textContent = (i + 1) + '/' + steps.length;
      phases = phasesOf(steps[i]); applyPhase();
    }
    function outro() {
      inOutro = true; clearGlow(); mark.hidden = arrow.hidden = true; api.focus(null); endPractice(); const l = L();
      for (const s of ['.tut-chip', '.tut-meter', '.tut-prog', '.tut-cmp']) q(s).hidden = true;
      q('.tut-hint').textContent = ''; q('.tut-step').textContent = ''; setText(l.ready + ' ' + (kind === 'timed' ? l.readyT : l.readyR), true);
      q('.tut-skip').hidden = true; q('.tut-mouse').hidden = true; q('.tut-next').hidden = false; q('.tut-next').textContent = l.go; q('.tut-next').onclick = finish;
    }
    function endPractice() { if (!ended) { ended = true; api.cmpStop(); api.end(); } }
    function finish() { if (finished) return; finished = true; cancelAnimationFrame(raf); clearGlow(); endPractice(); bubble.remove(); mark.remove(); arrow.remove(); svg.remove(); bus.removeEventListener('evt', onEvt); try { localStorage.setItem('gp-guide-v2', '1'); } catch {} resolve(); }
    function refreshLang() { // switching language mid-tutorial: redraw every string that was written once
      if (finished) return; const l = L(); q('.tut-skip').textContent = l.skip; q('.tut-name').textContent = l.who; q('.cmp-on').textContent = l.cmpOn; q('.cmp-off').textContent = l.cmpOff;
      if (inOutro) { setText(l.ready + ' ' + (kind === 'timed' ? l.readyT : l.readyR), false); q('.tut-next').textContent = l.go; return; }
      const p = phases[ph]; if (!p) return; setText(S_.result ? S_.result() : textOf(p), false); q('.tut-next').textContent = l.next; q('.tut-mouse').textContent = l.mouse; S_.hint = null;
      if (S_.resultOn) q('.tut-hint').textContent = '✓ ' + l.ok;
    }
    onLang(refreshLang);
    // after the last action of a step the master points at the RESULT, then moves on
    function complete() {
      if (done) return; done = true; bubble.classList.add('ok');
      const p = phases[ph], last = ph >= phases.length - 1; try { api.tick(); } catch {}
      let wait = 450;
      if (last) { wait = 950; q('.tut-prog i').style.width = '100%'; q('.tut-hint').textContent = '✓ ' + L().ok; }
      if (p.result) { // the spotlight turns to the clay and the master says what just happened
        const key = p.result; const get = () => { const r = key.split('.').reduce((o, k) => o && o[k], L()); return r; };
        S_.result = get; S_.resultOn = true; setText(get(), true); wait = 2600; S_.spot = 'pot'; mark.hidden = arrow.hidden = true;
      }
      const n = i, k = ph;
      setTimeout(() => { if (finished || i !== n || ph !== k) return; S_.resultOn = false; if (last) show(i + 1); else { ph++; applyPhase(); } }, wait);
    }
    // ---- live evaluation (once per frame) ----
    function evalPhase(p, dt) {
      const l = L(), h = api.hand(), w = api.work(), sid = steps[i], c = cfgOf(), hand = handMode();
      const g = h ? t('gs.' + h.gesture) : '';
      if (p.chip && hand) { q('.tut-chip').textContent = h ? l.chipHand.replace('{g}', g) : l.chipNone; q('.tut-chip').classList.toggle('on', !!h); }
      if (p.meter && hand) {
        const fill = h ? Math.max(0, Math.min(1, 1 - h.ratio / 0.9)) : 0, thr = 1 - PINCH_ON / 0.9;
        q('.tut-meter i').style.width = (fill * 100).toFixed(0) + '%'; q('.tut-meter b').style.left = (thr * 100).toFixed(0) + '%'; q('.tut-meter').classList.toggle('pass', !!h && h.gesture === 'pinch');
      }
      if (p.cmp) { api.cmpDraw(q('canvas[data-w=on]'), 'on'); api.cmpDraw(q('canvas[data-w=off]'), 'off'); }
      // the player put the tool down while a later sub-step was on: back to "pick it up" (the gesture prompt must never show without the tool)
      if (c && ph > 0 && api.tool() !== c.tool && !(sid === 'wheel' && ['spinOff', 'spinOn'].includes(p.id))) { ph = 0; applyPhase(); q('.tut-hint').textContent = l.hBack; return null; }
      switch (p.id) {
        case 'cmp': { // a real push on the wall: both little pots receive it; done when the OFF pot shows a dent
          if (S_.w0 == null) S_.w0 = w.push; const pr = Math.min(1, Math.max((w.push - S_.w0) / 1.0, api.cmpAsym() / 0.06));
          return { p: pr, done: pr >= 1, hint: hand && !h ? l.hNoHand : l.hMotion, stallOnly: true };
        }
        case 'wheelOff': { if (S_.w0 == null) S_.w0 = w.push; const pr = Math.min(1, (w.push - S_.w0) / 0.8); return { p: pr, done: pr >= 1, hint: hand && !h ? l.hNoHand : l.hMotion, stallOnly: true }; }
        case 'spinOff': return { done: api.paused(), hint: l.hTool, stallOnly: true };
        case 'spinOn': return { done: !api.paused(), hint: l.hTool, stallOnly: true };
        case 'cam': {
          const live = api.camLive(), err = api.camError();
          if (S_.err !== err) { S_.err = err; setText(textOf(p), false); }
          if (S_.clicked !== !!camClicked) { S_.clicked = !!camClicked; setText(textOf(p), false); clearGlow(); }
          if (live) return { done: true };
          const fb = !!err || (camClicked && performance.now() - camClicked > 15000); // the mouse is only a fallback
          q('.tut-mouse').hidden = !fb; q('.tut-mouse').textContent = l.mouse;
          return { p: 0, hint: '' };
        }
        case 'hand': S_.t = h ? S_.t + dt : 0; return { p: S_.t / 0.8, done: S_.t >= 0.8, hint: h ? '' : l.hNoHand };
        case 'pinch0': S_.t = h && h.gesture === 'pinch' ? S_.t + dt : 0; return { p: S_.t / 1, done: S_.t >= 0.5, hint: !h ? l.hNoHand : h.gesture === 'pinch' ? '' : l.hPinch };
        case 'pinch1': S_.t = h && h.gesture !== 'pinch' ? S_.t + dt : 0; return { p: S_.t / 0.4, done: S_.t >= 0.4, hint: '' };
        case 'tool': case 'stage': case 'brushTab': return { hint: l.hTool, stallOnly: true };
        case 'move': S_.t = h && api.over(p.mark) ? S_.t + dt : 0; return { done: S_.t >= 0.35, hint: !h ? l.hNoHand : l.hMove, stallOnly: !!h };
        case 'pinchT': { const ok = h && h.gesture === 'pinch'; S_.t = ok ? S_.t + dt : 0; return { done: (ok && api.over(p.mark) && S_.t >= 0.2) || w[c.work] > 0.05, hint: !h ? l.hNoHand : ok ? l.hMove : l.hPinch, stallOnly: !!h }; }
        case 'point': { const ok = h && h.gesture === 'point'; S_.t = ok ? S_.t + dt : 0; return { done: S_.t >= 0.3, hint: !h ? l.hNoHand : l.hPoint, stallOnly: !!h }; }
        case 'motion': {
          const pr = Math.min(1, w[c.work] / c.need);
          if (sid === 'press' && pr >= 1 && !api.opened()) return { p: 0.95, hint: l.hTop };
          return { p: pr, done: pr >= 1 && (sid !== 'press' || api.opened()), hint: sid === 'press' && !api.opened() ? l.hTop : l.hMotion, stallOnly: true };
        }
        case 'draw': { const pr = Math.min(1, w.draw / 1.0); return { p: pr, done: pr >= 1, hint: hand && !h ? l.hNoHand : l.hDraw, stallOnly: true }; }
        default: return null;
      }
    }
    const onEvt = (e) => {
      if (e.detail === 'cam') { camClicked = performance.now(); return; }
      const p = phases[ph]; if (p && !done && p.ev && e.detail === p.ev) complete();
    };
    bus.addEventListener('evt', onEvt);
    q('.tut-skip').onclick = finish;
    q('.tut-next').onclick = () => show(i + 1);
    q('.tut-mouse').onclick = () => { mouseMode = true; steps = steps.filter((s) => !HANDONLY.has(s) && s !== 'cam'); show(0); };
    // ---- layout ----
    // The box goes to the free space LEFT or RIGHT of the clay (never over the clay, the dot, the arrow, the button it points at, the camera
    // window or the bars), as near as possible to what the current sub-step is about, and glides there.
    let lastPos = null;
    const OCCLUDERS = [['.topbar', 30], ['#timeline', 30], ['#subbar', 30], ['#toolbar', 30], ['#side', 30], ['#toast', 10]];
    const R = (x, y, w, h) => ({ l: x, t: y, r: x + w, b: y + h });
    const ov = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    const rectOfEl = (e, pad = 0) => { const r = e.getBoundingClientRect(); return R(r.left - pad, r.top - pad, r.width + 2 * pad, r.height + 2 * pad); };
    function setHoles(list) { // the clear areas of the spotlight mask
      while (holesG.childNodes.length < list.length) { const r = document.createElementNS(NS, 'rect'); r.setAttribute('fill', '#000'); r.setAttribute('rx', 14); holesG.appendChild(r); }
      [...holesG.childNodes].forEach((r, k) => { const h = list[k]; if (!h) { r.setAttribute('width', 0); return; } r.setAttribute('x', h.l); r.setAttribute('y', h.t); r.setAttribute('width', Math.max(0, h.r - h.l)); r.setAttribute('height', Math.max(0, h.b - h.t)); });
    }
    function place() {
      const p = phases[ph], bw = bubble.offsetWidth, bh = bubble.offsetHeight, VW = innerWidth, VH = innerHeight;
      const avoid = []; let focus; const holes = [];
      const pb = api.potBox(), potR = R(pb.x - pb.w / 2 - 10, pb.y - pb.h / 2 - 10, pb.w + 20, pb.h + 20); avoid.push([potR, 20]); focus = { x: pb.x, y: pb.y }; holes.push(potR); // the clay is never dimmed
      if (p && p.mark && !S_.spot) {
        const a = api.anchor(p.mark); mark.style.left = a.x + 'px'; mark.style.top = a.y + 'px'; focus = a; avoid.push([R(a.x - 44, a.y - 44, 88, 88), 100]);
        if (p.arrow) { arrow.style.left = a.x + 'px'; arrow.style.top = a.y + 'px'; arrow.style.transform = 'rotate(' + Math.atan2(p.arrow[1], p.arrow[0]) + 'rad)';
          const ex = a.x + p.arrow[0] * 120, ey = a.y + p.arrow[1] * 120; avoid.push([R(Math.min(a.x, ex) - 28, Math.min(a.y, ey) - 28, Math.abs(ex - a.x) + 56, Math.abs(ey - a.y) + 56), 100]); }
      }
      const el = p && (glow || (p.glow && $(p.glow)));
      if (el && !S_.spot) { const r = rectOfEl(el); avoid.push([rectOfEl(el, 10), 100]); holes.push(rectOfEl(el, 8)); focus = { x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 };
        const par = el.parentElement; if (par) { const pr = par.getBoundingClientRect(); if (pr.width * pr.height < VW * VH * 0.4) avoid.push([R(pr.left - 6, pr.top - 6, pr.width + 12, pr.height + 12), 100]); } }
      for (const [sel, w] of OCCLUDERS) { const e = $(sel); if (e) { const r = e.getBoundingClientRect(); if (r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden') avoid.push([R(r.left - 8, r.top - 8, r.width + 16, r.height + 16), w]); } }
      const cw = $('#camwin'); if (cw) { const r = cw.getBoundingClientRect(); if (r.width > 4 && r.height > 4) { const cr = R(r.left, r.top, r.width, r.height); const need = p && (p.id === 'hand' || p.chip || p.focus); avoid.push([cr, need ? 100 : 40]); if (need) holes.push(cr); } }
      if (p && p.id === 'flow') { const e = $('#timeline'); if (e) holes.push(rectOfEl(e, 4)); }
      setHoles(holes);
      // candidate columns: left of the clay or right of it; anywhere only if neither fits
      const leftX1 = potR.l - bw - 12, rightX0 = potR.r + 12, xs = [];
      for (let x = 8; x <= VW - bw - 8; x += 24) if (x <= leftX1 || x >= rightX0) xs.push(x);
      if (!xs.length) for (let x = 8; x <= VW - bw - 8; x += 24) xs.push(x);
      const score = (x, y) => { const box = R(x, y, bw, bh); let s = 0; for (const [r, w] of avoid) s += ov(box, r) * w; return s + Math.hypot(x + bw / 2 - focus.x, y + bh / 2 - focus.y) * 30; };
      let best = null; const y1 = Math.max(8, VH - bh - 8);
      for (let y = 8; y <= y1; y += 24) for (const x of xs) { const s = score(x, y); if (!best || s < best.s) best = { s, x, y }; }
      if (lastPos && lastPos.ph === ph) { const s0 = score(lastPos.x, lastPos.y); if (s0 <= best.s + 6000) best = { s: s0, x: lastPos.x, y: lastPos.y }; }
      lastPos = { x: best.x, y: best.y, ph };
      bubble.style.left = Math.round(best.x) + 'px'; bubble.style.top = Math.round(best.y) + 'px';
    }
    const tick = (now) => {
      const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016); lastT = now;
      const p = phases[ph];
      if (S_.full != null && S_.shown < S_.full.length) { const before = Math.floor(S_.shown); S_.shown = Math.min(S_.full.length, S_.shown + dt * (getLang() === 'zh' ? 26 : 55)); paintText(); if (Math.floor(S_.shown) > before && Math.floor(S_.shown) % 3 === 0) speak(); }
      if (p && !finished && !done) {
        const r = evalPhase(p, dt);
        if (r && !finished && phases[ph] === p) {
          if (r.p != null) q('.tut-prog i').style.width = (Math.max(0, Math.min(1, r.p)) * 100).toFixed(0) + '%';
          // one hint at a time, and only when it helps: at once for "no hand", otherwise after a few seconds without progress
          S_.stall = (S_.lastP === r.p && !r.done) ? (S_.stall || 0) + dt : 0; S_.lastP = r.p;
          const hint = r.hint && (!r.stallOnly || S_.stall > 5) ? r.hint : '';
          if (hint !== S_.hint) { q('.tut-hint').textContent = hint; S_.hint = hint; }
          if (p.id !== 'cam') q('.tut-next').hidden = !(p.info || S_.stall > 15);
          if (r.done) complete();
        }
      } else if (p && p.cmp) { api.cmpDraw(q('canvas[data-w=on]'), 'on'); api.cmpDraw(q('canvas[data-w=off]'), 'off'); }
      place(); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    show(0);
  });
}

// [v19] Before the guide is shown the player is asked whether they want it at all (told by the same master)
export function askTutorial() {
  return new Promise((resolve) => {
    const box = document.createElement('div'); box.className = 'tut-ask';
    box.innerHTML = '<div class="tut-ask-card pixel" role="dialog" aria-modal="true"><div class="tut-who"><canvas width="56" height="64"></canvas><h2></h2></div><p></p><div class="tut-ask-btns"><button type="button" class="btn primary" data-a="y"></button><button type="button" class="btn" data-a="n"></button></div></div>';
    drawMaster(box.querySelector('canvas'));
    const paint = () => { const l = L(); box.querySelector('h2').textContent = l.askT; box.querySelector('p').textContent = l.askP; box.querySelector('[data-a=y]').textContent = l.askY; box.querySelector('[data-a=n]').textContent = l.askN; }; // redrawn when the language is switched while the dialog is open
    paint(); onLang(() => { if (box.isConnected) paint(); });
    document.body.appendChild(box);
    const done = (v) => { box.remove(); resolve(v); };
    box.querySelector('[data-a=y]').onclick = () => done(true);
    box.querySelector('[data-a=n]').onclick = () => done(false);
    box.querySelector('[data-a=y]').focus();
  });
}
