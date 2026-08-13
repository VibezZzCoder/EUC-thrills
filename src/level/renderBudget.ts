/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {
  LEVEL_GEOMETRY_COST,
  NON_LEVEL_RESERVE,
  PART_COSTS,
  RENDER_BUDGET,
  propPartCounts,
  type PropPartId,
} from '../data/renderCost.ts';
import { SURFACES, type MaterialId } from '../data/surfaces.ts';
import { ribbonQuads } from '../shared/markingRibbon.ts';
import { isContactHazard } from '../simulation/hazards.ts';
import type { BoxCollider, LevelPlan } from './plan.ts';
import { terrainCells } from './terrainCoverage.ts';

/**
 * What a `LevelPlan` will cost to draw — computed from the plan, with no
 * renderer.
 *
 * **This is the seventh validation contract** `docs/PLANS.md` §10 adds to
 * master §6 at M12: a candidate route whose predicted render cost exceeds the
 * §9 ceilings is *invalid* and is retried, exactly like a route with an
 * unlandable jump. Retry, never repair (master §6.4).
 *
 * It is a prediction only in the sense that no GPU was involved. Every number
 * it produces is the number `render/renderCost.ts` measures off the built
 * scene, and `render/renderCost.test.ts` asserts the two agree exactly on the
 * slice, on the proving ground, and on generated routes. The cost model
 * drifting from reality is the top render risk in `docs/PLANS.md` §12, and
 * exact agreement with a measurement is the only mitigation that does not rot.
 *
 * ## Why draw calls barely move and triangles do
 *
 * Everything the renderer builds for a level merges. The heightfield is one
 * mesh with one material group per surface *present*; the blocks are one mesh
 * per material *present*; the props are one `InstancedMesh` per part *present*;
 * the paint is one mesh. **Nothing is per-segment.** So a route that is twice
 * as long costs the same draw calls and twice the triangles, and the ceiling on
 * draw calls belongs to the library rather than to the route.
 *
 * Nothing here may import three.js (invariant 1) or reach into `render/`
 * (invariant 5).
 */

export interface RenderCost {
  readonly drawCalls: number;
  readonly triangles: number;
}

export interface LevelRenderCost extends RenderCost {
  /** Colour pass only. `drawCalls` above includes the shadow pass. */
  readonly colourDrawCalls: number;
  readonly shadowDrawCalls: number;
  readonly colourTriangles: number;
  readonly shadowTriangles: number;
  /** Heightfield cells the renderer will emit. */
  readonly cellsDrawn: number;
  /** Coarse surround patches the field will draw. */
  readonly fieldPatches: number;
  /** Distinct ground surfaces present — one heightfield draw call each. */
  readonly surfaces: readonly string[];
  /** Distinct block materials present — one merged mesh each. */
  readonly blockMaterials: readonly MaterialId[];
  /** Prop instances per part — one `InstancedMesh` each. */
  readonly partInstances: ReadonlyMap<PropPartId, number>;
  readonly markingQuads: number;
  /** Potholes the ground mesh will draw, both kinds. */
  readonly potholes: number;
  /** Deep potholes, which are the ones the water mesh fills. */
  readonly pools: number;
  /** Spills the water mesh draws a puddle for. Their grip is still the grid. */
  readonly spills: number;
  /** Knockabout targets the family will draw — M14. One mesh however many. */
  readonly targets: number;
}

/** Which material a collider is drawn in. The renderer's own rule. */
export function colliderMaterial(collider: BoxCollider): MaterialId {
  return collider.appearance ?? SURFACES[collider.surface].material;
}

/**
 * The level's own contribution to the frame.
 *
 * The shadow pass is counted into `drawCalls` and `triangles` because
 * `renderer.info` counts both passes together and the §9 ceiling is written
 * against what `renderer.info` reports. The two halves are also reported
 * separately, because they are worth telling apart when a budget is tight.
 */
