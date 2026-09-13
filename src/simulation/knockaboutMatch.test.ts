/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { KNOCKABOUT, LIVE_TUNABLES, SIMULATION } from '../data/tuning.ts';
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
 *
 * **The two-seat tests are M37's regression contract** (§37.1) and every one of
 * them below the M26 headings is the assertion it was before the milestone. The
 * one mechanical change is `.ended`: `step` now returns a `MatchStep` carrying
 * the count's events beside the ending, because a boolean cannot say "3" — so
 * `referee.step(STEP)` became `referee.step(STEP).ended` and nothing else moved.
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
    ended ||= referee.step(STEP).ended;
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
  assert.equal(referee.step(STEP).ended, false);
  referee.knockdown(0);
  assert.equal(referee.step(STEP).ended, true);
  assert.equal(referee.step(STEP).ended, false, 'the ending was spent twice');
  assert.equal(referee.step(STEP).ended, false);
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
  assert.equal(referee.step(STEP).ended, true, 'the step that decides it says so');
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
    const ended = referee.step(STEP).ended;
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
  assert.equal(referee.step(STEP).ended, true);
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
  assert.equal(referee.step(STEP).ended, true);
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
    assert.equal(referee.step(STEP).ended, false);
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
    assert.equal(referee.step(STEP).ended, false);
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
  assert.equal(referee.step(STEP).ended, false);
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
  assert.equal(referee.step(STEP).ended, false, 'a stale ending survived the re-arm');
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
      events.push(referee.step(STEP).ended);
    }
    return { events, state: referee.state, result: referee.result() };
  };
  assert.deepEqual(play(), play());
});

// ---------------------------------------------------------------------------
// M37 — three and four riders (§37.3; q168, q169, q170, q171, q173)
// ---------------------------------------------------------------------------

/** A match under way between `seats` riders, with no count. */
function bout(seats: number, target?: number): KnockaboutMatch {
  const referee = new KnockaboutMatch();
  if (target !== undefined) referee.matchKnockdowns = target;
  referee.arm(seats);
  return referee;
}

/** Hand in one step's worth of knockdowns, then step once. */
function playStep(referee: KnockaboutMatch, batch: readonly number[]): boolean {
  for (const seat of batch) referee.knockdown(seat);
  return referee.step(STEP).ended;
}

/** Every arrangement of a list — the permutation claim's instrument. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) out.push([items[index], ...tail]);
  }
  return out;
}

/** Tallies, the shape most assertions below want to read. */
function tallies(referee: KnockaboutMatch): number[] {
  return referee.state.scores.map((score) => score.knockdowns);
}

