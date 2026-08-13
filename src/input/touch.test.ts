/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { INPUT } from '../data/tuning.ts';
import { ActionState } from './actions.ts';
import { TOUCH_DEFAULTS, TouchInput, axisFromDisplacement } from './touch.ts';

interface Rig {
  state: ActionState;
  input: TouchInput;
  now: { value: number };
  stickEvents: Array<{ throttle: number; steer: number }>;
}

function rig(viewportWidth?: number): Rig {
  const state = new ActionState();
  const now = { value: 0 };
  const stickEvents: Array<{ throttle: number; steer: number }> = [];
  const input = new TouchInput(state, {
    now: () => now.value,
    viewportWidth: viewportWidth === undefined ? undefined : () => viewportWidth,
    onStickChange: (throttle, steer) => stickEvents.push({ throttle, steer }),
  });
  input.setEnabled(true);
  return { state, input, now, stickEvents };
}

function sample(r: Rig) {
  return r.state.sample(r.now.value);
}

// -- Floating two-axis stick -----------------------------------------------

test('identical drags mean the same thing wherever the floating stick begins', () => {
  const r = rig();
  const travel = TOUCH_DEFAULTS.stickTravelPx;

  r.input.stickStart(1, 40, 700);
  r.input.stickMove(1, 40 + travel, 700 - travel);
  const first = sample(r);
  r.input.stickEnd(1);

  r.input.stickStart(2, 500, 300);
  r.input.stickMove(2, 500 + travel, 300 - travel);
  const second = sample(r);

  assert.deepEqual(
    { throttle: first.throttle, steer: first.steer },
    { throttle: second.throttle, steer: second.steer },
  );
  assert.equal(second.throttle, 1);
  assert.equal(second.steer, 1);
});

test('a portrait thumb near the screen edge can still reach full lock both ways', () => {
  const r = rig(390);
  const originX = 60;
  r.input.stickStart(1, originX, 600);

  // Only 60 px of glass exists to the left, less than the normal 84 px throw.
  // Reaching the physical edge must still mean full lock on a narrow phone.
  r.input.stickMove(1, 0, 600);
  assert.equal(sample(r).steer, -1);

  // The roomy direction retains the authored throw rather than inheriting the
  // constrained side's higher sensitivity.
  r.input.stickMove(1, originX + TOUCH_DEFAULTS.stickTravelPx, 600);
  assert.equal(sample(r).steer, 1);
});

test('up accelerates and down brakes or reverses', () => {
  const r = rig();
  const travel = TOUCH_DEFAULTS.stickTravelPx;
  r.input.stickStart(1, 200, 500);

  r.input.stickMove(1, 200, 500 - travel);
  assert.equal(sample(r).throttle, 1);
  r.input.stickMove(1, 200, 500 + travel);
  assert.equal(sample(r).throttle, -1);
});

test('right is positive carve intent and left is negative', () => {
  const r = rig();
  const travel = TOUCH_DEFAULTS.stickTravelPx;
  r.input.stickStart(1, 200, 500);

  r.input.stickMove(1, 200 + travel, 500);
  assert.equal(sample(r).steer, 1);
  r.input.stickMove(1, 200 - travel, 500);
  assert.equal(sample(r).steer, -1);
});

test('a diagonal drag carries throttle and carve at the same time', () => {
  const r = rig();
  const travel = TOUCH_DEFAULTS.stickTravelPx;
  r.input.stickStart(1, 200, 500);
  r.input.stickMove(1, 200 + travel, 500 - travel);

  assert.deepEqual(
    { throttle: sample(r).throttle, steer: sample(r).steer },
    { throttle: 1, steer: 1 },
  );
});

test('the dead zone is subtracted and the remaining range reaches full intent', () => {
  const travel = TOUCH_DEFAULTS.stickTravelPx;
  const dead = TOUCH_DEFAULTS.stickDeadZonePx;
  const curve = TOUCH_DEFAULTS.stickCurve;

  assert.equal(axisFromDisplacement(dead, travel, dead, curve), 0);
  assert.equal(axisFromDisplacement(-dead, travel, dead, curve), 0);
  assert.equal(axisFromDisplacement(travel, travel, dead, curve), 1);
  assert.equal(axisFromDisplacement(-travel * 4, travel, dead, curve), -1);
  const justOutside = axisFromDisplacement(dead + 1, travel, dead, curve);
  assert.ok(justOutside > 0 && justOutside < 0.05);
});

