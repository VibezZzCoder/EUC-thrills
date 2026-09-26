/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { TERRAIN, WHEEL } from '../data/tuning.ts';
import type { BoxCollider, Heightfield, LevelPlan } from '../level/plan.ts';
import type { RouteSpine, SpineSample } from './routeSpine.ts';
import { createSpineSample } from './routeSpine.ts';

/**
 * The local navigation grid — the brutal pass (2026-09-25), and the one
 * sanctioned *search* in the cop's brain.
 *
 * **The cop follows a spine along the route; off it, close to his quarry, he
 * may now find his way round what stands between them.** The owner's ride
 * found the hole the spine leaves: *"could easily escape it in starting areas
 * by hiding behind obstacles (on the outside) and watching it run side to side
 * (on the inside) like i'm invisible"*. The spine knows the road and nothing
 * beside it; the field pursuit aimed straight across the grass and met the
 * building; the flank walked a widening zig-zag along a face it could not see.
 * None of them could answer "the way to him is round the other end of the
 * plaza block". This can.
 *
 * **What it is.** One occupancy grid per world, built once from the plan alone
 * (`buildNavGrid`, beside `buildRouteField`, shared read-only by every brain
 * exactly as the route field is): a cell is blocked where a solid the wheel
 * cannot mount stands, grown by the wheel's own room; a deep pothole is
 * blocked too, and the cells hugging a wall or over a spill cost a little
 * more, so a path keeps the middle of a gap. `NavPlanner` is a brain's own
 * bounded A* over a window of it, with a line-of-sight string pull, so what
 * the brain steers along is a handful of corners rather than a staircase of
 * cells.
 *
 * **What it is not.** It is not a route planner and it never replaces the
 * spine: the brain asks it only at close quarters (`CpuRider`'s nav range),
 * the search is capped in area and in expansions, and it re-plans at a bounded
 * rate. It knows nothing the plan does not state (soft bodies are
 * pass-through by M15 and stay invisible; a wall of the surround the plan does
 * not draw is still met with the wall standoff and the stuck ladder), and it
 * decides nothing about speed or the wheel: the brain still steers one
 * `ActionSnapshot` through the player's own controller.
 *
 * Nothing here imports three.js (invariant 1) or reads a player option
 * (invariant 5). The grid is immutable after `buildNavGrid`; a planner's
 * scratch is its owner's.
 */

/** The side of one grid cell, metres. A wheel's length: small enough to thread a gateway, cheap enough for a town. */
export const NAV_CELL_METRES = 1;
/**
 * How far round a solid a cell counts as blocked, metres — the wheel's own
 * half-width and the rider on it, less a little for the controller's wall
 * standoff, which pushes a wheel off a face it grazes. A gap narrower than
 * about twice this plus a cell is not a way through.
 */
export const NAV_CLEARANCE_METRES = 0.8;
/** How far past the lines the grid reaches, metres: the stray limit and the far side of a building. */
const NAV_MARGIN_METRES = 60;
/**
 * The tallest step the wheel mounts: `EucController`'s own `maxStepUp`
 * (`WHEEL.pedalHeight × TERRAIN.stepUpPedalFactor`) — the same threshold
 * `routeField.ts`'s blockers use.
 */
const NAV_STEP_METRES = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
/** A box whose underside is this far above the ground is overhead, not in the way, metres. */
const NAV_HEADROOM_METRES = 1.9;
/** Extra cost of a cell beside a blocked one, and of one two cells off, in cells of travel. */
const NAV_WALL_COST_NEAR = 6;
const NAV_WALL_COST_FAR = 2;
/** Extra cost of a cell over a spill or a shallow hole (a wobble), in tenths of a cell. */
const NAV_SOFT_HAZARD_COST = 20;
/** How far round a deep pothole is blocked beyond its own radius, metres. */
const NAV_DEEP_HOLE_MARGIN = 0.4;

/**
 * The grid: row-major, rows along +Z. `blocked` is 1 where the wheel may not
 * stand; `cost` is the extra cost of entering a cell, in tenths of a cell's
 * travel (so a path prefers the middle of a gap without refusing its edge).
 */
