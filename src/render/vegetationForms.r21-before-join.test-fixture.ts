/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Shared procedural vegetation. Broadleaf habits and shrubs are rooted woody
 * scaffolds with small closed leaf whorls and real negative space. Conifers
 * retain their accepted geometry. Each family/habit still owns one shared
 * geometry/material bucket; the caller owns physical bounds, colour and light.
 */
import * as THREE from 'three';
import { buildVegetationGrowthPlan, vegetationGrowthPrice, type GrowthDistance,
  type VegetationGrowthPlan } from './vegetationGrowthPlan.r21-before-join.test-fixture.ts';

export type VegetationFamily = 'crown' | 'coniferFoliage' | 'shrub';
export type VegetationDetail = 'ordinary' | 'ultra';
export type VegetationVariant = 0 | 1 | 2;
type Vec3 = readonly [number, number, number];

export interface VegetationContract {
  readonly min: Vec3;
  readonly max: Vec3;
  /** Original PROP_SPREADS/PROP_FOOTPRINTS circle, in unscaled prop coordinates. */
  readonly spreadRadius: number;
  /** Original root-axis Y; the form's attachment must continue to cover it. */
  readonly rootY: number;
  /** Optional original trunk dimensions; render structure only, never a new collider. */
  readonly rootJoin?: { readonly radiusTop: number; readonly radiusBase: number; readonly sides: number };
}

export type VegetationContracts = Readonly<Record<VegetationFamily, VegetationContract>>;

export interface VegetationPaintContext {
  readonly family: VegetationFamily;
  readonly detail: VegetationDetail;
  readonly variant: VegetationVariant;
  /** Swelling/tip versus inner attachment/recess; existing tone-owner input. */
  readonly reach: Float32Array;
  /** Height in the complete caller envelope, before its existing transform. */
  readonly height: Float32Array;
  /** Crown boughs use 0..4; shrub stems use 0..3; conifer leader is group 4. */
  readonly mass: Uint8Array;
  /** Small closed leaves enter a woody parent, rather than a closed green hull. */
  readonly leaf: Uint8Array;
  /** Semantic finish channel only. The existing palette owner paints wood;
   * this is CPU context, not a GPU attribute, material or shader allocation. */
  readonly wood: Uint8Array;
}

export type VegetationPainter = (
  geometry: THREE.BufferGeometry,
  context: VegetationPaintContext,
) => void;

export interface VegetationForm {
  readonly geometry: THREE.BufferGeometry;
  readonly triangles: number;
  /** Position + normal + colour arrays only. Instance buffers belong to PropsView. */
  readonly geometryBytes: number;
  readonly context: VegetationPaintContext;
}

/** Prices are derived from the same finite branching records the mesh emits. */
function growthDistanceCounts(detail: VegetationDetail, family: 'crown' | 'shrub') {
  const plan = buildVegetationGrowthPlan(family, detail, 0);
  return Object.freeze({ near: vegetationGrowthPrice(plan, 'near').triangles,
    middle: vegetationGrowthPrice(plan, 'middle').triangles,
    far: vegetationGrowthPrice(plan, 'far').triangles });
}
export const BROADLEAF_DISTANCE_COUNTS = Object.freeze({
  ordinary: Object.freeze({ crown: growthDistanceCounts('ordinary', 'crown'),
    shrub: growthDistanceCounts('ordinary', 'shrub') }),
  ultra: Object.freeze({ crown: growthDistanceCounts('ultra', 'crown'),
    shrub: growthDistanceCounts('ultra', 'shrub') }),
});
export const VEGETATION_FORM_COUNTS = Object.freeze({
  ordinary: Object.freeze({ crown: BROADLEAF_DISTANCE_COUNTS.ordinary.crown.near,
    coniferFoliage: 7040, shrub: BROADLEAF_DISTANCE_COUNTS.ordinary.shrub.near }),
  ultra: Object.freeze({ crown: BROADLEAF_DISTANCE_COUNTS.ultra.crown.near,
    coniferFoliage: 16368, shrub: BROADLEAF_DISTANCE_COUNTS.ultra.shrub.near }),
});

/** Render-only levels, all derived from the accepted near conifer's vertices.
 * Never a price used by generation or collision. */
export const CONIFER_DISTANCE_COUNTS = Object.freeze({
  ordinary: Object.freeze({ near: 7040, middle: 5824, far: 2944 }),
  ultra: Object.freeze({ near: 16368, middle: 8184, far: 3192 }),
});

/** Complete allocated colour alternatives for GPU-free resident pricing.
 * Every family packs all three levels; a camera's current level cannot discount
 * these owned bytes. Conifer values remain the historical accepted records. */
