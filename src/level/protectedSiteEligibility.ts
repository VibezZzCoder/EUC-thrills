/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { BoxCollider, LevelPlan, Prop, Segment } from './plan.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { validField } from './streetFronts.ts';

const PAVED_STREET = ['pavement', 'brick', 'roughPavement'];

/** Legacy industrial body predicate, moved without changing its arithmetic. */
export function isBodySolid(building: Prop, solid: BoxCollider): boolean {
  const size = building.size!;
  return Math.hypot(solid.centre.x - building.position.x,
    solid.centre.z - building.position.z) < 0.001
    && Math.abs(solid.centre.y - building.position.y - size.y / 2) < 0.001
    && Math.abs(solid.halfExtents.x - size.x / 2) < 0.001
    && Math.abs(solid.halfExtents.y - size.y / 2) < 0.001
    && Math.abs(solid.halfExtents.z - size.z / 2) < 0.001
    && Math.abs(Math.sin(solid.rotationY - building.rotationY)) < 0.0001;
}

export function finiteBox(box: BoxCollider): boolean {
  return Number.isFinite(box.centre.x) && Number.isFinite(box.centre.y) && Number.isFinite(box.centre.z)
    && Number.isFinite(box.halfExtents.x) && Number.isFinite(box.halfExtents.y)
    && Number.isFinite(box.halfExtents.z) && Number.isFinite(box.rotationY)
    && box.halfExtents.x >= 0 && box.halfExtents.y >= 0 && box.halfExtents.z >= 0;
}

/** New districts require a finite, exact, original body; no enclosing substitute. */
export function exactBuildingBody(plan: LevelPlan, building: Prop): BoxCollider | undefined {
  const size = building.size;
  if (!plan.props?.includes(building) || building.kind !== 'building' || building.scale !== 1 || !size
    || ![size.x, size.y, size.z, building.position.x, building.position.y,
      building.position.z, building.rotationY].every(Number.isFinite)
    || size.x <= 0 || size.y <= 0 || size.z <= 0) return undefined;
  return plan.solids?.find(solid => finiteBox(solid) && isBodySolid(building, solid));
}

export interface PavedStreetStation {
  readonly point: Vec3;
  readonly distance: number;
  readonly segmentId: string;
}

/** Existing industrial socket-arc solver. Default arithmetic, order, thresholds,
 * and 40-step refinement are unchanged; new districts may restrict original
 * segments or use the bounded 0.08 inset for the gate's authored 0.10 station. */
