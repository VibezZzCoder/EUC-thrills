/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Shared ground-boundary policy and the original visible-hazard exclusion. */
import { SURFACES, materialAppearance, type MaterialId } from '../data/surfaces.ts';
import { GROUND_BOUNDARY, POTHOLE } from '../data/tuning.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import type { BoundaryPolicy } from './groundBoundary.ts';

/** Higher rank fills into lower rank; equal ranks use material encroach. */
export const GROUND_EDGE_RANKS: Readonly<Partial<Record<MaterialId, number>>> = Object.freeze({
  brick: 3,
  concrete: 3,
  grass: 2,
  gravel: 2,
  dirt: 2,
  pavement: 1,
  roughPavement: 1,
});

export const GROUND_DRIVABLE_MATERIALS: ReadonlySet<MaterialId> = new Set<MaterialId>(['pavement', 'roughPavement', 'dirt']);
export const GROUND_CRISP_MATERIALS: ReadonlySet<MaterialId> = new Set<MaterialId>([...GROUND_DRIVABLE_MATERIALS, 'gravel']);

export function groundEdgeCapCells(spacing: number): number {
  const { capCells, capMetres } = GROUND_BOUNDARY;
  return spacing > 0 ? Math.min(capCells, capMetres / spacing) : capCells;
}

export function groundDrivableCapCells(spacing: number): number {
  const { drivableCapCells: cells, capMetres } = GROUND_BOUNDARY;
  return spacing > 0 ? Math.min(cells, capMetres / spacing) : cells;
}

/** Resolve afresh, in SURFACES key order, so old mutable policy aliases retain their semantics. */
export function groundBoundaryPolicy(capCells: number, drivableCapCells: number): BoundaryPolicy {
  const ids = Object.keys(SURFACES) as SurfaceId[];
  return {
    surfaces: ids.map((id) => ({
      id,
      rank: GROUND_EDGE_RANKS[SURFACES[id].material] ?? 0,
      encroach: materialAppearance(SURFACES[id].material).encroach,
      drivable: GROUND_DRIVABLE_MATERIALS.has(SURFACES[id].material),
    })),
    capCells,
    drivableCapCells,
    kneeRoundCells: GROUND_BOUNDARY.kneeRoundCells,
    kneeLiftShare: GROUND_BOUNDARY.kneeLiftShare,
    minKeptArea: GROUND_BOUNDARY.minKeptArea,
  };
}

/** Visible reach, preserving the old fallback: every non-spill kind takes the pothole formula. */
export function groundHazardReach(kind: string, radius: number): number {
  if (kind === 'spill') return radius;
  const outline = POTHOLE.outlineHarmonics.reduce((sum, amplitude) => sum + amplitude, 0);
  return radius * POTHOLE.haloFraction * (1 + outline);
}

/**
 * Original Ultra mask, including floor/clamp bounds and strict distance < reach.
 * Does not read precise groundSurfacePatches: that omission is part of old parity.
 * Rank-zero exclusion stays in the arithmetic core. Both source and target read this mask.
 */
export function groundHazardMask(plan: Pick<LevelPlan, 'heightfield' | 'hazards'>): Uint8Array {
  const field = plan.heightfield;
  const columns = field.columns - 1;
  const rows = field.rows - 1;
  const excluded = new Uint8Array(columns * rows);
  for (const hazard of plan.hazards ?? []) {
    const reach = groundHazardReach(hazard.kind, hazard.radius);
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
  return excluded;
}

/**
 * For the ordinary wrapper only. Conservative cell exclusion protects
 * precise source and target semantics. Never call this from the Ultra wrapper.
 */
export function groundPrecisePatchMask(plan: Pick<LevelPlan, 'heightfield' | 'groundSurfacePatches'>, hazards: Uint8Array): Uint8Array {
  const excluded = new Uint8Array(hazards);
  for (const patch of plan.groundSurfacePatches ?? []) {
    for (const triangle of patch.triangles) excluded[triangle.cell] = 1;
  }
  return excluded;
}
