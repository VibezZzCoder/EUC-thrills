/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SURFACES } from '../data/surfaces.ts';
import { roughnessAt } from './roughness.ts';

/**
 * The roughness field.
 *
 * Small, and worth testing anyway: it is the input to the suspension, so its
 * bound is the suspension's bound, and its being a function of *position*
 * rather than of *time* is the property that makes `advance(n)` reach a
 * repeatable suspension state.
 */

test('the field is bounded by the amplitude it is given', () => {
  let extreme = 0;
  for (let i = 0; i < 20_000; i += 1) {
    const x = (i * 0.137) % 500 - 250;
    const z = (i * 0.611) % 500 - 250;
    extreme = Math.max(extreme, Math.abs(roughnessAt(x, z, 0.04, 2.6)));
  }
  assert.ok(extreme <= 0.04 + 1e-12, `reached ${extreme} against an amplitude of 0.04`);
  // And it actually uses most of that range, or the amplitude in the surface
  // table would not mean what it says.
  assert.ok(extreme > 0.03, `only reached ${extreme}, so the amplitude is misleading`);
});

test('the same point always gives the same displacement', () => {
  // The whole reason it is spatial. A time-based field would shake a parked
  // wheel, would differ between two rides over the same ground, and would make
  // a frozen screenshot of the suspension meaningless.
  const first = roughnessAt(12.5, -3.25, 0.03, 2.4);
  const second = roughnessAt(12.5, -3.25, 0.03, 2.4);
  assert.equal(first, second);
});

test('a smooth surface costs nothing', () => {
  assert.equal(roughnessAt(4, 9, 0, 2.4), 0);
  assert.equal(roughnessAt(4, 9, 0.03, 0), 0);
  assert.equal(roughnessAt(4, 9, -1, 2.4), 0);
});

test('the field varies over a wavelength in every direction of travel', () => {
  // Oblique components on purpose: an axis-aligned field would leave a straight
  // run along +Z sampling one wave at a constant phase, so riding due north
  // would feel different from riding north-east for a reason nothing in the
  // game explains.
  for (const heading of [0, Math.PI / 4, Math.PI / 2, 1.1, -2.3]) {
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    let low = Infinity;
    let high = -Infinity;
    for (let step = 0; step <= 60; step += 1) {
      const distance = step * 0.1;
      const value = roughnessAt(dx * distance, dz * distance, 0.03, 2.6);
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    assert.ok(
      high - low > 0.02,
      `heading ${heading.toFixed(2)} varied by only ${(high - low).toFixed(4)} m over six metres`,
    );
  }
});

test('every surface’s wavelength excites the suspension in its own band at riding speed', () => {
  // The excitation frequency is speed over wavelength. `TERRAIN` puts the
  // spring near 2.6 Hz, so the surfaces have to sit somewhere a rider at 5 to
  // 12 m/s actually reaches — otherwise grass is silent and the milestone's
  // exit question has no answer.
  for (const surface of Object.values(SURFACES)) {
    const slow = 5 / surface.roughnessWavelength;
    const fast = 12 / surface.roughnessWavelength;
    assert.ok(slow < 6, `${surface.id} is already at ${slow.toFixed(1)} Hz at walking pace`);
    assert.ok(fast > 2, `${surface.id} only reaches ${fast.toFixed(1)} Hz flat out`);
  }
});
