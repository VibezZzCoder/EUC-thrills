/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LAUNCH_PAD, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import {
  EucController, createPose,
  type EucDynamicMotionResult, type EucDynamicWorld, type EucTuning,
} from './EucController.ts';
import { LaunchPadField, NO_LAUNCH_PADS, type LaunchPadVolume } from './launchPadField.ts';
import { TrickObserver, createTrickFacts } from './trickEvents.ts';
import type { GroundSample, TerrainSampler } from './world.ts';

/**
 * M42 — the launch pad inside the controller (`docs/PLANS.md` §42.2e, §42.5
 * (a)–(i)). Kept out of the 8,000-line `EucController.test.ts` on purpose.
 *
 * Every ride here is on a flat pavement double with one pad 20 m ahead of a
 * rider reset at the origin facing +Z: 18.6 m to the trigger, beyond the 8 m
 * re-arm that every reset starts. Hop presses are delivered the way
 * `app/Game.ts` delivers them — only on a step where the controller says
 * `canAcceptHop || canAcceptSpin` — so no test rides an input path a player
 * does not have.
 */

const STEP = 1 / SIMULATION.hz;
const HULL = { halfWidthMetres: 0.25, halfLengthMetres: 0.3, heightMetres: 1.7 };
const CLEAR: EucDynamicWorld = { hull: HULL, resolveMotion: () => null };
const PAD_Z = 20;

const PAD: LaunchPadVolume = Object.freeze({
  id: 'pad-test', x: 0, z: PAD_Z,
  triggerRadius: LAUNCH_PAD.triggerRadiusMetres, footprintRadius: LAUNCH_PAD.footprintRadiusMetres, dropMetres: 0,
});
/** A deliberately oversized pad (same rules, more room) for the stop-and-go and short-flight cases. */
const WIDE_PAD: LaunchPadVolume = Object.freeze({ ...PAD, id: 'pad-wide', triggerRadius: 6, footprintRadius: 7 });

