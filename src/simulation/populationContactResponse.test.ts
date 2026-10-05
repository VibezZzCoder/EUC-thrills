/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Crash lockups, frozen recoveries and the invisible-wall contact response
 * (CP-1..CP-4, POP-3, POP-4; 2026-10-03). Every case runs the real controller,
 * population, certificates and whole-step transaction in Game's order through
 * the headless composition double, against the generated world's own person
 * and parked-car hulls. A crashed body must actually fall (its pelvis drops),
 * not be held whole, wherever BASE2's unbounded proof let it fall.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, POPULATION, RIDER_CONTACT } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import type { PopulationFootprint } from './population.ts';
import type { ActorSpec, PopulationPath } from '../level/populationPlan.ts';
import { HARNESS_DT as DT, PopulationContactHarness, populationPlanOf, stationaryCar, stationaryPerson } from './populationContactHarness.test-support.ts';
/** The rag particle radii (ragdoll.ts `RADIUS`), restated so this file also loads on the pre-fix tree. */
const RAGDOLL_RADII = [0.14, 0.14, 0.12, 0.10, 0.10, 0.10, 0.10, 0.05, 0.05, 0.07, 0.07];

const ride = (throttle: number, steer = 0): ActionSnapshot => ({ ...NEUTRAL_ACTIONS, throttle, steer });
/** Fresh compiled enclosure evaluations per fixed step, every caller included
 * (48 for the whole-step proof, the rest late reactions). 57 is the worst
 * measured; the unbounded BASE2 search spent 130-4,400 in single steps. */
const STEP_EVALUATION_CEILING = 64;
/** POPULATION_CONTACT.holdWatchdogSeconds, restated so this file also loads on
 * the pre-fix tree for its negative control. */
const POPULATION_CONTACT_WATCHDOG = 0.25;
type Part = { path: PopulationPath; actor: ActorSpec };

/** Signed separation of the rider's actual wheel and human parts from one actor prism. */
function clearance(harness: PopulationContactHarness, actor: PopulationFootprint): number {
  const axes = (heading: number) => [{ x: Math.cos(heading), z: -Math.sin(heading) }, { x: Math.sin(heading), z: Math.cos(heading) }];
  const support = (body: PopulationFootprint, axis: { x: number; z: number }) => { const [x, z] = axes(body.headingY);
    return Math.abs(x.x * axis.x + x.z * axis.z) * body.halfWidthMetres + Math.abs(z.x * axis.x + z.z * axis.z) * body.halfLengthMetres; };
  return Math.min(...Object.values(buildRiderOccupancyEnvelope(harness.pose(), RIDER_CONTACT)).map(part => {
    const body: PopulationFootprint = { x: part.x, z: part.z, headingY: part.headingY, halfWidthMetres: part.halfWidth,
      halfLengthMetres: part.halfLength, minY: part.baseY, maxY: part.topY, velocityX: 0, velocityZ: 0 };
    const vertical = Math.max(body.minY - actor.maxY, actor.minY - body.maxY);
    return Math.max(vertical, ...[...axes(body.headingY), ...axes(actor.headingY)].map(axis =>
      Math.abs((actor.x - body.x) * axis.x + (actor.z - body.z) * axis.z) - support(body, axis) - support(actor, axis)));
  }));
}

/** SAT gap between two upright prisms (vertical separation counts). */
function prismGap(body: PopulationFootprint, actor: PopulationFootprint): number {
  const axes = (heading: number) => [{ x: Math.cos(heading), z: -Math.sin(heading) }, { x: Math.sin(heading), z: Math.cos(heading) }];
  const support = (value: PopulationFootprint, axis: { x: number; z: number }) => { const [x, z] = axes(value.headingY);
    return Math.abs(x.x * axis.x + x.z * axis.z) * value.halfWidthMetres + Math.abs(z.x * axis.x + z.z * axis.z) * value.halfLengthMetres; };
  const vertical = Math.max(body.minY - actor.maxY, actor.minY - body.maxY);
  return Math.max(vertical, ...[...axes(body.headingY), ...axes(actor.headingY)].map(axis =>
    Math.abs((actor.x - body.x) * axis.x + (actor.z - body.z) * axis.z) - support(body, axis) - support(actor, axis)));
}

