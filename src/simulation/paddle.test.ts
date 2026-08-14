/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PADDLE, SIMULATION, TARGET } from '../data/tuning.ts';
import { RIDEABILITY } from '../level/routeValidator.ts';
import type { Target } from '../level/plan.ts';
import { Paddle, type HittableSet, type HittableVolume, type WielderPose } from './paddle.ts';
import { TargetField } from './targets.ts';

/**
 * The swing, and the arithmetic the milestone's named unknown turned out to be.
 *
 * `docs/PLANS.md` M14 phase 1 calls hit detection at speed the one thing that
 * had to be worked out rather than estimated, and the amended plan raises the
 * stakes: at the top speed M16 shipped, the head moves further between two
 * samples than a target disc is wide. Everything below is derived from the
 * constants in `data/tuning.ts` rather than quoted from the plan, so a later
 * retune of the swing or of the wheel's top speed fails *here*, loudly, instead
 * of quietly making the approximation wrong in a way only a player would notice.
 */

const DT = 1 / SIMULATION.hz;

/** A straight ride down +Z at a constant speed. The rider's right is −X. */
function poseAt(seconds: number, speed: number): WielderPose {
  return { x: 0, y: 0, z: speed * seconds, headingY: 0 };
}

/** One target, as the plan would carry it, at a world point. */
function targetAt(id: string, x: number, y: number, z: number, radius: number = TARGET.discRadius): Target {
  return {
    id,
    centre: { x, y, z },
    radius,
    base: { x, y: 0, z },
  };
}

interface Run {
  readonly hits: readonly { id: string; t: number; step: number }[];
  /** What each step returned, so the per-step ordering can be checked. */
  readonly perStep: readonly (readonly { id: string; t: number }[])[];
  /** Head position at the end of every step, for the whole cycle. */
  readonly path: readonly { x: number; y: number; z: number; phase: string }[];
}

/**
 * Throw one swing at a set, from a standing start of the state machine.
 *
 * The request is made on the first step and never again, so what is measured is
 * one cycle rather than a mash.
 *
 * **The rig knocks each hit down, because the paddle deliberately does not.**
 * `Paddle.step` reports what the sweep reached and nothing else — scoring,
 * sound and the knock-down all belong to the mode, which is what lets the same
 * paddle be handed a set of riders later. A rig that never struck anything
 * would therefore see the same standing target reported on every step it stayed
 * in reach, which is the set behaving correctly and the test measuring nothing.
 */
function swingOnce(field: HittableSet | null, speed: number, steps = 120): Run {
  const paddle = new Paddle();
  const hits: { id: string; t: number; step: number }[] = [];
  const perStep: { id: string; t: number }[][] = [];
  const path: { x: number; y: number; z: number; phase: string }[] = [];
  for (let step = 0; step < steps; step += 1) {
    const seconds = step * DT;
    const struck = paddle.step(DT, poseAt(seconds, speed), step === 0, field);
    perStep.push(struck.map((hit) => ({ id: hit.id, t: hit.t })));
    for (const hit of struck) {
      hits.push({ id: hit.id, t: hit.t, step });
      if (field instanceof TargetField) field.strike(hit.id);
    }
    const head = paddle.headPosition;
    path.push({ x: head.x, y: head.y, z: head.z, phase: paddle.phase });
  }
  return { hits, perStep, path };
}

// ---------------------------------------------------------------------------
// The derived bounds — these are the paragraphs the plan asked to become tests
// ---------------------------------------------------------------------------

