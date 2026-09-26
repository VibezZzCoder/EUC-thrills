/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHASE, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { generateLevel } from '../level/generateRoute.ts';
import type { LevelPlan } from '../level/plan.ts';
import {
  bearingTo, chooseIntercept, choosePatrolPosts, choosePostReturn, followLine, framedByAnyPane, INTERCEPT_WAKE_MARGIN_METRES,
  packmateBands, packmatePositions, postHoldSlope, wakeTarget,
  type PackBody, type PaneView, type PatrolPost, type PatrolPosts, type PostJudge,
} from './copPack.ts';
import { COP_WHEEL_TUNING, CpuRider, type RouteBlocker } from './cpuRider.ts';
import { createPose, EucController } from './EucController.ts';
import { foldedRouteFixture } from './foldedRouteFixture.ts';
import { HazardField } from './hazards.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { buildRouteField } from './routeField.ts';
import { createSpineLocation, createSpineSample, RouteSpine } from './routeSpine.ts';
import { SoftBodyField } from './softBodies.ts';
import { createGroundSample, type TerrainSampler } from './world.ts';

/**
 * The pack's arithmetic, headless — M39 Part P (`docs/PLANS.md` §39.6b.3,
 * §39.6b.3b; contract `docs/M39_CHASE.md` §2b).
 *
 * Posts are asserted on the real r6 town seeds the bench measures (the
 * six-seed corpus pinned in `docs/M39_PHASE0.md`), with the brain's own
 * blockers and landing judge — exactly what `installChaseWorld` hands the
 * chooser — so a regenerated town that moves the posts still passes if it
 * keeps the rules. Nothing below names a world coordinate: posts are located
 * back onto the ring and judged in ring distance.
 */

const CORPUS = ['euc', 'route-41', 'sweep-39', 'sweep-15', 'euc-7', 'harbour-spark-42'] as const;

interface World {
  readonly plan: LevelPlan;
  readonly spine: RouteSpine;
  readonly ring: RouteSpine;
  readonly ground: TerrainSampler;
  readonly blockers: readonly RouteBlocker[];
  readonly judge: PostJudge;
}

const worlds = new Map<string, World>();

/** One seed's world, built once: the plan, its spines, the brain's blockers and landing judge. */
function world(seed: string): World {
  const cached = worlds.get(seed);
  if (cached !== undefined) return cached;
  const { plan } = generateLevel(seed);
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null, `${seed} has no spine`);
  const loop = (plan.streetLoops ?? []).find((candidate) => candidate.alternate.length === 0);
  assert.ok(loop !== undefined, `${seed} has no town ring`);
  const ring = RouteSpine.fromTraversal(plan, loop.main.map((id) => ({ id, forward: true })));
  const ground = new PlanTerrainSampler(plan);
  const brain = new CpuRider(spine, plan, ground);
  const built: World = {
    plan, spine, ring, ground, blockers: brain.blockerField, judge: brain.landingAllowance.bind(brain),
  };
  worlds.set(seed, built);
  return built;
}

function posts(seed: string, count = 2): PatrolPosts {
  const w = world(seed);
  return choosePatrolPosts(w.plan, w.spine, w.blockers, w.ground, count, w.judge);
}

/** Shortest separation round a ring of `length`, metres. */
function around(a: number, b: number, length: number): number {
  const d = (((a - b) % length) + length) % length;
  return Math.min(d, length - d);
}

function standing(post: PatrolPost | null, label: string): PatrolPost {
  assert.ok(post !== null, `${label}: no post stood`);
  return post;
}

/** The ring's frame at a post's own ring distance: how far across, which way it runs. */
function acrossRing(ring: RouteSpine, post: PatrolPost): { lateral: number; headingY: number } {
  const at = ring.sample(post.ringDistance, createSpineSample());
  return {
    lateral: (post.x - at.x) * Math.cos(at.headingY) - (post.z - at.z) * Math.sin(at.headingY),
    headingY: at.headingY,
  };
}

// -- Posts -----------------------------------------------------------------

test('posts are the same for the same seed every time, and differ between seeds', () => {
  const first = posts('euc');
  const again = posts('euc');
  assert.deepEqual(again, first, 'the same seed parked its patrols somewhere else the second time');
  const other = posts('route-41');
  assert.notDeepEqual(other.posts, first.posts, 'two seeds share a beat');
});

