/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Finished-plan living-world authoring. Every added surface stays on original
 * triangle planes; original roads, heights, props, solids and admission survive.
 * Named courts and driveway cuts are physical source data, not render hints. */
import { POPULATION_AUTHORING as R } from '../data/tuning.ts';
import type { LevelPlan, GroundSurfacePatch, Segment } from './plan.ts';
import type { Vec3, SurfaceId } from '../simulation/world.ts';
import { createGroundSample } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { dubins, threeArcs } from './cityRing.ts';
import { emitPopulationPaths, buildPopulationPlan, populationSpanFootprints,
  populationPathSpanReason, populationFootprintExclusion, surfaceFootprintClear, parkingBayReason,
  createPopulationValidationContext, type PopulationValidationContext,
  type AuthoredPathFrame, type AuthoredPopulationPath, type PopulationGroundSource,
  type PopulationCrossing, type AuthoredParkingBay, type District, type LivingWorldGroundReport,
  type FinishedFootpathRequest, type PopulationPath, type PopulationPlan } from './populationPlan.ts';
import { centrelineAt, headingAt, type PlacedSegment, type SegmentSpec } from './segments.ts';
import { clippedFieldTriangles, STREET_PAVING, validField } from './streetFronts.ts';
import { exactBuildingBody } from './protectedSiteEligibility.ts';
import { environmentSites } from './environmentSites.ts';

type Pose = { readonly x: number; readonly z: number; readonly h: number };
type Step = { segmentId: string; lateralMetres: number; halfWidthMetres: number;
  fromS: number; toS: number; forward: boolean };
type AuthoringFailure = { reason?: string; span?: number; sourceIds?: readonly string[] };
const SOURCE_PREFIX = 'living-ground/';
const ROAD = new Set<SurfaceId>(['pavement', 'roughPavement']);
const CLIP = { allowedSurfaces: ['grass', 'pavement', 'brick', 'roughPavement'] as const,
  maximumHeightDifference: STREET_PAVING.maximumHeightDifference,
  maximumGradient: R.maximumGroundGrade, maximumCellsPerPolygon: STREET_PAVING.maximumCellsPerPolygon };
const TURN_RADIUS = R.minimumVehicleTurnRadiusMetres + R.groundProbeSpacingMetres;
const VEHICLE_BAND = Math.hypot(R.vehicleHalfWidthMetres, R.vehicleHalfLengthMetres) + R.staticClearanceMetres + 0.08;
const wrap = (n: number): number => Math.atan2(Math.sin(n), Math.cos(n));
const pose = (p: AuthoredPathFrame): Pose => ({ x: p.x, z: p.z, h: p.headingY });
const parts = ['in', 'align', 'street', 'street-b', 'return', 'out'] as const;

/** Native constant-curvature sources retain both exact sockets. This resolves
 * that authored geometry, not a QA route, shortest walk, or streetLoops guess. */
