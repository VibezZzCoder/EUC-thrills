/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createTrackLevel } from '../level/trackLevel.ts';
import type { LapCourse, LevelPlan } from '../level/plan.ts';
import { RaceRun, type RaceEvent, type RaceRiderInput } from './raceRun.ts';
import { LapEnvelope } from './trackDay.ts';

/**
 * The couch race's referee, tested on the circuit it is for — M27 Phase 2.
 *
 * **The fixture is BelVar itself**, on `trackDay.test.ts`'s argument and for
 * its reasons: a synthetic oval would test the arithmetic and be silent about
 * whether a 175° hairpin sampled into a polyline still orders two riders
 * correctly, or whether the sector gates a level author placed are reachable
 * in the order they were authored. The riders below walk the real emitted
 * centreline, which makes them perfect drivers — a limitation worth naming,
 * because it proves the rules and can say nothing about how a race *feels*.
 * That is the owner's gate (§27.6 Phase 5), and it is deliberately not here.
 *
 * The claims this file exists to hold, in the order §27.6 lists them: the
 * countdown held and released on the fixed step; the grid's first crossing
 * opening lap 1 rather than closing one; every Track Day lap rule re-asserted
 * through this second consumer; leader finish; grace-lap completion; the
 * simultaneous-finish draw; standings order including mid-lap arc length;
 * `seatReset` voiding; and every `RACE.*` knob distinguishable at two
 * far-apart values, because a tunable is only testable by moving it.
 */

const STEP = 1 / 120;

const track: LevelPlan = createTrackLevel();
const course: LapCourse = track.lap!;

function race(plan: LevelPlan = track): RaceRun {
  return new RaceRun(plan.checkpoints, plan.lap ?? null);
}

/**
 * A rider on rails, at a stated lateral offset from the centreline.
 *
 * `trackDay.test.ts`'s fixture, one file along and one rider wider: each seat
 * carries its own, so a race is N of these stepped together rather than one
 * driver the referee is asked about twice.
 */
class Rails {
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
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: x + (dz / length) * offset, z: z - (dx / length) * offset };
  }
}

/** How one seat is riding this leg. */
interface Driver {
  readonly rails: Rails;
  /** Metres a second. Zero is a rider standing still, which is legal. */
  speed: number;
  /** Signed metres off the racing line, or a function of distance. */
  offset: number | ((metres: number) => number);
  /** Set for exactly one step to say this seat teleported. */
  reset: boolean;
}

function driver(startMetres = 0, speed = 20): Driver {
  return { rails: new Rails(startMetres), speed, offset: 0, reset: false };
}

function inputFor(one: Driver): RaceRiderInput {
  const offset = typeof one.offset === 'function' ? one.offset(one.rails.metres) : one.offset;
  const point = one.rails.pose(offset);
  return { x: point.x, y: 0, z: point.z, reset: one.reset };
}

/**
 * Step the whole room for `steps` fixed steps.
 *
 * Every driver advances by its own speed, then the referee is stepped **once**
 * with all of them — which is the shape `Game` uses and the shape the
 * record/decide split needs. A helper that stepped the referee per rider would
 * be testing a referee this project does not have.
 */
function tick(session: RaceRun, drivers: readonly Driver[], steps: number): RaceEvent[] {
  const events: RaceEvent[] = [];
  for (let step = 0; step < steps; step += 1) {
    for (const one of drivers) one.rails.advance(one.speed * STEP);
    events.push(...session.step(STEP, drivers.map(inputFor)));
    for (const one of drivers) one.reset = false;
  }
  return events;
}

/**
 * Ride until `done`, or give up after a sane bound.
 *
 * **Distances on this circuit are not distances from the line.** The rails
 * start at the ring's first sample and BelVar's start line sits about 68 m
 * further on, so "ride 1.02 laps" is not "bank one lap" — a fixture written
 * that way measures the ring's authoring offset rather than the rule it is
 * about. Riding to a condition says what the fixture means.
 */
function rideUntil(
  session: RaceRun,
  drivers: readonly Driver[],
  done: () => boolean,
  maxSeconds = 600,
): void {
  const limit = Math.round(maxSeconds / STEP);
  for (let step = 0; step < limit && !done(); step += 1) tick(session, drivers, 1);
  assert.ok(done(), 'the fixture never reached the state the test is about');
}

