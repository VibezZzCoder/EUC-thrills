/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CINEMATIC_CAMERA, SIMULATION } from '../data/tuning.ts';
import { createChaseCameraView, type ChaseCameraView, type OcclusionProbe } from './chaseCamera.ts';
import {
  CAMERA_VIEW_CYCLE,
  CAMERA_VIEW_LABELS,
  CINEMATIC_PROFILES,
  DEFAULT_CAMERA_VIEW,
  isCameraViewId,
  isCinematicView,
  nextCameraView,
  type CameraViewId,
  type CinematicViewId,
} from './cameraPresets.ts';
import {
  CinematicCamera,
  applyCameraBlend,
  beginCameraBlend,
  cameraBlendWeight,
  createCameraBlend,
  createCinematicInput,
  createCinematicState,
  lerpCinematicState,
  resolveCinematicView,
  stepCameraBlend,
  type CinematicInput,
} from './cinematicCamera.ts';

/**
 * The rider-relative views, headlessly — 1.3.0 (`docs/PLANS.md` §50).
 *
 * As `chaseCamera.test.ts` warns, which way is *left* cannot be trusted from
 * a world-space assertion; the side a view falls on is judged in the browser
 * and in the pictures. Everything here is frame-independent: order, units,
 * invariance, continuity, timing and the obstruction's shape.
 */

const DT = 1 / SIMULATION.hz;
const CINEMATIC = CAMERA_VIEW_CYCLE.filter(isCinematicView) as CinematicViewId[];

function input(overrides: Partial<CinematicInput> = {}): CinematicInput {
  return { ...createCinematicInput(), aspect: 16 / 9, ...overrides };
}

function resolve(camera: CinematicCamera, at: CinematicInput, view: CinematicViewId): ChaseCameraView {
  const state = createCinematicState();
  camera.writeState(state);
  const out = createChaseCameraView();
  resolveCinematicView(state, at, CINEMATIC_PROFILES[view], out);
  return out;
}

test('the cycle visits all eleven views once, in the owner’s order, and wraps to Chase', () => {
  assert.deepEqual([...CAMERA_VIEW_CYCLE], [
    'chase', 'action', 'firstPerson', 'avenue', 'elevated', 'side',
    'crossroads', 'overlook', 'architecture', 'director', 'orbit',
  ]);
  assert.equal(DEFAULT_CAMERA_VIEW, 'chase');
  const seen: string[] = [];
  let at: CameraViewId = DEFAULT_CAMERA_VIEW;
  for (let press = 0; press < CAMERA_VIEW_CYCLE.length; press += 1) {
    seen.push(at);
    at = nextCameraView(at);
  }
  assert.equal(at, 'chase', 'the eleventh press is back on Chase');
  assert.equal(new Set(seen).size, 11);
  assert.equal(CAMERA_VIEW_LABELS.orbit, 'Inspect', 'the inspection orbit is labelled Inspect');
  assert.equal(CAMERA_VIEW_LABELS.side, 'Side Tracking');
  assert.ok(!isCameraViewId('panorama'), 'Panorama was dropped');
  assert.ok(!isCinematicView('chase') && !isCinematicView('orbit'));
});

test('every profile lens is in radians, converted once, and near our own lens', () => {
  for (const view of CINEMATIC) {
    const fov = CINEMATIC_PROFILES[view].fov;
    // 0.8–1.4 rad is 46°–80°: a degree literal (46–80) or a double
    // conversion (0.014–0.024) cannot land here.
    assert.ok(fov > 0.8 && fov < 1.4, `${view} lens ${fov}`);
  }
  assert.ok(Object.isFrozen(CINEMATIC_PROFILES) && Object.isFrozen(CINEMATIC_PROFILES.director));
  assert.equal(CINEMATIC_PROFILES.director.orbitRate, 0.09);
  for (const view of CINEMATIC) {
    if (view !== 'director') assert.equal(CINEMATIC_PROFILES[view].orbitRate, 0, view);
  }
});

