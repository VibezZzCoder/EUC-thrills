/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Render-only route and walking-edge cues derived from the final installed world.
 * No route, ground, actor, reservation, collider or plan identity is changed. */
import { MARKINGS, PAINTABLE_SURFACES, markingWidth } from '../data/markings.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import type { BoxCollider, LevelPlan, Marking } from '../level/plan.ts';
import { leftOf } from '../level/segments.ts';
import type { PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { markingGeometry, markingIndexBytes, ribbonQuads, ribbonVertices } from '../shared/markingRibbon.ts';

const JOIN_EPSILON = 1.25;
const SPAWN_INSET = 3;
const PLAZA_MAXIMUM_METRES = 96;
// The plaza has no authored lane paint by design. This is a render-only
// continuation of the incoming road axis, deliberately wider and solid than
// that road's 16 cm broken centre line so it reads across the brick field.
const PLAZA_CUE_WIDTH = markingWidth('bar');
// The solid route axis remains the primary cue. These two slim paver inlays
// sit outside the rider's projected silhouette and frame the real road exit.
const PLAZA_EDGE_OFFSET = 1.25;
const PLAZA_EDGE_WIDTH = markingWidth('centre');
const PATH_END_INSET = 2;
const PATH_MAXIMUM_METRES = 64;
const MAX_PARK_EDGES = 4;
const EDGE_GUARD = 0.25;

export interface VisualWayfinding {
  readonly runs: readonly Marking[];
  /** Exact incremental shared-marking cost, including any whole-index promotion. */
  readonly triangles: number;
  readonly vertices: number;
  readonly indices: number;
  readonly geometryBytes: number;
  /** The common markings mesh already exists whenever source markings exist. */
  readonly drawCalls: number;
  readonly rejected: readonly string[];
}

const empty = (rejected: readonly string[] = []): VisualWayfinding => ({
  runs: [], triangles: 0, vertices: 0, indices: 0, geometryBytes: 0, drawCalls: 0, rejected,
});

const distance2 = (a: { readonly x: number; readonly z: number }, b: { readonly x: number; readonly z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);
const samePoint = (a: Vec3, b: Vec3): boolean => distance2(a, b) <= JOIN_EPSILON && Math.abs(a.y - b.y) <= JOIN_EPSILON;
const angleDelta = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const lengthOf = (points: readonly Vec3[]): number => points.slice(1).reduce((sum, point, index) => sum + distance2(point, points[index]), 0);

function surfaceAt(plan: LevelPlan, x: number, z: number): SurfaceId {
  const field = plan.heightfield;
  const column = Math.floor((x - field.originX) / field.spacing);
  const row = Math.floor((z - field.originZ) / field.spacing);
  if (column < 0 || row < 0 || column >= field.columns - 1 || row >= field.rows - 1) return plan.surround.surface;
  return field.surfaces[row * (field.columns - 1) + column];
}

function inBox(box: BoxCollider, x: number, z: number, margin: number): boolean {
  const dx = x - box.centre.x, dz = z - box.centre.z;
  const c = Math.cos(box.rotationY), s = Math.sin(box.rotationY);
  return Math.abs(c * dx - s * dz) <= box.halfExtents.x + margin
    && Math.abs(s * dx + c * dz) <= box.halfExtents.z + margin;
}

function distanceToSegment(point: { readonly x: number; readonly z: number }, a: { readonly x: number; readonly z: number }, b: { readonly x: number; readonly z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2));
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

function overlapsSourceMarking(plan: LevelPlan, point: { readonly x: number; readonly z: number }, width: number): boolean {
  return (plan.markings ?? []).some(mark => mark.points.slice(1).some((to, index) =>
    distanceToSegment(point, mark.points[index], to) <= (mark.width + width) / 2 + 0.02));
}

function paintable(plan: LevelPlan, x: number, z: number, tangent: { readonly x: number; readonly z: number }, width: number): boolean {
  const length = Math.hypot(tangent.x, tangent.z);
  if (length <= 1e-8) return false;
  const nx = tangent.z / length, nz = -tangent.x / length, half = width / 2;
  const boxes = [...plan.segments.flatMap(segment => segment.colliders), ...(plan.solids ?? [])];
  for (const offset of [-half, 0, half]) {
    const px = x + nx * offset, pz = z + nz * offset;
    if (!PAINTABLE_SURFACES.includes(surfaceAt(plan, px, pz))) return false;
    if (boxes.some(box => inBox(box, px, pz, MARKINGS.colliderClearance))) return false;
    if ((plan.hazards ?? []).some(hazard => Math.hypot(px - hazard.centre.x, pz - hazard.centre.z)
      <= hazard.radius + MARKINGS.colliderClearance)) return false;
  }
  return true;
}

function clipped(plan: LevelPlan, points: readonly Vec3[], tangentAt: (index: number) => { readonly x: number; readonly z: number }, width: number): Marking[] {
  const runs: Marking[] = [], current: Vec3[] = [];
  const flush = (): void => {
    if (current.length >= 2 && lengthOf(current) >= MARKINGS.minRunLength) {
      runs.push({ points: current.splice(0), width, dash: 0, gap: 0, paint: 'path' });
    } else current.length = 0;
  };
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index], tangent = tangentAt(index);
    if (!paintable(plan, point.x, point.z, tangent, width) || overlapsSourceMarking(plan, point, width)) { flush(); continue; }
    current.push({ x: point.x, y: fieldHeightAt(plan.heightfield, plan.surround, point.x, point.z) + MARKINGS.lift, z: point.z });
  }
  flush();
  return runs;
}

