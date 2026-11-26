import { playPrologue } from './prologue.js';
import { playCutscene } from './cutscene.js'; // [v10]
import { Countdown, scorePot, TIMED_SECONDS } from './session.js';
import { runTutorial, askTutorial, pickChapter } from './tutorial.js';
import { chooseSession, createHud, showReminder, showTimeUp, playEnding } from './sessionui.js';
import { HAND_POINT } from './handimg.js'; // [v5] onboarding walkthrough
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { t, getLang, applyI18n, onLang, initLangToggle } from './i18n.js';
import { Clay, GLAZES, PRESETS, DY, SEGS, FLOOR_ROW, presetOutline, BARE_HEX } from './clay.js';
import { PotMesh } from './pot.js';
import { FINISHES, ANCIENT_GLAZES } from './finishes.js'; // [v5] ANCIENT_GLAZES: the six glazes of the Ancient Craft glazing step
import { PATTERNS, CATEGORIES, patternById, drawThumb } from './patterns.js';
import { ORNAMENTS } from './ornaments.js';
import { getWork, putWork, newId } from './store.js';
import { potImage } from './snapshot.js';
import { CameraController } from './camera.js';
import { HAND_CONNECTIONS, LEAD_S, MAX_PRED_S, drawFocus } from './gestures.js'; // [v3] LEAD_S / MAX_PRED_S: render-frame hand extrapolation
import { skyAt, hoursNow } from './daylight.js';
import { playKiln, composeCard, uploadPhoto, loadImage } from './kiln.js'; // [v3] firing animation + result card
import { qrMatrix, drawQR } from './qr.js'; // [v3] QR code on the result card
import { SHARE_ENDPOINT } from './config.js';
import { initSfx, sfx, isMuted, setMuted } from './sfx.js'; // [v10]
import { initMixer, initSoundTest } from './mixerui.js'; // [v15]

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);

const SHAPE_SIGMA = 0.12; // width of the shaping finger
const SHAPE_RAMP_S = 0.7; // [v6] seconds for push / pull to ramp up from nothing after the gesture is recognised (was 0.18: the change appeared at once)
const PUSH_RATE = 0.24; // [v6] 0.5 -> 0.24: the wall moves about half as fast, so the effect can be watched. Old comment:  // wall movement per second at the finger ([v3] 0.36 -> 0.5: the smoother kernel spreads the push wider, this keeps the same strength)
const GAIN = 1.3; // camera-space -> stage-space gain, so the whole stage is reachable without leaving the camera view
const REGULARIZE_RATE = 0.9; // [v22] share of the asymmetry removed per second while pressing / stretching on the spinning wheel
const LIFT_GAIN = 1.0; // 1.0 = the wall follows the finger exactly
const TT_TOP = 0.13; // turntable surface height

const state = {
  opacity: 1, // [v5] glaze brush opacity
  mode: 'free', step: 0, // [v5] 'free' = original behaviour; 'ancient' = the real process (see the timeline section)
  stage: 'shape', tool: 'push', shapeMode: 'push', // [v16] no lifting any more
  glazeHex: GLAZES[2].hex, glazeIdx: 2, customHex: '#b86f9a', brush: 0.11,
  decorTab: 'texture', paintTool: 'brush', brushRelief: 'flat', patRelief: 'flat', patCat: 'geo', pattern: { id: 'hui', scale: 0.2, density: 1.5 }, ornScale: 1, selOrn: null,
  paused: false, mirror: true, hands: [], session: null, locked: false
};
const undoStack = [];
let editing = null; // { id, name, createdAt } when an existing work was loaded

