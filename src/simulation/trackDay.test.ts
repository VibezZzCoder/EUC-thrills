/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHALLENGE, TRACK_DAY } from '../data/tuning.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { TRACK, createTrackLevel } from '../level/trackLevel.ts';
import type { LapCourse, LevelPlan } from '../level/plan.ts';
import { LapEnvelope, TrackDayRun, type TrackDayEvent, type TrackDayStepInput } from './trackDay.ts';

/**
 * A track day, tested on the circuit it is for.
 *
 * **The fixture is BelVar itself, not a synthetic ring**, and that is the one
 * decision in this file worth defending. A hand-built oval would test the
 * arithmetic and would be silent about every question that actually decides
 * whether the mode works: whether a 175° hairpin sampled into a polyline still
 * contains a rider riding round it, whether the sector gates a level author
 * placed are reachable in the order they were authored, whether the corridor is
 * wide enough that a racing line never falls out of it. Those are properties of
 * *this* venue and the referee meets them on the day the owner rides it.
 *
 * So the rider below walks the real emitted centreline. That makes it a
 * perfect driver, which is a limitation worth naming: it proves a clean lap
 * counts and it proves the listed ways of cheating do not, and it cannot say
 * anything about how the lap *feels*. That is the owner's gate (§23.15).
 */

/** The simulation's fixed step. Everything below is driven at it. */
const STEP = 1 / 120;

const track: LevelPlan = createTrackLevel();
const course: LapCourse = track.lap!;

function lines(plan: LevelPlan) {
  return [...plan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex);
}

function run(plan: LevelPlan = track): TrackDayRun {
  return new TrackDayRun(plan.id, plan.checkpoints, plan.lap ?? null);
}

/**
 * A rider on rails, at a stated lateral offset from the centreline.
 *
 * Distance along the ring, wrapped, so a session is simply "keep going". The
 * offset is signed in the corridor's own frame and is what every cheating test
 * below reaches for: +12 m is through the barrier line and out into the field,
 * +4 m is a wide but perfectly legal line on the verge.
 */
class Rails {
  /** Cumulative distance to each point of the ring, and its total. */
  private readonly at: number[] = [];
  private travelled: number;

  constructor(startMetres = 0) {
    let total = 0;
    this.at.push(0);
    for (let index = 1; index < course.points.length; index += 1) {
      total += Math.hypot(
        course.points[index].x - course.points[index - 1].x,
        course.points[index].z - course.points[index - 1].z,
      );
      this.at.push(total);
    }
    this.travelled = startMetres;
  }

  get metres(): number {
    return this.travelled;
  }

  advance(metres: number): void {
    this.travelled += metres;
  }

  /** Where the rider is, `offset` metres to the left of the centreline. */
  pose(offset = 0): { x: number; z: number } {
    const total = this.at[this.at.length - 1];
    let target = this.travelled % total;
    if (target < 0) target += total;

    let index = 0;
    while (index < this.at.length - 2 && this.at[index + 1] <= target) index += 1;
    const a = course.points[index];
    const b = course.points[index + 1];
    const span = this.at[index + 1] - this.at[index];
    const t = span > 0 ? (target - this.at[index]) / span : 0;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (offset === 0) return { x, z };
    // +X is the rider's LEFT (AGENTS.md), and the left of a heading `h` is
    // `(cos h, -sin h)`; taken from the span so it needs no heading at all.
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: x + (dz / length) * offset, z: z - (dx / length) * offset };
  }
}

/** One step's input at a point, with nothing eventful happening. */
function inputAt(point: { x: number; z: number }, speed: number): TrackDayStepInput {
  return {
    x: point.x,
    y: 0,
    z: point.z,
    speed,
    landed: false,
    landingClean: false,
    crashed: false,
  };
}

/**
 * Ride `metres` of circuit, at `speed`, `offset` metres off the racing line.
 *
 * `offset` may be a function of distance, which is how a detour through a
 * barrier gate is expressed: a rider who is on the track, then is not, then is
 * again.
 */
