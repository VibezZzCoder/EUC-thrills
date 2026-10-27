/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M47 dense census (PLANS §47): ten minutes of each generated city's living-r2
 * High roster (60 people, 11 traffic vehicles and the service van) with nobody
 * riding, prepared exactly as `Game` installs it and stepped with the empty
 * compact-anticipation census at 1/60 s, as `populationCensus.test.ts` does
 * for the base roster. copper-drift's Medium roster rides too: its commercial
 * pavement end, which lies in the lane, pinned a van between two walkers
 * there for the session before the pinned-person rules.
 *
 * The bounds are what the living-r2 rules do, with a little room (`CASES`;
 * the fix pass of 2026-10-26 recorded at most 24.3 s / 11.5 s over 300 s at
 * both 1/60 s and the game's own 1/120 s). Before the rules every seed
 * deadlocked within minutes: the euc commercial out-and-back froze in
 * seconds, and walkers and whole loops of vans stood for the session. Codex's
 * audit seeds then froze loops behind pavements that end in a lane until
 * walkers turned at the lane's edge (`trimLaneEnds`), gave way to a van that
 * kept them waiting, and let a pathmate in a van's way by. Every vehicle must
 * also still be moving at the end (`LATE_SECONDS`): a loop that froze after
 * its first lap had covered its 40 m long before.
 *
 * The two audit seeds whose freezes depended on the step size also run five
 * minutes at the game's own 1/120 s (`NATIVE_CASES`, Codex's follow-up QA,
 * 2026-10-26): the fix pass found rules that cleared a freeze at 1/60 s and
 * moved it at 1/120 s, which a 1/60 s census alone cannot see.
 *
 * The second test holds the living-r2 route-scan broad phase to its promise:
 * the very same poses and scan answers as the full scan, fewer blocker tests.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createLevel } from '../level/levels.ts';
import { populationRoster } from '../level/populationDensity.ts';
import { POPULATION_TRAFFIC } from '../data/tuning.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { PopulationSimulation, sweepPopulationHulls, type PopulationActorPose } from '../simulation/population.ts';
import { PopulationCompactAnticipationHistory } from '../simulation/populationCompactAnticipation.ts';
import { preparePopulationWorld } from './populationWorld.ts';

const DEFAULT_STEP = 1 / 60;
const DEFAULT_SECONDS = 600;
/** Per roster: the longest vehicle stand and person wait allowed, seconds, beside what was recorded. */
const CASES = [
  { seed: 'euc', layer: 'high', vehicleSeconds: 30, personSeconds: 14 },
  { seed: 'amber-arch', layer: 'high', vehicleSeconds: 30, personSeconds: 14 },
  { seed: 'copper-drift', layer: 'high', vehicleSeconds: 30, personSeconds: 14 },
  { seed: 'copper-drift', layer: 'medium', vehicleSeconds: 30, personSeconds: 14 },
  // Codex's audit seeds (2026-10-26): before the fix pass 02 and 03 froze whole loops for good.
  { seed: 'm47-audit-01', layer: 'high', vehicleSeconds: 30, personSeconds: 14 },
  { seed: 'm47-audit-02', layer: 'high', vehicleSeconds: 30, personSeconds: 14 },
  { seed: 'm47-audit-03', layer: 'high', vehicleSeconds: 30, personSeconds: 14 },
] as const;
/** At the game's own fixed step: five minutes each of the seeds whose freezes depended on it. */
const NATIVE_STEP = 1 / 120;
const NATIVE_SECONDS = 300;
const NATIVE_CASES = [
  { seed: 'm47-audit-02', layer: 'high', vehicleSeconds: 30, personSeconds: 14 },
  { seed: 'm47-audit-03', layer: 'high', vehicleSeconds: 30, personSeconds: 14 },
] as const;
/** Every moving vehicle covers at least this in the census's last this many seconds, metres and seconds. */
const LATE_METRES = 40;
const LATE_SECONDS = 120;
/** A vehicle slower than this over a step stands still, m/s. */
const STANDING_METRES_PER_SECOND = 0.1;

