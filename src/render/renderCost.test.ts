/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  LEVEL_GEOMETRY_COST,
  LIBRARY_MAX_DRAW_CALLS,
  NON_LEVEL_RESERVE,
  PART_COSTS,
  PROP_PART_IDS,
  QUAD_NON_LEVEL_RESERVE,
  QUAD_PASSES,
  RENDER_BUDGET_QUAD,
  RENDER_BUDGET,
  RENDER_BUDGET_SPLIT,
  SPLIT_NON_LEVEL_RESERVE,
  SPLIT_PASSES,
  propPartCounts,
  type PropPartId,
} from '../data/renderCost.ts';
import { PROP_KINDS } from '../data/props.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan } from '../level/plan.ts';
import {
  planRenderCost,
  withinRenderBudget,
  withinQuadRenderBudget,
  withinSplitRenderBudget,
} from '../level/renderBudget.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { terrainCells } from '../level/terrainCoverage.ts';
import {
  categoryOf,
  chaseRooms,
  chaseRoomViews,
  headlessUltraContext,
  measureChaseRoomScene,
  measureCopRig,
  measureLevelScene,
  measureNonLevelScene,
  measurePartTriangles,
  measurePropKinds,
  measureQuadNonLevelScene,
  measureSeatRig,
  measureSplitNonLevelScene,
  modelInstancedPackReserve,
  playableSubsets,
  type SceneCost,
} from './renderCost.ts';
import { createCopRider } from './copRider.ts';
import { CHASE } from '../data/tuning.ts';
import { COP_LOOK } from './riderLook.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION } from './presentation.ts';
import { PLAYABLE_RIDER_LOOKS } from './riderLook.ts';
import { ULTRA_FULL, ULTRA_LADDER, ULTRA_LIT } from './ultra/ultraRecipe.ts';

/**
 * The render-cost model, regenerated from the built scene — M12 Phase 0.
 *
 * `docs/PLANS.md` §12 records the top render risk for this milestone as **the
 * cost model drifting from reality**, and names the mitigation: regenerate the
 * table from the built scene in tests rather than hand-maintaining it. This is
 * that test. Every number in `src/data/renderCost.ts` is measured here from the
 * scene `render/terrain.ts` and `render/props.ts` actually build, and every
 * prediction `level/renderBudget.ts` makes is compared against it.
 *
 * The comparison is **exact, not approximate**. A model that is allowed to be
 * within a few per cent is a model that can be wrong by a few per cent in the
 * direction that matters, and there is no reason to accept that here: the plan
 * contains every prop, every collider and every cell, so the prediction and the
 * measurement are two ways of counting the same finite set.
 *
 * Draw calls, triangles, instance counts and GPU object counts are reportable
 * evidence. A frame interval is not (`AGENTS.md`), and nothing here times
 * anything.
 */

const slice = createSliceLevel();
const proving = createProvingGround();

// ---------------------------------------------------------------------------
// The model against the built scene
// ---------------------------------------------------------------------------

for (const [name, plan] of [['the slice', slice], ['the proving ground', proving]] as const) {
  test(`${name}: the predicted render cost is the measured render cost`, () => {
    const predicted = planRenderCost(plan);
    const measured = measureLevelScene(plan);

    assert.equal(predicted.cellsDrawn, measured.cellsDrawn, 'ground cells');
    assert.equal(predicted.colourDrawCalls, measured.drawCalls, 'colour-pass draw calls');
    assert.equal(predicted.shadowDrawCalls, measured.shadowDrawCalls, 'shadow-pass draw calls');
    assert.equal(predicted.colourTriangles, measured.triangles, 'colour-pass triangles');
    assert.equal(predicted.shadowTriangles, measured.shadowTriangles, 'shadow-pass triangles');
    assert.equal(predicted.drawCalls, measured.totalDrawCalls);
    assert.equal(predicted.triangles, measured.totalTriangles);
  });

  test(`${name}: every instanced part is predicted instance for instance`, () => {
    const predicted = planRenderCost(plan);
    const measured = new Map<string, number>();
    for (const mesh of measureLevelScene(plan).meshes) {
      if (mesh.name.startsWith('level-props-')) {
        measured.set(mesh.name.replace('level-props-', ''), mesh.instances);
      }
    }

    assert.deepEqual(
      Object.fromEntries([...predicted.partInstances].sort()),
      Object.fromEntries([...measured].sort()),
      'the building setback tower is the only prop whose part list is not a '
        + 'constant; if this fails, data/renderCost.ts\'s copy of that rule has '
        + 'drifted from render/props.ts',
    );
  });
}

test('the surfaces and block materials the model names are the ones the scene draws', () => {
  const predicted = planRenderCost(slice);
  const measured = measureLevelScene(slice);

  const drawnMaterials = measured.meshes
    .filter((mesh) => mesh.name.startsWith('level-blocks-'))
    .map((mesh) => mesh.name.replace('level-blocks-', ''));
  assert.deepEqual([...predicted.blockMaterials].sort(), drawnMaterials.sort());

  // One heightfield material group per surface present.
  assert.equal(predicted.surfaces.length, measured.byCategory.heightfield.drawCalls);
});

// ---------------------------------------------------------------------------
// The primitives
// ---------------------------------------------------------------------------

test('PART_COSTS is what the kit actually builds — every part, no more, no fewer', () => {
  const measured = measurePartTriangles();

  assert.deepEqual(
    [...measured.keys()].sort(),
    [...PROP_PART_IDS].sort(),
    'a part was added to or removed from render/props.ts without the cost '
      + 'table following it',
  );

  for (const [part, cost] of measured) {
    assert.equal(
      PART_COSTS[part as PropPartId].triangles,
      cost.triangles,
      `${part} triangles per instance`,
    );
    assert.equal(
      PART_COSTS[part as PropPartId].castsShadow,
      cost.castsShadow,
      `${part} shadow flag — a casting part costs two draw calls, not one`,
    );
  }
});

test('every prop kind decomposes into the parts the model predicts', () => {
  for (const measured of measurePropKinds()) {
    // `measurePropKinds` probes `building` over a spread of positions and keeps
    // the worst; the model is asked about the *same* prop, so the two agree
    // exactly rather than approximately.
    const probe = {
      kind: measured.kind,
      position: { x: 0, y: 0, z: 0 },
      ...(measured.kind === 'building' ? { size: { x: 12, y: 18, z: 12 } } : {}),
    };
    const predicted = propPartCounts(probe);
    let triangles = 0;
    for (const [part, instances] of predicted) {
      triangles += PART_COSTS[part].triangles * instances;
    }
    // The probe position differs, so only the constant kinds are compared part
    // for part; the building's own rule is exercised against the real slice in
    // the per-instance test above, where all seventy-one of them are placed.
    if (measured.kind !== 'building') {
      assert.deepEqual(
        Object.fromEntries(predicted),
        measured.parts,
        `${measured.kind} parts`,
      );
      assert.equal(triangles, measured.triangles, `${measured.kind} triangles`);
    }
  }
});

test('every prop kind the game has is priced', () => {
  for (const kind of PROP_KINDS) {
    const counts = propPartCounts({ kind, position: { x: 3, y: 0, z: 7 } });
    assert.ok(counts.size > 0, `${kind} has no parts and would cost nothing`);
  }
});