export function planRenderCost(plan: LevelPlan): LevelRenderCost {
  const { bySurface, cellsDrawn, coverage } = terrainCells(plan);

  // -- The ground ---------------------------------------------------------
  // One draw call per surface present, whatever the level's size. Neither the
  // heightfield nor the surround casts: the ground receives shadow, it does not
  // throw it.
  const surfaces = [...bySurface.keys()];
  let colourDrawCalls = surfaces.length
    + LEVEL_GEOMETRY_COST.backstopDrawCalls
    + LEVEL_GEOMETRY_COST.fieldDrawCalls;
  let colourTriangles = cellsDrawn * LEVEL_GEOMETRY_COST.trianglesPerTerrainCell
    + coverage.patchesDrawn * LEVEL_GEOMETRY_COST.trianglesPerFieldPatch
    + LEVEL_GEOMETRY_COST.backstopTriangles;
  let shadowDrawCalls = 0;
  let shadowTriangles = 0;

  // -- Kerbs, walls, plinths ----------------------------------------------
  // Merged per material, and every one of them casts.
  const collidersByMaterial = new Map<MaterialId, number>();
  for (const segment of plan.segments) {
    for (const collider of segment.colliders) {
      const material = colliderMaterial(collider);
      collidersByMaterial.set(material, (collidersByMaterial.get(material) ?? 0) + 1);
    }
  }
  for (const count of collidersByMaterial.values()) {
    const triangles = count * LEVEL_GEOMETRY_COST.trianglesPerCollider;
    colourDrawCalls += 1;
    colourTriangles += triangles;
    shadowDrawCalls += 1;
    shadowTriangles += triangles;
  }

  // -- Dressing -----------------------------------------------------------
  // `plan.solids` is deliberately absent from this sum. Those are simulation
  // data: `render/props.ts` draws the prop mesh and never a collider proxy, so
  // a solid costs nothing to draw beyond the prop that justified it.
  const partInstances = new Map<PropPartId, number>();
  for (const prop of plan.props ?? []) propPartCounts(prop, partInstances);
  for (const [part, instances] of partInstances) {
    const cost = PART_COSTS[part];
    const triangles = cost.triangles * instances;
    colourDrawCalls += 1;
    colourTriangles += triangles;
    if (cost.castsShadow) {
      shadowDrawCalls += 1;
      shadowTriangles += triangles;
    }
  }

  // -- Paint --------------------------------------------------------------
  // One mesh for every line in the level, and none at all when there is no
  // paint — which is every unit-test fixture and the proving ground.
  let markingQuads = 0;
  for (const marking of plan.markings ?? []) {
    markingQuads += ribbonQuads(marking.points, marking.dash, marking.gap);
  }
  if (markingQuads > 0) {
    colourDrawCalls += LEVEL_GEOMETRY_COST.markingDrawCalls;
    colourTriangles += markingQuads * LEVEL_GEOMETRY_COST.trianglesPerMarkingQuad;
  }

  // -- Hazards ------------------------------------------------------------
  // Two meshes: all the level's crushed asphalt in one and all its standing
  // water in the other, and neither at all when the level holds nothing of that
  // kind — which today is every world that ships, and stays that way until
  // Phase 3 places one. `isContactHazard` is imported rather than restated so
  // the kind list has one home (`simulation/hazards.ts`).
  //
  // **A spill's grip is still absent from this sum on purpose.** A spill is a
  // heightfield surface, so it was already charged above as a material group and
  // as the cells it paints; what is charged here is only the drawn puddle lying
  // on those cells, which is new geometry and is not counted anywhere else.
  //
  // Nothing here casts, so the shadow pass does not move — see
  // `render/hazards.ts` for why a recess must not cast into the cascade.
  let potholes = 0;
  let pools = 0;
  let spills = 0;
  for (const hazard of plan.hazards ?? []) {
    if (isContactHazard(hazard)) {
      potholes += 1;
      if (hazard.kind === 'potholeDeep') pools += 1;
    } else if (hazard.kind === 'spill') {
      spills += 1;
    }
  }
  if (potholes > 0) {
    colourDrawCalls += LEVEL_GEOMETRY_COST.hazardGroundDrawCalls;
    colourTriangles += potholes * LEVEL_GEOMETRY_COST.trianglesPerPothole;
  }
  if (pools > 0 || spills > 0) {
    colourDrawCalls += LEVEL_GEOMETRY_COST.hazardWaterDrawCalls;
    colourTriangles += pools * LEVEL_GEOMETRY_COST.trianglesPerPotholePool
      + spills * LEVEL_GEOMETRY_COST.trianglesPerSpillPuddle;
  }

  // Targets — M14. One instanced family, one call, no shadow. The count is a
  // pacing decision and never a frame one, which is the whole reason the stand
  // is a rigid shape (`level/plan.ts`).
  const targets = (plan.targets ?? []).length;
  if (targets > 0) {
    colourDrawCalls += LEVEL_GEOMETRY_COST.targetDrawCalls;
    colourTriangles += targets * LEVEL_GEOMETRY_COST.trianglesPerTarget;
  }

  return {
    drawCalls: colourDrawCalls + shadowDrawCalls,
    triangles: colourTriangles + shadowTriangles,
    colourDrawCalls,
    shadowDrawCalls,
    colourTriangles,
    shadowTriangles,
    cellsDrawn,
    fieldPatches: coverage.patchesDrawn,
    surfaces,
    blockMaterials: [...collidersByMaterial.keys()],
    partInstances,
    markingQuads,
    potholes,
    pools,
    spills,
    targets,
  };
}

