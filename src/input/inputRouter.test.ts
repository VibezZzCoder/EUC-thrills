/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ActionState } from './actions.ts';
import { InputRouter, KEYBOARD_DEVICE, padDeviceId } from './inputRouter.ts';

/**
 * The input router against nothing but action states — M25 Phase 4.
 *
 * Every rule this class exists to hold is arithmetic over two maps, so none of
 * it needs a browser, a pad, or a game. What is worth proving here is the
 * handful of behaviours a couch would notice and nobody would find by reading:
 * that the single-player game is the no-claims case rather than a branch, that
 * a flat battery holds a seat instead of dissolving it, and that a device
 * leaving a seat hands back what it was holding.
 */

function router(options: { keyboardSeats?: ActionState[] } = {}): {
  router: InputRouter;
  seatZero: ActionState;
  keyboardSeats: ActionState[];
  keyboardRides: boolean[];
  changes: number[];
} {
  const seatZero = new ActionState();
  const keyboardSeats = options.keyboardSeats ?? [];
  const keyboardRides: boolean[] = [];
  const changes: number[] = [];
  const built = new InputRouter(seatZero, {
    onKeyboardSeat: (state, rides) => { keyboardSeats.push(state); keyboardRides.push(rides); },
    // The count, not a boolean: what a panel and a status line need to know is
    // that *something* moved, and a missing notification is invisible unless
    // the test can say how many arrived.
    onClaimsChange: () => changes.push(changes.length),
  });
  return { seatZero, keyboardSeats, keyboardRides, changes, router: built };
}

test('with nothing claimed, the first standard pad is seat 0 and the rest ride nobody', () => {
  const { router: input, seatZero } = router();
  input.addSeat();

  // The whole of M9's adopt-one rule, expressed as routing rather than as a
  // branch: this is the single-player game, and there is no couch flag to be
  // in the wrong state.
  assert.equal(input.sinkForPad(0, 0), seatZero);
  assert.equal(input.sinkForPad(3, 0), seatZero, 'the slot number is not the rule; the order is');
  assert.equal(input.sinkForPad(1, 1), null, 'a spectator pad steers nobody');
  assert.equal(input.keyboardSeat, 0);
});

test('a claim moves a pad off the order rule and onto the seat it took', () => {
  const { router: input } = router();
  const seatOne = input.stateFor(input.addSeat());

  input.openClaims();
  assert.equal(input.claimPress(padDeviceId(7)), true);
  assert.equal(input.seatFor(padDeviceId(7)), 0, 'the first press takes the first free seat');
  assert.equal(input.claimPress(padDeviceId(2)), true);
  assert.equal(input.seatFor(padDeviceId(2)), 1);

  // Order stops mattering the moment identity does, and an unclaimed pad in a
  // couch session drives nobody — a spectator's controller steering a player
  // is the failure this refuses.
  assert.equal(input.sinkForPad(2, 0), seatOne, "even read first, pad 2 is seat 1's");
  assert.equal(input.sinkForPad(9, 2), null);
});

test('a claim needs an open window, and a seated device does not re-seat itself', () => {
  const { router: input } = router();
  input.addSeat();

  // A is confirm and Start is pause during a ride. A device that could claim
  // at any moment would turn either of those into a silent re-seat.
  assert.equal(input.claimPress(padDeviceId(0)), false, 'the window is shut');
  assert.equal(input.seatFor(padDeviceId(0)), null);

  input.openClaims();
  assert.equal(input.claimPress(padDeviceId(0)), true);
  assert.equal(input.claimPress(padDeviceId(0)), false, 'leaning on A must not shuffle the couch');
  assert.equal(input.seatFor(padDeviceId(0)), 0);

  input.closeClaims();
  assert.equal(input.claimPress(KEYBOARD_DEVICE), false);
  assert.equal(input.seatFor(KEYBOARD_DEVICE), null, 'and the claims already made stand');
  assert.equal(input.seatFor(padDeviceId(0)), 0);
});

