/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  INSTALLED_FEATURES,
  entryDistance,
  poseAt,
} from '../bench/installedPark.ts';
import { MPS_PER_MPH } from './parkSignage.ts';
import {
  MOUNT_TAKEOFF_SECONDS,
  SWITCHBACK_TRICK_ZONES,
  TRICK_ZONE_TAKEOFF_MARGIN,
  SWITCHBACK_FEATURES,
  mountRunUp,
} from './switchbackLevel.ts';
import { trickZoneAt, type TrickZone } from './trickZones.ts';

/**
 * M38 Phase 5 — independent QA's own probes of q189's level half.
 *
 * Written by somebody who did not build the zones, and deliberately NOT a
 * replay of `switchbackLevel.test.ts`'s section 11: that file asks whether
 * each feature's own lip, deck, run-up and bypass answer correctly at the
 * points it names. These are the attacks it does not make — the lookup's
 * behaviour on a point that is not a point at all, a dense sweep of every
 * bypass half rather than three samples of it, the far boundary's outside,
 * every corner and edge midpoint of every zone, a grid probe that would catch
 * an overlap the linear scan resolves silently, and the mount run-up at the
 * *slowest* published mount speed as well as the sign's own.
 */

/** The zone a feature id names, or a thrown test failure. */
function zoneOf(id: string): TrickZone {
  const zone = SWITCHBACK_TRICK_ZONES.find((candidate) => candidate.id === id);
  assert.ok(zone !== undefined, `the park emitted no "${id}" zone`);
  return zone;
}

/** The host corridor of a feature, which is what `poseAt` measures along. */
function hostOf(id: string): string {
  return SWITCHBACK_FEATURES[id].segment;
}

// ---------------------------------------------------------------------------
// The lookup itself
// ---------------------------------------------------------------------------

test('QA zones: a point that is not a point is inside nothing', () => {
  // **The gate must fail SHUT.** The half-plane test compares cross products
  // against an epsilon, and every comparison against NaN is false — so a
  // non-finite coordinate walks every edge without ever being ruled outside
  // and lands in whichever zone happens to be first in the array. `Game`
  // guards `undefined` with `?? 0` and guards nothing else; a pose that went
  // non-finite would bank the park's first feature on every flight.
  const zones: TrickZone[] = [
    { id: 'a', corners: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }] },
    { id: 'b', corners: [{ x: 100, z: 100 }, { x: 110, z: 100 }, { x: 110, z: 110 }, { x: 100, z: 110 }] },
  ];
  assert.equal(trickZoneAt(zones, 5, 5), 'a', 'the control point moved');
  assert.equal(trickZoneAt(zones, 50, 50), null, 'the control point moved');

  const broken: readonly [unknown, unknown][] = [
    [Number.NaN, Number.NaN],
    [Number.NaN, 5],
    [5, Number.NaN],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
    [Number.POSITIVE_INFINITY, 5],
    [undefined, undefined],
    [5, undefined],
  ];
  for (const [x, z] of broken) {
    assert.equal(
      trickZoneAt(zones, x as number, z as number),
      null,
      `(${String(x)}, ${String(z)}) was placed inside a zone`,
    );
    assert.equal(trickZoneAt(SWITCHBACK_TRICK_ZONES, x as number, z as number), null);
  }
});

test('QA zones: no zones, empty zones and a degenerate polygon answer null', () => {
  assert.equal(trickZoneAt(undefined, 5, 5), null);
  assert.equal(trickZoneAt([], 5, 5), null);
  // Fewer than three corners is not a shape; `validTrickZones` refuses it at
  // build time and the lookup refuses it at runtime rather than guessing.
  assert.equal(trickZoneAt([{ id: 'line', corners: [{ x: 0, z: 0 }, { x: 1, z: 1 }] }], 0.5, 0.5), null);
  assert.equal(trickZoneAt([{ id: 'none', corners: [] }], 0, 0), null);
});

// ---------------------------------------------------------------------------
// The park's nine, attacked geometrically
// ---------------------------------------------------------------------------