export function nearestPavedStreetStation(plan: LevelPlan, building: Prop,
  segments: readonly Segment[] = plan.segments,
  options: { readonly minimumStationFraction?: number } = {}): PavedStreetStation | undefined {
  const inset = options.minimumStationFraction ?? 0.1;
  if (!Number.isFinite(inset) || inset < 0.08 || inset > 0.10
    || (segments !== plan.segments && segments.some(segment => !plan.segments.includes(segment)))) return undefined;
  // The station each segment would report, exactly as the original loop body.
  const stationOn = (segment: Segment, turn: number, length: number): { point: Vec3; distance: number } | undefined => {
    const a = segment.entry, b = segment.exit;
    const curvature = turn / length;
    const at = (t: number): Vec3 => {
      const h = a.headingY + turn * t;
      return { x: a.position.x + (Math.abs(turn) < 1e-9 ? Math.sin(h) * length * t
        : (Math.cos(a.headingY) - Math.cos(h)) / curvature),
      y: a.position.y + (b.position.y - a.position.y) * t,
      z: a.position.z + (Math.abs(turn) < 1e-9 ? Math.cos(h) * length * t
        : (Math.sin(h) - Math.sin(a.headingY)) / curvature) };
    };
    const end = at(1);
    if (Math.hypot(end.x - b.position.x, end.z - b.position.z) > 0.03) return undefined;
    const distanceAt = (t: number): number => {
      const p = at(t);
      return Math.hypot(p.x - building.position.x, p.z - building.position.z);
    };
    let low = 0, high = 1;
    for (let step = 0; step < 40; step++) {
      const first = low + (high - low) / 3, second = high - (high - low) / 3;
      if (distanceAt(first) < distanceAt(second)) high = second; else low = first;
    }
    const t = (low + high) / 2;
    if (t < inset || t > 1 - inset) return undefined;
    return { point: at(t), distance: distanceAt(t) };
  };
  const eligible: { index: number; segment: Segment; turn: number; length: number; lower: number }[] = [];
  let finiteInput = Number.isFinite(building.position.x) && Number.isFinite(building.position.z);
  segments.forEach((segment, index) => {
    const a = segment.entry, b = segment.exit;
    const turn = b.headingY - a.headingY;
    if (!PAVED_STREET.includes(a.surface) || a.surface !== b.surface || Math.abs(turn) > 0.20) return;
    const chord = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
    const length = Math.abs(turn) < 1e-9 ? chord : chord * (turn / 2) / Math.sin(turn / 2);
    if (length < 8) return;
    // Every station this segment can report lies within its turn's sagitta
    // (|turn| <= 0.2) plus the 0.03 end tolerance of the chord, so its distance
    // is at least this bound (with generous rounding margins).
    const lower = chordDistance(building.position, a.position, b.position)
      - (0.026 * chord + 0.032 + 1e-3 + 1e-6 * (Math.abs(a.position.x) + Math.abs(a.position.z)
        + Math.abs(b.position.x) + Math.abs(b.position.z) + Math.abs(building.position.x)
        + Math.abs(building.position.z))
        // Rounding of (cos(a) - cos(h)) / curvature on nearly straight arcs.
        + (Math.abs(turn) < 1e-9 ? 0 : 1e-15 * length / Math.abs(turn)));
    if (!Number.isFinite(lower) || !Number.isFinite(a.headingY) || !Number.isFinite(a.position.y)
      || !Number.isFinite(b.position.y)) finiteInput = false;
    eligible.push({ index, segment, turn, length, lower });
  });
  let answer: (PavedStreetStation & { index: number }) | undefined;
  if (!finiteInput) {
    // Original in-order scan, including its handling of non-finite distances.
    for (const { segment, turn, length } of eligible) {
      const station = stationOn(segment, turn, length);
      if (station && (!answer || station.distance < answer.distance)) answer = { ...station, segmentId: segment.id, index: 0 };
    }
  } else {
    // All finite: the original answer is the minimum distance, first index on
    // ties. Visiting by lower bound and stopping once no bound can reach the
    // best distance (strictly larger, so no tie either) finds that same answer.
    eligible.sort((x, y) => x.lower - y.lower || x.index - y.index);
    for (const { index, segment, turn, length, lower } of eligible) {
      if (answer && lower > answer.distance) break;
      const station = stationOn(segment, turn, length);
      if (station && (!answer || station.distance < answer.distance
        || (station.distance === answer.distance && index < answer.index))) {
        answer = { ...station, segmentId: segment.id, index };
      }
    }
  }
  return answer ? { point: answer.point, distance: answer.distance, segmentId: answer.segmentId } : undefined;
}

/** XZ distance from a point to a chord segment; NaN for non-finite input. */
function chordDistance(point: Vec3, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dz = b.z - a.z, denominator = dx * dx + dz * dz;
  const t = denominator > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / denominator)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

/** Legacy industrial cell lookup, including its original surround fallback. */
export function groundSurfaceAt(plan: LevelPlan, point: Vec3): SurfaceId {
  const field = plan.heightfield;
  const fx = (point.x - field.originX) / field.spacing;
  const fz = (point.z - field.originZ) / field.spacing;
  if (fx < 0 || fz < 0 || fx > field.columns - 1 || fz > field.rows - 1) return plan.surround.surface;
  const column = Math.min(field.columns - 2, Math.floor(fx));
  const row = Math.min(field.rows - 2, Math.floor(fz));
  return field.surfaces[row * (field.columns - 1) + column];
}

/** New district streets must be actual finite source cells, never surround. */
export function sourceGroundSurfaceAt(plan: LevelPlan, point: Vec3): SurfaceId | undefined {
  const field = plan.heightfield;
  if (!validField(field) || ![point.x, point.y, point.z].every(Number.isFinite)) return undefined;
  const fx = (point.x - field.originX) / field.spacing;
  const fz = (point.z - field.originZ) / field.spacing;
  if (fx < 0 || fz < 0 || fx > field.columns - 1 || fz > field.rows - 1) return undefined;
  return groundSurfaceAt(plan, point);
}
