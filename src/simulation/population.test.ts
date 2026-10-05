/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Deterministic movement and physical-contact regression controls. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { wrapAngle } from '../shared/maths.ts';
import type { TerrainSampler } from './world.ts';
import { populationSupportTargets } from '../shared/populationSupport.ts';
import { physicalPopulationHullFromTransform } from '../shared/populationHull.ts';
import { POPULATION, PopulationSimulation, createPopulationSimulation, physicalPopulationHull, transformPopulationHull, sweepPopulationHulls,
  createPopulationPresentationSnapshot, type PopulationFootprint, type PopulationOccupant } from './population.ts';

const STEP = 0.05;
const flat: TerrainSampler = {
  sampleGround(_x, _z, out) {
    out.height = 0; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0;
    out.surface = 'pavement'; out.offCourse = false; return out;
  },
  raycast() { return null; },
};

function body(x = 0, z = 0, overrides: Partial<PopulationFootprint> = {}): PopulationFootprint {
  return { x, z, headingY: 0, halfWidthMetres: 0.3, halfLengthMetres: 0.35,
    minY: 0, maxY: 1.8, velocityX: 0, velocityZ: 0, ...overrides };
}
function occupant(id: string, current: PopulationFootprint, previous = current,
  kind: PopulationOccupant['kind'] = 'human'): PopulationOccupant {
  return { id, kind, previous, current };
}
function line(id = 'walk', x = 0, role: PopulationPath['role'] = 'pedestrian'): PopulationPath {
  return { id, role, district: role === 'service' ? 'industrial' : 'park',
    points: [-15, 0, 15].map((z, index) => ({ x, y: 0, z, headingY: 0,
      distanceMetres: index * 15, surface: 'pavement' as const, sourceSegmentId: `${id}/source` })),
    lengthMetres: 30, closed: false, serviceShuttle: role === 'service',
    clearanceRadiusMetres: 3, connections: [] };
}
function loop(id = 'traffic'): PopulationPath {
  const radius = 12, count = 128;
  const points = Array.from({ length: count + 1 }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return { x: Math.sin(angle) * radius, y: 0, z: Math.cos(angle) * radius,
      headingY: Math.PI / 2 + angle, distanceMetres: index * 2 * radius * Math.sin(Math.PI / count),
      surface: 'pavement' as const, sourceSegmentId: 'closed-road/source' };
  });
  return { id, role: 'traffic', district: 'commercial', points,
    lengthMetres: points.at(-1)!.distanceMetres, closed: true, serviceShuttle: false,
    clearanceRadiusMetres: 3, connections: [] };
}
function actor(id = 'person', pathId = 'walk', overrides: Partial<ActorSpec> = {}): ActorSpec {
  return { id, kind: 'walker', pathId, initialDistanceMetres: 3, direction: 1,
    movement: 'shuttle', speedMetresPerSecond: 1.1, idleSeconds: 0.2, appearanceIndex: 0,
    hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 }, ...overrides };
}
function van(id = 'van', pathId = 'service', overrides: Partial<ActorSpec> = {}): ActorSpec {
  return actor(id, pathId, { kind: 'parkedVehicle', movement: 'stationary', speedMetresPerSecond: 0,
    initialDistanceMetres: 15, hull: { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 }, ...overrides });
}
function plan(paths: readonly PopulationPath[] = [line()], actors: readonly ActorSpec[] = [actor()]): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'test-world',
    installedWorldId: 'test-world/living-r1', contentDigest: 'fixture', paths, actors, anchors: [],
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
function simulate(simulation: PopulationSimulation, steps: number,
  occupants: readonly PopulationOccupant[] = []): void {
  for (let i = 0; i < steps; i += 1) { simulation.step(STEP, occupants); simulation.queryContacts(occupants); }
}

test('presentation endpoints reuse caller records while preserving complete detached physics ownership', () => {
  const simulation = createPopulationSimulation(plan([line(), line('service', 8, 'service')],
    [actor(), van()]), flat);
  const previous = createPopulationPresentationSnapshot(), current = createPopulationPresentationSnapshot();
  simulate(simulation, 2); simulation.writePresentationEndpoints(previous, current);
  const before = simulation.snapshot(), previousBefore = simulation.previousSnapshot();
  const actorArray = current.actors, actorRecord = current.actors[0], supports = actorRecord.footSupports!, support = supports[0];
  const previousRecord = previous.actors[0], previousSupport = previousRecord.footSupports![0];
  assert.notEqual(actorRecord, before.actors[0]); assert.notEqual(support, before.actors[0].footSupports![0]);
  assert.notEqual(previousSupport, support);
  actorRecord.x = 9000; support.y = 8000; previousSupport.normalX = 7000;
  assert.deepEqual(simulation.snapshot(), before); assert.deepEqual(simulation.previousSnapshot(), previousBefore);
  simulation.writePresentationEndpoints(previous, current);
  assert.equal(current.actors, actorArray); assert.equal(current.actors[0], actorRecord);
  assert.equal(actorRecord.footSupports, supports); assert.equal(actorRecord.footSupports![0], support);
  assert.equal(previous.actors[0], previousRecord); assert.equal(previousRecord.footSupports![0], previousSupport);
  for (const endpoint of [previous, current]) {
    const source = endpoint === previous ? simulation.previousSnapshot() : simulation.snapshot();
    assert.equal(endpoint.tick, source.tick); assert.equal(endpoint.clockSeconds, source.clockSeconds);
    endpoint.actors.forEach((presented, index) => {
      const physical = source.actors[index];
      for (const key of Object.keys(presented) as (keyof typeof presented)[]) {
        assert.deepEqual(presented[key], physical[key], key);
      }
      assert.equal('footprint' in presented, false); assert.equal('hull' in presented, false);
      assert.equal('supportHeights' in presented, false);
    });
  }
  simulate(simulation, 3); simulation.writePresentationEndpoints(previous, current);
  assert.equal(current.actors[0], actorRecord); assert.equal(actorRecord.footSupports![0], support);
  assert.equal(current.tick, 5); assert.notEqual(actorRecord.z, before.actors[0].z);
  simulation.reset(); simulation.writePresentationEndpoints(previous, current);
  assert.equal(current.tick, 0); assert.equal(previous.clockSeconds, 0);
  assert.equal(current.actors[0], actorRecord); assert.equal(actorRecord.footSupports![0], support);
  assert.throws(() => simulation.writePresentationEndpoints(current, current), /distinct caller storage/);
});