test('a collider is twelve triangles and a ground cell is two', () => {
  // Both read off the built scene rather than off the source, because the
  // source is what changes.
  const plan = buildLevelPlan([{
    id: 'one',
    length: 20,
    halfWidth: 3,
    surface: 'pavement',
    blocks: [{ s: 10, t: 2, halfAlong: 1, halfLateral: 0.5, height: 0.15, surface: 'pavement' }],
  }], {
    id: 'primitive-probe',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
  });

  const measured = measureLevelScene(plan);
  const cells = terrainCells(plan);
  const blocks = measured.byCategory.blocks;

  assert.equal(blocks.triangles, LEVEL_GEOMETRY_COST.trianglesPerCollider);
  assert.equal(
    measured.byCategory.heightfield.triangles,
    cells.cellsDrawn * LEVEL_GEOMETRY_COST.trianglesPerTerrainCell,
  );

  const field = measured.meshes.find((mesh) => mesh.name === 'level-field');
  assert.ok(field !== undefined);
  assert.equal(
    field.triangles,
    cells.coverage.patchesDrawn * LEVEL_GEOMETRY_COST.trianglesPerFieldPatch,
  );

  const backstop = measured.meshes.find((mesh) => mesh.name === 'level-surround');
  assert.ok(backstop !== undefined);
  assert.equal(backstop.calls, LEVEL_GEOMETRY_COST.backstopDrawCalls);
  assert.equal(backstop.triangles, LEVEL_GEOMETRY_COST.backstopTriangles);
});

test('the non-level reserve is what the rest of the scene actually costs', () => {
  const measured = measureNonLevelScene(slice.checkpoints);
  assert.equal(
    NON_LEVEL_RESERVE.drawCalls,
    measured.totalDrawCalls,
    'the rider rig, ghost, gates, particles and background changed cost; the '
      + 'reserve the generator budgets against has to follow them',
  );
  assert.equal(NON_LEVEL_RESERVE.triangles, measured.totalTriangles);
});

test('QA r2: every reserve counts both particle fields live — one colour call each, no triangles, no shadow', () => {
  // A field is a hidden `Points` until it holds a particle, and
  // `measureObject` skips an invisible node, so a reserve measured with the
  // fields at rest silently dropped the call each draws while a pedal
  // strike's sparks or a rough surface's dust are in the air — reachable in
  // every mode (PLANS §21.11). The reserve emits one into each first.
  for (const [label, measured] of [
    ['solo', measureNonLevelScene(slice.checkpoints)],
    ['split', measureSplitNonLevelScene(slice.checkpoints)],
    ['quad', measureQuadNonLevelScene(slice.checkpoints)],
  ] as const) {
    for (const name of ['fx-sparks', 'fx-dust']) {
      const rows = measured.meshes.filter((mesh) => mesh.name === name);
      assert.equal(rows.length, 1, `${label}: ${name} is not in the reserve`);
      assert.equal(rows[0].calls, 1, `${label}: ${name} is not one call`);
      assert.equal(rows[0].triangles, 0);
      assert.equal(rows[0].castsShadow, false);
    }
  }
});

// ---------------------------------------------------------------------------
// Contract 2 — the desktop split frame (M25 Phase 3)
// ---------------------------------------------------------------------------

test('the split reserve is what a scene holding two riders actually costs', () => {
  const measured = measureSplitNonLevelScene(slice.checkpoints);
  assert.equal(
    SPLIT_NON_LEVEL_RESERVE.drawCalls,
    measured.totalDrawCalls,
    'two rigs, two machines, the gates, the particles and the background changed '
      + 'cost; the split ceiling is written against this number and has to follow it',
  );
  assert.equal(SPLIT_NON_LEVEL_RESERVE.triangles, measured.totalTriangles);
});

test('a split pass costs one whole extra rider, and nothing else doubles', () => {
  // **The shape of the reserve, not just its size.** A split frame shares one
  // scene: one pair of particle pools, one set of checkpoint gates, one
  // background. If a future change made any of those per-seat, this reserve
  // would grow by more than a rider and the ceiling above would be wrong
  // without anything failing — so the difference is asserted, not just the
  // total. The floor is a rider and a machine; the ceiling is two of them.
  // (From M39 Part P the solo reserve wears the pack of three trims and the
  // split one the 2v2 room, so the difference is no longer exactly one rider;
  // the bounds still hold, and the rooms' own shapes are pinned below.)
  const extraCalls = SPLIT_NON_LEVEL_RESERVE.drawCalls - NON_LEVEL_RESERVE.drawCalls;
  const extraTriangles = SPLIT_NON_LEVEL_RESERVE.triangles - NON_LEVEL_RESERVE.triangles;
  assert.ok(extraCalls > 0, 'a second seated rider cost nothing, so nothing was seated');
  assert.ok(
    SPLIT_NON_LEVEL_RESERVE.drawCalls < NON_LEVEL_RESERVE.drawCalls * 2,
    `a split pass costs ${SPLIT_NON_LEVEL_RESERVE.drawCalls} calls against `
      + `${NON_LEVEL_RESERVE.drawCalls} for one rider — that is the whole reserve twice `
      + 'over, so something shared (the particle pools, the gates, the background) has '
      + 'stopped being shared',
  );
  assert.ok(
    SPLIT_NON_LEVEL_RESERVE.triangles < NON_LEVEL_RESERVE.triangles * 2,
    `${extraTriangles} extra triangles is more than a rider and a machine`,
  );
});

test('the slice fits Contract 2, both passes counted', () => {
  const verdict = withinSplitRenderBudget(slice);
  assert.deepEqual(verdict.breaches, []);
  assert.ok(verdict.ok);
  // The frame is the sum of the passes — the definition §25.4 gives — and the
  // verdict must have applied it rather than reporting one pass.
  assert.equal(
    verdict.frame.drawCalls,
    (verdict.level.drawCalls + SPLIT_NON_LEVEL_RESERVE.drawCalls) * SPLIT_PASSES,
  );
  assert.equal(
    verdict.frame.triangles,
    (verdict.level.triangles + SPLIT_NON_LEVEL_RESERVE.triangles) * SPLIT_PASSES,
  );
});

test('no split frame the library can build breaches the Contract 2 ceiling', () => {
  // Contract 1's set-union argument, doubled with the passes. The bound is
  // what actually governs: the measured frame is written against the slice,
  // and a generated route can draw on more of the library than the slice does.
  const bound = (LIBRARY_MAX_DRAW_CALLS + SPLIT_NON_LEVEL_RESERVE.drawCalls) * SPLIT_PASSES;
  assert.ok(
    bound <= RENDER_BUDGET_SPLIT.maxDrawCalls,
    `a split frame of a level drawing on every surface, material and prop part at `
      + `once would cost ${bound} draw calls, past the ${RENDER_BUDGET_SPLIT.maxDrawCalls} `
      + `Contract 2 ceiling. Every new character costs twice here, so this is the `
      + `bound that has to move before a rider does.`,
  );
});

test('a route at the historical 80% sizing line still fits a split frame', () => {
  // Historical sizing reference: 80% of Contract
  // 1's triangle ceiling as the point past which scaling work is needed. A
  // couch session can be started on a generated world, so the frame that has
  // to fit is the one at that line — not the slice, which is far below it.
  // The 80% assertion counts a whole solo frame, including its reserve.
  const line = RENDER_BUDGET.maxTriangles * 0.8 - NON_LEVEL_RESERVE.triangles;
  const worst = (line + SPLIT_NON_LEVEL_RESERVE.triangles) * SPLIT_PASSES;
  assert.ok(
    worst <= RENDER_BUDGET_SPLIT.maxTriangles,
    `a route at the generator's 80% line would cost ${worst} triangles in a split `
      + `frame, past the ${RENDER_BUDGET_SPLIT.maxTriangles} ceiling`,
  );
});

