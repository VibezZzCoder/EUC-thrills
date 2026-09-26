/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateLevel } from '../level/generateRoute.ts';
import { RouteSpine, createSpineSample } from './routeSpine.ts';

/**
 * `RouteSpine.fromTraversal`'s `closeWhenJoined` option — M39 Part P
 * (`docs/M39_CHASE.md` §2c, R-3). The chase bench's evader rides the town
 * ring through every alternate arm; on an unclosed line he would park on the
 * line's end after one lap. Asked for, the option closes a traversal whose
 * ends meet within `fromPlan`'s join; absent, nothing changes — `StreetLoops`,
 * the route field and the patrol posts all rely on unclosed rings.
 */

function townRing(seed: string) {
  const { plan } = generateLevel(seed);
  const ring = (plan.streetLoops ?? []).find((loop) => loop.alternate.length === 0);
  assert.ok(ring !== undefined, `${seed} has no town ring`);
  return { plan, traversal: ring.main.map((id) => ({ id, forward: true })) };
}

test('closeWhenJoined closes a traversal whose ends meet, and the closed line wraps', () => {
  const { plan, traversal } = townRing('euc');
  const closed = RouteSpine.fromTraversal(plan, traversal, { closeWhenJoined: true });
  assert.equal(closed.closed, true, 'the town ring\'s own traversal returns to its start');
  const past = closed.sample(closed.length + 10, createSpineSample());
  const early = closed.sample(10, createSpineSample());
  assert.ok(Math.hypot(past.x - early.x, past.z - early.z) < 1e-6, 'a closed line wraps past its end');
});

test('closeWhenJoined leaves a traversal whose ends do not meet unclosed', () => {
  const { plan, traversal } = townRing('euc');
  const half = traversal.slice(0, Math.max(1, Math.floor(traversal.length / 2)));
  const open = RouteSpine.fromTraversal(plan, half, { closeWhenJoined: true });
  assert.equal(open.closed, false, 'half a ring does not join');
  const end = open.sample(open.length + 10, createSpineSample());
  assert.equal(end.distance, open.length, 'an unclosed line clamps');
});

test('absent or false, the option changes nothing', () => {
  const { plan, traversal } = townRing('euc');
  const bare = RouteSpine.fromTraversal(plan, traversal);
  const off = RouteSpine.fromTraversal(plan, traversal, { closeWhenJoined: false });
  const joined = RouteSpine.fromTraversal(plan, traversal, { closeWhenJoined: true });
  assert.equal(bare.closed, false);
  assert.equal(off.closed, false);
  assert.equal(bare.length, joined.length, 'closing changes no point, only the flag');
  const a = createSpineSample();
  const b = createSpineSample();
  const c = createSpineSample();
  for (let distance = 0; distance < bare.length; distance += 7.5) {
    bare.sample(distance, a);
    off.sample(distance, b);
    joined.sample(distance, c);
    assert.deepStrictEqual(b, a, `the false option moved the line at ${distance} m`);
    assert.deepStrictEqual(c, a, `closing moved the line at ${distance} m`);
  }
});
