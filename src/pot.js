// THREE wrapper around a Clay: geometry, glaze materials, finish textures and 3D ornaments.
// The same PotMesh is used by the studio, the gallery (with a lighter mesh) and the image snapshot.
import * as THREE from 'three';
import { createBuffers, fillBuffers, surfaceFrame } from './meshbuild.js';
import { buildOrnament } from './ornaments.js';
import { DY } from './clay.js';

export { GLAZES, hexToRgb } from './clay.js';

export class PotMesh {
  constructor(clay, { rowStep = 1, segStep = 1, maxAniso = 4 } = {}) {
    this.clay = clay;
    this.buf = createBuffers({ rowStep, segStep });
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.buf.position, 3);
    this.nrmAttr = new THREE.BufferAttribute(this.buf.normal, 3);
    this.uvAttr = new THREE.BufferAttribute(this.buf.uv, 2);
    this.idxAttr = new THREE.BufferAttribute(this.buf.index, 1);
    for (const a of [this.posAttr, this.nrmAttr, this.uvAttr, this.idxAttr]) a.usage = THREE.DynamicDrawUsage;
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('normal', this.nrmAttr);
    geo.setAttribute('uv', this.uvAttr);
    geo.setIndex(this.idxAttr);
    this.geo = geo;

    this.tex = new THREE.CanvasTexture(clay.display);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.wrapS = THREE.RepeatWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.anisotropy = maxAniso;
    this.bumpTex = null; this.matTex = null;
    this.tint = null; // [v5] optional body tint [r,g,b] 0..1 (ancient-craft mode: wet / dry / biscuit look)
    this.glow = 0; // [v5] kiln glow 0..1 (just out of the kiln)

