/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** M47: the living-r2 density layer on the generated cities, end to end
 * through `preparePopulationWorld`. The base roster, the world, its ids and
 * its record key are pinned to what the living-r1 code produced before the
 * density layer existed; the layer itself is checked on the same worlds. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { POPULATION_AUTHORING, POPULATION_DENSITY } from '../data/tuning.ts';
import { createLevel, type LevelId } from '../level/levels.ts';
import type { LevelPlan } from '../level/plan.ts';
import { hash128, planDigest } from '../level/planDigest.ts';
import {
  createPopulationValidationContext, isPopulationPerson, populationActorAdmission, populationWalkingSlots,
  type ActorSpec, type PopulationPath, type PopulationPlan,
} from '../level/populationPlan.ts';
import {
  authorPopulationDensity, populationRoster, POPULATION_DENSITY_LAYERS, type PopulationDensity,
  type PopulationDensityActor,
} from '../level/populationDensity.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { preparePopulationWorld, type PreparedPopulationWorld } from './populationWorld.ts';

/**
 * Recorded 2026-10-25 on Node 26 by running the living-r1 code as it stood
 * BEFORE the M47 refactor of `actorsFromPaths` (scratch baseline script, same
 * expressions as below): hash128 of the whole prepared level's JSON, of the
 * prepared population's JSON, of the STATIC_WORLD_KEYS values, and the ids.
 * The density layer must leave every one of them exactly as it was.
 */
const BEFORE_M47 = {
  euc: { levelId: 'composition-r16-70679ff85da40994a395ce0135605e17~living-r1',
    recordWorldId: 'generated-r6-euc~living-r1', actors: 28, population: 'c0c034381c04a3045fe209a127ed090f',
    contentDigest: 'edcfc6d137cf85c84bda05d21a4dfaec', level: '034a26867fee12ffabf4eeebb30d3069',
    staticWorld: 'f3f6f4056e3fe4a56c6612c030af65ca' },
  'amber-arch': { levelId: 'composition-r16-c90470b113e3a5cdee0f822488313206~living-r1',
    recordWorldId: 'generated-r6-amber-arch~living-r1', actors: 28, population: 'fa673adc2352b7b26a65b405d174c17f',
    contentDigest: '6e373841dba4ac4c7b219a5ac36266ac', level: 'b5ed5f405c5f49c4c2bf2a954e2f2813',
    staticWorld: '5e7bd0c7ce8d1cb8e467ffe205df5b18' },
  'copper-drift': { levelId: 'composition-r16-36bde629f94b7e1032857ae2e0cead64~living-r1',
    recordWorldId: 'generated-r6-copper-drift~living-r1', actors: 28, population: 'a0b2c2113c7b94fc799a9e8edc0317a0',
    contentDigest: 'ee4743393a4622d8a43753868ea1ff60', level: '11f8098c01f3bea046cdf84f4ff503f5',
    staticWorld: '6a64e22a68c20cf8a2f8e2d7518e0ea5' },
} as const;
type Seed = keyof typeof BEFORE_M47;
const SEEDS = Object.keys(BEFORE_M47) as Seed[];
/** `app/populationWorld.ts` STATIC_WORLD_KEYS, spelled out so a change there is a change here. */
const STATIC_WORLD_KEYS = ['props', 'solids', 'softBodies', 'groundSurfacePatches', 'segments', 'heightfield',
  'surround', 'spawn', 'checkpoints', 'lap', 'hazards', 'targets', 'trickZones'] as const;
const staticWorld = (level: LevelPlan): string => hash128(JSON.stringify(STATIC_WORLD_KEYS.map(key => level[key])));

const worlds = new Map<string, PreparedPopulationWorld>();
function prepared(seed: Seed): PreparedPopulationWorld {
  if (!worlds.has(seed)) worlds.set(seed, preparePopulationWorld(createLevel('generated', seed)));
  return worlds.get(seed)!;
}
function withoutDensity(population: PopulationPlan): Omit<PopulationPlan, 'density'> {
  const { density: _density, ...rest } = population;
  return rest;
}
function densityOf(seed: Seed): PopulationDensity {
  const density = prepared(seed).population.density;
  assert.ok(density, `${seed}: a generated city carries a density layer`);
  return density;
}
const people = (actors: readonly ActorSpec[]): number => actors.filter(actor => isPopulationPerson(actor.kind)).length;
const vehicles = (actors: readonly ActorSpec[]): number => actors.filter(actor => actor.kind === 'trafficVehicle').length;
/** A person's runtime facing (`simulation/population.ts` reset): the path heading, a half turn at -1. */
function poseOf(path: PopulationPath, actor: ActorSpec): { x: number; z: number; headingY: number } {
  let index = 1;
  while (index < path.points.length - 1 && path.points[index].distanceMetres < actor.initialDistanceMetres) index += 1;
  const a = path.points[index - 1], b = path.points[index];
  const t = Math.max(0, Math.min(1, (actor.initialDistanceMetres - a.distanceMetres) / (b.distanceMetres - a.distanceMetres)));
  const turn = Math.atan2(Math.sin(b.headingY - a.headingY), Math.cos(b.headingY - a.headingY));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    headingY: a.headingY + turn * t + (actor.direction === -1 ? Math.PI : 0) };
}