// ---------------------------------------------------------------------------
// M27 Phase 0 — the four-seat measurement (the scope lock's numbers)
// ---------------------------------------------------------------------------

test('the seated sweep enumerates every unordered distinct seating exactly once', () => {
  // The enumeration is the measurement's identity: a sweep that repeated a
  // seating would waste builds, and one that skipped a seating could miss the
  // worst frame silently — which is the one direction a reserve may not be
  // wrong. C(n, k), computed rather than hardcoded, because the roster grows
  // and the reserves re-pin with it; §27.5's "exactly five such subsets" is
  // the n = 5 reading of the same arithmetic.
  const choose = (n: number, k: number): number => {
    let result = 1;
    for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
    return result;
  };
  const roster = PLAYABLE_RIDER_LOOKS.length;
  for (const seats of [2, 4]) {
    const subsets = playableSubsets(seats);
    assert.equal(subsets.length, choose(roster, seats), `C(${roster}, ${seats})`);
    const seen = new Set<string>();
    for (const subset of subsets) {
      const ids = subset.map((look) => look.id);
      assert.equal(new Set(ids).size, seats, 'a seating repeated a character (q68)');
      const key = [...ids].sort().join('+');
      assert.ok(!seen.has(key), `the seating ${key} was enumerated twice`);
      seen.add(key);
    }
  }
});

test('the quad reserve is what a scene holding four riders actually costs', () => {
  // The same model==measured pin both existing reserves carry. This one backs
  // no ceiling yet — `RENDER_BUDGET_QUAD` is Phase 1's, behind the owner's
  // scope lock — but a measurement on file that can drift is not on file, so
  // it is asserted from the day it exists.
  const measured = measureQuadNonLevelScene(slice.checkpoints);
  assert.equal(
    QUAD_NON_LEVEL_RESERVE.drawCalls,
    measured.totalDrawCalls,
    'four rigs, four machines, the gates, the particles and the background '
      + 'changed cost; the §27 scope-lock numbers are written against this and '
      + 'have to follow it — regenerate with `node tools/render-cost.mjs --write`',
  );
  assert.equal(QUAD_NON_LEVEL_RESERVE.triangles, measured.totalTriangles);
});

test('a quad pass costs two more riders than a split pass, and nothing else grows', () => {
  // The shape of the reserve, exactly as the split one is asserted one section
  // up: the scene the quad sweep builds shares one set of gates, one pair of
  // particle pools, one background and one companion slot with the split
  // scene, and only the rigs multiply. If any of the shared things quietly
  // became per-rig, this reserve would grow past two riders' worth without
  // anything else failing — so the difference is bounded, not just signed.
  assert.ok(
    QUAD_NON_LEVEL_RESERVE.drawCalls > SPLIT_NON_LEVEL_RESERVE.drawCalls,
    'two more seated riders cost no draw calls, so nothing was seated',
  );
  assert.ok(QUAD_NON_LEVEL_RESERVE.triangles > SPLIT_NON_LEVEL_RESERVE.triangles);
  assert.ok(
    QUAD_NON_LEVEL_RESERVE.drawCalls < SPLIT_NON_LEVEL_RESERVE.drawCalls * 2,
    `a quad pass costs ${QUAD_NON_LEVEL_RESERVE.drawCalls} calls against `
      + `${SPLIT_NON_LEVEL_RESERVE.drawCalls} for two riders — that is the whole two-rig `
      + 'reserve twice over, so something shared (the particle pools, the gates, the '
      + 'background, the companion slot) has stopped being shared',
  );
  assert.ok(
    QUAD_NON_LEVEL_RESERVE.triangles < SPLIT_NON_LEVEL_RESERVE.triangles * 2,
    `${QUAD_NON_LEVEL_RESERVE.triangles - SPLIT_NON_LEVEL_RESERVE.triangles} extra `
      + 'triangles is more than two riders and two machines',
  );
});

// ---------------------------------------------------------------------------
// M39 Part P — the cop rig and the chase rooms (docs/M39_CHASE.md §2f)
// ---------------------------------------------------------------------------

/** Every mesh name under a cop rider, in walk order, and what the rig says it costs. */
function copShape(options?: Parameters<typeof createCopRider>[0]): {
  names: string[]; calls: number; shadowCalls: number; triangles: number;
} {
  const cop = createCopRider(options);
  try {
    const names: string[] = [];
    cop.group.traverse((object) => { names.push(object.name); });
    return { names, calls: cop.drawCalls, shadowCalls: cop.shadowDrawCalls, triangles: cop.triangles };
  } finally {
    cop.dispose();
  }
}

const sameCost = (a: SceneCost, b: SceneCost): void => {
  assert.equal(a.drawCalls, b.drawCalls, 'colour calls');
  assert.equal(a.shadowDrawCalls, b.shadowDrawCalls, 'shadow calls');
  assert.equal(a.totalDrawCalls, b.totalDrawCalls, 'calls');
  assert.equal(a.totalTriangles, b.totalTriangles, 'triangles');
};

test('the shipped cop trim is the rig it always was, and trim 0 is it byte for byte', () => {
  // The record's first row (§39.6b.4: "the cop rig today"), measured on
  // 2026-09-23 before Part P built anything: 23 colour calls and 3 shadow
  // calls — the wheel's shell, the torso and the head (SHADOW_MIN_TRIANGLES)
  // — 26 in all, and 10,878 triangles across both passes, posed and armed.
  const trim = measureCopRig();
  assert.equal(trim.drawCalls, 23);
  assert.equal(trim.shadowDrawCalls, 3);
  assert.equal(trim.totalDrawCalls, 26);
  assert.equal(trim.totalTriangles, 10_878);
  // `index: 0` is the absent option (R-7): the same names, the same cost, so
  // every existing lookup (`cop-rider`, `cop-riding-rig`, the specs) holds.
  const absent = copShape();
  assert.deepEqual(copShape({ index: 0 }), absent);
  assert.deepEqual(copShape({ full: false }), absent);
  assert.equal(absent.names[0], 'cop-rider');
  assert.ok(absent.names.includes('cop-riding-rig'));
  assert.ok(absent.names.every((name) => name === '' || name.startsWith('cop-')));
});

test('each trim of the pack is addressable, and no two share a node name', () => {
  // `getObjectByName` returns the first match of a depth-first walk, so a
  // second `cop-rider` in the scene would redirect every lookup onto whichever
  // came first — the M10 lesson `copRider.ts` records. Trims 1 and 2 are
  // `cop2-` and `cop3-`, and cost exactly what the tail costs.
  const shapes = [0, 1, 2].map((index) => copShape({ index }));
  assert.equal(shapes[1].names[0], 'cop2-rider');
  assert.equal(shapes[2].names[0], 'cop3-rider');
  const named = shapes.flatMap((shape) => shape.names.filter((name) => name !== ''));
  assert.equal(new Set(named).size, named.length, 'two nodes of the pack share a name');
  for (const shape of shapes.slice(1)) {
    assert.equal(shape.calls, shapes[0].calls);
    assert.equal(shape.shadowCalls, shapes[0].shadowCalls);
    assert.equal(shape.triangles, shapes[0].triangles);
  }
  sameCost(measureCopRig({ index: 2 }), measureCopRig());
});

