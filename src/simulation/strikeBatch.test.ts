/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SIMULATION } from '../data/tuning.ts';
import { KnockaboutMatch } from './knockaboutMatch.ts';
import {
  StrikeBatch,
  type RecordedStrike,
  type StrikeParticipant,
  type StrikeResolution,
} from './strikeBatch.ts';

/**
 * One step's paddle hits, resolved — M37 Phase 1 (§37.3, q173).
 *
 * No browser, no `Game`, no controller and no paddle: this file is handed the
 * facts those three produce and checks the arithmetic between them. What it
 * cannot claim is that the facts are real — that a recorded hit is really a
 * paddle reaching a rider, that `committed` is really the swing's own
 * arithmetic and that a credited attacker really swung is `tests/m37.spec.ts`'s
 * job, in a running game with three riders in it.
 *
 * The claim it *can* make, and the one the milestone turns on, is that none of
 * it depends on the order the hits were recorded in — which at three and four
 * riders is the difference between a referee and a seat-order rule.
 */

const STEP = 1 / SIMULATION.hz;

/** A rider standing in the fight, untouched. The default every test edits. */
function standing(overrides: Partial<StrikeParticipant> = {}): StrikeParticipant {
  return {
    present: true,
    down: false,
    immune: false,
    reset: false,
    headingY: 0,
    ...overrides,
  };
}

/** `count` untouched riders. */
function room(count: number): StrikeParticipant[] {
  return Array.from({ length: count }, () => standing());
}

/** A committed hit, unless told otherwise. Travel is a metre due east. */
function hit(
  attacker: number,
  victim: number,
  overrides: Partial<RecordedStrike> = {},
): RecordedStrike {
  return {
    attacker,
    victim,
    swing: 1,
    committed: true,
    travelX: 1,
    travelZ: 0,
    ...overrides,
  };
}

