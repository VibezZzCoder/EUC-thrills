/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CAMERA, SIMULATION } from '../data/tuning.ts';
import { approach } from '../shared/maths.ts';
import {
  ChaseCamera,
  bankTargetFor,
  createChaseCameraState,
  createChaseCameraView,
  defaultChaseCameraTuning,
  resolveChaseView,
  type ChaseCameraInput,
  type ChaseCameraTuning,
} from './chaseCamera.ts';

/**
 * The chase camera, headlessly.
 *
 * The camera contains no three.js and no vectors precisely so that this file
 * can exist: every relationship the milestone is judged on — distance and
 * field of view growing with speed, the yaw lag shortening as speed rises and
 * converging without overshoot, the bank capped and mirrored, the obstruction
 * pull-in fast and its restore slow — is scalar arithmetic and needs no
 * browser to check.
 *
 * **One thing here cannot be trusted and is not asserted: which way is left.**
 * Every number below is expressed in the same world frame as the code, so a
 * frame error would make the test and the implementation agree and both be
 * wrong (`docs/LESSONS_LEARNED.md`). The bank's sign, the look-ahead's
 * direction, and the head's turn are all proved in screen space by
 * `tests/m3.spec.ts`, which is the only place they can be.
 */

const STEP = 1 / SIMULATION.hz;

function input(overrides: Partial<ChaseCameraInput> = {}): ChaseCameraInput {
  return {
    x: 0,
    y: 0,
    z: 0,
    headingY: 0,
    rollAngle: 0,
    speed: 0,
    // On the ground by default: the ground is exactly where the rider is, and
    // every M3/M4 assertion below was written against a camera for which that
    // was the only possibility.
    groundY: 0,
    airborne: false,
    // And on the wheel by default, for the same reason: every M3, M4, and M5
    // assertion below was written against a camera with no crash framing in it.
    crashed: false,
    // The body rides on the wheel unless a test throws it (1.3.1).
    bodyX: overrides.x ?? 0,
    bodyY: overrides.y ?? 0,
    bodyZ: overrides.z ?? 0,
    ...overrides,
  };
}

/** Step a camera for `seconds` at the simulation's own rate. */
function run(camera: ChaseCamera, seconds: number, values: ChaseCameraInput): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) camera.step(STEP, values);
}

function stateAfter(
  camera: ChaseCamera,
  seconds: number,
  values: ChaseCameraInput,
): ReturnType<typeof createChaseCameraState> {
  run(camera, seconds, values);
  const state = createChaseCameraState();
  camera.writeState(state);
  return state;
}

// -- Speed expression --------------------------------------------------------

test('the arm lengthens and the field of view widens with speed', () => {
  const tuning = defaultChaseCameraTuning();

  const parked = stateAfter(new ChaseCamera(), 4, input({ speed: 0 }));
  const flying = stateAfter(new ChaseCamera(), 6, input({ speed: tuning.speedReference }));

  assert.ok(
    Math.abs(parked.distance - tuning.distanceAtRest) < 1e-3,
    `a stationary rider should sit at the rest arm length, got ${parked.distance}`,
  );
  assert.ok(
    flying.distance > parked.distance + 1.5,
    `top speed should pull the camera visibly back, got ${flying.distance} vs ${parked.distance}`,
  );
  assert.ok(flying.distance <= tuning.distanceAtSpeed + 1e-6);
  assert.ok(flying.fov > parked.fov + 0.15);
  assert.ok(flying.fov <= tuning.fovAtSpeed + 1e-6);

  // Monotone in speed, so there is no band where accelerating pulls the camera
  // in — which would read as braking.
  let previousDistance = -Infinity;
  let previousFov = -Infinity;
  for (const speed of [0, 3, 6, 9, 12, 15, 20]) {
    const state = stateAfter(new ChaseCamera(), 8, input({ speed }));
    assert.ok(state.distance >= previousDistance - 1e-9, `distance fell at ${speed} m/s`);
    assert.ok(state.fov >= previousFov - 1e-9, `field of view fell at ${speed} m/s`);
    previousDistance = state.distance;
    previousFov = state.fov;
  }
});

test('neither the arm nor the field of view snaps when speed changes', () => {
  const tuning = defaultChaseCameraTuning();
  const camera = new ChaseCamera();
  const flat_out = input({ speed: tuning.speedReference });

  // One step of the fastest possible change: a stationary rider teleported to
  // top speed. Even that must not move either value more than a fraction of
  // its range, or the camera pops and the field of view pulses.
  camera.step(STEP, flat_out);
  const first = createChaseCameraState();
  camera.writeState(first);

  const distanceRange = tuning.distanceAtSpeed - tuning.distanceAtRest;
  const fovRange = tuning.fovAtSpeed - tuning.fovAtRest;
  assert.ok(
    first.distance - tuning.distanceAtRest < distanceRange * 0.05,
    'the arm moved more than a twentieth of its range in one step',
  );
  assert.ok(
    first.fov - tuning.fovAtRest < fovRange * 0.05,
    'the field of view moved more than a twentieth of its range in one step',
  );
  // And the field of view is the slower of the two, deliberately.
  assert.ok(
    (first.fov - tuning.fovAtRest) / fovRange
      < (first.distance - tuning.distanceAtRest) / distanceRange,
  );
});

// -- Look-ahead --------------------------------------------------------------

