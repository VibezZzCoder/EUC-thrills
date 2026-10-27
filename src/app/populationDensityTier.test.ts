/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { VEGETATION_COUCH_DETAIL } from '../data/tuning.ts';
import { resolveRenderTier } from './renderTier.ts';
import { QUALITY_LEVELS } from './options.ts';
import { densityLayerFor } from './populationDensityTier.ts';

/** M47 (docs/PLANS.md §47.2): the effective ordinary tier picks the living world's roster. */

test('one or two seats ride the tier\'s own layer: Low the living-r1 base, Medium, High', () => {
  for (const seats of [1, 2]) {
    assert.equal(densityLayerFor('low', seats), 'base');
    assert.equal(densityLayerFor('medium', seats), 'medium');
    assert.equal(densityLayerFor('high', seats), 'high');
  }
  assert.equal(densityLayerFor('high'), 'high', 'one seat by default');
});

test('Ultra draws High, so it rides the High roster; a suspended Ultra does too', () => {
  for (const multiplayerSession of [false, true]) for (const presentationOverride of [false, true]) {
    for (const refused of [false, true]) {
      const { ordinary } = resolveRenderTier({ requested: 'ultra', multiplayerSession, presentationOverride, refused });
      assert.equal(densityLayerFor(ordinary), 'high');
    }
  }
  // Every requested level resolves through the ordinary tier, never around it.
  assert.deepEqual(QUALITY_LEVELS.map(requested => densityLayerFor(resolveRenderTier({ requested,
    multiplayerSession: false, presentationOverride: false, refused: false }).ordinary)), ['base', 'medium', 'high', 'high']);
});

test('the 2×2 couch grid rides at most Medium, from the vegetation\'s own couch threshold', () => {
  const grid = VEGETATION_COUCH_DETAIL.minimumPanes;
  assert.equal(grid, 3, 'the threshold this test reads is the three-pane one PLANS §47.2 names');
  for (let seats = grid; seats <= 4; seats += 1) {
    assert.equal(densityLayerFor('high', seats), 'medium');
    assert.equal(densityLayerFor('medium', seats), 'medium');
    assert.equal(densityLayerFor('low', seats), 'base', 'Low never gains actors in a couch');
  }
  assert.equal(densityLayerFor('high', grid - 1), 'high');
});
