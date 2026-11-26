// [v14] Turns a pot photo (transparent background) into small pixel art: crop to the pot, fit it into an N x N grid sitting on the shelf,
// reduce to a few colour steps with a little extra saturation, and add a dark one-pixel outline. Returns a canvas (N x N), scale it up with
// `image-rendering: pixelated`.
const INK = [35, 22, 15];
const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

export async function pixelize(url, N = 48, levels = 6) {
  const img = await loadImg(url);
  // 1. find the bounding box of the visible pixels
  const S = 192, t = document.createElement('canvas'); t.width = t.height = S;
  const tg = t.getContext('2d', { willReadFrequently: true }); tg.drawImage(img, 0, 0, S, S);
  const d = tg.getImageData(0, 0, S, S).data;
  let x0 = S, y0 = S, x1 = -1, y1 = -1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = S - 1; y1 = S - 1; }
  const k = img.width / S, bw = (x1 - x0 + 1) * k, bh = (y1 - y0 + 1) * k;
  // 2. draw it small (smoothed down-sampling), centred, bottom-aligned
  const box = N - 4, sc = Math.min(box / bw, box / bh), w = Math.max(1, Math.round(bw * sc)), h = Math.max(1, Math.round(bh * sc));
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const dx = Math.round((N - w) / 2), dy = N - 2 - h;
  g.drawImage(img, x0 * k, y0 * k, bw, bh, dx, dy, w, h);
  const id = g.getImageData(0, 0, N, N), px = id.data;
  // 3. hard alpha, posterise (with contrast + saturation), then outline
  const solid = new Uint8Array(N * N);
  const q = (v) => Math.round((v / 255) * (levels - 1)) * (255 / (levels - 1));
  for (let i = 0; i < N * N; i++) {
    const a = px[i * 4 + 3]; if (a < 110) { px[i * 4 + 3] = 0; continue; }
    solid[i] = 1; let r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
    const l = (r + gg + b) / 3; r = l + (r - l) * 1.3; gg = l + (gg - l) * 1.3; b = l + (b - l) * 1.3; // saturation
    const cl = (v) => Math.max(0, Math.min(255, (v - 128) * 1.12 + 128));
    px[i * 4] = q(cl(r)); px[i * 4 + 1] = q(cl(gg)); px[i * 4 + 2] = q(cl(b)); px[i * 4 + 3] = 255;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; if (solid[i]) continue;
    const n = (x > 0 && solid[i - 1]) || (x < N - 1 && solid[i + 1]) || (y > 0 && solid[i - N]) || (y < N - 1 && solid[i + N]);
    if (n) { px[i * 4] = INK[0]; px[i * 4 + 1] = INK[1]; px[i * 4 + 2] = INK[2]; px[i * 4 + 3] = 255; }
  }
  g.putImageData(id, 0, 0);
  return c;
}