/**
 * A crashed body's physical clearance (2026-10-04): every rag particle, as the
 * box of its radius in the actor's frame, and the riderless wheel. The garment
 * envelope around a tumbling rag may brush a person; the body may not enter one.
 */
function bodyClearance(harness: PopulationContactHarness, actor: PopulationFootprint): number {
  const pose = harness.pose(), wheel = buildRiderOccupancyEnvelope(pose, RIDER_CONTACT).wheel;
  let gap = prismGap({ x: wheel.x, z: wheel.z, headingY: wheel.headingY, halfWidthMetres: wheel.halfWidth,
    halfLengthMetres: wheel.halfLength, minY: wheel.baseY, maxY: wheel.topY, velocityX: 0, velocityZ: 0 }, actor);
  if (pose.ragdollBlend > 0) RAGDOLL_RADII.forEach((radius, index) => { gap = Math.min(gap, prismGap({ x: pose.ragdoll[index * 3],
    z: pose.ragdoll[index * 3 + 2], headingY: actor.headingY, halfWidthMetres: radius, halfLengthMetres: radius,
    minY: pose.ragdoll[index * 3 + 1] - radius, maxY: pose.ragdoll[index * 3 + 1] + radius, velocityX: 0, velocityZ: 0 }, actor)); });
  return gap;
}

/** A mounted rider never passes into an actor; below the sweep resolution it may brush one. */
const MOUNTED_TOLERANCE = -POPULATION.sweepResolutionMetres;

/** Count fresh compiled enclosure evaluations per fixed step (the CP-1 cost unit). */
function countEnvelopes(harness: PopulationContactHarness): { take(): number } {
  const certificates = harness.certificates, components = certificates.components.bind(certificates);
  let count = 0;
  certificates.components = (...args) => components(...args).map(part => ({ ...part,
    intervalEnvelopeMetres: (from: number, to: number) => { count += 1; return part.intervalEnvelopeMetres(from, to); } }));
  return { take: () => { const value = count; count = 0; return value; } };
}

