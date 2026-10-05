/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Pure proposals for separate native wheel and full-rag human side constraints.
 * This constructs a physical candidate only. The unchanged complete-body
 * interval admission must still certify before any controller may commit it. */
import { buildRiderOccupancyEnvelope, type RiderOccupancyCoefficients, type RiderOccupancyPose, type RiderOccupancyPrism } from './riderOccupancy.ts';
/** Pure structural geometry; no simulation/controller/world import. */
export interface RiderSideContactBlocker {
  readonly x: number; readonly z: number; readonly headingY: number;
  readonly halfWidthMetres: number; readonly halfLengthMetres: number;
  readonly minY: number; readonly maxY: number;
}
export interface ContactPlane { readonly x: number; readonly z: number; readonly required: number }
export interface FullRagSideProjection { readonly x: number; readonly z: number; readonly normals: readonly { readonly x: number; readonly z: number }[]; readonly planes: readonly ContactPlane[] }
const axes = (heading: number) => [{ x: Math.cos(heading), z: -Math.sin(heading) }, { x: Math.sin(heading), z: Math.cos(heading) }];
const support = (body: { headingY: number; halfWidth: number; halfLength: number }, axis: { x: number; z: number }) => {
  const [x, z] = axes(body.headingY); return Math.abs(x.x * axis.x + x.z * axis.z) * body.halfWidth + Math.abs(z.x * axis.x + z.z * axis.z) * body.halfLength;
};
const footprint = (body: RiderSideContactBlocker) => ({ ...body, halfWidth: body.halfWidthMetres, halfLength: body.halfLengthMetres });
function axisGap(body: RiderOccupancyPrism, blocker: RiderSideContactBlocker, axis: { x: number; z: number }) {
  return Math.abs((body.x - blocker.x) * axis.x + (body.z - blocker.z) * axis.z) - support(body, axis) - support(footprint(blocker), axis);
}
function proposeSideProjection(first: RiderOccupancyPrism, last: RiderOccupancyPrism,
  blockers: readonly RiderSideContactBlocker[], standoffMetres: number): FullRagSideProjection | null {
  if (!(standoffMetres >= 0 && Number.isFinite(standoffMetres))) throw new RangeError('Side-contact standoff must be finite and nonnegative');
  const planes: ContactPlane[] = []; let incoming = false;
  for (const blocker of blockers) {
    if (last.topY < blocker.minY || blocker.maxY < last.baseY) continue;
    const directions = [...axes(first.headingY), ...axes(blocker.headingY)];
    const best = directions.map(axis => ({ axis, gap: axisGap(first, blocker, axis) })).sort((a, b) => b.gap - a.gap)[0];
    if (best.gap <= 0) return null; // Never fabricate an escape from true initial side intrusion.
    const sign = (first.x - blocker.x) * best.axis.x + (first.z - blocker.z) * best.axis.z < 0 ? -1 : 1;
    const normal = { x: best.axis.x * sign, z: best.axis.z * sign };
    const currentGap = (last.x - blocker.x) * normal.x + (last.z - blocker.z) * normal.z - support(last, normal) - support(footprint(blocker), normal);
    const required = standoffMetres - currentGap;
    planes.push({ ...normal, required }); incoming ||= required > 0;
  }
  if (!incoming) return { x: 0, z: 0, normals: [], planes };
  // Exact closest feasible point of the 2D half-plane intersection: interior
  // zero, one active boundary, or two active boundaries. No sweep samples or
  // ad hoc displacement/radius cap enters this candidate construction.
  const candidates = [{ x: 0, z: 0 }, ...planes.map(p => ({ x: p.x * p.required, z: p.z * p.required }))];
  for (let a = 0; a < planes.length; a += 1) for (let b = a + 1; b < planes.length; b += 1) {
    const p = planes[a], q = planes[b], determinant = p.x * q.z - p.z * q.x;
    if (determinant === 0) continue;
    candidates.push({ x: (p.required * q.z - p.z * q.required) / determinant,
      z: (p.x * q.required - p.required * q.x) / determinant });
  }
  const feasible = candidates.filter(point => Number.isFinite(point.x) && Number.isFinite(point.z)
    && planes.every(p => p.x * point.x + p.z * point.z >= p.required - 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))));
  feasible.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
  if (!feasible.length) return null;
  const value = feasible[0];
  return { ...value, planes, normals: planes.filter(p => p.required > 0 || Math.abs(p.x * value.x + p.z * value.z - p.required) <= 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))).map(p => ({ x: p.x, z: p.z })) };
}

/** Particle-owned translation; the separate wheel is unchanged. */
export function proposeFullRagSideProjection(previous: RiderOccupancyPose, proposed: RiderOccupancyPose,
  blockers: readonly RiderSideContactBlocker[], coefficients: RiderOccupancyCoefficients, standoffMetres: number): FullRagSideProjection | null {
  if (previous.ragdollBlend !== 1 || proposed.ragdollBlend !== 1) return null;
  return proposeSideProjection(buildRiderOccupancyEnvelope(previous, coefficients).human,
    buildRiderOccupancyEnvelope(proposed, coefficients).human, blockers, standoffMetres);
}
/** Only wheel-root XZ changes; full-rag world particles keep their actual fall. */
export function proposeFullRagWheelSideProjection(previous: RiderOccupancyPose, proposed: RiderOccupancyPose,
  blockers: readonly RiderSideContactBlocker[], coefficients: RiderOccupancyCoefficients, standoffMetres: number): FullRagSideProjection | null {
  if (previous.ragdollBlend !== 1 || proposed.ragdollBlend !== 1) return null;
  return proposeSideProjection(buildRiderOccupancyEnvelope(previous, coefficients).wheel,
    buildRiderOccupancyEnvelope(proposed, coefficients).wheel, blockers, standoffMetres);
}