function originalRoad(segment: Segment): PlacedSegment | null {
  const a = segment.entry, b = segment.exit, turn = b.headingY - a.headingY;
  const chord = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
  const length = Math.abs(turn) < R.epsilon ? chord : chord * turn / (2 * Math.sin(turn / 2));
  if (!(length > 0) || !Number.isFinite(length) || Math.abs(turn) > Math.PI + R.epsilon) return null;
  const spec: SegmentSpec = { id: segment.id, length, halfWidth: Math.min(a.halfWidth, b.halfWidth),
    surface: a.surface, curvature: turn / length, climb: b.position.y - a.position.y, linearClimb: true };
  const end = centrelineAt(a, spec, length);
  if (Math.hypot(end.x - b.position.x, end.z - b.position.z) > R.joinToleranceMetres) return null;
  return { spec, entry: a, exit: b, minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
}
function groundFrame(sampler: PlanTerrainSampler, p: Pose, sourceId: string): AuthoredPathFrame {
  return { x: p.x, y: sampler.sampleGround(p.x, p.z, createGroundSample()).height, z: p.z,
    headingY: wrap(p.h), distanceMetres: 0, sourceSegmentId: sourceId, halfWidthMetres: VEHICLE_BAND };
}
function advance(from: Pose, length: number, curvature: number): Pose {
  if (Math.abs(curvature) < R.epsilon) return { x: from.x + Math.sin(from.h) * length,
    z: from.z + Math.cos(from.h) * length, h: from.h };
  const h = from.h + length * curvature;
  return { x: from.x + (Math.cos(from.h) - Math.cos(h)) / curvature,
    z: from.z + (Math.sin(h) - Math.sin(from.h)) / curvature, h: wrap(h) };
}
function analyticJoin(sampler: PlanTerrainSampler, from: Pose, to: Pose,
  sourceId: string, alternative: number): AuthoredPathFrame[] | null {
  const choices = dubins(from, to, TURN_RADIUS).map(item => ({
    lengths: [Math.abs(item.turns[0]) * TURN_RADIUS, item.straight, Math.abs(item.turns[1]) * TURN_RADIUS],
    curves: [Math.sign(item.turns[0]) / TURN_RADIUS, 0, Math.sign(item.turns[1]) / TURN_RADIUS],
  }));
  for (const turns of threeArcs(from, to, TURN_RADIUS)) choices.push({
    lengths: turns.map(n => Math.abs(n) * TURN_RADIUS), curves: turns.map(n => Math.sign(n) / TURN_RADIUS) });
  choices.sort((a, b) => a.lengths.reduce((x, y) => x + y, 0) - b.lengths.reduce((x, y) => x + y, 0));
  const choice = choices.filter(item => item.lengths.reduce((a, b) => a + b, 0) < TURN_RADIUS * Math.PI * 5)[alternative];
  if (!choice) return null;
  const frames: AuthoredPathFrame[] = []; let entry = from;
  for (let piece = 0; piece < choice.lengths.length; piece += 1) {
    const length = choice.lengths[piece];
    if (length <= R.epsilon) continue;
    const count = Math.max(1, Math.ceil(length / R.traceSpacingMetres));
    for (let index = 0; index <= count; index += 1) {
      if (frames.length && index === 0) continue;
      frames.push(groundFrame(sampler, advance(entry, length * index / count, choice.curves[piece]), sourceId));
    }
    entry = advance(entry, length, choice.curves[piece]);
  }
  return frames.length > 1 && Math.hypot(entry.x - to.x, entry.z - to.z) <= R.joinToleranceMetres
    && Math.abs(wrap(entry.h - to.h)) <= R.joinHeadingToleranceRadians ? frames : null;
}
function distanceFrames(groups: readonly (readonly AuthoredPathFrame[])[]): AuthoredPathFrame[] | null {
  const frames: AuthoredPathFrame[] = []; let distance = 0;
  for (const group of groups) for (const frame of group) {
    const previous = frames.at(-1);
    if (previous) {
      const gap = Math.hypot(frame.x - previous.x, frame.z - previous.z);
      if (gap < R.epsilon) {
        if (Math.abs(wrap(frame.headingY - previous.headingY)) > R.joinHeadingToleranceRadians) return null;
        continue;
      }
      if (gap > R.maximumSourceSpacingMetres + R.epsilon) return null;
      distance += gap;
    }
    frames.push({ ...frame, distanceMetres: distance });
  }
  return frames;
}
function rectangle(points: readonly { x: number; z: number }[], origin: Vec3, yaw: number,
  padding = 0): Vec3[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = points.map(p => ({ x: c * (p.x - origin.x) - s * (p.z - origin.z),
    z: s * (p.x - origin.x) + c * (p.z - origin.z) }));
  const lowX = Math.min(...local.map(p => p.x)) - padding, highX = Math.max(...local.map(p => p.x)) + padding;
  const lowZ = Math.min(...local.map(p => p.z)) - padding, highZ = Math.max(...local.map(p => p.z)) + padding;
  return [[lowX, lowZ], [highX, lowZ], [highX, highZ], [lowX, highZ]].map(([x, z]) => ({
    x: origin.x + c * x + s * z, y: origin.y, z: origin.z - s * x + c * z }));
}

/** Diagnostic only, invoked after the authoritative clip rejected. This walks
 * the same intersected original planes to name its first exact failed guard. */
function originalClipFailure(plan: LevelPlan, polygon: readonly Vec3[], datum: number): string {
  const field = plan.heightfield;
  if (!validField(field)) return 'clip-invalid-field';
  const cross = (a: Vec3, b: Vec3, p: Vec3): number => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  if (polygon.length !== 4 || polygon.some(p => ![p.x, p.y, p.z].every(Number.isFinite))
    || polygon.some((p, i) => cross(p, polygon[(i + 1) % 4], polygon[(i + 2) % 4]) <= 1e-9)) return 'clip-invalid-polygon';
  const minX = Math.min(...polygon.map(p => p.x)), maxX = Math.max(...polygon.map(p => p.x));
  const minZ = Math.min(...polygon.map(p => p.z)), maxZ = Math.max(...polygon.map(p => p.z));
  if (minX < field.originX || minZ < field.originZ || maxX > field.originX + (field.columns - 1) * field.spacing
    || maxZ > field.originZ + (field.rows - 1) * field.spacing) return 'clip-field-boundary';
  const x0 = Math.max(0, Math.floor((minX - field.originX) / field.spacing));
  const x1 = Math.min(field.columns - 2, Math.floor((maxX - field.originX) / field.spacing));
  const z0 = Math.max(0, Math.floor((minZ - field.originZ) / field.spacing));
  const z1 = Math.min(field.rows - 2, Math.floor((maxZ - field.originZ) / field.spacing));
  if ((x1 - x0 + 1) * (z1 - z0 + 1) > CLIP.maximumCellsPerPolygon) return 'clip-cell-budget';
  for (let row = z0; row <= z1; row += 1) for (let column = x0; column <= x1; column += 1) {
    const base = row * field.columns + column, cell = row * (field.columns - 1) + column;
    const x = field.originX + column * field.spacing, z = field.originZ + row * field.spacing;
    const a = { x, y: field.heights[base], z }, b = { x: x + field.spacing, y: field.heights[base + 1], z };
    const c = { x, y: field.heights[base + field.columns], z: z + field.spacing };
    const d = { x: x + field.spacing, y: field.heights[base + field.columns + 1], z: z + field.spacing };
    for (const triangle of [[a, d, b], [a, c, d]]) {
      let clipped = triangle;
      for (let edge = 0; edge < 4 && clipped.length; edge += 1) {
        const next: Vec3[] = [], first = polygon[edge], last = polygon[(edge + 1) % 4];
        for (let i = 0; i < clipped.length; i += 1) {
          const from = clipped[i], to = clipped[(i + 1) % clipped.length], aa = cross(first, last, from), bb = cross(first, last, to);
          if (aa >= -1e-9) next.push(from);
          if ((aa >= -1e-9) !== (bb >= -1e-9)) {
            const t = aa / (aa - bb);
            next.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t });
          }
        }
        clipped = next;
      }
      if (clipped.length < 3 || !clipped.slice(1, -1).some((p, i) => Math.abs(cross(clipped[0], p, clipped[i + 2])) >= 1e-9)) continue;
      if (!(CLIP.allowedSurfaces as readonly SurfaceId[]).includes(field.surfaces[cell])) return `clip-source-surface:${field.surfaces[cell]}:cell-${cell}`;
      const difference = Math.max(...clipped.map(p => Math.abs(p.y - datum)));
      if (!Number.isFinite(difference) || difference > CLIP.maximumHeightDifference) return `clip-datum:${difference}>${CLIP.maximumHeightDifference}:cell-${cell}`;
      const [p, q, r] = triangle, ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z;
      const vx = r.x - p.x, vy = r.y - p.y, vz = r.z - p.z;
      const grade = Math.hypot(uy * vz - uz * vy, ux * vy - uy * vx) / (uz * vx - ux * vz);
      if (grade > CLIP.maximumGradient) return `clip-grade:${grade}>${CLIP.maximumGradient}:cell-${cell}`;
    }
  }
  return 'clip-empty-or-invalid-policy';
}
function patchSource(plan: LevelPlan, id: string, polygon: readonly Vec3[], hosts: readonly string[],
  purpose: PopulationGroundSource['purpose'], sourcePropIndex?: number, failure?: AuthoringFailure,
  context: PopulationValidationContext = createPopulationValidationContext(plan)):
  { source: PopulationGroundSource; patches: GroundSurfacePatch[]; crossing: boolean } | null {
  const width = Math.hypot(polygon[1].x - polygon[0].x, polygon[1].z - polygon[0].z);
  const length = Math.hypot(polygon[3].x - polygon[0].x, polygon[3].z - polygon[0].z);
  const fail = (reason: string): null => { if (failure) failure.reason = reason; return null; };
  if (!(width > 0 && length > 0) || width * length > 600 || Math.max(width, length) > 80) return fail('court-size');
  if (!surfaceFootprintClear(plan, polygon, new Set<SurfaceId>(CLIP.allowedSurfaces), context)) return fail('finished-surface-or-field-boundary');
  // Use the supported hard clip policy. Raising its datum allowance silently
  // invalidates the clip request even when every source triangle is flat.
  const triangles = clippedFieldTriangles(plan.heightfield, polygon, polygon[0].y, CLIP);
  if (!triangles?.length) return fail(originalClipFailure(plan, polygon, polygon[0].y));
  const excluded = populationFootprintExclusion(plan, { polygon, minY: Math.min(...triangles.flatMap(t => t.vertices.map(p => p.y))),
    maxY: Math.max(...triangles.flatMap(t => t.vertices.map(p => p.y))) + R.vehicleHeightMetres,
    fromFraction: 0, toFraction: 1, fromHull: { x: 0, z: 0, headingY: 0, halfWidthMetres: 1, halfLengthMetres: 1,
      minY: 0, maxY: 1, velocityX: 0, velocityZ: 0 }, toHull: { x: 0, z: 0, headingY: 0,
      halfWidthMetres: 1, halfLengthMetres: 1, minY: 0, maxY: 1, velocityX: 0, velocityZ: 0 } }, context);
  if (excluded) return fail(`protected-${excluded}`);
  const crossing = triangles.some(t => plan.heightfield.surfaces[t.cell] === 'brick');
  const patches: GroundSurfacePatch[] = [];
  // Brick changes only inside a named driveway court; the crossing descriptor
  // gives people priority there. All other sidewalks keep their old surface.
  for (const surface of ['grass', 'brick'] as const) {
    const fragments = triangles.filter(t => plan.heightfield.surfaces[t.cell] === surface);
    if (fragments.length) patches.push({ id: `${id}/${surface}`, sourceSurface: surface,
      surface: 'pavement', triangles: fragments });
  }
  return { source: { id, purpose: crossing && purpose === 'turn-court' ? 'driveway' : purpose,
    hostSegmentIds: [...new Set(hosts)], ...(sourcePropIndex === undefined ? {} : { sourcePropIndex }),
    polygons: [polygon], groundPatchIds: patches.map(p => p.id) }, patches, crossing };
}
function court(plan: LevelPlan, sampler: PlanTerrainSampler, frames: readonly AuthoredPathFrame[],
  sourceId: string, hosts: readonly string[], failure?: AuthoringFailure,
  context: PopulationValidationContext = createPopulationValidationContext(plan)): ReturnType<typeof patchSource> {
  if (failure) failure.sourceIds = hosts;
  const sources: PopulationGroundSource[] = [], patches: GroundSurfacePatch[] = [];
  let crossesSidewalk = false;
  // Overlapping short court pieces follow the actual swept vehicle. A tree or
  // hazard in the unused inside of a turn does not justify paving across it.
  for (let first = 0; first < frames.length - 1; first += 6) {
    const group = frames.slice(first, Math.min(frames.length, first + 7));
    const polygons = group.flatMap((frame, index) => index ? populationSpanFootprints(plan, sampler,
      group[index - 1], frame, 'traffic').map(item => item.polygon) : []);
    if (!polygons.length) { if (failure) { failure.reason = 'empty-vehicle-sweep'; failure.span = first + 1; } return null; }
    const prepared = patchSource(plan, `${sourceId}/piece-${first}`,
      rectangle(polygons.flat(), group[0], group[0].headingY, 0.08), hosts, 'turn-court', undefined, failure, context);
    if (!prepared) { if (failure) failure.span = first + 1; return null; }
    sources.push(prepared.source); patches.push(...prepared.patches); crossesSidewalk ||= prepared.crossing;
  }
  return sources.length ? { source: { id: sourceId, purpose: crossesSidewalk ? 'driveway' : 'turn-court',
    hostSegmentIds: [...new Set(hosts)], polygons: sources.flatMap(source => source.polygons),
    groundPatchIds: patches.map(patch => patch.id) }, patches, crossing: crossesSidewalk } : null;
}
function overlay(plan: LevelPlan, sources: readonly PopulationGroundSource[], patches: readonly GroundSurfacePatch[]): LevelPlan {
  return { ...plan, populationGroundSources: [...(plan.populationGroundSources ?? []), ...sources],
    groundSurfacePatches: [...(plan.groundSurfacePatches ?? []), ...patches] };
}
function crossingsFor(source: PopulationGroundSource, path: AuthoredPopulationPath,
  pedestrianPaths: readonly AuthoredPopulationPath[]): PopulationCrossing[] {
  return source.polygons.map((corners, index) => ({ id: `${source.id}/pedestrian-priority-${index}`, sourceId: source.id,
    corners, priority: 'pedestrian',
    pedestrianPathIds: pedestrianPaths.filter(p => p.role === 'pedestrian').map(p => p.id), vehiclePathIds: [path.id] }));
}

