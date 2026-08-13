/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SafeStorage, type StorageLike } from '../platform/storage.ts';
import {
  DEFAULT_OPTIONS,
  FOV_TRIM_MAX,
  FOV_TRIM_MIN,
  OPTIONS_KEY,
  OptionsStore,
  TOUCH_CONTROL_MODES,
  TOUCH_SCALE_MAX,
  TOUCH_SCALE_MIN,
  coerceOptions,
  sameOptions,
} from './options.ts';

/**
 * The options model is the one place a hostile or merely old record reaches
 * the game, so most of what is asserted here is what happens when the record
 * is wrong rather than when it is right.
 */

class MemoryStore implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test('the defaults reproduce the accepted M8 mix and camera FOV trim', () => {
  // Both are owner-accepted states, so a default that moved either would
  // silently reopen a question that is closed.
  assert.equal(DEFAULT_OPTIONS.volumeMaster, 1);
  assert.equal(DEFAULT_OPTIONS.volumeSfx, 1);
  assert.equal(DEFAULT_OPTIONS.volumeUi, 1);
  assert.equal(DEFAULT_OPTIONS.volumeMusic, 1);
  assert.equal(DEFAULT_OPTIONS.muted, false);
  assert.equal(DEFAULT_OPTIONS.fieldOfViewTrim, 0);
});

test('every field is clamped or rejected rather than trusted', () => {
  const options = coerceOptions({
    quality: 'ultra',
    character: 'someone-else',
    fieldOfViewTrim: 999,
    cameraShake: -3,
    reducedMotion: 'yes',
    volumeMaster: 'loud',
    volumeSfx: 4,
    gamepadDeadZone: 0.9,
    seenPrompts: ['accelerate', 7, null, 'brake'],
    somethingFromANewerBuild: true,
  });

  assert.equal(options.quality, DEFAULT_OPTIONS.quality, 'an unknown level falls back');
  // An unknown rider must resolve to somebody. A store written by a later build
  // — or edited by hand — otherwise reaches `render/` as an id with no look.
  assert.equal(options.character, DEFAULT_OPTIONS.character, 'an unknown rider falls back');
  assert.equal(coerceOptions({ character: 'trollina' }).character, 'trollina');
  assert.equal(options.fieldOfViewTrim, FOV_TRIM_MAX);
  assert.equal('cameraShake' in options, false, 'retired settings are dropped');
  assert.equal('reducedMotion' in options, false, 'retired settings are dropped');
  assert.equal(options.volumeMaster, 1, 'a string volume falls back rather than silencing');
  assert.equal(options.volumeSfx, 1);
  assert.equal(options.gamepadDeadZone, 0.5);
  assert.deepEqual(options.seenPrompts, ['accelerate', 'brake']);
  assert.equal('somethingFromANewerBuild' in options, false, 'unknown fields are dropped');

  assert.equal(coerceOptions({ fieldOfViewTrim: -999 }).fieldOfViewTrim, FOV_TRIM_MIN);
});

test('the touch settings are clamped and rejected like everything else', () => {
  const options = coerceOptions({
    touchControls: 'sometimes',
    touchSwapSides: 'yes',
    touchScale: 99,
  });

  assert.equal(options.touchControls, 'auto', 'an unknown mode falls back');
  assert.equal(options.touchSwapSides, false, 'a string is not a Boolean');
  assert.equal(options.touchScale, TOUCH_SCALE_MAX);
  assert.equal(coerceOptions({ touchScale: -4 }).touchScale, TOUCH_SCALE_MIN);

  for (const mode of TOUCH_CONTROL_MODES) {
    assert.equal(coerceOptions({ touchControls: mode }).touchControls, mode);
  }
});

test('the on-screen controls default to working it out for themselves', () => {
  // `auto` rather than `off`, and that is the whole shape of the feature: a
  // player who opens the game on a phone gets a game they can ride without
  // first finding a settings screen they would have to ride to reach.
  assert.equal(DEFAULT_OPTIONS.touchControls, 'auto');
  assert.equal(DEFAULT_OPTIONS.touchSwapSides, false);
  assert.equal(DEFAULT_OPTIONS.touchScale, 1);
});

test('a touch setting changing is a real change, and an equal one is not', () => {
  // `sameOptions` gates every save and every listener, so a field missing from
  // it is a setting that silently does not persist.
  for (const patch of [
    { touchControls: 'off' as const },
    { touchSwapSides: true },
    { touchScale: 1.2 },
    // M14.5. A rider that did not compare here would be a rider the game
    // forgot on every reload, with no error and nothing to report.
    { character: 'trollina' as const },
  ]) {
    assert.equal(
      sameOptions(DEFAULT_OPTIONS, coerceOptions({ ...DEFAULT_OPTIONS, ...patch })),
      false,
      `${Object.keys(patch)[0]} is not compared by sameOptions`,
    );
  }
  assert.ok(sameOptions(DEFAULT_OPTIONS, coerceOptions({ ...DEFAULT_OPTIONS, touchScale: 1 })));
});

test('a record that is not an object at all degrades to the defaults', () => {
  // The failure mode this prevents is losing every other setting because one
  // was broken.
  assert.ok(sameOptions(coerceOptions(null), DEFAULT_OPTIONS));
  assert.ok(sameOptions(coerceOptions('corrupt'), DEFAULT_OPTIONS));
  assert.ok(sameOptions(coerceOptions([1, 2, 3]), DEFAULT_OPTIONS));
});

