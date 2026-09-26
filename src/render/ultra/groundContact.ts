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
import { SURFACES, materialAppearance, type MaterialId } from '../../data/surfaces.ts';
import { POTHOLE, ULTRA } from '../../data/tuning.ts';
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

/**
 * Edge-fill rank per surface material (§4): band surfaces 3, soft ground 2,
 * the paved road 1. A higher rank may fill into a lower one; ties break on
 * `encroach`. Materials absent here (spill, wood, stone, metal …) never fill.
 */
export const ULTRA_EDGE_RANKS: Readonly<Partial<Record<MaterialId, number>>> = Object.freeze({
  brick: 3,
  concrete: 3,
  grass: 2,
  gravel: 2,
  dirt: 2,
  pavement: 1,
  roughPavement: 1,
});

/**
 * The materials the ride is laid in (coordinator amendment A12): the rank-1
 * road (pavement, rough pavement) and the dirt of the riding trails. A fill
 * into a cell of one of these keeps to `ULTRA.ground.edge.drivableCapCells`
 * (½ cell), so the drawn edge of what is ridden stays within half a cell of
 * the ridden grid; `capCells` (¾) is kept between non-drivable surfaces and
 * on the gravel verges, whose grass edge a ½ cap drew back into a sawtooth.
 */
export const ULTRA_DRIVABLE_MATERIALS: ReadonlySet<MaterialId> = new Set<MaterialId>(['pavement', 'roughPavement', 'dirt']);

/**
 * The cells that take no §4c blend on an Ultra world whose edge field draws
 * the boundaries (round-1 item 8): the drivable ones and the gravel verges.
 * The blend tinted them toward the turf beside them, and behind a
 * straightened boundary those tinted cells were left as a stair-stepped,
 * feathered band — "grass reads onto the trail", the smeared steeple edge.
 */
export const ULTRA_CRISP_MATERIALS: ReadonlySet<MaterialId> = new Set<MaterialId>([...ULTRA_DRIVABLE_MATERIALS, 'gravel']);

/** The cap into a drivable cell for a heightfield spacing: `drivableCapCells`, and never more than `capMetres`. */
export function drivableCapCells(spacing: number): number {
  const { drivableCapCells: cells, capMetres } = ULTRA_GROUND.edge;
  return spacing > 0 ? Math.min(cells, capMetres / spacing) : cells;
}

/**
 * One straight fill boundary, in heightfield **grid units** — `gx` is the
 * column coordinate and `gz` the row coordinate, one unit a cell, so cell
 * `(column, row)` spans `[column, column + 1] × [row, row + 1]`. Its signed
 * distance is `nx·gx + nz·gz − d` (a unit normal, so the distance is in
 * cells), positive on the filled side.
 */
export interface EdgeLine {
  readonly nx: number;
  readonly nz: number;
  readonly d: number;
}

/** A line's signed distance at a grid point, in cells; positive is filled. */
export function edgeSignedDistance(line: EdgeLine, gx: number, gz: number): number {
  return line.nx * gx + line.nz * gz - line.d;
}

/**
 * How a filled cell was drawn: a `chain` cell lies under a straightened
 * staircase (a taut line through the band's corridor), a `chamfer` cell
 * takes the 45° half-cell at a corner no chain straightens.
 */
export type EdgePocket = 'chain' | 'chamfer';

/** One filled cell: its lines, how they combine, the surface it fills toward, and the tile whose tone it takes. */
export interface EdgeFillCell {
  /** One or two half-planes. */
  readonly lines: readonly EdgeLine[];
  /**
   * `union` — covered where any line is positive (a boundary that bends
   * toward the band); `intersection` — where every line is (one that bends
   * away from it). One line is the same either way.
   */
  readonly mode: 'union' | 'intersection';
  readonly towards: SurfaceId;
  /** A drawn cell of `towards` beside this one: the fill continues its tile tone. */
  readonly source: number;
  readonly pocket: EdgePocket;
  /**
   * A drivable chain's knee (Wave 4, R-G; A18, round-2 item 8): the two lines
   * of a `union` — where the string bends over the cap — meet in a rounded,
   * tangent-continuous corner (the smooth maximum of their signed distances
   * over `ULTRA.ground.edge.kneeRoundCells`) instead of a kink. The knee's
   * gate was lifted by the rounding's dip first, so the ½-cell cap holds.
   */
  readonly round?: boolean;
}

/** The edge field over one plan's drawn cells. */
export interface EdgeFillField {
  /** Drawn cell → its fill. Absent = no fill. */
  readonly cells: ReadonlyMap<number, EdgeFillCell>;
  /** Lines drawn in total (the report). */
  readonly lines: number;
  /** The cap every filled point keeps to, in cells (`edgeCapCells`). */
  readonly capCells: number;
  /** The cap into a drivable cell (A12), in cells: every chain with a drivable cell under it keeps to this. */
  readonly drivableCapCells: number;
  /** Filled cells by construction. */
  readonly pockets: Readonly<Record<EdgePocket, number>>;
  /** Straightened staircase chains, and the columns (or rows) they span. */
  readonly chains: number;
  readonly chainCells: number;
  /** Cells whose claims conflicted and were left alone. */
  readonly dropped: number;
}

