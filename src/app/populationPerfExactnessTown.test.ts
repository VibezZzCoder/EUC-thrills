/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * PERF-POP exactness on the real default town (seed `euc`, prepared exactly
 * as Game installs it): the same guards as
 * `simulation/populationPerfExactness.test.ts`, on finished city ground with
 * its kerbs, grades, crossings and all 28 actors. A rider rides head-on into
 * the commercial sidewalk's walkers, stands in their way and rides on, with
 * compact parts, a placement reservation, the compound transaction and
 * knock-downs, so the shared epoch start, the footprint-only forecasts, the
 * fused committed velocities and the reaction-admission footprint rows are
 * all checked where the game uses them.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createLevel } from '../level/levels.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { PopulationSimulation, createPopulationPresentationSnapshot, type PopulationOccupant } from '../simulation/population.ts';
import { PopulationCompactAnticipationHistory } from '../simulation/populationCompactAnticipation.ts';
import { resolvePopulationCompoundMotionBatch, type PopulationCompoundTrajectory } from '../simulation/populationCompound.ts';
import {
  bits, compareCommitted, compareForecasts, emptyCoverage, freezePublished, snapshotRows,
} from '../simulation/populationPerfExactness.test-support.ts';
import { preparePopulationWorld } from './populationWorld.ts';

const STEP = 1 / 120;
const living = preparePopulationWorld(createLevel('generated', 'euc'));
const SIDEWALK = 'population/city-commercial-cross/sidewalk-band-0-0/0/clear-0';
type Body = PopulationOccupant['current'];
/** Who can be knocked down (population.ts `knockdownKind`). */
const PEOPLE = new Set(living.population.actors.filter(actor => ['walker', 'jogger', 'worker', 'social'].includes(actor.kind)).map(actor => actor.id));

/** The rider's start body for every tick: 4 m/s, a 4 s stand, then 3 m/s, along the sidewalk against its walkers. */
function script(ticks: number): Body[] {
  const path = living.population.paths.find(value => value.id === SIDEWALK);
  assert.ok(path, `the euc town lost its commercial sidewalk: ${SIDEWALK}`);
  const at = (s: number) => {
    const points = path.points; let low = 0, high = points.length - 1;
    s = Math.max(0, Math.min(path.lengthMetres, s));
    while (high - low > 1) { const mid = (low + high) >> 1; if (points[mid].distanceMetres <= s) low = mid; else high = mid; }
    const a = points[low], b = points[high], t = (s - a.distanceMetres) / Math.max(1e-9, b.distanceMetres - a.distanceMetres);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z) + Math.PI };
  };
  const bodies: Body[] = [];
  let s = 80;
  for (let tick = 0; tick <= ticks; tick += 1) {
    const v = tick < 600 ? 4 : tick < 1080 ? 0 : 3, p = at(s);
    bodies.push({ x: p.x, z: p.z, headingY: p.heading, minY: 0, maxY: 2.1, halfWidthMetres: 0.35, halfLengthMetres: 0.55,
      velocityX: Math.sin(p.heading) * v, velocityZ: Math.cos(p.heading) * v });
    s -= v * STEP;
  }
  return bodies;
}
const parts = (body: Body) => [
  { componentId: 'wheel', footprint: { ...body, maxY: 0.55, halfWidthMetres: 0.11, halfLengthMetres: 0.3 } },
  { componentId: 'human', footprint: { ...body, minY: 0.2, halfWidthMetres: 0.3, halfLengthMetres: 0.22 } }];

