/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRACK_VENUE_IDS, VENUE_IDS, isTrackVenueId, isVenueId, type VenueId } from './venues.ts';
import { LEVEL_IDS, createLevel, type LevelId } from '../level/levels.ts';

/**
 * The venue roster — M36 Phase 5.
 *
 * Everything here is about the roster being exactly the hand-built *places*
 * and about a string from markup never reaching `createLevel` as something
 * that is not a builder. There is deliberately no test of what any venue is
 * like: that would be this file claiming to know a fact `LevelPlan` states,
 * which is the branch invariant 2 forbids.
 */

test('the roster is the hand-built places, in the chooser’s order', () => {
  assert.deepEqual([...VENUE_IDS], ['slice', 'track', 'switchback']);
});

test('every Track Day choice builds a lap, and unrelated venue strings are refused', () => {
  for (const venue of TRACK_VENUE_IDS) {
    assert.ok(isVenueId(venue));
    assert.ok(isTrackVenueId(venue));
    assert.ok(createLevel(venue, '').lap, `${venue} offers a lap it cannot run`);
  }
  for (const value of ['slice', 'generated', 'proving', 'toString', '', 'Track']) {
    assert.equal(isTrackVenueId(value), false);
  }
});

test('every venue is a level the game can build', () => {
  for (const venue of VENUE_IDS) {
    assert.ok(
      (LEVEL_IDS as readonly string[]).includes(venue),
      `${venue} is offered by the chooser and is not a registered level`,
    );
    // Built rather than merely named: a chooser entry whose builder threw
    // would be a button that takes the player nowhere, and the id is the only
    // thing the chooser hands `createLevel`.
    const plan = createLevel(venue, '', undefined, undefined, undefined);
    assert.equal(typeof plan.id, 'string');
    assert.ok(plan.id.length > 0, `${venue} built a plan with no content id`);
  }
});

test('the diagnostics are not places, and stay off the roster', () => {
  // `proving` is an instrument and `generated` is a seed rather than a name.
  // Both remain reachable through `?level=`, which is what makes them
  // diagnostics rather than destinations.
  assert.equal(isVenueId('proving'), false);
  assert.equal(isVenueId('generated'), false);
  // And the roster is a strict subset of the builders, so this test says which
  // way the two lists may differ.
  const offered = new Set<string>(VENUE_IDS);
  const missing = (LEVEL_IDS as readonly LevelId[]).filter((id) => !offered.has(id));
  assert.deepEqual(missing, ['proving', 'generated']);
});

test('a string that is not a venue is refused, inherited names included', () => {
  // The value arrives from a `data-` attribute, so this is the `isLevelId`
  // lesson at the second door: `'toString' in {}` is true, and a chooser that
  // used `in` would hand `createLevel` a function to call as a builder.
  assert.equal(isVenueId('toString'), false);
  assert.equal(isVenueId('constructor'), false);
  assert.equal(isVenueId('__proto__'), false);
  assert.equal(isVenueId(''), false);
  assert.equal(isVenueId('Slice'), false);
  assert.equal(isVenueId(null), false);
  assert.equal(isVenueId(undefined), false);
});

test('a venue that passes the guard is usable as one', () => {
  const raw: string = 'switchback';
  assert.ok(isVenueId(raw));
  // The narrowing is the point of the predicate: past the guard the string is
  // a `VenueId`, which is a `LevelId` by construction.
  const venue: VenueId = raw;
  const level: LevelId = venue;
  assert.equal(level, 'switchback');
});

test('the roster is frozen, so nothing can add a venue at runtime', () => {
  assert.equal(Object.isFrozen(VENUE_IDS), true);
});
