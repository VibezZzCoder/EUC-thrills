/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateLevel } from './generateRoute.ts';
import {
  DEFAULT_SEED,
  MAX_SEED_LENGTH,
  ROUTE_SEED_SPACE,
  createLevel,
  hazardProbeFromQuery,
  levelFromQuery,
  normaliseSeed,
  requestRoute,
  routeSeedFrom,
  seedFromQuery,
  topSpeedFromQuery,
} from './levels.ts';
import { planDigest } from './planDigest.ts';

test('a level query only accepts the three levels the game owns', () => {
  assert.equal(levelFromQuery('?level=slice'), 'slice');
  assert.equal(levelFromQuery('?level=proving'), 'proving');
  assert.equal(levelFromQuery('?level=generated'), 'generated');

  // `in` also sees Object.prototype. A query is untrusted input, so inherited
  // names must fall back just like an ordinary typo instead of being called as
  // if they were LevelPlan builders.
  for (const inherited of ['toString', 'constructor', '__proto__']) {
    assert.equal(levelFromQuery(`?level=${inherited}`), 'slice', inherited);
  }
});

test('a hazard probe accepts one complete finite metre value and nothing partial', () => {
  assert.equal(hazardProbeFromQuery('?hazardprobe=30'), 30);
  assert.equal(hazardProbeFromQuery('?hazardprobe=1e2'), 100);
  for (const query of [
    '', '?hazardprobe=', '?hazardprobe=4.99', '?hazardprobe=30metres', '?hazardprobe=0x20',
    '?hazardprobe=Infinity', '?hazardprobe=NaN',
  ]) {
    assert.equal(hazardProbeFromQuery(query), undefined, query);
  }
});

test('the top-speed switch takes one complete mph value inside its window and nothing else', () => {
  // M30 Phase 0 — `?hazardprobe=`'s grammar, with a window instead of a floor.
  assert.equal(topSpeedFromQuery('?mph=65'), 65);
  assert.equal(topSpeedFromQuery('?mph=58.5'), 58.5);
  assert.equal(topSpeedFromQuery('?mph=20'), 20);
  assert.equal(topSpeedFromQuery('?mph=90'), 90);
  assert.equal(topSpeedFromQuery('?level=track&mph=6.5e1'), 65);
  for (const query of [
    '', '?mph', '?mph=', '?mph=19.99', '?mph=90.01', '?mph=65mph', '?mph=0x41',
    '?mph=Infinity', '?mph=NaN', '?mph=-65', '?MPH=65',
  ]) {
    assert.equal(topSpeedFromQuery(query), undefined, query);
  }
});

test('the switch reaches the generator through both of the doors Game builds worlds with', () => {
  // M30 Phase 1. `Game` builds a world two ways — `createLevel` by id at boot
  // and on a mode swap, `requestRoute` by seed for a fresh route — and both now
  // carry `?mph=`. A route that arrived through one door and not the other
  // would leave a session riding a world spaced for a wheel it is not on, which
  // is precisely the unfairness the switch exists to avoid.
  //
  // **The switch's working value is `?mph=50` since M30 Phase 4**, because 65
  // is the frozen table now — so the door test asks for the *slower* wheel.
  // Asking for 65 would compare the shipped road with itself and pass on an
  // identity rather than on the parameter arriving.
  const slow = generateLevel('route-41', undefined, undefined, 50).plan;
  const shipped = generateLevel('route-41').plan;

  const byLevel = createLevel('generated', 'route-41', undefined, undefined, 50);
  assert.deepStrictEqual(byLevel.hazards, slow.hazards);
  assert.notDeepStrictEqual(byLevel.hazards, shipped.hazards);
  assert.deepStrictEqual(byLevel.targets, slow.targets);

  const outcome = requestRoute('route-41', undefined, undefined, 50);
  assert.ok(outcome.ok);
  if (!outcome.ok) return;
  assert.deepStrictEqual(outcome.plan.hazards, slow.hazards);
  assert.notDeepStrictEqual(outcome.plan.hazards, shipped.hazards);
  // The seed is still the seed: the switch is not level identity, so the world
  // is filed under exactly the id it would have been without it.
  assert.equal(outcome.plan.id, shipped.id);
});

