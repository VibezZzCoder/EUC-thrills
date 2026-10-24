/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * PERF-WHARF (2026-10-23): resolvePopulationCompoundMotionBatch keeps each
 * actor's exact endpoint values, identity strings and first-pass actor/actor
 * verdicts across batches. Every warm batch here must equal, to the float bit
 * and key order, the same batch resolved cold under a never-seen id namespace:
 * standing crowds bit-identical tick after tick (fresh, frozen and unfrozen
 * objects), walkers crossing them, merged pairs that escape, grade-aligned
 * source hulls, a -0 that flips sign, a second world reusing the same ids
 * between passes, and repeated refusal passes inside one tick.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolvePopulationCompoundMotionBatch, type PopulationCompoundActorMotion, type PopulationCompoundTrajectory } from './populationCompound.ts';
import { physicalPopulationHull, type PopulationFootprint } from './population.ts';
import { bits } from './populationPerfExactness.test-support.ts';

const person = (x: number, z: number, headingY = 0, velocityX = 0, velocityZ = 0): PopulationFootprint => ({
  x, z, headingY, minY: 0, maxY: 1.9, halfWidthMetres: .42, halfLengthMetres: .42, velocityX, velocityZ });
/** A grade-aligned body with an exact source hull and paddings, as population actors carry on slopes. */
const graded = (x: number, z: number, headingY: number, velocityX = 0, velocityZ = 0): PopulationFootprint => {
  const hull = physicalPopulationHull(x, .3, z, headingY, .08, 1, -.05, { halfWidthMetres: .4, halfLengthMetres: .45, heightMetres: 1.8 }, velocityX, velocityZ);
  return { ...hull, minY: hull.minY - .02, maxY: hull.maxY + .03,
    sourceHull: { ...hull.sourceHull!, marginMetres: .01, verticalPaddingBelowMetres: .02, verticalPaddingAboveMetres: .03 } };
};
const linear = (ownerId: string, componentId: string, from: PopulationFootprint, to: PopulationFootprint): PopulationCompoundTrajectory => ({
  ownerId, componentId, stopGroupId: 'physical',
  at: time => ({ ...from, x: from.x + (to.x - from.x) * time, z: from.z + (to.z - from.z) * time,
    velocityX: (to.x - from.x) * 120, velocityZ: (to.z - from.z) * 120 }),
  intervalEnvelopeMetres: () => 0 });
const freeze = (actor: PopulationCompoundActorMotion): PopulationCompoundActorMotion => {
  for (const body of [actor.previous, actor.current]) {
    if (body.sourceHull) { Object.freeze(body.sourceHull.hull); Object.freeze(body.sourceHull); }
    Object.freeze(body);
  }
  return Object.freeze(actor);
};

/** One tick of a small crowd: clusters standing (some merged), walkers through them, a rider. */
function world(tick: number, ns: string, shift = 0): { actors: PopulationCompoundActorMotion[]; components: PopulationCompoundTrajectory[] } {
  const actors: PopulationCompoundActorMotion[] = [];
  for (let cluster = 0; cluster < 4; cluster += 1) for (let member = 0; member < 5; member += 1) {
    const x = cluster * 6 + (member % 3) * .8 + shift, z = Math.floor(member / 3) * .82;
    // A merged pair (initial overlap), a graded member and a -0 that flips sign every 7 ticks.
    const at = member === 4 ? person(x - .7, z - .2, .3) : member === 2 ? graded(x, z, .4)
      : person(cluster === 0 && member === 0 && shift === 0 ? (Math.floor(tick / 7) % 2 ? -0 : 0) : x, z, member * .1);
    actors.push({ id: `${ns}stand-${cluster}-${member}`, previous: { ...at, ...(at.sourceHull ? { sourceHull: { ...at.sourceHull, hull: { ...at.sourceHull.hull } } } : {}) },
      current: { ...at, ...(at.sourceHull ? { sourceHull: { ...at.sourceHull, hull: { ...at.sourceHull.hull } } } : {}) } });
  }
  for (let walker = 0; walker < 6; walker += 1) {
    const speed = 1.2 + walker * .1, x0 = -4 + tick * speed / 120 + walker * 4 + shift, z0 = (walker % 3) * .9 - .3;
    const make = walker % 2 ? graded : person;
    actors.push({ id: `${ns}walk-${walker}`, ownerId: walker === 5 ? `${ns}crew` : undefined,
      previous: make(x0, z0, Math.PI / 2, speed, 0), current: make(x0 + speed / 120, z0, Math.PI / 2, speed, 0) });
  }
  const rider = (t: number) => ({ x: 20 - t * 6 / 120 + shift, z: .4 });
  const a = rider(tick), b = rider(tick + 1);
  const wheel = (p: { x: number; z: number }) => ({ ...person(p.x, p.z, -Math.PI / 2, -6, 0), maxY: .55, halfWidthMetres: .11, halfLengthMetres: .3 });
  const human = (p: { x: number; z: number }) => ({ ...person(p.x, p.z, -Math.PI / 2, -6, 0), minY: .2, halfWidthMetres: .3, halfLengthMetres: .22 });
  return { actors, components: [linear(`${ns}human-0`, 'wheel', wheel(a), wheel(b)), linear(`${ns}human-0`, 'human', human(a), human(b))] };
}