test('QA zones: every corner and every edge midpoint belongs to its own zone', () => {
  // The takeoff margin's boundary exactly, from both ends and both sides. The
  // module promises inclusive edges; a strict test here would be a rider who
  // pressed on the line and was told it did not happen.
  for (const zone of SWITCHBACK_TRICK_ZONES) {
    const corners = zone.corners;
    for (let index = 0; index < corners.length; index += 1) {
      const here = corners[index];
      const next = corners[(index + 1) % corners.length];
      assert.equal(
        trickZoneAt(SWITCHBACK_TRICK_ZONES, here.x, here.z),
        zone.id,
        `corner ${index} of "${zone.id}" is outside its own zone`,
      );
      assert.equal(
        trickZoneAt(SWITCHBACK_TRICK_ZONES, (here.x + next.x) / 2, (here.z + next.z) / 2),
        zone.id,
        `the midpoint of edge ${index} of "${zone.id}" is outside its own zone`,
      );
    }
  }
});

test('QA zones: a grid over each zone never answers another feature', () => {
  // `trickZoneAt` returns the FIRST match and the venue owes it non-overlap.
  // `switchbackLevel.test.ts` proves that with a separating-axis check on the
  // polygons; this is the same claim attacked from the other side — sample the
  // interior densely and require the scan to name the zone the point is in.
  // A zone that grew over a neighbour earlier in the array would show here as
  // the neighbour's id, which is the failure a player would actually see.
  let sampled = 0;
  for (const zone of SWITCHBACK_TRICK_ZONES) {
    const [a, b, , d] = zone.corners;
    for (let u = 1; u <= 15; u += 1) {
      for (let v = 1; v <= 7; v += 1) {
        const su = u / 16;
        const sv = v / 8;
        const x = a.x + (b.x - a.x) * su + (d.x - a.x) * sv;
        const z = a.z + (b.z - a.z) * su + (d.z - a.z) * sv;
        assert.equal(
          trickZoneAt(SWITCHBACK_TRICK_ZONES, x, z),
          zone.id,
          `a point inside "${zone.id}" answered another feature`,
        );
        sampled += 1;
      }
    }
  }
  assert.equal(sampled, 9 * 15 * 7);
});

test('QA zones: the ground past a zone’s far boundary is not that zone', () => {
  // The margin is a take-off allowance and explicitly not a landing one: the
  // catch and landing decks a feature aims at stand eleven and twelve metres
  // out. Half a metre past the far edge is already outside.
  for (const zone of SWITCHBACK_TRICK_ZONES) {
    const [a, b, c, d] = zone.corners;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / length;
    const uz = (b.z - a.z) / length;
    for (const [from, to] of [[a, b], [d, c]] as const) {
      void from;
      for (const past of [0.5, 2, 6]) {
        const x = to.x + ux * past;
        const z = to.z + uz * past;
        assert.notEqual(
          trickZoneAt(SWITCHBACK_TRICK_ZONES, x, z),
          zone.id,
          `"${zone.id}" still owns ground ${past} m past its far edge`,
        );
      }
      // And the same distance behind the near edge.
      for (const past of [0.5, 2, 6]) {
        const x = (to === b ? a : d).x - ux * past;
        const z = (to === b ? a : d).z - uz * past;
        assert.notEqual(
          trickZoneAt(SWITCHBACK_TRICK_ZONES, x, z),
          zone.id,
          `"${zone.id}" still owns ground ${past} m behind its near edge`,
        );
      }
    }
  }
});