test('every corpus seed parks two ring posts, beyond the tracker line from the spawn and off the through line', () => {
  for (const seed of CORPUS) {
    const w = world(seed);
    const chosen = posts(seed);
    assert.equal(chosen.source, 'ring', `${seed}: the posts did not come from the town ring`);
    assert.equal(chosen.posts.length, 2);
    const spawnAt = w.ring.locate(w.plan.spawn.position.x, w.plan.spawn.position.z, -1, createSpineLocation()).distance;
    const expectedStandoff = CHASE.postStandoffMetres;
    chosen.posts.forEach((maybe, index) => {
      const post = standing(maybe, `${seed} patrol ${index}`);
      assert.equal(post.index, index);
      const fromSpawn = Math.hypot(post.x - w.plan.spawn.position.x, post.z - w.plan.spawn.position.z);
      assert.ok(fromSpawn > CHASE.trackerGapMetres,
        `${seed} patrol ${index} parks ${fromSpawn.toFixed(0)} m from the spawn, inside the tracker line`);

      // At its own fraction of the ring, walked no more than a sixth of it.
      const target = spawnAt + ((index + 1) / 3) * w.ring.length;
      assert.ok(around(post.ringDistance, target, w.ring.length) <= w.ring.length / 6 + 1e-6,
        `${seed} patrol ${index} walked ${around(post.ringDistance, target, w.ring.length).toFixed(0)} m from its fraction`);
      assert.ok(post.ringDistance >= 0 && post.ringDistance < w.ring.length);

      // Off the through line by the standoff, on the side it names.
      const across = acrossRing(w.ring, post);
      const halfWidth = w.ring.sample(post.ringDistance, createSpineSample()).halfWidth;
      const want = Math.min(expectedStandoff, halfWidth + CHASE.streetMargin - CHASE.riderHitRadius);
      assert.ok(Math.abs(Math.abs(across.lateral) - want) < 1e-6,
        `${seed} patrol ${index} stands ${across.lateral.toFixed(2)} m off the line, not ${want.toFixed(2)}`);
      assert.equal(Math.sign(across.lateral), post.side, `${seed} patrol ${index} stands on the other side`);

      // On the ground, facing the spawn by the short way round.
      const ground = w.ground.sampleGround(post.x, post.z, { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'pavement', offCourse: false });
      assert.equal(post.y, ground.height, `${seed} patrol ${index} hovers`);
      const back = (((post.ringDistance - spawnAt) % w.ring.length) + w.ring.length) % w.ring.length;
      const facingLine = Math.cos(post.headingY - across.headingY) >= 0 ? 1 : -1;
      assert.equal(facingLine, back <= w.ring.length / 2 ? -1 : 1,
        `${seed} patrol ${index} faces away from the spawn`);

      // The brain's own judge allowed the spot.
      assert.notEqual(w.judge(post.distance, (facingLine) as 1 | -1), null,
        `${seed} patrol ${index} parks where the landing judge refuses`);
    });
    const [a, b] = chosen.posts as PatrolPost[];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > CHASE.packSpacingMetres, `${seed}: the two posts are one spot`);
  }
});

test('a spawn in the ring’s last third still parks both posts at their wrapped fractions, not on the ring’s end (R-13)', () => {
  const w = world('euc');
  const at = w.ring.sample(w.ring.length * 0.8, createSpineSample());
  const moved: LevelPlan = { ...w.plan, spawn: { position: { x: at.x, y: at.y, z: at.z }, headingY: at.headingY } };
  const chosen = choosePatrolPosts(moved, w.spine, w.blockers, w.ground, 2, w.judge);
  assert.equal(chosen.source, 'ring');
  chosen.posts.forEach((maybe, index) => {
    const post = standing(maybe, `patrol ${index}`);
    const target = (0.8 + (index + 1) / 3) % 1 * w.ring.length;
    assert.ok(around(post.ringDistance, target, w.ring.length) <= w.ring.length / 6 + 1e-6,
      `patrol ${index} sits at ${post.ringDistance.toFixed(0)} m, not near its wrapped ${target.toFixed(0)} m`);
    assert.ok(Math.hypot(post.x - at.x, post.z - at.z) > CHASE.trackerGapMetres);
  });
  const [a, b] = chosen.posts as PatrolPost[];
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 100, 'the two wrapped posts piled up together');
});

test('a single patrol (the 2v2 room) parks halfway round the ring (A-5)', () => {
  const w = world('route-41');
  const chosen = posts('route-41', 1);
  assert.equal(chosen.posts.length, 1);
  const post = standing(chosen.posts[0], 'the one patrol');
  const spawnAt = w.ring.locate(w.plan.spawn.position.x, w.plan.spawn.position.z, -1, createSpineLocation()).distance;
  assert.ok(around(post.ringDistance, spawnAt + w.ring.length / 2, w.ring.length) <= w.ring.length / 6 + 1e-6);
  assert.deepEqual(posts('route-41', 0), { posts: [], source: 'ring' }, 'a room with no patrols still parked somebody');
});

test('a post in a hole, or where the judge refuses, is refused and the walk continues along the ring', () => {
  const w = world('sweep-15');
  const free = standing(posts('sweep-15').posts[0], 'the unhindered post');

  // A deep hole under the free post and everything within 20 m of it.
  const holed: TerrainSampler = {
    sampleGround(x, z, out) {
      w.ground.sampleGround(x, z, out);
      if (Math.hypot(x - free.x, z - free.z) < 20) out.height -= 3;
      return out;
    },
    raycast: (origin, direction, max) => w.ground.raycast(origin, direction, max),
  };
  const aroundHole = standing(choosePatrolPosts(w.plan, w.spine, w.blockers, holed, 2, w.judge).posts[0], 'beside the hole');
  assert.ok(Math.hypot(aroundHole.x - free.x, aroundHole.z - free.z) >= 20 - 1e-6,
    'the patrol parked in the hole');
  assert.ok(around(aroundHole.ringDistance, free.ringDistance, w.ring.length) <= 60,
    'the walk went further than the nearest spot past the hole');

  // A bollard row the judge knows about: refuses 25 m either side of the free post.
  const refusing: PostJudge = (distance, direction) => (
    Math.abs(distance - free.distance) < 25 ? null : w.judge(distance, direction));
  const pastRow = standing(choosePatrolPosts(w.plan, w.spine, w.blockers, w.ground, 2, refusing).posts[0], 'past the row');
  assert.ok(Math.abs(pastRow.distance - free.distance) >= 25, 'the patrol parked where the judge refused');
});

