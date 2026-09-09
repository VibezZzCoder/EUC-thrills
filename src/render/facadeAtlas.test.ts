/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  FACADE_ATLAS_SIZE,
  FACADE_PAGES,
  FACADE_PAGE_GUTTER,
  FACADE_PAGE_IDS,
  facadePageLuminance,
  paintFacadeAtlas,
  type FacadeAtlas,
  type FacadePageId,
} from './facadeAtlas.ts';

/**
 * The painted facade atlas.
 *
 * `render/facadeAtlas.ts` imports nothing, so all of this runs at `node --test`
 * with no canvas, no WebGL, and no DOM — the only reason a building's skin gets
 * tested at all rather than judged by eye in a screenshot.
 *
 * What a test can prove here is determinism, bounds, and the layout contract:
 *
 * - The buffer is deterministic (`DESIGN.md` §4 rule 3): a facade that differs
 *   between boots makes every visual regression capture meaningless.
 * - Every page lands in its luminance band, and nothing on the sheet is dark
 *   enough to push the darkest building tone under the legibility floor.
 * - The gutters are edge-extended, so a mip chain never averages one page
 *   into its neighbour.
 *
 * Whether the result reads as a building at 40 m is a browser judgement at
 * gameplay scale and always will be.
 */

/** `BUILDING_FACADE.glassTint`, restated so this file depends on nothing but the atlas. */
const GLASS_TINT = { r: 0.42, g: 0.46, b: 0.58 } as const;

const GLASS_PAGES: readonly FacadePageId[] = ['glass', 'glassLow', 'glassTall'];
const GROUND_PAGES: readonly FacadePageId[] = ['ground', 'groundLow', 'groundTall'];

/** The layout, restated independently of the module: 2 columns × 4 rows of cells, in `FACADE_PAGE_IDS` order. */
const COLUMNS = 2;
const ROWS = 4;
const CELL_WIDTH = FACADE_ATLAS_SIZE / COLUMNS;
const CELL_HEIGHT = FACADE_ATLAS_SIZE / ROWS;

/** A page's interior in texels, from its UV rect. */
function interior(page: FacadePageId): { x0: number; y0: number; x1: number; y1: number } {
  const rect = FACADE_PAGES[page];
  return {
    x0: Math.round(rect.u0 * FACADE_ATLAS_SIZE),
    y0: Math.round(rect.v0 * FACADE_ATLAS_SIZE),
    x1: Math.round(rect.u1 * FACADE_ATLAS_SIZE),
    y1: Math.round(rect.v1 * FACADE_ATLAS_SIZE),
  };
}

function texel(atlas: FacadeAtlas, x: number, y: number): [number, number, number, number] {
  const i = (y * atlas.size + x) * 4;
  return [atlas.data[i], atlas.data[i + 1], atlas.data[i + 2], atlas.data[i + 3]];
}

/** The sRGB byte at a page-relative UV, `(0, 0)` the page's bottom-left. */
function sample(atlas: FacadeAtlas, page: FacadePageId, u: number, v: number): [number, number, number, number] {
  const box = interior(page);
  const x = box.x0 + Math.min(box.x1 - box.x0 - 1, Math.floor((box.x1 - box.x0) * u));
  const y = box.y0 + Math.min(box.y1 - box.y0 - 1, Math.floor((box.y1 - box.y0) * v));
  return texel(atlas, x, y);
}

const ATLAS = paintFacadeAtlas({ glassTint: GLASS_TINT });

test('the atlas is a 512-square RGBA8 sheet, opaque everywhere', () => {
  assert.equal(ATLAS.size, FACADE_ATLAS_SIZE);
  assert.equal(ATLAS.size, 512);
  assert.equal(ATLAS.data.length, ATLAS.size * ATLAS.size * 4);
  // Opaque by construction: the facade material has no alpha path, and a
  // texel that was not 255 here would be a hole in a wall.
  for (let i = 3; i < ATLAS.data.length; i += 4) {
    if (ATLAS.data[i] !== 255) assert.fail(`alpha ${ATLAS.data[i]} at byte ${i}`);
  }
});

test('two paints of the same options are byte-identical', () => {
  const again = paintFacadeAtlas({ glassTint: GLASS_TINT });
  assert.ok(Buffer.from(ATLAS.data).equals(Buffer.from(again.data)));
});

test('plain is exactly 255 everywhere — an untouched wall', () => {
  // The page a caller maps onto anything it wants left alone; "left alone"
  // has to mean byte-for-byte 255, gutter included, or a roof wearing it is
  // a different colour from a roof with no map at all.
  const box = interior('plain');
  for (let y = box.y0 - FACADE_PAGE_GUTTER; y < box.y1 + FACADE_PAGE_GUTTER; y += 1) {
    for (let x = box.x0 - FACADE_PAGE_GUTTER; x < box.x1 + FACADE_PAGE_GUTTER; x += 1) {
      const [r, g, b] = texel(ATLAS, x, y);
      if (r !== 255 || g !== 255 || b !== 255) assert.fail(`plain is (${r}, ${g}, ${b}) at (${x}, ${y})`);
    }
  }
  const stats = facadePageLuminance(ATLAS, 'plain');
  assert.equal(stats.min, 1);
  assert.equal(stats.max, 1);
});