/** Ride until every rider has finished, or give up after a sane bound. */
function rideOut(session: RaceRun, drivers: readonly Driver[], maxSeconds = 600): RaceEvent[] {
  const events: RaceEvent[] = [];
  const limit = Math.round(maxSeconds / STEP);
  for (let step = 0; step < limit; step += 1) {
    events.push(...tick(session, drivers, 1));
    if (session.state.phase === 'ended') break;
  }
  return events;
}

// ---------------------------------------------------------------------------
// The start
// ---------------------------------------------------------------------------

test('the countdown is held on the fixed step and released once', () => {
  const session = race();
  session.countdownSeconds = 3;
  session.arm(2);
  assert.equal(session.state.phase, 'countdown');

  const drivers = [driver(), driver(-3)];
  // Two seconds in: still counting, and the clock has not started.
  const early = tick(session, drivers, Math.round(2 / STEP));
  assert.equal(session.state.phase, 'countdown');
  assert.equal(session.state.elapsed, 0);
  assert.deepEqual(
    early.filter((event) => event.kind === 'count').map((event) => event.value),
    [3, 2],
    'the count is shown once per whole second, newest last',
  );

  const released = tick(session, drivers, Math.round(1.5 / STEP));
  assert.equal(session.state.phase, 'running');
  assert.equal(
    released.filter((event) => event.kind === 'go').length,
    1,
    'GO is released exactly once',
  );
  assert.ok(session.state.elapsed > 0, 'the race clock runs from GO');
});

test('a countdown of zero is an instant start, and three is not', () => {
  // M26's rule: a tunable is only testable by moving it, and two extremes must
  // be *distinguishable*. Both of these are legal settings and they differ by
  // three seconds of held grid.
  const instant = race();
  instant.countdownSeconds = 0;
  instant.arm(2);
  const quick = tick(instant, [driver(), driver(-3)], 1);
  assert.equal(instant.state.phase, 'running');
  assert.equal(quick.filter((event) => event.kind === 'go').length, 1);
  assert.deepEqual(quick.filter((event) => event.kind === 'count'), []);

  const held = race();
  held.countdownSeconds = 3;
  held.arm(2);
  tick(held, [driver(), driver(-3)], 1);
  assert.equal(held.state.phase, 'countdown', 'three seconds is not an instant start');
});

test('the grid is behind the line, so the first crossing opens lap 1', () => {
  // §27.3's standing start, and the point is that it needs no new rule: the
  // rider crosses the line moments after GO having found no sector, and the
  // no-sector rule turns that into a restart rather than a closed lap.
  const session = race();
  session.countdownSeconds = 0;
  session.arm(2);
  const drivers = [driver(-4), driver(-8)];
  tick(session, drivers, 1);
  // Ten metres is past the line for both and nowhere near a sector.
  tick(session, drivers, Math.round(10 / (20 * STEP)));

  for (const rider of session.state.riders) {
    assert.equal(rider.lap, 1, 'the out-lap is still lap 1');
    assert.equal(rider.lapsCompleted, 0, 'crossing the line at the start completed nothing');
    assert.equal(rider.finished, false);
  }
});

// ---------------------------------------------------------------------------
// The lap rules, re-asserted through their second consumer
// ---------------------------------------------------------------------------

test('a clean three-lap race counts three laps and ends at the line', () => {
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 3;
  session.arm(2);
  const drivers = [driver(), driver(-6)];
  const events = rideOut(session, drivers);

  assert.equal(session.state.phase, 'ended');
  const result = session.result();
  assert.ok(result !== null);
  assert.equal(result.laps, 3);
  for (const finish of result.order) {
    assert.equal(finish.finished, true, `seat ${finish.seat} did not finish`);
    assert.equal(finish.lapsCompleted, 3, `seat ${finish.seat} counted the wrong laps`);
    assert.ok((finish.bestLapSeconds ?? 0) > 0);
  }
  // The leader is first and the rider six metres behind is second, by the
  // shared clock rather than by seat order.
  assert.deepEqual(result.order.map((finish) => finish.position), [1, 2]);
  assert.equal(result.winner, 0);
  assert.ok((result.order[1].gapSeconds ?? 0) > 0, 'the second rider has a real gap');
  assert.equal(result.order[0].gapSeconds, 0);
  // Six laps in total, one event each, and none of them for a lap that was not
  // counted.
  assert.equal(events.filter((event) => event.kind === 'lap').length, 6);
});

