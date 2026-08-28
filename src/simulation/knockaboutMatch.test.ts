/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { KNOCKABOUT, SIMULATION } from '../data/tuning.ts';
import { KnockaboutMatch } from './knockaboutMatch.ts';

/**
 * The couch match's rules, tested where they live.
 *
 * Everything below runs with no browser, no canvas and no `Game` — which is the
 * payoff of the referee being its own file rather than fifteen more lines in a
 * seven-thousand-line composition root. What it cannot claim is that the right
 * facts arrive: that a knockdown is really a strike-caused crash and that the
 * seat credited really swung is `tests/m26.spec.ts`'s job, because it needs two
 * riders and a paddle in a running game.
 */

const STEP = 1 / SIMULATION.hz;

/** A match already under way between two seats. */
function match(): KnockaboutMatch {
  const referee = new KnockaboutMatch();
  referee.arm(2);
  return referee;
}

/** Score `count` knockdowns for one seat, stepping between them. */
function knockDown(referee: KnockaboutMatch, seat: number, count: number): boolean {
  let ended = false;
  for (let i = 0; i < count; i += 1) {
    referee.knockdown(seat);
    ended ||= referee.step(STEP);
  }
  return ended;
}

// ---------------------------------------------------------------------------
// The ending
// ---------------------------------------------------------------------------

test('a match ends on the fifth knockdown and not before it', () => {
  const referee = match();
  const target = referee.matchKnockdowns;
  assert.equal(target, KNOCKABOUT.matchKnockdowns);

  const early = knockDown(referee, 0, target - 1);
  assert.equal(early, false, `${target - 1} of ${target} is not a match`);
  assert.equal(referee.state.phase, 'running');
  assert.equal(referee.state.winner, null);
  assert.equal(referee.result(), null, 'an unfinished match has no card');

  assert.equal(knockDown(referee, 0, 1), true);
  assert.equal(referee.state.phase, 'ended');
  assert.equal(referee.state.winner, 0);
});

test('the ending is reported to the caller exactly once', () => {
  // A knockdown lands several lines before the referee is stepped, so the
  // ending belongs to the step rather than to the knockdown (q86). A step that
  // kept saying "ended" would send the game to the results screen on every step
  // after the last one.
  const referee = match();
  referee.knockdown(0);
  referee.knockdown(0);
  referee.knockdown(0);
  referee.knockdown(0);
  assert.equal(referee.step(STEP), false);
  referee.knockdown(0);
  assert.equal(referee.step(STEP), true);
  assert.equal(referee.step(STEP), false, 'the ending was spent twice');
  assert.equal(referee.step(STEP), false);
});

test('a knockdown landed after the ending step does not score', () => {
  // The card is on screen three seconds later and the paddles are still in
  // their hands, so a swing after the last one is a real thing rather than a
  // hypothetical. **After the step** is the whole of the rule since q86 — see
  // the two tests below for what happens *inside* it.
  const referee = match();
  knockDown(referee, 0, referee.matchKnockdowns);
  referee.knockdown(1);
  referee.knockdown(1);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [5, 0]);
  assert.equal(referee.state.winner, 0);
});

// ---------------------------------------------------------------------------
// q86 — two riders who get there together (answered 2026-08-28)
// ---------------------------------------------------------------------------

/** Hand `count` knockdowns to `seat` without stepping. One step's worth. */
function within(referee: KnockaboutMatch, seat: number, count: number): void {
  for (let i = 0; i < count; i += 1) referee.knockdown(seat);
}

test('two riders who reach the target on the same step draw it', () => {
  // The owner's instruction, in one assertion: *"whatever is fair, and simple
  // to implement. I don't want a player having unfair advantage."* Until this
  // was answered the seat handed over first took it, and that is always seat 0.
  const referee = match();
  const target = referee.matchKnockdowns;
  knockDown(referee, 0, target - 1);
  knockDown(referee, 1, target - 1);

  within(referee, 0, 1);
  within(referee, 1, 1);
  assert.equal(referee.step(STEP), true, 'the step that decides it says so');
  assert.equal(referee.state.phase, 'ended');
  assert.equal(referee.state.winner, null, 'nobody takes a shared lead');
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [target, target]);
});

