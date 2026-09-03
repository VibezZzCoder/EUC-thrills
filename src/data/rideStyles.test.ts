/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ALL_CHARACTERS, rideStyleFor } from './riders.ts';
import { DRUNK_STYLE, SOBER_STYLE, type RideStyle } from './rideStyles.ts';
import { DRUNK } from './tuning.ts';

/**
 * The ride style's data half — M29 (`docs/PLANS.md` §29.4).
 *
 * Two claims a browser cannot make and the controller's digests do not:
 * that the sober record really is the identity it is documented as, and
 * that the roster hands it to everybody but one. Phase 0 recorded the first
 * and seated everyone sober; Phase 1 edited exactly one line of the second
 * test — the Drunkard's — and the first must never change.
 */

test('the sober style is every field at exactly zero, and frozen', () => {
  // Zero is the identity by arithmetic: every term a style adds is a product
  // with one of these fields, so a field that is not exactly zero — or not a
  // number at all — is a term that survives into a sober ride.
  const fields = Object.keys(SOBER_STYLE);
  assert.ok(fields.length >= 10, `${fields.length} fields is not the record §29.4 describes`);
  for (const field of fields) {
    const value = (SOBER_STYLE as unknown as Record<string, unknown>)[field];
    assert.equal(typeof value, 'number', `${field} is not a number`);
    assert.ok(Object.is(value, 0), `${field} is ${String(value)}, not exactly 0`);
  }
  assert.equal(Object.isFrozen(SOBER_STYLE), true, 'the identity is shared and must not be writable');
});

test('Phase 1: every character on the roster is sober by data but the Drunkard, and the cop is spelled out', () => {
  // The whole of the claim about the wiring: the table exists, it names
  // everyone, and it says sober for all of them but one — so the controllers
  // the composition root dresses are provably the ones the digests pinned,
  // and the one that is not is the one the roster names.
  for (const character of ALL_CHARACTERS) {
    if (character.id === 'drunkard') continue;
    assert.equal(rideStyleFor(character.id), SOBER_STYLE, `${character.id} is not sober`);
  }
  assert.equal(rideStyleFor('drunkard'), DRUNK_STYLE, 'Phase 1 seats him on the Drunken Master');
  assert.equal(rideStyleFor('cop'), SOBER_STYLE, 'the chase is sober by data, not by default (S3)');
  // A stale id out of an old store gets the identity, never a style.
  assert.equal(rideStyleFor('nobody' as never), SOBER_STYLE);
});

test('the Drunken Master reads its numbers off the DRUNK tuning block, field for field, and is frozen', () => {
  // `DRUNK_STYLE` is the shipped record; the F4 panel reaches a *copy* of it
  // through `Game.applyTuning`, never this object. Same keys as the identity,
  // so a field added to one and not the other is a compile error here and a
  // `NaN` nowhere.
  assert.deepEqual(Object.keys(DRUNK_STYLE).sort(), Object.keys(SOBER_STYLE).sort());
  for (const field of Object.keys(DRUNK_STYLE) as (keyof RideStyle)[]) {
    assert.equal(DRUNK_STYLE[field], DRUNK[field], `${field} is not the tuning block's`);
    assert.ok(Number.isFinite(DRUNK_STYLE[field]), `${field} must be finite`);
  }
  assert.ok(DRUNK_STYLE.weaveRateA > 0 && DRUNK_STYLE.weaveRateB > 0, 'two sines');
  assert.notEqual(DRUNK_STYLE.weaveRateA, DRUNK_STYLE.weaveRateB, 'incommensurate, not a metronome');
  assert.ok(DRUNK_STYLE.weaveSpeedFull > DRUNK_STYLE.weaveSpeedFloor, 'the gate has a ramp');
  assert.equal(Object.isFrozen(DRUNK_STYLE), true);
});

