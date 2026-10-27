/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan } from '../level/plan.ts';
import { buildPopulationPlanSteps, withPopulationAuthoringMemoSteps, type PopulationPlan } from '../level/populationPlan.ts';
import { hash128 } from '../level/planDigest.ts';
import { withStreetGround } from './streetGround.ts';
import { prepareLivingWorldGroundSteps } from '../level/livingWorldGround.ts';
import { withDistrictAdjacencySteps, type DistrictAdjacentPlan } from '../level/districtAdjacency.ts';
import { withDistrictCompositionSteps } from '../level/districtComposition.ts';
import { withDistrictActivitySteps } from '../level/districtActivity.ts';
import { GENERATED_LEVEL_PREFIX } from '../level/generateRoute.ts';
import { authorPopulationDensitySteps, POPULATION_DENSITY_LAYERS } from '../level/populationDensity.ts';
import { PREPARATION_SLICE, runSteps, type Steps } from '../shared/preparationSteps.ts';

export interface PreparedPopulationWorld {
  readonly level: LevelPlan;
  readonly population: PopulationPlan;
}

/**
 * Boot and world replacement use the same finished ground and physical identity.
 * Presentation tiers never call this or supply an option. District finishing
 * follows accepted traffic/parking so its furniture reserves those actual lanes.
 * A changed physical plan is validated once more before any consumer installs it.
 * A generated city's population also carries its M47 density layer, authored
 * last; a consumer picks a roster from it (`populationRoster`), never a world.
 */
export function preparePopulationWorld(source: LevelPlan): PreparedPopulationWorld {
  // One preparation shares the verified, value-checked footprint and coverage
  // memos; they are dropped when it returns. Drained synchronously here (world
  // swaps, the QA bridge, tests); only the browser boot drives the slices.
  return runSteps(preparePopulationWorldSteps(source));
}
/** The boot path: the same preparation as slices (`shared/preparationSteps.ts`).
 * A slice is never a loading checkpoint and changes nothing it computes. */
export function preparePopulationWorldSteps(source: LevelPlan): Steps<PreparedPopulationWorld> {
  return withPopulationAuthoringMemoSteps(() => preparePopulationWorldInSteps(source));
}
function* preparePopulationWorldInSteps(source: LevelPlan): Steps<PreparedPopulationWorld> {
  if (source.populationActivity?.ground === 'authored') {
    const canonical={...source,id:source.populationSourceWorldId??source.id};
    const population=yield* buildPopulationPlanSteps(canonical,canonical.populationPaths);
    return { level:{...canonical,populationSourceWorldId:canonical.id,id:population.installedWorldId,
      recordWorldId:source.recordWorldId??canonical.id},population };
  }
  const installed = (source as DistrictAdjacentPlan).districtAdjacency;
  // Preparing an installed plan must retain its owned street fragments and
  // canonical pre-population identity rather than strip them or hash twice.
  const physicalWorldId = source.populationSourceWorldId ?? installed?.physicalWorldId;
  const canonical = physicalWorldId ? { ...source, id: physicalWorldId } : source;
  const prepared = physicalWorldId ? { level: canonical,
    population: yield* buildPopulationPlanSteps(canonical, canonical.populationPaths) }
    : yield* prepareLivingWorldGroundSteps(withStreetGround(source));
  yield PREPARATION_SLICE;
  // Was `withDistrictComposition(withDistrictActivity(withDistrictAdjacency(…)))`:
  // the same calls, innermost first.
  const adjacent = yield* withDistrictAdjacencySteps(prepared.level);
  yield PREPARATION_SLICE;
  const active = yield* withDistrictActivitySteps(adjacent);
  yield PREPARATION_SLICE;
  const finished = yield* withDistrictCompositionSteps(active);
  yield PREPARATION_SLICE;
  const population = finished === prepared.level ? prepared.population
    : yield* buildPopulationPlanSteps(finished, finished.populationPaths);
  const reconciled = finished === prepared.level || !population.report.groundSupplement ? finished
    : { ...finished, populationGroundReport: population.report.groundSupplement };
  const level = population.installedWorldId === reconciled.id ? reconciled
    : { ...reconciled, populationSourceWorldId: reconciled.id, id: population.installedWorldId };
  const recorded = { ...level, recordWorldId: recordWorldIdFor(source, level) };
  if (!builderWorldId(source).startsWith(GENERATED_LEVEL_PREFIX)) return { level: recorded, population };
  // M47: a generated city's density layer, authored last against the finished
  // ground. No district stage or static key reads actors, so the world, its
  // ids and its record key are exactly those above; the base roster too.
  yield PREPARATION_SLICE;
  const density = yield* authorPopulationDensitySteps(recorded, population, POPULATION_DENSITY_LAYERS);
  return { level: recorded, population: { ...population, density } };
}

/**
 * The builder's own world id: the earliest stage's record of it, else the
 * plan's id (`generated-r6-<seed>`, m7-slice, switchback-r<N>, belvar-r1, …).
 * Only the generator spells ids with `GENERATED_LEVEL_PREFIX`; its fallback
 * world is the slice under the slice's own id, and an installed city keeps the
 * id in `districtAdjacency.sourceWorldId` through every later preparation. So
 * this one string, which the record key is also built from, says whether a
 * world is a generated city, before or after installation.
 */
function builderWorldId(source: LevelPlan): string {
  return source.districtAdjacency?.sourceWorldId ?? source.districtActivity?.sourceWorldId
    ?? source.districtComposition?.sourceWorldId ?? source.id;
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
  const origin = builderWorldId(source);
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
