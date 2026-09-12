/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { PROP_FOOTPRINTS, PROP_SIZES, type PropKind } from '../data/props.ts';
import { CAMERA } from '../data/tuning.ts';
import type { MaterialId } from '../data/surfaces.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { positionHash01 } from '../shared/maths.ts';
import { PROP_CORRIDOR_CLEARANCE } from './buildPlan.ts';
import {
  centrelineAt,
  headingAt,
  leftOf,
  querySegment,
  type PlacedProp,
  type PlacedSegment,
  type SegmentBlock,
  type SegmentProp,
} from './segments.ts';

/**
 * Switchback Park's dressing, as arithmetic — M36 Phase 4.
 *
 * **A pure authoring helper, and nothing else.** It produces `PlacedProp`s,
 * `SegmentProp`s and `SegmentBlock`s from numbers; it builds no plan, samples
 * no heightfield and imports nothing from `render/`. `switchbackLevel.ts`
 * declares *what* the park is dressed with and hands the results to
 * `buildLevelPlan`; this file only decides where a rule puts them.
 *
 * ## Why a forest needs a rule rather than a list
 *
 * Phase 4's one hard constraint is that **no collision moves under art**
 * (§36.8). A tree is a solid and a shrub is a soft body
 * (`buildPlan.ts`/`PROP_SOLIDS`), so a forest is a physics change wherever it
 * lands — which means the interesting question is not "where do the trees look
 * good" but "which ground is provably not ridden, not landed on, not run out
 * onto and not looked through". That is a *predicate*, and a predicate is
 * something a test can re-derive and a reviewer can read. Six hundred hand
 * placed trees are neither.
 *
 * So the forest is a lattice with a deterministic hash over it (`DESIGN.md` §4
 * rule 3 — never `Math.random`, so the venue is identical on every boot), and
 * every candidate has to clear five separate bounds before it is kept:
 *
 *   1. **The trail.** A prop's own footprint must stand clear of every
 *      corridor's edge by `FOREST_CLEARANCE`, which is larger on the corridors
 *      that carry a feature, its approach, its landing or its run-out. The
 *      builder would cull a prop standing *in* a corridor
 *      (`buildPlan.standsOnCorridor`), but a cull is a silent loss and this
 *      venue's claim is that **nothing authored is dropped** — so the rule is
 *      applied here, with metres of margin, rather than left to the refusal.
 *   2. **The chase camera.** The arm reaches `CAMERA.distanceAtSpeed` behind
 *      the rider and pulls in around anything inside `CAMERA.obstructionRadius`,
 *      so dressing closer than their sum to the line a rider takes through a
 *      feature is dressing that swings the camera on the approach. Phase 2's
 *      signposts already stand off by exactly this figure
 *      (`parkSignage.ts`); `TRAIL_CAMERA_GAP` is the same number, spelled once.
 *   3. **The structures already on the hillside.** A signpost, a rail or a
 *      hillside block wins over foliage in `buildPlan.resolveStructuralConflicts`
 *      — quietly. Anything a venue has already placed is therefore handed in as
 *      an exclusion disc, so the forest yields to it *before* the builder has
 *      to.
 *   4. **The field.** A tree beyond the heightfield stands on the backstop
 *      plane, which is a plane rather than a hillside.
 *   5. **The venue's own sun.** Phase 4 fixed the park at a warm late
 *      afternoon, and a sun at `0.58 rad` throws 1.53 times a tree's height
 *      where daylight threw 0.70 — so a setback that cleared a landing at noon
 *      lays a conifer across it at five o'clock. Every technical corridor is
 *      therefore also kept out of the forest's shadow (`shadowClearance`),
 *      which is the one bound here that is a fact about the *light* rather than
 *      about the ground.
 *
 * ## Denser away from the trail
 *
 * §36.8 Phase 4 asks for a forest that thins to the corridor shoulders, which
 * is also what keeps a landing readable: the eye needs the ground the rider is
 * aiming at to be the emptiest thing in the frame. Two ramps do it, and they
 * point opposite ways on purpose — the canopy rises with distance from the
 * trail and the understorey falls with it, so the trail is edged with low soft
 * bodies and backed by a wall of conifer.
 */

// ---------------------------------------------------------------------------
// The bounds a prop has to clear
// ---------------------------------------------------------------------------