test('the look-ahead offset scales with speed, is capped, and ignores reverse', () => {
  const tuning = defaultChaseCameraTuning();

  const parked = stateAfter(new ChaseCamera(), 3, input({ speed: 0 }));
  assert.equal(parked.lookAhead, 0);

  const cruising = stateAfter(new ChaseCamera(), 4, input({ speed: 10 }));
  assert.ok(Math.abs(cruising.lookAhead - 10 * tuning.lookAheadSeconds) < 0.05);

  const flying = stateAfter(new ChaseCamera(), 6, input({ speed: 40 }));
  assert.ok(flying.lookAhead <= tuning.lookAheadMax + 1e-9);
  assert.ok(flying.lookAhead > cruising.lookAhead);

  // Backing up at walking pace to reposition must not aim the camera behind
  // the rider.
  const reversing = stateAfter(new ChaseCamera(), 3, input({ speed: -2.2 }));
  assert.equal(reversing.lookAhead, 0);
});

// -- Yaw follow --------------------------------------------------------------

test('the camera lags a heading change and converges without overshooting', () => {
  const camera = new ChaseCamera();
  const turning = input({ headingY: 1, speed: 8 });
  camera.reset(input({ speed: 8 }));

  const state = createChaseCameraState();
  let previous = 0;
  let sampled = 0;
  for (let i = 0; i < Math.round(2 / STEP); i += 1) {
    camera.step(STEP, turning);
    camera.writeState(state);

    // Monotone toward the target, and never past it. A camera that overshoots
    // a corner exit is a camera that rocks, and rocking is the whole
    // motion-sickness failure mode.
    assert.ok(state.yaw >= previous - 1e-12, 'the follow yaw moved backwards');
    assert.ok(state.yaw <= turning.headingY + 1e-12, 'the follow yaw overshot the heading');
    previous = state.yaw;

    // Sampled at a fifth of a second: still visibly behind, so the heading
    // change genuinely leads the camera rather than dragging it rigidly.
    if (i === Math.round(0.2 / STEP)) {
      sampled = state.yaw;
      assert.ok(sampled > 0.2, `the camera barely moved in 0.2 s: ${sampled}`);
      assert.ok(sampled < 0.9, `the camera tracked almost rigidly: ${sampled}`);
    }
  }
  assert.ok(sampled > 0);
  assert.ok(Math.abs(state.yaw - turning.headingY) < 0.01, 'the camera never caught up');
});

test('the follow lag shortens at speed and lengthens at low speed', () => {
  const tuning = defaultChaseCameraTuning();
  const crawling = new ChaseCamera();
  const flying = new ChaseCamera();
  crawling.reset(input());
  flying.reset(input());

  const window = 0.2;
  const slow = stateAfter(crawling, window, input({ headingY: 1, speed: 0.4 }));
  const fast = stateAfter(flying, window, input({ headingY: 1, speed: tuning.speedReference }));

  // Backwards from the intuitive choice on purpose: tight low-speed
  // manoeuvring must not whip the camera, and speed should feel locked in.
  assert.ok(
    fast.yaw > slow.yaw * 1.5,
    `expected the fast camera to track far harder, got ${fast.yaw} vs ${slow.yaw}`,
  );
  assert.ok(slow.yaw < 0.5, `a 2.4 rad/s pivot would whip this camera: ${slow.yaw}`);
});

// -- Bank --------------------------------------------------------------------

test('the bank follows the lean, mirrors, and is capped', () => {
  const tuning = defaultChaseCameraTuning();

  // Steering right produces a negative roll in this world; the bank has the
  // opposite sign because a positive bank tilts the camera's up axis toward
  // the right of the screen. Which of those is "into the corner" is a
  // screen-space question and lives in `tests/m3.spec.ts`.
  const right = stateAfter(new ChaseCamera(), 2, input({ rollAngle: -0.5, speed: 10 }));
  const left = stateAfter(new ChaseCamera(), 2, input({ rollAngle: 0.5, speed: 10 }));

  assert.ok(right.bank > 0);
  assert.ok(left.bank < 0);
  assert.ok(Math.abs(right.bank + left.bank) < 1e-9, 'the two banks are not mirrored');
  assert.ok(Math.abs(right.bank - 0.5 * tuning.bankFactor) < 1e-3);

  // Capped, because an uncapped bank is a motion-sickness trap and a tilted
  // horizon costs terrain readability.
  const extreme = stateAfter(new ChaseCamera(), 3, input({ rollAngle: -1.4, speed: 12 }));
  assert.ok(Math.abs(extreme.bank) <= tuning.bankMaxRadians + 1e-9);
  assert.equal(bankTargetFor(-1.4, tuning), tuning.bankMaxRadians);
  assert.equal(bankTargetFor(1.4, tuning), -tuning.bankMaxRadians);
  assert.ok(bankTargetFor(0, tuning) === 0);
});

// -- Obstruction -------------------------------------------------------------