export interface NavGrid {
  readonly originX: number;
  readonly originZ: number;
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
  readonly cost: Uint8Array;
}

/** Terrain height from the heightfield alone (bilinear), metres — never a collider's top. */
function terrainHeight(field: Heightfield, x: number, z: number): number {
  const fx = (x - field.originX) / field.spacing;
  const fz = (z - field.originZ) / field.spacing;
  const cx = Math.min(field.columns - 2, Math.max(0, Math.floor(fx)));
  const cz = Math.min(field.rows - 2, Math.max(0, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - cx));
  const tz = Math.min(1, Math.max(0, fz - cz));
  const h = field.heights;
  const a = h[cz * field.columns + cx];
  const b = h[cz * field.columns + cx + 1];
  const c = h[(cz + 1) * field.columns + cx];
  const d = h[(cz + 1) * field.columns + cx + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/**
 * Does this box stand in a wheel's way? Taller than the wheel mounts above
 * the terrain on **every** side of it (a deck, a step or a kerb is level with
 * the ground somewhere and is ridden or hopped), and not overhead.
 */
function standsInTheWay(box: BoxCollider, field: Heightfield): boolean {
  const top = box.centre.y + box.halfExtents.y;
  const bottom = box.centre.y - box.halfExtents.y;
  const cos = Math.cos(box.rotationY);
  const sin = Math.sin(box.rotationY);
  let highest = -Infinity;
  let lowest = Infinity;
  for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const lx = ox * (box.halfExtents.x + 0.6);
    const lz = oz * (box.halfExtents.z + 0.6);
    const x = box.centre.x + lx * cos + lz * sin;
    const z = box.centre.z - lx * sin + lz * cos;
    const ground = terrainHeight(field, x, z);
    highest = Math.max(highest, ground);
    lowest = Math.min(lowest, ground);
  }
  if (top - highest < NAV_STEP_METRES) return false;
  return bottom < lowest + NAV_HEADROOM_METRES;
}

/**
 * Build a world's navigation grid — once, beside `buildRouteField`, never in
 * the step. `lines` are the roads a chase rides (the canonical spine and the
 * street rings): the grid covers them and `NAV_MARGIN_METRES` round them,
 * clamped to the heightfield.
 */
export function buildNavGrid(plan: LevelPlan, lines: readonly RouteSpine[]): NavGrid {
  const field = plan.heightfield;
  const sample: SpineSample = createSpineSample();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const line of lines) {
    for (let distance = 0; distance <= line.length; distance += 4) {
      line.sample(distance, sample);
      if (sample.x < minX) minX = sample.x;
      if (sample.x > maxX) maxX = sample.x;
      if (sample.z < minZ) minZ = sample.z;
      if (sample.z > maxZ) maxZ = sample.z;
    }
  }
  if (!Number.isFinite(minX)) {
    minX = plan.spawn.position.x;
    maxX = minX;
    minZ = plan.spawn.position.z;
    maxZ = minZ;
  }
  const fieldMaxX = field.originX + (field.columns - 1) * field.spacing;
  const fieldMaxZ = field.originZ + (field.rows - 1) * field.spacing;
  const cell = NAV_CELL_METRES;
  const originX = Math.max(field.originX, Math.floor(minX - NAV_MARGIN_METRES));
  const originZ = Math.max(field.originZ, Math.floor(minZ - NAV_MARGIN_METRES));
  const columns = Math.max(1, Math.ceil((Math.min(fieldMaxX, maxX + NAV_MARGIN_METRES) - originX) / cell));
  const rows = Math.max(1, Math.ceil((Math.min(fieldMaxZ, maxZ + NAV_MARGIN_METRES) - originZ) / cell));
  const blocked = new Uint8Array(columns * rows);
  const cost = new Uint8Array(columns * rows);

  /** Mark every cell whose centre lies inside the box grown by `grow`. */
  const stamp = (box: { centre: { x: number; z: number }; halfExtents: { x: number; z: number }; rotationY: number }, grow: number): void => {
    const cos = Math.cos(box.rotationY);
    const sin = Math.sin(box.rotationY);
    const hx = box.halfExtents.x + grow;
    const hz = box.halfExtents.z + grow;
    const spanX = Math.abs(cos) * hx + Math.abs(sin) * hz;
    const spanZ = Math.abs(sin) * hx + Math.abs(cos) * hz;
    const c0 = Math.max(0, Math.floor((box.centre.x - spanX - originX) / cell));
    const c1 = Math.min(columns - 1, Math.floor((box.centre.x + spanX - originX) / cell));
    const r0 = Math.max(0, Math.floor((box.centre.z - spanZ - originZ) / cell));
    const r1 = Math.min(rows - 1, Math.floor((box.centre.z + spanZ - originZ) / cell));
    for (let row = r0; row <= r1; row += 1) {
      const z = originZ + (row + 0.5) * cell - box.centre.z;
      for (let column = c0; column <= c1; column += 1) {
        const x = originX + (column + 0.5) * cell - box.centre.x;
        // World → box: the transpose of the box's yaw (the sampler's convention).
        const lx = x * cos - z * sin;
        const lz = x * sin + z * cos;
        if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) blocked[row * columns + column] = 1;
      }
    }
  };

  const solids: BoxCollider[] = [
    ...plan.segments.flatMap((segment) => segment.colliders),
    ...(plan.solids ?? []),
  ];
  for (const box of solids) {
    if (standsInTheWay(box, field)) stamp(box, NAV_CLEARANCE_METRES);
  }
  for (const hazard of plan.hazards ?? []) {
    if (hazard.kind === 'potholeDeep') {
      const radius = hazard.radius + NAV_DEEP_HOLE_MARGIN;
      stamp({ centre: hazard.centre, halfExtents: { x: radius, z: radius }, rotationY: 0 }, 0);
      continue;
    }
    const r = hazard.radius;
    const c0 = Math.max(0, Math.floor((hazard.centre.x - r - originX) / cell));
    const c1 = Math.min(columns - 1, Math.floor((hazard.centre.x + r - originX) / cell));
    const r0 = Math.max(0, Math.floor((hazard.centre.z - r - originZ) / cell));
    const r1 = Math.min(rows - 1, Math.floor((hazard.centre.z + r - originZ) / cell));
    for (let row = r0; row <= r1; row += 1) {
      for (let column = c0; column <= c1; column += 1) {
        const index = row * columns + column;
        cost[index] = Math.min(255, cost[index] + NAV_SOFT_HAZARD_COST);
      }
    }
  }

  // The cells hugging a wall cost more, so a path takes the middle of a gap:
  // the Chebyshev distance to the nearest blocked cell (a two-pass transform,
  // capped at 3), one and two cells out.
  const near = new Uint8Array(columns * rows).fill(3);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (blocked[index] === 1) {
        near[index] = 0;
        continue;
      }
      let best = near[index];
      if (column > 0) best = Math.min(best, near[index - 1] + 1);
      if (row > 0) {
        const up = index - columns;
        best = Math.min(best, near[up] + 1);
        if (column > 0) best = Math.min(best, near[up - 1] + 1);
        if (column < columns - 1) best = Math.min(best, near[up + 1] + 1);
      }
      near[index] = best;
    }
  }
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      const index = row * columns + column;
      let best = near[index];
      if (best === 0) continue;
      if (column < columns - 1) best = Math.min(best, near[index + 1] + 1);
      if (row < rows - 1) {
        const down = index + columns;
        best = Math.min(best, near[down] + 1);
        if (column < columns - 1) best = Math.min(best, near[down + 1] + 1);
        if (column > 0) best = Math.min(best, near[down - 1] + 1);
      }
      near[index] = best;
      const extra = best === 1 ? NAV_WALL_COST_NEAR * 10 : best === 2 ? NAV_WALL_COST_FAR * 10 : 0;
      if (extra > 0) cost[index] = Math.min(255, cost[index] + extra);
    }
  }

  return Object.freeze({ originX, originZ, cell, columns, rows, blocked, cost });
}

