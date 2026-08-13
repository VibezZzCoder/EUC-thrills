/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { Target } from '../level/plan.ts';
import type { HittableSet, HittableVolume } from './paddle.ts';

/**
 * Where the targets are, which are still standing, and which one a swing could
 * reach — M14.
 *
 * The counterpart to `hazards.ts`: a small, world-aware module the composition
 * root hands to whoever needs it, holding no simulation state beyond the one
 * fact a run owns — whether each target is still up. It imports `Target`
 * straight from `level/plan.ts` for the same reason the referee imports
 * `Checkpoint` and the hazard field imports `Hazard`: the authored volume and
 * the volume the simulation tests must be the same object, and a second copy of
 * the geometry is a second thing to drift.
 *
 * **This is a broadphase and it decides nothing.** It narrows "which targets
 * could this swept paddle head be touching" from every target in the route to
 * the two or three sharing a grid cell with the sweep; whether that scores,
 * sounds, or knocks anything down is the mode's answer. It implements
 * `HittableSet` (`simulation/paddle.ts`) and that interface is deliberately the
 * only thing the paddle knows about it — the same paddle will one day be handed
 * a set of rider capsules instead, without either file changing.
 *
 * **The struck set lives here and is a fact about the *run*, not the world.**
 * `plan.targets` is immutable level data; a route reloaded is a route with every
 * target standing again. §13 q21 settles what a strike means: a struck target
 * stays down for the rest of the run.
 *
 * Nothing here may import three.js — AGENTS.md invariant 1, enforced by
 * `src/architecture.test.ts`.
 *
 * ## The grid is `hazards.ts`'s, which is `planSampler.ts`'s
 *
 * Compressed rows — one `Int32Array` of offsets and one flat `Int32Array` of
 * indices, built by counting sort — so a query touches contiguous integers and
 * allocates nothing. Copied rather than re-derived because a third spatial
 * scheme over the same world would be a third thing to reason about for no gain.
 *
 * One difference from the hazard field, and it is the reason `eachNear` carries
 * a stamp array: a hazard query is a **point**, which can only be in one cell,
 * while a swing query is a **box** that routinely spans several. A target listed
 * in each cell its bounds touch would then be visited once per shared cell, and
 * a duplicate visit is a target scored twice from one swing.
 */

/** Grid cell in metres, and the cap on the grid's own dimensions. */
const GRID_TARGET_CELL = 8;
const GRID_MAX_SPAN = 256;

/** A target with its query arithmetic already done, and its bounds grown by it. */
interface PreparedTarget extends HittableVolume {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export class TargetField implements HittableSet {
  private readonly targets: readonly PreparedTarget[];
  private readonly indexOf: ReadonlyMap<string, number>;
  /** One byte per target: 1 once struck. Reset by a fresh run, not by a reload. */
  private readonly down: Uint8Array;
  private struck = 0;

  // -- The grid, exactly as `hazards.ts` builds its own ----------------------
  private readonly gridOriginX: number;
  private readonly gridOriginZ: number;
  private readonly gridCell: number;
  private readonly gridColumns: number;
  private readonly gridRows: number;
  /** Compressed rows: `items[starts[c] .. starts[c + 1])` is cell `c`. */
  private readonly gridStarts: Int32Array;
  private readonly gridItems: Int32Array;

  /**
   * Which query last saw each target, so one box query visits it once.
   *
   * A counter rather than a `Set` that is cleared: clearing costs the size of
   * the world on every step, and a stamp costs one comparison per candidate.
   */
  private readonly visitStamp: Int32Array;
  private queryStamp = 0;

  constructor(targets: readonly Target[] = []) {
    this.targets = targets.map((target) => ({
      id: target.id,
      x: target.centre.x,
      y: target.centre.y,
      z: target.centre.z,
      radius: target.radius,
      minX: target.centre.x - target.radius,
      maxX: target.centre.x + target.radius,
      minY: target.centre.y - target.radius,
      maxY: target.centre.y + target.radius,
      minZ: target.centre.z - target.radius,
      maxZ: target.centre.z + target.radius,
    }));

    const indexOf = new Map<string, number>();
    for (let index = 0; index < this.targets.length; index += 1) {
      // A duplicate id would make `strike` knock down whichever copy was listed
      // last while the swing hit the other, and the renderer would leave a
      // struck target standing. `buildPlan` refuses duplicates upstream; this
      // keeps the invariant true of whatever reaches the field.
      const { id } = this.targets[index];
      if (indexOf.has(id)) throw new Error(`two targets share the id "${id}"`);
      indexOf.set(id, index);
    }
    this.indexOf = indexOf;
    this.down = new Uint8Array(this.targets.length);
    this.visitStamp = new Int32Array(this.targets.length);

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const prepared of this.targets) {
      if (prepared.minX < minX) minX = prepared.minX;
      if (prepared.maxX > maxX) maxX = prepared.maxX;
      if (prepared.minZ < minZ) minZ = prepared.minZ;
      if (prepared.maxZ > maxZ) maxZ = prepared.maxZ;
    }
    // A world with no targets is the normal case, not an edge case: §13 q12
    // puts them in generated routes only, so the slice, the proving ground and
    // every fixture carry none. One empty cell answers every query correctly
    // and keeps the hot path free of a branch.
    if (this.targets.length === 0) {
      minX = 0;
      maxX = 0;
      minZ = 0;
      maxZ = 0;
    }
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanZ = Math.max(maxZ - minZ, 1e-6);
    this.gridCell = Math.max(GRID_TARGET_CELL, spanX / GRID_MAX_SPAN, spanZ / GRID_MAX_SPAN);
    this.gridOriginX = minX;
    this.gridOriginZ = minZ;
    this.gridColumns = Math.max(1, Math.ceil(spanX / this.gridCell));
    this.gridRows = Math.max(1, Math.ceil(spanZ / this.gridCell));