test('reusing presentation storage across worlds clears obsolete actors and support channels', () => {
  const previous = createPopulationPresentationSnapshot(), current = createPopulationPresentationSnapshot();
  const human = createPopulationSimulation(plan(), flat);
  human.writePresentationEndpoints(previous, current);
  const record = current.actors[0];
  const vehicle = createPopulationSimulation(plan([line('service', 8, 'service')], [van()]), flat);
  vehicle.writePresentationEndpoints(previous, current);
  assert.equal(current.actors[0], record); assert.equal(record.kind, 'parkedVehicle');
  assert.equal(record.footSupports, undefined); assert.equal(record.tyreSupports?.length, 4);
  const empty = createPopulationSimulation(plan([], []), flat);
  empty.writePresentationEndpoints(previous, current);
  assert.equal(previous.actors.length, 0); assert.equal(current.actors.length, 0);
});

test('issued actor census is immutable, epoch-bound and cannot substitute another population', () => {
  const simulation = createPopulationSimulation(plan(), flat), other = createPopulationSimulation(plan(), flat);
  simulation.step(STEP); const census = simulation.actorMotionCensus();
  assert.equal(simulation.actorMotionCensus(), census);
  assert.deepEqual(census.actors, simulation.actorMotions());
  assert.throws(() => { (census.actors[0].current as { x: number }).x = 100; }, TypeError);
  assert.throws(() => { (census.actors[0].current.sourceHull!.hull as { heightMetres: number }).heightMetres = 100; }, TypeError);
  const resolver = (actors: typeof census.actors) => ({ actorFractions: Object.fromEntries(actors.map(value => [value.id, 1])),
    componentFractions: {}, stopGroupFractions: {}, hits: [] });
  const prepared = simulation.prepareCompoundContacts([], [], resolver, { actorCensus: census });
  assert.throws(() => other.prepareCompoundContacts([], [], resolver, { actorCensus: census }), /foreign.*census/);
  simulation.commitContacts(prepared, []);
  assert.throws(() => simulation.prepareCompoundContacts([], [], resolver, { actorCensus: census }), /already committed/);
  simulation.step(STEP);
  assert.throws(() => simulation.prepareCompoundContacts([], [], resolver, { actorCensus: census }), /Stale.*census/);
});

test('conservative AI rejection does not hide a distant malformed exact source frame', () => {
  const source = physicalPopulationHull(1000, 0, 1000, 0, 0, 1, 0,
    { halfWidthMetres: 0.3, halfLengthMetres: 0.35, heightMetres: 1.8 });
  const malformed = { ...source, sourceHull: { ...source.sourceHull!, normalX: 0, normalY: 0, normalZ: 0 } };
  const simulation = createPopulationSimulation(plan(), flat);
  assert.throws(() => simulation.step(STEP, [occupant('malformed', malformed)]), /upward normal/);
});

test('an earlier human stop discards a later cop event on the actor remainder', () => {
  const simulation = new PopulationSimulation(plan(), flat);
  simulate(simulation,20);
  const before = simulation.snapshot().actors[0]; simulation.step(STEP);
  const after = simulation.snapshot().actors[0], travel = after.z-before.z;
  assert.ok(travel > 0.04, 'a moving source must exercise two distinct collision times');
  const thin = { halfWidthMetres:0.005, halfLengthMetres:0.005 };
  const h = occupant('early-human',body(before.x,before.z+before.hull.halfLengthMetres+0.005+travel*0.2,thin));
  const c = occupant('late-cop',body(before.x,before.z+before.hull.halfLengthMetres+0.005+travel*0.8,thin),undefined,'cop');
  const contacts = simulation.queryContacts([c,h]);
  assert.deepEqual(contacts.map(value=>value.occupantId),['early-human']);
  assert.ok(simulation.snapshot().actors[0].z < after.z);
  assert.equal(contacts[0].charge,true);
  // A later real cop entry must still be a fresh pair, never spent by the
  // unreachable discarded event above.
  simulation.step(STEP);
  const standing = simulation.snapshot().actors[0];
  const entering = occupant('late-cop',body(standing.x,standing.z),c.current,'cop');
  assert.equal(simulation.queryContacts([entering]).find(value=>value.occupantId==='late-cop')?.charge,true);
});

test('a stopped van catches a complete crossing between two clear endpoint footprints', () => {
  const box = body(0, 0, { halfWidthMetres: 1.02, halfLengthMetres: 2.4, maxY: 2.8 });
  const before = body(-4, 0, { velocityX: 160 }), after = body(4, 0, { velocityX: 160 });
  assert.equal(sweepPopulationHulls(box, box, before, before), null);
  assert.equal(sweepPopulationHulls(box, box, after, after), null);
  const hit = sweepPopulationHulls(box, box, before, after);
  assert.ok(hit, 'the endpoint-only known-bad predicate misses this crossing');
  assert.ok(Math.abs(hit.timeOfImpact - (4 - 1.02 - 0.3) / 8) < 1e-9);
  assert.equal(hit.normalX, -1); assert.equal(hit.normalZ, 0);
  assert.equal(hit.currentlyOverlapping, false);
});

