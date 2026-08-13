/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { TERRAIN } from '../data/tuning.ts';
import type { LevelPlan } from './plan.ts';

/**
 * Which ground a plan actually draws — the rule, with one owner.
 *
 * Two questions need this answer and they must never get different ones:
 *
 *   - `render/terrain.ts` builds the mesh from it. A cell it skips is a cell
 *     the coarse surround field covers instead, and a patch of field it draws
 *     is a patch the heightfield did not need.
 *   - `level/renderBudget.ts` predicts the level's triangle cost from it, which
 *     M12 makes one of the generator's validation contracts (`docs/PLANS.md`
 *     §10, Phase 2). A budget model that counted cells by its own rule would be
 *     the same geometry described twice — the exact failure invariant 2 exists
 *     to prevent, and the one `docs/PLANS.md` §12 names as "the cost model
 *     drifting from reality".
 *
 * So the rule lives here, in plain data with no three.js in it (invariant 1),
 * and both sides call it. It moved out of `render/terrain.ts` unchanged at M12
 * Phase 0; `src/render/renderCost.test.ts` pins the counts it produces for the
 * slice and the proving ground to what they were before the move.
 */

/**
 * Which coarse surround patches are flush with the surround, and which have to
 * yield to the heightfield underneath them.
 *
 * A patch yields if **any** heightfield sample it covers is off the surround's
 * height, or any cell under it carries another surface. That is deliberately
 * conservative: the cost of yielding a patch that did not need to is a few
 * hundred extra triangles, and the cost of covering one that did is a lid over
 * the level.
 */
export interface FieldCoverage {
  /** Whether the coarse field still draws over this heightfield cell. */
  covers(column: number, row: number): boolean;
  /** Whether the coarse field draws this patch of its own grid. */
  patch(column: number, row: number): boolean;
  readonly columns: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cell: number;
  /** Patches the field actually draws. Two triangles each. */
  readonly patchesDrawn: number;
}

/** World X of a heightfield column. */
function x0(field: LevelPlan['heightfield'], column: number): number {
  return field.originX + column * field.spacing;
}

export function fieldCoverage(plan: LevelPlan): FieldCoverage {
  const field = plan.heightfield;
  const cell = TERRAIN.surroundCellSize;
  const minX = field.originX - TERRAIN.surroundMargin;
  const minZ = field.originZ - TERRAIN.surroundMargin;
  const spanX = (field.columns - 1) * field.spacing + TERRAIN.surroundMargin * 2;
  const spanZ = (field.rows - 1) * field.spacing + TERRAIN.surroundMargin * 2;
  const columns = Math.ceil(spanX / cell);
  const rows = Math.ceil(spanZ / cell);
  const flush = new Uint8Array(columns * rows).fill(1);

  const patchOf = (x: number, z: number): number => {
    const column = Math.floor((x - minX) / cell);
    const row = Math.floor((z - minZ) / cell);
    if (column < 0 || row < 0 || column >= columns || row >= rows) return -1;
    return row * columns + column;
  };

  // One pass over the heightfield, marking the patch above every sample that is
  // not at the surround's own height and every cell that is not its surface.
  for (let row = 0; row < field.rows; row += 1) {
    const z = field.originZ + row * field.spacing;
    for (let column = 0; column < field.columns; column += 1) {
      const height = field.heights[row * field.columns + column];
      const surface = row < field.rows - 1 && column < field.columns - 1
        ? field.surfaces[row * (field.columns - 1) + column]
        : plan.surround.surface;
      if (height === plan.surround.height && surface === plan.surround.surface) continue;
      // The four patches this sample can touch, because a sample sits on a
      // corner shared by up to four heightfield cells and those may straddle a
      // patch boundary.
      for (const dx of [-field.spacing, field.spacing]) {
        for (const dz of [-field.spacing, field.spacing]) {
          const index = patchOf(x0(field, column) + dx, z + dz);
          if (index >= 0) flush[index] = 0;
        }
      }
      const index = patchOf(x0(field, column), z);
      if (index >= 0) flush[index] = 0;
    }
  }

  let patchesDrawn = 0;
  for (const value of flush) if (value === 1) patchesDrawn += 1;

  return {
    columns,
    rows,
    minX,
    minZ,
    cell,
    patchesDrawn,
    patch: (column, row) => flush[row * columns + column] === 1,
    covers(column, row) {
      const index = patchOf(
        field.originX + (column + 0.5) * field.spacing,
        field.originZ + (row + 0.5) * field.spacing,
      );
      return index < 0 || flush[index] === 1;
    },
  };
}

/**
 * The heightfield cells the renderer emits, grouped by surface.
 *
 * Insertion order is the order the renderer lays its material groups down in,
 * so the returned map is the draw order as well as the census. One entry is one
 * draw call; the array behind it is the triangles.
 */
export interface TerrainCells {
  readonly coverage: FieldCoverage;
  /** Cell indices per surface, in the order the surfaces were first met. */
  readonly bySurface: ReadonlyMap<string, number[]>;
  readonly cellsDrawn: number;
}

export function terrainCells(plan: LevelPlan): TerrainCells {
  const field = plan.heightfield;
  const coverage = fieldCoverage(plan);
  const cellColumns = field.columns - 1;
  const cellRows = field.rows - 1;

  const sample = (column: number, row: number): number => field.heights[row * field.columns + column];

  const bySurface = new Map<string, number[]>();
  let cellsDrawn = 0;

  for (let row = 0; row < cellRows; row += 1) {
    for (let column = 0; column < cellColumns; column += 1) {
      const cell = row * cellColumns + column;
      const surface = field.surfaces[cell];
      // Skip cells that are pure surround **and that the field still covers**.
      // The field only covers a coarse patch when every sample under it is
      // flush, so a flat patch beside a cutting is drawn here instead — which is
      // what keeps the join seamless where the field has yielded.
      if (
        coverage.covers(column, row)
        && surface === plan.surround.surface
        && sample(column, row) === plan.surround.height
        && sample(column + 1, row) === plan.surround.height
        && sample(column, row + 1) === plan.surround.height
        && sample(column + 1, row + 1) === plan.surround.height
      ) {
        continue;
      }

      let list = bySurface.get(surface);
      if (list === undefined) {
        list = [];
        bySurface.set(surface, list);
      }
      list.push(cell);
      cellsDrawn += 1;
    }
  }

  return { coverage, bySurface, cellsDrawn };
}