/** Record a whole batch in the order given and resolve it. */
function resolve(
  hits: readonly RecordedStrike[],
  participants: readonly StrikeParticipant[],
  batch: StrikeBatch = new StrikeBatch(),
): StrikeResolution {
  batch.clear();
  for (const one of hits) {
    batch.record(one.attacker, one.victim, one.swing, one.committed, one.travelX, one.travelZ);
  }
  return batch.resolve(participants);
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

/** The refusals as a set of strings, which is what a permutation preserves. */
function refusals(resolution: StrikeResolution): string[] {
  return resolution.refused
    .map((one) => `${one.attacker}->${one.victim}#${one.swing}:${one.reason}`)
    .sort();
}

/**
 * What `Game` will do with a resolution — the header's three steps, as code.
 *
 * `hardKnock` is stubbed with the controller's own refusal (`crashing ||
 * invulnerableTimer > 0`) so the credit rule is exercised against the same
 * gate the real one applies, and the victims it puts down are reported back.
 */
function apply(
  resolution: StrikeResolution,
  referee: KnockaboutMatch,
  participants: readonly StrikeParticipant[],
): { downed: number[]; shoved: number[] } {
  const downed: number[] = [];
  const shoved: number[] = [];
  for (const outcome of resolution.victims) {
    const facts = participants[outcome.victim];
    if (outcome.crashDirection !== null && !facts.down && !facts.immune) {
      downed.push(outcome.victim);
      for (const attacker of outcome.credited) referee.knockdown(attacker);
    }
    for (const _ of outcome.shoves) shoved.push(outcome.victim);
  }
  return { downed, shoved };
}

// ---------------------------------------------------------------------------
// One hit, and the two answers it can have
// ---------------------------------------------------------------------------

test('a committed hit on a standing rider is one crash and one credit', () => {
  const resolution = resolve([hit(0, 1)], room(2));
  assert.deepEqual(resolution.refused, []);
  assert.equal(resolution.victims.length, 1);
  const [outcome] = resolution.victims;
  assert.equal(outcome.victim, 1);
  assert.deepEqual(outcome.credited, [0]);
  assert.deepEqual(outcome.shoves, []);
  assert.deepEqual(outcome.crashDirection, { x: 1, z: 0 });
});

test('an uncommitted hit is a shove and credits nobody', () => {
  const resolution = resolve([hit(0, 1, { committed: false })], room(2));
  const [outcome] = resolution.victims;
  assert.equal(outcome.crashDirection, null, 'a shove is not a crash');
  assert.deepEqual(outcome.credited, []);
  assert.deepEqual(outcome.shoves, [0]);
});

test('the crash direction is a unit vector, whatever the paddle travelled', () => {
  const resolution = resolve([hit(0, 1, { travelX: 0, travelZ: -4 })], room(2));
  const direction = resolution.victims[0].crashDirection;
  assert.notEqual(direction, null);
  assert.ok(Math.abs(Math.hypot(direction!.x, direction!.z) - 1) < 1e-12);
  assert.ok(Math.abs(direction!.x) < 1e-12);
  assert.ok(Math.abs(direction!.z + 1) < 1e-12);
});

// ---------------------------------------------------------------------------
// Who is refused, and why (§37.3)
// ---------------------------------------------------------------------------

test('a paddle cannot reach its own rider', () => {
  const resolution = resolve([hit(1, 1)], room(3));
  assert.deepEqual(resolution.victims, []);
  assert.deepEqual(refusals(resolution), ['1->1#1:self']);
});

test('an empty chair neither swings nor is swung at', () => {
  const participants = room(4);
  participants[3] = standing({ present: false });
  const resolution = resolve([hit(3, 0), hit(0, 3), hit(0, 9), hit(-1, 0)], participants);
  assert.deepEqual(resolution.victims, []);
  assert.deepEqual(refusals(resolution), [
    '-1->0#1:no-attacker',
    '0->3#1:no-victim',
    '0->9#1:no-victim',
    '3->0#1:no-attacker',
  ]);
});

test('a rider already down takes nothing at all — not even a shove', () => {
  const participants = room(3);
  participants[1] = standing({ down: true });
  const resolution = resolve([hit(0, 1), hit(2, 1, { committed: false })], participants);
  assert.deepEqual(resolution.victims, [], 'a rider on the floor cannot be farmed');
  assert.deepEqual(refusals(resolution), ['0->1#1:victim-down', '2->1#1:victim-down']);
});

test('a rider still in the recovery window is shoved and never scored against', () => {
  // q79's window, and `hardKnock`'s own second refusal. Nobody is pinned on
  // the ground by a player standing over the spot.
  const participants = room(3);
  participants[1] = standing({ immune: true });
  const resolution = resolve([hit(0, 1), hit(2, 1)], participants);
  assert.deepEqual(resolution.refused, [], 'an immune rider is reached, not refused');
  const [outcome] = resolution.victims;
  assert.equal(outcome.crashDirection, null);
  assert.deepEqual(outcome.credited, []);
  assert.deepEqual(outcome.shoves, [0, 2]);
});

test('the same hit is a knockdown once the window has run out', () => {
  // The other side of the boundary, because a window tested on one side is a
  // window nobody has tested.
  const before = resolve([hit(0, 1)], [standing(), standing({ immune: true })]);
  const after = resolve([hit(0, 1)], [standing(), standing({ immune: false })]);
  assert.deepEqual(before.victims[0].credited, []);
  assert.deepEqual(after.victims[0].credited, [0]);
});

test('a teleport voids the hits it touches and leaves every other exchange standing', () => {
  // §37.3's per-participant hygiene. The two-seat code voided the whole batch,
  // which was honest only while every strike was aimed at the one other rider.
  const participants = room(4);
  participants[0] = standing({ reset: true });
  const resolution = resolve([
    hit(0, 1),
    hit(1, 0),
    hit(2, 3),
    hit(3, 2),
  ], participants);
  assert.deepEqual(refusals(resolution), ['0->1#1:attacker-reset', '1->0#1:victim-reset']);
  assert.deepEqual(resolution.victims.map((one) => one.victim), [2, 3]);
  assert.deepEqual(resolution.victims[0].credited, [3]);
  assert.deepEqual(resolution.victims[1].credited, [2]);
});

test('an unrelated seat’s reset changes nothing', () => {
  const participants = room(4);
  participants[3] = standing({ reset: true });
  const resolution = resolve([hit(0, 1), hit(2, 1)], participants);
  assert.deepEqual(resolution.refused, []);
  assert.deepEqual(resolution.victims[0].credited, [0, 2]);
});

test('an attacker who is already down still lands the swing they had recorded', () => {
  // §37.3: a paddle crash spent earlier in the same batch must not cancel the
  // victim's already-recorded return swing. It is q173's example in one line.
  const participants = room(2);
  participants[1] = standing({ down: true });
  const resolution = resolve([hit(1, 0)], participants);
  assert.deepEqual(resolution.refused, []);
  assert.deepEqual(resolution.victims[0].credited, [1]);
});

test('the same swing on the same victim counts once, and may still reach another', () => {
  // Deduplicated by attacker × swing × victim (§37.3), which is precisely the
  // key that leaves q171's two-victim swing alone.
  const resolution = resolve([
    hit(0, 1, { swing: 7 }),
    hit(0, 1, { swing: 7 }),
    hit(0, 2, { swing: 7 }),
  ], room(3));
  assert.deepEqual(refusals(resolution), ['0->1#7:duplicate']);
  assert.deepEqual(resolution.victims.map((one) => one.victim), [1, 2]);
  assert.deepEqual(resolution.victims[0].credited, [0]);
  assert.deepEqual(resolution.victims[1].credited, [0]);
});

test('one swing downs two riders across successive steps, and both count', () => {
  // A swing stays active for more than one step, so its second victim can be
  // reached on the next one. The batch is per step; the swing identity is not.
  const batch = new StrikeBatch();
  const participants = room(3);
  const first = resolve([hit(0, 1, { swing: 4 })], participants, batch);
  assert.deepEqual(first.victims.map((one) => one.victim), [1]);

  participants[1] = standing({ down: true });
  const second = resolve([hit(0, 2, { swing: 4 })], participants, batch);
  assert.deepEqual(second.refused, [], 'the same swing reaching a new victim is not a duplicate');
  assert.deepEqual(second.victims.map((one) => one.victim), [2]);
  assert.deepEqual(second.victims[0].credited, [0]);
});

// ---------------------------------------------------------------------------
// Shared victims — q173, and the direction that belongs to nobody
// ---------------------------------------------------------------------------

test('two committed paddles on one victim are one crash and two credits', () => {
  const resolution = resolve([
    hit(0, 1, { travelX: 1, travelZ: 0 }),
    hit(2, 1, { travelX: 0, travelZ: 1 }),
  ], room(3));
  assert.equal(resolution.victims.length, 1, 'one victim, one entry');
  const [outcome] = resolution.victims;
  assert.deepEqual(outcome.credited, [0, 2]);
  const half = Math.SQRT1_2;
  assert.ok(Math.abs(outcome.crashDirection!.x - half) < 1e-12);
  assert.ok(Math.abs(outcome.crashDirection!.z - half) < 1e-12);
});

test('an uncommitted attacker beside a committed one shoves and does not share the credit', () => {
  const resolution = resolve([
    hit(0, 1),
    hit(2, 1, { committed: false, travelX: -5, travelZ: 0 }),
  ], room(3));
  const [outcome] = resolution.victims;
  assert.deepEqual(outcome.credited, [0]);
  assert.deepEqual(outcome.shoves, [2]);
  assert.deepEqual(outcome.crashDirection, { x: 1, z: 0 }, 'a shove does not steer the fall');
});

test('two paddles arriving from exactly opposite sides push the victim backward', () => {
  // The degenerate sum. Backward along the victim's own heading is the one
  // direction in the problem that belongs to neither attacker (q173).
  const participants = room(3);
  participants[1] = standing({ headingY: Math.PI / 2 });
  const resolution = resolve([
    hit(0, 1, { travelX: 2, travelZ: 0 }),
    hit(2, 1, { travelX: -2, travelZ: 0 }),
  ], participants);
  const direction = resolution.victims[0].crashDirection!;
  // Forward at heading φ is (sin φ, cos φ), so backward at π/2 is (−1, 0).
  assert.ok(Math.abs(direction.x + 1) < 1e-12, `${direction.x}`);
  assert.ok(Math.abs(direction.z) < 1e-12, `${direction.z}`);
  assert.deepEqual(resolution.victims[0].credited, [0, 2], 'both still earned it');
});

test('mutual knockdowns are both real', () => {
  const resolution = resolve([
    hit(0, 1, { travelX: 1, travelZ: 0 }),
    hit(1, 0, { travelX: -1, travelZ: 0 }),
  ], room(2));
  assert.deepEqual(resolution.victims.map((one) => one.victim), [0, 1]);
  assert.deepEqual(resolution.victims[0].credited, [1]);
  assert.deepEqual(resolution.victims[1].credited, [0]);
});

test('a three-rider cycle puts all three down and credits all three', () => {
  const resolution = resolve([hit(0, 1), hit(1, 2), hit(2, 0)], room(3));
  assert.deepEqual(resolution.refused, []);
  assert.deepEqual(resolution.victims.map((one) => one.victim), [0, 1, 2]);
  assert.deepEqual(resolution.victims.map((one) => one.credited), [[2], [0], [1]]);
});

test('one swing that downs two distinct riders earns two (q171)', () => {
  const referee = new KnockaboutMatch();
  referee.arm(3);
  const participants = room(3);
  const resolution = resolve([
    hit(0, 1, { swing: 2 }),
    hit(0, 2, { swing: 2 }),
  ], participants);
  apply(resolution, referee, participants);
  referee.step(STEP);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [2, 0, 0]);
});

