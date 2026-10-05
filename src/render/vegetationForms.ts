/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Shared procedural vegetation. Broadleaf habits and shrubs are rooted woody
 * scaffolds with small closed leaf whorls and real negative space. Conifers
 * use uneven tapered boughs with short rounded foliage clusters. Each habit owns one shared
 * geometry/material bucket; the caller owns physical bounds, colour and light.
 */
import * as THREE from 'three';
import { buildVegetationGrowthPlan, vegetationGrowthPrice, type GrowthDistance,
  type VegetationGrowthPlan } from './vegetationGrowthPlan.ts';
import { constructionScopeOpen, onConstructionScopeEnd } from './constructionScope.ts';

export type VegetationFamily = 'crown' | 'coniferFoliage' | 'shrub';
export type VegetationDetail = 'ordinary' | 'ultra';
export type VegetationVariant = 0 | 1 | 2;
type Vec3 = readonly [number, number, number];

/** Rendered bole profile, never a footprint/collider or palette descriptor. */
export interface VegetationRootJoin {
  readonly radiusTop: number;
  /** Radius at baseY; ordinary uses the original zero-height cylinder base. */
  readonly radiusBase: number;
  readonly sides: number;
  readonly baseY?: number;
  readonly phase?: number;
  readonly style?: 'cylinder-flat' | 'lathe-smooth';
}