test('translating rider and world by a known offset translates every view by exactly it', () => {
  const offset = { x: 1834.25, y: 61.5, z: -2210.75 };
  for (const view of CINEMATIC) {
    const near = new CinematicCamera();
    const far = new CinematicCamera();
    const a = input({ x: 3, y: 2.4, z: -7, headingY: 0.7, speed: 9, groundPitch: 0.05, drop: 0.2 });
    const b = input({ ...a, x: a.x + offset.x, y: a.y + offset.y, z: a.z + offset.z });
    near.reset(a, view, true);
    far.reset(b, view, true);
    for (let step = 0; step < 240; step += 1) {
      a.headingY += 0.004; b.headingY += 0.004;
      near.step(DT, a);
      far.step(DT, b);
    }
    const p = resolve(near, a, view);
    const q = resolve(far, b, view);
    for (const [key, d] of [['positionX', offset.x], ['positionY', offset.y], ['positionZ', offset.z],
      ['targetX', offset.x], ['targetY', offset.y], ['targetZ', offset.z]] as const) {
      assert.ok(Math.abs(q[key] - p[key] - d) < 1e-6, `${view} ${key}: ${q[key] - p[key]} vs ${d}`);
    }
  }
});

test('a rider at constant speed in a straight line is held at a constant offset — no trailing', () => {
  // Director turns by design; its offset is checked at a held phase instead
  // (the translation test), and its turn on simulation time below.
  for (const view of CINEMATIC.filter((id) => id !== 'director')) {
    const camera = new CinematicCamera();
    const at = input({ headingY: 0.3, speed: 12 });
    camera.reset(at, view, true);
    const offsets: number[][] = [];
    for (let step = 0; step < 600; step += 1) {
      at.x += Math.sin(at.headingY) * at.speed * DT;
      at.z += Math.cos(at.headingY) * at.speed * DT;
      camera.step(DT, at);
      if (step >= 540) {
        const v = resolve(camera, at, view);
        offsets.push([v.positionX - at.x, v.positionY - at.y, v.positionZ - at.z]);
      }
    }
    for (const offset of offsets) {
      for (let axis = 0; axis < 3; axis += 1) {
        assert.ok(Math.abs(offset[axis] - offsets[0][axis]) < 1e-6, `${view} drifted on axis ${axis}`);
      }
    }
  }
});

test('a heading across ±π takes the short way, and interpolation never spins', () => {
  for (const view of ['crossroads', 'avenue', 'director'] as const) {
    const camera = new CinematicCamera();
    // The controller's heading is unwrapped; feed a wrapped one too, which is
    // the harsher case: it jumps by 2π between two steps.
    const at = input({ headingY: Math.PI - 0.01 });
    camera.reset(at, view, true);
    const previous = createCinematicState();
    const current = createCinematicState();
    camera.writeState(current);
    for (let step = 0; step < 120; step += 1) {
      at.headingY = step < 60 ? Math.PI - 0.01 + step * 0.0002 : -Math.PI + 0.002 + (step - 60) * 0.0002;
      Object.assign(previous, current);
      camera.step(DT, at);
      camera.writeState(current);
      assert.ok(Math.abs(current.yaw - previous.yaw) < 0.05, `${view} yaw jumped at step ${step}`);
      assert.ok(Math.abs(current.lookYaw - previous.lookYaw) < 0.05, `${view} look jumped at step ${step}`);
      const mid = createCinematicState();
      lerpCinematicState(previous, current, 0.5, mid);
      assert.ok(Math.abs(mid.yaw - previous.yaw) <= Math.abs(current.yaw - previous.yaw) + 1e-12);
    }
  }
});

test('Director orbits on simulation time only, from a deliberate start, and holds through a pause', () => {
  const camera = new CinematicCamera();
  const at = input();
  camera.reset(at, 'director', true);
  assert.equal(camera.directorPhase, 0, 'entry starts the orbit at its base angle');
  for (let step = 0; step < 120; step += 1) camera.step(DT, at);
  const afterSecond = camera.directorPhase;
  assert.ok(Math.abs(afterSecond - 0.09) < 1e-9, `one second of steps is 0.09 rad (${afterSecond})`);
  // A pause is steps that do not happen; a zero step is no time either.
  camera.step(0, at);
  assert.equal(camera.directorPhase, afterSecond);
  // A respawn snaps the camera without restarting the orbit; a fresh entry does.
  camera.reset(input({ x: 500, z: -40 }), 'director', false);
  assert.equal(camera.directorPhase, afterSecond);
  camera.reset(at, 'director', true);
  assert.equal(camera.directorPhase, 0);
  // Phase only moves while Director is the solved view.
  camera.reset(at, 'elevated', true);
  for (let step = 0; step < 120; step += 1) camera.step(DT, at);
  assert.equal(camera.directorPhase, 0);
});

