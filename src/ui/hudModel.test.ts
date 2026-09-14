/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHALLENGE, CHASE, TRACK_DAY } from '../data/tuning.ts';
import {
  HudModel,
  formatDelta,
  formatRunTime,
  formatSpeed,
  type ChallengeHudInput,
  type HudInput,
  type TrackDayHudInput,
  type TrickRunHudInput,
} from './hudModel.ts';

const RIDING: HudInput = Object.freeze({
  speed: 0,
  powerStage: 'normal' as const,
  overspeed: 0,
  tiltBack: 0,
  offCourse: false,
  crashed: false,
});

/**
 * A chase lane with the boundary quiet — M20.
 *
 * A helper rather than an inline literal because the block grew two fields at
 * M20 and every test that mentions a chase has to state them. The defaults are
 * the ordinary case: inside the corridor, the whole grace unspent, and the
 * route dead ahead.
 */
function chasing(overrides: Partial<NonNullable<HudInput['chase']>> = {}): NonNullable<HudInput['chase']> {
  return {
    remaining: 300,
    straying: false,
    copClose: false,
    strayGrace: CHASE.strayGraceSeconds,
    homeRadians: 0,
    ...overrides,
  };
}

/** A run in progress with nothing to report. Overridden field by field below. */
function running(overrides: Partial<ChallengeHudInput> = {}): ChallengeHudInput {
  return {
    phase: 'running',
    elapsed: 0,
    nextLabel: 'Curb run',
    passed: 0,
    total: 0,
    directionRadians: Number.NaN,
    // No distance by default, so the tests that are about the clock and the
    // dwell assert a bare label. The distance has its own tests below.
    distanceMetres: Number.POSITIVE_INFINITY,
    split: null,
    ...overrides,
  };
}

function at(input: Partial<HudInput>): HudInput {
  return { ...RIDING, ...input };
}

test('speed reads as whole units in the unit the player chose', () => {
  assert.equal(formatSpeed(10, 'kph'), '36');
  assert.equal(formatSpeed(10, 'mph'), '22');
  // Reverse shows its magnitude — the number cannot carry a sign the player
  // would read correctly at a glance, so the HUD says "reversing" separately.
  assert.equal(formatSpeed(-5, 'kph'), '18');
  // A negative that rounds to zero must not print "-0".
  assert.equal(formatSpeed(-0.01, 'kph'), '0');
});

test('reversing is reported apart from the number', () => {
  const hud = new HudModel();
  assert.equal(hud.update(0, at({ speed: -2 })).reversing, true);
  assert.equal(hud.update(0, at({ speed: 2 })).reversing, false);
  // A rider rolling back a few centimetres at a standstill is not reversing.
  assert.equal(hud.update(0, at({ speed: -0.05 })).reversing, false);
});

test('a warning appears immediately and lingers before it clears', () => {
  const hud = new HudModel();

  // Rising is immediate: a warning that waited would arrive after the moment
  // it was about.
  assert.equal(hud.update(0, at({ powerStage: 'warn' })).warning, 'warn');

  // Clearing is held, so a load hovering on a rung cannot strobe the HUD.
  assert.equal(hud.update(0.1, at({ powerStage: 'normal' })).warning, 'warn');
  assert.equal(hud.update(0.5, at({ powerStage: 'normal' })).warning, 'warn');
  assert.equal(hud.update(0.75, at({ powerStage: 'normal' })).warning, 'none');
});

test('a load oscillating on a rung does not flicker the HUD', () => {
  const hud = new HudModel();
  let changes = 0;
  let previous = 'none';

  // 60 updates of a load crossing the notice threshold every other frame.
  for (let i = 0; i < 60; i += 1) {
    const view = hud.update(i / 60, at({ powerStage: i % 2 === 0 ? 'notice' : 'normal' }));
    if (view.warning !== previous) changes += 1;
    previous = view.warning;
  }

  assert.ok(changes <= 2, `the warning changed ${changes} times in a second`);
});

test('an escalation is never held back by the dwell on a lower rung', () => {
  const hud = new HudModel();
  hud.update(0, at({ powerStage: 'notice' }));
  assert.equal(
    hud.update(0.05, at({ powerStage: 'tiltBack' })).warning,
    'tiltBack',
    'the top rung must not wait behind the first one it replaces',
  );
});

test('engaged tilt-back outranks the ladder wording and carries its own line', () => {
  const hud = new HudModel();
  const view = hud.update(0, at({ powerStage: 'warn', tiltBack: 0.4 }));
  assert.equal(view.warning, 'tiltBack');
  assert.match(view.warningLabel, /slow down/i);
  // Once the load is genuinely gone and the dwell has lapsed, so is the line.
  assert.equal(hud.update(1, at({ powerStage: 'normal' })).warningLabel, '');
});

test('a crash clears the contextual cues', () => {
  // The rider on the ground has a different problem than the one the power
  // ladder was describing.
  const hud = new HudModel();
  hud.update(0, at({ powerStage: 'tiltBack', offCourse: true }));
  const view = hud.update(0.1, at({ powerStage: 'tiltBack', offCourse: true, crashed: true }));
  assert.equal(view.warning, 'none');
  assert.equal(view.offRoute, false);
});

test('the off-route hint holds in both directions', () => {
  const hud = new HudModel();
  hud.update(0, at({}));

  assert.equal(hud.update(1, at({ offCourse: true })).offRoute, true);
  // Back on course, but the hint stays up long enough to have been read.
  assert.equal(hud.update(1.5, at({ offCourse: false })).offRoute, true);
  assert.equal(hud.update(2.2, at({ offCourse: false })).offRoute, false);
  // And it will not reappear the instant a wheel clips the boundary again.
  assert.equal(hud.update(2.4, at({ offCourse: true })).offRoute, false);
  assert.equal(hud.update(3.0, at({ offCourse: true })).offRoute, true);
});

test('the objective lane is empty until something writes it', () => {
  // M9 builds the lane; M10's challenge is what fills it.
  const hud = new HudModel();
  assert.equal(hud.update(0, at({})).objective, '');

  hud.setObjective('Free ride');
  assert.equal(hud.update(0, at({})).objective, 'Free ride');
});

test('the shared mode lane names what its value counts', () => {
  const hud = new HudModel();

  const freeRide = hud.update(0, at({}));
  assert.equal(freeRide.modeLabel, '');

  const knockabout = hud.update(0, at({ knockabout: { struck: 2, total: 17 } }));
  assert.equal(knockabout.modeLabel, 'Targets');
  assert.equal(knockabout.knockabout, '2 / 17');

  const chase = hud.update(0, at({
    chase: chasing(),
  }));
  assert.equal(chase.modeLabel, 'Survive');
  assert.equal(chase.chase, '5:00');
});

test('reset forgets the dwell timers', () => {
  const hud = new HudModel();
  hud.update(0, at({ powerStage: 'warn', offCourse: true }));
  hud.reset();
  const view = hud.update(0.01, at({}));
  assert.equal(view.warning, 'none', 'a reset rider is not still being warned');
  assert.equal(view.offRoute, false);
});

test('the unit can change while the game runs', () => {
  const hud = new HudModel({ speedUnit: 'mph' });
  assert.equal(hud.update(0, at({ speed: 10 })).speed, '22');
  hud.setSpeedUnit('kph');
  const view = hud.update(0, at({ speed: 10 }));
  assert.equal(view.speed, '36');
  assert.equal(view.speedUnit, 'kph');
});

// --- The challenge lane, M10 ------------------------------------------------

test('a run clock reads as M:SS.hh at every scale the slice can produce', () => {
  assert.equal(formatRunTime(0), '0:00.00');
  // Sub-second: the minutes and seconds fields still have to be there, or the
  // clock changes width on its very first tick.
  assert.equal(formatRunTime(0.07), '0:00.07');
  assert.equal(formatRunTime(0.5), '0:00.50');
  assert.equal(formatRunTime(9.99), '0:09.99');
  // Exactly a minute is the rollover, and the one an off-by-one gets wrong in
  // both directions: `0:60.00` and `1:00.00` are both one edit away.
  assert.equal(formatRunTime(60), '1:00.00');
  assert.equal(formatRunTime(59.99), '0:59.99');
  assert.equal(formatRunTime(60.01), '1:00.01');
  // Over ten minutes. Minutes are not padded and are allowed to grow.
  assert.equal(formatRunTime(610.25), '10:10.25');
  assert.equal(formatRunTime(3599.99), '59:59.99');
});

test('the clock is immune to the float error a summed 120 Hz step produces', () => {
  // A run clock is a sum of 1/120 s steps, so a "1.23 second" run is really
  // 1.2299999999999998. Truncating would print 1.22 — a timer that is visibly
  // a hundredth slow at arbitrary moments, and splits that do not add up.
  let elapsed = 0;
  for (let i = 0; i < 120; i += 1) elapsed += 1 / 120;
  assert.notEqual(elapsed, 1, 'the premise of this test is that the sum drifts');
  assert.equal(formatRunTime(elapsed), '0:01.00');

  // Two more values that are not exactly representable in binary floating
  // point, and that a `Math.floor` implementation gets wrong by a hundredth.
  assert.equal(formatRunTime(0.07 * 3), '0:00.21');
  assert.equal(formatRunTime(1.23), '0:01.23');
});

