/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CONTACT } from '../data/tuning.ts';
import {
  ContactPair,
  ContactRoom,
  type ContactBody,
  type ContactRider,
  type ContactTuning,
} from './contact.ts';

const STEP = 0.01;
const STILL: ContactBody = { x: 0, z: 0, velocityX: 0, velocityZ: 0 };
const TUNING: ContactTuning = { ...CONTACT };

test('bodies outside the contact radius do not produce a bump', () => {
  const clear = { ...STILL, x: CONTACT.radiusMetres + 0.01 };
  assert.equal(new ContactPair().step(STEP, STILL, clear), null);
});

test('a continuously merged pair is charged once inside the cooldown', () => {
  const pair = new ContactPair();
  const other = { ...STILL, x: CONTACT.radiusMetres * 0.5 };

  const first = pair.step(STEP, STILL, other);
  assert.ok(first, 'the initial overlap must be a contact edge');
  assert.deepEqual(first.charge?.first, {
    pushX: -CONTACT.separationSpeed,
    pushZ: 0,
    speedCost: CONTACT.speedCost,
  });
  assert.deepEqual(first.charge?.second, {
    pushX: CONTACT.separationSpeed,
    pushZ: 0,
    speedCost: CONTACT.speedCost,
  });

  for (let elapsed = STEP; elapsed < CONTACT.cooldownSeconds - STEP; elapsed += STEP) {
    assert.equal(
      pair.step(STEP, STILL, other)?.charge ?? null,
      null,
      `charged again at ${elapsed}s`,
    );
  }
});

test('a pair that never leaves is charged once, however long it stays', () => {
  /*
   * **This test used to assert the opposite, and the owner's ride is why it
   * changed** (2026-08-27). §26.3 wrote the charge as *a new overlap **or** an
   * expired cooldown*, and the second clause was safe only for as long as the
   * push was a velocity impulse that flung the pair apart before it could fire
   * twice. The positional separation holds equilibrium instead — two riders
   * leaning into each other settle at exactly the radius and stay — so the
   * clause became a `softKnock` every 0.40 s into a wobble that had not
   * finished decaying, and **put both riders on the ground after about three
   * seconds**. A bump that crashes you is what q72 forbids outright.
   *
   * Entry and cooldown are ANDed now. A sustained lean is one shove. The
   * cooldown has not gone anywhere — it still bounds a pair jittering across
   * the boundary, which is the oscillation test below — it is simply no longer
   * sufficient on its own.
   */
  const pair = new ContactPair();
  const other = { ...STILL, z: CONTACT.radiusMetres * 0.5 };
  assert.ok(pair.step(STEP, STILL, other)?.charge, 'the entry is a contact');

  let charges = 0;
  for (let elapsed = 0; elapsed < CONTACT.cooldownSeconds * 4; elapsed += STEP) {
    if (pair.step(STEP, STILL, other)?.charge) charges += 1;
  }
  assert.equal(charges, 0, 'a pair that never left was charged again');

  // And it is the *leaving* that re-arms it, not the clock — so the mechanic
  // still costs a rider who backs off and comes at you again.
  const clear = { ...STILL, z: CONTACT.radiusMetres + 0.01 };
  assert.equal(pair.step(STEP, STILL, clear), null);
  assert.ok(pair.step(STEP, STILL, other)?.charge, 'a fresh approach is a fresh contact');
});