test('the shaping curve softens the centre without costing the ends', () => {
  const travel = TOUCH_DEFAULTS.stickTravelPx;
  const dead = TOUCH_DEFAULTS.stickDeadZonePx;
  const half = dead + (travel - dead) / 2;
  assert.ok(
    axisFromDisplacement(half, travel, dead, TOUCH_DEFAULTS.stickCurve)
      < axisFromDisplacement(half, travel, dead, 1),
  );
  assert.equal(axisFromDisplacement(travel, travel, dead, TOUCH_DEFAULTS.stickCurve), 1);
});

test('a second finger cannot steal the stick or its origin', () => {
  const r = rig();
  const travel = TOUCH_DEFAULTS.stickTravelPx;
  assert.equal(r.input.stickStart(1, 200, 500), true);
  r.input.stickMove(1, 200 + travel, 500);
  assert.equal(r.input.stickStart(2, 600, 200), false);

  r.input.stickMove(2, 0, 900);
  assert.equal(sample(r).steer, 1);
  assert.equal(r.input.stickEnd(2), false);
  assert.equal(sample(r).steer, 1);
});

test('releasing the stick neutralises both axes', () => {
  const r = rig();
  r.input.stickStart(1, 200, 500);
  r.input.stickMove(1, 400, 300);
  assert.equal(r.input.stickEnd(1), true);
  assert.deepEqual(
    { throttle: sample(r).throttle, steer: sample(r).steer },
    { throttle: 0, steer: 0 },
  );
});

test('non-finite displacement is neutral', () => {
  assert.equal(axisFromDisplacement(Number.NaN, 84, 5, 1.35), 0);
  assert.equal(axisFromDisplacement(Number.POSITIVE_INFINITY, 84, 5, 1.35), 0);
});

// -- Shift and Space --------------------------------------------------------

test('CHARGE is Shift: crouch is held until that pointer releases', () => {
  const r = rig();
  assert.equal(r.input.buttonDown('crouch', 1), true);
  assert.equal(sample(r).crouch, true);
  r.input.buttonUp('crouch', 1);
  assert.equal(sample(r).crouch, false);
});

test('HOP is Space: the one-shot latches on press, not release', () => {
  const r = rig();
  assert.equal(r.input.buttonDown('hop', 1), true);
  assert.equal(sample(r).hop, true);
  assert.equal(r.state.consume('hop', r.now.value), true);
  r.input.buttonUp('hop', 1);
  assert.equal(sample(r).hop, false, 'release does not create a second hop');
});

test('CHARGE and HOP can be used by two fingers for a charged jump', () => {
  const r = rig();
  r.input.buttonDown('crouch', 1);
  r.now.value = 0.4;
  r.input.buttonDown('hop', 2);
  const charged = sample(r);
  assert.equal(charged.crouch, true);
  assert.equal(charged.hop, true);
});

test('a stray second finger cannot release a button it does not own', () => {
  const r = rig();
  assert.equal(r.input.buttonDown('crouch', 1), true);
  assert.equal(r.input.buttonDown('crouch', 2), false);
  r.input.buttonUp('crouch', 2);
  assert.equal(sample(r).crouch, true);
  r.input.buttonUp('crouch', 1);
  assert.equal(sample(r).crouch, false);
});

test('a pointer releases its control by identity, wherever it ended', () => {
  const r = rig();
  r.input.buttonDown('crouch', 1);
  assert.equal(r.input.releasePointer(1), 'crouch');
  assert.equal(sample(r).crouch, false);

  r.input.stickStart(2, 100, 400);
  r.input.stickMove(2, 300, 200);
  assert.equal(r.input.releasePointer(2), 'stick');
  assert.equal(sample(r).throttle, 0);
  assert.equal(sample(r).steer, 0);
});

test('releasing an unknown pointer does nothing', () => {
  const r = rig();
  r.input.buttonDown('crouch', 1);
  assert.equal(r.input.releasePointer(99), null);
  assert.equal(sample(r).crouch, true);
});

