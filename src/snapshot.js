// Renders a pot alone, centred, on a transparent background. Used for "download image" and gallery thumbnails.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PotMesh } from './pot.js';

let R = null;

function getRenderer() {
  if (R) return R;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  R = { renderer, env };
  return R;
}

// Same glaze, finish, patterns and ornaments as in the studio, because it uses the same PotMesh.
export function potImage(clay, size = 1024, opts = {}) { // [v5] opts.tint: body tint of the wet / dry / biscuit look
  const { renderer, env } = getRenderer();
  renderer.setSize(size, size, false);

  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.75;

  const pot = new PotMesh(clay, { maxAniso: 8 });
  pot.update(true);
  if (opts.tint) pot.setTint(opts.tint);
  scene.add(pot.root);
  scene.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(pot.root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  pot.root.position.sub(sphere.center); // centre the pot on the origin
  const fov = 28;
  const dist = (sphere.radius / Math.sin((fov * Math.PI) / 360)) * 1.06;
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 50);
  const el = (12 * Math.PI) / 180;
  cam.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
  cam.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x8a6a50, 0.55));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
  key.position.set(3, 4, 5);
  const fillL = new THREE.DirectionalLight(0xd8e4ff, 0.7);
  fillL.position.set(-4, 1, 3);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(0, 3, -4);
  scene.add(key, fillL, rim);

  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  pot.dispose();
  // this temporary PotMesh cleared the clay's dirty flags; make the studio's own mesh refresh everything once
  clay.geoDirty = clay.texDirty = clay.finishDirty = clay.innerDirty = clay.ornDirty = true;
  return url;
}
