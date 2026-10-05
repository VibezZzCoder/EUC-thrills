/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Round-3 contact regressions (R2C-1..R2C-6, VIS-CRASH-1; 2026-10-04). Every
 * case runs the real controller, population, certificates and whole-step
 * transaction in Game's order through the headless composition double, against
 * the generated world's own person and parked-car hulls, and at the geometries
 * the round-2 review found failing: wipeouts far from anyone, rotated person
 * hulls clipped off-centre, a van met at 45 degrees, a side landing beside a
 * person, a hop held against a car with the throttle down, two seats falling
 * beside one seated person, and the rider's crash into a person seen side-on.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, POPULATION_OCCUPANT, RIDER_CONTACT } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import { createPose, EucController, type EucDynamicWorld, type EucPose } from './EucController.ts';
import type { PopulationFootprint, PopulationReservation } from './population.ts';
import { PopulationSimulation } from './population.ts';
import type { PopulationCompoundTrajectory } from './populationCompound.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { commitPopulationPhysicalTransaction } from './populationPhysicalTransaction.ts';
import { HARNESS_DT as DT, PopulationContactHarness, flatPavement, populationPlanOf, stationaryCar, stationaryPerson, straightPath } from './populationContactHarness.test-support.ts';
import type { TerrainSampler } from './world.ts';

/** Restated so this file also loads on the pre-fix tree for its negative controls:
 * the rag particle radii (ragdoll.ts), POPULATION.sweepResolutionMetres,
 * POPULATION.stepTotalRefinementBudget and POPULATION_CONTACT.holdWatchdogSeconds. */
const RAGDOLL_RADII = [0.14, 0.14, 0.12, 0.10, 0.10, 0.10, 0.10, 0.05, 0.05, 0.07, 0.07];
const SWEEP_RESOLUTION = 0.025, STEP_TOTAL_BUDGET = 32, POPULATION_CONTACT_WATCHDOG = 0.25;
const ride = (throttle: number, steer = 0): ActionSnapshot => ({ ...NEUTRAL_ACTIONS, throttle, steer });
const holdSpeed = (speed: number, target: number) => ride(speed < target - .3 ? 1 : speed > target + .3 ? -0.3 : 0.05);

function gap(body: PopulationFootprint, actor: PopulationFootprint): number {
  const axes = (heading: number) => [{ x: Math.cos(heading), z: -Math.sin(heading) }, { x: Math.sin(heading), z: Math.cos(heading) }];
  const support = (value: PopulationFootprint, axis: { x: number; z: number }) => { const [x, z] = axes(value.headingY);
    return Math.abs(x.x * axis.x + x.z * axis.z) * value.halfWidthMetres + Math.abs(z.x * axis.x + z.z * axis.z) * value.halfLengthMetres; };
  return Math.max(body.minY - actor.maxY, actor.minY - body.maxY, ...[...axes(body.headingY), ...axes(actor.headingY)].map(axis =>
    Math.abs((actor.x - body.x) * axis.x + (actor.z - body.z) * axis.z) - support(body, axis) - support(actor, axis)));
}
const prismOf = (part: ReturnType<typeof buildRiderOccupancyEnvelope>['wheel']): PopulationFootprint => ({ x: part.x, z: part.z,
  headingY: part.headingY, halfWidthMetres: part.halfWidth, halfLengthMetres: part.halfLength, minY: part.baseY, maxY: part.topY, velocityX: 0, velocityZ: 0 });
/** The nearest rag particle (its radius box in the actor's frame) and the wheel. */
function bodyGaps(pose: EucPose, actor: PopulationFootprint): { particle: number; wheel: number } {
  let particle = Infinity;
  if (pose.ragdollBlend > 0) RAGDOLL_RADII.forEach((radius, index) => { particle = Math.min(particle, gap({ x: pose.ragdoll[index * 3],
    z: pose.ragdoll[index * 3 + 2], headingY: actor.headingY, halfWidthMetres: radius, halfLengthMetres: radius,
    minY: pose.ragdoll[index * 3 + 1] - radius, maxY: pose.ragdoll[index * 3 + 1] + radius, velocityX: 0, velocityZ: 0 }, actor)); });
  return { particle, wheel: gap(prismOf(buildRiderOccupancyEnvelope(pose, RIDER_CONTACT).wheel), actor) };
}
const mountedGap = (pose: EucPose, actor: PopulationFootprint) => Math.min(...Object.values(buildRiderOccupancyEnvelope(pose, RIDER_CONTACT))
  .map(part => gap(prismOf(part), actor)));

/** A person facing `facing` radians (their square hull turns with them). */
function facingPerson(id: string, x: number, z: number, facing: number) {
  const part = stationaryPerson(id, x, z, 'walker');
  return { ...part, path: { ...part.path, points: part.path.points.map(point => ({ ...point, headingY: facing })) } };
}

