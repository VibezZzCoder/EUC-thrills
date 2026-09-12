/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { markingWidth } from '../data/markings.ts';
import {
  TURN_ARROW,
  turnArrowAcross,
  TURN_ARROW_ALONG,
  turnArrowMarkings,
  turnArrowPad,
  turnArrowsBySegment,
} from './parkTurnArrows.ts';
import {
  SWITCHBACK_FEATURES,
  SWITCHBACK_GEOMETRY,
  SWITCHBACK_SIGN_PAD_MARGIN,
  SWITCHBACK_SIGNAGE,
  SWITCHBACK_TURN_ARROWS,
  createSwitchbackLevel,
} from './switchbackLevel.ts';

test('an arrow is a bent shaft and a head that points along the bend', () => {
  const [shaft, head] = turnArrowMarkings({ segment: 'x', s: 10, t: 0, turn: 'right' });
  assert.equal(shaft.path.length, 3);
  assert.equal(head.path.length, 3);
  assert.equal(shaft.role, 'glyph');
  assert.equal(head.paint, 'ink');
  // The shaft runs straight, then bends toward the turn: right is negative t.
  assert.deepEqual(shaft.path[0], { s: 10, t: 0 });
  assert.deepEqual(shaft.path[1], { s: 10 + TURN_ARROW.run, t: 0 });
  assert.equal(shaft.path[2].s, 10 + TURN_ARROW_ALONG);
  assert.equal(shaft.path[2].t, -TURN_ARROW.bendAcross);
  // The head's tip is the shaft's end; its wings trail the tip along the
  // diagonal, one each side of it, a chevron's span apart.
  assert.deepEqual(head.path[1], shaft.path[2]);
  const tip = head.path[1];
  const along = (p: { s: number; t: number }) => (p.s - tip.s) - (p.t - tip.t);
  assert.ok(along(head.path[0]) < 0 && along(head.path[2]) < 0, 'the wings trail the tip');
  const wingS = head.path[0].s - head.path[2].s;
  const wingT = head.path[0].t - head.path[2].t;
  assert.ok(Math.abs(Math.hypot(wingS, wingT) - 2 * TURN_ARROW.headHalfSpan) < 1e-9);
  // A left turn mirrors it exactly.
  const [left] = turnArrowMarkings({ segment: 'x', s: 10, t: 0, turn: 'left' });
  assert.equal(left.path[2].t, TURN_ARROW.bendAcross);
});

