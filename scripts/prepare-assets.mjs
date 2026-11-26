// Copies the MediaPipe WASM runtime into public/ and downloads the hand model once.
// Both end up inside your own site, so no video frame or model request ever goes to a third party at play time.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe/wasm');

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  cpSync(wasmSrc, wasmDst, { recursive: true });
  console.log('[assets] MediaPipe WASM copied to public/mediapipe/wasm');
} else {
  console.warn('[assets] node_modules/@mediapipe/tasks-vision not found. Run "npm install" first.');
}

const modelDir = join(root, 'public/models');
const modelPath = join(modelDir, 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

if (existsSync(modelPath)) {
  console.log('[assets] hand model already present');
} else {
  mkdirSync(modelDir, { recursive: true });
  try {
    console.log('[assets] downloading hand model (about 7.5 MB)...');
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log('[assets] hand model saved to public/models/hand_landmarker.task');
  } catch (e) {
    console.warn('\n[assets] Could not download the hand model: ' + e.message);
    console.warn('[assets] Download it manually from:\n  ' + MODEL_URL);
    console.warn('[assets] and save it as public/models/hand_landmarker.task (mouse/touch still work without it).\n');
  }
}