test('a clock never shows a negative or a NaN', () => {
  // `NaN:aN.aN` in the corner of the frame is the kind of thing that ends a
  // playtest, and a delta over a zero-length leg upstream can genuinely
  // produce one.
  assert.equal(formatRunTime(Number.NaN), '0:00.00');
  assert.equal(formatRunTime(Number.POSITIVE_INFINITY), '0:00.00');
  assert.equal(formatRunTime(-1.5), '0:00.00');
});

test('a delta carries its sign as a real minus, and no sign when it is even', () => {
  assert.equal(formatDelta(-1.24), '−1.24');
  assert.equal(formatDelta(0.38), '+0.38');
  // The minus must be U+2212 rather than a hyphen: same advance width as the
  // plus in a tabular font, so a run swinging either side of the record does
  // not shuffle its digits sideways once a second.
  assert.equal(formatDelta(-1.24).charCodeAt(0), 0x2212);
  assert.equal(formatDelta(0.38).charCodeAt(0), 0x2b);
  // A delta that rounds to nothing gets no sign. `+0.00` claims the player
  // lost time they did not lose.
  assert.equal(formatDelta(0), '0.00');
  assert.equal(formatDelta(-0.001), '0.00');
});

test('the lane is absent in free ride and costs the same object every frame', () => {
  const hud = new HudModel();
  const first = hud.update(0, at({})).challenge;
  const second = hud.update(1, at({})).challenge;
  assert.equal(first.visible, false);
  assert.equal(first.splitLabel, '');
  // Free ride is most of the game; the switched-off lane is a shared frozen
  // value rather than a fresh object sixty times a second.
  assert.equal(first, second);
});

test('the lane appears the moment a run is armed, before the clock starts', () => {
  const hud = new HudModel();
  const view = hud.update(0, at({ challenge: running({ phase: 'armed', nextLabel: 'Start' }) }));
  assert.equal(view.challenge.visible, true);
  assert.equal(view.challenge.time, '0:00.00');
  // And the player is told what the game is waiting for, because there is no
  // countdown anywhere in this game.
  assert.equal(view.objective, 'Ride to the start line');
});

test('a live run names the checkpoint it is looking for', () => {
  const hud = new HudModel();
  hud.setObjective('Free ride');
  const view = hud.update(0, at({ challenge: running({ nextLabel: 'Park gate', elapsed: 12.5 }) }));
  assert.equal(view.objective, 'Park gate');
  assert.equal(view.challenge.time, '0:12.50');

  // A finished run goes quiet rather than reverting to the free-ride line: the
  // finish is the payoff and the objective lane is not what should be on
  // screen during it.
  assert.equal(hud.update(1, at({ challenge: running({ phase: 'finished' }) })).objective, '');

  // Leaving the run gives the free-ride line back.
  assert.equal(hud.update(2, at({ challenge: running({ phase: 'idle' }) })).objective, 'Free ride');
});

test('a split holds for the tuned dwell and then releases, on the simulation clock', () => {
  const hud = new HudModel();
  const hold = CHALLENGE.splitHoldSeconds;

  // The crossing arrives on exactly one reading. A cue shown for one reading
  // is a cue nobody ever saw, which is why the model owns the dwell.
  const crossed = hud.update(10, at({
    challenge: running({ elapsed: 10, split: { label: 'Curb run', delta: -1.24 } }),
  })).challenge;
  assert.equal(crossed.splitLabel, 'Curb run');
  assert.equal(crossed.splitDelta, '−1.24');
  assert.equal(crossed.ahead, true);

  // Still there most of the way through the dwell, with no further input.
  const midway = hud.update(10 + hold * 0.9, at({
    challenge: running({ elapsed: 10 + hold * 0.9 }),
  })).challenge;
  assert.equal(midway.splitLabel, 'Curb run');

  // And gone once it lapses, so the number is not still sitting in the corner
  // when the next corner needs the player's eyes.
  //
  // One fixed step past the dwell rather than exactly on it, and that is not
  // slack in the assertion: `10 + 2.6 - 10` is 2.5999999999999996 in binary
  // floating point, so the boundary reading itself is genuinely still inside
  // the hold. The cue releases within one 120 Hz step of the tuned value,
  // which is the strongest claim that is actually true.
  const lapsed = 10 + hold + 1 / 120;
  const after = hud.update(lapsed, at({ challenge: running({ elapsed: lapsed }) })).challenge;
  assert.equal(after.splitLabel, '');
  assert.equal(after.splitDelta, '');
  assert.equal(after.ahead, false);
  // The clock keeps reading throughout — only the split goes.
  assert.equal(after.visible, true);
});

test('the dwell is simulation time, so a paused game does not age the split', () => {
  const hud = new HudModel();
  hud.update(5, at({ challenge: running({ elapsed: 5, split: { label: 'Gravel spur', delta: 0.4 } }) }));

  // Twenty readings at the same simulation instant — which is exactly what a
  // paused game drawing frames looks like. Wall time has moved; the clock the
  // dwell reads has not.
  for (let i = 0; i < 20; i += 1) {
    const view = hud.update(5, at({ challenge: running({ elapsed: 5 }) })).challenge;
    assert.equal(view.splitLabel, 'Gravel spur');
  }
});

test('a second checkpoint inside the dwell replaces the first', () => {
  const hud = new HudModel();
  hud.update(0, at({ challenge: running({ split: { label: 'Curb run', delta: -1 } }) }));
  const view = hud.update(0.4, at({
    challenge: running({ elapsed: 0.4, split: { label: 'Park gate', delta: 0.5 } }),
  })).challenge;
  // A rider already past the next gate must not be reading the previous one's
  // delta. Two gates inside one dwell is a fast section, not a bug.
  assert.equal(view.splitLabel, 'Park gate');
  assert.equal(view.splitDelta, '+0.50');
  assert.equal(view.ahead, false);
  // And the replacement restarts the dwell rather than inheriting it.
  assert.equal(
    hud.update(0.4 + CHALLENGE.splitHoldSeconds * 0.9, at({ challenge: running({}) })).challenge.splitLabel,
    'Park gate',
  );
});

test('a leg with no record to compare reads as Best rather than as a blank', () => {
  const hud = new HudModel();
  const view = hud.update(0, at({
    challenge: running({ split: { label: 'The kicker', delta: null } }),
  })).challenge;
  assert.equal(view.splitDelta, 'Best');
  // Good news, so it gets the bright treatment — a first run has no record to
  // be ahead of, and calling that "behind" would be wrong in both directions.
  assert.equal(view.ahead, true);
});

test('a crash keeps the run clock reading and keeps the split it earned', () => {
  const hud = new HudModel();
  hud.update(0, at({
    powerStage: 'tiltBack',
    challenge: running({ split: { label: 'Curb run', delta: -0.2 } }),
  }));

  const view = hud.update(0.2, at({
    crashed: true,
    powerStage: 'tiltBack',
    challenge: running({ elapsed: 30 }),
  }));

  // The ride's own cues go, because they were describing a rider who is no
  // longer on the wheel.
  assert.equal(view.warning, 'none');
  // The run does not: its clock never stopped, and blanking the lane would
  // read as the timer restarting.
  assert.equal(view.challenge.visible, true);
  assert.equal(view.challenge.time, '0:30.00');
  assert.equal(view.challenge.splitLabel, 'Curb run');
});

test('a quick reset mid-split wipes the lane along with the clock', () => {
  const hud = new HudModel();
  hud.update(0, at({ challenge: running({ split: { label: 'Curb run', delta: -0.2 } }) }));

  // `R` during a run puts the challenge back to `armed` with the clock zeroed.
  // A stale delta hanging over the restarted run would be describing a run
  // that no longer exists.
  const view = hud.update(0.1, at({ challenge: running({ phase: 'armed', nextLabel: 'Start' }) }));
  assert.equal(view.challenge.splitLabel, '');
  assert.equal(view.challenge.time, '0:00.00');
});

test('abandoning a run drops the latch, so the next run starts clean', () => {
  const hud = new HudModel();
  hud.update(0, at({ challenge: running({ split: { label: 'Curb run', delta: -0.2 } }) }));
  hud.update(0.1, at({ challenge: running({ phase: 'idle' }) }));

  // Straight back into a new run, well inside what was left of the old dwell.
  const view = hud.update(0.2, at({ challenge: running({ elapsed: 0 }) })).challenge;
  assert.equal(view.splitLabel, '');
});

test('reset forgets the split as well as the ride cues', () => {
  const hud = new HudModel();
  hud.update(0, at({ challenge: running({ split: { label: 'Curb run', delta: -0.2 } }) }));
  hud.reset();
  assert.equal(hud.update(0.01, at({ challenge: running({}) })).challenge.splitLabel, '');
});

