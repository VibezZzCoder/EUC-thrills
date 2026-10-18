/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** `planRenderCost` once per plan per construction scope (2026-10-18, boot CPU):
 * every presentation rung, the terrain's admission re-check and every Ultra
 * rung read one answer, and every verdict is what the unscoped call gives. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan } from '../level/plan.ts';
import { planRenderCost } from '../level/renderBudget.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createSwitchbackLevel } from '../level/switchbackLevel.ts';
import { createTrackLevel } from '../level/trackLevel.ts';
import { beginConstructionScope } from './constructionScope.ts';
import { BASELINE_PRESENTATION, ENHANCED_PRESENTATION, judgePresentation, presentationCost, selectPresentation } from './presentation.ts';
import { scopedPlanRenderCost } from './scopedRenderCost.ts';
import { prepareSharedGroundEdges } from './sharedGroundEdgePlan.ts';
import { judgeUltra } from './ultra/ultraCost.ts';

const CAPS = { webgl2: true, halfFloatRenderable: true, maxTextureSize: 8192 } as const;
function inScope<T>(build: () => T): T {
  const end = beginConstructionScope();
  try { return build(); } finally { end(); }
}
const json = (value: unknown) => JSON.stringify(value, (_, v) => v instanceof Map ? [...v] : v);

test('one answer per plan inside a scope, a fresh one outside, and never another plan\'s', () => {
  const a = createSliceLevel(), b = createTrackLevel();
  const outside = scopedPlanRenderCost(a);
  assert.notEqual(scopedPlanRenderCost(a), outside, 'outside a scope every call computes');
  assert.equal(json(outside), json(planRenderCost(a)));
  inScope(() => {
    const first = scopedPlanRenderCost(a);
    assert.equal(scopedPlanRenderCost(a), first, 'inside, the same plan reads one answer');
    const other = scopedPlanRenderCost(b);
    assert.notEqual(other, first);
    assert.equal(json(other), json(planRenderCost(b)), 'a second plan in the same scope gets its own answer');
    assert.equal(json(first), json(outside));
  });
  // Negative control: the answer is keyed by the plan object and dies with the
  // scope. A plan changed after the scope is priced afresh, never from a stale entry.
  inScope(() => scopedPlanRenderCost(a));
  (a.props as unknown[]).splice(0, 5);
  assert.notEqual(json(scopedPlanRenderCost(a)), json(outside), 'the changed plan is priced afresh after the scope');
  inScope(() => assert.equal(json(scopedPlanRenderCost(a)), json(planRenderCost(a))));
});

test('every ordinary and Ultra verdict inside a scope equals the unscoped verdict', () => {
  const worlds: [string, LevelPlan][] = [['slice', createSliceLevel()], ['switchback', createSwitchbackLevel()],
    ['euc', generateLevel('euc').plan]];
  for (const [name, plan] of worlds) {
    const edges = prepareSharedGroundEdges(plan).price;
    const ask = () => ({
      selection: selectPresentation(plan, edges),
      baseline: judgePresentation(plan, BASELINE_PRESENTATION, edges),
      enhanced: judgePresentation(plan, ENHANCED_PRESENTATION, edges),
      bare: presentationCost(plan, BASELINE_PRESENTATION),
      ultra: judgeUltra(plan, CAPS, null, edges),
    });
    const outside = json(ask());
    const scoped = inScope(() => {
      const first = ask(), second = ask();
      assert.equal(json(first), json(second), `${name}: repeat questions inside one scope agree`);
      return json(first);
    });
    assert.equal(scoped, outside, `${name}: scoped verdicts equal the historical ones`);
  }
});
