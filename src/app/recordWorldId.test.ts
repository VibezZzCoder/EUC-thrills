/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Records, ghosts and run ids are filed under an engine-independent key
 * (LC-1/LC-2/CP-6, 2026-10-03). `plan.id` after preparation hashes raw doubles,
 * which Node and Chromium already disagree on at Switchback; the record key is
 * built from strings only and survives where the physical world did not change. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createLevel, requestRoute } from '../level/levels.ts';
import { SLICE_GRAPH } from '../level/sliceLevel.ts';
import { forwardOf } from '../level/segments.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { preparePopulationWorld, RECORD_WORLD_REVISION, recordWorldIdOf } from './populationWorld.ts';

const living = `~${RECORD_WORLD_REVISION}`;
const prepared = new Map<string, ReturnType<typeof preparePopulationWorld>>();
function venue(name: string): { source: LevelPlan; world: ReturnType<typeof preparePopulationWorld> } {
  const route = name.startsWith('generated:') ? requestRoute(name.slice(10)) : null;
  if (route && !route.ok) throw new Error(`${name} did not generate`);
  const source = route?.ok ? route.plan : createLevel(name as 'track', '');
  if (!prepared.has(name)) prepared.set(name, preparePopulationWorld(source));
  return { source, world: prepared.get(name)! };
}

test('BelVar keeps belvar-r1: preparation adds only paddock actors outside the lap, so bests and ghosts survive', () => {
  const { source, world } = venue('track');
  assert.equal(source.id, 'belvar-r1');
  assert.ok(world.population.actors.length > 0, 'the paddock is populated');
  assert.notEqual(world.level.id, source.id, 'the installed plan id still revises');
  assert.equal(world.level.recordWorldId, 'belvar-r1');
  assert.equal(recordWorldIdOf(world.level), 'belvar-r1');
  assert.equal(world.level.props, source.props);
  assert.equal(world.level.solids, source.solids);
});

test('venues whose preparation added physical content file under the builder id plus the record revision', () => {
  // The record revision moves only by hand; these are the keys saves are filed under today.
  assert.equal(RECORD_WORLD_REVISION, 'living-r1');
  for (const [name, builder] of [['slice', 'm7-slice'], ['switchback', /^switchback-r\d+$/],
    ['generated:euc', 'generated-r6-euc'], ['generated:corner', 'generated-r6-corner']] as const) {
    const { source, world } = venue(name);
    if (typeof builder === 'string') assert.equal(source.id, builder);
    else assert.match(source.id, builder);
    assert.ok((world.level.props?.length ?? 0) > (source.props?.length ?? 0), `${name}: preparation added content`);
    assert.equal(world.level.recordWorldId, `${source.id}${living}`, name);
    assert.doesNotMatch(world.level.recordWorldId!, /[0-9a-f]{32}/, `${name}: no content hash in a record key`);
    assert.notEqual(world.level.id, world.level.recordWorldId, `${name}: plan.id (population seeds) is untouched`);
    const again = preparePopulationWorld(world.level);
    assert.equal(again.level.recordWorldId, world.level.recordWorldId, `${name}: read back on re-preparation`);
    assert.equal(again.level.id, world.level.id);
  }
});

test('the proving ground and other untouched worlds keep their own id', () => {
  const { source, world } = venue('proving');
  assert.equal(world.level.recordWorldId, source.id);
  assert.equal(world.level.recordWorldId, world.level.id);
});

test('a last-bit difference in a double renames plan.id but never the record key', () => {
  // What Node and Chromium do to Math.sin/atan2/exp in the district stages.
  const walk = (nudge: number): LevelPlan => ({ id: 'record-identity-control',
    spawn: { position: { x: -25, y: 0, z: -25 }, headingY: 0 }, surround: { height: 0, surface: 'grass' },
    heightfield: { originX: -30, originZ: -30, spacing: 1, columns: 81, rows: 81,
      heights: new Array<number>(81 * 81).fill(0), surfaces: new Array<SurfaceId>(80 * 80).fill('pavement') },
    segments: [{ id: 'actual-walk', entry: { position: { x: 0, y: 0, z: 0 }, headingY: 0, halfWidth: 5, surface: 'pavement', gradient: 0 },
      exit: { position: { x: 0, y: 0, z: 40 }, headingY: 0, halfWidth: 5, surface: 'pavement', gradient: 0 }, colliders: [] }],
    checkpoints: [], populationPaths: [{ id: 'actual-park-walk', role: 'pedestrian', district: 'park', closed: false,
      serviceShuttle: false, frames: Array.from({ length: 81 }, (_, index) => ({ x: 0, y: 0,
        z: index * 0.5 + (index === 7 ? nudge : 0), headingY: 0, distanceMetres: index * 0.5, sourceSegmentId: 'actual-walk', halfWidthMetres: 2 })) }] });
  const one = preparePopulationWorld(walk(0)), two = preparePopulationWorld(walk(3.5 * Number.EPSILON));
  assert.ok(one.population.actors.length > 0);
  assert.notEqual(one.level.id, two.level.id, 'the float hash differs, as it does between engines');
  assert.equal(one.level.recordWorldId, two.level.recordWorldId);
  assert.match(one.level.recordWorldId!, /^record-identity-control(~living-r1)?$/);
  // Records refuse level ids over 64 characters: an installed plan from a long
  // builder id is filed under a string hash of it, the same in every engine.
  const long = (nudge: number) => preparePopulationWorld({ ...walk(nudge), id: `long-builder-${'x'.repeat(50)}`,
    populationSourceWorldId: 'an-earlier-world' }).level.recordWorldId!;
  assert.match(long(0), /^world-[0-9a-f]{32}~living-r1$/);
  assert.equal(long(0), long(3.5 * Number.EPSILON));
});

test("euc's park gate keeps its walker and NPC rider, the rider turned around past the piers' sight margin (LC-4)", () => {
  const { world } = venue('generated:euc');
  const gate = world.population.paths.filter(path => path.id.startsWith('population/park-gate@'));
  const kinds = (label: string) => world.population.actors
    .filter(actor => gate.some(path => path.id === actor.pathId && path.id.includes(label))).map(actor => actor.kind);
  assert.deepEqual(kinds('park-path-ride'), ['fictionalEuc']);
  assert.deepEqual(kinds('park-path-walk'), ['walker']);
  const spec = SLICE_GRAPH.main.find(each => each.id === 'park-gate')!;
  const exit = Math.max(...(spec.blocks ?? []).filter(b => b.height > 3 && b.halfLateral > 3).map(b => b.s + b.halfAlong));
  const segment = world.level.segments.find(each => each.id.startsWith('park-gate@'))!, forward = forwardOf(segment.entry.headingY);
  const first = (label: string) => Math.min(...gate.find(each => each.id.includes(label))!.points
    .map(p => (p.x - segment.entry.position.x) * forward.x + (p.z - segment.entry.position.z) * forward.z));
  assert.ok(first('park-path-ride') >= exit + 4, `the ride lane turns around ${(first('park-path-ride') - exit).toFixed(2)} m past the piers`);
  // The walk lane keeps its whole length (and the park beds laid out along it).
  assert.ok(first('park-path-walk') < exit + 1, `the walk lane turns around ${(first('park-path-walk') - exit).toFixed(2)} m past the piers`);
  assert.equal(world.population.actors.length, 28, 'the town keeps its whole roster');
});
