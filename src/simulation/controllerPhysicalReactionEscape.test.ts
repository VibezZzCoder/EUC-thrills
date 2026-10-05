/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucDynamicWorld } from './EucController.ts';
import { EucController as NativeController } from './EucController.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { populationPhysicalReactionAllowed as knownBadAnyHit } from './physicalReactionAnyHit.test-support.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { PopulationSimulation } from './population.ts';
import { sweepPopulationHulls } from './population.ts';
import { ContactPair } from '../simulation/contact.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { CONTACT, RIDER_CONTACT, RIDER_OCCUPANCY } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import type { TerrainSampler } from '../simulation/world.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const poseOf = (controller: { writePose(out: ReturnType<typeof createPose>): void }) => { const pose = createPose(); controller.writePose(pose); return pose; };
function population(x = 500, z = 0, sampler = flat) {
  const plan: PopulationPlan = { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'escape', installedWorldId: 'escape/living-r1', contentDigest: 'escape', anchors: [],
    paths: [{ id: 'path', role: 'pedestrian', district: 'park', points: [-1, 1].map((dz, i) => ({ x, y: 0, z: z + dz, headingY: 0, distanceMetres: i * 2, surface: 'pavement', sourceSegmentId: 'fixture' })), lengthMetres: 2, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'npc', kind: 'walker', pathId: 'path', initialDistanceMetres: 1, direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0, hull: { halfWidthMetres: .28, halfLengthMetres: .28, heightMetres: 1.9 } }], report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
  return new PopulationSimulation(plan, sampler);
}
const port = (canReact: EucDynamicWorld['canReact']): EucDynamicWorld => ({ hull: { halfWidthMetres: .3, halfLengthMetres: .3, heightMetres: 2 }, resolveMotion: () => null, canPlace: () => true, canReact });
const footprint = (part: ReturnType<typeof buildRiderOccupancyEnvelope>['human']) => ({ x: part.x, z: part.z, headingY: part.headingY, halfWidthMetres: part.halfWidth, halfLengthMetres: part.halfLength, minY: part.baseY, maxY: part.topY, velocityX: 0, velocityZ: 0 });

// Explicitly rejected policy: blanket initial-contact refusal without an
// outward escape proof. The retained old helper is not this policy: the
// compound chronology already admits endpoint-improving rigid escapes.
const blanketInitialRiderRefusal = (input: Parameters<typeof populationPhysicalReactionAllowed>[0]) => {
  const before = buildRiderOccupancyEnvelope(input.request.previous, RIDER_OCCUPANCY);
  for (const other of input.occupants) if (other.id !== input.ownerId) {
    const held = buildRiderOccupancyEnvelope(other.pose, RIDER_OCCUPANCY);
    for (const first of [before.wheel, before.human]) for (const second of [held.wheel, held.human]) {
      if (sweepPopulationHulls(footprint(first), footprint(first), footprint(second), footprint(second))?.initiallyOverlapping) return false;
    }
  }
  return knownBadAnyHit(input);
};
test('actual two-rider ContactPair sequential outward pushes match native while a blanket initial-contact control locks the pair', () => {
  const guarded = [new EucController(flat), new EucController(flat)], native = [new NativeController(flat), new NativeController(flat)];
  for (const pair of [guarded, native]) pair[1].reset({ position: { x: .3, y: 0, z: 0 }, headingY: 0 });
  const npc = population(), cache = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, createPose()), accepted: boolean[] = [], rejectedByOld: boolean[] = [], rejectedByBlanket: boolean[] = [];
  guarded.forEach((controller, i) => controller.setDynamicWorld(port(request => {
    const input = { ownerId: `human-${i}`, request, population: npc, certificates: cache, occupants: guarded.map((value, j) => ({ id: `human-${j}`, pose: poseOf(value) })), reservations: [] };
    rejectedByOld.push(!knownBadAnyHit(input)); rejectedByBlanket.push(!blanketInitialRiderRefusal(input)); const value = populationPhysicalReactionAllowed(input); accepted.push(value); return value;
  })));
  const poses = native.map(poseOf), contact = new ContactPair().step(DT, { x: poses[0].x, z: poses[0].z, velocityX: 0, velocityZ: 0 }, { x: poses[1].x, z: poses[1].z, velocityX: 0, velocityZ: 0 });
  assert.ok(contact && contact.pushMetres > 0);
  guarded[0].separate(-contact.axisX * contact.pushMetres, -contact.axisZ * contact.pushMetres); native[0].separate(-contact.axisX * contact.pushMetres, -contact.axisZ * contact.pushMetres);
  assert.deepEqual(poseOf(guarded[0]), poseOf(native[0]));
  guarded[1].separate(contact.axisX * contact.pushMetres, contact.axisZ * contact.pushMetres); native[1].separate(contact.axisX * contact.pushMetres, contact.axisZ * contact.pushMetres);
  assert.deepEqual(accepted, [true, true]);
  assert.deepEqual(rejectedByOld, [false, false], 'retained original helper already admits these endpoint-improving rigid escapes');
  assert.deepEqual(rejectedByBlanket, [true, true], 'the explicit blanket initial-contact policy must expose the actual couch lock');
  for (let i = 0; i < 2; i += 1) { assert.deepEqual(poseOf(guarded[i]), poseOf(native[i])); assert.deepEqual(guarded[i].snapshot(), native[i].snapshot()); }
  assert.ok(poseOf(guarded[1]).x - poseOf(guarded[0]).x > .3, 'both actual pushes must separate the same couch pair');
  const before = poseOf(guarded[0]); guarded[0].separate(contact.axisX * contact.pushMetres, 0);
  assert.equal(accepted.at(-1), false, 'reversing the same push must not deepen existing rider intrusion'); assert.deepEqual(poseOf(guarded[0]), before);
});
test('native hardKnock remains admitted beside its already-overlapping striker instead of being blanket-refused by the any-hit control', () => {
  const victim = new EucController(flat), native = new NativeController(flat), striker = new EucController(flat);
  striker.reset({ position: { x: .3, y: 0, z: 0 }, headingY: 0 });
  const npc = population(), cache = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, createPose()); let oldAllowed: boolean | undefined, allowed: boolean | undefined;
  victim.setDynamicWorld(port(request => { const input = { ownerId: 'victim', request, population: npc, certificates: cache, occupants: [{ id: 'striker', pose: poseOf(striker) }], reservations: [] };
    oldAllowed = knownBadAnyHit(input); allowed = populationPhysicalReactionAllowed(input); return allowed; }));
  assert.equal(victim.hardKnock(3, -2), native.hardKnock(3, -2)); assert.equal(allowed, true); assert.equal(oldAllowed, false);
  assert.equal(victim.crashed, true); assert.deepEqual(poseOf(victim), poseOf(native)); assert.deepEqual(victim.snapshot(), native.snapshot());
});
test('certified outward escape from an existing rider overlap never exempts a new actual NPC intrusion', () => {
  const controller = new EucController(flat), other = new EucController(flat); other.reset({ position: { x: .3, y: 0, z: 0 }, headingY: 0 });
  const before = poseOf(controller), human = buildRiderOccupancyEnvelope(before, RIDER_OCCUPANCY).human, push = .01;
  const npc = population(human.x - human.halfWidth - .28 - push / 2, human.z), cache = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, createPose());
  assert.equal(npc.recoveryClearance(footprint(human), [], [], 0).clear, true);
  let allowed: boolean | undefined; controller.setDynamicWorld(port(request => allowed = populationPhysicalReactionAllowed({ ownerId: 'victim', request, population: npc, certificates: cache, occupants: [{ id: 'other', pose: poseOf(other) }], reservations: [] })));
  controller.separate(-push, 0); assert.equal(allowed, false); assert.deepEqual(poseOf(controller), before);
  const bad = new NativeController(flat); bad.separate(-push, 0); assert.equal(npc.recoveryClearance(footprint(buildRiderOccupancyEnvelope(poseOf(bad), RIDER_OCCUPANCY).human), [], [], 0).clear, false);
});
test('a real resting hard-knock shape change near an elevated NPC is refused even when an overlapping striker owns the hit', () => {
  const controller = new EucController(flat), native = new NativeController(flat), striker = new EucController(flat);
  for (const value of [controller, native]) for (let i = 0; i < 360; i += 1) value.step(DT, NEUTRAL_ACTIONS);
  striker.reset({ position: { x: .3, y: 0, z: 0 }, headingY: 0 });
  const before = poseOf(controller), first = buildRiderOccupancyEnvelope(before, RIDER_OCCUPANCY).human;
  assert.ok(before.restFactor > .5, 'fixture must use an actual native resting stance'); assert.equal(native.hardKnock(3, 0), true);
  const last = buildRiderOccupancyEnvelope(poseOf(native), RIDER_OCCUPANCY).human;
  assert.ok(last.topY - first.topY > .04, 'actual hard knock must lift the resting envelope into a strict vertical witness');
  const height = (first.topY + last.topY) / 2;
  const raised: TerrainSampler = { ...flat, sampleGround(x, z, out) { flat.sampleGround(x, z, out); out.height = height; return out; } };
  const npc = population(last.x, last.z, raised), cache = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, createPose());
  assert.equal(npc.recoveryClearance(footprint(first), [], [], 0).clear, true); assert.equal(npc.recoveryClearance(footprint(last), [], [], 0).clear, false, 'native unguarded hard-knock shape must intrude into the real elevated NPC');
  const state = controller.snapshot(); let allowed: boolean | undefined;
  controller.setDynamicWorld(port(request => allowed = populationPhysicalReactionAllowed({ ownerId: 'victim', request, population: npc, certificates: cache, occupants: [{ id: 'striker', pose: poseOf(striker) }], reservations: [] })));
  assert.equal(controller.hardKnock(3, 0), false); assert.equal(allowed, false); assert.deepEqual(poseOf(controller), before); assert.deepEqual(controller.snapshot(), state);
});