export interface VegetationContract {
  readonly min: Vec3;
  readonly max: Vec3;
  /** Original PROP_SPREADS/PROP_FOOTPRINTS circle, in unscaled prop coordinates. */
  readonly spreadRadius: number;
  /** Original root-axis Y; the form's attachment must continue to cover it. */
  readonly rootY: number;
  /** Optional original trunk dimensions; render structure only, never a new collider. */
  readonly rootJoin?: VegetationRootJoin & { readonly ultra?: VegetationRootJoin };
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
/** Eight finite, unequal bough bands overlap into a tapered evergreen crown. */
const CONIFER_BOUGH_TIERS = Object.freeze([
  // The lower tier begins above its complete bough/spray thickness. Unequal
  // three- and four-bough bands turn between layers, so the same 24 roots
  // make an interleaved crown instead of six isolated paddle whorls.
  { height: .29, reach: 1, branches: 4 }, { height: .38, reach: .88, branches: 4 },
  { height: .47, reach: .76, branches: 3 }, { height: .56, reach: .65, branches: 3 },
  { height: .65, reach: .54, branches: 3 }, { height: .74, reach: .43, branches: 3 },
  { height: .82, reach: .31, branches: 2 }, { height: .93, reach: .20, branches: 2 },
].map(tier => Object.freeze(tier)));
const CONIFER_TOPOLOGY = Object.freeze({
  ordinary: Object.freeze({ coreSectors: 8, coreRows: 8, boughSectors: 6, boughRows: 4,
    clusterSectors: 6, clusterRows: 4, clusters: 10, farClusters: Object.freeze([0, 3, 6, 9]) }),
  ultra: Object.freeze({ coreSectors: 12, coreRows: 10, boughSectors: 8, boughRows: 5,
    clusterSectors: 8, clusterRows: 5, clusters: 12, farClusters: Object.freeze([0, 2, 4, 6, 9, 11]) }),
});
function coniferDistanceCounts(detail: VegetationDetail) {
  const t = CONIFER_TOPOLOGY[detail];
  const boughs = CONIFER_BOUGH_TIERS.reduce((sum, tier) => sum + tier.branches, 0);
  const shell = (sectors: number, rows: number): number => sectors * rows * 2;
  return Object.freeze({
    near: shell(t.coreSectors, t.coreRows) + boughs * (shell(t.boughSectors, t.boughRows)
      + t.clusters * shell(t.clusterSectors, t.clusterRows)),
    middle: shell(t.coreSectors / 2, t.coreRows) + boughs * (shell(t.boughSectors / 2, t.boughRows)
      + t.clusters * shell(t.clusterSectors / 2, t.clusterRows)),
    far: shell(t.coreSectors / 2, t.coreRows) + boughs * (shell(t.boughSectors / 2, 2)
      + t.farClusters.length * shell(t.clusterSectors / 2, 2)),
  });
}
/** All distance levels reconnect original near vertices, with both caps. */
export const CONIFER_DISTANCE_COUNTS = Object.freeze({
  ordinary: coniferDistanceCounts('ordinary'), ultra: coniferDistanceCounts('ultra'),
});
export const VEGETATION_FORM_COUNTS = Object.freeze({
  ordinary: Object.freeze({ crown: BROADLEAF_DISTANCE_COUNTS.ordinary.crown.near,
    coniferFoliage: CONIFER_DISTANCE_COUNTS.ordinary.near, shrub: BROADLEAF_DISTANCE_COUNTS.ordinary.shrub.near }),
  ultra: Object.freeze({ crown: BROADLEAF_DISTANCE_COUNTS.ultra.crown.near,
    coniferFoliage: CONIFER_DISTANCE_COUNTS.ultra.near, shrub: BROADLEAF_DISTANCE_COUNTS.ultra.shrub.near }),
});

/** Complete allocated colour alternatives for GPU-free resident pricing.
 * Every family packs all three levels; a camera's current level cannot discount
 * these owned bytes. Conifer values derive from its finite cluster records. */
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

/** Tapered, overlapping bough bands form one irregular evergreen envelope.
 * The native core, planted base and exact top survive; it is a recessed
 * connector rather than a smooth cone that hides the bough structure. */
function appendConifer(shell: Shell, detail: VegetationDetail, variant: VegetationVariant): void {
  const richer = detail === 'ultra', topology = CONIFER_TOPOLOGY[detail];
  const lean = variant === 1 ? 0.12 : variant === 2 ? -0.045 : 0.035;
  const spine = (t: number): Vec3 => [lean * t * t, t, -lean * t * 0.31];
  // The inner growth is only a buried connector for the actual bough roots.
  // It must disappear behind the overlapping branchlet envelope rather than
  // read as a smooth green leader between isolated radial arms.
  const core: readonly Section[] = richer
    ? [{ t: .005, radius: .022 }, { t: .08, radius: .032 }, { t: .18, radius: .040 },
      { t: .30, radius: .050 }, { t: .43, radius: .046 }, { t: .56, radius: .038 },
      { t: .69, radius: .030 }, { t: .80, radius: .022 }, { t: .91, radius: .014 },
      { t: .985, radius: .007 }]
    : [{ t: .005, radius: .022 }, { t: .10, radius: .032 }, { t: .24, radius: .045 },
      { t: .40, radius: .050 }, { t: .56, radius: .043 }, { t: .71, radius: .030 },
      { t: .85, radius: .018 }, { t: .985, radius: .007 }];
  appendShell(shell, topology.coreSectors, core, [0, 0, 0], spine(1), (section, theta, sector, row) => {
    const ridge = .78 + .22 * hash01(sector, row, 683);
    const turn = theta + row * .15, radius = section.radius * ridge;
    return { p: plus(spine(section.t), [Math.cos(turn) * radius, 0, Math.sin(turn) * radius]),
      reach: -.10 + .08 * ridge };
  }, 4, 0, 1);
  const boughRows: readonly Section[] = richer
    ? [{ t: .05, radius: .20 }, { t: .20, radius: .62 }, { t: .45, radius: .88 },
      { t: .70, radius: .58 }, { t: .91, radius: .11 }]
    : [{ t: .06, radius: .23 }, { t: .26, radius: .72 },
      { t: .58, radius: .84 }, { t: .88, radius: .12 }];
  const clusterRows: readonly Section[] = richer
    ? [{ t: .04, radius: .10 }, { t: .22, radius: .58 }, { t: .48, radius: .90 },
      { t: .72, radius: .54 }, { t: .93, radius: .10 }]
    : [{ t: .05, radius: .12 }, { t: .30, radius: .72 },
      { t: .60, radius: .82 }, { t: .91, radius: .12 }];
  for (let whorl = 0; whorl < CONIFER_BOUGH_TIERS.length; whorl++) {
    const tier = CONIFER_BOUGH_TIERS[whorl], id = whorl % 4;
    for (let branch = 0; branch < tier.branches; branch++) {
      const theta = branch / tier.branches * TAU + whorl * .83 + variant * .31
        + (hash01(whorl, branch, 631) - .5) * .46;
      const direction: Vec3 = [Math.cos(theta), 0, Math.sin(theta)];
      const side: Vec3 = [-direction[2], 0, direction[0]];
      const radius = tier.reach * (variant === 2 ? .78 : 1)
        * (.87 + hash01(whorl, branch, 641) * .13);
      const topBand = whorl === CONIFER_BOUGH_TIERS.length - 1;
      const y = tier.height + (branch / (tier.branches - 1) - .5) * (topBand ? .006 : .028)
        + (hash01(whorl, branch, 647) - .5) * (topBand ? .006 : .012);
      const root = spine(y), droop = radius * (.082 + hash01(whorl, branch, 653) * .025);
      const tip = plus(root, [direction[0] * radius, -droop, direction[2] * radius]);
      const centre = (t: number): Vec3 => plus(times(root, 1 - t), times(tip, t));
      const axis = unit(plus(tip, times(root, -1))), depth = cross(side, axis);
      // The radial support is a thin hidden stem. Long, overlapping branchlet
      // fans carry the visible evergreen volume; a broad support would return
      // the rejected paddle-arm silhouette.
      const breadth = .020 + radius * .045, thickness = .004 + radius * .012;
      appendShell(shell, topology.boughSectors, boughRows, root, tip, (section, angle) => ({
        p: plus(centre(section.t), plus(times(side, Math.cos(angle) * section.radius * breadth),
          times(depth, Math.sin(angle) * section.radius * thickness))),
        reach: -.16 + section.t * .36 + .035 * Math.cos(angle),
      }), id, 0, 1);
      for (let cluster = 0; cluster < topology.clusters; cluster++) {
        const seed = whorl * 11 + branch;
        const at = (cluster + .5) / topology.clusters + (hash01(seed, cluster, 659) - .5) * .050;
        // Each tuft begins inside its own thin host bough. Its root shifts only
        // a little, while a scale floor keeps the upper crown full even where
        // the final supporting branch is short.
        const lateral = (hash01(seed, cluster, 657) - .5) * breadth * Math.sin(at * Math.PI) * .06;
        const clusterRoot = plus(centre(at), times(side, lateral));
        const length = .060 + radius * (.20 + hash01(seed, cluster, 661) * .10);
        const alternating = cluster % 2 ? 1 : -1;
        const turn = alternating * (.72 + hash01(seed, cluster, 667) * .20)
          + (hash01(seed, cluster, 663) - .5) * .12;
        const sweep = (hash01(seed, cluster, 671) - .5) * .32 + (alternating > 0 ? .075 : -.075);
        const clusterDirection = unit(plus(plus(times(direction, .33 + hash01(seed, cluster, 665) * .10),
          times(side, turn)), [0, sweep, 0]));
        const clusterTip = plus(clusterRoot, times(clusterDirection, length));
        const clusterSide = unit([-clusterDirection[2], 0, clusterDirection[0]]);
        const clusterDepth = cross(clusterSide, clusterDirection);
        // Width and depth have deliberate floors. The height axis maps much
        // farther than XZ, so the depth floor gives every upper tuft a real
        // volumetric shoulder instead of a flat kite when its branch shortens.
        const width = .055 + radius * (.10 + hash01(seed, cluster, 673) * .030);
        const thickness = .028 + radius * (.026 + hash01(seed, cluster, 677) * .012);
        // Full 3D tapered needle tufts alternate around the stem at roughly
        // 45–70 degrees. Their unequal up/down sweep overlaps neighbouring
        // boughs and bands into a pine crown with controlled irregular breaks.
        appendShell(shell, topology.clusterSectors, clusterRows, clusterRoot, clusterTip,
          (section, angle) => ({
            p: plus(plus(times(clusterRoot, 1 - section.t), times(clusterTip, section.t)), plus(
              times(clusterSide, Math.cos(angle) * section.radius * width),
              times(clusterDepth, Math.sin(angle) * section.radius * thickness))),
            reach: .03 + section.t * .28,
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

const crownRootJoin = (contract: VegetationContract, detail: VegetationDetail): VegetationRootJoin | undefined =>
  detail === 'ultra' ? contract.rootJoin?.ultra ?? contract.rootJoin : contract.rootJoin;

/** Reverse the native corner order to preserve appendShell's outward winding,
 * while keeping the EXACT native cylinder/lathe angle expressions and phase. */
function crownRootPoint(join: VegetationRootJoin, sector: number, radius: number, y: number): Vec3 {
  const nativeSector = (join.sides - sector) % join.sides;
  const angle = (join.phase ?? 0) + nativeSector / join.sides * TAU;
  return join.style === 'lathe-smooth'
    ? [Math.cos(angle) * radius, y, -Math.sin(angle) * radius]
    : [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

/** Continue the ACTUAL tier's bole through an exact source-cap ring. The
 * overlap below the cap has its source taper/phase/sides; no enlarged collar
 * covers a mismatch. The upper scaffold and every bough/leaf stay in place.
 * The original source trunk, physics and caster geometry remain untouched. */
function continueCrownRoot(shell: Shell, contract: VegetationContract, detail: VegetationDetail): void {
  const join = crownRootJoin(contract, detail);
  if (!join) return;
  const leader = shell.components[0];
  if (!leader || leader.sectors !== join.sides || leader.rows !== 4
    || contract.rootY <= contract.min[1]) throw new Error('Crown root continuation contract drift');
  const p = shell.positions, baseY = join.baseY ?? 0;
  const lowerRadius = lerp(join.radiusBase, join.radiusTop, (contract.min[1] - baseY) / (contract.rootY - baseY));
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
    const y = row === 1 ? contract.rootY : p[first * 3 + 1];
    if (row === 1 && y >= p[(leader.base + 2 * leader.sectors) * 3 + 1])
      throw new Error('Crown source cap crossed its first bough band');
    for (let sector = 0; sector < leader.sectors; sector++) {
      const offset = (first + sector) * 3, radius = row === 0 ? lowerRadius : join.radiusTop;
      const native = crownRootPoint(join, sector, row < 2 ? radius : 1, y);
      p[offset] = row < 2 ? native[0] : centreX + native[0] * radiusX;
      p[offset + 1] = y;
      p[offset + 2] = row < 2 ? native[2] : centreZ + native[2] * radiusZ;
    }
  }
}

/** Match the actual tier's flat/smooth bark normals through the shared cap.
 * Caps retain their outward normals; only the first two leader side rings
 * inherit the native bole response. Upper bough/leaf normals stay unchanged. */
function preserveTrunkSideNormals(normal: THREE.BufferAttribute, shell: Shell,
  contract: VegetationContract, detail: VegetationDetail): void {
  const join = crownRootJoin(contract, detail); if (!join) return;
  const leader = shell.components[0], baseY = join.baseY ?? 0;
  const dy = contract.rootY - baseY, dr = join.radiusTop - join.radiusBase, length = Math.hypot(dy, dr);
  const smooth = Array.from({ length: join.sides }, (_, sector) => {
    const p = crownRootPoint(join, sector, 1, 0);
    return [p[0] * dy / length, -dr / length, p[2] * dy / length] as Vec3;
  });
  const flat = Array.from({ length: join.sides }, (_, sector) => {
    const a = crownRootPoint(join, sector, join.radiusBase, baseY);
    const b = crownRootPoint(join, (sector + 1) % join.sides, join.radiusBase, baseY);
    const c = crownRootPoint(join, sector, join.radiusTop, contract.rootY);
    return unit(cross(plus(c, times(a, -1)), plus(b, times(a, -1))));
  });
  const trianglesPerSector = leader.rows * 2;
  for (let corner = leader.first; corner < leader.end; corner++) {
    const triangle = Math.floor((corner - leader.first) / 3), within = triangle % trianglesPerSector;
    if (within === 0 || within === trianglesPerSector - 1) continue;
    const vertex = shell.indices[corner] - leader.base;
    if (vertex < 0 || vertex >= leader.sectors * 2) continue;
    const sector = vertex % leader.sectors, face = Math.floor(triangle / trianglesPerSector);
    const n = join.style === 'lathe-smooth' ? smooth[sector] : flat[face];
    normal.setXYZ(corner, n[0], n[1], n[2]);
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
  if (family === 'crown') continueCrownRoot(shell, contract, detail);
  return shell;
}

/** Per-shell directed edges and signed volume, before the owner's non-indexed format.
 * Integer edge keys (`from * stride + to`) replace the original `from:to`
 * strings: the same insertion-ordered Map walk, counts, reverse lookups,
 * volume arithmetic and error text, at a fraction of the allocation. A
 * component holding any non-integer index keeps the original string walk. */
function assertClosedOutward(shell: Shell): void {
  const p = shell.positions;
  for (const component of shell.components) {
    // Every index the triangle walk reads, including a partial last triple.
    let stride = 0;
    const read = component.first + Math.ceil((component.end - component.first) / 3) * 3;
    for (let i = component.first; i < read; i++) {
      const index = shell.indices[i];
      if (!Number.isSafeInteger(index) || index < 0) { stride = -1; break; }
      if (index >= stride) stride = index + 1;
    }
    if (stride > 0 && stride <= 67108864) { assertComponentClosedOutward(shell, component, stride); continue; }
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

/** One component of `assertClosedOutward` over exact integer edge keys. */
function assertComponentClosedOutward(shell: Shell, component: Shell['components'][number], stride: number): void {
  const p = shell.positions, indices = shell.indices;
  const edges = new Map<number, number>();
  let volumeSix = 0;
  for (let i = component.first; i < component.end; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const ab = a * stride + b, bc = b * stride + c, ca = c * stride + a;
    edges.set(ab, (edges.get(ab) ?? 0) + 1);
    edges.set(bc, (edges.get(bc) ?? 0) + 1);
    edges.set(ca, (edges.get(ca) ?? 0) + 1);
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
    const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2];
    volumeSix += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  for (const [edge, count] of edges) {
    const from = Math.floor(edge / stride), to = edge - from * stride;
    if (count !== 1 || edges.get(to * stride + from) !== 1) throw new Error(`Open or doubled vegetation edge ${from}:${to}`);
  }
  if (!(volumeSix > 1e-10)) throw new Error('Vegetation component has non-positive enclosed volume');
}

function assertContract(contract: VegetationContract): void {
  for (const join of [contract.rootJoin, contract.rootJoin?.ultra]) if (join) {
    const baseY = join.baseY ?? 0;
    if (![join.radiusTop, join.radiusBase, join.sides, baseY, join.phase ?? 0].every(Number.isFinite)
      || join.radiusTop <= 0 || join.radiusBase < join.radiusTop || !Number.isInteger(join.sides)
      || join.sides < 4 || baseY < 0 || baseY >= contract.min[1] || contract.rootY <= contract.min[1]
      || !['cylinder-flat', 'lathe-smooth'].includes(join.style ?? 'cylinder-flat'))
      throw new Error('Invalid actual trunk continuation dimensions');
  }
  if (![...contract.min, ...contract.max, contract.spreadRadius, contract.rootY].every(Number.isFinite)
    || contract.min[0] >= 0 || contract.min[2] >= 0 || contract.max[0] <= 0 || contract.max[2] <= 0
    || contract.max[1] <= contract.min[1] || contract.spreadRadius <= 0
    || contract.rootY < contract.min[1] || contract.rootY > contract.max[1]) {
    throw new Error('Vegetation needs the original positive envelope about the root axis');
  }
}

/** Validated pre-paint CPU arrays of one pure form recipe (family, detail,
 * variant and contract values). Never a geometry, material or GPU owner. */
interface VegetationFormTemplate {
  readonly triangles: number;
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly reach: Float32Array;
  readonly height: Float32Array;
  readonly mass: Uint8Array;
  readonly leaf: Uint8Array;
  readonly wood: Uint8Array;
}

const formTemplates = new Map<string, VegetationFormTemplate>();
onConstructionScopeEnd(() => formTemplates.clear());

/*
 * Construction-scoped reuse of identical form recipes (`constructionScope.ts`).
 * One world build asks for the same few crown/shrub/conifer recipes many times
 * (every authored canopy's price and adapter, every family bucket); inside an
 * open scope the first request grows, validates (closure, outward volume,
 * topology price) and derives normals once, and later requests copy those
 * exact arrays. Every call still returns fresh geometry and context arrays and
 * paints them itself, so callers own and may mutate what they receive. The
 * templates are dropped when the outermost scope ends.
 */

const vegetationContractKey = (contract: VegetationContract): string =>
  JSON.stringify(contract, (_key, value: unknown) => (Object.is(value, -0) ? '-0' : value));

function growVegetationFormTemplate(family: VegetationFamily, detail: VegetationDetail,
  variant: VegetationVariant, contract: VegetationContract): VegetationFormTemplate {
  const shell = makeShell(family, detail, variant, contract);
  assertClosedOutward(shell);
  const triangles = shell.indices.length / 3;
  if (triangles !== VEGETATION_FORM_COUNTS[detail][family]) throw new Error('Vegetation topology price drift');
  const indexed = new THREE.BufferGeometry();
  try {
    indexed.setAttribute('position', new THREE.Float32BufferAttribute(shell.positions, 3));
    indexed.setIndex(shell.indices);
    indexed.computeVertexNormals();
    const geometry = indexed.toNonIndexed();
    const smooth = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const smoothCopy = new Float32Array(smooth.array);
    geometry.computeVertexNormals();
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < normal.count; i++) {
      const leaf = shell.leaf[shell.indices[i]] === 1;
      // Closed leaf folds and thin bough undersides retain definition. The
      // conifer normal blend remains unchanged; this exemplar changes its form.
      const facet = leaf ? 0.62 : family === 'coniferFoliage' ? 0.31 : 0.22;
      const x = normal.getX(i) * facet + smoothCopy[i * 3] * (1 - facet);
      const y = normal.getY(i) * facet + smoothCopy[i * 3 + 1] * (1 - facet);
      const z = normal.getZ(i) * facet + smoothCopy[i * 3 + 2] * (1 - facet);
      const n = Math.hypot(x, y, z) || 1;
      normal.setXYZ(i, x / n, y / n, z / n);
    }
    if (family === 'crown') preserveTrunkSideNormals(normal, shell, contract, detail);
    const span = contract.max[1] - contract.min[1];
    return {
      triangles,
      position: (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array,
      normal: normal.array as Float32Array,
      reach: new Float32Array(shell.indices.map(i => shell.reach[i])),
      height: new Float32Array(shell.indices.map(i => (shell.positions[i * 3 + 1] - contract.min[1]) / span)),
      mass: new Uint8Array(shell.indices.map(i => shell.mass[i])),
      leaf: new Uint8Array(shell.indices.map(i => shell.leaf[i])),
      wood: new Uint8Array(shell.indices.map(i => shell.wood[i])),
    };
  } finally { indexed.dispose(); }
}

/**
 * Fresh geometry and context arrays on every call, and no retained GPU owner.
 * No material/texture/scene, timer, listener or shader allocation. Failed
 * painting releases the buffers. Inside a construction scope the pure
 * pre-paint arrays of an identical recipe are copied rather than regrown.
 */
export function buildVegetationForm(family: VegetationFamily, detail: VegetationDetail,
  variant: VegetationVariant, contract: VegetationContract, paint?: VegetationPainter): VegetationForm {
  assertContract(contract);
  const key = constructionScopeOpen() ? `${family}/${detail}/${variant}/${vegetationContractKey(contract)}` : null;
  let template = key === null ? undefined : formTemplates.get(key);
  // A template held by the scope is shared: every call receives copies. One
  // grown outside a scope belongs to this call alone and is handed over.
  const shared = key !== null;
  if (template === undefined) {
    template = growVegetationFormTemplate(family, detail, variant, contract);
    if (key !== null) formTemplates.set(key, template);
  }
  const own = <A extends Float32Array | Uint8Array>(array: A): A => (shared ? array.slice() as A : array);
  const { triangles } = template;
  const geometry = new THREE.BufferGeometry();
  try {
    geometry.setAttribute('position', new THREE.BufferAttribute(own(template.position), 3));
    const normal = new THREE.BufferAttribute(own(template.normal), 3);
    // The derived normal attribute carries the one update the grown
    // attribute's computeVertexNormals recorded.
    normal.needsUpdate = true;
    geometry.setAttribute('normal', normal);
    const reach = own(template.reach), height = own(template.height), mass = own(template.mass);
    const leaf = own(template.leaf), wood = own(template.wood);
    const context: VegetationPaintContext = { family, detail, variant, reach, height, mass, leaf, wood };
    const colour = new Float32Array(normal.count * 3); colour.fill(1);
    geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    paint?.(geometry, context);
    // Conifer bark uses CPU vertex albedo only; its existing material has no wood-response patch.
    if (detail === 'ultra' && family !== 'coniferFoliage' && wood.some(value => value !== 0))
      geometry.setAttribute('vegetationWood', new THREE.Float32BufferAttribute(wood, 1));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.name = `vegetation-form-${family}-${detail}-${variant}`;
    const geometryBytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
    return { geometry, triangles, geometryBytes, context };
  } catch (error) {
    geometry.dispose(); throw error;
  }
}

/** Existing one-geometry family buckets remain the sole GPU/disposal owners. */
export function createVegetationBuilders(contracts: VegetationContracts, detail: VegetationDetail,
  variant: VegetationVariant = 0, paint?: VegetationPainter): Readonly<Record<VegetationFamily, () => THREE.BufferGeometry>> {
  const build = (family: VegetationFamily): THREE.BufferGeometry => (
    buildVegetationForm(family, detail, variant, contracts[family], paint).geometry
  );
  return Object.freeze({ crown: () => build('crown'), coniferFoliage: () => build('coniferFoliage'), shrub: () => build('shrub') });
}

/** Reconnect retained native rings with the original root/tip caps. Middle
 * retains every rounded cluster; far keeps two ordinary/three Full clusters
 * on every bough. Every bough, core and native height remains. No new point,
 * independent fit, repaint, alpha card or padded triangle is introduced. */
function coniferDistanceIndices(shell: Shell, detail: VegetationDetail,
  level: 'middle' | 'far'): number[] {
  const indices: number[] = [], topology = CONIFER_TOPOLOGY[detail];
  const branchSpan = 1 + topology.clusters;
  for (let id = 0; id < shell.components.length; id++) {
    const component = shell.components[id], inBranch = (id - 1) % branchSpan;
    const cluster = id > 0 && inBranch > 0;
    if (level === 'far' && cluster && !topology.farClusters.includes(inBranch - 1)) continue;
    const sectors: number[] = [];
    // Six/eight-sector near rings retain three/four original corners.
    for (let sector = 0; sector < component.sectors; sector += 2) sectors.push(sector);
    const rows: number[] = [];
    if (id > 0 && level === 'far') rows.push(detail === 'ultra' ? 2 : 1, component.rows - 1);
    else for (let row = 0; row < component.rows; row++) rows.push(row);

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
        const wood = near.getAttribute('vegetationWood');
        if (wood) geometry.setAttribute('vegetationWood', new THREE.Float32BufferAttribute(retained.map(corner => wood.getX(corner)), 1));
        return geometry;
      } catch (error) { geometry.dispose(); throw error; }
    };
    middle = build('middle'); far = build('far');
    return Object.freeze({ near, middle, far });
  } catch (error) { near.dispose(); middle?.dispose(); far?.dispose(); throw error; }
}