test('a draw is still a card, because the screen has to name it', () => {
  // `Game.finishMatch` stores what `result()` returns and the results screen
  // shows whatever is stored. A draw that returned null would put the previous
  // mode's card on screen — which is the failure `resultsMode` exists to stop,
  // arriving through the referee instead of through the reader.
  const referee = match();
  const target = referee.matchKnockdowns;
  knockDown(referee, 0, target - 1);
  knockDown(referee, 1, target - 1);
  within(referee, 0, 1);
  within(referee, 1, 1);
  referee.step(STEP);

  const card = referee.result();
  assert.notEqual(card, null, 'a draw is an ending');
  assert.equal(card?.winner, null);
  assert.deepEqual(card?.scores.map((score) => score.knockdowns), [target, target]);
  assert.equal(card?.target, target);
});

test('the seat a knockdown is handed over in cannot decide a match', () => {
  // The fairness claim itself: the same step, played both ways round, is the
  // same match. Restore the old `knockdown`-decides rule and exactly one of
  // these two is a win for seat 0 and the other a win for seat 1.
  const play = (first: number) => {
    const referee = match();
    const target = referee.matchKnockdowns;
    knockDown(referee, 0, target - 1);
    knockDown(referee, 1, target - 1);
    within(referee, first, 1);
    within(referee, first === 0 ? 1 : 0, 1);
    const ended = referee.step(STEP);
    return { ended, winner: referee.state.winner, card: referee.result() };
  };
  assert.deepEqual(play(0), play(1));
  assert.equal(play(0).winner, null);
});

test('a knockdown landed beside the winning one still counts', () => {
  // Everything that happened in the step is scored, and only then is the step
  // judged. The loser's fifth-of-five swing landing on the same tick used to
  // vanish from the card they are about to read.
  const referee = match();
  const target = referee.matchKnockdowns;
  knockDown(referee, 0, target - 1);
  knockDown(referee, 1, 2);

  within(referee, 0, 1);
  within(referee, 1, 1);
  assert.equal(referee.step(STEP), true);
  assert.equal(referee.state.winner, 0, 'reaching it alone is still winning it');
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [target, 3]);
});

test('the highest tally takes it, not merely a tally that reached the target', () => {
  // A seat can put two riders down in one step the day a four-player couch is
  // measured (§26.7). Both are past the target here; only one is on top of it,
  // so this is a win rather than a draw.
  const referee = new KnockaboutMatch();
  referee.matchKnockdowns = 3;
  referee.arm(4);
  knockDown(referee, 0, 2);
  knockDown(referee, 2, 2);

  within(referee, 0, 1);
  within(referee, 2, 2);
  assert.equal(referee.step(STEP), true);
  assert.equal(referee.state.winner, 2);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [3, 0, 4, 0]);
});

test('the loser’s knockdowns are their own, and the winner is whoever got there', () => {
  const referee = match();
  knockDown(referee, 1, 3);
  knockDown(referee, 0, 2);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [2, 3]);

  assert.equal(knockDown(referee, 1, 2), true);
  const card = referee.result();
  assert.notEqual(card, null);
  assert.equal(card?.winner, 1);
  assert.deepEqual(card?.scores.map((score) => score.knockdowns), [2, 5]);
});

// ---------------------------------------------------------------------------
// Discs
// ---------------------------------------------------------------------------

test('discs credit the seat that struck them and never the other', () => {
  const referee = match();
  referee.disc(0);
  referee.disc(0);
  referee.disc(1);
  assert.deepEqual(referee.state.scores.map((score) => score.discs), [2, 1]);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [0, 0]);
});

test('no number of discs wins a match', () => {
  // q76: the field stays worth riding and it never decides the fight. Delete
  // the `disc`/`knockdown` split and this is what notices.
  const referee = match();
  for (let i = 0; i < referee.matchKnockdowns * 10; i += 1) {
    referee.disc(0);
    assert.equal(referee.step(STEP), false);
  }
  assert.equal(referee.state.phase, 'running');
  assert.equal(referee.state.winner, null);
  assert.equal(referee.result(), null);
});

