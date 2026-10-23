/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * PERF-POP exactness guards (2026-10-17). The population fixed step stopped
 * deep-copying its epoch start, builds forecasts without a whole pose, writes
 * committed velocities in one literal, forms each compact part's padded
 * blocker once per step and reuses sweep endpoints; physical reaction
 * admission reads footprint rows instead of a whole snapshot. Every one of
 * those is meant to be bit-identical, so each claim is pinned here directly:
 * the differential harness cannot see a one-ulp forecast drift that changes
 * no decision, and its corpus never drives a van past its look-ahead horizon.
 *
 * The fixture holds every actor kind (a pedal-riding NPC wheel, tyred vans, a
 * traffic loop, a parked car, a worker, a social pair, walkers and a jogger),
 * two riders with compact parts, crossings, reservations in a van lane, the
 * compound and legacy contact paths and knock-downs. The euc town's own ride
 * is `app/populationPerfExactnessTown.test.ts`.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createPopulationPresentationSnapshot, type PopulationFootprint } from './population.ts';
import {
  bits, compareCommitted, compareForecasts, emptyCoverage, freezePublished, fusedForecast, internals,
  liveFrame, oneUlp, referenceForecast, snapshotRows,
} from './populationPerfExactness.test-support.ts';
import { Ride, STEP } from './populationPerfExactnessFixture.test-support.ts';

test('published poses are never written in place (the shared epoch start stays the epoch start)', () => {
  let ride!: Ride; let calls = 0;
  ride = new Ride(() => { freezePublished(ride.simulation); calls += 1; });
  const previousStore = createPopulationPresentationSnapshot(), currentStore = createPopulationPresentationSnapshot();
  for (let tick = 0; tick < 1200; tick += 1) {
    ride.tick(tick);
    const sim = ride.simulation;
    sim.snapshot(); sim.previousSnapshot(); sim.interpolate(0.5); sim.actorFootprints(); sim.actorFootprintRows();
    sim.writePresentationEndpoints(previousStore, currentStore); freezePublished(sim);
  }
  // Reaching here is the assertion: any in-place write to a frozen published
  // pose, footprint, hull, sourceHull or support record throws a TypeError.
  assert.ok(calls > 6000, `public calls observed: ${calls}`);
  assert.ok(ride.tally.contacts > 0 && ride.tally.charges + ride.tally.knockdowns > 0, JSON.stringify(ride.tally));
});

test('the epoch start shares the published poses but is its own snapshot record each step', () => {
  const ride = new Ride();
  ride.tick(0);
  const view = internals(ride.simulation);
  const published = view.current;
  ride.tick(1);
  assert.notEqual(view.previous, published, 'a fresh epoch record per step (the lookahead memo is keyed on it)');
  assert.equal(view.previous.actors, published.actors, 'the published poses themselves are shared, not deep-copied');
  assert.equal(view.previous.tick, published.tick); assert.equal(view.previous.clockSeconds, published.clockSeconds);
});

test('forecast footprints equal the whole-pose forecast they replaced, by float bits and key order', () => {
  const ride = new Ride(), coverage = emptyCoverage();
  for (let tick = 0; tick < 900; tick += 1) {
    ride.tick(tick);
    const mismatch = compareForecasts(ride.simulation, STEP, coverage, tick % 10 === 0);
    assert.equal(mismatch, null, `tick ${tick}: ${mismatch}`);
  }
  assert.ok(coverage.comparisons > 100_000, `comparisons ${coverage.comparisons}`);
  assert.equal(coverage.refusals, 0, 'smooth finite ground never refuses');
  assert.deepEqual([...coverage.kinds].sort(), ['fictionalEuc', 'jogger', 'parkedVehicle', 'serviceVehicle', 'social',
    'trafficVehicle', 'walker', 'worker']);
  for (const key of ['aside', 'knockedDown', 'paused', 'waiting', 'turning', 'reversed', 'pedal', 'tyres', 'impactRows'] as const)
    assert.ok(coverage[key] > 0, `the ride must include ${key} actors: ${JSON.stringify({ ...coverage, kinds: undefined })}`);

  // Negative controls: the comparison sees one ulp, key order and the sign of zero.
  const state = internals(ride.simulation).states.find(value => value.spec.kind === 'walker')!;
  const footprint = fusedForecast(ride.simulation, state, liveFrame(state), 0.01);
  assert.equal(bits(footprint), bits(referenceForecast(ride.simulation, state, liveFrame(state), 0.01)));
  assert.notEqual(bits({ ...footprint, maxY: oneUlp(footprint.maxY) }), bits(footprint));
  assert.notEqual(bits({ ...footprint, sourceHull: { ...footprint.sourceHull!,
    verticalPaddingAboveMetres: oneUlp(footprint.sourceHull!.verticalPaddingAboveMetres!) } }), bits(footprint));
  const { x, ...rest } = footprint;
  assert.notEqual(bits({ ...rest, x }), bits(footprint), 'key order counts');
  assert.notEqual(bits({ ...footprint, velocityX: -0 }), bits({ ...footprint, velocityX: 0 }), '-0 counts');
});