test('binding overrides survive a round trip and reject rubbish', () => {
  const options = coerceOptions({
    bindings: {
      accelerate: ['KeyW', 'ArrowUp'],
      hop: ['Space', 42, ''],
      // An action bound to nothing: the player unbound it, which is different
      // from never having touched it.
      cameraCycle: [],
      brake: 'KeyS',
    },
  });

  assert.deepEqual(options.bindings.accelerate, ['KeyW', 'ArrowUp']);
  assert.deepEqual(options.bindings.hop, ['Space']);
  assert.deepEqual(options.bindings.cameraCycle, []);
  assert.equal('brake' in options.bindings, false, 'a non-array binding is dropped');
});

test('the store loads what it saved, across a fresh construction', () => {
  const backing = new MemoryStore();
  const store = new OptionsStore(new SafeStorage(backing));

  store.set({ fieldOfViewTrim: 6, quality: 'low', muted: true });
  assert.equal(store.current.fieldOfViewTrim, 6);

  const reloaded = new OptionsStore(new SafeStorage(backing));
  assert.equal(reloaded.current.fieldOfViewTrim, 6);
  assert.equal(reloaded.current.quality, 'low');
  assert.equal(reloaded.current.muted, true);
});

test('a corrupt saved record does not stop the game starting', () => {
  const backing = new MemoryStore();
  const storage = new SafeStorage(backing);
  backing.setItem(`euc-thrills.v1.${OPTIONS_KEY}`, '{"fieldOfViewTrim": ');

  const store = new OptionsStore(storage);
  assert.ok(sameOptions(store.current, DEFAULT_OPTIONS));
});

test('listeners fire on a real change and not on a no-op', () => {
  const store = new OptionsStore(new SafeStorage(new MemoryStore()));
  let calls = 0;
  let seen = store.current;
  const stop = store.onChange((options) => {
    calls += 1;
    seen = options;
  });

  store.set({ fieldOfViewTrim: 5 });
  assert.equal(calls, 1);
  assert.equal(seen.fieldOfViewTrim, 5);

  // A slider dragged back to where it started must not save and must not
  // notify, or every listener rebuilds for nothing.
  store.set({ fieldOfViewTrim: 5 });
  assert.equal(calls, 1);

  stop();
  store.set({ fieldOfViewTrim: 7 });
  assert.equal(calls, 1, 'an unsubscribed listener is really gone');
});

test('a prompt is marked seen exactly once', () => {
  const store = new OptionsStore(new SafeStorage(new MemoryStore()));
  let calls = 0;
  store.onChange(() => {
    calls += 1;
  });

  store.markPromptSeen('accelerate');
  store.markPromptSeen('accelerate');
  assert.deepEqual(store.current.seenPrompts, ['accelerate']);
  assert.equal(calls, 1);
});

test('reset returns to the defaults the store was built with', () => {
  const store = new OptionsStore(new SafeStorage(new MemoryStore()), { quality: 'medium' });
  store.set({ fieldOfViewTrim: 8, quality: 'low' });
  store.reset();

  assert.equal(store.current.fieldOfViewTrim, DEFAULT_OPTIONS.fieldOfViewTrim);
  assert.equal(store.current.quality, 'medium');
});

test('a store with no persistence still works for the session', () => {
  const store = new OptionsStore(new SafeStorage(null));
  assert.equal(store.persistent, false);
  store.set({ fieldOfViewTrim: 4 });
  assert.equal(store.current.fieldOfViewTrim, 4);
});

test('sameOptions compares by value, not by serialization', () => {
  const a = coerceOptions({ bindings: { hop: ['Space'] }, seenPrompts: ['brake'] });
  const b = coerceOptions({ seenPrompts: ['brake'], bindings: { hop: ['Space'] } });
  assert.ok(sameOptions(a, b), 'key order is not a difference');

  assert.equal(sameOptions(a, coerceOptions({ bindings: { hop: ['KeyJ'] } })), false);
  assert.equal(sameOptions(a, coerceOptions({ bindings: {} })), false);
  assert.equal(sameOptions(a, coerceOptions({ ...a, seenPrompts: [] })), false);
});

test('a change to one option leaves the other records identical', () => {
  // **Referential stability, and it is not a micro-optimization.** The
  // composition root reinstalls the keyboard's binding tables when the binding
  // record changes, and reinstalling them clears held keys by design. The
  // options record also carries the onboarding's seen flags, which are written
  // *during a ride* — so a `set()` that minted a fresh bindings object every
  // time cut the throttle from under a rider a few seconds into their first
  // ride, with nothing anywhere to explain the hesitation.
  const store = new OptionsStore(new SafeStorage(new MemoryStore()));
  const before = store.current.bindings;

  store.set({ seenPrompts: ['ride'] });
  assert.equal(store.current.bindings, before, 'the bindings object was replaced');

  store.set({ fieldOfViewTrim: 5 });
  assert.equal(store.current.bindings, before);

  // And a real binding change genuinely does produce a new record, or the
  // guard above would be suppressing the thing it exists to allow.
  store.set({ bindings: { hop: ['KeyJ'] } });
  assert.notEqual(store.current.bindings, before);
  assert.deepEqual(store.current.bindings.hop, ['KeyJ']);

  // Writing the same map again is not a change.
  const rebound = store.current.bindings;
  store.set({ bindings: { hop: ['KeyJ'] } });
  assert.equal(store.current.bindings, rebound);
});