// ---------------------------------------------------------------------------
// q173's worked example, exactly as the owner's answer records it
// ---------------------------------------------------------------------------

/** Seats A=0, B=1, C=2, D=3; tallies before the step 4/2/4/1; target 5. */
function q173Referee(): KnockaboutMatch {
  const referee = new KnockaboutMatch();
  referee.arm(4);
  for (const [seat, count] of [[0, 4], [1, 2], [2, 4], [3, 1]] as const) {
    for (let i = 0; i < count; i += 1) referee.knockdown(seat);
  }
  referee.step(STEP);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [4, 2, 4, 1]);
  return referee;
}

const Q173_BATCH: readonly RecordedStrike[] = Object.freeze([
  hit(0, 1, { swing: 7, travelX: 1, travelZ: 0 }),
  hit(2, 1, { swing: 3, travelX: 0, travelZ: 1 }),
  hit(1, 0, { swing: 5, travelX: -1, travelZ: 0 }),
]);

test('q173: two attackers share one victim, and the bout is drawn between them', () => {
  const referee = q173Referee();
  const participants = room(4);
  const resolution = resolve(Q173_BATCH, participants);

  assert.deepEqual(resolution.victims.map((one) => one.victim), [0, 1]);
  assert.deepEqual(resolution.victims[0].credited, [1], 'B’s return swing stands');
  assert.deepEqual(resolution.victims[1].credited, [0, 2], 'A and C share B');

  const applied = apply(resolution, referee, participants);
  assert.deepEqual(applied.downed, [0, 1]);
  assert.equal(referee.step(STEP).ended, true);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [5, 3, 5, 1]);
  assert.equal(referee.state.winner, null, 'a shared top is a draw');
  const card = referee.result();
  assert.deepEqual(card?.tiedLeaders, [0, 2]);
  assert.deepEqual(card?.places, [1, 3, 1, 4]);
});

