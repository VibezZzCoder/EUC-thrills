/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { loftGeometry, loftPoint, loftProfile, mergeGeometries, vAtHeight, type LoftProfile } from './blockoutKit.ts';

/** Keep the proven cloth envelope; add rows where a gathered surface needs them. */
export function trollinaClothSections(profile: LoftProfile, spacing = 0.024): LoftProfile {
  return loftProfile(profile.flatMap((ring, index) => {
    const next = profile[index + 1];
    if (!next) return [ring];
    const count = Math.ceil((next.y - ring.y) / spacing);
    return Array.from({ length: count }, (_, step) => {
      const t = step / count;
      return {
        y: ring.y + (next.y - ring.y) * t,
        x: ring.x + (next.x - ring.x) * t,
        z: ring.z + (next.z - ring.z) * t,
        halfWidth: ring.halfWidth + (next.halfWidth - ring.halfWidth) * t,
        halfDepth: ring.halfDepth + (next.halfDepth - ring.halfDepth) * t,
        square: ring.square + (next.square - ring.square) * t,
      };
    });
  }));
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Outward folds preserve the inner skirt surface held by the clearance contracts. */
export function sculptTrollinaDress(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const colours = geometry.getAttribute('color');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    const u = uv.getX(index) * Math.PI * 2;
    const skirt = clamp01((0.176 - y) / 0.238);
    // Broad folds open from the belt, bending slightly along their length.
    // Valleys touch the original envelope; none cut into the working thighs.
    const fold = 0.5 + 0.5 * Math.cos(9 * u + 0.32 * (1 - skirt));
    const ridge = fold ** 1.7;
    const skirtLift = 0.015 * skirt ** 0.85 * ridge;
    const bodice = clamp01((y - 0.236) / 0.050) * clamp01((0.434 - y) / 0.070);
    const dart = (0.5 + 0.5 * Math.cos(6 * u + 0.30)) ** 3;
    const lift = skirtLift + 0.0018 * bodice * dart;
    positions.setXYZ(index,
      positions.getX(index) + Math.cos(u) * lift,
      y,
      positions.getZ(index) + Math.sin(u) * lift);
    // A narrow, darker turn-under and quiet valleys make the skirt cloth,
    // rather than a coloured shell. The geometry supplies the main shading.
    const hem = y < -0.045 ? 0.90 : 1;
    const shade = hem * (1 - 0.085 * skirt * (1 - fold));
    colours.setXYZ(index, shade, shade, shade);
  }
  positions.needsUpdate = true;
  colours.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Gather the puff into its cuff while keeping its centred shoulder overlap. */
export function sculptTrollinaSleeve(geometry: THREE.BufferGeometry, side: number): void {
  const positions = geometry.getAttribute('position');
  const colours = geometry.getAttribute('color');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    const u = uv.getX(index) * Math.PI * 2;
    const puff = Math.sin(Math.PI * clamp01((y + 0.100) / 0.122));
    const gather = 0.5 + 0.5 * Math.cos(5 * u + side * 0.42 + y * 7);
    const lift = 0.0075 * puff ** 0.7 * gather ** 1.5;
    positions.setXYZ(index,
      positions.getX(index) + Math.cos(u) * lift,
      y,
      positions.getZ(index) + Math.sin(u) * lift);
    const cuff = y <= -0.085 ? 0.85 : 1;
    const shade = cuff * (0.91 + 0.09 * gather);
    colours.setXYZ(index, shade, shade, shade);
  }
  positions.needsUpdate = true;
  colours.needsUpdate = true;
  geometry.computeVertexNormals();
}

type Point = readonly [number, number, number];

/** A flowing tapered volume on an authored spine. Shared loft columns keep
 * its seam smooth; the curved centre line keeps a lock from becoming a cone. */