test('the hand-authored worlds are the same worlds under the switch', () => {
  // Only a generator spaces a road for a wheel — `BUILDERS` says why. The slice,
  // the proving ground and BelVar were laid out by hand and accepted as they
  // are, so `?mph=` has to reach them as nothing at all.
  for (const id of ['slice', 'proving', 'track'] as const) {
    for (const mph of [20, 50, 65, 90]) {
      assert.equal(
        planDigest(createLevel(id, DEFAULT_SEED, undefined, undefined, mph)),
        planDigest(createLevel(id)),
        `${id} changed under ?mph=${mph}`,
      );
    }
  }
});

/**
 * A seed as something a player types, says out loud, and sends — M12 Phase 4.
 *
 * Everything here exists because of one sentence in `seedStreams.ts`: a ghost
 * is only comparable against the same ground, so **a seed that meant two
 * different places would quietly invalidate every personal best in the game.**
 * Phase 2 made that true of the generator. This file makes it true of the
 * string on its way in — from a field, from a URL, from a phone that
 * capitalised the first letter, from a chat client that added a trailing space.
 *
 * The other half is the refusal. The owner's decision of 2026-08-08
 * (`docs/PLANS.md` §13, under q6) is that a seed which does not build is
 * *rejected* and never silently answered with the hand-authored slice. The
 * generator's own fallback is still correct and still there; what is asserted
 * below is that `requestRoute` throws it away rather than passing it off as the
 * seed's world.
 */

// -- The one spelling of a seed ---------------------------------------------

test('however a seed is typed, it names one place', () => {
  const spellings = [
    'ember-quay',
    'Ember-Quay',
    'EMBER-QUAY',
    '  ember-quay  ',
    'ember quay',
    'ember_quay',
    'ember--quay',
    '-ember-quay-',
    'ember.quay',
  ];
  for (const spelling of spellings) {
    assert.equal(normaliseSeed(spelling), 'ember-quay', `${JSON.stringify(spelling)} drifted`);
  }
});

test('normalising twice is normalising once', () => {
  // Not a tautology: the length cap runs *after* the substitution, so a seed
  // cut mid-word can be left with a trailing hyphen that a second pass would
  // remove — which would make a field that echoes what it stored disagree with
  // the world it built.
  const awkward = [
    '', ' ', '---', '!!!', 'a', 'a-', '-a',
    'x'.repeat(200),
    `${'ab-'.repeat(20)}`,
    'the quick brown fox jumped over it',
    'ünïcödé rüns',
    '🙂🙂🙂',
  ];
  for (const raw of awkward) {
    const once = normaliseSeed(raw);
    assert.equal(normaliseSeed(once), once, `${JSON.stringify(raw)} is not stable`);
    assert.ok(once.length <= MAX_SEED_LENGTH, `${JSON.stringify(raw)} exceeded the cap`);
    assert.ok(!once.startsWith('-') && !once.endsWith('-'), `${JSON.stringify(raw)} kept an edge hyphen`);
    assert.ok(/^[a-z0-9-]*$/.test(once), `${JSON.stringify(raw)} kept something unspeakable`);
  }
});

test('the retry namespace cannot be typed into', () => {
  // `attemptSeed` spells its retries `<seed>#<n>`, so before normalisation a
  // typed `a#1` drew the same route stream as the second attempt at `a`. Two
  // seeds meaning one place is the failure this whole file exists to prevent,
  // arriving from the other side.
  assert.equal(normaliseSeed('a#1'), 'a-1');
  assert.ok(!normaliseSeed('anything#3').includes('#'));
});

test('a seed in a link and a seed in the field are the same seed', () => {
  // The share path and the entry path have to agree or "same seed, same place"
  // is a promise the game breaks the first time somebody sends a link.
  assert.equal(seedFromQuery('?seed=Ember%20Quay'), normaliseSeed('Ember Quay'));
  assert.equal(seedFromQuery('?seed=ember-quay'), 'ember-quay');
  // A blank or unspellable seed is the default world's seed rather than an
  // error page: this is still reachable by typing a query parameter.
  assert.equal(seedFromQuery('?seed='), DEFAULT_SEED);
  assert.equal(seedFromQuery('?seed=---'), DEFAULT_SEED);
  assert.equal(seedFromQuery(''), DEFAULT_SEED);
});

test('every seed the game recorded before Phase 4 still names its own place', () => {
  // Normalisation arrived after the Phase 3 sweep pinned six adversarial seeds
  // and after the owner rode six curated ones. If any of them normalised to
  // something else, those records would silently be measurements of different
  // worlds — and `src/level/generatedLevel.test.ts` would be pinning numbers
  // nobody can reproduce.
  const recorded = [
    'euc', 'route-41', 'route-278', 'sweep-89', 'x67', 'euc-180', 'euc-35',
    'sweep-0', 'sweep-11', 'sweep-29', 'route-12', 'sweep-262',
  ];
  for (const seed of recorded) assert.equal(normaliseSeed(seed), seed, `${seed} moved`);
});

