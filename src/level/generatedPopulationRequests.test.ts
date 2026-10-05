/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Exact generated-band authoring and source-preservation controls. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { POPULATION_AUTHORING as R, POPULATION_OCCUPANT } from '../data/tuning.ts';
import { districtBlock, type RingQuarter } from './cityRing.ts';
import { emitPopulationPaths } from './populationPlan.ts';
import { createSeedStreams } from './seedStreams.ts';
import { SLICE_GRAPH } from './sliceLevel.ts';
import { centrelineAt, placeGraph, surfaceAtLateral, surfaceHeightAt, type PlacedSegment, type SegmentSpec } from './segments.ts';
import { candidateClearanceRadius, generatedPopulationRequests } from './generatedPopulationRequests.ts';
import { generatedTrafficLoopCandidates } from './generatedTrafficLoops.ts';

const spawn = { position: { x: 0, y: 0, z: 0 }, headingY: 0 };
function placed(spec: SegmentSpec): PlacedSegment[] { return placeGraph({ main: [spec] }, spawn); }
function quarters(sources: readonly PlacedSegment[], quarter: RingQuarter) {
  return new Map(sources.map(p => [p.spec.id, quarter]));
}
function cloneSpec(id: string): SegmentSpec {
  const source = [...SLICE_GRAPH.main, ...(SLICE_GRAPH.branches ?? []).flatMap(b => b.specs)].find(s => s.id === id);
  assert.ok(source, `actual slice source ${id}`);
  return JSON.parse(JSON.stringify(source)) as SegmentSpec;
}

for (const district of ['commercial', 'residential'] as const) {
  test(`real ${district} block requests remain on its original brick sidewalks`, () => {
    const block = districtBlock(district, () => 0.5, () => 0.5);
    const sources = placeGraph({ main: block.main, branches: block.branches }, spawn);
    const requests = generatedPopulationRequests(sources, quarters(sources, district === 'commercial' ? 'downtown' : 'residential'));
    assert.ok(requests.length > 0);
    assert.ok(requests.every(r => r.role === 'pedestrian' && r.district === district && !r.closed));
    for (const request of requests) for (const step of request.steps) {
      const source = sources.find(p => p.spec.id === step.segmentId)!;
      for (const s of [step.fromS, (step.fromS + step.toS) / 2, step.toS]) {
        assert.equal(surfaceAtLateral(source.spec, step.lateralMetres, s), 'brick');
        assert.equal(surfaceAtLateral(source.spec, step.lateralMetres - step.halfWidthMetres + 1e-6, s), 'brick');
        assert.equal(surfaceAtLateral(source.spec, step.lateralMetres + step.halfWidthMetres - 1e-6, s), 'brick');
      }
      assert.ok(step.halfWidthMetres >= Math.hypot(R.pedestrianRadiusMetres, R.pedestrianRadiusMetres) + R.staticClearanceMetres);
    }
    assert.equal(generatedPopulationRequests(sources, quarters(sources, 'industrial')).length, 0);
  });
}

test('a ranged first-wins sidewalk stays bounded through actual emitted frames', () => {
  const sources = placed({ id: 'city-commercial-main-street', length: 100, halfWidth: 9, surface: 'pavement', bands: [
    { from: -9, to: -6, surface: 'brick', fromS: 25, toS: 45 },
    { from: -9, to: -6, surface: 'grass' },
  ] });
  const requests = generatedPopulationRequests(sources, quarters(sources, 'downtown'));
  assert.equal(requests.length, 1);
  const [path] = emitPopulationPaths(sources, requests);
  assert.ok(path.frames[0].z > 25 && path.frames.at(-1)!.z < 45);
  assert.ok(path.frames.every(f => f.z > 25 && f.z < 45));
  assert.ok(path.frames.at(-1)!.distanceMetres < 20);
  const control = placed({ ...sources[0].spec, bands: [...sources[0].spec.bands!].reverse() });
  assert.equal(generatedPopulationRequests(control, quarters(control, 'downtown')).length, 0);
});

test('rectangular corners reject a band the former half-width-only policy would accept', () => {
  const sources = placed({ id: 'city-residential-main-street', length: 70, halfWidth: 6.5, surface: 'pavement',
    bands: [{ from: 5.3, to: 6.5, surface: 'brick' }] });
  assert.ok(0.6 > R.pedestrianRadiusMetres + R.staticClearanceMetres);
  assert.ok(0.6 < candidateClearanceRadius('pedestrian') + R.staticClearanceMetres);
  assert.equal(generatedPopulationRequests(sources, quarters(sources, 'residential')).length, 0);
  assert.equal(candidateClearanceRadius('rider'), Math.hypot(R.riderRadiusMetres, R.riderRadiusMetres));
});

test('a broad plaza or arbitrary quarter-labelled road does not become a sidewalk, park ride or traffic loop', () => {
  const sources = placed({ id: 'universal-road', length: 150, halfWidth: 20, surface: 'pavement' });
  for (const quarter of ['downtown', 'park', 'industrial'] as const) {
    assert.equal(generatedPopulationRequests(sources, quarters(sources, quarter)).length, 0);
    assert.equal(generatedTrafficLoopCandidates(sources, quarters(sources, quarter)).length, 0);
  }
});