function districtAlternatives(plan: LevelPlan, district: 'commercial' | 'residential',
  rejected: { id: string; reason: string; span?: number; sourceIds?: readonly string[] }[]):
  { plan: LevelPlan; path: AuthoredPopulationPath; crossings: PopulationCrossing[] } | null {
  const prefix = `city-${district}`;
  const ids = ['entry', 'exit', 'cross', ...parts.map(p => `main-${p}`), ...parts.map(p => `side-${p}`)];
  const roads = ids.map(id => plan.segments.find(s => s.id === `${prefix}-${id}`)).map(s => s ? originalRoad(s) : null);
  if (roads.some(r => !r)) return null;
  const originals = roads as PlacedSegment[];
  const byId = new Map(originals.map(r => [r.spec.id, r]));
  const sampler = new PlanTerrainSampler(plan);
  const context = createPopulationValidationContext(plan);
  const makeStep = (part: string, lane: number, low = 0, high?: number, forward = true): Step => {
    const road = byId.get(`${prefix}-${part}`)!;
    return { segmentId: road.spec.id, lateralMetres: lane, halfWidthMetres: VEHICLE_BAND,
      fromS: low, toS: high ?? road.spec.length, forward };
  };
  for (const topology of ['whole-block', 'entry-neighborhood', 'exit-neighborhood'] as const) {
    for (const lane of [1.5, -1.5, 0, 2.8, -2.8]) for (const trim of [0.45, 0.60]) {
      const arm = (name: 'main' | 'side', first: number, last: number): Step[] => {
        const result = parts.slice(first, last + 1).map(part => {
          const road = byId.get(`${prefix}-${name}-${part}`)!;
          return makeStep(`${name}-${part}`, name === 'main' ? lane : -lane,
            part === 'in' ? road.spec.length * trim : 0,
            part === 'out' ? road.spec.length * (1 - trim) : undefined, name === 'main');
        });
        return name === 'side' ? result.reverse() : result;
      };
      let groups: Step[][];
      if (topology === 'whole-block') groups = [arm('main', 0, 5), arm('side', 0, 5)];
      else {
        const joinInset = 14;
        const crossLength = byId.get(`${prefix}-cross`)!.spec.length;
        const a = arm('main', topology === 'entry-neighborhood' ? 0 : 3, topology === 'entry-neighborhood' ? 2 : 5);
        const b = arm('side', topology === 'entry-neighborhood' ? 0 : 3, topology === 'entry-neighborhood' ? 2 : 5);
        if (topology === 'entry-neighborhood') {
          a[a.length - 1].toS -= joinInset; b[0].toS -= joinInset;
          groups = [a, [makeStep('cross', 0, joinInset, crossLength - joinInset)], b];
        } else {
          a[0].fromS += joinInset; b[b.length - 1].fromS += joinInset;
          groups = [a, b, [makeStep('cross', 0, joinInset, crossLength - joinInset, false)]];
        }
      }
      let traces: readonly AuthoredPopulationPath[];
      try { traces = emitPopulationPaths(originals, groups.map((steps, i) => ({ id: `${prefix}/group-${i}`,
        role: 'traffic' as const, district, steps }))); } catch { continue; }
      for (const alternative of [0, 1]) {
        const pathId = `${SOURCE_PREFIX}${prefix}/${topology}/${lane}/${trim}/${alternative}`;
        const pieces: (readonly AuthoredPathFrame[])[] = [], sources: PopulationGroundSource[] = [], patches: GroundSurfacePatch[] = [];
        let failed = false;
        const failure: AuthoringFailure = {};
        for (let index = 0; index < traces.length; index += 1) {
          const trace = traces[index], next = traces[(index + 1) % traces.length];
          pieces.push(trace.frames);
          const id = `${pathId}/turn-${index}`;
          const join = analyticJoin(sampler, pose(trace.frames.at(-1)!), pose(next.frames[0]), id, alternative);
          const prepared = join && court(plan, sampler, join, id,
            [trace.frames.at(-1)!.sourceSegmentId, next.frames[0].sourceSegmentId], failure, context);
          if (!join || !prepared) { if (!join) failure.reason = 'analytic-radius-join'; failed = true; break; }
          pieces.push(join); sources.push(prepared.source); patches.push(...prepared.patches);
        }
        if (failed) { if (rejected.length < 80) rejected.push({ id: pathId, reason: failure.reason ?? 'empty-turn-court',
          span: failure.span, sourceIds: failure.sourceIds }); continue; }
        const frames = distanceFrames(pieces);
        if (!frames) continue;
        const path: AuthoredPopulationPath = { id: pathId, role: 'traffic', district, frames, closed: true, serviceShuttle: false };
        const candidate = overlay(plan, sources, patches), finished = new PlanTerrainSampler(candidate);
        const candidateContext = createPopulationValidationContext(candidate, context);
        let reason: string | null = null, badSpan = 0;
        for (let index = 1; index < frames.length; index += 1) {
          reason = populationPathSpanReason(candidate, finished, frames[index - 1], frames[index], path, candidateContext, ROAD);
          if (reason) { badSpan = index; break; }
        }
        if (reason) {
          if (rejected.length < 80) rejected.push({ id: pathId, reason, span: badSpan,
            sourceIds: [frames[badSpan - 1].sourceSegmentId, frames[badSpan].sourceSegmentId] });
          continue;
        }
        const validated = buildPopulationPlan(candidate, [path], finished, candidateContext);
        if (validated.paths.length !== 1 || !validated.paths[0].closed || validated.report.rejected.length) continue;
        return { plan: candidate, path, crossings: sources.filter(s => s.purpose === 'driveway')
          .flatMap(s => crossingsFor(s, path, plan.populationPaths ?? [])) };
      }
    }
  }
  return null;
}