test('an obstruction pulls the arm in fast and gives it back slowly', () => {
  const tuning = defaultChaseCameraTuning();
  const camera = new ChaseCamera();
  const riding = input({ speed: 2 });
  camera.reset(riding);
  run(camera, 2, riding);

  const clear = createChaseCameraState();
  camera.writeState(clear);
  assert.ok(clear.armDistance > 4, 'nothing in the way, so the arm should be extended');

  // Something solid three metres along the arm.
  camera.setOcclusionProbe(() => 3);
  const quick = stateAfter(camera, 0.2, riding);
  const pinned = stateAfter(camera, 2, riding);

  assert.ok(
    pinned.armDistance < clear.armDistance - 1,
    `the camera did not pull in: ${pinned.armDistance}`,
  );
  // The hit is inset by the radius the camera keeps clear, so it stops short
  // of the obstruction rather than touching it.
  assert.ok(
    pinned.armDistance < 3 - tuning.obstructionRadius + 0.05,
    `the camera stopped too close to the obstruction: ${pinned.armDistance}`,
  );
  // A fifth of a second is essentially the whole pull-in. It has to be, or the
  // camera spends visible frames inside whatever it is hiding behind.
  const engaged = (clear.armDistance - quick.armDistance)
    / (clear.armDistance - pinned.armDistance);
  assert.ok(engaged > 0.95, `pull-in covered only ${(engaged * 100).toFixed(1)}% in 0.2 s`);

  // The same fifth of a second is nowhere near the restore. That asymmetry is
  // the feature: fast in, slow out, and neither is a step.
  camera.setOcclusionProbe(null);
  const restoring = stateAfter(camera, 0.2, riding);
  const settled = stateAfter(camera, 3, riding);
  const recovered = (restoring.armDistance - pinned.armDistance)
    / (settled.armDistance - pinned.armDistance);
  assert.ok(
    recovered > 0.05 && recovered < 0.45,
    `restore should be slow and non-zero, recovered ${(recovered * 100).toFixed(1)}%`,
  );
  assert.ok(engaged > recovered * 2, 'the pull-in is not meaningfully faster than the restore');

  // Fully restored means back on the speed-eased arm, not merely near it.
  assert.ok(Math.abs(settled.armDistance - settled.distance) < 0.01);
});

test('the pull-in never crushes the camera into the rider', () => {
  const tuning = defaultChaseCameraTuning();
  const camera = new ChaseCamera();
  const riding = input({ speed: 6 });
  camera.reset(riding);
  camera.setOcclusionProbe(() => 0.1);

  const state = stateAfter(camera, 2, riding);
  assert.ok(
    state.armDistance >= tuning.obstructionMinDistance - 1e-9,
    `the arm collapsed to ${state.armDistance}`,
  );
});

test('a probe that finds nothing leaves the speed-eased arm alone', () => {
  const camera = new ChaseCamera();
  camera.setOcclusionProbe(() => null);
  const riding = input({ speed: 15 });
  camera.reset(riding);

  // The arm chases the speed-eased length through the same restore response,
  // so it trails it by a step or two while that length is still moving and
  // lands exactly on it once it settles.
  const state = stateAfter(camera, 6, riding);
  assert.ok(
    Math.abs(state.armDistance - state.distance) < 1e-3,
    `unobstructed arm ${state.armDistance} should equal the eased ${state.distance}`,
  );
});

test('the probe is asked about the line the camera actually wants to be on', () => {
  const camera = new ChaseCamera();
  const riding = input({ x: 5, y: 0, z: -3, headingY: 0, speed: 0 });
  camera.reset(riding);

  let seen: { origin: { x: number; y: number; z: number }; length: number } | null = null;
  camera.setOcclusionProbe((origin, direction, maxDistance) => {
    seen = {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      length: Math.hypot(direction.x, direction.y, direction.z),
    };
    assert.ok(Math.abs(maxDistance - seen.length) < 1e-9);
    return null;
  });
  camera.step(STEP, riding);

  assert.ok(seen !== null, 'the probe was never called');
  const probe = seen as unknown as { origin: { x: number; y: number; z: number }; length: number };
  // It starts at the look anchor on the rider, not at the contact patch.
  assert.equal(probe.origin.x, 5);
  assert.equal(probe.origin.z, -3);
  assert.ok(Math.abs(probe.origin.y - camera.tuning.anchorHeight) < 1e-9);
  // And it reaches exactly as far as the camera wants to sit.
  const rise = camera.tuning.armHeight - camera.tuning.anchorHeight;
  assert.ok(Math.abs(probe.length - Math.hypot(CAMERA.distanceAtRest, rise)) < 1e-6);
});

// -- Step-size independence and determinism ---------------------------------

test('the same ride produces the same camera at any step size', () => {
  const values = input({ headingY: 0.8, rollAngle: -0.4, speed: 9 });

  const fine = new ChaseCamera();
  fine.reset(input());
  for (let i = 0; i < 480; i += 1) fine.step(1 / 240, values);

  const coarse = new ChaseCamera();
  coarse.reset(input());
  for (let i = 0; i < 120; i += 1) coarse.step(1 / 60, values);

  const a = createChaseCameraState();
  const b = createChaseCameraState();
  fine.writeState(a);
  coarse.writeState(b);

  // `approach` is exponential rather than the naive `+= delta * k`, so halving
  // the step must not change the trajectory. It bites the first time somebody
  // moves SIMULATION.hz and cannot explain why the camera feels different.
  assert.ok(Math.abs(a.yaw - b.yaw) < 5e-3, `yaw ${a.yaw} vs ${b.yaw}`);
  assert.ok(Math.abs(a.distance - b.distance) < 5e-3);
  assert.ok(Math.abs(a.fov - b.fov) < 5e-3);
  assert.ok(Math.abs(a.bank - b.bank) < 5e-3);
  assert.ok(Math.abs(a.lookAhead - b.lookAhead) < 5e-3);
});

