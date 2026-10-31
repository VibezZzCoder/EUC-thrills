/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createLevel } from '../level/levels.ts';
import { createSkateparkLevel } from '../level/skateparkLevel.ts';
import { buildYardScenery, drawnHeight } from '../level/yardScenery.ts';

/**
 * 1.4.0 critic pass 1: Foundry Yard's render-only scenery mesh
 * (`level/yardScenery.ts`) — the floor's joints and stains, the pool coping,
 * the poured snake lips, the coping skirt and the face paint. Pure geometry,
 * so what this file pins is where it may lie and how it is lit.
 */

const yard = createSkateparkLevel();
const scenery = buildYardScenery(yard)!;
const field = yard.heightfield;
const triangles = scenery.positions.length / 9;

const vertex = (t: number, k: number): [number, number, number] => {
  const i = (t * 3 + k) * 3;
  return [scenery.positions[i], scenery.positions[i + 1], scenery.positions[i + 2]];
};
const colour = (t: number, k: number): [number, number, number] => {
  const i = (t * 3 + k) * 3;
  return [scenery.colours[i], scenery.colours[i + 1], scenery.colours[i + 2]];
};
const srgbToLinear = (hex: number): number[] => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff].map((v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
/** The floor's own albedo: joints and stains are darker than it, the pale bands lighter. */
const FLOOR = srgbToLinear(0x8a8984);
/** The coping steel: the pipe is half sunk in the deck by design. */
const STEEL = srgbToLinear(0xb6babd);
/** The skirt under it: the yard's concrete at a rim sample's share of the face shade (critic pass 2, F1). */
const SKIRT = FLOOR.map((value) => value * (1 - (1 - 0.78) * 0.4));
const same = (c: readonly number[], d: readonly number[]): boolean => c.every((value, axis) => Math.abs(value - d[axis]) < 1e-6);
const isSteel = (c: readonly number[]): boolean => same(c, STEEL) || same(c, SKIRT);
const normal = (t: number, k: number): [number, number, number] => {
  const i = (t * 3 + k) * 3;
  return [scenery.normals[i], scenery.normals[i + 1], scenery.normals[i + 2]];
};

test('every triangle is wound toward its own normals (the material is double-sided)', () => {
  // A back face is lit with its normal flipped: the first floor stains,
  // wound the other way, drew near-black under the sun.
  let checked = 0;
  for (let t = 0; t < triangles; t += 1) {
    const [a, b, c] = [vertex(t, 0), vertex(t, 1), vertex(t, 2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.hypot(cross[0], cross[1], cross[2]);
    if (area < 1e-10) continue;
    const n = [0, 1, 2].map((axis) => normal(t, 0)[axis] + normal(t, 1)[axis] + normal(t, 2)[axis]);
    assert.ok(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] >= 0, `triangle ${t} faces away from its normals`);
    checked += 1;
  }
  assert.ok(checked > triangles * 0.95);
});

test('the floor joints and stains lie only over floor at exactly 0, a few millimetres up', () => {
  let floorVertices = 0;
  for (let t = 0; t < triangles; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const [x, y, z] = vertex(t, k);
      const n = normal(t, k);
      if (n[1] !== 1 || y <= 0 || y >= 0.012 || colour(t, k)[0] > FLOOR[0] + 1e-6) continue;
      floorVertices += 1;
      // Inside the riding area, over drawn floor at 0, under the 1 cm a wheel would notice.
      assert.ok(x >= 88 && x <= 167.5 && z >= 96.25 && z <= 168, `a floor mark at ${x}, ${z} is outside the yard`);
      assert.equal(drawnHeight(field, x, z), 0, `a floor mark at ${x}, ${z} floats over a feature`);
    }
  }
  assert.ok(floorVertices > 500, `${floorVertices} floor-mark vertices`);
});

test('no face paint or poured lip digs into the drawn face it lies on', () => {
  // Face paint and poured-lip bands sit on the drawn surface (lifted along
  // its normal by 1.2–5 cm); the skirt reaches 1 cm into it, no further.
  let painted = 0;
  for (let t = 0; t < triangles; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const [x, y, z] = vertex(t, k);
      const n = normal(t, k);
      // Paint on a transition face: a normal that is neither flat nor level.
      if (Math.abs(n[1]) < 0.05 || Math.abs(n[1]) > 0.99 || isSteel(colour(t, k))) continue;
      if (x < 88 || x > 167.5 || z < 96.25 || z > 168) continue;
      const ground = drawnHeight(field, x, z);
      painted += 1;
      assert.ok(y >= ground - 0.011, `paint at ${x}, ${y}, ${z} is under the face at ${ground}`);
    }
  }
  assert.ok(painted > 1_000, `${painted} face-paint vertices`);
});

test('the galvanised fence is a tone only the yard carries', () => {
  // `render/props.ts` takes a prop's `tone` in place of its parts' albedo;
  // before 1.4.0 only buildings carried one (and never reach that path), so
  // every shipped world draws its props exactly as it did.
  const bays = (yard.props ?? []).filter((prop) => prop.kind === 'fenceBay');
  assert.equal(bays.length, 128);
  assert.ok(bays.every((prop) => prop.tone === 0x8f9599));
  for (const id of ['slice', 'proving', 'track', 'switchback', 'euclaude'] as const) {
    const plan = createLevel(id);
    for (const prop of plan.props ?? []) {
      if (prop.kind !== 'building') assert.equal(prop.tone, undefined, `${id} tones a ${prop.kind}`);
    }
    assert.equal(buildYardScenery(plan), null, id);
  }
});

// ---------------------------------------------------------------------------
// Critic pass 2
// ---------------------------------------------------------------------------

test('the skirt wears the wall top\'s concrete, lit half from above (F1)', () => {
  let skirt = 0;
  for (let t = 0; t < triangles; t += 1) {
    if (!same(colour(t, 0), SKIRT)) continue;
    skirt += 1;
    const n = normal(t, 0);
    assert.ok(Math.abs(n[1] - Math.SQRT1_2) < 1e-6, `a skirt normal ${n}`);
  }
  assert.ok(skirt > 50, `${skirt} skirt triangles`);
  // And no dark steel skirt is left anywhere.
  const old = srgbToLinear(0xa9aeb2).map((value) => value * 0.62);
  for (let t = 0; t < triangles; t += 1) assert.ok(!same(colour(t, 0), old), `triangle ${t} is the old dark skirt`);
});

test('a damp or oil stain fades into the floor at its rim (R6/F8)', () => {
  // Some floor triangle mixes the floor's own colour with a darker one: the
  // fan from a stain's centre to its floor-coloured rim.
  let fading = 0;
  for (let t = 0; t < triangles; t += 1) {
    const [a, b, c] = [colour(t, 0), colour(t, 1), colour(t, 2)];
    if (normal(t, 0)[1] !== 1 || vertex(t, 0)[1] > 0.012) continue;
    if (a[0] < FLOOR[0] - 1e-3 && same(b, FLOOR) && same(c, FLOOR)) fading += 1;
  }
  assert.ok(fading > 200, `${fading} fading stain triangles`);
});

test('each kicker\'s ride face is painted solid down to its toe plate, and its lip striped (K1/F3/R5)', () => {
  const cobalt = srgbToLinear(0x3557a6);
  for (const [foot, minZ, maxZ] of [[124.5, 120.8, 127.2], [128.5, 136.85, 140.35]]) {
    // Painted vertices on the face: bluer than red, over the face's whole run.
    let lowX = Infinity, highX = -Infinity, lowZ = Infinity, highZ = -Infinity;
    for (let t = 0; t < triangles; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        const [x, , z] = vertex(t, k);
        const c = colour(t, k);
        if (x < foot - 0.5 || x > foot + 2 || z < minZ - 1 || z > maxZ + 1) continue;
        if (!(c[2] > c[0] * 1.8 && Math.abs(c[2] - (cobalt[2] * 0.7 + FLOOR[2] * 0.3)) < 0.02)) continue;
        lowX = Math.min(lowX, x); highX = Math.max(highX, x); lowZ = Math.min(lowZ, z); highZ = Math.max(highZ, z);
      }
    }
    assert.ok(lowX <= foot + 0.01 && highX >= foot + 1.5, `the paint spans x ${lowX}..${highX}`);
    assert.ok(Math.abs(lowZ - (minZ + 0.1)) < 1e-3 && Math.abs(highZ - (maxZ - 0.1)) < 1e-3, `the paint spans z ${lowZ}..${highZ}`);
  }
  // The lip stripe: on each lip block's top, toward the back, 5 mm over it.
  const ochre = srgbToLinear(0xc8892f);
  let stripe = 0;
  for (let t = 0; t < triangles; t += 1) {
    if (!same(colour(t, 0), ochre)) continue;
    for (let k = 0; k < 3; k += 1) {
      const [x, y] = vertex(t, k);
      assert.ok(Math.abs(y - 0.305) < 1e-5 && ((x >= 126.15 - 1e-4 && x <= 126.45 + 1e-4) || (x >= 130.15 - 1e-4 && x <= 130.45 + 1e-4)),
        `a stripe vertex at ${x}, ${y}`);
    }
    stripe += 1;
  }
  assert.equal(stripe, 4);
});

