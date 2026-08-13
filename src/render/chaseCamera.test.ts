/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CAMERA, SIMULATION } from '../data/tuning.ts';
import {
  ChaseCamera,
  bankTargetFor,
  createChaseCameraState,
  createChaseCameraView,
  defaultChaseCameraTuning,
  resolveChaseView,
  type ChaseCameraInput,
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
