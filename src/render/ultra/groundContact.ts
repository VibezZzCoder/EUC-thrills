/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Ground grounding data (T5, T6) — M39 (`docs/M39_ULTRA.md` §4, package W6;
 * the edge field revised in the pre-R1 ground pass, §U2 "Pre-R1 ground (G)").
 *
 * Two pure functions of an immutable plan, sampled by `render/terrain.ts` at
 * **cell-corner world positions** so the four cells meeting at a corner agree:
 *
 * - `contactOcclusion` — analytic contact AO from `plan.props` and the
 *   authored colliders through a spatial hash: the product of each occluder's
 *   term (`ULTRA.contact`), darken-only and clamped at `ULTRA.contact.floor`.
 *   Applied to indirect light only by default, so the sunlit road cannot
 *   darken (§3.3).
 * - `edgeFillFor` — the fill-only edge field: straight band boundaries at any
 *   angle. Where an outranking surface (`ULTRA_EDGE_RANKS`) meets a lower one
 *   along a stair-stepped boundary, the lower surface's cells take up to two
 *   half-planes of the higher one's colour, drawn per fragment from a
 *   per-vertex signed distance; a band never loses a cell, and every filled
 *   point stays within `edgeCapCells` of the band (½ cell into a drivable
 *   cell, A12). Spill, wood and hazard cells never take part.
 * - `riderContactOccluders` — the dynamic contact (A9, A15): the rider's
 *   wheel and body, and the cop's, as elliptical slots (the body's along the
 *   sun) the runtime writes into the shared uniforms every solo frame;
 *   `dynamicContactAt` is the ground patch's product in plain arithmetic.
 *   The edge field's drivable knees are drawn rounded (A18,
 *   `edgeRoundedDistance`).
 *
 * Nothing here draws. The terrain turns both answers into vertex attributes
 * (`ULTRA_GROUND_ATTRIBUTES`) and the ground patches shade from them (the
 * shared one in `ultraMaterials.ts` for the AO, the ground's own in
 * `ultraGroundDetail.ts` for the edge); the attribute contract is written down
 * at the bottom of this file, in one place.
 *
 * **Why analytic, and why per corner.** The rejected alternatives are in §0.3:
 * a screen-space AO multiplied onto the canvas halos the rider and darkens
 * the road, and a per-*cell* multiplier draws the one-metre staircase this
 * file's other half exists to remove. A term evaluated at the heightfield's
 * shared sample points and interpolated across each cell is smooth by
 * construction, costs no pass, and is identical for the four unshared
 * vertices that sit on one corner because they ask the identical question.
 *
 * **What the edge field can and cannot do.** The surface grid is the ride's
 * truth — grip, rolling resistance, the rider's wobble — and it is one metre
 * square (1.5 m at Switchback). A band drawn from that grid at any angle but
 * a right one is a staircase (defect D3). The field never changes a cell's
 * surface; it paints the outranking neighbour's colour into the *notches* of
 * that staircase, up to the straight line through the band's own convex
 * corners, so the band only ever grows and the boundary is a line again. The
 * geometry of a notch and why a line there is straight at every slope is on
 * `edgeFillFor`.
 *
 * Pure arithmetic on plain plan data: no DOM, no three, headless-importable.
 */
import { PROP_FOOTPRINTS, PROP_SIZES, PROP_VERTICAL_SPANS, type PropKind } from '../../data/props.ts';
import { ULTRA } from '../../data/tuning.ts';
import { fieldHeightAt, planColliders } from '../../level/buildPlan.ts';
import type { LevelPlan, Prop } from '../../level/plan.ts';
import type { TerrainCells } from '../../level/terrainCoverage.ts';
import type { SurfaceId } from '../../simulation/world.ts';
import {
  edgeCapCells,
  ULTRA_CONTACT_FLOATS,
  ULTRA_CONTACT_SHADE_FLOATS,
  ULTRA_CONTACT_SLOTS,
  ULTRA_GROUND,
  ULTRA_GROUND_EDGE_ATTRIBUTES,
} from './ultraGroundDetail.ts';
import type { UltraKit } from './ultraTypes.ts';
import {
  edgeFillForGrid,
  edgeRoundedDistance as boundaryRoundedDistance,
  edgeCovers as boundaryCovers,
  type EdgeFillCell,
  type EdgeFillField,
} from '../groundBoundary.ts';
import { groundBoundaryPolicy, groundDrivableCapCells, groundHazardMask } from '../groundBoundaryPolicy.ts';

