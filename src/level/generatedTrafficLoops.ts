/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Explicit vehicle-loop authoring. No use of reversible streetLoops. */
import { POPULATION_AUTHORING as R } from '../data/tuning.ts';
import { dubins, threeArcs, type RingQuarter } from './cityRing.ts';
import type { LevelPlan } from './plan.ts';
import { buildPopulationPlan, createPopulationValidationContext, emitPopulationPaths, populationSpanFootprints,
  surfaceFootprintClear, withPopulationAuthoringMemo, type AuthoredPathFrame, type AuthoredPopulationPath, type District,
  type PopulationValidationContext } from './populationPlan.ts';
import { querySegment, type PlacedSegment } from './segments.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { candidateClearanceRadius, effectivePopulationBands, type BoundedPopulationStep } from './generatedPopulationRequests.ts';

interface Pose { readonly x: number; readonly z: number; readonly h: number }
interface JoinGeometry { readonly lengths: readonly number[]; readonly curvatures: readonly number[]; readonly label: string }
export interface GeneratedTrafficReport {
  readonly authored: readonly AuthoredPopulationPath[];
  readonly rejected: readonly { readonly id: string; readonly reason: string }[];
  readonly missingDistrictLoops: readonly ('commercial' | 'residential')[];
}
const angle = (n: number): number => Math.atan2(Math.sin(n), Math.cos(n));
const armParts = ['in', 'align', 'street', 'street-b', 'return', 'out'] as const;
const roadSurfaces: ReadonlySet<SurfaceId> = new Set(['pavement', 'roughPavement']);
// Chord-based turn validation is slightly stricter than analytic arc curvature.
// A 0.25 m authoring margin avoids a nominal R7 failing on every sampled chord.
const radius = R.minimumVehicleTurnRadiusMetres + R.groundProbeSpacingMetres;
const footprint = candidateClearanceRadius('traffic') + R.staticClearanceMetres;

function pose(frame: AuthoredPathFrame): Pose { return { x: frame.x, z: frame.z, h: frame.headingY }; }

/** Analytic circle/straight integration, not a chord or Hermite turn invention. */
function advance(from: Pose, length: number, curvature: number): Pose {
  if (Math.abs(curvature) < R.epsilon) return { x: from.x + Math.sin(from.h) * length,
    z: from.z + Math.cos(from.h) * length, h: from.h };
  const h = from.h + length * curvature;
  return { x: from.x + (Math.cos(from.h) - Math.cos(h)) / curvature,
    z: from.z + (Math.sin(h) - Math.sin(from.h)) / curvature, h: angle(h) };
}

function joinGeometries(from: Pose, to: Pose): readonly JoinGeometry[] {
  const options: JoinGeometry[] = dubins(from, to, radius).map(option => ({
    lengths: [Math.abs(option.turns[0]) * radius, option.straight, Math.abs(option.turns[1]) * radius],
    curvatures: [Math.sign(option.turns[0]) / radius, 0, Math.sign(option.turns[1]) / radius],
    label: option.kind,
  }));
  for (const turns of threeArcs(from, to, radius)) options.push({
    lengths: turns.map(n => Math.abs(n) * radius),
    curvatures: turns.map(n => Math.sign(n) / radius),
    label: `three-${turns.map(Math.sign).join('-')}`,
  });
  // Sort only newly authored turn alternatives, never generator pieces/props.
  return options.filter(option => option.lengths.reduce((a, b) => a + b, 0) < radius * Math.PI * 5)
    .sort((a, b) => Math.round((a.lengths.reduce((x, y) => x + y, 0)
      - b.lengths.reduce((x, y) => x + y, 0)) * 1e6));
}

/** effectivePopulationBands per spec for one synchronous candidate search. It
 * is a pure function of the unchanged spec; a throwing spec is never stored. */
type BandMemo = Map<PlacedSegment['spec'], ReturnType<typeof effectivePopulationBands>>;
function bandsOf(spec: PlacedSegment['spec'], memo: BandMemo | undefined): ReturnType<typeof effectivePopulationBands> {
  if (!memo) return effectivePopulationBands(spec);
  let bands = memo.get(spec);
  if (bands === undefined) { bands = effectivePopulationBands(spec); memo.set(spec, bands); }
  return bands;
}
function sourceReference(point: Pose, roads: readonly PlacedSegment[], requiredWidth: number,
  memo?: BandMemo): AuthoredPathFrame | null {
  for (const road of roads) {
    const q = querySegment(road, point.x, point.z);
    if (!q || q.outside > R.epsilon) continue;
    const band = bandsOf(road.spec, memo).find(b => q.s >= b.fromS && q.s < b.toS + R.epsilon
      && q.t >= b.from && q.t < b.to && roadSurfaces.has(b.surface));
    if (!band) continue;
    const halfWidth = Math.min(q.t - band.from, band.to - q.t);
    if (halfWidth < requiredWidth) continue;
    return { x: point.x, y: q.height, z: point.z, headingY: point.h,
      distanceMetres: 0, sourceSegmentId: road.spec.id, halfWidthMetres: halfWidth };
  }
  return null;
}

