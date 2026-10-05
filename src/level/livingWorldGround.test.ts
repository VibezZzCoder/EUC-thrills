/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Focused finished-ground controls; coordinator runs these sequentially. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildLevelPlan } from './buildPlan.ts';
import { districtBlock } from './cityRing.ts';
import { withLivingWorldGround, prepareLivingWorldGround } from './livingWorldGround.ts';
import { buildPopulationPlan, populationSpanFootprints, populationFootprintExclusion } from './populationPlan.ts';
import { planDigest } from './planDigest.ts';
import { POPULATION_AUTHORING as R } from '../data/tuning.ts';
import { createSliceLevel } from './sliceLevel.ts';
import { createTrackLevel } from './trackLevel.ts';
import { createSwitchbackLevel } from './switchbackLevel.ts';
import { generateLevel } from './generateRoute.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';

function actualBlock() {
  const block = districtBlock('commercial', () => 0.25, () => 0.5);
  return buildLevelPlan({ main: block.main, branches: block.branches }, {
    id: 'actual-commercial-control', spawn: { position: { x: 0, y: 0, z: -80 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
  });
}

test('native neighborhood courts produce complete forward traffic with unchanged original owners', () => {
  const source = actualBlock(), digest = planDigest(source);
  const prepared = prepareLivingWorldGround(source), one = prepared.level, two = withLivingWorldGround(source);
  assert.deepEqual(one, two);
  assert.equal(withLivingWorldGround(one), one, 'final supplement is idempotent');
  for (const key of ['heightfield', 'segments', 'props', 'solids', 'softBodies', 'spawn', 'checkpoints', 'hazards'] as const) {
    assert.equal(one[key], source[key], `${key} keeps its original owner and contents`);
  }
  assert.equal(one.id, source.id);
  assert.equal(planDigest(source), digest);
  assert.ok(one.populationGroundReport!.acceptedTrafficLoops.length > 0, 'zero accepted traffic is unfinished');
  const population = buildPopulationPlan(one, one.populationPaths);
  assert.deepEqual(prepared.population, population, 'reused final result equals a fresh authoritative rebuild');
  assert.deepEqual(one.populationGroundReport, population.report.groundSupplement);
  assert.deepEqual(one.populationGroundReport!.acceptedTrafficLoops,
    population.paths.filter(path => path.role === 'traffic' && path.closed).map(path => path.id));
  assert.ok(population.actors.some(actor => actor.kind === 'trafficVehicle'));
  for (const path of population.paths.filter(p => p.role === 'traffic')) {
    assert.equal(path.closed, true);
    assert.ok(path.lengthMetres >= R.minimumTrafficMetres);
    for (let index = 1; index < path.points.length; index++) {
      const a = path.points[index - 1], b = path.points[index];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const turn = Math.abs(Math.atan2(Math.sin(b.headingY - a.headingY), Math.cos(b.headingY - a.headingY)));
      assert.ok(turn / length <= 1 / R.minimumVehicleTurnRadiusMetres + R.epsilon);
    }
  }
  for (const patch of one.groundSurfacePatches ?? []) for (const triangle of patch.triangles) {
    assert.ok(triangle.vertices.every(vertex => vertex.y === 0), 'court retains the actual flat source plane');
    assert.ok(patch.sourceSurface === 'grass' || patch.sourceSurface === 'brick');
  }
  assert.ok((one.populationGroundSources ?? []).every(s => s.hostSegmentIds.every(id => source.segments.some(segment => segment.id === id))));
});

test('a protected hazard rejects all loops whole and retains an explicit unfinished report', () => {
  const source = actualBlock();
  source.hazards = [{ id: 'original-protected-hole', kind: 'potholeDeep', centre: source.spawn.position, radius: 1000 }];
  const finished = withLivingWorldGround(source);
  assert.deepEqual(finished.populationGroundReport!.acceptedTrafficLoops, []);
  assert.deepEqual(finished.populationGroundReport!.missingTrafficDistricts, ['commercial']);
  assert.ok(finished.populationGroundReport!.gaps.some(gap => gap.includes('unfinished')));
  assert.equal(finished.hazards, source.hazards);
  assert.equal(buildPopulationPlan(finished, finished.populationPaths).actors.some(actor => actor.kind === 'trafficVehicle'), false);
});

test('non-road ground cannot be converted into a universal traffic court', () => {
  const source = actualBlock();
  const changed = { ...source, heightfield: { ...source.heightfield,
    surfaces: source.heightfield.surfaces.map(() => 'wood' as const) } };
  const finished = withLivingWorldGround(changed);
  assert.deepEqual(finished.populationGroundReport!.acceptedTrafficLoops, []);
  assert.equal(finished.heightfield, changed.heightfield);
  assert.ok(!(finished.groundSurfacePatches ?? []).length);
});

test('hand venues provide actual activity sources and preserve their lap/trick originals', () => {
  const slice = createSliceLevel(), track = createTrackLevel(), park = createSwitchbackLevel();
  assert.ok(slice.populationPaths?.some(path => path.role === 'pedestrian' && path.district === 'park'));
  assert.ok(slice.populationPaths?.some(path => path.role === 'rider'));
  assert.ok(track.populationPaths?.some(path => path.role === 'service' && path.serviceShuttle));
  assert.ok(track.props?.some(prop => prop.kind === 'building' && prop.look === 'industrial'));
  assert.ok(park.populationFootpathRequests?.every(request => request.hostSegmentId === 'apron'
    && Math.abs(request.lateralMetres) > 9 + R.lapClearanceMetres));
  const finished = withLivingWorldGround(park);
  const population = buildPopulationPlan(finished, finished.populationPaths);
  assert.ok(population.paths.some(path => path.district === 'park' && path.role === 'pedestrian'));
  assert.ok(population.actors.some(actor => actor.kind === 'walker' || actor.kind === 'social'),
    'rail-protected spectators are actual occupants; bench activity stays standing');
  assert.deepEqual(park.populationFootpathRequests, [{ id: 'switchback-summit-spectator', hostSegmentId: 'apron',
    district: 'park', fromS: 25, toS: 41, lateralMetres: -11.65, halfWidthMetres: 0.9 }]);
  const sampler = new PlanTerrainSampler(finished);
  for (const path of population.paths) for (let i = 1; i < path.points.length; i++)
    for (const sweep of populationSpanFootprints(finished, sampler, path.points[i - 1], path.points[i], path.role))
      assert.equal(populationFootprintExclusion(finished, sweep), null, 'every full physical prism clears the original lap/trick/rail envelope');
  const intrusion = withLivingWorldGround({ ...park, populationFootpathRequests: park.populationFootpathRequests!.map(request => ({
    ...request, lateralMetres: -11.1,
  })) });
  assert.equal(buildPopulationPlan(intrusion, intrusion.populationPaths).actors.length, 0);
  assert.ok(intrusion.populationGroundReport!.rejected.some(rejection => rejection.reason === 'footpath-protected-lap'),
    'a centre outside the lap cannot admit a hull protruding into its clearance');
  assert.equal(finished.heightfield, park.heightfield);
  assert.equal(finished.lap, park.lap);
  assert.equal(finished.trickZones, park.trickZones);
  assert.equal(finished.props, park.props);
  assert.equal(finished.solids, park.solids);
  assert.equal(finished.spawn, park.spawn);
});

for (const seed of ['euc-thrills', 'sweep-3']) test(`generated ${seed} has actual local traffic and warehouse parking`, () => {
  const generated = generateLevel(seed), source = generated.plan;
  const original = planDigest(source), finished = withLivingWorldGround(source);
  const population = buildPopulationPlan(finished, finished.populationPaths);
  assert.ok(population.actors.some(actor => actor.kind === 'trafficVehicle'), 'zero traffic remains unfinished');
  assert.ok(population.actors.some(actor => actor.kind === 'parkedVehicle'), 'zero parking remains unfinished');
  assert.deepEqual(finished.populationGroundReport, population.report.groundSupplement);
  assert.ok(finished.populationGroundReport!.acceptedTrafficLoops.every(id => population.paths.some(path => path.id === id && path.closed)));
  assert.equal(finished.populationParkingBays?.length, 1, 'one chosen warehouse bay, not parking spam');
  assert.ok(finished.populationParkingBays![0].approachFrames!.length > 2);
  assert.equal(planDigest(source), original);
  for (const key of ['heightfield', 'segments', 'props', 'solids', 'softBodies', 'spawn', 'checkpoints', 'hazards', 'targets'] as const)
    assert.equal(finished[key], source[key]);
});