test('QA zones: the bypass half of every feature corridor is trick ground nowhere', () => {
  // Principle 1 restated as a sweep rather than as three samples: the whole
  // right half of every host corridor, every half metre from the feature's
  // spawn to its end, at the bypass line and at the shoulder beside it.
  for (const feature of INSTALLED_FEATURES) {
    const host = hostOf(feature.id);
    const entry = entryDistance(host);
    const from = feature.spawnS - entry;
    const to = feature.endS - entry;
    assert.ok(to > from, `"${feature.id}" has no window`);
    let checked = 0;
    for (let s = from; s <= to; s += 0.5) {
      for (const t of [feature.bypassT, -0.25, -1, -2]) {
        const point = poseAt(host, s, t).position;
        const found = trickZoneAt(SWITCHBACK_TRICK_ZONES, point.x, point.z);
        assert.equal(
          found,
          null,
          `the bypass beside "${feature.id}" at s ${s.toFixed(1)}, t ${t} is inside "${found}"`,
        );
        checked += 1;
      }
    }
    assert.ok(checked > 40, `"${feature.id}" sweep was ${checked} points`);
  }
});

// ---------------------------------------------------------------------------
// The mount run-up, at every published mount speed
// ---------------------------------------------------------------------------

/**
 * The published mount speeds of the bench's T4/T6 sweeps, slowest first.
 *
 * `docs/TRICK_BENCH.md` S1 is the finding the run-up answers, and the run-up
 * is sized at the *fastest* of these. The slow end is what this file checks:
 * a slower mount leaves the ground nearer the face, so it should be inside a
 * zone that reaches further back than it needs to — but "should" is the word
 * that costs owner rides, and nothing measured it.
 */
const PUBLISHED_MOUNT_MPH: Readonly<Record<string, readonly number[]>> = Object.freeze({
  skinny: [8, 12, 15],
  stepUp: [8, 12, 16, 20],
});

test('QA zones: a mount launches inside its own zone at every published speed', () => {
  const mounted = INSTALLED_FEATURES.filter((feature) => mountRunUp(feature.id) > 0);
  assert.deepEqual(mounted.map((feature) => feature.id).slice().sort(), ['skinny', 'stepUp']);

  for (const feature of mounted) {
    const host = hostOf(feature.id);
    const lipLocal = feature.lipS - entryDistance(host);
    const speeds = PUBLISHED_MOUNT_MPH[feature.id];
    assert.ok(speeds !== undefined, `"${feature.id}" has no published mount sweep`);
    // The fastest published speed is the one the run-up is sized at, and the
    // zone is asserted to reach exactly that far — so the sweep and the level
    // constant cannot drift apart silently.
    const fastest = speeds[speeds.length - 1];
    assert.ok(
      Math.abs(mountRunUp(feature.id) - fastest * MPS_PER_MPH * MOUNT_TAKEOFF_SECONDS) < 1e-9,
      `"${feature.id}" run-up is not its fastest published mount speed`,
    );

    for (const mph of speeds) {
      // Where the wheel actually leaves the ground: the hop's own rise time
      // before the face, at the speed the approach is ridden at.
      const back = mph * MPS_PER_MPH * MOUNT_TAKEOFF_SECONDS;
      const point = poseAt(host, lipLocal - back, feature.technicalT).position;
      assert.equal(
        trickZoneAt(SWITCHBACK_TRICK_ZONES, point.x, point.z),
        feature.id,
        `a ${mph} mph mount of "${feature.id}" launches ${back.toFixed(2)} m out, off-zone`,
      );
      // And the earliest press the margin forgives at that speed.
      const early = poseAt(host, lipLocal - back - TRICK_ZONE_TAKEOFF_MARGIN, feature.technicalT).position;
      assert.equal(
        trickZoneAt(SWITCHBACK_TRICK_ZONES, early.x, early.z),
        feature.id,
        `a ${mph} mph mount pressed a margin early is off-zone`,
      );
      // The bypass beside that same launch ground is still nothing.
      const bypass = poseAt(host, lipLocal - back, feature.bypassT).position;
      assert.equal(trickZoneAt(SWITCHBACK_TRICK_ZONES, bypass.x, bypass.z), null);
    }
  }

  // And the seven a rider LEAVES have no run-up at all, so their zone starts
  // at their own first block: a metre in front of one is open ground.
  for (const feature of INSTALLED_FEATURES) {
    if (mountRunUp(feature.id) > 0) continue;
    assert.equal(zoneOf(feature.id).corners.length, 4);
  }
});