function census(seed: string, layer: 'medium' | 'high', vehicleSeconds: number, personSeconds: number,
  stepSeconds = DEFAULT_STEP, totalSeconds = DEFAULT_SECONDS): void {
  const living = preparePopulationWorld(createLevel('generated', seed));
  const plan = populationRoster(living.population, layer);
  assert.equal(plan.vehicleFollowing, 'living-r2', 'a density roster runs the living-r2 traffic rules');
  const moving = new Set(plan.actors.filter(actor => actor.movement !== 'stationary').map(actor => actor.id));
  const vehicles = new Set(plan.actors.filter(actor => actor.kind === 'serviceVehicle' || actor.kind === 'trafficVehicle').map(actor => actor.id));
  const bodies = plan.actors.filter(actor => actor.kind.endsWith('Vehicle')).map(actor => actor.id);
  const loops = new Map<string, string[]>();
  for (const actor of plan.actors) if (actor.kind === 'trafficVehicle') loops.set(actor.pathId, [...(loops.get(actor.pathId) ?? []), actor.id]);
  const lengths = new Map(plan.paths.map(path => [path.id, path.lengthMetres]));
  const halfLength = new Map(plan.actors.map(actor => [actor.id, actor.hull.halfLengthMetres]));
  const simulation = new PopulationSimulation(plan, new PlanTerrainSampler(living.level));
  const anticipation = { components: [], incompleteOwnerIds: [] };
  const waiting = new Map<string, number>(), standing = new Map<string, number>(), longest = new Map<string, number>();
  const moved = new Map<string, number>(), late = new Map<string, number>(), overlaps: string[] = [];
  const lateFrom = Math.round((totalSeconds - LATE_SECONDS) / stepSeconds);
  let tightest = Infinity, tightestAt = '';
  let previous = simulation.snapshot().actors;
  for (let step = 0; step < Math.round(totalSeconds / stepSeconds); step += 1) {
    simulation.step(stepSeconds, [], [], anticipation);
    const actors = simulation.snapshot().actors, byId = new Map<string, PopulationActorPose>(actors.map(pose => [pose.id, pose]));
    actors.forEach((pose, index) => {
      if (!moving.has(pose.id)) return;
      const travel = Math.hypot(pose.x - previous[index].x, pose.z - previous[index].z);
      moved.set(pose.id, (moved.get(pose.id) ?? 0) + travel);
      if (step >= lateFrom) late.set(pose.id, (late.get(pose.id) ?? 0) + travel);
      // A person waits on end; a vehicle stands on end (it may crawl while 'waiting').
      const run = vehicles.has(pose.id) ? travel < STANDING_METRES_PER_SECOND * stepSeconds ? (standing.get(pose.id) ?? 0) + stepSeconds : 0
        : pose.activity === 'waiting' ? (waiting.get(pose.id) ?? 0) + stepSeconds : 0;
      (vehicles.has(pose.id) ? standing : waiting).set(pose.id, run);
      longest.set(pose.id, Math.max(longest.get(pose.id) ?? 0, run));
    });
    // No two vehicles' bodies ever overlap (parked ones included).
    for (let a = 0; a < bodies.length; a += 1) for (let b = a + 1; b < bodies.length; b += 1) {
      const first = byId.get(bodies[a])!.footprint, second = byId.get(bodies[b])!.footprint;
      if (Math.hypot(first.x - second.x, first.z - second.z) > 12) continue;
      const hit = sweepPopulationHulls(first, first, second, second);
      if (hit !== null && hit.initiallyOverlapping && overlaps.length < 5) overlaps.push(`${(step * stepSeconds).toFixed(1)} s ${bodies[a]} x ${bodies[b]}`);
    }
    // A vehicle standing behind its loop's next vehicle keeps the standstill gap.
    for (const [pathId, ids] of loops) {
      if (ids.length < 2) continue;
      const length = lengths.get(pathId)!;
      for (const id of ids) {
        const self = byId.get(id)!;
        if (Math.abs(self.speedMetresPerSecond) > 0.05) continue;
        let ahead = Infinity, leader = '';
        for (const other of ids) if (other !== id) {
          const along = ((byId.get(other)!.distanceMetres - self.distanceMetres) % length + length) % length;
          if (along < ahead) { ahead = along; leader = other; }
        }
        const gap = ahead - halfLength.get(id)! - halfLength.get(leader)!;
        if (gap < tightest) { tightest = gap; tightestAt = `${(step * stepSeconds).toFixed(1)} s ${id} behind ${leader}`; }
      }
    }
    previous = actors;
  }
  const people = [...longest].filter(([id, seconds]) => !vehicles.has(id) && seconds > personSeconds)
    .map(([id, seconds]) => `${id} waited ${seconds.toFixed(1)} s`);
  const stood = [...longest].filter(([id, seconds]) => vehicles.has(id) && seconds > vehicleSeconds)
    .map(([id, seconds]) => `${id} stood ${seconds.toFixed(1)} s`);
  const at = `${seed} ${layer} at 1/${Math.round(1 / stepSeconds)} s`;
  assert.deepEqual(people, [], `${at}: no person waits on and on`);
  assert.deepEqual(stood, [], `${at}: no vehicle stands on and on`);
  const still = [...moving].filter(id => (moved.get(id) ?? 0) < 40).map(id => `${id} moved ${(moved.get(id) ?? 0).toFixed(1)} m`);
  assert.deepEqual(still, [], `${at}: every moving actor covers ground`);
  // Still circulating at the end, not only once early on: a loop that froze
  // after its first lap covered its 40 m long before (Codex's audit).
  const stalled = [...vehicles].filter(id => moving.has(id) && (late.get(id) ?? 0) < LATE_METRES)
    .map(id => `${id} moved ${(late.get(id) ?? 0).toFixed(1)} m`);
  assert.deepEqual(stalled, [], `${at}: every moving vehicle still covers ground in the last ${LATE_SECONDS} s`);
  assert.deepEqual(overlaps, [], `${at}: no two vehicles overlap`);
  assert.ok(tightest >= POPULATION_TRAFFIC.standstillGapMetres - 0.05,
    `${at}: standing behind its leader a vehicle keeps the standstill gap (${tightest.toFixed(3)} m at ${tightestAt})`);
}