test('native endpoint-clearing separate cannot use compound escape to worsen an existing actual NPC overlap', () => {
  const controller = new EucController(flat), native = new NativeController(flat), middle = new NativeController(flat);
  const before = poseOf(controller), parts = buildRiderOccupancyEnvelope(before, RIDER_OCCUPANCY), human = parts.human;
  const height = (parts.wheel.topY + human.topY) / 2;
  assert.ok(height > parts.wheel.topY && height < human.topY, 'fixture must separate the actual wheel and human vertical components');
  const raised: TerrainSampler = { ...flat, sampleGround(x, z, out) { flat.sampleGround(x, z, out); out.height = height; return out; } };
  const npc = population(human.x - human.halfWidth - .28 + .005, human.z, raised);
  const actor = npc.snapshot().actors[0].footprint;
  assert.equal(npc.recoveryClearance(footprint(parts.wheel), [], [], 0).clear, true, 'the actual wheel must not make the negative witness trivial');
  assert.equal(npc.recoveryClearance(footprint(human), [], [], 0).clear, false);
  const delta = -2 * (human.halfWidth + .28) - .1;
  native.separate(delta, 0); middle.separate(delta / 2, 0);
  const last = buildRiderOccupancyEnvelope(poseOf(native), RIDER_OCCUPANCY), interior = buildRiderOccupancyEnvelope(poseOf(middle), RIDER_OCCUPANCY).human;
  assert.equal(npc.recoveryClearance(footprint(last.human), [], [], 0).clear, true);
  assert.equal(npc.recoveryClearance(footprint(last.wheel), [], [], 0).clear, true);
  const contact = (body: ReturnType<typeof footprint>) => sweepPopulationHulls(body, body, actor, actor);
  assert.ok(contact(footprint(interior))!.penetrationMetres > contact(footprint(human))!.penetrationMetres + .1,
    'actual native midpoint must worsen the shallow initial NPC overlap before the exact endpoint clears');
  const cache = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, createPose()); let accepted: boolean | undefined, originalAllowed: boolean | undefined;
  controller.setDynamicWorld(port(request => { const input = { ownerId: 'victim', request, population: npc, certificates: cache, occupants: [], reservations: [] };
    originalAllowed = knownBadAnyHit(input); accepted = populationPhysicalReactionAllowed(input); return accepted; }));
  const state = controller.snapshot(); controller.separate(delta, 0);
  assert.equal(originalAllowed, true, 'the retained endpoint-escape helper must fail this strict interior NPC witness');
  assert.equal(accepted, false); assert.deepEqual(poseOf(controller), before); assert.deepEqual(controller.snapshot(), state);
});

