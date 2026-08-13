/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { BoxCollider, Heightfield, LevelPlan, Surround } from '../level/plan.ts';
import type { GroundSample, ObstacleHit, SurfaceId, TerrainSampler, Vec3 } from './world.ts';

/**
 * A `TerrainSampler` built from a `LevelPlan`.
 *
 * Architecture invariant 3: simulation reaches the world only through this
 * interface, and the renderer answers no gameplay question. Invariant 2 puts
 * both downstream of the same plan — and at M4 that finally has teeth, because
 * the renderer's own copy of the ground is gone. The heightfield read below and
 * the mesh in `render/terrain.ts` are two readings of one array.
 *
 * **The two readings agree to the millimetre, and that took a decision.** A
 * heightfield cell is a quadrilateral whose four corner heights generally do
 * not lie in a plane, so "the height at a point inside it" has two reasonable
 * answers: bilinear interpolation, or the plane of whichever triangle the mesh
 * split it into. Bilinear is marginally smoother and disagrees with the drawn
 * surface everywhere except at the corners — the "rendered and collision
 * geometry need one owner" trap (master §5.4), whose symptom is a wheel that
 * floats a centimetre on one diagonal and sinks on the other. This samples the
 * triangle, split along the same diagonal the renderer uses, and returns that
 * triangle's exact plane normal. Faceting on a curved hill is a *presentation*
 * problem, and `EucController` smooths the rendered tilt without touching the
 * force.
 *
 * Nothing in this file may import three.js (invariant 1). That restriction is
 * what lets the whole controller — and this sampler with it — be tested under
 * `node --test` with no browser at all.
 */

/** A collider with its yaw pre-resolved into a cosine and a sine. */
interface PreparedCollider {
  readonly collider: BoxCollider;
  readonly cos: number;
  readonly sin: number;
  /** World-space XZ bounds, for the broadphase below. */
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Does a chase camera behind this lose the rider? See `BoxCollider`. */
  readonly occludes: boolean;
}

/**
 * The broadphase — M8.6, and the change that made solid dressing affordable.
 *
 * **Every query used to walk every collider.** That was the right shape for 95
 * authored blocks and it is the reason `level/plan.ts` spent three years'
 * worth of comment explaining why props could never be solid: the ground probe
 * runs twice per step at 120 Hz and the wheel-clearance ray up to three times
 * more, so per-query cost multiplied by 600 colliders was a real fraction of
 * the frame, spent almost entirely on boxes hundreds of metres away.
 *
 * A uniform grid over XZ replaces it. Colliders are bucketed once at
 * construction into a compressed-row layout — one `starts` array of offsets and
 * one flat `items` array — so a query touches one contiguous run of integers
 * per cell and allocates nothing. A ground probe reads a single cell; a ray
 * reads the cells its own bounding box covers, which for the longest arm the
 * camera asks about is four of them.
 *
 * The result is that per-query cost tracks *local* density rather than the
 * level's total, and adding dressing to the far side of the map costs the step
 * exactly nothing. The slice went from 95 colliders walked per probe to a
 * typical two or three, out of 633.
 *
 * A DDA march would visit fewer cells than the bounding box does on a long
 * diagonal ray. It is not worth the code here: every ray this sampler is asked
 * for is short — half a metre for wheel clearance, the camera arm for
 * obstruction — and a bounding box over four cells cannot be meaningfully
 * beaten while being much harder to get wrong.
 */
const GRID_TARGET_CELL = 8;
/**
 * Cap on the grid's own dimensions.
 *
 * The cell size grows to fit rather than the array growing without bound. M12's
 * generator decides how large a world is and this file does not get a say, so
 * "8 m cells" is a target and this is the actual guarantee: at most 65,536
 * cells, whatever anybody generates.
 */
const GRID_MAX_SPAN = 256;

/**
 * How far apart consecutive samples are while marching a ray over terrain, as
 * a fraction of the heightfield's spacing, and how many bisections refine the
 * crossing once one is found.
 *
 * Half a cell cannot step over a ridge in a one-metre field, and eight
 * bisections resolve the hit to under a millimetre across the longest arm the
 * camera ever asks about. The iteration cap is a runaway guard, not a range
 * limit: `Math.max` and `Math.floor` are not input validation, and a
 * `maxDistance` of `Infinity` reaching an unbounded loop is exactly the class
 * of bug that froze the tab once already (`docs/LESSONS_LEARNED.md`).
 */