test('a zero or negative step changes nothing', () => {
  const camera = new ChaseCamera();
  const before = stateAfter(camera, 1, input({ speed: 7, headingY: 0.5 }));
  camera.step(0, input({ speed: 7, headingY: 3 }));
  camera.step(-1, input({ speed: 7, headingY: 3 }));
  const after = createChaseCameraState();
  camera.writeState(after);
  assert.deepEqual(after, before);
});

// -- Resolving a view --------------------------------------------------------

test('the resolved view sits behind the follow yaw and aims ahead of the rider', () => {
  const tuning = defaultChaseCameraTuning();
  const state = createChaseCameraState();
  const view = createChaseCameraView();

  state.yaw = 0;
  state.distance = 5;
  state.armDistance = 5;
  state.lookAhead = 3;
  resolveChaseView(state, input({ x: 2, y: 0, z: 7, headingY: 0 }), tuning, view);

  // +Z is forward, so behind is -Z. The camera trails the rider and the aim
  // point leads them.
  assert.ok(Math.abs(view.positionX - 2) < 1e-9);
  assert.ok(Math.abs(view.positionZ - (7 - 5)) < 1e-9);
  assert.ok(Math.abs(view.positionY - tuning.armHeight) < 1e-9);
  assert.ok(Math.abs(view.targetZ - (7 + 3)) < 1e-9);
  assert.ok(Math.abs(view.targetY - tuning.anchorHeight) < 1e-9);

  // The aim follows the rider's true heading, not the lagged yaw: during a
  // corner the arm trails while the aim already leads into the turn.
  resolveChaseView(state, input({ headingY: Math.PI / 2 }), tuning, view);
  assert.ok(Math.abs(view.targetX - 3) < 1e-9);
  assert.ok(Math.abs(view.targetZ) < 1e-9);
  assert.ok(Math.abs(view.positionZ + 5) < 1e-9, 'the arm should still be on the lagged yaw');
});

test('a pulled-in camera slides along the arm rather than hovering above it', () => {
  const tuning = defaultChaseCameraTuning();
  const state = createChaseCameraState();
  const view = createChaseCameraView();

  state.yaw = 0;
  state.distance = 5;
  state.armDistance = 2.5;
  resolveChaseView(state, input(), tuning, view);

  // Half the arm means half the rise, so an obstruction never turns into a
  // sudden looking-down-at-the-rider shot.
  const expected = tuning.anchorHeight + (tuning.armHeight - tuning.anchorHeight) * 0.5;
  assert.ok(Math.abs(view.positionY - expected) < 1e-9);
  assert.ok(Math.abs(view.positionZ + 2.5) < 1e-9);
});

// -- Airborne and landing (M5) -----------------------------------------------

test('on the ground the airborne behaviour is exactly nothing', () => {
  // The whole reason `heightLag` is expressed as an offset rather than as a
  // smoothed height: on the ground its target and its value are both zero, so
  // the M3 and M4 camera cannot be changed by it — including on a hill, where
  // a smoothed absolute height would lag the rider every step.
  const camera = new ChaseCamera();
  for (let i = 0; i < 240; i += 1) {
    // Climbing: the rider's height changes every step, the ground with them.
    const y = i * 0.05;
    camera.step(STEP, input({ y, groundY: y, speed: 10 }));
  }
  const state = createChaseCameraState();
  camera.writeState(state);
  assert.equal(state.heightLag, 0, 'a hill must not produce a height lag');
  assert.equal(state.dip, 0);
});

test('the camera keeps most of a hop in frame instead of following it', () => {
  // docs/PLANS.md §5: "freeze pitch-follow, keep the rider framed". Following
  // the rider exactly would take the horizon and the upcoming ground up half a
  // metre in a fifth of a second.
  const tuning = defaultChaseCameraTuning();
  const camera = new ChaseCamera();
  run(camera, 2, input({ speed: 10 }));

  const apex = 0.46;
  run(camera, 0.3, input({ y: apex, groundY: 0, speed: 10, airborne: true }));
  const flying = createChaseCameraState();
  camera.writeState(flying);

  const followed = apex - flying.heightLag;
  assert.ok(
    followed > 0 && followed < apex,
    `the camera must take part of the hop, not none and not all: ${followed} of ${apex}`,
  );
  assert.ok(
    Math.abs(followed / apex - tuning.airHeightFollow) < 0.05,
    `it took ${followed / apex} of the hop, not ${tuning.airHeightFollow}`,
  );
});

test('the height offset eases back out after touchdown, and does not snap', () => {
  const camera = new ChaseCamera();
  run(camera, 2, input({ speed: 10 }));
  run(camera, 0.4, input({ y: 0.5, groundY: 0, speed: 10, airborne: true }));

  const airborneState = createChaseCameraState();
  camera.writeState(airborneState);
  assert.ok(airborneState.heightLag > 0.1, 'sanity: there is an offset to ease out');

  // One step on the ground must not erase it — that is the pop §5 forbids.
  camera.step(STEP, input({ y: 0, groundY: 0, speed: 10 }));
  const justLanded = createChaseCameraState();
  camera.writeState(justLanded);
  assert.ok(
    justLanded.heightLag > airborneState.heightLag * 0.9,
    'the camera snapped back to the ground on landing',
  );

  // And a couple of seconds later it is gone. Four time constants, because a
  // first-order ease has no finish line — the assertion has to name a
  // tolerance rather than pretend it reaches zero.
  run(camera, 2, input({ y: 0, groundY: 0, speed: 10 }));
  const settled = createChaseCameraState();
  camera.writeState(settled);
  assert.ok(settled.heightLag < 0.01, `the offset never went away: ${settled.heightLag}`);
});

