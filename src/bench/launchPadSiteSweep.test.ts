/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LAUNCH_PAD } from '../data/tuning.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { cityLaunchPads, launchPadClearRadius } from '../level/launchPadSites.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { CHASE_CORPUS } from './chaseBench.ts';
import { runPadTrial, type PadWheel } from './launchPadBench.ts';

/**
 * M42 — the real-site landing sweep (`docs/PLANS.md` §42.2b): every pad the
 * finder places in the corpus, launched through the shipped controller on
 * that prepared world's own sampler, armed, with no input after the approach,
 * from 16 headings at {5, 10, 16, 23, 29} m/s. Each flight lands with no
 * crash and no airborne refusal, no worse than heavy, inside the clear disc.
 * Clean is the target, and the tier counts are printed for the owner. A
 * failing site is removed by a finder rule, never by relaxing a tier.
 */

const CORPUS: readonly { seed: string; mph?: number }[] = [
  ...CHASE_CORPUS.map((seed) => ({ seed })),
  { seed: 'jetty-orchard-74' }, { seed: 'copper-gate-55' }, { seed: 'x67' }, { seed: 'lantern-span-7' },
  { seed: 'euc', mph: 50 },
];
const HEADINGS = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8);
const SPEEDS = [5, 10, 16, 23, 29] as const;

/** The shipped wheel holds 23 m/s; 29 is its top speed, ridden with the cutout off (the jump bench's diagnostic wheel). */
function wheelFor(speed: number): PadWheel {
  return speed >= 25 ? 'cutoutOff' : 'shipped';
}

test('every corpus pad lands every heading and speed: no crash, no airborne refusal, no worse than heavy, inside the disc', () => {
  const clear = launchPadClearRadius();
  const failures: string[] = [];
  const bySpeed = new Map<number, Record<string, number>>();
  let worstFlight = 0, worstTouchdown = 0, trials = 0, touchdownRefusals = 0;
  const after: string[] = [];
  for (const { seed, mph } of CORPUS) {
    const { level: plan, population } = preparePopulationWorld(generateLevel(seed, undefined, undefined, mph).plan);
    const sites = cityLaunchPads(plan, population);
    assert.ok(sites.length >= LAUNCH_PAD.minimumPads);
    for (const site of sites) {
      const fixture = { label: site.id, pad: site, sampler: () => new PlanTerrainSampler(plan) };
      for (const speed of SPEEDS) {
        const counts = bySpeed.get(speed) ?? {};
        bySpeed.set(speed, counts);
        for (const headingY of HEADINGS) {
          const trial = runPadTrial(fixture, { headingY, speed, wheel: wheelFor(speed) });
          trials += 1;
          counts[trial.tier] = (counts[trial.tier] ?? 0) + 1;
          worstFlight = Math.max(worstFlight, trial.flightMetres);
          worstTouchdown = Math.max(worstTouchdown, trial.touchdownFromCentre);
          touchdownRefusals += trial.touchdownRefusals;
          const where = `${seed}${mph ? `@${mph}mph` : ''} ${site.id} ${speed} m/s at ${headingY.toFixed(2)} rad`;
          if (!trial.launched) failures.push(`${where}: never launched`);
          else if (trial.crashed) failures.push(`${where}: crashed (${trial.tier})`);
          else if (trial.airborneRefusals > 0) failures.push(`${where}: ${trial.airborneRefusals} airborne refusals`);
          else if (trial.tier !== 'clean' && trial.tier !== 'heavy') failures.push(`${where}: landed ${trial.tier}`);
          else if (!(trial.touchdownFromCentre <= clear)) failures.push(`${where}: touched down ${trial.touchdownFromCentre.toFixed(1)} m out`);
          if (trial.crashedAfter) after.push(where);
        }
      }
    }
  }
  for (const [speed, counts] of bySpeed) {
    console.log(`[pad sweep] ${speed} m/s: ${Object.entries(counts).map(([tier, n]) => `${tier} ${n}`).join(', ')}`);
  }
  console.log(`[pad sweep] ${trials} flights; longest flight ${worstFlight.toFixed(2)} m, `
    + `farthest touchdown ${worstTouchdown.toFixed(2)} m from a centre (disc ${clear.toFixed(1)} m); `
    + `${touchdownRefusals} one-step touchdown refusals (a rising landing touched a step early); `
    + `${after.length} rolled on into something within 0.25 s after a good landing${after.length ? `: ${after.join('; ')}` : ''}`);
  assert.deepEqual(failures.slice(0, 40), []);
});