// -- A seed is refused, never quietly substituted ---------------------------

test('a seed that builds gives back its own route', () => {
  const outcome = requestRoute('Ember Quay');
  assert.ok(outcome.ok, 'ember-quay should build');
  assert.equal(outcome.seed, 'ember-quay');
  // Spelled out rather than composed from `GENERATED_LEVEL_PREFIX`: the id is
  // what a personal best and a ghost are filed under, so a test that derived it
  // from the code under test would agree with any revision — including one
  // nobody meant to make. M13 Phase 3 put `r2` here deliberately and this line
  // is where an accidental third revision fails.
  assert.equal(outcome.plan.id, 'generated-r3-ember-quay');
});

/**
 * A seed that exhausts all twelve attempts.
 *
 * Found by sweeping 1,100 seeds on 2026-08-08; about one in 360 fails, all on
 * routing contracts. **If this seed ever starts building, that is not a test to
 * relax — it is the generator having changed**, and the right response is to
 * find another failing seed and record why the old one recovered.
 */
const SEED_THAT_FAILS = 'route-12';

test('a seed that does not build is refused, and the slice is not offered in its place', () => {
  const outcome = requestRoute(SEED_THAT_FAILS);
  assert.equal(outcome.ok, false, `${SEED_THAT_FAILS} unexpectedly built — see the comment above`);
  if (outcome.ok) return;
  assert.equal(outcome.refusal, 'no-route');
  assert.equal(outcome.seed, SEED_THAT_FAILS);
  // The point of the whole decision: there is no `plan` on this branch at all,
  // so there is nothing for a caller to install by accident.
  assert.equal('plan' in outcome, false);
});

test('a blank seed is refused as blank, not as a route that failed', () => {
  // Two different messages for the player, and they are not interchangeable:
  // one means "you have not told me anything yet" and the other means "I tried
  // and this seed has no route in it".
  for (const blank of ['', '   ', '---', '???']) {
    const outcome = requestRoute(blank);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.refusal, 'blank');
  }
});

// -- Seeds the game hands out ------------------------------------------------

test('a seed the game invents is a seed the game would accept', () => {
  // A Surprise-me button that produced a seed the field then rewrote would be
  // the game disagreeing with itself in front of the player.
  const seen = new Set<string>();
  for (let index = 0; index < 2_000; index += 1) {
    const seed = routeSeedFrom(index * 37);
    assert.equal(normaliseSeed(seed), seed, `${seed} is not already normal`);
    assert.ok(seed.length <= MAX_SEED_LENGTH, `${seed} is too long to store`);
    seen.add(seed);
  }
  assert.ok(seen.size > 1_800, `only ${seen.size} distinct seeds in 2,000 draws`);
});

test('the seed space is what the surprise button is told it is', () => {
  // `Game.surpriseSeed` draws from `[0, ROUTE_SEED_SPACE)`. If the constant
  // over-stated the space the draw would fold back onto seeds it had already
  // offered; if it understated it, whole words would be unreachable.
  const distinct = new Set<string>();
  for (let index = 0; index < ROUTE_SEED_SPACE; index += 1) distinct.add(routeSeedFrom(index));
  assert.equal(distinct.size, ROUTE_SEED_SPACE);
  assert.equal(routeSeedFrom(ROUTE_SEED_SPACE), routeSeedFrom(0));
  // Negative and fractional inputs are the caller's problem to avoid and this
  // function's problem to survive: `Math.random()` is never negative, but a
  // seed generator that could throw would take a menu button down with it.
  assert.equal(normaliseSeed(routeSeedFrom(-5)), routeSeedFrom(-5));
  assert.equal(routeSeedFrom(3.7), routeSeedFrom(3));
});

/**
 * **The record-store half of the seed cap lives in `app/records.test.ts`**, not
 * here, and the reason is invariant 5 rather than tidiness: `level/` may not
 * import `app/` or `platform/`, and `src/architecture.test.ts` reads every
 * `.ts` under this directory including this one. The tests that prove a
 * maximum-length seed still saves a personal best and still keeps its ghost are
 * cross-layer by nature, so they belong on the side of the seal that is allowed
 * to see both.
 */
