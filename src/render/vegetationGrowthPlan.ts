/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Render-only branching records. No Three, GPU, plan, palette or clock owner.
 * Coordinates use caller X/Z half-extents and Y span; the mesh owner fits the
 * complete plant once about its unchanged root axis. Price and geometry read
 * these same finite records rather than two separately maintained catalogues. */
import { PROP_SIZES } from '../data/props.ts';

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

/**
 * A closed, rounded leaf mass (2026-10-22 full-crown pass): one lumpy
 * icosphere that swallows the tip of its own woody parent, so it is rooted
 * the way a leaf is, never a floating ball. Overlapping masses close the
 * crown's silhouette; their tone class sits inner and under masses back.
 */
export interface GrowthClump {
  readonly centre: GrowthPoint;
  /** Semi-axes in the plan's frame (already corrected for the habit's height share). */
  readonly radii: GrowthPoint;
  /** Rooted woody parent: its tip lies deep inside this mass, or inside the host. */
  readonly parent: number;
  /** A tuft's host mass (an earlier clump it grows out of), else -1. */
  readonly host: number;
  readonly mass: number;
  /** near=1, middle=2, far=4, as for leaves. */
  readonly levels: number;
  /** Icosphere subdivisions: 1 is 80 faces, 2 is 320. */
  readonly subdivisions: number;
  /** Tone offset added to every corner's reach: inner/under masses below zero, the crest above. */
  readonly tone: number;
  /** Deterministic sculpt salt (lobes and per-corner jitter). */
  readonly salt: number;
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
  /** Crown leaf masses; empty for shrubs. Emitted after every branch and leaf. */
  readonly clumps: readonly GrowthClump[];
}

/** Faces of one icosphere mass at a subdivision level. */
export const clumpTriangles = (subdivisions: number): number => 20 * 4 ** subdivisions;

/** The crown's habit transforms, applied by the mesh owner after growth:
 * the share of the caller's height each habit uses, and the positive affine
 * lean (x += lean · y) of the second habit. One source for both owners. */
export const CROWN_HABIT = Object.freeze({
  heightShares: Object.freeze([1, 1, 0.78] as const),
  lean: Object.freeze([0, 0.55, 0] as const),
});

/** The crown's caller frame in metres (`foliageKit.ts`'s CROWN_ENVELOPE,
 * restated without Three; `vegetationForms.test.ts` holds the two equal):
 * X/Z half-extents, and the Y span from the envelope's floor. */
export const CROWN_FRAME = (() => {
  const tree = PROP_SIZES.broadleafTree;
  const base = tree.crownCentre - tree.crownHeight / 2;
  const top = Math.max(tree.crownCentre + tree.crownHeight / 2, tree.upperCentre + tree.upperRadius * 0.85);
  return Object.freeze({ halfX: tree.crownRadius, halfZ: tree.crownRadius * 0.92, base, span: top - base });
})();

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

/** A crown mass as laid out: its centre and radius in metres in the caller's
 * frame AFTER the habit's transforms (`CROWN_HABIT`), so a habit's layout is
 * where it is drawn; `squash` is its vertical semi-axis over `r`. */
interface CrownMassSpec {
  readonly at: GrowthPoint;
  readonly r: number;
  readonly squash: number;
  readonly tone: number;
  readonly role: 'bough' | 'inner' | 'outer' | 'crest' | 'under' | 'tuft';
  /** Distance levels: near=1, middle=2, far=4. */
  readonly levels: number;
  /** A tuft's host: the outer mass it grows out of (its centre lies inside it)… */
  readonly host?: number;
  /** …and the unit direction, in the host's own semi-axes, it grows out along. */
  readonly out?: GrowthPoint;
}

/** Tone classes: the inner body and the under masses sit back, the crest
 * and the tufts on the outer face catch the light (§7n's tone vocabulary).
 * 2026-10-22 second look pass: the inner body, seen only through the gaps,
 * holds the deepest shade, and the under masses — the face the chase camera
 * looks up into — sit back less, so the crown's normalised mean is spent on
 * what is seen. */
const MASS_TONE = Object.freeze({ inner: -0.60, under: -0.16, outer: -0.02, crest: 0.12, tuft: 0.06 });

/**
 * The crown's shape per habit, in metres: the ellipsoid its outer masses sit
 * on (centre height, horizontal and vertical semi-axes), the outer masses'
 * size, the spiral's phase, and an azimuth that leans the heavier side.
 */
