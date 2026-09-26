/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHASE, LIGHTING, SIMULATION } from '../data/tuning.ts';
import { choosePatrolPosts } from '../simulation/copPack.ts';
import { CpuRider } from '../simulation/cpuRider.ts';
import { createSpineSample } from '../simulation/routeSpine.ts';
import { createGroundSample } from '../simulation/world.ts';
import {
  BENCH_ROOMS,
  CHASE_CORPUS,
  buildChaseWorld,
  chaseTables,
  runJob,
  runRoom,
  type RunResult,
} from './chaseBench.ts';
import { ScriptedOutlaw, writeView } from './chaseScripts.ts';

/**
 * The chase bench's smoke — M39 Part P, `docs/M39_CHASE.md` §2g.
 *
 * Nothing else: the bench's numbers are evidence, not assertions. What is
 * pinned is that a run reproduces (the report may be regenerated and diffed),
 * that every row it prints is a number, and R-3's wiring fact — the evader
 * laps rather than parking on an unclosed line's `routeEnd` cap.
 */

const SEED = 'euc';
const world = buildChaseWorld(SEED);

/** Everything a run reports except the two wall-clock arrays. */
function simulated(run: RunResult): Omit<RunResult, 'copMs' | 'seatMs'> {
  const { copMs: _cop, seatMs: _seat, ...rest } = run;
  return rest;
}

test('a short three-cop run reproduces exactly and every row is finite', () => {
  const first = runRoom(world, 'solo3', 'follower', { seconds: 10 });
  const second = runRoom(buildChaseWorld(SEED), 'solo3', 'follower', { seconds: 10 });
  assert.deepEqual(simulated(second), simulated(first));

  assert.equal(first.pursuers, 3);
  assert.ok(first.roomSteps >= 10 * SIMULATION.hz, `ran ${first.roomSteps} steps`);
  for (const [key, value] of Object.entries(simulated(first))) {
    if (typeof value !== 'number') continue;
    assert.ok(Number.isFinite(value), `${key} = ${value}`);
  }
  assert.ok(first.firstBustSeconds === null || Number.isFinite(first.firstBustSeconds));
  // The pack's posts stood on the ring (the corpus's answer, copPack.test.ts).
  assert.equal(first.postSource, 'ring');
});

test('every room runs, and every table cell the report prints is a real value', () => {
  const job = runJob({ seed: SEED, rooms: Object.keys(BENCH_ROOMS) as never, scripts: ['follower'], seconds: 5, timing: true, fieldCost: false });
  assert.equal(job.runs.length, Object.keys(BENCH_ROOMS).length);
  for (const run of job.runs) {
    assert.equal(run.outlaws, BENCH_ROOMS[run.room].outlaws);
    assert.ok(run.copMs !== null && run.copMs.length === run.roomSteps, `${run.room} sampled every running step`);
  }
  const tables = chaseTables([job], { seconds: 5, seeds: [SEED], timing: true, jobs: 1 });
  assert.ok(tables.length >= 5);
  for (const table of tables) {
    for (const row of table.rows) {
      assert.equal(row.length, table.columns.length, `${table.id}: a row's width`);
      for (const cell of row) assert.ok(!/NaN|undefined|Infinity/.test(cell), `${table.id}: "${cell}"`);
    }
  }
});

test('R-3: the evader laps his course and never brakes for a routeEnd cap', () => {
  const course = world.evader;
  assert.ok(course !== null, 'the corpus town has a ring to evade round');
  // Either the course is closed (R-3's closeWhenJoined landed), or the unclosed
  // fallback re-seats him one lap back at the join. Start him 150 m short of
  // it at a riding pace and ride through it.
  const at = course.spine.sample(course.lapLength - 150, createSpineSample());
  const ground = createGroundSample();
  world.sampler.sampleGround(at.x, at.z, ground);
  const outlaw = new ScriptedOutlaw(
    'evader', world.plan, world.sampler, world.spine, world.field, course, world.hazards,
    { position: { x: at.x, y: ground.height, z: at.z }, headingY: at.headingY },
  );
  outlaw.body.controller.reset(undefined, 15);
  outlaw.body.controller.writePose(outlaw.body.pose);
  writeView(outlaw.body);
  outlaw.brain.place(outlaw.body.view, course.lapLength - 150);
  const step = 1 / SIMULATION.hz;
  let slowest = Infinity;
  for (let index = 0; index < 20 * SIMULATION.hz; index += 1) {
    outlaw.ride(step, outlaw.think(step));
    // `capReason` names the lowest cap bound even when the cutout ceiling sits
    // under it, so the end cap is a fault only when it is actually braking him.
    if (outlaw.brain.capReason === 'routeEnd') {
      assert.ok(outlaw.brain.capSpeed > 25, `braked for the course's end at ${outlaw.brain.routeDistance.toFixed(1)} m (${outlaw.brain.capSpeed.toFixed(1)} m/s)`);
    }
    if (index > SIMULATION.hz) slowest = Math.min(slowest, Math.abs(outlaw.body.pose.speed));
  }
  if (!course.closed) assert.ok(outlaw.laps >= 1, 'the unclosed course re-seated him at the join');
  assert.ok(outlaw.brain.routeDistance < course.lapLength, 'he is on his next lap');
  assert.ok(slowest > 3, `he slowed to ${slowest.toFixed(2)} m/s through the join`);
});