test('the living-r1 roster, the world, its ids and its record key are exactly what they were before M47', () => {
  for (const seed of SEEDS) {
    const { level, population } = prepared(seed), before = BEFORE_M47[seed];
    assert.equal(level.id, before.levelId, `${seed}: plan id`);
    assert.equal(level.recordWorldId, before.recordWorldId, `${seed}: record key`);
    assert.equal(population.installedWorldId, before.levelId, `${seed}: installed id`);
    assert.equal(population.actors.length, before.actors, `${seed}: base actors`);
    assert.equal(population.contentDigest, before.contentDigest, `${seed}: base digest`);
    assert.equal(population.rulesRevision, POPULATION_AUTHORING.revision);
    assert.equal(population.vehicleFollowing, undefined, `${seed}: the base keeps the living-r1 vehicle rules`);
    assert.equal(population.densityLayer, undefined);
    assert.equal(hash128(JSON.stringify(withoutDensity(population))), before.population, `${seed}: base population, byte for byte`);
    assert.equal(hash128(JSON.stringify(level)), before.level, `${seed}: the whole prepared level, byte for byte`);
    assert.equal(staticWorld(level), before.staticWorld, `${seed}: static world`);
  }
});

test('authoring the layer never writes the plan or its static world', () => {
  const { level, population } = prepared('euc');
  const digest = planDigest(level), statics = staticWorld(level);
  const again = authorPopulationDensity(level, population, POPULATION_DENSITY_LAYERS);
  assert.equal(planDigest(level), digest);
  assert.equal(staticWorld(level), statics);
  assert.deepStrictEqual(again, population.density, 'the attached layer is the production layering of this plan');
});

test('the density layer is deterministic across preparations, and survives re-preparing the installed city', () => {
  const one = prepared('euc'), two = preparePopulationWorld(createLevel('generated', 'euc'));
  assert.equal(JSON.stringify(two.population.density), JSON.stringify(one.population.density), 'bit for bit');
  assert.equal(two.population.density?.digest, one.population.density?.digest);
  const reinstalled = preparePopulationWorld(one.level);
  assert.equal(reinstalled.level.id, one.level.id);
  assert.equal(reinstalled.level.recordWorldId, one.level.recordWorldId);
  assert.deepStrictEqual(reinstalled.population.density, one.population.density);
});

test('one shared admission: re-adding the base roster, then every extra in order, reproduces both', () => {
  // The base actors prove `add` is the very function the living-r1 fill ran;
  // the extras prove each was admitted against every base body and every
  // earlier extra, exactly as a base actor would have been.
  for (const seed of SEEDS) {
    const { level, population } = prepared(seed), density = densityOf(seed);
    const admission = populationActorAdmission(level, new PlanTerrainSampler(level),
      createPopulationValidationContext(level), level.populationActivityChoiceWorldId ?? population.sourceWorldId);
    const paths = new Map(population.paths.map(path => [path.id, path]));
    const anchors = new Map(population.anchors.map(anchor => [anchor.id, anchor]));
    const readd = (actor: ActorSpec, facing?: 1 | -1): boolean => admission.add(actor.kind, paths.get(actor.pathId)!,
      actor.initialDistanceMetres, actor.anchorId === undefined ? undefined : anchors.get(actor.anchorId),
      actor.socialGroupId, actor.activityWalkId, undefined, facing);
    for (const actor of population.actors) assert.ok(readd(actor), `${seed}: ${actor.id} is admitted again`);
    assert.deepStrictEqual(admission.actors, population.actors, `${seed}: identical ids, directions, looks and hulls`);
    for (const actor of density.actors) {
      assert.ok(readd(actor, actor.kind === 'social' ? actor.direction : undefined), `${seed}: extra ${actor.id} is admitted again`);
    }
    assert.deepStrictEqual(admission.actors.slice(population.actors.length),
      density.actors.map(({ layer: _layer, ...actor }) => actor), `${seed}: identical extras`);
  }
});

