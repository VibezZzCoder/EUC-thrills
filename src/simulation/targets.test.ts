/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TARGET } from '../data/tuning.ts';
import type { Target } from '../level/plan.ts';
import { TargetField, sweptBodyHitsTarget } from './targets.ts';

const stand: Target = {
  id: 'stand',
  base: { x: 0, y: 0, z: 0 },
  centre: { x: TARGET.cantilever, y: TARGET.strikeHeight, z: 0 },
  radius: TARGET.discRadius,
};

test('body contact covers the visible post and arm without widening the paddle disc', () => {
  const field = new TargetField([stand]);
  const atPost: string[] = [];
  const radius = TARGET.bodyKnockRadius;

  field.eachBodyNear(
    -radius,
    0,
    -radius,
    radius,
    TARGET.bodyKnockHeight,
    radius,
    (target) => atPost.push(target.id),
  );
  assert.deepEqual(atPost, ['stand'], 'the visible post is absent from the body broadphase');

  const paddleAtPost: string[] = [];
  field.eachNear(
    -radius,
    0,
    -radius,
    radius,
    TARGET.bodyKnockHeight,
    radius,
    (target) => paddleAtPost.push(target.id),
  );
  assert.deepEqual(paddleAtPost, [], 'the paddle broadphase grew from the disc to the stand');

  assert.equal(
    sweptBodyHitsTarget(0, 0, 0, 0, radius, stand),
    true,
    'riding into the post did not count',
  );
  assert.equal(
    sweptBodyHitsTarget(TARGET.cantilever / 2, 0, TARGET.cantilever / 2, 0, radius, stand),
    true,
    'riding into the cantilever arm did not count',
  );
  assert.equal(
    sweptBodyHitsTarget(TARGET.cantilever, 0, TARGET.cantilever, 0, radius, stand),
    true,
    'riding into the round pad did not count',
  );
  assert.equal(
    sweptBodyHitsTarget(TARGET.cantilever, 0.6, TARGET.cantilever, 0.6, radius, stand),
    true,
    'the pad face was reduced to the thin arm proxy',
  );
});

test('body contact sweeps between fixed-step poses and keeps a real near miss clear', () => {
  const radius = TARGET.bodyKnockRadius;
  assert.equal(
    sweptBodyHitsTarget(0, -1, 0, 1, radius, stand),
    true,
    'a fast pass crossed the post between samples without a hit',
  );

  const justOutsidePost = radius + TARGET.postRadius + 0.001;
  assert.equal(
    sweptBodyHitsTarget(0, justOutsidePost, 0, justOutsidePost, radius, stand),
    false,
    'the visible stand proxy was inflated past its drawn post and arm',
  );
});

test('the body grid indexes a cantilever that crosses a cell boundary', () => {
  const crossing: Target = {
    id: 'crossing',
    // With the anchor below, the 8 m grid boundary is at x=7.925. The body's
    // query stops at x=7.75 while the disc begins at x=7.96, so indexing only
    // the disc makes this visible post disappear from the neighbouring cell.
    base: { x: 7.40, y: 0, z: 0 },
    centre: { x: 8.30, y: TARGET.strikeHeight, z: 0 },
    radius: TARGET.discRadius,
  };
  const anchor: Target = {
    id: 'anchor',
    base: { x: 0, y: 0, z: 0 },
    centre: { x: TARGET.cantilever, y: TARGET.strikeHeight, z: 0 },
    radius: TARGET.discRadius,
  };
  const field = new TargetField([anchor, crossing]);
  const radius = TARGET.bodyKnockRadius;
  const seen: string[] = [];
  field.eachBodyNear(
    crossing.base.x - radius,
    0,
    -radius,
    crossing.base.x + radius,
    TARGET.bodyKnockHeight,
    radius,
    (target) => seen.push(target.id),
  );
  assert.deepEqual(seen, ['crossing']);
});