const CROWN_SHAPES = Object.freeze([
  // mature-spreading: a broad, even dome.
  { centre: [0, 5.45, 0], across: 1.62, tall: 1.38, size: 0.86, phase: 0.4, heavy: 0 },
  // asymmetric-leafy: one heavy upper side over the lean, and an upright
  // oval beside the first habit's dome (2026-10-22 second look pass: the two
  // read as one silhouette down a row).
  { centre: [0.30, 5.62, 0], across: 1.36, tall: 1.50, size: 0.84, phase: 1.9, heavy: 0.22 },
  // young-low: compact and narrower, under its 0.78 height share.
  { centre: [0, 4.95, 0], across: 1.16, tall: 0.98, size: 0.66, phase: 3.1, heavy: 0 },
].map(shape => Object.freeze({ ...shape, centre: Object.freeze(shape.centre) as GrowthPoint })));

/** Outer masses on the crown's ellipsoid, under masses below it, small tufts
 * out of the outer masses' sunlit faces. The same counts in every habit. */
export const CROWN_LAYOUT = Object.freeze({ outer: 14, under: 3, tufts: 16, boughs: 7 });

/**
 * The 2026-10-22 full crowns (the owner's ride: "a few separate blobs with
 * see-through gaps"; both independent foliage reviews before it failed the
 * sparse branch-heavy crowns). An inner body closes the middle, fourteen
 * overlapping outer masses lie on a golden spiral over the crown's ellipsoid
 * (polar 34–112°, so the underside is the under masses' and the summit the
 * crest's), three under masses darken its floor, and sixteen small tufts
 * grow in eight close pairs out of the outer masses below the shoulder to
 * break the silhouette into broad leafy lobes up close. The seven lowest outer masses take the seven primary boughs, in
 * height order up the leader. Deterministic: a pure function of the habit.
 */
function crownMasses(variant: GrowthVariant): readonly CrownMassSpec[] {
  const shape = CROWN_SHAPES[variant], [cx, cy, cz] = shape.centre;
  const point = (polar: number, azimuth: number, out = 0): GrowthPoint => [
    cx + (shape.across + out) * Math.sin(polar) * Math.cos(azimuth),
    cy + (shape.tall + out) * Math.cos(polar),
    cz + (shape.across + out) * 0.92 * Math.sin(polar) * Math.sin(azimuth)];
  const outer: CrownMassSpec[] = [];
  const top = Math.cos(34 * Math.PI / 180), bottom = Math.cos(112 * Math.PI / 180);
  for (let i = 0; i < CROWN_LAYOUT.outer; i++) {
    const t = (i + 0.5) / CROWN_LAYOUT.outer;
    const polar = Math.acos(top - t * (top - bottom)) + (sculptHash(variant, i, 701) - .5) * 0.16;
    const azimuth = i * 2.399963 + shape.phase + (sculptHash(variant, i, 703) - .5) * 0.30;
    // The heavy side (+X) carries larger masses on the leaning habit.
    const heavy = 1 + shape.heavy * Math.cos(azimuth);
    const r = shape.size * heavy * (0.84 + 0.22 * Math.sin(polar) + (sculptHash(variant, i, 707) - .5) * 0.14);
    outer.push({ at: point(polar, azimuth, -0.30 * r), r, squash: 0.92, tone: MASS_TONE.outer,
      role: 'outer', levels: 7 });
  }
  // The seven lowest outer masses take the boughs, lowest first.
  const order = outer.map((mass, index) => ({ mass, index })).sort((a, b) => a.mass.at[1] - b.mass.at[1] || a.index - b.index);
  const boughs = order.slice(0, CROWN_LAYOUT.boughs).map(entry => ({ ...entry.mass, role: 'bough' as const }));
  const rest = order.slice(CROWN_LAYOUT.boughs).sort((a, b) => a.index - b.index).map(entry => entry.mass);
  const inner: CrownMassSpec = { at: [cx, cy - 0.05, cz], r: shape.across * 0.98, squash: shape.tall / shape.across * 0.98,
    tone: MASS_TONE.inner, role: 'inner', levels: 7 };
  const crest: CrownMassSpec = { at: point(0, 0, -0.25 * shape.size), r: shape.size, squash: 0.88,
    tone: MASS_TONE.crest, role: 'crest', levels: 7 };
  const under = Array.from({ length: CROWN_LAYOUT.under }, (_, k): CrownMassSpec => {
    const azimuth = k / CROWN_LAYOUT.under * Math.PI * 2 + shape.phase * 0.7;
    return { at: point(2.32, azimuth, -0.42 * shape.size), r: shape.size * 0.82, squash: 0.72,
      tone: MASS_TONE.under, role: 'under', levels: 3 };
  });
  // Tufts: out of every other outer (non-bough) mass and two boughs, on the
  // mass's outward side, their centres inside their host.
  const masses: CrownMassSpec[] = [...boughs, inner, crest, ...rest, ...under];
  // Hosts below the crown's shoulder, so the crest stays its summit.
  const hosts = masses.map((mass, index) => ({ mass, index })).filter(entry => (entry.mass.role === 'outer'
    || entry.mass.role === 'bough') && entry.mass.at[1] < cy + shape.tall * 0.55);
  // 2026-10-22 second look pass: the sixteen tufts grow as eight close
  // pairs, so up close the outline breaks into eight broad leafy lobes rather
  // than sixteen florets (the critic's "broccoli"). Same masses, same price.
  for (let k = 0; k < CROWN_LAYOUT.tufts; k++) {
    const pair = k >> 1, twin = k & 1 ? 1 : -1;
    const { mass: host, index } = hosts[(pair * 5 + variant * 3) % hosts.length];
    const outward = unit([host.at[0] - cx, (host.at[1] - cy) * 0.8 + 0.25, host.at[2] - cz]);
    const turn = (sculptHash(variant, pair, 709) - .5) * 0.9 + twin * TUFT_PAIR_TURN;
    const side = unit([-outward[2], 0, outward[0]]);
    const direction = unit(plus(outward, times(side, turn)));
    masses.push({ at: plus(host.at, times(direction, host.r * TUFT_OFFSET)), r: shape.size * (0.54 + sculptHash(variant, pair, 711) * 0.08),
      squash: 0.86, tone: MASS_TONE.tuft, role: 'tuft', levels: 1, host: index, out: direction });
  }
  return masses;
}
/** How deep a mass swallows its parent's tip: the tip's normalised ellipsoid
 * radius inside the mass. A tip near the surface would read as a ball on a stick. */
