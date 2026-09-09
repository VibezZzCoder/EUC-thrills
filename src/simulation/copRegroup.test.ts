/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AUDIO, CHASE } from '../data/tuning.ts';
import { generateLevel } from '../level/generateRoute.ts';
import {
  planRegroup, regroupFloor, type RegroupCandidate, type RegroupJudge, type RegroupRider,
} from './copRegroup.ts';
import {
  createSpineLocation, createSpineSample, RouteSpine, type SpineLocation, type SpineSample,
} from './routeSpine.ts';

/**
 * Where the super tracker puts the cop back, headless — the chase pass (§31).
 *
 * The M20.2 regroup's *what* used to live in `app/Game.ts`, where the only
 * proof of it was a browser spec that stood a rider on a checkpoint and read
 * the cop's gap back. It is `simulation/copRegroup.ts`'s arithmetic now, a
 * pure function of the spine and the rider's pose, so the headless chase
 * bench and the suite stand him exactly where the game does — and the two
 * refusals M20.2's QA learned the hard way (a route-end clamp answering the
 * rider's own spawn; a folded route putting "50 m back" a few metres away)
 * are asserted on a real generated spine rather than ridden for.
 *
 * `route-41` is the chase pass's measuring route, and it has both things a
 * planner has to be right about: gentle bends nearly everywhere, and one real
 * fold near its end where the line doubles back on itself. Nothing below is
 * stated in world coordinates: a candidate is located back onto the spine and
 * judged in route distance, headings are compared wrapped, and the fold is
 * *searched for* rather than named, so a regenerated route that moves the
 * bends still passes if it keeps the rule.
 */

const { plan } = generateLevel('route-41');
const built = RouteSpine.fromPlan(plan);
assert.ok(built !== null, 'route-41 has no spine');
const spine: RouteSpine = built;