export const VEGETATION_DISTANCE_COUNTS = Object.freeze({
  ordinary: Object.freeze({ ...BROADLEAF_DISTANCE_COUNTS.ordinary,
    coniferFoliage: CONIFER_DISTANCE_COUNTS.ordinary }),
  ultra: Object.freeze({ ...BROADLEAF_DISTANCE_COUNTS.ultra,
    coniferFoliage: CONIFER_DISTANCE_COUNTS.ultra }),
});

export type VegetationDistanceLevel = 'near' | 'middle' | 'far';
export type VegetationDistanceForms = Readonly<Record<VegetationDistanceLevel, THREE.BufferGeometry>>;
export type ConiferDistanceForms = VegetationDistanceForms;

/** Three structural families, selected once from the planted root's stable hash. */
export const VEGETATION_VARIANT_NAMES = Object.freeze(['mature-spreading', 'asymmetric-leafy', 'young-low'] as const);

/** The caller's box is an upper bound, not an instruction to stretch every plant. */
export const VEGETATION_HEIGHT_SHARES = Object.freeze({
  crown: Object.freeze([1, 1, 0.78] as const),
  coniferFoliage: Object.freeze([1, 1, 1] as const),
  shrub: Object.freeze([1, 0.92, 0.86] as const),
});

interface Shell {
  readonly positions: number[];
  readonly indices: number[];
  readonly reach: number[];
  readonly mass: number[];
  readonly leaf: number[];
  readonly wood: number[];
  /** Each component must close outward by itself; a good mass cannot hide a bad one. */
  readonly components: { readonly first: number; readonly end: number;
    readonly base: number; readonly sectors: number; readonly rows: number;
    readonly bottom: number; readonly top: number; readonly levels: number }[];
}

interface Section { readonly t: number; readonly radius: number }

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const plus = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const times = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => times(a, 1 / (Math.hypot(...a) || 1));