function ride(
  session: TrackDayRun,
  rails: Rails,
  metres: number,
  options: { speed?: number; offset?: number | ((metres: number) => number) } = {},
): TrackDayEvent[] {
  const speed = options.speed ?? 20;
  const offsetOf = typeof options.offset === 'function'
    ? options.offset
    : () => (options.offset ?? 0) as number;
  const events: TrackDayEvent[] = [];
  // Negative distance is riding *backwards*, which the wrong-way tests need and
  // which a step count alone silently turns into riding nowhere at all.
  const direction = metres < 0 ? -1 : 1;
  const steps = Math.round(Math.abs(metres) / (speed * STEP));
  for (let step = 0; step < steps; step += 1) {
    rails.advance(direction * speed * STEP);
    events.push(...session.step(STEP, inputAt(rails.pose(offsetOf(rails.metres)), speed * direction)));
  }
  return events;
}

/** Step until the session reaches `phase`, or give up after `metres`. */
function rideUntil(
  session: TrackDayRun,
  rails: Rails,
  phase: string,
  metres = 200,
  speed = 6,
): void {
  const steps = Math.round(metres / (speed * STEP));
  for (let step = 0; step < steps; step += 1) {
    rails.advance(speed * STEP);
    session.step(STEP, inputAt(rails.pose(), speed));
    if (session.state.phase === phase) return;
  }
  assert.fail(`the session never reached ${phase} in ${metres} m`);
}

/**
 * Where a gate stands on the ring, in metres from the start of the polyline.
 *
 * Found rather than authored: a sector line's distance around the lap is the
 * sum of every corridor before it, and writing that number into a test is how
 * a test keeps passing while measuring the wrong corner.
 */
function ringDistanceOf(id: string): number {
  const gate = track.checkpoints.find((checkpoint) => checkpoint.id === id)!;
  let travelled = 0;
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 1; index < course.points.length; index += 1) {
    const a = course.points[index - 1];
    const b = course.points[index];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const distance = Math.hypot(b.x - gate.centre.x, b.z - gate.centre.z);
    travelled += span;
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = travelled;
  }
  assert.ok(bestDistance < 3, `gate "${id}" is ${bestDistance.toFixed(1)} m off the centreline`);
  return best;
}

/** True distance from a point to the ring, by brute force. The slow, obvious way. */
function distanceToRing(x: number, z: number): number {
  let best = Infinity;
  for (let index = 1; index < course.points.length; index += 1) {
    const a = course.points[index - 1];
    const b = course.points[index];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 0
      ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared))
      : 0;
    const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (distance < best) best = distance;
  }
  return best;
}

/** Ride to the line and open lap 1, leaving the rider just past it. */
function outLap(session: TrackDayRun): Rails {
  session.arm();
  const rails = new Rails(0);
  ride(session, rails, TRACK.lineAt + 4);
  assert.equal(session.state.phase, 'running', 'the line did not open a lap');
  assert.equal(session.state.lap, 1);
  return rails;
}

const lapEvents = (events: readonly TrackDayEvent[]) => events.filter((e) => e.kind === 'lap');

// ---------------------------------------------------------------------------
// What can be lapped
// ---------------------------------------------------------------------------

test('a circuit can be lapped and a point-to-point route cannot', () => {
  assert.equal(run().available, true, 'BelVar states a start and no finish, which is a lap');

  const slice = createSliceLevel();
  assert.equal(
    run(slice).available,
    false,
    'the slice ends in a finish, so it is a course to ride once and not a lap',
  );
  // And the negative of that, which is the property that keeps the two modes
  // from ever offering each other's world: the M10 referee declines BelVar.
  assert.equal(slice.lap, undefined, 'a point-to-point plan must carry no lap');
  assert.notEqual(track.lap, undefined, 'a circuit must carry one');
});

test('a lap plan with no envelope is refused rather than judged blind', () => {
  const blind = new TrackDayRun(track.id, track.checkpoints, null);
  assert.equal(blind.available, false);
  blind.arm();
  assert.equal(blind.state.phase, 'idle', 'arming an unavailable session must do nothing');
});

// ---------------------------------------------------------------------------
// The out lap and the line
// ---------------------------------------------------------------------------

test('the out lap is not timed, and the line starts the clock at zero', () => {
  const session = run();
  session.arm();
  assert.equal(session.state.phase, 'outLap');
  assert.equal(session.state.lap, 0);

  const rails = new Rails(0);
  // Deliberately slowly, and deliberately most of the way to the line: none of
  // it may appear in lap one's time.
  ride(session, rails, TRACK.lineAt - 6, { speed: 4 });
  assert.equal(session.state.phase, 'outLap', 'the clock started before the line');
  assert.equal(session.state.elapsed, 0);

  rideUntil(session, rails, 'running', 20, 4);
  assert.equal(session.state.lap, 1);
  // The step that opens a lap does not also advance its clock, so lap one
  // begins at exactly zero rather than at however far into the gate the rider
  // happened to be sampled.
  assert.equal(session.state.elapsed, 0, 'lap one inherited part of the out lap');
  assert.deepEqual(session.state.splits, [0], 'the line that opened the lap is split zero');
});