/** A heading difference wrapped into (-π, π], so 2π reads as zero. */
function wrapped(radians: number): number {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

/** The rider standing `distance` along the spine, facing along it — or back down it. */
function riderAt(distance: number, reversed = false): RegroupRider {
  const here = spine.sample(distance, createSpineSample());
  return { x: here.x, z: here.z, headingY: reversed ? here.headingY + Math.PI : here.headingY };
}

/** Where a candidate sits along the route, by a whole-route search. */
function routeDistanceOf(candidate: RegroupCandidate): number {
  return spine.locate(candidate.x, candidate.z, -1, createSpineLocation()).distance;
}

function freshScratch(): { at: SpineLocation; sample: SpineSample } {
  return { at: createSpineLocation(), sample: createSpineSample() };
}

test('a rider mid-route gets the cop 50 m behind them along the route, facing their way', () => {
  const back = 50;
  const rider = riderAt(400);
  const candidate = planRegroup(spine, rider, back, 13, freshScratch());
  assert.ok(candidate !== null, 'a mid-route regroup was refused');

  assert.equal(candidate.direction, 1, 'a rider riding the route forwards read as reversed');
  const where = routeDistanceOf(candidate);
  assert.ok(Math.abs(where - (400 - back)) < 1, `the cop landed at ${where} m along the route, not ${400 - back}`);

  // Facing the way the route runs at *his* spot, not the rider's — a bend
  // between them is the difference, and it is the direction he will ride.
  const there = spine.sample(where, createSpineSample());
  assert.ok(Math.abs(wrapped(candidate.headingY - there.headingY)) < 1e-6,
    'the cop faces across the route rather than along it');
  assert.equal(candidate.y, there.y, 'the cop was placed off the road surface');

  // The gap is the straight line, which is what the bust radius measures; and
  // a straight line is never longer than the road between its ends.
  assert.ok(candidate.gap >= 13, `a ${candidate.gap} m gap cleared a 13 m floor`);
  const dx = candidate.x - rider.x;
  const dz = candidate.z - rider.z;
  assert.ok(Math.abs(candidate.gap - Math.hypot(dx, dz)) < 1e-9, 'gap is not the straight-line separation');
  assert.ok(candidate.gap <= back + 1e-6, `a ${candidate.gap} m chord of a ${back} m arc`);
});

test('a rider riding the route backwards gets the cop 50 m further along it, facing back down it', () => {
  // "Behind" is behind the *rider*, and a rider who has turned round is
  // travelling toward the start. The candidate goes the other way along the
  // line and faces the way the rider rides, which is the spine's heading
  // plus a half turn.
  const back = 50;
  const candidate = planRegroup(spine, riderAt(400, true), back, 13, freshScratch());
  assert.ok(candidate !== null, 'a reversed mid-route regroup was refused');

  assert.equal(candidate.direction, -1, 'a rider riding the route backwards read as forwards');
  const where = routeDistanceOf(candidate);
  assert.ok(Math.abs(where - (400 + back)) < 1, `the cop landed at ${where} m along the route, not ${400 + back}`);
  const there = spine.sample(where, createSpineSample());
  assert.ok(Math.abs(wrapped(candidate.headingY - (there.headingY + Math.PI))) < 1e-6,
    'the cop faces the way the route runs rather than the way the rider rides');
  assert.ok(candidate.gap >= 13);
});

test('a rider still in the route’s first metres is refused, not handed their own spawn', () => {
  // `RouteSpine.sample` clamps at both ends: 50 m behind a rider at 5 m is
  // the start point, 5 m from them. M20.2's first browser proof blessed
  // exactly that as a "large gap reduction" (1.1 m from the rider), which is
  // why the refusal exists. Both ends, because the clamp is at both ends.
  assert.equal(planRegroup(spine, riderAt(5), 50, 13, freshScratch()), null,
    'the start clamp was blessed');
  assert.equal(planRegroup(spine, riderAt(spine.length - 5, true), 50, 13, freshScratch()), null,
    'the end clamp was blessed');
  // And it is the clamp that refuses, not the gap floor: with no floor at
  // all the answer is the same.
  assert.equal(planRegroup(spine, riderAt(5), 50, 0, freshScratch()), null,
    'the start clamp only refused because of the floor');
});

test('a candidate closer than the floor in the world is refused, and the ladder walks on past it', () => {
  // The floor is the caller's (`regroupFloor`, below), and a cop who
  // materialises inside it makes the rider's next crash his doing. Asked for
  // 20 m back under a 30 m floor the spine answers honestly (a fair 20 m
  // along the line) and the planner refuses *that rung* — and then walks
  // further back, never closer, until a rung clears the floor: here 35 m,
  // which on this gentle bend is the first chord over 30. A floor no rung
  // can clear refuses outright, and with the floor at 13 the same request is
  // answered on its first rung, which is the proof that it was the floor
  // that refused.
  const walked = planRegroup(spine, riderAt(400), 20, 30, freshScratch());
  assert.ok(walked !== null, 'a floor one rung could clear refused the regroup');
  assert.ok(walked.back > 20 && walked.gap >= 30,
    `the ladder answered ${walked.back} m back at a ${walked.gap} m gap under a 30 m floor`);
  assert.ok(Math.abs(routeDistanceOf(walked) - (400 - walked.back)) < 1,
    'the rung the ladder took is not where the candidate landed');
  assert.equal(planRegroup(spine, riderAt(400), 20, 60, freshScratch()), null,
    'a floor no rung of the ladder clears placed a cop');
  const allowed = planRegroup(spine, riderAt(400), 20, 13, freshScratch());
  assert.ok(allowed !== null, 'the floor refused a candidate that clears it');
  assert.equal(allowed.back, 20, 'a rung that clears the floor was walked past');
  assert.ok(allowed.gap >= 13 && allowed.gap < 30,
    `a ${allowed.gap} m gap is not the case the 30 m floor refused`);
});

test('the scratch is working memory only: a second plan through a dirty scratch is the same plan', () => {
  // `scratch` exists so the fixed step allocates nothing. Its location and
  // sample are written before they are read on every call, so whatever the
  // previous call — or the brain's own step — left in them never reaches a
  // placement. Field by field rather than by identity: the candidate is a
  // fresh record each time, and it is the numbers that must agree.
  const scratch = freshScratch();
  const first = planRegroup(spine, riderAt(400), 50, 13, scratch);
  const second = planRegroup(spine, riderAt(400), 50, 13, scratch);
  assert.ok(first !== null && second !== null, 'the fixture regroup was refused');
  const fields = ['x', 'y', 'z', 'headingY', 'gap', 'direction', 'distance', 'back', 'entrySpeed'] as const;
  for (const field of fields) {
    assert.equal(second[field], first[field], `${field} differed between two identical plans`);
  }

  // A scratch dirtied by *another* rider's plan, facing the other way, far
  // down the route.
  planRegroup(spine, riderAt(900, true), 50, 13, scratch);
  const third = planRegroup(spine, riderAt(400), 50, 13, scratch);
  assert.ok(third !== null);
  for (const field of fields) {
    assert.equal(third[field], first[field], `${field} leaked from another rider’s scratch`);
  }
});

test('the floor lets every bend through and refuses the fold, where M20.2’s floor refused the bends', () => {
  // `regroupFloor` is the bust radius plus one, or a share of the return if
  // that is larger. M20.2 floored at the whole return (capped at the siren's
  // far edge), which was harmless at 85 m and, at the chase pass's 50 m,
  // refused nearly the whole route: a chord is shorter than its arc, so a
  // cop 50 m back along any corner is never 50 m away. Both floors are kept
  // here and the old one must still fail — a single widened constant is a
  // constant nothing checks.
  const back = CHASE.trackerReturnMetres;
  const floor = regroupFloor(back, CHASE.bustRadiusMetres);
  const old = Math.max(CHASE.bustRadiusMetres + 1, Math.min(back, AUDIO.sirenFarMetres));
  assert.ok(floor > CHASE.bustRadiusMetres, 'the floor is inside the bust radius');
  assert.ok(floor < back, 'the floor is the whole return again, which no chord clears on a bend');

  // Walk the route a metre at a time: how much of it accepts the return
  // *as asked* under each floor — the ladder walks past a refused rung, so
  // a floor's bend problem shows as answers further back than the return,
  // not as refusals — and where the line comes closest to doubling back on
  // itself.
  let asked = 0;
  let placed = 0;
  let placedOld = 0;
  let fold = { distance: -1, chord: Infinity };
  for (let distance = back + 1; distance < spine.length - 1; distance += 1) {
    const rider = riderAt(distance);
    asked += 1;
    if (planRegroup(spine, rider, back, floor, freshScratch())?.back === back) placed += 1;
    if (planRegroup(spine, rider, back, old, freshScratch())?.back === back) placedOld += 1;
    const unfloored = planRegroup(spine, rider, back, 0, freshScratch());
    if (unfloored !== null && unfloored.gap < fold.chord) fold = { distance, chord: unfloored.gap };
  }
  assert.ok(placed >= asked * 0.9,
    `the floor (${floor} m) placed the cop as asked at ${placed} of ${asked} positions on route-41`);
  assert.ok(placedOld < asked * 0.5,
    `M20.2’s floor (${old} m) placed the cop as asked at ${placedOld} of ${asked} — the bend problem is gone`);

  // The bend every other test here stands on: through as asked under the
  // floor, walked past under the old one.
  assert.equal(planRegroup(spine, riderAt(400), back, floor, freshScratch())?.back, back,
    'the floor refused the gentle bend at 400 m');
  const oldAtBend = planRegroup(spine, riderAt(400), back, old, freshScratch());
  assert.ok(oldAtBend === null || oldAtBend.back > back,
    'the old floor let the bend through as asked, so this test no longer tells the two apart');

  // The fold: two arms of the line a few metres apart in the world. route-41
  // has one, and it is inside the bust radius — exactly the placement that
  // would hand the cop a crash that is his doing. The rung at the fold is
  // refused; what the ladder answers, if anything, is a rung further back
  // that clears the floor.
  assert.ok(fold.chord < CHASE.bustRadiusMetres + 1,
    `route-41’s tightest ${back} m return is ${fold.chord} m away at ${fold.distance} m — no fold to refuse`);
  const atFold = planRegroup(spine, riderAt(fold.distance), back, floor, freshScratch());
  if (atFold !== null) {
    assert.ok(atFold.back > back && atFold.gap >= floor,
      `the floor placed the cop ${atFold.gap} m from the rider at the fold, ${atFold.back} m back`);
  }
  const unfloored = planRegroup(spine, riderAt(fold.distance), back, 0, freshScratch());
  assert.ok(unfloored !== null && unfloored.back === back,
    'the fold was refused by the route clamp, not by the floor');
});

test('a return inside the bust radius floors above itself, and the ladder is what answers it', () => {
  // A tunable is only testable by moving it, and an absurd setting must be
  // visibly absurd: a return inside the bust radius floors above itself —
  // the chord of a 10 m arc is at most 10 m and the floor is 13 — so its
  // own rung can never place him. What answers is the ladder: the first rung
  // further back whose chord clears the floor, so even an absurd return
  // never materialises him inside the radius. A 20 m return is short enough
  // that the radius plus one outranks its share, and it goes through on its
  // own rung on the same bend.
  const radius = CHASE.bustRadiusMetres;
  assert.ok(regroupFloor(10, radius) > 10, 'a return inside the bust radius floors below itself');
  const absurd = planRegroup(spine, riderAt(400), 10, regroupFloor(10, radius), freshScratch());
  assert.ok(absurd === null || (absurd.back > 10 && absurd.gap >= regroupFloor(10, radius)),
    `a cop was placed ${absurd?.gap} m from the rider on a 10 m return`);
  assert.equal(regroupFloor(20, radius), radius + 1, 'a short return is not floored at the radius plus one');
  const short = planRegroup(spine, riderAt(400), 20, regroupFloor(20, radius), freshScratch());
  assert.ok(short !== null && short.back === 20, 'a 20 m return was refused on a gentle bend');
});

// ---------------------------------------------------------------------------
// The landing judge — Codex's M31 QA
// ---------------------------------------------------------------------------
//
// A reset gives the cop no approach: the rider's pace on a straight wheel.
// So every rung is shown to a judge before it is answered, and a refused
// rung walks the ladder further back. The judges here are scripted so the
// planner's rules are pinned on their own; the brain's real judge
// (`CpuRider.landingAllowance`) is ridden for in `copLanding.test.ts`.

/** What the planner asked the judge, in order. */
function recording(answer: (distance: number, direction: 1 | -1) => number | null): {
  judge: RegroupJudge; asked: { distance: number; direction: 1 | -1 }[];
} {
  const asked: { distance: number; direction: 1 | -1 }[] = [];
  return {
    asked,
    judge: (distance, direction) => {
      asked.push({ distance, direction });
      return answer(distance, direction);
    },
  };
}

test('an unjudged regroup is the first unclamped, unfolded rung, at any pace', () => {
  const candidate = planRegroup(spine, riderAt(400), 50, 13, freshScratch());
  assert.ok(candidate !== null);
  assert.equal(candidate.back, 50, 'the ladder walked without a judge');
  assert.equal(candidate.entrySpeed, Infinity, 'an unjudged rung carries a pace');
  assert.ok(Math.abs(candidate.distance - 350) < 1, `the candidate reads ${candidate.distance} m along the route`);
});

test('a rung the judge refuses is walked past, and the judge is asked about each rung in turn, further back only', () => {
  // The judge sees the rung's route distance and the rider's direction, and
  // its `null` on the first two rungs sends the ladder to the third.
  const { judge, asked } = recording((distance) => (distance > 342 ? null : 20));
  const candidate = planRegroup(spine, riderAt(400), 50, 13, freshScratch(), judge);
  assert.ok(candidate !== null, 'a judge that allows the third rung refused the regroup');
  assert.equal(candidate.back, 60, `the ladder answered ${candidate.back} m back`);
  assert.equal(candidate.entrySpeed, 20, 'the judge’s allowance was not carried on the candidate');
  assert.deepEqual(asked.map((ask) => Math.round(ask.distance)), [350, 345, 340],
    'the judge was asked about rungs in another order, or about rungs it never needed to see');
  assert.ok(asked.every((ask) => ask.direction === 1), 'the judge was told the wrong direction of travel');

  // Riding the route backwards, "further back" is further along it.
  const reversed = recording((distance) => (distance < 458 ? null : 20));
  const back = planRegroup(spine, riderAt(400, true), 50, 13, freshScratch(), reversed.judge);
  assert.ok(back !== null && back.back === 60 && back.direction === -1,
    'a reversed rider’s ladder did not walk further along the route');
  assert.deepEqual(reversed.asked.map((ask) => Math.round(ask.distance)), [450, 455, 460]);
  assert.ok(reversed.asked.every((ask) => ask.direction === -1));
});

test('a rung at a useless pace is kept only as a fallback: a better rung further back wins, the best is the answer otherwise', () => {
  // Stood at walking pace behind a rider doing 25 m/s he converts into
  // nothing, so the ladder keeps looking for a rung it can enter at a useful
  // pace and takes the first one it finds; when none is, the best it saw.
  const slowThenFast = planRegroup(spine, riderAt(400), 50, 13, freshScratch(),
    (distance) => (distance > 342 ? 4 : 15));
  assert.ok(slowThenFast !== null && slowThenFast.back === 60 && slowThenFast.entrySpeed === 15,
    `a 15 m/s rung two rungs on lost to a 4 m/s one (${slowThenFast?.back} m back at ${slowThenFast?.entrySpeed})`);
  const allSlow = planRegroup(spine, riderAt(400), 50, 13, freshScratch(),
    (distance) => (Math.abs(distance - 340) < 1 ? 6 : 3));
  assert.ok(allSlow !== null && allSlow.back === 60 && allSlow.entrySpeed === 6,
    `the best of a slow ladder was not the answer (${allSlow?.back} m back at ${allSlow?.entrySpeed})`);
  assert.equal(planRegroup(spine, riderAt(400), 50, 13, freshScratch(), () => null), null,
    'a judge that refuses every rung still placed him');
});

test('the ladder walks only so far, and never closer than asked', () => {
  const { judge, asked } = recording(() => null);
  planRegroup(spine, riderAt(400), 50, 13, freshScratch(), judge);
  assert.ok(asked.length >= 5 && asked.length <= 9, `the ladder has ${asked.length} rungs`);
  assert.ok(asked.every((ask) => ask.distance <= 350 + 1e-6), 'a rung was closer to the rider than the return asked for');
  const furthest = Math.min(...asked.map((ask) => ask.distance));
  assert.ok(350 - furthest <= 40, `the ladder walked ${350 - furthest} m past the return, which is a different regroup`);
});