test('the full cop rig is the seated cop\'s rig, and no dearer than any playable rig (R-6)', () => {
  // q218: the human cop rides at full rig — the trim restored, every part
  // keeping the shadow the rig gives it, the uniform unchanged. It is the seat
  // rig `createCopRidingRig()` builds, and because `COP_LOOK` has no elbow
  // pads, sleeve panels or separate seat mesh it measures fewer calls and
  // fewer triangles than the worst playable rig — no part added to reach a
  // number. Measured 2026-09-23: 30 + 23 = 53 calls, 16,690 triangles.
  const full = measureCopRig({ full: true });
  sameCost(full, measureSeatRig('cop'));
  const trim = measureCopRig();
  assert.ok(full.totalDrawCalls > trim.totalDrawCalls, 'the full rig restored nothing');
  assert.ok(full.shadowDrawCalls > trim.shadowDrawCalls, 'the full rig casts no more than the trim');
  const playable = PLAYABLE_RIDER_LOOKS.map((look) => measureSeatRig(look));
  const worstCalls = Math.max(...playable.map((rig) => rig.totalDrawCalls));
  const worstTriangles = Math.max(...playable.map((rig) => rig.totalTriangles));
  assert.ok(full.totalDrawCalls <= worstCalls, `the full cop costs ${full.totalDrawCalls} calls against ${worstCalls}`);
  assert.ok(full.totalTriangles <= worstTriangles, `the full cop costs ${full.totalTriangles} triangles against ${worstTriangles}`);
});

test('the chase rooms are every room the rule allows, and nothing else', () => {
  // §39.6b: up to three outlaws against one cop slot; the slot is a CPU pack
  // of `roomSize − outlaws` trims or one human, never both; outlaws are
  // distinct playable characters (q68) and never Dorkins, who is offered only
  // to the cop seat.
  const choose = (n: number, k: number): number => {
    let result = 1;
    for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
    return result;
  };
  const roster = PLAYABLE_RIDER_LOOKS.length;
  const shapes = (views: 1 | 2 | 4): string[] => chaseRooms(views).map((room) => (
    `${room.outlaws.length}${room.copSeated ? 'h' : 'c'}${room.pack}`
  ));
  const count = (views: 1 | 2 | 4, shape: string): number => shapes(views).filter((s) => s === shape).length;
  assert.equal(count(1, `1c${CHASE.roomSize - 1}`), roster);
  assert.equal(chaseRooms(1).length, roster);
  assert.equal(count(2, '1h0'), roster);
  assert.equal(count(2, `2c${CHASE.roomSize - 2}`), choose(roster, 2));
  assert.equal(chaseRooms(2).length, roster + choose(roster, 2));
  assert.equal(count(4, '2h0'), choose(roster, 2));
  assert.equal(count(4, `3c${CHASE.roomSize - 3}`), choose(roster, 3));
  assert.equal(count(4, '3h0'), choose(roster, 3));
  assert.equal(chaseRooms(4).length, choose(roster, 2) + 2 * choose(roster, 3));
  for (const views of [1, 2, 4] as const) {
    for (const room of chaseRooms(views)) {
      const ids = room.outlaws.map((look) => look.id);
      assert.equal(new Set(ids).size, ids.length, 'a room repeated a character (q68)');
      assert.ok(!ids.includes(COP_LOOK.id), 'an outlaw wore the cop');
      assert.ok(room.outlaws.length >= 1 && room.outlaws.length <= 3);
      assert.equal(room.pack, room.copSeated ? 0 : CHASE.roomSize - room.outlaws.length);
      assert.ok(chaseRoomViews(room) <= views, 'a room has more panes than its contract draws');
    }
  }
  assert.throws(
    () => measureChaseRoomScene(slice.checkpoints, { outlaws: [PLAYABLE_RIDER_LOOKS[0]], copSeated: true, pack: 1 }),
    /never share a room/,
  );
});

test('the solo reserve wears the pack of three, and the pack adds exactly two trims', () => {
  // q209: the solo chase is three cops, so the second-rider slot holds three
  // trims and the reserve is taken in that state. The shape is asserted as
  // well as the size: a solo room costs the lone-trim frame plus exactly two
  // more trims, so nothing else in the scene grew with the pack.
  const trim = measureCopRig();
  const rooms = chaseRooms(1).map((room) => measureChaseRoomScene(slice.checkpoints, room));
  const worstCalls = Math.max(...rooms.map((room) => room.totalDrawCalls));
  assert.equal(worstCalls, NON_LEVEL_RESERVE.drawCalls, 'the pack is the solo reserve\'s call axis');
  for (const room of rooms) {
    assert.ok(room.totalDrawCalls <= NON_LEVEL_RESERVE.drawCalls);
    assert.ok(room.totalTriangles <= NON_LEVEL_RESERVE.triangles);
  }
  const look = PLAYABLE_RIDER_LOOKS[0];
  const pack = measureChaseRoomScene(slice.checkpoints, { outlaws: [look], copSeated: false, pack: 3 });
  const one = measureChaseRoomScene(slice.checkpoints, { outlaws: [look], copSeated: false, pack: 1 });
  assert.equal(pack.totalDrawCalls - one.totalDrawCalls, 2 * trim.totalDrawCalls);
  assert.equal(pack.totalTriangles - one.totalTriangles, 2 * trim.totalTriangles);
});

test('the instanced pack is modelled at the lone trim\'s calls and the plain pack\'s triangles', () => {
  // §39.6b.4's third row, a model and not a build: three cops from one set of
  // draw calls leaves the call axis where one cop put it and costs every
  // triangle the plain pack does. Held as the remedy if the phone rejects the
  // plain route; this pins the arithmetic the report prints.
  const instanced = modelInstancedPackReserve(slice.checkpoints);
  assert.ok(instanced.totalDrawCalls < NON_LEVEL_RESERVE.drawCalls, 'instancing saved no call');
  assert.equal(instanced.totalTriangles, NON_LEVEL_RESERVE.triangles, 'instancing changed the triangle axis');
});

test('the split reserve covers every two-pane room, and 2v2 is the room that sets it', () => {
  // q219: 2v2 with the CPU holding the slot — two seat rigs and two trims a
  // pass — is one trim dearer than a pair wearing the lone cop, and it is the
  // split reserve's call axis now.
  const rooms = chaseRooms(2).map((room) => ({ room, cost: measureChaseRoomScene(slice.checkpoints, room) }));
  for (const { cost } of rooms) {
    assert.ok(cost.totalDrawCalls <= SPLIT_NON_LEVEL_RESERVE.drawCalls);
    assert.ok(cost.totalTriangles <= SPLIT_NON_LEVEL_RESERVE.triangles);
  }
  const dearest = rooms.reduce((a, b) => (b.cost.totalDrawCalls > a.cost.totalDrawCalls ? b : a));
  assert.equal(dearest.cost.totalDrawCalls, SPLIT_NON_LEVEL_RESERVE.drawCalls);
  assert.equal(dearest.room.outlaws.length, 2);
  assert.equal(dearest.room.pack, 2);
});

test('every grid room fits the quad reserve: the cop at full rig moves nothing', () => {
  // The 3v1 human room is four seat rigs, one of them the cop at full rig; the
  // uniform's delta over the playable rig it stands in for is negative on both
  // axes (the full-rig test above), so Contract 3's reserve holds.
  for (const room of chaseRooms(4)) {
    const cost = measureChaseRoomScene(slice.checkpoints, room);
    assert.ok(cost.totalDrawCalls <= QUAD_NON_LEVEL_RESERVE.drawCalls);
    assert.ok(cost.totalTriangles <= QUAD_NON_LEVEL_RESERVE.triangles);
  }
});

// ---------------------------------------------------------------------------
// M27 Phase 1 — Contract 3, the grid ceiling (the scope lock, answered)
//
// Phase 0 stood a tripwire here asserting that `RENDER_BUDGET_QUAD` and
// `QUAD_PASSES` did *not* exist, so that pinning a ceiling before the owner's
// desktop had answered would fail loudly rather than settle q98 by
// implementation. He answered on 2026-08-31 — (a), four seats everywhere, no
// per-world cap — and the tripwire was deleted deliberately, with the lock in
// hand, and replaced by the assertions below.
// ---------------------------------------------------------------------------

