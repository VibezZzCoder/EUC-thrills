/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  PART_COSTS,
  QUAD_NON_LEVEL_RESERVE,
  QUAD_PASSES,
  RENDER_BUDGET,
  RENDER_BUDGET_QUAD,
  RENDER_BUDGET_SPLIT,
  SPLIT_NON_LEVEL_RESERVE,
  SPLIT_PASSES,
} from '../data/renderCost.ts';
import { PROP_BUDGET } from '../data/props.ts';
import { canonicalPlanString } from '../level/planDigest.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { createProvingGround } from '../level/provingGround.ts';
import {
  frameRenderCost,
  planRenderCost,
  withinQuadRenderBudget,
  withinRenderBudget,
  withinSplitRenderBudget,
} from '../level/renderBudget.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createSwitchbackLevel } from '../level/switchbackLevel.ts';
import { createTrackLevel } from '../level/trackLevel.ts';
import { ENHANCED_PART_COSTS, ENHANCED_PART_IDS } from './enhancedCatalog.ts';
import {
  BASELINE_PRESENTATION,
  ENHANCED_PRESENTATION,
  PRESENTATION_LADDER,
  judgePresentation,
  presentationCost,
  selectPresentation,
} from './presentation.ts';
import { forcedPresentation } from './Renderer.ts';
import { measureLevelScene, measurePartTriangles } from './renderCost.ts';
import { createTerrain } from './terrain.ts';

/**
 * The presentation selector, held to the same standard as the admission
 * model: a prediction is worth nothing unless the built scene equals it, for
 * *both* recipes, and a boundary is worth nothing unless a fixture sits on
 * each side of it.
 *
 * Draw calls, triangles and instance counts are reportable; a frame interval
 * is not (`AGENTS.md`).
 */

const slice = createSliceLevel();
const track = createTrackLevel();
const proving = createProvingGround();
const switchback = createSwitchbackLevel();
const generated = generateLevel('route-41', undefined, undefined, 65).plan;

const WORLDS: readonly [string, LevelPlan][] = [
  ['the slice', slice],
  ['BelVar', track],
  ['the proving ground', proving],
  ['Switchback Park', switchback],
  ['route-41 at 65 mph', generated],
];

// ---------------------------------------------------------------------------
// The baseline rung restates the admission model, exactly
// ---------------------------------------------------------------------------

for (const [name, plan] of WORLDS) {
  test(`the baseline recipe's cost for ${name} is the admission model's answer, to the triangle`, () => {
    const cost = presentationCost(plan, BASELINE_PRESENTATION);
    const model = planRenderCost(plan);
    assert.equal(cost.drawCalls, model.drawCalls);
    assert.equal(cost.triangles, model.triangles);
    assert.equal(cost.colourTriangles, model.colourTriangles);
    assert.equal(cost.shadowTriangles, model.shadowTriangles);
    assert.deepEqual(cost.frame.solo, frameRenderCost(plan));
    assert.deepEqual(cost.frame.solo, withinRenderBudget(plan).frame);
    assert.deepEqual(cost.frame.split, withinSplitRenderBudget(plan).frame);
    assert.deepEqual(cost.frame.quad, withinQuadRenderBudget(plan).frame);
  });
}

// ---------------------------------------------------------------------------
// Both recipes: the prediction equals the built scene
// ---------------------------------------------------------------------------