test('the keyboard is one unit, and its layer is re-pointed the moment it moves', () => {
  const { router: input, seatZero, keyboardSeats } = router();
  const seatOne = input.stateFor(input.addSeat());

  input.openClaims();
  input.claimPress(padDeviceId(0));
  // **This line used to read "a pad claim is no business of the keyboard",
  // and that belief was the bug** (M25 Phase 5 QA). It is true of the *sink* —
  // seat 0 is still where the keys would land — and false of everything else:
  // somebody else taking a seat is precisely what turns this keyboard into a
  // spectator's. The owner found it with two pads plugged in, brushing the
  // keys and steering Player 1.
  assert.equal(input.keyboardSeat, 0, 'the sink has not moved');
  assert.equal(input.keyboardRides, false, 'but it no longer drives anybody');
  assert.deepEqual(keyboardSeats.at(-1), seatZero, 'and the layer was told so');

  input.claimPress(KEYBOARD_DEVICE);
  assert.equal(input.keyboardSeat, 1);
  // `at(-1)` rather than the whole list: since the fix above the layer is told
  // on every seat change, not only its own, so what matters is where it ended
  // up rather than how many times it was addressed.
  assert.equal(keyboardSeats.at(-1), seatOne, 'the layer is told, not asked');
  assert.equal(input.keyboardRides, true, 'a claimed keyboard rides again');

  input.clearClaims();
  assert.equal(input.keyboardSeat, 0);
  assert.equal(keyboardSeats.at(-1), seatZero, 'the end of a session is the single-player game');
});

test('swap exchanges the seats and hands both of them back their axes', () => {
  const { router: input, seatZero, keyboardSeats } = router();
  const seatOne = input.stateFor(input.addSeat());

  input.openClaims();
  input.claimPress(padDeviceId(0));
  input.claimPress(KEYBOARD_DEVICE);

  // Two riders holding what they were holding at the moment they exchanged
  // bodies is the failure: a throttle held by the pad that was seat 0's must
  // not carry into seat 1's first step.
  seatZero.setAxes('gamepad', 1, 0);
  seatOne.setHeld('accelerate', true, 'keyboard');

  assert.equal(input.swap(), true);
  assert.equal(input.seatFor(padDeviceId(0)), 1);
  assert.equal(input.seatFor(KEYBOARD_DEVICE), 0);
  assert.equal(seatZero.sample(0).throttle, 0);
  assert.equal(seatOne.sample(0).throttle, 0);
  assert.equal(keyboardSeats.at(-1), seatZero, 'the keyboard now drives seat 0');
});

test('swap is a no-op below two claims rather than half a job', () => {
  const { router: input } = router();
  input.addSeat();
  input.openClaims();
  input.claimPress(padDeviceId(0));

  assert.equal(input.swap(), false);
  assert.equal(input.seatFor(padDeviceId(0)), 0, 'one device cannot change places with nobody');
});

test('unclaim releases the seat and drops what the device was holding', () => {
  const { router: input } = router();
  const seatOne = input.stateFor(input.addSeat());

  input.openClaims();
  input.claimPress(padDeviceId(0));
  input.claimPress(padDeviceId(1));
  seatOne.setAxes('gamepad', 0, 1);

  assert.equal(input.unclaim(1), true);
  assert.equal(input.seatFor(padDeviceId(1)), null);
  assert.equal(seatOne.sample(0).steer, 0, 'a stick let go of at the panel must not steer on');
  assert.equal(input.unclaim(1), false, 'and an empty seat has nothing to release');
});

test('a lost device holds its seat, and the next press fills that seat first', () => {
  const { router: input } = router();
  const seatOne = input.stateFor(input.addSeat());
  seatOne.setAxes('gamepad', 1, 0);

  input.openClaims();
  input.claimPress(padDeviceId(0));
  input.claimPress(padDeviceId(1));

  // A flat battery is not a decision to leave the game.
  assert.equal(input.noteDeviceLost(padDeviceId(1)), 1);
  assert.equal(input.awaitingSeat, 1);
  assert.equal(input.isAwaiting(1), true);
  assert.equal(input.deviceFor(1), null, 'nobody is holding it');
  assert.equal(input.seatFor(padDeviceId(1)), null, 'and the dead id is not still spoken for');

  // **Against a genuinely empty seat with a lower index**, which is the only
  // arrangement that can tell the rule from "fill the first free seat": seat 0
  // is standing empty and seat 1 is being held, and the press belongs to the
  // player who just lost their pad rather than to whoever the low index is.
  assert.equal(input.unclaim(0), true);
  assert.equal(input.awaitingSeat, 1, 'unclaiming a seat is not the same as holding it');

  // Releasing the id is what makes "the same pad or a replacement" one code
  // path: a re-plug usually re-enumerates into a different slot, and no player
  // can see the number that changed.
  assert.equal(input.claimPress(padDeviceId(4)), true);
  assert.equal(input.seatFor(padDeviceId(4)), 1, 'the waiting seat is filled before an empty one');
  assert.equal(input.awaitingSeat, null);
  assert.equal(input.deviceFor(0), null, 'and the empty seat is still empty');

  // Only once nothing is waiting does the next press take the low seat.
  assert.equal(input.claimPress(padDeviceId(5)), true);
  assert.equal(input.seatFor(padDeviceId(5)), 0);
});