/**
 * How far behind and around the rider the chase camera needs to be empty, m.
 *
 * `parkSignage.ts` derives the identical figure for its posts and for the same
 * reason. It is written twice rather than exported once because the two files
 * answer different questions with it — a sign is *placed* at the bound, a tree
 * is *refused* inside it — and neither should be able to move the other's
 * geometry by editing its own.
 */
export const TRAIL_CAMERA_GAP = CAMERA.distanceAtSpeed + CAMERA.obstructionRadius;

/**
 * Least daylight between a prop's own footprint and a corridor's edge, metres.
 *
 * **The two technical figures are the camera bound, derived.** A prop that
 * stands `c` metres outside a corridor's edge is `halfWidth + c - technicalT`
 * metres from the line a rider takes through the feature on it, less its own
 * reach on both counts — so what the bound asks for is
 * `c >= technicalT + TRAIL_CAMERA_GAP - halfWidth`, and the venue's worst case
 * decides it. That worst case is the **fire road's crest**: half-width 6, the
 * narrowest corridor carrying a feature, with its technical line at 3.5. It
 * wants `3.5 + 6.35 - 6 = 3.85` m, so `understoreyTechnical` is 4 with 0.15 m
 * to spare, and every wider corridor clears by more. `canopyTechnical` is half
 * again on top of it, because a crown is four metres across and a shrub is one
 * — the thing that swings a chase camera is the canopy, not the bush under it.
 *
 * The two plain figures are a look rather than a bound: a corridor with no
 * feature on it has no technical line to keep off, and a trail with nothing
 * inside four metres of it reads as a road through a clearing. A shrub is a
 * soft body — it drags on the wheel instead of stopping it (M15) — which is
 * what lets the near band exist at all.
 *
 * `switchbackLevel.test.ts` re-derives all of it on the built plan: every prop,
 * against every landing, run-out and technical line the park has.
 */
export const FOREST_CLEARANCE = Object.freeze({
  /** A tree beside a feature, its approach, its landing or its run-out. */
  canopyTechnical: 6,
  /** A tree beside a corridor that is only trail. */
  canopy: 4,
  /** A shrub beside a feature corridor — the crest's own camera bound. */
  understoreyTechnical: 4,
  /** A shrub beside plain trail. */
  understorey: 2,
});

/**
 * How far a prop keeps off anything already standing on the hillside, metres.
 *
 * Added to both footprint radii, so it is daylight between them rather than
 * between their centres. One and a half metres is about a shrub's own width:
 * enough that a rail reads as a rail rather than as something growing out of a
 * bush, and enough that `resolveStructuralConflicts` never has to choose.
 */
export const FOREST_STRUCTURE_GAP = 1.5;

// ---------------------------------------------------------------------------
// The fifth bound: the shadow the venue's own sun throws
// ---------------------------------------------------------------------------

/**
 * A venue's sun, as the forest needs it — `VenueLook`'s two bearing fields.
 *
 * Handed in rather than imported, so this file stays a pure authoring helper
 * and the venue quotes its *own* descriptor exactly once
 * (`switchbackLevel.ts:SWITCHBACK_SUN`). A forest planted against one sun and
 * lit by another is the failure this shape exists to make impossible.
 */
export interface SunBearing {
  /** Compass bearing, radians from +Z toward +X — `VenueLook.sunAzimuth`. */
  readonly azimuth: number;
  /** Elevation above the horizon, radians — `VenueLook.sunElevation`. */
  readonly elevation: number;
}

/**
 * How many metres of shadow one metre of height throws — `1 / tan(elevation)`.
 *
 * The whole of the low sun's cost, in one number. Daylight's `0.96 rad` throws
 * **0.70 x height**; Switchback Park's fixed late afternoon at `0.58 rad`
 * throws **1.53 x**, so the same conifer that laid 6.9 m of shadow across the
 * hill at noon lays 15.1 m of it at five o'clock — and §36.8's landings are
 * 12 m wide.
 */
export function shadowPerMetre(sun: SunBearing): number {
  if (!(sun.elevation > 1e-3 && sun.elevation < Math.PI / 2)) {
    throw new Error(`a sun at ${sun.elevation} rad throws no usable shadow`);
  }
  return Math.cos(sun.elevation) / Math.sin(sun.elevation);
}

