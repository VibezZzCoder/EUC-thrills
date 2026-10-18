/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** The squirrel corridor's exact triangle prefilter (2026-10-18, boot CPU):
 * the indexed answer equals the original full scan of every non-grass precise
 * paving triangle, including the sign test's degenerate "inside everywhere"
 * cases, the original visit order and its throw behaviour. */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { GroundSurfacePatch, LevelPlan } from '../level/plan.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { WILDLIFE as W } from '../data/tuning.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { corridorIndexShapeForTest, grassCorridorForTest, squirrelSites } from './wildlifePlan.ts';

type Point = { x: number; z: number };
function field(): LevelPlan {
  return { id: 'corridor-index', props: [], segments: [], checkpoints: [], spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    heightfield: { originX: 0, originZ: 0, columns: 41, rows: 41, spacing: 1, heights: new Array(41 * 41).fill(0),
      surfaces: new Array(40 * 40).fill('grass') } } as unknown as LevelPlan;
}
function patchOf(id: string, triangles: readonly (readonly Point[])[], surface = 'pavement'): GroundSurfacePatch {
  return { id, surface, triangles: triangles.map((v, cell) => ({ cell, vertices: v.map(p => ({ x: p.x, y: 0, z: p.z })) })) } as unknown as GroundSurfacePatch;
}
function both(plan: LevelPlan, a: Point, b: Point): boolean {
  const full = grassCorridorForTest(plan, a, b, false), indexed = grassCorridorForTest(plan, a, b, true);
  assert.equal(indexed, full, `indexed corridor ${JSON.stringify([a, b])} disagrees with the full scan`);
  return full;
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

test('the indexed corridor equals the full scan near and far from every kind of real triangle', () => {
  // Precise non-grass paving comes from the living-world preparation, as at boot.
  const worlds: [string, LevelPlan, number][] = [['slice', preparePopulationWorld(createSliceLevel()).level, 100],
    ['euc', preparePopulationWorld(generateLevel('euc').plan).level, 5000]];
  for (const [name, plan, minimum] of worlds) {
    const triangles = (plan.groundSurfacePatches ?? []).filter(p => p.surface !== 'grass').flatMap(p => p.triangles);
    assert.ok(triangles.length >= minimum, `${name} carries ${triangles.length} non-grass precise triangles`);
    const f = plan.heightfield, random = lcg(name.length * 7919);
    let blocked = 0, open = 0;
    for (let probe = 0; probe < 600; probe++) {
      let a: Point;
      if (probe % 3) {
        const t = triangles[Math.floor(random() * triangles.length)], v = t.vertices[Math.floor(random() * 3)];
        // Within, at and just beyond the corridor margin of a real vertex.
        a = { x: v.x + (random() - 0.5) * 2 * (W.groundMarginMetres + 3), z: v.z + (random() - 0.5) * 2 * (W.groundMarginMetres + 3) };
      } else {
        a = { x: f.originX + random() * f.spacing * (f.columns - 1), z: f.originZ + random() * f.spacing * (f.rows - 1) };
      }
      const angle = random() * Math.PI * 2, length = random() * 4;
      if (both(plan, a, { x: a.x + Math.sin(angle) * length, z: a.z + Math.cos(angle) * length })) open++; else blocked++;
    }
    assert.ok(blocked > 50 && open > 50, `${name} probes exercise both answers (${blocked} blocked, ${open} open)`);
  }
});

test('degenerate, collinear, non-finite and sliver triangles far away keep blocking exactly as before', () => {
  const a = { x: 20, z: 20 }, b = { x: 21, z: 20.5 };
  const cases: [string, readonly Point[], boolean][] = [
    // All three vertices on one point: every sign is zero, so the old test calls any point inside.
    ['coincident', [{ x: 2, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 2 }], false],
    // Collinear on z = 20: the corridor end on that line, 15 m beyond the triangle, is "inside".
    ['collinear on the line', [{ x: 1, z: 20 }, { x: 2, z: 20 }, { x: 4, z: 20 }], false],
    ['collinear off the line', [{ x: 1, z: 2 }, { x: 2, z: 2 }, { x: 4, z: 2 }], true],
    ['non-finite', [{ x: Number.NaN, z: 3 }, { x: 4, z: 3 }, { x: 4, z: 5 }], false],
    ['huge', [{ x: 1e6, z: 1e6 }, { x: 1e6 + 1, z: 1e6 }, { x: 1e6, z: 1e6 + 1 }], true],
    ['sliver', [{ x: 1, z: 20 }, { x: 4, z: 20 + 1e-9 }, { x: 7, z: 20 }], true],
    ['ordinary far', [{ x: 2, z: 2 }, { x: 4, z: 2 }, { x: 2, z: 4 }], true],
    ['ordinary under', [{ x: 19, z: 19 }, { x: 23, z: 19 }, { x: 19, z: 23 }], false],
  ];
  for (const [name, vertices, expected] of cases) {
    const plan = field();
    (plan as { groundSurfacePatches?: GroundSurfacePatch[] }).groundSurfacePatches = [patchOf(name, [vertices])];
    assert.equal(both(plan, a, b), expected, name);
  }
  // Known-bad control: a plain AABB prefilter (no degenerate list) would skip
  // the far coincident triangle and answer "open"; the original answers "blocked".
  const plan = field();
  (plan as { groundSurfacePatches?: GroundSurfacePatch[] }).groundSurfacePatches = [patchOf('coincident', [[{ x: 2, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 2 }]])];
  const withoutPatches = { ...plan, groundSurfacePatches: [] } as LevelPlan;
  assert.equal(grassCorridorForTest(withoutPatches, a, b, true), true, 'the corridor is open without the far triangle');
  assert.equal(grassCorridorForTest(plan, a, b, true), false, 'the far degenerate triangle still blocks it');
});

test('grass patches are ignored, the visit order and the original throw behaviour are kept', () => {
  const a = { x: 20, z: 20 }, b = { x: 21, z: 20 };
  const plan = field();
  const touching = [{ x: 19, z: 19 }, { x: 23, z: 19 }, { x: 19, z: 23 }];
  (plan as { groundSurfacePatches?: GroundSurfacePatch[] }).groundSurfacePatches = [patchOf('lawn', [touching], 'grass')];
  assert.equal(both(plan, a, b), true, 'a grass patch never blocks');
  // A malformed triangle after a blocking one is never reached by either path.
  const malformed = { id: 'bad', surface: 'pavement', triangles: [{ cell: 0, vertices: null }] } as unknown as GroundSurfacePatch;
  (plan as { groundSurfacePatches?: GroundSurfacePatch[] }).groundSurfacePatches = [patchOf('first', [touching]), malformed];
  assert.equal(both(plan, a, b), false);
  // Reached first (nothing earlier blocks), both paths throw the same way.
  (plan as { groundSurfacePatches?: GroundSurfacePatch[] }).groundSurfacePatches = [malformed, patchOf('later', [touching])];
  assert.throws(() => grassCorridorForTest(plan, a, b, false), TypeError);
  assert.throws(() => grassCorridorForTest(plan, a, b, true), TypeError);
  // A list of an unexpected shape falls back to the original loop.
  (plan as { groundSurfacePatches?: unknown }).groundSurfacePatches = [null];
  assert.throws(() => grassCorridorForTest(plan, a, b, false), TypeError);
  assert.throws(() => grassCorridorForTest(plan, a, b, true), TypeError);
  // Corridor ends beyond the proof's coordinate limit use the full scan too.
  (plan as { groundSurfacePatches?: GroundSurfacePatch[] }).groundSurfacePatches = [patchOf('far', [touching])];
  both(plan, { x: 2e5, z: 0 }, { x: 2e5 + 1, z: 0 });
});

test('a triangle too wide to file is asked on every query, in order, and answers exactly as the full scan', () => {
  // Regular (finite, inside the limit, well shaped) but spanning the whole
  // coordinate range: filed bucket by bucket it would take ~1.6e8 entries.
  const wide = [{ x: -1e5, z: -1e5 }, { x: 1e5, z: -1e5 }, { x: -1e5, z: 1e5 }];
  // Big but far: its hypotenuse x + z = -150 runs well clear of the corridors below.
  const far = [{ x: -1000, z: 850 }, { x: 850, z: -1000 }, { x: -1000, z: -1000 }];
  const near = [{ x: 19, z: 19 }, { x: 23, z: 19 }, { x: 19, z: 23 }];
  const plan = field();
  (plan as { groundSurfacePatches?: GroundSurfacePatch[] }).groundSurfacePatches = [patchOf('small', [near]),
    patchOf('far', [far]), patchOf('wide', [wide])];
  const shape = corridorIndexShapeForTest(plan)!;
  assert.deepEqual(shape.always, [1, 2], 'the two wide triangles are always asked');
  assert.ok(shape.filed <= 4, `only the small triangle is filed (${shape.filed} entries)`);
  // The field-wide triangle covers the half-plane x + z <= 0 of the field.
  assert.equal(both(plan, { x: -30, z: -30 }, { x: -31, z: -30.5 }), false, 'inside the wide triangle');
  assert.equal(both(plan, { x: 30, z: 30 }, { x: 31, z: 30.5 }), true, 'clear of every triangle');
  (plan as { groundSurfacePatches?: GroundSurfacePatch[] }).groundSurfacePatches = [patchOf('small', [near]), patchOf('far', [far])];
  assert.equal(both(plan, { x: 30, z: 30 }, { x: 31, z: 30.5 }), true, 'the far wide triangle does not block');
  assert.equal(both(plan, { x: 20, z: 20 }, { x: 21, z: 20.5 }), false, 'the small one still does');
  // Probes on both sides of, and on, the far triangle's long edge (x + z = -150).
  const random = lcg(4242);
  let blocked = 0, open = 0;
  for (let probe = 0; probe < 300; probe++) {
    const t = random() * 1800 - 900, offset = (random() - 0.5) * 2 * (W.groundMarginMetres + 2);
    const a = { x: t + offset / Math.SQRT2, z: -150 - t + offset / Math.SQRT2 };
    const angle = random() * Math.PI * 2, length = random() * 4;
    if (both(plan, a, { x: a.x + Math.sin(angle) * length, z: a.z + Math.cos(angle) * length })) open++; else blocked++;
  }
  assert.ok(blocked > 30 && open > 30, `the edge probes exercise both answers (${blocked} blocked, ${open} open)`);
  // An ordinary world files everything: nothing in it is that wide.
  const euc = preparePopulationWorld(generateLevel('euc').plan).level;
  const triangles = (euc.groundSurfacePatches ?? []).filter(p => p.surface !== 'grass').flatMap(p => p.triangles).length;
  const ordinary = corridorIndexShapeForTest(euc)!;
  assert.ok(ordinary.filed >= triangles - ordinary.always.length, `euc files its regular triangles (${ordinary.filed} entries)`);
});

test('squirrel admission is deterministic and read-only with the index', () => {
  const plan = preparePopulationWorld(createSliceLevel()).level, before = JSON.stringify(plan);
  const sites = squirrelSites(plan);
  assert.ok(sites.length > 0, 'the slice admits squirrels');
  assert.deepEqual(squirrelSites(plan), sites);
  assert.equal(JSON.stringify(plan), before);
});