test('QA r1: no corpus post can be seen down a straight past the patrol return line', () => {
  // `CHASE.patrolReturnMetres`' measured half (tuning.ts): 200 m is not the
  // camera's reach (it draws to the fog's far edge), but on the town corpus no
  // post is approached down a straight longer than the line — the road within
  // 6 m of the sight line and the post within 0.35 rad of the rider's nose, at
  // any range from the line out to the drawn range. So a return "further ahead
  // than the line" is never a cop appearing down the rider's own street. A
  // replaced seed that grows such a straight fails here, and the line (or the
  // seed) has to be looked at again.
  const straightMetres = 6;
  const noseRadians = 0.35;
  const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
  const found: string[] = [];
  for (const seed of CHASE_CORPUS) {
    const town = seed === SEED ? world : buildChaseWorld(seed);
    const judge = new CpuRider(town.spine, town.plan, town.sampler, town.field);
    const posts = choosePatrolPosts(
      town.plan, town.spine, town.field.blockers, town.sampler, 2,
      (distance, direction) => judge.landingAllowance(distance, direction),
    );
    const length = town.spine.length;
    const along = (distance: number): number => (town.spine.closed
      ? ((distance % length) + length) % length
      : Math.min(length, Math.max(0, distance)));
    const at = createSpineSample();
    const between = createSpineSample();
    for (const post of posts.posts) {
      if (post === null) continue;
      for (const direction of [1, -1] as const) {
        for (let back = CHASE.patrolReturnMetres + 1; back <= LIGHTING.fogFar; back += 5) {
          town.spine.sample(along(post.distance - direction * back), at);
          const heading = direction > 0 ? at.headingY : at.headingY + Math.PI;
          const dx = post.x - at.x;
          const dz = post.z - at.z;
          if (Math.hypot(dx, dz) <= CHASE.patrolReturnMetres) continue;
          const chord = Math.atan2(dx, dz);
          if (Math.abs(wrap(chord - heading)) > noseRadians) continue;
          let straight = true;
          for (let step = 0; step <= back && straight; step += 5) {
            town.spine.sample(along(post.distance - direction * back + direction * step), between);
            const px = between.x - at.x;
            const pz = between.z - at.z;
            straight = Math.abs(px * Math.cos(chord) - pz * Math.sin(chord)) <= straightMetres;
          }
          if (straight) found.push(`${seed} post ${post.index} ${direction > 0 ? 'forward' : 'reverse'}: ${back} m back`);
        }
      }
    }
  }
  assert.deepEqual(found, [], 'a post stands in view down a straight past the return line');
});

test('the brutal pass: the owner’s hider is busted within 20 s of a cop arriving, at every spot of the two seeds that stood to the bell', () => {
  // Before the close-quarters search, the plaza-block spot stood to the bell
  // on `euc` and `harbour-spark-42` (the cop ran up and down the plaza's
  // middle, docs/M39_CHASE.md "Brutal pass"). Every hide spot the finder
  // offers on those two seeds, the solo face's pack, the whole bell.
  for (const seed of ['euc', 'harbour-spark-42']) {
    const town = seed === SEED ? world : buildChaseWorld(seed);
    assert.ok(town.hideSpots.length >= 2, `${seed} offers ${town.hideSpots.length} hide spots`);
    town.hideSpots.forEach((spot, index) => {
      const run = runRoom(town, 'solo3', 'hider', { hideSpot: index });
      assert.ok(run.hiddenAt !== null, `${seed} ${spot.label}: the hider never parked`);
      assert.ok(run.hideBustAfterNear !== null, `${seed} ${spot.label}: the hider stood to the bell`);
      assert.ok(run.hideBustAfterNear <= 20,
        `${seed} ${spot.label}: busted ${run.hideBustAfterNear.toFixed(1)} s after a cop arrived`);
      assert.equal(run.returnsInPane, 0);
      assert.equal(run.unseen, 0);
    });
  }
});
