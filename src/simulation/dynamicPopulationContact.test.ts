/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { HazardField } from './hazards.ts';
import {
  EucController,
  createPose,
  type EucDynamicMotionRequest,
  type EucDynamicMotionResult,
  type EucDynamicWorld,
  type EucPlacementRequest,
  type EucTuning,
} from './EucController.ts';
import type { GroundSample, TerrainSampler } from './world.ts';

const STEP = 1 / SIMULATION.hz;
const HULL = { halfWidthMetres: 0.25, halfLengthMetres: 0.3, heightMetres: 1.7 };
const ORIGIN = { position: { x: 0, y: 0, z: 0 }, headingY: 0 };

function actions(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

function terrain(options: {
  height?: (x: number, z: number) => number;
  grade?: number;
  obstacle?: NonNullable<TerrainSampler['raycastObstacle']>;
} = {}): TerrainSampler {
  const grade = options.grade ?? 0;
  const normalLength = Math.hypot(1, grade);
  return {
    sampleGround(x: number, z: number, out: GroundSample): GroundSample {
      out.height = options.height ? options.height(x, z) : grade * z;
      out.normal.x = 0; out.normal.y = 1 / normalLength; out.normal.z = -grade / normalLength;
      out.surface = z > 1 ? 'roughPavement' : 'pavement';
      out.offCourse = false;
      return out;
    },
    raycast: () => null,
    raycastObstacle: options.obstacle,
  };
}

function controller(options: {
  sampler?: TerrainSampler;
  world?: EucDynamicWorld;
  tuning?: Partial<EucTuning>;
  hazards?: HazardField;
  heading?: number;
} = {}): EucController {
  return new EucController(options.sampler ?? terrain(), {
    spawn: { ...ORIGIN, headingY: options.heading ?? 0 },
    tuning: { cutoutEnabled: 0, wobbleMasterGain: 0, ...options.tuning },
    dynamicWorld: options.world,
    hazards: options.hazards,
  });
}

function blocked(fraction = 0, closingSpeed = 0, chargeImpact = false): EucDynamicMotionResult {
  return { allowedMoveFraction: fraction, normalX: 0, normalZ: -1,
    closingSpeedMetresPerSecond: closingSpeed, chargeImpact };
}

/** Independent slab fixture: a sweep must stop its leading face at this plane. */
function fence(limitZ: number, chargeImpact = true): EucDynamicWorld {
  return { hull: HULL, resolveMotion(request) {
    const displacement = request.proposed.z - request.previous.z;
    if (displacement <= 0 || request.proposed.z < limitZ) return null;
    return { allowedMoveFraction: Math.max(0, (limitZ - request.previous.z) / displacement),
      normalX: 0, normalZ: -1,
      closingSpeedMetresPerSecond: displacement / request.dt, chargeImpact };
  } };
}

function assertPoseEqual(a: EucController, b: EucController): void {
  const poseA = createPose(), poseB = createPose();
  a.writePose(poseA); b.writePose(poseB);
  assert.deepEqual(poseA, poseB, 'every presented scalar and ragdoll particle agrees');
}

test('absent and clear dynamic ports produce identical rides, crashes, recovery and ragdolls', () => {
  const obstacle: NonNullable<TerrainSampler['raycastObstacle']> = (origin, direction, maximum,
    _width, _lateral, out) => {
    if (direction.z <= 0 || origin.z >= 3) return null;
    const distance = (3 - origin.z) * Math.hypot(direction.x, direction.y, direction.z) / direction.z;
    if (distance > maximum) return null;
    if (out) { out.distance = distance; out.halfExtentX = 4; out.halfExtentZ = 4; }
    return distance;
  };
  const plain = controller({ sampler: terrain({ grade: 0.08, obstacle }) });
  const clear = controller({ sampler: terrain({ grade: 0.08, obstacle }),
    world: { hull: HULL, resolveMotion: () => null, canPlace: () => true } });
  plain.reset(undefined, 8); clear.reset(undefined, 8);
  let sawAir = false, sawBlock = false, sawCrash = false, sawRecovery = false;
  for (let index = 0; index < 1100; index += 1) {
    const input = actions({ throttle: index % 300 < 220 ? 1 : -0.4,
      steer: index % 180 < 90 ? 0.2 : -0.2, hop: index === 1 || index === 800,
      crouch: index > 780 && index < 800 });
    if (index === 750) { plain.hardKnock(1, 0); clear.hardKnock(1, 0); }
    plain.step(STEP, input); clear.step(STEP, input);
    const state = plain.snapshot();
    assert.deepEqual(clear.snapshot(), state, `no-contact physical parity at step ${index}`);
    assertPoseEqual(plain, clear);
    assert.equal(clear.discontinuitySerial, plain.discontinuitySerial);
    sawAir ||= !state.grounded;
    sawBlock ||= state.blocked;
    sawCrash ||= state.crashed;
    sawRecovery ||= state.invulnerable > 0;
  }
  assert.ok(sawAir && sawBlock && sawCrash && sawRecovery, 'the parity replay exercised each branch');
});

test('a swept obstacle clips a tunnelling move before distance, wheel travel and crash facts publish', () => {
  const limit = 0.4;
  const clear = controller(), hit = controller({ world: fence(limit) });
  clear.reset(undefined, 20); hit.reset(undefined, 20);
  clear.step(0.1, actions()); hit.step(0.1, actions());
  const expected = clear.snapshot(), actual = hit.snapshot();
  assert.ok(expected.position.z > limit + HULL.halfLengthMetres, 'negative control crosses the entire hull');
  assert.ok(Math.abs(actual.position.z - limit) < 1e-12);
  assert.ok(Math.abs(actual.distanceTravelled - limit) < 1e-12, 'no rejected travel was counted');
  assert.ok(Math.abs(actual.wheelSpin - limit / hit.tuning.wheelRadius) < 1e-12);
  assert.equal(actual.blocked, true);
  assert.ok(actual.collisionImpact >= hit.tuning.obstacleCrashSpeed);
  assert.equal(actual.crashed, true);
  assert.equal(actual.crashCause, 'obstacle', 'population never borrows paddle struck attribution');
  assert.equal(actual.crashes, 1);
  const intent = hit.dynamicMotionIntent;
  assert.ok(intent && intent.proposed.z === expected.position.z, 'final population sees the original reachable intent');
  assert.equal(intent.previous.z, 0);
  assert.equal(intent.proposed.minY, 0);
  assert.equal(intent.proposed.maxY, HULL.heightMetres);
  const detached = hit.dynamicMotionIntent!;
  (detached.proposed as { x: number }).x = 900;
  assert.equal(hit.dynamicMotionIntent!.proposed.x, 0, 'published intent is a detached plain snapshot');
});

test('clipped ground, hazards and safe recovery positions use the accepted move', () => {
  const sampler = terrain({ grade: 0.1 });
  const reference = controller({ sampler, tuning: { crashSafeDelaySeconds: 0 } });
  reference.reset(undefined, 2); reference.step(0.1, actions());
  const destination = reference.snapshot().position.z;
  assert.ok(destination > 0, 'the control actually travelled');
  assert.equal(reference.snapshot().safePosition.z, destination, 'control proves the safe-position gate is reachable');
  const hazards = new HazardField([{ id: 'unreached', kind: 'potholeDeep',
    centre: { x: 0, y: 0, z: destination }, radius: destination / 10 }]);
  const hazardControl = controller({ sampler: terrain({ grade: 0.1 }), hazards,
    tuning: { hazardCrashSpeed: 0.5, wobbleMasterGain: 1 } });
  hazardControl.reset(undefined, 2); hazardControl.step(0.1, actions());
  assert.equal(hazardControl.snapshot().crashCause, 'hazard', 'control proves the unreached hazard is live');
  const hit = controller({ sampler: terrain({ grade: 0.1 }), hazards,
    tuning: { crashSafeDelaySeconds: 0, hazardCrashSpeed: 0.5, wobbleMasterGain: 1 },
    world: { hull: HULL, resolveMotion: () => blocked(0.25) } });
  hit.reset(undefined, 2); hit.step(0.1, actions());
  const actual = hit.snapshot();
  assert.ok(Math.abs(actual.position.z - destination / 4) < 1e-12);
  assert.ok(Math.abs(actual.position.y - actual.position.z * 0.1) < 1e-12, 'ground is sampled at accepted XZ');
  assert.equal(actual.surface, 'pavement');
  assert.equal(actual.wobbleEnergy, 0, 'the unreached hazard did not inject an entry impulse');
  assert.equal(actual.crashed, false);
  assert.equal(actual.safePosition.z, 0, 'a blocked move cannot become a recovery destination');
  assert.ok(Math.abs(actual.distanceTravelled - actual.position.z) < 1e-12);
});

test('reverse travel is clipped along the real request and keeps signed tyre travel', () => {
  let request: EucDynamicMotionRequest | null = null;
  const hit = controller();
  for (let index = 0; index < 240 && hit.snapshot().speed > -1; index += 1) {
    hit.step(STEP, actions({ throttle: -1 }));
  }
  assert.ok(hit.snapshot().reversing && hit.snapshot().speed <= -1, 'the real reverse gate was crossed');
  const before = hit.snapshot();
  hit.setDynamicWorld({ hull: HULL, resolveMotion(value) { request = value; return blocked(0.3); } });
  hit.step(0.1, actions({ throttle: -1 }));
  const actual = hit.snapshot(), intent = request as EucDynamicMotionRequest | null;
  assert.ok(intent && intent.proposed.z < 0 && intent.proposed.velocityZ < 0);
  assert.ok(Math.abs(actual.position.z - before.position.z - (intent.proposed.z - before.position.z) * 0.3) < 1e-12);
  assert.ok(actual.wheelSpin < 0);
  assert.ok(actual.distanceTravelled > 0);
  assert.ok(actual.speed <= 0, 'blocking never turns a reverse ride into forward travel');
});

test('blocked yaw follows the allowed oriented sweep instead of completing the rejected turn', () => {
  const clear = controller(), hit = controller({ world: { hull: HULL, resolveMotion: () => blocked(0.25) } });
  clear.reset(undefined, 4); hit.reset(undefined, 4);
  const input = actions({ steer: 0.6 });
  clear.step(0.1, input); hit.step(0.1, input);
  assert.ok(Math.abs(clear.snapshot().headingY) > 0, 'negative control completed a real turn');
  assert.ok(Math.abs(hit.snapshot().headingY - clear.snapshot().headingY * 0.25) < 1e-12);
  assert.ok(Math.abs(hit.snapshot().yawRate - clear.snapshot().yawRate * 0.25) < 1e-12);
});

test('pair cooldown suppresses impact charge while its collider continues to block', () => {
  const hit = controller({ world: { hull: HULL, resolveMotion: () => blocked(0, 30, false) } });
  hit.reset(undefined, 10);
  for (let index = 0; index < 20; index += 1) hit.step(STEP, actions({ throttle: 1 }));
  const actual = hit.snapshot();
  assert.equal(actual.position.z, 0);
  assert.equal(actual.distanceTravelled, 0);
  assert.equal(actual.blocked, true);
  assert.equal(actual.collisionImpact, 0);
  assert.equal(actual.crashes, 0);
});

test('a moving obstacle can hit a stationary rider and omitted chargeImpact defaults to true', () => {
  const hit = controller({ world: { hull: HULL, resolveMotion: () => ({
    allowedMoveFraction: 0, normalX: 1, normalZ: 0, closingSpeedMetresPerSecond: 8,
  }) } });
  hit.step(STEP, actions());
  const actual = hit.snapshot();
  assert.equal(actual.position.z, 0);
  assert.equal(actual.distanceTravelled, 0);
  assert.equal(actual.blocked, true);
  assert.equal(actual.collisionImpact, 8);
  assert.equal(actual.crashCause, 'obstacle');
  assert.equal(actual.crashes, 1);
});

test('dynamic obstacle side falls follow the outward contact normal with obstacle attribution', () => {
  for (const normalX of [-1, 1]) {
    const hit = controller({ world: { hull: HULL, resolveMotion: () => ({
      allowedMoveFraction: 0, normalX, normalZ: 0, closingSpeedMetresPerSecond: 8,
    }) } });
    hit.step(STEP, actions());
    hit.step(0.1, actions());
    const pose = createPose(); hit.writePose(pose);
    assert.equal(hit.snapshot().crashCause, 'obstacle');
    assert.equal(Math.sign(pose.crashLateral), normalX, 'recoverable presentation moves out of the collider');
    assert.equal(hit.snapshot().crashes, 1, 'a crash wheel contact does not charge a second crash');
  }
});

test('static axis resolution precedes the population preview and retains its chosen tangent', () => {
  const obstacle: NonNullable<TerrainSampler['raycastObstacle']> = (origin, direction, maximum,
    _width, _lateral, out) => {
    // A broad box begins at (0.1, 0.1): diagonal travel hits it, either axis misses it.
    if (direction.x <= 0 || direction.z <= 0) return null;
    const entry = Math.max((0.1 - origin.x) / direction.x, (0.1 - origin.z) / direction.z);
    const distance = entry * Math.hypot(direction.x, direction.y, direction.z);
    if (entry < 0 || distance > maximum) return null;
    if (out) { out.distance = distance; out.halfExtentX = 1; out.halfExtentZ = 1; }
    return distance;
  };
  const hit = controller({ sampler: terrain({ obstacle }), heading: Math.PI / 4,
    tuning: { wallStandoff: 0 }, world: { hull: HULL, resolveMotion: () => blocked(0.5) } });
  hit.reset(undefined, 2); hit.step(0.1, actions());
  const intent = hit.dynamicMotionIntent;
  assert.ok(intent && intent.proposed.x > 0);
  assert.equal(intent.proposed.z, 0, 'the unreachable diagonal never reached the dynamic resolver');
  assert.ok(Math.abs(hit.snapshot().position.x - intent.proposed.x * 0.5) < 1e-12);
  assert.equal(hit.snapshot().position.z, 0);
});

test('a dynamic clip cannot legalize an intermediate terrain step or charge its unreached actor', () => {
  const sampler = () => terrain({ height: (_x, z) => z > 0.06 && z < 0.15 ? 1 : 0 });
  const control = controller({ sampler: sampler() });
  control.reset(undefined, 2); control.step(0.1, actions());
  assert.ok(control.snapshot().position.z > 0.15, 'the original endpoint is beyond the intermediate ledge');
  const hit = controller({ sampler: sampler(), world: { hull: HULL,
    resolveMotion: () => blocked(0.5, 20, true) } });
  hit.reset(undefined, 2); hit.step(0.1, actions());
  const actual = hit.snapshot();
  assert.equal(actual.position.z, 0);
  assert.equal(actual.position.y, 0);
  assert.equal(actual.distanceTravelled, 0);
  assert.equal(actual.blocked, true);
  assert.equal(actual.crashed, false, 'an unreachable population contact did not charge a crash');
  assert.equal(actual.collisionImpact, 0);
  assert.equal(hit.dynamicMotionIntent, null, 'one final shared query must not consume the rejected contact');
});

test('static standoff cannot push through a dynamic body and does not replace the main intent', () => {
  const obstacle: NonNullable<TerrainSampler['raycastObstacle']> = (_origin, direction) => direction.x < 0 ? 0.05 : null;
  const hit = controller({ sampler: terrain({ obstacle }), tuning: { wallStandoff: 0.2, wallStandoffRate: 1 },
    world: { hull: HULL, resolveMotion: (request) => request.kind === 'standoff' ? blocked() : null } });
  hit.step(0.1, actions());
  assert.equal(hit.snapshot().position.x, 0);
  assert.equal(hit.snapshot().blocked, true);
  assert.equal(hit.dynamicMotionIntent!.kind, 'move');
  assert.equal(hit.dynamicMotionIntent!.proposed.x, 0);
});

test('a clipped standoff rechecks its own ground and refuses an intermediate drop', () => {
  const obstacle: NonNullable<TerrainSampler['raycastObstacle']> = (_origin, direction) => direction.x < 0 ? 0.05 : null;
  const sampler = () => terrain({ obstacle, height: (x) => x > 0.04 && x < 0.06 ? -1 : 0 });
  const control = controller({ sampler: sampler(), tuning: { wallStandoff: 0.2, wallStandoffRate: 1 } });
  control.step(0.1, actions());
  assert.equal(control.snapshot().position.x, 0.1, 'control proves the complete correction has legal ground');
  const hit = controller({ sampler: sampler(), tuning: { wallStandoff: 0.2, wallStandoffRate: 1 },
    world: { hull: HULL, resolveMotion: (request) => request.kind === 'standoff' ? blocked(0.5) : null } });
  hit.step(0.1, actions());
  assert.equal(hit.snapshot().position.x, 0);
  assert.equal(hit.snapshot().position.y, 0);
  assert.equal(hit.snapshot().grounded, true);
});

test('airborne prisms carry actual wheel-base heights and a dynamic side stop is never standable ground', () => {
  let previousY = 0, airQueries = 0, sawTakeoff = false, sawLanding = false;
  const hit = controller({ world: { hull: HULL, resolveMotion(request) {
    assert.equal(request.previous.minY, previousY, 'the sweep begins at the real prior wheel base');
    assert.ok(Math.abs(request.previous.maxY - request.previous.minY - HULL.heightMetres) < 1e-12);
    if (!request.airborne) return null;
    airQueries += 1;
    assert.ok(Math.abs(request.proposed.maxY - request.proposed.minY - HULL.heightMetres) < 1e-12);
    return blocked();
  } } });
  hit.reset(undefined, 2);
  for (let index = 0; index < 160; index += 1) {
    previousY = hit.snapshot().position.y;
    hit.step(STEP, actions({ hop: index === 0 }));
    sawTakeoff ||= hit.tookOff;
    sawLanding ||= hit.touchedDown;
  }
  const actual = hit.snapshot();
  assert.ok(airQueries > 10 && sawTakeoff && sawLanding, 'a complete real flight was exercised');
  assert.equal(actual.position.y, 0, 'touchdown remains the sampled terrain, never a vehicle roof');
  assert.equal(actual.grounded, true);
  assert.equal(actual.hops, 1);
  assert.equal(actual.crashes, 0);
});

test('blocked airborne spin retains its remaining sweep and cannot report a completed 180', () => {
  let blockAir = false;
  const hit = controller({ world: { hull: HULL, resolveMotion: (request) => blockAir && request.airborne ? blocked() : null } });
  hit.step(STEP, actions({ hop: true }));
  for (let index = 0; index < 40 && !hit.snapshot().grounded; index += 1) hit.step(STEP, actions());
  // Compression precedes flight; wait on the physical edge rather than a guessed tick.
  for (let index = 0; index < 40 && hit.snapshot().grounded; index += 1) hit.step(STEP, actions());
  assert.equal(hit.snapshot().grounded, false, 'fixture reached its ascent');
  const before = hit.snapshot().headingY;
  blockAir = true;
  hit.step(STEP, actions({ hop: true }));
  assert.equal(hit.snapshot().spinning, true, 'second press armed the spin');
  for (let index = 0; index < 20; index += 1) {
    hit.step(STEP, actions());
    assert.equal(hit.spinCompleted, false, 'an undelivered sweep cannot become trick credit');
    assert.equal(hit.snapshot().headingY, before);
  }
});

test('constructor and reset placement gates receive true sampled height and blocked reset is atomic', () => {
  const requests: EucPlacementRequest[] = [];
  const committed: EucPlacementRequest[] = [];
  let allow = true;
  const hit = controller({ sampler: terrain({ grade: 0.1 }), world: { hull: HULL,
    canPlace(request) { requests.push(request); return allow; },
    didPlace(request) { committed.push(request); } } });
  assert.equal(requests[0]!.reason, 'construct');
  assert.equal(hit.discontinuitySerial, 1);
  assert.deepEqual(committed[0], requests[0], 'construct notification is the exact committed preview');
  hit.reset(undefined, 2); hit.step(STEP, actions());
  const before = hit.snapshot(), serial = hit.discontinuitySerial;
  allow = false;
  const rejectedSpawn = { position: { x: 7, y: 99, z: 8 }, headingY: 0.4 };
  assert.equal(hit.reset(rejectedSpawn, 3), false);
  const request = requests.at(-1)!;
  assert.equal(request.reason, 'reset');
  assert.equal(request.body.minY, 0.8, 'author spawn Y never replaces the real ground sample');
  assert.equal(request.body.maxY, 0.8 + HULL.heightMetres);
  assert.equal(request.initialSpeedMetresPerSecond, 3);
  assert.deepEqual(hit.snapshot(), before);
  assert.equal(hit.discontinuitySerial, serial);
  assert.equal(hit.placementBlocked, true);
  assert.equal(committed.length, 2, 'a blocked reset creates no occupancy reservation');
  allow = true;
  assert.equal(hit.reset(), true);
  assert.equal(hit.snapshot().position.x, 0, 'a rejected spawn was not installed');
  assert.equal(hit.snapshot().position.z, 0);
  assert.equal(hit.discontinuitySerial, serial + 1);
  assert.equal(hit.placementBlocked, false);
  assert.deepEqual(committed.at(-1), requests.at(-1));
  assert.equal(committed.at(-1)!.discontinuitySerial, hit.discontinuitySerial);
  assert.equal(hit.reset(), true);
  assert.equal(hit.discontinuitySerial, serial + 2, 'zero-distance reset has an exact new identity');
});

test('blocked constructor cannot silently install an occupied live rider', () => {
  let reason: EucPlacementRequest['reason'] | undefined;
  assert.throws(() => controller({ world: { hull: HULL,
    canPlace(request) { reason = request.reason; return false; } } }), /initial placement is blocked/);
  assert.equal(reason, 'construct');
});

test('automatic recovery retries blocked placement and invulnerability never removes physical blocking', () => {
  let open = false, firstImpact = true;
  const requests: EucPlacementRequest[] = [];
  const committed: EucPlacementRequest[] = [];
  const hit = controller({ tuning: { crashRecoverAutoSeconds: 0.04, crashRecoverEarliestSeconds: 99,
    crashInvulnerableSeconds: 0.5 }, world: { hull: HULL,
    canPlace(request) { requests.push(request); return request.reason !== 'recover' || open; },
    didPlace(request) { committed.push(request); },
    resolveMotion() {
      if (!firstImpact) return blocked();
      firstImpact = false;
      return blocked(0, 8, true);
    },
  } });
  hit.step(STEP, actions());
  assert.equal(hit.snapshot().crashCause, 'obstacle');
  const serial = hit.discontinuitySerial;
  for (let index = 0; index < 12; index += 1) hit.step(STEP, actions());
  assert.equal(hit.snapshot().crashed, true);
  assert.equal(hit.placementBlocked, true);
  assert.equal(hit.discontinuitySerial, serial);
  assert.equal(committed.length, 1, 'rejected retries notify no committed recovery');
  assert.ok(requests.filter((request) => request.reason === 'recover').length >= 2, 'blocked recovery retries');
  open = true; hit.step(STEP, actions());
  assert.equal(hit.snapshot().state, 'recovering');
  assert.equal(hit.snapshot().position.z, 0);
  assert.equal(hit.discontinuitySerial, serial + 1, 'same-point recovery still invalidates old swept history');
  assert.equal(hit.placementBlocked, false);
  assert.deepEqual(committed.at(-1), requests.at(-1));
  assert.equal(committed.at(-1)!.reason, 'recover');
  assert.equal(hit.dynamicMotionIntent, null, 'no move sweep survives the recovery teleport');
  assert.ok(hit.snapshot().invulnerable > 0);
  hit.setDynamicWorld({ hull: HULL, resolveMotion: () => blocked(0, 8, true) });
  hit.step(STEP, actions({ throttle: 1 }));
  assert.equal(hit.snapshot().position.z, 0);
  assert.equal(hit.snapshot().blocked, true);
  assert.equal(hit.snapshot().collisionImpact, 8);
  assert.equal(hit.snapshot().crashed, false, 'recovery protects punishment, not motion');
  assert.equal(hit.snapshot().crashes, 1);
});

test('plain dynamic hull configuration rejects invalid dimensions before a ride is installed', () => {
  assert.throws(() => controller({ world: { hull: { ...HULL, heightMetres: Number.NaN } } }), RangeError);
  assert.throws(() => controller({ world: { hull: { ...HULL, halfWidthMetres: 0 } } }), RangeError);
});