const MARCH_FRACTION = 0.5;
const MARCH_REFINEMENTS = 8;
const MARCH_MAX_STEPS = 512;

export class PlanTerrainSampler implements TerrainSampler {
  private readonly colliders: readonly PreparedCollider[];
  private readonly field: Heightfield;
  private readonly surround: Surround;

  /** Precomputed field extent, so the bounds test is two comparisons. */
  private readonly maxX: number;
  private readonly maxZ: number;

  // -- The collider grid ----------------------------------------------------
  private readonly gridOriginX: number;
  private readonly gridOriginZ: number;
  private readonly gridCell: number;
  private readonly gridColumns: number;
  private readonly gridRows: number;
  /** Compressed rows: `items[starts[c] .. starts[c + 1])` is cell `c`. */
  private readonly gridStarts: Int32Array;
  private readonly gridItems: Int32Array;
  /**
   * Per-collider query stamp, so a ray that gathers several cells tests each
   * collider once without allocating a Set or clearing an array.
   */
  private readonly stamps: Int32Array;
  private stamp = 0;

  /**
   * One flat array of colliders is built once at construction.
   *
   * Walking `plan.segments[].colliders[]` per query would put a nested loop and
   * two property lookups inside the 120 Hz step for no benefit; the plan is
   * immutable once emitted, by a hand-authored producer today and by a
   * generator at M12. The yaw is resolved here for the same reason — a
   * `Math.cos` per collider per query is thirty transcendentals a step on the
   * proving ground, to recompute a constant.
   *
   * **`plan.solids` is read on exactly the same terms as a segment's blocks**
   * (M8.6). A wall is a wall: the sampler is told what is solid and does not
   * care whether a level author drew it or the prop kit derived it from a tree.
   */
  constructor(plan: LevelPlan) {
    this.colliders = [
      ...plan.segments.flatMap((segment) => segment.colliders),
      ...(plan.solids ?? []),
    ].map((collider) => {
      const cos = Math.cos(collider.rotationY);
      const sin = Math.sin(collider.rotationY);
      // The box's own frame maps to the world by the transpose of the inverse
      // used below, so a half extent of (hx, hz) reaches this far on each world
      // axis. Absolute values because the extent is the same in both
      // directions whatever quadrant the yaw is in.
      const spanX = Math.abs(cos) * collider.halfExtents.x
        + Math.abs(sin) * collider.halfExtents.z;
      const spanZ = Math.abs(sin) * collider.halfExtents.x
        + Math.abs(cos) * collider.halfExtents.z;
      return {
        collider,
        cos,
        sin,
        minX: collider.centre.x - spanX,
        maxX: collider.centre.x + spanX,
        minZ: collider.centre.z - spanZ,
        maxZ: collider.centre.z + spanZ,
        occludes: collider.occludes !== false,
      };
    });
    this.field = plan.heightfield;
    this.surround = plan.surround;
    this.maxX = this.field.originX + (this.field.columns - 1) * this.field.spacing;
    this.maxZ = this.field.originZ + (this.field.rows - 1) * this.field.spacing;

    // -- Bucket every collider, once ----------------------------------------
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const prepared of this.colliders) {
      if (prepared.minX < minX) minX = prepared.minX;
      if (prepared.maxX > maxX) maxX = prepared.maxX;
      if (prepared.minZ < minZ) minZ = prepared.minZ;
      if (prepared.maxZ > maxZ) maxZ = prepared.maxZ;
    }
    // An empty plan still needs a grid a query can index into without a branch
    // on every read. One cell containing nothing answers every query correctly.
    if (this.colliders.length === 0) {
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

    // Counting sort into compressed rows: count, prefix-sum, scatter. Two
    // passes over the colliders and no intermediate arrays of arrays.
    const cells = this.gridColumns * this.gridRows;
    const counts = new Int32Array(cells);
    let total = 0;
    for (const prepared of this.colliders) {
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
    for (let index = 0; index < this.colliders.length; index += 1) {
      this.eachCell(this.colliders[index], (cell) => {
        this.gridItems[cursor[cell]] = index;
        cursor[cell] += 1;
      });
    }
    this.stamps = new Int32Array(this.colliders.length);
  }

  /** How many colliders back this sampler. For diagnostics and tests. */
  get colliderCount(): number {
    return this.colliders.length;
  }

  sampleGround(x: number, z: number, out: GroundSample): GroundSample {
    this.sampleField(x, z, out);

    // Anything solid standing on the terrain wins if its top face is higher.
    // Every collider is upright, so its top face is level and its normal is up
    // whatever its yaw — which is the whole reason a kerb is a collider rather
    // than heightfield detail: the step has to be a genuine vertical face.
    //
    // Only the colliders in this point's own grid cell are candidates, which is
    // where the 120 Hz ground probe stopped caring how large the level is.
    const cell = this.cellAt(x, z);
    const end = this.gridStarts[cell + 1];
    for (let slot = this.gridStarts[cell]; slot < end; slot += 1) {
      const { collider, cos, sin } = this.colliders[this.gridItems[slot]];
      const dx = x - collider.centre.x;
      const dz = z - collider.centre.z;
      // Into the box's own frame. A yaw of h maps local +Z onto the world
      // heading and local +X onto the rider's left (see `level/segments.ts`),
      // so the inverse is the transpose below.
      const localX = cos * dx - sin * dz;
      const localZ = sin * dx + cos * dz;
      if (Math.abs(localX) > collider.halfExtents.x) continue;
      if (Math.abs(localZ) > collider.halfExtents.z) continue;

      const top = collider.centre.y + collider.halfExtents.y;
      if (top <= out.height) continue;

      out.height = top;
      out.surface = collider.surface;
      out.normal.x = 0;
      out.normal.y = 1;
      out.normal.z = 0;
      out.offCourse = false;
    }

    return out;
  }

  /**
   * Visit every grid cell a collider's bounds touch. Returns how many.
   *
   * Called twice at construction and never again. A collider spanning several
   * cells is listed in all of them, which is what makes a single-cell lookup a
   * complete answer for a point query.
   */
  private eachCell(prepared: PreparedCollider, visit: (cell: number) => void): number {
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
   * Clamping rather than rejecting is correct and not a shortcut: the grid's
   * bounds are the union of every collider's bounds, so a point outside them is
   * outside every collider. It lands in a border cell, whose colliders then
   * fail the exact test they were always going to fail.
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

  /**
   * Nearest intersection along a ray, or null.
   *
   * Boxes are solved exactly with the standard slab test; terrain is marched,
   * because a heightfield has no closed form and the alternative — testing
   * every triangle the ray's footprint crosses — is more code for an answer
   * that is not more correct at half-cell steps.
   *
   * A ray whose origin is already inside geometry, or already below the
   * terrain, reports distance 0 rather than the far face: a feeler that has
   * been swallowed has found something, and reporting the exit point would tell
   * the caller the obstruction is ahead of them rather than around them.
   */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number): number | null {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0 || !(maxDistance > 0) || !Number.isFinite(maxDistance)) return null;

    const dx = direction.x / length;
    const dy = direction.y / length;
    const dz = direction.z / length;

    let nearest = this.raycastTerrain(origin, dx, dy, dz, maxDistance);
    // **Occluders only** (M8.6). This ray exists for the chase camera, and the
    // camera's job is to keep the rider in shot rather than to avoid touching
    // scenery. A lamp post is narrower than the rider and crosses the ray for a
    // handful of frames; obeying it would slam the arm in at its 0.05 s attack
    // and crawl it back out over 0.55 s, over and over down a lamp-lined
    // avenue, for an occlusion the player never had. Every authored block still
    // occludes — `occludes` defaults true and only derived dressing sets it
    // false — so the M4 gateway pull-in the obstruction was tuned against is
    // untouched. Nothing here changes what stops a wheel; see `raycastObstacle`.
    const obstacle = this.raycastPreparedBoxes(origin, dx, dy, dz, maxDistance, true);
    if (obstacle !== null && (nearest === null || obstacle < nearest)) nearest = obstacle;
    return nearest;
  }