test('long vans have clear side lanes inside the known-bad collision circle', () => {
  const box = body(0, 0, { halfWidthMetres: 1.02, halfLengthMetres: 2.4, maxY: 2.8 });
  const before = body(2, -6), after = body(2, 6);
  assert.ok(2 < Math.hypot(1.02, 2.4) + before.halfWidthMetres,
    'the deliberately bad circular hull would collide in this clear side lane');
  assert.equal(sweepPopulationHulls(box, box, before, after), null);
  const rotation = Math.PI / 4, cos = Math.cos(rotation), sin = Math.sin(rotation);
  const rotated = (value: PopulationFootprint): PopulationFootprint => ({ ...value,
    x: value.x * cos + value.z * sin, z: -value.x * sin + value.z * cos,
    headingY: value.headingY + rotation });
  assert.equal(sweepPopulationHulls(rotated(box), rotated(box), rotated(before), rotated(after)), null);
  assert.ok(sweepPopulationHulls(rotated(box), rotated(box), rotated(body(1.2, -6)), rotated(body(1.2, 6))),
    'the neighbouring real hull-crossing lane must still collide after rotation');
});

test('a rotating vehicle corner can collide while both endpoint orientations are clear', () => {
  const first = body(0, 0, { halfWidthMetres: 1.02, halfLengthMetres: 2.4, maxY: 2.8 });
  const last = { ...first, headingY: Math.PI / 2 };
  const rider = body(1.9, 1.9, { halfWidthMetres: 0.25, halfLengthMetres: 0.25 });
  assert.equal(sweepPopulationHulls(first, first, rider, rider), null);
  assert.equal(sweepPopulationHulls(last, last, rider, rider), null);
  const hit = sweepPopulationHulls(first, last, rider, rider);
  assert.ok(hit && hit.timeOfImpact > 0 && hit.timeOfImpact < 1);
});

test('swept height intervals reject a clear jump and catch a wheel still below the hull roof', () => {
  const box = body(0, 0, { halfWidthMetres: 1.02, halfLengthMetres: 2.4, maxY: 2.8 });
  const wheel = { minY: 2.81, maxY: 3.46, halfWidthMetres: 0.14, halfLengthMetres: 0.34 };
  assert.equal(sweepPopulationHulls(box, box, body(-4, 0, wheel), body(4, 0, wheel)), null);
  assert.ok(sweepPopulationHulls(box, box, body(-4, 0, { ...wheel, minY: 2.7 }),
    body(4, 0, { ...wheel, minY: 2.7 })), 'a horizontal footprint alone is not a vertical gate');
  const person = body(0, 0, { halfWidthMetres: 0.42, halfLengthMetres: 0.42, maxY: 1.9 });
  assert.ok(sweepPopulationHulls(person, person, body(-4, 0, { minY: 0, maxY: 0.65 }),
    body(4, 0, { minY: 3, maxY: 3.65 })), 'jump heights must be checked at crossing time, not only at landing');
  assert.equal(sweepPopulationHulls(person, person, body(-4, 0, { minY: 3, maxY: 3.65 }),
    body(4, 0, { minY: 3, maxY: 3.65 })), null);
});

// 2026-10-04 (R2C-5): a rider who does not move is no longer waited on for
// good; the old pin stood the pair 2 m apart. After OCCUPANT_WAIT_SECONDS stalled
// on one, the walker steps off its path and walks past, then back onto it
// (round 3); where the ground beside the path will not take it, it turns round
// as at a path end after MUTUAL_WAIT_SECONDS (`resolveMutualWaits`).
test('a walking actor brakes for a rider who has stood still, then steps aside and walks past, or with no room turns round', () => {
  const rider = occupant('human-0', body(0, -6));
  const ride = (sampler: TerrainSampler) => {
    const simulation = new PopulationSimulation(plan(), sampler);
    let waitedAt = -1, waiting = NaN, steppedAt = -1, turnedAt = -1, widest = 0, closest = -Infinity, back = -1;
    for (let i = 0; i < Math.round(30 / STEP) && back < 0 && turnedAt < 0; i += 1) {
      simulate(simulation, 1, [rider]);
      const pose = simulation.snapshot().actors[0];
      assert.equal(simulation.queryContacts([rider]).length, 0, 'waiting and stepping aside prevented a physical collision');
      assert.equal(sweepPopulationHulls(pose.footprint, pose.footprint, rider.current, rider.current), null, 'never into the rider');
      if (pose.x === 0 && steppedAt < 0) closest = Math.max(closest, pose.z);
      if (waitedAt < 0 && pose.activity === 'waiting') { waitedAt = i; waiting = pose.z; assert.equal(pose.speedMetresPerSecond, 0); }
      if (waitedAt >= 0 && steppedAt < 0 && pose.x !== 0) steppedAt = i;
      widest = Math.max(widest, Math.abs(pose.x));
      if (steppedAt >= 0 && pose.x === 0 && pose.z > -6 + 1) back = i;
      if (waitedAt >= 0 && pose.direction === -1) turnedAt = i;
    }
    return { simulation, waitedAt, waiting, steppedAt, turnedAt, widest, closest, back };
  };
  const roomy = ride(flat);
  assert.ok(roomy.waitedAt > 0 && roomy.waiting > -12, 'the actor was allowed to move before reaching the obstacle');
  assert.ok(roomy.waiting <= -6 - 0.42 - 0.35 - POPULATION.humanWaitingGapMetres);
  assert.ok(roomy.closest <= roomy.waiting + 1e-9, 'on its path it never crept closer than where it stopped');
  const waited = (roomy.steppedAt - roomy.waitedAt) * STEP;
  // The stall is counted from when it began braking for the rider, not from
  // standing: a rider in the way is stepped round after 0.6 s of it (review r3).
  assert.ok(waited >= 0.1 && waited <= 1.0, `it stepped aside after a short wait (${waited.toFixed(2)} s)`);
  assert.ok(Math.abs(roomy.widest - 1.4) < 1e-9, `to the side, ${roomy.widest} m`);
  assert.ok(roomy.back > roomy.steppedAt && roomy.turnedAt < 0, 'walked past the rider and back onto its path');
  // Walls either side of the walk: no room to step aside, so it turns round.
  const narrow: TerrainSampler = { ...flat, sampleGround(x, z, out) { flat.sampleGround(x, z, out); out.offCourse = Math.abs(x) > 0.6; return out; } };
  const boxed = ride(narrow);
  assert.equal(boxed.steppedAt, -1, 'no room beside the path');
  const turned = (boxed.turnedAt - boxed.waitedAt) * STEP;
  assert.ok(turned >= 1.0 && turned <= 2.5, `it turned round after a bounded wait (${turned.toFixed(2)} s)`);
  simulate(boxed.simulation, Math.round(3 / STEP), [rider]);
  assert.ok(boxed.simulation.snapshot().actors[0].z < boxed.waiting - 0.5, 'and walked away along its path');
  // A rider who leaves releases the wait at once, before any turn.
  const released = new PopulationSimulation(plan(), flat);
  let stopped = NaN;
  for (let i = 0; i < Math.round(30 / STEP) && Number.isNaN(stopped); i += 1) {
    simulate(released, 1, [rider]); if (released.snapshot().actors[0].activity === 'waiting') stopped = released.snapshot().actors[0].z;
  }
  simulate(released, Math.round(0.5 / STEP)); assert.ok(released.snapshot().actors[0].z > stopped, 'departure releases the wait');
});