test('q173: the same batch with C’s swing uncommitted is a win for A alone', () => {
  const referee = q173Referee();
  const participants = room(4);
  const resolution = resolve([
    Q173_BATCH[0],
    { ...Q173_BATCH[1], committed: false },
    Q173_BATCH[2],
  ], participants);

  assert.deepEqual(resolution.victims[1].credited, [0]);
  assert.deepEqual(resolution.victims[1].shoves, [2], 'C’s shove is a no-op on a crashing rider');

  apply(resolution, referee, participants);
  assert.equal(referee.step(STEP).ended, true);
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [5, 3, 4, 1]);
  assert.equal(referee.state.winner, 0);
  assert.deepEqual(referee.result()?.tiedLeaders, []);
  assert.deepEqual(referee.result()?.places, [1, 3, 2, 4]);
});

test('q173: the same batch with B inside the recovery window credits nobody for B', () => {
  const referee = q173Referee();
  const participants = room(4);
  participants[1] = standing({ immune: true });
  const resolution = resolve(Q173_BATCH, participants);

  const forB = resolution.victims.find((one) => one.victim === 1)!;
  assert.equal(forB.crashDirection, null);
  assert.deepEqual(forB.credited, []);
  assert.deepEqual(forB.shoves, [0, 2]);

  const applied = apply(resolution, referee, participants);
  assert.deepEqual(applied.downed, [0], 'B’s return swing on A still lands');
  assert.equal(referee.step(STEP).ended, false, 'nobody reached five');
  assert.deepEqual(referee.state.scores.map((score) => score.knockdowns), [4, 3, 4, 1]);
  assert.deepEqual(referee.state.places, [1, 3, 1, 4]);
});