test('layers stack: medium is a prefix of high, ids are unique, and totals stay within the caps', () => {
  for (const seed of SEEDS) {
    const { level, population } = prepared(seed), density = densityOf(seed);
    assert.equal(density.revision, POPULATION_DENSITY.revision);
    assert.equal(density.digest, hash128(JSON.stringify({ revision: density.revision, actors: density.actors })));
    const layers = density.actors.map(actor => actor.layer);
    assert.deepEqual(layers, [...layers].sort((a, b) => (a === 'medium' ? 0 : 1) - (b === 'medium' ? 0 : 1)),
      `${seed}: every medium extra precedes every high extra`);
    const medium = authorPopulationDensity(level, population, [POPULATION_DENSITY_LAYERS[0]]);
    assert.deepStrictEqual(medium.actors, density.actors.filter(actor => actor.layer === 'medium'),
      `${seed}: a lone medium layer is high's prefix`);
    const ids = [...population.actors, ...density.actors].map(actor => actor.id);
    assert.equal(new Set(ids).size, ids.length, `${seed}: ids are unique`);
    for (const actor of density.actors) {
      assert.ok(['trafficVehicle', 'social', 'walker', 'jogger'].includes(actor.kind), `${seed}: ${actor.kind} is not a density kind`);
    }
    for (const layer of POPULATION_DENSITY_LAYERS) {
      const roster = populationRoster(population, layer.layer as 'medium' | 'high');
      assert.ok(people(roster.actors) <= layer.maximumPeople, `${seed} ${layer.layer}: people over the cap`);
      assert.ok(vehicles(roster.actors) <= layer.maximumTrafficVehicles, `${seed} ${layer.layer}: traffic over the cap`);
      // Riders, parked and service vehicles keep the base roster's numbers.
      for (const kind of ['fictionalEuc', 'parkedVehicle', 'serviceVehicle', 'worker'] as const) {
        assert.equal(roster.actors.filter(actor => actor.kind === kind).length,
          population.actors.filter(actor => actor.kind === kind).length, `${seed} ${layer.layer}: ${kind}`);
      }
    }
  }
});

test('extra traffic keeps the headway on every loop, base vehicles included', () => {
  for (const seed of SEEDS) {
    const { population } = prepared(seed), high = populationRoster(population, 'high');
    assert.ok(vehicles(high.actors) > vehicles(population.actors), `${seed}: traffic was added`);
    for (const path of population.paths.filter(item => item.role === 'traffic' && item.closed)) {
      const stations = high.actors.filter(actor => actor.pathId === path.id).map(actor => actor.initialDistanceMetres)
        .sort((a, b) => a - b);
      stations.forEach((station, index) => {
        if (stations.length < 2) return;
        const next = index + 1 < stations.length ? stations[index + 1] : stations[0] + path.lengthMetres;
        assert.ok(next - station >= POPULATION_DENSITY.minimumTrafficHeadwayMetres,
          `${seed} ${path.id}: ${station} m and ${next} m`);
      });
    }
  }
});

test('standing groups are two or three, atomic, one group id, spaced and turned to their centre', () => {
  let groupsSeen = 0;
  for (const seed of SEEDS) {
    const { population } = prepared(seed), density = densityOf(seed);
    const paths = new Map(population.paths.map(path => [path.id, path]));
    const groups = new Map<string, PopulationDensityActor[]>();
    for (const actor of density.actors) {
      if (actor.kind !== 'social') continue;
      assert.ok(actor.socialGroupId, `${seed}: ${actor.id} stands alone`);
      groups.set(actor.socialGroupId, [...(groups.get(actor.socialGroupId) ?? []), actor]);
    }
    for (const [id, members] of groups) {
      groupsSeen += 1;
      assert.ok(members.length >= POPULATION_DENSITY.socialGroupMinimumSize
        && members.length <= POPULATION_DENSITY.socialGroupMaximumSize, `${seed} ${id}: ${members.length} members`);
      assert.equal(new Set(members.map(member => `${member.pathId}|${member.anchorId}|${member.layer}`)).size, 1,
        `${seed} ${id}: one path, anchor and layer`);
      assert.ok(!population.actors.some(actor => actor.socialGroupId === id || actor.anchorId === members[0].anchorId),
        `${seed} ${id}: no base actor owns its anchor`);
      const path = paths.get(members[0].pathId)!;
      const poses = members.map(member => poseOf(path, member));
      const centreX = poses.reduce((sum, pose) => sum + pose.x, 0) / poses.length;
      const centreZ = poses.reduce((sum, pose) => sum + pose.z, 0) / poses.length;
      poses.forEach((pose, index) => {
        assert.equal(members[index].movement, 'stationary');
        if (index > 0) assert.ok(Math.hypot(pose.x - poses[index - 1].x, pose.z - poses[index - 1].z)
          >= POPULATION_AUTHORING.socialSpacingMetres, `${seed} ${id}: members closer than the social gap`);
        // A trio's middle member stands at the centre (a curved path puts the
        // centroid a few centimetres to one side); it turns to a neighbour.
        if (index * 2 === members.length - 1) return;
        const toX = centreX - pose.x, toZ = centreZ - pose.z, reach = Math.hypot(toX, toZ);
        // Forward is (sin h, cos h), as every population pose carrier is built.
        assert.ok((Math.sin(pose.headingY) * toX + Math.cos(pose.headingY) * toZ) / reach > 0.9,
          `${seed} ${id}: member ${index} faces away from the group`);
      });
    }
    // Each layer's standing share stays within its budget.
    let total = people(population.actors);
    for (const layer of POPULATION_DENSITY_LAYERS) {
      const extra = density.actors.filter(actor => actor.layer === layer.layer);
      assert.ok(extra.filter(actor => actor.kind === 'social').length
        <= Math.floor((layer.maximumPeople - total) * POPULATION_DENSITY.socialGroupShare), `${seed} ${layer.layer}: group share`);
      total += people(extra);
    }
  }
  assert.ok(groupsSeen > 0, 'the cities have standing groups to check');
});

