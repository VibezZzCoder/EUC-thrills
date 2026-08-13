/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { LiveTuning } from './liveTuning.ts';
import { LIVE_TUNABLES, TUNING, type TunableSpec } from './tuning.ts';

const SPECS: readonly TunableSpec[] = Object.freeze([
  {
    path: 'LIGHTING.exposure',
    group: 'Lighting',
    label: 'Exposure',
    unit: '×',
    min: 0.5,
    max: 2,
    step: 0.01,
    note: 'test',
  },
]);

test('every shipped tunable resolves to a finite number inside its own range', () => {
  // A slider whose path is a typo presents as a control that does nothing, and
  // that is a very slow thing to notice while tuning by feel.
  const tuning = new LiveTuning();

  for (const spec of LIVE_TUNABLES) {
    const value = tuning.defaultOf(spec.path);
    assert.ok(Number.isFinite(value), `${spec.path} is not a number`);
    assert.ok(spec.min < spec.max, `${spec.path} has an empty range`);
    assert.ok(
      value >= spec.min && value <= spec.max,
      `${spec.path} default ${value} is outside its slider range ${spec.min}..${spec.max}`,
    );
    assert.ok(spec.step > 0, `${spec.path} has a non-positive step`);
    assert.ok(spec.note.length > 0, `${spec.path} has no note explaining why it exists`);
  }
});

test('an unresolvable tunable path fails loudly at construction', () => {
  assert.throws(
    () => new LiveTuning([{ ...SPECS[0], path: 'LIGHTING.exposre' }]),
    /does not resolve/,
  );
});

test('the tuning defaults are frozen, so reset is exact', () => {
  assert.throws(() => {
    (TUNING.LIGHTING as { exposure: number }).exposure = 99;
  }, TypeError);
  assert.equal(TUNING.LIGHTING.exposure, 1.0);
});

test('an override reads through and reverts exactly', () => {
  const tuning = new LiveTuning(SPECS);
  const original = tuning.get('LIGHTING.exposure');

  tuning.set('LIGHTING.exposure', 1.4);
  assert.equal(tuning.get('LIGHTING.exposure'), 1.4);
  assert.equal(tuning.overrideCount(), 1);

  tuning.reset('LIGHTING.exposure');
  assert.equal(tuning.get('LIGHTING.exposure'), original);
  assert.equal(tuning.overrideCount(), 0);
});

test('a value typed past the end of a slider lands at the end of the slider', () => {
  const tuning = new LiveTuning(SPECS);
  assert.equal(tuning.set('LIGHTING.exposure', 50), 2);
  assert.equal(tuning.set('LIGHTING.exposure', -50), 0.5);
});

test('setting a tunable back to its default clears the override', () => {
  const tuning = new LiveTuning(SPECS);
  const original = tuning.defaultOf('LIGHTING.exposure');

  tuning.set('LIGHTING.exposure', 1.4);
  tuning.set('LIGHTING.exposure', original);

  // Otherwise the panel keeps marking a value as overridden after it has been
  // dragged back, and "N overrides active" stops meaning anything.
  assert.equal(tuning.overrideCount(), 0);
  assert.deepEqual(tuning.overrides(), {});
});

test('listeners fire only when a value actually moves', () => {
  const tuning = new LiveTuning(SPECS);
  const seen: [string, number][] = [];
  tuning.onChange((path, value) => seen.push([path, value]));

  tuning.set('LIGHTING.exposure', 1.4);
  tuning.set('LIGHTING.exposure', 1.4);
  tuning.set('LIGHTING.exposure', 99);
  tuning.set('LIGHTING.exposure', 100);
  tuning.reset();

  assert.deepEqual(seen, [
    ['LIGHTING.exposure', 1.4],
    ['LIGHTING.exposure', 2],
    ['LIGHTING.exposure', 1.0],
  ]);
});

test('every tuning path the app reads is a registered tunable', () => {
  // **This test exists because the browser suite found it and cost six minutes
  // doing so** (M17). `LiveTuning.get` throws on an unregistered path, and the
  // one caller that matters — `Game.applyTuning` — runs at boot, so a path that
  // is pushed to the controller without a matching `LIVE_TUNABLES` entry does
  // not degrade: the game refuses to start with "not a registered tunable" on
  // the title screen. Nothing else can catch it. `Game.ts` imports `three`, so
  // architecture invariant 1 keeps it out of this suite, and TypeScript is
  // happy because the path is only ever a string.
  //
  // Reading the source is the cheap half of that check, and it turns a boot
  // failure found in a browser into a failure found in milliseconds.
  const registered = new Set(LIVE_TUNABLES.map((spec) => spec.path));
  const root = join(import.meta.dirname, '..');
  const offenders: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      const source = readFileSync(full, 'utf8');
      // `tuning.get('PATH')` and `.set('PATH', …)` — the two ways a path is
      // ever named. Anything computed is out of scope and out of reach.
      for (const match of source.matchAll(/tuning\.(?:get|set|defaultOf)\(\s*'([^']+)'/g)) {
        const path = match[1];
        if (!registered.has(path)) {
          offenders.push(`${relative(root, full)} reads "${path}"`);
        }
      }
    }
  };
  walk(root);

  assert.deepEqual(
    offenders,
    [],
    `these paths would throw at boot:\n${offenders.join('\n')}`,
  );
});

test('an unknown path is an error rather than a silently ignored write', () => {
  const tuning = new LiveTuning(SPECS);
  assert.throws(() => tuning.set('WHEEL.tyreWidth', 0.1), /not a registered tunable/);
  assert.throws(() => tuning.get('WHEEL.tyreWidth'), /not a registered tunable/);
});

test('a listener may unsubscribe itself from inside the callback', () => {
  const tuning = new LiveTuning(SPECS);
  let calls = 0;
  const stop = tuning.onChange(() => {
    calls += 1;
    stop();
  });

  tuning.set('LIGHTING.exposure', 1.4);
  tuning.set('LIGHTING.exposure', 1.5);
  assert.equal(calls, 1);
});