// ---------------------------------------------------------------------------
// Contact AO (T5)
// ---------------------------------------------------------------------------

/**
 * One occluder: a footprint in world XZ, how far its darkening reaches beyond
 * that footprint, how strong it is at contact, and the vertical span it
 * stands in.
 *
 * The footprint is either a circle (`round`, radius `halfX`) or a yawed box,
 * yawed on `appendBox`'s convention (local +X maps to (cos, −sin) in world
 * XZ). A wall's band depends on how tall it stands above the ground being
 * asked about (`min(bandMax, share × height)`), so a kerb reaches centimetres
 * and a frontage wall reaches its full 1.2 m; every other class carries a fixed
 * band.
 */
interface Occluder {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly cos: number;
  readonly sin: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly round: boolean;
  /**
   * `contact` darkens hardest at the footprint and eases out across the band;
   * `disc` (a canopy's sky occlusion) holds its strength across the inner half
   * of the band and eases out over the outer half — a crown shades the sky
   * over the whole of its spread, not a cone under its trunk.
   */
  readonly profile: 'contact' | 'disc';
  /** Fixed band, metres; `NaN` for a wall, whose band follows its height. */
  readonly band: number;
  readonly strength: number;
  /** World Y of the occluder's foot and top. */
  readonly bottom: number;
  readonly top: number;
  /** Reach of the darkening in XZ from the centre, for the spatial hash. */
  readonly reach: number;
}

/**
 * How far below an occluder's foot the ground may lie and still be touched by
 * it, metres. A frontage wall on the city shelf must not darken the valley
 * floor six metres below it, and a tree on a hill must not ground the road in
 * the cutting under it; a metre covers every sunk kerb and plinth in the
 * authored worlds without letting either of those through.
 */
const BELOW_FOOT_METRES = 1.0;

/** Spatial-hash bucket edge, metres. A few occluders a bucket in the town. */
const BUCKET_METRES = 4;

/**
 * Stratum edge of the box prefilter, metres: four samples a side on the
 * one-metre heightfield, eight (the cap) on the eight-metre field. A quarter
 * metre resolves the narrowest band in the table (a fence's 0.35 m) without
 * spending the field's sixty-four samples on the heightfield's million.
 */
const CONTACT_STRATUM_METRES = 0.25;

/** The fixed-band `ULTRA.contact` classes a prop can ground as. */
type ContactClass = 'building' | 'trunk' | 'shrub' | 'tyre' | 'fence' | 'furniture';

/**
 * Every prop kind's contact, as the §4 occluder table states it. A broadleaf
 * tree is two occluders — its trunk and its canopy's sky occlusion — and a
 * conifer's foliage reaches the ground, so it grounds as undergrowth does.
 * Bollard caps and the gantry span stand on colliders, which ground them.
 */
const PROP_CONTACT: Readonly<Record<PropKind, readonly ('canopy' | ContactClass)[]>> =
  Object.freeze({
    broadleafTree: ['trunk', 'canopy'],
    treeCanopy: ['canopy'],
    conifer: ['shrub'],
    shrub: ['shrub'],
    lampPost: ['furniture'],
    bench: ['furniture'],
    litterBin: ['furniture'],
    bollardCap: [],
    signpost: ['furniture'],
    fenceBay: ['fence'],
    building: ['building'],
    tyreStack: ['tyre'],
    gantrySpan: [],
  });

/** The prop's vertical envelope in world Y, as `buildPlan`'s own range rule states it. */
function propSpan(prop: Prop): { bottom: number; top: number } {
  if (prop.kind === 'building') {
    return { bottom: prop.position.y, top: prop.position.y + (prop.size?.y ?? 1) * prop.scale };
  }
  const span = PROP_VERTICAL_SPANS[prop.kind];
  return {
    bottom: prop.position.y + Math.min(0, span.bottom * prop.scale),
    top: prop.position.y + span.top * prop.scale,
  };
}