test('fused committed velocities equal the outer-spread form, pose and footprint, key for key', () => {
  const ride = new Ride();
  let comparisons = 0;
  for (let tick = 0; tick < 900; tick += 1) {
    ride.tick(tick);
    const result = compareCommitted(ride.simulation, STEP, tick % 10 === 0);
    comparisons += result.comparisons;
    assert.equal(result.mismatch, null, `tick ${tick}: ${result.mismatch}`);
  }
  assert.ok(comparisons > 30_000, `comparisons ${comparisons}`);
});

test('footprint rows are exactly snapshot()\'s ids, footprints and clock, in order, and detached', () => {
  const ride = new Ride(() => {
    const sim = ride.simulation;
    assert.equal(bits(sim.actorFootprintRows()), bits(snapshotRows(sim)));
  });
  for (let tick = 0; tick < 600; tick += 1) ride.tick(tick);
  const sim = ride.simulation, before = bits(sim.snapshot());
  const rows = sim.actorFootprintRows(), again = sim.actorFootprintRows();
  const published = internals(sim).current.actors;
  rows.actors.forEach((row, index) => {
    assert.notEqual(row.footprint, published[index].footprint);
    assert.notEqual(row.footprint, again.actors[index].footprint);
    assert.notEqual(row.footprint.sourceHull, published[index].footprint.sourceHull);
    assert.notEqual(row.footprint.sourceHull!.hull, published[index].footprint.sourceHull!.hull);
    // Writing a returned row moves nothing inside the simulation.
    const writable = row.footprint as { -readonly [K in keyof PopulationFootprint]: PopulationFootprint[K] };
    writable.x = NaN; (writable.sourceHull as { x: number }).x = NaN;
    (writable.sourceHull!.hull as { halfWidthMetres: number }).halfWidthMetres = NaN;
  });
  assert.equal(bits(sim.snapshot()), before);
  assert.equal(rows.clockSeconds, sim.snapshot().clockSeconds);
});

test('part and route blocker reuse reaches the recorded world, vans past their horizon included', () => {
  const ride = new Ride(), rows: unknown[] = [];
  let fastest = 0, actorBlocked = 0;
  for (let tick = 0; tick < 900; tick += 1) {
    rows.push(ride.tick(tick));
    for (const actor of ride.simulation.snapshot().actors) if (actor.kind === 'serviceVehicle') fastest = Math.max(fastest, actor.speedMetresPerSecond);
    for (const row of ride.simulation.anticipationState()) if (row.blockedBy?.startsWith('actor:')) actorBlocked += 1;
  }
  assert.ok(fastest > 4.6, `a van must outrun its look-ahead horizon: ${fastest}`);
  assert.ok(actorBlocked > 0, 'route scans must meet actor blockers');
  // Recorded on the frozen pre-PERF-POP tree (2026-10-17, baseline-src) with this
  // file's fixture: snapshot, anticipation rows, previews, fractions, contacts
  // and clearances every tick. A deliberate behaviour change re-records it.
  assert.equal(digest(rows), RECORDED_WORLD);
});
function digest(value: unknown): string {
  // FNV-1a over float bits, strings and insertion-ordered keys.
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer); let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ n, 16777619) >>> 0; };
  const walk = (x: unknown): void => {
    if (typeof x === 'number') { f64[0] = x; mix(u32[0]); mix(u32[1]); return; }
    if (typeof x === 'string') { mix(x.length); for (let i = 0; i < x.length; i++) mix(x.charCodeAt(i)); return; }
    if (typeof x !== 'object' || x === null) { mix(x === true ? 3 : x === false ? 4 : x === null ? 1 : 2); return; }
    if (Array.isArray(x)) { mix(9); mix(x.length); for (const y of x) walk(y); return; }
    mix(10); for (const key of Object.keys(x)) { walk(key); walk((x as Record<string, unknown>)[key]); }
  };
  walk(value); return h.toString(16);
}
// Re-recorded 2026-10-21 (Claude) for one deliberate change: a vehicle's route
// scan ignores bodies wholly behind its rear bumper (`whollyBehind`, population.ts),
// which ended the follower-held deadlock that froze every Quay van loop.
const RECORDED_WORLD = '1a014c80';