test('sitting on the line does not close a lap a step after opening it', () => {
  const session = run();
  const rails = outLap(session);
  // Crawl forward through the rest of the 3.6 m volume. Every one of these
  // steps is inside the start gate, and not one of them may close lap one.
  const events = ride(session, rails, 3, { speed: 0.5 });
  assert.deepEqual(lapEvents(events), [], 'the start volume closed the lap it had just opened');
  assert.equal(session.state.lap, 1);
});

test('rolling backwards and forwards across the line still yields one lap', () => {
  const session = run();
  const rails = outLap(session);
  ride(session, rails, 900);
  // Over the line, back over it, and over it again — one crossing's worth of
  // laps, because the latch clears on leaving the volume rather than on a timer.
  const forward = lapEvents(ride(session, rails, 30, { speed: 6 }));
  assert.equal(forward.length, 1, 'the lap did not close');
  const before = session.state.lap;
  const shuffle = lapEvents(ride(session, rails, -12, { speed: 6 }))
    .concat(lapEvents(ride(session, rails, 12, { speed: 6 })));
  assert.deepEqual(shuffle, [], 'shuffling over the line minted extra laps');
  assert.equal(session.state.lap, before, 'and it did not advance the lap counter either');
  assert.equal(session.state.lapsRidden, 1);
  // What it *does* do is start the lap again, which is what a rider crossing
  // the line sees whether or not they meant to.
  assert.ok(session.state.elapsed < 3, `the restarted lap is ${session.state.elapsed} s old`);
});

test('a lap that went round both sector gates restarts rather than timing a lap and a half', () => {
  const session = run();
  const rails = outLap(session);
  const wide = [ringDistanceOf('sector-1'), ringDistanceOf('sector-2')];
  const events = ride(session, rails, course.length, {
    offset: (metres) => {
      const at = metres % course.length;
      return wide.some((past) => at > past - 25 && at < past + 25) ? 30 : 0;
    },
  });
  assert.deepEqual(lapEvents(events), [], 'a lap with no sector crossings closed');
  assert.equal(session.state.lap, 1, 'the rider is still on lap one');
  assert.equal(session.state.lapsRidden, 0);
  // And the clock started again at the line, so the next lap is a real lap.
  const next = lapEvents(ride(session, rails, course.length))[0].lap!;
  assert.equal(next.counted, true);
  assert.ok(next.seconds < 60, `the lap after it measured ${next.seconds} s, which is a lap and a half`);
});

// ---------------------------------------------------------------------------
// A clean session
// ---------------------------------------------------------------------------

test('three clean laps of the centreline all count, with ordered sector splits', () => {
  const session = run();
  const rails = outLap(session);
  const closed: TrackDayEvent[] = [];
  for (let lap = 0; lap < 3; lap += 1) {
    closed.push(...lapEvents(ride(session, rails, course.length)));
  }

  assert.equal(closed.length, 3, `three laps of the ring closed ${closed.length}`);
  for (const [index, event] of closed.entries()) {
    const lap = event.lap!;
    assert.equal(lap.lap, index + 1);
    assert.equal(lap.counted, true, `lap ${lap.lap} was voided: ${lap.voided}`);
    assert.equal(lap.voided, null);
    // Four entries: the line, two sector lines, the line again.
    assert.equal(lap.splits.length, track.checkpoints.length + 1);
    assert.equal(lap.splits[0], 0);
    assert.equal(lap.splits[lap.splits.length - 1], lap.seconds);
    for (let i = 1; i < lap.splits.length; i += 1) {
      assert.ok(lap.splits[i] > lap.splits[i - 1], 'splits ran backwards');
    }
    // 930 m at 20 m/s. Wide, because the point is the shape and not the number.
    assert.ok(lap.seconds > 40 && lap.seconds < 55, `a 20 m/s lap took ${lap.seconds} s`);
  }

  const state = session.state;
  assert.equal(state.lapsCounted, 3);
  assert.equal(state.lapsRidden, 3);
  assert.equal(state.lap, 4, 'the fourth lap opens on the same crossing that closed the third');
  assert.equal(state.bestLapSeconds, Math.min(...closed.map((e) => e.lap!.seconds)));
});

