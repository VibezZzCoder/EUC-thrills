/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CONTACT } from '../data/tuning.ts';
import {
  ContactPair,
  type ContactBody,
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

test('leaving the overlap makes the next overlap a new edge', () => {
  const pair = new ContactPair();
  const merged = { ...STILL, x: CONTACT.radiusMetres * 0.5 };
  const clear = { ...STILL, x: CONTACT.radiusMetres + 0.01 };
  assert.ok(pair.step(STEP, STILL, merged));
  assert.equal(pair.step(STEP, STILL, clear), null);
  assert.ok(pair.step(STEP, STILL, merged));
});

test('a pair oscillating across the boundary is charged on every entry', () => {
  /*
   * **§26.3's edge rule working as written, not a bug** — pinned at M26 Phase
   * 1 because nothing rides it yet and it is the shape a real graze takes.
   *
   * The cooldown is cleared the moment the pair separates, so it bounds how
   * often a *continuously merged* pair pays and says nothing at all about a
   * pair that keeps meeting. Four entries inside one cooldown window are four
   * contacts. The alternative — a cooldown that survived separation — would
   * make a rider who bounced off you, came back and hit you again cost
   * nothing the second time, which is the wrong reading of both the mechanic
   * and the word.
   */
  const pair = new ContactPair();
  const merged = { ...STILL, x: CONTACT.radiusMetres * 0.5 };
  const clear = { ...STILL, x: CONTACT.radiusMetres + 0.01 };

  const entries = 4;
  let charged = 0;
  let elapsed = 0;
  for (let cycle = 0; cycle < entries; cycle += 1) {
    if ((pair.step(STEP, STILL, merged)?.charge ?? null) !== null) charged += 1;
    elapsed += STEP;
    assert.equal(pair.step(STEP, STILL, clear), null, 'a clear pair is never a contact');
    elapsed += STEP;
  }

  // The whole oscillation has to fit inside one cooldown, or this is merely
  // the re-arm test above wearing a loop.
  assert.ok(
    elapsed < CONTACT.cooldownSeconds,
    `the oscillation spanned ${elapsed}s, which is not inside one ${CONTACT.cooldownSeconds}s cooldown`,
  );
  assert.equal(charged, entries, 'an entry after a separation is a new contact, every time');
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