for (const { seed, layer, vehicleSeconds, personSeconds } of CASES) {
  test(`ten minutes of the ${seed} city's ${layer} roster with no riders: traffic flows and nobody stands for good`, { timeout: 900_000 }, () => {
    census(seed, layer, vehicleSeconds, personSeconds);
  });
}

for (const { seed, layer, vehicleSeconds, personSeconds } of NATIVE_CASES) {
  test(`five minutes of the ${seed} city's ${layer} roster at the game's own 1/120 s step: traffic flows and nobody stands for good`, { timeout: 900_000 }, () => {
    census(seed, layer, vehicleSeconds, personSeconds, NATIVE_STEP, NATIVE_SECONDS);
  });
}

test('the living-r2 route-scan broad phase leaves every pose and scan answer exactly as the full scan, with a rider standing by', { timeout: 300_000 }, () => {
  const living = preparePopulationWorld(createLevel('generated', 'euc'));
  const plan = populationRoster(living.population, 'high');
  const sampler = new PlanTerrainSampler(living.level);
  const pruned = new PopulationSimulation(plan, sampler), full = new PopulationSimulation(plan, sampler);
  // The full scan: the box the broad phase prunes by is never formed.
  (full as unknown as { routeScanBox: () => null }).routeScanBox = () => null;
  // A rider parked by the commercial loop's first vehicle, so his compact parts meet some scans and not others.
  const lane = plan.actors.find(actor => actor.kind === 'trafficVehicle' && actor.pathId.includes('commercial'))!;
  const at = full.snapshot().actors.find(pose => pose.id === lane.id)!;
  const body = { x: at.x + 4, z: at.z + 4, headingY: 0, minY: at.y, maxY: at.y + 2.1, halfWidthMetres: 0.35, halfLengthMetres: 0.55, velocityX: 0, velocityZ: 0 };
  const owner = [{ id: 'human-0', controller: sampler, serial: 0, complete: true, components: [
    { componentId: 'wheel', footprint: { ...body, maxY: at.y + 0.55, halfWidthMetres: 0.11, halfLengthMetres: 0.3 } },
    { componentId: 'human', footprint: { ...body, minY: at.y + 0.2, halfWidthMetres: 0.3, halfLengthMetres: 0.22 } }] }];
  const occupants = [{ id: 'human-0', kind: 'human' as const, previous: body, current: body }];
  const histories = [new PopulationCompactAnticipationHistory(), new PopulationCompactAnticipationHistory()];
  const answer = (simulation: PopulationSimulation) => simulation.anticipationState().map(row => ({ actorId: row.actorId,
    availableTravelMetres: row.availableTravelMetres, blockedBy: row.blockedBy, overflow: row.overflow,
    targetSpeedMetresPerSecond: row.targetSpeedMetresPerSecond, incomplete: row.incomplete }));
  let prunedTests = 0, fullTests = 0;
  for (let step = 0; step < 40 * 120; step += 1) {
    [pruned, full].forEach((simulation, k) => {
      const parts = histories[k].begin(owner, simulation.tickIndex, 1 / 120);
      simulation.step(1 / 120, occupants, [], parts);
      histories[k].seal(owner, simulation.tickIndex);
    });
    assert.deepEqual(answer(pruned), answer(full), `step ${step}: the same scan answers`);
    if (step % 60 === 0) assert.deepEqual(pruned.snapshot(), full.snapshot(), `step ${step}: the same poses`);
    for (const row of pruned.anticipationState()) prunedTests += row.blockerTests;
    for (const row of full.anticipationState()) fullTests += row.blockerTests;
  }
  assert.deepEqual(pruned.snapshot(), full.snapshot());
  assert.ok(prunedTests * 10 < fullTests, `the broad phase cut the blocker tests (${prunedTests} against ${fullTests})`);
});