test('the objective line carries the distance, in both phases that have one', () => {
  // **The armed phase is the one this exists for.** A rider who has chosen the
  // time trial and is riding *away* from the start line has no other cue that
  // the game is waiting for them — nothing has begun, the clock reads zero and
  // stays there. The distance was originally composed in `app/Game.ts` and
  // used only while running, which lost it in exactly that case.
  const model = new HudModel();

  const armed = model.update(0, at({
    challenge: running({ phase: 'armed', nextLabel: 'Start', distanceMetres: 48 }),
  }));
  assert.equal(armed.objective, 'Ride to the start line · 50 m');

  const away = model.update(1, at({
    challenge: running({ phase: 'armed', nextLabel: 'Start', distanceMetres: 132 }),
  }));
  assert.equal(away.objective, 'Ride to the start line · 130 m', 'riding the wrong way says so');

  const seeking = model.update(2, at({
    challenge: running({ nextLabel: 'Park gate', distanceMetres: 312 }),
  }));
  assert.equal(seeking.objective, 'Park gate · 310 m');

  // A finished run says nothing: the finish is the only thing happening.
  const done = model.update(3, at({
    challenge: running({ phase: 'finished', nextLabel: '', distanceMetres: Infinity }),
  }));
  assert.equal(done.objective, '');
});

test('the distance quantises where the digits actually churn', () => {
  // At 15 m/s a whole-metre readout changes fifteen times a second, which is
  // the same defect as a warning that strobes. The first version quantised to
  // ten metres *above* 100 m and to whole metres below it — the coarse step on
  // the range that already moved slowest.
  const model = new HudModel();
  const objective = (metres: number): string => model.update(0, at({
    challenge: running({ nextLabel: 'Gate', distanceMetres: metres }),
  })).objective;

  assert.equal(objective(0), 'Gate · 0 m');
  assert.equal(objective(12), 'Gate · 10 m');
  assert.equal(objective(13), 'Gate · 15 m');
  // Five metres of travel at top speed is a third of a second, so the number
  // changes about three times a second at the very fastest a rider can move.
  assert.equal(objective(97), 'Gate · 95 m');
  assert.equal(objective(104), 'Gate · 100 m');
  assert.equal(objective(317), 'Gate · 320 m');

  // Nothing sensible to say, rather than `Infinity m`.
  assert.equal(objective(Number.POSITIVE_INFINITY), 'Gate');
  assert.equal(objective(Number.NaN), 'Gate');
});

test('the objective points toward the active gate and numbers the remaining route', () => {
  const model = new HudModel();
  const objective = (directionRadians: number): string => model.update(0, at({
    challenge: running({
      nextLabel: 'Park gate',
      passed: 2,
      total: 6,
      directionRadians,
      distanceMetres: 94,
    }),
  })).objective;

  assert.equal(objective(0), '↑ Park gate · 2/5 · 95 m');
  assert.equal(objective(Math.PI / 2), '← Park gate · 2/5 · 95 m');
  assert.equal(objective(-Math.PI / 2), '→ Park gate · 2/5 · 95 m');
  assert.equal(objective(Math.PI), '↓ Park gate · 2/5 · 95 m');
});

// --- Out of bounds, and the max-speed glyph — M20 ---------------------------

/**
 * §4.4, as assertions.
 *
 * The owner rode off-route in Cop Chase, was warned by one line of small text
 * he called *"super subtle and hard to notice"*, and lost the run to a clock
 * that was never on screen. His fix, in his words: **make the warning obviously
 * visible, point the player back toward the course, and show the countdown** —
 * *"that would be fair"*. The banner these tests describe is that, and the
 * counter-requirement is the standing annoyance rule: prominent once, not
 * nagging.
 */

test('inside the corridor there is no banner at all', () => {
  const hud = new HudModel();
  const view = hud.update(0, at({ chase: chasing() }));
  assert.equal(view.stray.visible, false);
  // And the top-centre line is free for the thing it is actually for.
  assert.equal(view.objective, '');
});

test('crossing the boundary raises the banner immediately, with a way home and a clock', () => {
  const hud = new HudModel();
  const view = hud.update(0, at({
    chase: chasing({ straying: true, strayGrace: 8, homeRadians: Math.PI / 2 }),
  }));

  assert.equal(view.stray.visible, true, 'the warning waited, which is the defect');
  assert.equal(view.stray.label, 'Back to the route');
  assert.equal(view.stray.arrow, '←', 'positive yaw is the rider\'s left');
  assert.equal(view.stray.seconds, '8');
  assert.equal(view.stray.urgent, false, 'eight seconds is not yet a deadline');
});

test('the countdown ceils, so the number reaching zero and the run ending are one moment', () => {
  const hud = new HudModel();
  // Rounding would put `0` on screen for half a second while the run is still
  // alive, and a rider looking at a zero has already stopped trying.
  const nearly = hud.update(0, at({ chase: chasing({ straying: true, strayGrace: 0.4 }) }));
  assert.equal(nearly.stray.seconds, '1');
  assert.equal(nearly.stray.urgent, true, 'the last seconds have to read as the last seconds');
});

test('the bar is the countdown a second time, for a glance too short to read a digit', () => {
  const hud = new HudModel();
  const full = hud.update(0, at({ chase: chasing({ straying: true, strayGrace: CHASE.strayGraceSeconds }) }));
  assert.equal(full.stray.fraction, 1);
  const half = hud.update(0, at({
    chase: chasing({ straying: true, strayGrace: CHASE.strayGraceSeconds / 2 }),
  }));
  assert.ok(Math.abs(half.stray.fraction - 0.5) < 1e-9);
});

test('the old subtle line does not say the same thing underneath the banner', () => {
  const hud = new HudModel();
  const view = hud.update(0, at({ chase: chasing({ straying: true, strayGrace: 5 }) }));
  // Two live copies of one message in two sizes is the M10 results-screen
  // defect. The banner carries it; the objective line goes quiet.
  assert.equal(view.objective, '');
});

test('coming back inside clears it, after just enough dwell to stop it strobing', () => {
  const hud = new HudModel();
  hud.update(0, at({ chase: chasing({ straying: true, strayGrace: 4 }) }));

  // The referee resets the stray clock the instant the corridor is re-entered,
  // so without a dwell a rider tracking the 30 m line would blink a full-width
  // panel several times a second.
  const justBack = hud.update(0.2, at({ chase: chasing() }));
  assert.equal(justBack.stray.visible, true, 'it vanished on the first step back');
  assert.equal(justBack.stray.urgent, false, 'and it must stop pulsing the moment they are safe');

  const settled = hud.update(1.0, at({ chase: chasing() }));
  assert.equal(settled.stray.visible, false, 'it is still there long after they got back');
});

test('leaving the chase takes the banner with it', () => {
  const hud = new HudModel();
  hud.update(0, at({ chase: chasing({ straying: true, strayGrace: 2 }) }));
  assert.equal(hud.update(0.01, at({})).stray.visible, false);
});

test('a crash is not a warning about anything', () => {
  const hud = new HudModel();
  hud.update(0, at({ chase: chasing({ straying: true, strayGrace: 2 }) }));
  const crashed = hud.update(0.01, at({ crashed: true, overspeed: 0.9 }));
  assert.equal(crashed.stray.visible, false);
  assert.equal(crashed.overspeed.visible, false);
});

test('the max-speed glyph is absent for the whole of ordinary riding', () => {
  const hud = new HudModel();
  // Nothing below `EUC.overspeedBeepShare` (0.785) of the derived top speed
  // ever sees this — 52 mph on the shipped 65 mph wheel, and the same share of
  // whatever top speed a `?mph=` diagnostic builds. That share is what keeps it
  // non-annoying: a player pottering about is never told anything.
  assert.equal(hud.update(0, at({ speed: 10 })).overspeed.visible, false);
  assert.equal(hud.update(0, at({ speed: 10, overspeed: 0 })).overspeed.visible, false);
});

test('the glyph blinks at the beep rate, so muted and unmuted see one warning', () => {
  const hud = new HudModel();
  const early = hud.update(0, at({ overspeed: 0.01 })).overspeed;
  const late = hud.update(0, at({ overspeed: 1 })).overspeed;

  assert.equal(early.visible, true);
  assert.equal(early.label, 'Max speed');
  assert.ok(late.pulseSeconds < early.pulseSeconds / 5, 'the blink did not tighten with the beeps');
  // Named, not commanded. Sitting just under the edge is a thing to be good at
  // rather than a mistake, so the cue reports the condition and lets the player
  // decide — the same rule that cut "Missed: Park gate" at M10.
  assert.ok(!/slow/i.test(late.label), 'the HUD is scolding a player for riding well');
});