test('the landing dip is capped, decays to zero, and never oscillates', () => {
  // §4.4 asks for a "camera dip". It is not shake: one first-order impulse
  // that only ever decreases after it is applied, capped, and gone in under a
  // second.
  const tuning = defaultChaseCameraTuning();
  const camera = new ChaseCamera();
  run(camera, 1, input({ speed: 10 }));

  camera.landingImpulse(4);
  const struck = createChaseCameraState();
  camera.writeState(struck);
  assert.ok(struck.dip > 0, 'a landing must dip the camera');

  // An absurd impact cannot dip it further than the cap.
  camera.landingImpulse(1000);
  const capped = createChaseCameraState();
  camera.writeState(capped);
  assert.ok(
    capped.dip <= tuning.landingDipMax + 1e-9,
    `the dip exceeded its cap: ${capped.dip}`,
  );

  // Monotone decay: never below zero, never back up.
  let previous = capped.dip;
  const state = createChaseCameraState();
  for (let i = 0; i < 240; i += 1) {
    camera.step(STEP, input({ speed: 10 }));
    camera.writeState(state);
    assert.ok(state.dip <= previous + 1e-12, 'the dip went back up — that is oscillation');
    assert.ok(state.dip >= 0);
    previous = state.dip;
  }
  assert.ok(previous < 0.005, `the dip never recovered: ${previous}`);
});

test('a zero dip cap turns the landing dip off completely', () => {
  // The F4 slider goes to zero, and at zero it must mean zero — a player who
  // wants no camera motion on impact has to be able to have none.
  const camera = new ChaseCamera({ tuning: { landingDipMax: 0 } });
  camera.landingImpulse(20);
  const state = createChaseCameraState();
  camera.writeState(state);
  assert.equal(state.dip, 0);
});

test('a reset clears the airborne offset and the dip', () => {
  const camera = new ChaseCamera();
  run(camera, 0.4, input({ y: 0.5, groundY: 0, speed: 10, airborne: true }));
  camera.landingImpulse(5);
  camera.reset(input({ speed: 0 }));
  const state = createChaseCameraState();
  camera.writeState(state);
  assert.equal(state.heightLag, 0);
  assert.equal(state.dip, 0);
});

test('the resolved view drops with the dip without changing where it looks', () => {
  // Camera and target move together, so the image shifts rather than the view
  // pitching up at the moment of impact.
  const tuning = defaultChaseCameraTuning();
  const view = createChaseCameraView();
  const dipped = createChaseCameraView();
  const state = createChaseCameraState();
  const rider = input({ speed: 8 });

  resolveChaseView(state, rider, tuning, view);
  state.dip = 0.12;
  resolveChaseView(state, rider, tuning, dipped);

  assert.ok(Math.abs((view.positionY - dipped.positionY) - 0.12) < 1e-9);
  assert.ok(Math.abs((view.targetY - dipped.targetY) - 0.12) < 1e-9);
  assert.equal(view.positionX, dipped.positionX);
  assert.equal(view.positionZ, dipped.positionZ);
});

// -- Deep drops: the takeoff latch (M44) --------------------------------------

/**
 * The pre-M44 height-lag rule, copied from the line M44 replaced. A flight that
 * drops less than `deepDropMetres` has to match it to the last bit: that is the
 * whole claim that no world without an EUClaude-deep hole sees a new camera.
 */
function preM44HeightLag(
  previous: number,
  dt: number,
  values: ChaseCameraInput,
  tuning: ChaseCameraTuning,
): number {
  return approach(
    previous,
    values.airborne ? Math.max(0, values.y - values.groundY) * (1 - tuning.airHeightFollow) : 0,
    values.airborne ? tuning.airHeightResponseSeconds : tuning.landingRestoreSeconds,
    Infinity,
    dt,
  );
}

const GRAVITY = 9.81;
/** The roof pad's vertical launch cap, m/s (`docs/PLANS.md` §44.2): the biggest hop a pad throws. */
const PAD_VERTICAL = 2.85;
/** An EUClaude roof deck and the alley floor 11 m under it. */
const DECK = 11;
const ALLEY = 0;

/** Height `k` steps into a ballistic flight from `y0` at `vy0`. */
function ballistic(y0: number, vy0: number, k: number): number {
  const t = k * STEP;
  return y0 + vy0 * t - 0.5 * GRAVITY * t * t;
}

