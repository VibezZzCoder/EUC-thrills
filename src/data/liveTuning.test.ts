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

/**
 * The fifteen Ultra live values — M39 (`docs/M39_ULTRA.md` §6.2
 * `UltraLiveTuning`, §6.3 W4; the last two, the static-shade lift's, from the
 * final touch after round 4). Spelled out here rather than imported from
 * `render/ultra/`, so a path renamed on either side fails by name.
 */
const ULTRA_LIVE_PATHS = [
  'ULTRA.nearBias',
  'ULTRA.nearNormalBias',
  'ULTRA.nearRadius',
  'ULTRA.envKappa',
  'ULTRA.bounceLift',
  'ULTRA.groundSpec',
  'ULTRA.glassSpec',
  'ULTRA.waterSpec',
  'ULTRA.contactStrength',
  'ULTRA.contactDirectShare',
  'ULTRA.foliageWrap',
  'ULTRA.foliageTransmission',
  'ULTRA.specAA',
  'ULTRA.shade.lift',
  'ULTRA.shade.liftFar',
] as const;

/** A path's value in the ULTRA table, walked field by field (`ULTRA.shade.lift`). */
function ultraTableValue(path: string): unknown {
  let node: unknown = TUNING.ULTRA;
  for (const key of path.split('.').slice(1)) {
    node = node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  }
  return node;
}

test('the sixteen Ultra paths are registered — the fifteen in UltraLiveTuning order, then the pixel knob — at the ULTRA table', () => {
  const registered = LIVE_TUNABLES.filter((spec) => spec.path.startsWith('ULTRA.')).map((spec) => spec.path);
  // …then the owner's pixel knob (Fable I4), which is not an `UltraLiveTuning`
  // field and travels on its own push.
  assert.deepEqual(registered, [...ULTRA_LIVE_PATHS, 'ULTRA.pixelBudget']);
  assert.equal(registered.length, 16);
  assert.equal(new LiveTuning().defaultOf('ULTRA.pixelBudget'), TUNING.ULTRA.pixelBudget);
  const tuning = new LiveTuning();
  for (const path of ULTRA_LIVE_PATHS) {
    const value = ultraTableValue(path);
    assert.equal(typeof value, 'number', `${path} is not a number in the ULTRA table`);
    assert.equal(tuning.defaultOf(path), value, `${path} does not start at the ULTRA table`);
    assert.equal(tuning.get(path), value);
  }
});

test('the static-shade lift is live for the owner\'s trades: range 0–3 near, the shipped A28/A29 values on the slider grid', () => {
  // Final touch (post round 4): Trade 1(b) and 2(b) are judged on his ride.
  const spec = (path: string): TunableSpec => {
    const found = LIVE_TUNABLES.find((candidate) => candidate.path === path);
    assert.ok(found !== undefined, `${path} is not registered`);
    return found;
  };
  const near = spec('ULTRA.shade.lift');
  const far = spec('ULTRA.shade.liftFar');
  assert.equal(near.min, 0);
  assert.equal(near.max, 3);
  assert.ok(far.min === 0 && far.max >= 3);
  assert.equal(near.group, far.group);
  for (const [s, value] of [[near, TUNING.ULTRA.shade.lift], [far, TUNING.ULTRA.shade.liftFar]] as const) {
    assert.ok(value >= s.min && value <= s.max, `${s.path} ships outside its slider`);
    const steps = (value - s.min) / s.step;
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9, `${s.path} ships off its slider's grid`);
    assert.ok(s.note.includes('Trade 1/2'), `${s.path}'s note does not name the trades`);
  }
  // A28 (Codex's post-GU QA): Trade 1's near street at 0.70–0.76 × sunlit.
  // 2.1 → 2.2 (Fable F-A2): the street carries more of the rider's separation (commercial 0.755 × sunlit).
  assert.equal(TUNING.ULTRA.shade.lift, 2.2);
  // A29 (round 5 rejected A28's paler slab, 2.5 over 20–30 m): the far lift is U5's again, over U5's ramp.
  assert.equal(TUNING.ULTRA.shade.liftFar, 2.2);
  assert.deepEqual([...TUNING.ULTRA.shade.liftDistance], [20, 36]);
  assert.ok(far.note.includes('over 20–36 m'), 'the far note names another ramp than the shipped one');
  const tuning = new LiveTuning();
  assert.equal(tuning.set('ULTRA.shade.lift', 5), 3);
  assert.equal(tuning.set('ULTRA.shade.liftFar', -1), 0);
});

test('every Ultra slider says it is Ultra only, and sits in an Ultra group', () => {
  // On an ordinary tier these move nothing; the panel says so rather than
  // leaving the owner to discover it.
  for (const spec of LIVE_TUNABLES.filter((candidate) => candidate.path.startsWith('ULTRA.'))) {
    assert.ok(spec.group.startsWith('Ultra'), `${spec.path} is in group ${spec.group}`);
    assert.ok(spec.note.startsWith('Ultra only.'), `${spec.path}'s note does not say Ultra only`);
  }
});

test('the Ultra sliders hold the spec’s caps and reach the gauntlet’s planted defect', () => {
  const spec = (path: string): TunableSpec => {
    const found = LIVE_TUNABLES.find((candidate) => candidate.path === path);
    assert.ok(found !== undefined, `${path} is not registered`);
    return found;
  };
  // §3.3: direct-light AO share ≤ 0.3, foliage transmission ≤ 0.22.
  assert.equal(spec('ULTRA.contactDirectShare').max, 0.3);
  assert.equal(spec('ULTRA.foliageTransmission').max, 0.22);
  // §8.1: `--tune ULTRA.nearBias=0` is the planted acne; it must be in range.
  const bias = spec('ULTRA.nearBias');
  assert.ok(bias.min <= 0 && bias.max >= 0);
  const tuning = new LiveTuning();
  assert.equal(tuning.set('ULTRA.nearBias', 0), 0);
  assert.equal(tuning.set('ULTRA.foliageTransmission', 0.5), 0.22);
  assert.equal(tuning.set('ULTRA.contactDirectShare', 1), 0.3);
  // Reset lands exactly on the table.
  tuning.reset();
  assert.equal(tuning.get('ULTRA.nearBias'), TUNING.ULTRA.nearBias);
});

