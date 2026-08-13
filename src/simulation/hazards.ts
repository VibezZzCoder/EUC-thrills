/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Where the potholes are, and which one the wheel is in — M13.
 *
 * The counterpart to `challenge.ts`: a small, world-aware module that the
 * controller asks a question of, holding no simulation state of its own. It
 * imports `Hazard` straight from `level/plan.ts` for the same reason the
 * referee imports `Checkpoint` — the authored volume and the volume the
 * simulation tests must be the same object, and a second copy of the geometry
 * is a second thing to drift.
 *
 * **This is a broadphase and it decides nothing.** It narrows "which of the
 * hazards in this world could the wheel be touching" from every hazard to the
 * two or three sharing a grid cell with it; whether that costs speed, starts a
 * wobble, or ends the run is `EucController`'s answer, and the tuning that
 * makes it is on F4.
 *
 * ## Only the potholes are here
 *
 * `plan.hazards` carries spills too, and this field deliberately drops them at
 * construction. A spill is not a contact event: its build paints the
 * heightfield with the `spill` surface, and from there low grip, rolling
 * resistance and — uniquely in the whole table — a continuous `wobbleInjection`
 * are all delivered by the surface system the controller has consumed since M4.
 * Routing a puddle through here as well would be the same ride response stated
 * twice, in two places that could disagree, and the one that ran second would
 * win silently. The plan keeps the spill record because `render/` draws the
 * sheen from it and because a safe position may not be recorded inside one; the
 * simulation reads that second fact off `GroundSample.surface`, which it
 * already has in hand, for free.
 *
 * ## The grid is `planSampler.ts`'s, on purpose
 *
 * Compressed rows — one `Int32Array` of offsets and one flat `Int32Array` of
 * indices — built by counting sort, so a query touches one contiguous run of
 * integers and allocates nothing. That file argues the case at length and the
 * argument transfers unchanged; what is worth saying here is why a hazard
 * needs it *at all*, given there are far fewer holes in a route than there are
 * colliders. It is the 120 Hz step: this is asked once per step for the whole
 * ride, so the cost of a linear scan is not "small" but "proportional to how
 * interesting the route is", and a generator that got more ambitious would pay
 * for it in the one place a frame cannot afford.
 *
 * Nothing here may import three.js — AGENTS.md invariant 1, enforced by
 * `src/architecture.test.ts`.
 */

import type { Hazard } from '../level/plan.ts';

/**
 * Target grid cell in metres, and the cap on the grid's own dimensions.
 *
 * Both copied from `planSampler.ts` rather than re-derived, because a hazard
 * grid that binned differently from the collider grid over the same world
 * would be a second spatial scheme to reason about for no gain. The cell grows
 * to fit rather than the array growing without bound: at most 65,536 cells,
 * whatever the generator produces.
 */
const GRID_TARGET_CELL = 8;
const GRID_MAX_SPAN = 256;

/**
 * A hazard with its query arithmetic already done.
 *
 * The squared radius is here so the point test is two multiplies and a compare
 * with no square root, and the bounds are here because the grid buckets by
 * bounding box. Both are constant for the life of a world.
 */
interface PreparedHazard {
  readonly hazard: Hazard;
  readonly x: number;
  readonly z: number;
  readonly radiusSquared: number;
  /** Higher wins when two footprints overlap. See `at`. */
  readonly severity: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Whether a hazard is a discrete contact event rather than ground.
 *
 * Exported so `level/` and `render/` can ask the same question this file asks,
 * instead of three places each writing out the same list of kinds and one of
 * them being wrong after the next kind is added.
 */
export function isContactHazard(hazard: Hazard): boolean {
  return hazard.kind === 'potholeShallow' || hazard.kind === 'potholeDeep';
}

/**
 * The potholes of one world, indexed for a per-step point query.
 *
 * Built once per `installLevel` and immutable thereafter, like every other
 * world-derived object the simulation holds.
 */
export class HazardField {
  private readonly hazards: readonly PreparedHazard[];

  // -- The hazard grid, exactly as `planSampler` builds its collider grid ----
  private readonly gridOriginX: number;
  private readonly gridOriginZ: number;
  private readonly gridCell: number;
  private readonly gridColumns: number;
  private readonly gridRows: number;
  /** Compressed rows: `items[starts[c] .. starts[c + 1])` is cell `c`. */
  private readonly gridStarts: Int32Array;
  private readonly gridItems: Int32Array;

  constructor(hazards: readonly Hazard[] = []) {
    this.hazards = hazards.filter(isContactHazard).map((hazard) => ({
      hazard,
      x: hazard.centre.x,
      z: hazard.centre.z,
      radiusSquared: hazard.radius * hazard.radius,
      severity: hazard.kind === 'potholeDeep' ? 2 : 1,
      minX: hazard.centre.x - hazard.radius,
      maxX: hazard.centre.x + hazard.radius,
      minZ: hazard.centre.z - hazard.radius,
      maxZ: hazard.centre.z + hazard.radius,
    }));

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const prepared of this.hazards) {
      if (prepared.minX < minX) minX = prepared.minX;
      if (prepared.maxX > maxX) maxX = prepared.maxX;
      if (prepared.minZ < minZ) minZ = prepared.minZ;
      if (prepared.maxZ > maxZ) maxZ = prepared.maxZ;
    }
    // A world with no hazards is the *normal* case here, not the empty edge
    // case it is for colliders: the slice and the proving ground carry none by
    // owner decision, and so does every fixture. One cell containing nothing
    // answers every query correctly and keeps `at` free of a branch it would
    // otherwise take on every step of the game's most-ridden level.
    if (this.hazards.length === 0) {
      minX = 0;
      maxX = 0;
      minZ = 0;
      maxZ = 0;
    }
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanZ = Math.max(maxZ - minZ, 1e-6);
    this.gridCell = Math.max(
      GRID_TARGET_CELL,
      spanX / GRID_MAX_SPAN,
      spanZ / GRID_MAX_SPAN,
    );
    this.gridOriginX = minX;
    this.gridOriginZ = minZ;
    this.gridColumns = Math.max(1, Math.ceil(spanX / this.gridCell));
    this.gridRows = Math.max(1, Math.ceil(spanZ / this.gridCell));