for (const [name, plan] of WORLDS) {
  for (const recipe of PRESENTATION_LADDER) {
    test(`${name} under the ${recipe.id} recipe is predicted exactly`, () => {
      const predicted = presentationCost(plan, recipe);
      const measured = measureLevelScene(plan, recipe);
      assert.equal(measured.totalDrawCalls, predicted.drawCalls, 'draw calls');
      assert.equal(measured.drawCalls + 0, predicted.drawCalls - measured.shadowDrawCalls, 'colour draw calls');
      assert.equal(measured.triangles, predicted.colourTriangles, 'colour triangles');
      assert.equal(measured.shadowTriangles, predicted.shadowTriangles, 'shadow triangles');
      assert.equal(measured.totalTriangles, predicted.triangles, 'triangles');
      const props = measured.byCategory.props;
      assert.equal(props.totalDrawCalls, predicted.propDrawCalls, 'prop draw calls');
      assert.equal(props.totalTriangles, predicted.propTriangles, 'prop triangles');
      assert.equal(props.triangles, predicted.propColourTriangles, 'prop colour triangles');
      assert.equal(measured.byCategory.blocks.triangles, predicted.blockColourTriangles, 'block triangles');
    });
  }
}

test('the enhanced recipe changes triangles and nothing else about a scene', () => {
  for (const [name, plan] of WORLDS) {
    const baseline = measureLevelScene(plan, BASELINE_PRESENTATION);
    const enhanced = measureLevelScene(plan, ENHANCED_PRESENTATION);
    assert.equal(enhanced.totalDrawCalls, baseline.totalDrawCalls, `${name} draw calls moved`);
    assert.equal(enhanced.shadowDrawCalls, baseline.shadowDrawCalls, `${name} shadow draw calls moved`);
    assert.equal(enhanced.cellsDrawn, baseline.cellsDrawn, `${name} cells moved`);
    assert.deepEqual(
      enhanced.meshes.map((mesh) => [mesh.name, mesh.instances, mesh.castsShadow]),
      baseline.meshes.map((mesh) => [mesh.name, mesh.instances, mesh.castsShadow]),
      `${name} buckets, instances or shadow flags moved`,
    );
    for (const category of ['surround', 'heightfield', 'markings', 'hazards', 'targets'] as const) {
      assert.deepEqual(enhanced.byCategory[category], baseline.byCategory[category], `${name} ${category} moved`);
    }
    // **Props alone are not the condition; an enhanced *part* is.** The
    // enhanced kit re-prices crowns, conifers, shrubs and facades and nothing
    // else, so a world whose only props are M36's signposts — two boxes, both
    // at their baseline price — is a world the recipe has nothing to spend on.
    // Before Switchback's signage every propped world in this list had foliage
    // in it, which is why the test could ask the shorter question.
    //
    // The model is asked first and the scene has to agree with it: that the
    // recipe *predicts* a gain and the built scene does not is the failure this
    // is really looking for, and a world with nothing to enhance still has to
    // come back identical rather than merely "not more".
    const priced = presentationCost(plan, ENHANCED_PRESENTATION).triangles
      - presentationCost(plan, BASELINE_PRESENTATION).triangles;
    if (priced > 0) {
      assert.ok(enhanced.triangles > baseline.triangles, `${name} gained no triangles`);
    } else {
      assert.equal(enhanced.triangles, baseline.triangles, `${name} gained triangles it cannot have`);
    }
  }
});

test('rendering under either recipe mutates nothing in the plan', () => {
  for (const [name, plan] of WORLDS) {
    const before = canonicalPlanString(plan);
    for (const recipe of PRESENTATION_LADDER) {
      const view = createTerrain(plan, recipe);
      view.dispose();
    }
    assert.equal(canonicalPlanString(plan), before, `${name} was mutated by rendering`);
  }
});

// ---------------------------------------------------------------------------
// The catalogue is measured, never authored
// ---------------------------------------------------------------------------