test('the roomier side: a band on one side parks him on the other; open road parks him right', () => {
  const w = world('euc');
  const open = standing(choosePatrolPosts(w.plan, w.spine, [], w.ground, 1, null).posts[0], 'open road');
  assert.equal(open.side, -1, 'a tie did not go to the right');
  // A band hugging the right-hand kerb along the whole spot's neighbourhood.
  const right: RouteBlocker = { from: open.distance - 50, to: open.distance + 50, left: -0.5, right: -1.5, safeSpeed: 0, facing: 0 };
  const moved = standing(choosePatrolPosts(w.plan, w.spine, [right], w.ground, 1, null).posts[0], 'beside the band');
  assert.equal(moved.side, 1, 'a band on the right did not send him left');
  // A band across his whole spot on both sides refuses it and the walk continues.
  const wall: RouteBlocker = { from: open.distance - 7, to: open.distance + 7, left: 20, right: -20, safeSpeed: 0, facing: 0 };
  const walked = standing(choosePatrolPosts(w.plan, w.spine, [wall], w.ground, 1, null).posts[0], 'past the wall');
  assert.ok(walked.distance < open.distance - 7 - 2 || walked.distance > open.distance + 7 + 2,
    'he parked inside a band');
});

test('no ring: the same fractions on the canonical spine; nowhere to stand: echelon, and F3 is told', () => {
  const w = world('sweep-39');
  const noRing: LevelPlan = { ...w.plan, streetLoops: (w.plan.streetLoops ?? []).filter((loop) => loop.alternate.length > 0) };
  const onSpine = choosePatrolPosts(noRing, w.spine, w.blockers, w.ground, 2, w.judge);
  assert.equal(onSpine.source, 'spine');
  for (const maybe of onSpine.posts) {
    const post = standing(maybe, 'a spine post');
    assert.ok(Math.hypot(post.x - noRing.spawn.position.x, post.z - noRing.spawn.position.z) > CHASE.trackerGapMetres);
    const located = w.spine.locate(post.x, post.z, -1, createSpineLocation());
    assert.ok(Math.abs(located.distance - post.distance) < 5, 'a spine post’s distance is not where it stands');
  }

  // A plan with no loops at all (the folded fixture), on an open, clamped spine.
  const folded = foldedRouteFixture();
  const foldedSpine = RouteSpine.fromPlan(folded);
  assert.ok(foldedSpine !== null && !foldedSpine.closed);
  const foldedGround = new PlanTerrainSampler(folded);
  const onFold = choosePatrolPosts(folded, foldedSpine, [], foldedGround, 2, null);
  assert.equal(onFold.source, 'spine');
  assert.ok(onFold.posts.some((post) => post !== null), 'no post stood anywhere on a 700 m fold');
  for (const post of onFold.posts) {
    if (post === null) continue;
    assert.ok(post.ringDistance >= 0 && post.ringDistance <= foldedSpine.length, 'a clamped spine wrapped');
    assert.ok(Math.hypot(post.x - folded.spawn.position.x, post.z - folded.spawn.position.z) > CHASE.trackerGapMetres);
  }

  const nowhere = choosePatrolPosts(w.plan, w.spine, w.blockers, w.ground, 2, () => null);
  assert.deepEqual(nowhere, { posts: [null, null], source: 'echelon' });
  // A ring too short to reach past the tracker line refuses every spot too.
  const tight = choosePatrolPosts(w.plan, w.spine, w.blockers, w.ground, 2, w.judge,
    { postStandoffMetres: 3.5, trackerGapMetres: 5000, riderHitRadius: CHASE.riderHitRadius, streetMargin: CHASE.streetMargin });
  assert.equal(tight.source, 'echelon');
});

// -- A post he stands still on (QA r2) ----------------------------------------

/**
 * How far a parked patrol moves in `seconds` of neutral input at a post —
 * `Game.stepPursuers`' parked step exactly: his own wheel (`COP_WHEEL_TUNING`)
 * reset onto the post at rest and stepped with `NEUTRAL_ACTIONS`.
 */
function parkedDrift(plan: LevelPlan, ground: TerrainSampler, post: PatrolPost, seconds: number): number {
  const controller = new EucController(ground, {
    spawn: { position: { x: post.x, y: post.y, z: post.z }, headingY: post.headingY },
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
    tuning: { ...COP_WHEEL_TUNING },
  });
  const pose = createPose();
  const step = 1 / SIMULATION.hz;
  for (let index = 0; index < seconds * SIMULATION.hz; index += 1) {
    controller.step(step, NEUTRAL_ACTIONS);
  }
  controller.writePose(pose);
  return Math.hypot(pose.x - post.x, pose.z - post.z);
}

/** The gradient along a post's own heading, rise over run, the walk's ±1 m reading. */
function slopeAlong(ground: TerrainSampler, post: PatrolPost): number {
  const sample = createGroundSample();
  const ahead = ground.sampleGround(post.x + Math.sin(post.headingY), post.z + Math.cos(post.headingY), sample).height;
  const behind = ground.sampleGround(post.x - Math.sin(post.headingY), post.z - Math.cos(post.headingY), sample).height;
  return (ahead - behind) / 2;
}

