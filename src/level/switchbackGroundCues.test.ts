/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MARKINGS, SIGNS } from '../data/markings.ts';
import { ROUTE_ADVANCE } from '../data/routeAdvance.ts';
import { LETTER_ASPECT } from '../shared/letterPaths.ts';
import { arcLengths, dashSpans, ribbonRows, sampleAt } from '../shared/markingRibbon.ts';
import { centrelineAt, headingAt, leftOf, markingsOf, placeChain, type PlacedSegment,
  type SegmentMarking } from './segments.ts';
import { lineSeparation } from './switchbackAdvanceCues.ts';
import { SWITCHBACK_ADVANCE_CUES, SWITCHBACK_GRAPH, SWITCHBACK_SIGNAGE, SWITCHBACK_SPAWN } from './switchbackLevel.ts';

/**
 * Switchback's ground cues as the rider's camera receives them (VIS-3-R2,
 * 2026-10-04): every authored corner is painted, the step-down warnings are
 * full size, and no arrow touches a letter. Each test failed on the round-2
 * build (the negative control) and is measured on the placed world.
 */

const placed = placeChain(SWITCHBACK_GRAPH, SWITCHBACK_SPAWN);
type Point = { readonly x: number; readonly z: number };
type Ribbon = { readonly a: Point; readonly b: Point; readonly radius: number };

const placedRuns = (host: PlacedSegment, runs: readonly SegmentMarking[]) =>
  markingsOf({ ...host, spec: { ...host.spec, markings: runs } });
// A bevel join lies inside its legs' round ends (tested below), so the legs
// measure it; as a capsule of its own it would overstate its reach.
const ribbons = (host: PlacedSegment, runs: readonly SegmentMarking[]): Ribbon[] => placedRuns(host, runs)
  .filter(run => run.join !== true)
  .flatMap(run => run.points.slice(1).map((b, i) => ({ a: run.points[i]!, b, radius: run.width / 2 })));
/** Bare ground between two sets of paint, ribbon edge to ribbon edge. */
const clearance = (first: readonly Ribbon[], second: readonly Ribbon[]): number => {
  let nearest = Infinity;
  for (const p of first) for (const q of second) {
    nearest = Math.min(nearest, lineSeparation(p.a, p.b, q.a, q.b) - p.radius - q.radius);
  }
  return nearest;
};
const key = (run: SegmentMarking) => JSON.stringify(run);

test('every compact-trail letter, chevron and arrow is drawn through its authored corners', () => {
  // `shared/markingRibbon` places rows by arc length; replay it exactly. On
  // the round-2 build SAFE's S kept 4 of its 12 corners and an arrowhead lost
  // its tip (drawn as one bar: the '+' and '×' beside SAFE and TECH).
  let corners = 0;
  for (const host of placed) {
    for (const marking of host.spec.markings ?? []) {
      if (marking.role !== 'glyph' || marking.support !== 'compactTrail') continue;
      const rows: Point[] = [];
      for (const run of placedRuns(host, [marking])) {
        const points = run.points.map(point => ({ x: point.x, y: 0, z: point.z }));
        const lengths = arcLengths(points);
        for (const span of dashSpans(lengths.at(-1)!, run.dash, run.gap)) {
          const count = ribbonRows(span.to - span.from);
          for (let row = 0; row < count; row += 1) {
            const at = { x: 0, y: 0, z: 0 };
            sampleAt(points, lengths, span.from + (span.to - span.from) * row / (count - 1), at);
            rows.push(at);
          }
        }
      }
      for (const { s, t } of marking.path) {
        const centre = centrelineAt(host.entry, host.spec, s);
        const left = leftOf(headingAt(host.entry, host.spec, s));
        const corner = { x: centre.x + left.x * t, z: centre.z + left.z * t };
        const miss = Math.min(...rows.map(row => Math.hypot(row.x - corner.x, row.z - corner.z)));
        assert.ok(miss < 1e-6, `${host.spec.id}: an authored corner is painted ${miss.toFixed(3)} m away`);
        corners++;
      }
    }
  }
  assert.ok(corners >= 700, `${corners} corners checked`);
});

