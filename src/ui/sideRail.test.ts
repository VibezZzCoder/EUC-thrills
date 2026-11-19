/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SIDE_RAIL_MIN_PX, sideRailFor } from './sideRail.ts';

/**
 * Which screens have a system rail beside them. The numbers are the ones the
 * iOS 27.1 Simulator reported for the iPhone Duo (1.4.6); the others are the
 * screens that must NOT be treated as having one, because the menus' landscape
 * tiers are fitted without side insets.
 */

test('the Duo outer screen, installed: a rail on the right', () => {
  assert.equal(sideRailFor(466, 657, 0, 84), 'right');
});

test('the same screen turned over: a rail on the left', () => {
  assert.equal(sideRailFor(466, 657, 84, 0), 'left');
});

test('no rail: Safari beside the rail, the inner screen, and ordinary phones', () => {
  assert.equal(sideRailFor(382, 580, 0, 0), null, 'the Duo outer screen in a Safari tab');
  assert.equal(sideRailFor(951, 590, 0, 0), null, 'the Duo inner screen');
  assert.equal(sideRailFor(669, 867, 0, 0), null, 'the Duo inner screen upright');
  assert.equal(sideRailFor(393, 852, 0, 0), null, 'an iPhone upright');
});

test('a phone on its side is never a rail, whatever its notch reports', () => {
  assert.equal(sideRailFor(852, 393, 59, 59), null);
  assert.equal(sideRailFor(852, 393, 59, 0), null);
  assert.equal(sideRailFor(852, 393, 0, 84), null);
});

test('a small or symmetric inset upright is not a rail', () => {
  assert.equal(sideRailFor(466, 657, 0, SIDE_RAIL_MIN_PX - 1), null);
  assert.equal(sideRailFor(466, 657, 84, 84), null);
  assert.equal(sideRailFor(466, 657, 0, SIDE_RAIL_MIN_PX), 'right');
});
