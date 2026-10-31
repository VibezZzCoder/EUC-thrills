/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createLevel } from '../level/levels.ts';
import type { LevelPlan } from '../level/plan.ts';
import { createSkateparkLevel } from '../level/skateparkLevel.ts';
import { createTerrain } from './terrain.ts';
import { yardWearTints } from './yardWear.ts';

/**
 * 1.4.0's look pass: Foundry Yard's worn concrete (`render/yardWear.ts`).
 * Render-only vertex colour, so what this file proves is where it may and may
 * not land: nowhere on a plan without `yardWear`, nowhere the field stands at
 * exactly 0 (the 8 m surround patches meet those samples), and only darker,
 * cooler or tinted — never a light source.
 */

const yard = createSkateparkLevel();
const BASE = { r: 0.25, g: 0.25, b: 0.24 };

test('no yard wear, no tints: every shipped world takes the untouched path', () => {
  for (const id of ['slice', 'proving', 'track', 'switchback', 'euclaude'] as const) {
    const plan = createLevel(id);
    assert.equal(plan.yardWear, undefined);
    assert.equal(yardWearTints(plan, BASE), null, id);
  }
  // And the yard with its wear removed takes the untouched path: the one
  // difference in its heightfield colours is the wear.
  const bare: Partial<LevelPlan> = { ...yard };
  delete bare.yardWear;
  const plain = createTerrain(bare as LevelPlan);
  const worn = createTerrain(yard);
  try {
    const colours = (view: typeof plain) => {
      let found: Float32Array | null = null;
      view.group.traverse((object) => {
        const mesh = object as { name?: string; geometry?: { getAttribute(name: string): { array: Float32Array } } };
        if (mesh.name === 'level-heightfield') found = mesh.geometry!.getAttribute('color').array;
      });
      return found! as Float32Array;
    };
    const a = colours(plain), b = colours(worn);
    assert.equal(a.length, b.length);
    let changed = 0;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) changed += 1;
    assert.ok(changed > 0, 'the wear reaches the heightfield');
  } finally {
    plain.dispose();
    worn.dispose();
  }
});

test('exactly 1 wherever the field is at 0, so the shaped squares meet the surround patches seamlessly', () => {
  const tints = yardWearTints(yard, BASE)!;
  const { heights, columns, rows } = yard.heightfield;
  assert.equal(tints.length, columns * rows * 3);
  let worn = 0;
  for (let i = 0; i < heights.length; i += 1) {
    if (heights[i] === 0) {
      assert.deepEqual([tints[i * 3], tints[i * 3 + 1], tints[i * 3 + 2]], [1, 1, 1], `sample ${i}`);
    } else if (tints[i * 3] !== 1 || tints[i * 3 + 1] !== 1 || tints[i * 3 + 2] !== 1) {
      worn += 1;
    }
  }
  assert.ok(worn > 10_000, `${worn} worn samples`);
});

test('the wear darkens and tints; it never lights a face up past the paint it was given', () => {
  // The brightest a sample can go is a pale patch's ratio over the concrete;
  // the darkest is a dark patch over a grimy lip. Both stay inside a sane band.
  const tints = yardWearTints(yard, BASE)!;
  let low = Infinity, high = -Infinity;
  for (const value of tints) { low = Math.min(low, value); high = Math.max(high, value); }
  assert.ok(low > 0.2, `darkest ${low.toFixed(3)}`);
  assert.ok(high < 2, `brightest ${high.toFixed(3)}`);
  // Deterministic: a second build is the same array.
  assert.deepEqual(yardWearTints(yard, BASE), tints);
});

// Critic pass 1 (`docs/PLANS.md` §51): the relief, the washes and the rim.
const { heights: H, columns: C, spacing: S, originX: OX, originZ: OZ } = yard.heightfield;
const sampleAt = (x: number, z: number): number => Math.round((z - OZ) / S) * C + Math.round((x - OX) / S);

test('a sunken rim steps off the deck gently, so a curved lip draws no teeth', () => {
  // The deck at 0 is exactly 1 (above); its sunken neighbours keep only part
  // of their wear (RIM_SOFT), and the lip grime is a wide, light band. The
  // bowl's worst first-row step was the face shade and the grime together.
  const tints = yardWearTints(yard, BASE)!;
  let worst = 0;
  for (let i = 0; i < H.length; i += 1) {
    if (H[i] !== 0) continue;
    const x = OX + (i % C) * S, z = OZ + Math.floor(i / C) * S;
    if (x < 96 || x > 112 || z < 152 || z > 164.5) continue;
    for (const j of [i + 1, i - 1, i + C, i - C]) if (H[j] < 0) worst = Math.max(worst, 1 - tints[j * 3]);
  }
  assert.ok(worst > 0 && worst <= 0.25, `the bowl rim steps ${worst.toFixed(3)} off the deck`);
});

test('shallow features read: a painted kicker face, a dark toe, a sunken floor', () => {
  const tints = yardWearTints(yard, BASE)!;
  const at = (x: number, z: number) => tints.slice(sampleAt(x, z) * 3, sampleAt(x, z) * 3 + 3);
  // K2's side tapers carry a dark wash (critic pass 2, R5); its ride face is
  // painted as geometry (`level/yardScenery.ts`), so it keeps the face shade.
  const taper = at(125.75, 120.5);
  assert.ok(taper[0] < 0.5 && Math.abs(taper[2] - taper[0]) < 0.1, `K2's taper ${[...taper].map((v) => v.toFixed(2))}`);
  const kicker = at(125.5, 124);
  assert.ok(kicker[0] > 0.7 && Math.abs(kicker[2] - kicker[0]) < 0.1, `K2's face ${[...kicker].map((v) => v.toFixed(2))}`);
  // The pyramid's toe collects grit (A1, T5); since critic pass 2 (K2) its
  // upper face is darker still, the lip grime under its pale crest line —
  // the light-over-dark pair that draws where the top begins.
  assert.ok(at(113, 140)[0] < 0.86 && at(114, 140)[0] < at(113, 140)[0]);
  // A sunken floor reads sunken: the bowl's floor and the snake's are darker than 1.
  assert.ok(at(104, 158)[0] < 0.95 && at(125, 158.25)[0] < 0.97);
});