test('the teleport guard clears the longest step a real swing can take', () => {
  const paddle = new Paddle();
  const legitimate = paddle.legitimateStepSweep(RIDEABILITY.topSpeed);

  // Read off the current constants, never quoted: M16 halved the drag and
  // moved top speed by half, and the plan's own printed numbers went stale the
  // same day. `RIDEABILITY.topSpeed` is the symbol every placement contract in
  // the project already names for exactly this reason.
  assert.ok(
    RIDEABILITY.topSpeed > 20 && RIDEABILITY.topSpeed < 25,
    `top speed is ${RIDEABILITY.topSpeed} m/s, which is not the wheel this was derived against`,
  );
  assert.ok(
    PADDLE.maxStepSweep > legitimate,
    `the guard (${PADDLE.maxStepSweep} m) is below the longest legitimate step `
      + `(${legitimate.toFixed(3)} m), so an ordinary swing at top speed would be `
      + 'discarded as a teleport and the paddle would pass through everything',
  );
  assert.ok(
    PADDLE.maxStepSweep >= legitimate * 1.5,
    `the guard has only ${(PADDLE.maxStepSweep / legitimate).toFixed(2)}× margin. It is `
      + 'meant to sit well above the legitimate maximum rather than snugly on it — '
      + 'a guard tuned to the edge disarms itself on the first constant that moves.',
  );

  // And it must still be tight enough to catch a real teleport. The shortest
  // teleport worth catching is the crash respawn to a safe position, which is
  // metres away by construction.
  assert.ok(PADDLE.maxStepSweep < 3, 'a guard this loose would let a short respawn through');
});

test('the swept segment approximates the arc to well under a millimetre of consequence', () => {
  const paddle = new Paddle();
  const sagitta = paddle.stepSagitta;

  // Why there is no sub-stepping and no arc integration. The chord the sweep
  // tests bows away from the true arc by this much; while it is a small
  // fraction of the head's own radius, the segment is the arc for every purpose
  // the hit test has.
  assert.ok(sagitta > 0, 'a zero sagitta means the arc arithmetic is not running');
  assert.ok(
    sagitta < PADDLE.headRadius * 0.1,
    `the chord misses the arc by ${(sagitta * 1000).toFixed(1)} mm, which is no longer `
      + `negligible against a ${(PADDLE.headRadius * 1000).toFixed(0)} mm head. Either `
      + 'sub-step the strike window or widen the head; do not leave this failing.',
  );
});

test('a target disc sits inside the head’s vertical reach, with room', () => {
  // The two heights are authored in different groups — the swing plane under
  // PADDLE, the disc under TARGET — so nothing but this test stops one being
  // moved past the other. A gap wider than the two radii is a mode in which
  // every swing misses and no test anywhere else would say why.
  const gap = Math.abs(PADDLE.pivotHeight - TARGET.strikeHeight);
  const combined = PADDLE.headRadius + TARGET.discRadius;
  assert.ok(
    gap < combined * 0.6,
    `the swing plane and the disc are ${gap.toFixed(2)} m apart against a combined `
      + `radius of ${combined.toFixed(2)} m — a dead-centre swing would be a graze`,
  );
});

// ---------------------------------------------------------------------------
// The swing cycle
// ---------------------------------------------------------------------------

test('a swing runs idle → windup → active → recover → idle, once per request', () => {
  const paddle = new Paddle();
  assert.equal(paddle.phase, 'idle');

  const seen: string[] = [];
  for (let step = 0; step < 240; step += 1) {
    // Requested on every single step. The cycle must still run exactly once:
    // only idle accepts a request, and idle is not reached until recovery ends.
    paddle.step(DT, poseAt(step * DT, 10), true, null);
    if (seen[seen.length - 1] !== paddle.phase) seen.push(paddle.phase);
    if (seen.length >= 6) break;
  }
  // The single idle step between two swings is real and is left alone: the
  // cycle finishes inside a step and the next request is granted at the top of
  // the following one. It is 8.3 ms, it is invisible, and removing it would
  // mean a held button could start a swing in the same step one ended — which
  // is the shape of thing that makes a recovery window stop costing anything.
  assert.deepEqual(seen.slice(0, 5), ['windup', 'active', 'recover', 'idle', 'windup']);
});