// [v10] flow: 1) choose Timed / Relaxed, 2) Timed only: the pixel cutscene, 3) the in-context tutorial (not timed), 4) the clock starts. The studio loads underneath.
const sessionPromise = chooseSession().then(async (kind) => { state.session = kind; if (kind === 'timed') await playCutscene(); else await playPrologue(); return kind; });
async function main() {
  applyI18n();
  initLangToggle($('#btnLang'));

  // ---- [v5] Ancient Craft mode: the data model (the logic is in the "craft timeline" section further down) ----
  const STEPS = [ // interactive: throw, trim (light), decor, glaze. automatic: dry, bisque, fire, cool
    { id: 'throw', icon: '🏺', auto: false }, { id: 'dry', icon: '💨', auto: true }, { id: 'trim', icon: '✂️', auto: false },
    { id: 'bisque', icon: '🔥', auto: true }, { id: 'decor', icon: '🖌️', auto: false }, { id: 'glaze', icon: '🫗', auto: false },
    { id: 'fire', icon: '🧱', auto: true }, { id: 'cool', icon: '❄️', auto: true }
  ];
  const session = { cd: null, hud: null, ended: false, result: null }; // [v10] the countdown / HUD of this run
  const bus = new EventTarget(), emit = (d) => bus.dispatchEvent(new CustomEvent('evt', { detail: d })); // tutorial progress events
  const STEP_IDX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
  const anc = { maxStep: 0, step: 0, cut: 300, saved: null, chosen: { id: 'clear', color: null }, trimStrokes: 0, trimNeed: 2, trimT: 0, trimDone: false, finished: false, token: 0 };


  // ---- the clay: a saved work (from the gallery's "Edit again") or a fresh lump ----
  const wid = new URLSearchParams(location.search).get('id');
  let clay = new Clay(1);
  let loadedMsg = '';
  if (wid) {
    try {
      const w = await getWork(wid);
      if (w) {
        clay = await Clay.fromRecord(w, 1);
        editing = { id: w.id, name: w.name, createdAt: w.createdAt };
        loadedMsg = t('msg.loaded', { name: w.name });
      } else loadedMsg = t('msg.noWork');
    } catch { loadedMsg = t('msg.noWork'); }
  }

  // ---- renderer / scene ----
  const canvas = $('#gl');
  const stage = $('#stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1d15);
  scene.fog = new THREE.Fog(0x2a1d15, 9, 22);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  const camState = { ty: 0.7, dist: 4, init: false };
  const PITCH = (14 * Math.PI) / 180;
  // [v5/v6] user-controlled view: middle-drag orbits, the wheel zooms (pan / Ctrl-zoom / double-click reset were removed in v6).
  // yaw/pitch are offsets from the default framing; pan moves the look-at target; zoom scales the distance.
  const orbit = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0, panZ: 0 };
  const resetView = () => { orbit.yaw = orbit.pitch = orbit.panX = orbit.panY = orbit.panZ = 0; orbit.zoom = 1; };
  // The framing follows the height of the vessel, easing so the view never jumps while you pull the clay up.
  function frameCamera(dt) {
    const H = clay.height(), tan = Math.tan((camera.fov * Math.PI) / 360);
    const wantTy = TT_TOP + H * 0.5 - 0.1;
    const wantDist = Math.max((H * 0.5 + 0.6) / tan, (clay.maxRadius() + 0.5) / (tan * camera.aspect), 2.9);
    const k = camState.init ? Math.min(1, dt * 3) : 1;
    camState.ty += (wantTy - camState.ty) * k;
    camState.dist += (wantDist - camState.dist) * k;
    camState.init = true;
    // [v5] orbit around the look-at target (pitch clamped so the camera never goes under the table or flips over the top)
    const pitch = Math.min(1.5, Math.max(0.03, PITCH + orbit.pitch)), d = camState.dist * orbit.zoom;
    const tx = orbit.panX, tz = orbit.panZ, ty = camState.ty + orbit.panY;
    camera.position.set(tx + Math.sin(orbit.yaw) * Math.cos(pitch) * d, ty + Math.sin(pitch) * d, tz + Math.cos(orbit.yaw) * Math.cos(pitch) * d);
    camera.lookAt(tx, ty, tz);
    camera.updateMatrixWorld();
  }

  // ---- procedural textures ----
  const canvasTex = (w, h, draw, rep) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    if (rep) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(rep[0], rep[1]); }
    return tex;
  };

  const plaster = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#c9a784'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(255,235,205,${rnd(0.015, 0.05)})` : `rgba(100,62,36,${rnd(0.02, 0.06)})`;
      g.beginPath(); g.arc(rnd(0, w), rnd(0, h), rnd(10, 90), 0, 6.283); g.fill();
    }
    for (let i = 0; i < 90; i++) { // trowel strokes
      g.strokeStyle = `rgba(90,55,30,${rnd(0.03, 0.07)})`; g.lineWidth = rnd(2, 8);
      g.beginPath(); const x = rnd(0, w), y = rnd(0, h); g.moveTo(x, y); g.quadraticCurveTo(x + rnd(-80, 80), y + rnd(-30, 30), x + rnd(-160, 160), y + rnd(-60, 60)); g.stroke();
    }
  }, [2.2, 1.2]);

  const wood = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#86593a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '56,32,16' : '196,146,98'},${rnd(0.05, 0.22)})`;
      g.lineWidth = rnd(1, 2.6);
      g.beginPath();
      const ph = rnd(0, 6), amp = rnd(0.5, 3);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + ph) * amp);
      g.stroke();
    }
    for (let i = 1; i < 6; i++) { g.fillStyle = 'rgba(36,20,9,.4)'; g.fillRect(0, (h / 6) * i - 1, w, 2); }
    for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(70,40,20,.2)'; g.beginPath(); g.ellipse(rnd(0, w), rnd(0, h), rnd(8, 40), rnd(2, 6), 0, 0, 6.283); g.fill(); }
  }, [1.4, 1.1]);

  const ttTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#5a3d29'; g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    for (let r = 40; r < 250; r += 26) { g.strokeStyle = 'rgba(255,225,190,.16)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.stroke(); }
    for (let i = 0; i < 36; i++) { g.rotate(Math.PI / 18); g.fillStyle = 'rgba(255,225,190,.35)'; g.fillRect(232, -2, 18, 4); }
  });

  const winTex = canvasTex(256, 320, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#fffaf0'); gr.addColorStop(1, '#ffe2b4');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5b3d2a';
    g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
    g.fillRect(w / 2 - 4, 0, 8, h); g.fillRect(0, h / 2 - 4, w, 8);
  });

  const shaftTex = canvasTex(64, 256, (g, w, h) => { // soft-edged beam fading along its length
    const gx = g.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gx; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const gy = g.createLinearGradient(0, 0, 0, h);
    gy.addColorStop(0, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0.05)');
    g.fillStyle = gy; g.fillRect(0, 0, w, h);
  });

  // ---- room ----
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 9), new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.96 }));
  wall.position.set(0, 3.2, -3); wall.receiveShadow = true; scene.add(wall);

  const winMat = new THREE.MeshBasicMaterial({ map: winTex, toneMapped: false });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.6), winMat);
  win.position.set(-3.3, 2.5, -2.97); scene.add(win);

  const table = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 9), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.62 }));
  table.position.set(0, -0.15, 1.5); table.receiveShadow = true; scene.add(table);

  // a shelf of finished pots on the back wall
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.42), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 }));
  shelf.position.set(3.2, 1.55, -2.78); shelf.castShadow = shelf.receiveShadow = true; scene.add(shelf);
  const lathe = (pts, color, x, s) => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * s, y * s)), 28);
    const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.5 }));
    m.position.set(x, 1.585, -2.78); m.castShadow = m.receiveShadow = true; scene.add(m);
  };
  lathe([[0, 0], [0.12, 0], [0.19, 0.12], [0.2, 0.28], [0.12, 0.42], [0.08, 0.52], [0.11, 0.56]], 0x8fa89c, 2.5, 1);
  lathe([[0, 0], [0.14, 0], [0.18, 0.1], [0.17, 0.3], [0.16, 0.34]], 0xb86f4c, 3.1, 0.9);
  lathe([[0, 0], [0.1, 0], [0.22, 0.14], [0.26, 0.2], [0.24, 0.24]], 0xe3d6bd, 3.7, 0.95);

  // ---- [v8] studio details: wainscot, a second shelf, plant, water bucket, tools and sponge, slip splashes, hanging tools ----
  const swayers = []; // things that move a little in the draught
  {
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
    const add = (m, x, y, z, shadow = true) => { m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
    // wooden wainscot + skirting along the lower wall, and a rail
    add(new THREE.Mesh(new THREE.BoxGeometry(20, 0.9, 0.06), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.7, color: 0xb59a86 })), 0, 0.45, -2.96, false);
    add(new THREE.Mesh(new THREE.BoxGeometry(20, 0.05, 0.1), mat(0x4d3626)), 0, 0.92, -2.93, false);
    // lower shelf with jars and a stack of bowls
    add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.38), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 })), 3.2, 1.0, -2.78);
    const jar = (x, color, s) => { const g = new THREE.LatheGeometry([[0, 0], [0.13, 0], [0.16, 0.1], [0.15, 0.2], [0.09, 0.26], [0.1, 0.3], [0.11, 0.3]].map(([r, y]) => new THREE.Vector2(r * s, y * s)), 24); add(new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.4 })), x, 1.03, -2.78); };
    jar(2.45, 0xd8c7a6, 1.1); jar(2.8, 0x6f8c86, 0.9);
    for (let i = 0; i < 3; i++) { const g = new THREE.LatheGeometry([[0, 0], [0.1, 0], [0.2, 0.07], [0.22, 0.09]].map(([r, y]) => new THREE.Vector2(r, y))); add(new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: 0xe9e1d0, roughness: 0.4, clearcoat: 0.5 })), 3.65, 1.03 + i * 0.05, -2.78); }
    // plant on the window sill side: a pot with leaves that sway
    const leafTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#4f7a3f'; g.beginPath(); g.moveTo(w / 2, 2); g.quadraticCurveTo(w, h * 0.45, w / 2, h - 2); g.quadraticCurveTo(0, h * 0.45, w / 2, 2); g.fill(); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, h - 6); g.stroke(); });
    const plant = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 20), mat(0xb4694a)); pot.position.y = 0.15; pot.castShadow = true; plant.add(pot);
    for (let i = 0; i < 9; i++) {
      const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.42), new THREE.MeshStandardMaterial({ map: leafTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 }));
      const a = (i / 9) * Math.PI * 2; lf.position.set(Math.cos(a) * 0.05, 0.5, Math.sin(a) * 0.05);
      lf.rotation.set(0.35 * Math.sin(a), a, 0.55 * Math.cos(a) * 0.6 + 0.3); lf.userData.ph = i; lf.userData.bx = 0.35 * Math.sin(a); plant.add(lf); swayers.push(lf);
    }
    plant.position.set(-5.2, 0, -2.4); scene.add(plant);
    // water bucket with a sponge, left front of the table; throwing ribs and a wire cutter on a board
    const bucket = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.5, 28, 1, true), mat(0x6e7a80, { metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide })), -2.5, 0.25, 0.6);
    add(new THREE.Mesh(new THREE.CircleGeometry(0.31, 28), new THREE.MeshStandardMaterial({ color: 0x8a97a0, roughness: 0.1, metalness: 0.2 })), -2.5, 0.42, 0.6, false).rotation.x = -Math.PI / 2;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.2), mat(0xd9b24c, { roughness: 0.95 })), -1.8, 0.05, 1.2).rotation.y = 0.4;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.5), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6, color: 0xcaa07a })), -1.5, 0.02, 2.2).rotation.y = -0.2;
    for (let i = 0; i < 3; i++) { const rib = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3 + i * 0.05, 8), mat(0xa9763f)), -1.7 + i * 0.22, 0.06, 2.2); rib.rotation.set(Math.PI / 2, 0, 0.5 + i * 0.3); }
    add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), mat(0xa88f78, { roughness: 0.95 })), 1.9, 0.07, 1.4).scale.set(1.4, 0.8, 1); // a spare ball of clay
    // slip splashes on the table around the wheel
    for (let i = 0; i < 9; i++) { const sp = add(new THREE.Mesh(new THREE.CircleGeometry(0.03 + Math.random() * 0.06, 14), new THREE.MeshStandardMaterial({ color: 0xcdb596, roughness: 0.9, transparent: true, opacity: 0.55 })), (Math.random() - 0.5) * 2.6, 0.003, 0.6 + Math.random() * 1.2, false); sp.rotation.x = -Math.PI / 2; }
    // tools hanging from a rail on the back wall
    add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.05), mat(0x4d3626)), -0.6, 2.3, -2.93, false);
    for (let i = 0; i < 5; i++) { const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.01, 0.32 + (i % 3) * 0.06, 8), mat(i % 2 ? 0x9a6a3a : 0x6b4a2a)), -1.1 + i * 0.25, 2.08, -2.9); }
  }
  // a faint vignette-like darker wall edge keeps the room from looking flat

  const turn = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.08, 64), new THREE.MeshStandardMaterial({ color: 0x4a3224, roughness: 0.6 }));
  base.position.y = 0.04; base.castShadow = base.receiveShadow = true; scene.add(base);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 64), new THREE.MeshStandardMaterial({ map: ttTex, roughness: 0.5 }));
  disc.position.y = 0.105; disc.castShadow = disc.receiveShadow = true; turn.add(disc);
  scene.add(turn);

  // ---- the pot ----
  const potGroup = new THREE.Group();
  potGroup.position.y = TT_TOP;
  turn.add(potGroup);
  const pm = new PotMesh(clay, { maxAniso });
  potGroup.add(pm.root);

  // ---- lighting: window light with soft falloff, warm bounce, a small lamp, cool rim, faint light shafts ----
  const winLight = new THREE.SpotLight(0xffe2b8, 55, 0, 0.5, 1, 2);
  winLight.position.set(-3.4, 2.8, -1.8);
  winLight.target.position.set(0, 0.7, 0.1);
  winLight.castShadow = true;
  winLight.shadow.mapSize.set(1024, 1024); // [v3] 2048 -> 1024: a lighter render loop keeps the hand pointer responsive
  winLight.shadow.bias = -0.0004;
  winLight.shadow.normalBias = 0.02;
  winLight.shadow.camera.near = 1; winLight.shadow.camera.far = 14;
  const bounce = new THREE.HemisphereLight(0xffe4c4, 0x6b4630, 0.5);
  const lamp = new THREE.PointLight(0xffa35a, 7, 0, 2);
  lamp.position.set(3.3, 1.5, 0.7);
  const rimLight = new THREE.DirectionalLight(0xbfd3ff, 0.45);
  rimLight.position.set(2.5, 3, -3);
  scene.add(winLight, winLight.target, bounce, lamp, rimLight);

  const shafts = [];
  {
    const S = new THREE.Vector3(-3.3, 2.7, -2.8), E = new THREE.Vector3(-0.3, 0.05, 0.5);
    const dir = E.clone().sub(S), len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffe2b0, fog: false }));
      m.position.copy(S).lerp(E, 0.5).add(new THREE.Vector3(i * 0.18 - 0.27, 0, i % 2 ? 0.12 : -0.1));
      m.quaternion.copy(q);
      m.rotateY((i * Math.PI) / 4 + 0.3);
      m.scale.set(0.7 + (i % 2) * 0.35, len, 1);
      m.renderOrder = 5;
      scene.add(m); shafts.push(m);
    }
  }

  // floating dust in the window light
  const DUST = 110;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dustPos.set([rnd(-3, 1.4), rnd(0.2, 3.2), rnd(-1.8, 1.8)], i * 3);
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustTex = canvasTex(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  });
  const dustMat = new THREE.PointsMaterial({ size: 0.035, map: dustTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dg, dustMat);
  scene.add(dust);

  // real clock -> light colour/strength; evaluated twice a second, smooth by construction
  const winDay = new THREE.Color(), winNight = new THREE.Color(0.1, 0.14, 0.28);
  function applyTime() {
    const k = skyAt(hoursNow());
    winLight.color.setRGB(...k.lightCol);
    winLight.intensity = 7 + 50 * k.day;
    lamp.intensity = 6 + 9 * k.night;
    bounce.intensity = 0.3 + 0.3 * k.day;
    rimLight.intensity = 0.2 + 0.3 * k.day;
    scene.environmentIntensity = 0.22 + 0.2 * k.day;
    winDay.setRGB(Math.min(1, k.lightCol[0] * 1.15), Math.min(1, k.lightCol[1] * 1.1), Math.min(1, k.lightCol[2] * 1.1));
    winMat.color.copy(winNight).lerp(winDay, k.day);
    for (const s of shafts) { s.material.opacity = 0.13 * k.day * (1 - 0.4 * k.twi); s.material.color.setRGB(...k.lightCol); }
    dustMat.opacity = 0.2 + 0.4 * k.day;
  }
  applyTime();
  setInterval(applyTime, 500);

  // ---- hover / brush guides + ornament selection ring ----
  const guides = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    g.renderOrder = 20; g.visible = false; scene.add(g); guides.push(g);
  }
  // [v24] glaze / pigment brush: a visible paintbrush (wooden handle, metal ferrule, bristle tuft in the colour being applied) that follows
  // the finger over the pot while painting or glazing, and waits beside the pot (gently bobbing) when it is not touching.
  const RELIEF_ON = false; // [v27] raised glaze / incised carving temporarily disabled (UI hidden, strokes stay flat)
  const brushTool = new THREE.Group(), bristleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  { const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.55 }), steel = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.3, metalness: 0.8 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, 0.8, 12), wood); handle.position.set(0, 0.57, 0);
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.16, 12), steel); ferrule.position.set(0, 0.2, 0);
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.26, 14), bristleMat); tuft.rotation.x = Math.PI; tuft.position.set(0, 0.05, 0); // tip points down, ends at y = -0.08
    brushTool.add(handle, ferrule, tuft); brushTool.position.y = 0; brushTool.visible = false; brushTool.renderOrder = 21;
    brushTool.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    brushTool.scale.setScalar(1.5);
    scene.add(brushTool); }
  // [v8] trimming tool (a wooden-handled loop tool). It follows the finger / mouse over the pot while trimming and scrapes the wall.
  const trimTool = new THREE.Group();
  { const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.6 }), steel = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.3, metalness: 0.8 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.7, 12), wood); handle.position.set(0, 0.42, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), steel); neck.position.set(0, 0.005, 0);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.009, 8, 24), steel); loop.position.set(0, -0.06, 0); loop.rotation.x = Math.PI / 2;
    trimTool.add(handle, neck, loop); trimTool.visible = false; trimTool.renderOrder = 21;
    trimTool.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    trimTool.scale.setScalar(1.5);
    scene.add(trimTool); }
  const selRing = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  selRing.renderOrder = 22; selRing.visible = false; scene.add(selRing);

  // ---- resize ----
  const overlay = $('#overlay');
  const octx = overlay.getContext('2d');
  let dpr = 1;
  // [v3] Render resolution cap. Starts at 1.5 and is lowered automatically when frames get slow, because a slow render loop
  // is felt as gesture lag (the hand tracker and WebGL share the GPU).
  let dprCap = 1.5;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr);
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  frameCamera(0);

  // ---- hit testing, always in the pot's own space so the spinning turntable never shifts the finger position ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setRay(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function hitTest(cx, cy) {
    setRay(cx, cy);
    const hits = ray.intersectObject(pm.mesh, false);
    if (!hits.length) return null;
    const h = hits[0];
    const local = pm.mesh.worldToLocal(h.point.clone());
    let theta = Math.atan2(local.z, local.x);
    if (theta < 0) theta += Math.PI * 2;
    const nl = h.face.normal;
    const radial = nl.x * Math.cos(theta) + nl.z * Math.sin(theta);
    const inner = h.face.materialIndex === 1;
    const sideSign = inner && Math.abs(radial) > 0.25 ? -1 : 1;
    const nw = nl.clone().transformDirection(pm.mesh.matrixWorld);
    // [v3] top: the hit is on the dome of a closed lump (above the top row); pressing there opens the clay
    return { point: h.point, normal: nw, theta, y: clamp(local.y, 0, clay.height()), inner, sideSign, top: !inner && local.y > clay.height() + 0.01 };
  }
  const worldPerPx = () => (2 * camState.dist * orbit.zoom * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, canvas.clientHeight);

  // ---- undo ----
  const btnUndo = $('#btnUndo');
  function pushUndo() {
    undoStack.push(clay.snapshot());
    if (undoStack.length > 24) undoStack.shift();
    btnUndo.disabled = false;
  }
  btnUndo.addEventListener('click', () => {
    const s = undoStack.pop();
    if (!s) return;
    clay.restore(s);
    selectOrn(null);
    syncTextureUi();
    btnUndo.disabled = undoStack.length === 0;
  });


  // [v28] practice API for the hands-on tutorial: live hand readout, real progress counters, and a scratch pot that is swapped back afterwards
  const tutWork = { push: 0, pull: 0, lift: 0, draw: 0 }; // [v28] seconds of real effect on the pot per tool (lift: rows added / 10)
  const tutSaved = {};
  const tutApi = {
    hand: () => { const h = (state.hands || []).find((x) => !x.stale); return h ? { gesture: h.gesture, ratio: h.ratio } : null; },
    work: () => tutWork,
    opened: () => !clay.solid,
    canPractice: () => !isAncient() || stepId() === 'throw', // shaping tools only work on the throwing step of the traditional process
    canPaint: () => !isAncient(),
    potBox() { // screen bounds of the pot (projected from its real extent) so the prompt box can stay off it
      const H = Math.max(clay.height(), 0.3); let rm = 0.4; for (let k = 0; k < 8; k++) for (let f = 0; f <= 4; f++) rm = Math.max(rm, clay.radiusAt(H * f / 4, k * Math.PI / 4));
      try { const rc = canvas.getBoundingClientRect(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const yy of [0, H]) { const v = new THREE.Vector3(sx * rm, TT_TOP + yy, sz * rm).project(camera), px = rc.left + (v.x * 0.5 + 0.5) * rc.width, py = rc.top + (-v.y * 0.5 + 0.5) * rc.height; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
        if (isFinite(x0) && x1 - x0 > 20) return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }; } catch {}
      return potRect();
    },
    // ---- [v33] wheel comparison: two scratch copies of the clay (no meshes), drawn as small top-down rings + side profiles ----
    cmp: null,
    cmpStart() {
      const mk = () => { const c = new Clay(0.25); c.n = clay.n; c.solid = clay.solid; c.thick = clay.thick; c.radii.set(clay.radii); return c; };
      const row = Math.max(2, Math.floor(clay.n * 0.5)); let m = 0; for (let j = 0; j < SEGS; j++) m += clay.radii[row * SEGS + j]; tutApi.cmpBase = m / SEGS;
      tutApi.cmp = { on: mk(), off: mk() }; tutApi.cmpA0 = 0; tutApi.cmpA0 = tutApi.cmpAsym(); // only the change counts (the pot may not be perfectly round already)
    },
    cmpStop() { tutApi.cmp = null; },
    cmpAsym() { const c = tutApi.cmp; if (!c) return 0; const row = Math.max(2, Math.floor(c.off.n * 0.5)); let lo = 1e9, hi = -1e9; for (let j = 0; j < SEGS; j++) { const r = c.off.radii[row * SEGS + j]; lo = Math.min(lo, r); hi = Math.max(hi, r); } return Math.max(0, (hi - lo) / Math.max(0.05, tutApi.cmpBase || 0.5) - (tutApi.cmpA0 || 0)); },
    cmpDraw(cv, which) {
      const c = tutApi.cmp; if (!c) return; const cl = c[which], g = cv.getContext('2d'), W = cv.width, Hh = cv.height, base = tutApi.cmpBase || 0.5;
      const sc = Math.min(Hh * 0.42, W * 0.22) / (base * 1.35), row = Math.max(2, Math.floor(cl.n * 0.5));
      g.clearRect(0, 0, W, Hh); g.imageSmoothingEnabled = false;
      // top-down ring at the wall's height (dashed circle = the original round)
      const cx = W * 0.27, cy = Hh * 0.5; g.strokeStyle = 'rgba(35,22,15,.35)'; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, base * sc, 0, 6.2832); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#d9a87a'; g.strokeStyle = '#23160f'; g.lineWidth = 2; g.beginPath();
      for (let j = 0; j <= SEGS; j++) { const k = j % SEGS, r = cl.radii[row * SEGS + k] * sc, a = k * Math.PI * 2 / SEGS; const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a); j ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath(); g.fill(); g.stroke();
      // side profile
      const px = W * 0.72, bot = Hh * 0.9, s2 = Math.min(sc, (Hh * 0.8) / Math.max(0.2, cl.n * DY)); g.beginPath();
      for (let i = 0; i < cl.n; i++) g.lineTo(px + cl.radii[i * SEGS] * s2 * 0.75, bot - i * DY * s2);
      for (let i = cl.n - 1; i >= 0; i--) g.lineTo(px - cl.radii[i * SEGS + SEGS / 2] * s2 * 0.75, bot - i * DY * s2);
      g.closePath(); g.fillStyle = '#d9a87a'; g.fill(); g.stroke();
    },
    paused: () => state.paused,
    setPaused(v) { state.paused = !!v; paintPause(); },
    ensureOpen() { if (clay.solid) clay.openClay(); },
    camLive: () => !!(cam && cam.stream && cam.tracker && cam.tracker.ready), // the camera is running AND the hand model is ready
    camError: () => (cam && cam.lastError) || null,
    tool: () => state.tool,
    // is a hand over the part of the pot this sub-step is about? push: the top of the lump; pull: the wall; lift: the upper wall near the rim
    over(kind) {
      const H = clay.height();
      return [...pointers.values()].some((q) => { const h = q.lastHit; if (!h || h.inner) return false;
        return kind === 'press' ? (clay.solid ? h.top : true) : kind === 'lift' ? !h.top && h.y > H * 0.5 : !h.top; });
    },
    // screen position of the practice dot for a tool (projected from a real point on the pot, so it follows the pot's shape)
    anchor(kind) {
      const H = clay.height(), th = Math.PI / 3, y = kind === 'press' ? H : kind === 'lift' ? H * 0.9 : H * 0.5;
      const r = kind === 'press' ? 0 : clay.radiusAt(y, th);
      let v; try { v = new THREE.Vector3(r * Math.cos(th), TT_TOP + y + (kind === 'press' ? 0.04 : 0), r * Math.sin(th)).project(camera); } catch { v = { x: 0, y: 0 }; }
      const rc = canvas.getBoundingClientRect();
      return { x: rc.left + (v.x * 0.5 + 0.5) * rc.width, y: rc.top + (-v.y * 0.5 + 0.5) * rc.height };
    },
    begin() {
      Object.assign(tutSaved, { paused: state.paused, snap: clay.snapshot(), stack: undoStack.slice(), stage: state.stage, tool: state.tool, paintTool: state.paintTool, tab: state.decorTab });
      undoStack.length = 0; btnUndo.disabled = true;
      for (const k in tutWork) tutWork[k] = 0;
      if (tutApi.canPractice()) { const f = { ...clay.finish }; clay.setPreset('lump'); clay.finish = f; clay.rebuildFinish(); } // a fresh lump to practise on, in the SAME material as the player's pot
    },
    end() {
      if (!tutSaved.snap) return;
      clay.restore(tutSaved.snap);
      undoStack.length = 0; for (const s of tutSaved.stack) undoStack.push(s); btnUndo.disabled = undoStack.length === 0;
      if (!isAncient()) { state.stage = tutSaved.stage; state.paintTool = tutSaved.paintTool; state.decorTab = tutSaved.tab; }
      state.paused = !!tutSaved.paused; paintPause(); // the wheel goes back to how the player had it
      setTool(tutSaved.tool); syncStage(); selectOrn(null); syncTextureUi();
      tutSaved.snap = null; tutApi.focus(null);
    },
    focus: (g) => { state.tutFocus = g || null; if (cam) cam.focus = g || null; },
    tick: () => sfx.pick(3) // soft confirmation chime
  };
  // ---- pointers: mouse, touch and up to two hands share one code path ----
  const pointers = new Map();
  // [v13] on an unglazed body (clay / dry / trimmed / bisque / raw) hand-painted colours and patterns are boosted in saturation so they read clearly
  const BODY_FINISHES = ['clay', 'dry', 'trim', 'bisque', 'raw'];
  function vivid(hex) {
    if (!BODY_FINISHES.includes(clay.finish.id)) return hex;
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.08) return hex; // greys, black and white stay as they are
    let l = (mx + mn) / 2, sat = d / (1 - Math.abs(2 * l - 1)), h;
    if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    sat = Math.min(1, sat * 1.6 + 0.25); l = Math.min(0.52, Math.max(0.32, l));
    const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2;
    const [rr, gg, bb] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    const hx = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + hx(rr) + hx(gg) + hx(bb);
  }
  const inkOf = (pat) => vivid(pat.ink || state.glazeHex);

  function pickOrn(x, y) {
    scene.updateMatrixWorld();
    setRay(x, y);
    return pm.pickOrnament(ray);
  }

  function beginAction(p, act) {
    if (state.locked) { p.action = null; return; } // [v10] time is up: nothing can be edited any more
    if (act === p.action) return;
    if (p.action === 'trim') trimStrokeEnd(p); // [v5] a finished trimming stroke counts towards the step
    const prevAct = p.action;
    p.action = act;
    if (act && !prevAct) sfx.grab(); else if (!act && prevAct) sfx.release(); // [v15] fingers meet the clay / let go
    p.stroke = {}; p.rstroke = {}; p.cmpTheta = null;
    p.liftRow = null; p.liftAcc = 0; p.dragId = null;
    p.holdT = 0; p.miss = 0; // [v3] hold time (ease-in of push/pull) and lost-gesture counter
    if (!act) return;
    if (act === 'drag') {
      const id = pickOrn(p.x, p.y);
      if (id) { pushUndo(); p.dragId = id; selectOrn(id); }
    } else pushUndo();
    if (act === 'push' || act === 'pull' || act === 'lift') emit('act');
  }

  function mouseAction(e) {
    if (state.mode === 'ancient' && modeKey() !== 'shape') return MODES[modeKey()].actions[0] || null; // [v5]
    if (state.stage === 'shape') {
      const base = state.tool;
      return base !== 'lift' && (e.button === 2 || e.shiftKey) ? (base === 'push' ? 'pull' : 'push') : base;
    }
    if (state.stage === 'glaze') return state.paintTool === 'pattern' ? 'pattern' : 'glaze'; // [v17] Painting stage: brush or pattern stamps
    return state.decorTab === '3d' ? 'drag' : 'gbrush'; // Decoration: Texture = glaze brush
  }

  const keyOf = (e) => (e.pointerType === 'mouse' ? 'mouse' : 'p' + e.pointerId);
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button === 1) return;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    const key = keyOf(e);
    const p = pointers.get(key) || { kind: e.pointerType === 'mouse' ? 'mouse' : 'touch', action: null };
    p.x = e.clientX; p.y = e.clientY; p.prevY = e.clientY;
    pointers.set(key, p);
    beginAction(p, mouseAction(e));
  });
  canvas.addEventListener('pointermove', (e) => {
    const key = keyOf(e);
    let p = pointers.get(key);
    if (!p) {
      if (e.pointerType !== 'mouse') return;
      p = { kind: 'mouse', action: null, prevY: e.clientY };
      pointers.set('mouse', p);
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const endPtr = (e) => {
    if (e.pointerType === 'mouse' && e.button === 1) return; // [v5] releasing the middle button is a view action only
    const key = keyOf(e);
    const p = pointers.get(key);
    if (!p) return;
    if (p.kind === 'mouse') beginAction(p, null); else pointers.delete(key);
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !e.buttons) pointers.delete('mouse'); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // [v5] middle mouse button = view control (like Blender): drag to orbit; the wheel zooms. [v6] pan, Ctrl-zoom and double-click reset were removed
  let viewDrag = null;
  canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // no browser auto-scroll
  canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 1) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    viewDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!viewDrag || e.pointerId !== viewDrag.id) return;
    if (!(e.buttons & 4)) { viewDrag = null; return; } // the middle button was released somewhere else
    const dx = e.clientX - viewDrag.x, dy = e.clientY - viewDrag.y;
    viewDrag.x = e.clientX; viewDrag.y = e.clientY;
    emit('orbit');
    { // orbit (middle drag): drag right turns the pot to the right, drag down looks from higher up
      orbit.yaw -= dx * 0.008;
      orbit.pitch += dy * 0.008;
      orbit.pitch = Math.min(1.5 - PITCH, Math.max(0.03 - PITCH, orbit.pitch));
    }
  });
  const endView = (e) => { if (viewDrag && e.pointerId === viewDrag.id) viewDrag = null; };
  canvas.addEventListener('pointerup', endView);
  canvas.addEventListener('pointercancel', endView);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.zoom = Math.min(2.4, Math.max(0.35, orbit.zoom * Math.exp(e.deltaY * 0.001)));
    emit('orbit');
  }, { passive: false });

  // ---- hands -> stage coordinates. Same mapping for the pointer, the skeleton overlay and the camera window flip. ----
  function mapNorm(nx, ny, W, H) {
    const gx = state.mirror ? 1 - nx : nx;
    return { x: clamp((gx - 0.5) * GAIN + 0.5, -0.1, 1.1) * W, y: clamp((ny - 0.5) * GAIN + 0.5, -0.1, 1.1) * H };
  }
  // ---- [v3] mode isolation (shaping / glazing / decoration) ---------------------------------------------------
  // Before, "pinch" and "point" were both live in the shape and glaze stages, so shaping and glazing leaked into each other.
  // Now every mode owns exactly ONE hand gesture and a fixed list of actions; everything else is ignored:
  //   shape   -> pinch  -> push / pull               glaze -> point -> glaze
  //   pattern -> point  -> pattern brush              drag  -> pinch -> move a 3D ornament        texture -> (no hand gesture)
  // Four layers enforce it: (1) the classifier only produces the mode's gesture (interp.setMode),
  // (2) handAction() maps only that gesture, (3) a mode switch cancels running actions and "disarms" every hand until it
  // has left the gesture once, (4) processPointers() drops any action the mode does not allow.
  const MODES = {
    shape: { gesture: 'pinch', actions: ['push', 'pull', 'lift'] },
    glaze: { gesture: 'point', actions: ['glaze'] },
    gbrush: { gesture: 'point', actions: ['gbrush'] }, // [v21] glaze brush: the glaze texture is painted on, only where brushed
    pattern: { gesture: 'point', actions: ['pattern'] },
    drag: { gesture: 'pinch', actions: ['drag'] },
    texture: { gesture: 'none', actions: [] },
    trim: { gesture: 'point', actions: ['trim'] } // [v5] light trimming of the dry blank (Ancient Craft)
  };
  // [v5] in Ancient Craft mode the current step decides what the player may do (automatic steps: nothing)
  const ancientKey = () => {
    const id = STEPS[state.step].id;
    if (id === 'throw') return 'shape';
    if (id === 'trim') return 'trim';
    if (id === 'glaze') return 'gbrush'; // glazing: brush the chosen glaze on
    if (id === 'decor') return state.paintTool === 'pattern' ? 'pattern' : 'glaze'; // painting: brush or patterns (both underglaze)
    return 'texture'; // drying, kilns, glazing, cooling: no hand gesture
  };
  const modeKey = () => state.mode === 'ancient' ? ancientKey() : (state.stage === 'decor' ? (state.decorTab === '3d' ? 'drag' : 'gbrush') : state.stage === 'glaze' && state.paintTool === 'pattern' ? 'pattern' : state.stage);
  const activeGesture = () => MODES[modeKey()].gesture;
  const actionAllowed = (a) => MODES[modeKey()].actions.includes(a);
  function handAction(g) {
    const m = modeKey();
    if (g !== MODES[m].gesture) return null; // not this mode's gesture: no action at all
    return m === 'shape' ? state.shapeMode : MODES[m].actions[0]; // push or pull
  }
  let camInterp = null; // the hand interpreter, set once the camera exists
  const applyInterpMode = () => { if (camInterp) camInterp.setMode(activeGesture()); };
  let lastMode = null;
  function onModeChange() {
    const m = modeKey();
    if (m === lastMode) return;
    lastMode = m;
    for (const p of pointers.values()) {
      beginAction(p, null); // end every running stroke / drag at once
      if (p.kind === 'hand') p.disarm = true; // a hand that is already holding the new gesture must release it first
    }
    applyInterpMode();
  }

  // [v3] Hand position at render time: filtered position + velocity * (time since the detection + look-ahead).
  // The camera delivers ~30 positions per second; this makes the pointer move on every rendered frame instead.
  function predictNorm(h, now) {
    const el = h.stale ? 0 : clamp((now - h.t * 1000) / 1000 + LEAD_S, 0, MAX_PRED_S);
    return { x: h.x + (h.vx || 0) * el, y: h.y + (h.vy || 0) * el };
  }
  // [v23] "lazy brush" stabiliser for hand painting. The raw fingertip carries a small tremor (a few pixels, 5-10 Hz) that
  // turned into shaky lines. While a brush / pattern gesture is active the brush point follows the fingertip on a short
  // invisible string: a fingertip movement smaller than the string (STABILIZE_FRAC of the canvas height) is ignored
  // completely, a real stroke drags the point along (it trails the finger by at most the string length), and a light
  // low-pass rounds off the corners. Hovering (no stroke yet) is not stabilised, so aiming stays direct.
  const STABILIZE_FRAC = 0.007, STABILIZE_SOFT = 0.45;
  const DRAW_MODES = ['glaze', 'gbrush', 'pattern'];
  function placeHand(p, h, now) {
    const r = canvas.getBoundingClientRect();
    const draw = DRAW_MODES.includes(modeKey());
    // no look-ahead while drawing: extrapolating the velocity would amplify the tremor
    const q = draw ? { x: h.x, y: h.y } : predictNorm(h, now), m = mapNorm(q.x, q.y, r.width, r.height);
    const rx = r.left + m.x, ry = r.top + m.y;
    if (!draw || !p.action || !DRAW_MODES.includes(p.action) || p.sx == null) { p.x = rx; p.y = ry; p.sx = rx; p.sy = ry; return; }
    const R = STABILIZE_FRAC * r.height, dx = rx - p.sx, dy = ry - p.sy, d = Math.hypot(dx, dy);
    if (d > R) { const k = (d - R) / d; p.sx += dx * k; p.sy += dy * k; } // the string pulls the brush point
    p.x += (p.sx - p.x) * STABILIZE_SOFT; p.y += (p.sy - p.y) * STABILIZE_SOFT; // round off the corners
  }

  const chip = $('#camChip');
  let hadHands = false;
  function handleHands(hands) {
    if (!!hands.length !== hadHands) { hadHands = !!hands.length; if (hadHands) sfx.handFound(); else sfx.handLost(); } // [v15] soft cue when a hand is found / lost
    state.hands = hands;
    const seen = new Set();
    const want = activeGesture(), now = performance.now();
    for (const h of hands) {
      const id = 'h' + h.slot;
      seen.add(id);
      let p = pointers.get(id);
      if (!p) { p = { kind: 'hand', action: null, disarm: false }; pointers.set(id, p); placeHand(p, h, now); p.prevY = p.y; }
      p.hand = h;
      placeHand(p, h, now);
      let act = handAction(h.gesture);
      if (p.disarm) { // after a mode switch: stay idle until this hand has dropped the mode's gesture once
        if (h.gesture === want) act = null; else p.disarm = false;
      }
      // pointing strokes survive up to two frames of lost "point" classification (a flickering classifier no longer cuts a line)
      if (act) p.miss = 0;
      else if (p.action && want === 'point' && !p.disarm && !h.stale && ++p.miss < 3) act = p.action;
      beginAction(p, act);
    }
    for (const [id, p] of pointers) if (p.kind === 'hand' && !seen.has(id)) { beginAction(p, null); pointers.delete(id); }
    chip.textContent = cam.stream && cam.tracker.ready
      ? (hands.length
        ? t('mode.' + modeKey()) + '   ' + hands.map((h) => (h.gesture === want ? '● ' : '○ ') + t('gs.' + h.gesture)).join('  /  ')
        : t('g.none'))
      : '';
  }

  // ---- per-frame editing ----
  const guideCol = new THREE.Color();
  function processPointers(dt) {
    scene.updateMatrixWorld();
    let gi = 0, active = false, toolShown = false;
    for (const p of pointers.values()) {
      if (p.action && !actionAllowed(p.action)) beginAction(p, null); // [v3] layer 4: never run a tool of another mode
      const hit = hitTest(p.x, p.y);
      p.lastHit = hit; // [v24] the brush tool follows it
      const a = p.action;
      if (a) active = true;

      // guide ring on the surface
      const g = guides[gi];
      if (hit && g) {
        gi++;
        g.visible = true;
        g.position.copy(hit.point).addScaledVector(hit.normal, 0.012);
        g.lookAt(g.position.clone().add(hit.normal));
        let size = 0.1;
        if (modeKey() === 'trim') size = 0.12; // [v5]
        else if (a === 'push' || a === 'pull' || a === 'lift' || (!a && state.stage === 'shape')) size = 0.15;
        else if (a === 'pattern' || (!a && state.stage === 'glaze' && state.paintTool === 'pattern')) size = state.pattern.scale * 0.5;
        else if (a === 'gbrush' || (!a && state.stage === 'decor' && state.decorTab === 'texture')) size = state.brush * 1.5;
        else if (a === 'glaze' || (!a && state.stage === 'glaze')) size = state.brush * 1.5;
        else if (false) size = state.pattern.scale * 0.5;
        g.scale.setScalar(size);
        if (modeKey() === 'trim') guideCol.set('#f0d9a8');
        else if (a === 'pattern' || (!a && state.stage === 'glaze' && state.paintTool === 'pattern')) guideCol.set('#ffe9a8');
        else if (a === 'gbrush' || (!a && state.stage === 'decor' && state.decorTab === 'texture')) guideCol.set('#ffffff');
        else if (a === 'glaze' || (!a && state.stage === 'glaze')) guideCol.set(state.glazeHex);
        else if (a === 'push') guideCol.set('#ff9d6b');
        else if (a === 'pull') guideCol.set('#8fe0a8');
        else if (a === 'lift') guideCol.set('#8fd0ff');
        else if (a === 'pattern') guideCol.set('#ffe9a8');
        else guideCol.set('#cfeaff');
        g.material.color.copy(guideCol);
        g.material.opacity = a ? 0.95 : 0.5;
      }

      if (a === 'push' || a === 'pull') {
        if (hit) {
          // [v3] ease-in so the finger sinks in gradually instead of denting the clay at once; [v6] now over SHAPE_RAMP_S (slower)
          p.holdT = (p.holdT || 0) + dt; tutWork[a] += dt; // [v28] practice progress for the tutorial
          const k = clamp(p.holdT / SHAPE_RAMP_S, 0, 1), ease = k * k * (3 - 2 * k);
          // [v3] pressing the dome of a closed lump opens it (pinch pot)
          if (a === 'push' && clay.solid && hit.top && clay.openClay()) { toast(t('msg.opened')); sfx.squish(1); }
          // [v3] a closed lump is shaped locally (free pinching) even while the turntable spins; hollow vessels keep the ring behaviour
          clay.deform(hit.theta, hit.y, (a === 'push' ? -1 : 1) * hit.sideSign, PUSH_RATE * dt * ease, SHAPE_SIGMA, !state.paused && !clay.solid);
          // [v22] raw clay on a turning wheel: pressing / stretching gradually evens the clay out towards a rotationally symmetric shape
          if (!state.paused && (!isAncient() || stepId() === 'throw')) clay.regularize(dt * REGULARIZE_RATE * ease);
          if (tutApi.cmp) { // [v33] tutorial wheel comparison: the same push goes into two small copies, one "wheel on" (whole ring) and one "wheel off" (only the touched spot)
            const dirv = (a === 'push' ? -1 : 1) * hit.sideSign, amt = PUSH_RATE * dt * ease, ring = !clay.solid;
            if (p.cmpTheta == null) p.cmpTheta = hit.theta;
            tutApi.cmp.on.deform(hit.theta, hit.y, dirv, amt, SHAPE_SIGMA, ring); tutApi.cmp.on.regularize(dt * REGULARIZE_RATE * ease);
            tutApi.cmp.off.deform(p.cmpTheta, hit.y, dirv, amt, SHAPE_SIGMA, false);
          }
          sfx.hold('clay', 0.3 + 0.7 * ease); // [v15] wet clay moving under the fingers; louder as the finger sinks in
        }
      } else if (a === 'lift') {
        if (p.liftRow == null && hit) p.liftRow = clay.clampRow(Math.round(hit.y / DY));
        if (p.liftRow != null) {
          p.liftAcc += (p.prevY - p.y) * worldPerPx() * LIFT_GAIN; // finger moving up the screen pulls the wall up
          let n = 0;
          while (p.liftAcc >= DY && n < 6) { if (!clay.insertRow(p.liftRow)) { p.liftAcc = 0; break; } p.liftAcc -= DY; n++; tutWork.lift += 0.1; }
          while (p.liftAcc <= -DY && n < 6) { if (!clay.removeRow(p.liftRow)) { p.liftAcc = 0; break; } p.liftAcc += DY; n++; }
          p.liftRow = clay.clampRow(p.liftRow);
          { const sp = Math.min(1, Math.abs(p.prevY - p.y) / 14); if (sp > 0.04) sfx.hold('lift', sp); }
          if (n) clay.liftBlend(p.liftRow); // flowing S-curve
        }
      } else if (a === 'glaze') {
        if (hit) {
          if (hit.inner) clay.setInnerColor(state.glazeHex); // inside surfaces take one even glaze colour
          else { tutWork.draw += dt; clay.paintStroke(p.stroke, hit.theta, hit.y, vivid(state.glazeHex), state.brush, clamp(dt * 14, 0.1, 0.7), state.opacity);
            if (RELIEF_ON && state.brushRelief !== 'flat') clay.paintReliefStroke(p.rstroke || (p.rstroke = {}), hit.theta, hit.y, state.brushRelief === 'convex' ? 1 : -1, state.brush, clamp(dt * 14, 0.1, 0.7), 0.9 * state.opacity);
            const mv = p.bx != null ? Math.hypot(p.x - p.bx, p.y - p.by) : 0; if (mv > 0.8) sfx.hold('brush', Math.min(1, mv / 18)); } // [v5] opacity cap; [v15] brush sound follows the speed
          p.bx = p.x; p.by = p.y;
        } else { p.stroke = {}; p.rstroke = {}; p.cmpTheta = null; }
      } else if (a === 'gbrush') {
        // [v21] glaze brush: paints the glaze mask; the chosen glaze texture appears exactly under the strokes
        if (hit && !hit.inner) {
          clay.paintMaskStroke(p.stroke, hit.theta, hit.y, state.brush, clamp(dt * 14, 0.1, 0.9), 1);
          const mv = p.bx != null ? Math.hypot(p.x - p.bx, p.y - p.by) : 0; if (mv > 0.8) sfx.hold('brush', Math.min(1, mv / 18));
          p.bx = p.x; p.by = p.y;
        } else { p.stroke = {}; p.rstroke = {}; p.cmpTheta = null; }
      } else if (a === 'trim') {
        // [v5] light trimming: shavings fly off the wall under the finger (the shape is never changed); each finished stroke counts
        if (hit) {
          // [v8] the loop tool sits on the wall under the finger, tilted like a scraping hand, and wiggles slightly while it moves
          toolShown = true;
          trimTool.position.copy(hit.point).addScaledVector(hit.normal, 0.03);
          trimTool.up.set(0, 1, 0); trimTool.lookAt(trimTool.position.clone().add(hit.normal));
          trimTool.rotateX(0.75); // [v26] handle leans up and OUT toward the viewer (was pointing into the pot)
          trimTool.rotateZ(Math.sin(performance.now() / 70) * 0.05);
          const moved = p.lx != null ? Math.hypot(p.x - p.lx, p.y - p.ly) : 0;
          // [v13] trimming is purely visual: the body keeps its shape exactly (no smoothing, no groove, no deformation)
          p.trimPx = (p.trimPx || 0) + moved;
          shFloor = hit.point.y - hit.y; trimPt.copy(hit.point);
          if (moved > 1.5) { emitShavings(hit.point, moved > 12 ? 3 : 1); sfx.hold('scrape', Math.min(1, moved / 22)); } // [v15] scraping sound follows the speed
          if (moved > 1.5 && isAncient() && stepId() === 'trim' && !anc.trimDone) { anc.trimT += dt; if (anc.trimT >= anc.trimStrokes + 1) trimTick(); } // [v10] ~5 s of real scraping
        }
        p.lx = p.x; p.ly = p.y;
      } else if (a === 'pattern') {
        if (hit && !hit.inner) {
          const pat = patternById(state.pattern.id), size = state.pattern.scale;
          clay.reliefSign = !RELIEF_ON ? 0 : state.patRelief === 'convex' ? 1 : state.patRelief === 'concave' ? -1 : 0; // [v24] raised / sunken pattern
          clay.stampStroke(p.stroke, hit.theta, hit.y, pat, inkOf(pat), size, (size * 1.5) / state.pattern.density);
          clay.reliefSign = 0;
          if (p.lx2 == null || Math.hypot(p.x - p.lx2, p.y - p.ly2) > 26) { sfx.stamp(); p.lx2 = p.x; p.ly2 = p.y; } // [v15] one soft tap per stamp
        } else { p.stroke = {}; p.rstroke = {}; p.cmpTheta = null; }
      } else if (a === 'drag' && p.dragId) {
        const o = clay.ornaments.find((q) => q.id === p.dragId);
        if (o && hit && !hit.inner) { o.theta = hit.theta; o.y = hit.y; clay.ornDirty = true; }
      }
      p.prevY = p.y;
    }
    for (; gi < guides.length; gi++) guides[gi].visible = false;
    // [v9] while trimming, a tool that is not in use waits beside the pot (gently bobbing) so it is clearly visible
    if (!toolShown && isAncient() && stepId() === 'trim' && !anc.trimDone) {
      trimTool.position.set(1.05, 0.85 + Math.sin(performance.now() / 400) * 0.02, 0.55);
      trimTool.rotation.set(0.3, 0, -0.9);
      toolShown = true;
    }
    trimTool.visible = toolShown;
    // [v24] the brush: on the wall under the finger while painting / glazing, parked beside the pot otherwise
    { const mk = modeKey(); let shown = false;
      if (mk === 'glaze') { // [v26] only the decoration-stage pigment brush is drawn (not the glazing-stage brush)
        const col = mk === 'gbrush' ? ((isAncient() ? anc.chosen.color : clay.finish.color) || '#ffffff') : vivid(state.glazeHex);
        bristleMat.color.set(col);
        let onPot = null;
        for (const p of pointers.values()) if ((p.action === 'gbrush' || p.action === 'glaze') && p.lastHit && !p.lastHit.inner) onPot = p.lastHit;
        if (onPot) {
          brushTool.position.copy(onPot.point).addScaledVector(onPot.normal, 0.03);
          brushTool.up.set(0, 1, 0); brushTool.lookAt(brushTool.position.clone().add(onPot.normal));
          brushTool.rotateX(0.75); // [v25] handle leans up and OUT toward the viewer (it used to point into the pot and poke through the wall) brushTool.rotateZ(Math.sin(performance.now() / 90) * 0.04);
        } else {
          brushTool.position.set(1.05, 0.85 + Math.sin(performance.now() / 400) * 0.02, 0.55);
          brushTool.rotation.set(0.3, 0, -0.9);
        }
        shown = true;
      }
      brushTool.visible = shown; }
    return active;
  }

  // ---- overlay: soft hand skeleton drawn on the stage, using the same mapping as the pointers ----
  function drawOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (!state.hands.length) return;
    const W = overlay.width / dpr, H = overlay.height / dpr;
    octx.save();
    octx.scale(dpr, dpr);
    for (const hd of state.hands) {
      const pts = hd.lm.map((q) => mapNorm(q.x, q.y, W, H));
      octx.lineCap = 'round';
      octx.lineWidth = 3;
      octx.strokeStyle = 'rgba(255,246,230,.36)';
      octx.shadowColor = 'rgba(255,225,185,.8)';
      octx.shadowBlur = 10;
      octx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) { octx.moveTo(pts[a].x, pts[a].y); octx.lineTo(pts[b].x, pts[b].y); }
      octx.stroke();
      octx.fillStyle = 'rgba(255,246,230,.5)';
      for (const q of pts) { octx.beginPath(); octx.arc(q.x, q.y, 3, 0, 6.283); octx.fill(); }
      if (state.tutFocus) drawFocus(octx, pts, hd.lm, (cam && cam.video && cam.video.videoWidth / cam.video.videoHeight) || 4 / 3, state.tutFocus, 1.5, hd.gesture); // [v29] tutorial finger highlight
      const q = predictNorm(hd, performance.now()); // [v3] same extrapolated position the tool uses
      const m = mapNorm(q.x, q.y, W, H);
      octx.shadowBlur = 0;
      octx.lineWidth = 3;
      octx.strokeStyle = hd.gesture === 'pinch' ? '#ffb36b' : hd.gesture === 'point' ? state.glazeHex : 'rgba(190,230,255,.9)';
      octx.beginPath();
      octx.arc(m.x, m.y, hd.gesture === 'pinch' ? 11 : 16, 0, 6.283);
      octx.stroke();
    }
    octx.restore();
  }

  // =============================== UI ===============================
  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.value = state.customHex;
  customInput.setAttribute('aria-label', 'custom colour');
  Object.assign(customInput.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', left: '50%', top: '40%' });
  document.body.appendChild(customInput);
  function openPicker(anchor) {
    const r = anchor.getBoundingClientRect();
    customInput.style.left = r.left + 'px';
    customInput.style.top = r.top + 'px';
    customInput.value = state.customHex;
    if (customInput.showPicker) { try { customInput.showPicker(); return; } catch {} }
    customInput.click();
  }
  customInput.addEventListener('input', () => { state.customHex = customInput.value; setColor(customInput.value, -1); });

  let accentTimer = 0;
  function setColor(hex, idx) {
    state.glazeHex = hex; state.glazeIdx = idx;
    paintColors();
    $('#brushDot').style.background = hex;
    if (state.mode === 'ancient') { // [v5] the glaze is only chosen now, it is applied after the glaze firing
      if (state.step === STEP_IDX.glaze && ['crystal', 'drip', 'clear'].includes(anc.chosen.id)) { anc.chosen.color = hex; clay.setGlazeLayer(anc.chosen.id, hex); }
    } else if (state.stage === 'decor' && ['crystal', 'drip'].includes(clay.finish.id)) { // these finishes use the selected colour
      clearTimeout(accentTimer);
      accentTimer = setTimeout(() => { clay.setFinish(clay.finish.id, hex); }, 180);
    }
  }

  // glaze card + the little colour rows in the decoration panels
  const sw = $('#swatches');
  const swEls = GLAZES.map((g, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.setAttribute('role', 'radio');
    b.innerHTML = '<span class="dot"></span><span class="nm"></span>';
    b.querySelector('.dot').style.background = g.hex;
    b.addEventListener('click', () => setColor(g.hex, i));
    sw.appendChild(b);
    return b;
  });
  const customBtn = document.createElement('button');
  customBtn.type = 'button'; customBtn.className = 'swatch custom'; customBtn.setAttribute('role', 'radio');
  customBtn.innerHTML = '<span class="dot"></span><span class="nm"></span>';
  customBtn.addEventListener('click', () => { setColor(state.customHex, -1); openPicker(customBtn); });
  sw.appendChild(customBtn);

  const miniRows = [$('#texColors'), $('#patColors')];
  const miniBtns = miniRows.map((row) => {
    const list = GLAZES.map((g, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.style.background = g.hex; b.setAttribute('role', 'radio');
      b.addEventListener('click', () => setColor(g.hex, i));
      row.appendChild(b);
      return b;
    });
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'cust'; c.setAttribute('role', 'radio');
    c.addEventListener('click', () => { setColor(state.customHex, -1); openPicker(c); });
    row.appendChild(c);
    list.push(c);
    return list;
  });
  function paintColors() {
    swEls.forEach((b, i) => {
      b.querySelector('.nm').textContent = GLAZES[i][getLang()];
      b.title = GLAZES[i][getLang()];
      b.setAttribute('aria-checked', i === state.glazeIdx ? 'true' : 'false');
    });
    customBtn.querySelector('.nm').textContent = t('glaze.custom');
    customBtn.title = t('color.custom.title');
    customBtn.setAttribute('aria-checked', state.glazeIdx === -1 ? 'true' : 'false');
    miniBtns.forEach((list) => list.forEach((b, i) => {
      const isCustom = i === GLAZES.length;
      b.setAttribute('aria-checked', (isCustom ? state.glazeIdx === -1 : i === state.glazeIdx) ? 'true' : 'false');
      if (isCustom) b.title = t('color.custom.title'); else b.title = GLAZES[i][getLang()];
    }));
    if (state.glazeIdx === -1) { const dot = customBtn.querySelector('.dot'); dot.style.background = state.customHex; }
    else customBtn.querySelector('.dot').style.background = '';
  }

  // brush size
  const brushInput = $('#brushSize');
  const paintBrushDot = () => { const d = $('#brushDot'); const s = 6 + state.brush * 90; d.style.width = d.style.height = s + 'px'; d.style.background = state.glazeHex; };
  const gBrushInput = $('#gBrush'); // [v21] the glaze brush's size slider lives in the texture panel; both sliders share state.brush
  brushInput.addEventListener('input', () => { state.brush = +brushInput.value; gBrushInput.value = brushInput.value; paintBrushDot(); });
  gBrushInput.addEventListener('input', () => { state.brush = +gBrushInput.value; brushInput.value = gBrushInput.value; paintBrushDot(); });
  // [v5] opacity slider of the glaze brush
  const opInput = $('#brushOpacity');
  opInput.addEventListener('input', () => { state.opacity = +opInput.value; $('#opacityVal').textContent = Math.round(state.opacity * 100) + '%'; });

  // shape tools
  const toolBtns = { push: $('#toolPush'), pull: $('#toolPull'), lift: $('#toolLift') };
  function setTool(tool) {
    state.tool = tool; state.shapeMode = tool;
    for (const k in toolBtns) toolBtns[k].classList.toggle('on', k === tool);
  }
  for (const k in toolBtns) toolBtns[k].addEventListener('click', () => { setTool(k); emit('tool'); emit('tool:' + k); });

  // base shapes
  const presetBox = $('#presets');
  const presetBtns = {};
  for (const name of ['bowl', 'plate', 'cup', 'bottle']) {
    const b = document.createElement('button');
    b.type = 'button';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 52;
    const o = presetOutline(name), H = (o.n - 1) * DY, rmax = Math.max(...o.rs);
    const sc = 46 / Math.max(H, rmax * 2), c = cv.getContext('2d');
    c.fillStyle = '#6b4a36';
    c.beginPath();
    for (let i = 0; i < o.n; i++) c.lineTo(26 + o.rs[i] * sc, 49 - i * DY * sc);
    for (let i = o.n - 1; i >= 0; i--) c.lineTo(26 - o.rs[i] * sc, 49 - i * DY * sc);
    c.closePath(); c.fill();
    const lb = document.createElement('span');
    b.append(cv, lb);
    b.addEventListener('click', () => { pushUndo(); clay.setPreset(name); selectOrn(null); syncTextureUi(); });
    presetBox.appendChild(b);
    presetBtns[name] = lb;
  }

  initSfx();
  initMixer($('#btnMix')); if (location.search.includes('sound')) initSoundTest(); // [v15] volume panel; ?sound lists every effect
  { const sb = $('#btnSound'); const pt = () => { sb.textContent = isMuted() ? '🔇' : '🔊'; }; pt(); sb.addEventListener('click', () => { setMuted(!isMuted()); pt(); if (!isMuted()) sfx.click(); }); }

  // textures
  const texList = $('#texList');
  const texBtns = FINISHES.map((f) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'item';
    b.addEventListener('click', () => {
      if (state.mode === 'ancient') { anc.chosen = { id: f.id, color: state.glazeHex }; if (stepId() === 'glaze') clay.setGlazeLayer(f.id, state.glazeHex); syncTextureUi(); return; } // [v20] shown on the painted areas at once
      if (clay.finish.id === f.id) return;
      pushUndo(); clay.setFinish(f.id, state.glazeHex); syncTextureUi();
    });
    texList.appendChild(b);
    return b;
  });
  // [v17] texture opacity slider (free creation): how strongly the finish covers the painted surface
  const texOp = $('#texOpacity');
  texOp.addEventListener('pointerdown', () => pushUndo());
  texOp.addEventListener('input', () => { clay.setFinishAlpha(+texOp.value); $('#texOpacityVal').textContent = Math.round(clay.finish.alpha * 100) + '%'; });
  function syncTextureUi() {
    { const al = clay.finish.alpha == null ? 1 : clay.finish.alpha; texOp.value = al; $('#texOpacityVal').textContent = Math.round(al * 100) + '%'; }
    const ancient = state.mode === 'ancient', cur = ancient ? anc.chosen.id : clay.finish.id;
    texBtns.forEach((b, i) => {
      const f = FINISHES[i], ai = ANCIENT_GLAZES.findIndex((g) => g.id === f.id);
      const label = ancient && ai >= 0 ? ANCIENT_GLAZES[ai] : f; // [v5] Ancient Craft shows its own six glazes (rough earthenware, crackle, crystalline, iron, salt, flowing)
      b.hidden = ancient ? ai < 0 : !!(f.stageOnly || f.ancientOnly); // [v9] no raw clay body / bisque option in the glazing choices // v7: the clay / dry / trim / bisque looks belong to the Ancient Craft steps only
      b.style.order = ancient ? ai : (f.id === 'glaze' ? -1 : ai >= 0 ? ai : 10 + i); // [v10] same order in both modes: crackle, crystalline, salt, running, iron, glossy
      b.textContent = label.icon + '  ' + label[getLang()];
      b.setAttribute('aria-pressed', cur === f.id ? 'true' : 'false');
    });
  }

  // patterns
  const patCats = $('#patCats'), patGrid = $('#patGrid');
  const catBtns = CATEGORIES.map((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip';
    b.addEventListener('click', () => { state.patCat = c.id; buildPatternGrid(); });
    patCats.appendChild(b);
    return b;
  });
  function buildPatternGrid() {
    catBtns.forEach((b, i) => { b.textContent = CATEGORIES[i][getLang()]; b.setAttribute('aria-pressed', CATEGORIES[i].id === state.patCat ? 'true' : 'false'); });
    patGrid.innerHTML = '';
    for (const pat of PATTERNS.filter((q) => q.cat === state.patCat)) {
      const b = document.createElement('button');
      b.type = 'button'; b.title = pat[getLang()];
      b.setAttribute('aria-pressed', pat.id === state.pattern.id ? 'true' : 'false');
      const cv = document.createElement('canvas');
      cv.width = cv.height = 72;
      drawThumb(cv, pat);
      b.appendChild(cv);
      b.addEventListener('click', () => { state.pattern.id = pat.id; buildPatternGrid(); });
      patGrid.appendChild(b);
    }
  }
  $('#patScale').addEventListener('input', (e) => { state.pattern.scale = +e.target.value; });
  $('#patDensity').addEventListener('input', (e) => { state.pattern.density = +e.target.value; });

  // 3D decorations
  const tray = $('#ornTray');
  const trayBtns = ORNAMENTS.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${o.icon}<small></small>`;
    tray.appendChild(b);
    b.addEventListener('pointerdown', (e) => startTrayDrag(e, o.id));
    return b;
  });
  function paintTray() { trayBtns.forEach((b, i) => { b.querySelector('small').textContent = ORNAMENTS[i][getLang()]; b.title = ORNAMENTS[i][getLang()]; }); }

  function selectOrn(id) {
    state.selOrn = id;
    const o = id && clay.ornaments.find((q) => q.id === id);
    if (o) { state.ornScale = o.scale; $('#ornScale').value = o.scale; }
  }
  $('#ornScale').addEventListener('input', (e) => {
    state.ornScale = +e.target.value;
    const o = state.selOrn && clay.ornaments.find((q) => q.id === state.selOrn);
    if (o) { o.scale = state.ornScale; clay.ornDirty = true; }
  });
  const selected = () => state.selOrn && clay.ornaments.find((q) => q.id === state.selOrn);
  $('#ornRotL').addEventListener('click', () => { const o = selected(); if (o) { o.rot = (o.rot || 0) - 0.4; clay.ornDirty = true; } });
  $('#ornRotR').addEventListener('click', () => { const o = selected(); if (o) { o.rot = (o.rot || 0) + 0.4; clay.ornDirty = true; } });
  function deleteSelected() { const o = selected(); if (!o) return; pushUndo(); clay.removeOrnament(o.id); selectOrn(null); }
  $('#ornDel').addEventListener('click', deleteSelected);
  $('#btnView').addEventListener('click', resetView); // [v5]
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.stage === 'decor' && state.decorTab === '3d' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) deleteSelected();
  });

  // dragging a decoration from the tray onto the pot (a plain click places it at the front)
  function startTrayDrag(e, type) {
    e.preventDefault();
    const drag = { type, id: null, sx: e.clientX, sy: e.clientY };
    const move = (ev) => {
      const r = canvas.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
      scene.updateMatrixWorld();
      const hit = hitTest(ev.clientX, ev.clientY);
      if (!hit || hit.inner) return;
      if (!drag.id) { pushUndo(); drag.id = clay.addOrnament(type, hit.theta, hit.y, state.ornScale).id; selectOrn(drag.id); sfx.place(); }
      const o = clay.ornaments.find((q) => q.id === drag.id);
      if (o) { o.theta = hit.theta; o.y = hit.y; clay.ornDirty = true; }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!drag.id && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 8) { // a click: put it on the side facing you
        pushUndo();
        const v = new THREE.Vector3(0, 0, 1).applyQuaternion(turn.quaternion.clone().invert());
        const o = clay.addOrnament(type, Math.atan2(v.z, v.x), clay.height() * 0.55, state.ornScale); sfx.place();
        selectOrn(o.id);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // stages + decoration tabs
  const stBtns = { shape: $('#stShape'), glaze: $('#stGlaze'), decor: $('#stDecor') };
  const tabBtns = { texture: $('#tabTexture'), '3d': $('#tab3d') };
  const paintBtns = { brush: $('#tabBrush'), pattern: $('#tabPattern') }; // [v17] the Painting stage: pigments with a brush, or patterns
  function syncStage() {
    const s = state.stage, d = state.decorTab;
    for (const k in stBtns) stBtns[k].classList.toggle('on', k === s);
    for (const k in tabBtns) tabBtns[k].classList.toggle('on', k === d);
    const pt = state.paintTool;
    for (const k in paintBtns) paintBtns[k].classList.toggle('on', k === pt);
    $('#subbar').hidden = false;
    $('#grpShape').hidden = s !== 'shape';
    $('#grpPaint').hidden = s !== 'glaze';
    $('#grpDecor').hidden = s !== 'decor';
    $('#secGlaze').hidden = s !== 'glaze'; // [v17] Painting: pigment colours (+ brush size / opacity when the brush is active)
    $('#brushRow').hidden = $('#opacityRow').hidden = $('#brushReliefRow').hidden = !(s === 'glaze' && pt === 'brush');
    $('#secPattern').hidden = !(s === 'glaze' && pt === 'pattern'); // patterns now live in the Painting stage
    $('#secTexture').hidden = !(s === 'decor' && d === 'texture'); // Decoration keeps Texture + 3D ornaments
    $('#sec3d').hidden = !(s === 'decor' && d === '3d');
    // [v5] Ancient Craft: the current step decides which bars and panels exist (the stage buttons are replaced by the timeline)
    const anc_ = state.mode === 'ancient', id = anc_ ? stepId() : '';
    for (const k in stBtns) stBtns[k].hidden = anc_;
    $('#texOpacityRow').hidden = anc_; // the fired glaze has its own fixed look in the process mode
    $('#btnNext').hidden = !(anc_ && ['throw', 'trim', 'decor', 'glaze'].includes(id));
    $('#btnPrev').hidden = !(anc_ && (['trim', 'decor', 'glaze'].includes(id) || (id === 'cool' && !anc.saved))); // [v8] go back one step; [v14] also from the finished pot, until it has been saved
    $('#btnSave').hidden = anc_ && !(id === 'cool' && anc.finished);
    $('#texAncientNote').hidden = true;
    $('#btnPause').hidden = $('#btnUndo').hidden = $('#btnReset').hidden = anc_ && !['throw', 'decor', 'glaze', 'trim'].includes(id);
    if (anc_) {
      $('#subbar').hidden = !(id === 'throw' || id === 'decor');
      $('#grpShape').hidden = id !== 'throw';
      $('#grpPaint').hidden = id !== 'decor';
      $('#grpDecor').hidden = true;
      $('#secGlaze').hidden = id !== 'decor';
      $('#brushRow').hidden = $('#opacityRow').hidden = $('#brushReliefRow').hidden = !(id === 'decor' && pt === 'brush');
      $('#secTexture').hidden = id !== 'glaze';
      $('#secPattern').hidden = !(id === 'decor' && pt === 'pattern');
      $('#sec3d').hidden = true;
    }
    $('#side').hidden = [...$('#side').children].every((c) => c.hidden);
    document.body.dataset.stage = s;
    if (s !== 'decor' || d !== '3d') state.selOrn = null;
    onModeChange(); // [v3] cancel running actions, disarm hands, tell the classifier which gesture is live
  }
  for (const k in stBtns) stBtns[k].addEventListener('click', () => { if (isAncient()) return; state.stage = k; syncStage(); emit('stage:' + k); });
  for (const k in tabBtns) tabBtns[k].addEventListener('click', () => { state.decorTab = k; syncStage(); });
  // [v24] Flat / Convex / Concave selectors of the brush and the pattern panels
  for (const [row, key] of [['#brushReliefRow', 'brushRelief'], ['#patReliefRow', 'patRelief']]) {
    const btns = [...document.querySelectorAll(row + ' button')];
    const paint = () => btns.forEach((b) => b.classList.toggle('on', b.dataset.r === state[key]));
    btns.forEach((b) => b.addEventListener('click', () => { state[key] = b.dataset.r; paint(); }));
    paint();
  }
  for (const k in paintBtns) paintBtns[k].addEventListener('click', () => { state.paintTool = k; syncStage(); emit('paintTool'); emit('paintTool:' + k); });

  const btnPause = $('#btnPause');
  const paintPause = () => (btnPause.textContent = t(state.paused ? 'tt.play' : 'tt.pause'));
  btnPause.addEventListener('click', () => { state.paused = !state.paused; paintPause(); });
  $('#btnReset').addEventListener('click', () => {
    if (isAncient()) { // [v5] reset only what the current step may change
      const id = stepId();
      pushUndo();
      if (id === 'throw') clay.resetAll(); // a fresh lump (wet clay look until the glaze firing)
      else if (id === 'decor') clay.resetPaint();
      else if (id === 'glaze') { anc.chosen = { id: 'clear', color: state.glazeHex }; clay.clearGlazeMask(); clay.setGlazeLayer('clear', state.glazeHex); syncTextureUi(); }
      return;
    }
    pushUndo(); clay.resetAll(); selectOrn(null); syncTextureUi();
  });

  // dialogs
  // [v5] the Help button and the first visit open the illustrated multi-step walkthrough
  // Help replays the embedded tutorial (no separate illustrated dialog); its time never counts against the clock
  let tutBusy = false;
  const replayTutorial = async () => {
    if (tutBusy || state.locked || session.ended) return; tutBusy = true;
    const only = await pickChapter({ prac: tutApi.canPractice(), paint: tutApi.canPaint() && state.session !== 'timed' }); // "Help": all tutorials, or one chapter
    if (only === null) { tutBusy = false; return; }
    if (session.cd) session.cd.hold('tutorial');
    try { await runTutorial({ only: only.length ? only : null, api: tutApi, bus, kind: state.session, isHand: () => !!(cam && cam.stream) || !!window.__fakeHand, expandTimeline: () => { try { document.querySelector('#timeline').classList.remove('collapsed'); } catch {} } }); }
    finally { if (session.cd) session.cd.release('tutorial'); tutBusy = false; }
  };
  $('#btnHelp').addEventListener('click', replayTutorial);
  // (the first-visit walkthrough is now the in-context tutorial, started by the session flow at the end of main)

  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg, linkText, href) {
    toastEl.textContent = msg;
    if (linkText) { const a = document.createElement('a'); a.href = href; a.textContent = linkText; toastEl.appendChild(a); }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4500);
  }
  if (loadedMsg) toast(loadedMsg);

  const saveDlg = $('#saveDlg');
  const nameInput = $('#saveName');
  const btnGallery = $('#saveGallery');
  const btnCopy = $('#saveCopy');
  const paintSaveButtons = () => {
    btnGallery.textContent = t(editing ? 'save.overwrite' : 'save.toGallery');
    btnCopy.hidden = !editing;
  };
  $('#btnSave').addEventListener('click', () => {
    nameInput.value = editing ? editing.name : '';
    paintSaveButtons();
    $('#savePreview').src = potImage(clay, 360);
    saveDlg.showModal();
    nameInput.focus();
  });
  $('#saveCancel').addEventListener('click', () => saveDlg.close());
  const cleanName = () => nameInput.value.trim().slice(0, 24) || t('untitled');

  async function saveWork(asNew) {
    const name = cleanName();
    const keep = editing && !asNew;
    const rec = {
      ...clay.toRecord(),
      id: keep ? editing.id : newId(), name,
      createdAt: keep ? editing.createdAt : Date.now(), updatedAt: Date.now(),
      thumb: potImage(clay, 512),
      score: session.result || null
    };
    try { await putWork(rec); } catch (e) {
      console.warn(e);
      saveDlg.close();
      toast(t('save.fail'));
      return;
    }
    editing = { id: rec.id, name, createdAt: rec.createdAt };
    sfx.saved();
    if (isAncient()) { anc.saved = rec.id; syncStage(); paintTimeline(); } // [v14] once saved, the finished pot can no longer be taken back through the process
    try { sessionStorage.setItem('gp-new-work', rec.id); } catch {} // the cabinet plays its "new piece" animation for it
    history.replaceState(null, '', '?id=' + encodeURIComponent(rec.id));
    saveDlg.close();
    runKiln(name, isAncient()); // [v3] was: a toast. Now: kiln animation -> picture with QR code (the work is already stored)
  }

  // ---- [v3] kiln animation, then the rendered picture with a QR code at the bottom right -------------------------
  // Flow: render the pot -> make the clean photo and upload it (in parallel with the animation) -> play the kiln scene ->
  // build the final picture with the QR code of the share link -> show it with download / back / continue buttons.
  const kilnDlg = $('#kilnDlg'), kilnStage = $('#kilnStage'), kilnRes = $('#kilnResult'), kilnText = $('#kilnText');
  let kilnAnim = null;
  const kilnCue = (c) => { try { sfx[c](); } catch {} }; // [v18] iron door closes / fire roars / door opens, in step with the picture
  $('#kilnSkip').addEventListener('click', () => kilnAnim && kilnAnim.skip());
  $('#kilnClose').addEventListener('click', () => kilnDlg.close());
  kilnDlg.addEventListener('close', () => { if (kilnAnim) kilnAnim.stop(); kilnAnim = null; });
  kilnDlg.addEventListener('click', (e) => { if (e.target === kilnStage || e.target.id === 'kilnCanvas') kilnAnim && kilnAnim.skip(); }); // tap the scene to skip

  async function runKiln(name, noFire = false) { // [v5] noFire: Ancient Craft already played the firing, show the card only
    kilnStage.hidden = false; kilnRes.hidden = true;
    $('#kilnBar').style.width = '0%'; $('#kilnTemp').textContent = ''; kilnText.textContent = t('kiln.load');
    kilnDlg.showModal();
    try {
      const potUrl = potImage(clay, 1024);
      const cap = { name, brand: t('kiln.brand'), scan: t('kiln.scan') };
      const sprite = await loadImage(potUrl);
      // the photo that a phone will receive (no QR on it) is uploaded while the kiln animation plays
      const upload = composeCard({ potUrl, qr: null, cap }).then((c) => uploadPhoto(c, new URL(SHARE_ENDPOINT, location.href).href));
      if (!noFire) {
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      $('#kilnSkip').hidden = false;
      const anim = kilnAnim = playKiln($('#kilnCanvas'), sprite, {
        reduce, onCue: kilnCue,
        onFrame: ({ p, phase, temp }) => {
          $('#kilnBar').style.width = Math.round(p * 100) + '%';
          kilnText.textContent = t('kiln.' + phase);
          $('#kilnTemp').textContent = phase === 'fire' ? temp + ' °C' : '';
        }
      });
      if ((await anim.done) === 'stopped') return; // the dialog was closed while firing
      } else $('#kilnSkip').hidden = true;
      kilnText.textContent = t('kiln.wait');
      const share = await upload;
      const card = await composeCard({ potUrl, qr: share ? qrMatrix(share.url) : null, drawQR, cap });
      const url = card.toDataURL('image/png');
      $('#kilnImg').src = url;
      const dl = $('#kilnDownload');
      dl.href = url; dl.download = (name || 'pottery') + '.png';
      $('#kilnNote').textContent = t(share ? 'kiln.scanNote' : 'kiln.noQr');
      kilnStage.hidden = true; kilnRes.hidden = false;
    } catch (e) {
      console.warn('[kiln]', e);
      kilnDlg.close();
      toast(t('save.saved'), t('save.viewPool'), './'); // the work itself is saved: fall back to the old message
    }
  }
  btnGallery.addEventListener('click', () => saveWork(false));
  btnCopy.addEventListener('click', () => saveWork(true));
  $('#savePng').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = potImage(clay, 1024);
    a.download = cleanName() + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  });

  // ---- camera ----
  const consentDlg = $('#consentDlg');
  function askConsent() {
    try { if (sessionStorage.getItem('gp-cam-ok') === '1') return Promise.resolve(true); } catch {}
    return new Promise((res) => {
      const done = (v) => {
        consentDlg.close();
        if (v) { try { sessionStorage.setItem('gp-cam-ok', '1'); } catch {} }
        res(v);
      };
      $('#consentAllow').onclick = () => done(true);
      $('#consentCancel').onclick = () => done(false);
      consentDlg.addEventListener('cancel', () => res(false), { once: true });
      consentDlg.showModal();
    });
  }

  const camview = $('#camview');
  const cam = new CameraController({
    video: $('#cam'), select: $('#camSelect'), openBtn: $('#camOpen'), closeBtn: $('#camClose'),
    skCanvas: $('#camsk'), view: camview, statusEl: $('#camStatus'), offEl: $('#camoff'),
    confirmFn: askConsent, onHands: handleHands, onActive: (on) => { chip.textContent = ''; camview.classList.toggle('live', on); if (on) sfx.camOn(); }
  });

  camInterp = cam.interp; // [v3] mode isolation needs the interpreter
  applyInterpMode();

  $('#mirror').addEventListener('change', (e) => {
    state.mirror = e.target.checked;
    $('#camflip').classList.toggle('mirrored', state.mirror);
  });

  // draggable + resizable camera window (starts on the left, clear of the pot and every other panel)
  const camwin = $('#camwin');
  (function drag() {
    const handle = $('#camhead');
    let on = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const place = (x, y) => {
      const r = camwin.getBoundingClientRect();
      camwin.style.left = clamp(x, 4, window.innerWidth - r.width - 4) + 'px';
      camwin.style.top = clamp(y, 4, window.innerHeight - r.height - 4) + 'px';
    };
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      on = true;
      const r = camwin.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => { if (on) place(ox + e.clientX - sx, oy + e.clientY - sy); });
    const up = () => (on = false);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
    window.addEventListener('resize', () => { const r = camwin.getBoundingClientRect(); place(r.left, r.top); });
    const sizes = [220, 300, 420];
    let si = 1;
    $('#camsize').addEventListener('click', () => {
      si = (si + 1) % sizes.length;
      camwin.style.setProperty('--camw', sizes[si] + 'px');
      requestAnimationFrame(() => { const r = camwin.getBoundingClientRect(); place(r.left, r.top); });
    });
  })();

  // =============================== [v5] craft timeline + Ancient Craft mode ===============================
  // Free creation = the original behaviour, untouched. Ancient craft = the real pottery process as a one-way sequence:
  //   Throwing -> Air drying (auto) -> Trimming (a few strokes) -> Bisque firing (auto) -> Decoration (underglaze: brush + patterns)
  //   -> Glazing (choose one of six glazes; its look stays hidden) -> Glaze firing (auto, brick kiln) -> Cooling and unloading (auto, then view / save).
  // It only changes WHICH existing tools are offered when, and tints the pot (wet / dry / biscuit); the clay, painting and
  // glaze code are the same as in free mode.
  // [v6] body tint multipliers. The wet-clay texture already is brown, so wet = no tint; at the start of drying the pot switches to the
  // paler 'raw' texture and is tinted brown (DRY_START) so nothing jumps, then the tint fades to the dry colour.
  const WET = [1, 1, 1], DRY_START = [0.89, 0.73, 0.6], DRY = [0.82, 0.79, 0.75], TRIM = [0.95, 0.9, 0.82], BISQUE = [1.08, 1.08, 1.08]; // [v8] three clearly different bodies: dry = darker grey-beige, trimmed = warm cream, bisque = white // v7: the colours now live in the finishes (clay / dry / trim / bisque); DRY_START is the brown the drying pot fades from
  const lerp3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const stepId = () => STEPS[state.step].id;
  const isAncient = () => state.mode === 'ancient';
  const tlEl = $('#timeline'), tlSteps = $('#tlSteps');
  const tlLis = STEPS.map((s) => {
    const li = document.createElement('li');
    li.className = s.auto ? 'auto' : '';
    li.innerHTML = `<span class="nd">${s.icon}</span><span class="lb"></span>`;
    tlSteps.appendChild(li);
    return li;
  });

  // -- trimming guide overlay (v8) --
  const trimGuide = document.createElement('div');
  trimGuide.className = 'trim-guide'; trimGuide.hidden = true; trimGuide.setAttribute('aria-hidden', 'true');
  trimGuide.innerHTML = `<div class="tg-track"><img class="tg-hand" alt="" src="${HAND_POINT.src}"><i class="tg-line"></i></div><span class="tg-text"></span>`;
  const trimGuideText = trimGuide.querySelector('.tg-text');
  document.body.appendChild(trimGuide);

  // -- timeline drawing --
  function paintTimeline() {
    const anc_ = isAncient(), id = stepId();
    $('#modeFree').setAttribute('aria-checked', anc_ ? 'false' : 'true');
    $('#modeAncient').setAttribute('aria-checked', anc_ ? 'true' : 'false');
    tlSteps.hidden = !anc_;
    tlLis.forEach((li, i) => {
      li.querySelector('.lb').textContent = t('step.' + STEPS[i].id);
      li.classList.toggle('cur', anc_ && i === state.step);
      li.classList.toggle('done', anc_ && (i < state.step || (i === state.step && id === 'cool' && anc.finished)));
    });
    let hint, cur;
    if (!anc_) { hint = t('tl.free.note'); cur = t('tl.free'); }
    else {
      hint = t(id === 'cool' && anc.finished ? 'tl.hint.done' : 'tl.hint.' + id);
      cur = (state.step + 1) + '/' + STEPS.length + '  ' + t('step.' + id);
    }
    $('#tlHint').textContent = hint;
    $('#tlCur').textContent = cur;
    const prog = $('#tlProg');
    prog.hidden = !(anc_ && id === 'trim');
    if (!prog.hidden) {
      $('#tlProgBar').style.width = Math.round((Math.min(anc.trimStrokes, anc.trimNeed) / anc.trimNeed) * 100) + '%';
      $('#tlHint').textContent = hint + '  ' + t('tl.trim.progress', { n: Math.min(anc.trimStrokes, anc.trimNeed), m: anc.trimNeed });
    }
    // [v8] trimming guide: an animated finger slides over the pot until the first stroke has been made
    trimGuide.hidden = !(anc_ && id === 'trim' && anc.trimStrokes === 0 && !anc.trimDone);
    trimGuideText.textContent = t('trim.guide');
    const nx = $('#btnNext');
    if (anc_ && ['throw', 'trim', 'decor', 'glaze'].includes(id)) nx.textContent = t('tl.next.' + id);
  }
  $('#tlToggle').addEventListener('click', () => {
    const c = tlEl.classList.toggle('collapsed');
    $('#tlToggle').setAttribute('aria-expanded', c ? 'false' : 'true');
    try { localStorage.setItem('gp-tl-collapsed', c ? '1' : '0'); } catch {}
  });
  try { if (localStorage.getItem('gp-tl-collapsed') === '1') { tlEl.classList.add('collapsed'); $('#tlToggle').setAttribute('aria-expanded', 'false'); } } catch {}

  // -- automatic animations, driven from the main loop (k = 0..1) --
  let auto = null;
  const runAnim = (dur, tick) => new Promise((res) => { auto = { t: 0, dur, tick, res }; });
  $('#autoSkip').addEventListener('click', () => { if (auto) auto.t = auto.dur; });
  const autoCap = $('#autoCap'), autoText = $('#autoText'), autoBar = $('#autoBar');
  const showCap = (on) => { autoCap.hidden = !on; autoBar.style.width = '0%'; if (session.cd) { on ? session.cd.hold('auto') : session.cd.release('auto'); } };

  // [v9] clay shavings: curled ribbons of clay peel off under the loop tool, fall onto the wheel, lie there a while and fade
  const SH = 70, shMat = new THREE.MeshStandardMaterial({ color: 0xcfae86, roughness: 0.9 });
  const shGeoC = new THREE.TorusGeometry(0.04, 0.0085, 6, 14, 4.4);
  const shList = [];
  for (let i = 0; i < SH; i++) { const m = new THREE.Mesh(shGeoC, shMat); m.visible = false; m.castShadow = true; scene.add(m); shList.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, floor: 0, rest: 0 }); }
  let shNext = 0, shFloor = 0; const trimPt = new THREE.Vector3();
  function emitShavings(pt, n = 2, burst = 1) {
    for (let k = 0; k < n; k++) {
      const s = shList[shNext++ % SH];
      s.m.position.set(pt.x + rnd(-0.03, 0.03), pt.y + rnd(0, 0.04), pt.z + rnd(-0.02, 0.05));
      s.v.set(rnd(-0.35, 0.35) * burst, rnd(0.25, 0.7) * burst, rnd(0.05, 0.5) * burst);
      s.w.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
      s.m.rotation.set(rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28));
      const sc = rnd(0.7, 1.5); s.m.scale.set(sc, sc, sc);
      s.life = 4; s.rest = 0; s.floor = shFloor; s.m.visible = true;
    }
  }
  function stepShavings(dt) {
    for (const s of shList) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const p = s.m.position;
      if (s.rest <= 0) {
        s.v.y -= 2.4 * dt; p.addScaledVector(s.v, dt);
        s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
        if (p.y <= s.floor + 0.012) { p.y = s.floor + 0.012; s.rest = 1; s.v.set(0, 0, 0); } // lands and stays
      }
      if (s.life < 1) s.m.scale.multiplyScalar(Math.max(0.0001, 1 - dt * 2.2)); // shrinks away at the end
      if (s.life <= 0) s.m.visible = false;
    }
  }

  // trimming: a stroke (finger or mouse) that travelled far enough counts. After a few strokes the blank is trimmed smooth.
  function trimStrokeEnd(p) {
    try { sfx.scrape(); } catch {}
    p.trimPx = 0; p.lx = null;
  }
  // [v10] trimming is time-based: every second of scraping counts one tick, 5 ticks (about 5 s) finish the blank
  function trimTick() {
    if (!isAncient() || stepId() !== 'trim' || anc.trimDone) return;
    anc.trimStrokes++;
    emitShavings(trimPt, 12, 1.6); pm.setTint(lerp3(DRY, TRIM, Math.min(1, anc.trimStrokes / anc.trimNeed)));
    if (anc.trimStrokes < anc.trimNeed) toast('✓ ' + t('tl.trim.progress', { n: anc.trimStrokes, m: anc.trimNeed }));
    if (anc.trimStrokes >= anc.trimNeed) {
      finishTrim(true);
      // [v22] trimming finished: go on to the bisque firing by itself (no confirmation); a short pause lets the shavings and the toast land
      const tk = anc.token; setTimeout(() => { if (tk === anc.token && isAncient() && stepId() === 'trim' && anc.trimDone && !auto) $('#btnNext').click(); }, 1300);
    }
    paintTimeline();
  }
  function finishTrim(announce) {
    if (anc.trimDone) return;
    anc.trimDone = true;
    clay.setFinish('trim'); pm.setTint(TRIM); // [v9] trimmed body look
    emitShavings(trimPt, 30, 2.2);
    if (announce) toast('✨ ' + t('tl.trimDone'));
  }

  // -- the steps --
  function abortAuto() {
    anc.token++;
    auto = null;
    showCap(false);
    if (kilnAnim) { kilnAnim.stop(); kilnAnim = null; }
    if (typeof kilnDlg !== 'undefined' && kilnDlg.open) kilnDlg.close();
    pm.setGlow(0);
  }
  // maps a step onto the stage / tab names of the original UI, resets the undo history and starts automatic steps
  function goStep(i) {
    try { if (i > state.step) sfx.chime(Math.min(i, 6)); else sfx.click(); } catch {} // [v15] a step is done: bell; going back: click
    state.step = i; anc.maxStep = Math.max(anc.maxStep, i);
    const id = stepId();
    if (id === 'throw') state.stage = 'shape';
    else if (id === 'decor') state.stage = 'glaze'; // brush painting (underglaze); the Patterns tab switches to stage 'decor'
    else if (id === 'glaze') { state.stage = 'decor'; state.decorTab = 'texture'; }
    undoStack.length = 0; btnUndo.disabled = true;
    syncStage();
    paintTimeline();
    syncTextureUi();
    if (id === 'dry') stepDry(); else if (id === 'bisque') stepBisque(); else if (id === 'fire') stepFire(); else if (id === 'cool') stepCool();
    // v7: every step has its own body look (reference photos): throwing = brown clay, drying = grey-beige, trimming = paler, bisque = white
    const body = id === 'throw' ? 'clay' : id === 'trim' ? (anc.trimDone ? 'trim' : 'dry') : id === 'decor' || id === 'glaze' ? 'bisque' : null;
    if (body && clay.finish.id !== body) clay.setFinish(body);
    // [v20] traditional mode: the chosen glaze already shows on the painted areas of the biscuit (and nowhere else)
    if (id === 'glaze') clay.setGlazeLayer(anc.chosen.id, anc.chosen.color || state.glazeHex); else if (clay.glazeLayer) clay.setGlazeLayer(null); // [v21] colours only while decorating; the glaze shows in the glazing step, where it is brushed on
    if (id === 'throw') pm.setTint(WET);
    else if (id === 'trim') pm.setTint(anc.trimDone ? TRIM : lerp3(DRY, TRIM, Math.min(1, anc.trimStrokes / anc.trimNeed)));
    else if (id === 'decor' || id === 'glaze') pm.setTint(BISQUE);
  }
  async function stepDry() { // air drying: darker wet clay slowly turns paler; the shape is locked
    const tk = ++anc.token;
    autoText.textContent = t('auto.dry'); showCap(true);
    clay.setFinish('dry'); pm.setTint(DRY_START); // [v6] surface moisture gone: matte, paler body
    await runAnim(5.5, (k) => {
      pm.setTint(lerp3(DRY_START, DRY, k * k * (3 - 2 * k)));
      autoText.textContent = t('auto.dry') + '  ' + t('auto.day', { n: 1 + Math.floor(k * 6.99) });
      autoBar.style.width = Math.round(k * 100) + '%';
    });
    if (tk !== anc.token) return;
    showCap(false);
    goStep(STEP_IDX.trim);
  }
  // plays the kiln scene in the dialog; resolves when it ends (kind: 'bisque' about 900 C | 'glaze' 1280 C)
  async function fireKiln(kind, tint) {
    kilnStage.hidden = false; kilnRes.hidden = true;
    $('#kilnBar').style.width = '0%'; $('#kilnTemp').textContent = ''; kilnText.textContent = t('kiln.load');
    $('#kilnSkip').hidden = false;
    if (!kilnDlg.open) kilnDlg.showModal();
    const sprite = await loadImage(potImage(clay, 1024, { tint }));
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = kilnAnim = playKiln($('#kilnCanvas'), sprite, {
      reduce, maxTemp: kind === 'bisque' ? 900 : 1280, onCue: kilnCue,
      onFrame: ({ p, phase, temp }) => {
        $('#kilnBar').style.width = Math.round(p * 100) + '%';
        kilnText.textContent = phase === 'fire' ? t('kiln.fire.' + kind) : t('kiln.' + phase);
        $('#kilnTemp').textContent = phase === 'fire' ? temp + ' °C' : '';
      }
    });
    await anim.done;
    kilnAnim = null;
  }
  async function stepBisque() {
    const tk = ++anc.token;
    try { await fireKiln('bisque', TRIM); } catch (e) { console.warn('[kiln]', e); }
    if (tk !== anc.token) return;
    kilnDlg.close();
    goStep(STEP_IDX.decor); // the blank is now a biscuit: paint on it
  }
  async function stepFire() {
    const tk = ++anc.token;
    try { await fireKiln('glaze', BISQUE); } catch (e) { console.warn('[kiln]', e); }
    if (tk !== anc.token) return;
    kilnDlg.close();
    clay.setGlazeLayer(null); clay.setFinish(anc.chosen.id, anc.chosen.color || state.glazeHex, 'bisque'); // fired: the glaze stays on the painted areas, the rest is still biscuit
    goStep(STEP_IDX.cool);
  }
  async function stepCool() {
    const tk = ++anc.token;
    anc.finished = false;
    syncStage(); paintTimeline();
    autoText.textContent = t('auto.cool'); showCap(true); try { sfx.glazePings(8); } catch {} // [v15] the glaze 'sings' as it cools
    await runAnim(4, (k) => {
      pm.setGlow(Math.pow(1 - k, 1.6)); // glowing orange at first, then the real colours
      autoBar.style.width = Math.round(k * 100) + '%';
    });
    if (tk !== anc.token) return;
    pm.setGlow(0); showCap(false);
    anc.finished = true;
    syncStage(); paintTimeline();
  }

  // -- switching modes --
  // [v9] Each mode keeps its OWN surface: finish + paint canvas (+ the glaze that came out of the kiln). Switching stashes the current one and
  // restores the other, so the free pot is never covered by Ancient Craft clay looks (or the other way round). The shape is shared.
  const stash = { free: null, ancient: null };
  const takeSurface = () => {
    const c = document.createElement('canvas'); c.width = clay.paint.width; c.height = clay.paint.height;
    c.getContext('2d').drawImage(clay.paint, 0, 0);
    return { finish: { ...clay.finish }, paint: c, inner: clay.innerColor };
  };
  const putSurface = (sf) => {
    clay.pctx.globalCompositeOperation = 'source-over';
    clay.pctx.clearRect(0, 0, clay.W, clay.Hc); clay.pctx.drawImage(sf.paint, 0, 0);
    clay.innerColor = sf.inner; clay.innerDirty = true; clay.touchPaint();
    clay.glazeLayer = null; clay.setFinish(sf.finish.id, sf.finish.color, sf.finish.base); // [v20] keeps the body look under a masked glaze
  };
  function setMode(m) {
    if (m === state.mode) return;
    abortAuto();
    undoStack.length = 0; btnUndo.disabled = true;
    stash[state.mode] = takeSurface();
    if (state.mode === 'ancient') ancStash = { step: state.step, trimStrokes: anc.trimStrokes, trimT: anc.trimT, trimDone: anc.trimDone, cut: anc.cut, chosen: { ...anc.chosen }, finished: anc.finished }; // [v10] progress is kept
    if (m === 'ancient') {
      state.mode = 'ancient';
      pm.setGlow(0);
      if (ancStash && stash.ancient) { // [v10] shared pot: coming back resumes at the furthest step you were at (an automatic step counts as done, so resume at the next interactive one)
        Object.assign(anc, { trimStrokes: ancStash.trimStrokes, trimT: ancStash.trimT, trimDone: ancStash.trimDone, cut: ancStash.cut, chosen: ancStash.chosen, finished: ancStash.finished });
        putSurface(stash.ancient);
        const sid = STEPS[ancStash.step].id, next = { dry: 'trim', bisque: 'decor', fire: 'glaze' }[sid];
        goStep(next ? STEP_IDX[next] : ancStash.step);
      } else {
        anc.chosen = { id: 'clear', color: state.glazeHex };
        anc.trimStrokes = 0; anc.trimT = 0; anc.trimDone = false; anc.cut = 300; anc.finished = false; anc.saved = null;
        clay.resetPaint(); clay.glazeLayer = null; clay.setFinish('clay'); clay.setFinishAlpha(1); // a fresh Ancient Craft surface: bare wet clay, no free-mode paint
        pm.setTint(WET);
        goStep(0);
      }
    } else {
      state.mode = 'free';
      pm.setTint(null); pm.setGlow(0);
      if (stash.free) putSurface(stash.free); else { clay.resetPaint(); clay.setFinish('glaze', clay.finish.color); }
      state.stage = 'shape'; state.decorTab = 'texture';
      syncStage(); paintTimeline(); syncTextureUi();
    }
    try { localStorage.setItem('gp-mode', m); } catch {}
  }
  let ancStash = null;
  $('#modeFree').addEventListener('click', () => { setMode('free'); emit('mode'); });
  $('#modeAncient').addEventListener('click', () => { setMode('ancient'); emit('mode'); });
  $('#camOpen').addEventListener('click', () => emit('cam'));

  // the "Next" button of the interactive steps
  $('#btnNext').addEventListener('click', () => {
    const id = stepId();
    if (!isAncient()) return;
    if (id === 'trim') finishTrim(false); // pressing Next early still trims the blank
    if (id === 'throw') goStep(STEP_IDX.dry);
    else if (id === 'trim') goStep(STEP_IDX.bisque);
    else if (id === 'decor') goStep(STEP_IDX.glaze);
    else if (id === 'glaze') goStep(STEP_IDX.fire);
  });
  // [v8] "Previous step": back to the last interactive step (the automatic ones in between are skipped)
  $('#btnPrev').addEventListener('click', () => {
    const id = stepId();
    if (!isAncient()) return;
    abortAuto();
    if (id === 'trim') { anc.trimStrokes = 0; anc.trimT = 0; anc.trimDone = false; anc.cut = 300; goStep(STEP_IDX.throw); }
    else if (id === 'decor') { anc.trimStrokes = 0; anc.trimT = 0; anc.trimDone = false; anc.cut = 300; goStep(STEP_IDX.trim); }
    else if (id === 'glaze') goStep(STEP_IDX.decor);
    else if (id === 'cool' && !anc.saved) { pm.setGlow(0); anc.finished = false; goStep(STEP_IDX.glaze); } // [v14] back from the finished pot to the glaze choice (the glaze comes off again, the underglaze stays)
  });

  // ---- language-dependent labels ----
  const refresh = () => {
    paintColors(); paintPause(); paintSaveButtons(); syncTextureUi(); buildPatternGrid(); paintTray(); paintTimeline();
    for (const name in presetBtns) presetBtns[name].textContent = t('preset.' + name);
  };
  onLang(refresh);
  setTool('push');
  paintBrushDot();
  refresh();
  syncStage();

  // ---- main loop ----
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  let last = performance.now(), lastReal = last, frameEma = 16.7, slowMs = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused) turn.rotation.y += dt * 0.45;
    clay.softStep(dt); // [v8] springy settle of freshly pressed clay
    if (tutApi.cmp) { tutApi.cmp.on.softStep(dt); tutApi.cmp.off.softStep(dt); }
    { const tt = now / 1000; for (const lf of swayers) lf.rotation.x = lf.userData.bx + Math.sin(tt * 0.9 + lf.userData.ph) * 0.06; } // [v8] leaves in the draught
    const dp = dust.geometry.attributes.position;
    for (let i = 0; i < DUST; i++) {
      let y = dp.getY(i) + dt * 0.025;
      if (y > 3.3) y = 0.2;
      dp.setY(i, y);
    }
    dp.needsUpdate = true;

    // [v3] frame-time watchdog: sustained slow frames lower the render resolution (see dprCap)
    const real = now - lastReal; lastReal = now;
    frameEma += (Math.min(real, 100) - frameEma) * 0.05;
    slowMs = frameEma > 27 ? slowMs + real : 0;
    if (slowMs > 2000 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.25); slowMs = 0; resize(); }

    // [v5] automatic step animation + trimming shavings
    if (auto) {
      auto.t = Math.min(auto.dur, auto.t + dt);
      auto.tick(auto.t / auto.dur, dt);
      if (auto && auto.t >= auto.dur) { const r = auto.res; auto = null; r(); }
    }
    stepShavings(dt);

    // [v3] move every hand pointer to its extrapolated position for THIS frame
    for (const p of pointers.values()) if (p.kind === 'hand' && p.hand) placeHand(p, p.hand, now);
    frameCamera(dt);
    const active = processPointers(dt);
    if (!active) clay.refreshFinish(false); // the drip texture follows a changed height once the stroke is over
    pm.update(false, now, 22); // geometry every frame, the larger texture upload at most ~45 times a second

    // selection ring for the chosen 3D decoration
    const o = state.stage === 'decor' && state.decorTab === '3d' ? selected() : null;
    const g = o && pm.ornMeshes.get(o.id);
    if (g) {
      g.getWorldPosition(_p); g.getWorldQuaternion(_q);
      selRing.position.copy(_p); selRing.quaternion.copy(_q);
      selRing.scale.setScalar(0.085 * (o.scale || 1));
      selRing.visible = true;
    } else selRing.visible = false;

    renderer.render(scene, camera);
    drawOverlay();
    requestAnimationFrame(frame);
  }

  // ---- [v10] session flow: tutorial (not timed) -> Timed countdown or Relaxed score preview ----
  const scoreCtx = () => ({ clay, mode: state.mode, anc, maxStep: anc.maxStep });
  const potRect = () => { let v; try { v = new THREE.Vector3(0, TT_TOP + clay.height() / 2, 0).project(camera); } catch { v = { x: 0, y: 0 }; } const r = canvas.getBoundingClientRect(); const h = Math.min(r.width, r.height) * 0.46; return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, w: h * 0.9, h }; };
  const dialogs = [...document.querySelectorAll('dialog')];
  const syncDialogs = () => { if (!session.cd) return; (dialogs.some((d) => d.open) ? session.cd.hold('dialog') : session.cd.release('dialog')); };
  dialogs.forEach((d) => new MutationObserver(syncDialogs).observe(d, { attributes: true, attributeFilter: ['open'] }));
  // [v15] interface sounds: every button gets a soft click; tools, colour / glaze choices, undo and step buttons each have their own
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, .btn, .swatch, label.item, .pgrid > *, .tray > *');
    if (!b || b.closest('dialog#kilnDlg')) return;
    if (['btnNext', 'btnPrev', 'btnSave', 'btnSound', 'btnMix', 'camOpen'].includes(b.id)) return; // these have richer sounds
    if (b.id === 'btnUndo' || b.id === 'btnReset') return sfx.undo();
    if (b.closest('#swatches, #texColors, #patColors, #texList, #patGrid, #ornTray, .minicolors')) return sfx.pick([...b.parentElement.children].indexOf(b));
    return b.classList.contains('tool') || b.classList.contains('stage') ? sfx.tool() : sfx.click();
  }, true);
  function lockStudio() {
    state.locked = true; document.body.classList.add('locked'); sfx.lock();
    for (const p of pointers.values()) beginAction(p, null);
    pointers.clear(); abortAuto(); dialogs.forEach((d) => { if (d.open && d.id !== 'saveDlg') d.close(); });
  }
  function endSession() {
    if (session.ended) return; session.ended = true; sfx.ambientStop();
    lockStudio();
    if (session.cd) session.cd.stop();
    const gone = showTimeUp();
    setTimeout(() => {
      gone();
      const res = scorePot(scoreCtx()); session.result = res;
      playEnding(res, potImage(clay, 1024), { onSave: () => $('#btnSave').click(), onRetry: () => { location.href = location.pathname; } });
    }, 2200);
  }
  function startSession(kind) {
    sfx.ambientStart(); // [v13] soft background music for the whole pottery session (the mute button silences it)
    if (kind === 'timed') {
      session.hud = createHud('timed', () => scorePot(scoreCtx()));
      const hand = document.createElement('button'); hand.type = 'button'; hand.className = 'sess-hand'; session.hud.chip.after(hand);
      const paintHand = () => { hand.textContent = getLang() === 'zh' ? '交作品' : 'Hand in'; }; paintHand(); onLang(paintHand);
      hand.addEventListener('click', () => { if (confirm(getLang() === 'zh' ? '现在交作品并评分？' : 'Hand in now and get scored?')) endSession(); });
      let tl = TIMED_SECONDS, wa; try { const t = +localStorage.getItem('gp-tlimit'); if (t > 0) { tl = t; wa = Math.min(60, t / 2); } } catch {} // test hook
      session.cd = new Countdown(tl, { warnAt: wa, onTick: (sec) => { session.hud.setTime(sec); if (sec <= 10 && sec > 0 && sec !== session.lastSec) { session.lastSec = sec; sfx.tickdown(sec); } }, onWarn: () => { try { sfx.ambientTense(); } catch {} showReminder(); }, // [v23] the last minute: the music turns tense
         onEnd: endSession });
      session.hud.setTime(tl); session.cd.start(); syncDialogs();
    } else {
      session.hud = createHud('relaxed', () => scorePot(scoreCtx())); session.hud.startPreview();
    }
  }
  (async () => {
    const kind = await sessionPromise;
    document.body.classList.add('sess-' + kind);
    if (kind === 'timed') setMode('ancient'); // challenge = traditional process only
    tutBusy = true;
    let seen = false; try { seen = !!localStorage.getItem('gp-guide-v2'); } catch {}
    if (!seen && !document.body.classList.contains('no-tut') && await askTutorial()) await runTutorial({ api: tutApi, bus, kind, isHand: () => !!(cam && cam.stream) || !!window.__fakeHand, expandTimeline: () => { try { document.querySelector('#timeline').classList.remove('collapsed'); } catch {} } });
    tutBusy = false;
    startSession(kind);
  })();
  if (location.search.includes('dbg')) window.__gp = { clay, state, anc, pm, brushTool, tutApi, tutWork, drawFocus, cam, playEnding, potImage: () => potImage(clay, 1024) }; // developer hook for the smoke tests
  requestAnimationFrame(frame);
}

main();