test('ENHANCED_PART_COSTS is what the enhanced kit actually builds, and every other part is the baseline price', () => {
  const measured = measurePartTriangles(ENHANCED_PRESENTATION);
  for (const part of ENHANCED_PART_IDS) {
    const built = measured.get(part);
    assert.ok(built !== undefined, `${part} is in the catalogue but the kit never built it`);
    assert.equal(built.triangles, ENHANCED_PART_COSTS[part]!.triangles, `${part} triangles`);
    assert.equal(built.castsShadow, ENHANCED_PART_COSTS[part]!.castsShadow, `${part} shadow flag`);
    assert.equal(built.castsShadow, PART_COSTS[part].castsShadow, `${part} changed its shadow flag`);
    assert.ok(built.triangles > PART_COSTS[part].triangles, `${part} is not richer than the baseline`);
  }
  for (const [part, built] of measured) {
    if (ENHANCED_PART_IDS.includes(part as (typeof ENHANCED_PART_IDS)[number])) continue;
    const baseline = PART_COSTS[part as keyof typeof PART_COSTS];
    assert.ok(baseline !== undefined, `${part} is not a catalogued part`);
    assert.equal(built.triangles, baseline.triangles, `${part} changed under the enhanced recipe without a catalogue entry`);
  }
});

test('the enhanced allowance is the audit\'s prototype: eighty a crown, forty-eight a conifer', () => {
  assert.equal(ENHANCED_PART_COSTS.crown?.triangles, 80);
  assert.equal(ENHANCED_PART_COSTS.coniferFoliage?.triangles, 48);
  assert.deepEqual([...ENHANCED_PART_IDS], ['crown', 'coniferFoliage']);
});

// ---------------------------------------------------------------------------
// Selection: the ladder, and every boundary from both sides
// ---------------------------------------------------------------------------

test('the ladder is richest first and ends in the baseline', () => {
  assert.equal(PRESENTATION_LADDER[0].id, 'enhanced');
  assert.equal(PRESENTATION_LADDER[PRESENTATION_LADDER.length - 1].id, 'baseline');
  assert.equal(BASELINE_PRESENTATION.foliage, false);
  assert.equal(BASELINE_PRESENTATION.walls, false);
  assert.equal(ENHANCED_PRESENTATION.foliage, true);
  assert.equal(ENHANCED_PRESENTATION.walls, true);
});

test('the authored worlds and the audit\'s worst seed all take the enhanced recipe', () => {
  for (const [name, plan] of WORLDS) {
    const selection = selectPresentation(plan);
    assert.equal(selection.recipe.id, 'enhanced', `${name} fell back: ${selection.verdicts[0].breaches.join('; ')}`);
    assert.equal(selection.verdicts.length, PRESENTATION_LADDER.length);
    assert.deepEqual(selection.cost, selection.verdicts[0].cost);
  }
});

/** A plan of `count` conifers and `shrubs` shrubs on the proving ground, spaced apart. */
function coniferPlan(count: number, shrubs = 0): LevelPlan {
  const props: Prop[] = [];
  for (let index = 0; index < count + shrubs; index += 1) {
    props.push({
      kind: index < count ? 'conifer' : 'shrub',
      position: { x: (index % 100) * 6, y: 0, z: Math.floor(index / 100) * 6 },
      rotationY: 0,
      scale: 1,
    });
  }
  return { ...createProvingGround(), props };
}

test('PROP_BUDGET.maxTriangles is a boundary: at it enhanced, one conifer over baseline', () => {
  // An enhanced conifer is 2 × 48 = 96 triangles with its shadow and a shrub
  // 2 × 20 = 40 in either recipe; 935 conifers and 6 shrubs land the family on
  // 90,000 exactly, which is the only way to test a ceiling from both sides.
  const conifer = 2 * ENHANCED_PART_COSTS.coniferFoliage!.triangles;
  const shrub = 2 * PART_COSTS.shrub.triangles;
  const shrubs = 6;
  const exact = (PROP_BUDGET.maxTriangles - shrubs * shrub) / conifer;
  assert.equal(exact, Math.floor(exact), 'the fixture must land on the ceiling exactly');

  const at = selectPresentation(coniferPlan(exact, shrubs));
  assert.equal(at.cost.propTriangles, PROP_BUDGET.maxTriangles);
  assert.equal(at.recipe.id, 'enhanced', 'a family exactly on the ceiling fits');

  const below = selectPresentation(coniferPlan(exact - 1, shrubs));
  assert.equal(below.recipe.id, 'enhanced');

  const over = selectPresentation(coniferPlan(exact + 1, shrubs));
  assert.equal(over.recipe.id, 'baseline', 'one conifer over the ceiling falls back');
  assert.match(over.verdicts[0].breaches.join('\n'), /prop triangles \(shadows included\) against a ceiling of 90000/);
  // And the fallback is the baseline rung's own cost, not a trimmed enhanced one.
  assert.equal(
    over.cost.propTriangles,
    (exact + 1) * 2 * PART_COSTS.coniferFoliage.triangles + shrubs * shrub,
  );
  assert.equal(over.cost.recipe, 'baseline');
});

