/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TRACK_DAY } from '../data/tuning.ts';
import { BAY_LENGTH, TRAIL_CAMERA_GAP, railProps } from './parkDressing.ts';
import {
  FENCE_BAY_REACH,
  FENCE_ENVELOPE_CLEAR,
  FENCE_MIN_ARC_RADIUS,
  FENCE_SPINE_METRES,
  innerFenceOffset,
  innerFences,
  type FenceElement,
} from './parkFencing.ts';

/**
 * The inner-bend fencing rule, on its own arithmetic — M36, the owner's rides.
 *
 * `switchbackLevel.test.ts` holds the *built park* to what this produces, which
 * is the claim that matters and is also the slow one. This file holds the rule
 * to the four things it is: which side of the trail a bend's inside is, how far
 * out the fence stands, where the arc and its spine meet, and what it refuses.
 *
 * The lap below is a miniature with the same shapes Switchback Park has — a
 * left hairpin, a right hairpin and a 90° bend, each between straights of
 * different widths — so a bound that only ever binds at one real corner still
 * has somewhere to bind here.
 */
const LAP: readonly FenceElement[] = [
  { id: 'in', turn: 0, radius: 0, length: 40, halfWidth: 8 },
  { id: 'left-hairpin', turn: 180, radius: 16, length: Math.PI * 16, halfWidth: 8 },
  { id: 'out', turn: 0, radius: 0, length: 30, halfWidth: 9 },
  { id: 'right-hairpin', turn: -180, radius: 16, length: Math.PI * 16, halfWidth: 8 },
  { id: 'back', turn: 0, radius: 0, length: 30, halfWidth: 7 },
  { id: 'corner', turn: 90, radius: 20, length: Math.PI * 10, halfWidth: 7 },
  { id: 'home', turn: 0, radius: 0, length: 30, halfWidth: 6 },
];

const byId = new Map(LAP.map((element) => [element.id, element]));
const curvatureOf = (id: string): number => {
  const element = byId.get(id)!;
  return element.radius === 0 ? 0 : (element.turn > 0 ? 1 : -1) / element.radius;
};

test('a bend\'s inside is the side it turns to, on the arc and down the leg after it', () => {
  // The one fact the whole module hangs on, and the one that is easy to get
  // backwards: a rider circling an infield never puts it on their other hand,
  // so the sign that names the inside of the arc names the same side of the leg
  // the bend leaves on. Positive yaw turns left and positive `t` is the rider's
  // left (`AGENTS.md`, world conventions), so the sign is the turn's.
  const [left, right] = innerFences(
    [{ bend: 'left-hairpin', spine: true }, { bend: 'right-hairpin', spine: true }],
    LAP,
  );
  assert.equal(left.side, 1);
  assert.equal(right.side, -1);
  assert.ok(left.runs.every((run) => run.t > 0), 'a left bend fenced on the right');
  assert.ok(right.runs.every((run) => run.t < 0), 'a right bend fenced on the left');
  assert.deepEqual(left.runs.map((run) => run.segment), ['left-hairpin', 'out']);
  assert.deepEqual(right.runs.map((run) => run.segment), ['right-hairpin', 'back']);
});

test('the offset is the referee\'s reach at the widest corridor of the three', () => {
  // **A socket is where this bites.** `LapEnvelope` gives a span the wider of
  // its two ends' half-widths, so a fence pitched against the bend's own width
  // stands inside the envelope wherever a wider corridor joins it. The left
  // hairpin leaves onto a nine-metre straight and is itself eight; the fence is
  // built for the nine.
  const [left] = innerFences([{ bend: 'left-hairpin', spine: true }], LAP);
  assert.equal(left.offset, 9 + TRACK_DAY.offCourseMarginMetres + FENCE_ENVELOPE_CLEAR);
  assert.equal(left.offset, innerFenceOffset(byId.get('left-hairpin')!, byId.get('in')!, byId.get('out')!));
  assert.equal(left.innerRadius, 16 - left.offset);

  // And the corner, whose three corridors are seven, seven and six: the bend's
  // own width decides it, which is the ordinary case.
  const [corner] = innerFences([{ bend: 'corner', spine: false }], LAP);
  assert.equal(corner.offset, 7 + TRACK_DAY.offCourseMarginMetres + FENCE_ENVELOPE_CLEAR);
});

test('a technical line on the same side pushes the fence out past the camera', () => {
  // The second bound, and the only one that can *move* a fence: a bay inside
  // the chase arm's reach of the line a rider takes through a feature swings
  // the camera on the approach, which is the rule `parkSignage.ts` places a
  // post by. It binds on the side the features are on and goes quiet on the
  // other, which is arithmetic rather than a branch.
  const bend = byId.get('left-hairpin')!;
  const bare = innerFenceOffset(bend, byId.get('in')!, byId.get('out')!);
  const pushed = innerFenceOffset(bend, byId.get('in')!, byId.get('out')!, 5);
  assert.equal(pushed, 5 + TRAIL_CAMERA_GAP + FENCE_BAY_REACH);
  assert.ok(pushed > bare, 'a technical line on the fence\'s own side moved nothing');
  // The two bounds are a maximum rather than a sum: a line the envelope's own
  // offset already clears decides nothing.
  assert.equal(innerFenceOffset(bend, byId.get('in')!, byId.get('out')!, 4), bare);

  // A line on the other half of the trail is further away for every metre the
  // fence stands out, so the term never decides.
  assert.equal(innerFenceOffset(bend, byId.get('in')!, byId.get('out')!, -5), bare);
  // And the mirror: the same line, on a bend that turns the other way.
  const mirrored = byId.get('right-hairpin')!;
  assert.equal(innerFenceOffset(mirrored, byId.get('out')!, byId.get('back')!, 5),
    innerFenceOffset(mirrored, byId.get('out')!, byId.get('back')!));
});