test('one lap and three laps are different races', () => {
  const shortRace = race();
  shortRace.countdownSeconds = 0;
  shortRace.laps = 1;
  shortRace.arm(2);
  rideOut(shortRace, [driver(), driver(-6)]);
  const short = shortRace.result();

  const longRace = race();
  longRace.countdownSeconds = 0;
  longRace.laps = 3;
  longRace.arm(2);
  rideOut(longRace, [driver(), driver(-6)]);
  const long = longRace.result();

  assert.equal(short?.order[0].lapsCompleted, 1);
  assert.equal(long?.order[0].lapsCompleted, 3);
  assert.ok(
    (long?.seconds ?? 0) > (short?.seconds ?? 0) * 2,
    'three laps must take appreciably longer than one',
  );
});

test('a lap that cut the course does not count toward the distance', () => {
  // The Track Day rule, and the reason a race needs it *harder*: a cut lap
  // there costs a time, and a cut lap here would otherwise be the quickest way
  // to the chequered flag. Forty metres off the line is through the barrier —
  // so this is the `off-course` void doing the counting-out. (Until the
  // 2026-08-31 QA pass this test claimed to be about the *sector* rule, which
  // it never touched: a rider that far out is off-course long before any gate
  // is missed. The on-course sector skip has its own fixture below.)
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 3;
  session.arm(2);
  const cutter = driver();
  const honest = driver(-2);
  cutter.offset = (metres) => (metres % course.length > 60 && metres % course.length < 260 ? 40 : 0);
  const drivers = [cutter, honest];
  tick(session, drivers, Math.round(120 / STEP));

  const [cut, clean] = session.state.riders;
  assert.ok(
    clean.lapsCompleted > cut.lapsCompleted,
    `cutting counted ${cut.lapsCompleted} laps against ${clean.lapsCompleted} ridden honestly`,
  );
});

test('running wide onto the verge is legal, and through the barrier is not', () => {
  // The envelope's own rule, restated where a race reads it: the verge is
  // inside the corridor and a referee that deleted laps for it would be
  // deleting laps for ordinary racing.
  const wide = race();
  wide.countdownSeconds = 0;
  wide.arm(2);
  const verge = driver();
  verge.offset = 4;
  tick(wide, [verge, driver(-2)], Math.round(90 / STEP));
  assert.ok(
    wide.state.riders[0].lapsCompleted > 0,
    'a wide but legal line lost its lap',
  );

  // **Off the circuit voids the lap, and the void is what stops it counting.**
  // Stated separately from the sector rule and against a rider who crosses
  // every gate: a detour through the barrier that rejoins in time to find both
  // sectors would otherwise be a lap the referee had no reason to refuse.
  const outside = race();
  outside.countdownSeconds = 0;
  outside.laps = 3;
  outside.arm(2);
  const strayed = driver();
  const clean = driver(-2);
  // Twelve metres out for a short stretch of straight — through the barrier,
  // back on before the next gate.
  strayed.offset = (metres) => (metres % course.length > 20 && metres % course.length < 45 ? 14 : 0);
  const drivers = [strayed, clean];
  rideUntil(outside, drivers, () => outside.state.riders[1].lapsCompleted >= 1);
  tick(outside, drivers, Math.round(40 / (20 * STEP)));
  assert.ok(
    outside.state.riders[0].lapsCompleted < outside.state.riders[1].lapsCompleted,
    'a lap that left the circuit counted anyway',
  );
});

