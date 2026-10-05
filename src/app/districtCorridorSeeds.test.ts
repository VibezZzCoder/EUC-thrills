/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** District finishing on real generated routes keeps the builder's one prop
 * rule: nothing it adds stands within PROP_CORRIDOR_CLEARANCE of a riding
 * corridor. A generation survey (about 4 s a seed); judged against the
 * generator's own placed corridors, not the preparation's reconstruction. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PROP_FOOTPRINTS, PROP_SOLIDS } from '../data/props.ts';
import { PROP_CORRIDOR_CLEARANCE } from '../level/buildPlan.ts';
import { withDistrictAdjacency } from '../level/districtAdjacency.ts';
import { environmentSites } from '../level/environmentSites.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { prepareLivingWorldGround } from '../level/livingWorldGround.ts';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { withPopulationAuthoringMemo } from '../level/populationPlan.ts';
import { querySegment, type PlacedSegment } from '../level/segments.ts';
import { preparePopulationWorld } from './populationWorld.ts';
import { withStreetGround } from './streetGround.ts';

// 2026-10-03 (LC-3): about one seed in eight put a 2.8 m solid broadleaf trunk
// on a corridor's own grass verge; these five did on the baseline.
const FAILED_ON_BASELINE = ['marble-lane-23', 'jetty-span-73', 'opal-fall-97', 'zephyr-tower-26', 'sweep-19'];
const SEEDS = [...FAILED_ON_BASELINE, 'amber-ridge-63', 'brisk-drift-20', 'copper-arch-57', 'corner', 'dusty-kerb-13',
  'dusty-vault-93', 'ember-hill-50', 'euc', 'euc-7', 'fern-edge-87', 'fern-ridge-6', 'glass-orchard-43', 'harbour-arch',
  'harbour-lane-80', 'harbour-spark-42', 'ivory-vault-36', 'kestrel-edge-30', 'lantern-bay-67', 'nimbus-isle-60',
  'opal-span-16', 'pewter-pier-53', 'quarry-bay-10', 'quarry-mill-90', 'route-12', 'route-41', 'rust-wharf-46',
  'slate-isle-3', 'slate-tower-83', 'sweep-15', 'sweep-4', 'tidal-fall-40', 'umber-cove-77', 'velvet-mill-33',
  'willow-junction-70', 'x67'];

/** `buildPlan.standsOnCorridor`'s samples, plus the solid's corners. */
function closest(placed: readonly PlacedSegment[], prop: Prop): { metres: number; segment: string } {
  const { x, z } = prop.position, cos = Math.cos(prop.rotationY), sin = Math.sin(prop.rotationY);
  const points: [number, number][] = [[x, z]];
  const box = (halfX: number, halfZ: number) => {
    for (const [dx, dz] of [[-halfX, -halfZ], [0, -halfZ], [halfX, -halfZ], [-halfX, 0], [halfX, 0],
      [-halfX, halfZ], [0, halfZ], [halfX, halfZ]]) points.push([x + cos * dx + sin * dz, z - sin * dx + cos * dz]);
  };
  const footprint = PROP_FOOTPRINTS[prop.kind], solid = PROP_SOLIDS[prop.kind];
  if (footprint.shape === 'circle') {
    for (let i = 0; i < 16; i++) points.push([x + Math.cos(i * Math.PI / 8) * footprint.radius * prop.scale,
      z + Math.sin(i * Math.PI / 8) * footprint.radius * prop.scale]);
  } else box(footprint.halfX * prop.scale, footprint.halfZ * prop.scale);
  if (solid) box(solid.halfX * prop.scale, solid.halfZ * prop.scale);
  let best = { metres: Infinity, segment: '' };
  for (const [px, pz] of points) for (const segment of placed) {
    const query = querySegment(segment, px, pz);
    if (query && query.outside < best.metres) best = { metres: query.outside, segment: segment.spec.id };
  }
  return best;
}

function assertClear(seed: string, source: LevelPlan, finished: LevelPlan, placed: readonly PlacedSegment[]): void {
  for (const [index, prop] of (finished.props ?? []).slice(source.props?.length ?? 0).entries()) {
    if (!PROP_SOLIDS[prop.kind]) continue; // render-only crowns and caps, as in the builder
    const near = closest(placed, prop);
    assert.ok(near.metres >= PROP_CORRIDOR_CLEARANCE, `${seed}: added ${prop.kind} #${index} stands `
      + `${near.metres.toFixed(2)} m from ${near.segment}`);
  }
}

for (const seed of SEEDS) {
  test(`${seed}: district public groups stand clear of every riding corridor`, () => {
    const generated = generateLevel(seed);
    assert.equal(generated.report.usedFallback, false);
    const source = generated.plan;
    const street = withStreetGround(source);
    const finished = withPopulationAuthoringMemo(() =>
      withDistrictAdjacency(prepareLivingWorldGround(street).level));
    assertClear(seed, source, finished, generated.layout.placed);
    // 2026-10-04: the living world's parking bay paved over the furnished
    // industrial bay on most routes; every exemplar the street had survives.
    const kept = new Set(environmentSites(finished).map(site => site.id));
    for (const site of environmentSites(street)) assert.ok(kept.has(site.id), `${seed}: the living world removed ${site.id}`);
    if (FAILED_ON_BASELINE.includes(seed)) {
      // Only the tree went: the frontage keeps its seating, bin and planting.
      const groups = finished.districtAdjacency!.groups.map(group => group.propIndices.map(i => finished.props![i].kind));
      assert.ok(groups.some(kinds => kinds.join() === 'bench,litterBin,shrub,shrub,shrub'),
        `${seed}: ${JSON.stringify(groups)}`);
    }
  });
}

for (const seed of ['marble-lane-23', 'jetty-span-73']) {
  test(`${seed}: every finished district stage keeps the corridors clear`, () => {
    const generated = generateLevel(seed);
    assertClear(seed, generated.plan, preparePopulationWorld(generated.plan).level, generated.layout.placed);
  });
}