test('after the cooldown it is the leaving that re-arms the charge, not the clock', () => {
  /*
   * The AND, as a differential: two pairs on the same clock, both well past
   * the cooldown, differing only in whether they ever came apart. Only the one
   * that did is charged again.
   *
   * **Written this way because the single-pair version had gone vacuous.** It
   * used to assert `ok(pair.step(...))` after a separation, which reads like a
   * claim about the edge and is really a claim about the *result object* — and
   * `step` returns one for any overlap, charge or no charge. It passed
   * identically before and after the cooldown fix, and would pass with the
   * edge detector deleted outright.
   */
  const merged = { ...STILL, x: CONTACT.radiusMetres * 0.5 };
  const clear = { ...STILL, x: CONTACT.radiusMetres + 0.01 };
  const stayed = new ContactPair();
  const left = new ContactPair();

  assert.ok(stayed.step(STEP, STILL, merged)?.charge, 'both meet');
  assert.ok(left.step(STEP, STILL, merged)?.charge, 'both meet');

  // Same elapsed time for both, and more than enough of it.
  for (let elapsed = 0; elapsed <= CONTACT.cooldownSeconds; elapsed += STEP) {
    stayed.step(STEP, STILL, merged);
    left.step(STEP, STILL, clear);
  }

  assert.equal(
    stayed.step(STEP, STILL, merged)?.charge ?? null,
    null,
    'a pair that never came apart is one contact however long it lasts',
  );
  assert.ok(
    left.step(STEP, STILL, merged)?.charge,
    'a pair that came apart and met again is a second contact',
  );
});

/** Chatter the pair across the boundary and count what it costs them. */
function oscillate(pair: ContactPair, cycles: number): { charged: number; elapsed: number } {
  const merged = { ...STILL, x: CONTACT.radiusMetres * 0.5 };
  const clear = { ...STILL, x: CONTACT.radiusMetres + 0.01 };
  let charged = 0;
  let elapsed = 0;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    if ((pair.step(STEP, STILL, merged)?.charge ?? null) !== null) charged += 1;
    elapsed += STEP;
    assert.equal(pair.step(STEP, STILL, clear), null, 'a clear pair is never a contact');
    elapsed += STEP;
  }
  return { charged, elapsed };
}

test('a pair oscillating across the boundary is charged once, not once per entry', () => {
  /*
   * **This test asserted the exact opposite until 2026-08-27**, where it stood
   * as a deliberate pin: "§26.3's edge rule working as written, not a bug …
   * four entries inside one cooldown window are four contacts". The Codex QA
   * pass took it at its word and asked what the cooldown was for, and the
   * answer was *nothing*: `step` erased the timer on separation, the
   * separation deliberately overshoots the boundary so a contact can end, so
   * every contact ended by clearing its own cooldown. **Measured at
   * `cooldownSeconds` of 0, 0.40 and 999: four charges in 0.067 s, all
   * three.** A live F4 slider that no value of changes any behaviour is not a
   * rule with an exception, it is a dead variable, and §26.3's table had said
   * all along that the constant exists so "the edge re-arms inside the same
   * collision" cannot happen.
   *
   * Through two real controllers it cost the mode its central promise. A
   * **slow** head-on nudge — 2.4-3.5 m/s closing — took four charges in 67 ms
   * and put both riders down, while a 17 m/s ram took one and put nobody
   * down. The gentlest contact in the game was the only one that crashed you,
   * which is q72 forbidden outright and is what the owner rode into and
   * reported.
   *
   * The old comment's objection survives and is answered below rather than
   * overruled: a rider who backs off and comes at you again must still pay.
   * They do. What they cannot do is pay four times inside 67 ms, because 67 ms
   * of jitter is one collision no matter how many times the distance crossed
   * the radius.
   */
  const { charged, elapsed } = oscillate(new ContactPair(), 4);

  // The whole oscillation has to fit inside one cooldown, or this proves
  // nothing that the re-arm test above does not already prove.
  assert.ok(
    elapsed < CONTACT.cooldownSeconds,
    `the oscillation spanned ${elapsed}s, which is not inside one ${CONTACT.cooldownSeconds}s cooldown`,
  );
  assert.equal(charged, 1, 'chatter inside one cooldown is one contact');
});