  /**
   * Exact box-only cast for physical machine clearance around authored props.
   *
   * With no width this is the old ray. A positive `sweepHalfWidth` turns it
   * into a sideways line-segment cast for post-sized boxes: the exact
   * Minkowski expansion of that oriented box by the machine's cross-track
   * envelope. Broad walls and route-edge structures keep the centre-ray
   * behaviour their slide resolver and authored clearances were built around.
   * This still keeps one grid query and one slab test per candidate while
   * allowing a pedal to meet a narrow post even when the tyre centreline
   * passes beside it.
   */
  raycastObstacle(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    sweepHalfWidth = 0,
    sweepLateral?: Vec3,
    out?: ObstacleHit,
  ): number | null {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0 || !(maxDistance > 0) || !Number.isFinite(maxDistance)) return null;
    const width = Number.isFinite(sweepHalfWidth) && sweepHalfWidth > 0
      ? sweepHalfWidth
      : 0;
    const dx = direction.x / length;
    const dy = direction.y / length;
    const dz = direction.z / length;
    const horizontal = Math.hypot(dx, dz);
    const suppliedLateralLength = sweepLateral === undefined
      ? 0
      : Math.hypot(sweepLateral.x, sweepLateral.z);
    const lateralX = suppliedLateralLength > 0
      ? sweepLateral!.x / suppliedLateralLength
      : horizontal > 0 ? -dz / horizontal : 0;
    const lateralZ = suppliedLateralLength > 0
      ? sweepLateral!.z / suppliedLateralLength
      : horizontal > 0 ? dx / horizontal : 0;
    return this.raycastPreparedBoxes(
      origin,
      dx,
      dy,
      dz,
      maxDistance,
      // Everything solid, because this one is the wheel meeting the world.
      false,
      width,
      lateralX,
      lateralZ,
      out,
    );
  }

  /**
   * Nearest box along a ray, gathered through the grid.
   *
   * The ray's own XZ bounding box picks the candidate cells and the stamp array
   * keeps a collider listed in several of them from being tested twice. Exact
   * slab tests then run on what survives — the broadphase narrows the set and
   * decides nothing.
   */
  private raycastPreparedBoxes(
    origin: Vec3,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
    occludersOnly: boolean,
    sweepHalfWidth = 0,
    suppliedLateralX?: number,
    suppliedLateralZ?: number,
    out?: ObstacleHit,
  ): number | null {
    const endX = origin.x + dx * maxDistance;
    const endZ = origin.z + dz * maxDistance;
    // The broadphase has to gather boxes touched by the swept width as well as
    // by the centre ray. Expanding by the full half-width is conservative by
    // at most one adjacent cell and cannot change the exact answer below.
    const fromColumn = this.columnAt(Math.min(origin.x, endX) - sweepHalfWidth);
    const toColumn = this.columnAt(Math.max(origin.x, endX) + sweepHalfWidth);
    const fromRow = this.rowAt(Math.min(origin.z, endZ) - sweepHalfWidth);
    const toRow = this.rowAt(Math.max(origin.z, endZ) + sweepHalfWidth);

    const horizontal = Math.hypot(dx, dz);
    const lateralX = suppliedLateralX ?? (horizontal > 0 ? -dz / horizontal : 0);
    const lateralZ = suppliedLateralZ ?? (horizontal > 0 ? dx / horizontal : 0);

    this.stamp += 1;
    const stamp = this.stamp;
    let nearest: number | null = null;
    for (let row = fromRow; row <= toRow; row += 1) {
      const rowBase = row * this.gridColumns;
      for (let column = fromColumn; column <= toColumn; column += 1) {
        const cell = rowBase + column;
        const end = this.gridStarts[cell + 1];
        for (let slot = this.gridStarts[cell]; slot < end; slot += 1) {
          const index = this.gridItems[slot];
          if (this.stamps[index] === stamp) continue;
          this.stamps[index] = stamp;
          const prepared = this.colliders[index];
          if (occludersOnly && !prepared.occludes) continue;
          // The widened query exists for pole-like colliders whose entire
          // footprint can hide beside the tyre. Applying it to a long fence or
          // wall changes the established navigation corridor by a pedal width
          // and makes the axis-slide resolver fight authored route edges. A
          // box that is no wider than the envelope in both local horizontal
          // axes is point-like; everything else keeps the centre-ray contract.
          const effectiveSweep = prepared.collider.halfExtents.x <= sweepHalfWidth
            && prepared.collider.halfExtents.z <= sweepHalfWidth
            ? sweepHalfWidth
            : 0;
          const hit = intersectBox(
            origin,
            dx,
            dy,
            dz,
            prepared,
            maxDistance,
            lateralX,
            lateralZ,
            effectiveSweep,
          );
          if (hit !== null && (nearest === null || hit < nearest)) {
            nearest = hit;
            if (out !== undefined) {
              out.distance = hit;
              out.halfExtentX = prepared.collider.halfExtents.x;
              out.halfExtentZ = prepared.collider.halfExtents.z;
            }
          }
        }
      }
    }
    return nearest;
  }

  /**
   * Terrain height, surface, and plane normal at a point, written into `out`.
   *
   * Off the field this is the surround, which is real ground rather than a
   * fallback — the M2 sampler's `fallbackHeight` hack is gone, and with it the
   * idea that leaving the level is an error state.
   */
  private sampleField(x: number, z: number, out: GroundSample): void {
    const field = this.field;

    if (x < field.originX || x > this.maxX || z < field.originZ || z > this.maxZ) {
      out.height = this.surround.height;
      out.surface = this.surround.surface;
      out.normal.x = 0;
      out.normal.y = 1;
      out.normal.z = 0;
      out.offCourse = true;
      return;
    }

    const fx = (x - field.originX) / field.spacing;
    const fz = (z - field.originZ) / field.spacing;
    // Clamped so a point exactly on the far edge lands in the last cell rather
    // than one past it.
    const column = Math.min(field.columns - 2, Math.max(0, Math.floor(fx)));
    const row = Math.min(field.rows - 2, Math.max(0, Math.floor(fz)));
    const u = fx - column;
    const v = fz - row;

    const base = row * field.columns + column;
    const h00 = field.heights[base];
    const h10 = field.heights[base + 1];
    const h01 = field.heights[base + field.columns];
    const h11 = field.heights[base + field.columns + 1];

    // Split along the (0,0)-(1,1) diagonal, which is the diagonal
    // `render/terrain.ts` emits. Below it (v < u) the triangle is
    // (h00, h10, h11); above it, (h00, h01, h11).
    let dhdu: number;
    let dhdv: number;
    let height: number;
    if (v < u) {
      dhdu = h10 - h00;
      dhdv = h11 - h10;
      height = h00 + dhdu * u + dhdv * v;
    } else {
      dhdu = h11 - h01;
      dhdv = h01 - h00;
      height = h00 + dhdu * u + dhdv * v;
    }

    // u runs along +X and v along +Z, so the surface gradient is those two
    // differences over the spacing, and the normal is (-dh/dx, 1, -dh/dz)
    // normalised.
    // The `=== 0` guards normalise negative zero away. `-0` compares equal to
    // `0` but is not deep-equal to it, so without them a flat surface reports a
    // normal that reads as `{x: -0, y: 1, z: -0}` in every assertion, every
    // debug print, and every serialised snapshot.
    const gx = dhdu === 0 ? 0 : -dhdu / field.spacing;
    const gz = dhdv === 0 ? 0 : -dhdv / field.spacing;
    const inverse = 1 / Math.hypot(gx, 1, gz);

    out.height = height;
    out.normal.x = gx === 0 ? 0 : gx * inverse;
    out.normal.y = inverse;
    out.normal.z = gz === 0 ? 0 : gz * inverse;
    out.surface = field.surfaces[row * (field.columns - 1) + column];
    out.offCourse = false;
  }

  /** Terrain height alone. The marcher's inner loop; no normal, no surface. */
  private heightAt(x: number, z: number): number {
    const field = this.field;
    if (x < field.originX || x > this.maxX || z < field.originZ || z > this.maxZ) {
      return this.surround.height;
    }

    const fx = (x - field.originX) / field.spacing;
    const fz = (z - field.originZ) / field.spacing;
    const column = Math.min(field.columns - 2, Math.max(0, Math.floor(fx)));
    const row = Math.min(field.rows - 2, Math.max(0, Math.floor(fz)));
    const u = fx - column;
    const v = fz - row;

    const base = row * field.columns + column;
    const h00 = field.heights[base];
    if (v < u) {
      const h10 = field.heights[base + 1];
      const h11 = field.heights[base + field.columns + 1];
      return h00 + (h10 - h00) * u + (h11 - h10) * v;
    }
    const h01 = field.heights[base + field.columns];
    const h11 = field.heights[base + field.columns + 1];
    return h00 + (h11 - h01) * u + (h01 - h00) * v;
  }

  private raycastTerrain(
    origin: Vec3,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
  ): number | null {
    if (origin.y <= this.heightAt(origin.x, origin.z)) return 0;

    const step = Math.max(this.field.spacing * MARCH_FRACTION, maxDistance / MARCH_MAX_STEPS);
    let previous = 0;

    for (let t = step; ; t += step) {
      const capped = Math.min(t, maxDistance);
      const height = this.heightAt(origin.x + dx * capped, origin.z + dz * capped);
      if (origin.y + dy * capped <= height) {
        // Bisect between the last point known to be above ground and this one.
        let low = previous;
        let high = capped;
        for (let i = 0; i < MARCH_REFINEMENTS; i += 1) {
          const mid = (low + high) / 2;
          const midHeight = this.heightAt(origin.x + dx * mid, origin.z + dz * mid);
          if (origin.y + dy * mid <= midHeight) high = mid;
          else low = mid;
        }
        return high;
      }
      if (capped >= maxDistance) return null;
      previous = capped;
    }
  }
}