test('a mirrored swing latches its side until the cycle finishes', () => {
  const paddle = new Paddle();
  let firstActiveAngle = -Infinity;
  let sawActive = false;
  for (let step = 0; step < 120; step += 1) {
    // Ask left once, then offer the opposite side on every later step. A target
    // crossing the cop's nose during wind-up must not reverse a committed arc.
    paddle.step(DT, poseAt(step * DT, 0), step === 0, null, step === 0 ? 'left' : 'right');
    if (paddle.phase === 'active' && !sawActive) {
      sawActive = true;
      firstActiveAngle = paddle.angle;
    }
    if (paddle.phase !== 'idle') assert.equal(paddle.swingSide, 'left');
  }
  assert.equal(sawActive, true, 'the mirrored request never reached its strike window');
  assert.ok(firstActiveAngle > 0, `the left strike opened on the right (${firstActiveAngle})`);
});

test('each phase lasts the seconds it is tuned to', () => {
  const paddle = new Paddle();
  const counts: Record<string, number> = { idle: 0, windup: 0, active: 0, recover: 0 };
  for (let step = 0; step < 200; step += 1) {
    paddle.step(DT, poseAt(step * DT, 0), step === 0, null);
    counts[paddle.phase] += 1;
  }
  // Within one step either side: the machine walks in fixed increments and a
  // span rarely divides evenly into them.
  const expect = (seconds: number): number => seconds * SIMULATION.hz;
  assert.ok(Math.abs(counts.windup - expect(PADDLE.windupSeconds)) <= 1, 'windup');
  assert.ok(Math.abs(counts.active - expect(PADDLE.activeSeconds)) <= 1, 'active');
  assert.ok(Math.abs(counts.recover - expect(PADDLE.recoverSeconds)) <= 1, 'recover');
});

test('the head sweeps from behind the rider’s right to in front of them', () => {
  // **A world-space check, and it cannot catch the frame error.** This project
  // has already shipped a steering sign that the whole headless suite agreed
  // with, because every assertion was written in the same wrong convention.
  // What this *can* catch is a regression inside `writeHead` against the stated
  // convention — +X is the rider's left, so their right is −X — and the browser
  // suite makes the claim that actually matters, in screen space, by projecting
  // the head through the real chase camera.
  const { path } = swingOnce(null, 0);
  const active = path.filter((point) => point.phase === 'active');
  assert.ok(active.length > 2, 'no strike window to measure');

  const first = active[0];
  const last = active[active.length - 1];

  assert.ok(first.x < 0, `the swing starts on the rider's left (x=${first.x.toFixed(2)})`);
  assert.ok(first.z < 0, `the swing starts in front of the rider (z=${first.z.toFixed(2)})`);
  assert.ok(last.z > first.z, 'the head does not travel forwards — this is a backhand');
  assert.ok(
    last.z > 0,
    'the swing never reaches in front of the rider, so a target ahead is unhittable',
  );
  // Every sample is at the swing plane; the arc is horizontal by construction.
  for (const point of active) {
    assert.ok(Math.abs(point.y - PADDLE.pivotHeight) < 1e-9, 'the head left its own plane');
  }
});

test('a swing is only a swing while it is active', () => {
  const field = new TargetField([
    // Squarely on the rest position, where the head is carried between swings.
    targetAt('rest', -1.4, PADDLE.pivotHeight, 0.9, 0.6),
  ]);
  const paddle = new Paddle();
  let hits = 0;
  for (let step = 0; step < 240; step += 1) {
    hits += paddle.step(DT, poseAt(step * DT, 0), false, field).length;
  }
  assert.equal(hits, 0, 'a target under the resting paddle is struck without a swing');
});

// ---------------------------------------------------------------------------
// The sixteen-phase sweep — the plan's own gate on hit detection
// ---------------------------------------------------------------------------

/**
 * The true continuous path of the head, sampled far finer than the fixed step.
 *
 * Uses the same state machine, which is the point: the claim under test is not
 * "the formula is right" but "the **discrete** sweep catches a target anywhere
 * on the path the formula describes".
 */
