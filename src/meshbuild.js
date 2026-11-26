// Turns a Clay into plain typed arrays (positions, uvs, normals, indices, two material groups).
// No THREE here on purpose: the arrays are uploaded by pot.js and can be unit-tested in isolation.
//
// Profile order (one ring of SEGS+1 vertices per entry, the extra column closes the texture seam):
//   foot centre -> outer wall rows (foot..rim) -> rim A -> rim B -> inner wall rows (rim..floor) -> floor centre
// Group 0 = outside + rim top (painted texture), group 1 = inside (plain glaze colour).
import { SEGS, DY, N_MAX, FLOOR_ROW, TAU } from './clay.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createBuffers({ rowStep = 1, segStep = 1 } = {}) {
  const S = SEGS / segStep, C = S + 1;
  const maxP = 1 + N_MAX + 2 + (N_MAX - FLOOR_ROW) + 1;
  const maxVerts = maxP * C;
  return {
    S, C, rowStep, segStep, maxVerts,
    position: new Float32Array(maxVerts * 3),
    normal: new Float32Array(maxVerts * 3),
    uv: new Float32Array(maxVerts * 2),
    index: new Uint16Array((maxP - 1) * S * 6),
    vertCount: 0, outerCount: 0, innerCount: 0, descCount: 0
  };
}

function ladder(a, b, step) {
  const out = [a];
  for (let r = a + step; r < b; r += step) out.push(r);
  if (b !== a) out.push(b);
  return out;
}

export function fillBuffers(clay, buf) {
  const { S, C, segStep, rowStep, position, uv, index } = buf;
  const n = clay.n, thick = clay.thick, radii = clay.viewRadii ? clay.viewRadii() : clay.radii; // [v8] includes the transient soft-body squish
  const solid = !!clay.solid; // [v3] closed lump: dome on top, nothing inside

  const outer = ladder(0, n - 1, rowStep);
  const inner = ladder(FLOOR_ROW, n - 1, rowStep).reverse();
  const descs = [{ t: 0, row: 0 }];
  for (const r of outer) descs.push({ t: 1, row: r });
  descs.push({ t: 2, row: n - 1, a: 0.15 }, { t: 2, row: n - 1, a: 0.85 });
  for (const r of inner) descs.push({ t: 3, row: r });
  descs.push({ t: 4, row: FLOOR_ROW });
  const P = descs.length;

  let o = 0, u = 0;
  for (let p = 0; p < P; p++) {
    const d = descs[p];
    const v = (d.row + 0.5) / N_MAX;
    for (let kk = 0; kk <= S; kk++) {
      const k = (kk * segStep) % SEGS;
      const th = (k * TAU) / SEGS;
      const R = radii[d.row * SEGS + k];
      let r, y;
      switch (d.t) {
        case 0: r = 0; y = 0; break;
        case 1: r = R; y = d.row * DY; break;
        case 2:
          if (solid) { // [v3] closed lump: the two "rim" rings become a dome cap (wide ring, then the pole)
            const first = d.a < 0.5;
            r = first ? R * 0.72 : 0; y = d.row * DY + R * (first ? 0.22 : 0.3);
          } else { r = Math.max(R - thick * d.a, 0.05); y = d.row * DY + 0.016; }
          break;
        case 3:
          if (solid) { r = 0; y = (n - 1) * DY + radii[(n - 1) * SEGS + k] * 0.3; } // [v3] no inside: collapsed onto the pole
          else { r = Math.max(R - thick, 0.05); y = d.row * DY; }
          break;
        default:
          if (solid) { r = 0; y = (n - 1) * DY + radii[(n - 1) * SEGS + k] * 0.3; }
          else { r = 0; y = FLOOR_ROW * DY; }
      }
      position[o] = r * Math.cos(th); position[o + 1] = y; position[o + 2] = r * Math.sin(th);
      uv[u] = 1 - kk / S; uv[u + 1] = v;
      o += 3; u += 2;
    }
  }
  const vertCount = P * C;
  if (vertCount < buf.vertCount) position.fill(0, vertCount * 3, buf.vertCount * 3);

  // indices; the outer group ends after the rim-top pair
  const outerPairs = outer.length + 2;
  let ii = 0;
  for (let p = 0; p < P - 1; p++) {
    if (p === outerPairs) buf.outerCount = ii;
    for (let kk = 0; kk < S; kk++) {
      const a = p * C + kk, b = (p + 1) * C + kk, c = (p + 1) * C + kk + 1, e = p * C + kk + 1;
      index[ii++] = a; index[ii++] = b; index[ii++] = c;
      index[ii++] = a; index[ii++] = c; index[ii++] = e;
    }
  }
  buf.innerCount = ii - buf.outerCount;
  buf.vertCount = vertCount;
  buf.descCount = P;
  computeNormals(buf, ii);
  return buf;
}

function computeNormals(buf, idxCount) {
  const { position: pos, normal: nrm, index, vertCount, C, S, descCount } = buf;
  nrm.fill(0, 0, vertCount * 3);
  for (let t = 0; t < idxCount; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { nrm[q] += nx; nrm[q + 1] += ny; nrm[q + 2] += nz; }
  }
  // close the seam: the first and last column are the same place, so they must share a normal
  for (let p = 0; p < descCount; p++) {
    const a = p * C * 3, b = (p * C + S) * 3;
    nrm[a] += nrm[b]; nrm[a + 1] += nrm[b + 1]; nrm[a + 2] += nrm[b + 2];
    nrm[b] = nrm[a]; nrm[b + 1] = nrm[a + 1]; nrm[b + 2] = nrm[a + 2];
  }
  for (let i = 0; i < vertCount * 3; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]);
    if (l > 1e-12) { nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; } else { nrm[i] = 0; nrm[i + 1] = 1; nrm[i + 2] = 0; }
  }
}

// point + outward normal on the outer wall, used to seat ornaments
export function surfaceFrame(clay, theta, y) {
  const H = clay.height();
  const yy = clamp(y, 0, H);
  const r = clay.radiusAt(yy, theta);
  const y1 = Math.max(0, yy - DY * 1.5), y2 = Math.min(H, yy + DY * 1.5);
  const drdy = (clay.radiusAt(y2, theta) - clay.radiusAt(y1, theta)) / Math.max(1e-6, y2 - y1);
  const c = Math.cos(theta), s = Math.sin(theta);
  const l = Math.hypot(1, drdy);
  return { pos: [r * c, yy, r * s], normal: [c / l, -drdy / l, s / l], y: yy };
}