test('obstruction pulls in at once, along the arm, and eases back out at its rate', () => {
  const wall = { distance: null as number | null };
  const probe: OcclusionProbe = (_o, _d, max) => (wall.distance !== null && wall.distance <= max ? wall.distance : null);
  const camera = new CinematicCamera();
  camera.setOcclusionProbe(probe);
  const at = input({ y: 4 });
  camera.reset(at, 'avenue', true);
  const state = createCinematicState();
  camera.writeState(state);
  assert.equal(state.extension, 1);
  const clear = resolve(camera, at, 'avenue');

  wall.distance = 5;
  camera.step(DT, at);
  camera.writeState(state);
  assert.ok(state.extension < 0.5, `one step retracts (${state.extension})`);
  const blocked = resolve(camera, at, 'avenue');
  // On the segment from the anchor to the composed camera.
  const anchorY = at.y + CINEMATIC_CAMERA.probeHeight;
  const full = [clear.positionX - at.x, clear.positionY - anchorY, clear.positionZ - at.z];
  const part = [blocked.positionX - at.x, blocked.positionY - anchorY, blocked.positionZ - at.z];
  const k = part[0] / full[0];
  assert.ok(Math.abs(part[1] - full[1] * k) < 1e-9 && Math.abs(part[2] - full[2] * k) < 1e-9, 'collinear');
  const armLength = Math.hypot(part[0], part[1], part[2]);
  assert.ok(Math.abs(armLength - (5 - CINEMATIC_CAMERA.clearance)) < 1e-6, `stops clearance short (${armLength})`);
  // The aim is pulled toward the rider as far as the arm came in.
  assert.ok(Math.hypot(blocked.targetX - at.x, blocked.targetZ - at.z)
    < Math.hypot(clear.targetX - at.x, clear.targetZ - at.z));

  wall.distance = null;
  camera.step(DT, at);
  camera.writeState(state);
  const oneStep = state.extension;
  assert.ok(oneStep < 0.5, 'restore is eased, not a snap');
  for (let step = 0; step < 120 * 3; step += 1) camera.step(DT, at);
  camera.writeState(state);
  assert.ok(state.extension > 0.999, `three seconds restores (${state.extension})`);

  // Never shorter than the minimum arm, even against a wall at the anchor.
  wall.distance = 0.4;
  camera.step(DT, at);
  const pinned = resolve(camera, at, 'avenue');
  const pinnedArm = Math.hypot(pinned.positionX - at.x, pinned.positionY - anchorY, pinned.positionZ - at.z);
  assert.ok(Math.abs(pinnedArm - CINEMATIC_CAMERA.minimumArm) < 1e-6, `minimum arm (${pinnedArm})`);
});

test('the drawn-frame check pulls the camera in and writes no state', () => {
  const probe: OcclusionProbe = (_o, _d, max) => (3 <= max ? 3 : null);
  const camera = new CinematicCamera();
  const at = input();
  camera.reset(at, 'elevated', true);
  camera.setOcclusionProbe(probe);
  const before = createCinematicState();
  camera.writeState(before);
  const view = resolve(camera, at, 'elevated');
  assert.ok(camera.constrain(at, CINEMATIC_PROFILES.elevated, view));
  const after = createCinematicState();
  camera.writeState(after);
  assert.deepEqual(after, before, 'constrain advanced nothing');
  const anchorY = at.y + CINEMATIC_CAMERA.probeHeight;
  const arm = Math.hypot(view.positionX - at.x, view.positionY - anchorY, view.positionZ - at.z);
  assert.ok(Math.abs(arm - (3 - CINEMATIC_CAMERA.clearance)) < 1e-6);
});

test('interpolation keeps the shorter arm of two steps', () => {
  const a = createCinematicState();
  const b = createCinematicState();
  a.extension = 1;
  b.extension = 0.3;
  const out = createCinematicState();
  lerpCinematicState(a, b, 0.1, out);
  assert.equal(out.extension, 0.3);
  lerpCinematicState(b, a, 0.9, out);
  assert.equal(out.extension, 0.3);
});

