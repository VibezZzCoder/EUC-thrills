/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Explicit generated movement bands. No source-stream draws or layout writes. */
import { POPULATION, POPULATION_AUTHORING as R, POPULATION_OCCUPANT } from '../data/tuning.ts';
import type { RingQuarter } from './cityRing.ts';
import type { PopulationPathRequest, PathRole, District } from './populationPlan.ts';
import { surfaceAtLateral, type PlacedSegment, type SegmentBlock, type SegmentSpec } from './segments.ts';
import type { SurfaceId } from '../simulation/world.ts';

type OriginalStep = PopulationPathRequest['steps'][number];
export interface BoundedPopulationStep extends OriginalStep {
  /** Absolute stations in the ORIGINAL segment, independent of travel direction. */
  readonly fromS: number;
  readonly toS: number;
}
export interface BoundedPopulationPathRequest extends Omit<PopulationPathRequest, 'steps'> {
  readonly steps: readonly BoundedPopulationStep[];
}
interface BandRectangle {
  readonly from: number; readonly to: number;
  readonly fromS: number; readonly toS: number;
  readonly surface: SurfaceId; readonly sourceBand: number | null;
}

/** Match simulation's yawed rectangular hull corners, not only its half-width. */
export function candidateClearanceRadius(role: PathRole): number {
  const humanHalfExtent = role === 'rider' ? R.riderRadiusMetres : R.pedestrianRadiusMetres;
  return role === 'traffic' || role === 'service'
    ? Math.hypot(R.vehicleHalfWidthMetres, R.vehicleHalfLengthMetres)
    : Math.hypot(humanHalfExtent, humanHalfExtent);
}

function winner(spec: SegmentSpec, t: number, s: number): number | null {
  const bands = spec.bands ?? [];
  for (let i = 0; i < bands.length; i += 1) {
    const b = bands[i];
    if (t >= Math.min(b.from, b.to) && t < Math.max(b.from, b.to)
      && s >= (b.fromS ?? -Infinity) && s < (b.toS ?? Infinity)) return i;
  }
  return null;
}

/** First authored band wins, including ranged overlays. Derived cuts do not reorder input bands. */
export function effectivePopulationBands(spec: SegmentSpec): readonly BandRectangle[] {
  if (!(spec.length > 0 && spec.halfWidth > 0) || !Number.isFinite(spec.length + spec.halfWidth)) return [];
  const x = new Set([-spec.halfWidth, spec.halfWidth]);
  const s = new Set([0, spec.length]);
  for (const b of spec.bands ?? []) {
    if (![b.from, b.to, b.fromS ?? 0, b.toS ?? spec.length].every(Number.isFinite)) {
      throw new Error(`Non-finite population source band on ${spec.id}`);
    }
    x.add(Math.max(-spec.halfWidth, Math.min(spec.halfWidth, b.from)));
    x.add(Math.max(-spec.halfWidth, Math.min(spec.halfWidth, b.to)));
    s.add(Math.max(0, Math.min(spec.length, b.fromS ?? 0)));
    s.add(Math.max(0, Math.min(spec.length, b.toS ?? spec.length)));
  }
  const lateral = [...x].sort((a, b) => a - b);
  const stations = [...s].sort((a, b) => a - b);
  const rectangles: BandRectangle[] = [];
  for (let row = 1; row < stations.length; row += 1) {
    for (let column = 1; column < lateral.length; column += 1) {
      const from = lateral[column - 1], to = lateral[column];
      const fromS = stations[row - 1], toS = stations[row];
      if (to <= from || toS <= fromS) continue;
      const t = (from + to) / 2, along = (fromS + toS) / 2;
      rectangles.push({ from, to, fromS, toS,
        surface: surfaceAtLateral(spec, t, along), sourceBand: winner(spec, t, along) });
    }
  }
  // Only merge touching station rectangles with identical factual lateral policy.
  const merged: BandRectangle[] = [];
  for (const rectangle of rectangles) {
    const previous = merged.findIndex(b => b.from === rectangle.from && b.to === rectangle.to
      && b.surface === rectangle.surface && b.sourceBand === rectangle.sourceBand && b.toS === rectangle.fromS);
    if (previous < 0) merged.push(rectangle);
    else merged[previous] = { ...merged[previous], toS: rectangle.toS };
  }
  return merged;
}