test('a device nobody was holding leaving is nothing at all', () => {
  const { router: input } = router();
  input.addSeat();

  // The single-player unplug M9 shipped: the pad layer hands the axes back and
  // the game carries on. Only a *claimed* pad is a seat waiting for a body.
  assert.equal(input.noteDeviceLost(padDeviceId(0)), null);
  assert.equal(input.awaitingSeat, null);
});

test('removing a seat drops the claim that pointed at it', () => {
  const { router: input, seatZero } = router();
  input.addSeat();
  input.openClaims();
  input.claimPress(padDeviceId(0));
  input.claimPress(padDeviceId(1));

  input.removeSeat();
  assert.equal(input.seatCount, 1);
  assert.equal(input.seatFor(padDeviceId(1)), null, 'the guest pad inherits nothing');
  assert.equal(input.seatFor(padDeviceId(0)), 0, 'and the player keeps their own');
  // The pad that stayed is still identity-routed, because a claim still exists.
  assert.equal(input.sinkForPad(0, 0), seatZero);
  assert.equal(input.sinkForPad(1, 1), null);
});

test('a seat left waiting is forgotten when the rider does', () => {
  const { router: input } = router();
  input.addSeat();
  input.openClaims();
  input.claimPress(padDeviceId(1));
  input.noteDeviceLost(padDeviceId(1));
  assert.equal(input.awaitingSeat, 0, 'the first press took seat 0');

  input.removeSeat();
  input.claimPress(padDeviceId(1));
  assert.equal(input.seatFor(padDeviceId(1)), 0);
});

test('the reset contracts reach every seat, not only the player', () => {
  const { router: input, seatZero } = router();
  const seatOne = input.stateFor(input.addSeat());
  const load = (): void => {
    for (const state of [seatZero, seatOne]) {
      state.setHeld('accelerate', true, 'keyboard');
      state.setAxes('gamepad', 1, 1);
      state.press('hop', 0);
      state.setScripted({ crouch: true }, 0);
    }
  };

  // The layout-change reset: devices and buffered one-shots go, scripted
  // values survive, on every seat — the window moved under both players' hands.
  load();
  input.clearDevices();
  for (const state of [seatZero, seatOne]) {
    assert.equal(state.sample(0).throttle, 0);
    assert.equal(state.isPending('hop', 0), false);
    assert.equal(state.sample(0).crouch, true, 'the QA bridge is not a device');
  }

  input.clearPending();
  input.clearScripted();
  for (const state of [seatZero, seatOne]) assert.equal(state.sample(0).crouch, false);

  // Focus loss takes everything, again on every seat.
  load();
  input.clearAll();
  for (const state of [seatZero, seatOne]) {
    assert.deepEqual(state.sample(0).crouch, false);
    assert.equal(state.sample(0).throttle, 0);
  }
});

test('a seat index outside the table is refused by name', () => {
  const { router: input } = router();
  assert.throws(() => input.stateFor(1), /no such seat: 1/);
  assert.throws(() => input.removeSeat(), /seat 0 cannot be removed/);
});

test('the seat a rider leaves takes its keyboard home rather than into the void', () => {
  const { router: input, seatZero, keyboardSeats } = router();
  const seatOne = input.stateFor(input.addSeat());

  input.openClaims();
  input.claimPress(padDeviceId(0));
  input.claimPress(KEYBOARD_DEVICE);
  assert.equal(keyboardSeats.at(-1), seatOne);

  // **The exit path**, and the half that deleting the claim does not do: the
  // keyboard layer holds a *sink*, and the sink it holds is the action state
  // of a seat that has just left the table. Without the repoint the keys go on
  // writing into an object nothing samples — a keyboard that does nothing at
  // all, on the seat the player is still sitting in.
  input.removeSeat();
  assert.equal(input.keyboardSeat, 0);
  assert.equal(keyboardSeats.at(-1), seatZero, 'the layer is told, not left guessing');
  assert.equal(input.seatFor(KEYBOARD_DEVICE), null);
});