function continuousActivePath(speed: number, subSteps: number): { x: number; y: number; z: number }[] {
  const fine = DT / subSteps;
  const paddle = new Paddle();
  const points: { x: number; y: number; z: number }[] = [];
  for (let step = 0; step < 240 * subSteps; step += 1) {
    paddle.step(fine, poseAt(step * fine, speed), step === 0, null);
    if (paddle.phase === 'active') points.push(paddle.headPosition);
    else if (points.length > 0) break;
  }
  return points;
}

for (const [label, speedOf] of [
  ['at top speed', () => RIDEABILITY.topSpeed],
  ['at four times top speed', () => RIDEABILITY.topSpeed * 4],
  ['from a standstill', () => 0],
] as const) {
  test(`the smallest shipped target is struck from every phase of the sweep, ${label}`, () => {
    const speed = speedOf();
    const path = continuousActivePath(speed, 16);
    assert.ok(path.length >= 16, 'the strike window is too short to sample');

    for (let phase = 0; phase < 16; phase += 1) {
      // Sixteen positions spread across the true swept path, including the
      // points that fall *between* two fixed-step samples — which is exactly
      // where a point test drops a hit and a swept one does not.
      const point = path[Math.min(path.length - 1, Math.round((phase * (path.length - 1)) / 15))];
      const field = new TargetField([
        targetAt(`phase-${phase}`, point.x, point.y, point.z, TARGET.discRadius),
      ]);
      const { hits } = swingOnce(field, speed);
      assert.equal(
        hits.length,
        1,
        `phase ${phase}/16 ${label}: a target dead on the swept path was struck `
          + `${hits.length} times. This is the failure the swept segment exists to `
          + 'prevent, and at these speeds it drops dead-centre hits, not grazes.',
      );
      assert.equal(hits[0].id, `phase-${phase}`);
    }
  });
}

test('a point test drops a grazing pass the segment test catches', () => {
  // The mutation check. Same swing, same target: the difference is only whether
  // the head is treated as a sequence of points or as the segments between them.
  const speed = RIDEABILITY.topSpeed;
  const { path } = swingOnce(null, speed);
  const active = path.filter((point) => point.phase === 'active');
  assert.ok(active.length >= 3, 'no strike window to measure');

  const a = active[Math.floor(active.length / 2)];
  const b = active[Math.floor(active.length / 2) + 1];
  const spacing = Math.hypot(b.x - a.x, b.z - a.z);
  const combined = PADDLE.headRadius + TARGET.discRadius;

  // Perpendicular to the chord, at 99.5% of the combined radius: inside the
  // swept capsule and outside both endpoint spheres, which is precisely the
  // band a point test cannot see. The band is `spacing` wide, so it grows with
  // speed — at 15 m/s it dropped grazes, and at 22.3 it drops centres.
  const offset = combined * 0.995;
  const nx = -(b.z - a.z) / spacing;
  const nz = (b.x - a.x) / spacing;
  const midX = (a.x + b.x) / 2 + nx * offset;
  const midZ = (a.z + b.z) / 2 + nz * offset;

  const field = new TargetField([targetAt('graze', midX, PADDLE.pivotHeight, midZ)]);
  const { hits } = swingOnce(field, speed);
  assert.equal(hits.length, 1, 'the swept segment must catch it');

  // Now the same target against the same sampled head positions, as a point
  // test would have seen them.
  let pointHits = 0;
  for (const point of active) {
    const dx = point.x - midX;
    const dz = point.z - midZ;
    if (Math.hypot(dx, dz) <= combined) pointHits += 1;
  }
  assert.equal(
    pointHits,
    0,
    'a point test caught this too, so the fixture no longer demonstrates the '
      + 'failure — widen the offset toward the combined radius and re-derive',
  );
});

