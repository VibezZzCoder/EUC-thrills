/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The premise of Game's native far-owner step (POP-6/CP-5, 2026-10-03).
 *
 * `Game.populationStepEntry` defers an owner whose step starts grounded and
 * upright, and `populationStepNatively` may keep that owner's plain native
 * step instead of the population transaction's prepare → resolve → commit.
 * Its runtime checks are exact certificate admissions. What they cannot see is
 * pinned here: such a step reads no NPC rag body, asks for no placement or
 * reaction, keeps its discontinuity serial, and lands bit for bit where the
 * transaction's own resolve and commit land. That includes the steps where a
 * crash begins and the steps where a hop leaves the ground. Its neutral
 * candidate keeps the serial too, so Game decides an epoch's respawn from the
 * owners it already prepared and prepares a far deferred owner only when one
 * is respawning (PERF-R2-1, 2026-10-04). A change that breaks this must also
 * change Game's gate.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { POPULATION_OCCUPANT } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { createLevel } from '../level/levels.ts';
import type { Hazard, LevelPlan } from '../level/plan.ts';
import { EucController, createPose, type EucDynamicWorld, type EucPose, type EucTuning } from './EucController.ts';
import { HazardField } from './hazards.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { SoftBodyField } from './softBodies.ts';

const STEP = 1 / 120;
type PortCall = 'ragObstacleBodies' | 'canPlace' | 'canReact' | 'didPlace';
const FAR_BODY = { x: 1e6, z: 1e6, headingY: 0, minY: 0, maxY: 1, halfWidthMetres: 1, halfLengthMetres: 1, velocityX: 0, velocityZ: 0 };

interface Tally {
  /** Port calls made while a grounded, upright start was stepping. Must stay empty. */
  readonly violations: string[];
  /** The same calls on every other step: the positive control that the port is live. */
  readonly elsewhere: Record<PortCall, number>;
  readonly onsets: Set<string>;
  groundedSteps: number;
  takeoffs: number;
}