/** One bounded neighbourhood turnaround circuit, used only if the larger
 * district circuits fail. Both travelled lanes are an actual native street;
 * two explicit radius courts supply continuous forward turns at its ends. */
function localDistrictLoop(plan: LevelPlan, district: 'commercial' | 'residential',
  rejected: { id: string; reason: string; span?: number; sourceIds?: readonly string[] }[]):
  { plan: LevelPlan; path: AuthoredPopulationPath; crossings: PopulationCrossing[] } | null {
  const prefix = `city-${district}`, sampler = new PlanTerrainSampler(plan);
  const context = createPopulationValidationContext(plan);
  const ordered = ['side-street', 'side-street-b', 'main-street', 'main-street-b', 'cross', 'entry', 'exit'];
  for (const name of ordered) {
    const segment = plan.segments.find(item => item.id === `${prefix}-${name}`);
    const road = segment && originalRoad(segment);
    if (!road || !ROAD.has(road.spec.surface) || Math.abs(road.spec.curvature ?? 0) > R.epsilon) continue;
    for (const length of [24, 14]) for (const share of [0.5, 0.25, 0.75]) {
      const middle = road.spec.length * share, fromS = middle - length / 2, toS = middle + length / 2;
      if (fromS < 3 || toS > road.spec.length - 3) continue;
      const traces = emitPopulationPaths([road], [1, -1].map((direction, index) => ({
        id: `${prefix}/local-lane-${index}`, role: 'traffic' as const, district,
        steps: [{ segmentId: road.spec.id, fromS, toS, forward: direction === 1,
          lateralMetres: direction * 1.5, halfWidthMetres: VEHICLE_BAND }],
      })));
      for (const alternative of [0, 1]) {
        const id = `${SOURCE_PREFIX}${prefix}/local-${name}/${length}/${share}/${alternative}`;
        const groups: (readonly AuthoredPathFrame[])[] = [], sources: PopulationGroundSource[] = [], patches: GroundSurfacePatch[] = [];
        let failure: string | null = null;
        const courtFailure: AuthoringFailure = {};
        for (let index = 0; index < traces.length; index += 1) {
          const trace = traces[index], next = traces[(index + 1) % traces.length], turnId = `${id}/turn-${index}`;
          const join = analyticJoin(sampler, pose(trace.frames.at(-1)!), pose(next.frames[0]), turnId, alternative);
          const prepared = join && court(plan, sampler, join, turnId, [road.spec.id], courtFailure, context);
          if (!join || !prepared) { failure = !join ? 'analytic-radius-join' : courtFailure.reason ?? 'empty-turn-court'; break; }
          groups.push(trace.frames, join); sources.push(prepared.source); patches.push(...prepared.patches);
        }
        const frames = failure ? null : distanceFrames(groups);
        if (!frames) { if (rejected.length < 120) rejected.push({ id, reason: failure ?? 'local continuity',
          span: courtFailure.span, sourceIds: [road.spec.id] }); continue; }
        const path: AuthoredPopulationPath = { id, role: 'traffic', district, frames, closed: true, serviceShuttle: false };
        const candidate = overlay(plan, sources, patches), finished = new PlanTerrainSampler(candidate);
        const candidateContext = createPopulationValidationContext(candidate, context);
        let badSpan = 0;
        for (let index = 1; index < frames.length; index += 1) {
          failure = populationPathSpanReason(candidate, finished, frames[index - 1], frames[index], path, candidateContext, ROAD);
          if (failure) { badSpan = index; break; }
        }
        const accepted = failure ? null : buildPopulationPlan(candidate, [path], finished, candidateContext);
        if (!accepted || accepted.paths.length !== 1 || !accepted.paths[0].closed || accepted.report.rejected.length) {
          if (rejected.length < 120) rejected.push({ id, reason: failure ?? accepted?.report.rejected[0]?.reason ?? 'local loop not accepted',
            ...(badSpan ? { span: badSpan } : {}), sourceIds: [road.spec.id] });
          continue;
        }
        return { plan: candidate, path, crossings: sources.filter(source => source.purpose === 'driveway')
          .flatMap(source => crossingsFor(source, path, plan.populationPaths ?? [])) };
      }
    }
  }
  return null;
}