test('a seat that was waiting stops waiting when its rider leaves', () => {
  const { router: input, changes } = router();
  input.addSeat();

  input.openClaims();
  input.claimPress(padDeviceId(0));
  input.claimPress(padDeviceId(1));
  input.noteDeviceLost(padDeviceId(1));
  assert.equal(input.awaitingSeat, 1);
  const before = changes.length;

  // A status line naming Player 2's missing pad is about a *seat*. Drop the
  // seat without saying so and the line stands there for ever, describing
  // somebody who is no longer in the room and with nothing left to clear it.
  input.removeSeat();
  assert.equal(input.awaitingSeat, null);
  assert.ok(changes.length > before, 'and whoever draws that line is told');
});

test('a press is suppressed exactly when it claims, and never a moment longer', () => {
  // M25 Phase 5. The join panel stops the browser turning Enter on a focused
  // button into a click while that press is going to seat somebody — so the
  // question it asks has to be *this* question and not a restatement of it.
  const { router: input } = router();
  input.addSeat();

  // Shut window: a confirm is a confirm.
  assert.equal(input.wouldClaim(KEYBOARD_DEVICE), false);

  input.openClaims();
  assert.equal(input.wouldClaim(KEYBOARD_DEVICE), true, 'an empty seat is a seat to take');
  assert.equal(input.claimPress(KEYBOARD_DEVICE), true);

  // A device that already holds a seat is choosing, not sitting down.
  assert.equal(input.wouldClaim(KEYBOARD_DEVICE), false);
  // And another device still has the second seat to take.
  assert.equal(input.wouldClaim(padDeviceId(0)), true);
  assert.equal(input.claimPress(padDeviceId(0)), true);

  // **The case that matters, and the one a bare `claiming` check gets wrong.**
  // Nothing closes the window after a mid-ride pad rejoin, so it can be open
  // with every seat held — and a third device (or the keyboard, on a couch
  // held by two pads) must not have its confirm swallowed for the rest of the
  // session because of it.
  assert.equal(input.claiming, true, 'the window is still open');
  assert.equal(input.wouldClaim(padDeviceId(7)), false, 'there is nowhere to sit');
  assert.equal(input.claimPress(padDeviceId(7)), false, 'and the press claims nothing');

  // A seat coming free makes it a claim again, in both answers at once.
  assert.equal(input.unclaim(1), true);
  assert.equal(input.wouldClaim(padDeviceId(7)), true);
  assert.equal(input.claimPress(padDeviceId(7)), true);
});

/**
 * `keyboardRides` — the seat-count rule, at both boundaries — M25 Phase 5 QA.
 *
 * The predicate deliberately asks how many seats there are rather than whether
 * any claim exists, and the two differ in a place the game actually reaches:
 * `Game.closeCouch` clears claims before despawning the guest. Asserting both
 * ends is what stops a later simplification to "any claim" from passing.
 */
test('an unclaimed keyboard rides alone and spectates on a couch', () => {
  const { router: input } = router();

  // Single player, and a pad claimed: still the M9 game, still driving.
  input.openClaims();
  input.claimPress(padDeviceId(0));
  assert.equal(input.keyboardRides, true, 'one seat is never a couch');

  // A second seat is what changes the answer — before anybody claims it.
  const seatOne = input.addSeat();
  assert.equal(input.keyboardRides, false, 'two seats and no claim is a spectator');

  input.claimPress(KEYBOARD_DEVICE);
  assert.equal(input.keyboardSeat, seatOne);
  assert.equal(input.keyboardRides, true, 'a seat of its own restores it');

  // And the couch breaking up hands it back even though the claim is dropped
  // first, which is the order `closeCouch` uses.
  input.clearClaims();
  assert.equal(input.keyboardRides, false, 'still two seats, still nobody claimed');
  input.removeSeat();
  assert.equal(input.keyboardRides, true, 'one seat again, and the keys work');
});