test('the gradient a parked cop holds is rolling resistance over gravity — derived, and it follows the live scale', () => {
  assert.ok(Math.abs(postHoldSlope() - 0.35 / 9.81) < 1e-12, `the shipped hold slope is ${postHoldSlope()}`);
  assert.ok(Math.abs(postHoldSlope(2) - 2 * postHoldSlope()) < 1e-12, 'the hold slope ignores the rolling-resistance scale');
});

test('QA r2: every parked patrol on the corpus and 48 sweep towns stands still on his post for 30 s', () => {
  // A parked patrol's wheel is stepped on neutral input, and nothing holds a
  // stopped wheel against rolling *forward* but rolling resistance: before
  // the gradient refusal three sweep posts (sweep-5, sweep-29, sweep-38) rolled
  // 2–29 m off the spot they were judged for, at up to 3.5 m/s. Built exactly
  // as `installChaseWorld` builds the walk: the world's one route field, the
  // tail brain's landing judge, the solo face's two patrols.
  const seeds = [...CORPUS, ...Array.from({ length: 48 }, (_unused, index) => `sweep-${index}`)];
  const rolled: string[] = [];
  let stood = 0;
  for (const seed of seeds) {
    const { plan } = generateLevel(seed);
    const spine = RouteSpine.fromPlan(plan);
    assert.ok(spine !== null, `${seed} has no spine`);
    const ground = new PlanTerrainSampler(plan);
    const field = buildRouteField(spine, plan, ground);
    const judge = new CpuRider(spine, plan, ground, field);
    const chosen = choosePatrolPosts(plan, spine, field.blockers, ground, 2,
      (distance, direction) => judge.landingAllowance(distance, direction));
    assert.notEqual(chosen.source, 'echelon', `${seed}: the gradient rule left nowhere to stand`);
    for (const post of chosen.posts) {
      if (post === null) continue;
      stood += 1;
      assert.ok(slopeAlong(ground, post) >= -postHoldSlope(), `${seed} post ${post.index} stands on a gradient he rolls off`);
      const drift = parkedDrift(plan, ground, post, 30);
      if (drift >= 0.1) rolled.push(`${seed} post ${post.index}: ${drift.toFixed(2)} m`);
    }
  }
  assert.equal(stood, seeds.length * 2, 'a post fell to echelon');
  assert.deepEqual(rolled, [], 'a parked patrol rolled off his post');
});

test('QA r2: a post on a 0.06 downhill is refused and the walk moves on to ground he holds still on', () => {
  const w = world('sweep-15');
  const free = standing(posts('sweep-15').posts[0], 'the unhindered post');
  // A 0.06 fall along his heading through the free post, flattening 6 m
  // either way (at most 0.36 m off the road, inside the height tolerance, so
  // only the gradient can refuse it) and gone 30 m out. The normal follows
  // the fall, so his wheel feels it as well as the walk reads it.
  const fall = 0.06;
  const forwardX = Math.sin(free.headingY);
  const forwardZ = Math.cos(free.headingY);
  const tilted: TerrainSampler = {
    sampleGround(x, z, out) {
      w.ground.sampleGround(x, z, out);
      if (Math.hypot(x - free.x, z - free.z) >= 30) return out;
      const along = (x - free.x) * forwardX + (z - free.z) * forwardZ;
      if (Math.abs(along) >= 6) {
        out.height -= fall * Math.sign(along) * 6;
        return out;
      }
      out.height -= fall * along;
      const nx = out.normal.x / out.normal.y + fall * forwardX;
      const nz = out.normal.z / out.normal.y + fall * forwardZ;
      const length = Math.hypot(nx, 1, nz);
      out.normal = { x: nx / length, y: 1 / length, z: nz / length };
      return out;
    },
    raycast: (origin, direction, max) => w.ground.raycast(origin, direction, max),
  };
  // The premise: stood on the free post of the tilted world, his wheel rolls.
  assert.ok(parkedDrift(w.plan, tilted, free, 10) > 1, 'a 0.06 fall did not roll a parked wheel');
  // With the rule switched off the tilt alone refuses nothing there…
  const unruled = standing(choosePatrolPosts(w.plan, w.spine, w.blockers, tilted, 2, w.judge, {
    postStandoffMetres: CHASE.postStandoffMetres,
    trackerGapMetres: CHASE.trackerGapMetres,
    riderHitRadius: CHASE.riderHitRadius,
    streetMargin: CHASE.streetMargin,
    holdSlope: Number.POSITIVE_INFINITY,
  }).posts[0], 'the unruled post');
  assert.equal(unruled.ringDistance, free.ringDistance, 'the tilt refused the post by something other than its gradient');
  // …and with it on, the walk leaves the fall for ground he stands still on.
  const walked = standing(choosePatrolPosts(w.plan, w.spine, w.blockers, tilted, 2, w.judge).posts[0], 'off the fall');
  const along = (walked.x - free.x) * forwardX + (walked.z - free.z) * forwardZ;
  assert.ok(Math.abs(along) >= 5, `the post stayed on the fall (${along.toFixed(1)} m along it)`);
  assert.ok(slopeAlong(tilted, walked) >= -postHoldSlope(), 'the walk stood him on a gradient he rolls off');
  assert.ok(parkedDrift(w.plan, tilted, walked, 10) < 0.1, 'the walked post does not hold him');
});

// -- Not stacking ------------------------------------------------------------

function body(distance: number, lateral = 0, speed = 10, up = true): PackBody {
  return { distance, lateral, speed, standing: up };
}