function finishedFootpath(plan: LevelPlan, request: FinishedFootpathRequest, failure: AuthoringFailure):
  { plan: LevelPlan; path: AuthoredPopulationPath } | null {
  const host = plan.segments.find(s => s.id === request.hostSegmentId);
  const road = host && originalRoad(host);
  if (!road || !(request.fromS >= 0 && request.toS <= road.spec.length && request.toS - request.fromS >= R.minimumWalkMetres)
    || !Number.isFinite(request.lateralMetres + request.halfWidthMetres) || request.halfWidthMetres <= 0) {
    failure.reason = 'footpath-request-or-native-host'; return null;
  }
  const sampler = new PlanTerrainSampler(plan), id = `${SOURCE_PREFIX}${request.id}`;
  const context = createPopulationValidationContext(plan);
  const count = Math.ceil((request.toS - request.fromS) / R.traceSpacingMetres);
  const frames = Array.from({ length: count + 1 }, (_, i) => {
    const station = request.fromS + (request.toS - request.fromS) * i / count;
    const p = centrelineAt(road.entry, road.spec, station), h = headingAt(road.entry, road.spec, station);
    return { ...groundFrame(sampler, { x: p.x + Math.cos(h) * request.lateralMetres,
      z: p.z - Math.sin(h) * request.lateralMetres, h }, id), halfWidthMetres: request.halfWidthMetres };
  });
  const polygons: Vec3[][] = [], patches: GroundSurfacePatch[] = [];
  for (let first = 0; first < frames.length - 1; first += 4) {
    const group = frames.slice(first, Math.min(frames.length, first + 5));
    const sweeps = group.flatMap((frame, index) => index ? populationSpanFootprints(plan, sampler,
      group[index - 1], frame, 'pedestrian') : []);
    if (!sweeps.length) { failure.reason = 'empty-footpath-sweep'; failure.span = first + 1; return null; }
    for (const sweep of sweeps) {
      const blocked = populationFootprintExclusion(plan, sweep, context);
      if (blocked) { failure.reason = `footpath-protected-${blocked}`; failure.span = first + 1; return null; }
    }
    const polygon = rectangle(sweeps.flatMap(footprint => footprint.polygon), group[0], group[0].headingY, 0.08);
    const stripBlocked = populationFootprintExclusion(plan, { ...sweeps[0], polygon,
      minY: Math.min(...sweeps.map(sweep => sweep.minY)), maxY: Math.max(...sweeps.map(sweep => sweep.maxY)) }, context);
    if (stripBlocked) { failure.reason = `footpath-strip-protected-${stripBlocked}`; failure.span = first + 1; return null; }
    // The path strip is checked against the actual original hillside. A
    // failed strip cannot become a paved lid over a bank or a routed shortcut.
    if (!surfaceFootprintClear(plan, polygon, new Set<SurfaceId>(CLIP.allowedSurfaces), context)) {
      failure.reason = 'footpath-finished-surface-or-field-boundary'; failure.span = first + 1; return null;
    }
    const datum = sampler.sampleGround((polygon[0].x + polygon[2].x) / 2,
      (polygon[0].z + polygon[2].z) / 2, createGroundSample()).height;
    const triangles = clippedFieldTriangles(plan.heightfield, polygon, datum, CLIP);
    if (!triangles?.length) { failure.reason = originalClipFailure(plan, polygon, datum); failure.span = first + 1; return null; }
    polygons.push(polygon);
    const grass = triangles.filter(t => plan.heightfield.surfaces[t.cell] === 'grass');
    if (grass.length) patches.push({ id: `${id}/strip-${first}`, surface: 'pavement', sourceSurface: 'grass', triangles: grass });
  }
  const source: PopulationGroundSource = { id, purpose: 'footpath', hostSegmentIds: [host!.id], polygons,
    groundPatchIds: patches.map(p => p.id) };
  const candidate = overlay(plan, [source], patches), sampled = distanceFrames([frames]);
  if (!sampled) { failure.reason = 'footpath-continuity'; return null; }
  const path: AuthoredPopulationPath = { id, role: 'pedestrian', district: request.district,
    frames: sampled, closed: false, serviceShuttle: false };
  const accepted = buildPopulationPlan(candidate, [path]);
  if (!accepted.paths.length || !accepted.actors.length) {
    failure.reason = `footpath-final:${[...new Set(accepted.report.rejected.map(item => item.reason))].join(',') || 'no-occupants'}`;
    return null;
  }
  return { plan: candidate, path };
}