export const CLUMP_ROOT_DEPTH = 0.8;
/** How far inside its host a tuft's centre must lie (normalised ellipsoid radius)… */
export const TUFT_HOST_DEPTH = 0.85;
/** …and where it is grown: this far out along its direction, in host semi-axes. */
const TUFT_OFFSET = 0.72;
/** The turn either side of a tuft pair's shared direction (one broad lobe, two masses). */
const TUFT_PAIR_TURN = 0.26;

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

/** A point authored in the crown's final metres, in the plan frame before the
 * habit's height share and lean (the mesh owner applies both afterwards). */
function crownPlanPoint(variant: GrowthVariant, at: GrowthPoint): GrowthPoint {
  const share = CROWN_HABIT.heightShares[variant], lean = CROWN_HABIT.lean[variant];
  const height = (at[1] - CROWN_FRAME.base) / CROWN_FRAME.span;
  return [at[0] / CROWN_FRAME.halfX - lean * height, height / share, at[2] / CROWN_FRAME.halfZ];
}
/** A plan-frame point back in final metres (the inverse of `crownPlanPoint`). */
function crownMetres(variant: GrowthVariant, p: GrowthPoint): GrowthPoint {
  const share = CROWN_HABIT.heightShares[variant], lean = CROWN_HABIT.lean[variant];
  const height = p[1] * share;
  return [(p[0] + lean * height) * CROWN_FRAME.halfX, CROWN_FRAME.base + height * CROWN_FRAME.span, p[2] * CROWN_FRAME.halfZ];
}

/**
 * Seven primary boughs from the leader into the seven bough masses, the inner
 * body on the leader's own tip, one twig from the nearest primary into every
 * other outer, crest and under mass, its tip deep inside it, and each tuft
 * grown out of its host mass. Woody structure is exactly what the masses
 * need: no twig or leaf is paid for where a mass hides it.
 */
function appendCrownMasses(plan: VegetationGrowthPlan, branches: GrowthBranch[], clumps: GrowthClump[],
  leader: number, addBranch: (from: GrowthPoint, to: GrowthPoint, radiusFrom: number, radiusTo: number,
    parent: number, mass: number) => number): void {
  const { variant, detail } = plan;
  const specs = crownMasses(variant);
  const radii = (spec: CrownMassSpec): GrowthPoint => [spec.r / CROWN_FRAME.halfX,
    spec.r * spec.squash / (CROWN_FRAME.span * CROWN_HABIT.heightShares[variant]), spec.r / CROWN_FRAME.halfZ];
  const primaries: number[] = [];
  specs.forEach((spec, index) => {
    let centre = crownPlanPoint(variant, spec.at);
    let parent: number, host = -1;
    if (spec.role === 'bough') {
      const from: GrowthPoint = [0, .14 + primaries.length * .050, 0];
      parent = addBranch(from, mix(from, centre, .76), .032, .012, leader, primaries.length % 5);
      primaries.push(parent);
    } else if (spec.role === 'inner') parent = leader;
    else if (spec.role === 'tuft') {
      // Grown in the host's own frame, so it stays inside it under every habit transform.
      host = spec.host!; parent = clumps[host].parent;
      const owner = clumps[host], out = spec.out!;
      centre = [0, 1, 2].map(axis => owner.centre[axis] + out[axis] * owner.radii[axis] * TUFT_OFFSET) as unknown as GrowthPoint;
    }
    else {
      // The nearest primary, measured in metres, feeds a twig into the mass.
      const target = crownMetres(variant, centre);
      let best = { distance: Infinity, branch: primaries[0], t: .5 };
      for (const branch of primaries) {
        const a = crownMetres(variant, branches[branch].from), b = crownMetres(variant, branches[branch].to);
        const axis = plus(b, times(a, -1)), length2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
        const offset = plus(target, times(a, -1));
        const t = Math.min(.9, Math.max(.3, (offset[0] * axis[0] + offset[1] * axis[1] + offset[2] * axis[2]) / length2));
        const distance = Math.hypot(...plus(target, times(mix(a, b, t), -1)));
        if (distance < best.distance) best = { distance, branch, t };
      }
      const root = mix(branches[best.branch].from, branches[best.branch].to, best.t);
      parent = addBranch(root, mix(root, centre, .84), .011, .0038, best.branch, branches[best.branch].mass);
    }
    // The body masses are finely shaped; the under masses and tufts are small
    // and nearer the eye only, so the coarse sphere is enough for them,
    // except in Full (Ultra). By role, so all habits share one topology.
    const fine = spec.role === 'inner' || spec.role === 'crest' || detail === 'ultra' && spec.role !== 'tuft';
    clumps.push({ centre, radii: radii(spec), parent, host, mass: host >= 0 ? clumps[host].mass : branches[parent].mass,
      levels: spec.levels, subdivisions: fine ? 2 : 1, tone: spec.tone, salt: variant * 97 + index * 13 + 5 });
  });
}