let fresh = 0;
const cold = (tick: number, shift = 0): string => {
  const ns = `cold${fresh++}:`, { actors, components } = world(tick, ns, shift);
  return bits(resolvePopulationCompoundMotionBatch(actors, components, { certifiedInitialOverlap: 'continuous-proof' })).replaceAll(ns, '');
};
const warm = (actors: readonly PopulationCompoundActorMotion[], components: readonly PopulationCompoundTrajectory[]): string =>
  bits(resolvePopulationCompoundMotionBatch(actors, components, { certifiedInitialOverlap: 'continuous-proof' })).replaceAll('warm:', '');

test('kept actor values and pair verdicts reproduce a cold batch to the bit, tick after tick', () => {
  let contacts = 0;
  for (let tick = 0; tick < 420; tick += 1) {
    const expected = cold(tick);
    contacts += (expected.match(/actorOwnerId=/g) ?? []).length;
    const plain = world(tick, 'warm:');
    assert.equal(warm(plain.actors, plain.components), expected, `tick ${tick}: first pass`);
    // A second refusal pass in the same tick, over the census's frozen objects.
    const frozen = world(tick, 'warm:'), census = Object.freeze(frozen.actors.map(freeze));
    assert.equal(warm(census, frozen.components), expected, `tick ${tick}: frozen pass`);
    assert.equal(warm(census, frozen.components), expected, `tick ${tick}: repeated frozen pass`);
    // Another world with the same ids between passes must not leak into this one.
    if (tick % 5 === 0) {
      const other = world(tick, 'warm:', .37), otherExpected = cold(tick, .37);
      assert.equal(warm(other.actors, other.components), otherExpected, `tick ${tick}: shifted world`);
      assert.equal(warm(plain.actors, plain.components), expected, `tick ${tick}: back to the first world`);
    }
  }
  assert.ok(contacts > 0, 'the rider must meet the crowd somewhere in the ride');
});

test('an actor mutated in place after a batch is measured again, never served from its kept values', () => {
  const ns = 'mutable:', { actors, components } = world(30, ns);
  const before = bits(resolvePopulationCompoundMotionBatch(actors, components));
  // stand-3-0, a plain body the rider meets at this tick, steps clear of everyone.
  const moved = actors[15] as { previous: { x: number }; current: { x: number } };
  moved.previous.x += 30; moved.current.x += 30;
  const expectedNs = `cold${fresh++}:`, copy = world(30, expectedNs);
  (copy.actors[15].previous as { x: number }).x += 30; (copy.actors[15].current as { x: number }).x += 30;
  const expected = bits(resolvePopulationCompoundMotionBatch(copy.actors, copy.components)).replaceAll(expectedNs, ns);
  assert.equal(bits(resolvePopulationCompoundMotionBatch(actors, components)), expected);
  assert.notEqual(expected, before, 'the move must change the batch, or this test proves nothing');
});