function warehouseRoads(plan: LevelPlan, building: Vec3):
  { road: PlacedSegment; station: number; point: Vec3; distance: number }[] {
  const choices: { road: PlacedSegment; station: number; point: Vec3; distance: number }[] = [];
  for (const segment of plan.segments) {
    const road = originalRoad(segment);
    if (!road || !ROAD.has(road.spec.surface) || road.entry.surface !== road.exit.surface
      || road.spec.length < 12) continue;
    let best: { station: number; point: Vec3; distance: number } | undefined;
    const count = Math.ceil(road.spec.length / 2);
    for (let index = 1; index < count; index += 1) {
      const station = road.spec.length * index / count;
      if (station < 3 || station > road.spec.length - 3) continue;
      const point = centrelineAt(road.entry, road.spec, station), distance = Math.hypot(point.x - building.x, point.z - building.z);
      if (distance <= 70 && (!best || distance < best.distance)) best = { station, point, distance };
    }
    if (best) choices.push({ road, ...best });
  }
  // Three factual street approaches are enough to avoid one blocked/graded
  // frontage. This is one bay per world, not a new route on every building.
  return choices.sort((a, b) => a.distance - b.distance
    || (a.road.spec.id < b.road.spec.id ? -1 : a.road.spec.id > b.road.spec.id ? 1 : 0)).slice(0, 3);
}