/**
 * Which way a shadow runs, as a unit vector in world XZ.
 *
 * **The renderer's own convention, transcribed**: `render/Renderer.ts` aims the
 * key light from `(sin(azimuth), _, cos(azimuth)) * distance`, so a shadow runs
 * the other way. At the park's `-1.75 rad` that is `(+0.984, +0.178)` — very
 * nearly due east, which is what a sun ten degrees south of west gives you.
 *
 * `shadowClearance` below does *not* use it — that bound is isotropic, and is
 * the cheap accept — but `shadowReaches` walks along it, and so does the
 * venue's own test: a test that recomputed the bearing itself could agree with
 * a forest that had been planted against a different one.
 */
export function shadowDirection(sun: SunBearing): { readonly x: number; readonly z: number } {
  return { x: -Math.sin(sun.azimuth), z: -Math.cos(sun.azimuth) };
}

/**
 * How tall each kind the forest plants stands at unit scale, metres.
 *
 * Read off `PROP_SIZES` rather than restated, so the kit and the shadow rule
 * cannot drift: a conifer is its topmost tier's apex, a broadleaf its crown's
 * top, a shrub its own squashed radius above its centre. These are the same
 * envelopes `render/foliageKit.ts` asserts both recipes' geometry inside, which
 * is what makes the rule recipe independent — the enhanced conifer is richer,
 * not taller, so it throws the same shadow.
 */
export const FOREST_HEIGHTS: Readonly<Record<'conifer' | 'broadleafTree' | 'shrub', number>> =
  Object.freeze({
    conifer: Math.max(...PROP_SIZES.conifer.tiers.map((tier) => tier.base + tier.height)),
    broadleafTree: PROP_SIZES.broadleafTree.crownCentre + PROP_SIZES.broadleafTree.crownHeight / 2,
    shrub: PROP_SIZES.shrub.centre + PROP_SIZES.shrub.radius * PROP_SIZES.shrub.scaleY,
  });

/**
 * How far above the corridor it might shade a prop's own base may stand, m.
 *
 * A tree on the bank above a trail shades further down it than its own height
 * says: what casts the shadow is the tree's top *above the surface receiving
 * it*, so the stand has to be carried in the bound. It is a constant rather
 * than a sample because the forest is authored before there is a heightfield to
 * sample — and a constant is testable, which a sample taken at authoring time
 * would not be. `switchbackLevel.test.ts` measures the finished field under
 * every kept prop against the corridor it could shade and fails if any of them
 * stands higher than this: the hillside beside a technical corridor reads
 * **1.25 m** at its steepest today, so 2.5 m is twice what the venue uses.
 */
export const FOREST_SHADOW_STAND = 2.5;

/**
 * How far away a prop of this kind and scale can throw a shadow at all, metres.
 *
 * The canopy setback re-derived under the venue's own sun, and the *isotropic*
 * form of it: no bearing, so it is true in every direction at once. That makes
 * it the one thing a reviewer has to believe — a prop further off a corridor
 * than this cannot shade it however the sun is turned — and it is how the rule
 * below accepts the overwhelming majority of the hillside without measuring
 * anything. §36.8's takeoffs, landings and catch grounds all lie inside a
 * corridor this file was already told is technical, so a shadow kept out of the
 * corridor is kept off the pad with the corridor's own half-width to spare.
 */
export function shadowClearance(kind: PropKind, scale: number, sun: SunBearing): number {
  const height = FOREST_HEIGHTS[kind as keyof typeof FOREST_HEIGHTS];
  if (height === undefined) throw new Error(`${kind} is not a kind the forest plants`);
  return (height * scale + FOREST_SHADOW_STAND) * shadowPerMetre(sun);
}

/**
 * How finely the shadow's own footprint is walked, metres.
 *
 * The footprint is the stadium a disc of the prop's reach sweeps from its trunk
 * to the tip of its shadow. Twenty centimetres against a smallest reach of
 * 0.95 m leaves a gap of `step^2 / (8 * reach)` — five millimetres — between
 * consecutive discs, which is three orders of magnitude inside every margin
 * this rule is judged by, and it is a *step* rather than a sphere trace because
 * `querySegment`'s `outside` is an arc length past a bend's end rather than a
 * true distance, and a trace may only step as far as a distance it can trust.
 */
const SHADOW_STEP = 0.2;

