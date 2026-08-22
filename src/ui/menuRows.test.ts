/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { clusterRows, rowNeighbour, rowStep, type ControlRect } from './menuRows.ts';

/**
 * The §4.6 geometry, pinned headless — M24.
 *
 * The fixtures are the real panels' shapes, taken from a measured census of
 * the built menus (the rider chooser's 3+2 card grid with its full-width Done
 * button, the settings bindings' two-buttons-per-row block, and the title's
 * single column), so the arithmetic is proven against the layouts that
 * actually confused the pad rather than against convenient rectangles.
 */

function rect(left: number, top: number, width = 100, height = 40): ControlRect {
  return { left, top, width, height };
}

/** The title screen's shape: one column, one control per row. */
const COLUMN: ControlRect[] = [0, 1, 2, 3, 4].map((row) => rect(278, 120 + row * 68, 240, 42));

/**
 * The rider chooser, as the census measured it: three cards across the first
 * row, two on the second, one full-width Done below.
 */
const RIDER_GRID: ControlRect[] = [
  rect(20, 217, 314, 127), // 0 card, row 1 col 1
  rect(343, 217, 314, 127), // 1 card, row 1 col 2
  rect(666, 217, 314, 127), // 2 card, row 1 col 3
  rect(20, 353, 314, 143), // 3 card, row 2 col 1
  rect(343, 353, 314, 143), // 4 card, row 2 col 2
  rect(20, 510, 960, 42), // 5 Done, full width
];

/** Two settings fields, then two key-binding rows of Change + Clear. */
const BINDINGS: ControlRect[] = [
  rect(447, 115, 260, 28), // 0 quality select
  rect(449, 186, 260, 20), // 1 fov slider
  rect(677, 487, 70, 30), // 2 accelerate Change
  rect(756, 487, 60, 30), // 3 accelerate Clear
  rect(677, 530, 70, 30), // 4 brake Change
  rect(756, 530, 60, 30), // 5 brake Clear
];

test('a single column is one row per control, and left/right go nowhere', () => {
  const rows = clusterRows(COLUMN);
  assert.equal(rows.length, COLUMN.length);
  assert.deepEqual(rows.map((row) => row.length), [1, 1, 1, 1, 1]);

  // Down walks the column exactly as the 1-D order always did — the m9 title
  // stops depend on this — and wraps at the end.
  assert.equal(rowStep(COLUMN, 0, 1), 1);
  assert.equal(rowStep(COLUMN, 4, 1), 0);
  assert.equal(rowStep(COLUMN, 0, -1), 4);

  // Left/right must never bleed into vertical movement: that bleed is what
  // made "down" read as sideways on the grids, mirrored.
  assert.equal(rowNeighbour(COLUMN, 2, 1), null);
  assert.equal(rowNeighbour(COLUMN, 2, -1), null);
});

test('the rider grid rows are the three cards, the two cards, and Done', () => {
  const rows = clusterRows(RIDER_GRID);
  assert.deepEqual(rows, [[0, 1, 2], [3, 4], [5]]);
});

test('down keeps the column through the rider grid and reaches Done', () => {
  // The shipped defect in one line: from the last card, down must reach the
  // Done button rather than jamming — and from a first-row card, down must go
  // to the card *below*, not to the next card beside it.
  assert.equal(rowStep(RIDER_GRID, 0, 1), 3);
  assert.equal(rowStep(RIDER_GRID, 1, 1), 4);
  // Column three has no card below; the nearest on the second row is card 4.
  assert.equal(rowStep(RIDER_GRID, 2, 1), 4);
  assert.equal(rowStep(RIDER_GRID, 3, 1), 5);
  assert.equal(rowStep(RIDER_GRID, 4, 1), 5);
  // And up from Done lands on the second row, not back at the top.
  assert.equal(rowStep(RIDER_GRID, 5, -1), 4);
  // Wrapping off the bottom returns to the first row at Done's own centre.
  assert.equal(rowStep(RIDER_GRID, 5, 1), 1);
});

test('left and right move between cards within a row and stop at its edge', () => {
  assert.equal(rowNeighbour(RIDER_GRID, 0, 1), 1);
  assert.equal(rowNeighbour(RIDER_GRID, 1, 1), 2);
  assert.equal(rowNeighbour(RIDER_GRID, 2, 1), null);
  assert.equal(rowNeighbour(RIDER_GRID, 1, -1), 0);
  assert.equal(rowNeighbour(RIDER_GRID, 3, -1), null);
});

test('binding rows are one down-stop each, with Clear a right-press away', () => {
  const rows = clusterRows(BINDINGS);
  assert.deepEqual(rows, [[0], [1], [2, 3], [4, 5]]);

  // Down through the bindings visits one row per press — the pre-M24 walk
  // visited both buttons of every row, which doubled the trip through the
  // whole Controls group.
  assert.equal(rowStep(BINDINGS, 1, 1), 2);
  assert.equal(rowStep(BINDINGS, 2, 1), 4);
  // Coming down the Clear column stays in the Clear column.
  assert.equal(rowStep(BINDINGS, 3, 1), 5);
  // And the pair is a sideways move, not a down-stop.
  assert.equal(rowNeighbour(BINDINGS, 2, 1), 3);
  assert.equal(rowNeighbour(BINDINGS, 4, -1), null);
});

test('uneven heights still band by centre, not by exact tops', () => {
  // A short control beside a tall one — a checkbox beside its value span, a
  // narrow card beside a wide one — is one visual row when its centre sits
  // inside the taller neighbour's band.
  const uneven: ControlRect[] = [
    rect(20, 100, 200, 60), // tall
    rect(240, 115, 40, 20), // short, centred inside the tall one's band
    rect(20, 180, 200, 40), // clearly the next row
  ];
  assert.deepEqual(clusterRows(uneven), [[0, 1], [2]]);
});

test('a control missing from the list moves nowhere rather than throwing', () => {
  assert.equal(rowStep(RIDER_GRID, -1, 1), -1);
  assert.equal(rowNeighbour(RIDER_GRID, -1, 1), null);
});