/** The whole frame: the level plus everything in the scene that is not it. */
export function frameRenderCost(plan: LevelPlan): RenderCost {
  const level = planRenderCost(plan);
  return {
    drawCalls: level.drawCalls + NON_LEVEL_RESERVE.drawCalls,
    triangles: level.triangles + NON_LEVEL_RESERVE.triangles,
  };
}

export interface BudgetVerdict {
  readonly ok: boolean;
  readonly frame: RenderCost;
  readonly level: LevelRenderCost;
  /** Empty when `ok`. One plain sentence per ceiling breached. */
  readonly breaches: readonly string[];
}

/**
 * Does this plan fit the §9 render budget?
 *
 * The verdict a generator acts on. A breach is a **rejection**, not a repair
 * instruction: master §6.4 is explicit that a rejected layout is regenerated
 * rather than patched, because a generator that trims dressing until a route
 * fits is a generator that ships a world with its own set pieces quietly
 * removed.
 *
 * The reasons are worded for a human reading a generation report, because that
 * is who has to decide whether a seed sweep failing at 3% is a library problem
 * or a budget problem.
 */
export function withinRenderBudget(plan: LevelPlan): BudgetVerdict {
  const level = planRenderCost(plan);
  const frame: RenderCost = {
    drawCalls: level.drawCalls + NON_LEVEL_RESERVE.drawCalls,
    triangles: level.triangles + NON_LEVEL_RESERVE.triangles,
  };

  const breaches: string[] = [];
  if (frame.drawCalls > RENDER_BUDGET.maxDrawCalls) {
    breaches.push(
      `${frame.drawCalls} draw calls against a ceiling of ${RENDER_BUDGET.maxDrawCalls} `
      + `(${level.drawCalls} from the level, ${NON_LEVEL_RESERVE.drawCalls} reserved for the `
      + `rider, ghost, gates and particles)`,
    );
  }
  if (frame.triangles > RENDER_BUDGET.maxTriangles) {
    breaches.push(
      `${frame.triangles} triangles against a ceiling of ${RENDER_BUDGET.maxTriangles} `
      + `(${level.cellsDrawn} ground cells, ${level.fieldPatches} surround patches, `
      + `${level.markingQuads} paint quads)`,
    );
  }

  return { ok: breaches.length === 0, frame, level, breaches };
}