/**
 * A rounded knee's signed distance (Wave 4, R-G): the polynomial smooth
 * maximum of two lines' signed distances, `max(a, b) + h²·k/4` with `h =
 * max(k − |a − b|, 0) / k` and `k = ULTRA.ground.edge.kneeRoundCells` — the
 * ground patch's `ultraEdgeD` exactly. It is never less than `max(a, b)`: a
 * rounded union covers the kinked one and a fillet under its corner, which
 * is why `edgeFillFor` lifts a knee's gate by `kneeLiftShare × k` first.
 */
export function edgeRoundedDistance(a: number, b: number): number {
  const k = ULTRA_GROUND.edge.kneeRoundCells;
  if (!(k > 0)) return Math.max(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

/**
 * The rule the ground patch implements per fragment, stated once in plain
 * arithmetic (without the `fwidth` antialiasing, which only softens the
 * line): is the grid point `(gx, gz)` inside this cell covered?
 */
export function edgeCovers(fill: EdgeFillCell, gx: number, gz: number): boolean {
  if (fill.round === true && fill.mode === 'union' && fill.lines.length === 2) {
    return edgeRoundedDistance(edgeSignedDistance(fill.lines[0], gx, gz), edgeSignedDistance(fill.lines[1], gx, gz)) > 0;
  }
  if (fill.mode === 'intersection') {
    for (const line of fill.lines) if (edgeSignedDistance(line, gx, gz) <= 0) return false;
    return true;
  }
  for (const line of fill.lines) if (edgeSignedDistance(line, gx, gz) > 0) return true;
  return false;
}

/**
 * A hazard's drawn reach, metres: how far from its centre anything of it is
 * painted. A pothole's halo sits outside its hit radius and its outline runs
 * outward from there (`render/hazards.ts`); a spill runs inward to its radius.
 * The fill stays out of every cell this touches, so no pothole dipole and no
 * puddle edge ever meets a filled region.
 */
function hazardReach(kind: string, radius: number): number {
  if (kind === 'spill') return radius;
  const outline = POTHOLE.outlineHarmonics.reduce((sum, amplitude) => sum + amplitude, 0);
  return radius * POTHOLE.haloFraction * (1 + outline);
}

/**
 * The shortest path through a row of vertical gates — the taut string.
 *
 * Gate `i` stands at `x[i]` (strictly increasing) and admits `lo[i] ≤ z ≤
 * hi[i]`; the first and last gates are single points. Returns the path's
 * height at every gate. The classic funnel: from the current apex, keep the
 * tightest upper and lower rays; a gate whose top falls below the lower ray
 * bends the path down over the gate that set it, one whose bottom rises
 * above the upper ray bends it up under that gate's top. In 1D this path is
 * straight between the gates it touches, and it is the one that minimises
 * every convex measure of bending at once — which is why it is the right
 * "straightest boundary" and not merely a short one.
 */
export function tautString(x: readonly number[], lo: readonly number[], hi: readonly number[]): number[] {
  const count = x.length;
  const vertices: [number, number][] = [[0, lo[0]]];
  let apex = 0;
  let apexZ = lo[0];
  let i = 1;
  while (i < count) {
    let upSlope = Infinity;
    let upAt = -1;
    let loSlope = -Infinity;
    let loAt = -1;
    let bent = false;
    for (let k = apex + 1; k < count; k += 1) {
      const dx = x[k] - x[apex];
      const su = (hi[k] - apexZ) / dx;
      const sl = (lo[k] - apexZ) / dx;
      if (su < loSlope - 1e-12) {
        // Bend down over the lower gate that set the lower ray.
        apex = loAt;
        apexZ = lo[loAt];
        vertices.push([apex, apexZ]);
        bent = true;
        break;
      }
      if (sl > upSlope + 1e-12) {
        apex = upAt;
        apexZ = hi[upAt];
        vertices.push([apex, apexZ]);
        bent = true;
        break;
      }
      if (su < upSlope) {
        upSlope = su;
        upAt = k;
      }
      if (sl > loSlope) {
        loSlope = sl;
        loAt = k;
      }
    }
    if (!bent) {
      vertices.push([count - 1, lo[count - 1]]);
      break;
    }
    i = apex + 1;
  }
  const z = new Array<number>(count);
  for (let v = 0; v + 1 < vertices.length; v += 1) {
    const [a, za] = vertices[v];
    const [b, zb] = vertices[v + 1];
    for (let k = a; k <= b; k += 1) z[k] = za + ((zb - za) * (x[k] - x[a])) / (x[b] - x[a]);
  }
  z[count - 1] = lo[count - 1];
  return z;
}

/** One cell's claim on the fill, before conflicts are resolved. */
interface Claim {
  readonly lines: readonly EdgeLine[];
  readonly mode: 'union' | 'intersection';
  readonly towards: SurfaceId;
  /** Tone sources, in preference order. */
  readonly sources: readonly number[];
  readonly pocket: EdgePocket;
  /** A chain claim's chain length (longer wins); 0 for a chamfer. */
  readonly length: number;
  /** A drivable chain's two-line knee, drawn rounded (`EdgeFillCell.round`). */
  readonly round: boolean;
}

/**
 * A view of the cell grid in which the band is *above*: canonical column
 * `j` runs along the staircase and canonical row `r` across it, with the
 * band at larger `r`. The four frames are the two axes times the two sides,
 * so one chain builder serves every orientation.
 */
interface Frame {
  readonly width: number;
  readonly height: number;
  /** The real cell at canonical `(j, r)`, both in range. */
  cell(j: number, r: number): number;
  /** A canonical line `sd' = A·x' + B·z' + C` as a real grid line. */
  line(a: number, b: number, c: number): EdgeLine;
}

/**
 * The fill-only edge field over the cells `render/terrain.ts` draws
 * (`terrainCells(plan).bySurface`).
 *
 * **Staircase chains.** In each of four frames (the band above, along
 * either axis), every grid edge with a cell of an outranking surface B above
 * and a fillable cell below is a node; a node links to the next column's
 * node of the same B whose level differs by at most one — a straight run or
 * a unit riser. A maximal linked run is a *chain*: a band boundary crossing
 * the grid at a slope of at most 1:1 in that frame, stored as its level
 * `L[j]` per column (a 1:n line is runs of n and risers of one).
 *
 * **The corridor, and the taut line through it.** The visual boundary of
 * a chain is a path `z(x)` under B — never inside a B cell, so the band only
 * ever grows — and never more than the cap from a B cell, so the ride's
 * truth stays within `capCells`. Both are exact as gates at the column
 * edges (`z ≤ min L`, and down to `min L − cap`, which rounds the band's
 * convex corners outward) and at the *knee* `cap` into a column past a
 * riser, where the cap region steps from the riser's reach to the run's
 * (`L − cap ≤ z ≤ L`). The boundary is the taut string through those gates:
 * for a regular 1:n staircase that is exactly the straight line through the
 * band's convex corners while `n/(n+1) ≤ cap` (1:1 to 1:3 at 0.75), and past
 * that the kneed ramp — steeply to the knee, then straight to the next
 * corner — which turns a one-cell jog into a 0.25-cell bump over three
 * quarters of a cell. An irregular digital line (runs of 2 and 3, the odd
 * 1) comes out one straight line wherever the corridor allows it, instead of
 * a zig-zag of per-step chords. The ends of a chain are held on the band's
 * own edge so the field meets whatever the grid does beyond.
 *
 * **Everything else is a chamfer.** A concave corner no chain straightens —
 * a genuine corner of a band, a U-shaped notch, a one-column tooth — takes
 * the 45° half-cell triangle at the corner, what a kerb corner reads as from
 * the chase camera.
 *
 * **The laws** (asserted by `groundContact.test.ts` on synthetic staircases
 * and on the shipped worlds): only a drawn, non-excluded cell of a lower
 * rank is ever filled, and only toward a surface that outranks it, so a band
 * never loses a cell and its width can only grow; every filled point is
 * within `capCells` of a cell of the surface it fills toward; a filled cell
 * keeps at least `minKeptArea` of itself and a share of every edge it shares
 * with its own surface, so no surface loses a cell or a 4-connection; spill,
 * wood and every cell a hazard is drawn over never take part, as the filled
 * cell or as a band cell the field is read from.
 *
 * **Conflicts.** A cell claimed toward two surfaces takes the stronger. A
 * cell under two chains (the two axes of a near-45° line) takes the longer
 * chain's lines. Chamfers alone combine (two adjacent corners of a notch make
 * a V); two opposite chamfers — a one-cell diagonal path — are left alone
 * rather than drawn lopsided, and a cell no claim leaves enough of is left
 * alone.
 */
export function edgeFillFor(
  plan: LevelPlan,
  cells: TerrainCells['bySurface'],
  capCells: number = edgeCapCells(plan.heightfield.spacing),
  drivableCap: number = Math.min(capCells, drivableCapCells(plan.heightfield.spacing)),
): EdgeFillField {
  const field = plan.heightfield;
  const columns = field.columns - 1;
  const rows = field.rows - 1;
  const total = columns * rows;
  const surfaces = field.surfaces;

  const drawn = new Uint8Array(total);
  for (const list of cells.values()) for (const cell of list) drawn[cell] = 1;

  // Rank and encroach per surface id, resolved once — and, because the
  // chains below ask "does B outrank A" hundreds of thousands of times on the
  // town, as a small table over per-cell surface codes.
  const ids = Object.keys(SURFACES) as SurfaceId[];
  const codeOf = new Map<SurfaceId, number>(ids.map((id, index) => [id, index]));
  const rankByCode = ids.map((id) => ULTRA_EDGE_RANKS[SURFACES[id].material] ?? 0);
  const encroachByCode = ids.map((id) => materialAppearance(SURFACES[id].material).encroach);
  const beats = new Uint8Array(ids.length * ids.length);
  for (let b = 0; b < ids.length; b += 1) {
    for (let a = 0; a < ids.length; a += 1) {
      const win = rankByCode[b] > rankByCode[a] || (rankByCode[b] === rankByCode[a] && encroachByCode[b] > encroachByCode[a]);
      beats[b * ids.length + a] = win ? 1 : 0;
    }
  }
  const drivableByCode = ids.map((id) => ULTRA_DRIVABLE_MATERIALS.has(SURFACES[id].material));
  // A18: a drivable knee's rounding width, and how far its gate is lifted first (the rounding's dip, with a margin).
  const kneeRound = ULTRA_GROUND.edge.kneeRoundCells;
  const kneeLift = kneeRound > 0 ? kneeRound * ULTRA_GROUND.edge.kneeLiftShare : 0;
  const codes = new Uint8Array(total);
  const codeByName: Record<string, number> = Object.fromEntries(ids.map((id, index) => [id, index]));
  for (let cell = 0; cell < total; cell += 1) codes[cell] = codeByName[surfaces[cell]] ?? 0;
  const outranks = (b: SurfaceId, a: SurfaceId): boolean =>
    beats[(codeOf.get(b) ?? 0) * ids.length + (codeOf.get(a) ?? 0)] === 1;

  // Every cell a hazard is drawn over, and every cell with no rank.
  const excluded = new Uint8Array(total);
  for (let cell = 0; cell < total; cell += 1) {
    if (rankByCode[codes[cell]] === 0) excluded[cell] = 1;
  }
  for (const hazard of plan.hazards ?? []) {
    const reach = hazardReach(hazard.kind, hazard.radius);
    const c0 = Math.max(0, Math.floor((hazard.centre.x - reach - field.originX) / field.spacing));
    const c1 = Math.min(columns - 1, Math.floor((hazard.centre.x + reach - field.originX) / field.spacing));
    const r0 = Math.max(0, Math.floor((hazard.centre.z - reach - field.originZ) / field.spacing));
    const r1 = Math.min(rows - 1, Math.floor((hazard.centre.z + reach - field.originZ) / field.spacing));
    for (let row = r0; row <= r1; row += 1) {
      for (let column = c0; column <= c1; column += 1) {
        const x0 = field.originX + column * field.spacing;
        const z0 = field.originZ + row * field.spacing;
        const dx = Math.max(x0 - hazard.centre.x, 0, hazard.centre.x - (x0 + field.spacing));
        const dz = Math.max(z0 - hazard.centre.z, 0, hazard.centre.z - (z0 + field.spacing));
        if (Math.hypot(dx, dz) < reach) excluded[row * columns + column] = 1;
      }
    }
  }

  const inside = (column: number, row: number): boolean => column >= 0 && row >= 0 && column < columns && row < rows;
  const surfaceAt = (column: number, row: number): SurfaceId | null => (inside(column, row) ? surfaces[row * columns + column] : null);
  /** A cell of B the fill may be read from: B, and not under a hazard. */
  const isBCell = (cell: number, b: SurfaceId): boolean => surfaces[cell] === b && excluded[cell] === 0;
  /** A cell the fill may paint toward B: drawn, not excluded, outranked by B. */
  const fillableCell = (cell: number, b: SurfaceId): boolean =>
    drawn[cell] === 1 && excluded[cell] === 0 && beats[(codeOf.get(b) ?? 0) * ids.length + codes[cell]] === 1;

  const claims = new Map<number, Claim[]>();
  const claim = (cell: number, entry: Claim): void => {
    const list = claims.get(cell);
    if (list === undefined) claims.set(cell, [entry]);
    else list.push(entry);
  };

  // -- Chains, in four frames ---------------------------------------------
  const frames: Frame[] = [
    {
      width: columns,
      height: rows,
      cell: (j, r) => r * columns + j,
      line: (a, b, c) => ({ nx: a, nz: b, d: -c }),
    },
    {
      width: columns,
      height: rows,
      cell: (j, r) => (rows - 1 - r) * columns + j,
      // z' = rows − gz
      line: (a, b, c) => ({ nx: a, nz: -b, d: -(b * rows + c) }),
    },
    {
      width: rows,
      height: columns,
      cell: (j, r) => j * columns + r,
      // x' = gz, z' = gx
      line: (a, b, c) => ({ nx: b, nz: a, d: -c }),
    },
    {
      width: rows,
      height: columns,
      cell: (j, r) => j * columns + (columns - 1 - r),
      // x' = gz, z' = columns − gx
      line: (a, b, c) => ({ nx: -b, nz: a, d: -(b * columns + c) }),
    },
  ];

  // Nodes: per frame and canonical column, the levels of every edge with
  // an outranking band cell on one side and a fillable cell on the other —
  // found from the fillable cells (a fifth of the grid on the town), each
  // asking its four neighbours, rather than by scanning the grid four times.
  const nodeLevels: number[][][] = frames.map((frame) => Array.from({ length: frame.width }, () => [] as number[]));
  const nodeBands: SurfaceId[][][] = frames.map((frame) => Array.from({ length: frame.width }, () => [] as SurfaceId[]));
  const nodeAt = (f: number, j: number, r: number, b: SurfaceId): void => {
    nodeLevels[f][j].push(r);
    nodeBands[f][j].push(b);
  };
  for (const list of cells.values()) {
    for (const cell of list) {
      if (excluded[cell] === 1) continue;
      const row = Math.floor(cell / columns);
      const column = cell - row * columns;
      const own = codes[cell];
      // frame 0: the band above (+z); frame 1: below (−z); 2: at +x; 3: at −x.
      for (let f = 0; f < 4; f += 1) {
        const nc = f === 2 ? column + 1 : f === 3 ? column - 1 : column;
        const nr = f === 0 ? row + 1 : f === 1 ? row - 1 : row;
        if (nc < 0 || nr < 0 || nc >= columns || nr >= rows) continue;
        const neighbour = nr * columns + nc;
        if (excluded[neighbour] === 1 || beats[codes[neighbour] * ids.length + own] !== 1) continue;
        const j = f < 2 ? column : row;
        const r = f === 0 ? row + 1 : f === 1 ? rows - row : f === 2 ? column + 1 : columns - column;
        nodeAt(f, j, r, surfaces[neighbour]);
      }
    }
  }

  let chainCount = 0;
  let chainColumns = 0;
  for (let f = 0; f < frames.length; f += 1) {
    const frame = frames[f];
    const levels = nodeLevels[f];
    const bands = nodeBands[f];
    // Each column's nodes in level order.
    for (let j = 0; j < frame.width; j += 1) {
      if (levels[j].length < 2) continue;
      const order = levels[j].map((_level, index) => index).sort((p, q) => levels[j][p] - levels[j][q]);
      levels[j] = order.map((index) => levels[j][index]);
      bands[j] = order.map((index) => bands[j][index]);
    }
    // The unique neighbour of a node in the next (or previous) column.
    const linkOf = (j: number, index: number, step: 1 | -1): number => {
      const next = j + step;
      if (next < 0 || next >= frame.width) return -1;
      const level = levels[j][index];
      const band = bands[j][index];
      let found = -1;
      for (let k = 0; k < levels[next].length; k += 1) {
        if (bands[next][k] !== band || Math.abs(levels[next][k] - level) > 1) continue;
        if (found >= 0) return -1;
        found = k;
      }
      return found;
    };
    const visited = levels.map((at) => new Uint8Array(at.length));
    for (let j = 0; j < frame.width; j += 1) {
      for (let index = 0; index < levels[j].length; index += 1) {
        if (visited[j][index] === 1) continue;
        // Start only where no mutual link comes from the left.
        const back = linkOf(j, index, -1);
        if (back >= 0 && linkOf(j - 1, back, 1) === index) continue;
        const chain: number[] = [];
        let column = j;
        let at = index;
        const band = bands[j][index];
        for (;;) {
          visited[column][at] = 1;
          chain.push(levels[column][at]);
          const forward = linkOf(column, at, 1);
          if (forward < 0 || linkOf(column + 1, forward, -1) !== at || visited[column + 1][forward] === 1) break;
          column += 1;
          at = forward;
        }
        // Split at one-column teeth of the lower surface (both neighbours
        // lower): a column there would need a knee from each side.
        let start = 0;
        for (let k = 0; k <= chain.length; k += 1) {
          const tooth = k > 0 && k < chain.length - 1 && chain[k - 1] < chain[k] && chain[k + 1] < chain[k];
          if (k < chain.length && !tooth) continue;
          if (k - start >= 2) {
            chainCount += 1;
            chainColumns += k - start;
            straighten(frame, j + start, chain.slice(start, k), band);
          }
          start = k + 1;
        }
      }
    }
  }

  /**
   * One chain: its gates, its taut path, and a claim on every cell the path
   * fills — the cell under B in each column, and the one below it where the
   * path rounds a riser's corner.
   */
  function straighten(frame: Frame, j0: number, level: readonly number[], band: SurfaceId): void {
    const n = level.length;
    // A12: a chain with any drivable cell under it keeps to the drivable cap
    // along its whole length (one cap per chain keeps the taut line one line).
    let drivable = false;
    for (let k = 0; k < n && !drivable; k += 1) {
      const under = level[k] - 1;
      if (under >= 0 && drivableByCode[codes[frame.cell(j0 + k, under)]]) drivable = true;
    }
    const m = drivable ? drivableCap : capCells;
    const x: number[] = [];
    const lo: number[] = [];
    const hi: number[] = [];
    const push = (at: number, low: number, high: number): void => {
      x.push(at);
      lo.push(low);
      hi.push(high);
    };
    push(j0, level[0], level[0]);
    const kneeAt: number[] = new Array(n).fill(-1);
    for (let k = 0; k < n; k += 1) {
      const j = j0 + k;
      const own = level[k];
      if (k > 0 && level[k - 1] < own) {
        kneeAt[k] = x.length;
        push(j + m, own - m, own);
      } else if (k < n - 1 && level[k + 1] < own) {
        kneeAt[k] = x.length;
        push(j + 1 - m, own - m, own);
      }
      if (k === n - 1) {
        push(j + 1, own, own);
        break;
      }
      const next = level[k + 1];
      const lower = Math.min(own, next);
      let low = lower - m;
      if (own !== next) {
        // Below `lower` the higher column's second cell fills too: it must be fillable.
        const higher = own > next ? j : j + 1;
        const deeper = lower - 1;
        if (deeper < 0 || !fillableCell(frame.cell(higher, deeper), band)) low = lower;
      }
      push(j + 1, low, lower);
    }
    let z = tautString(x, lo, hi);
    if (drivable && kneeRound > 0) {
      // A18 (round-2 item 8): a knee is where the string bends over a gate's
      // lower bound — the cap — and turns less steep (a union of two lines).
      // It is drawn rounded, and the rounding dips below the corner by up to
      // about a quarter of its width, so each such gate's bound is first
      // lifted by that much and the string pulled again: the rounded knee
      // then keeps to the cap. A straight run (1:1 at ½) has no bend and is
      // not touched. A lifted bound can move the bend to a neighbour; a few
      // passes settle it.
      const lifted = new Uint8Array(x.length);
      for (let pass = 0; pass < 4; pass += 1) {
        let changed = false;
        for (let g = 1; g + 1 < x.length; g += 1) {
          if (lifted[g] === 1 || z[g] > lo[g] + 1e-9 || hi[g] - lo[g] < kneeLift + 1e-9) continue;
          const before = (z[g] - z[g - 1]) / (x[g] - x[g - 1]);
          const after = (z[g + 1] - z[g]) / (x[g + 1] - x[g]);
          if (before - after < 1e-6) continue;
          lo[g] += kneeLift;
          lifted[g] = 1;
          changed = true;
        }
        if (!changed) break;
        z = tautString(x, lo, hi);
      }
    }
    // Gate index of each column's left edge.
    const leftEdge: number[] = [];
    {
      let gate = 0;
      for (let k = 0; k < n; k += 1) {
        leftEdge.push(gate);
        gate += kneeAt[k] >= 0 ? 2 : 1;
      }
    }
    for (let k = 0; k < n; k += 1) {
      const j = j0 + k;
      const own = level[k];
      const g0 = leftEdge[k];
      const knee = kneeAt[k];
      const g1 = knee >= 0 ? g0 + 2 : g0 + 1;
      const points: [number, number][] = knee >= 0
        ? [[x[g0], z[g0]], [x[knee], z[knee]], [x[g1], z[g1]]]
        : [[x[g0], z[g0]], [x[g1], z[g1]]];
      let deepest = Infinity;
      for (const [, value] of points) deepest = Math.min(deepest, value);
      if (deepest >= own - 1e-9) continue;
      // The path's segments in this column; a kink at the knee decides the mode.
      const segments: [number, number, number, number][] = [];
      for (let p = 0; p + 1 < points.length; p += 1) segments.push([points[p][0], points[p][1], points[p + 1][0], points[p + 1][1]]);
      let mode: 'union' | 'intersection' = 'union';
      if (segments.length === 2) {
        const s1 = (segments[0][3] - segments[0][1]) / (segments[0][2] - segments[0][0]);
        const s2 = (segments[1][3] - segments[1][1]) / (segments[1][2] - segments[1][0]);
        if (Math.abs(s1 - s2) < 1e-9) segments.splice(0, 2, [segments[0][0], segments[0][1], segments[1][2], segments[1][3]]);
        else mode = s2 < s1 ? 'union' : 'intersection';
      }
      const lines = segments.map(([xa, za, xb, zb]) => {
        const slope = (zb - za) / (xb - xa);
        const length = Math.hypot(1, slope);
        // sd' = (z' − za − slope·(x' − xa)) / length: positive above the path.
        return frame.line(-slope / length, 1 / length, (slope * xa - za) / length);
      });
      const above = frame.cell(j, own);
      const neighbours = [k > 0 ? frame.cell(j - 1, level[k - 1]) : -1, k < n - 1 ? frame.cell(j + 1, level[k + 1]) : -1];
      // A18 (round-2 item 8): a drivable chain's knee is drawn rounded.
      const round = drivable && kneeRound > 0 && mode === 'union' && lines.length === 2;
      claim(frame.cell(j, own - 1), { lines, mode, towards: band, sources: [above, ...neighbours], pocket: 'chain', length: n, round });
      if (deepest < own - 1 - 1e-9 && own - 2 >= 0) {
        // Rounding a riser's corner: the adjacent lower column's B is the tile beside it.
        const lowerSide = k > 0 && level[k - 1] < own ? frame.cell(j - 1, own - 1) : k < n - 1 && level[k + 1] < own ? frame.cell(j + 1, own - 1) : -1;
        claim(frame.cell(j, own - 2), { lines, mode, towards: band, sources: [lowerSide, above], pocket: 'chain', length: n, round });
      }
    }
  }

  // -- Chamfers at the corners no chain straightens -----------------------
  for (const list of cells.values()) {
    for (const cell of list) {
      if (excluded[cell] === 1) continue;
      const row = Math.floor(cell / columns);
      const column = cell - row * columns;
      for (let bit = 0; bit < 4; bit += 1) {
        const cu = bit === 1 || bit === 2 ? 1 : 0;
        const cv = bit >= 2 ? 1 : 0;
        const sx = cu === 0 ? -1 : 1;
        const sz = cv === 0 ? -1 : 1;
        if (!inside(column + sx, row)) continue;
        const neighbour = row * columns + column + sx;
        if (beats[codes[neighbour] * ids.length + codes[cell]] !== 1) continue;
        const b = surfaces[neighbour];
        if (!inside(column + sx, row + sz)) continue;
        const bx = row * columns + column + sx;
        const bz = (row + sz) * columns + column;
        const bd = (row + sz) * columns + column + sx;
        if (!isBCell(bx, b) || !isBCell(bz, b) || !isBCell(bd, b)) continue;
        // s ≤ 1 − t in the corner's frame: the half-cell triangle at C.
        const cx = column + cu;
        const cz = row + cv;
        const dx = -sx;
        const dz = -sz;
        const length = Math.SQRT2;
        claim(cell, {
          lines: [{ nx: -dx / length, nz: -dz / length, d: -(1 + dx * cx + dz * cz) / length }],
          mode: 'union',
          towards: b,
          sources: [bz, bx, bd],
          pocket: 'chamfer',
          length: 0,
          round: false,
        });
      }
    }
  }

  // -- Resolve ------------------------------------------------------------
  const { minKeptArea } = ULTRA_GROUND.edge;
  const samples = 12;
  /** A cell drawn this way keeps enough of itself and of every edge it shares with its own surface. */
  const keeps = (cell: number, fill: Omit<EdgeFillCell, 'source' | 'pocket' | 'towards'>): boolean => {
    const row = Math.floor(cell / columns);
    const column = cell - row * columns;
    const probe = fill as EdgeFillCell;
    let open = 0;
    for (let i = 0; i < samples; i += 1) {
      for (let k = 0; k < samples; k += 1) {
        if (!edgeCovers(probe, column + (i + 0.5) / samples, row + (k + 0.5) / samples)) open += 1;
      }
    }
    if (open < minKeptArea * samples * samples) return false;
    const own = surfaces[cell];
    const edges: readonly [number, number, (t: number) => [number, number]][] = [
      [-1, 0, (t) => [column, row + t]],
      [1, 0, (t) => [column + 1, row + t]],
      [0, -1, (t) => [column + t, row]],
      [0, 1, (t) => [column + t, row + 1]],
    ];
    for (const [dc, dr, point] of edges) {
      if (surfaceAt(column + dc, row + dr) !== own || drawn[(row + dr) * columns + column + dc] !== 1) continue;
      let clear = false;
      for (let k = 1; k < samples; k += 1) {
        const [gx, gz] = point(k / samples);
        if (!edgeCovers(probe, gx, gz)) {
          clear = true;
          break;
        }
      }
      if (!clear) return false;
    }
    return true;
  };
  const same = (p: EdgeLine, q: EdgeLine): boolean =>
    Math.abs(p.nx - q.nx) < 1e-6 && Math.abs(p.nz - q.nz) < 1e-6 && Math.abs(p.d - q.d) < 1e-6;
  const sameClaim = (p: Claim, q: Claim): boolean =>
    p.mode === q.mode && p.lines.length === q.lines.length && p.lines.every((line) => q.lines.some((other) => same(line, other)));

  const accepted = new Map<number, EdgeFillCell>();
  const pockets: Record<EdgePocket, number> = { chain: 0, chamfer: 0 };
  let lineCount = 0;
  let dropped = 0;
  for (const cell of [...claims.keys()].sort((p, q) => p - q)) {
    const list = claims.get(cell)!;
    let target = list[0].towards;
    for (const entry of list) if (outranks(entry.towards, target)) target = entry.towards;
    const mine = list.filter((entry) => entry.towards === target);
    const chainClaims = mine.filter((entry) => entry.pocket === 'chain').sort((p, q) => q.length - p.length);
    let chosen: { lines: readonly EdgeLine[]; mode: 'union' | 'intersection'; pocket: EdgePocket; sources: number[]; round: boolean } | null = null;
    // Distinct chain fills, and whether any two come from opposite sides (a
    // strip of the lower surface between two runs of the band).
    const distinct: Claim[] = [];
    for (const entry of chainClaims) if (!distinct.some((seen) => sameClaim(seen, entry))) distinct.push(entry);
    const facing = (entry: Claim): [number, number] => {
      let x = 0;
      let z = 0;
      for (const line of entry.lines) {
        x += line.nx;
        z += line.nz;
      }
      return [x, z];
    };
    let opposed = false;
    for (let p = 0; p < distinct.length; p += 1) {
      for (let q = p + 1; q < distinct.length; q += 1) {
        const [ax, az] = facing(distinct[p]);
        const [bx, bz] = facing(distinct[q]);
        if (ax * bx + az * bz < 0) opposed = true;
      }
    }
    if (opposed) {
      // Both sides at once or neither: one line from each, if the cell keeps enough of itself.
      const lines: EdgeLine[] = [];
      let merge = distinct.every((entry) => entry.lines.length === 1);
      for (const entry of distinct) for (const line of entry.lines) if (!lines.some((seen) => same(seen, line))) lines.push(line);
      merge = merge && lines.length <= 2;
      if (merge && keeps(cell, { lines, mode: 'union' })) {
        chosen = { lines, mode: 'union', pocket: 'chain', sources: chainClaims.flatMap((entry) => [...entry.sources]), round: false };
      }
    } else {
      for (const entry of chainClaims) {
        if (keeps(cell, entry)) {
          chosen = { lines: entry.lines, mode: entry.mode, pocket: 'chain', sources: [...entry.sources], round: entry.round };
          for (const other of chainClaims) if (other !== entry && sameClaim(other, entry)) chosen.sources.push(...other.sources);
          break;
        }
      }
    }
    if (chosen === null) {
      const chamfers = mine.filter((entry) => entry.pocket === 'chamfer');
      const lines: EdgeLine[] = [];
      for (const entry of chamfers) for (const line of entry.lines) if (!lines.some((seen) => same(seen, line))) lines.push(line);
      if (lines.length > 0 && lines.length <= 2 && keeps(cell, { lines, mode: 'union' })) {
        chosen = { lines, mode: 'union', pocket: 'chamfer', sources: chamfers.flatMap((entry) => [...entry.sources]), round: false };
      }
    }
    if (chosen === null) {
      dropped += 1;
      continue;
    }
    const source = chosen.sources.find((candidate) => candidate >= 0 && candidate < total && drawn[candidate] === 1 && surfaces[candidate] === target) ?? -1;
    if (source < 0) {
      dropped += 1;
      continue;
    }
    const mode = chosen.lines.length === 1 ? 'union' : chosen.mode;
    const round = chosen.round && chosen.lines.length === 2 && mode === 'union';
    accepted.set(cell, { lines: chosen.lines, mode, towards: target, source, pocket: chosen.pocket, ...(round ? { round } : {}) });
    pockets[chosen.pocket] += 1;
    lineCount += chosen.lines.length;
  }

  return { cells: accepted, lines: lineCount, capCells, drivableCapCells: drivableCap, pockets, chains: chainCount, chainCells: chainColumns, dropped };
}

/** A linear RGB triple, as the fill tone arithmetic reads it. */
interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * The fill tone: the linear multiplier that turns this cell's own colour
 * into the source neighbour's, inside the filled region.
 *
 * The ground shader's diffuse colour is `material.color × vertexColour` — A's
 * material, A's tile tone — and the patch multiplies the fill tone onto
 * exactly that (`diffuseColor.rgb *= mix(1, ultraFillTint, cover)`). The
 * source tile draws `B.color × B.tint`. So the region carries
 * `(B.color × B.tint) / (A.color × A.tint)`, per channel, in the same linear
 * decode three applies to the material colours — the caller passes those
 * decoded values. A cell's four vertices share one tile tone, so the ratio is
 * exact across the whole cell.
 */
export function fillTint(
  ownLinear: Rgb,
  ownTint: Rgb,
  towardLinear: Rgb,
  towardTint: Rgb,
  out: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  const r = ownLinear.r * ownTint.r;
  const g = ownLinear.g * ownTint.g;
  const b = ownLinear.b * ownTint.b;
  out.r = r > 0 ? (towardLinear.r * towardTint.r) / r : 1;
  out.g = g > 0 ? (towardLinear.g * towardTint.g) / g : 1;
  out.b = b > 0 ? (towardLinear.b * towardTint.b) / b : 1;
  return out;
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
