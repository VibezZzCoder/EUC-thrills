/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Where the panes of a split frame are — the arithmetic, with no imports at
 * all.
 *
 * M25 Phase 3 tiled a canvas into vertical strips and wrote the rule down in
 * `Renderer.viewBounds`: **partition by rounded boundaries, never by a divided
 * width.** `width / views` on a 1001 px canvas is 500.5, both passes floor to
 * 500, and the final column is drawn by nobody — a one-pixel stripe of
 * untouched page down the right edge of the game, which a Codex QA pass found
 * on the day the split shipped.
 *
 * M27 Phase 1 gives that rule its second axis, because four 480x1080 strips are
 * unusable and three or four seats therefore mean a 2x2 grid. The arithmetic
 * did not change; it is applied twice now, once per axis. What changed is who
 * needs it: the renderer's real partition, the M27 Phase 0 quad probe that
 * measured a four-pass frame before any seat could ask for one, and a headless
 * test that can sweep odd widths *and* odd heights without a GPU. Three callers
 * of one piece of arithmetic is exactly what `AGENTS.md` means by `shared/` — a
 * module with no imports whose whole content is arithmetic.
 *
 * **Origins.** `paneBounds` answers in WebGL's frame: x to the right, y *up*
 * from the bottom-left corner, which is what `WebGLRenderer.setViewport` and
 * `setScissor` take. Pane indices are in reading order — 0 top-left, 1
 * top-right, 2 bottom-left, 3 bottom-right — because that is the order seats
 * are numbered in and the order a room reads a screen. The flip between the
 * two lives in exactly one line below (`rows - row - 1`), which is the only
 * place in the project that has to think about it.
 */

/** How many columns and rows a frame of `views` passes is cut into. */
export interface PaneGrid {
  readonly columns: number;
  readonly rows: number;
}

/** One pane's box, in whole CSS pixels, y measured up from the bottom. */
export interface PaneRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The shape of a frame that draws `views` passes.
 *
 * **One and two are not the grid's special cases; they are the shapes that
 * already shipped.** One pass is the whole canvas and two are vertical halves,
 * which is M25's partition unchanged — a two-seat frame drawn through this
 * function tiles exactly where it always did, and Contract 2's measured frames
 * stay the frames that were measured. Three and four are the new shape, and
 * three is a 2x2 grid with a hole rather than a row of three: the fourth
 * quadrant is where the standings card goes (§27.3 q95), and a three-wide row
 * would be three keyholes to buy back a pane nobody is sitting in.
 *
 * Beyond four is not reachable from the game — `COUCH_SEATS` is 4 and the join
 * panel seats no more — but the QA bridge can set any view count, so this stays
 * a total function: two columns and as many rows as it takes. A rule that
 * throws on the fifth view would be a rule nobody could test the fourth
 * against.
 */
export function paneGridFor(views: number): PaneGrid {
  const wanted = Math.max(1, Math.floor(views));
  const columns = wanted <= 2 ? wanted : 2;
  return { columns, rows: Math.ceil(wanted / columns) };
}

/**
 * Where one pane sits on a canvas of this size.
 *
 * Every edge is `round(size * n / count)`, so the boundary between two panes is
 * a **single number** shared by the pane that ends there and the pane that
 * starts there. The panes therefore tile the canvas exactly once — no gap, no
 * overlap — at any width, any height, and any grid, odd sizes included. They
 * are not necessarily equal: 1001 splits into 500 and 501, which is the honest
 * answer rather than a rounding error, and it is why every camera takes its
 * aspect from its own pane rather than from a halved canvas.
 *
 * The index is in reading order and is clamped to the grid by its caller: a
 * three-seat frame asks for panes 0, 1 and 2 and never for 3, which is what
 * leaves the bottom-right quadrant undrawn for the DOM card to sit over.
 */
export function paneBounds(
  width: number,
  height: number,
  grid: PaneGrid,
  index: number,
): PaneRect {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  const left = Math.round((width * column) / grid.columns);
  const right = Math.round((width * (column + 1)) / grid.columns);
  // Reading order counts rows downwards and WebGL counts pixels upwards, so
  // row 0 is the *top* band: the one whose lower edge is the highest boundary.
  const bottom = Math.round((height * (grid.rows - row - 1)) / grid.rows);
  const top = Math.round((height * (grid.rows - row)) / grid.rows);
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}