// ---------------------------------------------------------------------------
// The broadphase against a brute-force oracle
// ---------------------------------------------------------------------------

/** A small deterministic generator, so a failure is reproducible. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('the broadphase agrees with brute force over four hundred targets', () => {
  const random = lcg(0x4d3a9c1);
  const targets: Target[] = [];
  for (let index = 0; index < 400; index += 1) {
    targets.push(targetAt(
      `t${index}`,
      (random() - 0.5) * 900,
      TARGET.strikeHeight + (random() - 0.5) * 2,
      (random() - 0.5) * 900,
      TARGET.discRadius,
    ));
  }
  const field = new TargetField(targets);

  for (let query = 0; query < 2000; query += 1) {
    const x = (random() - 0.5) * 900;
    const y = TARGET.strikeHeight + (random() - 0.5) * 3;
    const z = (random() - 0.5) * 900;
    const half = 0.2 + random() * 6;
    const box = [x - half, y - half, z - half, x + half, y + half, z + half] as const;

    const seen: string[] = [];
    field.eachNear(box[0], box[1], box[2], box[3], box[4], box[5], (volume) => {
      seen.push(volume.id);
    });

    const expected = targets.filter((target) => (
      target.centre.x + target.radius >= box[0] && target.centre.x - target.radius <= box[3]
      && target.centre.y + target.radius >= box[1] && target.centre.y - target.radius <= box[4]
      && target.centre.z + target.radius >= box[2] && target.centre.z - target.radius <= box[5]
    )).map((target) => target.id);

    assert.equal(new Set(seen).size, seen.length, `query ${query} visited a target twice`);
    assert.deepEqual(new Set(seen), new Set(expected), `query ${query} disagreed with brute force`);
  }
});

test('a struck target leaves the set and cannot be struck again', () => {
  const field = new TargetField([targetAt('one', 0, 0, 0)]);
  assert.equal(field.count, 1);
  assert.equal(field.struckCount, 0);

  assert.equal(field.strike('one'), true);
  assert.equal(field.strike('one'), false, 'a second strike must score nothing');
  assert.equal(field.struckCount, 1);

  let visited = 0;
  field.eachNear(-9, -9, -9, 9, 9, 9, () => {
    visited += 1;
  });
  assert.equal(visited, 0, 'a fallen target is still in the broadphase');

  field.reset();
  assert.equal(field.struckCount, 0, 'a fresh run stands them back up');
});

test('two targets sharing an id are refused rather than half-tracked', () => {
  assert.throws(
    () => new TargetField([targetAt('same', 0, 0, 0), targetAt('same', 9, 0, 9)]),
    /share the id/,
  );
});

// ---------------------------------------------------------------------------
// The teleport guard
// ---------------------------------------------------------------------------

test('a teleport records no hits, however many targets lie on the line', () => {
  // The crash respawn, in miniature: the rider is at one end of a line of
  // targets and, one step later, at the other. Without the guard the first
  // sweep afterwards is a spear through all of them, which no forward-riding
  // test would ever catch and which would be a silent scoring exploit.
  const targets: Target[] = [];
  for (let index = 0; index < 20; index += 1) {
    targets.push(targetAt(`line-${index}`, -1.2, PADDLE.pivotHeight, index * 2, 0.8));
  }
  const field = new TargetField(targets);
  const paddle = new Paddle();

  let hits = 0;
  // Get a swing genuinely under way at the far end of the line...
  for (let step = 0; step < 40; step += 1) {
    hits += paddle.step(DT, { x: 0, y: 0, z: 38, headingY: 0 }, step === 0, field).length;
  }
  const beforeTeleport = hits;

  // ...then teleport back to the start, mid-cycle, exactly as `respawn()` does.
  for (let step = 0; step < 40; step += 1) {
    hits += paddle.step(DT, { x: 0, y: 0, z: 0, headingY: 0 }, false, field).length;
  }

  assert.ok(
    hits - beforeTeleport <= 1,
    `the teleport step struck ${hits - beforeTeleport} targets. The unconditional `
      + '|P1 − P0| > maxStepSweep reseed is the primary defence and it is not firing.',
  );
});

test('an explicit reseed makes the next step seed rather than sweep', () => {
  const field = new TargetField([targetAt('a', -1.2, PADDLE.pivotHeight, 0.4, 0.9)]);
  const paddle = new Paddle();

  // Mid-swing, with the target within reach of the head's *next* position.
  for (let step = 0; step < 12; step += 1) {
    paddle.step(DT, poseAt(step * DT, 0), step === 0, null);
  }
  paddle.reseed();
  const struck = paddle.step(DT, poseAt(12 * DT, 0), false, field);
  assert.equal(struck.length, 0, 'the step after a reseed swept from a stale position');
  assert.equal(paddle.reseeded, true, 'the reseed is not reported');
});

test('the very first step of a session never sweeps from the origin', () => {
  // Nothing has established a previous head position yet, so a sweep would run
  // from (0, 0, 0) to wherever the rider actually spawned — through the whole
  // world in between.
  const field = new TargetField([targetAt('spawnline', -1.2, PADDLE.pivotHeight, 60, 3)]);
  const paddle = new Paddle();
  const struck = paddle.step(DT, { x: 0, y: 0, z: 120, headingY: 0 }, true, field);
  assert.equal(struck.length, 0);
});

test('a cancelled swing drops to rest and reseeds', () => {
  const paddle = new Paddle();
  for (let step = 0; step < 14; step += 1) paddle.step(DT, poseAt(step * DT, 8), step === 0, null);
  assert.notEqual(paddle.phase, 'idle');
  paddle.cancel();
  assert.equal(paddle.phase, 'idle');
  assert.equal(paddle.swinging, false);
});

// ---------------------------------------------------------------------------
// Determinism, and the standing rule about the wobble
// ---------------------------------------------------------------------------

test('two identical swings produce identical hits', () => {
  // Placed on the path the swing actually takes rather than at hand-picked
  // coordinates: at top speed the rider has covered several metres by the time
  // the wind-up ends, so a fixture authored around the origin is behind them
  // before the strike window opens — and a determinism test that strikes
  // nothing passes for the wrong reason forever.
  const { path } = swingOnce(null, RIDEABILITY.topSpeed);
  const active = path.filter((point) => point.phase === 'active');
  assert.ok(active.length >= 3, 'no strike window to measure');
  const build = (): TargetField => new TargetField(
    [0, Math.floor(active.length / 2), active.length - 1].map((index, order) => {
      const point = active[index];
      return targetAt(`t${order}`, point.x, point.y, point.z, TARGET.discRadius);
    }),
  );

  const first = swingOnce(build(), RIDEABILITY.topSpeed);
  const second = swingOnce(build(), RIDEABILITY.topSpeed);
  assert.deepEqual(first.hits, second.hits);
  assert.equal(first.hits.length, 3, 'the fixture did not strike all three');
});

test('hits arrive in the order the sweep reached them', () => {
  // Two targets on the swept path, named against the order they are struck in,
  // so an array-order tie-break would be visible. The claim has two halves: the
  // ids come out in path order across the swing, and within any one step the
  // reported hits are sorted along the segment. The second half is what a mode
  // scoring one hit per step would depend on, and what keeps `advance(n)`
  // reproducible after the generator reorders its output.
  const { path } = swingOnce(null, 0);
  const active = path.filter((point) => point.phase === 'active');
  assert.ok(active.length >= 4, 'no strike window to measure');
  const early = active[1];
  const late = active[active.length - 2];

  const field = new TargetField([
    targetAt('zzz-late', late.x, late.y, late.z, 0.2),
    targetAt('aaa-early', early.x, early.y, early.z, 0.2),
  ]);
  const { hits, perStep } = swingOnce(field, 0);

  assert.deepEqual(hits.map((hit) => hit.id), ['aaa-early', 'zzz-late']);
  for (const step of perStep) {
    for (let index = 1; index < step.length; index += 1) {
      assert.ok(step[index].t >= step[index - 1].t, 'one step reported its hits out of order');
    }
  }
});

test('nothing in the paddle or target path can reach the wobble oscillator', () => {
  /*
   * The owner's standing rule from the M13 exit ride: **nothing but a real
   * hazard may trigger wobble in play, and any other trigger found later is
   * removed rather than tuned.** A jolt on a landed hit reads as an obvious fit
   * for the oscillator, which is exactly why this is pinned rather than
   * trusted — M14 feels a hit through the suspension kick the pedal strike
   * already uses, and adds no caller here.
   *
   * The census is **four**. M15 added the third; the owner's 2026-08-12 M14
   * ride added the fourth, and both are legitimate under the rule rather than
   * exceptions to it: the owner classifies a soft bush as a hazard, and on
   * that ride classified a bodily ridden-into Knockabout target the same way.
   * The four are, in `EucController.ts`:
   *
   *   1. the pothole contact impulse (shallow or deep) — M13;
   *   2. the soft-body entry impulse — M15, one charge on entering a shrub;
   *   3. the distance-cadence probe, which ships at zero and that no URL can
   *      raise. It is a bench instrument, kept because metres-on-the-fixed-step
   *      is what makes the wobble suites reproducible under `advance(n)`;
   *   4. `softKnock` — the body knock on a Knockabout target, one bush-grade
   *      charge whose energy is the soft-body constant read inside the
   *      controller, deliberately not a parameter.
   *
   * The count is the weaker half of this test. The half that matters is that
   * every caller is inside the controller: a call from `paddle.ts`,
   * `targets.ts` or `app/Game.ts` is the rule being broken, whatever the total.
   */
  const root = join(import.meta.dirname, '..');
  const callers: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      const source = readFileSync(path, 'utf8').split('\n');
      source.forEach((line, index) => {
        // A declaration and a doc comment are not calls. A call is the name
        // preceded by a dot and followed by an open bracket.
        if (/\.injectWobble\s*\(/.test(line)) callers.push(`${entry}:${index + 1}`);
      });
    }
  };
  walk(root);

  for (const caller of callers) {
    assert.ok(
      caller.startsWith('EucController.ts:'),
      `${caller} calls injectWobble. M14 must not: a hit is felt through the `
        + 'suspension kick, and the owner\'s standing rule is that a new wobble '
        + 'trigger is removed rather than tuned.',
    );
  }
  assert.equal(
    callers.length,
    4,
    `injectWobble now has ${callers.length} callers (${callers.join(', ')}). The four `
      + 'sanctioned ones are named above. A fifth is a new wobble trigger and needs '
      + 'the owner, not a re-pin.',
  );
});

test('a foreign hittable set works without the paddle knowing what it is', () => {
  // The wielder-agnostic constraint, expressed as the only thing that can prove
  // it: a set that is not targets at all. When the cop swings at riders, the
  // capsules arrive through this interface and this file does not change.
  const capsule: HittableVolume = { id: 'rider-2', x: -1.3, y: PADDLE.pivotHeight, z: 0.5, radius: 0.45 };
  const riders: HittableSet = {
    eachNear(minX, minY, minZ, maxX, maxY, maxZ, visit) {
      if (capsule.x + capsule.radius < minX || capsule.x - capsule.radius > maxX) return;
      if (capsule.y + capsule.radius < minY || capsule.y - capsule.radius > maxY) return;
      if (capsule.z + capsule.radius < minZ || capsule.z - capsule.radius > maxZ) return;
      visit(capsule);
    },
  };

  const { hits } = swingOnce(riders, 6);
  assert.equal(hits.length >= 1, true, 'the paddle refused to hit a non-target volume');
  assert.equal(hits[0].id, 'rider-2');
});