test('the glyph escalates through three steps rather than shouting from the start', () => {
  const hud = new HudModel();
  assert.equal(hud.update(0, at({ overspeed: 0.1 })).overspeed.level, 'notice');
  assert.equal(hud.update(0, at({ overspeed: 0.5 })).overspeed.level, 'warn');
  assert.equal(hud.update(0, at({ overspeed: 0.95 })).overspeed.level, 'critical');
});

test('the banner and the glyph coexist, because fleeing off-route at speed is a real thing', () => {
  const hud = new HudModel();
  const view = hud.update(0, at({
    overspeed: 0.9,
    chase: chasing({ straying: true, strayGrace: 3, homeRadians: 0 }),
  }));
  assert.equal(view.stray.visible, true);
  assert.equal(view.overspeed.visible, true);
  assert.equal(view.stray.arrow, '↑');
});

test('no route to point at draws no arrow rather than a wrong one', () => {
  const hud = new HudModel();
  // A wrong arrow is worse than none: it is the one part of this banner a
  // player follows without thinking.
  const view = hud.update(0, at({
    chase: chasing({ straying: true, strayGrace: 6, homeRadians: Number.NaN }),
  }));
  assert.equal(view.stray.visible, true);
  assert.equal(view.stray.arrow, '');
  assert.equal(view.stray.seconds, '6', 'and the countdown is still there, which is the load-bearing half');
});

// --- The lap lane, M23 -------------------------------------------------------

/** A track day in progress, with the fields a test usually does not care about. */
function lapping(overrides: Partial<TrackDayHudInput> = {}): TrackDayHudInput {
  return {
    phase: 'running',
    lap: 1,
    elapsed: 0,
    valid: true,
    bestLapSeconds: null,
    lastLapSeconds: null,
    nextLabel: 'Sector 1',
    directionRadians: Number.NaN,
    distanceMetres: Infinity,
    split: null,
    ...overrides,
  };
}

test('the lap lane names the lap above the clock, and the out lap says so', () => {
  const hud = new HudModel();

  const out = hud.update(0, at({ trackDay: lapping({ phase: 'outLap', lap: 0 }) }));
  assert.equal(out.challenge.visible, true);
  assert.equal(out.challenge.lapLabel, 'Out lap');
  assert.equal(out.challenge.time, '0:00.00');

  const flying = hud.update(1, at({ trackDay: lapping({ lap: 3, elapsed: 12.5 }) }));
  assert.equal(flying.challenge.lapLabel, 'Lap 3');
  assert.equal(flying.challenge.time, '0:12.50');
});

test('a lap that will not count says so where the lap is named', () => {
  // Beside the lap it is about, rather than in a cue lane the player reads for
  // a different reason — and it stays there for the rest of the lap, because a
  // rider who has just gone off needs to know the push is over.
  const hud = new HudModel();
  const view = hud.update(0, at({ trackDay: lapping({ lap: 2, valid: false }) }));
  assert.equal(view.challenge.lapLabel, 'Lap 2 · no time');
  const later = hud.update(20, at({ trackDay: lapping({ lap: 2, valid: false, elapsed: 20 }) }));
  assert.equal(later.challenge.lapLabel, 'Lap 2 · no time');
});

test('the last lap and the time to beat both stay on the lane, permanently', () => {
  // **The owner's first session found this**: the finished lap was flashed for
  // four seconds and then the row was given back, so a rider who looked up six
  // seconds after the line saw neither the lap they had just ridden nor the one
  // they were chasing, and reported the lane as resetting itself.
  const hud = new HudModel();
  const first = hud.update(0, at({ trackDay: lapping() }));
  assert.equal(first.challenge.splitLabel, '', 'a first lap has no last lap');
  assert.equal(first.challenge.bestLabel, '', 'and nothing to chase either');

  const going = hud.update(0, at({
    trackDay: lapping({ lap: 3, lastLapSeconds: 63.2, bestLapSeconds: 62.41 }),
  }));
  assert.equal(going.challenge.splitLabel, 'Last');
  assert.equal(going.challenge.splitDelta, '1:03.20');
  assert.equal(going.challenge.bestLabel, 'Best');
  assert.equal(going.challenge.bestValue, '1:02.41');
  assert.equal(going.challenge.ahead, false, 'neither is a delta');

  // And they are still there a full minute later, which is the whole claim.
  const later = hud.update(60, at({
    trackDay: lapping({ lap: 3, elapsed: 40, lastLapSeconds: 63.2, bestLapSeconds: 62.41 }),
  }));
  assert.equal(later.challenge.splitDelta, '1:03.20');
  assert.equal(later.challenge.bestValue, '1:02.41');
});

test('a flash borrows the Last row and never the Best row', () => {
  // The time to beat is the number a rider chasing a lap wants permanently in
  // view, so nothing may take its row — the flash lands one row up, over a
  // value that is repeated on the results card anyway.
  const hud = new HudModel();
  const view = hud.update(5, at({
    trackDay: lapping({
      lap: 2,
      lastLapSeconds: 63.2,
      bestLapSeconds: 62.41,
      split: { kind: 'sector', label: 'Sector 1', delta: -0.42 },
    }),
  }));
  assert.equal(view.challenge.splitLabel, 'Sector 1');
  assert.equal(view.challenge.splitDelta, '−0.42');
  assert.equal(view.challenge.bestLabel, 'Best');
  assert.equal(view.challenge.bestValue, '1:02.41');
});

test('a sector crossing flashes over the time to beat, and gives it back', () => {
  const hud = new HudModel();
  const crossed = hud.update(10, at({
    trackDay: lapping({
      elapsed: 20.5,
      bestLapSeconds: 62.41,
      split: { kind: 'sector', label: 'Sector 1', delta: -0.42 },
    }),
  }));
  assert.equal(crossed.challenge.splitLabel, 'Sector 1');
  assert.equal(crossed.challenge.splitDelta, '−0.42');
  assert.equal(crossed.challenge.ahead, true);

  // Still holding just inside the dwell...
  const holding = hud.update(
    10 + CHALLENGE.splitHoldSeconds - 0.01,
    at({ trackDay: lapping({ elapsed: 22, bestLapSeconds: 62.41 }) }),
  );
  assert.equal(holding.challenge.splitLabel, 'Sector 1');

  // ...and once it lapses the row goes back to the last lap. A hair past
  // rather than exactly on it, because `10 + 2.6` is not 12.6 in binary
  // floating point and a test balanced on the boundary is testing the adder.
  const released = hud.update(
    10 + CHALLENGE.splitHoldSeconds + 0.01,
    at({ trackDay: lapping({ elapsed: 22, lastLapSeconds: 63.2, bestLapSeconds: 62.41 }) }),
  );
  assert.equal(released.challenge.splitLabel, 'Last');
  assert.equal(released.challenge.splitDelta, '1:03.20');
  assert.equal(released.challenge.bestValue, '1:02.41', 'the time to beat never left');
});

test('a lap that counted flashes the lap time, and holds it longer than a sector', () => {
  const hud = new HudModel();
  const view = hud.update(5, at({
    trackDay: lapping({
      lap: 2,
      elapsed: 0.01,
      bestLapSeconds: 62.41,
      split: { kind: 'lap', seconds: 62.41, delta: -0.3 },
    }),
  }));
  assert.equal(view.challenge.splitLabel, 'Lap 1:02.41');
  assert.equal(view.challenge.splitDelta, '−0.30');
  assert.equal(view.challenge.ahead, true);
  assert.equal(view.challenge.lapLabel, 'Lap 2', 'the label already belongs to the new lap');

  // A lap time is the number the rider came for and outlasts a sector split.
  assert.ok(TRACK_DAY.lapHoldSeconds > CHALLENGE.splitHoldSeconds);
  const stillUp = hud.update(
    5 + CHALLENGE.splitHoldSeconds + 0.01,
    at({ trackDay: lapping({ lap: 2, elapsed: 3, lastLapSeconds: 62.41, bestLapSeconds: 62.41 }) }),
  );
  assert.equal(stillUp.challenge.splitLabel, 'Lap 1:02.41');
  const gone = hud.update(
    5 + TRACK_DAY.lapHoldSeconds + 0.01,
    at({ trackDay: lapping({ lap: 2, elapsed: 3, lastLapSeconds: 62.41, bestLapSeconds: 62.41 }) }),
  );
  assert.equal(gone.challenge.splitLabel, 'Last');
  assert.equal(gone.challenge.splitDelta, '1:02.41', 'the lap it just set is still readable');
});

test('a first lap with nothing to compare against reads Best rather than a delta', () => {
  const hud = new HudModel();
  const view = hud.update(0, at({
    trackDay: lapping({ split: { kind: 'lap', seconds: 62.41, delta: null } }),
  }));
  assert.equal(view.challenge.splitLabel, 'Lap 1:02.41');
  assert.equal(view.challenge.splitDelta, 'Best');
  assert.equal(view.challenge.ahead, true);
});

