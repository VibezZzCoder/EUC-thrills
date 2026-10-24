/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * PERF-WHARF exactness on the Wheelhouse Wharf (`?level=euclaude`, prepared
 * exactly as Game installs it), the venue the pass was for: 122 actors, 68 of
 * them standing, fifteen vans scanning their routes every step. Three riders
 * ride the market lane, the park jog and the ring road against the traffic,
 * with compact parts, a placement reservation, the compound transaction and
 * knock-downs, in the production call order of `populationPerfExactnessTown`.
 *
 * The route-scan memos and row storage, the vans' shared id order and
 * blockers, the actor-pair sweep, the movers' X-sorted candidates, the cross-
 * step endpoint memo and the sampler window-proof memo are all reached here.
 * They must change no output: every public output and every anticipation row,
 * every step, digests to the value recorded on the untouched pre-PERF-WHARF
 * tree (2026-10-23), and nothing published is ever written in place.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createEuclaudeLevel } from '../level/euclaudeLevel.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { PopulationSimulation, createPopulationPresentationSnapshot, type PopulationOccupant } from '../simulation/population.ts';
import { PopulationCompactAnticipationHistory } from '../simulation/populationCompactAnticipation.ts';
import { resolvePopulationCompoundMotionBatch, type PopulationCompoundTrajectory } from '../simulation/populationCompound.ts';
import { freezePublished } from '../simulation/populationPerfExactness.test-support.ts';
import { preparePopulationWorld } from './populationWorld.ts';

const STEP = 1 / 120;
const living = preparePopulationWorld(createEuclaudeLevel());
type Body = PopulationOccupant['current'];
const PEOPLE = new Set(living.population.actors.filter(actor => ['walker', 'jogger', 'worker', 'social'].includes(actor.kind)).map(actor => actor.id));
const RIDERS = [{ path: 'quay-market-in/clear-0', start: 200 }, { path: 'quay-park-jog/clear-0', start: 100 },
  { path: 'quay-ring-traffic/clear-0', start: 300 }] as const;

/** Each rider's start body for every tick: 4 m/s, a stand, then 3 m/s, backwards along its path, weaving 0.8 m. */
function script(spec: typeof RIDERS[number], ticks: number, k: number): Body[] {
  const path = living.population.paths.find(value => value.id === spec.path);
  assert.ok(path, `the Wharf lost a path: ${spec.path}`);
  const at = (s: number) => {
    const points = path.points; let low = 0, high = points.length - 1;
    s = ((s % path.lengthMetres) + path.lengthMetres) % path.lengthMetres;
    while (high - low > 1) { const mid = (low + high) >> 1; if (points[mid].distanceMetres <= s) low = mid; else high = mid; }
    const a = points[low], b = points[high], t = (s - a.distanceMetres) / Math.max(1e-9, b.distanceMetres - a.distanceMetres);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z) + Math.PI };
  };
  const bodies: Body[] = [];
  let s = spec.start;
  for (let tick = 0; tick <= ticks; tick += 1) {
    const phase = (tick + k * 211) % 1500, v = phase < 600 ? 4 : phase < 1000 ? 0 : 3, p = at(s);
    const lateral = 0.8 * Math.sin(tick * 0.01 + k);
    bodies.push({ x: p.x + Math.cos(p.heading) * lateral, z: p.z - Math.sin(p.heading) * lateral, headingY: p.heading,
      minY: p.y, maxY: p.y + 2.1, halfWidthMetres: 0.35, halfLengthMetres: 0.55,
      velocityX: Math.sin(p.heading) * v, velocityZ: Math.cos(p.heading) * v });
    s -= v * STEP;
  }
  return bodies;
}
const parts = (body: Body) => [
  { componentId: 'wheel', footprint: { ...body, maxY: body.minY + 0.55, halfWidthMetres: 0.11, halfLengthMetres: 0.3 } },
  { componentId: 'human', footprint: { ...body, minY: body.minY + 0.2, halfWidthMetres: 0.3, halfLengthMetres: 0.22 } }];

/** FNV-1a over float bits, strings and insertion-ordered keys (as `populationPerfExactness.test.ts`). */
function digester() {
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer); let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ n, 16777619) >>> 0; };
  const walk = (x: unknown): void => {
    if (typeof x === 'number') { f64[0] = x; mix(u32[0]); mix(u32[1]); return; }
    if (typeof x === 'string') { mix(x.length); for (let i = 0; i < x.length; i++) mix(x.charCodeAt(i)); return; }
    if (typeof x !== 'object' || x === null) { mix(x === true ? 3 : x === false ? 4 : x === null ? 1 : 2); return; }
    if (Array.isArray(x)) { mix(9); mix(x.length); for (const y of x) walk(y); return; }
    mix(10); for (const key of Object.keys(x)) { walk(key); walk((x as Record<string, unknown>)[key]); }
  };
  return { walk, get value() { return h.toString(16); } };
}