// 2026-10-04 (browser m36_5 merged pair, review g3): the living world's
// admission locked a merged couch pair in place at every heading but exactly
// 0, on every venue, and stalled nearly merged pairs at wheel-touching
// distance (0.54/0.63 m) inside the 0.80 m contact radius. Sep 26 had no
// admission and eased all of these clear. Production certificates and the
// real ContactPair fallback axis are used, so this is the couch's own step.
const easeApart = (heading: number, dx: number, dz: number) => {
  const riders = [new EucController(flat), new EucController(flat)];
  riders[0].reset({ position: { x: 0, y: 0, z: 0 }, headingY: heading });
  riders[1].reset({ position: { x: dx, y: 0, z: dz }, headingY: heading });
  const npc = population(), cache = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose()); let refused = 0;
  riders.forEach((controller, i) => controller.setDynamicWorld(port(request => {
    const allowed = populationPhysicalReactionAllowed({ ownerId: `human-${i}`, request, population: npc, certificates: cache,
      occupants: riders.map((value, j) => ({ id: `human-${j}`, pose: poseOf(value) })), reservations: [] });
    if (!allowed) refused += 1; return allowed;
  })));
  const pair = new ContactPair();
  for (let step = 0; step < 120; step += 1) {
    const a = poseOf(riders[0]), b = poseOf(riders[1]);
    const contact = pair.step(DT, { x: a.x, z: a.z, velocityX: 0, velocityZ: 0 }, { x: b.x, z: b.z, velocityX: 0, velocityZ: 0 });
    if (!contact) break;
    riders[0].separate(-contact.axisX * contact.pushMetres, -contact.axisZ * contact.pushMetres);
    riders[1].separate(contact.axisX * contact.pushMetres, contact.axisZ * contact.pushMetres);
  }
  const a = poseOf(riders[0]), b = poseOf(riders[1]);
  return { gap: Math.hypot(b.x - a.x, b.z - a.z), refused };
};
test('a merged or nearly merged couch pair is eased clear of the contact radius at every heading', () => {
  const headings = [0, Math.PI / 4, Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4, Math.PI];
  const offsets: readonly (readonly [number, number])[] = [[0, 0], [.01, 0], [0, .01], [.05, 0], [0, .05], [.1, 0], [0, .1], [.2, 0], [0, .2]];
  const stuck: string[] = [];
  for (const heading of headings) for (const [dx, dz] of offsets) {
    const { gap, refused } = easeApart(heading, dx, dz);
    if (!(gap >= CONTACT.radiusMetres) || refused > 0) stuck.push(`heading ${heading.toFixed(3)} offset (${dx}, ${dz}): gap ${gap.toFixed(3)} m, ${refused} refused`);
  }
  assert.deepEqual(stuck, [], 'every merged pair must leave the contact radius with no refused outward push');
});
test('the merged-pair exemption still refuses a push into a touching rider and a push into an untouched one', () => {
  const extent = (cache: PopulationPhysicalCertificates, id: string, controller: EucController) =>
    cache.components(id, poseOf(controller), poseOf(controller), 0, 'placement').map(component => component.at(0));
  // Heading 0: every component's width axis is world x.
  const right = (bodies: readonly { x: number; halfWidthMetres: number }[]) => Math.max(...bodies.map(body => body.x + body.halfWidthMetres));
  const left = (bodies: readonly { x: number; halfWidthMetres: number }[]) => Math.min(...bodies.map(body => body.x - body.halfWidthMetres));
  for (const [name, beyondTouch] of [['touching', -.05], ['untouched', .005]] as const) {
    const controller = new EucController(flat), native = new NativeController(flat), other = new EucController(flat);
    const cache = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
    other.reset({ position: { x: right(extent(cache, 'mover', controller)) - left(extent(cache, 'other', other)) + beyondTouch, y: 0, z: 0 }, headingY: 0 });
    const npc = population(); let allowed: boolean | undefined;
    controller.setDynamicWorld(port(request => allowed = populationPhysicalReactionAllowed({ ownerId: 'human-0', request, population: npc,
      certificates: cache, occupants: [{ id: 'human-0', pose: poseOf(controller) }, { id: 'human-1', pose: poseOf(other) }], reservations: [] })));
    const before = poseOf(controller), state = controller.snapshot();
    controller.separate(.01, 0); native.separate(.01, 0);
    assert.equal(allowed, false, `a push toward a ${name} rider must be refused`);
    assert.deepEqual(poseOf(controller), before); assert.deepEqual(controller.snapshot(), state);
    assert.ok(Math.max(...cache.components('native', poseOf(native), poseOf(native), 0, 'placement').map(component => component.at(0).x + component.at(0).halfWidthMetres))
      > left(extent(cache, 'other', other)), `the unguarded push must really reach the ${name} rider`);
    controller.separate(-.01, 0);
    assert.equal(allowed, true, `the same push away from a ${name} rider is admitted`);
  }
});