test('extra people spread across the city: on euc at high, half the paths with a free slot, at most 3 per path', () => {
  const { level, population } = prepared('euc'), density = densityOf('euc');
  // A free slot is one a walker could take beside the base roster: unoccupied
  // AND admitted by the shared `add`. Counting merely unoccupied slots (74
  // paths on euc) would ask more paths than 40 extras can reach once groups
  // share theirs. Each probe is rolled back, so every slot meets the base alone.
  const worldId = level.populationActivityChoiceWorldId ?? population.sourceWorldId;
  const admission = populationActorAdmission(level, new PlanTerrainSampler(level),
    createPopulationValidationContext(level), worldId);
  const paths = new Map(population.paths.map(path => [path.id, path]));
  for (const actor of population.actors) admission.restore(actor, paths.get(actor.pathId)!);
  const free = new Set<string>();
  for (const slot of populationWalkingSlots(population.paths, population.anchors, worldId).flat()) {
    const before = admission.actors.length;
    if (admission.add(slot.kind, slot.path, slot.along)) { free.add(slot.path.id); admission.truncate(before); }
  }
  const extras = density.actors.filter(actor => isPopulationPerson(actor.kind));
  assert.equal(people(populationRoster(population, 'high').actors), people(population.actors) + extras.length);
  const perPath = new Map<string, number>();
  for (const actor of extras) perPath.set(actor.pathId, (perPath.get(actor.pathId) ?? 0) + 1);
  const covered = [...free].filter(id => perPath.has(id)).length;
  assert.ok(covered * 2 >= free.size, `extras stand on ${covered} of the ${free.size} paths with a free slot`);
  for (const [id, count] of perPath) assert.ok(count <= 3, `${id} takes ${count} extras`);
});

test('2x and 4x rosters are reachable on every seed: 40 and 80 people, 4 and 8 vehicles', () => {
  for (const seed of SEEDS) {
    const { level, population } = prepared(seed);
    for (const [maximumPeople, maximumTrafficVehicles] of [[40, 4], [80, 8]] as const) {
      const density = authorPopulationDensity(level, population, [{ layer: 'measure', maximumPeople, maximumTrafficVehicles }]);
      const all = [...population.actors, ...density.actors];
      assert.equal(people(all), maximumPeople, `${seed}: ${maximumPeople} people`);
      assert.equal(vehicles(all), maximumTrafficVehicles, `${seed}: ${maximumTrafficVehicles} vehicles`);
    }
  }
});

test('hand-built venues get no density layer, and every roster of theirs is the plan itself', () => {
  for (const id of ['slice', 'proving', 'track', 'switchback', 'euclaude'] as const satisfies readonly LevelId[]) {
    const { population } = preparePopulationWorld(createLevel(id));
    assert.equal(population.density, undefined, `${id}: no density`);
    for (const layer of ['base', 'medium', 'high'] as const) assert.equal(populationRoster(population, layer), population);
  }
});

test('rosters: base is the plan itself, layers are memoised and count the base plus their extras', () => {
  for (const seed of SEEDS) {
    const { population } = prepared(seed), density = densityOf(seed);
    assert.equal(populationRoster(population, 'base'), population);
    const medium = populationRoster(population, 'medium'), high = populationRoster(population, 'high');
    assert.equal(populationRoster(population, 'medium'), medium);
    assert.equal(populationRoster(population, 'high'), high);
    assert.equal(medium.actors.length, population.actors.length
      + density.actors.filter(actor => actor.layer === 'medium').length);
    assert.equal(high.actors.length, population.actors.length + density.actors.length);
    assert.deepStrictEqual(high.actors.slice(0, medium.actors.length), medium.actors);
    assert.equal(medium.vehicleFollowing, 'living-r2');
    assert.equal(high.paths, population.paths);
    assert.equal(high.installedWorldId, population.installedWorldId, 'a roster renames no world');
  }
});
