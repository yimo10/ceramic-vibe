// Turns raw MediaPipe landmarks into stable gestures (pinch / point / open / fist) and smoothed pointer positions.
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];
export const FINGERTIPS = [4, 8, 12, 16, 20];

// One Euro filter: removes jitter when the hand is slow, keeps responsiveness when it moves fast.
class LowPass {
  constructor() { this.y = null; }
  filter(x, a) { this.y = this.y == null ? x : a * x + (1 - a) * this.y; return this.y; }
}
const alpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut) / dt);

export class OneEuro {
  constructor(minCut = 2.6, beta = 16, dCut = 1.2) {
    this.minCut = minCut; this.beta = beta; this.dCut = dCut;
    this.reset();
  }
  reset() { this.x = new LowPass(); this.dx = new LowPass(); this.t = null; this.px = 0; }
  filter(v, t) {
    if (this.t == null) { this.t = t; this.px = v; this.x.filter(v, 1); this.dx.filter(0, 1); return v; }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const d = (v - this.px) / dt;
    this.px = v;
    const ed = this.dx.filter(d, alpha(this.dCut, dt));
    return this.x.filter(v, alpha(this.minCut + this.beta * Math.abs(ed), dt));
  }
}

const mkSlot = () => ({
  seen: -1e9, rawPinch: false, gesture: 'open', cand: 'open', candN: 0,
  fx: new OneEuro(1.8), fy: new OneEuro(1.8), last: null,
  lmF: null, // [v10] smoothed copy of the 21 landmarks (the skeleton is drawn from it, so it no longer jitters)
  ratioF: null // [v3] smoothed thumb-index ratio (stops the pinch from flickering around the threshold)
});

// [v3] A hand may vanish for up to GRACE seconds (a few lost frames) without ending the stroke: the last pose is held.
// (was 0.15 s; short tracking dropouts used to cut strokes in the middle)
const GRACE = 0.3;
// Latency tuning: the filter adapts to speed (little lag on fast moves), a pinch is accepted on the first frame.
// [v3] The look-ahead is no longer baked into x / y here. The studio extrapolates every *render* frame from the
// filtered velocity (vx, vy) + LEAD_S, so the pointer moves at 60 fps even though the camera delivers ~30 fps.
export const PINCH_ON = 0.27, PINCH_OFF = 0.42; // [v10] was 0.44 / 0.62: fingers a good distance apart counted as a pinch. Now measured in 3D (see _one)
const PINCH_FRAMES = 2; // [v10] a pinch must hold for two frames before it starts
export const LEAD_S = 0.035; // seconds of look-ahead that cancel camera + inference delay
export const MAX_PRED_S = 0.09; // never extrapolate further than this (a frozen hand must not drift away)
const RATIO_ALPHA = 0.6; // smoothing of the pinch ratio, 1 = none

export class HandInterpreter {
  constructor() { this.slots = [mkSlot(), mkSlot()]; this.mode = 'both'; }

  reset() { this.slots = [mkSlot(), mkSlot()]; }

