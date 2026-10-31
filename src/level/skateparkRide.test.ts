/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CONTACT, SIMULATION, SKATE_TRANSITION, TERRAIN, WHEEL } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { EucController, type EucTuning } from '../simulation/EucController.ts';
import { ContactPair, ContactRoom, type ContactRider } from '../simulation/contact.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import type { GroundSample, TerrainSampler } from '../simulation/world.ts';
import { TrickObserver, createTrickFacts, type TrickEventKind } from '../simulation/trickEvents.ts';
import { createSkateparkLevel } from './skateparkLevel.ts';

/**
 * Foundry Yard ridden with the controller's transition rules — 1.4.0
 * (`docs/PLANS.md` §51.5.9 C2–C5, §51.5.10's gates). Headless, on the real
 * `foundry-yard-r1` plan, with a hands-off rider unless a line says
 * otherwise. The wider sweeps behind these pins (2,772 come-back runs, the
 * stall, recovery, drop-in and kerb sweeps) are the controller stage's
 * scratch probes; these are the cases that would catch a regression.
 */

const STEP = 1 / SIMULATION.hz;
const DEG = Math.PI / 180;
const plan = createSkateparkLevel();
const sampler = new PlanTerrainSampler(plan);
const COPING_X = 162.5;
const QP_DECK = 1.49;
/** The bench's two wheels: the shipped table, and the cutout-off diagnostic. */
const WHEELS: readonly Partial<EucTuning>[] = [{}, { cutoutEnabled: 0 }];