/** Stable integer sculpt hash, independent of camera, clock, seat and quality. */
function hash01(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
    ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function addVertex(shell: Shell, p: Vec3, reach: number, mass: number, leaf = 0, wood = 0): number {
  const index = shell.positions.length / 3;
  shell.positions.push(...p); shell.reach.push(reach); shell.mass.push(mass); shell.leaf.push(leaf); shell.wood.push(wood);
  return index;
}

/** One closed shell, with disjoint vertex identities from all other shells. */
function appendShell(
  shell: Shell, sectors: number, sections: readonly Section[], root: Vec3, tip: Vec3,
  sample: (section: Section, theta: number, sector: number, row: number) => { p: Vec3; reach: number },
  mass: number, leaf = 0, wood = 0, levels = 7,
): void {
  const first = shell.indices.length;
  const base = shell.positions.length / 3;
  for (let row = 0; row < sections.length; row++) {
    for (let sector = 0; sector < sectors; sector++) {
      const { p, reach } = sample(sections[row], sector / sectors * TAU, sector, row);
      addVertex(shell, p, reach, mass, leaf, wood);
    }
  }
  const bottom = addVertex(shell, root, leaf ? -0.12 : -0.28, mass, leaf, wood);
  const top = addVertex(shell, tip, leaf ? 0.32 : 0.12, mass, leaf, wood);
  for (let sector = 0; sector < sectors; sector++) {
    const next = (sector + 1) % sectors;
    shell.indices.push(bottom, base + sector, base + next);
    for (let row = 0; row < sections.length - 1; row++) {
      const a = base + row * sectors + sector, b = base + row * sectors + next;
      const c = a + sectors, d = b + sectors;
      shell.indices.push(a, c, b, b, c, d);
    }
    const last = base + (sections.length - 1) * sectors;
    shell.indices.push(top, last + next, last + sector);
  }
  shell.components.push({ first, end: shell.indices.length, base, sectors,
    rows: sections.length, bottom, top, levels });
}

/** Closed woody tubes and lenticular leaves, one buffer and no hidden hull.
 * Two ovate leaf rings retain a folded upper/underside and an opaque edge,
 * with varied orientation, without alpha sorting, cards or a hidden hull. */
function appendGrowth(shell: Shell, plan: VegetationGrowthPlan): void {
  const frame = (axis: Vec3): { side: Vec3; depth: Vec3 } => {
    const side: Vec3 = Math.hypot(axis[0], axis[2]) < 1e-9 ? [1, 0, 0]
      : unit([-axis[2], 0, axis[0]]);
    return { side, depth: unit(cross(side, axis)) };
  };
  for (const branch of plan.branches) {
    const axis = unit(plus(branch.to, times(branch.from, -1)));
    const { side, depth } = frame(axis);
    appendShell(shell, branch.sectors ?? plan.branchSectors, branch.sections ?? [{ t: 0, radius: branch.radiusFrom },
      { t: 1, radius: branch.radiusTo }], branch.from, branch.to, (section, theta) => ({
      p: plus(plus(times(branch.from, 1 - section.t), times(branch.to, section.t)), plus(
        times(side, Math.cos(theta) * section.radius), times(depth, Math.sin(theta) * section.radius))),
      reach: -0.20 + section.t * 0.12,
    }), branch.mass, 0, 1);
  }
  for (const leaf of plan.leaves) {
    const axis = unit(plus(leaf.tip, times(leaf.root, -1)));
    const basis = frame(axis), cosine = Math.cos(leaf.roll), sine = Math.sin(leaf.roll);
    const side = plus(times(basis.side, cosine), times(basis.depth, sine));
    const depth = plus(times(basis.side, -sine), times(basis.depth, cosine));
    appendShell(shell, plan.leafSectors, plan.leafSections, leaf.root, leaf.tip,
      (section, theta) => ({
        p: plus(plus(plus(times(leaf.root, 1 - section.t), times(leaf.tip, section.t)),
          times(depth, Math.sin(section.t * Math.PI) * leaf.bend)), plus(
          times(side, Math.cos(theta) * leaf.width * section.radius),
          times(depth, Math.sin(theta) * leaf.thickness * section.radius))),
        reach: .06 + .06 * Math.cos(theta),
      }), leaf.mass, 1, 0, leaf.levels);
  }
  // Keep the intended complete height without moving the root or fitting each
  // shoot separately. This is a single positive affine Y scale of the sculpt;
  // attachment, leaf overlap and every gap survive it.
  let maximumY = 0;
  for (let i = 1; i < shell.positions.length; i += 3) {
    if (shell.positions[i] < 0) throw new Error('Rooted growth fell below its basal envelope');
    maximumY = Math.max(maximumY, shell.positions[i]);
  }
  if (!(maximumY > 0)) throw new Error('Empty rooted growth height');
  for (let i = 1; i < shell.positions.length; i += 3) shell.positions[i] /= maximumY;
  orientSplitShrub(shell, plan);
}

/** Orient complete upper shrub subtrees, leaving the basal planting layer fixed.
 * The two tallest shoots occupy the positive-X side in the split habit. Each
 * primary stem, its twigs and their leaves receive one rigid azimuth turn;
 * their on-axis attachments still meet the unchanged basal leader. Rotation
 * preserves radius and Y, so the shared contract's original fit stays at one
 * instead of shrinking the planting layer to admit an outward whole-plant lean.
 */
function orientSplitShrub(shell: Shell, plan: VegetationGrowthPlan): void {
  if (plan.family !== 'shrub' || plan.variant !== 1) return;
  const stemTurns = [0, -1.10, 0, 0, 0, 1.82, 0, 0, 0] as const;
  const branchTurns: number[] = [];
  let stem = 0;
  for (const branch of plan.branches) {
    if (branch.parent === -1) branchTurns.push(0);
    else if (branch.parent === 0) {
      if (branch.from[0] !== 0 || branch.from[2] !== 0 || stem >= stemTurns.length)
        throw new Error('Split shrub primary lost its rooted azimuth attachment');
      branchTurns.push(stemTurns[stem++]);
    } else branchTurns.push(branchTurns[branch.parent]);
  }
  if (stem !== stemTurns.length || shell.components.length !== plan.branches.length + plan.leaves.length)
    throw new Error('Split shrub component ownership drift');
  for (let i = 0; i < shell.components.length; i++) {
    const turn = i < plan.branches.length ? branchTurns[i]
      : branchTurns[plan.leaves[i - plan.branches.length].parent];
    if (!Number.isFinite(turn)) throw new Error('Split shrub descendant lost its primary owner');
    if (turn === 0) continue;
    const component = shell.components[i], cosine = Math.cos(turn), sine = Math.sin(turn);
    const rotate = (vertex: number): void => {
      const offset = vertex * 3, x = shell.positions[offset], z = shell.positions[offset + 2];
      shell.positions[offset] = x * cosine - z * sine;
      shell.positions[offset + 2] = x * sine + z * cosine;
    };
    for (let vertex = component.base; vertex < component.base + component.rows * component.sectors; vertex++)
      rotate(vertex);
    rotate(component.bottom); rotate(component.top);
  }
}

/** Eight spruce whorls. Narrow boughs carry dense combs of small needle sprays. */
function appendConifer(shell: Shell, detail: VegetationDetail, variant: VegetationVariant): void {
  const richer = detail === 'ultra';
  const lean = variant === 1 ? 0.12 : variant === 2 ? -0.045 : 0.035;
  const spine = (t: number): Vec3 => [lean * t * t, t, -lean * t * 0.31];
  const core: readonly Section[] = richer
    ? [{ t: 0.005, radius: 0.30 }, { t: 0.06, radius: 0.50 }, { t: 0.17, radius: 0.48 },
      { t: 0.29, radius: 0.44 }, { t: 0.42, radius: 0.37 }, { t: 0.55, radius: 0.29 },
      { t: 0.67, radius: 0.21 }, { t: 0.79, radius: 0.13 }, { t: 0.90, radius: 0.055 },
      { t: 0.973, radius: 0.011 }]
    : [{ t: 0.005, radius: 0.30 }, { t: 0.07, radius: 0.50 }, { t: 0.23, radius: 0.46 },
      { t: 0.39, radius: 0.39 }, { t: 0.55, radius: 0.29 }, { t: 0.71, radius: 0.18 },
      { t: 0.87, radius: 0.08 }, { t: 0.973, radius: 0.011 }];
  appendShell(shell, richer ? 12 : 8, core, [0, 0, 0], spine(1), (section, theta, sector, row) => {
    // Recessed evergreen growth joins the overlapping whorls. An empty
    // interior left a fern skeleton even with hundreds of needle sprays.
    // This broken star stays inside the lateral boughs, never a smooth cylinder.
    const ridge = sector % 2 === 0 ? 1 : 0.66;
    const turn = theta + row * 0.15, radius = section.radius * ridge;
    return { p: plus(spine(section.t), [Math.cos(turn) * radius, 0, Math.sin(turn) * radius]), reach: -0.24 };
  }, 4);
  const levels = [0.15, 0.26, 0.37, 0.48, 0.59, 0.70, 0.80, 0.89];
  const reaches = [1, 0.91, 0.80, 0.68, 0.56, 0.43, 0.30, 0.17];
  const branchCounts = [8, 8, 7, 7, 6, 5, 4, 3]; // 48 complete boughs in either tier.
  const fanRows: readonly Section[] = richer
    ? [{ t: 0.08, radius: 0.40 }, { t: 0.25, radius: 0.82 }, { t: 0.46, radius: 1 },
      { t: 0.68, radius: 0.78 }, { t: 0.88, radius: 0.39 }]
    : [{ t: 0.10, radius: 0.45 }, { t: 0.32, radius: 0.96 },
      { t: 0.58, radius: 0.88 }, { t: 0.84, radius: 0.45 }];
  const twigRows: readonly Section[] = richer
    ? [{ t: 0.31, radius: 1 }, { t: 0.71, radius: 0.58 }]
    : [{ t: 0.43, radius: 1 }];
  for (let whorl = 0; whorl < levels.length; whorl++) {
    const id = whorl % 4;
    for (let branch = 0; branch < branchCounts[whorl]; branch++) {
      const theta = branch / branchCounts[whorl] * TAU + whorl * 0.73 + variant * 0.31
        + (hash01(whorl, branch, 631) - 0.5) * 0.24;
      const direction: Vec3 = [Math.cos(theta), 0, Math.sin(theta)];
      const side: Vec3 = [-direction[2], 0, direction[0]];
      const radius = reaches[whorl] * (variant === 2 ? 0.78 : 1)
        * (0.91 + hash01(whorl, branch, 641) * 0.09);
      const y = levels[whorl] + (hash01(whorl, branch, 647) - 0.5) * 0.022;
      const root = plus(spine(y), [direction[0] * 0.023, 0.022, direction[2] * 0.023]);
      const droop = radius * (variant === 1 ? 0.092 : 0.084);
      const tip = plus(root, [direction[0] * radius, -droop, direction[2] * radius]);
      const centre = (t: number): Vec3 => plus(plus(times(root, 1 - t), times(tip, t)),
        [0, Math.sin(t * Math.PI) * radius * 0.011, 0]);
      const axis = unit([tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]]);
      // A broad central blade reads as a deciduous leaf. Keep the bough narrow
      // and obtain foliage volume from its repeated, overlapping needle sprays.
      const depth = cross(side, axis), breadth = radius * 0.095, thickness = 0.006 + radius * 0.010;
      appendShell(shell, richer ? 8 : 6, fanRows, root, tip, (section, angle, _sector, row) => {
        const edge = 0.88 + 0.12 * Math.cos(row * Math.PI + angle + branch * 0.51);
        return { p: plus(centre(section.t), plus(
          times(side, Math.cos(angle) * section.radius * breadth * edge),
          times(depth, Math.sin(angle) * section.radius * thickness))),
          reach: -0.16 + section.t * 0.36 + 0.035 * Math.cos(angle) };
      }, id);
      // Paired side sprays enter the fan axis. Alternating lengths leave real
      // fingers of daylight; their narrow closed blades end in drooping tips.
      const twigPairs = richer ? [0.12, 0.23, 0.34, 0.45, 0.56, 0.67, 0.78, 0.89]
        : [0.15, 0.29, 0.43, 0.57, 0.71, 0.85];
      for (let pair = 0; pair < twigPairs.length; pair++) for (const sign of [-1, 1]) {
        const at = twigPairs[pair] + sign * 0.025, twigRoot = centre(at);
        const length = radius * (0.38 - at * 0.27) * (0.87 + hash01(whorl * 11 + branch, pair * 2 + sign, 661) * 0.13);
        const twigDirection = unit(plus(times(direction, 0.43), times(side, sign * 0.90)));
        const twigTip = plus(twigRoot, [twigDirection[0] * length, -length * 0.24, twigDirection[2] * length]);
        const twigAxis = unit([twigTip[0] - twigRoot[0], twigTip[1] - twigRoot[1], twigTip[2] - twigRoot[2]]);
        const twigSide: Vec3 = [-twigDirection[2], 0, twigDirection[0]], twigDepth = cross(twigSide, twigAxis);
        appendShell(shell, 4, twigRows, twigRoot, twigTip, (section, angle) => ({
          p: plus(plus(times(twigRoot, 1 - section.t), times(twigTip, section.t)), plus(
            times(twigSide, Math.cos(angle) * section.radius * length * 0.24),
            times(twigDepth, Math.sin(angle) * section.radius * (0.003 + length * 0.035)))),
          reach: 0.03 + section.t * 0.28,
        }), id, 1);
      }
    }
  }
}

