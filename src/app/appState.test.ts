/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  APP_STATES,
  APP_STATE_SPECS,
  AppState,
  RIDE_STATES,
  isRideState,
  type AppStateId,
} from './appState.ts';

test('every state is declared and every successor exists', () => {
  for (const id of APP_STATES) {
    const spec = APP_STATE_SPECS[id];
    assert.ok(spec, `${id} has no declaration`);
    assert.equal(spec.id, id, 'a spec keyed under the wrong id');
    for (const successor of spec.successors) {
      assert.ok(
        APP_STATES.includes(successor),
        `${id} declares a successor that is not a state: ${successor}`,
      );
      assert.notEqual(successor, id, `${id} lists itself as a successor`);
    }
  }
});

test('every state is reachable from boot', () => {
  // An unreachable state in a graph that claims to be exhaustive is a state
  // somebody will write code for and nobody will ever run.
  const seen = new Set<AppStateId>(['boot']);
  const queue: AppStateId[] = ['boot'];
  while (queue.length > 0) {
    const id = queue.shift() as AppStateId;
    for (const successor of APP_STATE_SPECS[id].successors) {
      if (seen.has(successor)) continue;
      seen.add(successor);
      queue.push(successor);
    }
  }

  for (const id of APP_STATES) assert.ok(seen.has(id), `${id} is unreachable from boot`);
});

test('ride input is live in exactly the ride states', () => {
  // The whole reason this machine exists. A menu that leaves the throttle live
  // is a rider who accelerates into the distance while reading the controls.
  //
  // Asserted against `RIDE_STATES` rather than a literal so the list cannot
  // gain a third ride in one place and not the other — three consumers ask
  // "is this a ride?" through that export.
  const riding = APP_STATES.filter((id) => APP_STATE_SPECS[id].acceptsRideInput);
  assert.deepEqual(riding, [...RIDE_STATES]);
  assert.deepEqual(
    [...RIDE_STATES],
    ['freeRide', 'challenge', 'trackDay', 'knockabout', 'chase'],
  );
  for (const id of APP_STATES) {
    assert.equal(
      isRideState(id),
      APP_STATE_SPECS[id].acceptsRideInput,
      `${id} disagrees with itself about whether it is a ride`,
    );
  }
});

test('every ride shows the HUD and no menu', () => {
  // A timed run whose clock is hidden behind a menu, or a ride with no speed
  // readout, are both states nobody would notice were wrong until they played.
  for (const id of RIDE_STATES) {
    const spec = APP_STATE_SPECS[id];
    assert.equal(spec.showsHud, true, `${id} rides with no HUD`);
    assert.equal(spec.showsMenu, false, `${id} rides behind a menu`);
    assert.equal(spec.simulates, true, `${id} rides without simulating`);
  }
});

test('both scored rides are reachable, and leave only where they should', () => {
  assert.deepEqual(
    [...APP_STATE_SPECS.challenge.successors],
    ['paused', 'results', 'title'],
  );
  // Knockabout is the same state wearing a different scoreboard (M14), and the
  // identical successor list is the assertion: a mode is what a ride is *for*,
  // not a different kind of being on a wheel.
  assert.deepEqual(
    [...APP_STATE_SPECS.knockabout.successors],
    ['paused', 'results', 'title'],
  );
  // And the chase is the third of them (M18), on the same argument again: the
  // ride is the same ride, and what differs is what is behind you.
  assert.deepEqual(
    [...APP_STATE_SPECS.chase.successors],
    ['paused', 'results', 'title'],
  );
  // And Track Day is the fourth (M23). It reaches `results` without crossing
  // anything — a circuit has no finish — but the list is identical anyway,
  // because where a ride may *go* is not what distinguishes one mode from
  // another. What ends the session is the pause card, and that edge is
  // `paused → results` rather than a fourth entry here.
  assert.deepEqual(
    [...APP_STATE_SPECS.trackDay.successors],
    ['paused', 'results', 'title'],
  );
  assert.ok(
    APP_STATE_SPECS.paused.successors.includes('results'),
    'a session that ends from the pause card has nowhere to report itself',
  );
  // Retry is the only edge back into a ride from the results screen, and it
  // goes to whichever scored ride the player was in rather than to free ride: a
  // player who wants to stop being scored goes through the title deliberately.
  assert.deepEqual(
    [...APP_STATE_SPECS.results.successors],
    ['challenge', 'trackDay', 'knockabout', 'chase', 'freeRide', 'title'],
  );
  // **`freeRide` is here from M23 and it is the New route edge, nothing else.**
  // The rule it replaced — no unscored ride the player did not choose — was
  // about *accidentally* leaving a scored state, and this card's New route
  // button says on its face that it swaps the world for a generated one, which
  // no mode with a card on screen can be scored on. Refusing the edge left the
  // player reading a frozen results card over a world already replaced
  // underneath it. Retry still goes to the mode that ended, never here.
  assert.ok(
    APP_STATE_SPECS.results.successors.includes('freeRide'),
    'New route from a results card has nowhere legal to land',
  );
});

