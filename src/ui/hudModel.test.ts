/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHALLENGE, CHASE } from '../data/tuning.ts';
import {
  HudModel,
  formatDelta,
  formatRunTime,
  formatSpeed,
  type ChallengeHudInput,
  type HudInput,
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
  // Nothing below 40 mph ever sees this, which is what keeps it non-annoying:
  // a player pottering about is never told anything.
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