test('system taps latch exactly one press each', () => {
  const r = rig();
  r.input.tap('pause');
  assert.equal(sample(r).pause, true);
  assert.equal(r.state.consume('pause', r.now.value), true);
  assert.equal(r.state.consume('pause', r.now.value), false);
  r.input.tap('reset');
  assert.equal(sample(r).reset, true);
});

// -- Lifecycle, devices, and scale -----------------------------------------

test('a disabled layer writes nothing', () => {
  const r = rig();
  r.input.setEnabled(false);
  r.input.stickStart(1, 100, 400);
  r.input.stickMove(1, 400, 100);
  r.input.buttonDown('crouch', 2);
  r.input.buttonDown('hop', 3);
  r.input.tap('pause');
  assert.deepEqual(
    { throttle: sample(r).throttle, steer: sample(r).steer, crouch: sample(r).crouch,
      hop: sample(r).hop, pause: sample(r).pause },
    { throttle: 0, steer: 0, crouch: false, hop: false, pause: false },
  );
});

test('taking the controls away releases the stick and CHARGE', () => {
  const r = rig();
  r.input.stickStart(1, 200, 500);
  r.input.stickMove(1, 400, 300);
  r.input.buttonDown('crouch', 2);
  r.input.setEnabled(false);
  assert.deepEqual(
    { throttle: sample(r).throttle, steer: sample(r).steer, crouch: sample(r).crouch },
    { throttle: 0, steer: 0, crouch: false },
  );
});

test('an orientation reset forgets every pointer and the old two-axis origin', () => {
  const r = rig();
  r.input.stickStart(2, 200, 500);
  r.input.stickMove(2, 400, 300);
  r.input.buttonDown('crouch', 3);
  r.input.reset();
  assert.deepEqual(
    { throttle: sample(r).throttle, steer: sample(r).steer, crouch: sample(r).crouch },
    { throttle: 0, steer: 0, crouch: false },
  );
  r.input.stickMove(2, 900, 0);
  assert.equal(sample(r).throttle, 0);
  assert.equal(r.input.stickStart(2, 900, 100), true);
});

test('a touch reset never clears what the keyboard is holding', () => {
  const r = rig();
  r.state.setHeld('crouch', true, 'keyboard');
  r.input.buttonDown('crouch', 1);
  r.input.reset();
  assert.equal(sample(r).crouch, true);
});

test('the stronger device wins independently on throttle and steer', () => {
  const r = rig();
  r.state.setAxes('gamepad', 0.9, -0.9);
  r.input.stickStart(1, 200, 500);
  r.input.stickMove(
    1,
    200 + TOUCH_DEFAULTS.stickDeadZonePx + 6,
    500 - TOUCH_DEFAULTS.stickDeadZonePx - 6,
  );
  assert.equal(sample(r).throttle, 0.9);
  assert.equal(sample(r).steer, -0.9);
});

test('enlarging the control enlarges both axis throws', () => {
  const r = rig();
  const travel = TOUCH_DEFAULTS.stickTravelPx;
  r.input.setScale(2);
  r.input.stickStart(1, 200, 500);
  r.input.stickMove(1, 200 + travel, 500 - travel);
  assert.ok(sample(r).throttle < 1);
  assert.ok(sample(r).steer < 1);
  r.input.stickMove(1, 200 + travel * 2, 500 - travel * 2);
  assert.equal(sample(r).throttle, 1);
  assert.equal(sample(r).steer, 1);
});

test('the callbacks report the same two axes written to the action state', () => {
  const r = rig();
  r.input.stickStart(1, 200, 500);
  r.input.stickMove(1, 300, 400);
  assert.deepEqual(r.stickEvents.at(-1), {
    throttle: sample(r).throttle,
    steer: sample(r).steer,
  });
});

test('documented fallbacks agree with the shipped tuning table', () => {
  assert.equal(TOUCH_DEFAULTS.stickTravelPx, INPUT.touchStickTravelPx);
  assert.equal(TOUCH_DEFAULTS.stickDeadZonePx, INPUT.touchStickDeadZonePx);
  assert.equal(TOUCH_DEFAULTS.stickCurve, INPUT.touchStickCurve);
});