test('the slice fits Contract 3, all four passes counted', () => {
  const verdict = withinQuadRenderBudget(slice);
  assert.deepEqual(verdict.breaches, []);
  assert.ok(verdict.ok);
  // The frame is the sum of its passes — §25.4's definition, at four — and the
  // verdict must have applied it rather than reporting one pass.
  assert.equal(
    verdict.frame.drawCalls,
    (verdict.level.drawCalls + QUAD_NON_LEVEL_RESERVE.drawCalls) * QUAD_PASSES,
  );
  assert.equal(
    verdict.frame.triangles,
    (verdict.level.triangles + QUAD_NON_LEVEL_RESERVE.triangles) * QUAD_PASSES,
  );
});

test('a three-seat frame is three passes under the same ceiling', () => {
  // §27.5, exactly: what makes a frame this kind of frame is the 2x2 grid,
  // not how many people are sitting in it. A three-seat session is cheaper
  // than a four-seat one and is judged here rather than against two-and-a-half
  // contracts — and the pass count has to actually reach the arithmetic, which
  // is what the inequality below is for.
  const three = withinQuadRenderBudget(slice, 3);
  const four = withinQuadRenderBudget(slice, 4);
  assert.equal(
    three.frame.drawCalls,
    (three.level.drawCalls + QUAD_NON_LEVEL_RESERVE.drawCalls) * 3,
  );
  assert.ok(three.frame.drawCalls < four.frame.drawCalls);
  assert.ok(three.ok);
  // And it cannot be asked for a frame the ceiling was never priced for: a
  // fifth pass is clamped rather than silently judged.
  assert.equal(withinQuadRenderBudget(slice, 9).frame.drawCalls, four.frame.drawCalls);
});

test('no grid frame the library can build breaches the Contract 3 ceiling', () => {
  // Contract 1's set-union argument at four passes. The bound is what governs:
  // the measured frames are written against particular worlds, and q98 (a)
  // means a four-seat session can be opened on a generated one.
  const bound = (LIBRARY_MAX_DRAW_CALLS + QUAD_NON_LEVEL_RESERVE.drawCalls) * QUAD_PASSES;
  assert.ok(
    bound <= RENDER_BUDGET_QUAD.maxDrawCalls,
    `a grid frame of a level drawing on every surface, material and prop part at `
      + `once would cost ${bound} draw calls, past the ${RENDER_BUDGET_QUAD.maxDrawCalls} `
      + `Contract 3 ceiling. Every new character costs four times here, so this is the `
      + `bound that has to move before a rider does.`,
  );
});

test('a route at the historical 80% sizing line still fits a grid frame', () => {
  // The half q98 (a) is actually about. The owner declined to cap generated
  // worlds at two seats, so the frame that has to fit is the heaviest one a
  // four-seat session can open — a route at the generator's 80% line, four
  // times over — and not BelVar, which is 41% cheaper on this axis.
  // The 80% assertion counts a whole solo frame, including its reserve.
  const line = RENDER_BUDGET.maxTriangles * 0.8 - NON_LEVEL_RESERVE.triangles;
  const worst = (line + QUAD_NON_LEVEL_RESERVE.triangles) * QUAD_PASSES;
  assert.ok(
    worst <= RENDER_BUDGET_QUAD.maxTriangles,
    `a route at the generator's 80% line would cost ${worst} triangles in a grid `
      + `frame, past the ${RENDER_BUDGET_QUAD.maxTriangles} ceiling`,
  );
});

test('the three frame ceilings retain their distinct pass counts', () => {
  // Owner-authorized hero detail raises triangle allowances; the draw-call
  // ceilings and the available level geometry remain unchanged.
  // M39 Part P (2026-09-23): Contract 1 raised under q209 by exactly the
  // solo reserve's growth when it put on the pack of three cops (+52 calls,
  // +3,618 triangles), and Contract 2's calls under q219 by twice the split
  // reserve's growth for the 2v2 room (+26 a pass). The rule and its figures
  // are in `docs/M39_CHASE.md`'s render-cost measurements; the level's share
  // of each is pinned by the test below this one. QA r2 (2026-09-24): every
  // reserve +2 calls for the two particle fields measured live, so by the
  // same rule 212 → 214, 512 → 516 and 1,400 → 1,408.
  assert.equal(RENDER_BUDGET.maxDrawCalls, 217);
  // M39 r6 (2026-09-22): triangles raised on the owner's authorization for the
  // town ring's larger ground; draw calls unchanged.
  assert.equal(RENDER_BUDGET.maxTriangles, 643_618);
  assert.equal(RENDER_BUDGET_SPLIT.maxDrawCalls, 522);
  assert.equal(RENDER_BUDGET_SPLIT.maxTriangles, 1_374_264);
  assert.equal(RENDER_BUDGET_QUAD.maxDrawCalls, 1_420);
  assert.ok(RENDER_BUDGET_QUAD.maxDrawCalls > RENDER_BUDGET_SPLIT.maxDrawCalls);
  assert.ok(RENDER_BUDGET_QUAD.maxTriangles > RENDER_BUDGET_SPLIT.maxTriangles);
  // And it is not four halves: the level is drawn four times but the world —
  // the gates, the particle pools, the background — is still shared, so a grid
  // frame costs less than two split frames.
  assert.ok(RENDER_BUDGET_QUAD.maxDrawCalls < RENDER_BUDGET_SPLIT.maxDrawCalls * 4);
});

test('measured reserves and explicit route-face library expansion retain synchronized level shares', () => {
  // Owner-authorized environment R15 adds three non-casting kit templates:
  // +3 calls per view, without changing the measured non-level reserves.
  // The historical Part P reserve-only amendment is recorded below.
  // **The library-plus-reserve lines** — M39 Part P (q209, q219; R-5). The
  // ceilings moved by `passes × reserve growth` and nothing else, so what a
  // level may spend under each contract is exactly what it was the day before
  // the pack: 70 calls and 513,382 triangles in a solo frame, 80 calls a pass
  // in the split and the grid, and the triangle rooms below. These are the
  // numbers `level/renderBudget.ts` and `render/presentation.ts` judge worlds
  // against, and a change here moves generated worlds — which Part P promised
  // it would not.
  assert.equal(RENDER_BUDGET.maxDrawCalls - NON_LEVEL_RESERVE.drawCalls, 73, 'the solo level share (calls)');
  assert.equal(RENDER_BUDGET.maxTriangles - NON_LEVEL_RESERVE.triangles, 513_382, 'the solo level share (triangles)');
  assert.equal(RENDER_BUDGET_SPLIT.maxDrawCalls / SPLIT_PASSES - SPLIT_NON_LEVEL_RESERVE.drawCalls, 83);
  assert.equal(RENDER_BUDGET_SPLIT.maxTriangles / SPLIT_PASSES - SPLIT_NON_LEVEL_RESERVE.triangles, 507_774);
  assert.equal(RENDER_BUDGET_QUAD.maxDrawCalls / QUAD_PASSES - QUAD_NON_LEVEL_RESERVE.drawCalls, 83);
  assert.equal(RENDER_BUDGET_QUAD.maxTriangles / QUAD_PASSES - QUAD_NON_LEVEL_RESERVE.triangles, 503_844);
  // Contract 1 is still exactly the set-union bound, as it has been since the
  // library bound was derived: the library at its largest plus the reserve.
  assert.equal(RENDER_BUDGET.maxDrawCalls, LIBRARY_MAX_DRAW_CALLS + NON_LEVEL_RESERVE.drawCalls);
  // And the q219 bound the owner was shown (~492 of 460) is the bound now
  // under the raised ceiling.
  assert.ok((LIBRARY_MAX_DRAW_CALLS + SPLIT_NON_LEVEL_RESERVE.drawCalls) * SPLIT_PASSES <= RENDER_BUDGET_SPLIT.maxDrawCalls);
});

