/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Hazard, HazardKind } from '../level/plan.ts';
import { HazardField, isContactHazard } from './hazards.ts';

/**
 * The pothole broadphase, tested headlessly.
 *
 * Three things here are worth more than the rest:
 *
 *   1. **Tunnelling.** This is a point test once per fixed step, exactly like
 *      checkpoint detection, so a footprint narrower than one step's travel is
 *      a hazard the rider rides through and the game never sees. The walks
 *      below pin the margin at top speed and at four times it, and the last of
 *      them documents the failure rather than pretending it cannot happen —
 *      because Phase 3's generator is what will actually decide the radii, and
 *      it needs a number to respect.
 *   2. **The grid is not the answer, it is a filter.** Every test here that
 *      places hazards far apart, or larger than one 8 m cell, is asking the
 *      same question: does bucketing ever change what `at` returns? It must
 *      not, ever, for any arrangement — a broadphase that decides anything is
 *      a bug with a performance justification attached.
 *   3. **Severity beats array order.** Overlap should not happen once Phase 3's
 *      spacing contract exists, but "should not" is not something the
 *      simulation can be built on, and the outcome of clipping a deep hole must
 *      not depend on which slot the generator happened to write it into.
 */

/** The simulation's fixed step. */
const STEP = 1 / 120;

/** Top speed is about 15 m/s, so this is the furthest the wheel moves in a step. */
const TOP_SPEED_STEP_METRES = 15 * STEP;

function hazardAt(
  x: number,
  z: number,
  kind: HazardKind = 'potholeShallow',
  radius = 1,
  id = `h-${x}-${z}`,
): Hazard {
  return { id, kind, centre: { x, y: 0, z }, radius };
}

// -- What is in the field, and what is not ------------------------------------

test('a world with no hazards answers every query, and answers null', () => {
  // The normal case rather than an edge case: the slice and the proving ground
  // carry none by owner decision (§13 q9), so this is the field the game's
  // most-ridden levels actually run with. It must not need a guard clause.
  const field = new HazardField([]);
  assert.equal(field.count, 0);
  assert.equal(field.at(0, 0), null);
  assert.equal(field.at(1e6, -1e6), null);
});

test('a spill is not a contact hazard, and never enters the field', () => {
  // The load-bearing separation of the whole milestone. A spill's ride response
  // is the `spill` surface painted under it — low grip, and the only non-zero
  // `wobbleInjection` in the table. If it were also a contact event here, the
  // same puddle would be answered twice by two systems that could disagree.
  const field = new HazardField([
    hazardAt(0, 0, 'spill', 3),
    hazardAt(20, 0, 'potholeShallow'),
  ]);
  assert.equal(field.count, 1);
  assert.equal(field.at(0, 0), null, 'the spill is not here');
  assert.ok(field.at(20, 0) !== null, 'the pothole is');
});

test('isContactHazard is the one place the kind list is written down', () => {
  assert.equal(isContactHazard(hazardAt(0, 0, 'spill', 2)), false);
  assert.equal(isContactHazard(hazardAt(0, 0, 'potholeShallow')), true);
  assert.equal(isContactHazard(hazardAt(0, 0, 'potholeDeep')), true);
});

// -- The footprint ------------------------------------------------------------

test('the footprint is a circle, and its edge is inside it', () => {
  const field = new HazardField([hazardAt(10, -4, 'potholeShallow', 2)]);
  assert.ok(field.at(10, -4) !== null, 'the centre');
  assert.ok(field.at(11.9, -4) !== null, 'just inside along +x');
  assert.ok(field.at(10, -2.01) !== null, 'just inside along +z');
  assert.equal(field.at(12.01, -4), null, 'just outside along +x');
  // The corner of the bounding box the grid buckets by, which is comfortably
  // outside the circle it contains. A square-footprint bug passes every test
  // above this line and fails this one.
  assert.equal(field.at(11.9, -5.9), null, 'inside the bounds, outside the circle');
});