test('every park arrow lies on its approach, on its own pad, clear of the features and the signage', () => {
  const geometry = new Map(SWITCHBACK_GEOMETRY.map((segment) => [segment.id, segment]));
  const order = SWITCHBACK_GEOMETRY.map((segment) => segment.id);
  const paintHalf = markingWidth('glyph') / 2;

  for (const arrow of SWITCHBACK_TURN_ARROWS) {
    const segment = geometry.get(arrow.segment);
    assert.ok(segment !== undefined, `${arrow.segment} is not a park segment`);
    assert.equal(segment.curvature, 0, `${arrow.segment} is a bend; arrows go on the approach`);

    // The next bend along the lap turns the way the arrow says.
    const at = order.indexOf(arrow.segment);
    const next = geometry.get(order[(at + 1) % order.length])!;
    const bend = next.curvature === 0 ? geometry.get(order[(at + 2) % order.length])! : next;
    assert.ok(bend.curvature !== 0, `${arrow.segment} is followed by no bend`);
    assert.equal(
      Math.sign(bend.curvature),
      arrow.turn === 'left' ? 1 : -1,
      `${arrow.segment}'s arrow points ${arrow.turn} but ${bend.id} bends the other way`,
    );

    // The arrow's own pad: wood under every stroke, on the bypass half only,
    // inside the corridor and the segment.
    const pad = turnArrowPad(arrow, SWITCHBACK_SIGN_PAD_MARGIN);
    assert.equal(pad.surface, 'wood');
    assert.ok(Math.max(pad.from, pad.to) < 0, `${arrow.segment}'s pad reaches the technical half (t ${pad.to.toFixed(2)})`);
    assert.ok(Math.min(pad.from, pad.to) >= -segment.halfWidth, `${arrow.segment}'s pad leaves the corridor`);
    assert.ok(pad.fromS! >= 0 && pad.toS! <= segment.length, `${arrow.segment}'s pad at s ${arrow.s} leaves the segment`);
    for (const run of turnArrowMarkings(arrow)) {
      for (const point of run.path) {
        assert.ok(Math.abs(point.t) + paintHalf <= segment.halfWidth - 0.5, `${arrow.segment} paint at t ${point.t.toFixed(2)}`);
        assert.ok(point.t - paintHalf >= pad.from && point.t + paintHalf <= pad.to, `${arrow.segment}: paint off its pad across`);
        assert.ok(point.s - paintHalf >= pad.fromS! && point.s + paintHalf <= pad.toS!, `${arrow.segment}: paint off its pad along`);
      }
    }

    // Off every feature block on the segment, by the paint's width.
    const sFrom = arrow.s;
    const sTo = arrow.s + TURN_ARROW_ALONG;
    const tFar = arrow.t + (arrow.turn === 'left' ? 1 : -1) * turnArrowAcross(arrow);
    const tMin = Math.min(arrow.t, tFar) - paintHalf;
    const tMax = Math.max(arrow.t, tFar) + paintHalf;
    for (const feature of Object.values(SWITCHBACK_FEATURES)) {
      if (feature.segment !== arrow.segment) continue;
      for (const block of feature.report.blocks) {
        const overlapS = sTo > block.s - block.halfAlong && sFrom < block.s + block.halfAlong;
        const overlapT = tMax > block.t - block.halfLateral && tMin < block.t + block.halfLateral;
        assert.ok(!(overlapS && overlapT), `${arrow.segment}'s arrow at s ${arrow.s} crosses a ${feature.kind} block`);
      }
    }

    // Off the signage's pads and paint on the same segment, along the trail.
    for (const band of SWITCHBACK_SIGNAGE.bands.get(arrow.segment) ?? []) {
      const bandFrom = band.fromS ?? -Infinity;
      const bandTo = band.toS ?? Infinity;
      assert.ok(
        pad.toS! < bandFrom || pad.fromS! > bandTo,
        `${arrow.segment}'s arrow at s ${arrow.s} shares ground with a sign pad ${bandFrom.toFixed(1)}–${bandTo.toFixed(1)}`,
      );
    }
    for (const run of SWITCHBACK_SIGNAGE.markings.get(arrow.segment) ?? []) {
      for (const point of run.path) {
        assert.ok(point.s < sFrom - 0.5 || point.s > sTo + 0.5, `${arrow.segment}'s arrow meets signage paint at s ${point.s}`);
      }
    }
  }

  // Two runs per arrow, and the built plan ships all of them alongside the
  // signage's own — none clipped, none split.
  const authored = [...turnArrowsBySegment(SWITCHBACK_TURN_ARROWS).values()].flat().length;
  assert.equal(authored, SWITCHBACK_TURN_ARROWS.length * 2);
  const plan = createSwitchbackLevel();
  const signage = [...SWITCHBACK_SIGNAGE.markings.values()].flat().length;
  assert.equal((plan.markings ?? []).length, signage + authored);
});

test("the clearing hairpin — the owner's note — gets two arrows, and every other hairpin but the stairs' gets its own", () => {
  const runout = SWITCHBACK_TURN_ARROWS.filter((arrow) => arrow.segment === 'kicker-runout');
  assert.equal(runout.length, 2);
  assert.ok(runout.every((arrow) => arrow.t < 0 && arrow.turn === 'right'));
  const approaches = new Set(SWITCHBACK_TURN_ARROWS.map((arrow) => arrow.segment));
  assert.deepEqual([...approaches].sort(), ['kicker-runout', 'rock-rhythm', 'shelf-in', 'timber']);
});