test('and it is charged again once the cooldown has actually run out', () => {
  /*
   * The other half, and the half that keeps the old pin's objection true: the
   * cooldown *bounds* the charge, it does not retire the pair. A second
   * approach after the timer expires costs exactly what the first did.
   *
   * Both halves are needed. Without this one, "never charge twice" would pass
   * and the mechanic would be gone; without the one above, the timer is
   * decorative. The clock runs while the pair is apart, which is the point of
   * the change being a decay rather than a freeze — riders who are done with
   * each other are clear within `cooldownSeconds` of being done.
   */
  const pair = new ContactPair();
  assert.equal(oscillate(pair, 4).charged, 1, 'the first meeting is one contact');

  const clear = { ...STILL, x: CONTACT.radiusMetres + 0.01 };
  for (let elapsed = 0; elapsed < CONTACT.cooldownSeconds; elapsed += STEP) {
    assert.equal(pair.step(STEP, STILL, clear), null, 'apart is not a contact');
  }

  assert.equal(oscillate(pair, 4).charged, 1, 'a later approach is a new contact, and one contact');
});

test('no value of the cooldown can be told from any other, was the defect', () => {
  /*
   * **The measurement that found it, kept as an assertion** — because what
   * made the old behaviour invisible for a milestone was that every spec
   * around it described a *pair*, and none of them varied the constant. A
   * tunable is testable by moving it: if two very different values produce
   * identical behaviour, the value is not reaching anything, and no amount of
   * asserting on the default will say so.
   *
   * `999` is not a plausible setting. It is the point: an absurd cooldown must
   * be visibly absurd, and before the fix it was indistinguishable from zero.
   */
  const charges = (cooldownSeconds: number): number => {
    const tuning: ContactTuning = { ...CONTACT, cooldownSeconds };
    const pair = new ContactPair();
    const merged = { ...STILL, x: CONTACT.radiusMetres * 0.5 };
    const clear = { ...STILL, x: CONTACT.radiusMetres + 0.01 };
    let charged = 0;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      if ((pair.step(STEP, STILL, merged, tuning)?.charge ?? null) !== null) charged += 1;
      pair.step(STEP, STILL, clear, tuning);
    }
    return charged;
  };

  assert.equal(charges(0), 4, 'no cooldown must mean every entry is charged');
  assert.equal(charges(CONTACT.cooldownSeconds), 1, 'the shipped cooldown must bound the chatter');
  assert.equal(charges(999), 1, 'and an absurd one must be absurd rather than inert');
});

test('clearing a pair makes the next overlap a new contact', () => {
  /*
   * `clear` is what a caller uses when the pair stops being resolved — contact
   * switched off, a rider teleported, a guest sent home. Without it the pair
   * wakes up holding a cooldown from a meeting that is over and swallows the
   * first bump of the next one, which is a defect that only ever shows up one
   * session later than the thing that caused it.
   *
   * The assertion is the whole contract: a cooldown that would otherwise
   * refuse this step does not, once the pair has been told to forget.
   */
  const pair = new ContactPair();
  const merged = { ...STILL, x: CONTACT.radiusMetres * 0.5 };
  assert.ok(pair.step(STEP, STILL, merged)?.charge, 'the initial overlap must be a contact edge');
  assert.equal(pair.step(STEP, STILL, merged)?.charge ?? null, null, 'the cooldown must be armed to clear');

  pair.clear();
  assert.ok(pair.step(STEP, STILL, merged)?.charge, 'a cleared pair meets for the first time again');
});

test('coincident bodies receive a finite deterministic axis', () => {
  const first = new ContactPair().step(STEP, STILL, STILL, TUNING);
  const second = new ContactPair().step(STEP, STILL, STILL, TUNING);
  assert.deepEqual(first, second);
  assert.ok(first);
  assert.deepEqual(first.charge?.first, {
    pushX: -CONTACT.separationSpeed,
    pushZ: 0,
    speedCost: CONTACT.speedCost,
  });
  assert.deepEqual(first.charge?.second, {
    pushX: CONTACT.separationSpeed,
    pushZ: 0,
    speedCost: CONTACT.speedCost,
  });
  assert.ok(Number.isFinite(first.charge?.first.pushX));
  assert.ok(Number.isFinite(first.charge?.first.pushZ));
});