function fitContract(shell: Shell, contract: VegetationContract): void {
  const halfX = Math.min(-contract.min[0], contract.max[0]);
  const halfZ = Math.min(-contract.min[2], contract.max[2]);
  let fit = 1;
  for (let i = 0; i < shell.positions.length; i += 3) {
    shell.positions[i] *= halfX; shell.positions[i + 2] *= halfZ;
    const x = shell.positions[i], z = shell.positions[i + 2];
    if (x !== 0) fit = Math.min(fit, (x > 0 ? contract.max[0] : -contract.min[0]) / Math.abs(x));
    if (z !== 0) fit = Math.min(fit, (z > 0 ? contract.max[2] : -contract.min[2]) / Math.abs(z));
    const radius = Math.hypot(x, z);
    if (radius > 0) fit = Math.min(fit, contract.spreadRadius / radius);
    const height = shell.positions[i + 1];
    if (height < 0 || height > 1) throw new Error('Vegetation sculpt left its vertical envelope');
    shell.positions[i + 1] = lerp(contract.min[1], contract.max[1], height);
  }
  // One XZ shrink about the original root axis; no root translation, clipping,
  // changed burial or independent component fit that could close the breaks.
  for (let i = 0; i < shell.positions.length; i += 3) {
    shell.positions[i] *= fit; shell.positions[i + 2] *= fit;
  }
}