function subtractRanges(from: number, to: number, blocks: readonly (readonly [number, number])[]): [number, number][] {
  let result: [number, number][] = [[from, to]];
  for (const [low, high] of blocks) {
    result = result.flatMap(([a, b]): [number, number][] => {
      if (high <= a || low >= b) return [[a, b]];
      const pieces: [number, number][] = [];
      if (low > a) pieces.push([a, Math.min(b, low)]);
      if (high < b) pieces.push([Math.max(a, high), b]);
      return pieces;
    });
  }
  return result;
}

/**
 * Sight lines past tall source blocks. The rider's eye is about 1.5 m up and
 * an actor reads from about 1 m, so a block taller than this hides a lane end
 * placed right behind it: the park-gate piers hid walkers and NPC riders until
 * 2-6 m away. An NPC ride lane reaching into the line of the opening such a
 * block leaves ends the margin past it, and further where the line from the
 * corridor's centre over the block's inner corner would still meet it nearer
 * than `distanceMetres` (22 m measures at least 20 m from an eye on the actual
 * route). The 4 m floor is the most the gate's finished 24.45 m ride lane can
 * give up above its 20 m minimum; 8-10 m would delete the NPC rider. Walking
 * lanes keep their whole length and side: a walker there is met only by a
 * rider steering out behind the pier, and both remedies cost content. The
 * margin thinned the park beds laid out along the lane; stepping the lane out
 * of the line won no sight and, past the 10 m person spacing to the far verge,
 * pulled a town walker into the park on 15 of 40 seeds.
 */
const SIGHT = Object.freeze({ blockHeightMetres: 1.2, marginMetres: 4, distanceMetres: 22 });