test('a place is one plus the number of riders with more, so 5/5/3/3 is 1/1/3/3', () => {
  // q169's whole rule, and the reason it is counted rather than sorted: a sort
  // needs a comparator, a comparator needs a tie-break, and the only tie-break
  // in the room would be the seat index.
  const referee = bout(4);
  playStep(referee, [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  assert.deepEqual(tallies(referee), [4, 4, 3, 3]);
  assert.deepEqual(referee.state.places, [1, 1, 3, 3]);

  const ended = playStep(referee, [0, 1]);
  assert.equal(ended, true);
  assert.deepEqual(tallies(referee), [5, 5, 3, 3]);
  assert.deepEqual(referee.state.places, [1, 1, 3, 3]);
  assert.deepEqual(referee.result()?.places, [1, 1, 3, 3]);
});

test('a lower place is shared the same way a winning one is', () => {
  // 5/3/3/1 — the tie that decides nothing still has to read correctly on a
  // card with four rows in it.
  const referee = bout(4);
  playStep(referee, [1, 1, 1, 2, 2, 2, 3]);
  assert.equal(playStep(referee, [0, 0, 0, 0, 0]), true);
  assert.deepEqual(tallies(referee), [5, 3, 3, 1]);
  assert.deepEqual(referee.result()?.places, [1, 2, 2, 4]);
  assert.equal(referee.result()?.winner, 0);
});

test('the leaders are whoever is on the top tally, and at 0/0/0 that is everybody', () => {
  const referee = bout(3);
  assert.deepEqual(referee.state.leaders, [0, 1, 2], 'nobody is behind before a fight starts');
  playStep(referee, [2]);
  assert.deepEqual(referee.state.leaders, [2]);
  playStep(referee, [0]);
  assert.deepEqual(referee.state.leaders, [0, 2]);
  playStep(referee, [2]);
  assert.deepEqual(referee.state.leaders, [2]);
});

test('a final 6/5/4 has one winner, not a draw among everybody who reached five', () => {
  // §37.3 names this case, and it is the one a "first past the target" rule
  // gets wrong: two riders are past five and only one is on top of it.
  const referee = bout(3);
  playStep(referee, [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
  assert.equal(playStep(referee, [0, 0, 1]), true);
  assert.deepEqual(tallies(referee), [6, 5, 4]);
  const card = referee.result();
  assert.equal(card?.winner, 0);
  assert.deepEqual(card?.tiedLeaders, [], 'a winner has nobody to be tied with');
  assert.deepEqual(card?.places, [1, 2, 3]);
});

test('a shared top is a draw among exactly the riders who share it, at two, three and four', () => {
  for (const seats of [2, 3, 4]) {
    for (const drawn of [2, 3, 4].filter((count) => count <= seats)) {
      const referee = bout(seats, 3);
      const tied = [];
      for (let seat = 0; seat < drawn; seat += 1) tied.push(seat);
      const batch: number[] = [];
      for (const seat of tied) for (let i = 0; i < 3; i += 1) batch.push(seat);
      assert.equal(playStep(referee, batch), true, `${drawn} of ${seats} reached it together`);

      const card = referee.result();
      assert.equal(card?.winner, null, `a ${drawn}-way draw has no winner`);
      assert.deepEqual(card?.tiedLeaders, tied);
      assert.equal(card?.seats, seats);
      for (const seat of tied) assert.equal(card?.places[seat], 1);
      for (let seat = drawn; seat < seats; seat += 1) {
        assert.equal(card?.places[seat], drawn + 1, 'everybody else is placed by knockdowns');
      }
    }
  }
});

test('every seat can win it, at three and at four', () => {
  // The fairness claim said the dullest way: nothing about a seat index helps
  // or hinders. Delete the `1 + more` count for a sort and one of these fails.
  for (const seats of [3, 4]) {
    for (let winner = 0; winner < seats; winner += 1) {
      const referee = bout(seats);
      for (let seat = 0; seat < seats; seat += 1) {
        if (seat !== winner) playStep(referee, [seat, seat]);
      }
      assert.equal(knockDown(referee, winner, referee.matchKnockdowns), true);
      assert.equal(referee.state.winner, winner, `seat ${winner} of ${seats} could not win`);
      assert.equal(referee.result()?.places[winner], 1);
      assert.deepEqual(referee.result()?.tiedLeaders, []);
    }
  }
});

test('the order a step’s knockdowns are handed over in cannot change anything', () => {
  // q86's two-seat claim, made at four: the same step played every way round
  // is the same match. The batch below is a real one — two victims of one
  // swing (q171) and a shared victim crediting two attackers (q173) together.
  const batch = [0, 0, 1, 2, 3];
  let reference: unknown = null;
  for (const order of permutations(batch)) {
    const referee = bout(4);
    playStep(referee, [0, 0, 1, 1, 2, 2, 2, 3]);
    const ended = playStep(referee, order);
    const played = {
      ended,
      phase: referee.state.phase,
      winner: referee.state.winner,
      places: referee.state.places,
      leaders: referee.state.leaders,
      tallies: tallies(referee),
      card: referee.result(),
    };
    if (reference === null) reference = played;
    else assert.deepEqual(played, reference, `order ${order.join(',')} played differently`);
  }
  assert.notEqual(reference, null);
});

test('the seat numbers themselves award nothing, so relabelling the room relabels the card', () => {
  // The other half of the same claim: play one match, then play it again with
  // every seat moved one chair along. Every fact must move with them.
  const fight = (shift: number) => {
    const referee = bout(4);
    const seat = (index: number) => (index + shift) % 4;
    playStep(referee, [seat(0), seat(0), seat(1), seat(2), seat(2), seat(2)]);
    const ended = playStep(referee, [seat(0), seat(0), seat(0), seat(2), seat(2)]);
    return {
      ended,
      winner: referee.state.winner,
      places: [...referee.state.places],
      tallies: tallies(referee),
      tiedLeaders: [...(referee.result()?.tiedLeaders ?? [])],
    };
  };
  const base = fight(0);
  for (let shift = 1; shift < 4; shift += 1) {
    const moved = fight(shift);
    assert.equal(moved.ended, base.ended);
    assert.equal(moved.winner, base.winner === null ? null : (base.winner + shift) % 4);
    for (let index = 0; index < 4; index += 1) {
      assert.equal(moved.places[(index + shift) % 4], base.places[index]);
      assert.equal(moved.tallies[(index + shift) % 4], base.tallies[index]);
    }
    assert.deepEqual(
      moved.tiedLeaders,
      base.tiedLeaders.map((seat) => (seat + shift) % 4).sort((a, b) => a - b),
    );
  }
});

test('no number of discs ends a four-rider bout either', () => {
  // q76 at N. Exhausting the field leaves four riders with nothing to do but
  // fight, which is the mode's own name for what it is about.
  const referee = bout(4);
  for (let i = 0; i < 200; i += 1) {
    for (let seat = 0; seat < 4; seat += 1) referee.disc(seat);
    assert.equal(referee.step(STEP).ended, false);
  }
  assert.equal(referee.state.phase, 'running');
  assert.deepEqual(referee.state.places, [1, 1, 1, 1], 'discs place nobody');
  assert.deepEqual(tallies(referee), [0, 0, 0, 0]);
  assert.equal(referee.result(), null);
});

test('nothing scores after the ending step, at four', () => {
  const referee = bout(4);
  assert.equal(knockDown(referee, 2, referee.matchKnockdowns), true);
  for (let seat = 0; seat < 4; seat += 1) {
    referee.knockdown(seat);
    referee.disc(seat);
  }
  assert.equal(referee.step(STEP).ended, false);
  assert.deepEqual(tallies(referee), [0, 0, 5, 0]);
  assert.deepEqual(referee.state.scores.map((score) => score.discs), [0, 0, 0, 0]);
  assert.equal(referee.state.winner, 2);
});

test('moving the target moves the result, not merely the HUD', () => {
  // M26's rule at N: a tunable is only testable by moving it. The same three
  // steps are a win at three and an unfinished bout at five.
  const play = (target: number) => {
    const referee = bout(3, target);
    playStep(referee, [1, 1, 1]);
    playStep(referee, [0, 2]);
    return { phase: referee.state.phase, winner: referee.state.winner, card: referee.result() };
  };
  const short = play(3);
  assert.equal(short.phase, 'ended');
  assert.equal(short.winner, 1);
  assert.equal(short.card?.target, 3);

  const long = play(5);
  assert.equal(long.phase, 'running');
  assert.equal(long.card, null);
});

test('the card is frozen through and through, so the results delay cannot rewrite it', () => {
  const referee = bout(3);
  playStep(referee, [1, 1, 1, 1, 1, 2, 2]);
  const card = referee.result();
  assert.notEqual(card, null);
  assert.ok(Object.isFrozen(card));
  assert.ok(Object.isFrozen(card?.scores));
  assert.ok(Object.isFrozen(card?.places));
  assert.ok(Object.isFrozen(card?.tiedLeaders));
  assert.throws(() => {
    (card as unknown as { winner: number }).winner = 2;
  }, TypeError);

  referee.arm(4);
  knockDown(referee, 3, referee.matchKnockdowns);
  assert.deepEqual(card?.scores.map((score) => score.knockdowns), [0, 5, 2]);
  assert.deepEqual(card?.places, [3, 1, 2]);
  assert.equal(card?.seats, 3);
});

// ---------------------------------------------------------------------------
// M37 — the count (q170, §37.4)
// ---------------------------------------------------------------------------

const COUNT = KNOCKABOUT.countdownSeconds;

/** Step `count` times, collecting every event. */
function tick(referee: KnockaboutMatch, count: number) {
  const events = [];
  let ended = false;
  for (let i = 0; i < count; i += 1) {
    const step = referee.step(STEP);
    ended ||= step.ended;
    for (const event of step.events) events.push(event);
  }
  return { events, ended };
}

test('a count above zero holds the room, and GO releases it exactly once', () => {
  const referee = new KnockaboutMatch();
  referee.arm(4, COUNT);
  assert.equal(referee.state.phase, 'countdown');
  assert.equal(referee.state.countdown, COUNT);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [0, 0, 0, 0]);

  const early = tick(referee, Math.round(2 / STEP));
  assert.equal(referee.state.phase, 'countdown');
  assert.equal(referee.state.elapsed, 0, 'the fight has not started, so its clock has not');
  assert.deepEqual(
    early.events.filter((event) => event.kind === 'count').map((event) => event.value),
    [3, 2],
    'the count is shown once per whole second, newest last',
  );

  const released = tick(referee, Math.round(1.5 / STEP));
  assert.equal(referee.state.phase, 'running');
  assert.equal(referee.state.countdown, 0);
  assert.deepEqual(
    released.events.filter((event) => event.kind === 'count').map((event) => event.value),
    [1],
  );
  assert.equal(released.events.filter((event) => event.kind === 'go').length, 1, 'GO once');
  assert.ok(referee.state.elapsed > 0, 'the match clock runs from GO');
});

test('the count events land on the fixed step, one per whole second', () => {
  // The race's convention, mirrored (§37.4): "3" is shown for the whole of the
  // third second and GO replaces "1" rather than following a silent zero.
  const referee = new KnockaboutMatch();
  referee.arm(3, 3);
  const seen: { step: number; kind: string; value: number }[] = [];
  for (let step = 1; step <= Math.round(4 / STEP); step += 1) {
    for (const event of referee.step(STEP).events) {
      seen.push({ step, kind: event.kind, value: event.value });
    }
  }
  assert.deepEqual(seen.map((entry) => `${entry.kind}${entry.value}`), ['count3', 'count2', 'count1', 'go0']);
  assert.equal(seen[0].step, 1, 'the first step already shows the first number');
  for (const entry of seen) assert.equal(entry.step % 120 <= 1 || entry.step % 120 === 0, true);
  assert.ok(Math.abs(seen[3].step - 360) <= 1, `GO landed on step ${seen[3].step}`);
});

test('a held match refuses every score, and forgets none of them at GO', () => {
  // §37.4 freezes swings, contact and target credit until GO. The referee is
  // the last line of that: a knockdown handed in during the count is a bug
  // upstream, and it must not be banked and paid out a moment later either.
  const referee = new KnockaboutMatch();
  referee.arm(3, COUNT);
  for (let i = 0; i < 60; i += 1) {
    referee.knockdown(i % 3);
    referee.disc(i % 3);
    referee.step(STEP);
  }
  assert.equal(referee.state.phase, 'countdown');
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [0, 0, 0]);
  assert.deepEqual(referee.state.scores.map((score) => score.discs), [0, 0, 0]);
  assert.equal(referee.state.elapsed, 0);

  tick(referee, Math.round(COUNT / STEP) + 1);
  assert.equal(referee.state.phase, 'running');
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [0, 0, 0]);
  referee.knockdown(1);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [0, 1, 0]);
});

