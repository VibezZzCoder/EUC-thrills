/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Foliage geometry — the shapes the environment pass of 2026-09-08 gave the
 * trees, and the tone vocabulary every recipe shares.
 *
 * The baseline crown is two unsubdivided icosahedra on a pole and the baseline
 * conifer is three perfect cones on one axis; at chase-camera distance they
 * read as green rocks and stacked traffic cones, and a four-seat pane makes
 * it worse. Both stay buildable (`render/props.ts` keeps them as the baseline
 * recipe), and this file adds the enhanced shapes for the *same* part buckets,
 * so a richer tree costs triangles and never a draw call.
 *
 * Three rules, each with a failure behind it:
 *
 * - **Inside the envelope.** `data/props.ts` sizes are placement data: the
 *   crown radius is the building guard's spread, the conifer's widest tier is
 *   its footprint, the vertical span is what a canopy is cleared against. So
 *   every enhanced shape is fitted into the box its baseline shape spanned —
 *   the fit is applied, not hoped for — and `render/foliageKit.test.ts`
 *   measures it. The conifer keeps its 0.25 m burial and its 7.9 m top.
 * - **Organic, not smoothed.** A lobed radial displacement field gives a crown
 *   a clustered, asymmetric outline with real recesses; per-face normals are
 *   then softened *towards* the radial direction, not replaced by it, so the
 *   mass reads as foliage without becoming the smooth ball `DESIGN.md` §7
 *   warns against. Tier rims on the conifer are jittered inward and the tiers
 *   are turned against each other so no two rims align.
 * - **Deterministic.** Every irregularity is an integer hash of a vertex index
 *   and a salt (`shared/maths.ts:positionHash01`), never `Math.random`, so a
 *   rebuild of the same world is the same world and the tests mean something.
 *
 * Tones ride the geometry's own `color` attribute — the same channel the
 * facades and the gantry use — and are normalised to a mean of 1.0 so the
 * instance tint, and therefore the authored foliage albedo, is untouched.
 */
import * as THREE from 'three';
import { PROP_SIZES } from '../data/props.ts';
import { positionHash01 } from '../shared/maths.ts';