function propOccluders(prop: Prop, first: number): Occluder[] {
  const out: Occluder[] = [];
  const { bottom, top } = propSpan(prop);
  const cos = Math.cos(prop.rotationY);
  const sin = Math.sin(prop.rotationY);
  for (const kind of PROP_CONTACT[prop.kind]) {
    let halfX: number;
    let halfZ: number;
    let round: boolean;
    let band: number;
    let strength: number;
    if (kind === 'canopy') {
      // Sky occlusion under the crown: a disc about the trunk axis that holds
      // its strength over the inner half of the crown's spread and fades to
      // nothing at its rim (the `disc` profile).
      halfX = 0;
      halfZ = 0;
      round = true;
      band = ULTRA.contact.crown.band * prop.scale;
      strength = ULTRA.contact.crown.strength;
    } else {
      const footprint = kind === 'trunk'
        ? { shape: 'circle' as const, radius: PROP_SIZES.broadleafTree.trunkRadiusBase }
        : prop.kind === 'signpost'
          // The signpost's footprint is the plates' clearance, not what
          // meets the ground; its pole is what stands there.
          ? { shape: 'circle' as const, radius: PROP_SIZES.signpost.postRadius }
          : PROP_FOOTPRINTS[prop.kind];
      if (footprint.shape === 'circle') {
        halfX = footprint.radius * prop.scale;
        halfZ = halfX;
        round = true;
      } else {
        halfX = (prop.size?.x ?? footprint.halfX * 2) * prop.scale / 2;
        halfZ = (prop.size?.z ?? footprint.halfZ * 2) * prop.scale / 2;
        round = false;
      }
      band = ULTRA.contact[kind].band;
      strength = ULTRA.contact[kind].strength;
    }
    out.push({
      index: first + out.length,
      x: prop.position.x,
      z: prop.position.z,
      cos,
      sin,
      halfX,
      halfZ,
      round,
      profile: kind === 'canopy' ? 'disc' : 'contact',
      band,
      strength,
      bottom,
      top,
      reach: Math.hypot(halfX, halfZ) + band,
    });
  }
  return out;
}

/** Every occluder in a plan, in a fixed order: props as authored, then colliders. */
function collectOccluders(plan: LevelPlan): Occluder[] {
  const occluders: Occluder[] = [];
  for (const prop of plan.props ?? []) occluders.push(...propOccluders(prop, occluders.length));
  for (const box of planColliders(plan)) {
    occluders.push({
      index: occluders.length,
      x: box.centre.x,
      z: box.centre.z,
      cos: Math.cos(box.rotationY),
      sin: Math.sin(box.rotationY),
      halfX: box.halfExtents.x,
      halfZ: box.halfExtents.z,
      round: false,
      profile: 'contact',
      band: Number.NaN,
      strength: ULTRA.contact.wall.strength,
      bottom: box.centre.y - box.halfExtents.y,
      top: box.centre.y + box.halfExtents.y,
      reach: Math.hypot(box.halfExtents.x, box.halfExtents.z) + ULTRA.contact.wall.bandMax,
    });
  }
  return occluders;
}

/** Distance in XZ from a point to the occluder's footprint; 0 on or inside it. */
function footprintDistance(occluder: Occluder, x: number, z: number): number {
  const dx = x - occluder.x;
  const dz = z - occluder.z;
  if (occluder.round) return Math.max(0, Math.hypot(dx, dz) - occluder.halfX);
  // Inverse of the yaw: local x = cos·dx − sin·dz, local z = sin·dx + cos·dz.
  const lx = occluder.cos * dx - occluder.sin * dz;
  const lz = occluder.sin * dx + occluder.cos * dz;
  return Math.hypot(Math.max(0, Math.abs(lx) - occluder.halfX), Math.max(0, Math.abs(lz) - occluder.halfZ));
}

/**
 * One occluder's multiplier at a point whose ground stands at `ground`:
 * `1 − strength · shoulder(d/band)` inside the band, 1 beyond it and 1 for an
 * occluder that does not stand on this ground at all. A contact's shoulder is
 * `(1 − t)²` and a disc's `1 − smoothstep(½, 1, t)`; both reach zero with zero
 * slope at the band's edge — a linear ramp draws the band's outline as a
 * crease, which is the halo the gauntlet is told to hunt for.
 */
