/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MARKINGS, PAINTABLE_SURFACES } from '../data/markings.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { buildLevelPlan } from './buildPlan.ts';
import { generateLevel } from './generateRoute.ts';
import type { LevelPlan } from './plan.ts';
import { roadConnectorMarkings } from './roadConnectorMarkings.ts';
import { LIBRARY_CONNECTORS } from './segmentLibrary.ts';
import { centrelineAt, headingAt, leftOf, markingsOf, placeGraph } from './segments.ts';

const OPTIONS = {
  id: 'road-purpose-fixture',
  spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
  surround: { height: 0, surface: 'grass' as const },
};
const roads = LIBRARY_CONNECTORS.filter(piece => piece.id.startsWith('link-road-'));
const withoutPaint = (plan: LevelPlan): Omit<LevelPlan, 'markings'> => {
  const { markings: _markings, ...rest } = plan;
  return rest;
};

test('only the five explicit road connector templates gain city-road grammar', () => {
  assert.equal(roads.length, 5);
  for (const piece of LIBRARY_CONNECTORS) {
    const spec = piece.main[0];
    if (!piece.id.startsWith('link-road-')) {
      assert.equal(spec.markings, undefined, `${piece.id} is a path/trail/gravel/rough join`);
      continue;
    }
    assert.deepEqual(spec.markings?.map(mark => [mark.role, mark.broken === true, mark.paint]), [
      ['centre', true, 'road'], ['edge', false, 'road'], ['edge', false, 'road'],
    ]);
    assert.equal(spec.blocks, undefined);
    assert.equal(spec.props, undefined);
    // Known-bad control: the old neutral no-paint template satisfies all its
    // physical contracts but fails this actual paint coverage requirement.
    assert.equal(buildLevelPlan([{ ...spec, markings: undefined }], OPTIONS).markings, undefined);
    assert.equal(buildLevelPlan([spec], OPTIONS).markings?.length, 3, `${piece.id}: a clean road needs no split runs`);
  }
});

test('road paths use the actual join length and leave no short paint flecks', () => {
  for (const length of [2.0, 2.03, 16, 20.94395102393195, 70, 91.7]) {
    const marks = roadConnectorMarkings(length, 8.5);
    if (length < MARKINGS.minRunLength + 0.04) {
      assert.deepEqual(marks, []);
      continue;
    }
    assert.equal(marks.length, 3);
    for (const mark of marks) {
      assert.equal(mark.path[0].s, 0.02);
      assert.equal(mark.path[1].s, length - 0.02);
    }
  }
});

test('curved and graded road paint follows the analytic corridor and finished ground', () => {
  for (const piece of roads) {
    const spec = piece.main[0];
    const placed = placeGraph({ main: [spec] }, OPTIONS.spawn)[0];
    const authored = markingsOf(placed);
    for (const [index, mark] of authored.entries()) {
      const t = spec.markings![index].path[0].t;
      for (const [sample, point] of mark.points.entries()) {
        const s = 0.02 + (spec.length - 0.04) * sample / (mark.points.length - 1);
        const centre = centrelineAt(placed.entry, spec, s);
        const left = leftOf(headingAt(placed.entry, spec, s));
        assert.ok(Math.hypot(point.x - centre.x - left.x * t, point.z - centre.z - left.z * t) < 1e-10);
      }
    }
    const plan = buildLevelPlan([spec], OPTIONS);
    const sampler = new PlanTerrainSampler(plan), ground = createGroundSample();
    for (const mark of plan.markings!) for (const point of mark.points) {
      sampler.sampleGround(point.x, point.z, ground);
      assert.ok(PAINTABLE_SURFACES.includes(ground.surface));
      assert.ok(Math.abs(point.y - ground.height - MARKINGS.lift) < 1e-10);
    }
  }
});

test('new road paint clips away from unpaintable verge bands and actual solid blocks', () => {
  const road = roads.find(piece => piece.id === 'link-road-straight')!.main[0];
  const grassEdge = buildLevelPlan([{ ...road, bands: [{ from: 6, to: 8.5, surface: 'grass' }] }], OPTIONS);
  assert.equal(grassEdge.markings!.length, 2, 'centre and opposite edge survive; grass takes no edge paint');
  assert.ok(grassEdge.markings!.every(mark => mark.points.every(point => point.x < 6)));
  const blocked = buildLevelPlan([{ ...road, blocks: [{ s: 20, t: 0, halfAlong: 1, halfLateral: 1, height: 1, surface: 'wood' }] }], OPTIONS);
  const centres = blocked.markings!.filter(mark => mark.dash > 0);
  assert.equal(centres.length, 2, 'centre paint stops before the real block and resumes after it');
  for (const mark of centres) assert.ok(mark.points.every(point => point.z < 19 || point.z > 21));
});

test('lane paint changes no physical or other non-marking plan data', () => {
  for (const piece of roads) {
    const spec = piece.main[0];
    const before = buildLevelPlan([{ ...spec, markings: undefined }], OPTIONS);
    const after = buildLevelPlan([spec], OPTIONS);
    assert.deepEqual(withoutPaint(after), withoutPaint(before));
    const a = new PlanTerrainSampler(before), b = new PlanTerrainSampler(after);
    const p = placeGraph({ main: [spec] }, OPTIONS.spawn)[0];
    for (let s = -2; s <= spec.length + 2; s += 0.73) for (const t of [-9, -7.7, -3, 0, 3, 7.7, 9]) {
      const centre = centrelineAt(p.entry, spec, s), left = leftOf(headingAt(p.entry, spec, s));
      const x = centre.x + left.x * t, z = centre.z + left.z * t;
      assert.deepEqual(a.sampleGround(x, z, createGroundSample()), b.sampleGround(x, z, createGroundSample()));
    }
  }
});

test('accepted generated steering joins and closure regenerate paint at their actual length', () => {
  const { layout, report } = generateLevel('euc');
  assert.equal(report.usedFallback, false);
  let variedLength = 0, curved = 0, unpaintedOtherPurpose = 0;
  for (const { spec } of layout.placed) {
    if (!spec.id.startsWith('link-') && !spec.id.startsWith('close-')) continue;
    const road = spec.id.startsWith('link-road-') || (spec.id.startsWith('close-') && (spec.markings?.length ?? 0) > 0);
    if (!road) {
      assert.equal(spec.markings, undefined, `${spec.id}: another connector purpose acquired city-road lanes`);
      unpaintedOtherPurpose += 1;
      continue;
    }
    assert.deepEqual(spec.markings, roadConnectorMarkings(spec.length, spec.halfWidth), spec.id);
    if (Math.abs(spec.length - 40) > 1e-6) variedLength += 1;
    if (Math.abs(spec.curvature ?? 0) > 0) curved += 1;
  }
  assert.ok(variedLength > 0, 'the control must expose the old copied forty-metre template error');
  assert.ok(curved > 0, 'the control must exercise curved road joins');
  assert.ok(unpaintedOtherPurpose > 0, 'the control must retain intentional unmarked connector families');
});