function plazaAxisPoints(first: LevelPlan['segments'][number], dx: number, dz: number, length: number): Vec3[] {
  const points: Vec3[] = [], end = length - SPAWN_INSET;
  for (let distance = SPAWN_INSET; distance < end; distance += MARKINGS.sampleStep) {
    const t = distance / length;
    points.push({ x: first.entry.position.x + dx * t, y: 0, z: first.entry.position.z + dz * t });
  }
  points.push({ x: first.entry.position.x + dx * (end / length), y: 0, z: first.entry.position.z + dz * (end / length) });
  return points;
}

function plazaEdgePoints(points: readonly Vec3[], headingY: number, side: 1 | -1): Vec3[] {
  const left = leftOf(headingY);
  return points.map(point => ({ x: point.x + left.x * PLAZA_EDGE_OFFSET * side, y: point.y, z: point.z + left.z * PLAZA_EDGE_OFFSET * side }));
}

function bridge(plan: LevelPlan, rejected: string[]): Marking[] {
  const starts = plan.segments.filter(segment => samePoint(segment.entry.position, plan.spawn.position)
    && angleDelta(segment.entry.headingY, plan.spawn.headingY) < 0.04);
  const first = starts.length === 1 ? starts[0] : null;
  const next = first === null ? null : plan.segments[1];
  // A generated city carries street loops. This is structural source evidence, not the mutable installed id.
  if (first === null || first !== plan.segments[0] || !plan.streetLoops?.length || next === null || next === undefined
    || !samePoint(first.exit.position, next.entry.position) || angleDelta(first.exit.headingY, next.entry.headingY) > 0.04
    || first.entry.surface !== 'brick' || first.exit.surface !== 'brick'
    || !PAINTABLE_SURFACES.includes(next.entry.surface)) { rejected.push('no-native-spawn-plaza'); return []; }
  const dx = first.exit.position.x - first.entry.position.x, dz = first.exit.position.z - first.entry.position.z;
  const length = Math.hypot(dx, dz);
  if (length <= SPAWN_INSET * 2 + MARKINGS.minRunLength || length > PLAZA_MAXIMUM_METRES) { rejected.push('plaza-length'); return []; }
  const points = plazaAxisPoints(first, dx, dz, length);
  // This must read from the road's last painted dash through the real arch
  // opening. It is continuous road paint, not a second navigable surface:
  // final-ground, solid and source-mark clipping still decide every metre.
  const solidRuns = clipped(plan, points, () => ({ x: dx, z: dz }), PLAZA_CUE_WIDTH);
  const edges = ([-1, 1] as const).flatMap(side => clipped(plan, plazaEdgePoints(points, first.entry.headingY, side),
    () => ({ x: dx, z: dz }), PLAZA_EDGE_WIDTH));
  return [...solidRuns.map(run => ({ ...run, dash: 0, gap: 0, paint: 'road' as const })),
    ...edges.map(run => ({ ...run, dash: 0, gap: 0, paint: 'path' as const }))];
}