function requestLane(
  output: BoundedPopulationPathRequest[], source: PlacedSegment, role: PathRole, district: District,
  rectangle: BandRectangle, label: string, serviceShuttle = false,
): void {
  const radius = candidateClearanceRadius(role);
  const clearance = radius + R.staticClearanceMetres;
  const minimum = role === 'rider' ? R.minimumRideMetres : R.minimumWalkMetres;
  const blocks = source.spec.blocks ?? [];
  const stops = (b: SegmentBlock, t: number): boolean => Math.abs(b.t - t) <= b.halfLateral + clearance;
  // Only a tall block the lane itself stops at hides the lane's end. Blocks
  // merely beside a lane (warehouse walls, verge trees) keep their lanes whole.
  const hides = (b: SegmentBlock, t: number): boolean => b.height > SIGHT.blockHeightMetres && stops(b, t);
  // Clear of the opening's line: an actor here meets a rider coming through
  // the opening only if that rider steers out behind the block.
  const keep = radius + POPULATION_OCCUPANT.halfWidthMetres;
  const sightMargin = (b: SegmentBlock, t: number): number => {
    // Only a face between the centreline and the lane leaves an opening to see through.
    const face = b.t > 0 ? b.t - b.halfLateral : b.t + b.halfLateral, share = face / t;
    if (!(share > 0 && share < 1)) return SIGHT.marginMetres;
    if (Math.abs(t) - keep >= Math.abs(face)) return 0;
    return Math.max(SIGHT.marginMetres, SIGHT.distanceMetres * (1 - share) - clearance);
  };
  const chunks = (t: number, halfWidth: number, sight: boolean): [number, number][] => {
    if (halfWidth < clearance + R.epsilon) return [];
    const from = rectangle.fromS + clearance + R.joinToleranceMetres;
    const to = rectangle.toS - clearance - R.joinToleranceMetres;
    // Source-local geometry is excluded before tracing. Finished-plan hazards,
    // trick zones, props, precise paving, targets/gates/laps remain final-owner checks.
    const blocked = blocks.filter(b => stops(b, t)).map(b => {
      const margin = sight && hides(b, t) ? sightMargin(b, t) : 0;
      return [b.s - b.halfAlong - clearance - margin, b.s + b.halfAlong + clearance + margin] as const;
    });
    return subtractRanges(from, to, blocked);
  };
  const admitted = ([fromS, toS]: readonly [number, number]): boolean => toS - fromS >= minimum
    && !(role === 'service' && toS - fromS > R.maximumServiceShuttleMetres);
  let t = (rectangle.from + rectangle.to) / 2;
  let halfWidth = (rectangle.to - rectangle.from) / 2;
  // Only an NPC rider's lane takes the sight margin: a wide hull shuttling at
  // speed whose inner edge reaches into the opening's line (see SIGHT).
  let pieces = chunks(t, halfWidth, role === 'rider');
  const unsighted = chunks(t, halfWidth, false);
  if (pieces.filter(admitted).length < unsighted.filter(admitted).length) {
    // The margin would drop a lane under its minimum. Keep the person: move
    // the lane deeper behind the block instead, so the actor's hull and a
    // passing rider's stay clear of the opening the block's inner face leaves.
    let low = rectangle.from, high = rectangle.to, behind = true;
    for (const b of blocks) {
      if (!hides(b, t)) continue;
      // Only a face inside the corridor leaves an opening a rider can use.
      const faceLow = b.t - b.halfLateral, faceHigh = b.t + b.halfLateral;
      if (t < faceLow || t > faceHigh) { behind = false; break; }
      if (Math.abs(faceLow) < source.spec.halfWidth) low = Math.max(low, faceLow + keep);
      if (Math.abs(faceHigh) < source.spec.halfWidth) high = Math.min(high, faceHigh - keep);
    }
    const shifted = Math.min(Math.max(t, low), high);
    const shiftedHalf = Math.min(shifted - rectangle.from, rectangle.to - shifted);
    const moved = behind && low <= high ? chunks(shifted, shiftedHalf, false) : [];
    if (moved.filter(admitted).length >= unsighted.filter(admitted).length) {
      t = shifted; halfWidth = shiftedHalf; pieces = moved;
    }
  }
  // Number each piece by the unsighted piece holding it, so a margin that
  // swallows a short piece before a pier renames no surviving lane.
  const numbering = pieces === unsighted ? unsighted : chunks(t, halfWidth, false);
  pieces.forEach(([fromS, toS]) => {
    if (!admitted([fromS, toS])) return;
    const chunk = numbering.findIndex(([low, high]) => low <= fromS && toS <= high);
    output.push({ id: `population/${source.spec.id}/${label}/${chunk}`, role, district,
      steps: [{ segmentId: source.spec.id, lateralMetres: t,
        halfWidthMetres: halfWidth, fromS, toS }],
      ...(serviceShuttle ? { serviceShuttle: true } : {}) });
  });
}

const townBlock = /^city-(commercial|residential)-(?:entry|exit|cross|(?:main|side)-(?:in|align|street|street-b|return|out))$/;
const baselineId = (id: string): string => id.replace(/@[^@]+$/, '');
const parkPaths = new Set(['park-gate', 'riverside', 'riverside-lower', 'gravel-spur']);

/**
 * Deterministic requests from actual placed specs and factual quarters.
 * Does not accept a seed stream, socket reconstruction, streetLoops, world options
 * or renderer. Output preserves the source order; ids name original source facts.
 */
