/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The riverside pin (browser QA, 2026-10-04). A fictional EUC rider turning on
 * the spot against the player was neither a person-sized turn the player meets
 * where it stands (`turningInPlace`) nor a motion that yields (a rotation has
 * no closing speed, `populationWholeStepRefusal`), so the player's body refused
 * the turn, and that refused turn refused every move the player made:
 * throttle, reverse and neutral all dead, the NPC frozen mid-turn for good.
 * Two turns led there: the R2C-5 occupant wait turning it round off the player
 * (only walkers and joggers step aside or turn round for a rider; every other
 * kind only waits, as before R2C-5), and the ordinary turn at its lane end
 * (an EUC rider's square is a round body's stand-in, as a person's is). Real
 * controller, population, certificates and whole-step transaction through the
 * headless composition double.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { POPULATION_AUTHORING } from '../data/tuning.ts';
import type { ActorSpec } from '../level/populationPlan.ts';
import { HARNESS_DT as DT, PopulationContactHarness, populationPlanOf, straightPath } from './populationContactHarness.test-support.ts';

const ride = (throttle: number, steer = 0): ActionSnapshot => ({ ...NEUTRAL_ACTIONS, throttle, steer });
/** An NPC shuttling along +Z on a straight lane (the generated world's hulls: populationPlan actorHull). */
function shuttle(kind: ActorSpec['kind'], laneMetres: number, from: number) {
  const radius = kind === 'fictionalEuc' ? POPULATION_AUTHORING.riderRadiusMetres : POPULATION_AUTHORING.pedestrianRadiusMetres;
  return { path: straightPath('lane', 0, 0, laneMetres), actor: { id: `${kind}-0`, kind, pathId: 'lane', initialDistanceMetres: from,
    direction: 1 as const, movement: 'shuttle' as const, speedMetresPerSecond: kind === 'fictionalEuc' ? 3.8 : 1.4, idleSeconds: 1,
    appearanceIndex: 0, hull: { halfWidthMetres: radius, halfLengthMetres: radius, heightMetres: 1.9 } } };
}
/** Reverse flat out from where the player is held; metres made good within `seconds`. */
function backAway(harness: PopulationContactHarness, seconds: number): number {
  const start = harness.controller.snapshot().position;
  let moved = 0;
  for (let i = 0; i < Math.round(seconds / DT) && moved < 1; i += 1) {
    harness.step(ride(-1));
    const now = harness.controller.snapshot().position; moved = Math.hypot(now.x - start.x, now.z - start.z);
  }
  return moved;
}

/** The NPC comes up to a player standing on its lane; the player then leans into it and holds there. */
function heldUp(kind: ActorSpec['kind']) {
  const harness = new PopulationContactHarness(populationPlanOf([shuttle(kind, 40, 8)]), { position: { x: 0, y: 0, z: 16 }, headingY: Math.PI });
  const npc = () => harness.population.snapshot().actors[0];
  for (let i = 0; i < Math.round(8 / DT) && !(npc().z > 12 && npc().speedMetresPerSecond === 0); i += 1) harness.step(ride(0));
  assert.ok(npc().z > 12 && npc().speedMetresPerSecond === 0, `the ${kind} came up and waited (z=${npc().z.toFixed(2)})`);
  const stop = { x: npc().x, z: npc().z };
  // Into its front and held against it until well past the occupant and mutual waits.
  let touched = 0;
  for (let i = 0; i < Math.round(4 / DT); i += 1) { harness.step(ride(0.35)); touched += harness.contacts.length; }
  const heading = npc().headingY, moved = backAway(harness, 1);
  return { moved, npc: npc(), heading, touched, left: Math.hypot(npc().x - stop.x, npc().z - stop.z) };
}

test('a player against a fictional EUC rider that waited on him can always back away', () => {
  const { moved, npc, heading, touched } = heldUp('fictionalEuc');
  assert.ok(touched > 0, 'the player pushed against the EUC rider');
  assert.ok(moved >= 1, `reverse moved the player only ${moved.toFixed(2)} m in 1 s (NPC ${npc.activity}, heading ${npc.headingY.toFixed(2)})`);
  assert.notEqual(npc.activity, 'turning', 'the EUC rider is not left frozen mid-turn');
  assert.equal(npc.direction, 1, 'it waits for the player; it does not turn round into him');
  assert.equal(npc.headingY, heading);
});

test('a walker held up by a player still gets out of his way, and the player can still back away', () => {
  // Control: R2C-5 stays for people, who step aside or turn on the spot into nobody.
  const { moved, npc, left } = heldUp('walker');
  assert.ok(left > 0.5, `the walker stood on in the player's way (${npc.activity}, ${left.toFixed(2)} m from its stop)`);
  assert.ok(moved >= 1, `reverse moved the player only ${moved.toFixed(2)} m in 1 s (walker ${npc.activity})`);
});

test('a player who rides into a fictional EUC rider turning at its lane end can back away, and its turn goes on', () => {
  // The lane ends at z = 20; the player waits beyond it, facing the NPC, and
  // rides into it while it pauses and turns there.
  const harness = new PopulationContactHarness(populationPlanOf([shuttle('fictionalEuc', 20, 14)]),
    { position: { x: 0, y: 0, z: 23.5 }, headingY: Math.PI });
  const npc = () => harness.population.snapshot().actors[0];
  for (let i = 0; i < Math.round(8 / DT) && !(npc().z > 19.9 && npc().speedMetresPerSecond === 0); i += 1) harness.step(ride(0));
  assert.ok(npc().z > 19.9, `the EUC rider reached its lane end (z=${npc().z.toFixed(2)})`);
  let touched = 0, turningWhenTouched = false;
  for (let i = 0; i < Math.round(3 / DT); i += 1) {
    harness.step(ride(0.3)); touched += harness.contacts.length;
    if (harness.contacts.length > 0 && npc().headingY > 0.1 && npc().headingY < Math.PI - 0.1) turningWhenTouched = true;
  }
  assert.ok(touched > 0 && turningWhenTouched, 'the player came against the EUC rider mid-turn');
  const moved = backAway(harness, 1.5);
  assert.ok(moved >= 1, `reverse moved the player only ${moved.toFixed(2)} m in 1.5 s (NPC ${npc().activity}, heading ${npc().headingY.toFixed(2)})`);
  for (let i = 0; i < Math.round(1 / DT); i += 1) harness.step(ride(0));
  assert.ok(Math.abs(npc().headingY - Math.PI) < 0.05, `its turn finished (heading ${npc().headingY.toFixed(2)}, ${npc().activity})`);
  assert.equal(npc().direction, -1);
});