function joinFrames(from: Pose, to: Pose, geometry: JoinGeometry, roads: readonly PlacedSegment[],
  memo?: BandMemo): AuthoredPathFrame[] | null {
  const frames: AuthoredPathFrame[] = [];
  let entry = from;
  for (let piece = 0; piece < geometry.lengths.length; piece += 1) {
    const length = geometry.lengths[piece];
    if (length <= R.epsilon) continue;
    const count = Math.max(1, Math.ceil(length / R.traceSpacingMetres));
    for (let i = 0; i <= count; i += 1) {
      if (frames.length > 0 && i === 0) continue;
      const p = advance(entry, length * i / count, geometry.curvatures[piece]);
      const reference = sourceReference(p, roads, footprint, memo);
      if (!reference) return null;
      // Finite source preflight: a candidate turn must remain supported by the
      // nominated original block roads, not a coincident paved plaza/apron.
      for (let direction = 0; direction < 16; direction += 1) {
        const theta = direction * Math.PI / 8;
        if (!sourceReference({ x: p.x + Math.cos(theta) * footprint,
          z: p.z + Math.sin(theta) * footprint, h: p.h }, roads, 0, memo)) return null;
      }
      frames.push(reference);
    }
    entry = advance(entry, length, geometry.curvatures[piece]);
  }
  if (Math.hypot(entry.x - to.x, entry.z - to.z) > R.joinToleranceMetres
    || Math.abs(angle(entry.h - to.h)) > R.joinHeadingToleranceRadians) return null;
  return frames;
}

function supportedJoins(from: Pose, to: Pose, roads: readonly PlacedSegment[], memo?: BandMemo) {
  const result: { frames: AuthoredPathFrame[]; label: string }[] = [];
  for (const geometry of joinGeometries(from, to)) {
    const frames = joinFrames(from, to, geometry, roads, memo);
    if (frames && frames.length > 1) result.push({ frames, label: geometry.label });
    if (result.length === 2) break;
  }
  return result;
}

function recomputeDistance(pieces: readonly (readonly AuthoredPathFrame[])[]): AuthoredPathFrame[] | null {
  const frames: AuthoredPathFrame[] = [];
  let travelled = 0;
  for (const piece of pieces) for (const frame of piece) {
    const previous = frames.at(-1);
    if (previous) {
      const gap = Math.hypot(frame.x - previous.x, frame.z - previous.z);
      if (gap < R.epsilon) {
        if (Math.abs(angle(frame.headingY - previous.headingY)) > R.joinHeadingToleranceRadians) return null;
        continue;
      }
      if (gap > R.maximumSourceSpacingMetres + R.epsilon) return null;
      travelled += gap;
    }
    frames.push({ ...frame, distanceMetres: travelled });
  }
  return frames;
}

/**
 * Explicit finite strategy for the two genuinely authored district blocks:
 * forward main arm, reverse side arm, with TWO sampled analytic radius joins
 * inside the actual paved Y junctions. No instantaneous reversal at a socket.
 * At most 24 candidates per block (three trim fractions × two lane habits ×
 * two supported entry turns × two supported exit turns); absent support stays absent.
 */
