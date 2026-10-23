/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LAUNCH_PAD } from '../data/tuning.ts';
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

// ---------------------------------------------------------------------------
// The safe-point hold (M44 D15)
// ---------------------------------------------------------------------------

/** A holding pad at the origin, so the boundary arithmetic is exact: an 11 m roof, a 10 m hold. */
const ROOF = 11;
const HOLDING = (overrides: Partial<LaunchPadVolume> = {}): LaunchPadVolume =>
  PAD({ id: 'pad-hold', x: 0, z: 0, y: ROOF, holdSafeMetres: 10, dropMetres: 0, ...overrides });

test('the hold is a horizontal disc of the declared radius: inside, on the boundary and just outside', () => {
  const field = new LaunchPadField([HOLDING()]);
  assert.equal(field.maxHoldSafeMetres, 10);
  assert.equal(field.holdsSafePoint(0, 0, ROOF), true, 'the centre');
  assert.equal(field.holdsSafePoint(10, 0, ROOF), true, 'the boundary counts as inside');
  assert.equal(field.holdsSafePoint(0, -10, ROOF), true);
  assert.equal(field.holdsSafePoint(10 + 1e-9, 0, ROOF), false, 'just outside the disc');
  assert.equal(field.holdsSafePoint(7.1, 7.1, ROOF), false, 'outside the disc, inside its bounding square');
  assert.equal(field.holdsSafePoint(7, 7, ROOF), true);
  // The hold is its own disc, not the trigger's or the footprint's.
  assert.equal(field.at(5, 0), -1);
  assert.equal(field.inFootprint(5, 0), false);
});

test('the hold\'s height band: the pad\'s own ground down to LAUNCH_PAD.holdSafeDropMetres below it, and anything higher', () => {
  const field = new LaunchPadField([HOLDING()]);
  const floor = ROOF - LAUNCH_PAD.holdSafeDropMetres;
  assert.ok(LAUNCH_PAD.holdSafeDropMetres > 0 && LAUNCH_PAD.holdSafeDropMetres < ROOF, 'a band, not the whole column');
  assert.equal(field.holdsSafePoint(3, 0, floor), true, 'the band\'s floor counts as inside');
  assert.equal(field.holdsSafePoint(3, 0, floor - 1e-9), false, 'just under it');
  assert.equal(field.holdsSafePoint(3, 0, 0), false, 'the courtyard floor under the same disc keeps its safe points');
  assert.equal(field.holdsSafePoint(3, 0, ROOF + 1), true, 'a parapet over the roof');
  assert.equal(field.holdsSafePoint(3, 0, Number.NaN), false, 'a NaN height is never in a band');
});

test('no hold, no answer: absent and zero holds short-circuit, and so does the empty field', () => {
  assert.equal(NO_LAUNCH_PADS.maxHoldSafeMetres, 0);
  assert.equal(NO_LAUNCH_PADS.holdsSafePoint(0, 0, 0), false);
  const derived = new LaunchPadField([PAD(), PAD({ id: 'pad-b', x: -80, z: 30 })]);
  assert.equal(derived.maxHoldSafeMetres, 0, 'a derived field never holds');
  assert.equal(derived.holdsSafePoint(10, -4, 0), false, 'not even at a pad\'s centre');
  const zero = new LaunchPadField([HOLDING({ holdSafeMetres: 0 })]);
  assert.equal(zero.maxHoldSafeMetres, 0);
  assert.equal(zero.holdsSafePoint(0, 0, ROOF), false, 'a zero hold is no hold');
  // A zero hold needs no height: nothing reads it.
  assert.equal(new LaunchPadField([PAD({ holdSafeMetres: 0 })]).maxHoldSafeMetres, 0);
});

test('several pads: the holds are a union, each with its own band; a non-holding pad holds nothing', () => {
  const field = new LaunchPadField([
    PAD({ id: 'ground', x: 0, z: 0, y: 0 }),
    HOLDING({ id: 'roof-a', x: 40, z: 0, holdSafeMetres: 12 }),
    HOLDING({ id: 'roof-b', x: 60, z: 0, holdSafeMetres: 20 }),
    PAD({ id: 'low', x: -40, z: 0, y: 2, holdSafeMetres: 5 }),
  ]);
  assert.equal(field.maxHoldSafeMetres, 20);
  assert.equal(field.holdsSafePoint(0, 0, 0), false, 'the non-holding pad');
  assert.equal(field.holdsSafePoint(29, 0, ROOF), true, 'roof-a only');
  assert.equal(field.holdsSafePoint(27.9, 0, ROOF), false);
  assert.equal(field.holdsSafePoint(79, 0, ROOF), true, 'roof-b only');
  assert.equal(field.holdsSafePoint(50, 0, ROOF), true, 'both');
  // Each band is its own pad's: the low pad holds ground at 0 (2 − 5 m < 0), the roofs never do.
  assert.equal(field.holdsSafePoint(-40, 4, 0), true, 'the low pad\'s band reaches the floor');
  assert.equal(field.holdsSafePoint(50, 0, 0), false, 'the roofs\' bands do not');
  // The other queries do not change with a hold.
  const plain = new LaunchPadField([PAD({ id: 'roof-a', x: 40, z: 0 })]);
  const held = new LaunchPadField([HOLDING({ id: 'roof-a', x: 40, z: 0, holdSafeMetres: 12 })]);
  for (const [x, z] of [[40, 0], [41.3, 0.4], [42.5, -1], [43.2, 0], [50, 0]] as const) {
    assert.equal(held.at(x, z), plain.at(x, z));
    assert.equal(held.inFootprint(x, z), plain.inFootprint(x, z));
    assert.equal(held.riseAt(x, z), plain.riseAt(x, z));
  }
});

test('hold validation: finite and ≥ 0, and a holding pad needs a finite ground height', () => {
  assert.throws(() => new LaunchPadField([HOLDING({ holdSafeMetres: -0.01 })]), RangeError);
  assert.throws(() => new LaunchPadField([HOLDING({ holdSafeMetres: Number.NaN })]), RangeError);
  assert.throws(() => new LaunchPadField([HOLDING({ holdSafeMetres: Infinity })]), RangeError);
  assert.throws(() => new LaunchPadField([HOLDING({ y: undefined })]), /needs a finite ground height/);
  assert.throws(() => new LaunchPadField([HOLDING({ y: Number.NaN })]), /needs a finite ground height/);
  assert.throws(() => new LaunchPadField([HOLDING({ y: -Infinity })]), RangeError);
  assert.ok(Object.isFrozen(new LaunchPadField([HOLDING()])));
});