test('the solo contract is a boundary the enhanced recipe is judged against, from both sides', () => {
  const each = 2 * ENHANCED_PART_COSTS.coniferFoliage!.triangles;
  const empty = presentationCost(coniferPlan(0), ENHANCED_PRESENTATION);
  const room = RENDER_BUDGET.maxTriangles - empty.frame.solo.triangles;
  const n = Math.floor(room / each);

  const at = judgePresentation(coniferPlan(n), ENHANCED_PRESENTATION);
  assert.ok(at.cost.frame.solo.triangles <= RENDER_BUDGET.maxTriangles);
  assert.ok(
    RENDER_BUDGET.maxTriangles - at.cost.frame.solo.triangles < each,
    'the fixture must sit within one conifer of the solo line',
  );
  assert.ok(!at.breaches.some((breach) => breach.startsWith('solo triangles')));

  const over = judgePresentation(coniferPlan(n + 1), ENHANCED_PRESENTATION);
  assert.ok(over.cost.frame.solo.triangles > RENDER_BUDGET.maxTriangles);
  assert.match(over.breaches.join('\n'), new RegExp(`solo triangles against a ceiling of ${RENDER_BUDGET.maxTriangles}`));

  // The two split contracts read the same level cost through their own
  // reserves and pass counts, exactly as `level/renderBudget.ts` does.
  assert.equal(at.cost.frame.split.triangles, (at.cost.triangles + SPLIT_NON_LEVEL_RESERVE.triangles) * SPLIT_PASSES);
  assert.equal(at.cost.frame.quad.triangles, (at.cost.triangles + QUAD_NON_LEVEL_RESERVE.triangles) * QUAD_PASSES);
  assert.equal(at.cost.frame.split.drawCalls, (at.cost.drawCalls + SPLIT_NON_LEVEL_RESERVE.drawCalls) * SPLIT_PASSES);
  assert.equal(at.cost.frame.quad.drawCalls, (at.cost.drawCalls + QUAD_NON_LEVEL_RESERVE.drawCalls) * QUAD_PASSES);
});

test('each multiplayer triangle ceiling is enforced independently of the solo ceiling', () => {
  // Model changes can reorder the available level headroom. Maribel's hair
  // grew the split/quad reserves while the more expensive solo look stayed
  // unchanged, making split tighter than solo. Exercise each boundary rather
  // than assuming one frame shape permanently protects the other two.
  const each = 2 * ENHANCED_PART_COSTS.coniferFoliage!.triangles;
  const empty = presentationCost(coniferPlan(0), ENHANCED_PRESENTATION);
  for (const [shape, budget, passes] of [
    ['split', RENDER_BUDGET_SPLIT, SPLIT_PASSES],
    ['quad', RENDER_BUDGET_QUAD, QUAD_PASSES],
  ] as const) {
    const room = (budget.maxTriangles - empty.frame[shape].triangles) / passes;
    const count = Math.floor(room / each);
    const at = judgePresentation(coniferPlan(count), ENHANCED_PRESENTATION);
    const over = judgePresentation(coniferPlan(count + 1), ENHANCED_PRESENTATION);
    assert.ok(at.cost.frame[shape].triangles <= budget.maxTriangles);
    assert.ok(budget.maxTriangles - at.cost.frame[shape].triangles < each * passes);
    assert.ok(!at.breaches.some((breach) => breach.includes(`${shape} triangles`)));
    assert.ok(over.cost.frame[shape].triangles > budget.maxTriangles);
    assert.ok(over.breaches.some((breach) => breach.includes(`${shape} triangles`)));
    if (shape === 'split') {
      assert.ok(over.cost.frame.solo.triangles < RENDER_BUDGET.maxTriangles,
        'this fixture must expose a split breach that solo cannot catch');
    }
  }
});

