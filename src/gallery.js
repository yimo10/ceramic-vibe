// [v14] The home page is now an endless pixel-art display cabinet (the pool scene is gone). Saved works are listed newest first, each shown as a pixel-art
// version of its photo inside a glass compartment. Rows of empty compartments are appended as you scroll, so the cabinet never ends. A work that was
// just saved in the studio drops into the first compartment with a little sparkle.
import { t, getLang, applyI18n, onLang, initLangToggle } from './i18n.js';
import { listWorks, deleteWork, exportAll, importAll } from './store.js';
import { initSfx, sfx, setMuted, isMuted } from './sfx.js'; // [v15] one audio engine for the whole site
import { initMixer, initSoundTest } from './mixerui.js';
import { CONTACT_EMAIL } from './config.js';
import { pixelize } from './pixelart.js';

const $ = (s) => document.querySelector(s);
const COLS = () => (window.innerWidth < 520 ? 2 : window.innerWidth < 900 ? 3 : 4);

async function main() {
  initSfx();
  // [v16] cabinet music: starts at once if the browser already allows sound (arriving from the studio), otherwise on the first click / key press
  const startMusic = () => sfx.ambientStart('cabinet');
  if (navigator.userActivation && navigator.userActivation.hasBeenActive) startMusic();
  else { window.addEventListener('pointerdown', startMusic, { once: true }); window.addEventListener('keydown', startMusic, { once: true }); }
  applyI18n();
  initLangToggle($('#btnLang'));
  const shelves = $('#shelves'), sentinel = $('#sentinel'), cabEl = $('#cab');
  const displayName = (w) => w.name || t('untitled');
  let works = [];
  try { works = await listWorks(); } catch (e) { console.warn(e); }
  let newId = null; try { newId = sessionStorage.getItem('gp-new-work'); sessionStorage.removeItem('gp-new-work'); } catch {}

  // ---- cells ----
  const art = new Map(); // id -> pixel canvas (made once, only when the cell is on screen)
  const seen = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { seen.unobserve(e.target); fill(e.target); }
  }, { root: cabEl, rootMargin: '200px' });
  async function fill(cell) {
    const w = works.find((x) => x.id === cell.dataset.id); if (!w || !w.thumb) return;
    try {
      let cv = art.get(w.id); if (!cv) { cv = await pixelize(w.thumb, 48); art.set(w.id, cv); }
      const out = cell.querySelector('canvas'); out.width = cv.width; out.height = cv.height;
      out.getContext('2d').drawImage(cv, 0, 0); cell.classList.add('ready');
    } catch (e) { console.warn('[cabinet] pixel art failed', e); }
  }
  function cellFor(w, i) {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'cell has'; c.dataset.id = w.id;
    c.innerHTML = '<span class="glass"></span><canvas width="48" height="48"></canvas><span class="plaque"></span><span class="spark"></span>';
    c.querySelector('.plaque').textContent = displayName(w);
    c.addEventListener('click', () => { sfx.click(); openPreview(w); });
    c.addEventListener('pointerenter', () => sfx.tick()); // soft hover tick
    if (w.id === newId) c.classList.add('fresh');
    seen.observe(c); return c;
  }
  function emptyCell(first) {
    if (first) { const a = document.createElement('a'); a.className = 'cell slot add'; a.href = 'studio.html'; a.innerHTML = '<span class="glass"></span><b></b>'; a.querySelector('b').textContent = t('cab.new'); return a; }
    const c = document.createElement('div'); c.className = 'cell slot'; c.innerHTML = '<span class="glass"></span>'; return c;
  }
  let rows = 0;
  function addRow() { // one shelf row: works first, then empty compartments (the first empty one is a "+ New piece" link)
    const n = COLS(), row = document.createElement('div'); row.className = 'shelf'; row.style.setProperty('--cols', n);
    for (let i = 0; i < n; i++) {
      const k = rows * n + i;
      row.appendChild(k < works.length ? cellFor(works[k], k) : emptyCell(k === works.length));
    }
    shelves.appendChild(row); rows++;
  }
  function build() {
    shelves.textContent = ''; rows = 0;
    const need = Math.max(3, Math.ceil((works.length + 1) / COLS()) + 1);
    for (let i = 0; i < need; i++) addRow();
  }
  build();
  // endless: whenever the bottom comes into view, add more shelves
  new IntersectionObserver((es) => { if (es[0].isIntersecting) for (let i = 0; i < 2; i++) addRow(); }, { root: cabEl, rootMargin: '600px' }).observe(sentinel);
  let lastCols = COLS();
  window.addEventListener('resize', () => { const c = COLS(); if (c !== lastCols) { lastCols = c; build(); } });
  onLang(() => { shelves.querySelectorAll('.cell.has').forEach((c) => { const w = works.find((x) => x.id === c.dataset.id); if (w) c.querySelector('.plaque').textContent = displayName(w); }); shelves.querySelectorAll('.slot.add b').forEach((b) => (b.textContent = t('cab.new'))); paintSound(); });

  // the new piece drops in with a sparkle
  if (newId) setTimeout(() => { const c = shelves.querySelector('.cell.fresh'); if (c) { cabEl.scrollTop = 0; try { sfx.ding(0.9); setTimeout(() => sfx.star(1), 700); setTimeout(() => sfx.star(2), 880); } catch {} } }, 400);

  // ---- preview ----
  const pv = $('#preview'); let pvWork = null;
  function openPreview(w) {
    pvWork = w;
    $('#pvName').textContent = displayName(w);
    $('#pvImg').src = w.thumb || '';
    $('#pvMeta').textContent = t('preview.created', { date: new Date(w.createdAt || Date.now()).toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en-US') });
    $('#pvEdit').href = 'studio.html?id=' + encodeURIComponent(w.id);
    pv.showModal();
  }
  $('#pvClose').addEventListener('click', () => pv.close());
  $('#pvDelete').addEventListener('click', async () => {
    if (!pvWork || !confirm(t('preview.confirm', { name: displayName(pvWork) }))) return;
    try { await deleteWork(pvWork.id); } catch (e) { console.warn(e); return; }
    works = works.filter((x) => x.id !== pvWork.id); art.delete(pvWork.id); pvWork = null; pv.close(); build(); // the rest shift up to fill the gap
  });

  // ---- panels ----
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.close).close()));
  const aboutDlg = $('#aboutDlg'), msgDlg = $('#msgDlg');
  $('#btnAbout').addEventListener('click', () => { $('#aboutMsg').textContent = ''; aboutDlg.showModal(); });
  $('#btnMsg').addEventListener('click', () => { $('#msgNote').textContent = CONTACT_EMAIL ? '' : t('msg.local'); msgDlg.showModal(); });
  $('#msgSend').addEventListener('click', () => {
    const text = $('#msgText').value.trim();
    if (!text) { $('#msgNote').textContent = t('msg.empty'); return; }
    if (CONTACT_EMAIL) location.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(t('brand')) + '&body=' + encodeURIComponent(text);
    else { try { const all = JSON.parse(localStorage.getItem('gp-messages') || '[]'); all.push({ t: Date.now(), text }); localStorage.setItem('gp-messages', JSON.stringify(all.slice(-50))); } catch {} }
    $('#msgText').value = ''; $('#msgNote').textContent = t('msg.sent');
  });
  $('#btnExport').addEventListener('click', async () => {
    const txt = await exportAll();
    if (!JSON.parse(txt).works.length) { $('#aboutMsg').textContent = t('about.exportEmpty'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = 'tao-cabinet-works.json';
    document.body.appendChild(a); a.click(); a.remove();
  });
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = await importAll(await f.text()); $('#aboutMsg').textContent = t('about.imported', { n }); setTimeout(() => location.reload(), 900); } catch { $('#aboutMsg').textContent = t('about.importFail'); }
    e.target.value = '';
  });
  const btnSound = $('#btnSound');
  function paintSound() { btnSound.textContent = t(isMuted() ? 'nav.soundOff' : 'nav.soundOn'); }
  btnSound.addEventListener('click', () => { setMuted(!isMuted()); paintSound(); sfx.click(); });
  initMixer($('#btnMix'), { onMute: paintSound }); if (location.search.includes('sound')) initSoundTest();
  paintSound();
}

main();
