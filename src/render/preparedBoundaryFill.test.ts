/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** The ordinary boundary reuses the ground-edge preparation's fill and contours
 * (2026-10-18, boot CPU): only inside the same construction scope, only when
 * every input matches, and bit for bit what a fresh computation writes. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type * as THREE from 'three';
import { generateLevel } from '../level/generateRoute.ts';
import type { Hazard, LevelPlan } from '../level/plan.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createSwitchbackLevel } from '../level/switchbackLevel.ts';
import { terrainCells } from '../level/terrainCoverage.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { beginConstructionScope } from './constructionScope.ts';
import { groundBoundaryPolicy, groundDrivableCapCells, groundEdgeCapCells,
  groundHazardMask, groundPrecisePatchMask } from './groundBoundaryPolicy.ts';
import { edgeFillForGrid } from './groundBoundary.ts';
import { ordinaryBoundaryAttributes, sameValue } from './ordinaryGroundBoundary.ts';
import { preparedBoundaryFill, recordPreparedBoundaryFill } from './preparedBoundaryFill.ts';
import { withSharedGroundContours } from './sharedGroundContours.ts';
import { prepareSharedGroundEdges } from './sharedGroundEdgePlan.ts';
import { createTerrain } from './terrain.ts';

type Packed = ReturnType<typeof ordinaryBoundaryAttributes>;
function colorsFor(plan: LevelPlan): number[] {
  const vertices = terrainCells(plan).cellsDrawn * 4;
  return Array.from({ length: vertices * 3 }, (_, index) => 0.25 + ((index * 37) % 101) / 200);
}
function bytesOf(packed: Packed): Buffer[] {
  return packed.attributes.map(([, attribute]) => {
    const array = attribute.array as ArrayLike<number> & { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  });
}
function same(a: Packed, b: Packed): boolean {
  if (a.bytes !== b.bytes || a.filledCells !== b.filledCells || a.fillLines !== b.fillLines) return false;
  if (a.attributes.map(([name]) => name).join() !== b.attributes.map(([name]) => name).join()) return false;
  const x = bytesOf(a), y = bytesOf(b);
  return x.every((buffer, index) => buffer.equals(y[index]));
}
function inScope<T>(build: () => T): T {
  const end = beginConstructionScope();
  try { return build(); } finally { end(); }
}
/** Two ways of drawing one plan's boundary with a deliberately wrong (stale)
 * handoff that passes every identity test: the guard is all that refuses it. */
function forceStale(prepared: ReturnType<typeof prepareSharedGroundEdges>, plan: LevelPlan,
  contour: NonNullable<ReturnType<typeof preparedBoundaryFill>>['contour']): void {
  const field = plan.heightfield, cap = groundEdgeCapCells(field.spacing), drawn = terrainCells(plan).bySurface;
  const policy = groundBoundaryPolicy(cap, Math.min(cap, groundDrivableCapCells(field.spacing)));
  const protectedCells = groundPrecisePatchMask(plan, groundHazardMask(plan));
  const original = edgeFillForGrid({ columns: field.columns - 1, rows: field.rows - 1, surfaces: field.surfaces },
    drawn as ReadonlyMap<SurfaceId, readonly number[]>, policy, protectedCells);
  recordPreparedBoundaryFill(prepared, { plan, heightfield: field, surfaces: field.surfaces, columns: field.columns,
    rows: field.rows, spacing: field.spacing, hazards: plan.hazards, patches: plan.groundSurfacePatches,
    drawn, policy, protectedCells, original, contour });
}

const WORLDS: readonly (readonly [string, () => LevelPlan])[] = [
  ['slice', createSliceLevel], ['switchback', createSwitchbackLevel], ['euc', () => generateLevel('euc').plan],
];

test('inside one construction scope the ordinary boundary reuses the preparation, bit for bit', () => {
  for (const [name, make] of WORLDS) {
    const plan = make(), drawn = terrainCells(plan).bySurface, colors = colorsFor(plan);
    const outside = ordinaryBoundaryAttributes(plan, drawn, colors, true);
    const { reused, fresh, handoff, prepared } = inScope(() => {
      const prepared = prepareSharedGroundEdges(plan);
      const handoff = preparedBoundaryFill(prepared);
      return { prepared, handoff, reused: ordinaryBoundaryAttributes(plan, drawn, colors, true, prepared),
        fresh: ordinaryBoundaryAttributes(plan, drawn, colors, true, null) };
    });
    assert.ok(handoff, `${name}: the preparation recorded its fill inside the scope`);
    assert.ok(handoff.contour.cells.size > 0, `${name}: the reused fill is not empty`);
    assert.ok(same(reused, fresh), `${name}: reused attributes equal a fresh computation`);
    assert.ok(same(reused, outside), `${name}: and the historical unscoped call`);
    assert.equal(preparedBoundaryFill(prepared), undefined, `${name}: the scope's end released the handoff`);
    // The reused field is value-equal to a recomputation (no later stage wrote into it).
    const original = edgeFillForGrid({ columns: plan.heightfield.columns - 1, rows: plan.heightfield.rows - 1,
      surfaces: plan.heightfield.surfaces }, drawn as ReadonlyMap<SurfaceId, readonly number[]>,
    handoff.policy, groundPrecisePatchMask(plan, groundHazardMask(plan)));
    assert.deepEqual([...handoff.contour.cells], [...withSharedGroundContours(plan, drawn, original).cells], `${name}: contour unchanged`);
  }
});

test('the full ordinary terrain is identical with and without the handoff', () => {
  for (const [name, make] of WORLDS.slice(0, 2)) {
    const plan = make();
    const build = (handoff: boolean) => {
      // Without: prepared outside any scope, so nothing is recorded for the build.
      const prepared = handoff ? null : prepareSharedGroundEdges(plan);
      return inScope(() => {
        const edges = prepared ?? prepareSharedGroundEdges(plan);
        assert.equal(Boolean(preparedBoundaryFill(edges)), handoff);
        return createTerrain(plan, undefined, undefined, { ordinaryBoundary: true, sharedSurface: true, sharedEdges: edges });
      });
    };
    const a = build(true), b = build(false);
    try {
      const meshes = (view: typeof a) => {
        const out: THREE.Mesh[] = [];
        view.group.traverse(object => { if ((object as THREE.Mesh).isMesh) out.push(object as THREE.Mesh); });
        return out;
      };
      const ma = meshes(a), mb = meshes(b);
      assert.equal(ma.length, mb.length);
      for (let index = 0; index < ma.length; index++) {
        const ga = ma[index].geometry, gb = mb[index].geometry;
        assert.deepEqual(Object.keys(ga.attributes), Object.keys(gb.attributes), `${name}: ${ma[index].name} attributes`);
        for (const key of Object.keys(ga.attributes)) {
          const x = ga.attributes[key].array as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
          const y = gb.attributes[key].array as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
          assert.ok(Buffer.from(x.buffer, x.byteOffset, x.byteLength).equals(Buffer.from(y.buffer, y.byteOffset, y.byteLength)),
            `${name}: ${ma[index].name}.${key} bytes`);
        }
      }
      const report = (view: typeof a) => ({ cellsDrawn: view.cellsDrawn, triangles: view.triangles, recipe: view.recipe,
        ordinaryBoundary: view.ordinaryBoundary, sharedGround: view.sharedGround, sharedEdges: view.sharedEdges });
      assert.deepEqual(report(a), report(b), `${name}: terrain report`);
      assert.ok(a.ordinaryBoundary && a.ordinaryBoundary.filledCells > 0, `${name}: the boundary was drawn`);
    } finally { a.dispose(); b.dispose(); }
  }
});

test('a stale handoff that passes every identity test is used, so the identity tests are what protect', () => {
  const plan = createSliceLevel(), drawn = terrainCells(plan).bySurface, colors = colorsFor(plan);
  inScope(() => {
    const prepared = prepareSharedGroundEdges(plan), handoff = preparedBoundaryFill(prepared)!;
    const fresh = ordinaryBoundaryAttributes(plan, drawn, colors, true, null);
    recordPreparedBoundaryFill(prepared, { ...handoff, contour: { ...handoff.contour, cells: new Map(), lines: 0 } });
    const poisoned = ordinaryBoundaryAttributes(plan, drawn, colors, true, prepared);
    assert.equal(poisoned.filledCells, 0, 'the reuse path is live when the identity matches');
    assert.ok(!same(poisoned, fresh));
  });
});

test('negative controls: a changed input refuses the reuse and matches a fresh computation', () => {
  // Each perturbation is applied after the preparation, inside the same scope.
  const perturbations: [string, (plan: LevelPlan) => void][] = [
    ['a drawn surface changed in place', plan => {
      const surfaces = plan.heightfield.surfaces as SurfaceId[];
      const cell = [...plan.heightfield.surfaces.keys()].find(index => surfaces[index] === 'pavement'
        && surfaces[index + 1] !== 'pavement' && surfaces[index + 1] !== undefined)!;
      surfaces[cell] = surfaces[cell + 1];
    }],
    ['a hazard pushed in place', plan => {
      const field = plan.heightfield;
      const hazards = plan.hazards as Hazard[];
      const cell = terrainCells(plan).bySurface.values().next().value![40];
      const column = cell % (field.columns - 1), row = Math.floor(cell / (field.columns - 1));
      hazards.push({ kind: 'spill', radius: 3, centre: { x: field.originX + (column + 0.5) * field.spacing, y: 0,
        z: field.originZ + (row + 0.5) * field.spacing } } as unknown as Hazard);
    }],
    ['the hazard list replaced', plan => { (plan as { hazards?: Hazard[] }).hazards = [...(plan.hazards ?? [])]; }],
  ];
  for (const [name, perturb] of perturbations) {
    const plan = createSliceLevel();
    // An existing (empty) list, so the in-place push keeps the list's identity
    // and only the protected-mask comparison can see it.
    (plan as { hazards?: Hazard[] }).hazards ??= [];
    inScope(() => {
      const prepared = prepareSharedGroundEdges(plan), stale = preparedBoundaryFill(prepared)!.contour;
      perturb(plan);
      const drawn = terrainCells(plan).bySurface, colors = colorsFor(plan);
      const guarded = ordinaryBoundaryAttributes(plan, drawn, colors, true, prepared);
      const fresh = ordinaryBoundaryAttributes(plan, drawn, colors, true, null);
      assert.ok(same(guarded, fresh), `${name}: refused and computed afresh`);
      if (name !== 'the hazard list replaced') {
        // Known-bad: the same stale fill with the identity forced to match draws something else.
        forceStale(prepared, plan, stale);
        assert.ok(!same(ordinaryBoundaryAttributes(plan, drawn, colors, true, prepared), fresh),
          `${name}: reusing the stale fill would have changed the boundary`);
      }
    });
  }
  // Another world's preparation, an equal clone of this plan, and a different drawn census.
  const plan = createSliceLevel(), clone = structuredClone(plan) as LevelPlan;
  inScope(() => {
    const prepared = prepareSharedGroundEdges(clone);
    const drawn = terrainCells(plan).bySurface, colors = colorsFor(plan);
    recordPreparedBoundaryFill(prepared, { ...preparedBoundaryFill(prepared)!, contour: { ...preparedBoundaryFill(prepared)!.contour, cells: new Map() } });
    assert.ok(same(ordinaryBoundaryAttributes(plan, drawn, colors, true, prepared),
      ordinaryBoundaryAttributes(plan, drawn, colors, true, null)), 'another plan object is never reused');
  });
  inScope(() => {
    const prepared = prepareSharedGroundEdges(plan), handoff = preparedBoundaryFill(prepared)!;
    const drawn = new Map([...terrainCells(plan).bySurface].reverse()), colors = colorsFor(plan);
    recordPreparedBoundaryFill(prepared, { ...handoff, contour: { ...handoff.contour, cells: new Map() } });
    assert.ok(same(ordinaryBoundaryAttributes(plan, drawn, colors, true, prepared),
      ordinaryBoundaryAttributes(plan, drawn, colors, true, null)), 'a reordered drawn census is not the same question');
    assert.ok(same(ordinaryBoundaryAttributes(plan, drawn, colors, false, prepared),
      ordinaryBoundaryAttributes(plan, drawn, colors, false, null)), 'the unshared boundary never reads the handoff');
  });
});

test('the policy identity is by value: Maps and Sets by their entries in order, unknown kinds only by identity', () => {
  // Positive: what the reuse needs — the policy is rebuilt on every call.
  const cap = groundEdgeCapCells(1), policy = groundBoundaryPolicy(cap, Math.min(cap, groundDrivableCapCells(1)));
  assert.notEqual(policy, groundBoundaryPolicy(cap, Math.min(cap, groundDrivableCapCells(1))));
  assert.ok(sameValue(policy, groundBoundaryPolicy(cap, Math.min(cap, groundDrivableCapCells(1)))), 'a rebuilt policy is the same question');
  assert.ok(sameValue(new Map([['a', [1, 2]], ['b', { c: new Set([3]) }]]), new Map([['a', [1, 2]], ['b', { c: new Set([3]) }]])));
  assert.ok(sameValue(new Set([1, 'x', Number.NaN]), new Set([1, 'x', Number.NaN])));
  // Negative controls: two different Maps or Sets are never the same value.
  // (The old comparison saw no own keys on either and called every pair equal.)
  const unequal: [string, unknown, unknown][] = [
    ['Map values', new Map([['a', 1]]), new Map([['a', 2]])],
    ['Map keys', new Map([['a', 1]]), new Map([['b', 1]])],
    ['Map sizes', new Map([['a', 1]]), new Map([['a', 1], ['b', 2]])],
    ['empty and full Maps', new Map(), new Map([['a', 1]])],
    ['Map order', new Map([['a', 1], ['b', 2]]), new Map([['b', 2], ['a', 1]])],
    ['nested Map values', { m: new Map([['a', [1, 2]]]) }, { m: new Map([['a', [1, 3]]]) }],
    ['Set members', new Set([1, 2]), new Set([1, 3])],
    ['Set sizes', new Set([1]), new Set([1, 2])],
    ['Set order', new Set([1, 2]), new Set([2, 1])],
    ['a zero sign in a Map value', new Map([['a', 0]]), new Map([['a', -0]])],
    ['a Map and a Set', new Map([[1, 1]]), new Set([1])],
    ['a Map and a plain object', new Map(), {}],
    ['an array and an object with its keys', [1], { 0: 1 }],
    ['two typed arrays (not looked inside)', new Float64Array([1]), new Float64Array([2])],
    ['typed and plain arrays', new Float64Array([1]), [1]],
    ['two Dates', new Date(0), new Date(1)],
    ['a hole and an undefined', [1, , 3], [1, undefined, 3]],
    ['NaN and a number', [Number.NaN], [0]],
  ];
  for (const [name, a, b] of unequal) {
    assert.equal(sameValue(a, b), false, `${name} compared equal`);
    assert.equal(sameValue(b, a), false, `${name} compared equal (reversed)`);
  }
  // An unknown kind is still equal to itself, so nothing regresses to "never reuse".
  const typed = new Float64Array([1]);
  assert.ok(sameValue({ typed }, { typed }));
});

test('a stale handoff whose policy differs anywhere is refused; a value-equal policy is reused', () => {
  const plan = createSliceLevel(), drawn = terrainCells(plan).bySurface, colors = colorsFor(plan);
  inScope(() => {
    const prepared = prepareSharedGroundEdges(plan), handoff = preparedBoundaryFill(prepared)!;
    const fresh = ordinaryBoundaryAttributes(plan, drawn, colors, true, null);
    const stale = { ...handoff.contour, cells: new Map(), lines: 0 };
    // A clone is equal by value and not by identity: the reuse stays live.
    recordPreparedBoundaryFill(prepared, { ...handoff, policy: structuredClone(handoff.policy), contour: stale });
    assert.equal(ordinaryBoundaryAttributes(plan, drawn, colors, true, prepared).filledCells, 0,
      'a value-equal policy is the same question');
    const changes: [string, (policy: typeof handoff.policy) => typeof handoff.policy][] = [
      ['one surface rank', policy => ({ ...policy, surfaces: policy.surfaces.map((surface, index) =>
        index === 0 ? { ...surface, rank: surface.rank + 1 } : surface) })],
      ['the surface order', policy => ({ ...policy, surfaces: [...policy.surfaces].reverse() })],
      ['a knee share by one ulp', policy => ({ ...policy, kneeLiftShare: policy.kneeLiftShare * (1 + Number.EPSILON) })],
      ['an extra key', policy => ({ ...policy, extra: 0 }) as typeof policy],
    ];
    for (const [name, change] of changes) {
      recordPreparedBoundaryFill(prepared, { ...handoff, policy: change(handoff.policy), contour: stale });
      assert.ok(same(ordinaryBoundaryAttributes(plan, drawn, colors, true, prepared), fresh), `${name}: refused and computed afresh`);
    }
  });
});

test('nothing is recorded or reused outside a scope, and a chamfer-dropping spacing always recomputes', () => {
  const plan = createSliceLevel();
  const prepared = prepareSharedGroundEdges(plan);
  assert.equal(preparedBoundaryFill(prepared), undefined, 'unscoped preparation records nothing');
  inScope(() => assert.equal(preparedBoundaryFill(prepared), undefined, 'nor is it visible to a later scope'));
  // Sparse 3 m cells: boundaryData deletes the unsafe half-cell chamfer that
  // the preparation's own fill keeps, so the two questions differ.
  const sparse = { id: 'sparse-chamfer', spawn: { position: { x: 0, y: 1, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, heightfield: { originX: 0, originZ: 0, columns: 3, rows: 3, spacing: 3,
      heights: Array(9).fill(1), surfaces: ['brick', 'pavement', 'brick', 'brick'] },
    segments: [], checkpoints: [], palette: { brick: 0x3bca69, pavement: 0xb597cd } } as unknown as LevelPlan;
  const drawn = terrainCells(sparse).bySurface, colors = colorsFor(sparse);
  inScope(() => {
    const edges = prepareSharedGroundEdges(sparse), handoff = preparedBoundaryFill(edges)!;
    assert.ok([...handoff.original.cells.values()].some(cell => cell.pocket === 'chamfer'), 'the preparation keeps the chamfer');
    const fresh = ordinaryBoundaryAttributes(sparse, drawn, colors, true, null);
    assert.ok(same(ordinaryBoundaryAttributes(sparse, drawn, colors, true, edges), fresh), 'refused below a half-cell cap');
    // Known-bad: forcing the preparation's contour here would change what is drawn.
    const end = beginConstructionScope();
    try {
      recordPreparedBoundaryFill(edges, { ...handoff, original: { ...handoff.original, capCells: 0.5, drivableCapCells: 0.5 } });
      assert.ok(!same(ordinaryBoundaryAttributes(sparse, drawn, colors, true, edges), fresh),
        'the chamfer guard is what keeps this world exact');
    } finally { end(); }
  });
});