  // [v3] Mode isolation at the classifier. The studio tells the interpreter which gesture the current mode uses:
  //   'pinch' (shaping, 3D decoration) -> a pointing hand is just "open", it can never become a pinch/point mix-up
  //   'point' (glazing, pattern brush) -> a thumb touching the index finger no longer turns the stroke into a pinch
  //   'none'  (texture list)           -> no tool gesture at all
  //   'both'  -> the old behaviour
  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    for (const s of this.slots) { s.gesture = 'open'; s.cand = 'open'; s.candN = 0; s.rawPinch = false; }
  }

  // res: result of HandLandmarker.detectForVideo; aspect: video width / height; time in seconds.
  update(res, aspect, time) {
    const present = [false, false];
    const lms = res && res.landmarks ? res.landmarks : [];
    const hd = (res && (res.handedness || res.handednesses)) || [];

    // [v3] Slot assignment: first match each detected hand to the slot whose hand was just seen at the nearest place,
    // only then fall back to MediaPipe's Left/Right label. The label flips now and then for the same hand, which used to
    // swap slots, spawn a "new" pointer and cut the stroke.
    const slotOf = new Array(lms.length).fill(-1);
    const pairs = [];
    lms.forEach((lm, i) => this.slots.forEach((s, k) => {
      if (s.last && time - s.seen < 0.5) {
        const c = s.last.lm[9];
        pairs.push({ i, k, d: Math.hypot((lm[9].x - c.x) * aspect, lm[9].y - c.y) });
      }
    }));
    pairs.sort((a, b) => a.d - b.d);
    const usedSlot = [false, false];
    for (const q of pairs) {
      if (q.d > 0.35 || slotOf[q.i] >= 0 || usedSlot[q.k]) continue;
      slotOf[q.i] = q.k; usedSlot[q.k] = true;
    }
    lms.forEach((lm, i) => {
      let slot = slotOf[i];
      if (slot < 0) {
        const label = hd[i] && hd[i][0] ? hd[i][0].categoryName : '';
        slot = label === 'Left' ? 0 : 1;
        if (usedSlot[slot]) slot = 1 - slot;
        if (usedSlot[slot]) return;
        usedSlot[slot] = true;
      }
      present[slot] = true;
      this._one(this.slots[slot], slot, lm, aspect, time);
    });
    const out = [];
    this.slots.forEach((s, slot) => {
      if (present[slot]) out.push(s.last);
      else if (s.last && time - s.seen < GRACE) out.push({ ...s.last, stale: true });
      else if (s.last && time - s.seen > 0.5) { s.last = null; s.fx.reset(); s.fy.reset(); s.gesture = 'open'; s.cand = 'open'; s.candN = 0; s.rawPinch = false; s.ratioF = null; s.lmF = null; }
    });
    return out;
  }

  _one(s, slot, lm, aspect, time) {
    const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y);
    // [v10] 3D distance (MediaPipe z is on the same scale as x): a thumb that merely hides behind the index finger in the picture is no longer a pinch
    const d3 = (a, b) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y, ((lm[a].z || 0) - (lm[b].z || 0)) * aspect);
    const palm = Math.max(d3(0, 9), 1e-4);
    const ratioRaw = d3(4, 8) / palm; // thumb-to-index distance relative to palm size
    // [v3] light smoothing of the ratio itself: one noisy frame can no longer open or close a pinch
    s.ratioF = s.ratioF == null ? ratioRaw : RATIO_ALPHA * ratioRaw + (1 - RATIO_ALPHA) * s.ratioF;
    const ratio = s.ratioF;
    const ext = (tip, pip) => d(tip, 0) > d(pip, 0) * 1.06;
    const idx = ext(8, 6), mid = ext(12, 10), rng = ext(16, 14), pnk = ext(20, 18);

    // hysteresis: closing needs a tighter pinch than keeping it closed
    const pinch = s.rawPinch ? ratio < PINCH_OFF : ratio < PINCH_ON;
    s.rawPinch = pinch;
    // [v3] only the gesture that belongs to the active mode can be produced (see setMode)
    const allowPinch = this.mode === 'both' || this.mode === 'pinch';
    const allowPoint = this.mode === 'both' || this.mode === 'point';
    let raw = 'open';
    if (allowPinch && pinch) raw = 'pinch';
    else if (allowPoint && idx && !mid && !rng && !pnk) raw = 'point';
    else if (!idx && !mid && !rng && !pnk) raw = 'fist';
    if (!allowPinch) s.rawPinch = false; // no pinch memory while pinching is not part of the mode

    // a pinch starts immediately; other changes (and letting go of a pinch) must hold for two frames
    if (raw === s.gesture) s.candN = 0;
    else if (raw === s.cand) s.candN++;
    else { s.cand = raw; s.candN = 1; }
    if (s.candN >= (raw === 'pinch' ? PINCH_FRAMES : 2)) { s.gesture = raw; s.candN = 0; }

    const px = s.gesture === 'pinch' ? (lm[4].x + lm[8].x) / 2 : lm[8].x;
    const py = s.gesture === 'pinch' ? (lm[4].y + lm[8].y) / 2 : lm[8].y;
    s.seen = time;
    // [v10] smoothed landmarks for drawing: a One Euro filter per coordinate, slow = steady, fast = no lag
    if (!s.lmF) s.lmF = lm.map(() => ({ x: new OneEuro(1.0, 6, 1.2), y: new OneEuro(1.0, 6, 1.2) }));
    const lmS = lm.map((q, i) => ({ x: s.lmF[i].x.filter(q.x, time), y: s.lmF[i].y.filter(q.y, time), z: q.z }));
    const fx = s.fx.filter(px, time), fy = s.fy.filter(py, time);
    const vx = s.fx.dx.y || 0, vy = s.fy.dx.y || 0; // filtered velocity (per second, normalised image units)
    // [v3] x / y are the filtered position at time t; the consumer extrapolates with (vx, vy) up to the render time
    s.last = { slot, lm: lmS, gesture: s.gesture, ratio, x: fx, y: fy, vx, vy, t: time };
  }
}

// [v29] Tutorial highlight: paints the fingers that matter for the gesture being taught on top of a skeleton drawn in pixel space.
//   'pinch': thumb tip + index tip pulse orange and a line joins them, turning green the moment the pinch is recognised.
//   'point': the index finger is green when it is out; each of the other three fingers is red while still extended ("curl me") and green once curled.
// pts = landmark positions in pixels, lm = normalised landmarks, aspect = video width / height, u = line-size unit, gesture = the recognised gesture.
const FINGER_CHAINS = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };
export function drawFocus(ctx, pts, lm, aspect, focus, u, gesture) {
  if (!focus) return;
  const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y);
  const ext = (tip, pip) => d(tip, 0) > d(pip, 0) * 1.06;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
  ctx.save(); ctx.shadowBlur = 0; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const dot = (i, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, r, 0, 6.283); ctx.fill(); };
  if (focus === 'pinch') {
    const ok = gesture === 'pinch', col = ok ? '#4be08a' : '#ffb36b';
    ctx.strokeStyle = col; ctx.lineWidth = 3.2 * u;
    ctx.beginPath(); ctx.moveTo(pts[4].x, pts[4].y); ctx.lineTo(pts[8].x, pts[8].y); ctx.stroke();
    for (const i of [4, 8]) {
      if (!ok) { ctx.strokeStyle = col; ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, (7 + 4 * pulse) * u, 0, 6.283); ctx.stroke(); }
      dot(i, 5 * u, col);
    }
  } else if (focus === 'point') {
    const GREEN = '#4be08a', RED = '#ff5a4d';
    for (const [name, ch] of Object.entries(FINGER_CHAINS)) {
      const out = ext(ch[3], ch[1]), good = name === 'index' ? out : !out;
      ctx.strokeStyle = good ? GREEN : RED; ctx.lineWidth = (name === 'index' ? 4.2 : good ? 2 : 3.6) * u;
      ctx.beginPath(); ctx.moveTo(pts[ch[0]].x, pts[ch[0]].y); for (let k = 1; k < 4; k++) ctx.lineTo(pts[ch[k]].x, pts[ch[k]].y); ctx.stroke();
      dot(ch[3], (good ? 4 : 5 + 2 * pulse) * u, good ? GREEN : RED);
    }
  }
  ctx.restore();
}