/** The production call order, tick by tick; every public output and anticipation row is digested. */
function ride(ticks: number, observe: (simulation: PopulationSimulation) => void): { digest: string; contacts: number; actorBlocked: number } {
  const simulation = new PopulationSimulation(living.population, new PlanTerrainSampler(living.level));
  const history = new PopulationCompactAnticipationHistory(), controllers = RIDERS.map(() => ({}));
  const scripts = RIDERS.map((spec, k) => script(spec, ticks, k));
  const previousStore = createPopulationPresentationSnapshot(), currentStore = createPopulationPresentationSnapshot();
  const digest = digester();
  let contacts = 0, actorBlocked = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    const a = scripts.map(value => value[tick]), b = scripts.map(value => value[tick + 1]);
    const owners = (bodies: Body[]) => bodies.map((body, k) => ({ id: `human-${k}`, controller: controllers[k], serial: 0, complete: true, components: parts(body) }));
    const anticipation = history.begin(owners(a), simulation.tickIndex, STEP);
    simulation.step(STEP, a.map((body, k) => ({ id: `human-${k}`, kind: 'human' as const, previous: body, current: body })),
      tick % 300 < 30 ? [{ id: 'human-0/wheel', footprint: a[0], expiresAtClockSeconds: simulation.clockSeconds + 0.3 }] : [], anticipation);
    observe(simulation);
    const rows = simulation.anticipationState();
    for (const row of rows) if (row.blockedBy?.startsWith('actor:')) actorBlocked += 1;
    digest.walk(rows); digest.walk(simulation.snapshot());
    const census = simulation.actorMotionCensus(); observe(simulation); digest.walk(census);
    const components: PopulationCompoundTrajectory[] = a.flatMap((body, k) => parts(body).map(part => ({ ownerId: `human-${k}`,
      componentId: part.componentId, stopGroupId: `human-${k}`,
      at: (t: number) => ({ ...part.footprint, x: part.footprint.x + (b[k].x - body.x) * t, z: part.footprint.z + (b[k].z - body.z) * t }),
      intervalEnvelopeMetres: () => 0 })));
    const intents: PopulationOccupant[] = a.map((body, k) => ({ id: `human-${k}`, kind: 'human', previous: body, current: b[k] }));
    const prepared = simulation.prepareCompoundContacts(intents, components, (x, y) => resolvePopulationCompoundMotionBatch(x, y),
      { actorCensus: census }); observe(simulation); digest.walk(prepared);
    digest.walk(simulation.actorBodiesAtFractions(prepared.actorFractions)); observe(simulation);
    const committed = simulation.commitContacts(prepared, intents); observe(simulation); digest.walk(committed);
    contacts += committed.length;
    for (const contact of committed) if (contact.charge) { simulation.knockDown(contact.actorId, contact.normalX, contact.normalZ); observe(simulation); }
    if (tick % 400 === 100) for (const actor of census.actors.filter(value => PEOPLE.has(value.id))
      .sort((p, q) => Math.hypot(p.current.x - a[0].x, p.current.z - a[0].z) - Math.hypot(q.current.x - a[0].x, q.current.z - a[0].z)).slice(0, 2)) {
      simulation.knockDown(actor.id, 1, 0); observe(simulation);
    }
    history.seal(owners(b), simulation.tickIndex);
    digest.walk(simulation.snapshot()); digest.walk(simulation.interpolate(0.5)); digest.walk(simulation.actorFootprints());
    simulation.writePresentationEndpoints(previousStore, currentStore); observe(simulation);
    digest.walk(previousStore); digest.walk(currentStore); digest.walk(simulation.actorFootprintRows());
  }
  return { digest: digest.value, contacts, actorBlocked };
}

// Recorded 2026-10-23 (Claude) on the untouched pre-PERF-WHARF tree with this
// file's ride. A deliberate behaviour change re-records it; a speed-up never does.
const RECORDED_WHARF = '75d28168';

test('wharf: every output and anticipation row equals the untouched tree\'s, and nothing published is written in place', () => {
  const result = ride(900, freezePublished);
  if (process.env.PERF_WHARF_RECORD) console.log(`RECORDED_WHARF ${result.digest}`);
  assert.ok(result.contacts > 0, 'the riders must meet the crowd');
  assert.ok(result.actorBlocked > 0, 'route scans must meet actor blockers');
  assert.equal(result.digest, RECORDED_WHARF);
});