// ---------------------------------------------------------------------------
// The claim the milestone turns on: order decides nothing
// ---------------------------------------------------------------------------

test('every order of one batch resolves to the same plan', () => {
  const participants = room(4);
  participants[3] = standing({ immune: true });
  const batch: readonly RecordedStrike[] = [
    hit(0, 1, { swing: 7, travelX: 0.8, travelZ: 0.2 }),
    hit(2, 1, { swing: 3, travelX: -0.1, travelZ: 0.9 }),
    hit(1, 0, { swing: 5, travelX: -0.4, travelZ: -0.7 }),
    hit(1, 3, { swing: 5, travelX: -0.4, travelZ: -0.7 }),
    hit(3, 2, { swing: 2, committed: false, travelX: 0.3, travelZ: 0 }),
  ];
  const pool = new StrikeBatch();
  let reference: string | null = null;
  for (const order of permutations(batch)) {
    const resolution = resolve(order, participants, pool);
    // Stringified, so the comparison includes the exact bits of every
    // direction: floating addition is not associative, which is why the sum
    // is accumulated in seat order rather than in arrival order.
    const played = JSON.stringify({
      victims: resolution.victims,
      refused: refusals(resolution),
      overflowed: resolution.overflowed,
    });
    if (reference === null) reference = played;
    else assert.equal(played, reference, `order ${order.map((one) => `${one.attacker}->${one.victim}`).join(' ')} differed`);
  }
  assert.notEqual(reference, null);
});

test('every order of one batch produces the same match', () => {
  // The same claim one layer up, which is the one a player would notice.
  const participants = room(4);
  const batch = [hit(0, 1), hit(2, 1), hit(1, 0), hit(3, 2)];
  let reference: unknown = null;
  for (const order of permutations(batch)) {
    const referee = new KnockaboutMatch();
    referee.arm(4);
    apply(resolve(order, participants), referee, participants);
    referee.step(STEP);
    const played = {
      tallies: referee.state.scores.map((score) => score.knockdowns),
      places: referee.state.places,
      leaders: referee.state.leaders,
    };
    if (reference === null) reference = played;
    else assert.deepEqual(played, reference);
  }
});

test('relabelling the seats relabels the plan and nothing else', () => {
  // A batch played by four riders sitting one chair along. Every outcome must
  // move with them, which is the "no seat-order advantage" claim said the way
  // a QA pass can see it.
  const shifted = (shift: number) => {
    const seat = (index: number) => (index + shift) % 4;
    const resolution = resolve([
      hit(seat(0), seat(1), { travelX: 1, travelZ: 0 }),
      hit(seat(2), seat(1), { travelX: 0, travelZ: 1 }),
      hit(seat(3), seat(0), { committed: false }),
    ], room(4));
    return resolution.victims.map((one) => ({
      victim: (one.victim - shift + 4) % 4,
      credited: [...one.credited].map((one) => (one - shift + 4) % 4).sort((a, b) => a - b),
      shoves: [...one.shoves].map((one) => (one - shift + 4) % 4).sort((a, b) => a - b),
      crashDirection: one.crashDirection,
    })).sort((a, b) => a.victim - b.victim);
  };
  const base = shifted(0);
  for (let shift = 1; shift < 4; shift += 1) assert.deepEqual(shifted(shift), base);
});