test('the grid retains draw-call headroom after adding the rider face and visor', () => {
  // The face and clear visor spend two colour calls per view: eight of the former 52
  // spare calls. Shadows remain included in the measured reserve.
  const bound = (LIBRARY_MAX_DRAW_CALLS + QUAD_NON_LEVEL_RESERVE.drawCalls) * QUAD_PASSES;
  const callsPerCharacter = (SPLIT_NON_LEVEL_RESERVE.drawCalls - NON_LEVEL_RESERVE.drawCalls);
  const headroom = RENDER_BUDGET_QUAD.maxDrawCalls - bound;
  assert.ok(
    headroom > 0,
    'Contract 3 is written exactly at its own bound, so the next prop part breaches it',
  );
  // Not a promise that a whole character fits — Contract 2 does not make that
  // promise either — but a statement of what the margin is in the unit that
  // matters, so a future edit that halves it has to say so.
  // M39 Phase 2 (2026-09-22) says so: the town's pitched-roof part is one
  // non-casting colour call per pass, 44 → 40, with every ceiling unchanged.
  assert.ok(
    headroom >= 40,
    `${headroom} calls of headroom against ${callsPerCharacter * QUAD_PASSES} for a `
      + 'character in a grid frame; Contract 2 left the equivalent of 1.44 characters '
      + 'and this leaves less',
  );
});

test('the split frame is judged against its own larger ceiling', () => {
  // Distinct frame budgets still apply after the owner-authorized upgrade.
  assert.ok(RENDER_BUDGET_SPLIT.maxDrawCalls > RENDER_BUDGET.maxDrawCalls);
  assert.ok(RENDER_BUDGET_SPLIT.maxTriangles > RENDER_BUDGET.maxTriangles);
  assert.equal(RENDER_BUDGET.maxDrawCalls, 217, 'Contract 1 moved');
  assert.equal(RENDER_BUDGET.maxTriangles, 643_618, 'Contract 1 moved');
  // And a single-player verdict is still judged against Contract 1: a plan
  // that fits the split ceiling but not the phone one must still be refused.
  const verdict = withinRenderBudget(slice);
  assert.ok(verdict.frame.drawCalls <= RENDER_BUDGET.maxDrawCalls);
  assert.ok(verdict.frame.drawCalls < RENDER_BUDGET_SPLIT.maxDrawCalls);
});

// ---------------------------------------------------------------------------
// What the model is for
// ---------------------------------------------------------------------------

test('the slice fits the §9 budget, with the reserve counted', () => {
  const verdict = withinRenderBudget(slice);
  assert.deepEqual(verdict.breaches, []);
  assert.ok(verdict.ok);
  assert.ok(verdict.frame.drawCalls <= RENDER_BUDGET.maxDrawCalls);
  assert.ok(verdict.frame.triangles <= RENDER_BUDGET.maxTriangles);
});

test('no level built from this library can breach the draw-call ceiling', () => {
  // The structural result Phase 0 exists to establish, and the reason Phase 3's
  // scaling work is about triangles. Everything a level draws merges: the
  // ground is one mesh with a group per surface *present*, the blocks one mesh
  // per material *present*, the dressing one InstancedMesh per part *present*,
  // the paint one mesh. So a route's draw-call cost is a set union over a
  // finite library and cannot grow with its length.
  assert.ok(
    LIBRARY_MAX_DRAW_CALLS + NON_LEVEL_RESERVE.drawCalls <= RENDER_BUDGET.maxDrawCalls,
    `a level drawing on every surface, material and prop part at once would cost `
      + `${LIBRARY_MAX_DRAW_CALLS} draw calls, which with the ${NON_LEVEL_RESERVE.drawCalls} `
      + `reserved elsewhere exceeds the ${RENDER_BUDGET.maxDrawCalls} ceiling. Draw calls `
      + `have become a scaling risk and Phase 3 has to treat them as one.`,
  );

  for (const plan of [slice, proving]) {
    assert.ok(
      planRenderCost(plan).drawCalls <= LIBRARY_MAX_DRAW_CALLS,
      'a real level costs more than the library bound, so the bound is wrong',
    );
  }
});

// ---------------------------------------------------------------------------
// M12 Phase 3 — the generated path keeps the merges the slice was measured on
// ---------------------------------------------------------------------------

test('a generated route merges across segment boundaries exactly as the slice does', () => {
  // **The first item in Phase 3's escalation order** (`docs/PLANS.md` §10):
  // *"first preserve the slice's cross-segment merges in the generated path
  // (paint stays one mesh; ribbons merge across segment boundaries rather than
  // one mesh per segment)"*. It is preserved by construction — `render/`
  // builds meshes from a `LevelPlan` and cannot tell a generated plan from a
  // hand-authored one (invariant 2) — but "by construction" is exactly the
  // kind of claim that stops being true when somebody adds a per-segment
  // special case, and nothing else would fail if it did.
  for (const seed of ['euc', 'x67']) {
    const { plan, report } = generateLevel(seed);
    assert.equal(report.usedFallback, false, 'measure expanded geometry, never the fallback');
    const measured = measureLevelScene(plan);
    const predicted = planRenderCost(plan);
    assert.equal(measured.totalDrawCalls, predicted.drawCalls);
    assert.equal(measured.totalTriangles, predicted.triangles);

    const meshes = (prefix: string): number =>
      measured.meshes.filter((mesh) => mesh.name.startsWith(prefix)).length;

    assert.equal(
      measured.byCategory.markings.drawCalls,
      1,
      `${seed}: every painted line in the route is one mesh, however many `
        + `segments authored it — this route paints ${predicted.markingQuads} quads`,
    );
    assert.equal(
      meshes('level-blocks-'),
      predicted.blockMaterials.length,
      `${seed}: one merged mesh per block material present, not one per segment`,
    );
    assert.equal(
      meshes('level-props-'),
      predicted.partInstances.size,
      `${seed}: one InstancedMesh per prop part present, not one per segment`,
    );
    assert.equal(
      measured.byCategory.heightfield.drawCalls,
      predicted.surfaces.length,
      `${seed}: one heightfield mesh with a group per surface present`,
    );

    // And the consequence worth stating in a number: a route made of many
    // segments still costs a level draw-call count bounded by the library.
    assert.ok(plan.segments.length >= 20, `${seed} is too short to prove anything`);
    assert.ok(
      predicted.drawCalls <= LIBRARY_MAX_DRAW_CALLS,
      `${seed}: ${plan.segments.length} segments cost ${predicted.drawCalls} draw calls, `
        + `above the ${LIBRARY_MAX_DRAW_CALLS} the whole library can reach — something `
        + 'in the generated path stopped merging',
    );
  }
});

