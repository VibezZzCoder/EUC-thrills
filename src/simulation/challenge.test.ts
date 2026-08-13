/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHALLENGE } from '../data/tuning.ts';
import type { BoxCollider, Checkpoint, CheckpointKind, LevelPlan } from '../level/plan.ts';
import {
  ChallengeRun,
  insideCheckpoint,
  type ChallengeEvent,
  type ChallengeStepInput,
} from './challenge.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { createGroundSample } from './world.ts';

/**
 * The rules of a timed run, tested headlessly.
 *
 * Three things here are worth more than the rest, and they are the three that
 * would otherwise only be caught by a human noticing something odd during a
 * lap:
 *
 *   1. **The yaw convention.** A gate rotated ninety degrees still detects
 *      crossings — of a course at right angles to the real one — and a test
 *      written from the same mistaken convention agrees with the mistake
 *      (AGENTS.md says this in full about the world axes). So the convention is
 *      not asserted against intuition below; it is asserted against
 *      `PlanTerrainSampler`, which is the codebase's existing owner of
 *      "is this point in that yawed box", by sweeping a grid and demanding the
 *      two agree on every sample.
 *   2. **Tunnelling.** Detection is a point test once per fixed step, so the
 *      gate's thickness is the only thing standing between a fast rider and a
 *      checkpoint the game never saw. The walk-across tests pin that margin at
 *      one step's travel at top speed and at four times it.
 *   3. **Determinism.** Identical inputs, identical run — the property the QA
 *      bridge's `advance(n)` depends on.
 */

/** The simulation's fixed step. Everything below is driven at it. */
const STEP = 1 / 120;

/** Top speed is 15 m/s, so this is the furthest the wheel moves in one step. */
const TOP_SPEED_STEP_METRES = 15 * STEP;