export function buildVegetationGrowthPlan(family: GrowthFamily, detail: GrowthDetail,
  variant: GrowthVariant): VegetationGrowthPlan {
  const branches: GrowthBranch[] = [], leaves: GrowthLeaf[] = [], clumps: GrowthClump[] = [];
  const plan: VegetationGrowthPlan = { family, detail, variant,
    branchSectors: detail === 'ultra' ? 8 : 6, leafSectors: detail === 'ultra' ? 8 : 6,
    leafSections: GROWTH_LEAF_SECTIONS, branches, leaves, clumps };
  const addBranch = (from: GrowthPoint, to: GrowthPoint, radiusFrom: number,
    radiusTo: number, parent: number, mass: number): number => {
    branches.push({ from, to, radiusFrom, radiusTo, parent, mass }); return branches.length - 1;
  };
  if (family === 'crown') {
    // Encloses the unchanged original trunk tip; the visible fork grows inside
    // the old crown envelope, never into a new physical footprint below it.
    const leader = addBranch([0, 0, 0], [0, .53, 0], .090, .034, -1, 4);
    branches[leader] = { ...branches[leader], sections: CROWN_LEADER_SECTIONS, sectors: detail === 'ultra' ? 8 : 6 };
    appendCrownMasses(plan, branches, clumps, leader, addBranch);
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
  for (const clump of clumps) {
    Object.freeze(clump.centre); Object.freeze(clump.radii); Object.freeze(clump);
  }
  return Object.freeze({ ...plan, branches: Object.freeze(branches), leaves: Object.freeze(leaves),
    clumps: Object.freeze(clumps) });
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
  const clumps = plan.clumps.filter(clump => (clump.levels & bit) !== 0);
  const clumpFaces = clumps.reduce((sum, clump) => sum + clumpTriangles(clump.subdivisions), 0);
  const triangles = branchTriangles + leaves * leafTriangles + clumpFaces;
  return Object.freeze({ branches: plan.branches.length, leaves, clumps: clumps.length,
    components: plan.branches.length + leaves + clumps.length, triangles, geometryBytes: triangles * 108 });
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
  for (const [index, clump] of plan.clumps.entries()) {
    const parent = plan.branches[clump.parent];
    if (![...clump.centre, ...clump.radii, clump.tone, clump.salt].every(Number.isFinite)
      || clump.radii.some(radius => radius <= 0) || !Number.isInteger(clump.subdivisions)
      || clump.subdivisions < 1 || clump.subdivisions > 2 || (clump.levels & 1) === 0
      || clump.parent < 0 || clump.parent >= plan.branches.length || parent === undefined) throw new Error('Detached vegetation mass');
    const inside = (point: GrowthPoint, owner: GrowthClump): number =>
      Math.hypot(...[0, 1, 2].map(axis => (point[axis] - owner.centre[axis]) / owner.radii[axis]));
    if (clump.host === -1 ? inside(parent.to, clump) > CLUMP_ROOT_DEPTH
      : !Number.isInteger(clump.host) || clump.host < 0 || clump.host >= index || plan.clumps[clump.host].host !== -1
        || plan.clumps[clump.host].parent !== clump.parent || inside(clump.centre, plan.clumps[clump.host]) > TUFT_HOST_DEPTH)
      throw new Error('Detached vegetation mass');
  }
}

