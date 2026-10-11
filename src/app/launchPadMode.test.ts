/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { APP_STATES, APP_STATE_SPECS, AppState, type AppStateId } from './appState.ts';
import { effectiveState, launchPadsLive } from './launchPadMode.ts';

const live = (state: AppStateId, settingsReturn: AppStateId = 'title', rideReturn: AppStateId = 'freeRide',
  chaseProbe = false) => launchPadsLive(effectiveState(state, settingsReturn, rideReturn), chaseProbe, state);

test('every AppStateId resolves, and only free ride arms', () => {
  const expected: Record<AppStateId, { visible: boolean; armed: boolean }> = {
    boot: { visible: false, armed: false },
    loading: { visible: false, armed: false },
    title: { visible: true, armed: false },
    // settingsReturn 'title' in this sweep
    settings: { visible: true, armed: false },
    routes: { visible: true, armed: false },
    riderSelect: { visible: true, armed: false },
    couchJoin: { visible: true, armed: false },
    freeRide: { visible: true, armed: true },
    challenge: { visible: false, armed: false },
    trackDay: { visible: false, armed: false },
    trickRun: { visible: false, armed: false },
    knockabout: { visible: false, armed: false },
    chase: { visible: false, armed: false },
    // rideReturn 'freeRide' in this sweep: shown (its world), never armed (no ride input)
    paused: { visible: true, armed: false },
    results: { visible: false, armed: false },
  };
  assert.deepEqual(Object.keys(expected).sort(), [...APP_STATES].sort(), 'the sweep covers every state');
  for (const state of APP_STATES) {
    assert.deepEqual({ ...live(state) }, expected[state], state);
  }
});

test('effectiveState: settings → settingsReturn, then paused → rideReturn, then title menus → title', () => {
  assert.equal(effectiveState('settings', 'title', 'chase'), 'title');
  assert.equal(effectiveState('settings', 'paused', 'knockabout'), 'knockabout');
  assert.equal(effectiveState('paused', 'title', 'challenge'), 'challenge');
  assert.equal(effectiveState('routes', 'title', 'chase'), 'title');
  assert.equal(effectiveState('riderSelect', 'title', 'chase'), 'title');
  assert.equal(effectiveState('couchJoin', 'title', 'chase'), 'title');
  assert.equal(effectiveState('settings', 'routes', 'chase'), 'title', 'settings over a title menu is the title');
  for (const state of APP_STATES) {
    if (state === 'settings' || state === 'paused' || state === 'routes'
      || state === 'riderSelect' || state === 'couchJoin') continue;
    assert.equal(effectiveState(state, 'paused', 'chase'), state, `${state} is its own world`);
  }
});

test('title → settings after a chase: the stale rideReturn is never read (shown, disarmed)', () => {
  const app = new AppState();
  // Walk the real machine: a chase, out to the title, then Settings.
  for (const step of ['loading', 'title', 'chase', 'paused', 'title', 'settings'] as const) {
    assert.ok(app.goTo(step), `transition to ${step}`);
  }
  assert.equal(app.current, 'settings');
  assert.equal(app.settingsReturn, 'title');
  assert.equal(app.rideReturn, 'chase', 'the stale ride is still remembered');
  const result = live(app.current, app.settingsReturn, app.rideReturn);
  assert.deepEqual({ ...result }, { visible: true, armed: false });
});

test('pause → settings during Knockabout: hidden and disarmed; free ride\'s pause and its Settings: shown, disarmed', () => {
  const app = new AppState();
  for (const step of ['loading', 'title', 'knockabout', 'paused', 'settings'] as const) {
    assert.ok(app.goTo(step), `transition to ${step}`);
  }
  assert.equal(effectiveState(app.current, app.settingsReturn, app.rideReturn), 'knockabout');
  assert.deepEqual({ ...live(app.current, app.settingsReturn, app.rideReturn) }, { visible: false, armed: false });
  // QA A r2 minor 1: Settings simulates with no ride input, so its pads never fire.
  assert.deepEqual({ ...live('settings', 'paused', 'freeRide') }, { visible: true, armed: false });
  assert.deepEqual({ ...live('paused', 'title', 'freeRide') }, { visible: true, armed: false });
  assert.deepEqual({ ...live('paused', 'title', 'challenge') }, { visible: false, armed: false });
});

test('chaseProbe forces hidden and disarmed in every state', () => {
  for (const state of APP_STATES) {
    for (const ride of ['freeRide', 'chase'] as const) {
      assert.deepEqual({ ...live(state, 'title', ride, true) }, { visible: false, armed: false }, state);
    }
  }
});

test('answers are frozen and never armed while hidden', () => {
  for (const state of APP_STATES) {
    for (const probe of [false, true]) {
      const result = live(state, 'paused', 'freeRide', probe);
      assert.ok(Object.isFrozen(result));
      assert.ok(result.visible || !result.armed, `${state}: an armed pad is always a drawn pad`);
    }
  }
});

test('only a state that passes ride input to the seats arms, for every return either menu can hold', () => {
  // QA A r2 minor 1: a pad behind a menu never throws a rider. Every state,
  // every settingsReturn and every rideReturn: armed implies the state up
  // takes ride input (only free ride itself does), and visibility is the
  // effective world's whatever the arming says.
  let armedCount = 0;
  for (const state of APP_STATES) {
    for (const settingsReturn of APP_STATES) {
      for (const rideReturn of APP_STATES) {
        const effective = effectiveState(state, settingsReturn, rideReturn);
        const result = launchPadsLive(effective, false, state);
        if (result.armed) {
          armedCount += 1;
          assert.ok(APP_STATE_SPECS[state].acceptsRideInput, `${state} (${settingsReturn}, ${rideReturn}) arms without ride input`);
          assert.equal(state, 'freeRide');
        }
        assert.equal(result.visible, effective === 'freeRide' || effective === 'title', `${state} → ${effective}`);
      }
    }
  }
  assert.ok(armedCount > 0, 'free ride still arms');
});

test('free ride → pause → Settings → pause → free ride on the real machine: disarmed behind both menus, armed again on Resume', () => {
  const app = new AppState();
  const seen: [AppStateId, boolean, boolean][] = [];
  for (const step of ['loading', 'title', 'freeRide', 'paused', 'settings', 'paused', 'freeRide'] as const) {
    assert.ok(app.goTo(step), `transition to ${step}`);
    const result = live(app.current, app.settingsReturn, app.rideReturn);
    seen.push([app.current, result.visible, result.armed]);
  }
  assert.deepEqual(seen.slice(2), [
    ['freeRide', true, true],
    ['paused', true, false],
    ['settings', true, false],
    ['paused', true, false],
    ['freeRide', true, true],
  ]);
  assert.ok(APP_STATE_SPECS.settings.simulates && !APP_STATE_SPECS.settings.acceptsRideInput,
    'the case this guards: Settings runs the world with no ride input');
});