test('a longer generated route costs the same draw calls as a shorter one', () => {
  // The set-union result, stated as the thing a scaling risk would violate:
  // draw calls track which *kinds* a route contains, never how much of them.
  const measured = ['sweep-0', 'sweep-11', 'sweep-29', 'sweep-37'].map((seed) => {
    const plan = generateLevel(seed).plan;
    const cost = planRenderCost(plan);
    return {
      seed,
      segments: plan.segments.length,
      drawCalls: cost.drawCalls,
      // **The two hazard meshes are kinds too** — added at M13 Phase 3, when the
      // generator started placing hazards. They merge exactly like everything
      // else: all of a level's crushed asphalt in one mesh and all its standing
      // water in another, so each is one draw call for a route that contains
      // any and none for a route that contains none. Left out, this identity
      // held only by luck: a route with no spill and no deep pothole draws no
      // water mesh, and the two seeds that happened to be longest and shortest
      // both carried one, so the mismatch cancelled and the test passed while
      // describing something false.
      kinds: cost.surfaces.length + cost.blockMaterials.length + cost.partInstances.size
        + (cost.potholes > 0 ? 1 : 0)
        + (cost.pools + cost.spills > 0 ? 1 : 0),
    };
  });

  const longest = measured.reduce((a, b) => (b.segments > a.segments ? b : a));
  const shortest = measured.reduce((a, b) => (b.segments < a.segments ? b : a));
  assert.ok(longest.segments > shortest.segments, 'the four seeds are all the same size');

  // Not "the same number" — two routes genuinely drawing on different kinds
  // cost differently, and that is the set union working. What must hold is
  // that the difference is accounted for by the kinds and not by the length.
  assert.equal(
    longest.drawCalls - shortest.drawCalls,
    longest.kinds - shortest.kinds,
    `${longest.seed} has ${longest.segments} segments and ${shortest.seed} has `
      + `${shortest.segments}, and their draw calls differ by more than the kinds they `
      + 'draw on. Length has started to cost draw calls, which is the scaling risk '
      + 'Phase 0 measured away.',
  );
});

test('the budget verdict can fail, and says why', () => {
  // An audit that cannot fail is not an audit. A plan whose props are multiplied
  // past the triangle ceiling must be rejected, and the rejection must name the
  // ceiling it broke rather than merely returning false.
  const props = slice.props ?? [];
  const bloated: LevelPlan = {
    ...slice,
    props: Array.from({ length: 40 }, (_, copy) => props.map((prop) => ({
      ...prop,
      position: { ...prop.position, x: prop.position.x + copy * 0.011 },
    }))).flat(),
  };

  const verdict = withinRenderBudget(bloated);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.breaches.length, 1);
  assert.match(verdict.breaches[0], new RegExp(`triangles against a ceiling of ${RENDER_BUDGET.maxTriangles}`));
});

test('the model tracks a change to the plan rather than reporting a constant', () => {
  // The other half of the same guard: a prediction that ignored its input would
  // pass every test above.
  const one = planRenderCost(slice);
  const fewer: LevelPlan = { ...slice, props: (slice.props ?? []).slice(0, 100) };
  const two = planRenderCost(fewer);

  assert.ok(two.triangles < one.triangles);
  assert.equal(
    two.triangles,
    measureLevelScene(fewer).totalTriangles,
    'and it is still exact after the change',
  );
});

// ---------------------------------------------------------------------------
// M13 Phase 2 — the hazard family
// ---------------------------------------------------------------------------

/**
 * A road carrying every kind of hazard at once.
 *
 * Built here rather than taken from a generated route so the exact radii and
 * all four hazard kinds stay fixed. The slice and proving-ground measurements
 * above are still vacuous for this family because both deliberately carry no
 * hazards; generated routes do, but their authored counts and kinds vary by
 * seed.
 */
function hazardPlan(): LevelPlan {
  return buildLevelPlan([{ id: 'road', length: 80, halfWidth: 6, surface: 'pavement' }], {
    id: 'hazard-cost-probe',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    hazards: [
      { id: 'a', segment: 'road', s: 14, t: 0, kind: 'potholeShallow', radius: 0.7 },
      { id: 'b', segment: 'road', s: 30, t: 1.6, kind: 'potholeDeep', radius: 1.2 },
      { id: 'c', segment: 'road', s: 46, t: -2, kind: 'potholeShallow', radius: 1.8 },
      { id: 'd', segment: 'road', s: 62, t: 0.5, kind: 'spill', radius: 2.4 },
    ],
  });
}

test('a level with hazards is predicted exactly, hole for hole', () => {
  const plan = hazardPlan();
  const predicted = planRenderCost(plan);
  const measured = measureLevelScene(plan);

  assert.equal(predicted.potholes, 3, 'three potholes and one spill were authored');
  assert.equal(predicted.colourDrawCalls, measured.drawCalls, 'colour-pass draw calls');
  assert.equal(predicted.shadowDrawCalls, measured.shadowDrawCalls, 'shadow-pass draw calls');
  assert.equal(predicted.colourTriangles, measured.triangles, 'colour-pass triangles');
  assert.equal(predicted.shadowTriangles, measured.shadowTriangles, 'shadow-pass triangles');
});

test('every hazard in a level is two draw calls and none of them casts', () => {
  const measured = measureLevelScene(hazardPlan());
  assert.equal(
    measured.byCategory.hazards.drawCalls,
    LEVEL_GEOMETRY_COST.hazardGroundDrawCalls + LEVEL_GEOMETRY_COST.hazardWaterDrawCalls,
    'four hazards in four meshes would be a per-hazard cost, which is the one '
      + 'shape the draw-call bound cannot survive',
  );
  assert.equal(
    measured.byCategory.hazards.shadowDrawCalls,
    0,
    'a recess casting into the cascade would draw a dark ring beside every hole',
  );
});

/**
 * A road with N targets down one verge — M14.
 *
 * Parameterised because the claim that matters about this family is not what
 * one costs but that **the count is a pacing question and never a frame
 * question**: one target and sixty must cost the same number of meshes, or the
 * generator's density lever silently becomes a budget lever.
 */
function targetPlan(count: number): LevelPlan {
  return buildLevelPlan([{ id: 'road', length: 400, halfWidth: 6, surface: 'pavement' }], {
    id: 'target-cost-probe',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    targets: Array.from({ length: count }, (_unused, index) => ({
      id: `t${index}`,
      segment: 'road',
      s: 10 + index * 6,
      t: index % 2 === 0 ? 6.5 : -6.5,
    })),
  });
}

test('a level with targets is predicted exactly, stand for stand', () => {
  const plan = targetPlan(8);
  const predicted = planRenderCost(plan);
  const measured = measureLevelScene(plan);

  assert.equal(predicted.targets, 8, 'eight stands were authored');
  assert.equal(predicted.colourDrawCalls, measured.drawCalls, 'colour-pass draw calls');
  assert.equal(predicted.shadowDrawCalls, measured.shadowDrawCalls, 'shadow-pass draw calls');
  assert.equal(predicted.colourTriangles, measured.triangles, 'colour-pass triangles');
  assert.equal(predicted.shadowTriangles, measured.shadowTriangles, 'shadow-pass triangles');
});

test('one target and sixty cost the same meshes — count is pacing, not frame', () => {
  const one = measureLevelScene(targetPlan(1));
  const eight = measureLevelScene(targetPlan(8));
  const sixty = measureLevelScene(targetPlan(60));

  for (const [label, measured] of [['8', eight], ['60', sixty]] as const) {
    assert.equal(
      measured.byCategory.targets.drawCalls,
      one.byCategory.targets.drawCalls,
      `${label} targets cost more draw calls than one. A per-target mesh is the `
        + 'one shape the draw-call bound cannot survive, and it would make the '
        + 'generator’s density slider a budget control by accident.',
    );
  }
  assert.equal(one.byCategory.targets.drawCalls, LEVEL_GEOMETRY_COST.targetDrawCalls);
  assert.equal(
    sixty.byCategory.targets.shadowDrawCalls,
    0,
    'a target casting into the cascade would cost the second draw call the '
      + 'budget verdict did not allow it, and would argue the stand is solid',
  );
  // Triangles are the additive axis, and they are meant to be.
  assert.equal(
    sixty.byCategory.targets.triangles,
    60 * LEVEL_GEOMETRY_COST.trianglesPerTarget,
  );
});