test('sector labels are the level author’s, both ends of the lap included', () => {
  const session = run();
  const rails = outLap(session);
  ride(session, rails, course.length);
  const result = session.end()!;
  const authored = lines(track).map((line) => line.label);
  assert.deepEqual(result.labels, [...authored, authored[0]]);
  assert.equal(result.labels[0], 'Start/finish');
  assert.equal(result.labels[result.labels.length - 1], 'Start/finish');
});

// ---------------------------------------------------------------------------
// What voids a lap
// ---------------------------------------------------------------------------

test('going round a sector gate is going off the circuit, and the rider is told so', () => {
  // **A gate is wider than the envelope by a tenth of a metre**, which is not a
  // coincidence and is worth an assertion: a sector volume reaches
  // `halfWidth + CHALLENGE.gateWidthMargin` and the envelope reaches
  // `halfWidth + TRACK_DAY.offCourseMarginMetres`. So on this venue a rider
  // cannot miss a line without having left the track, and the reason the HUD
  // shows is the one that is actually true.
  assert.ok(
    TRACK.halfWidth + CHALLENGE.gateWidthMargin
      >= TRACK.halfWidth + TRACK_DAY.offCourseMarginMetres - 0.5,
    'a gate is now much narrower than the envelope, so missing one is silent',
  );

  const session = run();
  const rails = outLap(session);
  const past = ringDistanceOf('sector-1');
  let sawVoid: string | null = null;
  ride(session, rails, past + 40, {
    offset: (metres) => (metres % course.length > past - 25 && metres % course.length < past + 25
      ? 30
      : 0),
  });
  sawVoid = session.state.voided;
  assert.equal(sawVoid, 'off-course', 'the rider was not told why the lap had died');
  assert.equal(session.state.crossed, 1, 'sector one was crossed after all');
});

test('a lap abandoned before its first sector restarts and is not counted as ridden', () => {
  const session = run();
  const rails = outLap(session);
  const past = ringDistanceOf('sector-1');
  const events = ride(session, rails, course.length, {
    offset: (metres) => (metres % course.length > past - 25 && metres % course.length < past + 25
      ? 30
      : 0),
  });
  assert.deepEqual(lapEvents(events), [], 'a lap that reached no sector line closed');
  assert.equal(session.state.lapsRidden, 0);
  assert.equal(session.state.lap, 1);

  const second = lapEvents(ride(session, rails, course.length))[0].lap!;
  assert.equal(second.counted, true, 'the abandoned lap poisoned the one after it');
  assert.equal(session.state.lapsCounted, 1);
  assert.equal(session.state.lapsRidden, 1);
});

test('a sector missed after the first one voids the lap by name', () => {
  // The rule, on its own, without the envelope answering first. Real gates on
  // this venue are wider than the envelope, so a rider physically cannot reach
  // this case here — but a circuit with narrower gates could, and the referee
  // is the thing being tested rather than BelVar's proportions. So sector two
  // is narrowed to a slot the wide line misses while staying on the track.
  const narrowed = track.checkpoints.map((checkpoint) => (checkpoint.id === 'sector-2'
    ? { ...checkpoint, halfExtents: { ...checkpoint.halfExtents, x: 3 } }
    : checkpoint));
  const session = new TrackDayRun(track.id, narrowed, track.lap!);
  const rails = outLap(session);
  const past = ringDistanceOf('sector-2');
  const events = ride(session, rails, course.length, {
    offset: (metres) => (metres % course.length > past - 25 && metres % course.length < past + 25
      ? 7
      : 0),
  });
  const lap = lapEvents(events)[0].lap!;
  assert.equal(lap.voided, 'missed-sector');
  assert.equal(lap.counted, false);
  assert.equal(session.state.lapsRidden, 1, 'it did reach the line, so it was a lap ridden');
});

