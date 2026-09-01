/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COUCH_MIN_WIDTH_PX,
  COUCH_RIDES,
  COUCH_RIDE_LABELS,
  DEFAULT_COUCH_RIDE,
  couchEligible,
  cycleGuest,
  guestBeside,
  isCouchRide,
} from './couch.ts';
import { CHARACTER_IDS, DEFAULT_CHARACTER } from '../data/riders.ts';

const DESKTOP = { viewportWidth: 1280, finePointer: true, padSeen: false };

test('a couch needs a window wide enough to split and a device to hold', () => {
  assert.equal(couchEligible(DESKTOP), true);
  // Narrow is refused whatever is plugged in: two halves of a phone are two
  // unreadable HUDs, and a pad does not make the window wider.
  assert.equal(couchEligible({ ...DESKTOP, viewportWidth: 800 }), false);
  assert.equal(couchEligible({ viewportWidth: 800, finePointer: true, padSeen: true }), false);
  // And width alone is not enough — a wide touch-only screen has one device.
  assert.equal(couchEligible({ viewportWidth: 1600, finePointer: false, padSeen: false }), false);
});

test('the threshold is inclusive, and an unmeasured window is not eligible', () => {
  assert.equal(couchEligible({ ...DESKTOP, viewportWidth: COUCH_MIN_WIDTH_PX }), true);
  assert.equal(couchEligible({ ...DESKTOP, viewportWidth: COUCH_MIN_WIDTH_PX - 1 }), false);
  // A viewport read before layout is NaN, and `NaN >= n` is false — but so is
  // `NaN < n`, which is why the comparison is written the way it is. A
  // predicate that let an unmeasured window through would show the button for
  // one frame on a phone.
  assert.equal(couchEligible({ ...DESKTOP, viewportWidth: Number.NaN }), false);
});

test('a pad that has been seen is a second device even with no mouse', () => {
  // The hybrid case §25.9 named: a touchscreen laptop, or a TV browser with a
  // pad and no pointer at all. Deliberately not `touchWanted`.
  assert.equal(couchEligible({ viewportWidth: 1440, finePointer: false, padSeen: true }), true);
});

test('the guest is never the rider the player is already wearing', () => {
  for (const id of CHARACTER_IDS) {
    assert.notEqual(guestBeside([id]), id, `${id} was offered themselves`);
  }
  // Including the one rider nobody may choose — the cop is a `CharacterId`.
  assert.ok(CHARACTER_IDS.includes(guestBeside(['cop'])));
});

test('cycling the guest card walks the roster and steps over the player', () => {
  const taken = DEFAULT_CHARACTER;
  let id = guestBeside([taken]);
  const seen = new Set<string>();
  // One full lap of the roster's *reachable* entries, which is every character
  // but the player's own.
  for (let step = 0; step < CHARACTER_IDS.length - 1; step += 1) {
    assert.notEqual(id, taken, 'the card stopped on the player’s own rider');
    seen.add(id);
    id = cycleGuest(id, [taken], 1);
  }
  assert.equal(seen.size, CHARACTER_IDS.length - 1, 'the card cannot reach every other rider');
  assert.equal(id, guestBeside([taken]), 'a full lap did not come back to the start');
});

test('cycling backwards is the exact inverse of cycling forwards', () => {
  const taken = CHARACTER_IDS[2];
  for (const start of CHARACTER_IDS) {
    if (start === taken) continue;
    assert.equal(cycleGuest(cycleGuest(start, [taken], 1), [taken], -1), start, `${start} did not return`);
  }
});

test('a two-rider roster with one taken has exactly one reachable card', () => {
  // The degenerate case a wrapping search has to survive: every step lands on
  // the taken rider except one. Proven against the real roster by taking every
  // entry but two out of consideration — `cycleGuest` may not spin.
  const only = CHARACTER_IDS[1];
  // Walking from the only reachable card must return it rather than hang or
  // fall off the roster.
  const others = CHARACTER_IDS.filter((id) => id !== only);
  assert.ok(CHARACTER_IDS.includes(cycleGuest(only, others, 1)));
  assert.ok(CHARACTER_IDS.includes(cycleGuest(only, others, -1)));
});

// ---------------------------------------------------------------------------
// What a couch session is for — M26 Phase 5 (q78)
// ---------------------------------------------------------------------------

test('the panel offers exactly the rides the game can start into', () => {
  // A list rather than a hand-walked union, so the control, the default and the
  // specs cannot drift. **The couch race joined at M27 Phase 3**, exactly as
  // §26.7 said it would — this list and the panel's own control, no new menu.
  //
  // The order is the order the panel offers them and is asserted as such: free
  // ride first because it is the default and the quietest, the race second
  // because it is what most rooms sitting down together came for, Knockabout
  // last because choosing a fight is a thing you do on purpose.
  assert.deepEqual([...COUCH_RIDES], ['freeRide', 'race', 'knockabout']);
  assert.ok(COUCH_RIDES.includes(DEFAULT_COUCH_RIDE), 'the default must be offerable');
  assert.equal(DEFAULT_COUCH_RIDE, 'freeRide', 'the quietest ride is the one you get by default');
});

test('every ride the panel offers has a name a player would recognise', () => {
  for (const ride of COUCH_RIDES) {
    const label = COUCH_RIDE_LABELS[ride];
    assert.ok(label.length > 0, `${ride} has no label`);
    assert.notEqual(label, ride, `${ride} is showing its own identifier`);
  }
});

test('a ride the panel does not offer is refused rather than trusted', () => {
  // The select's value crosses a DOM boundary as a string, and a stale option
  // left in the markup would otherwise reach `Game` as a mode nobody built.
  for (const ride of COUCH_RIDES) assert.equal(isCouchRide(ride), true);
  assert.equal(isCouchRide('chase'), false);
  assert.equal(isCouchRide('trackDay'), false);
  assert.equal(isCouchRide(''), false);
  assert.equal(isCouchRide('FREERIDE'), false);
});
