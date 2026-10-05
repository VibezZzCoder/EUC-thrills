/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, collectErrors } from './harness.ts';
import { populationNativeWork } from './populationNativeWork.ts';

/**
 * The native far-owner step (POP-6/CP-5, 2026-10-03).
 *
 * A grounded, upright rider well clear of every street-life actor takes its
 * plain native step at the transaction point instead of a prepared
 * transaction step. `Game.populationStepNatively` keeps that step only after
 * exact certificate checks, and populationNativeStepPremise.test.ts pins the
 * controller premise headlessly. These counts fail if the per-owner prepare or
 * the second certificate evaluation per step comes back, and if the gate ever
 * lets an owner pressed against an actor skip the transaction.
 */

test('a grounded rider far from street life prepares nothing and certifies once per step', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=generated&seed=euc');
  const work = await page.evaluate(populationNativeWork, 'far' as const);
  expect(work.minActorMetres).toBeGreaterThan(30);
  expect(work.grounded).toBeGreaterThan(work.steps / 2);
  expect(work.groundedPrepares).toBe(0);
  expect(work.native).toBe(work.grounded);
  // Begin reuses seal's placement certificate for an unchanged pose.
  expect(work.components).toBe(work.steps);
  expect(errors).toEqual([]);
});

test('a far rider is not prepared for the neutral epochs another seat\'s hop opens', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=generated&seed=euc');
  const work = await page.evaluate(populationNativeWork, 'neutral' as const);
  expect(work.minActorMetres).toBeGreaterThan(30);
  expect(work.neutral).toBeGreaterThan(30);
  // Until PERF-R2-1 (2026-10-04) seat 0 was prepared in every one of them.
  expect(work.neutralPrepares).toBe(0);
  expect(work.native).toBeGreaterThanOrEqual(work.neutral);
  expect(errors).toEqual([]);
});

test('a rider held against a parked vehicle takes the transaction every step', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=generated&seed=euc');
  const work = await page.evaluate(populationNativeWork, 'held' as const);
  expect(work.heldAgainst).not.toBeNull();
  expect(work.minActorMetres).toBeLessThan(9);
  expect(work.grounded).toBeGreaterThan(0);
  expect(work.groundedPrepares).toBe(work.grounded);
  expect(work.native).toBe(0);
  expect(errors).toEqual([]);
});
