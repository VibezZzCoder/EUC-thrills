/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { loftPoint, loftNormal, vAtHeight, mergeGeometries, loftGeometry, loftProfile, type LoftProfile } from './blockoutKit.ts';

const smooth = THREE.MathUtils.smoothstep;
const crease = (d: number, w: number): number => Math.exp(-((d / w) ** 2));

/** Compression at the waist, diagonals under the arms and shallow back creases.
 * Both the seams and the textile sample the same surface in pelvis space. */
export function jacketFold(x: number, y: number, z: number): number {
  const side = Math.abs(x);
  const fade = smooth(y, .055, .104) * (1 - smooth(y, .48, .52));
  const waist = .0058 * crease(y - (.108 + .24 * x), .014)
    - .0044 * crease(y - (.129 + .24 * x), .010);
  const ribs = smooth(side, .055, .148) * (
    .0075 * crease(y - (.203 - .41 * x + .26 * z), .021)
    - .0048 * crease(y - (.222 - .41 * x + .26 * z), .013)
    + .0054 * crease(y - (.344 + .44 * x - .24 * z), .017));
  const back = (1 - smooth(z, -.09, .02)) * (
    .0055 * crease(y - (.32 + .28 * x), .025)
    - .0048 * crease(y - (.345 + .28 * x), .016));
  return fade * (waist + ribs + back);
}

/** Rider-left and rider-right side inserts curve in under the arms. */
export function jacketPanelWidth(y: number): number {
  return .120 + .026 * smooth(y, .10, .30) - .054 * smooth(y, .34, .50);
}

function surface(profile: LoftProfile, x: number, y: number, height: number): THREE.Vector3 {
  const v = vAtHeight(profile, y);
  const row = Math.min(Math.floor(v), profile.length - 2);
  const r = profile[row]!, next = profile[row + 1]!;
  const width = THREE.MathUtils.lerp(r.halfWidth, next.halfWidth, v - row);
  const square = THREE.MathUtils.lerp(r.square, next.square, v - row);
  const col = THREE.MathUtils.clamp(x / width, -.999, .999);
  const angle = Math.acos(Math.sign(col) * Math.abs(col) ** (square / 2));
  const point = loftPoint(profile, angle, v, new THREE.Vector3());
  const radius = Math.hypot(point.x, point.z);
  const displacement = jacketFold(point.x, point.y, point.z);
  point.x += displacement * point.x / radius;
  point.z += displacement * point.z / radius;
  return point.addScaledVector(loftNormal(profile, angle, v, new THREE.Vector3()), height);
}

/** Tapes sewn onto the jacket. The two sides, slider and pockets share the
 * existing jacket detail draw, and the stitching follows its curved surface. */
export function raceJacketClosures(profile: LoftProfile): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const strip = (from: number, to: number, centre: (t: number, y: number) => number,
    halfWidth: number, height: number, colour: number, steps = 36): void => {
    const positions: number[] = [], colours: number[] = [], indices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, y = THREE.MathUtils.lerp(from, to, t);
      for (const edge of [-1, 1]) {
        const pt = surface(profile, centre(t, y) + edge * halfWidth, y, height);
        positions.push(pt.x, pt.y, pt.z);
        colours.push(colour, colour, colour * .99);
      }
      if (i > 0) {
        const a = 2 * i - 2;
        indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    parts.push(geometry);
  };
  strip(.042, .526, () => 0, .0058, .0025, .19);
  strip(.045, .514, () => 0, .00125, .0033, .51);
  for (const side of [-1, 1]) {
    strip(.066, .489, (_, y) => side * jacketPanelWidth(y), .0017, .0026, .42);
    strip(.117, .262, (t) => side * (.116 + .020 * t), .0031, .0034, .29, 20);
  }
  const pullAt = surface(profile, .002, .464, .005);
  const pull = loftGeometry(loftProfile([
    { y: -.018, halfWidth: .0028, halfDepth: .0018, x: .003 },
    { y: -.014, halfWidth: .0046, halfDepth: .0025, x: .003 },
    { y: -.003, halfWidth: .0036, halfDepth: .0023 },
    { y: .004, halfWidth: .0046, halfDepth: .0037 },
  ]), { radialSegments: 10, shade: .26 });
  pull.translate(pullAt.x, pullAt.y, pullAt.z);
  parts.push(pull);
  return mergeGeometries(parts);
}
