/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LAUNCH_PAD } from '../data/tuning.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { cityLaunchPads } from '../level/launchPadSites.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { CHASE_CORPUS } from './chaseBench.ts';
import { padLines, rideLine, type LineRide } from './launchPadBench.ts';

/**
 * M42 — the natural-line proof (`docs/PLANS.md` §42.2b): a pad is never in
 * the riding line at speed; a rider has to leave the road and aim for one.
 *
 * On the **prepared** world of every `CHASE_CORPUS` town (`buildChaseWorld`'s
 * three lines, on `preparePopulationWorld`'s plan rather than the raw one),
 * the outlaw scripts ride the canonical spine forwards and the town ring
 * backwards (follower, sprinter, and the overcooked sprinter at a 1.15
 * cornering margin), the evader's course through every alternate both ways,
 * and every optional branch and chicken line both ways. Every upright
 * position stays at least footprint + 3 m from every pad; every position the
 * overcooked sprinter reaches off the paved road stays at least footprint +
 * the flight cap away. The measured minimum distances are printed, so the
 * proof is visibly not vacuous.
 */

test('no outlaw script rides near a pad; the overcooked sprinter\'s overruns stay a flight away', () => {
  const ordinaryLimit = LAUNCH_PAD.footprintRadiusMetres + 3;
  const overrunLimit = LAUNCH_PAD.footprintRadiusMetres + LAUNCH_PAD.maximumFlightMetres;
  const failures: string[] = [];
  for (const seed of CHASE_CORPUS) {
    const { level: plan, population } = preparePopulationWorld(generateLevel(seed).plan);
    const pads = cityLaunchPads(plan, population);
    assert.ok(pads.length >= LAUNCH_PAD.minimumPads, `${seed} has pads to ride past`);
    const ground = new PlanTerrainSampler(plan);
    const lines = padLines(plan, ground);
    assert.ok(lines.length >= 4, `${seed}: the spine, the ring back and the alternates both ways`);
    const rides: LineRide[] = [];
    for (const line of lines) for (const kind of line.kinds) rides.push(rideLine(plan, ground, line, kind, pads));
    let nearest = Infinity, nearestOverrun = Infinity, shortest = Infinity;
    for (const ride of rides) {
      if (ride.kind === 'overcooked') {
        nearestOverrun = Math.min(nearestOverrun, ride.nearestOverrun);
        if (ride.nearestOverrun < overrunLimit) {
          failures.push(`${seed} ${ride.line} overcooked: an overrun ${ride.nearestOverrun.toFixed(2)} m from a pad`);
        }
      }
      nearest = Math.min(nearest, ride.nearest);
      if (ride.nearest < ordinaryLimit) {
        failures.push(`${seed} ${ride.line} ${ride.kind}: ${ride.nearest.toFixed(2)} m from a pad`);
      }
      shortest = Math.min(shortest, ride.covered);
    }
    // Not vacuous: the spine is ridden the whole way by every script. (A
    // reversed line can meet something only ridable one way — steps, a
    // ledge — and stop; its coverage is printed, never hidden.)
    for (const ride of rides.filter((value) => value.line === 'spine forwards')) {
      assert.ok(ride.covered >= 0.99, `${seed}: ${ride.kind} rode the whole spine (${ride.covered.toFixed(2)})`);
    }
    console.log(`[pad line] ${seed}: ${rides.length} rides on ${lines.length} lines; nearest upright position `
      + `${nearest.toFixed(2)} m, nearest overcooked overrun ${nearestOverrun.toFixed(2)} m; `
      + `least covered ${shortest.toFixed(2)} (${rides.filter((ride) => ride.covered < 0.99)
        .map((ride) => `${ride.line} ${ride.kind} ${ride.covered.toFixed(2)}`).join('; ') || 'none'})`);
  }
  assert.deepEqual(failures, []);
});