function closeTo(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

/**
 * A gate across a straight course running along +Z.
 *
 * The half-extents are the real ones from the tuning table, and the centre is
 * one half-height above a ground plane at y = 0, exactly as `buildPlan.ts` will
 * place them — so a contact patch at y = 0 sits on the box's bottom face, which
 * is the case that actually happens on every crossing.
 */
function gateAt(z: number, routeIndex: number, kind: CheckpointKind, label: string): Checkpoint {
  return {
    id: `cp-${routeIndex}`,
    centre: { x: 0, y: CHALLENGE.gateHalfHeight, z },
    halfExtents: {
      x: 6,
      y: CHALLENGE.gateHalfHeight,
      z: CHALLENGE.gateHalfDepth,
    },
    headingY: 0,
    routeIndex,
    kind,
    label,
  };
}

/** Four gates at z = 0, 40, 80, 200. */
function route(): Checkpoint[] {
  return [
    gateAt(0, 0, 'start', 'Start'),
    gateAt(40, 1, 'split', 'Curb run'),
    gateAt(80, 2, 'split', 'Park gate'),
    gateAt(200, 3, 'finish', 'Finish'),
  ];
}

function at(z: number, extra: Partial<ChallengeStepInput> = {}): ChallengeStepInput {
  return {
    x: 0,
    y: 0,
    z,
    speed: 10,
    landed: false,
    landingClean: false,
    crashed: false,
    ...extra,
  };
}

/**
 * Sit at one place for a number of steps, collecting whatever it produced.
 *
 * Standing still between gates is legitimate here rather than a shortcut: the
 * detector is a point test with no notion of velocity, so holding a position is
 * the exact way to advance the clock by a known amount without also moving
 * through geometry the test is not talking about. The tests that *are* about
 * motion walk the point across the gate instead.
 */
function hold(run: ChallengeRun, z: number, steps: number, extra?: Partial<ChallengeStepInput>): ChallengeEvent[] {
  const events: ChallengeEvent[] = [];
  for (let i = 0; i < steps; i += 1) {
    for (const event of run.step(STEP, at(z, extra))) events.push(event);
  }
  return events;
}

/** Arm a run and roll through the start gate. Returns the run, clock at zero. */
function started(checkpoints: Checkpoint[] = route()): ChallengeRun {
  const run = new ChallengeRun('slice', checkpoints);
  run.arm();
  hold(run, 0, 1);
  assert.equal(run.state.phase, 'running');
  return run;
}

/**
 * A run of the course above with known leg times: 1 s, 2 s, then 3 s.
 *
 * The clock advances *before* detection, so a leg of exactly N steps is N-1
 * steps of waiting plus the step that lands inside the gate.
 */
function completeRun(run: ChallengeRun): ChallengeEvent[] {
  const events: ChallengeEvent[] = [];
  const push = (from: ChallengeEvent[]): void => {
    for (const event of from) events.push(event);
  };
  push(hold(run, 20, 119));
  push(hold(run, 40, 1));
  push(hold(run, 60, 239));
  push(hold(run, 80, 1));
  push(hold(run, 120, 359));
  push(hold(run, 200, 1));
  return events;
}

// -- insideCheckpoint ---------------------------------------------------------

test('insideCheckpoint bounds an axis-aligned gate on all three axes', () => {
  const cp = gateAt(0, 0, 'start', 'Start');

  assert.equal(insideCheckpoint(cp, 0, 0, 0), true);
  // On a face is inside, matching the sampler's own inclusive comparison.
  assert.equal(insideCheckpoint(cp, 6, 0, 0), true);
  assert.equal(insideCheckpoint(cp, -6, 0, CHALLENGE.gateHalfDepth), true);
  assert.equal(insideCheckpoint(cp, 0, 2 * CHALLENGE.gateHalfHeight, 0), true);

  assert.equal(insideCheckpoint(cp, 6.01, 0, 0), false);
  assert.equal(insideCheckpoint(cp, 0, 0, CHALLENGE.gateHalfDepth + 0.01), false);
  // Below the ground plane and above the top of the arch.
  assert.equal(insideCheckpoint(cp, 0, -0.01, 0), false);
  assert.equal(insideCheckpoint(cp, 0, 2 * CHALLENGE.gateHalfHeight + 0.01, 0), false);
});

test('a gate yawed a quarter turn is wide across the route, not along it', () => {
  // A quarter turn left. The world convention (+X is the rider's LEFT, positive
  // yaw turns left) puts this gate's *forward* axis — the thin one — along
  // world +X, and its *width* along world Z. Getting the sign of the yaw
  // backwards swaps those two, which is precisely the ninety-degree error this
  // test exists to catch: the width is 6 m and the half-depth is 1.8 m, so no
  // point below is ambiguous between the two readings.
  const cp: Checkpoint = { ...gateAt(0, 0, 'split', 'Turn'), headingY: Math.PI / 2 };

  assert.equal(insideCheckpoint(cp, 0, 0, 5), true);
  assert.equal(insideCheckpoint(cp, 0, 0, -5), true);
  assert.equal(insideCheckpoint(cp, 0, 0, 6.5), false);

  assert.equal(insideCheckpoint(cp, 1, 0, 0), true);
  assert.equal(insideCheckpoint(cp, 3, 0, 0), false);
  assert.equal(insideCheckpoint(cp, -3, 0, 0), false);
});

test('a gate at an arbitrary yaw is thin along its own heading', () => {
  // A quarter turn is symmetric enough that a transposed transform still passes
  // it. This one is not: at 0.6 rad the forward axis is (sin h, cos h) and the
  // left axis is (cos h, -sin h), and swapping the sine's sign moves both.
  const heading = 0.6;
  const cp: Checkpoint = { ...gateAt(0, 0, 'split', 'Carve'), headingY: heading };
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const leftX = Math.cos(heading);
  const leftZ = -Math.sin(heading);

  // Three metres along the direction of travel is outside a 1.8 m half-depth.
  assert.equal(insideCheckpoint(cp, 3 * forwardX, 0, 3 * forwardZ), false);
  assert.equal(insideCheckpoint(cp, -3 * forwardX, 0, -3 * forwardZ), false);
  // Three metres across it is well inside a 6 m half-width.
  assert.equal(insideCheckpoint(cp, 3 * leftX, 0, 3 * leftZ), true);
  assert.equal(insideCheckpoint(cp, -3 * leftX, 0, -3 * leftZ), true);
});

test('insideCheckpoint agrees with PlanTerrainSampler on the same yawed box', () => {
  // **The convention test.** `simulation/planSampler.ts` is the codebase's
  // existing owner of "is this point inside that yaw-aligned box", and
  // `plan.ts` promises a checkpoint's box is oriented exactly as a
  // `BoxCollider` is. Asserting that against a hand-computed expectation would
  // only prove this file agrees with whoever wrote the expectation; asserting
  // it against the sampler proves the two agree with *each other*, which is the
  // property that actually matters.
  const heading = 0.9;
  const centre = { x: 3, y: 0.5, z: -2 };
  const halfExtents = { x: 5, y: 0.5, z: 1.8 };
  const box: BoxCollider = {
    centre,
    halfExtents,
    rotationY: heading,
    surface: 'pavement',
  };
  const cp: Checkpoint = {
    id: 'convention',
    centre,
    halfExtents,
    headingY: heading,
    routeIndex: 0,
    kind: 'split',
    label: 'Convention',
  };
  const plan: LevelPlan = {
    id: 'fixture',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    heightfield: {
      originX: -1,
      originZ: -1,
      spacing: 1,
      columns: 2,
      rows: 2,
      heights: [0, 0, 0, 0],
      surfaces: ['pavement'],
    },
    segments: [],
    checkpoints: [],
    solids: [box],
  };
  const sampler = new PlanTerrainSampler(plan);
  const ground = createGroundSample();

  // An irrational-ish stride, so the sweep never lands exactly on a face where
  // the two implementations could legitimately disagree by one float ulp.
  let inside = 0;
  for (let x = -9.03; x <= 15; x += 0.19) {
    for (let z = -14.07; z <= 10; z += 0.19) {
      sampler.sampleGround(x, z, ground);
      // The box's top face is at 1.0 and the ground plane is at 0, so a raised
      // sample is exactly a sample inside the box's footprint.
      const samplerSaysInside = ground.height > 0.5;
      const weSayInside = insideCheckpoint(cp, x, centre.y, z);
      assert.equal(
        weSayInside,
        samplerSaysInside,
        `disagreement at (${x.toFixed(3)}, ${z.toFixed(3)})`,
      );
      if (weSayInside) inside += 1;
    }
  }
  // A sweep on which nothing was ever inside would agree perfectly and prove
  // nothing at all.
  assert.ok(inside > 100, `expected the sweep to enter the box, got ${inside} samples`);
});

// -- availability -------------------------------------------------------------

test('a route is timeable only when it starts with a start and ends with a finish', () => {
  const full = route();
  assert.equal(new ChallengeRun('slice', full).available, true);
  assert.equal(new ChallengeRun('proving', []).available, false);
  assert.equal(
    new ChallengeRun('slice', [gateAt(0, 0, 'start', 'Start')]).available,
    false,
  );
  assert.equal(
    new ChallengeRun('slice', [gateAt(0, 0, 'start', 'Start'), gateAt(9, 1, 'split', 'Mid')])
      .available,
    false,
  );
  assert.equal(
    new ChallengeRun('slice', [gateAt(0, 0, 'split', 'Mid'), gateAt(9, 1, 'finish', 'Finish')])
      .available,
    false,
  );
});

test('an unavailable route cannot be armed', () => {
  const run = new ChallengeRun('proving', []);
  run.arm();
  assert.equal(run.state.phase, 'idle');
  assert.equal(run.state.nextIndex, -1);
  assert.equal(run.step(STEP, at(0)).length, 0);
  assert.equal(run.result(), null);
});

test('checkpoints handed over out of order are sequenced by routeIndex', () => {
  const shuffled = [route()[2], route()[0], route()[3], route()[1]];
  const run = new ChallengeRun('slice', shuffled);
  assert.equal(run.available, true);
  run.arm();
  assert.equal(run.state.nextLabel, 'Start');
  hold(run, 0, 1);
  assert.equal(run.state.nextLabel, 'Curb run');
  hold(run, 40, 1);
  assert.equal(run.state.nextLabel, 'Park gate');
});

// -- the clock ----------------------------------------------------------------

test('the clock does not start until the start gate is crossed', () => {
  const run = new ChallengeRun('slice', route());
  run.arm();
  assert.equal(run.state.phase, 'armed');
  assert.equal(run.state.nextIndex, 0);
  assert.equal(run.state.nextLabel, 'Start');
  assert.equal(run.state.total, 4);

  const nothing = hold(run, -30, 600);
  assert.equal(nothing.length, 0);
  assert.equal(run.state.elapsed, 0);
  assert.equal(run.state.phase, 'armed');

  const [event] = hold(run, 0, 1);
  assert.equal(event.kind, 'start');
  assert.equal(event.checkpointId, 'cp-0');
  assert.equal(event.routeIndex, 0);
  assert.equal(event.elapsed, 0);
  assert.equal(event.legSeconds, 0);
  assert.equal(event.legDelta, null);
  assert.equal(event.totalDelta, null);
  assert.equal(run.state.phase, 'running');
  assert.equal(run.state.elapsed, 0);
  assert.equal(run.state.passed, 1);
  assert.equal(run.state.nextLabel, 'Curb run');
});

test('the step that crosses the start gate is not itself timed', () => {
  const run = started();
  assert.equal(run.state.elapsed, 0);
  hold(run, 10, 1);
  closeTo(run.state.elapsed, STEP);
});

test('splits and legs are index-aligned with the route, start included', () => {
  const run = started();
  const events = completeRun(run);

  assert.deepEqual(events.map((event) => event.label), ['Curb run', 'Park gate', 'Finish']);
  const state = run.state;
  assert.equal(state.phase, 'finished');
  assert.equal(state.passed, 4);
  assert.equal(state.nextIndex, -1);
  assert.equal(state.nextLabel, '');
  assert.equal(state.splits.length, 4);
  assert.equal(state.splits[0], 0);
  assert.equal(state.legs[0], 0);
  closeTo(state.splits[1], 1);
  closeTo(state.splits[2], 3);
  closeTo(state.splits[3], 6);
  closeTo(state.legs[1], 1);
  closeTo(state.legs[2], 2);
  closeTo(state.legs[3], 3);

  const result = run.result();
  assert.ok(result);
  assert.equal(result.levelId, 'slice');
  closeTo(result.totalSeconds, 6);
  assert.deepEqual(result.labels, ['Start', 'Curb run', 'Park gate', 'Finish']);
  // The legs must account for the whole run, or a split table is decoration.
  closeTo(result.legs.reduce((sum, leg) => sum + leg, 0), result.totalSeconds);
});

test('result is null until the finish gate is crossed', () => {
  const run = new ChallengeRun('slice', route());
  assert.equal(run.result(), null);
  run.arm();
  assert.equal(run.result(), null);
  hold(run, 0, 1);
  hold(run, 40, 1);
  assert.equal(run.result(), null);
  completeRunAfterFirstSplit(run);
  assert.ok(run.result());
});

/** Finish a run that has already taken its first split. */
function completeRunAfterFirstSplit(run: ChallengeRun): void {
  hold(run, 80, 1);
  hold(run, 200, 1);
}

// -- out of order -------------------------------------------------------------

test('an out-of-order crossing is ignored silently', () => {
  const run = started();
  // Straight to the finish gate, which is what cutting the course looks like.
  const events = hold(run, 200, 60);
  assert.equal(events.length, 0);
  assert.equal(run.state.passed, 1);
  assert.equal(run.state.nextIndex, 1);
  assert.equal(run.result(), null);

  // And the run is not damaged by the attempt: the real route still completes.
  hold(run, 40, 1);
  hold(run, 80, 1);
  hold(run, 200, 1);
  assert.equal(run.state.phase, 'finished');
  assert.equal(run.state.passed, 4);
});

test('a gate already passed does not fire again', () => {
  const run = started();
  hold(run, 40, 1);
  const again = hold(run, 40, 30);
  assert.equal(again.length, 0);
  assert.equal(run.state.passed, 2);
});

test('nothing is recorded after the finish', () => {
  const run = started();
  completeRun(run);
  const before = run.state.elapsed;
  const events = hold(run, 200, 240, { speed: 40, crashed: true, landed: true, landingClean: false });
  assert.equal(events.length, 0);
  assert.equal(run.state.elapsed, before);
  const result = run.result();
  assert.ok(result);
  assert.equal(result.crashes, 0);
  assert.equal(result.landings, 0);
  assert.ok(result.topSpeed < 40);
});

// -- tunnelling ---------------------------------------------------------------

/**
 * Walk a point across the second gate at a fixed distance per step.
 *
 * Returns the events. The walk starts well before the gate and ends well after
 * it, so a miss is a miss rather than a walk that stopped short.
 */
function walkThroughSplit(metresPerStep: number): ChallengeEvent[] {
  const run = started();
  const events: ChallengeEvent[] = [];
  for (let z = 30; z <= 50; z += metresPerStep) {
    for (const event of run.step(STEP, at(z, { speed: metresPerStep / STEP }))) {
      events.push(event);
    }
  }
  return events;
}

test('a crossing at top speed is detected — one step is 0.125 m', () => {
  closeTo(TOP_SPEED_STEP_METRES, 0.125);
  const events = walkThroughSplit(TOP_SPEED_STEP_METRES);
  assert.equal(events.length, 1);
  assert.equal(events[0].checkpointId, 'cp-1');
  assert.equal(events[0].kind, 'split');
});

test('a crossing at four times top speed is still detected', () => {
  // The margin `CHALLENGE.gateHalfDepth` claims: 3.6 m of thickness against
  // 0.5 m of travel per step. If a future wheel, a slower step, or a thinner
  // gate ever eats that margin, this test is the thing that says so — the
  // failure it guards against is a checkpoint the player rode through and the
  // game did not see, which is invisible from the inside and reads to the
  // player as the run being broken.
  const events = walkThroughSplit(4 * TOP_SPEED_STEP_METRES);
  assert.equal(events.length, 1);
  assert.equal(events[0].checkpointId, 'cp-1');
});

test('a step longer than the gate is thick misses it, and the run visibly stalls', () => {
  // Documenting the failure mode rather than endorsing it: at 12 m per step —
  // ninety-six times top speed, and impossible for the wheel — the point jumps
  // clean over a 3.6 m thick gate. What matters is *how* it fails. There is no
  // event, no split is written, and the objective keeps naming the checkpoint
  // that was never crossed, so the run simply cannot be finished. It never
  // records a wrong time and it never skips a gate quietly.
  const events = walkThroughSplit(12);
  assert.equal(events.length, 0);
});

test('a crossing of a yawed gate is detected at top speed', () => {
  // The tunnelling margin has to survive the transform, and a gate on a corner
  // is the normal case rather than the exotic one.
  const heading = 0.9;
  const gate: Checkpoint = { ...gateAt(0, 1, 'finish', 'Finish'), headingY: heading };
  const run = new ChallengeRun('slice', [gateAt(-100, 0, 'start', 'Start'), gate]);
  run.arm();
  hold(run, -100, 1);

  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const events: ChallengeEvent[] = [];
  for (let travel = -8; travel <= 8; travel += TOP_SPEED_STEP_METRES) {
    const input = at(0);
    for (const event of run.step(STEP, { ...input, x: travel * forwardX, z: travel * forwardZ })) {
      events.push(event);
    }
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'finish');
});

// -- comparison against a record ----------------------------------------------

test('deltas are measured against the reference leg by leg', () => {
  const run = started();
  run.setReference({ totalSeconds: 5.5, splits: [0, 1.2, 3, 5.5] });
  const events = completeRun(run);

  closeTo(events[0].totalDelta as number, -0.2);
  closeTo(events[0].legDelta as number, -0.2);
  closeTo(events[1].totalDelta as number, 0);
  closeTo(events[1].legDelta as number, 0.2);
  closeTo(events[2].totalDelta as number, 0.5);
  closeTo(events[2].legDelta as number, 0.5);
  closeTo(run.state.deltaToRecord as number, 0.5);

  const result = run.result();
  assert.ok(result);
  assert.equal(result.previousBest, 5.5);
  assert.equal(result.beatRecord, false);
});

test('the start line reports no delta even with a record loaded', () => {
  const run = new ChallengeRun('slice', route());
  run.setReference({ totalSeconds: 5.5, splits: [0, 1.2, 3, 5.5] });
  run.arm();
  const [event] = hold(run, 0, 1);
  assert.equal(event.totalDelta, null);
  assert.equal(event.legDelta, null);
  assert.equal(run.state.deltaToRecord, null);
});

test('a reference whose splits do not match the route keeps its total and drops its deltas', () => {
  // A record set before a gate moved. The lap time is still a lap of this
  // level; the split table describes somewhere else.
  const run = started();
  run.setReference({ totalSeconds: 5.5, splits: [0, 2, 5.5] });
  const events = completeRun(run);
  for (const event of events) {
    assert.equal(event.legDelta, null);
    assert.equal(event.totalDelta, null);
  }
  assert.equal(run.state.deltaToRecord, null);
  const result = run.result();
  assert.ok(result);
  assert.equal(result.previousBest, 5.5);
  assert.equal(result.beatRecord, false);
});

test('a corrupt reference is treated as no reference at all', () => {
  const run = started();
  run.setReference({ totalSeconds: Number.NaN, splits: [0, 1, 2, 3] });
  const events = completeRun(run);
  assert.equal(events[0].totalDelta, null);
  const result = run.result();
  assert.ok(result);
  assert.equal(result.previousBest, null);
  assert.equal(result.beatRecord, true);

  const second = started();
  second.setReference({ totalSeconds: 5, splits: [0, 1, Number.POSITIVE_INFINITY, 5] });
  completeRun(second);
  assert.equal(second.state.deltaToRecord, null);
});

test('clearing the reference mid-run stops the deltas', () => {
  const run = started();
  run.setReference({ totalSeconds: 5.5, splits: [0, 1.2, 3, 5.5] });
  hold(run, 20, 119);
  hold(run, 40, 1);
  assert.notEqual(run.state.deltaToRecord, null);

  run.setReference(null);
  assert.equal(run.state.deltaToRecord, null);
  const [second] = hold(run, 80, 1);
  assert.equal(second.totalDelta, null);
  const result = (hold(run, 200, 1), run.result());
  assert.ok(result);
  assert.equal(result.previousBest, null);
});

test('a tie is not a record, and neither is a hundredth under the epsilon', () => {
  const reference = run6Seconds();

  const tie = started();
  tie.setReference(reference);
  completeRun(tie);
  assert.equal((tie.result() as { beatRecord: boolean }).beatRecord, false);

  const marginal = started();
  marginal.setReference({
    totalSeconds: reference.totalSeconds + CHALLENGE.recordEpsilonSeconds / 2,
    splits: reference.splits,
  });
  completeRun(marginal);
  assert.equal((marginal.result() as { beatRecord: boolean }).beatRecord, false);

  const clear = started();
  clear.setReference({
    totalSeconds: reference.totalSeconds + 2 * CHALLENGE.recordEpsilonSeconds,
    splits: reference.splits,
  });
  completeRun(clear);
  assert.equal((clear.result() as { beatRecord: boolean }).beatRecord, true);
});

test('an improvement of exactly the epsilon is not a record', () => {
  // **The one input the two layers originally disagreed about.** This file
  // used `>=` and `app/records.ts:isNewRecord` used `>`, so a run that beat
  // the best by precisely 0.01 s was celebrated here and refused there: the
  // results screen would have said "New record" over a time that was never
  // saved, and the player would have found the old best waiting for them next
  // session with nothing to explain it.
  //
  // The matching assertion from the store's side is in `app/records.test.ts`,
  // which can import both modules; this one cannot, because
  // `src/architecture.test.ts` seals `simulation/` off from `app/` and it
  // scans test files too.
  const reference = run6Seconds();
  const exactly = started();
  exactly.setReference({
    totalSeconds: reference.totalSeconds + CHALLENGE.recordEpsilonSeconds,
    splits: reference.splits,
  });
  completeRun(exactly);
  assert.equal(
    (exactly.result() as { beatRecord: boolean }).beatRecord,
    false,
    'exactly the epsilon must not be a record, because the store will not keep it',
  );
});

test('the first run of a level is always a record', () => {
  const run = started();
  completeRun(run);
  const result = run.result();
  assert.ok(result);
  assert.equal(result.previousBest, null);
  assert.equal(result.beatRecord, true);
});

/**
 * A reference taken from an actual run of the fixture course.
 *
 * Derived rather than written down: the accumulated clock is a sum of 1/120s
 * and is not exactly 6, and a hand-written 6 would turn the epsilon tests into
 * tests of floating-point addition.
 */
function run6Seconds(): { totalSeconds: number; splits: readonly number[] } {
  const run = started();
  completeRun(run);
  const result = run.result();
  assert.ok(result);
  return { totalSeconds: result.totalSeconds, splits: result.splits };
}

// -- the statistics nobody is scored on ---------------------------------------

test('a crash is counted once per crash, not once per step', () => {
  const run = started();
  hold(run, 20, 40, { crashed: true });
  hold(run, 20, 40, { crashed: false });
  hold(run, 20, 40, { crashed: true });
  hold(run, 20, 39, { crashed: true });
  hold(run, 40, 1);
  hold(run, 80, 1);
  hold(run, 200, 1);
  const result = run.result();
  assert.ok(result);
  assert.equal(result.crashes, 2);
});

test('a rider already down when the clock starts is not counted as crashing', () => {
  // The edge is taken from the step the run began on, so a rider who somehow
  // crosses the line mid-recovery does not start the lap one crash down.
  const run = new ChallengeRun('slice', route());
  run.arm();
  hold(run, 0, 1, { crashed: true });
  hold(run, 20, 10, { crashed: true });
  hold(run, 40, 1);
  hold(run, 80, 1);
  hold(run, 200, 1);
  const result = run.result();
  assert.ok(result);
  assert.equal(result.crashes, 0);
});

test('clean landings are counted from the controller\'s own verdict', () => {
  // **This file no longer owns a threshold, and that is the point.** It used
  // to apply `score >= 0.75`, on a scale that actually runs 0 to about 3 with
  // *lower* meaning better — so every crash landing counted as clean. The
  // caller now passes `EucController`'s verdict through, which is the only
  // place that decides what a clean landing is, so there is no second opinion
  // left to be wrong.
  const run = started();
  hold(run, 20, 1, { landed: true, landingClean: true });
  hold(run, 20, 1, { landed: true, landingClean: true });
  hold(run, 20, 1, { landed: true, landingClean: false });
  hold(run, 20, 1, { landed: true, landingClean: false });
  // A verdict arriving without a landing is not a landing.
  hold(run, 20, 5, { landed: false, landingClean: true });
  hold(run, 40, 1);
  hold(run, 80, 1);
  hold(run, 200, 1);
  const result = run.result();
  assert.ok(result);
  assert.equal(result.landings, 4);
  assert.equal(result.cleanLandings, 2);
});

test('top speed is the largest magnitude, so reversing counts', () => {
  const run = started();
  hold(run, 20, 3, { speed: 5 });
  hold(run, 20, 3, { speed: -12.5 });
  hold(run, 20, 3, { speed: 8 });
  hold(run, 40, 1, { speed: 1 });
  hold(run, 80, 1, { speed: 1 });
  hold(run, 200, 1, { speed: 1 });
  const result = run.result();
  assert.ok(result);
  assert.equal(result.topSpeed, 12.5);
});

// -- lifecycle ----------------------------------------------------------------

test('restart zeroes the clock and keeps the record to chase', () => {
  const run = started();
  run.setReference({ totalSeconds: 5.5, splits: [0, 1.2, 3, 5.5] });
  hold(run, 20, 119);
  hold(run, 40, 1, { landed: true, landingClean: false });
  hold(run, 20, 60, { crashed: true, speed: 30 });

  run.restart();
  const state = run.state;
  assert.equal(state.phase, 'armed');
  assert.equal(state.elapsed, 0);
  assert.equal(state.passed, 0);
  assert.equal(state.splits.length, 0);
  assert.equal(state.legs.length, 0);
  assert.equal(state.nextIndex, 0);
  assert.equal(state.deltaToRecord, null);
  assert.equal(run.result(), null);

  hold(run, 0, 1);
  completeRun(run);
  const result = run.result();
  assert.ok(result);
  // Nothing survived the restart except the thing being chased.
  assert.equal(result.previousBest, 5.5);
  assert.equal(result.crashes, 0);
  assert.equal(result.landings, 0);
  closeTo(result.totalSeconds, 6);
});

test('restart from finished is the retry button', () => {
  const run = started();
  completeRun(run);
  run.restart();
  assert.equal(run.state.phase, 'armed');
  assert.equal(run.result(), null);
});

test('restart outside a challenge does nothing', () => {
  // The same `R` a free-ride player presses. It must not arm a run.
  const run = new ChallengeRun('slice', route());
  run.restart();
  assert.equal(run.state.phase, 'idle');
});

test('abandon returns the run to idle with nothing to seek', () => {
  const run = started();
  hold(run, 20, 119);
  hold(run, 40, 1);
  run.abandon();
  const state = run.state;
  assert.equal(state.phase, 'idle');
  assert.equal(state.elapsed, 0);
  assert.equal(state.nextIndex, -1);
  assert.equal(state.nextLabel, '');
  assert.equal(state.passed, 0);
  assert.equal(run.result(), null);
  // And an idle run ignores the world entirely.
  assert.equal(hold(run, 0, 10).length, 0);
  assert.equal(run.state.phase, 'idle');
});

// -- the properties the rest of the milestone leans on ------------------------

test('a step with no crossing returns the shared frozen empty array', () => {
  const run = started();
  const first = run.step(STEP, at(20));
  const second = run.step(STEP, at(21));
  assert.equal(first, second);
  assert.equal(first.length, 0);
  assert.equal(Object.isFrozen(first), true);
});

test('identical step sequences produce identical runs', () => {
  const drive = (run: ChallengeRun): void => {
    run.setReference({ totalSeconds: 5.5, splits: [0, 1.2, 3, 5.5] });
    run.arm();
    hold(run, 0, 1);
    hold(run, 20, 60, { speed: 11.5, landed: true, landingClean: true });
    hold(run, 20, 59, { speed: -3, crashed: true });
    hold(run, 40, 1);
    completeRunAfterFirstSplit(run);
  };
  const a = new ChallengeRun('slice', route());
  const b = new ChallengeRun('slice', route());
  drive(a);
  drive(b);
  assert.deepEqual(a.result(), b.result());
  assert.deepEqual(a.state.splits, b.state.splits);
});

test('a finished result is frozen and stable across reads', () => {
  const run = started();
  completeRun(run);
  const first = run.result();
  assert.ok(first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.splits), true);
  assert.equal(run.result(), first);
});