/**
 * Whether a world point's cell hugs a solid — one cell from a blocked one
 * (the near-wall cost), or blocked itself. The brain rides past such a cell
 * at a pace that does not clip the thing beside it.
 */
export function navBesideWall(grid: NavGrid, x: number, z: number): boolean {
  const column = Math.floor((x - grid.originX) / grid.cell);
  const row = Math.floor((z - grid.originZ) / grid.cell);
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return false;
  const index = row * grid.columns + column;
  return grid.blocked[index] === 1 || grid.cost[index] >= NAV_WALL_COST_NEAR * 10;
}

/** Whether a world point is on the grid and not blocked. */
export function navFree(grid: NavGrid, x: number, z: number): boolean {
  const column = Math.floor((x - grid.originX) / grid.cell);
  const row = Math.floor((z - grid.originZ) / grid.cell);
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return false;
  return grid.blocked[row * grid.columns + column] === 0;
}

/**
 * Is the straight line between two world points clear of blocked cells?
 * Walk every crossed cell, including both sides of an exact corner crossing.
 * Point sampling can miss a short clip through a blocked corner. Off the grid
 * is not clear. `skipMetres` of the start are not
 * asked: a wheel pressed within its own room of a wall stands in a blocked
 * cell and can still see past it.
 */
export function navLineClear(
  grid: NavGrid,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  skipMetres = 0,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  if (skipMetres > length) return true;
  const start = length > 0 ? Math.max(0, skipMetres) / length : 0;
  const x = (ax + dx * start - grid.originX) / grid.cell;
  const z = (az + dz * start - grid.originZ) / grid.cell;
  const endX = (bx - grid.originX) / grid.cell;
  const endZ = (bz - grid.originZ) / grid.cell;
  let column = Math.floor(x);
  let row = Math.floor(z);
  const lastColumn = Math.floor(endX);
  const lastRow = Math.floor(endZ);
  const sx = Math.sign(endX - x);
  const sz = Math.sign(endZ - z);
  const stepX = sx === 0 ? Infinity : 1 / Math.abs(endX - x);
  const stepZ = sz === 0 ? Infinity : 1 / Math.abs(endZ - z);
  let nextX = sx === 0 ? Infinity : (sx > 0 ? column + 1 - x : x - column) * stepX;
  let nextZ = sz === 0 ? Infinity : (sz > 0 ? row + 1 - z : z - row) * stepZ;
  const free = (c: number, r: number): boolean => c >= 0 && r >= 0
    && c < grid.columns && r < grid.rows && grid.blocked[r * grid.columns + c] === 0;
  for (;;) {
    if (!free(column, row)) return false;
    if (column === lastColumn && row === lastRow) return true;
    if (Math.abs(nextX - nextZ) < 1e-12) {
      if (!free(column + sx, row) || !free(column, row + sz)) return false;
      column += sx;
      row += sz;
      nextX += stepX;
      nextZ += stepZ;
    } else if (nextX < nextZ) {
      column += sx;
      nextX += stepX;
    } else {
      row += sz;
      nextZ += stepZ;
    }
  }
}