test('a sector skipped on the circuit voids the lap — the double-back exploit', () => {
  // **The on-course skip, which the off-course fixture above cannot see.** A
  // rider who crosses the first gate, turns round, and rides back to the line
  // never leaves the legal envelope — and until the 2026-08-31 QA pass the
  // referee banked that "lap": `missed-sector` was declared and never
  // assigned, so doubling back minted laps a few dozen metres long. The rule
  // is `TrackDayRun.closeLap`'s, applied before anything is banked.
  const envelope = new LapEnvelope(course);
  const line = track.checkpoints.slice().sort((a, b) => a.routeIndex - b.routeIndex);
  const lineAt = envelope.progressAt(line[0].centre.x, line[0].centre.z);
  const firstGate = envelope.progressAt(line[1].centre.x, line[1].centre.z);

  const session = race();
  session.countdownSeconds = 0;
  session.laps = 3;
  session.arm(2);
  const cheat = driver();
  const honest = driver(-2);
  const drivers = [cheat, honest];

  // Forward through the line and the first gate, then straight back over the
  // line — on the racing line the whole way.
  rideUntil(session, drivers, () => cheat.rails.metres > firstGate + 12);
  cheat.speed = -20;
  rideUntil(session, drivers, () => cheat.rails.metres < lineAt - 25);
  cheat.speed = 20;

  assert.equal(
    session.state.riders[0].lapsCompleted,
    0,
    'doubling back over the line minted a lap',
  );
  // The honest rider is untouched — and given time, still banks real laps.
  rideUntil(session, drivers, () => session.state.riders[1].lapsCompleted >= 1);
  assert.equal(session.state.riders[0].voided, null, 'the void outlived the lap it was about');
});

test('a reset costs the lap and nothing else — §27.3, and §21.10 q43 closed', () => {
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 3;
  session.arm(2);
  const quitter = driver();
  const rival = driver(-2);
  tick(session, [quitter, rival], Math.round(20 / STEP));

  quitter.reset = true;
  tick(session, [quitter, rival], 1);
  assert.equal(session.state.riders[0].voided, 'reset');
  // It is self-harm and nothing more: the other rider's lap is untouched.
  assert.equal(session.state.riders[1].voided, null);

  // And the punishment is the no-sector rule doing its job — the lap they were
  // on cannot count, so they have to go round again.
  const before = session.state.riders[0].lapsCompleted;
  tick(session, [quitter, rival], Math.round(90 / STEP));
  const after = session.state.riders[0];
  assert.ok(
    after.lapsCompleted <= before + 1,
    'the voided lap counted anyway',
  );
});

// ---------------------------------------------------------------------------
// The finish
// ---------------------------------------------------------------------------

test('the leader’s finish ends the race and the rest finish the lap they are on', () => {
  // q89's kart convention, chosen over an instant end so the card carries real
  // times and real gaps. The straggler here is a whole half-lap down.
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 2;
  session.finishGraceSeconds = 0;
  session.arm(2);
  const leader = driver();
  const straggler = driver(-6, 12);
  rideOut(session, [leader, straggler]);

  const result = session.result();
  assert.ok(result !== null);
  assert.equal(result.winner, 0);
  const behind = result.order.find((finish) => finish.seat === 1);
  assert.ok(behind !== undefined);
  assert.equal(behind.finished, true, 'the straggler was cut off rather than finishing their lap');
  assert.ok(
    (behind.seconds ?? 0) > (result.order[0].seconds ?? 0),
    'the straggler finished before the leader',
  );
  assert.ok((behind.gapSeconds ?? 0) > 0);
});

test('a finish grace ends the race for anybody still out, and zero does not', () => {
  // The tunable moved, both ways. Zero is the shipped value and switches the
  // cap off; five seconds is a cap the straggler cannot beat.
  const capped = race();
  capped.countdownSeconds = 0;
  capped.laps = 2;
  capped.finishGraceSeconds = 5;
  capped.arm(2);
  const cappedStraggler = driver(-6, 8);
  rideOut(capped, [driver(), cappedStraggler]);
  const cappedResult = capped.result();
  assert.ok(cappedResult !== null);
  const cut = cappedResult.order.find((finish) => finish.seat === 1);
  assert.equal(cut?.finished, false, 'a five-second grace let a half-lap straggler finish');
  assert.equal(cut?.seconds, null);
  assert.equal(cut?.position, 2, 'an unfinished rider is still classified, by progress');

  const uncapped = race();
  uncapped.countdownSeconds = 0;
  uncapped.laps = 2;
  uncapped.finishGraceSeconds = 0;
  uncapped.arm(2);
  rideOut(uncapped, [driver(), driver(-6, 8)]);
  const waited = uncapped.result();
  assert.equal(
    waited?.order.find((finish) => finish.seat === 1)?.finished,
    true,
    'zero grace must wait for the field',
  );
});