test('park requests use native path/verge bands and remove the real gate piers before tracing', () => {
  const sources = placed({ ...cloneSpec('park-gate'), id: 'park-gate@7' });
  const requests = generatedPopulationRequests(sources, quarters(sources, 'park'));
  assert.ok(requests.some(r => r.role === 'rider'));
  assert.ok(requests.some(r => r.role === 'pedestrian'));
  for (const request of requests) for (const step of request.steps) {
    for (const block of sources[0].spec.blocks ?? []) {
      const reach = candidateClearanceRadius(request.role) + R.staticClearanceMetres;
      if (Math.abs(block.t - step.lateralMetres) > block.halfLateral + reach) continue;
      assert.ok(step.toS <= block.s - block.halfAlong - reach || step.fromS >= block.s + block.halfAlong + reach);
    }
    assert.notEqual(surfaceAtLateral(sources[0].spec, step.lateralMetres, (step.fromS + step.toS) / 2), 'wood');
  }
  for (const id of ['ford-in', 'ford', 'ford-out', 'trailhead', 'kicker-run', 'close-a@c']) {
    const unsupported = placed({ id, length: 80, halfWidth: 9, surface: 'pavement' });
    assert.equal(generatedPopulationRequests(unsupported, quarters(unsupported, 'park')).length, 0);
  }
});

/** The park gate's two tall piers and the opening they leave (|t| < inner). */
function gatePiers(spec: SegmentSpec) {
  const piers = (spec.blocks ?? []).filter(b => b.height > 3 && b.halfLateral > 3);
  assert.equal(piers.length, 2, 'the real gate piers');
  return { exit: Math.max(...piers.map(b => b.s + b.halfAlong)), inner: Math.min(...piers.map(b => Math.abs(b.t) - b.halfLateral)) };
}

test('the park-gate NPC ride lane ends where a rider coming through the gate can see it; walking lanes keep their length (LC-4)', () => {
  // 2026-10-03: the ride lane began right behind the 3.4 m piers, so the NPC
  // rider at its turnaround, its hull reaching into the opening's line, was
  // hidden until 6 m away.
  const sources = placed({ ...cloneSpec('park-gate'), id: 'park-gate@6' });
  const { exit, inner } = gatePiers(sources[0].spec);
  const requests = generatedPopulationRequests(sources, quarters(sources, 'park'));
  const lane = (label: string) => requests.find(r => r.id.includes(label))!;
  const ride = lane('park-path-ride'), [rideStep] = ride.steps;
  assert.ok(Math.abs(rideStep.lateralMetres - 2.86) < 0.01, 'the ride lane keeps its side of the path');
  assert.ok(rideStep.lateralMetres - candidateClearanceRadius('rider') - POPULATION_OCCUPANT.halfWidthMetres < inner,
    'its hull reaches into the opening\'s line');
  const rideClearance = candidateClearanceRadius('rider') + R.staticClearanceMetres;
  assert.ok(rideStep.fromS >= exit + rideClearance + 4 - 1e-9, `the ride lane starts at ${rideStep.fromS.toFixed(2)}, behind the pier at ${exit}`);
  // From the corridor's centre the line over the pier's inner corner reaches the lane end this far out.
  const seen = (rideStep.fromS - exit) / (1 - inner / Math.abs(rideStep.lateralMetres));
  assert.ok(seen >= 20, `the ride lane's end is seen from ${seen.toFixed(1)} m`);
  assert.ok(rideStep.toS - rideStep.fromS >= R.minimumRideMetres);
  // Walking lanes keep their whole length and side, and with them the park
  // beds laid out along them and the town's share of walkers.
  for (const [label, t] of [['park-path-walk', -3.25], ['park-verge-0', 6.6], ['park-verge-1', -6.6]] as const) {
    const request = lane(label), [step] = request.steps;
    const clearance = candidateClearanceRadius(request.role) + R.staticClearanceMetres;
    assert.ok(Math.abs(step.lateralMetres - t) < 0.01, `${label} keeps its side (${step.lateralMetres.toFixed(2)})`);
    assert.ok(Math.abs(step.fromS - (exit + clearance)) < 1e-9, `${label} starts at ${step.fromS.toFixed(2)}`);
    assert.ok(Math.abs(step.toS - (sources[0].spec.length - clearance - R.joinToleranceMetres)) < 1e-9, `${label} keeps its far end`);
  }
});