test('packmates file as moving blockers at their own speed, and wrap the seam of a closed spine', () => {
  const out: RouteBlocker[] = [];
  const closed = { length: 1000, closed: true };
  const pack = [body(995), body(3, -1.5, 12), body(500, 2, 8)];
  const bands = packmateBands(0, pack, closed, out, 0.35);
  assert.equal(bands, out);
  assert.equal(bands.length, 2);
  const [seam, far] = bands;
  // 3 m past the seam is 8 m ahead of 995 m on a closed ring: filed at 1003.
  assert.ok(Math.abs((seam.from + seam.to) / 2 - 1003) < 1e-9, `the seam band sits at ${(seam.from + seam.to) / 2}`);
  assert.ok(Math.abs(seam.to - seam.from - 1.6) < 1e-9);
  assert.ok(Math.abs(seam.left - -1.15) < 1e-9 && Math.abs(seam.right - -1.85) < 1e-9);
  assert.equal(seam.safeSpeed, 12);
  assert.equal(seam.facing, 0);
  assert.ok(Math.abs((far.from + far.to) / 2 - 500) < 1e-9);

  // An open spine does not wrap.
  const open = packmateBands(0, pack, { length: 1000, closed: false }, [], 0.35);
  assert.ok(Math.abs((open[0].from + open[0].to) / 2 - 3) < 1e-9);

  // A crashed packmate files nothing, and self is never filed.
  const down = packmateBands(1, [body(10), body(12), body(14, 0, 5, false)], closed, out);
  assert.equal(down.length, 1);
  assert.ok(Math.abs((down[0].from + down[0].to) / 2 - 10) < 1e-9);
  assert.ok(Math.abs(down[0].left - (0 + CHASE.riderHitRadius)) < 1e-9, 'the default radius is not CHASE.riderHitRadius');
});

test('packmate bands reuse their objects: a dip in the pack and its recovery allocate nothing', () => {
  const out: RouteBlocker[] = [];
  const closed = { length: 1000, closed: true };
  packmateBands(0, [body(0), body(10), body(20)], closed, out);
  const [a, b] = out;
  packmateBands(0, [body(0), body(10), body(20, 0, 0, false)], closed, out);
  assert.equal(out.length, 1);
  assert.equal(out[0], a);
  packmateBands(0, [body(0), body(11), body(21)], closed, out);
  assert.equal(out[0], a);
  assert.equal(out[1], b, 'a recovered band was allocated afresh');
});

test('followLine: the tail copies the rider; a patrol beside a packmate takes the roomier side, deterministically', () => {
  const spine = { length: 1000, closed: true };
  assert.equal(followLine(0, 'tail', [body(100), body(101)], 3, 5, spine), null, 'the tail stopped copying the rider');
  assert.equal(followLine(1, 'patrol', [body(100), body(200)], 3, 5, spine), null, 'nobody near, yet he left the rider’s line');
  // A mate on the right: take the left by the spacing, clamped to the corridor.
  assert.equal(followLine(1, 'patrol', [body(100, -1), body(102)], 3, 2, spine), 1);
  assert.equal(followLine(1, 'patrol', [body(100, -1), body(102)], 3, 5, spine), 3);
  // A mate on the left: take the right.
  assert.equal(followLine(1, 'patrol', [body(100, 1.5), body(102)], 3, 2, spine), -0.5);
  // Dead centre goes left, every time.
  assert.equal(followLine(1, 'patrol', [body(100, 0), body(102)], 3, 2, spine), 2);
  assert.equal(followLine(1, 'patrol', [body(100, 0), body(102)], 3, 2, spine), 2);
  // Across the seam: a mate 4 m on, past the start line, is a mate.
  assert.equal(followLine(0, 'patrol', [body(998), body(2, -2)], 3, 5, spine), 3);
  // And the nearest mate is the one that counts.
  assert.equal(followLine(0, 'patrol', [body(998), body(2, -2), body(996, 1)], 3, 5, spine), -3);
  // A crashed mate is not a mate.
  assert.equal(followLine(1, 'patrol', [body(100, -1, 10, false), body(102)], 3, 5, spine), null);
  // An open spine does not wrap.
  assert.equal(followLine(0, 'patrol', [body(998), body(2, 1)], 3, 5, { length: 1000, closed: false }), null);
});

// -- Waking --------------------------------------------------------------------

test('wakeTarget: the nearest standing outlaw inside the wake range, or −1', () => {
  assert.equal(CHASE.patrolWakeMetres, 60);
  assert.equal(wakeTarget([80, 45, 30], [true, true, true]), 2);
  assert.equal(wakeTarget([80, 45, 30], [true, true, false]), 1, 'a busted outlaw woke a patrol');
  assert.equal(wakeTarget([80, 61, 90], [true, true, true]), -1);
  assert.equal(wakeTarget([60, 70], [true, true]), 0, 'the wake range’s own edge did not wake him');
  assert.equal(wakeTarget([60, 70], [true, true], 59.9), -1);
  assert.equal(wakeTarget([40, 40], [true, true]), 0, 'a tie did not go to the lower index');
  assert.equal(wakeTarget([], []), -1);
});

// -- Panes ----------------------------------------------------------------------

