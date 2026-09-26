/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { composeBuilding, LANDMARK_SIZES } from '../data/buildingLooks.ts';
import type { BuildingLook } from '../data/props.ts';
import type { BoxCollider } from './plan.ts';
import type { RingQuarter } from './cityRing.ts';
import {
  centrelineAt,
  collidersOf,
  DEFAULT_SHOULDER,
  headingAt,
  leftOf,
  querySegment,
  type PlacedProp,
  type PlacedSegment,
} from './segments.ts';

/**
 * M39 Phase 2 — readable districts: the industrial yard's sheds and a landmark
 * for every quarter of a generated town.
 *
 * **Dressing, and nothing but dressing.** Everything here is drawn from the
 * `dressing` stream, *after* every value that stream already supplied (the
 * frontage, the verge furniture, the skyline and the planting), so every prop a
 * town carried before Phase 2 is still exactly where it was and these are
 * appended to the end of the list. The route, the terrain, the hazards, the
 * gates and the targets never see a value from here: a target's stand needs
 * clearance from the dressing, and every prop here stands at least
 * `LANDMARK_CLEARANCE` metres outside every corridor's edge, an order of
 * magnitude beyond a stand's reach (`generatedLevel.test.ts` proves the
 * targets unmoved over the corpus).
 *
 * **Solid, and never in anybody's way.** Each is a `building`, so the builder
 * derives its collider from its metric `size` — the shaft or body a rider can
 * actually meet — and every piece that reaches beyond that box does so above a
 * rider's head (`data/buildingLooks.ts`). A site is refused unless its whole
 * footprint stands clear of every corridor, every authored block (the return
 * climb's ledge the owner hops onto among them) and every other building, so a
 * landmark can be ridden up to and round, and cannot trap.
 *
 * **Seen, not only clear** (Codex QA of Phase 2). Clearance says a building is
 * out of the way; it does not say anybody can see it. Two rules answer that:
 * no landmark may stand in another's sightline from the riding line
 * (`LANDMARK_SIGHT_GAP`), and the yard's front row stands at the legal
 * minimum setback along the whole yard road — on a road in a cutting, the top
 * of the bank — with the taller back row behind it, so the sheds read from the
 * chase camera rather than only from the return climb. `townDressing.test.ts`
 * measures both: bearings from the riding line, and rays from a 2 m eye on the
 * yard road against the finished heightfield.
 */

/** Clear ground between any footprint here and any corridor's edge, metres. */
export const LANDMARK_CLEARANCE = DEFAULT_SHOULDER + 3;

/** Clear ground between two buildings' footprints, metres. */
const BUILDING_GAP = 3;

/** Clear ground between a footprint and an authored block, metres. */
const BLOCK_GAP = 3;

/**
 * How far a rider can read the home beacon, metres: inside the fog's far
 * plane (470 m, `LIGHTING.fogFar`) with room for it to be more than a smudge.
 */
export const BEACON_READ_METRES = 420;

/** Along-street spacing of the yard's sheds, metres. */
const SHED_SPACING = 26;

/**
 * Clear ground between a shed's footprint and any corridor's edge, metres: one
 * verge behind the kerb, as every frontage stands. On a yard road run in a
 * cutting that is also the top of the bank (the shoulder eases to the field
 * over `DEFAULT_SHOULDER`), so a front-row shed at this setback shows its
 * whole wall above the bank from the road.
 */
export const SHED_SETBACK = DEFAULT_SHOULDER + 1;

/** How far behind the front row the yard's back row stands, metres. */
const SHED_ROW_DEPTH = 28;

/**
 * How much taller the back row's warehouses are than the front row's sheds,
 * metres: 7.4–9.6 m walls behind 5.6–7.8 m ones, still under the 10 m the
 * yard's sheds are told apart from the return beat's blocks by.
 */
const SHED_BACK_ROW_LIFT = 1.8;