/** Follow a crash to recovery: never held, never inside the actor, and the fall's facts. */
function followFall(label: string, harness: PopulationContactHarness, actor: PopulationFootprint, crashPose: EucPose) {
  let held = 0, ticks = 0, pelvis = Infinity, nearest = Infinity, wheel = Infinity, backward = 0;
  const travelX = Math.sin(crashPose.headingY), travelZ = Math.cos(crashPose.headingY), startAlong = crashPose.ragdoll[0] * travelX + crashPose.ragdoll[2] * travelZ;
  for (; ticks < Math.ceil(6 / DT) && harness.controller.crashed; ticks += 1) {
    const step = harness.step(ride(0)), pose = harness.pose();
    if (!harness.controller.crashed) break;
    if (step.held && step.commit.resolution.refusalReasons['human-0'] !== 'placement') held += 1;
    const gaps = bodyGaps(pose, actor);
    assert.ok(gaps.particle >= -1e-6 && gaps.wheel >= -1e-6, `${label}: the body never enters the actor (tick ${ticks}: ${gaps.particle.toFixed(3)}, ${gaps.wheel.toFixed(3)})`);
    if (ticks * DT <= 1.5) pelvis = Math.min(pelvis, pose.ragdoll[1]);
    if (ticks * DT <= .6) { nearest = Math.min(nearest, gaps.particle); wheel = Math.min(wheel, gaps.wheel); }
    if (ticks * DT <= 1) backward = Math.max(backward, startAlong - (pose.ragdoll[0] * travelX + pose.ragdoll[2] * travelZ));
  }
  assert.equal(held, 0, `${label}: a crashed body is never held`);
  assert.equal(harness.controller.crashed, false, `${label}: it recovers`);
  return { pelvis, nearest, wheel, backward, ticks };
}

// Review r3 (2026-10-04): the first version crashed at 10 m/s along +Z, whose
// rag frame never grew the gain-squared box to 50 m, so it passed on the
// pre-fix tree too. Fast cutouts and landings turned off the axes do: there the
// old box admitted the owner on most steps and held the cutouts as statues
// (30-32 held steps, pelvis 0.9 m). Admission itself is asserted every step.
test('R2C-1: a wipeout far from everybody is exactly the empty-world fall: never admitted, no held step, bit-identical, down by 1.5 s', () => {
  const crashes: [string, number, number][] = [['cutout', 20, Math.PI / 4], ['cutout', 20, Math.PI / 2], ['landing', 16, Math.PI / 2], ['obstacle', 16, 3 * Math.PI / 4]];
  for (const [cause, speed, heading] of crashes) {
    const label = `${cause} at ${speed} m/s, heading ${heading.toFixed(2)}`, distance = 50;
    const start = { position: { x: 0, y: 0, z: 0 }, headingY: heading };
    const harness = new PopulationContactHarness(populationPlanOf([stationaryPerson('social-0', Math.sin(heading) * distance, Math.cos(heading) * distance)]), start);
    const native = new EucController(flatPavement, { spawn: start });
    const pose = () => { const out = createPose(); native.writePose(out); return out; };
    for (let i = 0; i < 240; i += 1) { const actions = holdSpeed(harness.controller.snapshot().speed, 10); harness.step(actions); native.step(DT, actions); }
    assert.deepEqual(harness.pose(), pose(), `${label}: the ride up to the crash is the native ride`);
    for (const value of [harness.controller, native]) (value as unknown as { beginCrash(cause: string, speed: number, side: number): void }).beginCrash(cause, speed, 1);
    const actor = harness.population.snapshot().actors[0].footprint, still = [{ id: 'social-0', previous: actor, current: actor }];
    let held = 0, admitted = 0, pelvis = Infinity;
    for (let tick = 0; tick < 180; tick += 1) {
      const before = harness.pose();
      held += Number(harness.step(ride(0)).held); native.step(DT, ride(0));
      admitted += Number(harness.certificates.owner('human-0', before, harness.pose(), DT, still).admitted);
      assert.deepEqual(harness.pose(), pose(), `${label}: bit-identical to the empty world at tick ${tick}`);
      if (tick * DT <= 1.5) pelvis = Math.min(pelvis, harness.pose().ragdoll[1]);
    }
    assert.equal(admitted, 0, `${label}: an actor ${distance} m away is never within the fall's reach`);
    assert.equal(held, 0, `${label}: no held step`); assert.ok(pelvis < .5, `${label}: down by 1.5 s (${pelvis.toFixed(2)} m)`);
  }
});

