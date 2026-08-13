/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Turning a painted line into triangles — the arithmetic, with no imports at
 * all.
 *
 * The same split `render/groundNoise.ts` and `render/skyImage.ts` use, and for
 * the same reason: everything here is decidable without a GPU, so it is checked
 * at `node --test` rather than in a screenshot. `render/markings.ts` does
 * nothing but pour the arrays this file fills into three.js buffers.
 *
 * **It sits in `shared/` from M12 Phase 0**, having lived in `render/`. Nothing
 * about it changed; what changed is who needs it. `level/renderBudget.ts` has
 * to predict what a route's paint will cost to draw, and the dash walk below is
 * the only thing that knows how many quads a broken line comes out as — but
 * `level/` may not import `render/` (invariant 5). A file with no imports at
 * all, whose entire content is arithmetic, is what `AGENTS.md` means by
 * `shared/`. Reimplementing the walk on the other side of the boundary would
 * have been the same geometry described twice.
 *
 * A marking arrives as a polyline that already lies on the ground — the level
 * builder sampled the finished heightfield for every point, so nothing here
 * knows what terrain is. This file answers three questions about it:
 *
 *   1. **Where does the paint actually go?** A broken line is a sequence of
 *      dashes measured in arc length, not a repeating texture, so the dash
 *      pattern has to be walked along the polyline and cut at real distances.
 *   2. **Which way is sideways?** A ribbon is the centreline offset by half a
 *      width along the horizontal normal. On a curve the normal turns, so it is
 *      taken from the *average* of the two segments meeting at a point rather
 *      than from either one, which is what keeps the outer edge continuous
 *      through a bend instead of notching at every sample.
 *   3. **How worn is it here?** Paint wears where wheels run, so the tone
 *      varies along the line from an integer hash of the world position —
 *      deterministic, never `Math.random`, the same rule as the mottle
 *      (`DESIGN.md` §4) and the particles (§6b). A frozen capture of a road
 *      has to contain the same paint twice or it proves nothing.
 */

export interface RibbonPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Linear RGB. The paint's decoded albedo, before wear. */
export interface RibbonColour {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** The buffers a mesh is poured from. Shared by every marking in the world. */
export interface RibbonTarget {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}

/** A run of paint along a polyline, in metres of arc length. */
export interface DashSpan {
  readonly from: number;
  readonly to: number;
}

export function createRibbonTarget(): RibbonTarget {
  return { positions: [], normals: [], colors: [], indices: [] };
}

/**
 * Cumulative arc length at each point, measured in the ground plane.
 *
 * **In XZ, not in 3D**, which matters on the return climb: a dash pattern
 * measured along the slope would stretch its gaps on a 7° hill relative to the
 * flat road it continues from, and the player reads the pattern from above at a
 * shallow angle where only the horizontal spacing is visible anyway.
 */
export function arcLengths(points: readonly RibbonPoint[]): number[] {
  const lengths = new Array<number>(points.length);
  lengths[0] = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    lengths[index] = lengths[index - 1] + Math.hypot(point.x - previous.x, point.z - previous.z);
  }
  return lengths;
}

/**
 * Where the paint is, along a line of `total` metres.
 *
 * A solid line is one span. A broken line is centred on the run rather than
 * started at its beginning: a line clipped by an island or a junction otherwise
 * always opens with a full mark and closes with whatever is left, which reads
 * as a mistake at the closing end. Centring spends the remainder equally, so
 * both ends of every run are cut the same way.
 */
export function dashSpans(total: number, dash: number, gap: number): DashSpan[] {
  if (total <= 0) return [];
  if (dash <= 0 || gap <= 0) return [{ from: 0, to: total }];

  const period = dash + gap;
  // How many whole marks fit, and where the first one starts so the leftover is
  // split between the two ends. At least one mark, however short the run — a
  // two-metre stub of a broken line is still a mark rather than nothing.
  const marks = Math.max(1, Math.round((total + gap) / period));
  const painted = marks * dash + (marks - 1) * gap;
  const start = (total - painted) / 2;

  const spans: DashSpan[] = [];
  for (let index = 0; index < marks; index += 1) {
    const from = start + index * period;
    const clampedFrom = Math.max(0, from);
    const clampedTo = Math.min(total, from + dash);
    if (clampedTo - clampedFrom > 1e-6) spans.push({ from: clampedFrom, to: clampedTo });
  }
  return spans;
}

/**
 * Metres between rows of a ribbon.
 *
 * A dash on a bend has to curve with the road rather than cut its chord, and a
 * row every 1.25 m is finer than the 34 m radius of the tightest painted corner
 * can show at a chase camera's distance.
 */
export const RIBBON_ROW_STEP = 1.25;

/**
 * Rows in one painted mark. At least two, so a mark is always a quad.
 *
 * Extracted so `ribbonQuads` below and `appendMarking` cannot disagree about
 * how much geometry a line comes out as — the count is M12's render-budget
 * contract and the emission is what the player sees, and a budget that counted
 * a line differently from the mesh it describes would be worse than no budget.
 */
export function ribbonRows(length: number): number {
  return Math.max(2, Math.ceil(length / RIBBON_ROW_STEP) + 1);
}

/**
 * How many quads a marking will come out as, without building it.
 *
 * Two triangles each. `level/renderBudget.ts` uses it to predict the paint's
 * share of the §9 triangle ceiling from the plan alone (`docs/PLANS.md` §10,
 * M12 Phase 2).
 */
