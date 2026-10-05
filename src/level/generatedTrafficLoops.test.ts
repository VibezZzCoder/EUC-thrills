/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Whole-loop vehicle authoring and finished-pavement controls. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { districtBlock, type RingQuarter } from './cityRing.ts';
import type { GroundSurfacePatch, LevelPlan } from './plan.ts';
import { buildPopulationPlan, emitPopulationPaths } from './populationPlan.ts';
import { placeGraph, type PlacedSegment } from './segments.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { generatedTrafficLoopCandidates, validateGeneratedTrafficLoops } from './generatedTrafficLoops.ts';

const spawn = { position: { x: 0, y: 0, z: 0 }, headingY: 0 };
function flatPlan(sources: readonly PlacedSegment[]): LevelPlan {
  return { id: 'traffic-authoring-fixture', spawn: { position: { x: -80, y: 0, z: -80 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, heightfield: {
      originX: -100, originZ: -100, spacing: 1, columns: 201, rows: 201,
      heights: new Array<number>(201 * 201).fill(0), surfaces: new Array<SurfaceId>(200 * 200).fill('pavement'),
    }, segments: sources.map(p => ({ id: p.spec.id, entry: p.entry, exit: p.exit, colliders: [] })), checkpoints: [] };
}
function circleTraffic() {
  const sources = placeGraph({ main: [{ id: 'real-vehicle-circle', length: Math.PI * 60,
    halfWidth: 6, curvature: 1 / 30, surface: 'pavement' }] }, spawn);
  const [source] = emitPopulationPaths(sources, [{ id: 'real-traffic-loop', role: 'traffic', district: 'commercial', closed: true,
    steps: [{ segmentId: sources[0].spec.id, fromS: 0, toS: sources[0].spec.length,
      lateralMetres: 0, halfWidthMetres: 3 }] }]);
  return { plan: flatPlan(sources), source };
}

test('a genuinely curved vehicle loop passes; thin finished brick paving fails its full road footprint', () => {
  const { plan, source } = circleTraffic();
  assert.equal(validateGeneratedTrafficLoops(plan, [source]).authored.length, 1);
  const a = { x: 29.2, y: 0, z: 29.999 }, b = { x: 29.8, y: 0, z: 29.999 };
  const c = { x: 29.2, y: 0, z: 29.9995 }, d = { x: 29.8, y: 0, z: 29.9995 };
  const patch: GroundSurfacePatch = { id: 'half-millimetre-sidewalk', surface: 'brick',
    triangles: [{ cell: 129 * 200 + 129, vertices: [a, d, b] }, { cell: 129 * 200 + 129, vertices: [a, c, d] }] };
  const changed = { ...plan, groundSurfacePatches: [patch] };
  assert.equal(buildPopulationPlan(changed, [source]).paths.length, 1);
  const result = validateGeneratedTrafficLoops(changed, [source]);
  assert.equal(result.authored.length, 0);
  assert.ok(result.rejected.some(r => r.reason.includes('finished road footprint')));
});

test('an original hazard discards the entire traffic loop instead of emitting a reversing remainder', () => {
  const { plan, source } = circleTraffic();
  plan.hazards = [{ id: 'original-hole', kind: 'potholeDeep', centre: { x: 30, y: 0, z: 30 }, radius: 0.05 }];
  const result = validateGeneratedTrafficLoops(plan, [source]);
  assert.equal(result.authored.length, 0);
  assert.ok(result.rejected.some(r => r.reason.includes('hazard')));
  assert.ok(result.missingDistrictLoops.includes('commercial'));
});

test('actual district candidates stay finite, identify original roads and contain sampled radius turns', () => {
  const block = districtBlock('commercial', () => 0.5, () => 0.5);
  const sources = placeGraph({ main: block.main, branches: block.branches }, spawn);
  const quarters = new Map<string, RingQuarter>(sources.map(p => [p.spec.id, 'downtown']));
  const before = JSON.stringify(sources);
  const candidates = generatedTrafficLoopCandidates(sources, quarters);
  assert.ok(candidates.length <= 24);
  const originalIds = new Set(sources.map(s => s.spec.id));
  for (const candidate of candidates) {
    assert.ok(candidate.closed && !candidate.serviceShuttle);
    assert.ok(candidate.frames.every(f => originalIds.has(f.sourceSegmentId)));
    assert.ok(candidate.frames.some((f, i) => i > 0 && Math.abs(f.headingY - candidate.frames[i - 1].headingY) > 1e-5));
  }
  assert.deepEqual(candidates, generatedTrafficLoopCandidates(sources, quarters));
  assert.equal(JSON.stringify(sources), before);
  // A finite strategy proves neither a nonzero census nor sufficient layout.
  const absent = validateGeneratedTrafficLoops(flatPlan(sources), []);
  assert.equal(absent.authored.length, 0);
  assert.deepEqual(absent.missingDistrictLoops, ['commercial', 'residential']);
});
