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

// -- M39: the title's utility row ---------------------------------------------
//
// Settings and the Ultra Graphics toggle share one row (`game.css`, DESIGN
// §9g), and the row is `1.08fr 1fr` rather than halves for a pad's sake:
// `rowStep` lands on the target row's horizontally nearest control, and two
// equal halves under a full-width control are *exactly* as near as each other.
// The fixtures are built from the stylesheet's own arithmetic so the ratio is
// tested where it is used.

/** `game.css`'s `.euc-menu__utility` tracks: Settings 1.08fr, Ultra 1fr. */
const UTILITY_SPLIT = 1.08;

/** Settings and Ultra inside a cell `left..left+width`, split as the stylesheet splits it. */
function utilityPair(left: number, width: number, gap: number, top: number, height: number,
  split = UTILITY_SPLIT): [ControlRect, ControlRect] {
  const settings = ((width - gap) * split) / (split + 1);
  const ultra = width - gap - settings;
  return [
    rect(left, top, settings, height),
    rect(left + settings + gap, top, ultra, height),
  ];
}

/**
 * The stack (one column, 1920×1080): Police chase and Fresh route full width,
 * the pair below, the rider chip centred under it. 544 px panel at x = 688;
 * the pair is as tall as the Ultra toggle with its helper line.
 */
const STACK: ControlRect[] = [
  rect(688, 610, 544, 66), // 0 Police chase
  rect(688, 686, 544, 66), // 1 Fresh route
  ...utilityPair(688, 544, 9.6, 762, 84), // 2 Settings, 3 Ultra
  rect(810, 880, 300, 36), // 4 rider chip, centred on the panel
];

/**
 * The couch grid (1000×700): two 364 px columns at x = 132 and 504, 8 px gap.
 * Knockabout | Police chase, then Fresh route | the pair inside Settings' old
 * cell, then the chip.
 */
const COUCH: ControlRect[] = [
  rect(132, 400, 364, 79), // 0 Knockabout
  rect(504, 400, 364, 79), // 1 Police chase
  rect(132, 487, 364, 96), // 2 Fresh route (stretched to the pair's row)
  ...utilityPair(504, 364, 8, 487, 96), // 3 Settings, 4 Ultra
  rect(350, 595, 300, 36), // 5 rider chip
];

function distanceX(a: ControlRect, b: ControlRect): number {
  return Math.abs((a.left + a.width / 2) - (b.left + b.width / 2));
}

test('the utility pair is one row, and Right from Settings is Ultra', () => {
  assert.deepEqual(clusterRows(STACK), [[0], [1], [2, 3], [4]]);
  assert.equal(rowNeighbour(STACK, 2, 1), 3);
  assert.equal(rowNeighbour(STACK, 3, -1), 2);
  // The row ends at Ultra: Right goes nowhere rather than down to the chip.
  assert.equal(rowNeighbour(STACK, 3, 1), null);
  assert.equal(rowNeighbour(STACK, 2, -1), null);

  // On the couch grid the pair shares a row with Fresh route, and a sideways
  // walk crosses all three in reading order.
  assert.deepEqual(clusterRows(COUCH), [[0, 1], [2, 3, 4], [5]]);
  assert.equal(rowNeighbour(COUCH, 2, 1), 3);
  assert.equal(rowNeighbour(COUCH, 3, 1), 4);
  assert.equal(rowNeighbour(COUCH, 3, -1), 2);
});

test('Down onto the pair lands on Settings, with no tie to break', () => {
  // From the full-width Fresh route in the stack, and from Police chase above
  // the right-hand cell on the couch grid — the two stops `tests/m9.spec.ts`
  // walks — Settings is the nearer centre by a margin, not by a rounding.
  assert.equal(rowStep(STACK, 1, 1), 2);
  assert.equal(rowStep(COUCH, 1, 1), 3);

  const stackMargin = distanceX(STACK[3], STACK[1]) - distanceX(STACK[2], STACK[1]);
  const couchMargin = distanceX(COUCH[4], COUCH[1]) - distanceX(COUCH[3], COUCH[1]);
  // (Ultra's distance − Settings' distance) is (Settings − Ultra) / 2, the
  // eight hundredths' dividend: ≈ 10 px in the stack and ≈ 7 px on the couch
  // grid — far past the half-pixel a layout rounds by.
  assert.ok(stackMargin > 5, `stack margin ${stackMargin.toFixed(2)} px`);
  assert.ok(couchMargin > 3, `couch margin ${couchMargin.toFixed(2)} px`);

  // And Up from either half returns to the control above; Down from either
  // reaches the chip, so the pair is never a dead end for the walk.
  assert.equal(rowStep(STACK, 2, -1), 1);
  assert.equal(rowStep(STACK, 3, -1), 1);
  assert.equal(rowStep(STACK, 2, 1), 4);
  assert.equal(rowStep(STACK, 3, 1), 4);
  assert.equal(rowStep(COUCH, 3, -1), 1);
  assert.equal(rowStep(COUCH, 4, -1), 1);
  // Up from the centred chip lands on Settings too — the nearer half again.
  assert.equal(rowStep(STACK, 4, -1), 2);
});

test('equal halves would tie, which is why Settings is the wider track', () => {
  // The same stack with `1fr 1fr`: the two centres are the same distance from
  // Fresh route's, so the answer is whichever the sort happens to put first —
  // and half a pixel of layout rounding on Ultra's box flips it.
  const [settings, ultra] = utilityPair(688, 544, 9.6, 762, 84, 1);
  const even: ControlRect[] = [STACK[0], STACK[1], settings, ultra, STACK[4]];
  assert.ok(Math.abs(distanceX(settings, even[1]) - distanceX(ultra, even[1])) < 1e-9);

  const nudged: ControlRect[] = [...even];
  nudged[3] = rect(ultra.left - 0.5, ultra.top, ultra.width, ultra.height);
  assert.equal(rowStep(nudged, 1, 1), 3, 'a half-pixel nudge did not flip equal halves');

  // The shipped split survives the same nudge.
  const shipped: ControlRect[] = [...STACK];
  shipped[3] = rect(STACK[3].left - 0.5, STACK[3].top, STACK[3].width, STACK[3].height);
  assert.equal(rowStep(shipped, 1, 1), 2);
});