test('coincident moving bodies separate against their relative travel', () => {
  const moving = { ...STILL, velocityZ: 4 };
  const result = new ContactPair().step(STEP, moving, STILL);
  assert.ok(result);
  assert.deepEqual(result.charge?.first, {
    pushX: 0,
    pushZ: -CONTACT.separationSpeed,
    speedCost: CONTACT.speedCost,
  });
  assert.deepEqual(result.charge?.second, {
    pushX: 0,
    pushZ: CONTACT.separationSpeed,
    speedCost: CONTACT.speedCost,
  });
});

test('a merged pair is pushed apart on every step, cooldown or not', () => {
  /*
   * **The half that is not an event** — M26 Phase 2's ride gate, from the
   * owner's couch. Two riders in the same place is a fact that stays true
   * until it stops being true; gating it behind the charge's cooldown let them
   * sit inside one another for 0.40 s at a time, which he reported as being
   * able to clip and ride through the other player.
   *
   * So the charge appears once and the push appears every single step.
   */
  const pair = new ContactPair();
  const other = { ...STILL, x: CONTACT.radiusMetres * 0.5 };

  let charges = 0;
  let steps = 0;
  let pushed = 0;
  for (let elapsed = 0; elapsed < CONTACT.cooldownSeconds - STEP; elapsed += STEP) {
    const result = pair.step(STEP, STILL, other);
    assert.ok(result, 'a merged pair always has an answer');
    steps += 1;
    if (result.charge !== null) charges += 1;
    if (result.pushMetres > 0) pushed += 1;
  }

  assert.equal(charges, 1, 'the wobble and the speed shed are an event');
  assert.equal(pushed, steps, 'the separation is not');
});

test('the push clears the boundary instead of resting on it', () => {
  /*
   * **A contact has to be able to end.** A constant `separationSpeed × dt`
   * applied to a pair that is barely touching would throw them well past the
   * radius; capping at *half* the overlap converges on exactly touching, which
   * is the one distance that is still inside the radius forever — two players
   * parked beside each other would be re-charged every cooldown for as long as
   * they stood there. The cap is the whole overlap, so the last step carries
   * them clear, by no more than one step's rate.
   */
  const pair = new ContactPair();
  const startedAt = CONTACT.radiusMetres - 0.002;
  const barely = { ...STILL, x: startedAt };
  const result = pair.step(STEP, STILL, barely);
  assert.ok(result);
  // **The behavioural claim, not the arithmetic one**: both bodies move, so the
  // question is where the pair ends up rather than what either half was worth.
  assert.ok(
    startedAt + result.pushMetres * 2 > CONTACT.radiusMetres,
    `a pair 2mm inside the radius stayed inside it at ${startedAt + result.pushMetres * 2}m`,
  );
  assert.ok(
    result.pushMetres <= CONTACT.separationSpeed * STEP + 1e-9,
    'and it is still never more than one step of the rate',
  );

  // And a deeply merged pair is limited by the rate rather than by the overlap,
  // so the two caps are provably different rules and not one written twice.
  const deep = new ContactPair().step(STEP, STILL, STILL);
  assert.ok(deep);
  assert.equal(deep.pushMetres, CONTACT.separationSpeed * STEP);
});

// ---------------------------------------------------------------------------
// ContactRoom — the couch's pass (1.4.0 QA COUCH-1/3/4)
// ---------------------------------------------------------------------------