// 2026-10-04 (R2C-5): both actors still stop short of the occupants; they no
// longer stand there past the bounded wait, so this asserts the stop, not a pose.
test('all humans and cops block one shared population independent of input order', () => {
  const fixture = plan([line('left', 0), line('right', 8)],
    [actor('left-person', 'left'), actor('right-person', 'right')]);
  const human = occupant('human-0', body(0, -6));
  const cop = occupant('cop-0', body(8, -6), body(8, -6), 'cop');
  const a = createPopulationSimulation(fixture, flat), b = createPopulationSimulation(fixture, flat);
  const waited = new Set<string>();
  // 2026-10-04 (R2C-5, round 3): a walker held up by a stopped rider steps
  // aside and walks past after a bounded wait, so this asserts that no body is
  // ever entered, where it used to assert that no actor ever got past.
  for (let i = 0; i < 320; i += 1) {
    simulate(a, 1, [human, cop]); simulate(b, 1, [cop, human]);
    for (const pose of a.snapshot().actors) {
      for (const person of [human, cop]) assert.equal(sweepPopulationHulls(pose.footprint, pose.footprint, person.current, person.current), null);
      if (pose.activity === 'waiting') waited.add(pose.id);
    }
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.deepEqual([...waited].sort(), ['left-person', 'right-person'], 'each stopped for its occupant');
  // The waited-then-stepped-round actor now loses seconds, not the whole run.
  const noCop = createPopulationSimulation(fixture, flat); let unimpeded = true;
  for (let i = 0; i < 320; i += 1) { simulate(noCop, 1, [human]); unimpeded &&= noCop.snapshot().actors.find(value => value.id === 'right-person')!.activity !== 'waiting'; }
  assert.ok(unimpeded && noCop.snapshot().actors.find(value => value.id === 'right-person')!.z
    > a.snapshot().actors.find(value => value.id === 'right-person')!.z + 1,
  'the cop footprint materially changed the second actor, rather than only being listed');
});

test('a predicted moving rider crossing makes an actor wait without sidestepping or teleporting', () => {
  const fixture = plan([line()], [actor('person', 'walk', { initialDistanceMetres: 15 })]);
  const simulation = createPopulationSimulation(fixture, flat);
  const rider = occupant('crossing-human', body(-1.4, 0.8, { velocityX: 2.8 }));
  for (let i = 0; i < 12; i += 1) { simulation.step(STEP, [rider]); simulation.queryContacts([rider]); }
  const pose = simulation.snapshot().actors[0];
  assert.equal(pose.x, 0); assert.equal(pose.z, 0); assert.equal(pose.speedMetresPerSecond, 0);
});

test('simultaneously accelerating actors cannot pass through each other at a crossing', () => {
  const first = line('north');
  const east: PopulationPath = { ...line('east'), points: [-15, 0, 15].map((x, i) => ({
    x, y: 0, z: 0, headingY: Math.PI / 2, distanceMetres: i * 15,
    surface: 'pavement' as const, sourceSegmentId: 'east/source',
  })) };
  const simulation = createPopulationSimulation(plan([first, east], [
    actor('north-person', 'north', { initialDistanceMetres: 13.5 }),
    actor('east-person', 'east', { initialDistanceMetres: 13.5 }),
  ]), flat);
  let waited = false;
  for (let i = 0; i < 120; i += 1) {
    simulation.step(STEP); simulation.queryContacts([]);
    const poses = simulation.snapshot().actors;
    assert.equal(sweepPopulationHulls(poses[0].footprint, poses[0].footprint,
      poses[1].footprint, poses[1].footprint), null);
    waited ||= poses.some(value => value.activity === 'waiting');
  }
  assert.ok(waited, 'the simultaneous trajectory guard must materially stop the meeting');
});

test('snapshot and any number of pane interpolation reads cannot advance a physical clock', () => {
  const a = createPopulationSimulation(plan(), flat), b = createPopulationSimulation(plan(), flat);
  for (let i = 0; i < 100; i += 1) {
    a.step(STEP); b.step(STEP); a.queryContacts([]); b.queryContacts([]);
    a.interpolate(0.5);
    for (const alpha of [0, 0.25, 0.5, 1]) b.interpolate(alpha);
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
  const original = a.snapshot();
  const copy = a.snapshot() as unknown as { actors: { x: number; hull: { heightMetres: number } }[] };
  copy.actors[0].x = 10000; copy.actors[0].hull.heightMetres = 10000;
  assert.deepEqual(a.snapshot(), original, 'consumer edits may not leak back into simulation');
  const before = a.previousSnapshot(), middle = a.interpolate(0.5), current = a.snapshot();
  assert.equal(middle.actors[0].z, (before.actors[0].z + current.actors[0].z) / 2);
  a.step(0); assert.deepEqual(a.snapshot(), original);
});

test('restart replays every physical actor, shared phase and contact edge identically', () => {
  const fixture = plan([line()], [actor('social', 'walk', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 }),
    actor('walker', 'walk', { initialDistanceMetres: 3 })]);
  const simulation = createPopulationSimulation(fixture, flat);
  const run = (): string[] => Array.from({ length: 120 }, () => {
    simulation.step(STEP); simulation.queryContacts([]); return JSON.stringify(simulation.snapshot());
  });
  const initial = simulation.snapshot(), first = run();
  simulation.reset(); assert.deepEqual(simulation.snapshot(), initial);
  assert.deepEqual(run(), first);
  const samplerBefore = JSON.stringify(fixture);
  (fixture.actors[0] as { initialDistanceMetres: number }).initialDistanceMetres = 30;
  simulation.reset(); assert.deepEqual(simulation.snapshot(), initial, 'the live population owns its plan copy');
  assert.notEqual(JSON.stringify(fixture), samplerBefore, 'the mutation control changed the input plan');
});

test('feet, normal and chassis alignment come from finished ground without terrain writes', () => {
  let probes = 0, rays = 0;
  const slope: TerrainSampler = { sampleGround(x, z, out) {
    probes += 1; out.height = 0.025 * x + 0.04 * z;
    const length = Math.hypot(0.025, 1, 0.04);
    out.normal.x = -0.025 / length; out.normal.y = 1 / length; out.normal.z = -0.04 / length;
    out.surface = 'brick'; out.offCourse = false; return out;
  }, raycast() { rays += 1; return null; } };
  const fixture = plan(), original = JSON.stringify(fixture);
  const simulation = createPopulationSimulation(fixture, slope); simulate(simulation, 40);
  const pose = simulation.snapshot().actors[0];
  assert.equal(pose.y, 0.025 * pose.x + 0.04 * pose.z);
  assert.ok(Math.abs(pose.groundPitch - Math.atan(0.04)) < 1e-12);
  assert.ok(Math.abs(pose.groundRoll - Math.atan(0.025)) < 1e-12);
  assert.ok(probes > 0); assert.equal(rays, 0); assert.equal(JSON.stringify(fixture), original);
  assert.equal('sampleGround' in simulation, false, 'dynamic actors are not standable terrain solids');
  assert.ok(pose.supportHeights.every(Number.isFinite));
  assert.ok(Math.min(...pose.supportHeights) < pose.y && Math.max(...pose.supportHeights) > pose.y);
});

test('sole and tyre support samples follow actual targets on curved ground and snapshot readers cannot mutate them', () => {
  const curved: TerrainSampler = { sampleGround(x, z, out) {
    out.height = 0.03 * x * x + 0.004 * z * z;
    const nx = -0.06 * x, nz = -0.008 * z, length = Math.hypot(nx, 1, nz);
    out.normal.x = nx / length; out.normal.y = 1 / length; out.normal.z = nz / length;
    out.surface = 'pavement'; out.offCourse = false; return out;
  }, raycast() { return null; } };
  const simulation = createPopulationSimulation(plan([line('human', 0), line('van', 8, 'service')], [
    actor('human', 'human', { initialDistanceMetres: 15 }), van('van', 'van'),
  ]), curved);
  simulate(simulation, 2);
  for (const pose of simulation.snapshot().actors) {
    const targets = populationSupportTargets(pose);
    const expected = targets.feet ?? targets.tyres!;
    const sampled = pose.footSupports ?? pose.tyreSupports!;
    assert.equal(sampled.length, expected.length);
    for (let index = 0; index < sampled.length; index++) {
      const support = sampled[index], target = expected[index];
      assert.equal(support.x, target.x); assert.equal(support.z, target.z);
      assert.equal(support.y, 0.03 * support.x * support.x + 0.004 * support.z * support.z);
      assert.ok(support.y >= pose.footprint.minY && support.y <= pose.footprint.maxY);
      assert.notEqual(support.y, pose.y, 'centre height is the known-bad substitute for the actual support target');
    }
    (sampled[0] as { y: number }).y += 100;
    const fresh = simulation.snapshot().actors.find(value => value.id === pose.id)!;
    assert.notEqual((fresh.footSupports ?? fresh.tyreSupports!)[0].y, sampled[0].y);
  }
});

test('a graded tall vehicle hull includes the translated roof, lower corners and rotated heading frame', () => {
  const hull = van().hull, grade = 0.12, norm = Math.hypot(grade, 1);
  const n = { x: -grade / norm, y: 1 / norm, z: 0 };
  const footprint = physicalPopulationHull(0, 5, 0, 0, n.x, n.y, n.z, hull);
  const roofShift = n.x * hull.heightMetres;
  const graded = transformPopulationHull(0, 5, 0, 0, n.x, n.y, n.z, hull);
  assert.deepEqual(physicalPopulationHullFromTransform(graded), footprint);
  assert.ok(graded.corners.every(corner => corner.x >= footprint.x - footprint.halfWidthMetres - 1e-12
    && corner.x <= footprint.x + footprint.halfWidthMetres + 1e-12));
  assert.ok(footprint.x - footprint.halfWidthMetres <= -hull.halfWidthMetres);
  assert.ok(footprint.x + footprint.halfWidthMetres >= hull.halfWidthMetres,
    'the grade-only prism misses the upright uphill shoulder/head corner');
  assert.ok(graded.footprint.x + graded.footprint.halfWidthMetres < hull.halfWidthMetres,
    'the old grade-only footprint is the negative control for plumb anatomy');
  assert.ok(footprint.minY < 5);
  assert.ok(footprint.maxY > 5 + n.y * hull.heightMetres);
  const tiny = body(-1.2, 0, { halfWidthMetres: 0.02, halfLengthMetres: 0.02, minY: 6, maxY: 7.5 });
  const naive = body(0, 0, { halfWidthMetres: hull.halfWidthMetres, halfLengthMetres: hull.halfLengthMetres,
    minY: 5, maxY: 5 + hull.heightMetres });
  assert.equal(sweepPopulationHulls(naive, naive, tiny, tiny), null, 'the ungraded prism is the known-bad hull');
  assert.ok(sweepPopulationHulls(footprint, footprint, tiny, tiny), 'the roof-shift side of the real slope hull must collide');
  const yaw = Math.PI / 2;
  const turned = physicalPopulationHull(0, 5, 0, yaw, n.x, n.y, n.z, hull);
  const projectedCentre = turned.x * Math.sin(yaw) + turned.z * Math.cos(yaw);
  assert.ok(projectedCentre - turned.halfLengthMetres <= -hull.halfLengthMetres + 1e-12);
  assert.ok(projectedCentre + turned.halfLengthMetres >= hull.halfLengthMetres - 1e-12);
  assert.ok(turned.x < 0 && roofShift < 0,
    'normal rotation follows yaw, while bounds also contain the plumb source box');
});

test('preview is read-only, blocks at the first reachable hull and consumes clipped impact intent once', () => {
  const fixture = plan([line('near', 0), line('far', 4)], [
    actor('near-social', 'near', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 }),
    actor('far-social', 'far', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 }),
  ]);
  const simulation = createPopulationSimulation(fixture, flat);
  simulation.step(STEP);
  const before = simulation.snapshot();
  const intent = occupant('human-0', body(7, 0, { velocityX: 200 }), body(-3, 0, { velocityX: 200 }));
  const preview = simulation.previewMotion(intent)!;
  assert.equal(preview.actorId, 'near-social');
  assert.ok(preview.allowedMoveFraction < preview.timeOfImpact);
  assert.ok(preview.chargeImpact && preview.closingSpeedMetresPerSecond > 100);
  assert.deepEqual(simulation.previewMotion(intent), preview);
  assert.deepEqual(simulation.snapshot(), before, 'probing does not pause actors or move the clock');
  const stopped = occupant(intent.id, { ...intent.current,
    x: intent.previous.x + (intent.current.x - intent.previous.x) * preview.allowedMoveFraction,
    velocityX: 0 }, intent.previous);
  const contacts = simulation.queryContacts([stopped], [intent]);
  assert.equal(contacts.length, 1); assert.equal(contacts[0].actorId, 'near-social');
  assert.ok(contacts[0].charge);
  assert.deepEqual(simulation.queryContacts([stopped], [intent]), contacts);
  assert.equal(simulation.previewMotion(intent)!.chargeImpact, false,
    'the same geometric blocking sweep does not recharge pair history');
  assert.equal(simulation.snapshot().actors.find(value => value.id === 'far-social')!.activity, 'social');
});

