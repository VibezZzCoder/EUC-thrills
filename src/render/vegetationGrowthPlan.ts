/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Render-only branching records. No Three, GPU, plan, palette or clock owner.
 * Coordinates use caller X/Z half-extents and Y span; the mesh owner fits the
 * complete plant once about its unchanged root axis. Price and geometry read
 * these same finite records rather than two separately maintained catalogues. */
export type GrowthFamily = 'crown' | 'shrub';
export type GrowthDetail = 'ordinary' | 'ultra';
export type GrowthVariant = 0 | 1 | 2;
export type GrowthPoint = readonly [number, number, number];
export type GrowthDistance = 'near' | 'middle' | 'far';

export interface GrowthSection {
  readonly t: number;
  readonly radius: number;
}

export interface GrowthBranch {
  readonly from: GrowthPoint;
  readonly to: GrowthPoint;
  readonly radiusFrom: number;
  readonly radiusTo: number;
  /** Index of the rooted parent branch; only the basal leader has -1. */
  readonly parent: number;
  readonly mass: number;
  /** A tapered leader can own more than the ordinary two tube rings. */
  readonly sections?: readonly GrowthSection[];
  /** The crown leader matches the actual source trunk: ordinary six, Ultra eight. */
  readonly sectors?: number;
}

export interface GrowthLeaf {
  /** Enters its own woody parent; never a detached surface card. */
  readonly root: GrowthPoint;
  readonly tip: GrowthPoint;
  readonly width: number;
  readonly thickness: number;
  readonly parent: number;
  readonly mass: number;
  /** near=1, middle=2, far=4. Basal growth remains present at every distance. */
  readonly levels: number;
  /** Deterministic fold/orientation, never a new material or animation channel. */
  readonly roll: number;
  readonly bend: number;
}

export interface VegetationGrowthPlan {
  readonly family: GrowthFamily;
  readonly detail: GrowthDetail;
  readonly variant: GrowthVariant;
  readonly branchSectors: number;
  readonly leafSectors: number;
  readonly leafSections: readonly GrowthSection[];
  readonly branches: readonly GrowthBranch[];
  readonly leaves: readonly GrowthLeaf[];
}

const TAU = Math.PI * 2;
const plus = (a: GrowthPoint, b: GrowthPoint): GrowthPoint => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const times = (a: GrowthPoint, n: number): GrowthPoint => [a[0] * n, a[1] * n, a[2] * n];
const mix = (a: GrowthPoint, b: GrowthPoint, t: number): GrowthPoint => plus(times(a, 1 - t), times(b, t));
const cross = (a: GrowthPoint, b: GrowthPoint): GrowthPoint => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const unit = (a: GrowthPoint): GrowthPoint => times(a, 1 / (Math.hypot(...a) || 1));