function intersectBox(
  origin: Vec3,
  dx: number,
  dy: number,
  dz: number,
  prepared: PreparedCollider,
  maxDistance: number,
  lateralX = 0,
  lateralZ = 0,
  sweepHalfWidth = 0,
): number | null {
  const { collider, cos, sin } = prepared;
  const { centre, halfExtents } = collider;

  // Both the origin and the direction go into the box's own frame, where the
  // test is the ordinary axis-aligned one. A rotation preserves length, so the
  // distance that comes out needs no correction.
  const rx = origin.x - centre.x;
  const rz = origin.z - centre.z;
  const startX = cos * rx - sin * rz;
  const startZ = sin * rx + cos * rz;
  const startY = origin.y - centre.y;
  const deltaX = cos * dx - sin * dz;
  const deltaZ = sin * dx + cos * dz;

  // A sideways line segment swept along the ray is the Minkowski sum of the
  // box and that segment. Project the segment onto the box's local axes and
  // enlarge only X/Z; its height is still the controller's chosen feeler
  // height, so mountable kerbs remain mountable.
  const expandedHalfX = halfExtents.x
    + sweepHalfWidth * Math.abs(cos * lateralX - sin * lateralZ);
  const expandedHalfZ = halfExtents.z
    + sweepHalfWidth * Math.abs(sin * lateralX + cos * lateralZ);

  let enter = 0;
  let exit = maxDistance;

  const axes: [number, number, number][] = [
    [startX, deltaX, expandedHalfX],
    [startY, dy, halfExtents.y],
    [startZ, deltaZ, expandedHalfZ],
  ];

  for (const [start, delta, halfExtent] of axes) {
    if (delta === 0) {
      // Parallel to this pair of slabs: either always inside them or never.
      if (start < -halfExtent || start > halfExtent) return null;
      continue;
    }

    const inverse = 1 / delta;
    let near = (-halfExtent - start) * inverse;
    let far = (halfExtent - start) * inverse;
    if (near > far) [near, far] = [far, near];

    if (near > enter) enter = near;
    if (far < exit) exit = far;
    if (enter > exit) return null;
  }

  return enter;
}

/** Every surface the plan's heightfield actually paints. For tests and QA. */
export function paintedSurfaces(plan: LevelPlan): Set<SurfaceId> {
  return new Set(plan.heightfield.surfaces);
}