test('F4 numbers travel through rideStyleFor and the roster still decides who gets them (S7)', () => {
  // The panel builds a copy of the drunk numbers and hands it to every seat
  // through this one function. A sober row gets the identity whatever
  // arrives, so no slider can put a style on a seat; his row gets exactly the
  // record that was passed, so every slider reaches him.
  const tuned: RideStyle = Object.freeze({ ...DRUNK_STYLE, weaveHeading: 0.5, stumbleEvery: 1 });
  assert.equal(rideStyleFor('drunkard', tuned), tuned);
  for (const character of ALL_CHARACTERS) {
    if (character.id === 'drunkard') continue;
    assert.equal(rideStyleFor(character.id, tuned), SOBER_STYLE, `${character.id} caught a style from the panel`);
  }
  assert.equal(rideStyleFor('cop', tuned), SOBER_STYLE);
  // And with nothing passed, the shipped record.
  assert.equal(rideStyleFor('drunkard'), DRUNK_STYLE);
});

/**
 * Safeguard S2 as structure — the census of who may put a style on a seat.
 *
 * The plan named three writers (`dressSeat`, `installLevel`, `spawnRider`);
 * the tree has five places a seat's character or controller is written,
 * because the boot path births seat 0's controller before `installLevel`
 * ever runs and the chase births the cop's. Phase 1 added the two F4
 * re-dressings in `applyTuning` — every seat, then the cop, the same loop
 * the physics push uses — so the sliders reach his numbers through the
 * existing live-tuning path (S7). Seven, each one line, and **all seven go
 * through one private helper, `rideStyleFromStore`, which is the only line
 * in the file that reads `rideStyleFor`** — because the independent QA pass
 * found the dressings installing the shipped record while `applyTuning`
 * installed the store's, so a re-dress silently threw a seat's F4 overrides
 * away. One reader of the store, and nothing else in `src/` may call
 * `setRideStyle` at all — the shape `simulation/paddle.test.ts` pins for
 * `injectWobble`'s callers, for the same reason: a door that gains a caller
 * in a diff nobody read is how a sober seat catches a style.
 */
test('the seven style writers in Game.ts read the roster through one store-reading helper, and nobody else installs a style', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const game = readFileSync(new URL('../app/Game.ts', import.meta.url), 'utf8');
  const installs = game.match(/\.setRideStyle\(this\.rideStyleFromStore\(/g) ?? [];
  assert.equal(installs.length, 7, 'seven writers: boot, installLevel, spawnRider, dressSeat, the cop, and F4\'s two re-dressings');
  assert.equal((game.match(/setRideStyle\(/g) ?? []).length, 7, 'and every call goes through the helper');
  assert.equal((game.match(/rideStyleFor\(/g) ?? []).length, 1, 'the roster is read in exactly one place, the helper');
  // The helper reads every field of the block off the store, or a slider
  // would be a slider that moves nothing — the AGENTS.md rule about tunables
  // nothing re-reads — and a dressing would install stale numbers.
  for (const field of Object.keys(DRUNK_STYLE)) {
    assert.ok(game.includes(`'DRUNK.${field}'`), `rideStyleFromStore does not read DRUNK.${field}`);
  }

  // No option field, no URL, no F4 control: the composition root is the only
  // caller anywhere under src/ that is not a test.
  // `fileURLToPath`, not `.pathname`: this project's folder has spaces in it.
  const src = fileURLToPath(new URL('..', import.meta.url));
  const callers: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!path.endsWith('.ts') || path.endsWith('.test.ts')) continue;
      if (path.endsWith('simulation/EucController.ts')) continue;
      if (readFileSync(path, 'utf8').includes('setRideStyle(')) callers.push(path.slice(src.length));
    }
  };
  walk(src);
  assert.deepEqual(callers, ['app/Game.ts']);
  assert.equal(readFileSync(join(src, 'app/options.ts'), 'utf8').includes('tyle'), false,
    'GameOptions carries no style field, and never will');
  // **And no `?drunk=`** (S6): M13's `?wobbleprobe=` lesson is that a URL
  // which arms a ride behaviour becomes an "always on" nobody chose.
  assert.equal(/['"]drunk['"]/.test(game), false, 'no URL parameter arms the style');
  assert.equal(game.includes('readNumberParam(params, \'drunk\''), false);
});