    // Counting sort into compressed rows: count, prefix-sum, scatter.
    const cells = this.gridColumns * this.gridRows;
    const counts = new Int32Array(cells);
    let total = 0;
    for (const prepared of this.hazards) {
      total += this.eachCell(prepared, (cell) => {
        counts[cell] += 1;
      });
    }
    this.gridStarts = new Int32Array(cells + 1);
    for (let cell = 0; cell < cells; cell += 1) {
      this.gridStarts[cell + 1] = this.gridStarts[cell] + counts[cell];
    }
    this.gridItems = new Int32Array(total);
    const cursor = Int32Array.from(this.gridStarts.subarray(0, cells));
    for (let index = 0; index < this.hazards.length; index += 1) {
      this.eachCell(this.hazards[index], (cell) => {
        this.gridItems[cursor[cell]] = index;
        cursor[cell] += 1;
      });
    }
  }

  /** How many contact hazards this world has. Spills are not counted. */
  get count(): number {
    return this.hazards.length;
  }

  /**
   * The hazard whose footprint contains this point, or `null`.
   *
   * **A point test, not a circle-circle one.** The contact patch is a point
   * everywhere else in the simulation — it is what the ground probe samples,
   * what a checkpoint volume is tested against, and what the rig is positioned
   * at — and a hazard that used the wheel's width here would be the one volume
   * in the game that triggered before the wheel reached it. The consequence is
   * that an authored `radius` is the radius at which the rider is *in* the
   * hole, not the radius of the hole's visible mouth, and `render/` is what
   * reconciles those.
   *
   * **When two footprints overlap the worse one wins**, and only then does
   * array order break the tie. Phase 3's spacing contract is meant to make
   * overlap impossible, but "meant to" is not a guarantee the simulation can
   * rely on, and a rider who clips the edge of a deep hole that happens to be
   * listed second should not be handed the shallow hole's outcome. Severity
   * first also means the answer cannot change if the generator ever reorders
   * its output, which is the property that keeps `advance(n)` reproducible.
   *
   * Allocation-free: one cell's contiguous run of indices, and the returned
   * `Hazard` is the plan's own object.
   */
  at(x: number, z: number): Hazard | null {
    // One cell is a complete answer because `eachCell` lists a hazard in every
    // cell its bounds touch — a point cannot be in two cells, but a hazard can.
    const cell = this.cellAt(x, z);
    const end = this.gridStarts[cell + 1];
    let best: PreparedHazard | null = null;
    for (let slot = this.gridStarts[cell]; slot < end; slot += 1) {
      const prepared = this.hazards[this.gridItems[slot]];
      if (best !== null && prepared.severity <= best.severity) continue;
      const dx = x - prepared.x;
      const dz = z - prepared.z;
      if (dx * dx + dz * dz > prepared.radiusSquared) continue;
      best = prepared;
    }
    return best === null ? null : best.hazard;
  }

  /**
   * Visit every grid cell a hazard's bounds touch. Returns how many.
   *
   * Called twice at construction and never again.
   */
  private eachCell(prepared: PreparedHazard, visit: (cell: number) => void): number {
    const fromColumn = this.columnAt(prepared.minX);
    const toColumn = this.columnAt(prepared.maxX);
    const fromRow = this.rowAt(prepared.minZ);
    const toRow = this.rowAt(prepared.maxZ);
    let visited = 0;
    for (let row = fromRow; row <= toRow; row += 1) {
      for (let column = fromColumn; column <= toColumn; column += 1) {
        visit(row * this.gridColumns + column);
        visited += 1;
      }
    }
    return visited;
  }

  /**
   * Grid column and row for a world coordinate, clamped into the grid.
   *
   * Clamping rather than rejecting is correct for the same reason it is in
   * `planSampler`: the grid's bounds are the union of every hazard's bounds, so
   * a point outside them is outside every hazard. It lands in a border cell,
   * whose hazards then fail the exact test they were always going to fail.
   */
  private columnAt(x: number): number {
    const column = Math.floor((x - this.gridOriginX) / this.gridCell);
    return column < 0 ? 0 : column >= this.gridColumns ? this.gridColumns - 1 : column;
  }

  private rowAt(z: number): number {
    const row = Math.floor((z - this.gridOriginZ) / this.gridCell);
    return row < 0 ? 0 : row >= this.gridRows ? this.gridRows - 1 : row;
  }

  private cellAt(x: number, z: number): number {
    return this.rowAt(z) * this.gridColumns + this.columnAt(x);
  }
}

/** A field with nothing in it, for a world that has no hazards. */
export const NO_HAZARDS = new HazardField([]);