function samePose(a: EucPose, b: EucPose): boolean {
  for (const key of Object.keys(b) as (keyof EucPose)[]) {
    if (key === 'ragdoll') {
      if (a.ragdoll.length !== b.ragdoll.length || a.ragdoll.some((value, index) => !Object.is(value, b.ragdoll[index]))) return false;
    } else if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Ride `live` natively through its own port. Before every grounded, upright
 * start, a twin copies live's exact state and takes the same step the way the
 * transaction does: prepare, then resolve with the transaction's world (no
 * motion resolver, placement allowed), then commit and publish.
 */
function ride(world: { plan: LevelPlan; hazards?: readonly Hazard[]; tuning?: Partial<EucTuning> }, steps: number,
  script: (step: number, rider: EucController) => Partial<ActionSnapshot>): Tally {
  const tally: Tally = { violations: [], elsewhere: { ragObstacleBodies: 0, canPlace: 0, canReact: 0, didPlace: 0 },
    onsets: new Set(), groundedSteps: 0, takeoffs: 0 };
  let armed = false, step = 0;
  const call = (name: PortCall) => { if (armed) tally.violations.push(`${name} at step ${step}`); else tally.elsewhere[name] += 1; };
  const port: EucDynamicWorld = {
    hull: POPULATION_OCCUPANT,
    ragObstacleBodies: () => { call('ragObstacleBodies'); return [FAR_BODY]; },
    resolveMotion: () => null,
    canPlace: () => { call('canPlace'); return true; },
    canReact: () => { call('canReact'); return true; },
    didPlace: () => { call('didPlace'); },
  };
  const transactionWorld: EucDynamicWorld = { ...port, resolveMotion: () => null, canPlace: () => true };
  const sampler = new PlanTerrainSampler(world.plan);
  const options = () => ({ spawn: world.plan.spawn, tuning: world.tuning, dynamicWorld: port,
    hazards: new HazardField(world.hazards ?? world.plan.hazards ?? []), softBodies: new SoftBodyField(world.plan.softBodies ?? []) });
  const live = new EucController(sampler, options()), twin = new EucController(sampler, options());
  const native = createPose(), transacted = createPose();
  for (step = 0; step < steps; step += 1) {
    const actions: ActionSnapshot = { ...NEUTRAL_ACTIONS, ...script(step, live) };
    if (live.crashed || !live.isGrounded) { live.step(STEP, actions); continue; }
    twin.copyMutableStateFrom(live);
    const serial = live.discontinuitySerial;
    armed = true;
    try {
      live.step(STEP, actions);
      const token = twin.prepareStep(STEP, actions);
      assert.equal(token.discontinuitySerial, serial, `a grounded start's neutral candidate placed itself at step ${step}`);
      twin.resolvePreparedStep(token, transactionWorld);
      twin.commitPreparedStep(token, false);
      twin.publishPreparedPlacements(token);
    } finally { armed = false; }
    tally.groundedSteps += 1;
    assert.equal(live.discontinuitySerial, serial, `a grounded start placed itself at step ${step}`);
    live.writePose(native); twin.writePose(transacted);
    assert.ok(samePose(native, transacted), `native and transaction poses differ at step ${step}`);
    assert.deepStrictEqual(live.snapshot(), twin.snapshot(), `native and transaction state differ at step ${step}`);
    if (live.crashed) tally.onsets.add(live.snapshot().crashCause);
    else if (!live.isGrounded) tally.takeoffs += 1;
  }
  assert.deepEqual(tally.violations, []);
  return tally;
}

function straight(id: string, length: number, options: { blocks?: object[]; hazards?: object[]; surround?: string } = {}): LevelPlan {
  return buildLevelPlan(
    [{ id: 'run', length, halfWidth: 12, surface: 'pavement', shoulder: 1, ...(options.blocks ? { blocks: options.blocks } : {}) }] as never,
    { id, spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, surround: { height: 0, surface: options.surround ?? 'pavement' },
      spacing: 4, ...(options.hazards ? { hazards: options.hazards } : {}) } as never,
  );
}
/** Full throttle until the crash, then hands off: the auto recovery places the rider again. */
const flatOut = (_step: number, rider: EucController) => ({ throttle: rider.crashed ? 0 : 1 });

test('a grounded start that crashes is still exactly the transaction step', () => {
  const wall = ride({ plan: straight('premise-wall', 80, { blocks: [{ s: 40, t: 0, halfAlong: 0.5, halfLateral: 300, height: 1.4, surface: 'pavement' }] }),
    tuning: { cutoutEnabled: 0 } }, 1100, flatOut);
  const hole = ride({ plan: straight('premise-hole', 200, { surround: 'grass' }),
    hazards: [{ id: 'hole', kind: 'potholeDeep', centre: { x: 0, y: 0, z: 40 }, radius: 1 }] }, 900, flatOut);
  const cutout = ride({ plan: straight('premise-cutout', 400), tuning: { cutoutEnabled: 1 } }, 1400, flatOut);
  const spill = ride({ plan: straight('premise-spill', 300, { surround: 'grass',
    hazards: [{ id: 'puddle', segment: 'run', s: 60, t: 0, kind: 'spill', radius: 20 }] }), tuning: { wobbleMasterGain: 1, cutoutEnabled: 0 } }, 1400, flatOut);
  assert.deepEqual([...wall.onsets], ['obstacle']);
  assert.deepEqual([...hole.onsets], ['hazard']);
  assert.deepEqual([...cutout.onsets], ['cutout']);
  assert.deepEqual([...spill.onsets], ['wobble']);
  for (const tally of [wall, hole, cutout, spill]) {
    // The crash steps read NPC rag bodies and the recovery places the rider:
    // the port is live, it is only never asked from a grounded upright start.
    assert.ok(tally.elsewhere.ragObstacleBodies > 0 && tally.elsewhere.didPlace > 0, JSON.stringify(tally.elsewhere));
    assert.ok(tally.groundedSteps > 400);
  }
});

test('hops, carves and reverses on authored and generated worlds stay exactly the transaction step', () => {
  const script = (step: number) => {
    const phase = step % 900;
    return { throttle: phase < 420 ? 1 : phase < 480 ? -1 : phase < 600 ? -0.8 : 0.6,
      steer: Math.sin(step / 37) * (phase > 600 ? 1 : 0.35), hop: step % 293 === 150, hopHeld: step % 293 >= 150 && step % 293 < 170,
      crouch: step % 211 < 15 };
  };
  const generated = generateLevel('euc').plan;
  for (const plan of [createLevel('slice', ''), generated]) {
    const tally = ride({ plan }, 2400, script);
    assert.ok(tally.takeoffs > 5, `only ${tally.takeoffs} hop launches were covered`);
    assert.ok(tally.groundedSteps > 1200, `only ${tally.groundedSteps} grounded starts`);
    assert.ok(tally.elsewhere.ragObstacleBodies > 0, 'airborne steps read NPC rag bodies through the same port');
  }
});