/** Ride along +Z past an actor, then fall `side` (+1 toward +X) where `crashZ` is reached. */
function crashBeside(part: Part, side: number, crashZ = 9.8) {
  const harness = new PopulationContactHarness(populationPlanOf([part]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
  for (let i = 0; i < 900 && harness.controller.snapshot().position.z < crashZ; i += 1) {
    harness.step(ride(harness.controller.snapshot().speed < 3.6 ? 1 : 0.1));
  }
  assert.equal(harness.controller.crashed, false, 'the legal pass beside the actor is not itself a contact');
  (harness.controller as unknown as { invulnerableTimer: number }).invulnerableTimer = 0;
  harness.crash('obstacle', Math.max(2, harness.controller.snapshot().speed), side);
  return { harness, actor: harness.population.snapshot().actors[0].footprint };
}

/**
 * Step a crashed rider to recovery: every step inside the evaluation ceiling,
 * never inside the actor, the reported crash clock advancing every quarter
 * second. Returns the pelvis low point reached within 1.5 s of the crash.
 */
function followCrash(label: string, harness: PopulationContactHarness, actor: PopulationFootprint) {
  const envelopes = countEnvelopes(harness), pelvisStart = harness.pose().ragdoll[1];
  let worst = 0, slowest = 0, ticks = 0, lastClock = 0, frozenWindows = 0, pelvis = pelvisStart, held = 0;
  for (; ticks < Math.ceil(6 / DT) && harness.controller.crashed; ticks += 1) {
    const step = harness.step(ride(0)), spent = envelopes.take();
    worst = Math.max(worst, spent); slowest = Math.max(slowest, step.milliseconds);
    assert.ok(spent <= STEP_EVALUATION_CEILING, `${label}: step ${ticks} spent ${spent} compiled enclosure evaluations`);
    // A loose wall-clock tripwire for a shared machine; the old steps took 0.5-12 s.
    assert.ok(step.milliseconds < 400, `${label}: step ${ticks} took ${step.milliseconds.toFixed(1)} ms`);
    // 2026-10-04: the falling body's particles and wheel, not its garment envelope.
    if (harness.controller.crashed) assert.ok(bodyClearance(harness, actor) >= -1e-6, `${label}: the falling body never enters the actor (step ${ticks})`);
    else assert.ok(clearance(harness, actor) >= MOUNTED_TOLERANCE, `${label}: the recovered rider is clear of the actor (step ${ticks})`);
    if (harness.controller.crashed) held += Number(step.held && step.commit.resolution.refusalReasons['human-0'] !== 'placement');
    if (harness.controller.crashed && ticks * DT <= 1.5) pelvis = Math.min(pelvis, harness.pose().ragdoll[1]);
    // Before the recovery deadline; after it a refused recovery waits for its fallback.
    if (ticks % 30 === 29) { const clock = harness.crashTime();
      if (harness.controller.crashed && lastClock < EUC.crashRecoverAutoSeconds - DT && clock <= lastClock) frozenWindows += 1; lastClock = clock; }
  }
  console.log(JSON.stringify({ label, ticks, worstEvaluations: worst, slowestMs: +slowest.toFixed(1), pelvisStart: +pelvisStart.toFixed(2), pelvisBy1_5s: +pelvis.toFixed(2) }));
  assert.equal(frozenWindows, 0, `${label}: the crash clock advances in every quarter second until recovery`);
  assert.equal(held, 0, `${label}: a crashed body is never held by a contact (R2C-1/R2C-3)`);
  assert.equal(harness.controller.crashed, false, `${label}: automatic recovery fires`);
  assert.ok(ticks * DT < EUC.crashRecoverAutoSeconds + 1, `${label}: recovered after ${(ticks * DT).toFixed(2)} s`);
  return { pelvis, ticks };
}

test('CP-1: a crash 1.3 m beside a seated person stays inside the per-step budget, falls and recovers', () => {
  for (const side of [1, -1]) {
    const { harness, actor } = crashBeside(stationaryPerson('social-0', 1.3, 10), side);
    // BASE2 needed 1,000-4,400 evaluations in single steps here and never recovered.
    const { pelvis } = followCrash(`person 1.3 m, side ${side}`, harness, actor);
    assert.ok(pelvis < .5, `the body actually falls, not a held statue (pelvis ${pelvis.toFixed(2)} m by 1.5 s)`);
  }
});

test('CP-1: crashes 1.6-2.5 m from a person or 2.3 m from a car fall as freely as before, inside the budget', () => {
  // BASE2 fell here too, but with 72-264 evaluations (up to ~65 ms) in a step.
  for (const [label, part] of [['person 1.6 m', stationaryPerson('social-0', 1.6, 10)], ['person 2.0 m', stationaryPerson('social-0', 2, 10)],
    ['person 2.5 m', stationaryPerson('social-0', 2.5, 10)], ['car 2.3 m', stationaryCar('car-0', 2.3, 10)]] as const) {
    const { harness, actor } = crashBeside(part, 1);
    const { pelvis, ticks } = followCrash(label, harness, actor);
    assert.ok(pelvis < .2, `${label}: a natural fall (pelvis ${pelvis.toFixed(2)} m by 1.5 s)`);
    assert.ok(ticks * DT < EUC.crashRecoverAutoSeconds + 3 * DT, `${label}: recovered on time (${(ticks * DT).toFixed(2)} s)`);
  }
});

// 2026-10-04 (CR-1): this used to pin the held statue a conditioning verdict
// produced. A crashed body is never held now, whatever its certificate says.
test('CP-2/CR-1: an uncertifiable rag frame (a forced conditioning verdict) cannot hold a crashed body', () => {
  const { harness, actor } = crashBeside(stationaryPerson('social-0', 1.6, 10), 1);
  // Force the certificate's conditioning verdict for every changing rag
  // trajectory near the person, as the real seated pair did on seed euc.
  const owner = harness.certificates.owner.bind(harness.certificates);
  harness.certificates.owner = (...args) => {
    const value = owner(...args), [, previous, current] = args;
    const changing = JSON.stringify({ ...previous, ragdoll: Array.from(previous.ragdoll) }) !== JSON.stringify({ ...current, ragdoll: Array.from(current.ragdoll) });
    return value.admitted && changing && (previous.ragdollBlend > 0 || current.ragdollBlend > 0) ? { ...value, requiresConditioningHold: true } : value;
  };
  const { pelvis, ticks } = followCrash('forced conditioning', harness, actor);
  assert.ok(pelvis < .5, `the body falls (pelvis ${pelvis.toFixed(2)} m by 1.5 s)`);
  assert.ok(ticks * DT < EUC.crashRecoverAutoSeconds + 3 * DT, `recovered on time (${(ticks * DT).toFixed(2)} s)`);
});

test('CP-3: a seated person beside the last safe point no longer blocks automatic recovery', () => {
  for (const lateral of [1.2, 1.45]) {
    // Pass the person, then fall away from them: the newest safe point is
    // right beside them, inside the 0.35 m recovery margin.
    const { harness, actor } = crashBeside(stationaryPerson('social-0', lateral, 10), -1, 10.4);
    const safe = harness.controller.snapshot().safePosition;
    assert.ok(Math.hypot(safe.x - actor.x, safe.z - actor.z) < 1.6, 'fixture: the newest safe point sits beside the person');
    let ticks = 0;
    for (; ticks < Math.ceil(6 / DT) && harness.controller.crashed; ticks += 1) harness.step(ride(0));
    assert.equal(harness.controller.crashed, false, `recovery beside a person ${lateral} m off the line`);
    assert.ok(ticks * DT < 5, `recovered within 5 s (${(ticks * DT).toFixed(2)} s)`);
    assert.ok(clearance(harness, actor) > POPULATION.recoveryMarginMetres - 1e-9, 'the fallback still honours the recovery margin');
    assert.ok(harness.reservations.some(value => value.id === 'human-0/human'), 'the placement was published once, as any recovery');
  }
});

test('POP-3: riding into a person or a car at 12 m/s is the native obstacle crash, heard, the actor reacts, and the body falls', () => {
  for (const [label, part] of [['walker', stationaryPerson('walker-0', 0, 40, 'walker')], ['car', stationaryCar('car-0', 0, 44)]] as const) {
    const harness = new PopulationContactHarness(populationPlanOf([part]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
    const actor = harness.population.snapshot().actors[0].footprint;
    let crashTick = -1, impact = 0, charged = false, ticks = 0;
    for (; ticks < 900 && crashTick < 0; ticks += 1) {
      const speed = harness.controller.snapshot().speed;
      const step = harness.step(ride(speed < 11.7 ? 1 : speed > 12.3 ? -0.3 : 0.05));
      assert.ok(clearance(harness, actor) >= 0);
      if (harness.controller.crashed) { crashTick = ticks; impact = step.impact; charged = harness.contacts.some(value => value.charge && value.actorId === part.actor.id); }
    }
    assert.ok(crashTick > 0, `${label}: the rider crashes on contact`);
    assert.equal(harness.controller.snapshot().crashCause, 'obstacle');
    assert.ok(impact >= EUC.obstacleCrashSpeed, `${label}: the existing impact cue reads the contact (${impact.toFixed(2)} m/s)`);
    assert.equal(charged, true, `${label}: the population publishes the charged contact`);
    assert.equal(harness.population.snapshot().actors[0].activity, 'impacted', `${label}: the actor plays the existing impact pause`);
    // Not a statue against the actor: the rag rebounds off them and goes down.
    const { pelvis } = followCrash(`${label} at 12 m/s`, harness, actor);
    assert.ok(pelvis < .5, `${label}: the body actually falls (pelvis ${pelvis.toFixed(2)} m by 1.5 s)`);
  }
});

test('POP-3: a slow nudge scrubs speed over several steps like a wall and never crashes', () => {
  const walker = stationaryPerson('walker-0', 0, 6, 'walker');
  const harness = new PopulationContactHarness(populationPlanOf([walker]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
  const actor = harness.population.snapshot().actors[0].footprint, speeds: number[] = [];
  let firstHeld = -1;
  for (let i = 0; i < 600 && (firstHeld < 0 || i < firstHeld + 30); i += 1) {
    // Up to 2 m/s, then coast once the person is met: the scrub alone acts.
    const before = harness.controller.snapshot().speed, step = harness.step(ride(firstHeld < 0 && before < 2 ? 0.8 : 0));
    if (step.held && firstHeld < 0) firstHeld = i;
    if (firstHeld >= 0 && speeds.length < 12) speeds.push(harness.controller.snapshot().speed);
    assert.ok(clearance(harness, actor) >= 0); assert.equal(harness.controller.crashed, false);
  }
  assert.ok(firstHeld > 0, 'the nudge reaches the person');
  assert.ok(speeds[0] > 1, `the first held step is a scrub, not a dead stop (${speeds[0].toFixed(2)} m/s left)`);
  assert.ok(speeds.slice(1).every((value, index) => value <= speeds[index] + 1e-9), 'and speed only falls while held');
  assert.equal(harness.controller.snapshot().speed <= 0.5, true);
});

test('POP-3: a cop keeps the zero-speed yield, so chase pace is unchanged', () => {
  const walker = stationaryPerson('walker-0', 0, 40, 'walker');
  const harness = new PopulationContactHarness(populationPlanOf([walker]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, undefined, 'cop');
  let held = -1;
  for (let i = 0; i < 900 && held < 0; i += 1) {
    const speed = harness.controller.snapshot().speed;
    if (harness.step(ride(speed < 11.7 ? 1 : speed > 12.3 ? -0.3 : 0.05)).held) held = i;
  }
  assert.ok(held > 0); assert.equal(harness.controller.crashed, false); assert.equal(harness.controller.snapshot().speed, 0);
  assert.deepEqual(harness.contacts, [], 'a cop meeting publishes nothing new');
});

test('POP-4: pinned against a person or car with throttle and full steer, the rider turns away within 0.5 s', () => {
  for (const part of [stationaryPerson('walker-0', 0, 4, 'walker'), stationaryCar('car-0', 0, 6)]) {
    const harness = new PopulationContactHarness(populationPlanOf([part]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
    const actor = harness.population.snapshot().actors[0].footprint;
    let pinned = false;
    for (let i = 0; i < 1200 && !pinned; i += 1) pinned = harness.step(ride(harness.controller.snapshot().speed < 1.2 ? 0.6 : 0)).held;
    for (let i = 0; i < 60; i += 1) harness.step(ride(0.3));
    assert.ok(pinned && harness.step(ride(1)).held, 'fixture: pinned nose to nose');
    const heading = harness.controller.snapshot().headingY;
    let turned = -1;
    for (let i = 0; i < Math.round(.5 / DT) && turned < 0; i += 1) {
      harness.step(ride(1, 1)); assert.ok(clearance(harness, actor) >= 0);
      if (Math.abs(harness.controller.snapshot().headingY - heading) > .05) turned = i;
    }
    assert.ok(turned >= 0, `${part.actor.id}: heading changes while throttle and steer are held`);
    assert.equal(harness.controller.crashed, false);
  }
});

test('CP-1 guard: a legal pass 1 cm clear of a seated person rides through at speed, never pinned by the work bound', () => {
  // 1.10 m between centres leaves ~1 cm; proving it costs more than one step's
  // budget, so the identical retry finishes the kept proof a few steps later.
  for (const speed of [10, 15]) {
    const harness = new PopulationContactHarness(populationPlanOf([stationaryPerson('social-0', 1.1, 40)]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
    const actor = harness.population.snapshot().actors[0].footprint;
    let held = 0;
    for (let i = 0; i < 4000 && harness.controller.snapshot().position.z < 46; i += 1) {
      const now = harness.controller.snapshot().speed;
      held += Number(harness.step(ride(now < speed - .3 ? 1 : now > speed + .3 ? -0.3 : 0.05)).held);
      assert.ok(clearance(harness, actor) >= 0); assert.equal(harness.controller.crashed, false);
      assert.ok(held * DT <= POPULATION_CONTACT_WATCHDOG, `${speed} m/s: held ${held} steps, longer than the watchdog`);
      // 2026-10-04 (R2C-6): within the sweep resolution the pass is decided in
      // its own step, so it no longer alternates held and advanced steps.
      assert.ok(held <= 2, `${speed} m/s: the pass is not played in hold/advance slow motion (${held} held steps)`);
    }
    assert.ok(harness.controller.snapshot().position.z >= 46, `${speed} m/s: the pass completes`);
    assert.ok(harness.controller.snapshot().speed > speed - .6, `${speed} m/s: no scrub (${harness.controller.snapshot().speed.toFixed(2)} m/s)`);
  }
});

// 2026-10-04 (review r3): flown into a person or car at obstacle speed, a
// human rider now crashes there as at a wall, instead of stopping dead in
// mid-air and landing upright. The guard is unchanged: never hung in the air,
// never into the actor (the crashed body by its particles and wheel).
test('CP-1 guard: a charged hop head-on at a person or a car lands like a hop or crashes on them, not hung in the air', () => {
  for (const [label, part] of [['person', stationaryPerson('p-0', 0, 42)], ['car', stationaryCar('car-0', 0, 44)]] as const) for (const speed of [6, 10]) {
    const harness = new PopulationContactHarness(populationPlanOf([part]), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
    const actor = harness.population.snapshot().actors[0].footprint, front = actor.z - actor.halfLengthMetres;
    let charge = 0, launched = false;
    for (let i = 0; i < 3000 && !(launched && !harness.controller.isGrounded); i += 1) {
      const now = harness.controller.snapshot();
      let actions: ActionSnapshot = ride(now.speed < speed - .3 ? 1 : now.speed > speed + .3 ? -0.3 : 0.05);
      if (now.position.z > front - 2.5 - speed * (EUC.hopChargeSeconds + .1)) {
        actions = { ...actions, crouch: true }; charge += 1;
        if (charge > Math.ceil((EUC.hopChargeSeconds + .1) / DT)) { actions = { ...actions, hop: true }; launched = true; }
      }
      harness.step(actions);
    }
    assert.ok(launched && !harness.controller.isGrounded, `${label} ${speed} m/s: fixture takes off`);
    // Throttle held in the air: the case that hung at 0.5 m on a budget refusal.
    let air = 0;
    for (; air < 240 && !harness.controller.isGrounded && !harness.controller.crashed; air += 1) {
      harness.step(ride(0.3));
      assert.ok(harness.controller.crashed ? bodyClearance(harness, actor) >= -1e-6 : clearance(harness, actor) >= 0);
    }
    assert.ok(harness.controller.isGrounded || harness.controller.snapshot().crashCause === 'obstacle', `${label} ${speed} m/s: lands or crashes (still airborne after ${air} steps)`);
    assert.ok(air * DT < .8, `${label} ${speed} m/s: a normal 0.7 s hop, not a hang (${(air * DT).toFixed(2)} s)`);
    for (let ticks = 0; ticks < Math.ceil(6 / DT) && harness.controller.crashed; ticks += 1) { harness.step(ride(0)); assert.ok(bodyClearance(harness, actor) >= -1e-6); }
    assert.equal(harness.controller.crashed, false, `${label} ${speed} m/s: up again`);
  }
});
