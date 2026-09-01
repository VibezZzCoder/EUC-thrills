/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { paneBounds, paneGridFor, type PaneGrid } from './paneGrid.ts';

/**
 * The split frame's partition — M25 Phase 3's rule, M27 Phase 1's second axis.
 *
 * **The defect this file exists to catch has already shipped once.** Dividing
 * the width and flooring left a one-pixel column of the canvas drawn by nobody
 * at 1001 px, invisible at every even width the suite and the owner's desktop
 * happen to use. `tests/m25.spec.ts` proves the repair with real pixels at one
 * odd width; this proves the arithmetic itself across a sweep of odd sizes on
 * **both** axes, which is the half a browser spec cannot afford to run.
 *
 * The claim in one sentence: for any size and any view count, the panes cover
 * the canvas exactly once.
 */

/** Every pane of a grid, in reading order. */
const paves = (width: number, height: number, grid: PaneGrid, views: number) =>
  Array.from({ length: views }, (_, index) => paneBounds(width, height, grid, index));

/**
 * Walk a canvas pixel by pixel and count how many panes claim each one.
 *
 * Deliberately the slow, dumb check rather than an edge comparison: an edge
 * argument is the same reasoning the code uses, so it agrees with the code
 * when the code is wrong. Sizes below are kept small enough to brute-force.
 */
const coverage = (width: number, height: number, panes: readonly ReturnType<typeof paneBounds>[]) => {
  const counts = new Uint8Array(width * height);
  for (const pane of panes) {
    for (let y = pane.y; y < pane.y + pane.height; y += 1) {
      for (let x = pane.x; x < pane.x + pane.width; x += 1) {
        counts[y * width + x] += 1;
      }
    }
  }
  let uncovered = 0;
  let doubled = 0;
  for (const count of counts) {
    if (count === 0) uncovered += 1;
    if (count > 1) doubled += 1;
  }
  return { uncovered, doubled };
};

test('one pass is the whole canvas and two are vertical halves — M25, unchanged', () => {
  assert.deepEqual(paneGridFor(1), { columns: 1, rows: 1 });
  assert.deepEqual(paneGridFor(2), { columns: 2, rows: 1 });

  assert.deepEqual(
    paneBounds(1280, 720, paneGridFor(1), 0),
    { x: 0, y: 0, width: 1280, height: 720 },
  );
  // The two-seat frame is the frame Contract 2 was measured on. Full height,
  // y at zero, and the halves meeting on one boundary: if this moves, the
  // pinned split budget is describing a frame the game no longer draws.
  assert.deepEqual(
    paneBounds(1280, 720, paneGridFor(2), 0),
    { x: 0, y: 0, width: 640, height: 720 },
  );
  assert.deepEqual(
    paneBounds(1280, 720, paneGridFor(2), 1),
    { x: 640, y: 0, width: 640, height: 720 },
  );
});

test('three and four seats are a 2x2 grid, in reading order', () => {
  assert.deepEqual(paneGridFor(3), { columns: 2, rows: 2 });
  assert.deepEqual(paneGridFor(4), { columns: 2, rows: 2 });

  const grid = paneGridFor(4);
  // Reading order against WebGL's bottom-left origin: panes 0 and 1 are the
  // *top* row, so their y is the middle boundary and the bottom row's is zero.
  assert.deepEqual(paneBounds(1920, 1080, grid, 0), { x: 0, y: 540, width: 960, height: 540 });
  assert.deepEqual(paneBounds(1920, 1080, grid, 1), { x: 960, y: 540, width: 960, height: 540 });
  assert.deepEqual(paneBounds(1920, 1080, grid, 2), { x: 0, y: 0, width: 960, height: 540 });
  assert.deepEqual(paneBounds(1920, 1080, grid, 3), { x: 960, y: 0, width: 960, height: 540 });
});

