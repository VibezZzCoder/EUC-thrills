/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ActionState, NEUTRAL_ACTIONS, PRESSED_ACTIONS } from './actions.ts';
import { HELD_BINDINGS, PRESSED_BINDINGS, DEBUG_BINDINGS } from './bindings.ts';
import { INPUT } from '../data/tuning.ts';

const BUFFER = INPUT.actionBufferSeconds;

test('held keys resolve to signed axes using the world convention', () => {
  const state = new ActionState();

  state.setHeld('accelerate', true);
  assert.equal(state.sample(0).throttle, 1);

  state.setHeld('brake', true);
  assert.equal(state.sample(0).throttle, 0, 'both held is neutral, not last-wins');

  state.setHeld('accelerate', false);
  assert.equal(state.sample(0).throttle, -1);

  // Steering right is positive. This is the rider's right as the *player*
  // means it; which world axis that is belongs to the controller, and is not
  // the axis a first reading suggests — see data/tuning.ts.
  state.clearAll();
  state.setHeld('steerRight', true);
  assert.equal(state.sample(0).steer, 1);
  state.setHeld('steerLeft', true);
  assert.equal(state.sample(0).steer, 0);
});

test('a one-shot press is consumed exactly once', () => {
  const state = new ActionState();
  state.press('hop', 0);

  assert.equal(state.sample(0).hop, true);
  assert.equal(state.consume('hop', 0), true);
  assert.equal(state.consume('hop', 0), false, 'one press, one hop');
  assert.equal(state.sample(0).hop, false);
});

test('a press stays claimable for the buffer window and no longer', () => {
  const state = new ActionState();
  state.press('hop', 0);

  // The point of the buffer: a hop pressed just before the wheel touches down
  // still fires. Without it the press is dropped between two fixed steps.
  assert.equal(state.consume('hop', BUFFER * 0.99), true);

  state.press('hop', 1);
  assert.equal(state.consume('hop', 1 + BUFFER * 1.01), false, 'a stale press must lapse');
});

test('re-pressing refreshes the latch rather than queueing a second action', () => {
  const state = new ActionState();
  state.press('hop', 0);
  state.press('hop', 0.05);

  assert.equal(state.consume('hop', 0.06), true);
  assert.equal(state.consume('hop', 0.06), false, 'two hops from one finger is never meant');
});

test('reading a pending press does not consume it', () => {
  const state = new ActionState();
  state.press('reset', 0);

  assert.equal(state.isPending('reset', 0), true);
  assert.equal(state.isPending('reset', 0), true);
  assert.equal(state.consume('reset', 0), true);
});

test('clearAll implements the input reset contract', () => {
  const state = new ActionState();
  state.setHeld('accelerate', true);
  state.press('hop', 0);
  state.setScripted({ steer: 1 }, 0);

  // A key held when the tab loses focus never delivers its keyup. Without this
  // the rider comes back from a tab switch already at full throttle.
  state.clearAll();

  assert.deepEqual(state.sample(0), NEUTRAL_ACTIONS);
});

test('clearPending drops buffered one-shots but keeps the player holding the keys', () => {
  const state = new ActionState();
  state.setHeld('accelerate', true);
  state.press('hop', 0);

  state.setHeld('hopHeld', true);

  state.clearPending();

  assert.equal(state.sample(0).hop, false);
  assert.equal(state.sample(0).throttle, 1, 'a layout change does not lift the throttle key');
  // The same call is the race countdown's GO (M36 Phase 3's decision): a hop
  // buffered during the lights is aimed at a frame that never came, while the
  // key the rider is holding is still being held. Safe for the pose because it
  // is airborne-only and the countdown substitutes `NEUTRAL_ACTIONS` anyway.
  assert.equal(state.sample(0).hopHeld, true, 'nor the Hop key');
});

test('scripted axes override the device and persist until overwritten', () => {
  const state = new ActionState();
  state.setHeld('accelerate', true);

  state.setScripted({ throttle: -0.5 }, 0);
  assert.equal(state.sample(0).throttle, -0.5);
  assert.equal(state.sample(9).throttle, -0.5, 'a spec sets throttle once and expects it to hold');

  state.clearScripted();
  assert.equal(state.sample(0).throttle, 1, 'clearing hands the axis back to the device');
});

test('scripted axes are clamped, and a non-finite value is rejected as neutral', () => {
  const state = new ActionState();
  state.setScripted({ throttle: 12, steer: -9 }, 0);
  assert.equal(state.sample(0).throttle, 1);
  assert.equal(state.sample(0).steer, -1);

  state.setScripted({ throttle: Number.NaN }, 0);
  assert.equal(state.sample(0).throttle, 0);
});

test('crouch is the logical OR of the two devices, not a shared boolean', () => {
  const state = new ActionState();

  state.setHeld('crouch', true);
  state.setScripted({ crouch: true }, 0);
  // Releasing one device must not clear an intent the other is still holding.
  state.setScripted({ crouch: false }, 0);
  assert.equal(state.sample(0).crouch, true);

  state.setHeld('crouch', false);
  assert.equal(state.sample(0).crouch, false);
});

