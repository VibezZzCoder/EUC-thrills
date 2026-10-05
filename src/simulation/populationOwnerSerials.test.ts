/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PopulationOwnerSerialHistory } from './populationOwnerSerials.ts';
import { PopulationSimulation } from '../simulation/population.ts';
import { EucController } from '../simulation/EucController.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
import type { TerrainSampler } from '../simulation/world.ts';
test('a between-tick placement remains visible after repeated start snapshots until an epoch seals', () => {
  const history = new PopulationOwnerSerialHistory(), old = [{ id: 'seat', serial: 1 }], placed = [{ id: 'seat', serial: 2 }];
  assert.deepEqual([...history.begin(old)], []); history.seal(old);
  const overwrittenStartSerial = placed[0].serial;
  assert.equal(overwrittenStartSerial !== placed[0].serial, false, 'known-bad before-snapshot comparison must lose the placement edge');
  assert.deepEqual([...history.begin(placed)], ['seat']); assert.deepEqual([...history.begin(placed)], ['seat']);
  history.seal(placed); assert.deepEqual([...history.begin(placed)], []);
});
test('accepted placement in the current epoch seals once while refusal retains the old serial', () => {
  const history = new PopulationOwnerSerialHistory(); history.seal([{ id: 'seat', serial: 3 }]);
  assert.deepEqual([...history.begin([{ id: 'seat', serial: 3 }])], []);
  history.seal([{ id: 'seat', serial: 4 }]); assert.deepEqual([...history.begin([{ id: 'seat', serial: 4 }])], []);
  history.seal([{ id: 'seat', serial: 4 }]); assert.deepEqual([...history.begin([{ id: 'seat', serial: 5 }])], ['seat']);
});
test('removed owners and installed worlds cannot lend old serials to a fresh controller', () => {
  const history = new PopulationOwnerSerialHistory(); history.seal([{ id: 'seat', serial: 9 }]); history.seal([]);
  assert.deepEqual([...history.begin([{ id: 'seat', serial: 1 }])], []);
  history.seal([{ id: 'seat', serial: 9 }]); history.clear(); assert.deepEqual([...history.begin([{ id: 'seat', serial: 1 }])], []);
  assert.throws(() => history.begin([{ id: 'seat', serial: 1 }, { id: 'seat', serial: 1 }]), /distinct/);
  assert.throws(() => history.begin([{ id: 'seat', serial: NaN }]), /integer/);
});
test('a genuine native pair cooldown clears across a boundary reset that the overwritten-start control forgets', () => {
  const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
  const plan: PopulationPlan = { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'serial', installedWorldId: 'serial/living-r1', contentDigest: 'serial', anchors: [],
    paths: [{ id: 'path', role: 'pedestrian', district: 'park', points: [-1, 1].map((z, i) => ({ x: 0, y: 0, z, headingY: 0, distanceMetres: i * 2, surface: 'pavement', sourceSegmentId: 'fixture' })), lengthMetres: 2, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'npc', kind: 'walker', pathId: 'path', initialDistanceMetres: 1, direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0, hull: { halfWidthMetres: .2, halfLengthMetres: .2, heightMetres: 1.8 } }], report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
  const footprint = { x: 0, z: 0, headingY: 0, halfWidthMetres: .1, halfLengthMetres: .1, minY: 0, maxY: 2, velocityX: 0, velocityZ: 0 };
  const person = { id: 'seat', kind: 'human' as const, previous: footprint, current: footprint };
  const actual = new PopulationSimulation(plan, flat), knownBad = new PopulationSimulation(plan, flat), history = new PopulationOwnerSerialHistory();
  for (const simulation of [actual, knownBad]) { simulation.step(.01, [person]); assert.equal(simulation.queryContacts([person])[0].charge, true); }
  history.seal([{ id: 'seat', serial: 1 }]); const teleported = history.begin([{ id: 'seat', serial: 2 }]).has('seat'); assert.equal(teleported, true);
  actual.step(.01, [{ ...person, teleported }]); assert.deepEqual(actual.queryContacts([{ ...person, teleported }]), []); history.seal([{ id: 'seat', serial: 2 }]);
  knownBad.step(.01, [person]); assert.equal(knownBad.queryContacts([person])[0].charge, false);
  actual.step(.01, [person]); knownBad.step(.01, [person]);
  assert.equal(actual.queryContacts([person])[0].charge, true, 'reset must clear the prior native pair edge');
  assert.equal(knownBad.queryContacts([person])[0].charge, false, 'forgotten boundary reset must retain the old cooldown');
});

test('a same-id replacement controller with an equal native construct serial clears NPC cooldown before its new bump', () => {
  const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
  const oldController = new EucController(flat), replacement = new EucController(flat);
  assert.notEqual(replacement, oldController); assert.equal(replacement.discontinuitySerial, oldController.discontinuitySerial, 'two actual constructors must reuse the numeric serial');
  const plan: PopulationPlan = { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'replacement', installedWorldId: 'replacement/living-r1', contentDigest: 'replacement', anchors: [],
    paths: [{ id: 'path', role: 'pedestrian', district: 'park', points: [-1, 1].map((z, i) => ({ x: 0, y: 0, z, headingY: 0, distanceMetres: i * 2, surface: 'pavement', sourceSegmentId: 'fixture' })), lengthMetres: 2, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'npc', kind: 'walker', pathId: 'path', initialDistanceMetres: 1, direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0, hull: { halfWidthMetres: .2, halfLengthMetres: .2, heightMetres: 1.8 } }], report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
  const footprint = { x: 0, z: 0, headingY: 0, halfWidthMetres: .1, halfLengthMetres: .1, minY: 0, maxY: 2, velocityX: 0, velocityZ: 0 };
  const person = { id: 'human-1', kind: 'human' as const, previous: footprint, current: footprint };
  const actual = new PopulationSimulation(plan, flat), knownBad = new PopulationSimulation(plan, flat), history = new PopulationOwnerSerialHistory();
  for (const population of [actual, knownBad]) { population.step(.01, [person]); assert.equal(population.queryContacts([person])[0].charge, true); }
  const previous = [{ id: person.id, serial: oldController.discontinuitySerial, controller: oldController }], next = [{ id: person.id, serial: replacement.discontinuitySerial, controller: replacement }];
  history.seal(previous); const teleported = history.begin(next).has(person.id); assert.equal(teleported, true); assert.equal(history.begin(next).has(person.id), true);
  assert.equal(previous[0].serial !== next[0].serial, false, 'known-bad numeric-only boundary check must miss real same-slot replacement');
  actual.step(.01, [{ ...person, teleported }]); assert.deepEqual(actual.queryContacts([{ ...person, teleported }]), []); history.seal(next);
  knownBad.step(.01, [person]); assert.equal(knownBad.queryContacts([person])[0].charge, false);
  assert.equal(history.begin(next).has(person.id), false, 'the actual replacement seals once');
  actual.step(.01, [person]); knownBad.step(.01, [person]);
  assert.equal(actual.queryContacts([person])[0].charge, true, 'fresh controller must own a fresh native contact edge');
  assert.equal(knownBad.queryContacts([person])[0].charge, false, 'same numeric serial must not lend the old controller cooldown');
});