    this.outerMat = new THREE.MeshPhysicalMaterial({ map: this.tex, roughness: 0.34, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.12 });
    this.innerMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(clay.innerColor), roughness: 0.34, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.12 });
    this.mesh = new THREE.Mesh(geo, [this.outerMat, this.innerMat]);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    this.ornGroup = new THREE.Group();
    this.ornMeshes = new Map();
    this.root = new THREE.Group();
    this.root.add(this.mesh, this.ornGroup);
    this._lastTex = 0;
    this.update(true);
  }

  // Call once per frame. Geometry updates every frame it changed; the (larger) texture upload can be throttled.
  update(force = false, now = performance.now(), texInterval = 0) {
    const c = this.clay;
    if (c.geoDirty || force) {
      fillBuffers(c, this.buf);
      this.posAttr.needsUpdate = this.nrmAttr.needsUpdate = this.uvAttr.needsUpdate = this.idxAttr.needsUpdate = true;
      this.geo.clearGroups();
      this.geo.addGroup(0, this.buf.outerCount, 0);
      this.geo.addGroup(this.buf.outerCount, this.buf.innerCount, 1);
      this.geo.setDrawRange(0, this.buf.outerCount + this.buf.innerCount);
      const H = c.height(), R = c.maxRadius() + 0.1;
      if (!this.geo.boundingSphere) this.geo.boundingSphere = new THREE.Sphere();
      this.geo.boundingSphere.center.set(0, H / 2, 0);
      this.geo.boundingSphere.radius = Math.hypot(R, H / 2) + 0.05;
      c.geoDirty = false;
      this.seat();
    }
    if (c.finishDirty || force) this.applyFinish();
    if (c.texDirty || force) {
      if (force || now - this._lastTex >= texInterval) {
        c.composite();
        this.tex.needsUpdate = true;
        if (c.gl || c.hasRelief) { if (this.bumpTex) this.bumpTex.needsUpdate = true; if (this.matTex) this.matTex.needsUpdate = true; } // [v20] masked glaze maps follow the paint
        c.texDirty = false;
        this._lastTex = now;
      }
    }
    if (c.innerDirty || force) {
      this.innerMat.color.set(c.innerColor);
      this._applyTint(true);
      c.innerDirty = false;
    }
    if (c.ornDirty || force) this.syncOrnaments();
  }

  // [v5] tint = multiplies the colours of the body (null = untouched); setGlow = hot-from-the-kiln emission
  setTint(rgb) { this.tint = rgb || null; this._applyTint(); }
  _applyTint(innerOnly) {
    const k = this.tint || [1, 1, 1];
    if (!innerOnly) this.outerMat.color.setRGB(k[0], k[1], k[2]);
    if (this.tint) { const c = this.innerMat.color; c.setRGB(c.r * k[0], c.g * k[1], c.b * k[2]); }
  }
  setGlow(v) {
    this.glow = v;
    for (const m of [this.outerMat, this.innerMat]) { m.emissive.setRGB(1, 0.42, 0.1); m.emissiveIntensity = v * 0.9; }
  }

  applyFinish() {
    const c = this.clay, p = c.fparams;
    for (const m of [this.outerMat, this.innerMat]) {
      const q = m === this.innerMat && c.gl ? c.bodyParams : p; // the inside never takes the masked glaze
      m.roughness = q.roughness; m.clearcoat = q.clearcoat; m.clearcoatRoughness = q.clearcoatRoughness;
      m.iridescence = q.iridescence; m.iridescenceIOR = 1.6;
      m.needsUpdate = true;
    }
    if (this.matTex) { this.matTex.dispose(); this.matTex = null; }
    if (c.gl) { this.matTex = new THREE.CanvasTexture(c.matMap); this.matTex.wrapS = THREE.RepeatWrapping; this.matTex.wrapT = THREE.ClampToEdgeWrapping; }
    this.outerMat.roughnessMap = this.matTex; this.outerMat.clearcoatMap = this.matTex; // G = roughness share, R = clear-coat share
    if (this.bumpTex) { this.bumpTex.dispose(); this.bumpTex = null; }
    const bsrc = (c.gl || c.hasRelief) ? c.bumpShown : c.bump; // [v24] raised / sunken marks use the combined bump map
    if (bsrc) {
      this.bumpTex = new THREE.CanvasTexture(bsrc);
      this.bumpTex.wrapS = THREE.RepeatWrapping;
      this.bumpTex.wrapT = THREE.ClampToEdgeWrapping;
      this.bumpTex.anisotropy = this.tex.anisotropy;
    }
    this.outerMat.bumpMap = this.bumpTex;
    this.outerMat.bumpScale = p.bumpScale;
    this.outerMat.needsUpdate = true;
    c.finishDirty = false;
  }

  // ---- ornaments ----
  syncOrnaments() {
    const c = this.clay, seen = new Set();
    for (const o of c.ornaments) {
      seen.add(o.id);
      let g = this.ornMeshes.get(o.id);
      if (!g || g.userData.type !== o.type) {
        if (g) this.ornGroup.remove(g);
        g = buildOrnament(o.type);
        g.userData = { type: o.type, ornId: o.id };
        g.traverse((m) => { m.userData.ornId = o.id; });
        this.ornMeshes.set(o.id, g);
        this.ornGroup.add(g);
      }
    }
    for (const [id, g] of this.ornMeshes) if (!seen.has(id)) { this.ornGroup.remove(g); this.ornMeshes.delete(id); }
    this.seat();
    c.ornDirty = false;
  }

  seat() {
    const c = this.clay, q = new THREE.Quaternion(), n = new THREE.Vector3(), tw = new THREE.Quaternion();
    for (const o of c.ornaments) {
      const g = this.ornMeshes.get(o.id);
      if (!g) continue;
      o.y = Math.min(Math.max(o.y, 0.02), c.height());
      const f = surfaceFrame(c, o.theta, o.y);
      n.set(f.normal[0], f.normal[1], f.normal[2]);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      tw.setFromAxisAngle(n, o.rot || 0);
      g.quaternion.copy(tw.multiply(q));
      g.position.set(f.pos[0] + n.x * 0.004, f.pos[1] + n.y * 0.004, f.pos[2] + n.z * 0.004);
      g.scale.setScalar(o.scale || 1);
    }
  }

  pickOrnament(raycaster) {
    const hits = raycaster.intersectObjects(this.ornGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.ornId) o = o.parent;
      if (o) return o.userData.ornId;
    }
    return null;
  }

  dispose() {
    this.geo.dispose();
    this.tex.dispose();
    if (this.bumpTex) this.bumpTex.dispose();
    this.outerMat.dispose();
    this.innerMat.dispose();
  }
}

export { DY };