test('where the sight margin would cost a lane its minimum, the lane moves clear of the opening instead (LC-4)', () => {
  // A shorter gate whose ride lane cannot give up the margin: the NPC rider
  // stays, turned around behind the pier but outside the opening's line.
  const sources = placed({ ...cloneSpec('park-gate'), id: 'park-gate@9', length: 39 });
  const { inner } = gatePiers(sources[0].spec);
  const ride = generatedPopulationRequests(sources, quarters(sources, 'park')).find(r => r.role === 'rider');
  assert.ok(ride, 'the NPC rider keeps its lane');
  const [step] = ride.steps;
  assert.ok(step.toS - step.fromS >= R.minimumRideMetres);
  assert.ok(step.lateralMetres >= inner + candidateClearanceRadius('rider') + POPULATION_OCCUPANT.halfWidthMetres - 1e-9,
    `the actor and a passing rider clear the opening (${step.lateralMetres.toFixed(2)})`);
  assert.ok(step.halfWidthMetres >= candidateClearanceRadius('rider') + R.staticClearanceMetres);
  assert.ok(step.lateralMetres + step.halfWidthMetres <= 5.2 + 1e-9, 'still on the paved path');
});

test('industrial requests require a real warehouse frontage and make only bounded service shuttles', () => {
  const empty = placed({ id: 'return-plaza@9', length: 60, halfWidth: 7, surface: 'roughPavement' });
  assert.equal(generatedPopulationRequests(empty, quarters(empty, 'industrial')).length, 0);
  const sources = placed({ ...empty[0].spec, props: [{ kind: 'building', look: 'industrial', s: 30, t: -20,
    size: { x: 12, y: 6, z: 24 } }] });
  const requests = generatedPopulationRequests(sources, quarters(sources, 'industrial'));
  assert.ok(requests.some(r => r.role === 'pedestrian'));
  const services = requests.filter(r => r.role === 'service');
  assert.ok(services.length > 0);
  assert.ok(services.every(r => r.serviceShuttle && !r.closed && r.steps.every(s => s.toS - s.fromS <= R.maximumServiceShuttleMetres)));
  assert.ok(requests.every(r => r.role !== 'traffic'));
  assert.ok(requests.every(r => r.role !== 'service' || r.serviceShuttle)); // no inferred parking bay
});

test('requests and bounded reverse frames are repeatable without source writes or stream draws', () => {
  const sources = placed({ id: 'city-commercial-main-street', length: 60, halfWidth: 9, surface: 'pavement', curvature: 1 / 80,
    bands: [{ from: 6, to: 9, surface: 'brick' }] });
  const before = JSON.stringify(sources);
  const streams = createSeedStreams('held-authoring-purity');
  const draws = Object.values(streams).map(s => s.draws);
  const request = generatedPopulationRequests(sources, quarters(sources, 'downtown'));
  assert.deepEqual(request, generatedPopulationRequests(sources, quarters(sources, 'downtown')));
  const reverse = request.map(r => ({ ...r, steps: r.steps.map(s => ({ ...s, forward: false })) }));
  const [path] = emitPopulationPaths(sources, reverse);
  const lastStation = reverse[0].steps[0].toS;
  const exact = centrelineAt(sources[0].entry, sources[0].spec, lastStation);
  const h = sources[0].entry.headingY + lastStation / 80;
  assert.ok(Math.abs(path.frames[0].x - exact.x - Math.cos(h) * reverse[0].steps[0].lateralMetres) < 1e-9);
  assert.ok(Math.abs(path.frames[0].z - exact.z + Math.sin(h) * reverse[0].steps[0].lateralMetres) < 1e-9);
  assert.equal(JSON.stringify(sources), before);
  assert.deepEqual(Object.values(streams).map(s => s.draws), draws);
});

test('the ranged emitter refuses a reversible street chain disguised as a traffic loop', () => {
  const sources = placed({ id: 'street', length: 60, halfWidth: 9, surface: 'pavement' });
  assert.throws(() => emitPopulationPaths(sources, [{ id: 'false-traffic', role: 'traffic', district: 'commercial', closed: true,
    steps: [{ segmentId: 'street', fromS: 5, toS: 55, lateralMetres: -2, halfWidthMetres: 3 },
      { segmentId: 'street', fromS: 5, toS: 55, lateralMetres: 2, halfWidthMetres: 3, forward: false }] }]), /authored join\/turn/);
});

test('the sole emitter preserves reverse bounds and the actual crowned lateral surface height', () => {
  const sources = placed({ id: 'native-crowned-sidewalk', length: 80, halfWidth: 9,
    surface: 'pavement', climb: 4, crown: 0.4, crossSlope: 0.04 });
  const [path] = emitPopulationPaths(sources, [{ id: 'bounded-crowned-walk', role: 'pedestrian', district: 'residential',
    steps: [{ segmentId: sources[0].spec.id, lateralMetres: 6, halfWidthMetres: 1,
      fromS: 25, toS: 45, forward: false }] }]);
  assert.equal(path.frames[0].z, 45);
  assert.equal(path.frames.at(-1)!.z, 25);
  for (const frame of path.frames) {
    assert.equal(frame.y, surfaceHeightAt(sources[0].entry, sources[0].spec, frame.z, 6));
    assert.ok(frame.z >= 25 && frame.z <= 45);
  }
  assert.throws(() => emitPopulationPaths(sources, [{ id: 'outside-bounds', role: 'pedestrian', district: 'residential',
    steps: [{ segmentId: sources[0].spec.id, lateralMetres: 6, halfWidthMetres: 1, fromS: -1, toS: 45 }] }]), /authored corridor band/);
});
