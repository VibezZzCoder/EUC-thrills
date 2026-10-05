/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DRUNK_STYLE } from '../data/rideStyles.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import {
  EucController, createPose, defaultEucTuning,
  type EucDynamicMotionResult, type EucDynamicWorld, type EucPlacementRequest, type EucTuning,
} from './EucController.ts';
import { HazardField } from './hazards.ts';
import { CrashRagdoll } from './ragdoll.ts';
import { NO_SOFT_BODIES } from './softBodies.ts';
import type { GroundSample, TerrainSampler } from './world.ts';

const HULL = { halfWidthMetres: 0.25, halfLengthMetres: 0.3, heightMetres: 1.7 };
const CLEAR: EucDynamicWorld = { hull: HULL, resolveMotion: () => null };

function actions(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

function terrain(options: {
  grade?: number;
  height?: (x: number, z: number) => number;
  obstacle?: TerrainSampler['raycastObstacle'];
} = {}): TerrainSampler {
  const grade = options.grade ?? 0, length = Math.hypot(1, grade);
  return {
    sampleGround(x: number, z: number, out: GroundSample): GroundSample {
      out.height = options.height?.(x, z) ?? grade * z;
      out.normal.x = 0; out.normal.y = 1 / length; out.normal.z = -grade / length;
      out.surface = z > 1 ? 'roughPavement' : 'pavement';
      out.offCourse = false;
      return out;
    },
    raycast: () => null,
    raycastObstacle: options.obstacle,
  };
}

function controller(options: {
  world?: EucDynamicWorld;
  sampler?: TerrainSampler;
  tuning?: Partial<EucTuning>;
  hazards?: HazardField;
} = {}): EucController {
  return new EucController(options.sampler ?? terrain(), {
    dynamicWorld: options.world ?? CLEAR,
    hazards: options.hazards,
    tuning: { cutoutEnabled: 0, wobbleMasterGain: 0, ...options.tuning },
  });
}

function blocked(fraction: number, closingSpeed = 0, chargeImpact = false): EucDynamicMotionResult {
  return { allowedMoveFraction: fraction, normalX: 0, normalZ: -1,
    closingSpeedMetresPerSecond: closingSpeed, chargeImpact };
}

function poseOf(subject: EucController) {
  const pose = createPose(); subject.writePose(pose); return pose;
}

/** Inspect physical internals too: snapshot omits private history and query scratch. */
function physicalState(subject: EucController) {
  const record = subject as unknown as Record<string, unknown>;
  const primitives = Object.fromEntries(Object.entries(record).filter(([key, value]) =>
    key !== 'stateRevision' && value !== null && typeof value !== 'object' && typeof value !== 'function'));
  const references = Object.fromEntries([
    'ground', 'probe', 'obstacleHit', 'standoffOrigin', 'standoffRay', 'dynamicPrevious', 'dynamicIntent', 'ragdoll',
  ].map((key) => [key, structuredClone(record[key])]));
  return { primitives, references, snapshot: subject.snapshot(), pose: poseOf(subject) };
}

test('prepare and repeated resolve leave every live physical field and ragdoll history untouched', () => {
  let queries = 0, placements = 0;
  const live = controller({ world: { hull: HULL,
    resolveMotion: () => { queries += 1; return blocked(0); },
    didPlace: () => { placements += 1; },
  } });
  live.reset(undefined, 4);
  live.hardKnock(1, 0);
  const before = physicalState(live), placedBefore = placements;
  const token = live.prepareStep(0.03, actions({ throttle: 0.8 }));
  assert.equal(queries, 0, 'neutral preparation never invokes the external collider');
  assert.deepEqual(physicalState(live), before);
  const provisional = createPose(); live.writePreparedPose(token, provisional);
  assert.notDeepEqual(provisional.ragdoll, before.pose.ragdoll, 'the private ragdoll really advanced');
  assert.ok(Object.isFrozen(token.motionRequests) && Object.isFrozen(token.motionRequests[0]!.proposed));
  assert.throws(() => { (token.motionRequests[0]!.proposed as { x: number }).x = 100; }, TypeError);
  for (const fraction of [0.25, 0.8, 0.1]) {
    live.resolvePreparedStep(token, { hull: HULL, resolveMotion: () => blocked(fraction) });
    assert.deepEqual(physicalState(live), before);
  }
  assert.equal(placements, placedBefore);
});

test('clear prepare/resolve/commit preserves direct-step pose, all private state and future history', () => {
  const ordinary = controller({ sampler: terrain({ grade: 0.06 }),
    tuning: { crashRecoverAutoSeconds: 0.2, crashRecoverEarliestSeconds: 99 } });
  const transactional = controller({ sampler: terrain({ grade: 0.06 }),
    tuning: { crashRecoverAutoSeconds: 0.2, crashRecoverEarliestSeconds: 99 } });
  ordinary.setRideStyle(DRUNK_STYLE); transactional.setRideStyle(DRUNK_STYLE);
  ordinary.reset(undefined, 5); transactional.reset(undefined, 5);
  let sawAir = false, sawCrash = false, sawRecovery = false;
  for (let tick = 0; tick < 90; tick += 1) {
    const input = actions({ throttle: tick < 50 ? 0.7 : -0.3,
      steer: tick % 12 < 6 ? 0.4 : -0.3, hop: tick === 1, crouch: tick > 70 });
    if (tick === 40) { ordinary.hardKnock(1, 0); transactional.hardKnock(1, 0); }
    ordinary.step(0.02, input);
    const token = transactional.prepareStep(0.02, input);
    transactional.resolvePreparedStep(token, CLEAR);
    transactional.commitPreparedStep(token);
    assert.deepEqual(physicalState(transactional), physicalState(ordinary), `full state at tick ${tick}`);
    sawAir ||= !ordinary.snapshot().grounded;
    sawCrash ||= ordinary.crashed;
    sawRecovery ||= ordinary.snapshot().invulnerable > 0;
  }
  assert.ok(sawAir && sawCrash && sawRecovery, 'the replay exercises flight, crash and recovery');
});

test('final replay replaces neutral hazard/crash facts and counts only accepted travel and safe points', () => {
  const negative = controller({ sampler: terrain({ grade: 0.1 }) });
  negative.reset(undefined, 2); negative.step(0.1, actions());
  const destination = negative.snapshot().position.z;
  const hazards = new HazardField([{ id: 'suffix', kind: 'potholeDeep',
    centre: { x: 0, y: 0, z: destination }, radius: destination / 10 }]);
  const make = () => controller({ sampler: terrain({ grade: 0.1 }), hazards,
    tuning: { crashSafeDelaySeconds: 0, hazardCrashSpeed: 0.5, wobbleMasterGain: 1 } });
  const live = make(), direct = make(); live.reset(undefined, 2); direct.reset(undefined, 2);
  const hazardControl = make(); hazardControl.reset(undefined, 2); hazardControl.step(0.1, actions());
  assert.equal(hazardControl.snapshot().crashCause, 'hazard', 'the neutral suffix contains a live hazard');
  const before = physicalState(live);
  const token = live.prepareStep(0.1, actions());
  const neutralPose = createPose(); live.writePreparedPose(token, neutralPose);
  assert.deepEqual(neutralPose, poseOf(hazardControl), 'the neutral working result really visits that suffix');
  live.resolvePreparedStep(token, { hull: HULL, resolveMotion: () => blocked(0.75, 10, true) });
  const finalWorld: EucDynamicWorld = { hull: HULL, resolveMotion: () => blocked(0.25) };
  live.resolvePreparedStep(token, finalWorld);
  assert.deepEqual(physicalState(live), before, 'discarded resolution did not charge the live rider');
  direct.setDynamicWorld(finalWorld); direct.step(0.1, actions());
  live.commitPreparedStep(token);
  assert.deepEqual(physicalState(live), physicalState(direct));
  const final = live.snapshot();
  assert.equal(final.crashed, false);
  assert.equal(final.wobbleEnergy, 0);
  assert.equal(final.collisionImpact, 0);
  assert.ok(Math.abs(final.position.z - destination / 4) < 1e-12);
  assert.ok(Math.abs(final.position.y - final.position.z * 0.1) < 1e-12);
  assert.equal(final.distanceTravelled, final.position.z);
  assert.equal(final.safePosition.z, 0, 'a dynamic block never becomes a safe point');
});

test('an intermediate static-prefix refusal is visible before commit and cannot charge its actor', () => {
  const live = controller({ sampler: terrain({ height: (_x, z) => z > 0.06 && z < 0.15 ? 1 : 0 }) });
  live.reset(undefined, 2);
  const token = live.prepareStep(0.1, actions());
  assert.ok(token.motionRequests[0]!.proposed.z > 0.15, 'neutral endpoint clears the intervening ledge');
  live.resolvePreparedStep(token, { hull: HULL, resolveMotion: () => blocked(0.5, 20, true) });
  assert.equal(token.resolvedMotionRequests.length, 1);
  assert.equal(token.dynamicMotionIntent, null, 'the batch can invalidate this unreachable edge before commit');
  const prepared = createPose(); live.writePreparedPose(token, prepared);
  assert.equal(prepared.z, 0);
  live.commitPreparedStep(token);
  assert.equal(live.snapshot().distanceTravelled, 0);
  assert.equal(live.snapshot().collisionImpact, 0);
  assert.equal(live.snapshot().crashed, false);
});

test('neutral candidates skip standoff; final standoff resolves separately without impact charge', () => {
  const obstacle: NonNullable<TerrainSampler['raycastObstacle']> = (_origin, direction) =>
    direction.x < 0 ? 0.05 : null;
  const live = controller({ sampler: terrain({ obstacle }),
    tuning: { wallStandoff: 0.2, wallStandoffRate: 1 } });
  const token = live.prepareStep(0.1, actions());
  const neutral = createPose(); live.writePreparedPose(token, neutral);
  assert.equal(neutral.x, 0);
  assert.deepEqual(token.motionRequests.map((request) => request.kind), ['move']);
  live.resolvePreparedStep(token, { hull: HULL,
    resolveMotion: (request) => request.kind === 'standoff' ? blocked(0.5, 20, true) : null });
  assert.deepEqual(token.resolvedMotionRequests.map((request) => request.kind), ['move', 'standoff']);
  live.commitPreparedStep(token);
  assert.equal(live.snapshot().position.x, 0.05);
  assert.equal(live.snapshot().collisionImpact, 0);
  assert.equal(live.crashed, false);
});

test('recovery placements are previewed privately, discarded safely and published after the whole batch', () => {
  let externalPreviews = 0;
  const published: EucPlacementRequest[] = [];
  const riders: EucController[] = [];
  const world: EucDynamicWorld = { hull: HULL, resolveMotion: () => null,
    canPlace: () => { externalPreviews += 1; return true; },
    didPlace: (request) => {
      if (request.reason === 'recover') assert.ok(riders.every((rider) => !rider.crashed));
      published.push(request);
    },
  };
  for (let seat = 0; seat < 2; seat += 1) {
    const rider = controller({ world,
      tuning: { crashRecoverAutoSeconds: 0.04, crashRecoverEarliestSeconds: 99 } });
    riders.push(rider); rider.hardKnock(1, 0);
  }
  published.length = 0;
  const previewCount = externalPreviews;
  const discarded = riders[0]!.prepareStep(0.05, actions());
  assert.equal(discarded.placementRequests[0]!.reason, 'recover');
  riders[0]!.resolvePreparedStep(discarded, world);
  const tokens = riders.map((rider) => rider.prepareStep(0.05, actions()));
  assert.equal(externalPreviews, previewCount + 1, 'only explicit final resolution asks the caller');
  assert.equal(published.length, 0, 'discarding a resolved placement emits no notification');
  assert.throws(() => riders[0]!.commitPreparedStep(discarded), /stale/);
  for (let seat = 0; seat < riders.length; seat += 1) riders[seat]!.resolvePreparedStep(tokens[seat]!, world);
  for (let seat = 0; seat < riders.length; seat += 1) riders[seat]!.commitPreparedStep(tokens[seat]!, false);
  assert.equal(published.length, 0);
  for (let seat = 0; seat < riders.length; seat += 1) riders[seat]!.publishPreparedPlacements(tokens[seat]!);
  assert.equal(published.length, 2);
  assert.ok(published.every((placement) => placement.reason === 'recover'));
  assert.throws(() => riders[0]!.publishPreparedPlacements(tokens[0]!), /already published/);
});

test('blocked final recovery preserves the crash and retries without a placement notification', () => {
  let notified = 0;
  const live = controller({ tuning: { crashRecoverAutoSeconds: 0.04, crashRecoverEarliestSeconds: 99 } });
  live.hardKnock(1, 0);
  const token = live.prepareStep(0.05, actions());
  const serial = live.discontinuitySerial;
  live.resolvePreparedStep(token, { hull: HULL, canPlace: () => false, didPlace: () => { notified += 1; } });
  assert.equal(token.placementBlocked, true);
  assert.equal(token.discontinuitySerial, serial);
  assert.equal(token.resolvedPlacementRequests.length, 1);
  live.commitPreparedStep(token);
  assert.equal(live.crashed, true);
  assert.equal(notified, 0);
  const retry = live.prepareStep(0.05, actions());
  live.resolvePreparedStep(retry, { hull: HULL, canPlace: () => true, didPlace: () => { notified += 1; } });
  live.commitPreparedStep(retry);
  assert.equal(live.crashed, false);
  assert.equal(notified, 1);
});

test('live mutations, superseding preparation and double/foreign commits reject tokens', () => {
  const mutations: Array<(rider: EucController) => void> = [
    (rider) => { rider.reset(); },
    (rider) => rider.setDynamicWorld(CLEAR),
    (rider) => rider.setTuning({ gravity: 8 }),
    (rider) => rider.setRideStyle(DRUNK_STYLE),
    (rider) => rider.setSurfaceResponse('pavement', { grip: 0.8 }),
    (rider) => rider.step(0.02, actions()),
    (rider) => rider.jolt(1),
    (rider) => rider.shedSpeed(1),
    (rider) => rider.separate(0.01, 0),
    (rider) => rider.softKnock(1),
    (rider) => { rider.hardKnock(1, 0); },
    (rider) => rider.bump(0.1, 0.2, 0),
    (rider) => { rider.tuning.gravity = 8; },
    (rider) => { rider.surfaces.pavement.grip = 0.8; },
  ];
  for (const mutate of mutations) {
    const rider = controller(); rider.reset(undefined, 3);
    const token = rider.prepareStep(0.02, actions()); rider.resolvePreparedStep(token, CLEAR);
    mutate(rider);
    assert.throws(() => rider.commitPreparedStep(token), /stale/);
  }
  const rider = controller(), foreign = controller();
  const first = rider.prepareStep(0.02, actions());
  assert.throws(() => rider.commitPreparedStep(first), /resolve before commit/);
  const second = rider.prepareStep(0.02, actions());
  assert.throws(() => rider.resolvePreparedStep(first, CLEAR), /stale/);
  assert.throws(() => foreign.commitPreparedStep(second), /foreign/);
  rider.resolvePreparedStep(second, CLEAR); rider.commitPreparedStep(second);
  assert.throws(() => rider.commitPreparedStep(second), /already committed/);
  const styled = controller(); styled.setRideStyle({ ...DRUNK_STYLE });
  const styleToken = styled.prepareStep(0.02, actions()); styled.resolvePreparedStep(styleToken, CLEAR);
  (styled.rideStyle as { weaveHeading: number }).weaveHeading += 0.1;
  assert.throws(() => styled.commitPreparedStep(styleToken), /stale/, 'a retained mutable style record is guarded too');
});

test('ragdoll state copy preserves storage and future Verlet motion; positions alone fail the control', () => {
  const source = new CrashRagdoll(), copy = new CrashRagdoll(), positionsOnly = new CrashRagdoll();
  const t = defaultEucTuning(), sampler = terrain();
  source.seed({ x: 0, y: 0, z: 0, headingY: 0.2, rollAngle: 0.1,
    riderPitch: 0.1, hipDrop: 0.05, speed: 5, cause: 'sideFall', intoSolid: false, side: 1 }, t, 0.02);
  source.step(0.02, 0.02, 0, 0, sampler, NO_SOFT_BODIES, t);
  const positionsStorage = copy.positions;
  copy.copyStateFrom(source);
  positionsOnly.positions.set(source.positions);
  assert.equal(copy.positions, positionsStorage);
  assert.notEqual(copy.positions, source.positions);
  for (let tick = 0; tick < 5; tick += 1) {
    const crashTime = (tick + 2) * 0.02;
    source.step(0.02, crashTime, 0, 0, sampler, NO_SOFT_BODIES, t);
    copy.step(0.02, crashTime, 0, 0, sampler, NO_SOFT_BODIES, t);
    positionsOnly.step(0.02, crashTime, 0, 0, sampler, NO_SOFT_BODIES, t);
    assert.deepEqual(copy.positions, source.positions);
  }
  assert.notDeepEqual(positionsOnly.positions, source.positions, 'missing previous positions changes the next trajectory');
});