// ---------------------------------------------------------------------------
// The bounded scratch
// ---------------------------------------------------------------------------

test('the pool holds every directed pair of a four-seat room', () => {
  const batch = new StrikeBatch(4);
  assert.equal(batch.capacity, 12, 'four seats make twelve directed pairs');
  assert.equal(new StrikeBatch(3).capacity, 6);
  assert.equal(new StrikeBatch(2).capacity, 2);

  const participants = room(4);
  const hits: RecordedStrike[] = [];
  for (let attacker = 0; attacker < 4; attacker += 1) {
    for (let victim = 0; victim < 4; victim += 1) {
      if (attacker !== victim) hits.push(hit(attacker, victim, { swing: attacker + 1 }));
    }
  }
  assert.equal(hits.length, 12, 'the worst legitimate step');
  const resolution = resolve(hits, participants, batch);
  assert.equal(batch.recorded, 12);
  assert.equal(resolution.overflowed, 0);
  assert.deepEqual(resolution.refused, []);
  assert.deepEqual(resolution.victims.map((one) => one.credited), [
    [1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2],
  ]);
});

test('a thirteenth hit is refused out loud, never dropped in silence', () => {
  // §37.3, and the defect it names: the buffer this replaces held four entries
  // and dropped the overflow with no error at all.
  const batch = new StrikeBatch(4);
  batch.clear();
  for (let index = 0; index < 12; index += 1) {
    assert.equal(batch.record(0, 1, index, true, 1, 0), true);
  }
  assert.equal(batch.record(0, 1, 99, true, 1, 0), false, 'the pool said no');
  assert.equal(batch.overflowed, 1);
  const resolution = batch.resolve(room(4));
  assert.equal(resolution.overflowed, 1, 'and the resolution says so too');
});

test('a batch too narrow to be a fight is refused at construction', () => {
  assert.throws(() => new StrikeBatch(1), RangeError);
  assert.throws(() => new StrikeBatch(2.5), RangeError);
});

test('an empty step allocates nothing and says nothing', () => {
  const batch = new StrikeBatch();
  const first = batch.resolve(room(4));
  const second = batch.resolve(room(4));
  assert.equal(first, second, 'one shared frozen answer, not two allocations');
  assert.deepEqual(first.victims, []);
  assert.deepEqual(first.refused, []);
  assert.equal(first.overflowed, 0);
});

test('clearing drains the batch, including the overflow it refused', () => {
  const batch = new StrikeBatch(2);
  batch.record(0, 1, 1, true, 1, 0);
  batch.record(1, 0, 1, true, 1, 0);
  assert.equal(batch.record(0, 1, 2, true, 1, 0), false);
  assert.equal(batch.overflowed, 1);
  batch.clear();
  assert.equal(batch.recorded, 0);
  assert.equal(batch.overflowed, 0);
  assert.deepEqual(batch.resolve(room(2)).victims, []);
});

test('the plan is frozen, so a caller cannot edit the step it is applying', () => {
  const resolution = resolve([hit(0, 1), hit(2, 1, { committed: false })], room(3));
  assert.ok(Object.isFrozen(resolution));
  assert.ok(Object.isFrozen(resolution.victims));
  assert.ok(Object.isFrozen(resolution.victims[0]));
  assert.ok(Object.isFrozen(resolution.victims[0].credited));
  assert.ok(Object.isFrozen(resolution.victims[0].crashDirection));
  assert.throws(() => {
    (resolution.victims[0] as unknown as { victim: number }).victim = 2;
  }, TypeError);
});

