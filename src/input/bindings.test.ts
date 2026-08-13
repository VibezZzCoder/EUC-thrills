/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  BINDINGS,
  DEBUG_BINDINGS,
  PAUSE_CODE,
  RESERVED_CODES,
  keyLabel,
  resolveBindings,
} from './bindings.ts';

test('the defaults are the committed control map', () => {
  // `docs/PLANS.md` §4.7, restated as an assertion so a rebinding bug cannot
  // quietly move the controls the owner has ridden with since M2.
  const tables = resolveBindings();
  assert.equal(tables.held.KeyW, 'accelerate');
  assert.equal(tables.held.ArrowUp, 'accelerate');
  assert.equal(tables.held.KeyS, 'brake');
  assert.equal(tables.held.KeyA, 'steerLeft');
  assert.equal(tables.held.KeyD, 'steerRight');
  assert.equal(tables.held.ShiftLeft, 'crouch');
  assert.equal(tables.pressed.Space, 'hop');
  assert.equal(tables.pressed.KeyR, 'reset');
  assert.equal(tables.pressed.KeyC, 'cameraCycle');
  assert.equal(tables.pressed.KeyM, 'muteAudio');
  assert.equal(tables.pressed[PAUSE_CODE], 'pause');
});

test('no gameplay key collides with the developer keys', () => {
  const tables = resolveBindings();
  for (const code of Object.keys(DEBUG_BINDINGS)) {
    assert.equal(tables.held[code], undefined, `${code} is developer tooling`);
    assert.equal(tables.pressed[code], undefined, `${code} is developer tooling`);
  }
});

test('an override replaces one action and leaves the rest alone', () => {
  const tables = resolveBindings({ hop: ['KeyJ'] });
  assert.equal(tables.pressed.KeyJ, 'hop');
  assert.equal(tables.pressed.Space, undefined, 'the old key is genuinely free');
  assert.equal(tables.held.KeyW, 'accelerate', 'everything else is untouched');
});

test('an action missing from the record keeps its defaults', () => {
  // What makes a record saved by a build that had never heard of `muteAudio`
  // load without silently unbinding it.
  const tables = resolveBindings({ hop: ['KeyJ'] });
  assert.equal(tables.pressed.KeyM, 'muteAudio');
});

test('an action present but empty is genuinely unbound', () => {
  const tables = resolveBindings({ cameraCycle: [] });
  assert.equal(tables.pressed.KeyC, undefined);
  assert.equal(
    Object.values(tables.pressed).includes('cameraCycle'),
    false,
    'a row the player cleared must stay cleared',
  );
});

test('one key drives one action, even across the two tables', () => {
  // A hand-edited record can put the same key on two actions. Left alone,
  // whichever happened to be iterated last would win by accident.
  const tables = resolveBindings({ accelerate: ['KeyJ'], hop: ['KeyJ'] });
  assert.equal(tables.held.KeyJ, undefined);
  assert.equal(tables.pressed.KeyJ, 'hop', 'the later spec wins, and only one wins');
});

test('reserved keys cannot be taken', () => {
  const tables = resolveBindings({ hop: ['Escape'], reset: ['F3'], brake: ['Tab'] });

  // Escape stays pause, F3 stays the overlay, Tab stays the way a keyboard
  // user reaches the menus at all.
  assert.equal(tables.pressed.Escape, 'pause');
  assert.equal(tables.pressed.F3, undefined);
  assert.equal(tables.held.Tab, undefined);
  for (const code of RESERVED_CODES) {
    assert.notEqual(tables.held[code], 'brake');
  }
});

test('pause is never rebindable', () => {
  // Not merely reserved — it is not offered as a row at all, so a player
  // cannot move the one key every browser agrees means "get me out of this".
  assert.equal(BINDINGS.some((spec) => spec.action === 'pause'), false);
  assert.equal(resolveBindings({ pause: ['KeyP'] }).pressed.KeyP, undefined);
});

test('a rebound key that would scroll the page is suppressed with it', () => {
  const tables = resolveBindings({ hop: ['PageDown'] });
  assert.equal(tables.suppress.has('PageDown'), true, 'a hop must not also page the document');
  // And the floor is still there for the keys that always scroll.
  assert.equal(tables.suppress.has('Space'), true);
  assert.equal(tables.suppress.has('Escape'), false, 'suppressing Escape fights full-screen exit');
});

test('every bindable action has a label and at least one default', () => {
  const actions = new Set<string>();
  for (const spec of BINDINGS) {
    assert.ok(spec.label.length > 0, `${spec.action} has no label`);
    assert.ok(spec.defaults.length > 0, `${spec.action} ships unbound`);
    assert.equal(actions.has(spec.action), false, `${spec.action} is listed twice`);
    actions.add(spec.action);
    for (const code of spec.defaults) {
      assert.equal(RESERVED_CODES.has(code), false, `${spec.action} defaults to a reserved key`);
    }
  }
});

test('keys are shown to the player by name, not by code', () => {
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('Digit1'), '1');
  assert.equal(keyLabel('ArrowUp'), 'Up arrow');
  assert.equal(keyLabel('ShiftLeft'), 'Left shift');
  assert.equal(keyLabel('Numpad5'), 'Num 5');
  assert.equal(keyLabel('Space'), 'Space');
  // A key we have no better name for is still better identified by its code
  // than by a guess.
  assert.equal(keyLabel('IntlBackslash'), 'IntlBackslash');
});