function parking(plan: LevelPlan, paths: readonly PopulationPath[]):
  { plan: LevelPlan; bay: AuthoredParkingBay; crossing?: PopulationCrossing } | null {
  const sampler = new PlanTerrainSampler(plan);
  const context = createPopulationValidationContext(plan);
  // Precise patches change surfaces only; original support heights, normals,
  // solids and footprints remain identical across these driveway candidates.
  const occupied = paths.flatMap(path => path.points.flatMap((frame, index) => index > 0
    ? populationSpanFootprints(plan, sampler, path.points[index - 1], frame, path.role) : []));
  // The world's furnished industrial bay is accepted environment. A parking
  // bay or driveway paving over its entrance or apron removed it on most
  // generated routes, so such a candidate is refused (2026-10-04).
  const exemplars = environmentSites(plan).map(site => site.id);
  const keepsExemplars = (candidate: LevelPlan): boolean => {
    if (exemplars.length === 0) return true;
    const kept = new Set(environmentSites(candidate).map(site => site.id));
    return exemplars.every(id => kept.has(id));
  };
  for (let propIndex = 0; propIndex < (plan.props?.length ?? 0); propIndex += 1) {
    const building = plan.props![propIndex];
    if (building.kind !== 'building' || building.look !== 'industrial' || !building.size || !exactBuildingBody(plan, building)) continue;
    const size = building.size;
    for (const street of warehouseRoads(plan, building.position)) {
    const road = street.road;
    const faces = [0, 1, 2, 3].map(side => {
      const yaw = building.rotationY + side * Math.PI / 2;
      return { yaw, depth: side % 2 ? size.x : size.z, width: side % 2 ? size.z : size.x,
        toward: Math.sin(yaw) * (street.point.x - building.position.x) + Math.cos(yaw) * (street.point.z - building.position.z) };
    }).filter(face => face.toward > 0).sort((a, b) => b.toward - a.toward);
    for (const face of faces) for (const out of [4.5, 6.5, 8.5, 10.5])
      for (const along of [0, face.width / 2 + 3.5, -face.width / 2 - 3.5, face.width / 2 + 7.5, -face.width / 2 - 7.5]) {
        const position = { x: building.position.x + Math.sin(face.yaw) * (face.depth / 2 + out) + Math.cos(face.yaw) * along,
          y: 0, z: building.position.z + Math.cos(face.yaw) * (face.depth / 2 + out) - Math.sin(face.yaw) * along };
        position.y = sampler.sampleGround(position.x, position.z, createGroundSample()).height;
        const bayId = `${SOURCE_PREFIX}warehouse-${propIndex}/bay-${out}-${along}`, heading = wrap(face.yaw + Math.PI);
        const polygon = rectangle([position], position, heading, 0);
        // Explicit 3.3 x 6.4 metre bay: orientation is toward the warehouse,
        // with its separate radius approach, rather than a roadside U-turn.
        const c = Math.cos(heading), s = Math.sin(heading);
        for (let i = 0; i < 4; i += 1) {
          const x = i === 0 || i === 3 ? -1.65 : 1.65, z = i < 2 ? -3.2 : 3.2;
          polygon[i] = { x: position.x + c * x + s * z, y: position.y, z: position.z - s * x + c * z };
        }
        const prepared = patchSource(plan, bayId, polygon, [road.spec.id], 'parking-bay', propIndex, undefined, context);
        if (!prepared) continue;
        for (const direction of [1, -1]) for (const setback of [TURN_RADIUS + 2, 3]) for (const alternative of [0, 1]) {
          const station = street.station - direction * setback;
          if (station < 0 || station > road.spec.length) continue;
          const start = centrelineAt(road.entry, road.spec, station), h = headingAt(road.entry, road.spec, station)
            + (direction < 0 ? Math.PI : 0);
          const approachId = `${bayId}/driveway-${direction}-${setback}-${alternative}`;
          const approach = analyticJoin(sampler, { x: start.x, z: start.z, h }, { x: position.x, z: position.z, h: heading }, approachId, alternative);
          const drive = approach && court(plan, sampler, approach, approachId, [road.spec.id], undefined, context);
          if (!approach || !drive) continue;
          const driveway: PopulationGroundSource = { ...drive.source, purpose: 'driveway', sourcePropIndex: propIndex };
          const candidate = overlay(plan, [prepared.source, driveway], [...prepared.patches, ...drive.patches]);
          const bay: AuthoredParkingBay = { id: bayId, sourceId: bayId, sourcePropIndex: propIndex,
            position, headingY: heading, halfWidthMetres: 1.65, halfLengthMetres: 3.2 };
          const finished = new PlanTerrainSampler(candidate);
          const candidateContext = createPopulationValidationContext(candidate, context);
          if (parkingBayReason(candidate, bay, finished, candidateContext)) continue;
          const trace = distanceFrames([approach]);
          if (!trace) continue;
          const approachPath: AuthoredPopulationPath = { id: approachId, role: 'service', district: 'industrial',
            frames: trace, closed: false, serviceShuttle: false };
          if (trace.some((frame, i) => i > 0 && populationPathSpanReason(candidate, finished,
            trace[i - 1], frame, approachPath, candidateContext))) continue;
          const bayBody = populationSpanFootprints(candidate, finished, trace.at(-2)!, trace.at(-1)!, 'service');
          if (occupied.some(span => bayBody.some(body => polygonsOverlap(span.polygon, body.polygon)))) continue;
          if (!keepsExemplars(candidate)) continue;
          return { plan: candidate, bay: { ...bay, approachFrames: trace } };
        }
      }
    }
  }
  return null;
}
function polygonsOverlap(a: readonly { x: number; z: number }[], b: readonly { x: number; z: number }[]): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i += 1) {
    const first = polygon[i], last = polygon[(i + 1) % polygon.length], x = last.z - first.z, z = first.x - last.x;
    const aa = a.map(p => p.x * x + p.z * z), bb = b.map(p => p.x * x + p.z * z);
    if (Math.max(...aa) < Math.min(...bb) || Math.max(...bb) < Math.min(...aa)) return false;
  }
  return true;
}