test('leaving the circuit voids the lap, and returning does not un-void it', () => {
  const session = run();
  const rails = outLap(session);
  // Out through the paddock gate's own side of `main` and back again. The
  // detour is short enough that both sector lines are still crossed in order,
  // so nothing but the envelope can be what refuses this lap.
  const events = ride(session, rails, course.length, {
    offset: (metres) => {
      const at = metres % course.length;
      return at > 80 && at < 95 ? -16 : 0;
    },
  });
  const lap = lapEvents(events)[0].lap!;
  assert.equal(lap.voided, 'off-course', `the lap was ${lap.voided ?? 'counted'}`);
  assert.equal(lap.counted, false);
  assert.equal(lap.splits.length, track.checkpoints.length + 1, 'it did cross every line');
  assert.equal(session.state.onCourse, true, 'the rider is back on the circuit');
  assert.equal(session.state.valid, true, 'and the *next* lap is clean');
});

test('running wide onto the verge is racing, not cheating', () => {
  const session = run();
  const rails = outLap(session);
  // Right out to the barrier line, the whole way round. Every metre of this is
  // outside the asphalt and inside the corridor.
  assert.ok(TRACK.barrierOffset > TRACK.asphaltHalf, 'the verge is outside the racing surface');
  const lap = lapEvents(ride(session, rails, course.length, {
    offset: TRACK.barrierOffset - TRACK.barrierHalfLateral - 0.2,
  }))[0].lap!;
  assert.equal(lap.counted, true, `a lap ridden on the verge was voided: ${lap.voided}`);
});

test('the out lap is not judged — a rider may reach the line however they like', () => {
  const session = run();
  session.arm();
  const rails = new Rails(0);
  ride(session, rails, 40, { offset: 40 });
  assert.equal(session.state.phase, 'outLap');
  ride(session, rails, 40);
  assert.equal(session.state.phase, 'running');
  assert.equal(session.state.valid, true, 'lap one inherited the out lap’s excursion');
});

test('a crash costs time and nothing else', () => {
  const session = run();
  const rails = outLap(session);
  const crashing = (metres: number): boolean => metres % course.length > 400
    && metres % course.length < 420;
  const events: TrackDayEvent[] = [];
  const steps = Math.round(course.length / (20 * STEP));
  for (let step = 0; step < steps; step += 1) {
    rails.advance(20 * STEP);
    const point = rails.pose();
    events.push(...session.step(STEP, {
      ...inputAt(point, 20),
      crashed: crashing(rails.metres),
      landed: step % 600 === 0,
      landingClean: true,
    }));
  }
  const lap = lapEvents(events)[0].lap!;
  assert.equal(lap.counted, true, 'a crash voided a lap');
  const result = session.end()!;
  assert.equal(result.crashes, 1, 'a spill held for a hundred steps counted more than once');
});

// ---------------------------------------------------------------------------
// The reset, the pit, and what a session keeps
// ---------------------------------------------------------------------------

test('a quick reset throws the lap away and keeps the session', () => {
  const session = run();
  const rails = outLap(session);
  ride(session, rails, course.length);
  const best = session.state.bestLapSeconds;
  assert.ok(best !== null);

  ride(session, rails, 500);
  assert.ok(session.state.elapsed > 20, 'the second lap is well under way');
  session.restart();
  assert.equal(session.state.phase, 'outLap', 'reset must return the rider to a pit-out');
  assert.equal(session.state.elapsed, 0, 'the abandoned lap kept its clock');
  assert.equal(session.state.lap, 0);
  assert.equal(session.state.bestLapSeconds, best, 'a spin cost the session its best lap');
  assert.equal(session.state.lapsCounted, 1);
});

test('a reset onto the line does not open a lap the rider did not ride', () => {
  const session = run();
  const rails = outLap(session);
  ride(session, rails, 600);
  session.restart();
  // Put the rider exactly on the line, standing still, as the run-up reset
  // very nearly does. Entering the volume is what opens a lap; being in it is
  // not, or a reset would post a lap of one step.
  const onLine = new Rails(TRACK.lineAt);
  for (let step = 0; step < 20; step += 1) {
    session.step(STEP, inputAt(onLine.pose(), 0));
  }
  assert.equal(session.state.phase, 'running', 'the rider is on the line, so a lap is open');
  assert.equal(session.state.lap, 1, 'and it is the first lap of the session again');
  assert.ok(session.state.elapsed < 0.2);
});

