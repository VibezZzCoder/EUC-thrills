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
  QUALITY_LEVELS,
  TOUCH_CONTROL_MODES,
  TOUCH_SCALE_MAX,
  TOUCH_SCALE_MIN,
  coerceOptions,
  deviceDefaults,
  sameOptions,
  type GameOptions,
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
    // Not 'ultra': that became a real level at M39. Any string outside
    // QUALITY_LEVELS is what this row is about.
    quality: 'ludicrous',
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

// ---------------------------------------------------------------------------
// M39 — Ultra is a real quality level (`docs/PLANS.md` §39.6, q201)
// ---------------------------------------------------------------------------

test('a fresh install and an empty record still land on High, never Ultra', () => {
  // "Never the default … never auto-promote a new player": Ultra is only
  // ever a deliberate choice, so both doors a new player can arrive by — the
  // shipped defaults and a record with nothing in it — must say High.
  assert.equal(DEFAULT_OPTIONS.quality, 'high');
  assert.equal(coerceOptions({}).quality, 'high');
  assert.equal(coerceOptions(undefined).quality, 'high');
  assert.equal(new OptionsStore(new SafeStorage(new MemoryStore())).current.quality, 'high');
});

test('Ultra is the last level, so the ordinary three keep their places', () => {
  // Settings lists these in order and a pad or arrow key walks them: Low,
  // Medium and High must be exactly where M9 put them, with Ultra after High.
  assert.deepEqual(QUALITY_LEVELS, ['low', 'medium', 'high', 'ultra']);
});

test('an explicit Ultra survives a save and a reload, and so does leaving it', () => {
  const backing = new MemoryStore();
  const store = new OptionsStore(new SafeStorage(backing));

  store.set({ quality: 'ultra' });
  assert.equal(store.current.quality, 'ultra');
  assert.equal(new OptionsStore(new SafeStorage(backing)).current.quality, 'ultra');

  // And back: the choice of an ordinary tier is persisted exactly as before.
  store.set({ quality: 'medium' });
  assert.equal(new OptionsStore(new SafeStorage(backing)).current.quality, 'medium');
});

test('only the exact word is Ultra; anything else keeps the current choice', () => {
  for (const word of ['Ultra', 'ULTRA', ' ultra', 'ultra ', 'ultra-full', 'ultra-lit', 4, null]) {
    assert.equal(coerceOptions({ quality: word }).quality, 'high', String(word));
  }
  // A record written by a later build with a tier this one does not know
  // keeps the player's current choice rather than resetting it — including
  // a current Ultra.
  const base: GameOptions = coerceOptions({ quality: 'ultra' });
  assert.equal(coerceOptions({ quality: 'ludicrous' }, base).quality, 'ultra');
  // A pre-M39 record is untouched.
  for (const level of ['low', 'medium', 'high'] as const) {
    assert.equal(coerceOptions({ quality: level }).quality, level);
  }
});

test('moving to or from Ultra is a real change, and staying on it is not', () => {
  // `sameOptions` gates every save and every listener, so Ultra must compare
  // like any other level or the title toggle would appear to do nothing.
  assert.equal(sameOptions(DEFAULT_OPTIONS, coerceOptions({ ...DEFAULT_OPTIONS, quality: 'ultra' })), false);
  assert.ok(sameOptions(
    coerceOptions({ ...DEFAULT_OPTIONS, quality: 'ultra' }),
    coerceOptions({ ...DEFAULT_OPTIONS, quality: 'ultra' }),
  ));

  const store = new OptionsStore(new SafeStorage(new MemoryStore()));
  const seen: string[] = [];
  store.onChange((options) => seen.push(options.quality));
  store.set({ quality: 'ultra' });
  store.set({ quality: 'ultra' });
  store.set({ quality: 'high' });
  store.set({ quality: 'ultra' });
  assert.deepEqual(seen, ['ultra', 'high', 'ultra'], 'one notification per real change');
});

test('reset takes a saved Ultra back to High', () => {
  const backing = new MemoryStore();
  const store = new OptionsStore(new SafeStorage(backing));
  store.set({ quality: 'ultra' });
  store.reset();
  assert.equal(store.current.quality, 'high');
  assert.equal(new OptionsStore(new SafeStorage(backing)).current.quality, 'high');
});

test('a phone or tablet starts on Medium; a saved choice and a fine pointer keep theirs (2026-10-04)', () => {
  // Owner decision: the living world made High several times the Sep 26
  // frame, and no handset has measured it, so a finger-first device starts
  // one step down. Desktops and touchscreen laptops are untouched.
  assert.deepEqual(deviceDefaults(false), {});
  assert.equal(new OptionsStore(new SafeStorage(new MemoryStore()), deviceDefaults(false)).current.quality, 'high');
  assert.equal(new OptionsStore(new SafeStorage(new MemoryStore()), deviceDefaults(true)).current.quality, 'medium');

  // A phone player who already chose High (or anything else) keeps it.
  const backing = new MemoryStore();
  new OptionsStore(new SafeStorage(backing), deviceDefaults(true)).set({ quality: 'high' });
  assert.equal(new OptionsStore(new SafeStorage(backing), deviceDefaults(true)).current.quality, 'high');

  // Reset on a phone returns to the phone default, never to Ultra.
  const store = new OptionsStore(new SafeStorage(new MemoryStore()), deviceDefaults(true));
  store.set({ quality: 'ultra' });
  store.reset();
  assert.equal(store.current.quality, 'medium');
});