test('a void lap says so once at the line and carries no delta', () => {
  const hud = new HudModel();
  const view = hud.update(0, at({
    trackDay: lapping({ lap: 4, bestLapSeconds: 62.41, split: { kind: 'void' } }),
  }));
  assert.equal(view.challenge.splitLabel, 'No time');
  assert.equal(view.challenge.splitDelta, '', 'a lap that did not count has no delta, and Best would be a lie');
  assert.equal(view.challenge.ahead, false);
});

test('the objective points at the line on the out lap and goes quiet on a flying lap', () => {
  const hud = new HudModel();
  const out = hud.update(0, at({
    trackDay: lapping({
      phase: 'outLap',
      lap: 0,
      distanceMetres: 50,
      directionRadians: 0,
    }),
  }));
  assert.equal(out.objective, '↑ Ride to the start line · 50 m');

  // **Silent while lapping, on purpose.** A circuit tells a rider where to go
  // by being a circuit, and a line naming the next sector three times a lap is
  // the standing rule against anything annoying.
  const flying = hud.update(1, at({
    trackDay: lapping({ distanceMetres: 200, directionRadians: 0 }),
  }));
  assert.equal(flying.objective, '');
});

test('the lap lane and the timed run share one lane and never both fill it', () => {
  const hud = new HudModel();
  // The time trial's own lane carries no lap label, so the DOM row it lives in
  // is hidden and a time trial's lane is the two rows it has always been.
  const timed = hud.update(0, at({ challenge: running({ elapsed: 3 }) }));
  assert.equal(timed.challenge.lapLabel, '');
  assert.equal(timed.challenge.bestLabel, '', 'the timed run has no fourth row either');
  assert.equal(timed.challenge.time, '0:03.00');

  // Track Day wins when both arrive, which cannot happen from `app/Game.ts` and
  // is asserted so that it cannot start happening quietly.
  const both = hud.update(0, at({
    challenge: running({ elapsed: 3 }),
    trackDay: lapping({ elapsed: 9 }),
  }));
  assert.equal(both.challenge.time, '0:09.00');
  assert.equal(both.challenge.lapLabel, 'Lap 1');
});

test('leaving a session drops the flash, so the next run does not inherit it', () => {
  const hud = new HudModel();
  hud.update(0, at({
    trackDay: lapping({ split: { kind: 'lap', seconds: 62.41, delta: -0.3 } }),
  }));
  // Back to free ride, then straight into a timed run inside the dwell.
  hud.update(0.5, at({}));
  const armed = hud.update(1, at({ challenge: running({ phase: 'armed' }) }));
  assert.equal(armed.challenge.splitLabel, '', 'the lap flash survived into a time trial');
});

// ---------------------------------------------------------------------------
// The couch match's lane — M26 Phase 5 (q80)
// ---------------------------------------------------------------------------

test('a match lane reads this seat’s score first, in either half', () => {
  // q80: both scores in every half, so neither player looks across the divider.
  // The two halves therefore show mirrored numbers on purpose — each one is
  // written from the point of view of the person sitting in front of it.
  const model = new HudModel();
  const scores = [{ knockdowns: 3, discs: 0 }, { knockdowns: 1, discs: 0 }];

  const host = model.update(0, {
    ...RIDING,
    match: { seat: 0, target: 5, scores },
  });
  assert.equal(host.knockabout, '3 – 1');
  assert.equal(host.modeLabel, 'You – them (to 5)');

  const guest = new HudModel().update(0, {
    ...RIDING,
    match: { seat: 1, target: 5, scores },
  });
  assert.equal(guest.knockabout, '1 – 3', 'the guest’s half read the host’s score first');
});

test('a match takes the headline from the disc count and gives it the row below', () => {
  // One corner, one *headline* in it. A match is a Knockabout run, so both
  // inputs arrive together and the fight is what is on the line.
  //
  // **The discs are still on screen since 2026-08-28**, one row down, because
  // the owner's couch ride found them nowhere until the match was over: *"No
  // feedback on Targets Struck… It should show in-game below the knockdowns
  // scores."* A side tally that can never win the match is still a thing two
  // people compete over for the whole of it.
  const model = new HudModel();
  const view = model.update(0, {
    ...RIDING,
    knockabout: { struck: 4, total: 17 },
    match: {
      seat: 0,
      target: 5,
      scores: [{ knockdowns: 2, discs: 3 }, { knockdowns: 0, discs: 1 }],
    },
  });
  assert.equal(view.knockabout, '2 – 0');
  assert.notEqual(view.modeLabel, 'Targets');
  assert.equal(view.modeSubLabel, 'Targets');
  assert.equal(view.modeSub, '3 – 1 of 17');
});

test('the row below the score is read from the same end as the score above it', () => {
  // The two rows are one fold read twice (`matchTally`), which is the whole
  // reason `of` is a parameter: two composers would be two chances to disagree
  // about which end of the match a player is sitting at, and q80's rule has to
  // hold in both rows or it holds in neither.
  const scores = [{ knockdowns: 3, discs: 2 }, { knockdowns: 1, discs: 9 }];
  const host = new HudModel().update(0, { ...RIDING, match: { seat: 0, target: 5, scores } });
  const guest = new HudModel().update(0, { ...RIDING, match: { seat: 1, target: 5, scores } });

  assert.equal(host.knockabout, '3 – 1');
  assert.equal(host.modeSub, '2 – 9');
  assert.equal(guest.knockabout, '1 – 3');
  assert.equal(guest.modeSub, '9 – 2', 'the guest’s half read the host’s discs first');
});

test('every ride that is not a match draws no second row at all', () => {
  // Empty rather than zeroed, exactly as the lane above it is absent rather
  // than zeroed: a single-player Knockabout's discs are already its headline,
  // and a chase counts one clock. A second row that repeated the first would
  // be furniture.
  const free = new HudModel().update(0, RIDING);
  assert.equal(free.modeSubLabel, '');
  assert.equal(free.modeSub, '');

  const solo = new HudModel().update(0, { ...RIDING, knockabout: { struck: 2, total: 17 } });
  assert.equal(solo.modeSubLabel, '', 'single-player Knockabout grew a row it does not need');

  const chase = new HudModel().update(0, {
    ...RIDING,
    chase: {
      remaining: 90, straying: false, copClose: false, strayGrace: 0, homeRadians: 0,
    },
  });
  assert.equal(chase.modeSubLabel, '');
});

test('a rider on the floor keeps both rows, because the match did not stop', () => {
  // The crashed branch is a second view builder, and every field it forgets is
  // a field that blinks out at the exact moment a player wants to read it —
  // which in a match is the moment they were knocked down.
  const view = new HudModel().update(0, {
    ...RIDING,
    crashed: true,
    knockabout: { struck: 4, total: 17 },
    match: {
      seat: 1,
      target: 5,
      scores: [{ knockdowns: 2, discs: 3 }, { knockdowns: 0, discs: 1 }],
    },
  });
  assert.equal(view.knockabout, '0 – 2');
  assert.equal(view.modeSub, '1 – 3 of 17');
});

test('a match on a world whose disc count is unknown still shows the two tallies', () => {
  // The total comes off the single-player lane's own input, which is present
  // for every real match — `Game` fills both from the same step. Absent, the
  // row drops the `of 17` rather than the scores: a player watching a fight can
  // do without knowing how much scenery is left, and cannot do without knowing
  // who is winning the thing the row is about.
  const view = new HudModel().update(0, {
    ...RIDING,
    match: {
      seat: 0,
      target: 5,
      scores: [{ knockdowns: 0, discs: 5 }, { knockdowns: 0, discs: 6 }],
    },
  });
  assert.equal(view.modeSub, '5 – 6');
});

test('single-player Knockabout is untouched by the match lane', () => {
  const view = new HudModel().update(0, { ...RIDING, knockabout: { struck: 2, total: 17 } });
  assert.equal(view.knockabout, '2 / 17');
  assert.equal(view.modeLabel, 'Targets');
});

test('the match lane counts every seat, so a wider couch reads for whoever looks', () => {
  // Written as a fold over the other seats rather than as `scores[0]` and
  // `scores[1]`, so the day a four-player couch is measured (§26.7 says it has
  // not been) this lane is already the right shape instead of quietly naming
  // two of four.
  //
  // **M37 answered that day differently, and this test still holds.** The game
  // no longer sends a three-seat match without names (§37.5 forbids the
  // unlabelled fold in a wide room), so what is pinned here is the fold's own
  // arithmetic for a caller that hands over no `riders` — which is every
  // two-seat bout, and is what keeps M26's lane byte-identical.
  const scores = [
    { knockdowns: 1, discs: 7 },
    { knockdowns: 4, discs: 0 },
    { knockdowns: 2, discs: 3 },
  ];
  const view = new HudModel().update(0, { ...RIDING, match: { seat: 2, target: 5, scores } });
  assert.equal(view.knockabout, '2 – 1 – 4');
  assert.equal(view.modeSub, '3 – 7 – 0', 'the row below counts two of four as well');
});

// ---------------------------------------------------------------------------
// The wide bout's rows — M37 §37.5 (three and four riders)
// ---------------------------------------------------------------------------