/** Continue the original trunk through its cap instead of mounting a narrower
 * branch pole on that flat face. The first two leader rings use the original
 * six-sided trunk orientation and source radii; its upper rings and every
 * bough attachment retain the fitted scaffold. This stays inside the original
 * crown envelope and leaves the original trunk geometry/collider untouched.
 */
function continueCrownRoot(shell: Shell, contract: VegetationContract): void {
  const join = contract.rootJoin;
  if (!join) return;
  const leader = shell.components[0];
  if (!leader || leader.sectors !== join.sides || leader.rows !== 4
    || contract.rootY <= contract.min[1]) throw new Error('Crown root continuation contract drift');
  const p = shell.positions;
  const lowerRadius = lerp(join.radiusBase, join.radiusTop, contract.min[1] / contract.rootY);
  if (lowerRadius <= 0 || lowerRadius > contract.spreadRadius
    || lowerRadius > Math.min(-contract.min[0], contract.max[0], -contract.min[2], contract.max[2]))
    throw new Error('Crown trunk continuation left its original envelope');
  for (let row = 0; row < leader.rows; row++) {
    const first = leader.base + row * leader.sectors;
    let centreX = 0, centreZ = 0;
    for (let sector = 0; sector < leader.sectors; sector++) {
      centreX += p[(first + sector) * 3]; centreZ += p[(first + sector) * 3 + 2];
    }
    centreX /= leader.sectors; centreZ /= leader.sectors;
    const radiusX = p[first * 3] - centreX;
    const radiusZ = (p[(first + 1) * 3 + 2] - centreZ) / Math.sin(TAU / leader.sectors);
    const y = row === 1 ? Math.max(p[first * 3 + 1], contract.rootY + .020) : p[first * 3 + 1];
    if (row === 1 && y >= p[(leader.base + 2 * leader.sectors) * 3 + 1])
      throw new Error('Crown root continuation crossed its first bough band');
    for (let sector = 0; sector < leader.sectors; sector++) {
      const theta = sector / leader.sectors * TAU, offset = (first + sector) * 3;
      const radius = row === 0 ? lowerRadius : join.radiusTop;
      p[offset] = row < 2 ? -Math.sin(theta) * radius : centreX - Math.sin(theta) * radiusX;
      p[offset + 1] = y;
      p[offset + 2] = row < 2 ? Math.cos(theta) * radius : centreZ + Math.cos(theta) * radiusZ;
    }
  }
}