test('every page lands in its luminance band', () => {
  // Glass in [0.35, 0.60]: the tint's own luminance is about 0.46, the piers
  // pull the mean up and the body, sill and mullions pull it down; outside
  // the band the strip is either a wall with a stain on it or a black slot.
  for (const page of GLASS_PAGES) {
    const { mean } = facadePageLuminance(ATLAS, page);
    assert.ok(mean >= 0.35 && mean <= 0.6, `${page} mean ${mean.toFixed(3)}`);
  }
  // Spandrel near-white: it is the wall between window rows, and darkening
  // it breaks the storey rhythm the glass strips are there to set.
  const spandrel = facadePageLuminance(ATLAS, 'spandrel');
  assert.ok(spandrel.mean >= 0.9, `spandrel mean ${spandrel.mean.toFixed(3)}`);
  // Ground floors in [0.55, 0.95]: a plinth and a door darker than the body
  // but nowhere near a void.
  for (const page of GROUND_PAGES) {
    const { mean } = facadePageLuminance(ATLAS, page);
    assert.ok(mean >= 0.55 && mean <= 0.95, `${page} mean ${mean.toFixed(3)}`);
  }
});

test('no texel is darker than 0.13 linear: 0.235 (the darkest building tone) × 0.13 = 0.0306 stays above the 0.03 legibility floor', () => {
  // `DESIGN.md` §2 forbids a material under 0.03 linear luminance; below it
  // ACES crushes the surface to a silhouette. The map multiplies the block's
  // tone, and the darkest block the tuning table ships is about 0.235, so a
  // texel under 0.13 would take that block through the floor.
  for (const page of FACADE_PAGE_IDS) {
    const { min } = facadePageLuminance(ATLAS, page);
    assert.ok(min >= 0.13, `${page} min ${min.toFixed(3)}`);
    assert.ok(min * 0.235 > 0.03, `${page} × darkest tone = ${(min * 0.235).toFixed(4)}`);
  }
});

test('page rects are disjoint, inside [0, 1], and inset from their 2×4 cells by exactly the gutter', () => {
  assert.equal(FACADE_PAGE_IDS.length, COLUMNS * ROWS);
  assert.deepEqual(Object.keys(FACADE_PAGES).sort(), [...FACADE_PAGE_IDS].sort());

  FACADE_PAGE_IDS.forEach((page, index) => {
    const rect = FACADE_PAGES[page];
    assert.ok(rect.u0 >= 0 && rect.u1 <= 1 && rect.v0 >= 0 && rect.v1 <= 1, `${page} outside [0, 1]`);
    assert.ok(rect.u0 < rect.u1 && rect.v0 < rect.v1, `${page} is empty`);

    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const box = interior(page);
    assert.equal(box.x0, column * CELL_WIDTH + FACADE_PAGE_GUTTER, `${page} left`);
    assert.equal(box.x1, (column + 1) * CELL_WIDTH - FACADE_PAGE_GUTTER, `${page} right`);
    assert.equal(box.y0, row * CELL_HEIGHT + FACADE_PAGE_GUTTER, `${page} bottom`);
    assert.equal(box.y1, (row + 1) * CELL_HEIGHT - FACADE_PAGE_GUTTER, `${page} top`);
  });

  for (const a of FACADE_PAGE_IDS) {
    for (const b of FACADE_PAGE_IDS) {
      if (a === b) continue;
      const ra = FACADE_PAGES[a];
      const rb = FACADE_PAGES[b];
      const overlap = ra.u0 < rb.u1 && rb.u0 < ra.u1 && ra.v0 < rb.v1 && rb.v0 < ra.v1;
      assert.ok(!overlap, `${a} overlaps ${b}`);
    }
  }
});

