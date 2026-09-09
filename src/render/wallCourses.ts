/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Wall coursing — the enhanced presentation's treatment of the near walls.
 *
 * A collider block is drawn as one yawed box, six faces, twelve triangles
 * (`render/terrain.ts:appendBox`). At street distance the tallest of them —
 * the stone frontage walls that line the boulevard and the riverside cutting —
 * are the largest blank surfaces the rider ever sees, and no amount of mottle
 * on the ground beside them changes that.
 *
 * This file decides, from the collider alone, how such a face is divided into
 * a running bond of flat-toned quads, and what each quad's tone is. It is pure
 * arithmetic on plain plan data so that two consumers can agree on it without
 * seeing each other: `render/terrain.ts` builds the quads, and
 * `render/presentation.ts` prices them before the world is installed. The
 * price is the whole reason the rule is not simply "subdivide everything":
 * every triangle here is drawn twice, because every block mesh casts.
 *
 * **What it deliberately leaves alone.** Kerbs and low plinths keep their
 * single quad — `minHeight` is above every kerb in every authored world — so
 * kerb concrete keeps exactly the value `data/surfaces.test.ts` asserts against
 * the road beside it. The material list is `stone` alone: BelVar's barrier is
 * concrete and signal red and *is* the venue's treatment (`DESIGN.md` §7l),
 * and a wooden fence is a run of planks that a bond would misdescribe. Top and
 * underside faces are never coursed; the geometry's planes, edges and
 * collision boundary are untouched, and a tone that both lifts and darkens
 * about 1.0 leaves the wall's average value where the palette put it.
 */
import { positionHash01 } from '../shared/maths.ts';
import type { BoxCollider } from '../level/plan.ts';
import type { MaterialId } from '../data/surfaces.ts';

export const WALL_COURSES = Object.freeze({
  /** Materials that take a bond. Everything else keeps its plain faces. */
  materials: Object.freeze(['stone'] as readonly MaterialId[]),
  /** A block shorter than this, metres, keeps its single quad per face. */
  minHeight: 1.2,
  /** A face narrower than this, metres, stays one quad — a wall's end. */
  minFaceWidth: 0.9,
  /** Target course height, metres. Rows are rounded to fill the face. */
  course: 0.72,
  /** Target stone length, metres. Bays are rounded to fill the face. */
  bay: 1.9,
  /**
   * Half-range of the flat luminance tone per stone, about 1.0.
   *
   * The same order as the plaza's paving module (1/16 of the material's own
   * value, `DESIGN.md` §4c): enough that two neighbouring stones differ, not
   * enough to read as a checkerboard from the chase camera.
   */
  toneSpread: 0.085,
  /**
   * Odd courses sit this much darker on average, so a wall carries a course
   * rhythm as well as a stone-by-stone one and still reads on a face the sun
   * is not on. Half of it is added back to even courses to keep the mean.
   */
  courseBias: 0.03,
});

/** How one vertical face divides. `columns` is the count on an even row. */
export interface WallFaceGrid {
  readonly rows: number;
  readonly columns: number;
}

/** Whether this collider's vertical faces take the bond at all. */
export function isCoursed(collider: BoxCollider, material: MaterialId): boolean {
  return WALL_COURSES.materials.includes(material)
    && collider.halfExtents.y * 2 >= WALL_COURSES.minHeight;
}

/** The grid for a face `width` metres long and `height` metres tall. */
export function wallFaceGrid(width: number, height: number): WallFaceGrid {
  if (width < WALL_COURSES.minFaceWidth) return { rows: 1, columns: 1 };
  return {
    rows: Math.max(1, Math.round(height / WALL_COURSES.course)),
    columns: Math.max(1, Math.round(width / WALL_COURSES.bay)),
  };
}

/**
 * Quads on one face under the grid: even rows carry `columns` whole stones,
 * odd rows are offset by half a bay and carry a half stone at each end.
 */
export function wallFaceQuads(grid: WallFaceGrid): number {
  if (grid.rows === 1 && grid.columns === 1) return 1;
  const odd = Math.floor(grid.rows / 2);
  const even = grid.rows - odd;
  return even * grid.columns + odd * (grid.columns + 1);
}

/**
 * Colour-pass triangles this collider draws — the baseline's twelve when it is
 * not coursed, otherwise two for each quad of its four vertical faces plus the
 * top and the underside.
 */
export function colliderTriangles(collider: BoxCollider, material: MaterialId): number {
  if (!isCoursed(collider, material)) return 12;
  const height = collider.halfExtents.y * 2;
  const long = wallFaceQuads(wallFaceGrid(collider.halfExtents.z * 2, height));
  const short = wallFaceQuads(wallFaceGrid(collider.halfExtents.x * 2, height));
  return 2 * 2 + 2 * (2 * long + 2 * short);
}

/**
 * The flat tone of one stone, from where it stands in the world.
 *
 * Hashed on the stone's own centre so a rebuild of the same plan paints the
 * same wall, and so two walls sharing a corner do not share a rhythm.
 */
export function stoneTone(x: number, z: number, row: number): number {
  const unit = positionHash01(x, z, 7100 + row) * 2 - 1;
  const bias = row % 2 === 1 ? -WALL_COURSES.courseBias / 2 : WALL_COURSES.courseBias / 2;
  return 1 + unit * WALL_COURSES.toneSpread + bias;
}