test('open pedestrian shuttle stops, pauses and turns in place at the real endpoint', () => {
  const simulation = createPopulationSimulation(plan([line()], [actor('walker', 'walk', { initialDistanceMetres: 29.9 })]), flat);
  let previous = simulation.snapshot().actors[0], paused = false, turned = false, returned = false;
  for (let i = 0; i < 120; i += 1) {
    simulation.step(STEP); simulation.queryContacts([]);
    const pose = simulation.snapshot().actors[0];
    assert.ok(Math.hypot(pose.x - previous.x, pose.z - previous.z) <= 1.1 * STEP + 1e-9);
    assert.ok(Math.abs(wrapAngle(pose.headingY - previous.headingY)) <= POPULATION.endpointTurnRadiansPerSecond * STEP + 1e-9);
    if (pose.distanceMetres === 30 && pose.activity === 'waiting') paused = true;
    if (pose.activity === 'turning') { turned = true; assert.equal(pose.distanceMetres, 30); }
    if (turned && pose.direction === -1 && pose.distanceMetres < 29) returned = true;
    assert.ok(pose.z > 5, 'no wrap/teleport to the far end of the open path');
    previous = pose;
  }
  assert.ok(paused && turned && returned);
});

test('service reversal backs along the same authored path and does not flip body or tyre angle', () => {
  const simulation = createPopulationSimulation(plan([line('service', 0, 'service')],
    [van('service-van', 'service', { kind: 'serviceVehicle', movement: 'shuttle',
      speedMetresPerSecond: 1, initialDistanceMetres: 29.9 })]), flat);
  let backed = false, forwardRoll = 0;
  for (let i = 0; i < 100; i += 1) {
    simulation.step(STEP); simulation.queryContacts([]);
    const pose = simulation.snapshot().actors[0];
    assert.equal(pose.headingY, 0); assert.equal(pose.x, 0);
    if (pose.speedMetresPerSecond > 0) forwardRoll = pose.wheelTravelMetres;
    if (pose.backing) { backed = true; assert.ok(pose.speedMetresPerSecond < 0);
      assert.ok(pose.wheelTravelMetres < forwardRoll); assert.equal(pose.activity, 'reversing'); }
  }
  assert.ok(backed); assert.ok(simulation.snapshot().actors[0].distanceMetres < 29);
});