function flowingLock(knots: readonly Point[], width: number, depth: number, shade = 1): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(knots.map(point => new THREE.Vector3(...point)), false, 'centripetal');
  const segments = 24;
  const frames = curve.computeFrenetFrames(segments, false);
  const geometry = loftGeometry(loftProfile(Array.from({ length: segments + 1 }, (_, row) => {
    const t = row / segments;
    const opening = Math.min(1, t / 0.16);
    const taper = (1 - t) ** 0.65;
    const radius = Math.sin(opening * Math.PI / 2) * taper;
    return { y: t, halfWidth: width * radius, halfDepth: depth * radius };
  })), { radialSegments: 12, shade });
  const positions = geometry.getAttribute('position');
  const point = new THREE.Vector3(), centre = new THREE.Vector3();
  for (let row = 0; row <= segments; row++) {
    curve.getPointAt(row / segments, centre);
    for (let column = 0; column < 12; column++) {
      const index = row * 12 + column;
      point.copy(centre).addScaledVector(frames.normals[row]!, positions.getX(index))
        .addScaledVector(frames.binormals[row]!, -positions.getZ(index));
      positions.setXYZ(index, point.x, point.y, point.z);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** A low side part, long framing locks and a layered tail with directional
 * flicks. No upright crown spear: her magenta identity comes from the sweep. */
export function trollinaHair(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    loftGeometry(loftProfile([
      { y: 0.105, halfWidth: 0.078, halfDepth: 0.062, z: -0.038 },
      { y: 0.158, halfWidth: 0.123, halfDepth: 0.091, z: -0.033 },
      { y: 0.205, halfWidth: 0.135, halfDepth: 0.101, z: -0.030 },
      { y: 0.252, halfWidth: 0.137, halfDepth: 0.102, z: -0.024 },
      { y: 0.296, halfWidth: 0.113, halfDepth: 0.095, z: -0.014 },
      { y: 0.326, halfWidth: 0.078, halfDepth: 0.071, z: -0.004 },
      { y: 0.345, halfWidth: 0.036, halfDepth: 0.033, z: 0.002 },
      { y: 0.353, halfWidth: 0, halfDepth: 0 },
    ]), { radialSegments: 28, shade: 0.87 }),
    // Off-centre part and one continuous sweep over the brow into the left
    // temple. The opposite side stays close to the head, not mirrored.
    flowingLock([[-0.072, 0.283, 0.042], [-0.065, 0.319, 0.049], [0.012, 0.324, 0.059],
      [0.083, 0.286, 0.065], [0.129, 0.225, 0.047]], 0.035, 0.033, 1.05),
    flowingLock([[-0.070, 0.293, 0.020], [-0.116, 0.282, 0.024], [-0.145, 0.222, -0.020],
      [-0.130, 0.137, -0.056]], 0.041, 0.026, 0.98),
    // Longer face framing tendrils curve around the cheeks and away from
    // the neck; the eye line and grin retain their own clear opening.
    flowingLock([[0.079, 0.280, 0.041], [0.130, 0.241, 0.072], [0.143, 0.166, 0.050],
      [0.119, 0.096, 0.036], [0.144, 0.057, -0.012]], 0.033, 0.021, 1.03),
    flowingLock([[-0.108, 0.246, 0.017], [-0.133, 0.196, 0.050], [-0.131, 0.129, 0.040],
      [-0.152, 0.083, 0.003]], 0.024, 0.016, 1.07),
    // The back is layered into a long curved tail, rather than a circle of
    // spikes. Its broad overlapping ribbons share one aft/downward flow.
    flowingLock([[-0.029, 0.303, -0.071], [0.025, 0.309, -0.172], [0.077, 0.245, -0.315],
      [0.049, 0.109, -0.424], [-0.036, 0.025, -0.443]], 0.087, 0.049, 1.00),
    flowingLock([[-0.075, 0.268, -0.073], [-0.127, 0.236, -0.174], [-0.120, 0.141, -0.298],
      [-0.161, 0.069, -0.381]], 0.063, 0.034, 0.94),
    flowingLock([[0.075, 0.262, -0.064], [0.137, 0.224, -0.162], [0.152, 0.142, -0.265],
      [0.119, 0.047, -0.351]], 0.058, 0.032, 1.06),
    flowingLock([[-0.027, 0.171, -0.082], [0.014, 0.133, -0.193], [0.019, 0.044, -0.300],
      [-0.031, -0.006, -0.365]], 0.055, 0.029, 0.89),
    // A handful of thin directional flicks grow out of the coiffure; none
    // rises out of the crown as a separate spear.
    flowingLock([[-0.119, 0.232, -0.047], [-0.188, 0.201, -0.098], [-0.236, 0.218, -0.159]], 0.017, 0.009, 1.04),
    flowingLock([[0.122, 0.174, -0.115], [0.192, 0.121, -0.221], [0.238, 0.139, -0.283]], 0.017, 0.009, 1.03),
    flowingLock([[-0.069, 0.116, -0.326], [-0.115, 0.067, -0.425], [-0.187, 0.089, -0.486]], 0.016, 0.008, 0.98),
    flowingLock([[0.017, 0.286, -0.157], [0.023, 0.332, -0.236], [0.038, 0.306, -0.338]], 0.019, 0.010, 1.05),
  ];
  return mergeGeometries(parts);
}

function ball(radius: number): LoftProfile {
  return loftProfile([
    { y: -radius, halfWidth: 0, halfDepth: 0 },
    { y: -radius * 0.75, halfWidth: radius * 0.66, halfDepth: radius * 0.66 },
    { y: -radius * 0.25, halfWidth: radius * 0.97, halfDepth: radius * 0.97 },
    { y: radius * 0.25, halfWidth: radius * 0.97, halfDepth: radius * 0.97 },
    { y: radius * 0.75, halfWidth: radius * 0.66, halfDepth: radius * 0.66 },
    { y: radius, halfWidth: 0, halfDepth: 0 },
  ]);
}

/** A curved strip across the face, with station height becoming horizontal. */
function smile(width: number, thickness: number, shade: number): THREE.BufferGeometry {
  const geometry = loftGeometry(loftProfile([-1, -0.8, -0.45, 0, 0.45, 0.8, 1].map((t) => ({
    y: t * width,
    x: 0.006 - 0.012 * t * t - 0.003 * t,
    z: -0.005 * t * t,
    halfWidth: thickness * Math.sqrt(Math.max(0, 1 - t * t)),
    halfDepth: thickness * 0.62 * Math.sqrt(Math.max(0, 1 - t * t)),
  }))), { radialSegments: 12, shade });
  geometry.rotateZ(-Math.PI / 2);
  return geometry;
}

function faceTint(geometry: THREE.BufferGeometry, red: number, green: number, blue: number): THREE.BufferGeometry {
  const colours = geometry.getAttribute('color');
  for (let i = 0; i < colours.count; i++) {
    colours.setXYZ(i, colours.getX(i) * red, colours.getY(i) * green, colours.getZ(i) * blue);
  }
  return geometry;
}

/** Huge eyes, one raised eyebrow and a crooked toothy grin: playful intent. */
export function trollinaFaceParts(head: LoftProfile): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const facePoint = new THREE.Vector3();
  for (const side of [-1, 1]) {
    const sclera = loftGeometry(ball(0.027), { radialSegments: 16 });
    sclera.scale(1, side === 1 ? 1.05 : 0.94, 0.40);
    sclera.rotateZ(side * -0.10);
    sclera.translate(side * 0.041, 0.206, 0.089);
    parts.push(sclera);
    const pupil = loftGeometry(ball(0.0115), { radialSegments: 12, shade: 0.035 });
    pupil.scale(1, 1.12, 0.48);
    pupil.translate(side * 0.038 + 0.0025, 0.2055, 0.100);
    parts.push(pupil);
    const glint = loftGeometry(ball(0.0038), { radialSegments: 8 });
    glint.scale(1, 1.1, 0.40);
    glint.translate(side * 0.038 + 0.0005, 0.210, 0.105);
    parts.push(glint);
    const lidHeight = side === 1 ? 0.002 : -0.001;
    const lid = faceTint(flowingLock([
      [side * 0.016, 0.211 + lidHeight, 0.101],
      [side * 0.025, 0.229 + lidHeight, 0.102],
      [side * 0.043, 0.234 + lidHeight, 0.102],
      [side * 0.060, 0.227 + lidHeight, 0.099],
      [side * 0.068, 0.215 + lidHeight, 0.096],
    ], 0.0040, 0.0024), 0.045, 0.027, 0.055);
    parts.push(lid);
    // Long outer lashes leave the same shaped upper lid, rather than
    // floating near the eye as isolated facial spikes.
    for (const [rootX, rootY, tipX, tipY] of [
      [0.054, 0.231, 0.075, 0.253],
      [0.062, 0.225, 0.088, 0.240],
      [0.066, 0.220, 0.095, 0.227],
    ] as const) {
      parts.push(faceTint(flowingLock([
        [side * rootX, rootY + lidHeight, 0.101],
        [side * (rootX + (tipX - rootX) * 0.58), rootY + (tipY - rootY) * 0.42 + lidHeight, 0.105],
        [side * tipX, tipY + lidHeight, 0.107],
      ], 0.0034, 0.0018), 0.040, 0.022, 0.050));
    }
    const cheek = faceTint(loftGeometry(ball(0.0135), { radialSegments: 16 }), 1, 0.34, 0.46);
    cheek.scale(1.25, 0.54, 0.20);
    cheek.translate(side * 0.059, 0.172, 0);
    // Makeup follows the cheek surface rather than hovering as a pink bead.
    const cheekPositions = cheek.getAttribute('position');
    for (let vertex = 0; vertex < cheekPositions.count; vertex++) {
      const x = cheekPositions.getX(vertex), y = cheekPositions.getY(vertex);
      const v = vAtHeight(head, y);
      loftPoint(head, 0, v, facePoint);
      const halfWidth = facePoint.x;
      // The face's superellipse has square=2.4 throughout this cheek lane.
      const u = Math.acos(Math.min(1, Math.abs(x / halfWidth)) ** 1.2);
      loftPoint(head, x < 0 ? Math.PI - u : u, v, facePoint);
      cheekPositions.setZ(vertex, facePoint.z + cheekPositions.getZ(vertex) + 0.0005);
    }
    cheek.computeVertexNormals();
    parts.push(cheek);
    const brow = loftGeometry(loftProfile([
      { y: -0.022, x: 0.003, halfWidth: 0, halfDepth: 0 },
      { y: -0.012, x: -0.003, halfWidth: 0.0034, halfDepth: 0.0025 },
      { y: 0.004, x: -0.005, halfWidth: 0.0042, halfDepth: 0.003 },
      { y: 0.019, x: 0.001, halfWidth: 0.0028, halfDepth: 0.002 },
      { y: 0.024, x: 0.003, halfWidth: 0, halfDepth: 0 },
    ]), { radialSegments: 10, shade: 0.055 });
    brow.rotateZ(-Math.PI / 2 + (side === 1 ? -0.10 : 0.27));
    brow.translate(side * 0.040, side === 1 ? 0.247 : 0.242, 0.093);
    parts.push(brow);
  }
  const lips = faceTint(smile(0.041, 0.0115, 1), 0.79, 0.13, 0.30);
  lips.translate(0, 0.154, 0.0995);
  parts.push(lips);
  const mouth = smile(0.039, 0.009, 0.055);
  mouth.translate(0, 0.154, 0.100);
  parts.push(mouth);
  const teeth = smile(0.031, 0.0035, 0.97);
  teeth.translate(0, 0.158, 0.106);
  parts.push(teeth);
  return mergeGeometries(parts);
}