test('pitting discards the lap in progress and reports the afternoon', () => {
  const session = run();
  const rails = outLap(session);
  ride(session, rails, course.length * 2);
  ride(session, rails, 300);
  const partial = session.state.elapsed;
  assert.ok(partial > 10, 'a third lap is under way');

  const result = session.end()!;
  assert.equal(session.state.phase, 'ended');
  assert.equal(result.lapsRidden, 2, 'the unfinished lap was counted as ridden');
  assert.equal(result.lapsCounted, 2);
  assert.equal(result.bestLapSeconds, Math.min(...result.bestLapSplits.slice(-1)));
  assert.equal(result.bestLapSplits.length, track.checkpoints.length + 1);
  assert.ok(result.topSpeed >= 19.9 && result.topSpeed <= 20.1);
  // Idempotent: a second tap on End session must not rebuild the card.
  assert.equal(session.end(), result);
});

test('the ideal lap is every sector’s best, and only counting laps contribute', () => {
  const session = run();
  const rails = outLap(session);
  // A clean lap, then a lap that is quicker through sector one and then leaves
  // the circuit. The quick sector must not reach the ideal lap: nobody could
  // reproduce it without the cut that followed.
  ride(session, rails, course.length);
  const clean = session.state.bestLapSeconds!;
  const cheated = lapEvents(ride(session, rails, course.length, {
    speed: 22,
    offset: (metres) => (metres % course.length > 700 && metres % course.length < 720 ? -16 : 0),
  }))[0].lap!;
  assert.equal(cheated.counted, false);
  assert.ok(cheated.legs[1] < 1e9);

  const result = session.end()!;
  assert.equal(result.bestLapSeconds, clean, 'a voided lap became the best');
  assert.ok(result.idealLapSeconds !== null);
  assert.ok(
    result.idealLapSeconds! <= clean + 1e-9,
    'the ideal lap is not faster than or equal to the best real one',
  );
  const sum = result.bestSectorLegs.slice(1).reduce((total, leg) => total + leg, 0);
  assert.ok(Math.abs(sum - result.idealLapSeconds!) < 1e-9);
  // Every sector best came from the clean lap, so the ideal lap IS that lap.
  assert.ok(Math.abs(result.idealLapSeconds! - clean) < 1e-9);
});

test('a session that never completed a lap says so rather than inventing one', () => {
  const session = run();
  session.arm();
  const rails = new Rails(0);
  ride(session, rails, 200);
  const result = session.end()!;
  assert.equal(result.bestLapSeconds, null);
  assert.deepEqual(result.bestLapSplits, []);
  assert.equal(result.idealLapSeconds, null);
  assert.equal(result.lapsCounted, 0);
  // The line was crossed, but crossing it *opened* lap one rather than closing
  // one — a lap ridden is a lap that reached the line from the other side.
  assert.equal(result.lapsRidden, 0);
  assert.equal(session.state.lap, 1, 'a lap was nevertheless under way when the rider pitted');
  assert.equal(result.beatRecord, false, 'a session with no lap cannot hold a record');
});

// ---------------------------------------------------------------------------
// The record, and the law it shares with the store
// ---------------------------------------------------------------------------

test('a tie is not a record, and one epsilon better is', () => {
  const session = run();
  const rails = outLap(session);
  const lap = lapEvents(ride(session, rails, course.length))[0].lap!;

  const exact = run();
  exact.setReference({
    totalSeconds: lap.seconds,
    splits: lap.splits,
  });
  const tied = outLap(exact);
  const tiedLap = lapEvents(ride(exact, tied, course.length))[0].lap!;
  // The same rails at the same speed reproduce the same lap to the step.
  assert.ok(Math.abs(tiedLap.seconds - lap.seconds) < 1e-9, 'the fixture is not deterministic');
  assert.equal(tiedLap.beatRecord, false, 'a tie was celebrated as a record');

  const beatable = run();
  beatable.setReference({
    totalSeconds: lap.seconds + CHALLENGE.recordEpsilonSeconds * 2,
    splits: lap.splits.map((value, index) => (index === lap.splits.length - 1
      ? value + CHALLENGE.recordEpsilonSeconds * 2
      : value)),
  });
  const beating = outLap(beatable);
  assert.equal(lapEvents(ride(beatable, beating, course.length))[0].lap!.beatRecord, true);
});