test('a fixture beyond every ceiling names every ceiling, and still falls back to the baseline', () => {
  const huge = coniferPlan(6000);
  const verdict = judgePresentation(huge, ENHANCED_PRESENTATION);
  for (const ceiling of [
    /prop triangles \(shadows included\) against a ceiling of 90000/,
    new RegExp(`solo triangles against a ceiling of ${RENDER_BUDGET.maxTriangles}`),
    new RegExp(`split triangles against a ceiling of ${RENDER_BUDGET_SPLIT.maxTriangles}`),
    new RegExp(`quad triangles against a ceiling of ${RENDER_BUDGET_QUAD.maxTriangles}`),
  ]) {
    assert.match(verdict.breaches.join('\n'), ceiling);
  }
  assert.ok(!verdict.breaches.some((breach) => breach.includes('draw calls')), 'a recipe never adds a draw call');
  const selection = selectPresentation(huge);
  assert.equal(selection.recipe.id, 'baseline');
  assert.equal(selection.cost.triangles, planRenderCost(huge).triangles, 'the fallback is the plan as admitted, untrimmed');
});

test('a fixture with every prop kind is priced under both recipes and the enhanced parts alone move', () => {
  const kinds = Object.keys(PART_COSTS);
  assert.ok(kinds.length >= 19);
  const cost = presentationCost(slice, ENHANCED_PRESENTATION);
  const baseline = presentationCost(slice, BASELINE_PRESENTATION);
  const instances = planRenderCost(slice).partInstances;
  let expected = 0;
  for (const part of ENHANCED_PART_IDS) {
    const count = instances.get(part) ?? 0;
    const delta = ENHANCED_PART_COSTS[part]!.triangles - PART_COSTS[part].triangles;
    expected += delta * count * (PART_COSTS[part].castsShadow ? 2 : 1);
  }
  assert.equal(cost.propTriangles - baseline.propTriangles, expected);
});

test('`setLevel`\u2019s recipe override builds the named rung and reports that rung\u2019s cost', () => {
  // **M36 Phase 4's diagnostic second parameter, headless** (p4-wire open
  // issue 1). `GameRenderer.setLevel(plan, recipe)` composes its selection in
  // one expression — the selector when no rung is named, `forcedPresentation`
  // when one is — and that composer is the half a headless test can reach:
  // `new GameRenderer(canvas)` wants a WebGL context and this project has
  // none, so the *installed* rungs are measured live against the GPU counters
  // in `tests/m36_4.spec.ts` and the arithmetic is pinned here.
  //
  // Switchback Park is the fixture because it is the world the parameter was
  // built for: the ladder enhances it, so forcing `baseline` is a real
  // override rather than a restatement of what the selector already chose.
  // Re-measured after ride round 1 fenced the bends inside and rebuilt the
  // kicker as a step-down (2026-09-12): baseline 160,776 level triangles
  // (the turn arrows' pads included), enhanced 176,624, and **33 draw calls either way** —
  // §36.7's "zero new call buckets", which is what makes the two rungs a
  // topology choice and not a budget one.
  const selected = selectPresentation(switchback);
  assert.equal(selected.recipe.id, 'enhanced', 'the park is no longer the enhanced fixture this needs');

  const baseline = forcedPresentation(selected, 'baseline');
  assert.equal(baseline.recipe.id, 'baseline');
  assert.equal(baseline.cost.triangles, 160_776);
  assert.equal(baseline.cost.recipe, 'baseline', 'the reported cost named the other rung');

  const enhanced = forcedPresentation(selected, 'enhanced');
  assert.equal(enhanced.recipe.id, 'enhanced');
  assert.equal(enhanced.cost.triangles, 176_624);
  assert.equal(enhanced.cost.recipe, 'enhanced');

  assert.equal(baseline.cost.drawCalls, enhanced.cost.drawCalls, 'a recipe added a draw call');
  assert.equal(baseline.cost.drawCalls, 33);

  // **The cost reported is the cost of the topology actually built.** The
  // override swaps which verdict is reported and nothing else, so each rung's
  // cost is the one the ladder priced for it — a forced selection can never
  // put the selector's cost beside the other rung's geometry.
  for (const forced of [baseline, enhanced]) {
    assert.deepEqual(forced.verdicts, selected.verdicts, 'the override lost a rung\u2019s verdict');
    const own = forced.verdicts.find((verdict) => verdict.recipe === forced.recipe.id);
    assert.deepEqual(forced.cost, own?.cost, `the ${forced.recipe.id} rung reported someone else\u2019s cost`);
  }

  // **The plan is never re-priced, so admission is untouched** — the third
  // property the override rests on, measured rather than argued.
  const before = canonicalPlanString(switchback);
  forcedPresentation(selectPresentation(switchback), 'baseline');
  assert.equal(canonicalPlanString(switchback), before);
  assert.deepEqual(selectPresentation(switchback), selected, 'forcing a rung moved the selector');

  // And naming the rung the selector already chose is the selector's own
  // selection, which is why `setLevel` short-circuits that case.
  assert.deepEqual(forcedPresentation(selected, selected.recipe.id), selected);
});

