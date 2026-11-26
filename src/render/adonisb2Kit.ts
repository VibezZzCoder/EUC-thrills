/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import {
  loftGeometry, loftPoint, loftProfile, mergeGeometries, patchGeometry, vAtHeight,
  type LoftProfile,
} from './blockoutKit.ts';

/** The forward side sits inside the jacket. The rear face and the gusset share a sewn edge. */
const PACK = loftProfile([
  { y: .166, halfWidth: .063, halfDepth: .030, z: -.122, square: 2.4 },
  { y: .180, halfWidth: .091, halfDepth: .047, z: -.139, square: 2.7 },
  { y: .215, halfWidth: .108, halfDepth: .060, z: -.146, square: 3.2 },
  { y: .282, halfWidth: .116, halfDepth: .068, z: -.148, square: 3.3 },
  { y: .354, halfWidth: .122, halfDepth: .068, z: -.150, square: 3.0 },
  { y: .411, halfWidth: .125, halfDepth: .062, z: -.145, square: 2.8 },
  { y: .446, halfWidth: .113, halfDepth: .050, z: -.136, square: 2.6 },
  { y: .465, halfWidth: .080, halfDepth: .037, z: -.123, square: 2.4 },
  { y: .473, halfWidth: .041, halfDepth: .022, z: -.110, square: 2.2 },
]);

export function adonisb2Pack(): THREE.BufferGeometry {
  const bag = loftGeometry(PACK, { radialSegments: 32 });
  const position = bag.getAttribute('position');
  const colour = bag.getAttribute('color');
  for (let i = 0; i < position.count; i++) {
    const u = vAtHeight(PACK, position.getY(i));
    const rear = loftPoint(PACK, -Math.PI / 2, u, new THREE.Vector3()).z;
    const distanceFromFace = position.getZ(i) - rear;
    const gusset = THREE.MathUtils.smoothstep(distanceFromFace, .014, .030);
    const shade = THREE.MathUtils.lerp(1.32, .74, gusset);
    colour.setXYZ(i, shade, shade, shade * 1.04);
  }
  // A recessed-looking zipper tape on the rounded outer pocket. Its pull starts
  // on the same surface sample so it stays attached when the profile changes.
  const zip = patchGeometry(PACK, {
    u0: -2.57, u1: -.62, v0: vAtHeight(PACK, .370), v1: vAtHeight(PACK, .378),
    uSegments: 24, vSegments: 2, skew: .47, lift: .0018, sink: -.003, shade: .42,
  });
  const eye = loftPoint(PACK, -.66, vAtHeight(PACK, .385), new THREE.Vector3());
  const pull = loftGeometry(loftProfile([
    { y: -.024, halfWidth: .0035, halfDepth: .0025, x: .002 },
    { y: -.020, halfWidth: .006, halfDepth: .0035, x: .002 },
    { y: -.004, halfWidth: .005, halfDepth: .0035 },
    { y: .003, halfWidth: .0035, halfDepth: .0025 },
  ]), { radialSegments: 8, shade: 2.1 }).translate(eye.x + .002, eye.y, eye.z - .003);
  return mergeGeometries([bag, zip, pull]);
}

/** One continuous shield. A broad silver-to-slate gradient follows its curvature. */
export function adonisb2Shield(shell: LoftProfile): THREE.BufferGeometry {
  const shield = patchGeometry(shell, {
    u0: Math.PI / 2 - 1.12, u1: Math.PI / 2 + 1.12,
    v0: vAtHeight(shell, .149), v1: vAtHeight(shell, .244),
    uSegments: 32, vSegments: 12, lift: .009, sink: -.006, taper: .33, uByArc: true,
  });
  const uv = shield.getAttribute('uv');
  const colour = shield.getAttribute('color');
  for (let i = 0; i < uv.count; i++) {
    const s = uv.getX(i), t = uv.getY(i);
    const curve = 1 - (2 * s - 1) ** 2;
    const sky = THREE.MathUtils.smoothstep(t + .13 * curve + .09 * (s - .5), .30, .87);
    const shade = (.50 + .96 * sky) * (.80 + .20 * curve);
    colour.setXYZ(i, shade * (.96 - .10 * sky), shade, shade * (1 + .12 * sky));
  }
  return shield;
}