/** An axis-aligned box in the prop's own frame, metres. */
export interface Envelope {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

const tree = PROP_SIZES.broadleafTree;
const spruce = PROP_SIZES.conifer;
const bush = PROP_SIZES.shrub;

/** The box the baseline crown's two lobes span. */
export const CROWN_ENVELOPE: Envelope = Object.freeze({
  min: [-tree.crownRadius, tree.crownCentre - tree.crownHeight / 2, -tree.crownRadius * 0.92] as const,
  max: [
    tree.crownRadius,
    Math.max(
      tree.crownCentre + tree.crownHeight / 2,
      tree.upperCentre + tree.upperRadius * 0.85,
    ),
    tree.crownRadius * 0.92,
  ] as const,
});

/** The cylinder the baseline conifer stack spans, as its box. */
export const CONIFER_ENVELOPE: Envelope = (() => {
  const radius = Math.max(...spruce.tiers.map((tier) => tier.radius));
  return Object.freeze({
    min: [-radius, Math.min(...spruce.tiers.map((tier) => tier.base)), -radius] as const,
    max: [radius, Math.max(...spruce.tiers.map((tier) => tier.base + tier.height)), radius] as const,
  });
})();

/** The box the baseline shrub's squashed icosahedron spans. */
export const SHRUB_ENVELOPE: Envelope = Object.freeze({
  min: [-bush.radius * bush.scaleX, bush.centre - bush.radius * bush.scaleY, -bush.radius * bush.scaleZ] as const,
  max: [bush.radius * bush.scaleX, bush.centre + bush.radius * bush.scaleY, bush.radius * bush.scaleZ] as const,
});

/** Tone vocabulary shared by every foliage part, baseline or enhanced. */
export const FOLIAGE_TONES = Object.freeze({
  /** Added per unit of upward-facing normal: sunlit tops read lighter. */
  lift: 0.13,
  /** Subtracted per unit of downward-facing normal: undersides sit back. */
  drop: 0.10,
  /** Added per unit of outward displacement: a lobe's tip is the newest growth. */
  reach: 0.30,
  /** Hard bounds on any one corner's tone. */
  min: 0.80,
  max: 1.22,
  /** How far a face normal is bent towards the radial direction, 0..1. */
  soften: 0.42,
});

interface Lobe {
  readonly direction: readonly [number, number, number];
  /** Radial displacement at the lobe's centre, as a fraction of the radius. */
  readonly amplitude: number;
  /** Angular width, radians, of the Gaussian falloff. */
  readonly sigma: number;
}

/**
 * The crown's clusters and recesses: five swellings and three hollows, placed
 * by eye so the outline is asymmetric from every side the chase camera sees.
 * The third hollow is under the crown, so the underside is not a dome.
 */
const CROWN_LOBES: readonly Lobe[] = [
  { direction: [0.55, 0.70, -0.35], amplitude: 0.30, sigma: 0.72 },
  { direction: [-0.88, 0.25, 0.32], amplitude: 0.24, sigma: 0.60 },
  { direction: [0.20, 0.30, 0.92], amplitude: 0.20, sigma: 0.60 },
  { direction: [-0.35, -0.05, -0.93], amplitude: 0.17, sigma: 0.56 },
  { direction: [-0.30, 0.95, 0.15], amplitude: 0.14, sigma: 0.52 },
  { direction: [0.85, -0.30, 0.45], amplitude: -0.20, sigma: 0.50 },
  { direction: [-0.40, 0.55, -0.72], amplitude: -0.16, sigma: 0.46 },
  { direction: [0.05, -0.75, 0.60], amplitude: -0.12, sigma: 0.55 },
];

/** The shrub's two swellings and one hollow. */
const SHRUB_LOBES: readonly Lobe[] = [
  { direction: [0.62, 0.55, -0.55], amplitude: 0.20, sigma: 0.70 },
  { direction: [-0.80, 0.30, 0.50], amplitude: 0.15, sigma: 0.65 },
  { direction: [0.10, 0.20, 0.97], amplitude: -0.12, sigma: 0.55 },
];

function normalised(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Radial displacement for a unit direction under a lobe set. */
export function lobeDisplacement(direction: readonly [number, number, number], lobes: readonly Lobe[]): number {
  let total = 0;
  for (const lobe of lobes) {
    const axis = normalised(lobe.direction);
    const cosine = Math.max(-1, Math.min(1,
      direction[0] * axis[0] + direction[1] * axis[1] + direction[2] * axis[2]));
    const angle = Math.acos(cosine);
    total += lobe.amplitude * Math.exp(-(angle * angle) / (lobe.sigma * lobe.sigma));
  }
  return total;
}

/** A deterministic jitter in [-1, 1) for a vertex slot and a salt. */
function jitter(index: number, salt: number): number {
  return positionHash01(index, salt, 431) * 2 - 1;
}

/**
 * Displace a unit sphere's vertices along their own directions, flatten its
 * floor, then fit the result into `envelope` about `centre`.
 *
 * Works on non-indexed geometry: a direction is a pure function of the
 * vertex, so duplicate corners displace identically and the shell stays
 * closed. Returns the per-corner displacement for the tone pass.
 */
function sculptSphere(
  geometry: THREE.BufferGeometry,
  centre: readonly [number, number, number],
  radii: readonly [number, number, number],
  lobes: readonly Lobe[],
  floor: number,
  envelope: Envelope,
  salt: number,
  fit: 'uniform' | 'axis',
): Float32Array {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const reach = new Float32Array(position.count);
  const direction: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = Math.hypot(x, y, z) || 1;
    direction[0] = x / length;
    direction[1] = y / length;
    direction[2] = z / length;
    // The jitter is keyed on the quantised direction, not the corner index,
    // so the three corners meeting at one vertex agree and the shell closes.
    const key = Math.round(direction[0] * 512) * 7 + Math.round(direction[1] * 512) * 131
      + Math.round(direction[2] * 512) * 2609;
    const displacement = lobeDisplacement(direction, lobes) + jitter(key, salt) * 0.035;
    reach[i] = displacement;
    const r = 1 + displacement;
    let px = centre[0] + direction[0] * r * radii[0];
    let py = centre[1] + direction[1] * r * radii[1];
    let pz = centre[2] + direction[2] * r * radii[2];
    // A soft floor: the underside flattens where it would meet the trunk,
    // rather than hanging a point below the crown's own span.
    if (py < floor) py = floor + (py - floor) * 0.25;
    position.setXYZ(i, px, py, pz);
  }

  fitInto(geometry, centre, envelope, fit);
  return reach;
}

/**
 * Scale a geometry about `centre` until it lies inside `envelope`, and clamp
 * whatever a floor left behind. `uniform` keeps the proportions a shape was
 * sculpted with (the crown); `axis` fills the box on each axis independently
 * (the conifer and the shrub, whose burial and footprint are the envelope's
 * own edges).
 */
function fitInto(
  geometry: THREE.BufferGeometry,
  centre: readonly [number, number, number],
  envelope: Envelope,
  fit: 'uniform' | 'axis',
): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const scale = [1, 1, 1];
  for (let i = 0; i < position.count; i += 1) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    for (let axis = 0; axis < 3; axis += 1) {
      const offset = p[axis] - centre[axis];
      if (offset > 0) scale[axis] = Math.min(scale[axis], (envelope.max[axis] - centre[axis]) / offset);
      if (offset < 0) scale[axis] = Math.min(scale[axis], (envelope.min[axis] - centre[axis]) / offset);
    }
  }
  if (fit === 'uniform') scale.fill(Math.min(...scale));
  for (let i = 0; i < position.count; i += 1) {
    position.setXYZ(
      i,
      Math.min(envelope.max[0], Math.max(envelope.min[0], centre[0] + (position.getX(i) - centre[0]) * scale[0])),
      Math.min(envelope.max[1], Math.max(envelope.min[1], centre[1] + (position.getY(i) - centre[1]) * scale[1])),
      Math.min(envelope.max[2], Math.max(envelope.min[2], centre[2] + (position.getZ(i) - centre[2]) * scale[2])),
    );
  }
}