/**
 * Where a shed slot looks when its own spot is taken or too near another
 * corridor (a yard road is short joins and tight bends, so the nominal spot
 * often clips the next segment's bend): a few metres further back first, and
 * a few metres along the street, nearest the road always first — a shed that
 * stands back from a bank's crest is a shed the rider cannot see.
 */
const SHED_NUDGE_OUT = [0, 3, 6, 10, 15] as const;
const SHED_NUDGE_ALONG = [0, -6, 6] as const;

/**
 * **Sightline separation between landmarks** (Codex QA of Phase 2). Clearance
 * alone let the water tower stand 42 m straight behind the boiler house's
 * chimneys on the yard approach, where the nearer one hid it. From every point
 * of the riding line, any two landmarks that are both ahead (inside
 * `LANDMARK_SIGHT_CONE` of the riding heading) and both inside
 * `LANDMARK_SIGHT_RANGE` must stand apart in the rider's view: the angle
 * between their bearings, less both silhouettes' angular half-widths, at least
 * `LANDMARK_SIGHT_GAP`. A landmark takes the first site that keeps the rule
 * with every landmark already placed; if no clear site can (never on the
 * sampled seeds, `townDressing.test.ts`), it takes the clear site with the
 * widest worst gap rather than no landmark.
 */
export const LANDMARK_SIGHT_GAP = (2 * Math.PI) / 180;
/** How far ahead a landmark counts as in view for the separation rule, metres. */
export const LANDMARK_SIGHT_RANGE = 320;
/**
 * Half-angle of the riding view the separation rule judges, radians: inside
 * the desktop chase view's ~48° half-width, wider than a phone's ~17°.
 */
export const LANDMARK_SIGHT_CONE = (40 * Math.PI) / 180;
/** Spacing of the riding-line samples the separation rule is judged from, metres. */
const SIGHT_STEP = 8;

interface Footprint {
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
  readonly halfX: number;
  readonly halfZ: number;
}

export interface TownDressingInput {
  readonly placed: readonly PlacedSegment[];
  readonly throughIds: readonly string[];
  readonly quarterOf: ReadonlyMap<string, RingQuarter>;
  /** Buildings already in the world: the segments' own and the skyline. */
  readonly buildings: readonly PlacedProp[];
}