test('a flight over an 11 m alley measures the hop from the deck it left, not from the alley floor', () => {
  // The EUClaude defect (15-south-airborne-gap3.png): over the alley the ground
  // beneath falls 11 m in one step, and reading the hop off it put ~7 m of lag
  // on the camera in a tenth of a second — the camera sank into the alley.
  const tuning = defaultChaseCameraTuning();
  const follow = 1 - tuning.airHeightFollow;
  const camera = new ChaseCamera();
  run(camera, 1, input({ y: DECK, groundY: DECK, speed: 18 }));

  const state = createChaseCameraState();
  const view = createChaseCameraView();
  let preM44 = 0;
  let preM44Worst = 0;
  let highestHop = 0;
  let airborneSteps = 0;
  for (let k = 1; ; k += 1) {
    const y = ballistic(DECK, PAD_VERTICAL, k);
    // A third of a second over the alley, then the far roof at the deck's height.
    const groundY = k * STEP < 0.35 ? ALLEY : DECK;
    if (y <= groundY) break;
    const values = input({ y, groundY, speed: 18, airborne: true });
    camera.step(STEP, values);
    camera.writeState(state);
    resolveChaseView(state, values, tuning, view);
    preM44 = preM44HeightLag(preM44, STEP, values, tuning);
    preM44Worst = Math.max(preM44Worst, preM44);
    airborneSteps += 1;

    const hop = y - DECK;
    highestHop = Math.max(highestHop, hop);
    // Rising, the lag trails its target from below, so it never exceeds the
    // hop above the deck: (y − 11) × 0.65. Falling, a first-order ease trails
    // its target from above — but never past the most the hop ever asked for.
    if (PAD_VERTICAL - GRAVITY * k * STEP > 0) {
      assert.ok(state.heightLag <= hop * follow + 1e-12,
        `step ${k}: lag ${state.heightLag} above the hop's ${hop * follow} while rising`);
    }
    assert.ok(state.heightLag <= highestHop * follow + 1e-12,
      `step ${k}: lag ${state.heightLag} beyond the highest hop's ${highestHop * follow}`);
    assert.ok(view.targetY > DECK, `step ${k}: the anchor ${view.targetY} sank below the ${DECK} m deck`);
    assert.ok(view.positionY > DECK, `step ${k}: the camera ${view.positionY} sank below the ${DECK} m deck`);
  }
  assert.ok(airborneSteps > 60, `sanity: a real pad flight (${airborneSteps} steps)`);
  assert.ok(preM44Worst > 5, `sanity: the pre-M44 rule put ${preM44Worst} m of lag on this flight`);
});

test('a short flight into the alley never puts the camera below the ground beneath it', () => {
  // 08-north-short-gap2-crash.png: a short flight crashes, the rider is on the
  // alley floor, and the lag the flight carried eased out over the landing
  // restore with the camera under the ground. Every way a short flight ends:
  // falling all the way to the floor; meeting the far wall at 9 m and being put
  // down on the floor by the crash; and a kicker's much bigger hop (8 m/s up)
  // meeting a wall at 13 m, still above the deck, with 2 m of honest lag — the
  // case only the deep-flight clamp keeps above the floor.
  const tuning = defaultChaseCameraTuning();
  for (const { launch, crashHeight } of [
    { launch: PAD_VERTICAL, crashHeight: ALLEY },
    { launch: PAD_VERTICAL, crashHeight: 9 },
    { launch: 8, crashHeight: 13 },
  ]) {
    const camera = new ChaseCamera();
    run(camera, 1, input({ y: DECK, groundY: DECK, speed: 14 }));
    const state = createChaseCameraState();
    const view = createChaseCameraView();
    let preM44 = 0;
    let preM44Lowest = Infinity;
    const check = (values: ChaseCameraInput, label: string): void => {
      camera.step(STEP, values);
      camera.writeState(state);
      resolveChaseView(state, values, tuning, view);
      assert.ok(view.targetY > values.groundY, `${label}: anchor ${view.targetY} under the ground ${values.groundY}`);
      assert.ok(view.positionY > values.groundY, `${label}: camera ${view.positionY} under the ground ${values.groundY}`);
      preM44 = preM44HeightLag(preM44, STEP, values, tuning);
      preM44Lowest = Math.min(preM44Lowest, values.y - preM44 + tuning.anchorHeight - state.dip - values.groundY);
    };
    for (let k = 1; ; k += 1) {
      const y = ballistic(DECK, launch, k);
      if (launch - GRAVITY * k * STEP < 0 && y <= crashHeight) break;
      check(input({ y, groundY: ALLEY, speed: 14, airborne: true }), `crash at ${crashHeight} m, flight step ${k}`);
    }
    // The crash: on the alley floor, off the wheel, with the deepest landing dip.
    camera.landingImpulse(1000);
    for (let i = 0; i < 2 * SIMULATION.hz; i += 1) {
      check(input({ y: ALLEY, groundY: ALLEY, speed: 0, crashed: true }), `crash at ${crashHeight} m, floor step ${i}`);
    }
    if (crashHeight > ALLEY) {
      assert.ok(preM44Lowest < 0, `sanity: the pre-M44 rule put the anchor ${-preM44Lowest} m under the floor`);
    }
  }
});

