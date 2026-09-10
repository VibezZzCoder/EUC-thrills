/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  NON_LEVEL_RESERVE,
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
const generated = generateLevel('route-41', undefined, undefined, 65).plan;

const WORLDS: readonly [string, LevelPlan][] = [
  ['the slice', slice],
  ['BelVar', track],
  ['the proving ground', proving],
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
    if ((plan.props ?? []).length > 0) {
      assert.ok(enhanced.triangles > baseline.triangles, `${name} gained no triangles`);
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

test('the solo contract is the tightest of the three per level, so it is the one that decides', () => {
  // Contract 1 leaves 406,726 level triangles; Contract 2 leaves 411,726 per
  // pass and Contract 3 412,756. A level that fits solo fits both split
  // frames, which is why no fixture can make the selector refuse on a split
  // ceiling alone — recorded here so nobody spends a night looking for one.
  const solo = RENDER_BUDGET.maxTriangles - NON_LEVEL_RESERVE.triangles;
  const split = RENDER_BUDGET_SPLIT.maxTriangles / SPLIT_PASSES - SPLIT_NON_LEVEL_RESERVE.triangles;
  const quad = RENDER_BUDGET_QUAD.maxTriangles / QUAD_PASSES - QUAD_NON_LEVEL_RESERVE.triangles;
  assert.ok(solo < split, `solo room ${solo} is not under split room ${split}`);
  assert.ok(solo < quad, `solo room ${solo} is not under quad room ${quad}`);
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

test('selecting never changes what the plan is', () => {
  const before = canonicalPlanString(generated);
  selectPresentation(generated);
  assert.equal(canonicalPlanString(generated), before);
});
