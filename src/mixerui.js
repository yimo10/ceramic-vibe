// [v15] Small volume panel (master / music / effects) behind a 🎚 button, and a sound test panel (?sound) that lists every effect so each one can be auditioned.
import { getVolume, setVolume, isMuted, setMuted, sfx, sfxNames, sfxReady } from './sfx.js';
import { getLang } from './i18n.js';
const L = () => (getLang() === 'zh' ? { m: '总音量', mu: '音乐', fx: '音效', mute: '静音', t: '声音设置', rec: '已加载录音', none: '无（使用合成音）' } : { m: 'Master', mu: 'Music', fx: 'Effects', mute: 'Mute', t: 'Sound settings', rec: 'Recordings loaded', none: 'none (synthesised)' });

export function initMixer(btn, { onMute } = {}) {
  if (!btn) return;
  let pop = null;
  const close = () => { if (pop) { pop.remove(); pop = null; } };
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); if (pop) return close();
    const T = L(); pop = document.createElement('div'); pop.className = 'mixpop';
    pop.innerHTML = `<b>${T.t}</b>` + [['master', T.m], ['music', T.mu], ['sfx', T.fx]].map(([k, n]) => `<label>${n}<input type="range" min="0" max="1" step="0.01" data-k="${k}" value="${getVolume(k)}"></label>`).join('') + `<label class="mrow"><input type="checkbox" id="mixMute" ${isMuted() ? 'checked' : ''}> ${T.mute}</label>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(); pop.style.top = r.bottom + 8 + 'px'; pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    pop.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    pop.querySelectorAll('input[type=range]').forEach((i) => i.addEventListener('input', () => { setVolume(i.dataset.k, i.value); if (i.dataset.k !== 'music') sfx.click(); }));
    pop.querySelector('#mixMute').addEventListener('change', (ev) => { setMuted(ev.target.checked); if (onMute) onMute(); });
  });
  window.addEventListener('pointerdown', close);
}

export function initSoundTest() { // open with ?sound
  const p = document.createElement('div'); p.className = 'soundtest';
  p.innerHTML = '<b>Sound test</b> <button class="x">×</button><p class="st-rec"></p><div class="st-grid"></div>';
  document.body.appendChild(p);
  p.querySelector('.x').addEventListener('click', () => p.remove());
  const grid = p.querySelector('.st-grid');
  { const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); grid.appendChild(b); }; mk('music: calm', () => sfx.ambientStart()); mk('music: faster (last minute)', () => { sfx.ambientStart(); sfx.ambientTense(); }); } // [v23]
  for (const n of sfxNames()) { const b = document.createElement('button'); b.textContent = n; b.addEventListener('click', () => sfx[n](n === 'pick' ? Math.floor(Math.random() * 8) : undefined)); grid.appendChild(b); }
  const holds = ['clay', 'lift', 'smooth', 'scrape', 'brush'];
  for (const n of holds) { const b = document.createElement('button'); b.textContent = n + ' (hold)'; b.addEventListener('pointerdown', () => { const iv = setInterval(() => sfx.hold(n, 0.5 + 0.5 * Math.sin(performance.now() / 200)), 30); const up = () => { clearInterval(iv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointerup', up); }); grid.appendChild(b); }
  sfxReady().then((s) => { p.querySelector('.st-rec').textContent = L().rec + ': ' + (s.length ? s.join(', ') : L().none); });
  window.addEventListener('pointerdown', () => sfxReady().then((s) => { p.querySelector('.st-rec').textContent = L().rec + ': ' + (s.length ? s.join(', ') : L().none); }), { once: true });
}