function occluderTerm(occluder: Occluder, x: number, z: number, ground: number): number {
  if (ground > occluder.top || ground < occluder.bottom - BELOW_FOOT_METRES) return 1;
  const band = Number.isNaN(occluder.band)
    ? Math.min(ULTRA.contact.wall.bandMax, ULTRA.contact.wall.bandHeightShare * (occluder.top - ground))
    : occluder.band;
  if (!(band > 0)) return 1;
  const t = footprintDistance(occluder, x, z) / band;
  if (t >= 1) return 1;
  if (occluder.profile === 'disc') {
    const rim = t <= 0.5 ? 0 : (t - 0.5) * 2;
    return 1 - occluder.strength * (1 - rim * rim * (3 - 2 * rim));
  }
  const shoulder = 1 - t;
  return 1 - occluder.strength * shoulder * shoulder;
}

/**
 * The contact-AO field of one plan.
 *
 * `(x, z)` in world metres → a multiplier in `[ULTRA.contact.floor, 1]`: the
 * product of every occluder's term, clamped at the floor. With a `footprint`
 * (metres) the answer is the mean of that product over an `n × n` stratified
 * grid covering the square of that side centred on the point — a box
 * prefilter, so a vertex speaks for the ground it will be interpolated across
 * rather than for the one point it stands on. Without it a 0.35 m fence band
 * between two one-metre corners would ground nothing, and a 2.45 m canopy disc
 * on the eight-metre field would land on a vertex or miss every one depending
 * on where the tree happened to stand.
 *
 * Deterministic and order-independent: the candidates are combined in
 * occluder-index order whatever buckets they came from, so a query repeated
 * with the same arguments — which is what the four vertices on one shared
 * corner make — returns the same bits.
 */
export type ContactField = (x: number, z: number, footprint?: number) => number;

export function contactOcclusion(plan: LevelPlan): ContactField {
  const occluders = collectOccluders(plan);
  const buckets = new Map<number, Occluder[]>();
  const keyOf = (bx: number, bz: number): number => (bx + 32768) * 65536 + (bz + 32768);
  for (const occluder of occluders) {
    const x0 = Math.floor((occluder.x - occluder.reach) / BUCKET_METRES);
    const x1 = Math.floor((occluder.x + occluder.reach) / BUCKET_METRES);
    const z0 = Math.floor((occluder.z - occluder.reach) / BUCKET_METRES);
    const z1 = Math.floor((occluder.z + occluder.reach) / BUCKET_METRES);
    for (let bx = x0; bx <= x1; bx += 1) {
      for (let bz = z0; bz <= z1; bz += 1) {
        const key = keyOf(bx, bz);
        const list = buckets.get(key);
        if (list === undefined) buckets.set(key, [occluder]);
        else list.push(occluder);
      }
    }
  }

  const floor = ULTRA.contact.floor;
  const seen = new Uint32Array(occluders.length);
  let stamp = 0;

  /** Occluders whose reach touches the square `[x0, x1] × [z0, z1]`, in index order. */
  const candidates = (x0: number, z0: number, x1: number, z1: number): Occluder[] => {
    stamp += 1;
    const found: Occluder[] = [];
    const bx1 = Math.floor(x1 / BUCKET_METRES);
    const bz1 = Math.floor(z1 / BUCKET_METRES);
    for (let bx = Math.floor(x0 / BUCKET_METRES); bx <= bx1; bx += 1) {
      for (let bz = Math.floor(z0 / BUCKET_METRES); bz <= bz1; bz += 1) {
        const list = buckets.get(keyOf(bx, bz));
        if (list === undefined) continue;
        for (const occluder of list) {
          if (seen[occluder.index] === stamp) continue;
          seen[occluder.index] = stamp;
          found.push(occluder);
        }
      }
    }
    found.sort((a, b) => a.index - b.index);
    return found;
  };

  const productAt = (near: readonly Occluder[], x: number, z: number, ground: number): number => {
    let product = 1;
    for (const occluder of near) product *= occluderTerm(occluder, x, z, ground);
    return product < floor ? floor : product;
  };

  return (x: number, z: number, footprint = 0): number => {
    const half = footprint > 0 ? footprint / 2 : 0;
    const near = candidates(x - half, z - half, x + half, z + half);
    if (near.length === 0) return 1;
    // The ground the vertex stands on. One height for the whole footprint:
    // the vertical gate is a metre-scale question and the footprint is the
    // cell the vertex is interpolated across.
    const ground = fieldHeightAt(plan.heightfield, plan.surround, x, z);
    if (half === 0) return productAt(near, x, z, ground);
    const n = Math.min(8, Math.max(2, Math.ceil(footprint / CONTACT_STRATUM_METRES)));
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const sx = x + ((i + 0.5) / n - 0.5) * footprint;
      for (let j = 0; j < n; j += 1) {
        sum += productAt(near, sx, z + ((j + 0.5) / n - 0.5) * footprint, ground);
      }
    }
    const mean = sum / (n * n);
    return mean > 1 ? 1 : mean;
  };
}