/**
 * Does this prop lay its shadow on this corridor?
 *
 * **The true footprint, not a proxy**, and the reason the rule is directional
 * where the bound above is not: on this hillside the isotropic clearance alone
 * refuses thirty-one props and the footprint refuses sixteen, and a forest
 * pays for those fifteen in the one place §36.8 wants trees — beside the
 * trail, where the density ramp has already thinned it. The venue
 * derives its sun from its own descriptor (`switchbackLevel.ts`), so a G3 ride
 * that turns the sun re-plants the hillside rather than invalidating it, and
 * every pinned count in `switchbackLevel.test.ts` moves loudly if it does.
 *
 * Two properties make the walk sound. A point that is *in* a corridor is always
 * inside that corridor's own bounds, so `querySegment`'s cheap reject can hide
 * an overlap from us only by hiding the corridor itself — which the caller has
 * already ruled out with the axis-aligned test. And the stand allowance is
 * inside `length`, so a tree on the bank above a trail is walked as the taller
 * thing it effectively is.
 */
function shadowReaches(
  segment: PlacedSegment,
  x: number,
  z: number,
  reach: number,
  length: number,
  direction: { readonly x: number; readonly z: number },
): boolean {
  // The shadow's own axis-aligned bounds, grown by the disc it sweeps. Every
  // corridor the shadow cannot possibly touch leaves here, which is all but one
  // or two of them and is what keeps this affordable at module load.
  const tipX = x + direction.x * length;
  const tipZ = z + direction.z * length;
  if (Math.min(x, tipX) - reach > segment.maxX) return false;
  if (Math.max(x, tipX) + reach < segment.minX) return false;
  if (Math.min(z, tipZ) - reach > segment.maxZ) return false;
  if (Math.max(z, tipZ) + reach < segment.minZ) return false;

  for (let travelled = 0; travelled <= length + 1e-9; travelled += SHADOW_STEP) {
    const query = querySegment(segment, x + direction.x * travelled, z + direction.z * travelled);
    if (query !== null && query.outside <= reach) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The forest
// ---------------------------------------------------------------------------

/** Something already on the ground that the forest yields to. */
export interface DressingExclusion {
  readonly x: number;
  readonly z: number;
  /** Radius of the thing itself; the gap is added by `plantForest`. */
  readonly radius: number;
}

/** The hillside the forest is planted on. */
export interface ForestSite {
  /** The lap, placed. Corridors are the only thing the forest keeps off. */
  readonly placed: readonly PlacedSegment[];
  /**
   * Which corridors carry a feature, its approach, its landing or its run-out.
   *
   * Named by the venue rather than derived from `spec.blocks`, because an
   * approach carries no block and is exactly the ground a camera swings on.
   */
  readonly technical: ReadonlySet<string>;
  /** Signposts, rails, benches and hillside blocks, in world XZ. */
  readonly exclusions: readonly DressingExclusion[];
  /**
   * The light the venue is ridden in, from its own `VenueLook`.
   *
   * Required rather than optional: a forest with no sun would be planted to
   * whatever the last venue's shadows happened to be, and the one thing a
   * silent default cannot do here is fail. See `shadowClearance`.
   */
  readonly sun: SunBearing;
  /** The drawn field. Nothing is planted outside it. */
  readonly bounds: {
    readonly minX: number; readonly maxX: number;
    readonly minZ: number; readonly maxZ: number;
  };
  /** Lattice pitch, metres. The one lever on how much forest there is. */
  readonly lattice: number;
  /** Inset from the field's own edge, metres. */
  readonly margin: number;
}

/**
 * The species mix, as the two cuts of one hash in [0, 1).
 *
 * Conifer dominant, which is §36.8's own word for it and is also the cheap
 * half of the kit: a conifer is one `coniferFoliage` instance and a broadleaf
 * is a `crown` plus a `trunk`, so a spruce costs 96 triangles against an oak's
 * 208 under the enhanced recipe. A forest that was half broadleaf would spend
 * the whole vegetation allocation on a third as many trees.
 */
const SPECIES = Object.freeze({ understorey: 0.26, conifer: 0.60 });

/** Scale range per kind: `[lowest, span]`, multiplying the kit's own size. */
const SCALE = Object.freeze({
  canopy: { from: 0.85, span: 0.40 },
  understorey: { from: 0.80, span: 0.60 },
});

/**
 * The two density ramps, as chances in [0, 1].
 *
 * `canopy` climbs from `near` at the clearance bound to `far` over `ramp`
 * metres; `understorey` is the mirror, a high near band that falls away to a
 * thin scatter past `band`. Both are read against an independent cut of the
 * same lattice hash, so a site that loses its species roll does not also lose
 * its keep roll and leave a visible lattice hole.
 */
const DENSITY = Object.freeze({
  canopyNear: 0.28,
  canopyFar: 0.95,
  canopyFrom: 6,
  canopyRamp: 26,
  understoreyBand: 22,
  understoreyNear: 0.90,
  understoreyFar: 0.22,
});

/** Hash salts. Distinct constants so two decisions cannot correlate. */
const SALT = Object.freeze({
  jitterX: 5, jitterZ: 9, species: 13, yaw: 17, scale: 23, keep: 29,
});

/**
 * How far outside every corridor a world point stands, metres.
 *
 * `Infinity` when the point is beyond every corridor's own bounds, which is
 * most of a 262 x 295 m field and is the cheap reject `querySegment` exists
 * for. The density ramps are written so that reads as "as far away as it gets".
 */
function outsideEverything(placed: readonly PlacedSegment[], x: number, z: number): number {
  let outside = Infinity;
  for (const segment of placed) {
    const query = querySegment(segment, x, z);
    if (query !== null && query.outside < outside) outside = query.outside;
  }
  return outside;
}

/** Whether a prop of this reach may stand here, against every bound above. */
function standsClear(
  site: ForestSite,
  kind: PropKind,
  x: number,
  z: number,
  reach: number,
  scale: number,
): boolean {
  const soft = kind === 'shrub';
  const shadow = shadowClearance(kind, scale, site.sun);
  const cast = shadowDirection(site.sun);
  for (const segment of site.placed) {
    const query = querySegment(segment, x, z);
    const technical = site.technical.has(segment.spec.id);
    if (query !== null) {
      const needed = soft
        ? (technical ? FOREST_CLEARANCE.understoreyTechnical : FOREST_CLEARANCE.understorey)
        : (technical ? FOREST_CLEARANCE.canopyTechnical : FOREST_CLEARANCE.canopy);
      if (query.outside - reach < needed) return false;
    }
    // **The shadow bound binds only where a rider commits.** A shadow lying
    // across the plain trail between the features is what a low sun through a
    // forest *is*; §36.8 asks for the landings to read, not for the hillside to
    // be shadowless. The isotropic clearance accepts almost every site without
    // measuring, and the few it cannot are walked. Note this runs whether or
    // not the trunk is inside the corridor's own bounds — a shadow is half as
    // long again as the shoulder those bounds stop at.
    if (!technical) continue;
    if (query !== null && query.outside - reach >= shadow) continue;
    if (shadowReaches(segment, x, z, reach, shadow, cast)) return false;
  }
  for (const exclusion of site.exclusions) {
    const gap = Math.hypot(x - exclusion.x, z - exclusion.z);
    if (gap < reach + exclusion.radius + FOREST_STRUCTURE_GAP) return false;
  }
  return true;
}

/** The chance a site of this kind at this distance keeps its prop. */
function keepChance(kind: PropKind, outside: number): number {
  if (kind === 'shrub') {
    return outside >= DENSITY.understoreyBand ? DENSITY.understoreyFar : DENSITY.understoreyNear;
  }
  const climbed = DENSITY.canopyNear
    + ((outside - DENSITY.canopyFrom) / DENSITY.canopyRamp) * (DENSITY.canopyFar - DENSITY.canopyNear);
  return Math.min(DENSITY.canopyFar, Math.max(DENSITY.canopyNear, climbed));
}

/**
 * Plant the hillside — the whole forest, as level-scope dressing.
 *
 * Level-scope rather than per-segment (`BuildOptions.props` rather than
 * `SegmentProp`) for BelVar's reason (`trackLevel.ts`): a forest belongs to the
 * *hill*, not to whichever switchback happens to point at it, and hanging it
 * off a corridor would move it whenever that corridor moved.
 *
 * Deterministic and total: the same lattice, the same hash and the same bounds
 * produce the same forest, and every prop it returns is one the builder will
 * keep. `switchbackLevel.test.ts` asserts that second half against a real
 * build, because a silently culled tree is a hole in a forest nobody notices.
 */
export function plantForest(site: ForestSite): PlacedProp[] {
  const out: PlacedProp[] = [];
  const { lattice, margin, bounds } = site;
  if (!(lattice > 0)) throw new Error(`the forest lattice must be positive, not ${lattice}`);

  const fromX = Math.ceil((bounds.minX + margin) / lattice) * lattice;
  const fromZ = Math.ceil((bounds.minZ + margin) / lattice) * lattice;

  for (let gx = fromX; gx <= bounds.maxX - margin; gx += lattice) {
    for (let gz = fromZ; gz <= bounds.maxZ - margin; gz += lattice) {
      // Jitter to nine tenths of the pitch, so two neighbours can close but
      // never swap places: a lattice that can reorder itself is a lattice
      // whose hash no longer predicts what grows where.
      const x = gx + (positionHash01(gx, gz, SALT.jitterX) - 0.5) * lattice * 0.9;
      const z = gz + (positionHash01(gx, gz, SALT.jitterZ) - 0.5) * lattice * 0.9;
      if (x < bounds.minX + margin || x > bounds.maxX - margin) continue;
      if (z < bounds.minZ + margin || z > bounds.maxZ - margin) continue;

      const roll = positionHash01(gx, gz, SALT.species);
      const kind: PropKind = roll < SPECIES.understorey
        ? 'shrub'
        : roll < SPECIES.understorey + SPECIES.conifer ? 'conifer' : 'broadleafTree';
      const range = kind === 'shrub' ? SCALE.understorey : SCALE.canopy;
      const scale = range.from + positionHash01(gx, gz, SALT.scale) * range.span;

      const footprint = PROP_FOOTPRINTS[kind];
      // Every kind the forest plants is round. Spelled as a check rather than
      // assumed, because a box-footprint kind would need its corners tested.
      if (footprint.shape !== 'circle') throw new Error(`${kind} is not a round prop`);
      const reach = footprint.radius * scale;
      if (!standsClear(site, kind, x, z, reach, scale)) continue;

      const outside = outsideEverything(site.placed, x, z);
      if (positionHash01(gx, gz, SALT.keep) > keepChance(kind, outside)) continue;

      out.push({
        kind,
        x,
        z,
        rotationY: positionHash01(gx, gz, SALT.yaw) * Math.PI * 2,
        scale,
        lift: 0,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// The hillside's own masonry and timber
// ---------------------------------------------------------------------------

/**
 * One run of blocks along the fill side of a benched corridor.
 *
 * **The fill side is authored, not measured, and that is deliberate.** Which
 * shoulder a trail was cut into and which one it was built out over is a fact
 * about the hill, and a builder that decided it by sampling would quietly move
 * a whole run to the other side of the trail the first time a corridor's grade
 * changed. `switchbackLevel.test.ts` measures the ground on both sides and
 * fails if an authored side is the uphill one.
 */
export interface HillsideSpan {
  readonly segment: string;
  /** Metres along the corridor. The first block sits at `fromS`. */
  readonly fromS: number;
  readonly toS: number;
  /** Distance between blocks along the corridor, metres. */
  readonly pitch: number;
  /** `+1` for the rider's left, `-1` for the right. */
  readonly side: 1 | -1;
  readonly surface: SurfaceId;
  readonly appearance: MaterialId;
}

/**
 * How far outside a corridor's edge the hillside blocks stand, metres.
 *
 * **The camera bound again, and this time it is what decides the number.** Four
 * metres puts a block `halfWidth + 4 - technicalT` from the line a rider takes
 * through a feature, and the tightest corridor on the venue that carries one is
 * the fire road's crest — half-width 6, technical line 3.5, so `6 + 4 - 3.5 =
 * 6.5` m against `TRAIL_CAMERA_GAP`'s 6.35. Every other feature corridor is
 * wider, its line is no further out, and clears by more.
 *
 * It is also as close as the run may usefully get. The corridor's own cross
 * section decides a block's top face, and the finished ground drops away from
 * the corridor across the twelve-metre shoulder — so the further out a block
 * stands, the taller it stands, and past about six metres a low outcrop has
 * become a wall beside the trail.
 */
export const HILLSIDE_OFFSET = 4;

/**
 * Half-length along the corridor and half-width across it, metres.
 *
 * A 2.6 x 1.8 m footprint: big enough to read as masonry rather than as a
 * kerbstone from the chase camera's six metres, small enough that its own
 * half-diagonal (1.58 m) still leaves daylight where a run passes the nearest
 * neighbouring corridor on this venue.
 */
export const HILLSIDE_HALF = Object.freeze({ along: 1.3, lateral: 0.9 });

/**
 * How far a block's top face stands above the corridor beside it, metres.
 *
 * Measured on the finished field it reads as 0.2 to 1.3 m of masonry or timber
 * standing out of the bank, because the bank itself has already fallen away by
 * the time it reaches the run. `switchbackLevel.test.ts` pins that band: under
 * it and the run is buried, over it and the trail is walled.
 */
export const HILLSIDE_STAND = 0.40;

/**
 * Turn the declared runs into blocks, keyed by the corridor that carries them.
 *
 * Twelve triangles each and no new draw call — `wood` and `stone` are already
 * two of the four block materials this venue merges (§36.7's "decks, treads,
 * supports and rock faces as existing merged wood/stone geometry"). The decks
 * themselves need no supports: `settleBlocks` already grows every feature block
 * a foundation down to the lowest ground under it, so a deck is a plinth rather
 * than a platform on posts and a post under it would be geometry nobody can
 * see. What the hillside *does* want is what a benched trail actually has — the
 * cribbing and riprap holding up its fill side — and that is what this is.
 */
export function hillsideBlocks(
  spans: readonly HillsideSpan[],
  halfWidthOf: (segment: string) => number,
): Map<string, SegmentBlock[]> {
  const out = new Map<string, SegmentBlock[]>();
  for (const span of spans) {
    if (!(span.pitch > 0)) throw new Error(`${span.segment}'s run has no pitch`);
    if (span.toS < span.fromS) throw new Error(`${span.segment}'s run ends before it starts`);
    const t = span.side * (halfWidthOf(span.segment) + HILLSIDE_OFFSET);
    const list = out.get(span.segment) ?? [];
    // `+ 1e-9` so a run whose length is an exact multiple of its pitch keeps
    // its last block rather than losing it to the last bit of a double.
    for (let s = span.fromS; s <= span.toS + 1e-9; s += span.pitch) {
      list.push({
        s,
        t,
        halfAlong: HILLSIDE_HALF.along,
        halfLateral: HILLSIDE_HALF.lateral,
        height: HILLSIDE_STAND,
        surface: span.surface,
        appearance: span.appearance,
      });
    }
    out.set(span.segment, list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The landmarks
// ---------------------------------------------------------------------------

/**
 * One run of trail rail, as a corridor-frame span.
 *
 * A rail is the one piece of furniture that says *the trail turns here* from
 * far enough back to matter, which is what §36.8 Phase 4 means by a useful
 * landmark at a decision point. It is made of bays so nothing is stretched
 * (`data/props.ts`), and the bays are laid along the corridor's own heading, so
 * a rail round a hairpin is a rail round a hairpin rather than a chord across
 * it.
 */
export interface RailRun {
  readonly segment: string;
  readonly fromS: number;
  readonly toS: number;
  /** Lateral offset of the rail, in the corridor's own frame. */
  readonly t: number;
}

/**
 * A bay's own length along its run, metres — `PROP_SIZES.fenceBay.length`.
 *
 * Exported for `parkFencing.ts`, whose refusal floor *is* one bay: an arc
 * tighter than the rigid chord standing in for it is an arc no run can follow.
 */
export const BAY_LENGTH = PROP_FOOTPRINTS.fenceBay.shape === 'box'
  ? PROP_FOOTPRINTS.fenceBay.halfZ * 2
  : 2.4;

/**
 * The least a run's pitch correction may shrink to before it is guarded.
 *
 * A guard against a division rather than a taste, and it has to stay clear of
 * what the venue actually asks for: the correction below is `1 - k * t`, which
 * is the offset path's length per metre of centreline, and it goes to zero as
 * an inner run approaches a bend's own centre of curvature. Switchback Park's
 * inner fencing (`parkFencing.ts`) reads **0.193** on its tightest arc — the
 * clearing hairpin, R15 fenced at 12.10 m — so a floor of a fifth would have
 * been the thing choosing that run's pitch rather than the geometry. A
 * twentieth leaves that run clear of the guard by a factor of four, and every
 * outer run on the venue reads more than one.
 */
const MIN_RUN_STRETCH = 0.05;

/**
 * Lay a rail run out as bays, keyed by the corridor that carries them.
 *
 * The pitch is corrected for the offset: a bay at `t` on a bend of curvature
 * `k` travels `1 - k * t` metres of centreline for every metre of its own run,
 * so a rail on the outside of a 16 m hairpin would leave a gap in every bay if
 * it were pitched by centreline distance. The same arithmetic run the other way
 * is what lets a fence follow the *inside* of one: there the correction is well
 * under one, and the bays are pitched several metres of centreline apart to
 * stand 2.4 m apart on their own much shorter arc. `yaw` is left at zero, which
 * is what puts a bay's own length along the corridor (`propsOf` composes it
 * onto the corridor's heading).
 */
export function railProps(
  runs: readonly RailRun[],
  curvatureOfSegment: (segment: string) => number,
): Map<string, SegmentProp[]> {
  const out = new Map<string, SegmentProp[]>();
  for (const run of runs) {
    const curvature = curvatureOfSegment(run.segment);
    // Positive `t` is the rider's left; a left-hand bend curves toward it, so
    // the outside of the bend is the longer arc and the inside the shorter.
    const stretch = Math.max(MIN_RUN_STRETCH, 1 - curvature * run.t);
    const pitch = BAY_LENGTH / stretch;
    const list = out.get(run.segment) ?? [];
    for (let s = run.fromS; s <= run.toS + 1e-9; s += pitch) {
      list.push({ s, t: run.t, kind: 'fenceBay' });
    }
    out.set(run.segment, list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// What the forest has to yield to
// ---------------------------------------------------------------------------

/**
 * Every segment-authored prop on the venue, in world XZ, as an exclusion.
 *
 * Read off the placed chain rather than off the authoring, so a landmark added
 * anywhere — signage, rail, bench — is one the forest already keeps clear of
 * without anybody remembering to list it twice.
 */
export function propExclusions(placed: readonly PlacedSegment[]): DressingExclusion[] {
  const out: DressingExclusion[] = [];
  for (const segment of placed) {
    for (const prop of segment.spec.props ?? []) {
      const centre = centrelineAt(segment.entry, segment.spec, prop.s);
      const left = leftOf(headingAt(segment.entry, segment.spec, prop.s));
      const footprint = PROP_FOOTPRINTS[prop.kind];
      const radius = footprint.shape === 'circle'
        ? footprint.radius
        : Math.hypot(footprint.halfX, footprint.halfZ);
      out.push({
        x: centre.x + left.x * prop.t,
        z: centre.z + left.z * prop.t,
        radius: radius * (prop.scale ?? 1),
      });
    }
  }
  return out;
}

/**
 * Every segment-authored block on the venue, in world XZ, as an exclusion.
 *
 * A block is a collider and `buildPlan` culls any prop standing inside one, so
 * the hillside's own masonry has to be kept clear of the forest the same way
 * the rails are. The radius is the block's half-diagonal, which over-reserves
 * at the flats by a fifth of a metre and never under-reserves at a corner.
 */
export function blockExclusions(placed: readonly PlacedSegment[]): DressingExclusion[] {
  const out: DressingExclusion[] = [];
  for (const segment of placed) {
    for (const block of segment.spec.blocks ?? []) {
      const centre = centrelineAt(segment.entry, segment.spec, block.s);
      const left = leftOf(headingAt(segment.entry, segment.spec, block.s));
      out.push({
        x: centre.x + left.x * block.t,
        z: centre.z + left.z * block.t,
        radius: Math.hypot(block.halfAlong, block.halfLateral),
      });
    }
  }
  return out;
}

/**
 * The least daylight between a prop's footprint and a corridor's edge, metres.
 *
 * The measurement half of rule 1, exported so `switchbackLevel.test.ts` can
 * hold the built plan to the same arithmetic the authoring used instead of
 * restating it. Negative means the prop is standing in the road, which is what
 * `PROP_CORRIDOR_CLEARANCE` is the builder's own bound on.
 */
export function clearanceOf(
  placed: readonly PlacedSegment[],
  prop: { readonly kind: PropKind; readonly x: number; readonly z: number; readonly scale: number },
): number {
  const footprint = PROP_FOOTPRINTS[prop.kind];
  const reach = (footprint.shape === 'circle'
    ? footprint.radius
    : Math.hypot(footprint.halfX, footprint.halfZ)) * prop.scale;
  return outsideEverything(placed, prop.x, prop.z) - reach;
}

/** The builder's own floor, re-exported so a venue test can name it once. */
export const FOREST_BUILDER_FLOOR = PROP_CORRIDOR_CLEARANCE;
