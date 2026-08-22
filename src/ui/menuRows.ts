/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Visual-row arithmetic for gamepad menu navigation — M24, §4.6.
 *
 * The owner's controller report was one sentence with a geometry problem
 * inside it: submenus answered left/right but "not up and down, which makes
 * selecting some things awkward". The cause is that `Menus.navigate` walked
 * the panel's one-dimensional Tab order for every direction, which reads as
 * vertical movement only while a panel is a single column. The rider chooser
 * is a 3×2 card grid and every key-binding row holds two buttons side by
 * side, so on those panels "down" visibly moved *sideways* — and the d-pad
 * appeared to have no vertical axis at all.
 *
 * This module is the fix's arithmetic: cluster the panel's controls into the
 * rows a player actually sees, then answer "which control is one row down
 * from here" and "which control is beside this one". It is pure geometry over
 * plain rectangles — no DOM import — precisely so `node --test` can pin the
 * grid, the binding pair, and the single-column cases without a browser
 * (`ui/hudModel.ts`'s precedent). `ui/menus.ts` feeds it
 * `getBoundingClientRect` values and owns everything DOM-shaped.
 */

/** The slice of a DOMRect the arithmetic needs. Plain numbers, CSS pixels. */
export interface ControlRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Group controls into visual rows, top to bottom, each row left to right.
 *
 * The banding rule: controls are taken in top order, and a control joins the
 * current row while its vertical *centre* sits above the row's running
 * bottom. Centres are what make the rule robust to the real panels — a tall
 * card beside a short one, a checkbox beside a taller select — where raw
 * top-equality would split one visible row into two. Returns indices into
 * the caller's array, because the caller's array is parallel to its own list
 * of elements.
 */
export function clusterRows(rects: readonly ControlRect[]): number[][] {
  const order = rects.map((_, index) => index)
    .sort((a, b) => rects[a].top - rects[b].top || rects[a].left - rects[b].left);

  const rows: number[][] = [];
  let bottom = -Infinity;
  for (const index of order) {
    const rect = rects[index];
    const centre = rect.top + rect.height / 2;
    if (rows.length === 0 || centre >= bottom) {
      rows.push([index]);
      bottom = rect.top + rect.height;
    } else {
      rows[rows.length - 1].push(index);
      bottom = Math.max(bottom, rect.top + rect.height);
    }
  }
  for (const row of rows) {
    row.sort((a, b) => rects[a].left - rects[b].left);
  }
  return rows;
}

/** Horizontal centre, the coordinate rows are crossed along. */
function centreX(rect: ControlRect): number {
  return rect.left + rect.width / 2;
}

/**
 * The control one visual row up or down from `current`, wrapping at the ends.
 *
 * Lands on the target row's horizontally nearest control, so walking down
 * through a grid keeps the column and walking down past a two-button binding
 * row does not zig-zag. A single-row panel answers `current` itself — there
 * is nowhere to go, and answering a neighbour would turn "down" into a
 * sideways move again.
 */
export function rowStep(
  rects: readonly ControlRect[],
  current: number,
  direction: -1 | 1,
): number {
  const rows = clusterRows(rects);
  const rowIndex = rows.findIndex((row) => row.includes(current));
  if (rowIndex < 0 || rows.length <= 1) return current;
  const target = rows[(rowIndex + direction + rows.length) % rows.length];
  const from = centreX(rects[current]);
  let best = target[0];
  for (const candidate of target) {
    if (Math.abs(centreX(rects[candidate]) - from) < Math.abs(centreX(rects[best]) - from)) {
      best = candidate;
    }
  }
  return best;
}

/**
 * The control beside `current` in its own visual row, or null at the row's
 * edge.
 *
 * Null rather than a wrap or a spill into the next row on purpose: left and
 * right falling through to *vertical* movement is exactly the confusion this
 * module exists to remove. On a single-column panel every row has one member,
 * so left/right (beyond adjusting the focused control, which the caller tries
 * first) deliberately do nothing.
 */
export function rowNeighbour(
  rects: readonly ControlRect[],
  current: number,
  direction: -1 | 1,
): number | null {
  const rows = clusterRows(rects);
  const row = rows.find((entry) => entry.includes(current));
  if (row === undefined) return null;
  const at = row.indexOf(current) + direction;
  if (at < 0 || at >= row.length) return null;
  return row[at];
}