// -- The pack and the room — M39 Part P (docs/PLANS.md §39.6b.7) -------------

/** §39.6b.7's F4 knobs, in the panel's order: the solo face's four, then the couch face's four. */
const PART_P_PATHS = [
  'CHASE.postStandoffMetres',
  'CHASE.patrolWakeMetres',
  'CHASE.patrolReturnMetres',
  'CHASE.packSpacingMetres',
  'CHASE.couchEscapeSeconds',
  'CHASE.dealHoldSeconds',
  'CHASE.returnConeRadians',
  'CHASE.copHoldSeconds',
] as const;

test('Part P\'s eight knobs sit under Ride — chase, and the room size is not a knob (q207)', () => {
  const chase = LIVE_TUNABLES.filter((spec) => spec.group === 'Ride — chase').map((spec) => spec.path);
  const registered = chase.filter((path) => (PART_P_PATHS as readonly string[]).includes(path));
  assert.deepEqual(registered, [...PART_P_PATHS]);
  // The rule's one constant is frozen by the owner — "fixed at 3. no more mr
  // nice guy" — so a slider for it would reopen a declined decision.
  assert.ok(!LIVE_TUNABLES.some((spec) => spec.path === 'CHASE.roomSize'),
    'CHASE.roomSize reached F4; q207 froze the count and ?cops= is the probe');
  assert.equal(TUNING.CHASE.roomSize, 4);
  // Each knob starts at the table and is documented in its own units.
  const tuning = new LiveTuning();
  for (const path of PART_P_PATHS) {
    const key = path.split('.')[1] as keyof typeof TUNING.CHASE;
    assert.equal(tuning.defaultOf(path), TUNING.CHASE[key], `${path} does not start at the CHASE table`);
  }
});

test('a patrol wakes where the siren starts: the wake range is the siren’s far edge', () => {
  // §39.6b.7: "60 m = AUDIO.sirenFarMetres, so a wake is heard as it
  // happens; a post is pinned against the audio table the way the quiet line
  // is" (`simulation/chase.test.ts` pins the quiet line). Short of the edge a
  // parked patrol is silent until he wakes (R-19) and the bed starts as he
  // does; past it one wakes in silence.
  assert.equal(TUNING.CHASE.patrolWakeMetres, TUNING.AUDIO.sirenFarMetres,
    `the wake range (${TUNING.CHASE.patrolWakeMetres} m) left the siren’s far edge (${TUNING.AUDIO.sirenFarMetres} m)`);
});

test('the patrol return line lies past the tracker line and inside what the camera draws', () => {
  // §39.6b.7, measured in QA r1 (2026-09-24): the chase camera draws a rig to
  // `LIGHTING.fogFar`, so a far edge past it would call "seen" what nobody can
  // see; and a return line inside the tracker line would let a forward post
  // qualify on the ahead rule alone. The default's own trade (200 m, not the
  // 470 m drawn range) is written beside it in `tuning.ts`; the "no straight
  // approach longer than this" half is pinned on the corpus by
  // `bench/chaseBench.test.ts`.
  assert.ok(TUNING.CHASE.patrolReturnMetres > TUNING.CHASE.trackerGapMetres);
  assert.ok(TUNING.CHASE.patrolReturnMetres <= TUNING.LIGHTING.fogFar,
    `the pane's far edge (${TUNING.CHASE.patrolReturnMetres} m) lies past the drawn range (${TUNING.LIGHTING.fogFar} m)`);
  assert.ok(TUNING.LIGHTING.fogFar <= TUNING.CAMERA.far);
});

test('the couch defaults are the owner’s answers: the solo bell, no hold, a finite deal hold', () => {
  // q217: the couch bell is the solo 300 s until his ride says otherwise.
  assert.equal(TUNING.CHASE.couchEscapeSeconds, TUNING.CHASE.escapeSeconds);
  // q224: 0 s — the 20 m spawn gap is the head start.
  assert.equal(TUNING.CHASE.copHoldSeconds, 0);
  // q221: the deal latches, and a latch that outlasted the bell would be
  // no deal at all — a lone cop could never rotate through the room.
  assert.ok(TUNING.CHASE.dealHoldSeconds > 0
    && TUNING.CHASE.dealHoldSeconds < TUNING.CHASE.trackerQuietSeconds);
  // The return cone must at least cover a 16:9 pane's horizontal half-angle
  // at speed, or a cop could be returned inside a view the rule protects.
  const halfHorizontal = Math.atan(Math.tan(TUNING.CAMERA.fovAtSpeed / 2) * (16 / 9));
  assert.ok(TUNING.CHASE.returnConeRadians > halfHorizontal,
    `the return cone (${TUNING.CHASE.returnConeRadians} rad) is narrower than a 16:9 pane at speed (${halfHorizontal.toFixed(3)} rad)`);
  // A pack spacing inside the patrol's own reach would refuse nothing useful;
  // one wider than the tail's return would refuse the return itself.
  assert.ok(TUNING.CHASE.packSpacingMetres > TUNING.CHASE.riderHitRadius * 2);
  assert.ok(TUNING.CHASE.packSpacingMetres < TUNING.CHASE.trackerReturnMetres);
});