function makeShell(family: VegetationFamily, detail: VegetationDetail, variant: VegetationVariant,
  contract: VegetationContract): Shell {
  const shell: Shell = { positions: [], indices: [], reach: [], mass: [], leaf: [], wood: [], components: [] };
  if (family === 'coniferFoliage') appendConifer(shell, detail, variant);
  else {
    appendGrowth(shell, buildVegetationGrowthPlan(family, detail, variant));
    // Height changes about the unchanged buried root, never about the canopy's
    // centre. Every template fits the complete original physical envelope.
    const height = VEGETATION_HEIGHT_SHARES[family][variant];
    for (let i = 1; i < shell.positions.length; i += 3) shell.positions[i] *= height;
    // Crown-only positive affine lean of its complete connected scaffold about
    // the basal root. Keep the root's successful crown repair; shrubs preserve
    // their planting layer through the rigid upper-subtree orientation above.
    if (family === 'crown' && variant === 1) for (let i = 0; i < shell.positions.length; i += 3)
      shell.positions[i] += shell.positions[i + 1] * 0.55;
  }
  fitContract(shell, contract);
  if (family === 'crown') continueCrownRoot(shell, contract);
  return shell;
}

/** Per-shell directed edges and signed volume, before the owner's non-indexed format. */
function assertClosedOutward(shell: Shell): void {
  const p = shell.positions;
  for (const component of shell.components) {
    const edges = new Map<string, number>();
    let volumeSix = 0;
    for (let i = component.first; i < component.end; i += 3) {
      const a = shell.indices[i], b = shell.indices[i + 1], c = shell.indices[i + 2];
      for (const [from, to] of [[a, b], [b, c], [c, a]]) {
        const key = `${from}:${to}`; edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
      const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
      const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2];
      volumeSix += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    }
    for (const [edge, count] of edges) {
      const [a, b] = edge.split(':');
      if (count !== 1 || edges.get(`${b}:${a}`) !== 1) throw new Error(`Open or doubled vegetation edge ${edge}`);
    }
    if (!(volumeSix > 1e-10)) throw new Error('Vegetation component has non-positive enclosed volume');
  }
}

function assertContract(contract: VegetationContract): void {
  if (contract.rootJoin && (![contract.rootJoin.radiusTop, contract.rootJoin.radiusBase,
    contract.rootJoin.sides].every(Number.isFinite) || contract.rootJoin.radiusTop <= 0
    || contract.rootJoin.radiusBase < contract.rootJoin.radiusTop || !Number.isInteger(contract.rootJoin.sides)
    || contract.rootJoin.sides < 4 || contract.rootY <= 0))
    throw new Error('Invalid original trunk continuation dimensions');
  if (![...contract.min, ...contract.max, contract.spreadRadius, contract.rootY].every(Number.isFinite)
    || contract.min[0] >= 0 || contract.min[2] >= 0 || contract.max[0] <= 0 || contract.max[2] <= 0
    || contract.max[1] <= contract.min[1] || contract.spreadRadius <= 0
    || contract.rootY < contract.min[1] || contract.rootY > contract.max[1]) {
    throw new Error('Vegetation needs the original positive envelope about the root axis');
  }
}

/**
 * Fresh geometry, no cache or retained GPU owner. No material/texture/scene,
 * timer, listener or shader allocation. Failed painting releases both buffers.
 */
