/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The ground-edge preparation's own boundary fill and shared contours, handed
 * to the ordinary terrain build of the same construction (2026-10-18, boot CPU).
 *
 * `prepareSharedGroundEdges` computes `edgeFillForGrid` and
 * `withSharedGroundContours` for the source world; the ordinary
 * `ordinaryBoundaryAttributes` used to compute both again, on equal inputs, a
 * few hundred milliseconds later in the same first construction group. The
 * handoff exists only while a construction scope is open
 * (`constructionScope.ts`: one build, one immutable plan) and is emptied when the
 * outermost scope ends, so nothing outlives the build and a tier rebuild
 * recomputes exactly as before. A consumer reuses it only after checking the
 * complete identity of every input the two computations read
 * (`ordinaryGroundBoundary.ts`), and otherwise computes afresh.
 *
 * Nothing here is a GPU, DOM or simulation resource; nothing is written.
 */
import type { Heightfield, LevelPlan } from '../level/plan.ts';
import type { BoundaryPolicy, EdgeFillField } from './groundBoundary.ts';
import type { SharedContourField } from './sharedGroundContours.ts';
import type { PreparedGroundEdges } from './sharedGroundEdgePlan.ts';
import { constructionScopeOpen, onConstructionScopeEnd } from './constructionScope.ts';

export interface PreparedBoundaryFill {
  readonly plan: LevelPlan;
  readonly heightfield: Heightfield;
  readonly surfaces: Heightfield['surfaces'];
  readonly columns: number;
  readonly rows: number;
  readonly spacing: number;
  readonly hazards: LevelPlan['hazards'];
  readonly patches: LevelPlan['groundSurfacePatches'];
  /** The drawn census the preparation used (`terrainCells(plan).bySurface`). */
  readonly drawn: ReadonlyMap<string, readonly number[]>;
  /** The policy and protected mask passed to `edgeFillForGrid`. */
  readonly policy: BoundaryPolicy;
  readonly protectedCells: Uint8Array;
  readonly original: EdgeFillField;
  readonly contour: SharedContourField;
}

let fills = new WeakMap<PreparedGroundEdges, PreparedBoundaryFill>();
onConstructionScopeEnd(() => { fills = new WeakMap(); });

/** Record a preparation's fill; a no-op outside a construction scope. */
export function recordPreparedBoundaryFill(prepared: PreparedGroundEdges, fill: PreparedBoundaryFill): void {
  if (constructionScopeOpen()) fills.set(prepared, fill);
}

/** The fill recorded for `prepared` in the open scope, or undefined. */
export function preparedBoundaryFill(prepared: PreparedGroundEdges): PreparedBoundaryFill | undefined {
  return constructionScopeOpen() ? fills.get(prepared) : undefined;
}