// ---------------------------------------------------------------------------
// Dynamic contact (A9): the rider and the cop
// ---------------------------------------------------------------------------

/** A world point, as the runtime reads it off a rig. */
export interface ContactPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One rider rig's contact, this frame: its wheel's ground contact and (when found) its pelvis. */
export interface RiderContact {
  readonly wheel: ContactPoint;
  readonly pelvis: ContactPoint | null;
}

/**
 * `1 − smoothstep(a, b, h)`: full at or below `a`, gone at or above `b`. The
 * pair is read by index, not destructured — array destructuring runs the
 * iterator protocol, and this is called every solo frame (Fable F7).
 */
function liftFade(height: number, range: readonly [number, number] | readonly number[]): number {
  const a = range[0];
  const b = range[1];
  if (height <= a) return 1;
  if (height >= b) return 0;
  const t = (height - a) / (b - a);
  return 1 - t * t * (3 - 2 * t);
}

/** A unit direction on the ground (world XZ). */
export interface GroundDirection {
  readonly x: number;
  readonly z: number;
}

/**
 * The ground azimuth *away* from the sun (where a shadow points) from the
 * sun's offset (target → sun, any length), or null when the sun stands so
 * near the zenith that no direction is meaningful — then the body pool is
 * round.
 *
 * `out` (Fable F7): the runtime calls this every solo frame, so it passes
 * one preallocated direction to be filled and returned — nothing allocates.
 * Without one, a fresh object is returned (tests, one-off callers).
 */
export function downSunOf(sunOffset: ContactPoint, out?: { x: number; z: number }): GroundDirection | null {
  const length = Math.hypot(sunOffset.x, sunOffset.y, sunOffset.z);
  const ground = Math.hypot(sunOffset.x, sunOffset.z);
  if (!(length > 0) || ground < 0.05 * length) return null;
  const target = out ?? { x: 0, z: 0 };
  target.x = -sunOffset.x / ground;
  target.z = -sunOffset.z / ground;
  return target;
}

/**
 * Write one contact slot into the runtime's packed arrays (Fable F7: a
 * module-level writer, not a closure made every frame): the **sun shape**
 * `(x, z, radiusAlong, strength)` then `(axisX, axisZ, radiusAcross,
 * sunShare)` into `out`, and (A28) the **shade shape** `(x, z, radius,
 * strength)` into `shadeOut` when one is given. Returns the next free slot —
 * the same one when the slot table is full or both strengths are nothing, so
 * nothing is written.
 */
function writeContactSlot(
  out: Float32Array,
  slot: number,
  x: number,
  z: number,
  along: number,
  strength: number,
  ax: number,
  az: number,
  across: number,
  sunShare: number,
  shadeOut: Float32Array | null,
  shadeX: number,
  shadeZ: number,
  shadeRadius: number,
  shadeStrength: number,
): number {
  if (slot >= ULTRA_CONTACT_SLOTS || !(strength > 0 || shadeStrength > 0)) return slot;
  const at = slot * ULTRA_CONTACT_FLOATS;
  out[at] = x;
  out[at + 1] = z;
  out[at + 2] = along;
  out[at + 3] = strength > 0 ? strength : 0;
  out[at + 4] = ax;
  out[at + 5] = az;
  out[at + 6] = across;
  out[at + 7] = sunShare;
  if (shadeOut !== null) {
    const shade = slot * ULTRA_CONTACT_SHADE_FLOATS;
    shadeOut[shade] = shadeX;
    shadeOut[shade + 1] = shadeZ;
    shadeOut[shade + 2] = shadeRadius;
    shadeOut[shade + 3] = shadeStrength > 0 ? shadeStrength : 0;
  }
  return slot + 1;
}