test('every turned glyph corner is closed by a bevel inside the stroke\'s round end', () => {
  // On the round-3 build each leg ended square, so an S, C or O showed a
  // wedge of bare ground at every outside corner (a chain of tiles up close).
  const turnOf = (path: SegmentMarking['path'], at: number) => {
    const inS = path[at]!.s - path[at - 1]!.s, inT = path[at]!.t - path[at - 1]!.t;
    const outS = path[at + 1]!.s - path[at]!.s, outT = path[at + 1]!.t - path[at]!.t;
    return Math.abs(Math.atan2(inS * outT - inT * outS, inS * outS + inT * outT));
  };
  /** A ribbon's two edge points at its first or last row, exactly as
   * `shared/markingRibbon.appendMarking` emits them (its tangent spans 0.35 m). */
  const rowEdges = (run: { points: readonly Point[]; width: number }, end: boolean): Point[] => {
    const points = run.points.map(point => ({ x: point.x, y: 0, z: point.z }));
    const lengths = arcLengths(points), total = lengths.at(-1)!, at = end ? total : 0;
    const [row, back, ahead] = [at, Math.max(0, at - 0.35), Math.min(total, at + 0.35)].map(distance => {
      const out = { x: 0, y: 0, z: 0 }; sampleAt(points, lengths, distance, out); return out;
    });
    const length = Math.hypot(ahead!.x - back!.x, ahead!.z - back!.z), half = run.width / 2;
    const left = { x: (ahead!.z - back!.z) / length * half, z: -(ahead!.x - back!.x) / length * half };
    return [{ x: row!.x + left.x, z: row!.z + left.z }, { x: row!.x - left.x, z: row!.z - left.z }];
  };
  let joins = 0;
  for (const host of placed) {
    for (const marking of host.spec.markings ?? []) {
      if (marking.role !== 'glyph' || marking.support !== 'compactTrail') continue;
      const runs = placedRuns(host, [marking]);
      const legs = runs.filter(run => run.join !== true);
      assert.equal(legs.length, marking.path.length - 1, `${host.spec.id}: a leg is missing`);
      for (let corner = 1; corner < marking.path.length - 1; corner += 1) {
        const turn = turnOf(marking.path, corner);
        const next = runs[runs.indexOf(legs[corner - 1]!) + 1]!;
        if (turn <= 0.1 || turn >= Math.PI - 0.1) {
          assert.notEqual(next.join, true, `${host.spec.id}: a ${(turn * 180 / Math.PI).toFixed(0)}° corner is bevelled`);
          continue;
        }
        assert.equal(next.join, true, `${host.spec.id}: a ${(turn * 180 / Math.PI).toFixed(0)}° corner is left open`);
        const [incoming, outgoing] = [legs[corner - 1]!, legs[corner]!];
        const centre = incoming.points.at(-1)!;
        const farEnd = rowEdges(next, true);
        // Inside the round end every clearance rule measures: no paint moves.
        for (const point of [...rowEdges(next, false), ...farEnd]) {
          assert.ok(Math.hypot(point.x - centre.x, point.z - centre.z) <= incoming.width / 2 + 1e-9,
            `${host.spec.id}: a bevel reaches past the stroke's round end`);
        }
        // Its far edge runs exactly between the two legs' edge ends: no wedge.
        const edgeEnds = [...rowEdges(incoming, true), ...rowEdges(outgoing, false)];
        for (const point of farEnd) {
          assert.ok(edgeEnds.some(end => Math.hypot(point.x - end.x, point.z - end.z) < 1e-9),
            `${host.spec.id}: a bevel misses a leg's edge`);
        }
        joins += 1;
      }
    }
  }
  assert.ok(joins >= 240, `${joins} bevels checked`);
});

