// Pattern brushes (Ornament -> Patterns). Every motif is drawn in code inside the unit box [-0.5, 0.5]^2,
// so it scales to any brush size and stays crisp. Band patterns (hui, string, wave...) tile edge to edge.
// These are stylised, procedural interpretations of the traditional motifs, not museum-accurate reproductions.
const T = Math.PI * 2;
const PAPER = 'rgba(248,240,226,.92)';
const COBALT = '#1f4d9c';

const path = (c, pts, close) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); if (close) c.closePath(); };
const ln = (c, pts, w, close) => { if (w) c.lineWidth = w; path(c, pts, close); c.stroke(); };
const dot = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, T); c.fill(); };
const ring = (c, x, y, r, w) => { if (w) c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, T); c.stroke(); };
const ell = (c, x, y, rx, ry, rot = 0, fill = true) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, T); fill ? c.fill() : c.stroke(); };
const at = (c, x, y, s, rot, fn) => { c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s); fn(c); c.restore(); };
const curve = (c, a, q, b, w) => { if (w) c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(q[0], q[1], b[0], b[1]); c.stroke(); };
const paperLine = (c, fn, w = 0.02) => { c.save(); c.strokeStyle = PAPER; c.lineWidth = w; fn(); c.restore(); };

const petal = (c, len, wid) => {
  c.beginPath(); c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.25, -wid, len * 0.8, -wid * 0.9, len, 0);
  c.bezierCurveTo(len * 0.8, wid * 0.9, len * 0.25, wid, 0, 0);
  c.closePath();
};
const solid = (c) => { c.fill(); paperLine(c, () => c.stroke(), 0.016); };
const rosette = (c, n, len, wid, rot = 0, fill = true) => {
  for (let i = 0; i < n; i++) { c.save(); c.rotate(rot + (i * T) / n); petal(c, len, wid); fill ? solid(c) : c.stroke(); c.restore(); }
};
const fan = (c, n, len, wid, a0, a1, fill = true) => {
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * i) / (n - 1);
    c.save(); c.rotate(a); petal(c, len, wid); fill ? solid(c) : c.stroke(); c.restore();
  }
};
const sine = (c, y0, amp, cycles, ph = 0, x0 = -0.5, x1 = 0.5, w) => {
  if (w) c.lineWidth = w;
  c.beginPath();
  for (let i = 0; i <= 48; i++) {
    const t = i / 48, x = x0 + (x1 - x0) * t, y = y0 + amp * Math.sin(T * cycles * t + ph);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
};
const spiral = (c, cx, cy, r0, r1, turns, a0 = 0, dir = 1, w) => {
  if (w) c.lineWidth = w;
  c.beginPath();
  const st = Math.max(20, Math.round(turns * 24));
  for (let i = 0; i <= st; i++) {
    const t = i / st, r = r0 + (r1 - r0) * t, a = a0 + dir * t * turns * T;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
};
const sqSpiral = (c, cx, cy, u, segs, rot = 0, dir = 1) => {
  c.beginPath();
  let x = cx, y = cy, a = rot;
  c.moveTo(x, y);
  for (let i = 0; i < segs; i++) {
    const l = (Math.floor(i / 2) + 1) * u;
    x += Math.cos(a) * l; y += Math.sin(a) * l;
    c.lineTo(x, y);
    a += (dir * Math.PI) / 2;
  }
  c.stroke();
};
const leafAt = (c, x, y, s, rot) => at(c, x, y, s, rot, (k) => { petal(k, 0.5, 0.16); solid(k); ln(k, [[0.02, 0], [0.4, 0]], 0.0001); });

// ---- reusable heads ----
const lotusHead = (c) => {
  at(c, 0, 0.3, 1, 0, (k) => {
    fan(k, 5, 0.62, 0.15, -2.55, -0.59);
    fan(k, 3, 0.45, 0.12, -2.0, -1.14);
  });
  ell(c, 0, 0.32, 0.36, 0.06, 0, true);
};
const peonyHead = (c) => {
  rosette(c, 8, 0.5, 0.2, 0.2);
  rosette(c, 7, 0.36, 0.15, 0.5);
  rosette(c, 5, 0.22, 0.1, 0.1);
  dot(c, 0, 0, 0.04);
};
const flower5 = (c, s = 1) => {
  for (let i = 0; i < 5; i++) { const a = (i * T) / 5 - Math.PI / 2; dot(c, Math.cos(a) * 0.2 * s, Math.sin(a) * 0.2 * s, 0.16 * s); }
  c.save(); c.fillStyle = PAPER; dot(c, 0, 0, 0.07 * s); c.restore();
};

// ---- animals ----
const dragon = (c) => {
  for (let i = 0; i <= 26; i++) { // tapering S-shaped body, head on the right
    const t = i / 26, x = 0.4 - 0.82 * t, y = 0.14 * Math.sin(T * 1.05 * t + 0.3) + 0.02;
    dot(c, x, y, 0.082 * (1 - 0.7 * t) + 0.012);
  }
  c.save(); c.translate(0.38, 0.04);
  ell(c, 0.05, -0.03, 0.12, 0.075, -0.25);
  ln(c, [[0.1, -0.1], [0.2, -0.22], [0.25, -0.15]], 0.035);
  ln(c, [[0.02, -0.1], [0.04, -0.24], [0.1, -0.2]], 0.03);
  c.fillStyle = PAPER; dot(c, 0.07, -0.05, 0.022);
  c.restore();
  paperLine(c, () => { for (let i = 3; i < 22; i += 3) { const t = i / 26; const x = 0.4 - 0.82 * t, y = 0.14 * Math.sin(T * 1.05 * t + 0.3) + 0.02; c.beginPath(); c.arc(x, y, 0.045 * (1 - 0.6 * t), 0.4, 2.7); c.stroke(); } }, 0.014);
  ln(c, [[0.1, 0.1], [0.14, 0.2]], 0.03); ln(c, [[-0.12, 0.12], [-0.08, 0.22]], 0.03);
};
const phoenix = (c) => {
  ell(c, 0.02, 0.04, 0.18, 0.1, -0.35);
  ell(c, 0.22, -0.1, 0.06, 0.06);
  ln(c, [[0.14, -0.02], [0.2, -0.08]], 0.07);
  ln(c, [[0.22, -0.16], [0.18, -0.28]], 0.03); ln(c, [[0.24, -0.16], [0.26, -0.3]], 0.03);
  c.beginPath(); c.moveTo(0.27, -0.12); c.lineTo(0.37, -0.1); c.lineTo(0.27, -0.07); c.fill();
  c.save(); c.fillStyle = PAPER; dot(c, 0.235, -0.115, 0.016); c.restore();
  at(c, -0.05, 0.02, 1, -2.4, (k) => { petal(k, 0.3, 0.1); solid(k); });
  for (const [dx, dy, qx, qy] of [[-0.16, 0.09, -0.35, 0.28], [-0.18, 0.07, -0.45, 0.12], [-0.17, 0.05, -0.42, -0.03]]) {
    curve(c, [dx, dy], [qx, dy + 0.02], [qx - 0.02, qy], 0.03);
    at(c, qx - 0.02, qy, 1, 2.6, (k) => { petal(k, 0.08, 0.035); k.fill(); });
  }
  ln(c, [[0.04, 0.12], [0.03, 0.26]], 0.025); ln(c, [[0.1, 0.1], [0.1, 0.25]], 0.025);
};
const quad = (c) => { // generic four-legged beast facing right
  ell(c, -0.02, 0.04, 0.24, 0.12);
  for (const x of [-0.2, -0.1, 0.1, 0.18]) ln(c, [[x, 0.1], [x + (x > 0 ? 0.01 : -0.01), 0.36]], 0.04);
  ln(c, [[0.16, -0.02], [0.28, -0.2]], 0.09);
  ell(c, 0.34, -0.24, 0.085, 0.052, 0.45);
  ln(c, [[-0.24, 0.0], [-0.34, -0.04], [-0.38, 0.06]], 0.035);
};

// ---- the library ----
const defs = [];
const add = (id, cat, zh, en, draw, ink) => defs.push({ id, cat, zh, en, draw, ink });

// geometric
add('hui', 'geo', '回纹', 'Meander', (c) => { c.lineJoin = 'miter'; c.lineCap = 'butt'; ln(c, [[-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [-0.42, 0.42], [-0.42, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [-0.2, 0], [0, 0]], 0.07); });
add('string', 'geo', '弦纹', 'String lines', (c) => { for (const y of [-0.22, 0, 0.22]) ln(c, [[-0.55, y], [0.55, y]], 0.055); });
add('bead', 'geo', '联珠纹', 'Beads', (c) => { dot(c, 0, 0, 0.3); c.save(); c.fillStyle = 'rgba(255,255,255,.4)'; dot(c, -0.1, -0.1, 0.09); c.restore(); });
add('grid', 'geo', '方格纹', 'Grid', (c) => { c.lineJoin = 'miter'; c.lineWidth = 0.05; c.strokeRect(-0.45, -0.45, 0.9, 0.9); ln(c, [[-0.45, 0], [0.45, 0]]); ln(c, [[0, -0.45], [0, 0.45]]); });
add('rhombus', 'geo', '菱形纹', 'Diamond', (c) => { ln(c, [[0, -0.46], [0.46, 0], [0, 0.46], [-0.46, 0]], 0.05, true); ln(c, [[0, -0.24], [0.24, 0], [0, 0.24], [-0.24, 0]], 0.04, true); dot(c, 0, 0, 0.05); });
add('wave', 'geo', '水波纹', 'Water wave', (c) => { for (const y of [-0.26, 0, 0.26]) sine(c, y, 0.1, 1, 0, -0.5, 0.5, 0.05); });
add('thunder', 'geo', '云雷纹', 'Cloud-thunder', (c) => { c.lineJoin = 'miter'; c.lineCap = 'butt'; c.lineWidth = 0.05; sqSpiral(c, -0.2, 0.1, 0.1, 8, 0, -1); sqSpiral(c, 0.2, -0.1, 0.1, 8, Math.PI, -1); });
add('mat', 'geo', '席纹', 'Mat weave', (c) => { c.lineCap = 'butt'; c.lineWidth = 0.065; for (const [x, y, h] of [[-0.25, -0.25, 1], [0.25, -0.25, 0], [-0.25, 0.25, 0], [0.25, 0.25, 1]]) for (const o of [-0.08, 0.08]) h ? ln(c, [[x - 0.2, y + o], [x + 0.2, y + o]]) : ln(c, [[x + o, y - 0.2], [x + o, y + 0.2]]); });

// plants
add('lotusVine', 'plant', '缠枝莲', 'Lotus scroll', (c) => { sine(c, 0.12, 0.13, 1, 0, -0.5, 0.5, 0.04); at(c, 0, -0.12, 0.5, 0, lotusHead); leafAt(c, -0.4, 0.22, 0.6, 0.6); leafAt(c, 0.4, -0.02, 0.6, -0.7); });
add('peonyVine', 'plant', '缠枝牡丹', 'Peony scroll', (c) => { sine(c, 0.18, 0.12, 1, 0, -0.5, 0.5, 0.04); at(c, 0, -0.06, 0.5, 0, peonyHead); leafAt(c, -0.4, 0.28, 0.7, 0.5); leafAt(c, 0.4, 0.06, 0.7, -0.6); });
add('branch', 'plant', '折枝花', 'Broken branch', (c) => { curve(c, [-0.42, 0.4], [-0.1, 0.1], [0.28, -0.22], 0.045); leafAt(c, -0.25, 0.22, 0.9, -0.9); leafAt(c, -0.05, 0.1, 0.9, 0.5); leafAt(c, 0.08, -0.02, 0.8, -1.2); at(c, 0.3, -0.26, 0.55, 0, (k) => flower5(k)); });
add('grass', 'plant', '卷草纹', 'Scrolling grass', (c) => { sine(c, 0, 0.1, 1, 0, -0.5, 0.5, 0.04); spiral(c, -0.25, -0.2, 0.01, 0.1, 1.3, 0.5, 1, 0.035); spiral(c, 0.25, 0.2, 0.01, 0.1, 1.3, 3.6, 1, 0.035); leafAt(c, -0.05, -0.1, 0.5, -1.2); leafAt(c, 0.05, 0.1, 0.5, 1.9); });
add('lotus', 'plant', '莲花', 'Lotus', (c) => { at(c, 0, 0.04, 0.95, 0, lotusHead); ell(c, 0, 0.42, 0.34, 0.05); });
add('lotusPetal', 'plant', '莲瓣', 'Lotus petal', (c) => { at(c, 0, 0.46, 1, -Math.PI / 2, (k) => { petal(k, 0.92, 0.28); k.fill(); paperLine(k, () => { petal(k, 0.62, 0.15); k.stroke(); }, 0.03); }); });
add('peony', 'plant', '牡丹', 'Peony', (c) => { at(c, 0, -0.04, 0.95, 0, peonyHead); leafAt(c, -0.2, 0.42, 0.7, -2.6); leafAt(c, 0.2, 0.42, 0.7, -0.5); });
add('chrysanthemum', 'plant', '菊花', 'Chrysanthemum', (c) => { rosette(c, 22, 0.48, 0.05, 0); rosette(c, 18, 0.3, 0.045, 0.1); c.save(); c.fillStyle = PAPER; dot(c, 0, 0, 0.09); c.restore(); dot(c, 0, 0, 0.05); });
add('plum', 'plant', '梅花', 'Plum blossom', (c) => { flower5(c, 1.45); c.lineWidth = 0.015; for (let i = 0; i < 8; i++) { const a = (i * T) / 8; ln(c, [[0, 0], [Math.cos(a) * 0.14, Math.sin(a) * 0.14]], 0.02); } });
add('orchid', 'plant', '兰花', 'Orchid', (c) => { for (const [x, q, w] of [[-0.42, -0.22, 0.05], [0.4, -0.2, 0.05], [-0.2, -0.38, 0.04]]) { curve(c, [0, 0.46], [x * 0.3, 0.08], [x, q], w); } at(c, 0.02, -0.12, 0.8, 0, (k) => { fan(k, 3, 0.3, 0.09, -2.1, -1.0); dot(k, 0, 0.02, 0.04); }); });
add('grape', 'plant', '葡萄', 'Grapes', (c) => { const rows = [4, 3, 2, 1]; rows.forEach((n, j) => { for (let i = 0; i < n; i++) dot(c, (i - (n - 1) / 2) * 0.15, -0.14 + j * 0.14, 0.072); }); ln(c, [[0, -0.2], [0.04, -0.4]], 0.035); leafAt(c, 0.04, -0.36, 0.8, -0.3); });
add('pomegranate', 'plant', '石榴', 'Pomegranate', (c) => { dot(c, 0, 0.06, 0.3); path(c, [[-0.1, -0.2], [-0.07, -0.34], [0, -0.26], [0.07, -0.34], [0.1, -0.2]], true); c.fill(); paperLine(c, () => { c.beginPath(); c.arc(0, 0.06, 0.2, 0.4, 2.2); c.stroke(); }, 0.025); c.save(); c.fillStyle = PAPER; for (const [x, y] of [[-0.06, 0.1], [0.04, 0.16], [0.08, 0.04], [-0.1, 0.22], [0.0, 0.0]]) dot(c, x, y, 0.025); c.restore(); });
add('peach', 'plant', '寿桃', 'Peach', (c) => { c.beginPath(); c.moveTo(0, -0.3); c.bezierCurveTo(0.5, -0.4, 0.5, 0.25, 0, 0.42); c.bezierCurveTo(-0.5, 0.25, -0.5, -0.4, 0, -0.3); c.fill(); paperLine(c, () => curve(c, [0, -0.28], [0.08, 0.1], [0, 0.4]), 0.025); leafAt(c, 0.04, -0.3, 0.8, -0.5); leafAt(c, -0.04, -0.3, 0.7, -2.6); });

// animals
add('cloudDragon', 'animal', '云龙', 'Cloud dragon', (c) => { at(c, 0, 0, 0.85, 0, dragon); spiral(c, -0.3, 0.32, 0.01, 0.09, 1.3, 0, 1, 0.03); spiral(c, 0.34, -0.3, 0.01, 0.08, 1.3, 3, 1, 0.03); });
add('kuiDragon', 'animal', '夔龙', 'Kui dragon', (c) => { c.lineJoin = 'miter'; ln(c, [[-0.42, 0.22], [-0.42, -0.08], [-0.12, -0.08], [-0.12, 0.2], [0.2, 0.2], [0.2, -0.16]], 0.07); ln(c, [[0.2, -0.16], [0.4, -0.16], [0.4, -0.04]], 0.07); c.fillRect(0.3, -0.3, 0.14, 0.1); c.save(); c.fillStyle = PAPER; c.fillRect(0.38, -0.27, 0.03, 0.03); c.restore(); c.lineWidth = 0.04; sqSpiral(c, -0.42, 0.22, 0.05, 6, Math.PI / 2, -1); });
add('luanPhoenix', 'animal', '鸾凤', 'Luan phoenix', (c) => at(c, 0, 0, 1.05, 0, phoenix));
add('dragonPhoenix', 'animal', '龙凤呈祥', 'Dragon & phoenix', (c) => { at(c, -0.2, 0.02, 0.62, 0, dragon); at(c, 0.28, 0, 0.78, 0, (k) => { k.scale(-1, 1); phoenix(k); }); });
add('fishAlgae', 'animal', '鱼藻', 'Fish & algae', (c) => { ell(c, -0.04, 0, 0.27, 0.15); path(c, [[0.2, 0], [0.45, -0.2], [0.38, 0], [0.45, 0.2]], true); c.fill(); paperLine(c, () => { for (const x of [-0.12, 0.0, 0.12]) for (const y of [-0.06, 0.06]) { c.beginPath(); c.arc(x, y, 0.05, 2.2, 4.1); c.stroke(); } }, 0.015); c.save(); c.fillStyle = PAPER; dot(c, -0.2, -0.03, 0.025); c.restore(); sine(c, 0.32, 0.03, 2, 0, -0.45, 0.45, 0.025); curve(c, [-0.4, 0.5], [-0.3, 0.2], [-0.38, -0.1], 0.03); curve(c, [0.4, 0.5], [0.3, 0.3], [0.4, 0.1], 0.03); });
add('crane', 'animal', '仙鹤', 'Crane', (c) => { ell(c, -0.02, 0.08, 0.2, 0.1, -0.15); curve(c, [0.14, 0.02], [0.32, 0.0], [0.28, -0.3], 0.045); dot(c, 0.29, -0.33, 0.04); ln(c, [[0.32, -0.33], [0.46, -0.3]], 0.025); ln(c, [[-0.02, 0.16], [-0.08, 0.44]], 0.025); ln(c, [[0.06, 0.16], [0.05, 0.44]], 0.025); at(c, -0.04, 0.06, 1, -2.6, (k) => { petal(k, 0.34, 0.12); solid(k); }); ln(c, [[-0.2, 0.06], [-0.4, 0.0]], 0.03); ln(c, [[-0.19, 0.1], [-0.4, 0.14]], 0.03); });
add('deer', 'animal', '鹿', 'Deer', (c) => { quad(c); ln(c, [[0.35, -0.3], [0.33, -0.44], [0.4, -0.5]], 0.022); ln(c, [[0.34, -0.38], [0.28, -0.44]], 0.02); ln(c, [[0.38, -0.3], [0.42, -0.42], [0.48, -0.44]], 0.022); c.save(); c.fillStyle = PAPER; for (const [x, y] of [[-0.1, 0.0], [0.02, 0.04], [-0.14, 0.1], [0.08, 0.1], [-0.02, -0.02]]) dot(c, x, y, 0.022); c.restore(); });
add('duck', 'animal', '鸳鸯', 'Mandarin duck', (c) => { ell(c, -0.04, 0.06, 0.26, 0.12, 0.05); dot(c, 0.2, -0.12, 0.08); path(c, [[0.26, -0.13], [0.4, -0.1], [0.26, -0.07]], true); c.fill(); ln(c, [[0.15, -0.18], [0.08, -0.3]], 0.03); ln(c, [[0.17, -0.19], [0.14, -0.32]], 0.03); at(c, -0.12, 0.0, 1, -1.3, (k) => { petal(k, 0.26, 0.1); solid(k); }); c.save(); c.fillStyle = PAPER; dot(c, 0.22, -0.14, 0.015); c.restore(); sine(c, 0.3, 0.03, 2, 0, -0.45, 0.45, 0.025); sine(c, 0.4, 0.03, 2, 1, -0.45, 0.45, 0.025); });
add('butterfly', 'animal', '蝴蝶', 'Butterfly', (c) => { for (const sg of [1, -1]) { c.save(); c.scale(sg, 1); c.beginPath(); c.moveTo(0.02, -0.02); c.bezierCurveTo(0.2, -0.46, 0.5, -0.32, 0.4, -0.06); c.bezierCurveTo(0.34, 0.04, 0.14, 0.02, 0.02, -0.02); c.fill(); c.beginPath(); c.moveTo(0.02, 0.03); c.bezierCurveTo(0.3, 0.06, 0.4, 0.36, 0.2, 0.38); c.bezierCurveTo(0.08, 0.38, 0.02, 0.2, 0.02, 0.03); c.fill(); c.save(); c.fillStyle = PAPER; dot(c, 0.24, -0.17, 0.045); dot(c, 0.17, 0.25, 0.035); c.restore(); c.restore(); } ell(c, 0, 0.02, 0.025, 0.2); ln(c, [[0, -0.16], [-0.08, -0.34]], 0.016); ln(c, [[0, -0.16], [0.08, -0.34]], 0.016); });
add('kylin', 'animal', '麒麟', 'Kylin', (c) => { quad(c); ln(c, [[0.36, -0.3], [0.3, -0.46], [0.36, -0.52]], 0.025); fan(c, 0, 0, 0, 0, 0); for (let i = 0; i < 3; i++) at(c, 0.1 + i * 0.05, -0.08 - i * 0.07, 1, -1.3, (k) => { petal(k, 0.12, 0.05); k.fill(); }); at(c, -0.3, 0.0, 1, 2.9, (k) => { petal(k, 0.18, 0.07); k.fill(); }); c.save(); c.fillStyle = PAPER; for (const [x, y] of [[-0.1, 0.02], [0.02, 0.06], [-0.14, 0.1]]) dot(c, x, y, 0.025); c.restore(); });
add('lion', 'animal', '狮子', 'Lion', (c) => { rosette(c, 16, 0.5, 0.09, 0); c.save(); c.fillStyle = PAPER; dot(c, 0, 0.02, 0.24); c.restore(); dot(c, -0.1, -0.04, 0.035); dot(c, 0.1, -0.04, 0.035); path(c, [[-0.04, 0.04], [0.04, 0.04], [0, 0.1]], true); c.fill(); curve(c, [-0.14, 0.14], [0, 0.22], [0.14, 0.14], 0.025); dot(c, -0.2, -0.17, 0.05); dot(c, 0.2, -0.17, 0.05); ln(c, [[-0.16, -0.14], [-0.04, -0.1]], 0.03); ln(c, [[0.16, -0.14], [0.04, -0.1]], 0.03); });
add('pixiu', 'animal', '貔貅', 'Pixiu', (c) => { quad(c); at(c, -0.06, -0.02, 1, -2.1, (k) => { petal(k, 0.3, 0.11); solid(k); }); at(c, -0.12, -0.02, 1, -2.6, (k) => { petal(k, 0.24, 0.09); solid(k); }); ln(c, [[0.36, -0.3], [0.34, -0.44]], 0.03); c.save(); c.fillStyle = PAPER; dot(c, 0.35, -0.26, 0.015); c.restore(); path(c, [[0.4, -0.22], [0.46, -0.2], [0.4, -0.18]], true); c.fill(); });

// sky and nature
add('ruyiCloud', 'sky', '如意云', 'Ruyi cloud', (c) => { spiral(c, 0, -0.12, 0.01, 0.17, 1.6, -1.6, 1, 0.05); spiral(c, -0.3, 0.06, 0.01, 0.1, 1.4, 0.2, -1, 0.045); spiral(c, 0.3, 0.06, 0.01, 0.1, 1.4, 2.9, 1, 0.045); curve(c, [-0.42, 0.28], [-0.4, -0.24], [0, -0.34], 0.04); curve(c, [0, -0.34], [0.4, -0.24], [0.42, 0.28], 0.04); ln(c, [[0, 0.1], [0, 0.4]], 0.045); });
add('clusterCloud', 'sky', '朵云', 'Cloud cluster', (c) => { c.lineWidth = 0.05; for (const [x, y, r, a, b] of [[-0.28, 0.05, 0.13, 2.9, 5.6], [-0.08, -0.08, 0.17, 3.3, 6.0], [0.16, -0.04, 0.15, 3.4, 6.1], [0.34, 0.08, 0.12, 3.6, 6.4]]) { c.beginPath(); c.arc(x, y, r, a, b); c.stroke(); } ln(c, [[-0.4, 0.17], [0.4, 0.17]], 0.045); spiral(c, -0.3, 0.3, 0.01, 0.07, 1.2, 0, -1, 0.035); });
add('flowCloud', 'sky', '流云', 'Flowing cloud', (c) => { sine(c, -0.1, 0.1, 1, 0, -0.5, 0.5, 0.05); sine(c, 0.1, 0.07, 1, 1.2, -0.5, 0.5, 0.04); spiral(c, -0.3, -0.2, 0.01, 0.07, 1.2, 0, 1, 0.035); spiral(c, 0.3, 0.2, 0.01, 0.07, 1.2, 3, 1, 0.035); sine(c, 0.32, 0.04, 1, 0.5, -0.4, 0.4, 0.03); });
add('seaCliff', 'sky', '海水江崖', 'Sea & cliff', (c) => { path(c, [[-0.12, 0.1], [-0.04, -0.38], [0.04, -0.2], [0.14, 0.1]], true); c.fill(); paperLine(c, () => { for (const x of [-0.06, 0, 0.06]) ln(c, [[x - 0.02, 0.08], [x + 0.01, -0.12]]); }, 0.018); for (const [y, off] of [[0.2, 0], [0.32, 0.5], [0.44, 0]]) for (let i = -1; i <= 3; i++) { c.beginPath(); c.arc(-0.5 + (i + off) * 0.25 + 0.12, y, 0.12, Math.PI, T); c.lineWidth = 0.035; c.stroke(); } });
add('flame', 'sky', '火焰纹', 'Flame', (c) => { for (const [x, s] of [[-0.18, 0.75], [0, 1], [0.18, 0.75]]) at(c, x, 0.4, s, 0, (k) => { k.beginPath(); k.moveTo(0, 0); k.bezierCurveTo(-0.22, -0.2, 0.06, -0.4, -0.02, -0.82); k.bezierCurveTo(0.26, -0.5, 0.22, -0.2, 0.08, 0); k.closePath(); k.fill(); paperLine(k, () => { k.beginPath(); k.moveTo(0, -0.04); k.bezierCurveTo(-0.08, -0.18, 0.03, -0.3, 0.02, -0.46); k.stroke(); }, 0.03); }); });
add('sun', 'sky', '太阳纹', 'Sun', (c) => { dot(c, 0, 0, 0.16); ring(c, 0, 0, 0.23, 0.03); for (let i = 0; i < 12; i++) { c.save(); c.rotate((i * T) / 12); path(c, [[0.28, -0.035], [0.5, 0], [0.28, 0.035]], true); c.fill(); c.restore(); } });

// blue and white porcelain (own cobalt colour)
const bw = (fn) => (c) => { c.fillStyle = 'rgba(31,77,156,.86)'; c.strokeStyle = COBALT; fn(c); };
add('bwLotus', 'blue', '青花缠枝莲', 'Blue-white lotus scroll', bw((c) => { sine(c, 0.12, 0.13, 1, 0, -0.5, 0.5, 0.04); at(c, 0, -0.12, 0.5, 0, lotusHead); leafAt(c, -0.38, 0.2, 0.8, 0.6); leafAt(c, 0.38, -0.02, 0.8, -0.7); }), COBALT);
add('bwPeony', 'blue', '青花牡丹', 'Blue-white peony', bw((c) => { at(c, 0, -0.04, 0.95, 0, peonyHead); leafAt(c, -0.2, 0.42, 0.7, -2.6); leafAt(c, 0.2, 0.42, 0.7, -0.5); }), COBALT);
add('bwWave', 'blue', '青花海水', 'Blue-white waves', bw((c) => { for (const [y, off] of [[-0.16, 0], [0.04, 0.5], [0.24, 0]]) for (let i = -1; i <= 3; i++) { c.beginPath(); c.arc(-0.5 + (i + off) * 0.25 + 0.12, y, 0.12, Math.PI, T); c.lineWidth = 0.045; c.stroke(); spiral(c, -0.5 + (i + off) * 0.25 + 0.12, y - 0.02, 0.005, 0.045, 1, 0, 1, 0.03); } }), COBALT);
add('bwBanana', 'blue', '青花蕉叶', 'Blue-white banana leaf', bw((c) => { at(c, 0, 0.46, 1, -Math.PI / 2, (k) => { petal(k, 0.92, 0.3); k.fill(); }); paperLine(c, () => { ln(c, [[0, 0.44], [0, -0.4]]); for (let i = 0; i < 6; i++) { const y = 0.3 - i * 0.12, w = 0.2 - i * 0.025; ln(c, [[0, y], [-w, y - 0.08]]); ln(c, [[0, y], [w, y - 0.08]]); } }, 0.022); }), COBALT);
add('bwRuyi', 'blue', '青花如意头', 'Blue-white ruyi head', bw((c) => { c.beginPath(); c.moveTo(0, -0.42); c.bezierCurveTo(0.2, -0.4, 0.46, -0.2, 0.42, 0.02); c.bezierCurveTo(0.4, 0.2, 0.2, 0.22, 0.1, 0.4); c.lineTo(-0.1, 0.4); c.bezierCurveTo(-0.2, 0.22, -0.4, 0.2, -0.42, 0.02); c.bezierCurveTo(-0.46, -0.2, -0.2, -0.4, 0, -0.42); c.fill(); paperLine(c, () => { spiral(c, 0, -0.08, 0.01, 0.14, 1.5, -1.6, 1); spiral(c, -0.26, 0.04, 0.01, 0.08, 1.3, 0.2, -1); spiral(c, 0.26, 0.04, 0.01, 0.08, 1.3, 2.9, 1); }, 0.03); }), COBALT);
add('bwBamboo', 'blue', '青花竹石', 'Blue-white bamboo & rock', bw((c) => { for (const [x, tilt] of [[-0.1, -0.04], [0.06, 0.03]]) for (let i = 0; i < 4; i++) { ln(c, [[x + tilt * i, 0.1 - i * 0.14], [x + tilt * (i + 1), -0.02 - i * 0.14]], 0.05); ring(c, x + tilt * (i + 1), -0.02 - i * 0.14, 0.03, 0.02); } for (const [x, y, r] of [[-0.18, -0.3, -2.4], [0.2, -0.22, -0.6], [0.14, -0.4, -1.2]]) leafAt(c, x, y, 0.7, r); c.beginPath(); c.moveTo(-0.4, 0.4); c.bezierCurveTo(-0.38, 0.16, -0.1, 0.12, 0.05, 0.2); c.bezierCurveTo(0.3, 0.1, 0.42, 0.28, 0.4, 0.4); c.closePath(); c.fill(); }), COBALT);
add('bwCloud', 'blue', '青花云肩', 'Blue-white cloud collar', bw((c) => { c.lineWidth = 0.05; for (const [x, y, r, a, b] of [[-0.28, 0.05, 0.13, 2.9, 5.6], [-0.08, -0.08, 0.17, 3.3, 6.0], [0.16, -0.04, 0.15, 3.4, 6.1], [0.34, 0.08, 0.12, 3.6, 6.4]]) { c.beginPath(); c.arc(x, y, r, a, b); c.stroke(); } ln(c, [[-0.4, 0.17], [0.4, 0.17]], 0.045); for (const x of [-0.25, 0, 0.25]) { dot(c, x, 0.3, 0.04); ln(c, [[x, 0.17], [x, 0.26]], 0.025); } }), COBALT);
add('bwIcePlum', 'blue', '青花冰梅', 'Blue-white ice-plum', bw((c) => { c.lineWidth = 0.03; const P = [[-0.45, -0.3], [-0.15, -0.45], [0.2, -0.4], [0.45, -0.15], [0.4, 0.2], [0.1, 0.45], [-0.25, 0.4], [-0.45, 0.1], [0, 0]]; for (const p of P.slice(0, 8)) ln(c, [p, P[8]]); for (let i = 0; i < 8; i++) ln(c, [P[i], P[(i + 1) % 8]]); at(c, 0, 0, 0.5, 0, (k) => flower5(k)); }), COBALT);

export const CATEGORIES = [
  { id: 'geo', zh: '几何纹', en: 'Geometric' },
  { id: 'plant', zh: '植物纹', en: 'Plants' },
  { id: 'animal', zh: '动物纹', en: 'Animals' },
  { id: 'sky', zh: '天象自然', en: 'Sky & nature' },
  { id: 'blue', zh: '青花纹', en: 'Blue & white' }
];

export const PATTERNS = defs.map((d) => ({
  ...d,
  render(ctx, ink) {
    ctx.save();
    ctx.strokeStyle = d.ink || ink;
    ctx.fillStyle = d.ink || ink;
    ctx.lineWidth = 0.06;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    d.draw(ctx);
    ctx.restore();
  }
}));
export const patternById = (id) => PATTERNS.find((p) => p.id === id) || PATTERNS[0];

export function drawThumb(canvas, pat, ink = '#4a3427') {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(canvas.width * 0.86, canvas.height * 0.86);
  pat.render(ctx, ink);
  ctx.restore();
}