    // Counting sort into compressed rows: count, prefix-sum, scatter.
    const cells = this.gridColumns * this.gridRows;
    const counts = new Int32Array(cells);
    let total = 0;
    for (const prepared of this.targets) {
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
    for (let index = 0; index < this.targets.length; index += 1) {
      this.eachCell(this.targets[index], (cell) => {
        this.gridItems[cursor[cell]] = index;
        cursor[cell] += 1;
      });
    }
  }

  /** How many targets this world has. The denominator of the score. */
  get count(): number {
    return this.targets.length;
  }

  /** How many have been struck this run. The numerator. */
  get struckCount(): number {
    return this.struck;
  }

  /** True when the world carries none — the case §13 q21 makes legal. */
  get empty(): boolean {
    return this.targets.length === 0;
  }

  isStruck(id: string): boolean {
    const index = this.indexOf.get(id);
    return index !== undefined && this.down[index] === 1;
  }

  /**
   * Knock one down. False if it is already down or is not in this world.
   *
   * The caller scores on a `true` and on nothing else, which is what makes a
   * second swing at a fallen target cost nothing and score nothing — the
   * behaviour §13 q21 asks for, expressed where it cannot be got wrong twice.
   */
  strike(id: string): boolean {
    const index = this.indexOf.get(id);
    if (index === undefined || this.down[index] === 1) return false;
    this.down[index] = 1;
    this.struck += 1;
    return true;
  }

  /** Stand everything back up. A new run on the same world, never a reload. */
  reset(): void {
    if (this.struck === 0) return;
    this.down.fill(0);
    this.struck = 0;
  }

  /** Every target still standing, in array order. For the renderer's rebuild. */
  standing(visit: (volume: HittableVolume) => void): void {
    for (let index = 0; index < this.targets.length; index += 1) {
      if (this.down[index] === 1) continue;
      visit(this.targets[index]);
    }
  }

  /**
   * `HittableSet`: every standing target whose own bounds overlap this box.
   *
   * Struck targets are skipped here rather than in the caller, so "a fallen
   * target cannot be hit again" is a property of the set rather than a rule the
   * paddle has to remember — and so the same paddle asking a set of riders gets
   * the same guarantee about riders already down.
   */
  eachNear(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    visit: (volume: HittableVolume) => void,
  ): void {
    if (this.targets.length === 0) return;
    this.queryStamp += 1;
    const stamp = this.queryStamp;

    const fromColumn = this.columnAt(minX);
    const toColumn = this.columnAt(maxX);
    const fromRow = this.rowAt(minZ);
    const toRow = this.rowAt(maxZ);

    for (let row = fromRow; row <= toRow; row += 1) {
      const rowBase = row * this.gridColumns;
      for (let column = fromColumn; column <= toColumn; column += 1) {
        const cell = rowBase + column;
        const end = this.gridStarts[cell + 1];
        for (let slot = this.gridStarts[cell]; slot < end; slot += 1) {
          const index = this.gridItems[slot];
          if (this.visitStamp[index] === stamp) continue;
          this.visitStamp[index] = stamp;
          if (this.down[index] === 1) continue;
          const prepared = this.targets[index];
          if (prepared.maxX < minX || prepared.minX > maxX) continue;
          if (prepared.maxY < minY || prepared.minY > maxY) continue;
          if (prepared.maxZ < minZ || prepared.minZ > maxZ) continue;
          visit(prepared);
        }
      }
    }
  }

  /** Visit every grid cell a target's bounds touch. Returns how many. */
  private eachCell(prepared: PreparedTarget, visit: (cell: number) => void): number {
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
   * Clamping rather than rejecting, for `planSampler`'s reason: the grid's
   * bounds are the union of every target's bounds, so a point outside them is
   * outside every target. It lands in a border cell, whose targets then fail the
   * exact bounds test they were always going to fail.
   */
  private columnAt(x: number): number {
    const column = Math.floor((x - this.gridOriginX) / this.gridCell);
    return column < 0 ? 0 : column >= this.gridColumns ? this.gridColumns - 1 : column;
  }

  private rowAt(z: number): number {
    const row = Math.floor((z - this.gridOriginZ) / this.gridCell);
    return row < 0 ? 0 : row >= this.gridRows ? this.gridRows - 1 : row;
  }
}

/** A field with nothing in it, for a world that has no targets. */
export const NO_TARGETS = new TargetField([]);