export function buildVegetationForm(family: VegetationFamily, detail: VegetationDetail,
  variant: VegetationVariant, contract: VegetationContract, paint?: VegetationPainter): VegetationForm {
  assertContract(contract);
  const shell = makeShell(family, detail, variant, contract);
  assertClosedOutward(shell);
  const triangles = shell.indices.length / 3;
  if (triangles !== VEGETATION_FORM_COUNTS[detail][family]) throw new Error('Vegetation topology price drift');
  const indexed = new THREE.BufferGeometry();
  let geometry: THREE.BufferGeometry | null = null;
  try {
    indexed.setAttribute('position', new THREE.Float32BufferAttribute(shell.positions, 3));
    indexed.setIndex(shell.indices);
    indexed.computeVertexNormals();
    geometry = indexed.toNonIndexed();
    const smooth = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const smoothCopy = new Float32Array(smooth.array);
    geometry.computeVertexNormals();
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < normal.count; i++) {
      const leaf = shell.leaf[shell.indices[i]] === 1;
      // Closed leaf folds and thin bough undersides retain definition. The
      // conifer path and its normal blend remain byte-identical.
      const facet = leaf ? 0.62 : family === 'coniferFoliage' ? 0.31 : 0.22;
      const x = normal.getX(i) * facet + smoothCopy[i * 3] * (1 - facet);
      const y = normal.getY(i) * facet + smoothCopy[i * 3 + 1] * (1 - facet);
      const z = normal.getZ(i) * facet + smoothCopy[i * 3 + 2] * (1 - facet);
      const n = Math.hypot(x, y, z) || 1;
      normal.setXYZ(i, x / n, y / n, z / n);
    }
    const reach = new Float32Array(shell.indices.map(i => shell.reach[i]));
    const span = contract.max[1] - contract.min[1];
    const height = new Float32Array(shell.indices.map(i => (shell.positions[i * 3 + 1] - contract.min[1]) / span));
    const mass = new Uint8Array(shell.indices.map(i => shell.mass[i]));
    const leaf = new Uint8Array(shell.indices.map(i => shell.leaf[i]));
    const wood = new Uint8Array(shell.indices.map(i => shell.wood[i]));
    const context: VegetationPaintContext = { family, detail, variant, reach, height, mass, leaf, wood };
    const colour = new Float32Array(normal.count * 3); colour.fill(1);
    geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    paint?.(geometry, context);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.name = `vegetation-form-${family}-${detail}-${variant}`;
    const geometryBytes = ['position', 'normal', 'color'].reduce((sum, attribute) => (
      sum + geometry!.getAttribute(attribute).array.byteLength
    ), 0);
    return { geometry, triangles, geometryBytes, context };
  } catch (error) {
    geometry?.dispose(); throw error;
  } finally { indexed.dispose(); }
}

/** Existing one-geometry family buckets remain the sole GPU/disposal owners. */
export function createVegetationBuilders(contracts: VegetationContracts, detail: VegetationDetail,
  variant: VegetationVariant = 0, paint?: VegetationPainter): Readonly<Record<VegetationFamily, () => THREE.BufferGeometry>> {
  const build = (family: VegetationFamily): THREE.BufferGeometry => (
    buildVegetationForm(family, detail, variant, contracts[family], paint).geometry
  );
  return Object.freeze({ crown: () => build('crown'), coniferFoliage: () => build('coniferFoliage'), shrub: () => build('shrub') });
}

/** Reconnect retained rings of each closed component. The same root, leader,
 * all 48 boughs and their outer tips survive. Middle keeps every spray; far
 * keeps the first, middle and last pair of each bough. No new point, independent
 * fit, regenerated tint, collapsed triangle or alpha card is introduced. */
function coniferDistanceIndices(shell: Shell, detail: VegetationDetail,
  level: 'middle' | 'far'): number[] {
  const indices: number[] = [];
  const twigPairs = detail === 'ultra' ? 8 : 6;
  const branchSpan = 1 + twigPairs * 2;
  const retainedFarPairs = detail === 'ultra' ? [0, 3, 7] : [0, 2, 5];
  for (let id = 0; id < shell.components.length; id++) {
    const component = shell.components[id];
    const inBranch = (id - 1) % branchSpan;
    const twig = id > 0 && inBranch > 0;
    if (level === 'far' && twig && !retainedFarPairs.includes(Math.floor((inBranch - 1) / 2))) continue;
    const sectors: number[] = [];
    // The four-sided sprays retain their raised midrib and side breadth.
    // Core/bough even-sector rings take every other original vertex.
    for (let sector = 0; sector < component.sectors; sector += twig ? 1 : 2) sectors.push(sector);
    const rows: number[] = [];
    if (twig) rows.push(0); // first ring is each spray's maximum breadth
    else if (id > 0 && level === 'far') {
      rows.push(detail === 'ultra' ? 2 : 1, component.rows - 1);
    } else for (let row = 0; row < component.rows; row++) rows.push(row);
    for (let sector = 0; sector < sectors.length; sector++) {
      const here = sectors[sector], next = sectors[(sector + 1) % sectors.length];
      const first = component.base + rows[0] * component.sectors;
      indices.push(component.bottom, first + here, first + next);
      for (let row = 0; row < rows.length - 1; row++) {
        const a = component.base + rows[row] * component.sectors + here;
        const b = component.base + rows[row] * component.sectors + next;
        const c = component.base + rows[row + 1] * component.sectors + here;
        const d = component.base + rows[row + 1] * component.sectors + next;
        indices.push(a, c, b, b, c, d);
      }
      const last = component.base + rows[rows.length - 1] * component.sectors;
      indices.push(component.top, last + next, last + here);
    }
  }
  return indices;
}