/**
 * The dynamic contact occluders of this frame (coordinator amendment A9):
 * for each rider — the player's rig, then the cop's when he is out — one
 * occluder round the wheel's contact and one under the body
 * (`ULTRA.contact.riders`), packed into `out` as `ULTRA_CONTACT_FLOATS`
 * floats a slot (`ULTRA_CONTACT_SLOTS` slots): `(x, z, radiusAlong,
 * strength)` then `(axisX, axisZ, radiusAcross, sunShare)`, the axis a unit
 * ground direction and `sunShare` the share of the strength the pool keeps
 * where no static (building or tree) shade lies (each pool's `sunShare`),
 * because in sun the rider's own cast shadow already
 * grounds him and a full body pool over it only deepened it (Wave 4: the
 * rider's shadow fell to 0.17–0.21 × the sunlit road against High's
 * 0.26–0.31). Returns how many slots it wrote; the rest are left as they were
 * and never read.
 *
 * **The wheel's pool is round; the body's is the rider's shade** (A15,
 * round-2 item 1c): given the down-sun direction (`downSunOf`), it is
 * stretched `stretch` × its radius along it and `across` × across it, its
 * centre `downSunMetres` down-sun of the pelvis, so a rider riding from sun
 * into shade keeps a pool pointing the way his shadow did. Without one it
 * stays round.
 *
 * **In static shade the pool is his contact, not his shade** (A28, Trade 1;
 * Codex's post-GU QA and five of five round-4 critics: "a diffuse down-sun
 * streak"). Where a building or a tree shades the ground there is no sun, so
 * a sun-stretched shape is wrong there. Each slot therefore carries two
 * shapes, and the ground patch weighs them by the static shade *at each
 * ground point*: the **sun shape** above at `sunShare × (1 − shade)`, and a
 * **shade shape** at `shade` — for the wheel the same round core, for the
 * body a compact round pool (`body.shade`) centred between the wheel's contact
 * and the pelvis's ground point, so it sits under the wheel and feet and
 * follows a lean. Across a shade edge each ground point blends between the
 * two by the same continuous static shade the lift uses, so the pool changes
 * shape where the shade does and never pops as the rider crosses it.
 * `shadeOut` receives the shade shapes, `ULTRA_CONTACT_SHADE_FLOATS` a slot
 * (`(x, z, radius, strength)`, the shared `ultraContactShade`); without one
 * only the sun shapes are written.
 *
 * **No pop.** The strengths fade continuously with height above the
 * heightfield — the wheel's (a hop or a jump lifts both occluders away),
 * and the pelvis's for the body (a ragdoll in flight) — so a rider leaving
 * the ground dims his pool rather than dropping it, and one riding a deck
 * above the ground grounds nothing on the heightfield below it.
 *
 * Pure arithmetic on the plan and the points: no three, no DOM.
 */
export function riderContactOccluders(
  plan: LevelPlan,
  riders: readonly RiderContact[],
  out: Float32Array,
  downSun: GroundDirection | null = null,
  shadeOut: Float32Array | null = null,
): number {
  const config = ULTRA.contact.riders;
  let slot = 0;
  const body = config.body;
  const compact = body.shade;
  // An indexed loop and a module-level writer (Fable F7): called every solo frame, it allocates nothing.
  for (let index = 0; index < riders.length; index += 1) {
    const rider = riders[index];
    const wheel = rider.wheel;
    const pelvis = rider.pelvis;
    if (!Number.isFinite(wheel.x) || !Number.isFinite(wheel.y) || !Number.isFinite(wheel.z)) continue;
    // A plan with no heightfield (a test fixture) stands every rider on the ground.
    const field = plan.heightfield as LevelPlan['heightfield'] | undefined;
    const ground = field === undefined ? wheel.y : fieldHeightAt(field, plan.surround, wheel.x, wheel.z);
    const lifted = liftFade(wheel.y - ground, config.liftFade);
    const wheelStrength = config.wheel.strength * lifted;
    slot = writeContactSlot(
      out, slot, wheel.x, wheel.z, config.wheel.radius, wheelStrength, 1, 0, config.wheel.radius, config.wheel.sunShare,
      shadeOut, wheel.x, wheel.z, config.wheel.radius, wheelStrength,
    );
    if (pelvis === null || !Number.isFinite(pelvis.x) || !Number.isFinite(pelvis.y) || !Number.isFinite(pelvis.z)) continue;
    const under = field === undefined ? wheel.y : fieldHeightAt(field, plan.surround, pelvis.x, pelvis.z);
    const bodyLift = lifted * liftFade(pelvis.y - under, config.bodyLiftFade);
    const strength = body.strength * bodyLift;
    // A28: in static shade, compact under the wheel and feet, leaning with the body.
    const shadeX = wheel.x + (pelvis.x - wheel.x) * compact.towardPelvis;
    const shadeZ = wheel.z + (pelvis.z - wheel.z) * compact.towardPelvis;
    const shadeStrength = compact.strength * bodyLift;
    if (downSun === null) {
      slot = writeContactSlot(
        out, slot, pelvis.x, pelvis.z, body.radius, strength, 1, 0, body.radius, body.sunShare,
        shadeOut, shadeX, shadeZ, compact.radius, shadeStrength,
      );
    } else {
      slot = writeContactSlot(
        out,
        slot,
        pelvis.x + downSun.x * body.downSunMetres,
        pelvis.z + downSun.z * body.downSunMetres,
        body.radius * body.stretch,
        strength,
        downSun.x,
        downSun.z,
        body.radius * body.across,
        body.sunShare,
        shadeOut,
        shadeX,
        shadeZ,
        compact.radius,
        shadeStrength,
      );
    }
  }
  return slot;
}