test('pool coping is laid in blocks, and the pyramid wears its crest lines (R4/K2/K3)', () => {
  // Grout joints: the pale band's colour at 0.6, a millimetre over the band.
  const grout = srgbToLinear(0xbfbcb3).map((value) => value * 0.6);
  let joints = 0;
  for (let t = 0; t < triangles; t += 1) if (same(colour(t, 0), grout)) joints += 1;
  assert.ok(joints > 2 * 100, `${joints / 2} grout joints`);
  // The crest lines: a band level on the pyramid's 0.60 top, on all four sides.
  const sides = new Set<string>();
  for (let t = 0; t < triangles; t += 1) {
    const [a, b, c] = [vertex(t, 0), vertex(t, 1), vertex(t, 2)];
    const [x, y, z] = [0, 1, 2].map((axis) => (a[axis] + b[axis] + c[axis]) / 3);
    if (Math.abs(y - 0.605) > 1e-5 || normal(t, 0)[1] !== 1) continue;
    if (x < 114 || x > 118 || z < 138 || z > 142) continue;
    sides.add(x < 114.7 ? 'w' : x > 117.3 ? 'e' : z < 138.7 ? 'n' : 's');
  }
  assert.deepEqual([...sides].sort(), ['e', 'n', 's', 'w']);
});

test('QA APP-1: the terrain view counts the yard mesh, so level.triangles is what the group draws', async () => {
  const { createTerrain } = await import('./terrain.ts');
  const { measureObject } = await import('./renderCost.ts');
  const { yardSceneryTriangles } = await import('../level/yardScenery.ts');
  const view = createTerrain(createLevel('skatepark'));
  try {
    assert.ok(yardSceneryTriangles(yard) > 0);
    assert.equal(measureObject(view.group).triangles, view.triangles);
  } finally {
    view.dispose();
  }
});