test('DOWN and DROP keep their full M36 size and stroke, clear of the central cue', () => {
  // The round-2 build contracted both to 0.65 (a 2.26 m cap, 0.195 m stroke),
  // which the chase camera read as 'DΛWN'.
  const capAlong = SIGNS.glyphAcross / LETTER_ASPECT * SIGNS.glyphElongation;
  for (const word of ['DOWN', 'DROP'] as const) {
    const sign = SWITCHBACK_SIGNAGE.signs.find(each => each.words.includes(word))!;
    const segment = sign.copy?.segment ?? sign.segment;
    const from = sign.copy?.fromS ?? sign.fromS;
    const host = placed.find(each => each.spec.id === segment)!;
    const all = SWITCHBACK_SIGNAGE.markings.get(segment)!;
    const runs = all.filter(run => run.path.every(point => point.s >= from - 1e-9
      && point.s <= from + capAlong + 1e-9 && point.t > 0));
    assert.equal(runs.length, word === 'DOWN' ? 5 : 8, `${word} lost a stroke`);
    assert.ok(runs.every(run => run.glyphScale === undefined), `${word} is contracted`);
    assert.ok(placedRuns(host, runs).every(run => run.join === true || run.width === MARKINGS.glyphWidth),
      `${word} lost its stroke`);
    const along = runs.flatMap(run => run.path.map(point => point.s));
    assert.ok(Math.max(...along) - Math.min(...along) > capAlong - 1e-6, `${word} is shorter than its cap height`);
    const own = new Set(runs.map(key));
    const others = placed.flatMap(each => ribbons(each, (each.spec.markings ?? [])
      .filter(run => !(each.spec.id === segment && own.has(key(run))))));
    const nearest = clearance(ribbons(host, runs), others);
    assert.ok(nearest >= ROUTE_ADVANCE.paintGap, `${word} is ${nearest.toFixed(3)} m from other paint`);
    const cue = SWITCHBACK_ADVANCE_CUES.cues.find(each => each.segment === segment)!;
    const toCue = clearance(ribbons(host, runs), ribbons(host, cue.runs));
    assert.ok(toCue >= 0.5, `${word} is ${toCue.toFixed(3)} m from the TECH/SAFE cue`);
  }
});

test('every advance-cue arrow keeps bare ground from every letter of its own cue', () => {
  // The round-2 arrows sat 0.25 m past a cap with a 0.30 m stroke: -0.02 m.
  const arrowClear = 0.25;
  for (const cue of SWITCHBACK_ADVANCE_CUES.cues) {
    const host = placed.find(each => each.spec.id === cue.segment)!;
    const upper = cue.upperWord === 'AIR' ? 6 : 10;
    const arrows = [cue.runs[upper]!, cue.runs[upper + 1]!, ...cue.runs.slice(-2)];
    const letters = cue.runs.filter(run => !arrows.includes(run));
    assert.equal(letters.length, cue.runs.length - 4);
    const nearest = clearance(ribbons(host, arrows), ribbons(host, letters));
    assert.ok(nearest >= arrowClear, `${cue.features} arrow is ${nearest.toFixed(3)} m from a letter`);
    if (cue.upperWord === 'AIR') continue;
    // An across-trail head must open along the trail, the one axis that tells
    // a head from a tail from the chase camera: the round-3 head reached only
    // 0.154 m each side and read as a plain line (review, 2026-10-04).
    for (const head of [arrows[1]!, arrows[3]!]) {
      const [wing, tip, other] = head.path;
      const reach = Math.min(Math.abs(wing!.s - tip!.s), Math.abs(other!.s - tip!.s));
      assert.ok(reach >= 0.2, `${cue.features} arrowhead opens only ${reach.toFixed(3)} m along the trail`);
    }
  }
  assert.equal(ROUTE_ADVANCE.arrowClear, arrowClear);
});
