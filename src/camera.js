// Camera + device selection + the hand-tracking loop.
// Only one stream is ever open: switching devices stops every old track first.
import { HandTracker } from './hands.js';
import { HandInterpreter, HAND_CONNECTIONS, FINGERTIPS, drawFocus } from './gestures.js';
import { t } from './i18n.js';

export class CameraController {
  constructor(o) {
    Object.assign(this, o); // video, select, openBtn, closeBtn, skCanvas, view, statusEl, offEl, confirmFn, onHands, onActive
    this.stream = null;
    this.deviceId = '';
    this.failed = new Set();
    this.looping = false;
    this.busy = false;
    this.lastTs = 0;
    this.tracker = new HandTracker();
    this.interp = new HandInterpreter();
    this.skCtx = this.skCanvas.getContext('2d');

    this.openBtn.addEventListener('click', () => this.open());
    this.closeBtn.addEventListener('click', () => this.close());
    this.select.addEventListener('change', () => this.switchTo(this.select.value));
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => this.stream && this.refreshDevices());
    }
    new ResizeObserver(() => this.sizeSk()).observe(this.view);
    this.setActive(false);
  }

  status(key, kind = '') {
    this.statusEl.textContent = key ? t(key) : '';
    this.lastError = kind === 'error' ? key : null; // [v30] the tutorial reads this to offer the mouse only when the camera really failed
    this.statusEl.dataset.kind = kind;
  }

  sizeSk() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.skCanvas.width = Math.round(this.view.clientWidth * dpr);
    this.skCanvas.height = Math.round(this.view.clientHeight * dpr);
  }

  setActive(on) {
    this.openBtn.disabled = on;
    this.closeBtn.disabled = !on;
    this.select.disabled = !on;
    this.offEl.style.display = on ? 'none' : 'flex';
    if (!on) {
      this.select.innerHTML = '';
      const o = document.createElement('option');
      o.textContent = t('cam.deviceNone'); o.dataset.i18n = 'cam.deviceNone'; // [v8] follows the language switch
      this.select.appendChild(o);
    }
    if (this.onActive) this.onActive(on);
  }

  errKey(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'cam.denied';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'cam.noDevice';
    if (n === 'NotReadableError' || n === 'AbortError') return 'cam.busy';
    return 'cam.error';
  }

  async open() {
    if (this.busy || this.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) {
      this.status('cam.insecure', 'error');
      return;
    }
    if (!(await this.confirmFn())) return; // the user must actively authorise first
    this.busy = true;
    this.status('cam.starting');
    try {
      await this.startStream(null);
      this.setActive(true);
      await this.refreshDevices();
      this.status('cam.loadingModel');
      try {
        await this.tracker.init();
        this.status('cam.on', 'ok');
        this.startLoop();
      } catch (e) {
        console.warn('[camera] hand model failed', e);
        this.status('cam.modelFail', 'error');
      }
    } catch (e) {
      console.warn('[camera] open failed', e);
      this.stopStream();
      this.setActive(false);
      this.status(this.errKey(e), 'error');
    } finally {
      this.busy = false;
    }
  }

  async startStream(deviceId) {
    this.stopStream();
    const video = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60, min: 24 } }; // higher frame rate = lower latency
    if (deviceId) video.deviceId = { exact: deviceId };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});
    if (!this.video.videoWidth) {
      await new Promise((res) => {
        this.video.onloadedmetadata = () => res();
        setTimeout(res, 3000);
      });
    }
    if (this.video.videoWidth) this.view.style.aspectRatio = `${this.video.videoWidth} / ${this.video.videoHeight}`;
    const track = stream.getVideoTracks()[0];
    this.deviceId = (track.getSettings && track.getSettings().deviceId) || deviceId || '';
    track.addEventListener('ended', () => {
      if (this.stream === stream) {
        this.close();
        this.status('cam.lost', 'error');
      }
    });
  }

  stopStream() {
    if (this.stream) this.stream.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  // Lists only real, openable video inputs. Names appear once permission has been granted.
  async refreshDevices() {
    let list = [];
    try {
      list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId && !this.failed.has(d.deviceId));
    } catch {}
    if (this.deviceId && !list.some((d) => d.deviceId === this.deviceId)) list.unshift({ deviceId: this.deviceId, label: '' });
    this.select.innerHTML = '';
    list.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || t('cam.deviceN', { n: i + 1 });
      this.select.appendChild(o);
    });
    this.select.value = this.deviceId;
  }

  async switchTo(id) {
    if (!this.stream || this.busy || !id || id === this.deviceId) return;
    this.busy = true;
    const prev = this.deviceId;
    this.looping = false;
    this.interp.reset();
    this.clearSk();
    this.onHands([]);
    try {
      await this.startStream(id);
      this.status('cam.on', 'ok');
    } catch (e) {
      console.warn('[camera] switch failed', e);
      this.failed.add(id); // never list a device that cannot be opened
      try {
        await this.startStream(prev);
        this.status('cam.switchFail', 'error');
      } catch {
        this.busy = false;
        this.close();
        this.status(this.errKey(e), 'error');
        return;
      }
    }
    await this.refreshDevices();
    this.busy = false;
    if (this.tracker.ready) this.startLoop();
  }

  close() {
    this.looping = false;
    this.stopStream();
    this.interp.reset();
    this.clearSk();
    this.onHands([]);
    this.setActive(false);
    this.status('');
  }

  clearSk() {
    this.skCtx.clearRect(0, 0, this.skCanvas.width, this.skCanvas.height);
  }

  startLoop() {
    if (this.looping) return;
    this.looping = true;
    const v = this.video;
    const step = () => {
      if (!this.looping || !this.stream) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const ts = performance.now();
        if (ts > this.lastTs) {
          this.lastTs = ts;
          let res = null;
          try { res = this.tracker.detect(v, ts); } catch (e) { console.warn(e); }
          const hands = this.interp.update(res, v.videoWidth / v.videoHeight, ts / 1000);
          this.draw(hands);
          this.onHands(hands);
        }
      }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step);
    else requestAnimationFrame(step);
  }

  // Skeleton in the camera window. The video and this canvas sit inside one wrapper that is flipped by CSS
  // when "mirror" is on, so the picture and the bones can never disagree.
  draw(hands) {
    const ctx = this.skCtx;
    const w = this.skCanvas.width, h = this.skCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const u = w / 220; // line sizes scale with the window
    for (const hd of hands) {
      const p = hd.lm.map((q) => [q.x * w, q.y * h]);
      ctx.lineWidth = Math.max(1, 1.6 * u);
      ctx.strokeStyle = 'rgba(150,215,255,.9)';
      ctx.shadowColor = 'rgba(120,200,255,.9)';
      ctx.shadowBlur = 6 * u;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(p[a][0], p[a][1]); ctx.lineTo(p[b][0], p[b][1]); }
      ctx.stroke();
      for (let i = 0; i < 21; i++) {
        const tip = FINGERTIPS.includes(i);
        ctx.fillStyle = tip ? '#ffffff' : '#a8e6ff';
        ctx.beginPath();
        ctx.arc(p[i][0], p[i][1], (tip ? 3.6 : 2.6) * u, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.focus) { ctx.shadowBlur = 0; drawFocus(ctx, p.map((q) => ({ x: q[0], y: q[1] })), hd.lm, (this.video && this.video.videoWidth / this.video.videoHeight) || 4 / 3, this.focus, u * 1.1, hd.gesture); } // [v29] tutorial: highlight the fingers being taught
      if (hd.gesture === 'pinch') {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffb36b';
        ctx.beginPath();
        ctx.arc(((hd.lm[4].x + hd.lm[8].x) / 2) * w, ((hd.lm[4].y + hd.lm[8].y) / 2) * h, 5 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
  }
}
