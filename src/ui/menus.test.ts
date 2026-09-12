/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { routeStatusLine } from './menus.ts';
import { VENUE_IDS } from '../app/venues.ts';

/**
 * The fresh-route panel's one line, pinned headlessly — M36 Phase 5 (IDM-2).
 *
 * `routeStatusLine` is the whole of what the panel says about its own state,
 * and it needs no document: a tagged status and one fact about the loaded
 * world go in, a tone and a sentence come out. The venue line is the one this
 * file was written for — it replaced a blank line on a press that had
 * succeeded, and a blank line is exactly what a browser spec has the hardest
 * time telling apart from a press that did nothing.
 */

test('a venue press says which place is loaded and where the ride is', () => {
  const [tone, message] = routeStatusLine({ kind: 'venue-ready', venue: 'switchback' }, true);
  assert.equal(message, 'Switchback Park is ready. Back to the title to ride it or lap it.');
  // Not a refusal and not a wait: the world is already swapped when this is
  // written, so the line reads as the success it reports.
  assert.equal(tone, 'ready');
});

test('the line never offers a lap to a world that does not close one', () => {
  // The city's Track Day goes to BelVar (`lapVenueName`), so a line that told
  // the city it could be lapped would be the same lie the Track Day note used
  // to tell. The fact is the plan's, carried in rather than looked up here.
  const [, city] = routeStatusLine({ kind: 'venue-ready', venue: 'slice' }, false);
  assert.equal(city, 'The city is ready. Back to the title to ride it.');
  assert.ok(!city.includes('lap'), 'the city was offered a lap it would take elsewhere');

  const [, belvar] = routeStatusLine({ kind: 'venue-ready', venue: 'track' }, true);
  assert.equal(belvar, 'BelVar Circuit is ready. Back to the title to ride it or lap it.');
});

test('every venue the chooser offers is named rather than spelt', () => {
  // The roster drives this rather than a list typed here, so a fourth venue
  // arrives with a sentence or fails on the way in. The id must never reach
  // the screen: `slice` and `switchback` are file names, not places.
  for (const venue of VENUE_IDS) {
    const [tone, message] = routeStatusLine({ kind: 'venue-ready', venue }, true);
    assert.equal(tone, 'ready');
    assert.ok(message.endsWith('.'), `${venue} was left mid-sentence`);
    assert.ok(!message.includes(venue), `${venue} reached the player as an id`);
    assert.ok(message.includes('is ready. Back to the title'), `${venue} lost the shape`);
  }
});

test('the seed refusal is still the seed refusal, and is no longer what a venue press earns', () => {
  // The defect this replaced: a place was chosen, the line went idle, and the
  // next press answered a question about places with a sentence about seeds.
  const [, blank] = routeStatusLine({ kind: 'blank' }, true);
  assert.equal(blank, 'Type a route name, or choose Surprise me.');
  const [, venue] = routeStatusLine({ kind: 'venue-ready', venue: 'switchback' }, true);
  assert.notEqual(venue, blank);
  assert.ok(!venue.includes('route name'), 'the venue line refused the player about a seed');
});