test('a count of zero is the two-player start, at every N', () => {
  // The N=2 regression contract (§37.1) and M26's "a tunable is only testable
  // by moving it" in one test: zero and three are plainly distinguishable, and
  // zero is `running` before the first step rather than after it.
  for (const seats of [2, 3, 4]) {
    const instant = new KnockaboutMatch();
    instant.arm(seats);
    assert.equal(instant.state.phase, 'running', 'the default is an immediate start');
    assert.equal(instant.state.countdown, 0);
    const first = instant.step(STEP);
    assert.deepEqual(first.events, []);
    assert.ok(instant.state.elapsed > 0);

    const explicit = new KnockaboutMatch();
    explicit.arm(seats, 0);
    assert.equal(explicit.state.phase, 'running');

    const held = new KnockaboutMatch();
    held.arm(seats, 3);
    held.step(STEP);
    assert.equal(held.state.phase, 'countdown', 'three seconds is not an instant start');
  }
});

test('a nonsense count is no count at all', () => {
  // A negative, a NaN and an infinity all mean "no count": the first two
  // because they are not durations, and the third because a room held forever
  // is a room nobody can leave. Every one of them lands on the immediate start
  // rather than on a phase the composition root would have to rescue.
  for (const nonsense of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const referee = new KnockaboutMatch();
    referee.arm(3, nonsense);
    assert.equal(referee.state.phase, 'running', `${nonsense}`);
    assert.equal(referee.state.countdown, 0);
  }
});