test('framedByAnyPane: the cone, far and near edges of one pane', () => {
  const pane: PaneView = { x: 0, z: 0, headingY: 0 };
  const cone = 1.2;
  const at = (angle: number, range: number) => [Math.sin(angle) * range, Math.cos(angle) * range] as const;
  const framed = (angle: number, range: number) => framedByAnyPane(...at(angle, range), [pane], cone, 200, 13);
  assert.ok(framed(0, 100), 'dead ahead is not framed');
  assert.ok(framed(cone - 1e-6, 100) && framed(-(cone - 1e-6), 100), 'inside the cone’s edge is not framed');
  assert.ok(!framed(cone + 1e-6, 100) && !framed(-(cone + 1e-6), 100), 'outside the cone is framed');
  assert.ok(!framed(Math.PI, 100), 'behind him is framed');
  assert.ok(framed(0, 200 - 1e-6) && !framed(0, 200 + 1e-6), 'the far edge is not at farMetres');
  assert.ok(framed(Math.PI, 12.9), 'a body beside the camera, behind it, was not seen');
  assert.ok(!framed(Math.PI, 13.1));
  // The default near edge is the bust radius plus one.
  assert.ok(framedByAnyPane(0, -(CHASE.bustRadiusMetres + 0.5), [pane], cone, 200));
  assert.ok(!framedByAnyPane(0, -(CHASE.bustRadiusMetres + 1.5), [pane], cone, 200));
  // A turned camera: heading π/2 looks along +X.
  assert.ok(framedByAnyPane(100, 0, [{ x: 0, z: 0, headingY: Math.PI / 2 }], cone, 200, 13));
  assert.ok(!framedByAnyPane(0, 100, [{ x: 0, z: 0, headingY: Math.PI / 2 }], 0.9, 200, 13));
  // No pane frames nothing.
  assert.ok(!framedByAnyPane(0, 0, [], cone, 200, 13));
});

test('framedByAnyPane with two and with four cameras: any one pane framing it is enough', () => {
  const cone = CHASE.returnConeRadians;
  const far = CHASE.patrolReturnMetres;
  // Two outlaws riding opposite ways down one street, a little more than one
  // far edge apart (written against the live far edge, so the fixture follows
  // `patrolReturnMetres` wherever it is tuned).
  const apart = far * 1.3;
  const two: PaneView[] = [{ x: 0, z: 0, headingY: 0 }, { x: 0, z: apart, headingY: Math.PI }];
  assert.ok(framedByAnyPane(0, apart / 2, two, cone, far, 13), 'between two cameras facing each other is unframed');
  assert.ok(framedByAnyPane(0, -100, two, cone, far, 13) === false, 'behind the first, far past the second, was framed');
  assert.ok(framedByAnyPane(0, apart + 100, two, cone, far, 13) === false);
  assert.ok(framedByAnyPane(0, far + 20, [two[0]], cone, far, 13) === false, 'beyond the first camera’s far edge');
  assert.ok(framedByAnyPane(0, far + 20, two, cone, far, 13), 'the second camera’s view did not count');

  // Four panes (three outlaws and a spectator), each looking a different way.
  const four: PaneView[] = [
    { x: 0, z: 0, headingY: 0 },
    { x: 500, z: 0, headingY: Math.PI / 2 },
    { x: 0, z: 500, headingY: Math.PI },
    { x: -500, z: -500, headingY: -Math.PI / 2 },
  ];
  // Only the fourth frames a spot 100 m along its own view.
  const spot = { x: -600, z: -500 };
  for (let skip = 0; skip < 3; skip += 1) {
    assert.ok(!framedByAnyPane(spot.x, spot.z, [four[skip]], cone, far, 13));
  }
  assert.ok(framedByAnyPane(spot.x, spot.z, four, cone, far, 13), 'the fourth pane’s view did not count');
  assert.ok(!framedByAnyPane(spot.x, spot.z, four.slice(0, 3), cone, far, 13));
  // A spot no pane looks at: behind or beyond all four.
  assert.ok(!framedByAnyPane(250, -250, four, cone, far, 13));
});

// -- Post returns -----------------------------------------------------------------

function post(index: number, x: number, z: number): PatrolPost {
  return { index, x, y: 0, z, headingY: 0, distance: 0, ringDistance: 0, side: -1 };
}

const RETURN_TUNING = {
  trackerGapMetres: CHASE.trackerGapMetres,
  patrolReturnMetres: CHASE.patrolReturnMetres,
  returnConeRadians: CHASE.returnConeRadians,
  packSpacingMetres: CHASE.packSpacingMetres,
  nearMetres: CHASE.bustRadiusMetres + 1,
};