test('the returned hazard is the plan\'s own object, not a copy', () => {
  // `render/` draws from `plan.hazards` and the simulation answers from this
  // field; if the two ever stopped being the same objects, a hazard could be
  // drawn in one place and hit in another and nothing would say so.
  const authored = hazardAt(0, 0, 'potholeDeep', 1.5);
  const field = new HazardField([authored]);
  assert.equal(field.at(0.5, 0.5), authored);
});

// -- The grid decides nothing -------------------------------------------------

test('hazards far apart do not answer for each other', () => {
  // 500 m apart is many cells apart, which is the arrangement a real generated
  // route produces and the one a broadphase can get wrong invisibly.
  const near = hazardAt(0, 0);
  const far = hazardAt(500, 500);
  const field = new HazardField([near, far]);
  assert.equal(field.at(0, 0), near);
  assert.equal(field.at(500, 500), far);
  assert.equal(field.at(250, 250), null);
});

test('a footprint wider than one grid cell is found at its edges', () => {
  // The grid targets 8 m cells, so a 12 m radius spans several of them and is
  // listed in all of them. A hazard bucketed only by its centre cell would
  // still be found in the middle and quietly missed around the outside — which
  // in play is a hole with a hollow rim, hit only if you cross the very centre.
  const wide = hazardAt(0, 0, 'potholeShallow', 12);
  const field = new HazardField([wide]);
  for (const [x, z] of [[11, 0], [-11, 0], [0, 11], [0, -11], [8, 8]]) {
    assert.equal(field.at(x, z), wide, `at ${x},${z}`);
  }
  assert.equal(field.at(12.5, 0), null);
});

test('a query far outside every hazard is answered without a special case', () => {
  // `columnAt`/`rowAt` clamp into the grid rather than rejecting, so this lands
  // in a border cell and fails the exact circle test it was always going to.
  const field = new HazardField([hazardAt(0, 0)]);
  assert.equal(field.at(-1e7, 1e7), null);
  assert.equal(field.at(Number.MAX_SAFE_INTEGER, 0), null);
});

test('the grid agrees with an independent brute-force oracle for every query', () => {
  // A broadphase needs both completeness and soundness. Hand-picked hits prove
  // useful shapes, but they cannot prove that bucketing never omits a hazard
  // or invents one across arbitrary cell boundaries. Keep the oracle ignorant
  // of the grid: it scans the authored list and applies only the circle and
  // severity rules promised by `at`.
  let state = 0x13c0ffee;
  const random = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const hazards: Hazard[] = [];
  for (let index = 0; index < 400; index += 1) {
    const kind: HazardKind = index % 11 === 0
      ? 'spill'
      : index % 5 === 0
        ? 'potholeDeep'
        : 'potholeShallow';
    hazards.push(hazardAt(
      random() * 2_000 - 1_000,
      random() * 1_600 - 800,
      kind,
      0.1 + random() * 20,
      `oracle-${index}`,
    ));
  }

  const oracle = (x: number, z: number): Hazard | null => {
    let best: Hazard | null = null;
    for (const hazard of hazards) {
      if (!isContactHazard(hazard)) continue;
      const dx = x - hazard.centre.x;
      const dz = z - hazard.centre.z;
      if (dx * dx + dz * dz > hazard.radius * hazard.radius) continue;
      if (best === null || (
        hazard.kind === 'potholeDeep' && best.kind !== 'potholeDeep'
      )) best = hazard;
    }
    return best;
  };

  const field = new HazardField(hazards);
  for (let query = 0; query < 2_000; query += 1) {
    const x = random() * 2_400 - 1_200;
    const z = random() * 2_000 - 1_000;
    assert.equal(field.at(x, z), oracle(x, z), `query ${query} at ${x},${z}`);
  }
});

// -- Overlap ------------------------------------------------------------------

test('where two footprints overlap the deep one wins, whichever was authored first', () => {
  // A rider who clips the edge of a deep hole must not be handed the shallow
  // hole's outcome because the generator happened to emit them in that order.
  // Both orders, because passing one of these by luck is exactly how an
  // array-order bug survives.
  const shallow = hazardAt(0, 0, 'potholeShallow', 2, 'shallow');
  const deep = hazardAt(1, 0, 'potholeDeep', 2, 'deep');
  assert.equal(new HazardField([shallow, deep]).at(0.5, 0)?.id, 'deep');
  assert.equal(new HazardField([deep, shallow]).at(0.5, 0)?.id, 'deep');
});