export function generatedTrafficLoopCandidates(
  placed: readonly PlacedSegment[], quarterOf: ReadonlyMap<string, RingQuarter>,
): readonly AuthoredPopulationPath[] {
  const byId = new Map(placed.map(p => [p.spec.id, p]));
  const candidates: AuthoredPopulationPath[] = [];
  const bands: BandMemo = new Map();
  for (const district of ['commercial', 'residential'] as const) {
    const prefix = `city-${district}`;
    const main = armParts.map(p => byId.get(`${prefix}-main-${p}`));
    const side = armParts.map(p => byId.get(`${prefix}-side-${p}`));
    const ids = [...main, ...side, byId.get(`${prefix}-entry`), byId.get(`${prefix}-exit`)];
    const quarter = district === 'commercial' ? 'downtown' : 'residential';
    if (ids.some(p => !p || quarterOf.get(p.spec.id) !== quarter)) continue;
    const roads = ids as PlacedSegment[];
    for (const trimShare of [0.30, 0.45, 0.60]) for (const lane of [-1.5, 1.5]) {
      const steps = (arm: readonly (PlacedSegment | undefined)[], reverse: boolean): BoundedPopulationStep[] => {
        const result = arm.map((p, i) => {
          const source = p!;
          return { segmentId: source.spec.id, lateralMetres: reverse ? -lane : lane,
            halfWidthMetres: footprint, fromS: i === 0 ? source.spec.length * trimShare : 0,
            toS: i === arm.length - 1 ? source.spec.length * (1 - trimShare) : source.spec.length,
            forward: !reverse };
        });
        return reverse ? result.reverse() : result;
      };
      let a: AuthoredPopulationPath, b: AuthoredPopulationPath;
      try {
        [a] = emitPopulationPaths(roads, [{ id: `${prefix}/main`, role: 'traffic', district,
          steps: steps(main, false) }]);
        [b] = emitPopulationPaths(roads, [{ id: `${prefix}/side`, role: 'traffic', district,
          steps: steps(side, true) }]);
      } catch { continue; }
      const entryJoins = supportedJoins(pose(b.frames.at(-1)!), pose(a.frames[0]), roads, bands);
      const exitJoins = supportedJoins(pose(a.frames.at(-1)!), pose(b.frames[0]), roads, bands);
      for (let first = 0; first < entryJoins.length; first += 1) for (let last = 0; last < exitJoins.length; last += 1) {
        const frames = recomputeDistance([a.frames, exitJoins[last].frames, b.frames, entryJoins[first].frames]);
        if (!frames || frames.length < 2) continue;
        candidates.push({ id: `population/${prefix}/traffic-${Math.round(trimShare * 100)}-${lane}-${first}-${last}`,
          role: 'traffic', district, closed: true, serviceShuttle: false, frames });
      }
    }
  }
  return candidates;
}

/**
 * Run AFTER target/trick/lap/precise-paving composition is final. The original
 * owner validates turns, ground, all exclusions and closure. Additional exact
 * finished surface clipping forbids using brick sidewalks as a traffic lane.
 * Return authored traces to combine with ALL requests in one population build.
 */
export function validateGeneratedTrafficLoops(
  plan: LevelPlan, candidates: readonly AuthoredPopulationPath[],
): GeneratedTrafficReport {
  // The footprint preflight and each candidate's population build share the
  // verified footprint memo for this one synchronous validation.
  return withPopulationAuthoringMemo(() => validateTrafficLoops(plan, candidates));
}
function validateTrafficLoops(plan: LevelPlan, candidates: readonly AuthoredPopulationPath[]): GeneratedTrafficReport {
  const authored: AuthoredPopulationPath[] = [];
  const rejected: { id: string; reason: string }[] = [];
  const sampler = new PlanTerrainSampler(plan);
  // One call-scoped preparation of this unchanged plan serves every candidate:
  // the same patch cells and the same freshly derived validation data each
  // separate default context would rebuild. Span proofs are keyed by path.
  let context: PopulationValidationContext | undefined;
  const prepared = (): PopulationValidationContext => context ??= createPopulationValidationContext(plan);
  for (const candidate of candidates) {
    if (authored.some(p => p.district === candidate.district)) continue;
    if (candidate.frames.some((frame, i) => i > 0
      && populationSpanFootprints(plan, sampler, candidate.frames[i - 1], frame, 'traffic')
        .some(footprint => !surfaceFootprintClear(plan, footprint.polygon, roadSurfaces, prepared())))) {
      rejected.push({ id: candidate.id, reason: 'finished road footprint leaves vehicle pavement' }); continue;
    }
    const result = buildPopulationPlan(plan, [candidate], sampler, prepared());
    if (result.paths.length !== 1 || !result.paths[0].closed || result.report.rejected.length > 0) {
      rejected.push({ id: candidate.id, reason: result.report.rejected.map(r => r.reason).join(',') || 'not a complete closed route' });
      continue;
    }
    authored.push(candidate);
  }
  return { authored, rejected,
    missingDistrictLoops: (['commercial', 'residential'] as const).filter(d => !authored.some(p => p.district === d)) };
}

/** For a genuinely authored parking apron, not a guess from an industrial road. */
export interface IndustrialParkingTopology {
  readonly district: Extract<District, 'industrial'>;
  readonly warehousePropIndex: number;
  readonly baySourceSegmentId: string;
  /** Actual off-lane bay centreline and bounded station range, painted by its source. */
  readonly parkingStep: BoundedPopulationStep;
  readonly approachSteps: readonly BoundedPopulationStep[];
  /** Entry/exit joins need real >= radius geometry and finished-footprint validation. */
  readonly approachTurnRadiusMetres: number;
}