test('the spine picks up exactly one bay after the arc\'s last one', () => {
  // **The junction is pitched, not butted**, and nothing else would catch it:
  // `buildPlan` exempts two fence bays from the structural conflict rule
  // because a run is *meant* to abut, so a spine started at the socket would
  // ship as one doubled bay per hairpin rather than as a refusal.
  //
  // Measured the way the park measures it — through `railProps`, on the fence's
  // own arc rather than on the centreline the runs are authored in.
  for (const id of ['left-hairpin', 'right-hairpin'] as const) {
    const [fence] = innerFences([{ bend: id, spine: true }], LAP);
    const bays = railProps(fence.runs, curvatureOf);
    const bend = byId.get(id)!;
    const arc = bays.get(id)!;
    const spine = bays.get(fence.spine!.segment)!;
    assert.ok(arc.length > 1 && spine.length > 1);

    // How far the last bay of the arc sits from the socket, along the fence.
    const scale = fence.innerRadius / bend.radius;
    const tail = (bend.length - arc[arc.length - 1].s) * scale;
    // And the first bay of the spine, which is on a straight and so is its own
    // distance from the same socket.
    assert.ok(
      Math.abs(tail + spine[0].s - BAY_LENGTH) < 1e-9,
      `${id}'s fence steps ${(tail + spine[0].s).toFixed(3)} m at the socket`,
    );
    // Every other step in the run is the same one bay.
    for (let bay = 1; bay < spine.length; bay += 1) {
      assert.ok(Math.abs(spine[bay].s - spine[bay - 1].s - BAY_LENGTH) < 1e-9);
    }
    for (let bay = 1; bay < arc.length; bay += 1) {
      assert.ok(Math.abs((arc[bay].s - arc[bay - 1].s) * scale - BAY_LENGTH) < 1e-9);
    }
  }
});

test('a spine runs the leg it leaves on, and no further than it has to', () => {
  const [left] = innerFences([{ bend: 'left-hairpin', spine: true }], LAP);
  // The `out` leg is 30 m, so the cap decides.
  assert.equal(left.spine?.segment, 'out');
  assert.equal(left.spine?.metres, FENCE_SPINE_METRES);
  // The right hairpin leaves onto a 30 m leg too, but starts its spine a little
  // way in, so the run stops at the leg's end rather than past it.
  const [right] = innerFences([{ bend: 'right-hairpin', spine: true }], LAP);
  const run = right.runs[1];
  assert.ok(run.toS <= byId.get('back')!.length + 1e-9, 'a spine ran off the end of its leg');
  // A fence with no spine is the arc and nothing else.
  const [corner] = innerFences([{ bend: 'corner', spine: false }], LAP);
  assert.equal(corner.spine, undefined);
  assert.equal(corner.runs.length, 1);
});

test('the arc covers the bend, and starts where it is told to', () => {
  const [whole] = innerFences([{ bend: 'corner', spine: false }], LAP);
  assert.equal(whole.runs[0].fromS, 0);
  assert.equal(whole.runs[0].toS, byId.get('corner')!.length);
  assert.ok(Math.abs(whole.arcMetres - whole.innerRadius * (Math.PI / 2)) < 1e-9);

  // And a bend whose entry socket is already occupied says so — the arc simply
  // starts later and lays that much less fence.
  const [late] = innerFences([{ bend: 'corner', fromS: 5, spine: false }], LAP);
  assert.equal(late.runs[0].fromS, 5);
  assert.ok(late.arcMetres < whole.arcMetres);
  assert.ok(
    Math.abs(whole.arcMetres - late.arcMetres - 5 * (late.innerRadius / 20)) < 1e-9,
    'a late start cost the fence the wrong amount of arc',
  );
});

test('a fence that could only stand where a rider may ride is refused', () => {
  // **The R10 case, which Switchback Park has and this rule will not build.** A
  // seven-metre corridor plus the referee's two and a half metres reaches 9.5 m
  // from the centreline, so a ten-metre hairpin's whole infield is ground a lap
  // can legally cross; there is no offset that is both outside the envelope and
  // inside the arc. The refusal names the arc it would have had.
  const tight: FenceElement = { id: 'shelf', turn: 180, radius: 10, length: Math.PI * 10, halfWidth: 7 };
  assert.throws(
    () => innerFences([{ bend: 'shelf', spine: false }], [...LAP, tight]),
    /no run of .* bays can follow/,
  );
  // The floor is one bay: an arc tighter than the rigid chord standing in for
  // it is a ring of planks round a point.
  assert.equal(FENCE_MIN_ARC_RADIUS, BAY_LENGTH);

  // Everything else a venue can get wrong, refused rather than approximated.
  assert.throws(() => innerFences([{ bend: 'nowhere', spine: false }], LAP), /carries no bend/);
  assert.throws(() => innerFences([{ bend: 'in', spine: false }], LAP), /straight/);
  assert.throws(
    () => innerFences([{ bend: 'corner', spine: false }, { bend: 'corner', spine: false }], LAP),
    /fenced twice/,
  );
  assert.throws(
    () => innerFences([{ bend: 'left-hairpin', fromS: 999, spine: false }], LAP),
    /fence starts at/,
  );
  // A bend that leaves straight onto another bend has no leg to lay a spine on.
  const doubled: readonly FenceElement[] = [
    { id: 'first', turn: 90, radius: 20, length: Math.PI * 10, halfWidth: 7 },
    { id: 'second', turn: 90, radius: 20, length: Math.PI * 10, halfWidth: 7 },
  ];
  assert.throws(
    () => innerFences([{ bend: 'first', spine: true }], doubled),
    /a bend rather than a leg/,
  );
});