test('the world stays alive behind the results card', () => {
  // The player has just crossed a line at speed. Freezing the frame the panel
  // appears on reads as a crash rather than as a finish.
  assert.equal(APP_STATE_SPECS.results.simulates, true);
  assert.equal(APP_STATE_SPECS.results.acceptsRideInput, false);
  assert.equal(APP_STATE_SPECS.results.showsHud, false, 'the panel carries the numbers now');
});

test('no state both shows a menu and takes ride input', () => {
  for (const id of APP_STATES) {
    const spec = APP_STATE_SPECS[id];
    assert.equal(
      spec.showsMenu && spec.acceptsRideInput,
      false,
      `${id} would let a keypress ride the wheel away behind a menu`,
    );
  }
});

test('a paused game genuinely stops simulating', () => {
  assert.equal(APP_STATE_SPECS.paused.simulates, false);
  assert.equal(APP_STATE_SPECS.freeRide.simulates, true);
  // The title screen keeps the world alive behind the card on purpose.
  assert.equal(APP_STATE_SPECS.title.simulates, true);
});

test('every menu boundary is an input-reset moment', () => {
  // Master §8.2. A key held as Escape lands never delivers its keyup, so a
  // state that shows a menu without resetting input resumes at full throttle.
  for (const id of APP_STATES) {
    const spec = APP_STATE_SPECS[id];
    if (!spec.showsMenu) continue;
    assert.equal(spec.resetsInput, true, `${id} shows a menu without resetting input`);
  }
  assert.equal(APP_STATE_SPECS.freeRide.resetsInput, true, 'returning to the ride resets too');
});

test('the boot sequence is a straight line', () => {
  const state = new AppState();
  assert.equal(state.current, 'boot');
  assert.equal(state.goTo('freeRide'), false, 'boot cannot skip straight into a ride');
  assert.equal(state.goTo('loading'), true);
  assert.equal(state.goTo('title'), true);
  assert.equal(state.acceptsRideInput, false);
});

function atTitle(): AppState {
  const state = new AppState();
  state.goTo('loading');
  state.goTo('title');
  return state;
}

test('settings returns to wherever it was opened from', () => {
  const state = atTitle();

  state.goTo('settings');
  assert.equal(state.settingsReturn, 'title');
  assert.equal(state.exitSettings(), true);
  assert.equal(state.current, 'title');

  state.goTo('freeRide');
  state.goTo('paused');
  state.goTo('settings');
  assert.equal(state.settingsReturn, 'paused');
  state.exitSettings();
  assert.equal(state.current, 'paused', 'the same Back button means two different things');
});

test('exitSettings does nothing anywhere else', () => {
  const state = atTitle();
  assert.equal(state.exitSettings(), false);
  assert.equal(state.current, 'title');
});