test('traffic advances only on an actual closed path with a continuous seam', () => {
  const road = loop();
  const spec = van('traffic', road.id, { kind: 'trafficVehicle', movement: 'loop',
    speedMetresPerSecond: 5.5, initialDistanceMetres: road.lengthMetres - 0.03 });
  const simulation = createPopulationSimulation(plan([road], [spec]), flat);
  let previous = simulation.snapshot().actors[0], crossedSeam = false;
  for (let i = 0; i < 320; i += 1) {
    simulation.step(STEP); simulation.queryContacts([]); const pose = simulation.snapshot().actors[0];
    if (pose.distanceMetres < previous.distanceMetres) crossedSeam = true;
    assert.ok(Math.hypot(pose.x - previous.x, pose.z - previous.z) <= 5.5 * STEP + 0.001);
    assert.equal(pose.direction, 1); assert.equal(pose.backing, false); previous = pose;
  }
  assert.ok(crossedSeam);
  assert.throws(() => createPopulationSimulation(plan([{ ...line('traffic'), closed: true }],
    [van('traffic', 'traffic', { kind: 'trafficVehicle', movement: 'loop' })]), flat), /genuinely close/);
  assert.throws(() => createPopulationSimulation(plan([line('traffic')],
    [van('traffic', 'traffic', { kind: 'trafficVehicle', movement: 'shuttle' })]), flat), /movement/);
  assert.throws(() => createPopulationSimulation(plan([{ ...line('service', 0, 'service'), serviceShuttle: false }],
    [van('service-van', 'service', { kind: 'serviceVehicle', movement: 'shuttle' })]), flat), /movement/);
});