function actions(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

function rider(x: number, z: number, headingDeg: number, speed: number, tuning: Partial<EucTuning> = {},
  terrain: TerrainSampler = sampler): EucController {
  const controller = new EucController(terrain, { tuning, spawn: { position: { x, y: 0, z }, headingY: headingDeg * DEG } });
  assert.ok(controller.reset(undefined, speed));
  return controller;
}

interface Touchdown { x: number; y: number; z: number; quality: string; speed: number; comeBack: boolean }

/** Ride `steps`, recording every touchdown (and whether it ended a come-back air) and the first crash. */
function ride(controller: EucController, steps: number, input: (step: number) => ActionSnapshot = () => actions()) {
  const touchdowns: Touchdown[] = [];
  let crash: string | null = null;
  let airborneBeyond = -Infinity;
  for (let step = 0; step < steps; step += 1) {
    const wasComeBack = controller.inComeBackAir;
    controller.step(STEP, input(step));
    const s = controller.snapshot();
    if (!s.grounded && !s.crashed) airborneBeyond = Math.max(airborneBeyond, s.position.x);
    if (controller.touchedDown) {
      touchdowns.push({ x: s.position.x, y: s.position.y, z: s.position.z, quality: s.landingQuality, speed: s.speed, comeBack: wasComeBack });
    }
    if (s.crashed && crash === null) crash = `${s.crashCause} at (${s.position.x.toFixed(2)}, ${s.position.z.toFixed(2)})`;
  }
  return { touchdowns, crash, airborneBeyond };
}

test('G-C: the east wall comes back in at 9, 15 and 25 m/s, square and oblique — on the face, clean or heavy, never over the deck', () => {
  for (const tuning of WHEELS) for (const speed of [9, 15, 25]) for (const approach of [0, 30, -60]) {
    const heading = 90 + approach;
    const back = 4.5 / Math.cos(approach * DEG);
    const subject = rider(160.27 - back * Math.sin(heading * DEG), 124 - back * Math.cos(heading * DEG), heading, speed, tuning);
    const result = ride(subject, 480);
    const label = `${speed} m/s at ${approach}°`;
    assert.equal(subject.comeBackAirCount, 1, label);
    assert.equal(result.crash, null, label);
    const air = result.touchdowns.find((t) => t.comeBack);
    assert.ok(air, label);
    assert.ok(air.quality === 'clean' || air.quality === 'heavy', `${label}: ${air.quality}`);
    assert.ok(air.x < COPING_X && air.y < QP_DECK - 0.1, `${label}: touched down on the face at (${air.x}, ${air.y})`);
    assert.ok(result.airborneBeyond < COPING_X + 0.3, `${label}: flew ${result.airborneBeyond}`);
    assert.ok(air.speed > 2, `${label}: rolls back out at ${air.speed}`);
  }
});

test('G-C: the mini, a rounded bowl corner and the berm\'s outer wall come back in too', () => {
  const lines = [
    // The mini's west coping is x 92.0 since G-M widened it to 11.5 m.
    { name: 'mini W', x: 98, z: 105.5, heading: -90, speed: 7, lipBeyond: (x: number, _z: number) => 92 - x },
    { name: 'bowl SW corner, 30° off radial', x: 101.6, z: 159.6, heading: -15, speed: 9,
      lipBeyond: (x: number, z: number) => Math.hypot(x - 100, z - 160.5) - 3.5 },
    { name: 'berm outer wall', x: 142 + 5 * Math.SQRT1_2, z: 152.25 + 5 * Math.SQRT1_2, heading: 45, speed: 9,
      lipBeyond: (x: number, z: number) => Math.hypot(x - 142, z - 152.25) - 9.25 },
  ];
  for (const line of lines) {
    const subject = rider(line.x, line.z, line.heading, line.speed);
    const result = ride(subject, 300);
    assert.equal(result.crash, null, line.name);
    assert.ok(subject.comeBackAirCount >= 1, line.name);
    const air = result.touchdowns.find((t) => t.comeBack);
    assert.ok(air && (air.quality === 'clean' || air.quality === 'heavy'), `${line.name}: ${air?.quality}`);
    assert.ok(line.lipBeyond(air.x, air.z) < 0.25, `${line.name}: touched down ${line.lipBeyond(air.x, air.z).toFixed(2)} m past the lip`);
  }
});

test('G-C: full throttle from the solo start meets the east wall at 19–22 m/s and comes back in', () => {
  // Over the opener (the start lane, z 124: K2's flight lands before the
  // wall and costs some speed) and beside it (z 119, a clear 62 m straight).
  for (const [z, least] of [[124, 18], [119, 21]] as const) {
    const subject = rider(98, z, 90, 0);
    let footSpeed = 0;
    const result = ride(subject, 900, () => {
      const s = subject.snapshot();
      if (footSpeed === 0 && s.position.x >= 160.27) footSpeed = s.speed;
      return actions({ throttle: subject.comeBackAirCount === 0 ? 1 : 0 });
    });
    assert.ok(footSpeed > least, `z ${z}: foot speed ${footSpeed}`);
    assert.equal(result.crash, null);
    assert.equal(subject.comeBackAirCount, 1);
    const air = result.touchdowns.find((t) => t.comeBack);
    assert.ok(air && air.quality === 'clean' && air.x < COPING_X, `z ${z}: ${air?.quality} at ${air?.x}`);
  }
});

test('a hop at the foot of the east wall comes back in rather than over the fence (12 and 20 m/s)', () => {
  for (const speed of [12, 20]) for (const hopAt of [160.3, 160.8]) {
    const subject = rider(150, 124, 90, speed);
    let hopped = false;
    const result = ride(subject, 600, () => {
      const s = subject.snapshot();
      const hop = !hopped && s.grounded && s.position.x >= hopAt && subject.canAcceptHop;
      if (hop) hopped = true;
      return actions({ hop });
    });
    const label = `${speed} m/s, hop at x ${hopAt}`;
    assert.ok(hopped, label);
    assert.equal(result.crash, null, label);
    assert.ok(result.airborneBeyond < COPING_X + 0.3, `${label}: flew to x ${result.airborneBeyond}`);
    assert.ok(result.touchdowns[0].x < COPING_X, label);
  }
});

function observed(subject: EucController, steps: number, input: (step: number) => ActionSnapshot): TrickEventKind[] {
  const observer = new TrickObserver();
  const events: TrickEventKind[] = [];
  for (let step = 0; step < steps; step += 1) {
    subject.step(STEP, input(step));
    const facts = createTrickFacts();
    Object.assign(facts, { flightIndex: subject.flightIndex, tookOff: subject.tookOff, hopped: subject.hopped,
      hopCharge: subject.hopped ? subject.lastHopCharge : 0, spinCompleted: subject.spinCompleted,
      oneFootQualified: false, touchedDown: subject.touchedDown, landingQuality: subject.lastLandingQuality,
      crashed: subject.crashed });
    for (const event of observer.step(STEP, facts)) events.push(event.kind);
  }
  return events;
}

test('D19: a come-back air is a flight whose automatic half turn is never a spin; a 180 the rider adds is', () => {
  for (const speed of [7, 12, 20]) {
    // Hands off: one flight, no hop, no spin — the half turn is the rule's.
    const plain = rider(152, 124, 90, speed);
    const before = plain.flightIndex;
    let tookOff = false, spunAtTouchdown: boolean | null = null;
    const quiet = observed(plain, 400, () => {
      if (plain.tookOff && plain.inComeBackAir) tookOff = true;
      if (plain.touchedDown && spunAtTouchdown === null) spunAtTouchdown = plain.spinCompleted;
      return actions();
    });
    assert.equal(plain.comeBackAirCount, 1);
    assert.ok(tookOff, 'the come-back air raised the takeoff edge');
    assert.equal(plain.flightIndex, before + 1);
    assert.equal(spunAtTouchdown, false);
    assert.deepEqual(quiet, []);
    // Hop tapped on the way up: the rider's 180, swept and paid once; they roll back down in reverse.
    const spun = rider(152, 124, 90, speed);
    let tapped = false;
    const events = observed(spun, 400, () => {
      const tap = !tapped && !spun.snapshot().grounded && spun.inComeBackAir && spun.canAcceptSpin;
      if (tap) tapped = true;
      return actions({ hop: tap, steer: tap ? -1 : 0 });
    });
    assert.ok(tapped);
    assert.deepEqual(events, ['spin-landed'], `${speed} m/s`);
    assert.equal(spun.crashed, false);
  }
});

test('C2: a stall on the wall, the mini and a 25° bank turns back to the flat in about a second', () => {
  const lines = [
    { name: 'east wall', x: 157, z: 124, heading: 90, speed: 4, floor: 0 },
    { name: 'mini N wall', x: 97.25, z: 104.5, heading: 180, speed: 4, floor: -1.49 },
    { name: 'bank-S (25°)', x: 125.5, z: 113.5, heading: 180, speed: 4, floor: 0 },
    { name: 'snake channel side', x: 128, z: 158.25, heading: 180, speed: 4, floor: -1 },
  ];
  for (const line of lines) {
    const subject = rider(line.x, line.z, line.heading, line.speed);
    let turnedAt = -1, flatAt = -1;
    for (let step = 0; step < 480 && flatAt < 0; step += 1) {
      subject.step(STEP, actions());
      const s = subject.snapshot();
      if (turnedAt < 0 && subject.wallTurnCount > 0) turnedAt = step;
      if (turnedAt >= 0 && s.position.y < line.floor + 0.02 && s.groundNormal.y > 0.999) flatAt = step;
    }
    assert.ok(turnedAt >= 0, `${line.name}: turned`);
    assert.ok(flatAt >= 0, `${line.name}: back on the flat`);
    const seconds = (flatAt - turnedAt) * STEP;
    assert.ok(seconds < 1.6, `${line.name}: ${seconds.toFixed(2)} s`);
    assert.equal(subject.crashed, false);
  }
});

test('C2: the rider\'s escapes stay theirs — brake-reverse and a throttle creep never turn; a carve along the face never turns', () => {
  // Brake held as the climb runs out: reverse engages and the wheel rolls back fakie.
  const braking = rider(157, 124, 90, 4);
  let reversed = false;
  for (let step = 0; step < 360; step += 1) {
    braking.step(STEP, actions({ throttle: braking.snapshot().speed < 1.6 ? -1 : 0 }));
    reversed ||= braking.snapshot().reversing;
  }
  assert.ok(reversed);
  assert.equal(braking.wallTurnCount, 0);
  // Throttle held up a 25° bank: full drive out-pulls it, so it is a creep, never a stall.
  const creeping = rider(125.5, 113.5, 180, 4);
  for (let step = 0; step < 360; step += 1) creeping.step(STEP, actions({ throttle: creeping.snapshot().speed < 1.6 ? 1 : 0 }));
  assert.equal(creeping.wallTurnCount, 0);
  assert.ok(creeping.snapshot().position.y > 0.8, 'crept up onto the deck');
  // Riding along the east wall's face at 6 and 10 m/s.
  for (const speed of [6, 10]) for (const heading of [0, 180]) {
    const carving = rider(162.05, 124, heading, speed);
    for (let step = 0; step < 240; step += 1) carving.step(STEP, actions());
    assert.equal(carving.wallTurnCount, 0);
    assert.equal(carving.comeBackAirCount, 0);
  }
});

/** Ride a line, crash where `when` first holds (or wherever the line crashes itself), and return the recovered rider. */
function crashAndRecover(x: number, z: number, heading: number, speed: number, when: ((c: EucController) => boolean) | null) {
  const subject = rider(x, z, heading, speed);
  let crashed = false;
  for (let step = 0; step < 2400; step += 1) {
    const s = subject.snapshot();
    if (!crashed && when !== null && when(subject)) subject.hardKnock(Math.sin(heading * DEG), Math.cos(heading * DEG));
    subject.step(STEP, crashed ? actions() : actions({ throttle: s.speed < speed ? 0.6 : 0 }));
    if (subject.crashed) crashed = true;
    if (crashed && !subject.crashed && subject.snapshot().state === 'recovering') return subject;
  }
  assert.fail('no recovery');
}

test('C3/C5: a crash on a face, or nose-first into a ledge, restarts at rest on unflagged ground with 3 m clear ahead', () => {
  const cases = [
    { name: 'east wall face', recovered: crashAndRecover(134, 124.4, 90, 9, (c) => c.snapshot().grounded && c.snapshot().position.y > 0.5) },
    { name: 'mini N wall face', recovered: crashAndRecover(97.25, 119, 180, 6, (c) => c.snapshot().grounded && c.snapshot().position.z < 101.6 && c.snapshot().position.y > -0.8) },
    { name: 'into L1\'s end', recovered: crashAndRecover(119, 101.45, 90, 8, null) },
    { name: 'into a planter', recovered: crashAndRecover(144, 165.4, -90, 8, null) },
  ];
  for (const { name, recovered } of cases) {
    const s = recovered.snapshot();
    assert.equal(s.speed, 0, name);
    assert.equal(sampler.transitionAt(s.position.x, s.position.z), false, `${name}: respawned on a flagged cell`);
    assert.ok(s.groundNormal.y > 0.9999, `${name}: on level ground`);
    const ahead = sampler.raycastObstacle(
      { x: s.position.x, y: s.position.y + WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor + 1e-6, z: s.position.z },
      { x: Math.sin(s.headingY), y: 0, z: Math.cos(s.headingY) }, 3, WHEEL.pedalSpan / 2);
    assert.equal(ahead, null, `${name}: a solid ${ahead} m ahead`);
  }
});

test('G-D: rolling off D1\'s 0.90 m edge lands clean at 3, 6 and 9 m/s on both wheels', () => {
  for (const tuning of WHEELS) for (const speed of [3, 6, 9]) {
    const subject = new EucController(sampler, { tuning });
    assert.ok(subject.reset({ position: { x: 118.5, y: 0.9, z: 105 }, headingY: 0 }, speed));
    const result = ride(subject, 300, () => actions({ throttle: subject.snapshot().speed < speed ? 0.3 : 0 }));
    assert.equal(result.crash, null);
    assert.ok(result.touchdowns.length >= 1);
    assert.equal(result.touchdowns[0].quality, 'clean', `${speed} m/s: ${result.touchdowns[0].quality}`);
  }
});

test('drop-ins roll in from the east deck, the mini, the bowl and the berm at 0–8 m/s', () => {
  const edges = [
    { x: 165, z: 124, heading: -90, floor: 0 },
    { x: 90, z: 105.5, heading: 90, floor: -1.49 },
    { x: 104, z: 166.5, heading: 180, floor: -1.49 },
    { x: 142 + 11.5 * Math.SQRT1_2, z: 152.25 + 11.5 * Math.SQRT1_2, heading: -135, floor: -1 },
  ];
  for (const edge of edges) for (const speed of [0, 3, 8]) {
    const subject = rider(edge.x, edge.z, edge.heading, speed);
    let reached = false;
    const result = ride(subject, 360, () => {
      reached ||= subject.snapshot().grounded && subject.snapshot().position.y < edge.floor + 0.05;
      return actions({ throttle: speed === 0 && !reached && subject.snapshot().speed < 1.5 ? 0.6 : 0 });
    });
    assert.ok(reached, `(${edge.x}, ${edge.z}) at ${speed}`);
    assert.equal(result.crash, null, `(${edge.x}, ${edge.z}) at ${speed}`);
    for (const t of result.touchdowns) assert.ok(t.quality === 'clean' || t.quality === 'heavy', t.quality);
  }
});

test('kerbs: across bank-S\'s strip beside the stair treads at 12 m/s, the 0.18 m tread is a step, not a wall', () => {
  for (const z of [109.3, 109.6]) {
    const subject = rider(129, z, -90, 12);
    const result = ride(subject, 120, () => actions({ throttle: subject.snapshot().speed < 12 ? 1 : 0 }));
    assert.equal(result.crash, null, `z ${z}: ${result.crash}`);
  }
});

// ---------------------------------------------------------------------------
// The gates stage: kickers, the crest and hop caps, the roll-out's sides
// ---------------------------------------------------------------------------

/** The plan sampler without its optional methods: the shipped rules, as every other world rides. */
const bare: TerrainSampler = {
  sampleGround: (x: number, z: number, out: GroundSample) => sampler.sampleGround(x, z, out),
  raycast: (origin, direction, maxDistance) => sampler.raycast(origin, direction, maxDistance),
  raycastObstacle: (...args) => sampler.raycastObstacle(...args),
};

/** Ride at `speed` along +X from `back` metres before `foot`, throttle off at the foot; the first flight after it. */
function kick(foot: number, z: number, speed: number, headingDeg = 90, phase = 0, terrain: TerrainSampler = sampler) {
  const h = headingDeg * DEG;
  const back = 6 + phase * 0.037;
  const subject = rider(foot - back * Math.sin(h), z - back * Math.cos(h), headingDeg, speed, {}, terrain);
  let takeoff: { x: number; vy: number } | null = null;
  let crossed = false;
  const path: { x: number; z: number }[] = [];
  const result = ride(subject, Math.round((40 / speed + 2) / STEP), () => {
    const s = subject.snapshot();
    if (takeoff === null && subject.tookOff && s.position.x > foot) takeoff = { x: s.position.x, vy: s.verticalVelocity };
    if (takeoff !== null && path.length < 2 / STEP) path.push({ x: s.position.x, z: s.position.z });
    crossed ||= s.position.x >= foot;
    return actions({ throttle: !crossed && s.speed < speed ? 0.6 : 0 });
  });
  return { takeoff: takeoff as { x: number; vy: number } | null, landing: result.touchdowns[0], crash: result.crash, path };
}

test('G-K: K2 launches at its own 16° on every phase — clean at 8–12 m/s, and at full throttle still short of the east wall', () => {
  const qpFoot = 162.5 - 2.2318;
  for (let phase = 0; phase < 8; phase += 1) {
    for (const speed of [8, 10, 12]) {
      const { takeoff, landing, crash } = kick(124.5, 124, speed, 90, phase);
      assert.ok(takeoff, `${speed} m/s phase ${phase}: no flight`);
      assert.ok(takeoff.vy > 0.27 * speed && takeoff.vy < 0.3 * speed, `${speed} m/s phase ${phase}: vy ${takeoff.vy}`);
      assert.equal(landing.quality, 'clean', `${speed} m/s phase ${phase}`);
      assert.equal(crash, null);
    }
    const full = kick(124.5, 124, 23, 90, phase);
    assert.equal(full.takeoff?.vy, SKATE_TRANSITION.kickMaxVerticalSpeed, 'the kicker cap');
    assert.ok(full.landing.x < qpFoot - 4 && full.landing.quality !== 'crash', `23 m/s lands at ${full.landing.x}`);
  }
  // The flags are the switch: without them the lip block launches flat, as on every other world.
  const flat = kick(124.5, 124, 12, 90, 0, bare);
  assert.ok(flat.takeoff && Math.abs(flat.takeoff.vy) < 1e-9 && flat.landing.x < 130);
});

test('G-K: K1 at ±15° stays clear of the snake roll-in at 8–23 m/s', () => {
  const rollIn = (p: { x: number; z: number }) => p.x > 144.75 && p.x < 151.25 && p.z > 145.5;
  for (const heading of [75, 90, 105]) for (const speed of [8, 12, 17.5, 23]) {
    const { takeoff, landing, crash, path } = kick(128.5, 138.6, speed, heading);
    assert.ok(takeoff && takeoff.vy > 0, `${heading}° ${speed} m/s`);
    assert.ok(landing.quality !== 'crash' && crash === null, `${heading}° ${speed} m/s: ${crash}`);
    assert.equal(path.some(rollIn), false, `${heading}° ${speed} m/s enters the roll-in`);
  }
});

/** A couch: seats ridden together through the game's own contact pass (`ContactRoom`), counted. */
interface CouchSeatLog { contacts: number; charges: number }
function couchRoom(seats: EucController[]) {
  const room = new ContactRoom(4);
  const logs: CouchSeatLog[] = seats.map(() => ({ contacts: 0, charges: 0 }));
  const riders: ContactRider[] = seats.map((seat, index) => ({
    get inComeBackAir() { return seat.inComeBackAir; },
    get discontinuitySerial() { return seat.discontinuitySerial; },
    separate(x: number, z: number) { logs[index].contacts += 1; seat.separate(x, z); },
    bump(x: number, z: number, cost: number) { logs[index].charges += 1; seat.bump(x, z, cost); },
  }));
  const bodies = seats.map(() => ({ x: 0, z: 0, velocityX: 0, velocityZ: 0 }));
  return {
    logs,
    /** One contact step, after every seat has stepped — `Game.stepContact`'s order. */
    step(): void {
      seats.forEach((seat, index) => {
        const s = seat.snapshot();
        Object.assign(bodies[index], { x: s.position.x, z: s.position.z,
          velocityX: Math.sin(s.headingY) * s.speed, velocityZ: Math.cos(s.headingY) * s.speed });
      });
      room.step(STEP, bodies, riders, CONTACT, null, sampler.restartsAtRest());
    },
  };
}

/** The shipped rule before QA round 1: every pair on its own, nothing per seat. */
function pairsOnly(seats: EucController[]): () => void {
  const pairs = new Map<number, ContactPair>();
  return () => {
    const bodies = seats.map((seat) => {
      const s = seat.snapshot();
      return { x: s.position.x, z: s.position.z, velocityX: Math.sin(s.headingY) * s.speed, velocityZ: Math.cos(s.headingY) * s.speed };
    });
    for (let a = 0; a < seats.length; a += 1) for (let b = a + 1; b < seats.length; b += 1) {
      const pair = pairs.get(a * 4 + b) ?? new ContactPair();
      pairs.set(a * 4 + b, pair);
      const contact = pair.step(STEP, bodies[a], bodies[b]);
      if (contact === null) continue;
      seats[a].separate(-contact.axisX * contact.pushMetres, -contact.axisZ * contact.pushMetres);
      seats[b].separate(contact.axisX * contact.pushMetres, contact.axisZ * contact.pushMetres);
      if (contact.charge) {
        seats[a].bump(contact.charge.first.pushX, contact.charge.first.pushZ, contact.charge.first.speedCost);
        seats[b].bump(contact.charge.second.pushX, contact.charge.second.pushZ, contact.charge.second.speedCost);
      }
    }
  };
}

const GRID = [[112.8, 125.6], [112.8, 122.4], [109.6, 125.6], [109.6, 122.4]];

test('G-K: four couch seats over K2 at full throttle, steered together and bumping, all fly it and none crashes', () => {
  // QA COUCH-6: on parallel lines at one throttle the grid never touched, so
  // the seats are nudged inward for 0.4 s (the two columns, z 125.6 and
  // 122.4) and the pin asserts that contact happened.
  const seats = GRID.map(([x, z]) => rider(x, z, 90, 0));
  const couch = couchRoom(seats);
  const flights = seats.map(() => 0);
  for (let step = 0; step < 3.5 / STEP; step += 1) {
    const before = seats.map((seat) => seat.snapshot());
    seats.forEach((seat, index) => seat.step(STEP, actions({ throttle: 1, steer: step * STEP < 0.4 ? (index % 2 ? 0.05 : -0.05) : 0 })));
    couch.step();
    seats.forEach((seat, index) => {
      const s = seat.snapshot();
      assert.equal(s.crashed, false, `seat ${index} crashed at (${s.position.x}, ${s.position.z})`);
      if (before[index].grounded && !s.grounded) flights[index] += 1;
    });
  }
  assert.deepEqual(flights, [1, 1, 1, 1]);
  assert.ok(couch.logs.some((log) => log.contacts > 0), 'the seats never touched');
  assert.ok(couch.logs.some((log) => log.charges > 0), 'no contact was charged');
});

test('QA COUCH-6: the grid rides on through K2 into the east wall together: contact, come-backs, no crash', () => {
  const seats = GRID.map(([x, z]) => rider(x, z, 90, 0));
  const couch = couchRoom(seats);
  for (let step = 0; step < 7 / STEP; step += 1) {
    seats.forEach((seat) => seat.step(STEP, actions({ throttle: 1 })));
    couch.step();
    seats.forEach((seat, index) => assert.equal(seat.crashed, false, `seat ${index} crashed: ${seat.snapshot().crashCause}`));
  }
  assert.ok(couch.logs.some((log) => log.charges > 0), 'no contact was charged');
  for (const seat of seats) assert.ok(seat.comeBackAirCount >= 1, 'a seat never came back off the wall');
});

test('QA COUCH-1: a bump never crashes you at four seats — one charge per rider per cooldown, whichever pair', () => {
  // Four seats in a diamond, no initial overlap, at 14 m/s straight at the
  // east wall: the leader stops dead in its come-back air while the pack
  // climbs into it, and three pairs met one rider within 50 ms.
  const pack = [[0, 0], [-0.9, -0.5], [-0.9, 0.5], [-1.8, 0]];
  const ridePack = (resolve: (seats: EucController[]) => () => void): string[] => {
    const seats = pack.map(([dx, dz]) => rider(150 + dx, 124 + dz, 90, 14));
    const contact = resolve(seats);
    const crashes: string[] = [];
    const down = seats.map(() => false);
    for (let step = 0; step < 5 / STEP; step += 1) {
      seats.forEach((seat) => seat.step(STEP, actions(step * STEP < 1 ? { throttle: 1 } : {})));
      contact();
      seats.forEach((seat, index) => {
        if (seat.crashed && !down[index]) crashes.push(`seat ${index} ${seat.snapshot().crashCause}`);
        down[index] = seat.crashed;
      });
    }
    return crashes;
  };
  // The bug, kept as the control: per pair alone, two seats wobble down.
  assert.ok(ridePack(pairsOnly).some((crash) => crash.endsWith('wobble')), 'the per-pair control no longer stacks');
  assert.deepEqual(ridePack((seats) => { const couch = couchRoom(seats); return () => couch.step(); }), []);
});

test('QA COUCH-3: a follower climbing under a come-back air never shoves it over the deck', () => {
  for (const speed of [9, 12, 15, 20]) for (const behind of [0.4, 0.8, 1.5, 2.5, 4]) {
    const x0 = 150 - speed * 0.6;
    const seats = [rider(x0, 124, 90, speed), rider(x0 - behind, 124, 90, speed)];
    const couch = couchRoom(seats);
    for (let step = 0; step < 5 / STEP; step += 1) {
      const wasComeBack = seats.map((seat) => seat.inComeBackAir);
      seats.forEach((seat) => seat.step(STEP, actions(step * STEP < 1.2 ? { throttle: 1 } : {})));
      couch.step();
      seats.forEach((seat, index) => {
        const s = seat.snapshot();
        const label = `${speed} m/s, ${behind} m behind, seat ${index}`;
        assert.equal(s.crashed, false, `${label}: ${s.crashCause}`);
        if (seat.touchedDown && wasComeBack[index]) {
          assert.ok(!(s.position.x > COPING_X + 0.05 && s.position.y > 1.2), `${label}: came back onto the deck at ${s.position.x}`);
        }
      });
    }
  }
});

test('QA COUCH-4: seats following one line recover together at rest without bumping each other down', () => {
  // Four seats in a train, each knocked down on the east face; they walk back
  // to one clear point at rest. Hands-off, and steering away after 0.3 s.
  for (const policy of ['hands-off', 'steer away'] as const) for (const gap of [1.5, 4]) {
    const seats = [0, 1, 2, 3].map((index) => rider(134 - gap * index, 124.4, 90, 9));
    const couch = couchRoom(seats);
    const knocked = seats.map(() => false);
    const recovered = seats.map(() => -1);
    for (let step = 0; step < 30 / STEP; step += 1) {
      seats.forEach((seat, index) => {
        const s = seat.snapshot();
        if (!knocked[index] && s.grounded && s.position.y > 0.5) { seat.hardKnock(1, 0); knocked[index] = true; }
        const since = (step - recovered[index]) * STEP;
        const input = recovered[index] < 0
          ? (knocked[index] ? actions() : actions({ throttle: s.speed < 9 ? 0.6 : 0 }))
          : policy === 'hands-off' || since < 0.3 ? actions() : actions({ throttle: 0.4, steer: index % 2 ? 1 : -1 });
        seat.step(STEP, input);
        if (knocked[index] && recovered[index] < 0 && !seat.crashed && seat.snapshot().state === 'recovering') recovered[index] = step;
        if (recovered[index] >= 0 && seat.crashed) {
          assert.notEqual(seat.snapshot().crashCause, 'wobble', `${policy}, gap ${gap}: seat ${index} bumped down after recovering`);
        }
      });
      couch.step();
    }
    assert.ok(recovered.every((at) => at >= 0), `${policy}, gap ${gap}: a seat never recovered`);
  }
});

test('QA RIDE-2: partial throttle that cannot climb a face is turned back to the flat, not parked on it', () => {
  // The mini's south bank (30.8°), its only rideable exit, at a half-held
  // trigger: the wheel climbed, stopped and sat there for as long as it was held.
  for (const throttle of [0.2, 0.35, 0.5]) {
    const subject = rider(97.75, 108.5, 0, 0);
    let parked = 0, longest = 0;
    for (let step = 0; step < 8 / STEP; step += 1) {
      subject.step(STEP, actions({ throttle }));
      const s = subject.snapshot();
      const tilt = Math.acos(Math.min(1, s.groundNormal.y));
      parked = s.grounded && Math.abs(s.speed) < 0.05 && tilt > SKATE_TRANSITION.wallTurnMinTilt ? parked + 1 : 0;
      longest = Math.max(longest, parked);
    }
    assert.ok(subject.wallTurnCount >= 1, `throttle ${throttle}: never turned`);
    assert.ok(longest * STEP <= 1, `throttle ${throttle}: parked ${(longest * STEP).toFixed(2)} s on the bank`);
  }
});

test('QA CTRL-3: a hands-off coast up the east wall that crests onto the deck keeps its heading', () => {
  let crested = 0;
  for (let hundredth = 520; hundredth <= 540; hundredth += 1) {
    const subject = rider(154, 120, 90, hundredth / 100, { cutoutEnabled: 0 });
    ride(subject, 8 / STEP);
    const s = subject.snapshot();
    if (!(s.position.x > COPING_X + 0.05 && s.position.y > QP_DECK - 0.05)) continue;
    crested += 1;
    assert.ok(Math.abs(s.headingY - 90 * DEG) < 1e-9, `${hundredth / 100} m/s reached the deck at ${(s.headingY / DEG).toFixed(1)}°`);
  }
  assert.ok(crested >= 5, `only ${crested} runs crested`);
});

test('the crest cap: a snake lip crossed at 23 m/s pops at 4 m/s at most and stays in the yard; unflagged it clears the 3.49 m guard', () => {
  // A heightfield crest launches on some start phases and not others, so eight are ridden.
  for (const [terrain, capped] of [[sampler, true], [bare, false]] as const) {
    let launches = 0;
    let furthest = -Infinity;
    for (let phase = 0; phase < 8; phase += 1) {
      const subject = rider(141.25 + phase * 0.024, 148, 90, 23, {}, terrain);
      let maxX = -Infinity;
      ride(subject, 300, () => {
        const s = subject.snapshot();
        if (subject.tookOff && s.position.x > 150 && s.position.x < 155) {
          launches += 1;
          if (capped) assert.ok(s.verticalVelocity <= SKATE_TRANSITION.crestMaxVerticalSpeed, `phase ${phase}: vy ${s.verticalVelocity}`);
          else assert.ok(s.verticalVelocity > 7, `phase ${phase}: shipped vy ${s.verticalVelocity}`);
        }
        maxX = Math.max(maxX, s.position.x);
        return actions({ throttle: 1 });
      });
      furthest = Math.max(furthest, maxX);
      if (capped) assert.ok(maxX < 167.5, `phase ${phase}: reached x ${maxX}`);
    }
    assert.ok(launches >= 2, `${capped ? 'capped' : 'shipped'}: ${launches} lip launches in 8 phases`);
    if (!capped) assert.ok(furthest > 168.5, 'the shipped crest rule throws the rider over the east plinth');
  }
});

test('the hop cap: a hop at the snake\'s south lip at 12 m/s stays under the 2.4 m guard', () => {
  for (const heading of [-45, 0, 45]) {
    const h = heading * DEG;
    const subject = rider(128 - Math.sin(h) * 4, 157.5, heading, 12);
    let hopped = false;
    let vy = 0;
    let maxZ = -Infinity;
    ride(subject, 360, () => {
      const s = subject.snapshot();
      if (subject.tookOff && vy === 0) vy = s.verticalVelocity;
      maxZ = Math.max(maxZ, s.position.z);
      const hop = !hopped && s.position.z > 160.8;
      hopped ||= hop;
      return actions({ throttle: 1, hop });
    });
    assert.ok(vy > 0 && vy <= SKATE_TRANSITION.hopMaxVerticalSpeed + 1e-9, `${heading}°: vy ${vy}`);
    assert.ok(maxZ < 168, `${heading}°: reached z ${maxZ}`);
  }
});

test('the roll-out\'s sides: a line across its east side at 20 and 25 m/s stays in the bowl', () => {
  for (const speed of [20, 25]) for (const phase of [0, 1, 2]) {
    // G-C's "bowl N x107.5, −60°" line, which flew 16–30 m out over the deck.
    const h = (180 - 60) * DEG;
    const back = 6 + phase * speed / 360;
    const subject = rider(107.5 - Math.sin(h) * back, 152.5 - Math.cos(h) * back, 120, speed);
    let minZ = Infinity;
    const result = ride(subject, 240, () => {
      const s = subject.snapshot();
      if (!s.grounded) minZ = Math.min(minZ, s.position.z);
      return actions();
    });
    assert.equal(result.crash, null, `${speed} m/s: ${result.crash}`);
    assert.ok(minZ > 152.5 - 0.6, `${speed} m/s flew ${(152.5 - minZ).toFixed(2)} m past the north coping`);
  }
});