test('a quadrant of an even canvas keeps the canvas aspect — §27.2 geometric argument', () => {
  // The whole reason quadrants need no keyhole treatment: 960x540 is 16:9,
  // exactly what the full 1920x1080 canvas is. A half is 8:9 and is why
  // `splitFovGain` had to exist at all.
  const quad = paneBounds(1920, 1080, paneGridFor(4), 0);
  assert.equal(quad.width / quad.height, 1920 / 1080);
  const half = paneBounds(1920, 1080, paneGridFor(2), 0);
  assert.notEqual(half.width / half.height, 1920 / 1080);
});

test('the panes tile the canvas exactly once, at odd sizes on both axes', () => {
  // Odd on both axes, prime-ish, and deliberately including sizes that divide
  // badly by two twice over. The failing case at M25 was 1001x701 on one axis;
  // a 2x2 grid can fail the same way on the other, and nothing but a sweep
  // covers "and both at once".
  const widths = [1, 2, 3, 101, 500, 501, 999, 1001];
  const heights = [1, 2, 3, 77, 350, 351, 700, 701];
  for (const views of [1, 2, 3, 4, 5, 6]) {
    const grid = paneGridFor(views);
    for (const width of widths) {
      for (const height of heights) {
        const panes = paves(width, height, grid, views);
        for (const pane of panes) {
          assert.ok(pane.width >= 0, `negative width at ${width}x${height} views ${views}`);
          assert.ok(pane.height >= 0, `negative height at ${width}x${height} views ${views}`);
          assert.ok(pane.x >= 0 && pane.x + pane.width <= width, 'pane outside the canvas');
          assert.ok(pane.y >= 0 && pane.y + pane.height <= height, 'pane outside the canvas');
        }
        // Only a *full* grid covers the canvas; a three-seat frame leaves the
        // fourth quadrant for the standings card and is checked below instead.
        if (views !== grid.columns * grid.rows) continue;
        const { uncovered, doubled } = coverage(width, height, panes);
        assert.equal(uncovered, 0, `${uncovered} pixels drawn by nobody at ${width}x${height} views ${views}`);
        assert.equal(doubled, 0, `${doubled} pixels drawn twice at ${width}x${height} views ${views}`);
      }
    }
  }
});

test('a three-seat frame leaves exactly one quadrant undrawn — the idle pane', () => {
  // q95: the room's scoreboard goes in the hole. The hole has to be a real
  // quadrant rather than a leftover sliver, so it is asserted as one: the
  // three drawn panes cover everything except the fourth pane's own box.
  for (const [width, height] of [[1920, 1080], [1001, 701], [1000, 700]]) {
    const grid = paneGridFor(3);
    const drawn = paves(width, height, grid, 3);
    const idle = paneBounds(width, height, grid, 3);
    const { uncovered, doubled } = coverage(width, height, drawn);
    assert.equal(doubled, 0, `${width}x${height} drew a pixel twice`);
    assert.equal(uncovered, idle.width * idle.height, `${width}x${height} left the wrong hole`);
    // And it is the bottom-right one, which is what the CSS places the card in.
    assert.equal(idle.x + idle.width, width);
    assert.equal(idle.y, 0);
  }
});

test('a boundary is one number, so neighbours meet exactly', () => {
  // The rule stated directly, because the sweep above proves the consequence
  // and this proves the mechanism: the pane that ends at an edge and the pane
  // that starts there read the same integer, at every size.
  for (const size of [999, 1000, 1001, 1002]) {
    const grid = paneGridFor(4);
    const topLeft = paneBounds(size, size, grid, 0);
    const topRight = paneBounds(size, size, grid, 1);
    const bottomLeft = paneBounds(size, size, grid, 2);
    assert.equal(topLeft.x + topLeft.width, topRight.x);
    assert.equal(bottomLeft.y + bottomLeft.height, topLeft.y);
    assert.equal(topLeft.width + topRight.width, size);
    assert.equal(topLeft.height + bottomLeft.height, size);
    // Unequal by at most a pixel — the honest answer at an odd size, and a
    // guard against a "fix" that quietly rounds both panes the same way.
    assert.ok(Math.abs(topLeft.width - topRight.width) <= 1);
  }
});