/** Sole final supplement hook, after street ground and before physical identity.
 * No source draws, replanning, admission changes, or producer-id branches. */
function authorLivingWorldGround(source: LevelPlan): { level: LevelPlan; population?: PopulationPlan } {
  if (source.populationGroundReport) return { level: source };
  const supportsTraffic = (['commercial', 'residential'] as const)
    .filter(d => source.segments.some(s => s.id === `city-${d}-cross`));
  const hasWarehouse = (source.props ?? []).some(p => p.kind === 'building' && p.look === 'industrial');
  if (!supportsTraffic.length && !hasWarehouse && !source.populationFootpathRequests?.length) return { level: source };
  let plan = source;
  const paths = [...(source.populationPaths ?? [])], crossings = [...(source.populationCrossings ?? [])];
  const rejected: { id: string; reason: string; span?: number; sourceIds?: readonly string[] }[] = [];
  const traffic: string[] = [], missing: District[] = [];
  for (const district of supportsTraffic) {
    const result = districtAlternatives(plan, district, rejected) ?? localDistrictLoop(plan, district, rejected);
    if (!result) { missing.push(district); continue; }
    plan = result.plan; paths.push(result.path); crossings.push(...result.crossings); traffic.push(result.path.id);
  }
  for (const request of source.populationFootpathRequests ?? []) {
    const failure: AuthoringFailure = {}, result = finishedFootpath(plan, request, failure);
    if (!result) { rejected.push({ id: request.id, reason: failure.reason ?? 'no accepted safe finished footpath',
      span: failure.span, sourceIds: [request.hostSegmentId] }); continue; }
    plan = result.plan; paths.push(result.path);
  }
  // Only accepted, physically supported paths occupy an approach or bay.
  // Drafted rejected full circuits cannot reserve a phantom driving lane.
  const acceptedMoving = hasWarehouse ? buildPopulationPlan(plan, paths).paths : [];
  const bay = hasWarehouse ? parking(plan, acceptedMoving) : null;
  const parkingIds: string[] = [];
  if (bay) { plan = bay.plan; parkingIds.push(bay.bay.id); if (bay.crossing) crossings.push(bay.crossing); }
  const report: LivingWorldGroundReport = { acceptedTrafficLoops: traffic, missingTrafficDistricts: missing,
    acceptedParkingBays: parkingIds, rejected, gaps: [
      ...(missing.length ? ['No feasible complete vehicle loop in the listed districts; this remains unfinished.'] : []),
      ...(hasWarehouse && !bay ? ['No safe standalone warehouse parking bay and radius driveway accepted.'] : []),
      'Parking arrival/departure animation and seated bench activity are not installed.',
    ] };
  const finalPlan: LevelPlan = { ...plan, populationPaths: paths, populationCrossings: crossings,
    ...(bay ? { populationParkingBays: [...(plan.populationParkingBays ?? []), bay.bay] } : {}), populationGroundReport: report };
  // Reports name the actually accepted final paths/parked occupants, including
  // any changes caused by a later driveway patch or initial hull reservation.
  const population = buildPopulationPlan(finalPlan, paths);
  return { level: { ...finalPlan, populationGroundReport: population.report.groundSupplement! }, population };
}

export function withLivingWorldGround(source: LevelPlan): LevelPlan { return authorLivingWorldGround(source).level; }

/** The app consumes the same final validation used to reconcile the source
 * report. This avoids rebuilding every accepted path and sampler at boot. */
export function prepareLivingWorldGround(source: LevelPlan): { level: LevelPlan; population: PopulationPlan } {
  const prepared = authorLivingWorldGround(source);
  return { level: prepared.level, population: prepared.population
    ?? buildPopulationPlan(prepared.level, prepared.level.populationPaths) };
}
