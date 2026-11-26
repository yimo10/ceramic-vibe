// Six small 3D decorations that can be dragged onto the pot. Each group is built around the origin with its
// back on the surface and local +Z pointing away from the pot; geometries and materials are shared.
import * as THREE from 'three';

export const ORNAMENTS = [
  { id: 'flower', zh: '小花', en: 'Flower', icon: '🌸' },
  { id: 'bamboo', zh: '竹子', en: 'Bamboo', icon: '🎋' },
  { id: 'leaf', zh: '叶子', en: 'Leaves', icon: '🍃' },
  { id: 'pearl', zh: '珍珠', en: 'Pearl', icon: '⚪' },
  { id: 'butterfly', zh: '蝴蝶', en: 'Butterfly', icon: '🦋' },
  { id: 'ruyi', zh: '如意云', en: 'Ruyi cloud', icon: '☁️' }
];

const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2, ...o });
const M = {
  pink: mat(0xf2a7bb), yellow: mat(0xf1c04f), green: mat(0x5f9a56), darkGreen: mat(0x3f7a4a),
  pearl: mat(0xf4efe6, { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 1, sheenColor: new THREE.Color(0xdfe6ff) }),
  gold: mat(0xd9a93c, { metalness: 0.9, roughness: 0.28 }),
  orange: mat(0xf08a3c), blue: mat(0x4a7fc4), jade: mat(0x86cdb2, { roughness: 0.25, clearcoat: 1 })
};

const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  torus: new THREE.TorusGeometry(1, 0.28, 10, 24),
  cone: new THREE.ConeGeometry(1, 1, 14)
};
let ruyiGeo = null;
function ruyiGeometry() {
  if (ruyiGeo) return ruyiGeo;
  const s = new THREE.Shape();
  s.moveTo(0, 0.62);
  s.bezierCurveTo(0.34, 0.62, 0.7, 0.34, 0.64, 0.02);
  s.bezierCurveTo(0.6, -0.2, 0.3, -0.2, 0.16, -0.46);
  s.lineTo(-0.16, -0.46);
  s.bezierCurveTo(-0.3, -0.2, -0.6, -0.2, -0.64, 0.02);
  s.bezierCurveTo(-0.7, 0.34, -0.34, 0.62, 0, 0.62);
  ruyiGeo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 14 });
  return ruyiGeo;
}

const mesh = (g, m, p, s, r) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(...p); o.scale.set(...s);
  if (r) o.rotation.set(...r);
  o.castShadow = true;
  return o;
};

export function buildOrnament(type) {
  const g = new THREE.Group();
  const U = 0.11; // overall size in pot units
  switch (type) {
    case 'flower': {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        g.add(mesh(G.sphere, M.pink, [Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0.012], [0.04, 0.026, 0.014], [0, 0, a]));
      }
      g.add(mesh(G.sphere, M.yellow, [0, 0, 0.022], [0.026, 0.026, 0.02]));
      break;
    }
    case 'bamboo': {
      for (let i = 0; i < 4; i++) {
        g.add(mesh(G.cyl, M.green, [0, -0.07 + i * 0.07, 0.016], [0.013, 0.066, 0.013]));
        g.add(mesh(G.torus, M.darkGreen, [0, -0.035 + i * 0.07, 0.016], [0.016, 0.016, 0.016], [Math.PI / 2, 0, 0]));
      }
      g.add(mesh(G.sphere, M.green, [0.05, 0.1, 0.02], [0.05, 0.012, 0.01], [0, 0, 0.5]));
      g.add(mesh(G.sphere, M.darkGreen, [-0.05, 0.05, 0.02], [0.05, 0.012, 0.01], [0, 0, -0.5]));
      g.add(mesh(G.sphere, M.green, [0.05, -0.02, 0.02], [0.045, 0.011, 0.01], [0, 0, 0.35]));
      break;
    }
    case 'leaf': {
      g.add(mesh(G.sphere, M.green, [0.04, 0.03, 0.012], [0.07, 0.026, 0.012], [0, 0, 0.6]));
      g.add(mesh(G.sphere, M.darkGreen, [-0.04, 0.03, 0.012], [0.07, 0.026, 0.012], [0, 0, Math.PI - 0.6]));
      g.add(mesh(G.sphere, M.green, [0, -0.03, 0.012], [0.065, 0.024, 0.012], [0, 0, Math.PI / 2 + 0.1]));
      break;
    }
    case 'pearl': {
      g.add(mesh(G.torus, M.gold, [0, 0, 0.02], [0.05, 0.05, 0.05]));
      g.add(mesh(G.sphere, M.pearl, [0, 0, 0.04], [0.042, 0.042, 0.042]));
      break;
    }
    case 'butterfly': {
      for (const sg of [1, -1]) {
        g.add(mesh(G.sphere, M.orange, [sg * 0.05, 0.032, 0.014], [0.048, 0.04, 0.007], [0, 0, sg * 0.45]));
        g.add(mesh(G.sphere, M.blue, [sg * 0.04, -0.034, 0.012], [0.034, 0.03, 0.006], [0, 0, -sg * 0.4]));
      }
      g.add(mesh(G.sphere, M.darkGreen, [0, 0, 0.02], [0.008, 0.05, 0.01]));
      break;
    }
    case 'ruyi': {
      const m = new THREE.Mesh(ruyiGeometry(), M.jade);
      m.scale.setScalar(0.1);
      m.position.z = 0.0;
      m.castShadow = true;
      g.add(m);
      break;
    }
    default:
      g.add(mesh(G.sphere, M.pink, [0, 0, 0.02], [0.03, 0.03, 0.03]));
  }
  g.scale.setScalar(U / 0.11);
  return g;
}

// The tray icons use emoji so no extra assets are needed.
export const ornamentById = (id) => ORNAMENTS.find((o) => o.id === id) || ORNAMENTS[0];