/**
 * Per-face normals bent part of the way towards the radial direction from
 * `centre`. The faceted structure survives — it is what makes the mass read
 * as a low-poly canopy rather than a balloon — but the hard value steps
 * between neighbouring faces soften into a clustered mass.
 */
export function softenNormals(
  geometry: THREE.BufferGeometry,
  centre: readonly [number, number, number],
  amount: number,
): void {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const rx = position.getX(i) - centre[0];
    const ry = position.getY(i) - centre[1];
    const rz = position.getZ(i) - centre[2];
    const length = Math.hypot(rx, ry, rz) || 1;
    const nx = normal.getX(i) * (1 - amount) + (rx / length) * amount;
    const ny = normal.getY(i) * (1 - amount) + (ry / length) * amount;
    const nz = normal.getZ(i) * (1 - amount) + (rz / length) * amount;
    const n = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(i, nx / n, ny / n, nz / n);
  }
}

/**
 * Write the foliage tone vocabulary into the `color` attribute from the
 * normals (and, when given, the per-corner reach), normalised to a mean of
 * exactly 1.0 so the instance tint still states the part's albedo.
 */
export function toneFoliage(geometry: THREE.BufferGeometry, reach?: Float32Array): void {
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const count = normal.count;
  const tones = new Float32Array(count);
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const ny = normal.getY(i);
    let tone = 1 + FOLIAGE_TONES.lift * Math.max(0, ny) - FOLIAGE_TONES.drop * Math.max(0, -ny);
    if (reach !== undefined) tone += FOLIAGE_TONES.reach * reach[i];
    tone = Math.min(FOLIAGE_TONES.max, Math.max(FOLIAGE_TONES.min, tone));
    tones[i] = tone;
    sum += tone;
  }
  const mean = sum / Math.max(1, count);
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const tone = tones[i] / mean;
    colours[i * 3] = tone;
    colours[i * 3 + 1] = tone;
    colours[i * 3 + 2] = tone;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

function nonIndexed(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.index === null ? source : source.toNonIndexed();
  if (geometry !== source) source.dispose();
  geometry.deleteAttribute('uv');
  return geometry;
}

/**
 * The enhanced broadleaf crown: one subdivided icosphere (80 faces) sculpted
 * by `CROWN_LOBES`, floored where it swallows the trunk top, fitted into the
 * baseline crown's box.
 */
export function enhancedCrown(): THREE.BufferGeometry {
  const geometry = nonIndexed(new THREE.IcosahedronGeometry(1, 1));
  const centre: [number, number, number] = [0.12, 5.0, -0.08];
  const radii: [number, number, number] = [2.05, 2.05, 1.9];
  const floor = CROWN_ENVELOPE.min[1] + 0.02;
  const reach = sculptSphere(geometry, centre, radii, CROWN_LOBES, floor, CROWN_ENVELOPE, 11, 'uniform');
  softenNormals(geometry, centre, FOLIAGE_TONES.soften);
  toneFoliage(geometry, reach);
  return geometry;
}

/** The enhanced conifer's tiers: radius, height, base, azimuth turn, lean. */
export const CONIFER_TIERS: readonly {
  readonly radius: number;
  readonly height: number;
  readonly base: number;
  readonly turn: number;
  readonly lean: readonly [number, number];
}[] = Object.freeze([
  { radius: 2.20, height: 3.25, base: -0.25, turn: 0.00, lean: [0.06, -0.04] },
  { radius: 1.72, height: 2.95, base: 1.85, turn: 0.38, lean: [-0.10, 0.07] },
  { radius: 1.28, height: 2.65, base: 3.55, turn: 0.71, lean: [0.08, 0.09] },
  { radius: 0.82, height: 3.00, base: 4.90, turn: 0.16, lean: [-0.05, -0.06] },
]);