/**
 * The dynamic occluders' product at a ground point, exactly as the ground
 * patch computes it (`ultraDynamicContact`), clamped at
 * `ULTRA.contact.riders.floor`. Per written slot, with `shade` the static
 * shade at the point (1 in a building's or tree's shade, 0 in sun):
 *
 * - the sun shape `1 − s·sunShare·(1 − shade)·(1 − t²)²`, `t²` the squared
 *   elliptical distance (along the slot's axis over `radiusAlong`, across it
 *   over `radiusAcross`);
 * - times, when `shadePoints` is given (A28), the shade shape
 *   `1 − q·shade·(1 − u²)²`, `u` the distance to its centre over its radius.
 *
 * Without `shadePoints` the sun shape alone stands (a sun-only reading).
 */
export function dynamicContactAt(
  points: Float32Array,
  count: number,
  x: number,
  z: number,
  shade = 1,
  shadePoints: Float32Array | null = null,
): number {
  let occlusion = 1;
  for (let slot = 0; slot < count; slot += 1) {
    const at = slot * ULTRA_CONTACT_FLOATS;
    const dx = x - points[at];
    const dz = z - points[at + 1];
    const ax = points[at + 4];
    const az = points[at + 5];
    const along = (dx * ax + dz * az) / Math.max(points[at + 2], 1e-3);
    const across = (dx * az - dz * ax) / Math.max(points[at + 6], 1e-3);
    const k = Math.min(1, Math.max(0, 1 - (along * along + across * across)));
    occlusion *= 1 - points[at + 3] * points[at + 7] * (1 - shade) * k * k;
    if (shadePoints !== null) {
      const s = slot * ULTRA_CONTACT_SHADE_FLOATS;
      const ux = (x - shadePoints[s]) / Math.max(shadePoints[s + 2], 1e-3);
      const uz = (z - shadePoints[s + 1]) / Math.max(shadePoints[s + 2], 1e-3);
      const q = Math.min(1, Math.max(0, 1 - (ux * ux + uz * uz)));
      occlusion *= 1 - shadePoints[s + 3] * shade * q * q;
    }
  }
  return Math.max(occlusion, ULTRA.contact.riders.floor);
}

// ---------------------------------------------------------------------------
// Edge fill (T6): the fill-only edge field
// ---------------------------------------------------------------------------

/** Compatibility names retained for all existing Ultra readers. */
export {
  GROUND_EDGE_RANKS as ULTRA_EDGE_RANKS,
  GROUND_DRIVABLE_MATERIALS as ULTRA_DRIVABLE_MATERIALS,
  GROUND_CRISP_MATERIALS as ULTRA_CRISP_MATERIALS,
} from '../groundBoundaryPolicy.ts';
export { edgeSignedDistance, tautString, fillTint } from '../groundBoundary.ts';
export type { EdgeLine, EdgePocket, EdgeFillCell, EdgeFillField } from '../groundBoundary.ts';

/** The old drivable-cap signature, reading the same shared tuning object. */
export function drivableCapCells(spacing: number): number {
  return groundDrivableCapCells(spacing);
}

/** The old rounded-distance signature, using the unchanged Ultra knee width. */
export function edgeRoundedDistance(a: number, b: number): number {
  return boundaryRoundedDistance(a, b, ULTRA_GROUND.edge.kneeRoundCells);
}