test('two hazards of one kind resolve by array order, so the answer is stable', () => {
  const first = hazardAt(0, 0, 'potholeShallow', 2, 'first');
  const second = hazardAt(1, 0, 'potholeShallow', 2, 'second');
  assert.equal(new HazardField([first, second]).at(0.5, 0)?.id, 'first');
});

// -- Tunnelling ---------------------------------------------------------------

/**
 * Walk a point through a hazard at a fixed distance per step, from sixteen
 * different starting phases, and return the **worst** number of steps that
 * found it.
 *
 * The phase sweep is the whole point and the first draft of this file got it
 * wrong. A single walk from a round number lands a sample exactly on the
 * hazard's centre and reports a hit — which says nothing, because where the
 * step boundaries fall relative to a pothole is not something the game
 * controls. It depends on where the rider spawned, every metre they have
 * ridden since, and their speed on the approach. Only the worst case over all
 * phases is a guarantee, and a guarantee is what Phase 3 needs to place
 * against.
 */
function worstCaseHits(field: HazardField, metresPerStep: number): number {
  let worst = Infinity;
  for (let phase = 0; phase < 1; phase += 1 / 16) {
    let hits = 0;
    for (let z = -20 + phase * metresPerStep; z <= 20; z += metresPerStep) {
      if (field.at(0, z) !== null) hits += 1;
    }
    worst = Math.min(worst, hits);
  }
  return worst;
}

test('a hazard the size Phase 3 will place is caught at top speed, from any phase', () => {
  // 0.4 m radius is the smallest footprint worth calling a pothole. Against
  // 0.125 m of travel per step it is 6.4 steps wide, so six is the floor
  // whatever the alignment — the same kind of margin `CHALLENGE.gateHalfDepth`
  // buys a checkpoint, and the reason this is nowhere near the edge.
  const field = new HazardField([hazardAt(0, 0, 'potholeShallow', 0.4)]);
  assert.ok(worstCaseHits(field, TOP_SPEED_STEP_METRES) >= 6);
});

test('and at four times top speed, which the wheel cannot reach', () => {
  // 0.8 m of footprint against 0.5 m of travel: one sample must land inside it.
  const field = new HazardField([hazardAt(0, 0, 'potholeShallow', 0.4)]);
  assert.ok(worstCaseHits(field, 4 * TOP_SPEED_STEP_METRES) >= 1);
});

test('a footprint narrower than one step is jumped clean over from some phases', () => {
  // **Documenting the limit, not endorsing it.** A point test once per fixed
  // step cannot guarantee it sees a hazard narrower than the step, and the
  // arithmetic is exact: a centre-line crossing is certain only while 2r
  // exceeds the travel per step, so at top speed the floor is r > 0.0625 m.
  // Phase 3's placement pass is what has to respect that, and this is the
  // number it has to respect.
  //
  // What makes it worth a test rather than a comment is that such a hazard is
  // not reliably missed either — it fires for the phases where a sample happens
  // to land inside. An undersized pothole is not a dead one, it is an
  // intermittent one, which is the worse of the two failures and invisible from
  // inside a play session.
  const field = new HazardField([hazardAt(0, 0, 'potholeShallow', 0.05)]);
  assert.equal(worstCaseHits(field, TOP_SPEED_STEP_METRES), 0);
});

test('the same query twice gives the same answer, which advance(n) depends on', () => {
  const field = new HazardField([
    hazardAt(0, 0, 'potholeDeep', 2),
    hazardAt(1.5, 0.5, 'potholeShallow', 2),
    hazardAt(40, 40, 'potholeShallow'),
  ]);
  for (let i = 0; i < 8; i += 1) {
    assert.equal(field.at(1, 0.25)?.id, field.at(1, 0.25)?.id);
    assert.equal(field.at(1, 0.25)?.kind, 'potholeDeep');
  }
});