test('the flag reaches a rider crossing on the leader’s own step', () => {
  // **The 2026-08-31 QA pass's first P1.** `leaderFinishedAt` is written by
  // `decide`, after every seat has recorded — so a trailer whose line
  // crossing shared the leader's step used to be recorded before the race
  // knew it had a leader, open another lap, and ride a whole extra one while
  // a zero-grace race sat running. Two identical riders, one of whom binned
  // their first lap with a reset: every crossing after that is simultaneous,
  // and the leader's last one is the trailer's flag.
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 2;
  session.finishGraceSeconds = 0;
  session.arm(2);
  const leader = driver();
  const trailer = driver();
  const drivers = [leader, trailer];

  // Past the line and rolling, then the trailer bins the lap they are on.
  rideUntil(session, drivers, () => session.state.riders[1].lap >= 1
    && trailer.rails.metres > 100);
  trailer.reset = true;
  tick(session, drivers, 1);
  assert.equal(session.state.riders[1].voided, 'reset', 'the fixture never voided the lap');

  const result = (() => {
    rideOut(session, drivers);
    return session.result();
  })();
  assert.ok(result !== null, 'the race never ended — the same-step crossing was missed');

  // Ended on the leader's own finish step: the race clock stopped at the
  // winning time, not a lap later.
  assert.equal(result.winner, 0);
  assert.deepEqual(result.order.map((finish) => finish.position), [1, 2]);
  assert.equal(result.seconds, result.order[0].seconds);
  const flagged = result.order.find((finish) => finish.seat === 1);
  assert.ok(flagged !== undefined);
  assert.equal(flagged.finished, true);
  assert.equal(flagged.lapsCompleted, 1, 'the voided lap counted after all');
  // Same clock, fewer laps: a place behind, never a draw — laps are compared
  // before the clock is.
  assert.equal(flagged.seconds, result.order[0].seconds);
  assert.equal(flagged.gapSeconds, 0);
});

test('a rider flagged off a voided lap classifies behind the laps they lost', () => {
  // **The voided trailing lap, decided** (QA repair, 2026-08-31): a crossing
  // at or after the leader's finish always ends your race — the void's whole
  // punishment is that the lap did not count — and the classification is laps
  // that counted, then the clock. The rider who reset crosses *earlier* than
  // the honest rider a lap up on them, and must still finish behind.
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 1;
  session.finishGraceSeconds = 0;
  session.arm(3);
  const winner = driver(0, 25);
  const honest = driver(0, 15);
  const resetter = driver(0, 18);
  const drivers = [winner, honest, resetter];

  // The resetter is mid-lap — past the line, nowhere near finishing — when
  // they bin it.
  rideUntil(session, drivers, () => resetter.rails.metres > 150);
  resetter.reset = true;
  tick(session, drivers, 1);

  const result = (() => {
    rideOut(session, drivers);
    return session.result();
  })();
  assert.ok(result !== null);
  assert.equal(result.winner, 0);

  const second = result.order[1];
  const third = result.order[2];
  assert.equal(second.seat, 1, 'the honest rider lost their place to a voided lap');
  assert.equal(third.seat, 2);
  assert.equal(third.finished, true, 'the flag never reached the voided crossing');
  assert.equal(third.lapsCompleted, 0);
  assert.ok(
    (third.seconds ?? 0) < (second.seconds ?? 0),
    'the fixture must make the voided rider cross first, or it proves nothing',
  );
});

/**
 * The three riders the position lock is argued over — BelVar's own numbers.
 *
 * The lap is 929.5 m and the rails start 68 m short of the line, so the
 * crossings land at 68 m (the out lap opens), 997.5 m (lap 1 banks) and
 * 1927 m (lap 2 banks). At 25, 15 and 10 metres a second that puts the
 * winner home at ~77 s, the resetter at the line at ~100 s with nothing to
 * show for it, and the honest rider — a lap in the bank — still out until
 * ~128 s. **The window between 100 s and 128 s is the whole test**: one rider
 * home with nothing, one rider out with something.
 */
function lockFixture(session: RaceRun): Driver[] {
  session.countdownSeconds = 0;
  session.laps = 2;
  session.arm(3);
  return [driver(0, 25), driver(0, 15), driver(0, 10)];
}