/** All levels copy positions, normals and colours from the *painted* accepted
 * near form. Its first range is byte-identical. Lower detail does not rerun
 * tone normalization or refit a smaller sample into the physical envelope.
 * Fresh CPU templates only; the packed owner releases these before return. */
export function buildConiferDistanceForms(detail: VegetationDetail, variant: VegetationVariant,
  contract: VegetationContract, paint?: VegetationPainter): ConiferDistanceForms {
  const near = buildVegetationForm('coniferFoliage', detail, variant, contract, paint).geometry;
  let middle: THREE.BufferGeometry | null = null, far: THREE.BufferGeometry | null = null;
  try {
    // Deterministic identity map to the original non-indexed near corners.
    // A duplicate corner may carry its face's softened normal; choose one
    // original corner consistently, never synthesize a new lighting value.
    const shell = makeShell('coniferFoliage', detail, variant, contract);
    const originalCorner = new Int32Array(shell.positions.length / 3); originalCorner.fill(-1);
    for (let corner = 0; corner < shell.indices.length; corner++) {
      const vertex = shell.indices[corner];
      if (originalCorner[vertex] < 0) originalCorner[vertex] = corner;
    }
    const build = (level: 'middle' | 'far'): THREE.BufferGeometry => {
      const indices = coniferDistanceIndices(shell, detail, level);
      if (indices.length / 3 !== CONIFER_DISTANCE_COUNTS[detail][level]) throw new Error('Conifer distance price drift');
      const geometry = new THREE.BufferGeometry();
      try {
        for (const name of ['position', 'normal', 'color']) {
          const source = near.getAttribute(name) as THREE.BufferAttribute;
          const values = new Float32Array(indices.length * 3);
          for (let corner = 0; corner < indices.length; corner++) {
            const sourceCorner = originalCorner[indices[corner]];
            if (sourceCorner < 0) throw new Error('Missing original conifer corner');
            values[corner * 3] = source.getX(sourceCorner);
            values[corner * 3 + 1] = source.getY(sourceCorner);
            values[corner * 3 + 2] = source.getZ(sourceCorner);
          }
          geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
        }
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        geometry.name = `vegetation-distance-conifer-${detail}-${variant}-${level}`;
        return geometry;
      } catch (error) { geometry.dispose(); throw error; }
    };
    middle = build('middle'); far = build('far');
    return Object.freeze({ near, middle, far });
  } catch (error) { near.dispose(); middle?.dispose(); far?.dispose(); throw error; }
}


/** Three colour alternatives from the same painted near plant. Every woody
 * branch and every basal shrub leaf survives; each terminal shoot retains
 * leaf whorls. Removed petals cost no submitted triangles. Normals/colours are
 * copied rather than repainted or renormalised at a smaller sample size. */
export function buildBroadleafDistanceForms(family: 'crown' | 'shrub', detail: VegetationDetail,
  variant: VegetationVariant, contract: VegetationContract, paint?: VegetationPainter): VegetationDistanceForms {
  const near = buildVegetationForm(family, detail, variant, contract, paint).geometry;
  let middle: THREE.BufferGeometry | null = null, far: THREE.BufferGeometry | null = null;
  try {
    const shell = makeShell(family, detail, variant, contract);
    const build = (level: Exclude<GrowthDistance, 'near'>): THREE.BufferGeometry => {
      const bit = level === 'middle' ? 2 : 4;
      const retained: number[] = [];
      for (const component of shell.components) if ((component.levels & bit) !== 0) {
        for (let corner = component.first; corner < component.end; corner++) retained.push(corner);
      }
      if (retained.length / 3 !== BROADLEAF_DISTANCE_COUNTS[detail][family][level]) throw new Error('Growth distance price drift');
      const geometry = new THREE.BufferGeometry();
      try {
        for (const name of ['position', 'normal', 'color']) {
          const source = near.getAttribute(name) as THREE.BufferAttribute;
          const values = new Float32Array(retained.length * 3);
          for (let corner = 0; corner < retained.length; corner++) {
            const original = retained[corner];
            values[corner * 3] = source.getX(original);
            values[corner * 3 + 1] = source.getY(original);
            values[corner * 3 + 2] = source.getZ(original);
          }
          geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
        }
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        geometry.name = `vegetation-distance-${family}-${detail}-${variant}-${level}`;
        return geometry;
      } catch (error) { geometry.dispose(); throw error; }
    };
    middle = build('middle'); far = build('far');
    return Object.freeze({ near, middle, far });
  } catch (error) { near.dispose(); middle?.dispose(); far?.dispose(); throw error; }
}