/** Three riders mid-bout, with names, as `Game` hands them over at N >= 3. */
function threeWay(overrides: Partial<NonNullable<HudInput['match']>> = {}): HudInput {
  return {
    ...RIDING,
    knockabout: { struck: 9, total: 17 },
    match: {
      seat: 1,
      target: 5,
      scores: [
        { knockdowns: 4, discs: 2 },
        { knockdowns: 1, discs: 7 },
        { knockdowns: 4, discs: 0 },
      ],
      riders: ['Cool Rider', 'Trollina', 'Seal on a Wheel'],
      phase: 'running',
      winner: null,
      ...overrides,
    },
  };
}

test('a three-seat bout draws one row per rider, in seat order, named', () => {
  // §37.5: *"a compact list … with one row per actual rider. Each row
  // identifies Player N/character, knockdowns and a clearly labelled
  // subordinate target count. Keep rows in stable seat order."*
  //
  // Seat order, deliberately, and it is asserted against a set of tallies that
  // is **not** in seat order (4/1/4): a list that sorted itself would put seat
  // 1 last here, and four rows changing places in the corner of somebody's eye
  // is exactly what the rule is against. The ranking belongs to the two
  // surfaces read standing still — the room's card and the results table.
  const view = new HudModel().update(0, threeWay());
  assert.equal(view.matchRows.length, 3);
  assert.deepEqual(view.matchRows.map((row) => row.name), [
    'P1 Cool Rider',
    // Seat 1 is this pane's own rider, so its chair is the "You" marker
    // `ui/hud.ts` draws in front of the name and the row does not print `P2` as
    // well — the measurement is in `matchRowViews`.
    'Trollina',
    'P3 Seal on a Wheel',
  ]);
  assert.deepEqual(view.matchRows.map((row) => row.knockdowns), ['4', '1', '4']);
  assert.deepEqual(view.matchRows.map((row) => row.targets), ['2', '7', '0']);
});

test('the pane marks its own rider, and marks exactly one', () => {
  // The flag the stylesheet keys its emphasis off. The *word* is `ui/hud.ts`'s,
  // because §37.5 asks for the mark to be text as well as colour and a data
  // attribute is not text — but which row wears it is decided here, once, so
  // two panes cannot disagree about who is looking.
  for (const seat of [0, 1, 2]) {
    const view = new HudModel().update(0, threeWay({ seat }));
    assert.deepEqual(
      view.matchRows.map((row) => row.you),
      [seat === 0, seat === 1, seat === 2],
      `seat ${seat} did not find itself`,
    );
  }
});

test('the pane\'s own row spends its chair on the marker, and only that row', () => {
  // **The repair the first build needed.** The "You" chip is 24 px of a 134 px
  // name track at the couch's minimum window, so a row printing the chip *and*
  // `P1` was the one row in the list whose rider's name could not fit — it
  // painted `P1 Whee…` while the three rows around it painted whole names, on
  // the row §37.5 most needs to be identifiable. `You` and `P1` answer the same
  // question on this pane, so it is answered once.
  for (const seat of [0, 1, 2]) {
    const rows = new HudModel().update(0, threeWay({ seat })).matchRows;
    const riders = ['Cool Rider', 'Trollina', 'Seal on a Wheel'];
    assert.deepEqual(
      rows.map((row) => row.name),
      riders.map((rider, index) => (index === seat ? rider : `P${index + 1} ${rider}`)),
      `seat ${seat} spelled the room wrong`,
    );
    // And every other pane still shows this seat as a numbered chair, so the
    // room agrees about who P1 is.
    for (const other of [0, 1, 2].filter((index) => index !== seat)) {
      const elsewhere = new HudModel().update(0, threeWay({ seat: other })).matchRows;
      assert.equal(elsewhere[seat].name, `P${seat + 1} ${riders[seat]}`);
    }
  }
});

test('a seat with no roster name is still a row, and says which chair it is', () => {
  // Total rather than skipping: a room of three with a name missing is still a
  // room of three, and a list that dropped the row would renumber everybody
  // below it.
  const view = new HudModel().update(0, threeWay({ seat: 0, riders: ['Cool Rider', '', 'Trollina'] }));
  assert.deepEqual(view.matchRows.map((row) => row.name), [
    'Cool Rider',
    // A nameless chair keeps its number even on the pane's own row: `P2` is all
    // there is to say about it, and "You" alone would be a row with no rider.
    'P2',
    'P3 Trollina',
  ]);
});

test('the wide list replaces the duel lane rather than joining it', () => {
  // §37.5: *"Do not pack unlabeled counts into the old 'You – them' string"* —
  // and the other half of that, which is that the corner must not print both
  // shapes. The headline figure and the second row are both empty here, and
  // `ui/hud.ts` hides each of them when it is.
  const view = new HudModel().update(0, threeWay());
  assert.equal(view.modeLabel, 'Knockdowns \u00b7 first to 5');
  assert.equal(view.knockabout, '', 'the fold printed over the list');
  assert.equal(view.modeSubLabel, '');
  assert.equal(view.modeSub, '');
  // The field's total, once, and not as a per-rider quota.
  assert.equal(view.matchField, '17 targets on the route');
});

test('two seats keep M26’s lane exactly, and draw no rows at all', () => {
  // The regression contract §37.5 names: *"Preserve the N=2 lane."* The switch
  // is the presence of `riders`, so a duel — which is handed none — cannot
  // reach any of the code above.
  const scores = [{ knockdowns: 3, discs: 2 }, { knockdowns: 1, discs: 9 }];
  const view = new HudModel().update(0, {
    ...RIDING,
    knockabout: { struck: 11, total: 17 },
    match: { seat: 0, target: 5, scores },
  });
  assert.deepEqual(view.matchRows, []);
  assert.equal(view.matchField, '');
  assert.equal(view.matchAnnounce, '');
  assert.equal(view.modeLabel, 'You \u2013 them (to 5)');
  assert.equal(view.knockabout, '3 \u2013 1');
  assert.equal(view.modeSubLabel, 'Targets');
  assert.equal(view.modeSub, '2 \u2013 9 of 17');
});

test('every ride that is not a wide bout draws no rows and announces nothing', () => {
  const free = new HudModel().update(0, RIDING);
  assert.deepEqual(free.matchRows, []);
  assert.equal(free.matchField, '');
  assert.equal(free.matchAnnounce, '');

  const solo = new HudModel().update(0, { ...RIDING, knockabout: { struck: 2, total: 17 } });
  assert.deepEqual(solo.matchRows, [], 'a single-player run grew a list');
  assert.equal(solo.matchField, '', 'a single-player run captioned a list it does not draw');
});

test('a rider on the floor keeps the list, because the fight did not stop', () => {
  // The crashed branch is a second view builder and every field it forgets is a
  // field that blinks out at the exact moment a player wants to read it —
  // which in a bout is the moment they were knocked down. M26's own lesson, one
  // shape along.
  const view = new HudModel().update(0, { ...threeWay(), crashed: true });
  assert.equal(view.matchRows.length, 3);
  assert.equal(view.matchRows[1].you, true);
  assert.equal(view.matchField, '17 targets on the route');
});

test('a world whose disc count is unknown draws the rows and no caption', () => {
  // The rows count what each rider struck, which is known; the field's total is
  // a fact about the world, and a caption is better absent than guessed.
  const input = threeWay();
  const view = new HudModel().update(0, { ...input, knockabout: undefined });
  assert.equal(view.matchRows.length, 3);
  assert.deepEqual(view.matchRows.map((row) => row.targets), ['2', '7', '0']);
  assert.equal(view.matchField, '');
});

test('the room is told who leads, once, and told nothing by a knockdown that settles nothing', () => {
  // §37.5's no-storm rule, as arithmetic: the announcement is a pure function
  // of the tallies that changes only when the *lead* does, so `ui/hud.ts`'s
  // diff turns it into an event stream with no second clock to go stale
  // against. Four panes share one region and one sentence.
  const model = new HudModel();
  const quiet = model.update(0, threeWay({
    scores: [{ knockdowns: 0, discs: 0 }, { knockdowns: 0, discs: 0 }, { knockdowns: 0, discs: 0 }],
  }));
  assert.equal(quiet.matchAnnounce, '', 'nil-nil announced a leader');

  const led = model.update(1, threeWay({
    scores: [{ knockdowns: 2, discs: 0 }, { knockdowns: 1, discs: 0 }, { knockdowns: 0, discs: 0 }],
  }));
  assert.equal(led.matchAnnounce, 'Cool Rider leads on 2');

  // A knockdown by somebody who is still behind moves nobody to the front, so
  // the sentence does not change and nothing is announced.
  const behind = model.update(2, threeWay({
    scores: [{ knockdowns: 2, discs: 0 }, { knockdowns: 1, discs: 0 }, { knockdowns: 1, discs: 0 }],
  }));
  assert.equal(behind.matchAnnounce, led.matchAnnounce);
});