export function ribbonQuads(
  points: readonly RibbonPoint[],
  dash: number,
  gap: number,
): number {
  if (points.length < 2) return 0;
  const lengths = arcLengths(points);
  const total = lengths[points.length - 1];
  if (total <= 0) return 0;

  let quads = 0;
  for (const span of dashSpans(total, dash, gap)) {
    quads += ribbonRows(span.to - span.from) - 1;
  }
  return quads;
}

/**
 * The point at `distance` along the polyline, written into `out`.
 *
 * Linear between samples, because the samples are 1.25 m apart on a line whose
 * own curvature was already resolved when the builder walked it in the
 * segment's `(s, t)` frame — there is no curve left here to get wrong.
 */
export function sampleAt(
  points: readonly RibbonPoint[],
  lengths: readonly number[],
  distance: number,
  out: { x: number; y: number; z: number },
): void {
  const last = points.length - 1;
  if (distance <= 0) {
    out.x = points[0].x; out.y = points[0].y; out.z = points[0].z;
    return;
  }
  if (distance >= lengths[last]) {
    out.x = points[last].x; out.y = points[last].y; out.z = points[last].z;
    return;
  }

  let index = 1;
  while (index < last && lengths[index] < distance) index += 1;

  const span = lengths[index] - lengths[index - 1];
  const u = span > 1e-9 ? (distance - lengths[index - 1]) / span : 0;
  const a = points[index - 1];
  const b = points[index];
  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u;
  out.z = a.z + (b.z - a.z) * u;
}

/**
 * Deterministic wear at a world point, as a multiplier near 1.
 *
 * Quantised to five centimetres before hashing so a float that round-trips
 * differently between two builds cannot change the paint, which is the same
 * guard `render/props.ts` puts on a tree's colour.
 */
export function wearAt(x: number, z: number, amount: number): number {
  let h = (Math.imul(Math.round(x * 20), 374761393)
    + Math.imul(Math.round(z * 20), 668265263)
    + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = h ^ (h >>> 16);
  const unit = (h >>> 0) / 4294967296;
  // Squared about zero, the same distribution trick §4b uses on the ground: a
  // uniform jitter makes every metre of a line disagree loudly with the next
  // and reads as dashes on a solid line. Squaring keeps most of the run at its
  // own tone and lets a scattered minority be visibly scuffed.
  const signed = unit * 2 - 1;
  return 1 + signed * Math.abs(signed) * amount;
}

/**
 * Append one painted line to the shared buffers, and report the triangles.
 *
 * `halfWidth` is half the finished line. `dash` and `gap` of zero make a solid
 * line. The ribbon is flat — every normal is straight up — because paint on a
 * 6% crown is still paint on a road, and lighting a 16 cm strip by the road's
 * own curvature would only make it disagree with the tarmac beside it.
 */
export function appendMarking(
  points: readonly RibbonPoint[],
  halfWidth: number,
  dash: number,
  gap: number,
  colour: RibbonColour,
  wear: number,
  target: RibbonTarget,
  heightAt?: (x: number, z: number) => number,
): number {
  if (points.length < 2 || halfWidth <= 0) return 0;

  const lengths = arcLengths(points);
  const total = lengths[points.length - 1];
  if (total <= 0) return 0;

  const spans = dashSpans(total, dash, gap);
  const cursor = { x: 0, y: 0, z: 0 };
  let triangles = 0;

  for (const span of spans) {
    const length = span.to - span.from;
    // At least two rows per mark, and one row per sample step beyond that, so a
    // dash on a bend curves with the road rather than cutting its chord. Shared
    // with `ribbonQuads`, which is what predicts this mesh's cost.
    const rows = ribbonRows(length);
    const first = target.positions.length / 3;

    for (let row = 0; row < rows; row += 1) {
      const distance = span.from + (length * row) / (rows - 1);
      sampleAt(points, lengths, distance, cursor);

      // The tangent, taken across a neighbourhood rather than from one side, so
      // the offset edge stays continuous where two samples meet at an angle.
      const behind = Math.max(span.from, distance - 0.35);
      const ahead = Math.min(span.to, distance + 0.35);
      const back = { x: 0, y: 0, z: 0 };
      const forward = { x: 0, y: 0, z: 0 };
      sampleAt(points, lengths, behind, back);
      sampleAt(points, lengths, ahead, forward);
      let dx = forward.x - back.x;
      let dz = forward.z - back.z;
      const magnitude = Math.hypot(dx, dz);
      if (magnitude < 1e-9) { dx = 0; dz = 1; } else { dx /= magnitude; dz /= magnitude; }

      // The rider's LEFT for a direction (dx, dz) is (dz, -dx): the same
      // `leftOf` identity `level/segments.ts` derives from the axis facts, in
      // vector form. Which side is which does not change a symmetric ribbon,
      // but taking it from the convention rather than by eye is the rule.
      const leftX = dz;
      const leftZ = -dx;

      const tone = wearAt(cursor.x, cursor.z, wear);
      for (const side of [1, -1]) {
        const x = cursor.x + leftX * halfWidth * side;
        const z = cursor.z + leftZ * halfWidth * side;
        target.positions.push(
          x,
          heightAt?.(x, z) ?? cursor.y,
          z,
        );
        target.normals.push(0, 1, 0);
        target.colors.push(colour.r * tone, colour.g * tone, colour.b * tone);
      }
    }

    for (let row = 0; row < rows - 1; row += 1) {
      const a = first + row * 2;
      // Wound so the up-facing side is the front face, matching the ground.
      target.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      triangles += 2;
    }
  }

  return triangles;
}