/** The old coverage signature, using the unchanged Ultra knee width. */
export function edgeCovers(fill: EdgeFillCell, gx: number, gz: number): boolean {
  return boundaryCovers(fill, gx, gz, ULTRA_GROUND.edge.kneeRoundCells);
}

/**
 * Existing Ultra entry point. Drawn iteration order, cap defaults, ordered
 * surface policy and visible-hazard reach are retained. Precise paving cells
 * remain absent from this mask, exactly as in the old implementation.
 */
export function edgeFillFor(
  plan: LevelPlan,
  cells: TerrainCells['bySurface'],
  capCells: number = edgeCapCells(plan.heightfield.spacing),
  drivableCap: number = Math.min(capCells, drivableCapCells(plan.heightfield.spacing)),
): EdgeFillField {
  const field = plan.heightfield;
  return edgeFillForGrid(
    { columns: field.columns - 1, rows: field.rows - 1, surfaces: field.surfaces },
    cells as ReadonlyMap<SurfaceId, readonly number[]>,
    groundBoundaryPolicy(capCells, drivableCap),
    groundHazardMask(plan),
  );
}

// ---------------------------------------------------------------------------
// The attribute contract with the ground and block patches
// ---------------------------------------------------------------------------

/**
 * The Ultra vertex attributes the terrain writes, by name. Every one arrives
 * in the shader as a float or float vector whatever its storage (none is an
 * integer attribute), so a patch declares them as below and never needs the
 * packing:
 *
 * | name            | GLSL    | storage                     | meaning |
 * |-----------------|---------|-----------------------------|---------|
 * | `ultraAo`       | `float` | Uint8, normalized           | contact/base AO multiplier in `[floor, 1]`, authored strength (scale live by `contactStrength`); apply to indirect light |
 * | `ultraEdge`     | `vec2`  | half float ×2               | signed distance to the cell's fill lines, in cells, positive filled; `ULTRA_GROUND.edge.sentinel` where there is no line. Affine across the cell (one line), so the per-fragment half-plane is exact |
 * | `ultraFillTint` | `vec3`  | half float ×3               | linear multiplier on the diffuse colour (`material × vColor`) inside the fill (`fillTint`) |
 * | `ultraFillKind` | `float` | Uint8, **not** normalized   | the filling surface's detail kind (`groundDetailKind`), so the fill continues its texture too |
 *
 * **Which meshes carry which** (`ultraSurfaceAttributes`): the heightfield
 * carries `ultraAo` when `kit.ground` and the three edge attributes when
 * `kit.ground && kit.edgeFill` (the field is part of the ground treatment and
 * `edgeFill` its kill flag); the surround field carries `ultraAo` alone, when
 * `kit.ground` — never an edge attribute, whatever `edgeFill` says; the
 * collider blocks carry `ultraAo` (their base AO) when `kit.blocks`. The
 * patches key their defines on the same flags (`ULTRA_AO` in the shared
 * patch, `ULTRA_EDGE` in the ground's): a declared attribute the geometry
 * lacks reads the GL's generic attribute, not a neutral value.
 */
export const ULTRA_GROUND_ATTRIBUTES = Object.freeze({
  ao: 'ultraAo',
  edge: ULTRA_GROUND_EDGE_ATTRIBUTES.edge,
  fillTint: ULTRA_GROUND_EDGE_ATTRIBUTES.fillTint,
  fillKind: ULTRA_GROUND_EDGE_ATTRIBUTES.fillKind,
} as const);

/** A W6 mesh family, as `ultraSurfaceAttributes` distinguishes them. */
export type UltraSurfaceFamily = 'heightfield' | 'field' | 'blocks';

/** The Ultra attributes a family's geometry carries under a kit. */
export function ultraSurfaceAttributes(kit: UltraKit, family: UltraSurfaceFamily): readonly string[] {
  const names: string[] = [];
  if (family === 'blocks') {
    if (kit.blocks) names.push(ULTRA_GROUND_ATTRIBUTES.ao);
    return names;
  }
  if (kit.ground) names.push(ULTRA_GROUND_ATTRIBUTES.ao);
  if (family === 'heightfield' && kit.ground && kit.edgeFill) {
    names.push(ULTRA_GROUND_ATTRIBUTES.edge, ULTRA_GROUND_ATTRIBUTES.fillTint, ULTRA_GROUND_ATTRIBUTES.fillKind);
  }
  return names;
}