/**
 * The riderless wheel let go in the air above someone (review r3,
 * 2026-10-04): the least horizontal move that takes its footprint clear of
 * every body under it, by `standoffMetres`, so its fall lands beside them
 * instead of through them. Null if no one move clears them all. A native
 * candidate, never admission.
 */
export function proposeWheelClearOfBodies(pose: RiderOccupancyPose, blockers: readonly RiderSideContactBlocker[],
  coefficients: RiderOccupancyCoefficients, standoffMetres: number): FullRagSideProjection | null {
  const wheel = buildRiderOccupancyEnvelope(pose, coefficients).wheel, planes: ContactPlane[] = [];
  for (const blocker of blockers) {
    if (blocker.minY > wheel.topY) continue;
    const best = [...axes(wheel.headingY), ...axes(blocker.headingY)].map(axis => ({ axis, gap: axisGap(wheel, blocker, axis) }))
      .sort((a, b) => b.gap - a.gap)[0];
    if (best.gap >= standoffMetres) continue;
    const sign = (wheel.x - blocker.x) * best.axis.x + (wheel.z - blocker.z) * best.axis.z < 0 ? -1 : 1;
    planes.push({ x: best.axis.x * sign, z: best.axis.z * sign, required: standoffMetres - best.gap });
  }
  if (!planes.length) return { x: 0, z: 0, normals: [], planes };
  const points = planes.map(p => ({ x: p.x * p.required, z: p.z * p.required }));
  for (let a = 0; a < planes.length; a += 1) for (let b = a + 1; b < planes.length; b += 1) {
    const p = planes[a], q = planes[b], determinant = p.x * q.z - p.z * q.x;
    if (determinant !== 0) points.push({ x: (p.required * q.z - p.z * q.required) / determinant, z: (p.x * q.required - p.required * q.x) / determinant });
  }
  const feasible = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.z)
    && planes.every(p => p.x * point.x + p.z * point.z >= p.required - 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))));
  feasible.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
  return feasible.length ? { ...feasible[0], planes, normals: planes.map(p => ({ x: p.x, z: p.z })) } : null;
}

/** The wheel alone at any blend: a crashed body's particles answer for the
 * rider themselves (2026-10-04). A native candidate, never admission. */
export function proposeWheelSideProjection(previous: RiderOccupancyPose, proposed: RiderOccupancyPose,
  blockers: readonly RiderSideContactBlocker[], coefficients: RiderOccupancyCoefficients, standoffMetres: number): FullRagSideProjection | null {
  return proposeSideProjection(buildRiderOccupancyEnvelope(previous, coefficients).wheel,
    buildRiderOccupancyEnvelope(proposed, coefficients).wheel, blockers, standoffMetres);
}

/** One exact common XZ contact displacement for wheel root and active world
 * rag particles at EVERY blend. This is a native candidate, never admission. */
export function proposeRiderPhaseSideProjection(previous: RiderOccupancyPose, proposed: RiderOccupancyPose,
  blockers: readonly RiderSideContactBlocker[], coefficients: RiderOccupancyCoefficients, standoffMetres: number): FullRagSideProjection | null {
  const first = buildRiderOccupancyEnvelope(previous, coefficients), last = buildRiderOccupancyEnvelope(proposed, coefficients);
  const wheel = proposeSideProjection(first.wheel, last.wheel, blockers, standoffMetres), human = proposeSideProjection(first.human, last.human, blockers, standoffMetres);
  if (!wheel || !human) return null;
  const planes = [...wheel.planes, ...human.planes];
  if (!planes.some(p => p.required > 0)) return { x: 0, z: 0, normals: [], planes };
  const points = [{ x: 0, z: 0 }, ...planes.map(p => ({ x: p.x * p.required, z: p.z * p.required }))];
  for (let a = 0; a < planes.length; a += 1) for (let b = a + 1; b < planes.length; b += 1) {
    const p = planes[a], q = planes[b], determinant = p.x * q.z - p.z * q.x;
    if (determinant !== 0) points.push({ x: (p.required * q.z - p.z * q.required) / determinant, z: (p.x * q.required - p.required * q.x) / determinant });
  }
  const feasible = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.z)
    && planes.every(p => p.x * point.x + p.z * point.z >= p.required - 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))));
  feasible.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
  if (!feasible.length) return null;
  const point = feasible[0];
  return { ...point, planes, normals: planes.filter(p => p.required > 0 || Math.abs(p.x * point.x + p.z * point.z - p.required) <= 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))).map(p => ({ x: p.x, z: p.z })) };
}