/** Stable integer sculpt variation; no camera, seat, quality or elapsed time. */
function sculptHash(a: number, b: number, salt: number): number {
  let value = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Unequal shoulders and upper clusters retain openings between useful leafy
 * masses. These are bough destinations, not a closed green crown envelope. */
const CROWN_DESTINATIONS: readonly (readonly GrowthPoint[])[] = [
  [[-.68, .47, -.28], [.69, .50, .25], [-.36, .70, -.57], [.30, .68, .60],
    [-.45, .79, .23], [.18, .87, -.16], [.04, .77, .35]],
  [[-.66, .44, .18], [.55, .50, -.28], [-.46, .69, .42], [.59, .76, -.24],
    [-.50, .82, -.33], [.43, .95, .20], [-.28, .65, -.49]],
  [[-.47, .40, .15], [.46, .43, -.18], [-.20, .62, -.40], [.19, .60, .40],
    [-.29, .76, -.12], [.17, .84, .13], [.02, .67, .04]],
];

/** Two broad rings turn a pointed one-equator kite into an ovate folded leaf.
 * Lower detail retains whole leaves, so all levels keep the same soft outline. */
export const GROWTH_LEAF_SECTIONS: readonly GrowthSection[] = Object.freeze([
  Object.freeze({ t: .28, radius: .80 }), Object.freeze({ t: .70, radius: .88 }),
]);
const CROWN_LEADER_SECTIONS: readonly GrowthSection[] = Object.freeze([
  Object.freeze({ t: 0, radius: .090 }), Object.freeze({ t: .11, radius: .079 }),
  Object.freeze({ t: .26, radius: .068 }), Object.freeze({ t: 1, radius: .034 }),
]);

function radiusAt(branch: GrowthBranch, t: number): number {
  return branch.radiusFrom + (branch.radiusTo - branch.radiusFrom) * t;
}

/** Leaf-bearing shoots overlap into uneven useful volumes. Node position,
 * whorl angle, roll and fold vary deterministically, without detached cards.
 * Each lower level retains petals on every node rather than pruning whole
 * branches into the naked pole silhouette rejected by the independent critic. */
function appendLeaves(plan: VegetationGrowthPlan, output: GrowthLeaf[], parent: number,
  nodes: number, petals: number, length: number, width: number, middlePetals: number, farPetals: number): void {
  const branch = plan.branches[parent];
  const axis = unit(plus(branch.to, times(branch.from, -1)));
  const horizontal = unit([-axis[2], 0, axis[0]]);
  const side: GrowthPoint = Math.hypot(axis[0], axis[2]) < 1e-9 ? [1, 0, 0] : horizontal;
  const depth = unit(cross(axis, side));
  for (let node = 0; node < nodes; node++) {
    const t = .22 + node / Math.max(1, nodes - 1) * .66
      + (sculptHash(parent, node, 823) - .5) * .035;
    const root = mix(branch.from, branch.to, t);
    for (let petal = 0; petal < petals; petal++) {
      const angle = petal / petals * TAU + node * 1.43 + parent * .71 + plan.variant * .33
        + (sculptHash(parent, node * petals + petal, 827) - .5) * .24;
      const radial = plus(times(side, Math.cos(angle)), times(depth, Math.sin(angle)));
      const outward = unit(plus(times(axis, .30), radial));
      const reach = length * (.85 + sculptHash(parent, node * petals + petal, 829) * .15);
      const tip = plus(root, plus(times(outward, reach), [0, reach * .08, 0]));
      const rank = (petal + node + parent) % petals;
      const levels = 1 | (rank < middlePetals ? 2 : 0) | (rank < farPetals ? 4 : 0);
      output.push({ root, tip, width: width * (.86 + sculptHash(parent, node * petals + petal, 839) * .14),
        thickness: width * .14, parent, mass: branch.mass, levels,
        roll: (sculptHash(parent, node * petals + petal, 841) - .5) * 1.60,
        bend: width * (sculptHash(parent, node * petals + petal, 843) - .5) * .12 });
    }
  }
}

export function buildVegetationGrowthPlan(family: GrowthFamily, detail: GrowthDetail,
  variant: GrowthVariant): VegetationGrowthPlan {
  const branches: GrowthBranch[] = [], leaves: GrowthLeaf[] = [];
  const plan: VegetationGrowthPlan = { family, detail, variant,
    branchSectors: detail === 'ultra' ? 8 : 6, leafSectors: detail === 'ultra' ? 8 : 6,
    leafSections: GROWTH_LEAF_SECTIONS, branches, leaves };
  const addBranch = (from: GrowthPoint, to: GrowthPoint, radiusFrom: number,
    radiusTo: number, parent: number, mass: number): number => {
    branches.push({ from, to, radiusFrom, radiusTo, parent, mass }); return branches.length - 1;
  };
  if (family === 'crown') {
    // Encloses the unchanged original trunk tip; the visible fork grows inside
    // the old crown envelope, never into a new physical footprint below it.
    const leader = addBranch([0, 0, 0], [0, .53, 0], .090, .034, -1, 4);
    branches[leader] = { ...branches[leader], sections: CROWN_LEADER_SECTIONS, sectors: detail === 'ultra' ? 8 : 6 };
    const destinations = CROWN_DESTINATIONS[variant];
    for (let bough = 0; bough < destinations.length; bough++) {
      const from: GrowthPoint = [0, .14 + bough * .050, 0];
      const end = destinations[bough], primaryEnd = mix(from, end, .76);
      const primary = addBranch(from, primaryEnd, .032, .012, leader, bough % 5);
      const leafScale = variant === 2 ? .82 : 1;
      appendLeaves(plan, leaves, primary, 3, detail === 'ultra' ? 4 : 3,
        .13 * leafScale, .066 * leafScale, detail === 'ultra' ? 3 : 2, detail === 'ultra' ? 2 : 1);
      const radial = unit([end[0], 0, end[2]]), side: GrowthPoint = [-radial[2], 0, radial[0]];
      for (let shoot = 0; shoot < 3; shoot++) {
        const root = mix(from, primaryEnd, .55 + shoot * .13);
        const destination = plus(end, plus(times(side, (shoot - 1) * .14),
          [0, (shoot - 1) * .066 + (sculptHash(bough, shoot, 811) - .5) * .036, 0]));
        const twig = addBranch(root, destination, .011, .0038, primary, bough % 5);
        appendLeaves(plan, leaves, twig, 5, detail === 'ultra' ? 6 : 4,
          .16 * leafScale, .080 * leafScale, detail === 'ultra' ? 4 : 3, detail === 'ultra' ? 3 : 2);
      }
    }
  } else {
    // Real woody root owns planting. Lower leaves grow from unequal low
    // shoot nodes, with soil openings instead of a mandatory radial leaf pad.
    const root = addBranch([0, 0, 0], [0, .34, 0], .145, .055, -1, 0);
    const primaryShoots: number[] = [];
    for (let stem = 0; stem < 9; stem++) {
      const theta = stem / 9 * TAU + stem * .073 + variant * .34;
      const reach = (variant === 2 ? .42 : .58) * (.78 + sculptHash(stem, variant, 853) * .22);
      const height = variant === 1 ? (stem === 5 ? .86 : stem === 1 ? .82
        : .46 + sculptHash(stem, variant, 857) * .14)
        : .46 + sculptHash(stem, variant, 857) * .32;
      const lean = variant === 1 ? .19 * height : 0;
      const from: GrowthPoint = [0, .075 + stem % 3 * .015, 0];
      const end: GrowthPoint = [Math.cos(theta) * reach + lean, height, Math.sin(theta) * reach];
      const main = addBranch(from, mix(from, end, .70), .023, .009, root, stem % 4);
      primaryShoots.push(main);
      appendLeaves(plan, leaves, main, 4, detail === 'ultra' ? 4 : 3,
        .15, .098, detail === 'ultra' ? 3 : 2, detail === 'ultra' ? 2 : 1);
      const side: GrowthPoint = [-Math.sin(theta), 0, Math.cos(theta)];
      for (let shoot = 0; shoot < 2; shoot++) {
        const at = mix(from, branches[main].to, .57 + shoot * .20);
        const tip = plus(end, plus(times(side, (shoot ? 1 : -1) * .10), [0, (shoot ? 1 : -1) * .050, 0]));
        const twig = addBranch(at, tip, .0085, .0032, main, stem % 4);
        appendLeaves(plan, leaves, twig, 4, detail === 'ultra' ? 5 : 3,
          .185, .104, detail === 'ultra' ? 3 : 2, detail === 'ultra' ? 2 : 1);
      }
    }
    const lowerLeaves: GrowthLeaf[] = [];
    const lowerShootOrder = [0, 5, 2, 7, 4, 1, 8, 3, 6, 2, 0, 7, 5, 1, 4, 8] as const;
    for (let basal = 0; basal < lowerShootOrder.length; basal++) {
      const parent = primaryShoots[lowerShootOrder[basal]], branch = branches[parent];
      const node = .22 + sculptHash(basal, variant, 871) * .20;
      const at = mix(branch.from, branch.to, node);
      const radial = unit([branch.to[0], 0, branch.to[2]]), side: GrowthPoint = [-radial[2], 0, radial[0]];
      const angle = (sculptHash(basal, variant, 873) - .5) * 1.40;
      const direction = unit(plus(plus(times(radial, Math.cos(angle)), times(side, Math.sin(angle))),
        [0, .22 + sculptHash(basal, variant, 875) * .35, 0]));
      const length = .145 + sculptHash(basal, variant, 877) * .065;
      lowerLeaves.push({ root: at, tip: plus(at, times(direction, length)),
        width: .080 + sculptHash(basal, variant, 879) * .035,
        thickness: .012 + sculptHash(basal, variant, 881) * .006,
        parent, mass: branch.mass, levels: 7,
        roll: (sculptHash(basal, variant, 883) - .5) * 1.44,
        bend: .005 + sculptHash(basal, variant, 885) * .009 });
    }
    // Keep original component/corner ordering: only the first sixteen leaf
    // records change. Every original upper leaf and branch remains exact.
    leaves.unshift(...lowerLeaves);
  }
  assertVegetationGrowthPlan(plan);
  for (const branch of branches) {
    Object.freeze(branch.from); Object.freeze(branch.to); Object.freeze(branch);
  }
  for (const leaf of leaves) {
    Object.freeze(leaf.root); Object.freeze(leaf.tip); Object.freeze(leaf);
  }
  return Object.freeze({ ...plan, branches: Object.freeze(branches), leaves: Object.freeze(leaves) });
}

/** Exact emitted topology, including both caps of every woody tube and both
 * sides of every leaf. The eventual non-indexed position/normal/colour owner
 * allocates 108 bytes per triangle. No index or UV buffer is hidden here. */
export function vegetationGrowthPrice(plan: VegetationGrowthPlan, level: GrowthDistance = 'near') {
  const bit = level === 'near' ? 1 : level === 'middle' ? 2 : 4;
  const leaves = plan.leaves.filter(leaf => (leaf.levels & bit) !== 0).length;
  const branchTriangles = plan.branches.reduce((sum, branch) => sum
    + (branch.sectors ?? plan.branchSectors) * (branch.sections?.length ?? 2) * 2, 0);
  const leafTriangles = plan.leafSectors * plan.leafSections.length * 2;
  const triangles = branchTriangles + leaves * leafTriangles;
  return Object.freeze({ branches: plan.branches.length, leaves, components: plan.branches.length + leaves,
    triangles, geometryBytes: triangles * 108 });
}

function attachmentAt(point: GrowthPoint, branch: GrowthBranch): boolean {
  const axis = plus(branch.to, times(branch.from, -1)), offset = plus(point, times(branch.from, -1));
  const lengthSquared = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
  const t = (offset[0] * axis[0] + offset[1] * axis[1] + offset[2] * axis[2]) / lengthSquared;
  const closest = mix(branch.from, branch.to, Math.min(1, Math.max(0, t)));
  return t >= 0 && t <= 1 && Math.hypot(...plus(point, times(closest, -1)))
    <= radiusAt(branch, t) * .5 + 1e-9;
}

/** A valid closed leaf can still float. Require the independent rooted graph
 * and a real interior attachment to its parent segment, not merely a label. */
export function assertVegetationGrowthPlan(plan: VegetationGrowthPlan): void {
  if (plan.branchSectors < 4 || plan.leafSectors < 4 || plan.leafSections.length !== 2
    || plan.leafSections.some(section => !Number.isFinite(section.t) || !Number.isFinite(section.radius)
      || section.t <= 0 || section.t >= 1 || section.radius <= 0)
    || plan.leafSections[0].t >= plan.leafSections[1].t || plan.branches.length === 0) throw new Error('Empty vegetation growth topology');
  for (let index = 0; index < plan.branches.length; index++) {
    const branch = plan.branches[index];
    if (![...branch.from, ...branch.to, branch.radiusFrom, branch.radiusTo].every(Number.isFinite)
      || Math.hypot(...plus(branch.to, times(branch.from, -1))) <= 1e-6
      || branch.radiusFrom <= 0 || branch.radiusTo <= 0) throw new Error('Invalid vegetation branch');
    if (branch.sections && (branch.sections.length < 2 || branch.sections.some((section, row) =>
      !Number.isFinite(section.t) || !Number.isFinite(section.radius) || section.radius <= 0
      || section.t < 0 || section.t > 1 || (row > 0 && section.t <= branch.sections![row - 1].t))
      || branch.sections[0].t !== 0 || branch.sections.at(-1)!.t !== 1
      || branch.sections[0].radius !== branch.radiusFrom || branch.sections.at(-1)!.radius !== branch.radiusTo))
      throw new Error('Invalid vegetation branch profile');
    if (branch.sectors !== undefined && (!Number.isInteger(branch.sectors) || branch.sectors < 4))
      throw new Error('Invalid vegetation branch sectors');
    if (index === 0 ? branch.parent !== -1 : branch.parent < 0 || branch.parent >= index
      || !attachmentAt(branch.from, plan.branches[branch.parent])) throw new Error('Detached vegetation branch');
  }
  for (const leaf of plan.leaves) {
    if (![...leaf.root, ...leaf.tip, leaf.width, leaf.thickness, leaf.roll, leaf.bend].every(Number.isFinite)
      || leaf.width <= leaf.thickness || leaf.thickness <= 0
      || Math.hypot(...plus(leaf.tip, times(leaf.root, -1))) <= 1e-6
      || leaf.parent < 0 || leaf.parent >= plan.branches.length || (leaf.levels & 1) === 0
      || !attachmentAt(leaf.root, plan.branches[leaf.parent])) throw new Error('Detached vegetation leaf');
  }
}