test('R2C-3: oblique, side and landing crashes beside a person or a van fall at once, never as a statue', () => {
  const cases: [string, ReturnType<typeof stationaryPerson>, number, 'obstacle' | 'landing'][] = [
    ['person 0.9 m, toward', stationaryPerson('social-0', .9, 10), 1, 'obstacle'],
    ['person 0.9 m, landing', stationaryPerson('social-0', .9, 10), 1, 'landing'],
    ['person 1.2 m, away', stationaryPerson('social-0', 1.2, 10), -1, 'landing'],
    ['van 1.6 m, toward', stationaryCar('car-0', 1.6 + 1.02, 10), 1, 'obstacle']];
  for (const [label, part, side, cause] of cases) {
    const harness = new PopulationContactHarness(populationPlanOf([part]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
    for (let i = 0; i < 900 && harness.controller.snapshot().position.z < 9.8; i += 1) harness.step(holdSpeed(harness.controller.snapshot().speed, 6));
    (harness.controller as unknown as { invulnerableTimer: number }).invulnerableTimer = 0;
    harness.crash(cause as 'obstacle', 6, side);
    const actor = harness.population.snapshot().actors[0].footprint, { pelvis } = followFall(label, harness, actor, harness.pose());
    assert.ok(pelvis < .5, `${label}: the body is down by 1.5 s (pelvis ${pelvis.toFixed(2)} m)`);
  }
});

test('R2C-3: a van met at 45 degrees at 12 m/s is a crash whose body falls beside it', () => {
  const car = stationaryCar('car-0', 0, 0), heading = Math.PI / 4;
  const harness = new PopulationContactHarness(populationPlanOf([car]), { position: { x: -Math.sin(heading) * 34, y: 0, z: -Math.cos(heading) * 34 }, headingY: heading });
  const actor = harness.population.snapshot().actors[0].footprint;
  let crashPose: EucPose | null = null;
  for (let i = 0; i < 900 && !crashPose; i += 1) {
    harness.step(holdSpeed(harness.controller.snapshot().speed, 12));
    if (harness.controller.crashed) crashPose = harness.pose(); else assert.ok(mountedGap(harness.pose(), actor) >= 0);
  }
  assert.ok(crashPose, 'the rider crashes on the van'); assert.equal(harness.controller.snapshot().crashCause, 'obstacle');
  const { pelvis } = followFall('van 45', harness, actor, crashPose);
  assert.ok(pelvis < .5, `down by 1.5 s (${pelvis.toFixed(2)} m)`);
});

test('R2C-4: clipping a person turned 45 degrees off-centre at 9-12 m/s is a crash or a slide, never a dead stop', () => {
  for (const speed of [9, 12]) for (const offset of [.7, .9, 1.1]) {
    const harness = new PopulationContactHarness(populationPlanOf([facingPerson('walker-0', offset, 40, Math.PI / 4)]), { position: { x: 0, y: 0, z: 20 }, headingY: 0 });
    const actor = harness.population.snapshot().actors[0].footprint;
    let stopped = 0, longestStop = 0;
    for (let i = 0; i < 900 && !harness.controller.crashed && harness.controller.snapshot().position.z < 44; i += 1) {
      const now = harness.controller.snapshot();
      harness.step(holdSpeed(now.speed, speed));
      if (!harness.controller.crashed) assert.ok(mountedGap(harness.pose(), actor) >= -SWEEP_RESOLUTION, `${speed} m/s, ${offset} m: the rider never passes into the person`);
      stopped = !harness.controller.crashed && now.position.z > 30 && harness.controller.snapshot().speed < 1 ? stopped + 1 : 0;
      longestStop = Math.max(longestStop, stopped);
    }
    assert.ok(harness.controller.crashed || harness.controller.snapshot().position.z >= 44, `${speed} m/s, ${offset} m: crashed or rode on`);
    assert.ok(longestStop * DT < .1, `${speed} m/s, ${offset} m: no dead stop against the person (${(longestStop * DT).toFixed(2)} s)`);
  }
});

/** A charged hop launched `gap` metres from the car's side face, riding along +X into it. */
function sideHop(speed: number, gapMetres: number) {
  const harness = new PopulationContactHarness(populationPlanOf([stationaryCar('car-0', 0, 0)]), { position: { x: -40, y: 0, z: 0 }, headingY: Math.PI / 2 });
  let charge = 0, launched = false;
  for (let i = 0; i < 4000 && !(launched && !harness.controller.isGrounded) && !harness.controller.crashed; i += 1) {
    const now = harness.controller.snapshot(); let actions = holdSpeed(now.speed, speed);
    if (!launched && now.position.x > -1.02 - gapMetres - speed * (EUC.hopChargeSeconds + .1)) {
      actions = { ...actions, crouch: true }; charge += 1;
      if (charge > Math.ceil((EUC.hopChargeSeconds + .1) / DT)) { actions = { ...actions, hop: true }; launched = true; }
    }
    harness.step(actions);
  }
  return harness;
}

// Review r3 (2026-10-04): the flight met the car's side and stopped dead in
// mid-air (8.8 m/s to 0 in a step), then dropped and landed upright: an
// invisible wall. Flown into it at obstacle speed, a human rider crashes there
// as at a wall, the body reaching the car and falling beside it. (This
// harness's hop always landed on the pre-fix tree too; the real-world hang it
// once guarded is guarded by the synthetic refusals below.)
test('R2C-2: a side hop into a car with the throttle held is the obstacle crash where it meets the car, never a stop in mid-air', () => {
  for (const speed of [6, 9, 10]) for (const gapMetres of [1.5, 2.5, 3.5]) {
    const label = `${speed} m/s from ${gapMetres} m`, harness = sideHop(speed, gapMetres);
    if (harness.controller.crashed) continue;
    const actor = harness.population.snapshot().actors[0].footprint;
    let air = 0, held = 0;
    for (; air < 240 && !harness.controller.isGrounded && !harness.controller.crashed; air += 1) {
      const before = harness.controller.snapshot().speed; held += Number(harness.step(ride(1)).held);
      if (!harness.controller.crashed) assert.ok(harness.controller.snapshot().speed > before - 1, `${label}: no dead stop in the air`);
    }
    assert.equal(harness.controller.crashed, true, `${label}: the obstacle crash, as at a wall`);
    assert.equal(harness.controller.snapshot().crashCause, 'obstacle');
    assert.ok(air * DT < .8 && held <= 3, `${label}: at the meeting (${(air * DT).toFixed(2)} s, ${held} held)`);
    const { nearest, pelvis } = followFall(label, harness, actor, harness.pose());
    assert.ok(nearest < .12, `${label}: the body reaches the car (${nearest.toFixed(2)} m)`);
    assert.ok(pelvis < .5, `${label}: and goes down beside it (${pelvis.toFixed(2)} m)`);
  }
});

/** Contact refusal for every airborne candidate the predicate names: the actor-sized hull it is held by.
 * The wall carries a skin-sized enclosure so it is no rigid, non-worsening overlap
 * (2026-10-04: a static touching pair that never deepens is not arrested). */
function refuseAirborne(harness: PopulationContactHarness, refuse: (previous: EucPose, current: EucPose) => boolean) {
  const certificates = harness.certificates, owner = certificates.owner.bind(certificates), actor = harness.population.snapshot().actors[0].footprint;
  const wall: PopulationCompoundTrajectory = { ownerId: 'human-0', componentId: 'human', stopGroupId: 'physical', intervalEnvelopeMetres: () => 0.001,
    at: () => ({ ...actor, sourceHull: undefined, velocityX: 0, velocityZ: 0 }) };
  certificates.owner = (...args) => {
    const value = owner(...args), [id, previous, current] = args as unknown as [string, EucPose, EucPose];
    return id === 'human-0' && current.y > 0.02 && refuse(previous, current)
      ? { ...value, admitted: true, movingComponents: () => [{ ...wall, ownerId: id }] } : value;
  };
}

test('R2C-2: an airborne rider held only while the throttle swings the body into the car lets go of it and lands', () => {
  const harness = sideHop(9, 2.5);
  assert.equal(harness.controller.isGrounded, false, 'fixture takes off');
  refuseAirborne(harness, (previous, current) => current.riderPitch > previous.riderPitch + 1e-9);
  let air = 0, held = 0;
  for (; air < 240 && !harness.controller.isGrounded && !harness.controller.crashed; air += 1) held += Number(harness.step(ride(1)).held);
  assert.ok(held > 0, 'the fixture really refuses the throttle lean');
  assert.equal(harness.controller.crashed, false, 'no bail needed'); assert.ok(air * DT < .8, `landed in ${(air * DT).toFixed(2)} s`);
});

test('R2C-2: an airborne rider every step of whose fall is refused bails out within the watchdog and the fall completes', () => {
  const harness = sideHop(9, 2.5);
  refuseAirborne(harness, () => true);
  let air = 0;
  for (; air < 240 && !harness.controller.isGrounded && !harness.controller.crashed; air += 1) harness.step(ride(1));
  assert.equal(harness.controller.crashed, true, 'held in the air, the rider comes off');
  assert.ok(air * DT <= POPULATION_CONTACT_WATCHDOG + 4 * DT, `bailed after ${(air * DT).toFixed(2)} s`);
  for (let ticks = 0; ticks < Math.ceil(6 / DT) && harness.controller.crashed; ticks += 1) harness.step(ride(0));
  assert.equal(harness.controller.crashed, false, 'and recovers');
});

// Review r3 (2026-10-04): held high in the air, the bail snapped the wheel
// to the ground in one frame. It falls from where it hung, on the crash
// wheel's pop, with no held fall speed to bounce with.
test('R2C-2: a rider held high in the air bails with the wheel falling from where it hung, never snapped down', () => {
  const harness = sideHop(9, 2.5);
  refuseAirborne(harness, (_previous, current) => current.y > HUNG_METRES);
  const wheelHeight = (pose: EucPose) => pose.y + pose.wheelCrashPop;
  let previous = wheelHeight(harness.pose());
  for (let air = 0; air < 240 && !harness.controller.isGrounded && !harness.controller.crashed; air += 1) { previous = wheelHeight(harness.pose()); harness.step(ride(1)); }
  assert.equal(harness.controller.crashed, true, 'held in the air, the rider comes off');
  assert.ok(previous > HUNG_METRES - 0.15, `the fixture really hangs the wheel (${previous.toFixed(2)} m)`);
  let jump = Math.abs(wheelHeight(harness.pose()) - previous), ticks = 0;
  previous = wheelHeight(harness.pose());
  for (; ticks < Math.ceil(6 / DT) && harness.controller.crashed; ticks += 1) {
    harness.step(ride(0)); const now = wheelHeight(harness.pose()); jump = Math.max(jump, Math.abs(now - previous)); previous = now;
  }
  assert.ok(jump < 0.12, `the riderless wheel never jumps, the bail step included (${jump.toFixed(3)} m in a step)`);
  assert.equal(harness.controller.crashed, false, 'and recovers');
});
const HUNG_METRES = 0.4;

test('VIS-CRASH-1: riding into a person, the body pitches on into them and down beside them, never back the way it came', () => {
  for (const speed of [4.5, 10]) {
    const harness = new PopulationContactHarness(populationPlanOf([stationaryPerson('walker-0', 0, 30, 'walker')]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
    const actor = harness.population.snapshot().actors[0].footprint;
    let crashPose: EucPose | null = null;
    for (let i = 0; i < 1500 && !crashPose; i += 1) { harness.step(ride(harness.controller.snapshot().speed < speed ? 1 : 0.05)); if (harness.controller.crashed) crashPose = harness.pose(); }
    assert.ok(crashPose, `${speed} m/s: the rider crashes on the person`);
    assert.equal(harness.population.snapshot().actors[0].activity, 'impacted', `${speed} m/s: the person reacts`);
    const { nearest, wheel, backward, pelvis } = followFall(`person ${speed} m/s`, harness, actor, crashPose);
    assert.ok(nearest < .12, `${speed} m/s: the body reaches the person (${nearest.toFixed(2)} m)`);
    assert.ok(wheel < .12, `${speed} m/s: the riderless wheel rolls on to the person (${wheel.toFixed(2)} m)`);
    assert.ok(backward < .3, `${speed} m/s: the body is not thrown back the way it came (${backward.toFixed(2)} m)`);
    assert.ok(pelvis < .5, `${speed} m/s: and goes down (${pelvis.toFixed(2)} m)`);
  }
});

/** Two human seats in one population epoch, Game's order, for the whole-step budget across owners. */
class TwoSeats {
  readonly population: PopulationSimulation;
  readonly certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
  readonly riders: EucController[] = [];
  readonly ids = ['human-0', 'human-1'];
  reservations: PopulationReservation[] = [];
  constructor(part: ReturnType<typeof stationaryPerson>, spawns: readonly { x: number; z: number }[]) {
    this.population = new PopulationSimulation(populationPlanOf([part]), flatPavement); this.certificates.warm();
    spawns.forEach((spawn, index) => this.riders.push(new EucController(flatPavement, { spawn: { position: { x: spawn.x, y: 0, z: spawn.z }, headingY: 0 }, dynamicWorld: this.port(index) })));
  }
  pose(index: number): EucPose { const out = createPose(); this.riders[index].writePose(out); return out; }
  private port(index: number): EucDynamicWorld {
    const id = this.ids[index];
    return { hull: POPULATION_OCCUPANT, occupantKind: 'human', ragObstacleBodies: () => this.population.actorFootprints(), resolveMotion: () => null,
      canReact: request => populationPhysicalReactionAllowed({ ownerId: id, request, population: this.population, certificates: this.certificates,
        occupants: this.ids.map((other, i) => ({ id: other, pose: this.riders[i] ? this.pose(i) : request.previous })), reservations: this.reservations }),
      canPlace: () => true, didPlace: () => undefined };
  }
  body(pose: EucPose): PopulationFootprint {
    return { x: pose.x, z: pose.z, headingY: pose.headingY, minY: pose.y, maxY: pose.y + POPULATION_OCCUPANT.heightMetres,
      halfWidthMetres: POPULATION_OCCUPANT.halfWidthMetres, halfLengthMetres: POPULATION_OCCUPANT.halfLengthMetres, velocityX: 0, velocityZ: 0 };
  }
  step(actions: ActionSnapshot[]): { held: boolean[] } {
    const poses = this.riders.map((_, i) => this.pose(i));
    this.population.step(DT, this.ids.map((id, i) => ({ id, kind: 'human' as const, previous: this.body(poses[i]), current: this.body(poses[i]) })), this.reservations);
    const seats = this.riders.map((controller, i) => {
      const token = controller.prepareStep(DT, actions[i]), pose = createPose(); controller.writePreparedPose(token, pose);
      return { id: this.ids[i], kind: 'human' as const, controller, pose, token, world: this.port(i) };
    });
    commitPopulationPhysicalTransaction({ population: this.population, certificates: this.certificates,
      seats: seats.map((seat, i) => ({ ...seat, pose: poses[i] })), preparedSeats: seats,
      before: new Map(this.ids.map((id, i) => [id, { pose: poses[i], serial: this.riders[i].discontinuitySerial }])), dt: DT,
      reservations: this.reservations, contactResponse: 'yield', preferActorYieldOwnerIds: seats.filter(seat => seat.controller.crashed || !seat.controller.isGrounded).map(seat => seat.id),
      bodyFromPose: pose => this.body(pose) });
    return { held: seats.map(seat => seat.token.held) };
  }
}

test('R2C-6: two seats falling beside one seated person stay inside one step budget and are never held', () => {
  const pair = new TwoSeats(stationaryPerson('social-0', 0, 12), [{ x: -1.25, z: 0 }, { x: 1.25, z: 0 }]);
  for (let i = 0; i < 900 && pair.pose(0).z < 11.2; i += 1) pair.step(pair.riders.map(rider => holdSpeed(rider.snapshot().speed, 4)));
  pair.riders.forEach((rider, i) => { (rider as unknown as { invulnerableTimer: number }).invulnerableTimer = 0;
    (rider as unknown as { beginCrash(cause: string, speed: number, side: number): void }).beginCrash('obstacle', 4, i === 0 ? -1 : 1); });
  let fresh = 0;
  const components = pair.certificates.components.bind(pair.certificates);
  pair.certificates.components = (...args) => components(...args).map(part => ({ ...part,
    intervalEnvelopeMetres: (from: number, to: number) => { fresh += 1; return part.intervalEnvelopeMetres(from, to); } }));
  const actor = pair.population.snapshot().actors[0].footprint, lowest = [Infinity, Infinity];
  let worst = 0, held = 0;
  for (let tick = 0; tick < 180; tick += 1) {
    fresh = 0; const step = pair.step([ride(0), ride(0)]); worst = Math.max(worst, fresh);
    held += step.held.filter(Boolean).length;
    pair.ids.forEach((_, i) => { const pose = pair.pose(i), gaps = bodyGaps(pose, actor);
      assert.ok(gaps.particle >= -1e-6 && gaps.wheel >= -1e-6, `seat ${i} never enters the person (tick ${tick})`);
      lowest[i] = Math.min(lowest[i], pose.ragdoll[1]); });
  }
  assert.ok(worst <= STEP_TOTAL_BUDGET, `fresh enclosure evaluations in one step, both seats: ${worst}`);
  assert.equal(held, 0, 'neither falling seat is held');
  assert.ok(lowest.every(value => value < .5), `both bodies are down by 1.5 s (${lowest.map(value => value.toFixed(2))})`);
});

/** Flat pavement with a kerb too tall to ride (a solid edge) wherever x is below `edge`. */
function kerbBeside(edge: number): TerrainSampler {
  return { ...flatPavement, sampleGround(x, z, out) { flatPavement.sampleGround(x, z, out); if (x < edge) out.height = 0.3; return out; } };
}

// Review r3 (2026-10-04): a near-parallel pass beside a person, with a kerb on
// the rider's other side, scrubbed from 6 m/s to a stop in 0.13 s and stayed
// pinned with the throttle held. It rides on, glancing off them, or it crashes.
test('R2C-4: a near-parallel pass beside a person with a kerb on the far side rides on or crashes, never pinned', () => {
  for (const [lateral, speed] of [[.8, 3], [.8, 5], [.9, 5], [.9, 6]] as const) {
    const harness = new PopulationContactHarness(populationPlanOf([stationaryPerson('walker-0', lateral, 30, 'walker')]),
      { position: { x: 0, y: 0, z: 18 }, headingY: 0 }, kerbBeside(-.45));
    const actor = harness.population.snapshot().actors[0].footprint;
    let stopped = 0, longestStop = 0;
    for (let i = 0; i < 1200 && !harness.controller.crashed && harness.controller.snapshot().position.z < 33; i += 1) {
      const now = harness.controller.snapshot();
      harness.step(holdSpeed(now.speed, speed));
      if (!harness.controller.crashed) assert.ok(mountedGap(harness.pose(), actor) >= -SWEEP_RESOLUTION, `${lateral} m, ${speed} m/s: never into the person`);
      stopped = !harness.controller.crashed && now.position.z > 27 && harness.controller.snapshot().speed < .5 ? stopped + 1 : 0;
      longestStop = Math.max(longestStop, stopped);
    }
    assert.ok(harness.controller.crashed || harness.controller.snapshot().position.z >= 33, `${lateral} m, ${speed} m/s: crashed or rode on (z ${harness.controller.snapshot().position.z.toFixed(2)})`);
    assert.ok(longestStop * DT < .5, `${lateral} m, ${speed} m/s: not pinned beside the person (${(longestStop * DT).toFixed(2)} s)`);
  }
});

// Review r3 (2026-10-04): a rider who follows a walker to his shuttle end and
// holds the throttle into him stood ~1.4 m short of him for good, while he
// flinched on a loop and never moved. He steps aside and the rider rides on;
// the pinned meeting charges him once. Round 3 review: that took 2.3-3.3 s
// (the push's 1.2 s pause, then a full 1.5 s wait), and a walker who met the
// rider head-on was never let go at all: his step aside along the rider's face
// counted as walking into him (rounding noise in the face normal), so the
// actor-first yield held it where it stood. Measured as the review's probe
// does, from the rider's stop until it has moved 1 m with the throttle held;
// a walker who steps aside before the rider is stopped lets him by at once.
test('R2C-5: a rider holding the throttle into a walker, from behind at his shuttle end or head-on, is let by within 2 s, and he flinches once', () => {
  for (const [label, initial, direction, approach] of [['shuttle end', 6, 1, 2.5], ['head-on', 8, -1, 2]] as const) {
    const walk = { path: straightPath('shuttle-path', 0, 20, 30), actor: { id: 'walker-0', kind: 'walker' as const, pathId: 'shuttle-path',
      initialDistanceMetres: initial, direction, movement: 'shuttle' as const, speedMetresPerSecond: 1.1, idleSeconds: 0.5, appearanceIndex: 0,
      hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 } } };
    const harness = new PopulationContactHarness(populationPlanOf([walk]), { position: { x: 0, y: 0, z: 18 }, headingY: 0 });
    let met = -1, stop = -1, stopZ = 0, pinned = 0, passed = -1, flinches = 0, wasImpacted = false;
    for (let i = 0; i < Math.ceil(16 / DT) && passed < 0; i += 1) {
      const step = harness.step(met < 0 ? holdSpeed(harness.controller.snapshot().speed, approach) : ride(1));
      const actor = harness.population.snapshot().actors[0], impacted = actor.activity === 'impacted', now = harness.controller.snapshot();
      if (met < 0 && step.held) met = i;
      if (met >= 0 && stop < 0 && Math.abs(now.speed) < .5) { stop = i; stopZ = now.position.z; }
      if (stop >= 0 && Math.abs(now.position.z - stopZ) > 1) { pinned = Math.max(pinned, (i - stop) * DT); stop = -1; }
      if (met >= 0 && now.position.z > actor.footprint.z + 1.5) passed = i;
      flinches += Number(impacted && !wasImpacted); wasImpacted = impacted;
      assert.equal(harness.controller.crashed, false, `${label}: a push at walking pace is no crash`);
      assert.ok(mountedGap(harness.pose(), actor.footprint) >= -SWEEP_RESOLUTION, `${label}: never into the walker (tick ${i})`);
    }
    assert.ok(met > 0, `${label}: the rider meets the walker`);
    assert.ok(passed > 0 && stop < 0, `${label}: the walker lets the rider by`);
    assert.ok(pinned < 2, `${label}: within 2 s of being stopped (${pinned.toFixed(2)} s)`);
    assert.ok(flinches <= 1, `${label}: one meeting, one flinch (${flinches})`);
  }
});

/** Flat ground `height` metres up wherever x is below zero: a raised bay edge, its face a solid as the world's are. */
function ledge(height: number): TerrainSampler {
  return { ...flatPavement, sampleGround(x, z, out) { flatPavement.sampleGround(x, z, out); if (x < 0) out.height = height; return out; },
    raycastObstacle(origin, direction, maximum) {
      if (origin.x < 0 || origin.y >= height || direction.x >= 0) return null;
      const distance = -origin.x / direction.x; return distance <= maximum ? distance : null;
    } };
}

// Review r3 (2026-10-04): a rider who rode off a bay edge over a worker was
// held above him and bailed there; the riderless wheel then fell 2 m straight
// through the edge of his hull, and the body lay on top of him for half a
// second. The wheel drops beside him, the body slides off his head and
// shoulders, and nothing enters him.
test('R2C-2: a rider dropping off a raised edge onto a person below comes down beside them, wheel and body never through them', () => {
  for (const [speed, personX] of [[1.5, 1], [2.5, 1.5], [3.5, 2]] as const) {
    const label = `${speed} m/s, person ${personX} m out`;
    const harness = new PopulationContactHarness(populationPlanOf([stationaryPerson('worker-0', personX, 0, 'worker')]),
      { position: { x: -12, y: 3, z: 0 }, headingY: Math.PI / 2 }, ledge(3));
    const actor = harness.population.snapshot().actors[0].footprint;
    let off = -1, crashed = -1, slidOff = -1;
    for (let i = 0; i < Math.ceil(12 / DT) && !(crashed >= 0 && !harness.controller.crashed); i += 1) {
      harness.step(harness.controller.crashed ? ride(0) : holdSpeed(harness.controller.snapshot().speed, speed));
      const pose = harness.pose();
      if (off < 0 && pose.x > 0) off = i;
      if (crashed < 0 && harness.controller.crashed) crashed = i;
      if (crashed >= 0 && harness.controller.crashed) {
        const { particle, wheel } = bodyGaps(pose, actor), popped = gap({ ...prismOf(buildRiderOccupancyEnvelope(pose, RIDER_CONTACT).wheel),
          minY: pose.y + pose.wheelCrashPop, maxY: pose.y + pose.wheelCrashPop + 0.5 }, actor);
        assert.ok(particle >= -1e-6 && wheel >= -1e-6 && popped >= -1e-6, `${label}: nothing enters the person (tick ${i}: ${particle.toFixed(3)}, ${wheel.toFixed(3)}, ${popped.toFixed(3)})`);
        if (slidOff < 0 && pose.ragdoll[1] < actor.maxY - 0.2) slidOff = i;
      }
    }
    assert.ok(off >= 0 && crashed > off, `${label}: rides off the edge and comes off over the person`);
    assert.ok((crashed - off) * DT < 0.8, `${label}: within the airborne watchdog of the fall (${((crashed - off) * DT).toFixed(2)} s)`);
    // From the bail height: the fall, any slide off their shoulders, and down.
    assert.ok(slidOff > 0 && (slidOff - crashed) * DT < 1.2, `${label}: the body slides off them, never lies on them (${((slidOff - crashed) * DT).toFixed(2)} s)`);
    assert.equal(harness.controller.crashed, false, `${label}: and recovers`);
  }
});

// Browser m7 long ride (2026-10-04): after a rider met an NPC wheel rider, the
// rider wait turned the NPC round with him inside its turning circle; its
// square swept into him, it froze mid-turn, and throttle, neutral and reverse
// were all refused until he steered. A wider actor now waits instead.
test('a rider stopped against an NPC wheel can always back away from it', () => {
  for (const [label, initial, direction] of [['head-on', 8, -1], ['from behind', 4, 1]] as const) {
    const lane = { path: straightPath('ride-path', 0, 20, 30), actor: { id: 'npc-0', kind: 'fictionalEuc' as const, pathId: 'ride-path',
      initialDistanceMetres: initial, direction, movement: 'shuttle' as const, speedMetresPerSecond: direction === 1 ? 0.6 : 3.8,
      idleSeconds: 0.5, appearanceIndex: 0, hull: { halfWidthMetres: 0.65, halfLengthMetres: 0.65, heightMetres: 2.1 } } };
    const harness = new PopulationContactHarness(populationPlanOf([lane]), { position: { x: 0, y: 0, z: 18 }, headingY: 0 });
    let met = -1;
    for (let i = 0; i < Math.ceil(5 / DT) && met < 0; i += 1) {
      if (harness.step(holdSpeed(harness.controller.snapshot().speed, 2)).held) met = i;
    }
    assert.ok(met >= 0, `${label}: the rider meets the NPC`);
    // Pressed against it well past every wait, then straight back. It never
    // starts turning round while he is close enough for its corners to reach.
    for (let i = 0; i < Math.ceil(4 / DT); i += 1) {
      harness.step(harness.controller.crashed ? ride(0) : ride(1));
      const actor = harness.population.snapshot().actors[0];
      if (mountedGap(harness.pose(), actor.footprint) < 0.3) {
        assert.notEqual(actor.activity, 'turning', `${label}: turned round against the rider (tick ${i})`);
      }
    }
    for (let i = 0; i < Math.ceil(4 / DT) && harness.controller.crashed; i += 1) harness.step(ride(0));
    // 1.5 s: a rider still rolling after a slow NPC brakes before he reverses.
    const from = harness.controller.snapshot().position.z;
    for (let i = 0; i < Math.ceil(1.5 / DT); i += 1) {
      harness.step(ride(-1));
      const actor = harness.population.snapshot().actors[0];
      assert.ok(mountedGap(harness.pose(), actor.footprint) >= -SWEEP_RESOLUTION, `${label}: never into the NPC (tick ${i})`);
    }
    const backed = from - harness.controller.snapshot().position.z;
    assert.ok(backed > 0.5, `${label}: reverse backs away within 1.5 s (${backed.toFixed(2)} m)`);
  }
});