test('a seat this match does not have scores nothing', () => {
  const referee = match();
  referee.knockdown(2);
  referee.knockdown(-1);
  referee.knockdown(0.5);
  referee.disc(2);
  assert.deepEqual(referee.state.scores, [
    { knockdowns: 0, discs: 0 },
    { knockdowns: 0, discs: 0 },
  ]);
});

// ---------------------------------------------------------------------------
// The clock, which is shown and decides nothing
// ---------------------------------------------------------------------------

test('the clock runs while the match does, and stops when it is decided', () => {
  const referee = match();
  for (let i = 0; i < 120; i += 1) referee.step(STEP);
  const oneSecond = referee.state.elapsed;
  assert.ok(Math.abs(oneSecond - 1) < 1e-9, `a second of steps is a second: ${oneSecond}`);

  knockDown(referee, 0, referee.matchKnockdowns);
  const atEnd = referee.state.elapsed;
  for (let i = 0; i < 120; i += 1) referee.step(STEP);
  assert.equal(referee.state.elapsed, atEnd, 'a finished match kept ageing');
});

test('no length of match ends one, because there is no clock to run out', () => {
  // §13 q14 survives q76: elapsed is shown and counts zero.
  const referee = match();
  for (let i = 0; i < 120 * 600; i += 1) {
    assert.equal(referee.step(STEP), false);
  }
  assert.equal(referee.state.phase, 'running');
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test('an idle referee is a run that answers to somebody else', () => {
  // How `Game` picks a referee: single player never arms this one, and every
  // question it asks is gated on the phase rather than on the app state
  // (AGENTS.md — a mode's lane is gated on its referee, never on the state).
  const referee = new KnockaboutMatch();
  assert.equal(referee.state.phase, 'idle');
  assert.deepEqual(referee.state.scores, []);
  referee.knockdown(0);
  referee.disc(0);
  assert.equal(referee.step(STEP), false);
  assert.equal(referee.state.phase, 'idle');
  assert.equal(referee.result(), null);
});

test('one seat is not a match', () => {
  const referee = new KnockaboutMatch();
  referee.arm(1);
  assert.equal(referee.state.phase, 'idle');
  referee.arm(0);
  assert.equal(referee.state.phase, 'idle');
});

test('arming a second match inherits nothing from the first', () => {
  const referee = match();
  knockDown(referee, 0, 3);
  referee.disc(1);
  for (let i = 0; i < 600; i += 1) referee.step(STEP);

  referee.arm(2);
  assert.deepEqual(referee.state.scores, [
    { knockdowns: 0, discs: 0 },
    { knockdowns: 0, discs: 0 },
  ]);
  assert.equal(referee.state.elapsed, 0);
  assert.equal(referee.state.winner, null);
  assert.equal(referee.step(STEP), false, 'a stale ending survived the re-arm');
});

test('abandoning a decided match takes the card with it', () => {
  const referee = match();
  knockDown(referee, 0, referee.matchKnockdowns);
  assert.notEqual(referee.result(), null);
  referee.abandon();
  assert.equal(referee.state.phase, 'idle');
  assert.equal(referee.result(), null);
});

test('the target moves with the tuning, and the card reports the one it was played at', () => {
  const referee = new KnockaboutMatch();
  referee.matchKnockdowns = 2;
  referee.arm(2);
  assert.equal(knockDown(referee, 1, 2), true);
  assert.equal(referee.result()?.target, 2);
});

test('the card is a copy, so a later match cannot rewrite a finished one', () => {
  const referee = match();
  knockDown(referee, 0, referee.matchKnockdowns);
  const card = referee.result();
  referee.arm(2);
  knockDown(referee, 1, 2);
  assert.deepEqual(card?.scores.map((score) => score.knockdowns), [5, 0]);
  assert.equal(card?.winner, 0);
});

test('identical inputs produce an identical match', () => {
  const play = () => {
    const referee = match();
    const events: boolean[] = [];
    for (let step = 0; step < 900; step += 1) {
      if (step % 100 === 7) referee.knockdown(step % 200 === 7 ? 0 : 1);
      if (step % 37 === 0) referee.disc(step % 74 === 0 ? 0 : 1);
      events.push(referee.step(STEP));
    }
    return { events, state: referee.state, result: referee.result() };
  };
  assert.deepEqual(play(), play());
});
