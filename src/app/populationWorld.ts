/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan } from '../level/plan.ts';
import { buildPopulationPlan, withPopulationAuthoringMemo, type PopulationPlan } from '../level/populationPlan.ts';
import { hash128 } from '../level/planDigest.ts';
import { withStreetGround } from './streetGround.ts';
import { prepareLivingWorldGround } from '../level/livingWorldGround.ts';
import { withDistrictAdjacency, type DistrictAdjacentPlan } from '../level/districtAdjacency.ts';
import { withDistrictComposition } from '../level/districtComposition.ts';
import { withDistrictActivity } from '../level/districtActivity.ts';

export interface PreparedPopulationWorld {
  readonly level: LevelPlan;
  readonly population: PopulationPlan;
}

/**
 * Boot and world replacement use the same finished ground and physical identity.
 * Presentation tiers never call this or supply an option. District finishing
 * follows accepted traffic/parking so its furniture reserves those actual lanes.
 * A changed physical plan is validated once more before any consumer installs it.
 */
export function preparePopulationWorld(source: LevelPlan): PreparedPopulationWorld {
  // One synchronous preparation shares the verified, value-checked footprint
  // and coverage memos; they are dropped when it returns.
  return withPopulationAuthoringMemo(() => preparePopulationWorldIn(source));
}
function preparePopulationWorldIn(source: LevelPlan): PreparedPopulationWorld {
  const installed = (source as DistrictAdjacentPlan).districtAdjacency;
  // Preparing an installed plan must retain its owned street fragments and
  // canonical pre-population identity rather than strip them or hash twice.
  const physicalWorldId = source.populationSourceWorldId ?? installed?.physicalWorldId;
  const canonical = physicalWorldId ? { ...source, id: physicalWorldId } : source;
  const prepared = physicalWorldId ? { level: canonical,
    population: buildPopulationPlan(canonical, canonical.populationPaths) }
    : prepareLivingWorldGround(withStreetGround(source));
  const finished = withDistrictComposition(withDistrictActivity(withDistrictAdjacency(prepared.level)));
  const population = finished === prepared.level ? prepared.population
    : buildPopulationPlan(finished, finished.populationPaths);
  const reconciled = finished === prepared.level || !population.report.groundSupplement ? finished
    : { ...finished, populationGroundReport: population.report.groundSupplement };
  const level = population.installedWorldId === reconciled.id ? reconciled
    : { ...reconciled, populationSourceWorldId: reconciled.id, id: population.installedWorldId };
  return { level: { ...level, recordWorldId: recordWorldIdFor(source, level) }, population };
}

/** Content a timed run is ridden against. Population actors are not in it:
 * they are refused inside a lap envelope, and they key nothing persisted. */
const STATIC_WORLD_KEYS = ['props', 'solids', 'softBodies', 'groundSurfacePatches', 'segments', 'heightfield',
  'surround', 'spawn', 'checkpoints', 'lap', 'hazards', 'targets', 'trickZones'] as const;
function sameStaticWorld(a: LevelPlan, b: LevelPlan): boolean {
  const empty = (value: unknown): boolean => value === undefined || (Array.isArray(value) && value.length === 0);
  return STATIC_WORLD_KEYS.every(key => a[key] === b[key] || (empty(a[key]) && empty(b[key]))
    || JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

/**
 * The record key's own revision. It starts spelled like the population rules
 * revision (`POPULATION_AUTHORING.revision`) but is not tied to it: that one
 * also renames plan ids and digests, this one only where bests are filed. Bump
 * it by hand when merged preparation changes what a timed run is ridden
 * against; every saved best and ghost then starts over on purpose.
 */
export const RECORD_WORLD_REVISION = 'living-r1';

/**
 * The key every record, ghost and run id is filed under. `plan.id` cannot be
 * it: the district stages name their worlds by hashing raw doubles, which
 * differ in the last bit between JavaScript engines (Node and Chromium already
 * disagree at Switchback), and those ids also seed population choices, so they
 * stay as they are. This one is built from strings only: the builder's own id
 * (generated-r6-<seed>, m7-slice, switchback-r<N>, belvar-r1), plus
 * `RECORD_WORLD_REVISION` when preparation added physical content. A world it
 * left physically untouched keeps its old key and its old bests and ghosts (BelVar).
 */
function recordWorldIdFor(source: LevelPlan, level: LevelPlan): string {
  if (source.recordWorldId !== undefined) return source.recordWorldId;
  // A plan installed without this field: its earliest stage names the builder world.
  const origin = source.districtAdjacency?.sourceWorldId ?? source.districtActivity?.sourceWorldId
    ?? source.districtComposition?.sourceWorldId ?? source.id;
  const changed = source.populationSourceWorldId !== undefined
    ? source.populationSourceWorldId !== origin : !sameStaticWorld(source, level);
  if (!origin || origin.length > 64) throw new RangeError('Invalid record source world id');
  if (!changed) return origin;
  // Records refuse level ids over 64 characters (`records.ts`); a string hash is engine-independent.
  const suffix = `~${RECORD_WORLD_REVISION}`;
  return origin.length + suffix.length <= 64 ? `${origin}${suffix}` : `world-${hash128(origin)}${suffix}`;
}

/** Where records, ghosts, Trick Run, Knockabout and chase bests are filed. */
export function recordWorldIdOf(plan: LevelPlan): string {
  return plan.recordWorldId ?? plan.id;
}