test('two seats resolve exactly as they did before the milestone', () => {
  // The regression contract (§37.1) at this layer: one attacker, one victim,
  // one credit, and the direction the paddle actually travelled.
  const participants = room(2);
  const resolution = resolve([hit(0, 1, { travelX: 0.6, travelZ: -0.8 })], participants);
  assert.deepEqual(resolution.victims.length, 1);
  assert.deepEqual(resolution.victims[0].credited, [0]);
  assert.ok(Math.abs(resolution.victims[0].crashDirection!.x - 0.6) < 1e-12);
  assert.ok(Math.abs(resolution.victims[0].crashDirection!.z + 0.8) < 1e-12);

  participants[1] = standing({ down: true });
  assert.deepEqual(resolve([hit(0, 1)], participants).victims, []);
});

test('identical batches resolve identically, every time', () => {
  const participants = room(4);
  const batch = [
    hit(0, 1, { swing: 3, travelX: 0.31, travelZ: 0.77 }),
    hit(2, 1, { swing: 9, travelX: -0.11, travelZ: 0.42 }),
    hit(3, 0, { swing: 4, committed: false }),
  ];
  const once = JSON.stringify(resolve(batch, participants));
  const twice = JSON.stringify(resolve(batch, participants));
  assert.equal(once, twice);
});

// ---------------------------------------------------------------------------
// The claims the header makes that the first pass left unheld — repair pass,
// 2026-09-13. Every test below was written against a deliberately mutated copy
// of `strikeBatch.ts` first and fails on it; the note in each says which
// mutation, because a test nobody watched fail is a test nobody has checked.
// ---------------------------------------------------------------------------

test('the dedup key really is attacker × swing × victim, not attacker × victim', () => {
  // The swing is a third of the key §37.3 names, and the test above it only
  // exercises the other two: a different victim is a different pair under
  // either key. This is the batch that tells them apart — one attacker, one
  // victim, two swings — and deleting the swing clause from `refusalFor`
  // refuses the second hit as a `duplicate` and loses its travel entirely.
  //
  // One `Paddle.step` per attacker per tick means `Game` cannot record it
  // today. It is held anyway because the key is a stated rule, and the day a
  // paddle gains a second active swing is not the day to discover that the
  // rule was only ever half implemented.
  const resolution = resolve([
    hit(0, 1, { swing: 1, travelX: 1, travelZ: 0 }),
    hit(0, 1, { swing: 2, travelX: 0, travelZ: 1 }),
  ], room(4));
  assert.deepEqual(resolution.refused, [], 'a distinct swing was refused as a duplicate');
  assert.deepEqual(resolution.victims.map((one) => one.victim), [1]);
  assert.deepEqual(resolution.victims[0].credited, [0], 'one attacker is credited once');
  const direction = resolution.victims[0].crashDirection!;
  assert.equal(direction.x, 1 / Math.SQRT2, 'the second swing’s travel was dropped');
  assert.equal(direction.z, 1 / Math.SQRT2);
});

test('the travel sum is taken in ascending seat order, not merely in a fixed one', () => {
  // The permutation tests above permute the *recorded* order, so any fixed
  // loop order survives them — reversing the attacker loop passes every one.
  // Floating addition is not associative, and this is the batch that can see
  // the difference: ascending, (1 + 1e16) − 1e16 is 0 and the sum is
  // degenerate; descending, (−1e16 + 1e16) + 1 is 1 and the victim falls east.
  //
  // No paddle travels 1e16 m in a step — head travel is metres and the 1e-6 m
  // guard absorbs anything realistic — so this pins the named order rather
  // than a behaviour a rider could ever meet.
  const participants = [standing(), standing(), standing(), standing({ headingY: 0.4 })];
  const resolution = resolve([
    hit(0, 3, { swing: 1, travelX: 1, travelZ: 0 }),
    hit(1, 3, { swing: 2, travelX: 1e16, travelZ: 0 }),
    hit(2, 3, { swing: 3, travelX: -1e16, travelZ: 0 }),
  ], participants);
  const direction = resolution.victims[0].crashDirection!;
  assert.equal(direction.x, -Math.sin(0.4), 'the sum was not accumulated seat-ascending');
  assert.equal(direction.z, -Math.cos(0.4));
});

