/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { generateLevel } from './generateRoute.ts';
import type { LevelPlan } from './plan.ts';
import { streetFronts, streetGroundPatches, streetEdgePatches } from './streetFronts.ts';
import { environmentSites } from './environmentSites.ts';
import { industrialGroundPatches } from './environmentGround.ts';

type RecordDigest = { readonly id: string; readonly plan: string; readonly commercial: string;
  readonly commercialGround: string; readonly industrial: string; readonly industrialGround: string };
type PreservedBaseline = { readonly schema: number; readonly origin: string;
  readonly records: Readonly<Record<string, RecordDigest>> };
type PreservedMarkings = { readonly schema: number; readonly origin: string;
  readonly records: Readonly<Record<string, readonly string[]>> };

// 2026-10-04: the preserved record moved here, byte-identical, from the
// git-ignored, export-excluded test-results/environment-upgrade/
// district-baseline-r1.json, so every checkout and the source export can run it.
const BASELINE = new URL('./districtHelperParity.test-fixture.json', import.meta.url);
// The same seeds' original line fingerprints, from the 2026-09-26 source export.
const ORIGINAL_MARKINGS = new URL('./districtHelperParity.markings.test-fixture.json', import.meta.url);

/**
 * 2026-10-04: two documented, additive plan changes postdate the record:
 * `populationPaths` (outdoor population, CHANGELOG 2026-10-01) and the
 * road-purpose centre/edge lines (CHANGELOG 2026-10-02 "Road paint follows
 * accepted wide-road purpose"). The plan digest is taken on the plan with
 * exactly those removed. Every original line must survive byte-exact and in
 * order, and only the counted road-paint additions may be set aside.
 */
const ROAD_PURPOSE_ADDITIONS: Readonly<Record<string, number>> = { euc: 12, corner: 28, city: 19, rider: 19 };

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function preservedFields(seed: string, plan: LevelPlan, originals: readonly string[]): LevelPlan {
  const remaining = new Map<string, number>();
  for (const key of originals) remaining.set(key, (remaining.get(key) ?? 0) + 1);
  const kept: NonNullable<LevelPlan['markings']> = [];
  const added: NonNullable<LevelPlan['markings']> = [];
  for (const mark of plan.markings ?? []) {
    const key = hash(mark);
    const left = remaining.get(key) ?? 0;
    if (left > 0) { remaining.set(key, left - 1); kept.push(mark); } else added.push(mark);
  }
  assert.equal(kept.length, originals.length, `${seed}: an original line changed or disappeared; added paint cannot conceal it`);
  assert.equal(added.length, ROAD_PURPOSE_ADDITIONS[seed], `${seed}: only the recorded road-purpose additions leave the record`);
  assert.ok(added.every(mark => mark.paint === 'road'), `${seed}: an added line is not road paint`);
  const projected: LevelPlan = { ...plan, markings: kept };
  delete projected.populationPaths;
  return projected;
}

/** Explicit preserved pre-adoption input, not regenerated expected data. */
test('neutral helper extraction keeps the complete original plan and commercial/industrial decisions byte-identical', () => {
  const override = process.env.ENVIRONMENT_DISTRICT_BASELINE;
  const baseline = JSON.parse(readFileSync(override === undefined ? BASELINE : resolve(override), 'utf8')) as PreservedBaseline;
  assert.equal(baseline.schema, 1);
  assert.equal(baseline.origin, 'before-district-helper-extraction');
  const markings = JSON.parse(readFileSync(ORIGINAL_MARKINGS, 'utf8')) as PreservedMarkings;
  assert.equal(markings.schema, 1);
  assert.equal(markings.origin, baseline.origin);
  for (const seed of ['euc', 'corner', 'city', 'rider']) {
    assert.ok(baseline.records[seed], `${seed}: preserved pre-adoption record required`);
    assert.ok(markings.records[seed], `${seed}: preserved original markings required`);
    const plan = generateLevel(seed).plan;
    const commercial = streetFronts(plan);
    const courts = commercial.flatMap(front => streetGroundPatches(plan, front));
    const industrial = environmentSites(plan);
    const actual: RecordDigest = { id: plan.id, plan: hash(preservedFields(seed, plan, markings.records[seed])),
      commercial: hash(commercial),
      commercialGround: hash([...courts, ...streetEdgePatches(plan, commercial, courts)]),
      industrial: hash(industrial), industrialGround: hash(industrial.flatMap(site => industrialGroundPatches(plan, site))) };
    assert.deepEqual(actual, baseline.records[seed], `${seed}: every original decision and source record`);
  }
});