test('a two-sided view moves to the clearer side past the threshold, smoothly, and holds it', () => {
  // A wall on one side only: rays whose direction has positive x (at heading
  // 0) are blocked a metre out.
  let blockPositiveX = true;
  const probe: OcclusionProbe = (_o, direction, max) => {
    const positive = direction.x > 0.1;
    if (blockPositiveX ? positive : direction.x < -0.1) return Math.min(1, max);
    return null;
  };
  const camera = new CinematicCamera();
  const at = input({ headingY: 0 });
  camera.reset(at, 'side', true);
  camera.setOcclusionProbe(probe);
  assert.equal(camera.side, 1);
  const state = createCinematicState();
  let previousYaw = Number.NaN;
  let switchedAt = -1;
  for (let step = 0; step < 120; step += 1) {
    camera.step(DT, at);
    camera.writeState(state);
    if (!Number.isNaN(previousYaw)) {
      assert.ok(Math.abs(state.yaw - previousYaw) < 0.1, 'the side change is an eased swing, never a cut');
    }
    previousYaw = state.yaw;
    if (switchedAt < 0 && camera.side < 0) switchedAt = step;
  }
  assert.ok(switchedAt >= 0 && switchedAt * DT <= CINEMATIC_CAMERA.sideCheckSeconds + DT, `switched at ${switchedAt}`);
  // Now the wall moves to the other side: the hold keeps the camera put first.
  blockPositiveX = false;
  const heldUntil = switchedAt * DT + CINEMATIC_CAMERA.sideHoldSeconds;
  let flippedBackAt = -1;
  for (let step = 120; step < 120 * 4; step += 1) {
    camera.step(DT, at);
    if (flippedBackAt < 0 && camera.side === 1) flippedBackAt = step;
  }
  assert.ok(flippedBackAt * DT >= heldUntil - 1e-9, `held ${heldUntil} s, flipped at ${flippedBackAt * DT}`);

  // Equal sides never flap.
  const open = new CinematicCamera();
  open.setOcclusionProbe(() => null);
  open.reset(at, 'crossroads', true);
  for (let step = 0; step < 600; step += 1) open.step(DT, at);
  assert.equal(open.side, 1);
});

test('the view blend starts exactly at the old view, ends at the new, and swings round the rider', () => {
  const blend = createCameraBlend();
  const rider = { x: 10, y: 2, z: -3 };
  const from = createChaseCameraView();
  Object.assign(from, { positionX: 10, positionY: 4, positionZ: -8, targetX: 10, targetY: 2.5, targetZ: 0, fov: 1.13, roll: 0.05 });
  beginCameraBlend(blend, from, rider, 0);
  const to = (): ChaseCameraView => Object.assign(createChaseCameraView(),
    { positionX: 10, positionY: 4, positionZ: 2, targetX: 10, targetY: 2.5, targetZ: -6, fov: 1.0, roll: 0 });
  const start = to();
  applyCameraBlend(blend, cameraBlendWeight(blend, 0), rider, start);
  for (const key of ['positionX', 'positionY', 'positionZ', 'targetX', 'targetY', 'targetZ', 'fov', 'roll'] as const) {
    assert.ok(Math.abs(start[key] - from[key]) < 1e-9, key);
  }
  // Halfway, the camera is still 5 m from the rider horizontally: it swung
  // round him rather than cutting through.
  // From straight behind (bearing π) to straight ahead (0): a half turn,
  // so the blend runs its base time plus one extra quarter.
  assert.ok(Math.abs(blend.seconds - (CINEMATIC_CAMERA.blendSeconds + CINEMATIC_CAMERA.blendSecondsPerQuarter)) < 1e-9);
  for (let step = 0; step < Math.round(blend.seconds / DT / 2); step += 1) stepCameraBlend(blend, DT);
  const mid = to();
  applyCameraBlend(blend, cameraBlendWeight(blend, 1), rider, mid);
  assert.ok(Math.abs(Math.hypot(mid.positionX - rider.x, mid.positionZ - rider.z) - 5) < 1e-9);
  for (let step = 0; step < 200; step += 1) stepCameraBlend(blend, DT);
  assert.equal(blend.progress, 1);
  const end = to();
  applyCameraBlend(blend, cameraBlendWeight(blend, 1), rider, end);
  assert.deepEqual(end, to());
});

test('a side view stands on the side the other riders are not', () => {
  for (const crowd of [0.8, -0.8]) {
    const camera = new CinematicCamera();
    camera.setOcclusionProbe(() => null);
    const at = input({ crowd });
    camera.reset(at, 'side', true);
    assert.equal(camera.side, crowd > 0 ? -1 : 1, `crowd ${crowd}`);
    // And it holds there while they stay; nothing flaps.
    for (let step = 0; step < 600; step += 1) camera.step(DT, at);
    assert.equal(camera.side, crowd > 0 ? -1 : 1);
  }
  // Nobody about: the default side.
  const alone = new CinematicCamera();
  alone.setOcclusionProbe(() => null);
  alone.reset(input(), 'crossroads', true);
  assert.equal(alone.side, 1);
});