/** The production call order, tick by tick; `observe` runs after every public call. */
function ride(ticks: number, observe: (simulation: PopulationSimulation) => void, afterStep: (simulation: PopulationSimulation, tick: number) => void = () => {}) {
  const simulation = new PopulationSimulation(living.population, new PlanTerrainSampler(living.level));
  const history = new PopulationCompactAnticipationHistory(), controller = {}, bodies = script(ticks);
  const previousStore = createPopulationPresentationSnapshot(), currentStore = createPopulationPresentationSnapshot();
  const tally = { contacts: 0, knockdowns: 0 };
  for (let tick = 0; tick < ticks; tick += 1) {
    const a = bodies[tick], b = bodies[tick + 1];
    const owner = (body: Body) => [{ id: 'human-0', controller, serial: 0, complete: true, components: parts(body) }];
    const anticipation = history.begin(owner(a), simulation.tickIndex, STEP);
    simulation.step(STEP, [{ id: 'human-0', kind: 'human', previous: a, current: a }],
      tick % 300 < 30 ? [{ id: 'human-0/wheel', footprint: a, expiresAtClockSeconds: simulation.clockSeconds + 0.3 }] : [], anticipation);
    observe(simulation); afterStep(simulation, tick);
    const census = simulation.actorMotionCensus(); observe(simulation);
    const components: PopulationCompoundTrajectory[] = parts(a).map(part => ({ ownerId: 'human-0', componentId: part.componentId,
      stopGroupId: 'human-0', at: t => ({ ...part.footprint, x: part.footprint.x + (b.x - a.x) * t, z: part.footprint.z + (b.z - a.z) * t }),
      intervalEnvelopeMetres: () => 0 }));
    const intent: PopulationOccupant = { id: 'human-0', kind: 'human', previous: a, current: b };
    const prepared = simulation.prepareCompoundContacts([intent], components, (x, y) => resolvePopulationCompoundMotionBatch(x, y),
      { actorCensus: census }); observe(simulation);
    simulation.actorBodiesAtFractions(prepared.actorFractions); observe(simulation);
    const contacts = simulation.commitContacts(prepared, [intent]); observe(simulation);
    tally.contacts += contacts.length;
    for (const contact of contacts) if (contact.charge) { simulation.knockDown(contact.actorId, contact.normalX, contact.normalZ); tally.knockdowns += 1; observe(simulation); }
    // The two people nearest the rider sit down every 400 ticks, wherever they are.
    if (tick % 400 === 100) for (const actor of census.actors.filter(value => PEOPLE.has(value.id))
      .sort((p, q) => Math.hypot(p.current.x - a.x, p.current.z - a.z) - Math.hypot(q.current.x - a.x, q.current.z - a.z)).slice(0, 2)) {
      simulation.knockDown(actor.id, 1, 0); tally.knockdowns += 1; observe(simulation);
    }
    history.seal(owner(b), simulation.tickIndex);
    simulation.snapshot(); simulation.interpolate(0.5); simulation.actorFootprints();
    simulation.writePresentationEndpoints(previousStore, currentStore); observe(simulation);
  }
  return tally;
}

test('euc town: published poses are never written in place, and footprint rows are snapshot()\'s, over 2,400 steps', () => {
  let checks = 0;
  let tick = 0;
  const tally = ride(2400, simulation => {
    freezePublished(simulation);
    // Every call of every fourth tick: the rows cost a whole snapshot to check.
    if (tick % 4 === 0) assert.equal(bits(simulation.actorFootprintRows()), bits(snapshotRows(simulation)));
    checks += 1;
  }, (_simulation, at) => { tick = at; });
  // Reaching here is the freeze assertion: an in-place write to a frozen pose throws.
  assert.ok(checks > 14_000, `observed calls ${checks}`);
  assert.ok(tally.contacts > 0 && tally.knockdowns > 0, JSON.stringify(tally));
});

test('euc town: forecasts and committed poses equal the forms they replaced, by float bits, every actor every step', () => {
  const coverage = emptyCoverage();
  let committed = 0;
  ride(600, () => {}, (simulation, tick) => {
    const variants = tick % 30 === 0;
    const forecast = compareForecasts(simulation, STEP, coverage, variants);
    assert.equal(forecast, null, `tick ${tick}: ${forecast}`);
    const result = compareCommitted(simulation, STEP, variants);
    committed += result.comparisons;
    assert.equal(result.mismatch, null, `tick ${tick}: ${result.mismatch}`);
  });
  assert.ok(coverage.comparisons > 150_000 && committed > 15_000, `comparisons ${coverage.comparisons} / ${committed}`);
  assert.ok(coverage.refusals < coverage.comparisons / 100, `refusals ${coverage.refusals}`);
  assert.deepEqual([...coverage.kinds].sort(), ['fictionalEuc', 'jogger', 'parkedVehicle', 'serviceVehicle', 'social',
    'trafficVehicle', 'walker', 'worker']);
  for (const key of ['knockedDown', 'impactRows', 'paused', 'waiting', 'turning', 'reversed', 'pedal', 'tyres'] as const)
    assert.ok(coverage[key] > 0, `the ride must include ${key} actors: ${JSON.stringify({ ...coverage, kinds: undefined })}`);
});
