/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ActionState, NEUTRAL_ACTIONS, type ActionSnapshot, type PressedAction } from './actions.ts';
import type { RiderSource } from './riderSource.ts';
import type { RiderSeat } from '../app/seats.ts';

/**
 * M25 Phase 0: the seam exists, and it renames reality rather than changing
 * it (docs/PLANS.md §25.5). Three claims, one per test — `ActionState`
 * conforms with zero edits, a source does not have to be an `ActionState`,
 * and reading through seat 0 is reading the same truth tick for tick.
 *
 * **The two seat-shaped tests below name `Pick<RiderSeat, 'source'>` rather
 * than `RiderSeat`, and that is the claim rather than a workaround.** What
 * they assert is that a seat reaches intent through `.source` and adds
 * nothing to it; a whole seat now also carries a controller and a rig, which
 * cannot exist under `node --test` (a rig needs three.js and a DOM) and which
 * neither test is about. Naming the one field keeps these robust as the seat
 * grows again at Phases 3 and 4 — this file went red at Phase 1 for exactly
 * that reason.
 */

test('ActionState conforms to RiderSource with zero edits', () => {
  // The assignment is the compile-time proof — structural, no `implements`
  // clause anywhere in actions.ts. The assertions are the behavioural half,
  // driven through a variable typed as the interface so nothing below can
  // lean on the concrete class.
  const state = new ActionState();
  const source: RiderSource = state;

  state.setHeld('accelerate', true);
  state.press('hop', 1);

  const snap = source.sample(1);
  assert.equal(snap.throttle, 1);
  assert.equal(snap.hop, true);

  assert.equal(source.consume('hop', 1), true);
  assert.equal(source.consume('hop', 1), false, 'one press, one claim — through the seam too');
  assert.equal(source.sample(1).hop, false);
});

test('a hand-rolled scripted source conforms, and a seat can hold it', () => {
  // The seam's other promise: a source is a dozen lines with no device
  // anywhere. This is the shape Phase 2's scripted second rider takes, and
  // the wrapper `CpuRider` gets the day a mode needs one.
  class ScriptedSource {
    private snapshot: ActionSnapshot = NEUTRAL_ACTIONS;
    private readonly latched = new Set<PressedAction>();

    say(snapshot: ActionSnapshot): void {
      this.snapshot = snapshot;
    }

    press(action: PressedAction): void {
      this.latched.add(action);
    }

    sample(_nowSeconds: number): ActionSnapshot {
      return this.snapshot;
    }

    consume(action: PressedAction, _nowSeconds: number): boolean {
      return this.latched.delete(action);
    }
  }

  const scripted = new ScriptedSource();
  const seat: Pick<RiderSeat, 'source'> = { source: scripted };

  scripted.say({ ...NEUTRAL_ACTIONS, throttle: 0.5 });
  scripted.press('reset');

  assert.equal(seat.source.sample(0).throttle, 0.5);
  assert.equal(seat.source.consume('reset', 0), true);
  assert.equal(seat.source.consume('reset', 0), false);
  assert.equal(seat.source.consume('hop', 0), false, 'never pressed, never claimable');
});

test('a seat-0 sample equals a direct sample, tick for tick', () => {
  // `sample` reads without consuming (actions.ts documents that), so taking
  // the seat's snapshot and the direct snapshot at the same clock is legal
  // and must be exact — the seam adds no transformation. This is the "zero
  // behaviour change" half of the Phase 0 gate in miniature, over a ride's
  // worth of held changes, analog writes, presses, and a claim made
  // *through* the seat that the direct view must immediately agree with.
  const state = new ActionState();
  const seat: Pick<RiderSeat, 'source'> = { source: state };
  const dt = 0.02;

  for (let tick = 0; tick <= 40; tick += 1) {
    const now = tick * dt;
    if (tick === 3) state.setHeld('accelerate', true);
    if (tick === 8) state.setAxes('gamepad', -0.4, 0.7);
    if (tick === 12) state.press('hop', now);
    if (tick === 13) {
      assert.equal(seat.source.consume('hop', now), true, 'the press is claimable through the seat');
    }
    if (tick === 20) state.setHeld('accelerate', false);
    if (tick === 25) state.press('pause', now);

    assert.deepEqual(
      seat.source.sample(now),
      state.sample(now),
      `tick ${tick}: the seat and the direct read must be the same truth`,
    );
  }
});