test('a place stops moving once the flag falls — even a place given away', () => {
  // **q97's lock, and the second QA pass's P1** (2026-08-31). The comparator
  // asked `finished` before it asked how many laps had counted, so a rider
  // waved home off a voided lap was lifted over the honest rider still out on
  // a lap they had banked — and dropped again the moment that rider crossed.
  // "Finished · 2nd" on a pane is a promise; this holds it before *and* after.
  const session = race();
  session.finishGraceSeconds = 0;
  const drivers = lockFixture(session);
  const [, , resetter] = drivers;

  rideUntil(session, drivers, () => session.state.riders[0].finished);
  assert.equal(session.state.riders[1].lapsCompleted, 1, 'the honest rider must have a lap in the bank');
  assert.equal(session.state.riders[2].lapsCompleted, 0, 'the resetter must not have reached the line yet');

  // They bin it, so the lap they are about to close counts for nothing — and
  // the leader is already home, so that crossing ends their race (q89).
  resetter.reset = true;
  tick(session, drivers, 1);
  rideUntil(session, drivers, () => session.state.riders[2].finished);

  const flagged = session.state.riders;
  assert.equal(flagged[1].finished, false, 'the honest rider came home too, and the window is gone');
  assert.equal(flagged[2].lapsCompleted, 0, 'the void did not cost the lap');
  assert.deepEqual(
    flagged.map((rider) => rider.position),
    [1, 2, 3],
    'a rider home with nothing was handed the honest rider\'s place',
  );
  const locked = flagged[2].position;

  rideOut(session, drivers);
  const result = session.result();
  assert.ok(result !== null);
  assert.deepEqual(result.order.map((row) => row.seat), [0, 1, 2]);
  assert.deepEqual(result.order.map((row) => row.position), [1, 2, 3]);
  assert.equal(
    session.state.riders[2].position,
    locked,
    'the place moved under a rider who had already finished',
  );
});

test('a lap in the bank outranks a rider home with nothing, grace or no grace', () => {
  // The same window, closed by a finite grace instead of by the honest rider
  // — because a card is permanent and a pane is not. The grace is set between
  // the resetter's crossing (~23 s after the leader) and the honest rider's
  // (~51 s), so the race stops with one rider home holding nothing and one
  // rider out holding a lap. **A Did-not-finish who banked more laps is
  // classified ahead of a finisher who banked fewer** — the trade
  // `compareBooks` names, stated here so it is a decision and not a surprise.
  const session = race();
  session.finishGraceSeconds = 30;
  const drivers = lockFixture(session);
  const [, , resetter] = drivers;

  rideUntil(session, drivers, () => session.state.riders[0].finished);
  resetter.reset = true;
  tick(session, drivers, 1);
  rideUntil(session, drivers, () => session.state.riders[2].finished);
  assert.equal(session.state.riders[1].finished, false);

  rideOut(session, drivers);
  const result = session.result();
  assert.ok(result !== null, 'the grace never spent, so the card never came');
  assert.deepEqual(result.order.map((row) => row.seat), [0, 1, 2]);
  assert.deepEqual(result.order.map((row) => row.finished), [true, false, true]);
  assert.deepEqual(result.order.map((row) => row.lapsCompleted), [2, 1, 0]);
  assert.equal(result.order[1].position, 2, 'the lap they banked did not count for their place');
});

test('the gap is live once there is a leader to be behind, and freezes at the line', () => {
  // The HUD's gap row promised "once there is one to be behind" and the old
  // referee only answered for riders who had themselves finished — so the row
  // showed a rider count right through the minute it existed for (QA repair,
  // 2026-08-31). Counting up while out, frozen by the crossing, no jump.
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 1;
  session.finishGraceSeconds = 0;
  session.arm(2);
  const leader = driver(0, 25);
  const straggler = driver(0, 10);
  const drivers = [leader, straggler];

  rideUntil(session, drivers, () => session.state.riders[0].finished);
  const early = session.state.riders[1].gapSeconds;
  assert.ok(early !== null, 'no live gap the step the leader finished');
  tick(session, drivers, 120);
  const later = session.state.riders[1].gapSeconds;
  assert.ok(later !== null && later > early, 'the live gap is not counting');
  assert.ok(Math.abs(later - early - 1) < 1e-6, 'the live gap runs on the race clock');

  rideOut(session, drivers);
  const result = session.result();
  const behind = result?.order.find((finish) => finish.seat === 1);
  assert.ok(behind !== undefined && behind !== null);
  assert.equal(
    behind.gapSeconds,
    (behind.seconds ?? 0) - (result?.order[0].seconds ?? 0),
    'the frozen gap is not the finish-time difference',
  );
  assert.ok((behind.gapSeconds ?? 0) >= later, 'the gap jumped backwards at the line');
});