test('a flight that drops less than deepDropMetres is the pre-M44 camera, bit for bit', () => {
  // A 1.2 m ledge, a pad on a 5 m hill whose far side falls away to the
  // ground, and a roll off 8.9 m (the deepest shipped drop is the proving
  // ground's 8 m block): every one under the threshold, so every step's lag —
  // landings, their eased restore, a crash — must equal the old rule exactly.
  const tuning = defaultChaseCameraTuning();
  assert.ok(tuning.deepDropMetres > 8.9, 'sanity: every scripted drop is under the threshold');
  const script: { values: ChaseCameraInput; impact?: number }[] = [];
  const ride = (seconds: number, groundAt: (t: number) => number, speed: number): void => {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i += 1) {
      const y = groundAt(i * STEP);
      script.push({ values: input({ y, groundY: y, speed }) });
    }
  };
  const fly = (from: number, vy0: number, groundAt: (t: number) => number, speed: number, crashed = false): void => {
    for (let k = 1; ; k += 1) {
      const y = ballistic(from, vy0, k);
      const groundY = groundAt(k * STEP);
      if (y <= groundY) {
        script.push({ values: input({ y: groundY, groundY, speed, crashed }), impact: 4 });
        return;
      }
      script.push({ values: input({ y, groundY, speed, airborne: true }) });
    }
  };
  ride(1, () => 0, 9);
  ride(1, () => 1.2, 9);
  fly(1.2, 0, () => 0, 9);
  ride(0.5, () => 0, 9);
  ride(2, (t) => 2.5 * t, 9);
  ride(0.15, (t) => 5 + 5 * t, 9);
  fly(5.75, PAD_VERTICAL, (t) => (t < 0.3 ? 5 : 0), 9);
  ride(1, () => 0, 9);
  ride(0.5, () => 8.9, 6);
  fly(8.9, 0, () => 0, 6, true);
  for (let i = 0; i < SIMULATION.hz; i += 1) script.push({ values: input({ crashed: true }) });

  const camera = new ChaseCamera();
  const unlatched = new ChaseCamera({ tuning: { deepDropMetres: Infinity } });
  camera.reset(script[0].values);
  unlatched.reset(script[0].values);
  const state = createChaseCameraState();
  const unlatchedState = createChaseCameraState();
  let reference = 0;
  let airborne = 0;
  script.forEach(({ values, impact }, index) => {
    if (impact !== undefined) {
      camera.landingImpulse(impact);
      unlatched.landingImpulse(impact);
    }
    camera.step(STEP, values);
    unlatched.step(STEP, values);
    reference = preM44HeightLag(reference, STEP, values, tuning);
    camera.writeState(state);
    unlatched.writeState(unlatchedState);
    assert.equal(state.heightLag, reference, `step ${index}: lag ${state.heightLag} vs the pre-M44 ${reference}`);
    assert.deepEqual(state, unlatchedState, `step ${index}: the whole camera state`);
    if (values.airborne) airborne += 1;
  });
  assert.ok(airborne > 150, `sanity: the script flies (${airborne} airborne steps)`);
  assert.ok(Math.max(...script.map(({ values }) => values.y - values.groundY)) > 5, 'sanity: real heights');
});

test('a deep flight over a hillside, which never falls away in one step, is the pre-M44 camera, bit for bit', () => {
  // Switchback's summit rims: a fast rider leaving them sideways flies more
  // than deepDropMetres over the slope below, but a heightfield falls only a
  // cell's slope between two steps (0.365 m at worst there). Only a sheer step
  // — a building's edge — may take the latched path, so this stays the old rule.
  const tuning = defaultChaseCameraTuning();
  const rim = 16;
  const perStep = 0.36;
  assert.ok(perStep < tuning.sheerDropMetres, 'sanity: the slope never falls a sheer step');
  const camera = new ChaseCamera();
  run(camera, 1, input({ y: rim, groundY: rim, speed: 24 }));
  const state = createChaseCameraState();
  let reference = 0;
  let deepest = 0;
  for (let k = 1; ; k += 1) {
    const y = ballistic(rim, 1.5, k);
    const groundY = Math.max(0, rim - perStep * k);
    if (y <= groundY) break;
    const values = input({ y, groundY, speed: 24, airborne: true });
    camera.step(STEP, values);
    camera.writeState(state);
    reference = preM44HeightLag(reference, STEP, values, tuning);
    assert.equal(state.heightLag, reference, `step ${k}: lag ${state.heightLag} vs the pre-M44 ${reference}`);
    deepest = Math.max(deepest, rim - groundY);
  }
  assert.ok(deepest > tuning.deepDropMetres, `sanity: the flight is ${deepest} m deep`);
});

test('a reset clears the takeoff latch, and a reset onto a deck is where the next flight leaves from', () => {
  const tuning = defaultChaseCameraTuning();
  const follow = 1 - tuning.airHeightFollow;
  const camera = new ChaseCamera();
  const state = createChaseCameraState();
  run(camera, 0.5, input({ y: DECK, groundY: DECK, speed: 18 }));
  // Off the deck and over the alley: the latched path.
  for (let k = 1; k <= 24; k += 1) {
    camera.step(STEP, input({ y: ballistic(DECK, PAD_VERTICAL, k), groundY: ALLEY, speed: 18, airborne: true }));
  }

  // A snap onto a body already in the air, 3 m over the alley floor (`watch`):
  // that flight has stood on nothing, so it is the pre-M44 rule. A latch that
  // survived the reset would read the hop off the 11 m deck and hold no lag.
  camera.reset(input({ y: 3, groundY: ALLEY, speed: 12, airborne: true }));
  let reference = 0;
  let largest = 0;
  for (let k = 1; ; k += 1) {
    const y = ballistic(3, 0, k);
    if (y <= ALLEY) break;
    const values = input({ y, groundY: ALLEY, speed: 12, airborne: true });
    camera.step(STEP, values);
    camera.writeState(state);
    reference = preM44HeightLag(reference, STEP, values, tuning);
    assert.equal(state.heightLag, reference, `step ${k} after the mid-air reset`);
    largest = Math.max(largest, reference);
  }
  assert.ok(largest > 1, `sanity: the flight after the reset carried a real lag (${largest})`);

  // A snap onto the deck, then straight off it with no grounded step between:
  // the reset itself is the ground the flight left from.
  camera.reset(input({ y: DECK, groundY: DECK, speed: 18 }));
  for (let k = 1; PAD_VERTICAL - GRAVITY * k * STEP > 0; k += 1) {
    const y = ballistic(DECK, PAD_VERTICAL, k);
    camera.step(STEP, input({ y, groundY: ALLEY, speed: 18, airborne: true }));
    camera.writeState(state);
    assert.ok(state.heightLag <= (y - DECK) * follow + 1e-12, `step ${k}: lag ${state.heightLag} read off the alley`);
  }
});

