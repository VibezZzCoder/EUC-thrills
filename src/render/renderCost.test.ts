/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  LEVEL_GEOMETRY_COST,
  LIBRARY_MAX_DRAW_CALLS,
  NON_LEVEL_RESERVE,
  PART_COSTS,
  PROP_PART_IDS,
  RENDER_BUDGET,
  propPartCounts,
  type PropPartId,
} from '../data/renderCost.ts';
import { PROP_KINDS } from '../data/props.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan } from '../level/plan.ts';
import { planRenderCost, withinRenderBudget } from '../level/renderBudget.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { terrainCells } from '../level/terrainCoverage.ts';
import {
  measureLevelScene,
  measureNonLevelScene,
  measurePartTriangles,
  measurePropKinds,
} from './renderCost.ts';

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
  for (const seed of ['sweep-0', 'sweep-11', 'sweep-29']) {
    const plan = generateLevel(seed).plan;
    const measured = measureLevelScene(plan);
    const predicted = planRenderCost(plan);

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
  assert.match(verdict.breaches[0], /triangles against a ceiling of 400000/);
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