/** A point on the riding line and the heading the rider faces there. */
export interface RidingPoint {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

/** A landmark as the separation rule sees it: where it stands and how wide it reads. */
export interface Silhouette {
  readonly x: number;
  readonly z: number;
  /** Horizontal radius of its widest piece, metres. */
  readonly radius: number;
}

/** The through line in riding order, sampled every `step` metres. */
export function ridingLine(
  placed: readonly PlacedSegment[],
  throughIds: readonly string[],
  step = SIGHT_STEP,
): RidingPoint[] {
  const byId = new Map(placed.map((segment) => [segment.spec.id, segment]));
  const out: RidingPoint[] = [];
  for (const id of throughIds) {
    const segment = byId.get(id);
    if (segment === undefined) continue;
    for (let s = 0; s < segment.spec.length; s += step) {
      const point = centrelineAt(segment.entry, segment.spec, s);
      out.push({ x: point.x, z: point.z, heading: headingAt(segment.entry, segment.spec, s) });
    }
  }
  return out;
}

/**
 * How wide a landmark reads from any side: the horizontal reach of the widest
 * piece it is drawn from (`data/buildingLooks.ts`), so a tank or a deck wider
 * than its shaft counts at the width a rider sees.
 */
export function silhouetteRadius(look: BuildingLook, size: { x: number; y: number; z: number }): number {
  let radius = Math.hypot(size.x, size.z) / 2;
  for (const piece of composeBuilding({ position: { x: 0, y: 0, z: 0 }, size, look })) {
    radius = Math.max(radius, Math.hypot(piece.x, piece.z) + Math.hypot(piece.sx, piece.sz) / 2);
  }
  return radius;
}

/** Signed smallest angle from `a` to `b`, radians. */
function angleBetween(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/**
 * The narrowest gap, radians, between two landmarks' silhouettes in the
 * rider's view anywhere along the riding line where both are ahead and in
 * range; `Infinity` when they are never in view together.
 */
export function worstSightGap(line: readonly RidingPoint[], a: Silhouette, b: Silhouette): number {
  let worst = Infinity;
  for (const eye of line) {
    const da = Math.hypot(a.x - eye.x, a.z - eye.z);
    const db = Math.hypot(b.x - eye.x, b.z - eye.z);
    if (da > LANDMARK_SIGHT_RANGE || db > LANDMARK_SIGHT_RANGE) continue;
    if (da <= a.radius || db <= b.radius) continue;
    // Bearings in the heading's own convention (`forwardOf`: +Z at 0).
    const ba = Math.atan2(a.x - eye.x, a.z - eye.z);
    const bb = Math.atan2(b.x - eye.x, b.z - eye.z);
    if (Math.abs(angleBetween(eye.heading, ba)) > LANDMARK_SIGHT_CONE) continue;
    if (Math.abs(angleBetween(eye.heading, bb)) > LANDMARK_SIGHT_CONE) continue;
    const gap = Math.abs(angleBetween(ba, bb)) - Math.asin(a.radius / da) - Math.asin(b.radius / db);
    if (gap < worst) worst = gap;
  }
  return worst;
}

/** Sample points on a footprint: the centre, corners and edge midpoints. */
function footprintPoints(f: Footprint): [number, number][] {
  const cos = Math.cos(f.rotationY);
  const sin = Math.sin(f.rotationY);
  const out: [number, number][] = [];
  for (const dx of [-f.halfX, 0, f.halfX]) {
    for (const dz of [-f.halfZ, 0, f.halfZ]) {
      out.push([f.x + cos * dx + sin * dz, f.z - sin * dx + cos * dz]);
    }
  }
  return out;
}

/** Whether two oriented rectangles, each grown by `gap / 2`, overlap (SAT). */
function overlaps(a: Footprint, b: Footprint, gap: number): boolean {
  const axes = [a.rotationY, b.rotationY].flatMap((angle) => [
    { x: Math.cos(angle), z: -Math.sin(angle) },
    { x: Math.sin(angle), z: Math.cos(angle) },
  ]);
  const extent = (f: Footprint, axis: { x: number; z: number }): number => {
    const ux = { x: Math.cos(f.rotationY), z: -Math.sin(f.rotationY) };
    const uz = { x: Math.sin(f.rotationY), z: Math.cos(f.rotationY) };
    return Math.abs(ux.x * axis.x + ux.z * axis.z) * (f.halfX + gap / 2)
      + Math.abs(uz.x * axis.x + uz.z * axis.z) * (f.halfZ + gap / 2);
  };
  for (const axis of axes) {
    const distance = Math.abs((b.x - a.x) * axis.x + (b.z - a.z) * axis.z);
    if (distance > extent(a, axis) + extent(b, axis)) return false;
  }
  return true;
}

function colliderFootprint(box: BoxCollider): Footprint {
  return { x: box.centre.x, z: box.centre.z, rotationY: box.rotationY, halfX: box.halfExtents.x, halfZ: box.halfExtents.z };
}

function propFootprint(prop: PlacedProp): Footprint {
  const size = prop.size ?? { x: 12, y: 18, z: 12 };
  return { x: prop.x, z: prop.z, rotationY: prop.rotationY, halfX: size.x * prop.scale / 2, halfZ: size.z * prop.scale / 2 };
}

/**
 * The town's own clearance oracle: the true distance from every corridor,
 * unculled — `querySegment`'s cheap bounds reject is lifted by growing each
 * segment's box by the clearance asked for.
 */
function clearanceOracle(placed: readonly PlacedSegment[]): (x: number, z: number) => number {
  const pad = LANDMARK_CLEARANCE + 2;
  const grown = placed.map((segment) => ({
    ...segment,
    minX: segment.minX - pad, maxX: segment.maxX + pad,
    minZ: segment.minZ - pad, maxZ: segment.maxZ + pad,
  }));
  return (x, z) => {
    let nearest = Infinity;
    for (const segment of grown) {
      if (x < segment.minX || x > segment.maxX || z < segment.minZ || z > segment.maxZ) continue;
      const query = querySegment(segment, x, z);
      if (query !== null && query.outside < nearest) nearest = query.outside;
    }
    return nearest;
  };
}

/**
 * Sheds along the industrial yard road and landmarks at a junction of every
 * quarter. Returns world placements for `buildLevelPlan`'s `props`.
 */
export function townDressing(input: TownDressingInput, draw: () => number): PlacedProp[] {
  const byId = new Map(input.placed.map((segment) => [segment.spec.id, segment]));
  const clearance = clearanceOracle(input.placed);
  const blocks = input.placed.flatMap((segment) => collidersOf(segment)).map(colliderFootprint);
  const taken: Footprint[] = input.buildings.filter((prop) => prop.kind === 'building').map(propFootprint);
  const out: PlacedProp[] = [];

  // The ring's middle, from its through road: a landmark prefers the side of
  // its street that faces across the town, where the most road can see it.
  const samples: { x: number; z: number }[] = [];
  for (const id of input.throughIds) {
    const segment = byId.get(id);
    if (segment === undefined) continue;
    for (let s = 0; s <= segment.spec.length; s += 12) {
      const point = centrelineAt(segment.entry, segment.spec, s);
      samples.push({ x: point.x, z: point.z });
    }
  }
  const middle = samples.reduce((sum, point) => ({ x: sum.x + point.x / samples.length, z: sum.z + point.z / samples.length }), { x: 0, z: 0 });

  const fits = (f: Footprint): boolean => {
    for (const [x, z] of footprintPoints(f)) if (clearance(x, z) < LANDMARK_CLEARANCE) return false;
    if (blocks.some((block) => overlaps(f, block, BLOCK_GAP))) return false;
    return !taken.some((other) => overlaps(f, other, BUILDING_GAP));
  };

  const place = (look: BuildingLook, f: Footprint, size: { x: number; y: number; z: number }): void => {
    taken.push(f);
    out.push({ kind: 'building', x: f.x, z: f.z, rotationY: f.rotationY, scale: 1, size: { ...size }, look, lift: 0 });
  };

  // The riding line the landmarks' sightlines are judged from, and the
  // silhouettes already standing.
  const line = ridingLine(input.placed, input.throughIds);
  const silhouettes: Silhouette[] = [];
  const placeLandmark = (look: BuildingLook, f: Footprint, size: { x: number; y: number; z: number }): void => {
    place(look, f, size);
    silhouettes.push({ x: f.x, z: f.z, radius: silhouetteRadius(look, size) });
  };

  /** Candidate sites beside a segment, nearest the road first, inside side first. */
  const sitesBeside = (segment: PlacedSegment, fraction: number, size: { x: number; z: number }): Footprint[] => {
    const out2: Footprint[] = [];
    const spec = segment.spec;
    const reach = Math.hypot(size.x, size.z) / 2;
    for (const extra of [0, 6, 12, 20, 30, 42, 56]) {
      for (const along of [0, 10, -10, 20, -20, 32, -32]) {
        const s = Math.min(spec.length, Math.max(0, spec.length * fraction + along));
        const centre = centrelineAt(segment.entry, spec, s);
        const heading = headingAt(segment.entry, spec, s);
        const left = leftOf(heading);
        const inside = (middle.x - centre.x) * left.x + (middle.z - centre.z) * left.z >= 0 ? 1 : -1;
        for (const side of [inside, -inside]) {
          const t = side * (spec.halfWidth + LANDMARK_CLEARANCE + reach + extra);
          out2.push({ x: centre.x + left.x * t, z: centre.z + left.z * t, rotationY: heading, halfX: size.x / 2, halfZ: size.z / 2 });
        }
      }
    }
    return out2;
  };

  const firstSegment = (test: (id: string) => boolean): PlacedSegment | undefined => {
    for (const id of input.throughIds) if (test(id) && byId.has(id)) return byId.get(id);
    return undefined;
  };

  // -- The home beacon ------------------------------------------------------
  // Beside the plaza, on whichever clear site the most of the ring's road can
  // read it from (within `BEACON_READ_METRES`), nearest the plaza on a tie.
  const plaza = firstSegment((id) => id.startsWith('plaza@'));
  if (plaza !== undefined) {
    const size = LANDMARK_SIZES.beacon;
    const origin = centrelineAt(plaza.entry, plaza.spec, plaza.spec.length / 2);
    let best: { f: Footprint; seen: number; near: number } | null = null;
    for (const fraction of [0.2, 0.5, 0.8]) {
      for (const f of sitesBeside(plaza, fraction, size)) {
        if (!fits(f)) continue;
        let seen = 0;
        for (const point of samples) if (Math.hypot(point.x - f.x, point.z - f.z) <= BEACON_READ_METRES) seen += 1;
        const near = Math.hypot(f.x - origin.x, f.z - origin.z);
        if (best === null || seen > best.seen || (seen === best.seen && near < best.near)) best = { f, seen, near };
      }
    }
    if (best !== null) placeLandmark('beacon', best.f, size);
  }

  // -- One landmark at a junction of every other quarter --------------------
  const landmarks: { look: BuildingLook; at: (id: string) => boolean; fraction: number; quarter: RingQuarter }[] = [
    // The fork's mouth, where the alley leaves the residential road.
    { look: 'steeple', at: (id) => id.startsWith('fork@'), fraction: 0.15, quarter: 'residential' },
    // The park gate, where the town gives way to the park.
    { look: 'clockTower', at: (id) => id.startsWith('park-gate@'), fraction: 0.1, quarter: 'park' },
    // The trailhead, where the gravel meets the berm trail.
    { look: 'lookout', at: (id) => id.startsWith('trailhead@'), fraction: 0.2, quarter: 'trails' },
    // The yard's junction, where the yard road meets the return climb.
    { look: 'waterTower', at: (id) => id.startsWith('return-climb@'), fraction: 0.05, quarter: 'industrial' },
    // Mid-yard, on the yard road itself.
    { look: 'chimneys', at: (id) => input.quarterOf.get(id) === 'industrial' && !id.startsWith('return-'), fraction: 0.5, quarter: 'industrial' },
  ];
  for (const landmark of landmarks) {
    const segment = firstSegment(landmark.at);
    if (segment === undefined) continue;
    const size = LANDMARK_SIZES[landmark.look as keyof typeof LANDMARK_SIZES];
    const radius = silhouetteRadius(landmark.look, size);
    // Its own junction's sites first; then, only if none of them keeps every
    // sightline, the rest of its quarter's through road, nearest first — a
    // landmark a few metres down its own street that reads beats one at the
    // junction standing behind another.
    const anchor = centrelineAt(segment.entry, segment.spec, segment.spec.length * landmark.fraction);
    const farFromAnchor = (other: PlacedSegment): number => {
      const mid = centrelineAt(other.entry, other.spec, other.spec.length / 2);
      return Math.hypot(mid.x - anchor.x, mid.z - anchor.z);
    };
    const others = input.throughIds
      .filter((id) => id !== segment.spec.id && input.quarterOf.get(id) === landmark.quarter)
      .flatMap((id) => byId.get(id) ?? [])
      .sort((a, b) => farFromAnchor(a) - farFromAnchor(b));
    const candidates = function* (): Generator<Footprint> {
      yield* sitesBeside(segment, landmark.fraction, size);
      for (const other of others) yield* sitesBeside(other, 0.5, size);
    };
    // The first clear site that keeps every sightline; failing that, the
    // clear site whose worst sightline is widest.
    let best: { f: Footprint; gap: number } | null = null;
    for (const f of candidates()) {
      if (!fits(f)) continue;
      const me: Silhouette = { x: f.x, z: f.z, radius };
      let gap = Infinity;
      for (const other of silhouettes) gap = Math.min(gap, worstSightGap(line, other, me));
      if (best === null || gap > best.gap) best = { f, gap };
      if (gap >= LANDMARK_SIGHT_GAP) break;
    }
    if (best !== null) placeLandmark(landmark.look, best.f, size);
  }

  // -- The yard's sheds -----------------------------------------------------
  // Long low sheds along the industrial quarter's road, two rows deep: the
  // front row one verge behind the kerb, as every frontage stands — on a yard
  // road in a cutting, the top of the bank, where the whole wall shows above
  // the crest — and a back row behind it, so the yard reads as a yard and not
  // as a line of garages. Slots run every `SHED_SPACING` metres along the
  // yard road as one street, across its short joins, rather than restarting on
  // every segment (Codex QA: one slot per short join left most of a yard's
  // front row unplaced on the tight bends and only the back row, 45–55 m off
  // the road, standing). Every slot spends the same four draws whether or not
  // a shed lands, so the stream advances by the yard's length and nothing else.
  const stations: { segment: PlacedSegment; s: number }[] = [];
  let next = SHED_SPACING / 2;
  for (const id of input.throughIds) {
    const segment = byId.get(id);
    if (segment === undefined || input.quarterOf.get(id) !== 'industrial') {
      next = SHED_SPACING / 2;
      continue;
    }
    let s = next;
    for (; s < segment.spec.length; s += SHED_SPACING) stations.push({ segment, s });
    next = s - segment.spec.length;
  }
  const shedFits = (f: Footprint): boolean => {
    // A shed may stand one verge behind its own kerb; the landmark rule's
    // extra three metres is for things that are also landmarks.
    for (const [x, z] of footprintPoints(f)) if (clearance(x, z) < SHED_SETBACK) return false;
    if (blocks.some((block) => overlaps(f, block, BLOCK_GAP))) return false;
    return !taken.some((other) => overlaps(f, other, BUILDING_GAP));
  };
  for (const { segment, s } of stations) {
    const spec = segment.spec;
    for (const side of [1, -1]) {
      for (const row of [0, 1]) {
        const keep = draw();
        const depth = 16 + draw() * 8;
        const width = 20 + draw() * 8;
        // The back row is the yard's taller warehouses, so its saw-edged roofs
        // read over the front row and over a cutting's bank.
        const height = (row === 0 ? 5.6 : SHED_BACK_ROW_LIFT + 5.6) + draw() * 2.2;
        if (keep > 0.9) continue;
        let site: Footprint | null = null;
        for (const back of SHED_NUDGE_OUT) {
          for (const along of SHED_NUDGE_ALONG) {
            const at = Math.min(spec.length, Math.max(0, s + along));
            const centre = centrelineAt(segment.entry, spec, at);
            const heading = headingAt(segment.entry, spec, at);
            const left = leftOf(heading);
            const t = side * (spec.halfWidth + SHED_SETBACK + row * SHED_ROW_DEPTH + back + depth / 2);
            const f: Footprint = { x: centre.x + left.x * t, z: centre.z + left.z * t, rotationY: heading, halfX: depth / 2, halfZ: width / 2 };
            if (shedFits(f)) { site = f; break; }
          }
          if (site !== null) break;
        }
        if (site !== null) place('industrial', site, { x: depth, y: height, z: width });
      }
    }
  }

  return out;
}