/** The planner's window, cells a side: the search never leaves it. */
export const NAV_WINDOW_CELLS = 128;
/** The most cells one search may expand. A plaza or a block is a few hundred; a maze is refused. */
export const NAV_MAX_EXPANSIONS = 5000;
/** The most corners a path keeps after the string pull. */
export const NAV_MAX_WAYPOINTS = 48;
/** The furthest along the trail one corner of the string pull looks, cells. */
const NAV_PULL_REACH_CELLS = 48;
/** How far a start or goal inside a blocked cell may be moved to a free one, cells. */
const NAV_SNAP_CELLS = 3;
const SQRT2 = Math.SQRT2;

/**
 * One brain's A* over a window of the shared grid. Its scratch is its own and
 * is allocated once, lazily; a search allocates nothing. `plan` answers
 * whether a path was found and leaves its corners in `pathX`/`pathZ`, start
 * first (the start itself is corner 0), goal last.
 */
export class NavPlanner {
  readonly pathX = new Float64Array(NAV_MAX_WAYPOINTS);
  readonly pathZ = new Float64Array(NAV_MAX_WAYPOINTS);
  /** Corners in the last path found; 0 for none. */
  pathLength = 0;
  /** The last path's length along its corners, metres. */
  pathMetres = 0;
  /** Cells the last search expanded (diagnostics and the bench's cost rows). */
  expanded = 0;
  private readonly grid: NavGrid;
  private readonly size = NAV_WINDOW_CELLS;
  private readonly g = new Float32Array(NAV_WINDOW_CELLS * NAV_WINDOW_CELLS);
  private readonly parent = new Int32Array(NAV_WINDOW_CELLS * NAV_WINDOW_CELLS);
  private readonly seen = new Uint32Array(NAV_WINDOW_CELLS * NAV_WINDOW_CELLS);
  private readonly closed = new Uint32Array(NAV_WINDOW_CELLS * NAV_WINDOW_CELLS);
  private readonly heap = new Int32Array(NAV_WINDOW_CELLS * NAV_WINDOW_CELLS);
  private readonly heapKey = new Float32Array(NAV_WINDOW_CELLS * NAV_WINDOW_CELLS);
  /** The window's cells on the path, goal first, before the string pull. */
  private readonly trail = new Int32Array(NAV_WINDOW_CELLS * 32);
  private heapSize = 0;
  private stampValue = 0;
  private windowColumn = 0;
  private windowRow = 0;
  // -- The search under way (`start` … `advance`) -----------------------------
  private searchLive = false;
  private searchStart = -1;
  private searchGoal = -1;
  private goalColumn = 0;
  private goalRow = 0;
  private startX = 0;
  private startZ = 0;
  private goalX = 0;
  private goalZ = 0;
  private repelX: ArrayLike<number> | null = null;
  private repelZ: ArrayLike<number> | null = null;
  private repelCount = 0;
  private repelSquared = 0;
  private repelCost = 0;

