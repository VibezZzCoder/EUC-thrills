/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { TARGET } from '../data/tuning.ts';
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

/** The visible rigid stand used only by the rider/EUC body-contact path. */
export interface TargetBodyVolume extends HittableVolume {
  readonly centre: Target['centre'];
  readonly base: Target['base'];
}

/** A target with both query shapes' arithmetic already done. */
interface PreparedTarget extends TargetBodyVolume {
  /** Disc-only bounds. `HittableSet.eachNear` must remain paddle-only. */
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Whole visible rigid stand: post and arm, plus the disc at their end. */
  readonly bodyMinX: number;
  readonly bodyMaxX: number;
  readonly bodyMinY: number;
  readonly bodyMaxY: number;
  readonly bodyMinZ: number;
  readonly bodyMaxZ: number;
}

function clampUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Squared XZ distance from a point to a finite segment. */
function pointSegmentDistanceSquared(
  pointX: number,
  pointZ: number,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): number {
  const segmentX = toX - fromX;
  const segmentZ = toZ - fromZ;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  const along = lengthSquared > 0
    ? clampUnit(((pointX - fromX) * segmentX + (pointZ - fromZ) * segmentZ) / lengthSquared)
    : 0;
  const dx = pointX - (fromX + segmentX * along);
  const dz = pointZ - (fromZ + segmentZ * along);
  return dx * dx + dz * dz;
}

/** Squared XZ distance between two finite segments, including degeneracies. */
function segmentDistanceSquared(
  a0X: number,
  a0Z: number,
  a1X: number,
  a1Z: number,
  b0X: number,
  b0Z: number,
  b1X: number,
  b1Z: number,
): number {
  const aX = a1X - a0X;
  const aZ = a1Z - a0Z;
  const bX = b1X - b0X;
  const bZ = b1Z - b0Z;
  const cross = aX * bZ - aZ * bX;
  if (cross !== 0) {
    const betweenX = b0X - a0X;
    const betweenZ = b0Z - a0Z;
    const alongA = (betweenX * bZ - betweenZ * bX) / cross;
    const alongB = (betweenX * aZ - betweenZ * aX) / cross;
    if (alongA >= 0 && alongA <= 1 && alongB >= 0 && alongB <= 1) return 0;
  }

  return Math.min(
    pointSegmentDistanceSquared(a0X, a0Z, b0X, b0Z, b1X, b1Z),
    pointSegmentDistanceSquared(a1X, a1Z, b0X, b0Z, b1X, b1Z),
    pointSegmentDistanceSquared(b0X, b0Z, a0X, a0Z, a1X, a1Z),
    pointSegmentDistanceSquared(b1X, b1Z, a0X, a0Z, a1X, a1Z),
  );
}

/**
 * Whether the rider/EUC's swept plan-space body touches the visible stand.
 *
 * The stand is the union the player sees: a thin post-and-arm capsule from the
 * foot to the pad, and the round pad at its end. This intentionally is not the
 * paddle shape; a swing still reaches only the disc sphere through `eachNear`.
 */
export function sweptBodyHitsTarget(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  bodyRadius: number,
  target: Pick<Target, 'centre' | 'base' | 'radius'>,
): boolean {
  const standReach = bodyRadius + TARGET.postRadius;
  if (segmentDistanceSquared(
    fromX,
    fromZ,
    toX,
    toZ,
    target.base.x,
    target.base.z,
    target.centre.x,
    target.centre.z,
  ) <= standReach * standReach) return true;

  const discReach = bodyRadius + target.radius;
  return pointSegmentDistanceSquared(
    target.centre.x,
    target.centre.z,
    fromX,
    fromZ,
    toX,
    toZ,
  ) <= discReach * discReach;
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
      centre: target.centre,
      base: target.base,
      minX: target.centre.x - target.radius,
      maxX: target.centre.x + target.radius,
      minY: target.centre.y - target.radius,
      maxY: target.centre.y + target.radius,
      minZ: target.centre.z - target.radius,
      maxZ: target.centre.z + target.radius,
      bodyMinX: Math.min(target.base.x - TARGET.postRadius, target.centre.x - target.radius),
      bodyMaxX: Math.max(target.base.x + TARGET.postRadius, target.centre.x + target.radius),
      bodyMinY: Math.min(target.base.y, target.centre.y - target.radius),
      bodyMaxY: Math.max(target.base.y, target.centre.y + target.radius),
      bodyMinZ: Math.min(target.base.z - TARGET.postRadius, target.centre.z - target.radius),
      bodyMaxZ: Math.max(target.base.z + TARGET.postRadius, target.centre.z + target.radius),
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
      if (prepared.bodyMinX < minX) minX = prepared.bodyMinX;
      if (prepared.bodyMaxX > maxX) maxX = prepared.bodyMaxX;
      if (prepared.bodyMinZ < minZ) minZ = prepared.bodyMinZ;
      if (prepared.bodyMaxZ > maxZ) maxZ = prepared.bodyMaxZ;
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
    this.eachPreparedNear(minX, minY, minZ, maxX, maxY, maxZ, false, visit);
  }

  /**
   * Every standing target whose whole visible stand overlaps this box.
   *
   * This is the body/EUC broadphase only. Paddle callers stay on `eachNear`,
   * whose candidate bounds remain the round strike disc and nothing else.
   */
  eachBodyNear(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    visit: (volume: TargetBodyVolume) => void,
  ): void {
    this.eachPreparedNear(minX, minY, minZ, maxX, maxY, maxZ, true, visit);
  }

  private eachPreparedNear(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    body: boolean,
    visit: (volume: PreparedTarget) => void,
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
          const candidateMinX = body ? prepared.bodyMinX : prepared.minX;
          const candidateMaxX = body ? prepared.bodyMaxX : prepared.maxX;
          const candidateMinY = body ? prepared.bodyMinY : prepared.minY;
          const candidateMaxY = body ? prepared.bodyMaxY : prepared.maxY;
          const candidateMinZ = body ? prepared.bodyMinZ : prepared.minZ;
          const candidateMaxZ = body ? prepared.bodyMaxZ : prepared.maxZ;
          if (candidateMaxX < minX || candidateMinX > maxX) continue;
          if (candidateMaxY < minY || candidateMinY > maxY) continue;
          if (candidateMaxZ < minZ || candidateMinZ > maxZ) continue;
          visit(prepared);
        }
      }
    }
  }

  /** Visit every grid cell a target's bounds touch. Returns how many. */
  private eachCell(prepared: PreparedTarget, visit: (cell: number) => void): number {
    const fromColumn = this.columnAt(prepared.bodyMinX);
    const toColumn = this.columnAt(prepared.bodyMaxX);
    const fromRow = this.rowAt(prepared.bodyMinZ);
    const toRow = this.rowAt(prepared.bodyMaxZ);
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
