/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loudestWarning, nearestCutout, type RiderWarningState } from './riderMix.ts';
import { POWER_STAGE_ORDER } from '../simulation/EucController.ts';

function rider(overrides: Partial<RiderWarningState> = {}): RiderWarningState {
  return { crashed: false, powerWarning: 'normal', overspeed: 0, ...overrides };
}

test('the ladder answers to whichever rider is nearest trouble', () => {
  assert.equal(loudestWarning([rider(), rider({ powerWarning: 'warn' })]), 'warn');
  assert.equal(loudestWarning([rider({ powerWarning: 'tiltBack' }), rider()]), 'tiltBack');
  assert.equal(
    loudestWarning([rider({ powerWarning: 'notice' }), rider({ powerWarning: 'warn' })]),
    'warn',
  );
  assert.equal(nearestCutout([rider(), rider({ overspeed: 0.74 })]), 0.74);
});

test('a rider on the ground is not warned about, whichever seat they are', () => {
  // **The repair, stated as a test.** This rule used to sit inside the audio
  // director's beep gate, reading a `crashed` flag that is seat 0's — so the
  // player lying on the ground silenced the guest's tilt-back. Here it is
  // asked per rider, which is the only place it can be asked correctly.
  const down = rider({ crashed: true, powerWarning: 'tiltBack', overspeed: 1 });
  const upright = rider({ powerWarning: 'warn', overspeed: 0.74 });

  assert.equal(loudestWarning([down, upright]), 'warn', 'a downed rider set the rung');
  assert.equal(nearestCutout([down, upright]), 0.74, 'a downed rider set the cutout');

  // And the other way round, which is the case that was broken: seat 0 down,
  // seat 1 upright and in trouble.
  assert.equal(loudestWarning([down, upright]), loudestWarning([upright, down]));
  assert.equal(nearestCutout([down, upright]), nearestCutout([upright, down]));
});

test('a field of riders who are all down is silent, and so is an empty one', () => {
  // Which is what keeps single player byte-identical: a crashed lone rider now
  // reports `normal` and `0`, so the director takes the same early return it
  // always took, through a different door.
  const down = rider({ crashed: true, powerWarning: 'tiltBack', overspeed: 1 });
  assert.equal(loudestWarning([down]), 'normal');
  assert.equal(nearestCutout([down]), 0);
  assert.equal(loudestWarning([]), 'normal');
  assert.equal(nearestCutout([]), 0);
});

test('severity is the ladder’s own order, not the order riders are read in', () => {
  // Written against `POWER_STAGE_ORDER` rather than against a list this test
  // remembers, so a fifth rung is ranked correctly here the day it is added.
  for (let i = 1; i < POWER_STAGE_ORDER.length; i += 1) {
    const lower = POWER_STAGE_ORDER[i - 1];
    const higher = POWER_STAGE_ORDER[i];
    assert.equal(loudestWarning([rider({ powerWarning: higher }), rider({ powerWarning: lower })]), higher);
    assert.equal(loudestWarning([rider({ powerWarning: lower }), rider({ powerWarning: higher })]), higher);
  }
});