test('choosing a route is reached from the title and leads to either ride', () => {
  const state = atTitle();

  assert.equal(state.goTo('routes'), true);
  assert.equal(state.showsMenu, true);
  assert.equal(state.acceptsRideInput, false, 'a stray keypress must not ride away behind the panel');
  assert.equal(state.simulates, true, 'the world stays alive behind the card, as it does at the title');

  assert.equal(state.goTo('freeRide'), true);
  atTitle().goTo('routes');
  const timed = atTitle();
  timed.goTo('routes');
  assert.equal(timed.goTo('challenge'), true, 'a fresh route can be ridden timed');

  const knockabout = atTitle();
  knockabout.goTo('routes');
  assert.equal(
    knockabout.goTo('knockabout'),
    true,
    'a target-bearing fresh route can honour the Knockabout choice that opened it',
  );

  const back = atTitle();
  back.goTo('routes');
  assert.equal(back.goTo('title'), true);
});

test('the world cannot be swapped underneath a ride', () => {
  // Not an oversight in the graph: installing a level disposes the ground the
  // rider is standing on. The journey through the title costs one more button
  // and cannot express the impossible move.
  const state = atTitle();
  state.goTo('freeRide');
  assert.equal(state.goTo('routes'), false);
  state.goTo('paused');
  assert.equal(state.goTo('routes'), false);
});

test('pausing is only possible from a ride', () => {
  const state = atTitle();
  assert.equal(state.goTo('paused'), false, 'there is nothing to resume from the title');

  state.goTo('freeRide');
  assert.equal(state.goTo('paused'), true);
  assert.equal(state.simulates, false);
  assert.equal(state.showsHud, true, 'the speed a player paused to read stays readable');
  assert.equal(state.goTo('freeRide'), true);
  assert.equal(state.simulates, true);
});

test('quitting to the title is reachable from a pause', () => {
  const state = atTitle();
  state.goTo('freeRide');
  state.goTo('paused');
  assert.equal(state.goTo('title'), true);
});

test('resume returns to whichever ride was paused', () => {
  const state = atTitle();

  state.goTo('freeRide');
  state.goTo('paused');
  assert.equal(state.rideReturn, 'freeRide');
  assert.equal(state.resumeRide(), true);
  assert.equal(state.current, 'freeRide');

  state.goTo('title');
  state.goTo('challenge');
  assert.equal(state.riding, true);
  state.goTo('paused');
  assert.equal(state.rideReturn, 'challenge');
  assert.equal(state.resumeRide(), true);
  assert.equal(state.current, 'challenge', 'resuming a timed run must not discard the run');
});

test('visiting settings from a pause does not change which ride resumes', () => {
  // The bug this exists for: `rideOrigin` recorded on entry to `paused` instead
  // of on exit from a ride would be overwritten by the settings round trip, and
  // a player who checked their volume mid-run would resume into free ride.
  const state = atTitle();
  state.goTo('challenge');
  state.goTo('paused');
  state.goTo('settings');
  state.exitSettings();
  assert.equal(state.current, 'paused');
  assert.equal(state.rideReturn, 'challenge');
  assert.equal(state.resumeRide(), true);
  assert.equal(state.current, 'challenge');
});

test('resumeRide does nothing anywhere else', () => {
  const state = atTitle();
  assert.equal(state.resumeRide(), false);
  assert.equal(state.current, 'title');
});

test('a finished run reaches the results screen and can retry', () => {
  const state = atTitle();
  state.goTo('challenge');
  assert.equal(state.goTo('results'), true);
  assert.equal(state.acceptsRideInput, false);
  assert.equal(state.goTo('challenge'), true, 'retry');
  assert.equal(state.acceptsRideInput, true);
});

test('listeners see both ends of a transition and can unsubscribe', () => {
  const state = atTitle();
  const moves: string[] = [];
  const stop = state.onChange((to, from) => moves.push(`${from.id}->${to.id}`));

  state.goTo('freeRide');
  state.goTo('paused');
  // Refused and repeated moves must not notify.
  state.goTo('paused');
  state.goTo('loading');

  assert.deepEqual(moves, ['title->freeRide', 'freeRide->paused']);

  stop();
  state.goTo('freeRide');
  assert.equal(moves.length, 2);
});
