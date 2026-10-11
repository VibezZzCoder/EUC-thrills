/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LaunchPadField, NO_LAUNCH_PADS, type LaunchPadVolume } from './launchPadField.ts';

const PAD = (overrides: Partial<LaunchPadVolume> = {}): LaunchPadVolume => ({
  id: 'pad-a', x: 10, z: -4, triggerRadius: 1.4, footprintRadius: 2, dropMetres: 0.2, ...overrides,
});

test('the empty field answers nothing and holds no pads', () => {
  assert.equal(NO_LAUNCH_PADS.count, 0);
  assert.equal(NO_LAUNCH_PADS.at(0, 0), -1);
  assert.equal(NO_LAUNCH_PADS.inFootprint(0, 0), false);
  assert.throws(() => NO_LAUNCH_PADS.dropAt(0), RangeError);
  assert.equal(new LaunchPadField().count, 0);
  assert.ok(Object.isFrozen(NO_LAUNCH_PADS));
});

test('the trigger is a centre circle: inside, on the boundary and just outside', () => {
  const field = new LaunchPadField([PAD()]);
  assert.equal(field.count, 1);
  assert.equal(field.at(10, -4), 0, 'the centre');
  // The boundary counts as inside (a pad at the origin keeps the arithmetic exact).
  const origin = new LaunchPadField([PAD({ x: 0, z: 0 })]);
  assert.equal(origin.at(1.4, 0), 0, 'the boundary counts as inside');
  assert.equal(origin.at(0, -1.4), 0);
  assert.equal(origin.at(1.4 + 1e-9, 0), -1, 'just outside the trigger');
  // Every heading alike: eight directions at 1.39 m fire, at 1.41 m do not.
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    assert.equal(field.at(10 + Math.sin(a) * 1.39, -4 + Math.cos(a) * 1.39), 0, `heading ${k} inside`);
    assert.equal(field.at(10 + Math.sin(a) * 1.41, -4 + Math.cos(a) * 1.41), -1, `heading ${k} outside`);
  }
});

test('the footprint is the larger disc: the band between trigger and rim is footprint only', () => {
  const field = new LaunchPadField([PAD()]);
  assert.equal(field.inFootprint(10, -4), true);
  assert.equal(field.inFootprint(10 + 1.7, -4), true);
  assert.equal(field.at(10 + 1.7, -4), -1, 'the rim band never launches');
  const origin = new LaunchPadField([PAD({ x: 0, z: 0 })]);
  assert.equal(origin.inFootprint(2, 0), true, 'the rim itself is inside');
  assert.equal(origin.inFootprint(2 + 1e-9, 0), false);
  assert.equal(field.inFootprint(10 + 1.5, -4 + 1.5), false, 'outside the disc, inside its bounding square');
});

test('several pads: index, drop and id per pad', () => {
  const field = new LaunchPadField([
    PAD({ id: 'pad-a' }),
    PAD({ id: 'pad-b', x: -80, z: 30, dropMetres: 0 }),
  ]);
  assert.equal(field.count, 2);
  assert.equal(field.at(-80, 30.5), 1);
  assert.equal(field.at(10, -4), 0);
  assert.equal(field.at(0, 0), -1);
  assert.equal(field.dropAt(0), 0.2);
  assert.equal(field.dropAt(1), 0);
  assert.equal(field.idAt(1), 'pad-b');
  assert.throws(() => field.dropAt(2), RangeError);
  assert.throws(() => field.dropAt(-1), RangeError);
  assert.throws(() => field.dropAt(0.5), RangeError);
  assert.equal(field.inFootprint(-81.9, 30), true);
});

test('validation: finite positions, positive radii, trigger strictly inside the footprint, drop ≥ 0', () => {
  assert.throws(() => new LaunchPadField([PAD({ x: Number.NaN })]), RangeError);
  assert.throws(() => new LaunchPadField([PAD({ z: Infinity })]), RangeError);
  assert.throws(() => new LaunchPadField([PAD({ triggerRadius: 0 })]), RangeError);
  assert.throws(() => new LaunchPadField([PAD({ triggerRadius: -1 })]), RangeError);
  assert.throws(() => new LaunchPadField([PAD({ footprintRadius: Infinity })]), RangeError);
  assert.throws(() => new LaunchPadField([PAD({ triggerRadius: 2, footprintRadius: 2 })]), RangeError);
  assert.throws(() => new LaunchPadField([PAD({ triggerRadius: 2.5, footprintRadius: 2 })]), RangeError);
  assert.throws(() => new LaunchPadField([PAD({ dropMetres: -0.01 })]), RangeError);
  assert.throws(() => new LaunchPadField([PAD({ dropMetres: Number.NaN })]), RangeError);
});

test('immutable: the field is frozen and does not hold the caller\'s array', () => {
  const pads = [PAD()];
  const field = new LaunchPadField(pads);
  assert.ok(Object.isFrozen(field));
  (pads[0] as { x: number }).x = 500;
  pads.length = 0;
  assert.equal(field.count, 1);
  assert.equal(field.at(10, -4), 0);
});