test('the baseline rung the override installs is a scene that exists, to the triangle', () => {
  // The pair above is arithmetic; this is the geometry, built. Both rungs of
  // the park are constructed headlessly and measured, so a forced `baseline`
  // cannot name a cost that no scene has.
  const selected = selectPresentation(switchback);
  for (const recipe of [BASELINE_PRESENTATION, ENHANCED_PRESENTATION]) {
    const forced = forcedPresentation(selected, recipe.id);
    const measured = measureLevelScene(switchback, recipe);
    assert.equal(measured.totalTriangles, forced.cost.triangles, `${recipe.id}: built ${measured.totalTriangles}`);
    assert.equal(measured.totalDrawCalls, forced.cost.drawCalls, `${recipe.id}: drew ${measured.totalDrawCalls} calls`);
  }
});

test('selecting never changes what the plan is', () => {
  const before = canonicalPlanString(generated);
  selectPresentation(generated);
  assert.equal(canonicalPlanString(generated), before);
});

test('a venue look is free: it changes no recipe, no call and no triangle', () => {
  // M36 Phase 4's presentation descriptor moves the sun, the sky, the haze and
  // the exposure — one directional light, one hemisphere, one shadow map, no
  // post-processing, and therefore nothing the topology selector or the
  // admission model can see (§36.7: the warm lighting recipe is a *separate*
  // presentation concern). If a look ever reached the cost model, a venue's art
  // would start deciding its geometry, which is the coupling M32 removed.
  // Asserted on the slice rather than on the park: the claim is about the
  // descriptor, not about one venue, and the slice is the world whose every
  // number this project has been re-measuring since M12.
  const lit: LevelPlan = { ...slice, look: { exposure: 1.06, sunElevation: 0.58 } };
  assert.deepEqual(selectPresentation(lit), selectPresentation(slice));
  assert.deepEqual(
    presentationCost(lit, ENHANCED_PRESENTATION),
    presentationCost(slice, ENHANCED_PRESENTATION),
  );
  assert.deepEqual(
    presentationCost(lit, BASELINE_PRESENTATION),
    presentationCost(slice, BASELINE_PRESENTATION),
  );
  // And the built scene is the same scene, measured rather than argued.
  assert.deepEqual(
    measureLevelScene(lit, ENHANCED_PRESENTATION),
    measureLevelScene(slice, ENHANCED_PRESENTATION),
  );
});