test('stationary social actors and vehicles remain physical while workers alternate bounded work and walking', () => {
  const fixture = plan([line('work'), line('social', 8), line('service', 16, 'service')], [
    actor('worker', 'work', { kind: 'worker', initialDistanceMetres: 15, idleSeconds: 0.2 }),
    actor('social', 'social', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 }),
    van('parked', 'service'),
  ]);
  const simulation = createPopulationSimulation(fixture, flat), seen = new Set<string>();
  for (let i = 0; i < 440; i += 1) {
    simulation.step(STEP); simulation.queryContacts([]);
    for (const pose of simulation.snapshot().actors) {
      if (pose.id === 'worker') { seen.add(pose.activity); assert.ok(pose.z >= -1e-9 && pose.z <= POPULATION.workerExcursionMetres + 1e-9); }
      if (pose.id === 'social' || pose.id === 'parked') {
        assert.equal(pose.z, 0); assert.equal(pose.speedMetresPerSecond, 0);
        assert.equal(pose.gaitDistanceMetres, 0); assert.equal(pose.wheelTravelMetres, 0);
      }
    }
  }
  assert.ok(seen.has('working') && seen.has('walking') && seen.has('turning'));
  assert.equal(simulation.recoveryClearance(body(16, 0), [], [], 0).clear, false);
  assert.equal(simulation.recoveryClearance(body(8, 0), [], [], 0).clear, false);
});

test('swept rider contact returns an atomic movement limit with physical normal and speed', () => {
  const simulation = createPopulationSimulation(plan([line('service', 0, 'service')], [van()]), flat);
  simulation.step(STEP);
  const rider = occupant('human-0', body(4, 0, { velocityX: 160 }), body(-4, 0, { velocityX: 160 }));
  const contacts = simulation.queryContacts([rider]);
  assert.equal(contacts.length, 1);
  const hit = contacts[0]; assert.equal(hit.charge, true);
  assert.equal(hit.relativeSpeedMetresPerSecond, 160); assert.equal(hit.closingSpeedMetresPerSecond, 160);
  assert.ok(hit.allowedMoveFraction > 0 && hit.allowedMoveFraction < 1);
  assert.ok(hit.impactX < -1.32); assert.equal(hit.impactZ, 0);
  assert.ok(hit.sweepCorrectionX < -5.3); assert.equal(hit.separationX, 0);
  assert.deepEqual(simulation.queryContacts([rider]), contacts, 'query reads do not replay the event');
});

test('entry cooldown charges once while bounded overlap separation continues beyond its expiration', () => {
  const simulation = createPopulationSimulation(plan([line()],
    [actor('social', 'walk', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 })]), flat);
  const rider = occupant('human-0', body(0.4, 0));
  let charges = 0;
  for (let i = 0; i < 60; i += 1) {
    simulation.step(STEP, [rider]); const contacts = simulation.queryContacts([rider]);
    assert.equal(contacts.length, 1); if (contacts[0].charge) charges += 1;
    assert.ok(contacts[0].separationX > 0 && contacts[0].separationX <= POPULATION.separationMetresPerSecond * STEP);
  }
  assert.equal(charges, 1, 'a permanent overlap is one entry, not a recurring penalty');
  const clear = occupant('human-0', body(4, 0)); simulate(simulation, 20, [clear]);
  simulation.step(STEP, [rider]); assert.equal(simulation.queryContacts([rider])[0].charge, true);
});