/** A body that moves as it is pushed and records every call. */
class Recorder implements ContactRider {
  inComeBackAir = false;
  discontinuitySerial = 0;
  readonly calls: string[] = [];
  bumps = 0;
  readonly body: { x: number; z: number; velocityX: number; velocityZ: number };
  constructor(body: { x: number; z: number; velocityX: number; velocityZ: number }) {
    this.body = body;
  }
  separate(deltaX: number, deltaZ: number): void {
    this.calls.push(`separate ${deltaX} ${deltaZ}`);
    this.body.x += deltaX;
    this.body.z += deltaZ;
  }
  bump(pushX: number, pushZ: number, speedCost: number): void {
    this.calls.push(`bump ${pushX} ${pushZ} ${speedCost}`);
    this.bumps += 1;
  }
}

/** Two bodies that close, merge, part and close again, stepped `steps` times. */
function twoSeatScript(step: number): [ContactBody, ContactBody] {
  const gap = 0.3 + Math.abs(Math.sin(step * 0.05)) * 1.2;
  return [{ x: 0, z: 0, velocityX: 1, velocityZ: 0 }, { x: gap, z: 0.1 * Math.sin(step * 0.3), velocityX: -1, velocityZ: 0 }];
}

test('ContactRoom with two seats is exactly the one pair it always was', () => {
  const room = new ContactRoom(4);
  const pair = new ContactPair();
  const roomRiders = [new Recorder({ ...STILL }), new Recorder({ ...STILL })];
  const pairRiders = [new Recorder({ ...STILL }), new Recorder({ ...STILL })];
  for (let step = 0; step < 2000; step += 1) {
    const [a, b] = twoSeatScript(step);
    room.step(STEP, [a, b], roomRiders, TUNING, null, false);
    const contact = pair.step(STEP, a, b, TUNING);
    if (contact === null) continue;
    pairRiders[0].separate(-contact.axisX * contact.pushMetres, -contact.axisZ * contact.pushMetres);
    pairRiders[1].separate(contact.axisX * contact.pushMetres, contact.axisZ * contact.pushMetres);
    if (contact.charge) {
      pairRiders[0].bump(contact.charge.first.pushX, contact.charge.first.pushZ, contact.charge.first.speedCost);
      pairRiders[1].bump(contact.charge.second.pushX, contact.charge.second.pushZ, contact.charge.second.speedCost);
    }
  }
  assert.ok(pairRiders[0].bumps > 3, 'the script must charge more than once');
  assert.deepEqual(roomRiders.map((rider) => rider.calls), pairRiders.map((rider) => rider.calls));
});

test('ContactRoom charges a rider once per cooldown however many pairs meet it (three seats and up)', () => {
  const room = new ContactRoom(4);
  // One rider in the middle, three others entering it on the same step.
  const centre = { x: 0, z: 0, velocityX: 0, velocityZ: 0 };
  const others = [0, 1, 2].map((index) => ({ x: Math.cos(index * 2.1) * 0.5, z: Math.sin(index * 2.1) * 0.5, velocityX: 0, velocityZ: 0 }));
  const riders = [centre, ...others].map((body) => new Recorder(body));
  const bodies = [centre, ...others];
  room.step(STEP, bodies, riders, TUNING, null, false);
  assert.equal(riders[0].bumps, 1, 'three pairs entered the centre rider in one step');
  assert.ok(riders.slice(1).every((rider) => rider.bumps === 1), 'each other rider still pays its own entry');
  // Within the cooldown nobody pays again, however the pairs part and re-enter.
  for (let step = 1; step * STEP < TUNING.cooldownSeconds - 1e-9; step += 1) {
    for (const body of others) { body.x *= 0.5; body.z *= 0.5; }
    room.step(STEP, bodies, riders, TUNING, null, false);
  }
  assert.equal(riders[0].bumps, 1);
  // An excluded seat leaves two taking part: the per-pair rule alone, as ever.
  const pairRoom = new ContactRoom(4);
  const trio = [new Recorder({ ...STILL }), new Recorder({ ...STILL, x: 0.5 }), new Recorder({ ...STILL, x: -0.5 })];
  pairRoom.step(STEP, trio.map((rider) => rider.body), trio, TUNING, (seat) => seat === 2, false);
  assert.equal(trio[0].bumps, 1);
  assert.equal(trio[2].calls.length, 0);
});