test('the card compares against the record the session arrived with', () => {
  // **A lap that beats the record replaces the reference immediately**, so the
  // rider's next lap is measured against the one they just set — which is the
  // whole point of a track day and is also how a naive session result ends up
  // comparing a record with itself and reporting no improvement at all.
  const session = run();
  session.setReference({ totalSeconds: 90, splits: [0, 30, 60, 90] });
  const rails = outLap(session);

  const first = lapEvents(ride(session, rails, course.length, { speed: 18 }))[0].lap!;
  assert.equal(first.beatRecord, true, 'a 51-second lap did not beat a 90-second record');
  // What `app/Game.ts:fileLap` does the moment the store keeps a lap: the
  // reference moves, so the *next* lap is raced against the one just set. The
  // store owns that decision rather than this file, which is why the referee
  // does not do it to itself.
  session.setReference({ totalSeconds: first.seconds, splits: first.splits });
  assert.ok(Math.abs(session.state.recordSeconds! - first.seconds) < 1e-9);

  const second = lapEvents(ride(session, rails, course.length, { speed: 20 }))[0].lap!;
  assert.ok(second.seconds < first.seconds, 'the fixture did not go quicker');
  assert.equal(second.beatRecord, true, 'the second improvement was measured against the first');
  session.setReference({ totalSeconds: second.seconds, splits: second.splits });

  const result = session.end()!;
  assert.equal(result.previousBest, 90, 'the card would compare the session with itself');
  assert.equal(result.bestLapSeconds, second.seconds);
  assert.equal(result.beatRecord, true);
});

test('a record from a different circuit shape produces no deltas at all', () => {
  const session = run();
  // One entry too few: a table from a layout with a different number of lines.
  session.setReference({ totalSeconds: 50, splits: [0, 20, 50] });
  const rails = outLap(session);
  const events = ride(session, rails, course.length);
  for (const event of events) {
    assert.equal(event.legDelta, null, 'a misaligned record produced a leg delta');
    assert.equal(event.totalDelta, null, 'a misaligned record produced a total delta');
  }
  // The total still stands: it is a lap of this circuit, and only its split
  // table describes somewhere else.
  assert.equal(session.state.recordSeconds, 50);
});