test('one attacker’s hits are summed in ascending swing order', () => {
  // The same instrument one level down: `nextHitOn` walks a pair's swings
  // lowest-first, and reversing that scan passes every other test in the file.
  const participants = [standing(), standing({ headingY: 0.4 }), standing(), standing()];
  const resolution = resolve([
    hit(0, 1, { swing: 3, travelX: -1e16, travelZ: 0 }),
    hit(0, 1, { swing: 1, travelX: 1, travelZ: 0 }),
    hit(0, 1, { swing: 2, travelX: 1e16, travelZ: 0 }),
  ], participants);
  const direction = resolution.victims[0].crashDirection!;
  assert.equal(direction.x, -Math.sin(0.4), 'the swings were not summed lowest-first');
  assert.equal(direction.z, -Math.cos(0.4));
});

test('the refusals come back in the order they were recorded', () => {
  // `refusals()` above sorts, which is right for the permutation claim and
  // wrong for this one: the documented recorded order survived a `push` being
  // turned into an `unshift`. It is a diagnostic and nothing reads it, but a
  // QA pass reading a log is told it is the order the batch saw.
  const participants = [standing(), standing({ down: true }), standing(), standing()];
  const resolution = resolve([
    hit(0, 0, { swing: 1 }),
    hit(2, 1, { swing: 2 }),
    hit(9, 3, { swing: 3 }),
  ], participants);
  assert.deepEqual(resolution.refused.map((one) => one.swing), [1, 2, 3]);
  assert.deepEqual(
    resolution.refused.map((one) => one.reason),
    ['self', 'victim-down', 'no-attacker'],
  );
});

test('a swing with no identity is refused, and does not freeze the step', () => {
  // A `NaN` swing advances past nothing, so `resolveVictim`'s walk chose the
  // same entry for ever: before the guard this call did not return at all and
  // the probe had to be killed. A `-Infinity` was worse company — accepted,
  // never walked, and silently absent from the plan.
  //
  // `Paddle.swingCount` is an integer counter and produces neither. The file
  // already refuses a non-integer seat index in `fighting()` for the same
  // reason: a frozen fixed step is a worse answer than a refused hit.
  for (const swing of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const resolution = resolve([hit(0, 1, { swing })], room(2));
    assert.deepEqual(resolution.victims, [], `${swing} landed a hit`);
    assert.deepEqual(resolution.refused.map((one) => one.reason), ['bad-swing'], `${swing}`);
  }

  // And it takes only itself down with it: an ordinary hit beside it stands.
  const mixed = resolve([hit(0, 1, { swing: Number.NaN }), hit(2, 1, { swing: 3 })], room(3));
  assert.deepEqual(mixed.refused.map((one) => one.reason), ['bad-swing']);
  assert.deepEqual(mixed.victims[0].credited, [2]);
});

test('the order claim is over well-formed batches, and the duplicate is the exception', () => {
  // Recording one attacker × swing × victim twice with *different* facts is
  // the one batch whose result depends on the recording order, because the
  // duplicate refusal keeps whichever arrived first. Pinned in both directions
  // so the scope of "order decides nothing" is visible in a test rather than
  // implied by the batches the other tests happen to use.
  //
  // `Game` cannot produce it: a paddle steps once per attacker per tick, and
  // `committed` and `headTravelX`/`Z` belong to the swing the id names.
  const committedFirst = resolve([
    hit(0, 1, { swing: 4, committed: true }),
    hit(0, 1, { swing: 4, committed: false }),
  ], room(3));
  assert.deepEqual(committedFirst.victims[0].credited, [0]);
  assert.deepEqual(committedFirst.victims[0].shoves, []);

  const shoveFirst = resolve([
    hit(0, 1, { swing: 4, committed: false }),
    hit(0, 1, { swing: 4, committed: true }),
  ], room(3));
  assert.deepEqual(shoveFirst.victims[0].credited, []);
  assert.deepEqual(shoveFirst.victims[0].shoves, [0]);

  // Both are the same rule read twice — first recorded wins — and both report
  // the loser as a duplicate, which is how a QA log says which one was kept.
  assert.deepEqual(refusals(committedFirst), ['0->1#4:duplicate']);
  assert.deepEqual(refusals(shoveFirst), ['0->1#4:duplicate']);
});