test('a post return: behind his travel or far ahead, beyond the tracker line, unoccupied, unframed — nearest wins', () => {
  // He rides +Z from the origin; his camera sits behind him looking his way.
  const quarry = { x: 0, z: 0, headingY: 0 };
  const panes: PaneView[] = [{ x: 0, z: -6, headingY: 0 }];
  const behindNear = post(0, 0, -150);
  const behindFar = post(1, 0, -400);
  assert.equal(choosePostReturn([behindFar, behindNear], quarry, [], panes, RETURN_TUNING), behindNear,
    'the nearest qualifying post did not win');

  // Refusal 1: inside the tracker line (just inside it, whatever the table says).
  assert.equal(choosePostReturn([post(0, 0, -(RETURN_TUNING.trackerGapMetres - 10))], quarry, [], panes, RETURN_TUNING), null,
    'a post inside the tracker line qualified');
  // Refusal 2: ahead of his travel and not beyond the return range (and out of the cone, so only this refuses it).
  const aheadNear = post(0, 160, 20);
  assert.ok(!framedByAnyPane(aheadNear.x, aheadNear.z, panes, RETURN_TUNING.returnConeRadians, RETURN_TUNING.patrolReturnMetres, 13));
  assert.equal(choosePostReturn([aheadNear], quarry, [], panes, RETURN_TUNING), null,
    'a post just ahead of him qualified');
  // ...but far ahead and out of view is fair: he rides toward a parked cop.
  const aheadFarSide = post(0, RETURN_TUNING.patrolReturnMetres + 30, 20);
  assert.equal(choosePostReturn([aheadFarSide], quarry, [], panes, RETURN_TUNING), aheadFarSide);
  // Refusal 3: occupied by another cop.
  assert.equal(choosePostReturn([behindNear], quarry, [{ x: 3, z: -151 }], panes, RETURN_TUNING), null,
    'an occupied post qualified');
  assert.equal(choosePostReturn([behindNear], quarry, [{ x: 7, z: -150 }], panes, RETURN_TUNING), behindNear);
  // Refusal 4: framed by a pane — here a second rider looking back down the street.
  const lookingBack: PaneView[] = [...panes, { x: 0, z: 10, headingY: Math.PI }];
  assert.equal(choosePostReturn([behindNear], quarry, [], lookingBack, RETURN_TUNING), null,
    'a post in another rider’s view qualified');
  // Far ahead of him but inside a rider's view further up the street: refused.
  const upStreet: PaneView[] = [...panes, { x: 0, z: 100, headingY: 0 }];
  const farUpStreet = post(0, 0, RETURN_TUNING.patrolReturnMetres + 10);
  assert.equal(choosePostReturn([farUpStreet], quarry, [], panes, RETURN_TUNING)?.index, 0);
  assert.equal(choosePostReturn([farUpStreet], quarry, [], upStreet, RETURN_TUNING), null);
  // Null posts are skipped, and nothing qualifying keeps him riding.
  assert.equal(choosePostReturn([null, null], quarry, [], panes, RETURN_TUNING), null);
  assert.equal(choosePostReturn([null, behindFar], quarry, [], panes, RETURN_TUNING), behindFar);
});

test('a post return dead ahead: refused inside the return line, fair beyond it (QA r1)', () => {
  // §39.6b.3 "Returning", written against the live line so the pin follows
  // the owner's F4: a post straight down his road inside the return line is
  // both "ahead and not far enough" and framed by his pane; one past it is
  // neither, and he rides toward a parked cop.
  const quarry = { x: 0, z: 0, headingY: 0 };
  const panes: PaneView[] = [{ x: 0, z: -6, headingY: 0 }];
  const far = RETURN_TUNING.patrolReturnMetres;
  assert.equal(choosePostReturn([post(0, 0, far - 10)], quarry, [], panes, RETURN_TUNING), null,
    'a post dead ahead inside the return line qualified');
  assert.ok(framedByAnyPane(0, far - 10, panes, RETURN_TUNING.returnConeRadians, far, 13));
  const beyond = post(1, 0, far + 10);
  assert.equal(choosePostReturn([beyond], quarry, [], panes, RETURN_TUNING), beyond,
    'a post dead ahead past the return line was refused');
  assert.ok(!framedByAnyPane(0, far + 10, panes, RETURN_TUNING.returnConeRadians, far, 13));
});

// -- Bearing ---------------------------------------------------------------------

test('bearingTo: 0 dead ahead, + to the left, ±π behind, and the straight-line range', () => {
  const out = { bearing: 0, range: 0 };
  const from = { x: 10, z: 10, headingY: 0 };
  assert.equal(bearingTo(from, { x: 10, z: 40 }, out), out);
  assert.ok(Math.abs(out.bearing) < 1e-12 && Math.abs(out.range - 30) < 1e-12);
  bearingTo(from, { x: 20, z: 10 }, out);
  assert.ok(Math.abs(out.bearing - Math.PI / 2) < 1e-12, 'a point on his left (+X) did not read positive');
  bearingTo(from, { x: 0, z: 10 }, out);
  assert.ok(Math.abs(out.bearing + Math.PI / 2) < 1e-12);
  bearingTo(from, { x: 10, z: 0 }, out);
  assert.ok(Math.abs(Math.abs(out.bearing) - Math.PI) < 1e-12);
  // Facing +X, his left is −Z.
  bearingTo({ x: 0, z: 0, headingY: Math.PI / 2 }, { x: 0, z: -5 }, out);
  assert.ok(Math.abs(out.bearing - Math.PI / 2) < 1e-12, 'a turned pose read the wrong side');
  bearingTo(from, from, out);
  assert.equal(out.bearing, 0);
  assert.equal(out.range, 0);
});

// -- Roadblocks: a patrol sent ahead (the brutal pass, 2026-09-25) -----------

/** The roadblock walk's tuning at the table's values. */
const INTERCEPT_TUNING = {
  minAheadMetres: CHASE.interceptMinAheadMetres,
  maxAheadMetres: CHASE.interceptMaxAheadMetres,
  minStraightMetres: CHASE.patrolWakeMetres + INTERCEPT_WAKE_MARGIN_METRES,
  postStandoffMetres: CHASE.postStandoffMetres,
  packSpacingMetres: CHASE.packSpacingMetres,
  riderHitRadius: CHASE.riderHitRadius,
  streetMargin: CHASE.streetMargin,
};