/**
 * The enhanced conifer: four six-sided tiers, each turned against the one
 * below, rims jittered inward so no two are the same hexagon, apexes leant a
 * hand's breadth off the axis. Skirts keep their undersides — the dark ring
 * under each tier is half of what makes a spruce read as tiers.
 */
export function enhancedConifer(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const sides = spruce.tierSides;
  const top = CONIFER_ENVELOPE.max[1];
  const maxRadius = CONIFER_ENVELOPE.max[0];

  const push = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
  ): void => {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    for (const p of [a, b, c]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(nx, ny, nz);
    }
  };

  CONIFER_TIERS.forEach((tier, index) => {
    const apexY = Math.min(top, tier.base + tier.height);
    const apex: [number, number, number] = [tier.lean[0], apexY, tier.lean[1]];
    const rim: [number, number, number][] = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = tier.turn + (i / sides) * Math.PI * 2;
      // Inward only, so the widest tier never leaves the footprint.
      const shrink = 1 - 0.11 * (jitter(index * 16 + i, 23) * 0.5 + 0.5);
      const radius = Math.min(maxRadius, tier.radius * shrink);
      rim.push([Math.cos(angle) * radius, tier.base, -Math.sin(angle) * radius]);
    }
    const centre: [number, number, number] = [0, tier.base, 0];
    for (let i = 0; i < sides; i += 1) {
      const a = rim[i];
      const b = rim[(i + 1) % sides];
      // Side: outward. Rim runs counter-clockwise seen from above, so
      // (b - a) × (apex - a) points outward.
      push(a, b, apex);
      // Underside: downward. Reversed so the normal faces the ground.
      push(b, a, centre);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  fitInto(geometry, [0, (CONIFER_ENVELOPE.min[1] + top) / 2, 0], CONIFER_ENVELOPE, 'axis');
  // Tones: rims lighter than apexes, tiers lighter towards the top, skirts dark.
  const count = positions.length / 3;
  const reach = new Float32Array(count);
  let corner = 0;
  CONIFER_TIERS.forEach((_tier, index) => {
    for (let i = 0; i < sides; i += 1) {
      // Side triangle: rim, rim, apex.
      reach[corner] = 0.16 + index * 0.05; reach[corner + 1] = 0.16 + index * 0.05; reach[corner + 2] = -0.08 + index * 0.05;
      corner += 3;
      // Underside: sits back.
      reach[corner] = -0.22; reach[corner + 1] = -0.22; reach[corner + 2] = -0.22;
      corner += 3;
    }
  });
  toneFoliage(geometry, reach);
  return geometry;
}

/**
 * The shrub, shaped: the same twenty faces as the baseline icosahedron, turned
 * so a face rather than a point crowns it, swollen towards one side, hollowed
 * on another, and floored so it sits in the turf rather than on it.
 */
export function shapedShrub(): THREE.BufferGeometry {
  const geometry = nonIndexed(new THREE.IcosahedronGeometry(1, 0));
  // A face up: rotate a vertex-up icosahedron by the dihedral half-angle.
  geometry.rotateX(0.65);
  geometry.rotateY(0.40);
  // Seated: the centre sits a little under the baseline's and the vertical
  // radius a little over it, so the floored base is buried in the turf the
  // way the baseline's was rather than perched on it.
  const centre: [number, number, number] = [0, bush.centre - 0.08, 0];
  const radii: [number, number, number] = [
    bush.radius * bush.scaleX * 0.96,
    bush.radius * bush.scaleY * 1.08,
    bush.radius * bush.scaleZ * 0.96,
  ];
  const floor = SHRUB_ENVELOPE.min[1] + 0.02;
  const reach = sculptSphere(geometry, centre, radii, SHRUB_LOBES, floor, SHRUB_ENVELOPE, 17, 'axis');
  softenNormals(geometry, centre, FOLIAGE_TONES.soften * 0.6);
  toneFoliage(geometry, reach);
  return geometry;
}

/** Per-vertex extents of a geometry, for the envelope tests. */
export function extentsOf(geometry: THREE.BufferGeometry): Envelope {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.count; i += 1) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], p[axis]);
      max[axis] = Math.max(max[axis], p[axis]);
    }
  }
  return { min, max };
}