test('a target is 384 triangles, and the budget may multiply by it', () => {
  // Read off the built mesh rather than off the source, exactly as the pothole
  // below is. `TARGET`'s segment counts are deliberately fixed, so the budget
  // is allowed to multiply — and this is the test that fails if the stand's
  // shape changes without the constant following it.
  const measured = measureLevelScene(targetPlan(1));
  assert.equal(measured.byCategory.targets.triangles, LEVEL_GEOMETRY_COST.trianglesPerTarget);
});

test('a pothole is 112 triangles whatever its radius, and its water is 48 more', () => {
  // Read off the built mesh rather than off the source, like every other
  // primitive here. `POTHOLE.radialSegments` is deliberately constant, so the
  // budget may multiply — and this is what fails if the ring list changes.
  //
  // The fixture is three potholes (one of them deep) and one spill.
  const measured = measureLevelScene(hazardPlan());
  assert.equal(
    measured.byCategory.hazards.triangles,
    3 * LEVEL_GEOMETRY_COST.trianglesPerPothole
      + 1 * LEVEL_GEOMETRY_COST.trianglesPerPotholePool
      + 1 * LEVEL_GEOMETRY_COST.trianglesPerSpillPuddle,
  );

  // A spill's *grip* is charged as ground, once, and must not also be charged
  // here — the same "one ride response, one place" rule the simulation half
  // follows. What is charged here is only the water drawn on top of it, which
  // exists nowhere else in the model.
  const spillOnly = buildLevelPlan([{ id: 'road', length: 40, halfWidth: 6, surface: 'pavement' }], {
    id: 'spill-cost-probe',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    hazards: [{ id: 'p', segment: 'road', s: 20, t: 0, kind: 'spill', radius: 2.4 }],
  });
  const spillMeasured = measureLevelScene(spillOnly);
  assert.equal(
    spillMeasured.byCategory.hazards.drawCalls,
    LEVEL_GEOMETRY_COST.hazardWaterDrawCalls,
    'the water mesh and no asphalt mesh',
  );
  assert.equal(
    spillMeasured.byCategory.hazards.triangles,
    LEVEL_GEOMETRY_COST.trianglesPerSpillPuddle,
  );
  assert.equal(planRenderCost(spillOnly).potholes, 0);
  assert.ok(
    planRenderCost(spillOnly).surfaces.includes('spill'),
    'and it still costs a heightfield material group, which is where the grip lives',
  );
});

test('the hazard family adds two draw calls to the library bound and no shadow call', () => {
  // The bound is what guarantees a *generated* route cannot outgrow the ceiling
  // however many holes Phase 3 places in it, so the arithmetic is worth stating
  // once here rather than trusting the derivation to stay conservative.
  assert.ok(
    LIBRARY_MAX_DRAW_CALLS + NON_LEVEL_RESERVE.drawCalls <= RENDER_BUDGET.maxDrawCalls,
    'the hazard family took the library over the ceiling',
  );

  const withHazards = planRenderCost(hazardPlan());
  const without = planRenderCost(buildLevelPlan(
    [{ id: 'road', length: 80, halfWidth: 6, surface: 'pavement' }],
    {
      id: 'hazard-cost-probe',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'grass' },
    },
  ));
  // The asphalt mesh, the water mesh, and the spill's heightfield group.
  assert.equal(withHazards.colourDrawCalls - without.colourDrawCalls, 3);
  assert.equal(withHazards.shadowDrawCalls, without.shadowDrawCalls);
});

// ---------------------------------------------------------------------------
// The terrain-coverage extraction
// ---------------------------------------------------------------------------

test('moving the coverage rule out of render/terrain.ts changed no geometry', () => {
  // `level/terrainCoverage.ts` was lifted verbatim out of `render/terrain.ts` at
  // M12 Phase 0 so that the budget model and the renderer share one rule rather
  // than describing the same ground twice (invariant 2). These are the counts
  // the renderer produced *before* the move, taken from the shipped code.
  const measured = measureLevelScene(slice);
  assert.equal(measured.cellsDrawn, 43_144, 'ground cells drawn');
  assert.equal(measured.byCategory.heightfield.drawCalls, 6, 'surfaces present');
  assert.equal(measured.byCategory.heightfield.triangles, 86_288);
  assert.equal(
    measured.meshes.find((mesh) => mesh.name === 'level-field')?.triangles,
    49_470,
    'surround field triangles',
  );
  assert.equal(measured.totalDrawCalls, 45);
  // The whole-scene total is the one number here the move was never about, and
  // the one that has since moved: 204,090 before the fixes that came out of the
  // owner's second ride (`planDigest.test.ts`), 204,106 after. Every terrain
  // count above — the cells, the surfaces, the surround field — is unchanged,
  // which is what this test is for.
  assert.equal(measured.totalTriangles, 204_106);

  const provingMeasured = measureLevelScene(proving);
  assert.equal(provingMeasured.cellsDrawn, 28_288);
  assert.equal(provingMeasured.totalDrawCalls, 17);
  assert.equal(provingMeasured.totalTriangles, 113_564);
});

// ---------------------------------------------------------------------------
// M39: the instrument measures an Ultra rung too
// ---------------------------------------------------------------------------

test('the ordinary measurement is the call it always was', () => {
  // `measureLevelScene` and `measurePartTriangles` accept any recipe the
  // renderer can build from M39 on; with no recipe, or an ordinary one, they
  // build with no Ultra context and must measure exactly what they did.
  assert.deepEqual(measureLevelScene(slice), measureLevelScene(slice, BASELINE_PRESENTATION));
  assert.deepEqual(
    Object.fromEntries(measurePartTriangles()),
    Object.fromEntries(measurePartTriangles(BASELINE_PRESENTATION)),
  );
});

test('an Ultra rung is measured with a headless context, in the ordinary buckets', () => {
  const context = headlessUltraContext(ULTRA_LIT);
  assert.equal(context.recipe, ULTRA_LIT);
  assert.equal(context.maxAnisotropy, 1, 'no device under node --test');
  // §5 layer 2: Ultra meshes keep the level-props-* / level-blocks-* names,
  // so `categoryOf` needs no change and every mesh lands where it did.
  const enhanced = measureLevelScene(slice, ENHANCED_PRESENTATION);
  for (const rung of ULTRA_LADDER) {
    const ultra = measureLevelScene(slice, rung);
    assert.deepEqual(
      ultra.meshes.map((mesh) => `${categoryOf(mesh.name)}:${mesh.name}:${mesh.calls}:${mesh.instances}`),
      enhanced.meshes.map((mesh) => `${categoryOf(mesh.name)}:${mesh.name}:${mesh.calls}:${mesh.instances}`),
      `${rung.id}: same meshes, same groups, same instances, same categories`,
    );
    assert.equal(ultra.cellsDrawn, enhanced.cellsDrawn, `${rung.id}: no heightfield cell added or dropped`);
    assert.equal(ultra.byCategory.heightfield.triangles, enhanced.byCategory.heightfield.triangles,
      `${rung.id}: the ground gains attributes, never triangles`);
  }
  // Every part the kit builds is measured under the full rung as well.
  assert.deepEqual([...measurePartTriangles(ULTRA_FULL).keys()].sort(), [...PROP_PART_IDS].sort());
});