test('progress runs forward through the line and the ring’s own seam', () => {
  // Two defects, one sweep (QA repair, 2026-08-31): progress used to be
  // measured from the envelope's first *sample* — a spot 70 m before the line
  // — so it wrapped to zero at the seam, a lap early, once per lap; and on
  // the banking step it was written before the lap was, so crossing the line
  // read as losing a lap for one step. Signed from the line, recomputed after
  // the bank, it must never run backwards for a rider riding forwards.
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 3;
  session.arm(2);
  const drivers = [driver(), driver(-4)];
  // Two steps: the first is GO itself — the countdown branch returns before
  // anything is recorded — and the second is the first recorded position.
  tick(session, drivers, 2);

  let last = session.state.riders[0].progressMetres;
  assert.ok(last < 0, 'the grid is behind the line, so progress starts negative');
  let worst = 0;
  rideUntil(session, drivers, () => {
    const now = session.state.riders[0].progressMetres;
    worst = Math.min(worst, now - last);
    last = now;
    return session.state.riders[0].lapsCompleted >= 2;
  });
  assert.ok(
    worst > -1e-6,
    `progress ran backwards by ${(-worst).toFixed(1)} m on a forward-riding lap`,
  );
  assert.ok(last > course.length, 'two banked laps must read as more than one lap of progress');
});

test('two riders who close the final lap on one step share the position', () => {
  // q86's discipline, inherited: finishes are recorded as the seats step and
  // the standings are decided after every seat has stepped, so a genuine dead
  // heat is a draw rather than a race won by whichever seat was visited first.
  // No tie-break is invented, because the tie is not an artefact.
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 2;
  session.arm(2);
  // Identical rails, identical speed: level all the way round.
  const result = (() => {
    rideOut(session, [driver(), driver()]);
    return session.result();
  })();

  assert.ok(result !== null);
  assert.equal(result.winner, null, 'a dead heat has no winner');
  assert.deepEqual(result.order.map((finish) => finish.position), [1, 1]);
  assert.equal(result.order[0].seconds, result.order[1].seconds);
  // A draw is still a card — the screen has to name it.
  assert.equal(result.order.length, 2);
});

test('the seat a finish is recorded in cannot decide the race', () => {
  // The other half of the record/decide split, stated the way
  // `knockaboutMatch.test.ts` states it: reverse the seats and the same two
  // riders must produce the same answer.
  const forwards = race();
  forwards.countdownSeconds = 0;
  forwards.laps = 1;
  forwards.arm(2);
  rideOut(forwards, [driver(), driver(-6)]);

  const backwards = race();
  backwards.countdownSeconds = 0;
  backwards.laps = 1;
  backwards.arm(2);
  rideOut(backwards, [driver(-6), driver()]);

  assert.equal(forwards.result()?.winner, 0);
  assert.equal(backwards.result()?.winner, 1, 'the win followed the seat rather than the rider');
});

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

test('mid-lap standings are ordered by distance round the lap, not by seat', () => {
  // The question the envelope grew `progressAt` for. Three riders spread round
  // the circuit, none of them finished, and the order has to be the one a
  // spectator would give.
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 3;
  session.arm(3);
  const drivers = [driver(0), driver(-120), driver(-60)];
  tick(session, drivers, Math.round(20 / STEP));

  const riders = session.state.riders;
  assert.equal(riders[0].position, 1, 'the rider furthest round is not leading');
  assert.equal(riders[2].position, 2);
  assert.equal(riders[1].position, 3);
  assert.ok(riders[0].progressMetres > riders[2].progressMetres);
  assert.ok(riders[2].progressMetres > riders[1].progressMetres);
  // And a lap already banked outranks any distance on the current one.
  assert.ok(riders.every((rider) => rider.progressMetres >= 0));
});