  constructor(grid: NavGrid) {
    this.grid = grid;
  }

  /**
   * Plan from (sx, sz) to (gx, gz) in one call — `start` and then `advance`
   * to the end (`NAV_MAX_EXPANSIONS`). Answers whether a path was found; on
   * a failure the path is cleared. The brain uses `start`/`advance` so no
   * one step pays for a long search.
   */
  plan(
    sx: number,
    sz: number,
    gx: number,
    gz: number,
    repelX: ArrayLike<number> | null = null,
    repelZ: ArrayLike<number> | null = null,
    repelCount = 0,
    repelMetres = 0,
    repelCost = 0,
  ): boolean {
    const found = this.start(sx, sz, gx, gz, repelX, repelZ, repelCount, repelMetres, repelCost)
      && this.advance(Infinity) === 1;
    if (!found) {
      this.pathLength = 0;
      this.pathMetres = 0;
    }
    return found;
  }

  /** Whether a search is under way (`start` answered true and `advance` has not finished it). */
  get searching(): boolean {
    return this.searchLive;
  }

  /**
   * Begin a search from (sx, sz) to (gx, gz). `repel` are points whose
   * surroundings cost extra (a packmate already on his way to the same
   * quarry, so this one comes round the other side): `repelCount` of them,
   * `repelMetres` round each, at `repelCost` tenths of a cell per cell; the
   * arrays are read while the search runs, so the caller leaves them alone
   * until it finishes. The last path found is kept until this search
   * finishes. Answers false (and starts nothing) when either end is off the
   * grid, outside the window, or walled in.
   */
  start(
    sx: number,
    sz: number,
    gx: number,
    gz: number,
    repelX: ArrayLike<number> | null = null,
    repelZ: ArrayLike<number> | null = null,
    repelCount = 0,
    repelMetres = 0,
    repelCost = 0,
  ): boolean {
    const grid = this.grid;
    const size = this.size;
    this.searchLive = false;
    this.expanded = 0;
    const cell = grid.cell;
    const midColumn = Math.floor(((sx + gx) / 2 - grid.originX) / cell);
    const midRow = Math.floor(((sz + gz) / 2 - grid.originZ) / cell);
    this.windowColumn = midColumn - (size >> 1);
    this.windowRow = midRow - (size >> 1);
    const startCell = this.snap(sx, sz);
    const goalCell = this.snap(gx, gz);
    if (startCell < 0 || goalCell < 0) return false;

    this.stampValue += 1;
    if (this.stampValue >= 0xffffffff) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.stampValue = 1;
    }
    this.searchStart = startCell;
    this.searchGoal = goalCell;
    this.goalColumn = goalCell % size;
    this.goalRow = (goalCell / size) | 0;
    this.startX = sx;
    this.startZ = sz;
    this.goalX = gx;
    this.goalZ = gz;
    this.repelX = repelX;
    this.repelZ = repelZ;
    this.repelCount = repelX === null || repelZ === null ? 0 : repelCount;
    this.repelSquared = repelMetres * repelMetres;
    this.repelCost = repelCost;
    this.heapSize = 0;
    this.g[startCell] = 0;
    this.parent[startCell] = -1;
    this.seen[startCell] = this.stampValue;
    this.push(startCell, this.heuristic(startCell));
    this.searchLive = true;
    return true;
  }

  /**
   * Run the search on for at most `budget` expansions. Answers 1 when it has
   * found the goal (the path is written, start first, goal last), 0 while it
   * is still under way, and −1 when it has failed (the open set ran dry, or
   * `NAV_MAX_EXPANSIONS` in all) — or when no search is under way.
   */
  advance(budget: number): -1 | 0 | 1 {
    if (!this.searchLive) return -1;
    const grid = this.grid;
    const size = this.size;
    const cell = grid.cell;
    const stampValue = this.stampValue;
    const goal = this.searchGoal;
    const repelCount = this.repelCount;
    let spent = 0;
    while (this.heapSize > 0) {
      if (spent >= budget) return 0;
      const current = this.pop();
      if (this.closed[current] === stampValue) continue;
      this.closed[current] = stampValue;
      if (current === goal) {
        this.searchLive = false;
        this.pull();
        return 1;
      }
      this.expanded += 1;
      spent += 1;
      if (this.expanded > NAV_MAX_EXPANSIONS) break;
      const column = current % size;
      const row = (current / size) | 0;
      const base = this.g[current];
      for (let dz = -1; dz <= 1; dz += 1) {
        const r = row + dz;
        if (r < 0 || r >= size) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dz === 0) continue;
          const c = column + dx;
          if (c < 0 || c >= size) continue;
          const gridIndex = this.gridIndex(c, r);
          if (gridIndex < 0 || grid.blocked[gridIndex] === 1) continue;
          const diagonal = dx !== 0 && dz !== 0;
          // No corner cutting: a diagonal needs both of its sides free.
          if (diagonal) {
            const sideA = this.gridIndex(column + dx, row);
            const sideB = this.gridIndex(column, row + dz);
            if (sideA < 0 || sideB < 0 || grid.blocked[sideA] === 1 || grid.blocked[sideB] === 1) continue;
          }
          const next = r * size + c;
          if (this.closed[next] === stampValue) continue;
          let step = (diagonal ? SQRT2 : 1) + grid.cost[gridIndex] * 0.1;
          if (repelCount > 0) {
            const wx = grid.originX + (this.windowColumn + c + 0.5) * cell;
            const wz = grid.originZ + (this.windowRow + r + 0.5) * cell;
            for (let k = 0; k < repelCount; k += 1) {
              const ox = wx - this.repelX![k];
              const oz = wz - this.repelZ![k];
              if (ox * ox + oz * oz <= this.repelSquared) step += this.repelCost * 0.1;
            }
          }
          const tentative = base + step;
          if (this.seen[next] === stampValue && tentative >= this.g[next]) continue;
          this.seen[next] = stampValue;
          this.g[next] = tentative;
          this.parent[next] = current;
          this.push(next, tentative + this.heuristic(next));
        }
      }
    }
    this.searchLive = false;
    return -1;
  }

  /** Octile distance to the goal cell, in cells. */
  private heuristic(index: number): number {
    const size = this.size;
    const dx = Math.abs((index % size) - this.goalColumn);
    const dz = Math.abs(((index / size) | 0) - this.goalRow);
    return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
  }

  private cellX(index: number): number {
    return this.grid.originX + (this.windowColumn + (index % this.size) + 0.5) * this.grid.cell;
  }

  private cellZ(index: number): number {
    return this.grid.originZ + (this.windowRow + ((index / this.size) | 0) + 0.5) * this.grid.cell;
  }

  /** Walk the found cells back goal → start, then string-pull start → goal into the path. */
  private pull(): void {
    const grid = this.grid;
    const start = this.searchStart;
    const gx = this.goalX;
    const gz = this.goalZ;
    let count = 0;
    for (let at = this.searchGoal; at >= 0 && count < this.trail.length; at = this.parent[at]) {
      this.trail[count] = at;
      count += 1;
      if (at === start) break;
    }
    // Corner 0 is where he actually is; the last is where the quarry actually is.
    let ax = this.startX;
    let az = this.startZ;
    this.pathX[0] = ax;
    this.pathZ[0] = az;
    this.pathMetres = 0;
    let corners = 1;
    let from = count - 1;
    while (from > 0 && corners < NAV_MAX_WAYPOINTS - 1) {
      // The furthest cell along the trail still in sight of the anchor.
      let reach = from - 1;
      for (let probe = from - 1; probe >= Math.max(0, from - NAV_PULL_REACH_CELLS); probe -= 1) {
        const px = probe === 0 ? gx : this.cellX(this.trail[probe]);
        const pz = probe === 0 ? gz : this.cellZ(this.trail[probe]);
        if (!navLineClear(grid, ax, az, px, pz)) break;
        reach = probe;
      }
      const px = reach === 0 ? gx : this.cellX(this.trail[reach]);
      const pz = reach === 0 ? gz : this.cellZ(this.trail[reach]);
      this.pathMetres += Math.hypot(px - ax, pz - az);
      this.pathX[corners] = px;
      this.pathZ[corners] = pz;
      corners += 1;
      ax = px;
      az = pz;
      from = reach;
    }
    if (from > 0) {
      this.pathMetres += Math.hypot(gx - ax, gz - az);
      this.pathX[corners] = gx;
      this.pathZ[corners] = gz;
      corners += 1;
    }
    this.pathLength = corners;
  }

  /** The window index of the free cell at (or nearest, within a few cells) a world point; −1 for none. */
  private snap(x: number, z: number): number {
    const grid = this.grid;
    const size = this.size;
    const column = Math.floor((x - grid.originX) / grid.cell) - this.windowColumn;
    const row = Math.floor((z - grid.originZ) / grid.cell) - this.windowRow;
    let best = -1;
    let bestDistance = Infinity;
    for (let radius = 0; radius <= NAV_SNAP_CELLS && best < 0; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          const c = column + dx;
          const r = row + dz;
          if (c < 0 || r < 0 || c >= size || r >= size) continue;
          const index = this.gridIndex(c, r);
          if (index < 0 || grid.blocked[index] === 1) continue;
          const distance = dx * dx + dz * dz;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = r * size + c;
          }
        }
      }
    }
    return best;
  }

  /** The grid's own index of a window cell, −1 off the grid. */
  private gridIndex(windowColumn: number, windowRow: number): number {
    const grid = this.grid;
    const column = this.windowColumn + windowColumn;
    const row = this.windowRow + windowRow;
    if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return -1;
    return row * grid.columns + column;
  }

  private push(index: number, key: number): void {
    // Lazy deletion leaves duplicates in the heap; a full heap drops the push
    // (the search then answers on what it has, or fails), never grows.
    if (this.heapSize >= this.heap.length) return;
    let at = this.heapSize;
    this.heapSize += 1;
    const heap = this.heap;
    const keys = this.heapKey;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (keys[parent] <= key) break;
      heap[at] = heap[parent];
      keys[at] = keys[parent];
      at = parent;
    }
    heap[at] = index;
    keys[at] = key;
  }

  private pop(): number {
    const heap = this.heap;
    const keys = this.heapKey;
    const top = heap[0];
    this.heapSize -= 1;
    const size = this.heapSize;
    if (size === 0) return top;
    const lastIndex = heap[size];
    const lastKey = keys[size];
    let at = 0;
    for (;;) {
      const left = at * 2 + 1;
      if (left >= size) break;
      const right = left + 1;
      const child = right < size && keys[right] < keys[left] ? right : left;
      if (keys[child] >= lastKey) break;
      heap[at] = heap[child];
      keys[at] = keys[child];
      at = child;
    }
    heap[at] = lastIndex;
    keys[at] = lastKey;
    return top;
  }
}