function nearestOtherBand(others: readonly PopulationPath[], point: { readonly x: number; readonly z: number }): number {
  let nearest = Infinity;
  for (const other of others) for (const candidate of other.points) nearest = Math.min(nearest, distance2(point, candidate));
  return nearest;
}

function sampledPath(path: PopulationPath, side: 1 | -1): Vec3[] {
  const offset = Math.min(0.35, path.clearanceRadiusMetres - markingWidth('edge') / 2 - EDGE_GUARD);
  if (!(offset > 0)) return [];
  const limit = Math.min(path.lengthMetres - PATH_END_INSET, PATH_MAXIMUM_METRES + PATH_END_INSET);
  return path.points.filter(point => point.distanceMetres >= PATH_END_INSET && point.distanceMetres <= limit).map(point => {
    const left = leftOf(point.headingY);
    return { x: point.x + left.x * offset * side, y: point.y, z: point.z + left.z * offset * side };
  });
}

function parkEdges(plan: LevelPlan, population: PopulationPlan | null, rejected: string[]): Marking[] {
  if (population === null) return [];
  // Authored pedestrians are not enough: select the exact final activity walk
  // only when a real actor was admitted to that final clear path.
  const admitted = new Set((plan.populationActivityWalks ?? []).filter(walk => walk.district === 'park'
    && population.actors.some(actor => actor.activityWalkId === walk.id)).map(walk => `${walk.pathId}/clear-0`));
  const candidates = population.paths.filter(path => admitted.has(path.id) && path.role === 'pedestrian'
    && path.lengthMetres >= MARKINGS.minRunLength + PATH_END_INSET * 2).sort((a, b) => a.id.localeCompare(b.id));
  const otherBands = population.paths.filter(path => path.district === 'park' && path.role !== 'pedestrian');
  const runs: Marking[] = [];
  for (const path of candidates) {
    if (runs.length >= MAX_PARK_EDGES) break;
    const left = sampledPath(path, -1), right = sampledPath(path, 1);
    if (left.length < 2 || right.length < 2) { rejected.push(`${path.id}:narrow`); continue; }
    if (!otherBands.length) { rejected.push(`${path.id}:no-shared-rider-band`); continue; }
    const clearance = (points: readonly Vec3[]): number => points.reduce((sum, point) => sum + nearestOtherBand(otherBands, point), 0);
    // The closer valid edge is the walking/riding separation boundary. The
    // greater score would deliberately draw the path's outside verge instead.
    const selected = clearance(left) <= clearance(right) ? left : right;
    const accepted = clipped(plan, selected, index => {
      const before = selected[Math.max(0, index - 1)], after = selected[Math.min(selected.length - 1, index + 1)];
      return { x: after.x - before.x, z: after.z - before.z };
    }, markingWidth('edge'));
    if (!accepted.length) { rejected.push(`${path.id}:ground-or-clearance`); continue; }
    runs.push(...accepted.slice(0, MAX_PARK_EDGES - runs.length).map(run => ({ ...run, paint: 'path' as const })));
  }
  return runs;
}

/** Final-plan descriptor. It neither observes nor writes simulation state. */
export function prepareVisualWayfinding(plan: LevelPlan, population: PopulationPlan | null): VisualWayfinding {
  const rejected: string[] = [], runs = [...bridge(plan, rejected), ...parkEdges(plan, population, rejected)];
  if (!runs.length) return empty(rejected);
  const quads = runs.reduce((sum, run) => sum + ribbonQuads(run.points, run.dash, run.gap), 0);
  const vertices = runs.reduce((sum, run) => sum + ribbonVertices(run.points, run.dash, run.gap), 0);
  const indices = quads * 6, source = markingGeometry(plan.markings ?? []);
  const geometryBytes = vertices * 36
    + markingIndexBytes(source.vertices + vertices, source.indices + indices)
    - markingIndexBytes(source.vertices, source.indices);
  return { runs, triangles: quads * 2, vertices, indices, geometryBytes,
    drawCalls: source.indices === 0 ? 1 : 0, rejected };
}