// --- The crash focus, 1.3.1 -------------------------------------------------

/** The resolved view for one stepped state, at the wheel the input names. */
function viewOf(camera: ChaseCamera, values: ChaseCameraInput) {
  const state = createChaseCameraState();
  camera.writeState(state);
  const view = createChaseCameraView();
  resolveChaseView(state, values, camera.tuning, view);
  return { state, view };
}

test('riding, the crash focus is exactly nothing, even with a body reported off the wheel', () => {
  const camera = new ChaseCamera();
  const riding = input({ speed: 12, x: 3, z: 40, bodyX: 30, bodyY: 5, bodyZ: -20 });
  camera.reset(riding);
  run(camera, 2, riding);
  const { state } = viewOf(camera, riding);
  assert.equal(state.focusX, 0);
  assert.equal(state.focusY, 0);
  assert.equal(state.focusZ, 0);
});

test('a crash eases the focus off the wheel onto the body', () => {
  const camera = new ChaseCamera();
  camera.reset(input());
  const down = input({ crashed: true, bodyX: 0, bodyZ: 4 });
  camera.step(STEP, down);
  const first = viewOf(camera, down).state.focusZ;
  assert.ok(first > 0 && first < 0.4, `no snap on the first step: ${first}`);
  run(camera, 3, down);
  assert.ok(Math.abs(viewOf(camera, down).state.focusZ - 4) < 1e-3, 'on the body');
});

test('a wheel that rolls far beyond the rider leaves the rider in frame', () => {
  // The owner's 65 mph wipeout (§50.2): the wheel rolls on 23 m past the
  // rider. Before 1.3.1 the camera, hung off the wheel, stood 8 m past the
  // body looking away from it.
  const camera = new ChaseCamera();
  const thrown = input({ z: 23, crashed: true, bodyX: 0, bodyZ: 0 });
  camera.reset(thrown);
  run(camera, 3, thrown);
  const { state, view } = viewOf(camera, thrown);
  const focusZ = thrown.z + state.focusZ;
  assert.ok(Math.abs(focusZ) < 0.01, `on the body: ${focusZ}`);
  // The camera stands behind the body along the heading and looks forward,
  // past the body, toward the wheel that rolled on.
  assert.ok(view.positionZ < 0, `camera behind the body: ${view.positionZ}`);
  assert.ok(view.targetZ > view.positionZ);
});

test('recovery hands the camera back to the wheel without a cut', () => {
  const camera = new ChaseCamera();
  camera.reset(input({ z: 20 }));
  run(camera, 2, input({ z: 20, crashed: true, bodyX: 0, bodyZ: 0 }));
  // The crash ends with the rider back on the wheel where it stands.
  const back = input({ z: 20 });
  let previous = viewOf(camera, back).state.focusZ;
  for (let i = 0; i < SIMULATION.hz * 3; i += 1) {
    camera.step(STEP, back);
    const now = viewOf(camera, back).state.focusZ;
    assert.ok(Math.abs(now - previous) <= camera.tuning.crashFocusMaxRate * STEP + 1e-9, `step ${i} moved ${now - previous} m`);
    previous = now;
  }
  assert.ok(Math.abs(previous) < 0.01, 'back on the wheel');
});

test('the obstruction probe is cast from the crash focus', () => {
  const camera = new ChaseCamera();
  const origins: number[] = [];
  camera.setOcclusionProbe((origin) => { origins.push(origin.z); return null; });
  camera.reset(input({ z: 23 }));
  run(camera, 3, input({ z: 23, crashed: true, bodyX: 0, bodyZ: 0 }));
  assert.ok(Math.abs(origins[origins.length - 1]) < 0.01, 'cast from the body, not the wheel 23 m on');
});

test('a recovery that places the rider elsewhere takes the focus with it in one step', () => {
  const camera = new ChaseCamera();
  camera.reset(input({ z: 20 }));
  run(camera, 2, input({ z: 20, crashed: true, bodyX: 0, bodyZ: 0 }));
  assert.ok(viewOf(camera, input({ z: 20 })).state.focusZ < -10);
  // The last safe spot, 60 m away: the wheel is put there, not ridden there.
  camera.step(STEP, input({ x: 60, z: 5 }));
  const { state } = viewOf(camera, input({ x: 60, z: 5 }));
  assert.equal(state.focusX, 0);
  assert.equal(state.focusZ, 0);
});