export function generatedPopulationRequests(
  placed: readonly PlacedSegment[], quarterOf: ReadonlyMap<string, RingQuarter>,
): readonly BoundedPopulationPathRequest[] {
  const requests: BoundedPopulationPathRequest[] = [];
  for (const source of placed) {
    const spec = source.spec;
    const quarter = quarterOf.get(spec.id);
    const districtMatch = townBlock.exec(spec.id);
    const rectangles = effectivePopulationBands(spec);
    if (districtMatch) {
      const district = districtMatch[1] as 'commercial' | 'residential';
      if (quarter !== (district === 'commercial' ? 'downtown' : 'residential')) continue;
      rectangles.forEach((b, i) => {
        if (b.surface === 'brick' && b.sourceBand !== null) {
          requestLane(requests, source, 'pedestrian', district, b, `sidewalk-band-${b.sourceBand}-${i}`);
        }
      });
      continue;
    }
    const id = baselineId(spec.id);
    // A closing road's quarter is park but its original family was discarded;
    // do not guess that a generic `close-*` paved road is a shared park path.
    const neutralParkPath = spec.id.startsWith('link-path-steer') && spec.surface === 'pavement';
    if (quarter === 'park' && (parkPaths.has(id) || neutralParkPath)) {
      rectangles.forEach((b, i) => {
        if (b.surface === 'grass' && b.sourceBand !== null) {
          requestLane(requests, source, 'pedestrian', 'park', b, `park-verge-${b.sourceBand}-${i}`);
        } else if (b.sourceBand === null && (b.surface === 'pavement' || (id === 'gravel-spur' && b.surface === 'gravel'))) {
          // A shared path is explicitly a park source. Reserve one side for
          // walkers where the native corridor is wide enough; riders use the
          // other side. Neither is a universal-road classification.
          const width = b.to - b.from;
          const walk: BandRectangle = { ...b, to: b.from + width * 0.375 };
          const ride: BandRectangle = { ...b, from: b.from + width * 0.55 };
          requestLane(requests, source, 'pedestrian', 'park', walk, `park-path-walk-${i}`);
          requestLane(requests, source, 'rider', 'park', ride, `park-path-ride-${i}`);
        }
      });
      continue;
    }
    if (quarter !== 'industrial' || spec.surface !== 'roughPavement'
      || !(id === 'return-climb' || id === 'return-plaza' || spec.id.startsWith('link-rough-steer'))) continue;
    const warehouses = (spec.props ?? []).filter(p => p.kind === 'building' && p.look === 'industrial'
      && p.size !== undefined && Math.abs(p.t) > spec.halfWidth);
    // Rough roads alone prove no workplace. The original warehouse and its
    // actual local frontage station must both exist; no invented industrial block.
    warehouses.forEach((warehouse, i) => {
      const sign = Math.sign(warehouse.t);
      const localWidth = warehouse.size!.z;
      for (const role of ['pedestrian', 'service'] as const) {
        const clearance = candidateClearanceRadius(role) + R.staticClearanceMetres;
        // Both lanes hug the frontage edge, and the bands alone left the
        // worker's lane inside the van's waiting gap: the van waited on him for
        // the whole session (POP-2). The van's lane sits in from the edge far
        // enough to keep its body, its waiting gap, the worker's gap and body.
        const inset = role === 'service' ? Math.max(0, R.vehicleHalfWidthMetres + POPULATION.vehicleWaitingGapMetres
          + POPULATION.humanWaitingGapMetres + R.pedestrianRadiusMetres
          - (candidateClearanceRadius('service') - candidateClearanceRadius('pedestrian'))) : 0;
        const edgeBand: BandRectangle = { from: sign < 0 ? -spec.halfWidth + inset : spec.halfWidth - 2 * clearance - 0.04 - inset,
          to: sign < 0 ? -spec.halfWidth + 2 * clearance + 0.04 + inset : spec.halfWidth - inset,
          fromS: Math.max(0, warehouse.s - (role === 'service' ? 10 : Math.min(14, localWidth / 2))),
          toS: Math.min(spec.length, warehouse.s + (role === 'service' ? 10 : Math.min(14, localWidth / 2))),
          surface: 'roughPavement', sourceBand: null };
        // Do not run a service vehicle through a later first-wins verge overlay.
        const eligible = rectangles.filter(b => b.surface === 'roughPavement'
          && b.from <= edgeBand.from && b.to >= edgeBand.to
          && b.fromS < edgeBand.toS && b.toS > edgeBand.fromS);
        eligible.forEach((b, j) => requestLane(requests, source, role, 'industrial', {
          ...edgeBand, fromS: Math.max(edgeBand.fromS, b.fromS), toS: Math.min(edgeBand.toS, b.toS),
        }, `${role === 'service' ? 'warehouse-service' : 'warehouse-worker'}-${i}-${j}`, role === 'service'));
      }
    });
  }
  return requests;
}