test('a lap banked outranks a rider further round the current one', () => {
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 3;
  session.arm(2);
  // **The fixture is the interesting case rather than the easy one.** After a
  // lap and a fraction, the leader has banked one lap and is barely past the
  // line; the other has banked none and is nearly all the way round their
  // first. A standings order that read the current lap alone would put the
  // second rider in front, which is the defect this asserts against — so the
  // check below is that the *lap fraction* really is inverted.
  const ahead = driver(0);
  const behind = driver(-(course.length * 0.12));
  const drivers = [ahead, behind];
  rideUntil(session, drivers, () => session.state.riders[0].lapsCompleted === 1);
  // A little further, so the leader is *past* the line rather than on it.
  tick(session, drivers, Math.round(40 / (20 * STEP)));

  const riders = session.state.riders;
  assert.equal(riders[0].lapsCompleted, 1, 'the fixture did not bank the leader a lap');
  assert.equal(riders[1].lapsCompleted, 0, 'the fixture banked the chaser a lap too');
  const lapFraction = (metres: number) => metres % course.length;
  assert.ok(
    lapFraction(riders[1].progressMetres) > lapFraction(riders[0].progressMetres),
    'the fixture must put the chaser further round the *current* lap',
  );
  assert.equal(riders[0].position, 1);
  assert.equal(riders[1].position, 2);
  assert.ok(riders[0].progressMetres > riders[1].progressMetres);
});

// ---------------------------------------------------------------------------
// Refusals, lifecycle, determinism
// ---------------------------------------------------------------------------

test('one seat is not a race, and neither is a world without a lap', () => {
  const solo = race();
  solo.arm(1);
  assert.equal(solo.state.phase, 'idle', 'one rider on a circuit is a Track Day');
  solo.arm(0);
  assert.equal(solo.state.phase, 'idle');

  const noLap = new RaceRun(track.checkpoints, null);
  assert.equal(noLap.available, false);
  noLap.arm(4);
  assert.equal(noLap.state.phase, 'idle', 'a world with no closed circuit armed a race');
});

test('arming a second race inherits nothing from the first', () => {
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 1;
  session.arm(2);
  rideOut(session, [driver(), driver(-6)]);
  assert.ok(session.result() !== null);

  session.arm(3);
  assert.equal(session.state.phase, 'countdown');
  assert.equal(session.state.elapsed, 0);
  assert.equal(session.result(), null, 'the previous race’s card survived a re-arm');
  assert.equal(session.state.riders.length, 3);
  for (const rider of session.state.riders) {
    assert.equal(rider.lapsCompleted, 0);
    assert.equal(rider.finished, false);
  }
});

test('abandoning a decided race takes the card with it', () => {
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 1;
  session.arm(2);
  rideOut(session, [driver(), driver(-6)]);
  assert.ok(session.result() !== null);
  session.abandon();
  assert.equal(session.state.phase, 'idle');
  assert.equal(session.result(), null);
  assert.deepEqual(session.state.riders, []);
});

test('a finished race is a copy, so a later one cannot rewrite it', () => {
  const session = race();
  session.countdownSeconds = 0;
  session.laps = 1;
  session.arm(2);
  rideOut(session, [driver(), driver(-6)]);
  const card = session.result();
  assert.ok(card !== null);
  const winner = card.winner;
  const first = card.order[0].seconds;

  session.arm(2);
  rideOut(session, [driver(-6), driver()]);
  assert.equal(card.winner, winner, 'the old card moved');
  assert.equal(card.order[0].seconds, first);
});

test('identical inputs produce an identical race', () => {
  // `advance(n)` has to reproduce a start byte for byte, which is the whole
  // reason the countdown runs on the fixed step and nothing here reads a
  // clock.
  const play = () => {
    const session = race();
    session.countdownSeconds = 3;
    session.laps = 1;
    session.arm(3);
    const events = rideOut(session, [driver(), driver(-6), driver(-14)]);
    return {
      events: events.map((event) => `${event.kind}:${event.seat}:${event.value}:${event.seconds}`),
      result: session.result(),
    };
  };
  const first = play();
  const second = play();
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.result, second.result);
});

test('a race steps nothing before it is armed and nothing after it has ended', () => {
  const session = race();
  assert.deepEqual(session.step(STEP, []), []);
  assert.equal(session.state.elapsed, 0);

  session.countdownSeconds = 0;
  session.laps = 1;
  session.arm(2);
  rideOut(session, [driver(), driver(-6)]);
  const settled = session.state.elapsed;
  tick(session, [driver(), driver(-6)], 60);
  assert.equal(session.state.elapsed, settled, 'the clock ran on after the race ended');
});