test('every gutter texel is a copy of the nearest interior texel, on all four sides', () => {
  // Edge extension is what keeps a mip level from averaging a page with its
  // neighbour. Walk every texel of every cell — interior, four sides, four
  // corners — and require it to equal the interior texel it clamps to.
  FACADE_PAGE_IDS.forEach((page, index) => {
    const box = interior(page);
    const cellX = (index % COLUMNS) * CELL_WIDTH;
    const cellY = Math.floor(index / COLUMNS) * CELL_HEIGHT;
    let gutterTexels = 0;
    for (let y = cellY; y < cellY + CELL_HEIGHT; y += 1) {
      const sy = Math.min(box.y1 - 1, Math.max(box.y0, y));
      for (let x = cellX; x < cellX + CELL_WIDTH; x += 1) {
        const sx = Math.min(box.x1 - 1, Math.max(box.x0, x));
        if (sx === x && sy === y) continue;
        gutterTexels += 1;
        const got = texel(ATLAS, x, y);
        const want = texel(ATLAS, sx, sy);
        if (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2]) {
          assert.fail(`${page} gutter (${x}, ${y}) = ${got} but interior (${sx}, ${sy}) = ${want}`);
        }
      }
    }
    // The gutter is the cell minus the interior; if this is wrong the walk
    // above skipped a side.
    const interiorTexels = (box.x1 - box.x0) * (box.y1 - box.y0);
    assert.equal(gutterTexels, CELL_WIDTH * CELL_HEIGHT - interiorTexels, `${page} gutter count`);
  });
});

test('glass groups are blue-shifted: b > g > r at the centre of a group', () => {
  // Where a group's centre falls, from the pier layout each page declares:
  // `glass` has three equal groups about four piers, so the middle group is
  // centred on u = 0.5; `glassLow` has two groups either side of a central
  // pier, so the left group is centred near u = 0.25; `glassTall` has four
  // groups, the second of which is centred near u = 0.38; the tower lobby has
  // three groups, the middle one at u = 0.5, between plinth and lintel.
  const samples: readonly [FacadePageId, number, number][] = [
    ['glass', 0.5, 0.5],
    ['glassLow', 0.25, 0.5],
    ['glassTall', 0.38, 0.5],
    ['groundTall', 0.5, 0.6],
  ];
  for (const [page, u, v] of samples) {
    const [r, g, b] = sample(ATLAS, page, u, v);
    assert.ok(b > g && g > r, `${page} at (${u}, ${v}) is (${r}, ${g}, ${b})`);
  }
  // And a pier is not: the wall tone, grey. `glassLow`'s central pier sits
  // exactly on u = 0.5.
  const [pr, pg, pb] = sample(ATLAS, 'glassLow', 0.5, 0.5);
  assert.ok(pr === pg && pg === pb, `glassLow pier is (${pr}, ${pg}, ${pb})`);
});

test('the module imports nothing', () => {
  // The whole reason the sheet is testable here. One `import` and the atlas
  // needs whatever that module needs — three, a DOM — and the suite is back
  // to judging facades by screenshot.
  const source = readFileSync(fileURLToPath(new URL('./facadeAtlas.ts', import.meta.url)), 'utf8');
  assert.ok(!/^\s*import\b/m.test(source), 'found an import statement');
  assert.ok(!/\bimport\s*\(/.test(source), 'found a dynamic import');
  assert.ok(!/\brequire\s*\(/.test(source), 'found a require');
  // And none of the things the file comment forswears — as *calls*, since the
  // comment names them in order to forswear them.
  assert.ok(!/Math\.random\s*\(/.test(source), 'found a Math.random call');
  assert.ok(!/\b(?:fillText|getContext|createElement)\s*\(/.test(source), 'found a canvas call');
});

test('a different glassTint changes the glass page and leaves the spandrel alone', () => {
  // The mutation check: proves the tint is actually wired to the glass, and
  // only to the glass. A spandrel that moved with the tint would mean a wall
  // was being painted as a window somewhere.
  const other = paintFacadeAtlas({ glassTint: { r: 0.58, g: 0.46, b: 0.42 } });

  const glass = interior('glass');
  let changed = 0;
  for (let y = glass.y0; y < glass.y1; y += 1) {
    for (let x = glass.x0; x < glass.x1; x += 1) {
      const a = texel(ATLAS, x, y);
      const b = texel(other, x, y);
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) changed += 1;
    }
  }
  assert.ok(changed > 0, 'glass did not change with the tint');

  const spandrel = interior('spandrel');
  for (let y = spandrel.y0; y < spandrel.y1; y += 1) {
    for (let x = spandrel.x0; x < spandrel.x1; x += 1) {
      const a = texel(ATLAS, x, y);
      const b = texel(other, x, y);
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) assert.fail(`spandrel moved at (${x}, ${y})`);
    }
  }

  // The swapped tint is red-shifted, and the page follows it.
  const [r, g, b] = sample(other, 'glass', 0.5, 0.5);
  assert.ok(r > g && g > b, `swapped glass is (${r}, ${g}, ${b})`);
});

test('a glassTint channel outside (0, 1] is refused rather than clipped', () => {
  // A multiplier above 1.0 cannot be stored in a byte; clipping it would ship
  // a glass colour silently different from the tuning table's. Zero or below
  // is a black window, the void the pages exist to avoid.
  assert.throws(() => paintFacadeAtlas({ glassTint: { r: 1.2, g: 0.46, b: 0.58 } }), RangeError);
  assert.throws(() => paintFacadeAtlas({ glassTint: { r: 0.42, g: 0, b: 0.58 } }), RangeError);
});