test('arming again, and abandoning, take the count with them', () => {
  const referee = new KnockaboutMatch();
  referee.arm(3, COUNT);
  referee.step(STEP);
  referee.abandon();
  assert.equal(referee.state.phase, 'idle');
  assert.equal(referee.state.countdown, 0);
  assert.deepEqual(referee.state.places, []);
  assert.deepEqual(referee.state.leaders, []);

  referee.arm(4, COUNT);
  assert.equal(referee.state.countdown, COUNT, 'a fresh bout counts from the top');
  referee.arm(2);
  assert.equal(referee.state.phase, 'running', 'and a two-seat re-arm inherits no count');
  assert.equal(referee.state.countdown, 0);
});

test('a whole counted bout is reproducible, step for step', () => {
  // The QA bridge's `advance(n)` claim, at four riders and through the count.
  const play = () => {
    const referee = new KnockaboutMatch();
    referee.arm(4, COUNT);
    const log: string[] = [];
    for (let step = 0; step < 900; step += 1) {
      if (step % 53 === 11) referee.knockdown(step % 4);
      if (step % 31 === 0) referee.disc(step % 4);
      const outcome = referee.step(STEP);
      for (const event of outcome.events) log.push(`${step}:${event.kind}:${event.seat}:${event.value}`);
      if (outcome.ended) log.push(`${step}:decided`);
    }
    return { log, state: referee.state, card: referee.result() };
  };
  assert.deepEqual(play(), play());
});