test('a shared lead is announced as a shared lead, and match point is said out loud', () => {
  const tied = new HudModel().update(0, threeWay({
    scores: [{ knockdowns: 3, discs: 0 }, { knockdowns: 1, discs: 0 }, { knockdowns: 3, discs: 0 }],
  }));
  assert.equal(tied.matchAnnounce, 'Cool Rider and Seal on a Wheel lead on 3');

  // One knockdown from winning, on a target of five.
  const point = new HudModel().update(0, threeWay({
    scores: [{ knockdowns: 1, discs: 0 }, { knockdowns: 4, discs: 0 }, { knockdowns: 0, discs: 0 }],
  }));
  assert.equal(point.matchAnnounce, 'Trollina leads on 4 \u2014 match point');
});

test('a counted room announces nothing, and an ended one announces the outcome', () => {
  const counting = new HudModel().update(0, threeWay({ phase: 'countdown' }));
  assert.equal(counting.matchAnnounce, '', 'the count has its own announcer');

  const won = new HudModel().update(0, threeWay({
    phase: 'ended',
    winner: 2,
    scores: [{ knockdowns: 4, discs: 0 }, { knockdowns: 1, discs: 0 }, { knockdowns: 5, discs: 0 }],
  }));
  assert.equal(won.matchAnnounce, 'Seal on a Wheel wins');

  // q86/q168: a draw is an ending with nobody in it, and the sentence says so
  // rather than naming a winner the referee refused to name.
  const drawn = new HudModel().update(0, threeWay({
    phase: 'ended',
    winner: null,
    scores: [{ knockdowns: 5, discs: 0 }, { knockdowns: 5, discs: 0 }, { knockdowns: 2, discs: 0 }],
  }));
  assert.equal(drawn.matchAnnounce, 'Match drawn');
});

test('four riders fill four rows and the caller decides who is in them', () => {
  // The list is as long as the room, never as long as `COUCH_SEATS`: a chair
  // nobody is in has no row, which is the same rule the render passes follow.
  const view = new HudModel().update(0, {
    ...RIDING,
    knockabout: { struck: 3, total: 24 },
    match: {
      seat: 3,
      target: 5,
      scores: [
        { knockdowns: 0, discs: 1 },
        { knockdowns: 2, discs: 0 },
        { knockdowns: 1, discs: 2 },
        { knockdowns: 5, discs: 0 },
      ],
      riders: ['Cool Rider', 'Trollina', 'Red Rider', 'Adonisb2'],
      phase: 'running',
      winner: null,
    },
  });
  assert.equal(view.matchRows.length, 4);
  assert.equal(view.matchRows[3].you, true);
  assert.equal(view.matchRows[3].name, 'Adonisb2');
  assert.equal(view.matchRows[0].name, 'P1 Cool Rider');
  assert.equal(view.matchField, '24 targets on the route');
});

/* ---------------------------------------------------------------------------
 * The Trick Run lane — M38 Phase 2, `docs/PLANS.md` §38.6
 *
 * Every claim below is a *content* decision, which is the half of this lane
 * that can be settled without a browser: which words the corner says, which
 * rows exist, and what a number looks like once it is a string. Whether the
 * result fits a 360 px phone and stays clear of the protected middle fifth is
 * geometry and belongs to `tests/m38-hud.spec.ts`, where a real stylesheet can
 * be measured.
 * ------------------------------------------------------------------------ */

function tricking(overrides: Partial<TrickRunHudInput> = {}): TrickRunHudInput {
  return {
    phase: 'running',
    remainingSeconds: 90,
    score: 0,
    best: null,
    pendingPoints: 0,
    lastAward: null,
    cueSecondsLeft: 0,
    ...overrides,
  };
}

function landed(
  overrides: Partial<NonNullable<TrickRunHudInput['lastAward']>> = {},
): NonNullable<TrickRunHudInput['lastAward']> {
  return { kinds: [], landing: 'clean', points: 0, offFeature: false, ...overrides };
}

test('no trick run means no trick run lane, and the corner is left as it was', () => {
  // Absent rather than zeroed, which is the rule every mode lane in this file
  // follows: a ride that is not a trick run draws none of these rows at all,
  // rather than a score of zero on a clock that is not running.
  const view = new HudModel().update(0, at({}));
  assert.equal(view.trickRun.visible, false);
  assert.equal(view.trickRun.best, '');
  assert.equal(view.trickRun.pending, '');
  assert.equal(view.trickRun.awardLabel, '');
  assert.equal(view.trickRun.awardPoints, '');
  assert.equal(view.modeLabel, '', 'free ride still labels nothing');
  assert.equal(view.knockabout, '');
  assert.equal(view.modeSubLabel, '');
});

test('a running trick run says the mode, the banked score and the clock', () => {
  const view = new HudModel().update(0, at({
    trickRun: tricking({ score: 1240, remainingSeconds: 83.4 }),
  }));
  assert.equal(view.trickRun.visible, true);
  assert.equal(view.modeLabel, 'Trick run');
  assert.equal(view.knockabout, '1,240', 'the headline figure is the banked score');
  assert.equal(view.modeSubLabel, 'Time');
  // Ceiled, like every deadline in the game: the number reaching zero and the
  // run ending are the same instant.
  assert.equal(view.modeSub, '1:24');
});

test('the bell renames the figure and takes the clock away', () => {
  // A deadline frozen at 0:00 over a final score is a second number claiming
  // to still be live, and a figure whose caption still says "Trick run" reads
  // as a HUD that has hung rather than as a run that has finished.
  const view = new HudModel().update(0, at({
    trickRun: tricking({ phase: 'ended', remainingSeconds: 0, score: 448 }),
  }));
  assert.equal(view.modeLabel, 'Final score');
  assert.equal(view.knockabout, '448');
  assert.equal(view.modeSubLabel, '');
  assert.equal(view.modeSub, '');
  assert.equal(view.trickRun.visible, true, 'the rows stay until the card arrives');
});

test('pending points are labelled, quiet, and never inflate the banked score', () => {
  const hud = new HudModel();
  const flying = hud.update(0, at({
    trickRun: tricking({ score: 1240, pendingPoints: 225 }),
  }));
  assert.equal(flying.knockabout, '1,240', 'the headline is banked only');
  assert.equal(flying.trickRun.pending, 'Pending +225');

  // Nothing in the air, no row. A pending line with nothing in it would claim
  // a flight that is not happening.
  const grounded = hud.update(1, at({ trickRun: tricking({ score: 1240 }) }));
  assert.equal(grounded.trickRun.pending, '');

  // And the bell ends it whatever the referee's last reading said: a flight
  // still in the air when the clock stops has nowhere to land.
  const over = hud.update(2, at({
    trickRun: tricking({ phase: 'ended', score: 1240, pendingPoints: 225 }),
  }));
  assert.equal(over.trickRun.pending, '');
});

test('the best is the comparable one, and its absence is a sentence rather than a blank', () => {
  const hud = new HudModel();
  const chasing = hud.update(0, at({ trickRun: tricking({ best: 12345 }) }));
  assert.equal(chasing.trickRun.best, 'Best 12,345');

  // Null is a solo rider's first attempt *and* a couch seat, which have no
  // comparable best between them. The words are the solo reading; `game.css`
  // is what keeps the row off a split pane.
  const first = hud.update(1, at({ trickRun: tricking({ best: null }) }));
  assert.equal(first.trickRun.best, 'No best yet');
});

test('a score is grouped in threes, by hand, at every size it can reach', () => {
  // Grouped here rather than by `toLocaleString`, which would spell the same
  // run four ways on four machines and disagree with the results card.
  const hud = new HudModel();
  const cases: readonly (readonly [number, string])[] = [
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1,000'],
    [12345, '12,345'],
    [1234567, '1,234,567'],
    // Nothing in `TRICK_RUN` can produce either, which is exactly why the lane
    // must not print `NaN` or `-40` if something upstream ever does.
    [Number.NaN, '0'],
    [-40, '0'],
  ];
  for (const [points, spelled] of cases) {
    assert.equal(hud.update(0, at({ trickRun: tricking({ score: points }) })).knockabout, spelled);
  }
});

test('the award line shows only while the referee says its dwell is left', () => {
  // The dwell is the referee's, counted in the run's own fixed steps, so the
  // cue freezes with a paused game instead of ageing behind the pause menu.
  // This model keeps no fourth timestamp: the same reading at a later clock is
  // still on screen, and a spent dwell is gone at the same clock.
  const hud = new HudModel();
  const award = landed({ kinds: ['spin-landed', 'one-foot-air'], points: 448 });

  const up = hud.update(0, at({ trickRun: tricking({ lastAward: award, cueSecondsLeft: 2.5 }) }));
  assert.equal(up.trickRun.awardLabel, '180 + One-foot');
  assert.equal(up.trickRun.awardPoints, '+448');

  const paused = hud.update(30, at({
    trickRun: tricking({ lastAward: award, cueSecondsLeft: 2.5 }),
  }));
  assert.equal(paused.trickRun.awardLabel, '180 + One-foot', 'a paused cue does not age');

  const spent = hud.update(0.2, at({
    trickRun: tricking({ lastAward: award, cueSecondsLeft: 0 }),
  }));
  assert.equal(spent.trickRun.awardLabel, '');
  assert.equal(spent.trickRun.awardPoints, '', 'the points go with the words');

  // And a run that has landed nothing yet says nothing, whatever the dwell.
  const nothing = hud.update(0, at({ trickRun: tricking({ cueSecondsLeft: 2.5 }) }));
  assert.equal(nothing.trickRun.awardLabel, '');
});