test('chatter does not erase cooldown, and teleports/resets never cast a world-crossing sweep', () => {
  const simulation = createPopulationSimulation(plan([line()],
    [actor('social', 'walk', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 })]), flat);
  let charges = 0;
  for (let i = 0; i < 8; i += 1) {
    const rider = occupant('human-0', body(i % 2 ? 0.8 : 0.7, 0));
    simulation.step(STEP, [rider]); charges += simulation.queryContacts([rider]).filter(value => value.charge).length;
  }
  assert.equal(charges, 1);
  const discontinuity = { ...occupant('human-0', body(100, 0), body(-100, 0)), teleported: true };
  simulation.step(STEP, [discontinuity]); assert.equal(simulation.queryContacts([discontinuity]).length, 0);
  const reset = { ...occupant('human-0', body(0.4, 0)), reset: true };
  simulation.step(STEP, [reset]); assert.equal(simulation.queryContacts([reset]).length, 0);
  const newEntry = occupant('human-0', body(0.4, 0)); simulation.step(STEP, [newEntry]);
  assert.equal(simulation.queryContacts([newEntry])[0].charge, true, 'discontinuity clears the old pair identity');
});

test('impact activity has a bounded pause instead of extending on every merged step', () => {
  const simulation = createPopulationSimulation(plan([line()], [actor('walker', 'walk', { initialDistanceMetres: 15 })]), flat);
  const rider = occupant('human-0', body(0.4, 0));
  simulation.step(STEP, [rider]); simulation.queryContacts([rider]);
  assert.equal(simulation.snapshot().actors[0].activity, 'impacted');
  simulate(simulation, Math.ceil(POPULATION.impactPauseSeconds / STEP) + 2, [rider]);
  assert.notEqual(simulation.snapshot().actors[0].activity, 'impacted');
  const position = simulation.snapshot().actors[0].z;
  simulate(simulation, 40); assert.ok(simulation.snapshot().actors[0].z > position, 'the recoverable actor resumes after departure');
});

test('two simultaneous contact queries include a human and a cop with stable independent pair identities', () => {
  const simulation = createPopulationSimulation(plan([line('left', 0), line('right', 8)], [
    actor('left-social', 'left', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 }),
    actor('right-social', 'right', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 }),
  ]), flat);
  const human = occupant('human-0', body(3, 0, { velocityX: 120 }), body(-3, 0, { velocityX: 120 }));
  const cop = occupant('cop-0', body(11, 0, { velocityX: 120 }), body(5, 0, { velocityX: 120 }), 'cop');
  simulation.step(STEP); const contacts = simulation.queryContacts([human, cop]);
  assert.equal(contacts.length, 2);
  assert.deepEqual(contacts.map(value => [value.actorId, value.occupantKind]).sort(),
    [['left-social', 'human'], ['right-social', 'cop']]);
  assert.ok(contacts.every(value => value.charge));
});

test('an unreachable second actor beyond the first swept stop is not charged or paused', () => {
  const simulation = createPopulationSimulation(plan([line('near', 0), line('far', 4)], [
    actor('near-social', 'near', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 }),
    actor('far-social', 'far', { kind: 'social', movement: 'stationary', initialDistanceMetres: 15 }),
  ]), flat);
  simulation.step(STEP);
  const rider = occupant('human-0', body(7, 0, { velocityX: 200 }), body(-3, 0, { velocityX: 200 }));
  const contacts = simulation.queryContacts([rider]);
  assert.deepEqual(contacts.map(value => value.actorId), ['near-social']);
  assert.equal(simulation.snapshot().actors.find(value => value.id === 'far-social')!.activity, 'social');
});

test('recovery checks exact current oriented hulls, stopped bodies and clock-bounded reservations', () => {
  const simulation = createPopulationSimulation(plan([line('service', 0, 'service')], [van()]), flat);
  assert.equal(simulation.recoveryClearance(body(0, 0)).clear, false);
  assert.equal(simulation.recoveryClearance(body(2, 0)).clear, true, 'the van-circle phantom is not a recovery veto');
  assert.equal(simulation.recoveryClearance(body(0, 0, { minY: 2.81, maxY: 3.46 })).clear, true);
  const person = occupant('human-0', body(5, 0));
  const reservation = { id: 'recover-human-1', footprint: body(8, 0), expiresAtClockSeconds: 0.1 };
  assert.deepEqual(simulation.recoveryClearance(body(5, 0), [person]).occupantIds, ['human-0']);
  assert.deepEqual(simulation.recoveryClearance(body(8, 0), [], [reservation]).reservationIds, ['recover-human-1']);
  simulation.step(0.2); assert.equal(simulation.recoveryClearance(body(8, 0), [], [reservation]).clear, true);
  const walker = createPopulationSimulation(plan(), flat);
  const closeReservation = { id: 'spawn-space', footprint: body(0, -10), expiresAtClockSeconds: 2 };
  for (let i = 0; i < 35; i += 1) { walker.step(STEP, [], [closeReservation]); walker.queryContacts([]); }
  assert.equal(walker.snapshot().actors[0].speedMetresPerSecond, 0);
  const waiting = walker.snapshot().actors[0].z;
  for (let i = 0; i < 65; i += 1) { walker.step(STEP, [], [closeReservation]); walker.queryContacts([]); }
  assert.ok(walker.snapshot().actors[0].z > waiting + 1);
});

test('construction has no quality, options, camera or pane inputs and rejects malformed physical inputs', () => {
  assert.equal(PopulationSimulation.length, 2); assert.equal(createPopulationSimulation.length, 2);
  const source = readFileSync(new URL('./population.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:app\/|render\/|ui\/|three)/);
  assert.doesNotMatch(source, /readonly\s+(?:quality|options|camera|pane|reducedMotion)\b/);
  const simulation = createPopulationSimulation(plan(), flat);
  assert.throws(() => simulation.step(-0.01), /fixed step/);
  assert.throws(() => simulation.step(1), /fixed step/);
  assert.throws(() => simulation.step(STEP, [occupant('bad', body(0, 0, { minY: 4, maxY: 1 }))]), /prism/);
  assert.throws(() => simulation.queryContacts([occupant('same', body()), occupant('same', body(5))]), /identities/);
});