test('an aligned record produces a delta at every line', () => {
  const session = run();
  const first = outLap(session);
  const lap = lapEvents(ride(session, first, course.length))[0].lap!;

  const chasing = run();
  chasing.setReference({ totalSeconds: lap.seconds, splits: lap.splits });
  const rails = outLap(chasing);
  const events = ride(chasing, rails, course.length, { speed: 18 })
    .filter((event) => event.kind !== 'open');
  assert.equal(events.length, track.checkpoints.length, 'every line but the opener reports once');
  for (const event of events) {
    assert.ok(event.totalDelta !== null, `${event.label} had no delta`);
    assert.ok(event.legDelta !== null);
  }
  // Slower everywhere, so behind everywhere.
  assert.ok(events[events.length - 1].totalDelta! > 0);
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('identical inputs produce an identical session', () => {
  const play = () => {
    const session = run();
    const rails = outLap(session);
    const events = ride(session, rails, course.length * 2, { offset: 2 });
    return { events, result: session.end() };
  };
  assert.deepEqual(play(), play());
});

// ---------------------------------------------------------------------------
// The envelope itself
// ---------------------------------------------------------------------------

test('the whole racing surface is inside the envelope, everywhere', () => {
  const envelope = new LapEnvelope(course);
  const rails = new Rails(0);

  for (let metres = 0; metres < course.length; metres += 3) {
    rails.advance(3);
    for (const offset of [0, TRACK.asphaltHalf, -TRACK.asphaltHalf, 8, -8]) {
      const point = rails.pose(offset);
      assert.ok(
        envelope.contains(point.x, point.z),
        `the circuit is off its own envelope at ${metres.toFixed(0)} m, ${offset} m out`,
      );
    }
  }
});

test('the envelope is exactly a distance test — the bounding boxes reject nothing real', () => {
  // **The acceleration is the only thing in `LapEnvelope` that can be subtly
  // wrong.** A grown-box rejection that is a hair too tight would void laps at
  // one corner and pass every other test in this file, so the fast answer is
  // held against the slow one over the whole venue: a grid across the site,
  // plus a dense sweep of the band either side of the boundary itself, where
  // any disagreement has to live.
  const envelope = new LapEnvelope(course);
  const reach = TRACK.halfWidth + TRACK_DAY.offCourseMarginMetres;
  const check = (x: number, z: number): void => {
    const distance = distanceToRing(x, z);
    // A point sitting *on* the boundary to within floating point is a point the
    // two formulations are allowed to disagree about: one compares a square to
    // a square and the other a square root to a length, and they part company
    // in the last bit. The band is a nanometre wide, so nothing physical hides
    // in it — and skipping it silently would be the more tempting mistake, so
    // it is written down rather than absorbed into a fuzzy comparison.
    if (Math.abs(distance - reach) < 1e-9) return;
    assert.equal(envelope.contains(x, z), distance <= reach, `disagreement at ${x}, ${z}`);
  };

  let xs = { min: Infinity, max: -Infinity, zmin: Infinity, zmax: -Infinity };
  for (const point of course.points) {
    xs = {
      min: Math.min(xs.min, point.x), max: Math.max(xs.max, point.x),
      zmin: Math.min(xs.zmin, point.z), zmax: Math.max(xs.zmax, point.z),
    };
  }
  for (let x = xs.min - 30; x <= xs.max + 30; x += 4) {
    for (let z = xs.zmin - 30; z <= xs.zmax + 30; z += 4) check(x, z);
  }

  const rails = new Rails(0);
  for (let metres = 0; metres < course.length; metres += 2) {
    rails.advance(2);
    for (let offset = reach - 1; offset <= reach + 1; offset += 0.1) {
      const left = rails.pose(offset);
      check(left.x, left.z);
      const right = rails.pose(-offset);
      check(right.x, right.z);
    }
  }
});

test('the field outside the venue is not the circuit', () => {
  const envelope = new LapEnvelope(course);
  const rails = new Rails(0);
  // Far enough out that no other part of a 930 m ring can be underneath it —
  // which is the correction the first draft of this test needed: at the hairpin
  // the two legs are so close that fifteen metres sideways is the *other side
  // of the same corner*, and asserting otherwise was asserting the venue was
  // less compact than it is.
  for (let metres = 0; metres < course.length; metres += 5) {
    rails.advance(5);
    for (const offset of [70, -70]) {
      const point = rails.pose(offset);
      if (distanceToRing(point.x, point.z) <= TRACK.halfWidth + TRACK_DAY.offCourseMarginMetres) {
        continue;
      }
      assert.ok(
        !envelope.contains(point.x, point.z),
        `open ground ${offset} m off the circuit at ${metres.toFixed(0)} m reads as on it`,
      );
    }
  }
});

test('the hairpin is an arc in the envelope, not a chord', () => {
  // **The reason `LevelPlan.lap` exists.** A `Segment` keeps two sockets, and a
  // straight line between the hairpin's is 28 m from a 175° arc of radius 14 —
  // six metres from the road at its worst. This asserts the emitted centreline
  // is the arc: every sample is 14 m from the corner's centre, which the chord
  // could never be.
  const envelope = new LapEnvelope(course);
  const hairpin = track.segments.find((segment) => segment.id === 'hairpin')!;
  const chordX = (hairpin.entry.position.x + hairpin.exit.position.x) / 2;
  const chordZ = (hairpin.entry.position.z + hairpin.exit.position.z) / 2;
  // The chord's midpoint is most of a hairpin radius away from any road.
  assert.ok(
    !envelope.contains(chordX, chordZ),
    'the middle of the hairpin’s chord is on the circuit, so the corner is not an arc',
  );
});

test('the paddock is reachable ground and is not the circuit', () => {
  const envelope = new LapEnvelope(course);
  const paddock = track.segments.find((segment) => segment.id === 'paddock')!;
  const centre = {
    x: (paddock.entry.position.x + paddock.exit.position.x) / 2,
    z: (paddock.entry.position.z + paddock.exit.position.z) / 2,
  };
  assert.ok(
    !envelope.contains(centre.x, centre.z),
    'the paddock apron is inside the lap envelope, so a lap could be ridden through it',
  );
});

test('the ring is closed, so the seam at the line is a span like any other', () => {
  const first = course.points[0];
  const last = course.points[course.points.length - 1];
  assert.equal(first.x, last.x);
  assert.equal(first.z, last.z);
  assert.ok(course.points.length > 400, `the ring is only ${course.points.length} points`);
  assert.ok(
    Math.abs(course.length - 930) < 5,
    `the lap measures ${course.length.toFixed(1)} m against the 930 m the layout states`,
  );
});
