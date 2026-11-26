// Thin wrapper around MediaPipe's HandLandmarker. The WASM runtime and model are served from this site
// (public/mediapipe and public/models), so video frames are processed entirely in the browser.
export class HandTracker {
  constructor() {
    this.lm = null;
    this.ready = false;
    this.initP = null;
  }

  init() {
    if (!this.initP) {
      this.initP = this._init().catch((e) => {
        this.initP = null;
        throw e;
      });
    }
    return this.initP;
  }

  async _init() {
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');

    const res = await fetch(base + 'models/hand_landmarker.task');
    const type = res.headers.get('content-type') || '';
    // a dev server may answer a missing file with index.html, so check the type too
    if (!res.ok || type.includes('text/html')) throw new Error('model-missing');
    const buf = new Uint8Array(await res.arrayBuffer());

    const fileset = await FilesetResolver.forVisionTasks(base + 'mediapipe/wasm');
    const make = (delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: buf.slice(), delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    try {
      this.lm = await make('GPU');
    } catch (e) {
      console.warn('[hands] GPU delegate unavailable, falling back to CPU', e);
      this.lm = await make('CPU');
    }
    this.ready = true;
  }

  detect(video, ts) {
    return this.lm.detectForVideo(video, ts);
  }
}