function actions(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

/** Level pavement everywhere; optionally a 4 m wall across +Z at `wallZ`, seen only as an obstacle. */
function flat(wallZ?: number): TerrainSampler {
  return {
    sampleGround(_x: number, _z: number, out: GroundSample): GroundSample {
      out.height = 0;
      out.normal.x = 0; out.normal.y = 1; out.normal.z = 0;
      out.surface = 'pavement';
      out.offCourse = false;
      return out;
    },
    raycast: () => null,
    raycastObstacle: wallZ === undefined ? undefined : (origin, direction, maxDistance, _sweep, _lateral, out) => {
      const length = Math.hypot(direction.x, direction.y, direction.z);
      if (!(length > 0)) return null;
      const dz = direction.z / length, dy = direction.y / length;
      if (dz <= 1e-9 || origin.z > wallZ) return null;
      const t = (wallZ - origin.z) / dz;
      if (t > maxDistance || origin.y + t * dy > 4) return null;
      if (out) { out.distance = t; out.halfExtentX = 50; out.halfExtentZ = 0.5; }
      return t;
    },
  };
}

interface Make {
  pads?: LaunchPadField | 'none';
  armed?: boolean;
  /** Drawn (the mode table's `visible`): the dome stands even disarmed (R16). Arming alone raises it too. */
  shown?: boolean;
  sampler?: TerrainSampler;
  world?: EucDynamicWorld;
  tuning?: Partial<EucTuning>;
}

function make(options: Make = {}): EucController {
  const base = { dynamicWorld: options.world, tuning: { cutoutEnabled: 0, ...options.tuning } };
  const controller = options.pads === 'none' || options.pads === undefined
    ? new EucController(options.sampler ?? flat(), base)
    : new EucController(options.sampler ?? flat(), { ...base, launchPads: options.pads });
  if (options.armed) controller.setLaunchPadsArmed(true);
  if (options.shown) controller.setLaunchPadsShown(true);
  return controller;
}

/** Bang-bang throttle to a target speed, the jump bench's law; `null` coasts. */
function holdTo(controller: EucController, target: number | null): number {
  if (target === null) return 0;
  return controller.snapshot().speed < target ? 1 : 0;
}

function start(controller: EucController, speed: number, x = 0, z = 0, headingY = 0): void {
  assert.ok(controller.reset({ position: { x, y: 0, z }, headingY }, speed));
}

/** Every numeric fact a ride produces: the pose, the snapshot and the trick-facing getters. */
function digest(controller: EucController): unknown {
  const pose = createPose();
  controller.writePose(pose);
  return {
    pose, snapshot: controller.snapshot(),
    facts: [controller.tookOff, controller.hopped, controller.touchedDown, controller.flightIndex,
      controller.spinCompleted, controller.lastLandingQuality, controller.crashed],
  };
}

function poseOf(subject: EucController) {
  const pose = createPose(); subject.writePose(pose); return pose;
}

/** Inspect physical internals too, as `controllerTransaction.test.ts` does. */
function physicalState(subject: EucController) {
  const record = subject as unknown as Record<string, unknown>;
  const primitives = Object.fromEntries(Object.entries(record).filter(([key, value]) =>
    key !== 'stateRevision' && value !== null && typeof value !== 'object' && typeof value !== 'function'));
  const references = Object.fromEntries([
    'ground', 'probe', 'obstacleHit', 'standoffOrigin', 'standoffRay', 'dynamicPrevious', 'dynamicIntent', 'ragdoll',
  ].map((key) => [key, structuredClone(record[key])]));
  return { primitives, references, snapshot: subject.snapshot(), pose: poseOf(subject) };
}

function safeRing(subject: EucController): number[] {
  return Array.from((subject as unknown as { safeRing: Float64Array }).safeRing);
}

function blocked(fraction: number): EucDynamicMotionResult {
  return { allowedMoveFraction: fraction, normalX: 0, normalZ: -1, closingSpeedMetresPerSecond: 0, chargeImpact: false };
}

// ---------------------------------------------------------------------------
// (a) Inert unless armed and met
// ---------------------------------------------------------------------------

test('(a) an empty field, an armed pad never met and a hidden (disarmed, undrawn) pad crossed are bit-identical to no field', () => {
  const variants: Make[] = [
    { pads: 'none' },
    { pads: NO_LAUNCH_PADS, armed: true },
    { pads: new LaunchPadField([{ ...PAD, x: 60 }]), armed: true },
    { pads: new LaunchPadField([PAD]), armed: false },
  ];
  const riders = variants.map((variant) => make(variant));
  for (const rider of riders) start(rider, 10);
  let crossed = false;
  for (let step = 0; step < 600; step += 1) {
    const input = actions({ throttle: holdTo(riders[0], 10), steer: step > 400 ? 0.3 : 0 });
    for (const rider of riders) rider.step(STEP, input);
    const reference = digest(riders[0]);
    for (let index = 1; index < riders.length; index += 1) {
      assert.deepEqual(digest(riders[index]), reference, `variant ${index} at step ${step}`);
    }
    crossed ||= Math.abs(riders[3].snapshot().position.z - PAD_Z) < 0.5;
    assert.equal(riders[3].padLaunched, false);
  }
  assert.ok(crossed, 'the disarmed rider really crossed the pad centre');
});

test('(a) crossing a disarmed pad, crashing and respawning: safe point, ring and respawn match no field', () => {
  // Safe points are stored every step once held (delay 0), so the safe line
  // runs straight over the disarmed pad — and must, exactly as with no pad.
  const tuning = { crashSafeDelaySeconds: 0, crashRecoverAutoSeconds: 0.3, crashRecoverEarliestSeconds: 99 };
  const plain = make({ pads: 'none', tuning });
  const disarmed = make({ pads: new LaunchPadField([PAD]), tuning });
  for (const rider of [plain, disarmed]) start(rider, 3);
  const both = (count: number, input: (step: number) => ActionSnapshot): void => {
    for (let step = 0; step < count; step += 1) {
      const action = input(step);
      plain.step(STEP, action);
      disarmed.step(STEP, action);
    }
  };
  // Ride slowly until the wheel stands on the pad, then crash there.
  let steps = 0;
  while (plain.snapshot().position.z < PAD_Z && steps < 2000) {
    both(1, () => actions({ throttle: holdTo(plain, 3) }));
    steps += 1;
  }
  const safeOnPad = disarmed.snapshot().safePosition;
  assert.ok(Math.hypot(safeOnPad.x - PAD.x, safeOnPad.z - PAD.z) < PAD.footprintRadius,
    'the disarmed rider stored a safe point on the pad, as the plain rider did');
  for (const rider of [plain, disarmed]) rider.hardKnock(1, 0);
  both(120, () => actions());
  assert.equal(disarmed.snapshot().safeHeading, plain.snapshot().safeHeading);
  assert.deepEqual(disarmed.snapshot().safePosition, plain.snapshot().safePosition);
  assert.deepEqual(safeRing(disarmed), safeRing(plain));
  assert.deepEqual(poseOf(disarmed), poseOf(plain), 'the first respawn pose');
  // A second crash: the ring decides where this one comes back.
  for (const rider of [plain, disarmed]) rider.hardKnock(-1, 0);
  both(120, () => actions());
  assert.deepEqual(digest(disarmed), digest(plain), 'the second respawn, decided by the ring');
});

// ---------------------------------------------------------------------------
// (b) The trigger is the centre circle
// ---------------------------------------------------------------------------

test('(b) a tangent line outside the trigger never launches; inside it does', () => {
  for (const [offset, launches] of [[LAUNCH_PAD.triggerRadiusMetres + 0.05, false], [1.9, false],
    [LAUNCH_PAD.triggerRadiusMetres - 0.1, true], [0, true]] as const) {
    const rider = make({ pads: new LaunchPadField([PAD]), armed: true });
    start(rider, 10, offset, 0);
    let launched = false;
    for (let step = 0; step < 400; step += 1) {
      rider.step(STEP, actions({ throttle: holdTo(rider, 10) }));
      launched ||= rider.padLaunched;
    }
    assert.equal(launched, launches, `offset ${offset} m`);
  }
});

// ---------------------------------------------------------------------------
// (c) A slow entry, a stop, arming inside
// ---------------------------------------------------------------------------

test('(c) rolling in below the minimum, stopping and accelerating away inside never launches', () => {
  const rider = make({ pads: new LaunchPadField([WIDE_PAD]), armed: true });
  start(rider, 2.5, 0, 0);
  let phase: 'roll' | 'stop' | 'go' = 'roll';
  let launched = false, peakInside = 0, stopped = 0;
  for (let step = 0; step < 3000; step += 1) {
    const snap = rider.snapshot();
    const inside = Math.hypot(snap.position.x - PAD.x, snap.position.z - PAD.z) <= WIDE_PAD.triggerRadius;
    if (phase === 'roll' && snap.position.z >= PAD_Z - WIDE_PAD.triggerRadius + 0.5) phase = 'stop';
    if (phase === 'stop' && Math.abs(snap.speed) < 0.05) { stopped += 1; if (stopped > 30) phase = 'go'; }
    const throttle = phase === 'roll' ? holdTo(rider, 2.5) : phase === 'stop' ? (snap.speed > 0.05 ? -1 : 0) : 1;
    rider.step(STEP, actions({ throttle }));
    launched ||= rider.padLaunched;
    if (phase === 'go' && inside) peakInside = Math.max(peakInside, rider.snapshot().speed);
  }
  assert.equal(phase, 'go');
  assert.ok(peakInside >= LAUNCH_PAD.minimumLaunchSpeed + 1,
    `the accelerating rider passed the minimum inside the trigger (${peakInside.toFixed(2)} m/s), so the latch is what held`);
  assert.equal(launched, false);
});

test('(c) a seat armed while inside a footprint never launches until it has rolled out', () => {
  // Disarmed, the rider rides into the footprint's rim band fast; it is armed
  // there and carries straight on through the trigger: no launch.
  const pads = new LaunchPadField([PAD]);
  const rider = make({ pads });
  start(rider, 10);
  let armedAt = -1, launches = 0;
  for (let step = 0; step < 500; step += 1) {
    const snap = rider.snapshot();
    const distance = Math.hypot(snap.position.x - PAD.x, snap.position.z - PAD.z);
    if (armedAt < 0 && distance < PAD.footprintRadius && distance > PAD.triggerRadius) {
      rider.setLaunchPadsArmed(true);
      armedAt = step;
    }
    rider.step(STEP, actions({ throttle: holdTo(rider, 10) }));
    if (rider.padLaunched) launches += 1;
  }
  assert.ok(armedAt >= 0, 'armed inside the rim band');
  assert.equal(launches, 0, 'the armed-inside visit is already decided');
  // Standing on the trigger itself: armed there, then away at full throttle.
  const standing = make({ pads: new LaunchPadField([WIDE_PAD]) });
  start(standing, 0, 0, PAD_Z - 4);
  for (let step = 0; step < 60; step += 1) standing.step(STEP, actions());
  standing.setLaunchPadsArmed(true);
  let peak = 0, standingLaunches = 0;
  for (let step = 0; step < 240; step += 1) {
    standing.step(STEP, actions({ throttle: 1 }));
    if (standing.padLaunched) standingLaunches += 1;
    const snap = standing.snapshot();
    if (Math.hypot(snap.position.x, snap.position.z - PAD_Z) <= WIDE_PAD.triggerRadius) peak = Math.max(peak, snap.speed);
  }
  assert.ok(peak > LAUNCH_PAD.minimumLaunchSpeed, `fast enough inside (${peak.toFixed(2)} m/s)`);
  assert.equal(standingLaunches, 0);
  // Out past the footprint, round and back in: now it fires.
  start(rider, 10, 0, 0);
  let again = 0;
  for (let step = 0; step < 400; step += 1) {
    rider.step(STEP, actions({ throttle: holdTo(rider, 10) }));
    if (rider.padLaunched) again += 1;
  }
  assert.equal(again, 1, 'a fresh visit after the re-arm launches');
});

// ---------------------------------------------------------------------------
// (d) No bounce loop
// ---------------------------------------------------------------------------

test('(d) a short flight landing inside the same pad never relaunches; re-entry after rolling out does', () => {
  const rider = make({ pads: new LaunchPadField([WIDE_PAD]), armed: true });
  start(rider, 4.6);
  let launches = 0, landedInside = false, rolledOut = false, reversing = false, stopHold = 0;
  for (let step = 0; step < 4000 && launches < 2; step += 1) {
    const snap = rider.snapshot();
    const distance = Math.hypot(snap.position.x - PAD.x, snap.position.z - PAD.z);
    if (launches === 1 && distance > WIDE_PAD.footprintRadius + 1 && snap.grounded) rolledOut = true;
    if (rolledOut && !reversing) {
      // Stop, then ride back over the same pad in reverse.
      if (Math.abs(snap.speed) < 0.05) stopHold += 1;
      if (stopHold > 20) reversing = true;
    }
    const throttle = !rolledOut ? holdTo(rider, 4.6) : reversing ? -1 : (snap.speed > 0.05 ? -1 : 0);
    rider.step(STEP, actions({ throttle }));
    if (rider.padLaunched) launches += 1;
    if (rider.touchedDown && launches === 1) {
      const at = rider.snapshot().position;
      if (Math.hypot(at.x - PAD.x, at.z - PAD.z) <= WIDE_PAD.triggerRadius) landedInside = true;
      // The landing inside must not throw the wheel again on any later step
      // until it has rolled out — `launches` stays 1 through `rolledOut`.
    }
    if (!rolledOut) assert.ok(launches <= 1, 'relaunched before rolling out');
  }
  assert.ok(landedInside, 'the first flight landed inside the trigger');
  assert.ok(rolledOut && reversing);
  assert.equal(launches, 2, 'riding back in after rolling out launches again');
});

test('the pad bounce: a hop that lands on the trigger is thrown on the next step (a G1 feel item, pinned)', () => {
  // QA A r1 MINOR 2. A visit is decided by the first grounded step inside the
  // trigger; a hop that comes down on it has had none, so the pad fires one
  // step after the hop's own landing has been judged. Shipped as ruled; the
  // owner judges it at G1 ("hop onto a pad"). Changing it (latching a
  // touchdown inside a trigger) needs a Ruling, and flips this pin.
  let bounced = 0;
  for (const speed of [5, 7, 10]) {
    for (const hopAt of [6, 5, 4]) {
      const rider = make({ pads: new LaunchPadField([PAD]), armed: true });
      start(rider, speed);
      let hopped = false, landStep = -1, landTier: string | null = null, landedOn = Infinity, launchStep = -1;
      for (let step = 0; step < 900 && launchStep < 0; step += 1) {
        const snap = rider.snapshot();
        const distance = Math.hypot(snap.position.x - PAD.x, snap.position.z - PAD.z);
        const hop = !hopped && distance <= hopAt && rider.canAcceptHop;
        if (hop) hopped = true;
        rider.step(STEP, actions({ throttle: snap.grounded ? holdTo(rider, speed) : 0, hop }));
        if (rider.touchedDown && landStep < 0 && hopped) {
          landStep = step;
          landTier = rider.lastLandingQuality;
          const at = rider.snapshot().position;
          landedOn = Math.hypot(at.x - PAD.x, at.z - PAD.z);
        }
        if (rider.padLaunched) launchStep = step;
      }
      assert.ok(hopped, `${speed} m/s, hop at ${hopAt} m: the hop was taken`);
      assert.ok(landStep >= 0 && landTier !== null, 'the hop landed and was judged');
      if (landedOn <= PAD.triggerRadius) {
        bounced += 1;
        assert.equal(launchStep - landStep, 1, `${speed} m/s, hop at ${hopAt} m: thrown on the step after touchdown`);
      } else {
        assert.ok(launchStep < 0 || launchStep > landStep, 'a pad never fires mid-hop');
      }
    }
  }
  assert.ok(bounced >= 1, 'at least one hop came down on the trigger, so the pin is not vacuous');
});

// ---------------------------------------------------------------------------
// (e) No safe point on an armed pad
// ---------------------------------------------------------------------------

test('(e) while the pad stands (armed, or drawn and disarmed: R16), the safe position is never inside a footprint (hidden it is)', () => {
  for (const [armed, shown] of [[true, false], [false, true], [false, false]] as const) {
    const rider = make({ pads: new LaunchPadField([PAD]), armed, shown, tuning: { crashSafeDelaySeconds: 0 } });
    start(rider, 3);
    let inside = 0;
    for (let step = 0; step < 1200; step += 1) {
      // Below the minimum, so the pad never fires and the wheel rolls across it.
      rider.step(STEP, actions({ throttle: holdTo(rider, 3) }));
      const safe = rider.snapshot().safePosition;
      if (Math.hypot(safe.x - PAD.x, safe.z - PAD.z) <= PAD.footprintRadius) inside += 1;
      assert.equal(rider.padLaunched, false);
    }
    if (armed || shown) assert.equal(inside, 0, `a standing pad (armed ${armed}, drawn ${shown}) stored a safe point`);
    else assert.ok(inside > 0, 'the hidden control stores safe points on the pad, as today');
  }
});

// ---------------------------------------------------------------------------
// R16: the drawn pad is a dome the wheel rides, never sinks through
// ---------------------------------------------------------------------------

/** The dome's height over the flat test lawn at a point: the field's own answer. */
const DOME = new LaunchPadField([PAD]);

test('R16: a drawn, disarmed pad is a ramp ridden up and over — the path, speed and heading of no pad; the height of the dome', () => {
  // Disarmed and drawn (free ride's pause/Settings behind a card): nothing
  // launches, and the dome is ridden as a surface only — it never costs speed,
  // refuses a move, or throws the wheel off its crest, at any speed.
  // (`make` rides every wheel with its cutout off, so 29 and 37.8 m/s hold.)
  for (const [speed, offset] of [[3, 0], [10, 0], [10, 1.6], [29, 0], [37.8, 0.9]] as const) {
    const plain = make({ pads: 'none' });
    const drawn = make({ pads: DOME, shown: true });
    for (const rider of [plain, drawn]) start(rider, speed, offset, 0);
    let peak = 0, onDome = 0;
    for (let step = 0; step < 900; step += 1) {
      const input = actions({ throttle: holdTo(plain, speed) });
      plain.step(STEP, input);
      drawn.step(STEP, input);
      const a = plain.snapshot(), b = drawn.snapshot();
      assert.equal(b.position.x, a.position.x, `${speed} m/s step ${step}: x`);
      assert.equal(b.position.z, a.position.z, `${speed} m/s step ${step}: z`);
      assert.equal(b.speed, a.speed, `${speed} m/s step ${step}: speed`);
      assert.equal(b.grounded, true, `${speed} m/s step ${step}: never thrown off the crest`);
      assert.equal(drawn.padLaunched, false);
      const rise = DOME.riseAt(b.position.x, b.position.z);
      assert.equal(b.position.y, rise, `${speed} m/s step ${step}: the wheel stands on the dome`);
      if (rise > 0) onDome += 1;
      peak = Math.max(peak, b.position.y);
    }
    assert.ok(onDome > 0 && peak >= LAUNCH_PAD.domeHeightMetres - (offset > LAUNCH_PAD.triggerRadiusMetres ? 0.2 : 0),
      `${speed} m/s at ${offset} m: rode up the dome (peak ${peak.toFixed(3)} m)`);
  }
});

test('R16: an armed pad throws the wheel from the top of the dome, the cap counting that height', () => {
  for (const speed of [LAUNCH_PAD.minimumLaunchSpeed, 10, 20]) {
    const rider = make({ pads: DOME, armed: true });
    start(rider, speed);
    let takeoffY = Number.NaN, climbed = 0, lastY = 0;
    for (let step = 0; step < 900 && Number.isNaN(takeoffY); step += 1) {
      rider.step(STEP, actions({ throttle: holdTo(rider, speed) }));
      const y = rider.snapshot().position.y;
      if (!rider.padLaunched && y > lastY) climbed += 1;
      lastY = y;
      if (rider.padLaunched) takeoffY = y;
    }
    assert.ok(takeoffY >= LAUNCH_PAD.domeHeightMetres - 1e-9
      && takeoffY <= LAUNCH_PAD.domeHeightMetres + LAUNCH_PAD.domeCrownMetres, `${speed} m/s: left the top at ${takeoffY}`);
    assert.ok(climbed >= 1, `${speed} m/s: rode up the skirt first (${climbed} rising steps)`);
  }
});

test('R16: a hop that comes down on the dome lands on it, never through it; hidden, the same hop lands on the lawn', () => {
  for (const shown of [true, false]) {
    const rider = make({ pads: DOME, shown });
    start(rider, 6);
    let hopped = false, landedY = Number.NaN, landedRise = Number.NaN, minAbove = Infinity;
    for (let step = 0; step < 900 && Number.isNaN(landedY); step += 1) {
      const snap = rider.snapshot();
      const hop = !hopped && snap.position.z >= PAD_Z - 4.2 && rider.canAcceptHop;
      if (hop) hopped = true;
      rider.step(STEP, actions({ throttle: snap.grounded ? holdTo(rider, 6) : 0, hop }));
      const at = rider.snapshot().position;
      const rise = shown ? DOME.riseAt(at.x, at.z) : 0;
      minAbove = Math.min(minAbove, at.y - rise);
      if (hopped && rider.touchedDown) { landedY = at.y; landedRise = rise; }
    }
    assert.ok(hopped && Number.isFinite(landedY), 'the hop landed');
    assert.equal(landedY, landedRise, shown ? 'on the dome' : 'on the lawn');
    if (shown) assert.ok(landedRise > 0, 'the hop came down on the drawn dome (the case is not vacuous)');
    assert.ok(minAbove >= -1e-9, `never below the ride surface (${minAbove})`);
  }
});

test('R16: hiding the pad takes the dome away (the wheel follows on its next step); drawing it raises it again', () => {
  const rider = make({ pads: DOME, shown: true });
  start(rider, 0, 0, PAD_Z);
  for (let step = 0; step < 10; step += 1) rider.step(STEP, actions());
  assert.ok(Math.abs(rider.snapshot().position.y - (LAUNCH_PAD.domeHeightMetres + LAUNCH_PAD.domeCrownMetres)) < 1e-9,
    'standing on the crown');
  assert.equal(rider.launchPadShown, true);
  rider.setLaunchPadsShown(false);
  assert.equal(rider.launchPadShown, false);
  rider.step(STEP, actions());
  assert.equal(rider.snapshot().position.y, 0, 'hidden: the lawn');
  rider.setLaunchPadsShown(true);
  rider.step(STEP, actions());
  assert.ok(rider.snapshot().position.y > LAUNCH_PAD.domeHeightMetres, 'drawn again: the dome');
});

// ---------------------------------------------------------------------------
// (f) The takeoff facts and the trick observer
// ---------------------------------------------------------------------------

test('(f) a pad takeoff is a flight, not a hop: tookOff, flightIndex + 1, hopped false, no charged hop', () => {
  const rider = make({ pads: new LaunchPadField([PAD]), armed: true });
  start(rider, 10);
  const before = rider.flightIndex;
  let launchStep = -1;
  for (let step = 0; step < 400 && launchStep < 0; step += 1) {
    rider.step(STEP, actions({ throttle: holdTo(rider, 10) }));
    if (rider.padLaunched) launchStep = step;
  }
  assert.ok(launchStep >= 0);
  assert.equal(rider.tookOff, true);
  assert.equal(rider.hopped, false);
  assert.equal(rider.flightIndex, before + 1);
  assert.ok(rider.verticalRate > 0, 'rising off the pad');
  assert.ok(rider.canAcceptSpin, 'a 180 can be armed on the first airborne step');
  rider.step(STEP, actions());
  assert.equal(rider.padLaunched, false, 'one step only');
  assert.equal(rider.tookOff, false);
});

test('(f) the observer credits a pad 180 (Hop tapped on the first rising step), and no charged hop', () => {
  // The G1 inputs: Hop tapped (with a steer to pick the way round) on the
  // first airborne step, while rising. Crouch is never held, so no charge.
  const rider = make({ pads: new LaunchPadField([PAD]), armed: true });
  const observer = new TrickObserver();
  start(rider, 10);
  let tapped = false;
  const events: string[] = [];
  for (let step = 0; step < 600; step += 1) {
    const snap = rider.snapshot();
    const spin = !tapped && !snap.grounded && rider.canAcceptSpin;
    if (spin) tapped = true;
    rider.step(STEP, actions({ throttle: snap.grounded && !tapped ? holdTo(rider, 10) : 0, hop: spin, steer: spin ? -1 : 0 }));
    const facts = createTrickFacts();
    Object.assign(facts, { flightIndex: rider.flightIndex, tookOff: rider.tookOff, hopped: rider.hopped,
      hopCharge: rider.hopped ? rider.lastHopCharge : 0, spinCompleted: rider.spinCompleted,
      oneFootQualified: false, touchedDown: rider.touchedDown, landingQuality: rider.lastLandingQuality,
      crashed: rider.crashed });
    for (const event of observer.step(STEP, facts)) events.push(event.kind);
  }
  assert.ok(tapped);
  assert.deepEqual(events, ['spin-landed']);
  assert.equal(observer.tally.chargedHops, 0);
  assert.equal(observer.tally.spinsLanded, 1);
  assert.equal(rider.snapshot().crashed, false);
});

// ---------------------------------------------------------------------------
// (g) The cop never launches
// ---------------------------------------------------------------------------

test('(g) a controller built without the field (the cop) never launches, armed or not', () => {
  const cop = make({ pads: 'none' });
  cop.setLaunchPadsArmed(true);
  assert.equal(cop.launchPadCount, 0);
  start(cop, 12);
  for (let step = 0; step < 400; step += 1) {
    cop.step(STEP, actions({ throttle: holdTo(cop, 12) }));
    assert.equal(cop.tookOff, false);
  }
  assert.ok(cop.snapshot().position.z > PAD_Z + 5, 'it rode straight over where the pad would be');
});

// ---------------------------------------------------------------------------
// (h) Transaction parity
// ---------------------------------------------------------------------------

test('(h) prepare/resolve/commit equals a direct step through a pad launch, flight and landing', () => {
  const pads = new LaunchPadField([PAD]);
  const direct = make({ pads, armed: true, world: CLEAR });
  const transactional = make({ pads, armed: true, world: CLEAR });
  start(direct, 9); start(transactional, 9);
  let launched = false, landed = false;
  for (let tick = 0; tick < 420; tick += 1) {
    const input = actions({ throttle: holdTo(direct, 9) });
    direct.step(STEP, input);
    const token = transactional.prepareStep(STEP, input);
    transactional.resolvePreparedStep(token, CLEAR);
    transactional.commitPreparedStep(token);
    assert.deepEqual(physicalState(transactional), physicalState(direct), `full state at tick ${tick}`);
    assert.equal(transactional.padLaunched, direct.padLaunched);
    launched ||= direct.padLaunched;
    landed ||= launched && direct.touchedDown;
  }
  assert.ok(launched && landed, 'the replay exercises the launch and the landing');
});

test('(h) a move dynamically blocked short of the trigger does not launch on the final replay', () => {
  const pads = new LaunchPadField([PAD]);
  const live = make({ pads, armed: true, world: CLEAR });
  const neutral = make({ pads, armed: true, world: CLEAR });
  start(live, 10); start(neutral, 10);
  // Ride both in lockstep (re-armed on the way), coasting, until the next
  // step enters the trigger: a step is only taken while it cannot.
  const gap = (): number => Math.hypot(live.snapshot().position.x - PAD.x, live.snapshot().position.z - PAD.z)
    - PAD.triggerRadius;
  let guard = 0;
  while (gap() > live.snapshot().speed * STEP && guard < 1000) {
    live.step(STEP, actions()); neutral.step(STEP, actions());
    guard += 1;
  }
  assert.ok(gap() > 0 && gap() <= live.snapshot().speed * STEP, `one step short (${gap().toFixed(3)} m)`);
  assert.deepEqual(physicalState(live), physicalState(neutral));
  neutral.step(STEP, actions({ throttle: 1 }));
  assert.equal(neutral.padLaunched, true, 'the unblocked step launches');
  const token = live.prepareStep(STEP, actions({ throttle: 1 }));
  live.resolvePreparedStep(token, { hull: HULL, resolveMotion: () => blocked(0) });
  live.commitPreparedStep(token);
  assert.equal(live.padLaunched, false);
  assert.equal(live.tookOff, false);
  assert.equal(live.isGrounded, true);
});

test('(h) arming during an open prepared step refuses that step\'s replay; re-applying the same mode does not', () => {
  const pads = new LaunchPadField([PAD]);
  const live = make({ pads, world: CLEAR });
  start(live, 10);
  const token = live.prepareStep(STEP, actions({ throttle: 1 }));
  live.setLaunchPadsArmed(false);
  live.setLaunchPadVerticalSpeed(LAUNCH_PAD.verticalSpeed);
  live.resolvePreparedStep(token, CLEAR);
  live.commitPreparedStep(token);
  const stale = live.prepareStep(STEP, actions({ throttle: 1 }));
  live.setLaunchPadsArmed(true);
  assert.throws(() => live.resolvePreparedStep(stale, CLEAR), /stale/);
  const lift = live.prepareStep(STEP, actions({ throttle: 1 }));
  live.setLaunchPadVerticalSpeed(LAUNCH_PAD.verticalSpeed + 0.5);
  assert.throws(() => live.resolvePreparedStep(lift, CLEAR), /stale/);
});

// ---------------------------------------------------------------------------
// (i) No relaunch after a crash recovery
// ---------------------------------------------------------------------------

test('(i) a crash after a pad flight at 12, 20 and 29 m/s, then auto-recovery with no input: no second launch', () => {
  for (const speed of [12, 20, 29]) {
    // A wall across the landing zone: the flight ends in an obstacle crash,
    // the recovery restores 0.35 × the crash speed at the last safe point —
    // just short of the footprint, aimed at the pad.
    const rider = make({ pads: new LaunchPadField([PAD]), armed: true, sampler: flat(PAD_Z + 6),
      tuning: { crashRecoverAutoSeconds: 0.5 } });
    start(rider, speed);
    let launches = 0, crashes = 0, recoveries = 0, wasCrashed = false, launchedFirst = false;
    for (let step = 0; step < 12 * SIMULATION.hz; step += 1) {
      rider.step(STEP, actions({ throttle: launchedFirst ? 0 : holdTo(rider, speed) }));
      if (rider.padLaunched) { launches += 1; launchedFirst = true; }
      if (rider.crashed && !wasCrashed) crashes += 1;
      if (!rider.crashed && wasCrashed) recoveries += 1;
      wasCrashed = rider.crashed;
    }
    assert.equal(launches, 1, `${speed} m/s: exactly the one launch`);
    assert.ok(crashes >= 1 && recoveries >= 1, `${speed} m/s: crashed (${crashes}) and recovered (${recoveries})`);
  }
});

test('(i) after a recovery a hands-off coast never re-arms; ridden ground does', () => {
  // Near top speed tilt-back stops safe points, so the recovery returns to
  // the reset point 18.6 m short of the trigger, aimed at it: the shape the
  // 29 m/s case above produces. Hands off: never thrown. Riding: armed again
  // 8 m after the rider takes over.
  for (const ride of [false, true]) {
    const rider = make({ pads: new LaunchPadField([PAD]), armed: true,
      tuning: { crashRecoverAutoSeconds: 0.3, crashRecoverEarliestSeconds: 99 } });
    start(rider, 20);
    rider.hardKnock(1, 0);
    let recovered = false, launches = 0, restored = 0;
    for (let step = 0; step < 8 * SIMULATION.hz; step += 1) {
      // Riding is a held stick: always some throttle, more below 8 m/s.
      const held = Math.min(1, Math.max(0.1, (8 - rider.snapshot().speed) * 0.5 + 0.1));
      rider.step(STEP, actions({ throttle: recovered && ride ? held : 0 }));
      if (!recovered && !rider.crashed) restored = rider.snapshot().speed;
      recovered ||= !rider.crashed;
      if (rider.padLaunched) launches += 1;
    }
    assert.ok(recovered);
    assert.ok(restored > LAUNCH_PAD.minimumLaunchSpeed + 1, `the recovery restored ${restored.toFixed(2)} m/s, enough to fly`);
    assert.ok(rider.snapshot().position.z > PAD_Z + 2, 'it went past the pad either way');
    assert.equal(launches, ride ? 1 : 0, ride ? 'riding it re-arms' : 'a hands-off coast never re-arms');
  }
});

test('the re-arm distance counts ground ridden outside every footprint after a reset', () => {
  const pads = new LaunchPadField([PAD]);
  // Reset 5 m short of the trigger: less than the 8 m re-arm, so this pass is inert.
  const near = make({ pads, armed: true });
  start(near, 10, 0, PAD_Z - LAUNCH_PAD.triggerRadiusMetres - 5);
  let nearLaunches = 0;
  for (let step = 0; step < 240; step += 1) {
    near.step(STEP, actions({ throttle: holdTo(near, 10) }));
    if (near.padLaunched) nearLaunches += 1;
  }
  assert.equal(nearLaunches, 0);
  // From 9 m short it is armed by the time it gets there.
  const far = make({ pads, armed: true });
  start(far, 10, 0, PAD_Z - LAUNCH_PAD.triggerRadiusMetres - LAUNCH_PAD.rearmMetres - 1);
  let farLaunches = 0;
  for (let step = 0; step < 240; step += 1) {
    far.step(STEP, actions({ throttle: holdTo(far, 10) }));
    if (far.padLaunched) farLaunches += 1;
  }
  assert.equal(farLaunches, 1);
});

test('the per-pad flight cap: full lift when slow, capped by speed and drop, never a floor', () => {
  const g = make().tuning.gravity;
  const reach = LAUNCH_PAD.maximumFlightMetres;
  for (const [speed, drop] of [[6, 0], [20, 0], [29, 0], [29, 0.6], [37.8, 0.6]] as const) {
    const rider = make({ pads: new LaunchPadField([{ ...PAD, dropMetres: drop }]), armed: true });
    start(rider, speed);
    let vz = Number.NaN;
    for (let step = 0; step < 1200 && Number.isNaN(vz); step += 1) {
      rider.step(STEP, actions({ throttle: holdTo(rider, speed) }));
      if (rider.padLaunched) vz = rider.verticalRate;
    }
    assert.ok(Number.isFinite(vz), `${speed} m/s launched`);
    // The getter reads after this step's gravity has not yet acted: the
    // takeoff vertical speed itself. R16: the wheel leaves the dome's top, so
    // Δh is the site's drop plus that height over the (flat, 0 m) test lawn.
    const v = rider.snapshot().speed;
    const top = rider.snapshot().position.y;
    assert.ok(top >= LAUNCH_PAD.domeHeightMetres - 1e-9, `${speed} m/s: from the dome's top (${top})`);
    const expected = Math.min(LAUNCH_PAD.verticalSpeed, (g * reach) / (2 * v) - ((drop + top) * v) / reach);
    assert.ok(Math.abs(vz - expected) < 1e-9, `${speed} m/s, drop ${drop}: vz ${vz} vs ${expected}`);
  }
});