// ---------------------------------------------------------------------------
// The claims the first pass stated and did not hold — repair pass, 2026-09-13.
// Each was written against a mutated copy of `knockaboutMatch.ts` first and
// fails on it; the note in each says which mutation.
// ---------------------------------------------------------------------------

test('the deciding step does not age the clock, and every quiet one does', () => {
  // `step`'s own comment gives this rule and its reason — the check comes
  // before the addition rather than after it — and moving the addition above
  // the check passed every other test in this file. The sibling claim about
  // the count is held by two tests above; this one was held by none.
  //
  // It is the lap referee's rule for a lap that closes mid-step: the clock the
  // card reports is the time the fight actually ran, not that plus a frame.
  const referee = match();
  for (let step = 0; step < 10; step += 1) {
    assert.equal(referee.step(STEP).ended, false);
  }
  assert.ok(Math.abs(referee.state.elapsed - 10 * STEP) < 1e-12, 'a quiet step ages it');

  for (let i = 0; i < KNOCKABOUT.matchKnockdowns; i += 1) referee.knockdown(0);
  assert.equal(referee.step(STEP).ended, true);
  assert.ok(Math.abs(referee.state.elapsed - 10 * STEP) < 1e-12, 'the ending step aged the clock');
  assert.ok(Math.abs(referee.result()!.seconds - 10 * STEP) < 1e-12, 'and the card carries it');
});

test('a room is a whole number of chairs', () => {
  // `arm(3.5)` built a **four**-seat room, because `seat < 3.5` runs four
  // times, and `arm(Infinity)` pushed tallies until the heap gave out — a
  // hang, not a wrong number. `knockdown`, `disc` and `StrikeBatch`'s
  // constructor all demanded an integer already; this one did not.
  //
  // Unreachable from `Game`, which counts an array of seats, which is exactly
  // why the guard costs nothing.
  for (const nonsense of [3.5, 2.5, Number.POSITIVE_INFINITY, Number.NaN, 1, 0, -2]) {
    const referee = new KnockaboutMatch();
    referee.arm(nonsense);
    assert.equal(referee.state.phase, 'idle', `${nonsense} armed a match`);
    assert.equal(referee.state.seats, 0, `${nonsense}`);
    assert.equal(referee.result(), null, `${nonsense}`);
  }
  for (const real of [2, 3, 4]) {
    const referee = new KnockaboutMatch();
    referee.arm(real);
    assert.equal(referee.state.seats, real, 'and a whole number still arms one');
  }
});

test('the phase getter is the same fact as the card’s, in every phase', () => {
  // `Game`'s fixed step asks this question every tick and wants nothing else
  // in the card, so it reads `phase` rather than building `state`. The two are
  // one field, and this is what says so — a second reader that can drift is
  // worse than the four arrays it saves.
  const referee = new KnockaboutMatch();
  const agrees = (where: string) => assert.equal(referee.phase, referee.state.phase, where);

  agrees('idle');
  referee.arm(4, COUNT);
  agrees('countdown');
  while (referee.phase === 'countdown') referee.step(STEP);
  agrees('running');
  for (let i = 0; i < KNOCKABOUT.matchKnockdowns; i += 1) referee.knockdown(2);
  referee.step(STEP);
  agrees('ended');
  assert.equal(referee.phase, 'ended');
  referee.abandon();
  agrees('abandoned');
  assert.equal(referee.phase, 'idle');
});

test('the F4 panel carries the target and not yet the count', () => {
  // The group header in `tuning.ts` says one of its two numbers is on F4 and
  // why the other still has no row — and since Stage B that reason is no
  // longer "nothing passes it to `arm`". `enterKnockabout` does pass it
  // (`Game.ts`'s `this.match.arm(this.seatCount, ...)`); what it does not do is
  // give the referee a field to re-read, so `arm` has already consumed the
  // count by the time a slider could move it and the knob would lie until the
  // next bout was armed. This is that sentence as a test, and it should fail
  // the day somebody adds the row without giving the referee the field or
  // re-arming on change.
  const rows = LIVE_TUNABLES.filter((entry) => entry.path.startsWith('KNOCKABOUT.'));
  assert.deepEqual(rows.map((entry) => entry.path), ['KNOCKABOUT.matchKnockdowns']);
  assert.equal(typeof KNOCKABOUT.countdownSeconds, 'number', 'and the count is still a constant');
});