test('setScripted latches a one-shot, and false drops an unconsumed latch', () => {
  const state = new ActionState();

  state.setScripted({ hop: true }, 0);
  assert.equal(state.consume('hop', 0), true);

  state.setScripted({ hop: true }, 1);
  state.setScripted({ hop: false }, 1);
  assert.equal(state.consume('hop', 1), false);
});

test('every one-shot action is bound, and no key is bound twice', () => {
  const bound = new Set(Object.values(PRESSED_BINDINGS));
  for (const action of PRESSED_ACTIONS) {
    assert.ok(bound.has(action), `"${action}" has no default key binding`);
  }

  // A key that means two things does whichever the lookup reaches first, which
  // is a bug that presents as one of the two actions simply not working.
  const codes = [
    ...Object.keys(HELD_BINDINGS),
    ...Object.keys(PRESSED_BINDINGS),
    ...Object.keys(DEBUG_BINDINGS),
  ];
  assert.equal(new Set(codes).size, codes.length, 'a key code is bound more than once');
});

// ---------------------------------------------------------------------------
// M36 Phase 3 — the Hop control's second meaning (docs/PLANS.md §36.5)
// ---------------------------------------------------------------------------

test('the hop latch and the hop hold are independent readings of one control', () => {
  const state = new ActionState();

  // What a finger on the Hop key does: one press, and a level that stays.
  state.press('hop', 0);
  state.setHeld('hopHeld', true);
  assert.equal(state.sample(0).hop, true);
  assert.equal(state.sample(0).hopHeld, true);

  // "The controller's hop and spin consumption does not consume this hold."
  assert.equal(state.consume('hop', 0), true);
  assert.equal(state.sample(0).hop, false);
  assert.equal(state.sample(0).hopHeld, true, 'a consumed press must not let go of the key');

  // "Holding does not mint additional presses." The level is not a press
  // generator: nothing here can produce a second hop without a second `press`.
  assert.equal(state.consume('hop', 0.001), false);
  assert.equal(state.consume('hop', 1), false, 'and not later in the same hold either');
  assert.equal(state.sample(1).hopHeld, true);

  state.setHeld('hopHeld', false);
  assert.equal(state.sample(1).hopHeld, false);
});

test('the hop hold is the OR of the devices, and each device lets go of its own', () => {
  const state = new ActionState();

  state.setHeld('hopHeld', true, 'gamepad');
  state.setHeld('hopHeld', true, 'touch');
  // A pad pulled out mid-flight must not release a thumb still on the glass.
  state.clearDevice('gamepad');
  assert.equal(state.sample(0).hopHeld, true);

  state.clearDevice('touch');
  assert.equal(state.sample(0).hopHeld, false);
});

test('every reset contract drops the hop hold', () => {
  const state = new ActionState();

  // The layout-change reset takes the device's grip with everything else.
  state.setHeld('hopHeld', true, 'keyboard');
  state.clearDevices();
  assert.equal(state.sample(0).hopHeld, false);

  // Focus loss takes it too, and `NEUTRAL_ACTIONS` is the shape it lands in —
  // which is also what makes the countdown and pause substitutions suppress
  // the pose at the composition root with no branch there.
  state.setHeld('hopHeld', true, 'touch');
  state.setScripted({ hopHeld: true }, 0);
  state.clearAll();
  assert.deepEqual(state.sample(0), NEUTRAL_ACTIONS);
  assert.equal(NEUTRAL_ACTIONS.hopHeld, false);
});

test('a scripted hop hold follows the scripted contract, exactly as crouch does', () => {
  const state = new ActionState();

  state.setScripted({ hopHeld: true }, 0);
  assert.equal(state.sample(0).hopHeld, true);
  assert.equal(state.sample(9).hopHeld, true, 'a spec sets it once and expects it to hold');

  // The QA bridge is not a device: a resize cannot lose its keyup.
  state.clearDevices();
  assert.equal(state.sample(9).hopHeld, true);

  // Two writers, one intent: releasing the bridge must not release the finger.
  state.setHeld('hopHeld', true, 'touch');
  state.setScripted({ hopHeld: false }, 9);
  assert.equal(state.sample(9).hopHeld, true);

  // Handing the seat back to the devices drops the bridge's value and only it.
  state.setScripted({ hopHeld: true }, 9);
  state.clearScripted();
  assert.equal(state.sample(9).hopHeld, true, 'the finger on the glass is untouched');
  state.clearDevice('touch');
  assert.equal(state.sample(9).hopHeld, false);
});

test('the hop hold is not a one-shot, and is not offered as one', () => {
  // `PRESSED_ACTIONS` is what `setScripted` and Game's consume loop walk. A
  // level that leaked into it would be consumed once and released by the
  // consumption — the exact failure the array exists to make visible.
  assert.equal(PRESSED_ACTIONS.includes('hop'), true);
  assert.equal((PRESSED_ACTIONS as readonly string[]).includes('hopHeld'), false);

  const state = new ActionState();
  state.setScripted({ hopHeld: true }, 0);
  assert.equal(state.isPending('hop', 0), false, 'a scripted hold latches no press');
});