test('every combination of counted kinds has one short spelling', () => {
  const hud = new HudModel();
  const cases: readonly (readonly [
    readonly ('charged-hop' | 'spin-landed' | 'one-foot-air')[],
    string,
  ])[] = [
    [['charged-hop'], 'Charged hop'],
    [['spin-landed'], '180'],
    [['one-foot-air'], 'One-foot'],
    [['charged-hop', 'spin-landed'], 'Charged hop + 180'],
    [['charged-hop', 'one-foot-air'], 'Charged hop + One-foot'],
    [['spin-landed', 'one-foot-air'], '180 + One-foot'],
    [['charged-hop', 'spin-landed', 'one-foot-air'], 'Charged hop + 180 + One-foot'],
    // The order is the flight's, not the caller's, so one flight reads the
    // same way every time it happens.
    [['one-foot-air', 'spin-landed'], '180 + One-foot'],
    // One flight cannot score a kind twice; a repeat is an upstream fault and
    // printing it twice would dress the fault as a score.
    [['spin-landed', 'spin-landed'], '180'],
  ];
  for (const [kinds, spelled] of cases) {
    const view = hud.update(0, at({
      trickRun: tricking({ lastAward: landed({ kinds, points: 1 }), cueSecondsLeft: 1 }),
    }));
    assert.equal(view.trickRun.awardLabel, spelled);
  }
});

test('a flight with no trick in it is named by its landing, and none of the three scolds', () => {
  // The tricks win the line when there are any; a plain touchdown is how a
  // player learns that landing clean is itself worth something. A heavy or
  // wobbled landing names the condition rather than giving an order — §9e's
  // rule about `MAX SPEED`, arriving through a score.
  const hud = new HudModel();
  const cases: readonly (readonly ['clean' | 'heavy' | 'wobble', string])[] = [
    ['clean', 'Clean landing'],
    ['heavy', 'Heavy landing'],
    ['wobble', 'Wobble landing'],
  ];
  for (const [landing, spelled] of cases) {
    const view = hud.update(0, at({
      trickRun: tricking({ lastAward: landed({ landing, points: 10 }), cueSecondsLeft: 1 }),
    }));
    assert.equal(view.trickRun.awardLabel, spelled);
    assert.equal(view.trickRun.awardPoints, '+10');
  }

  // A forfeited flight still gets its line: the run just spent time on it, and
  // the reason it was worth nothing belongs to the card.
  const forfeit = hud.update(0, at({
    trickRun: tricking({ lastAward: landed({ landing: 'wobble', points: 0 }), cueSecondsLeft: 1 }),
  }));
  assert.equal(forfeit.trickRun.awardPoints, '+0');
});

test('a flight launched off a park feature keeps its tricks on the line and loses their points', () => {
  // M38 q189. The rule is *where the flight launched*, so the corner still
  // names what was ridden — the player did ride it, and dropping the words
  // would read as a missed trick rather than as a rule — and the qualifier
  // says why the number is only the landing's.
  const hud = new HudModel();
  const view = hud.update(0, at({
    trickRun: tricking({
      lastAward: landed({
        kinds: ['spin-landed', 'one-foot-air'],
        points: 10,
        offFeature: true,
      }),
      cueSecondsLeft: 2.5,
    }),
  }));
  assert.equal(view.trickRun.awardLabel, '180 + One-foot · off feature');
  assert.equal(view.trickRun.awardPoints, '+10', 'the clean landing, and nothing else');

  // Joined by a middle dot rather than a fourth ` + `, which is the join that
  // means "and this too scored".
  assert.ok(!view.trickRun.awardLabel.includes('+ off feature'));

  // Every combination carries it, in the flight's own order, after the tricks.
  const cases: readonly (readonly [
    readonly ('charged-hop' | 'spin-landed' | 'one-foot-air')[],
    string,
  ])[] = [
    [['charged-hop'], 'Charged hop · off feature'],
    [['spin-landed'], '180 · off feature'],
    [['one-foot-air'], 'One-foot · off feature'],
    [['charged-hop', 'spin-landed', 'one-foot-air'], 'Charged hop + 180 + One-foot · off feature'],
  ];
  for (const [kinds, spelled] of cases) {
    const line = hud.update(0, at({
      trickRun: tricking({
        lastAward: landed({ kinds, points: 10, offFeature: true }),
        cueSecondsLeft: 1,
      }),
    }));
    assert.equal(line.trickRun.awardLabel, spelled);
  }

  // The feature itself is never named: the rule is "from a feature", and eight
  // ids to chase in a corner is the progression §38.2 forbids.
  assert.ok(!view.trickRun.awardLabel.match(/kicker|ledge|gap|tabletop/i));
});

test('a plain landing is never called off feature, and a feature flight says nothing extra', () => {
  // Two negatives that matter as much as the positive. A touchdown with no
  // trick in it had no trick points to lose, so qualifying it would invent a
  // penalty; and a flight that *did* launch from a feature is the ordinary
  // case, which the corner does not congratulate.
  const hud = new HudModel();
  for (const landing of ['clean', 'heavy', 'wobble'] as const) {
    const plain = hud.update(0, at({
      trickRun: tricking({
        // Off a feature and with no kinds — the composition root will not send
        // this, and the words must be the landing's if anything ever does.
        lastAward: landed({ landing, points: 10, offFeature: false }),
        cueSecondsLeft: 1,
      }),
    }));
    assert.ok(!plain.trickRun.awardLabel.includes('off feature'));
  }

  const onFeature = hud.update(0, at({
    trickRun: tricking({
      lastAward: landed({ kinds: ['spin-landed'], points: 138, offFeature: false }),
      cueSecondsLeft: 1,
    }),
  }));
  assert.equal(onFeature.trickRun.awardLabel, '180');
  assert.equal(onFeature.trickRun.awardPoints, '+138');
});

test('a spent dwell takes the off-feature qualifier with it', () => {
  // The qualifier is part of the label, not a row of its own, so it obeys the
  // referee's dwell exactly as the words it hangs off do.
  const hud = new HudModel();
  const view = hud.update(0, at({
    trickRun: tricking({
      lastAward: landed({ kinds: ['charged-hop'], points: 10, offFeature: true }),
      cueSecondsLeft: 0,
    }),
  }));
  assert.equal(view.trickRun.awardLabel, '');
  assert.equal(view.trickRun.awardPoints, '');
});

test('a trick run empties the run lane rather than sharing its cell', () => {
  // The mode is ridden at a lap-capable park, so a `trackDay` arriving beside
  // it is the plausible mistake — and both draw into the same grid cell, which
  // CSS resolves by stacking them silently on top of each other.
  const hud = new HudModel();
  const view = hud.update(0, at({
    trickRun: tricking({ score: 100 }),
    trackDay: lapping({ lap: 2, elapsed: 30, bestLapSeconds: 62.41 }),
  }));
  assert.equal(view.challenge.visible, false);
  assert.equal(view.knockabout, '100', "and the corner is the trick run's");
  assert.equal(view.modeLabel, 'Trick run');
});

test('the trick run outranks every other referee in the corner', () => {
  // None of these can be live together — the order exists so that a corner is
  // never two modes deep if one of them ever is.
  const view = new HudModel().update(0, at({
    trickRun: tricking({ score: 50 }),
    knockabout: { struck: 3, total: 17 },
    chase: chasing(),
    race: { position: 2, seats: 4, lap: 1, laps: 3, gapSeconds: null, finished: false },
  }));
  assert.equal(view.modeLabel, 'Trick run');
  assert.equal(view.modeSubLabel, 'Time');
  assert.equal(view.matchRows.length, 0);
});

test("a crash keeps the trick run's numbers on screen", () => {
  // Falling off is exactly the moment a player looks at what they had banked,
  // and a lane that blinked out then would hide the answer to the question the
  // crash just asked. The referee decides what a crashed flight forfeits; this
  // file draws what it is handed.
  const view = new HudModel().update(0, at({
    crashed: true,
    trickRun: tricking({ score: 1240, best: 900, remainingSeconds: 12 }),
  }));
  assert.equal(view.trickRun.visible, true);
  assert.equal(view.knockabout, '1,240');
  assert.equal(view.trickRun.best, 'Best 900');
  assert.equal(view.modeSub, '0:12');
});