test('ContactRoom leaves a pair alone while either seat is in a come-back air', () => {
  const room = new ContactRoom(4);
  const riders = [new Recorder({ ...STILL }), new Recorder({ ...STILL, x: 0.4 })];
  riders[0].inComeBackAir = true;
  room.step(STEP, riders.map((rider) => rider.body), riders, TUNING, null, false);
  assert.deepEqual(riders.map((rider) => rider.calls.length), [0, 0]);
  // Back on the ground the overlap is a fresh entry: the pair forgot its history.
  riders[0].inComeBackAir = false;
  room.step(STEP, riders.map((rider) => rider.body), riders, TUNING, null, false);
  assert.deepEqual(riders.map((rider) => rider.bumps), [1, 1]);
});

test('ContactRoom: a recovery set down inside a rider is adopted, not charged — on plans that restart at rest only', () => {
  for (const atRest of [true, false]) {
    const room = new ContactRoom(4);
    const riders = [new Recorder({ ...STILL }), new Recorder({ ...STILL, x: 5 })];
    room.step(STEP, riders.map((rider) => rider.body), riders, TUNING, null, atRest);
    // Seat 1 is placed on top of seat 0: a new discontinuity serial.
    riders[1].body.x = 0.1;
    riders[1].discontinuitySerial += 1;
    room.step(STEP, riders.map((rider) => rider.body), riders, TUNING, null, atRest);
    assert.equal(riders[0].bumps, atRest ? 0 : 1, `at rest ${atRest}`);
    assert.ok(riders[0].calls.some((call) => call.startsWith('separate')), 'the placement still separates');
  }
});

test('QA R2-COUCH1-CLEAR: a third seat\'s respawns never re-charge two riders leaning on each other', () => {
  // Seats 0 and 1 overlap and drive into each other for 4 s; seat 2, far
  // away, presses R every 15 steps, and Game skips the room's step on a
  // teleport step. Forgetting only the teleported seat leaves the leaning
  // pair its one charge each; the old whole-room clear (the control) wiped
  // both their pair cooldown and their charge clocks on every press.
  const run = (forget: (room: ContactRoom) => void): number[] => {
    const room = new ContactRoom(4);
    const riders = [new Recorder({ x: 0, z: 0, velocityX: 1, velocityZ: 0 }),
      new Recorder({ x: 0.5, z: 0, velocityX: -1, velocityZ: 0 }),
      new Recorder({ x: -20, z: 10, velocityX: 0, velocityZ: 0 })];
    for (let step = 0; step * STEP < 4; step += 1) {
      // Leaning: whatever the push did, they are back inside each other.
      riders[0].body.x = 0;
      riders[1].body.x = 0.5;
      if (step > 0 && step % 15 === 0) {
        forget(room);
        continue;
      }
      room.step(STEP, riders.map((rider) => rider.body), riders, TUNING, null, false);
    }
    return riders.map((rider) => rider.bumps);
  };
  assert.deepEqual(run((room) => room.forgetResets([false, false, true])), [1, 1, 0]);
  const control = run((room) => room.clear());
  assert.ok(control[0] > 5 && control[1] > 5, `the whole-room clear charged ${control.join('/')}`);
  // With two seats the one pair holds the resetting seat: forgetResets is clear.
  const pairRoom = new ContactRoom(4);
  const pair = [new Recorder({ ...STILL }), new Recorder({ ...STILL, x: 0.4 })];
  pairRoom.step(STEP, pair.map((rider) => rider.body), pair, TUNING, null, false);
  pairRoom.forgetResets([false, true]);
  pairRoom.step(STEP, pair.map((rider) => rider.body), pair, TUNING, null, false);
  assert.deepEqual(pair.map((rider) => rider.bumps), [2, 2]);
});