/** A rider on the canonical spine at `distance`, travelling `direction`, and his chase camera's pane. */
function riderOn(spine: RouteSpine, distance: number, direction: 1 | -1): { rider: { x: number; z: number; headingY: number }; pane: PaneView } {
  const at = spine.sample(distance, createSpineSample());
  const headingY = at.headingY + (direction > 0 ? 0 : Math.PI);
  return {
    rider: { x: at.x, z: at.z, headingY },
    pane: { x: at.x - Math.sin(headingY) * 6, z: at.z - Math.cos(headingY) * 6, headingY },
  };
}

test('brutal pass: a roadblock stands ahead of the rider on his road, asleep, off the racing line, facing him, out of frame', () => {
  // Every 150 m round each corpus ring, both ways. Where the road winds in
  // front of him for the whole walk (a block's worth of road inside his
  // camera's cone), there is no spot and Game falls back to a post — fair,
  // and rare: most of the ring has one.
  let asked = 0;
  let found = 0;
  for (const seed of CORPUS) {
    const { spine, ground, blockers, judge } = world(seed);
    for (let start = 150; start < spine.length; start += 150) for (const direction of [1, -1] as const) {
      asked += 1;
      const { rider, pane } = riderOn(spine, start, direction);
      const framed = (x: number, z: number): boolean => framedByAnyPane(
        x, z, [pane], CHASE.returnConeRadians, CHASE.patrolReturnMetres, CHASE.bustRadiusMetres + 1,
      );
      const spot = chooseIntercept(spine, blockers, ground, rider, start, [], framed, judge, INTERCEPT_TUNING);
      if (spot === null) continue;
      found += 1;
      // Ahead of him along his own direction of travel, inside the walk.
      let ahead = (spot.distance - start) * direction;
      if (spine.closed) ahead = ((ahead % spine.length) + spine.length) % spine.length;
      assert.ok(ahead >= CHASE.interceptMinAheadMetres - 1 && ahead <= CHASE.interceptMaxAheadMetres + 1,
        `${seed} @${start}: the roadblock stands ${ahead.toFixed(0)} m along, outside the walk`);
      // Asleep: past the wake line, so his placing makes no sound.
      assert.ok(Math.hypot(spot.x - rider.x, spot.z - rider.z) >= CHASE.patrolWakeMetres + INTERCEPT_WAKE_MARGIN_METRES - 1e-6,
        `${seed} @${start}: placed inside the wake line`);
      // Out of every pane's frame: no body appears where anyone is looking.
      assert.equal(framed(spot.x, spot.z), false, `${seed} @${start}: placed in view`);
      // Facing back down the road at the rider, off the line on one side.
      const line = spine.sample(spot.distance, createSpineSample());
      assert.ok(Math.cos(spot.headingY - line.headingY) * direction < 0, `${seed} @${start}: faces away from the rider`);
      const lateral = (spot.x - line.x) * Math.cos(line.headingY) - (spot.z - line.z) * Math.sin(line.headingY);
      assert.ok(Math.abs(lateral) > 1, `${seed} @${start}: stands on the racing line (${lateral.toFixed(2)} m)`);
    }
  }
  assert.ok(found / asked >= 0.75, `a roadblock stood for only ${found} of ${asked} riders`);
});

test('brutal pass: a roadblock refuses what every return refuses — framed, occupied, or nowhere to stand', () => {
  const { spine, ground, blockers, judge } = world('euc');
  const { rider } = riderOn(spine, 300, 1);
  // A pane that frames everything within ten kilometres: nowhere is out of view.
  const everywhere = (): boolean => true;
  assert.equal(chooseIntercept(spine, blockers, ground, rider, 300, [], everywhere, judge, INTERCEPT_TUNING), null,
    'a roadblock stood where a pane framed it');
  // The nearest spot taken by another cop: the walk moves on past it.
  const free = chooseIntercept(spine, blockers, ground, rider, 300, [], null, judge, INTERCEPT_TUNING);
  assert.ok(free !== null);
  const moved = chooseIntercept(spine, blockers, ground, rider, 300, [{ x: free.x, z: free.z }], null, judge, INTERCEPT_TUNING);
  assert.ok(moved !== null && Math.hypot(moved.x - free.x, moved.z - free.z) > CHASE.packSpacingMetres,
    'a roadblock was stood on top of another cop');
  // A judge that refuses every spot: none.
  assert.equal(chooseIntercept(spine, blockers, ground, rider, 300, [], null, () => null, INTERCEPT_TUNING), null);
});

test('brutal pass: packmate positions are the other standing cops, and reuse their objects', () => {
  const bodies: PackBody[] = [
    { distance: 0, lateral: 0, speed: 0, standing: true, x: 1, z: 2 },
    { distance: 0, lateral: 0, speed: 0, standing: false, x: 3, z: 4 },
    { distance: 0, lateral: 0, speed: 0, standing: true, x: 5, z: 6 },
  ];
  const out: { x: number; z: number }[] = [];
  assert.deepEqual(packmatePositions(0, bodies, out), [{ x: 5, z: 6 }]);
  const first = out[0];
  assert.deepEqual(packmatePositions(1, bodies, out), [{ x: 1, z: 2 }, { x: 5, z: 6 }]);
  assert.equal(out[0], first, 'a packmate slot was reallocated');
});
